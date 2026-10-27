// Test des chercheurs du Veilleur par paire (BTC, SOL, DOGE) : fichiers séparés, une seule paire calcule à la fois, gardien prop branché sur m6.json, routes locales avec ?paire=.
// Lancer :  node galaxie/tests/chercheur-paires-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerChercheur, fichiersChercheur, prendreVerrouCalcul } from '../../app-pc/veilleur/chercheur.mjs';
import { stockagePilote, nomPilote } from '../../app-pc/veilleur/pilote-fichier.mjs';
import { creerM6 } from '../../planetes/mars/pc/agent-m6/m6-etat.js';
import { marcheM5 } from '../../planetes/mars/tests/synth-m5.mjs';
import { fauxBinance } from '../../planetes/mars/tests/faux-binance.mjs';

let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const PAS = 900e3, now0 = Math.floor(Date.UTC(2025, 5, 1, 12, 0) / PAS) * PAS, horloge = { t: now0 };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-paires-'));
const serie = marcheM5({ n: 9000, graine: 5, t0: now0 - 9000 * PAS, prix: 0.08, bruitPct: 0.2 }), urls = [];
const base = fauxBinance(serie, horloge), lire = async u => { urls.push(u); return base(u); };
const detecteur = { evaluer: async () => ({ jeu: false, raison: null }) };
const ouvrir = paire => creerChercheur({ dossier, paire, maintenant: () => horloge.t, lire, detecteur, sansPriorite: true, trancheMs: 20000, annees: 9000 * PAS / (365.25 * 86400e3) + 0.01 });

// ── noms de fichiers ──
{
  v('fichiers BTC = ceux d’origine (rien ne change pour l’existant)', path.basename(fichiersChercheur(dossier).etat) === 'chercheur.json' && path.basename(fichiersChercheur(dossier, 'BTC').verrou) === 'chercheur.pid' && nomPilote('BTC') === 'pilote' && nomPilote() === 'pilote');
  v('fichiers SOL et DOGE suffixés ; configuration, compte et verrou de calcul communs', path.basename(fichiersChercheur(dossier, 'SOL').etat) === 'chercheur-sol.json' && path.basename(fichiersChercheur(dossier, 'DOGE').arret) === 'chercheur-doge.arret' && nomPilote('DOGE') === 'pilote-doge' && fichiersChercheur(dossier, 'SOL').compte === fichiersChercheur(dossier, 'DOGE').compte && fichiersChercheur(dossier, 'SOL').calcul === fichiersChercheur(dossier).calcul);
}
// ── verrou de calcul : une seule paire à la fois ──
{
  const f = path.join(dossier, 'calcul.verrou'), a = prendreVerrouCalcul(f), b = prendreVerrouCalcul(f);
  v('premier verrou pris, second refusé tant que le premier est tenu', typeof a === 'function' && b === null); a(); const c = prendreVerrouCalcul(f); v('verrou libéré puis repris', typeof c === 'function'); c();
  fs.writeFileSync(f, '1'); const vieux = (Date.now() - 6 * 60e3) / 1000; fs.utimesSync(f, vieux, vieux); const d = prendreVerrouCalcul(f); v('un verrou abandonné depuis plus de 5 minutes est ignoré', typeof d === 'function'); d();
}
// ── un chercheur DOGE : ses données, son pilote, ses fichiers ──
const doge = ouvrir('DOGE');
{
  const r = await doge.cycle();
  v('DOGE : historique téléchargé depuis Binance DOGEUSDT, dans un dossier à part', doge.histo.serie().n > 8000 && urls.length > 3 && urls.every(u => /symbol=DOGEUSDT/.test(u)) && fs.existsSync(path.join(dossier, 'm5-doge')) && !fs.existsSync(path.join(dossier, 'm5')), JSON.stringify([doge.histo.serie().n, urls[0]]));
  await doge.pilote.modifier(p => { p.commande({ type: 'profil', patch: { cible: 1 } }); });
  v('DOGE : son état est dans pilote-doge.json (paire, compteur à 3 101, coûts DOGE) ; pilote.json n’existe pas', fs.existsSync(path.join(dossier, 'pilote-doge.json')) && !fs.existsSync(path.join(dossier, 'pilote.json')) && doge.pilote.etat().paire === 'DOGE' && doge.pilote.etat().recherche.N === 3101 && doge.pilote.etat().couts.spreadPct === 0.06);
  v('DOGE : l’état du chercheur est dans chercheur-doge.json', (doge.ecrireEtat(), fs.existsSync(path.join(dossier, 'chercheur-doge.json'))));
}
// ── gardien prop branché sur m6.json ──
{
  const j0 = doge.jugerCompte({ paire: 'DOGE', sens: 1, entree: 0.08, stop: 0.0784, cible: 0.0848 });
  v('sans m6.json : pas de jugement (alertes présentées comme avant)', j0 === null);
  const H = 3600e3, m = creerM6({ maintenant: () => horloge.t });
  for (let k = 0; k < 3; k++) m.commande({ type: 'journal_ajouter', trade: { paire: 'BTC', sens: 'achat', t: horloge.t - (6 - 2 * k) * H, tSortie: horloge.t - (5.5 - 2 * k) * H, prixEntree: 80000 + k * 10, prixSortie: 79800 + k * 10, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'S' } });
  fs.writeFileSync(fichiersChercheur(dossier).compte, JSON.stringify(m.etat()));
  const j1 = doge.jugerCompte({ paire: 'DOGE', sens: 1, entree: 0.08, stop: 0.0784, cible: 0.0848 });
  v('avec 3 pertes d’affilée dans m6.json : l’alerte DOGE est BLOQUÉE par le gardien (compte commun aux paires)', j1 && j1.decision === 'BLOCK' && /coupe-circuit|pertes d’affilée/.test(j1.controle.blocages.join(' ')), JSON.stringify(j1 && j1.controle && j1.controle.blocages));
  const m2 = creerM6({ maintenant: () => horloge.t }); fs.writeFileSync(fichiersChercheur(dossier).compte, JSON.stringify(m2.etat())); const t = Date.now() / 1000 + 5; fs.utimesSync(fichiersChercheur(dossier).compte, t, t);
  const j2 = doge.jugerCompte({ paire: 'DOGE', sens: 1, entree: 0.08, stop: 0.0784, cible: 0.0848 });
  v('compte remis à neuf : le fichier modifié est relu (jugement PASS)', j2 && j2.decision === 'PASS' && /marge du jour 300 \$ sur 300 \$/.test(j2.texte), j2 && j2.texte);
  fs.writeFileSync(fichiersChercheur(dossier).compte, '{pas du json'); const t2 = Date.now() / 1000 + 10; fs.utimesSync(fichiersChercheur(dossier).compte, t2, t2);
  v('fichier de compte corrompu : jugement « INCONNU » avec un message clair, jamais un faux PASS', (() => { const x = doge.jugerCompte({ paire: 'DOGE', sens: 1, entree: 0.08, stop: 0.0784, cible: 0.0848 }); return x && x.decision === 'INCONNU' && /illisible/.test(x.texte); })());
}
// ── deux chercheurs : une seule paire calcule à la fois ──
{
  const btc = ouvrir('BTC'); await btc.cycle();
  await btc.pilote.modifier(p => { p.commande({ type: 'profil', patch: { arrierePlan: { actif: true, heureDebut: '00:00', heureFin: '00:00', pauseDansJeu: false, processusJeu: [] } } }); });
  await doge.pilote.modifier(p => { p.commande({ type: 'profil', patch: { arrierePlan: { actif: true, heureDebut: '00:00', heureFin: '00:00', pauseDansJeu: false, processusJeu: [] } } }); });
  const libere = prendreVerrouCalcul(fichiersChercheur(dossier).calcul);
  const r = await btc.chercher();
  v('verrou de calcul tenu par une autre paire : BTC attend, raison écrite', !r.fait && /une autre paire cherche/.test(r.raison) && btc.etat.phase === 'attente', JSON.stringify(r)); libere();
  v('BTC garde ses propres fichiers (pilote.json, chercheur.json, m5)', fs.existsSync(path.join(dossier, 'pilote.json')) && fs.existsSync(path.join(dossier, 'm5')));
  v('BTC et DOGE ont des états de pilote indépendants (compteurs différents)', btc.pilote.etat().recherche.N === 643101 && doge.pilote.etat().recherche.N === 3101);
}
// ── routes locales avec ?paire= ──
{
  process.env.RAYLE_VEILLEUR_DOSSIER = dossier; process.env.RAYLE_VEILLEUR_SANS_LANCEMENT = '1';
  const { creerServeur } = await import('../../serveur.mjs'); const srv = creerServeur(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const baseUrl = 'http://127.0.0.1:' + srv.address().port, get = p => fetch(baseUrl + p).then(async r => ({ s: r.status, j: await r.json() })), post = (p, corps, e = { 'X-Rayle-Multi': '1' }) => fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...e }, body: JSON.stringify(corps) }).then(async r => ({ s: r.status, j: await r.json() }));
  let r = await get('/__veilleur/pilote?paire=DOGE'); v('route pilote?paire=DOGE : l’état de DOGE', r.j.existe && r.j.paire === 'DOGE' && r.j.etat.paire === 'DOGE');
  r = await get('/__veilleur/pilote?paire=SOL'); v('route pilote?paire=SOL : pas d’état (aucun fichier créé par la simple lecture)', r.j.existe === false && !fs.existsSync(path.join(dossier, 'pilote-sol.json')));
  r = await get('/__veilleur/pilote'); v('sans paire = BTC (compatible avec l’ancienne page)', r.j.paire === 'BTC' && r.j.etat.paire === 'BTC' && r.j.etat.recherche.N === 643101);
  r = await get('/__veilleur/pilote?paire=ETH'); v('paire inconnue : 400', r.s === 400);
  r = await post('/__veilleur/pilote-commande?paire=SOL', { commande: { type: 'profil', patch: { cible: 2 } } }); v('commande sur SOL : crée pilote-sol.json avec la paire SOL', r.j.resultat.ok && fs.existsSync(path.join(dossier, 'pilote-sol.json')) && JSON.parse(fs.readFileSync(path.join(dossier, 'pilote-sol.json'), 'utf8')).paire === 'SOL');
  r = await get('/__veilleur/pilote?paire=DOGE'); v('DOGE n’a pas bougé', r.j.etat.profil.cible === 1);
  r = await post('/__veilleur/chercheur-arreter?paire=SOL', {}); v('arrêt demandé pour SOL seulement', r.j.ok && fs.existsSync(path.join(dossier, 'chercheur-sol.arret')) && !fs.existsSync(path.join(dossier, 'chercheur-doge.arret')));
  r = await get('/__veilleur/chercheurs'); v('état des trois chercheurs en une requête', r.j.ok && Object.keys(r.j.chercheurs).join() === 'BTC,SOL,DOGE');
  // compte (m6)
  r = await get('/__veilleur/m6'); v('m6 : un compte illisible est dit inexistant (jamais un faux compte)', r.j.ok && r.j.existe === false);
  const m = creerM6({}); r = await post('/__veilleur/m6-etat', { etat: m.etat() }); v('m6-etat : la page écrit le compte', r.j.ok && JSON.parse(fs.readFileSync(path.join(dossier, 'm6.json'), 'utf8')).regles.perteJourPct === 3);
  r = await post('/__veilleur/m6-etat', { etat: { regles: {} } }); v('m6-etat : état invalide refusé (400), fichier intact', r.s === 400 && JSON.parse(fs.readFileSync(path.join(dossier, 'm6.json'), 'utf8')).regles.perteJourPct === 3);
  r = await post('/__veilleur/m6-etat', { etat: m.etat() }, {}); v('m6-etat sans en-tête dédié : refusé (403)', r.s === 403);
  v('aucun secret dans le compte écrit', !/rd_[A-Za-z0-9_-]{8,}|jeton/i.test(fs.readFileSync(path.join(dossier, 'm6.json'), 'utf8')));
  srv.close();
}
fs.rmSync(dossier, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
