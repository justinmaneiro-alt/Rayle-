import { detecter, repondre, trouverStrategie } from '../pc/agent-btc/voix-poste.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const d = (p, o) => detecter(p, o);

// ── détection des phrases ──
v('« ouvre l’agent »', d('Ouvre l’agent').type === 'ouvrir' && d('ouvre l agent bitcoin').type === 'ouvrir' && d('ouvre le poste de pilotage de l’agent').type === 'ouvrir');
v('V1 : « teste ma stratégie » ouvre l’onglet de test, sans toucher aux autres phrases', d('Teste ma stratégie').type === 'teste' && d('ouvre teste ma stratégie').type === 'teste' && d('je veux tester une stratégie').type === 'teste' && d('montre-moi les stratégies').type !== 'teste' && d('ouvre l agent').type === 'ouvrir');
v('« montre-moi les stratégies »', d('Montre-moi les stratégies').type === 'strategies' && d('montre moi les strategies de l agent').type === 'strategies');
v('« pourquoi cette stratégie a perdu ? »', d('Pourquoi cette stratégie a perdu ?', { fenetreOuverte: true }).type === 'perdu' && d('pourquoi la stratégie retour poc a perdu').nom === 'retour poc');
v('« quand marche-t-elle ? »', d('Quand marche-t-elle ?', { fenetreOuverte: true }).type === 'quand' && d('quand cette stratégie ne marche pas').type === 'quand');
v('« montre le dernier trade sur le graphique »', d('montre le dernier trade sur le graphique', { fenetreOuverte: true }).type === 'dernier_trade' && d('montre le dernier trade de l’agent sur le graphique').type === 'dernier_trade');
v('« suspends la stratégie X »', d('Suspends la stratégie retour poc').type === 'suspendre' && d('suspends la stratégie retour poc').nom === 'retour poc');
v('« où en est la recherche ? »', d('Où en est la recherche ?', { fenetreOuverte: true }).type === 'recherche' && d('où en est la recherche de stratégie').type === 'recherche');
v('« donne une idée à l’agent »', d('Donne une idée à l’agent').type === 'idee_donner' && d('Donne une idée à l’agent').texte === '');
v('« donne une idée à l’agent : … » garde le texte', d('Donne une idée à l’agent : acheter quand le RSI est très bas en H1').texte === 'acheter quand le rsi est tres bas en h1');
v('« valide l’idée » / « refuse l’idée »', d('valide l’idée').type === 'idee_valider' && d('teste l idée').type === 'idee_valider' && d('refuse l’idée').type === 'idee_refuser');
v('pause / reprise de la recherche', d('mets en pause la recherche de l’agent').type === 'recherche_pause' && d('relance la recherche de l’agent').type === 'recherche_reprise');
// faux positifs : ce qui n'est pas pour l'agent
v('une question de météo n’est pas prise', d('quelle est la météo à Paris') === null && d('pourquoi le ciel est bleu') === null);
v('« montre le graphique de l’or » n’est pas pris (autre commande de Mars)', d('montre-moi le graphique de l’or en H1') === null);
v('« pourquoi a perdu » sans contexte d’agent n’est pas pris', d('pourquoi mon équipe a perdu') === null);
v('« ouvre la galaxie » n’est pas pris', d('ouvre la galaxie') === null);

// ── réponses construites sur les données ──
const trades = [{ strategie: 'S1', nomStrategie: 'Retour POC', t: 3, tSortie: 4, sens: 1, R: -1.02, motif: 'stop', barres: 8, phase: 'range', phaseH4: 'range', regime: 'range', session: 'Asie', vol: 'calme', volRel: 1.2, deltaSens: 1, prixEntree: 60000, stop: 59000, cible: 64000, prixSortie: 59000 },
  { strategie: 'S1', nomStrategie: 'Retour POC', t: 1, tSortie: 2, sens: -1, R: 4.1, motif: 'cible', barres: 40, phase: 'tendance baissière', session: 'New York' }];
const vue = { recherche: { N: 12345, niveauNom: 'Règles aléatoires (sans fin)', valideesComptees: 1, cible: 3, objectifAtteint: false, pause: false, dernierChantier: { nom: 'Règle aléatoire x' } }, rechercheEnCours: true,
  strategies: [{ id: 'S1', nom: 'Retour POC', statut: 'validee', statutLibelle: 'VALIDÉE (backtest)', active: true, horsEchantillon: { Rtotal: 31.2, n: 188 } }, { id: 'S2', nom: 'Cassure H4', statut: 'suspendue', statutLibelle: 'SUSPENDUE', active: false, horsEchantillon: null }, { id: 'S3', nom: 'Vieille idée', statut: 'rejetee', statutLibelle: 'REJETÉE', active: false }] };
const ctx = { vue, trades: () => trades.slice(), diagnostic: () => ({ resume: ['Au total, Retour POC fait +0,17 R par trade sur 188 trades (41 % gagnants).', 'Quand ça marche : session « New York » (+0,40 R, 60 trades).', 'Quand ça ne marche pas : session « Asie » (−0,30 R, 30 trades).'] }), ideeEnAttente: () => ({ id: 'I1', description: 'Achat quand : RSI 14 H1 < 25.' }) };
let r = repondre(d('ouvre l’agent'), ctx); v('ouvrir : état court + onglet', r.ouvrir === 'ensemble' && /1 stratégie validée sur 3/.test(r.texte), r.texte);
r = repondre(d('montre-moi les stratégies'), ctx); v('stratégies : liste lue, la rejetée n’est pas listée', /2 stratégies/.test(r.texte) && /Retour POC, validée \(backtest\), 31,2 R net hors échantillon sur 188 trades/.test(r.texte) && !/Vieille idée/.test(r.texte) && r.ouvrir === 'strategies', r.texte);
r = repondre(d('pourquoi cette stratégie a perdu', { fenetreOuverte: true }), ctx); v('perdu : explication du dernier trade perdant + où elle perd', /Perdant/.test(r.texte) && /Pris le/.test(r.texte) && /Quand ça ne marche pas/.test(r.texte) && r.trade.strategie === 'S1', r.texte);
r = repondre(d('quand marche-t-elle', { fenetreOuverte: true }), ctx); v('quand : résumé du diagnostic + prudence', /Quand ça marche/.test(r.texte) && /pistes, pas comme des règles/.test(r.texte) && r.ouvrir === 'diagnostic');
r = repondre(d('montre le dernier trade sur le graphique', { fenetreOuverte: true }), ctx); v('dernier trade : ouvre le graphique', r.graphiqueDernier && /Retour POC/.test(r.texte) && r.ouvrir === 'graphique');
r = repondre(d('suspends la stratégie retour poc'), ctx); v('suspendre : commande de suspension de la bonne stratégie', r.commande && r.commande.type === 'suspendre' && r.commande.id === 'S1' && /suspendue/.test(r.texte));
r = repondre(d('suspends la stratégie cassure h4'), ctx); v('suspendre une stratégie déjà suspendue : rien à faire', !r.commande && /rien à suspendre/.test(r.texte), r.texte);
r = repondre(d('suspends la stratégie'), ctx); v('suspendre sans nom, plusieurs candidates : demande laquelle', !r.commande || r.commande.id === 'S1');
r = repondre(d('où en est la recherche', { fenetreOuverte: true }), ctx); v('recherche : variantes, niveau, validées, dernière idée, rappel du hasard', /12\s?345 variantes testées/.test(r.texte.replace(/ | /g, ' ')) && /Règles aléatoires/.test(r.texte) && /1 stratégie validée sur 3/.test(r.texte) && /seuil du hasard monte/.test(r.texte), r.texte);
r = repondre(d('donne une idée à l’agent'), ctx); v('idée sans texte : ouvre le laboratoire', r.ouvrir === 'labo');
r = repondre(d('donne une idée à l’agent : acheter si le rsi est bas'), ctx); v('idée avec texte : à traduire par la page', r.idee === 'acheter si le rsi est bas');
r = repondre(d('valide l’idée'), ctx); v('valider l’idée : commande + rappel que les critères sont les mêmes', r.commande.type === 'idee_valider' && r.commande.id === 'I1' && /mêmes critères/.test(r.texte));
r = repondre(d('refuse l’idée'), ctx); v('refuser l’idée', r.commande.type === 'idee_refuser');
r = repondre(d('valide l’idée'), { ...ctx, ideeEnAttente: () => null }); v('valider sans idée en attente : le dit', !r.commande && /Aucune idée/.test(r.texte));
v('trouverStrategie : par fragment de nom, sinon dernier trade', trouverStrategie(vue, 'cassure', []).s.id === 'S2' && trouverStrategie(vue, null, trades).s.id === 'S1');
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
