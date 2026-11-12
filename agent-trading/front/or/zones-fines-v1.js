/* Zones fines (2026-11-12) : largeur minimale d'une zone surveillée ET dessinée = 0,3 ATR(H1). Une zone plus fine est ÉLARGIE à 0,3 ATR (centrée sur son niveau : un niveau exact
   reste surveillé, il n'est pas supprimé), puis les zones de même côté, vivantes en même temps, qui se chevauchent ou sont à moins de 0,3 ATR sont fusionnées.
   Pur. Une seule fonction, appelée par le graphique AVANT de dessiner : dessin = surveillance. */
export const MIN_ATR = 0.3, FUSION_ATR = 0.3;
export function normaliserZones(zones, a, { min = MIN_ATR, fusion = FUSION_ATR } = {}) {
  if (!(a > 0) || !zones || !zones.length) return zones || [];
  const L = zones.map(z => { const w = z.haut - z.bas; if (w >= min * a) return { ...z }; const c = (z.bas + z.haut) / 2; return { ...z, bas: c - min * a / 2, haut: c + min * a / 2, elargie: true }; });
  const vit = (z, y) => z.tDebut <= (y.tFin ?? Infinity) && y.tDebut <= (z.tFin ?? Infinity);
  const out = [];
  for (const z of L.slice().sort((x, y) => x.bas - y.bas)) {
    const g = out.find(q => q.cote === z.cote && vit(q, z) && z.bas <= q.haut + fusion * a && z.haut >= q.bas - fusion * a);
    if (!g) { out.push({ ...z }); continue; }
    const el = z.elements || [z], ge = g.elements || [{ ...g }];
    g.elements = [...ge, ...el]; g.bas = Math.min(g.bas, z.bas); g.haut = Math.max(g.haut, z.haut); g.tDebut = Math.min(g.tDebut, z.tDebut);
    g.tFin = (g.tFin == null || z.tFin == null) ? null : Math.max(g.tFin, z.tFin); g.actif = g.tFin == null;
    g.retournee = g.retournee || z.retournee; g.p = (g.bas + g.haut) / 2; g.force = (g.force || 1) + (z.force || 1); g.id = `${g.id}+${z.id}`; g.epaisseur = Math.min(g.haut - g.bas, 0.3 * a);
  }
  return out.map(z => ({ ...z, epaisseur: Math.min(z.haut - z.bas, 0.3 * a) }));
}
