// Test du passage page ⇄ Veilleur du PC (M5) : hôte distant, adoption / fusion de l'état sans perte, chercheur, notifications affichées une seule fois.
// Serveur local réel (port libre, dossier temporaire), faux échange, aucun processus lancé. Lancer :  node galaxie/tests/hote-distant-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'hote-distant-'));
process.env.RAYLE_VEILLEUR_DOSSIER = dossier; process.env.RAYLE_VEILLEUR_SANS_LANCEMENT = '1';
const { creerServeur } = await import('../../serveur.mjs');
const { creerHoteLocal } = await import('../../planetes/mars/pc/agent-btc/hote-local.js');
const { creerHoteDistant } = await import('../../planetes/mars/pc/agent-btc/hote-distant.js');
const { versVeilleur, versLocal } = await import('../../planetes/mars/pc/agent-btc/basculer.js');
const { ouvrirStockageBtc } = await import('../../planetes/mars/pc/agent-btc/stockage-btc.js');
const { creerChercheur } = await import('../../app-pc/veilleur/chercheur.mjs');
const { marcheM5, DERIVE_PLANTEE } = await import('../../planetes/mars/tests/synth-m5.mjs');
const { fauxBinance } = await import('../../planetes/mars/tests/faux-binance.mjs');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const srv = creerServeur(); await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const appeler = async (chemin, corps) => (await fetch(base + '/__veilleur/' + chemin, corps !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify(corps) } : {})).json();

const PAS = 900e3, derive = DERIVE_PLANTEE, now0 = Math.floor(Date.UTC(2024, 2, 5, 12, 0) / PAS) * PAS;
const serie = marcheM5({ n: 110700, graine: 9, derive, t0: now0 - 110000 * PAS }), horloge = { t: now0 }, lire = fauxBinance(serie, horloge);
const local = creerHoteLocal({ stockage: await ouvrirStockageBtc(null), lire, maintenant: () => horloge.t, periodeMs: 3600e3, annees: 9 });
await local.demarrer({ synchro: true, boucleDirect: false });
const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };

// ── 1. page → Veilleur : adoption (pas d'état dans le fichier) ──
local.pilote().commande({ type: 'profil', patch: { cible: 1 } });
local.pilote().etat().recherche.N = 4321; local.pilote().etat().coffre.ouverts.push({ debut: serie.t[82500], fin: serie.t[109999], ouvertLe: 5, cle: 'ancienne', verdict: 'rejetee' });
const idLocal = local.pilote().etat().id;
let r = await versVeilleur({ local, appeler }); const fichier = (await appeler('pilote'));
v('adoption : l’état de la page est dans le fichier du Veilleur (même identité, N et coffre conservés)', r.mode === 'adopte' && fichier.existe && fichier.etat.id === idLocal && fichier.etat.recherche.N === 4321 && fichier.etat.coffre.ouverts.length === 1);
v('adoption : le réglage « arrière-plan » est activé dans le fichier', fichier.etat.profil.arrierePlan.actif === true);
v('la recherche locale est en pause après le passage', local.pilote().etat().pause === true);

// ── 2. hôte distant : même interface, état lu depuis le fichier ──
const notifs = [], alertes = [];
const distant = creerHoteDistant({ hoteDonnees: local, appeler, surNotification: n => notifs.push(n), surAlerte: a => alertes.push(a), periodeMs: 3600e3, maintenant: () => horloge.t });
await distant.demarrer();
let vu = distant.vue();
v('hôte distant : vue = hôte « veilleur », profil et recherche lus du fichier', vu.hote === 'veilleur' && vu.recherche.N === 4321 && vu.profil.arrierePlan.actif && vu.donnees.n > 100000);
const rep = await distant.commande({ type: 'idee_proposer', regle, origine: 'constructeur' }); v('commande par le Veilleur : idée proposée', rep.ok && distant.vue().recherche.idees.length === 1);
v('hôte distant : « idée libre » sans traducteur → message clair', (await distant.ideeLibre('acheter bas')).ok === false);
await distant.commande({ type: 'idee_valider', id: rep.id });
await distant.commande({ type: 'profil', patch: { arrierePlan: { ...distant.vue().profil.arrierePlan, heureDebut: '00:00', heureFin: '00:00' } } });          // toute la journée : le test ne dépend pas de l'heure
// le chercheur du PC (autre processus dans la vraie vie) fait le travail
const chercheur = creerChercheur({ dossier, fetchImpl: async () => { throw new Error('pas de réseau'); }, maintenant: () => horloge.t, lire, detecteur: { evaluer: async () => ({ jeu: false }) }, sansPriorite: true, trancheMs: 60000 });
const c1 = await chercheur.cycle(); const c2 = await chercheur.cycle(); if (process.env.DEBUG_M5) console.log('c1', JSON.stringify(c1.recherche).slice(0,300), 'c2', JSON.stringify(c2.recherche).slice(0,300), JSON.stringify(chercheur.etat.erreurs));
await distant.rafraichir(); vu = distant.vue();
v('le chercheur a validé la stratégie ; l’hôte distant l’affiche (VALIDÉE (backtest))', vu.strategies.length === 1 && vu.strategies[0].statut === 'validee', JSON.stringify(vu.strategies.map(s => s.statut)));
v('le compteur de variantes continue depuis celui de la page (4321 + tests du chercheur)', vu.recherche.N > 4321);
v('l’ouverture du jeu final faite par la page avant le passage est toujours là, plus celle du chercheur', vu.coffre.ouverts.length === 2 && vu.coffre.ouverts.some(o => o.cle === 'ancienne'));
v('notification de validation affichée dans l’application UNE fois', notifs.filter(n => n.type === 'validation').length === 1, notifs.map(n => n.type).join());
const avantNotifs = notifs.length; await distant.rafraichir(); await chercheur.cycle(); await distant.rafraichir(); v('pas de nouvelle affichée au rafraîchissement suivant', notifs.length === avantNotifs);
v('la notification est marquée « application » dans le fichier (plus jamais réaffichée)', (await appeler('pilote')).etat.notifications.filter(n => n.type === 'validation').every(n => n.canaux.app === true));
const carte = vu.strategies[0]; v('données du graphique : les bougies viennent de l’hôte local', distant.bougies('m15', 100).bougies.length === 100 && distant.tousLesTrades().length > 100 && distant.portefeuille().combine.n > 100 && !!distant.diagnostic(carte.id, 'oos'));
const s1 = await distant.commande({ type: 'suspendre', id: carte.id, raison: 'test' }); v('suspendre depuis la page, appliqué dans le fichier', s1.ok && distant.vue().strategies[0].statut === 'suspendue');
await distant.commande({ type: 'reactiver', id: carte.id });
v('aucune commande ne permet de forcer une validation (par le Veilleur non plus)', (await distant.commande({ type: 'valider', id: carte.id })).ok === false);
v('Veilleur injoignable : erreur claire, pas de plantage', await (async () => { const d = creerHoteDistant({ hoteDonnees: local, appeler: async () => { throw new Error('connexion refusée'); } }); const x = await d.commande({ type: 'activer', id: 'x' }); const ok2 = await d.rafraichir(); return x.ok === false && /injoignable/.test(x.erreur) && ok2 === false && /injoignable/.test(d.vue().erreur); })());

// ── 3. fusion : une AUTRE page (autre identité) se branche sur le même Veilleur ──
const autre = creerHoteLocal({ stockage: await ouvrirStockageBtc(null), lire, maintenant: () => horloge.t, periodeMs: 3600e3, annees: 9 }); await autre.demarrer({ synchro: true, boucleDirect: false });
autre.pilote().etat().recherche.N = 1000; autre.pilote().etat().coffre.ouverts.push({ debut: serie.t[82500], fin: serie.t[109999], ouvertLe: 77, cle: 'autre-page', verdict: 'rejetee' });
const avantN = (await appeler('pilote')).etat.recherche.N; r = await versVeilleur({ local: autre, appeler }); let f2 = await appeler('pilote');
v('fusion (identités différentes) : le N des deux s’additionne, aucune ouverture du jeu final perdue', r.mode === 'fusionne' && f2.etat.recherche.N === avantN + 1000 && f2.etat.coffre.ouverts.some(o => o.cle === 'autre-page') && f2.etat.coffre.ouverts.some(o => o.cle === 'ancienne'), f2.etat.recherche.N + ' vs ' + (avantN + 1000));
await versVeilleur({ local: autre, appeler }); f2 = await appeler('pilote'); v('fusion répétée : le même N n’est jamais compté deux fois', f2.etat.recherche.N === avantN + 1000, f2.etat.recherche.N);
v('fusion : le profil du Veilleur n’est pas écrasé par celui de l’autre page', f2.etat.profil.cible === 1);

// ── 4. Veilleur → page ──
r = await versLocal({ local, appeler }); const apres = await appeler('pilote');
v('retour : l’état du fichier est repris par la page (identité, stratégies, coffre, N)', r.mode === 'repris' && local.pilote().etat().id === apres.etat.id && local.pilote().bibliotheque.liste().length === 1 && local.pilote().etat().coffre.ouverts.length === apres.etat.coffre.ouverts.length && local.pilote().etat().recherche.N === apres.etat.recherche.N);
v('retour : l’arrière-plan est désactivé dans le fichier et l’arrêt du chercheur demandé', apres.etat.profil.arrierePlan.actif === false && fs.existsSync(path.join(dossier, 'chercheur.arret')));
distant.detruire(); local.detruire(); autre.detruire(); srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
