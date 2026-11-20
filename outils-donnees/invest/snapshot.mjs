/* Instantané mensuel du modèle et suivi de sa performance.
   Usage : node outils-donnees/invest/snapshot.mjs <dossier de sortie du calcul (manifest.json + index/) | URL de la branche donnees-invest> [--dossier data/snapshots] [--mois AAAA-MM] [--forcer]
   - crée data/snapshots/AAAA-MM.json s'il n'existe pas encore pour le mois du calcul (jamais écrasé sans --forcer) ;
   - recalcule data/snapshots/suivi.json (performance depuis chaque instantané, à 1, 3, 6 et 12 mois), lu par l'onglet Méthode.
   Lancé chaque nuit par .github/workflows/invest.yml (le fichier du mois n'est créé qu'une fois : le 1er du mois ou au premier calcul du mois). */
import fs from 'node:fs';
import path from 'node:path';
import { creerInstantane, mesurer } from '../../trader-pro/invest/suivi-modele.js';
import { appliquerFondsCotes } from '../../trader-pro/invest/fonds-cotes.js';

const args = process.argv.slice(2), src = args.find(a => !a.startsWith('--')) || 'sortie', opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const dossier = opt('dossier') || 'data/snapshots', forcer = args.includes('--forcer');
const lire = async chemin => { if (/^https?:/.test(src)) { const r = await fetch(src.replace(/\/?$/, '/') + chemin); if (!r.ok) throw new Error(chemin + ' : ' + r.status); return r.json(); } return JSON.parse(fs.readFileSync(path.join(src, chemin), 'utf8')); };
const manifeste = await lire('manifest.json'); let lignes = []; for (const s of manifeste.shards) lignes.push(...(await lire('index/' + s.id + '.json')).lignes);
lignes = appliquerFondsCotes(lignes);   // les fonds fermés / holdings / SPAC sortent des « actions » mesurées
fs.mkdirSync(dossier, { recursive: true });
const snap = creerInstantane(lignes, manifeste, {}), mois = opt('mois') || snap.mois, fichier = path.join(dossier, mois + '.json');
if (fs.existsSync(fichier) && !forcer) console.log('instantané', mois, 'déjà présent : conservé');
else { fs.writeFileSync(fichier, JSON.stringify({ ...snap, mois })); console.log('instantané écrit :', fichier, (fs.statSync(fichier).size / 1024).toFixed(0) + ' Ko', '·', snap.n, 'actions · calcul du', new Date(snap.t).toISOString()); }
const snaps = fs.readdirSync(dossier).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).sort().map(f => JSON.parse(fs.readFileSync(path.join(dossier, f), 'utf8')));
const suivi = mesurer(snaps); fs.writeFileSync(path.join(dossier, 'suivi.json'), JSON.stringify(suivi));
console.log('suivi :', suivi.recul.message);
