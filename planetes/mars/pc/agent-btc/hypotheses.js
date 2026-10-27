import { basAvant, emaM15, hautAvant } from './contexte.js';
import { FAMILLES_MICRO, ORDRE_MICRO } from './hypotheses-micro.js';

/* ═════════════ BIBLIOTHÈQUE D'HYPOTHÈSES (M3b ; module pur, testé : agent-backtest-test.mjs) ═════════════
   Chaque hypothèse (« famille ») décrit une idée de trade sur le Bitcoin, entrée en M15, contexte H1 et H4, objectif de 4 à 6 R. Elle fournit :
   - une grille de paramètres (génération 0 = grille de base ; génération 1 = grille élargie par des filtres, utilisée quand la boucle d'adaptation « recommence ») ;
   - `signaux(ctx, p)` → { sens, stop, R } : pour chaque bougie M15 fermée, +1 / −1 / 0 et le niveau de stop. CAUSAL : le signal en i n'utilise que les bougies 0..i et les informations H1 / H4
     déjà connues à la clôture de i (vérifié par le test du poison du futur pour chaque famille et plusieurs jeux de paramètres).
   Aucune IA : ce sont des règles. Le stop est placé sur la structure (extrême récent) ou en multiple de l'ATR H1 ; la taille de position vient du risque choisi, pas d'ici. */
const DEPART = 400;                                         // chauffe : on ne signale pas avant (toutes les moyennes et phases existent)
const heureUTC = t => Math.floor((t % 86400e3) / 3600e3);
const dansSession = t => { const h = heureUTC(t); return h >= 7 && h < 21; };   // séances européenne et américaine (UTC)
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const minSur = (x, i, k) => { let m = Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const maxSur = (x, i, k) => { let m = -Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] > m) m = x[j]; return m; };
/* Filtres de la génération 1 : session et confirmation du delta (le volume acheteur / vendeur doit aller dans le sens du trade). */
const filtres = (ctx, p, i, sens) => {
  if (p.session && !dansSession(ctx.m15.t[i])) return false;
  if (p.deltaConf && !(sens > 0 ? ctx.delta15[i] > 0 : ctx.delta15[i] < 0)) return false;
  return true;
};
const EXTRA = { session: [0, 1], deltaConf: [0, 1] };

export const FAMILLES = {
  cassure_range: {
    id: 'cassure_range', nom: 'Cassure de range avec expansion de volume',
    description: 'Le prix sort d’une boîte (plus haut / plus bas des N dernières bougies M15) sur une bougie fermée, avec un volume au moins « mult » fois la moyenne des 20 bougies précédentes et un delta dans le sens de la cassure. Stop à « stopATR » ATR H1 de la clôture, objectif R fois la distance.',
    grille: gen => ({ N: [96, 144, 192], mult: [1.5, 2, 3], stopATR: [1, 1.5, 2], R: [4, 5, 6], contreTendance: [0, 1], ...(gen ? EXTRA : {}) }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], vm = ctx.volMoy20[i]; if (!(a > 0) || !(vm > 0) || !(hh[i] > 0)) continue;
        if (!(m15.v[i] >= p.mult * vm)) continue;
        if (m15.c[i] > hh[i] && m15.c[i - 1] <= hh[i] && ctx.delta15[i] > 0 && !(p.contreTendance && ctx.h1.phase[i] === 2) && filtres(ctx, p, i, 1)) { o.sens[i] = 1; o.stop[i] = m15.c[i] - p.stopATR * a; }
        else if (m15.c[i] < ll[i] && m15.c[i - 1] >= ll[i] && ctx.delta15[i] < 0 && !(p.contreTendance && ctx.h1.phase[i] === 1) && filtres(ctx, p, i, -1)) { o.sens[i] = -1; o.stop[i] = m15.c[i] + p.stopATR * a; }
      }
      return o;
    }
  },
  retour_poc: {
    id: 'retour_poc', nom: 'Retour sur le POC ou le bord de la zone de valeur, en tendance',
    description: 'En tendance H1 confirmée, le prix revient sur le POC (ou le bord de la zone de valeur) du profil de volume des 5 derniers jours ; une bougie M15 de reprise (clôture au-delà du plus haut / plus bas précédent) déclenche l’entrée dans le sens de la tendance. Stop sous l’extrême du retour.',
    grille: gen => ({ zone: ['poc', 'bord'], tol: [0.3, 0.6], pad: [0.2, 0.5, 0.8], R: [4, 5, 6], retour: [8, 16], ...(gen ? EXTRA : {}) }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], ph = ctx.h1.phase[i]; if (!(a > 0) || (ph !== 1 && ph !== 2)) continue;
        const long = ph === 1, niveau = p.zone === 'poc' ? ctx.h1.poc[i] : (long ? ctx.h1.val[i] : ctx.h1.vah[i]); if (!(niveau > 0)) continue;
        if (long) {
          if (!(m15.c[i] > ctx.h1.ma200[i]) || !(m15.c[i] > m15.o[i]) || !(m15.c[i] > m15.h[i - 1])) continue;
          const bas = minSur(m15.l, i, p.retour); if (bas > niveau + p.tol * a || bas < niveau - 3 * a) continue;
          if (!filtres(ctx, p, i, 1)) continue; o.sens[i] = 1; o.stop[i] = bas - p.pad * a;
        } else {
          if (!(m15.c[i] < ctx.h1.ma200[i]) || !(m15.c[i] < m15.o[i]) || !(m15.c[i] < m15.l[i - 1])) continue;
          const haut = maxSur(m15.h, i, p.retour); if (haut < niveau - p.tol * a || haut > niveau + 3 * a) continue;
          if (!filtres(ctx, p, i, -1)) continue; o.sens[i] = -1; o.stop[i] = haut + p.pad * a;
        }
      }
      return o;
    }
  },
  faux_breakout: {
    id: 'faux_breakout', nom: 'Faux breakout avec balayage de liquidité',
    description: 'Le prix dépasse le plus haut (ou le plus bas) des N dernières bougies, puis referme DANS la boîte avec une longue mèche et un volume élevé : les stops sont balayés, le mouvement s’inverse. Entrée dans le sens opposé au balayage, stop au-delà de la mèche.',
    grille: gen => ({ N: [48, 96, 192], mult: [1.2, 1.5, 2], meche: [0.4, 0.5, 0.6], R: [4, 5, 6], contreTendanceH4: [0, 1], ...(gen ? EXTRA : {}) }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], vm = ctx.volMoy20[i], e = m15.h[i] - m15.l[i]; if (!(a > 0) || !(vm > 0) || !(e > 0) || !(hh[i] > 0)) continue;
        if (!(m15.v[i] >= p.mult * vm)) continue;
        if (m15.h[i] > hh[i] && m15.c[i] < hh[i] && (m15.h[i] - Math.max(m15.o[i], m15.c[i])) / e >= p.meche && !(p.contreTendanceH4 && ctx.h4.phase[i] === 1) && filtres(ctx, p, i, -1)) { o.sens[i] = -1; o.stop[i] = m15.h[i] + 0.2 * a; }
        else if (m15.l[i] < ll[i] && m15.c[i] > ll[i] && (Math.min(m15.o[i], m15.c[i]) - m15.l[i]) / e >= p.meche && !(p.contreTendanceH4 && ctx.h4.phase[i] === 2) && filtres(ctx, p, i, 1)) { o.sens[i] = 1; o.stop[i] = m15.l[i] - 0.2 * a; }
      }
      return o;
    }
  },
  pullback_ema: {
    id: 'pullback_ema', nom: 'Repli sur la moyenne mobile dans une tendance',
    description: 'En tendance H1 confirmée (et H4 dans le même sens si demandé), le prix touche l’EMA M15 puis la reprend : entrée dans le sens de la tendance, stop sous l’extrême du repli.',
    grille: gen => ({ ema: [20, 50], pad: [0.2, 0.5, 0.8], R: [4, 5, 6], repli: [8, 16], exigeH4: [0, 1], ...(gen ? EXTRA : {}) }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), em = emaM15(ctx, p.ema); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], ph = ctx.h1.phase[i]; if (!(a > 0) || (ph !== 1 && ph !== 2) || !(em[i] > 0)) continue;
        if (ph === 1) {
          if (p.exigeH4 && ctx.h4.phase[i] !== 1) continue;
          if (!(m15.c[i - 1] <= em[i - 1] && m15.c[i] > em[i])) continue;
          if (!filtres(ctx, p, i, 1)) continue; o.sens[i] = 1; o.stop[i] = minSur(m15.l, i, p.repli) - p.pad * a;
        } else {
          if (p.exigeH4 && ctx.h4.phase[i] !== 2) continue;
          if (!(m15.c[i - 1] >= em[i - 1] && m15.c[i] < em[i])) continue;
          if (!filtres(ctx, p, i, -1)) continue; o.sens[i] = -1; o.stop[i] = maxSur(m15.h, i, p.repli) + p.pad * a;
        }
      }
      return o;
    }
  },
  squeeze: {
    id: 'squeeze', nom: 'Expansion de volatilité après compression',
    description: 'La volatilité H1 est dans ses plus bas niveaux récents (compression) ; une bougie M15 clôture au-delà de la boîte des N dernières bougies avec un volume élevé et un delta dans le même sens : entrée dans le sens de l’expansion.',
    grille: gen => ({ rangMax: [0.2, 0.3, 0.4], N: [48, 96], mult: [1.5, 2], stopATR: [1, 1.5, 2], R: [4, 5, 6], ...(gen ? EXTRA : {}) }),
    signaux(ctx, p) {
      const { m15 } = ctx, n = ctx.n, o = fabrique(n), hh = hautAvant(ctx, p.N), ll = basAvant(ctx, p.N); o.R = p.R;
      for (let i = DEPART; i < n; i++) {
        const a = ctx.h1.atr[i], vm = ctx.volMoy20[i], r = ctx.h1.atrRang[i]; if (!(a > 0) || !(vm > 0) || !(r <= p.rangMax) || !(hh[i] > 0)) continue;
        if (!(m15.v[i] >= p.mult * vm)) continue;
        if (m15.c[i] > hh[i] && m15.c[i - 1] <= hh[i] && ctx.delta15[i] > 0 && filtres(ctx, p, i, 1)) { o.sens[i] = 1; o.stop[i] = m15.c[i] - p.stopATR * a; }
        else if (m15.c[i] < ll[i] && m15.c[i - 1] >= ll[i] && ctx.delta15[i] < 0 && filtres(ctx, p, i, -1)) { o.sens[i] = -1; o.stop[i] = m15.c[i] + p.stopATR * a; }
      }
      return o;
    }
  }
};
export const ORDRE_FAMILLES = ['cassure_range', 'retour_poc', 'faux_breakout', 'pullback_ema', 'squeeze'];
/* M4 : les sept familles de microstructure (préenregistrées, voir hypotheses-micro.js) rejoignent le registre ; ORDRE_FAMILLES reste celui des cinq premières. */
Object.assign(FAMILLES, FAMILLES_MICRO);
export { ORDRE_MICRO };
export const ORDRE_TOUTES = [...ORDRE_FAMILLES, ...ORDRE_MICRO];

/* Toutes les combinaisons d'une grille ({ a: [1,2], b: [3] } → [{a:1,b:3}, {a:2,b:3}]). Ordre déterministe. */
export function combinaisons(grille) {
  const cles = Object.keys(grille); let out = [{}];
  for (const k of cles) { const nouveau = []; for (const base of out) for (const val of grille[k]) nouveau.push({ ...base, [k]: val }); out = nouveau; }
  return out;
}
export const nombreVariantes = (famille, gen = 0) => combinaisons(FAMILLES[famille].grille(gen)).length;
/* Voisins d'un jeu de paramètres : on décale UN paramètre d'un cran dans sa grille (sert au test de robustesse). */
export function voisins(famille, params, gen = 0) {
  const grille = FAMILLES[famille].grille(gen), out = [];
  for (const k of Object.keys(grille)) {
    const vals = grille[k], i = vals.indexOf(params[k]); if (i < 0) continue;
    for (const d of [-1, 1]) if (vals[i + d] !== undefined) out.push({ ...params, [k]: vals[i + d] });
  }
  return out;
}
export const cleParams = p => Object.keys(p).sort().map(k => k + '=' + p[k]).join(',');

/* ── « Approche » : le prix est-il près de la zone où la famille déclencherait ? (alerte PRÉPARATION ; ne produit jamais d'entrée). Rend { sens, niveau, texte } ou null. ── */
const proche = (c, niveau, a, k) => Math.abs(c - niveau) <= k * a;
FAMILLES.cassure_range.approche = (ctx, p, i) => {
  const a = ctx.h1.atr[i], c = ctx.m15.c[i], hh = hautAvant(ctx, p.N)[i], ll = basAvant(ctx, p.N)[i]; if (!(a > 0)) return null;
  if (proche(c, hh, a, 0.5) && c <= hh) return { sens: 1, niveau: hh, texte: 'le prix est sous le plus haut des ' + p.N + ' dernières bougies M15 ; une clôture au-dessus avec un volume d’au moins ' + p.mult + ' fois la normale et un delta positif déclencherait un achat' };
  if (proche(c, ll, a, 0.5) && c >= ll) return { sens: -1, niveau: ll, texte: 'le prix est au-dessus du plus bas des ' + p.N + ' dernières bougies M15 ; une clôture en dessous avec un volume d’au moins ' + p.mult + ' fois la normale et un delta négatif déclencherait une vente' };
  return null;
};
FAMILLES.squeeze.approche = (ctx, p, i) => {
  const a = ctx.h1.atr[i]; if (!(a > 0) || !(ctx.h1.atrRang[i] <= p.rangMax)) return null;
  const c = ctx.m15.c[i], hh = hautAvant(ctx, p.N)[i], ll = basAvant(ctx, p.N)[i];
  if (proche(c, hh, a, 0.5) && c <= hh) return { sens: 1, niveau: hh, texte: 'volatilité comprimée et prix sous le haut de la boîte de ' + p.N + ' bougies ; une cassure haussière avec volume déclencherait un achat' };
  if (proche(c, ll, a, 0.5) && c >= ll) return { sens: -1, niveau: ll, texte: 'volatilité comprimée et prix au-dessus du bas de la boîte de ' + p.N + ' bougies ; une cassure baissière avec volume déclencherait une vente' };
  return null;
};
FAMILLES.faux_breakout.approche = (ctx, p, i) => {
  const a = ctx.h1.atr[i], c = ctx.m15.c[i], hh = hautAvant(ctx, p.N)[i], ll = basAvant(ctx, p.N)[i]; if (!(a > 0)) return null;
  if (proche(c, hh, a, 0.3)) return { sens: -1, niveau: hh, texte: 'le prix est tout près du plus haut des ' + p.N + ' dernières bougies ; un balayage de ce niveau refermé en dessous, avec mèche et volume, déclencherait une vente' };
  if (proche(c, ll, a, 0.3)) return { sens: 1, niveau: ll, texte: 'le prix est tout près du plus bas des ' + p.N + ' dernières bougies ; un balayage de ce niveau refermé au-dessus, avec mèche et volume, déclencherait un achat' };
  return null;
};
FAMILLES.retour_poc.approche = (ctx, p, i) => {
  const a = ctx.h1.atr[i], ph = ctx.h1.phase[i], c = ctx.m15.c[i]; if (!(a > 0) || (ph !== 1 && ph !== 2)) return null;
  const long = ph === 1, niveau = p.zone === 'poc' ? ctx.h1.poc[i] : (long ? ctx.h1.val[i] : ctx.h1.vah[i]); if (!(niveau > 0) || !proche(c, niveau, a, 1)) return null;
  return { sens: long ? 1 : -1, niveau, texte: 'tendance ' + (long ? 'haussière' : 'baissière') + ' et retour du prix sur ' + (p.zone === 'poc' ? 'le POC' : 'le bord de la zone de valeur') + ' ; une bougie de reprise dans le sens de la tendance déclencherait ' + (long ? 'un achat' : 'une vente') };
};
FAMILLES.pullback_ema.approche = (ctx, p, i) => {
  const a = ctx.h1.atr[i], ph = ctx.h1.phase[i], c = ctx.m15.c[i], em = emaM15(ctx, p.ema)[i]; if (!(a > 0) || (ph !== 1 && ph !== 2) || !proche(c, em, a, 0.5)) return null;
  return { sens: ph === 1 ? 1 : -1, niveau: em, texte: 'tendance ' + (ph === 1 ? 'haussière' : 'baissière') + ' et prix au contact de l’EMA ' + p.ema + ' M15 ; une reprise de la moyenne déclencherait ' + (ph === 1 ? 'un achat' : 'une vente') };
};
