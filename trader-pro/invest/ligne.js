/* ═════════════ CONSTRUCTION D'UNE LIGNE ET D'UNE FICHE (module PUR, testé) ═════════════
   Prend les données déjà lues (chart Yahoo, comptes annuels, devises) et produit :
   - `ligne` : l'enregistrement compact de l'index (mesures brutes `r` ; les facteurs `f` sont ajoutés plus tard par modele.calculerFacteurs, car ils dépendent de tout l'univers) ;
   - `fiche` : le détail chargé à la demande (comptes, méthodes de valeur, DCF modifiable, chandeliers, clôtures hebdomadaires, saisonnalité). */
import { evaluer } from './valeur.js';
import { mesuresBrutes, valoriserV2, completude } from './analyse-v2.js';
import { mesuresPrix, setupTactique } from './technique.js';
import { matriceMensuelle, encoder, meilleuresFenetres, statsFenetre } from './saison.js';
import { estFinanciere, estFonciere } from './secteurs.js';
import { regrouper } from '../commun/analyse.js';

const fin = x => typeof x === 'number' && Number.isFinite(x), J = 86400e3;
const r4 = x => (fin(x) ? Math.round(x * 1e4) / 1e4 : null), r2 = x => (fin(x) ? Math.round(x * 100) / 100 : null), r1 = x => (fin(x) ? Math.round(x * 10) / 10 : null);
export const classeCap = capEur => (!fin(capEur) ? null : capEur < 2000 ? 'petite' : capEur < 10000 ? 'moyenne' : capEur < 200000 ? 'grande' : 'méga');
/* conversion d'un exercice de la devise des comptes vers la devise de cotation (k = unités de cotation par unité de comptes) */
export function convertirAnnuel(A, k) {
  if (!fin(k) || Math.abs(k - 1) < 1e-9) return A;
  const M = ['rev', 'ni', 'ocf', 'capex', 'da', 'ebit', 'gp', 'assets', 'liab', 'eq', 'debt', 'cash', 'ca', 'cl', 're', 'eps', 'tax', 'pretax', 'int', 'div', 'buyback'];
  return A.map(x => { const o = { ...x }; for (const c of M) if (fin(o[c])) o[c] = o[c] * k; return o; });
}
const compact = B => B.map(b => [Math.round(b.t / J), r4(b.o), r4(b.h), r4(b.l), r4(b.c), Math.round((b.v || 0) / 1000)]);
const arrondi = (v, d = 4) => (fin(v) ? +v.toPrecision(d + 2) : null);

/* entrée : { cat (entrée du catalogue + méta enrichie), D (chart journalier lireChart), M (chart mensuel), annuel, devF, actions, actionsT, fxEur (unités par EUR), bench (bougies de l'indice du pays), benchM (mensuel ajusté de l'indice), maintenant, resultats (jours avant résultats ou null) } */
export function construireLigne(e) {
  const { cat, D, M, annuel, devF, fxEur = {}, bench = null, benchM = null, maintenant = Date.now() } = e, secteur = cat.secteur || null, industrie = cat.industrie || null;
  const devQ = D.devise || cat.devise || 'USD', fx = fxEur[devQ], fxF = devF ? fxEur[devF] : null, kC = fx && fxF && devF !== devQ ? fx / fxF : 1;
  const mesP = mesuresPrix(D.bougies, bench, { maintenant }), setup = setupTactique(D.bougies, { maintenant });
  const ligne = { id: cat.symbole_xtb, y: cat.symbole_yahoo, n: cat.nom || D.nom || cat.symbole_xtb, c: cat.classe, p: cat.pays, z: cat.zone, s: secteur, i: industrie, d: devQ, df: devF || null, px: r4(D.prix), t: D.tPrix || maintenant, da: cat.dispo, pea: cat.pea === 'oui' ? 1 : 0, pal: cat.palier, vx: cat.verifie_xtb ? 1 : 0, ix: cat.indices || [], r: {}, f: {} };
  if (mesP) Object.assign(ligne.r, { m1: r4(mesP.m1), m3: r4(mesP.m3), m6_1: r4(mesP.m6_1), m12_1: r4(mesP.m12_1), m12: r4(mesP.m12), vs200d: r4(mesP.vs200d), vs200w: r4(mesP.vs200w), d52: r4(mesP.d52), vs20: r4(mesP.vs20), vol: r4(mesP.vol), mdd3: r4(mesP.mdd3), beta: r2(mesP.beta), rsIdx: r4(mesP.rsIdx) });
  const liqEur = mesP && mesP.liq && fx && (cat.classe === 'action' || cat.classe === 'ETF') ? mesP.liq / fx : null; ligne.liqM = liqEur ? r2(liqEur / 1e6) : null; if (liqEur) ligne.r.liq = liqEur;
  if (setup) { ligne.r.setup = setup.score; ligne.r.setupWhy = setup.why; ligne.dma = r2(setup.dist); ligne.dsup = setup.dSup != null ? r2(setup.dSup) : null; ligne.tend = setup.tend; ligne.fl = setup.dArrow; ligne.f.set = setup.score; }
  /* dividende des 12 derniers mois et saisonnalité */
  const div12 = D.dividendes.filter(d => d.t > maintenant - 365 * J).reduce((s, d) => s + d.v, 0); ligne.r.dy = D.prix > 0 && div12 > 0 ? r4(div12 / D.prix) : 0;
  const Mm = matriceMensuelle(M ? M.ajuste : [], maintenant); ligne.sn = Object.keys(Mm).length;
  const fiche = { id: ligne.id, y: ligne.y, n: ligne.n, c: ligne.c, p: ligne.p, z: ligne.z, s: secteur, i: industrie, d: devQ, df: devF || null, px: ligne.px, t: ligne.t, bourse: D.bourse, k: D.k, tech: { d: compact(D.bougies.slice(-380)), w: regrouper(D.bougies, 7 * J, 4 * J, maintenant).filter(w => !w.enCours).slice(-262).map(w => [Math.round(w.t / J), r4(w.c)]), setup: setup ? { ...setup, why: setup.why } : null }, saison: encoder(Mm), dividendes: D.dividendes.slice(-16).map(d => [Math.round(d.t / J), r4(d.v)]) };
  if (Mm && Object.keys(Mm).length >= 10) { const mb = benchM ? matriceMensuelle(benchM, maintenant) : null; fiche.saisonMeilleures = meilleuresFenetres(Mm, mb); }
  if (cat.classe !== 'action' || !annuel || !annuel.length) { ligne.comp = cat.classe === 'action' ? 0.35 : 1; return { ligne, fiche, Mm }; }

  /* ───── fondamentaux ───── */
  const A = convertirAnnuel(annuel, kC), mensuel = M ? M.bougies.map(b => [b.t, b.c]) : [];
  const fi = estFinanciere(secteur, industrie);
  const f = evaluer(A, { tk: ligne.id, nom: ligne.n, secteur: fi ? 'Finance' : secteur, prix: D.prix, devise: devQ, actions: e.actions, actionsT: e.actionsT, mensuel, splits: M ? M.splits : D.splits, maintenant });
  ligne.fon = estFonciere(secteur, industrie) ? 1 : 0;
  const val = f.serie ? valoriserV2(f, { pays: cat.pays, secteur }) : { valeur: null, methodes: [], info: [], avertissements: f.avertissements || [] }, br = f.serie ? mesuresBrutes(f, {}) : {};
  const capLoc = f.mcap || null, capEur = capLoc && fx ? capLoc / fx / 1e6 : null; ligne.cap = capEur ? Math.round(capEur) : null; ligne.sc = classeCap(capEur);
  if (br) for (const [k, v] of Object.entries(br)) if (fin(v)) ligne.r[k] = k === 'ev' ? v : Math.abs(v) < 1e3 ? r4(v) : Math.round(v * 100) / 100;
  ligne.r.financiere = fi; ligne.r.per = f.ratios && fin(f.ratios.per) ? r2(f.ratios.per) : null; ligne.r.mos = val.mos != null ? r4(val.mos) : null;
  if (val.implicite && fin(val.implicite.g)) ligne.r.gImp = r4(val.implicite.g);
  if (br && br.roicSerie) { const w = val.dcfIn ? val.dcfIn.r : 0.09, S = br.roicSerie.filter(fin); if (S.length >= 3) ligne.r.roicOk = r2(S.filter(x => x > w).length / S.length); }
  delete ligne.r.roicSerie; delete ligne.r.evEbitdaHist; delete ligne.r.roicAnneesOk; delete ligne.r.ev;
  ligne.v = val.valeur ? r2(val.valeur.central) : null; ligne.hyp = val.hypothese ? 1 : 0; ligne.disp = fin(val.dispersion) ? r2(val.dispersion) : null; ligne.comp = r2(completude(f, !!mesP)); ligne.fin = f.fin || null; ligne.av = val.avertissements && val.avertissements.length ? val.avertissements[0] : (f.avertissements && f.avertissements[0]) || null;
  const SH = fin(f.ctxV && f.ctxV.S0) ? f.ctxV.S0 : null; ligne.r.sh = SH ? Math.round(SH) : null;
  Object.assign(fiche, { fond: { fin: f.fin || null, annees: (f.serie || []).slice(-11).map(x => ({ fin: x.fin, rev: arrondi(x.rev), ni: arrondi(x.ni), fcf: arrondi(x.fcf), eps: r2(x.epsA), ebitda: arrondi(x.ebitda), dette: arrondi(x.debt), tresorerie: arrondi(x.cash), per: x.px && x.epsA > 0 ? r1(x.px / x.epsA) : null, evEbitda: x.px && x.shA && x.ebitda > 0 ? r1((x.px * x.shA + (fin(x.debt) ? x.debt : 0) - (fin(x.cash) ? x.cash : 0)) / x.ebitda) : null, fcfY: x.px && x.shA && x.fcf != null ? r4(x.fcf / (x.px * x.shA)) : null })), ratios: f.ratios || null, qualite: f.qualite || null, piotroski: f.piotroski || null, altman: f.altman || null, valeur: val.valeur, mos: val.mos, methodes: val.methodes, info: val.info, dcfIn: val.dcfIn, implicite: val.implicite, avertissements: [...(val.avertissements || []), ...((f.avertissements || []).filter(a => !/^DCF/.test(a)))], hypotheses: f.hypotheses || [], mcap: capLoc, mcapEur: capEur, devF: devF || null, conversion: kC !== 1 ? { k: kC, de: devF, vers: devQ, note: 'comptes convertis au taux du jour : approximation pour les multiples historiques' } : null, histo: f.histo ? { prix: f.histo.prix.map(p => [Math.round(p[0] / J), r4(p[1])]), valeur: (f.histo.valeur || []).map(p => [Math.round(p[0] / J), r2(p[1])]), note: f.histo.note } : null } });
  return { ligne, fiche, Mm };
}
