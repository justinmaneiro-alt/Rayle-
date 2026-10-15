// Registre des planètes (js/univers/planetes/) : champs, états, alias, contrat d'agent, chargement paresseux, entrée/sortie avec libération de la scène :   node tests/planetes-registre-test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Reg from '../js/univers/planetes/registre.js';
import { agentVide, validerAgent, estBranche, CHAMPS_AGENT } from '../js/univers/planetes/agent.js';
import { ASTRES } from '../js/univers/donnees/planetes.js';

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const racine = new URL('../', import.meta.url);

// contexte partagé simulé (celui que le thème Espace donne aux planètes) : il enregistre ce qu'on lui demande
function faux(vueDepart = 'systeme') {
  const P = { vue: vueDepart, appels: [], liberees: [] };
  P.vueNom = () => P.vue;
  P.allerVue = async (nom, opts) => { P.appels.push(['allerVue', nom, opts]); P.vue = nom; return { ok: true }; };
  P.liberer = nom => { P.liberees.push(nom); return true; };
  return P;
}

await t('une entrée par planète : Soleil, huit planètes (dont la Terre), Lune ; un sous-dossier chacune', () => {
  assert.deepEqual(Reg.liste().map(p => p.id), ['soleil', 'mercure', 'venus', 'terre', 'lune', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']);
  for (const p of Reg.liste()) assert.ok(fs.existsSync(new URL('js/univers/planetes/' + p.id + '/index.js', racine)), 'dossier manquant : ' + p.id);
});
await t('chaque entrée porte id, nom, rôle, texture, taille, orbite, thème, agent, état, mount/unmount', () => {
  for (const p of Reg.liste()) {
    for (const k of ['id', 'nom', 'role', 'texture', 'taille', 'orbite', 'themeInterieur', 'agent', 'etat', 'mount', 'unmount']) assert.ok(k in p, p.id + ' : champ « ' + k + ' » absent');
    assert.equal(typeof p.mount, 'function'); assert.equal(typeof p.unmount, 'function');
    assert.ok(['actif', 'pret'].includes(p.etat), p.id); assert.ok(p.etatLibelle);
    assert.ok(p.taille.rayonKm > 0 && p.taille.rayonTerre > 0, p.id);
  }
});
await t('taille et orbite viennent des fiches ASTRES (aucune valeur recopiée à la main)', () => {
  const m = Reg.PLANETES.mars; assert.equal(m.taille.rayonKm, ASTRES.mars.rayonKm); assert.ok(Math.abs(m.taille.rayonTerre - .532) < .005);
  assert.equal(m.orbite.a, ASTRES.mars.a); assert.equal(m.orbite.periodeJ, ASTRES.mars.periodeJ); assert.equal(m.orbite.autour, 'soleil');
  assert.equal(Reg.PLANETES.lune.orbite.autour, 'terre'); assert.equal(Reg.PLANETES.soleil.orbite.autour, null);
  assert.ok(Reg.PLANETES.jupiter.taille.rayonTerre > 10 && Reg.PLANETES.mercure.taille.rayonTerre < .4);
});
await t('textures : les fichiers existent (1k et 2k) ; le Soleil n’en a pas', () => {
  for (const p of Reg.liste()) {
    if (!p.texture) { assert.equal(p.id, 'soleil'); continue; }
    const resolutions = p.texture.includes('{res}') ? ['1k', '2k'] : ['1k'];          // la Terre a un seul fichier (terre-jour-2048.jpg)
    for (const res of resolutions) { const u = p.textureUrl(res); assert.ok(u && !u.includes('{'), p.id); assert.ok(fs.existsSync(new URL('ui/assets/' + u, racine)), 'texture absente : ' + u); }
  }
});
await t('états : Terre et Mars actives ; les autres « prêtes à recevoir un thème » ; Saturne = vaisseau, Jupiter = base de code (prévus)', () => {
  assert.equal(Reg.PLANETES.terre.etat, 'actif'); assert.equal(Reg.PLANETES.mars.etat, 'actif');
  assert.equal(Reg.PLANETES.terre.themeInterieur.vue, 'terre'); assert.equal(Reg.PLANETES.mars.themeInterieur.vue, 'mars');
  for (const id of ['soleil', 'mercure', 'venus', 'lune', 'jupiter', 'saturne', 'uranus', 'neptune']) { const p = Reg.PLANETES[id]; assert.equal(p.etat, 'pret', id); assert.equal(p.themeInterieur, null, id); assert.equal(p.etatLibelle, 'prêt à recevoir un thème'); }
  assert.equal(Reg.PLANETES.terre.role, 'Carte du monde'); assert.equal(Reg.PLANETES.mars.role, 'Base martienne');
  assert.equal(Reg.PLANETES.saturne.role, 'Vaisseau'); assert.equal(Reg.PLANETES.saturne.themePrevu, 'vaisseau');
  assert.equal(Reg.PLANETES.jupiter.role, 'Base de code'); assert.equal(Reg.PLANETES.jupiter.themePrevu, 'base de code');
});
await t('noms : français, anglais, articles, « la planète Mars »', () => {
  const cas = { 'Mars': 'mars', 'la planète Mars': 'mars', 'la Terre': 'terre', 'Earth': 'terre', 'Saturn': 'saturne', 'Jupiter': 'jupiter', 'le Soleil': 'soleil', 'Vénus': 'venus', 'la Lune': 'lune', 'Moon': 'lune', 'l’Uranus': 'uranus' };
  for (const [k, v] of Object.entries(cas)) assert.equal(Reg.trouver(k) && Reg.trouver(k).id, v, k);
  assert.equal(Reg.trouver('Paris'), null); assert.equal(Reg.trouver(''), null); assert.equal(Reg.trouver(null), null);
  assert.equal(Reg.planeteDeVue('terre').id, 'terre'); assert.equal(Reg.planeteDeVue('mars').id, 'mars'); assert.equal(Reg.planeteDeVue('systeme'), null);
});
await t('contrat d’agent : { id, nom, role, endpoint } vide pour toutes les planètes ; validation ; branchement futur', () => {
  assert.deepEqual(CHAMPS_AGENT, ['id', 'nom', 'role', 'endpoint']);
  for (const p of Reg.liste()) { assert.deepEqual(Object.keys(p.agent), ['id', 'nom', 'role', 'endpoint'], p.id); assert.ok(Object.values(p.agent).every(v => v === null), p.id); assert.equal(estBranche(p.agent), false); }
  assert.deepEqual(agentVide(), { id: null, nom: null, role: null, endpoint: null });
  assert.ok(validerAgent(null).ok); assert.ok(validerAgent(agentVide()).ok);
  assert.ok(validerAgent({ id: 'agent-mars', nom: 'Agent Mars', role: 'base', endpoint: 'https://exemple.test/agent' }).ok);
  assert.ok(!validerAgent({ id: 'a', nom: 'b', role: 'c', endpoint: 'http://non-securise.test' }).ok, 'https obligatoire');
  assert.ok(!validerAgent({ id: 'a', nom: 'b', role: 'c' }).ok, 'champ manquant');
  assert.ok(!validerAgent({ id: 'a', nom: 'b', role: 'c', endpoint: null, autre: 1 }).ok, 'champ inconnu');
  assert.ok(!validerAgent({ id: null, nom: 'b', role: 'c', endpoint: 'https://x.test' }).ok, 'branché sans id');
  assert.ok(!validerAgent('texte').ok);
  const mauvais = Reg.declarerAgent('mars', { id: 'x' }); assert.ok(!mauvais.ok); assert.equal(estBranche(Reg.PLANETES.mars.agent), false, 'un agent invalide n’est pas attaché');
  assert.ok(Reg.declarerAgent('mars', { id: 'agent-mars', nom: 'Agent Mars', role: 'garde la base', endpoint: 'https://exemple.test/mars' }).ok);
  assert.equal(estBranche(Reg.PLANETES.mars.agent), true); assert.equal(Reg.PLANETES.mars.agent.id, 'agent-mars');
  assert.ok(Reg.declarerAgent('mars', null).ok); assert.equal(estBranche(Reg.PLANETES.mars.agent), false);
  assert.ok(!Reg.declarerAgent('pluton', null).ok);
});
await t('chargement paresseux : rien n’est importé au départ ; entrer dans une planète « prête » n’importe rien', async () => {
  assert.deepEqual(Reg.chargees(), []);
  const P = faux('systeme');
  for (const id of ['saturne', 'jupiter', 'uranus', 'soleil']) {
    const r = await Reg.entrer(id, P);
    assert.equal(r.ok, false, id); assert.equal(r.pret, true, id); assert.match(r.texte, /prête à recevoir un thème/, id);
  }
  assert.match((await Reg.entrer('saturne', P)).texte, /vaisseau/); assert.match((await Reg.entrer('jupiter', P)).texte, /base de code/);
  assert.deepEqual(P.appels, [], 'aucune navigation pour une planète prête');
  assert.deepEqual(Reg.chargees(), [], 'aucune scène intérieure importée');
});
await t('entrer dans Mars : la scène est importée à ce moment-là seulement, au sol (mode rover) ; Saturne reste non chargée', async () => {
  const P = faux('systeme');
  const r = await Reg.entrer('Mars', P);
  assert.equal(r.ok, true); assert.match(r.texte, /Mars/); assert.deepEqual(Reg.chargees(), ['mars']);
  assert.deepEqual(P.appels, [['allerVue', 'mars', { mode: 'rover', rover: undefined, force: true }]]);
  const d = await Reg.entrer('mars', P); assert.equal(d.dejaLa, true, 'déjà dedans'); assert.equal(P.appels.length, 1);
});
await t('entrer dans la Terre : la carte du monde (vue terre, déjà en mémoire)', async () => {
  const P = faux('systeme'); const r = await Reg.entrer('la Terre', P);
  assert.equal(r.ok, true); assert.deepEqual(P.appels, [['allerVue', 'terre', {}]]); assert.match(r.texte, /carte du monde/);
});
await t('sortir : retour au système devant la planète (cible) ou en vue d’ensemble ; hors planète, rien à faire', async () => {
  let P = faux('mars'); let r = await Reg.sortir(P, { cible: 'mars' });
  assert.equal(r.ok, true); assert.deepEqual(P.appels, [['allerVue', 'systeme', { cible: 'mars' }]]);
  P = faux('terre'); await Reg.sortir(P, {}); assert.deepEqual(P.appels, [['allerVue', 'systeme', {}]]);
  P = faux('systeme'); r = await Reg.sortir(P, {}); assert.equal(r.dejaLa, true); assert.deepEqual(P.appels, []);
});
await t('retour au système solaire : depuis Mars, vue d’ensemble ; depuis le système, demande la vue d’ensemble à la vue', async () => {
  let P = faux('mars'); let r = await Reg.retourSysteme(P);
  assert.equal(r.ok, true); assert.deepEqual(P.appels, [['allerVue', 'systeme', {}]]); assert.equal(P.vue, 'systeme');
  P = faux('systeme'); r = await Reg.retourSysteme(P); assert.equal(r.ensemble, true); assert.deepEqual(P.appels, []);
});
await t('changer de planète sans repasser par le système : la scène précédente est libérée par le thème (ici : entrer seulement)', async () => {
  const P = faux('mars'); const r = await Reg.entrer('terre', P);
  assert.equal(r.ok, true); assert.deepEqual(P.appels, [['allerVue', 'terre', {}]]);
});
await t('libération : le thème libère une vue quittée (pas la courante) et le fait automatiquement dans allerVue', () => {
  const src = fs.readFileSync(new URL('js/univers/theme-espace.js', racine), 'utf8');
  assert.match(src, /function liberer\(nom\)[\s\S]*?v === vueObj\) return false[\s\S]*?v\.detruire\(\)[\s\S]*?cacheVues\.delete\(nom\)/, 'liberer détruit la vue et l’enlève du cache sans toucher la vue courante');
  assert.match(src, /precedente !== 'terre' && precedente !== 'systeme' && precedente !== vueNom\) liberer\(precedente\)/, 'allerVue libère la vue quittée');
  assert.match(src, /if \(noyau\.enCinematique\(\)\) noyau\.passerAnimation\(\)/, 'une animation en cours est passée avant de détruire la scène');
  assert.match(src, /liberer: n => liberer\(n\)/, 'exposé aux planètes');
});
await t('registre léger : il n’importe ni three ni aucune scène intérieure (imports statiques)', () => {
  const src = fs.readFileSync(new URL('js/univers/planetes/registre.js', racine), 'utf8');
  const imports = [...src.matchAll(/^import .*? from '([^']+)'/gm)].map(m => m[1].replace(/\?v=.*/, ''));
  assert.deepEqual(imports.sort(), ['../donnees/planetes.js', './agent.js']);
  assert.ok(!/three/.test(src));
});
await t('résumé : une ligne par planète avec rôle et état', () => {
  const r = Reg.resume().split('\n'); assert.equal(r.length, 10);
  assert.match(r.find(x => x.startsWith('Mars')), /Base martienne — actif/); assert.match(r.find(x => x.startsWith('Saturne')), /Vaisseau — prêt à recevoir un thème/);
});
console.log(ok + ' tests réussis');
