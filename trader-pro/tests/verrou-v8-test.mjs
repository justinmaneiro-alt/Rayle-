/* v9 : verrou des fonctions v8 « à ne pas toucher » — fenêtres ouvertes par la voix (terminal, Marchés, COT…), réponses animées, panneau d'images.
   Les fichiers listés ont une empreinte enregistrée dans verrou-v8.json : toute modification involontaire fait échouer le test.
   Modification voulue : node trader-pro/tests/verrou-v8-test.mjs --maj (puis relancer les tests Chrome pilotage, images, cerveau et banc-30).
   Contrôle aussi la structure : les 3 actions de fenêtre, les 9 outils de lecture, l'animation de texte, le panneau d'images et leur branchement dans phrase.js et index.html. */
import fs from 'node:fs'; import crypto from 'node:crypto';
const FICHIERS = ['core/commun/reponse-anim.js', 'core/commun/reponse-anim.css', 'core/commun/galerie-anim.js', 'core/commun/images-wiki.js', 'trader-pro/cerveau/actions.js', 'trader-pro/cerveau/outils.js', 'core/intelligence/cerveau.js', 'core/intelligence/phrase.js'];
const empreinte = f => crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const CHEMIN = 'trader-pro/tests/verrou-v8.json';
if (process.argv.includes('--maj')) { const o = {}; for (const f of FICHIERS) o[f] = empreinte(f); fs.writeFileSync(CHEMIN, JSON.stringify(o, null, 1) + '\n'); console.log('verrou mis à jour (' + FICHIERS.length + ' fichiers)'); process.exit(0); }
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const verrou = JSON.parse(fs.readFileSync(CHEMIN, 'utf8'));
for (const f of FICHIERS) v('fichier verrouillé inchangé : ' + f, verrou[f] === empreinte(f), 'modifié depuis la v8 : relancer pilotage-chrome, images-chrome, cerveau-chrome, banc-30-chrome puis --maj');
const lire = f => fs.readFileSync(f, 'utf8');
const actions = lire('trader-pro/cerveau/actions.js'), outils = lire('trader-pro/cerveau/outils.js'), index = lire('index.html');
for (const n of ['ouvrir_fenetre', 'afficher_images', 'fermer_fenetre']) v('action de fenêtre : ' + n, actions.includes(n));
v('9 outils de lecture déclarés', (outils.match(/name:\s*'[a-z_]+'/g) || []).length >= 9, String((outils.match(/name:\s*'[a-z_]+'/g) || []).length));
for (const s of ['core/commun/reponse-anim.js', 'core/commun/galerie-anim.js', 'core/commun/images-wiki.js', 'core/intelligence/cerveau.js']) v('chargé par index.html : ' + s, index.includes(s));
v('actions et outils chargés par le cerveau', lire('core/intelligence/cerveau.js').includes('cerveau/actions.js') && lire('core/intelligence/cerveau.js').includes('cerveau/outils.js'));
v('réponses animées : texte écrit au rythme de la voix (événement rayle:parole)', /rayle:parole/.test(lire('core/commun/reponse-anim.js')));
v('la voix émet rayle:parole et rayle:parole-fin (lien voix → animation)', /rayle:parole'/.test(lire('core/voice/voix.js')) && /rayle:parole-fin/.test(lire('core/voice/voix.js')));
v('panneau d\'images : licences affichées', /licence/i.test(lire('core/commun/galerie-anim.js')));
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
