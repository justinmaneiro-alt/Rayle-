/* ═════════════ « BANQUES ET ANALYSES » : FICHES DES SOURCES PUBLIQUES (V2, phase 7 ; module pur, testé : planetes/mars/tests/v2-analyses-test.mjs) ═════════════
   UNIQUEMENT des publications GRATUITES et PUBLIQUES de banques centrales, d'institutions et d'une banque qui publie ses analyses en accès libre (ING Think). Pour chaque source : nom, lien du site, flux, fréquence
   OBSERVÉE (sondage du 2026-10-27, docs/resultats-v2/sources-analyses.json), droits d'usage. On n'affiche que le TITRE, la DATE, un COURT EXTRAIT (≤ 220 caractères) et le LIEN vers l'original : jamais le texte complet,
   jamais de contournement d'un mur payant ou d'une protection anti-robots, jamais de scraping qui violerait des conditions d'utilisation.
   APERÇUS D'IMAGES : seulement pour une source dont les conditions l'autorisent EXPLICITEMENT (`apercuImages: true`), avec la source en légende. Aucune des sources actuelles n'est dans ce cas : la fonction est
   prête, éteinte. Analyses payantes des banques d'investissement (Goldman Sachs, J.P. Morgan, Morgan Stanley, BlackRock, Vanguard…) : AUCUN flux public (sondés : erreur 404) ; elles ne sont ni affichées ni simulées.
   Sources écartées : FMI (HTTP 403), OCDE (HTTP 403), Banque de France (404), Banque mondiale (404), VoxEU (404), Danske Bank / ABN AMRO (pas de flux), Saint-Louis « On the Economy » (pas de flux). */
export const DROITS = 'Contenu propriété de son éditeur : titre, date, court extrait et lien seulement ; pas de texte complet ; aucun mur payant contourné.';
export const FICHES = {
  fed_presse: { entite: 'Fed', type: 'banque centrale', site: 'https://www.federalreserve.gov/newsevents/pressreleases.htm', frequence: 'plusieurs par semaine', droits: 'Contenu du Board de la Fed : en principe domaine public sauf mention contraire ; ' + DROITS },
  fed_discours: { entite: 'Fed', type: 'banque centrale', site: 'https://www.federalreserve.gov/newsevents/speeches.htm', frequence: 'plusieurs par semaine', droits: 'Contenu du Board de la Fed : en principe domaine public sauf mention contraire ; ' + DROITS },
  fed_monetaire: { entite: 'Fed', type: 'banque centrale', site: 'https://www.federalreserve.gov/monetarypolicy.htm', frequence: 'à chaque réunion du FOMC (8 par an)', droits: 'Contenu du Board de la Fed : en principe domaine public sauf mention contraire ; ' + DROITS },
  bce_presse: { entite: 'BCE', type: 'banque centrale', site: 'https://www.ecb.europa.eu/press/', frequence: 'quotidienne', droits: 'La BCE autorise la reproduction avec mention de la source (hors images et contenus de tiers) ; ' + DROITS },
  bce_pubs: { entite: 'BCE', type: 'banque centrale', site: 'https://www.ecb.europa.eu/pub/', frequence: 'plusieurs par semaine', droits: 'La BCE autorise la reproduction avec mention de la source (hors images et contenus de tiers) ; ' + DROITS },
  bce_blog: { entite: 'BCE', type: 'banque centrale', site: 'https://www.ecb.europa.eu/press/blog/', frequence: 'environ une par semaine', droits: 'La BCE autorise la reproduction avec mention de la source (hors images et contenus de tiers) ; ' + DROITS },
  boe: { entite: 'BoE', type: 'banque centrale', site: 'https://www.bankofengland.co.uk/news', frequence: 'plusieurs par semaine', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  boj: { entite: 'BoJ', type: 'banque centrale', site: 'https://www.boj.or.jp/en/', frequence: 'quotidienne', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  fed_ny_liberty: { entite: 'Fed NY', type: 'banque centrale (analyse)', site: 'https://libertystreeteconomics.newyorkfed.org/', frequence: 'environ 2 par semaine', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  fed_feds_notes: { entite: 'Fed', type: 'banque centrale (analyse)', site: 'https://www.federalreserve.gov/econres/notes/feds-notes/default.htm', frequence: 'plusieurs par semaine', droits: 'Contenu du Board de la Fed : en principe domaine public sauf mention contraire ; ' + DROITS },
  fed_working_papers: { entite: 'Fed', type: 'banque centrale (analyse)', site: 'https://www.federalreserve.gov/econres/feds/index.htm', frequence: 'environ une par semaine', droits: 'Contenu du Board de la Fed : en principe domaine public sauf mention contraire ; ' + DROITS },
  fed_sf: { entite: 'Fed SF', type: 'banque centrale (analyse)', site: 'https://www.frbsf.org/economic-research/', frequence: 'environ une par semaine', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  fed_stl_blog: { entite: 'Fed StL', type: 'banque centrale (analyse)', site: 'https://fredblog.stlouisfed.org/', frequence: 'plusieurs par semaine', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  bundesbank: { entite: 'Bundesbank', type: 'banque centrale', site: 'https://www.bundesbank.de/en', frequence: 'quotidienne', droits: 'Conditions de réutilisation fixées par l’éditeur (à consulter sur son site) ; ' + DROITS },
  bri_pub: { entite: 'BRI', type: 'institution', site: 'https://www.bis.org/publ/', frequence: 'environ une par semaine', droits: 'La BRI autorise la reproduction avec mention de la source ; ' + DROITS },
  bri_discours: { entite: 'BRI', type: 'institution', site: 'https://www.bis.org/cbspeeches/', frequence: 'plusieurs par semaine', droits: 'La BRI autorise la reproduction avec mention de la source ; ' + DROITS },
  bri_recherche: { entite: 'BRI', type: 'institution', site: 'https://www.bis.org/publ/work_index.htm', frequence: 'environ une par semaine', droits: 'La BRI autorise la reproduction avec mention de la source ; ' + DROITS },
  ing_think: { entite: 'ING', type: 'banque', site: 'https://think.ing.com/', frequence: 'quotidienne', droits: 'Analyses en accès libre ; reproduction soumise aux conditions d’ING ; ' + DROITS }
};
export const TYPES = { 'banque centrale': 'BANQUE CENTRALE', 'banque centrale (analyse)': 'RECHERCHE DE BANQUE CENTRALE', institution: 'INSTITUTION', banque: 'BANQUE' };
export const fiche = id => FICHES[id] || null;
export const typeLisible = t => TYPES[t] || String(t || '').toUpperCase();
export const idsAnalyses = () => Object.keys(FICHES);

/* Filtre : entité (« Fed », « BCE »…) et/ou type. */
export function filtrerAnalyses(items, { entite = null, type = null } = {}) {
  return (items || []).filter(i => { const f = FICHES[i.sourceId]; if (!f) return false; return (!entite || f.entite === entite) && (!type || f.type === type || (type === 'banque centrale' && f.type === 'banque centrale (analyse)')); });
}
export const entitesDe = items => { const m = new Map(); for (const i of items || []) { const f = FICHES[i.sourceId]; if (f) m.set(f.entite, (m.get(f.entite) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => ({ entite: e, n })); };

/* Résumé court des publications récentes : lu par Raylé et par les agents comme CONTEXTE de leurs scénarios (jamais comme signal d'entrée). Seulement des faits : combien, qui, quels titres. */
export function resumerAnalyses(items, maintenant = Date.now(), { jours = 7, max = 4 } = {}) {
  const recents = (items || []).filter(i => FICHES[i.sourceId] && i.t && maintenant - i.t <= jours * 86400e3).sort((a, b) => b.t - a.t);
  if (!recents.length) return { n: 0, parEntite: [], texte: 'Aucune publication récente de banque centrale ou d’institution dans les ' + jours + ' derniers jours (ou sources indisponibles).' };
  const parEntite = entitesDe(recents), titres = recents.slice(0, max).map(i => FICHES[i.sourceId].entite + ' : « ' + i.titre.slice(0, 110) + ' »');
  return { n: recents.length, parEntite, titres, texte: 'Publications publiques des ' + jours + ' derniers jours : ' + recents.length + ' (' + parEntite.slice(0, 5).map(e => e.entite + ' ' + e.n).join(', ') + '). À la une : ' + titres.join(' ; ') + '. Titres dans la langue d’origine ; ce sont des informations de contexte, pas un signal.' };
}
/* Un aperçu d'image n'est affiché que si la source l'autorise explicitement ET que le flux en fournit une. */
export const apercuAutorise = (sourceId, item) => !!(FICHES[sourceId] && FICHES[sourceId].apercuImages === true && item && item.image && /^https:\/\//.test(item.image));
export const legendeImage = (sourceId, item) => 'Source : ' + (FICHES[sourceId] ? FICHES[sourceId].entite : '') + ' · ' + (item && item.url ? item.url : '');

/* Document Markdown des sources (généré). `sonde` = docs/resultats-v2/sources-analyses.json (facultatif). */
export function documentSources(registre, sonde = null) {
  const par = id => (sonde && sonde.resultats ? sonde.resultats.find(r => r.id === id) : null);
  const l = ['# Banques et analyses : sources publiques et gratuites', '', '_Fichier généré par `node planetes/mars/outils-agent/v2-generer-analyses-doc.mjs` (registre `flux-calcul.js` + fiches `analyses-calcul.js` + sondage réel `docs/resultats-v2/sources-analyses.json`). Ne pas modifier à la main._', '',
    'Panneau : **Mars → pile « Éco et macro » → « Banques et analyses »**. On affiche **titre, date, court extrait (≤ 220 caractères) et lien vers l\'original**, jamais le texte complet. Aucun mur payant ni protection anti-robots n\'est contourné. Aperçus d\'images : **désactivés** (aucune source ne les autorise explicitement ; la fonction est prête, avec la source en légende).', '',
    'Les flux passent par la route `/finance/brut` du Worker de Raylé (aucune de ces sources n\'autorise l\'appel direct depuis le navigateur : pas de CORS). **Les nouvelles sources sont ajoutées dans le Worker en local ; elles ne fonctionnent qu\'après `npx wrangler deploy` (voir `docs/deploiement-worker.md`)** ; tant que ce n\'est pas fait, le panneau affiche « INDISPONIBLE : source inconnue ».', '',
    '| Source | Type | Site | Fréquence (estimée) | Dernier élément au sondage | Droits d\'usage |', '|---|---|---|---|---|---|'];
  for (const f of registre) { const x = FICHES[f.id]; if (!x) continue; const s = par(f.id); l.push('| ' + f.nom + ' | ' + typeLisible(x.type) + ' | ' + x.site + ' | ' + x.frequence + ' | ' + (s && s.ok ? (s.joursDepuisDernier == null ? 'oui' : 'il y a ' + s.joursDepuisDernier + ' j') + ' · ' + s.nItems + ' éléments' : 'non sondé') + ' | ' + x.droits + ' |'); }
  l.push('', '## Sources écartées (sondées en vrai)', '', '| Source | Raison |', '|---|---|', '| FMI | HTTP 403 (accès automatisé refusé) |', '| OCDE | HTTP 403 (contrôle anti-robots) |', '| Banque de France | HTTP 404 (pas de flux à l\'adresse publique) |', '| Banque mondiale, VoxEU | HTTP 404 |', '| Danske Bank, ABN AMRO | pas de flux RSS reconnu |',
    '| Saint-Louis Fed « On the Economy » | pas de flux RSS reconnu (le FRED Blog du même établissement est utilisé) |', '| **Goldman Sachs, J.P. Morgan, BlackRock, Vanguard** | HTTP 404 : **aucun flux public** ; leurs analyses de recherche sont payantes ou réservées aux clients. Elles ne sont ni affichées ni simulées. |', '');
  return l.join('\n');
}
