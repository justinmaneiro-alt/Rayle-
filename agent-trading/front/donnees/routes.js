/* ═════════════ ROUTES DU PC → COUCHE DE DONNÉES (aucune dépendance au PC) ═════════════
   Les pages du terminal demandaient « /__cot », « /__actus », « /__bougies »… au serveur du PC. Ici chaque route est servie par :
     1. le PC, seulement si la page est servie par lui (bonus, jamais obligatoire) ;
     2. une lecture directe quand la source autorise le navigateur (bougies Bitcoin et Solana : Kraken) ;
     3. le snapshot publié par le robot (branche « donnees ») ;
     4. la dernière copie gardée sur l'appareil, avec son horodatage. */
import { lireDonnee, originePc, urlSnapshot, creerStockageParDefaut } from './couche.js';

const H = 3600e3;
/* nom du fichier snapshot d'une route, durée de validité du cache local (au-delà : on revalide) */
export function planRoute(chemin) {
  const u = new URL(chemin, 'http://x'), p = u.searchParams, r = u.pathname;
  if (r === '/__cot') { const k = String(p.get('inst') || 'OR').toUpperCase().replace(/[^A-Z0-9]/g, ''); return { cle: 'cot|' + k, fichier: `cot-${k}.json`, ttl: 3 * H, apres: d => reduireSerie(d, +p.get('n') || 160) }; }
  if (r === '/__actus') { const q = String(p.get('q') || 'marches').replace(/[^a-z]/g, ''); return { cle: 'actus|' + q, fichier: `actus-${q}.json`, ttl: 10 * 60e3, apres: d => reduireItems(d, +p.get('n') || 40) }; }
  if (r === '/__banques') return { cle: 'banques', fichier: 'banques.json', ttl: 30 * 60e3 };
  if (r === '/__institutions') return { cle: 'institutions', fichier: 'institutions.json', ttl: 30 * 60e3 };
  if (r === '/__sante') return { cle: 'sante', fichier: 'sante.json', ttl: 30 * 60e3 };
  if (r === '/__gld') return { cle: 'gld', fichier: 'gld.json', ttl: 6 * H };
  if (r === '/__calendrier2') return { cle: 'calendrier2', fichier: 'calendrier2.json', ttl: 30 * 60e3 };
  if (r === '/__yahoo') { const rg = String(p.get('range') || '2y').replace(/[^a-z0-9]/gi, ''); return { cle: 'yahoo|' + rg, fichier: `yahoo-${rg}.json`, ttl: 10 * 60e3, apres: d => filtrerCotes(d, p.get('syms')) }; }
  return null;
}
export const reduireSerie = (d, n) => (d && Array.isArray(d.serie) && d.serie.length > n ? { ...d, serie: d.serie.slice(-n) } : d);
export const reduireItems = (d, n) => (d && Array.isArray(d.items) && d.items.length > n ? { ...d, items: d.items.slice(0, n) } : d);
export function filtrerCotes(d, syms) { if (!d || !d.cotes || !syms) return d; const L = String(syms).split(',').filter(Boolean); return { ...d, cotes: Object.fromEntries(Object.entries(d.cotes).filter(([k]) => L.includes(k))) }; }

/* une route /__xxx : même réponse que le serveur du PC, plus { _origine } pour l'affichage du badge */
export async function lireRoute(chemin, { fetchFn = (...a) => fetch(...a), loc = globalThis.location, stockage = null, maintenant = () => Date.now() } = {}) {
  const plan = planRoute(chemin); if (!plan) throw new Error('route inconnue : ' + chemin.split('?')[0]);
  const o = originePc(loc), sources = [];
  if (o) sources.push({ niveau: 'pc', nom: 'serveur du PC', url: o + chemin, ms: 8000 });
  sources.push({ niveau: 'snapshot', nom: 'snapshot ' + plan.fichier, url: urlSnapshot(plan.fichier), ms: 15000 });
  const res = await lireDonnee(plan.cle, { sources, ttl: plan.ttl, stockage: stockage || creerStockageParDefaut(), fetchFn, maintenant, valider: d => (d && typeof d === 'object' && !Array.isArray(d)) || Array.isArray(d) ? true : 'réponse vide' });
  const donnees = plan.apres ? plan.apres(res.donnees) : res.donnees;
  return { ...res, donnees };
}

/* ───── bougies (Yahoo par le PC ; sinon snapshot ; Bitcoin et Solana aussi en direct par Kraken) ───── */
const KRAKEN_PAIRES = { 'BTC-USD': 'XBTUSD', 'SOL-USD': 'SOLUSD', 'ETH-USD': 'ETHUSD', 'DOGE-USD': 'DOGEUSD' };
const KRAKEN_MIN = { '5m': 5, '15m': 15, '1h': 60, '1d': 1440 };
export const nomFichierBougies = (sym, intervalle) => `bougies-${String(sym).replace(/[^A-Za-z0-9]/g, '_')}-${intervalle}.json`;
export const expanserBougies = d => (d && Array.isArray(d.b) ? { ...d, bougies: d.b.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })), b: undefined } : d);
export const compacterBougies = d => ({ ...d, bougies: undefined, b: (d.bougies || []).map(x => [x.t, x.o, x.h, x.l, x.c, x.v]) });
export function fusionnerBougies(base, neuves) {
  const m = new Map(); for (const b of base || []) m.set(b.t, b); for (const b of neuves || []) m.set(b.t, b);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
export async function krakenSpot(sym, intervalle, { fetchFn = (...a) => fetch(...a) } = {}) {
  const paire = KRAKEN_PAIRES[sym], iv = KRAKEN_MIN[intervalle]; if (!paire || !iv) throw new Error('pas de lecture directe pour ' + sym);
  const r = await fetchFn(`https://api.kraken.com/0/public/OHLC?pair=${paire}&interval=${iv}`, { cache: 'no-cache', signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('api.kraken.com a répondu ' + r.status);
  const d = await r.json(); if (d.error && d.error.length) throw new Error(String(d.error[0]));
  const cle = Object.keys(d.result || {}).find(k => k !== 'last'); const L = (d.result && d.result[cle]) || [];
  const bougies = L.map(x => ({ t: x[0] * 1000, o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[6] })).filter(b => b.c > 0);
  const der = L.length ? L[L.length - 1] : null;
  return { bougies, prix: der ? +der[4] : null, tPrix: Date.now() };
}
export async function lireBougies(sym, intervalle, { ttl = null, range = null, fetchFn = (...a) => fetch(...a), loc = globalThis.location, stockage = null, maintenant = () => Date.now() } = {}) {
  const o = originePc(loc), sources = [];
  if (o) sources.push({ niveau: 'pc', nom: 'serveur du PC (Yahoo)', ms: 20000, url: `${o}/__bougies?sym=${encodeURIComponent(sym)}&interval=${intervalle}${range ? '&range=' + range : ''}` });
  sources.push({ niveau: KRAKEN_PAIRES[sym] ? 'direct' : 'snapshot', nom: KRAKEN_PAIRES[sym] ? 'Kraken (direct) + snapshot' : 'snapshot ' + nomFichierBougies(sym, intervalle), ms: 15000,
    lire: async () => {
      let base = null, direct = null, e1 = null;
      try { const r = await fetchFn(urlSnapshot(nomFichierBougies(sym, intervalle)), { cache: 'no-cache', signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('snapshot ' + r.status); base = expanserBougies(await r.json()); } catch (e) { e1 = e; }
      if (KRAKEN_PAIRES[sym]) { try { direct = await krakenSpot(sym, intervalle, { fetchFn }); } catch (e) { if (!base) throw e; } }
      if (!base && !direct) throw e1 || new Error('aucune bougie');
      const bougies = fusionnerBougies(base && base.bougies, direct && direct.bougies);
      return { ...(base || { sym, nom: sym, intervalle }), bougies, prix: direct && direct.prix != null ? direct.prix : (base && base.prix), tPrix: direct ? direct.tPrix : (base && base.tPrix), source: direct ? 'Kraken (direct) · historique du snapshot' : (base && base.source), t: direct ? maintenant() : (base && base.t) };
    } });
  const res = await lireDonnee(`bougies|${sym}|${intervalle}`, { sources, ttl: ttl != null ? ttl : (intervalle === '1d' ? 10 * 60e3 : 45e3), stockage: stockage || creerStockageParDefaut(), fetchFn, maintenant,
    valider: d => (d && Array.isArray(d.bougies) && d.bougies.length ? true : 'aucune bougie') });
  return { ...res, donnees: expanserBougies(res.donnees) };
}
