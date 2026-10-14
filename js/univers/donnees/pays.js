// Informations sur un pays pour les présentations : chiffres (Wikidata, SPARQL, sans clé) + texte d'article (Wikipédia en français, sans clé), mis en cache 7 jours.
// infosPays({a2, nom}) → { nom, capitale, population, popAnnee, superficie, continent, intro, sections:{histoire:[…], geo:[…], culture:[…], societe:[…], eco:[…]}, source, hors_ligne }
// Rien n'est inventé : une information absente reste absente (le texte s'adapte). Hors ligne : { hors_ligne: true } seulement.
const CLE = 'rayle_univers_pays_v1_', DUREE = 7 * 864e5;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* quota : on s'en passe */ } };

const THEMES = {
  histoire: /histoire|pr[ée]histoire|antiquit[ée]|moyen [âa]ge|empire|r[ée]volution|ind[ée]pendance|colonisation|colonial|guerre|[ée]poque|royaume|p[ée]riode|dynastie|r[ée]publique|renaissance|xix|xx/i,
  geo: /g[ée]ographie|relief|climat|g[ée]ologie|hydrographie|faune|flore|biodiversit[ée]|environnement|volcan|c[ôo]tes|territoire|[ée]tymologie|milieu/i,
  culture: /culture|gastronomie|cuisine|sport|litt[ée]rature|musique|tradition|f[êe]tes?|patrimoine|arts?|cin[ée]ma|religion|symboles?|langues?/i,
  societe: /population|d[ée]mographie|soci[ée]t[ée]|[ée]ducation|sant[ée]|langues|religions|villes/i,
  eco: /[ée]conomie|agriculture|industrie|tourisme|[ée]nergie|transports?|commerce|finance/i,
};

function nettoyer(t) {
  return String(t || '').replace(/\[[^\]]{0,8}\]/g, '').replace(/\s*\((?:[^()]|\([^()]*\))*\)/g, m => (/\d{3,4}/.test(m) && m.length < 22 ? m : '')).replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
// 1 ou 2 phrases complètes, pas plus de max caractères
export function phrases(par, max = 330) {
  const s = nettoyer(par).match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];
  let out = ''; for (const x of s) { if ((out + x).length > max && out) break; out += x; if (out.length > max * .55) break; }
  return out.trim();
}
function decouper(extrait) {
  const lignes = String(extrait || '').split('\n'); const sections = []; let cur = { titre: 'intro', paras: [] };
  for (const l of lignes) {
    const m = /^=+\s*(.+?)\s*=+$/.exec(l.trim());
    if (m) { sections.push(cur); cur = { titre: m[1], paras: [] }; } else if (l.trim().length > 90) cur.paras.push(l.trim());
  }
  sections.push(cur); return sections;
}
export function classer(sections) {
  const out = { histoire: [], geo: [], culture: [], societe: [], eco: [] };
  for (const s of sections) {
    if (s.titre === 'intro' || /^(notes|voir aussi|liens|bibliographie|r[ée]f[ée]rences|annexes|sources)/i.test(s.titre)) continue;
    for (const k of Object.keys(THEMES)) if (THEMES[k].test(s.titre)) { for (const p of s.paras) { if (p.length >= 120 && p.length <= 900 && /^[A-ZÀ-ÖØ-Þ«"“]/.test(p) && /[.!?»]$/.test(p) && !/^\*|^\|/.test(p)) out[k].push(p); } break; }
  }
  return out;
}

async function sparql(a2) {
  const q = `SELECT ?capLabel ?pop ?area ?contLabel ?d WHERE {
  ?c wdt:P297 "${a2}".
  OPTIONAL { ?c p:P36 ?cs. ?cs ps:P36 ?cap. FILTER NOT EXISTS { ?cs pq:P582 ?fin } }
  OPTIONAL { ?c p:P1082 ?ps. ?ps ps:P1082 ?pop. ?ps pq:P585 ?d }
  OPTIONAL { ?c wdt:P2046 ?area } OPTIONAL { ?c wdt:P30 ?cont }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} ORDER BY DESC(?d) LIMIT 1`;
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error('Wikidata ' + r.status);
  const b = ((await r.json()).results.bindings || [])[0]; if (!b) return {};
  const v = k => (b[k] ? b[k].value : null);
  return { capitale: v('capLabel') && !/^Q\d+$/.test(v('capLabel')) ? v('capLabel') : null, population: v('pop') ? Math.round(+v('pop')) : null, popAnnee: v('d') ? +v('d').slice(0, 4) : null, superficie: v('area') ? Math.round(+v('area')) : null, continent: v('contLabel') && !/^Q\d+$/.test(v('contLabel')) ? v('contLabel') : null };
}
async function wikipedia(titre) {
  const r = await fetch('https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(titre));
  if (!r.ok) throw new Error('Wikipédia ' + r.status);
  const j = await r.json(), p = Object.values((j.query && j.query.pages) || {})[0];
  if (!p || p.missing !== undefined || !p.extract) throw new Error('page absente');
  return { titre: p.title, extrait: p.extract };
}
const TITRES = { 'États-Unis': 'États-Unis', 'Royaume-Uni': 'Royaume-Uni', 'Russie': 'Russie', 'Corée du Sud': 'Corée du Sud', 'Birmanie': 'Birmanie' };

export async function infosPays({ a2, nom }) {
  const cle = CLE + (a2 || nom), cache = lsGet(cle);
  if (cache) { try { const o = JSON.parse(cache); if (Date.now() - o.t < DUREE) return o.v; } catch (e) { /* cache illisible */ } }
  const [chiffres, wiki] = await Promise.allSettled([a2 ? sparql(a2) : Promise.resolve({}), wikipedia(TITRES[nom] || nom)]);
  const c = chiffres.status === 'fulfilled' ? chiffres.value : {};
  let intro = '', sections = { histoire: [], geo: [], culture: [], societe: [], eco: [] }, source = [];
  if (wiki.status === 'fulfilled') {
    const s = decouper(wiki.value.extrait); intro = (s[0].paras[0] || '').trim(); sections = classer(s); source.push('Wikipédia');
    for (const k of Object.keys(sections)) sections[k] = sections[k].slice(0, 8).map(p => p.slice(0, 700));
  }
  if (chiffres.status === 'fulfilled' && (c.capitale || c.population)) source.push('Wikidata');
  const v = Object.assign({ nom, a2, intro, sections, source, hors_ligne: !source.length }, c);
  if (source.length) lsSet(cle, JSON.stringify({ t: Date.now(), v }));
  return v;
}
