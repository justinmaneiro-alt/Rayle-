/* ═════════════ MODÈLE MULTI-FACTEURS PAR HORIZON (module PUR, testé ; navigateur, Worker et Node) ═════════════
   1. chaque mesure brute devient un PERCENTILE 0-100, neutre par secteur et par zone (une banque est comparée aux banques européennes, pas à Apple) ; valeurs extrêmes écrêtées (winsorisation 1 % / 99 %) ;
   2. chaque facteur = moyenne des percentiles de ses mesures disponibles ;
   3. score composite par horizon = moyenne pondérée des facteurs disponibles (les poids sont ceux du cahier des charges, ajustés par le backtest si un facteur ne prouve rien) ;
   4. libellé (Très attractif … À éviter), indice de confiance (complétude des données, dispersion entre méthodes) ;
   5. garde-fous : piège à valeur, financières, foncières, valeur > 4 × prix.
   Ce n'est ni une prévision ni un conseil en investissement. */
const fin = x => typeof x === 'number' && Number.isFinite(x);

export const HORIZONS = Object.freeze([
  { id: 'tactique', nom: 'Tactique', duree: '1–10 jours', usage: 'court terme', valorisation: false },
  { id: 'swing', nom: 'Swing / saisonnier', duree: '1–6 mois', usage: 'j’achète en août, je revends en décembre', valorisation: false },
  { id: 'moyen', nom: '1–3 ans', duree: '1 à 3 ans', usage: 'horizon principal', valorisation: true },
  { id: 'long', nom: '5–10 ans', duree: '5 à 10 ans', usage: 'long terme, achats réguliers', valorisation: true }
]);
export const NOM_FACTEUR = Object.freeze({ mc: 'Tendance court terme', set: 'Setup MA200 et supports', ris: 'Risque', evt: 'Événements', mom: 'Momentum', sai: 'Saisonnalité', gro: 'Croissance', qua: 'Qualité', val: 'Valeur relative', iv: 'Valeur intrinsèque', moat: 'Avantage durable', bil: 'Solidité du bilan', ma: 'Tendance MA200', ppp: 'Parité de pouvoir d’achat', carry: 'Portage (taux)', erp: 'Rendement des bénéfices − taux 10 ans', reel: 'Taux réels', niv: 'Niveau des taux', pente: 'Pente de courbe' });
/* pondérations par classe d'actif et horizon (actions : celles du cahier des charges) */
export const POIDS = Object.freeze({
  action: { tactique: { mc: 40, set: 30, ris: 15, evt: 15 }, swing: { mom: 35, sai: 25, gro: 20, qua: 10, val: 10 }, moyen: { val: 35, qua: 25, mom: 20, gro: 10, ris: 10 }, long: { iv: 35, moat: 35, bil: 15, val: 15 } },
  etf: { tactique: { mc: 45, set: 35, ris: 20 }, swing: { mom: 40, sai: 30, ma: 30 }, moyen: { mom: 45, ma: 25, ris: 30 }, long: { ris: 40, ma: 30, mom: 30 } },
  devise: { tactique: { mc: 45, set: 35, ris: 20 }, swing: { mom: 35, sai: 30, carry: 20, ppp: 15 }, moyen: { ppp: 35, carry: 25, mom: 25, sai: 15 }, long: { ppp: 60, carry: 40 } },
  indice: { tactique: { mc: 45, set: 35, ris: 20 }, swing: { mom: 40, sai: 30, erp: 20, ma: 10 }, moyen: { erp: 40, mom: 30, ma: 15, ris: 15 }, long: { erp: 70, ma: 15, ris: 15 } },
  'matière première': { tactique: { mc: 45, set: 35, ris: 20 }, swing: { mom: 40, sai: 35, ma: 25 }, moyen: { mom: 40, ma: 30, sai: 15, ris: 15 }, long: { ma: 50, reel: 30, ris: 20 } },
  crypto: { tactique: { mc: 45, set: 35, ris: 20 }, swing: { mom: 50, ma: 30, ris: 20 }, moyen: { mom: 50, ma: 30, ris: 20 }, long: { ma: 60, ris: 40 } },
  obligataire: { tactique: { mc: 50, set: 30, ris: 20 }, swing: { mom: 40, sai: 20, niv: 40 }, moyen: { niv: 60, pente: 20, mom: 20 }, long: { niv: 70, reel: 30 } }
});
export const classePoids = classe => (POIDS[classe] ? classe : 'action');
/* mesures brutes → facteurs : [clé de la mesure, sens (+1 : plus haut = mieux ; −1 : plus bas = mieux)] */
export const MESURES = Object.freeze({
  val: [['earnY', 1], ['ebitEv', 1], ['fcfY', 1], ['shy', 1], ['pbInv', 1], ['histRel', 1]],
  qua: [['roic', 1], ['roe', 1], ['gprof', 1], ['stabMarge', 1], ['accr', 1], ['pk', 1], ['dil', 1], ['icov', 1], ['nde', -1], ['z', 1]],
  mom: [['m12_1', 1], ['m6_1', 1], ['rsIdx', 1], ['rsSec', 1], ['vs200d', 1], ['vs200w', 1], ['d52', 1]],
  gro: [['gEps', 1], ['gRev', 1]],
  ris: [['vol', -1], ['mdd3', 1], ['beta', -1], ['liq', 1]],
  bil: [['nde', -1], ['icov', 1], ['z', 1], ['liqCourante', 1]],
  moat: [['roicOk', 1], ['stabMarge', 1], ['dil', 1], ['roic', 1]],
  mc: [['m1', 1], ['m3', 1], ['vs20', 1]],
  iv: [['mos', 1]],
  ma: [['vs200w', 1], ['vs200d', 1]],
  ppp: [['ppp', 1]], carry: [['carry', 1]], erp: [['erp', 1]], reel: [['reel', 1]], niv: [['niv', 1]], pente: [['pente', 1]]
});
/* classes sans liquidité : ris ne retient que la volatilité et le drawdown */
export const SEUIL_LIBELLE = Object.freeze({ tresAttractif: 72, attractif: 58, neutre: 42, peuAttractif: 28 });
export const LIBELLES = Object.freeze({ TRES: 'Très attractif', ATTR: 'Attractif', NEUTRE: 'Neutre', PEU: 'Peu attractif', EVITER: 'À éviter', ND: 'Données insuffisantes' });
export const ORDRE_LIBELLE = Object.freeze({ [LIBELLES.TRES]: 0, [LIBELLES.ATTR]: 1, [LIBELLES.NEUTRE]: 2, [LIBELLES.PEU]: 3, [LIBELLES.EVITER]: 4, [LIBELLES.ND]: 5 });
export const libelleDe = s => (s == null ? LIBELLES.ND : s >= SEUIL_LIBELLE.tresAttractif ? LIBELLES.TRES : s >= SEUIL_LIBELLE.attractif ? LIBELLES.ATTR : s >= SEUIL_LIBELLE.neutre ? LIBELLES.NEUTRE : s >= SEUIL_LIBELLE.peuAttractif ? LIBELLES.PEU : LIBELLES.EVITER);

/* ───── statistiques ───── */
export function quantileTrie(A, q) { if (!A.length) return null; const p = (A.length - 1) * q, i = Math.floor(p), j = Math.min(A.length - 1, i + 1); return A[i] + (A[j] - A[i]) * (p - i); }
/* écrêtage 1 % / 99 % d'une liste de valeurs (renvoie les bornes) */
export function bornesWinsor(valeurs, q = 0.01) { const A = valeurs.filter(fin).sort((a, b) => a - b); return A.length >= 20 ? [quantileTrie(A, q), quantileTrie(A, 1 - q)] : [A[0], A[A.length - 1]]; }
const lowerBound = (A, x) => { let lo = 0, hi = A.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m] < x) lo = m + 1; else hi = m; } return lo; };
const upperBound = (A, x) => { let lo = 0, hi = A.length; while (lo < hi) { const m = (lo + hi) >> 1; if (A[m] <= x) lo = m + 1; else hi = m; } return lo; };
const MIN_GROUPE = 8;
/* Percentile (0-100) de chaque ligne pour une mesure, comparé à son groupe secteur × zone ; repli sur la zone, puis sur l'ensemble si le groupe a moins de 8 valeurs.
   L : lignes ; val(l) : valeur brute ; secteur(l), zone(l) : clés de groupe ; sens : +1 / −1. Renvoie un tableau aligné sur L (null si la valeur manque). */
export function percentilesNeutres(L, val, secteur, zone, sens = 1) {
  const niveaux = [new Map(), new Map(), new Map()], cle = [l => zone(l) + '|' + secteur(l), l => zone(l), () => '*']; const vals = L.map(val);
  L.forEach((l, i) => { const v = vals[i]; if (!fin(v)) return; cle.forEach((k, n) => { const c = k(l); (niveaux[n].get(c) || niveaux[n].set(c, []).get(c)).push(v); }); });
  const prep = niveaux.map(M => { const o = new Map(); for (const [c, A] of M) { const S = A.slice().sort((a, b) => a - b), [lo, hi] = bornesWinsor(S); o.set(c, { S, lo, hi }); } return o; });
  return L.map((l, i) => {
    const v = vals[i]; if (!fin(v)) return null;
    for (let n = 0; n < 3; n++) { const g = prep[n].get(cle[n](l)); if (g && g.S.length >= MIN_GROUPE) { const x = Math.max(g.lo, Math.min(g.hi, v)), a = lowerBound(g.S, x), b = upperBound(g.S, x), p = (a + (b - a) / 2) / g.S.length * 100; return sens > 0 ? p : 100 - p; } }
    return null;
  });
}
/* tous les facteurs d'une liste de lignes : met l.f = { facteur: score } à partir de l.r (mesures brutes) */
export function calculerFacteurs(L, { secteur = l => l.s || '—', zone = l => l.z || '—', mesures = MESURES } = {}) {
  for (const l of L) l.f = {};
  const cache = {};
  for (const [fac, liste] of Object.entries(mesures)) {
    const P = liste.map(([cle, sens]) => { const k = cle + '|' + sens; return cache[k] || (cache[k] = percentilesNeutres(L, l => (l.r ? l.r[cle] : null), secteur, zone, sens)); });
    L.forEach((l, i) => { const v = P.map(p => p[i]).filter(fin); if (v.length) l.f[fac] = v.reduce((s, x) => s + x, 0) / v.length; });
  }
  return L;
}

/* ───── score composite par horizon ───── */
export function scoreHorizon(f, classe, horizon, { ajust = {} } = {}) {
  const W = (POIDS[classePoids(classe)] || POIDS.action)[horizon] || {}, contrib = []; let s = 0, w = 0, wTot = 0;
  for (const [k, p0] of Object.entries(W)) { const p = p0 * (ajust[k] != null ? ajust[k] : 1); wTot += p; const v = f ? f[k] : null; if (fin(v)) { s += p * v; w += p; contrib.push({ k, poids: p0, score: v, apport: p * (v - 50) }); } }
  return { score: w > 0 ? s / w : null, couverture: wTot > 0 ? w / wTot : 0, contributions: contrib.sort((a, b) => b.apport - a.apport), manquants: Object.keys(W).filter(k => !fin(f ? f[k] : null)) };
}
/* piège à valeur : zone de détresse d'Altman, ou dette nette/EBITDA > 4 avec un momentum à 12 mois très négatif */
export function piegeAValeur(r) {
  if (!r) return null; const raisons = [];
  if (fin(r.z) && r.z < 1.81 && !r.financiere) raisons.push(`Altman Z ${r.z.toFixed(2)} : zone de détresse`);
  if (fin(r.nde) && r.nde > 4 && fin(r.m12) && r.m12 <= -0.25) raisons.push(`dette nette ${r.nde.toFixed(1)} × l’EBITDA et recul de ${Math.abs(r.m12 * 100).toFixed(0)} % sur 12 mois`);
  return raisons.length ? raisons : null;
}
/* verdict complet d'une ligne pour un horizon ; `ligne` = { c (classe), f, r, comp (complétude 0-1), conf0, evt (jours avant les résultats), fon (foncière) } */
export function verdictLigne(ligne, horizon, opts = {}) {
  const classe = classePoids(ligne.c), H = HORIZONS.find(h => h.id === horizon), badges = [], ajustF = ligne.f ? { ...ligne.f } : {};
  if (opts.saison && fin(opts.saison.score)) ajustF.sai = opts.saison.score;
  const base = scoreHorizon(ajustF, classe, horizon, opts), insuffisant = classe === 'action' && fin(ligne.comp) && ligne.comp < 0.6 && horizon !== 'tactique';
  let lib = insuffisant ? LIBELLES.ND : libelleDe(base.score), score = insuffisant ? null : base.score, plafonne = false;
  if (insuffisant) badges.push({ id: 'insuffisant', texte: 'données insuffisantes : aucun verdict' });
  const piege = classe === 'action' && horizon !== 'tactique' ? piegeAValeur(ligne.r) : null;
  if (piege) { badges.push({ id: 'piege', texte: 'risque de piège à valeur : ' + piege.join(' ; ') }); if ((ORDRE_LIBELLE[lib] ?? 5) < ORDRE_LIBELLE[LIBELLES.NEUTRE]) { lib = LIBELLES.NEUTRE; plafonne = true; } }
  if (classe === 'action' && ligne.hyp && H && H.valorisation) badges.push({ id: 'hypothese', texte: 'valeur estimée supérieure à 4 × le prix : hypothèse à vérifier' });
  if (classe === 'action' && fin(ligne.evt) && ligne.evt >= 0 && ligne.evt <= 10 && (horizon === 'tactique' || horizon === 'swing')) badges.push({ id: 'resultats', texte: `résultats attendus dans ${ligne.evt} jour(s)` });
  if (ligne.fon) badges.push({ id: 'fonciere', texte: 'foncière : FFO / ANR indisponibles, modèle limité' });
  /* confiance : couverture des facteurs × complétude × accord entre méthodes de valorisation */
  let conf = base.couverture * (fin(ligne.comp) ? Math.sqrt(Math.max(0, Math.min(1, ligne.comp))) : 0.8) * (H && H.valorisation && fin(ligne.disp) ? 1 - Math.min(0.35, ligne.disp * 0.5) : 1); if (ligne.fon) conf *= 0.6; if (classe !== 'action' && classe !== 'etf') conf *= 0.9;
  conf = Math.round(Math.max(0, Math.min(1, conf)) * 100);
  return { score: score == null ? null : Math.round(score * 10) / 10, lib, conf, confLib: conf >= 70 ? 'haute' : conf >= 45 ? 'moyenne' : 'basse', badges, plafonne, contributions: base.contributions, manquants: base.manquants, couverture: base.couverture };
}

/* ───── « pourquoi » en trois points, générés à partir des chiffres ───── */
const pc = (v, d = 0) => (fin(v) ? (v * 100).toFixed(d).replace('.', ',') + ' %' : '—'), x1 = v => (fin(v) ? v.toFixed(1).replace('.', ',') : '—'), sg = v => (fin(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + ' %' : '—');
const FRASE = {
  val: (r, f) => { const d = []; if (fin(r.per)) d.push('PER ' + x1(r.per)); if (fin(r.fcfY)) d.push('rendement du flux libre ' + pc(r.fcfY, 1)); if (r.financiere && fin(r.pbInv) && r.pbInv > 0) d.push('cours / valeur comptable ' + x1(1 / r.pbInv)); if (fin(r.dy) && r.dy > 0) d.push('dividende ' + pc(r.dy, 1)); return `valeur relative ${f >= 50 ? 'favorable' : 'défavorable'}${d.length ? ' : ' + d.join(', ') : ''}, ${Math.round(f)}ᵉ percentile de son secteur`; },
  qua: (r, f) => { const d = []; if (fin(r.roic)) d.push('ROIC ' + pc(r.roic, 0)); else if (fin(r.roe)) d.push('rentabilité des fonds propres ' + pc(r.roe, 0)); if (fin(r.pk)) d.push('Piotroski ' + r.pk + '/9'); if (fin(r.nde)) d.push('dette nette ' + x1(r.nde) + ' × l’EBITDA'); return `qualité ${f >= 50 ? 'solide' : 'faible'}${d.length ? ' : ' + d.join(', ') : ''}`; },
  mom: (r, f) => `momentum ${f >= 50 ? 'porteur' : 'faible'} : ${sg(r.m12_1)} sur 12-1 mois, ${sg(r.vs200d)} par rapport à la MA200 Daily`,
  gro: (r, f) => `croissance ${f >= 50 ? 'soutenue' : 'faible'} : bénéfice par action ${pc(r.gEps, 0)} par an, chiffre d’affaires ${pc(r.gRev, 0)} par an`,
  ris: (r, f) => `risque ${f >= 50 ? 'modéré' : 'élevé'} : volatilité ${pc(r.vol, 0)}, pire baisse sur 3 ans ${pc(r.mdd3, 0)}`,
  iv: (r, f) => `valeur intrinsèque ${fin(r.mos) ? (r.mos >= 0 ? 'supérieure' : 'inférieure') + ' au prix (marge de sécurité ' + sg(r.mos) + ')' : 'non calculable'}${fin(r.gImp) ? `, le prix suppose déjà ${pc(r.gImp, 1)} de croissance par an` : ''}`,
  moat: (r, f) => `avantage durable ${f >= 50 ? 'visible' : 'incertain'} : ROIC supérieur au coût du capital ${fin(r.roicOk) ? Math.round(r.roicOk * 100) + ' % des années' : '—'}, marges ${f >= 50 ? 'stables' : 'instables'}`,
  bil: (r, f) => `bilan ${f >= 50 ? 'solide' : 'fragile'} : dette nette ${x1(r.nde)} × l’EBITDA, Altman ${x1(r.z)}`,
  mc: (r, f) => `tendance court terme ${f >= 50 ? 'positive' : 'négative'} : ${sg(r.m1)} sur 1 mois, ${sg(r.m3)} sur 3 mois`,
  set: (r, f) => `setup technique ${f >= 50 ? 'favorable' : 'défavorable'} : ${(r.setupWhy || []).slice(0, 2).join(', ') || 'lecture MA200 et supports Daily'}`,
  sai: (r, f) => `saisonnalité ${f >= 50 ? 'favorable' : 'défavorable'} sur la fenêtre choisie`,
  evt: (r, f) => (f < 50 ? 'résultats attendus dans les 10 jours : risque d’écart de cours' : 'pas de résultats annoncés dans les 10 jours'),
  ma: (r, f) => `tendance de fond ${f >= 50 ? 'haussière' : 'baissière'} : ${sg(r.vs200w)} par rapport à la MA200 Weekly`,
  ppp: (r, f) => `valorisation contre la parité de pouvoir d’achat ${f >= 50 ? 'favorable' : 'défavorable'}`, carry: (r, f) => `portage (différentiel de taux) ${f >= 50 ? 'favorable' : 'défavorable'}`,
  erp: (r, f) => `rendement des bénéfices moins taux 10 ans ${f >= 50 ? 'attractif' : 'faible'}`, reel: (r, f) => `taux réels ${f >= 50 ? 'favorables' : 'défavorables'}`, niv: (r, f) => `niveau des taux ${f >= 50 ? 'élevé' : 'bas'} contre son historique`, pente: (r, f) => `pente de courbe ${f >= 50 ? 'favorable' : 'défavorable'}`
};
export function pourquoi(ligne, verdict) {
  const C = verdict.contributions || []; if (!C.length) return ['Pas assez de données pour expliquer ce verdict.'];
  const pos = C.filter(c => c.apport > 0).slice(0, 2), neg = C.filter(c => c.apport < 0).slice(-1), pts = [...pos, ...neg].slice(0, 3), r = ligne.r || {};
  const L = pts.map(c => { const t = (FRASE[c.k] || (() => NOM_FACTEUR[c.k]))(r, c.score); return t.charAt(0).toUpperCase() + t.slice(1) + '.'; });
  if (verdict.badges.some(b => b.id === 'piege')) L.push('Plafonné à « Neutre » : ' + verdict.badges.find(b => b.id === 'piege').texte + '.');
  return L.slice(0, 4);
}
