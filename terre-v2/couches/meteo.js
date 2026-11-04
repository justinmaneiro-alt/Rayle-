/* Météo : Open-Meteo (CC BY 4.0, sans clé, CORS ouvert). Grille de 5 × 5 points sur la zone visible : température et vent (flèche), rafraîchi toutes les 15 min. */
import { json, nouvelleSource, retirerSource, centreVue, heureFr } from './outils.js';

export function grille(lat, lon, km, n = 5) {
  const dLat = Math.min(40, km / 111), dLon = Math.min(80, km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))), pts = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const la = Math.max(-85, Math.min(85, lat - dLat + 2 * dLat * i / (n - 1))); let lo = lon - dLon + 2 * dLon * j / (n - 1); lo = ((lo + 540) % 360) - 180;
    pts.push([Math.round(la * 100) / 100, Math.round(lo * 100) / 100]);
  }
  return pts;
}
export const fleche = deg => '↓↙←↖↑↗→↘'[Math.round(((deg % 360) + 360) % 360 / 45) % 8];   // direction d'où vient le vent → flèche vers où il va

export const meteo = {
  id: 'meteo', nom: 'Météo', legende: 'température et vent', sourceCourte: 'Open-Meteo', intervalle: 15 * 60e3,
  credit: 'Open-Meteo.com (CC BY 4.0)',
  creer(ctx) {
    const { Cesium, viewer } = ctx; let ds = null, n = 0, heure = null;
    async function charger() {
      const c = centreVue(viewer, Cesium, 2500), pts = grille(c.lat, c.lon, c.km);
      const j = await json('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({ latitude: pts.map(p => p[0]).join(','), longitude: pts.map(p => p[1]).join(','), current: 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code', timezone: 'auto' }));
      const liste = Array.isArray(j) ? j : [j];
      if (!ds) ds = nouvelleSource(ctx, 'meteo');
      ds.entities.suspendEvents(); ds.entities.removeAll();
      liste.forEach((x, i) => {
        const cu = x.current; if (!cu) return;
        const t = Math.round(cu.temperature_2m), v = Math.round(cu.wind_speed_10m);
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(pts[i][1], pts[i][0]), label: { text: `${t}°  ${fleche(cu.wind_direction_10m)} ${v}`, font: '13px sans-serif', fillColor: Cesium.Color.fromCssColorString(t >= 25 ? '#ffb38a' : t <= 0 ? '#9fd3ff' : '#e8f3f8'), outlineColor: Cesium.Color.BLACK, outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, disableDepthTestDistance: 1.5e4 } });
        e.rayle = { titre: `Météo ${pts[i][0]}°, ${pts[i][1]}°`, lignes: [`${t} °C`, `Vent ${v} km/h`], source: 'Open-Meteo (CC BY 4.0)' };
      });
      ds.entities.resumeEvents(); n = liste.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
