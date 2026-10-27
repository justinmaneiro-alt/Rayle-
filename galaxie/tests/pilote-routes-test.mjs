// Test des routes locales du pilote de l'agent BTC (M5) : /__veilleur/pilote, pilote-commande, chercheur, mode-jeu (serveur réel sur un port libre, dossier temporaire, aucun processus lancé).
// Lancer :  node galaxie/tests/pilote-routes-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pilote-routes-'));
process.env.RAYLE_VEILLEUR_DOSSIER = dossier; process.env.RAYLE_VEILLEUR_SANS_LANCEMENT = '1';
const { creerServeur } = await import('../../serveur.mjs');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const srv = creerServeur(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const get = p => fetch(base + p).then(async r => ({ s: r.status, j: await r.json() }));
const post = (p, corps, entetes = { 'X-Rayle-Multi': '1' }) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) }).then(async r => ({ s: r.status, j: await r.json() }));

let r = await get('/__veilleur/pilote'); v('pilote : pas d’état au départ', r.s === 200 && r.j.existe === false && r.j.chercheur.enMarche === false);
r = await post('/__veilleur/pilote-commande', { commande: { type: 'profil', patch: { cible: 2, risquePct: 0.5 } } }); v('commande « profil » appliquée (état créé)', r.s === 200 && r.j.resultat.ok);
r = await get('/__veilleur/pilote'); v('pilote : état relu depuis le fichier, profil enregistré', r.j.existe && r.j.etat.profil.cible === 2 && r.j.etat.profil.risquePct === 0.5 && r.j.etat.rev >= 1);
const regle = { nom: 'Idée', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 };
r = await post('/__veilleur/pilote-commande', { commande: { type: 'idee_proposer', regle, origine: 'idee-libre', texteLibre: 'acheter quand le RSI est bas' } }); v('idée proposée : en attente de validation', r.j.resultat.ok && /Achat quand/.test(r.j.resultat.description));
r = await get('/__veilleur/pilote'); v('l’idée est en attente dans l’état (rien n’est testé)', r.j.etat.idees.length === 1 && r.j.etat.idees[0].statut === 'a_valider' && r.j.etat.recherche.N === r.j.etat.recherche.Navant);
r = await post('/__veilleur/pilote-commande', { commande: { type: 'valider', id: 'S001' } }); v('aucune commande ne peut forcer une validation', r.j.resultat.ok === false && /inconnue/.test(r.j.resultat.erreur));
r = await post('/__veilleur/pilote-commande', { commande: { type: 'seuils_appliquer', objectif: { rNetMin: 1 } } }); v('seuils : refusés sans confirmation explicite', r.j.resultat.ok === false);
r = await post('/__veilleur/pilote-commande', { commande: { type: 'importer', texte: 'pas du json' } }); v('import d’un mauvais fichier : refusé proprement', r.j.resultat.ok === false);
r = await post('/__veilleur/pilote-commande', { commande: { type: 'exporter' } }); v('export : texte de la bibliothèque', r.j.resultat.ok && JSON.parse(r.j.resultat.texte).format === 'rayle-bibliotheque-btc');
r = await post('/__veilleur/pilote-commande', { commande: { type: 'importer', texte: r.j.resultat.texte + ' '.repeat(2 << 20) } }); v('gros corps (2 Mo) accepté', r.s === 200);
r = await post('/__veilleur/pilote-commande', { nimporte: 1 }); v('commande absente : 400', r.s === 400);
r = await post('/__veilleur/pilote-commande', { commande: { type: 'profil', patch: { cible: 1 } } }, {}); v('POST sans en-tête dédié : refusé', r.s === 403);
// 20 commandes en parallèle : aucune perdue
const avant = (await get('/__veilleur/pilote')).j.etat.rev;
await Promise.all(Array.from({ length: 20 }, (_, i) => post('/__veilleur/pilote-commande', { commande: { type: 'idee_proposer', regle: { ...regle, nom: 'Idée ' + i } } })));
r = await get('/__veilleur/pilote'); v('20 commandes simultanées : toutes appliquées (verrou)', r.j.etat.idees.length === 21 && r.j.etat.rev === avant + 20, r.j.etat.idees.length + ' idées, rev ' + r.j.etat.rev + ' vs ' + (avant + 20));
// chercheur
r = await get('/__veilleur/chercheur'); v('chercheur : arrêté', r.j.enMarche === false);
r = await post('/__veilleur/chercheur-demarrer', {}); v('chercheur-demarrer : accepté (aucun processus lancé en test)', r.j.ok);
r = await post('/__veilleur/chercheur-arreter', {}); v('chercheur-arreter : fichier d’arrêt écrit', r.j.ok && fs.existsSync(path.join(dossier, 'chercheur.arret')));
r = await post('/__veilleur/mode-jeu', { actif: true }); v('mode jeu : drapeau écrit', r.j.ok && fs.existsSync(path.join(dossier, 'mode-jeu.flag')));
r = await post('/__veilleur/mode-jeu', { actif: false }); v('mode jeu : drapeau retiré', r.j.ok && !fs.existsSync(path.join(dossier, 'mode-jeu.flag')));
v('aucun secret dans l’état du pilote', !/rd_[A-Za-z0-9_-]{8,}/.test(fs.readFileSync(path.join(dossier, 'pilote.json'), 'utf8')));
srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
