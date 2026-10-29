import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { decouper } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { alea } from '../../planetes/mars/pc/mars-calcul.js';
import { simulerRiche } from '../simulateur-riche.js';
import { intervalleBootstrap, simulerProp } from '../stats-v3.js';
import { nombreEffectif, rendementsJournaliers, nombreEffectifTotal } from '../essais-effectifs.js';
import { verifierCausalite } from '../validation-v3.js';
import { evaluerNiveau, CRITERES4, empreinteV4, periodes } from '../criteres-v4.js';
import { FAMILLES_V7, ORDRE_V7, parametresDefaut, TYPES_SETUP } from './agents.js';
import { nombreEffectifPrudent } from '../faux-positifs.js';

/* ═════════════ PREUVES PAR TYPE DE SETUP (V7, phases 3 bis, 4 et 5 ; module pur, testé : galaxie/tests/positions-preuves-test.mjs) ═════════════
   Pour chaque (actif, agent, unité, TYPE de setup) : on rejoue l'agent sur la ZONE DE RECHERCHE (75 % premiers de l'historique, le jeu final n'est pas lu), avec le simulateur honnête de la V6 (ordres limites
   avec file d'attente, frais, spread, glissement), puis on applique les critères v4 (`CRITERES_V4.md`, addendum écrit avant les mesures). Paramètres FIXES (pas d'optimisation par type) : la zone sert donc de
   mesure hors échantillon. L'Auditeur est interne (causalité, frais doublés, sans les meilleurs trades, mois positifs, entrées au hasard) et écrit son rapport. Le jeu final s'ouvre UNE fois par type, seulement
   si tout le reste est acquis. Rien ici n'accorde de faveur : une espérance négative est écrite telle quelle, avec la fourchette. */
const MOIS = 30.4375 * 86400e3;
const moy = l => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
export const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));
export const doubler = c => ({ ...c, fraisPct: (c.fraisPct == null ? 0.06 : c.fraisPct) * 2, makerPct: c.makerPct == null ? undefined : c.makerPct * 2, spreadPct: (c.spreadPct == null ? 0.01 : c.spreadPct) * 2, glissementPct: (c.glissementPct == null ? 0.01 : c.glissementPct) * 2 });

/* Statistiques d'une liste de trades (ceux du simulateur). */
export function resumerTrades(trades) {
  const R = trades.map(x => x.R), g = R.filter(x => x > 0), p = R.filter(x => x <= 0), n = R.length;
  let eq = 0, pic = 0, dd = 0; for (const x of trades.slice().sort((a, b) => a.tSortie - b.tSortie)) { eq += x.R; pic = Math.max(pic, eq); dd = Math.max(dd, pic - eq); }
  return { n, esperance: moy(R), tauxReussite: n ? g.length / n : null, gainMoyen: moy(g), perteMoyenne: p.length ? -moy(p) : null, rrMoyen: g.length && p.length ? moy(g) / -moy(p) : null, Rtotal: R.reduce((a, b) => a + b, 0), ddR: dd,
    coutMoyenR: n ? moy(trades.map(x => (x.coutsTotalR != null ? x.coutsTotalR : x.coutsR || 0))) : null };
}
/* Découpage en `k` blocs de même DURÉE (walk-forward : espérance cumulée > 0 ET au moins la moitié des blocs avec ≥ 10 trades positifs). */
export function walkForwardBlocs(trades, t0, t1, k = 4) {
  const pas = (t1 - t0) / k, blocs = Array.from({ length: k }, () => []);
  for (const x of trades) { const j = Math.min(k - 1, Math.max(0, Math.floor((x.t - t0) / pas))); blocs[j].push(x.R); }
  const evalues = blocs.filter(b => b.length >= 10), positifs = evalues.filter(b => moy(b) > 0).length, total = moy(trades.map(x => x.R));
  return { blocs: blocs.map(b => ({ n: b.length, esperance: moy(b) })), positif: evalues.length >= 2 && total > 0 && positifs >= evalues.length / 2, evalues: evalues.length, positifs };
}
const regimeDe = ph => (ph === 1 ? 'hausse' : ph === 2 ? 'baisse' : ph === 3 ? 'range' : 'transition');
const session = h => (h < 8 ? 'Asie (00–08 h UTC)' : h < 13 ? 'Europe (08–13 h UTC)' : h < 21 ? 'États-Unis (13–21 h UTC)' : 'soir (21–24 h UTC)');

/* Test de l'Auditeur pour UN type : rapport structuré. `contexte` = { trades (simulateur), trades2 (frais doublés), sig, ctx, fam, params, m15, config, plage }. */
export function auditerType(contexte, { simulations = 60, graine = 20261029, causalite = null } = {}) {
  const { trades, trades2, sig, ctx, m15, config } = contexte, tests = [], T = (nom, ok, valeur, seuil, explication) => tests.push({ nom, ok, valeur, seuil, explication });
  const caus = causalite || { ok: true, ecarts: 0, coupes: 0 };
  T('Aucune fuite du futur (poison du futur)', caus.ok, caus.ecarts, '0 écart', caus.ok ? 'les signaux sont identiques quand on coupe la série juste après un signal (' + caus.coupes + ' coupes)' : caus.ecarts + ' écarts : l’agent regarde des bougies postérieures');
  const R = trades.map(x => x.R), esp = moy(R), e2 = moy(trades2.map(x => x.R));
  T('Frais, spread et glissement × 2', e2 != null && e2 >= 0, e2, '≥ 0 R', 'espérance ' + fr(e2) + ' R avec des coûts doublés (' + fr(esp) + ' R avec les coûts normaux)');
  const tries = R.slice().sort((a, b) => b - a), sans = tries.length > 6 ? moy(tries.slice(3)) : null;
  T('Sans les 3 meilleurs trades', sans != null && sans > 0, sans, '> 0 R', sans == null ? 'trop peu de trades pour l’évaluer' : 'espérance ' + fr(sans) + ' R sans les 3 meilleurs trades');
  const parMois = new Map(); for (const x of trades) { const d = new Date(x.t), k = d.getUTCFullYear() * 12 + d.getUTCMonth(); (parMois.get(k) || parMois.set(k, []).get(k)).push(x.R); }
  const mois = [...parMois.values()].filter(l => l.length >= 2), part = mois.length ? mois.filter(l => moy(l) > 0).length / mois.length : null;
  T('Mois positifs (≥ 2 trades)', part != null && part >= 0.55, part, '≥ 55 %', part == null ? 'pas assez de mois' : Math.round(part * 100) + ' % des mois sont positifs (' + mois.length + ' mois)');
  // entrées au hasard : mêmes distances (en proportion du prix), directions et barres tirées au hasard
  if (trades.length >= 30 && sig) {
    const a = alea(graine), n = m15.n, meta = trades.map(t => sig.meta.get(t.signal)).filter(Boolean), sims = [];
    for (let s = 0; s < simulations; s++) {
      const sens = new Int8Array(n), stop = new Float64Array(n), lim = new Float64Array(n).fill(NaN), cib = new Float64Array(n).fill(NaN);
      for (const m of meta) { const i = 900 + Math.floor(a() * (n - 1000)), d = a() < 0.5 ? 1 : -1, px = m15.c[i], f = px / (m.limite || px), off = Math.abs(m.limite - (m.niveau || m.limite)) * f, sd = Math.abs(m.limite - m.stop) * f, td = Math.abs(m.cible - m.limite) * f;
        if (sens[i]) continue; sens[i] = d; lim[i] = px - d * Math.max(off, 0.0002 * px); stop[i] = lim[i] - d * sd; cib[i] = lim[i] + d * td; }
      const r = simulerRiche(m15, { riche: true, sens, stop, limite: lim, cible: cib, ttl: sig.ttl, R: 2, atr: sig.atr, options: sig.options }, config, contexte.plage || {});
      sims.push(moy(r.trades.map(x => x.R)));
    }
    const p = (sims.filter(x => x != null && x >= esp).length + 1) / (sims.length + 1);
    T('Entrées au hasard (mêmes distances, sens et barres tirés au sort)', p <= 0.05, p, '≤ 0,05', 'p = ' + fr(p, 3) + ' : ' + (p <= 0.05 ? 'les entrées de l’agent battent des entrées au hasard' : 'des entrées au hasard avec les mêmes distances font aussi bien (p = ' + fr(p, 2) + ')'));
  } else T('Entrées au hasard', false, null, '≤ 0,05', 'pas assez de trades (' + trades.length + ' sur 30)');
  const ok = tests.every(t => t.ok);
  return { fait: true, ok, tests, rapport: ['Rapport de l’Auditeur — ' + (ok ? 'AUCUN défaut trouvé.' : 'défauts : ' + tests.filter(t => !t.ok).map(t => t.nom).join(' ; ') + '.'), ...tests.map(t => (t.ok ? '✔ ' : '✘ ') + t.nom + ' — ' + t.explication)] };
}

/* Mesure TOUS les types de setup d'un actif sur la zone de recherche. Rend { actif, zone, types: {cleType: {...}}, familles, nouveauxEssais, profil }.
   `etatPreuves` (facultatif) : { variantes: Set/obj des essais déjà comptés, jeuFinal: { cleType: résultat } (coffre : jamais rouvert), live: { cleType: {semaines, esperance, n} } }. */
export function mesurerActif(m15, actif, { config = {}, c4 = CRITERES4, version = 'equilibre', risquePct = 0.5, etatPreuves = {}, auditer = true, plancher = 0, ouvrirJeuFinal = true, familles = ORDRE_V7, simulationsAuditeur = 60 } = {}) {
  const dec = decouper(m15); if (!dec.ok) return { actif, ok: false, raison: dec.raison, types: {} };
  const zone = tranche(m15, 0, dec.finA), ctx = construireContexte(zone), t0 = zone.t[0], t1 = zone.t[zone.n - 1] + 900e3, brut = {}, nouveauxEssais = [], vus = etatPreuves.variantes || {};
  const cfg2 = doubler(config);
  for (const id of familles) {
    const fam = FAMILLES_V7[id], params = parametresDefaut(id), sig = fam.signaux(ctx, params), sim = simulerRiche(ctx.m15, sig, config, {}), sim2 = simulerRiche(ctx.m15, sig, cfg2, {});
    const parType = {}, parType2 = {};
    for (const t of sim.trades) { const m = sig.meta.get(t.signal); if (m) (parType[m.type] = parType[m.type] || []).push({ ...t, meta: m }); }
    for (const t of sim2.trades) { const m = sig.meta.get(t.signal); if (m) (parType2[m.type] = parType2[m.type] || []).push(t); }
    for (const type of Object.keys(TYPES_SETUP)) {
      if (!type.startsWith(fam.agent + ':')) continue; const trades = parType[type] || [], cle = id + '|' + type, essai = [actif, id, type, JSON.stringify(params)].join('|');
      if (!vus[essai]) nouveauxEssais.push(essai);
      brut[cle] = { cle, famille: id, agent: fam.agent, tf: fam.tf, type, nomType: TYPES_SETUP[type], trades, trades2: parType2[type] || [], fam, sig, params, essai, ordres: sim.ordres };
    }
  }
  // nombre d'essais : total (jamais en baisse) et effectif (variantes corrélées regroupées)
  const avecTrades = Object.values(brut).filter(b => b.trades.length >= 10), matrice = avecTrades.map(b => rendementsJournaliers(b.trades, t0, t1)), ne = nombreEffectif(matrice);
  const dejaVus = Object.keys(vus).length, nTotal = dejaVus + nouveauxEssais.length, nCourant = Object.keys(brut).length;
  const nEffCourant = ne.nEff + (nCourant - avecTrades.length), nEff = nombreEffectifPrudent(nombreEffectifTotal({ nEffCourant, nCourant, variantesAvant: dejaVus }), nTotal, { plancherPart: plancher });
  const causalites = {}, types = {};
  for (const b of Object.values(brut)) {
    const resume = resumerTrades(b.trades), R = b.trades.map(x => x.R), per = periodes(b.trades, 2), wf = walkForwardBlocs(b.trades, t0, t1, 4), prop = simulerProp(b.trades, { risquePct, drawdownMaxPct: c4.validee.prop.drawdownMaxPct, perteJourMaxPct: c4.validee.prop.perteJourMaxPct });
    const e2 = b.trades2.length ? moy(b.trades2.map(x => x.R)) : null, ic = R.length >= 8 ? intervalleBootstrap(R, { tirages: 2000, niveau: 0.95, graine: c4.validee.bootstrap.graine }) : null;
    // L'Auditeur ne travaille que sur les types qui ont un début de preuve (assez de trades ET espérance au moins au seuil Candidate) : inutile de gaspiller du calcul sur les autres.
    let aud = { fait: false, ok: false, tests: [], rapport: [] };
    const aSurveiller = b.trades.length >= c4.candidate.tradesMin && resume.esperance >= c4.candidate.esperanceMin;
    if (auditer && aSurveiller) {
      if (!causalites[b.famille]) causalites[b.famille] = verifierCausalite(b.fam, b.params, zone, { coupes: 6 });
      aud = auditerType({ trades: b.trades, trades2: b.trades2, sig: b.sig, ctx, m15: ctx.m15, config, plage: {} }, { simulations: simulationsAuditeur, causalite: causalites[b.famille] });
    }
    const live = (etatPreuves.live || {})[b.cle] || null, jf = (etatPreuves.jeuFinal || {})[b.cle] || null;
    let ev = evaluerNiveau({ R, nVariantes: nTotal, nEffectif: nEff, periodes: per, esperanceFraisDoubles: e2, auditeur: aud, rapportAuditeur: aud.fait && aud.ok, walkForwardPositif: R.length ? wf.positif : null, ddPct: prop.ddPct, pireJourPct: prop.pireJourPct, live, trades: b.trades }, { version, c4 });
    // jeu final : seulement pour un type qui passe tout le reste ; une seule ouverture par type (coffre)
    let jeuFinal = jf, jeuFinalNote = null;
    if (ev.niveau === 'validee') {
      if (!jf && ouvrirJeuFinal) jeuFinal = ouvrirJeuFinalType(m15, dec, b, config, c4);
      if (!jeuFinal || !jeuFinal.ouvert) { ev = { ...ev, niveau: 'candidate', pourquoi: 'Tous les critères statistiques sont atteints ; reste le jeu final (6 derniers mois, ouvert une seule fois) : ' + (jeuFinal && jeuFinal.raison ? jeuFinal.raison : 'pas encore ouvert') + '.' }; jeuFinalNote = jeuFinal; }
      else if (!jeuFinal.ok) ev = { ...ev, niveau: 'non_concluante', pourquoi: 'Le jeu final a été ouvert une fois et n’a pas confirmé (espérance ' + fr(jeuFinal.esperance) + ' R sur ' + jeuFinal.n + ' trades) : ce type ne revient pas.' };
    }
    types[b.cle] = { cle: b.cle, actif, famille: b.famille, agent: b.agent, tf: b.tf, type: b.type, nomType: b.nomType, n: R.length, esperance: resume.esperance, tauxReussite: resume.tauxReussite, rrMoyen: resume.rrMoyen, coutMoyenR: resume.coutMoyenR,
      fourchette: ic ? [ic.bas, ic.haut] : null, tradesParMois: R.length ? R.length / (dec.moisZoneA || 1) : 0, ddR: resume.ddR, ddPct: prop.ddPct, esperanceFraisDoubles: e2, periodes: per, walkForward: wf, niveau: ev.niveau, versionCriteres: ev.versionTexte, empreinte: ev.criteres,
      lignesCandidate: ev.lignesCandidate, lignesValidee: ev.lignesValidee, ratees: ev.ratees, pourquoi: ev.pourquoi, auditeur: aud, jeuFinal: jeuFinal ? { ouvert: !!jeuFinal.ouvert, ok: !!jeuFinal.ok, esperance: jeuFinal.esperance ?? null, n: jeuFinal.n ?? 0, le: jeuFinal.le || null, raison: jeuFinal.raison || null } : null, ordres: b.ordres, nVariantes: nTotal, nEffectif: nEff, trades: b.trades.map(x => ({ t: x.t, tSortie: x.tSortie, R: x.R, sens: x.sens, signal: x.signal, motif: x.motif, ph: ctx.h1.phase[x.signal], elements: x.meta.confluence.elements.map(e => e.cle), diamant: x.meta.confluence.diamant, rr: x.meta.rr, atrPct: x.meta.atrVue / (x.meta.limite || 1) * 100 })) };
    delete types[b.cle].trades2;
  }
  return { actif, ok: true, zone: { de: t0, a: t1, mois: dec.moisZoneA }, types, nouveauxEssais, nVariantes: nTotal, nEffectif: nEff, version, versionTexte: version === 'strict' ? 'strict (v3)' : 'équilibré (v4)', empreinte: version === 'strict' ? 'c9b4ddd4' : empreinteV4(c4), dateMesure: Date.now(), profil: profilActif(actif, types) };
}

/* Jeu final d'UN type : ouvert une seule fois (le coffre le retient), ≥ 6 mois et ≥ 30 trades, réussi si l'espérance finale ≥ +0,08 R (voir CRITERES_V4.md, addendum). */
export function ouvrirJeuFinalType(m15, dec, b, config = {}, c4 = CRITERES4) {
  const finale = tranche(m15, dec.finA, m15.n), mois = (finale.t[finale.n - 1] + 900e3 - finale.t[0]) / MOIS, le = Date.now();
  if (mois < c4.validee.jeuFinal.moisMin) return { ouvert: false, raison: 'jeu final de ' + fr(mois, 1) + ' mois, il en faut ' + c4.validee.jeuFinal.moisMin, le };
  const ctx = construireContexte(m15), sig = b.fam.signaux(ctx, b.params), sim = simulerRiche(ctx.m15, sig, config, { de: dec.finA, a: m15.n });
  const trades = sim.trades.filter(t => { const m = sig.meta.get(t.signal); return m && m.type === b.type && t.entree >= dec.finA; }), e = moy(trades.map(x => x.R));
  if (trades.length < 30) return { ouvert: false, raison: 'seulement ' + trades.length + ' trades sur le jeu final (il en faut 30)', le };
  return { ouvert: true, ok: e != null && e >= c4.candidate.esperanceMin, esperance: e, n: trades.length, mois, le };
}

/* Profil appris d'un actif : heures, sessions, régimes, volatilité, types d'éléments ; écarte les contextes qui perdent de façon répétée (≥ 40 trades et < −0,2 R). Rend aussi des phrases. */
export function profilActif(actif, types, { nMin = 30, nEcart = 40, seuilEcart = -0.2 } = {}) {
  const tous = []; for (const t of Object.values(types)) for (const x of t.trades || []) tous.push({ ...x, type: t.type, agent: t.agent });
  const groupe = (nom, f) => { const m = new Map(); for (const x of tous) { const k = f(x); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(x.R); } return [...m.entries()].map(([k, l]) => ({ dim: nom, valeur: k, n: l.length, esperance: moy(l) })); };
  const dims = [...groupe('session', x => session(new Date(x.t).getUTCHours())), ...groupe('régime', x => regimeDe(x.ph)), ...groupe('sens', x => (x.sens > 0 ? 'achat' : 'vente')), ...groupe('volatilité', x => (x.atrPct == null ? null : x.atrPct < 0.2 ? 'calme' : x.atrPct < 0.5 ? 'normale' : 'forte')),
    ...groupe('élément', x => (x.elements && x.elements.includes('balayage') ? 'balayage' : x.elements && x.elements.includes('absorption') ? 'absorption' : null)), ...groupe('diamant', x => (x.diamant ? 'zone diamant' : 'zone ordinaire'))];
  const fiables = dims.filter(d => d.n >= nMin), mieux = fiables.slice().sort((a, b) => b.esperance - a.esperance), ecarts = dims.filter(d => d.n >= nEcart && d.esperance < seuilEcart);
  const ph = d => d.dim + ' « ' + d.valeur + ' » (' + (d.esperance >= 0 ? '+' : '−') + fr(Math.abs(d.esperance)) + ' R sur ' + d.n + ' trades)';
  const phrases = [];
  if (mieux.length) phrases.push(actif + ' : le contexte où ça marche le moins mal est ' + ph(mieux[0]) + (mieux[0].esperance <= 0 ? ' — mais même celui-là est négatif après frais' : '') + '.');
  if (mieux.length > 1 && mieux[mieux.length - 1].esperance < mieux[0].esperance) phrases.push(actif + ' : le contexte où ça échoue le plus est ' + ph(mieux[mieux.length - 1]) + '.');
  for (const e of ecarts) phrases.push(actif + ' : contexte ÉCARTÉ (perd de façon répétée) : ' + ph(e) + '.');
  if (!phrases.length) phrases.push(actif + ' : pas encore assez de trades par contexte pour dire où ça marche ou échoue (il faut au moins ' + nMin + ').');
  return { dims, ecartes: ecarts.map(e => ({ dim: e.dim, valeur: e.valeur })), phrases };
}
/* Un contexte est-il écarté pour cette proposition ? (régime, session, sens, volatilité, diamant) */
export function contexteEcarte(prop, profil) {
  if (!profil || !profil.ecartes || !profil.ecartes.length) return null;
  const h = new Date(prop.t).getUTCHours(), valeurs = { session: session(h), sens: prop.sens > 0 ? 'achat' : 'vente' };
  const reg = prop.regime === 'tendance haussière' ? 'hausse' : prop.regime === 'tendance baissière' ? 'baisse' : prop.regime === 'range' ? 'range' : null; if (reg) valeurs['régime'] = reg;
  for (const e of profil.ecartes) if (valeurs[e.dim] === e.valeur) return 'contexte écarté : ' + e.dim + ' « ' + e.valeur + ' » perd de façon répétée';
  return null;
}
export { ORDRE_V7 };
