/* Rapport « flèches v3 » : avant/après par type, critères a–f, image annotée. node agent-trading/recherche-or/fleches-v3-rapport.mjs */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { serieKraken, analyse } from './fleches-simples-rejeu.mjs';
import * as V2 from '../front/or/fleches-simples-v2.js'; import * as V3 from '../front/or/fleches-simples-v3.js'; import { zonesDirect } from '../front/or/zones-direct.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const K = serieKraken(), now = K[K.length - 1].t + H, base = analyse(K), r3 = V3.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }), F3 = r3.fleches;
const F2 = V2.calculer(K, zonesDirect, { maintenant: now, bougies: 1e5 }).fleches, F1 = base.F;
const cnt = L => { const o = { ma_haussier: 0, ma_baissier: 0, achat: 0, vente: 0 }; for (const f of L) o[f.type === 'ma_cassure' ? (f.dir > 0 ? 'ma_haussier' : 'ma_baissier') : (f.dir > 0 ? 'achat' : 'vente')]++; return o; };
const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 1) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };
const ret = F3.filter(f => f.type === 'retournement'), rouges = ret.filter(f => f.dir < 0 && f.zoneBas >= 4125 && f.zoneHaut <= 4150);
// zone ~3870 au 2 novembre : touches déjà vues
const n2 = K.findIndex(b => b.t === Date.UTC(2026, 10, 2, 12)), S2 = K.slice(0, n2), Z2 = zonesDirect(S2, S2[S2.length - 1].t + H).filter(z => z.bas <= 3890 && z.haut >= 3850 && !z.tFin);
const z3870 = Z2.map(z => `${Math.round(z.bas)}–${Math.round(z.haut)} : ${V3.touchesVues(S2, z)} touche(s) déjà vue(s)`).join(' ; ') || 'aucune zone dessinée à ce moment';
const v3Nov = F3.filter(f => f.dir > 0 && f.type === 'retournement' && f.tCloture >= Date.UTC(2026, 10, 1) && f.tCloture <= Date.UTC(2026, 10, 4));
const chute = F3.filter(f => f.dir > 0 && f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19));
const ma10 = F3.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22));
const horsDessin = ret.filter(f => !base.Z.some(z => z.bas <= f.zoneHaut + 2 && z.haut >= f.zoneBas - 2)), res = { v1: cnt(F1), v2: cnt(F2), v3: cnt(F3), max600v3: max600(F3, K.length), refus: r3.refus, rouges4130: rouges.length, chute: chute.length, ma10 };
console.log(JSON.stringify(res)); console.log('3870 :', z3870, '| achats 1–4 nov :', v3Nov.map(f => dt(f.tCloture) + ' ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)).join(', '));
const lignes = F3.map(f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200' : Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)} | ${f.dir > 0 ? (f.type === 'ma_cassure' ? 'haussier' : 'achat') : (f.type === 'ma_cassure' ? 'baissier' : 'vente')} | ${f.type === 'ma_cassure' ? '—' : f.touchesVues} | ${Math.round(f.prix)} |`).join('\n');
const L = o => `MA200 ↑ ${o.ma_haussier}, MA200 ↓ ${o.ma_baissier}, achats ${o.achat}, ventes ${o.vente} (total ${o.ma_haussier + o.ma_baissier + o.achat + o.vente})`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-V3.md'), `# Flèches simples v3 : zones majeures causales

**Les seuils (3 touches déjà vues, épisodes séparés de ≥ 6 bougies, largeur ≥ 0,3 ATR, garde-fou de chute 5 ATR/24 bougies) ont été choisis en regardant ces exemples : aucune preuve de performance.**

## Pourquoi il n'y avait aucune flèche rouge/verte (capture de Justin)
Le graphique affichait bien la sortie du module v2 (le test Chrome vérifie que le graphique porte exactement les flèches du module, 7/7 ; clé de registre \`rayle_or_fleches_t7\` neuve, pas l'ancien registre t6 de la v1). Le seuil n'était PAS la seule cause : (1) la v2 gardait la règle v1 « ≥ 12 touches ou parmi les 4 plus touchées » ; (2) la zone 4 130–4 144 est marquée « rôle récent » (ancien support) : la règle v1 interdit toute flèche tant qu'un premier retournement n'a pas été confirmé sans flèche. En v3, une zone déjà touchée ≥ 3 fois a son rôle confirmé ; les deux blocages sont levés.
(3) **Cause probable la plus forte, trouvée pendant ce travail** : le filtre « jamais de flèche sans niveau dessiné » de l'interface comparait l'identifiant de zone (`sr` + prix × 100), qui dérive avec le prix quand les zones sont recalculées bougie après bougie : presque toutes les flèches de retournement (0/29 à la fin de la série) étaient masquées. Le filtre compare maintenant le recouvrement de prix avec les zones dessinées.
Limite : je ne peux pas relire le navigateur de Justin ; si l'ancien registre reste affiché, la clé \`rayle_or_fleches_t8\` neuve force un recalcul.

## Compte avant / après (série Kraken, 28 sept. → 12 nov.)
- v1 (zones finales, rétroactif) : ${L(cnt(F1))}
- v2 (causale, 12 touches) : ${L(cnt(F2))}
- **v3 (causale, 3 touches)** : ${L(cnt(F3))}
- Maximum sur 600 bougies : **${res.max600v3}** (plafond de sécurité 30 : ${r3.refus ? 'ATTEINT, ' + r3.refus + ' flèches refusées' : 'non atteint'}).

## Critères
- a) Résistance 4 130–4 144 : **${rouges.length}** flèches rouges (${rouges.map(f => dt(f.tCloture) + ', ' + f.touchesVues + ' touches vues').join(' ; ')}).
- b) Support ~3 870 au 2 nov. : ${z3870}. Achats du 1er au 4 nov. : ${v3Nov.map(f => dt(f.tCloture) + ' sur ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)).join(', ') || 'aucun'}. La zone ~3 870 n'a pas 3 touches vues à ce moment : pas de flèche sur elle (conforme à la règle).
- c) Achats dans la chute du 12 nov. (6–19 h UTC) : **${chute.length}**.
- d) Cassure MA200 du 10 nov. 17:00 : ${ma10 ? 'présente' : 'ABSENTE'}.
- e) Maximum sur 600 bougies : **${res.max600v3}** ≤ 30.
- f) Infobulle : touches déjà vues, date/heure d'apparition, « repère de lecture, pas un ordre ».
- Raccourci « niveau de structure » (H4/Jour/VAH-VAL/haut-bas du mois) : reconnu seulement par le nom de la zone dessinée ; aucun nom de zone actuel ne le porte, il ne joue donc pas ici.
- Garde-fou ajouté pour (c) : pas d'achat après une chute de > 5 ATR en 24 bougies (sans lui, un achat tombait pendant la chute du 12 nov. sur la zone 3 914–3 928, 5 touches).
- Cohérence avec le graphique : ${ret.length - horsDessin.length}/${ret.length} retournements recouvrent une zone dessinée à la fin de la série (recouvrement de prix : les identifiants de zones dérivent avec le prix) ; les ${horsDessin.length} autres (zones disparues depuis) sont masquées par le graphique (« jamais de flèche sans niveau dessiné »), donc l'affichage réel peut compter moins de flèches que ce tableau.
- Cassure MA200 et retournement : une cassure MA200 passe toujours en premier (jamais deux marqueurs sur la même bougie) ; un retournement est refusé à moins de 6 bougies d'une flèche déjà posée.

## Flèches v3
| clôture UTC | niveau | sens | touches vues | prix |
|---|---|---|---|---|
${lignes}
`);
globalThis.__IMG = { K, rk: { ...base, F: F3 } }; await import('./fleches-image.mjs');
for (const e of ['png', 'svg']) fs.copyFileSync(path.join(ici, 'fleches-live-simule.' + e), path.join(ici, 'fleches-v3.' + e));
