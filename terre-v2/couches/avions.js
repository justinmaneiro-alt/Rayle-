/* Avions en direct : adsb.lol (données ODbL, sans clé). Pas de CORS → passage par le petit relais séparé sans secret (terre-v2/relais).
   Zone visible seulement (≤ 250 milles nautiques autour du centre), 600 avions au plus, rafraîchi toutes les 10 s. */
import { json, nouvelleSource, retirerSource, centreVue, heureFr } from './outils.js';

export function couleurAltitude(pieds) { if (pieds == null || pieds === 'ground') return '#9e9e9e'; return pieds < 10000 ? '#4fc3f7' : pieds < 25000 ? '#8fd0e3' : '#e0f7fa'; }
export function normaliser(liste) {
  return (liste || []).filter(a => a.lat != null && a.lon != null).slice(0, 600).map(a => ({
    hex: a.hex, vol: (a.flight || '').trim() || a.r || a.hex, type: a.t || null, lat: a.lat, lon: a.lon,
    alt: a.alt_baro === 'ground' ? 'ground' : (a.alt_geom ?? a.alt_baro ?? null), cap: a.track ?? a.true_heading ?? 0, vitesse: a.gs ?? null
  }));
}

export const avions = {
  id: 'avions', nom: 'Avions', legende: 'couleur = altitude', sourceCourte: 'adsb.lol (via relais)', intervalle: 10e3,
  credit: 'adsb.lol (Open Database License, ODbL) — relayé par rayle-terre-relais',
  creer(ctx) {
    const { Cesium, viewer } = ctx; let ds = null, n = 0, heure = null;
    async function charger() {
      const c = centreVue(viewer, Cesium, 460), nm = Math.min(250, Math.round(c.km / 1.852));
      if (c.hauteur > 6e6) { if (ds) ds.entities.removeAll(); n = 0; heure = 'zoomer pour voir les avions'; return; }
      const j = await json(`${ctx.relais}/avions?lat=${c.lat.toFixed(3)}&lon=${c.lon.toFixed(3)}&dist=${nm}`, { timeout: 12000 });
      const liste = normaliser(j.ac || j.aircraft);
      if (!ds) ds = nouvelleSource(ctx, 'avions');
      ds.entities.suspendEvents(); ds.entities.removeAll();
      for (const a of liste) {
        const h = a.alt === 'ground' ? 0 : (a.alt || 0) * 0.3048;
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, h), billboard: { image: icone(), rotation: -Cesium.Math.toRadians(a.cap || 0), alignedAxis: Cesium.Cartesian3.UNIT_Z, color: Cesium.Color.fromCssColorString(couleurAltitude(a.alt)), scale: 0.55, disableDepthTestDistance: 1.5e4 } });
        e.rayle = { titre: `Vol ${a.vol}`, lignes: [a.type ? 'Appareil ' + a.type : '', a.alt === 'ground' ? 'Au sol' : a.alt != null ? `Altitude ${Math.round(a.alt).toLocaleString('fr-FR')} pieds` : '', a.vitesse != null ? `Vitesse ${Math.round(a.vitesse)} nœuds` : ''].filter(Boolean), source: 'adsb.lol (ODbL)' };
      }
      ds.entities.resumeEvents(); n = liste.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
let svg = null;
function icone() {
  if (svg) return svg;
  svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#ffffff" d="M16 2l2.2 9.5 10.8 6v2.6l-10.8-3.2-.6 7.6 3.4 2.6V29L16 27.6 11 29v-1.9l3.4-2.6-.6-7.6L3 20.1v-2.6l10.8-6z"/></svg>');
  return svg;
}
