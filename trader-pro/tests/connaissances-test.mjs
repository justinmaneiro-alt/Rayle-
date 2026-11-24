/* Tests de la base de connaissances : fichiers présents, marqués « tendance générale », module embarqué à jour, horaires du tableau = horaires calculés par le code, aucun module money management.
   Usage : node trader-pro/tests/connaissances-test.mjs */
import fs from 'node:fs';
import { lireConnaissances, genererModule } from '../outils/connaissances.mjs';
import { choisirConnaissances, CONNAISSANCES } from '../point/connaissances.js';
import { reperesDuJour } from '../lecture/sessions.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const L = lireConnaissances();
v(L.map(x => x.id).join() === 'sessions,ma200,volume,structure,macro', 'cinq fichiers : sessions, MA200, volume, structure, macro');
v(L.every(x => /tendance générale, \*\*pas une règle\*\*|Tendance générale, \*\*pas une règle\*\*|tendances générales, pas des règles/.test(x.texte)), 'chaque connaissance est marquée « tendance générale, pas une règle »');
v(L.every(x => !/money management|ratio risque|taille de position/i.test(x.texte)), 'aucun module sur le money management ni le ratio risque / récompense');
const src = fs.readFileSync(new URL('../point/connaissances-data.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); v(src === genererModule(), 'le module embarqué est à jour (node trader-pro/outils/connaissances.mjs)');
// le tableau des sessions doit dire la même chose que le code (jour d'hiver commun)
const R = reperesDuJour(Date.UTC(2026, 10, 24, 12)), n = s => s.replace(/\s/g, '').replace(/^0/, ''), doc = L[0].texte;
const ligne = (nom) => { const l = doc.split('\n').find(x => x.includes(nom)); return l ? n(l.split('|')[3] || '') : ''; };
v(ligne('Ouverture de Tokyo') === n(R.tokyoOuverture) && ligne('Ouverture de Londres') === n(R.londresOuverture) && ligne('LBMA, matin') === n(R.londresFixingOr), 'tableau : Tokyo, Londres, fixing du matin = code');
v(ligne('Ouverture COMEX') === n(R.comexOr) && ligne('Ouverture cash') === n(R.ouvertureCashUS) && ligne('LBMA, après-midi') === n(R.londresFixingOrPM) && ligne('Clôture de Londres') === n(R.londresCloture), 'tableau : COMEX, cash US, fixing de l’après-midi, clôture de Londres = code');
v(ligne('Clôture cash') === n(R.clotureCashUS) && ligne('Fin de la session New York') === n(R.clotureNY), 'tableau : clôtures de New York = code');
v(/14 h 30 à Paris/.test(doc) && /5 h au lieu de 6 h/.test(doc), 'le décalage de 3 semaines en mars et 1 semaine en octobre est expliqué');
v(choisirConnaissances('que veut dire la cassure de la MA200 ?')[0].id === 'ma200' && choisirConnaissances('que fait le CPI sur l’or ?')[0].id === 'macro' && choisirConnaissances('range asiatique à Londres')[0].id === 'sessions' && choisirConnaissances('bougie de volume extrême')[0].id === 'volume', 'le choix selon la question');
v(choisirConnaissances('blabla').length === 0 && choisirConnaissances('', { ids: ['macro'] }).length === 1 && CONNAISSANCES.length === 5, 'question sans rapport : rien chargé');
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
