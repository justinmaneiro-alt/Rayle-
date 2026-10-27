import { obtenirDirect } from './donnees-direct.js';
import { COULEURS, NIVEAUX, TYPES, ageTexte, filtrerEvenements } from './evenements-calcul.js';
import { COMMUNIQUES, COMPTES_BLUESKY, COMPTES_MASTODON, PODCASTS, SOURCES_ECARTEES, TELEVISIONS, basculerFavori, urlLecteurTv, urlPageTv } from './sources-calcul.js';

/* ═════════════ HUB « SOURCES EN DIRECT » (étape N) ═════════════
   Une grande fenêtre holographique à six onglets : Événements (séismes, catastrophes, incendies, tempêtes), Communiqués officiels, Télévisions en direct, Réseaux sociaux publics vérifiés, Podcasts d'info, Aujourd'hui (Wikipédia).
   Filtres par type et par gravité, FAVORIS (étoiles, mémorisés sur l'appareil), état de chaque source (RÉEL / DIFFÉRÉ / PÉRIMÉ / INDISPONIBLE avec la raison). Télévisions et podcasts : lecture SEULEMENT au clic.
   Rien n'est inventé ; titres, courts extraits et liens seulement ; aucun contenu payant n'est contourné. Mode léger : aucun rafraîchissement automatique. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLE_FAV = 'rayle_direct_favoris';
const lireFav = () => { try { const l = JSON.parse(localStorage.getItem(CLE_FAV) || '[]'); return Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; } catch (e) { return []; } };
const ecrireFav = l => { try { localStorage.setItem(CLE_FAV, JSON.stringify(l)); } catch (e) { /* stockage interdit */ } };
const quand = t => (t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '');
const badge = e => '<em class="dx-et dx-' + ({ 'RÉEL': 'ok', 'DIFFÉRÉ': 'info', 'PÉRIMÉ': 'att', 'INDISPONIBLE': 'ko' }[e] || 'info') + '">' + esc(e) + '</em>';
const etat = r => '<div class="dx-etat">' + badge(r.etiquette) + ' <span>' + (r.etat === 'ok' ? esc(r.source || '') + ' · reçu ' + esc(quand(r.recuLe)) : 'INDISPONIBLE : ' + esc(r.raison || 'pas de réponse')) + (r.perime && r.raison ? ' · ' + esc(r.raison) : '') + '</span></div>';
const etoile = (id, fav) => '<button type="button" class="dx-etoile' + (fav.includes(id) ? ' on' : '') + '" data-fav="' + esc(id) + '" title="' + (fav.includes(id) ? 'Retirer des favoris' : 'Ajouter aux favoris') + '">' + (fav.includes(id) ? '★' : '☆') + '</button>';
const sources = l => (l && l.length ? '<div class="dx-sources">Sources : ' + l.map(s => '<span class="' + (s.etat === 'ok' ? 'ok' : 'ko') + '" title="' + esc(s.raison || '') + '">' + esc(s.nom) + (s.etat === 'ok' ? '' : ' · ' + esc(s.raison || 'indisponible')) + '</span>').join(' · ') + '</div>' : '');
const ICONE_TYPE = { seisme: '〰', incendie: '🔥', tempete: '🌀', volcan: '🌋', inondation: '🌊', secheresse: '☀', autre: '⚠' };

export const ONGLETS = [['evenements', 'Événements'], ['communiques', 'Communiqués'], ['tv', 'Télévisions'], ['social', 'Réseaux'], ['podcasts', 'Podcasts'], ['aujourdhui', 'Aujourd’hui']];

export function construireHub(conteneur, { onglet = 'evenements', surTerre = null, leger = false } = {}) {
  const D = obtenirDirect();
  let fav = lireFav(), courant = ONGLETS.some(o => o[0] === onglet) ? onglet : 'evenements', seulementFav = false, enCours = 0, nettoyages = [];
  const f = { types: new Set(['seisme', 'incendie', 'tempete', 'volcan', 'inondation']), severiteMin: 1, source: null, podcast: PODCASTS[0].id };
  conteneur.classList.add('dx-hub');
  conteneur.innerHTML = '<div class="dx-onglets"></div><div class="dx-outils"><label class="dx-fav-case"><input type="checkbox" data-fav-seul> ★ Favoris seulement</label><span class="dx-info">Titres, extraits et liens seulement · lecture des vidéos et des sons au clic</span></div><div class="dx-corps"></div>';
  const barre = conteneur.querySelector('.dx-onglets'), corps = conteneur.querySelector('.dx-corps');
  barre.innerHTML = ONGLETS.map(([id, nom]) => '<button type="button" class="dx-onglet' + (id === courant ? ' actif' : '') + '" data-onglet="' + id + '">' + esc(nom) + '</button>').join('');
  const arreter = () => { for (const n of nettoyages.splice(0)) { try { n(); } catch (e) { /* déjà arrêté */ } } };

  async function rendre() {
    const mon = ++enCours; arreter(); corps.innerHTML = '<p class="dx-vide">Chargement…</p>';
    let h = '';
    try {
      if (courant === 'evenements') h = await vueEvenements(); else if (courant === 'communiques') h = await vueCommuniques(); else if (courant === 'tv') h = vueTv();
      else if (courant === 'social') h = await vueSocial(); else if (courant === 'podcasts') h = await vuePodcasts(); else h = await vueAujourdhui();
    } catch (e) { h = '<p class="dx-vide ko">INDISPONIBLE : ' + esc(e && e.message || e) + '</p>'; }
    if (mon !== enCours || !conteneur.isConnected) return; corps.innerHTML = h;
  }

  async function vueEvenements() {
    const r = await D.evenements();
    let h = '<div class="dx-barre">' + Object.keys(TYPES).filter(k => !['autre', 'secheresse'].includes(k)).map(k => '<button type="button" class="dx-chip' + (f.types.has(k) ? ' actif' : '') + '" data-type="' + k + '" style="--c:' + COULEURS[k] + '">' + esc(TYPES[k]) + '</button>').join('')
      + ' <span class="dx-sep">│</span> ' + [[1, 'Modérés +'], [3, 'Majeurs'], [0, 'Tout']].map(([k, l]) => '<button type="button" class="dx-chip' + (f.severiteMin === k ? ' actif' : '') + '" data-grav="' + k + '">' + l + '</button>').join('') + '</div>' + etat(r);
    if (r.etat !== 'ok') return h + '<div class="dx-pied">Sources : séismes USGS, catastrophes GDACS (ONU / Commission européenne), événements naturels NASA EONET. Gratuit, sans clé.</div>';
    let l = filtrerEvenements(r.evenements, { types: [...f.types], severiteMin: f.severiteMin }).sort((a, b) => b.severite - a.severite || b.t - a.t);
    if (seulementFav) l = l.filter(e => fav.includes('evt:' + e.type));
    h += '<div class="dx-compte">' + l.length + ' événements · ' + l.filter(e => e.severite >= 3).length + ' de gravité forte ou majeure</div><ul class="dx-liste">'
      + l.slice(0, 60).map(e => '<li class="g' + e.severite + '" style="--c:' + COULEURS[e.type] + '"><span class="dx-ic">' + ICONE_TYPE[e.type] + '</span><div><b>' + esc(e.titre) + '</b><small> · ' + esc(ageTexte(e.t)) + ' · ' + esc(NIVEAUX[e.severite]) + (e.niveau ? ' · niveau ' + esc(e.niveau) : '') + ' · ' + esc(e.sources ? e.sources.join(' + ') : e.source) + '</small>'
        + '<small class="dx-raisons">gravité : ' + esc((e.raisons || []).join(' ; ')) + '</small></div><span class="dx-act">' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">fiche</a>' : '') + (surTerre ? ' <button type="button" class="dx-btn" data-terre="' + esc(e.id) + '">Voir sur la Terre</button>' : '') + etoile('evt:' + e.type, fav) + '</span></li>').join('') + '</ul>'
      + sources(r.sources);
    return h + '<div class="dx-pied">Gravité : échelle indicative calculée par Rayle (magnitude, niveau d’alerte, surface, vent) — pas une mesure officielle. La première estimation d’un séisme peut être révisée. L’étoile suit un TYPE d’événement.</div>';
  }
  async function vueCommuniques() {
    const r = await D.communiques();
    let h = '<div class="dx-barre"><button type="button" class="dx-chip' + (!f.source ? ' actif' : '') + '" data-source="">Toutes</button>' + COMMUNIQUES.map(c => '<button type="button" class="dx-chip' + (f.source === c.id ? ' actif' : '') + '" data-source="' + c.id + '">' + esc(c.nom.split(' · ')[0]) + '</button>').join('') + '</div>' + etat(r);
    if (r.etat !== 'ok') return h;
    let l = r.items.filter(i => (!f.source || i.sourceId === f.source) && (!seulementFav || fav.includes('src:' + i.sourceId)));
    h += '<div class="dx-compte">' + l.length + ' communiqués officiels</div><ul class="dx-liste">' + l.slice(0, 50).map(i => '<li><div><a href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(i.titre) + '</b></a><small> · ' + esc(i.source) + ' · ' + esc(quand(i.t)) + (i.langue ? ' · ' + esc(i.langue) : '') + ' · <em class="dx-off">SOURCE OFFICIELLE</em></small>' + (i.resume ? '<small class="dx-raisons">' + esc(i.resume) + '</small>' : '') + '</div><span class="dx-act">' + etoile('src:' + i.sourceId, fav) + '</span></li>').join('') + '</ul>' + sources(r.sources);
    return h + '<div class="dx-pied">Communiqués de l’ONU, de l’OMS, de la Commission européenne, de la NASA, de l’ESA et de la BCE. Titres et courts extraits ; le texte reste chez l’émetteur. FMI : accès refusé par le site (non utilisé).</div>';
  }
  function vueTv() {
    const l = TELEVISIONS.filter(t => !seulementFav || fav.includes('tv:' + t.id));
    return '<div class="dx-avert">Les vidéos ne démarrent <b>qu’au clic</b>. Chaînes officielles qui autorisent l’intégration (lecteur YouTube sans cookies ; NHK : flux officiel). Aucune capture ni enregistrement. Si une chaîne n’est pas en direct à cet instant, le lecteur l’indique.</div><div class="dx-tvs">'
      + l.map(t => '<div class="dx-tv" data-tv="' + t.id + '"><div class="dx-tv-tete"><b>' + esc(t.nom) + '</b><small>' + esc(t.langue.toUpperCase()) + '</small>' + etoile('tv:' + t.id, fav) + '</div><div class="dx-tv-ecran"><button type="button" class="dx-btn gros" data-lancer-tv="' + t.id + '">▶ Lancer le direct</button></div><div class="dx-tv-pied"><a href="' + esc(urlPageTv(t)) + '" target="_blank" rel="noopener noreferrer">ouvrir sur le site officiel</a></div></div>').join('') + '</div>'
      + '<div class="dx-pied">Lecteur : YouTube (chaînes officielles) et hls.js (Apache-2.0) pour NHK WORLD-JAPAN. ' + (leger ? 'Mode léger : un seul lecteur à la fois.' : '') + '</div>';
  }
  async function vueSocial() {
    const r = await D.social();
    let h = etat(r); if (r.etat !== 'ok') return h;
    const comptes = r.comptes, ok = comptes.filter(c => c.etat === 'ok');
    let l = r.messages.filter(m => !seulementFav || fav.includes('soc:' + m.compte));
    h += '<div class="dx-compte">' + ok.length + ' comptes vérifiés lus sur ' + comptes.length + ' · ' + l.length + ' messages</div><ul class="dx-liste">' + l.slice(0, 50).map(m => '<li><div><a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer"><b>' + esc(m.compte) + '</b></a> <small>· ' + esc(m.plateforme) + ' · ' + esc(quand(m.t)) + ' · <em class="dx-off">COMPTE VÉRIFIÉ</em></small><p>' + esc(m.texte) + '</p></div><span class="dx-act">' + etoile('soc:' + m.compte, fav) + '</span></li>').join('') + '</ul>';
    return h + '<div class="dx-sources">Comptes : ' + comptes.map(c => '<span class="' + (c.etat === 'ok' ? 'ok' : 'ko') + '" title="' + esc(c.raison || '') + '">' + esc(c.nom) + ' (' + esc(c.plateforme) + ')' + (c.etat === 'ok' ? '' : ' · ' + esc(c.raison || 'indisponible')) + '</span>').join(' · ') + '</div>'
      + '<div class="dx-pied">Seuls des comptes publics VÉRIFIÉS sont affichés (Bluesky : badge « valid » ; Mastodon : site vérifié ou instance officielle), lus sans compte. Sources écartées : ' + SOURCES_ECARTEES.slice(0, 3).map(x => esc(x[0])).join(' ; ') + '…</div>';
  }
  async function vuePodcasts() {
    let h = '<div class="dx-barre">' + PODCASTS.filter(p => !seulementFav || fav.includes('pod:' + p.id)).map(p => '<button type="button" class="dx-chip' + (f.podcast === p.id ? ' actif' : '') + '" data-podcast="' + p.id + '">' + esc(p.nom.split(' · ')[0]) + '</button>').join('') + '</div>';
    const p = PODCASTS.find(x => x.id === f.podcast) || PODCASTS[0], r = await D.podcasts(p.id);
    h += etat(r); if (r.etat !== 'ok') return h;
    h += '<div class="dx-titre">' + esc(p.nom) + ' <small>· ' + esc(p.radio) + '</small> ' + etoile('pod:' + p.id, fav) + '</div><ul class="dx-liste">' + r.episodes.map((e, i) => {
      const bloque = !e.securise && location.protocol === 'https:';
      return '<li><div><b>' + esc(e.titre) + '</b><small> · ' + esc(quand(e.t)) + (e.duree ? ' · ' + esc(e.duree) : '') + '</small>' + (e.resume ? '<small class="dx-raisons">' + esc(e.resume) + '</small>' : '') + '<div class="dx-lecteur" data-lecteur="' + i + '"></div></div><span class="dx-act">'
        + (bloque ? '<a href="' + esc(e.lien || e.audio) + '" target="_blank" rel="noopener noreferrer" title="Fichier non sécurisé (http) : le navigateur le bloque sur cette page">ouvrir sur le site</a>' : '<button type="button" class="dx-btn" data-ecouter="' + i + '">▶ Écouter</button>') + '</span></li>';
    }).join('') + '</ul>';
    corps.__episodes = r.episodes; return h + '<div class="dx-pied">Lecteur audio au clic sur le fichier officiel du flux (aucune transcription). Radios et services publics : BBC, NPR, DW, CBC, France Inter.</div>';
  }
  async function vueAujourdhui() {
    const [e, a, w] = await Promise.all([D.ephemeride('fr'), D.actualiteWikipedia(), D.wikinews()]);
    let h = '<div class="dx-titre">Ce jour-là dans l’histoire ' + badge(e.etiquette) + '</div>';
    h += e.etat === 'ok' ? '<ul class="dx-liste">' + e.evenements.slice(0, 8).map(x => '<li><div><b>' + esc(x.annee) + '</b> · ' + esc(x.texte) + (x.pages.length ? '<small> · ' + x.pages.map(p => '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.titre) + '</a>').join(' · ') + '</small>' : '') + '</div></li>').join('') + '</ul>' : '<p class="dx-vide ko">INDISPONIBLE : ' + esc(e.raison) + '</p>';
    h += '<div class="dx-titre">Dans l’actualité (Wikipédia, anglais) ' + badge(a.etiquette) + '</div>';
    h += a.etat === 'ok' ? '<ul class="dx-liste">' + a.nouvelles.slice(0, 6).map(x => '<li><div>' + esc(x.texte) + (x.liens.length ? '<small> · ' + x.liens.map(p => '<a href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.titre) + '</a>').join(' · ') + '</small>' : '') + '</div></li>').join('') + '</ul>' : '<p class="dx-vide ko">INDISPONIBLE : ' + esc(a.raison) + '</p>';
    h += '<div class="dx-titre">Wikinews ' + badge(w.etiquette) + '</div>';
    if (w.etat === 'ok') { const x = w.wikinews; h += x.ferme ? '<div class="dx-avert"><b>FERMÉ.</b> La Fondation Wikimedia a fermé Wikinews (annonce du ' + new Date(x.fermeLe).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) + ', lisible dans l’API du site) : plus aucune nouvelle n’est publiée. Derniers articles archivés : ' + x.derniers.slice(1, 4).map(d => '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titre) + '</a> (' + esc(quand(d.t)) + ')').join(' · ') + '</div>' : '<ul class="dx-liste">' + x.derniers.map(d => '<li><div><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' + esc(d.titre) + '</a><small> · ' + esc(quand(d.t)) + '</small></div></li>').join('') + '</ul>'; }
    else h += '<p class="dx-vide ko">INDISPONIBLE : ' + esc(w.raison) + '</p>';
    return h + '<div class="dx-pied">Wikipédia : texte sous licence CC BY-SA 4.0 (extraits courts, liens vers les articles).</div>';
  }

  /* ── lecteurs (jamais lancés sans clic) ── */
  function lancerTv(id, bloc) {
    const tv = TELEVISIONS.find(t => t.id === id), ecran = bloc.querySelector('.dx-tv-ecran'); if (!tv) return;
    for (const autre of conteneur.querySelectorAll('.dx-tv-ecran.joue')) if (autre !== ecran) arretTv(autre);         // un seul lecteur à la fois
    ecran.classList.add('joue');
    if (tv.lecteur === 'youtube') {
      ecran.innerHTML = '<iframe src="' + esc(urlLecteurTv(tv)) + '" title="' + esc(tv.nom) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe><button type="button" class="dx-btn arret" data-arret-tv="' + tv.id + '">■ Arrêter</button>';
    } else {
      ecran.innerHTML = '<video controls playsinline muted autoplay></video><button type="button" class="dx-btn arret" data-arret-tv="' + tv.id + '">■ Arrêter</button><span class="dx-msg">connexion au flux officiel…</span>';
      const v = ecran.querySelector('video'), msg = ecran.querySelector('.dx-msg');
      const brancher = () => { try { if (window.Hls && window.Hls.isSupported()) { const h = new window.Hls(); h.loadSource(tv.flux); h.attachMedia(v); h.on(window.Hls.Events.ERROR, (e, d) => { if (d && d.fatal) { msg.textContent = 'flux indisponible en ce moment'; h.destroy(); } }); v.__hls = h; v.play().catch(() => {}); msg.textContent = ''; } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = tv.flux; v.play().catch(() => {}); msg.textContent = ''; } else msg.textContent = 'lecture impossible ici (navigateur sans prise en charge du flux HLS)'; } catch (e) { msg.textContent = 'lecture impossible : ' + (e && e.message || e); } };
      if (window.Hls) brancher(); else { const s = document.createElement('script'); s.src = new URL('planetes/terre/vendor/hls.min.js', document.baseURI).href; s.onload = brancher; s.onerror = () => { msg.textContent = 'lecteur de flux introuvable'; }; document.head.appendChild(s); }
    }
  }
  function arretTv(ecran) { const v = ecran.querySelector('video'); if (v) { try { v.pause(); if (v.__hls) v.__hls.destroy(); } catch (e) { /* déjà arrêté */ } } const id = ecran.parentNode.dataset.tv; ecran.classList.remove('joue'); ecran.innerHTML = '<button type="button" class="dx-btn gros" data-lancer-tv="' + id + '">▶ Lancer le direct</button>'; }
  function ecouter(i, bloc) {
    const e = (corps.__episodes || [])[i], zone = conteneur.querySelector('[data-lecteur="' + i + '"]'); if (!e || !zone) return;
    for (const a of conteneur.querySelectorAll('.dx-lecteur audio')) { try { a.pause(); } catch (x) { /* rien */ } a.parentNode.innerHTML = ''; }
    zone.innerHTML = '<audio controls autoplay preload="none" src="' + esc(e.audio) + '"></audio><small class="dx-msg"></small>';
    const a = zone.querySelector('audio'); a.addEventListener('error', () => { zone.querySelector('.dx-msg').textContent = 'lecture impossible ici : ' + (e.lien ? '' : '') + 'ouvrez l’épisode sur le site du média.'; });
    nettoyages.push(() => { try { a.pause(); } catch (x) { /* rien */ } });
  }

  conteneur.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.onglet) { courant = b.dataset.onglet; for (const o of barre.children) o.classList.toggle('actif', o.dataset.onglet === courant); rendre(); }
    else if (b.dataset.type) { if (f.types.has(b.dataset.type)) f.types.delete(b.dataset.type); else f.types.add(b.dataset.type); rendre(); }
    else if (b.dataset.grav != null && b.dataset.grav !== '') { f.severiteMin = +b.dataset.grav; rendre(); }
    else if (b.dataset.source !== undefined) { f.source = b.dataset.source || null; rendre(); }
    else if (b.dataset.podcast) { f.podcast = b.dataset.podcast; rendre(); }
    else if (b.dataset.fav) { fav = basculerFavori(fav, b.dataset.fav); ecrireFav(fav); b.classList.toggle('on', fav.includes(b.dataset.fav)); b.textContent = fav.includes(b.dataset.fav) ? '★' : '☆'; if (seulementFav) rendre(); }
    else if (b.dataset.lancerTv) lancerTv(b.dataset.lancerTv, b.closest('.dx-tv'));
    else if (b.dataset.arretTv) arretTv(b.closest('.dx-tv-ecran'));
    else if (b.dataset.ecouter != null) ecouter(+b.dataset.ecouter, b);
    else if (b.dataset.terre && surTerre) surTerre(b.dataset.terre);
  });
  conteneur.querySelector('[data-fav-seul]').addEventListener('change', e => { seulementFav = e.target.checked; rendre(); });
  let tick = null; if (!leger) tick = setInterval(() => { if (conteneur.isConnected && !document.hidden && !conteneur.querySelector('.joue, audio')) rendre(); }, 180000);
  rendre();
  return { aller(o) { if (ONGLETS.some(x => x[0] === o)) { courant = o; for (const x of barre.children) x.classList.toggle('actif', x.dataset.onglet === o); rendre(); } }, lancerTv: id => { const b = conteneur.querySelector('[data-tv="' + id + '"]'); if (b) lancerTv(id, b); return !!b; },
    etat: () => ({ onglet: courant, favoris: fav.slice() }), detruire() { arreter(); if (tick) clearInterval(tick); for (const e of conteneur.querySelectorAll('.dx-tv-ecran.joue')) arretTv(e); } };
}

/* Ouvre (ou ramène) la fenêtre du hub dans le système de panneaux de Raylé. */
let instance = null;
export function ouvrirHub(o = {}) {
  const P = window.Panneaux; if (!P) throw new Error('fenêtres indisponibles');
  const surTerre = async id => { try { const M = await import(new URL('planetes/terre/pc/ordres-terre.js', document.baseURI).href), T = await M.assurerTerre(); await T.afficherEvenements({ vol: false }); T.ouvrirEvenement(id); } catch (e) { /* la Terre ne s'ouvre pas ici : le hub reste utilisable */ } };
  if (instance && document.querySelector('#panneaux .pn[data-id="hub-sources"]')) { instance.aller(o.onglet || 'evenements'); return instance; }
  P.ouvrir({ id: 'hub-sources', type: 'hub-sources', titre: 'SOURCES EN DIRECT', icone: '📡', taille: 'large', duree: 0, corps: el => { instance = construireHub(el, { onglet: o.onglet, surTerre, leger: document.body.dataset.hud === 'leger' }); return () => { if (instance) instance.detruire(); instance = null; }; } });
  return instance;
}
export const hubOuvert = () => !!document.querySelector('#panneaux .pn[data-id="hub-sources"]');
export const instanceHub = () => instance;
