// M6 partie 5 : journal de trades, import CSV avec mappage de colonnes, analyse après trade, bilan hebdomadaire, revue de discipline.
// Lancer :  node planetes/mars/tests/m6-journal-test.mjs
import { analyserCSV, proposerMappage, appliquerMappage, lireDateCSV, normaliserPaire, normaliserSens, detecterDelimiteur, devinerOrdreDates, exporterCSV, validerTrade, creerJournal, analyseTrade, bilanSemaine, revueDiscipline, debutSemaine, ETIQUETTES_ERREUR } from '../pc/agent-m6/journal.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ── normalisations ──
{
  v('paires : XBT/USD, PF_XBTUSD, BTCUSDT → BTC ; XDG/USD, DOGE/USD → DOGE ; SOL/USD → SOL', ['XBT/USD', 'PF_XBTUSD', 'BTCUSDT', 'btc-usd'].every(x => normaliserPaire(x).paire === 'BTC') && ['XDG/USD', 'DOGE/USD', 'PF_DOGEUSD'].every(x => normaliserPaire(x).paire === 'DOGE') && normaliserPaire('SOL/USD').paire === 'SOL');
  v('paire inconnue gardée, marquée non connue', normaliserPaire('ETH/USD').connue === false && normaliserPaire('ETH/USD').paire === 'ETHUSD');
  v('sens : achat/buy/long/B → +1, vente/sell/short/S → −1, reste = 0', ['Achat', 'BUY', 'long', 'b'].every(x => normaliserSens(x) === 1) && ['Vente', 'Sell', 'SHORT', 's'].every(x => normaliserSens(x) === -1) && normaliserSens('?') === 0);
  v('dates ISO', lireDateCSV('2026-10-22T14:30:00Z') === Date.UTC(2026, 9, 22, 14, 30) && lireDateCSV('2026-10-22 14:30:15') === Date.UTC(2026, 9, 22, 14, 30, 15) && lireDateCSV('2026-10-22') === Date.UTC(2026, 9, 22));
  v('dates unix : secondes et millisecondes', lireDateCSV('1700000000') === 1700000000000 && lireDateCSV('1700000000123') === 1700000000123);
  v('dates JJ/MM/AAAA et MM/JJ/AAAA', lireDateCSV('22/10/2026 14:30') === Date.UTC(2026, 9, 22, 14, 30) && lireDateCSV('10/22/2026 14:30', { ordre: 'MJA' }) === Date.UTC(2026, 9, 22, 14, 30) && Number.isNaN(lireDateCSV('45/10/2026')));
  v('fuseau Europe/Paris : 14 h d’été = 12 h UTC ; 14 h d’hiver = 13 h UTC', lireDateCSV('23/10/2026 14:00', { fuseau: 'Europe/Paris' }) === Date.UTC(2026, 9, 23, 12) && lireDateCSV('10/12/2026 14:00', { fuseau: 'Europe/Paris' }) === Date.UTC(2026, 11, 10, 13));
  v('fuseau : le jour du changement d’heure d’automne (25/10/2026 à 01:30 Paris = 23:30 UTC la veille ou 00:30 UTC)', [Date.UTC(2026, 9, 24, 23, 30), Date.UTC(2026, 9, 25, 0, 30)].includes(lireDateCSV('25/10/2026 01:30', { fuseau: 'Europe/Paris' })));
  v('date illisible → NaN', Number.isNaN(lireDateCSV('hier soir')) && Number.isNaN(lireDateCSV('')));
  v('ordre des dates deviné : 22/10 → JMA sûr ; 10/22 → MJA sûr ; 05/06 → ambigu', devinerOrdreDates(['22/10/2026']).ordre === 'JMA' && devinerOrdreDates(['10/22/2026']).ordre === 'MJA' && devinerOrdreDates(['05/06/2026']).ambigu === true);
  v('délimiteur détecté', detecterDelimiteur('a;b;c\n1;2;3') === ';' && detecterDelimiteur('a,b,c') === ',' && detecterDelimiteur('a\tb\tc') === '\t');
}
// ── CSV : analyse (guillemets, séparateurs, BOM) ──
{
  const t = '﻿Symbol;Side;"Open time";Note\nXBT/USD;Buy;2026-10-22 10:00;"a;b ""cité"""\nSOL/USD;Sell;2026-10-22 11:00;\n\n';
  const c = analyserCSV(t); v('CSV : BOM retiré, 4 colonnes, 2 lignes, guillemets doublés lus', c.ok && c.entetes.join('|') === 'Symbol|Side|Open time|Note' && c.n === 2 && c.lignes[0][3] === 'a;b "cité"', JSON.stringify(c));
  v('CSV vide refusé', !analyserCSV('').ok);
}
// ── CSV : trois formats plausibles, aucun n’est celui de Kraken Prop (inconnu) ──
const CSV_EN = 'Symbol,Side,Open Time,Close Time,Entry Price,Exit Price,Size,Realized PnL,Fee\nXBT/USD,Buy,2026-10-20 08:00:00,2026-10-20 12:30:00,80000,81200,0.05,60.00,4.10\nXBT/USD,Sell,2026-10-21 09:15:00,2026-10-21 10:00:00,81000,81400,0.04,-16.00,3.30\nSOL/USD,Buy,2026-10-21 14:00:00,,104.3,,10,,\n';
const CSV_FR = 'Marché;Sens;Date ouverture;Date fermeture;Prix d\'entrée;Prix de sortie;Quantité;Résultat;Frais\nDOGE/USD;Achat;20/10/2026 10:00;20/10/2026 18:00;0,0800;0,0830;5000;15,00;1,20\nDOGE/USD;Vente;22/10/2026 10:00;22/10/2026 11:00;0,0830;0,0840;5000;-5,00;1,10\n';
{
  const a = analyserCSV(CSV_EN), m = proposerMappage(a.entetes);
  v('format anglais : mappage automatique de toutes les colonnes', m.paire === 'Symbol' && m.sens === 'Side' && m.t === 'Open Time' && m.tSortie === 'Close Time' && m.prixEntree === 'Entry Price' && m.prixSortie === 'Exit Price' && m.quantite === 'Size' && m.pnl === 'Realized PnL' && m.frais === 'Fee', JSON.stringify(m));
  const r = appliquerMappage(a, m, {});
  v('3 lignes lues : 2 fermées, 1 ouverte sans gain (calculable seulement si fermée) → 1 rejet « gain introuvable »', r.trades.length === 2 && r.rejetes.length === 1 && /gain introuvable/.test(r.rejetes[0].raison) && r.rejetes[0].ligne === 4, JSON.stringify(r.rejetes));
  v('trade 1 : BTC achat, +60 $, fermé, heures UTC', r.trades[0].paire === 'BTC' && r.trades[0].sens === 1 && r.trades[0].pnl === 60 && r.trades[0].t === Date.UTC(2026, 9, 20, 8) && r.trades[0].statut === 'ferme' && r.trades[0].frais === 4.1);
  v('avertissement : heures lues en UTC faute de fuseau', r.avertissements.some(x => /UTC/.test(x)));
  const f = analyserCSV(CSV_FR), mf = proposerMappage(f.entetes);
  v('format français : mappage et décimale à virgule', mf.paire === 'Marché' && mf.sens === 'Sens' && mf.t === 'Date ouverture' && mf.pnl === 'Résultat' && mf.frais === 'Frais', JSON.stringify(mf));
  const rf = appliquerMappage(f, mf, { fuseau: 'Europe/Paris' });
  v('français : DOGE, 0,0800 lu 0,08 ; heures Paris converties (10 h d’été = 8 h UTC)', rf.trades.length === 2 && rf.trades[0].paire === 'DOGE' && rf.trades[0].prixEntree === 0.08 && rf.trades[0].t === Date.UTC(2026, 9, 20, 8) && rf.trades[1].pnl === -5, JSON.stringify(rf.trades[0]));
  v('français : ordre des dates sûr (20/10 → JJ/MM) donc pas d’avertissement d’ambiguïté', !rf.avertissements.some(x => /ambigu/.test(x)));
  // sans gain mais avec prix + quantité : le gain est calculé (frais déduits)
  const sansPnl = appliquerMappage(a, { ...m, pnl: undefined }, {});
  v('gain calculé depuis prix et quantité quand la colonne est absente : (81200 − 80000) × 0,05 − 4,10 = 55,90', proche(sansPnl.trades[0].pnl, 55.9, 1e-9) && proche(sansPnl.trades[1].pnl, -(81400 - 81000) * 0.04 - 3.3, 1e-9), JSON.stringify(sansPnl.trades.map(x => x.pnl)));
  // mauvais mappage : colonne non mappée → rejets + avertissements
  const mauvais = appliquerMappage(a, { paire: 'Symbol', sens: 'Side' }, {});
  v('mappage incomplet : lignes rejetées et avertissements clairs', mauvais.trades.length === 0 && mauvais.avertissements.some(x => /« t » non mappée/.test(x)) && mauvais.rejetes.length === 3);
  const sensFaux = appliquerMappage(analyserCSV('Symbol,Side,Time,PnL\nBTC,???,2026-10-20 10:00,5'), proposerMappage(['Symbol', 'Side', 'Time', 'PnL']), {}); v('sens illisible : ligne rejetée avec la valeur', sensFaux.rejetes[0].raison.includes('???'));
  // doublons
  const dbl = appliquerMappage(analyserCSV(CSV_EN + 'XBT/USD,Buy,2026-10-20 08:00:00,2026-10-20 12:30:00,80000,81200,0.05,60.00,4.10\n'), m, {}); v('doublon dans le fichier détecté', dbl.doublons === 1 && dbl.trades.length === 2);
  const dejaLa = appliquerMappage(a, m, { dejaConnus: [['BTC', Date.UTC(2026, 9, 20, 8), 80000, 0.05, 1].join('|')] }); v('doublon avec le journal existant détecté', dejaLa.doublons === 1);
  const sansDate = appliquerMappage(analyserCSV('Symbol,Side,Time,PnL\nBTC,Buy,pas une date,5'), proposerMappage(['Symbol', 'Side', 'Time', 'PnL']), {}); v('date illisible : rejet avec la valeur', /pas une date/.test(sansDate.rejetes[0].raison));
  const amb = appliquerMappage(analyserCSV('Symbol,Side,Time,PnL\nBTC,Buy,05/06/2026 10:00,5'), proposerMappage(['Symbol', 'Side', 'Time', 'PnL']), {}); v('date ambiguë signalée', amb.avertissements.some(x => /ambigu/.test(x)));
  const inc = appliquerMappage(analyserCSV('Symbol,Side,Time,PnL\nETH/USD,Buy,2026-10-20 10:00,5'), proposerMappage(['Symbol', 'Side', 'Time', 'PnL']), {}); v('paire hors BTC/SOL/DOGE gardée mais signalée', inc.trades.length === 1 && inc.trades[0].paireInconnue && inc.avertissements.some(x => /hors BTC/.test(x)));
}
// ── validation et journal ──
{
  const T = Date.UTC(2026, 9, 20, 8), base = { paire: 'XBT/USD', sens: 'achat', t: T, tSortie: T + 3600e3, prixEntree: 80000, prixSortie: 81200, quantite: 0.05, stop: 79000, objectif: 83000, frais: 4 };
  const r = validerTrade(base, T + 86400e3); v('trade valide : gain calculé 60 − 4 = 56, risque 50 $, R = 1,12, R/R = 3', r.ok && proche(r.trade.pnl, 56) && proche(r.trade.risqueUSD, 50) && proche(r.trade.R, 1.12) && proche(r.trade.rr, 3) && r.trade.statut === 'ferme', JSON.stringify(r));
  v('refusés : stop du mauvais côté, sortie avant l’entrée, futur, sens, quantité négative', !validerTrade({ ...base, stop: 81000 }, T + 9e8).ok && !validerTrade({ ...base, tSortie: T - 1 }, T + 9e8).ok && !validerTrade({ ...base, t: T + 1e10 }, T).ok && !validerTrade({ ...base, sens: '?' }, T + 9e8).ok && !validerTrade({ ...base, quantite: -1 }, T + 9e8).ok);
  v('trade fermé sans gain ni prix : refusé', !validerTrade({ paire: 'BTC', sens: 1, t: T, tSortie: T + 1000 }, T + 9e8).ok);
  v('trade ouvert accepté sans gain', validerTrade({ paire: 'BTC', sens: 1, t: T, prixEntree: 80000, quantite: 0.01, stop: 79000 }, T + 9e8).trade.statut === 'ouvert');
  v('étiquettes d’erreur inconnues ignorées, notes nettoyées', validerTrade({ ...base, erreurs: ['revanche', 'inventée'], notes: '<b>x</b>' }, T + 9e8).trade.erreurs.join() === 'revanche' && validerTrade({ ...base, notes: '<b>x</b>' }, T + 9e8).trade.notes === 'bx/b');
  let n = T + 1e9; const J = creerJournal({ maintenant: () => n }); let notifs = 0; J.surChangement(() => notifs++);
  const a = J.ajouter(base); v('ajout au journal', a.ok && J.n() === 1 && notifs === 1 && a.trade.source === 'manuel');
  v('doublon refusé', !J.ajouter(base).ok && /déjà dans le journal/.test(J.ajouter(base).erreurs[0]));
  const m = J.modifier(a.id, { notes: 'sortie manuelle', etiquettes: ['range'], strategie: 'S1' }); v('modification horodatée dans l’historique du trade', m.ok && m.trade.historique.length === 1 && m.trade.historique[0].avant.notes === '' && m.trade.strategie === 'S1');
  v('modification invalide refusée sans toucher le trade', !J.modifier(a.id, { stop: 90000 }).ok && J.trouver(a.id).stop === 79000);
  const J2 = creerJournal({ maintenant: () => n }); const imp = J2.importer(J.exporter()); v('export / import JSON', imp.ok && imp.ajoutes === 1 && J2.n() === 1 && !J2.importer('x').ok && !J2.importer('{"format":"y"}').ok);
  const csv = exporterCSV(J.tout()); const rcsv = analyserCSV(csv); v('export CSV relisible avec en-têtes complets', rcsv.ok && rcsv.entetes.includes('pnl') && rcsv.n === 1 && rcsv.lignes[0][rcsv.entetes.indexOf('paire')] === 'BTC');
  const r2 = appliquerMappage(rcsv, proposerMappage(rcsv.entetes), {}); v('aller-retour : l’export CSV se réimporte (mêmes paire, sens, gain)', r2.trades.length === 1 && r2.trades[0].paire === 'BTC' && r2.trades[0].pnl === 56 && r2.trades[0].t === T, JSON.stringify(r2.rejetes));
  J.ajouter({ ...base, t: T + 5e6, tSortie: T + 6e6, paire: 'SOL', prixEntree: 100, prixSortie: 99, quantite: 1, stop: 98, objectif: 103 });
  v('filtres par paire, statut, étiquette', J.lister({ paire: 'SOL' }).length === 1 && J.lister({ statut: 'ferme' }).length === 2 && J.lister({ etiquette: 'range' }).length === 1 && J.lister()[0].paire === 'SOL');
  J.supprimer(a.id); v('suppression', J.n() === 1 && !J.supprimer('zzz').ok);
  v('liste des erreurs permises', ETIQUETTES_ERREUR.includes('revanche') && ETIQUETTES_ERREUR.includes('stop_reculé'));
}
// ── analyse après trade ──
{
  const T = Date.UTC(2026, 9, 20, 8);
  const beau = validerTrade({ paire: 'BTC', sens: 1, t: T, tSortie: T + 3600e3, prixEntree: 80000, prixSortie: 81200, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'Retour POC' }, T + 9e8).trade;
  const a = analyseTrade(beau); v('trade propre : exécution propre, rien à corriger', /exécution propre/.test(a.qualite) && a.mal.length === 0 && /gagnant/.test(a.issue) && /Un seul trade ne dit rien/.test(a.phrase));
  const vilain = validerTrade({ paire: 'BTC', sens: 1, t: T, tSortie: T + 3600e3, prixEntree: 80000, prixSortie: 78000, quantite: 0.05, erreurs: ['revanche'] }, T + 9e8).trade;
  const b = analyseTrade(vilain); v('trade sans stop, sans objectif, sans stratégie : exécution à améliorer, règles proposées', /à améliorer/.test(b.qualite) && b.mal.length >= 3 && b.regles.some(x => /stop/.test(x)) && /perdant/.test(b.issue));
  const depasse = validerTrade({ paire: 'BTC', sens: 1, t: T, tSortie: T + 3600e3, prixEntree: 80000, prixSortie: 77000, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'X' }, T + 9e8).trade; v('perte de 3 R pour 1 R prévu : « au-delà du stop »', analyseTrade(depasse).mal.some(x => /au-delà du stop/.test(x)));
}
// ── bilan de la semaine et discipline ──
{
  const lundi = Date.UTC(2026, 9, 19), mk = (i, h, pnl, o = {}) => validerTrade({ paire: 'BTC', sens: 1, t: lundi + h * 3600e3, tSortie: lundi + (h + 1) * 3600e3, prixEntree: 80000, prixSortie: 80000 + pnl / 0.05, quantite: 0.05, stop: 79000, objectif: 83000, strategie: 'S', frais: 0, ...o }, lundi + 9e9).trade;
  v('début de semaine = lundi 00 h UTC', debutSemaine(Date.UTC(2026, 9, 23, 14)) === lundi && debutSemaine(lundi) === lundi && debutSemaine(lundi + 6 * 86400e3 + 80000e3) === lundi);
  const sem = [mk(1, 8, 100), mk(2, 30, -50), mk(3, 55, 80, { erreurs: ['revanche'] }), mk(4, 80, -50, { stop: undefined, strategie: '' })];
  const b = bilanSemaine(sem, { date: lundi + 3 * 86400e3 });
  v('bilan : 4 trades, +80 $, 2 gagnants sur 4, fourchette de réussite', b.n === 4 && proche(b.total, 80, 1e-6) && b.gagnants === 2 && b.taux.bas < 0.5 && b.taux.haut > 0.5 && /fourchette/.test(b.phrase), b.phrase);
  v('bilan : discipline sur 100 et erreur la plus fréquente', b.discipline > 0 && b.discipline < 100 && b.erreurs[0][0] === 'revanche' && /Discipline/.test(b.phrase));
  v('bilan : règles pour la prochaine session (stop, setup, revanche)', b.regles.some(x => /stop/.test(x)) && b.regles.some(x => /setup/.test(x)) && b.regles.some(x => /30 minutes/.test(x)));
  v('bilan : avertissement et qualité d’échantillon', /pas un conseil financier/.test(b.phrase) && /très insuffisant|insuffisant/.test(b.phrase));
  v('semaine sans trade : phrase claire', bilanSemaine(sem, { date: lundi + 20 * 86400e3 }).n === 0);
  v('revue sans défaut : félicite sans inventer', revueDiscipline([mk(1, 8, 100)]).length === 1 && /Rien à corriger/.test(revueDiscipline([mk(1, 8, 100)])[0]));
  const six = [0, 1, 2, 3, 4].map(i => mk(i, 8 + i, 10)); v('plus de 3 trades dans la même journée : règle « pas plus de 3 par jour »', revueDiscipline(six, { tradesParJourMax: 3 }).some(x => /Pas plus de 3 trades par jour/.test(x)));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
