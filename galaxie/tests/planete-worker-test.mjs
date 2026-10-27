// Tests du digest « actualités de toute la planète » (Worker, fichiers locaux ignorés par git) avec de FAUSSES sources : registre des pays, lots, plan gratuit Cloudflare
// (appels sortants et calcul par exécution), pannes, repli sur le deuxième média, continents, honnêteté, absence d'IA. Lancer :  node galaxie/tests/planete-worker-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('terre/planete.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const stock = new Map();
globalThis.caches = { default: { match: async k => stock.get(String(k.url || k)) || null, put: async (k, r) => { stock.set(String(k.url || k), new Response(await r.clone().text(), { headers: r.headers })); } } };
const R = await import(new URL('terre/pays-flux.js', racine).href), P = await import(new URL('terre/planete.js', racine).href), F = await import(new URL('terre/fil.js', racine).href), CACHE = await import(new URL('infra/cache.js', racine).href);
const W = (await import(new URL('infra/index.js', racine).href)).default;

// ── le registre ──
const codes = Object.keys(R.PAYS).filter(c => c !== 'MONDE');
const tous = Object.values(R.PAYS).flatMap(p => p.flux);
v('registre : au moins 60 pays (objectif de l’étape 5)', codes.length >= 60, String(codes.length));
v('registre : tous les continents sont représentés', Object.keys(R.CONTINENTS).every(c => codes.some(k => R.PAYS[k].continent === c)), Object.keys(R.CONTINENTS).filter(c => !codes.some(k => R.PAYS[k].continent === c)).join());
v('registre : chaque pays a un code ISO à 2 lettres, un nom, un continent connu, un centre, un code FIPS et au moins un flux', codes.every(c => /^[A-Z]{2}$/.test(c) && R.PAYS[c].nom && R.CONTINENTS[R.PAYS[c].continent] && Number.isFinite(R.PAYS[c].lat) && Math.abs(R.PAYS[c].lat) <= 90 && Math.abs(R.PAYS[c].lon) <= 180 && R.PAYS[c].dist > 0 && typeof R.PAYS[c].fips === 'string' && R.PAYS[c].flux.length >= 1));
v('registre : chaque flux a un nom, une adresse web, une langue et une rubrique', tous.every(x => x.n && /^https?:\/\/[^\s]+$/.test(x.u) && /^[a-z]{2}$/.test(x.l) && x.r), JSON.stringify(tous.find(x => !(x.n && /^https?:\/\/[^\s]+$/.test(x.u) && /^[a-z]{2}$/.test(x.l) && x.r))));
v('registre : 6 flux au plus par pays, aucune adresse en double dans un pays', codes.every(c => R.PAYS[c].flux.length <= 6 && new Set(R.PAYS[c].flux.map(x => x.u)).size === R.PAYS[c].flux.length));
v('registre : les régions (continents) ont des médias, et chaque continent pointe vers une région connue', Object.values(R.REGIONS).every(r => r.flux.length >= 2) && Object.keys(R.CONTINENTS).every(c => R.REGIONS[R.REGION_DU_CONTINENT[c]]));
v('registre : les langues d’origine sont gardées (japonais, arabe, coréen, russe, portugais…)', ['ja', 'ar', 'ko', 'ru', 'pt', 'es', 'de', 'zh'].every(l => tous.some(x => x.l === l)));
v('registre : les pays-clés demandés ont des médias (Japon, Brésil, Afrique du Sud, Australie, Canada, Inde, Corée du Sud, Turquie…)', ['JP', 'BR', 'ZA', 'AU', 'CA', 'IN', 'KR', 'TR', 'ES', 'IT', 'FI', 'NL', 'CH', 'IE', 'QA'].every(c => R.PAYS[c]), ['JP', 'BR', 'ZA', 'AU', 'CA', 'IN', 'KR', 'TR', 'ES', 'IT', 'FI', 'NL', 'CH', 'IE', 'QA'].filter(c => !R.PAYS[c]).join());

// ── lots du digest ──
const lots = P.lotsDigest(), vus = lots.flat().map(e => e.cle);
v('digest : chaque pays du registre est dans exactement un lot', new Set(vus).size === vus.length && codes.every(c => vus.includes(c)));
v('digest : chaque continent a son entrée de médias régionaux', Object.keys(R.REGIONS).every(r => vus.includes('REG:' + r) || !R.REGIONS[r].flux.length));
v('digest : aucun lot ne prévoit plus de 10 appels en fonctionnement normal', lots.every(l => l.reduce((s, e) => s + e.cout, 0) <= P.DIGEST_COUT_LOT), lots.map(l => l.reduce((s, e) => s + e.cout, 0)).join());
v('digest : le cycle d’une heure contient tous les lots + l’assemblage', (() => { const p = F.programme(); return p.filter(a => a && a.type === 'digest').length === lots.length && p.some(a => a && a.type === 'assembler-digest'); })(), lots.length + ' lots');
const prog = F.programme();
v('programme : une seule action par minute, France à chaque quart d’heure', prog.length === 60 && [0, 15, 30, 45].every(m => prog[m] && prog[m].portee === 'france'));
const noSrc = fs.readFileSync(new URL('terre/planete.js', racine), 'utf8') + fs.readFileSync(new URL('terre/fil.js', racine), 'utf8') + fs.readFileSync(new URL('terre/actualites.js', racine), 'utf8');
v('zéro IA : la récupération des actualités n’importe aucun module d’IA ni de traduction', !/intelligence\/(?:ia|agent)|from '\.\.\/intelligence|translate|traduct.*fetch|groq|gemini|mistral|openrouter|cerebras/i.test(noSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));

// ── faux flux : un RSS par adresse, avec miniature ; quelques pays en panne ──
const PANNE_PRINCIPALE = new Set(['JP', 'KE']), PANNE_TOTALE = new Set(['ZW']);
const maintenant = Date.now();
const rss = (nom, langue, k) => '<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel>' + [1, 2, 3, 4, 5].map(i => `<item><title>Titre ${i} de ${nom} (${langue})</title><link>https://${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}.test/a${i}</link><pubDate>${new Date(maintenant - (k * 7 + i) * 600000).toUTCString()}</pubDate><media:thumbnail url="https://img.${nom.toLowerCase().replace(/[^a-z0-9]/g, '')}.test/${i}.jpg" width="300"/><description>${'Résumé long qui ne doit jamais être servi. '.repeat(30)}</description></item>`).join('') + '</channel></rss>';
const parUrl = new Map(); for (const [c, p] of Object.entries(R.PAYS)) p.flux.forEach((x, i) => parUrl.set(x.u, { c, x, i })); for (const [id, r] of Object.entries(R.REGIONS)) r.flux.forEach(x => parUrl.set(x.u, { c: 'REG:' + id, x, i: 9 }));
let sousReq = 0; const urlsLues = [];
globalThis.fetch = async (u) => {
  sousReq++; const url = String(u), e = parUrl.get(url); if (!e) return new Response('inconnu', { status: 404 });
  urlsLues.push(url);
  if (PANNE_TOTALE.has(e.c)) return new Response('x', { status: 503 });
  if (PANNE_PRINCIPALE.has(e.c) && e.i === 0) return new Response('x', { status: 500 });
  return new Response(rss(e.x.n, e.x.l, Object.keys(R.PAYS).indexOf(e.c) % 5));
};
const bases = [];
const fauxD1 = () => {
  const m = new Map(); bases.push(m);
  return { prepare(sql) {
    const o = { args: [], bind(...a) { o.args = a; return o; },
      async first() { sousReq++; const r = m.get(o.args[0]); return r ? { valeur: r.valeur, expire: r.expire } : null; },
      async all() { sousReq++; const re = new RegExp('^' + o.args[0].replace(/%/g, '.*') + '$'); return { results: [...m.entries()].filter(([k, r]) => re.test(k) && r.expire > o.args[1]).map(([k, r]) => ({ cle: k, valeur: r.valeur })) }; },
      async run() { sousReq++; if (/INSERT OR REPLACE INTO cache/.test(sql)) m.set(o.args[0], { valeur: o.args[1], expire: o.args[2] }); return {}; } };
    return o;
  }, async batch() { sousReq++; return []; } };
};
const ENV = { DB: fauxD1() }, ctx = { waitUntil: p => p && p.catch && p.catch(() => {}) }, cors = {};
const rep0 = await P.routePlanete(new URL('http://x/actualites/planete'), ENV, ctx, cors);
v('avant le premier cycle : 503 « en préparation » avec Retry-After, jamais de faux titres', rep0.status === 503 && /en préparation/.test((await rep0.json()).error) && rep0.headers.get('Retry-After') === '300');

// un cycle d'une heure complet : une exécution par minute
const base = Math.floor(Date.now() / 3600000) * 3600000, mesures = [];
for (let k = 0; k < F.CYCLE; k++) { sousReq = 0; const t0 = performance.now(); const r = await F.cronActus(ENV, ctx, base + k * 60000); mesures.push({ k, sr: sousReq, ms: performance.now() - t0, r, a: prog[k] }); }
const dig = mesures.filter(m => m.a && m.a.type === 'digest'), asm = mesures.find(m => m.a && m.a.type === 'assembler-digest');
const maxSr = Math.max(...mesures.map(m => m.sr)), maxMs = Math.max(...mesures.map(m => m.ms));
const msLots = Math.max(...dig.map(m => m.ms)), msFr = Math.max(...mesures.filter(m => m.a && m.a.type === 'lot' && m.a.portee === 'france').map(m => m.ms));
console.log(`   mesures : appels sortants max par exécution = ${maxSr} (limite 50) · lot digest : ${Math.max(...dig.map(m => m.sr))} appels, ${msLots.toFixed(2)} ms · lot France : ${msFr.toFixed(2)} ms · assemblage digest : ${asm.sr} appels, ${asm.ms.toFixed(2)} ms · exécution la plus longue : ${maxMs.toFixed(2)} ms`);
v('plan gratuit : au plus 30 appels sortants par exécution, toutes tâches confondues (limite : 50)', maxSr <= 30, `max ${maxSr}`);
v('plan gratuit : un lot du digest fait au plus 15 appels sortants même avec des pannes (limite : 50)', Math.max(...dig.map(m => m.sr)) <= 15, String(Math.max(...dig.map(m => m.sr))));
v('plan gratuit : l’assemblage du digest fait au plus 6 appels (une lecture des lots, une écriture, le cache)', asm.sr <= 6, String(asm.sr));
v('plan gratuit : le calcul d’un lot du digest ne dépasse pas celui d’un lot France (ordre de grandeur du CPU)', msLots <= Math.max(msFr * 2, 3), `${msLots.toFixed(2)} ms contre ${msFr.toFixed(2)} ms`);
v('digest : tous les lots lus, assemblage réussi', dig.every(m => m.r && m.r.ok) && asm.r && asm.r.ok && asm.r.lots === lots.length, JSON.stringify(asm.r));
const sr0 = sousReq; const rep = await P.routePlanete(new URL('http://x/actualites/planete'), ENV, ctx, cors), d = await rep.json();
v('route /actualites/planete : servie sans aucun appel sortant (digest prêt en mémoire)', rep.status === 200 && sousReq === sr0 && d.nbPays > 0, `${sousReq - sr0} appels`);
v('digest : un pays par entrée, 3 titres au plus, média et langue indiqués, titre dans sa langue d’origine', d.pays.FR && d.pays.FR.t.length === 3 && d.pays.FR.s && d.pays.FR.l === 'fr' && /Titre 1 de/.test(d.pays.FR.t[0].t) && d.pays.BR.l === 'pt', JSON.stringify(d.pays.BR));
v('digest : miniature fournie par le flux (adresse https), lien vers l’article', d.pays.FR.t.every(x => /^https:\/\/img\./.test(x.i) && /^https:\/\//.test(x.u)));
v('digest : jamais de résumé ni de texte d’article (titres, liens, dates, miniatures seulement)', !/Résumé long/.test(JSON.stringify(d)) && Object.keys(d.pays.FR.t[0]).every(k => ['t', 'u', 'd', 'i'].includes(k)));
v('digest : tout le registre y est (hors pannes totales), ≥ 60 pays', d.nbPays >= codes.length - PANNE_TOTALE.size && d.nbPays >= 60, `${d.nbPays} / ${codes.length}`);
v('panne du média principal : le deuxième média prend le relais (source indiquée)', d.pays.JP && d.pays.JP.s === R.PAYS.JP.flux[1].n && d.pays.KE.s === R.PAYS.KE.flux[1].n, JSON.stringify([d.pays.JP && d.pays.JP.s, R.PAYS.JP.flux[1].n]));
v('panne de tous les médias d’un pays : « indisponible » avec la raison, aucun faux titre', !d.pays.ZW && /HTTP 503/.test(d.indisponibles.ZW || '') && !JSON.stringify(d).includes('Zimbabwe'), JSON.stringify(d.indisponibles));
v('continents : les médias régionaux sont dans le digest', Object.keys(R.REGIONS).filter(r => R.REGIONS[r].flux.length).every(r => d.regions[r] && d.regions[r].items.length >= 3), Object.keys(d.regions).join());
v('digest : date de génération, pas marqué périmé', /^\d{4}-\d\d-\d\dT/.test(d.genere) && !d.perime && d.pasEncoreLus.length === 0, JSON.stringify(d.pasEncoreLus));

// ── continents ──
const rA = await W.fetch(new Request('https://x/actualites/region?id=afrique&n=30', { headers: { 'X-Rayle-Token': 'essai' } }), { DB: ENV.DB, RAYLE_TOKEN: 'essai', ORIGINE: '' }, ctx);
const a = await rA.json();
v('route /actualites/region?id=afrique : titres de plusieurs pays africains + médias régionaux, mélangés', rA.status === 200 && a.titres.length === 30 && new Set(a.titres.map(t => t.pays && t.pays.code).filter(Boolean)).size >= 8 && a.titres.every(t => R.PAYS[t.pays && t.pays.code] ? R.PAYS[t.pays.code].continent === 'afrique' : t.pays === null), JSON.stringify([a.titres.length, new Set(a.titres.map(t => t.pays && t.pays.code)).size]));
v('région : un seul pays ne remplit pas la liste (jamais plus de 3 titres du même pays)', Object.values(a.titres.reduce((m, t) => { const c = t.pays ? t.pays.code : 'REG'; m[c] = (m[c] || 0) + 1; return m; }, {})).every(n => n <= 3));
v('région : chaque titre garde sa langue, son média, son lien et sa date', a.titres.every(t => t.langue && t.source && /^https:\/\//.test(t.url) && t.titre));
v('région : les pays sans données sont dits (pas de faux titres pour eux)', Array.isArray(a.sansDonnees) && a.sansDonnees.includes('ZW'));
const rI = await P.routeRegion(new URL('http://x/actualites/region?id=atlantide'), ENV, ctx, cors);
v('région inconnue : 400 avec la liste des continents', rI.status === 400 && /afrique/.test((await rI.json()).error));
const t = P.titresDuContinent(d, 'oceanie', 12);
v('titresDuContinent (pur) : océanie', t.titres.length > 0 && t.titres.every(x => !x.pays || R.PAYS[x.pays.code].continent === 'oceanie'));
for (const id of Object.keys(R.CONTINENTS)) { const x = P.titresDuContinent(d, id, 10); v('continent « ' + id + ' » : des titres', x && x.titres.length >= 3, id + ' ' + (x && x.titres.length)); }
CACHE.MEM.clear(); stock.clear();
const sr1 = sousReq; const rFroid = await P.routePlanete(new URL('http://x/actualites/planete'), ENV, ctx, cors);
v('route à froid (mémoire vide) : au plus 3 appels (bord Cloudflare puis D1)', rFroid.status === 200 && sousReq - sr1 <= 3, String(sousReq - sr1));

// ── les routes existantes continuent de marcher ──
CACHE.MEM.clear(); stock.clear();
const rf = await W.fetch(new Request('https://x/actualites?liste=1', { headers: { 'X-Rayle-Token': 'essai' } }), { DB: ENV.DB, RAYLE_TOKEN: 'essai', ORIGINE: '' }, ctx), liste = (await rf.json()).pays;
v('/actualites?liste=1 : continent, langues et nombre de flux pour chaque pays', liste.length >= 60 && liste.every(p => p.code && p.nom && p.continent && Array.isArray(p.langues) && p.flux >= 1) && liste.some(p => p.code === 'JP' && p.langues.includes('ja')));
const rj = await W.fetch(new Request('https://x/actualites?pays=JP&n=10', { headers: { 'X-Rayle-Token': 'essai' } }), { DB: ENV.DB, RAYLE_TOKEN: 'essai', ORIGINE: '' }, ctx), j = await rj.json();
v('/actualites?pays=JP : titres avec média, langue, lien, date et miniature ; le média en panne est signalé', rj.status === 200 && j.titres.length >= 6 && j.titres.every(x => x.source && x.langue && /^https:/.test(x.url)) && j.titres.some(x => x.image) && j.sources.some(s => s.ok === false), JSON.stringify(j.sources));
v('pays absent du registre : 404 ou erreur claire, rien d’inventé', (await (await W.fetch(new Request('https://x/actualites?pays=ZZ', { headers: { 'X-Rayle-Token': 'essai' } }), { DB: ENV.DB, RAYLE_TOKEN: 'essai', ORIGINE: '' }, ctx)).json()).error !== undefined);

console.log(ko ? ko + ' ÉCHEC(S), ' + ok + ' réussis' : 'planete-worker : ' + ok + ' vérifications réussies');
process.exit(ko ? 1 : 0);
