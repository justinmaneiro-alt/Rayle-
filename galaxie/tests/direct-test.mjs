// Tests des sources en direct (étape N) : événements (USGS, EONET, GDACS), fusion, filtres, communiqués, télévisions, réseaux sociaux vérifiés, podcasts, Wikipédia, favoris, voix, client à réseau factice.
// Lancer :  node galaxie/tests/direct-test.mjs
import * as EV from '../../core/direct/evenements-calcul.js';
import * as SC from '../../core/direct/sources-calcul.js';
import { creerDirect } from '../../core/direct/donnees-direct.js';
import { usgs, eonet, gdacs, communique, podcast, reseauSocial, wikipedia, wikinews } from '../../tests-navigateur/direct-fixtures.mjs';

let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const NOW = Date.now();

/* ── événements ── */
const u = EV.analyserUsgs(JSON.parse(usgs())), e = EV.analyserEonet(JSON.parse(eonet())), g = EV.analyserGdacs(gdacs());
v('USGS : 4 séismes avec position, magnitude, lieu, fiche', u.length === 4 && u.every(x => x.type === 'seisme' && x.lat != null && x.lon != null && x.url) && u[0].mag === 6.4 && u[0].lieu.includes('Taiwan'));
v('USGS : gravité (magnitude + alerte PAGER + tsunami, plafonnée à 4)', u[0].severite === 4 && u[1].severite === 1 && u[2].severite === 0 && u[3].severite === 2 && /tsunami/.test(u[0].raisons.join()));
v('USGS : niveau d’alerte officiel conservé (orange / vert)', u[0].niveau === 'orange' && u[3].niveau === 'vert' && u[1].niveau === null);
v('USGS : séisme sans coordonnées ou sans heure écarté', EV.analyserUsgs({ features: [{ id: 'x', properties: { mag: 5, time: 1 }, geometry: null }, { id: 'y', properties: { mag: 5 }, geometry: { coordinates: [1, 2, 3] } }] }).length === 0 && EV.analyserUsgs(null).length === 0);
v('EONET : tempête (vent en nœuds), incendie (surface en acres), volcan', e.length === 4 && e[0].type === 'tempete' && e[0].severite === 3 && e[1].type === 'incendie' && e[1].severite === 3 && e[3].type === 'volcan' && e[3].severite === 2);
v('EONET : un petit feu (40 acres) = gravité 0 : masqué par défaut, rien d’inventé', e[2].severite === 0 && e[2].raisons.some(r => /acres/.test(r)));
v('EONET : position = dernière position connue', e[0].lat === 20.5 && e[0].lon === 140.2);
v('GDACS : séisme orange, cyclone rouge, inondation verte avec niveaux', g.length === 3 && g[0].type === 'seisme' && g[0].niveau === 'orange' && g[0].severite === 3 && g[1].type === 'tempete' && g[1].severite === 4 && g[2].type === 'inondation' && g[2].severite === 1);
v('GDACS : titres nettoyés (pas de population, couleur retirée devant le type)', !/Population/.test(g[1].titre) && /^earthquake/i.test(g[0].titre) && /magnitude/i.test(g[0].titre) && g[0].mag === 6.3);
const f = EV.fusionnerEvenements([u, e, g]);
v('fusion : le séisme GDACS de Taïwan est repris dans celui de l’USGS (une seule balise, deux sources)', f.filter(x => x.type === 'seisme' && /Taiwan/.test(x.titre + (x.lieu || ''))).length === 1 && f.find(x => x.id === 'usgs:us1').sources.join() === 'USGS,GDACS');
v('fusion : le cyclone vient de EONET ET GDACS : une seule balise au niveau rouge', f.filter(x => x.type === 'tempete').length === 1 && f.find(x => x.type === 'tempete').niveau === 'rouge' && f.find(x => x.type === 'tempete').severite === 4);
v('fusion : tri du plus récent au plus ancien, identifiants uniques', f.every((x, i) => i === 0 || f[i - 1].t >= x.t) && new Set(f.map(x => x.id)).size === f.length);
const fl = EV.filtrerEvenements(f, { types: ['seisme'], severiteMin: 2 });
v('filtres : type et gravité minimale', fl.length >= 2 && fl.every(x => x.type === 'seisme' && x.severite >= 2));
v('filtres : zone géographique (boîte)', EV.filtrerEvenements(f, { bbox: { sud: 20, nord: 26, ouest: 118, est: 123 } }).every(x => x.lat >= 20 && x.lat <= 26));
const vus = new Set();
v('nouveautés : au premier chargement rien n’est « nouveau »', EV.nouveautes(f, vus, true).length === 0 && vus.size === f.length);
v('nouveautés : un événement qui arrive ensuite est signalé une seule fois', (() => { const n = { id: 'usgs:nouveau', t: NOW, severite: 2 }; const a = EV.nouveautes([n, ...f], vus), b = EV.nouveautes([n, ...f], vus); return a.length === 1 && a[0].id === 'usgs:nouveau' && b.length === 0; })());
v('rayon de balise selon la gravité', EV.rayonBalise(0) < EV.rayonBalise(2) && EV.rayonBalise(2) < EV.rayonBalise(4));
v('âge en français', EV.ageTexte(NOW - 30e3, NOW) === 'à l’instant' && EV.ageTexte(NOW - 25 * 60e3, NOW) === 'il y a 25 min' && EV.ageTexte(NOW - 5 * 3600e3, NOW) === 'il y a 5 h' && EV.ageTexte(NOW - 3 * 86400e3, NOW) === 'il y a 3 j');
const ph = EV.phraseEvenements(f, 'seisme', { maintenant: NOW });
v('phrase parlée : nombre, gravité, sources citées, pas de markdown', /séismes en cours/.test(ph) && /source USGS/.test(ph) && !/[*#_]/.test(ph), ph);
v('phrase parlée : rien à signaler = le dit', /Aucun séisme/.test(EV.phraseEvenements([], 'seisme')));
v('voix : types d’événements', EV.typeDeLaPhrase('montre-moi les séismes') === 'seisme' && EV.typeDeLaPhrase('les incendies en cours') === 'incendie' && EV.typeDeLaPhrase('où sont les cyclones') === 'tempete' && EV.typeDeLaPhrase('les catastrophes en cours') === 'tous' && EV.typeDeLaPhrase('quelle heure est-il') === null);
v('couleurs et libellés définis pour chaque type', Object.keys(EV.TYPES).every(k => EV.COULEURS[k]));

/* ── registres ── */
const ids = l => l.map(x => x.id);
v('registres : identifiants uniques', [SC.COMMUNIQUES, SC.PODCASTS, SC.TELEVISIONS].every(l => new Set(ids(l)).size === l.length));
v('registre : 6 communiqués officiels (ONU, OMS, Commission, NASA, ESA, BCE), adresses https, accès valide', SC.COMMUNIQUES.length === 6 && SC.COMMUNIQUES.every(c => /^https:\/\//.test(c.url) && ['navigateur', 'worker'].includes(c.acces)));
v('registre : FMI absent (403) ; flux sans CORS passent par le Worker', !SC.COMMUNIQUES.some(c => /imf/.test(c.url)) && SC.COMMUNIQUES.filter(c => ['onu', 'esa', 'bce_presse'].includes(c.id)).every(c => c.acces === 'worker'));
v('registre : 7 télévisions officielles (France 24 fr/en, Euronews, DW, Al Jazeera, Sky News, NHK)', SC.TELEVISIONS.length === 7 && SC.TELEVISIONS.filter(t => t.lecteur === 'youtube').every(t => /^UC[\w-]{22}$/.test(t.chaine)) && SC.TELEVISIONS.find(t => t.id === 'nhk').lecteur === 'hls');
v('télévisions : lecteurs sans cookies, jamais de lancement automatique ailleurs qu’au clic', /^https:\/\/www\.youtube-nocookie\.com\/embed\/live_stream\?channel=UC/.test(SC.urlLecteurTv(SC.TELEVISIONS[0])) && /\.m3u8$/.test(SC.urlLecteurTv(SC.TELEVISIONS[6])) && /youtube\.com\/channel\/.*\/live/.test(SC.urlPageTv(SC.TELEVISIONS[0])));
v('registre : 5 podcasts de radios publiques', SC.PODCASTS.length === 5 && SC.PODCASTS.every(p => p.radio && /^https:\/\//.test(p.url)));
v('registre : comptes Bluesky vérifiables (domaines des institutions), Mastodon : site vérifié ou instance officielle', SC.COMPTES_BLUESKY.length === 11 && SC.COMPTES_MASTODON.every(c => c.domaine || c.instanceOfficielle));
v('sources écartées documentées (FMI, comptes de fans, Wikinews fermé…)', SC.SOURCES_ECARTEES.some(x => /FMI/.test(x[0])) && SC.SOURCES_ECARTEES.some(x => /Wikinews/.test(x[0]) && /FERMÉ/.test(x[1])) && SC.SOURCES_ECARTEES.some(x => /Mastodon/.test(x[0])));

/* ── analyses ── */
const bs = SC.analyserBluesky(JSON.parse(JSON.parse(JSON.stringify({ x: reseauSocial('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=who.int').corps })).x), { handle: 'who.int', nom: 'OMS' });
v('Bluesky : les republications sont écartées, lien vers le message, auteur', bs.length === 1 && bs[0].url === 'https://bsky.app/profile/who.int/post/3abc1' && /Message officiel/.test(bs[0].texte));
v('Bluesky : compte vérifié = badge « valid » seulement', SC.estVerifieBluesky({ verification: { verifiedStatus: 'valid' } }) && !SC.estVerifieBluesky({}) && !SC.estVerifieBluesky({ verification: { verifiedStatus: 'none' } }) && !SC.estVerifieBluesky(null));
const mt = SC.analyserMastodon(JSON.parse(reseauSocial('https://ard.social/api/v1/accounts/11/statuses').corps), SC.COMPTES_MASTODON[0]);
v('Mastodon : HTML retiré, lien, auteur', mt.length === 1 && mt[0].texte === 'Eilmeldung der tagesschau' && mt[0].url.startsWith('https://ard.social/'));
v('Mastodon : vérifié = lien vérifié OU instance officielle, jamais un compte de fan', SC.estVerifieMastodon(SC.COMPTES_MASTODON[0], { fields: [{ verified_at: '2026-01-01' }] }) && SC.estVerifieMastodon(SC.COMPTES_MASTODON[1], { fields: [] }) && !SC.estVerifieMastodon({ instance: 'mastodon.social', acct: 'nasa' }, { fields: [] }));
const pd = SC.analyserPodcast(podcast('npr_news').corps), pb = SC.analyserPodcast(podcast('bbc_global').corps);
v('podcast : épisodes avec fichier audio, durée, date', pd.length === 3 && pd[0].audio.startsWith('https://') && pd[0].duree === '12 min' && pd[0].t > 0 && pd[0].securise === true);
v('podcast : fichier en http marqué non sécurisé (jouable seulement depuis une page locale)', pb[0].securise === false && /^http:/.test(pb[0].audio));
v('podcast : flux sans fichier audio = rien', SC.analyserPodcast('<rss><channel><item><title>x</title></item></channel></rss>').length === 0 && SC.analyserPodcast('<html>').length === 0);
v('durées : 1:05:30 → 1 h 05, 90 s → 1 min', SC.dureeTexte('01:05:30') === '1 h 05' && SC.dureeTexte('90') === '1 min' && SC.dureeTexte('') === null);
const eph = SC.analyserEphemeride(JSON.parse(wikipedia('https://api.wikimedia.org/feed/v1/wikipedia/fr/onthisday/selected/10/22').corps), 'fr'), act = SC.analyserActualiteWikipedia(JSON.parse(wikipedia('https://api.wikimedia.org/feed/v1/wikipedia/en/featured/2026/10/22').corps));
v('Wikipédia : événements du jour triés du plus récent, avec pages liées', eph.length === 2 && eph[0].annee === 1998 && eph[0].pages[0].url.startsWith('https://fr.wikipedia.org/'));
v('Wikipédia : « Dans l’actualité » sans balises', act.length === 1 && act[0].texte.includes('Hôtel de Ville') && !/<b>/.test(act[0].texte) && act[0].liens[0].url.includes('Limoges'));
const wn = SC.analyserWikinews(JSON.parse(wikinews().corps));
v('Wikinews : détecté FERMÉ (annonce de la Fondation), date, derniers articles archivés', wn.ferme === true && wn.fermeLe === Date.parse('2026-05-03T23:59:05Z') && wn.derniers.length === 2);
v('Wikinews : non fermé si aucune annonce', SC.analyserWikinews({ query: { categorymembers: [{ title: 'Autre', timestamp: '2026-01-01T00:00:00Z' }] } }).ferme === false);
v('favoris : bascule, ordre récent d’abord, borne', (() => { let l = SC.basculerFavori([], 'a'); l = SC.basculerFavori(l, 'b'); const x = l.join(); l = SC.basculerFavori(l, 'a'); return x === 'b,a' && l.join() === 'b' && SC.basculerFavori(Array.from({ length: 40 }, (_, i) => 'x' + i), 'nouveau').length === 40; })());

/* ── voix ── */
const d = t => SC.analyserDemandeDirect(t);
v('voix : « mets France 24 en direct »', (x => x && x.type === 'tv' && x.id === 'f24_fr')(d('mets France 24 en direct')) && d('lance Al Jazeera en direct').id === 'aljazeera' && d('Euronews en direct').id === 'euronews' && d('mets la télé').type === 'tv' && d('mets NHK en direct').id === 'nhk');
v('voix : « France 24 English » distinct de « France 24 »', d('mets France 24 English en direct').id === 'f24_en' && d('mets France 24 en direct').id === 'f24_fr');
v('voix : podcasts', (x => x.type === 'podcast' && x.id === 'bbc_global')(d('un podcast de la BBC')) && d('mets le journal de NPR').id === 'npr_news' && d('un podcast d’info').id === null);
v('voix : communiqués officiels', (x => x.type === 'communiques' && x.id === 'oms')(d('que dit l’OMS')) && d('les communiqués de l’ONU').id === 'onu' && d('les nouvelles de la NASA').id === 'nasa');
v('voix : la Fed et la BCE restent au hub Finance (pas volées)', d('que dit la Fed') === null && d('que dit la BCE') === null);
v('voix : réseaux sociaux', d('que dit l’AFP sur Bluesky').type === 'social' && d('les messages de Reuters sur Bluesky').type === 'social');
v('voix : éphéméride (jour demandé)', (x => x.type === 'ephemeride' && x.jour === 22 && x.mois === 10)(d('que s’est-il passé un 22 octobre')) && d('que s’est-il passé aujourd’hui') === null || d('événements du jour').type === 'ephemeride');
v('voix : hub', d('ouvre les sources en direct').type === 'hub' && d('les sources d’actualités').type === 'hub');
v('voix : phrases étrangères ignorées', d('quelle heure est-il') === null && d('raconte une blague') === null && d('montre-moi l’or en H1') === null);

/* ── client à réseau factice ── */
{
  let appels = 0, panne = false, gdacsAbsent = false;
  const reseau = { workerPret: () => true,
    direct: async (url, { json = false } = {}) => { appels++; if (panne) throw new Error('HTTP 503'); const r = require_(url); if (!r) throw new Error('HTTP 404'); return json ? JSON.parse(r.corps) : r.corps; },
    brut: async id => { appels++; if (id === 'gdacs_24h') { if (gdacsAbsent) throw new Error('HTTP 404 · route inconnue'); return gdacs(); } const r = communique(id) || podcast(id); if (!r) throw new Error('HTTP 404 · source inconnue'); return r.corps; } };
  function require_(url) {
    const h = new URL(url).hostname;
    if (h === 'earthquake.usgs.gov') return { corps: usgs() }; if (h === 'eonet.gsfc.nasa.gov') return { corps: eonet() }; if (h === 'www.who.int') return communique('oms'); if (h === 'ec.europa.eu') return communique('commission'); if (h === 'www.nasa.gov') return communique('nasa');
    if (h === 'podcasts.files.bbci.co.uk') return podcast('bbc_global'); if (h === 'feeds.npr.org') return podcast('npr_news'); if (h === 'rss.dw.com') return podcast('dw_europe'); if (h === 'radiofrance-podcast.net') return podcast('inter_8h20');
    if (h === 'api.wikimedia.org') return wikipedia(url); if (h === 'en.wikinews.org') return wikinews(); return reseauSocial(url);
  }
  let t = NOW; const D = creerDirect({ reseau, maintenant: () => t });
  let r = await D.evenements();
  v('client événements : 3 sources (USGS, EONET, GDACS), fusionnés, RÉEL (un séisme de moins d’une heure)', r.etat === 'ok' && r.etiquette === 'RÉEL' && r.sources.length === 3 && r.sources.every(s => s.etat === 'ok') && r.evenements.length === 9, JSON.stringify([r.etiquette, r.evenements && r.evenements.length]));
  const n = appels; await D.evenements(); v('client : mis en cache (aucun nouvel appel)', appels === n);
  D.vider(); gdacsAbsent = true; r = await D.evenements();
  v('client : GDACS (Worker non déployé) = noté « route du Worker non déployée », USGS et EONET continuent', r.etat === 'ok' && r.sources.find(s => s.id === 'gdacs').etat === 'indisponible' && /non déployée/.test(r.sources.find(s => s.id === 'gdacs').raison) && r.sources.filter(s => s.etat === 'ok').length === 2);
  D.vider(); t += 3600e3 * 6; panne = true; gdacsAbsent = true; r = await D.evenements();
  v('client : toutes les sources en panne, aucune copie = INDISPONIBLE avec les raisons', r.etat === 'indisponible' && /aucune source/.test(r.raison));
  panne = false; D.vider(); r = await D.evenements(); panne = true; t += 10 * 60e3; r = await D.evenements();
  v('client : panne après un succès = dernière copie PÉRIMÉE (datée), jamais inventée', r.etat === 'ok' && r.etiquette === 'PÉRIMÉ' && /injoignable/.test(r.raison) && r.evenements.length > 0);
  panne = false; D.vider();
  r = await D.communiques(); v('client communiqués : 6 flux (3 directs, 3 via le Worker), triés, source citée', r.etat === 'ok' && r.sources.length === 6 && r.items[0].source && r.items.every((x, i) => i === 0 || r.items[i - 1].t >= x.t));
  r = await D.communiques('oms'); v('client communiqués : un seul flux', r.etat === 'ok' && r.items.every(x => x.sourceId === 'oms'));
  r = await D.podcasts('npr_news'); v('client podcast : épisodes, source = la radio', r.etat === 'ok' && r.episodes.length === 3 && /NPR/.test(r.source));
  r = await D.podcasts('inconnu'); v('client podcast : inconnu = INDISPONIBLE', r.etat === 'indisponible');
  r = await D.social();
  v('client réseaux : comptes vérifiés lus (Bluesky + Mastodon), messages triés, plateforme et compte cités', r.etat === 'ok' && r.messages.length >= 5 && r.messages.every(m => m.plateforme && m.compte && m.url) && r.comptes.filter(c => c.etat === 'ok').length === 13, JSON.stringify(r.comptes.filter(c => c.etat !== 'ok')));
  const inv = await D.bluesky({ handle: 'bbcnews.bsky.social', nom: 'BBC' });
  v('client réseaux : un compte NON vérifié n’est jamais affiché', inv.etat === 'indisponible' && /non vérifié/.test(inv.raison));
  r = await D.ephemeride('fr', 22, 10); v('client éphéméride', r.etat === 'ok' && r.jour === 22 && r.mois === 10 && /CC BY-SA/.test(r.source));
  r = await D.wikinews(); v('client Wikinews : statut fermé', r.etat === 'ok' && r.wikinews.ferme === true);
}

console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
