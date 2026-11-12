/* ═════════════ FLÈCHES SIMPLES v5 — « fleches-simples-v5 » (2026-11-13) : v4 + filtre contre-tendance + invalidation sans repaint ═════════════
   Dérivée de fleches-simples-v4 (scellée, intacte) : mêmes niveaux (structure niveaux-majeurs-v1 + zones de swing actives ≥ 3 touches), mêmes règles de flèche, MA200 inchangée, garde-fou 5 ATR, repos 24 bougies, plafond 30/600.
   AJOUTS (mode Direct seulement, causaux : à la clôture de la bougie concernée, jamais rétroactifs) :
   1. CONTRE-TENDANCE. Achat : clôture sous la MA200, MA200 plus basse qu'il y a 48 bougies H1 ET plus bas plus bas (plus bas des 24 dernières bougies < plus bas des 24 précédentes). Vente : miroir au-dessus d'une MA200 haussière.
      Une flèche contre-tendance devient un POINT GRIS (champ `contre: true`, ni notification ni alerte vocale), SAUF stabilisation : (a) base = 8 bougies consécutives sans nouveau plus bas (ou plus haut) par rapport aux 16 précédentes,
      avec un range des 8 bougies ≤ 1,5 ATR ; (b) divergence RSI confirmée (pivots de 5 bougies de chaque côté) dont le second pivot tombe sur la zone (± 0,5 ATR). Alors flèche normale (`stabilisation: 'base' | 'rsi'`).
   2. INVALIDATION. Une flèche de retournement normale n'est jamais supprimée ni déplacée. Si l'une des 2 bougies qui suivent la bougie de confirmation clôture de l'autre côté du niveau (achat : sous le bas ; vente : au-dessus du haut), elle passe à
      l'état `invalidee` (grise, creuse, petite croix ; `invalideeT` = clôture de la bougie concernée) ; un point gris contre-tendance n'est pas invalidé (aucun signal n'avait été donné).
   Seuils (48 / 24 / 8 / 1,5 ATR / 2 bougies) CHOISIS EN REGARDANT des exemples (chute de l'or du 12 nov.) : aucune preuve de performance. Information de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import * as V4 from './fleches-simples-v4.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';
import { rsiWilder, divergences } from './rsi-lecture-v1.js';
export const VERSION = 'fleches-simples-v5', H = 3600e3, DEPART = 260, PLAFOND = 30, FENETRE = 600;
export const P = Object.freeze({ ...V4.P, maPente: 48, plusBas: 24, baseBougies: 8, baseRange: 1.5, baseRef: 16, invalidBougies: 2, divMarge: 0.5, divFenetre: 300 });
export const TYPES = V1.TYPES, idNiveau = V1.idNiveau, textesRes = V1.textesRes, TYPES_STRUCTURE = V4.TYPES_STRUCTURE, niveauxStructure = V4.niveauxStructure, touchesVues = V4.touchesVues;

const minL = (B, a, b) => { let m = Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].l < m) m = B[k].l; return m; };
const maxH = (B, a, b) => { let m = -Infinity; for (let k = Math.max(0, a); k <= b; k++) if (B[k].h > m) m = B[k].h; return m; };
/* contre-tendance à la clôture de la bougie i (dir > 0 : achat) ; M = SMA 200 alignée sur B */
export function contreTendance(B, M, i, dir) {
  const m = M[i], m0 = M[i - P.maPente]; if (m == null || m0 == null || i < 2 * P.plusBas) return false;
  if (dir > 0) return B[i].c < m && m < m0 && minL(B, i - P.plusBas + 1, i) < minL(B, i - 2 * P.plusBas + 1, i - P.plusBas);
  return B[i].c > m && m > m0 && maxH(B, i - P.plusBas + 1, i) > maxH(B, i - 2 * P.plusBas + 1, i - P.plusBas);
}
/* (a) base : 8 bougies sans nouvel extrême (par rapport aux 16 précédentes) et range ≤ 1,5 ATR */
export function base(B, i, dir, a) {
  const n = P.baseBougies, d = i - n + 1; if (d - P.baseRef < 0 || !(a > 0)) return false;
  const hi = maxH(B, d, i), lo = minL(B, d, i); if (hi - lo > P.baseRange * a) return false;
  return dir > 0 ? lo >= minL(B, d - P.baseRef, d - 1) : hi <= maxH(B, d - P.baseRef, d - 1);
}
/* (b) divergence RSI confirmée dont le second pivot est sur la zone */
export function divergenceSurZone(B, R, i, dir, f, a) {
  const lo = Math.max(0, i + 1 - P.divFenetre), S = B.slice(lo, i + 1), r = R.slice(lo, i + 1);
  return divergences(S, r).some(d => d.dir === dir && S.length - 1 - d.i2 <= 60 && (dir > 0 ? S[d.i2].l <= f.zoneHaut + P.divMarge * a && S[d.i2].l >= f.zoneBas - P.divMarge * a : S[d.i2].h >= f.zoneBas - P.divMarge * a && S[d.i2].h <= f.zoneHaut + P.divMarge * a));
}

export function rejouer(B, zonesA, { depart = DEPART, deja = [] } = {}) {
  const acceptees = deja.slice(), vus = [], invalidees = []; let refus = 0;
  const A = atrSerie(B), M = sma(B), R = rsiWilder(B.map(b => b.c));
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1], c = S[n - 1].c, i = n - 1;
    // ── invalidation des flèches normales récentes (décidée à la clôture de cette bougie seulement)
    for (const g of acceptees) {
      if (g.type !== 'retournement' || g.contre || g.invalidee || !(g.i < i && i - g.i <= P.invalidBougies)) continue;
      if (g.dir > 0 ? c < g.zoneBas : c > g.zoneHaut) { g.invalidee = true; g.invalideeT = now; invalidees.push({ id: g.id, invalideeT: now }); }
    }
    const swing = zonesA(S, now).filter(z => z.actif !== false && z.tFin == null && (z.force || 0) >= P.touchesVues && z.haut - z.bas >= P.largeurAtr * a && touchesVues(S, z) >= P.touchesVues)
      .map(z => ({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: touchesVues(S, z) }));
    const struct = niveauxStructure(S).map(q => ({ id: `nm|${q.nom}|${Math.round(q.p * 100)}`, cote: q.p > c ? 'resistance' : 'support', bas: q.p, haut: q.p, tDebut: q.tDebut, tFin: null, nom: q.nom, force: 99, retournee: false, niveauType: 'structure', niveauNom: q.nom, typeStructure: q.type }));
    const zones = [...swing, ...struct];
    const r = V1.calculer(S, zones, { maintenant: now }), info = new Map(zones.map(z => [V1.idNiveau(z), z]));
    for (const f of r.toutes.slice().sort((x, y) => (x.type === 'ma_cassure' ? 0 : 1) - (y.type === 'ma_cassure' ? 0 : 1))) {
      if (f.i !== n - 1) continue;
      if (f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a) continue;
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) continue;
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.resultat;
      if (f.type === 'retournement') {
        const z = info.get(f.levelId);
        if (z) { g.niveauType = z.niveauType; g.niveauStyle = 'trait plein'; g.niveauNom = z.niveauNom || z.nom || null; g.touchesVues = z.niveauType === 'swing' ? z.touchesVues : null; if (z.typeStructure) g.typeStructure = z.typeStructure; }
        g.contre = false; g.stabilisation = null;
        if (contreTendance(S, M, i, f.dir)) {
          if (base(S, i, f.dir, a)) g.stabilisation = 'base';
          else if (divergenceSurZone(S, R, i, f.dir, g, a)) g.stabilisation = 'rsi';
          else g.contre = true;
        }
      }
      acceptees.push(g); vus.push(g);
    }
  }
  return { fleches: vus, toutes: acceptees, refus, invalidees };
}
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720 } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0, invalidees: [] };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja });
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), n: closes.length, raison: null, vers: closes.length, refus: r.refus, invalidees: r.invalidees };
}
/* registre : ajout seul ; une flèche existante ne change que par son état d'invalidation (et son résultat mesuré) */
export function fusionnerRegistre(reg, nouvelles, invalidees = []) {
  const par = new Map(reg.map(f => [f.id, f])), sortie = reg.slice();
  for (const f of nouvelles) { const e = par.get(f.id); if (!e) { sortie.push(f); par.set(f.id, f); } else { e.resultat = f.resultat; if (f.invalidee && !e.invalidee) { e.invalidee = true; e.invalideeT = f.invalideeT; } } }
  for (const v of invalidees) { const e = par.get(v.id); if (e && !e.invalidee) { e.invalidee = true; e.invalideeT = v.invalideeT; } }
  return sortie.sort((x, y) => x.tCloture - y.tCloture);
}
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
const heure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const detail = f => {
  const l = V4.detail(f);
  if (f.type !== 'retournement') return l;
  if (f.contre) l.unshift('Point gris : rebond CONTRE la tendance (sous une MA200 baissière, plus bas plus bas / miroir) sans base ni divergence RSI : aucune alerte');
  else if (f.stabilisation) l.splice(1, 0, f.stabilisation === 'base' ? 'Contre-tendance, mais base confirmée (8 bougies sans nouvel extrême, range ≤ 1,5 ATR)' : 'Contre-tendance, mais divergence RSI confirmée sur la zone');
  if (f.invalidee) l.unshift(`Invalidée à ${heure(f.invalideeT)} : une bougie a clôturé de l'autre côté du niveau (rebond ravalé)`);
  return l;
};
export const bilan = () => ({});
