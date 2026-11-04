/* Satellites : éléments orbitaux CelesTrak (TLE, sans clé, CORS ouvert) + propagation SGP4 par satellite.js (MIT, chargé à la demande).
   Groupes « stations » (dont l'ISS) et « visual » (les plus brillants) ; positions recalculées toutes les 2 s ; orbite de l'ISS sur 90 min.
   Les TLE sont gardés 2 h dans le navigateur (CelesTrak demande de ne pas les retélécharger sans cesse). */
import { nouvelleSource, retirerSource, heureFr } from './outils.js';
import { SATELLITE_JS } from '../config.js';

export const GROUPES = ['stations', 'visual'];
export function lireTle(txt) {
  const l = String(txt).split(/\r?\n/).map(x => x.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < l.length + 1; i++) if (l[i + 1] && l[i + 1].startsWith('1 ') && l[i + 2] && l[i + 2].startsWith('2 ')) { out.push({ nom: l[i].trim(), l1: l[i + 1], l2: l[i + 2] }); i += 2; }
  return out;
}
async function tle(groupe) {
  const cle = 'rayle_t2_tle_' + groupe;
  try { const c = JSON.parse(localStorage.getItem(cle)); if (c && Date.now() - c.t < 2 * 3600e3) return c.txt; } catch (e) { /* */ }
  const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${groupe}&FORMAT=tle`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('CelesTrak HTTP ' + r.status);
  const txt = await r.text(); try { localStorage.setItem(cle, JSON.stringify({ t: Date.now(), txt })); } catch (e) { /* */ }
  return txt;
}

export const satellites = {
  id: 'satellites', nom: 'Satellites', legende: 'ISS en orange, orbite sur 90 min', sourceCourte: 'CelesTrak + SGP4', intervalle: 2 * 3600e3,
  credit: 'Éléments orbitaux : CelesTrak (données publiques) ; calcul : satellite.js (MIT)',
  creer(ctx) {
    const { Cesium } = ctx; let ds = null, sats = [], minuterie = null, n = 0, heure = null;
    function placer() {
      const sat = window.satellite, t = new Date(), gmst = sat.gstime(t);
      for (const s of sats) {
        const pv = sat.propagate(s.rec, t); if (!pv.position) { s.e.show = false; continue; }
        const g = sat.eciToGeodetic(pv.position, gmst); s.e.show = true;
        s.e.position = Cesium.Cartesian3.fromRadians(g.longitude, g.latitude, g.height * 1000);
      }
    }
    async function charger() {
      await ctx.chargerScript(SATELLITE_JS); const sat = window.satellite; if (!sat) throw new Error('satellite.js absent');
      const liste = []; for (const g of GROUPES) for (const x of lireTle(await tle(g))) if (!liste.some(y => y.l1 === x.l1)) liste.push(x);
      if (!ds) ds = nouvelleSource(ctx, 'satellites'); ds.entities.removeAll(); sats = [];
      for (const x of liste.slice(0, 260)) {
        const rec = sat.twoline2satrec(x.l1, x.l2), iss = /ISS \(ZARYA\)/.test(x.nom);
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(0, 0, 400e3), point: { pixelSize: iss ? 9 : 4, color: iss ? Cesium.Color.ORANGE : Cesium.Color.fromCssColorString('#cfe9f5').withAlpha(0.85), disableDepthTestDistance: 0 },
          label: iss ? { text: 'ISS', font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(10, -10), fillColor: Cesium.Color.ORANGE, showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(0.5) } : undefined });
        e.rayle = { titre: x.nom, lignes: [`NORAD ${x.l1.slice(2, 7).trim()}`, iss ? 'Station spatiale internationale' : ''].filter(Boolean), source: 'CelesTrak (données publiques), position calculée (SGP4)' };
        sats.push({ rec, e, iss });
        if (iss) {   // orbite des 90 prochaines minutes
          const pts = []; for (let m = 0; m <= 92; m += 2) { const t = new Date(Date.now() + m * 60e3), pv = sat.propagate(rec, t); if (!pv.position) continue; const g = sat.eciToGeodetic(pv.position, sat.gstime(t)); pts.push(Cesium.Cartesian3.fromRadians(g.longitude, g.latitude, g.height * 1000)); }
          ds.entities.add({ polyline: { positions: pts, width: 1.5, material: Cesium.Color.ORANGE.withAlpha(0.55) } });
        }
      }
      placer(); clearInterval(minuterie); minuterie = setInterval(placer, 2000); n = sats.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { clearInterval(minuterie); retirerSource(ctx, ds); ds = null; sats = []; }, etat: () => ({ n, heure }), iss: () => sats.find(s => s.iss) };
  }
};
