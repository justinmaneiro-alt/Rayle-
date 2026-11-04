/* Bateaux (AIS) : AISStream.io, clé GRATUITE nécessaire (compte sur aisstream.io). Désactivé tant que la clé manque.
   La clé reste dans ce navigateur (réglage), jamais dans le dépôt. Flux WebSocket limité à la zone visible ; 800 navires au plus. */
import { nouvelleSource, retirerSource, centreVue, heureFr } from './outils.js';

export const bateaux = {
  id: 'bateaux', nom: 'Bateaux', legende: 'position AIS en direct', sourceCourte: 'AISStream', intervalle: 0, cle: 'cleAis',
  procedure: 'Clé gratuite : créer un compte sur aisstream.io (connexion GitHub), « API Keys » → « Create », puis coller la clé dans Couches → « Jeton et clés ».',
  credit: 'AISStream.io (données AIS)',
  creer(ctx) {
    const { Cesium, viewer } = ctx; let ds = null, ws = null, navires = new Map(), heure = null, ouvert = false;
    function activer() {
      return new Promise((ok, ko) => {
        const c = centreVue(viewer, Cesium, 800), d = Math.min(8, c.km / 111);
        ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
        const minuterie = setTimeout(() => { if (!ouvert) { try { ws.close(); } catch (e) { /* */ } ko(new Error('AISStream ne répond pas')); } }, 12000);
        ws.onopen = () => { ouvert = true; clearTimeout(minuterie); ws.send(JSON.stringify({ APIKey: ctx.reglages.cleAis, BoundingBoxes: [[[c.lat - d, c.lon - d * 1.5], [c.lat + d, c.lon + d * 1.5]]], FilterMessageTypes: ['PositionReport'] })); ds = nouvelleSource(ctx, 'bateaux'); ok(); };
        ws.onerror = () => { if (!ouvert) { clearTimeout(minuterie); ko(new Error('connexion AISStream refusée (clé ?)')); } };
        ws.onclose = () => { if (ouvert) ctx.dire('Bateaux : flux AISStream fermé.', 6000); ouvert = false; };
        ws.onmessage = async m => {
          try {
            const j = JSON.parse(typeof m.data === 'string' ? m.data : await m.data.text()); const p = j.Message && j.Message.PositionReport, meta = j.MetaData; if (!p || !meta || !ds) return;
            let e = navires.get(meta.MMSI);
            if (!e) { if (navires.size >= 800) return; e = ds.entities.add({ point: { pixelSize: 5, color: Cesium.Color.fromCssColorString('#7fd8be'), disableDepthTestDistance: 1.5e4 } }); navires.set(meta.MMSI, e); }
            e.position = Cesium.Cartesian3.fromDegrees(p.Longitude, p.Latitude);
            e.rayle = { titre: (meta.ShipName || '').trim() || 'Navire ' + meta.MMSI, lignes: [`MMSI ${meta.MMSI}`, p.Sog != null ? `Vitesse ${p.Sog} nœuds` : ''].filter(Boolean), source: 'AISStream.io' };
            heure = heureFr(Date.now());
          } catch (e) { /* message illisible : ignoré */ }
        };
      });
    }
    return { activer, rafraichir: async () => { if (!ouvert) throw new Error('flux fermé'); }, desactiver() { try { ws && ws.close(); } catch (e) { /* */ } retirerSource(ctx, ds); ds = null; navires.clear(); }, etat: () => ({ n: navires.size, heure }) };
  }
};
