/* ═════════════ FLÈCHES H1, VERSION 9 (pur, testé) ═════════════
   Règles FIGÉES « fleches-h1-v9 », écrites le 2026-11-08 AVANT le code et tout test, dans leur propre commit (la date de ce commit ouvre
   le bilan de v9). v9 = les flèches de fleches-h1-v2 telles quelles, avec seulement trois filtres. Seuils de la consigne (5 touches,
   24 bougies) ou repris de v2 / v7 / v8 (0,25 ATR, bandes, plus hauts / bas majeurs, mesures sur 48 bougies). Aucun autre filtre, aucun
   seuil réglé d'après les graphiques. v1 à v8 restent intactes et calculées en parallèle. Informations de lecture, jamais un ordre. */

export const REGLES_H1_V9 = Object.freeze({
  version: 'fleches-h1-v9', periode: 'H1', ecrites: '2026-11-08', base: 'fleches-h1-v2',
  // 1. niveau déclencheur
  touchesMin: 5, toleranceAtr: 0.25,
  // 2. et 3. alternance, espacement
  espacementBougies: 24,
  // pas de filtre d'extrême de swing (rang de swing seulement affiché)
  swingBougies: 120, swingAtr: Infinity,
  // mesures (jamais utilisées comme filtre)
  excursionBougies: 48, gainPct: 2, pertePct: 1,
  // bilan (repris de v2)
  suiviBougies: 8, suiviAtr: 1, regroupementBougies: 8, hasard: 1000, minFleches: 30, decision: 100, fraisTaker: 0.0005
});

export const TEXTE_REGLES_H1_V9 = `Règles figées ${REGLES_H1_V9.version} (écrites le ${REGLES_H1_V9.ecrites}, avant le code et tout test, dans leur propre commit ; = les flèches de fleches-h1-v2 telles quelles, trois filtres seulement) :
- base : chaque flèche de fleches-h1-v2 (même déclencheur, règles A, B et C de v2, confirmation à la clôture, jamais redessinée), dans l'ordre du temps ; ATR = celui de la flèche v2 ;
- 1. niveau déclencheur : le prix de la flèche est dans une bande d'au moins 5 touches (même calcul que les bandes de fleches-h1-v7 / v8 : niveaux-periode-v1, fusion à moins de 1 ATR, niveaux retournés compris, connues avant la bougie) élargie de 0,25 ATR de chaque côté, ou à au plus 0,25 ATR d'un plus haut / plus bas de la semaine ou du mois précédents (heure de Paris) ;
- 2. alternance : de sens opposé à la dernière flèche v9 (verte puis rouge puis verte…) ; sinon écartée ;
- 3. au moins 24 bougies après la dernière flèche v9 ; sinon écartée ;
- aucun autre filtre (pas d'extrême de swing, pas de filtre de tendance) ;
- affichage : flèches bien visibles ; segment sur le niveau déclencheur (de sa dernière touche connue avant la flèche, comme fleches-h1-v8), sans étiquette permanente ; infobulle au survol : régime, niveau, touches, distance de l'extrême au niveau, excursions ;
- mesures, jamais utilisées comme filtre : excursion favorable et défavorable maximales dans les 48 bougies suivantes, en ATR et en % (comme fleches-h1-v8) ;
- bilan depuis la date du commit de ces règles, mêmes mesures que v2 (flèches indépendantes à 8 bougies, +1 ATR avant −1 ATR en 8 bougies, R net après frais preneur 0,05 % par côté et spread mesuré, 1000 tirages au hasard même régime et mêmes heures, « pas assez de données » sous 30) ; correction de Holm sur toutes les versions suivies (v1 à v9) ; aucune décision avant 100 flèches indépendantes nouvelles.`;

/* ───────────── calcul (ajouté après le commit des règles f677034 ; aucune règle ci-dessus n'a changé) ───────────── */
import { closes } from './niveaux-periode.js';
import { bilanH1, DEPUIS_H1_V2 } from './fleches-h1-v2.js';
import { flechesH1v8, bandesV8Avant, excursion, resumeExcursions, DEPUIS_8, NOMS_8 } from './fleches-h1-v8.js';
import { deuxProportions, holm } from './zones-or.js';
import { pluriel } from './texte-or.js';

/* date du commit des règles v9 (f677034, 2026-11-08 13:03:36 heure de Paris) : début du bilan de v9 */
export const DEPUIS_H1_V9 = Object.freeze({ commit: 'f677034', t: 1794139416000, texte: '8 nov. 2026, 13 h 03' });
export const DEPUIS_9 = Object.freeze({ ...DEPUIS_8, 'fleches-h1-v9': DEPUIS_H1_V9 });
export const NOMS_9 = Object.freeze({ ...NOMS_8, 'fleches-h1-v9': 'v9' });

/* bandes d'au moins 5 touches connues avant la bougie i (même calcul que v8, seuil de v9) */
export const bandesV9Avant = (C, i, R = REGLES_H1_V9) => bandesV8Avant(C, i, R);
/* FLÈCHES H1 v9 : le moteur de v8 (flèches v2 filtrées) avec les règles de v9 : 5 touches, pas d'extrême de swing (swingAtr infini),
   alternance et 24 bougies. Strictement causal. */
export const flechesH1v9 = (B, o = {}) => flechesH1v8(B, { bandes: bandesV9Avant, ...o, R: REGLES_H1_V9 });

/* segments des flèches v9 : sur le niveau déclencheur, SANS étiquette permanente (étiquette et détail au survol) */
export function segmentsV9(C, F) {
  const idx = new Map(C.map((b, k) => [b.t, k])), nb = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');
  return F.filter(f => f.version === 'fleches-h1-v9').map(f => { const i = idx.get(f.t) ?? f.i, t0 = f.gros && f.gros.t0 && f.gros.t0 < f.t ? f.gros.t0 : C[Math.max(0, i - 12)].t, ex = i != null ? excursion(C, { ...f, i }, REGLES_H1_V9) : null;
    return { t0, t1: f.t, p: f.niveau, sens: f.sens, libelle: f.libelle, sansEtiquette: true, titre: `${f.libelle} · niveau déclencheur de la flèche v9 ${f.sens === 'baisse' ? 'rouge' : 'verte'}`,
      detail: [`régime H1 : ${f.regime}`, `niveau ${nb(f.niveau)} · ${f.gros.source === 'bande' ? pluriel(f.gros.touches, 'touche') : 'plus haut / plus bas majeur'}`, `distance de l'extrême au niveau : ${nb(f.distance)} ATR`,
        ex ? `48 bougies suivantes (mesure, pas un filtre) : excursion favorable ${nb(ex.favAtr)} ATR (${nb(ex.favPct)} %), défavorable ${nb(ex.advAtr)} ATR (${nb(ex.advPct)} %)` : '48 bougies suivantes pas encore closes', 'information de lecture, jamais un ordre'] }; });
}
/* bilans de toutes les versions suivies (v1 à v9) ; Holm sur toutes ; pour v8 et v9, résumé des excursions (mesure, pas un filtre) */
export function bilans9(B, parVersion, { maintenant = Date.now(), spread = null } = {}) {
  const vs = Object.keys(DEPUIS_9), out = {}, C = closes(B, 3600e3, maintenant);
  for (const v of vs) { if (!parVersion[v]) continue; const d = DEPUIS_9[v], b = bilanH1(B, parVersion[v], { maintenant, depuis: d.t, spread, version: v });
    out[v] = { ...b, commit: d.commit, depuisTexte: d.texte, texte: b.texte.replace(DEPUIS_H1_V2.texte, d.texte) }; }
  const ps = vs.map(v => { const b = out[v]; return b && b.assez && b.hasard ? deuxProportions(Math.round(b.reussite * b.mesurees), b.mesurees, Math.round(b.hasard.reussite * b.hasard.tirages), b.hasard.tirages) : null; });
  const adj = holm(ps), m = vs.filter(v => out[v]).length;
  vs.forEach((v, k) => { const b = out[v]; if (!b) return; b.p = ps[k]; b.pHolm = adj[k]; if (b.assez) b.texte = b.texte.replace(' Aucune décision avant', ` Écart au hasard : p corrigée (Holm, ${m} versions suivies) ${adj[k] == null ? '—' : adj[k].toFixed(3).replace('.', ',')}. Aucune décision avant`); });
  for (const v of ['fleches-h1-v8', 'fleches-h1-v9']) { const b = out[v]; if (!b) continue;
    const Fd = parVersion[v].filter(f => f.t >= DEPUIS_9[v].t), X = resumeExcursions(C, Fd), nb = x => x == null ? '—' : x.toFixed(2).replace('.', ',');
    b.excursions = X; b.texte += X.n ? ` Mesures (pas un filtre) sur ${X.n} flèche(s) aux 48 bougies closes : excursion favorable médiane ${nb(X.favAtr)} ATR (${nb(X.favPct)} %), défavorable ${nb(X.advAtr)} ATR (${nb(X.advPct)} %).` : ' Mesures d’excursion (pas un filtre) : aucune flèche aux 48 bougies closes pour l’instant.'; }
  return out;
}
