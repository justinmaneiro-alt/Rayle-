/* STATISTIQUES RÉELLES de scenarios-v1 (Dukascopy XAU/USD, H1, bougies plates de week-end retirées) — STRATEGIE-RAYLE.md §7.
   1) CÔNE : pour chaque régime de volatilité (tercile de l'ATR sur les 500 dernières bougies), amplitude réelle depuis la clôture : excursion maximale vers le haut et vers le bas (en ATR) atteinte au plus tard à la
      bougie h (h = 1 à 120), percentiles 50 % et 80 % ; chaque bougie est un échantillon (distribution marginale, les échantillons voisins se recouvrent sans biaiser les percentiles).
   2) PREMIER PASSAGE : pour chaque couple (niveau haut à a ATR, niveau bas à b ATR) de la grille {0,5 ; 1 ; 1,5 ; 2 ; 3}, fréquence avec laquelle le HAUT est touché avant le BAS dans les 24, 72 ou 120 bougies
      suivantes (touche de la mèche ; les deux dans la même bougie = non tranché), par état de tendance H1/H4 (haussier si les deux le sont, baissier si les deux le sont, sinon mixte) et position de la clôture par
      rapport à la SMA 200 H1. Échantillons espacés de 24 bougies. Comparée TOUJOURS à la valeur du hasard b / (a + b). 18 derniers mois ET 2015–2025 séparément ; nT < 30 = « pas assez de données ».
   Écrit front/or/scenarios-stats.json et RAPPORT-SCENARIOS-OR.md (local). */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { charger } from './donnees.mjs'; import * as S from '../front/or/scenarios-v1.js'; import { atrSerie, analyser as analyserStructure } from '../front/or/structure-marche-v1.js'; import { smaH1, tendanceH4 } from '../front/or/ma-evenements-v1.js';
const H = 3600e3, FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] }, MAXH = 120, HOR = [24, 72, 120], G = S.P.grille;
const ouvert = b => !(b.h === b.l && !b.v);
const D = charger({ debut: 2014, fin: 2026 }), B = D.h1.filter(ouvert).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), n = B.length;
const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/scenarios-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const A = atrSerie(B), T1 = analyserStructure(B, { periode: H }).tendance, T4 = tendanceH4(B, H), MA = smaH1(B), dans = (t, f) => t >= FEN[f][0] && t < FEN[f][1];
// ── cône ──
const reg = new Array(n).fill(null); for (let i = 0; i < n; i++) reg[i] = S.regimeVol(A, i);
const echH = { bas: [], moyen: [], haut: [] }, echB = { bas: [], moyen: [], haut: [] }; for (const r of Object.keys(echH)) for (let h = 0; h < MAXH; h++) { echH[r].push([]); echB[r].push([]); }
for (let i = 500; i < n - MAXH; i++) { const r = reg[i]; if (!r || !A[i]) continue; let mh = 0, mb = 0; for (let h = 1; h <= MAXH; h++) { const b = B[i + h]; mh = Math.max(mh, (b.h - B[i].c) / A[i]); mb = Math.max(mb, (B[i].c - b.l) / A[i]); echH[r][h - 1].push(mh); echB[r][h - 1].push(mb); } }
const pct = (v, p) => { v.sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : null; }, r2 = x => (x == null ? null : Math.round(x * 100) / 100);
const cone = {}; for (const r of Object.keys(echH)) { cone[r] = { n: echH[r][0].length, p50h: [], p50b: [], p80h: [], p80b: [] }; for (let h = 0; h < MAXH; h++) { cone[r].p50h.push(r2(pct(echH[r][h], 0.5))); cone[r].p50b.push(r2(pct(echB[r][h], 0.5))); cone[r].p80h.push(r2(pct(echH[r][h], 0.8))); cone[r].p80b.push(r2(pct(echB[r][h], 0.8))); } }
// ── premier passage ──
const cellules = {}; const cle = (fen, N, et, sm) => `${fen}|${N}|${et}|${sm}`;
const cel = (fen, N, et, sm, k) => { const c = cle(fen, N, et, sm); const X = cellules[c] || (cellules[c] = {}); return X[k] || (X[k] = { n: 0, nT: 0, k: 0, durees: [] }); };
for (let i = 400; i < n - MAXH - 1; i += S.P.echantillonPas) {
  const a0 = A[i]; if (!a0 || MA[i] == null) continue; const c0 = B[i].c, etat = S.etatTendance(T1[i], T4[i]), sma = c0 >= MA[i] ? '1' : '-1';
  const tUp = G.map(() => Infinity), tDn = G.map(() => Infinity); let mh = -Infinity, ml = -Infinity;
  for (let h = 1; h <= MAXH; h++) { const b = B[i + h]; mh = Math.max(mh, b.h - c0); ml = Math.max(ml, c0 - b.l); G.forEach((g, q) => { if (tUp[q] === Infinity && mh >= g * a0) tUp[q] = h; if (tDn[q] === Infinity && ml >= g * a0) tDn[q] = h; }); }
  for (const fen of ['recent', 'long']) { if (!dans(B[i].t, fen)) continue;
    for (const N of HOR) for (let qa = 0; qa < G.length; qa++) for (let qb = 0; qb < G.length; qb++) {
      const u = tUp[qa] <= N ? tUp[qa] : Infinity, d = tDn[qb] <= N ? tDn[qb] : Infinity, kk = S.cleCellule(G[qa], G[qb]);
      for (const [et, sm] of [[etat, sma], [etat, 'tous'], ['tous', sma], ['tous', 'tous']]) { const x = cel(fen, N, et, sm, kk); x.n++; if (u === Infinity && d === Infinity) continue; if (u === d) continue; x.nT++; if (u < d) x.k++; x.durees.push(Math.min(u, d)); }
    } }
}
const ppp = { recent: {}, long: {} };
for (const [c, X] of Object.entries(cellules)) { const [fen, N, et, sm] = c.split('|'); ((ppp[fen][N] ||= {})[et] ||= {})[sm] = {}; for (const [kk, x] of Object.entries(X)) { const d = x.durees.sort((a, b) => a - b); ppp[fen][N][et][sm][kk] = { n: x.n, nT: x.nT, k: x.k, mediane: d.length ? d[d.length >> 1] : null }; } }
const sortie = { version: S.VERSION, sha256: sha, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1, sans les bougies plates de week-end', fenetres: { recent: "2025-05-01 → aujourd'hui (18 mois)", long: '2015–2025' }, nBougies: n, grille: G, horizons: HOR, cone, ppp };
fs.writeFileSync(new URL('../front/or/scenarios-stats.json', import.meta.url), JSON.stringify(sortie));
// ── rapport ──
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %'), L = [`# Scénarios — statistiques réelles`, '', `Dukascopy XAU/USD H1 (${n} bougies). Règle ${S.VERSION} (SHA-256 ${sha.slice(0, 12)}…). Calculé le ${sortie.calcule}. Échantillons espacés de ${S.P.echantillonPas} bougies.`, '', '## Cône de volatilité (excursion maximale depuis la clôture, en ATR)', '', '| régime | échantillons | h | haut p50 | haut p80 | bas p50 | bas p80 |', '|---|---|---|---|---|---|---|'];
for (const r of ['bas', 'moyen', 'haut']) for (const h of HOR) L.push(`| ${r} | ${cone[r].n} | ${h} | ${cone[r].p50h[h - 1]} | ${cone[r].p80h[h - 1]} | ${cone[r].p50b[h - 1]} | ${cone[r].p80b[h - 1]} |`);
L.push('', '## Premier passage : le HAUT (a ATR) est touché avant le BAS (b ATR), tous contextes', '', 'Hasard = b / (a + b). Verdict : « écart net » seulement si l\'intervalle de Wilson exclut le hasard.', '');
let nets = 0, tot = 0, haut = 0, bas = 0;
for (const fen of ['long', 'recent']) for (const N of HOR) { L.push(`### ${fen === 'long' ? '2015–2025' : '18 derniers mois'} · ${N} bougies`, '', '| a (haut) | b (bas) | nT | haut d\'abord | IC 95 % | hasard | médiane (bougies) | verdict |', '|---|---|---|---|---|---|---|---|');
  for (const a of G) for (const b of G) { const c = ppp[fen][N].tous.tous[S.cleCellule(a, b)]; if (!c) continue; const hasard = b / (a + b), ic = S.wilson(c.k, c.nT), tx = c.nT ? c.k / c.nT : null; const v = c.nT < 30 ? 'pas assez de données' : ic[0] > hasard ? 'au-dessus du hasard' : ic[1] < hasard ? 'en dessous du hasard' : 'écart non net'; if (c.nT >= 30) { tot++; if (v === 'au-dessus du hasard') { nets++; haut++; } else if (v === 'en dessous du hasard') { nets++; bas++; } } L.push(`| ${a} | ${b} | ${c.nT} | ${pc(tx)} | ${c.nT ? pc(ic[0]) + '–' + pc(ic[1]) : '—'} | ${pc(hasard)} | ${c.mediane ?? '—'} | ${v} |`); }
  L.push(''); }
L.push(`**Bilan : sur ${tot} cellules (nT ≥ 30), ${nets} s'écartent nettement du hasard (${haut} au-dessus, ${bas} en dessous).** Les échantillons se recouvrent pour les longs horizons : les intervalles sont un peu trop étroits, lecture prudente.`);
fs.writeFileSync(new URL('./RAPPORT-SCENARIOS-OR.md', import.meta.url), L.join('\n') + '\n'); console.log(L.slice(0, 14).join('\n')); console.log(L[L.length - 1]);
