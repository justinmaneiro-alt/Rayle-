/* Rejeu « flèches simples » : or H1 2026 (Dukascopy) + série Kraken (28 sept. → 12 nov.). node agent-trading/recherche-or/fleches-simples-rejeu.mjs → RAPPORT-FLECHES-SIMPLES.md + fleches-simples.png */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { charger } from './donnees.mjs'; import { zonesDessinees } from './zones-h1-rejeu.mjs'; import * as FS from '../front/or/fleches-simples.js'; import { sma } from '../front/or/fleches-lecture-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
export const serieDuka = () => charger({ debut: 2026, fin: 2026 }).h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
export const serieKraken = () => JSON.parse(fs.readFileSync(path.join(ici, 'donnees/kraken-xau-h1-chute-12-nov.json'), 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
export const analyse = B => { const now = B[B.length - 1].t + H, Z = zonesDessinees(B, now); return { Z, F: FS.calculer(B, Z, { maintenant: now }).fleches, now }; };
export const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 6) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
const parType = L => L.reduce((o, f) => { const k = f.type + (f.dir > 0 ? '↑' : '↓'); o[k] = (o[k] || 0) + 1; return o; }, {});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const D = serieDuka(), rd = analyse(D), K = serieKraken(), rk = analyse(K);
  const jour = f => new Date(f.tCloture).toISOString().slice(0, 10);
  const lignes = F => F.map(f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200' : 'zone ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut) + ' (' + f.touches + ' touches)'} | ${f.dir > 0 ? 'achat / haussier' : 'vente / baissier'} | ${Math.round(f.prix)} |`).join('\n');
  console.log('Duka 2026 :', rd.F.length, JSON.stringify(parType(rd.F)), 'max/600', max600(rd.F, D.length));
  console.log('Kraken :', rk.F.length, JSON.stringify(parType(rk.F)), 'max/600', max600(rk.F, K.length));
  const cA = rd.F.filter(f => f.dir > 0 && f.type === 'retournement' && f.zoneBas <= 3890 && f.zoneHaut >= 3850 && jour(f) === '2026-11-02');
  const cMa = rk.F.filter(f => f.type === 'ma_cassure' && f.dir < 0 && jour(f) >= '2026-11-10');   // série Kraken : celle du graphique (la série Dukascopy repasse au-dessus de la MA le 11 nov. : fausse cassure)
  const cC = rd.F.filter(f => f.dir < 0 && f.type === 'retournement' && f.zoneHaut >= 4131 && f.zoneBas <= 4156 && f.tCloture >= Date.UTC(2026, 9, 19));
  const chute = rk.F.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0);
  console.log('(5) 3 870 :', cA.length, '| (4) MA baissière 10 nov :', cMa.map(f => dt(f.tCloture)).join(','), '| (6) 4 131-4 156 :', cC.map(f => dt(f.tCloture)).join(','), '| achats pendant la chute :', chute.length);
  /* image 16 oct → 12 nov (série Kraken) */
  const deb = K.findIndex(b => b.t >= Date.UTC(2026, 9, 16)), S = K.slice(deb), N = S.length, MK = sma(K).slice(deb), lo = Math.min(...S.map(b => b.l)) - 8, hi = Math.max(...S.map(b => b.h)) + 8, W = 1800, Hh = 800, mg = 50;
  const xr = i => mg + (i - deb) / (N - 1) * (W - 2 * mg), yr = p => Hh - mg - (p - lo) / (hi - lo) * (Hh - 2 * mg), maj = new Set(FS.zonesMajeures(rk.Z).map(FS.idNiveau));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#0b0f14;font-family:sans-serif">`;
  for (const z of rk.Z) { const i0 = Math.max(deb, K.findIndex(b => b.t >= z.tDebut)), i1 = z.tFin ? K.findIndex(b => b.t >= z.tFin) : K.length - 1; if (i1 < deb || z.haut < lo || z.bas > hi) continue; const col = z.cote === 'support' ? '79,209,139' : '224,90,90', m = maj.has(FS.idNiveau(z)); svg += `<rect x="${xr(i0)}" y="${yr(z.haut)}" width="${Math.max(2, xr(i1) - xr(i0))}" height="${Math.max(2, yr(z.bas) - yr(z.haut))}" fill="rgba(${col},${m ? .22 : .06})"/>`; }
  for (let k = 0; k < N; k++) { const b = S[k], x = xr(deb + k), up = b.c >= b.o; svg += `<line x1="${x}" x2="${x}" y1="${yr(b.h)}" y2="${yr(b.l)}" stroke="${up ? '#4fd18b' : '#e05a5a'}"/><rect x="${x - 1.5}" y="${yr(Math.max(b.o, b.c))}" width="3" height="${Math.max(1, Math.abs(yr(b.o) - yr(b.c)))}" fill="${up ? '#4fd18b' : '#e05a5a'}"/>`; }
  svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.5" points="${MK.map((m, k) => m == null ? '' : `${xr(deb + k)},${yr(m)}`).filter(Boolean).join(' ')}"/>`;
  for (const f of rk.F.filter(f => f.i >= deb)) { const x = xr(f.i), up = f.dir > 0, y = up ? yr(K[f.i].l) + 14 : yr(K[f.i].h) - 14, col = f.type === 'ma_cassure' ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'; svg += `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="${col}"/>`; }
  svg += `<text x="60" y="26" fill="#ccc" font-size="14">Kraken PF_XAUUSD H1, 16 oct. → 12 nov. : zones majeures pleines, autres zones très pâles, MA200 dorée ; flèches : vert achat, rouge vente, cyan MA200 (aucun texte)</text></svg>`;
  fs.writeFileSync(path.join(ici, 'fleches-simples.svg'), svg);
  try { const req = createRequire(path.resolve(ici, '..', '..', 'tests-navigateur', 'package.json')), pup = req('puppeteer-core'), nav = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }), pg = await nav.newPage(); await pg.setViewport({ width: W, height: Hh }); await pg.setContent('<body style="margin:0">' + svg); await pg.screenshot({ path: path.join(ici, 'fleches-simples.png') }); await nav.close(); } catch (e) { console.log('capture impossible', e.message); }
  fs.writeFileSync(path.join(ici, 'fleches-simples-liste.json'), JSON.stringify({ duka: rd.F.map(f => [dt(f.tCloture), f.type, f.dir, Math.round(f.prix), f.levelId]), kraken: rk.F.map(f => [dt(f.tCloture), f.type, f.dir, Math.round(f.prix), f.levelId]) }));
  fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-SIMPLES.md'), `# Flèches simples : rapport de rejeu

**Les seuils ont été choisis en regardant ces exemples (cassures MA200 du 10 nov., chute du 12 nov., zones 3 870 et 4 131–4 156). Aucune preuve de performance.**

Règle \`fleches-simples-v1\` : (A) cassure FINALE de la MA200 (clôture à ≥ 1 ATR de l'autre côté ou 12 clôtures consécutives, 24 bougies de repos) ; (B) retournement sur zone H1 dessinée MAJEURE (≥ 8 touches ou parmi les 4 plus touchées), une flèche par touche, repos de 24 bougies, aucune flèche sur zone cassée ni sur zone au rôle récent avant un premier retournement. 6 bougies minimum entre deux flèches. Aucun texte sur le graphique (infobulle seulement).

![16 oct. – 12 nov.](fleches-simples.png)

## Comptes
- Historique or 2026 (Dukascopy, zones du dernier mois) : **${rd.F.length} flèches** ${JSON.stringify(parType(rd.F))}, maximum sur 600 bougies H1 : **${max600(rd.F, D.length)}** (critère ≤ 10).
- Série Kraken (28 sept. → 12 nov.) : ${rk.F.length} flèches ${JSON.stringify(parType(rk.F))}, maximum sur 600 bougies : ${max600(rk.F, K.length)}.

## Critères
- Chute du 12 nov. (6 h → 19 h UTC) : flèches d'achat = **${chute.length}**.
- Cassure baissière MA200 du 10 nov. (série Kraken, celle du graphique) : ${cMa.length ? 'OUI — flèche cyan baissière à ' + cMa.map(f => dt(f.tCloture)).join(' ; ') + ' UTC (clôture à ≥ 1,4 ATR sous la MA ; sur la série Dukascopy le prix repasse au-dessus de la MA le 11 nov. : cassure non confirmée, aucune flèche)' : 'NON'}.
- Rebond haussier ~3 870 le 2 nov. : ${cA.length ? 'OUI' : 'NON — la zone 3 867–3 871 ne compte qu\'1 touche : elle n\'est pas majeure, donc aucune flèche (conforme à la règle)'}.
- Rebonds baissiers 4 131–4 156 : ${cC.length} flèches rouges sur les 6 d'origine (${cC.map(f => dt(f.tCloture)).join(', ')}) ; les autres sont supprimés par le repos de 24 bougies et par la règle de zone au rôle récent.

## Flèches (Dukascopy 2026)
| clôture UTC | niveau | sens | prix |
|---|---|---|---|
${lignes(rd.F)}
`);
}
