/* Rapport « flèches v6 » : avant/après (v5 → v6), diagnostic des deux cas, image annotée.   node agent-trading/recherche-or/fleches-v6-rapport.mjs
   → RAPPORT-FLECHES-V6.md + outils-restructuration/captures/fleches-v6-annotee.png */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V5 from '../front/or/fleches-simples-v5.js'; import * as V6 from '../front/or/fleches-simples-v6.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { sma } from '../front/or/fleches-lecture-v1.js'; import { serie13 } from './fleches-v6-diag.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 };
const r5 = V5.calculer(K, zonesDirect, o), r6 = V6.calculer(K, zonesDirect, o), r6s = V6.calculer(K, zonesDirect, { ...o, exception: false });
const cnt = L => { const c = { vertes: 0, rouges: 0, cyan: 0, gris: 0, invalidees: 0, deux: 0 }; for (const f of L) { if (f.type === 'ma_cassure') c.cyan++; else if (f.contre) c.gris++; else if (f.dir > 0) c.vertes++; else c.rouges++; if (f.invalidee) c.invalidees++; if (f.deuxiemeTouche) c.deux++; } return c; };
const c5 = cnt(r5.fleches), c6 = cnt(r6.fleches), changes = r6.fleches.filter(f => { const a = r5.fleches.find(x => x.id === f.id); return a && !!a.contre !== !!f.contre; });
const max600 = L => { let m = 0; for (let d = 0; d + 600 <= K.length; d += 3) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600 && !f.contre).length); return m; };
const chuteV = r6.fleches.filter(f => f.type === 'retournement' && f.dir > 0 && !f.contre && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19));
const cas1 = r6.fleches.find(f => f.type === 'retournement' && f.dir < 0 && f.niveauNom === 'VAH mensuel' && f.tCloture === Date.UTC(2026, 10, 9, 21)), cas1v5 = r5.fleches.find(f => f.id === (cas1 && cas1.id));
const cas2 = r6.contacts.filter(k => k.dir > 0 && /swing/.test(k.raison) && k.zoneBas > 3870 && k.zoneHaut < 3900);
const raisons = {}; for (const k of r6.contacts) { const r = k.raison.replace(/\(.*\)/, '').trim(); raisons[r] = (raisons[r] || 0) + 1; }
// ── image annotée
const deb = K.findIndex(b => b.t >= Date.UTC(2026, 10, 4, 12)), S = K.slice(deb), N = S.length, M = sma(K), MK = M.slice(deb), W = 1800, HH = 860, mg = 64, lo0 = Math.min(...S.map(b => b.l)) - 18, hi0 = Math.max(...S.map(b => b.h)) + 26;
const X = k => mg + (k + 0.5) / N * (W - 2 * mg), Y = p => HH - mg - (p - lo0) / (hi0 - lo0) * (HH - 2 * mg - 20);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HH}" font-family="Segoe UI, Arial, sans-serif"><rect width="${W}" height="${HH}" fill="#0b0f14"/>`;
for (const f of r6.fleches.filter(f => f.type === 'retournement' && f.i >= deb)) { const k0 = Math.max(0, f.i - deb - 30), x0 = X(k0), x1 = Math.min(W - mg, X(f.i - deb) + 40), y1 = Y(f.zoneHaut), y2 = Y(f.zoneBas), col = f.contre ? '125,135,145' : f.dir < 0 ? '224,90,90' : '79,209,139'; svg += `<rect x="${x0}" y="${y1}" width="${x1 - x0}" height="${Math.max(2, y2 - y1)}" fill="rgba(${col},.13)"/><line x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}" stroke="rgba(${col},.55)"/>`; }
for (let k = 0; k < N; k++) { const b = S[k], x = X(k), up = b.c >= b.o, c = up ? '#4fd18b' : '#e05a5a'; svg += `<line x1="${x}" x2="${x}" y1="${Y(b.h)}" y2="${Y(b.l)}" stroke="${c}"/><rect x="${x - 2}" y="${Y(Math.max(b.o, b.c))}" width="4" height="${Math.max(1, Math.abs(Y(b.o) - Y(b.c)))}" fill="${c}"/>`; }
svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.6" points="${MK.map((m, k) => m == null || m < lo0 || m > hi0 ? '' : `${X(k)},${Y(m)}`).filter(Boolean).join(' ')}"/>`;
for (const k of r6.contacts.filter(k => k.i >= deb)) { const x = X(k.i - deb), up = k.dir > 0, y = up ? Y(K[k.i].l) + 12 : Y(K[k.i].h) - 12; svg += `<circle cx="${x}" cy="${y}" r="3" fill="#5d6872"/>`; }
const tri = (x, y, up, fill, stroke) => `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="1.6"` : ''}/>`;
for (const f of r6.fleches.filter(f => f.i >= deb)) { const x = X(f.i - deb), up = f.dir > 0, y = up ? Y(K[f.i].l) + 16 : Y(K[f.i].h) - 16;
  if (f.contre) svg += `<circle cx="${x}" cy="${y}" r="4" fill="#7d8791"/>`; else if (f.invalidee) svg += tri(x, y, up, 'none', '#7d8791'); else svg += tri(x, y, up, f.type === 'ma_cassure' ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d');
  if (f.deuxiemeTouche) { svg += `<text x="${Math.min(W - 110, x + 12)}" y="${up ? y + 4 : y + 6}" fill="#ffd27a" font-size="13" font-weight="700">2ᵉ touche</text>`; } }
if (cas1) { const x = X(cas1.i - deb), y = Y(K[cas1.i].h) - 16; svg += `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#ffd27a" stroke-width="2"/><text x="${x + 24}" y="${y - 14}" fill="#ffd27a" font-size="16" font-weight="700">CAS 1</text>`; }
if (cas2.length) { const k = cas2[cas2.length - 1], x = X(k.i - deb), y = Y(K[k.i].l) + 12; svg += `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="#ffd27a" stroke-width="2"/><text x="${x - 74}" y="${y + 34}" fill="#ffd27a" font-size="16" font-weight="700">CAS 2</text>`; }
svg += `<text x="${mg}" y="52" fill="#ffd27a" font-size="15">CAS 1 : double sommet 4 131–4 144 : la 2ᵉ touche est une vente rouge avec l'exception (v5 : point gris contre-tendance)</text>`;
svg += `<text x="${mg}" y="74" fill="#ffd27a" font-size="15">CAS 2 : rebond sur le support du bas : point gris foncé « ${cas2.length ? esc(cas2[cas2.length - 1].raison.replace('bloqué : ', '')) : '—'} » (l'exception ne le débloque pas)</text>`;
svg += `<text x="${mg}" y="26" fill="#ccc" font-size="15">Flèches v6 (Kraken H1, 4 → 13 nov.) : vert achat · rouge vente · cyan MA200 · point gris foncé = contact sans flèche (raison dans l'infobulle) · point gris = contre-tendance · triangle creux = invalidée</text>`;
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
svg += '</svg>';
const { Resvg } = await import('@resvg/resvg-js'); const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
const sortie = path.join(ici, '..', '..', 'outils-restructuration', 'captures'); fs.mkdirSync(sortie, { recursive: true }); fs.writeFileSync(path.join(sortie, 'fleches-v6-annotee.png'), png);
const ligne = f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200' : (f.niveauNom || 'swing') + ' ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)} | ${f.type === 'ma_cassure' ? (f.dir > 0 ? 'haussier' : 'baissier') : f.dir > 0 ? 'achat' : 'vente'} | ${f.contre ? 'point gris' : f.invalidee ? 'invalidée' : f.deuxiemeTouche ? '2ᵉ touche' : 'normale'} |`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V6.md'), `# Flèches simples v6 : 2ᵉ touche d'un niveau majeur + raison des points gris (mode Direct)

**Les règles de cette version (96 → 120 bougies, rebond ≥ 1 ATR, zone cassée à 0,3 ATR) ont été choisies en regardant les exemples du vendredi 13 novembre (or H1) : aucune preuve de performance. Repères de lecture, jamais des ordres.** v5 reste scellée et intacte ; v6 est un nouveau module (\`fleches-simples-v6.js\`). Série Kraken PF_XAUUSD H1 du 14 sept. au 13 nov. 05:00 UTC (${K.length} bougies).

## Règles ajoutées
1. **Exception « 2ᵉ touche »** : un retournement sur un niveau majeur (trait plein) est considéré comme stabilisé, donc flèche colorée avec notification, même contre-tendance et même si le garde-fou « chute > 5 ATR » s'applique, si le même niveau a déjà eu une confirmation dans les 120 dernières bougies H1, que le prix en est reparti d'au moins 1 ATR (mesuré depuis la clôture de la confirmation précédente), et qu'aucune clôture n'est passée à plus de 0,3 ATR de l'autre côté entre les deux touches. Étiquette : « 2ᵉ touche : double sommet/double creux ». « Même niveau » = même sens et zone qui se recouvre à 0,5 ATR près (la valeur d'un niveau de structure bouge de 1 $ d'une période à l'autre : 4 145 puis 4 144).
2. **« Zone cassée »** : inchangée (clôture à 0,3 ATR de l'autre côté ; une mèche sans clôture ne casse pas).
3. **Raison affichée** : chaque contact du prix avec un niveau majeur qui ne donne pas de flèche colorée = petit point gris foncé (un par bougie, jamais sur une flèche), infobulle avec la raison exacte : bloqué (contre-tendance avec la MA200, garde-fou chute > 5 ATR, zone cassée, cooldown de 24 bougies, trop proche d'une autre flèche, plafond, retest par l'autre côté, traversée, zone de swing pas encore assez touchée) ou « en attente : bougie de confirmation pas encore close ». Aucune notification pour ces points.

## Écart avec la consigne (à valider)
- **Fenêtre de 120 bougies et non 96** : entre la 1ʳᵉ touche (5 nov. 03:00 UTC) et la 2ᵉ (9 nov. 21:00 UTC) il y a **113 bougies H1** (week-end compris : Kraken cote l'or le week-end). Avec 96 la 2ᵉ touche du cas 1 n'est pas débloquée. J'ai donc mis 120 (5 jours) ; c'est le seul paramètre qui change le résultat du cas 1. Pour revenir à 96 : \`deuxFenetre\` dans \`fleches-simples-v6.js\`.

## Diagnostic des deux cas
**Cas 1 : double sommet 4 131–4 144 (5 nov. puis 9 nov.)** : la 2ᵉ touche (9 nov. 21:00 UTC, VAH mensuel 4 144) avait un point gris car le **filtre contre-tendance** s'appliquait (clôture au-dessus d'une MA200 haussière, plus haut plus haut). Aucun autre garde-fou n'était en cause. **L'exception la débloque** : le niveau (VAH mensuel 4 145 le 5 nov. à 04:00 UTC) avait fait repartir le prix de ${cas1 ? cas1.deuxiemeTouche.rebondAtr : '—'} ATR, sans clôture au-delà de 0,3 ATR de l'autre côté. Elle devient une **vente rouge** (v5 : ${cas1v5 && cas1v5.contre ? 'point gris' : 'état ?'}). Entrée / stop / TP de cette flèche : voir l'infobulle.

**Cas 2 : support du bas (3 880–3 893 ; « Bas du mois » 3 874 ; rebond du 13 nov.)** : **l'exception ne le débloque pas**, pour deux raisons mesurées. (a) La zone de swing 3 880–3 893 (14 touches au total) a été recréée le 13 nov. 01:00 UTC (rôle inversé après la chute) : **1 seule touche vue depuis sa création, la règle des niveaux majeurs en demande 3** ; elle n'était donc pas un niveau majeur au moment du rebond, et n'a jamais produit de flèche. (b) L'exception exige une confirmation précédente sur ce niveau avec un rebond ≥ 1 ATR : la première touche (12 nov. 14:00–18:00) a rebondi de ~16 $ (≈ 0,8 ATR) et, au moment de la chute, le niveau n'était pas encore majeur. Les niveaux de structure « Bas du mois » 3 874 et « Bas de la semaine » 3 884 n'apparaissent dans la liste des niveaux qu'au changement de jour (13 nov. 00:00) et le prix ne les a pas retouchés depuis. **Ce qui change visiblement** : le rebond porte maintenant un point gris avec la raison « ${cas2.length ? cas2[cas2.length - 1].raison : '—'} » au lieu du silence. Je n'ai pas assoupli la règle des 3 touches pour sauver ce cas (ce serait choisir le réglage d'après l'exemple).

## Compte des flèches (série Kraken, ${K.length} bougies)
| | cassures MA200 | achats verts | ventes rouges | points gris | invalidées | « 2ᵉ touche » |
|---|---|---|---|---|---|---|
| v5 | ${c5.cyan} | ${c5.vertes} | ${c5.rouges} | ${c5.gris} | ${c5.invalidees} | – |
| v6 sans l'exception (= v5) | ${cnt(r6s.fleches).cyan} | ${cnt(r6s.fleches).vertes} | ${cnt(r6s.fleches).rouges} | ${cnt(r6s.fleches).gris} | ${cnt(r6s.fleches).invalidees} | – |
| **v6** | ${c6.cyan} | ${c6.vertes} | ${c6.rouges} | ${c6.gris} | ${c6.invalidees} | ${c6.deux} |

Total v5 ${r5.fleches.length} → v6 ${r6.fleches.length} (aucune flèche ajoutée ni retirée : l'exception ne fait que passer des points gris en couleur). **${changes.length} point(s) gris passent en flèche colorée** : ${changes.map(f => dt(f.tCloture) + ' ' + (f.niveauNom || '') + ' ' + Math.round(f.zoneHaut)).join(' ; ') || 'aucun'}. Contacts expliqués (points gris foncé) : ${r6.contacts.length}. Maximum de flèches colorées sur 600 bougies : v5 ${max600(r5.fleches)}, v6 ${max600(r6.fleches)}.

Raisons des contacts : ${Object.entries(raisons).map(([k, n]) => `${k} (${n})`).join(', ')}.

## Contrôles
- Chute du 12 nov. (6 h–19 h UTC) : **${chuteV.length}** achat vert (la 2ᵉ touche ne ramène pas d'achat dans la chute : chaque support n'y est touché qu'une fois).
- Cassure MA200 du 10 nov. 17:00 UTC : conservée (cyan, jamais filtrée). Ventes rouges du 5 nov. conservées ; celle du 9 nov. 21:00 (VAH mensuel) **devient rouge avec l'exception** (point gris en v5).
- Non-repaint : le rendu après n bougies = le début du rendu complet (5 coupes, flux simulé) ; flèches déjà posées jamais déplacées ; cooldown de 24 bougies par niveau et distance de 6 bougies conservés ; une seule marque (flèche ou point) par bougie.
- Tests : \`node agent-trading/tests/fleches-simples-v6-test.mjs\` (33), \`telegram-signal-test.mjs\` (21), \`suppression-test.mjs\` (18), \`npm test\` complet, Chrome \`fleches-v6-chrome.mjs\` (1600 / 1024 / 390 px) et \`suppression-chrome.mjs\` (souris et doigt).

## Flèches v6 (5 → 13 nov.)
| clôture UTC | niveau | sens | état |
|---|---|---|---|
${r6.fleches.filter(f => f.tCloture >= Date.UTC(2026, 10, 5)).map(ligne).join('\n')}

Capture annotée : \`outils-restructuration/captures/fleches-v6-annotee.png\`. Captures Chrome : \`fleches-v6-1600.png\`, \`-1024.png\`, \`-390.png\`.
`);
console.log('ok', JSON.stringify({ c5, c6, changes: changes.length, contacts: r6.contacts.length, chute: chuteV.length }));
