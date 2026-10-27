// Tests de la détection du prénom en veille (15 phrases). Lancer :  node galaxie/tests/prenom-test.mjs
import { createRequire } from 'node:module';
const P = createRequire(import.meta.url)('../../core/voice/prenom-calcul.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// [phrase, actif attendu, demande attendue]
const cas = [
  ['Raylé', true, ''],
  ['Hey Raylé', true, ''],
  ['Dis-moi Raylé', true, ''],
  ['Raylé, quelle heure est-il ?', true, 'quelle heure est-il ?'],
  ['Rayle ouvre Mars', true, 'ouvre Mars'],
  ['Riley, ouvre Mars', true, 'ouvre Mars'],            // variante de reconnaissance
  ['Rallye, quelle heure est-il', true, 'quelle heure est-il'],
  ['Montre-moi le graphique du Bitcoin, Raylé', true, 'Montre-moi le graphique du Bitcoin'],
  ['Il faut que je trouve ma veste avant de partir', false, ''],   // bruit
  ['Je regarde la télé ce soir avec Paul', false, ''],
  ['Quelle heure est-il', false, ''],                    // demande sans prénom : jetée
  ['Ouvre Mars', false, ''],
  ['Le rayon des fruits est au fond du magasin', false, ''],       // faux ami : « rayon »
  ['On a pris le rail pour aller à Lyon', false, ''],              // faux ami : « rail »
  ['Une soirée réelle et sans filtre', false, ''],                 // faux ami : « réelle »
];
for (const [phrase, actif, demande] of cas) {
  const r = P.enVeille(phrase, '');
  v('actif « ' + phrase + ' »', r.actif === actif, JSON.stringify(r));
  if (actif) v('demande « ' + phrase + ' »', r.demande === demande, JSON.stringify(r));
}
// liste configurable : « réelle » devient un prénom seulement si Justin l'ajoute
v('réelle ajoutée par Justin', P.enVeille('Réelle, ouvre Mars', 'réelle').actif === true);
v('réelle absente par défaut', P.enVeille('Réelle, ouvre Mars', '').actif === false);
v('prénom + demande d’un coup', P.enVeille('Hey Raylé, ouvre Mars', '').demande === 'ouvre Mars');
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : 'OK ' + ok + ' vérifications');
process.exit(ko ? 1 : 0);
