import { basAvant, hautAvant } from './contexte.js';
import { construireMicro } from './micro-mesures.js';
import { ema } from './indic.js';
import { alea } from '../mars-calcul.js';
import { absorptionVec, divergenceVec, balayagesVec, attacherFluxBougies } from '../../../../strategies/liquidite/contexte-flux.js';

/* ═════════════ RÈGLES DU LABORATOIRE (M5 ; module pur, testé : m5-regles-test.mjs) ═════════════
   Une RÈGLE est une description structurée (JSON) d'une idée de trade : des conditions sur la phase, le volume, le delta, les zones, les sessions, les indicateurs, sur M15, H1 ou H4,
   plus un stop et un objectif. Elle est compilée en signaux CAUSAUX (le signal en i n'utilise que les bougies 0..i et les bougies H1 / H4 déjà fermées) et passe EXACTEMENT les mêmes critères
   que les familles de hypotheses.js. Trois sources de règles : le constructeur (à la main), l'idée libre traduite par le Worker (validée par `validerRegle`, puis CONFIRMÉE par l'utilisatrice avant tout test),
   et le générateur aléatoire de l'agent (`regleAleatoire`, graine fixe : reproductible). Aucun appel à l'IA ici.
   Format : { nom, cote: 'long' | 'short' | 'les-deux', conditions: [{ type, … }], stop: { type: 'atr', tf, k } | { type: 'structure', L, pad }, R }.
   Les conditions sont écrites « dans le sens du trade » : pour 'short' elles sont lues en miroir (au-dessus ↔ en dessous, RSI bas ↔ RSI haut). */
const DEPART = 400, PAS = 900e3;
const MS_TF = { m15: PAS, h1: 3600e3, h4: 14400e3 };

/* ── Catalogue : ce que le constructeur propose, avec bornes (une règle hors catalogue ou hors bornes est refusée) ── */
export const CATALOGUE = Object.freeze({
  phase: { nom: 'Phase du marché', champs: { tf: ['h1', 'h4'], valeurs: ['tendance', 'contre', 'range', 'transition', 'hausse', 'baisse'] } },
  session: { nom: 'Session', champs: { valeurs: [0, 1, 2, 3] } },
  jours: { nom: 'Jours de la semaine (UTC, 0 = dimanche)', champs: { valeurs: [0, 1, 2, 3, 4, 5, 6] } },
  volume: { nom: 'Volume relatif (× la moyenne des 20 bougies)', champs: { min: [0.5, 5] } },
  delta: { nom: 'Delta (volume acheteur − vendeur)', champs: { sens: ['avec', 'contre'], ratioMin: [0, 0.6] } },
  rsi: { nom: 'RSI', champs: { tf: ['m15', 'h1', 'h4'], periode: [5, 30], op: ['<', '>'], seuil: [10, 90] } },
  ema: { nom: 'Prix par rapport à une EMA', champs: { tf: ['m15', 'h1', 'h4'], periode: [10, 200], position: ['avec', 'contre'] } },
  croisement: { nom: 'Le prix croise une EMA (événement)', champs: { tf: ['m15', 'h1', 'h4'], periode: [10, 200] } },
  cassure: { nom: 'Cassure du plus haut / plus bas de N bougies (événement)', champs: { tf: ['m15', 'h1', 'h4'], N: [10, 300] } },
  balayage: { nom: 'Balayage d’un extrême refermé à l’intérieur (événement)', champs: { N: [24, 300], meche: [0.2, 0.8] } },
  meche: { nom: 'Mèche de rejet dans le sens du trade', champs: { ratio: [0.3, 0.8] } },
  zone: { nom: 'Prix près d’une zone', champs: { nom: ['poc', 'val', 'vah', 'vwap', 'asie_haut', 'asie_bas', 'veille_haut', 'veille_bas'], distance: [0.1, 2] } },
  regime: { nom: 'Régime de marché (phases H4 et H1, volatilité) ; haussier / baissier sont ABSOLUS (pas relatifs au côté du trade)', champs: { valeurs: ['haussier', 'baissier', 'range', 'volatil'] } },
  volatilite: { nom: 'Volatilité H1 (rang sur 30 jours, 0 à 1)', champs: { min: [0, 1], max: [0, 1] } },
  // V4 : flux et liquidité (événements causaux sur les bougies M15 fermées)
  absorption: { nom: 'Absorption : gros delta agressif sans que le prix avance (événement)', champs: { facteur: [1.5, 4] } },
  divergence_cvd: { nom: 'Divergence prix / CVD aux extrêmes (événement)', champs: { fenetre: [12, 120] } },
  balayage_liquidite: { nom: 'Balayage de plus hauts / bas égaux ou d’un extrême du jour ou de la semaine précédents, refermé à l’intérieur (événement)', champs: { minTouches: [2, 4] } },
  flux_persistant: { nom: 'Delta de même sens sur k bougies de suite (état)', champs: { k: [2, 8], seuil: [0.03, 0.3] } }
});
export const STOPS = Object.freeze({ atr: { k: [0.8, 4], tf: ['h1', 'h4'] }, structure: { L: [8, 96], pad: [0.1, 1] } });
export const LIMITES = Object.freeze({ conditionsMax: 6, R: [1, 8] });

const estNombre = x => typeof x === 'number' && Number.isFinite(x);
/* Valide une règle (venant du constructeur, du Worker ou d'un fichier). Rend { ok, erreurs[], regle } ; regle = copie nettoyée (champs inconnus supprimés). */
export function validerRegle(brut) {
  const erreurs = [];
  if (!brut || typeof brut !== 'object') return { ok: false, erreurs: ['règle absente'], regle: null };
  const regle = { nom: String(brut.nom || 'Règle sans nom').slice(0, 80), cote: brut.cote, conditions: [], stop: null, R: brut.R };
  if (!['long', 'short', 'les-deux'].includes(regle.cote)) erreurs.push('côté inconnu (long, short ou les-deux)');
  if (!Array.isArray(brut.conditions) || !brut.conditions.length) erreurs.push('au moins une condition est nécessaire');
  else if (brut.conditions.length > LIMITES.conditionsMax) erreurs.push('trop de conditions (maximum ' + LIMITES.conditionsMax + ')');
  else for (const c of brut.conditions) {
    const cat = c && CATALOGUE[c.type]; if (!cat) { erreurs.push('condition inconnue : ' + (c && c.type)); continue; }
    const n = { type: c.type };
    for (const [champ, domaine] of Object.entries(cat.champs)) {
      let val = c[champ];
      if (champ === 'valeurs') { if (!Array.isArray(val) || !val.length || !val.every(x => domaine.includes(x))) { erreurs.push(c.type + ' : valeurs invalides'); continue; } n[champ] = [...new Set(val)]; }
      else if (Array.isArray(domaine) && typeof domaine[0] === 'string') { if (!domaine.includes(val)) { erreurs.push(c.type + ' : ' + champ + ' invalide'); continue; } n[champ] = val; }
      else if (champ === 'min' || champ === 'max' || champ === 'ratioMin') { if (val == null) { if (champ === 'ratioMin') val = 0; else if (c.type === 'volatilite') { n[champ] = champ === 'min' ? 0 : 1; continue; } } if (!estNombre(val) || val < domaine[0] || val > domaine[1]) { erreurs.push(c.type + ' : ' + champ + ' hors bornes ' + domaine.join(' à ')); continue; } n[champ] = val; }
      else { if (!estNombre(val) || val < domaine[0] || val > domaine[1]) { erreurs.push(c.type + ' : ' + champ + ' hors bornes ' + domaine.join(' à ')); continue; } n[champ] = champ === 'periode' || champ === 'N' || champ === 'fenetre' || champ === 'minTouches' || champ === 'k' ? Math.round(val) : val; }
    }
    regle.conditions.push(n);
  }
  const s = brut.stop;
  if (!s || !STOPS[s.type]) erreurs.push('stop inconnu (atr ou structure)');
  else {
    const d = STOPS[s.type], ns = { type: s.type };
    for (const [champ, dom] of Object.entries(d)) { const val = s[champ]; if (typeof dom[0] === 'string') { if (!dom.includes(val)) erreurs.push('stop : ' + champ + ' invalide'); else ns[champ] = val; } else if (!estNombre(val) || val < dom[0] || val > dom[1]) erreurs.push('stop : ' + champ + ' hors bornes ' + dom.join(' à ')); else ns[champ] = champ === 'L' ? Math.round(val) : val; }
    regle.stop = ns;
  }
  if (!estNombre(regle.R) || regle.R < LIMITES.R[0] || regle.R > LIMITES.R[1]) erreurs.push('objectif R hors bornes (' + LIMITES.R.join(' à ') + ')');
  return { ok: !erreurs.length, erreurs, regle: erreurs.length ? null : regle };
}

/* ── Séries nécessaires, calculées une fois par contexte ── */
function rsiSerie(c, p) {
  const n = c.length, out = new Float64Array(n).fill(NaN); if (n <= p) return out;
  let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= p; l /= p; out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < n; i++) { const d = c[i] - c[i - 1]; g = (g * (p - 1) + (d > 0 ? d : 0)) / p; l = (l * (p - 1) + (d < 0 ? -d : 0)) / p; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}
const mem = (ctx, cle, f) => { if (!ctx.cache.has(cle)) ctx.cache.set(cle, f()); return ctx.cache.get(cle); };
const serieTf = (ctx, tf) => (tf === 'm15' ? ctx.m15 : tf === 'h1' ? ctx.h1.serie : ctx.h4.serie);
const idxTf = (ctx, tf) => (tf === 'm15' ? null : tf === 'h1' ? ctx.h1.idx : ctx.h4.idx);
/* Valeur d'un tableau de la série tf, alignée sur M15 (dernière bougie tf CONNUE à la clôture de la bougie M15 i). */
const alignerSur = (ctx, tf, arr) => { if (tf === 'm15') return arr; const idx = idxTf(ctx, tf), n = ctx.n, out = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = arr[k]; } return out; };
/* finTf[i] = 1 si la bougie M15 i est la DERNIÈRE sous-bougie d'une bougie tf complète (événement « clôture tf »). */
const finTf = (ctx, tf) => mem(ctx, 'fin:' + tf, () => {
  const n = ctx.n, out = new Uint8Array(n); if (tf === 'm15') { out.fill(1); return out; }
  const idx = idxTf(ctx, tf), S = serieTf(ctx, tf), ms = MS_TF[tf], t = ctx.m15.t;
  for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0 && S.t[k] + ms === t[i] + PAS) out[i] = 1; }
  return out;
});
const emaTf = (ctx, tf, p) => mem(ctx, 'emaTf:' + tf + p, () => alignerSur(ctx, tf, ema(serieTf(ctx, tf).c, p)));
const closeTf = (ctx, tf) => mem(ctx, 'closeTf:' + tf, () => alignerSur(ctx, tf, serieTf(ctx, tf).c));
const rsiTf = (ctx, tf, p) => mem(ctx, 'rsiTf:' + tf + p, () => alignerSur(ctx, tf, rsiSerie(serieTf(ctx, tf).c, p)));
function extremeTf(ctx, tf, N, haut) {                       // plus haut / plus bas des N bougies tf PRÉCÉDENTES (la bougie tf qui vient de fermer est exclue), aligné sur M15
  return mem(ctx, 'ext:' + tf + N + (haut ? 'h' : 'b'), () => {
    const S = serieTf(ctx, tf), x = haut ? S.h : S.l, m = S.n, out = new Float64Array(m).fill(NaN);
    for (let k = N; k < m; k++) { let e = haut ? -Infinity : Infinity; for (let j = k - N; j < k; j++) { if (haut ? x[j] > e : x[j] < e) e = x[j]; } out[k] = e; }
    return alignerSur(ctx, tf, out);
  });
}
const rangVol = ctx => ctx.h1.atrRang;

/* Masque d'une condition pour le côté s (+1 achat, −1 vente) : Uint8Array de longueur n. */
export function masque(ctx, c, s) {
  const n = ctx.n, m = new Uint8Array(n), { m15 } = ctx, mi = (c.type === 'zone' || c.type === 'volume' || c.type === 'delta') ? construireMicro(ctx) : null;
  const cle = 'masque:' + JSON.stringify(c) + s; if (ctx.cache.has(cle)) return ctx.cache.get(cle);
  switch (c.type) {
    case 'phase': {
      const ph = c.tf === 'h4' ? ctx.h4.phase : ctx.h1.phase, vals = new Set(c.valeurs.map(v => v === 'tendance' ? (s > 0 ? 1 : 2) : v === 'contre' ? (s > 0 ? 2 : 1) : v === 'hausse' ? 1 : v === 'baisse' ? 2 : v === 'range' ? 3 : 0));
      for (let i = 0; i < n; i++) m[i] = vals.has(ph[i]) ? 1 : 0; break;
    }
    case 'session': { const sess = construireMicro(ctx).sess, v = new Set(c.valeurs); for (let i = 0; i < n; i++) m[i] = v.has(sess[i]) ? 1 : 0; break; }
    case 'jours': { const v = new Set(c.valeurs); for (let i = 0; i < n; i++) m[i] = v.has(Math.floor(m15.t[i] / 86400e3 + 4) % 7) ? 1 : 0; break; }   // 1970-01-01 = jeudi (4)
    case 'volume': for (let i = 0; i < n; i++) m[i] = mi.volRel[i] >= c.min ? 1 : 0; break;
    case 'delta': for (let i = 0; i < n; i++) { const r = mi.deltaRatio[i]; m[i] = (c.sens === 'avec' ? s * r >= c.ratioMin && r !== 0 : -s * r >= c.ratioMin && r !== 0) ? 1 : 0; } break;
    case 'rsi': { const r = rsiTf(ctx, c.tf, c.periode), seuil = s > 0 ? c.seuil : 100 - c.seuil, op = s > 0 ? c.op : (c.op === '<' ? '>' : '<'); for (let i = 0; i < n; i++) m[i] = (op === '<' ? r[i] < seuil : r[i] > seuil) ? 1 : 0; break; }
    case 'ema': { const e = emaTf(ctx, c.tf, c.periode), cl = closeTf(ctx, c.tf), au = (c.position === 'avec') === (s > 0); for (let i = 0; i < n; i++) m[i] = (au ? cl[i] > e[i] : cl[i] < e[i]) ? 1 : 0; break; }
    case 'croisement': {
      const e = emaTf(ctx, c.tf, c.periode), cl = closeTf(ctx, c.tf), f = finTf(ctx, c.tf);
      // événement : à la clôture d'une bougie tf, le prix passe de l'autre côté de l'EMA (dans le sens du trade)
      let prec = NaN; for (let i = 0; i < n; i++) { if (!f[i]) continue; const d = cl[i] - e[i]; if (Number.isFinite(prec) && Number.isFinite(d) && (s > 0 ? prec <= 0 && d > 0 : prec >= 0 && d < 0)) m[i] = 1; prec = d; }
      break;
    }
    case 'cassure': {
      if (c.tf === 'm15') { const hh = hautAvant(ctx, c.N), ll = basAvant(ctx, c.N); for (let i = 1; i < n; i++) m[i] = (s > 0 ? m15.c[i] > hh[i] && m15.c[i - 1] <= hh[i] : m15.c[i] < ll[i] && m15.c[i - 1] >= ll[i]) ? 1 : 0; break; }
      const ex = extremeTf(ctx, c.tf, c.N, s > 0), cl = closeTf(ctx, c.tf), f = finTf(ctx, c.tf);
      for (let i = 0; i < n; i++) m[i] = (f[i] && (s > 0 ? cl[i] > ex[i] : cl[i] < ex[i])) ? 1 : 0; break;
    }
    case 'balayage': {
      const hh = hautAvant(ctx, c.N), ll = basAvant(ctx, c.N);
      for (let i = 0; i < n; i++) { const e = m15.h[i] - m15.l[i]; if (!(e > 0)) continue; m[i] = (s > 0 ? m15.l[i] < ll[i] && m15.c[i] > ll[i] && (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / e >= c.meche : m15.h[i] > hh[i] && m15.c[i] < hh[i] && (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / e >= c.meche) ? 1 : 0; }
      break;
    }
    case 'meche': for (let i = 0; i < n; i++) { const e = m15.h[i] - m15.l[i]; if (!(e > 0)) continue; m[i] = ((s > 0 ? Math.min(m15.o[i], m15.c[i]) - m15.l[i] : m15.h[i] - Math.max(m15.o[i], m15.c[i])) / e >= c.ratio) ? 1 : 0; } break;
    case 'zone': {
      const niv = { poc: ctx.h1.poc, val: ctx.h1.val, vah: ctx.h1.vah, vwap: mi.vwap, asie_haut: mi.asiaHaut, asie_bas: mi.asiaBas, veille_haut: mi.veilleHaut, veille_bas: mi.veilleBas }[c.nom], a = ctx.h1.atr;
      for (let i = 0; i < n; i++) m[i] = (a[i] > 0 && niv[i] > 0 && Math.abs(m15.c[i] - niv[i]) <= c.distance * a[i]) ? 1 : 0; break;
    }
    case 'volatilite': { const r = rangVol(ctx); for (let i = 0; i < n; i++) m[i] = (r[i] >= c.min && r[i] <= c.max) ? 1 : 0; break; }
    case 'regime': {                                          // M6 : régime causal à la clôture de i (phases H4 et H1 connues, rang de volatilité H1) ; une stratégie peut donc être conditionnelle à un régime
      const v = new Set(c.valeurs), r = rangVol(ctx), p4 = ctx.h4.phase, p1 = ctx.h1.phase;
      for (let i = 0; i < n; i++) { const code = r[i] >= 0.85 ? 'volatil' : p4[i] === 1 && p1[i] !== 2 ? 'haussier' : p4[i] === 2 && p1[i] !== 1 ? 'baissier' : p4[i] === 3 || p1[i] === 3 ? 'range' : 'transition'; m[i] = v.has(code) ? 1 : 0; }
      break;
    }
    // V4 : flux et liquidité (mêmes vecteurs causaux que les familles de strategies/familles-v4.js)
    case 'absorption': { const a = absorptionVec(ctx, c.facteur, 0.25).sens; for (let i = 0; i < n; i++) m[i] = a[i] === s ? 1 : 0; break; }
    case 'divergence_cvd': { const d = divergenceVec(ctx, c.fenetre); for (let i = 0; i < n; i++) m[i] = d[i] === s ? 1 : 0; break; }
    case 'balayage_liquidite': { const b = balayagesVec(ctx, c.minTouches).sens; for (let i = 0; i < n; i++) m[i] = b[i] === s ? 1 : 0; break; }
    case 'flux_persistant': {
      const fl = attacherFluxBougies(ctx); for (let i = c.k; i < n; i++) { let somme = 0, vol = 0, bons = 0, ok2 = true; for (let j = i - c.k + 1; j <= i; j++) { const d = fl.delta[j]; if (!Number.isFinite(d)) { ok2 = false; break; } somme += d; vol += fl.achat[j] + fl.vente[j]; if (d * s > 0) bons++; } m[i] = ok2 && bons >= c.k - 1 && vol > 0 && somme * s / vol >= c.seuil ? 1 : 0; }
      break;
    }
    default: break;
  }
  ctx.cache.set(cle, m); return m;
}

/* Signaux d'une règle (même format que les familles) : { sens: Int8Array, stop: Float64Array, R }. Déclenchement sur le FRONT MONTANT du masque (une seule fois par situation). */
export function signauxDepuisRegle(ctx, regle) {
  const n = ctx.n, out = { sens: new Int8Array(n), stop: new Float64Array(n), R: regle.R }, { m15 } = ctx;
  const cotes = regle.cote === 'long' ? [1] : regle.cote === 'short' ? [-1] : [1, -1];
  for (const s of cotes) {
    const ms = regle.conditions.map(c => masque(ctx, c, s)), a1 = regle.stop.tf === 'h4' ? ctx.h4.atr : ctx.h1.atr; let avant = 0;
    for (let i = DEPART; i < n; i++) {
      let ok = 1; for (let k = 0; k < ms.length; k++) if (!ms[k][i]) { ok = 0; break; }
      const front = ok && !avant; avant = ok;
      if (!front || out.sens[i] !== 0) continue;
      const a = a1[i]; if (!(a > 0)) continue;
      let stop;
      if (regle.stop.type === 'atr') stop = s > 0 ? m15.c[i] - regle.stop.k * a : m15.c[i] + regle.stop.k * a;
      else { let e = s > 0 ? Infinity : -Infinity; for (let j = i - regle.stop.L + 1; j <= i; j++) { if (s > 0 ? m15.l[j] < e : m15.h[j] > e) e = s > 0 ? m15.l[j] : m15.h[j]; } stop = s > 0 ? e - regle.stop.pad * a : e + regle.stop.pad * a; }
      out.sens[i] = s; out.stop[i] = stop;
    }
  }
  return out;
}

/* Famille « regle » : params = la règle elle-même (le moteur d'évaluation ne voit qu'une famille de plus). */
export const FAMILLE_REGLE = Object.freeze({
  id: 'regle', nom: 'Règle du laboratoire', description: 'Règle structurée (voir regles-lab.js).',
  grille: () => ({}), signaux: (ctx, p) => signauxDepuisRegle(ctx, p)
});
export const cleRegle = r => JSON.stringify({ c: r.cote, k: r.conditions, s: r.stop, R: r.R });

/* ── Voisins d'une règle : chaque nombre décalé d'un cran (sert au test de robustesse et à l'ajustement) ── */
const ECHELLE = { N: [12, 24, 36, 48, 72, 96, 144, 192, 240, 300], periode: [5, 8, 10, 14, 20, 30, 50, 100, 200], L: [8, 12, 16, 24, 32, 48, 64, 96] };
const PAS_CHAMP = { min: 0.25, max: 0.1, ratioMin: 0.05, seuil: 5, meche: 0.1, ratio: 0.1, distance: 0.25, k: 0.5, pad: 0.1, R: 1 };
function bornes(type, champ) { return type === 'stop' ? STOPS : CATALOGUE; }
export function voisinsRegle(regle) {
  const out = [], vus = new Set([cleRegle(regle)]);
  const pousser = r => { const v = validerRegle(r); if (v.ok) { const k = cleRegle(v.regle); if (!vus.has(k)) { vus.add(k); out.push(v.regle); } } };
  const copie = () => JSON.parse(JSON.stringify(regle));
  const decale = (valeur, champ) => {
    const e = ECHELLE[champ]; if (e) { const i = e.indexOf(valeur); if (i < 0) { const j = e.findIndex(x => x >= valeur); return [e[Math.max(0, j - 1)], e[Math.min(e.length - 1, j < 0 ? e.length - 1 : j)]].filter(x => x !== valeur); } return [e[i - 1], e[i + 1]].filter(x => x !== undefined); }
    const p = PAS_CHAMP[champ]; return p ? [+(valeur - p).toFixed(4), +(valeur + p).toFixed(4)] : [];
  };
  regle.conditions.forEach((c, ci) => { for (const [champ, val] of Object.entries(c)) { if (champ === 'type' || typeof val !== 'number') continue; for (const nv of decale(val, champ)) { const r = copie(); r.conditions[ci][champ] = nv; pousser(r); } } });
  for (const [champ, val] of Object.entries(regle.stop)) { if (typeof val !== 'number') continue; for (const nv of decale(val, champ)) { const r = copie(); r.stop[champ] = nv; pousser(r); } }
  for (const nv of decale(regle.R, 'R')) { const r = copie(); r.R = nv; pousser(r); }
  return out;
}

/* ── Générateur aléatoire (graine fixe → mêmes règles pour la même graine ; l'agent l'utilise pour élargir sa recherche sans fin) ── */
const choisir = (a, liste) => liste[Math.floor(a() * liste.length)];
const entre = (a, lo, hi, pas) => +(lo + Math.floor(a() * ((hi - lo) / pas + 1)) * pas).toFixed(4);
function conditionAleatoire(a, type) {
  switch (type) {
    case 'phase': return { type, tf: choisir(a, ['h1', 'h4']), valeurs: [choisir(a, ['tendance', 'tendance', 'range', 'contre', 'transition'])] };
    case 'session': return { type, valeurs: [choisir(a, [0, 1, 2, 3])] };
    case 'jours': return { type, valeurs: choisir(a, [[1, 2, 3, 4, 5], [0, 6], [1, 2, 3], [4, 5]]) };
    case 'volume': return { type, min: entre(a, 1, 3, 0.5) };
    case 'delta': return { type, sens: choisir(a, ['avec', 'avec', 'contre']), ratioMin: choisir(a, [0, 0.05, 0.1]) };
    case 'rsi': { const bas = a() < 0.5; return { type, tf: choisir(a, ['m15', 'h1', 'h4']), periode: choisir(a, [7, 14, 21]), op: bas ? '<' : '>', seuil: bas ? choisir(a, [20, 25, 30, 35]) : choisir(a, [65, 70, 75, 80]) }; }
    case 'ema': return { type, tf: choisir(a, ['m15', 'h1', 'h4']), periode: choisir(a, [20, 50, 100, 200]), position: choisir(a, ['avec', 'avec', 'contre']) };
    case 'croisement': return { type, tf: choisir(a, ['m15', 'h1', 'h4']), periode: choisir(a, [20, 50, 100]) };
    case 'cassure': return { type, tf: choisir(a, ['m15', 'h1', 'h4']), N: choisir(a, [24, 48, 96, 144, 192]) };
    case 'balayage': return { type, N: choisir(a, [48, 96, 192]), meche: choisir(a, [0.3, 0.4, 0.5]) };
    case 'meche': return { type, ratio: choisir(a, [0.4, 0.5, 0.6]) };
    case 'zone': return { type, nom: choisir(a, CATALOGUE.zone.champs.nom), distance: choisir(a, [0.25, 0.5, 1]) };
    case 'regime': return { type, valeurs: [choisir(a, ['haussier', 'baissier', 'range', 'volatil'])] };
    case 'volatilite': return a() < 0.5 ? { type, min: 0, max: choisir(a, [0.3, 0.4]) } : { type, min: choisir(a, [0.6, 0.7]), max: 1 };
    default: return null;
  }
}
const DECLENCHEURS = ['cassure', 'croisement', 'balayage', 'rsi', 'meche', 'zone'];       // au moins un « déclencheur » ; le reste = contexte
const CONTEXTES = ['phase', 'phase', 'session', 'jours', 'volume', 'delta', 'ema', 'volatilite', 'zone'];
/* `focus` (M6, facultatif) : { declencheurs?: [...], contextes?: [...], tfs?: ['h1','h4'] } restreint le tirage après un PIVOT de recherche (voir agent-m6/stagnation.js). Sans focus, le tirage est
   exactement celui de M5 (même graine, même règle : le compteur de variantes et les essais déjà faits restent valables). */
export function regleAleatoire(graine, focus = null) {
  const a = alea(graine >>> 0), conditions = [], nCtx = Math.floor(a() * 3);                     // 0 à 2 conditions de contexte
  const decls = focus && focus.declencheurs && focus.declencheurs.length ? focus.declencheurs : DECLENCHEURS, ctxs = focus && focus.contextes && focus.contextes.length ? focus.contextes : CONTEXTES;
  const decl = conditionAleatoire(a, choisir(a, decls)); conditions.push(decl);
  for (let k = 0; k < nCtx; k++) { const c = conditionAleatoire(a, choisir(a, ctxs)); if (c && !conditions.some(x => x.type === c.type && x.tf === c.tf)) conditions.push(c); }
  const stop = a() < 0.5 ? { type: 'atr', tf: choisir(a, ['h1', 'h4']), k: choisir(a, [1, 1.5, 2, 3]) } : { type: 'structure', L: choisir(a, [12, 24, 48]), pad: choisir(a, [0.2, 0.5]) };
  const v = validerRegle({ nom: 'Règle aléatoire ' + (graine >>> 0).toString(36), cote: choisir(a, ['long', 'short', 'les-deux', 'les-deux', 'les-deux']), conditions, stop, R: choisir(a, [1.5, 2, 3, 4, 5]) });
  return v.ok ? v.regle : null;
}

/* ── Description en français, pour la carte de stratégie et le journal ── */
const NOM_SESSION = { 0: 'l’Asie', 1: 'Londres', 2: 'New York', 3: 'la fin de journée' }, JOURS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export function decrireCondition(c) {
  switch (c.type) {
    case 'phase': return 'phase ' + c.tf.toUpperCase() + ' : ' + c.valeurs.join(' / ');
    case 'session': return 'session ' + c.valeurs.map(v => NOM_SESSION[v]).join(' ou ');
    case 'jours': return 'jour ' + c.valeurs.map(v => JOURS_FR[v]).join(', ');
    case 'volume': return 'volume ≥ ' + c.min + ' × la normale';
    case 'delta': return 'delta ' + (c.sens === 'avec' ? 'dans le sens du trade' : 'à contre-sens') + (c.ratioMin ? ' (≥ ' + Math.round(c.ratioMin * 100) + ' % du volume)' : '');
    case 'rsi': return 'RSI ' + c.periode + ' ' + c.tf.toUpperCase() + ' ' + c.op + ' ' + c.seuil;
    case 'ema': return 'prix ' + (c.position === 'avec' ? 'du bon côté' : 'du mauvais côté') + ' de l’EMA ' + c.periode + ' ' + c.tf.toUpperCase();
    case 'croisement': return 'le prix croise l’EMA ' + c.periode + ' ' + c.tf.toUpperCase();
    case 'cassure': return 'cassure des ' + c.N + ' dernières bougies ' + c.tf.toUpperCase();
    case 'balayage': return 'balayage d’un extrême de ' + c.N + ' bougies refermé à l’intérieur (mèche ≥ ' + Math.round(c.meche * 100) + ' %)';
    case 'meche': return 'mèche de rejet ≥ ' + Math.round(c.ratio * 100) + ' % de la bougie';
    case 'zone': return 'prix à moins de ' + c.distance + ' ATR de ' + ({ poc: 'le POC', val: 'le bas de la zone de valeur', vah: 'le haut de la zone de valeur', vwap: 'le VWAP', asie_haut: 'le haut de l’Asie', asie_bas: 'le bas de l’Asie', veille_haut: 'le haut de la veille', veille_bas: 'le bas de la veille' }[c.nom]);
    case 'regime': return 'régime ' + c.valeurs.join(' ou ');
    case 'absorption': return 'absorption : delta ≥ ' + c.facteur + ' × le delta typique sans que le prix avance';
    case 'divergence_cvd': return 'divergence prix / CVD sur ' + c.fenetre + ' bougies';
    case 'balayage_liquidite': return 'balayage d’une piscine de stops (≥ ' + c.minTouches + ' touches) refermé à l’intérieur';
    case 'flux_persistant': return 'delta de même sens sur ' + c.k + ' bougies (≥ ' + Math.round(c.seuil * 100) + ' % du volume)';
    case 'volatilite': return 'volatilité H1 entre ' + Math.round(c.min * 100) + ' % et ' + Math.round(c.max * 100) + ' % de sa plage récente';
    default: return c.type;
  }
}
export function decrireRegle(r) {
  const stop = r.stop.type === 'atr' ? r.stop.k + ' ATR ' + r.stop.tf.toUpperCase() : 'sous/sur l’extrême des ' + r.stop.L + ' dernières bougies (+ ' + r.stop.pad + ' ATR)';
  return (r.cote === 'les-deux' ? 'Achat ou vente' : r.cote === 'long' ? 'Achat' : 'Vente') + ' quand : ' + r.conditions.map(decrireCondition).join(' ET ') + '. Stop : ' + stop + '. Objectif : ' + r.R + ' R.';
}

/* ── État des conditions à la bougie j (pour la PRÉPARATION et l'explication) : pour chaque côté, la liste { condition, ok, evenement }. ── */
const EVENEMENTS = new Set(['cassure', 'croisement', 'balayage', 'meche', 'rsi', 'zone', 'absorption', 'divergence_cvd', 'balayage_liquidite']);
export function etatConditions(ctx, regle, j) {
  const cotes = regle.cote === 'long' ? [1] : regle.cote === 'short' ? [-1] : [1, -1];
  return cotes.map(s => ({ sens: s, conditions: regle.conditions.map(c => ({ type: c.type, texte: decrireCondition(c), ok: !!masque(ctx, c, s)[j], declencheur: EVENEMENTS.has(c.type) })) }));
}
/* Préparation : toutes les conditions de contexte sont réunies et il ne manque qu'un ou plusieurs déclencheurs. Rend { sens, manque:[textes], reunies:[textes] } ou null. */
export function approcheRegle(ctx, regle, j) {
  for (const cote of etatConditions(ctx, regle, j)) {
    const manque = cote.conditions.filter(c => !c.ok), reunies = cote.conditions.filter(c => c.ok);
    if (manque.length && manque.length <= 1 && manque.every(c => c.declencheur) && reunies.length >= 1) return { sens: cote.sens, manque: manque.map(c => c.texte), reunies: reunies.map(c => c.texte) };
  }
  return null;
}
