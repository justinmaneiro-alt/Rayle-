// Actualités sur le globe : de vraies actualités, localisées par pays ou par ville, affichées en pastilles cliquables.
// Sources : (1) flux RSS de franceinfo (monde, titres : ouverts aux navigateurs, sans clé) ; (2) le Worker de Raylé, route /actus (flux RSS, chaque article cite sa source) ; (3) en dernier recours GDELT DOC 2.0 (gratuit, sans clé : certains navigateurs le bloquent).
// Aucune actualité n'est inventée : sans source joignable, la liste est vide et Raylé le dit. Localisation : le titre est comparé aux noms de pays et de grandes villes
// (la source d'un article GDELT sert de repli). Cache de 20 minutes.
// actusMonde(pont) → { items:[{titre, source, url, t, lieu:{nom, lat, lon, type}|null}], source, erreur? }   ·   actusDe(nom, pont) → même forme, filtrée sur un pays/une zone
export const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const CACHE = new Map(), DUREE = 20 * 60e3;
let gdeltBloque = false;

// noms anglais (champ « sourcecountry » de GDELT) → code ISO alpha-2
const EN = { 'united states': 'US', 'united kingdom': 'GB', france: 'FR', germany: 'DE', italy: 'IT', spain: 'ES', portugal: 'PT', belgium: 'BE', netherlands: 'NL', switzerland: 'CH', austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', ireland: 'IE', poland: 'PL', ukraine: 'UA', russia: 'RU', turkey: 'TR', greece: 'GR', romania: 'RO', 'czech republic': 'CZ', hungary: 'HU', canada: 'CA', mexico: 'MX', brazil: 'BR', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', venezuela: 'VE', cuba: 'CU', china: 'CN', japan: 'JP', 'south korea': 'KR', 'north korea': 'KP', india: 'IN', pakistan: 'PK', bangladesh: 'BD', indonesia: 'ID', philippines: 'PH', vietnam: 'VN', thailand: 'TH', malaysia: 'MY', singapore: 'SG', australia: 'AU', 'new zealand': 'NZ', israel: 'IL', iran: 'IR', iraq: 'IQ', 'saudi arabia': 'SA', egypt: 'EG', 'south africa': 'ZA', nigeria: 'NG', kenya: 'KE', ethiopia: 'ET', morocco: 'MA', algeria: 'DZ', tunisia: 'TN', senegal: 'SN', ghana: 'GH', 'ivory coast': 'CI', cameroon: 'CM', lebanon: 'LB', jordan: 'JO', qatar: 'QA', 'united arab emirates': 'AE', afghanistan: 'AF', syria: 'SY' };

/* ───── localisation d'un titre : pays (RaylePays + centres) et villes ───── */
export function indexerLieux({ pays = [], centres = [], villes = [] }) {
  const parNum = new Map(centres.map(c => [String(c[0]).padStart(3, '0'), { lat: c[1], lon: c[2] }]));
  const noms = [];
  for (const p of pays) { const c = parNum.get(p[0]); if (!c) continue; const n = norm(p[3]); if (n.length >= 4) noms.push({ re: new RegExp('(?:^| )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: |$)'), nom: p[3], lat: c.lat, lon: c.lon, type: 'pays', a2: p[1], w: n.length }); }
  const extra = { 'etats unis': 'US', 'royaume uni': 'GB', 'grande bretagne': 'GB', 'russe': 'RU', 'ukrainien': 'UA', 'americain': 'US', 'chinois': 'CN', 'japonais': 'JP', 'israelien': 'IL', 'gaza': 'PS', 'moscou': 'RU', 'kiev': 'UA', 'washington': 'US', 'pekin': 'CN', 'bruxelles': 'BE', 'londres': 'GB' };
  for (const v of villes) { const n = norm(v[0]); if (n.length >= 4) noms.push({ re: new RegExp('(?:^| )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: |$)'), nom: v[0], lat: v[1], lon: v[2], type: 'ville', w: n.length + 3 }); }
  for (const [k, a2] of Object.entries(extra)) { const p = pays.find(x => x[1] === a2), c = p && parNum.get(p[0]); if (c) noms.push({ re: new RegExp('(?:^| )' + k + '(?: |$)'), nom: p[3], lat: c.lat, lon: c.lon, type: 'pays', a2, w: k.length }); }
  const parA2 = new Map(); for (const p of pays) { const c = parNum.get(p[0]); if (c) parA2.set(p[1], { nom: p[3], lat: c.lat, lon: c.lon, type: 'pays', a2: p[1] }); }
  noms.sort((a, b) => b.w - a.w);
  return { noms, parA2 };
}
export function localiser(items, index) {
  return items.map(it => {
    const t = norm(it.titre); let lieu = null;
    for (const n of index.noms) if (n.re.test(t)) { lieu = { nom: n.nom, lat: n.lat, lon: n.lon, type: n.type, a2: n.a2 }; break; }
    if (!lieu && it.sourcePays) { const a2 = EN[norm(it.sourcePays)]; if (a2 && index.parA2.has(a2)) lieu = index.parA2.get(a2); }
    return Object.assign({}, it, { lieu });
  });
}

/* ───── flux RSS (pur : testé) ───── */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', hellip: '…', ndash: '–', mdash: '—' };
const decoder = t => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] || m)).replace(/\s+/g, ' ').trim();
export function parserRSS(xml, source) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0], get = tag => { const r = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i').exec(b); return r ? decoder(r[1]) : ''; };
    const titre = get('title'), url = get('link') || get('guid'), d = Date.parse(get('pubDate') || get('dc:date'));
    if (titre && titre.length > 8) out.push({ titre, url: /^https?:/.test(url) ? url : '', source, t: isFinite(d) ? d : null });
  }
  return out;
}
const FLUX = [['franceinfo', 'https://www.franceinfo.fr/monde.rss'], ['franceinfo', 'https://www.franceinfo.fr/titres.rss']];
async function viaRSS() {
  const r = await Promise.allSettled(FLUX.map(async ([nom, u]) => { const x = await fetch(u); if (!x.ok) throw new Error(nom + ' ' + x.status); return parserRSS(await x.text(), nom); }));
  const items = r.filter(x => x.status === 'fulfilled').flatMap(x => x.value);
  if (!items.length) throw new Error('flux RSS injoignables');
  return items;
}

/* ───── sources ───── */
function propre(it) { return { titre: String(it.titre || it.title || '').replace(/\s+/g, ' ').trim(), url: String(it.url || it.lien || ''), source: String(it.source || it.domain || '').trim(), t: it.t || it.date || null, sourcePays: it.sourcePays || it.sourcecountry || null }; }
async function viaWorker(pont, q) {
  if (!pont || !pont.workerPret || !pont.workerPret()) throw new Error('Worker non relié');
  const d = await pont.wjson(q, 25000);
  return (d.items || []).map(propre).filter(x => x.titre);
}
async function viaGdelt() {
  if (gdeltBloque) throw new Error('GDELT indisponible');
  const u = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent('(sourcelang:french OR sourcelang:english)') + '&mode=artlist&maxrecords=60&format=json&sort=datedesc&timespan=3h';
  const r = await fetch(u); if (!r.ok) throw new Error('GDELT ' + r.status);
  const d = await r.json(); return (d.articles || []).map(a => ({ titre: a.title, url: a.url, source: a.domain, t: a.seendate ? Date.parse(a.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')) : null, sourcePays: a.sourcecountry })).map(propre).filter(x => x.titre);
}
export async function actusMonde(pont, index) {
  const c = CACHE.get('monde'); if (c && Date.now() - c.t < DUREE) return c.v;
  let items = [], sources = [], erreur = '';
  try { items.push(...await viaRSS()); sources.push('franceinfo (flux RSS)'); } catch (e) { erreur = String(e && e.message || e); }
  try { const a = await viaWorker(pont, '/actus?cat=monde'); items.push(...a); if (a.length) sources.push('Worker Raylé'); } catch (e) { erreur += (erreur ? ' · ' : '') + String(e && e.message || e); }
  if (!items.length) { try { items = await viaGdelt(); sources = ['GDELT']; erreur = ''; } catch (e) { gdeltBloque = true; erreur += (erreur ? ' · ' : '') + String(e && e.message || e); } }
  const vus = new Set(); items = items.filter(x => { const k = norm(x.titre).slice(0, 60); if (vus.has(k)) return false; vus.add(k); return true; });
  const out = { items: index ? localiser(items, index) : items, source: sources.join(' + '), erreur: items.length ? '' : (erreur || 'aucune source') };
  if (items.length) CACHE.set('monde', { t: Date.now(), v: out });
  return out;
}
export async function actusDe(nom, pont, index) {
  const cle = 'zone:' + norm(nom), c = CACHE.get(cle); if (c && Date.now() - c.t < DUREE) return c.v;
  let items = [], source = '', erreur = '';
  try { items = await viaWorker(pont, '/actus?q=' + encodeURIComponent(nom + ' actualités')); source = 'Worker Raylé (flux RSS)'; } catch (e) { erreur = String(e && e.message || e); }
  if (!items.length) {                                           // repli : les actualités du monde, filtrées par le nom
    try { const m = await actusMonde(pont, index), n = norm(nom); items = m.items.filter(x => norm(x.titre).includes(n) || (x.lieu && norm(x.lieu.nom) === n)); source = m.source; if (!items.length) erreur = erreur || 'aucun article sur ce lieu dans les sources'; } catch (e) { erreur = String(e && e.message || e); }
  }
  const out = { items: index ? localiser(items, index) : items, source, erreur: items.length ? '' : erreur };
  if (items.length) CACHE.set(cle, { t: Date.now(), v: out });
  return out;
}
export const viderCache = () => { CACHE.clear(); gdeltBloque = false; };
