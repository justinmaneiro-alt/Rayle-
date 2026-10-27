import { atr, cumul, delta, efficacite, ema, mediane, penteATR, pivots, plusHaut, plusBas, rangPercentile, sma, sommeGlissante } from './indic.js';
import { MS, regrouper } from './colonnes.js';

/* ═════════════ LECTURE DU MARCHÉ BITCOIN (M3a ; module pur, testé : planetes/mars/tests/agent-lecture-test.mjs) ═════════════
   Volume, direction du volume (delta et CVD), profil de volume (POC, zone de valeur, nœuds haut et bas), structure, volatilité (ATR et son percentile), pente de la MA200 et
   détection de PHASE (range, tendance haussière, tendance baissière, transition) avec la raison en français. Tout est calculé dans le navigateur à partir des bougies réelles,
   par règles : aucune IA, aucun jeton. Ce sont des constats chiffrés, jamais des conseils.
   Les phases sont calculées en H1 (contexte), la MA200 aussi en H4 ; chaque valeur à l'index i n'utilise que les bougies fermées 0..i (causal, vérifié par test). */
export const PHASES = { 0: 'transition', 1: 'tendance haussière', 2: 'tendance baissière', 3: 'range' };
/* Seuils de phase, choisis en regardant la distribution sur 4 ans de bougies réelles (planetes/mars/outils-agent/explo-phase2.mjs) : H1 → ≈ 20 % tendance haussière, 16 % baissière,
   31 % range, 33 % transition, phases de 1 à 2 jours (médiane). Tendance = prix, EMA50 et MA200 alignés + pente de l'EMA50 + efficacité du mouvement ; range = va-et-vient dans une boîte étroite.
   La phase est CONFIRMÉE par hystérésis : elle ne change qu'après `persistance` bougies consécutives d'une autre phase (évite le clignotement). */
export const SEUILS_PHASE = { erTendance: 0.12, erRange: 0.15, penteTendance: 0.8, penteRange: 1.5, largeurRangeMax: 15, fenetreEr: 72, fenetrePente: 48, fenetreBoite: 96, persistance: 8 };
export const SEUILS_PHASE_H4 = { erTendance: 0.18, erRange: 0.2, penteTendance: 0.6, penteRange: 1.2, largeurRangeMax: 11, fenetreEr: 30, fenetrePente: 12, fenetreBoite: 60, persistance: 3 };

/* ── Profil de volume : le volume de chaque bougie est réparti uniformément sur [bas, haut], puis cumulé par tranche de prix ── */
export function profilVolume(s, a = 0, b = s.n, { tranches = 60, part = 0.7 } = {}) {
  let min = Infinity, max = -Infinity;
  for (let i = a; i < b; i++) { if (s.l[i] < min) min = s.l[i]; if (s.h[i] > max) max = s.h[i]; }
  if (!(max > min)) return null;
  const pas = (max - min) / tranches, vol = new Float64Array(tranches);
  for (let i = a; i < b; i++) {
    const lo = s.l[i], hi = s.h[i], v = s.v[i]; if (!(v > 0)) continue;
    const k0 = Math.min(tranches - 1, Math.floor((lo - min) / pas)), k1 = Math.min(tranches - 1, Math.floor((hi - min) / pas));
    if (k0 === k1) { vol[k0] += v; continue; }
    const ep = hi - lo;
    for (let k = k0; k <= k1; k++) { const l0 = Math.max(lo, min + k * pas), l1 = Math.min(hi, min + (k + 1) * pas); if (l1 > l0) vol[k] += v * (l1 - l0) / ep; }
  }
  let total = 0, poc = 0; for (let k = 0; k < tranches; k++) { total += vol[k]; if (vol[k] > vol[poc]) poc = k; }
  if (!(total > 0)) return null;
  // zone de valeur : on part du POC et on s'étend vers la tranche voisine la plus lourde jusqu'à `part` du volume
  let lo = poc, hi = poc, cum = vol[poc];
  while (cum < total * part && (lo > 0 || hi < tranches - 1)) {
    const bas = lo > 0 ? vol[lo - 1] : -1, haut = hi < tranches - 1 ? vol[hi + 1] : -1;
    if (haut >= bas) { hi++; cum += vol[hi]; } else { lo--; cum += vol[lo]; }
  }
  const prix = k => min + (k + 0.5) * pas;
  // nœuds : maxima / minima locaux du profil lissé (3 tranches) ; haut = au moins 1,25 × le volume moyen, bas = au plus 0,6 ×
  const lisse = Array.from(vol, (_, k) => (vol[Math.max(0, k - 1)] + vol[k] + vol[Math.min(tranches - 1, k + 1)]) / 3), moy = total / tranches, hvn = [], lvn = [];
  for (let k = 0; k < tranches; k++) {
    const g = k > 0 ? lisse[k - 1] : -Infinity, d = k < tranches - 1 ? lisse[k + 1] : -Infinity;            // aux bords, le voisin absent ne peut pas être plus gros
    if (lisse[k] > g && lisse[k] >= d && lisse[k] >= 1.25 * moy) hvn.push({ prix: prix(k), volume: vol[k] });
    if (k > 0 && k < tranches - 1 && lisse[k] < lisse[k - 1] && lisse[k] <= lisse[k + 1] && lisse[k] <= 0.6 * moy) lvn.push({ prix: prix(k), volume: vol[k] });
  }
  return { min, max, pas, tranches, poc: prix(poc), vah: min + (hi + 1) * pas, val: min + lo * pas, hvn, lvn, volume: total, niveaux: Array.from(vol, (v, k) => ({ prix: prix(k), volume: v })) };
}

/* ── Contexte d'une série de bougies (H1 ou H4) : toutes les colonnes utiles, calculées UNE fois ── */
export function preparer(s, params = SEUILS_PHASE) {
  const n = s.n, a = atr(s.h, s.l, s.c, 14), ma200 = sma(s.c, 200), ema50 = ema(s.c, 50), ema200 = ema(s.c, 200);
  const er = efficacite(s.c, params.fenetreEr), pente = penteATR(ema50, a, params.fenetrePente), pente200 = penteATR(ma200, a, params.fenetrePente);
  const hh = plusHaut(s.h, params.fenetreBoite), ll = plusBas(s.l, params.fenetreBoite);
  const largeur = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) if (a[i] > 0 && Number.isFinite(hh[i])) largeur[i] = (hh[i] - ll[i]) / a[i];
  const pv = pivots(s.h, s.l, 3), atrPct = new Float64Array(n); for (let i = 0; i < n; i++) atrPct[i] = a[i] > 0 ? a[i] / s.c[i] * 100 : NaN;
  const rang = rangPercentile(atrPct, 720);
  const { d: dl, estime } = delta(s), cvd = cumul(dl);
  const phase = new Uint8Array(n), brut = new Uint8Array(n), structure = new Int8Array(n);                 // structure : 1 sommets et creux montants, -1 descendants, 0 mixte / inconnue
  for (let i = 0; i < n; i++) {
    const hg = pv.haut[i], hp = pv.precHaut[i], bg = pv.bas[i], bp = pv.precBas[i];
    structure[i] = Number.isFinite(hp) && Number.isFinite(bp) ? (hg > hp && bg > bp ? 1 : hg < hp && bg < bp ? -1 : 0) : 0;
    brut[i] = codePhase(s, i, { ma200, ema50, er, pente, largeur }, params);
  }
  let cour = 0, cand = 0, k = 0;                                                  // hystérésis causale
  for (let i = 0; i < n; i++) { if (brut[i] === cour) { cand = cour; k = 0; } else if (brut[i] === cand) { if (++k >= params.persistance) { cour = cand; k = 0; } } else { cand = brut[i]; k = 1; if (params.persistance <= 1) cour = cand; } phase[i] = cour; }
  return { s, n, atr: a, ma200, ema50, ema200, er, pente, pente200, largeur, pv, atrPct, rangATR: rang, delta: dl, deltaEstime: estime, cvd, phase, phaseBrute: brut, structure, params, hh, ll };
}
function codePhase(s, i, c, p) {
  const px = s.c[i], ma = c.ma200[i], e50 = c.ema50[i], er = c.er[i], pente = c.pente[i], larg = c.largeur[i];
  if (!Number.isFinite(ma) || !Number.isFinite(e50) || !Number.isFinite(er) || !Number.isFinite(pente)) return 0;
  if (px > e50 && e50 > ma && pente > p.penteTendance && er >= p.erTendance) return 1;
  if (px < e50 && e50 < ma && pente < -p.penteTendance && er >= p.erTendance) return 2;
  if (er < p.erRange && Math.abs(pente) < p.penteRange && larg <= p.largeurRangeMax) return 3;
  return 0;
}

/* Explication en français de la phase à l'index i (données réelles). */
export function raisonPhase(prep, i) {
  const { s } = prep, c = s.c[i], ma = prep.ma200[i], e50 = prep.ema50[i], er = prep.er[i], pente = prep.pente[i], larg = prep.largeur[i], ph = prep.phase[i], brute = prep.phaseBrute[i], p = prep.params, st = prep.structure[i];
  const f = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  if (!Number.isFinite(ma)) return { phase: 'transition', code: 0, brute: 'transition', raisons: ['Historique trop court pour lire la phase (MA200 indisponible).'] };
  const stTxt = st > 0 ? 'sommets et creux montants' : st < 0 ? 'sommets et creux descendants' : 'structure mixte ou indéterminée';
  const raisons = [
    'Prix ' + (c >= ma ? 'au-dessus de' : 'sous') + ' la MA200 (' + f((c - ma) / ma * 100) + ' %) et ' + (c >= e50 ? 'au-dessus de' : 'sous') + ' l’EMA 50 ; EMA 50 ' + (e50 >= ma ? 'au-dessus de' : 'sous') + ' la MA200',
    'Pente de l’EMA 50 : ' + f(pente, 1) + ' ATR (' + (Math.abs(pente) < p.penteTendance ? 'faible' : pente > 0 ? 'montante' : 'descendante') + ')',
    'Efficacité du mouvement : ' + f(er * 100, 0) + ' % (' + (er >= p.erTendance ? 'mouvement directionnel' : er < p.erRange ? 'va-et-vient' : 'intermédiaire') + ')',
    'Structure : ' + stTxt,
    'Amplitude de la fenêtre : ' + f(larg, 1) + ' ATR' + (larg <= p.largeurRangeMax ? ' (boîte étroite)' : ' (large)')
  ];
  const intro = ph === 1 ? 'Tendance haussière : prix, EMA 50 et MA200 alignés à la hausse, pente montante, mouvement directionnel.'
    : ph === 2 ? 'Tendance baissière : prix, EMA 50 et MA200 alignés à la baisse, pente descendante, mouvement directionnel.'
      : ph === 3 ? 'Range : mouvement en va-et-vient, pente faible, amplitude contenue dans une boîte.'
        : 'Transition : les critères d’une tendance et ceux d’un range ne sont pas réunis (signaux mixtes ou changement en cours).';
  if (brute !== ph) raisons.push('Signal brut actuel : ' + PHASES[brute] + ', pas encore confirmé (la phase ne change qu’après ' + p.persistance + ' bougies consécutives, pour éviter le clignotement)');
  return { phase: PHASES[ph], code: ph, brute: PHASES[brute], enChangement: brute !== ph, intro, raisons };
}

/* ── Lecture complète à partir d'une série M15 (la dernière bougie fermée est la « maintenant » de l'agent) ── */
export function lireMarche(m15, { maintenant = null } = {}) {
  if (!m15 || m15.n < 1200) return { ok: false, raison: 'Historique M15 insuffisant (au moins 1 200 bougies, soit environ 12 jours).' };
  const h1 = regrouper(m15, MS.H1), h4 = regrouper(m15, MS.H4), d1 = regrouper(m15, MS.D1);
  const P1 = preparer(h1.serie), P4 = preparer(h4.serie, SEUILS_PHASE_H4), dm = delta(m15), P15 = { atr: atr(m15.h, m15.l, m15.c, 14), delta: dm.d, deltaEstime: dm.estime, cvd: cumul(dm.d) };
  const i1 = P1.n - 1, i4 = P4.n - 1, i15 = m15.n - 1, px = m15.c[i15];
  const phase = raisonPhase(P1, i1), phase4 = raisonPhase(P4, i4);
  // volume et direction du volume (M15)
  const somme = (x, p) => { let t = 0; for (let i = i15 - p + 1; i <= i15; i++) t += x[i]; return t; };
  const v4h = somme(m15.v, 16), v24h = somme(m15.v, 96), d4h = somme(P15.delta, 16), d24h = somme(P15.delta, 96);
  const sommes4h = sommeGlissante(m15.v, 16), med = mediane(sommes4h.subarray(Math.max(0, i15 - 96 * 30), i15 + 1));
  const volRel = med > 0 ? v4h / med : null;
  const cvd24 = P15.cvd[i15] - P15.cvd[i15 - 96], prix24 = px - m15.c[i15 - 96];
  const divergence = (prix24 > 0 && cvd24 < 0) ? 'baissière (le prix monte, le delta cumulé baisse)' : (prix24 < 0 && cvd24 > 0) ? 'haussière (le prix baisse, le delta cumulé monte)' : null;
  const estime = P15.deltaEstime[i15] === 1;
  // profil de volume des 7 derniers jours (M15) et des 30 derniers
  const pr7 = profilVolume(m15, i15 - 7 * 96 + 1, i15 + 1), pr30 = profilVolume(m15, Math.max(0, i15 - 30 * 96 + 1), i15 + 1);
  // zones importantes autour du prix
  const zones = [];
  if (pr7) { zones.push({ type: 'POC 7 j', prix: pr7.poc }, { type: 'bord haut zone de valeur 7 j', prix: pr7.vah }, { type: 'bord bas zone de valeur 7 j', prix: pr7.val }); for (const n of pr7.hvn) zones.push({ type: 'nœud de volume haut', prix: n.prix }); for (const n of pr7.lvn) zones.push({ type: 'nœud de volume bas', prix: n.prix }); }
  if (Number.isFinite(P1.pv.haut[i1])) zones.push({ type: 'dernier sommet H1', prix: P1.pv.haut[i1] }); if (Number.isFinite(P1.pv.bas[i1])) zones.push({ type: 'dernier creux H1', prix: P1.pv.bas[i1] });
  const jourPrec = d1.serie.n >= 2 ? d1.serie.n - 1 : -1; if (jourPrec >= 0) { zones.push({ type: 'plus haut de la veille', prix: d1.serie.h[jourPrec] }, { type: 'plus bas de la veille', prix: d1.serie.l[jourPrec] }); }
  const atrH1 = P1.atr[i1], au = zones.filter(z => z.prix > px).sort((u, v) => u.prix - v.prix), en = zones.filter(z => z.prix <= px).sort((u, v) => v.prix - u.prix);
  const decor = z => z && { ...z, distanceATR: (Math.abs(z.prix - px) / atrH1), distancePct: Math.abs(z.prix - px) / px * 100 };
  return {
    ok: true, maintenant: maintenant || m15.t[i15] + 900e3, prix: px, derniereBougie: m15.t[i15] + 900e3,
    phase, phaseH4: phase4,
    volume: { v4h, v24h, relatif4h: volRel, note: volRel == null ? null : volRel >= 1.5 ? 'volume nettement supérieur à la normale' : volRel <= 0.6 ? 'volume faible' : 'volume dans la normale' },
    direction: { delta4h: d4h, delta24h: d24h, cvd24h: cvd24, estime, divergence, lecture: d24h > 0 ? 'acheteurs dominants sur 24 h' : d24h < 0 ? 'vendeurs dominants sur 24 h' : 'équilibre' },
    profil: pr7 && { poc: pr7.poc, vah: pr7.vah, val: pr7.val, hvn: pr7.hvn.map(n => n.prix), lvn: pr7.lvn.map(n => n.prix), jours: 7, profil30: pr30 && { poc: pr30.poc, vah: pr30.vah, val: pr30.val } },
    structure: { h1: P1.structure[i1] > 0 ? 'sommets et creux montants' : P1.structure[i1] < 0 ? 'sommets et creux descendants' : 'mixte', h4: P4.structure[i4] > 0 ? 'sommets et creux montants' : P4.structure[i4] < 0 ? 'sommets et creux descendants' : 'mixte', dernierSommet: P1.pv.haut[i1], dernierCreux: P1.pv.bas[i1] },
    volatilite: { atrH1, atrH1Pct: P1.atrPct[i1], percentile: P1.rangATR[i1], atrM15: P15.atr[i15], note: P1.rangATR[i1] >= 0.8 ? 'volatilité élevée' : P1.rangATR[i1] <= 0.2 ? 'volatilité basse' : 'volatilité moyenne' },
    ma200: { h1: P1.ma200[i1], h4: P4.ma200[i4], penteH1ATR: P1.pente[i1], penteH4ATR: P4.pente[i4], penteH4Pct: Number.isFinite(P4.ma200[i4]) && Number.isFinite(P4.ma200[i4 - 30]) ? (P4.ma200[i4] - P4.ma200[i4 - 30]) / P4.ma200[i4 - 30] * 100 : null },
    zones: { dessus: decor(au[0]) || null, dessous: decor(en[0]) || null, toutes: zones },
    ctx: { h1, h4, d1 }
  };
}

/* ── Phrases d'état (modèles de phrases, sans IA) ── */
export function resumeMarche(l) {
  if (!l || !l.ok) return l && l.raison || 'Lecture indisponible.';
  const f = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const z = l.zones;
  return 'Bitcoin à ' + f(l.prix) + ' dollars. Phase : ' + l.phase.phase + ' (H1), ' + l.phaseH4.phase + ' (H4). Volume : ' + l.volume.note + '. Delta ' + (l.direction.estime ? 'estimé' : 'réel') + ' : ' + l.direction.lecture + '. Volatilité : ' + l.volatilite.note + '.'
    + (z.dessus ? ' Prochaine zone au-dessus : ' + z.dessus.type + ' à ' + f(z.dessus.prix) + '.' : '') + (z.dessous ? ' En dessous : ' + z.dessous.type + ' à ' + f(z.dessous.prix) + '.' : '');
}
