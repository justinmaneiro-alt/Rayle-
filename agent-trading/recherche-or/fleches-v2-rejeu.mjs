/* Rejeu des flèches v2 sur l'historique or H1 de novembre 2026 : zones H1 = EXACTEMENT celles du graphique (niveauxPeriode H1 → selectionV6 → zonesAffichage).
   node agent-trading/recherche-or/fleches-v2-rejeu.mjs   → RAPPORT-FLECHES-V2.md + fleches-v2-annote.png + fleches-v2-liste.json */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { charger } from './donnees.mjs';
import { zonesDessinees } from './zones-h1-rejeu.mjs';
import * as V1 from '../front/or/fleches-lecture-v1.js';
import * as V2 from '../front/or/fleches-lecture-v2.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
const D = charger({ debut: 2026, fin: 2026 }), B = D.h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
const now = B[B.length - 1].t + H, cs = B;

const Z = zonesDessinees(B, now);
const R = V2.calculer(B, Z, { maintenant: now }), F = R.fleches;
const R1 = V1.calculer(B, { maintenant: now }), F1 = R1.fleches;
const parType = L => L.reduce((o, f) => (o[f.type] = (o[f.type] || 0) + 1, o), {});
const max600 = L => { let m = 0; for (let d = 0; d + 600 <= B.length; d += 6) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
const dernieres600 = L => L.filter(f => f.i >= B.length - 600).length;
const ids = new Set(Z.map(V2.idNiveau));
const sansNiveau = F.filter(f => f.levelId !== 'MA200' && !ids.has(f.levelId));
const dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const fmt = x => x == null ? '' : x.toFixed(1);
const liste = F.map(f => ({ date: dt(f.tCloture), type: f.type, sens: f.dir > 0 ? 'haussier' : 'baissier', prix: +f.prix.toFixed(1), niveau: f.levelId, zone: f.zoneBas != null ? `${fmt(f.zoneBas)}–${fmt(f.zoneHaut)}` : '', issue: f.issue, fav6: f.resultat[6] ? f.resultat[6].fav : null, adv6: f.resultat[6] ? f.resultat[6].adv : null }));
fs.writeFileSync(path.join(ici, 'fleches-v2-liste.json'), JSON.stringify({ zones: Z.map(z => ({ ...z, tDebut: dt(z.tDebut), tFin: z.tFin ? dt(z.tFin) : null })), fleches: liste }, null, 1));

/* image annotée : bougies H1 des 600 dernières, zones, MA200, flèches */
const N = 600, deb = Math.max(0, B.length - N), S = B.slice(deb), M = V1.sma(B).slice(deb);
const lo = Math.min(...S.map(b => b.l)) - 10, hi = Math.max(...S.map(b => b.h)) + 10, W = 1800, Hh = 800, mg = 50, xr = i => mg + (i - deb) / (N - 1) * (W - 2 * mg), yr = p => Hh - mg - (p - lo) / (hi - lo) * (Hh - 2 * mg);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#0b0f14;font-family:sans-serif">`;
for (const z of Z) { const tf = z.tFin ?? B[B.length - 1].t, x0 = Math.max(mg, xr(B.findIndex(b => b.t >= z.tDebut))), x1 = Math.min(W - mg, z.tFin ? xr(B.findIndex(b => b.t >= z.tFin)) : W - mg); if (!(x1 > x0) || z.haut < lo || z.bas > hi) continue; const col = z.cote === 'support' ? '79,209,139' : '224,90,90'; svg += `<rect x="${x0}" y="${yr(z.haut)}" width="${x1 - x0}" height="${Math.max(2, yr(z.bas) - yr(z.haut))}" fill="rgba(${col},${z.actif ? .22 : .10})"/><text x="${x0 + 3}" y="${yr(z.haut) - 2}" fill="rgb(${col})" font-size="10">${z.cote === 'support' ? 'S' : 'R'} ${Math.round(z.bas)}–${Math.round(z.haut)}${z.retournee ? ' (ret.)' : ''}</text>`; }
for (let k = 0; k < S.length; k++) { const b = S[k], x = xr(deb + k), up = b.c >= b.o; svg += `<line x1="${x}" x2="${x}" y1="${yr(b.h)}" y2="${yr(b.l)}" stroke="${up ? '#4fd18b' : '#e05a5a'}" stroke-width="1"/><rect x="${x - 1.2}" y="${yr(Math.max(b.o, b.c))}" width="2.4" height="${Math.max(1, Math.abs(yr(b.o) - yr(b.c)))}" fill="${up ? '#4fd18b' : '#e05a5a'}"/>`; }
svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.5" points="${M.map((m, k) => m == null ? '' : `${xr(deb + k)},${yr(m)}`).filter(Boolean).join(' ')}"/>`;
for (const f of F.filter(f => f.i >= deb)) { const x = xr(f.i), up = f.dir > 0, y = up ? yr(B[f.i].l) + 14 : yr(B[f.i].h) - 14, ma = f.type.startsWith('ma_'), col = ma ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'; svg += `<path d="M${x},${up ? y - 12 : y + 12} l-6,${up ? 12 : -12} h12 z" fill="${col}"/><text x="${x}" y="${up ? y + 12 : y - 16}" fill="${col}" font-size="10" text-anchor="middle">${dt(f.tCloture).slice(0, 5)}${ma ? ' MA' : f.type === 'rebond2' ? ' 2b' : ''}</text>`; }
svg += `</svg>`;
fs.writeFileSync(path.join(ici, 'fleches-v2-annote.svg'), svg);
let png = false;
try { const req = createRequire(path.resolve(ici, '..', '..', 'tests-navigateur', 'package.json')), pup = req('puppeteer-core'), nav = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }), pg = await nav.newPage(); await pg.setViewport({ width: W, height: Hh }); await pg.setContent('<body style="margin:0;background:#0b0f14">' + svg); await pg.screenshot({ path: path.join(ici, 'fleches-v2-annote.png') }); await nav.close(); png = true; } catch (e) { console.log('capture impossible :', e.message); }

/* cas (a) (b) (c) */
const proche = (f, lo_, hi_) => f.levelId !== 'MA200' && f.zoneBas != null && f.zoneHaut >= lo_ && f.zoneBas <= hi_;
const a = F.filter(f => f.dir > 0 && f.type !== 'ma_cassure' && f.type !== 'ma_retest' && proche(f, 3850, 3890));
const b = F.filter(f => f.type === 'ma_cassure');
const c = F.filter(f => f.dir < 0 && f.levelId !== 'MA200' && proche(f, 4125, 4150));
console.log('zones dessinées :', Z.length, '| sans niveau dessiné :', sansNiveau.length);
console.log('(a) rebond haussier ~3 870 :', a.map(f => dt(f.tCloture) + ' ' + f.prix.toFixed(0)).join(' ; ') || 'AUCUN');
console.log('(b) cassures MA200 :', b.map(f => dt(f.tCloture) + (f.dir > 0 ? ' ↑' : ' ↓') + (f.fausse ? ' fausse' : '')).join(' ; ') || 'AUCUN');
console.log('(c) rebond baissier 4 131–4 146 :', c.map(f => dt(f.tCloture) + ' ' + f.prix.toFixed(0)).join(' ; ') || 'AUCUN');
console.log('avant (v1) par type :', JSON.stringify(parType(F1)), 'total', F1.length, '| max/600 :', max600(F1));
console.log('après (v2) par type :', JSON.stringify(parType(F)), 'total', F.length, '| max/600 :', max600(F), '| sur les 600 dernières :', dernieres600(F));
const tbl = liste.map(l => `| ${l.date} | ${l.type} | ${l.sens} | ${l.prix} | ${l.zone} | ${l.issue} | ${l.fav6 ?? ''} / ${l.adv6 ?? ''} |`).join('\n');
const md = `# Flèches v2 : rapport de rejeu (or H1, 2026-01-01 → ${dt(now)} UTC)

Règle \`fleches-lecture-v2\` (écrite avant le rejeu) : les flèches viennent de la MÊME liste de zones H1 que celle dessinée par le graphique (\`zonesAffichage\` : actives + traces), plus la MA200. Chaque flèche porte le \`levelId\` de la zone dessinée. Les « Rebond sur la MA » (continuation) sont supprimés de l'affichage.

![annoté](fleches-v2-annote.png)

## Cas demandés
- (a) rebond haussier sur la zone verte ~3 870 : ${a.length ? 'OUI — ' + a.map(f => dt(f.tCloture) + ' à ' + f.prix.toFixed(0) + ' (' + f.levelId + ')').join(' ; ') : 'NON'}
- (b) cassure de la MA200 sur la montée : ${b.length ? 'OUI — ' + b.map(f => dt(f.tCloture) + (f.dir > 0 ? ' haussière' : ' baissière') + (f.fausse ? ' (fausse cassure)' : '')).join(' ; ') : 'NON'}
- (c) rebonds baissiers sur résistance 4 131–4 146 : ${c.length ? 'OUI — ' + c.map(f => dt(f.tCloture) + ' à ' + f.prix.toFixed(0)).join(' ; ') : 'NON'}

## Compte avant / après (historique 2026)
- Avant (fleches-lecture-v1) : ${JSON.stringify(parType(F1))}, total ${F1.length}, maximum sur 600 bougies ${max600(F1)}.
- Après (v2) : ${JSON.stringify(parType(F))}, total ${F.length}, maximum sur 600 bougies H1 : **${max600(F)}** ; sur les 600 dernières : ${dernieres600(F)}${max600(F) > 25 ? ' — **dépasse 25** (non masqué).' : ' (≤ 25).'}
- Cohérence : ${Z.length} zones dessinées ; flèches sans niveau dessiné : ${sansNiveau.length}.

## Liste des flèches (heure UTC de clôture)
| clôture | type | sens | prix | zone | issue | fav/adv 6 b. (ATR) |
|---|---|---|---|---|---|---|
${tbl}

Les colonnes issue et fav/adv sont INFORMATIVES (mesurées après coup, jamais utilisées pour décider). Elles ne disent pas que les flèches sont rentables.
`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V2.md'), md);
console.log('image :', png);
