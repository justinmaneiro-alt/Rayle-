// Fausses réponses des sources « en direct » (étape N) pour les tests : formats identiques aux vraies sources (sondées le 2026-10-22). Aucun réseau réel.
const NOW = Date.now();
const iso = t => new Date(t).toISOString();
const rfc = t => new Date(t).toUTCString();

export const usgs = () => JSON.stringify({ type: 'FeatureCollection', features: [
  { id: 'us1', properties: { mag: 6.4, place: '120 km SW of Hualien, Taiwan', time: NOW - 25 * 60e3, updated: NOW - 5 * 60e3, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1', alert: 'orange', tsunami: 1, sig: 640, status: 'reviewed', felt: 210 }, geometry: { type: 'Point', coordinates: [120.9, 23.2, 18] } },
  { id: 'us2', properties: { mag: 4.6, place: '40 km N of Reykjanes, Iceland', time: NOW - 3 * 3600e3, updated: NOW - 2 * 3600e3, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us2', alert: null, tsunami: 0, sig: 326 }, geometry: { type: 'Point', coordinates: [-22.9, 64.1, 10] } },
  { id: 'us3', properties: { mag: 2.7, place: '5 km E of Ridgecrest, CA', time: NOW - 40 * 60e3, updated: NOW, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us3', alert: null, tsunami: 0, sig: 112 }, geometry: { type: 'Point', coordinates: [-117.6, 35.6, 8] } },
  { id: 'us4', properties: { mag: 5.4, place: 'Banda Sea', time: NOW - 5 * 3600e3, updated: NOW - 4 * 3600e3, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us4', alert: 'green', tsunami: 0, sig: 450 }, geometry: { type: 'Point', coordinates: [129.7, -6.4, 150] } }] });
export const eonet = () => JSON.stringify({ title: 'EONET Events', events: [
  { id: 'EONET_1', title: 'Super Typhoon Champi', link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1', categories: [{ id: 'severeStorms', title: 'Severe Storms' }], sources: [{ id: 'JTWC', url: 'https://www.metoc.navy.mil/jtwc' }], geometry: [{ magnitudeValue: 90, magnitudeUnit: 'kts', date: iso(NOW - 3 * 3600e3), type: 'Point', coordinates: [140.2, 20.5] }] },
  { id: 'EONET_2', title: 'Wildfire Big Bend, Texas', categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'IRWIN', url: 'https://inciweb.example/1' }], geometry: [{ magnitudeValue: 45000, magnitudeUnit: 'acres', date: iso(NOW - 6 * 3600e3), type: 'Point', coordinates: [-103.2, 29.3] }] },
  { id: 'EONET_3', title: 'Small brush fire', categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [], geometry: [{ magnitudeValue: 40, magnitudeUnit: 'acres', date: iso(NOW - 7 * 3600e3), type: 'Point', coordinates: [-120.1, 38.5] }] },
  { id: 'EONET_4', title: 'Etna Volcano, Italy', categories: [{ id: 'volcanoes', title: 'Volcanoes' }], sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/etna' }], geometry: [{ date: iso(NOW - 24 * 3600e3), type: 'Point', coordinates: [14.99, 37.75] }] }] });
export const gdacs = () => '<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:gdacs="http://www.gdacs.org" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>GDACS</title>'
  + '<item><title>Orange earthquake (Magnitude 6.3M, Depth:20km) in Taiwan ' + new Date(NOW - 20 * 60e3).toUTCString() + ', 1 million in 100km.</title><description>An earthquake occurred in Taiwan potentially affecting 1 million in 100km. The earthquake had Magnitude 6.3M, Depth:20km.</description><link>http://www.gdacs.org/report.aspx?eventtype=EQ&amp;eventid=900</link><pubDate>' + rfc(NOW - 15 * 60e3) + '</pubDate><gdacs:fromdate>' + rfc(NOW - 22 * 60e3) + '</gdacs:fromdate><dc:subject>EQ2</dc:subject><guid isPermaLink="false">EQ900</guid><geo:Point><geo:lat>23.3</geo:lat><geo:long>121.0</geo:long></geo:Point></item>'
  + '<item><title>Red notification for tropical cyclone CHAMPI-26. Population affected by Category 1 wind speeds or higher is 0.18 million .</title><description>Tropical cyclone CHAMPI-26 potentially affecting 0.18 million.</description><link>http://www.gdacs.org/report.aspx?eventtype=TC&amp;eventid=901</link><pubDate>' + rfc(NOW - 86400e3) + '</pubDate><gdacs:fromdate>' + rfc(NOW - 5 * 86400e3) + '</gdacs:fromdate><dc:subject>TC3</dc:subject><guid isPermaLink="false">TC901</guid><geo:Point><geo:lat>18.0</geo:lat><geo:long>145.0</geo:long></geo:Point></item>'
  + '<item><title>Green flood in Bangladesh</title><description>Flood in Bangladesh.</description><link>http://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=902</link><pubDate>' + rfc(NOW - 3 * 3600e3) + '</pubDate><gdacs:fromdate>' + rfc(NOW - 4 * 3600e3) + '</gdacs:fromdate><dc:subject>FL1</dc:subject><guid isPermaLink="false">FL902</guid><geo:Point><geo:lat>23.8</geo:lat><geo:long>90.4</geo:long></geo:Point></item></channel></rss>';
const item = (titre, lien, t, desc = '') => '<item><title><![CDATA[' + titre + ']]></title><link>' + lien + '</link><pubDate>' + rfc(t) + '</pubDate><description><![CDATA[' + desc + ']]></description></item>';
const rss = items => '<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>' + items.join('') + '</channel></rss>';
const COMM = {
  onu: [['UN chief calls for ceasefire and humanitarian access', 1], ['Security Council meets on maritime security', 2]], oms: [['WHO issues alert on new influenza variant', 1], ['WHO launches global vaccination drive', 3]], commission: [['La Commission propose un nouveau cadre pour l’énergie', 1]],
  nasa: [['NASA selects new Mars mission instruments', 1], ['Artemis crew completes training milestone', 2]], esa: [['ESA signs contract for next lunar lander', 1]], bce_presse: [['ECB keeps interest rates unchanged', 2]]
};
export function communique(id) { const l = COMM[id]; return l ? { type: 'application/xml', corps: rss(l.map(([t, k]) => item(t, 'https://exemple.test/' + id + '/' + k, NOW - k * 3600e3, 'Résumé court ' + k))) } : null; }
const ep = (t, k, secure = true) => '<item><title>' + t + '</title><pubDate>' + rfc(NOW - k * 3600e3) + '</pubDate><itunes:duration>00:12:30</itunes:duration><description>Épisode ' + k + '</description><enclosure url="' + (secure ? 'https' : 'http') + '://audio.exemple.test/ep' + k + '.mp3" length="1000" type="audio/mpeg"/><link>https://exemple.test/ep' + k + '</link></item>';
export function podcast(id) {
  const t = { bbc_global: ['BBC Global News', false], npr_news: ['NPR News Now', true], dw_europe: ['DW Inside Europe', true], cbc_monde: ['CBC World This Hour', true], inter_8h20: ['France Inter 8h20', true] }[id]; if (!t) return null;
  return { type: 'application/xml', corps: '<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>' + t[0] + '</title>' + [1, 2, 3].map(k => ep(t[0] + ' épisode ' + k, k, t[1])).join('') + '</channel></rss>' };
}
const bskyProfil = (h, valide = true) => JSON.stringify({ did: 'did:plc:' + h, handle: h, displayName: h.split('.')[0].toUpperCase(), followersCount: 1000, verification: valide ? { verifiedStatus: 'valid' } : undefined });
const bskyFlux = h => JSON.stringify({ feed: [{ post: { uri: 'at://did:plc:' + h + '/app.bsky.feed.post/3abc1', author: { handle: h, displayName: h.split('.')[0].toUpperCase() }, record: { text: 'Message officiel de ' + h + ' : bilan de la journée', createdAt: iso(NOW - 30 * 60e3) }, likeCount: 5, repostCount: 2 } }, { reason: { $type: 'repost' }, post: { uri: 'at://x/app.bsky.feed.post/3abc2', author: { handle: 'autre.com' }, record: { text: 'republication à ignorer', createdAt: iso(NOW) } } }] });
export function reseauSocial(url) {
  const u = new URL(url);
  if (u.hostname === 'public.api.bsky.app') {
    const h = u.searchParams.get('actor');
    if (u.pathname.endsWith('getProfile')) return { type: 'application/json', corps: h === 'bbcnews.bsky.social' ? bskyProfil(h, false) : bskyProfil(h) };
    if (u.pathname.endsWith('getAuthorFeed')) return { type: 'application/json', corps: bskyFlux(h) };
  }
  if (u.hostname === 'ard.social') {
    if (u.pathname.endsWith('/lookup')) return { type: 'application/json', corps: JSON.stringify({ id: '11', display_name: 'tagesschau', followers_count: 9000, fields: [{ name: 'Website', value: 'tagesschau.de', verified_at: iso(NOW - 86400e3) }] }) };
    if (u.pathname.includes('/statuses')) return { type: 'application/json', corps: JSON.stringify([{ uri: 'https://ard.social/s/1', url: 'https://ard.social/@tagesschau/1', content: '<p>Eilmeldung der <b>tagesschau</b></p>', created_at: iso(NOW - 3600e3), favourites_count: 3, reblogs_count: 1, account: { acct: 'tagesschau', display_name: 'tagesschau' } }]) };
  }
  if (u.hostname === 'ec.social-network.europa.eu') {
    if (u.pathname.endsWith('/lookup')) return { type: 'application/json', corps: JSON.stringify({ id: '22', display_name: 'European Commission', followers_count: 160000, fields: [] }) };
    if (u.pathname.includes('/statuses')) return { type: 'application/json', corps: JSON.stringify([{ uri: 'https://ec/1', url: 'https://ec.social-network.europa.eu/@EUCommission/1', content: '<p>Commission : nouvelle proposition</p>', created_at: iso(NOW - 7200e3), favourites_count: 1, reblogs_count: 0, account: { acct: 'EUCommission', display_name: 'European Commission' } }]) };
  }
  return null;
}
export const wikipedia = url => {
  if (/onthisday\/selected/.test(url)) return { type: 'application/json', corps: JSON.stringify({ selected: [{ year: 1998, text: 'apparition de l’ouragan Mitch.', pages: [{ title: 'Ouragan_Mitch', titles: { normalized: 'Ouragan Mitch' }, content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Ouragan_Mitch' } } }] }, { year: 1964, text: 'Jean-Paul Sartre refuse le prix Nobel.', pages: [] }] }) };
  if (/featured/.test(url)) return { type: 'application/json', corps: JSON.stringify({ news: [{ story: 'The <b>Hôtel de Ville</b> in Limoges is partially destroyed.', links: [{ title: 'Limoges', titles: { normalized: 'Limoges' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Limoges' } } }] }] }) };
  return null;
};
export const wikinews = () => ({ type: 'application/json', corps: JSON.stringify({ query: { categorymembers: [{ title: 'Wikimedia Foundation closes Wikinews after 21 years', timestamp: '2026-05-03T23:59:05Z' }, { title: 'Pope Leo XIV visits France', timestamp: '2026-03-13T03:08:10Z' }] } }) });

/* url (page ou Worker) → { statut?, type, corps } ou null */
export function repondreDirect(url, { workerBase = 'http://127.0.0.1:8797', brutAbsent = false, panne = new Set() } = {}) {
  const u = new URL(url);
  if (u.href.startsWith(workerBase) && u.pathname === '/finance/brut') {
    if (brutAbsent) return { statut: 404, type: 'application/json', corps: JSON.stringify({ error: 'route inconnue' }) };
    const id = u.searchParams.get('id'); if (panne.has(id)) return { statut: 502, type: 'application/json', corps: JSON.stringify({ error: 'source indisponible : HTTP 503' }) };
    if (id === 'gdacs_24h') return { type: 'application/xml', corps: gdacs() };
    return communique(id) || podcast(id);
  }
  if (u.hostname === 'earthquake.usgs.gov') return { type: 'application/json', corps: usgs() };
  if (u.hostname === 'eonet.gsfc.nasa.gov') return { type: 'application/json', corps: eonet() };
  if (u.hostname === 'www.who.int') return communique('oms');
  if (u.hostname === 'ec.europa.eu') return communique('commission');
  if (u.hostname === 'www.nasa.gov') return communique('nasa');
  if (u.hostname === 'podcasts.files.bbci.co.uk') return podcast('bbc_global');
  if (u.hostname === 'feeds.npr.org') return podcast('npr_news');
  if (u.hostname === 'rss.dw.com') return podcast('dw_europe');
  if (u.hostname === 'radiofrance-podcast.net') return podcast('inter_8h20');
  if (u.hostname === 'api.wikimedia.org') return wikipedia(url);
  if (u.hostname === 'en.wikinews.org') return wikinews();
  return reseauSocial(url);
}
