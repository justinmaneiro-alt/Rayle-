import { pivots } from './indic.js';

/* ═════════════ MESURES DE MICROSTRUCTURE (M4 ; module pur, testé : agent-micro-test.mjs) ═════════════
   Calculées dans le navigateur (et dans le Veilleur) à partir des bougies M15 et, si elles sont disponibles, des données gratuites des contrats à terme BTC de Binance
   (financement, intérêt ouvert, ratios long/short : voir deriv-donnees.js). TOUT est CAUSAL : la valeur en i n'utilise que les bougies 0..i (testé par le « poison du futur »).
   Une mesure absente est NaN (jamais inventée) ; chaque grandeur dérivée dit si elle est RÉELLE, ESTIMÉE ou INDISPONIBLE dans `lireMicro`. Aucune mesure n'affirme qu'un acteur précis agit :
   elles décrivent des prix, des volumes et des positions. */
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };
const JOUR = 86400e3, H = 3600e3, PAS = 900e3;

/* ── Sessions (UTC). Une bougie appartient à la session de son OUVERTURE. ── */
export const SESSIONS = Object.freeze({ 0: 'Asie', 1: 'Londres', 2: 'New York', 3: 'creux de fin de journée' });
export const sessionDe = t => { const h = (t % JOUR) / H; return h < 7 ? 0 : h < 13.5 ? 1 : h < 21 ? 2 : 3; };
export const DEBUT_ASIE = 0, FIN_ASIE = 8;     // heures UTC des extrêmes « de la session asiatique » (00 h – 08 h)

/* ── Construction : tableaux alignés sur les bougies M15 de ctx (voir contexte.js) ── */
export function construireMicro(ctx) {
  if (ctx.micro) return ctx.micro;
  const { m15, n } = ctx, t = m15.t;
  const sess = new Uint8Array(n), asiaHaut = nan(n), asiaBas = nan(n), veilleHaut = nan(n), veilleBas = nan(n), vwap = nan(n), sigma = nan(n), volRel = nan(n), ampATR = nan(n), deltaRatio = nan(n), cvd8 = nan(n), ratio8 = nan(n);
  let jour = -1, asiaH = -Infinity, asiaL = Infinity, asiaFinH = NaN, asiaFinL = NaN, jourH = -Infinity, jourL = Infinity, veilleH = NaN, veilleL = NaN, sv = 0, svp = 0, svp2 = 0;
  const fenD = new Float64Array(8), fenV = new Float64Array(8); let sd = 0, sV = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.floor(t[i] / JOUR), h = (t[i] % JOUR) / H;
    if (d !== jour) {                          // nouveau jour UTC : la veille est complète, l'Asie de la veille aussi
      if (jour >= 0) { veilleH = jourH; veilleL = jourL; }
      jour = d; asiaH = -Infinity; asiaL = Infinity; asiaFinH = NaN; asiaFinL = NaN; jourH = -Infinity; jourL = Infinity; sv = 0; svp = 0; svp2 = 0;
    }
    sess[i] = sessionDe(t[i]);
    if (h < FIN_ASIE) { if (m15.h[i] > asiaH) asiaH = m15.h[i]; if (m15.l[i] < asiaL) asiaL = m15.l[i]; if (h + 0.25 >= FIN_ASIE) { asiaFinH = asiaH; asiaFinL = asiaL; } }
    if (h >= FIN_ASIE) { asiaHaut[i] = asiaFinH; asiaBas[i] = asiaFinL; }   // extrêmes de l'Asie : connus seulement quand elle est terminée
    if (m15.h[i] > jourH) jourH = m15.h[i]; if (m15.l[i] < jourL) jourL = m15.l[i];
    veilleHaut[i] = veilleH; veilleBas[i] = veilleL;
    // VWAP ancré à 00 h UTC (prix typique pondéré par le volume), bougie courante incluse
    const tp = (m15.h[i] + m15.l[i] + m15.c[i]) / 3, v = m15.v[i];
    sv += v; svp += v * tp; svp2 += v * tp * tp;
    if (sv > 0) { const w = svp / sv; vwap[i] = w; const vr = svp2 / sv - w * w; sigma[i] = vr > 0 ? Math.sqrt(vr) : 0; }
    // volume relatif, amplitude en ATR, déséquilibre
    if (ctx.volMoy20[i] > 0) volRel[i] = v / ctx.volMoy20[i];
    if (ctx.atr15[i] > 0) ampATR[i] = (m15.h[i] - m15.l[i]) / ctx.atr15[i];
    if (v > 0) deltaRatio[i] = ctx.delta15[i] / v;
    sd += ctx.delta15[i] - fenD[i & 7]; fenD[i & 7] = ctx.delta15[i]; sV += v - fenV[i & 7]; fenV[i & 7] = v; if (i >= 7) { cvd8[i] = sd; if (sV > 0) ratio8[i] = sd / sV; }
  }
  ctx.micro = { sess, asiaHaut, asiaBas, veilleHaut, veilleBas, vwap, sigma, volRel, ampATR, deltaRatio, cvd8, ratio8 };
  return ctx.micro;
}

/* Multiple de `pas` le plus proche d'un prix (prix ronds). */
export const rondLePlusProche = (px, pas) => Math.round(px / pas) * pas;

/* ── Dérivés : alignement causal sur les bougies M15 (voir deriv-donnees.js pour la source) ──
   raw = { funding: [{ t, taux }] trié, metrics: [{ t, oi, oiValeur, lsGros, lsComptes, taker }] trié } ; t en ms. Une valeur n'est utilisée qu'à partir de l'instant où elle est connue :
   financement : à son heure de règlement + 5 minutes de sécurité ; mesures de 5 minutes : à leur heure + 5 minutes de sécurité, et pas plus tard que la clôture de la bougie. */
export function alignerDeriv(t, raw) {
  const n = t.length, out = { funding: nan(n), fundingPct: nan(n), oi: nan(n), oiVar1h: nan(n), oiVar4h: nan(n), taker: nan(n), lsComptes: nan(n), lsGros: nan(n), disponible: { funding: false, oi: false } };
  const f = (raw && raw.funding) || [], m = (raw && raw.metrics) || [];
  let kf = -1, km = -1; const hist = [];
  for (let i = 0; i < n; i++) {
    const cloture = t[i] + PAS;
    while (kf + 1 < f.length && f[kf + 1].t + 300e3 <= cloture) { kf++; hist.push(f[kf].taux); if (hist.length > 270) hist.shift(); }
    if (kf >= 0) {
      out.funding[i] = f[kf].taux;
      if (hist.length >= 30) { let inf = 0, egal = 0; for (const x of hist) { if (x < f[kf].taux) inf++; else if (x === f[kf].taux) egal++; } out.fundingPct[i] = (inf + egal / 2) / hist.length; }
    }
    while (km + 1 < m.length && m[km + 1].t + 300e3 <= cloture) km++;
    if (km >= 0 && cloture - m[km].t < 3 * H) { out.oi[i] = m[km].oi; out.taker[i] = m[km].taker; out.lsComptes[i] = m[km].lsComptes; out.lsGros[i] = m[km].lsGros; }
  }
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(out.oi[i])) {
      if (i >= 4 && Number.isFinite(out.oi[i - 4]) && out.oi[i - 4] > 0) out.oiVar1h[i] = out.oi[i] / out.oi[i - 4] - 1;
      if (i >= 16 && Number.isFinite(out.oi[i - 16]) && out.oi[i - 16] > 0) out.oiVar4h[i] = out.oi[i] / out.oi[i - 16] - 1;
    }
  }
  out.disponible = { funding: f.length > 0, oi: m.length > 0 };
  return out;
}

/* ── Zones de liquidité probables à la dernière bougie i (lecture, pas backtest) ──
   Égaux hauts / égaux bas : plusieurs pivots confirmés (3 bougies de chaque côté) dans une même bande de 0,15 ATR H1, sur les 300 dernières bougies. Plus haut / bas de la veille et de l'Asie. Nombres ronds. */
export function zonesLiquidite(ctx, i = ctx.n - 1, { fenetre = 300, bande = 0.15 } = {}) {
  const mi = construireMicro(ctx), { m15 } = ctx, a = ctx.h1.atr[i], px = m15.c[i]; if (!(a > 0)) return [];
  const de = Math.max(0, i - fenetre), pv = pivots(m15.h.subarray(de, i + 1), m15.l.subarray(de, i + 1), 3);
  const zones = [], ajouter = (type, prix, extra = {}) => { if (Number.isFinite(prix)) zones.push({ type, prix, cote: prix >= px ? 'dessus' : 'dessous', distanceATR: Math.abs(prix - px) / a, ...extra }); };
  const grouper = (indices, valeurs, type) => {
    const tri = indices.map(k => ({ k, v: valeurs[k] })).sort((u, w) => u.v - w.v), pris = new Set();
    for (let s = 0; s < tri.length; s++) {
      if (pris.has(s)) continue; const bas = tri[s].v, groupe = [s];
      for (let u = s + 1; u < tri.length && tri[u].v - bas <= bande * a; u++) groupe.push(u);
      if (groupe.length >= 2) { groupe.forEach(g => pris.add(g)); const moy = groupe.reduce((x, g) => x + tri[g].v, 0) / groupe.length; ajouter(type, type === 'égaux hauts' ? Math.max(...groupe.map(g => tri[g].v)) : Math.min(...groupe.map(g => tri[g].v)), { touches: groupe.length, moyenne: moy }); }
    }
  };
  // pivots confirmés distincts de la fenêtre : un nouveau pivot apparaît quand « l'index du dernier pivot connu » change
  const hautsV = [], basV = []; for (let k = 1; k < pv.haut.length; k++) { if (pv.idxHaut[k] !== pv.idxHaut[k - 1] && pv.idxHaut[k] >= 0) hautsV.push(pv.haut[k]); if (pv.idxBas[k] !== pv.idxBas[k - 1] && pv.idxBas[k] >= 0) basV.push(pv.bas[k]); }
  const idxHauts = hautsV.map((_, k) => k), idxBas = basV.map((_, k) => k);
  grouper(idxHauts, hautsV, 'égaux hauts'); grouper(idxBas, basV, 'égaux bas');
  ajouter('plus haut de la veille', mi.veilleHaut[i]); ajouter('plus bas de la veille', mi.veilleBas[i]);
  ajouter('plus haut de l’Asie', mi.asiaHaut[i]); ajouter('plus bas de l’Asie', mi.asiaBas[i]);
  for (const pas of (ctx.ronds || [10000, 5000])) { const r = rondLePlusProche(px, pas); if (Math.abs(r - px) / a < 6) ajouter('prix rond ' + r.toLocaleString('fr-FR'), r, { rond: true }); }
  // dédoublonnage : deux zones à moins de 0,1 ATR se résument à la première citée
  const finales = []; for (const z of zones.sort((u, w) => u.distanceATR - w.distanceATR)) if (!((z.type === 'égaux hauts' && z.cote === 'dessous') || (z.type === 'égaux bas' && z.cote === 'dessus')) && !finales.some(f => Math.abs(f.prix - z.prix) < 0.1 * a)) finales.push(z);
  return finales;
}

/* ── Absorption possible sur la bougie i (volume élevé, petite amplitude, delta CONTRAIRE à la pression) ──
   Haussière : delta vendeur (ratio ≤ −seuil) mais la bougie ferme dans la moitié haute ; baissière : l'inverse. */
export function absorption(ctx, i, { volMin = 1.8, ampMax = 0.8, ratioMin = 0.12 } = {}) {
  const mi = construireMicro(ctx), m = ctx.m15, e = m.h[i] - m.l[i]; if (!(e > 0) || !(mi.volRel[i] >= volMin) || !(mi.ampATR[i] <= ampMax)) return null;
  const pos = (m.c[i] - m.l[i]) / e, r = mi.deltaRatio[i];
  if (r <= -ratioMin && pos >= 0.5) return { sens: 1, texte: 'volume ' + mi.volRel[i].toFixed(1) + ' fois la normale, delta vendeur mais la bougie ferme dans sa moitié haute : des acheteurs passifs ont peut-être absorbé la vente' };
  if (r >= ratioMin && pos <= 0.5) return { sens: -1, texte: 'volume ' + mi.volRel[i].toFixed(1) + ' fois la normale, delta acheteur mais la bougie ferme dans sa moitié basse : des vendeurs passifs ont peut-être absorbé l’achat' };
  return null;
}

/* ── Indice de liquidations ESTIMÉ (jamais présenté comme une donnée réelle) ──
   Forte baisse de l'intérêt ouvert (≥ seuil sur 1 h) pendant une bougie de grande amplitude (≥ ampMin ATR) : probable fermeture forcée de positions. Sens = côté liquidé (long liquidé si le prix chute). */
export function indiceLiquidations(ctx, deriv, i, { oiBaisse = 0.015, ampMin = 2 } = {}) {
  if (!deriv || !Number.isFinite(deriv.oiVar1h[i])) return null;
  const mi = construireMicro(ctx), m = ctx.m15; let amp = 0, kg = i; for (let k = Math.max(0, i - 3); k <= i; k++) { const x = mi.ampATR[k] || 0; if (x > amp) { amp = x; kg = k; } }
  if (deriv.oiVar1h[i] <= -oiBaisse && amp >= ampMin) return { cote: m.c[kg] < m.o[kg] ? 'longs' : 'shorts', oiVar1h: deriv.oiVar1h[i], amplitudeATR: amp, estime: true };   // côté liquidé = sens de la grande bougie (chute → longs)
  return null;
}

/* ── Lecture complète pour l'interface, la voix et le Veilleur. Rend des objets simples ; chaque bloc porte son `etat` (reel | estime | indisponible) et `phrase` (explication courte). ── */
export function lireMicro(ctx, deriv = null, i = ctx.n - 1) {
  const mi = construireMicro(ctx), m = ctx.m15, a = ctx.h1.atr[i], px = m.c[i], t = m.t[i];
  const out = { ok: Number.isFinite(a) && a > 0, t: t + PAS, prix: px };
  if (!out.ok) return { ok: false, raison: 'Pas assez de bougies pour les mesures de microstructure.' };
  const s = mi.sess[i], hUTC = (t % JOUR) / H;
  out.session = { code: s, nom: SESSIONS[s], heureUTC: hUTC, asie: Number.isFinite(mi.asiaHaut[i]) ? { haut: mi.asiaHaut[i], bas: mi.asiaBas[i], largeurATR: (mi.asiaHaut[i] - mi.asiaBas[i]) / a } : null, volRelHeure: null, etat: 'reel' };
  out.veille = Number.isFinite(mi.veilleHaut[i]) ? { haut: mi.veilleHaut[i], bas: mi.veilleBas[i] } : null;
  out.vwap = Number.isFinite(mi.vwap[i]) ? { prix: mi.vwap[i], sigma: mi.sigma[i], ecarts: mi.sigma[i] > 0 ? (px - mi.vwap[i]) / mi.sigma[i] : 0, pente: i >= 4 && Number.isFinite(mi.vwap[i - 4]) ? (mi.vwap[i] - mi.vwap[i - 4]) / a : null, etat: 'reel', plateforme: 'Binance' } : null;
  out.ronds = (ctx.ronds || [10000, 5000]).map(pas => { const r = rondLePlusProche(px, pas); return { pas, prix: r, distanceATR: Math.abs(r - px) / a }; });
  out.zones = zonesLiquidite(ctx, i);
  out.flux = { volRel: mi.volRel[i], ampATR: mi.ampATR[i], deltaRatio: mi.deltaRatio[i], cvd8: mi.cvd8[i], estime: ctx.deltaEstime && ctx.deltaEstime[i] === 1, absorption: absorption(ctx, i) };
  // compression / expansion : percentile de l'ATR H1 (connu à la clôture) et amplitude M15 relative
  const rang = ctx.h1.atrRang[i];
  out.volatilite = { rangATR: rang, note: rang <= 0.2 ? 'compression : volatilité parmi les plus basses du mois' : rang >= 0.8 ? 'expansion : volatilité parmi les plus hautes du mois' : 'volatilité moyenne', etat: 'reel' };
  if (deriv && deriv.disponible && deriv.disponible.funding && Number.isFinite(deriv.funding[i])) out.financement = { taux: deriv.funding[i], tauxPct: deriv.funding[i] * 100, rang: deriv.fundingPct[i], etat: 'reel', plateforme: 'Binance (contrat perpétuel USDT)',
    note: deriv.fundingPct[i] >= 0.9 ? 'financement très élevé (rang ≥ 90 % sur 90 jours) : beaucoup d’acheteurs à effet de levier' : deriv.fundingPct[i] <= 0.1 ? 'financement très bas (rang ≤ 10 % sur 90 jours) : beaucoup de vendeurs à effet de levier' : 'financement dans sa zone habituelle' };
  else out.financement = { etat: 'indisponible' };
  if (deriv && deriv.disponible && deriv.disponible.oi && Number.isFinite(deriv.oi[i])) {
    const v1 = deriv.oiVar1h[i], v4 = deriv.oiVar4h[i], p1 = i >= 4 ? px / m.c[i - 4] - 1 : null;
    let lecture = 'variation trop faible pour conclure';
    if (v1 != null && p1 != null && Math.abs(v1) >= 0.003) lecture = v1 > 0 ? (p1 > 0 ? 'l’intérêt ouvert monte avec le prix : de nouvelles positions s’ouvrent' : 'l’intérêt ouvert monte alors que le prix baisse : de nouvelles positions s’ouvrent à contre-courant') : (p1 < 0 ? 'l’intérêt ouvert baisse avec le prix : des positions se ferment ou sont liquidées' : 'l’intérêt ouvert baisse alors que le prix monte : des positions se ferment');
    out.interetOuvert = { valeur: deriv.oi[i], var1h: v1, var4h: v4, ratioGros: deriv.lsGros[i], ratioComptes: deriv.lsComptes[i], taker: deriv.taker[i], lecture, etat: 'reel', plateforme: 'Binance (contrats USD-M)' };
  } else out.interetOuvert = { etat: 'indisponible' };
  const liq = indiceLiquidations(ctx, deriv, i);
  out.liquidations = liq ? { ...liq, etat: 'estime' } : { etat: deriv && deriv.disponible && deriv.disponible.oi ? 'estime' : 'indisponible', aucune: true };
  return out;
}
