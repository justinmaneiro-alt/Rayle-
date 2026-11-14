/* Niveaux « proposés » affichés sur le graphique : seulement ceux proches du prix (± 8 ATR), fusionnés à moins de 0,5 ATR, 6 au plus (les plus proches du prix).
   Correctif H4/Jour (2026-11-14) : sans filtre, des dizaines de lignes horizontales recouvraient le graphique. Module pur, sans navigateur. */
export const REGLES_PROPOSES = Object.freeze({ portee: 8, fusion: 0.5, max: 6 });

/* ATR simple (moyenne du vrai écart) des n dernières bougies [{h,l,c}] */
export function atrSimple(B, n = 14) {
  if (!Array.isArray(B) || B.length < 2) return 0;
  const k = Math.min(n, B.length - 1); let s = 0;
  for (let i = B.length - k; i < B.length; i++) { const b = B[i], pc = B[i - 1].c; s += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); }
  return s / k;
}
/* proposes : [{p, unite, sorte, cle, t}] ; prix : dernier cours ; atr : ATR de l'unité affichée. Renvoie la liste à dessiner (ordre : du plus proche au plus loin). */
export function filtrerProposes(proposes, prix, atr, r = REGLES_PROPOSES) {
  const L = (proposes || []).filter(x => x && Number.isFinite(x.p));
  if (!L.length || !Number.isFinite(prix)) return [];
  if (!(atr > 0)) return L.slice().sort((a, b) => Math.abs(a.p - prix) - Math.abs(b.p - prix)).slice(0, r.max);
  const proches = L.filter(x => Math.abs(x.p - prix) <= r.portee * atr).sort((a, b) => Math.abs(a.p - prix) - Math.abs(b.p - prix));
  const gardes = [];
  for (const x of proches) { if (gardes.some(g => Math.abs(g.p - x.p) < r.fusion * atr)) continue; gardes.push(x); if (gardes.length >= r.max) break; }
  return gardes;
}
/* étiquettes sans chevauchement : renvoie les cles dont l'étiquette peut être écrite (au moins `pas` pixels d'écart vertical) ; ys = { cle: y } */
export function etiquettesLibres(gardes, ys, pas = 12) {
  const ok = new Set(), pris = [];
  for (const g of gardes) { const y = ys[g.cle]; if (!Number.isFinite(y)) continue; if (pris.some(v => Math.abs(v - y) < pas)) continue; pris.push(y); ok.add(g.cle); }
  return ok;
}

/* MA200 en UNE seule ligne : la série de la MA (souvent H1, des milliers de points) est ramenée à UN point par bougie affichée
   (dernière valeur connue à la fin de la bougie). Sans cela, en H4 et Jour, des milliers de points H1 projetés sur peu de bougies
   dessinaient un bloc de centaines de lignes. pts : [{t, v}] triés ; bougies : [{t}] triées. Renvoie [{t, v}] (au plus une par bougie). */
export function reduireMA(pts, bougies) {
  if (!Array.isArray(pts) || !Array.isArray(bougies) || !pts.length || !bougies.length) return [];
  const out = []; let j = 0, dernier = null;
  for (let k = 0; k < bougies.length; k++) {
    const fin = k + 1 < bougies.length ? bougies[k + 1].t : Infinity;
    while (j < pts.length && pts[j].t < fin) { if (Number.isFinite(pts[j].v)) dernier = pts[j].v; j++; }
    if (dernier != null && pts[0].t < fin) out.push({ t: bougies[k].t, v: dernier });
  }
  return out;
}
