import { absorptionVec, divergenceVec, balayagesVec, attacherFluxBougies } from './liquidite/contexte-flux.js';
import { FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { famille } from './familles-v3.js';

/* ═════════════ AUTONOMIE ET APPRENTISSAGE (V4, phase 8 ; module pur, testé : galaxie/tests/autonomie-test.mjs) ═════════════
   1. JOURNAL DES OCCASIONS MANQUÉES : chaque grosse impulsion (≥ N × ATR) que Kepler n'a pas prise, avec le contexte connu AVANT elle (flux, liquidité, régime). Il sert à GÉNÉRER des hypothèses, JAMAIS à
      valider : une idée tirée du passé doit être retestée sur des données qu'elle n'a pas vues (le jeu final et le walk-forward ne sont pas touchés par ce journal).
   2. EXEMPLES DE JUSTIN : « ici j'aurais acheté / vendu » (carte de liquidité, relecture ou graphique). L'agent compare avec ses propres signaux, dit combien d'exemples sont « expliqués », et en tire des contextes
      pour le Chercheur. Un exemple n'est jamais une preuve : c'est une piste.
   3. AJUSTEMENT DE LA RECHERCHE : quelles familles creuser, lesquelles laisser de côté, d'après le diagnostic (aucun critère n'est touché).
   4. RAPPORT QUOTIDIEN (Telegram, le matin) : court, chiffré par le code, avec les trous de données et la santé du PC. */
export const GARDE_FOU_OCCASIONS = 'Ce journal sert à GÉNÉRER des hypothèses, jamais à les valider : toute idée venue du passé doit être retestée sur des données qu’elle n’a pas vues.';

/* ── 1. occasions manquées ── */
const FLAGS = ['absorption', 'divergence_cvd', 'balayage_liquidite', 'flux_persistant'];
/* Contexte CONNU à la clôture de la barre i (aucun regard vers le futur) : phase H1, session, volume relatif, et quatre drapeaux de flux. */
export function contexteEn(ctx, i, sens) {
  const fl = attacherFluxBougies(ctx), ab = absorptionVec(ctx, 2, 0.25).sens[i], dv = divergenceVec(ctx, 48)[i], bl = balayagesVec(ctx, 2).sens[i];
  let somme = 0, vol = 0, bons = 0, ok = i >= 4; for (let j = i - 3; ok && j <= i; j++) { const d = fl.delta[j]; if (!Number.isFinite(d)) { ok = false; break; } somme += d; vol += fl.achat[j] + fl.vente[j]; if (d * sens > 0) bons++; }
  const flux = ok && bons >= 3 && vol > 0 && somme * sens / vol >= 0.08, h = new Date(ctx.m15.t[i]).getUTCHours(), vm = ctx.volMoy20[i];
  return { phase: ['transition', 'hausse', 'baisse', 'range'][ctx.h1.phase[i]] || 'transition', session: h < 7 ? 'asie' : h < 13 ? 'europe' : h < 21 ? 'new_york' : 'fin_de_journee', volumeRel: vm > 0 ? +(ctx.m15.v[i] / vm).toFixed(2) : null,
    absorption: ab === sens, divergence_cvd: dv === sens, balayage_liquidite: bl === sens, flux_persistant: flux };
}
/* Impulsions : sur `fenetre` barres, un mouvement net ≥ `n` ATR dans un sens (de la clôture de la barre i0 à l'extrême atteint). On garde la plus grande par zone de 2 × fenetre barres. Rend [{ i0, i1, sens, ampleurATR, t }]. */
export function detecterImpulsions(m15, atr, { n = 3, fenetre = 8, depart = 400 } = {}) {
  const out = []; let derniere = -1e9;
  for (let i = depart; i + fenetre < m15.n; i++) {
    const a = atr[i]; if (!(a > 0) || i - derniere < 2 * fenetre) continue;
    let h = -Infinity, b = Infinity; for (let j = i + 1; j <= i + fenetre; j++) { if (m15.h[j] > h) h = m15.h[j]; if (m15.l[j] < b) b = m15.l[j]; }
    const hausse = (h - m15.c[i]) / a, baisse = (m15.c[i] - b) / a; if (hausse < n && baisse < n) continue;
    const sens = hausse >= baisse ? 1 : -1; out.push({ i0: i, i1: i + fenetre, sens, ampleurATR: +(Math.max(hausse, baisse)).toFixed(2), t: m15.t[i] }); derniere = i;
  }
  return out;
}
/* Une impulsion est « prise » si une position simulée dans le même sens était ouverte à son début ou s'y est ouverte pendant la fenêtre. `trades` = [{ t, tSortie, sens }] (compte simulé, pépinière). */
export const etaitPrise = (imp, m15, trades) => (trades || []).some(x => x.sens === imp.sens && x.t <= m15.t[imp.i1] && x.tSortie >= m15.t[imp.i0]);
/* Met à jour le journal : ajoute les nouvelles impulsions (par date), jamais deux fois. `journal` = { liste: [], derniereT } ; rend le nombre ajouté. */
export function majOccasions(journal, ctx, trades, { n = 3, max = 2000 } = {}) {
  const imps = detecterImpulsions(ctx.m15, ctx.atr15, { n }), vus = new Set(journal.liste.map(x => x.t)); let ajout = 0;
  for (const imp of imps) { if (vus.has(imp.t) || imp.i1 >= ctx.n - 1) continue; const prise = etaitPrise(imp, ctx.m15, trades); journal.liste.push({ t: imp.t, sens: imp.sens, ampleurATR: imp.ampleurATR, prise, contexte: contexteEn(ctx, imp.i0, imp.sens) }); ajout++; }
  journal.liste.sort((a, b) => a.t - b.t); if (journal.liste.length > max) journal.liste.splice(0, journal.liste.length - max); return ajout;
}
export function resumeOccasions(journal) {
  const l = journal.liste, ratees = l.filter(x => !x.prise), contextes = {};
  for (const x of ratees) for (const f of FLAGS) if (x.contexte[f]) contextes[f] = (contextes[f] || 0) + 1;
  const parPhase = {}; for (const x of ratees) parPhase[x.contexte.phase] = (parPhase[x.contexte.phase] || 0) + 1;
  return { total: l.length, prises: l.length - ratees.length, ratees: ratees.length, contextes, parPhase, avertissement: GARDE_FOU_OCCASIONS, resume: l.length ? l.length + ' grosses impulsions repérées, ' + ratees.length + ' manquées. ' + GARDE_FOU_OCCASIONS : 'Aucune impulsion repérée pour l’instant. ' + GARDE_FOU_OCCASIONS };
}

/* ── 2. exemples de Justin ── */
/* Un exemple { t (ms), sens: 'achat' | 'vente', actif } est « expliqué » si au moins une famille (paramètres par défaut = première variante de sa grille) donne un signal dans le même sens
   dans les `fenetre` barres qui précèdent ou suivent immédiatement (±3). Rend { explique, par: [familles], contexte }. */
export function expliquerExemple(ex, ctx, { fenetre = 3, familles = null } = {}) {
  const s = ex.sens === 'achat' ? 1 : -1, t = ex.t, m15 = ctx.m15; let i = 0; { let lo = 0, hi = m15.n - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m15.t[k] <= t) lo = k; else hi = k - 1; } i = lo; }
  if (i < 450 || i >= m15.n) return { explique: false, par: [], contexte: null, raison: 'moment hors des données' };
  const par = []; for (const id of familles || Object.keys(FAMILLES)) {
    const f = famille(id); if (!f || !f.grille) continue; let p; try { const g = f.grille(); p = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v[0]])); } catch (e) { continue; } if (!Object.keys(p).length) continue;
    try { const sig = f.signaux(ctx, p); for (let j = Math.max(0, i - fenetre); j <= Math.min(m15.n - 1, i + fenetre); j++) if (sig.sens[j] === s) { par.push(id); break; } } catch (e) { /* famille non évaluable ici */ }
  }
  return { explique: par.length > 0, par, contexte: contexteEn(ctx, i, s) };
}
export function resumeExemples(exemples) {
  const expliques = exemples.filter(e => e.explication && e.explication.explique), contextes = {};
  for (const e of exemples) if (e.explication && e.explication.contexte) for (const f of FLAGS) if (e.explication.contexte[f]) contextes[f] = (contextes[f] || 0) + 1;
  return { total: exemples.length, expliques: expliques.length, non_expliques: exemples.length - expliques.length, contextes, phrase: exemples.length ? expliques.length + ' exemple(s) sur ' + exemples.length + ' sont expliqués par au moins un de mes signaux ; ' + (exemples.length - expliques.length) + ' ne le sont pas (ce sont mes pistes pour de nouvelles hypothèses, jamais des preuves).' : 'Aucun exemple noté pour l’instant : sur la carte de liquidité, « J’aurais acheté / vendu ici ».' };
}

/* ── 3. ajustement de la recherche d'après le diagnostic ── */
export function ajusterRecherche(diag) {
  const creuser = [], abandonner = [], raisons = [], par = new Map();
  for (const b of (diag && diag.balayages) || []) { const e = par.get(b.id) || { id: b.id, nom: b.nom, brutes: 0, nettes: 0, seuil: 0, bonnes: 0, meilleur: -Infinity }; e.brutes += b.positivesBrutes; e.nettes += b.positivesNettes; e.seuil += b.nettesSeuil; e.bonnes += b.avecAssezDeTrades; if (b.meilleur && b.meilleur.esperance > e.meilleur) e.meilleur = b.meilleur.esperance; par.set(b.id, e); }
  for (const e of par.values()) {
    if (e.bonnes >= 20 && e.brutes === 0 && e.meilleur < -0.1) { abandonner.push(e.id); raisons.push(e.nom + ' : 0 variante positive même avant frais sur ' + e.bonnes + ' → mise de côté (revue chaque semaine).'); }
    else if (e.nettes > 0 && e.meilleur >= 0.1) { creuser.push(e.id); raisons.push(e.nom + ' : ' + e.nettes + ' variantes positives après frais, meilleure ' + e.meilleur.toFixed(2).replace('.', ',') + ' R → à creuser.'); }
  }
  return { creuser, abandonner, raisons };
}
/* Applique les priorités à une liste de familles : « creuser » d'abord, « abandonner » retirées (sauf le jour de revue hebdomadaire). */
export function ordonnerFamilles(ids, priorites, { revue = false } = {}) {
  if (!priorites) return ids.slice(); const c = new Set(priorites.creuser || []), a = new Set(priorites.abandonner || []);
  return ids.filter(x => revue || !a.has(x)).sort((x, y) => (c.has(y) ? 1 : 0) - (c.has(x) ? 1 : 0) || ids.indexOf(x) - ids.indexOf(y));
}

/* ── 4. rapport quotidien ── */
const fr = (x, d = 0) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toFixed(d).replace('.', ','));
export function pourquoiRienValide(diag, etat) {
  const v = diag && diag.conclusion, e = diag && diag.entonnoir, l = [];
  l.push(etat && etat.versions && etat.versions.length ? 'Il y a déjà une version active.' : 'Aucune stratégie validée aujourd’hui.');
  if (e && e.criteres[0]) l.push(e.criteres.filter(c => c.part >= 0.95).length + ' critères sur ' + e.criteres.length + ' sont ratés par presque toutes les évaluations : c’est l’espérance nette qui manque, pas un critère isolé.');
  if (v) l.push(v.chiffres.posBrutes + ' variantes positives avant frais, ' + v.chiffres.posNettes + ' après frais, ' + v.chiffres.seuil + ' au seuil de +0,25 R (sur l’entraînement : optimiste).');
  l.push('Les frais mangent ' + (diag && diag.hasard && diag.hasard[0] ? fr(diag.hasard[0].coutsMoyens, 2) + ' R' : 'une grande part') + ' par trade : il faut des signaux avec un vrai avantage, pas un critère plus facile.');
  l.push('Je continue : nouvelles hypothèses du Chercheur, nouvelles familles de flux, pépinière en simulation. Les critères ne changent pas.');
  return l.slice(0, 5);
}
/* `faits` = { diag, etat, pepiniere (résumé), equipe (résumé), flux (statutFlux), donnees (trous…), disqueLibreGo, pcVivant, occasions, exemples, hypothesesAcceptees } */
export function rapportQuotidien(f, maintenant = Date.now()) {
  const L = []; const jour = new Date(maintenant).toISOString().slice(0, 10);
  L.push('Kepler — rapport du ' + jour.split('-').reverse().join('/') + '.');
  L.push(...pourquoiRienValide(f.diag, f.etat).slice(0, 2));
  if (f.pepiniere) L.push('Pépinière : ' + f.pepiniere.actives + ' candidate(s) en simulation, ' + f.pepiniere.tradesTotal + ' trades simulés, ' + f.pepiniere.acceptees + ' acceptée(s) par le test séquentiel (à valider par Justin).');
  if (f.equipe) L.push('Équipe : ' + (f.hypothesesAcceptees != null ? f.hypothesesAcceptees : 0) + ' nouvelle(s) hypothèse(s) aujourd’hui, ' + (f.equipe.chercheur.hypotheses.total) + ' au total ; l’Auditeur a rejeté ' + f.equipe.auditeur.rejetes + ' candidate(s).');
  if (f.occasions && f.occasions.total) L.push('Occasions manquées : ' + f.occasions.ratees + ' sur ' + f.occasions.total + ' (pistes seulement, jamais des preuves).');
  if (f.exemples && f.exemples.total) L.push(f.exemples.phrase);
  const g = f.flux; if (g) L.push(g.enregistre ? 'Carnet : ' + g.phrase.replace(/^Enregistre /, 'enregistré ') : 'ATTENTION carnet : ' + g.phrase);
  if (f.donnees && f.donnees.trous) L.push('Données : ' + f.donnees.trous + ' trou(s) de bougies signalé(s).');
  L.push('PC : ' + (f.pcVivant === false ? 'service arrêté' : 'service en marche') + (f.disqueLibreGo != null ? ', ' + fr(f.disqueLibreGo, 0) + ' Go libres' : '') + (f.disqueLibreGo != null && f.disqueLibreGo < 10 ? ' (ATTENTION : disque presque plein)' : '') + '.');
  L.push('Rappel : aucun ordre n’est passé et rien n’est garanti.');
  return L;
}
export const alerteObservationTexte = c => ['OBSERVATION (non validé) — observation, pas de preuve statistique.', c.nom + ' ' + c.paire + ' : ' + (c.sens > 0 ? 'achat' : 'vente') + ' simulé, stop ' + fr(c.stop, 2) + '.', 'Cette idée n’a PAS passé les critères de validation. Aucun ordre n’est passé.'];
