import { esc, nb, sg, courbeSVG } from './poste-vues.js';
import { tableauM6c, NOMS_REGLES } from '../agent-m6c/performance-m6c.js';
import { empreinteM6c, texteM6c } from '../agent-m6c/criteres-m6c.js';

/* ═════════════ VUE « ASSISTANT PAR RÉGIME » DE L'ONGLET RÉGIME (M6c ; fonction pure qui rend du HTML, testée : m6c-performance-test.mjs) ═════════════
   Par paire : le régime actuel (zones colorées sur le graphique), les bornes d'un range, les quatre règles avec leur statut (SIGNAL ou INFORMATION) et leurs chiffres MESURÉS (BACKTEST, hors échantillon),
   la précision du détecteur, les fausses cassures évitées / subies, les trades évités par le filtre range et ce qu'ils auraient rapporté. Les critères sont affichés tels qu'écrits avant les tests. */
const NOM_PAIRE = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };
const bloc = (titre, corps, cls = '') => '<section class="pa-c ' + cls + '"><h4>' + titre + '</h4>' + corps + '</section>';
const ligne = (k, v, cls = '') => '<div class="pa-l"><span>' + k + '</span><b class="' + cls + '">' + v + '</b></div>';
const eti = (t, c = '') => '<span class="pa-eti ' + c + '">' + esc(t) + '</span>';
const R = x => (x == null ? '—' : sg(x, 2) + ' R'), P = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const COULEUR_REGIME = { 0: 'neutre', 1: 'ok', 2: 'ko', 3: 'warn' };

export function vueAssistantM6c({ analyses = {}, simulations = {}, paires = ['BTC', 'SOL', 'DOGE'], resultats } = {}) {
  const intro = '<section class="pa-c pa-large pa-situation"><p class="pa-phrase">Assistant de marché par régime : il dit si le marché est en tendance haussière, baissière, en range ou en transition, trace les zones et les bornes sur le graphique, et applique une règle par régime. '
    + 'Règle d’or : une règle qui n’a pas battu le hasard sur tous les critères reste en <b>INFORMATION</b> (aucun signal d’entrée). En range, la consigne est <b>NE PAS ENTRER</b>.</p>'
    + '<p class="pa-petit">Critères écrits avant les tests (empreinte ' + esc(empreinteM6c()) + ') : ' + texteM6c().map(esc).join(' · ') + '</p></section>';
  const cartes = paires.map(p => {
    const t = tableauM6c({ paire: p, resultats }), a = analyses[p];
    let live;
    if (!a) live = '<p class="pa-vide">Pas encore analysé.</p>';
    else if (!a.ok) live = '<p class="pa-alerte">' + esc(a.erreur) + '</p>';
    else {
      const r = a.regime;
      live = '<div class="pa-ent"><span class="pa-badge pa-' + COULEUR_REGIME[r.code] + '">' + esc(r.nom.toUpperCase()) + (r.volatil ? ' · AGITÉ' : '') + '</span> ' + eti('RÉEL', 'info') + '</div><p class="pa-phrase">' + esc(r.phrase) + '</p>'
        + (r.code === 3 ? ligne('Bornes du range', nb(r.bas) + ' – ' + nb(r.haut)) + ligne('Touches', r.touchesBas + ' en bas · ' + r.touchesHaut + ' en haut') + ligne('Âge / compression', Math.round(r.ageH) + ' h · ' + (r.compression ? 'oui' : 'non')) : '')
        + (a.alertes.length ? '<h5>Alertes du moment</h5><ul class="pa-liste">' + a.alertes.map(x => '<li><b>' + esc(x.type) + '</b> · ' + esc(x.texte) + '</li>').join('') + '</ul>' : '<p class="pa-petit">Aucune alerte en ce moment.</p>');
    }
    const bouton = '<button type="button" class="pa-btn" data-a="m6c-analyser" data-paire="' + p + '">Analyser maintenant</button>';
    if (!t.ok) return bloc(NOM_PAIRE[p] + ' · régime', live + bouton, 'pa-large');
    const regles = t.regles.map(r => '<div class="pa-l"><span>' + esc(r.nom) + '</span><b class="' + (r.statut === 'SIGNAL' ? 'ok' : 'warn') + '">' + (r.statut === 'SIGNAL' ? 'SIGNAL' : 'INFORMATION') + '</b></div>'
      + '<div class="pa-petit">' + esc(r.phrase) + '</div>' + (r.courbeR && r.courbeR.length > 3 ? '<div class="pa-courbe">' + courbeSVG(r.courbeR, { largeur: 200, hauteur: 40, couleur: r.Rtotal >= 0 ? '#41e0a0' : '#ff6b6b' }) + '</div>' : '')
      + '<div class="pa-x pa-petit">' + (r.nCriteresOk != null ? r.nCriteresOk + ' critères sur ' + r.nCriteres + ' passés' : '') + ' · gain du filtre de régime : ' + R(r.gainFiltre) + ' · croisement de moyennes mobiles : ' + R(r.croisement && r.croisement.esperance) + ' · long ' + (r.cotes ? r.cotes.long.n + ' trades ' + R(r.cotes.long.esperance) : '—') + ' / court ' + (r.cotes ? r.cotes.court.n + ' trades ' + R(r.cotes.court.esperance) : '—') + '</div>').join('');
    const det = t.detecteur.map(d => '<li>' + esc(d.phrase) + '</li>').join('');
    const reg = t.parRegime.map(x => '<li>' + esc(x.nom) + ' : ' + x.n + ' trades, ' + P(x.taux) + ' gagnants, ' + R(x.esperance) + ' par trade</li>').join('');
    const ev = t.evites ? Object.entries(t.evites).map(([id, e]) => '<li>' + esc(NOMS_REGLES[id] || id) + ' : ' + e.enRange + ' trades sur ' + e.tradesSansFiltre + ' tombaient en range, ils auraient ' + (e.RenRange >= 0 ? 'rapporté ' : 'coûté ') + R(Math.abs(e.RenRange)).replace('+', '') + ' (' + R(e.esperanceEnRange) + ' par trade)</li>').join('') : '';
    const sim = simulations[p];
    const perf = '<div class="pa-ent">' + eti('BACKTEST', 'warn') + ' ' + eti('hors échantillon, frais déduits', 'neutre') + ' ' + eti('pas de CONFIRMÉ EN RÉEL : aucune règle au statut SIGNAL', 'neutre') + '</div><p class="pa-phrase">' + esc(t.verdict) + '</p>'
      + regles + '<h5>Taux de réussite par régime</h5><ul class="pa-liste">' + (reg || '<li>—</li>') + '</ul>'
      + (t.cassures ? '<h5>Fausses cassures</h5><p class="pa-petit">Mode immédiat : ' + t.cassures.signauxImmediat + ' signaux, dont ' + t.cassures.subies + ' fausses cassures SUBIES. Mode retest : ' + t.cassures.signauxRetest + ' signaux, ' + t.cassures.evitees + ' fausses cassures ÉVITÉES.</p>' : '')
      + (t.grosMouvements ? '<h5>Gros mouvements</h5><p class="pa-petit">' + t.grosMouvements.n + ' mouvements dirigés de plus de 5 ATR H1 en 48 h ; ' + t.grosMouvements.captes + ' (' + P(t.grosMouvements.part) + ') ont eu au moins un trade gagnant dans le bon sens.</p>' : '')
      + '<h5>Trades évités grâce au filtre « pas d’entrée en range »</h5><ul class="pa-liste">' + ev + '</ul>'
      + '<h5>Précision du détecteur de régime</h5><ul class="pa-liste">' + det + '</ul><p class="pa-petit">Le détecteur décrit ce qui se passe maintenant ; mesuré sur l’historique, il ne prédit pas mieux que le hasard quand son « lift » est proche de 1.</p>'
      + (t.meilleure ? '<h5>Probabilités d’évaluation (BACKTEST · ESTIMÉ)</h5>' + (sim && sim.ok ? '<p class="pa-phrase">' + esc(sim.phrase) + '</p>' : '<button type="button" class="pa-btn" data-a="m6c-sim" data-paire="' + p + '" data-regle="' + t.meilleure.id + '">Calculer à 0,25 / 0,5 / 1 % de risque (' + esc(t.meilleure.nom) + ')</button>' + (sim && !sim.ok ? '<p class="pa-alerte">' + esc(sim.erreur) + '</p>' : '')) : '')
      + '<p class="pa-petit">Mesure du ' + esc(t.genereLe) + ' · zone de recherche de ' + t.zoneMois + ' mois (le jeu final n’a jamais été ouvert) · ' + nb(t.nVariantes) + ' variantes comptées pour la paire.</p>';
    return bloc(NOM_PAIRE[p] + ' · assistant par régime', live + bouton + '<hr>' + perf, 'pa-large');
  }).join('');
  return '<div class="pa-grille">' + intro + cartes + '</div>';
}
