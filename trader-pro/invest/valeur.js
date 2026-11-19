/* ═════════════ VALORISATION LONG TERME D'UNE ENTREPRISE (module PUR, testé, navigateur / Node / Worker Cloudflare) ═════════════
   Entrées : des comptes annuels (fondamentaux gratuits de la SEC EDGAR, voir sources.js), le prix actuel et l'historique mensuel (Yahoo), les opérations sur titres (splits).
   Sorties : valeur estimée par TROIS méthodes (DCF sur les flux de trésorerie libres ; multiples PER, EV/EBITDA et rendement FCF comparés à l'HISTORIQUE de l'entreprise ; formule de Graham),
   fourchette pessimiste / centrale / optimiste, marge de sécurité, badge PAS CHÈRE / PRIX JUSTE / CHÈRE, note de qualité sur 10, Piotroski F-score, Altman Z-score, historique prix / valeur, hypothèses écrites.
   Rien n'est inventé : une donnée manquante désactive la méthode ou le critère qui en dépend, et la fiche le dit. Ce n'est pas un conseil en investissement : une estimation chiffrée avec ses hypothèses visibles. */

export const HYPOTHESES = Object.freeze({
  dcf: { annees: 10, croissanceTerminale: { pessimiste: 0.02, centrale: 0.025, optimiste: 0.03 }, actualisation: { pessimiste: 0.105, centrale: 0.09, optimiste: 0.08 }, decalageCroissance: { pessimiste: -0.03, centrale: 0, optimiste: 0.02 }, croissanceMax: 0.10, croissanceMaxOptimiste: 0.12, poidsCroissanceHistorique: 0.5, croissanceLongTerme: 0.03 },
  multiples: { perMin: 8, perMax: 30, evEbitdaMin: 5, evEbitdaMax: 25, rendementFcfMin: 0.02, rendementFcfMax: 0.10, anneesMin: 3 },
  graham: { rendementObligations: 0.055, coefficient: 4.4, base: 8.5, croissanceMax: 15 },
  verdict: { pasChere: 0.20, chere: -0.15 },
  financieres: ['Finance']
});
export const BADGES = Object.freeze({ PAS_CHERE: 'PAS CHÈRE', JUSTE: 'PRIX JUSTE', CHERE: 'CHÈRE', ND: 'N/D' });

const fin = x => typeof x === 'number' && Number.isFinite(x);
const clip = (x, a, b) => Math.max(a, Math.min(b, x));
const moy = L => (L.length ? L.reduce((s, x) => s + x, 0) / L.length : null);
export const mediane = L => { const A = L.filter(fin).sort((a, b) => a - b); if (!A.length) return null; const m = A.length >> 1; return A.length % 2 ? A[m] : (A[m - 1] + A[m]) / 2; };
export const quantile = (L, q) => { const A = L.filter(fin).sort((a, b) => a - b); if (!A.length) return null; const p = (A.length - 1) * q, i = Math.floor(p); return A[i] + (A[Math.min(A.length - 1, i + 1)] - A[i]) * (p - i); };
const cagr = (a, b, n) => (fin(a) && fin(b) && a > 0 && b > 0 && n > 0 ? Math.pow(b / a, 1 / n) - 1 : null);
const sans = (x, d = null) => (fin(x) ? x : d);

/* prix au plus tard à la date t (ms) dans la série mensuelle [[t, c], …] ; null si la série ne remonte pas jusque-là ou si le dernier point est trop ancien */
export function prixA(mensuel, t) {
  if (!mensuel || !mensuel.length || t < mensuel[0][0]) return null;
  let r = null; for (const p of mensuel) { if (p[0] <= t) r = p; else break; }   // un point mensuel est daté du début de mois et porte la clôture de ce mois : à la fin d'un exercice (31 décembre), c'est le point du 1er décembre
  return r && t - r[0] < 70 * 86400e3 ? r[1] : null;
}
/* produit des splits (numérateur / dénominateur) postérieurs à la date t : un nombre d'actions publié avant un split doit être multiplié par ce facteur, un BPA divisé */
export const facteurSplit = (splits, t) => (splits || []).filter(s => s.t > t).reduce((p, s) => p * (s.num / s.den), 1);

/* ───── 1) DCF sur les flux de trésorerie libres ───── */
export function dcf(base, g0, dette, tresorerie, actions, H = HYPOTHESES.dcf) {
  if (!(base > 0) || !(actions > 0)) return null;
  const un = sc => {
    const g = clip(g0 + H.decalageCroissance[sc], 0, sc === 'optimiste' ? H.croissanceMaxOptimiste : H.croissanceMax), r = H.actualisation[sc], gt = H.croissanceTerminale[sc]; let f = base, vp = 0;
    for (let t = 1; t <= H.annees; t++) { const gt_ = g + (gt - g) * (t - 1) / (H.annees - 1); f *= 1 + gt_; vp += f / Math.pow(1 + r, t); }
    const tv = f * (1 + gt) / (r - gt) / Math.pow(1 + r, H.annees);
    return (vp + tv - sans(dette, 0) + sans(tresorerie, 0)) / actions;
  };
  const o = { pessimiste: un('pessimiste'), centrale: un('centrale'), optimiste: un('optimiste') };
  return o.centrale > 0 ? { pess: Math.max(0, o.pessimiste), central: o.centrale, opt: o.optimiste } : null;
}
/* ───── 3) formule de Graham ───── */
export function graham(bpa, bvps, croissancePct, H = HYPOTHESES.graham) {
  if (!(bpa > 0)) return null;
  const g = clip(sans(croissancePct, 0), 0, H.croissanceMax), formule = bpa * (H.base + 2 * g) * H.coefficient / (H.rendementObligations * 100), nombre = bvps > 0 ? Math.sqrt(22.5 * bpa * bvps) : null;
  return { central: formule, pess: Math.min(nombre == null ? formule * 0.85 : nombre, formule * 0.85), opt: formule * 1.15, nombre, croissance: g };
}

/* ───── Piotroski F-score (9 critères, sur les deux derniers exercices) ───── */
export function piotroski(a, b) {
  if (!a || !b) return { score: null, calculables: 0, criteres: [] };
  const roa = x => (fin(x.ni) && x.assets > 0 ? x.ni / x.assets : null), cr = x => (x.ca > 0 && x.cl > 0 ? x.ca / x.cl : null), levier = x => (fin(x.debt) && x.assets > 0 ? x.debt / x.assets : null);
  const mb = x => (x.rev > 0 && fin(x.gp) ? x.gp / x.rev : null), rot = x => (x.rev > 0 && x.assets > 0 ? x.rev / x.assets : null);
  const T = (nom, v) => ({ nom, ok: v == null ? null : !!v });
  const C = [T('Résultat net positif', fin(a.ni) ? a.ni > 0 : null), T('Flux de trésorerie d’exploitation positif', fin(a.ocf) ? a.ocf > 0 : null),
    T('Rentabilité des actifs (ROA) en hausse', roa(a) != null && roa(b) != null ? roa(a) > roa(b) : null), T('Flux d’exploitation supérieur au résultat net', fin(a.ocf) && fin(a.ni) ? a.ocf > a.ni : null),
    T('Levier (dette / actifs) en baisse', levier(a) != null && levier(b) != null ? levier(a) < levier(b) : null), T('Ratio de liquidité courante en hausse', cr(a) != null && cr(b) != null ? cr(a) > cr(b) : null),
    T('Pas de dilution (actions non émises)', fin(a.sh) && fin(b.sh) ? a.sh <= b.sh * 1.005 : null), T('Marge brute en hausse', mb(a) != null && mb(b) != null ? mb(a) > mb(b) : null), T('Rotation des actifs en hausse', rot(a) != null && rot(b) != null ? rot(a) > rot(b) : null)];
  const calc = C.filter(c => c.ok !== null).length; return { score: calc >= 5 ? C.filter(c => c.ok).length : null, calculables: calc, criteres: C };
}
/* ───── Altman Z-score (version « sociétés cotées » de 1968 ; non applicable aux financières) ───── */
export function altman(a, capitalisation) {
  if (!a || !(a.assets > 0) || !(a.liab > 0) || !fin(a.ca) || !fin(a.cl) || !fin(a.re) || !fin(a.ebit) || !(a.rev > 0) || !(capitalisation > 0)) return { z: null, zone: null };
  const z = 1.2 * (a.ca - a.cl) / a.assets + 1.4 * a.re / a.assets + 3.3 * a.ebit / a.assets + 0.6 * capitalisation / a.liab + 1.0 * a.rev / a.assets;
  return { z, zone: z >= 2.99 ? 'sûre' : z >= 1.81 ? 'grise' : 'détresse' };
}

/* ───── évaluation complète ─────
   annuel : [{ fin, finT, rev, ni, ocf, capex, da, ebit, gp, assets, liab, eq, debt, cash, ca, cl, re, sh, eps, tax, pretax, filedT }] du plus ancien au plus récent
   ctx : { prix, devise, actions (actions en circulation, dernière valeur publiée), actionsT (date de cette valeur), mensuel: [[t, c]], splits: [{ t, num, den }], secteur, nom, tk, maintenant } */
export function evaluer(annuel, ctx) {
  const A = (annuel || []).filter(x => x && fin(x.finT)).sort((x, y) => x.finT - y.finT).slice(-11), maintenant = ctx.maintenant || Date.now(), P = ctx.prix, H = HYPOTHESES;
  const base = { tk: ctx.tk, nom: ctx.nom, secteur: ctx.secteur, pays: 'US', t: maintenant, prix: sans(P), devise: ctx.devise || 'USD', badge: BADGES.ND, mos: null, valeur: null, methodes: [], qualite: null, avertissements: [], hypotheses: [] };
  if (!fin(P) || !(P > 0)) return { ...base, avertissements: ['prix indisponible'] };
  if (A.length < 3) return { ...base, avertissements: ['moins de 3 exercices annuels disponibles : valorisation impossible'] };
  const L = A[A.length - 1], Pr = A.length > 1 ? A[A.length - 2] : null, financiere = H.financieres.includes(ctx.secteur), av = base.avertissements;
  /* nombres d'actions et BPA ramenés à l'échelle d'aujourd'hui (les splits ultérieurs à la publication) */
  /* certaines sociétés publient la moyenne pondérée des actions en millions (ex. 721,9) : on la remet à l'échelle de la page de garde */
  if (fin(ctx.actions) && ctx.actions > 1e6) for (const x of A) if (fin(x.sh) && x.sh > 0 && x.sh < ctx.actions / 300) { let k = 1; while (x.sh * k < ctx.actions / 30 && k < 1e9) k *= 1000; x.sh *= k; x.echelleActions = true; }
  const kS = x => facteurSplit(ctx.splits, x.filedT || x.finT), sh = x => (fin(x.sh) ? x.sh * kS(x) : null), epsA = x => (fin(x.eps) ? x.eps / kS(x) : null);
  const shRef = [L, Pr, A[A.length - 3]].filter(Boolean).map(sh).find(fin), SCouv = fin(ctx.actions) && ctx.actions > 0 ? ctx.actions * facteurSplit(ctx.splits, ctx.actionsT || maintenant) : null;
  /* le nombre d'actions de la page de garde doit rester du même ordre que la moyenne pondérée des comptes ; sinon (catégories d'actions mal additionnées) on prend la moyenne des comptes */
  const S0 = SCouv && (!shRef || (SCouv / shRef > 0.5 && SCouv / shRef < 2)) ? SCouv : shRef || null, mcap = S0 ? S0 * P : null;
  if (SCouv && S0 !== SCouv) av.push('nombre d’actions de la page de garde incohérent avec les comptes : moyenne pondérée des comptes utilisée');
  if (!S0) return { ...base, avertissements: ['nombre d’actions indisponible'] };
  if (maintenant - L.finT > 600 * 86400e3) av.push('derniers comptes annuels anciens (' + L.fin + ')');
  const fcf = x => (fin(x.ocf) && fin(x.capex) ? x.ocf - Math.abs(x.capex) : null), ebitda = x => (fin(x.ebit) && fin(x.da) ? x.ebit + Math.abs(x.da) : null);
  const An = A.map(x => ({ ...x, fcf: fcf(x), ebitda: ebitda(x), epsA: epsA(x), shA: sh(x), px: prixA(ctx.mensuel, x.finT) }));
  const Ln = An[An.length - 1], dette = sans(L.debt, 0), treso = sans(L.cash, 0), methodes = [], hyp = [];
  /* croissances historiques */
  const n5 = Math.min(5, An.length - 1), A5 = An[An.length - 1 - n5];
  const gFcf = cagr(A5.fcf, Ln.fcf, n5), gCa = cagr(A5.rev, Ln.rev, n5), gBpa = cagr(A5.epsA, Ln.epsA, n5), g0 = gFcf != null ? gFcf : gCa;

  /* 1) DCF */
  const fcfs = An.slice(-3).map(x => x.fcf).filter(fin), baseFcf = fcfs.length >= 2 ? moy(fcfs) : null;
  if (financiere) av.push('DCF non applicable aux banques et assurances (les flux de trésorerie ne mesurent pas leur création de valeur)');
  else if (baseFcf > 0 && g0 != null) {
    const gc = clip(H.dcf.poidsCroissanceHistorique * g0 + (1 - H.dcf.poidsCroissanceHistorique) * H.dcf.croissanceLongTerme, 0, H.dcf.croissanceMax), v = dcf(baseFcf, gc, dette, treso, S0);
    if (v) { methodes.push({ id: 'dcf', nom: 'DCF (flux de trésorerie libres)', ...v, detail: [`flux de trésorerie libre de départ : moyenne des ${fcfs.length} derniers exercices = ${Math.round(baseFcf / 1e6)} M$`, `croissance de départ ${(gc * 100).toFixed(1)} % par an, qui s’éteint linéairement vers la croissance terminale sur ${H.dcf.annees} ans`] });
      hyp.push(`DCF : flux libre de départ ${Math.round(baseFcf / 1e6)} M$ (moyenne ${fcfs.length} ans), croissance ${(gc * 100).toFixed(1)} % (moitié historique ${(g0 * 100).toFixed(1)} %, moitié ${(H.dcf.croissanceLongTerme * 100).toFixed(0)} %) vers ${(H.dcf.croissanceTerminale.centrale * 100).toFixed(1)} %, actualisation ${(H.dcf.actualisation.centrale * 100).toFixed(1)} % (pessimiste ${(H.dcf.actualisation.pessimiste * 100).toFixed(1)} %, optimiste ${(H.dcf.actualisation.optimiste * 100).toFixed(1)} %), ${H.dcf.annees} ans, dette nette ${Math.round((dette - treso) / 1e6)} M$.`); }
  } else av.push('DCF indisponible : flux de trésorerie libre insuffisant ou négatif');

  /* 2) multiples comparés à l'historique de l'entreprise */
  const M = H.multiples, per = An.map(x => (x.px && x.epsA > 0 ? x.px / x.epsA : null)).filter(fin), evE = An.map(x => (x.px && x.shA && x.ebitda > 0 ? (x.px * x.shA + sans(x.debt, 0) - sans(x.cash, 0)) / x.ebitda : null)).filter(fin);
  const ry = An.map(x => (x.px && x.shA && x.fcf != null ? x.fcf / (x.px * x.shA) : null)).filter(x => fin(x) && x > 0);
  const triples = [], dtl = [];
  if (per.length >= M.anneesMin && Ln.epsA > 0) { const m = clip(mediane(per), M.perMin, M.perMax), lo = clip(quantile(per, 0.25), M.perMin * 0.75, M.perMax), hi = clip(quantile(per, 0.75), M.perMin, M.perMax * 1.2); triples.push({ pess: Math.min(lo, m) * Ln.epsA, central: m * Ln.epsA, opt: Math.max(hi, m) * Ln.epsA }); dtl.push(`PER historique médian ${m.toFixed(1)} (${per.length} ans) × BPA ${Ln.epsA.toFixed(2)}`); hyp.push(`Multiples : PER médian de l’entreprise sur ${per.length} ans = ${m.toFixed(1)}, borné entre ${M.perMin} et ${M.perMax}.`); }
  if (!financiere && evE.length >= M.anneesMin && Ln.ebitda > 0) { const q = f => clip(f, M.evEbitdaMin, M.evEbitdaMax), m = q(mediane(evE)), g = x => ((x * Ln.ebitda) - dette + treso) / S0; triples.push({ pess: g(q(quantile(evE, 0.25))), central: g(m), opt: g(q(quantile(evE, 0.75))) }); dtl.push(`EV/EBITDA historique médian ${m.toFixed(1)} (${evE.length} ans) × EBITDA ${Math.round(Ln.ebitda / 1e6)} M$`); hyp.push(`Multiples : EV/EBITDA médian de l’entreprise = ${m.toFixed(1)}, borné entre ${M.evEbitdaMin} et ${M.evEbitdaMax}.`); }
  if (!financiere && ry.length >= M.anneesMin && Ln.fcf > 0) { const q = y => clip(y, M.rendementFcfMin, M.rendementFcfMax), m = q(mediane(ry)), g = y => Ln.fcf / q(y) / S0; triples.push({ pess: g(quantile(ry, 0.75)), central: Ln.fcf / m / S0, opt: g(quantile(ry, 0.25)) }); dtl.push(`rendement FCF historique médian ${(m * 100).toFixed(1)} % (${ry.length} ans) appliqué au flux libre ${Math.round(Ln.fcf / 1e6)} M$`); hyp.push(`Multiples : rendement du flux libre médian de l’entreprise = ${(m * 100).toFixed(1)} %, borné entre ${M.rendementFcfMin * 100} et ${M.rendementFcfMax * 100} %.`); }
  if (triples.length) { const t = { pess: moy(triples.map(x => x.pess)), central: moy(triples.map(x => x.central)), opt: moy(triples.map(x => x.opt)) }; if (t.central > 0) methodes.push({ id: 'multiples', nom: 'Multiples (PER, EV/EBITDA, rendement FCF)', pess: Math.max(0, t.pess), central: t.central, opt: t.opt, detail: dtl }); }
  else av.push('multiples indisponibles : historique de prix ou de bénéfices insuffisant');

  /* 3) Graham */
  const bvps = fin(L.eq) && S0 ? L.eq / S0 : null, gr = graham(Ln.epsA, bvps, gBpa != null ? gBpa * 100 : (gCa != null ? gCa * 100 : 0));
  if (gr) { methodes.push({ id: 'graham', nom: 'Formule de Graham', pess: gr.pess, central: gr.central, opt: gr.opt, detail: [`BPA ${Ln.epsA.toFixed(2)} × (${H.graham.base} + 2 × ${gr.croissance.toFixed(1)} % de croissance) × ${H.graham.coefficient} / ${(H.graham.rendementObligations * 100).toFixed(1)} %`, gr.nombre ? `nombre de Graham (√(22,5 × BPA × valeur comptable)) = ${gr.nombre.toFixed(2)}` : 'valeur comptable indisponible'] }); hyp.push(`Graham : BPA × (${H.graham.base} + 2 × croissance) × ${H.graham.coefficient} / rendement des obligations (${(H.graham.rendementObligations * 100).toFixed(1)} %, hypothèse fixe), croissance du BPA sur ${n5} ans plafonnée à ${H.graham.croissanceMax} %.`); }
  else av.push('Graham indisponible : bénéfice par action négatif ou absent');

  base.methodes = methodes;
  if (methodes.length) {
    const agr = k => { const v = methodes.map(m => m[k]); return v.length === 2 ? moy(v) : mediane(v); }, V = { pess: agr('pess'), central: agr('central'), opt: agr('opt') };
    if (V.central > 0) { base.valeur = V; base.mos = (V.central - P) / V.central; base.badge = base.mos >= H.verdict.pasChere ? BADGES.PAS_CHERE : base.mos <= H.verdict.chere ? BADGES.CHERE : BADGES.JUSTE; }
  }

  /* qualité et santé */
  const t = fin(L.tax) && fin(L.pretax) && L.pretax > 0 ? clip(L.tax / L.pretax, 0, 0.35) : 0.21, capInv = fin(L.eq) ? L.eq + dette - treso : null;
  const roic = fin(L.ebit) && capInv > 0 ? L.ebit * (1 - t) / capInv : null, mOp = L.rev > 0 && fin(L.ebit) ? L.ebit / L.rev : null, mNet = L.rev > 0 && fin(L.ni) ? L.ni / L.rev : null, roe = fin(L.ni) && L.eq > 0 ? L.ni / L.eq : null;
  const detteNetteEbitda = Ln.ebitda > 0 ? (dette - treso) / Ln.ebitda : (dette - treso <= 0 ? 0 : null), pk = piotroski(L, Pr), az = financiere ? { z: null, zone: null } : altman(L, mcap);
  const parts = [], P1 = (nom, v, note) => { if (v != null) parts.push({ nom, v: clip(v, 0, 1), note }); };
  P1('Piotroski', financiere || pk.score == null ? null : pk.score / 9, `${pk.score}/9`); P1('Rentabilité du capital (ROIC)', roic == null ? null : roic / 0.15, roic == null ? '' : (roic * 100).toFixed(1) + ' %');
  P1('Rentabilité des fonds propres (ROE)', roe == null ? null : roe / 0.15, roe == null ? '' : (roe * 100).toFixed(1) + ' %'); P1(financiere ? 'Marge nette' : 'Marge opérationnelle', financiere ? (mNet == null ? null : mNet / 0.25) : (mOp == null ? null : mOp / 0.2), financiere ? (mNet == null ? '' : (mNet * 100).toFixed(1) + ' %') : (mOp == null ? '' : (mOp * 100).toFixed(1) + ' %')); P1('Endettement', financiere ? null : detteNetteEbitda == null ? 0 : 1 - detteNetteEbitda / 4, detteNetteEbitda == null ? 'EBITDA négatif' : detteNetteEbitda.toFixed(1) + ' × l’EBITDA');
  P1('Croissance du chiffre d’affaires', gCa == null ? null : gCa / 0.08, gCa == null ? '' : (gCa * 100).toFixed(1) + ' %/an'); P1('Solidité financière (Altman)', az.z == null ? null : (az.z - 1.8) / 1.2, az.z == null ? '' : az.z.toFixed(2));
  base.qualite = parts.length >= 3 ? { note: Math.round(moy(parts.map(p => p.v)) * 100) / 10, parts } : null;
  if (!base.qualite) av.push('note de qualité indisponible : trop peu de critères calculables');

  base.mcap = mcap; base.actions = S0; base.fin = L.fin; base.dernierExercice = L.fin;
  base.ratios = { per: Ln.epsA > 0 ? P / Ln.epsA : null, evEbitda: Ln.ebitda > 0 ? (mcap + dette - treso) / Ln.ebitda : null, rendementFcf: Ln.fcf != null && mcap ? Ln.fcf / mcap : null, margeOp: mOp, margeNette: mNet, roic, roe, detteNetteEbitda, detteFondsPropres: fin(L.eq) && L.eq > 0 ? dette / L.eq : null, croissanceCA: gCa, croissanceBPA: gBpa, croissanceFCF: gFcf, prixValeurComptable: bvps > 0 ? P / bvps : null };
  base.piotroski = pk; base.altman = az; base.serie = An; base.ctxV = { S0, dette, treso, financiere, gCa, gFcf, gBpa };
  base.annees = An.map(x => ({ fin: x.fin, rev: sans(x.rev), ni: sans(x.ni), fcf: sans(x.fcf), eps: sans(x.epsA), ebitda: sans(x.ebitda), dette: sans(x.debt), tresorerie: sans(x.cash) }));

  /* historique : prix mensuel et valeur simplifiée de chaque fin d'exercice (Graham + PER médian × BPA ; jamais la valeur DCF, qui n'a pas d'historique fiable) */
  const medPer = per.length >= M.anneesMin ? clip(mediane(per), M.perMin, M.perMax) : null, valeurs = [];
  An.forEach((x, i) => { if (!(x.epsA > 0)) return; const j = Math.max(0, i - 5), gg = cagr(An[j].epsA, x.epsA, i - j), g = gg == null ? 0.03 * 100 : gg * 100, v1 = graham(x.epsA, fin(x.eq) && x.shA ? x.eq / x.shA : null, g), vv = [v1 && v1.central, medPer ? medPer * x.epsA : null].filter(fin); if (vv.length) valeurs.push([x.finT, moy(vv)]); });
  base.histo = { prix: (ctx.mensuel || []).filter(p => p[0] >= maintenant - 11 * 365 * 86400e3), valeur: valeurs, note: 'Valeur de chaque fin d’exercice = moyenne de la formule de Graham et du PER médian historique × BPA (simplifiée ; la valeur DCF actuelle est dans la jauge).' };
  base.hypotheses = [...hyp, `Valeur retenue : médiane des méthodes disponibles (${methodes.length}). Marge de sécurité = (valeur − prix) / valeur ; PAS CHÈRE si ≥ ${H.verdict.pasChere * 100} %, CHÈRE si ≤ ${H.verdict.chere * 100} %.`, `Données annuelles de la SEC (dernier exercice ${L.fin}) ; prix et historique : Yahoo Finance ; BPA et nombre d’actions ramenés aux splits.`];
  if (financiere) base.hypotheses.push('Banque / assurance : seules les méthodes PER et Graham sont retenues.');
  return base;
}
export const sansFiche = f => { const { annees, histo, hypotheses, methodes, serie, ctxV, ...r } = f; return r; };
/* ligne compacte de l'index (écran principal) */
export function ligneIndex(f) {
  return { tk: f.tk, nom: f.nom, secteur: f.secteur, pays: f.pays, prix: sans(f.prix), devise: f.devise, badge: f.badge, mos: sans(f.mos), v: f.valeur ? Math.round(f.valeur.central * 100) / 100 : null, q: f.qualite ? f.qualite.note : null, pk: f.piotroski && f.piotroski.score != null ? f.piotroski.score : null,
    z: f.altman && f.altman.z != null ? Math.round(f.altman.z * 100) / 100 : null, per: f.ratios && f.ratios.per != null ? Math.round(f.ratios.per * 10) / 10 : null, ev: f.ratios && f.ratios.evEbitda != null ? Math.round(f.ratios.evEbitda * 10) / 10 : null,
    fy: f.ratios && f.ratios.rendementFcf != null ? Math.round(f.ratios.rendementFcf * 1000) / 1000 : null, mc: f.mcap ? Math.round(f.mcap / 1e6) : null, t: f.t, fin: f.fin || null, av: f.avertissements && f.avertissements.length ? f.avertissements[0] : null };
}
/* phrase de Rayle (lue à voix haute) : pourquoi c'est cher ou non, et ce qui ferait changer le verdict */
export function explication(f) {
  const nom = f.nom, eur = x => (fin(x) ? x.toLocaleString('fr-FR', { maximumFractionDigits: x >= 100 ? 0 : 2 }) : '—'), $ = f.devise === 'EUR' ? ' euros' : ' dollars';
  if (!f.valeur) return `Je ne peux pas évaluer ${nom} : ${f.avertissements && f.avertissements[0] ? f.avertissements[0] : 'données insuffisantes'}.`;
  const V = f.valeur, P = [], pc = Math.abs(f.mos * 100).toFixed(0);
  P.push(f.badge === BADGES.PAS_CHERE ? `${nom} paraît pas chère : l’action vaut ${eur(f.prix)}${$}, pour une valeur estimée à ${eur(V.central)}${$}, soit une marge de sécurité de ${pc} pour cent.` : f.badge === BADGES.CHERE ? `${nom} paraît chère : l’action vaut ${eur(f.prix)}${$}, pour une valeur estimée à ${eur(V.central)}${$}, soit ${pc} pour cent de trop.` : `${nom} est à un prix juste : l’action vaut ${eur(f.prix)}${$}, pour une valeur estimée à ${eur(V.central)}${$}.`);
  P.push(`La fourchette va de ${eur(V.pess)} dans le scénario pessimiste à ${eur(V.opt)} dans l’optimiste.`);
  const m = f.methodes.map(x => `${x.id === 'dcf' ? 'le DCF' : x.id === 'graham' ? 'la formule de Graham' : 'la méthode des multiples'} donne ${eur(x.central)}`); if (m.length) P.push('Selon les méthodes : ' + m.join(', ') + '.');
  if (f.qualite) P.push(`La qualité est notée ${f.qualite.note.toFixed(1).replace('.', ',')} sur 10${f.piotroski && f.piotroski.score != null ? `, avec un score de Piotroski de ${f.piotroski.score} sur 9` : ''}.`);
  const seuilPas = V.central * (1 - HYPOTHESES.verdict.pasChere)
  if (f.badge === BADGES.CHERE || f.badge === BADGES.JUSTE) P.push(`Elle deviendrait pas chère sous ${eur(seuilPas)}${$}, ou si les bénéfices et les flux de trésorerie progressaient assez pour relever la valeur estimée.`);
  else P.push(`Elle redeviendrait un prix juste au-dessus de ${eur(seuilPas)}${$}, ou si les flux de trésorerie décevaient et faisaient baisser la valeur estimée.`);
  P.push('C’est une estimation fondée sur des hypothèses visibles dans la fiche, pas un conseil d’investissement.');
  return P.join(' ');
}
