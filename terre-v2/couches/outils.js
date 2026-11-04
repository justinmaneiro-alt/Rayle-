/* Outils communs des couches (séparés du registre : pas d'import circulaire). */
export async function json(url, { timeout = 15000, init = {} } = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
/* centre de la vue (lat, lon en degrés) et rayon approximatif visible (km), plafonné */
export function centreVue(viewer, Cesium, maxKm = 1500) {
  const c = viewer.camera.positionCartographic, rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  let lat = Cesium.Math.toDegrees(c.latitude), lon = Cesium.Math.toDegrees(c.longitude), km = Math.min(maxKm, c.height / 1000 * 1.2);
  if (rect) { lat = Cesium.Math.toDegrees((rect.north + rect.south) / 2); lon = Cesium.Math.toDegrees(Cesium.Rectangle.center(rect).longitude); }
  return { lat, lon, km: Math.max(20, km), hauteur: c.height };
}
export function nouvelleSource(ctx, nom) { const ds = new ctx.Cesium.CustomDataSource(nom); ctx.viewer.dataSources.add(ds); return ds; }
export function retirerSource(ctx, ds) { try { ds && ctx.viewer && !ctx.viewer.isDestroyed() && ctx.viewer.dataSources.remove(ds, true); } catch (e) { /* globe détruit */ } }
export const heureFr = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
