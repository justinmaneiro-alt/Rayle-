import { historiqueReel } from '../tests/aide-btc.mjs';
import { regrouper, MS } from '../pc/agent-btc/colonnes.js';
import { atr, efficacite, ema, sma, penteATR, plusHaut, plusBas, pivots } from '../pc/agent-btc/indic.js';
const { serie } = await historiqueReel({ annees: 4 });
function essai(nom, ms, p) {
  const s = regrouper(serie, ms).serie, n = s.n, a = atr(s.h, s.l, s.c, 14), m200 = sma(s.c, 200), e50 = ema(s.c, 50);
  const er = efficacite(s.c, p.fe), pe = penteATR(e50, a, p.fp), hh = plusHaut(s.h, p.fb), ll = plusBas(s.l, p.fb);
  const pv = pivots(s.h, s.l, 3);
  const brut = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!(m200[i] > 0) || !Number.isFinite(pe[i]) || !Number.isFinite(er[i])) continue;
    const larg = (hh[i] - ll[i]) / a[i], c = s.c[i];
    if (c > e50[i] && e50[i] > m200[i] && pe[i] > p.pt && er[i] >= p.et) brut[i] = 1;
    else if (c < e50[i] && e50[i] < m200[i] && pe[i] < -p.pt && er[i] >= p.et) brut[i] = 2;
    else if (er[i] < p.er && Math.abs(pe[i]) < p.pr && larg <= p.lr) brut[i] = 3;
  }
  // hystérésis : la phase confirmée ne change qu'après `persist` bougies consécutives d'une autre phase
  const conf = new Uint8Array(n); let cur = 0, cand = 0, k = 0;
  for (let i = 0; i < n; i++) { if (brut[i] === cur) { cand = brut[i]; k = 0; } else if (brut[i] === cand) { k++; if (k >= p.persist) { cur = cand; k = 0; } } else { cand = brut[i]; k = 1; if (p.persist <= 1) { cur = cand; } } conf[i] = cur; }
  const cnt = [0, 0, 0, 0]; for (let i = 300; i < n; i++) cnt[conf[i]]++; const tot = cnt.reduce((x, y) => x + y, 0);
  let run = 0, last = -1; const runs = [[], [], [], []]; for (let i = 300; i < n; i++) { if (conf[i] === last) run++; else { if (last >= 0) runs[last].push(run); last = conf[i]; run = 1; } }
  const hr = ms / 3600e3, N = ['transition', 'haussière', 'baissière', 'range'];
  console.log(nom, JSON.stringify(p)); console.log('   ', N.map((x, j) => x + ' ' + Math.round(cnt[j] / tot * 100) + '% (méd ' + Math.round((runs[j].sort((u, v) => u - v)[runs[j].length >> 1] || 0) * hr) + ' h)').join(' | '));
}
essai('H4', MS.H4, { fe: 30, fp: 12, fb: 60, pt: 0.8, et: 0.2, er: 0.2, pr: 1.2, lr: 10, persist: 3 });
essai('H4', MS.H4, { fe: 30, fp: 12, fb: 60, pt: 0.6, et: 0.18, er: 0.2, pr: 1.2, lr: 11, persist: 3 });
essai('H4', MS.H4, { fe: 24, fp: 12, fb: 48, pt: 0.6, et: 0.18, er: 0.18, pr: 1.0, lr: 9, persist: 3 });
essai('H1', MS.H1, { fe: 72, fp: 48, fb: 96, pt: 1.0, et: 0.15, er: 0.15, pr: 1.5, lr: 14, persist: 6 });
essai('H1', MS.H1, { fe: 72, fp: 48, fb: 96, pt: 0.8, et: 0.12, er: 0.15, pr: 1.5, lr: 15, persist: 8 });
