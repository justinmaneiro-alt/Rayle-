/* ═════════════ FOOTPRINT : CALCULS PURS (testés, navigateur et Node) — v4.1 ═════════════
   Une « case » d'archive est [indice, volume vendeur agressif, volume acheteur agressif, nombre de transactions] ; prix de la case = indice × pas (borne basse).
   Aucune donnée n'est inventée : une bougie sans cases n'a pas d'empreinte (null), jamais une empreinte estimée.
   Déséquilibre (diagonal, comme sur les logiciels d'order flow) : à la case k, les acheteurs agressifs (ask) sont comparés aux vendeurs agressifs (bid) de la case du dessous (k − 1) ;
   les vendeurs de la case k aux acheteurs de la case du dessus (k + 1). Rapport ≥ 3 : déséquilibre. 3 cases consécutives ou plus du même côté : déséquilibre EMPILÉ (zone de support / résistance fréquente). */
export const PARAMS_FOOTPRINT = Object.freeze({ ratio: 3, empile: 3, partMin: 0.04, seuilDeltaPx: 70, seuilVolumePx: 44, hauteurLigneMin: 12, hauteurLigneProfil: 6, maxCases: 25 });   // v6 : jamais plus de 25 cases visibles par bougie (la taille s'adapte au zoom en regroupant les cases trop fines)

const EPS = 1e-9;
/* cases d'archive (pas source) → niveaux au pas cible (multiple entier du pas source) : [{ k, prix, vente, achat, n }] triés du bas vers le haut */
export function regrouperPrix(cases, pasSource, pasCible) {
  if (!Array.isArray(cases) || !cases.length) return [];
  const m = new Map();
  for (const [i, s, b, n] of cases) { const k = Math.floor((i * pasSource) / pasCible + EPS); const e = m.get(k); if (e) { e.vente += s; e.achat += b; e.n += n || 0; } else m.set(k, { k, prix: +(k * pasCible).toFixed(8), vente: s, achat: b, n: n || 0 }); }
  return [...m.values()].sort((a, b) => a.k - b.k);
}
/* plusieurs ensembles de cases (heures d'une bougie plus longue) → un seul */
export function fusionnerCases(listes) {
  const m = new Map(); for (const L of listes) for (const [i, s, b, n] of L || []) { const e = m.get(i); if (e) { e[1] += s; e[2] += b; e[3] += n || 0; } else m.set(i, [i, s, b, n || 0]); }
  return [...m.values()].sort((a, b) => a[0] - b[0]);
}
/* taille de case à afficher : la plus petite taille précalculée dont la ligne fait au moins `ligneMin` pixels ; sinon un multiple entier de la plus grande.
   pxParPrix = pixels par unité de prix (positif). Retourne { source, pas } (source = taille précalculée à charger, pas = taille affichée, multiple entier de source). */
export function tailleCible(tailles, pxParPrix, ligneMin = PARAMS_FOOTPRINT.hauteurLigneMin, minPas = 0) {
  const L = [...tailles].sort((a, b) => a - b); if (!L.length || !(pxParPrix > 0)) return null; let r = null;
  for (const s of L) if (s * pxParPrix >= ligneMin - EPS) { r = { source: s, pas: s, ratio: 1 }; break; }
  if (!r) { const s = L[L.length - 1], m = Math.max(1, Math.ceil(ligneMin / (s * pxParPrix) - EPS)); r = { source: s, pas: +(s * m).toFixed(8), ratio: m }; }
  if (r.pas < minPas - EPS) { const m = Math.max(1, Math.ceil(minPas / r.source - EPS)); r = { source: r.source, pas: +(r.source * m).toFixed(8), ratio: m }; }   // v6 : au plus maxCases cases par bougie
  return r;
}
/* analyse d'une bougie : lignes du haut vers le bas, POC, déséquilibres, empilés, totaux */
export function analyserBougie(niveaux, { ratio = PARAMS_FOOTPRINT.ratio, empile = PARAMS_FOOTPRINT.empile, partMin = PARAMS_FOOTPRINT.partMin } = {}) {
  if (!niveaux || !niveaux.length) return null;
  const par = new Map(niveaux.map(n => [n.k, n])), total = { vente: 0, achat: 0, volume: 0, delta: 0, n: 0 }; let pocK = niveaux[0].k, pocV = -1, maxV = 0;
  for (const n of niveaux) { const v = n.vente + n.achat; total.vente += n.vente; total.achat += n.achat; total.n += n.n || 0; if (v > pocV) { pocV = v; pocK = n.k; } maxV = Math.max(maxV, v); }
  total.volume = total.vente + total.achat; total.delta = total.achat - total.vente;
  const kMin = niveaux[0].k, kMax = niveaux[niveaux.length - 1].k, min = Math.max(maxV * partMin, EPS), rows = niveaux.map(n => {
    const bas = par.get(n.k - 1), haut = par.get(n.k + 1), venteBas = bas ? bas.vente : 0, achatHaut = haut ? haut.achat : 0;
    const dAchat = n.k > kMin && n.achat >= min && n.achat >= ratio * venteBas, dVente = n.k < kMax && n.vente >= min && n.vente >= ratio * achatHaut;   // première et dernière cases : pas de voisine à comparer, jamais signalées
    const deseq = dAchat && dVente ? (n.achat / (venteBas || EPS) >= n.vente / (achatHaut || EPS) ? 'achat' : 'vente') : dAchat ? 'achat' : dVente ? 'vente' : null;
    return { k: n.k, prix: n.prix, vente: n.vente, achat: n.achat, delta: n.achat - n.vente, volume: n.vente + n.achat, n: n.n, poc: n.k === pocK, deseq, empile: false };
  });
  const zones = []; let i = 0;   // rows : du bas vers le haut ; suites de k consécutifs, même côté
  while (i < rows.length) {
    if (!rows[i].deseq) { i++; continue; } let j = i; while (j + 1 < rows.length && rows[j + 1].deseq === rows[i].deseq && rows[j + 1].k === rows[j].k + 1) j++;
    if (j - i + 1 >= empile) { for (let q = i; q <= j; q++) rows[q].empile = true; zones.push({ cote: rows[i].deseq, kBas: rows[i].k, kHaut: rows[j].k, prixBas: rows[i].prix, prixHaut: rows[j].prix, n: j - i + 1 }); }
    i = j + 1;
  }
  rows.reverse(); return { rows, total, poc: par.get(pocK), zones, maxVolume: maxV };
}
/* case contenant un prix : ligne de la bougie dont [prix, prix + pas[ le contient */
export function ligneDuPrix(analyse, prix, pas) { if (!analyse) return null; return analyse.rows.find(r => prix >= r.prix - EPS && prix < r.prix + pas - EPS) || null; }
/* couleur d'intensité : fraction 0..1 du volume de la case par rapport au plus gros volume de la bougie */
export const intensite = (volume, maxV) => (maxV > 0 ? Math.max(0, Math.min(1, volume / maxV)) : 0);
/* une case est « sur un niveau de réaction » si la bande du niveau (bas..haut, à défaut son prix) rencontre [prix, prix + pas[ (phase 3) */
export const surNiveau = (prix, pas, niveaux) => (niveaux || []).find(n => (n.haut != null ? n.haut : n.prix) >= prix - EPS && (n.bas != null ? n.bas : n.prix) < prix + pas - EPS) || null;
