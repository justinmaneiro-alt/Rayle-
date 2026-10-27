// Tests des manifestes de planète. Lancer :  node galaxie/tests/manifestes-test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validerManifeste } from '../validateur.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let ok = 0, ko = 0;
const verifier = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };

/* ── 1. Les vrais manifestes ── */
const index = JSON.parse(fs.readFileSync(path.join(racine, 'planetes/index.json'), 'utf8'));
verifier('index.json : schema 1 et liste non vide', index.schema === 1 && Array.isArray(index.corps) && index.corps.length > 0);
const dossiers = fs.readdirSync(path.join(racine, 'planetes'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
verifier('chaque dossier de planetes/ est dans index.json', dossiers.every(d => index.corps.includes(d)), dossiers.filter(d => !index.corps.includes(d)).join(', '));
verifier('index.json : pas de doublon', new Set(index.corps).size === index.corps.length);

const manifestes = [], ids = new Set();
for (const id of index.corps) {
  const f = path.join(racine, 'planetes', id, 'manifeste.json');
  if (!fs.existsSync(f)) { verifier(id + ' : fichier manifeste.json présent', false); continue; }
  const brut = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = validerManifeste(brut, id);
  verifier(id + ' : manifeste valide', r.ok, r.erreurs.join(' ; '));
  verifier(id + ' : aucun avertissement', r.avertissements.length === 0, r.avertissements.join(' ; '));
  if (!r.ok) continue;
  manifestes.push(r.manifeste);
  for (const i of [r.manifeste.id, ...r.manifeste.satellites.map(s => s.id)]) { verifier('identifiant unique : ' + i, !ids.has(i)); ids.add(i); }
  const fichiers = [r.manifeste.texture, r.manifeste.nuit, r.manifeste.nuages, r.manifeste.anneaux && r.manifeste.anneaux.texture].filter(Boolean);
  for (const t of fichiers) verifier(id + ' : texture présente (' + t + ')', fs.existsSync(path.join(racine, t)));
}
const terre = manifestes.find(x => x.id === 'terre'), lune = terre && terre.satellites.find(s => s.id === 'lune');
verifier('la Lune est déclarée dans le manifeste de la Terre', !!lune && lune.type === 'lune' && lune.rayon > 0 && lune.orbite > terre.rayon, JSON.stringify(lune));
verifier('Lune : texture présente', !!lune && fs.existsSync(path.join(racine, lune.texture)));
verifier('Lune : alias « la lune »', !!lune && lune.alias.includes('la lune'));
verifier('exactement un soleil', manifestes.filter(m => m.type === 'soleil').length === 1);
verifier('8 planètes', manifestes.filter(m => m.type === 'planete').length === 8, String(manifestes.filter(m => m.type === 'planete').length));
const mars = manifestes.find(m => m.id === 'mars');
verifier('Mars : un interprète et un agent', mars && mars.agents.some(a => a.role === 'interprete') && mars.agents.some(a => a.role === 'agent'));
verifier('Mars : ordres du terminal déclarés', mars && ['changer_actif', 'changer_unite', 'ouvrir_fenetre'].every(a => mars.ordres.some(o => o.action === a)));
verifier('planètes en attente : mercure, venus, uranus', ['mercure', 'venus', 'uranus'].every(id => manifestes.find(m => m.id === id)?.etat === 'en_attente'));
verifier('orbites sans chevauchement', (() => { const d = manifestes.filter(m => m.type === 'planete').map(m => m.distance).sort((a, b) => a - b); return d.every((x, i) => i === 0 || x - d[i - 1] > 1.5); })());

/* ── 2. Manifestes invalides : chacun doit être refusé, avec le bon message ── */
const base = () => JSON.parse(fs.readFileSync(path.join(racine, 'planetes/mars/manifeste.json'), 'utf8'));
const cas = [
  ['id absent', m => { delete m.id; }, 'id'],
  ['id avec majuscule', m => { m.id = 'Mars'; }, 'id'],
  ['id différent du dossier', m => { m.id = 'jupiter'; }, 'dossier'],
  ['etat inconnu', m => { m.etat = 'dormante'; }, 'etat'],
  ['orbite absente', m => { delete m.orbite; }, 'orbite'],
  ['distance négative', m => { m.orbite.distance = -3; }, 'orbite.distance'],
  ['période en texte', m => { m.orbite.periode = 'vite'; }, 'orbite.periode'],
  ['rayon nul', m => { m.apparence.rayon = 0; }, 'apparence.rayon'],
  ['texture absente', m => { delete m.apparence.texture; }, 'apparence.texture'],
  ['chemin avec ..', m => { m.apparence.texture = '../secret.jpg'; }, 'chemin relatif invalide'],
  ['chemin absolu', m => { m.apparence.texture = '/etc/passwd'; }, 'chemin relatif invalide'],
  ['couleur d’atmosphère hors limites', m => { m.apparence.atmosphere.couleur = [2, 0, 0]; }, 'atmosphere.couleur'],
  ['anneaux inversés', m => { m.apparence.anneaux = { interieur: 5, exterieur: 3, texture: 'a.png' }; }, 'exterieur'],
  ['satellite sans type valide', m => { m.satellites = [{ id: 'v1', nom: 'V', type: 'ovni', orbite: 3, periode: 10 }]; }, 'satellites[0].type'],
  ['satellite dans la planète', m => { m.satellites = [{ id: 'v1', nom: 'V', type: 'arcadia', orbite: 0.3, periode: 10 }]; }, 'satellites[0].orbite'],
  ['satellites en doublon', m => { const s = { id: 'v1', nom: 'V', type: 'arcadia', orbite: 3, periode: 10 }; m.satellites = [s, s]; }, 'doublon'],
  ['module avec mauvaise qualité', m => { m.modules.pc.qualite_min = 'ultra'; }, 'qualite_min'],
  ['module sans entrée', m => { delete m.modules.pc.entree; }, 'modules.pc.entree'],
  ['rôle d’agent inconnu', m => { m.agents[0].role = 'chef'; }, 'role'],
  ['route d’agent mal formée', m => { m.agents[0].route = 'mars/analyste'; }, 'route'],
  ['deux interprètes', m => { m.agents.push({ id: 'autre', role: 'interprete', route: '/planete/mars/autre' }); }, 'un seul interprète'],
  ['ordre sans description', m => { delete m.ordres[0].description; }, 'description'],
  ['ordres en doublon', m => { m.ordres.push({ ...m.ordres[0] }); }, 'doublon'],
  ['nom d’action invalide', m => { m.ordres[0].action = 'Changer Actif'; }, 'action'],
  ['paramètre vide', m => { m.ordres[0].params = { actif: [] }; }, 'params.actif'],
  ['données mal typées', m => { m.donnees.lit = 'marches'; }, 'donnees.lit'],
  ['version de schéma inconnue', m => { m.schema = 99; }, 'schema'],
  ['satellite lune sans rayon', m => { m.satellites = [{ id: 'lune', nom: 'Lune', type: 'lune', orbite: 5, periode: 20, texture: 'galaxie/textures/2k_moon.jpg' }]; }, 'rayon'],
  ['satellite lune sans texture', m => { m.satellites = [{ id: 'lune', nom: 'Lune', type: 'lune', orbite: 5, periode: 20, rayon: 0.5 }]; }, 'texture'],
  ['manifeste qui n’est pas un objet', () => 'texte', 'objet']
];
for (const [nom, modif, attendu] of cas) {
  const m = base(); const modifie = modif(m); const r = validerManifeste(modifie === undefined ? m : modifie, 'mars');
  verifier('refusé : ' + nom, !r.ok && r.erreurs.some(e => e.includes(attendu)), JSON.stringify(r.erreurs).slice(0, 160));
}
// Avertissements (non bloquants)
{ const m = base(); m.champ_bizarre = 1; const r = validerManifeste(m, 'mars'); verifier('champ inconnu : accepté avec avertissement', r.ok && r.avertissements.some(a => a.includes('champ_bizarre'))); }
{ const m = base(); delete m.agents; const r = validerManifeste(m, 'mars'); verifier('planète active sans interprète : avertissement', r.ok && r.avertissements.some(a => a.includes('interprète'))); }
{ const m = base(); delete m.licences; const r = validerManifeste(m, 'mars'); verifier('textures sans licence : avertissement', r.ok && r.avertissements.some(a => a.includes('licences'))); }
{ const m = { id: 'neuve', nom: 'Neuve', theme: 'Test', etat: 'en_attente', orbite: { distance: 70, periode: 700 }, apparence: { rayon: 1, texture: 'galaxie/textures/2k_uranus.jpg' }, licences: ['x'] }; const r = validerManifeste(m, 'neuve'); verifier('nouvelle planète minimale acceptée', r.ok, r.erreurs.join(';')); }
{ const m = base(); const r = validerManifeste(m, 'mars'); verifier('valeurs par défaut posées', r.ok && r.manifeste.ordres.every(o => o.disponible === false) && r.manifeste.entrable === true); }

console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
