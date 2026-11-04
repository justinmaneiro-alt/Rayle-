/* Caméras : UNIQUEMENT des flux officiellement publics en open data, images affichées telles que publiées, avec source et licence.
   - TfL JamCams (Londres) : « Powered by TfL Open Data » — données TfL sous Open Government Licence / conditions TfL ; contient des données OS © Crown copyright.
   - Caltrans CWWP2 (Californie) : images CCTV publiées par Caltrans pour l'information du public, selon les conditions d'utilisation du portail CWWP2.
   - Métropole de Lyon, caméras Web Criter (data.gouv.fr / data.grandlyon.com) : Licence Ouverte / Open Licence 2.0 (Etalab), image extraite chaque minute.
   JAMAIS de caméras privées ou non protégées, pas de Shodan/Insecam, aucun contournement, aucune reconnaissance de visages ou de plaques.
   Les listes sont chargées directement par le navigateur (CORS ouvert chez les trois sources) ; l'image n'est chargée qu'au clic. */
import { json, nouvelleSource, retirerSource, heureFr } from './outils.js';

export const SOURCES = [
  { id: 'tfl', nom: 'TfL JamCams (Londres)', licence: 'Powered by TfL Open Data — Open Government Licence ; contient des données OS © Crown copyright and database rights', url: 'https://api.tfl.gov.uk/Place/Type/JamCam',
    lire: j => (j || []).map(c => { const p = Object.fromEntries((c.additionalProperties || []).map(a => [a.key, a.value])); return p.available === 'false' ? null : { id: c.id, nom: c.commonName, lat: c.lat, lon: c.lon, image: p.imageUrl, video: p.videoUrl || null }; }).filter(Boolean) },
  ...['03', '04', '07', '11', '12'].map(d => ({ id: 'caltrans' + d, nom: 'Caltrans district ' + Number(d), licence: 'Caltrans CWWP2 — images publiées pour l’information du public (conditions d’utilisation du portail CWWP2)', url: `https://cwwp2.dot.ca.gov/data/d${Number(d)}/cctv/cctvStatusD${d}.json`,
    lire: j => ((j && j.data) || []).map(x => x.cctv).filter(c => c && c.inService === 'true' && c.imageData && c.imageData.static && c.imageData.static.currentImageURL).map(c => ({ id: 'ct' + d + '-' + c.index, nom: c.location.locationName, lat: +c.location.latitude, lon: +c.location.longitude, image: c.imageData.static.currentImageURL })) })),
  { id: 'lyon', nom: 'Métropole de Lyon (Criter)', licence: 'Licence Ouverte / Open Licence 2.0 (Etalab) — Métropole de Lyon', url: 'https://data.grandlyon.com/geoserver/metropole-de-lyon/ows?SERVICE=WFS&VERSION=2.0.0&request=GetFeature&typename=metropole-de-lyon:pvo_patrimoine_voirie.pvocameracriter&outputFormat=application/json&SRSNAME=EPSG:4326',
    lire: j => ((j && j.features) || []).filter(f => f.properties && f.properties.url).map(f => ({ id: 'lyon-' + f.properties.gid, nom: `${f.properties.nom} — ${f.properties.libellelong || ''}`, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], image: f.properties.url })) }
];

export const cameras = {
  id: 'cameras', nom: 'Caméras publiques', legende: 'trafic, open data officiel (clic = image)', sourceCourte: 'TfL · Caltrans · Lyon', intervalle: 6 * 3600e3,
  credit: SOURCES.filter((s, i) => i < 2 || s.id === 'lyon').map(s => s.licence).join(' | '),
  creer(ctx) {
    const { Cesium } = ctx; let ds = null, n = 0, heure = null, ko = [];
    async function charger() {
      const res = await Promise.allSettled(SOURCES.map(async s => ({ s, l: s.lire(await json(s.url, { timeout: 20000 })) })));
      ko = res.map((r, i) => (r.status === 'rejected' ? SOURCES[i].nom : null)).filter(Boolean);
      const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value); if (!ok.length) throw new Error('aucune source de caméras ne répond');
      if (!ds) ds = nouvelleSource(ctx, 'cameras');
      ds.entities.suspendEvents(); ds.entities.removeAll(); n = 0;
      for (const { s, l } of ok) for (const c of l) {
        if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
        const e = ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat), point: { pixelSize: 6, color: Cesium.Color.fromCssColorString('#f2d06b'), outlineColor: Cesium.Color.BLACK, outlineWidth: 1, disableDepthTestDistance: 1.5e4, distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2.5e6) } });
        e.rayle = { titre: c.nom, lignes: ['Image telle que publiée par la source (pas de traitement).'], image: c.image, source: `${s.nom} — ${s.licence}` };
        n++;
      }
      ds.entities.resumeEvents(); heure = heureFr(Date.now());
      if (ko.length) ctx.dire('Caméras : source indisponible : ' + ko.join(', '), 6000);
    }
    return { activer: charger, rafraichir: charger, desactiver() { retirerSource(ctx, ds); ds = null; }, etat: () => ({ n, heure }) };
  }
};
