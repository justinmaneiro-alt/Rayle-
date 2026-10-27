// M6 : état global du compte (réglages, base d'équité, journal, idées), vues du gardien et du tilt, rapports parlés, détection des phrases, et branchement du gardien sur les alertes du pilote.
// Lancer :  node planetes/mars/tests/m6-etat-test.mjs
import { creerM6, etatM6Vide, assouplissements } from '../pc/agent-m6/m6-etat.js';
import { rapport, SUJETS_RAPPORT } from '../pc/agent-m6/rapports.js';
import { detecterM6 } from '../pc/agent-m6/voix-m6.js';
import { CATALOGUE_IDEES, INSPIRATIONS, nouvelleIdee, STATUTS_IDEE } from '../pc/agent-m6/idees.js';
import { creerPilote } from '../pc/agent-btc/pilote-coeur.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { marcheM5, DERIVE_PLANTEE } from './synth-m5.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const H = 3600e3, J = 86400e3, NOW = Date.UTC(2026, 9, 23, 14);
let horloge = NOW; const m = (etat = null) => creerM6({ etat, maintenant: () => horloge });
const trade = (o = {}) => ({ paire: 'BTC', sens: 'achat', t: NOW - 5 * H, tSortie: NOW - 4 * H, prixEntree: 80000, prixSortie: 80500, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'S1', frais: 2, ...o });

// ── réglages : l'assouplissement exige une confirmation ──
{
  const a = m();
  v('état neuf : règles prudentes par défaut, équité 10 322 $', a.vue().regles.perteJourPct === 3 && a.vue().regles.drawdownPct === 6 && a.vue().base.equite === 10322 && a.vue().gardien.niveau === 'VERT');
  const r1 = a.commande({ type: 'prop_regles', patch: { risqueParTradePct: 1.5 } }); v('risque par trade 0,5 → 1,5 % = moins prudent : refusé sans confirmation, avec l’explication', !r1.ok && r1.confirmationRequise && /MOINS prudent/.test(r1.erreur) && a.vue().regles.risqueParTradePct === 0.5, JSON.stringify(r1));
  const r2 = a.commande({ type: 'prop_regles', patch: { risqueParTradePct: 1.5 }, confirme: true }); v('avec confirmation : accepté et journalisé', r2.ok && a.vue().regles.risqueParTradePct === 1.5 && a.vue().journalReglages.some(x => x.type === 'regles' && x.assouplissements.length === 1));
  const r3 = a.commande({ type: 'prop_regles', patch: { risqueParTradePct: 0.25, bufferSecurite: 0.4 } }); v('plus prudent : accepté sans confirmation', r3.ok && a.vue().regles.risqueParTradePct === 0.25 && a.vue().regles.bufferSecurite === 0.4);
  const r4 = a.commande({ type: 'prop_regles', patch: { modeDrawdown: 'fixe' } }); v('drawdown « fixe » (moins strict que suiveur) : confirmation exigée', !r4.ok && r4.assouplissements[0].cle === 'modeDrawdown');
  const r5 = a.commande({ type: 'prop_regles', patch: { perteJourPct: 5, drawdownPct: 10 } }); v('limites du compte (propres au contrat) : modifiables sans confirmation, car ce sont des FAITS à ajuster', r5.ok && a.vue().compte.limites.perteJour === 500 && a.vue().compte.limites.drawdown === 1000);
  v('assouplissements() directement : sens de chaque réglage', assouplissements({ rrMin: 1.5 }, { rrMin: 1 }).length === 1 && assouplissements({ rrMin: 1.5 }, { rrMin: 2 }).length === 0 && assouplissements({ tradesParJourMax: 3 }, { tradesParJourMax: 5 }).length === 1);
}
// ── base d'équité ──
{
  const a = m(); v('équité invalide refusée', !a.commande({ type: 'prop_base', equite: -5 }).ok && !a.commande({ type: 'prop_base', equite: 10000, pic: 9000 }).ok);
  const r = a.commande({ type: 'prop_base', equite: 10500, pic: 10650, note: 'relevé du 23/10' }); v('équité et pic enregistrés avec la date', r.ok && a.vue().compte.equite === 10500 && a.vue().compte.picEquite === 10650 && a.vue().compte.plancher === 10050 && a.vue().base.t === NOW);
}
// ── journal ──
{
  const a = m(); const r = a.commande({ type: 'journal_ajouter', trade: trade() });
  v('trade ajouté : analyse immédiate, équité mise à jour', r.ok && /Trade gagnant/.test(r.analyse.issue) && a.vue().nJournal === 1);
  v('un trade fermé APRÈS la base change l’équité (base à t = null au départ : tous comptent)', a.vue().compte.equite === 10322 + 23, a.vue().compte.equite);
  const bad = a.commande({ type: 'journal_ajouter', trade: trade({ stop: 81000 }) }); v('trade invalide refusé avec la raison', !bad.ok && /mauvais côté/.test(bad.erreur));
  const id = r.id, mod = a.commande({ type: 'journal_modifier', id, patch: { erreurs: ['revanche'], notes: 'entré trop vite' } }); v('modification gardée en historique, analyse relancée', mod.ok && a.journal.trouver(id).historique.length === 1 && /revanche/.test(mod.analyse.mal.join(' ')));
  v('suppression exige une confirmation', !a.commande({ type: 'journal_supprimer', id }).ok && a.commande({ type: 'journal_supprimer', id, confirme: true }).ok && a.vue().nJournal === 0);
  // sauvegarde et rechargement : identifiants conservés
  const b = m(); const i1 = b.commande({ type: 'journal_ajouter', trade: trade() }).id, i2 = b.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - 3 * H, tSortie: NOW - 2 * H, prixEntree: 80600 }) }).id;
  const c = m(JSON.parse(JSON.stringify(b.etat()))); v('rechargement : mêmes trades, mêmes identifiants, même équité', c.vue().nJournal === 2 && c.journal.trouver(i1) && c.journal.trouver(i2) && c.vue().compte.equite === b.vue().compte.equite);
  const d = c.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - 1 * H, tSortie: NOW - 30 * 60e3, prixEntree: 80900 }) }); v('un nouveau trade après rechargement reçoit un identifiant jamais utilisé', d.ok && ![i1, i2].includes(d.id));
}
// ── import CSV : aperçu puis import confirmé, mappage mémorisé ──
{
  const a = m(), csv = 'Symbol,Side,Open Time,Close Time,Entry Price,Exit Price,Size,Realized PnL,Fee\nXBT/USD,Buy,2026-10-20 08:00:00,2026-10-20 12:30:00,80000,81200,0.05,60.00,4.10\nSOL/USD,Sell,2026-10-21 09:15:00,2026-10-21 10:00:00,105,104,10,10.00,0.5\nXBT/USD,Buy,jamais,2026-10-21 10:00:00,1,1,1,1,0\n';
  const ap = a.commande({ type: 'journal_csv_apercu', texte: csv });
  v('aperçu : 2 trades lisibles, 1 rejeté (date), rien ajouté, mappage proposé', ap.ok && ap.nTrades === 2 && ap.rejetes.length === 1 && a.vue().nJournal === 0 && ap.mappage.pnl === 'Realized PnL' && /Rien n’est encore ajouté/.test(ap.message));
  v('import sans confirmation refusé', !a.commande({ type: 'journal_csv_importer', texte: csv }).ok);
  const imp = a.commande({ type: 'journal_csv_importer', texte: csv, confirme: true }); v('import confirmé : 2 trades ajoutés, mappage mémorisé', imp.ok && imp.ajoutes === 2 && a.vue().nJournal === 2 && a.vue().mappageCSV.paire === 'Symbol');
  const redo = a.commande({ type: 'journal_csv_apercu', texte: csv }); v('réimporter le même fichier : tous détectés comme doublons', redo.nTrades === 0 && redo.doublons === 2);
  v('texte CSV vide refusé', !a.commande({ type: 'journal_csv_apercu', texte: '' }).ok);
  a.commande({ type: 'fuseau_csv', fuseau: 'Europe/Paris' }); v('fuseau mémorisé', a.vue().fuseauCSV === 'Europe/Paris');
}
// ── coupe-circuit : levée avec raison ──
{
  const a = m(); for (let k = 0; k < 3; k++) a.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - (6 - 2 * k) * H, tSortie: NOW - (5.5 - 2 * k) * H, prixEntree: 80000 + k * 10, prixSortie: 79800 + k * 10 }) });
  v('3 pertes d’affilée → coupe-circuit actif', a.vue().gardien.coupeCircuit.actif && a.vue().gardien.coupeCircuit.causes[0].type === 'serie');
  v('levée sans raison refusée ; avec raison acceptée et journalisée', !a.commande({ type: 'gardien_lever', cause: 'serie', raison: 'ok' }).ok && a.commande({ type: 'gardien_lever', cause: 'serie', raison: 'pause de 4 heures déjà prise' }).ok && !a.vue().gardien.coupeCircuit.actif && a.vue().journalReglages.some(x => x.type === 'levee'));
  v('cause de levée inconnue refusée', !a.commande({ type: 'gardien_lever', cause: 'magie', raison: 'une très bonne raison' }).ok);
}
// ── idées ──
{
  const a = m(); const r0 = a.commande({ type: 'idee_coller', texte: '' }); v('idée vide refusée', !r0.ok);
  const r1 = a.commande({ type: 'idee_coller', texte: 'Acheter quand le RSI H1 passe sous 25 pendant la session de Londres, stop 2 ATR.', lien: 'https://exemple.org/idee' }); v('idée collée = brouillon, jamais testée', r1.ok && a.vue().idees[0].statut === 'brouillon' && /ne la teste pas/.test(r1.message));
  v('lien invalide refusé (javascript:, texte)', !a.commande({ type: 'idee_coller', texte: 'x', lien: 'javascript:alert(1)' }).ok && !a.commande({ type: 'idee_coller', texte: 'x', lien: 'pas un lien' }).ok);
  const id = r1.id, bad = a.commande({ type: 'idee_structurer', id, regle: { nom: 'x', cote: 'long', conditions: [], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 } }); v('règle invalide refusée avec la raison', !bad.ok && /règle invalide/.test(bad.erreur));
  const regle = { nom: 'RSI bas à Londres', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }, { type: 'session', valeurs: [1] }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 };
  v('valider un brouillon sans règle : impossible', !a.commande({ type: 'idee_valider', id, paires: ['BTC'] }).ok);
  const s = a.commande({ type: 'idee_structurer', id, regle, mecanisme: 'survente en séance active', explication: 'Traduit par le Worker' }); v('règle structurée : « en attente de ton accord » avec description en français', s.ok && a.vue().idees[0].statut === 'a_valider' && /Achat quand/.test(s.description) && /EN ATTENTE/.test(s.message));
  v('paire inconnue : aucune paire valide → refus', !a.commande({ type: 'idee_valider', id, paires: ['ETH'] }).ok);
  const val = a.commande({ type: 'idee_valider', id, paires: ['BTC', 'DOGE'] }); v('validation par TOI : la règle part dans la file de BTC et DOGE', val.ok && val.aEnvoyer.paires.join() === 'BTC,DOGE' && val.aEnvoyer.regle.R === 3 && a.vue().idees[0].statut === 'validee');
  v('une idée déjà validée ne se revalide pas', !a.commande({ type: 'idee_valider', id, paires: ['BTC'] }).ok);
  a.commande({ type: 'idee_en_test', id }); a.commande({ type: 'idee_resultat', id, paire: 'BTC', verdict: 'rejetée au dépistage' }); v('un résultat par paire : « testée » seulement quand toutes les paires ont répondu', a.vue().idees[0].statut === 'en_test'); a.commande({ type: 'idee_resultat', id, paire: 'DOGE', verdict: 'rejetée' }); v('toutes les paires ont répondu : testée', a.vue().idees[0].statut === 'testee');
  const c = a.commande({ type: 'idee_catalogue' }); v('catalogue des projets ajouté une seule fois, avec crédit et licence', c.ajoutees === CATALOGUE_IDEES.length && a.commande({ type: 'idee_catalogue' }).ajoutees === 0 && a.vue().idees.filter(i => i.source && i.source.type === 'projet').every(i => i.credit && i.source.licence && i.source.lien));
  v('le catalogue marque ce qui est implémenté et ce qui reste à écrire', a.vue().idees.some(i => i.statut === 'implementee' && i.famille) && a.vue().idees.some(i => i.statut === 'a_implementer') && Object.keys(STATUTS_IDEE).length >= 8);
  v('inspirations créditées : 4 projets avec licence', INSPIRATIONS.length === 4 && INSPIRATIONS.every(x => x.projet.licence && x.projet.lien && x.idees.length));
  const refus = m(); const i = refus.commande({ type: 'idee_coller', texte: 'idée à refuser' }).id; refus.commande({ type: 'idee_refuser', id: i }); v('idée refusée', refus.vue().idees[0].statut === 'refusee');
  v('nouvelleIdee : jamais d’ouverture du lien, texte tronqué', nouvelleIdee({ texte: 'a'.repeat(5000) }).idee.texte.length === 1500);
}
// ── captures ──
{
  const a = m(), id = a.commande({ type: 'journal_ajouter', trade: trade() }).id, cap = a.commande({ type: 'capture_noter', capture: { paire: 'BTC', unite: 'H1', statut: 'verifiee' } });
  v('capture notée puis jointe à un trade du journal', cap.ok && a.commande({ type: 'capture_joindre', tradeId: id, captureId: cap.id }).ok && a.journal.trouver(id).capture === cap.id && !a.commande({ type: 'capture_joindre', tradeId: 'zzz', captureId: cap.id }).ok);
  v('commande inconnue refusée', !a.commande({ type: 'nimporte_quoi' }).ok);
}
// ── contrôle avant trade, alerte jugée, bilan ──
{
  const a = m(), plan = { paire: 'BTC', sens: 1, entree: 80000, stop: 79200, objectif: 82400 };
  const c = a.controle(plan); v('contrôle via l’état global : 9 points', c.points.length === 9 && c.decision === 'PASS');
  const al = a.jugerAlerteAgent({ paire: 'BTC', sens: 1, entree: 80000, stop: 79200, cible: 82400, nomStrategie: 'S' }); v('alerte jugée par l’état global', al.decision === 'PASS' && /marge du jour/.test(al.texte));
  const t = a.taille(plan); v('taille de position via l’état global', t.ok && Math.abs(t.risqueUSD - 50) < 0.01);
  for (let k = 0; k < 3; k++) a.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - (6 - 2 * k) * H, tSortie: NOW - (5.5 - 2 * k) * H, prixEntree: 80000 + k * 10, prixSortie: 79800 + k * 10, erreurs: k === 2 ? ['revanche'] : [] }) });
  v('après 3 pertes : le contrôle BLOQUE (coupe-circuit)', a.controle(plan).decision === 'BLOCK' && a.jugerAlerteAgent({ paire: 'BTC', sens: 1, entree: 80000, stop: 79200, cible: 82400 }).decision === 'BLOCK');
  const bil = a.bilan(NOW); v('bilan de la semaine calculé', bil.ok && bil.n === 3 && /Discipline/.test(bil.phrase) && bil.regles.length >= 1);
  v('revue de discipline', a.revue().length >= 1);
}
// ── rapports parlés ──
{
  const a = m(), vue = a.vue();
  const ctx = { m6: vue, pilotes: { BTC: { recherche: { N: 700000, valideesComptees: 0, cible: 3, pause: false, objectifAtteint: false, stagnation: { stagne: true }, focus: 'regimes' } }, SOL: { recherche: { N: 5000, valideesComptees: 0, cible: 3, pause: true } } }, regimes: { BTC: { ok: true, phrase: 'Bitcoin : régime « range », score 52/100.' } }, simulation: null, bilan: a.bilan(NOW), sante: { paires: { BTC: { n: 1000, derniere: NOW - 2 * 900e3, source: 'binance' } }, erreurs: [] }, maintenant: NOW, paire: 'BTC', jugements: [] };
  const g = rapport('gardien', ctx); v('rapport gardien : marge du jour, objectif, « pas un conseil »', /Marge du jour : 300 \$ sur 300 \$/.test(g.texte) && /Objectif/.test(g.texte) && /pas un conseil financier/.test(g.texte) && g.ouvrir === 'gardien');
  const c = rapport('controle', ctx); v('« ai-je le droit de prendre un trade ? » sans setup : le gardien ne s’oppose pas, mais pas de setup', /ne s’y oppose pas/.test(c.texte) && /pas de setup, pas de trade/.test(c.texte) && /aucun ordre n’est passé/.test(c.texte));
  const c2 = rapport('controle', { ...ctx, jugements: [{ paire: 'SOL', nomStrategie: 'Retour POC', texte: 'Gardien : PASS · marge du jour 300 $ sur 300 $' }] }); v('avec un setup : jugement de l’agent cité avec le nom de la stratégie et la paire', /Solana, Retour POC : Gardien : PASS/.test(c2.texte));
  const bloque = m(); for (let k = 0; k < 3; k++) bloque.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - (6 - 2 * k) * H, tSortie: NOW - (5.5 - 2 * k) * H, prixEntree: 80000 + k * 10, prixSortie: 79800 + k * 10 }) });
  v('coupe-circuit actif : « Non, pas maintenant »', /^Non, pas maintenant/.test(rapport('controle', { ...ctx, m6: bloque.vue() }).texte));
  v('rapport tilt', /Tilt/.test(rapport('tilt', ctx).texte));
  v('rapport simulation absent : invite à la lancer', /pas encore de simulation/.test(rapport('simulation', ctx).texte));
  v('rapport simulation présent : trois premières phrases + avertissement', /fourchette/.test(rapport('simulation', { ...ctx, simulation: { ok: true, phrases: ['D’après 200 trades.', 'Avec 0,5 % : 61 % (fourchette 48 % à 72 %).', 'Plage de risque.'], avertissement: 'Pas un conseil financier.' } }).texte));
  v('rapport régime', /score 52/.test(rapport('regime', ctx).texte) && /pas de régime de marché pour Solana/.test(rapport('regime', { ...ctx, paire: 'SOL' }).texte));
  v('rapport bilan', /Aucun trade fermé|Semaine du/.test(rapport('bilan', ctx).texte));
  v('rapport santé', /ordre|point|attention|Tout|contrôles/.test(rapport('sante', ctx).texte));
  v('rapport recherche : par paire, stagnation et pause', /Bitcoin : 700[\s  ]000 variantes/.test(rapport('recherche', ctx).texte) && /STAGNE/.test(rapport('recherche', ctx).texte) && /Solana.*en pause/.test(rapport('recherche', ctx).texte) && /honnête/.test(rapport('recherche', ctx).texte));
  v('rapport journal et idées', /journal est vide/.test(rapport('journal', ctx).texte) && /bibliothèque est vide/.test(rapport('idees', ctx).texte));
  v('tous les sujets du manifeste ont un rapport', SUJETS_RAPPORT.every(s => rapport(s, ctx).texte && !/ne connais pas/.test(rapport(s, ctx).texte)));
}
// ── phrases ──
{
  const T = [
    ['où j’en suis sur mes limites ?', { type: 'rapport', sujet: 'gardien' }], ['quelle est ma marge du jour', { type: 'rapport', sujet: 'gardien' }], ['ai-je le droit de prendre un trade ?', { type: 'rapport', sujet: 'controle' }], ['puis-je trader maintenant', { type: 'rapport', sujet: 'controle' }],
    ['suis-je en tilt ?', { type: 'rapport', sujet: 'tilt' }], ['quelle est la probabilité de réussir l’évaluation ?', { type: 'rapport', sujet: 'simulation' }], ['bilan de la semaine', { type: 'rapport', sujet: 'bilan' }], ['quel est le régime de Solana', { type: 'rapport', sujet: 'regime', paire: 'SOL' }],
    ['régime du marché', { type: 'rapport', sujet: 'regime', paire: null }], ['santé de l’agent', { type: 'rapport', sujet: 'sante' }], ['teste ma zone', { type: 'tester_zone' }], ['explique cette bougie', { type: 'bougie', quand: 'derniere', paire: null }], ['rejoue le dernier trade', { type: 'rejouer', quoi: 'dernier_trade' }],
    ['ouvre le journal', { type: 'ouvrir', onglet: 'journal', paire: null }], ['ouvre le gardien prop', { type: 'ouvrir', onglet: 'gardien', paire: null }], ['montre la simulation', { type: 'ouvrir', onglet: 'simulation', paire: null }], ['ouvre l’agent dogecoin', { type: 'ouvrir', onglet: 'ensemble', paire: 'DOGE' }], ['efface mes dessins', { type: 'effacer_dessins', cible: 'utilisateur' }], ['bibliothèque d’idées', { type: 'rapport', sujet: 'idees' }]
  ];
  for (const [p, att] of T) { const d = detecterM6(p); v('phrase « ' + p + ' »', d && Object.entries(att).every(([k, x]) => d[k] === x), JSON.stringify(d)); }
  v('phrases d’avant laissées à voix-poste.js (ouvre l’agent, stratégies, dernier trade, suspends…)', ['ouvre l’agent', 'montre-moi les stratégies', 'montre le dernier trade sur le graphique', 'suspends la stratégie retour poc', 'pourquoi cette stratégie a perdu ?', 'où en est la recherche ?', 'quand marche-t-elle ?'].every(p => detecterM6(p) === null));
  v('phrases sans rapport avec l’agent : null', detecterM6('quelle heure est-il') === null && detecterM6('') === null && detecterM6('mets le nasdaq en H1') === null);
}
// ── le gardien branché sur les alertes du pilote ──
{
  const derive = DERIVE_PLANTEE, mm = marcheM5({ n: 110000, graine: 9, derive });
  const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
  async function preparer(jugerAlerte) {
    let t = Date.now(); const p = creerPilote({ maintenant: () => (t += 1), jugerAlerte }); const id = p.commande({ type: 'idee_proposer', regle, origine: 'constructeur' }).id; p.commande({ type: 'idee_valider', id });
    await p.tranche({ m15: mm, budget: { chantiersMax: 1, tempsMs: 120000 } }); return p;
  }
  const rejouer = (p, n = 400) => { const n0 = mm.n - n, nouv = []; p.etat().derniereBarre = mm.t[n0 - 1]; for (let i = n0; i < mm.n; i++) { const b = { t: mm.t[i], o: mm.o[i], h: mm.h[i], l: mm.l[i], c: mm.c[i] }; nouv.push(...(p.traiterBarre({ fenetre: tranche(mm, Math.max(0, i - 5999), i + 1), bougie: b, phase: 'range' }).alertes || [])); } return nouv; };
  const libre = m(); const p1 = await preparer(a => libre.jugerAlerteAgent(a)); const al1 = rejouer(p1).filter(a => a.type === 'ENTREE');
  v('compte libre : les alertes d’ENTRÉE portent la décision PASS, la marge, la taille et le nom de la stratégie', al1.length >= 1 && al1.every(a => a.gardien && a.gardien.decision === 'PASS' && /Gardien : PASS/.test(a.texte) && /marge du jour/.test(a.texte) && a.nomStrategie && a.paire === 'BTC' && a.gardien.quantite > 0), JSON.stringify(al1[0] && al1[0].gardien));
  const serre = m(); for (let k = 0; k < 3; k++) serre.commande({ type: 'journal_ajouter', trade: trade({ t: NOW - (6 - 2 * k) * H, tSortie: NOW - (5.5 - 2 * k) * H, prixEntree: 80000 + k * 10, prixSortie: 79800 + k * 10 }) });
  const p2 = await preparer(a => serre.jugerAlerteAgent(a)); const al2 = rejouer(p2).filter(a => a.type === 'ENTREE');
  v('compte en coupe-circuit : les mêmes alertes sont BLOQUÉES et le disent, la stratégie d’origine reste nommée', al2.length >= 1 && al2.every(a => a.gardien.decision === 'BLOCK' && /^⛔ ENTRÉE BLOQUÉE PAR LE GARDIEN/.test(a.texte) && /pour mémoire/.test(a.texte) && a.nomStrategie), al2[0] && al2[0].texte);
  v('les STATISTIQUES de la stratégie (compte simulé) ne dépendent pas de ton compte : mêmes trades simulés dans les deux cas', p1.etat().compte.fermees.length === p2.etat().compte.fermees.length && p1.etat().compte.fermees.length >= 1 && JSON.stringify(p1.etat().compte.fermees.map(x => x.R)) === JSON.stringify(p2.etat().compte.fermees.map(x => x.R)));
  const sans = await preparer(null); const al3 = rejouer(sans).filter(a => a.type === 'ENTREE'); v('sans gardien branché : alertes comme avant (aucun champ gardien)', al3.length >= 1 && al3.every(a => !a.gardien && !/Gardien/.test(a.texte)));
  const casse = await preparer(() => { throw new Error('panne du gardien'); }); const al4 = rejouer(casse).filter(a => a.type === 'ENTREE'); v('gardien en panne : l’alerte part quand même, marquée « INCONNU »', al4.length >= 1 && al4.every(a => a.gardien.decision === 'INCONNU' && /n’a pas pu juger/.test(a.gardien.texte)));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
