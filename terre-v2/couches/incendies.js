/* Incendies actifs : NASA FIRMS (VIIRS NOAA-20, 24 h), MAP_KEY GRATUITE nécessaire. Désactivé sans clé. Pas de CORS côté FIRMS → petit relais sans secret
   (la clé de Justin voyage dans la requête vers le relais, elle n'est stockée nulle part). Zone visible seulement, 3 000 points au plus. */
import { nouvelleSource, retirerSource, centreVue, heureFr } from './outils.js';

export function lireCsv(txt) {
  const l = String(txt).trim().split(/\r?\n/); if (l.length < 2) return [];
  const t = l[0].split(','), iLat = t.indexOf('latitude'), iLon = t.indexOf('longitude'), iFrp = t.indexOf('frp'), iD = t.indexOf('acq_date'), iH = t.indexOf('acq_time'), iC = t.indexOf('confidence');
  if (iLat < 0 || iLon < 0) throw new Error('réponse FIRMS illisible');
  return l.slice(1).map(x => x.split(',')).map(c => ({ lat: +c[iLat], lon: +c[iLon], frp: iFrp >= 0 ? +c[iFrp] : null, date: iD >= 0 ? c[iD] : '', heure: iH >= 0 ? c[iH] : '', confiance: iC >= 0 ? c[iC] : '' })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
}

export const incendies = {
  id: 'incendies', nom: 'Incendies', legende: 'détections satellite des dernières 24 h', sourceCourte: 'NASA FIRMS', intervalle: 30 * 60e3, cle: 'cleFirms',
  procedure: 'Clé gratuite : demander une « MAP_KEY » sur firms.modaps.eosdis.nasa.gov/api/map_key (adresse e-mail seulement), puis la coller dans Couches → « Jeton et clés ».',
  credit: 'NASA FIRMS (VIIRS NRT), domaine public — « We acknowledge the use of data and/or imagery from NASA\'s FIRMS »',
  creer(ctx) {
    const { Cesium, viewer } = ctx; let ds = null, n = 0, heure = null;
    async function charger() {
      const c = centreVue(viewer, Cesium, 2000), dLat = Math.min(60, c.km / 111), dLon = Math.min(120, dLat * 1.6);
      const zone = [c.lon - dLon, c.lat - dLat, c.lon + dLon, c.lat + dLat].map(x => x.toFixed(2)).join(',');
      const r = await fetch(`${ctx.relais}/firms?cle=${encodeURIComponent(ctx.reglages.cleFirms)}&zone=${zone}`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('FIRMS HTTP ' + r.status);
      const feux = lireCsv(await r.text()).slice(0, 3000);
      if (!ds) ds = nouvelleSource(ctx, 'incendies');
      ds.entities.suspendEvents(); ds.entities.removeAll();
      for (const f of feux) { const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat), point: { pixelSize: f.frp > 50 ? 7 : 4, color: Cesium.Color.fromCssColorString(f.frp > 50 ? '#ff5a36' : '#ffa040').withAlpha(0.9), disableDepthTestDistance: 1.5e4 } }); e.rayle = { titre: 'Feu détecté', lignes: [`${f.date} ${f.heure} UTC`, f.frp != null ? `Puissance ${f.frp} MW` : '', f.confiance ? 'Confiance ' + f.confiance : ''].filter(Boolean), source: 'NASA FIRMS (domaine public)' }; }
      ds.entities.resumeEvents(); n = feux.length; heure = heureFr(Date.now());
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
