/* Calcul complet du panier « Investissement long terme » en une fois (même moteur que le cron du Worker) : écrit trader-pro/invest/donnees/index.json et fiches/<symbole>.json.
   Usage : SEC_USER_AGENT="Nom adresse@contact" node outils-donnees/lt-calcul.mjs [symbole …]      (sans argument : tout le panier ; la SEC limite à 10 requêtes par seconde)
   Le User-Agent de la SEC (nom + contact) vient de la variable d'environnement : il n'est jamais écrit dans le dépôt. */
import fs from 'node:fs'; import path from 'node:path';
import { univers } from '../trader-pro/invest/univers.js';
import { calculerEntreprise } from '../trader-pro/invest/calcul.js';
const sortie = path.resolve('trader-pro/invest/donnees'), dossier = path.join(sortie, 'fiches'), ua = process.env.SEC_USER_AGENT || 'Rayle-Invest outil de recherche personnel';
fs.mkdirSync(dossier, { recursive: true });
const voulus = new Set(process.argv.slice(2)), liste = univers().filter(e => !voulus.size || voulus.has(e.tk)), lignes = new Map();
const idx = path.join(sortie, 'index.json'); if (fs.existsSync(idx)) for (const l of JSON.parse(fs.readFileSync(idx, 'utf8')).lignes) lignes.set(l.tk, l);
let fait = 0, echecs = []; const attendre = ms => new Promise(r => setTimeout(r, ms));
async function un(e) {
  for (let essai = 0; essai < 3; essai++) {
    try { const r = await calculerEntreprise(e, { ua }); fs.writeFileSync(path.join(dossier, e.tk + '.json'), JSON.stringify(r.fiche)); lignes.set(e.tk, r.ligne); return; }
    catch (err) { if (essai === 2) { echecs.push(e.tk + ' : ' + err.message); return; } await attendre(1500 * (essai + 1)); }
  }
}
const file = liste.slice(); const ouvriers = Array.from({ length: 4 }, async () => { while (file.length) { const e = file.shift(); await un(e); await attendre(250); if (++fait % 25 === 0) console.log(fait + '/' + liste.length); } });
await Promise.all(ouvriers);
const L = [...lignes.values()].sort((a, b) => a.tk.localeCompare(b.tk));
fs.writeFileSync(idx, JSON.stringify({ version: 1, t: Date.now(), n: L.length, lignes: L }));
console.log('écrit', L.length, 'lignes ;', echecs.length, 'échec(s)'); echecs.slice(0, 40).forEach(x => console.log('  ' + x));
