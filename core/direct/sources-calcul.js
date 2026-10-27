/* ═════════════ SOURCES EN DIRECT : COMMUNIQUÉS OFFICIELS, TÉLÉVISIONS, RÉSEAUX SOCIAUX PUBLICS, PODCASTS, WIKIPÉDIA — module pur, testé : direct-test.mjs ═════════════
   REGISTRE vérifié en vrai le 2026-10-22 depuis le PC de Justin (docs/sources-direct.md et .json). On reprend des TITRES, de COURTS EXTRAITS (≤ 220 caractères), la date, la source et le LIEN ; jamais le texte complet.
   Télévisions : lecture SEULEMENT au clic, chaînes officielles qui autorisent l'intégration (lecteur YouTube sans cookies ou flux HLS officiel), aucune capture, aucun enregistrement.
   Podcasts : lecteur audio au clic sur le fichier officiel du flux RSS ; AUCUNE transcription.
   Réseaux sociaux : seulement des comptes publics VÉRIFIÉS (Bluesky : badge « valid » ; Mastodon : site vérifié ou instance officielle) ; appel public sans compte.
   ÉCARTÉS après sondage : FMI (403), comptes Mastodon NASA et BBC de mastodon.social (comptes de fans, pas officiels), comptes Bluesky BBC News, UN, Sky News (non vérifiés), Wikinews (FERMÉ par la Fondation Wikimedia en mai 2026, voir plus bas). */
export const COMMUNIQUES = [
  { id: 'onu', nom: 'ONU Info', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', acces: 'worker', langue: 'en' },
  { id: 'oms', nom: 'OMS · actualités', url: 'https://www.who.int/rss-feeds/news-english.xml', acces: 'navigateur', langue: 'en' },
  { id: 'commission', nom: 'Commission européenne · communiqués', url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=fr&pagesize=20', acces: 'navigateur', langue: 'fr' },
  { id: 'nasa', nom: 'NASA · actualités', url: 'https://www.nasa.gov/feed/', acces: 'navigateur', langue: 'en' },
  { id: 'esa', nom: 'ESA · actualités spatiales', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_News', acces: 'worker', langue: 'en' },
  { id: 'bce_presse', nom: 'BCE · communiqués', url: 'https://www.ecb.europa.eu/rss/press.html', acces: 'worker', langue: 'en' }
];
export const PODCASTS = [
  { id: 'bbc_global', nom: 'BBC World Service · Global News Podcast', radio: 'BBC (service public, Royaume-Uni)', url: 'https://podcasts.files.bbci.co.uk/p02nq0gn.rss', acces: 'navigateur', langue: 'en' },
  { id: 'npr_news', nom: 'NPR · News Now', radio: 'NPR (radio publique, États-Unis)', url: 'https://feeds.npr.org/500005/podcast.xml', acces: 'navigateur', langue: 'en' },
  { id: 'dw_europe', nom: 'DW · Inside Europe', radio: 'Deutsche Welle (service public, Allemagne)', url: 'https://rss.dw.com/xml/podcast_inside-europe', acces: 'navigateur', langue: 'en' },
  { id: 'cbc_monde', nom: 'CBC · The World This Hour', radio: 'CBC (radio publique, Canada)', url: 'https://www.cbc.ca/podcasting/includes/hourlynews.xml', acces: 'worker', langue: 'en' },
  { id: 'inter_8h20', nom: 'France Inter · L’Invité de 8h20', radio: 'Radio France (service public, France)', url: 'https://radiofrance-podcast.net/podcast09/rss_10239.xml', acces: 'navigateur', langue: 'fr' }
];
export const TELEVISIONS = [
  { id: 'f24_fr', nom: 'FRANCE 24 (français)', langue: 'fr', lecteur: 'youtube', chaine: 'UCCCPCZNChQdGa9EkATeye4g', alias: ['france 24', 'france vingt quatre', 'france24'] },
  { id: 'f24_en', nom: 'FRANCE 24 English', langue: 'en', lecteur: 'youtube', chaine: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', alias: ['france 24 english', 'france 24 en anglais'] },
  { id: 'euronews', nom: 'Euronews (English)', langue: 'en', lecteur: 'youtube', chaine: 'UCSrZ3UV4jOidv8ppoVuvW9Q', alias: ['euronews', 'euro news'] },
  { id: 'dw', nom: 'DW News', langue: 'en', lecteur: 'youtube', chaine: 'UCknLrEdhRCp1aegoMqRaCZg', alias: ['dw', 'dw news', 'deutsche welle'] },
  { id: 'aljazeera', nom: 'Al Jazeera English', langue: 'en', lecteur: 'youtube', chaine: 'UCNye-wNBqNL5ZzHSJj3l8Bg', alias: ['al jazeera', 'aljazeera', 'al jazira'] },
  { id: 'sky', nom: 'Sky News', langue: 'en', lecteur: 'youtube', chaine: 'UCoMdktPbSTixAyNGwb-UYkQ', alias: ['sky news', 'sky'] },
  { id: 'nhk', nom: 'NHK WORLD-JAPAN', langue: 'en', lecteur: 'hls', flux: 'https://masterpl.hls.nhkworld.jp/hls/w/live/smarttv.m3u8', alias: ['nhk', 'nhk world', 'nhk japon'] }
];
export const COMPTES_BLUESKY = [
  { handle: 'who.int', nom: 'OMS' }, { handle: 'ecb.europa.eu', nom: 'BCE' }, { handle: 'europeancommission.bsky.social', nom: 'Commission européenne' }, { handle: 'esa.int', nom: 'ESA' },
  { handle: 'afp.com', nom: 'AFP' }, { handle: 'aljazeera.com', nom: 'Al Jazeera English' }, { handle: 'euronews.com', nom: 'Euronews' }, { handle: 'france24.com', nom: 'FRANCE 24' },
  { handle: 'lemonde.fr', nom: 'Le Monde' }, { handle: 'reuters.com', nom: 'Reuters' }, { handle: 'apnews.com', nom: 'Associated Press' }
];
export const COMPTES_MASTODON = [
  { instance: 'ard.social', acct: 'tagesschau', nom: 'tagesschau (ARD)', domaine: 'tagesschau.de' },
  { instance: 'ec.social-network.europa.eu', acct: 'EUCommission', nom: 'Commission européenne', instanceOfficielle: true }
];
export const SOURCES_ECARTEES = [
  ['FMI (actualités RSS)', '403 Access Denied'], ['Comptes Mastodon NASA et BBC de mastodon.social', 'comptes de fans (200 abonnés, aucun lien vérifié), pas des comptes officiels'], ['Bluesky BBC News, ONU, Sky News, NASA Earth', 'profils non vérifiés ou quasi vides'],
  ['Wikinews', 'FERMÉ par la Fondation Wikimedia (annonce du 2026-05-03, visible dans sa propre API) : plus aucune nouvelle publiée'], ['Flux RFI, ABC Australia, RTS, RTBF', 'adresse en erreur (404 / 406 / échec de connexion)'], ['OMS « Disease Outbreak News » RSS', '404'], ['GDACS API GeoJSON', 'lente (12 s) : le flux RSS est utilisé'],
  ['NHK sur YouTube', 'identifiant de chaîne non vérifiable : le flux HLS officiel de NHK WORLD-JAPAN est utilisé à la place']
];
export const URL_BLUESKY = { profil: h => 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(h), flux: (h, n = 8) => 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=' + encodeURIComponent(h) + '&limit=' + n + '&filter=posts_no_replies' };
export const urlMastodon = { compte: c => 'https://' + c.instance + '/api/v1/accounts/lookup?acct=' + encodeURIComponent(c.acct), statuts: (c, id, n = 8) => 'https://' + c.instance + '/api/v1/accounts/' + encodeURIComponent(id) + '/statuses?limit=' + n + '&exclude_replies=true&exclude_reblogs=true' };
export const URL_WIKIPEDIA = { jour: (langue, m, j) => 'https://api.wikimedia.org/feed/v1/wikipedia/' + langue + '/onthisday/selected/' + m + '/' + j, actualite: (an, m, j) => 'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/' + an + '/' + String(m).padStart(2, '0') + '/' + String(j).padStart(2, '0') };
export const URL_WIKINEWS = 'https://en.wikinews.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Published&cmlimit=6&cmsort=timestamp&cmdir=desc&cmprop=title%7Ctimestamp&format=json&origin=*';

/* ── Lecteur d'une télévision : adresse d'intégration (jamais lancée sans clic) ── */
export const urlLecteurTv = tv => (tv.lecteur === 'youtube' ? 'https://www.youtube-nocookie.com/embed/live_stream?channel=' + tv.chaine + '&autoplay=1&rel=0&modestbranding=1' : tv.flux);
export const urlPageTv = tv => (tv.lecteur === 'youtube' ? 'https://www.youtube.com/channel/' + tv.chaine + '/live' : 'https://www3.nhk.or.jp/nhkworld/en/live/');

/* ── Analyses ── */
const texteBrut = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const coupe = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* Bluesky : getAuthorFeed → messages (les republications sont écartées : on ne montre que ce que le compte a écrit). */
export function analyserBluesky(j, compte) {
  if (!j || !Array.isArray(j.feed)) return [];
  const out = [];
  for (const x of j.feed) {
    if (x.reason) continue; const p = x.post, r = p && p.record; if (!r || !r.text || !p.uri) continue;
    const t = Date.parse(r.createdAt), rkey = p.uri.split('/').pop(), handle = (p.author && p.author.handle) || (compte && compte.handle) || '';
    out.push({ id: p.uri, texte: coupe(texteBrut(r.text), 280), t: Number.isFinite(t) ? t : null, url: 'https://bsky.app/profile/' + handle + '/post/' + rkey, auteur: (p.author && p.author.displayName) || (compte && compte.nom) || handle, handle, aimes: p.likeCount || 0, reposts: p.repostCount || 0 });
  }
  return out;
}
export const estVerifieBluesky = profil => !!(profil && profil.verification && profil.verification.verifiedStatus === 'valid');
/* Mastodon : compte vérifié = un lien du profil porte `verified_at`, ou instance officielle de l'institution. */
export const estVerifieMastodon = (compte, profil) => !!(profil && (compte.instanceOfficielle || (profil.fields || []).some(f => f.verified_at)));
export function analyserMastodon(j, compte) {
  if (!Array.isArray(j)) return [];
  return j.filter(s => s && s.content && s.url).map(s => ({ id: s.uri || s.url, texte: coupe(texteBrut(s.content), 280), t: Date.parse(s.created_at) || null, url: s.url, auteur: (s.account && s.account.display_name) || (compte && compte.nom) || '', handle: (s.account && s.account.acct) || '', aimes: s.favourites_count || 0, reposts: s.reblogs_count || 0 }));
}
/* Podcast RSS : épisodes avec fichier audio. Un fichier en http (non sécurisé) n'est jouable que depuis une page http locale : `securise` le dit, l'interface propose alors le lien vers le site. */
export function analyserPodcast(xml, max = 12) {
  const out = [], re = /<item>([\s\S]*?)<\/item>/gi; let m;
  const bloc = (b, tag) => { const x = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i').exec(b); return x ? x[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') : ''; };
  while ((m = re.exec(String(xml || ''))) && out.length < max) {
    const b = m[1], enc = /<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i.exec(b), titre = texteBrut(bloc(b, 'title')); if (!enc || !titre) continue;
    const url = enc[1].replace(/&amp;/g, '&'); if (!/^https?:\/\//.test(url)) continue;
    const t = Date.parse(texteBrut(bloc(b, 'pubDate'))), dur = texteBrut(bloc(b, 'itunes:duration'));
    out.push({ titre: coupe(titre, 160), t: Number.isFinite(t) ? t : null, audio: url, securise: /^https:/.test(url), duree: dureeTexte(dur), resume: coupe(texteBrut(bloc(b, 'description') || bloc(b, 'itunes:summary')), 220), lien: (/^https?:\/\//.test(texteBrut(bloc(b, 'link'))) ? texteBrut(bloc(b, 'link')) : null) });
  }
  return out;
}
export function dureeTexte(d) {
  if (!d) return null; const p = String(d).split(':').map(Number); if (p.some(x => !Number.isFinite(x))) return Number.isFinite(Number(d)) ? dureeTexte(secondes(Number(d))) : null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0]; return secondes(s);
}
const secondes = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + ' h ' + String(m).padStart(2, '0') : m + ' min'; };
/* Wikipédia : événements du jour (« selected ») et « Dans l'actualité » (flux « featured » anglais). */
export function analyserEphemeride(j, langue = 'fr') {
  const l = (j && Array.isArray(j.selected) ? j.selected : []).map(e => ({ annee: e.year, texte: coupe(texteBrut(e.text), 260), pages: (e.pages || []).slice(0, 2).map(p => ({ titre: texteBrut(p.titles && p.titles.normalized || p.title), url: p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page })).filter(p => p.url) }));
  return l.sort((a, b) => (b.annee || 0) - (a.annee || 0)).slice(0, 12).map(x => ({ ...x, langue }));
}
export function analyserActualiteWikipedia(j) {
  return (j && Array.isArray(j.news) ? j.news : []).map(n => ({ texte: coupe(texteBrut(n.story), 300), liens: (n.links || []).slice(0, 3).map(p => ({ titre: texteBrut(p.titles && p.titles.normalized || p.title), url: p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page })).filter(p => p.url) })).filter(x => x.texte);
}
/* Wikinews : fermé ? (l'API le dit elle-même par un dernier article d'annonce) */
export function analyserWikinews(j) {
  const l = j && j.query && Array.isArray(j.query.categorymembers) ? j.query.categorymembers : [];
  const ferme = l.find(x => /closes? Wikinews/i.test(x.title));
  return { ferme: !!ferme, fermeLe: ferme ? Date.parse(ferme.timestamp) : null, derniers: l.map(x => ({ titre: x.title, t: Date.parse(x.timestamp), url: 'https://en.wikinews.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')) })) };
}

/* ── Favoris (liste d'identifiants, bornée) ── */
export function basculerFavori(liste, id, max = 40) { const l = (liste || []).filter(x => typeof x === 'string'); const i = l.indexOf(id); if (i >= 0) { l.splice(i, 1); return l; } l.unshift(id); return l.slice(0, max); }

/* ── Commandes vocales : « montre-moi les séismes », « mets France 24 en direct », « le podcast de la BBC », « que dit l'OMS », « que s'est-il passé un 22 octobre » ── */
const norm = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`'-]/g, ' ').replace(/[?!.,;:«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
export function tvDeLaPhrase(texte) {
  const t = norm(texte); let meilleur = null, taille = 0;
  for (const tv of TELEVISIONS) for (const a of tv.alias) if (a.length > taille && new RegExp('(^| )' + a + '( |$)').test(t)) { meilleur = tv.id; taille = a.length; }
  return meilleur;
}
const ALIAS_COMM = { onu: ['onu', 'nations unies'], oms: ['oms', 'organisation mondiale de la sante'], commission: ['commission europeenne', 'commission'], nasa: ['nasa'], esa: ['esa', 'agence spatiale europeenne'] };   // la BCE est traitée par le hub Finance (« que dit la BCE ? »)
const ALIAS_POD = { bbc_global: ['bbc'], npr_news: ['npr'], dw_europe: ['dw', 'deutsche welle'], cbc_monde: ['cbc', 'radio canada'], inter_8h20: ['france inter', 'invite de 8h20', 'radio france'] };
const idParAlias = (t, table) => { let m = null, n = 0; for (const [id, al] of Object.entries(table)) for (const a of al) if (a.length > n && new RegExp('(^| )' + a + '( |$)').test(t)) { m = id; n = a.length; } return m; };
export function analyserDemandeDirect(texte) {
  const t = norm(texte); if (!t || t.split(' ').length > 14) return null;
  const mois = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const eph = /\b(que s est il passe|qu est ce qui s est passe|evenements? du jour|ce jour la|un (\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)|en ce jour)\b/.exec(t);
  if (eph) { const m = /(\d{1,2}) (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)/.exec(t); return { type: 'ephemeride', jour: m ? +m[1] : null, mois: m ? mois.indexOf(m[2]) + 1 : null }; }
  { const tv = tvDeLaPhrase(texte), mot = /\b(en direct|direct|live|en live)\b/.test(t), verbe = /\b(mets|met|lance|lancer|affiche|passe|regarde|regarder|ouvre)\b/.test(t), gen = /\b(tele|television|chaines? d info|info en continu|infos en continu)\b/.test(t);
    if ((tv && (mot || verbe)) || gen) { if (!/\b(podcasts?|communiques?|derniers? messages|bluesky|mastodon)\b/.test(t)) return { type: 'tv', id: tv }; } }
  if (/\bpodcasts?\b/.test(t) || /\bjournal (de la |de |du )?(bbc|npr|dw|cbc|france inter)\b/.test(t) || /\bun journal audio\b/.test(t)) return { type: 'podcast', id: idParAlias(t, ALIAS_POD) };
  if (/\b(bluesky|blue sky|mastodon|reseaux? sociaux|messages? (de|du|des|d))\b/.test(t) && /\b(afp|reuters|oms|bce|esa|euronews|france 24|le monde|al jazeera|associated press|ap|commission|tagesschau|reseaux? sociaux)\b/.test(t)) return { type: 'social', cible: t };
  if (/\b(communiques?|dit l|disent|publie|annonce|nouvelles? de)\b/.test(t) && idParAlias(t, ALIAS_COMM) && !/\b(fed|reserve federale)\b/.test(t)) return { type: 'communiques', id: idParAlias(t, ALIAS_COMM) };
  if (/\b(communiques? officiels?|communiques? des institutions)\b/.test(t)) return { type: 'communiques', id: null };
  if (/\b(sources? d actualites?|hub des sources|sources en direct|les sources|ouvre les sources|evenements en direct|en direct de la terre)\b/.test(t)) return { type: 'hub' };
  return null;
}
