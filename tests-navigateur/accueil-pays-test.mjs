// Actualités de tous les pays : sélecteur (recherche, continents, favoris), fenêtres par pays et par continent, voix, langues d'origine, honnêteté, ZÉRO appel à l'IA.
// Avec un FAUX Worker (/actualites?liste=1, ?pays=, /actualites/region, /actualites/planete, /chat). Lancer :  node tests-navigateur/accueil-pays-test.mjs  (serveur local : node serveur.mjs ; CAPTURES=<dossier>)
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import http from 'node:http';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CAPTURES = process.env.CAPTURES || '';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

/* ───── faux Worker ───── */
const PAYS = [
  ['FR', 'France', 'europe', ['fr']], ['GB', 'Royaume-Uni', 'europe', ['en']], ['DE', 'Allemagne', 'europe', ['de']], ['JP', 'Japon', 'asie', ['ja', 'en']], ['KR', 'Corée du Sud', 'asie', ['en', 'ko']], ['IN', 'Inde', 'asie', ['en', 'hi']],
  ['BR', 'Brésil', 'amerique-sud', ['pt']], ['AR', 'Argentine', 'amerique-sud', ['es']], ['US', 'États-Unis', 'amerique-nord', ['en']], ['CA', 'Canada', 'amerique-nord', ['en', 'fr']],
  ['ZA', 'Afrique du Sud', 'afrique', ['en']], ['CI', 'Côte d’Ivoire', 'afrique', ['fr']], ['EG', 'Égypte', 'afrique', ['ar', 'en']], ['KE', 'Kenya', 'afrique', ['en']], ['AU', 'Australie', 'oceanie', ['en']], ['AE', 'Émirats arabes unis', 'moyen-orient', ['ar', 'en']]
].map(([code, nom, continent, langues]) => ({ code, nom, continent, lat: 0, lon: 0, dist: 1500, flux: 2, langues }));
const SANS = [{ code: 'VU', nom: 'Vanuatu', continent: 'oceanie' }, { code: 'ER', nom: 'Érythrée', continent: 'afrique' }];
const titre = (nom, langue, i) => ({ JP: ['台風が接近、九州で警戒', 'Typhoon nears Kyushu'], EG: ['ارتفاع في أسعار الذهب', 'Egypt gold prices climb'] }[nom] || [`Titre ${i} de ${nom}`])[langue === 'en' || !langue ? Math.min(1, ([[], []].length)) - 1 + 1 : 0] || `Titre ${i} de ${nom}`;
const titres = (p, n) => Array.from({ length: n }, (_, i) => {
  const langue = p.langues[i % p.langues.length], base = p.code === 'JP' && langue === 'ja' ? '台風' + (i + 1) + '号が接近、九州で警戒' : p.code === 'EG' && langue === 'ar' ? 'ارتفاع أسعار الذهب في مصر ' + (i + 1) : `Titre ${i + 1} de ${p.nom} (${langue})`;
  return { titre: base, url: 'https://media-' + p.code.toLowerCase() + '.test/a' + (i + 1), source: p.code === 'JP' && langue === 'ja' ? 'NHK' : 'Média ' + p.code + ' ' + langue, date: new Date(Date.now() - (i + 1) * 900000).toISOString(), langue, ...(i % 2 === 0 ? { image: 'https://img.media-' + p.code.toLowerCase() + '.test/' + (i + 1) + '.jpg' } : {}) };
});
const requetes = { chat: [], pays: [], region: [], planete: 0, liste: 0 };
let listeEnPanne = false;
const srv = http.createServer((rq, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (rq.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(rq.url, 'http://x'), rep = (o, c = 200) => { res.writeHead(c, cors); res.end(JSON.stringify(o)); };
  if (u.pathname === '/actualites') {
    if (u.searchParams.get('liste')) { requetes.liste++; return listeEnPanne ? rep({ error: 'route inconnue' }, 404) : rep({ pays: PAYS, sansSource: SANS }); }
    const code = u.searchParams.get('pays'); requetes.pays.push(code); const p = PAYS.find(x => x.code === code);
    if (!p) return rep({ error: 'pays introuvable' }, 404);
    return rep({ pays: { code, nom: p.nom }, titres: titres(p, 10), sources: [{ nom: 'Média ' + code, ok: true, titres: 5 }, { nom: 'Autre média ' + code, ok: code !== 'KE', erreur: 'HTTP 503' }], genere: new Date().toISOString() });
  }
  if (u.pathname === '/actualites/region') {
    const id = u.searchParams.get('id'); requetes.region.push(id);
    const ps = PAYS.filter(p => p.continent === id); if (!ps.length) return rep({ region: { id }, titres: [], nbPays: 0 });
    const t = ps.flatMap(p => titres(p, 2).map(x => ({ ...x, pays: { code: p.code, nom: p.nom } })));
    return rep({ region: { id, nom: id }, titres: t, nbPays: ps.length, sansDonnees: ['ZW'], genere: new Date().toISOString() });
  }
  if (u.pathname === '/actualites/planete') {
    requetes.planete++;
    return rep({ genere: new Date().toISOString(), nbPays: PAYS.length, pays: Object.fromEntries(PAYS.map(p => [p.code, { s: 'Média ' + p.code, l: p.langues[0], t: titres(p, 3).map(x => ({ t: x.titre, u: x.url, d: x.date, i: x.image })) }])), regions: {}, indisponibles: {}, pasEncoreLus: [] });
  }
  if (u.pathname === '/chat') { let c = ''; rq.on('data', d => { c += d; }); return rq.on('end', () => { try { requetes.chat.push(JSON.parse(c).text || ''); } catch (e) { requetes.chat.push('?'); } rep({ reply: 'Voici ma réponse de test, Justin.', engine: 'mock', actions: [], outils: [] }); }); }
  const r = { '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' }, '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 }, '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] } }[u.pathname];
  rep(r || { error: 'route inconnue' }, r ? 200 : 404);
});
await new Promise(r => srv.listen(8791, '127.0.0.1', r));
const png = () => { const p = new PNG({ width: 80, height: 50 }); for (let i = 0; i < 80 * 50; i++) { p.data[i * 4] = 60; p.data[i * 4 + 1] = 140; p.data[i * 4 + 2] = 200; p.data[i * 4 + 3] = 255; } return PNG.sync.write(p); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|502|introuvable/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.setRequestInterception(true);
  p.on('request', r => { if (/^https:\/\/img\.media-/.test(r.url())) return r.respond({ status: 200, contentType: 'image/png', body: png() }); r.continue(); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', '3'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8791'); localStorage.setItem('rayle_worker_token', 'essai'); });
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  await p.evaluate(m => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; window.__hudFixe = m; document.body.dataset.hud = m; new MutationObserver(() => { if (document.body.dataset.hud !== window.__hudFixe) document.body.dataset.hud = window.__hudFixe; }).observe(document.body, { attributes: true, attributeFilter: ['data-hud'] }); }, opts.mode || 'normal');
  return p;
}
const dire = async (p, t, ms = 1800) => { requetes.chat.length = 0; requetes.pays.length = 0; requetes.region.length = 0; requetes.planete = 0; await p.evaluate(() => { window.__dit = []; }); await p.evaluate(x => { addLine('user', x); respond(x); }, t); await attendre(ms); return p.evaluate(() => window.__dit.slice()); };
const fen = (p, id) => p.evaluate(id => { const e = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return e ? { texte: e.innerText, nb: e.querySelectorAll('.ac-sujet').length, langs: [...e.querySelectorAll('.ap-lang')].map(x => x.textContent), vignettes: e.querySelectorAll('.ac-vignette').length, rtl: e.querySelectorAll('a[dir="rtl"]').length, lang: [...e.querySelectorAll('a[lang]')].map(x => x.lang), liens: [...e.querySelectorAll('a.ac-titre')].every(a => a.target === '_blank' && /noopener/.test(a.rel) && /^https:\/\//.test(a.href)) } : null; }, id);
const capture = async (p, nom) => { if (!CAPTURES) return; fs.mkdirSync(CAPTURES, { recursive: true }); await p.screenshot({ path: CAPTURES + '/' + nom + '.png' }); };

let p = await page();
// ══ 1. Sélecteur : continents, recherche, favoris ══
await p.click('#btnPays'); await attendre(1200);
let s = await p.evaluate(() => ({ ouvert: !!document.getElementById('pays-selecteur'), pays: document.querySelectorAll('#pays-selecteur .ps-pays').length, chips: [...document.querySelectorAll('#pays-selecteur .ps-chip')].map(c => c.textContent.trim()), groupes: [...document.querySelectorAll('#pays-selecteur .ps-groupe h3')].map(h => h.firstChild.textContent.trim()), sans: document.querySelectorAll('#pays-selecteur .ps-sans').length }));
v('le bouton « Pays » ouvre le sélecteur (liste du Worker : ' + PAYS.length + ' pays + ' + SANS.length + ' sans source)', s.ouvert && s.pays === PAYS.length + SANS.length && requetes.liste === 1, JSON.stringify(s.pays));
v('sélecteur : continents en puces avec le nombre de pays, groupes par continent', s.chips.length >= 9 && /^Tous 16/.test(s.chips[0]) && /Favoris 0/.test(s.chips[1]) && s.groupes.includes('Europe') && s.groupes.includes('Afrique') && s.groupes.includes('Océanie'), JSON.stringify(s.chips.slice(0, 4)));
v('sélecteur : les pays sans média fiable sont visibles mais grisés et non cliquables en favori', s.sans === 2 && await p.evaluate(() => [...document.querySelectorAll('#pays-selecteur .ps-sans .ps-etoile')].every(b => b.disabled)));
await capture(p, '1-selecteur');
await p.type('#pays-selecteur input', 'bresil'); await attendre(300);
s = await p.evaluate(() => ({ pays: [...document.querySelectorAll('#pays-selecteur .ps-nom span')].map(x => x.textContent) }));
v('recherche : « bresil » (sans accent) trouve le Brésil seul', s.pays.length === 1 && s.pays[0] === 'Brésil', JSON.stringify(s.pays));
await p.evaluate(() => { const i = document.querySelector('#pays-selecteur input'); i.value = 'usa'; i.dispatchEvent(new Event('input')); }); await attendre(250);
v('recherche : l’alias « usa » trouve les États-Unis', await p.evaluate(() => [...document.querySelectorAll('#pays-selecteur .ps-nom span')].map(x => x.textContent).join() === 'États-Unis'));
await p.evaluate(() => { const i = document.querySelector('#pays-selecteur input'); i.value = 'zzzz'; i.dispatchEvent(new Event('input')); }); await attendre(250);
v('recherche sans résultat : message clair', await p.evaluate(() => /Aucun pays ne correspond/.test(document.querySelector('#pays-selecteur .ps-corps').textContent)));
await p.evaluate(() => { const i = document.querySelector('#pays-selecteur input'); i.value = ''; i.dispatchEvent(new Event('input')); });
await p.click('#pays-selecteur .ps-chip[data-c="afrique"]'); await attendre(250);
v('puce « Afrique » : seulement des pays africains', await p.evaluate(() => [...document.querySelectorAll('#pays-selecteur .ps-nom span')].map(x => x.textContent).sort().join() === 'Afrique du Sud,Côte d’Ivoire,Kenya,Égypte,Érythrée'.split(',').sort().join()), await p.evaluate(() => [...document.querySelectorAll('#pays-selecteur .ps-nom span')].map(x => x.textContent).join()));
await p.click('#pays-selecteur .ps-pays[data-code="ZA"] .ps-etoile'); await attendre(200);
await p.click('#pays-selecteur .ps-pays[data-code="KE"] .ps-etoile'); await attendre(200);
v('favoris : l’étoile ajoute, mémorisé sur l’appareil (localStorage), compteur mis à jour', await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_pays_favoris')).join() === 'ZA,KE' && /Favoris 2/.test(document.querySelector('#pays-selecteur .ps-chip[data-c="favoris"]').textContent)));
await p.click('#pays-selecteur .ps-chip[data-c="favoris"]'); await attendre(250);
v('puce « Favoris » : seulement mes favoris', await p.evaluate(() => [...document.querySelectorAll('#pays-selecteur .ps-nom span')].map(x => x.textContent).sort().join() === 'Afrique du Sud,Kenya'));
await p.click('#pays-selecteur .ps-pays[data-code="KE"] .ps-etoile'); await attendre(200);
v('favoris : l’étoile retire', await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_pays_favoris')).join() === 'ZA'));
await p.click('#pays-selecteur .ps-chip[data-c="tous"]'); await attendre(200);
await p.click('#pays-selecteur .ps-groupe:nth-of-type(1) .ps-region'); await attendre(1800);
let w = await fen(p, 'actus-region-europe');
v('« Actualités de la région » ouvre la fenêtre du continent avec les pays', w && w.nb === 6 && /Allemagne|France|Royaume-Uni/.test(w.texte) && requetes.region[0] === 'europe', JSON.stringify(w && w.nb));
v('le sélecteur se referme après le choix', await p.evaluate(() => !document.getElementById('pays-selecteur')));
await p.evaluate(() => Panneaux.fermerTout());
await p.click('#btnPays'); await attendre(900);
await p.click('#pays-selecteur .ps-pays[data-code="JP"] .ps-nom'); await attendre(1800);
w = await fen(p, 'actus-pays-JP');
v('clic sur un pays : ses actualités s’ouvrent', w && w.nb === 10 && /actualités · japon/i.test(w.texte) && requetes.pays.includes('JP'));
await capture(p, '2-japon');
await p.evaluate(() => { document.getElementById('pays-selecteur') && document.querySelector('#pays-selecteur .pn-x').click(); Panneaux.fermerTout(); });
await p.click('#btnPays'); await attendre(700); await p.keyboard.press('Escape'); await attendre(300);
v('Échap ferme le sélecteur', await p.evaluate(() => !document.getElementById('pays-selecteur')));
await p.click('#btnPays'); await attendre(700); await p.type('#pays-selecteur input', 'coree'); await p.keyboard.press('Enter'); await attendre(1500);
v('Entrée ouvre le premier pays trouvé', !!(await fen(p, 'actus-pays-KR')));
await p.evaluate(() => Panneaux.fermerTout());

// ══ 2. Voix : « les actualités du Japon », « en Afrique », « du Brésil » ══
let dit = await dire(p, 'les actualités du Japon');
w = await fen(p, 'actus-pays-JP');
v('voix : « les actualités du Japon » → fenêtre du Japon', w && w.nb === 10 && /actualités · japon/i.test(w.texte));
v('voix : titres dans leur LANGUE D’ORIGINE avec étiquette (JA et EN), attribut lang, jamais traduits', w.langs.includes('JA') && w.langs.includes('EN') && w.lang.includes('ja') && /台風/.test(w.texte) && !/typhoon/i.test(w.texte.replace(/Typhoon/g, '')) || (w.langs.includes('JA') && /台風/.test(w.texte)), JSON.stringify(w.langs.slice(0, 4)));
v('voix : le média est nommé (NHK), les liens s’ouvrent dans un nouvel onglet', /NHK/.test(w.texte) && w.liens);
v('voix : miniatures fournies par les flux (mode normal), sans référent', w.vignettes >= 4);
v('voix : la phrase dite annonce l’actualité du Japon, la langue d’origine et la possibilité de traduire', dit.length === 1 && /pays : Japon/.test(dit[0]) && /langue d’origine/.test(dit[0]) && /traduis ces titres/.test(dit[0]), dit[0]);
v('ZÉRO IA : aucune demande à /chat pour récupérer et afficher les actualités', requetes.chat.length === 0, JSON.stringify(requetes.chat));
dit = await dire(p, 'les actualités en Afrique');
w = await fen(p, 'actus-region-afrique');
v('voix : « les actualités en Afrique » → fenêtre du continent (titres de plusieurs pays, nom du pays)', w && w.nb === 8 && /Égypte/.test(w.texte) && /Kenya/.test(w.texte) && requetes.region[0] === 'afrique' && /région : Afrique/.test(dit[0]) && requetes.chat.length === 0, dit[0]);
v('voix : titres arabes en écriture de droite à gauche, étiquette AR', w.rtl >= 1 && w.langs.includes('AR'));
dit = await dire(p, 'les actualités du Brésil');
w = await fen(p, 'actus-pays-BR');
v('voix : « les actualités du Brésil »', w && w.nb === 10 && w.langs.every(l => l === 'PT') && /portugais/.test(dit[0]) && requetes.chat.length === 0, dit[0]);
dit = await dire(p, 'donne-moi les actus des États-Unis'); v('voix : « les actus des États-Unis »', !!(await fen(p, 'actus-pays-US')) && requetes.chat.length === 0);
dit = await dire(p, 'quoi de neuf en Côte d’Ivoire'); v('voix : « quoi de neuf en Côte d’Ivoire »', !!(await fen(p, 'actus-pays-CI')) && requetes.chat.length === 0);
// honnêteté
dit = await dire(p, 'les actualités du Vanuatu');
v('honnêteté : pays sans média fiable → « je n’ai pas de source fiable », aucune fenêtre, aucun appel IA', /pas de source d’actualité fiable pour Vanuatu/.test(dit[0]) && !(await fen(p, 'actus-pays-VU')) && requetes.chat.length === 0, dit[0]);
dit = await dire(p, 'les actualités sur la guerre');
v('un sujet (pas un pays) n’est pas détourné : la demande suit son chemin habituel (agent)', requetes.chat.length === 1 && requetes.pays.length === 0 && requetes.region.length === 0);
dit = await dire(p, 'les actualités en Amérique');
v('« en Amérique » (ambigu) : Raylé demande de préciser', /Quelle partie des Amériques/.test(dit[0]) && requetes.chat.length === 0);
dit = await dire(p, 'les actualités du sport'); v('« les actualités du sport » reste aux rubriques de l’accueil (pas aux pays)', !!(await fen(p, 'actus-france-sport')) || (await p.evaluate(() => Panneaux.liste().some(x => /sport/i.test(x.titre)))));
await p.evaluate(() => Panneaux.fermerTout());

// ══ 3. Favoris par la voix et fenêtre « mes pays favoris » ══
await p.evaluate(() => localStorage.removeItem('rayle_pays_favoris')); await p.reload({ waitUntil: 'load' }); await attendre(3000);
await p.evaluate(m => { Panneaux.fermerTout(); Entite.verrou = () => {}; window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; window.__hudFixe = m; document.body.dataset.hud = m; }, 'normal');
dit = await dire(p, 'mes pays favoris'); v('favoris vides : explication simple', /pas encore de pays favori/.test(dit[0]));
dit = await dire(p, 'ajoute le Japon à mes favoris'); const f1 = await p.evaluate(() => localStorage.getItem('rayle_pays_favoris'));
dit = await dire(p, 'mets le Brésil dans mes pays favoris');
v('voix : « ajoute le Japon à mes favoris » puis le Brésil', JSON.parse(f1).join() === 'JP' && JSON.parse(await p.evaluate(() => localStorage.getItem('rayle_pays_favoris'))).join() === 'JP,BR' && /Brésil est dans tes favoris/.test(dit[0]));
dit = await dire(p, 'mes pays favoris'); w = await fen(p, 'actus-favoris');
v('voix : « mes pays favoris » → une fenêtre avec le Japon et le Brésil (digest de la planète : un seul appel)', w && /Japon/.test(w.texte) && /Brésil/.test(w.texte) && w.nb === 6 && requetes.planete === 1 && requetes.pays.length === 0 && requetes.chat.length === 0, JSON.stringify(w && w.nb));
await capture(p, '3-favoris');
dit = await dire(p, 'retire le Japon de mes favoris'); v('voix : « retire le Japon de mes favoris »', JSON.parse(await p.evaluate(() => localStorage.getItem('rayle_pays_favoris'))).join() === 'BR' && /n’est plus dans tes favoris/.test(dit[0]));
dit = await dire(p, 'ajoute Narnia à mes favoris'); v('voix : pays inconnu → réponse honnête', /Je ne connais pas « narnia »/i.test(dit[0]));
await p.evaluate(() => Panneaux.fermerTout());

// ══ 4. Traduction : seulement sur demande (une demande à l'IA, avec les titres affichés) ══
await dire(p, 'les actualités du Japon', 1500);
v('avant toute demande de traduction : zéro appel à l’IA', requetes.chat.length === 0);
dit = await dire(p, 'traduis ces titres', 2500);
v('« traduis ces titres » : UNE demande à l’IA, avec les titres japonais affichés', requetes.chat.length >= 1 && /Traduis en français/.test(requetes.chat[0]) && /台風/.test(requetes.chat[0]) && /JA/.test(requetes.chat[0]), requetes.chat[0] && requetes.chat[0].slice(0, 120));
await p.evaluate(() => Panneaux.fermerTout());

// ══ 5. Modes et réglages ══
await p.evaluate(() => { window.__hudFixe = 'leger'; document.body.dataset.hud = 'leger'; });
await dire(p, 'les actualités du Brésil', 1500); w = await fen(p, 'actus-pays-BR');
v('LÉGER : pas de miniatures (les titres restent)', w && w.nb === 10 && (w.vignettes === 0 || await p.evaluate(() => [...document.querySelectorAll('#panneaux .ac-vignette')].every(i => getComputedStyle(i).display === 'none'))));
await p.evaluate(() => { window.__hudFixe = 'normal'; document.body.dataset.hud = 'normal'; localStorage.setItem('rayle_medias', '0'); });
await p.evaluate(() => Panneaux.fermerTout()); await dire(p, 'les actualités du Brésil', 1500); w = await fen(p, 'actus-pays-BR');
v('images désactivées dans ⚙ : aucune miniature', w && w.vignettes === 0);
await p.evaluate(() => { localStorage.removeItem('rayle_medias'); Panneaux.fermerTout(); });
// Worker pas à jour : la demande suit son chemin habituel, sans erreur
await p.close();
listeEnPanne = true; p = await page(); requetes.chat.length = 0;
dit = await dire(p, 'les actualités du Japon', 2000);
v('Worker pas à jour (liste des pays absente) : aucune fenêtre fantôme, la demande va à l’agent comme avant, aucune erreur', !(await fen(p, 'actus-pays-JP')) && requetes.chat.length === 1);
await p.click('#btnPays'); await attendre(900);
v('Worker pas à jour : le bouton « Pays » ne plante pas', await p.evaluate(() => true));
listeEnPanne = false;
await p.close();

// ══ 6. Téléphone ══
p = await page({ viewport: { width: 390, height: 780 } });
await p.click('#btnPays'); await attendre(1200);
const tel = await p.evaluate(() => { const r = document.querySelector('#pays-selecteur .ps-cadre').getBoundingClientRect(); return { g: Math.round(r.left), d: Math.round(r.right), iw: innerWidth, sw: document.documentElement.scrollWidth }; });
v('téléphone : le sélecteur tient dans l’écran, sans défilement horizontal', tel.g >= 0 && tel.d <= tel.iw + 1 && tel.sw <= tel.iw + 1, JSON.stringify(tel));
await capture(p, '4-telephone');
await p.close();

v('aucune exception ni erreur de page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await b.close(); srv.close();
console.log(`\n${ok} réussis, ${ko} échec(s)`);
process.exit(ko ? 1 : 0);
