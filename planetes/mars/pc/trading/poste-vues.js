import { CATALOGUE, STOPS, LIMITES } from '../agent-btc/regles-lab.js';
import { REGLES_INTERDITES, STYLES } from '../agent-btc/profil-agent.js';

/* ═════════════ VUES DU POSTE DE PILOTAGE « AGENT BTC » (M5 ; fonctions pures qui rendent du HTML, testées dans m5-vues-test.mjs sans navigateur) ═════════════
   Rien n'est calculé ici : tout vient de la vue de l'hôte (pilote-coeur.js:vue). Les éléments réservés au mode EXPERT portent la classe `pa-x` (cachés en mode simple par le CSS).
   Honnêteté : taille d'échantillon, intervalle de confiance et nombre de variantes testées sont toujours montrés ; entraînement, hors échantillon, jeu final et compte simulé ne sont JAMAIS mélangés. */
export const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nb = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const sg = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nb(Math.abs(v), d));
export const pc = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : nb(v * 100, d) + ' %');
export const dateFr = t => (t ? new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const heureFr = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const il = t => { if (!t) return '—'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l’instant' : m < 90 ? 'il y a ' + m + ' min' : m < 2880 ? 'il y a ' + Math.round(m / 60) + ' h' : 'il y a ' + Math.round(m / 1440) + ' j'; };
export const MENTION = 'Les résultats passés ne garantissent rien. Aucun ordre réel n’est envoyé, aucune clé de courtier n’existe.';
const LIBELLE_STATUT = { en_recherche: 'EN RECHERCHE', validee: 'VALIDÉE (backtest)', confirmee: 'CONFIRMÉE EN RÉEL', surveillance: 'EN SURVEILLANCE', suspendue: 'SUSPENDUE', rejetee: 'REJETÉE' };
const CLASSE_STATUT = { en_recherche: 'info', validee: 'ok', confirmee: 'ok2', surveillance: 'warn', suspendue: 'ko', rejetee: 'ko' };
export const badge = (statut, libelle) => '<span class="pa-badge pa-' + (CLASSE_STATUT[statut] || 'neutre') + '">' + esc(libelle || LIBELLE_STATUT[statut] || statut) + '</span>';

/* Petite courbe en SVG (R cumulés). */
export function courbeSVG(valeurs, { largeur = 220, hauteur = 54, couleur = '#4de3ff' } = {}) {
  const v = (valeurs || []).filter(Number.isFinite); if (v.length < 2) return '<svg class="pa-courbe" width="' + largeur + '" height="' + hauteur + '" viewBox="0 0 ' + largeur + ' ' + hauteur + '"><text x="4" y="' + (hauteur / 2) + '" fill="#6b8796" font-size="10">pas assez de trades</text></svg>';
  const min = Math.min(0, ...v), max = Math.max(0, ...v), h = max - min || 1, pas = v.length > 400 ? Math.ceil(v.length / 400) : 1, pts = [];
  for (let i = 0; i < v.length; i += pas) pts.push((i / (v.length - 1) * (largeur - 4) + 2).toFixed(1) + ',' + (hauteur - 3 - (v[i] - min) / h * (hauteur - 6)).toFixed(1));
  pts.push(((largeur - 2)).toFixed(1) + ',' + (hauteur - 3 - (v[v.length - 1] - min) / h * (hauteur - 6)).toFixed(1));
  const y0 = (hauteur - 3 - (0 - min) / h * (hauteur - 6)).toFixed(1);
  return '<svg class="pa-courbe" width="' + largeur + '" height="' + hauteur + '" viewBox="0 0 ' + largeur + ' ' + hauteur + '" role="img" aria-label="courbe de capital en R"><line x1="0" x2="' + largeur + '" y1="' + y0 + '" y2="' + y0 + '" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 3"/><polyline fill="none" stroke="' + couleur + '" stroke-width="1.6" points="' + pts.join(' ') + '"/></svg>';
}
export function barreAvancement(av) {
  if (!av) return '';
  const p1 = Math.round(Math.max(0, Math.min(1, av.partR)) * 100), p2 = Math.round(Math.max(0, Math.min(1, av.partTrades)) * 100);
  return '<div class="pa-avanc ' + (av.atteint ? 'atteint' : '') + '"><div class="pa-avanc-txt">' + esc(av.texte) + '</div><div class="pa-barre" title="Gain net vers l’objectif"><i style="width:' + p1 + '%"></i></div><div class="pa-barre pa-barre2" title="Nombre de trades vers l’objectif"><i style="width:' + p2 + '%"></i></div></div>';
}
const ligne = (k, v, cls = '') => '<div class="pa-l"><span>' + k + '</span><b class="' + cls + '">' + v + '</b></div>';
const bloc = (titre, corps, cls = '') => '<section class="pa-c ' + cls + '"><h4>' + titre + '</h4>' + corps + '</section>';

/* ── Phrase d'ouverture : où en est-on, en une ou deux phrases ── */
export function phraseSituation(v) {
  const d = v.donnees, r = v.recherche, actives = v.strategies.filter(s => s.active && ['validee', 'confirmee', 'surveillance'].includes(s.statut));
  if (!d || !d.n) return 'L’agent n’a pas encore d’historique. Active-le : il télécharge environ 9 ans de Bitcoin (quelques minutes, une seule fois).';
  if (!v.strategies.some(s => ['validee', 'confirmee', 'surveillance', 'suspendue'].includes(s.statut))) return 'Aucune stratégie n’est validée pour l’instant, donc l’agent ne propose aucune position. Il cherche sans s’arrêter : ' + nb(r.N) + ' variantes testées, objectif ' + r.cible + ' stratégie' + (r.cible > 1 ? 's' : '') + '. Chaque variante testée de plus rend la validation plus exigeante.';
  return actives.length + ' stratégie' + (actives.length > 1 ? 's' : '') + ' active' + (actives.length > 1 ? 's' : '') + ' sur ' + r.valideesComptees + ' validée' + (r.valideesComptees > 1 ? 's' : '') + ' (objectif ' + r.cible + '). ' + (r.objectifAtteint ? 'L’objectif est atteint : l’agent ralentit sa recherche.' : r.pause ? 'La recherche est en pause.' : 'La recherche continue : ' + nb(r.N) + ' variantes testées.');
}

/* ── 1. Vue d'ensemble ── */
export function vueEnsemble(v, lecture = null) {
  const d = v.donnees, r = v.recherche, setupsActifs = v.strategies.filter(s => s.active && ['validee', 'confirmee', 'surveillance'].includes(s.statut));
  const sit = '<section class="pa-c pa-large pa-situation"><p class="pa-phrase">' + esc(phraseSituation(v)) + '</p>' + (!d.n ? '<button type="button" class="pa-btn pa-fort" data-a="activer-donnees">Activer l’agent et télécharger l’historique</button>' : '') + '</section>';
  // marché
  let marche;
  if (!lecture || lecture.ok === false) marche = '<p class="pa-vide">' + (d.n ? esc((lecture && lecture.raison) || 'Lecture du marché indisponible.') : 'En attente de l’historique.') + '</p>';
  else marche = ligne('Phase H1', esc(lecture.phase.phase), lecture.phase.code === 1 ? 'hausse' : lecture.phase.code === 2 ? 'baisse' : '') + ligne('Phase H4', esc(lecture.phaseH4.phase), lecture.phaseH4.code === 1 ? 'hausse' : lecture.phaseH4.code === 2 ? 'baisse' : '') + ligne('Session', esc(lecture.session || '—'))
    + ligne('Prix', nb(d.prix, 0) + ' $') + '<div class="pa-x">' + ligne('Volume 4 h', nb(lecture.volume && lecture.volume.v4h, 0) + ' BTC') + ligne('Direction du volume', esc(lecture.direction && lecture.direction.lecture || '—')) + '</div>';
  // stratégies actives
  const act = setupsActifs.length ? '<ul class="pa-liste">' + setupsActifs.map(s => '<li><b>' + esc(s.nom) + '</b> ' + badge(s.statut) + '<br><small>' + esc(setupTexte(s.setup)) + '</small></li>').join('') + '</ul>' : '<p class="pa-vide">Aucune stratégie active. ' + (v.strategies.length ? 'Active une stratégie validée dans l’onglet Stratégies.' : 'L’agent en cherche.') + '</p>';
  // prochaine alerte attendue
  const preps = setupsActifs.filter(s => s.setup && ['preparation', 'entree'].includes(s.setup.statut));
  const prochaine = preps.length ? preps.map(s => '<p><b>' + esc(s.nom) + '</b> : ' + esc(s.setup.texte || setupTexte(s.setup)) + '</p>').join('') : '<p class="pa-vide">' + (setupsActifs.length ? 'Aucune alerte attendue tout de suite : les conditions des stratégies actives ne sont pas réunies. Au plus ' + v.profil.maxParSemaine + ' position(s) par semaine, une seule à la fois.' : 'Rien n’est attendu : aucune stratégie active.') + '</p>';
  // recherche
  const prog = v.progres, pcObj = Math.min(1, r.valideesComptees / Math.max(1, r.cible));
  const rech = ligne('État', v.rechercheEnCours ? '<span class="pa-pastille on"></span> en cours' + (prog && prog.chantier ? ' · ' + esc(prog.chantier) : '') : r.pause ? 'en pause' : r.objectifAtteint ? 'objectif atteint' : v.enAttenteJeuFinal ? 'candidate en attente du jeu final' : 'à l’arrêt')
    + ligne('Variantes testées', nb(r.N)) + ligne('Niveau de recherche', esc(r.niveauNom)) + ligne('Stratégies validées', r.valideesComptees + ' sur ' + r.cible) + '<div class="pa-barre"><i style="width:' + Math.round(pcObj * 100) + '%"></i></div>'
    + '<p class="pa-avert">' + esc(r.avertissement) + '</p><div class="pa-actions">' + (r.pause || !v.rechercheEnCours ? '<button type="button" class="pa-btn" data-a="recherche-reprise">Lancer / reprendre la recherche</button>' : '<button type="button" class="pa-btn" data-a="recherche-pause">Mettre en pause</button>') + '</div>';
  // alertes
  const al = v.alertes.length ? '<ul class="pa-liste">' + v.alertes.slice(0, 6).map(a => '<li class="' + (a.type === 'ENTREE' ? 'entree' : 'prep') + '"><b>' + (a.type === 'ENTREE' ? 'ENTRÉE' : 'PRÉPARATION') + '</b> · ' + esc(a.nomStrategie || '') + '<br><small>' + heureFr(a.t) + ' · ' + esc(a.texte) + '</small></li>').join('') + '</ul>' : '<p class="pa-vide">Aucune alerte pour l’instant.</p>';
  // santé
  const age = d.fin ? Date.now() - d.fin : null, fraiche = age != null && age < 40 * 60000;
  const sante = ligne('Données', d.n ? (fraiche ? '<span class="pa-ok">à jour</span>' : '<span class="pa-alerte">en retard (' + il(d.fin) + ')</span>') + ' · ' + nb(d.annees, 1) + ' ans' : '<span class="pa-alerte">absentes</span>')
    + ligne('Source', esc(d.source === 'binance' ? 'Binance BTC/USDT (delta réel)' : d.source === 'bitstamp' ? 'Bitstamp (delta estimé, SECOURS)' : d.source || '—')) + '<div class="pa-x">' + ligne('Trous dans l’historique', nb(d.nbLacunes)) + ligne('Stockage', esc(v.stockage)) + ligne('Hôte', v.hote === 'veilleur' ? 'Veilleur du PC (arrière-plan)' : 'cette page') + '</div>'
    + (v.erreur ? ligne('Dernier problème', '<span class="pa-alerte">' + esc(v.erreur) + '</span>') : '') + (v.notifications.some(n => n.telegramEchec) ? ligne('Telegram', '<span class="pa-alerte">envoi impossible pour l’instant</span>') : '');
  return '<div class="pa-grille">' + sit + bloc('Marché maintenant', marche) + bloc('Stratégies actives', act) + bloc('Prochaine alerte attendue', prochaine) + bloc('Recherche', rech) + bloc('Dernières alertes', al) + bloc('Santé de l’agent', sante) + '</div><p class="pa-avert pa-bas">' + MENTION + '</p>';
}
function setupTexte(s) {
  if (!s) return 'En attente du prochain bar.';
  if (s.statut === 'entree') return 'ENTRÉE : ' + (s.texte || '');
  if (s.statut === 'preparation') return 'Préparation : ' + (s.texte || '');
  return s.raison || 'Pas de setup.';
}

/* ── 2. Stratégies ── */
function cartesStats(c) {
  const o = c.horsEchantillon, j = c.jeuFinal, s = c.compteSimule;
  const bloc1 = o ? '<div class="pa-jeu"><h5>Hors échantillon <small>(walk-forward, après frais)</small></h5>' + ligne('Trades', nb(o.n)) + ligne('Taux de réussite', pc(o.tauxReussite)) + ligne('R moyen', sg(o.esperance) + ' R <small>[' + sg(o.ic && o.ic.bas) + ' ; ' + sg(o.ic && o.ic.haut) + ']</small>') + ligne('Facteur de profit', nb(o.factProfit, 2)) + ligne('Creux maximal', nb(o.ddR, 1) + ' R') + ligne('Gain net', sg(o.Rtotal, 1) + ' R', o.Rtotal >= 0 ? 'hausse' : 'baisse') + courbeSVG(o.courbeR) + '</div>' : '';
  const bloc2 = j ? '<div class="pa-jeu pa-x"><h5>Jeu final <small>(ouvert une seule fois)</small></h5>' + ligne('Trades', nb(j.n)) + ligne('R moyen', sg(j.esperance) + ' R') + ligne('Facteur de profit', nb(j.factProfit, 2)) + ligne('Gain net', sg(j.Rtotal, 1) + ' R') + courbeSVG(j.courbeR, { couleur: '#ffb000' }) + '</div>' : '';
  const bloc3 = '<div class="pa-jeu"><h5>Compte simulé en direct <small>(jamais mélangé avec le reste)</small></h5>' + (s.n ? ligne('Trades', nb(s.n)) + ligne('R moyen', sg(s.esperance) + ' R') + ligne('Gain net', sg(s.Rtotal, 1) + ' R') + courbeSVG(s.courbeR, { couleur: '#27d98a' }) : '<p class="pa-vide">Aucun trade simulé pour l’instant.</p>') + '<div class="pa-conf">' + esc(s.confirmation.texte) + '</div></div>';
  const bloc4 = c.entrainement ? '<div class="pa-jeu pa-x pa-grise"><h5>Entraînement <small>(zone de recherche)</small></h5>' + ligne('Trades', nb(c.entrainement.n)) + ligne('R moyen', sg(c.entrainement.esperance) + ' R') + '<p class="pa-avert">' + esc(c.entrainement.note) + '</p></div>' : '';
  return '<div class="pa-jeux">' + bloc1 + bloc2 + bloc3 + bloc4 + '</div>';
}
export function carteStrategie(c, ouverte = false) {
  const actifs = ['validee', 'confirmee', 'surveillance'].includes(c.statut);
  const boutons = [
    actifs ? (c.active ? '<button type="button" class="pa-btn" data-a="pause" data-id="' + esc(c.id) + '">Mettre en pause</button>' : '<button type="button" class="pa-btn pa-fort" data-a="activer" data-id="' + esc(c.id) + '">Activer</button>') : '',
    actifs ? '<button type="button" class="pa-btn pa-danger" data-a="suspendre" data-id="' + esc(c.id) + '">Suspendre</button>' : '',
    c.statut === 'suspendue' ? '<button type="button" class="pa-btn" data-a="reactiver" data-id="' + esc(c.id) + '">Réactiver</button>' : '',
    '<button type="button" class="pa-btn" data-a="dupliquer" data-id="' + esc(c.id) + '">Dupliquer</button>',
    '<button type="button" class="pa-btn pa-danger" data-a="supprimer" data-id="' + esc(c.id) + '">Supprimer</button>',
    '<button type="button" class="pa-btn" data-a="voir-graphique" data-id="' + esc(c.id) + '">Voir sur le graphique</button>'
  ].join('');
  const av = c.horsEchantillon ? barreAvancement(c.horsEchantillon.avancement) : '<p class="pa-vide">En attente de test : l’idée sera testée avec exactement les mêmes critères que les autres.</p>';
  const detail = c.horsEchantillon ? '<details class="pa-x"' + (ouverte ? ' open' : '') + ' data-id="' + esc(c.id) + '"><summary>Règles, preuves et historique</summary><div class="pa-detail"><p><b>Règles :</b> ' + esc(c.regles) + '</p>' + (c.horsEchantillon.phraseDsr ? '<p>' + esc(c.horsEchantillon.phraseDsr) + '</p>' : '') + '<p>Avant elle, <b>' + nb(c.nVariantesAvant) + '</b> variantes avaient été testées (liste détaillée dans l’onglet Laboratoire).</p><p class="pa-hist"><b>Historique :</b> ' + c.historique.map(h => dateFr(h.t) + ' → ' + esc(h.vers) + (h.raison ? ' (' + esc(h.raison) + ')' : '')).join(' · ') + '</p>' + (c.notes ? '<p class="pa-alerte">' + esc(c.notes) + '</p>' : '') + '</div></details>' : '';
  return '<article class="pa-carte s-' + esc(c.statut) + '" data-id="' + esc(c.id) + '"><header><h3>' + esc(c.nom) + ' <small class="pa-idc pa-x">' + esc(c.id) + '</small></h3>' + badge(c.statut) + (c.statut !== 'en_recherche' && c.statut !== 'rejetee' ? '<span class="pa-act ' + (c.active ? 'on' : '') + '">' + (c.active ? '● active' : '○ en pause') + '</span>' : '') + (c.redondante ? '<span class="pa-badge pa-warn" title="Corrélée à une stratégie déjà validée">REDONDANTE</span>' : '') + (c.classeObjectif && c.classeObjectif.code !== 'inconnue' ? '<span class="pa-badge pa-' + (c.classeObjectif.code === 'principale' ? 'info' : 'neutre') + '" title="' + esc(c.classeObjectif.nom) + '">' + (c.classeObjectif.code === 'principale' ? 'PRINCIPALE ' : c.classeObjectif.code === 'parallele' ? 'PARALLÈLE ' : 'INTERMÉDIAIRE ') + esc(String(c.objectifR)) + ' R</span>' : '') + '</header>'
    + '<p class="pa-idee">' + esc(c.idee) + '</p>' + (c.statut === 'validee' ? '<p class="pa-conf">En confirmation réelle en cours : ce n’est pas encore une preuve.</p>' : '') + (c.derniereRaison && ['surveillance', 'suspendue'].includes(c.statut) ? '<p class="pa-alerte">' + esc(c.derniereRaison) + '</p>' : '') + av + cartesStats(c) + '<div class="pa-actions">' + boutons + '</div>' + detail + '</article>';
}
export function vueStrategies(v) {
  const cartes = v.strategies;
  const rej = v.rejetees.length ? '<details class="pa-x"><summary>' + v.rejetees.length + ' candidate(s) rejetée(s) au jeu final</summary><ul class="pa-liste">' + v.rejetees.map(r => '<li><b>' + esc(r.nom) + '</b><br><small>' + esc(r.raison) + '</small></li>').join('') + '</ul></details>' : '';
  return '<div class="pa-entete"><p class="pa-phrase">' + esc(phraseSituation(v)) + '</p></div>' + (cartes.length ? '<div class="pa-cartes">' + cartes.map(c => carteStrategie(c)).join('') + '</div>' : '<p class="pa-vide pa-grand">Aucune stratégie dans la bibliothèque. L’agent en cherche en continu ; tu peux aussi proposer une idée dans l’onglet Laboratoire.</p>') + rej + '<p class="pa-avert pa-bas">' + MENTION + ' Résultats d’entraînement, hors échantillon, jeu final et compte simulé sont toujours séparés.</p>';
}

/* ── 3. Portefeuille ── */
export function vuePortefeuille(pf) {
  const n = pf.strategies.length;
  if (!n) return '<p class="pa-vide pa-grand">Pas encore de stratégie validée : le portefeuille se remplira avec elles.</p>' + biblio();
  const c = pf.correlations, couleur = x => (x == null ? '#222' : 'rgba(' + (x > 0 ? '255,77,94' : '77,227,255') + ',' + Math.min(0.85, Math.abs(x)).toFixed(2) + ')');
  const matrice = n > 1 ? '<table class="pa-matrice"><tr><th></th>' + c.noms.map(x => '<th title="' + esc(x) + '">' + esc(x.slice(0, 14)) + '</th>').join('') + '</tr>' + c.matrice.map((l, i) => '<tr><th>' + esc(c.noms[i].slice(0, 14)) + '</th>' + l.map(x => '<td style="background:' + couleur(x) + '">' + (x == null ? '—' : nb(x, 2)) + '</td>').join('') + '</tr>').join('') + '</table>' : '<p class="pa-vide">Une seule stratégie : pas de corrélation à mesurer.</p>';
  const cb = pf.combine;
  return '<div class="pa-grille">' + bloc('Corrélation entre stratégies', matrice + pf.phrases.map(p => '<p>' + esc(p) + '</p>').join('') + '<p class="pa-avert">Mesurée sur les R journaliers hors échantillon et du jeu final (jamais l’entraînement).</p>')
    + bloc('Courbe de capital combinée <small>(en R)</small>', courbeSVG(cb.courbeR, { largeur: 420, hauteur: 110 }) + ligne('Trades retenus', nb(cb.n)) + ligne('Gain net', sg(cb.Rtotal, 1) + ' R', cb.Rtotal >= 0 ? 'hausse' : 'baisse') + ligne('R moyen', sg(cb.esperance) + ' R') + ligne('Creux maximal', nb(cb.ddR, 1) + ' R') + ligne('Trades écartés (chevauchement)', nb(cb.ecartes)))
    + bloc('Chevauchements', '<p>' + (cb.ecartes ? nb(cb.ecartes) + ' trade(s) n’auraient pas été pris parce qu’une autre position était déjà ouverte (règle : ' + 'une seule position à la fois par défaut).' : 'Aucun chevauchement : les stratégies ne se gênent pas.') + '</p>' + '<ul class="pa-liste">' + cb.parStrategie.map(s => '<li><b>' + esc(s.nom) + '</b> : ' + s.acceptes + ' retenus, ' + s.ecartes + ' écartés</li>').join('') + '</ul>') + biblio() + '</div>';
}
const biblio = () => '<section class="pa-c pa-large pa-biblio"><h4>Bibliothèque de stratégies</h4><p>Persistante dans cet appareil. Tu peux la sauvegarder dans un fichier ou la recharger. Un fichier modifié à la main ne peut pas « valider » une stratégie : la preuve est vérifiée à l’import.</p><div class="pa-actions"><button type="button" class="pa-btn" data-a="exporter">Exporter en fichier</button><label class="pa-btn">Importer un fichier<input type="file" accept=".json,application/json" data-a="importer" hidden></label></div></section>';

/* ── 5. Trades (tableau filtrable) ── */
export const SOURCES_LIBELLE = { oos: 'hors échantillon', final: 'jeu final', live: 'compte simulé' };
export function filtrerTrades(trades, f = {}) {
  return trades.filter(x => (!f.strategie || x.strategie === f.strategie) && (!f.resultat || (f.resultat === 'gagnant' ? x.R > 0 : x.R <= 0)) && (!f.phase || x.phase === f.phase) && (!f.session || x.session === f.session) && (!f.source || x.source === f.source)
    && (!f.de || x.t >= f.de) && (!f.a || x.t <= f.a));
}
export function tradesCSV(trades) {
  const cols = ['strategie', 'source', 'entree', 'sortie', 'sens', 'prix_entree', 'stop', 'cible', 'prix_sortie', 'motif', 'R', 'duree_heures', 'phase', 'session', 'volatilite', 'jour'];
  const l = trades.map(x => [x.nomStrategie, SOURCES_LIBELLE[x.source] || x.source, new Date(x.t).toISOString(), x.tSortie ? new Date(x.tSortie).toISOString() : '', x.sens > 0 ? 'achat' : 'vente', x.prixEntree, x.stop, x.cible, x.prixSortie, x.motif, (x.R || 0).toFixed(3), x.barres != null ? (x.barres / 4).toFixed(2) : '', x.phase || '', x.session || '', x.vol || '', x.jour || ''].map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';'));
  return '﻿' + cols.join(';') + '\n' + l.join('\n');
}
export function vueTrades(v, trades, f = {}) {
  const liste = filtrerTrades(trades, f).sort((a, b) => b.t - a.t), vus = liste.slice(0, 400);
  const opt = (valeurs, cle) => '<option value="">tous</option>' + valeurs.map(x => '<option value="' + esc(x) + '"' + (f[cle] === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
  const phases = [...new Set(trades.map(x => x.phase).filter(Boolean))], sessions = [...new Set(trades.map(x => x.session).filter(Boolean))];
  const filtres = '<div class="pa-filtres"><label>Stratégie <select data-f="strategie"><option value="">toutes</option>' + v.strategies.map(s => '<option value="' + esc(s.id) + '"' + (f.strategie === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>').join('') + '</select></label>'
    + '<label>Résultat <select data-f="resultat"><option value="">tous</option><option value="gagnant"' + (f.resultat === 'gagnant' ? ' selected' : '') + '>gagnants</option><option value="perdant"' + (f.resultat === 'perdant' ? ' selected' : '') + '>perdants</option></select></label>'
    + '<label>Phase <select data-f="phase">' + opt(phases, 'phase') + '</select></label><label>Session <select data-f="session">' + opt(sessions, 'session') + '</select></label>'
    + '<label>Origine <select data-f="source"><option value="">toutes</option>' + Object.entries(SOURCES_LIBELLE).map(([k, l]) => '<option value="' + k + '"' + (f.source === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>'
    + '<label>Du <input type="date" data-f="de" value="' + (f.de ? new Date(f.de).toISOString().slice(0, 10) : '') + '"></label><label>Au <input type="date" data-f="a" value="' + (f.a ? new Date(f.a).toISOString().slice(0, 10) : '') + '"></label>'
    + '<button type="button" class="pa-btn" data-a="exporter-trades">Exporter (CSV)</button></div>';
  const som = liste.reduce((s, x) => s + x.R, 0), gagn = liste.filter(x => x.R > 0).length;
  const resume = '<p class="pa-phrase">' + nb(liste.length) + ' trade(s) · ' + (liste.length ? pc(gagn / liste.length) + ' gagnants · ' : '') + sg(som, 1) + ' R au total. <small>Les trades d’origines différentes sont additionnés ici pour la lecture, mais restent étiquetés.</small></p>';
  const table = '<table class="pa-table"><thead><tr><th>Stratégie</th><th>Origine</th><th>Entrée</th><th>Sens</th><th>R</th><th>Durée</th><th class="pa-x">Phase</th><th class="pa-x">Session</th><th>Sortie</th></tr></thead><tbody>'
    + vus.map(x => '<tr data-t="' + x.t + '" data-id="' + esc(x.strategie) + '" data-source="' + x.source + '" class="' + (x.R > 0 ? 'gagne' : 'perd') + '"><td>' + esc(x.nomStrategie) + '</td><td>' + SOURCES_LIBELLE[x.source] + '</td><td>' + heureFr(x.t) + '</td><td>' + (x.sens > 0 ? 'achat' : 'vente') + '</td><td><b>' + sg(x.R) + '</b></td><td>' + (x.barres != null ? nb(x.barres / 4, 1) + ' h' : '—') + '</td><td class="pa-x">' + esc(x.phase || '—') + '</td><td class="pa-x">' + esc(x.session || '—') + '</td><td>' + esc(x.motif || '—') + '</td></tr>').join('') + '</tbody></table>' + (liste.length > vus.length ? '<p class="pa-avert">' + (liste.length - vus.length) + ' trade(s) plus anciens non affichés (l’export les contient).</p>' : '');
  return filtres + resume + (liste.length ? table : '<p class="pa-vide pa-grand">Aucun trade ne correspond.</p>') + '<div id="pa-trade-detail" class="pa-detail-trade"></div>';
}

/* ── 6. Diagnostic ── */
export function vueDiagnostic(v, diag, choix = {}) {
  const sel = '<div class="pa-filtres"><label>Stratégie <select data-d="strategie">' + v.strategies.filter(s => s.horsEchantillon).map(s => '<option value="' + esc(s.id) + '"' + (choix.strategie === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>').join('') + '</select></label><label>Trades <select data-d="source"><option value="oos"' + (choix.source !== 'final' && choix.source !== 'tout' ? ' selected' : '') + '>hors échantillon</option><option value="final"' + (choix.source === 'final' ? ' selected' : '') + '>jeu final</option><option value="tout"' + (choix.source === 'tout' ? ' selected' : '') + '>les deux</option></select></label></div>';
  if (!diag) return sel + '<p class="pa-vide pa-grand">Le diagnostic « quand ça marche / quand ça ne marche pas » s’affiche dès qu’une stratégie validée existe.</p>';
  const dims = diag.dimensions.map(d => '<section class="pa-c"><h4>' + esc(d.nom) + '</h4><table class="pa-table pa-petit"><thead><tr><th></th><th>Trades</th><th>R moyen</th><th>Gagnants</th><th class="pa-x">IC 95 %</th></tr></thead><tbody>' + d.groupes.map(g => '<tr class="' + (g.fiable ? (g.ic && g.ic.bas > 0 ? 'gagne' : g.ic && g.ic.haut < 0 ? 'perd' : '') : 'faible') + '"><td>' + esc(g.valeur) + '</td><td>' + g.n + '</td><td>' + sg(g.esperance) + '</td><td>' + pc(g.taux) + '</td><td class="pa-x">' + (g.ic ? sg(g.ic.bas) + ' ; ' + sg(g.ic.haut) : '—') + '</td></tr>').join('') + '</tbody></table><ul class="pa-phrases">' + d.groupes.filter(g => g.fiable).slice(0, 4).map(g => '<li>' + esc(g.phrase) + '</li>').join('') + '</ul></section>').join('');
  return sel + '<section class="pa-c pa-large pa-situation"><h4>En résumé</h4>' + diag.resume.map(p => '<p class="pa-phrase">' + esc(p) + '</p>').join('') + '<p class="pa-avert">' + esc(diag.avertissement) + '</p></section><div class="pa-grille">' + dims + '</div>';
}

/* ── 7. Laboratoire ── */
export function champsCondition(type, valeurs = {}) {
  const cat = CATALOGUE[type]; if (!cat) return '';
  return Object.entries(cat.champs).map(([champ, dom]) => {
    const val = valeurs[champ];
    if (champ === 'valeurs') return '<label>' + (type === 'session' ? 'Sessions' : type === 'jours' ? 'Jours' : 'Phases') + ' <select multiple size="' + Math.min(6, dom.length) + '" data-champ="valeurs">' + dom.map(x => '<option value="' + esc(x) + '"' + ((val || []).includes(x) ? ' selected' : '') + '>' + esc(libelleValeur(type, x)) + '</option>').join('') + '</select></label>';
    if (Array.isArray(dom) && typeof dom[0] === 'string') return '<label>' + esc(champ) + ' <select data-champ="' + champ + '">' + dom.map(x => '<option value="' + esc(x) + '"' + (val === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></label>';
    return '<label>' + esc(champ) + ' <input type="number" step="any" min="' + dom[0] + '" max="' + dom[1] + '" data-champ="' + champ + '" value="' + (val != null ? val : dom[0]) + '"></label>';
  }).join('');
}
const libelleValeur = (type, x) => (type === 'session' ? ({ 0: 'Asie', 1: 'Londres', 2: 'New York', 3: 'fin de journée' }[x]) : type === 'jours' ? ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][x] : x);
export function vueLaboratoire(v, labo = {}) {
  const types = Object.entries(CATALOGUE).map(([k, c]) => '<option value="' + k + '">' + esc(c.nom) + '</option>').join('');
  const conds = (labo.conditions || []).map((c, i) => '<div class="pa-cond" data-i="' + i + '"><b>' + esc(CATALOGUE[c.type].nom) + '</b><div class="pa-champs" data-type="' + c.type + '">' + champsCondition(c.type, c) + '</div><button type="button" class="pa-btn pa-danger" data-a="cond-retirer" data-i="' + i + '">Retirer</button></div>').join('');
  const stop = labo.stop || { type: 'atr', tf: 'h1', k: 1.5 };
  const a = bloc('Constructeur de règles <small>(sans IA)</small>', '<p class="pa-vide">Assemble des conditions ; l’agent les teste avec exactement les mêmes critères que ses propres idées. Une règle qui ne les passe pas est rejetée, comme les autres.</p>'
    + '<div class="pa-filtres"><label>Côté <select data-l="cote">' + ['long', 'short', 'les-deux'].map(x => '<option' + ((labo.cote || 'les-deux') === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><label>Nom <input type="text" data-l="nom" maxlength="80" value="' + esc(labo.nom || '') + '" placeholder="ma règle"></label></div>'
    + '<div class="pa-conds">' + (conds || '<p class="pa-vide">Aucune condition pour l’instant.</p>') + '</div>'
    + '<div class="pa-filtres"><label>Ajouter une condition <select data-l="type-nouveau">' + types + '</select></label><button type="button" class="pa-btn" data-a="cond-ajouter">Ajouter</button></div>'
    + '<div class="pa-filtres"><label>Stop <select data-l="stop-type"><option value="atr"' + (stop.type === 'atr' ? ' selected' : '') + '>en ATR</option><option value="structure"' + (stop.type === 'structure' ? ' selected' : '') + '>sur la structure</option></select></label>'
    + '<span data-l="stop-champs">' + (stop.type === 'atr' ? '<label>Unité <select data-s="tf"><option' + (stop.tf === 'h1' ? ' selected' : '') + '>h1</option><option' + (stop.tf === 'h4' ? ' selected' : '') + '>h4</option></select></label><label>k <input type="number" step="0.1" min="' + STOPS.atr.k[0] + '" max="' + STOPS.atr.k[1] + '" data-s="k" value="' + (stop.k != null ? stop.k : 1.5) + '"></label>' : '<label>Bougies <input type="number" min="' + STOPS.structure.L[0] + '" max="' + STOPS.structure.L[1] + '" data-s="L" value="' + (stop.L || 24) + '"></label><label>Marge (ATR) <input type="number" step="0.1" min="0.1" max="1" data-s="pad" value="' + (stop.pad || 0.3) + '"></label>') + '</span>'
    + '<label>Objectif R <input type="number" step="0.5" min="' + LIMITES.R[0] + '" max="' + LIMITES.R[1] + '" data-l="R" value="' + (labo.R || 2) + '"></label></div>'
    + '<div class="pa-actions"><button type="button" class="pa-btn" data-a="regle-verifier">Vérifier la règle</button><button type="button" class="pa-btn pa-fort" data-a="regle-proposer">Proposer à l’agent (en attente de ta validation)</button></div><div class="pa-retour" data-r="constructeur">' + (labo.retour || '') + '</div>');
  const b = bloc('Idée libre <small>(le Worker traduit, tu valides)</small>', '<p class="pa-vide">Écris ton idée en français. Le Worker la traduit <b>une seule fois</b> (peu de jetons) en règle structurée que tu VOIS ci-dessous. <b>Rien n’est testé sans ton accord.</b></p><textarea data-l="idee-libre" rows="3" maxlength="600" placeholder="Exemple : acheter quand le RSI en H1 est très bas, pendant une tendance haussière en H4, sauf le week-end">' + esc(labo.texteLibre || '') + '</textarea><div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="idee-traduire">Traduire en règle</button></div><div class="pa-retour" data-r="idee">' + (labo.retourIdee || '') + '</div>');
  const idees = v.recherche.idees.length ? '<ul class="pa-liste">' + v.recherche.idees.map(i => '<li><b>' + esc(i.nom) + '</b> · ' + esc({ a_valider: 'EN ATTENTE DE TA VALIDATION', en_file: 'validée, en file de test', testee: 'testée : ' + (i.resultat || ''), refusee: 'refusée' }[i.statut] || i.statut) + '<br><small>' + esc(i.description) + '</small>' + (i.statut === 'a_valider' ? '<div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="idee-valider" data-id="' + esc(i.id) + '">Valider cette règle</button><button type="button" class="pa-btn" data-a="idee-refuser" data-id="' + esc(i.id) + '">Refuser</button></div>' : '') + '</li>').join('') + '</ul>' : '<p class="pa-vide">Aucune idée en attente.</p>';
  const c = bloc('Idées et règles proposées', idees);
  const presque = v.recherche.presque.length ? '<ul class="pa-liste">' + v.recherche.presque.map(p => '<li><b>' + esc(p.nom) + '</b><br><small>' + esc(p.avancement ? p.avancement.texte : '') + ' · échoue sur : ' + esc((p.echecs || []).slice(0, 3).join(' ; ')) + '</small></li>').join('') + '</ul>' : '<p class="pa-vide">Aucune piste proche pour l’instant : aucune idée n’a de résultat positif hors échantillon avec assez de trades.</p>';
  const d = bloc('Pistes de l’agent <small>(les moins mauvaises)</small>', presque + '<p class="pa-avert">Ces pistes sont étudiées en priorité, mais elles ne deviennent jamais des stratégies sans passer tous les critères.</p>');
  const journal = v.journal.length ? '<table class="pa-table pa-petit"><thead><tr><th>Quand</th><th>Hypothèse</th><th>Résultat</th><th>Décision</th><th class="pa-x">Variantes avant</th></tr></thead><tbody>' + v.journal.slice().reverse().slice(0, 80).map(j => '<tr><td>' + heureFr(j.t) + '</td><td>' + esc(j.hypothese || j.nom) + '</td><td>' + esc(j.raison) + '</td><td><b class="dec-' + esc(decisionClasse(j)) + '">' + esc(decisionLibelle(j)) + '</b></td><td class="pa-x">' + nb(j.N) + '</td></tr>').join('') + '</tbody></table>' : '<p class="pa-vide">Le journal se remplit dès que l’agent teste une idée.</p>';
  const e = bloc('Journal des expériences', journal + '<p class="pa-avert">Les idées écartées dès le dépistage (la plupart) ne sont pas listées une à une en niveau aléatoire : elles sont comptées ci-dessous.</p>', 'pa-large');
  const compteurs = Object.entries(v.recherche.compteurs).map(([n, c]) => '<tr><td>' + esc(['Familles d’origine', 'Familles avec filtres', 'Microstructure', 'Gabarits multi-unités', 'Gabarits avec filtres', 'Règles aléatoires'][n] || n) + '</td><td>' + nb(c.chantiers) + '</td><td>' + nb(c.variantes) + '</td><td>' + nb(c.depistes) + '</td><td>' + nb(c.finalistes) + '</td></tr>').join('');
  const f = bloc('Variantes testées <small>et avertissement des comparaisons multiples</small>', '<p class="pa-phrase">' + nb(v.recherche.N) + ' variantes testées depuis le début' + (v.recherche.Navant ? ', dont ' + nb(v.recherche.Navant) + ' essayées AVANT l’ouverture de l’application (étapes M3 et M4, et essais à blanc du développement de M5 sur les vraies données) : elles sont comptées pour ne pas tricher.' : '.') + '</p><p class="pa-avert">' + esc(v.recherche.avertissement) + ' <b>En clair : ce nombre n’est pas une note de qualité.</b> Plus il est grand, plus le seuil de validation est dur à franchir. Quand on teste beaucoup d’idées, la meilleure paraît toujours bonne par chance : le seuil du hasard (Sharpe déflaté) monte avec ce nombre, et chaque stratégie validée garde la liste de tout ce qui a été testé avant elle.</p>' + (compteurs ? '<table class="pa-table pa-petit"><thead><tr><th>Niveau</th><th>Idées</th><th>Variantes</th><th>Écartées au dépistage</th><th>Finalistes</th></tr></thead><tbody>' + compteurs + '</tbody></table>' : ''), 'pa-large');
  return '<div class="pa-grille">' + a + b + c + d + e + f + '</div>';
}
export const decisionLibelle = j => (/VALIDÉE/.test(j.decision) ? 'garder' : /candidate/.test(j.decision) ? 'garder (à tester au jeu final)' : /REJETÉE/.test(j.decision) ? 'supprimer' : j.oos && j.oos.esperance > 0 && j.oos.n >= 60 ? 'ajuster' : j.decision === 'rejeté' ? 'supprimer' : /écarté/.test(j.decision) ? 'supprimer' : j.decision || '—');
const decisionClasse = j => ({ garder: 'garder', ajuster: 'ajuster', supprimer: 'supprimer' }[decisionLibelle(j).split(' ')[0]] || 'autre');

/* ── 8. Réglages et consignes ── */
export function vueReglages(v, etat = {}) {
  const p = v.profil, c = v.criteres, o = c.horsEchantillon, ck = (nom, val) => ' name="' + nom + '"' + (val ? ' checked' : '');
  const profil = bloc('Profil de l’agent <small>(contraintes qu’il respecte)</small>', '<form data-form="profil" class="pa-form">'
    + '<label>Style <select name="style">' + Object.keys(STYLES).map(s => '<option value="' + s + '"' + (p.style === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>'
    + '<fieldset><legend>Unités de temps</legend>' + ['m15', 'h1', 'h4'].map(u => '<label><input type="checkbox" name="unite-' + u + '"' + (p.unites.includes(u) ? ' checked' : '') + '> ' + u.toUpperCase() + '</label>').join('') + '</fieldset>'
    + '<label>Risque par trade (% du capital) <input type="number" name="risquePct" step="0.1" min="0.1" max="2" value="' + p.risquePct + '"></label>'
    + '<label>Positions par semaine, au plus (1 à 5) <input type="number" name="maxParSemaine" min="1" max="5" value="' + p.maxParSemaine + '"></label>'
    + '<label>Positions à la fois, au plus <input type="number" name="maxSimultanees" min="1" max="3" value="' + p.maxSimultanees + '"></label>'
    + '<label>Repos après une sortie (heures) <input type="number" name="reposHeures" min="0" max="48" value="' + p.reposHeures + '"></label>'
    + '<label>Capital simulé ($) <input type="number" name="capital" min="100" value="' + p.capital + '"></label>'
    + '<fieldset><legend>Règles interdites</legend>' + Object.entries(REGLES_INTERDITES).map(([k, t]) => '<label><input type="checkbox" name="interdit-' + k + '"' + (p.reglesInterdites.includes(k) ? ' checked' : '') + '> ' + esc(t) + '</label>').join('') + '</fieldset>'
    + '<label>Nombre de stratégies visé (1 à 5) <input type="number" name="cible" min="1" max="5" value="' + p.cible + '"></label>'
    + '<label>Trades simulés pour être « CONFIRMÉE EN RÉEL » : <b>' + p.confirmationTrades + '</b> <small>(changement : dans les seuils ci-dessous)</small></label>'
    + '<fieldset class="pa-x"><legend>Budget de calcul</legend><label>Charge <select name="charge">' + ['douce', 'normale', 'max'].map(x => '<option' + (p.budget.charge === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label><label>Idées par tranche <input type="number" name="chantiersParTranche" min="5" max="2000" value="' + p.budget.chantiersParTranche + '"></label><label>Durée d’une tranche (s) <input type="number" name="tempsTranche" min="5" max="600" value="' + Math.round(p.budget.tempsMsParTranche / 1000) + '"></label></fieldset>'
    + '<fieldset><legend>Recherche en arrière-plan (Veilleur du PC)</legend><label><input type="checkbox"' + ck('arrierePlan', p.arrierePlan.actif) + '> Activer</label><label>De <input type="time" name="heureDebut" value="' + p.arrierePlan.heureDebut + '"></label><label>à <input type="time" name="heureFin" value="' + p.arrierePlan.heureFin + '"></label><label><input type="checkbox"' + ck('pauseDansJeu', p.arrierePlan.pauseDansJeu) + '> Pause pendant que je joue</label><label>Programmes de jeu (séparés par des virgules) <input type="text" name="processusJeu" value="' + esc(p.arrierePlan.processusJeu.join(', ')) + '" placeholder="valorant.exe, cs2.exe"></label></fieldset>'
    + '<fieldset><legend>Notifications</legend><label><input type="checkbox"' + ck('notifTelegram', p.notifications.telegram) + '> Telegram</label><label><input type="checkbox"' + ck('notifApp', p.notifications.application) + '> Dans Rayle</label><label><input type="checkbox"' + ck('notifHebdo', p.notifications.hebdo) + '> Résumé hebdomadaire</label></fieldset>'
    + '<div class="pa-actions"><button type="submit" class="pa-btn pa-fort">Enregistrer le profil</button></div></form><div class="pa-retour" data-r="profil"></div>');
  const consignes = bloc('Consignes en français', '<p class="pa-vide">Écris ce que l’agent doit respecter. Exemples : « Pas de trading le week-end. Maximum 2 positions par semaine. Risque 0,5 %. Uniquement H1 et H4. Jamais à contre-tendance. » Je te montre ce que j’ai compris AVANT d’appliquer.</p><textarea data-l="consignes" rows="4" maxlength="2000">' + esc(p.consignes || '') + '</textarea><div class="pa-actions"><button type="button" class="pa-btn" data-a="consignes-lire">Lire</button><button type="button" class="pa-btn pa-fort" data-a="consignes-appliquer">Appliquer</button></div><div class="pa-retour" data-r="consignes"></div>');
  const seuils = bloc('Seuils de validation <small>(figés ; version ' + c.version + (c.modifie ? ', MODIFIÉS' : '') + ')</small>', '<table class="pa-table pa-petit"><tbody>'
    + '<tr><td>Gain net hors échantillon</td><td>≥ +' + c.objectif.rNetMin + ' R (objectif haut +' + c.objectif.rNetHaut + ' R)</td></tr><tr><td>Trades hors échantillon</td><td>≥ ' + c.objectif.tradesMin + '</td></tr><tr><td>Espérance par trade</td><td>≥ +' + o.esperanceMin + ' R (jamais assouplie)</td></tr>'
    + '<tr><td>Facteur de profit</td><td>≥ ' + o.factProfitMin + '</td></tr><tr><td>Creux maximal</td><td>≤ ' + o.drawdownMaxR + ' R</td></tr><tr><td>Positions par semaine</td><td>' + o.parSemaineMin + ' à ' + o.parSemaineMax + '</td></tr><tr><td>Trimestres positifs</td><td>≥ ' + Math.round(o.trimestresPositifsMin * 100) + ' %</td></tr><tr><td>Meilleur trade / gain brut</td><td>≤ ' + Math.round(o.concentrationMax * 100) + ' %</td></tr>'
    + '<tr><td>Intervalle de confiance à 95 %</td><td>borne basse &gt; 0</td></tr><tr><td>Sharpe déflaté (comparaisons multiples)</td><td>≥ ' + Math.round(c.deflation.dsrMin * 100) + ' %</td></tr><tr><td>Monte Carlo</td><td>creux 95e centile ≤ ' + c.monteCarlo.drawdownP95MaxR + ' R ; espérance 5e centile &gt; ' + c.monteCarlo.esperanceP5Min + '</td></tr>'
    + '<tr><td>Robustesse des paramètres voisins</td><td>≥ ' + Math.round(c.robustesse.voisinsPositifsMin * 100) + ' % positifs</td></tr><tr><td>Jeu final</td><td>ouvert une seule fois par stratégie ; espérance ≥ ' + c.jeuFinal.esperanceMin + ' R, PF ≥ ' + c.jeuFinal.factProfitMin + ', creux ≤ ' + c.jeuFinal.drawdownMaxR + ' R</td></tr><tr><td>Confirmation réelle</td><td>' + c.confirmation.tradesReels + ' trades simulés sans dérive</td></tr></tbody></table>'
    + '<details class="pa-seuils"><summary>Modifier l’objectif de rentabilité (avec avertissement)</summary><form data-form="seuils" class="pa-form"><label>Gain net minimal (R) <input type="number" name="rNetMin" min="1" step="1" value="' + c.objectif.rNetMin + '"></label><label>Trades minimum <input type="number" name="tradesMin" min="30" step="10" value="' + c.objectif.tradesMin + '"></label><label>Objectif haut (R) <input type="number" name="rNetHaut" min="1" step="1" value="' + c.objectif.rNetHaut + '"></label><label>Trades simulés pour la confirmation <input type="number" name="confirmationTrades" min="5" max="200" value="' + c.confirmation.tradesReels + '"></label>'
    + '<div class="pa-actions"><button type="button" class="pa-btn" data-a="seuils-apercu">Voir ce que ça change</button></div><div class="pa-retour pa-avertissement" data-r="seuils"></div><label class="pa-confirme"><input type="checkbox" name="confirme"> J’ai lu l’avertissement et je veux appliquer ces seuils aux futures recherches seulement.</label><div class="pa-actions"><button type="button" class="pa-btn pa-danger" data-a="seuils-appliquer">Appliquer les nouveaux seuils</button></div></form></details>'
    + '<p class="pa-avert">Les seuils ne s’appliquent qu’aux futures recherches ; ils ne servent jamais à sauver une stratégie existante. Les autres seuils (espérance, facteur de profit, Monte Carlo…) ne sont pas modifiables ici : changer un critère de la version 1 demande une nouvelle version du code.</p>');
  const jr = v.journalReglages.length ? bloc('Changements de réglages', '<ul class="pa-liste">' + v.journalReglages.slice().reverse().map(j => '<li><b>' + heureFr(j.t) + '</b> · ' + esc(j.type === 'seuils' ? 'Seuils : ' + j.avertissement : 'Consignes : ' + (j.effets || []).join(' ; ')) + '</li>').join('') + '</ul>', 'pa-large') : '';
  return '<div class="pa-grille">' + profil + consignes + seuils + jr + '</div><p class="pa-avert pa-bas">' + MENTION + '</p>';
}
