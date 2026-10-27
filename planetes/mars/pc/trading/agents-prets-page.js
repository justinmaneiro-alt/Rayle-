import { FAMILLES_V2, ORDRE_AGENTS_V2 } from '../agents-v2/familles-v2.js';
import { STATUTS, FIABILITE_TEXTE } from '../agents-v2/validation-agent.js';
import { proposer, alertesAEnvoyer, etiquetteAgent } from '../agents-v2/proposition.js';
import { lireMarcheV2, agreger } from '../agents-v2/lecture-marche-v2.js';
import { expliquerOutil } from '../agents-v2/outils-terminal.js';
import { construireContexte } from '../agent-btc/contexte.js';
import { versBougies, tranche } from '../agent-btc/colonnes.js';
import { coutsDe } from '../agent-m6/couts.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';

/* ═════════════ « AGENTS PRÊTS » : L'ASSISTANT EN 4 ÉTAPES (V2, phase 6 ; côté page) ═════════════
   1 IDÉE (Tendance · Divergence RSI · Moyennes mobiles · Personnalisée) → 2 PARAMÈTRES (valeurs par défaut sensées, une explication par réglage, « demander à Raylé de l'expliquer »)
   → 3 BACKTEST VISUEL (entrées et sorties sur le graphique, courbe en R, statistiques ; zone de recherche seulement, jamais le jeu final)
   → 4 OPTIMISATION ET ALERTES (walk-forward hors échantillon, critères figés, verdict critère par critère ; alertes Raylé et Telegram SEULEMENT si l'agent est validé hors échantillon).
   Calculs dans un Worker de navigateur (ou en direct pour les tests). Aucune IA, aucun ordre, aucune clé de courtier. Données : l'historique Binance de la paire (frais Kraken réglables : couts.js).
   Stockage : navigateur seulement (`rayle_av2`). Tests : window.__RAYLE_AV2_TEST__ = { serie(paire), sansWorker, envoyerTelegram, jugerProp }. */
const CLE = 'rayle_av2', test = () => window.__RAYLE_AV2_TEST__ || {};
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { return {}; } }, ecrire = o => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage interdit */ } };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : '') + nb(x, d));
const date = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
const NOM_PAIRE = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };

export const IDEES = [
  { id: 'tendance_ma', titre: 'Tendance (moyennes mobiles 20 / 50 / 200)', icone: '📈', court: 'Suivre la tendance : repli sur la moyenne, puis reprise.', quand: 'Marche mieux dans les tendances nettes et longues ; perd en range (faux replis) et pendant les retournements.' },
  { id: 'divergence_rsi', titre: 'Divergence RSI confirmée', icone: '🔀', court: 'Repérer un essoufflement : prix plus bas, RSI plus haut, puis confirmation de structure.', quand: 'Signaux plus rares ; marche surtout aux bornes d’un range ou en fin de tendance ; peut être très tôt (donc faux) dans une tendance forte.' },
  { id: 'moyennes', titre: 'Moyennes mobiles (croisement simple)', icone: '〰', court: 'Entrer quand le prix croise une moyenne mobile. S’édite dans « Teste ma stratégie ».', quand: 'Très simple, très bruité : à tester contre le hasard avant d’y croire.' },
  { id: 'perso', titre: 'Personnalisée', icone: '🛠', court: 'Ta propre règle en blocs ou en français : « Teste ma stratégie ».', quand: 'Tout dépend de ta règle. Le test la compare au hasard et à l’achat-conservation.' }
];
const AIDE = {
  tendance_ma: { touche: ['Tolérance autour de l’EMA 50', 'À quelle distance de l’EMA 50 (en ATR) le repli doit venir : plus la tolérance est grande, plus de replis comptent (donc plus de signaux, plus de bruit).'],
    stopATR: ['Distance minimale du stop', 'Le stop est placé sous le creux du repli, mais jamais plus près que ce nombre d’ATR M15 : un stop trop serré saute pour rien.'],
    R: ['Objectif en R', 'Gagner R fois ce que tu risques. Plus R est grand, moins de trades gagnent mais chacun rapporte plus (tu vises 4 à 6 R).'], exigeH4: ['Exiger la tendance H4', '0 = non, 1 = oui : n’entrer que si la tendance H4 va dans le même sens (moins de signaux, plus de contexte).'] },
  divergence_rsi: { k: ['Netteté des creux et sommets', 'Nombre de bougies de chaque côté pour reconnaître un creux : plus grand = pivots plus nets, moins de signaux.'], diffRsi: ['Écart de RSI', 'Écart minimal de RSI entre les deux creux (divergence plus ou moins marquée).'],
    pad: ['Marge du stop', 'Marge sous le second creux, en ATR.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques (tu vises 4 à 6 R).'] }
};
const defautsDe = id => { const g = FAMILLES_V2[id].grille(), o = {}; for (const [k, l] of Object.entries(g)) o[k] = l[Math.floor(l.length / 2)]; return o; };

export function creerAgentsPrets({ conteneur, fournirSerie = null, jugerProp = null, dire = null, ouvrirPoste = null, maintenant = () => Date.now() }) {
  const memo = lire(), S = { etape: memo.etape || 1, agent: memo.agent || null, paire: ORDRE_PAIRES.includes(memo.paire) ? memo.paire : 'BTC', params: memo.params || {}, bt: null, val: memo.val || {}, msg: '', calcul: '', detruit: false, lecture: null, propo: null };
  const racine = document.createElement('div'); racine.className = 'ap-racine'; conteneur.appendChild(racine);
  const sauver = () => ecrire({ etape: S.etape, agent: S.agent, paire: S.paire, params: S.params, val: S.val, alertes: lire().alertes });
  const paramsDe = () => ({ ...defautsDe(S.agent), ...(S.params[S.agent] || {}) });
  const cleVal = () => S.agent + ':' + S.paire;

  /* ── données et calcul ── */
  async function serie() {
    if (test().serie) return test().serie(S.paire);
    if (fournirSerie) return fournirSerie(S.paire);
    const { obtenirHotePaire } = await import('./pilotes-paires.js'); const h = await obtenirHotePaire(S.paire, { demarrer: true }); return h.serie();
  }
  let worker = null, noMsg = 0; const attentes = new Map();
  function obtenirWorker() {
    if (test().sansWorker || typeof Worker === 'undefined') return null; if (worker) return worker;
    try { worker = new Worker(new URL('../agents-v2/worker-agents-v2.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => { const a = attentes.get(e.data && e.data.id); if (!a) return; attentes.delete(e.data.id); e.data.type === 'erreur' ? a.ko(new Error(e.data.message)) : a.ok(e.data.r); };
      worker.onerror = e => { for (const a of attentes.values()) a.ko(new Error('Worker de calcul : ' + (e.message || 'erreur'))); attentes.clear(); worker = null; }; } catch (e) { worker = null; }
    return worker;
  }
  async function calculer(type, extra) {
    const s = await serie(); if (!s || !s.n) throw new Error('pas d’historique pour ' + S.paire + ' : active les données de la paire dans le poste de l’agent');
    const cout = coutsDe(S.paire), config = { fraisPct: cout.fraisPct, spreadPct: cout.spreadPct, glissementPct: cout.glissementPct, risquePct: 1 }, w = obtenirWorker();
    if (w) { const id = ++noMsg; return new Promise((ok, ko) => { attentes.set(id, { ok, ko }); w.postMessage({ id, type, serie: s, agent: S.agent, config, ...extra }); }); }
    await new Promise(r => setTimeout(r, 30));
    const M = await import('../agents-v2/validation-agent.js');
    return type === 'valider' ? M.validerAgent(s, S.agent, { config, variantesDejaTestees: extra.variantes || 0 }) : M.backtester(s, S.agent, extra.params, { config });
  }

  /* ── dessin ── */
  function courbe(valeurs) {
    if (!valeurs || valeurs.length < 2) return '<p class="ap-vide">Pas assez de trades pour une courbe.</p>';
    const L = 560, H = 170, mn = Math.min(0, ...valeurs), mx = Math.max(0, ...valeurs), sp = (mx - mn) || 1, X = i => (i / (valeurs.length - 1) * (L - 40) + 34).toFixed(1), Y = v => (H - 18 - (v - mn) / sp * (H - 30)).toFixed(1);
    const pts = valeurs.map((v, i) => X(i) + ',' + Y(v)).join(' ');
    return '<svg class="ap-courbe" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Courbe cumulée en R"><line x1="34" y1="' + Y(0) + '" x2="' + (L - 6) + '" y2="' + Y(0) + '" class="z"/><polyline points="' + pts + '" class="c"/><text x="2" y="' + (Number(Y(mx)) + 4) + '">' + nb(mx, 0) + ' R</text><text x="2" y="' + (Number(Y(mn)) + 4) + '">' + nb(mn, 0) + ' R</text><text x="34" y="' + (H - 2) + '">' + valeurs.length + ' trades · zone de recherche</text></svg>';
  }
  function graphique(s, trades) {
    if (!trades.length) return '';
    const dern = trades.slice(-4), a = Math.max(0, dern[0].entree - 25), b = Math.min(s.n, dern[dern.length - 1].sortie + 25), n = b - a; if (n < 5) return '';
    let mn = Infinity, mx = -Infinity; for (let i = a; i < b; i++) { if (s.l[i] < mn) mn = s.l[i]; if (s.h[i] > mx) mx = s.h[i]; }
    const L = 720, H = 260, sp = (mx - mn) || 1, X = i => ((i - a) / n * (L - 50) + 44), Y = p => (H - 14 - (p - mn) / sp * (H - 28)), w = Math.max(1.5, (L - 50) / n * 0.7); let g = '';
    for (let i = a; i < b; i++) { const hausse = s.c[i] >= s.o[i], x = X(i); g += '<line x1="' + x.toFixed(1) + '" y1="' + Y(s.h[i]).toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + Y(s.l[i]).toFixed(1) + '" class="m ' + (hausse ? 'h' : 'b') + '"/><rect x="' + (x - w / 2).toFixed(1) + '" y="' + Y(Math.max(s.o[i], s.c[i])).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, Math.abs(Y(s.o[i]) - Y(s.c[i]))).toFixed(1) + '" class="k ' + (hausse ? 'h' : 'b') + '"/>'; }
    for (const t of dern) {
      const x1 = X(t.entree), x2 = X(t.sortie), gagnant = t.R > 0;
      g += '<line x1="' + x1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y1="' + Y(t.stop).toFixed(1) + '" y2="' + Y(t.stop).toFixed(1) + '" class="st"/><line x1="' + x1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y1="' + Y(t.cible).toFixed(1) + '" y2="' + Y(t.cible).toFixed(1) + '" class="ob"/>';
      g += '<path d="M' + x1.toFixed(1) + ' ' + (Y(t.prixEntree) + (t.sens > 0 ? -2 : 2)).toFixed(1) + ' l-6 ' + (t.sens > 0 ? 11 : -11) + ' h12z" class="en ' + (t.sens > 0 ? 'ac' : 've') + '"><title>' + (t.sens > 0 ? 'Achat' : 'Vente') + ' à ' + nb(t.prixEntree, 2) + '</title></path>';
      g += '<rect x="' + (x2 - 4).toFixed(1) + '" y="' + (Y(t.prixSortie) - 4).toFixed(1) + '" width="8" height="8" class="so ' + (gagnant ? 'gain' : 'perte') + '"><title>Sortie ' + esc(t.motif) + ' : ' + sgn(t.R) + ' R</title></rect>';
    }
    return '<svg class="ap-graphe" viewBox="0 0 ' + L + ' ' + H + '" role="img" aria-label="Bougies M15 avec les entrées et les sorties du backtest">' + g + '<text x="2" y="12">' + nb(mx, 2) + '</text><text x="2" y="' + (H - 4) + '">' + nb(mn, 2) + '</text></svg><p class="ap-legende"><span class="ac">▲ achat</span> <span class="ve">▼ vente</span> · ligne rouge = stop · ligne verte = objectif · carré vert / rouge = sortie gagnante / perdante (les 4 derniers trades du backtest).</p>';
  }
  const tableauStats = st => '<table class="ap-tab"><tbody><tr><td>Trades</td><td><b>' + st.n + '</b></td><td>Taux de réussite</td><td><b>' + (st.tauxReussite == null ? '—' : nb(st.tauxReussite * 100, 0) + ' %') + '</b></td></tr><tr><td>Espérance par trade</td><td><b class="' + (st.esperance > 0 ? 'gain' : 'perte') + '">' + sgn(st.esperance) + ' R</b></td><td>Facteur de profit</td><td><b>' + (st.factProfit == null ? '—' : st.factProfit === Infinity ? '∞' : nb(st.factProfit)) + '</b></td></tr><tr><td>Total</td><td><b>' + sgn(st.Rtotal, 1) + ' R</b></td><td>Creux maximal</td><td><b>' + nb(st.ddR, 1) + ' R</b></td></tr><tr><td>Positions / semaine</td><td><b>' + nb(st.parSemaine, 2) + '</b></td><td>Meilleur trade / part du gain</td><td><b>' + (st.concentration == null ? '—' : nb(st.concentration * 100, 0) + ' %') + '</b></td></tr></tbody></table>';

  /* ── étapes ── */
  const bandeau = () => '<div class="ap-fiab" role="note">' + esc(FIABILITE_TEXTE) + '</div>';
  const entete = () => '<div class="ap-haut"><div class="ap-etapes" role="tablist">' + ['Idée', 'Paramètres', 'Backtest', 'Optimiser et alertes'].map((n, i) => '<button type="button" role="tab" data-etape="' + (i + 1) + '" class="' + (S.etape === i + 1 ? 'actif' : '') + '" ' + (i > 0 && !S.agent ? 'disabled' : '') + '><b>' + (i + 1) + '</b> ' + n + '</button>').join('') + '</div><div class="ap-paires" role="group" aria-label="Paire">' + ORDRE_PAIRES.map(p => '<button type="button" data-paire="' + p + '" class="' + (S.paire === p ? 'actif' : '') + '" title="' + NOM_PAIRE[p] + '">' + p + '</button>').join('') + '</div></div>';
  const etape1 = () => '<p class="ap-intro">Choisis une idée. Chaque agent est une stratégie <b>simple et connue</b>, testée avec les frais, sans regarder le futur. Aucun ordre n’est jamais passé.</p><div class="ap-cartes">' + IDEES.map(i => '<button type="button" class="ap-carte' + (S.agent === i.id ? ' actif' : '') + '" data-idee="' + i.id + '"><i>' + i.icone + '</i><b>' + esc(i.titre) + '</b><span>' + esc(i.court) + '</span><small>' + esc(i.quand) + '</small></button>').join('') + '</div>';
  function etape2() {
    const id = S.agent, fam = FAMILLES_V2[id], p = paramsDe(), g = fam.grille();
    return '<h4>' + esc(fam.nom) + '</h4><p class="ap-intro">' + esc(fam.description) + '</p><div class="ap-params">' + Object.entries(g).map(([k, l]) => '<label><span><b>' + esc(AIDE[id][k][0]) + '</b><small>' + esc(AIDE[id][k][1]) + '</small></span><select data-param="' + k + '">' + l.map(v => '<option value="' + v + '"' + (p[k] === v ? ' selected' : '') + '>' + String(v).replace('.', ',') + '</option>').join('') + '</select></label>').join('') + '</div>'
      + '<p class="ap-note">Les valeurs proposées sont des plages <b>raisonnables et volontairement petites</b> (' + Object.values(g).reduce((s, l) => s * l.length, 1) + ' combinaisons au total) : plus on teste de réglages, plus on risque de trouver un « bon » résultat par hasard.</p>'
      + '<div class="ap-actions"><button type="button" data-a="expliquer">Demander à Raylé de l’expliquer</button><button type="button" data-a="defauts">Valeurs par défaut</button><button type="button" data-a="suite" class="prim">Backtester →</button></div>';
  }
  function etape3() {
    const b = S.bt;
    let h = '<div class="ap-actions"><button type="button" data-a="backtest" class="prim"' + (S.calcul ? ' disabled' : '') + '>' + (S.calcul === 'backtest' ? 'Calcul en cours…' : 'Lancer le backtest sur ' + S.paire) + '</button><span class="ap-hint">Zone de recherche seulement (les 75 % premiers de l’historique), frais, spread et glissement inclus.</span></div>';
    if (!b) return h + '<p class="ap-vide">Aucun backtest lancé pour cette idée et cette paire.</p>';
    if (!b.ok) return h + '<p class="ap-ko">' + esc(b.raison || 'Backtest impossible') + '</p>';
    return h + '<div class="ap-res"><h4>Résultat du backtest · ' + S.paire + ' · ' + date(b.zone.debut) + ' → ' + date(b.zone.fin) + '</h4>' + tableauStats(b.stats)
      + (b.ic ? '<p class="ap-ic">Intervalle à 95 % de l’espérance : ' + sgn(b.ic.bas) + ' à ' + sgn(b.ic.haut) + ' R' + (b.ic.bas > 0 ? '' : ' (il contient ou passe sous 0 : rien ne prouve un avantage)') + '.</p>' : '')
      + courbe(b.stats.courbeR) + b.graphe + '<p class="ap-avert">' + esc(b.avertissement) + '</p><div class="ap-actions"><button type="button" data-a="etape4" class="prim">Optimiser et valider →</button></div></div>';
  }
  function etape4() {
    const v = S.val[cleVal()], enCours = S.calcul === 'valider';
    let h = '<div class="ap-actions"><button type="button" data-a="valider" class="prim"' + (S.calcul ? ' disabled' : '') + '>' + (enCours ? 'Walk-forward en cours…' : 'Optimiser et valider (hors échantillon)') + '</button><button type="button" data-a="valider-agent"' + (S.calcul ? ' disabled' : '') + '>Demander à l’agent de l’optimiser</button></div><p class="ap-hint">Les paramètres sont rechoisis à chaque bloc de test de 6 mois sur l’entraînement SEUL ; le résultat est la suite des blocs de test. Les critères sont ceux de toute la bibliothèque (figés, jamais assouplis). Le jeu final (derniers 25 %) n’est jamais ouvert ici.</p>';
    if (v) h += verdict(v);
    return h + zoneAlertes(v) + zoneLecture();
  }
  function verdict(v) {
    if (v.statut === 'insuffisant') return '<div class="ap-verdict ko"><b>' + STATUTS.insuffisant + '</b><p>' + esc(v.raison) + '</p></div>';
    const ok = v.statut === 'valide_oos', st = v.wf.stats;
    return '<div class="ap-verdict ' + (ok ? 'ok' : 'ko') + '"><b>' + STATUTS[v.statut] + '</b> <span>(jeu final non ouvert · critères v' + v.criteres.version + ' · empreinte ' + esc(v.criteres.empreinte) + ' · ' + v.nVariantes + ' variantes comptées)</span></div>'
      + (ok ? '<p class="ap-ok-texte">Tous les critères hors échantillon sont passés <b>sur le passé</b>. Cela ne garantit rien pour la suite.</p>' : '<p class="ap-ko-texte">Cet agent ne passe pas les critères hors échantillon : <b>aucune position ne sera proposée et aucune alerte d’entrée ne sera envoyée.</b> C’est un résultat honnête, pas un bug.</p>')
      + tableauStats(st) + '<table class="ap-tab ap-crit"><thead><tr><th>Critère</th><th>Valeur</th><th>Seuil</th><th></th></tr></thead><tbody>' + v.juge.lignes.map(l => '<tr class="' + (l.ok ? 'ok' : 'ko') + '"><td>' + esc(l.critere) + '</td><td>' + (typeof l.valeur === 'number' ? nb(l.valeur, 2) : esc(l.valeur == null ? '—' : l.valeur)) + esc(l.unite || '') + '</td><td>' + esc(l.seuil) + '</td><td>' + (l.ok ? '✓' : '✗') + '</td></tr>').join('') + '</tbody></table>'
      + '<details class="ap-blocs"><summary>Blocs du walk-forward (' + v.wf.blocs.length + ') et paramètres retenus</summary><ul>' + v.wf.blocs.map(b => '<li>' + date(b.debut) + ' → ' + date(b.fin) + ' : ' + (b.test ? b.test.n + ' trades, ' + sgn(b.test.esperance) + ' R' : '—') + ' · paramètres ' + esc(JSON.stringify(b.params)) + '</li>').join('') + '</ul><p>Retenus : ' + esc(JSON.stringify(v.retenus)) + '</p></details>';
  }
  function zoneAlertes(v) {
    const al = lire().alertes || {}, actif = !!(al.actif && al.agent === S.agent && al.paire === S.paire), valide = !!v && v.statut === 'valide_oos';
    return '<div class="ap-alertes"><h4>Alertes</h4><label class="ap-bascule"><input type="checkbox" data-a="alertes" ' + (actif ? 'checked' : '') + (valide ? '' : ' disabled') + '> Prévenir Raylé et Telegram (préparation et entrée)</label>'
      + (valide ? '<p class="ap-hint">Alertes seulement : <b>aucun ordre</b>. Elles ne partent qu’avec Raylé ouverte (le Veilleur du PC ne suit pas ces agents pour l’instant) ; chaque entrée porte l’étiquette « ' + etiquetteAgent('valide_oos') + ' » et le jugement du gardien prop.</p>' : '<p class="ap-hint">Désactivées : l’agent n’est pas validé hors échantillon. Une alerte d’entrée venant d’un agent non validé serait une promesse sans preuve.</p>')
      + '<div class="ap-propo" data-r="propo">' + (S.propo ? proposition(S.propo) : '') + '</div><div class="ap-actions"><button type="button" data-a="etat-actuel">Voir l’état actuel de l’agent</button></div></div>';
  }
  function proposition(p) {
    const cls = p.statut === 'entree' ? 'ok' : p.statut === 'preparation' ? 'prep' : p.statut === 'bloquee' || p.statut === 'refusee' ? 'ko' : '';
    return '<div class="ap-p ' + cls + '"><b>' + ({ entree: 'ENTRÉE', preparation: 'EN PRÉPARATION', refusee: 'AUCUNE POSITION PROPOSÉE', bloquee: 'BLOQUÉE PAR LE GARDIEN', aucune: 'PAS DE SETUP' }[p.statut]) + '</b> <span>' + esc(p.etiquette || '') + '</span><p>' + esc(p.texte || p.raison || '') + '</p></div>';
  }
  const zoneLecture = () => '<div class="ap-lecture"><h4>Lecture du marché par Raylé</h4><div class="ap-actions"><button type="button" data-a="lire">Lis le marché (' + S.paire + ' H1)</button><button type="button" data-a="lire-m15">Lis le marché (M15)</button></div><div data-r="lecture">' + (S.lecture ? lectureHtml(S.lecture) : '<p class="ap-hint">Tendance ou range, fin de range, cassures, prises de liquidité, volume, quand éviter de trader, scénarios avec invalidation, bougie par bougie. Sans IA.</p>') + '</div></div>';
  function lectureHtml(r) {
    if (!r.ok) return '<p class="ap-ko">' + esc(r.raison) + '</p>' + (r.manque === 'bougies' ? '<p class="ap-hint">Il manque des bougies : tu peux coller une capture du graphique dans le poste de l’agent (onglet « Capture d’écran »), l’IA lira les chiffres sur ta demande.</p>' : '');
    return '<ul class="ap-lec">' + r.phrases.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul><details><summary>Bougie par bougie (' + r.dernieres.length + ')</summary><ul>' + r.dernieres.map(d => '<li>' + esc(d.phrase) + '</li>').join('') + '</ul></details>';
  }
  function rendre() {
    if (S.detruit) return;
    const corps = !S.agent && S.etape > 1 ? etape1() : S.etape === 1 ? etape1() : S.etape === 2 ? etape2() : S.etape === 3 ? etape3() : etape4();
    const m = S.msg ? '<p class="ap-msg" role="status">' + esc(S.msg) + '</p>' : '';
    racine.innerHTML = bandeau() + entete() + m + '<div class="ap-corps" data-etape="' + S.etape + '">' + corps + '</div>';
  }

  /* ── actions ── */
  const aller = n => { S.etape = n; S.msg = ''; sauver(); rendre(); };
  const parler = t => { const d = test().dire || dire; if (d) d(t); else if (typeof window.respond === 'function') window.respond(t); };   // `respond` = la voix de Raylé (affiche et lit la phrase)
  async function lancerBacktest() {
    S.calcul = 'backtest'; S.msg = 'Calcul du backtest sur ' + S.paire + '…'; rendre();
    try {
      const r = await calculer('backtest', { params: paramsDe() }); if (S.detruit) return;
      const s = await serie(); r.graphe = r.ok ? graphique(s, r.trades) : ''; if (r.ok) { r.trades = r.trades.slice(-200); } S.bt = r; S.msg = r.ok ? 'Backtest terminé : ' + r.stats.n + ' trades.' : '';
    } catch (e) { S.bt = { ok: false, raison: String(e.message || e) }; S.msg = ''; }
    S.calcul = ''; rendre();
  }
  async function lancerValidation() {
    S.calcul = 'valider'; S.msg = 'Walk-forward en cours sur ' + S.paire + ' : plusieurs secondes à quelques dizaines de secondes selon l’historique…'; rendre();
    try {
      const v = await calculer('valider', { variantes: 0 }); if (S.detruit) return;
      const res = { ...v, rechercheComplete: undefined, mc: v.mc ? { ddP95: v.mc.ddP95, espP5: v.mc.espP5 } : null }; S.val[cleVal()] = res; sauver(); S.msg = 'Validation terminée : ' + STATUTS[v.statut] + '.';
      if (v.statut !== 'valide_oos') { const al = lire().alertes; if (al && al.agent === S.agent && al.paire === S.paire) { ecrire({ ...lire(), alertes: { ...al, actif: false } }); } }
      parler('Justin, l’agent ' + FAMILLES_V2[S.agent].nom.split(' (')[0] + ' sur ' + (NOM_PAIRE[S.paire] || S.paire) + ' : ' + STATUTS[v.statut].toLowerCase() + (v.statut === 'valide_oos' ? ', sur le passé seulement, sans garantie.' : '. Aucune position ne sera proposée.'));
    } catch (e) { S.val[cleVal()] = { statut: 'insuffisant', raison: String(e.message || e) }; S.msg = ''; }
    S.calcul = ''; rendre();
  }
  async function etatActuel() {
    S.msg = 'Lecture de l’état actuel…'; rendre();
    try {
      const s = await serie(), fin = Math.min(s.n, 6000), c = construireContexte(tranche(s, s.n - fin, s.n)), v = S.val[cleVal()], cout = coutsDe(S.paire);
      S.propo = proposer({ ctx: c, id: S.agent, params: v && v.retenus ? v.retenus : paramsDe(), validation: v || null, paire: S.paire, cout, jugerProp: test().jugerProp || jugerProp }); S.msg = '';
    } catch (e) { S.propo = { statut: 'aucune', raison: String(e.message || e), etiquette: '' }; S.msg = ''; }
    rendre();
  }
  async function lire_(unite) {
    S.msg = 'Lecture du marché…'; rendre();
    try {
      const s = await serie(); let b = versBougies(s, Math.max(0, s.n - 2500), s.n);
      b = agreger(b, unite).slice(-400);
      S.lecture = lireMarcheV2(b, { unite, actif: S.paire, maintenant: maintenant() }); S.msg = '';
      if (S.lecture.ok) parler(S.lecture.phrases.slice(0, 3).join(' '));
    } catch (e) { S.lecture = { ok: false, raison: String(e.message || e) }; S.msg = ''; }
    rendre();
  }
  racine.addEventListener('change', e => {
    const p = e.target.dataset.param; if (p) { S.params[S.agent] = { ...paramsDe(), [p]: Number(e.target.value) }; S.bt = null; sauver(); return; }
    if (e.target.dataset.a === 'alertes') {
      const v = S.val[cleVal()]; if (!v || v.statut !== 'valide_oos') { e.target.checked = false; return; }
      ecrire({ ...lire(), alertes: { actif: e.target.checked, agent: S.agent, paire: S.paire, params: v.retenus } }); S.msg = e.target.checked ? 'Alertes activées pour ' + S.paire + ' : préparation et entrée, jamais d’ordre.' : 'Alertes coupées.'; demarrerSuiviAgentsPrets({ serieDe: serieAlertes, jugerProp: test().jugerProp || jugerProp }); rendre();
    }
  });
  racine.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.etape) { if (!b.disabled) aller(Number(b.dataset.etape)); return; }
    if (b.dataset.paire) { S.paire = b.dataset.paire; S.bt = null; S.propo = null; S.lecture = null; sauver(); rendre(); return; }
    if (b.dataset.idee) {
      const id = b.dataset.idee;
      if (id === 'perso' || id === 'moyennes') { const ouvrir = test().ouvrirPoste || ouvrirPoste; if (ouvrir) ouvrir({ onglet: 'teste' }); else if (window.PosteAgent) window.PosteAgent.ouvrir({ onglet: 'teste' }); S.msg = 'Ouverture de « Teste ma stratégie » : décris ta règle, elle sera testée contre le hasard.'; rendre(); return; }
      S.agent = id; S.bt = null; S.propo = null; S.msg = ''; sauver(); aller(2); return;
    }
    switch (b.dataset.a) {
      case 'defauts': S.params[S.agent] = defautsDe(S.agent); S.bt = null; sauver(); rendre(); break;
      case 'expliquer': { const fam = FAMILLES_V2[S.agent], p = paramsDe(); const t = fam.nom + '. ' + fam.description + ' Réglages actuels : ' + Object.entries(p).map(([k, v]) => AIDE[S.agent][k][0].toLowerCase() + ' ' + String(v).replace('.', ',')).join(', ') + '. Ce n’est qu’une hypothèse : on la teste hors échantillon avant de lui faire confiance.'; parler(t); S.msg = t; rendre(); break; }
      case 'suite': aller(3); break;
      case 'backtest': await lancerBacktest(); break;
      case 'etape4': aller(4); break;
      case 'valider': case 'valider-agent': await lancerValidation(); break;
      case 'etat-actuel': await etatActuel(); break;
      case 'lire': await lire_('H1'); break;
      case 'lire-m15': await lire_('M15'); break;
    }
  });
  const serieAlertes = async paire => { if (test().serie) return test().serie(paire); if (fournirSerie) return fournirSerie(paire); const { obtenirHotePaire } = await import('./pilotes-paires.js'); return (await obtenirHotePaire(paire, { demarrer: true })).serie(); };
  rendre();
  return { racine, etat: () => ({ ...S }), aller, choisirAgent: id => { S.agent = id; sauver(); }, lancerBacktest, lancerValidation, etatActuel, lire: lire_, detruire() { S.detruit = true; if (worker) { try { worker.terminate(); } catch (e) { /* fini */ } worker = null; } racine.remove(); }, rendre };
}

/* ── suivi des alertes (une minute) : une seule boucle pour toute la page ── */
let suivi = null; const memoireAlertes = {};
export function demarrerSuiviAgentsPrets({ serieDe, jugerProp = null, delai = 60000 } = {}) {
  if (suivi) { suivi.serieDe = serieDe || suivi.serieDe; suivi.jugerProp = jugerProp || suivi.jugerProp; return suivi; }
  suivi = { serieDe, jugerProp, minuterie: setInterval(() => tickSuivi().catch(() => {}), delai), arreter() { clearInterval(suivi.minuterie); suivi = null; } };
  return suivi;
}
export async function tickSuivi({ maintenant = Date.now(), envoyerTelegram = null } = {}) {
  const al = lire().alertes; if (!al || !al.actif || !suivi) return [];
  const memo = lire(), v = (memo.val || {})[al.agent + ':' + al.paire]; if (!v || v.statut !== 'valide_oos') return [];   // jamais d'alerte pour un agent non validé
  const s = await suivi.serieDe(al.paire); if (!s || s.n < 1000) return [];
  const c = construireContexte(tranche(s, Math.max(0, s.n - 6000), s.n)), cout = coutsDe(al.paire);
  const p = proposer({ ctx: c, id: al.agent, params: al.params || v.retenus, validation: v, paire: al.paire, cout, jugerProp: (test().jugerProp || suivi.jugerProp), maintenant });
  const aEnvoyer = alertesAEnvoyer([p], memoireAlertes, { maintenant });
  for (const a of aEnvoyer) {
    try { if (window.RayleBus) { window.RayleBus.emit('raylé:alerte-prix', { actif: al.paire + ' · ' + FAMILLES_V2[al.agent].nom, texte: a.texte, prix: a.proposition.plan ? a.proposition.plan.entree : null }); window.RayleBus.emit('raylé:alerte', { ms: 7000 }); } } catch (e) { /* bus absent */ }
    try { if (typeof addLine === 'function') addLine('sys', (a.type === 'ENTREE' ? '🚨 ' : '👀 ') + a.texte); } catch (e) { /* journal absent */ }
    try { if (a.type === 'ENTREE' && typeof speak === 'function') speak('Justin, setup de l’agent ' + FAMILLES_V2[al.agent].nom.split(' (')[0] + ' sur ' + (NOM_PAIRE[al.paire] || al.paire) + ' : ' + (a.proposition.sens > 0 ? 'achat' : 'vente') + ', agent validé hors échantillon, sans garantie.'); } catch (e) { /* voix absente */ }
    try { const envoi = envoyerTelegram || test().envoyerTelegram || (async (texte, type) => { if (typeof workerReady !== 'function' || !workerReady()) throw new Error('Worker verrouillé'); const r = await window.wfetch('/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte, type }) }, 20000); if (!r.ok) throw new Error('HTTP ' + r.status); }); await envoi((a.type === 'ENTREE' ? '🟢 ' : '🟡 ') + '[' + al.paire + '] ' + a.texte, 'OBSERVATION'); } catch (e) { /* Telegram indisponible : l'alerte reste dans Raylé */ }
  }
  return aEnvoyer;
}
export { expliquerOutil, ORDRE_AGENTS_V2 };
