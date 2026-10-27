import { CATALOGUE } from '../agent-btc/regles-lab.js';
import { decrireStrategie, decrireCond, validerStrategie, TYPES_EXTRA, STOPS_MS, LIMITES_MS } from '../agent-ms/strategie-ms.js';
import { etiquetteConfiance, perfDirect } from '../agent-ms/alertes-ms.js';
import { risqueSurajustement, SEUILS_MS } from '../agent-ms/test-ms.js';
import { ORDRE_PAIRES } from '../agent-m6/paires.js';

/* ═════════════ VUES DE L'ONGLET « TESTE MA STRATÉGIE » (V1 ; HTML pur, sans accès au DOM : testé dans Chrome par mars-ms-test.mjs) ═════════════
   Aucun chiffre inventé : une donnée absente est « — » ; un échec est dit avec sa raison. Les verdicts utilisent trois mots (bat le hasard / ne bat pas le hasard / pas assez de trades pour conclure)
   et rappellent TOUJOURS que ce n'est pas la validation du protocole (jeu final non ouvert). */
export const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const sgn = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ','));
const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(d).replace('.', ',') + ' %');
const date = t => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '—');
const bloc = (titre, corps, cls = '') => '<section class="pa-c ' + cls + '"><h4>' + titre + '</h4>' + corps + '</section>';
const ligne = (nom, val, cls = '') => '<div class="pa-l"><span>' + nom + '</span><b class="' + cls + '">' + val + '</b></div>';
const MOTS = { code: { bat_le_hasard: ['ok', 'BAT LE HASARD'], ne_bat_pas: ['ko', 'NE BAT PAS LE HASARD'], pas_assez: ['warn', 'PAS ASSEZ DE TRADES'] } };

/* ── éditeur : champs d'une condition ── */
const NOMS_CHAMP = { tf: 'Unité', periode: 'Période', op: 'Sens', seuil: 'Seuil', position: 'Prix', valeurs: 'Valeurs', min: 'Minimum', max: 'Maximum', ratioMin: 'Ratio minimal', sens: 'Delta', N: 'Bougies', meche: 'Mèche', ratio: 'Ratio', nom: 'Niveau', distance: 'Distance (ATR)', bas: 'Prix bas', haut: 'Prix haut', de: 'De (h UTC)', a: 'À (h UTC)' };
const NOMS_VALEUR = { tendance: 'dans le sens du trade', contre: 'contre le sens du trade', range: 'range', transition: 'transition', hausse: 'hausse', baisse: 'baisse', haussier: 'haussier', baissier: 'baissier', volatil: 'volatil', avec: 'avec (au-dessus pour un achat)', contre_: 'contre', '<': 'en dessous', '>': 'au-dessus' };
const SESSIONS = { 0: 'Asie', 1: 'Londres', 2: 'New York', 3: 'creux' }, JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const DEFAUTS_COND = Object.freeze({ phase: { tf: 'h1', valeurs: ['tendance'] }, session: { valeurs: [1] }, jours: { valeurs: [1, 2, 3, 4, 5] }, volume: { min: 1.5 }, delta: { sens: 'avec', ratioMin: 0.1 }, rsi: { tf: 'h1', periode: 14, op: '<', seuil: 30 },
  ema: { tf: 'h1', periode: 50, position: 'avec' }, croisement: { tf: 'h1', periode: 50 }, cassure: { tf: 'h1', N: 48 }, balayage: { N: 48, meche: 0.4 }, meche: { ratio: 0.5 }, zone: { nom: 'vwap', distance: 0.5 }, regime: { valeurs: ['haussier'] }, volatilite: { min: 0, max: 0.7 },
  zoneprix: { bas: 60000, haut: 65000 }, heures: { de: 8, a: 17 } });
const domaine = (type, k) => (TYPES_EXTRA[type] ? null : CATALOGUE[type].champs[k]);
function champHtml(ctx, i, c, k) {
  const dom = domaine(c.type, k), v = c[k], nom = 'data-ms-cond="' + ctx + ':' + i + ':' + k + '"';
  if (c.type === 'zoneprix' || c.type === 'heures') return '<label>' + NOMS_CHAMP[k] + '<input type="number" step="any" ' + nom + ' value="' + esc(v) + '"></label>';
  if (k === 'valeurs') return '<fieldset class="pa-vals"><legend>' + NOMS_CHAMP[k] + '</legend>' + dom.map(x => '<label class="pa-case"><input type="checkbox" ' + nom + ' data-val="' + esc(x) + '"' + (v.includes(x) ? ' checked' : '') + '> ' + esc(c.type === 'session' ? SESSIONS[x] : c.type === 'jours' ? JOURS[x] : (NOMS_VALEUR[x] || x)) + '</label>').join('') + '</fieldset>';
  if (Array.isArray(dom) && typeof dom[0] === 'string') return '<label>' + NOMS_CHAMP[k] + '<select ' + nom + '>' + dom.map(x => '<option value="' + esc(x) + '"' + (v === x ? ' selected' : '') + '>' + esc(k === 'tf' ? x.toUpperCase() : (k === 'sens' && x === 'contre') ? 'contre' : (NOMS_VALEUR[x] || x)) + '</option>').join('') + '</select></label>';
  return '<label>' + (NOMS_CHAMP[k] || k) + '<input type="number" step="any" min="' + dom[0] + '" max="' + dom[1] + '" ' + nom + ' value="' + esc(v) + '"></label>';
}
const champsDe = type => (TYPES_EXTRA[type] ? (type === 'zoneprix' ? ['bas', 'haut'] : ['de', 'a']) : Object.keys(CATALOGUE[type].champs));
const nomType = type => (TYPES_EXTRA[type] ? TYPES_EXTRA[type].nom : CATALOGUE[type].nom);
function ligneCondition(ctx, i, c) {
  return '<div class="pa-cond" data-cond-ligne="' + ctx + ':' + i + '"><b>' + esc(nomType(c.type)) + '</b><div class="pa-champs">' + champsDe(c.type).map(k => champHtml(ctx, i, c, k)).join('') + '</div>'
    + '<button type="button" class="pa-btn" data-a="ms-cond-retirer" data-ctx="' + ctx + '" data-i="' + i + '">Retirer</button></div>';
}
const selectTypes = ctx => '<select data-ms-nouveau="' + ctx + '">' + [...Object.keys(CATALOGUE), ...Object.keys(TYPES_EXTRA)].map(t => '<option value="' + t + '">' + esc(nomType(t)) + '</option>').join('') + '</select><button type="button" class="pa-btn" data-a="ms-cond-ajouter" data-ctx="' + ctx + '">Ajouter une condition</button>';

/* ── éditeur complet ── */
export function vueEditeur(b, { id = null, texteLibre = '', lecture = null, retour = '' } = {}) {
  const st = b.stop, so = b.sortie, f = b.filtres || {};
  const stop = '<label>Type de stop<select data-ms="stop-type"><option value="atr"' + (st.type === 'atr' ? ' selected' : '') + '>Distance en ATR</option><option value="structure"' + (st.type === 'structure' ? ' selected' : '') + '>Sous le dernier creux / au-dessus du dernier sommet</option><option value="fixe"' + (st.type === 'fixe' ? ' selected' : '') + '>Fixe, en % du prix</option></select></label>'
    + (st.type === 'atr' ? '<label>ATR (×)<input type="number" step="0.1" min="' + STOPS_MS.atr.k[0] + '" max="' + STOPS_MS.atr.k[1] + '" data-ms="stop-k" value="' + esc(st.k) + '"></label><label>Unité<select data-ms="stop-tf"><option value="h1"' + (st.tf === 'h1' ? ' selected' : '') + '>H1</option><option value="h4"' + (st.tf === 'h4' ? ' selected' : '') + '>H4</option></select></label>'
      : st.type === 'structure' ? '<label>Bougies M15 regardées<input type="number" min="8" max="96" data-ms="stop-L" value="' + esc(st.L) + '"></label><label>Marge (ATR)<input type="number" step="0.1" min="0.1" max="1" data-ms="stop-pad" value="' + esc(st.pad) + '"></label>'
        : '<label>Distance (% du prix)<input type="number" step="0.1" min="0.2" max="8" data-ms="stop-pct" value="' + esc(st.pct) + '"></label>');
  const sortie = '<label>Sortie<select data-ms="sortie-type"><option value="cible_R"' + (so.type === 'cible_R' ? ' selected' : '') + '>Objectif en R</option><option value="suiveur"' + (so.type === 'suiveur' ? ' selected' : '') + '>Stop suiveur</option><option value="signal"' + (so.type === 'signal' ? ' selected' : '') + '>Sur un signal de sortie</option></select></label>'
    + (so.type === 'cible_R' ? '<label>Objectif (R)<input type="number" step="0.5" min="' + LIMITES_MS.R[0] + '" max="' + LIMITES_MS.R[1] + '" data-ms="sortie-R" value="' + esc(so.R) + '"></label>'
      : so.type === 'suiveur' ? '<label>Distance (ATR ×)<input type="number" step="0.5" min="0.5" max="6" data-ms="sortie-k" value="' + esc(so.k) + '"></label><label>Unité<select data-ms="sortie-tf"><option value="h1"' + (so.tf === 'h1' ? ' selected' : '') + '>H1</option><option value="h4"' + (so.tf === 'h4' ? ' selected' : '') + '>H4</option></select></label>'
        : '<div class="pa-vide">Sortir dès que (vu depuis ta position) :</div>' + so.conditions.map((c, i) => ligneCondition('sortie', i, c)).join('') + '<div class="pa-actions">' + selectTypes('sortie') + '</div>');
  const vr = validerStrategie({ ...b, id });
  const desc = vr.ok ? '<ul class="pa-liste pa-desc">' + decrireStrategie(vr.strategie).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' + (vr.avertissements.length ? '<p class="pa-avert">' + vr.avertissements.map(esc).join(' ') + '</p>' : '') : '<ul class="pa-liste pa-alerte">' + vr.erreurs.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
  const lectureHtml = lecture ? '<div class="pa-retour"><b>Ce que j’ai compris :</b><ul>' + lecture.compris.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' + (lecture.nonCompris.length ? '<b>Je n’ai pas compris :</b><ul class="pa-alerte">' + lecture.nonCompris.map(c => '<li>« ' + esc(c) + ' »</li>').join('') + '</ul>' : '') + (lecture.avertissements.length ? '<p class="pa-avert">' + lecture.avertissements.map(esc).join(' ') + '</p>' : '') + '<p class="pa-avert">Rien n’est appliqué : relis la description plus bas et valide-la.</p></div>' : '';
  return bloc((id ? 'Modifier la stratégie' : 'Nouvelle stratégie'),
    '<div data-r="ms-lecture">' + lectureHtml + '</div>'
    + '<details' + (texteLibre ? ' open' : '') + '><summary>Décrire ma stratégie en français (texte libre)</summary><textarea data-ms="texte" rows="3" placeholder="ex. Achète quand le RSI H1 passe sous 30 et que le prix est au-dessus de l’EMA 200, stop 1,5 ATR, objectif 2 R">' + esc(texteLibre) + '</textarea>'
    + '<div class="pa-actions"><button type="button" class="pa-btn" data-a="ms-texte-lire">Lire mon texte (sans IA, sur ce PC)</button><button type="button" class="pa-btn" data-a="ms-texte-ia">Traduire avec Raylé (IA, à ma demande)</button></div><div class="pa-avert">La lecture locale ne contacte rien. La traduction par l’IA envoie ce texte (et seulement lui) au Worker de Raylé, une seule fois, quand tu cliques.</div></details>'
    + '<form class="pa-form" data-form="ms">'
    + '<label>Nom<input type="text" data-ms="nom" maxlength="60" value="' + esc(b.nom) + '"></label>'
    + '<label>Côté<select data-ms="cote"><option value="long"' + (b.cote === 'long' ? ' selected' : '') + '>Achat seulement (long)</option><option value="short"' + (b.cote === 'short' ? ' selected' : '') + '>Vente seulement (short)</option><option value="les-deux"' + (b.cote === 'les-deux' ? ' selected' : '') + '>Achat et vente</option></select></label>'
    + '<fieldset><legend>Conditions d’entrée (toutes doivent être vraies)</legend>' + (b.conditions.length ? b.conditions.map((c, i) => ligneCondition('entree', i, c)).join('') : '<div class="pa-vide">Aucune condition : ajoutes-en au moins une (ou un filtre).</div>') + '<div class="pa-actions">' + selectTypes('entree') + '</div></fieldset>'
    + '<fieldset><legend>Filtres</legend><label class="pa-case"><input type="checkbox" data-ms="pasRange"' + (f.pasRange ? ' checked' : '') + '> Pas d’entrée quand le marché est en range</label>'
    + '<label class="pa-case"><input type="checkbox" data-ms="heures-on"' + (f.heures ? ' checked' : '') + '> Seulement entre </label><input type="number" min="0" max="23" data-ms="heures-de" value="' + esc(f.heures ? f.heures.de : 8) + '" class="pa-court"> h et <input type="number" min="0" max="24" data-ms="heures-a" value="' + esc(f.heures ? f.heures.a : 17) + '" class="pa-court"> h (UTC)'
    + '<label>Risque maximal par trade (%)<input type="number" step="0.05" min="0.1" max="2" data-ms="risqueMax" value="' + esc(f.risqueMaxPct == null ? '' : f.risqueMaxPct) + '" placeholder="non limité"></label></fieldset>'
    + '<fieldset><legend>Stop</legend>' + stop + '</fieldset><fieldset><legend>Sortie</legend>' + sortie + '</fieldset></form>'
    + '<h5>Relis ce que ta stratégie fait, puis valide-la</h5>' + desc
    + '<div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="ms-enregistrer">' + (id ? 'Enregistrer les modifications' : 'Enregistrer comme brouillon') + '</button>'
    + (id ? '<label class="pa-case pa-confirme"><input type="checkbox" data-ms="relu"> J’ai relu la description ci-dessus et je la valide</label><button type="button" class="pa-btn" data-a="ms-valider">Valider cette stratégie</button>' : '')
    + '<button type="button" class="pa-btn" data-a="ms-annuler">Fermer l’éditeur</button></div><div data-r="ms-retour">' + retour + '</div>', 'pa-large');
}

/* ── liste de mes stratégies ── */
export function vueListe(liste, { selection = null, perf = () => perfDirect({ fermees: [] }) } = {}) {
  if (!liste.length) return bloc('Mes stratégies', '<p class="pa-vide">Aucune stratégie pour l’instant. Décris la tienne avec des blocs simples ou en français : je la teste sur le passé, contre le hasard, avant que tu décides.</p><div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="ms-nouvelle">Nouvelle stratégie</button></div>', 'pa-large');
  const cartes = liste.map(r => {
    const dv = r.dernierTest && r.dernierTest.cle === r.cle ? r.dernierTest.verdict : null, conf = etiquetteConfiance({ dernierVerdict: dv, direct: perf(r.id) }), mot = dv ? MOTS.code[dv] : null;
    return '<article class="pa-carte' + (selection === r.id ? ' s-validee' : '') + '" data-ms-id="' + esc(r.id) + '"><header><h3>' + esc(r.nom) + '</h3><span class="pa-badge pa-' + (r.valide ? 'ok' : 'warn') + '">' + (r.valide ? 'VALIDÉE PAR TOI' : 'À VALIDER') + '</span>'
      + (mot ? '<span class="pa-badge pa-' + mot[0] + '">' + mot[1] + '</span>' : '<span class="pa-badge pa-neutre">NON TESTÉE</span>') + '<span class="pa-badge pa-' + (conf.code === 'confirmee' ? 'ok2' : conf.code === 'backtest' ? 'info' : 'warn') + '">' + esc(conf.etiquette) + '</span>' + (r.alertes.actif ? '<span class="pa-badge pa-info">ALERTES</span>' : '') + '</header>'
      + '<p class="pa-detail">' + esc(decrireStrategie(r.strategie).slice(1, 3).join(' ')) + '</p><p class="pa-avert">' + r.nVariantes + ' variante' + (r.nVariantes > 1 ? 's' : '') + ' testée' + (r.nVariantes > 1 ? 's' : '') + ' dans cette lignée · ' + r.nModifs + ' modification' + (r.nModifs > 1 ? 's' : '') + '</p>'
      + '<div class="pa-actions"><button type="button" class="pa-btn" data-a="ms-modifier" data-id="' + esc(r.id) + '">Modifier</button><button type="button" class="pa-btn pa-fort" data-a="ms-choisir" data-id="' + esc(r.id) + '">Tester</button><button type="button" class="pa-btn" data-a="ms-dupliquer" data-id="' + esc(r.id) + '">Dupliquer</button>'
      + '<button type="button" class="pa-btn" data-a="ms-alertes" data-id="' + esc(r.id) + '">' + (r.alertes.actif ? 'Couper les alertes' : 'Mettre en alertes') + '</button><button type="button" class="pa-btn pa-danger" data-a="ms-supprimer" data-id="' + esc(r.id) + '">Supprimer</button></div></article>';
  }).join('');
  return bloc('Mes stratégies', '<div class="pa-cartes">' + cartes + '</div><div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="ms-nouvelle">Nouvelle stratégie</button></div>', 'pa-large');
}

/* ── résultat d'un test ── */
const tuile = (titre, val, sous = '') => '<div class="pa-jeu"><b>' + val + '</b><div class="pa-avert">' + titre + (sous ? ' · ' + sous : '') + '</div></div>';
function blocPaire(p, r) {
  if (!r.ok) return '<tr><td>' + esc(p) + '</td><td colspan="7" class="pa-alerte">' + esc(r.erreur) + '</td></tr>';
  const mot = MOTS.code[r.verdict.code];
  return '<tr><td><b>' + esc(p) + '</b></td><td class="num">' + r.n + '</td><td class="num">' + sgn(r.stats.esperance) + ' R</td><td class="num">' + pct(r.stats.tauxReussite) + '</td><td class="num">' + nb(r.stats.ddR, 1) + ' R</td><td class="num">' + r.serieDePertes + '</td><td class="num">' + (r.hasard ? pct(r.hasard.centile) : '—') + '</td><td><span class="pa-badge pa-' + mot[0] + '">' + mot[1] + '</span></td></tr>';
}
export function vueResultat(rec, res, { paireVue = null } = {}) {
  if (!res) return bloc('Résultat du test', '<p class="pa-vide">Choisis une stratégie et lance un test : elle est jouée sur la zone de recherche de chaque paire (les derniers 25 % de l’historique restent intacts), avec les frais Kraken, puis comparée à l’achat-conservation et à des entrées au hasard.</p>', 'pa-large');
  if (!res.ok) return bloc('Résultat du test', '<p class="pa-alerte">' + esc(res.erreur) + '</p>', 'pa-large');
  const g = res.groupe, pairesOk = Object.entries(res.paires).filter(([, r]) => r.ok), principal = g || pairesOk[0][1], mot = MOTS.code[principal.verdict.code], risque = risqueSurajustement(res.nVariantes);
  const phrase = principal.verdict.code === 'bat_le_hasard' ? 'Sur le passé de la zone de recherche, cette stratégie fait mieux que le hasard — ce n’est pas une validation, et ça ne garantit rien pour la suite.'
    : principal.verdict.code === 'ne_bat_pas' ? 'Cette stratégie ne se distingue pas du hasard sur le passé : tu peux l’utiliser en alertes si tu le décides, mais elle restera étiquetée NON VALIDÉE.' : 'Il n’y a pas assez de trades pour savoir : ne tire aucune conclusion de ces chiffres.';
  const verdict = '<div class="pa-situation"><div class="pa-ent"><span class="pa-badge pa-' + mot[0] + ' pa-gros">' + mot[1] + '</span><span class="pa-eti">' + (g ? 'toutes paires, mêmes paramètres' : esc(pairesOk[0][0])) + '</span></div><p class="pa-phrase">' + esc(phrase) + '</p>'
    + '<ul class="pa-liste">' + principal.verdict.raisons.map(t => '<li class="pa-alerte">' + esc(t) + '</li>').join('') + principal.verdict.ok.map(t => '<li class="pa-ok">' + esc(t) + '</li>').join('') + '</ul></div>';
  const chiffres = '<div class="pa-jeux">' + tuile('Espérance par trade', sgn(principal.stats.esperance) + ' R', 'frais déduits') + tuile('Trades', String(principal.n)) + tuile('Taux de réussite', pct(principal.stats.tauxReussite)) + tuile('Creux maximal', nb(principal.stats.ddR, 1) + ' R') + tuile('Plus longue série de pertes', String(principal.serieDePertes))
    + tuile('Intervalle à 95 %', principal.ic && principal.ic.bas != null ? sgn(principal.ic.bas) + ' à ' + sgn(principal.ic.haut) : '—') + '</div>';
  const tableau = '<div class="pa-defile"><table class="pa-table pa-petit"><thead><tr><th>Paire</th><th class="num">Trades</th><th class="num">R / trade</th><th class="num">Réussite</th><th class="num">Creux</th><th class="num">Pertes d’affilée</th><th class="num">Bat X % du hasard</th><th>Verdict</th></tr></thead><tbody>'
    + Object.entries(res.paires).map(([p, r]) => blocPaire(p, r)).join('') + (g ? '<tr class="pa-reco"><td><b>Groupe</b></td><td class="num">' + g.n + '</td><td class="num">' + sgn(g.stats.esperance) + ' R</td><td class="num">' + pct(g.stats.tauxReussite) + '</td><td class="num">' + nb(g.stats.ddR, 1) + ' R</td><td class="num">' + g.serieDePertes + '</td><td class="num">' + (g.hasard ? pct(g.hasard.centile) : '—') + '</td><td><span class="pa-badge pa-' + MOTS.code[g.verdict.code][0] + '">' + MOTS.code[g.verdict.code][1] + '</span></td></tr>' : '') + '</tbody></table></div>';
  const ref = (paireVue && res.paires[paireVue] && res.paires[paireVue].ok ? res.paires[paireVue] : pairesOk[0][1]), pv = paireVue && res.paires[paireVue] && res.paires[paireVue].ok ? paireVue : pairesOk[0][0];
  const cotes = g ? g.cotes : ref.cotes, ans = g ? g.parAnnee : ref.parAnnee;
  const detail = '<div class="pa-grille"><section class="pa-c"><h4>Long / court</h4>' + ligne('Achats', cotes.long.n + ' trades · ' + sgn(cotes.long.esperance) + ' R') + ligne('Ventes', cotes.court.n + ' trades · ' + sgn(cotes.court.esperance) + ' R') + '</section>'
    + '<section class="pa-c"><h4>Par année</h4>' + (ans.length ? ans.map(a => ligne(String(a.annee), a.n + ' trades · ' + sgn(a.n ? a.R / a.n : null) + ' R / trade', a.R > 0 ? 'hausse' : 'baisse')).join('') : '<p class="pa-vide">—</p>') + '</section>'
    + '<section class="pa-c"><h4>Par régime · ' + esc(pv) + '</h4>' + (ref.parRegime.length ? ref.parRegime.map(a => ligne(esc(a.regime), a.n + ' trades · ' + sgn(a.esperance) + ' R / trade', a.esperance > 0 ? 'hausse' : 'baisse')).join('') : '<p class="pa-vide">—</p>') + '</section>'
    + '<section class="pa-c"><h4>Stabilité · blocs de test successifs · ' + esc(pv) + '</h4>' + (ref.blocs.length ? ref.blocs.map(b => ligne(date(b.debut) + ' → ' + date(b.fin), b.n + ' trades · ' + sgn(b.esperance) + ' R', b.esperance > 0 ? 'hausse' : 'baisse')).join('') + '<div class="pa-avert">' + ref.blocsPositifs + ' bloc(s) positif(s) sur ' + ref.blocsTestables + '</div>' : '<p class="pa-vide">—</p>') + '</section></div>';
  const comp = '<div class="pa-grille"><section class="pa-c"><h4>Face au hasard et à l’achat-conservation · ' + esc(pv) + '</h4>' + ligne('Entrées aléatoires à toute bougie (mêmes stops, même sortie)', ref.hasard ? 'ta stratégie en bat ' + pct(ref.hasard.centile) + ' (médiane du hasard : ' + sgn(ref.hasard.mediane) + ' R)' : 'comparaison impossible')
    + (ref.hasardFiltres ? ligne('… limitées à tes filtres (heures, pas de range)', 'ta stratégie en bat ' + pct(ref.hasardFiltres.centile) + (ref.hasardFiltres.centile < 0.95 ? ' : l’avantage vient surtout de tes filtres, pas de tes conditions d’entrée' : ' : tes conditions d’entrée apportent quelque chose en plus')) : '')
    + ligne('Achat-conservation (mêmes périodes)', 'rendement ' + sgn(ref.achatConservation.rendementPct, 1) + ' % · creux ' + nb(ref.achatConservation.ddPct, 1) + ' %') + ligne('Ta stratégie (risque 1 %)', 'rendement ' + sgn(ref.stats.rendementPct, 1) + ' % · creux ' + nb(ref.stats.ddPct, 1) + ' %')
    + (ref.mc ? ligne('Monte Carlo : creux dépassé 1 fois sur 20', nb(ref.mc.ddP95, 1) + ' R') : '') + '</section>'
    + '<section class="pa-c"><h4>Variantes testées et sur-ajustement</h4><p class="pa-phrase">' + esc(risque.phrase) + '</p>' + ligne('Variantes comptées (cette lignée)', String(res.nVariantes)) + (ref.deflate ? ligne('Barre du hasard (Sharpe)', nb(ref.deflate.sr0, 3) + ' · ta stratégie ' + nb(ref.deflate.sr, 3) + ' · probabilité réelle ' + pct(ref.deflate.dsr)) : '')
    + '<p class="pa-avert">Ce nombre n’est pas une note de qualité : plus il est grand, plus le seuil pour croire à un résultat monte. Le jeu final (derniers 25 % de l’historique) n’a PAS été touché.</p></section></div>';
  const capital = res.capital ? '<h5>Capital de 10 000 $ rejoué sur ces trades</h5><div class="pa-jeux">' + res.capital.map(c => '<div class="pa-jeu"><b>' + String(c.risquePct).replace('.', ',') + ' % de risque</b><div>capital final ' + Math.round(c.capitalFinal).toLocaleString('fr-FR') + ' $ · pire creux ' + nb(c.pireCreuxPct, 1) + ' %</div>' + sparkline(c.points) + '</div>').join('') + '</div>' : '';
  const prop = res.prop && res.prop.ok ? '<h5>Évaluation prop (perte du jour −3 %, creux −6 %, objectif +10 %)</h5><div class="pa-defile"><table class="pa-table pa-petit"><thead><tr><th>Risque par trade</th><th class="num">Objectif avant une limite</th><th class="num">Perte du jour −3 % touchée</th><th class="num">Creux −6 % touché</th><th class="num">Objectif avec arrêt du jour</th></tr></thead><tbody>'
    + res.prop.niveaux.map(n => '<tr><td>' + String(n.risquePct).replace('.', ',') + ' %</td><td class="num">' + pct(n.pObjectif.moy) + ' <small>(' + pct(n.pObjectif.bas) + '–' + pct(n.pObjectif.haut) + ')</small></td><td class="num">' + pct(n.pJour.moy) + '</td><td class="num">' + pct(n.pDrawdown.moy) + '</td><td class="num">' + pct(n.avecGarde ? n.avecGarde.pObjectif.moy : null) + '</td></tr>').join('') + '</tbody></table></div><p class="pa-avert">' + esc(res.prop.avertissement || '') + ' Estimation sur le passé, trades supposés indépendants : pas une promesse.</p>'
    : (res.prop && !res.prop.ok ? '<p class="pa-avert">Simulation prop : ' + esc(res.prop.erreur) + '</p>' : '');
  return bloc('Résultat du test · ' + esc(rec ? rec.nom : ''), verdict + chiffres + '<h5>Par paire</h5>' + tableau + detail + comp + capital + prop
    + '<div class="pa-actions">' + ORDRE_PAIRES.filter(p => res.paires[p] && res.paires[p].ok).map(p => '<button type="button" class="pa-btn" data-a="ms-graphique" data-paire="' + p + '">Voir les signaux de ' + p + ' sur le graphique</button>').join('') + '</div>'
    + '<p class="pa-avert">Résultats passés sur la zone de recherche, frais Kraken déduits (réglables) ; aucun ordre, aucun conseil financier. Même « bat le hasard » ne vaut pas « VALIDÉE » : la validation du protocole (jeu final, critères inchangés) est un autre chemin.</p>', 'pa-large');
}
function sparkline(pts) {
  if (!pts || pts.length < 2) return '';
  const min = Math.min(...pts), max = Math.max(...pts), p = max - min || 1, w = 220, h = 44, d = pts.map((y, i) => (i ? 'L' : 'M') + (i / (pts.length - 1) * w).toFixed(1) + ' ' + (h - 3 - (y - min) / p * (h - 6)).toFixed(1)).join(' ');
  return '<svg class="pa-courbe" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="courbe de capital"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
}

/* ── préparation du test (paires, frais) ── */
export function vueTest(rec, { paires = ['BTC', 'SOL', 'DOGE'], couts = {}, disponibles = {}, enCours = '', variantesAvant = 0, apres = 0 } = {}) {
  if (!rec) return '';
  const cases = ORDRE_PAIRES.map(p => '<label class="pa-case"><input type="checkbox" data-ms-paire="' + p + '"' + (paires.includes(p) ? ' checked' : '') + (disponibles[p] === false ? ' disabled' : '') + '> ' + p + (disponibles[p] === false ? ' <small>(historique absent : active-la dans Système > Santé)</small>' : '') + '</label>').join('');
  const frais = ORDRE_PAIRES.map(p => { const c = couts[p]; return c ? '<li><b>' + p + '</b> : frais ' + nb(c.fraisPct, 3) + ' % par côté · spread ' + nb(c.spreadPct, 3) + ' % · glissement ' + nb(c.glissementPct, 3) + ' %</li>' : ''; }).join('');
  return bloc('Tester « ' + esc(rec.nom) + ' »',
    '<p class="pa-phrase">' + esc(decrireStrategie(rec.strategie).join(' ')) + '</p><fieldset><legend>Paires (testées séparément, puis groupées avec les mêmes paramètres)</legend>' + cases + '</fieldset>'
    + '<details><summary>Frais utilisés (Kraken, valeurs prudentes : à vérifier dans ton contrat)</summary><ul class="pa-liste">' + frais + '</ul><label class="pa-case pa-confirme"><input type="checkbox" data-ms="couts-confirme"> Je modifie les frais parce que ce sont les VRAIS frais de mon compte</label><div class="pa-actions pa-couts">' + ORDRE_PAIRES.map(p => '<label>' + p + ' frais %<input type="number" step="0.005" min="0" max="1" data-ms-cout="' + p + ':fraisPct" value="' + esc(couts[p] ? couts[p].fraisPct : '') + '"></label><label>spread %<input type="number" step="0.005" min="0" max="1" data-ms-cout="' + p + ':spreadPct" value="' + esc(couts[p] ? couts[p].spreadPct : '') + '"></label><label>glissement %<input type="number" step="0.005" min="0" max="1" data-ms-cout="' + p + ':glissementPct" value="' + esc(couts[p] ? couts[p].glissementPct : '') + '"></label>').join('') + '<button type="button" class="pa-btn" data-a="ms-couts">Appliquer</button></div><div class="pa-avert">Changer les frais après avoir vu un résultat est de la sur-optimisation : ne le fais que si ce sont les vrais frais.</div></details>'
    + '<p class="pa-avert">Ce test compte comme ' + (apres > variantesAvant ? 'une NOUVELLE variante (' + apres + ' au total dans cette lignée)' : 'un nouveau passage de la même règle : le compteur reste à ' + apres) + '. ' + esc(risqueSurajustement(apres).phrase) + '</p>'
    + '<div class="pa-actions"><button type="button" class="pa-btn pa-fort" data-a="ms-tester">' + (enCours ? esc(enCours) : 'Lancer le test (' + SEUILS_MS.tirages + ' tirages au hasard)') + '</button></div><div data-r="ms-progres" class="pa-avert"></div>', 'pa-large');
}

/* ── alertes et performance des positions proposées, stratégie par stratégie ── */
export function vueSuivi(liste, perf, alertesRecentes = []) {
  const actives = liste.filter(r => r.alertes.actif);
  if (!actives.length && !alertesRecentes.length) return bloc('Alertes de mes stratégies', '<p class="pa-vide">Aucune stratégie en alertes. Une stratégie testée et validée par toi peut être mise en alertes (jamais d’exécution automatique) : signaux d’entrée et de sortie dans Raylé, sur le graphique et par Telegram, avec leur raison et une étiquette de confiance honnête.</p>', 'pa-large');
  const t = actives.map(r => { const p = perf(r.id), conf = etiquetteConfiance({ dernierVerdict: r.dernierTest && r.dernierTest.cle === r.cle ? r.dernierTest.verdict : null, direct: p });
    return '<tr><td><b>' + esc(r.nom) + '</b></td><td><span class="pa-badge pa-' + (conf.code === 'confirmee' ? 'ok2' : conf.code === 'backtest' ? 'info' : 'warn') + '">' + esc(conf.etiquette) + '</span></td><td class="num">' + p.ouvertes + '</td><td class="num">' + p.n + '</td><td class="num">' + (p.esperance == null ? '—' : sgn(p.esperance) + ' R') + '</td><td class="num">' + pct(p.tauxReussite) + '</td></tr>'; }).join('');
  const al = alertesRecentes.slice(0, 6).map(a => '<li><b>' + esc(a.type) + '</b> · ' + esc(a.texte) + '</li>').join('');
  return bloc('Alertes de mes stratégies · performance des positions proposées (simulées, chaque stratégie à part)', (actives.length ? '<div class="pa-defile"><table class="pa-table pa-petit"><thead><tr><th>Stratégie</th><th>Confiance</th><th class="num">Ouvertes</th><th class="num">Clôturées</th><th class="num">R / trade</th><th class="num">Réussite</th></tr></thead><tbody>' + t + '</tbody></table></div>' : '')
    + (al ? '<h5>Dernières alertes</h5><ul class="pa-liste">' + al + '</ul>' : '') + '<p class="pa-avert">Positions simulées avec la logique d’exécution du backtest ; aucun ordre n’est passé. Une stratégie « NON VALIDÉE » reste étiquetée ainsi dans chaque alerte.</p>', 'pa-large');
}

export { validerStrategie, decrireCond };
