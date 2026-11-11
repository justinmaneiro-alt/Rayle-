import fs from 'node:fs';
let t = fs.readFileSync('index.html', 'utf8');
const ancre = '      <h3>Connexion</h3>';
if (!t.includes(ancre)) throw new Error('ancre');
t = t.replace(ancre, '      <h3>État des sources</h3>\n      <p class="es-info">Chaque source du backend : verte ou rouge, dernière réussite, erreur précise.</p>\n      <div class="row"><button type="button" id="btnEtatSources">Voir l’état</button><button type="button" class="ghost" id="btnEtatSourcesTester">Tester toutes les sources maintenant</button></div>\n      <div id="etatSources"></div>\n\n' + ancre);
t = t.replace('<script src="core/commun/application.js"></script>', '<script src="core/commun/etat-sources.js"></script>\n<script src="core/commun/application.js"></script>');
t = t.replace('<link rel="stylesheet" href="core/commun/accueil-rayle.css">', '<link rel="stylesheet" href="core/commun/accueil-rayle.css">\n<link rel="stylesheet" href="core/commun/etat-sources.css">');
fs.writeFileSync('index.html', t);
console.log('ok');
