/* ═════════════ FLUX D'ACTUALITÉS FINANCIÈRES, DE BANQUES CENTRALES ET D'INSTITUTIONS (M2b ; module pur, testé : finance-test.mjs) ═════════════
   REGISTRE des sources : chacune a été sondée en vrai le 2026-10-22 depuis le PC de Justin (docs/sources-finance.json, docs/sources-finance.md). On ne reprend que des TITRES, de COURTS EXTRAITS (≤ 220 caractères),
   la date, la source et le LIEN vers l'article : jamais le texte complet, jamais de contournement d'un accès payant. Le contenu reste la propriété de son éditeur.
   `acces: 'navigateur'` : la source autorise l'appel direct depuis la page (CORS ouvert) ; `acces: 'worker'` : il faut la route /finance/flux du Worker (non déployée tant que Justin ne l'a pas décidé).
   Sources sondées et ÉCARTÉES (raison dans docs/sources-finance.md) : FMI (accès refusé 403), OCDE (contrôle anti-robots), Crédit Agricole (503), BNP Paribas et Natixis (pas de flux RSS exploitable),
   Boursorama (plus de flux), Reuters (flux retiré), Stooq (bloqué), Invesco (406), Investing.com et Seeking Alpha (conditions d'utilisation restrictives : non utilisés par prudence). */
const Y = s => 'https://finance.yahoo.com/rss/headline?s=' + encodeURIComponent(s);
export const REGISTRE_FLUX = [
  // actualités financières
  { id: 'cnbc_top', nom: 'CNBC · À la une', groupe: 'actus', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', acces: 'navigateur', langue: 'en' },
  { id: 'cnbc_finance', nom: 'CNBC · Finance', groupe: 'actus', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', acces: 'navigateur', langue: 'en' },
  { id: 'marketwatch', nom: 'MarketWatch · À la une', groupe: 'actus', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', acces: 'navigateur', langue: 'en' },
  { id: 'marketwatch_marches', nom: 'MarketWatch · Marchés', groupe: 'actus', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', acces: 'navigateur', langue: 'en' },
  { id: 'bloomberg_marches', nom: 'Bloomberg · Marchés (titres)', groupe: 'actus', url: 'https://feeds.bloomberg.com/markets/news.rss', acces: 'worker', langue: 'en' },
  { id: 'ft', nom: 'Financial Times · À la une (titres)', groupe: 'actus', url: 'https://www.ft.com/rss/home', acces: 'worker', langue: 'en' },
  { id: 'echos', nom: 'Les Échos · Finance et marchés', groupe: 'actus', url: 'https://services.lesechos.fr/rss/les-echos-finance-marches.xml', acces: 'worker', langue: 'fr' },
  { id: 'yahoo_nasdaq', nom: 'Yahoo Finance · Nasdaq', groupe: 'actus', actif: 'US100', url: Y('^IXIC'), acces: 'worker', langue: 'en' },
  { id: 'yahoo_or', nom: 'Yahoo Finance · Or', groupe: 'actus', actif: 'XAU', url: Y('GC=F'), acces: 'worker', langue: 'en' },
  { id: 'yahoo_btc', nom: 'Yahoo Finance · Bitcoin', groupe: 'actus', actif: 'BTC', url: Y('BTC-USD'), acces: 'worker', langue: 'en' },
  { id: 'yahoo_dollar', nom: 'Yahoo Finance · Dollar', groupe: 'actus', actif: 'USD', url: Y('DX-Y.NYB'), acces: 'worker', langue: 'en' },
  { id: 'yahoo_taux', nom: 'Yahoo Finance · Taux 10 ans', groupe: 'actus', actif: 'TAUX', url: Y('^TNX'), acces: 'worker', langue: 'en' },
  { id: 'coindesk', nom: 'CoinDesk · Crypto', groupe: 'actus', actif: 'BTC', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', acces: 'worker', langue: 'en' },
  // banques centrales (sources officielles)
  { id: 'fed_presse', nom: 'Fed · Communiqués', groupe: 'banques', banque: 'Fed', url: 'https://www.federalreserve.gov/feeds/press_all.xml', acces: 'worker', langue: 'en', officiel: true },
  { id: 'fed_monetaire', nom: 'Fed · Politique monétaire', groupe: 'banques', banque: 'Fed', url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', acces: 'worker', langue: 'en', officiel: true },
  { id: 'fed_discours', nom: 'Fed · Discours et témoignages', groupe: 'banques', banque: 'Fed', url: 'https://www.federalreserve.gov/feeds/speeches.xml', acces: 'worker', langue: 'en', officiel: true },
  { id: 'bce_presse', nom: 'BCE · Communiqués', groupe: 'banques', banque: 'BCE', url: 'https://www.ecb.europa.eu/rss/press.html', acces: 'worker', langue: 'en', officiel: true },
  { id: 'boe', nom: 'Banque d’Angleterre · Actualités', groupe: 'banques', banque: 'BoE', url: 'https://www.bankofengland.co.uk/rss/news', acces: 'worker', langue: 'en', officiel: true },
  { id: 'boj', nom: 'Banque du Japon · Nouveautés', groupe: 'banques', banque: 'BoJ', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml', acces: 'worker', langue: 'en', officiel: true },
  { id: 'bns', nom: 'BNS · Communiqués', groupe: 'banques', banque: 'BNS', url: 'https://www.snb.ch/public/en/rss/pressrel', acces: 'worker', langue: 'en', officiel: true },
  { id: 'boc', nom: 'Banque du Canada · Communiqués', groupe: 'banques', banque: 'BoC', url: 'https://www.bankofcanada.ca/content_type/press-releases/feed/', acces: 'navigateur', langue: 'en', officiel: true },
  { id: 'rba', nom: 'RBA · Communiqués', groupe: 'banques', banque: 'RBA', url: 'https://www.rba.gov.au/rss/rss-cb-media-releases.xml', acces: 'worker', langue: 'en', officiel: true },
  // publications publiques d'institutions
  { id: 'bce_pubs', nom: 'BCE · Publications', groupe: 'institutions', institution: 'BCE', url: 'https://www.ecb.europa.eu/rss/pub.html', acces: 'worker', langue: 'en', officiel: true },
  { id: 'bri_pub', nom: 'BRI · Publications', groupe: 'institutions', institution: 'BRI', url: 'https://www.bis.org/doclist/bis_fsi_publs.rss', acces: 'worker', langue: 'en', officiel: true },
  { id: 'bri_discours', nom: 'BRI · Discours de banquiers centraux', groupe: 'institutions', institution: 'BRI', url: 'https://www.bis.org/doclist/cbspeeches.rss', acces: 'worker', langue: 'en', officiel: true },
  { id: 'ing_think', nom: 'ING Think · Analyses publiques', groupe: 'institutions', institution: 'ING', url: 'https://think.ing.com/rss', acces: 'worker', langue: 'en' }
];
export const FLUX_PAR_ID = Object.fromEntries(REGISTRE_FLUX.map(f => [f.id, f]));
export const GROUPES = { actus: 'Actualités financières', banques: 'Banques centrales', institutions: 'Publications publiques' };
/* Mention obligatoire pour les analyses de banques d'investissement. */
export const MENTION_RECHERCHE_PAYANTE = 'Les analyses des banques d’investissement (Goldman Sachs, JP Morgan, Morgan Stanley…) sont PAYANTES : elles ne sont pas affichées ici et ne sont pas simulées. Seules les publications publiques d’institutions sont listées.';

const decode = s => String(s == null ? '' : s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
const texte = s => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const bloc = (x, tag) => { const m = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(x); return m ? m[1] : ''; };
/* RSS 2.0, RSS 1.0 (RDF) ou Atom → éléments { titre, url, t (ms), resume }. Le résumé est tronqué à 220 caractères. */
export function analyserRss(xml, max = 40) {
  const s = String(xml || ''), out = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi; let m;
  while ((m = re.exec(s)) && out.length < max) {
    const b = m[2], titre = texte(bloc(b, 'title')); if (!titre) continue;
    let url = texte(bloc(b, 'link')); if (!url) { const a = /<link[^>]*href=["']([^"']+)["']/i.exec(b); url = a ? decode(a[1]) : ''; }
    if (!url) { const g = texte(bloc(b, 'guid')); if (/^https?:/.test(g)) url = g; }
    const d = bloc(b, 'pubDate') || bloc(b, 'dc:date') || bloc(b, 'published') || bloc(b, 'updated') || bloc(b, 'date'), t = Date.parse(texte(d));
    const resume = texte(bloc(b, 'description') || bloc(b, 'summary') || bloc(b, 'content:encoded')).slice(0, 220);
    if (!/^https?:\/\//.test(url)) continue;
    out.push({ titre: titre.slice(0, 220), url, t: Number.isFinite(t) ? t : null, resume });
  }
  return out;
}
/* Fusion de plusieurs sources : chaque élément garde sa source ; doublons (même lien ou même titre) écartés ; plus récent d'abord. */
export function fusionnerFlux(parSource) {
  const vus = new Set(), out = [];
  for (const [id, items] of Object.entries(parSource || {})) {
    const f = FLUX_PAR_ID[id]; if (!f) continue;
    for (const it of items || []) { const k = it.url.replace(/[?#].*$/, '') || it.titre.toLowerCase(); const k2 = it.titre.toLowerCase().slice(0, 80); if (vus.has(k) || vus.has(k2)) continue; vus.add(k); vus.add(k2); out.push({ ...it, source: f.nom, sourceId: id, groupe: f.groupe, banque: f.banque || null, institution: f.institution || null, officiel: !!f.officiel, actifSource: f.actif || null }); }
  }
  return out.sort((a, b) => (b.t || 0) - (a.t || 0));
}
export const idsDuGroupe = (groupe, { actif = null } = {}) => REGISTRE_FLUX.filter(f => f.groupe === groupe && (!actif || !f.actif || f.actif === actif)).map(f => f.id);

/* Banque demandée à la voix (« que dit la Fed ? ») → { banque: 'Fed' }. */
export function banqueDeLaPhrase(texteVoix) {
  const t = String(texteVoix || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ');
  const table = [['Fed', /\b(fed|federal reserve|reserve federale|fomc|powell|warsh)\b/], ['BCE', /\b(bce|ecb|banque centrale europeenne|lagarde)\b/], ['BoE', /\b(boe|banque d angleterre|bank of england)\b/], ['BoJ', /\b(boj|banque du japon|bank of japan)\b/],
    ['BNS', /\b(bns|snb|banque nationale suisse)\b/], ['BoC', /\b(banque du canada|bank of canada|boc)\b/], ['RBA', /\b(rba|banque de reserve d australie|reserve bank of australia)\b/]];
  for (const [b, re] of table) if (re.test(t)) return b;
  return /\b(banques? centrales?)\b/.test(t) ? 'toutes' : null;
}
export const nomBanque = { Fed: 'la Fed', BCE: 'la BCE', BoE: 'la Banque d’Angleterre', BoJ: 'la Banque du Japon', BNS: 'la Banque nationale suisse', BoC: 'la Banque du Canada', RBA: 'la Banque de réserve d’Australie', toutes: 'les banques centrales' };

/* Phrase parlée : titres récents d'une banque (titres tels que publiés, en anglais pour la plupart : dit). */
export function phraseBanque(banque, items, maintenant = Date.now()) {
  const l = (items || []).filter(i => banque === 'toutes' || i.banque === banque).slice(0, 3);
  if (!l.length) return 'Je n’ai pas de publication récente de ' + (nomBanque[banque] || 'cette banque') + ' pour le moment.';
  const age = t => { if (!t) return ''; const j = Math.floor((maintenant - t) / 86400e3); return j <= 0 ? ' aujourd’hui' : j === 1 ? ' hier' : ' il y a ' + j + ' jours'; };
  return 'Dernières publications officielles de ' + nomBanque[banque] + ' : ' + l.map(i => (banque === 'toutes' && i.banque ? i.banque + ', ' : '') + '« ' + i.titre + ' »' + age(i.t)).join(' ; ') + '. Titres dans la langue d’origine.';
}
