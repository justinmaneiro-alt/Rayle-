import * as I from '../pc/agent-btc/indic.js';
import { PHASES, SEUILS_PHASE, lireMarche, preparer, profilVolume, raisonPhase, resumeMarche } from '../pc/agent-btc/lecture.js';
import { MS, depuisBougies, regrouper, tranche } from '../pc/agent-btc/colonnes.js';
import { bougiesSynth, marcheMixte, serieSynth, T0 } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const egal = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

const S = marcheMixte(6000, 4);

// ── indicateurs : valeurs connues ──
v('SMA : moyenne des p dernières', (() => { const m = I.sma(Float64Array.from([1, 2, 3, 4, 5]), 3); return Number.isNaN(m[1]) && m[2] === 2 && m[4] === 4; })());
v('EMA : amorcée par la moyenne simple (comme TradingView)', (() => { const e = I.ema(Float64Array.from([1, 2, 3, 4, 5]), 3); return e[2] === 2 && egal(e[3], 3) && egal(e[4], 4); })());
v('ATR de Wilder : 1re valeur = moyenne des vraies amplitudes', (() => { const h = Float64Array.from([10, 12, 11]), l = Float64Array.from([8, 9, 9]), c = Float64Array.from([9, 11, 10]); const a = I.atr(h, l, c, 2); return Number.isNaN(a[0]) && egal(a[1], (2 + 3) / 2) && egal(a[2], (2.5 * 1 + Math.max(2, 0, 2)) / 2); })());
v('plus haut / plus bas glissants (bougie courante incluse) et « avant » (exclue)', (() => { const x = Float64Array.from([1, 5, 3, 4]); return I.plusHaut(x, 3)[3] === 5 && I.plusBas(x, 3)[3] === 3 && I.plusHautAvant(x, 2)[3] === 5 && I.plusBasAvant(x, 2)[3] === 3; })());
v('efficacité : 1 sur un trait droit, ≈ 0 sur un va-et-vient', I.efficacite(Float64Array.from({ length: 30 }, (_, i) => i), 10)[29] === 1 && I.efficacite(Float64Array.from({ length: 30 }, (_, i) => i % 2), 10)[29] < 0.15);
v('rang percentile : le maximum est au rang 1', (() => { const x = Float64Array.from({ length: 100 }, (_, i) => i); return I.rangPercentile(x, 50)[99] === 1; })());
v('delta réel = 2 × volume acheteur − volume', (() => { const s = depuisBougies([{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10, vb: 7 }]); const d = I.delta(s); return d.d[0] === 4 && d.estime[0] === 0; })());
v('delta ESTIMÉ sans volume acheteur : clôture au plus haut = tout acheteur, au plus bas = tout vendeur, milieu = 0', (() => { const s = depuisBougies([{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10, vb: NaN }, { t: 1, o: 2, h: 2, l: 1, c: 1, v: 10, vb: NaN }, { t: 2, o: 1, h: 2, l: 1, c: 1.5, v: 10, vb: NaN }]); const d = I.delta(s); return egal(d.d[0], 10) && egal(d.d[1], -10) && egal(d.d[2], 0) && d.estime[0] === 1; })());
v('CVD = somme cumulée du delta', (() => { const c = I.cumul(Float64Array.from([1, -2, 3])); return c[0] === 1 && c[1] === -1 && c[2] === 2; })());
v('pivots : un sommet n’est connu que k bougies plus tard (jamais de regard vers le futur)', (() => {
  const h = Float64Array.from([1, 2, 3, 9, 3, 2, 1, 1, 1]), l = h.map(x => x - 0.5), p = I.pivots(h, l, 3);
  return Number.isNaN(p.haut[5]) && p.haut[6] === 9 && p.idxHaut[6] === 3;
})());

// ── LE test du futur : toute valeur à l'index i reste identique quand tout ce qui suit est remplacé par du poison ──
function poison(s, i) { const o = { n: s.n }; for (const k of ['t', 'o', 'h', 'l', 'c', 'v', 'vb']) { o[k] = s[k].slice(); } for (let j = i + 1; j < s.n; j++) { o.o[j] = o.h[j] = o.l[j] = o.c[j] = 1e9 * (j % 2 ? 1 : 1e-9); o.v[j] = 1e12; o.vb[j] = 0; } return o; }
const cols = { sma: s => I.sma(s.c, 50), ema: s => I.ema(s.c, 50), atr: s => I.atr(s.h, s.l, s.c, 14), pH: s => I.plusHaut(s.h, 20), pB: s => I.plusBas(s.l, 20), pHa: s => I.plusHautAvant(s.h, 20), pBa: s => I.plusBasAvant(s.l, 20), er: s => I.efficacite(s.c, 30), pente: s => I.penteATR(I.ema(s.c, 50), I.atr(s.h, s.l, s.c), 20),
  rang: s => I.rangPercentile(I.atr(s.h, s.l, s.c), 200), delta: s => I.delta(s).d, cvd: s => I.cumul(I.delta(s).d), pivH: s => I.pivots(s.h, s.l, 3).haut, pivB: s => I.pivots(s.h, s.l, 3).bas, somme: s => I.sommeGlissante(s.v, 16) };
for (const [nom, f] of Object.entries(cols)) {
  const plein = f(S); let bon = true;
  for (const i of [400, 1234, 3000, 5000]) { const p = f(poison(S, i)); if (!egal(plein[i], p[i])) { bon = false; break; } }
  v('causal (aucun regard vers le futur) : ' + nom, bon);
}
{
  const plein = preparer(regrouper(S, MS.H1).serie); let bon = true;
  for (const i of [200, 400, 800, 1200]) { const t = regrouper(S, MS.H1).serie, p = preparer(poison(t, i)); for (const k of ['phase', 'phaseBrute', 'structure', 'er', 'pente', 'largeur', 'atrPct']) if (!egal(plein[k][i], p[k][i])) bon = false; }
  v('causal : phases, structure, efficacité, pente, amplitude (préparation complète)', bon);
  const t = regrouper(S, MS.H1).serie; let bon2 = true;
  for (const i of [300, 700, 1100]) { const court = preparer(tranche(t, 0, i + 1)); if (court.phase[i] !== plein.phase[i]) bon2 = false; }
  v('causal : la phase à l’index i est la même sur une série coupée en i', bon2);
}

// ── profil de volume : histogramme connu ──
{
  const b = []; for (let k = 0; k < 60; k++) b.push({ t: T0 + k * 900e3, o: 100, h: 101, l: 100, c: 100.5, v: 1, vb: 0.5 });    // gros volume sur 100-101
  for (let k = 60; k < 80; k++) b.push({ t: T0 + k * 900e3, o: 110, h: 111, l: 110, c: 110.5, v: 1, vb: 0.5 });
  for (let k = 80; k < 90; k++) b.push({ t: T0 + k * 900e3, o: 100, h: 111, l: 100, c: 105, v: 0.5, vb: 0.25 });
  const p = profilVolume(depuisBougies(b), 0, b.length, { tranches: 22 });
  v('profil : POC dans la zone la plus chargée (100-101)', p.poc >= 100 && p.poc <= 101.1, p.poc);
  v('profil : la zone de valeur contient le POC et ~70 % du volume', p.val <= p.poc && p.poc <= p.vah && (() => { let t = 0, d = 0; for (const n of p.niveaux) { t += n.volume; if (n.prix >= p.val - 1e-9 && n.prix <= p.vah + 1e-9) d += n.volume; } return d / t >= 0.68; })());
  v('profil : nœuds de volume haut (100 et 110) et bas (entre les deux)', p.hvn.length >= 2 && p.lvn.some(n => n.prix > 101 && n.prix < 110), JSON.stringify([p.hvn.map(n => n.prix.toFixed(1)), p.lvn.map(n => n.prix.toFixed(1))]));
  v('profil : le volume total est conservé', Math.abs(p.volume - b.reduce((a, x) => a + x.v, 0)) < 1e-6);
  v('profil : marché plat (haut = bas) → null, pas de division par zéro', profilVolume(depuisBougies([{ t: 0, o: 5, h: 5, l: 5, c: 5, v: 1, vb: 0 }]), 0, 1) === null);
}

// ── phases sur des marchés synthétiques à régime connu ──
function pourcentages(segments, graine = 1) {
  const s = regrouper(serieSynth({ segments, graine }), MS.H1).serie, P = preparer(s), cnt = [0, 0, 0, 0]; const dep = 400;
  for (let i = dep; i < P.n; i++) cnt[P.phase[i]]++; const tot = cnt.reduce((a, b) => a + b, 0); return cnt.map(x => x / tot);
}
const pr = pourcentages([{ n: 24000, derive: 0, bruit: 0.2, volume: 100, retour: 0.012, ancre: 40000 }]);
v('marché qui revient toujours à son niveau (va-et-vient) : « range » domine, presque jamais de tendance', pr[3] > 0.55 && pr[1] + pr[2] < 0.15, JSON.stringify(pr.map(x => +x.toFixed(2))));
const pm = pourcentages([{ n: 24000, derive: 0, bruit: 0.2, volume: 100 }]);
v('marche aléatoire pur : la phase ne prétend pas une tendance durable (moins de 45 % de tendances)', pm[1] + pm[2] < 0.45, JSON.stringify(pm.map(x => +x.toFixed(2))));
const ph = pourcentages([{ n: 24000, derive: 0.012, bruit: 0.15, volume: 100 }]);
v('hausse régulière : « tendance haussière » domine', ph[1] > 0.6 && ph[2] < 0.05, JSON.stringify(ph.map(x => +x.toFixed(2))));
const pb = pourcentages([{ n: 24000, derive: -0.012, bruit: 0.15, volume: 100 }]);
v('baisse régulière : « tendance baissière » domine', pb[2] > 0.6 && pb[1] < 0.05, JSON.stringify(pb.map(x => +x.toFixed(2))));
{
  const H = regrouper(marcheMixte(30000, 6), MS.H1).serie, P = preparer(H); let flips = 0, brutFlips = 0; for (let i = 401; i < P.n; i++) { if (P.phase[i] !== P.phase[i - 1]) flips++; if (P.phaseBrute[i] !== P.phaseBrute[i - 1]) brutFlips++; }
  v('hystérésis : la phase confirmée change nettement moins que le signal brut', flips < brutFlips * 0.6 && flips > 5, flips + ' contre ' + brutFlips);
}
{
  const H = regrouper(marcheMixte(30000, 6), MS.H1).serie, P = preparer(H), i = 2000, r = raisonPhase(P, i);
  v('raison de la phase : phrase d’introduction et 5 constats chiffrés en français', typeof r.intro === 'string' && r.raisons.length >= 5 && /ATR/.test(r.raisons[1]) && /%/.test(r.raisons[2]) && Object.values(PHASES).includes(r.phase), JSON.stringify(r));
}

// ── lecture complète ──
{
  const l = lireMarche(S);
  v('lecture : ok, prix = dernière clôture', l.ok && l.prix === S.c[S.n - 1] && l.derniereBougie === S.t[S.n - 1] + 900e3);
  v('lecture : phase H1 et H4 avec raison', typeof l.phase.phase === 'string' && l.phase.raisons.length >= 5 && typeof l.phaseH4.phase === 'string');
  v('lecture : volume (4 h, 24 h, relatif) et direction (delta 4 h / 24 h, CVD, réel ou estimé)', l.volume.v24h > 0 && Number.isFinite(l.volume.relatif4h) && Number.isFinite(l.direction.delta24h) && Number.isFinite(l.direction.cvd24h) && l.direction.estime === false);
  v('lecture : profil de volume (POC, zone de valeur haute et basse, nœuds)', l.profil.poc > 0 && l.profil.vah > l.profil.poc && l.profil.val < l.profil.poc && Array.isArray(l.profil.hvn) && Array.isArray(l.profil.lvn));
  v('lecture : volatilité (ATR, percentile) et pente de la MA200', l.volatilite.atrH1 > 0 && l.volatilite.percentile >= 0 && l.volatilite.percentile <= 1 && Number.isFinite(l.ma200.penteH4ATR) && l.ma200.h4 > 0);
  v('lecture : zone importante au-dessus et en dessous du prix, avec distance', (!l.zones.dessus || l.zones.dessus.prix > l.prix) && (!l.zones.dessous || l.zones.dessous.prix <= l.prix) && (l.zones.dessus || l.zones.dessous));
  v('lecture : résumé en français, mentionne la phase et le delta', /Phase : /.test(resumeMarche(l)) && /Delta (réel|estimé)/.test(resumeMarche(l)));
  const sansVb = depuisBougies(bougiesSynth({ segments: [{ n: 6000, derive: 0.001, volume: 100 }], graine: 4, avecVb: false }));
  v('lecture sans volume acheteur : delta étiqueté « estimé »', lireMarche(sansVb).direction.estime === true && /Delta estimé/.test(resumeMarche(lireMarche(sansVb))));
  v('lecture : historique trop court = refus honnête, rien d’inventé', lireMarche(tranche(S, 0, 500)).ok === false && /insuffisant/.test(lireMarche(tranche(S, 0, 500)).raison));
}

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
