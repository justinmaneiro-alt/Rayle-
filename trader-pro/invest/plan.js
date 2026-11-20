/* ═════════════ « MON PLAN » : zone d'achat, portefeuille cible, DCA du mois, rééquilibrage (module PUR, testé) ═════════════
   Lecture seule : aucun ordre. Un plan n'est pas un conseil : il applique des règles de diversification que tu règles toi-même (maximum 10 % par ligne, 25 % par secteur, 40 % par pays hors ETF monde) et privilégie
   les lignes jugées « Attractif » ou « Très attractif » qui sont dans une ZONE D'ACHAT. */
import { verdictLigne, LIBELLES } from './modele.js';

const fin = x => typeof x === 'number' && Number.isFinite(x);
export const REGLES_DEFAUT = Object.freeze({ maxLigne: 0.10, maxSecteur: 0.25, maxPays: 0.40, correlation: 0.8 });
const BONS = new Set([LIBELLES.TRES, LIBELLES.ATTR]);
export const estBon = lib => BONS.has(lib);

/* ───── zone d'achat ─────
   = verdict Attractif ou mieux sur l'horizon choisi ET prix sur un support Daily majeur (au contact, à moins de 0,5 ATR au-dessus), sur la MA200 Daily (à moins de 0,5 ATR) ou en rebond sur la MA200 Weekly
   (prix de 0 à 3 % au-dessus de la MA200 Weekly alors que le dernier mois est positif : la ligne a touché puis repris). Données de l'index (l.dma, l.dsup, l.r.vs200w, l.r.m1) ; la fiche précise la bande exacte. */
export function contactTechnique(l) {
  const r = (l && l.r) || {}, raisons = [];
  if (fin(l.dsup) && l.dsup >= 0 && l.dsup <= 0.5) raisons.push('support majeur Daily');
  if (fin(l.dma) && Math.abs(l.dma) <= 0.5) raisons.push('MA200 Daily');
  if (fin(r.vs200w) && r.vs200w >= 0 && r.vs200w <= 0.03 && fin(r.m1) && r.m1 > 0) raisons.push('rebond sur la MA200 Weekly');
  return raisons;
}
export function zoneAchat(l, horizon = 'moyen', { ajust = {}, verdict = null } = {}) {
  const v = verdict || verdictLigne(l, horizon, { ajust }), raisons = contactTechnique(l), bon = estBon(v.lib);
  return { ok: bon && raisons.length > 0, bon, enZone: raisons.length > 0, raisons, lib: v.lib, score: v.score };
}
/* bande exacte pour le graphique de la fiche : { bas, haut, raison } à partir des bougies Daily (B), des clôtures hebdomadaires (W = [{ c }]) et du setup (support) */
export function bandeAchat({ B, W, support = null, ma200d = null, atr = null } = {}) {
  if (!B || !B.length || !fin(atr)) return null; const px = B[B.length - 1].c, out = [];
  if (fin(support) && px >= support && px - support <= 0.5 * atr) out.push({ bas: support, haut: support + 0.5 * atr, raison: 'support majeur Daily' });
  if (fin(ma200d) && Math.abs(px - ma200d) <= 0.5 * atr) out.push({ bas: ma200d - 0.5 * atr, haut: ma200d + 0.5 * atr, raison: 'MA200 Daily' });
  if (W && W.length >= 200) { let s = 0; for (let i = W.length - 200; i < W.length; i++) s += W[i].c; const m = s / 200; if (px >= m && px <= m * 1.03) out.push({ bas: m, haut: m * 1.03, raison: 'MA200 Weekly' }); }
  return out.length ? { bas: Math.min(...out.map(x => x.bas)), haut: Math.max(...out.map(x => x.haut)), raison: out.map(x => x.raison).join(' + ') } : null;
}

/* ───── corrélation hebdomadaire entre lignes (clôtures hebdomadaires) ───── */
const rendements = c => { const r = []; for (let i = 1; i < c.length; i++) r.push(c[i - 1] > 0 && c[i] > 0 ? Math.log(c[i] / c[i - 1]) : 0); return r; };
const corr = (a, b) => { const n = Math.min(a.length, b.length); if (n < 30) return null; const x = a.slice(-n), y = b.slice(-n), mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; };
/* series : { id: [clôtures hebdomadaires] } → paires dont la corrélation des rendements hebdomadaires dépasse le seuil */
export function pairesCorrelees(series, seuil = REGLES_DEFAUT.correlation) {
  const ids = Object.keys(series), R = Object.fromEntries(ids.map(i => [i, rendements(series[i])])), out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const c = corr(R[ids[i]], R[ids[j]]); if (c != null && c > seuil) out.push({ a: ids[i], b: ids[j], r: c }); }
  return out.sort((p, q) => q.r - p.r);
}

/* ───── portefeuille cible ─────
   lignes : [{ id, n, s (secteur), p (pays), c (classe), cat (ETF), z (zone), lib (verdict), zone (bool) }] ; renvoie les poids cibles (somme ≤ 1) en respectant les plafonds.
   Poids de départ : 3 si Attractif+ ET en zone d'achat, 1,5 si Attractif+, 1 si Neutre, 0 sinon (Peu attractif, À éviter, sans verdict : pas dans le plan). Plafonds appliqués par réduction proportionnelle
   et redistribution du reliquat aux lignes non plafonnées (jusqu'à stabilité) ; si les plafonds ne permettent pas d'allouer 100 %, le reste est « non alloué » (trop peu de lignes ou de secteurs). */
export const poidsDepart = l => (estBon(l.lib) ? (l.zone ? 3 : 1.5) : l.lib === LIBELLES.NEUTRE ? 1 : 0);
const monde = l => l.c === 'ETF' && /monde|world|global/i.test(`${l.n || ''} ${l.cat || ''} ${l.z || ''}`);
export function portefeuilleCible(lignes, regles = REGLES_DEFAUT) {
  const L = lignes.filter(l => poidsDepart(l) > 0), P = { ...REGLES_DEFAUT, ...regles }; if (!L.length) return { poids: {}, nonAlloue: 1, exclus: lignes.map(l => l.id), avertissements: ['Aucune ligne de ta sélection n’est jugée Attractive ou Neutre sur cet horizon : plan vide.'] };
  const w = Object.fromEntries(L.map(l => [l.id, poidsDepart(l)])), tot = Object.values(w).reduce((s, x) => s + x, 0); for (const k in w) w[k] /= tot;
  const groupes = [['ligne', () => null, P.maxLigne], ['secteur', l => (l.c === 'ETF' ? null : l.s || null), P.maxSecteur], ['pays', l => (l.c === 'ETF' && monde(l)) || l.c === 'ETF' ? null : l.p || null, P.maxPays]];
  const verrou = new Set(); let iter = 0, change = true;
  while (change && iter++ < 200) {
    change = false;
    for (const [nom, cle, plafond] of groupes) {
      const m = new Map(); for (const l of L) { const k = nom === 'ligne' ? l.id : cle(l); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(l); }
      for (const [, G] of m) { const s = G.reduce((a, l) => a + w[l.id], 0); if (s > plafond + 1e-9) { const f = plafond / s; for (const l of G) { w[l.id] *= f; verrou.add(l.id + '|' + nom); } change = true; } }
    }
    /* redistribue le reliquat aux lignes qui ont de la marge partout */
    const reste = 1 - Object.values(w).reduce((a, x) => a + x, 0); if (reste > 1e-9) {
      const marge = l => { let mx = P.maxLigne - w[l.id]; for (const [nom, cle, plafond] of groupes.slice(1)) { const k = cle(l); if (k == null) continue; const s = L.filter(q => cle(q) === k).reduce((a, q) => a + w[q.id], 0); mx = Math.min(mx, plafond - s); } return mx; };
      const libres = L.filter(l => marge(l) > 1e-9); if (libres.length) { const base = libres.reduce((a, l) => a + poidsDepart(l), 0); let place = 0; for (const l of libres) { const ajout = Math.min(marge(l), reste * poidsDepart(l) / base); w[l.id] += ajout; place += ajout; } if (place > 1e-9 && place < reste - 1e-9 && iter < 190) change = true; else if (place > 1e-9) change = true; }
    }
  }
  const somme = Object.values(w).reduce((a, x) => a + x, 0), av = [];
  if (somme < 0.995) av.push(`Avec ces plafonds (${Math.round(P.maxLigne * 100)} % par ligne, ${Math.round(P.maxSecteur * 100)} % par secteur, ${Math.round(P.maxPays * 100)} % par pays), seulement ${Math.round(somme * 100)} % peuvent être alloués : ajoute des lignes d’autres secteurs ou pays, ou assouplis une règle.`);
  const nMin = Math.ceil(1 / P.maxLigne); if (L.length < nMin) av.push(`Il faut au moins ${nMin} lignes pour respecter un plafond de ${Math.round(P.maxLigne * 100)} % par ligne : tu en as ${L.length} dans le plan.`);
  return { poids: Object.fromEntries(Object.entries(w).filter(([, x]) => x > 1e-9)), nonAlloue: Math.max(0, 1 - somme), exclus: lignes.filter(l => poidsDepart(l) === 0).map(l => l.id), avertissements: av };
}
/* répartition du DCA du mois : sans portefeuille connu, montant × poids cibles ; avec `detenu` ({ id: valeur en € }), on achète d'abord ce qui est SOUS-pondéré par rapport à la cible après versement
   (jamais de vente : un plan DCA n'achète que) ; le total réparti est le montant (ou moins si tout est déjà au-dessus de la cible) */
export function repartitionDca(cible, montant, detenu = null) {
  const ids = Object.keys(cible.poids); if (!ids.length || !(montant > 0)) return [];
  if (!detenu) return ids.map(id => ({ id, poids: cible.poids[id], montant: Math.round(montant * cible.poids[id] * 100) / 100 })).sort((a, b) => b.montant - a.montant);
  const total = Object.values(detenu).reduce((s, x) => s + (x || 0), 0) + montant, besoin = Object.fromEntries(ids.map(id => [id, Math.max(0, cible.poids[id] * total - (detenu[id] || 0))])), S = Object.values(besoin).reduce((s, x) => s + x, 0);
  if (S <= 0) return ids.map(id => ({ id, poids: cible.poids[id], montant: Math.round(montant * cible.poids[id] * 100) / 100 })).sort((a, b) => b.montant - a.montant);
  const k = Math.min(1, montant / S), brut = ids.map(id => ({ id, poids: cible.poids[id], montant: besoin[id] * k })), t = brut.reduce((s, x) => s + x.montant, 0), reste = montant - t;
  if (reste > 0.01) for (const x of brut) x.montant += reste * x.poids / Object.values(cible.poids).reduce((s, y) => s + y, 0);   // reliquat réparti selon la cible
  return brut.map(x => ({ ...x, montant: Math.round(x.montant * 100) / 100 })).filter(x => x.montant > 0).sort((a, b) => b.montant - a.montant);
}
/* écarts à la cible (rééquilibrage) quand le portefeuille réel est connu : { id, actuel, cible, ecart (points de %), action } ; « renforcer » / « alléger » sont des constats, jamais des ordres */
export function ecartsCible(cible, detenu) {
  if (!detenu) return []; const total = Object.values(detenu).reduce((s, x) => s + (x || 0), 0); if (!(total > 0)) return [];
  const ids = [...new Set([...Object.keys(cible.poids), ...Object.keys(detenu)])];
  return ids.map(id => { const a = (detenu[id] || 0) / total, c = cible.poids[id] || 0; return { id, actuel: a, cible: c, ecart: a - c, constat: a - c > 0.02 ? 'au-dessus de la cible' : a - c < -0.02 ? 'sous la cible' : 'proche de la cible' }; }).sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart));
}
export const phrasePlan = (cible, rep, noms = {}) => {
  if (!rep.length) return 'Plan vide : choisis des lignes dans Ma liste et un montant mensuel.';
  const n = id => noms[id] || id, top = rep.slice(0, 3).map(x => `${n(x.id)} ${Math.round(x.montant)} euros`).join(', ');
  return `DCA du mois : ${top}${rep.length > 3 ? ' et ' + (rep.length - 3) + ' autres lignes' : ''}. ${cible.avertissements.length ? cible.avertissements[0] : 'Les plafonds de diversification sont respectés.'} Ce n’est pas un conseil.`;
};
