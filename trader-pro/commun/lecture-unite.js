/* ═════════════ LECTURE D'UNE UNITÉ DE TEMPS (module PUR, testé) : UNE moyenne mobile, des niveaux sans chevauchement ═════════════
   Règles de la version 2 (2026-11-16) :
   - UNE SEULE moyenne mobile par graphique : la MA200 de l'unité AFFICHÉE (H1, H4 ou Jour), calculée sur les vraies bougies de cette unité ;
   - supports / résistances : ceux de l'unité affichée ET ceux du Jour, 3 au plus de chaque côté du prix, et jamais deux étiquettes l'une sur l'autre
     (écart minimal en prix : `sepAtr` ATR de l'unité ; les surfaces d'affichage ajoutent un contrôle en pixels).
   Bougie = { t, o, h, l, c, v }. Aucune donnée inventée : pas assez de bougies → null avec la raison. */
import { serieSma, niveauxCles, fusionnerNiveaux, atr, dernier } from './analyse.js';

export const UNITES = Object.freeze(['H1', 'H4', 'J']);
export const NOM_UNITE = Object.freeze({ H1: 'H1', H4: 'H4', J: 'Jour' });
export const PAS_UNITE = Object.freeze({ H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 });

/* MA200 de l'unité : points { t, v } sur les bougies de CETTE unité (jamais celles d'une autre) */
export const ma200Unite = B => serieSma(B || [], 200);

/* Bandeau : valeur de la MA200 de l'unité et distance du prix de référence à cette moyenne (en %, positive = prix au-dessus) */
export function bandeauMA(B, unite, prix) {
  const nom = 'MA200 ' + NOM_UNITE[unite], S = ma200Unite(B);
  if (!S.length) return { nom, ok: false, raison: 'moins de 200 bougies ' + NOM_UNITE[unite] + ' : MA200 indisponible' };
  const v = S[S.length - 1].v, p = Number.isFinite(prix) ? prix : (B.length ? B[B.length - 1].c : null);
  return { nom, ok: true, valeur: v, distancePct: p ? (p / v - 1) * 100 : null, prix: p };
}

/* Niveaux : unité affichée d'abord (priorité), puis Jour ; fusion à `sepAtr` ATR de l'unité ; 3 au plus de chaque côté ; chaque niveau porte sa source ('H1' | 'H4' | 'J') */
export function niveauxUniteEtJour(B, BJ, prix, { unite = 'J', max = 3, fenetre = 300, sepAtr = 1.2 } = {}) {
  const px = Number.isFinite(prix) ? prix : (B && B.length ? B[B.length - 1].c : null); if (px == null) return [];
  const marque = (L, src) => [...L.resistances, ...L.supports].map(x => ({ prix: x.prix, touches: x.touches, force: x.force, src }));
  const nU = niveauxCles(B || [], { max, fenetre }), a = nU.atr || dernier(atr(B || [], 14)) || (BJ && dernier(atr(BJ, 14))) || 1;
  const listes = [marque(nU, unite)]; if (unite !== 'J' && BJ && BJ.length) listes.push(marque(niveauxCles(BJ, { max, fenetre }), 'J'));
  /* à l'intérieur d'une liste on garde l'ordre de force ; la fusion respecte la priorité (unité affichée, puis Jour) */
  const tous = fusionnerNiveaux(listes.map(L => L.sort((x, y) => y.force - x.force)), sepAtr * a);
  const R = tous.filter(x => x.prix > px).sort((x, y) => x.prix - y.prix).slice(0, max).map((x, i) => ({ ...x, nom: 'R' + (i + 1), cote: 'R' }));
  const S = tous.filter(x => x.prix <= px).sort((x, y) => y.prix - x.prix).slice(0, max).map((x, i) => ({ ...x, nom: 'S' + (i + 1), cote: 'S' }));
  return [...R, ...S];
}

/* Contrôle en pixels : `yDe(prix)` donne la coordonnée verticale ; on garde les niveaux dans l'ordre de proximité du prix et on écarte tout niveau à moins de `hauteur` px d'un niveau déjà gardé.
   (même rôle que etalerEtiquettes, mais en supprimant plutôt qu'en décalant : une étiquette décalée ne pointerait plus sur son niveau) */
export function sansChevauchement(niveaux, yDe, hauteur = 22) {
  const ys = []; const gardes = [];
  for (const n of [...niveaux].sort((a, b) => a.rang - b.rang || 0)) {
    const y = yDe(n.prix); if (!Number.isFinite(y)) { gardes.push(n); continue; }
    if (ys.every(v => Math.abs(v - y) >= hauteur)) { ys.push(y); gardes.push(n); }
  }
  return gardes;
}
/* rang d'importance pour sansChevauchement : plus proche du prix = plus important ; unité affichée avant Jour */
export const avecRang = (niveaux, prix, unite) => niveaux.map(n => ({ ...n, rang: Math.abs(n.prix - prix) / (prix || 1) + (n.src === unite ? 0 : 0.0001) }));
