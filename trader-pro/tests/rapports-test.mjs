/* Tests des briques des rapports guidés (v11) : scénarios, épisodes COT, réaction aux annonces, corrélation, historique, comparaison, budget, exports. */
import { scenarios, episodesExtremes, reactionAnnonce, corrJours, listeNiveaux, creerRapport, fr } from '../rapports/construire.js';
import * as H from '../rapports/historique.js';
import { analyserCot } from '../marches/cot.js';
import { fauxAnalyse, fauxPro, fauxCot, fauxSrc } from './rapports-faux.mjs';
let ok = 0, ko = 0; const t = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H1 = 3600e3;
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

/* ───── scénarios ───── */
{
  const A = fauxAnalyse('or'), sc = scenarios(A, 'or');
  t(sc.disponible && sc.principal.sens === 1 && sc.alternatif.sens === -1 && sc.principal.confiance.niveau === 'fort', 'tout haussier : principal haussier, alternatif baissier, confiance forte');
  const p = sc.principal; t(p.declencheur.includes('PDH') && p.invalidation.prix < A.position.enDessous[0].prix && p.objectifs[0].prix === A.position.auDessus[1].prix, 'principal : déclencheur sur le premier niveau, invalidation sous le support, objectif au niveau suivant (prix tirés des niveaux mesurés)');
  const prixCites = [p, sc.alternatif].flatMap(s => [...s.objectifs.map(o => o.prix), s.invalidation && s.invalidation.prix]).filter(Boolean);
  const connus = new Set([...A.position.auDessus, ...A.position.enDessous].map(x => x.prix)); const marge = 0.5 * A.h4.atr;
  t(prixCites.every(x => connus.has(x) || [...connus].some(c => Math.abs(Math.abs(x - c) - marge) < 0.02)), 'chaque prix cité est un niveau mesuré (ou un niveau ± une demi-ATR)');
  const B = fauxAnalyse('or'); B.weekly.tendance = 'baissière'; B.daily.tendance = 'baissière'; B.h4.tendance = 'baissière'; B.daily.positionMa200 = 'sous';
  const sb = scenarios(B, 'or'); t(sb.principal.sens === -1 && sb.alternatif.sens === 1 && sb.principal.declencheur.includes('POC H4'), 'tout baissier : principal baissier');
  const C = fauxAnalyse('or'); C.weekly.tendance = 'haussière'; C.daily.tendance = 'baissière'; C.h4.tendance = 'neutre'; C.daily.positionMa200 = 'au-dessus';
  const sr = scenarios(C, 'or'); t(sr.principal.sens === 0 && /range/i.test(sr.principal.titre) && sr.principal.confiance.niveau === 'faible' && /partagés/.test(sr.principal.confiance.raison), 'signaux partagés : scénario de range, confiance faible justifiée');
  const D = fauxAnalyse('or'); D.daily.regime.type = 'range'; t(scenarios(D, 'or').principal.confiance.niveau === 'moyen' && /plafonnée/.test(scenarios(D, 'or').principal.confiance.raison), 'marché en range : confiance plafonnée à « moyen »');
  const E = fauxAnalyse('or'); E.position.auDessus = []; t(scenarios(E, 'or').disponible === false, 'sans niveau au-dessus : pas de scénario inventé');
  t(sc.principal.annotations.length >= 3 && sc.principal.annotations.every(a => Number.isFinite(a.prix) && a.type), 'annotations prêtes pour la couche Rayle');
}
{
  const A = fauxAnalyse('or'), z = A.position.enDessous[1]; A.position.enDessous.splice(2, 0, { ...z, niveau: 'FVG doublon' });   // deux niveaux au même prix
  const sb = scenarios({ ...A, weekly: { ...A.weekly, tendance: 'baissière' }, daily: { ...A.daily, tendance: 'baissière', positionMa200: 'sous' }, h4: { ...A.h4, tendance: 'baissière' } }, 'or');
  t(sb.principal.sens === -1 && new Set(sb.principal.objectifs.map(o => o.prix)).size === sb.principal.objectifs.length && sb.principal.objectifs.length === 2, 'objectifs sans doublon (deux niveaux au même prix = un seul objectif)');
}
/* ───── niveaux ───── */
t(listeNiveaux({ indisponible: 'x' }).length === 0 && listeNiveaux({ reperesIct: [{ nom: 'PDH', prix: 10 }, { nom: 'Ouverture jour', prix: 9 }], mesNiveauxTraces: 'illisibles' }).length === 1, 'niveaux : indisponible et dessins illisibles ne cassent rien ; l’ouverture du jour est écartée');
/* ───── épisodes COT et réaction aux annonces ───── */
{
  const a = analyserCot(fauxCot('OR', 200)), px = a.dates.map((_, i) => 100 + i), ep = episodesExtremes(a, px, 'haut');
  t(ep.length >= 1 && ep.every(e => e.index >= 80) && ep.some(e => e.apres != null && Math.abs(e.apres - (px[e.i + 8] / px[e.i] - 1) * 100) < 1e-9), 'épisodes COT : indice ≥ 80, variation du prix 8 semaines après calculée sur les vraies valeurs');
  t(episodesExtremes(a, null, 'bas').every(e => e.apres === null), 'sans prix : pas de variation inventée');
  const B = Array.from({ length: 40 }, (_, i) => ({ t: 1e12 + i * H1, o: 100, h: 101, l: 99, c: 100 + i * 0.1 })), r = reactionAnnonce(B, 1e12 + 10 * H1 + 5 * 60e3);
  t(r === +((B[12].c / B[9].c - 1) * 100).toFixed(2), 'réaction : clôture H1 avant l’annonce → clôture 2 h après (' + r + ')'); t(reactionAnnonce(B, 1e12 + 100 * H1) === null && reactionAnnonce([], 5) === null, 'réaction : annonce hors des données → null, jamais inventée');
  const J1 = fauxPro('or').j, J2 = fauxPro('us100').j; const c1 = corrJours(J1, J1, 60), c2 = corrJours(J1, J2, 60); t(c1 === 1 && c2 != null && c2 >= -1 && c2 <= 1, 'corrélation : 1 avec soi-même, bornée sinon (' + c2 + ')'); t(corrJours([], J1) === null, 'corrélation : séries vides → null');
}
/* ───── historique : stockage ───── */
{
  const st = mem(), mk = (i, extra = {}) => H.creerEntree({ type: 'complet', actif: 'or', titre: 'Rapport complet · Or', etapes: [{ id: 'scenarios', ok: true, segments: [{ texte: 'Scénarios. test' }], texte: 'Scénarios. test', caracteres: 15, scenarios: extra.scenarios || null, contexte: extra.contexte || {}, titre: 'Scénarios', carte: null }], caracteres: 15, maintenant: 1e12 + i * 86400e3 });
  for (let i = 0; i < 45; i++) H.enregistrer(st, mk(i)); t(H.lire(st).length === H.MAX_RAPPORTS, 'historique : limité à ' + H.MAX_RAPPORTS + ' rapports (les plus récents)');
  t(H.dernierDuMemeSujet(H.lire(st), { type: 'complet', actif: 'or' }, 1e12 + 44 * 86400e3).date === 1e12 + 43 * 86400e3 && H.dernierDuMemeSujet(H.lire(st), { type: 'cot', actif: 'or' }) === null, 'dernier rapport du même sujet (type et actif)');
  const plein = { getItem: () => '[]', setItem: () => { throw new Error('quota'); }, removeItem() {} }; t(H.enregistrer(plein, mk(1)) === null, 'stockage plein : échec signalé, pas d’exception');
  t(H.lire({ getItem: () => '{pas du json' }).length === 0, 'stockage corrompu : liste vide');
  H.vider(st); t(H.lire(st).length === 0, 'vidé');
}
/* ───── comparaison ───── */
{
  const mk = (prix, date, extra = {}) => ({ type: 'complet', actif: 'or', date, contexte: { prix, atr: 10, dec: 2, niveaux: [{ nom: 'PWL', prix: 3500 }, { nom: 'PDH', prix: 3620 }], ...extra.contexte }, scenarios: extra.scenarios || null });
  const sc = { principal: { titre: 'Scénario haussier', sens: 1, invalidation: { prix: 3540 } } }, J = 86400e3, t0 = 1e12;
  let c = H.comparer(mk(3600, t0, { scenarios: sc }), mk(3501, t0 + J));
  t(c.disponible && /Depuis hier, le prix est passé de 3 600 à 3 501/.test(c.phrase) && /a atteint le support PWL 3 500/.test(c.phrase), 'depuis hier, le prix a atteint le support — ' + c.phrase.slice(0, 200));
  t(/est invalidé/.test(c.phrase), 'scénario précédent invalidé quand son niveau est franchi');
  c = H.comparer(mk(3600, t0, { scenarios: sc }), mk(3615, t0 + J)); t(/tient/.test(c.phrase) && /a atteint la résistance PDH/.test(c.phrase) === false, 'scénario qui tient');
  c = H.comparer(mk(3600, t0), mk(3650, t0 + J)); t(/a franchi par le haut PDH 3 620/.test(c.phrase), 'franchissement d’une résistance');
  c = H.comparer(mk(3600, t0), mk(3480, t0 + J)); t(/a cassé par le bas PWL 3 500/.test(c.phrase), 'cassure d’un support');
  t(!H.comparer(null, mk(1, 1)).disponible && /Pas de rapport précédent/.test(H.comparer(null, mk(1, 1)).phrase), 'sans précédent : le dit');
  const cot = H.comparer({ type: 'cot', actif: 'or', date: t0, contexte: { indexSpec: 40, spec: 100000, dateMesure: '2026-11-10' } }, { type: 'cot', actif: 'or', date: t0 + 2 * J, contexte: { indexSpec: 40, spec: 100000, dateMesure: '2026-11-10' } }); t(/même rapport hebdomadaire/.test(cot.phrase), 'COT : « même rapport hebdomadaire » tant que la CFTC n’a pas publié');
  const mar = H.comparer({ type: 'marche', date: t0, contexte: { couleurs: { or: 'neutre', btc: 'baissier' }, climat: 'mitigé' } }, { type: 'marche', date: t0 + J, contexte: { couleurs: { or: 'haussier', btc: 'baissier' }, climat: 'risk-on' } }); t(/or est passé de neutre à haussier/.test(mar.phrase) && /climat est passé de mitigé à risk-on/.test(mar.phrase), 'marché : changements de couleur et de climat');
}
/* ───── budget ───── */
{
  const cm = { complet: 520 }, now = Date.UTC(2026, 10, 22), mois = '2026-11';
  t(H.estimerCaracteres('complet', 9, cm) === 4680, 'estimation = étapes × coût moyen');
  const b = H.phraseBudget(4680, { mois, n: 120000, limite: 490000 }, now); t(b.assez && b.azureReste === 380000 && /120 000 \/ 500 000/.test(b.texte) && b.pctApres === 24.9, 'budget : compteur du mois et reste — ' + b.texte);
  const b2 = H.phraseBudget(4680, { mois, n: 497000, limite: 490000 }, now); t(!b2.assez, 'budget : quota insuffisant signalé');
  const b3 = H.phraseBudget(4680, { mois: '2026-10', n: 499999 }, now); t(b3.azureUtilise === null && /pas encore lu/.test(b3.texte), 'compteur d’un autre mois ignoré');
  t(H.phraseBudget(100, null, now).assez === true, 'sans compteur : on ne bloque pas');
}
/* ───── exports ───── */
{
  const e = H.creerEntree({ type: 'complet', actif: 'or', titre: 'Rapport <complet> & "test"', etapes: [{ id: 'a', ok: true, titre: 'Étape <b>', texte: 'Texte <script>alert(1)</script>', caracteres: 30, carte: { lignes: [{ label: 'L', val: '3 500' }] }, donneesDu: '2026-11-22 10:00 UTC', segments: [{ texte: 'Texte' }] }, { id: 'b', ok: false, manque: 'cot absent', titre: 'COT', texte: 'COT : cot absent.', caracteres: 17, segments: [{ texte: 'x' }] }], caracteres: 47, maintenant: 1e12 });
  const html = H.versHtml(e, null), md = H.versMarkdown(e, { disponible: true, phrase: 'Depuis hier : x.' });
  t(!/<script>alert/.test(html) && /&lt;script&gt;/.test(html) && /&lt;complet&gt; &amp; &quot;test&quot;/.test(html), 'PDF/HTML : tout est échappé (aucune injection)');
  t(/3 500/.test(html) && /Données manquantes/.test(html) && /c’est toi qui décides/.test(html), 'PDF/HTML : valeurs, données manquantes, mention « aide à la décision »');
  t(/^# Rapport/.test(md) && /Depuis le rapport précédent/.test(md) && /\*\*L\*\* : 3 500/.test(md) && /cot absent/.test(md), 'Markdown : titre, comparaison, valeurs, manques');
}
/* ───── construction : types, étapes, textes ───── */
{
  const src = fauxSrc();
  t(creerRapport('complet', { actif: 'or' }, src).nbEtapes === 9 && creerRapport('cot', { actif: 'or' }, src).nbEtapes === 6 && creerRapport('marche', {}, src).nbEtapes === 13 && creerRapport('macro', {}, src).nbEtapes === 5, 'nombre d’étapes : 9, 6, 13, 5');
  let err = null; try { creerRapport('bidon', {}, src); } catch (e) { err = e; } t(!!err, 'type inconnu refusé');
  const R = creerRapport('complet', { actif: 'or' }, src), s = await R.etapes[1].faire();
  t(s.ok && s.cadrage.unite === 'J' && s.page.onglet === 'htf' && s.segments.some(x => x.montrer && x.montrer.some(m => m.type === 'bougie' && m.jours && m.jours.length === 2)), 'weekly : page HTF, cadrage Daily, bougies hebdomadaires repérées par leurs jours');
  const toutes = []; for (const e of R.etapes) toutes.push(await e.faire()); t(toutes.every(x => x.carte && x.carte.titre && x.segments.length && x.caracteres === x.texte.length && x.donneesDu !== undefined), 'chaque étape a une carte, du texte et une heure de données');
  t(toutes.every(x => !x.ok || /\d/.test(x.texte)), 'les étapes valides citent des chiffres');
  t(fr(3511.4, 0) === '3 511' && fr(null) === '—', 'format français sans espace insécable');
}
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `rapports : tout passe (${ok})`); process.exit(ko ? 1 : 0);
