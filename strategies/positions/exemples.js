import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { decouper } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { simulerRiche } from '../simulateur-riche.js';
import { simulerProp } from '../stats-v3.js';
import { evaluerNiveau, CRITERES4, periodes } from '../criteres-v4.js';
import { FAMILLES_V7, ORDRE_V7, parametresDefaut, AGENTS } from './agents.js';
import { signauxLibres } from './libre.js';
import { vue, elementsVue, confluence } from './zones.js';
import { doubler, resumerTrades, walkForwardBlocs, fr } from './preuves.js';

/* ═════════════ « ICI J'AURAIS PRIS ÇA » : LES EXEMPLES DE JUSTIN (V7, phase 4.5 ; module pur, testé : galaxie/tests/positions-exemples-test.mjs) ═════════════
   Justin marque sur le graphique une position qu'il aurait prise (entrée, stop, cible) ou qu'il n'aurait PAS prise. Kepler :
   1. regarde si un de ses agents l'avait proposée (même sens, entrée proche, à ± 8 bougies) ;
   2. sinon, dit pourquoi pas (aucun déclencheur, confluence insuffisante, rapport gain / risque insuffisant) et note ce qu'il aurait fallu voir ;
   3. en tire une HYPOTHÈSE (éléments de confluence présents, régime, sens) qui ira dans le journal des occasions manquées ;
   4. la fait TESTER sur des données qu'elle n'a pas vues (autres périodes, autres actifs, jamais les fenêtres des exemples ni le jeu final) ; le résultat porte son niveau de preuve comme tout le reste.
   GARDE-FOU : un exemple ne VALIDE jamais rien ; il ne sert qu'à imaginer des idées, qui doivent ensuite gagner sur des données qu'elles n'ont pas vues. */
export const GARDE_FOU_EXEMPLES = 'Un exemple ne valide jamais rien : il sert à imaginer des hypothèses, qui sont ensuite testées sur des données qu’elles n’ont pas vues (autres périodes, autres actifs).';
const FENETRE = 8, TOLERANCE_ATR = 0.6, EXCLUSION_JOURS = 5;
const idxAvant = (m15, t) => { let lo = 0, hi = m15.n - 1; if (!(m15.t[0] <= t)) return -1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m15.t[k] <= t) lo = k; else hi = k - 1; } return lo; };
const sensDe = ex => (ex.sens === 'vente' || ex.sens === -1 ? -1 : 1);

export function exempleValide(ex) {
  const e = []; if (!ex || typeof ex !== 'object') return ['exemple vide'];
  if (!['achat', 'vente'].includes(ex.sens)) e.push('sens : achat ou vente');
  if (!['bon', 'mauvais'].includes(ex.avis)) e.push('avis : bon ou mauvais');
  for (const k of ['t', 'entree']) if (!Number.isFinite(ex[k])) e.push(k + ' manquant');
  if (ex.avis === 'bon') for (const k of ['stop', 'cible']) if (!Number.isFinite(ex[k])) e.push(k + ' manquant');
  if (Number.isFinite(ex.stop) && Number.isFinite(ex.entree)) { const d = sensDe(ex); if (!(d * (ex.entree - ex.stop) > 0)) e.push('le stop doit être du côté perdant'); if (Number.isFinite(ex.cible) && !(d * (ex.cible - ex.entree) > 0)) e.push('la cible doit être du côté gagnant'); }
  return e;
}

/* Analyse UN exemple sur les bougies de l'actif. Rend { statut: 'retrouvee' | 'refusee' | 'manquee' | 'bien_ecarte' | 'mal_propose' | 'hors_donnees', par, pourquoi, caracteristiques }. */
export function analyserExemple(m15, ex, { reglages = {} } = {}) {
  const d = sensDe(ex), i = idxAvant(m15, ex.t); if (i < 1500) return { statut: 'hors_donnees', pourquoi: 'moment hors des données disponibles (ou trop près du début)' };
  const deb = Math.max(0, i - 9000), fin = Math.min(m15.n, i + FENETRE + 6), sub = tranche(m15, deb, fin), ctx = construireContexte(sub), j = i - deb, tf = ex.tf === 'H1' ? 'H1' : 'M15';
  const V = vue(ctx, tf), k = V.k(j), E = elementsVue(ctx, tf), at = V.atr[k], tol = TOLERANCE_ATR * at, par = [], refus = [];
  for (const id of ORDRE_V7) {
    const fam = FAMILLES_V7[id], sig = fam.signaux(ctx, { ...parametresDefaut(id), conf: reglages.confluenceMin || 2 });
    for (let q = Math.max(0, j - FENETRE); q <= Math.min(ctx.n - 1, j + FENETRE); q++) { const m = sig.meta.get(q); if (sig.sens[q] === d && m && Math.abs(m.limite - ex.entree) <= tol) { par.push({ famille: id, agent: fam.agent, type: m.type, limite: m.limite }); break; } }
    const h = ctx.cache.get('pos:hyp:' + fam.tf) || [];
    for (const x of h) if (x.i >= j - FENETRE && x.i <= j + FENETRE && x.d === d && Math.abs(x.limite - ex.entree) <= 2 * tol) refus.push({ famille: id, agent: fam.agent, type: x.type, raison: x.raison, confluenceN: x.confluence.n, meilleurRR: x.meilleurRR });
  }
  const conf = confluence(ctx, tf, j, k, ex.entree, d, {}), atrs = at > 0 && Number.isFinite(ex.stop) ? Math.abs(ex.entree - ex.stop) / at : null;
  const rr = Number.isFinite(ex.stop) && Number.isFinite(ex.cible) ? Math.abs(ex.cible - ex.entree) / Math.abs(ex.entree - ex.stop) : null, ph = ctx.h1.phase[j], heure = new Date(ex.t).getUTCHours();
  const caracteristiques = { tf, regime: ph === 1 ? 'hausse' : ph === 2 ? 'baisse' : ph === 3 ? 'range' : 'transition', session: heure < 8 ? 'Asie' : heure < 13 ? 'Europe' : 'États-Unis', elements: conf.elements.map(e => e.cle), textes: conf.elements.map(e => e.texte), score: conf.score, diamant: conf.diamant, stopEnATR: atrs, rr,
    niveauxProches: [E.pdl[k], E.pdh[k], ctx.h1.poc[j], E.vwap[k]].filter(Number.isFinite).map(x => +x.toFixed(2)) };
  if (ex.avis === 'mauvais') {
    return par.length ? { statut: 'mal_propose', par, caracteristiques, pourquoi: 'Tu n’aurais pas pris cette position et un de mes agents l’avait proposée (' + par.map(p => p.agent).join(', ') + ') : je note le cas comme un contre-exemple à étudier.' }
      : { statut: 'bien_ecarte', par, caracteristiques, pourquoi: 'Je ne l’avais pas proposée non plus : d’accord avec toi.' };
  }
  if (par.length) return { statut: 'retrouvee', par, caracteristiques, pourquoi: 'Je l’avais proposée (' + par.map(p => p.agent + ' : ' + p.type).join(' ; ') + ').' };
  let pourquoi, statut = 'manquee';
  if (refus.length) { const r = refus[0]; statut = 'refusee'; pourquoi = 'Un de mes agents (' + r.agent + ') avait vu quelque chose mais l’a écarté : ' + (r.raison === 'confluence' ? 'seulement ' + r.confluenceN + ' élément(s) de confluence, il en faut ' + (reglages.confluenceMin || 2) : 'rapport gain / risque atteignable de ' + fr(r.meilleurRR, 1) + ', il en faut 1,5') + '.'; }
  else pourquoi = 'Aucun de mes agents n’avait de déclencheur à cet endroit (ni balayage, ni absorption, ni repli sur la valeur, ni cascade, ni bord de range).';
  const fallu = conf.elements.length ? 'Ce qu’il aurait fallu voir avant : ' + caracteristiques.textes.join(', ') + (caracteristiques.regime ? ' ; régime ' + caracteristiques.regime : '') + '.' : 'Rien de structuré n’était visible à ce niveau : ton entrée vient peut-être d’une lecture que je ne sais pas encore faire.';
  return { statut, par, refus, caracteristiques, pourquoi: pourquoi + ' ' + fallu };
}

/* Hypothèse tirée d'un exemple raté : les éléments de confluence présents (les 3 plus lourds), le régime et le sens. Ne vaut RIEN tant qu'elle n'est pas testée sur d'autres données. */
export function hypotheseDepuisExemple(ex, analyse, { maintenant = Date.now(), id = null } = {}) {
  if (!analyse || !analyse.caracteristiques || (analyse.statut !== 'manquee' && analyse.statut !== 'refusee')) return null;
  const c = analyse.caracteristiques, elements = c.elements.slice(0, 3);
  return { id: id || 'hyp-' + ex.actif + '-' + ex.t, source: 'exemple', exemple: { actif: ex.actif, t: ex.t }, titre: (sensDe(ex) > 0 ? 'achat' : 'vente') + ' avec ' + (elements.join(' + ') || 'structure') + (c.regime && c.regime !== 'transition' ? ' en ' + c.regime : ''),
    tf: c.tf, sens: sensDe(ex), elementsRequis: elements, regime: c.regime === 'transition' ? null : c.regime, rrMin: 1.5, statut: 'a_tester', creeLe: maintenant, garde: GARDE_FOU_EXEMPLES, resultat: null };
}

/* Teste une hypothèse sur des données qu'elle n'a PAS vues : `jeux` = [{ actif, m15, exclure: [t,…] }] ; on ne lit que la zone de recherche, on écarte les trades à ± 5 jours des exemples de l'hypothèse.
   Rend le niveau de preuve et les chiffres (le test compte pour un essai de plus : `variantesAvant`). */
export function testerHypothese(jeux, hyp, { config = {}, c4 = CRITERES4, variantesAvant = 0, risquePct = 0.5 } = {}) {
  const tous = [], tous2 = []; let mois = 0;
  for (const j of jeux) {
    const dec = decouper(j.m15); if (!dec.ok) continue;
    const zone = tranche(j.m15, 0, dec.finA), ctx = construireContexte(zone), sig = signauxLibres(ctx, hyp), sim = simulerRiche(ctx.m15, sig, config, {}), sim2 = simulerRiche(ctx.m15, sig, doubler(config), {});
    const ecarte = t => (j.exclure || []).some(e => Math.abs(t - e) < EXCLUSION_JOURS * 86400e3); mois += dec.moisZoneA;
    for (const t of sim.trades) if (!ecarte(t.t)) tous.push({ ...t, actif: j.actif });
    for (const t of sim2.trades) if (!ecarte(t.t)) tous2.push(t);
  }
  const R = tous.map(x => x.R), resume = resumerTrades(tous), prop = simulerProp(tous, { risquePct, drawdownMaxPct: 6, perteJourMaxPct: 3 });
  const t0 = tous.length ? Math.min(...tous.map(x => x.t)) : 0, t1 = tous.length ? Math.max(...tous.map(x => x.tSortie)) : 1, wf = tous.length ? walkForwardBlocs(tous, t0, t1, 4) : { positif: false };
  const ev = evaluerNiveau({ R, nVariantes: variantesAvant + 1, nEffectif: variantesAvant + 1, periodes: periodes(tous, 2), esperanceFraisDoubles: tous2.length ? tous2.reduce((a, x) => a + x.R, 0) / tous2.length : null, auditeur: { fait: false }, walkForwardPositif: R.length ? wf.positif : null, ddPct: prop.ddPct, pireJourPct: prop.pireJourPct }, { version: 'equilibre', c4 });
  return { testeeLe: Date.now(), actifs: jeux.map(j => j.actif), moisAnalyses: mois, n: R.length, esperance: resume.esperance, tauxReussite: resume.tauxReussite, rrMoyen: resume.rrMoyen, niveau: ev.niveau, pourquoi: ev.pourquoi, versionCriteres: ev.versionTexte, jeuFinalLu: false, garde: GARDE_FOU_EXEMPLES };
}

/* Résumé en une phrase de tous les exemples. */
export function resumeExemplesV7(exemples) {
  if (!exemples.length) return 'Aucun exemple marqué. Marque sur le graphique « ici j’aurais pris ça » ou « ici ce n’était pas bon » : j’en tire des hypothèses.';
  const c = s => exemples.filter(e => e.analyse && e.analyse.statut === s).length;
  return exemples.length + ' exemple(s) : ' + c('retrouvee') + ' déjà proposé(s) par mes agents, ' + (c('manquee') + c('refusee')) + ' manqué(s) (devenus des hypothèses à tester), ' + c('bien_ecarte') + ' bien écarté(s), ' + c('mal_propose') + ' mal proposé(s). ' + GARDE_FOU_EXEMPLES;
}
export { AGENTS };
