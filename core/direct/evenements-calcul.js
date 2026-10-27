/* ═════════════ ÉVÉNEMENTS NATURELS EN DIRECT : SÉISMES (USGS), CATASTROPHES (GDACS), INCENDIES ET TEMPÊTES (NASA EONET) — module pur, testé : direct-test.mjs ═════════════
   Sources officielles, gratuites, sans clé, sondées en vrai le 2026-10-22 :
   - USGS (US Geological Survey) : flux GeoJSON des séismes, CORS ouvert (appel direct du navigateur) ; heure et magnitude RÉELLES du réseau sismique (première estimation, révisée ensuite).
   - GDACS (ONU / Commission européenne) : alertes de catastrophes (séismes, cyclones, inondations, volcans, sécheresses, incendies) avec niveau vert / orange / rouge ; RSS sans CORS (via la passerelle du Worker, non déployée tant que Justin ne l'a pas décidé).
   - NASA EONET : événements naturels ouverts (incendies, tempêtes, volcans, inondations…), CORS ouvert.
   Un événement : { id, source, type, titre, t (ms), lat, lon, severite (0 à 4), mag?, niveau? ('vert'|'orange'|'rouge'), lieu, url, details }. Rien n'est inventé : une position ou une magnitude absente reste absente ;
   la SÉVÉRITÉ est calculée par des règles décrites ici (échelle indicative, pas une mesure officielle) et affichée avec ses raisons. */
export const URL_USGS = { heure: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson', jour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', significatifs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson' };
export const URL_EONET = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80';
export const TYPES = Object.freeze({ seisme: 'Séismes', incendie: 'Incendies', tempete: 'Tempêtes et cyclones', volcan: 'Volcans', inondation: 'Inondations', secheresse: 'Sécheresses', autre: 'Autres' });
export const NIVEAUX = Object.freeze({ 0: 'faible', 1: 'modérée', 2: 'notable', 3: 'forte', 4: 'majeure' });
export const COULEURS = Object.freeze({ seisme: '#ffb347', incendie: '#ff6b4a', tempete: '#4de3ff', volcan: '#ff4d8d', inondation: '#5aa9ff', secheresse: '#d9b36c', autre: '#b9a8ff' });

const arrondi = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const plafond = n => Math.max(0, Math.min(4, n));

/* ── Séismes USGS : magnitude, alerte PAGER, drapeau de tsunami ── */
export function severiteSeisme(mag, alerte, tsunami) {
  const raisons = []; let n = mag == null ? 0 : mag < 4 ? 0 : mag < 5 ? 1 : mag < 6 ? 2 : mag < 7 ? 3 : 4;
  if (mag != null) raisons.push('magnitude ' + arrondi(mag, 1));
  if (alerte === 'orange' || alerte === 'red') { n += 1; raisons.push('alerte PAGER ' + (alerte === 'red' ? 'rouge' : 'orange') + ' (+1)'); }
  if (tsunami) { n += 1; raisons.push('alerte tsunami (+1)'); }
  return { severite: plafond(n), raisons };
}
export function analyserUsgs(geo) {
  if (!geo || !Array.isArray(geo.features)) return [];
  const out = [];
  for (const f of geo.features) {
    const p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !Number.isFinite(p.time)) continue;
    const mag = Number.isFinite(p.mag) ? p.mag : null, alerte = p.alert || null, s = severiteSeisme(mag, alerte, p.tsunami === 1);
    out.push({ id: 'usgs:' + f.id, source: 'USGS', type: 'seisme', titre: 'Séisme M ' + (mag != null ? arrondi(mag, 1) : '?') + ' · ' + String(p.place || 'lieu inconnu'), t: p.time, lat: c[1], lon: c[0], profondeurKm: Number.isFinite(c[2]) ? arrondi(c[2], 0) : null, mag,
      niveau: alerte === 'red' ? 'rouge' : alerte === 'orange' ? 'orange' : alerte === 'yellow' ? 'jaune' : alerte === 'green' ? 'vert' : null, severite: s.severite, raisons: s.raisons, lieu: p.place || null, url: p.url || null, maj: p.updated || null,
      details: { ressenti: p.felt || null, tsunami: p.tsunami === 1, significance: p.sig || null, statut: p.status || null } });
  }
  return out;
}

/* ── NASA EONET ── */
const CAT_EONET = { wildfires: ['incendie', 0], severeStorms: ['tempete', 2], volcanoes: ['volcan', 2], floods: ['inondation', 2], drought: ['secheresse', 1], earthquakes: ['seisme', 2], landslides: ['autre', 1], dustHaze: ['autre', 0], snow: ['autre', 0], seaLakeIce: ['autre', 0], tempExtremes: ['autre', 1], waterColor: ['autre', 0], manmade: ['autre', 1] };
const centre = g => { if (!g) return null; if (g.type === 'Point') return g.coordinates; if (g.type === 'Polygon') { const a = g.coordinates[0], n = a.length; return [a.reduce((s, x) => s + x[0], 0) / n, a.reduce((s, x) => s + x[1], 0) / n]; } return null; };
export function analyserEonet(j) {
  if (!j || !Array.isArray(j.events)) return [];
  const out = [];
  for (const e of j.events) {
    const cat = (e.categories && e.categories[0] && e.categories[0].id) || 'autre', [type, base] = CAT_EONET[cat] || ['autre', 0];
    const geos = (e.geometry || []).filter(g => centre(g)), g = geos[geos.length - 1]; if (!g) continue;
    const c = centre(g), t = Date.parse(g.date); if (!Number.isFinite(t)) continue;
    let n = base; const raisons = ['catégorie ' + (e.categories && e.categories[0] ? e.categories[0].title : cat)];
    const mv = Number.isFinite(g.magnitudeValue) ? g.magnitudeValue : null;
    if (type === 'tempete' && mv != null) { n = g.magnitudeUnit === 'kts' ? (mv >= 96 ? 4 : mv >= 64 ? 3 : mv >= 34 ? 2 : 1) : n; raisons.push('vent ' + mv + ' ' + (g.magnitudeUnit || '')); }
    if (type === 'incendie' && mv != null && /acres/i.test(g.magnitudeUnit || '')) { n = mv >= 100000 ? 4 : mv >= 20000 ? 3 : mv >= 2000 ? 2 : mv >= 300 ? 1 : 0; raisons.push('surface ' + Math.round(mv).toLocaleString('fr-FR') + ' acres'); }
    out.push({ id: 'eonet:' + e.id, source: 'NASA EONET', type, titre: String(e.title || 'événement naturel'), t, lat: c[1], lon: c[0], severite: plafond(n), raisons, niveau: null, mag: null, lieu: null, url: (e.sources && e.sources[0] && e.sources[0].url) || e.link || null,
      details: { categorie: e.categories && e.categories[0] ? e.categories[0].title : null, positions: geos.length, magnitude: mv, unite: g.magnitudeUnit || null } });
  }
  return out;
}

/* ── GDACS (RSS) : niveau d'alerte vert / orange / rouge, type d'événement dans dc:subject (EQ, TC, FL, VO, DR, WF) ── */
const TYPE_GDACS = { EQ: 'seisme', TC: 'tempete', FL: 'inondation', VO: 'volcan', DR: 'secheresse', WF: 'incendie', TS: 'seisme' };
const bloc = (x, tag) => { const m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i').exec(x); return m ? m[1] : ''; };
const nettoyer = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
export function analyserGdacs(xml) {
  const out = [], re = /<item>([\s\S]*?)<\/item>/gi; let m;
  while ((m = re.exec(String(xml || '')))) {
    const b = m[1], titre = nettoyer(bloc(b, 'title')), sujet = nettoyer(bloc(b, 'dc:subject')), code = sujet.slice(0, 2).toUpperCase(), type = TYPE_GDACS[code] || 'autre';
    const niveauTxt = /^(green|orange|red)\b/i.exec(titre), niv = niveauTxt ? niveauTxt[1].toLowerCase() : null, lat = parseFloat(nettoyer(bloc(b, 'geo:lat'))), lon = parseFloat(nettoyer(bloc(b, 'geo:long')));
    const t = Date.parse(nettoyer(bloc(b, 'gdacs:fromdate')) || nettoyer(bloc(b, 'pubDate')));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
    const mag = /Magnitude ([\d.]+)M/i.exec(titre), n = niv === 'red' ? 4 : niv === 'orange' ? 3 : niv === 'green' ? 1 : 1, guid = nettoyer(bloc(b, 'guid')) || nettoyer(bloc(b, 'link'));
    out.push({ id: 'gdacs:' + guid, source: 'GDACS', type, titre: titre.replace(/^(Green|Orange|Red)\s+(?=earthquake|flood|volcano|drought|forest fire|wildfire|tropical cyclone)/i, '').replace(/\s*\d{1,3} (thousand|million)?\s*in \d+km\.?$/i, '').replace(/\s+Population affected.*$/i, '').slice(0, 160), t, lat, lon, severite: n, niveau: niv === 'red' ? 'rouge' : niv === 'orange' ? 'orange' : niv === 'green' ? 'vert' : null, mag: mag ? parseFloat(mag[1]) : null,
      raisons: ['niveau GDACS ' + (niv === 'red' ? 'rouge' : niv === 'orange' ? 'orange' : 'vert')], lieu: null, url: nettoyer(bloc(b, 'link')).replace(/^http:/, 'https:') || null, details: { description: nettoyer(bloc(b, 'description')).slice(0, 280), populationConcernee: /potentially affecting ([^ ]+(?: (?:thousand|million))?) in/i.exec(nettoyer(bloc(b, 'description'))) ? /potentially affecting ([^ ]+(?: (?:thousand|million))?) in/i.exec(nettoyer(bloc(b, 'description')))[1] : null } });
  }
  return out;
}

/* ── Fusion : un séisme peut venir de l'USGS ET de GDACS : on garde celui de l'USGS (plus précis), en y ajoutant le niveau d'alerte de GDACS s'il est plus élevé ── */
const distKm = (a, b) => { const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad, h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export function fusionnerEvenements(listes) {
  const tout = [].concat(...listes.filter(Boolean)), usgs = tout.filter(e => e.source === 'USGS'), vus = new Set(), out = [];
  for (const e of tout) {
    if (vus.has(e.id)) continue; vus.add(e.id);
    if (e.source === 'GDACS' && e.type === 'seisme') {
      const jumeau = usgs.find(u => Math.abs(u.t - e.t) < 20 * 60e3 && distKm(u, e) < 300 && (e.mag == null || u.mag == null || Math.abs(u.mag - e.mag) < 1));
      if (jumeau) { if (e.severite > jumeau.severite) { jumeau.severite = e.severite; jumeau.raisons = jumeau.raisons.concat(['niveau GDACS ' + e.niveau + ' (reprise)']); } jumeau.niveau = jumeau.niveau || e.niveau; jumeau.sources = ['USGS', 'GDACS']; jumeau.urlGdacs = e.url; continue; }
    }
    if (e.source === 'GDACS' && e.type === 'tempete') {          // le même cyclone vient de NASA EONET et de GDACS : même nom (CHAMPI) et position proche
      const nom = (/\b([A-Z][A-Z-]{2,})-?\d{0,2}\b/.exec(e.titre) || [])[1], jumeau = nom && tout.find(u => u.source === 'NASA EONET' && u.type === 'tempete' && new RegExp(nom.replace(/-+\d*$/, ''), 'i').test(u.titre) && Math.abs(u.t - e.t) < 21 * 86400e3);
      if (jumeau) { if (e.severite > jumeau.severite) { jumeau.severite = e.severite; jumeau.raisons = jumeau.raisons.concat(['niveau GDACS ' + e.niveau + ' (reprise)']); } jumeau.niveau = e.niveau; jumeau.sources = ['NASA EONET', 'GDACS']; jumeau.urlGdacs = e.url; continue; }
    }
    out.push(e);
  }
  return out.sort((a, b) => b.t - a.t);
}

/* ── Filtres, nouveautés, résumé ── */
export function filtrerEvenements(evts, { types = null, severiteMin = 0, depuis = -Infinity, bbox = null } = {}) {
  return evts.filter(e => e.severite >= severiteMin && e.t >= depuis && (!types || types.includes(e.type)) && (!bbox || (e.lat >= bbox.sud && e.lat <= bbox.nord && e.lon >= bbox.ouest && e.lon <= bbox.est)));
}
/* Nouveautés depuis la dernière interrogation : `vus` = ensemble d'identifiants déjà connus (modifié). Au tout premier chargement rien n'est « nouveau ». */
export function nouveautes(evts, vus, premier = false) { const nouveaux = []; for (const e of evts) { if (!vus.has(e.id)) { vus.add(e.id); if (!premier) nouveaux.push(e); } } return nouveaux; }
export function resumeEvenements(evts) { const r = { total: evts.length, parType: {}, majeurs: evts.filter(e => e.severite >= 3).length }; for (const e of evts) r.parType[e.type] = (r.parType[e.type] || 0) + 1; return r; }

/* Rayon d'affichage d'une balise en pixels selon la sévérité (pas selon une mesure physique). */
export const rayonBalise = (sev, base = 5) => base + sev * 3.2;
export const ageTexte = (t, maintenant = Date.now()) => { const m = Math.floor((maintenant - t) / 60000); return m < 1 ? 'à l’instant' : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : 'il y a ' + Math.round(m / 1440) + ' j'; };

/* Phrase parlée sur un type d'événement. */
export function phraseEvenements(evts, type = null, { maintenant = Date.now(), max = 3 } = {}) {
  const l = evts.filter(e => !type || e.type === type).sort((a, b) => b.severite - a.severite || b.t - a.t);
  const nom = type ? (TYPES[type] || 'événements').toLowerCase() : 'événements naturels';
  if (!l.length) return 'Aucun ' + (type === 'seisme' ? 'séisme' : type ? 'événement de ce type' : 'événement naturel') + ' à signaler d’après les sources en ce moment.';
  const maj = l.filter(e => e.severite >= 3).length;
  return l.length + ' ' + nom + ' en cours, dont ' + maj + ' d’intensité forte ou majeure. Les plus marquants : ' + l.slice(0, max).map(e => e.titre + ' (' + ageTexte(e.t, maintenant) + ', source ' + e.source + (e.niveau ? ', niveau ' + e.niveau : '') + ')').join(' ; ') + '.';
}
export function typeDeLaPhrase(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\b(seismes?|tremblements? de terre|secousses?)\b/.test(t)) return 'seisme';
  if (/\b(incendies?|feux de foret|feux)\b/.test(t)) return 'incendie';
  if (/\b(tempetes?|cyclones?|ouragans?|typhons?)\b/.test(t)) return 'tempete';
  if (/\b(volcans?|eruptions?)\b/.test(t)) return 'volcan';
  if (/\b(inondations?|crues?)\b/.test(t)) return 'inondation';
  if (/\b(secheresses?)\b/.test(t)) return 'secheresse';
  if (/\b(catastrophes?|evenements? naturels?|alertes? (de )?catastrophes?)\b/.test(t)) return 'tous';
  return null;
}
