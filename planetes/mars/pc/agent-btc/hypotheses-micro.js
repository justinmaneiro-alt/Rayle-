import { basAvant, hautAvant } from './contexte.js';
import { construireMicro } from './micro-mesures.js';

/* ═════════════ HYPOTHÈSES DE MICROSTRUCTURE (M4 ; module pur, testé : agent-micro-test.mjs) ═════════════
   PRÉENREGISTRÉES dans docs/microstructure-btc.md, section 3, écrite le 2026-10-22 AVANT toute exécution sur les données : mécanisme, règle, invalidation, nombre de variantes (128 en tout).
   Ce fichier doit rester EXACTEMENT conforme à ce texte ; toute modification de règle = nouvelle version, nouveau préenregistrement, variantes comptées.
   Même interface que hypotheses.js : `grille(gen)` (la même pour toutes les générations : aucune extension automatique), `signaux(ctx, p)` → { sens, stop, R }, CAUSAL (testé par le « poison du futur »).
   Les familles H6 et H7 demandent les données de dérivés de Binance (ctx.deriv, voir deriv-donnees.js / micro-mesures.js:alignerDeriv) ; sans elles elles ne produisent aucun signal.
   Aucune IA. Aucun ordre. Les règles décrivent des prix, des volumes et des positions ; elles n'affirment pas qu'un acteur précis agit. */
const DEPART = 400;
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const maxSur = (x, a, b) => { let m = -Infinity; for (let j = a; j <= b; j++) if (x[j] > m) m = x[j]; return m; };
const minSur = (x, a, b) => { let m = Infinity; for (let j = a; j <= b; j++) if (x[j] < m) m = x[j]; return m; };
const R2 = [4, 6];

export const FAMILLES_MICRO = {
  sweep_asie: {
    id: 'sweep_asie', nom: 'Balayage des extrêmes de la session asiatique',
    description: 'Entre 8 h et 16 h UTC, une mèche dépasse le haut (ou le bas) de la session asiatique avec un volume élevé puis la clôture revient à l’intérieur : les ordres placés au-delà de cet extrême ont été exécutés, le mouvement manque de carburant. Entrée dans le sens opposé au dépassement, stop au-delà de la mèche. Ne suppose aucun acteur précis.',
    grille: () => ({ meche: [0.3, 0.5], volMult: [1.0, 1.5], rb: [1, 2], pad: [0.1, 0.3], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), mi = construireMicro(ctx); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
        const h = (m15.t[i] % 86400e3) / 3600e3; if (h < 8 || h >= 16) continue;
        const AH = mi.asiaHaut[i], AL = mi.asiaBas[i]; if (!(AH > 0) || !(AL > 0) || AH - AL < 0.5 * a) continue;
        let fait = false;
        for (let k = 0; k < p.rb && !fait; k++) {                 // vente : haut de l'Asie balayé
          const j = i - k, e = m15.h[j] - m15.l[j]; if (!(e > 0)) continue;
          if (m15.h[j] > AH && (m15.h[j] - Math.max(m15.o[j], m15.c[j])) / e >= p.meche && mi.volRel[j] >= p.volMult && m15.c[i] < AH && (k === 0 || m15.c[i] < m15.o[i])) { o.sens[i] = -1; o.stop[i] = maxSur(m15.h, j, i) + p.pad * a; fait = true; }
        }
        for (let k = 0; k < p.rb && !fait; k++) {                 // achat : bas de l'Asie balayé
          const j = i - k, e = m15.h[j] - m15.l[j]; if (!(e > 0)) continue;
          if (m15.l[j] < AL && (Math.min(m15.o[j], m15.c[j]) - m15.l[j]) / e >= p.meche && mi.volRel[j] >= p.volMult && m15.c[i] > AL && (k === 0 || m15.c[i] > m15.o[i])) { o.sens[i] = 1; o.stop[i] = minSur(m15.l, j, i) - p.pad * a; fait = true; }
        }
      }
      return o;
    }
  },
  absorption_niveau: {
    id: 'absorption_niveau', nom: 'Absorption sur un niveau de liquidité',
    description: 'Sur un niveau où des ordres sont probables (haut ou bas de la veille, de l’Asie, POC H1), une bougie à gros volume, petite amplitude et delta contraire montre que la pression agressive est absorbée ; la bougie suivante qui confirme déclenche l’entrée. Stop au-delà de la bougie d’absorption.',
    grille: () => ({ volMin: [1.5, 2.5], ampMax: [0.6, 0.9], zoneProx: [0.5, 1.0], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), mi = construireMicro(ctx); o.R = p.R;
      const proche = (x, niveaux, a) => niveaux.some(L => Number.isFinite(L) && Math.abs(x - L) <= p.zoneProx * a);
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], j = i - 1; if (!(a > 0)) continue;
        const e = m15.h[j] - m15.l[j]; if (!(e > 0) || !(mi.volRel[j] >= p.volMin) || !(mi.ampATR[j] <= p.ampMax)) continue;
        const r = mi.deltaRatio[j], pos = (m15.c[j] - m15.l[j]) / e;
        if (r <= -0.12 && pos >= 0.5 && m15.c[i] > m15.h[j] && proche(m15.l[j], [mi.veilleBas[i], mi.asiaBas[i], ctx.h1.poc[i]], a)) { o.sens[i] = 1; o.stop[i] = m15.l[j] - 0.2 * a; }
        else if (r >= 0.12 && pos <= 0.5 && m15.c[i] < m15.l[j] && proche(m15.h[j], [mi.veilleHaut[i], mi.asiaHaut[i], ctx.h1.poc[i]], a)) { o.sens[i] = -1; o.stop[i] = m15.h[j] + 0.2 * a; }
      }
      return o;
    }
  },
  desequilibre_tendance: {
    id: 'desequilibre_tendance', nom: 'Continuation d’un déséquilibre acheteur / vendeur soutenu',
    description: 'Dans le sens de la tendance H1, quand le flux agressif domine durablement (delta cumulé de 8 bougies rapporté à leur volume) et que le prix est du bon côté du VWAP du jour avec une clôture qui dépasse les 8 précédentes, la pression se poursuit. Stop en multiple de l’ATR H1.',
    grille: () => ({ theta: [0.08, 0.15], exigeH4: [0, 1], stopATR: [1, 1.5], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), mi = construireMicro(ctx); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], ph = ctx.h1.phase[i]; if (!(a > 0) || (ph !== 1 && ph !== 2) || !(mi.vwap[i] > 0)) continue;
        const r8 = mi.ratio8[i]; if (!Number.isFinite(r8)) continue;
        if (ph === 1) {
          if (p.exigeH4 && ctx.h4.phase[i] !== 1) continue;
          if (r8 >= p.theta && m15.c[i] > mi.vwap[i] && m15.c[i] > maxSur(m15.c, i - 8, i - 1)) { o.sens[i] = 1; o.stop[i] = m15.c[i] - p.stopATR * a; }
        } else {
          if (p.exigeH4 && ctx.h4.phase[i] !== 2) continue;
          if (r8 <= -p.theta && m15.c[i] < mi.vwap[i] && m15.c[i] < minSur(m15.c, i - 8, i - 1)) { o.sens[i] = -1; o.stop[i] = m15.c[i] + p.stopATR * a; }
        }
      }
      return o;
    }
  },
  vwap_extension: {
    id: 'vwap_extension', nom: 'Retour vers le VWAP après une extension en range',
    description: 'En range H1, un éloignement de k écarts-types du VWAP du jour est rarement durable : le refus de continuer (bougie de retour, mèche) ramène vers la moyenne. Stop au-delà de l’extrême des 3 dernières bougies.',
    grille: () => ({ k: [1.8, 2.4], pad: [0.2, 0.5], rejet: [0, 1], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), mi = construireMicro(ctx); o.R = p.R;
      const z = k => (mi.sigma[k] > 0 ? (m15.c[k] - mi.vwap[k]) / mi.sigma[k] : NaN);
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i]; if (!(a > 0) || ctx.h1.phase[i] !== 3) continue;
        if ((m15.t[i] % 86400e3) / 900e3 < 16) continue;                       // au moins 16 bougies depuis 00 h UTC
        const e = m15.h[i] - m15.l[i]; if (!(e > 0)) continue;
        const z0 = z(i), z1 = z(i - 1); if (!Number.isFinite(z0) || !Number.isFinite(z1)) continue;
        const zmax = Math.max(z0, z1, z(i - 2)), zmin = Math.min(z0, z1, z(i - 2));
        if (zmax >= p.k && m15.c[i] < m15.o[i] && z0 < z1 && (!p.rejet || (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / e >= 0.4)) { o.sens[i] = -1; o.stop[i] = maxSur(m15.h, i - 2, i) + p.pad * a; }
        else if (zmin <= -p.k && m15.c[i] > m15.o[i] && z0 > z1 && (!p.rejet || (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / e >= 0.4)) { o.sens[i] = 1; o.stop[i] = minSur(m15.l, i - 2, i) - p.pad * a; }
      }
      return o;
    }
  },
  prix_ronds: {
    id: 'prix_ronds', nom: 'Nombres ronds : rejet ou franchissement confirmé',
    description: 'Des ordres se concentrent aux multiples de 5 000 ou 10 000 dollars. Mode « rejet » : la bougie traverse le niveau avec une mèche et du volume puis referme du bon côté (trade à l’opposé). Mode « retest » : cassure avec volume, puis retour sur le niveau qui tient (trade dans le sens de la cassure).',
    grille: () => ({ pas: [5000, 10000], mode: ['rejet', 'retest'], volMult: [1.2, 1.8], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), mi = construireMicro(ctx); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i]; if (!(a > 0)) continue;
        if (p.mode === 'rejet') {
          const e = m15.h[i] - m15.l[i]; if (!(e > 0) || !(mi.volRel[i] >= p.volMult)) continue;
          const Lh = Math.floor(m15.h[i] / p.pas) * p.pas, Lb = Math.ceil(m15.l[i] / p.pas) * p.pas;
          if (m15.o[i] < Lh && m15.h[i] > Lh && m15.c[i] < Lh && (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / e >= 0.4) { o.sens[i] = -1; o.stop[i] = m15.h[i] + 0.2 * a; }
          else if (m15.o[i] > Lb && m15.l[i] < Lb && m15.c[i] > Lb && (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / e >= 0.4) { o.sens[i] = 1; o.stop[i] = m15.l[i] - 0.2 * a; }
        } else {
          for (let k = 1; k <= 8 && !o.sens[i]; k++) {
            const j = i - k; if (j < 1 || !(mi.volRel[j] >= p.volMult)) continue;
            const Lu = Math.floor(m15.c[j] / p.pas) * p.pas, Ld = Math.ceil(m15.c[j] / p.pas) * p.pas;
            if (m15.c[j - 1] < Lu && m15.c[j] > Lu + 0.3 * a && minSur(m15.c, j, i) > Lu && m15.l[i] <= Lu + 0.2 * a && m15.c[i] > m15.o[i]) { o.sens[i] = 1; o.stop[i] = Lu - 0.5 * a; }
            else if (m15.c[j - 1] > Ld && m15.c[j] < Ld - 0.3 * a && maxSur(m15.c, j, i) < Ld && m15.h[i] >= Ld - 0.2 * a && m15.c[i] < m15.o[i]) { o.sens[i] = -1; o.stop[i] = Ld + 0.5 * a; }
          }
        }
      }
      return o;
    }
  },
  financement_extreme: {
    id: 'financement_extreme', nom: 'Financement extrême et échec de continuation',
    description: 'Quand le financement des contrats perpétuels Binance est dans ses extrêmes (rang sur 90 jours), beaucoup de positions à effet de levier sont du même côté ; si le prix échoue à prolonger (balayage d’un extrême refermé à l’intérieur), le dénouement de ces positions peut accélérer le retour. Stop au-delà de la mèche.',
    grille: () => ({ pctl: [0.9, 0.95], N: [48, 96], pad: [0.2, 0.5], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), d = ctx.deriv; o.R = p.R;
      if (!d || !d.disponible || !d.disponible.funding) return o;
      const hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N);
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], q = d.fundingPct[i]; if (!(a > 0) || !Number.isFinite(q)) continue;
        if (q >= p.pctl && m15.h[i] > hh[i] && m15.c[i] < hh[i]) { o.sens[i] = -1; o.stop[i] = m15.h[i] + p.pad * a; }
        else if (q <= 1 - p.pctl && m15.l[i] < ll[i] && m15.c[i] > ll[i]) { o.sens[i] = 1; o.stop[i] = m15.l[i] - p.pad * a; }
      }
      return o;
    }
  },
  purge_oi: {
    id: 'purge_oi', nom: 'Purge de l’intérêt ouvert (indice de liquidations estimé) puis reprise',
    description: 'Une forte baisse de l’intérêt ouvert pendant une grande bougie suggère des fermetures forcées de positions (ESTIMÉ : l’intérêt ouvert baisse aussi quand des traders ferment volontairement). Une fois la pression épuisée, le prix reprend une partie du mouvement : entrée à la reprise confirmée.',
    grille: () => ({ oiDrop: [0.015, 0.03], rangeATR: [2, 3], retrace: [0.4, 0.6], R: R2 }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), d = ctx.deriv, mi = construireMicro(ctx); o.R = p.R;
      if (!d || !d.disponible || !d.disponible.oi) return o;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], v = d.oiVar1h[i]; if (!(a > 0) || !Number.isFinite(v) || v > -p.oiDrop) continue;
        let jb = -1, jh = -1;                                   // plus grande bougie baissière / haussière parmi i-3…i-1
        for (let j = i - 3; j <= i - 1; j++) {
          if (!(mi.ampATR[j] >= p.rangeATR)) continue;
          if (m15.c[j] < m15.o[j] && (jb < 0 || mi.ampATR[j] > mi.ampATR[jb])) jb = j;
          if (m15.c[j] > m15.o[j] && (jh < 0 || mi.ampATR[j] > mi.ampATR[jh])) jh = j;
        }
        if (jb >= 0 && m15.c[i] > m15.o[i] && m15.c[i] >= m15.l[jb] + p.retrace * (m15.h[jb] - m15.l[jb])) { o.sens[i] = 1; o.stop[i] = minSur(m15.l, jb, i) - 0.2 * a; }
        else if (jh >= 0 && m15.c[i] < m15.o[i] && m15.c[i] <= m15.h[jh] - p.retrace * (m15.h[jh] - m15.l[jh])) { o.sens[i] = -1; o.stop[i] = maxSur(m15.h, jh, i) + 0.2 * a; }
      }
      return o;
    }
  }
};
export const ORDRE_MICRO = ['sweep_asie', 'absorption_niveau', 'desequilibre_tendance', 'vwap_extension', 'prix_ronds', 'financement_extreme', 'purge_oi'];
export const MICRO_AVEC_DERIVES = new Set(['financement_extreme', 'purge_oi']);
