/* Lancements récents et à venir : Launch Library 2 (The Space Devs), accès libre limité à 15 requêtes/heure → cache de 30 min dans le navigateur. */
import { json, nouvelleSource, retirerSource, heureFr } from './outils.js';

const BASE = 'https://ll.thespacedevs.com/2.3.0/launches/';
async function liste(type) {
  const cle = 'rayle_t2_ll2_' + type;
  try { const c = JSON.parse(localStorage.getItem(cle)); if (c && Date.now() - c.t < 30 * 60e3) return c.r; } catch (e) { /* */ }
  const j = await json(`${BASE}${type}/?limit=12&mode=normal`, { timeout: 20000 });
  const r = (j.results || []).map(x => ({ nom: x.name, date: x.net, statut: x.status && (x.status.abbrev || x.status.name), pad: x.pad && x.pad.name, lieu: x.pad && x.pad.location && x.pad.location.name, lat: x.pad && +x.pad.latitude, lon: x.pad && +x.pad.longitude }));
  try { localStorage.setItem(cle, JSON.stringify({ t: Date.now(), r })); } catch (e) { /* */ }
  return r;
}

export const lancements = {
  id: 'lancements', nom: 'Lancements', legende: 'récents (gris) et à venir (cyan)', sourceCourte: 'Launch Library 2', intervalle: 30 * 60e3,
  credit: 'Launch Library 2 — The Space Devs (thespacedevs.com)',
  creer(ctx) {
    const { Cesium } = ctx; let ds = null, n = 0, heure = null;
    async function charger() {
      const [passes, futurs] = await Promise.all([liste('previous'), liste('upcoming')]);
      if (!ds) ds = nouvelleSource(ctx, 'lancements');
      ds.entities.suspendEvents(); ds.entities.removeAll();
      const parPad = new Map();
      for (const [x, futur] of [...passes.map(x => [x, false]), ...futurs.map(x => [x, true])]) {
        if (!Number.isFinite(x.lat) || !Number.isFinite(x.lon)) continue;
        const k = x.lat.toFixed(2) + ',' + x.lon.toFixed(2), d = parPad.get(k) || { x, futur, liste: [] }; d.liste.push((futur ? 'À venir : ' : 'Passé : ') + x.nom + ' — ' + new Date(x.date).toLocaleString('fr-FR') + (x.statut ? ' (' + x.statut + ')' : '')); if (futur) d.futur = true; parPad.set(k, d);
      }
      for (const d of parPad.values()) {
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(d.x.lon, d.x.lat), point: { pixelSize: 8, color: d.futur ? Cesium.Color.fromCssColorString('#8fd0e3') : Cesium.Color.LIGHTGRAY, outlineColor: Cesium.Color.BLACK, outlineWidth: 1, disableDepthTestDistance: 1.5e4 },
          label: { text: '🚀', font: '14px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: 1.5e4 } });
        e.rayle = { titre: d.x.pad || 'Pas de tir', lignes: [d.x.lieu || '', ...d.liste.slice(0, 6)], source: 'Launch Library 2 (The Space Devs)' };
      }
      ds.entities.resumeEvents(); n = passes.length + futurs.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
