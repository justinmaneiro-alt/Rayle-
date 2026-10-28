// Jupiter (structure vide) : le manifeste pointe vers des fichiers réels, les ordres sont honnêtes, l'entrée et la sortie ne laissent rien. Lancer : node planetes/jupiter/tests/jupiter-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../../..');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const m = JSON.parse(fs.readFileSync(path.join(racine, 'planetes/jupiter/manifeste.json'), 'utf8'));
v('manifeste : id jupiter, ordres coder et montrer_resultat déclarés', m.id === 'jupiter' && m.ordres.map(o => o.action).join() === 'coder,montrer_resultat');
for (const k of ['pc', 'tablette', 'telephone']) v('manifeste : le module ' + k + ' existe sur le disque', fs.existsSync(path.join(racine, m.modules[k].entree)), m.modules[k].entree);
v('satellite Arcadia déclaré', m.satellites.some(s => s.id === 'arcadia'));
v('README présent', fs.existsSync(path.join(racine, 'planetes/jupiter/README.md')));

// faux navigateur minimal
const evts = []; const fenetres = new Map();
globalThis.window = globalThis; globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
const ecouteurs = {}; globalThis.addEventListener = (t, f) => { (ecouteurs[t] = ecouteurs[t] || []).push(f); }; globalThis.dispatchEvent = e => { evts.push(e.type); (ecouteurs[e.type] || []).forEach(f => f(e)); return true; };
globalThis.Panneaux = { ouvrir: o => fenetres.set(o.id, o), fermer: id => fenetres.delete(id) };
const J = await import(pathToFileURL(path.join(racine, 'planetes/jupiter/pc/index.js')).href), T = await import(pathToFileURL(path.join(racine, 'planetes/jupiter/terminal-2d/index.js')).href), O = await import(pathToFileURL(path.join(racine, 'planetes/jupiter/pc/ordres-jupiter.js')).href);
v('terminal-2d réutilise le même point d’entrée', T.entrer === J.entrer && T.sortir === J.sortir);
v('état : structure vide', J.ETAT === 'structure-vide');
await J.entrer({});
const f = fenetres.get('jupiter-attente');
v('entrer : une fenêtre honnête s’ouvre', !!f && /pas encore construit/.test(f.corps.html) && f.etat === 'bientot');
v('la fenêtre ne promet rien d’actif (aucun agent, aucun code)', /pas encore créés/.test(f.corps.html) && /à venir/.test(f.corps.html) && !/disponible/.test(f.corps.html));
v('événement jupiter:entree émis, window.Jupiter exposé', evts.includes('jupiter:entree') && window.Jupiter.etat().actif === true && window.Jupiter.etat().agents === 0);
await J.sortir();
v('sortir : la fenêtre est fermée', !fenetres.has('jupiter-attente') && evts.includes('jupiter:sortie') && window.Jupiter.etat().actif === false);
await J.entrer({}); window.dispatchEvent(new CustomEvent('galaxie:sortie', {})); v('Échap (galaxie:sortie) ferme aussi Jupiter', !fenetres.has('jupiter-attente'));
const enregistres = {}; O.brancher({ O: { enregistrer: (planete, action, fn) => { enregistres[planete + '/' + action] = fn; } } });
const c = await enregistres['jupiter/coder']({ demande: 'un site' }), r = await enregistres['jupiter/montrer_resultat']({});
v('ordre coder : refus honnête, pas de faux code', c.ok === false && /pas encore construits/.test(c.erreur) && !('texte' in c) && !('code' in c));
v('ordre montrer_resultat : rien à montrer', r.ok === false && /aucun code/.test(r.erreur));
v('les ordres branchés sont ceux du manifeste', Object.keys(enregistres).sort().join() === m.ordres.map(o => 'jupiter/' + o.action).sort().join());
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
