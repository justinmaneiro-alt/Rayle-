import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { simulerRiche } from '../simulateur-riche.js';
import { FAMILLES_V7, ORDRE_V7, AGENTS, parametresDefaut, TYPES_SETUP, fmt } from './agents.js';
import { elementsVue, confluence, vue, resumeConfluence, SEUIL_DIAMANT } from './zones.js';
import { NIVEAUX } from '../criteres-v4.js';
import { contexteEcarte } from './preuves.js';

/* ═════════════ PROPOSER, CLASSER, EXPLIQUER LES POSITIONS DU MOMENT (V7, phases 3 et 3 bis ; module pur, testé : galaxie/tests/positions-moteur-test.mjs) ═════════════
   À chaque clôture de bougie M15 / H1, les trois agents évaluent TOUTES les zones candidates ; ce module garde celles qui sont encore valables (ordre limite pas encore touché ou position ouverte), les
   CLASSE par qualité attendue (confluence, rapport gain / risque, historique du type de setup, régime) et en garde au plus `maxParAgent` par agent et `maxNouvellesParJour` au total (pas de bruit).
   Quand rien ne passe le filtre, il ne dit jamais « rien » sans explication : il montre la MEILLEURE position hypothétique, pourquoi elle n'est pas proposée et à quel prix elle le deviendrait.
   Honnêteté : le niveau de preuve de chaque position est toujours attaché (Validée / Candidate / Testée non concluante / Idée non testée) avec les vraies statistiques du type de setup ; aucun ordre n'est exécuté. */
export const REGLAGES_DEFAUT = Object.freeze({
  agents: { rebond: true, continuation: true, extremes: true }, actifs: ['BTC', 'SOL', 'DOGE'], unites: ['M15', 'H1'],
  maxParAgent: 3, maxNouvellesParJour: 5, confluenceMin: 2, niveauPreuveMin: 'candidate', afficherIdees: false, risquePct: 0.5, alertesObservation: false, seuilDiamant: SEUIL_DIAMANT.score, versionCriteres: 'equilibre'
});
const ORDRE_NIVEAUX = { validee: 4, candidate: 3, non_concluante: 2, non_testee: 1 };
export const niveauAssezHaut = (niveau, min) => ORDRE_NIVEAUX[niveau] >= ORDRE_NIVEAUX[min === 'idee' ? 'non_testee' : min];

/* Statut d'une proposition née à la barre M15 `i` (signal de `sig`), vu à la fin de la série : rejoue la VRAIE simulation (ordre limite avec file d'attente honnête, frais, glissement) sur une tranche.
   Rend { statut: 'en_attente' | 'ouverte' | 'cloturee' | 'expiree' | 'partie_sans_nous' | 'refusee', trade?, ouverte?, enAttente? }. */
export function statutProposition(m15, sig, i, config = {}, plage = null) {
  return statutDepuisSignal(m15, i, { sens: sig.sens[i], stop: sig.stop[i], limite: sig.limite[i], cible: sig.cible[i], ttl: sig.ttl, R: sig.R, atr: sig.atr ? sig.atr.slice(i) : null, options: sig.options }, config, plage);
}
/* Même chose à partir des valeurs d'UNE proposition (stop, limite, cible, ttl) : sert au suivi des positions déjà proposées. */
export function statutDepuisSignal(m15, i, s1, config = {}, plage = null) {
  if (m15.n - i < 2) return { statut: 'en_attente', enAttente: { sens: s1.sens, niveau: s1.limite, stop: s1.stop, cible: s1.cible, signal: i } };      // la bougie vient de se fermer : l'ordre n'a pas encore pu être touché
  const sub = tranche(m15, i, m15.n), len = sub.n, s = new Int8Array(len), stop = new Float64Array(len), lim = new Float64Array(len).fill(NaN), cib = new Float64Array(len).fill(NaN);
  s[0] = s1.sens; stop[0] = s1.stop; lim[0] = s1.limite; cib[0] = s1.cible;
  const r = simulerRiche(sub, { riche: true, sens: s, stop, limite: lim, cible: cib, ttl: s1.ttl, R: s1.R || 2, atr: s1.atr || null, options: s1.options }, config, plage || {});
  if (r.trades.length) { const t = r.trades[0]; return { statut: 'cloturee', trade: { ...t, entree: t.entree + i, sortie: t.sortie + i, signal: i } }; }
  if (r.ouverte) return { statut: 'ouverte', ouverte: r.ouverte };
  if (r.enAttente) return { statut: 'en_attente', enAttente: r.enAttente };
  const o = r.ordres; return { statut: o.partisSansNous ? 'partie_sans_nous' : (o.refusRR || o.refusFrais || o.refusDistance) ? 'refusee' : 'expiree' };
}
/* Options de simulation d'une proposition (les mêmes que celles des familles) : stop minimum automatique, plafond de coût 0,08 R, rapport gain / risque ≥ 1,5. */
export const optionsProposition = (tf, ttlBarres) => ({ stopMinAuto: true, coutPlafondR: 0.08, rrMin: 1.5, maxBarres: tf === 'H1' ? 192 : 96, sortie: { type: 'fixe' }, ttlBarres });

/* Qualité attendue d'une proposition (pour le classement). Les poids sont des heuristiques ; le classement ne prouve rien, la preuve est le niveau et les statistiques affichés à côté. */
export function qualite(p, preuve) {
  const conf = p.confluence, bonusNiveau = preuve ? ({ validee: 1.5, candidate: 0.8, non_testee: 0, non_concluante: (preuve.esperance != null && preuve.esperance < 0 ? -0.8 : -0.3) }[preuve.niveau] || 0) : 0;
  return +(Math.min(2, conf.score / 3) + Math.min(1.2, (p.rr || 0) / 3) + bonusNiveau + (conf.diamant ? 0.4 : 0) + (p.regime === 'cascade' ? 0.1 : 0)).toFixed(3);
}

/* Cherche les propositions encore valables à la fin des données pour UN actif. `preuves` : { 'agent:type|tf': { niveau, esperance, … } } (clé = `typeCle`). Rend { propositions, hypothese, zonesDiamant, balayees }. */
export const typeCle = (famille, type) => famille + '|' + type;
export function proposerPourActif(m15, actif, { reglages = REGLAGES_DEFAUT, preuves = {}, config = {}, murs = null, maintenant = null, profil = null, parametres = {} } = {}) {
  const R = { ...REGLAGES_DEFAUT, ...reglages }, ctx = construireContexte(m15), n = ctx.n, propositions = [], resume = [];
  for (const tf of R.unites) for (const agent of Object.keys(AGENTS)) {
    if (!R.agents[agent]) continue; const id = agent + '_' + tf.toLowerCase(), fam = FAMILLES_V7[id], params = { ...parametresDefaut(id), ...(parametres[id] || {}), conf: agent === 'extremes' ? Math.max(1, R.confluenceMin - 1) : R.confluenceMin }          // pour les extrêmes, le déclencheur (cascade ou bord de range) compte déjà comme un premier élément;
    const sig = fam.signaux(ctx, params), borne = n - 1 - (sig.ttl + 4); let nb = 0;
    for (let i = n - 1; i > borne && i > 0; i--) {
      if (!sig.sens[i]) continue; const meta = sig.meta.get(i); if (!meta) continue; nb++;
      const st = statutProposition(ctx.m15, sig, i, config); if (st.statut !== 'en_attente' && st.statut !== 'ouverte') continue;
      const cle = typeCle(id, meta.type), preuve = preuves[cle] || { niveau: 'non_testee', n: 0, esperance: null };
      propositions.push({ id: [actif, id, ctx.m15.t[i]].join('|'), actif, famille: id, agent, tf, type: meta.type, nomType: TYPES_SETUP[meta.type] || meta.type, sens: meta.sens, achat: meta.sens > 0, t: ctx.m15.t[i], tValide: ctx.m15.t[i] + 900e3 * (meta.ttlBarres + 1),
        zone: meta.zone, limite: meta.limite, stop: meta.stop, cible: meta.cible, cibleNom: meta.cibleNom, cible2: meta.cible2, cible2Nom: meta.cible2Nom, rr: meta.rr, rr2: meta.rr2, raison: meta.raison, invalidation: meta.invalidation,
        confluence: meta.confluence, diamant: meta.confluence.diamant, regime: meta.regime, statut: st.statut, preuve, qualite: qualite(meta, preuve), versionCriteres: R.versionCriteres });
    }
    resume.push({ famille: id, signauxRecents: nb });
  }
  // classement + plafonds
  propositions.sort((a, b) => b.qualite - a.qualite || b.t - a.t);
  const retenues = [], parAgent = {};
  for (const p of propositions) {
    const exclu = contexteEcarte(p, profil); if (exclu && p.preuve.niveau !== 'validee') { p.ecartee = exclu; continue; }          // un contexte qui perd de façon répétée est masqué (sauf pour un type Validée)
    if (!niveauAssezHaut(p.preuve.niveau, R.afficherIdees ? 'non_testee' : R.niveauPreuveMin)) { p.ecartee = 'niveau de preuve trop bas pour l’affichage choisi'; continue; }
    parAgent[p.agent] = (parAgent[p.agent] || 0) + 1; if (parAgent[p.agent] > R.maxParAgent) { p.ecartee = 'plafond par agent atteint'; continue; }
    retenues.push(p);
  }
  const ecartees = propositions.filter(p => p.ecartee);
  const hyp = retenues.length ? null : meilleureHypothese(ctx, R, ecartees);
  return { actif, t: ctx.m15.t[n - 1] + 900e3, prix: ctx.m15.c[n - 1], propositions: retenues, ecartees, hypothese: hyp, zonesDiamant: zonesProches(ctx, R), resume };
}

/* La meilleure position HYPOTHÉTIQUE : d'abord parmi les propositions écartées par le niveau de preuve (« je la proposerais, mais la preuve manque »), puis parmi les setups refusés récemment (confluence ou
   rapport gain / risque insuffisant : on dit quoi changer et à quel prix elle deviendrait valable), puis le scénario conditionnel sur la piscine de liquidité la plus intéressante. */
export function meilleureHypothese(ctx, R, ecartees = []) {
  const n = ctx.n, i1 = n - 1;
  const fautePreuve = ecartees.filter(p => p.ecartee && /niveau/.test(p.ecartee)).sort((a, b) => b.qualite - a.qualite)[0];
  if (fautePreuve) return { ...fautePreuve, type: 'preuve', pourquoi: 'Position valable mais écartée : son niveau de preuve est « ' + NIVEAUX[fautePreuve.preuve.niveau] + ' » et tu as demandé « ' + R.niveauPreuveMin + ' » au minimum.', quand: 'Active « montrer aussi les idées non testées » pour la voir, ou attends qu’elle accumule des trades mesurés.' };
  let meilleur = null;
  for (const tf of R.unites) {
    const h = ctx.cache.get('pos:hyp:' + tf) || [], V = vue(ctx, tf);
    for (const x of h) { if (x.i < n - 1 - 24) continue; const k = V.k(x.i); const sc = x.confluence.score + (x.meilleurRR || 0) * 0.5; if (!meilleur || sc > meilleur.sc) meilleur = { ...x, tf, k, sc }; }
  }
  if (meilleur) {
    const x = meilleur, d = x.d, manque = [];
    let quand = null, pourquoi;
    if (x.raison === 'confluence') { pourquoi = 'Il n’y a que ' + x.confluence.n + ' élément(s) de confluence (' + (x.confluence.elements.map(e => e.texte).join(', ') || 'aucun') + '), il en faut ' + R.confluenceMin + '.'; quand = 'Je la proposerais si un deuxième élément se superposait au niveau ' + fmt(x.niveau) + ' (absorption, POC, VWAP, extrême de la veille…).'; }
    else { const cibleRef = x.limite && x.stop ? null : null; void cibleRef; pourquoi = 'Le rapport gain / risque atteignable est ' + (x.meilleurRR == null ? 'inconnu' : x.meilleurRR.toFixed(1).replace('.', ',')) + ', il en faut 1,5 au minimum (aucun aimant assez loin).'; quand = 'Je la proposerais si le prix revenait vers ' + fmt(x.stop + (x.limite - x.stop) * 0.6) + ' (entrée plus proche du stop) ou si un aimant apparaissait plus loin.'; }
    manque.push(pourquoi);
    return { type: 'refusee', actif: null, agent: x.agent, tf: x.tf, famille: idDe(x.agent, x.tf), sens: d, achat: d > 0, niveau: x.niveau, limite: x.limite, stop: x.stop, confluence: x.confluence, nomType: TYPES_SETUP[x.type] || x.type, pourquoi, quand, raison: (d > 0 ? 'Achat' : 'Vente') + ' hypothétique autour de ' + fmt(x.niveau) + ' ; ' + resumeConfluence(x.confluence) };
  }
  // scénario conditionnel : la piscine la plus intéressante autour du prix
  const z = scenarioConditionnel(ctx, R);
  return z;
}
const idDe = (agent, tf) => agent + '_' + tf.toLowerCase();

/* Scénario conditionnel : on regarde les piscines de liquidité non balayées autour du prix et on retient celle dont la confluence est la meilleure. */
export function scenarioConditionnel(ctx, R, tf = 'H1') {
  const n = ctx.n, i = n - 1, V = vue(ctx, tf), k = V.k(i); if (!(k >= 0)) return null;
  const E = elementsVue(ctx, tf), prix = ctx.m15.c[i], p = E.bal.piscinesFinales(), cand = [];
  for (const q of p.bas || []) if (q.prix < prix && (prix - q.prix) / prix < 0.04) { const c = confluence(ctx, tf, i, k, q.prix, 1, { piscine: { type: q.type, touches: q.touches } }); cand.push({ d: 1, q, c }); }
  for (const q of p.hauts || []) if (q.prix > prix && (q.prix - prix) / prix < 0.04) { const c = confluence(ctx, tf, i, k, q.prix, -1, { piscine: { type: q.type, touches: q.touches } }); cand.push({ d: -1, q, c }); }
  if (!cand.length) return { type: 'aucune', pourquoi: 'Aucune piscine de liquidité claire à moins de 4 % du prix : rien à surveiller pour l’instant.', quand: 'Je reprendrai la recherche à la prochaine bougie.' };
  cand.sort((a, b) => b.c.score - a.c.score); const x = cand[0];
  return { type: 'conditionnelle', sens: x.d, achat: x.d > 0, niveau: x.q.prix, confluence: x.c, tf,
    pourquoi: 'Aucune configuration complète en ce moment : le prix n’a balayé aucun niveau.', quand: 'Je proposerais ' + (x.d > 0 ? 'un achat' : 'une vente') + ' si le prix balaie ' + fmt(x.q.prix) + ' puis referme ' + (x.d > 0 ? 'au-dessus' : 'en dessous') + ' (' + resumeConfluence(x.c) + ').',
    raison: 'Niveau à surveiller : ' + fmt(x.q.prix) + ' — ' + resumeConfluence(x.c) };
}

/* Zones diamant proches du prix (mode « trade à surveiller ») : on alerte quand le prix s'en approche, avant tout balayage. */
export function zonesProches(ctx, R, { tfs = ['H1', 'M15'], pct = 3 } = {}) {
  const n = ctx.n, i = n - 1, prix = ctx.m15.c[i], out = [];
  for (const tf of tfs) {
    const V = vue(ctx, tf), k = V.k(i); if (!(k >= 0)) continue; const E = elementsVue(ctx, tf), p = E.bal.piscinesFinales(), at = V.atr[k];
    for (const [liste, d] of [[p.bas || [], 1], [p.hauts || [], -1]]) for (const q of liste) {
      const dist = Math.abs(q.prix - prix) / prix * 100; if (dist > pct || d * (prix - q.prix) < 0) continue;
      const c = confluence(ctx, tf, i, k, q.prix, d, { piscine: { type: q.type, touches: q.touches } }), diamant = c.score >= R.seuilDiamant && c.n >= SEUIL_DIAMANT.elements;
      if (diamant) out.push({ tf, niveau: q.prix, cote: c.cote, distancePct: +dist.toFixed(2), enApproche: Math.abs(q.prix - prix) <= 1.5 * (at > 0 ? at : prix * 0.003), score: c.score, elements: c.elements.map(e => e.texte), resume: resumeConfluence({ ...c, diamant: true }) });
    }
  }
  const vus = new Set(); return out.filter(z => { const kz = z.tf + Math.round(z.niveau); if (vus.has(kz)) return false; vus.add(kz); return true; }).sort((a, b) => a.distancePct - b.distancePct).slice(0, 6);
}

/* Plafond de nouvelles positions par jour (UTC) : parmi `candidates` (triées par qualité), garde celles qui rentrent dans le budget restant. `dejaEmises` : timestamps d'émission. */
export function budgetJour(candidates, dejaEmises, maintenant, max) {
  const jour = Math.floor(maintenant / 86400e3), deja = (dejaEmises || []).filter(t => Math.floor(t / 86400e3) === jour).length;
  return { acceptees: candidates.slice(0, Math.max(0, max - deja)), refusees: candidates.slice(Math.max(0, max - deja)), dejaAujourdhui: deja };
}
export { ORDRE_V7 };
