import * as THREE from 'three';
import { creerCarte } from './carte.js';
import * as C from './carte-calcul.js';
import * as REG from '../pc/reglages-terre.js';
import { creerFenetres } from '../pc/fenetres-terre.js';
import { chargerFil } from '../pc/fil-actus.js';
import { modelesFil, modeleSujet } from '../pc/actus-sujets.js';
import { chercher, libelle } from '../pc/geocodage.js';
import { CREDITS, CREDITS_COURT } from '../pc/sources.js';

/* ═════════════ TERRE, MODE LÉGER (tablette et téléphone) ═════════════
   Appelé par la galaxie à la place du globe 3D (manifeste : modules.tablette / modules.telephone → ce fichier ; sur PC, réglage rayle_terre_vue = 'leger'). Même planète, mêmes données, un seul système :
   la carte plate (carte.js) montre la même imagerie ; les actualités viennent du MÊME Worker (/actualites/fil), la météo du même Worker (/meteo), la recherche de lieux est la même, et les fenêtres sont celles
   du globe (fenetres-terre.js). Pas de relief, pas de bâtiments 3D, pas de nuages : la carte graphique dort, la batterie tient. Même API `window.Terre` que le globe pour les ordres vocaux. */
let inst = null, enCours = null;
export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { inst = inst || construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();
const attendre = ms => new Promise(r => setTimeout(r, ms));
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const CLE_VUE = 'rayle_terre_vue';
const lireVue = () => { try { return JSON.parse(localStorage.getItem('rayle_terre_leger_vue')) || null; } catch (e) { return null; } };
const ecrireVue = v => { try { localStorage.setItem('rayle_terre_leger_vue', JSON.stringify({ lon: +v.lon.toFixed(3), lat: +v.lat.toFixed(3), zoom: +v.zoom.toFixed(2) })); } catch (e) { /* stockage refusé : la vue ne sera pas retenue */ } };

function construire(G) {
  const racine = document.getElementById('vueGalaxie');
  if (!document.getElementById('terre-leger-css')) { const l = document.createElement('link'); l.id = 'terre-leger-css'; l.rel = 'stylesheet'; l.href = new URL('./leger.css', import.meta.url).href; document.head.appendChild(l); }
  let actif = false, entreeFinie = false, carte = null, sujets = [], filCourant = null, choisi = null, sujetOuvert = null, reglages = REG.lire();
  const fenetres = creerFenetres();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080f);   // la scène 3D reste vide : la carte graphique ne dessine presque rien
  const ui = document.createElement('div'); ui.id = 'terre-leger'; ui.hidden = true; ui.setAttribute('role', 'region'); ui.setAttribute('aria-label', 'Carte de la Terre');
  ui.innerHTML = `
    <div class="tl-zone"></div><div class="tl-epingles" aria-label="Actualités sur la carte"></div><div id="terre-fondu" class="tl-fondu"></div>
    <header class="tl-haut">
      <button type="button" class="tl-b tl-retour" data-a="quitter" aria-label="Retour à la galaxie">‹ Galaxie</button>
      <form class="tl-recherche" role="search"><input type="search" enterkeyhint="search" autocomplete="off" placeholder="Chercher un lieu…" aria-label="Chercher un lieu"><button type="submit" aria-label="Chercher">⌕</button></form>
      <div class="tl-resultats" hidden></div>
    </header>
    <div class="tl-zoom"><button type="button" class="tl-b" data-a="plus" aria-label="Zoom avant">+</button><button type="button" class="tl-b" data-a="moins" aria-label="Zoom arrière">−</button></div>
    <nav class="tl-bas" aria-label="Actions">
      <button type="button" class="tl-b" data-a="monde">Monde</button><button type="button" class="tl-b" data-a="france">France</button><button type="button" class="tl-b" data-a="pays">Pays</button><button type="button" class="tl-b" data-a="meteo">Météo ici</button><button type="button" class="tl-b sec" data-a="globe" title="Revenir au globe 3D">Globe 3D</button>
    </nav>
    <div class="tl-feuille" hidden></div>
    <div class="tl-info" role="status" aria-live="polite"></div>
    <div class="tl-echelle"><i></i><span></span></div>
    <button type="button" class="tl-credits" data-a="credits" title="Crédits et licences">${esc(CREDITS_COURT)}</button>`;
  racine.appendChild(ui);
  const $ = s => ui.querySelector(s), zone = $('.tl-zone'), pins = $('.tl-epingles'), info = $('.tl-info'), feuille = $('.tl-feuille'), resultats = $('.tl-resultats'), champ = $('.tl-recherche input');
  let minuteurInfo = 0; const dire = (t, ms = 4500) => { info.textContent = t || ''; info.classList.toggle('vide', !t); clearTimeout(minuteurInfo); if (t && ms) minuteurInfo = setTimeout(() => dire(''), ms); };

  // ── carte ──
  const poserPins = () => {
    if (!carte) return; const v = carte.vue(), t = carte.taille(), liste = C.epingles(sujets, v, t.l, t.h);
    pins.innerHTML = liste.map((e, i) => `<button type="button" class="tl-pin${choisi === e.sujet.id ? ' choisi' : ''}${e.sujet.importance >= 3 ? ' fort' : ''}" style="left:${e.x.toFixed(1)}px;top:${e.y.toFixed(1)}px;--c:${esc(e.sujet.couleur)}" data-i="${i}" aria-label="${esc(e.sujet.titre)}">${e.n > 1 ? '<b>' + e.n + '</b>' : ''}</button>`).join('');
    pins._liste = liste;
  };
  const poserEchelle = v => { const b = C.barreEchelle(v.lat, v.zoom); $('.tl-echelle i').style.width = b.px.toFixed(0) + 'px'; $('.tl-echelle span').textContent = b.texte; };
  let planifiePins = false;
  const surChange = v => { poserEchelle(v); if (!planifiePins) { planifiePins = true; requestAnimationFrame(() => { planifiePins = false; poserPins(); }); } };
  function creerLaCarte() {
    if (carte) return carte;
    const d = lireVue();
    carte = creerCarte({ zone, eox: reglages.eox, zMax: 12, vueInitiale: d || { lon: 10, lat: 30, zoom: 2 }, surChange, surPose: v => ecrireVue(v), surAppui: (ll, px) => choisirPoint(ll, px) });
    return carte;
  }

  // ── point choisi (appui bref) ──
  function choisirPoint(ll, px) {
    fermerFeuille(); choisi = null; poserPins();
    feuille.hidden = false; feuille.dataset.genre = 'point';
    feuille.innerHTML = `<div class="tl-f-corps"><b>${ll.lat.toFixed(3)}°, ${ll.lon.toFixed(3)}°</b><span>Point choisi sur la carte</span></div><div class="tl-f-actions"><button type="button" class="tl-b" data-a="meteo-point">Météo ici</button><button type="button" class="tl-b sec" data-a="fermer-feuille">Fermer</button></div>`;
    feuille._ll = ll;
  }
  function fermerFeuille() { feuille.hidden = true; feuille.innerHTML = ''; sujetOuvert = null; }
  function ouvrirSujet(s) {
    sujetOuvert = s; choisi = s.id; poserPins();
    const autres = s.autres.filter(a => a.url).map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.nom)}</a>`).join(' · ');
    feuille.hidden = false; feuille.dataset.genre = 'sujet'; feuille.style.setProperty('--c', s.couleur);
    feuille.innerHTML = `<div class="tl-f-corps"><span class="tl-f-cat">${esc(s.catNom)}</span><a class="tl-f-titre" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titre)}</a><span class="tl-f-src"><b>${esc(s.source)}</b>${s.quand ? ' · ' + esc(s.quand) : ''}${s.lieu ? ' · ' + esc(s.lieu.texte) : ''} · ${s.importance <= 1 ? 'signalé par 1 média' : 'repris par ' + s.importance + ' médias'}</span>${autres ? '<span class="tl-f-src">Aussi : ' + autres + '</span>' : ''}</div><div class="tl-f-actions">${s.lieu ? '<button type="button" class="tl-b" data-a="meteo-sujet">Météo du lieu</button>' : ''}<button type="button" class="tl-b sec" data-a="fermer-feuille">Fermer</button></div>`;
  }

  // ── données ──
  async function afficherFil(o) {
    const portee = ['france', 'monde', 'pays'].includes(o.portee) ? o.portee : 'monde', pays = portee === 'pays' ? String(o.pays || '').toUpperCase() : '';
    const vue = o.vue || (portee === 'france' ? { lat: 46.6, lon: 2.5, dist: 1500, nom: 'France' } : portee === 'monde' ? { lat: 25, lon: 10, dist: 4000, nom: 'Monde' } : null);
    if (vue && o.vol !== false) carte.volerVers(vue.lon, vue.lat, C.zoomPourDistance(vue.dist || 1500));
    const nomPortee = portee === 'monde' ? 'Monde' : (vue && vue.nom) || (portee === 'france' ? 'France' : pays);
    try {
      let m;
      try { m = modelesFil(await chargerFil(portee, pays)); }
      catch (e) { if (!(o.donnees && o.donnees.length)) throw e; m = { sujets: [], genere: null, perime: false, indisponibles: [], sources: [] }; }
      const connus = new Set(m.sujets.map(s => s.id)), extra = (o.donnees || []).map(d => modeleSujet(d)).filter(s => s.titre && s.url && !connus.has(s.id));
      if (extra.length) m = { ...m, sujets: [...extra, ...m.sujets] };
      if (!m.sujets.length) { dire('Aucun sujet d’actualité pour le moment.', 6000); return { ok: false, erreur: 'aucun sujet' }; }
      sujets = m.sujets; filCourant = { portee, pays, t: Date.now() }; poserPins();
      if (o.panneau) fenetres.panneauFil(portee, m, nomPortee);
      dire(m.sujets.filter(s => s.lieu).length + ' sujets sur la carte · ' + nomPortee, 5000);
      return { ok: true, nombre: m.sujets.length, avecLieu: m.sujets.filter(s => s.lieu).length, maj: m.genere };
    } catch (e) {
      const raison = String(e && e.message || e); dire('Actualités indisponibles : ' + raison, 9000);
      if (o.panneau) fenetres.panneauFilIndisponible(portee, raison);
      return { ok: false, erreur: raison };
    }
  }
  const eclairerSujet = (id, { vol = true } = {}) => { const s = sujets.find(x => x.id === id); if (!s) return false; if (vol && s.lieu) carte.volerVers(s.lieu.lon, s.lieu.lat, 6.2, 1100); ouvrirSujet(s); return true; };
  async function meteo(lat, lon, nom) { dire('Météo : lecture…', 2500); return fenetres.meteo(lat, lon, nom || (lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°')); }
  function meteoIci() { const v = carte.vue(); return meteo(v.lat, v.lon, 'Centre de la carte'); }
  function aller(r) { carte.volerVers(r.lon, r.lat, C.zoomPourDistance(r.distance || 12)); dire(libelle(r), 4000); }

  // ── recherche de lieux ──
  let recherche = 0;
  async function lancerRecherche(texte) {
    const n = ++recherche; resultats.hidden = false; resultats.innerHTML = '<span class="tl-r-info">Recherche…</span>';
    try {
      const r = await chercher(texte); if (n !== recherche) return;
      resultats.innerHTML = r.length ? r.map((x, i) => `<button type="button" data-i="${i}">${esc(libelle(x))}</button>`).join('') : '<span class="tl-r-info">Aucun lieu trouvé.</span>'; resultats._liste = r;
    } catch (e) { if (n === recherche) resultats.innerHTML = '<span class="tl-r-info">Recherche indisponible : ' + esc(e && e.message || e) + '</span>'; }
  }

  // ── gestes de l'interface ──
  ui.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('tl-pin')) { const l = pins._liste && pins._liste[+b.dataset.i]; if (l) { if (l.n > 1 && carte.vue().zoom < 9) { carte.volerVers(l.sujet.lieu.lon, l.sujet.lieu.lat, Math.min(12, carte.vue().zoom + 2), 500); } ouvrirSujet(l.sujet); } return; }
    if (b.parentElement === resultats) { const r = resultats._liste && resultats._liste[+b.dataset.i]; resultats.hidden = true; if (r) { champ.value = r.nom; aller(r); } return; }
    const a = b.dataset.a; if (!a) return;
    if (a === 'quitter') G.nav.fermerSas(); else if (a === 'plus') carte.zoomer(1); else if (a === 'moins') carte.zoomer(-1);
    else if (a === 'monde') afficherFil({ portee: 'monde', panneau: true }); else if (a === 'france') afficherFil({ portee: 'france', panneau: true });
    else if (a === 'pays') { if (window.ActusPays) window.ActusPays.selecteur(); else dire('Le choix du pays n’est pas disponible.'); }
    else if (a === 'meteo') meteoIci();
    else if (a === 'meteo-point' && feuille._ll) meteo(feuille._ll.lat, feuille._ll.lon, 'Point choisi');
    else if (a === 'meteo-sujet' && sujetOuvert && sujetOuvert.lieu) meteo(sujetOuvert.lieu.lat, sujetOuvert.lieu.lon, sujetOuvert.lieu.nom || sujetOuvert.lieu.texte);
    else if (a === 'fermer-feuille') { fermerFeuille(); choisi = null; poserPins(); }
    else if (a === 'globe') { try { localStorage.setItem(CLE_VUE, '3d'); } catch (x) { /* stockage refusé */ } dire('Le globe 3D s’ouvrira au prochain passage sur la Terre (rechargez la page pour l’avoir tout de suite).', 9000); }
    else if (a === 'credits') ouvrirCredits();
  });
  ui.querySelector('.tl-recherche').addEventListener('submit', e => { e.preventDefault(); const t = champ.value.trim(); if (t.length >= 2) lancerRecherche(t); });
  champ.addEventListener('input', () => { if (!champ.value) resultats.hidden = true; });
  function ouvrirCredits() {
    if (!window.Panneaux) return dire(CREDITS.join(' · '), 20000);
    window.Panneaux.ouvrir({ id: 'terre-credits', type: 'holo-credits', titre: 'Crédits et licences', icone: '◈', duree: 600000, corps: { html: '<ul class="t-credits">' + CREDITS.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' } });
  }
  document.addEventListener('click', e => {   // bouton « Voir » des panneaux d'actualités : on montre le sujet sur la carte ; sur un petit écran le panneau se ferme pour laisser voir la carte
    const b = e.target.closest && e.target.closest('[data-voir]'); if (!b || !actif) return;
    if (eclairerSujet(b.dataset.voir) && window.innerWidth < 900) for (const id of ['terre-fil-france', 'terre-fil-monde', 'terre-fil-pays']) fenetres.fermer(id);
  });
  window.addEventListener('terre:voir-sujet', e => { if (actif && e.detail && e.detail.id) eclairerSujet(e.detail.id); });
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });
  const toucheSortie = e => { if (actif && e.key === 'Escape' && !feuille.hidden) { fermerFeuille(); choisi = null; poserPins(); e.stopImmediatePropagation(); } };
  window.addEventListener('keydown', toucheSortie, true);

  // ── ordres de Raylé (même interface que le globe) ──
  const api = {
    async entrer({ rapide = false } = {}) {
      if (actif) return; actif = true; entreeFinie = false; reglages = REG.lire(); window.Terre = api; window.TerreLegere = api;   // le globe a pu reprendre window.Terre entre deux visites
      G.nav.selectionner(null); G.nav.deleguer({ pointerdown() {}, pointermove() {}, pointerup() {}, pointercancel() {}, wheel() {}, dblclick() {} });
      G.surcharger({ scene, camera: new THREE.PerspectiveCamera(50, 1, 0.1, 10), maj: () => {} });
      racine.classList.add('terre-leger-actif'); ui.hidden = false; creerLaCarte(); carte.mesurer(); carte.regler({ eox: reglages.eox });
      window.dispatchEvent(new CustomEvent('terre:entree', { detail: { mode: 'leger' } }));
      await attendre(rapide ? 30 : 120); entreeFinie = true;
      dire('Carte légère : un doigt déplace, deux doigts zooment, double appui zoome.', 7000);
      if (!filCourant) afficherFil({ portee: 'monde', vol: false }).catch(() => {});
    },
    async sortir() {
      if (!actif) return; actif = false; fermerFeuille(); resultats.hidden = true;
      for (const id of ['terre-actus', 'terre-meteo', 'terre-fil-france', 'terre-fil-monde', 'terre-fil-pays', 'terre-credits']) fenetres.fermer(id);
      G.surcharger(null); G.nav.deleguer(null); racine.classList.remove('terre-leger-actif'); ui.hidden = true;
      if (carte) ecrireVue(carte.vue());
      window.dispatchEvent(new CustomEvent('terre:sortie', {}));
    },
    mode: 'leger', carte: () => carte, etat: () => ({ actif, entree: entreeFinie, mode: 'leger', vol: carte ? carte.etat().vol : false, ...(carte ? carte.vue() : {}), sujets: sujets.length }),
    volerVers: (o, duree) => carte && carte.volerVers(o.lon, o.lat, C.zoomPourDistance(o.dist), (duree || 1) * 900),
    placer: o => carte && carte.volerVers(o.lon, o.lat, o.zoom || carte.vue().zoom, 1),
    aller, afficherFil, eclairerSujet, apaiserSujets() { choisi = null; poserPins(); }, aSujet: id => sujets.some(s => s.id === id), sujetsEtat: () => ({ nombre: sujets.length, choisi }),
    actualites: (code, nom) => fenetres.actualites(code, nom || code), meteo, meteoIci,
    afficherEvenements: async () => ({ ok: false, phrase: 'Les événements naturels ne sont pas affichés en mode léger : utilise le globe 3D sur le PC.' }),
    chercher, reglages: () => ({ ...reglages }), ui, fenetres, pointSous: (px, py) => (carte ? carte.versLonLat(px, py) : null),
    sortirEvenement: () => api.sortir()
  };
  if (window.RayleOrdres) {
    const sur = (action, fn) => { try { window.RayleOrdres.enregistrer('terre', action, fn, { delai: 30000 }); } catch (e) { /* ordre déjà branché par le globe, ou non déclaré : ignoré */ } };
    const premier = async texte => (await chercher(texte))[0] || null;
    sur('tourner_vers', async ({ lieu }) => { const l = await premier(lieu); if (!l) return { ok: false, erreur: 'lieu introuvable : « ' + lieu + ' »' }; (window.Terre || api).aller(l); return 'En route vers ' + libelle(l) + '.'; });
    sur('afficher_actualites', async ({ pays }) => {
      const l = await premier(pays); if (!l || !l.codePays) return { ok: false, erreur: 'pays introuvable : « ' + pays + ' »' };
      const r = await (window.Terre || api).afficherFil({ portee: 'pays', pays: l.codePays, vue: { lat: l.lat, lon: l.lon, dist: 1500, nom: l.nom }, panneau: true });
      return r.ok ? { ok: true, texte: 'Voici l’actualité : ' + l.nom + '.' } : { ok: false, erreur: r.erreur };
    });
    sur('afficher_meteo', async ({ lieu }) => { const l = await premier(lieu); if (!l) return { ok: false, erreur: 'lieu introuvable : « ' + lieu + ' »' }; const r = await (window.Terre || api).meteo(l.lat, l.lon, l.nom); return r && r.ok === false ? { ok: false, erreur: r.erreur || 'météo indisponible' } : { ok: true, texte: 'Voici la météo de ' + l.nom + '.' }; });
  }
  window.Terre = api; window.TerreLegere = api;
  return api;
}
