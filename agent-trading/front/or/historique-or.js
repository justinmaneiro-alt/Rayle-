/* ═════════════ HISTORIQUE DU GRAPHIQUE DE L'OR (fetch injectable, testé en Node) ═════════════
   Prix : Kraken PF_XAUUSD, paginé par fenêtres de 2000 bougies (limite de l'API), chargées en parallèle, jusqu'à la mise en ligne du perpétuel
   (aucune bougie avant : le perpétuel n'existait pas). Avant elle : « historique de référence » = Binance XAUUSDT, DÉCALÉ de l'écart
   Kraken − Binance mesuré au moment de l'affichage, montré dans une bande distincte avec une étiquette (jamais présenté comme du Kraken).
   Volume : Binance sur toute la période affichée (référence liquide). Aucune bougie inventée : un trou reste un trou. */
import { PERIODES, RELAIS, BINANCE } from './config-or.js';
import { depuisKraken, depuisBinance, fusionner } from './bougies-or.js';

const JOUR = 86400e3;
/* profondeur visée au premier affichage (jours) : au moins 30 j en M5, 6 mois en M15, 2 ans en H1 ; H4 et Jour : 3 et 5 ans (référence si besoin) */
export const PROFONDEUR = Object.freeze({ M5: 30, M15: 183, H1: 730, H4: 1095, J: 1825 });
export const PAGE_KRAKEN = 2000, PAGE_BINANCE = 1500;
/* un morceau de plus à chaque arrivée au bord gauche (glisser vers la gauche) */
export const MORCEAU = Object.freeze({ M5: 2000, M15: 2000, H1: 2000, H4: 1500, J: 1500 });

async function json(url, fetchFn, ms = 15000) {
  const r = await fetchFn(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`);
  return r.json();
}
/* quelques promesses à la fois (le relais et Binance ne sont pas inondés) */
export async function parLots(taches, n = 4) {
  const out = new Array(taches.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, taches.length) }, async () => { while (i < taches.length) { const k = i++; out[k] = await taches[k](); } }));
  return out;
}
/* fenêtres [de, a[ de « taille » bougies, de la plus récente à la plus ancienne, entre debut et fin */
export function fenetres(debut, fin, pasMs, taille) {
  const L = [], largeur = pasMs * taille;
  for (let a = fin; a > debut; a -= largeur) L.push({ de: Math.max(debut, a - largeur), a });
  return L;
}
export async function krakenFenetre(periode, de, a, { fetchFn = fetch, relais = RELAIS } = {}) {
  const P = PERIODES[periode], f = Math.max(1700000000, Math.floor(de / 1000)), t = Math.floor(a / 1000);
  if (t <= f) return [];
  return depuisKraken(await json(`${relais}/kraken/bougies?res=${P.kraken}&from=${f}&to=${t}`, fetchFn)).filter(b => b.t >= de && b.t < a);
}
export async function binanceFenetre(periode, de, a, { fetchFn = fetch } = {}) {
  const P = PERIODES[periode];
  return depuisBinance(await json(`${BINANCE.klines}?symbol=${BINANCE.symbole}&interval=${P.binance}&startTime=${Math.floor(de)}&endTime=${Math.floor(a) - 1}&limit=${PAGE_BINANCE}`, fetchFn)).filter(b => b.t >= de && b.t < a);
}
/* Kraken entre debut et fin. epuise = la plus ancienne fenêtre demandée est vide (le perpétuel n'existait pas encore) */
export async function chargerKraken(periode, debut, fin, opts = {}) {
  const P = PERIODES[periode], F = fenetres(debut, fin, P.ms, PAGE_KRAKEN);
  const R = await parLots(F.map(w => () => krakenFenetre(periode, w.de, w.a, opts)), opts.parallele || 4);
  let tout = []; for (const L of R) tout = fusionner(tout, L);
  const vide = R.length && !R[R.length - 1].length;
  // la fenêtre la plus ancienne est vide, ou ne commence que bien après son début : on est arrivé à la mise en ligne
  const epuise = vide || (tout.length > 0 && tout[0].t > debut + Math.max(3 * JOUR, 50 * P.ms));
  return { bougies: tout, epuise };
}
export async function chargerBinance(periode, debut, fin, opts = {}) {
  const P = PERIODES[periode], F = fenetres(debut, fin, P.ms, PAGE_BINANCE);
  const R = await parLots(F.map(w => () => binanceFenetre(periode, w.de, w.a, opts)), opts.parallele || 4);
  let tout = []; for (const L of R) tout = fusionner(tout, L);
  const epuise = !tout.length || tout[0].t > debut + Math.max(3 * JOUR, 50 * P.ms);
  return { bougies: tout, epuise };
}

/* état d'historique d'une période : { periode, k (Kraken), ref (Binance avant le 1er Kraken, NON décalé), vol (Binance, toute la période),
   debutKraken, krakenEpuise, refEpuise, debut (plus ancienne bougie affichable) } */
export async function chargerHistorique(periode, { maintenant = Date.now(), jours = PROFONDEUR[periode], ...opts } = {}) {
  const P = PERIODES[periode], fin = Math.floor(maintenant / P.ms) * P.ms + P.ms, debut = fin - jours * JOUR;
  const [K, B] = await Promise.all([chargerKraken(periode, debut, fin, opts), chargerBinance(periode, debut, fin, opts).catch(e => ({ bougies: [], epuise: false, erreur: e }))]);
  const debutKraken = K.bougies.length ? K.bougies[0].t : null;
  return construire(periode, { k: K.bougies, vol: B.bougies, krakenEpuise: K.epuise, refEpuise: B.epuise, debutKraken, erreurRef: B.erreur || null });
}
function construire(periode, H) {
  const ref = H.debutKraken == null ? H.vol.slice() : H.vol.filter(b => b.t < H.debutKraken);
  const debut = Math.min(ref.length ? ref[0].t : Infinity, H.k.length ? H.k[0].t : Infinity);
  return { periode, ...H, ref, debut: Number.isFinite(debut) ? debut : null };
}
/* un morceau plus ancien : Kraken tant qu'il en a, puis la référence. Renvoie le nouvel état (ou le même, rien à ajouter) */
export async function chargerPlusAncien(H, opts = {}) {
  const P = PERIODES[H.periode], n = MORCEAU[H.periode];
  if (!H.krakenEpuise && H.debutKraken != null) {
    const a = H.debutKraken, de = a - n * P.ms;
    const [K, B] = await Promise.all([chargerKraken(H.periode, de, a, opts), chargerBinance(H.periode, de, a, opts).catch(() => ({ bougies: [], epuise: false }))]);
    const k = fusionner(K.bougies, H.k), vol = fusionner(B.bougies, H.vol);
    return construire(H.periode, { ...H, k, vol, krakenEpuise: K.epuise || !K.bougies.length, debutKraken: k.length ? k[0].t : H.debutKraken });
  }
  if (H.refEpuise) return H;
  const a = H.debut ?? H.debutKraken, de = a - n * P.ms;
  const B = await chargerBinance(H.periode, de, a, opts);
  return construire(H.periode, { ...H, vol: fusionner(B.bougies, H.vol), refEpuise: B.epuise || !B.bougies.length });
}
/* dernières bougies Binance (volume de la bougie en cours) */
export async function rafraichirVolume(H, { maintenant = Date.now(), ...opts } = {}) {
  if (!H || !H.vol.length) return H;
  const P = PERIODES[H.periode], de = H.vol[H.vol.length - 1].t;
  const L = await binanceFenetre(H.periode, de, maintenant + P.ms, opts);
  return { ...H, vol: fusionner(H.vol, L) };
}
/* bougies de référence décalées de l'écart Kraken − Binance (pour l'affichage), marquées ref: true */
export const decalerBougies = (L, e) => { const d = Number.isFinite(e) ? e : 0; return L.map(b => ({ t: b.t, o: b.o + d, h: b.h + d, l: b.l + d, c: b.c + d, v: b.v, ref: true })); };
/* série affichée : référence décalée avant le premier Kraken, puis Kraken (k peut contenir la bougie en cours, mise à jour par le WebSocket) */
export function serieAffichee(H, k, ecart) {
  const debutK = k.length ? k[0].t : Infinity;
  return [...decalerBougies((H ? H.ref : []).filter(b => b.t < debutK), ecart), ...k];
}
