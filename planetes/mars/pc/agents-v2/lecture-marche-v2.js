import { formeBougie } from '../agent-m6/bougie.js';

/* ═════════════ RAYLÉ LIT LE MARCHÉ (V2, phase 6 ; module pur, testé : planetes/mars/tests/v2-lecture-test.mjs) ═════════════
   Sur n'importe quel actif et n'importe quelle unité (M15, H1, H4, D1…), à partir de simples bougies { t, o, h, l, c, v }, SANS IA : un rapport en français clair.
   · contexte : TENDANCE (sommets et creux de plus en plus hauts / bas : HH-HL, LH-LL), RANGE (boîte étroite touchée des deux côtés) ou TRANSITION ;
   · FIN DE RANGE (compression de la volatilité, cassure confirmée ou non), CASSURES (clôture au-delà d'un niveau) ;
   · PRISES DE LIQUIDITÉ (une mèche dépasse un sommet / un creux récent puis la bougie referme à l'intérieur : « balayage ») ;
   · VOLUME et sa DIRECTION (part du volume dans les bougies haussières ; delta réel si `vb` est fourni) ;
   · « QUAND ÉVITER DE TRADER » : range étroit, volume faible, annonce majeure proche, volatilité écrasée, week-end calme ;
   · SCÉNARIOS haussier / baissier avec niveau de déclenchement, objectif et INVALIDATION ;
   · lecture BOUGIE PAR BOUGIE des dernières bougies.
   Ce n'est PAS une prévision : « ce que montrent les bougies », « ce qui invaliderait ». Une donnée manquante est dite manquante (et déclenche, côté page, la capture d'écran du graphique lue par l'IA
   vision, seulement à la demande). Tout est causal : on ne regarde jamais plus loin que la dernière bougie fermée. */
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const moy = (a, de, vers) => { let s = 0, n = 0; for (let i = Math.max(0, de); i < vers; i++) if (Number.isFinite(a[i])) { s += a[i]; n++; } return n ? s / n : NaN; };
export const BOUGIES_MIN = 60;

function atrSerie(b, p = 14) {
  const out = new Float64Array(b.length).fill(NaN); let a = 0;
  for (let i = 0; i < b.length; i++) {
    const tr = i === 0 ? b[0].h - b[0].l : Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    if (i < p) { a += tr; if (i === p - 1) out[i] = a / p; } else { out[i] = (out[i - 1] * (p - 1) + tr) / p; }
  }
  return out;
}
/* Pivots confirmés (k bougies de chaque côté) : { i, prix } triés dans le temps. */
export function pivotsDe(b, k = 3) {
  const hauts = [], bas = [];
  for (let j = k; j < b.length - k; j++) {
    let h = true, l = true; for (let q = j - k; q <= j + k; q++) { if (q === j) continue; if (b[q].h >= b[j].h) h = false; if (b[q].l <= b[j].l) l = false; }
    if (h) hauts.push({ i: j, prix: b[j].h }); if (l) bas.push({ i: j, prix: b[j].l });
  }
  return { hauts, bas };
}

export function lireMarcheV2(bougies, { unite = 'M15', actif = '', annonces = [], maintenant = null, derniersMax = 8 } = {}) {
  const b = (bougies || []).filter(x => x && Number.isFinite(x.o) && Number.isFinite(x.h) && Number.isFinite(x.l) && Number.isFinite(x.c));
  if (b.length < BOUGIES_MIN) return { ok: false, manque: 'bougies', raison: 'Il me faut au moins ' + BOUGIES_MIN + ' bougies pour lire le marché (j’en ai ' + b.length + ').' };
  const n = b.length, i = n - 1, px = b[i].c, a14 = atrSerie(b), atr = a14[i];
  if (!(atr > 0)) return { ok: false, manque: 'volatilite', raison: 'Volatilité inconnue (ATR non calculable).' };
  const nom = (actif ? actif + ' ' : '') + unite, faits = [], eviter = [], notes = [];
  // ── structure : sommets et creux confirmés ──
  const { hauts, bas } = pivotsDe(b, 3), dh = hauts.slice(-3), db = bas.slice(-3);
  const hh = dh.length >= 2 && dh[dh.length - 1].prix > dh[dh.length - 2].prix, lh = dh.length >= 2 && dh[dh.length - 1].prix < dh[dh.length - 2].prix;
  const hl = db.length >= 2 && db[db.length - 1].prix > db[db.length - 2].prix, ll = db.length >= 2 && db[db.length - 1].prix < db[db.length - 2].prix;
  // ── boîte des 72 dernières bougies ──
  const fen = Math.min(72, n - 1), haut72 = Math.max(...b.slice(n - fen).map(x => x.h)), bas72 = Math.min(...b.slice(n - fen).map(x => x.l)), largeur = (haut72 - bas72) / atr;
  const touchesH = b.slice(n - fen).filter(x => x.h >= haut72 - 0.25 * atr).length, touchesB = b.slice(n - fen).filter(x => x.l <= bas72 + 0.25 * atr).length;
  const tiers = Math.max(6, Math.floor(fen / 3)), derive = (moy(b.map(x => x.c), n - tiers, n) - moy(b.map(x => x.c), n - fen, n - fen + tiers)) / atr;   // dérive nette : moyenne du dernier tiers moins celle du premier, en ATR (insensible à la phase de l'oscillation)
  const range = largeur <= 8 && touchesH >= 2 && touchesB >= 2 && Math.abs(derive) <= 0.5 * largeur;   // boîte touchée des deux côtés et SANS dérive nette
  let contexte = 'transition';
  if (range) contexte = 'range'; else if (hh && hl) contexte = 'tendance haussière'; else if (lh && ll) contexte = 'tendance baissière';
  // ── compression et fin de range ──
  const atrRecent = moy(a14, n - 10, n), atrAvant = moy(a14, n - 60, n - 10), compression = atrRecent / atrAvant;
  // cassure : clôture au-delà de la boîte de la période précédente (hors 6 dernières bougies)
  const avant = b.slice(Math.max(0, n - 6 - 72), n - 6), hA = Math.max(...avant.map(x => x.h)), lA = Math.min(...avant.map(x => x.l)), cassures = [];
  for (let q = n - 6; q < n; q++) {
    if (b[q].c > hA + 0.1 * atr && b[q - 1].c <= hA + 0.1 * atr) cassures.push({ sens: 1, niveau: hA, i: q, confirmee: b[i].c > hA });
    if (b[q].c < lA - 0.1 * atr && b[q - 1].c >= lA - 0.1 * atr) cassures.push({ sens: -1, niveau: lA, i: q, confirmee: b[i].c < lA });
  }
  const largeurAvant = (hA - lA) / atr, etaitRange = largeurAvant <= 7;
  const finRange = (etaitRange && cassures.length) ? { type: 'cassure', sens: cassures[cassures.length - 1].sens, confirmee: cassures[cassures.length - 1].confirmee, niveau: cassures[cassures.length - 1].niveau }
    : (contexte === 'range' && compression < 0.7) ? { type: 'compression', sens: 0, confirmee: false } : null;
  // ── prises de liquidité (balayages) sur les 30 dernières bougies, par rapport aux pivots antérieurs ──
  const sweeps = [];
  for (let q = Math.max(n - 30, 10); q < n; q++) {
    const hp = hauts.filter(p => p.i < q - 3).slice(-1)[0], bp = bas.filter(p => p.i < q - 3).slice(-1)[0];
    if (hp && b[q].h > hp.prix + 0.05 * atr && b[q].c < hp.prix) sweeps.push({ sens: -1, niveau: hp.prix, i: q, nom: 'prise de liquidité au-dessus du sommet à ' + f(hp.prix) });
    if (bp && b[q].l < bp.prix - 0.05 * atr && b[q].c > bp.prix) sweeps.push({ sens: 1, niveau: bp.prix, i: q, nom: 'prise de liquidité sous le creux à ' + f(bp.prix) });
  }
  // ── volume et direction ──
  const avecVol = b.every(x => Number.isFinite(x.v) && x.v >= 0) && b.some(x => x.v > 0), vols = b.map(x => x.v);
  let volume = null;
  if (avecVol) {
    const ratio = moy(vols, n - 3, n) / moy(vols, n - 53, n - 3), hauss = b.slice(n - 20).filter(x => x.c >= x.o).reduce((s, x) => s + x.v, 0), tot = b.slice(n - 20).reduce((s, x) => s + x.v, 0), part = tot > 0 ? hauss / tot : NaN;
    const deltaReel = b.slice(n - 20).every(x => Number.isFinite(x.vb)) ? b.slice(n - 20).reduce((s, x) => s + (2 * x.vb - x.v), 0) / tot : null;
    volume = { ratio, partHaussiere: part, direction: part > 0.58 ? 'acheteuse' : part < 0.42 ? 'vendeuse' : 'équilibrée', deltaReel };
  }
  // ── quand éviter de trader ──
  if (contexte === 'range' && largeur < 3) eviter.push('Range très étroit (' + f(largeur, 1) + ' ATR de haut en bas) : les frais mangent tout, attendre la cassure confirmée.');
  if (volume && volume.ratio < 0.5) eviter.push('Volume faible (' + f(volume.ratio, 1) + ' × la moyenne) : les mouvements manquent de carburant, faux signaux plus fréquents.');
  if (compression < 0.55) eviter.push('Volatilité écrasée (ATR récent ' + f(compression * 100, 0) + ' % de l’habituel) : un gros mouvement peut partir dans n’importe quel sens ; attendre la direction.');
  if (maintenant != null) for (const an of annonces) { const dt = (an.t - maintenant) / 60e3; if (dt > 0 && dt <= 120) eviter.push('Annonce majeure dans ' + Math.round(dt) + ' min (' + (an.nom || 'événement') + ') : ne pas ouvrir de position juste avant.'); else if (dt <= 0 && dt >= -15) eviter.push('Annonce majeure à l’instant (' + (an.nom || 'événement') + ') : spreads et mèches imprévisibles, laisser passer 15 minutes.'); }
  if (maintenant != null) { const j = new Date(maintenant).getUTCDay(); if ((j === 0 || j === 6) && volume && volume.ratio < 0.8) eviter.push('Week-end calme : liquidité plus mince.'); }
  // ── scénarios ──
  const dernierHaut = dh.length ? dh[dh.length - 1].prix : haut72, dernierBas = db.length ? db[db.length - 1].prix : bas72, haut = contexte === 'range' ? haut72 : dernierHaut, basN = contexte === 'range' ? bas72 : dernierBas, h = Math.max(haut - basN, 2 * atr);
  const scenarios = {
    haussier: { declencheur: 'clôture ' + unite + ' au-dessus de ' + f(haut), objectif: f(haut + h), invalidation: 'retour sous ' + f(basN + 0.25 * (haut - basN)) + (contexte === 'tendance haussière' ? ' (cassure du dernier creux ' + f(dernierBas) + ')' : '') },
    baissier: { declencheur: 'clôture ' + unite + ' sous ' + f(basN), objectif: f(basN - h), invalidation: 'retour au-dessus de ' + f(haut - 0.25 * (haut - basN)) + (contexte === 'tendance baissière' ? ' (cassure du dernier sommet ' + f(dernierHaut) + ')' : '') }
  };
  // ── lecture bougie par bougie ──
  const dernieres = [];
  for (let q = Math.max(1, n - derniersMax); q < n; q++) {
    const fo = formeBougie({ o: b[q].o, h: b[q].h, l: b[q].l, c: b[q].c }, { o: b[q - 1].o, c: b[q - 1].c }), amp = (b[q].h - b[q].l) / atr, vr = avecVol ? b[q].v / moy(vols, q - 20, q) : null;
    dernieres.push({ t: b[q].t, forme: fo.nom, phrase: (b[q].t ? new Date(b[q].t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' : ' : '') + fo.phrase + ', amplitude ' + f(amp, 1) + ' ATR' + (vr != null && Number.isFinite(vr) ? ', volume ' + f(vr, 1) + ' ×' : '') + '.' });
  }
  // ── phrases ──
  const P = [];
  P.push('Sur ' + nom + ' : ' + contexte + (contexte === 'tendance haussière' ? ' (sommets et creux de plus en plus hauts)' : contexte === 'tendance baissière' ? ' (sommets et creux de plus en plus bas)' : contexte === 'range' ? ' entre ' + f(bas72) + ' et ' + f(haut72) + ' (' + f(largeur, 1) + ' ATR de large)' : ' : la structure n’est ni haussière ni baissière nette') + '. Dernier prix ' + f(px) + '.');
  if (finRange) P.push(finRange.type === 'cassure' ? 'Fin de range : cassure ' + (finRange.sens > 0 ? 'haussière' : 'baissière') + ' du niveau ' + f(finRange.niveau) + ' (' + (finRange.confirmee ? 'confirmée : la dernière clôture reste au-delà' : 'NON confirmée : le prix est revenu dans la boîte, risque de fausse cassure') + ').' : 'Fin de range possible : la volatilité se comprime (ATR récent à ' + f(compression * 100, 0) + ' % de l’habituel), une cassure peut arriver.');
  if (sweeps.length) { const s = sweeps[sweeps.length - 1]; P.push('Prise de liquidité : ' + s.nom + ' puis clôture à l’intérieur — ' + (s.sens > 0 ? 'les vendeurs piégés peuvent alimenter un rebond' : 'les acheteurs piégés peuvent alimenter une baisse') + ' (à confirmer).'); }
  if (volume) P.push('Volume : ' + f(volume.ratio, 1) + ' × la moyenne sur les 3 dernières bougies, direction ' + volume.direction + ' (' + f(volume.partHaussiere * 100, 0) + ' % du volume dans les bougies haussières' + (volume.deltaReel != null ? ' ; delta réel ' + f(volume.deltaReel * 100, 0) + ' %' : '') + ').'); else P.push('Volume : non fourni pour cet actif.');
  P.push(eviter.length ? 'Quand éviter de trader ici : ' + eviter.join(' ') : 'Rien n’interdit de trader d’après ces critères (range, volume, volatilité, annonces).');
  P.push('Scénario haussier : ' + scenarios.haussier.declencheur + ', objectif ' + scenarios.haussier.objectif + ', invalidé par ' + scenarios.haussier.invalidation + '. Scénario baissier : ' + scenarios.baissier.declencheur + ', objectif ' + scenarios.baissier.objectif + ', invalidé par ' + scenarios.baissier.invalidation + '.');
  P.push('Ce sont des constats sur les bougies, pas des prévisions : aucun ordre n’est passé et rien ne garantit la suite.');
  return { ok: true, actif, unite, contexte, structure: { hh, hl, lh, ll, derniersHauts: dh, derniersBas: db }, range: { haut: haut72, bas: bas72, largeurATR: largeur, touchesH, touchesB, estRange: range }, compression, finRange, cassures, sweeps, volume, eviter, scenarios, dernieres, atr, prix: px, texte: P.join(' '), phrases: P, notes };
}

/* Regroupe des bougies M15 en H1 / H4 / D1 (clé = début de période UTC) ; M15 rend les bougies telles quelles. La dernière période peut être incomplète : à n'utiliser qu'avec les bougies FERMÉES. */
export const MS_UNITE = { M15: 900e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };
export function agreger(bougies, unite = 'H1') {
  const pas = MS_UNITE[unite]; if (!pas || pas === 900e3) return bougies.slice();
  const m = new Map();
  for (const x of bougies) { const k = Math.floor(x.t / pas), e = m.get(k); if (!e) m.set(k, { t: k * pas, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, vb: x.vb }); else { e.h = Math.max(e.h, x.h); e.l = Math.min(e.l, x.l); e.c = x.c; e.v += x.v; e.vb += x.vb; } }
  return [...m.values()];
}

/* Lecture bougie par bougie seule (« explique les dernières bougies »). */
export const lectureBougies = (bougies, n = 8, opts = {}) => { const r = lireMarcheV2(bougies, { ...opts, derniersMax: n }); return r.ok ? { ok: true, lignes: r.dernieres.map(d => d.phrase), texte: r.dernieres.map(d => d.phrase).join(' ') } : r; };
