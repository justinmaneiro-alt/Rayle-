import { masque } from '../agent-btc/regles-lab.js';

/* ═════════════ SIGNAUX D'UNE STRATÉGIE DE L'UTILISATRICE (V1 ; module pur, testé : ms-moteur-test.mjs) ═════════════
   Même principe que regles-lab.js : tout est CAUSAL — le signal en i n'utilise que les bougies 0..i (et les bougies H1 / H4 déjà fermées) ; l'exécution se fait à l'ouverture de la bougie i + 1
   (simulation-ms.js). Déclenchement sur le FRONT MONTANT du masque des conditions (une seule fois par situation). Les conditions « zone de prix » et « heures » s'ajoutent à celles du laboratoire ;
   le filtre « pas d'entrée en range » utilise le régime causal du laboratoire (phases H4 et H1, volatilité). */
export const DEPART = 400, PAS = 900e3;
const MS_H = 3600e3, JOUR = 86400e3;

/* Régime à la clôture de i : 0 transition · 1 haussier · 2 baissier · 3 range · 4 volatil (même définition que la condition « régime » du laboratoire). */
export function codesRegime(ctx) {
  if (ctx.cache.has('ms:regime')) return ctx.cache.get('ms:regime');
  const n = ctx.n, out = new Uint8Array(n), r = ctx.h1.atrRang, p4 = ctx.h4.phase, p1 = ctx.h1.phase;
  for (let i = 0; i < n; i++) out[i] = r[i] >= 0.85 ? 4 : p4[i] === 1 && p1[i] !== 2 ? 1 : p4[i] === 2 && p1[i] !== 1 ? 2 : p4[i] === 3 || p1[i] === 3 ? 3 : 0;
  ctx.cache.set('ms:regime', out); return out;
}
export const NOMS_REGIME = Object.freeze(['transition', 'haussier', 'baissier', 'range', 'volatil']);

function masqueHeures(ctx, de, a) {
  const cle = 'ms:heures:' + de + ':' + a; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const n = ctx.n, m = new Uint8Array(n), t = ctx.m15.t;
  for (let i = 0; i < n; i++) { const h = ((t[i] + PAS) % JOUR) / MS_H; m[i] = (de < a ? h >= de && h < a : h >= de || h < a) ? 1 : 0; }   // heure de l'EXÉCUTION (ouverture de la bougie suivante)
  ctx.cache.set(cle, m); return m;
}
function masqueZone(ctx, bas, haut) {
  const cle = 'ms:zone:' + bas + ':' + haut; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  const n = ctx.n, m = new Uint8Array(n), c = ctx.m15.c; for (let i = 0; i < n; i++) m[i] = c[i] >= bas && c[i] <= haut ? 1 : 0;
  ctx.cache.set(cle, m); return m;
}
export function masqueCondition(ctx, c, s) {
  if (c.type === 'zoneprix') return masqueZone(ctx, c.bas, c.haut);
  if (c.type === 'heures') return masqueHeures(ctx, c.de, c.a);
  return masque(ctx, c, s);
}
const et = (masques, n) => { const m = new Uint8Array(n); for (let i = 0; i < n; i++) { let ok = 1; for (let k = 0; k < masques.length; k++) if (!masques[k][i]) { ok = 0; break; } m[i] = ok; } return m; };

/* Masque d'ENTRÉE pour le côté s (conditions + filtres). */
export function masqueEntree(ctx, strat, s) {
  const ms = strat.conditions.map(c => masqueCondition(ctx, c, s)), n = ctx.n;
  if (strat.filtres && strat.filtres.pasRange) { const cr = codesRegime(ctx), m = new Uint8Array(n); for (let i = 0; i < n; i++) m[i] = cr[i] === 3 ? 0 : 1; ms.push(m); }
  if (strat.filtres && strat.filtres.heures) ms.push(masqueHeures(ctx, strat.filtres.heures.de, strat.filtres.heures.a));
  return ms.length ? et(ms, n) : new Uint8Array(n).fill(1);
}
/* Masque de SORTIE sur signal, vu depuis une position de côté s. */
export function masqueSortie(ctx, strat, s) {
  if (strat.sortie.type !== 'signal') return null;
  return et(strat.sortie.conditions.map(c => masqueCondition(ctx, c, s)), ctx.n);
}

/* Niveau de stop d'une entrée de côté s décidée à la clôture de i (null si impossible). */
export function niveauStop(ctx, strat, i, s) {
  const m15 = ctx.m15, px = m15.c[i], st = strat.stop;
  if (st.type === 'fixe') return s > 0 ? px * (1 - st.pct / 100) : px * (1 + st.pct / 100);
  const a = (st.type === 'atr' ? (st.tf === 'h4' ? ctx.h4.atr : ctx.h1.atr) : ctx.h1.atr)[i];
  if (!(a > 0)) return null;
  if (st.type === 'atr') return s > 0 ? px - st.k * a : px + st.k * a;
  let e = s > 0 ? Infinity : -Infinity;
  for (let j = Math.max(0, i - st.L + 1); j <= i; j++) { if (s > 0 ? m15.l[j] < e : m15.h[j] > e) e = s > 0 ? m15.l[j] : m15.h[j]; }
  return s > 0 ? e - st.pad * a : e + st.pad * a;
}
const distanceSuivi = (ctx, strat, i) => { const so = strat.sortie; if (so.type !== 'suiveur') return 0; const a = (so.tf === 'h4' ? ctx.h4.atr : ctx.h1.atr)[i]; return a > 0 ? so.k * a : 0; };

/* Signaux : { sens: Int8Array, stop: Float64Array, suivi: Float64Array (distance du stop suiveur, 0 si aucun), R (objectif, ou null) }. */
export function signauxMS(ctx, strat) {
  const n = ctx.n, sens = new Int8Array(n), stop = new Float64Array(n), suivi = new Float64Array(n);
  const cotes = strat.cote === 'long' ? [1] : strat.cote === 'short' ? [-1] : [1, -1];
  for (const s of cotes) {
    const ok = masqueEntree(ctx, strat, s); let avant = 0;
    for (let i = DEPART; i < n; i++) {
      const v = ok[i], front = v && !avant; avant = v;
      if (!front || sens[i] !== 0) continue;
      const st = niveauStop(ctx, strat, i, s); if (st == null || !Number.isFinite(st)) continue;
      sens[i] = s; stop[i] = st; suivi[i] = distanceSuivi(ctx, strat, i);
    }
  }
  return { sens, stop, suivi, R: strat.sortie.type === 'cible_R' ? strat.sortie.R : null };
}

/* Quelles conditions sont réunies à la bougie j (pour le côté s) : sert aux alertes (raison du signal) et à la préparation. */
export function etatConditionsMS(ctx, strat, s, j) {
  const reunies = [], manque = [];
  for (const c of strat.conditions) (masqueCondition(ctx, c, s)[j] ? reunies : manque).push(c);
  if (strat.filtres && strat.filtres.pasRange) (codesRegime(ctx)[j] !== 3 ? reunies : manque).push({ type: 'filtre', texte: 'pas en range' });
  if (strat.filtres && strat.filtres.heures) (masqueHeures(ctx, strat.filtres.heures.de, strat.filtres.heures.a)[j] ? reunies : manque).push({ type: 'filtre', texte: 'heures ' + strat.filtres.heures.de + ' h – ' + strat.filtres.heures.a + ' h UTC' });
  return { reunies, manque };
}
