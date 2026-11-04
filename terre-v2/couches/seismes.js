/* Séismes : USGS (flux GeoJSON, domaine public, sans clé, CORS ouvert). Magnitude ≥ 2,5 sur 7 jours, rafraîchi toutes les 5 min. */
import { json, nouvelleSource, retirerSource, heureFr } from './outils.js';

export const URL_USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
export function couleurProfondeur(km) { return km < 30 ? '#ffb347' : km < 100 ? '#ff7043' : km < 300 ? '#d84f8a' : '#7e57c2'; }
export function tailleMagnitude(m) { return Math.max(5, Math.min(26, 3 + (m - 2) * 3.4)); }

export const seismes = {
  id: 'seismes', nom: 'Séismes', legende: 'taille = magnitude, couleur = profondeur', sourceCourte: 'USGS', intervalle: 5 * 60e3,
  credit: 'U.S. Geological Survey (USGS), domaine public',
  creer(ctx) {
    const { Cesium } = ctx; let ds = null, n = 0, heure = null;
    async function charger() {
      const g = await json(URL_USGS); if (!g || !Array.isArray(g.features)) throw new Error('réponse USGS illisible');
      if (!ds) ds = nouvelleSource(ctx, 'seismes');
      ds.entities.suspendEvents(); ds.entities.removeAll();
      for (const f of g.features) {
        const [lon, lat, prof] = f.geometry.coordinates, p = f.properties, m = p.mag || 0;
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat), point: { pixelSize: tailleMagnitude(m), color: Cesium.Color.fromCssColorString(couleurProfondeur(prof)).withAlpha(0.85), outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 1, disableDepthTestDistance: 1.5e4 } });
        e.rayle = { titre: `Séisme M ${m.toFixed(1)}`, lignes: [p.place || '', `Profondeur ${Math.round(prof)} km`, new Date(p.time).toLocaleString('fr-FR')], source: 'USGS (domaine public)' };
      }
      ds.entities.resumeEvents(); n = g.features.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
