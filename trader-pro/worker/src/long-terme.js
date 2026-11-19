/* ═════════════ WORKER : SURVEILLANCE LONG TERME (cron) ═════════════
   Chaque exécution du cron (toutes les 5 minutes) recalcule un petit LOT d'entreprises du panier (les moins récemment calculées d'abord) : fondamentaux SEC EDGAR + prix Yahoo (gratuit, sans clé),
   moteur trader-pro/invest/valeur.js. Un petit lot respecte les limites du plan gratuit (50 sous-requêtes et peu de temps de calcul par exécution) : tout le panier est revu en moins d'une journée.
   Stockage : table kv de D1 (clés « lt:… », épargnées par « tout effacer » du portefeuille). Alertes : Telegram (si les secrets existent) + file d'événements lue par Rayle quand l'appli est ouverte.
   Routes (JSON) : GET /lt/index · GET /lt/fiche/<symbole> · GET /lt/evenements (publiques : données de marché) ; GET et PUT /lt/liste (liste de suivi : code d'accès). Secret SEC_USER_AGENT : nom + contact exigés par la SEC. */
import { univers } from '../../invest/univers.js';
import { calculerEntreprise } from '../../invest/calcul.js';
import { UA_DEFAUT } from '../../invest/sources.js';
import { detecterAlertes, phraseAlertes } from '../../invest/alertes.js';

export const LOT_DEFAUT = 3, MAX_EVENEMENTS = 60, SEUIL_QUALITE = 7, MAX_LISTE = 100;
const SYMBOLE = /^[A-Za-z0-9.\-]{1,12}$/;
export const KV = Object.freeze({ index: 'lt:index', fiche: tk => 'lt:f:' + tk, liste: 'lt:liste', evenements: 'lt:evenements', horizon: 'lt:v2:horizon', etatV2: 'lt:v2:etat', tV2: 'lt:v2:t' });
export const BASE_INVEST = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/invest/';
const repJ = (obj, code, h) => new Response(JSON.stringify(obj), { status: code || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(h || {}) } });

/* événements à signaler entre l'ancienne et la nouvelle ligne d'une entreprise */
export function evenementsDe(avant, apres, liste = []) {
  const out = [], suivie = liste.includes(apres.tk);
  if (!avant || avant.badge === apres.badge) return out;
  const q = apres.q != null && apres.q >= SEUIL_QUALITE;
  if (apres.badge === 'PAS CHÈRE' && q) out.push({ type: 'pas-chere', tk: apres.tk, nom: apres.nom, de: avant.badge, vers: apres.badge, mos: apres.mos, q: apres.q, prix: apres.prix, v: apres.v });
  if (suivie && !(out.length && out[0].type === 'pas-chere')) out.push({ type: 'liste', tk: apres.tk, nom: apres.nom, de: avant.badge, vers: apres.badge, mos: apres.mos, q: apres.q, prix: apres.prix, v: apres.v });
  else if (suivie) out[0].suivie = true;
  return out;
}
export const texteEvenement = e => (e.type === 'pas-chere' ? `📉 ${e.nom} (${e.tk}) passe PAS CHÈRE : prix ${e.prix}, valeur estimée ${e.v}, marge de sécurité ${Math.round((e.mos || 0) * 100)} %, qualité ${e.q}/10.` : `⭐ ${e.nom} (${e.tk}), dans ta liste de suivi : ${e.de} → ${e.vers} (prix ${e.prix}, valeur ${e.v === null ? '—' : e.v}, qualité ${e.q === null ? '—' : e.q}/10).`) + ' Estimation, pas un conseil.';

/* recalcule un lot ; renvoie { calculees: [tk], echecs: [tk], evenements: n } */
export async function lotLongTerme(env, depot, { fetchFn = fetch, maintenant = Date.now(), lot = null, liste = null } = {}) {
  const n = Math.max(1, Math.min(10, lot || +env.LT_LOT || LOT_DEFAUT)), ua = env.SEC_USER_AGENT || UA_DEFAUT;
  const index = (await depot.kvLire(KV.index)) || { version: 1, t: 0, lignes: [] }, parTk = new Map(index.lignes.map(l => [l.tk, l])), suivi = liste || (await depot.kvLire(KV.liste)) || [];
  /* les entreprises de la liste de suivi d'abord, puis les moins récemment calculées (jamais calculées en premier) ; les lignes plus récentes que 20 h attendent */
  const U = univers().filter(e => { const l = parTk.get(e.tk); return !l || maintenant - l.t > 20 * 3600e3; })
    .sort((a, b) => (suivi.includes(b.tk) - suivi.includes(a.tk)) || ((parTk.get(a.tk) || { t: 0 }).t - (parTk.get(b.tk) || { t: 0 }).t));
  const calculees = [], echecs = []; let evts = [];
  for (const e of U.slice(0, n)) {
    try {
      const r = await calculerEntreprise(e, { fetchFn, ua, maintenant }); const avant = parTk.get(e.tk);
      await depot.kvEcrire(KV.fiche(e.tk), r.fiche); parTk.set(e.tk, r.ligne); calculees.push(e.tk);
      /* un premier calcul n'est jamais une « arrivée » : seules comptent les ENTREPRISES DÉJÀ CONNUES dont le verdict change */
      evts = evts.concat(evenementsDe(avant, r.ligne, suivi));
    } catch (err) { echecs.push(e.tk); const avant = parTk.get(e.tk); parTk.set(e.tk, { ...(avant || { tk: e.tk, nom: e.nom, secteur: e.secteur, pays: e.pays, badge: 'N/D' }), t: maintenant - 19 * 3600e3, av: 'calcul impossible pour l’instant : ' + String(err && err.message || err).slice(0, 80) }); }   // ré-essai dans ~1 h
  }
  if (calculees.length || echecs.length) await depot.kvEcrire(KV.index, { version: 1, t: maintenant, n: parTk.size, lignes: [...parTk.values()].sort((a, b) => a.tk.localeCompare(b.tk)) });
  if (evts.length) {
    const E = ((await depot.kvLire(KV.evenements)) || []).concat(evts.map(e => ({ ...e, t: maintenant })));
    await depot.kvEcrire(KV.evenements, E.slice(-MAX_EVENEMENTS));
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) for (const e of evts) {
      try { await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texteEvenement(e) }) }); } catch (er) { /* l'événement reste dans la file lue par Rayle */ }
    }
  }
  return { calculees, echecs, evenements: evts.length };
}

/* routes /lt/… : renvoie une Response, ou null si la route n'est pas pour ce module */
export async function traiterLT(req, env, depot, { cors = {}, autoriser = null, fetchFn = fetch } = {}) {
  const url = new URL(req.url); if (!url.pathname.startsWith('/lt/')) return null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (url.pathname === '/lt/index' && req.method === 'GET') return repJ((await depot.kvLire(KV.index)) || { version: 1, t: 0, n: 0, lignes: [] }, 200, cors);
    const m = url.pathname.match(/^\/lt\/fiche\/([^/]+)$/);
    if (m && req.method === 'GET') { const tk = decodeURIComponent(m[1]).toUpperCase(); if (!SYMBOLE.test(tk)) return repJ({ error: 'symbole invalide' }, 400, cors); const f = await depot.kvLire(KV.fiche(tk)); return f ? repJ(f, 200, cors) : repJ({ error: 'fiche absente (pas encore calculée)' }, 404, cors); }
    if (url.pathname === '/lt/evenements' && req.method === 'GET') return repJ({ evenements: (await depot.kvLire(KV.evenements)) || [] }, 200, cors);
    if (url.pathname === '/lt/liste') {
      const a = autoriser ? await autoriser(req, env, fetchFn) : { ok: false, code: 503, raison: 'accès non configuré' }; if (!a.ok) return repJ({ error: a.raison }, a.code, cors);
      if (req.method === 'GET') return repJ({ liste: (await depot.kvLire(KV.liste)) || [], horizon: (await depot.kvLire(KV.horizon)) || 'moyen' }, 200, cors);
      if (req.method === 'PUT') { const t = await req.text(); if (t.length > 20000) return repJ({ error: 'corps trop gros' }, 413, cors); let b; try { b = JSON.parse(t); } catch (e) { return repJ({ error: 'JSON illisible' }, 400, cors); }
        const L = [...new Set((Array.isArray(b.liste) ? b.liste : []).map(x => String(x).trim()).map(x => (/[A-Z]/.test(x) ? x : x.toUpperCase())).filter(x => SYMBOLE.test(x)))].slice(0, MAX_LISTE); await depot.kvEcrire(KV.liste, L); if (['tactique', 'swing', 'moyen', 'long'].includes(b.horizon)) await depot.kvEcrire(KV.horizon, b.horizon); return repJ({ liste: L, horizon: (await depot.kvLire(KV.horizon)) || 'moyen' }, 200, cors); }
    }
    return repJ({ error: 'route inconnue' }, 404, cors);
  } catch (e) { return repJ({ error: String(e && e.message || e).slice(0, 200) }, 500, cors); }
}

/* ═════════════ ALERTES « MA LISTE » DE L'INVESTISSEMENT V2 (cron toutes les 5 minutes, mais ne travaille que quand une NOUVELLE publication nocturne existe) ═════════════
   Le calcul lourd est fait par GitHub Actions (outils-donnees/invest/calcul-v2.mjs). Ici : lecture du manifeste (très petit) ; s'il est plus récent que la dernière lecture, on charge seulement les pages « lite » (une par première lettre des symboles de la liste),
   on recalcule les verdicts de la liste (modele.js) et on envoie par Telegram : passage en Attractif / Très attractif sur l'horizon choisi, prix sur la MA200 Daily ou contre un support majeur Daily.
   (La fenêtre saisonnière favorable est annoncée par l'application ouverte : elle demande 20 ans d'historique mensuel.) Aucune alerte n'est un ordre. */
export async function alertesInvest(env, depot, { fetchFn = fetch, maintenant = Date.now(), base = BASE_INVEST } = {}) {
  const liste = (await depot.kvLire(KV.liste)) || []; if (!liste.length) return { alertes: 0, raison: 'liste vide' };
  const get = async p => { const r = await fetchFn(base + p, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(p + ' : ' + r.status); return r.json(); };
  const man = await get('manifest.json'), deja = (await depot.kvLire(KV.tV2)) || 0; if (!(man.t > deja)) return { alertes: 0, raison: 'pas de nouvelle publication' };
  const pages = [...new Set(liste.map(id => (/^[A-Z]/.test(id) ? id[0] : '0')))], lignes = []; for (const k of pages) { try { lignes.push(...(await get('lite/' + k + '.json')).lignes); } catch (e) { /* page absente : ses instruments sont ignorés cette fois */ } }
  const horizon = (await depot.kvLire(KV.horizon)) || env.LT_HORIZON || 'moyen', prec = (await depot.kvLire(KV.etatV2)) || {}, r = detecterAlertes(liste, lignes, prec, { horizon, ajust: man.ajust || {}, maintenant });
  await depot.kvEcrire(KV.etatV2, r.etat); await depot.kvEcrire(KV.tV2, man.t);
  if (r.alertes.length && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) for (const a of r.alertes) { try { await fetchFn('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: (a.type === 'attractif' ? '📈 ' : '🎯 ') + a.texte + ' Ce n’est pas un conseil.' }) }); } catch (e) { /* l'application l'annoncera à l'ouverture */ } }
  return { alertes: r.alertes.length, horizon };
}
