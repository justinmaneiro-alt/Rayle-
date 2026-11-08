/* Tests de la PHASE E du terminal de Rayle (pur, Node) : carte de chaleur du carnet (pas rond, colonnes, agrégation par bougie,
   échelle, purge au-delà de la limite). Usage : node agent-trading/tests/terminal-e-test.mjs */
import { pasRond, pasPour, colonne, agreger, echelle, intensite, aPurger, octets, CASES_MAX } from '../front/terminal/chaleur-calcul.js';
import { coucheDepuisTexte, COUCHES } from '../front/terminal/couches-terminal.js';
import { intention } from '../front/terminal/lecture-rayle.js';

let ok = 0, ko = 0;
const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };
t(pasRond(0.7) === 0.5 && pasRond(1.8) === 2 && pasRond(23) === 25 && pasRond(0.00033, 0.00001) === 0.00025, 'pas ronds');
t(pasPour(4000, 0.01) > 0 && 4000 * 0.02 / pasPour(4000, 0.01) <= CASES_MAX * 1.5, 'environ 100 cases sur ± 1 %');
const c = { bids: new Map([[99.95, 2], [99.5, 10], [90, 999]]), asks: new Map([[100.05, 1], [100.6, 20]]) };
const col = colonne(c, 1000, 0.1);
t(col && Math.abs(col.mid - 100) < 1e-9 && col.q.length <= CASES_MAX + 2, 'colonne : milieu et nombre de cases');
const k = p => Math.floor((p - col.p0) / 0.1 + 1e-9);
t(col.q[k(99.5)] === Math.round(995) && col.cote[k(99.5)] === 1 && col.cote[k(100.6)] === -1, 'quantité en $ par case ; côté dominant');
t(col.q.reduce((a, b) => a + b, 0) < 999 * 90, 'hors de ± 1 % : ignoré');
t(colonne({ bids: new Map(), asks: new Map() }, 1, 0.1) === null, 'carnet vide : pas de colonne');
const cols = [colonne(c, 0, 0.1), colonne(c, 1000, 0.1), colonne(c, 61000, 0.1)];
const B = agreger(cols, 0, 60000); t(B.length === 2 && B[0].cases.find(x => Math.abs(x.p - 99.5) < 1e-9).q === 995, 'agrégation par bougie (moyenne des secondes)');
const ref = echelle(B); t(ref > 0 && intensite(ref, ref) === 1 && intensite(ref * 9, ref) === 1 && Math.abs(intensite(ref / 4, ref) - 0.5) < 1e-9, 'intensité en racine, plafonnée');
t(octets(col) > 0, 'taille estimée d’une colonne');
const L = Array.from({ length: 10 }, (_, i) => ({ cle: ['OR', i], octets: 100 }));
t(aPurger(900, 1000, L).length === 0, 'sous la limite : rien à purger');
t(JSON.stringify(aPurger(1000 + 1, 1000, L)) === JSON.stringify(L.slice(0, 2).map(x => x.cle)), 'au-delà : les plus anciennes jusqu’à 90 % de la limite');
t(COUCHES.some(x => x.id === 'chaleur' && !x.defaut) && coucheDepuisTexte('affiche la carte de chaleur') === 'chaleur' && intention('affiche la carte de chaleur').type === 'couche', 'couche « chaleur » (désactivée par défaut, voix)');
console.log(`terminal phase E : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
