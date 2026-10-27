// Sonde en VRAI (fetch de Node, depuis le PC de Justin) des flux publics candidats « analyses de banques et d'institutions » (V2, phase 7). Écrit docs/resultats-v2/sources-analyses.json.
// Lancer :  node planetes/mars/outils-agent/v2-sonder-analyses.mjs          Seules les sources qui répondent avec un vrai flux RSS / Atom récent sont retenues (docs/ANALYSES_SOURCES.md).
// Règles : User-Agent honnête, une seule requête par source, aucun contournement (403, anti-robots, mur payant = écartée), titres + extraits courts + liens seulement.
import fs from 'node:fs';
const CANDIDATS = [
  // banques centrales (déjà dans le hub finance) : on les re-sonde pour la fiche
  ['fed_presse', 'Fed · Communiqués', 'banque centrale', 'https://www.federalreserve.gov/feeds/press_all.xml', 'Fed'],
  ['fed_discours', 'Fed · Discours et témoignages', 'banque centrale', 'https://www.federalreserve.gov/feeds/speeches.xml', 'Fed'],
  ['bce_presse', 'BCE · Communiqués', 'banque centrale', 'https://www.ecb.europa.eu/rss/press.html', 'BCE'],
  ['boe', 'Banque d’Angleterre · Actualités', 'banque centrale', 'https://www.bankofengland.co.uk/rss/news', 'BoE'],
  ['boj', 'Banque du Japon · Nouveautés', 'banque centrale', 'https://www.boj.or.jp/en/rss/whatsnew.xml', 'BoJ'],
  // nouvelles pistes : recherche publique des banques centrales et institutions
  ['bce_blog', 'BCE · Blog', 'banque centrale (analyse)', 'https://www.ecb.europa.eu/rss/blog.html', 'BCE'],
  ['bce_pubs', 'BCE · Publications', 'banque centrale (analyse)', 'https://www.ecb.europa.eu/rss/pub.html', 'BCE'],
  ['fed_ny_liberty', 'Fed de New York · Liberty Street Economics', 'banque centrale (analyse)', 'https://libertystreeteconomics.newyorkfed.org/feed/', 'Fed NY'],
  ['fed_feds_notes', 'Fed · FEDS Notes', 'banque centrale (analyse)', 'https://www.federalreserve.gov/feeds/feds_notes.xml', 'Fed'],
  ['fed_working_papers', 'Fed · Documents de travail', 'banque centrale (analyse)', 'https://www.federalreserve.gov/feeds/working_papers.xml', 'Fed'],
  ['fed_sf', 'Fed de San Francisco · Lettres économiques', 'banque centrale (analyse)', 'https://www.frbsf.org/feed/', 'Fed SF'],
  ['fed_stl_blog', 'Fed de Saint-Louis · FRED Blog', 'banque centrale (analyse)', 'https://fredblog.stlouisfed.org/feed/', 'Fed StL'],
  ['fed_stl_economie', 'Fed de Saint-Louis · On the Economy', 'banque centrale (analyse)', 'https://www.stlouisfed.org/rss/page?Category=On-the-Economy', 'Fed StL'],
  ['banque_de_france', 'Banque de France · Publications', 'banque centrale (analyse)', 'https://www.banque-france.fr/en/rss', 'Banque de France'],
  ['bundesbank', 'Bundesbank · Actualités', 'banque centrale (analyse)', 'https://www.bundesbank.de/service/rss/en/633306/feed.rss', 'Bundesbank'],
  ['bri_pub', 'BRI · Publications', 'institution', 'https://www.bis.org/doclist/bis_fsi_publs.rss', 'BRI'],
  ['bri_discours', 'BRI · Discours', 'institution', 'https://www.bis.org/doclist/cbspeeches.rss', 'BRI'],
  ['bri_recherche', 'BRI · Documents de travail', 'institution', 'https://www.bis.org/doclist/wppubls.rss', 'BRI'],
  ['fmi_blog', 'FMI · Blog', 'institution', 'https://www.imf.org/en/Blogs/rss', 'FMI'],
  ['banque_mondiale', 'Banque mondiale · Blogs', 'institution', 'https://blogs.worldbank.org/en/rss.xml', 'Banque mondiale'],
  ['ocde', 'OCDE · Actualités', 'institution', 'https://www.oecd.org/newsroom/rss.xml', 'OCDE'],
  ['voxeu', 'VoxEU (CEPR) · Colonnes', 'recherche', 'https://cepr.org/rss/voxeu', 'CEPR'],
  // banques privées avec analyses PUBLIQUES et gratuites
  ['ing_think', 'ING Think · Analyses', 'banque', 'https://think.ing.com/rss', 'ING'],
  ['danske', 'Danske Bank · Research', 'banque', 'https://research.danskebank.com/research/api/rss', 'Danske Bank'],
  ['abn_amro', 'ABN AMRO · Insights', 'banque', 'https://www.abnamro.com/research/en/rss', 'ABN AMRO'],
  ['jpm_insights', 'J.P. Morgan · Insights', 'banque', 'https://www.jpmorgan.com/insights/rss', 'J.P. Morgan'],
  ['blackrock', 'BlackRock Investment Institute', 'gestionnaire', 'https://www.blackrock.com/corporate/insights/blackrock-investment-institute/rss', 'BlackRock'],
  ['vanguard', 'Vanguard · Perspectives', 'gestionnaire', 'https://corporate.vanguard.com/content/corporatesite/us/en/corp/rss.xml', 'Vanguard'],
  ['goldman', 'Goldman Sachs · Insights', 'banque', 'https://www.goldmansachs.com/insights/rss.xml', 'Goldman Sachs']
];
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const resultats = [];
for (const [id, nom, type, url, entite] of CANDIDATS) {
  const r = { id, nom, type, url, entite, ok: false };
  try {
    const rep = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Rayle-sonde-analyses; usage personnel)' , Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    r.statut = rep.status; r.cors = rep.headers.get('access-control-allow-origin') || null; r.type_contenu = rep.headers.get('content-type');
    const texte = await rep.text(); r.octets = texte.length;
    const items = [...texte.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/g)].map(m => m[0]);
    r.nItems = items.length;
    if (rep.ok && items.length) {
      const titre = x => decode((x.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]), date = x => (x.match(/<(?:pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published|dc:date)>/) || [])[1];
      r.exemple = titre(items[0]).slice(0, 90); r.derniereDate = date(items[0]) || null;
      const dates = items.map(date).filter(Boolean).map(d => Date.parse(d)).filter(Number.isFinite).sort((a, b) => b - a);
      r.joursDepuisDernier = dates.length ? Math.round((Date.now() - dates[0]) / 86400e3) : null;
      r.ok = true;
    } else r.raison = rep.ok ? 'pas de flux RSS / Atom reconnu' : 'HTTP ' + rep.status;
  } catch (e) { r.raison = String(e && e.message || e).slice(0, 80); }
  resultats.push(r);
  console.log((r.ok ? 'OK  ' : 'NON ') + id.padEnd(20) + (r.ok ? r.nItems + ' éléments · dernier il y a ' + r.joursDepuisDernier + ' j · CORS ' + (r.cors || 'non') + ' · ' + r.exemple : r.raison));
}
fs.mkdirSync(new URL('../../../docs/resultats-v2/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../../docs/resultats-v2/sources-analyses.json', import.meta.url), JSON.stringify({ sondeLe: new Date().toISOString().slice(0, 10), resultats }, null, 1));
console.log(resultats.filter(r => r.ok).length + ' sources utilisables sur ' + resultats.length);
