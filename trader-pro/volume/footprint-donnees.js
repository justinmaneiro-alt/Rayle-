/* ═════════════ FOOTPRINT : DONNÉES (v4.1) — archives de la branche « footprint » (CDN GitHub, rien par le Worker) + direct ═════════════
   · Archives : index.json (petit) puis, à la demande, UN fichier gzip par (actif, unité, taille de case, mois), seulement pour les mois visibles. Cache mémoire + Cache API du navigateur.
   · Jour en cours : le flux de transactions Binance reçu en direct (côté de l'agresseur), plus un rattrapage REST de l'heure en cours. Ce qui précède l'ouverture reste « partiel » et le dit.
   · Honnêteté : chaque bougie dit POURQUOI elle n'a pas d'empreinte (actif sans transactions gratuites, avant le début de l'archive, jour manquant) via `etatBougie`. */
import { fusionnerCases } from './footprint-calcul.js';

export const BASE_FOOTPRINT = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/footprint/';
const H = 3600e3, J = 86400e3, PAS = { H1: H, H4: 4 * H, J };
export const nomTaille = x => String(+Number(x).toPrecision(8));
export const jourDe = t => new Date(t).toISOString().slice(0, 10);
export const moisDe = t => new Date(t).toISOString().slice(0, 7);
export const TEXTE_ABSENT = 'pas d’empreinte disponible pour cette période ou cet actif';

/* décompression gzip du navigateur (DecompressionStream) ; Node : zlib (tests) */
export async function gunzipJson(buf) {
  if (typeof DecompressionStream !== 'undefined') { const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')); return JSON.parse(await new Response(s).text()); }
  const z = await import('node:zlib'); return JSON.parse(z.gunzipSync(Buffer.from(buf)).toString('utf8'));
}

export function creerStoreFootprint({ base = BASE_FOOTPRINT, fetchFn = (...a) => fetch(...a), surChange = () => {} } = {}) {
  let index = null, indexPromesse = null, indexErreur = null; const mois = new Map(), enCours = new Map(), erreurs = new Map();
  const lire = async url => { const r = await fetchFn(url); if (r.status === 404) return null; if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`); return r; };
  function chargerIndex() {
    if (index) return Promise.resolve(index); if (indexPromesse) return indexPromesse;
    indexPromesse = (async () => { try { const r = await lire(base + 'index.json?v=' + Math.floor(Date.now() / 600000)); index = r ? await r.json() : { actifs: {} }; indexErreur = null; } catch (e) { indexErreur = String(e && e.message || e); index = null; } finally { indexPromesse = null; } surChange(); return index; })();
    return indexPromesse;
  }
  const info = id => (index && index.actifs && index.actifs[id]) || null;
  const cle = (a, u, t, m) => `${a}|${u}|${nomTaille(t)}|${m}`;
  /* démarre (une seule fois) le chargement d'un mois ; renvoie la table déjà chargée ou null */
  function mois_(a, u, t, m) {
    const k = cle(a, u, t, m); if (mois.has(k)) return mois.get(k); if (enCours.has(k) || erreurs.has(k)) return null;
    enCours.set(k, (async () => {
      try {
        const r = await lire(`${base}${a}/${u}/${nomTaille(t)}/${m}.json.gz?v=${Math.floor(Date.now() / 3600000)}`); if (!r) { mois.set(k, new Map()); return; }
        const d = await gunzipJson(await r.arrayBuffer()); mois.set(k, new Map(d.b.map(([ts, cases]) => [ts * 1000, cases])));
      } catch (e) { erreurs.set(k, String(e && e.message || e)); setTimeout(() => erreurs.delete(k), 60000); }
      finally { enCours.delete(k); surChange(); }
    })()); return null;
  }
  return {
    chargerIndex, info, erreurIndex: () => indexErreur, indexPret: () => !!index,
    /* demande les mois couvrant [t0, t1] (ms) pour une taille ; renvoie vrai si tout est déjà là */
    assurer(a, u, taille, t0, t1) { const I = info(a); if (!I) return false; let pret = true; const dispo = new Set((I.mois && I.mois[u]) || []); for (let t = Date.UTC(new Date(t0).getUTCFullYear(), new Date(t0).getUTCMonth(), 1); t <= t1; t = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)) { const m = moisDe(t); if (!dispo.has(m)) continue; if (mois_(a, u, taille, m) === null) pret = false; } return pret; },
    cases(a, u, taille, t) { const T = mois.get(cle(a, u, taille, moisDe(t))); return T ? T.get(t) || null : null; },
    chargement: () => enCours.size, erreurs: () => [...erreurs.values()],
    /* raison de l'absence d'empreinte pour la bougie qui ouvre à t : null = disponible dans l'archive (ou à vérifier) */
    etatBougie(a, u, t) {
      const I = info(a); if (!I) return index ? { code: 'actif', texte: TEXTE_ABSENT } : { code: 'index', texte: indexErreur ? 'archive injoignable : ' + indexErreur : 'archive en chargement…' };
      const fin = t + PAS[u]; if (fin <= Date.parse(I.debut + 'T00:00:00Z')) return { code: 'avant', texte: `${TEXTE_ABSENT} (archive depuis le ${I.debut})` };
      if (t >= Date.parse(I.dernier + 'T00:00:00Z') + J) return { code: 'direct', texte: 'jour en cours : empreinte en direct' };
      if (t < Date.parse(I.debut + 'T00:00:00Z')) return { code: 'partielle-debut', texte: 'bougie à cheval sur le début de l’archive : empreinte partielle' };
      return { code: 'archive', texte: null };
    },
    fermer() { mois.clear(); }
  };
}

/* ───── direct : transactions reçues (flux aggTrade) regroupées par heure et par case fine ─────
   Une heure est COMPLÈTE si l'écoute a commencé avant elle (toutes ses transactions sont passées par le flux) ou si elle a été rattrapée en entier par l'API publique (ci-dessous).
   Une bougie H1 / H4 / Daily est complète si toutes ses heures déjà écoulées le sont : sinon « empreinte partielle », dit à l'écran. */
export function creerLive(fin) {
  const heures = new Map(), completes = new Set(); let depuis = null, premierId = null;
  const ajouter = (t, prix, qte, vendeur) => { const h = Math.floor(t / H) * H; let m = heures.get(h); if (!m) { m = new Map(); heures.set(h, m); if (heures.size > 96) heures.delete(heures.keys().next().value); } const i = Math.floor(prix / fin + 1e-9); let e = m.get(i); if (!e) { e = [i, 0, 0, 0]; m.set(i, e); } e[vendeur ? 1 : 2] += qte; e[3]++; };
  const heureComplete = h => depuis != null && (h > Math.floor(depuis / H) * H || completes.has(h)) || completes.has(h);
  return {
    fin,
    /* transaction du flux : t (ms), prix, quantité, côté de l'agresseur ('achat' | 'vente'), id agrégé éventuel */
    ajouterTrade(m) { if (depuis == null) { depuis = m.t; premierId = Number.isFinite(m.id) ? m.id : null; } ajouter(m.t, m.prix, m.qte, m.cote === 'vente'); },
    ajouterRattrapage: ajouter, marquerComplete: h => completes.add(h), heureComplete,
    depuis: () => depuis, premierId: () => premierId,
    casesBougie(unite, t) { const pas = PAS[unite], L = []; for (let h = t; h < t + pas; h += H) { const m = heures.get(h); if (m) L.push([...m.values()]); } return L.length ? fusionnerCases(L) : null; },
    /* vrai si une heure déjà commencée de la bougie n'est pas complète */
    partielle(unite, t, maintenant = Date.now()) { if (depuis == null) return true; const pas = PAS[unite]; for (let h = t; h < Math.min(t + pas, maintenant + 1); h += H) if (!heureComplete(h)) return true; return false; },
    /* heures (ms) d'une bougie encore à rattraper */
    heuresAFaire(unite, t, maintenant = Date.now()) { const pas = PAS[unite], L = []; for (let h = t; h < Math.min(t + pas, maintenant + 1); h += H) if (depuis != null && !heureComplete(h)) L.push(h); return L; },
    nHeures: () => heures.size, nCompletes: () => completes.size, effacer() { heures.clear(); completes.clear(); depuis = null; premierId = null; }
  };
}

/* rattrapage REST d'UNE heure (transactions passées avant l'ouverture de l'appli), jusqu'à la première transaction du flux. Fenêtres d'au plus une heure (règle de l'API), pages de 1 000, dédoublonnage par identifiant.
   Retourne { complet, pages } ; erreur 429 / 418 : lève une exception (l'appelant arrête tout rattrapage : le débit public est limité). */
export async function rattraperHeure(live, symbole, h, { fetchFn = (...a) => fetch(...a), pagesMax = 60, pause = 0, base = 'https://fapi.binance.com' } = {}) {
  const fin = Math.min(h + H, live.depuis() != null ? live.depuis() : h + H) - 1; let debut = h, dernierId = -1, pages = 0;
  if (fin < h) { live.marquerComplete(h); return { complet: true, pages: 0 }; }
  while (pages < pagesMax) {
    const r = await fetchFn(`${base}/fapi/v1/aggTrades?symbol=${symbole}&startTime=${debut}&endTime=${fin}&limit=1000`); if (!r.ok) throw Object.assign(new Error('Binance aggTrades a répondu ' + r.status), { status: r.status });
    const L = await r.json(); pages++; if (!Array.isArray(L)) throw new Error('réponse inattendue'); let neuves = 0;
    for (const x of L) { if (x.a <= dernierId) continue; dernierId = x.a; live.ajouterRattrapage(x.T, +x.p, +x.q, !!x.m); neuves++; debut = x.T; }
    if (L.length < 1000 || !neuves) { live.marquerComplete(h); return { complet: true, pages }; }
    if (pause) await new Promise(res => setTimeout(res, pause));
  }
  return { complet: false, pages };
}
/* file de rattrapage : heures les plus récentes d'abord, une requête à la fois, au plus ~85 par minute (limite publique 2 400 de poids par minute, 20 par requête d'aggTrades), plafond de pages par session */
export function creerRattrapage(live, symbole, { fetchFn, pause = 700, pagesTotal = 400, surChange = () => {} } = {}) {
  const file = [], etat = { enCours: false, pages: 0, faites: 0, erreur: null, arrete: false };
  async function boucle() {
    if (etat.enCours) return; etat.enCours = true;
    try {
      while (file.length && !etat.arrete && etat.pages < pagesTotal) {
        const h = file.shift(); if (live.heureComplete(h)) continue;
        const r = await rattraperHeure(live, symbole, h, { fetchFn, pause, pagesMax: Math.min(60, pagesTotal - etat.pages) }); etat.pages += r.pages; if (r.complet) etat.faites++; surChange();
      }
    } catch (e) { etat.erreur = String(e && e.message || e); if (e && (e.status === 429 || e.status === 418)) etat.arrete = true; }
    finally { etat.enCours = false; surChange(); }
  }
  return { etat, demander(heures) { const vus = new Set(file); for (const h of [...heures].sort((a, b) => b - a)) if (!vus.has(h) && !live.heureComplete(h)) { file.push(h); vus.add(h); } if (file.length) { file.sort((a, b) => b - a); boucle(); } }, fileLongueur: () => file.length, arreter() { etat.arrete = true; file.length = 0; } };
}
