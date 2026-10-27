import { historiqueReel } from '../tests/aide-btc.mjs';
import { lacunes, regrouper, MS } from '../pc/agent-btc/colonnes.js';
import { preparer, lireMarche, resumeMarche, PHASES } from '../pc/agent-btc/lecture.js';
const { serie } = await historiqueReel({ annees: 4 });
console.log('lacunes', lacunes(serie).map(l => [new Date(l.de).toISOString(), l.manquantes]));
const h1 = regrouper(serie, MS.H1).serie, h4 = regrouper(serie, MS.H4).serie, d1 = regrouper(serie, MS.D1).serie;
console.log('H1', h1.n, 'H4', h4.n, 'D1', d1.n);
let t = Date.now(); const P = preparer(h1); console.log('preparer H1 ms', Date.now() - t);
const cnt = [0, 0, 0, 0]; for (let i = 300; i < P.n; i++) cnt[P.phase[i]]++;
const tot = cnt.reduce((a, b) => a + b, 0); console.log('phases H1 (%)', Object.entries(PHASES).map(([k, n]) => n + ' ' + Math.round(cnt[k] / tot * 100)).join(' | '));
t = Date.now(); const l = lireMarche(serie); console.log('lireMarche ms', Date.now() - t); console.log(resumeMarche(l)); console.log(l.phase.intro, l.phase.raisons);
console.log(JSON.stringify({ vol: l.volume, dir: l.direction, vol2: l.volatilite, ma: l.ma200, profil: l.profil && { poc: l.profil.poc, vah: l.profil.vah, val: l.profil.val, hvn: l.profil.hvn.length, lvn: l.profil.lvn.length } }, null, 0));
// durée moyenne des phases
let run = 0, last = -1; const runs = [[], [], [], []]; for (let i = 300; i < P.n; i++) { if (P.phase[i] === last) run++; else { if (last >= 0) runs[last].push(run); last = P.phase[i]; run = 1; } }
console.log('durée médiane (h) par phase', Object.entries(PHASES).map(([k, n]) => n + ' ' + (runs[k].sort((a, b) => a - b)[runs[k].length >> 1] || 0)).join(' | '));
