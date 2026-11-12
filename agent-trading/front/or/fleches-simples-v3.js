/* ═════════════ FLÈCHES SIMPLES v3 — « fleches-simples-v3 » (2026-11-12) ═════════════
   Reprend fleches-simples-v2 (rejeu bougie par bougie, causal) et zones-direct. Seul changement : la définition d'une zone MAJEURE, causale et moins tardive.
   Au pas n (bougies closes 0..n-1 seulement), une zone dessinée est majeure si (a) elle a déjà été touchée ≥ 3 fois AVANT la touche en cours (épisodes séparés d'au moins 6 bougies,
   largeur ≥ 0,3 ATR), ou (b) son nom l'identifie comme niveau de structure supérieur déjà connu (H4, Jour, VAH/VAL mensuel, haut/bas du mois) ET elle est dessinée. Jamais de donnée future.
   Garde-fou ajouté pour la chute du 12 nov. : aucun achat après une chute de > 5 ATR(H1) sur les 24 dernières bougies. Plafond de sécurité très large : 30 flèches (retournements + MA200) sur 600 bougies ; s'il est atteint, il est compté dans `refus`. Seuils (3 touches, 6 bougies, 0,3 ATR) CHOISIS EN REGARDANT des exemples : aucune preuve de performance. Information de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
export const VERSION = 'fleches-simples-v3', H = 3600e3, DEPART = 260, PLAFOND = 30, FENETRE = 600;
export const P = Object.freeze({ ...V1.P, touchesVues: 3, chuteAtr: 5, chuteBougies: 24, ecartTouches: 6, largeurAtr: 0.3, regardeEnArriere: 1600 });
export const TYPES = V1.TYPES, idNiveau = V1.idNiveau, fusionnerRegistre = V1.fusionnerRegistre, textesRes = V1.textesRes;
const STRUCTURE = /\b(H4|jour|journali|mensuel|VAH|VAL|haut du mois|bas du mois)\b/i;

/* épisodes de touche d'une zone avec les bougies déjà closes S (bougies qui chevauchent la zone, épisodes séparés d'au moins 6 bougies) */
export function episodes(S, z) {
  const ep = []; let dernier = -1e9;
  for (let i = Math.max(0, S.length - P.regardeEnArriere); i < S.length; i++) if (S[i].l <= z.haut && S[i].h >= z.bas) { if (i - dernier >= P.ecartTouches) ep.push({ debut: i, fin: i }); else ep[ep.length - 1].fin = i; dernier = i; }
  return ep;
}
/* nombre de touches DÉJÀ vues : épisodes terminés avant la touche en cours (celle des dernières bougies) */
export function touchesVues(S, z) {
  const ep = episodes(S, z); if (!ep.length) return 0;
  const n = S.length, enCours = ep[ep.length - 1].fin >= n - 1 - P.ecartTouches + 1 ? 1 : 0;
  return ep.length - enCours;
}
export function majeure(S, z, a) { return (z.haut - z.bas >= P.largeurAtr * a && touchesVues(S, z) >= P.touchesVues) || STRUCTURE.test(String(z.nom || '')); }

export function rejouer(B, zonesA, { depart = DEPART, deja = [] } = {}) {
  const acceptees = deja.slice(), vus = []; let refus = 0;
  const A = atrSerie(B);
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1];
    const zones = zonesA(S, now).filter(z => majeure(S, z, a)).map(z => ({ ...z, force: 99, retournee: false, touchesVues: touchesVues(S, z) }));   // zone déjà touchée ≥ 3 fois : son rôle est confirmé, plus d'attente d'un premier retournement
    const r = V1.calculer(S, zones, { maintenant: now }), tv = new Map(zones.map(z => [V1.idNiveau(z), z.touchesVues]));
    for (const f of r.toutes.slice().sort((x, y) => (x.type === 'ma_cassure' ? 0 : 1) - (y.type === 'ma_cassure' ? 0 : 1))) {   // la cassure MA200 passe d'abord (jamais deux marqueurs sur la même bougie)
      if (f.i !== n - 1) continue;
      if (f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a) continue;   // couteau qui tombe : pas d'achat après une chute de > 5 ATR en 24 bougies
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) continue;
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; delete g.resultat;
      if (f.type === 'retournement') g.touchesVues = tv.get(f.levelId) ?? 0;
      acceptees.push(g); vus.push(g);
    }
  }
  return { fleches: vus, toutes: acceptees, refus };
}
export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720 } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0 };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja });
  return { fleches: r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) })), n: closes.length, raison: null, vers: closes.length, refus: r.refus };
}
export const detail = f => {
  const l = V1.detail(f);
  if (f.type === 'retournement') l.splice(2, 1, `Zone ${Math.round(f.zoneBas)}–${Math.round(f.zoneHaut)} · ${f.touchesVues} touche${f.touchesVues > 1 ? 's' : ''} déjà vue${f.touchesVues > 1 ? 's' : ''} (comptées avec les seules bougies closes)`);
  l.push(`Apparue le ${new Date(f.tCloture).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} (clôture de la bougie de confirmation) · clôture ${Math.round(f.prix)}`, 'Arrive après le plus haut/bas : repère de lecture, pas un ordre');
  return l;
};
export const bilan = () => ({});
