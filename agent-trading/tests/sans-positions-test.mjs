/* Test « sans positions » : l'affichage des positions de Rayle (Entrée / Stop / Cible / Lecture) est une couche du graphique, éteinte par défaut ; le dessin lui-même est inchangé. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { dessinerPropositions } from '../front/or/institutionnel-dessin.js';
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../front/or/graphique-or.js'), 'utf8');
v(/positionsRayle: 'Positions de Rayle sur le graphique'/.test(src), 'la couche « Positions de Rayle sur le graphique » est dans la liste des couches');
v(/positionsRayle: false/.test(src), 'elle est éteinte par défaut');
v(/props: etat\.couches\.positionsRayle === true \? inst\.props : \[\]/.test(src), 'les propositions ne sont transmises au dessin que si la couche est cochée');
v(/marquesJournal = \(\) => \(ictOn\(\) && etat\.couches\.positionsRayle !== true \? \[\] : etat\.marques\)/.test(src), 'avec l\'ICT actif, les flèches de trades du journal ne sont pas dessinées (sauf couche cochée)');
v(/propositions\(L\) \{ inst\.props = L \|\| \[\]/.test(src), 'le calcul et le registre sont inchangés : graph.propositions() garde toujours les propositions');
const textes = []; const ctx = new Proxy({}, { get: (_, k) => k === 'fillText' ? t => textes.push(t) : k === 'measureText' ? () => ({ width: 50 }) : () => {}, set: () => true });
const T = { width: 800, height: 400 }, P = [{ tCloture: 1, entree: 3654.17, stop: 3646, cible: 3700, rBrut: 1.8, nom: 'Test', etiquette: 'Lecture' }], o = { xDeT: () => 100, yDe: p => 400 - (p - 3600) * 2, mobile: false };
dessinerPropositions(ctx, T, [], o); v(textes.length === 0, 'aucune proposition transmise : rien n\'est dessiné');
dessinerPropositions(ctx, T, P, o); v(textes.some(t => /^Entrée 3654\.17/.test(t)) && textes.some(t => /^Stop /.test(t)) && textes.some(t => /^Cible /.test(t)), 'couche cochée : le dessin d\'origine reste disponible (Entrée / Stop / Cible)');
console.log(ko ? `${ko} échec(s)` : 'tous les tests passent'); process.exit(ko ? 1 : 0);
