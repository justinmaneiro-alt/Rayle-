import fs from 'node:fs';
let t = fs.readFileSync('index.html', 'utf8');
const avant = t.length;
// boutons de la barre : on ne garde que le micro, Couper et Réglages
for (const id of ['btnOuvrirTerminal', 'btnOuvrirGalaxie', 'btnPays', 'btnSources', 'btnBureau']) t = t.replace(new RegExp('\s*<button type="button" class="gros" id="' + id + '"[^\n]*\n'), '\n');
// tableau de bord Jarvis remplacé par l'accueil de l'application
t = t.replace(/<script src="core\/commun\/tableau-bord-contenu\.js"><\/script>\n/, '<script src="core/commun/tableau-bord-contenu.js"></script>\n');
t = t.replace(/<script src="core\/commun\/tableau-bord\.js"><\/script>\n/, '');
t = t.replace(/<script>if\(!window\.RayleAppareil\|\|RayleAppareil\.estPC\(\)\)document\.write\('<link rel="stylesheet" href="core\/commun\/tableau-bord\.css">'\);<\/script>\n/, '');
// carrousel : feuille de style en dernier, script juste après les vues
t = t.replace('<link rel="stylesheet" href="core/commun/images-actus.css">', '<link rel="stylesheet" href="core/commun/images-actus.css">\n<link rel="stylesheet" href="core/commun/application.css">');
t = t.replace('<script src="core/commun/vues.js"></script>', '<script src="core/commun/vues.js"></script>');
fs.writeFileSync('index.html', t); console.log(avant, '->', t.length);
