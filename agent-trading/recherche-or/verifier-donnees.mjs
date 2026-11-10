/* PHASE 1 : contrôle des données (trous, gaps, cohérence M15 ↔ H1, spread). Écrit RAPPORT-DONNEES-OR.md (local, ignoré par git). */
import fs from 'node:fs'; import { charger, annee } from './donnees.mjs';
const { h1, m15, medianeSpread } = charger(); const H = 3600e3, L = [];
L.push('# Données XAU/USD Dukascopy — contrôle', '', `H1 : ${h1.length} bougies · M15 : ${m15.length} bougies · de ${new Date(h1[0].t).toISOString()} à ${new Date(h1[h1.length - 1].t).toISOString()} (UTC)`, '');
const trous = []; let tropGrand = 0;
for (let i = 1; i < h1.length; i++) { const d = h1[i].t - h1[i - 1].t; if (d > H) { const j = new Date(h1[i - 1].t).getUTCDay(); const weekend = d <= 70 * H && (j === 5 || j === 6 || j === 0); if (!weekend) trous.push({ de: new Date(h1[i - 1].t).toISOString(), heures: d / H - 1 }); } }
L.push(`Trous H1 hors week-end (plus d'une heure manquante) : ${trous.length}`); for (const t of trous.slice(0, 25)) L.push(`- ${t.de} : ${t.heures} h manquantes`);
let incoh = 0, sauts = 0; for (let i = 0; i < h1.length; i++) { const b = h1[i]; if (b.h < Math.max(b.o, b.c) - 1e-9 || b.l > Math.min(b.o, b.c) + 1e-9) incoh++; if (i && Math.abs(b.o - h1[i - 1].c) / h1[i - 1].c > 0.02) sauts++; }
L.push('', `Bougies incohérentes (h/l) : ${incoh} · sauts d'ouverture > 2 % : ${sauts}`);
// cohérence M15 → H1 : le plus haut/plus bas d'une heure = max/min de ses 4 M15
const m = new Map(m15.map(b => [b.t, b])); let comp = 0, ecart = 0, grand = 0;
for (const b of h1) { const q = [0, 1, 2, 3].map(k => m.get(b.t + k * 900e3)).filter(Boolean); if (q.length < 4) continue; comp++; const hh = Math.max(...q.map(x => x.h)), ll = Math.min(...q.map(x => x.l)); const e = Math.max(Math.abs(hh - b.h), Math.abs(ll - b.l)); ecart += e; if (e > 0.5) grand++; }
L.push(`Cohérence M15 ↔ H1 : ${comp} heures comparées, écart moyen sur extrêmes ${(ecart / Math.max(1, comp)).toFixed(3)} $, ${grand} heures avec écart > 0,5 $`);
L.push('', 'Spread observé (ask − bid, médiane par année, $) : ' + Object.entries(medianeSpread).map(([y, v]) => `${y} : ${v.toFixed(2)}`).join(' · '));
const parAn = {}; for (const b of h1) parAn[annee(b.t)] = (parAn[annee(b.t)] || 0) + 1; L.push('', 'Bougies H1 par année : ' + Object.entries(parAn).map(([y, n]) => `${y} : ${n}`).join(' · '));
L.push('', 'Volume : celui de Dukascopy (somme des volumes de ticks en lots, pas un volume de marché réel) : approximation utilisée comme « volume de ticks ».');
fs.writeFileSync(new URL('./RAPPORT-DONNEES-OR.md', import.meta.url), L.join('\n')); console.log(L.join('\n'));
