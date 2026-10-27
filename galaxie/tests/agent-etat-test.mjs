import * as E from '../../strategies/agent-etat.js';
import * as A from '../../strategies/alertes-v3.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const J = 86400e3, T0 = Date.UTC(2026, 9, 1), validation = { statut: 'validee_backtest' };
const cand = (f, p, params = { N: 96 }) => ({ famille: f, paire: p, params, validation });

const e = E.etatInitial(T0);
v('identité stable : nom, rôle, règles', e.identite.nom === 'Kepler' && /ordre/.test(e.identite.role) && e.identite.regles.length === 4);
v('aucune version au départ', e.versions.length === 0 && E.versionActive(e) === null);
let st = E.statutAgent(e, { pcVivant: true });
v('statut sans stratégie : « aucune stratégie validée »', st.code === 'aucune' && /Aucune stratégie validée pour l’instant\. Preuves insuffisantes\./.test(st.phrase));
let refus = false; try { E.creerVersion(e, { candidates: [{ famille: 'tendance_ma', paire: 'BTC', params: {}, validation: { statut: 'non_validee' } }], raison: 'x' }, T0); } catch (x) { refus = true; }
v('une stratégie NON validée ne peut pas entrer dans une version', refus);
let refus2 = false; try { E.creerVersion(e, { candidates: [], raison: 'x' }, T0); } catch (x) { refus2 = true; }
v('une version vide est refusée', refus2);
const v1 = E.creerVersion(e, { candidates: [cand('tendance_ma', 'BTC')], raison: 'première stratégie validée' }, T0);
v('v1 active, une seule version active', v1.numero === 1 && e.active === 1 && e.versions.filter(x => x.active).length === 1);
const id1 = E.idStrategie('tendance_ma', 'BTC', { N: 96 });
v('nouvelle stratégie : en SIMULATION, alertes marquées SIMULATION', e.strategies[id1].phase === 'simulation' && E.modeAlerte(e.strategies[id1]) === 'SIMULATION');
E.creerVersion(e, { candidates: [cand('tendance_ma', 'BTC'), cand('fin_range', 'SOL', { N: 192 })], raison: 'ajout de fin_range sur SOL' }, T0 + 3 * J);
v('v2 active, v1 plus active, une seule active', e.active === 2 && !e.versions[0].active && e.versions[1].active);
v('la stratégie déjà suivie garde sa date de début de simulation', e.strategies[id1].debutSimulation === T0);
v('statut : en surveillance avec 2 stratégies', E.statutAgent(e, {}).code === 'surveillance' && E.strategiesActives(e).length === 2);
v('statut : PC éteint → surveillance seule', E.statutAgent(e, { pcVivant: false }).code === 'pc_eteint' && /PC éteint/.test(E.statutAgent(e, { pcVivant: false }).texte));
v('statut : recherche en cours', E.statutAgent(e, { rechercheEnCours: true }).code === 'recherche');
v('statut : position proposée l’emporte', E.statutAgent(e, { positionOuverte: true, enPreparation: true }).code === 'position');
e.parametresRisque.pause = true; v('statut : en pause l’emporte sur tout', E.statutAgent(e, { positionOuverte: true }).code === 'pause'); e.parametresRisque.pause = false;
const pc = E.etatInitial(T0); v('PC éteint sans stratégie : veille de recherche', E.statutAgent(pc, { pcVivant: false }).code === 'veille_recherche');
// simulation : 4 semaines ET 30 trades
const s1 = e.strategies[id1];
v('simulation : 2 semaines, 40 trades → pas terminée (il faut 4 semaines ET 30 trades)', !E.simulationTerminee(s1, { n: 40 }, T0 + 14 * J).ok);
v('simulation : 5 semaines, 12 trades → pas terminée', !E.simulationTerminee(s1, { n: 12 }, T0 + 35 * J).ok);
v('simulation : 5 semaines, 31 trades → terminée', E.simulationTerminee(s1, { n: 31 }, T0 + 35 * J).ok);
let p = E.promouvoir(e, { [id1]: { n: 31, esperance: -0.1 } }, T0 + 35 * J);
v('promotion refusée si l’espérance simulée est négative', p.length === 0 && s1.phase === 'simulation');
p = E.promouvoir(e, { [id1]: { n: 31, esperance: 0.3 } }, T0 + 35 * J);
v('promotion : la stratégie devient ACTIVE (alertes d’entrée réelles)', p.length === 1 && s1.phase === 'active' && E.modeAlerte(s1) === 'REEL');
const r = E.exporterRegles(e); v('règles exportées pour le Worker : famille, paramètres, mode', r.length === 2 && r.every(x => x.famille && x.params && ['REEL', 'SIMULATION'].includes(x.mode) && x.version === 2) && r.find(x => x.id === id1).mode === 'REEL');
E.mettreEnPause(e, id1, 'dérive détectée'); v('pause : la stratégie n’est plus exportée', E.exporterRegles(e).every(x => x.id !== id1) && s1.phase === 'pause');
const rb = E.retourArriere(e, null, T0 + 40 * J); v('retour arrière : v1 de nouveau active', rb.ok && e.active === 1 && e.versions[0].active && !e.versions[1].active);
v('retour arrière : impossible vers une version inconnue', !E.retourArriere(e, 99).ok);
const c = E.chiffres(e, T0 + 40 * J); v('trois chiffres + version', c.version === 1 && c.validees >= 1 && typeof c.variantes === 'number');
v('journal : versions et promotion tracées', e.journal.filter(x => x.type === 'version').length === 3 && e.journal.some(x => x.type === 'promotion') && e.identite.jalons.length >= 3);
v('JSON sérialisable (copie D1)', JSON.parse(JSON.stringify(e)).active === 1);

// alertes
const s = e.strategies[id1], sSim = e.strategies[E.idStrategie('fin_range', 'SOL', { N: 192 })];
const ev = { sens: 1, entree: 67000.5, stop: 66500, cible: 69000, R: 4, distancePct: 0.75, t: T0 + 50 * J, signalT: T0 + 50 * J - 900e3, objectifs: [{ R: 1, prix: 67500 }, { R: 2, prix: 68000 }, { R: 4, prix: 69000 }], tailles: { risque: 100, quantite: 0.2, valeur: 13400 }, raison: ['Raison ligne 1.', 'Raison ligne 2.'] };
const aE = A.construireAlerte('ENTREE', { s: sSim, ev }, T0 + 50 * J), aR = A.construireAlerte('ENTREE', { s: Object.assign({}, s, { phase: 'active' }), ev, resume: { n: 33 } }, T0 + 50 * J);
v('entrée (simulation) : marquée SIMULATION, preuve, rappel « aucun ordre »', /SIMULATION/.test(aE.titre) && /simulation directe EN COURS/.test(aE.texte) && /Aucun ordre n’est exécuté automatiquement/.test(aE.texte));
v('entrée (réel) : pas de SIMULATION, preuve « confirmée en simulation directe (33 trades) »', !/SIMULATION/.test(aR.titre) && /confirmée en simulation directe \(33 trades/.test(aR.texte));
v('entrée : stop, objectifs en R, rapport risque/gain, taille pour 1 %, raison en deux lignes', /Stop : 66\s?500/.test(aE.texte) && /4,0 R = 69/.test(aE.texte) && /1 pour 4,0/.test(aE.texte) && /Taille pour risquer 1 %/.test(aE.texte) && /Raison ligne 2/.test(aE.texte), aE.texte);
const tous = [A.construireAlerte('PREPARATION', { s: sSim, ev: { sens: 1, niveau: 67000, t: T0 + 50 * J, texte: 'divergence en cours' } }, T0 + 50 * J), aE, A.construireAlerte('INVALIDATION', { s: sSim, ev: { motif: 'le stop est trop proche', signalT: 5 } }, T0), A.construireAlerte('CLOTURE', { s, ev: { trade: { R: 2.4, motif: 'cible', prixSortie: 69000, t: T0, tSortie: T0 + J, barres: 40 } }, resume: { n: 5, R: 3 } }, T0),
  A.construireAlerte('COMPTE_RISQUE', { extra: { texte: 'Perte du jour : 2,4 %', genre: 'jour' } }, T0), A.construireAlerte('DEGRADATION', { s, extra: { texte: 'CUSUM 4,6' } }, T0), A.construireAlerte('RAPPORT', { extra: { lignes: ['a', 'b'], semaine: '2026-S44' } }, T0), A.construireAlerte('AUCUNE_STRATEGIE', { extra: { variantes: 2973 } }, T0)];
v('huit types d’alerte construits, tous avec le rappel', tous.length === 8 && tous.every(a => /Aucun ordre n’est exécuté automatiquement/.test(a.texte) && a.cle && a.titre));
v('aucune stratégie : message exact + nombre de variantes', /Aucune stratégie validée pour l’instant\. Preuves insuffisantes\./.test(tous[7].texte) && /2\s?973 variantes/.test(tous[7].texte));
const e2 = E.etatInitial(T0);
const g = A.filtrerAlertes(e2, [tous[7], tous[1]], T0 + J); A.enregistrerAlertes(e2, g);
v('filtre : première alerte passe', g.length === 2);
v('filtre : jamais deux fois la même alerte (clé)', A.filtrerAlertes(e2, [tous[1]], T0 + J).length === 0);
v('« aucune stratégie » : une seule fois par semaine', A.filtrerAlertes(e2, [A.construireAlerte('AUCUNE_STRATEGIE', {}, T0 + 3 * J)], T0 + 3 * J).length === 0 && A.filtrerAlertes(e2, [A.construireAlerte('AUCUNE_STRATEGIE', {}, T0 + 9 * J)], T0 + 9 * J).length === 1);
const rafale = Array.from({ length: 6 }, (_, i) => A.construireAlerte('ENTREE', { s: sSim, ev: { ...ev, signalT: 1000 + i, t: T0 + 60 * J + i * 3600e3 } }, T0 + 60 * J + i * 3600e3));
v('filtre : pas plus de 3 entrées par jour (jamais des dizaines)', A.filtrerAlertes(E.etatInitial(T0), rafale, T0 + 60 * J + 6 * 3600e3).length === 3);
const e3 = E.etatInitial(T0); for (let i = 0; i < 9; i++) e3.alertes.push({ type: 'ENTREE', strategie: 'x', t: T0 + i * 3600e3, cle: 'k' + i });
v('moteur trop permissif détecté (9 entrées en 7 jours > 8)', A.tropPermissive(e3, 'x', T0 + 12 * 3600e3).trop && !A.tropPermissive(e3, 'autre', T0 + 12 * 3600e3).trop);
v('compte prop : alerte à 75 % de la limite (2,4 % de perte du jour sur 3 %)', A.controleCompte({ ddPct: 1, pertejourPct: 2.4 }).length === 1 && A.controleCompte({ ddPct: 5, pertejourPct: 0 }).length === 1 && A.controleCompte({ ddPct: 1, pertejourPct: 1 }).length === 0);
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
