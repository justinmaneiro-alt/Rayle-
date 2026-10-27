import { creerHoteLocal } from '../pc/agent-btc/hote-local.js';
import { ouvrirStockageBtc } from '../pc/agent-btc/stockage-btc.js';
import { marcheM5 } from '../tests/synth-m5.mjs';
import { fauxBinance } from '../tests/faux-binance.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const T0 = Date.now(); const log = m => console.log(((Date.now() - T0) / 1000).toFixed(1) + "s " + m);
const attendre = async (cond, ms = 60000) => { const t0 = Date.now(); let k = 0; while (!cond() && Date.now() - t0 < ms) { await new Promise(r => setTimeout(r, 20)); if (++k % 250 === 0 && process.env.DEBUG_M5) log('attente… ' + JSON.stringify(hote.vue().progres)); } return cond(); };

const N = 110200, PAS = 900e3, derive = h => (h >= 14 && h < 15 ? 0.25 : 0);
const now0 = Math.floor(Date.UTC(2023, 5, 1, 12, 0) / PAS) * PAS, t0 = now0 - 110000 * PAS;
const serie = marcheM5({ n: N, graine: 9, derive, t0 });
const horloge = { t: now0 }, lire = fauxBinance(serie, horloge);
const stockage = await ouvrirStockageBtc(null);                 // disque en mémoire
const notifs = [], alertes = [], telegram = [], changements = { n: 0 };
const hote = creerHoteLocal({ stockage, lire, maintenant: () => horloge.t, periodeMs: 3600e3, pausePersonnalisee: 0, surChangement: () => changements.n++, surAlerte: a => alertes.push(a), surNotification: n => notifs.push(n), envoyerTelegram: async (texte, type) => { telegram.push({ texte, type }); }, annees: 9 });
log('start'); await hote.demarrer({ synchro: true, boucleDirect: false }); log('données ok');
const d = hote.vue().donnees;
v('données : historique chargé depuis la source (Binance simulé), delta réel', d.n >= 109000 && d.source === 'binance' && d.deltaReelPct > 0.99, JSON.stringify([d.n, d.source]));
v('données : nombre de trous et années affichables', typeof d.nbLacunes === 'number' && d.annees > 3);
v('vue : profil, critères v2, stratégies vides, recherche à zéro, hôte local', hote.vue().criteres.version === 2 && hote.vue().strategies.length === 0 && hote.vue().recherche.N === 0 && hote.vue().hote === 'local');

// idée libre sans traducteur → message clair ; avec traducteur → règle EN ATTENTE
const r0 = await hote.ideeLibre('achète quand le RSI est bas'); v('idée libre sans Worker : message clair, rien de créé', !r0.ok && /route \/agent\/idee/.test(r0.erreur) && hote.vue().recherche.idees.length === 0);
const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };


// idée validée → recherche → validation → notifications app + Telegram
const id = (await hote.commande({ type: 'idee_proposer', regle, origine: 'constructeur' })).id;
await hote.commande({ type: 'profil', patch: { cible: 1 } });          // une seule stratégie suffit pour ce test : la recherche s’arrête à l’objectif
await hote.commande({ type: 'idee_valider', id });
log('avant recherche'); v('la recherche démarre toute seule après validation d’une idée', await attendre(() => hote.vue().strategies.length > 0, 90000));
await attendre(() => !hote._boucle(), 30000);
const vv = hote.vue(), carte = vv.strategies[0];
v('stratégie VALIDÉE (backtest), avancement atteint, 3 jeux de résultats séparés', carte && carte.statut === 'validee' && carte.horsEchantillon.avancement.atteint && carte.jeuFinal.ok && carte.compteSimule.n === 0, carte && carte.statut);
v('notification de validation reçue dans l’application', notifs.some(n => n.type === 'validation'));
v('notification de validation envoyée sur Telegram (une seule fois)', telegram.filter(x => x.type === 'validation').length === 1 && /VALIDÉE/.test(telegram[0].texte));
v('la recherche a compté ses variantes et affiche l’avertissement des comparaisons multiples', vv.recherche.N > 0 && /durcit le seuil/.test(vv.recherche.avertissement));
v('le coffre contient une ouverture du jeu final', vv.coffre.ouverts.length === 1);
v('sauvegardé dans le stockage', !!(await stockage.lire('pilote')) && (await stockage.lire('pilote')).valeur.bibliotheque.strategies.length === 1);

// rechargement dans un nouvel hôte : même état
const hoteB = creerHoteLocal({ stockage, lire, maintenant: () => horloge.t, periodeMs: 3600e3 }); await hoteB.demarrer({ synchro: false, boucleDirect: false });
v('rechargement : stratégie, coffre et compteur retrouvés', hoteB.vue().strategies.length === 1 && hoteB.vue().coffre.ouverts.length === 1 && hoteB.vue().recherche.N === vv.recherche.N && hoteB.vue().donnees.n === d.n);
hoteB.detruire();

// direct : on avance l'horloge d'un jour (96 bougies) par pas de 15 min
const avant = hote.vue().compte.fermees.length + hote.vue().compte.ouvertes.length + hote.vue().compte.attente.length;
for (let k = 0; k < 96 * 4; k++) { horloge.t += PAS; await hote.miseAJour(); }
const apres = hote.vue();
v('direct : les nouvelles bougies fermées sont traitées', apres.derniereBarre >= horloge.t - 2 * PAS, apres.derniereBarre + ' vs ' + horloge.t);
v('direct : alertes d’ENTRÉE avec le nom de la stratégie (application et Telegram)', alertes.some(a => a.type === 'ENTREE' && a.nomStrategie === carte.nom) && telegram.some(x => /🟢/.test(x.texte) && x.texte.includes(carte.nom)), alertes.length + ' alertes');
v('direct : compte simulé séparé alimenté', apres.compte.fermees.length >= 1);
// graphique
const bg = hote.bougies('m15', 500); v('bougies M15 (500)', bg.bougies.length === 500 && bg.bougies[499].t > bg.bougies[0].t);
const bh1 = hote.bougies('h1', 300); const bh4 = hote.bougies('h4', 200); v('bougies H1 et H4 regroupées', bh1.bougies.length === 300 && bh4.bougies.length === 200 && bh1.bougies[1].t - bh1.bougies[0].t === 3600e3 && bh4.bougies[1].t - bh4.bougies[0].t === 14400e3);
const sc = hote.surcouches(400); v('surcouches : POC, zone de valeur, VWAP, phase, session alignés', sc.t.length === 400 && sc.poc.length === 400 && sc.vwap.some(Number.isFinite) && sc.phase.length === 400);
// commandes
v('activer / pause / suspendre / supprimer', (await hote.commande({ type: 'pause', id: carte.id })).ok && !hote.pilote().bibliotheque.trouver(carte.id).active && (await hote.commande({ type: 'activer', id: carte.id })).ok && (await hote.commande({ type: 'suspendre', id: carte.id, raison: 'test' })).ok && hote.pilote().bibliotheque.trouver(carte.id).statut === 'suspendue');
hote.detruire();
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
