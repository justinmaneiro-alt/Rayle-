import { reseauNavigateur } from '../../planetes/mars/pc/finance/donnees.js';
import { URL_EONET, URL_USGS, analyserEonet, analyserGdacs, analyserUsgs, fusionnerEvenements } from './evenements-calcul.js';
import { COMMUNIQUES, COMPTES_BLUESKY, COMPTES_MASTODON, PODCASTS, URL_BLUESKY, URL_WIKINEWS, URL_WIKIPEDIA, analyserActualiteWikipedia, analyserBluesky, analyserEphemeride, analyserMastodon, analyserPodcast, analyserWikinews, estVerifieBluesky, estVerifieMastodon, urlMastodon } from './sources-calcul.js';
import { analyserRss } from '../../planetes/mars/pc/finance/flux-calcul.js';

/* ═════════════ CLIENT DES SOURCES EN DIRECT (étape N ; tests : direct-test.mjs avec réseau factice, direct-reel.mjs avec le vrai réseau) ═════════════
   Même philosophie que le hub Finance : chaque méthode rend { etat: 'ok' | 'indisponible', etiquette: 'RÉEL' | 'DIFFÉRÉ' | 'PÉRIMÉ' | 'INDISPONIBLE', source, recuLe, voie, … } ; panne = dernière bonne copie PÉRIMÉE ou INDISPONIBLE avec la raison.
   Appels directs du navigateur (USGS, EONET, OMS, Commission, NASA, Bluesky, Mastodon, Wikipédia, podcasts avec CORS) : aucune modification du Worker. Sources sans CORS (GDACS, ONU, ESA, CBC) : route /finance/brut du Worker
   (NON déployée) ; sans elle ces sources sont INDISPONIBLES (dit clairement) et le reste marche. Aucune IA, aucune clé. */
const MIN = 60e3;
export const TTL = { evenements: 2 * MIN, communiques: 5 * MIN, podcasts: 10 * MIN, social: 3 * MIN, ephemeride: 6 * 3600e3, wikinews: 24 * 3600e3 };
const msg = e => String(e && e.message || e).slice(0, 160);
const routeAbsente = m => /route inconnue|404|source inconnue/i.test(m);

export function creerDirect({ reseau = reseauNavigateur(), maintenant = () => Date.now() } = {}) {
  const memoire = new Map();
  async function avecCache(cle, ttl, producteur) {
    const m = memoire.get(cle); if (m && m.v && maintenant() - m.t < ttl) return m.v; if (m && m.enCours) return m.enCours;
    const p = (async () => {
      try { const v = await producteur(); memoire.set(cle, { t: maintenant(), v }); return v; }
      catch (e) {
        if (m && m.v && m.v.etat === 'ok') return { ...m.v, etiquette: 'PÉRIMÉ', perime: true, raison: 'source injoignable (' + msg(e) + ') · copie du ' + new Date(m.v.recuLe || m.t).toLocaleString('fr-FR') };
        return { etat: 'indisponible', etiquette: 'INDISPONIBLE', raison: msg(e), recuLe: null };
      }
    })();
    memoire.set(cle, { ...(m || { t: 0, v: null }), enCours: p }); const v = await p; const e = memoire.get(cle); if (e) delete e.enCours; return v;
  }
  const ok = (extra, etiquette, source, voie) => ({ etat: 'ok', etiquette, source, voie, recuLe: maintenant(), ...extra });
  const texteSource = async (src) => { if (src.acces === 'navigateur') { try { return await reseau.direct(src.url); } catch (e) { return reseau.brut(src.id); } } return reseau.brut(src.id); };

  /* Événements naturels : USGS + EONET (directs) + GDACS (Worker). Chaque source est notée ; au moins une doit répondre. */
  const evenements = () => avecCache('evenements', TTL.evenements, async () => {
    const etatSources = [], listes = [];
    const essai = async (id, nom, f) => { try { const l = await f(); listes.push(l); etatSources.push({ id, nom, etat: 'ok', n: l.length }); } catch (e) { const m = msg(e); etatSources.push({ id, nom, etat: 'indisponible', raison: routeAbsente(m) && id === 'gdacs' ? 'route du Worker non déployée' : m }); } };
    await Promise.all([
      essai('usgs', 'USGS · séismes (24 h)', async () => analyserUsgs(await reseau.direct(URL_USGS.jour, { json: true }))),
      essai('eonet', 'NASA EONET · événements naturels', async () => analyserEonet(await reseau.direct(URL_EONET, { json: true }))),
      essai('gdacs', 'GDACS · alertes de catastrophes', async () => analyserGdacs(await reseau.brut('gdacs_24h')))
    ]);
    if (!listes.length) throw new Error('aucune source d’événements ne répond (' + etatSources.map(s => s.id + ': ' + s.raison).join(' ; ') + ')');
    const evts = fusionnerEvenements(listes), recent = Math.max(0, ...evts.map(e => e.t));
    return ok({ evenements: evts, sources: etatSources }, maintenant() - recent < 3 * 3600e3 ? 'RÉEL' : 'DIFFÉRÉ', 'USGS · NASA EONET · GDACS', 'navigateur+worker');
  });

  /* Communiqués officiels : un flux (id) ou tous. */
  const communiques = (id = null) => avecCache('comm:' + (id || '*'), TTL.communiques, async () => {
    const ids = id ? COMMUNIQUES.filter(c => c.id === id) : COMMUNIQUES, parSource = {}, etatSources = [];
    await Promise.all(ids.map(async c => { try { const items = analyserRss(await texteSource(c), 20); if (!items.length) throw new Error('flux vide ou illisible'); parSource[c.id] = items; etatSources.push({ id: c.id, nom: c.nom, etat: 'ok', n: items.length }); } catch (e) { const m = msg(e); etatSources.push({ id: c.id, nom: c.nom, etat: 'indisponible', raison: routeAbsente(m) ? 'route du Worker non déployée' : m }); } }));
    if (!Object.keys(parSource).length) throw new Error('aucun flux ne répond (' + etatSources.map(s => s.id + ': ' + s.raison).slice(0, 3).join(' ; ') + ')');
    const vus = new Set(), items = [];
    for (const [sid, l] of Object.entries(parSource)) { const c = COMMUNIQUES.find(x => x.id === sid); for (const i of l) { const k = i.url.replace(/[?#].*$/, ''); if (vus.has(k)) continue; vus.add(k); items.push({ ...i, source: c.nom, sourceId: sid, langue: c.langue }); } }
    items.sort((a, b) => (b.t || 0) - (a.t || 0));
    return ok({ items, sources: etatSources }, maintenant() - (items[0] && items[0].t || 0) < 12 * 3600e3 ? 'RÉEL' : 'DIFFÉRÉ', 'Flux officiels (titres, liens)', 'navigateur+worker');
  });

  /* Podcasts d'info : épisodes d'un flux (pas de transcription). */
  const podcasts = id => avecCache('pod:' + id, TTL.podcasts, async () => {
    const p = PODCASTS.find(x => x.id === id); if (!p) throw new Error('podcast inconnu');
    const eps = analyserPodcast(await texteSource(p), 10); if (!eps.length) throw new Error('aucun épisode lisible');
    return ok({ podcast: p, episodes: eps }, maintenant() - (eps[0].t || 0) < 24 * 3600e3 ? 'RÉEL' : 'DIFFÉRÉ', p.radio, 'navigateur+worker');
  });

  /* Réseaux sociaux publics VÉRIFIÉS : on vérifie le compte avant d'afficher ses messages. */
  const bluesky = compte => avecCache('bsky:' + compte.handle, TTL.social, async () => {
    const profil = await reseau.direct(URL_BLUESKY.profil(compte.handle), { json: true });
    if (!estVerifieBluesky(profil)) return { etat: 'indisponible', etiquette: 'INDISPONIBLE', raison: 'compte non vérifié : non affiché', recuLe: null };
    const msgs = analyserBluesky(await reseau.direct(URL_BLUESKY.flux(compte.handle, 8), { json: true }), compte);
    return ok({ compte, profil: { nom: profil.displayName, abonnes: profil.followersCount }, messages: msgs, verifie: true }, msgs[0] && maintenant() - (msgs[0].t || 0) < 6 * 3600e3 ? 'RÉEL' : 'DIFFÉRÉ', 'Bluesky · compte vérifié', 'navigateur');
  });
  const mastodon = compte => avecCache('masto:' + compte.instance + compte.acct, TTL.social, async () => {
    const profil = await reseau.direct(urlMastodon.compte(compte), { json: true });
    if (!estVerifieMastodon(compte, profil)) return { etat: 'indisponible', etiquette: 'INDISPONIBLE', raison: 'compte non vérifié : non affiché', recuLe: null };
    const msgs = analyserMastodon(await reseau.direct(urlMastodon.statuts(compte, profil.id, 8), { json: true }), compte);
    return ok({ compte, profil: { nom: profil.display_name, abonnes: profil.followers_count }, messages: msgs, verifie: true }, msgs[0] && maintenant() - (msgs[0].t || 0) < 12 * 3600e3 ? 'RÉEL' : 'DIFFÉRÉ', 'Mastodon · ' + (compte.instanceOfficielle ? 'instance officielle' : 'site vérifié'), 'navigateur');
  });
  const social = () => avecCache('social:*', TTL.social, async () => {
    const res = await Promise.all([...COMPTES_BLUESKY.map(c => bluesky(c).then(r => ({ r, c, plateforme: 'Bluesky' }))), ...COMPTES_MASTODON.map(c => mastodon(c).then(r => ({ r, c, plateforme: 'Mastodon' })))]);
    const okR = res.filter(x => x.r.etat === 'ok'); if (!okR.length) throw new Error('aucun compte ne répond');
    const messages = okR.flatMap(x => x.r.messages.slice(0, 4).map(m => ({ ...m, plateforme: x.plateforme, compte: x.c.nom }))).sort((a, b) => (b.t || 0) - (a.t || 0));
    return ok({ messages, comptes: res.map(x => ({ nom: x.c.nom, plateforme: x.plateforme, etat: x.r.etat, raison: x.r.raison })) }, 'RÉEL', 'Comptes publics vérifiés (Bluesky, Mastodon)', 'navigateur');
  });

  /* Wikipédia : événements du jour et « Dans l'actualité » ; Wikinews : statut (fermé). */
  const ephemeride = (langue = 'fr', jour = null, mois = null) => { const d = new Date(maintenant()), m = mois || d.getUTCMonth() + 1, j = jour || d.getUTCDate(); return avecCache('eph:' + langue + m + '-' + j, TTL.ephemeride, async () => { const evts = analyserEphemeride(await reseau.direct(URL_WIKIPEDIA.jour(langue, m, j), { json: true }), langue); if (!evts.length) throw new Error('aucun événement'); return ok({ jour: j, mois: m, evenements: evts }, 'DIFFÉRÉ', 'Wikipédia (' + langue + ') · CC BY-SA', 'navigateur'); }); };
  const actualiteWikipedia = () => avecCache('wp-actu', TTL.communiques, async () => { const d = new Date(maintenant()), n = analyserActualiteWikipedia(await reseau.direct(URL_WIKIPEDIA.actualite(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), { json: true })); if (!n.length) throw new Error('rubrique vide'); return ok({ nouvelles: n }, 'RÉEL', 'Wikipédia · « Dans l’actualité » · CC BY-SA', 'navigateur'); });
  const wikinews = () => avecCache('wikinews', TTL.wikinews, async () => ok({ wikinews: analyserWikinews(await reseau.direct(URL_WIKINEWS, { json: true })) }, 'DIFFÉRÉ', 'Wikinews (API)', 'navigateur'));

  return { evenements, communiques, podcasts, bluesky, mastodon, social, ephemeride, actualiteWikipedia, wikinews, vider: () => memoire.clear() };
}
let unique = null;
export const obtenirDirect = () => unique || (unique = creerDirect({}));
export const remplacerDirect = c => { unique = c; };
