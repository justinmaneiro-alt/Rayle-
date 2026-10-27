// Tests du Worker pour les médias (fichiers locaux worker/…, ignorés par git) avec de FAUSSES sources : images des flux RSS, vignettes des sujets, vidéos (YouTube officiel, Commons, Internet Archive),
// archives pour l'histoire. Lancer :  node galaxie/tests/medias-worker-test.mjs
import fs from 'node:fs';
const base = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('intelligence/videos.js', base))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const R = await import(new URL('terre/rss.js', base).href), S = await import(new URL('terre/sujets.js', base).href);
const { MEM } = await import(new URL('infra/cache.js', base).href);
const V = await import(new URL('intelligence/videos.js', base).href), I = await import(new URL('intelligence/images.js', base).href);
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const stock = new Map();
globalThis.caches = { default: { match: async k => stock.get(String(k.url || k)) || null, put: async (k, r) => { stock.set(String(k.url || k), new Response(await r.clone().text(), { headers: r.headers })); } } };
const ctx = { waitUntil: p => p && p.catch && p.catch(() => {}) }, ENV = {};

// ── images des flux RSS ──
const item = (t, corps) => '<item><title>' + t + ' titre assez long</title><link>https://media.fr/' + encodeURIComponent(t) + '</link>' + corps + '</item>';
const lire = corps => R.lireFlux(item('A', corps))[0];
v('RSS : media:content image', lire('<media:content url="https://img.fr/a.jpg" medium="image" width="640"/>').image === 'https://img.fr/a.jpg');
v('RSS : enclosure de type image (franceinfo)', lire('<enclosure length="243" type="image/jpeg" url="https://img.fr/e.jpg"/>').image === 'https://img.fr/e.jpg');
v('RSS : media:thumbnail (BBC)', lire('<media:thumbnail width="240" height="135" url="https://img.fr/t.jpg"/>').image === 'https://img.fr/t.jpg');
v('RSS : la grande image est préférée à la miniature de 100 px', lire('<media:thumbnail width="100" url="https://img.fr/petite.jpg"/><media:content width="800" url="https://img.fr/grande.jpg"/>').image === 'https://img.fr/grande.jpg');
v('RSS : une vidéo ou un son n’est jamais pris pour une image', lire('<media:content url="https://img.fr/v.mp4" type="video/mp4"/><enclosure type="audio/mpeg" url="https://img.fr/s.mp3"/>').image === undefined);
v('RSS : http (non sécurisé) refusé', lire('<media:content url="http://img.fr/a.jpg" medium="image"/>').image === undefined);
v('RSS : adresse piégée refusée (espaces, javascript:, data:)', lire('<media:content url="javascript:alert(1).jpg" medium="image"/>').image === undefined && lire('<media:content url="data:image/png;base64,AAA" medium="image"/>').image === undefined && lire('<media:content url="https://x.fr/a b.jpg" medium="image"/>').image === undefined);
v('RSS : entités décodées (&amp;)', lire('<media:content url="https://img.fr/a.jpg?x=1&amp;y=2" medium="image"/>').image === 'https://img.fr/a.jpg?x=1&y=2');
v('RSS : sans image, le champ est absent (rien d’inventé)', lire('').image === undefined);
v('RSS : le titre, l’adresse et la date restent lus comme avant', lire('<pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate>').titre === 'A titre assez long');

// ── les vignettes suivent le sujet ──
const it = (titre, source, extra = {}) => S.preparer({ titre, url: 'https://' + source.toLowerCase().replace(/\W/g, '') + '.fr/' + encodeURIComponent(titre).slice(0, 30), source, date: new Date().toISOString(), langue: 'fr', ...extra });
const sj = S.construireSujets([
  it('Incendie géant dans un entrepôt de Lyon ce matin', 'Média A', { image: 'https://a.fr/i.jpg' }), it('Lyon : un incendie géant ravage un entrepôt', 'Média B'),
  it('Réforme des retraites présentée au conseil des ministres', 'Média A'), it('Conseil des ministres : la réforme des retraites présentée', 'Média C')
]);
const lyon = sj.find(x => /Lyon/.test(x.titre)), reforme = sj.find(x => /Réforme|retraites/.test(x.titre));
v('sujet : la vignette du média qui en a une est reprise', lyon && lyon.image === 'https://a.fr/i.jpg' && lyon.sources.some(s => s.image === 'https://a.fr/i.jpg' && s.nom === 'Média A') && lyon.sources.some(s => s.nom === 'Média B' && s.image === null));
v('sujet : sans image dans aucun flux, image = null', reforme && reforme.image === null);

// ── vidéos : fonctions pures ──
const yt = (id, titre, jours, extra = '') => '<entry><id>yt:video:' + id + '</id><yt:videoId>' + id + '</yt:videoId><title>' + titre + '</title><link rel="alternate" href="https://www.youtube.com/watch?v=' + id + '"/><published>' + new Date(Date.now() - jours * 86400000).toISOString() + '</published>' + extra + '</entry>';
const flux = '<feed>' + yt('abcDEFghi_1', 'Incendie à Lyon : un entrepôt détruit par les flammes', 0.5) + yt('abcDEFghi_2', 'Match de rugby : le résumé', 0.2) + yt('abcDEFghi_3', 'Incendie à Lyon : le bilan', 12) + '<entry><yt:videoId>BAD</yt:videoId><title>x</title></entry>'
  + '<entry><yt:videoId>abcDEFghi_4</yt:videoId><title>Short Lyon incendie vertical</title><link href="https://www.youtube.com/shorts/abcDEFghi_4"/><published>' + new Date().toISOString() + '</published></entry></feed>';
const lu = V.lireFluxYoutube(flux, 'franceinfo');
v('YouTube : flux lu (3 vidéos valides, identifiant douteux et short écartés)', lu.length === 3 && lu.every(x => /^[A-Za-z0-9_-]{11}$/.test(x.id)) && !lu.some(x => x.id === 'abcDEFghi_4'), lu.map(x => x.id).join());
v('YouTube : lecteur nocookie, lien officiel, miniature YouTube', (() => { const f = V.formaterVideoYoutube(lu[0]); return f.embed === 'https://www.youtube-nocookie.com/embed/abcDEFghi_1' && f.source_url === 'https://www.youtube.com/watch?v=abcDEFghi_1' && /^https:\/\/i\.ytimg\.com\//.test(f.miniature) && f.auteur === 'franceinfo' && /YouTube/.test(f.licence); })());
v('pertinence : un titre qui parle du sujet', V.titrePertinent('incendie entrepôt Lyon', 'Incendie à Lyon : un entrepôt détruit') && !V.titrePertinent('incendie entrepôt Lyon', 'Match de rugby : le résumé'));
v('pertinence : un seul mot commun ne suffit pas pour plusieurs mots', !V.titrePertinent('incendie entrepôt Lyon', 'Lyon : le marché de Noël ouvre') );
v('pertinence : un nom propre long seul peut suffire', V.titrePertinent('Fukushima', 'Fukushima : de l’eau traitée rejetée') && !V.titrePertinent('Lyon', 'Lyon : le marché'));   // 4 lettres : trop court pour suffire seul
v('pertinence : un nombre de la demande doit se retrouver (Apollo 11 ≠ Apollo 13)', V.titrePertinent('Apollo 11', 'Apollo 11 : le premier pas') && !V.titrePertinent('Apollo 11', 'Apollo 13: Houston'));
v('Commons : vidéo libre retenue, licence et source affichables', (() => { const f = V.formaterVideoCommons({ pageid: 5, title: 'File:Apollo 11.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Apollo_11.webm', mime: 'video/webm', duration: 120, thumburl: 'https://upload.wikimedia.org/thumb.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Apollo_11.webm', extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'NASA' }, ObjectName: { value: 'Apollo 11' } } }] }); return f && f.plateforme === 'commons' && f.licence === 'Public domain' && f.auteur === 'NASA' && f.duree === 120; })());
const vidCommons = (extra = {}, meta = {}) => ({ pageid: 6, title: 'File:Test.webm', imageinfo: [{ url: 'https://upload.wikimedia.org/a.webm', mime: 'video/webm', duration: 10, thumburl: 'https://upload.wikimedia.org/t.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Test.webm', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'X' }, ...meta }, ...extra }] });
v('Commons : licence non libre refusée', V.formaterVideoCommons(vidCommons({}, { LicenseShortName: { value: 'CC BY-NC 4.0' } })) === null);
v('Commons : film entier (> 1 h) refusé, hôte étranger refusé, image refusée', V.formaterVideoCommons(vidCommons({ duration: 7200 })) === null && V.formaterVideoCommons(vidCommons({ url: 'https://evil.example/a.webm' })) === null && V.formaterVideoCommons(vidCommons({ mime: 'image/jpeg' })) === null);
v('Commons : contenu choquant refusé', V.formaterVideoCommons(vidCommons({}, { ImageDescription: { value: 'scène de torture' } })) === null);
const ia = (o = {}) => ({ identifier: 'Apollo_11_film', title: 'Apollo 11 film', creator: 'NASA', licenseurl: 'https://creativecommons.org/licenses/by/4.0/', ...o });
v('Internet Archive : licence Creative Commons explicite retenue, lecteur archive.org/embed', (() => { const f = V.formaterVideoArchive(ia()); return f && f.embed === 'https://archive.org/embed/Apollo_11_film' && /Creative Commons/.test(f.licence) && f.source_url === 'https://archive.org/details/Apollo_11_film'; })());
v('Internet Archive : domaine public explicite retenu', V.formaterVideoArchive(ia({ licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' })).licence === 'Domaine public');
v('Internet Archive : sans licence, NC, ND ou identifiant piégé → refusé', V.formaterVideoArchive(ia({ licenseurl: undefined })) === null && V.formaterVideoArchive(ia({ licenseurl: 'https://creativecommons.org/licenses/by-nc/4.0/' })) === null && V.formaterVideoArchive(ia({ licenseurl: 'https://creativecommons.org/licenses/by-nd/4.0/' })) === null && V.formaterVideoArchive(ia({ identifier: '../x" onload=' })) === null);
v('Internet Archive (images) : mêmes règles', I.formaterImageArchive({ identifier: 'photo_1', title: 'Pont 1900', licenseurl: 'https://creativecommons.org/publicdomain/zero/1.0/' }) !== null && I.formaterImageArchive({ identifier: 'photo_1', title: 'Pont 1900' }) === null);

// ── recherche complète avec de fausses sources ──
const appels = []; let scenario = {};
globalThis.fetch = async (url) => {
  url = String(url); appels.push(url);
  const rep = (o, texte) => ({ ok: true, status: 200, json: async () => o, text: async () => texte || '' });
  if (scenario.panne && scenario.panne.some(p => url.includes(p))) return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
  if (/youtube\.com\/feeds\/videos\.xml/.test(url)) { const id = /channel_id=([^&]+)/.exec(url)[1]; return rep(null, scenario.youtube && scenario.youtube[id] || '<feed></feed>'); }
  if (/commons\.wikimedia\.org\/w\/api\.php/.test(url) && /generator=search/.test(url)) return rep({ query: { pages: scenario.commonsVideos || [] } });
  if (/archive\.org\/advancedsearch/.test(url)) return rep({ response: { docs: scenario.archive || [] } });
  throw new Error('appel inattendu : ' + url);
};
const reinit = s => { scenario = s; appels.length = 0; stock.clear(); MEM.clear(); };
reinit({ youtube: { [V.CHAINES[0].id]: flux, [V.CHAINES[2].id]: '<feed>' + yt('zzzzzzzzzz9', 'Incendie à Lyon : images de l’entrepôt', 0.3) + '</feed>' } });
let r = await V.chercherVideos('incendie entrepôt Lyon', 'actu', 3, ENV, ctx);
v('actu : seules les vidéos récentes ET pertinentes sont proposées (2 sur 5 vues)', r.videos.length === 2 && r.videos.every(x => x.plateforme === 'youtube' && /youtube-nocookie\.com\/embed\//.test(x.embed)), JSON.stringify(r.videos.map(x => x.titre)));
v('actu : une demande par chaîne officielle, rien d’autre', appels.length === V.CHAINES.length && appels.every(a => /youtube\.com\/feeds\/videos\.xml\?channel_id=UC/.test(a)));
r = await V.chercherVideos('incendie entrepôt Lyon', 'actu', 3, ENV, ctx);
v('actu : le flux des chaînes est mis en cache (aucun nouvel appel)', appels.length === V.CHAINES.length);
reinit({ youtube: { [V.CHAINES[0].id]: flux } });
r = await V.chercherVideos('élection au Brésil', 'actu', 3, ENV, ctx);
v('actu : aucun titre fiable → liste vide avec une raison, pas de vidéo inventée', r.videos.length === 0 && /aucune vidéo fiable/.test(r.raison));
reinit({ panne: ['youtube.com/feeds'] });
let erreur = null; try { await V.chercherVideos('incendie entrepôt Lyon', 'actu', 3, ENV, ctx); } catch (e) { erreur = e; }
v('actu : toutes les chaînes en panne → erreur claire (pas de faux « aucune vidéo »)', !!erreur && /ne répondent pas/.test(erreur.message));
reinit({ commonsVideos: [Object.assign(vidCommons(), { index: 1, title: 'File:Apollo 11 launch.webm' }), Object.assign(vidCommons({}, { LicenseShortName: { value: 'CC BY-NC 2.0' } }), { index: 2, title: 'File:Apollo 11 nc.webm' })], archive: [ia(), ia({ identifier: 'autre', title: 'Un film sans rapport', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' }), ia({ identifier: 'sans_licence', licenseurl: undefined })] });
r = await V.chercherVideos('Apollo 11 film', 'savoir', 3, ENV, ctx);
v('savoir : Commons (libre) + Internet Archive (licence explicite) ; non libre, hors sujet et sans licence écartés', r.videos.length === 2 && r.videos.map(x => x.plateforme).sort().join() === 'archive,commons', JSON.stringify(r.videos.map(x => [x.plateforme, x.titre])));
v('savoir : aucun champ interne ne fuit vers la page', r.videos.every(x => !('_texte' in x)));
reinit({ panne: ['commons.wikimedia.org', 'archive.org'] });
erreur = null; try { await V.chercherVideos('Apollo 11 film', 'savoir', 3, ENV, ctx); } catch (e) { erreur = e; }
v('savoir : les deux sources en panne → erreur claire', !!erreur && /ne répondent pas/.test(erreur.message));
reinit({});
r = await V.chercherVideos('cadavre', 'savoir', 3, ENV, ctx);
v('sujet sensible : refusé, aucune requête', r.videos.length === 0 && /sensible/.test(r.raison) && appels.length === 0);
v('limite de débit : 20 demandes par minute', (() => { const t = Date.now() + 10 ** 7; let refus = 0; for (let i = 0; i < 25; i++) if (V.limiteVideos(t)) refus++; return refus === 5; })());
const rr = await V.routeVideos(new URL('http://x/videos?q=&type=actu'), ENV, ctx, {});
v('route : sujet manquant → 400', rr.status === 400);

// ── archives pour l'histoire (images) ──
reinit({});
globalThis.fetch = async (url) => {
  url = String(url); appels.push(url);
  const rep = o => ({ ok: true, status: 200, json: async () => o });
  if (/fr\.wikipedia\.org/.test(url)) return rep({ query: { pages: [{ index: 1, title: 'Pont de Brooklyn', description: 'pont suspendu à New York', pageimage: null }] } });
  if (/en\.wikipedia\.org/.test(url)) return rep({ query: { pages: [] } });
  if (/commons\.wikimedia\.org/.test(url)) return rep({ query: { pages: [] } });
  if (/openverse/.test(url)) return rep({ results: [] });
  if (/archive\.org\/advancedsearch/.test(url)) return rep({ response: { docs: [{ identifier: 'brooklyn_1900', title: 'Pont de Brooklyn 1900', creator: 'Détroit Publishing', licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' }, { identifier: 'prive', title: 'Pont de Brooklyn 1900 privé' }] } });
  throw new Error('appel inattendu : ' + url);
};
const h = await I.chercherImages('pont de Brooklyn en 1900', 4);
v('histoire : à défaut de Commons, une image d’archive à licence explicite est proposée, avec lien et licence', h.images.length === 1 && h.images[0].origine === 'archive' && h.images[0].licence === 'Domaine public' && /archive\.org\/details\//.test(h.images[0].source_url), JSON.stringify(h.images.map(x => x.titre)));
reinit({}); const nh = await I.chercherImages('pont de Brooklyn', 4).catch(e => ({ images: ['x'] }));
v('pas d’époque dans la demande : les archives ne sont pas interrogées', !appels.some(a => /archive\.org/.test(a)));

console.log(ko ? ko + ' ÉCHEC(S), ' + ok + ' réussis' : 'medias-worker : ' + ok + ' vérifications réussies');
process.exit(ko ? 1 : 0);
