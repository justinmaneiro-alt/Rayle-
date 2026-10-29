// V8 : modèles d'affichage de l'écran « Agents trading » mobile (core/mobile/mobile-agent-calcul.js). Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/mobile-agent-calcul-test.mjs
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url), A = req('../../core/mobile/mobile-agent-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const T = 1_800_000_000_000;

// onglets : les trois premiers sont ceux demandés
v('onglets : Positions du jour · Graphique · Performance en premier', A.ONGLETS.slice(0, 3).map(o => o.id).join() === 'positions,graphique,performance');
v('onglets : stratégies, agent, liquidité, équipe, occasions, exemples, données, réglages présents', ['strategies', 'agent', 'liquidite', 'equipe', 'occasions', 'exemples', 'donnees', 'reglages'].every(id => A.ONGLETS.some(o => o.id === id)));

// preuve manquante en clair
v('il manque N trades pour être Candidate', A.manqueTrades(29, 'non_testee') === 'il manque 71 trades hors échantillon pour être Candidate (100 exigés)');
v('Candidate : il manque pour Validée (150)', /il manque 50 trades.*Validée \(150/.test(A.manqueTrades(100, 'candidate')));
v('un seul trade manquant : singulier', /il manque 1 trade hors/.test(A.manqueTrades(99, 'non_concluante')));
v('Validée : rien ne manque', A.manqueTrades(10, 'validee') === null && A.manqueTrades(120, 'non_concluante') === null);

// niveaux de preuve toujours visibles avec leurs statistiques
const pv = A.preuve({ niveau: 'candidate', n: 120, tauxReussite: 0.45, rrMoyen: 1.7, esperance: 0.09, fourchette: [-0.1, 0.3] });
v('preuve Candidate : libellé, stats réelles, fourchette, message de prudence', pv.libelle === 'Candidate (en observation)' && pv.stats.esperance === 0.09 && pv.stats.fourchette[1] === 0.3 && /test, pas comme un signal fiable/.test(pv.message));
const pn = A.preuve(undefined);
v('preuve absente : « Idée non testée », aucune statistique inventée, message de prudence', pn.niveau === 'non_testee' && pn.stats === null && /Preuve insuffisante/.test(pn.message) && pn.libelle === 'Idée non testée');
v('preuve Validée : pas de message d’alerte', A.preuve({ niveau: 'validee', n: 200 }).message === '');
v('preuve non concluante : message de prudence', /insuffisante/.test(A.preuve({ niveau: 'non_concluante', n: 40 }).message));

// cartes de position
const props = [
  { id: 'a', agent: 'rebond', actif: 'BTC', tf: 'H1', sens: 1, limite: 80000, stop: 79500, cible: 81000, cible2: 82000, zone: [80100, 79900], rr: 2, raison: 'Balayage du plus bas de 02h', invalidation: 'clôture H1 sous 79 500', tValide: T + 3600e3, t: T - 60e3, statut: 'en_attente', confluence: { diamant: true }, preuve: { niveau: 'candidate', n: 110, esperance: 0.1 } },
  { id: 'b', agent: 'continuation', actif: 'SOL', tf: 'M15', sens: -1, limite: 100, stop: 101, cible: 98, statut: 'ouverte', tValide: T + 100, t: T - 5000, preuve: { niveau: 'non_testee' } },
  { id: 'c', agent: 'extremes', actif: 'DOGE', tf: 'H1', sens: 1, limite: 0.08, stop: 0.079, cible: 0.082, statut: 'cloturee', resultat: { R: 2 }, tValide: T - 1, t: T - 9000, preuve: { niveau: 'validee', n: 200 } },
  { id: 'd', agent: 'rebond', actif: 'BTC', tf: 'M15', sens: 1, limite: 79000, stop: 78900, cible: 79300, statut: 'en_attente', tValide: T - 10, t: T - 90000, preuve: {} }
];
const cartes = A.cartesPositions({ propositions: props }, T);
v('cartes : triées ouverte, en attente, cible, expirée', cartes.map(c => c.id).join() === 'b,a,c,d', cartes.map(c => c.id + ':' + c.live.code).join());
const a = cartes.find(c => c.id === 'a');
v('carte : sens, actif, unité, agent, 💎, zone ordonnée, cibles, RR, raison, invalidation', a.sensTexte === 'ACHAT' && a.actif === 'BTC' && a.tf === 'H1' && a.agentNom === 'Rebond' && a.diamant && a.zone[0] === 79900 && a.cibles.length === 2 && a.rr === 2 && /Balayage/.test(a.raison) && /clôture H1/.test(a.invalidation));
v('carte : statut live en clair', a.live.texte === 'En attente' && cartes.find(c => c.id === 'b').live.texte === 'Entrée touchée' && cartes.find(c => c.id === 'c').live.texte === 'Cible atteinte' && cartes.find(c => c.id === 'd').live.texte === 'Expirée');
v('carte : la vente est une vente', cartes.find(c => c.id === 'b').sens === 'vente');
v('carte : la validité dépassée marque expirée', cartes.find(c => c.id === 'd').expiree === true);
v('carte : chaque carte porte son niveau de preuve (jamais caché)', cartes.every(c => c.preuve && c.preuve.libelle));

// aucune position
const vide = A.aucunePosition({ hypotheses_du_moment: [{ type: 'preuve', actif: 'BTC', tf: 'H1', limite: 80000, stop: 79500, cible: 81000, sens: 1, raison: 'x', pourquoi: 'RR insuffisant', quand: 'si le prix balaie 79 900' }, { actif: 'SOL', raison: 'zone', pourquoi: 'pas de confluence', quand: 'à 98' }], zonesDiamant: { BTC: [{ niveau: 79000, cote: 'support', distancePct: 2, tf: 'H1' }, { niveau: 81500, cote: 'resistance', distancePct: 0.8, tf: 'H1' }] } });
v('aucune position : hypothèses avec pourquoi et quand', vide.hypotheses.length === 2 && vide.hypotheses[0].pourquoi === 'RR insuffisant' && /balaie/.test(vide.hypotheses[0].quand));
v('aucune position : la meilleure hypothétique a sa carte, la zone seule non', vide.hypotheses[0].carte && vide.hypotheses[1].carte === null);
v('aucune position : zones triées par distance', vide.zones[0].niveau === 81500 && vide.zones[0].actif === 'BTC');
v('aucune position sans hypothèse : explication claire', /filtre qualité/.test(A.aucunePosition({}).explication));

// pistes
const piste = { id: 'p', nom: 'Cassure H1', paire: 'SOL', statut: { code: 'prometteuse', texte: 'PROMETTEUSE, NON PROUVÉE' }, trades: 71, esperanceApres: 0.2, tauxReussite: 0.4, rrMoyen: 2, bootstrapBas: 0.1, dsr: 0.12, ddPct: 11, manque: [{ critere: 'hasard', texte: 'probabilité de hasard 12 %' }], niveaux: { strict: { niveau: 'non_concluante' }, equilibre: { niveau: 'candidate' } }, enPepiniere: true };
const lp = A.lignePiste(piste);
v('piste : preuve manquante en clair, strict et équilibré', lp.manqueTrades === 'il manque 29 trades hors échantillon pour être Candidate (100 exigés)' && lp.strict.texte === 'Testée : non concluante' && lp.equilibre.texte === 'Candidate (en observation)' && lp.manque[0] === 'probabilité de hasard 12 %');
const ent = A.lignesEntonnoir({ evaluations: 400, criteres: [{ critere: 'A', rate: 400, seul: 0, part: 1 }, { critere: 'B', rate: 100, seul: 2, part: 0.25 }, { critere: 'C', rate: 392, part: 0.98 }] }, 2);
v('entonnoir : triés par part ratée, en pourcentage', ent.length === 2 && ent[0].critere === 'A' && ent[0].pct === 100 && ent[1].pct === 98);
v('entonnoir absent : liste vide', A.lignesEntonnoir(null).length === 0 && A.lignesEntonnoir({ evaluations: 0, criteres: [] }).length === 0);

// types de setup et statuts
const types = A.lignesTypes([{ nomType: 'Repli 20', actif: 'BTC', tf: 'H1', niveau: 'non_concluante', n: 120 }, { nomType: 'Balayage', actif: 'SOL', tf: 'M15', niveau: 'validee', n: 200 }, { nomType: 'Absorption', actif: 'DOGE', tf: 'H1', niveau: 'non_testee', n: 10 }, { nomType: 'Mur', actif: 'BTC', tf: 'H1', niveau: 'candidate', n: 110 }]);
v('types : Validée, Candidate, En test, Rejetée', types.map(t => t.statut).join() === 'Validée,Candidate,En test,Rejetée', types.map(t => t.statut).join());
v('types : comptage par statut', A.compterStatuts(types).Validée === 1 && A.compterStatuts(types).Rejetée === 1);

// performance
const perf = { risquePct: 0.5, tous: { n: 3, Rtotal: 2.5, pct: 1.25, courbe: [[T - 40 * 86400e3, 1], [T - 10 * 86400e3, 0.5], [T - 2 * 86400e3, 2.5]], jours: { '2026-01-01': 1 } }, parAgent: { rebond: { n: 2, Rtotal: 1, pct: 0.5, courbe: [[T, 1]], jours: {} } }, parActif: { BTC: { n: 1, Rtotal: -1, pct: -0.5, courbe: [[T, -1]], jours: {} } } };
v('performance : tous, par agent, par actif', A.selectionPerformance(perf, {}).n === 3 && A.selectionPerformance(perf, { agent: 'rebond' }).Rtotal === 1 && A.selectionPerformance(perf, { actif: 'BTC' }).Rtotal === -1);
const p30 = A.selectionPerformance(perf, { jours: 30, maintenant: T });
v('performance sur 30 jours : courbe rebasée à zéro au début de la période', p30.courbe.length === 2 && p30.courbe[0][1] === -0.5 + 0 || p30.courbe[0][1] === 0, JSON.stringify(p30.courbe));
v('performance : sans données, null (pas de faux zéros)', A.selectionPerformance(null, {}) === null);
v('phrase d’état honnête', /Aucun trade simulé/.test(A.phraseEtatPerf({ n: 0 })) && /Preuve encore insuffisante/.test(A.phraseEtatPerf({ n: 22, Rtotal: 4.2, pct: 2.1 })) && /\+4,2 R/.test(A.phraseEtatPerf({ n: 22, Rtotal: 4.2, pct: 2.1 })));

// réglages : bornés (le service revalide aussi)
const r = A.reglagesDepuis({ agents: { rebond: true, continuation: false, extremes: 1 }, actifs: ['BTC', 'XRP'], unites: ['M15', 'D1'], maxParAgent: 99, maxNouvellesParJour: 0, confluenceMin: 2.4, risquePct: 9, niveauPreuveMin: 'tout', afficherIdees: true, alertesObservation: false });
v('réglages : actifs et unités filtrés, nombres bornés, valeurs inconnues ignorées', JSON.stringify(r.actifs) === '["BTC"]' && JSON.stringify(r.unites) === '["M15"]' && r.maxParAgent === 6 && r.maxNouvellesParJour === 1 && r.confluenceMin === 2 && r.risquePct === 2 && r.niveauPreuveMin === undefined && r.afficherIdees === true && r.alertesObservation === false && r.agents.extremes === true);

// exemple marqué
v('exemple valide', JSON.stringify(A.exempleDepuis({ actif: 'BTC', sens: 'achat', avis: 'bon', t: T, entree: 80000, stop: 79500, cible: 81000 })) === JSON.stringify({ actif: 'BTC', sens: 'achat', avis: 'bon', t: T, entree: 80000, stop: 79500, cible: 81000 }));
v('exemple invalide refusé (actif, sens, avis, prix)', A.exempleDepuis({ actif: 'XRP', sens: 'achat', avis: 'bon', t: T, entree: 1 }) === null && A.exempleDepuis({ actif: 'BTC', sens: 'x', avis: 'bon', t: T, entree: 1 }) === null && A.exempleDepuis({ actif: 'BTC', sens: 'achat', avis: 'bon', t: T }) === null);

// couleurs du calendrier
v('calendrier : vert gagnant, rouge perdant, neutre sans trade', /47,209,139/.test(A.couleurCase(1)) && /255,93,110/.test(A.couleurCase(-0.5)) && /143,208,227/.test(A.couleurCase(0)));
console.log(`\nÉcran Agents (mobile) : ${ok} vérifications réussies, ${ko} échec(s).`); process.exit(ko ? 1 : 0);
