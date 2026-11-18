/* ═════════════ WORKER PORTEFEUILLE : logique pure (testée avec un vrai SQLite) ═════════════
   Routes (JSON, toutes sauf /sante exigent le code d'accès) :
     GET  /sante                      → { ok, service, version }
     GET  /donnees?depuis=<rev>       → { rev, fermees[], tresorerie[], ouvertes[], reglages, alertes[], rapport }   (fermees et tresorerie : seulement les lignes plus récentes que `depuis`)
     POST /importer                   → { fermees[], tresorerie[], ouvertes[] } ; écrit les lignes reçues (upsert par identifiant) et remplace les positions ouvertes → { rev, ecrites }
     GET  /alertes ; PUT  /reglages | /alertes | /rapport
     GET  /sauvegarde                 → export complet ;  POST /restaurer → remplace tout ;  DELETE /tout?confirmation=OUI → efface tout
   Accès : si le secret PORTEFEUILLE_CODE existe, l'en-tête X-Portefeuille-Code doit lui être égal (comparaison à temps constant). Sinon, le jeton Rayle (X-Rayle-Token) doit être accepté par le Worker principal
   ET le Worker principal doit refuser un faux jeton (sinon son verrou est absent et ce Worker refuse tout). Jamais de secret dans le code ni dans le dépôt. */
export const VERSION = '2026.11.15.1', LIMITE_CORPS = 3.5e6;
const NOMBRES_F = ['volume', 'prixOuv', 'tOuv', 'prixFerm', 'tFerm', 'pnl', 'brut', 'commission', 'swap', 'rollover', 'marge', 'sl', 'tp'], TEXTES_F = ['instrument', 'ticker', 'categorie', 'sens', 'origine', 'commentaire'];
const NOMBRES_T = ['t', 'montant'], TEXTES_T = ['type', 'idPosition', 'ticker'];
const NOMBRES_O = ['volume', 'valeur', 'prixCourant', 'prixOuv', 'tOuv', 'sl', 'tp', 'pnl', 'brut', 'marge', 'swap'], TEXTES_O = ['ticker', 'sens'];
const nb = v => (typeof v === 'number' && Number.isFinite(v) ? v : null), tx = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : null);
function nettoyer(L, nombres, textes, max, avecId = true) {
  if (!Array.isArray(L)) return []; const out = [];
  for (const x of L.slice(0, max)) { if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[A-Za-z0-9:._-]{1,40}$/.test(x.id)) continue; const o = { id: x.id }; for (const k of nombres) o[k] = nb(x[k]); for (const k of textes) o[k] = tx(x[k], k === 'commentaire' ? 60 : 80); out.push(o); }
  return out;
}
export const nettoyerFermees = L => nettoyer(L, NOMBRES_F, TEXTES_F, 20000).filter(x => x.tOuv != null && x.tFerm != null && x.pnl != null && (x.sens === 'BUY' || x.sens === 'SELL'));
export const nettoyerTresorerie = L => nettoyer(L, NOMBRES_T, TEXTES_T, 30000).filter(x => x.t != null && x.montant != null && x.type);
export const nettoyerOuvertes = L => nettoyer(L, NOMBRES_O, TEXTES_O, 200);
const REGLAGES = { capital: [0, 1e9], risquePct: [0, 100], devise: null, valeursPoint: 'objet', xtbNoms: 'objet', telegram: 'bool' };
export function nettoyerReglages(r) {
  const o = {}; if (!r || typeof r !== 'object') return o;
  if (nb(r.capital) != null && r.capital >= 0 && r.capital <= 1e9) o.capital = r.capital; if (nb(r.soldeInitial) != null && r.soldeInitial >= 0 && r.soldeInitial <= 1e9) o.soldeInitial = r.soldeInitial; if (nb(r.risquePct) != null && r.risquePct > 0 && r.risquePct <= 100) o.risquePct = r.risquePct;
  if (typeof r.devise === 'string' && /^[A-Z]{3}$/.test(r.devise)) o.devise = r.devise; if (typeof r.telegram === 'boolean') o.telegram = r.telegram;
  for (const k of ['valeursPoint', 'xtbNoms']) if (r[k] && typeof r[k] === 'object' && !Array.isArray(r[k])) { const m = {}; for (const [c, v] of Object.entries(r[k]).slice(0, 60)) if (/^[A-Za-z0-9._-]{1,20}$/.test(c) && (nb(v) != null || (typeof v === 'string' && v.length <= 30))) m[c] = v; o[k] = m; }
  return o;
}
export function nettoyerAlertes(L) { if (!Array.isArray(L)) return []; return L.slice(0, 60).filter(a => a && typeof a.id === 'string' && /^[A-Za-z0-9]{1,24}$/.test(a.id) && /^[A-Za-z0-9]{2,12}$/.test(a.actif || '') && (a.sens === 'dessus' || a.sens === 'dessous') && nb(a.niveau) > 0).map(a => ({ id: a.id, actif: a.actif, sens: a.sens, niveau: a.niveau, creeLe: nb(a.creeLe), declenchee: nb(a.declenchee), prixDeclenchement: nb(a.prixDeclenchement), envoyee: !!a.envoyee })); }

/* ───── accès ───── */
export function egalTempsConstant(a, b) { a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length; const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
const cacheJetons = new Map();   // empreinte (début du jeton haché) → expiration
export const viderCacheJetons = () => cacheJetons.clear();
async function empreinte(t) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function autoriser(req, env, fetchFn = fetch) {
  const code = env.PORTEFEUILLE_CODE;
  if (code) { const donne = req.headers.get('X-Portefeuille-Code') || ''; return donne.length >= 6 && egalTempsConstant(donne, code) ? { ok: true } : { ok: false, code: 401, raison: 'code refusé' }; }
  const jeton = req.headers.get('X-Rayle-Token') || ''; if (jeton.length < 8) return { ok: false, code: 401, raison: 'code manquant : saisir le code d’accès dans la fenêtre Portefeuille (réglages)' };
  const k = await empreinte(jeton), c = cacheJetons.get(k); if (c && c > Date.now()) return { ok: true };
  const principal = String(env.WORKER_RAYLE || '').replace(/\/+$/, ''); if (!principal) return { ok: false, code: 503, raison: 'Worker principal non configuré : définir le secret PORTEFEUILLE_CODE' };
  try {
    const bon = await fetchFn(principal + '/ping', { headers: { 'X-Rayle-Token': jeton } }); if (!bon.ok) return { ok: false, code: 401, raison: 'jeton refusé' };
    const faux = await fetchFn(principal + '/ping', { headers: { 'X-Rayle-Token': 'faux-' + k + '-sonde' } });
    if (faux.ok) return { ok: false, code: 503, raison: 'le verrou du Worker principal est absent (un faux jeton est accepté) : définir le secret PORTEFEUILLE_CODE sur ce Worker' };
    cacheJetons.set(k, Date.now() + 10 * 60e3); return { ok: true };
  } catch (e) { return { ok: false, code: 503, raison: 'Worker principal injoignable' }; }
}
const limites = new Map();   // anti force brute : échecs par origine IP et par fenêtre de 10 minutes (au mieux : par instance)
export function tropDEchecs(ip, maintenant = Date.now(), ajouter = false) { const f = Math.floor(maintenant / 600e3), k = ip + ':' + f; const n = (limites.get(k) || 0) + (ajouter ? 1 : 0); if (ajouter) limites.set(k, n); if (limites.size > 500) for (const c of limites.keys()) if (!c.endsWith(':' + f)) limites.delete(c); return n >= 15; }

/* ───── routage ───── */
export const entetesCors = (req, env) => { const o = req.headers.get('Origin') || '', ok = String(env.ORIGINES || '').split(',').map(s => s.trim()).filter(Boolean).includes(o); return { 'Access-Control-Allow-Origin': ok ? o : 'null', 'Access-Control-Allow-Headers': 'X-Portefeuille-Code, X-Rayle-Token, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Max-Age': '600', Vary: 'Origin' }; };
const rep = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });
async function corps(req) { const t = await req.text(); if (t.length > LIMITE_CORPS) throw Object.assign(new Error('corps trop gros'), { code: 413 }); try { return JSON.parse(t); } catch (e) { throw Object.assign(new Error('JSON illisible'), { code: 400 }); } }

export async function traiter(req, env, depot, { fetchFn = fetch } = {}) {
  const url = new URL(req.url), h = entetesCors(req, env), ip = req.headers.get('CF-Connecting-IP') || 'inconnue';
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (url.pathname === '/sante') return rep({ ok: true, service: 'rayle-portefeuille', version: VERSION, verrou: env.PORTEFEUILLE_CODE ? 'code propre' : 'jeton Rayle' }, 200, h);
  if (tropDEchecs(ip)) return rep({ error: 'trop d’échecs : réessayer dans quelques minutes' }, 429, h);
  const a = await autoriser(req, env, fetchFn); if (!a.ok) { tropDEchecs(ip, Date.now(), true); return rep({ error: a.raison }, a.code, h); }
  try {
    if (url.pathname === '/donnees' && req.method === 'GET') {
      const depuis = Math.max(0, parseInt(url.searchParams.get('depuis') || '0', 10) || 0), rev = await depot.revision();
      return rep({ rev, depuis, fermees: await depot.lireDepuis('fermees', depuis), tresorerie: await depot.lireDepuis('tresorerie', depuis), ouvertes: (await depot.kvLire('ouvertes')) || { t: null, positions: [], resume: {} }, reglages: (await depot.kvLire('reglages')) || {}, alertes: (await depot.kvLire('alertes')) || [], rapport: (await depot.kvLire('rapport')) || null,
        total: { fermees: await depot.compter('fermees'), tresorerie: await depot.compter('tresorerie') } }, 200, h);
    }
    if (url.pathname === '/importer' && req.method === 'POST') {
      const b = await corps(req), F = nettoyerFermees(b.fermees), T = nettoyerTresorerie(b.tresorerie), O = nettoyerOuvertes(b.ouvertes);
      const rev = await depot.prochaineRevision(), nF = F.length ? await depot.ecrireLignes('fermees', F, rev) : 0, nT = T.length ? await depot.ecrireLignes('tresorerie', T, rev) : 0;
      if (Array.isArray(b.ouvertes)) await depot.kvEcrire('ouvertes', { t: Date.now(), positions: O, resume: { valeur: nb(b.resume && b.resume.valeur), profit: nb(b.resume && b.resume.profit), devise: tx(b.resume && b.resume.devise, 3) } });
      return rep({ rev, ecrites: { fermees: nF, tresorerie: nT, ouvertes: O.length } }, 200, h);
    }
    if (url.pathname === '/reglages' && req.method === 'PUT') { const r = nettoyerReglages(await corps(req)), ancien = (await depot.kvLire('reglages')) || {}, nouveau = { ...ancien, ...r }; await depot.kvEcrire('reglages', nouveau); return rep({ reglages: nouveau }, 200, h); }
    if (url.pathname === '/alertes' && req.method === 'GET') return rep({ alertes: (await depot.kvLire('alertes')) || [] }, 200, h);
    if (url.pathname === '/alertes' && req.method === 'PUT') { const b = await corps(req), A = nettoyerAlertes(b.alertes); await depot.kvEcrire('alertes', A); return rep({ alertes: A }, 200, h); }
    if (url.pathname === '/rapport' && req.method === 'PUT') { const b = await corps(req); const r = { t: Date.now(), texte: tx(b.texte, 6000), note: nb(b.note), sections: b.sections && typeof b.sections === 'object' && JSON.stringify(b.sections).length <= 12000 ? b.sections : null, ia: !!b.ia }; await depot.kvEcrire('rapport', r); return rep({ rapport: r }, 200, h); }
    if (url.pathname === '/sauvegarde' && req.method === 'GET') return rep({ version: VERSION, t: Date.now(), rev: await depot.revision(), fermees: await depot.lireDepuis('fermees', 0), tresorerie: await depot.lireDepuis('tresorerie', 0), ouvertes: await depot.kvLire('ouvertes'), reglages: await depot.kvLire('reglages'), alertes: await depot.kvLire('alertes'), rapport: await depot.kvLire('rapport') }, 200, h);
    if (url.pathname === '/restaurer' && req.method === 'POST') {
      const b = await corps(req), F = nettoyerFermees(b.fermees), T = nettoyerTresorerie(b.tresorerie); if (!F.length && !T.length) return rep({ error: 'sauvegarde vide : rien n’est restauré' }, 400, h);
      await depot.toutEffacer(); const rev = await depot.prochaineRevision(); if (F.length) await depot.ecrireLignes('fermees', F, rev); if (T.length) await depot.ecrireLignes('tresorerie', T, rev);
      if (b.ouvertes) await depot.kvEcrire('ouvertes', { t: nb(b.ouvertes.t), positions: nettoyerOuvertes(b.ouvertes.positions), resume: b.ouvertes.resume || {} }); if (b.reglages) await depot.kvEcrire('reglages', nettoyerReglages(b.reglages)); if (b.alertes) await depot.kvEcrire('alertes', nettoyerAlertes(b.alertes));
      return rep({ rev, restaurees: { fermees: F.length, tresorerie: T.length } }, 200, h);
    }
    if (url.pathname === '/tout' && req.method === 'DELETE') { if (url.searchParams.get('confirmation') !== 'OUI') return rep({ error: 'confirmation=OUI requise' }, 400, h); await depot.toutEffacer(); return rep({ efface: true }, 200, h); }
    return rep({ error: 'route inconnue' }, 404, h);
  } catch (e) { return rep({ error: String(e && e.message || e).slice(0, 200) }, Number.isInteger(e && e.code) ? e.code : 500, h); }
}
