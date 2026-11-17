/* ═════════════ NIVEAUX H1 AFFICHÉS (supports / résistances, bandes retournées), SANS aucune flèche ═════════════
   Extraits de l'ancien module de flèches H1 (supprimé). Même calcul que niveaux-periode (pivots, regroupement, bandes) ; seule la sélection des bandes affichées est ici. Pur. */
import { fourchette, REGLES_NIVEAUX } from './niveaux-periode.js';
import { pluriel } from './texte-or.js';

export const REGLES_NIVEAUX_H1_V5 = Object.freeze({
  version: 'niveaux-h1-v5', base: 'niveaux-periode-v1', periode: 'H1',
  touchesMin: 5,   // une bande est affichée si elle a au moins 5 touches (plus haut / plus bas majeurs : toujours gardés)
  parCote: 6,      // au plus 6 au-dessus et 6 au-dessous du prix (au lieu de 4)
  forts: 2         // les 2 plus importantes de chaque côté bien visibles, les autres discrètes (comme avant)
});

/* sélection v5 des bandes (correction 2) à partir de toutes les bandes de niveauxPeriode (niveaux-periode-v1) */
export function selectionV5(N, ref, { RN = REGLES_NIVEAUX, R = REGLES_NIVEAUX_H1_V5 } = {}) {
  if (!N || !N.a || !N.toutes) return [];
  const sp = RN.espacementAtr * N.a, pris = [], cote = b => (b.p > ref ? 'resistance' : 'support');
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);   // fusion bord à bord à moins de 1 ATR (comme niveaux-periode-v1)
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  const gardes = pris.filter(q => q.touches >= R.touchesMin || q.extreme), out = [];
  for (const c of ['resistance', 'support']) {
    const L = gardes.filter(q => cote(q) === c).sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance)).slice(0, R.parCote);
    const fortes = new Set(L.slice().sort((x, y) => y.importance - x.importance).slice(0, R.forts));
    for (const b of L) out.push({ ...b, cote: c, fort: fortes.has(b), texte: `${c === 'resistance' ? 'Résistance' : 'Support'} ${fourchette(b.bas, b.haut)} · ${pluriel(b.touches, 'touche')}`,
      detail: [`${pluriel(b.niveaux, 'niveau regroupé', 'niveaux regroupés')}, ${pluriel(b.touches, 'touche')} (pivots H1 sur ${RN.fenetreJours.H1} jours ; affichée : au moins ${R.touchesMin} touches)`, `dernière touche : ${new Date(b.tDerniere).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`, b.extreme ? 'plus haut ou plus bas majeur de l’historique visible' : null, `règles ${R.version}`].filter(Boolean) });
  }
  return out.sort((x, y) => y.p - x.p);
}

export const REGLES_NIVEAUX_H1_V6 = Object.freeze({
  version: 'niveaux-h1-v6', base: 'niveaux-h1-v5', periode: 'H1',
  casseAtr: 0.5,          // un niveau est cassé par une clôture à au moins 0,5 ATR au-delà
  retournesParCote: 2     // niveaux retournés ajoutés à l'affichage : au plus 2 de chaque côté, les plus proches du prix (en plus des 6)
});

/* bandes fusionnées à moins de 1 ATR (même algorithme que selectionV5, avant le filtre des touches) */
function fusion(N, RN = REGLES_NIVEAUX) {
  const sp = RN.espacementAtr * N.a, pris = [];
  for (const b of N.toutes.slice().sort((x, y) => (y.extreme - x.extreme) || (y.importance - x.importance))) {
    const g = pris.find(q => b.bas - q.haut < sp && q.bas - b.haut < sp);
    if (g) { g.touches += b.touches; g.importance += b.importance; g.niveaux += b.niveaux; g.extreme = g.extreme || b.extreme; g.tDerniere = Math.max(g.tDerniere, b.tDerniere); continue; }
    pris.push({ ...b });
  }
  return pris;
}
/* bande retournée ? (ajout 2) : après sa dernière touche, le prix était d'un côté puis une CLÔTURE à ≥ 0,5 ATR l'a dépassée de l'autre ;
   le dernier franchissement décide ; retournée tant que le prix (ref) reste du nouveau côté. → 'ancienne résistance' | 'ancien support' | null */
export function retournement(q, Cs, a, ref, R = REGLES_NIVEAUX_H1_V6) {
  let dessous = false, dessus = false, dernier = null; const marge = R.casseAtr * a;
  for (let m = 0; m < Cs.length; m++) { if (Cs[m].t <= q.tDerniere) continue; const c = Cs[m].c;
    if (dessous && c >= q.haut + marge) { dernier = 'haut'; dessous = false; }
    else if (dessus && c <= q.bas - marge) { dernier = 'bas'; dessus = false; }
    if (c <= q.haut) dessous = true; if (c >= q.bas) dessus = true; }
  if (dernier === 'haut' && ref > q.haut) return 'ancienne résistance';
  if (dernier === 'bas' && ref < q.bas) return 'ancien support';
  return null;
}
const texteBande = (b, cote, mention) => `${cote === 'resistance' ? 'Résistance' : 'Support'} ${fourchette(b.bas, b.haut)} · ${pluriel(b.touches, 'touche')}${mention ? ' · ' + mention : ''}`;
/* sélection v6 : bandes v5 (avec la mention si elles sont retournées) + au plus 2 bandes retournées de chaque côté en plus */
export function selectionV6(N, ref, Cs, { R = REGLES_NIVEAUX_H1_V6 } = {}) {
  if (!N || !N.a || !N.toutes) return [];
  const S5 = selectionV5(N, ref), pris = fusion(N), cle = b => b.bas.toFixed(6) + '|' + b.haut.toFixed(6);
  const ret = new Map(); for (const q of pris) { const m = retournement(q, Cs, N.a, ref, R); if (m) ret.set(cle(q), m); }
  const out = S5.map(b => { const m = ret.get(cle(b)); return m ? { ...b, retourne: m, texte: texteBande(b, b.cote, m), detail: [...b.detail, `${m} : cassée par une clôture à au moins ${String(R.casseAtr).replace('.', ',')} ATR au-delà (${R.version})`] } : b; });
  const dans = new Set(S5.map(cle));
  for (const c of ['resistance', 'support']) {
    const L = pris.filter(q => ret.has(cle(q)) && !dans.has(cle(q)) && (q.p > ref ? 'resistance' : 'support') === c).sort((x, y) => Math.abs(x.p - ref) - Math.abs(y.p - ref)).slice(0, R.retournesParCote);
    for (const q of L) { const m = ret.get(cle(q)); out.push({ ...q, cote: c, fort: false, retourne: m, texte: texteBande(q, c, m),
      detail: [`${pluriel(q.niveaux, 'niveau regroupé', 'niveaux regroupés')}, ${pluriel(q.touches, 'touche')} (pivots H1)`, `${m} : cassée par une clôture à au moins ${String(R.casseAtr).replace('.', ',')} ATR au-delà, affichée comme ${c === 'support' ? 'support' : 'résistance'} tant que le prix reste de ce côté (${R.version})`] }); }
  }
  return out.sort((x, y) => y.p - x.p);
}
const versListe = (bandes, zones) => [...bandes.map(b => ({ bas: b.bas, haut: b.haut, type: b.cote === 'resistance' ? 'résistance' : 'support', texte: b.texte, touches: b.touches, fort: b.fort, ...(b.retourne ? { retourne: b.retourne } : {}) })),
  ...zones.map(z => ({ bas: z.p, haut: z.p, type: z.sorte === 'haute' ? 'liquidité haute' : 'liquidité basse', texte: z.texte, raisons: z.raisons }))];
