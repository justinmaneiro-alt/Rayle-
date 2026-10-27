import { CRITERES, empreinteCriteres } from './criteres.js';
import { construireContexte } from './contexte.js';
import { alignerDeriv } from './micro-mesures.js';
import { FAMILLES, ORDRE_FAMILLES, cleParams, combinaisons } from './hypotheses.js';
import { decouper, evaluerVariante, jugerHorsEchantillon, jugerJeuFinal, monteCarlo, robustesse, score, statsSur, walkForward } from './evaluation.js';
import { simuler, statistiques } from './moteur.js';

/* ═════════════ BOUCLE D'ADAPTATION (M3b ; module pur, testé : agent-backtest-test.mjs) ═════════════
   Une recherche = plusieurs GÉNÉRATIONS. À chaque génération, chaque famille d'hypothèses est évaluée sur la zone de recherche (grille complète), puis :
   - GARDER   : elle passe tous les critères hors échantillon (walk-forward), la robustesse des voisins et Monte Carlo → candidate ;
   - AJUSTER  : elle est prometteuse mais échoue de peu → on affine sa grille (une seule fois par génération) et on réévalue ;
   - SUPPRIMER: espérance trop faible ou critères non tenus → écartée pour cette génération (la raison est écrite) ;
   - RECOMMENCER : aucune candidate → génération suivante avec des grilles élargies par des filtres (séance, confirmation du delta).
   Si une candidate existe, le JEU FINAL est ouvert UNE seule fois pour la meilleure, avec ses paramètres figés. Sinon, après la dernière génération : « aucune stratégie robuste trouvée ».
   Tout est par règles (zéro IA, zéro jeton). Le compteur de variantes testées (cumulé, persistant) alimente la correction des comparaisons multiples. La boucle cède la main régulièrement (`cede`) :
   exécutée dans un Worker de navigateur, elle ne ralentit pas l'interface ; le budget (variantes, temps) est réglable. */
const decisions = ['garder', 'ajuster', 'supprimer', 'recommencer'];
const sansWf = c => { const { wf, ...reste } = c; return reste; };

/* Grille affinée autour d'un jeu de paramètres : pour chaque paramètre numérique de la grille, la valeur, et les milieux avec ses voisins. */
export function grilleFine(famille, params, gen = 0) {
  const grille = FAMILLES[famille].grille(gen), fine = {};
  for (const k of Object.keys(grille)) {
    const vals = grille[k], i = vals.indexOf(params[k]);
    if (i < 0 || typeof params[k] !== 'number' || (vals.length === 2 && vals[0] === 0 && vals[1] === 1)) { fine[k] = [params[k]]; continue; }   // les interrupteurs (0 / 1) ne s'affinent pas
    const out = [params[k]]; if (i > 0) out.push(+((vals[i - 1] + params[k]) / 2).toFixed(4)); if (i < vals.length - 1) out.push(+((vals[i + 1] + params[k]) / 2).toFixed(4));
    fine[k] = out.sort((a, b) => a - b);
  }
  return fine;
}
const compact = st => st && ({ n: st.n, esperance: st.esperance, factProfit: st.factProfit, tauxReussite: st.tauxReussite, ddR: st.ddR, Rtotal: st.Rtotal, parSemaine: st.parSemaine, ddPct: st.ddPct, rendementPct: st.rendementPct });
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));

/* Dernier jeu final déjà ouvert (brûlé) : la recherche et le walk-forward peuvent alors utiliser tout ce qui précède, et le NOUVEAU jeu final est tout ce qui suit (si ≥ 6 mois). */
export function decouperAvecCoffre(m15, coffre, cr = CRITERES) {
  const brules = (coffre && coffre.ouverts) || [], dernier = brules.length ? brules[brules.length - 1] : null;
  if (!dernier) return decouper(m15, cr.decoupage);
  const n = m15.n, tB = dernier.fin; let idx = 0; while (idx < n && m15.t[idx] < tB) idx++;
  const moisFrais = (m15.t[n - 1] + 900e3 - tB) / (30.4375 * 86400e3), d = decouper({ ...m15, n: idx, t: m15.t.subarray(0, idx) }, { ...cr.decoupage, fractionRecherche: 1 });
  if (!d.ok) return d;
  const minFinal = 6;
  if (moisFrais < minFinal) return { ...d, n, finA: idx, jeuFinal: null, moisFinal: moisFrais, attente: { jusquau: tB + minFinal * 30.4375 * 86400e3, moisFrais }, brule: dernier };
  return { ...d, n, finA: idx, jeuFinal: [idx, n], moisFinal: moisFrais, debutFinal: tB, brule: dernier };
}

export async function rechercher({ m15, config = {}, budget = {}, coffre = { ouverts: [] }, criteres = CRITERES, nVarianteDepart = 0, surEvenement = () => {}, cede = () => Promise.resolve(), arret = () => false, maintenant = () => Date.now(), generationsMax = 2, familles = ORDRE_FAMILLES, derivBrut = null } = {}) {
  const cr = criteres, t0 = maintenant(), bud = { variantesMax: 20000, tempsMs: 180000, ...budget };
  let N = nVarianteDepart, idJournal = 0, interrompu = false;
  const journal = [], entree = e => { const x = { id: ++idJournal, t: maintenant(), ...e }; journal.push(x); surEvenement({ type: 'journal', entree: x }); return x; };
  const progres = (phase, extra = {}) => surEvenement({ type: 'progres', phase, N, ...extra });
  const depasse = () => { if (arret()) { interrompu = 'arrêt demandé'; return true; } if (N - nVarianteDepart >= bud.variantesMax) { interrompu = 'budget de variantes atteint'; return true; } if (maintenant() - t0 > bud.tempsMs) { interrompu = 'budget de temps atteint'; return true; } return false; };
  const fin = (verdict) => { const v = { ...verdict, nVariantes: N, nVariantesCetteRecherche: N - nVarianteDepart, journalTaille: journal.length, criteres: { version: cr.version, empreinte: empreinteCriteres(cr) }, finiLe: maintenant(), dureeMs: maintenant() - t0, config: { ...config }, coffre: verdict.coffre || coffre }; surEvenement({ type: 'fin', verdict: v }); return v; };

  const dec = decouperAvecCoffre(m15, coffre, cr);
  entree({ etape: 'debut', decision: null, pourquoi: 'Critères d’acceptation version ' + cr.version + ' (empreinte ' + empreinteCriteres(cr) + ', figés le ' + cr.figesLe + ') écrits AVANT les tests. ' + N + ' variantes déjà testées au total.', criteres: { version: cr.version, empreinte: empreinteCriteres(cr) } });
  if (!dec.ok) { entree({ etape: 'refus', decision: null, pourquoi: dec.raison }); return fin({ etat: 'refus_historique', strategie: null, candidats: [], resume: dec.raison, journal }); }
  const ctx = construireContexte(m15, { deriv: derivBrut ? alignerDeriv(m15.t, derivBrut) : null }), zone = { de: 0, a: dec.finA };
  entree({ etape: 'decoupage', decision: null, pourquoi: 'Zone de recherche et walk-forward : ' + fmt(dec.moisZoneA, 1) + ' mois (' + dec.folds.length + ' blocs de test hors échantillon). Jeu final : ' + (dec.jeuFinal ? fmt(dec.moisFinal, 1) + ' mois, intouché' + (dec.brule ? ' (nouveau jeu : le précédent a été ouvert le ' + new Date(dec.brule.ouvertLe).toISOString().slice(0, 10) + ')' : '') : 'indisponible : ' + (dec.attente ? 'le précédent a été ouvert ; il faut 6 mois de données fraîches (disponible vers le ' + new Date(dec.attente.jusquau).toISOString().slice(0, 10) + ')' : '—')) + '.', decoupage: { moisZoneA: dec.moisZoneA, moisFinal: dec.moisFinal, blocs: dec.folds.length } });

  const candidats = [], rejetees = [];
  for (let gen = 0; gen < generationsMax && !interrompu; gen++) {
    if (gen > 0) entree({ etape: 'generation', generation: gen, decision: 'recommencer', pourquoi: 'Aucune candidate à la génération ' + (gen - 1) + ' : on recommence avec des grilles élargies par des filtres (séance européenne / américaine, confirmation du delta). Chaque variante de plus durcit le seuil des comparaisons multiples.' });
    for (const fam of familles) {
      if (depasse()) break;
      const F = FAMILLES[fam], grille = combinaisons(F.grille(gen)); let lignes = [];
      progres('evaluation', { generation: gen, famille: fam, fait: 0, total: grille.length });
      for (let k = 0; k < grille.length; k++) {
        if (depasse()) break;
        lignes.push(evaluerVariante(ctx, fam, grille[k], config, zone)); N++;
        if (k % 20 === 19) { progres('evaluation', { generation: gen, famille: fam, fait: k + 1, total: grille.length }); await cede(); }
      }
      if (interrompu) break;
      const traiter = async (lignesFam, apresAjustement) => {
        const classees = lignesFam.map(l => ({ l, sc: score(l.stats, cr.recherche.tradesMin) })).filter(x => x.sc > -Infinity).sort((a, b) => b.sc - a.sc), meilleur = classees[0] && classees[0].l;
        const r = cr.recherche;
        if (!meilleur) return { decision: 'supprimer', pourquoi: 'Aucune variante n’atteint ' + r.tradesMin + ' trades sur la zone de recherche (' + lignesFam.length + ' testées) : l’idée est trop rare ou trop restrictive.' };
        const sM = meilleur.stats;
        if (sM.esperance < r.esperanceMin || (sM.factProfit != null && sM.factProfit < r.factProfitMin)) return { decision: 'supprimer', pourquoi: 'Même la meilleure variante (' + cleParams(meilleur.params) + ') n’a pas d’avantage net sur la zone de recherche : espérance ' + fmt(sM.esperance) + ' R, facteur de profit ' + fmt(sM.factProfit) + ' sur ' + sM.n + ' trades (seuils : ≥ ' + r.esperanceMin + ' R et ≥ ' + r.factProfitMin + ').', meilleur: compact(sM) };
        const wf = walkForward(lignesFam, dec, config, cr);
        const mc = monteCarlo(wf.trades, { simulations: cr.monteCarlo.simulations }), rob = robustesse(ctx, fam, meilleur.params, config, zone, gen, cr.robustesse);
        const juge = jugerHorsEchantillon(wf, { nVariantes: N, mc, robuste: rob, c: cr });
        const echecs = juge.lignes.filter(x => !x.ok).map(x => x.critere + ' (' + (x.valeur == null ? '—' : fmt(x.valeur)) + x.unite + ', seuil ' + x.seuil + ')');
        const base = { meilleur: { params: meilleur.params, zoneA: compact(sM) }, horsEchantillon: { ...compact(wf.stats), courbeR: Array.from(wf.stats.courbeR || []) }, juge, mc, robustesse: { partPositive: rob.partPositive, mediane: rob.mediane, centre: rob.centre, testables: rob.testables }, blocs: wf.blocs.map(b => ({ debut: b.debut, fin: b.fin, params: b.params, test: compact(b.test) })), wf };
        if (juge.ok) return { decision: 'garder', pourquoi: 'Tous les critères hors échantillon sont tenus : ' + wf.stats.n + ' trades, espérance ' + fmt(wf.stats.esperance) + ' R, facteur de profit ' + fmt(wf.stats.factProfit) + ', creux ' + fmt(wf.stats.ddR, 1) + ' R, robuste aux voisins.', ...base };
        const prometteuse = wf.stats.esperance != null && wf.stats.esperance > 0 && wf.stats.n >= 25;
        if (prometteuse && !apresAjustement) return { decision: 'ajuster', pourquoi: 'Espérance hors échantillon positive (' + fmt(wf.stats.esperance) + ' R sur ' + wf.stats.n + ' trades) mais critères non tenus : ' + echecs.join(' ; ') + '. On affine la grille autour de ' + cleParams(meilleur.params) + ' (une seule fois).', ...base };
        return { decision: 'supprimer', pourquoi: (wf.stats.n ? 'Hors échantillon : ' + wf.stats.n + ' trades, espérance ' + fmt(wf.stats.esperance) + ' R, facteur de profit ' + fmt(wf.stats.factProfit) + '. ' : '') + 'Critères non tenus : ' + echecs.join(' ; ') + '.', ...base };
      };
      let res = await traiter(lignes, false);
      const ecrire = (r, extra = {}) => entree({ etape: 'famille', generation: gen, famille: fam, nom: F.nom, params: r.meilleur && r.meilleur.params || null, resultats: { zoneA: r.meilleur && r.meilleur.zoneA || r.meilleur || null, horsEchantillon: r.horsEchantillon ? { ...r.horsEchantillon, courbeR: undefined } : null, mc: r.mc || null, robustesse: r.robustesse || null, blocs: r.blocs || null, criteres: r.juge ? r.juge.lignes : null }, decision: r.decision, pourquoi: r.pourquoi, variantes: lignes.length, ...extra });
      if (res.decision === 'ajuster') {
        ecrire(res);
        const fine = combinaisons(grilleFine(fam, res.meilleur.params, gen)), cles = new Set(lignes.map(l => cleParams(l.params))), nouveaux = fine.filter(p => !cles.has(cleParams(p)));
        for (const p of nouveaux) { if (depasse()) break; lignes.push(evaluerVariante(ctx, fam, p, config, zone)); N++; }
        await cede();
        if (!interrompu) { res = await traiter(lignes, true); ecrire(res, { apresAjustement: true, variantesAffinees: nouveaux.length }); }
      } else ecrire(res);
      if (interrompu) break;
      if (res.decision === 'garder') candidats.push({ famille: fam, generation: gen, params: res.meilleur.params, horsEchantillon: res.horsEchantillon, juge: res.juge, mc: res.mc, robustesse: res.robustesse, zoneA: res.meilleur.zoneA, wf: res.wf });
      else rejetees.push({ famille: fam, generation: gen, raison: res.pourquoi });
    }
    if (candidats.length) break;
  }
  if (interrompu) { entree({ etape: 'interruption', decision: null, pourquoi: 'Recherche interrompue : ' + interrompu + '. Rien n’est validé.' }); return fin({ etat: 'interrompue', strategie: null, candidats: [], resume: 'Recherche interrompue (' + interrompu + ') : aucune stratégie validée.', journal }); }
  if (!candidats.length) {
    const resume = 'Aucune stratégie robuste trouvée : ' + N + ' variantes testées sur ' + rejetees.length + ' évaluations de familles, aucune ne tient les critères hors échantillon. Le jeu final n’a pas été ouvert.';
    entree({ etape: 'conclusion', decision: 'recommencer', pourquoi: resume + ' Le marché Bitcoin en M15 ne montre pas, avec ces idées, d’avantage net de frais qui survive hors échantillon : c’est un résultat, pas un échec à cacher.' });
    return fin({ etat: 'aucune', strategie: null, candidats: [], resume, rejetees, journal });
  }
  // meilleure candidate : espérance hors échantillon la plus haute
  candidats.sort((a, b) => b.horsEchantillon.esperance - a.horsEchantillon.esperance); const best = candidats[0];
  if (!dec.jeuFinal) {
    const resume = 'Candidate trouvée (' + FAMILLES[best.famille].nom + ', ' + cleParams(best.params) + ') mais le jeu final est indisponible' + (dec.attente ? ' avant le ' + new Date(dec.attente.jusquau).toISOString().slice(0, 10) : '') + ' : aucune validation, aucune alerte d’entrée.';
    entree({ etape: 'attente', famille: best.famille, params: best.params, decision: 'garder', pourquoi: resume });
    return fin({ etat: 'attente_jeu_final', strategie: { ...sansWf(best), nom: FAMILLES[best.famille].nom }, candidats: candidats.map(sansWf), resume, journal });
  }
  // OUVERTURE UNIQUE du jeu final
  const ouv = { debut: m15.t[dec.jeuFinal[0]], fin: m15.t[m15.n - 1] + 900e3, ouvertLe: maintenant(), famille: best.famille, params: best.params };
  const sig = FAMILLES[best.famille].signaux(ctx, best.params), sim = simuler(m15, sig, config, { de: dec.jeuFinal[0], a: dec.jeuFinal[1] });
  const stFinal = statistiques(sim.trades, { barres: dec.jeuFinal[1] - dec.jeuFinal[0], risquePct: sim.config.risquePct }), jf = jugerJeuFinal(stFinal, cr.jeuFinal);
  const coffreApres = { ouverts: [...coffre.ouverts, { ...ouv, verdict: jf.ok ? 'validee' : 'rejetee', stats: compact(stFinal) }] };
  entree({ etape: 'jeu_final', famille: best.famille, params: best.params, resultats: { jeuFinal: compact(stFinal), criteres: jf.lignes }, decision: jf.ok ? 'garder' : 'supprimer', pourquoi: 'Jeu final ouvert UNE seule fois (' + new Date(ouv.debut).toISOString().slice(0, 10) + ' → ' + new Date(ouv.fin).toISOString().slice(0, 10) + ') : ' + stFinal.n + ' trades, espérance ' + fmt(stFinal.esperance) + ' R, facteur de profit ' + fmt(stFinal.factProfit) + ', creux ' + fmt(stFinal.ddR, 1) + ' R. ' + (jf.ok ? 'Critères tenus : stratégie VALIDÉE.' : 'Critères non tenus : stratégie REJETÉE, et ce jeu final est désormais brûlé.') });
  const strategie = { famille: best.famille, nom: FAMILLES[best.famille].nom, description: FAMILLES[best.famille].description, params: best.params, generation: best.generation, horsEchantillon: best.horsEchantillon, juge: best.juge, mc: best.mc, robustesse: best.robustesse, zoneA: best.zoneA, jeuFinal: { stats: compact(stFinal), juge: jf, debut: ouv.debut, fin: ouv.fin }, tradesFinal: sim.trades };
  const v = fin({ etat: jf.ok ? 'validee' : 'rejetee', strategie, candidats: candidats.map(c => ({ famille: c.famille, params: c.params, esperance: c.horsEchantillon.esperance })), resume: jf.ok ? 'Stratégie validée : ' + strategie.nom + ' (' + cleParams(best.params) + ').' : 'Candidate rejetée sur le jeu final : ' + strategie.nom + '. Aucune alerte d’entrée.', journal, coffre: coffreApres });
  return v;
}
export { decisions };
