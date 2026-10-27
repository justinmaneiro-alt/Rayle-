import { historiqueReel } from '../tests/aide-btc.mjs';
import { regrouper, MS } from '../pc/agent-btc/colonnes.js';
import { preparer, PHASES } from '../pc/agent-btc/lecture.js';
const { serie } = await historiqueReel({ annees: 4 });
const essais = [
  ['H4', MS.H4, { erTendance: 0.25, erRange: 0.2, penteTendance: 1.0, penteRange: 2.0, largeurRangeMax: 10, fenetreEr: 30, fenetrePente: 30, fenetreBoite: 60 }],
  ['H4', MS.H4, { erTendance: 0.22, erRange: 0.18, penteTendance: 0.8, penteRange: 1.5, largeurRangeMax: 9, fenetreEr: 30, fenetrePente: 30, fenetreBoite: 60 }],
  ['H4', MS.H4, { erTendance: 0.2, erRange: 0.15, penteTendance: 0.6, penteRange: 1.2, largeurRangeMax: 10, fenetreEr: 24, fenetrePente: 24, fenetreBoite: 48 }],
  ['H1', MS.H1, { erTendance: 0.2, erRange: 0.15, penteTendance: 1.0, penteRange: 2.0, largeurRangeMax: 14, fenetreEr: 96, fenetrePente: 96, fenetreBoite: 144 }],
  ['H1', MS.H1, { erTendance: 0.15, erRange: 0.1, penteTendance: 0.6, penteRange: 1.5, largeurRangeMax: 16, fenetreEr: 96, fenetrePente: 96, fenetreBoite: 144 }],
];
for (const [nom, ms, p] of essais) {
  const s = regrouper(serie, ms).serie, P = preparer(s, p), cnt = [0, 0, 0, 0]; for (let i = 300; i < P.n; i++) cnt[P.phase[i]]++;
  const tot = cnt.reduce((a, b) => a + b, 0); let run = 0, last = -1; const runs = [[], [], [], []]; for (let i = 300; i < P.n; i++) { if (P.phase[i] === last) run++; else { if (last >= 0) runs[last].push(run); last = P.phase[i]; run = 1; } }
  const heures = ms / 3600e3;
  console.log(nom, JSON.stringify(p));
  console.log('  ', Object.entries(PHASES).map(([k, n]) => n + ' ' + Math.round(cnt[k] / tot * 100) + '% (méd ' + Math.round((runs[k].sort((a, b) => a - b)[runs[k].length >> 1] || 0) * heures) + ' h)').join(' | '));
}
