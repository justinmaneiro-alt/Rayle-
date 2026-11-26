/* Tests de la base de connaissances : fichiers présents, marqués « tendance générale », module embarqué à jour, horaires du tableau = horaires calculés par le code, aucun module money management.
   Usage : node trader-pro/tests/connaissances-test.mjs */
import fs from 'node:fs';
import { lireConnaissances, genererModule } from '../outils/connaissances.mjs';
import { choisirConnaissances, connaissancesPour, CONNAISSANCES } from '../point/connaissances.js';
import { reperesDuJour } from '../lecture/sessions.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const L = lireConnaissances();
v(L.map(x => x.id).join() === 'sessions,ma200,volume,structure,macro,ict,ict-unites', 'sept fichiers : sessions, MA200, volume, structure, macro, ict, ict-unites');
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
v(choisirConnaissances('blabla').length === 0 && choisirConnaissances('', { ids: ['macro'] }).length === 1 && CONNAISSANCES.length === 7, 'question sans rapport : rien chargé');
/* ICT : routage par les mots, et chargement forcé des deux fichiers (le mot « w » du fichier structure attrape « lows » : le routage par mots seul peut en perdre un) */
v(choisirConnaissances('explique-moi le graphique H1 en ICT').some(c => c.id === 'ict-unites'), 'ICT : « explique-moi le graphique H1 en ICT » charge ict-unites');
v(choisirConnaissances('c’est quoi un order block').some(c => c.id === 'ict'), 'ICT : « c’est quoi un order block » charge ict');
v(choisirConnaissances('', { ids: ['ict', 'ict-unites'] }).map(c => c.id).join() === 'ict,ict-unites', 'ICT : les deux fichiers se chargent toujours par leurs identifiants');
v(choisirConnaissances('que veut dire la cassure de la MA200 ?')[0].id === 'ma200' && choisirConnaissances('range asiatique à Londres')[0].id === 'sessions', 'ICT : les routages existants (MA200, range asiatique) ne changent pas');
const tIct = L.filter(x => /^ict/.test(x.id)).map(x => x.texte).join('\n'); v(/Tendance générale, \*\*pas une règle\*\*/.test(L.find(x => x.id === 'ict').texte) && /order block/i.test(tIct) && !/\b(achète|vends)\b/i.test(tIct.replace(/jamais « achète » ni « vends »|Jamais « achète » ni « vends »|Dire « achète » ou « vends »/g, '')), 'ICT : marqué « pas une règle », jamais d’ordre dans les textes');
/* chargement forcé des deux fichiers quand la question touche l'ICT (mots ou mode ICT affiché), même quand le routage par mots en perdrait un */
{ const ids = (q, o) => connaissancesPour(q, o).map(c => c.id);
  v(['qu’est-ce que tu vois sur mes lows en ICT ?', 'où est la liquidité ?', 'c’est quoi un FVG', 'fais-moi le top-down'].every(q => ids(q).includes('ict') && ids(q).includes('ict-unites')), 'ICT : une question ICT charge toujours ict ET ict-unites');
  v(ids('bonjour', { modeIct: true }).join() === 'ict,ict-unites', 'ICT : le mode ICT affiché charge les deux fichiers');
  v(ids('que fait le CPI sur l’or ?').join() === 'macro' && !ids('que veut dire la cassure de la MA200 ?').includes('ict'), 'ICT : une question sans rapport ne charge pas l’ICT'); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
