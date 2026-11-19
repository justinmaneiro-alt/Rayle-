/* ═════════════ FONDAMENTAUX V2 : mesures brutes + valeur intrinsèque institutionnelle (module PUR, testé) ═════════════
   Part de la fiche v1 (valeur.js : comptes, ratios, multiples historiques, Piotroski, Altman) et ajoute :
   - DCF à deux étapes avec WACC par secteur et pays, croissance plafonnée (≤ min(historique, 12 %), terminale ≤ 2,5 %), et DCF INVERSÉ (la croissance que le prix actuel suppose déjà) ;
   - valeur retenue = médiane des méthodes de valorisation (DCF, multiples historiques ; P/B justifié pour les banques et assurances). La formule de Graham reste affichée « à titre d'information » et ne pilote plus le verdict ;
   - mesures brutes de valeur, qualité, croissance (rendements, ROIC, rentabilité brute, stabilité des marges, accruals, dilution, couverture des intérêts…) que modele.js convertit en percentiles par secteur et par zone ;
   - score de complétude des données (sous 60 % : « données insuffisantes », aucun verdict). */
import { mediane } from './valeur.js';

const fin = x => typeof x === 'number' && Number.isFinite(x), clip = (x, a, b) => Math.max(a, Math.min(b, x)), moy = L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null);
const cagr = (a, b, n) => (fin(a) && fin(b) && a > 0 && b > 0 && n > 0 ? Math.pow(b / a, 1 / n) - 1 : null);
export const HYP2 = Object.freeze({
  erp: 0.05, spreadDette: 0.02, impot: 0.22, croissanceTerminaleMax: 0.025, croissanceMax: 0.12, anneesCroissance: 5, anneesFade: 5, waccMin: 0.06, waccMax: 0.12, seuilHypothese: 4, completudeMin: 0.6,
  /* taux sans risque par pays (ordre de grandeur, hypothèse fixe écrite dans la fiche) */
  rf: { US: 0.042, FR: 0.032, DE: 0.027, UK: 0.042, ES: 0.032, IT: 0.036, NL: 0.029, BE: 0.031, PT: 0.032, CH: 0.01, SE: 0.024, NO: 0.037, DK: 0.027, FI: 0.031, PL: 0.057, CZ: 0.042, defaut: 0.04 },
  beta: { 'Technologie': 1.2, 'Conso. cyclique': 1.15, 'Industrie': 1.05, 'Matériaux': 1.1, 'Énergie': 1.1, 'Finance': 1.1, 'Santé': 0.9, 'Conso. de base': 0.72, 'Services publics': 0.62, 'Immobilier': 0.8, 'Communication': 0.95, defaut: 1 }
});
export function wacc(secteur, pays, ratioDette = 0, hyp = HYP2) {
  const rf = hyp.rf[pays] != null ? hyp.rf[pays] : hyp.rf.defaut, b = hyp.beta[secteur] != null ? hyp.beta[secteur] : hyp.beta.defaut, ke = rf + b * hyp.erp, kd = (rf + hyp.spreadDette) * (1 - hyp.impot), d = clip(ratioDette, 0, 0.6);
  return clip((1 - d) * ke + d * kd, hyp.waccMin, hyp.waccMax);
}
/* DCF à deux étapes : g1 pendant `n1` ans, puis fondu linéaire vers gt pendant `n2` ans, puis valeur terminale. Renvoie la valeur par action (null si impossible). */
export function dcf2(base, g1, gt, r, dette, tresorerie, actions, { n1 = HYP2.anneesCroissance, n2 = HYP2.anneesFade } = {}) {
  if (!(base > 0) || !(actions > 0) || !(r > gt)) return null;
  let f = base, vp = 0, t = 0;
  for (let k = 1; k <= n1; k++) { f *= 1 + g1; t++; vp += f / Math.pow(1 + r, t); }
  for (let k = 1; k <= n2; k++) { const g = g1 + (gt - g1) * k / n2; f *= 1 + g; t++; vp += f / Math.pow(1 + r, t); }
  const tv = f * (1 + gt) / (r - gt) / Math.pow(1 + r, t);
  return (vp + tv - (fin(dette) ? dette : 0) + (fin(tresorerie) ? tresorerie : 0)) / actions;
}
/* DCF inversé : la croissance de la première étape que le prix actuel suppose déjà (dichotomie) ; null si hors de [-15 %, 40 %] */
export function dcfInverse(base, gt, r, dette, tresorerie, actions, prix) {
  if (!(base > 0) || !(prix > 0)) return null; let lo = -0.15, hi = 0.4;
  const f = g => dcf2(base, g, gt, r, dette, tresorerie, actions); const a = f(lo), b = f(hi); if (a == null || b == null) return null;
  if (prix < a) return { g: null, hors: 'bas' }; if (prix > b) return { g: null, hors: 'haut' };
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, v = f(m); if (v == null) return null; if (v < prix) lo = m; else hi = m; }
  return { g: (lo + hi) / 2, hors: null };
}

/* ───── mesures brutes (une valeur par grandeur ; null si indisponible) ───── */
export function mesuresBrutes(f, ctx = {}) {
  const A = f.serie || [], L = A[A.length - 1], R = f.ratios || {}, P = f.prix, mcap = f.mcap, C = f.ctxV || {};
  if (!L || !(P > 0)) return {};
  const dette = fin(L.debt) ? L.debt : 0, treso = fin(L.cash) ? L.cash : 0, ev = mcap ? mcap + dette - treso : null, financiere = !!C.financiere;
  const margesOp = A.map(x => (x.rev > 0 && fin(x.ebit) ? x.ebit / x.rev : null)).filter(fin);
  const stdMarge = margesOp.length >= 3 ? Math.sqrt(moy(margesOp.map(x => (x - moy(margesOp)) ** 2))) : null;
  const sh0 = A.find(x => fin(x.shA)), shL = A[A.length - 1], nAn = sh0 && shL && sh0 !== shL ? A.indexOf(shL) - A.indexOf(sh0) : 0;
  const dilution = sh0 && shL && sh0.shA > 0 && shL.shA > 0 && nAn >= 2 ? Math.pow(shL.shA / sh0.shA, 1 / nAn) - 1 : null;
  const per = (A.map(x => (x.px && x.epsA > 0 ? x.px / x.epsA : null)).filter(fin)), perNow = R.per;
  const perPct = fin(perNow) && per.length >= 3 ? per.filter(x => x < perNow).length / per.length : null;
  const evEbitdaHist = A.map(x => (x.px && x.shA && x.ebitda > 0 ? (x.px * x.shA + (fin(x.debt) ? x.debt : 0) - (fin(x.cash) ? x.cash : 0)) / x.ebitda : null)).filter(fin);
  const retour = (fin(L.div) ? Math.abs(L.div) : 0) + (fin(L.buyback) ? Math.abs(L.buyback) : 0);
  const roicAnnees = A.map(x => { const t = fin(x.tax) && fin(x.pretax) && x.pretax > 0 ? clip(x.tax / x.pretax, 0, 0.35) : 0.21, ci = fin(x.eq) ? x.eq + (fin(x.debt) ? x.debt : 0) - (fin(x.cash) ? x.cash : 0) : null; return fin(x.ebit) && ci > 0 ? x.ebit * (1 - t) / ci : null; });
  return {
    financiere, ev, earnY: fin(L.epsA) ? L.epsA / P : null, ebitEv: ev > 0 && fin(L.ebit) && !financiere ? L.ebit / ev : null, fcfY: !financiere ? R.rendementFcf : null,
    shy: mcap > 0 && (fin(L.div) || fin(L.buyback)) ? retour / mcap : null, pbInv: R.prixValeurComptable > 0 ? 1 / R.prixValeurComptable : null, histRel: perPct == null ? null : 1 - perPct, perPct,
    roic: financiere ? null : R.roic, roe: R.roe, gprof: !financiere && L.assets > 0 && fin(L.gp) ? L.gp / L.assets : null, stabMarge: financiere || stdMarge == null ? null : -stdMarge,
    accr: !financiere && L.assets > 0 && fin(L.ni) && fin(L.ocf) ? -(L.ni - L.ocf) / L.assets : null, pk: !financiere && f.piotroski && f.piotroski.score != null ? f.piotroski.score : null,
    dil: dilution == null ? null : -dilution, icov: !financiere && fin(L.ebit) && fin(L.int) && Math.abs(L.int) > 0 ? clip(L.ebit / Math.abs(L.int), -5, 50) : null,
    nde: !financiere ? R.detteNetteEbitda : null, z: f.altman && f.altman.z != null ? f.altman.z : null, liqCourante: L.ca > 0 && L.cl > 0 ? L.ca / L.cl : null,
    gEps: R.croissanceBPA, gRev: R.croissanceCA, margeOp: R.margeOp, margeNette: R.margeNette,
    roicAnneesOk: roicAnnees.filter(fin).length ? roicAnnees.filter(x => fin(x)).length : 0, roicSerie: roicAnnees, evEbitdaHist
  };
}

/* ───── valeur intrinsèque v2 ───── */
export function valoriserV2(f, ctx = {}) {
  const A = f.serie || [], L = A[A.length - 1], P = f.prix, C = f.ctxV || {}, S0 = C.S0, out = { valeur: null, mos: null, methodes: [], info: [], dcfIn: null, implicite: null, hypothese: false, avertissements: [] };
  if (!L || !(P > 0) || !S0) return out;
  const financiere = !!C.financiere, dette = C.dette || 0, treso = C.treso || 0, hist = (f.methodes || []).find(m => m.id === 'multiples'), gr = (f.methodes || []).find(m => m.id === 'graham');
  const pays = ctx.pays || 'US', secteur = ctx.secteur || null, ratioDette = f.mcap ? dette / (dette + f.mcap) : 0, r0 = wacc(secteur, pays, ratioDette), H = HYP2;
  const methodes = [];
  if (!financiere) {
    const fcfs = A.slice(-3).map(x => x.fcf).filter(fin), base = fcfs.length >= 2 ? moy(fcfs) : null, n5 = Math.min(5, A.length - 1), A5 = A[A.length - 1 - n5];
    const gHist = A5 ? (cagr(A5.fcf, L.fcf, n5) != null ? cagr(A5.fcf, L.fcf, n5) : cagr(A5.rev, L.rev, n5)) : null;
    if (base > 0 && gHist != null) {
      const plafond = Math.min(Math.max(gHist, 0.02), H.croissanceMax), g1 = clip(0.6 * gHist + 0.4 * 0.03, 0, plafond), gt = H.croissanceTerminaleMax;
      const sc = { pessimiste: { r: clip(r0 + 0.01, H.waccMin, H.waccMax + 0.01), g: Math.max(0, g1 - 0.03), gt: 0.02 }, centrale: { r: r0, g: g1, gt }, optimiste: { r: clip(r0 - 0.01, H.waccMin - 0.01, H.waccMax), g: Math.min(H.croissanceMax, g1 + 0.02), gt } };
      const v = k => dcf2(base, sc[k].g, sc[k].gt, sc[k].r, dette, treso, S0), c = v('centrale');
      if (c > 0) { methodes.push({ id: 'dcf', nom: 'DCF à deux étapes (flux de trésorerie libres)', pess: Math.max(0, v('pessimiste') || 0), central: c, opt: v('optimiste') || c, detail: [`flux libre de départ ${(base / 1e6).toFixed(0)} M (moyenne des ${fcfs.length} derniers exercices)`, `étape 1 : ${(g1 * 100).toFixed(1)} % par an pendant ${H.anneesCroissance} ans (historique ${(gHist * 100).toFixed(1)} %, plafonné à ${(plafond * 100).toFixed(1)} %) ; étape 2 : fondu sur ${H.anneesFade} ans vers ${(gt * 100).toFixed(1)} %`, `WACC ${(r0 * 100).toFixed(1)} % (taux sans risque ${(((H.rf[pays] != null ? H.rf[pays] : H.rf.defaut)) * 100).toFixed(1)} %, bêta sectoriel ${((H.beta[secteur] != null ? H.beta[secteur] : H.beta.defaut)).toFixed(2)}, prime de risque ${(H.erp * 100).toFixed(0)} %)`] });
        out.dcfIn = { base, g1, gt, r: r0, dette, treso, actions: S0, prix: P, gHist, plafond, n1: H.anneesCroissance, n2: H.anneesFade, devise: f.devise };
        const inv = dcfInverse(base, gt, r0, dette, treso, S0, P); out.implicite = inv;
      }
    } else out.avertissements.push('DCF indisponible : flux de trésorerie libre insuffisant, négatif ou historique trop court');
  } else {
    /* banques et assurances : P/B justifié = valeur comptable × (ROE − g) / (coût des fonds propres − g) */
    const bvps = L.eq > 0 ? L.eq / S0 : null, roe = (f.ratios || {}).roe, ke = wacc(secteur, pays, 0), g = 0.02;
    if (bvps > 0 && fin(roe) && roe > 0) { const c = bvps * (clip(roe, 0.02, 0.25) - g) / (ke - g); if (c > 0) methodes.push({ id: 'pb', nom: 'P/B justifié (ROE, coût des fonds propres)', pess: c * 0.8, central: c, opt: c * 1.2, detail: [`valeur comptable par action ${bvps.toFixed(2)} × (ROE ${(clip(roe, 0.02, 0.25) * 100).toFixed(1)} % − ${g * 100} %) / (coût des fonds propres ${(ke * 100).toFixed(1)} % − ${g * 100} %)`] }); }
    out.avertissements.push('Banque / assurance : ni DCF ni EV/EBITDA ni Altman ; P/B justifié et PER seulement');
  }
  if (hist) methodes.push({ id: 'multiples', nom: hist.nom, pess: hist.pess, central: hist.central, opt: hist.opt, detail: hist.detail });
  out.methodes = methodes;
  if (gr) out.info.push({ id: 'graham', nom: 'Formule de Graham (à titre d’information, ne pilote plus le verdict)', pess: gr.pess, central: gr.central, opt: gr.opt, detail: gr.detail });
  if (methodes.length) {
    const agr = k => { const v = methodes.map(m => m[k]).filter(x => fin(x) && x >= 0); return v.length === 2 ? moy(v) : mediane(v); }, V = { pess: agr('pess'), central: agr('central'), opt: agr('opt') };
    if (V.central > 0) { out.valeur = V; out.mos = (V.central - P) / V.central; out.hypothese = V.central > H.seuilHypothese * P; if (methodes.length === 2) { const a = methodes[0].central, b = methodes[1].central; out.dispersion = Math.abs(a - b) / Math.max(a, b); } }
  }
  return out;
}

/* ───── complétude : part des données nécessaires réellement disponibles (0-1) ───── */
export function completude(f, tech) {
  const A = f.serie || [], L = A[A.length - 1], fi = !!(f.ctxV && f.ctxV.financiere); if (!L) return tech ? 0.35 : 0;
  const champs = fi ? ['rev', 'ni', 'assets', 'eq', 'shA'] : ['rev', 'ni', 'ocf', 'capex', 'ebit', 'assets', 'liab', 'eq', 'debt', 'cash', 'shA'];
  const frac = champs.filter(c => fin(L[c])).length / champs.length, annees = Math.min(1, A.length / 4), prix = A.filter(x => x.px).length >= 3 ? 1 : 0.4;
  return clip(0.7 * frac + 0.15 * annees + 0.15 * prix, 0, 1);
}
