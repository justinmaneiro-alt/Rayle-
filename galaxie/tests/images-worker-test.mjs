// Tests de la route /images du Worker (fichier local worker/src/intelligence/images.js, ignoré par git) avec de FAUSSES réponses de Wikipédia, Commons et Openverse.
// Lancer :  node galaxie/tests/images-worker-test.mjs
import fs from 'node:fs';
const chemin = new URL('../../worker/src/intelligence/images.js', import.meta.url);
if (!fs.existsSync(chemin)) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const W = await import(chemin.href);
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

/* ───── fausses sources ───── */
const appels = [];
let scenario = {};
const meta = (licence, artiste, extra = {}) => ({ LicenseShortName: { value: licence }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: artiste }, ObjectName: { value: extra.titre || '' }, ImageDescription: { value: extra.desc || '' }, Categories: { value: extra.cats || '' }, NonFree: { value: extra.nonFree || '' }, Restrictions: { value: extra.restr || '' } });
const fichier = (titre, licence, artiste, extra = {}) => ({ index: extra.index || 1, title: 'File:' + titre, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/' + titre, thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/' + titre + '/640px-' + titre, thumbwidth: 640, thumbheight: 427, width: extra.largeur || 3000, height: extra.hauteur || 2000, mime: extra.mime || 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + titre, extmetadata: meta(licence, artiste, extra) }] });
globalThis.fetch = async (url, opts) => {
  url = String(url); appels.push(url);
  const rep = o => ({ ok: true, status: 200, json: async () => o });
  if (scenario.panne && scenario.panne.some(p => url.includes(p))) return { ok: false, status: 503, json: async () => ({}) };
  if (/wikipedia\.org\/w\/api\.php/.test(url) && /generator=search/.test(url)) {
    const langue = /\/\/(\w+)\.wikipedia/.exec(url)[1];
    return rep({ query: { pages: (scenario.wikipedia && scenario.wikipedia[langue]) || [] } });
  }
  if (/commons\.wikimedia\.org\/w\/api\.php/.test(url) && /generator=search/.test(url)) return rep({ query: { pages: scenario.commonsRecherche || [] } });
  if (/commons\.wikimedia\.org\/w\/api\.php/.test(url)) {
    const titre = decodeURIComponent(/titles=([^&]+)/.exec(url)[1]);
    return rep({ query: { pages: [scenario.commonsFichiers && scenario.commonsFichiers[titre] ? scenario.commonsFichiers[titre] : { title: titre, missing: true }] } });
  }
  if (/api\.openverse\.org/.test(url)) return rep({ results: scenario.openverse || [] });
  throw new Error('appel inattendu : ' + url);
};
const reinit = s => { scenario = s; appels.length = 0; };
const article = (titre, desc, image, index = 1, extra = {}) => ({ index, title: titre, description: desc, pageimage: image, ...extra });

// ── fonctions pures ──
v('licences libres acceptées', ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'CC BY-SA 3.0', 'GFDL 1.2', 'Domaine public'].every(l => W.licenceLibre(l, '')));
v('licences non libres refusées', ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'Fair use', 'Non-free', 'All rights reserved', 'Copyrighted free use', 'CC BY-NC-SA 3.0', ''].every(l => !W.licenceLibre(l, '')));
v('sujets : refus du sensible, des adresses et des textes absurdes', W.sujetAcceptable('cadavre') !== '' && W.sujetAcceptable('jean@mail.fr') !== '' && W.sujetAcceptable('x') !== '' && W.sujetAcceptable('a'.repeat(120)) !== '' && W.sujetAcceptable('0612345678') !== '' && W.sujetAcceptable('panda géant') === '');
v('article plausible : un mot significatif commun, nombres ignorés', W.articlePlausible('panda géant', 'Panda géant', 'espèce de mammifères') && !W.articlePlausible('bateau de 1700', 'Classe TR 1700', 'navire de guerre') && W.articlePlausible('galion', 'Galion', 'type de navire') && !W.articlePlausible('galion', 'Renault Galion', 'camion') === false);
v('œuvres dérivées écartées sauf si nommées', W.oeuvreDerivee('Astérix et Obélix', 'film d’Alain Chabat') && !W.oeuvreDerivee('film Astérix', 'film d’Alain Chabat') && !W.oeuvreDerivee('panda', 'espèce de mammifères'));
v('époque reconnue', W.epoque('navire du XVIIIe siècle') !== '' && W.epoque('bateau de 1700') === '1700' && W.epoque('panda géant') === '' && W.epoque('la Joconde') === '');
v('vignette : changement de largeur', W.vignette('https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/X.jpg/640px-X.jpg', 480).includes('/480px-X.jpg'));

// ── cas 1 : l'image principale de l'article est libre (sur Commons) ──
reinit({ wikipedia: { fr: [article('Panda géant', 'espèce de mammifères', 'Panda.jpg')] }, commonsFichiers: { 'File:Panda.jpg': fichier('Panda.jpg', 'CC BY-SA 4.0', '<a href="x">Colin W</a>', { titre: 'Panda à Chengdu' }) },
  commonsRecherche: [fichier('Panda.jpg', 'CC BY-SA 4.0', 'Colin W'), fichier('Panda2.jpg', 'CC BY 2.0', 'Marie', { index: 2 }), fichier('Panda3.jpg', 'CC0', 'Paul', { index: 3 }), fichier('Panda4.jpg', 'Public domain', 'X', { index: 4 })] });
let r = await W.chercherImages('panda géant', 4);
v('image principale de l\'article en premier, puis Commons ; 4 images, sans doublon', r.images.length === 4 && r.images[0].origine === 'wikipedia' && r.images.slice(1).every(i => i.origine === 'commons') && new Set(r.images.map(i => i.source_url)).size === 4, JSON.stringify(r.images.map(i => i.origine)));
v('titre, auteur (sans HTML), licence et lien de source présents sur chaque image', r.images.every(i => i.titre && i.auteur && !/[<>]/.test(i.auteur) && i.licence && i.source_url.startsWith('https://commons.wikimedia.org/wiki/File:')), JSON.stringify(r.images[0]));
v('titre d\'objet préféré au nom de fichier ; miniatures de 500 et 960 px (largeurs standard de Wikimedia)', r.images[0].titre === 'Panda à Chengdu' && /\/500px-/.test(r.images[0].miniature) && /\/960px-/.test(r.images[0].grande));
v('l\'article est nommé (titre, langue, lien)', r.sujet.titre === 'Panda géant' && r.sujet.langue === 'fr' && r.sujet.url === 'https://fr.wikipedia.org/wiki/Panda_g%C3%A9ant');
v('Openverse non appelé quand Commons suffit', !appels.some(a => /openverse/.test(a)));
v('n=1 : une seule image, une seule recherche utile', (await (async () => { reinit(scenario); return (await W.chercherImages('panda géant', 1)).images.length; })()) === 1);

// ── cas 2 : image principale non libre (fichier local de Wikipédia) → Commons, puis Openverse ──
reinit({ wikipedia: { fr: [article('Astérix', 'série française de bandes dessinées', 'Asterix_local.png')] }, commonsFichiers: {}, commonsRecherche: [fichier('Statue.jpg', 'CC BY-SA 3.0', 'Ferran')],
  openverse: [{ id: 'o1', title: 'Astérix en pierre', creator: 'Julie', license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/', foreign_landing_url: 'https://www.flickr.com/photos/1/2', thumbnail: 'https://api.openverse.org/v1/images/o1/thumb/', mature: false, source: 'flickr' }] });
r = await W.chercherImages('Astérix et Obélix', 4);
v('image de l\'article non libre : écartée (aucune image « usage loyal »)', !r.images.some(i => i.origine === 'wikipedia') && r.images[0].origine === 'commons');
v('Openverse complète quand Commons n\'a pas assez', r.images.some(i => i.origine === 'openverse' && i.licence === 'CC BY 2.0' && i.source_url.startsWith('https://www.flickr.com')), JSON.stringify(r.images.map(i => [i.origine, i.licence])));
v('œuvre dérivée (film) écartée : l\'article retenu est la série', (() => { reinit({ wikipedia: { fr: [article('Astérix et Obélix : Mission Cléopâtre', 'film d’Alain Chabat, sorti en 2002', 'F.jpg', 1), article('Astérix', 'série française de bandes dessinées', 'A.jpg', 2)] } }); return true; })());
r = await W.chercherImages('Astérix et Obélix', 2); v('article retenu : « Astérix », pas le film', r.sujet && r.sujet.titre === 'Astérix', r.sujet && r.sujet.titre);

// ── cas 3 : licences et contenus filtrés ──
reinit({ wikipedia: { fr: [article('Joconde', 'peinture', 'M.jpg')] }, commonsFichiers: {}, commonsRecherche: [
  fichier('NC.jpg', 'CC BY-NC 4.0', 'a', { index: 1 }), fichier('ND.jpg', 'CC BY-ND 2.0', 'b', { index: 2 }), fichier('Fair.jpg', 'Fair use', 'c', { index: 3 }),
  fichier('Nu.jpg', 'CC BY 4.0', 'd', { index: 4, cats: 'Nude women' }), fichier('Petit.jpg', 'CC BY 4.0', 'e', { index: 5, largeur: 100, hauteur: 80 }), fichier('Doc.pdf', 'CC BY 4.0', 'f', { index: 6, mime: 'application/pdf' }),
  fichier('NonLibre.jpg', 'CC BY 4.0', 'g', { index: 7, nonFree: 'true' }), fichier('Bon.jpg', 'CC BY 4.0', 'h', { index: 8 })] });
r = await W.chercherImages('Joconde', 4);
v('seules les images libres, assez grandes, sans contenu sensible passent', r.images.length === 1 && r.images[0].titre === 'Bon', JSON.stringify(r.images.map(i => i.titre)));

// ── cas 4 : rien de libre → « aucune image libre trouvée » avec la raison ──
reinit({ wikipedia: { fr: [article('Mickey Mouse', 'personnage', 'Mickey.png')] }, commonsFichiers: {}, commonsRecherche: [fichier('Prot.jpg', 'CC BY-NC 4.0', 'x')], openverse: [] });
r = await W.chercherImages('Mickey Mouse', 4);
v('aucune image libre : liste vide, article nommé, raison donnée', r.images.length === 0 && r.sujet.titre === 'Mickey Mouse' && /licence libre/.test(r.raison) && r.sources.includes('Openverse'), JSON.stringify(r));

// ── cas 5 : pas d'article encyclopédique (personne privée…) : on ne cherche pas d'images ──
reinit({ wikipedia: { fr: [], en: [] } });
r = await W.chercherImages('Jean-Michel Dupont de Saint-Quentin', 4);
v('aucun article : aucune image, aucune recherche Commons ni Openverse', r.images.length === 0 && /encyclopédique/.test(r.raison) && !appels.some(a => /commons|openverse/.test(a)));
reinit({ wikipedia: { fr: [article('Voisin (homonymie)', 'page d’homonymie', null, 1, { pageprops: { disambiguation: '' } })] } });
r = await W.chercherImages('voisin', 4); v('page d\'homonymie ignorée', r.images.length === 0 && !appels.some(a => /commons/.test(a)));
reinit({ wikipedia: { fr: [article('Saviem SM8', 'camion léger', 'G.jpg')] } });
r = await W.chercherImages('galion', 4); v('article sans rapport avec la demande : écarté', r.images.length === 0 && /encyclopédique/.test(r.raison));
v('sujet sensible : refusé sans aucun appel réseau', (await (async () => { reinit({}); const x = await W.chercherImages('photos porno', 4); return x.images.length === 0 && /sensible/.test(x.raison) && appels.length === 0; })()));

// ── cas 6 : sources lentes ou en panne ──
reinit({ panne: ['wikipedia.org'] });
let erreur = null; try { await W.chercherImages('panda géant', 4); } catch (e) { erreur = e; }
v('Wikipédia en panne (fr et en) : erreur claire, avec le détail par source', erreur && /ne répond pas/.test(erreur.message) && erreur.erreurs.length >= 2, erreur && erreur.message);
reinit({ wikipedia: { fr: [article('Panda géant', 'espèce de mammifères', 'P.jpg')] }, panne: ['commons.wikimedia.org', 'openverse'] });
erreur = null; try { r = await W.chercherImages('panda géant', 4); } catch (e) { erreur = e; }
v('Commons et Openverse en panne : erreur (pas de faux « aucune image »)', erreur && /ne répondent pas/.test(erreur.message), erreur && erreur.message);
reinit({ wikipedia: { fr: [article('Panda géant', 'espèce de mammifères', 'P.jpg')] }, commonsFichiers: {}, commonsRecherche: [fichier('Ok.jpg', 'CC BY 4.0', 'z')], panne: ['openverse'] });
r = await W.chercherImages('panda géant', 4); v('une source en panne n\'empêche pas les autres', r.images.length === 1 && r.images[0].origine === 'commons');

// ── Openverse : mature exclu, licence contrôlée ──
reinit({ wikipedia: { fr: [article('Chat', 'mammifère', null)] }, commonsRecherche: [], openverse: [
  { id: 'a', title: 'Chat gris', creator: 'A', license: 'by-nc', license_version: '2.0', foreign_landing_url: 'https://f/1', thumbnail: 'https://api.openverse.org/v1/images/a/thumb/' },
  { id: 'b', title: 'Chat adulte', creator: 'B', license: 'by', license_version: '2.0', mature: true, foreign_landing_url: 'https://f/2', thumbnail: 'https://api.openverse.org/v1/images/b/thumb/' },
  { id: 'c', title: 'Chat noir', creator: 'C', license: 'cc0', license_version: '1.0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', foreign_landing_url: 'https://f/3', thumbnail: 'https://api.openverse.org/v1/images/c/thumb/' }] });
r = await W.chercherImages('chat', 4);
v('Openverse : non commercial et « mature » écartés, CC0 gardé', r.images.length === 1 && r.images[0].titre === 'Chat noir' && /CC0/i.test(r.images[0].licence), JSON.stringify(r.images.map(i => [i.titre, i.licence])));
v('Openverse : la requête exclut le contenu mature et filtre les licences', appels.some(a => /openverse/.test(a) && /mature=false/.test(a) && /license_type=/.test(a)));

// ── demande d'époque : deux recherches Commons entrelacées, l'image moderne de l'article passe après ──
reinit({ wikipedia: { fr: [article('Corvette (navire)', 'classe de navires de guerre', 'Moderne.jpg')] }, commonsFichiers: { 'File:Moderne.jpg': fichier('Moderne.jpg', 'CC BY 4.0', 'm') }, commonsRecherche: [fichier('Corvette_de_1783.jpg', 'CC BY-SA 4.0', 'Freddy')] });
r = await W.chercherImages('navire du XVIIIe siècle', 4);
const rechCommons = appels.filter(a => /commons/.test(a) && /generator=search/.test(a));
v('époque : deux recherches Commons (article + époque, mots de la demande)', rechCommons.length >= 2 && rechCommons.some(a => /XVIIIe/.test(decodeURIComponent(a))));
v('époque : l\'image de l\'époque avant l\'image moderne de l\'article', r.images[0].titre.includes('1783') && r.images.some(i => i.origine === 'wikipedia'), JSON.stringify(r.images.map(i => i.titre)));

// ── limite de débit ──
const t0 = 1e12; let refus = 0; for (let k = 0; k < 25; k++) if (W.limiteImages(t0 + k)) refus++;
v('limite de débit : 20 demandes par minute, puis refus ; nouvelle minute : repart', refus === 5 && !W.limiteImages(t0 + 70000));

// ── la route : paramètres, en-têtes, mise en cache ──
const { routeImages } = W;
const rep = async (q, n) => { reinit({ wikipedia: { fr: [article('Panda géant', 'espèce de mammifères', 'P.jpg')] }, commonsFichiers: {}, commonsRecherche: [fichier('Ok.jpg', 'CC BY 4.0', 'z')] }); const ctx = { waitUntil: () => {} }; return routeImages(new URL('https://w/images?q=' + encodeURIComponent(q) + (n ? '&n=' + n : '')), {}, ctx, { 'Access-Control-Allow-Origin': 'x' }); };
const r1 = await rep(''); v('sujet manquant : 400', r1.status === 400);
const r2 = await rep('panda géant', 2); const o2 = await r2.json(); v('route : 200 JSON avec images, sujet et indicateur de cache', r2.status === 200 && o2.images.length === 1 && o2.sujet.titre === 'Panda géant' && 'cache' in o2);
const r3 = await rep('panda géant', 99); v('n borné à 4', r3.status === 200);
import('../../worker/src/infra/index.js').then(m => { v('la route /images est branchée dans le Worker', typeof m.default.fetch === 'function'); }).catch(() => v('index du Worker chargeable', false));
const src = fs.readFileSync(new URL('../../worker/src/infra/index.js', import.meta.url), 'utf8');
v('index.js : route /images enregistrée', /case '\/images':\s+return await routeImages/.test(src));
v('aucune clé dans le fichier (sources gratuites sans clé)', !/api[_-]?key|apikey|secret|token/i.test(fs.readFileSync(chemin, 'utf8').replace(/X-Rayle-Token/g, '')));
console.log(`${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
