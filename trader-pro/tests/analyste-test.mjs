/* v10 phases 1 et 2 : manuel de Rayle (couverture de chaque outil, recherche), structure de marché, premium/discount, déclarations d'outils. Usage : node trader-pro/tests/analyste-test.mjs */
import fs from 'node:fs';
import { decouperManuel, chercherFiches, structure, premiumDiscount, DECLARATIONS_ANALYSTE, DECLARATION_ANNOTER } from '../cerveau/analyste.js';
import { norm, DECLARATIONS } from '../cerveau/outils.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const F = decouperManuel(fs.readFileSync('trader-pro/cerveau/manuel-rayle.md', 'utf8'));
v('le manuel a au moins 35 fiches', F.length >= 35, String(F.length));
v('chaque fiche a des mots-clés, une fenêtre ou un texte utile', F.every(f => f.motsCles.length >= 2 && f.corps.length > 150), F.filter(f => f.motsCles.length < 2 || f.corps.length <= 150).map(f => f.titre).join(' | '));
const SUJETS = { 'ma200': 'MA200', 'flèches de niveaux': 'flèches de niveaux', fibonacci: 'Fibonacci', 'outil position': 'outil position', 'badge de régime': 'badge de régime', 'voyant d’alignement': 'alignement', 'filtre annonces': 'filtre annonces', 'statistiques des flèches': 'statistiques', 'volume profile': 'Volume Profile', 'poc nus': 'POC nus', 'vwap ancré': 'VWAP', footprint: 'footprint', delta: 'delta', cvd: 'CVD', mfi: 'MFI', 'carnet': 'carnet', 'absorption': 'absorption', 'faux breakout': 'faux breakout', 'niveaux de réaction': 'réaction', pdh: 'PDH', pwl: 'PWL', premium: 'premium', fvg: 'FVG', 'order block': 'order blocks', 'égaux hauts': 'égaux hauts', 'balayage de liquidité': 'balayages', cot: 'COT', commerciaux: 'COT', 'petits spéculateurs': 'COT', macro: 'macro', taux: 'macro', 'score de marché': 'score de marché', 'volume net': 'volume net', calendrier: 'calendrier', couverture: 'Couverture', 'risque global': 'Risque global', setup: 'setup', 'mes actifs': 'Mes actifs', investissement: 'Investissement' };
for (const [q, attendu] of Object.entries(SUJETS)) { const r = chercherFiches(F, q, norm, 2); v('manuel : « ' + q + ' » trouve une fiche « ' + attendu + ' »', r.some(f => norm(f.titre + ' ' + f.motsCles.join(' ')).includes(norm(attendu))), r.map(f => f.titre).join(' | ') || 'aucune'); }
v('un sujet inconnu ne renvoie rien (pas d’invention)', chercherFiches(F, 'recette de la tarte aux pommes', norm).length === 0);
v('le manuel n’affirme jamais envoyer des ordres', !/envoie (un|des) ordre/i.test(fs.readFileSync('trader-pro/cerveau/manuel-rayle.md', 'utf8')));
/* structure */
const B = (hs, ls) => hs.map((h, i) => ({ t: i, o: (h + ls[i]) / 2, h, l: ls[i], c: (h + ls[i]) / 2 }));
const mont = []; for (let i = 0; i < 40; i++) { const base = 100 + i * 1.2 + (Math.floor(i / 4) % 2 ? -2.5 : 2.5) * Math.sin(i); mont.push([base + 2, base - 2]); }
const sh = structure(B(mont.map(x => x[0]), mont.map(x => x[1])), 2); v('structure haussière détectée sur une série qui monte', sh && sh.sens === 1, JSON.stringify(sh));
const desc = mont.map(x => [300 - x[0], 300 - x[1] - 4]).map(([a, b]) => [Math.max(a, b), Math.min(a, b)]); const sb = structure(B(desc.map(x => x[0]), desc.map(x => x[1])), 2); v('structure baissière détectée sur une série qui baisse', sb && sb.sens === -1, JSON.stringify(sb));
v('structure : série trop courte → null', structure(B([1, 2, 3], [0, 1, 2]), 3) === null);
const pd = premiumDiscount(150, B([200, 190, 180], [100, 110, 120])); v('premium/discount : 150 dans [100,200] = équilibre', pd && /équilibre/.test(pd.zone), JSON.stringify(pd));
v('premium/discount : 190 = premium', /premium/.test(premiumDiscount(190, B([200], [100])).zone)); v('premium/discount : 110 = discount', /discount/.test(premiumDiscount(110, B([200], [100])).zone));
/* déclarations */
const noms = DECLARATIONS.map(d => d.name); for (const n of ['manuel', 'analyse_marche', 'marche_global', 'lecture_graphique']) v('outil déclaré au modèle : ' + n, noms.includes(n));
v('outils analyste sans « properties » vide (refusé par Gemini)', [...DECLARATIONS_ANALYSTE, DECLARATION_ANNOTER].every(d => !d.parameters || (d.parameters.properties && Object.keys(d.parameters.properties).length)));
v('annoter_graphique : 4 types, 8 marques au plus', DECLARATION_ANNOTER.parameters.properties.annotations.items.properties.type.enum.length === 4 && /8 marques/.test(DECLARATION_ANNOTER.description));
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
