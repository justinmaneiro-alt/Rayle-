// Sonde REELLE (depuis ce PC) des sources de l'etape N « sources d'actualite en direct » : statut, delai, CORS, taille, forme.
// Aucune cle, aucun secret. Lancer :  node planetes/terre/outils/sonde-sources-direct.mjs [filtre]   (ecrit docs/sources-direct.json sans filtre)
import fs from 'node:fs';
const ORIGINE = 'http://127.0.0.1:8000';
const J = (id, nom, url) => [id, nom, url];
const S = [
  J('usgs_jour', 'USGS : seismes de magnitude 2,5+ sur 24 h (GeoJSON)', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'),
  J('usgs_signif', 'USGS : seismes significatifs, 30 jours', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson'),
  J('gdacs_rss', 'GDACS : alertes de catastrophes (RSS)', 'https://www.gdacs.org/xml/rss.xml'),
  J('gdacs_api', 'GDACS : evenements (API GeoJSON)', 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventlist=EQ;TC;FL;VO;DR;WF'),
  J('eonet', 'NASA EONET : evenements naturels ouverts (incendies, tempetes...)', 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60'),
  J('onu', 'ONU Info : actualites (RSS)', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml'),
  J('onu_fr', 'ONU Info : actualites en francais (RSS)', 'https://news.un.org/feed/subscribe/fr/news/all/rss.xml'),
  J('oms', 'OMS : actualites (RSS)', 'https://www.who.int/rss-feeds/news-english.xml'),
  J('oms_do', 'OMS : alertes epidemiques Disease Outbreak News (RSS)', 'https://www.who.int/feeds/entity/csr/don/en/rss.xml'),
  J('commission', 'Commission europeenne : communiques (RSS Press Corner)', 'https://ec.europa.eu/commission/presscorner/api/rss?language=fr&pagesize=20'),
  J('commission2', 'Commission europeenne : communiques (RSS, autre adresse)', 'https://ec.europa.eu/commission/presscorner/home/en?format=rss'),
  J('nasa', 'NASA : actualites (RSS)', 'https://www.nasa.gov/feed/'),
  J('nasa_breaking', 'NASA : breaking news (RSS)', 'https://www.nasa.gov/rss/dyn/breaking_news.rss'),
  J('esa', 'ESA : actualites spatiales (RSS)', 'https://www.esa.int/rssfeed/Our_Activities/Space_News'),
  J('esa_all', 'ESA : toutes les actualites (RSS)', 'https://www.esa.int/rssfeed/TopNews'),
  J('fmi', 'FMI : actualites (RSS)', 'https://www.imf.org/en/news/rss?language=eng'),
  J('bce', 'BCE : communiques (RSS)', 'https://www.ecb.europa.eu/rss/press.html'),
  J('bsky_profil', 'Bluesky : profil public de NASA', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=nasa.gov'),
  J('bsky_flux', 'Bluesky : derniers messages de NASA (sans compte)', 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=nasa.gov&limit=5&filter=posts_no_replies'),
  J('bsky_who', 'Bluesky : OMS (who.int)', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=who.int'),
  J('bsky_un', 'Bluesky : ONU (un.org)', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=un.org'),
  J('bsky_bbc', 'Bluesky : BBC News', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bbcnews.bsky.social'),
  J('bsky_reuters', 'Bluesky : Reuters', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=reuters.com'),
  J('bsky_ap', 'Bluesky : Associated Press', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=apnews.com'),
  J('bsky_f24', 'Bluesky : France 24', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=france24.com'),
  J('bsky_monde', 'Bluesky : Le Monde', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=lemonde.fr'),
  J('bsky_esa', 'Bluesky : ESA', 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=esa.int'),
  J('masto_nasa', 'Mastodon : NASA (mastodon.social)', 'https://mastodon.social/api/v1/accounts/lookup?acct=NASA'),
  J('masto_ec', 'Mastodon : Commission europeenne (instance de l UE)', 'https://ec.social-network.europa.eu/api/v1/accounts/lookup?acct=ec'),
  J('masto_bbc', 'Mastodon : BBC News (mastodon.social)', 'https://mastodon.social/api/v1/accounts/lookup?acct=bbcnews'),
  J('masto_dw', 'Mastodon : DW (mastodon.social)', 'https://mastodon.social/api/v1/accounts/lookup?acct=dw_news'),
  J('masto_f24', 'Mastodon : France 24', 'https://mastodon.social/api/v1/accounts/lookup?acct=France24_en'),
  J('pod_bbc', 'Podcast : BBC Global News Podcast (RSS)', 'https://podcasts.files.bbci.co.uk/p02nq0gn.rss'),
  J('pod_npr', 'Podcast : NPR News Now (RSS)', 'https://feeds.npr.org/500005/podcast.xml'),
  J('pod_npr_upfirst', 'Podcast : NPR Up First (RSS)', 'https://feeds.npr.org/510318/podcast.xml'),
  J('pod_dw', 'Podcast : DW Inside Europe (RSS)', 'https://rss.dw.com/xml/podcast_inside-europe'),
  J('pod_rfi', 'Podcast : RFI Journal en francais facile (RSS)', 'https://www.rfi.fr/fr/podcasts/journal-en-fran%C3%A7ais-facile/podcast'),
  J('pod_franceinfo', 'Podcast : franceinfo (RSS Radio France)', 'https://radiofrance-podcast.net/podcast09/rss_21081.xml'),
  J('pod_fi_journal', 'Podcast : Radio France, journal (RSS)', 'https://radiofrance-podcast.net/podcast09/rss_14312.xml'),
  J('pod_cbc', 'Podcast : CBC World This Hour (RSS)', 'https://www.cbc.ca/podcasting/includes/hourlynews.xml'),
  J('pod_abc', 'Podcast : ABC Australia News (RSS)', 'https://www.abc.net.au/radio/programs/news-bulletins/feed/45866/rss.xml'),
  J('wikinews_en', 'Wikinews (en) : Atom', 'https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=15'),
  J('wikinews_fr', 'Wikinews (fr) : Atom', 'https://fr.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Publi%C3%A9&notcategories=Pas%20de%20publication%7CArchiv%C3%A9%7CAutoArchiv%C3%A9%7Cdisputed&namespace=0&count=15'),
  J('wikipedia_jour', 'Wikipedia : evenements du jour (fr)', 'https://api.wikimedia.org/feed/v1/wikipedia/fr/onthisday/events/10/22'),
  J('wikipedia_actu', 'Wikipedia : « Dans l actualite » (en, feed featured)', 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/2026/10/22'),
  J('yt_f24_en', 'YouTube RSS de France 24 English (verifie la chaine)', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCQfwfsi5VrQ8yKZ-UWmAEFg'),
  J('yt_f24_fr', 'YouTube RSS de France 24 Francais', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCCCPCZNChQdGa9EkATeye4g'),
  J('yt_euronews', 'YouTube RSS de Euronews English', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCSrZ3UV4jOidv8ppoVuvW9Q'),
  J('yt_dw', 'YouTube RSS de DW News', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCknLrEdhRCp1aegoMqRaCZg'),
  J('yt_aje', 'YouTube RSS de Al Jazeera English', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNye-wNBqNL5ZzHSJj3l8Bg'),
  J('yt_sky', 'YouTube RSS de Sky News', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoMdktPbSTixAyNGwb-UYkQ'),
  J('yt_nhk', 'YouTube RSS de NHK WORLD-JAPAN', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCMQjjjTiy7mVxpyrKQhpIIA'),
  J('nhk_hls', 'NHK WORLD-JAPAN : flux HLS officiel', 'https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8')
];
const lim = process.argv[2] ? new RegExp(process.argv[2]) : null, resultats = [];
for (const [id, nom, url] of S) {
  if (lim && !lim.test(id)) continue;
  const t0 = Date.now(), r = { id, nom, url, date: new Date().toISOString() };
  try {
    const rep = await fetch(url, { headers: { Origin: ORIGINE, 'User-Agent': 'Mozilla/5.0 (compatible; RayleHub/1.0)', Accept: '*/*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    r.statut = rep.status; r.ms = Date.now() - t0; r.cors = rep.headers.get('access-control-allow-origin') || null; r.type = (rep.headers.get('content-type') || '').split(';')[0];
    const txt = await rep.text(); r.octets = txt.length; r.nbItem = (txt.match(/<item[ >]|<entry[ >]/g) || []).length || null;
    const titre = /<title[^>]*>([^<]{1,80})<\/title>/i.exec(txt); r.titre = titre ? titre[1].trim() : null; r.extrait = txt.replace(/\s+/g, ' ').slice(0, 150);
  } catch (e) { r.erreur = String(e.message || e).slice(0, 120); r.ms = Date.now() - t0; }
  resultats.push(r);
  console.log(String(r.statut || 'ERR').padEnd(4) + (r.cors ? 'CORS ' : '     ') + String(r.ms).padStart(5) + 'ms ' + String(r.octets || 0).padStart(7) + 'o ' + (r.nbItem != null ? String(r.nbItem).padStart(3) + 'it ' : '      ') + id.padEnd(16) + ' ' + (r.erreur || (r.titre ? '[' + r.titre.slice(0, 40) + '] ' : '') + r.extrait).slice(0, 85));
  await new Promise(x => setTimeout(x, 250));
}
if (!lim) fs.writeFileSync(new URL('../../../docs/sources-direct.json', import.meta.url), JSON.stringify({ sondeLe: new Date().toISOString(), depuis: 'PC de Justin (France), Node', resultats }, null, 1));
