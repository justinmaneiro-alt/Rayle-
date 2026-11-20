/* ═════════════ ACTUALITÉS DE L'ACCUEIL (France · Monde · Marchés) : flux RSS publics gratuits, avec image, source et date ═════════════
   Utilisé par outils-donnees/snapshots.mjs (lot « rapide », donc toutes les 5 minutes par la boucle GitHub Actions) : le téléphone et la tablette lisent le résultat sans le PC.
   Une source en panne est ignorée (les autres suffisent) ; si TOUT échoue, l'erreur remonte et la copie précédente reste publiée.
   Données publiques seulement : titre, lien, date, image (URL du média), extrait. Aucune donnée personnelle. */
const UA = 'Mozilla/5.0 (compatible; Rayle-actus/1.0)';

export const FLUX = Object.freeze({
  france: [
    ['Le Monde', 'https://www.lemonde.fr/rss/une.xml'], ['Le Figaro', 'https://www.lefigaro.fr/rss/figaro_actualites-a-la-une.xml'], ['20 Minutes', 'https://www.20minutes.fr/feeds/rss-une.xml'],
    ['Ouest-France', 'https://www.ouest-france.fr/rss/une'], ['RFI', 'https://www.rfi.fr/fr/rss'], ['France 24', 'https://www.france24.com/fr/rss']
  ],
  monde: [
    ['Le Monde · International', 'https://www.lemonde.fr/international/rss_full.xml'], ['BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml'], ['The Guardian', 'https://www.theguardian.com/world/rss'],
    ['France 24', 'https://www.france24.com/fr/rss'], ['RFI', 'https://www.rfi.fr/fr/rss'], ['Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml']
  ],
  marches: [
    ['Le Monde · Économie', 'https://www.lemonde.fr/economie/rss_full.xml'], ['Le Figaro · Économie', 'https://www.lefigaro.fr/rss/figaro_economie.xml'], ['BBC Business', 'https://feeds.bbci.co.uk/news/business/rss.xml'],
    ['CNBC', 'https://www.cnbc.com/id/100003114/device/rss/rss.html']
  ]
});

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à' };
export const decoder = t => String(t == null ? '' : t).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] || m);
/* les adresses e-mail sont retirées : le garde-fou de publication refuserait tout le lot pour un « …@gmail.com » cité dans un article */
export const sansBalises = t => decoder(decoder(t)).replace(/<[^>]*>/g, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '').replace(/\s+/g, ' ').trim();
const balise = (bloc, nom) => { const m = new RegExp('<' + nom + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + nom + '>', 'i').exec(bloc); return m ? m[1] : ''; };
const attribut = (bloc, nom, attr) => { const m = new RegExp('<' + nom + '\\s[^>]*?' + attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i').exec(bloc); return m ? decoder(m[1]) : ''; };
const https = u => { const v = decoder(String(u || '')).trim(); return /^https:\/\/[^\s<>"']{8,500}$/i.test(v) ? v : (/^http:\/\/[^\s<>"']{8,500}$/i.test(v) ? v.replace(/^http:/, 'https:') : null); };

/* flux RSS ou Atom → [{ titre, lien, date, resume, image }] */
export function lireFlux(xml, max = 40) {
  const blocs = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [], out = [];
  for (const b of blocs) {
    const titre = sansBalises(balise(b, 'title')); if (!titre) continue;
    const lien = https(sansBalises(balise(b, 'link')) || attribut(b, 'link', 'href') || sansBalises(balise(b, 'guid')));
    const d = Date.parse(sansBalises(balise(b, 'pubDate')) || sansBalises(balise(b, 'published')) || sansBalises(balise(b, 'updated')) || sansBalises(balise(b, 'dc:date')));
    const desc = balise(b, 'description') || balise(b, 'summary') || balise(b, 'content:encoded');
    let image = https(attribut(b, 'media:content', 'url')) || https(attribut(b, 'media:thumbnail', 'url'));
    if (!image) { const m = /<enclosure\s[^>]*>/i.exec(b); if (m && /image/i.test(m[0])) image = https(attribut(m[0].replace('<enclosure', '<enclosure'), 'enclosure', 'url')); }
    if (!image) { const m = /<img[^>]+src=["']([^"']+)["']/i.exec(decoder(desc)); if (m) image = https(m[1]); }
    out.push({ titre: titre.slice(0, 220), lien, date: Number.isFinite(d) ? d : null, resume: sansBalises(desc).slice(0, 320), image });
    if (out.length >= max) break;
  }
  return out;
}

const cleTitre = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
/* fusion : plus récent d'abord, sans doublon (même lien ou même début de titre) */
export function fusionner(listes, max = 60, maintenant = Date.now()) {
  const vus = new Set(), vusLien = new Set(), tous = listes.flat().filter(x => x && x.titre && x.lien && (!x.date || x.date < maintenant + 3600e3)).sort((a, b) => (b.date || 0) - (a.date || 0)), out = [];
  for (const x of tous) { const k = cleTitre(x.titre); if (vus.has(k) || vusLien.has(x.lien)) continue; vus.add(k); vusLien.add(x.lien); out.push(x); if (out.length >= max) break; }
  return out;
}
/* mélange équitable : au plus ⌈max / nb sources⌉ + 2 articles par source parmi les plus récents, pour qu'un média prolixe ne noie pas les autres */
export function equilibrer(parSource, max = 60) {
  const plafond = Math.ceil(max / Math.max(1, parSource.length)) + 4;
  return parSource.map(l => l.slice(0, plafond));
}

async function lireUn([nom, url], fetchFn) {
  const r = await fetchFn(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!r.ok) throw new Error(nom + ' a répondu ' + r.status);
  return lireFlux(await r.text(), 40).map(x => ({ ...x, source: nom }));
}
export async function actusAccueil(onglet, { fetchFn = (...a) => fetch(...a), max = 60 } = {}) {
  const liste = FLUX[onglet]; if (!liste) throw new Error('onglet inconnu : ' + onglet);
  const res = await Promise.all(liste.map(async f => { try { return { nom: f[0], items: await lireUn(f, fetchFn), ok: true }; } catch (e) { return { nom: f[0], items: [], ok: false, erreur: String(e && e.message || e).slice(0, 100) }; } }));
  const items = fusionner(equilibrer(res.map(r => r.items), max), max);
  if (!items.length) throw new Error('aucune source de ' + onglet + ' ne répond : ' + res.map(r => r.erreur || r.nom).join(' ; '));
  return { t: Date.now(), onglet, sources: res.map(r => ({ nom: r.nom, ok: r.ok, n: r.items.length, erreur: r.erreur || null })), items };
}
