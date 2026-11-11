/* ═════════════ SOURCES DU TERMINAL SERVIES PAR LE PC (serveur local, 127.0.0.1 seulement) ═════════════
   Pourquoi : Kraken Futures, les flux RSS des banques centrales et Yahoo n'envoient pas d'en-tête CORS : le navigateur ne peut pas les lire
   directement. Le serveur local du PC les lit à sa place (comme le relais dédié en ligne, mais sans rien déployer). Aucun secret, aucune clé,
   données publiques seulement, listes blanches fixes, cache court. Le Worker « rayle » n'est jamais appelé ni modifié.
     GET /__relais/kraken/...           → mêmes routes et même liste blanche que relais-or/index.js (cible())
     GET /__rapports                    → rapports et analyses publics (Fed, BCE, BRI, Banque d'Angleterre, World Gold Council, ING Think)
     GET /__yahoo?syms=A,B&range=5d     → cotations journalières Yahoo (symboles de la liste blanche SYMBOLES_YAHOO)
     GET /__calendrier                  → calendrier ForexFactory de la semaine (secours du Worker, cache 30 min)  */
import { cible, SYMBOLES } from '../relais-or/index.js';

export const SOURCES_RAPPORTS = Object.freeze([
  { id: 'fed', nom: 'Réserve fédérale (Fed) · communiqués de politique monétaire et procès-verbaux', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', banque: 'Fed' },
  { id: 'fed-tout', nom: 'Réserve fédérale (Fed) · tous les communiqués', url: 'https://www.federalreserve.gov/feeds/press_all.xml', banque: 'Fed' },
  { id: 'bce', nom: 'Banque centrale européenne · communiqués', url: 'https://www.ecb.europa.eu/rss/press.html', banque: 'BCE' },
  { id: 'bri', nom: 'BRI · discours des banquiers centraux', url: 'https://www.bis.org/doclist/cbspeeches.rss', banque: 'BRI' },
  { id: 'boe', nom: 'Banque d’Angleterre · actualités', url: 'https://www.bankofengland.co.uk/rss/news', banque: 'BoE' },
  { id: 'wgc', nom: 'World Gold Council · publications', url: 'https://www.gold.org/rss.xml', banque: 'WGC' },
  { id: 'ing', nom: 'ING Think · commentaires de marché publics', url: 'https://think.ing.com/rss/', banque: 'ING' }
]);
/* sources essayées et écartées (dit clairement à l'utilisateur) */
export const SOURCES_ECARTEES = Object.freeze([
  { nom: 'FMI (imf.org)', raison: 'le site refuse les lecteurs automatiques (réponse 403) : non disponible' },
  { nom: 'BlackRock Investment Institute', raison: 'pas de flux public (404)' },
  { nom: 'Amundi', raison: 'pas de flux public (redirection vers le site)' }
]);
export const SYMBOLES_YAHOO = /^(\^?[A-Z]{1,6}([.=-][A-Z]{1,4})?|DX-Y\.NYB|BTC-USD|ETH-USD|SOL-USD|DOGE-USD|GC=F|NQ=F|SI=F|CL=F)$/;

const cacheMem = new Map();
async function avecCache(cle, ttl, f) {
  const c = cacheMem.get(cle), now = Date.now();
  if (c && now - c.t < ttl * 1000) return c.v;
  const v = await f(); cacheMem.set(cle, { t: now, v }); if (cacheMem.size > 300) cacheMem.delete(cacheMem.keys().next().value); return v;
}
const AGENT = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) rayle-terminal', 'Accept': '*/*' };   // ASCII seulement : un accent dans l'en-tête fait répondre 403
async function lire(url, ms = 15000) { const r = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(new URL(url).host + ' a répondu ' + r.status); return r.text(); }

/* ── RSS / Atom minimal (pur, testé) ── */
const entites = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;|&rsquo;/g, '’').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();   // balises encodées (&lt;span…) retirées après décodage
const balise = (bloc, nom) => { const m = bloc.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`, 'i')); return m ? m[1] : ''; };
export function lireFlux(xml, max = 8) {
  const items = [...String(xml).matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]).slice(0, max);
  return items.map(b => {
    let lien = entites(balise(b, 'link')); if (!lien) { const m = b.match(/<link[^>]*href="([^"]+)"/i); lien = m ? m[1] : ''; }
    const date = Date.parse(entites(balise(b, 'pubDate') || balise(b, 'dc:date') || balise(b, 'updated') || balise(b, 'published'))) || null;
    let resume = entites(balise(b, 'description') || balise(b, 'summary') || balise(b, 'content'));
    if (resume.length > 260) resume = resume.slice(0, 257).replace(/\s\S*$/, '') + '…';
    return { titre: entites(balise(b, 'title')).slice(0, 200), lien: /^https?:\/\//.test(lien) ? lien : '', date, resume };
  }).filter(x => x.titre).sort((a, b) => (b.date || 0) - (a.date || 0));
}

export async function rapports() {
  return avecCache('rapports', 1800, async () => {
    const res = await Promise.all(SOURCES_RAPPORTS.map(async s => {
      try { const L = lireFlux(await lire(s.url)); return { id: s.id, nom: s.nom, banque: s.banque, ok: true, items: L }; }
      catch (e) { return { id: s.id, nom: s.nom, banque: s.banque, ok: false, erreur: String(e.message || e), items: [] }; }
    }));
    return { t: Date.now(), sources: res, ecartees: SOURCES_ECARTEES };
  });
}

/* ── Yahoo : clôtures journalières (cotation du jour + série pour les corrélations) ── */
export async function yahoo(syms, range = '5d') {
  const R = ['5d', '1mo', '3mo', '6mo', '1y', '2y'].includes(range) ? range : '5d';
  const L = String(syms || '').split(',').map(s => s.trim()).filter(s => SYMBOLES_YAHOO.test(s)).slice(0, 12);
  const out = {};
  await Promise.all(L.map(async s => {
    try {
      out[s] = await avecCache('y|' + s + '|' + R, R === '5d' ? 60 : 1800, async () => {
        const d = JSON.parse(await lire(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${R}&interval=1d`, 12000));
        const r = d && d.chart && d.chart.result && d.chart.result[0]; if (!r) throw new Error('réponse vide');
        const t = r.timestamp || [], c = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
        const m = r.meta || {};
        return { sym: s, nom: m.shortName || m.longName || s, devise: m.currency || '', prix: m.regularMarketPrice ?? null, veille: m.chartPreviousClose ?? m.previousClose ?? null, tPrix: m.regularMarketTime ? m.regularMarketTime * 1000 : null,
          serie: t.map((x, i) => ({ t: x * 1000, c: c[i] })).filter(p => Number.isFinite(p.c)) };
      });
    } catch (e) { out[s] = { sym: s, erreur: String(e.message || e) }; }
  }));
  return { t: Date.now(), source: 'Yahoo Finance (lu par le PC, différé possible)', cotes: out };
}

/* ── relais Kraken local : même liste blanche que le relais dédié ── */
export async function kraken(urlRelative) {
  const c = cible('http://x' + urlRelative);
  if (!c) return { statut: 404, corps: 'route inconnue' };
  if (c.erreur) return { statut: 400, corps: c.erreur };
  try {
    const corps = await avecCache('k|' + c.url + '|' + (c.sym || ''), c.ttl, async () => {
      let t = await lire(c.url, 15000);
      if (c.filtre === 'tickers') { const d = JSON.parse(t); t = JSON.stringify({ tickers: (d.tickers || []).filter(x => SYMBOLES.includes(x.symbol)) }); }
      if (c.filtre === 'instrument') { const d = JSON.parse(t); t = JSON.stringify({ instrument: (d.instruments || []).find(i => i.symbol === (c.sym || 'PF_XAUUSD')) || null }); }
      return t;
    });
    return { statut: 200, corps };
  } catch (e) { return { statut: 502, corps: 'source Kraken indisponible (' + (e.message || e) + ')' }; }
}

/* calendrier ForexFactory de la semaine (secours quand le Worker de Rayle n'est pas connecté ; la source limite les appels : cache 30 min) */
export async function calendrier() { return avecCache('ff', 1800, async () => JSON.parse(await lire('https://nfs.faireconomy.media/ff_calendar_thisweek.json', 15000))); }

/* routeur pour serveur.mjs : renvoie true si la requête est traitée */
export function gererTerminal(req, res, chemin) {
  const envoyer = (statut, corps, type = 'application/json; charset=utf-8') => { res.writeHead(statut, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof corps === 'string' ? corps : JSON.stringify(corps)); };
  if (req.method !== 'GET') { envoyer(405, 'GET seulement', 'text/plain; charset=utf-8'); return true; }
  const u = new URL(req.url, 'http://x');
  if (chemin.startsWith('/__relais/kraken/')) { kraken(u.pathname.slice('/__relais'.length) + u.search).then(r => envoyer(r.statut, r.corps, r.statut === 200 ? undefined : 'text/plain; charset=utf-8')); return true; }
  if (chemin === '/__relais/sante') { envoyer(200, 'ok', 'text/plain; charset=utf-8'); return true; }
  if (chemin === '/__rapports') { rapports().then(d => envoyer(200, d), e => envoyer(502, { erreur: String(e.message || e) })); return true; }
  if (chemin === '/__calendrier') { calendrier().then(d => envoyer(200, d), e => envoyer(502, { erreur: String(e.message || e) })); return true; }
  if (chemin === '/__yahoo') { yahoo(u.searchParams.get('syms'), u.searchParams.get('range') || '5d').then(d => envoyer(200, d), e => envoyer(502, { erreur: String(e.message || e) })); return true; }
  return false;
}
