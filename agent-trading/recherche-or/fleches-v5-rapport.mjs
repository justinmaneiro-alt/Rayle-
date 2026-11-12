/* Rapport « flèches v5 » : avant/après (v4 → v5), critères, image annotée 16 oct → 12 nov. node agent-trading/recherche-or/fleches-v5-rapport.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { serieKraken } from './fleches-simples-rejeu.mjs';
import * as V4 from '../front/or/fleches-simples-v4.js'; import * as V5 from '../front/or/fleches-simples-v5.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { sma } from '../front/or/fleches-lecture-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const K = serieKraken(), now = K[K.length - 1].t + H;
const F4 = V4.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).fleches, r5 = V5.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }), F5 = r5.fleches;
const cnt = L => { const o = { vertes: 0, rouges: 0, cyan: 0, gris: 0, invalidees: 0, stabilisees: 0 }; for (const f of L) { if (f.type === 'ma_cassure') o.cyan++; else if (f.contre) o.gris++; else { if (f.dir > 0) o.vertes++; else o.rouges++; } if (f.invalidee) o.invalidees++; if (f.stabilisation) o.stabilisees++; } return o; };
const c4 = cnt(F4), c5 = cnt(F5), max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d++) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600 && !f.contre).length); return m; };
const chuteV = F5.filter(f => f.type === 'retournement' && f.dir > 0 && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19)), nuit = F5.filter(f => f.type === 'retournement' && f.dir > 0 && f.tCloture >= Date.UTC(2026, 10, 12, 0) && f.tCloture < Date.UTC(2026, 10, 12, 6));
const M = sma(K), i1 = K.findIndex(b => b.t === Date.UTC(2026, 10, 12, 0));
const ligne = f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200' : f.niveauType === 'structure' ? f.niveauNom + ' ' + Math.round(f.zoneHaut) : 'swing ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)} | ${f.dir > 0 ? (f.type === 'ma_cassure' ? 'haussier' : 'achat') : (f.type === 'ma_cassure' ? 'baissier' : 'vente')} | ${f.type === 'ma_cassure' ? 'cyan' : f.contre ? 'POINT GRIS (contre-tendance)' : f.invalidee ? 'normale puis INVALIDÉE ' + dt(f.invalideeT) : f.stabilisation ? 'normale (contre-tendance stabilisée : ' + f.stabilisation + ')' : 'normale'} | ${Math.round(f.prix)} |`;
console.log(JSON.stringify({ c4, c5, m4: max600(F4, K.length), m5: max600(F5, K.length), refus: r5.refus }));
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V5.md'), `# Flèches simples v5 : moins de rebonds contre-tendance, invalidation sans repaint (mode Direct)

**Les règles (MA200 sur 48 bougies, plus bas plus bas sur 24, base de 8 bougies ≤ 1,5 ATR, invalidation sur 2 bougies) ont été choisies en regardant ces exemples (chute de l'or du 12 nov.) : aucune preuve de performance. Repères de lecture, pas des ordres.**

## Règles ajoutées (v5 = v4 + 2 filtres ; v4 scellée intacte)
1. **Contre-tendance** : achat = clôture sous la MA200 ET MA200 plus basse qu'il y a 48 bougies ET plus bas des 24 dernières bougies < plus bas des 24 précédentes ; vente = miroir. Une telle flèche devient un **point gris discret**, sans notification ni alerte vocale, SAUF stabilisation : (a) base de 8 bougies sans nouvel extrême (vs les 16 précédentes), range ≤ 1,5 ATR ; (b) divergence RSI confirmée (pivots de 5 bougies) dont le second pivot est sur la zone (± 0,5 ATR).
2. **Invalidation** : si l'une des 2 bougies suivant la confirmation clôture de l'autre côté du niveau (achat : sous le bas de la zone ; vente : au-dessus du haut), la flèche passe à « invalidée » (grise, ×, infobulle « Invalidée à … »), décidée à la clôture de cette bougie, jamais rétroactive ; notification « Signal invalidé ». La flèche n'est jamais supprimée ni déplacée. Un point gris n'est pas invalidé.

## Compte avant / après (série Kraken, ${K.length} bougies)
- **v4** : ${c4.cyan} cassures MA200, ${c4.vertes} achats, ${c4.rouges} ventes (total ${F4.length}).
- **v5** : ${c5.cyan} cassures MA200, **${c5.vertes} achats verts, ${c5.rouges} ventes rouges**, **${c5.gris} points gris** (contre-tendance), dont ${c5.stabilisees} flèche(s) contre-tendance gardée(s) par stabilisation ; **${c5.invalidees} flèches invalidées** (grisées, conservées). Total ${F5.length} (la v5 garde les mêmes positions que la v4 : seul leur état change). Maximum de flèches normales sur 600 bougies : v4 ${max600(F4, K.length)} → v5 ${max600(F5, K.length)}. Plafond de sécurité 30 : ${r5.refus ? 'ATTEINT' : 'non atteint'}.

## Contrôles
- Chute du 12 nov. (6 h–19 h UTC) : **${chuteV.length}** flèche d'achat verte hors stabilisation.
- **Limite honnête** : ${nuit.length ? 'un achat vert existe à ' + nuit.map(f => dt(f.tCloture) + ' UTC, clôture ' + Math.round(f.prix) + ' sur ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)).join(' ; ') + ' (avant 6 h, début de la chute). Il n\'est PAS contre-tendance au sens de la règle : à ce moment la MA200 monte encore (' + M[i1 - 48].toFixed(0) + ' → ' + M[i1].toFixed(0) + ') parce que le prix venait de passer longtemps au-dessus. Aucune règle supplémentaire n\'a été ajoutée pour le retirer.' : 'aucun achat avant 6 h.'}
- Cassure MA200 du 10 nov. : **conservée** (cyan, jamais filtrée).
- Flèches rouges sur le VAH mensuel : **5 nov. conservée (rouge)**. **Conflit de consignes** : celle du **9 nov. 21:00** tombe sous la règle miroir (vente au-dessus d'une MA200 haussière, plus haut plus haut) : elle devient un **point gris**. Je n'ai pas fait d'exception pour la sauver.
- Retournements dans le sens de la tendance conservés : ${F5.filter(f => f.type === 'retournement' && !f.contre).length} flèches normales.
- Non-repaint : rejeu bougie par bougie identique au chargement complet (test Node, 5 coupes) ; invalidation sans repaint : même flèche avant / après la bougie d'invalidation.

## Flèches v5
| clôture UTC | niveau | sens | état | prix |
|---|---|---|---|---|
${F5.map(ligne).join('\n')}

Capture annotée : \`fleches-v5.png\` (vert / rouge = normales, cyan = MA200, point gris = contre-tendance, gris creux × = invalidée).
`);
const deb = K.findIndex(b => b.t >= Date.UTC(2026, 9, 16)), S = K.slice(deb), N = S.length, MK = M.slice(deb), lo = Math.min(...S.map(b => b.l)) - 20, hi = Math.max(...S.map(b => b.h)) + 20, W = 1800, Hh = 850, mg = 60;
const xr = i => mg + (i - deb) / (N - 1) * (W - 2 * mg), yr = p => Hh - mg - (p - lo) / (hi - lo) * (Hh - 2 * mg);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#0b0f14;font-family:sans-serif">`;
for (const f of F5.filter(f => f.type === 'retournement' && f.i >= deb)) { const x0 = Math.max(xr(f.i) - 55, mg), x1 = Math.min(xr(f.i) + 55, W - mg), col = f.contre ? '125,135,145' : f.dir < 0 ? '224,90,90' : '79,209,139', yb = yr(f.zoneBas), yh = yr(f.zoneHaut), y = (yb + yh) / 2;
  svg += `<rect x="${x0}" y="${Math.min(yb, yh)}" width="${x1 - x0}" height="${Math.max(2, Math.abs(yb - yh))}" fill="rgba(${col},.15)"/><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="rgb(${col})" stroke-width="1.5"/><text x="${x0}" y="${y + (f.dir < 0 ? -4 : 12)}" fill="rgb(${col})" font-size="11">${f.niveauType === 'structure' ? f.niveauNom + ' ' + Math.round(f.zoneHaut) : 'swing ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut) + ' · ' + f.touchesVues + ' t.'}</text>`; }
for (let k = 0; k < N; k++) { const b = S[k], x = xr(deb + k), up = b.c >= b.o; svg += `<line x1="${x}" x2="${x}" y1="${yr(b.h)}" y2="${yr(b.l)}" stroke="${up ? '#4fd18b' : '#e05a5a'}"/><rect x="${x - 1.5}" y="${yr(Math.max(b.o, b.c))}" width="3" height="${Math.max(1, Math.abs(yr(b.o) - yr(b.c)))}" fill="${up ? '#4fd18b' : '#e05a5a'}"/>`; }
svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.5" points="${MK.map((m, k) => m == null ? '' : `${xr(deb + k)},${yr(m)}`).filter(Boolean).join(' ')}"/>`;
for (const f of F5.filter(f => f.i >= deb)) { const x = xr(f.i), up = f.dir > 0, y = up ? yr(K[f.i].l) + 14 : yr(K[f.i].h) - 14;
  if (f.contre) { svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#7d8791"/>`; continue; }
  if (f.invalidee) { svg += `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="none" stroke="#7d8791" stroke-width="1.6"/><text x="${x - 4}" y="${up ? y + 12 : y - 2}" fill="#9aa4ae" font-size="12">×</text>`; continue; }
  const col = f.type === 'ma_cassure' ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'; svg += `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="${col}"/>`; }
svg += `<text x="60" y="26" fill="#ccc" font-size="14">Flèches v5 (Kraken H1, 16 oct. → 12 nov.) : vert achat / rouge vente / cyan MA200 ; point gris = rebond contre-tendance ; triangle gris creux × = invalidée</text></svg>`;
fs.writeFileSync(path.join(ici, 'fleches-v5.svg'), svg);
try { const req = createRequire(path.resolve(ici, '..', '..', 'tests-navigateur', 'package.json')), pup = req('puppeteer-core'), nav = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }); const p = await nav.newPage(); await p.setViewport({ width: W, height: Hh }); await p.setContent(`<body style="margin:0;background:#0b0f14">${svg}</body>`); await p.screenshot({ path: path.join(ici, 'fleches-v5.png') }); await nav.close(); } catch (e) { console.log('PNG non généré :', e.message); }
