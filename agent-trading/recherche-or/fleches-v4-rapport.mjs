/* Rapport « flèches v4 » : avant/après par type, critères a–f, image annotée 16 oct → 12 nov. node agent-trading/recherche-or/fleches-v4-rapport.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { serieKraken } from './fleches-simples-rejeu.mjs';
import * as V3 from '../front/or/fleches-simples-v3.js'; import * as V4 from '../front/or/fleches-simples-v4.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { sma } from '../front/or/fleches-lecture-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const K = serieKraken(), now = K[K.length - 1].t + H;
const F3 = V3.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).fleches, r4 = V4.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }), F4 = r4.fleches;
const cnt = L => { const o = { ma_haussier: 0, ma_baissier: 0, achat: 0, vente: 0, structure: 0, swing: 0 }; for (const f of L) { o[f.type === 'ma_cassure' ? (f.dir > 0 ? 'ma_haussier' : 'ma_baissier') : (f.dir > 0 ? 'achat' : 'vente')]++; if (f.niveauType) o[f.niveauType]++; } return o; };
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d++) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
const ret = F4.filter(f => f.type === 'retournement');
const c3 = cnt(F3), c4 = cnt(F4), m3 = max600(F3, K.length), m4 = max600(F4, K.length);
const L = (o, tot) => `MA200 ↑ ${o.ma_haussier}, MA200 ↓ ${o.ma_baissier}, achats ${o.achat}, ventes ${o.vente} (total ${tot})`;
const vah = F4.filter(f => f.dir < 0 && f.niveauNom === 'VAH mensuel'), res4131 = F4.filter(f => f.type === 'retournement' && f.dir < 0 && f.zoneBas >= 4125 && f.zoneHaut <= 4150 && f.niveauType === 'swing');
const chute = F4.filter(f => f.dir > 0 && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19)), avant = F4.filter(f => f.dir > 0 && f.tCloture >= Date.UTC(2026, 10, 12, 0) && f.tCloture < Date.UTC(2026, 10, 12, 6));
const ma10 = F4.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22));
const ligne = f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200' : f.niveauType === 'structure' ? f.niveauNom + ' ' + Math.round(f.zoneHaut) : 'zone swing ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)} | ${f.type === 'ma_cassure' ? 'cassure' : f.niveauType === 'structure' ? 'structure (trait plein)' : 'swing actif (trait plein)'} | ${f.dir > 0 ? (f.type === 'ma_cassure' ? 'haussier' : 'achat') : (f.type === 'ma_cassure' ? 'baissier' : 'vente')} | ${f.type === 'ma_cassure' ? '—' : f.niveauType === 'swing' ? f.touchesVues : 'n/a'} | ${Math.round(f.prix)} |`;
console.log(JSON.stringify({ c3, c4, m3, m4, refus: r4.refus }));
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V4.md'), `# Flèches simples v4 : seulement les niveaux en trait plein

**Les règles ont été choisies en regardant ces exemples (capture de Justin, or H1, 16 oct. → 12 nov.) : aucune preuve de performance. Repères de lecture, pas des ordres.**

## 1. Inventaire des niveaux dessinés par le terminal (lecture du code)
| Niveau | Source | Style dessiné | Étiquette | Surveillé par v4 |
|---|---|---|---|---|
| VAH / VAL / POC hebdo et mensuel | \`niveaux-majeurs-v1\` → \`rayle-dessin.js\` (bandes fines) | **trait plein** (bande + ligne pleine 55 %) | oui (« VAH mensuel 4 146 ») | **OUI** (structure) |
| Haut / bas de la semaine et du mois | \`niveaux-majeurs-v1\` | **trait plein** | oui | **OUI** (structure) |
| Zones de swing actives « Résistance / Support … touches » | \`zones-affichage-v1\` → \`dessinerZone\` (\`zones-affichage-dessin.js\`) | **trait plein** + bande colorée | oui | **OUI** si ≥ 3 touches déjà vues (largeur ≥ 0,3 ATR) |
| Zones de swing invalidées (« traces ») | \`dessinerZone\`, \`actif === false\` | pointillé [2,3] pâle | non | NON |
| Haut / bas de la veille | \`niveaux-majeurs-v1\` (type veille) ; PDH / PDL | trait plein (veille) ou pointillé [6,3] (PDH/PDL) | oui | NON (hors liste de Justin) |
| Niveaux ronds (50 / 100) | \`niveaux-majeurs-v1\` ; couche « ronds » | pointillé [1,5] | numéro seul | NON |
| « Niveau proposé H4 / Jour » | \`graphique-or.js\` (outils) | pointillé [3,4] | « proposé H4 4 000 » | NON |
| Liquidité (hauts / bas égaux, non touchés) | \`dessinerLiquidite\` | plein puis pointillé [2,3] | oui | NON (pointillé en grande partie) |
| Ouvertures jour / semaine, PDH/PDL | \`institutionnel-or.js\` | pointillé [2,3] / [6,3] | oui | NON |
| POC / VAH / VAL du profil d’affichage | \`institutionnel-dessin.js\` | POC plein court, VAH/VAL pointillé [4,3] | oui | NON (autre calcul : ce sont les niveaux de \`niveaux-majeurs-v1\` qui sont surveillés) |
| Structure BOS / MSS, blocs ICT, schémas, lignes de l’outil Rayle | \`structure-dessin.js\`, \`ict-dessin.js\`, \`schemas-dessin.js\` | mixte, pointillé pour la plupart | variable | NON |

Cause du bruit de la v3 : elle surveillait **toute** zone de swing ayant 3 touches, y compris de petites zones étroites proches de nombres ronds (4 000, 4 025, 3 975…), et reconnaissait la « structure » par le nom d’une zone (H4, Jour, VAH…), pas par les vrais niveaux de \`niveaux-majeurs-v1\` (VAH mensuel, etc.) — qui, eux, n’étaient surveillés par aucune flèche.

## 2. Définition causale de « majeur » (v4)
- **Structure** : les niveaux de \`niveaux-majeurs-v1\` de type semaine, mois, profil hebdo, profil mensuel qui figurent dans les 3 meilleures zones au-dessus et en dessous du prix (= ceux que le terminal dessine). Aucun comptage de touches. La valeur vient de la période PRÉCÉDENTE, complète : connue et figée à la clôture, donc une flèche ne bouge jamais.
- **Swing** : zone active (trait plein), ≥ 3 touches déjà vues avec les seules bougies closes (épisodes séparés d’au moins 6 bougies), largeur ≥ 0,3 ATR. Plus de reconnaissance par le nom.
- Flèche = première clôture hors du niveau dans le sens du rebond ; repos 24 bougies par niveau ; niveau cassé (clôture à 0,3 ATR de l’autre côté) = plus de flèche dans l’ancien sens ; garde-fou 5 ATR / 24 bougies ; MA200 inchangée ; distance minimale de 6 bougies (aucun marqueur superposé) ; plafond de sécurité 30 / 600 bougies : ${r4.refus ? 'ATTEINT (' + r4.refus + ' flèches refusées)' : 'non atteint (0 refus)'}.

## 3. Compte avant / après (série Kraken, 28 sept. → 12 nov., ${K.length} bougies)
- **v3** : ${L(c3, F3.length)} ; maximum sur 600 bougies : ${m3}.
- **v4** : ${L(c4, F4.length)} ; dont ${c4.structure} sur niveau de structure et ${c4.swing} sur zone de swing ; maximum sur 600 bougies : **${m4}** (≤ 30).

## 4. Critères d’acceptation
- a) Aucune flèche sur un niveau en pointillé : **${ret.every(f => f.niveauStyle === 'trait plein') ? 'OK' : 'ÉCHEC'}** (test automatique + vérification indépendante : à la clôture de chaque flèche, son niveau est recalculé et retrouvé parmi les niveaux tracés).
- b) VAH mensuel ~4 146 : **${vah.length}** flèche(s) rouge(s) (${vah.map(f => dt(f.tCloture) + ' sur ' + Math.round(f.zoneHaut)).join(' ; ') || 'aucune'}). Résistance 4 131–4 144 (zone de swing) : **${res4131.length}** flèche(s) rouge(s) (${res4131.map(f => dt(f.tCloture) + ', ' + f.touchesVues + ' touches vues').join(' ; ') || 'aucune'}). **Limite : aucune flèche sur cette zone en novembre** — sur cette série elle n’est plus une zone active avec 3 touches vues début novembre ; seul le VAH mensuel couvre les retournements de début novembre (5 nov. 04:00 et 9 nov. 21:00). Je n’ai pas réglé de seuil pour l’obtenir.
- c) Achats pendant la chute du 12 nov. (6 h–19 h UTC) : **${chute.length}**. **Mais** un achat existe à ${avant.map(f => dt(f.tCloture) + ' UTC, clôture ' + Math.round(f.prix) + ' sur ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut) + ' (' + f.touchesVues + ' touches vues)').join(' ; ') || '—'} : premier rebond sur un support actif avant la vraie chute (3 992 → 3 868). Il respecte les règles ; l’écarter serait ajusté au passé. À toi de juger s’il compte dans « la chute ».
- d) Cassure MA200 du 10 nov. 17:00 : **${ma10 ? 'présente' : 'ABSENTE'}**.
- e) Maximum sur 600 bougies : v4 **${m4}** contre v3 ${m3} ; total v4 ${F4.length} contre v3 ${F3.length} (29 annoncés dans le brief pour v3).
- f) Chaque flèche : niveau, type, touches vues (swing), date/heure d’apparition (tableau ci-dessous et infobulle : « repère de lecture, pas un ordre »).

## 5. Flèches v4
| clôture UTC | niveau | type | sens | touches vues | prix |
|---|---|---|---|---|---|
${F4.map(ligne).join('\n')}

Capture annotée : \`fleches-v4.png\` (16 oct. → 12 nov., niveaux en trait plein avec étiquette, flèches ▲ ▼ cyan MA200).
`);

/* image annotée : niveaux surveillés (trait plein + étiquette) tels qu'ils étaient À L'APPARITION de chaque flèche */
const deb = K.findIndex(b => b.t >= Date.UTC(2026, 9, 16)), S = K.slice(deb), N = S.length, MK = sma(K).slice(deb), lo = Math.min(...S.map(b => b.l)) - 20, hi = Math.max(...S.map(b => b.h)) + 20, W = 1800, Hh = 850, mg = 60;
const xr = i => mg + (i - deb) / (N - 1) * (W - 2 * mg), yr = p => Hh - mg - (p - lo) / (hi - lo) * (Hh - 2 * mg);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" style="background:#0b0f14;font-family:sans-serif">`;
for (const f of ret) { const x0 = Math.max(xr(f.i) - 55, mg), x1 = Math.min(xr(f.i) + 55, W - mg), col = f.dir < 0 ? '224,90,90' : '79,209,139', yb = yr(f.zoneBas), yh = yr(f.zoneHaut), y = (yb + yh) / 2;
  svg += `<rect x="${x0}" y="${Math.min(yb, yh)}" width="${x1 - x0}" height="${Math.max(2, Math.abs(yb - yh))}" fill="rgba(${col},.18)"/><line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="rgb(${col})" stroke-width="1.5"/><text x="${x0}" y="${y + (f.dir < 0 ? -4 : 12)}" fill="rgb(${col})" font-size="11">${f.niveauType === 'structure' ? f.niveauNom + ' ' + Math.round(f.zoneHaut) : 'swing ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut) + ' · ' + f.touchesVues + ' t.'}</text>`; }
for (let k = 0; k < N; k++) { const b = S[k], x = xr(deb + k), up = b.c >= b.o; svg += `<line x1="${x}" x2="${x}" y1="${yr(b.h)}" y2="${yr(b.l)}" stroke="${up ? '#4fd18b' : '#e05a5a'}"/><rect x="${x - 1.5}" y="${yr(Math.max(b.o, b.c))}" width="3" height="${Math.max(1, Math.abs(yr(b.o) - yr(b.c)))}" fill="${up ? '#4fd18b' : '#e05a5a'}"/>`; }
svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.5" points="${MK.map((m, k) => m == null ? '' : `${xr(deb + k)},${yr(m)}`).filter(Boolean).join(' ')}"/>`;
for (const f of F4.filter(f => f.i >= deb)) { const x = xr(f.i), up = f.dir > 0, y = up ? yr(K[f.i].l) + 14 : yr(K[f.i].h) - 14, col = f.type === 'ma_cassure' ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'; svg += `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="${col}"/>`; }
svg += `<text x="60" y="26" fill="#ccc" font-size="14">Flèches v4 (Kraken H1, 16 oct. → 12 nov.) : chaque flèche est posée sur un niveau en TRAIT PLEIN étiqueté (structure ou zone de swing active) ; vert achat, rouge vente, cyan MA200</text></svg>`;
fs.writeFileSync(path.join(ici, 'fleches-v4.svg'), svg);
try { const req = createRequire(path.resolve(ici, '..', '..', 'tests-navigateur', 'package.json')), pup = req('puppeteer-core'), nav = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] }); const p = await nav.newPage(); await p.setViewport({ width: W, height: Hh }); await p.setContent(`<body style="margin:0;background:#0b0f14">${svg}</body>`); await p.screenshot({ path: path.join(ici, 'fleches-v4.png') }); await nav.close(); } catch (e) { console.log('PNG non généré :', e.message); }
