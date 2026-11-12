/* Rejeu v2.1 → v2.2 : (1) or H1 Dukascopy 2026 (cas de contrôle, comptes, « échoué » par phase) ; (2) chute du 12 novembre sur la série Kraken PF_XAUUSD H1 (28 sept. → 12 nov. 18 h UTC).
   node agent-trading/recherche-or/fleches-v22-rejeu.mjs → RAPPORT-FLECHES-V2-2.md, fleches-v22-chute.png, fleches-v22-liste.json */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { charger } from './donnees.mjs'; import { zonesDessinees } from './zones-h1-rejeu.mjs';
import * as V21 from '../front/or/fleches-lecture-v21.js'; import * as V22 from '../front/or/fleches-lecture-v22.js';
import { atrSerie } from '../front/or/fleches-terminal-v1.js'; import { sma } from '../front/or/fleches-lecture-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
const dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
export const serieDuka = () => charger({ debut: 2026, fin: 2026 }).h1.filter(b => !(b.h === b.l && !b.v)).map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
export const serieKraken = () => JSON.parse(fs.readFileSync(path.join(ici, 'donnees/kraken-xau-h1-chute-12-nov.json'), 'utf8')).map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] }));
const parType = L => L.reduce((o, f) => (o[f.type] = (o[f.type] || 0) + 1, o), {});
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 6) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
const analyse = B => { const now = B[B.length - 1].t + H, Z = zonesDessinees(B, now), a = V21.calculer(B, Z, { maintenant: now }).fleches, b = V22.calculer(B, Z, { maintenant: now }).fleches; return { Z, a, b, now }; };

/* ── 1. historique 2026 ── */
const B = serieDuka(), A = atrSerie(B), { Z, a: F21, b: F22, now } = analyse(B);
const niv = L => L.filter(f => f.levelId !== 'MA200');
const phase = f => Math.abs(B[f.i].c - B[Math.max(0, f.i - 24)].c) >= 4 * A[f.i] ? 'impulsive' : 'range';
const statsEchec = L => { const o = { impulsive: { n: 0, echoue: 0, tient: 0 }, range: { n: 0, echoue: 0, tient: 0 } }; for (const f of niv(L)) { const e = V22.echoue(B, f), p = phase(f); o[p].n++; if (e === true) o[p].echoue++; else if (e === false) o[p].tient++; } return o; };
const e21 = statsEchec(F21), e22 = statsEchec(F22);
const jour = f => new Date(f.tCloture).toISOString().slice(0, 10);
const cA = F22.filter(f => f.dir > 0 && f.levelId !== 'MA200' && f.zoneBas <= 3890 && f.zoneHaut >= 3850 && jour(f) === '2026-11-02');
const cB = F22.filter(f => f.type === 'ma_cassure' && f.dir > 0 && jour(f) === '2026-11-04');
const cC = F22.filter(f => f.dir < 0 && f.levelId !== 'MA200' && f.zoneHaut >= 4131 && f.zoneBas <= 4156 && f.tCloture >= Date.UTC(2026, 9, 19));
console.log('2026 — v2.1 :', JSON.stringify(parType(F21)), F21.length, 'max/600', max600(F21, B.length), '| v2.2 :', JSON.stringify(parType(F22)), F22.length, 'max/600', max600(F22, B.length));
console.log('(a)', cA.map(f => dt(f.tCloture) + ' ' + f.nom).join(' ; ') || 'AUCUN', '| (b)', cB.length, '| (c)', cC.length, cC.map(f => dt(f.tCloture)).join(','));
console.log('échoué v2.1', JSON.stringify(e21), 'v2.2', JSON.stringify(e22));

/* ── 2. chute du 12 novembre (série Kraken) ── */
const K = serieKraken(), AK = atrSerie(K), rk = analyse(K), debChute = Date.UTC(2026, 10, 11, 12), finChute = Date.UTC(2026, 10, 12, 19);
const chute = L => L.filter(f => f.tCloture >= debChute && f.tCloture <= finChute);
const achats21 = chute(rk.a).filter(f => f.dir > 0 && f.levelId !== 'MA200'), achats22 = chute(rk.b).filter(f => f.dir > 0 && f.levelId !== 'MA200');
console.log('chute 12 nov — achats v2.1 :', achats21.map(f => dt(f.tCloture) + ' ' + Math.round(f.prix)).join(' ; ') || 'aucun');
console.log('chute 12 nov — achats v2.2 :', achats22.map(f => dt(f.tCloture) + ' ' + Math.round(f.prix) + ' ' + f.nom).join(' ; ') || 'aucun');
const toutesV22 = chute(rk.b);

/* image annotée de la chute */
const deb = K.findIndex(b => b.t >= Date.UTC(2026, 10, 10, 12)), S = K.slice(deb), N = S.length, MK = sma(K).slice(deb), lo = Math.min(...S.map(b => b.l)) - 8, hi = Math.max(...S.map(b => b.h)) + 8, W = 1800, Hh = 800, mg = 50;
const xr = i => mg + (i - deb) / (N - 1) * (W - 2 * mg), yr = p => Hh - mg - (p - lo) / (hi - lo) * (Hh - 2 * mg);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#0b0f14;font-family:sans-serif">`;
for (const z of rk.Z) { const i0 = Math.max(deb, K.findIndex(b => b.t >= z.tDebut)), i1 = z.tFin ? K.findIndex(b => b.t >= z.tFin) : K.length - 1; if (i1 < deb || z.haut < lo || z.bas > hi) continue; const col = z.cote === 'support' ? '79,209,139' : '224,90,90'; svg += `<rect x="${xr(i0)}" y="${yr(z.haut)}" width="${Math.max(2, xr(i1) - xr(i0))}" height="${Math.max(2, yr(z.bas) - yr(z.haut))}" fill="rgba(${col},${z.actif ? .25 : .13})"/>`; }
for (let k = 0; k < N; k++) { const b = S[k], x = xr(deb + k), up = b.c >= b.o; svg += `<line x1="${x}" x2="${x}" y1="${yr(b.h)}" y2="${yr(b.l)}" stroke="${up ? '#4fd18b' : '#e05a5a'}"/><rect x="${x - 2}" y="${yr(Math.max(b.o, b.c))}" width="4" height="${Math.max(1, Math.abs(yr(b.o) - yr(b.c)))}" fill="${up ? '#4fd18b' : '#e05a5a'}"/>`; }
svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.5" points="${MK.map((m, k) => m == null ? '' : `${xr(deb + k)},${yr(m)}`).filter(Boolean).join(' ')}"/>`;
const dessinerF = (L, decal, etiq) => { for (const f of L.filter(f => f.i >= deb)) { const x = xr(f.i), up = f.dir > 0, y = up ? yr(K[f.i].l) + 14 + decal : yr(K[f.i].h) - 14 - decal, ma = f.type.startsWith('ma_'), col = ma ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'; svg += `<path d="M${x},${up ? y - 12 : y + 12} l-6,${up ? 12 : -12} h12 z" fill="${f.contreTendance ? 'none' : col}" stroke="${col}"/><text x="${x}" y="${up ? y + 24 : y - 28}" fill="${col}" font-size="10" text-anchor="middle">${etiq} ${dt(f.tCloture).slice(6)}</text>`; } };
dessinerF(rk.a.filter(f => f.levelId !== 'MA200'), 34, 'v2.1'); dessinerF(rk.b, 0, 'v2.2');
svg += `<text x="60" y="30" fill="#ccc" font-size="14">Chute du 12 novembre (Kraken PF_XAUUSD H1) — flèches pleines : v2.2 ; flèches décalées « v2.1 » : règle précédente. Vert = haussier, rouge = baissier, creux = contre-tendance, cyan = MA200.</text></svg>`;
fs.writeFileSync(path.join(ici, 'fleches-v22-chute.svg'), svg);
let png = false; try { const req = createRequire(path.resolve(ici, '..', '..', 'tests-navigateur', 'package.json')), pup = req('puppeteer-core'), nav = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }), pg = await nav.newPage(); await pg.setViewport({ width: W, height: Hh }); await pg.setContent('<body style="margin:0">' + svg); await pg.screenshot({ path: path.join(ici, 'fleches-v22-chute.png') }); await nav.close(); png = true; } catch (e) { console.log('capture impossible', e.message); }

const ligne = (f, L) => `| ${dt(f.tCloture)} | ${f.dir > 0 ? 'achat' : 'vente'} | ${Math.round(f.prix)} | ${f.nom} | ${f.issue || ''} |`;
const pct = (o, k) => o[k].n ? `${o[k].echoue}/${o[k].echoue + o[k].tient} décidées échouées (${Math.round(100 * o[k].echoue / Math.max(1, o[k].echoue + o[k].tient))} %), ${o[k].n} flèches` : 'aucune';
fs.writeFileSync(path.join(ici, 'fleches-v22-liste.json'), JSON.stringify({ v21: niv(F21).map(f => [dt(f.tCloture), f.type, f.dir, Math.round(f.prix)]), v22: niv(F22).map(f => [dt(f.tCloture), f.type, f.dir, Math.round(f.prix), f.nom, f.issue]) }));
const md = `# Flèches v2.2 : rapport de rejeu

**Les règles de la v2.2 ont été ajustées après avoir vu ces exemples (chute en escalier du 12 novembre). Rien ici ne prouve une performance : « échoué » est une mesure descriptive faite après coup.**

Règle \`fleches-lecture-v22\` (par-dessus la v2.1, inchangée pour la MA200) : zone cassée (> 0,3 ATR) = plus de rebond dans l'ancien sens et un seul « retest de zone cassée » ; chute en escalier (zone cassée dans les 24 bougies + nouveau plus bas/haut) = rebond retenu tant qu'il n'y a ni base de 8 bougies (≤ 1,5 ATR), ni divergence RSI confirmée sur la zone, ni relance de 1 ATR ; flèche contre la MA200 = « contre-tendance » (plus petite et pâle). Couleurs : vert haussier, rouge baissier, cyan MA200.

## Chute du 12 novembre (série Kraken PF_XAUUSD H1, 28 sept. → 12 nov. 18 h UTC)
![chute](fleches-v22-chute.png)

- Flèches d'achat sur zones pendant la chute (11 nov. 12 h → 12 nov. 19 h), **v2.1 : ${achats21.length}**, **v2.2 : ${achats22.length}**.
${achats22.length ? '| clôture | sens | prix | nom | issue |\n|---|---|---|---|---|\n' + achats22.map(f => ligne(f)).join('\n') : '(aucune flèche d\'achat v2.2 pendant la chute)'}
- v2.1 pour comparaison : ${achats21.map(f => dt(f.tCloture) + ' à ' + Math.round(f.prix)).join(' ; ') || 'aucune'}.
- Toutes les flèches v2.2 de la période : ${toutesV22.map(f => dt(f.tCloture) + ' ' + (f.dir > 0 ? '↑' : '↓') + ' ' + f.nom).join(' ; ') || 'aucune'}.

## Historique or H1 2026 (Dukascopy, zones dessinées du dernier mois)
- Total : v2.1 = ${F21.length} (${JSON.stringify(parType(F21))}), maximum sur 600 bougies ${max600(F21, B.length)} ; **v2.2 = ${F22.length} (${JSON.stringify(parType(F22))}), maximum sur 600 bougies ${max600(F22, B.length)}**${max600(F22, B.length) > 25 ? ' (> 25 : non masqué)' : ''}.
- Cas de contrôle : (a) rebond haussier ~3 870 le 2 nov. : ${cA.length ? 'OUI — ' + cA.map(f => dt(f.tCloture) + ' (' + f.nom + ')').join(' ; ') : 'NON'} ; (b) cassure MA200 du 4 nov. : ${cB.length ? 'OUI' : 'NON'} ; (c) rebonds baissiers 4 131–4 156 : ${cC.length} (${cC.map(f => dt(f.tCloture)).join(', ')}).
- Rebonds échoués (zone cassée dans les 12 bougies suivantes), phases **impulsives** (déplacement ≥ 4 ATR sur 24 bougies) : v2.1 = ${pct(e21, 'impulsive')} ; v2.2 = ${pct(e22, 'impulsive')}.
- Phases de **range** : v2.1 = ${pct(e21, 'range')} ; v2.2 = ${pct(e22, 'range')}.
- Limite : les zones dessinées ne couvrent que le dernier mois, donc la comparaison porte sur peu de flèches ; l'écart ne doit pas être lu comme une preuve.
`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V2-2.md'), md); console.log('image', png);
export { analyse, achats21, achats22, cA, cB, cC };
