// Tests des routes /actualites et /meteo du Worker (fichiers locaux worker/src/terre/, ignorés par git) avec de FAUSSES réponses (flux RSS, GDELT, Open-Meteo).
// Lancer :  node galaxie/tests/terre-worker-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/terre/', import.meta.url);
if (!fs.existsSync(new URL('actualites.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const RSS = await import(new URL('rss.js', racine).href), ACT = await import(new URL('actualites.js', racine).href), MET = await import(new URL('meteo.js', racine).href), PAYS = (await import(new URL('pays-flux.js', racine).href)).PAYS;
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const ent = new Proxy({}, { get: () => null });

/* ───── lecture RSS / Atom ───── */
const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Le journal</title>
<item><title><![CDATA[Un titre &amp; son <b>gras</b>]]></title><link>https://exemple.fr/a?x=1&amp;y=2</link><description>NE DOIT PAS ÊTRE GARDÉ</description><pubDate>Sat, 17 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Titre avec entités &eacute;t&eacute; &#233; &#x41;</title><link>https://exemple.fr/b</link><dc:date>2026-10-17T07:00:00Z</dc:date></item>
<item><title>Sans lien</title></item><item><title>Lien dangereux</title><link>javascript:alert(1)</link></item><item><title>ok</title><link>https://exemple.fr/c</link></item>
<item><title>Date impossible</title><link>https://exemple.fr/d</link><pubDate>pas une date</pubDate></item></channel></rss>`;
const t = RSS.lireFlux(rss);
v('RSS : 3 articles valides (sans lien, lien dangereux et titre trop court écartés)', t.length === 3, JSON.stringify(t.map(x => x.titre)));
v('RSS : CDATA, balises et entités nettoyées', t[0].titre === 'Un titre & son gras' && t[1].titre === 'Titre avec entités été é A', t[0].titre + ' | ' + t[1].titre);
v('RSS : adresse décodée', t[0].url === 'https://exemple.fr/a?x=1&y=2');
v('RSS : dates ISO, date impossible → null', t[0].date === '2026-10-17T08:00:00.000Z' && t[1].date === '2026-10-17T07:00:00.000Z' && t[2].date === null);
v('RSS : le résumé n\'est jamais gardé', !JSON.stringify(t).includes('NE DOIT PAS'));
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Titre Atom</title><link rel="self" href="https://x.org/self"/><link rel="alternate" href="https://x.org/article"/><updated>2026-10-16T10:00:00Z</updated></entry><entry><title>Autre titre Atom</title><link href="https://x.org/2"/><published>2026-10-16T09:00:00Z</published></entry></feed>`;
const a = RSS.lireFlux(atom);
v('Atom : lien « alternate » préféré, dates lues', a.length === 2 && a[0].url === 'https://x.org/article' && a[1].url === 'https://x.org/2' && a[0].date.startsWith('2026-10-16T10'), JSON.stringify(a));
v('flux vide ou HTML : aucun article, pas d\'erreur', RSS.lireFlux('<html><body>Erreur</body></html>').length === 0 && RSS.lireFlux('').length === 0 && RSS.lireFlux(null).length === 0);
v('flux immense : borné', RSS.lireFlux('<rss>' + '<item><title>Titre numéro 1</title><link>https://a.b/1</link></item>'.repeat(500) + '</rss>', 30).length === 30);

/* ───── mélange, doublons, fusion ───── */
const T = (titre, url, date) => ({ titre, url, date });
const m = ACT.melanger([
  { nom: 'A', langue: 'fr', titres: [T('Alpha un', 'https://a/1', '2026-10-17T10:00:00Z'), T('Alpha deux', 'https://a/2', '2026-10-17T09:00:00Z'), T('Alpha trois', 'https://a/3', '2026-10-17T08:00:00Z')] },
  { nom: 'B', langue: 'fr', titres: [T('Bravo un', 'https://b/1', '2026-10-17T09:30:00Z'), T('Alpha un', 'https://b/dup', '2026-10-17T09:31:00Z')] }
], 4);
v('mélange : sans doublon de titre, récent d\'abord, chaque média représenté', m.length === 4 && new Set(m.map(x => x.titre)).size === 4 && m[0].source === 'A' && m.some(x => x.source === 'B'), JSON.stringify(m.map(x => x.source + ':' + x.titre)));
v('mélange : au plus n titres', ACT.melanger([{ nom: 'A', langue: 'fr', titres: Array.from({ length: 30 }, (_, i) => T('Titre ' + i, 'https://a/' + i, '2026-10-17T10:00:00Z')) }], 5).length === 5);
v('titres comparables sans accents ni casse', ACT.cleTitre('  Été : ÇA va!  ') === 'ete ca va');
const f = ACT.fusion([{ titre: 'Un titre', url: 'https://a/1', date: '2026-10-17T08:00:00Z' }], [{ titre: 'UN TITRE', url: 'https://z/1', date: '2026-10-17T09:00:00Z' }, { titre: 'Nouveau', url: 'https://z/2', date: '2026-10-17T10:00:00Z' }], 5);
v('fusion : doublon écarté, plus récent d\'abord', f.length === 2 && f[0].titre === 'Nouveau');

/* ───── GDELT ───── */
const g = ACT.lireGdelt({ articles: [{ url: 'https://jp.example/a', title: 'Titre japonais assez long', seendate: '20261017T083000Z', domain: 'jp.example', language: 'Japanese' }, { url: 'ftp://mauvais', title: 'Mauvais lien assez long', seendate: '20261017T083000Z' }, { url: 'https://x/y', title: 'court' }] }, 'Japon');
v('GDELT : seuls les articles valides, date ISO', g.length === 1 && g[0].date === '2026-10-17T08:30:00Z' && g[0].nom === 'jp.example', JSON.stringify(g));

/* ───── registre des pays ───── */
const codes = Object.keys(PAYS);
v('registre : au moins 60 pays et 150 flux, tous en https ou http valides', codes.length >= 60 && Object.values(PAYS).reduce((s, p) => s + p.flux.length, 0) >= 150 && Object.values(PAYS).every(p => p.flux.every(x => /^https?:\/\//.test(x.u) && x.n && x.l)));
v('registre : centres géographiques plausibles', Object.entries(PAYS).every(([c, p]) => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && p.dist > 50), '');
v('registre : la France a plusieurs médias', PAYS.FR.flux.length >= 4 && PAYS.MONDE.flux.length >= 5);
const liste = ACT.listePays();
v('liste des pays : format', liste.length === codes.length && liste.find(x => x.code === 'JP').nom === 'Japon');

/* ───── route /actualites avec de faux serveurs ───── */
const stock = new Map();
globalThis.caches = { default: { match: async k => stock.get(String(k.url || k)) || null, put: async (k, r) => { stock.set(String(k.url || k), new Response(await r.clone().text())); } } };
const ctx = { waitUntil: () => {} };
const lire = async r => ({ s: r.status, j: await r.json() });
let scenario = { flux: {}, gdelt: 'ok', meteo: 'ok' }; const appels = [];
globalThis.fetch = async (url, o) => {
  url = String(url); appels.push(url);
  const rep = (txt, status = 200) => new Response(txt, { status });
  if (/gdeltproject/.test(url)) return scenario.gdelt === 'ok' ? rep(JSON.stringify({ articles: [{ url: 'https://g.example/1', title: 'Article trouvé par GDELT pour le pays', seendate: '20261017T090000Z', domain: 'g.example', language: 'French' }] })) : rep('Please limit requests to one every 5 seconds', 429);
  if (/open-meteo/.test(url)) return scenario.meteo === 'ok' ? rep(JSON.stringify(FAUX_METEO)) : rep('{}', 500);
  const mode = scenario.flux[url] ?? scenario.flux['*'] ?? 'ok';
  if (mode === 'ok') return rep(rss.replace(/exemple\.fr/g, new URL(url).hostname));
  if (mode === 'vide') return rep('<rss><channel></channel></rss>');
  return rep('erreur', Number(mode) || 500);
};
const cors = {};
const U = q => new URL('https://w/actualites?' + q);
let r = await lire(await ACT.routeActualites(U('pays=FR&n=8'), ent, ctx, cors));
v('/actualites FR : 200, titres, sources, pays', r.s === 200 && r.j.titres.length >= 3 && r.j.sources.length > 1 && r.j.pays.nom === 'France' && r.j.pays.lat > 40, JSON.stringify(r).slice(0, 200));
v('/actualites : chaque titre porte média, lien et date, rien d\'autre', r.j.titres.every(x => x.titre && /^https?:/.test(x.url) && x.source && Object.keys(x).every(k => ['titre', 'url', 'source', 'date', 'langue'].includes(k))));
const nAppels = appels.length;
r = await lire(await ACT.routeActualites(U('pays=FR&n=8'), ent, ctx, cors));
v('/actualites : deuxième demande servie par le cache (aucun nouvel appel)', r.s === 200 && appels.length === nAppels && r.j.cache !== 'non', r.j.cache + ' ' + (appels.length - nAppels));
scenario = { flux: { '*': 'ok' }, gdelt: 'ok' }; stock.clear();
const premier = PAYS.JP.flux[0].u; scenario.flux[premier] = 503;
r = await lire(await ACT.routeActualites(U('pays=JP'), ent, ctx, cors));
const sj = r.j.sources.find(s => s.nom === PAYS.JP.flux[0].n);
v('un média en panne est signalé sans gêner les autres', r.s === 200 && sj && !sj.ok && /503/.test(sj.erreur) && r.j.sources.some(s => s.ok) && r.j.titres.length > 0, JSON.stringify(r.j.sources));
scenario = { flux: { '*': 503 }, gdelt: 'ok' }; stock.clear();
r = await lire(await ACT.routeActualites(U('pays=JP'), ent, ctx, cors));
v('tous les flux en panne : GDELT prend le relais', r.s === 200 && r.j.titres.length >= 1 && r.j.gdelt && r.j.gdelt.ok && r.j.titres[0].source === 'g.example', JSON.stringify(r.j).slice(0, 200));
scenario = { flux: { '*': 503 }, gdelt: 'limite' }; stock.clear();
r = await lire(await ACT.routeActualites(U('pays=FR&n=9'), ent, ctx, cors));
v('tout est en panne : erreur claire (502), pas de titre inventé', r.s === 502 && /indisponibles/.test(r.j.error) && Array.isArray(r.j.erreurs), JSON.stringify(r));
scenario = { flux: { '*': 'ok' }, gdelt: 'ok' }; stock.clear();
r = await lire(await ACT.routeActualites(U('pays=KE&nom=Kenya&n=5'), ent, ctx, cors));
v('pays du registre sans nom libre : OK ; pays inconnu sans nom : 404 explicite', r.s === 200, '');
r = await lire(await ACT.routeActualites(U('pays=ZZ'), ent, ctx, cors)); v('pays inconnu : 404', r.s === 404 && /nom/.test(r.j.error));
r = await lire(await ACT.routeActualites(U('pays=%3Cscript%3E'), ent, ctx, cors)); v('code invalide : 400', r.s === 400);
r = await lire(await ACT.routeActualites(U('pays=ZZ&nom=Genovia'), ent, ctx, cors)); v('pays hors registre avec nom : GDELT seulement', r.s === 200 && r.j.pays.nom === 'Genovia' && r.j.titres.length === 1 && r.j.sources.length === 0, JSON.stringify(r.j).slice(0, 160));
r = await lire(await ACT.routeActualites(U('liste=1'), ent, ctx, cors)); v('/actualites?liste=1', r.s === 200 && r.j.pays.length > 60);
let limite = 0; for (let i = 0; i < 40; i++) if (ACT.limiteActus(1e12 + i)) limite++; v('limite de débit : > 30 demandes/minute refusées', limite >= 9, String(limite));

/* ───── /meteo ───── */
const FAUX_METEO = {
  latitude: 43.6, longitude: 2.24, elevation: 175, timezone: 'Europe/Paris',
  current: { time: '2026-10-17T11:30', temperature_2m: 17.9, relative_humidity_2m: 78, apparent_temperature: 17.6, is_day: 1, precipitation: 0, weather_code: 3, cloud_cover: 100, pressure_msl: 1021.7, wind_speed_10m: 11.4, wind_direction_10m: 288, wind_gusts_10m: 22 },
  hourly: { time: ['2026-10-17T11:00', '2026-10-17T12:00'], temperature_2m: [17.9, 18], precipitation_probability: [null, null], precipitation: [0, 0.2], weather_code: [3, 61], cloud_cover: [100, 90], wind_speed_10m: [11, 12] },
  daily: { time: ['2026-10-17'], weather_code: [3], temperature_2m_max: [21], temperature_2m_min: [11], precipitation_sum: [0.4], precipitation_probability_max: [null], sunrise: ['2026-10-17T08:10'], sunset: ['2026-10-17T19:12'], wind_speed_10m_max: [25] }
};
v('météo : France métropolitaine → modèles Météo-France', MET.enFrance(43.6, 2.2) && MET.choisirModele(43.6, 2.2).id === 'meteofrance_seamless' && MET.enFrance(48.85, 2.35) && MET.enFrance(42, 9));
v('météo : hors de France → meilleur modèle mondial', !MET.enFrance(35.7, 139.7) && MET.choisirModele(35.7, 139.7).id === '' && !MET.enFrance(51.5, 10.5) && !MET.enFrance(40.4, -3.7));
v('météo : coordonnées arrondies à 0,02° dans la clé de cache et l\'adresse', Math.abs(MET.arrondir(43.6047) - 43.6) < 1e-9 && /latitude=43\.60&longitude=1\.44/.test(MET.adresse(MET.arrondir(43.6047), MET.arrondir(1.4442), { id: '' })));
const fm = MET.formater(FAUX_METEO, { nom: 'Test' });
v('météo : format, champs absents → null (jamais inventés)', fm.actuel.temp === 17.9 && fm.heures[0].proba === null && fm.jours[0].proba === null && fm.jours[0].lever === '2026-10-17T08:10' && fm.source === 'Open-Meteo.com' && fm.lieu.altitude === 175);
scenario = { flux: { '*': 'ok' }, gdelt: 'ok', meteo: 'ok' }; stock.clear();
let mr = await lire(await MET.routeMeteo(new URL('https://w/meteo?lat=43.6047&lon=2.2399'), ent, ctx, cors));
v('/meteo : 200 avec le modèle Météo-France en France', mr.s === 200 && /Météo-France/.test(mr.j.modele) && mr.j.actuel.temp === 17.9 && appels.some(u => /models=meteofrance_seamless/.test(u) && /latitude=43\.60/.test(u)), JSON.stringify(mr.j).slice(0, 120));
mr = await lire(await MET.routeMeteo(new URL('https://w/meteo?lat=35.68&lon=139.7'), ent, ctx, cors));
v('/meteo : Tokyo sans modèle imposé', mr.s === 200 && /Open-Meteo/.test(mr.j.modele) && !appels.filter(u => /latitude=35\.68/.test(u)).some(u => /models=/.test(u)));
scenario.meteo = 'panne'; stock.clear();
mr = await lire(await MET.routeMeteo(new URL('https://w/meteo?lat=10&lon=10'), ent, ctx, cors));
v('/meteo : source en panne → 502 avec message', mr.s === 502 && /Open-Meteo/.test(mr.j.error), JSON.stringify(mr));
mr = await lire(await MET.routeMeteo(new URL('https://w/meteo?lat=abc&lon=10'), ent, ctx, cors)); v('/meteo : coordonnées invalides → 400', mr.s === 400);
mr = await lire(await MET.routeMeteo(new URL('https://w/meteo?lat=95&lon=10'), ent, ctx, cors)); v('/meteo : latitude hors limites → 400', mr.s === 400);
let lm = 0; for (let i = 0; i < 50; i++) if (MET.limiteMeteo(2e12 + i)) lm++; v('/meteo : limite de débit', lm >= 10, String(lm));

console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
