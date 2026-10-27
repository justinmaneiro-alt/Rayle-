// Tests du fil d'actualités par sujets (Worker, fichiers locaux ignorés par git) avec de FAUSSES sources : lieux, regroupement, importance, catégories,
// localisation estimée, pannes, outils de l'IA (afficher_terre, aller_a, afficher_actualites, expliquer_actualite, meteo).
// Lancer :  node galaxie/tests/terre-fil-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('terre/fil.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const stock = new Map();
globalThis.caches = { default: { match: async k => stock.get(String(k.url || k)) || null, put: async (k, r) => { stock.set(String(k.url || k), new Response(await r.clone().text())); } } };

const P = await import(new URL('terre/planete.js', racine).href), G = await import(new URL('terre/gazetteer.js', racine).href), S = await import(new URL('terre/sujets.js', racine).href), F = await import(new URL('terre/fil.js', racine).href), R = await import(new URL('terre/rss.js', racine).href);

/* ───── lieux cités ───── */
const nom = t => (G.meilleurLieu(t) || {}).nom;
v('lieu : ville de France', nom('Mobilisation du 17 octobre : à Bordeaux, quelques points de blocage') === 'Bordeaux');
v('lieu : tout en majuscules', nom('EN DIRECT. Manifestation à MARSEILLE') === 'Marseille');
v('lieu : minuscules ignorées (« pau », « lens » ne sont pas des villes)', G.meilleurLieu('on a pau et lens en minuscules') === null);
v('lieu : la ville avant le pays', nom('Séisme au Japon : Tokyo touchée') === 'Tokyo');
v('lieu : pays seul', nom('Le Japon annonce un plan') === 'Japon' && G.meilleurLieu('Le Japon annonce un plan').type === 'pays');
v('lieu : anglais', nom('Trump meets Zelensky in Washington') === 'Washington' && nom('Floods hit Brazil') === 'Brésil');
v('lieu : région', G.meilleurLieu('Alerte orange en Occitanie').type === 'région');
v('lieu : aucun lieu → null', G.meilleurLieu('Le gouvernement annonce une réforme') === null);

/* ───── regroupement, importance, catégories ───── */
const it = (titre, source, extra = {}) => ({ titre, url: 'https://' + source.toLowerCase().replace(/\W/g, '') + '.fr/' + encodeURIComponent(titre).slice(0, 40), source, date: new Date(Date.now() - (extra.min || 20) * 60000).toISOString(), langue: 'fr', prio: 0, ...extra });
const items = [
  it('Séisme de magnitude 6 au Japon : Tokyo secouée, plusieurs blessés', 'Le Monde', { prio: 2 }),
  it('Un puissant séisme frappe le Japon, la région de Tokyo touchée', 'franceinfo', { prio: 2 }),
  it('Japon : séisme de magnitude 6 près de Tokyo, le bilan provisoire fait état de blessés', 'BFM TV', { prio: 2 }),
  it('Ligue 1 : le PSG s’impose à Marseille sur le score de 3 à 1', 'L’Équipe', { prio: 2 }),
  it('La Dépêche : le tribunal de Toulouse condamne un homme pour cambriolage', 'La Dépêche', { region: 'occitanie', prio: 1 }),
  it('Un incendie ravage un entrepôt', 'Sud Ouest', { region: 'nouvelle-aquitaine', prio: 1 }),
  it('Réforme des retraites : le gouvernement présente son projet de loi', 'Le Figaro', { prio: 2 }),
  it('Grève des transports : trains annulés', 'Le Monde', { prio: 2, pays: 'FR' })
];
const sj = S.construireSujets(items);
const seisme = sj.find(s => /séisme/i.test(s.titre));
v('regroupement : trois médias, un seul sujet', seisme && seisme.importance === 3 && seisme.sources.length === 3, JSON.stringify(sj.map(s => s.importance + ':' + s.titre.slice(0, 30))));
v('importance : le sujet couvert par plusieurs médias passe en premier', sj[0] === seisme);
v('regroupement : les sujets sans rapport restent séparés', sj.length === 6, String(sj.length));
v('catégorie : environnement (séisme)', seisme.categorie === 'environnement');
v('catégorie : sport, justice, politique', sj.find(s => /PSG/.test(s.titre)).categorie === 'sport' && sj.find(s => /tribunal/.test(s.titre)).categorie === 'justice' && sj.find(s => /retraites/.test(s.titre)).categorie === 'politique');
v('lieu : Tokyo d’après le titre, marqué « estimé »', seisme.lieu && seisme.lieu.nom === 'Tokyo' && seisme.lieu.estime === true && seisme.lieu.origine === 'texte', JSON.stringify(seisme.lieu));
const inc = sj.find(s => /incendie/.test(s.titre));
v('lieu : sans lieu dans le titre → région du média, estimée', inc.lieu && inc.lieu.type === 'région' && inc.lieu.origine === 'region_media' && inc.lieu.estime === true, JSON.stringify(inc.lieu));
v('lieu : coordonnées données par le flux → non estimées', S.construireSujets([it('Un événement quelque part', 'Flux géo', { geo: { lat: 10, lon: 20 } })])[0].lieu.estime === false);
v('lieu : aucun lieu, aucun pays → pas de balise (null)', S.construireSujets([it('Une réforme annoncée', 'Média sans pays')])[0].lieu === null);
const nat = S.construireSujets([it('Manifestation à Lyon contre la réforme des retraites', 'A'), it('Manifestation à Bordeaux contre la réforme des retraites', 'B'), it('Manifestation à Lille contre la réforme des retraites', 'C'), it('Manifestation à Nantes contre la réforme des retraites', 'D')].map(x => ({ ...x, pays: 'FR' })));
v('lieu : des villes différentes d’un même pays → le pays entier', nat.length === 1 && nat[0].lieu.type === 'pays' && nat[0].lieu.nom === 'France', JSON.stringify(nat.map(s => s.lieu)));
v('le résumé du flux n’est jamais dans les sources affichées', !JSON.stringify(S.construireSujets([{ ...it('Titre assez long pour passer', 'X'), resume: 'RESUME_SECRET' }]).map(s => s.sources)).includes('RESUME_SECRET'));
v('filtre par sujet : « football » garde le sport', S.filtrerSujets(sj, 'football').some(s => s.categorie === 'sport') && !S.filtrerSujets(sj, 'football').some(s => /séisme/.test(s.titre)));
v('filtre par lieu : « Japon »', S.filtrerSujets(sj, 'Japon').length >= 1 && S.filtrerSujets(sj, 'Japon')[0] === seisme);

v('titres non latins : identifiants distincts (pas de collision) et jugés illisibles à voix haute', (() => { const x = S.construireSujets([it('日本で地震が発生しました東京', 'NHK'), it('台風が接近しています九州', 'Asahi')]); return x.length === 2 && x[0].id !== x[1].id && !S.estLisible(x[0].titre) && S.estLisible('Séisme au Japon'); })());
v('sujets d’un pays : lieu dans le pays ou nom (anglais) dans le titre', S.sujetsDuPays(sj, 'JP', G.nomsDuPays('JP')).length === 1 && S.sujetsDuPays(sj, 'JP', G.nomsDuPays('JP'))[0] === seisme);

/* ───── faux flux, pannes, cache ───── */
const xml = lst => '<?xml version="1.0"?><rss><channel>' + lst.map(i => `<item><title>${i.titre}</title><link>${i.url}</link><pubDate>${new Date(i.date).toUTCString()}</pubDate><description>Extrait de ${i.source} pour ${i.titre}</description></item>`).join('') + '</channel></rss>';
let appels = 0;
const hotes = { 'lemonde.fr': items.slice(0, 1), 'francetvinfo.fr': items.slice(1, 2), 'bfmtv.com': items.slice(2, 3) };
globalThis.fetch = async (u, o) => {
  appels++; const url = String(u);
  if (/geocoding-api/.test(url)) { const q = decodeURIComponent(url.match(/name=([^&]*)/)[1]); return q === 'Nullepart' ? new Response(JSON.stringify({}), { status: 200 }) : new Response(JSON.stringify({ results: [{ name: q, country: 'France', admin1: 'Gironde', latitude: 44.84, longitude: -0.58, population: 250000, feature_code: 'PPLA' }] }), { status: 200 }); }
  if (/open-meteo/.test(url)) return new Response(JSON.stringify({ latitude: 44.84, longitude: -0.58, elevation: 12, timezone: 'Europe/Paris', current: { time: '2026-10-17T10:00', temperature_2m: 17.4, apparent_temperature: 16, relative_humidity_2m: 70, precipitation: 0, weather_code: 3, cloud_cover: 90, pressure_msl: 1012, wind_speed_10m: 14, wind_direction_10m: 200, wind_gusts_10m: 30, is_day: 1 }, hourly: { time: ['2026-10-17T10:00'], temperature_2m: [17], precipitation: [0], precipitation_probability: [10], weather_code: [3], cloud_cover: [90], wind_speed_10m: [14] }, daily: { time: ['2026-10-17'], weather_code: [3], temperature_2m_min: [11], temperature_2m_max: [19], precipitation_sum: [0.4], precipitation_probability_max: [30], wind_speed_10m_max: [25], sunrise: ['2026-10-17T08:00'], sunset: ['2026-10-17T19:00'] } }), { status: 200 });
  if (/gdeltproject/.test(url)) return new Response('Please limit requests to one every 5 seconds', { status: 200 });
  const h = Object.keys(hotes).find(k => url.includes(k));
  if (/ladepeche/.test(url)) return new Response('erreur', { status: 503 });
  if (h) return new Response(xml([...hotes[h], it('Billet ' + h.replace(/W/g, ''), h)]), { status: 200 });
  { const h2 = new URL(url).hostname; return new Response(xml([it('Billet ' + h2.replace(/W/g, ''), h2), it('Reportage ' + h2.replace(/W/g, '') + ' en cours', h2)]), { status: 200 }); }
};
/* ───── plan gratuit Cloudflare : lots de flux, une exécution par minute, assemblage ───── */
const CACHE = await import(new URL('infra/cache.js', racine).href);
const ctx = { waitUntil: p => p && p.catch && p.catch(() => {}) }, cors = {};
// faux D1 en mémoire (les seules requêtes utilisées par le cache) ; chaque appel compte comme un appel sortant, comme chez Cloudflare
let sousReq = 0;
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
const cachesAvant = globalThis.caches.default, comptes = { m: cachesAvant.match, p: cachesAvant.put };
globalThis.caches.default = { match: async k => { sousReq++; return comptes.m(k); }, put: async (k, r) => { sousReq++; return comptes.p(k, r); } };
const fetchCompte = globalThis.fetch; globalThis.fetch = async (u, o) => { sousReq++; return fetchCompte(u, o); };
const D1 = fauxD1(), ENV = { DB: D1 };

const prog = F.programme();
const noms = lots => lots.flat().map(x => x.n);
v('programme : 60 minutes ; France à chaque quart d’heure (7 lots + assemblage) ; Monde une fois (5 lots + assemblage) ; digest de la planète (lots + assemblage)', prog.length === F.CYCLE && F.CYCLE === 60 && prog.filter(a => a && a.type === 'lot' && a.portee === 'france').length === 28 && prog.filter(a => a && a.type === 'assembler' && a.portee === 'france').length === 4 && prog.filter(a => a && a.type === 'lot' && a.portee === 'monde').length === 5 && prog.filter(a => a && a.type === 'assembler' && a.portee === 'monde').length === 1 && prog.filter(a => a && a.type === 'digest').length === P.lotsDigest().length && prog.filter(a => a && a.type === 'assembler-digest').length === 1);
v('programme : la France est la plus fréquente (toutes les 15 min), le Monde et la planète une fois par heure', [0, 15, 30, 45].every(m => prog[m] && prog[m].portee === 'france' && prog[m].i === 0) && prog.filter(a => a && a.portee === 'monde' && a.type === 'lot').length === 5);
v('programme : jamais deux actions dans la même minute, et il reste au moins une minute libre', prog.length === 60 && prog.filter(a => !a).length >= 1);
v('lots : aucun lot ne dépasse 5 flux, tous les flux sont lus une fois par cycle', F.lotsDe('france').every(l => l.length <= 5) && F.lotsDe('monde').every(l => l.length <= 5) && noms(F.lotsDe('france')).length === F.FLUX_FRANCE.length && new Set(noms(F.lotsDe('monde'))).size === F.FLUX_MONDE.length, `${F.FLUX_FRANCE.length} + ${F.FLUX_MONDE.length} flux`);
v('déclencheurs : les deux déclencheurs « actualités » sont distincts de celui d’origine', F.CRONS_ACTUS.length === 2 && !F.CRONS_ACTUS.includes('* * * * *'));
const avantCycle = await F.routeFil(new URL('http://x/actualites/fil?portee=france'), ENV, ctx, cors);
v('avant le premier cycle : 503 « en préparation » avec Retry-After, jamais de faux sujets', avantCycle.status === 503 && /en préparation/.test((await avantCycle.json()).error) && avantCycle.headers.get('Retry-After') === '120');
// un cycle complet, une exécution par minute
const base = Math.floor(Date.now() / (60 * 60000)) * 60 * 60000;
const mesures = [];
for (let k = 0; k < F.CYCLE; k++) { sousReq = 0; const t0 = performance.now(); const r = await F.cronActus(ENV, ctx, base + k * 60000); mesures.push({ k, sr: sousReq, ms: performance.now() - t0, r }); }
if (process.env.DETAIL) console.log('exécutions (minute du cycle : appels sortants, ms) :', mesures.map(m => m.k + ':' + m.sr + '/' + m.ms.toFixed(1)).join('  '));
const maxSr = Math.max(...mesures.map(m => m.sr)), maxMs = Math.max(...mesures.map(m => m.ms));
v('plan gratuit : au plus 20 appels sortants (fetch + D1 + cache) par exécution (limite : 50)', maxSr <= 20, `max ${maxSr} : ${mesures.map(m => m.sr).join(' ')}`);
v('plan gratuit : chaque exécution reste courte (ordre de grandeur du calcul, limite : 10 ms de CPU)', maxMs < 40, `max ${maxMs.toFixed(1)} ms : ${mesures.map(m => m.ms.toFixed(0)).join(' ')}`);
v('cycle d’une heure : 33 lots France/Monde lus, 5 assemblages, digest de la planète construit, des minutes libres', mesures.filter(m => m.r && m.r.ok && m.r.items).length === 33 && mesures.filter(m => m.r && m.r.ok && m.r.sujets).length === 5 && mesures.filter(m => m.r && m.r.ok && m.r.pays !== undefined).length === P.lotsDigest().length + 1, JSON.stringify(mesures.map(m => m.r && (m.r.items || m.r.sujets || m.r.pays || m.r.erreur))));
const rep = await F.routeFil(new URL('http://x/actualites/fil?portee=france'), ENV, ctx, cors);
const fr = await rep.json();
v('fil France : sujets construits, séisme à 3 médias en tête', rep.status === 200 && fr.sujets[0].importance >= 3 && /séisme|Séisme|Japon/.test(fr.sujets[0].titre), fr.sujets[0] && fr.sujets[0].titre);
v('fil France : le média en panne est signalé « indisponible » sans gêner les autres', fr.sources.indisponibles.some(x => x.nom === 'La Dépêche') && fr.sources.ok.length > 10, JSON.stringify(fr.sources.indisponibles.map(x => x.nom)));
v('fil France : date de mise à jour, pas marqué périmé', /^\d{4}-\d\d-\d\dT/.test(fr.genere) && !fr.perime);
v('fil France : les extraits ne servent qu’à l’IA (présents dans le sujet, pas dans les sources)', !JSON.stringify(fr.sujets.map(s => s.sources)).includes('Extrait de'));
v('fil France : les champs de préparation (mots, lieu) ne sortent pas de la base', !/"tk"|"pr":|"li":/.test(JSON.stringify(fr)));
const rm = await F.routeFil(new URL('http://x/actualites/fil?portee=monde'), ENV, ctx, cors), mo = await rm.json();
v('fil Monde : GDELT en panne signalé, le reste continue', mo.sources.gdelt && mo.sources.gdelt.ok === false && mo.sujets.length > 0);
const n0 = appels, sr0 = sousReq; const rep2 = await F.routeFil(new URL('http://x/actualites/fil?portee=france'), ENV, ctx, cors);
v('route : deuxième demande servie sans aucun appel sortant (cache de mémoire)', appels === n0 && sousReq === sr0 && rep2.status === 200, `${sousReq - sr0} appels`);
CACHE.MEM.clear();
const sr1 = sousReq; const rep3 = await F.routeFil(new URL('http://x/actualites/fil?portee=france'), ENV, ctx, cors);
v('route : à froid (mémoire vide) : au plus 3 appels sortants (bord Cloudflare puis D1)', rep3.status === 200 && sousReq - sr1 <= 3, `${sousReq - sr1} appels`);
// pannes : un lot entièrement en panne ne détruit pas l'ancien
const avant = [...bases[0].entries()].find(([k]) => k === 'fil:lot:france:0')[1].valeur;
const sauve = globalThis.fetch; globalThis.fetch = async () => new Response('x', { status: 500 });
const rPanne = await F.cronActus(ENV, ctx, base + 0 * 60000 + 15 * 60000);
globalThis.fetch = sauve;
v('lot entièrement en panne : signalé, l’ancienne copie est conservée', rPanne.ok === false && /en panne/.test(rPanne.erreur) && bases[0].get('fil:lot:france:0').valeur === avant);
// copie ancienne : les lots d'il y a 2 h → « perime »
const D1b = fauxD1(), ENVb = { DB: D1b }; CACHE.MEM.clear();
for (let k = 0; k < F.CYCLE; k++) await F.cronActus(ENVb, ctx, base - 2 * 3600000 + k * 60000);
CACHE.MEM.clear(); stock.clear();
const vieux = await (await F.routeFil(new URL('http://x/actualites/fil?portee=france'), ENVb, ctx, cors)).json();
v('copie ancienne (lots de plus de 40 minutes) : marquée « perime » pour que la page le dise', vieux.perime === true && vieux.sujets.length > 0);
CACHE.MEM.clear(); stock.clear();
let refus = null; try { await F.construirePays('ZZ'); } catch (e) { refus = e.message; }
v('pays inconnu : erreur claire', /sans flux/.test(refus || ''), refus);
const rp = await F.routeFil(new URL('http://x/actualites/fil?portee=pays&pays=JP'), ENV, ctx, cors), pj = await rp.json();
v('pays : calculé à la demande (6 flux au plus), sujets présents', rp.status === 200 && pj.pays === 'JP' && pj.sujets.length > 0, JSON.stringify(pj).slice(0, 120));
v('route : portée invalide → 400, pays sans code → 400', (await F.routeFil(new URL('http://x/actualites/fil?portee=lune'), ENV, ctx, cors)).status === 400 && (await F.routeFil(new URL('http://x/actualites/fil?portee=pays'), ENV, ctx, cors)).status === 400);

v('régions : « Sud-Ouest » = Nouvelle-Aquitaine + Occitanie', F.regionDemandee('le Sud-Ouest').regions.length === 2 && F.regionDemandee('en Bretagne').id === 'bretagne' && F.regionDemandee('Paris') === null);

// le point d'entrée du Worker aiguille bien les déclencheurs : « actualités » → un lot ; déclencheur d'origine → tâches d'origine (sans toucher aux lots)
const W = (await import(new URL('infra/index.js', racine).href)).default;
const D1c = fauxD1(), ENVc = { DB: D1c }, promesses = [], ctxc = { waitUntil: p => promesses.push(p) };
for (const cron of F.CRONS_ACTUS) { const t = base + (F.CRONS_ACTUS.indexOf(cron) === 0 ? 0 : 60000); await W.scheduled({ cron, scheduledTime: t }, ENVc, ctxc); }
await Promise.all(promesses);
v('déclencheurs « actualités » : chacun lit un lot (2 lots rangés)', [...bases[bases.length - 1].keys()].filter(k => k.startsWith('fil:lot:')).length === 2, [...bases[bases.length - 1].keys()].join(','));
const avantOrigine = bases[bases.length - 1].size; promesses.length = 0;
await W.scheduled({ cron: '* * * * *', scheduledTime: base + 2 * 60000 }, ENVc, ctxc); await Promise.all(promesses);
v('déclencheur d’origine : aucune lecture de lot d’actualités', [...bases[bases.length - 1].keys()].filter(k => k.startsWith('fil:lot:')).length === 2 && avantOrigine >= 2);
const toml = fs.readFileSync(new URL('../wrangler.toml', racine), 'utf8');
v('wrangler.toml : les 3 déclencheurs (origine + deux « actualités ») + le 4e de l’agent V3 (surveillance), et rien d’autre', F.CRONS_ACTUS.every(c => toml.includes('"' + c + '"')) && toml.includes('"* * * * *"') && toml.split('\n').find(l => l.startsWith('crons')).split('", "').length === 4 && toml.includes('"1-14,16-29,31-44,46-59 * * * *"'));

/* ───── outils de l'IA ───── */
const O = (await import(new URL('intelligence/outils/index.js', racine).href)).OUTILS;
v('outils déclarés', ['afficher_terre', 'aller_a', 'afficher_actualites', 'expliquer_actualite', 'meteo'].every(n => O.has(n)));
const lancer = async (nomOutil, args) => { const s = { actions: [], canal: '' }; let texte, erreur = null; try { texte = await O.get(nomOutil).executer(ENV, ctx, args, s); } catch (e) { erreur = e.message; } return { s, texte, erreur }; };
let r = await lancer('afficher_terre', {});
v('afficher_terre : action « terre/afficher »', r.s.actions[0] && r.s.actions[0].type === 'terre' && r.s.actions[0].op === 'afficher' && /ACTION EFFECTUÉE/.test(r.texte));
r = await lancer('aller_a', { lieu: 'Toulouse' });
v('aller_a : coordonnées trouvées, action avec lieu', r.s.actions[0].op === 'aller' && r.s.actions[0].lieu.lat === 44.84 && /ACTION EFFECTUÉE/.test(r.texte), r.texte);
r = await lancer('aller_a', { lieu: 'Nullepart' });
v('aller_a : lieu introuvable → erreur honnête, aucune action', /introuvable/.test(r.erreur || '') && r.s.actions.length === 0);
r = await lancer('afficher_actualites', { portee: 'france' });
const act = r.s.actions[0];
v('afficher_actualites france : action avec vue sur la France, sujets et données', act && act.op === 'actualites' && act.portee === 'france' && act.vue.nom === 'France' && act.sujets.length >= 3 && act.donnees.length === act.sujets.length, JSON.stringify(act && act.vue));
v('afficher_actualites : texte numéroté [1].. avec consigne anti-invention', /\[1\]/.test(r.texte) && /\[2\]/.test(r.texte) && /N’invente aucun fait/.test(r.texte) && /d’après/.test(r.texte));
v('afficher_actualites : localisation estimée signalée à l’IA', /localisation estimée/.test(r.texte));
v('afficher_actualites : le média en panne est cité', /La Dépêche/.test(r.texte) && /indisponibles/.test(r.texte));
r = await lancer('afficher_actualites', { portee: 'france', region: 'Sud-Ouest' });
v('afficher_actualites Sud-Ouest : vue sur le Sud-Ouest', r.s.actions[0].region && r.s.actions[0].region.id === 'sud-ouest' && r.s.actions[0].vue.nom === 'Sud-Ouest', JSON.stringify(r.s.actions[0] && r.s.actions[0].vue));
r = await lancer('afficher_actualites', { portee: 'france', sujet: 'astronomie des licornes' });
v('afficher_actualites : aucun sujet ne correspond → dit honnêtement, liste vide', r.s.actions[0].sujets.length === 0 && /AUCUN sujet/.test(r.texte));
r = await lancer('afficher_actualites', { portee: 'monde' });
v('afficher_actualites monde : vue sur le monde', r.s.actions[0].portee === 'monde' && r.s.actions[0].vue.nom === 'le monde');
r = await lancer('afficher_actualites', { portee: 'pays', pays: 'Japon' });
v('afficher_actualites pays : Japon reconnu, vue sur le pays', r.s.actions[0] && r.s.actions[0].pays === 'JP' && r.s.actions[0].vue.nom === 'Japon', r.erreur || JSON.stringify(r.s.actions[0] && r.s.actions[0].vue));
r = await lancer('afficher_actualites', { portee: 'pays', pays: 'Atlantide' });
v('afficher_actualites pays inconnu : erreur claire, aucune action', /ne reconnais pas/.test(r.erreur || '') && r.s.actions.length === 0);
r = await lancer('expliquer_actualite', { element: 'séisme Japon' });
v('expliquer_actualite : trouve le séisme, action « eclairer », tous les titres', r.s.actions[0] && r.s.actions[0].op === 'eclairer' && /Tous les titres/.test(r.texte) && /Le Monde/.test(r.texte), r.texte && r.texte.slice(0, 120));
r = await lancer('expliquer_actualite', { element: 'zzzz inconnu' });
v('expliquer_actualite : sujet inconnu → AUCUN sujet, pas d’action', /AUCUN sujet/.test(r.texte) && r.s.actions.length === 0);
r = await lancer('meteo', { lieu: 'Biarritz' });
v('meteo : valeurs réelles, action « meteo »', r.s.actions[0] && r.s.actions[0].op === 'meteo' && /17°/.test(r.texte) && /couvert/.test(r.texte) && /MÉTÉO RÉELLE/.test(r.texte), r.texte);
const A = await import(new URL('intelligence/agent.js', racine).href);
for (const phrase of ['montre-moi l\'actualité en France', 'qu\'est-ce qui se passe au Japon ?', 'dis-moi l\'actualité mondiale', 'quel temps à Biarritz ?', 'montre-moi la Terre']) {
  const menu = A.choisirOutils(phrase.normalize('NFD').replace(/[̀-ͯ]/g, ''), []);
  v('menu de l’IA pour « ' + phrase + ' » contient les outils de la Terre', ['afficher_terre', 'aller_a', 'afficher_actualites', 'expliquer_actualite', 'meteo'].every(n => menu.includes(n)));
}
console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
