/* ═════════════ « PAS D'IMPASSE » : LES NIVEAUX DE LA RECHERCHE ET LE PLAN D'ATTENTE (V6, phase 2 et 5 ; module pur, testé : galaxie/tests/extension-recherche-test.mjs) ═════════════
   Avant la V6, la recherche s'arrêtait en « espace défini épuisé (2 générations) ». Maintenant elle ÉLARGIT elle-même son espace, par niveaux, et ne se déclare en attente qu'après avoir épuisé l'espace
   ÉLARGI — en disant précisément ce qu'elle attend et pour combien de temps :
     niveau 0  les familles de base (V3, V4, V6) : grille de départ, puis deux générations élargies ;
     niveau 1  l'optimisation GUIDÉE (rondes successives, graines différentes) autour des zones où l'espérance nette est positive ;
     niveau 2  les familles FILTRÉES par le contexte (séance, tendance H4, range, volatilité, volume, delta, financement) ;
     (nouveaux actifs : dès que Justin en ajoute, tous les niveaux les parcourent aussi) ;
     puis le CHERCHEUR (V4) est sollicité tout de suite pour de nouvelles hypothèses, au lieu d'attendre le lendemain.
   La zone de recherche est FIXE (coffre) : de nouvelles données n'y entrent pas, elles servent au jeu final et à la simulation en direct. Ce qui peut donc relancer la recherche, c'est une nouvelle idée
   (Chercheur), de nouveaux coûts réels (couts.json), un nouvel actif, ou — pour PROUVER — les trades de la pépinière en direct. */
export const NIVEAUX = Object.freeze([
  { id: 0, nom: 'familles de base (grille de départ et élargies)' },
  { id: 1, nom: 'optimisation guidée autour des zones prometteuses' },
  { id: 2, nom: 'familles filtrées par le contexte' }
]);
const jours = h => (h < 36 ? 'environ ' + Math.max(1, Math.round(h)) + ' heure' + (Math.round(h) > 1 ? 's' : '') : 'environ ' + Math.round(h / 24) + ' jour' + (Math.round(h / 24) > 1 ? 's' : ''));

/* Combien de temps avant que le Chercheur ne reparle ? (une session par jour UTC) */
export const heuresAvantChercheur = (derniere, maintenant, epuise = false) => { const j = Math.floor(maintenant / 86400e3); if (!derniere || Math.floor(derniere / 86400e3) < j) return 0; const jour = (j + 1) * 24 - maintenant / 3600e3; if (!epuise) return jour; return Math.max(0, Math.min(jour, 2 - (maintenant - derniere) / 3600e3)); };   // V6 : recherche épuisée = le Chercheur revient toutes les 2 h (au lieu de 6 h)

/* Estimation du temps qu'il faut à une candidate de la pépinière pour atteindre la simulation directe réglementaire (4 semaines ET 30 trades) d'après SON rythme réel. */
export function resteSimulation(c, maintenant, c3 = { semainesMin: 4, tradesMin: 30 }) {
  const sem = (maintenant - c.debut) / (7 * 86400e3), n = (c.trades || []).length, rythme = sem > 0.05 ? n / sem : 0;      // trades par semaine
  const semTrades = n >= c3.tradesMin ? 0 : rythme > 0 ? (c3.tradesMin - n) / rythme : Infinity, semTemps = Math.max(0, c3.semainesMin - sem);
  return { semaines: Math.max(semTrades, semTemps), trades: n, rythme, limite: semTrades >= semTemps ? 'trades' : 'temps' };
}

/* Le plan d'attente. `niveaux` = [{ id, nom, total, faits }] ; `pistes` = meilleures pistes (strategies/pistes.js) ; `pepiniere` = { candidates } ; `equipe` = { derniereExecution } ; `reglage` = { fichierPresent } ;
   `actifsExtra` = liste ; `maintenant`. Rend { attente: bool, phrase, lignes, reprise: { heures, texte } }. */
export function planAttente({ niveaux = [], pistes = [], pepiniere = null, equipe = null, reglage = null, actifsExtra = [], maintenant = Date.now(), variantes = 0 } = {}) {
  const reste = niveaux.filter(n => n.faits < n.total);
  if (reste.length) return { attente: false, phrase: 'Je continue : niveau ' + reste[0].id + ' (' + reste[0].nom + '), ' + (reste[0].total - reste[0].faits) + ' tâche(s) restantes.', lignes: [], reprise: null };
  const lignes = ['J’ai exploré tout l’espace défini ET élargi : ' + niveaux.map(n => 'niveau ' + n.id + ' (' + n.nom + ') : ' + n.total + ' tâches').join(' ; ') + ' — ' + variantes.toLocaleString('fr-FR') + ' variantes testées en tout (le compteur ne baisse jamais).'];
  const cand = [], att = [];
  // 1. ce que la pépinière en direct peut encore apporter
  const pep = (pepiniere && pepiniere.candidates) || [];
  const actives = pep.filter(c => c.statut === 'active' && c.type !== 'carnet').map(c => ({ c, r: resteSimulation(c, maintenant) })).filter(x => x.r.semaines !== Infinity).sort((a, b) => a.r.semaines - b.r.semaines);
  if (actives.length) { const x = actives[0]; att.push('les trades en direct de la pépinière : « ' + (x.c.nom || x.c.id) + ' ' + x.c.paire + ' » a ' + x.r.trades + ' trade(s) simulé(s) ; il lui faut encore ' + (x.r.semaines < 1 ? 'moins d’une semaine' : Math.ceil(x.r.semaines) + ' semaine(s)') + ' pour atteindre la simulation réglementaire (4 semaines et 30 trades)'); cand.push(x.r.semaines * 168); }
  else if (pep.some(c => c.statut === 'active')) att.push('les trades en direct de la pépinière (aucune candidate n’a encore assez de recul pour une estimation)');
  // 2. le Chercheur
  const hC = heuresAvantChercheur(equipe && equipe.derniereExecution, maintenant, true);
  att.push('de nouvelles hypothèses du Chercheur (' + (hC <= 0 ? 'je le sollicite maintenant' : 'sa prochaine séance est dans ' + jours(hC)) + ')'); cand.push(Math.max(0.1, hC));
  // 3. ce que Justin peut décider
  const toi = []; if (!reglage || !reglage.fichierPresent) toi.push('remplir `couts.json` avec tes vrais frais (maker / taker / spread)'); if (!actifsExtra.length) toi.push('ajouter un actif liquide (`node agent-pc/service.mjs --ajouter-actif ETH`)');
  lignes.push('Ce que j’attends : ' + att.join(' ; ') + '.');
  if (toi.length) lignes.push('Ce qui peut relancer la recherche de ton côté : ' + toi.join(' ; ') + '.');
  if (pistes && pistes[0]) { const p = pistes[0]; lignes.push('Meilleure piste : ' + p.nom + ' sur ' + p.paire + (p.manque && p.manque.length ? ' — ' + p.manque[0].texte : '') + '.'); }
  const h = cand.length ? Math.min(...cand) : null;
  return { attente: true, phrase: lignes[1] || lignes[0], lignes, reprise: h == null ? null : { heures: h, texte: 'prochaine échéance dans ' + jours(h) } };
}
