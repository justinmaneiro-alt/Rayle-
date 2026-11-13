/* Rapport de l'affinage des flèches Direct : tableau avant/après (stable v6 contre affinée v7), cas de contrôle, image annotée des deux versions.
   node agent-trading/recherche-or/fleches-affinage-rapport.mjs   → RAPPORT-FLECHES-AFFINAGE.md + outils-restructuration/captures/fleches-affinage-annotee.png */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as V6 from '../front/or/fleches-simples-v6.js'; import * as V7 from '../front/or/fleches-simples-v7.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { sma } from '../front/or/fleches-lecture-v1.js'; import { serie13 } from './fleches-v6-diag.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 };
const r6 = V6.calculer(K, zonesDirect, o), r7 = V7.calculer(K, zonesDirect, o), rReg = V7.calculer(K, zonesDirect, { ...o, regime: true });
const type = f => f.type === 'ma_cassure' ? 'MA200' : f.type === 'rebond_base' ? 'rebond après base' : 'retournement';
const col = f => !f.contre;
const c6 = r6.fleches.filter(col), c7 = r7.fleches.filter(col), id6 = new Set(c6.map(f => f.id)), id7 = new Set(c7.map(f => f.id));
const crees = c7.filter(f => !id6.has(f.id)), supp = c6.filter(f => !id7.has(f.id)), inch = c7.filter(f => id6.has(f.id));
const lib = f => `${dt(f.tCloture)} · ${f.dir > 0 ? 'achat' : 'vente'} · ${type(f)}${f.deuxiemeTouche ? ' (2ᵉ touche)' : ''}${f.stabilisation ? ' (stabilisation ' + f.stabilisation + ')' : ''}`;
const U = (m, j, h) => Date.UTC(2026, m, j, h);
const ctrl = (nom, ok, det = '') => `| ${nom} | ${ok ? '✅ conservé' : '❌ perdu'} | ${det} |`;
const f5 = r7.fleches.find(f => f.type === 'retournement' && f.dir < 0 && !f.contre && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0)), f9 = r7.fleches.find(f => f.dir < 0 && !f.contre && f.tCloture === U(10, 9, 21));
const m10 = r7.fleches.find(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= U(10, 10, 16) && f.tCloture <= U(10, 10, 22)), mh = r7.fleches.filter(f => f.type === 'ma_cassure' && f.dir > 0);
const chute = r7.fleches.filter(f => f.dir > 0 && f.type !== 'ma_cassure' && !f.contre && !f.stabilisation && f.tCloture >= U(10, 12, 6) && f.tCloture <= U(10, 12, 19));
const rb2 = r7.fleches.find(f => f.type === 'rebond_base' && f.dir > 0 && f.tCloture === U(10, 2, 0));
const reg5 = !rReg.fleches.some(f => f.type === 'retournement' && f.dir < 0 && !f.contre && f.tCloture >= U(10, 5, 0) && f.tCloture < U(10, 6, 0)), reg9 = !rReg.fleches.some(f => f.dir < 0 && !f.contre && f.tCloture === U(10, 9, 21));
const gris = L => L.filter(f => f.contre).length;
// ── image : deux panneaux (stable en haut, affinée en bas), du 28 oct. au 13 nov.
const deb = K.findIndex(b => b.t >= U(9, 28, 0)), S = K.slice(deb), N = S.length, MK = sma(K).slice(deb), W = 1800, PH = 520, HH = PH * 2 + 40, mg = 64;
const lo0 = Math.min(...S.map(b => b.l)) - 14, hi0 = Math.max(...S.map(b => b.h)) + 22;
const X = k => mg + (k + 0.5) / N * (W - 2 * mg), Y = (p, oy) => oy + PH - 46 - (p - lo0) / (hi0 - lo0) * (PH - 100);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HH}" font-family="Segoe UI, Arial, sans-serif"><rect width="${W}" height="${HH}" fill="#0b0f14"/>`;
const tri = (x, y, up, fill, stroke) => `<path d="M${x},${up ? y - 13 : y + 13} l-7,${up ? 13 : -13} h14 z" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="1.8"` : ''}/>`;
function panneau(R, oy, titre, avecGris) {
  svg += `<text x="${mg}" y="${oy + 24}" fill="#ccc" font-size="16">${esc(titre)}</text>`;
  for (let k = 0; k < N; k++) { const b = S[k], x = X(k), up = b.c >= b.o, c = up ? '#4fd18b' : '#e05a5a'; svg += `<line x1="${x}" x2="${x}" y1="${Y(b.h, oy)}" y2="${Y(b.l, oy)}" stroke="${c}"/><rect x="${x - 1.6}" y="${Y(Math.max(b.o, b.c), oy)}" width="3.2" height="${Math.max(1, Math.abs(Y(b.o, oy) - Y(b.c, oy)))}" fill="${c}"/>`; }
  svg += `<polyline fill="none" stroke="#c9b27a" stroke-width="1.6" points="${MK.map((m, k) => m == null || m < lo0 || m > hi0 ? '' : `${X(k)},${Y(m, oy)}`).filter(Boolean).join(' ')}"/>`;
  if (avecGris) for (const k of R.contacts.filter(k => k.i >= deb)) svg += `<circle cx="${X(k.i - deb)}" cy="${k.dir > 0 ? Y(K[k.i].l, oy) + 12 : Y(K[k.i].h, oy) - 12}" r="3" fill="#5d6872"/>`;
  for (const f of R.fleches.filter(f => f.i >= deb)) { const x = X(f.i - deb), up = f.dir > 0, y = up ? Y(K[f.i].l, oy) + 16 : Y(K[f.i].h, oy) - 16;
    if (f.contre) { if (avecGris) svg += `<circle cx="${x}" cy="${y}" r="4" fill="#7d8791"/>`; }
    else if (f.invalidee) svg += tri(x, y, up, 'none', '#7d8791');
    else if (f.type === 'rebond_base') svg += tri(x, y, up, 'none', up ? '#2ecc71' : '#ff4d4d') + `<text x="${x - 4}" y="${up ? y + 14 : y - 14}" fill="#ffd27a" font-size="12" font-weight="700">B</text>`;
    else svg += tri(x, y, up, f.type === 'ma_cassure' ? '#8fd0e3' : up ? '#2ecc71' : '#ff4d4d'); }
  for (const s of (R.supprimees || []).filter(s => s.tCloture - H >= S[0].t)) { const i = K.findIndex(b => b.t === s.t), x = X(i - deb), up = s.dir > 0, y = up ? Y(K[i].l, oy) + 16 : Y(K[i].h, oy) - 16; svg += `<path d="M${x - 7},${y - 7} l14,14 m0,-14 l-14,14" stroke="#ffd27a" stroke-width="2"/>`; }
  const rbx = R.fleches.find(f => f.type === 'rebond_base' && f.tCloture === U(10, 2, 0)); if (rbx) { const x = X(rbx.i - deb), y = Y(K[rbx.i].l, oy) + 16; svg += `<circle cx="${x}" cy="${y - 6}" r="20" fill="none" stroke="#ffd27a" stroke-width="2"/><text x="${x + 24}" y="${y + 10}" fill="#ffd27a" font-size="13">2 nov. : rebond après base</text>`; }
}
panneau(r6, 0, 'Direct (stable, v6) : 28 oct. → 13 nov. · flèches vertes / rouges / cyan, points gris = contacts bloqués', true);
panneau(r7, PH + 40, 'Direct (affiné, v7) : mêmes bougies · flèche creuse « B » = rebond après base · croix jaune = flèche supprimée par l\'anti-aller-retour · points gris masqués par défaut', false);
svg += '</svg>';
const { Resvg } = await import('@resvg/resvg-js'); const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } }).render().asPng();
const sortie = path.join(ici, '..', '..', 'outils-restructuration', 'captures'); fs.mkdirSync(sortie, { recursive: true }); fs.writeFileSync(path.join(sortie, 'fleches-affinage-annotee.png'), png);
const lst = L => L.length ? L.map(f => '- ' + lib(f)).join('\n') : '- (aucune)';
const sup = r7.supprimees.map(s => { const f = r6.fleches.find(q => q.id === s.id); return `- ${dt(s.tCloture)} · ${s.dir > 0 ? 'achat' : 'vente'} supprimé (flèche de sens opposé de ${dt(s.avecT)})${f ? '' : ' [n\'existait pas dans la stable : conséquence en chaîne]'}`; }).join('\n') || '- (aucune)';
const md = `# Flèches Direct affinées (v7) contre Direct (stable, v6)

Série : Kraken PF_XAUUSD H1, ${K.length} bougies (${dt(K[0].t)} → ${dt(K.at(-1).t)}). **Ces règles ont été choisies en regardant des exemples précis de cette série (5, 9, 10, 12 nov. et le rebond du 2 nov.) : aucune preuve de performance, aucun test hors échantillon. Outil de lecture seulement, jamais un ordre.**

## Ce qui est livré
- **« Direct »** (par défaut) = \`front/or/fleches-simples-v7.js\` ; **« Direct (stable) »** = la v6 inchangée (registres séparés, clés \`rayle_or_*_t12\` contre \`_t11\`). Fichiers scellés (v1, v5, v6) non touchés.
- **1. Points gris** : masqués par défaut dans « Direct » (case Couches « Points gris (raisons de blocage) », mémorisée) ; « Direct (stable) » les montre toujours comme avant.
- **2. Régime par la MA200** : codé (option \`regime: true\`, contre-tendance = dernière cassure MA200 confirmée de sens opposé) mais **DÉSACTIVÉ PAR DÉFAUT** : activé, il fait disparaître deux cas de contrôle (vente du 5 nov. : ${reg5 ? 'perdue' : 'conservée'} ; vente du 9 nov. 21:00 : ${reg9 ? 'perdue' : 'conservée'}), car une cassure haussière de la MA200 le 4 nov. 06:00 rend toute vente suivante « contre-tendance ». Avec l'option active : ${gris(rReg.fleches)} points gris contre ${gris(r7.fleches)} par défaut. La règle d'origine de la v6 (MA200 en baisse sur 48 bougies + plus bas plus bas) reste donc en vigueur dans « Direct ». Exceptions (base de 8 bougies, divergence RSI, 2ᵉ touche) conservées dans les deux cas.
- **3. Anti-aller-retour (12 bougies)** : actif. ${r7.supprimees.length} flèches colorées supprimées sur la série (liste ci-dessous).
- **4. Rebond après base** : actif. ${r7.fleches.filter(f => f.type === 'rebond_base').length} flèches sur la série. Paramètres : chute ≥ 5 ATR en 48 bougies, base ≥ 8 bougies H1 de range ≤ 1,5 ATR sans nouvel extrême (par rapport aux 16 bougies précédentes), clôture à plus de **1 ATR** au-dessus du haut de la base (marge ajoutée après essai : sans elle, le bruit d'un week-end plat déclenche des flèches ; elle ne figurait pas dans la consigne), ATR de référence = moyenne des 48 dernières bougies (l'ATR du jour s'effondre sur un week-end plat), une par sens et par tranche de 48 bougies, cède la place à une flèche de niveau sur la même bougie ou à moins de 6 bougies. Stop 0,2 ATR sous le bas de la base (miroir : au-dessus du haut), TP1 = 1 R, TP2 = 2 R. **Choisie en regardant l'exemple du 2 novembre** (clôture de 03:00 Paris, 23:00 UTC du 1ᵉʳ → flèche à ${rb2 ? dt(rb2.tCloture) : 'absente'}).

## Tableau avant / après (flèches colorées : vert, rouge, cyan, rebond ; hors points gris)
| | Direct (stable, v6) | Direct (affiné, v7) |
|---|---|---|
| flèches colorées | ${c6.length} | ${c7.length} |
| dont achats / ventes / MA200 / rebonds | ${c6.filter(f => f.type === 'retournement' && f.dir > 0).length} / ${c6.filter(f => f.type === 'retournement' && f.dir < 0).length} / ${c6.filter(f => f.type === 'ma_cassure').length} / 0 | ${c7.filter(f => f.type === 'retournement' && f.dir > 0).length} / ${c7.filter(f => f.type === 'retournement' && f.dir < 0).length} / ${c7.filter(f => f.type === 'ma_cassure').length} / ${c7.filter(f => f.type === 'rebond_base').length} |
| points gris (contre-tendance) | ${gris(r6.fleches)} | ${gris(r7.fleches)} (masqués par défaut) |
| créées / supprimées / inchangées | | **${crees.length} créées · ${supp.length} supprimées · ${inch.length} inchangées** |

### Créées (absentes de la stable)
${lst(crees)}

### Supprimées (présentes dans la stable)
${lst(supp)}

### Supprimées par l'anti-aller-retour (détail)
${sup}

## Cas de contrôle (tous testés dans \`tests/fleches-simples-v7-test.mjs\`)
| cas | résultat | détail |
|---|---|---|
${ctrl('cassure MA200 baissière du 10 nov.', !!m10, m10 ? dt(m10.tCloture) : '')}
${ctrl('vente rouge du 5 nov. (VAH mensuel)', !!f5, f5 ? dt(f5.tCloture) : '')}
${ctrl('vente rouge du 9 nov. 21:00 (2ᵉ touche, 4 131–4 144)', !!(f9 && f9.deuxiemeTouche), f9 ? dt(f9.tCloture) : '')}
${ctrl('cassure MA200 haussière du début de rallye', mh.length > 0, mh.map(f => dt(f.tCloture)).join(', '))}
${ctrl('zéro achat coloré dans la chute du 12 nov. (6 h–19 h UTC) hors stabilisation', chute.length === 0, chute.length + ' achat(s)')}
${ctrl('rebond du 2 nov. (≈ 3 900) = flèche « rebond après base »', !!rb2, rb2 ? `${rb2.baseBougies} bougies de base, chute de ${rb2.chuteAtr} ATR, ${dt(rb2.tCloture)}` : '')}

## Limites honnêtes
- Une seule série de 1 440 bougies (≈ 60 jours), 10 cassures MA200 : aucune statistique possible. Les règles ont été ajustées sur ces exemples.
- Le stop d'un rebond après base sur un week-end plat est très serré en points (la base fait quelques points) : repère de lecture, pas un ordre.
- L'anti-aller-retour supprime aussi des flèches qui auraient été justes (voir la liste) : c'est le prix d'une carte moins chargée.

Capture annotée des deux versions : \`outils-restructuration/captures/fleches-affinage-annotee.png\`. Captures Chrome : \`fleches-affinage-{1600,1024,390}.png\`.
`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-AFFINAGE.md'), md);
console.log(`stable ${c6.length} colorées · affinée ${c7.length} · créées ${crees.length} · supprimées ${supp.length} · inchangées ${inch.length} · anti ${r7.supprimees.length}`);
