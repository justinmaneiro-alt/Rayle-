/* ═════════════ ÉTUDE « STRUCTURE », VARIANTES SUPPLÉMENTAIRES : RÈGLES FIGÉES `structure-v2` (2026-11-10, écrites AVANT tout calcul) ═════════════
   Étend structure-v1.js (scellé, NON modifié) par trois options demandées par Justin après avoir vu les résultats de la v1. Chaque option s'applique
   aux 20 variantes de base, seule ou toutes ensemble : 20 × 4 = 80 variantes nouvelles ; avec les 20 d'origine, Holm porte sur 100.
   Honnêteté : ces options ont été décidées APRÈS avoir vu les résultats de la v1 (pistes tirées du rapport) : le hors-échantillon n'est plus vierge,
   le contrôle final (XAUUSDT, Kraken, PAXG après le 01/11/2025) est montré mais ne sert pas à choisir. Simulation, jamais un ordre. */
import * as V1 from './structure-v1.js';
import { H1, J, P as P1 } from './structure-v1.js';

export const VERSION = 'structure-v2';
export const FIGEES_LE = '2026-11-10';
export const P = Object.freeze({
  stopMinAtr: 1,        // (S) distance minimale de stop : |entrée − stop| ≥ 1 ATR H1, sinon le setup est écarté
  jourSma: 50, jourPente: 10, jourAtr: 14,   // (F) tendance Jour : SMA 50 des clôtures Jour, pente sur 10 jours, ATR Jour 14
  jourForteAtr: 2,      // (F) « haussière trop forte » : clôture Jour à plus de 2 ATR Jour au-dessus de la SMA 50 Jour
  partielleR: 1         // (P) moitié à +1 R, le reste au point d'entrée (break-even) puis vers la cible de structure
});
export const OPTIONS = Object.freeze(['S', 'F', 'P', 'SFP']);
export const VARIANTES = Object.freeze(V1.VARIANTES.flatMap(b => OPTIONS.map(o => Object.freeze({ ...b, id: `${b.id}+${o}`, base: b.id, options: o, stopMin: o.includes('S'), filtre: o.includes('F'), partielle: o.includes('P') }))));
export const TOUTES = Object.freeze([...V1.VARIANTES.map(v => Object.freeze({ ...v, base: v.id, options: '', stopMin: false, filtre: false, partielle: false })), ...VARIANTES]);

export const TEXTE_REGLES = `Règles figées ${VERSION} (écrites le ${FIGEES_LE}, avant le premier calcul ; empreinte SHA-256 du fichier notée dans le rapport) :
Base : les 20 variantes de structure-v1 (règles, seuils et protocole inchangés). Options, appliquées à chaque variante de base, seules (S, F, P) ou toutes ensemble (SFP) :
(S) distance minimale de stop : le setup est écarté si |entrée − stop| < 1 ATR H1. On mesure combien de trades de la variante de base sont ainsi écartés.
(F) filtre de régime Jour : tendance Jour = clôture de la dernière bougie Jour close, SMA 50 des clôtures Jour, ATR Jour (14). Achats seulement si la clôture Jour n'est PAS à plus de 2 ATR Jour au-dessus de la SMA 50 (tendance haussière trop forte) ; ventes seulement si la clôture Jour est sous la SMA 50 ET la SMA 50 est plus basse qu'il y a 10 jours (tendance baissière). Sans 60 bougies Jour de passé : pas de trade.
(P) sortie partielle : la moitié de la position sort à +1 R ; une fois +1 R atteint, le reste passe au point d'entrée (break-even) et vise la cible de structure de la variante de base ; avant +1 R, les deux moitiés sortent au stop ; résultat = moyenne des deux moitiés ; tenue maximale 240 bougies H1 ; stop prioritaire dans une même bougie.
Protocole inchangé (calibration, hors échantillon, contrôle final, 4 jeux de frais, décision sur « futures taker », 1000 tirages appariés avec la même gestion, critères de retenue) ; Holm sur les 100 variantes (20 de base + 80).`;

/* tendance Jour connue à l'instant t (pure : recherche par date) */
const cacheJ = new WeakMap();
function infosJour(ctx) {
  if (cacheJ.has(ctx)) return cacheJ.get(ctx);
  const u = ctx.U.J, Ub = u.Ub, c = Ub.map(b => b.c), n = Ub.length, sma = new Array(n).fill(null); let s = 0;
  for (let i = 0; i < n; i++) { s += c[i]; if (i >= P.jourSma) s -= c[i - P.jourSma]; if (i >= P.jourSma - 1) sma[i] = s / P.jourSma; }
  const o = { Ub, sma, A: u.A, nFermees: u.nFermees }; cacheJ.set(ctx, o); return o;
}
export function tendanceJour(ctx, t) {
  const j = infosJour(ctx), n = j.nFermees(t), k = n - 1; if (k < P.jourSma + P.jourPente || j.sma[k] == null || j.sma[k - P.jourPente] == null || !j.A[k]) return null;
  const cl = j.Ub[k].c, z = (cl - j.sma[k]) / j.A[k];
  return { z, hausseTropForte: z > P.jourForteAtr, baissiere: cl < j.sma[k] && j.sma[k] < j.sma[k - P.jourPente] };
}
export function evaluerBarre(C, ctx, v, i, entree) {
  const s = V1.evaluerBarre(C, ctx, v, i, entree); if (!s) return null;
  if (v.stopMin && !(s.distATR >= P.stopMinAtr)) return null;
  if (v.filtre) { const t = tendanceJour(ctx, C[i].t + H1); if (!t) return null; if (s.sens === 'achat' ? t.hausseTropForte : !t.baissiere) return null; }
  return s;
}
/* sortie en deux moitiés (+1 R, break-even, cible) */
export function simulerPartielle(C, i, sens, stop, cible, { tenue = P1.tenueMaxH } = {}) {
  const e = C[i + 1].o, d = sens === 'achat' ? 1 : -1, risque = (e - stop) * d; if (!(risque > 0)) return null;
  const un = e + d * P.partielleR * risque; let atteint = false, s2 = stop;
  for (let j = i + 1; j < C.length && j <= i + tenue; j++) {
    const b = C[j];
    if (!atteint) {
      if (j > i + 1 && (d > 0 ? b.o <= stop : b.o >= stop)) return { R: (b.o - e) * d / risque, j, sortie: 'stop (ouverture)' };
      if (d > 0 ? b.l <= stop : b.h >= stop) return { R: -1, j, sortie: 'stop' };
      if (d > 0 ? b.h >= un : b.l <= un) { atteint = true; s2 = e;
        if (d > 0 ? b.h >= cible : b.l <= cible) return { R: (P.partielleR + (cible - e) * d / risque) / 2, j, sortie: 'cible' };
        continue; }
    } else {
      if (j > i + 1 && (d > 0 ? b.o <= s2 : b.o >= s2)) return { R: (P.partielleR + (b.o - e) * d / risque) / 2, j, sortie: 'break-even (ouverture)' };
      if (d > 0 ? b.l <= s2 : b.h >= s2) return { R: P.partielleR / 2, j, sortie: 'break-even' };
      if (d > 0 ? b.o >= cible : b.o <= cible) return { R: (P.partielleR + (b.o - e) * d / risque) / 2, j, sortie: 'cible (ouverture)' };
      if (d > 0 ? b.h >= cible : b.l <= cible) return { R: (P.partielleR + (cible - e) * d / risque) / 2, j, sortie: 'cible' };
    }
  }
  if (i + tenue >= C.length) return null;
  const k = i + tenue, rk = (C[k].c - e) * d / risque; return { R: atteint ? (P.partielleR + rk) / 2 : rk, j: k, sortie: 'tenue' };
}
export const simuler = (v, C, i, sens, stop, cible) => v.partielle ? simulerPartielle(C, i, sens, stop, cible) : V1.simulerTrade(C, i, sens, stop, cible);
export function signaux(C, ctx, v) {
  const out = []; let libre = 0;
  for (let i = Math.max(P1.sma + P1.penteH, 0); i + 1 < C.length; i++) {
    if (i < libre) continue;
    const s = evaluerBarre(C, ctx, v, i, C[i + 1].o); if (!s) continue;
    const x = simuler(v, C, i, s.sens, s.stop, s.objectif); if (!x) continue;
    out.push({ i, t: C[i].t, regime: V1.regimeH1(C, ctx, i) || 'neutre', ...s, ...x }); libre = x.j + 1;
  }
  return out;
}
