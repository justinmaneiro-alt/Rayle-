import * as C from './camera-orbite.js';
import { R, RAD, lonLat, vers, base, dot, unit, sub, mul, add, cross, distanceKm } from './geo.js';
import { creerGlobe } from './globe.js';
import { creerChargeur } from './charge.js';
import { creerEtiquettes } from './etiquettes.js';
import { creerInterface, formaterDistance } from './interface-terre.js';
import * as REG from './reglages-terre.js';
import { chercher, libelle } from './geocodage.js';
import * as SRC from './sources.js';
import { creerFenetres } from './fenetres-terre.js';
import { creerMarqueurs } from './marqueurs.js';
import * as RADAR from './radar.js';
import { intensitePluie } from './meteo-contenu.js';
import { creerBalisesActus } from './balises-actus.js';
import { creerBalisesEvenements } from './balises-evenements.js';
import { obtenirDirect } from '../../../core/direct/donnees-direct.js';
import { phraseEvenements, TYPES as TYPES_EVT } from '../../../core/direct/evenements-calcul.js';
import { chargerFil, ageFil } from './fil-actus.js';
import { modelesFil, modeleSujet, distanceVue } from './actus-sujets.js';

/* ═════════════ LA TERRE : MODULE PC ═════════════
   Appelé par la galaxie quand la caméra arrive sur la Terre (manifeste modules.pc.entree). `entrer(G)` démarre l'orbite : fondu, le globe
   détaillé prend la place de la scène de la galaxie (G.surcharger), la souris est déléguée ici (G.nav.deleguer). Échap (événement
   galaxie:sortie) ramène à la galaxie, où la Terre reprend sa rotation en douceur. Tout est paresseux : rien n'est chargé avant le premier clic. */
const ORBITE = { dist: R * 2.7, incl: 0 };
const SORTIE_DIST = R * 4.4, SORTIE_POUSSEE = 150;   // dézoomer au-delà de 4,4 R d'altitude (puis encore un peu de molette) ramène à la galaxie ; l'entrée par zoom se fait bien plus bas (≈ 2,6 R) : pas de va-et-vient
let inst = null, enCours = null;
const attendre = ms => new Promise(r => setTimeout(r, ms));

export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { inst = inst || await construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();

async function construire(G) {
  const racine = document.getElementById('vueGalaxie');
  if (!document.getElementById('terre-css')) { const l = document.createElement('link'); l.id = 'terre-css'; l.rel = 'stylesheet'; l.href = new URL('./terre.css', import.meta.url).href; document.head.appendChild(l); }
  const textures = G.texturesTerre();
  if (!textures) throw new Error('textures de la Terre introuvables dans la galaxie');

  // Réglages et profil de rendu
  let reglages = REG.lire(), cfg = null;
  const jourImagerie = new Date(Date.now() - 86400000).toISOString().slice(0, 10);   // image satellite d'hier (celle du jour n'est pas encore complète)
  const calculer = () => {
    const profil = REG.profilEffectif(reglages, { niveauGalaxie: G.info().qualite, jeu: G.jeu() });
    const nouveau = { ...reglages, profil, jeu: G.jeu(), jourImagerie, noms: reglages.noms && !G.jeu(), batiments: reglages.batiments && profil !== 'basse', nuages: reglages.nuages && !G.jeu(), radar: reglages.radar && !G.jeu() };
    if (cfg && (cfg.profil !== nouveau.profil || cfg.eox !== nouveau.eox || cfg.regional !== nouveau.regional || cfg.batiments !== nouveau.batiments || cfg.nuagesReels !== nouveau.nuagesReels)) globe.tuiles.vider();
    if (cfg && cfg.radar !== nouveau.radar) setTimeout(() => radarMaj(), 0);
    cfg = nouveau; return cfg;
  };
  const lire = () => cfg;

  // Adresse des tuiles vectorielles (OpenFreeMap publie la version du jour dans son TileJSON)
  let modeleVecteur = null, messageVecteur = null;
  const obtenirModele = (async () => {
    try {
      const ctl = new AbortController(), minuteur = setTimeout(() => ctl.abort(), 6000);
      const rep = await fetch(SRC.VECTEUR_TILEJSON, { signal: ctl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
      clearTimeout(minuteur);
      if (!rep.ok) throw new Error('HTTP ' + rep.status);
      const j = await rep.json(); modeleVecteur = j.tiles && j.tiles[0] || null;
      if (!modeleVecteur) throw new Error('TileJSON sans adresse de tuiles');
    } catch (e) { messageVecteur = 'Calque des frontières, routes et noms indisponible (' + (e && e.message || e) + ').'; }
  })();

  const chargeur = creerChargeur({ url: new URL('./worker-tuiles.js', import.meta.url).href, travailleurs: 3, simultanees: 10, perdu: () => ui.dire('Chargeur de tuiles interrompu : rouvrez la Terre.') });
  const globe = creerGlobe({ renderer: G.renderer, textures, ciel: G.ciel, chargeur, lire, modeleVecteur: () => modeleVecteur });
  calculer();
  const changerReglage = p => { reglages = REG.normaliser({ ...reglages, ...p }); REG.ecrire(reglages); calculer(); ui.appliquerReglages(reglages); };
  const ui = creerInterface({
    racine, reglages,
    surReglage: p => changerReglage(p),
    actions: {
      orbite: () => api.orbite(), sortir: () => G.nav.fermerSas(), chercher: t => chercher(t), aller: r => api.aller(r),
      'meteo-ici': () => api.meteoIci(), monde: () => api.afficherFil({ portee: 'monde', panneau: true }), pays: () => { if (window.ActusPays) window.ActusPays.selecteur(); }, france: () => api.afficherFil({ portee: 'france', panneau: true }),
      'meteo-lieu': r => api.meteo(r.lat, r.lon, r.nom), 'actus-pays': (code, nom) => api.actualites(code, nom),
      radar: () => changerReglage({ radar: !reglages.radar }), evenements: () => { if (balisesEvt.actif()) api.masquerEvenements(); else api.afficherEvenements({ vol: false }); }, sources: () => { if (window.DirectPage) window.DirectPage.ouvrirHub('evenements'); }, 'radar-lecture': () => radarLecture(), 'radar-rang': n => { radarArret(); radarRang = n; radarMaj(); }
    }
  });
  ui.appliquerReglages(reglages);
  const noms = creerEtiquettes(ui.zoneNoms), marqueurs = creerMarqueurs(ui.zoneNoms), fenetres = creerFenetres();
  const balisesActus = creerBalisesActus(ui.zoneNoms, { surChoix: id => api.eclairerSujet(id) });
  // Événements naturels en direct (séismes, catastrophes, incendies, tempêtes) : calque de balises, barre de contrôle, fenêtre de détail
  const balisesEvt = creerBalisesEvenements(ui.zoneNoms, { charger: () => obtenirDirect().evenements(), parler: l => { try { if (typeof addLine === 'function') addLine('sys', '🌍 Événement majeur : ' + l.slice(0, 2).map(e => e.titre).join(' · ')); window.dispatchEvent(new CustomEvent('terre:evenement-majeur', { detail: { evenements: l } })); } catch (e) { /* journal absent */ } } });
  balisesEvt.monterBarre(racine);
  G.surChangement(() => calculer());

  // Fil d'actualités : rafraîchi toutes les 10 minutes tant qu'il est affiché (le Worker le reconstruit lui aussi toutes les 10 minutes)
  let filCourant = null;
  async function filAutomatique() {
    if (!filCourant || !balisesActus.actif() || filCourant.enCours || Date.now() - filCourant.t < 600000) return;
    filCourant.enCours = true;
    try { const m = modelesFil(await chargerFil(filCourant.portee, filCourant.pays, { force: true })); if (m.sujets.length) balisesActus.ajouter(m.sujets); filCourant.t = Date.now(); } catch (e) { filCourant.t = Date.now() - 480000; }   // en panne : on réessaie dans 2 minutes, l'affichage reste
    filCourant.enCours = false;
  }
  // « Voir » dans un panneau d'actualités : éclaire la balise
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-voir]'); if (b && actif) api.eclairerSujet(b.dataset.voir); });
  // ── Pays à actualités, radar de pluie, météo locale ──
  let paysListe = [], paysEssai = -1e9, actusSel = null, lieuMeteo = null, radarIdx = null, radarRang = 0, radarTimer = 0, radarPanne = false, radarCharge = 0, meteoAuto = { essai: -1e9, enCours: false, erreur: null };
  const workerOk = () => { try { return (typeof workerReady === 'function' && !!workerReady()); } catch (e) { return false; } };
  /* Digest de la planète (route /actualites/planete) : le dernier titre de chaque pays, affiché sous le nom du repère. Sans lui (Worker pas à jour, premier cycle), les repères restent cliquables comme avant. */
  let digestEssai = -1e9;
  async function chargerDigest() {
    if (!workerOk() || performance.now() - digestEssai < 120000) return; digestEssai = performance.now();
    try { const d = await window.wjson('/actualites/planete', 15000); marqueurs.definirTitres(d && d.pays || {}); } catch (e) { /* digest pas prêt : rien à afficher, rien d'inventé */ }
  }
  setInterval(() => { if (actif && paysListe.length) chargerDigest(); }, 10 * 60000);
  async function chargerPays() {
    if (paysListe.length || !workerOk() || performance.now() - paysEssai < 15000) return;
    paysEssai = performance.now();
    try { const r = await window.wjson('/actualites?liste=1', 12000); paysListe = r.pays || []; marqueurs.definirPays(paysListe); chargerDigest(); } catch (e) { /* Worker pas à jour ou verrouillé : pas de repères, la recherche et les fenêtres expliqueront */ }
  }
  async function radarMaj() {
    const actif = cfg && cfg.radar;
    if (!actif) { globe.tuiles.definirRadar(null, 0); radarArret(); ui.radar({ actif: false }); return; }
    if (!radarIdx || Date.now() - radarCharge > 300000) {
      radarCharge = Date.now();
      try {
        const rep = await fetch(RADAR.INDEX, { referrerPolicy: 'no-referrer', credentials: 'omit' });
        if (!rep.ok) throw new Error('HTTP ' + rep.status);
        const idx = RADAR.lireIndex(await rep.json()); if (!idx) throw new Error('index illisible');
        const dernier = radarIdx ? radarRang === radarIdx.images.length - 1 : true;
        radarIdx = idx; radarPanne = false; if (dernier || radarRang >= idx.images.length) radarRang = idx.images.length - 1;
      } catch (e) { radarPanne = true; }
    }
    if (radarIdx) { radarRang = Math.max(0, Math.min(radarRang, radarIdx.images.length - 1)); globe.tuiles.definirRadar(radarIdx, radarRang); }
    ui.radar({ actif: true, rang: radarRang, n: radarIdx ? radarIdx.images.length : 0, heure: radarIdx ? RADAR.heureImage(radarIdx.images[radarRang].temps) : '', lecture: !!radarTimer, indisponible: radarPanne && !radarIdx });
  }
  function radarArret() { if (radarTimer) { clearInterval(radarTimer); radarTimer = 0; } }
  function radarLecture() {
    if (radarTimer) { radarArret(); radarMaj(); return; }
    if (!radarIdx) return;
    const n = radarIdx.images.length, debut = Math.max(0, n - 8); radarRang = debut;
    radarTimer = setInterval(() => { radarRang = radarRang + 1 >= n ? debut : radarRang + 1; radarMaj(); }, 800); radarMaj();
  }
  const nomLieuProche = (lon, lat) => noms.proche(lon, lat, 60);
  /* Météo locale pour les nuages et la pluie animés quand on s'approche d'un lieu (sans ouvrir de fenêtre) */
  async function meteoAutomatique() {
    if (!cfg.meteoAnim || cfg.jeu || meteoAuto.enCours || !workerOk()) return;
    const ici = globe.meteoAnim.actuelle(), pose = C.pose(cam, hCible());
    if (pose.altitude > 900) return;
    if (ici && distanceKm(ici.lon, ici.lat, cam.lon, cam.lat) < 120) return;
    if (performance.now() - meteoAuto.essai < 25000) return;
    meteoAuto.essai = performance.now(); meteoAuto.enCours = true;
    try {
      const m = await window.wjson('/meteo?lat=' + cam.lat.toFixed(3) + '&lon=' + cam.lon.toFixed(3), 12000);
      appliquerMeteoLocale(m, cam.lon, cam.lat); meteoAuto.erreur = null;
    } catch (e) { meteoAuto.erreur = String(e && e.message || e); }
    meteoAuto.enCours = false;
  }
  function appliquerMeteoLocale(m, lon, lat) {
    const a = m && m.actuel; if (!a) return;
    globe.meteoAnim.definir({ lon, lat, couverture: a.nuages, pluie: a.pluie, vent: a.vent, direction: a.direction });
  }

  // ── État de la caméra ──
  let sortieRapide = false, poussee = 0, entreeFinie = false;
  let cam = C.etatInitial({ lon: 2, lat: 30, dist: ORBITE.dist }), vol = null, zoomRestant = 0, ancreZoom = null, inertie = null, hSol = 0, imageSol = 0, actif = false, dateSimulee = null;
  const canvas = G.canvas, fovRad = () => G.camera.fov * RAD;
  const ecran = () => ({ largeur: canvas.clientWidth || innerWidth, hauteur: canvas.clientHeight || innerHeight });
  const aspect = () => { const e = ecran(); return e.largeur / Math.max(1, e.hauteur); };
  const ndc = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2]; };
  const hCible = () => hSol * cfg.exag;

  function volerVers(vers_, duree = null) {
    const a = { ...cam }, b = { ...cam, ...vers_ };
    b.dist = Math.max(C.DIST_MIN, Math.min(C.DIST_MAX, b.dist));
    vol = { de: a, vers: b, t: 0, duree: duree || C.dureeVol(a, b) }; inertie = null; zoomRestant = 0;
    window.dispatchEvent(new CustomEvent('terre:vol', { detail: { vers: { lon: b.lon, lat: b.lat, dist: b.dist } } }));
  }

  // ── Souris (déléguée par la navigation de la galaxie) ──
  let geste = null;
  const handlers = {
    pointerdown(e) {
      if (ui.panneauOuvert() && !e.target.closest('.t-panneau')) { /* un clic sur la scène laisse le panneau ouvert */ }
      canvas.setPointerCapture(e.pointerId);
      vol = null; inertie = null;
      const [nx, ny] = ndc(e), tourner = e.button === 2 || e.ctrlKey || e.shiftKey || e.button === 1;
      const A = tourner ? null : C.pointAuSol(C.pose(cam, hCible()), fovRad(), aspect(), nx, ny, hCible());
      geste = { mode: tourner ? 'tourner' : 'saisir', A, x: e.clientX, y: e.clientY, bouge: 0, dernier: performance.now(), v: null };
    },
    pointermove(e) {
      if (!geste) { const r = canvas.getBoundingClientRect(), m = balisesEvt.survoler(e.clientX - r.left, e.clientY - r.top) || balisesActus.survoler(e.clientX - r.left, e.clientY - r.top) || marqueurs.survoler(e.clientX - r.left, e.clientY - r.top); canvas.style.cursor = m ? 'pointer' : ''; return; }
      const dx = e.clientX - geste.x, dy = e.clientY - geste.y; geste.x = e.clientX; geste.y = e.clientY; geste.bouge += Math.abs(dx) + Math.abs(dy);
      if (geste.mode === 'tourner') { cam = C.incliner(cam, dx * 0.005, dy * 0.005); return; }
      if (!geste.A) return;
      const [nx, ny] = ndc(e), avant = vers(cam.lon, cam.lat), maintenant = performance.now();
      cam = C.saisir(cam, geste.A, fovRad(), aspect(), nx, ny, hCible());
      const apres = vers(cam.lon, cam.lat), dt = Math.max(0.004, (maintenant - geste.dernier) / 1000); geste.dernier = maintenant;
      const c = cross(unit(avant), unit(apres)), s = Math.hypot(...c);
      geste.v = s > 1e-9 ? { axe: mul(c, 1 / s), vitesse: Math.atan2(s, dot(unit(avant), unit(apres))) / dt } : null;
    },
    pointerup(e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
      if (geste && geste.bouge < 5 && e.button === 0) {          // un clic (sans glisser) sur un repère de pays : ses actualités
        const r = canvas.getBoundingClientRect(), ev = balisesEvt.pris(e.clientX - r.left, e.clientY - r.top);
        if (ev) { geste = null; balisesEvt.detail(ev.e); return; }
        const sj = balisesActus.pris(e.clientX - r.left, e.clientY - r.top);
        if (sj) { geste = null; api.eclairerSujet(sj.id); return; }
        const m = marqueurs.pris(e.clientX - r.left, e.clientY - r.top);
        if (m) { geste = null; api.actualites(m.code, m.nom); return; }
      }
      if (geste && geste.mode === 'saisir' && geste.v && performance.now() - geste.dernier < 90 && geste.v.vitesse > 0.02) inertie = geste.v;   // lancer : la planète continue un instant
      geste = null;
    },
    pointercancel() { geste = null; },
    wheel(e) {
      const [nx, ny] = ndc(e);
      // dézoomer loin de la planète : retour à la galaxie (il faut insister un peu, et la Terre doit être à une vraie altitude d'orbite)
      if (e.deltaY > 0 && !vol && cam.dist >= SORTIE_DIST * 0.995) {
        poussee += e.deltaY * (e.deltaMode === 1 ? 33 : 1);
        if (poussee >= SORTIE_POUSSEE) { poussee = 0; sortirParZoom(); return; }
      } else if (e.deltaY < 0 || cam.dist < SORTIE_DIST * 0.9) poussee = 0;
      zoomRestant += e.deltaY * 0.0016 * (e.deltaMode === 1 ? 33 : 1); zoomRestant = Math.max(-2.5, Math.min(2.5, zoomRestant));
      ancreZoom = [nx, ny]; vol = null; inertie = null;
    },
    dblclick(e) {
      const [nx, ny] = ndc(e), p = C.pose(cam, hCible()), A = C.pointAuSol(p, fovRad(), aspect(), nx, ny, hCible());
      if (!A) return;
      const ll = lonLat(A);
      volerVers({ lon: ll.lon, lat: ll.lat, dist: Math.max(C.DIST_MIN, cam.dist * 0.3) }, 1.3);
    }
  };
  function sortirParZoom() {
    const d = unit(vers(cam.lon, cam.lat));
    sortieRapide = true;
    G.orienterVersTerre(d, 1 + cam.dist / R);
    G.nav.fermerSas();                                           // événement galaxie:sortie → api.sortir()
  }
  const touche = e => {
    if (!actif) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target && e.target.tagName)) { if (e.key === 'Escape' && e.target.tagName === 'INPUT') e.target.blur(); return; }
    if (e.key === 'Escape' && ui.panneauOuvert()) { ui.fermerPanneau(); e.stopImmediatePropagation(); return; }
    if (e.key === 'o' || e.key === 'O') { e.stopImmediatePropagation(); api.orbite(); }
  };
  window.addEventListener('keydown', touche, true);

  // ── Une image ──
  let tFps = 0, tFenetres = 0, imageCam = 0, hSolCam = 0;
  function maj(dt) {
    if (vol) {
      vol.t += dt / vol.duree;
      cam = C.etatVol(vol.de, vol.vers, Math.min(1, vol.t));
      if (vol.t >= 1) { cam = { ...vol.vers }; vol = null; window.dispatchEvent(new CustomEvent('terre:arrive', { detail: { lon: cam.lon, lat: cam.lat, dist: cam.dist } })); }
    } else {
      if (Math.abs(zoomRestant) > 1e-4 && ancreZoom) {
        const part = zoomRestant * (1 - Math.exp(-dt * 11)); zoomRestant -= part;
        cam = C.zoomer(cam, Math.exp(part), fovRad(), aspect(), ancreZoom[0], ancreZoom[1], hCible());
      }
      if (inertie && !geste) {
        cam = C.tournerEtat(cam, inertie.axe, inertie.vitesse * dt); inertie = { ...inertie, vitesse: inertie.vitesse * Math.exp(-dt * 3.2) };
        if (inertie.vitesse < 0.003) inertie = null;
      }
    }
    if (++imageSol % 6 === 0) hSol = globe.tuiles.altitudeSol(cam.lon, cam.lat);
    // jamais sous le sol : la caméra reste au moins 40 m au-dessus du relief (exagéré) visé
    const ie = C.inclinaisonUtile(cam), plancher = Math.max(C.DIST_MIN, (0.04) / Math.max(Math.cos(ie), 0.25));
    if (cam.dist < plancher) cam = { ...cam, dist: plancher };
    let pose = C.pose(cam, hCible());
    // jamais sous le sol : le relief sous la caméra elle-même (pas seulement sous le point visé) fixe une altitude minimale de 35 m
    if (pose.altitude < 400) {
      if (++imageCam % 3 === 0) { const ll = lonLat(pose.cam); hSolCam = globe.tuiles.altitudeSol(ll.lon, ll.lat) * cfg.exag; }
      const manque = hSolCam + 0.035 - pose.altitude;
      if (manque > 0) { cam = { ...cam, dist: cam.dist + manque / Math.max(Math.cos(ie), 0.2) }; pose = C.pose(cam, hCible()); }
    }
    const e = ecran();
    globe.maj(dt, pose, e, { date: dateSimulee, hSol, hSolCam: pose.altitude < 400 ? hSolCam / Math.max(cfg.exag, 1e-6) : 0 });
    noms.maj(dt, { pose, fov: fovRad(), largeur: e.largeur, hauteur: e.hauteur, tuiles: globe.tuiles.affichage(), altitudeSol: globe.tuiles.altitudeSol, exag: cfg.exag, actif: cfg.noms });
    balisesActus.maj(dt, { pose, fov: fovRad(), largeur: e.largeur, hauteur: e.hauteur, jeu: cfg.jeu });
    balisesEvt.maj(dt, { pose, fov: fovRad(), largeur: e.largeur, hauteur: e.hauteur, jeu: cfg.jeu });
    marqueurs.maj(dt, { pose, fov: fovRad(), largeur: e.largeur, hauteur: e.hauteur, actif: cfg.noms && !cfg.jeu && !balisesActus.actif(), sel: actusSel, meteo: lieuMeteo, elements: { actus: actusSel ? fenetres.element('terre-actus') : null, meteo: lieuMeteo ? fenetres.element('terre-meteo') : null } });
    tFenetres += dt;
    if (tFenetres > 0.6) {
      tFenetres = 0;
      const ouv = fenetres.ouvertes();
      if (actusSel && !ouv.includes('terre-actus')) actusSel = null;
      if (lieuMeteo && !ouv.includes('terre-meteo')) lieuMeteo = null;
      chargerPays(); meteoAutomatique(); filAutomatique();
    }
    tFps += dt;
    if (tFps > 0.25) {
      tFps = 0;
      ui.sources(globe.tuiles.sourcesAffichees());
      const m = G.mesures(1000), s = globe.soleil();
      const ll = lonLat([s[0], s[1], s[2]]);
      ui.mesures({ altitude: pose.altitude, lat: cam.lat, lon: ((cam.lon + 540) % 360) - 180, sol: pose.altitude < 400 ? hSol : null, fps: m.fps ? Math.round(m.fps) + ' i/s' : '', details: reglages.fps, tuiles: globe.tuiles.stats, vram: globe.tuiles.vram(),
        soleil: 'zénith ' + Math.abs(ll.lat).toFixed(1) + '° ' + (ll.lat >= 0 ? 'N' : 'S') + ' · ' + Math.abs(ll.lon).toFixed(0) + '° ' + (ll.lon >= 0 ? 'E' : 'O') });
    }
  }

  // ── Fondu noir ──
  const fondu = async (noir, ms = 450) => { ui.fondu.style.transitionDuration = ms + 'ms'; ui.fondu.classList.toggle('noir', noir); await attendre(ms + 30); };

  const api = {
    /* Entre en orbite à l'endroit que regardait la caméra de la galaxie. */
    async entrer({ rapide = false } = {}) {
      if (actif) return;
      actif = true; entreeFinie = false; window.Terre = api;   // la carte légère a pu reprendre window.Terre entre deux visites
      await fondu(true, rapide ? 140 : 380);
      await obtenirModele;
      if (messageVecteur) ui.dire(messageVecteur, 9000);
      const v = G.coordonneesVueTerre();
      if (v) {
        const ll = lonLat(mul(v.dir, R)), b = base(ll.lon, ll.lat);
        const h = v.haut, hd = unit(sub(h, mul(v.dir, dot(h, v.dir))));    // haut de l'écran projeté sur le plan tangent
        cam = C.etatInitial({ lon: ll.lon, lat: ll.lat, dist: Math.max(1000, (v.distance / v.rayon - 1) * R), cap: Math.atan2(dot(hd, b.est), dot(hd, b.nord)), incl: 0 });
      }
      G.nav.selectionner(null);
      noms.vider(); globe.tuiles.forcer(); calculer(); chargerPays(); radarMaj();
      globe.scene.add(G.ciel.groupe);
      G.surcharger({ scene: globe.scene, camera: globe.camera, maj });
      G.nav.deleguer(handlers);
      racine.classList.add('terre-orbite'); ui.montrer(true);
      window.dispatchEvent(new CustomEvent('terre:entree', {}));
      await attendre(rapide ? 40 : 120);
      await fondu(false, rapide ? 320 : 650);
      volerVers({ ...cam, dist: ORBITE.dist, incl: 0 }, rapide ? 1.4 : 2.6);
      entreeFinie = true;
    },
    async sortir() {
      if (!actif) return;
      actif = false; vol = null; geste = null; poussee = 0;
      const rapide = sortieRapide; sortieRapide = false;
      await fondu(true, rapide ? 160 : 420);
      G.surcharger(null); G.nav.deleguer(null);
      G.ciel.groupe.scale.setScalar(1); G.ciel.groupe.position.set(0, 0, 0); G.scene.add(G.ciel.groupe);
      globe.tuiles.vider(); noms.vider(); marqueurs.vider(); balisesActus.vider(); balisesEvt.vider(); filCourant = null; radarArret();
      for (const p of ['france', 'monde', 'pays']) fenetres.fermer('terre-fil-' + p);
      fenetres.fermer('terre-actus'); fenetres.fermer('terre-meteo'); actusSel = null; lieuMeteo = null;
      racine.classList.remove('terre-orbite'); ui.montrer(false);
      window.dispatchEvent(new CustomEvent('terre:sortie', {}));
      await attendre(rapide ? 40 : 120);
      await fondu(false, rapide ? 380 : 600);
    },
    orbite() { volerVers({ lon: cam.lon, lat: cam.lat, dist: ORBITE.dist, incl: 0, cap: 0 }, 2.4); },
    /* Actualités d'un pays (code ISO, ou « MONDE ») : la caméra vole jusqu'au pays, une fenêtre holographique s'ouvre et un trait la relie au repère. */
    async actualites(code, nom) {
      code = String(code || '').toUpperCase();
      const reg = paysListe.find(p => p.code === code);
      if (code !== 'MONDE') { actusSel = code; if (reg) volerVers({ lon: reg.lon, lat: reg.lat, dist: reg.dist, cap: 0, incl: 0 }); } else actusSel = null;
      return fenetres.actualites(code, nom || (reg && reg.nom) || code, reg && Number.isFinite(reg.lat) ? { lat: reg.lat, lon: reg.lon, nom: reg.nom || nom || code, type: 'pays' } : null);
    },
    /* Météo d'un lieu (degrés) : vol jusqu'au lieu, fenêtre météo, et nuages/pluie animés d'après les valeurs réelles. */
    async meteo(lat, lon, nom) {
      lieuMeteo = { lon, lat };
      if (distanceKm(cam.lon, cam.lat, lon, lat) > 5 || cam.dist > 120) volerVers({ lon, lat, dist: 55, cap: 0.2, incl: 0.65 });
      const r = await fenetres.meteo(lat, lon, nom);
      if (r.ok) appliquerMeteoLocale(r.meteo, lon, lat); else lieuMeteo = null;
      return r;
    },
    meteoIci() { return api.meteo(cam.lat, cam.lon, nomLieuProche(cam.lon, cam.lat)); },
    definirMeteoLocale(m) { globe.meteoAnim.definir(m); },
    oublierRadar() { radarIdx = null; radarCharge = 0; },   // pour les tests : force une nouvelle lecture de l'index du radar
    etatB: () => ({ actusSel, lieuMeteo, pays: paysListe.length, repères: marqueurs.nombrePays(), fenetres: fenetres.ouvertes(), radar: { actif: !!(cfg && cfg.radar), rang: radarRang, n: radarIdx ? radarIdx.images.length : 0, panne: radarPanne, lecture: !!radarTimer, ...globe.tuiles.radarEtat() }, meteoLocale: globe.meteoAnim.actuelle(), meteoAuto: { ...meteoAuto } }),
    marqueursEcran: () => marqueurs.liste(),
    /* Événements naturels en direct : o = { types?: ['seisme','incendie',…], severiteMin?: 0..4, vol?: false } ; rend l'état et une phrase parlée. */
    async afficherEvenements(o = {}) {
      balisesEvt.demarrer({ types: o.types || null, severiteMin: o.severiteMin != null ? o.severiteMin : null });
      await balisesEvt.actualiser();
      const e = balisesEvt.etat(), liste = balisesEvt.evenements();
      if (o.vol !== false && e.etat === 'ok' && cam.dist > 9000) volerVers({ lon: cam.lon, lat: cam.lat, dist: Math.min(cam.dist, 9000), cap: 0, incl: 0 }, 1.6);
      const type = o.types && o.types.length === 1 ? o.types[0] : null;
      return { ok: e.etat === 'ok', etat: e, phrase: e.etat === 'ok' ? phraseEvenements(liste.filter(x => !o.types || o.types.includes(x.type)), type) : 'Les sources d’événements naturels sont indisponibles : ' + (balisesEvt.etat().sources.filter(s => s.etat !== 'ok').map(s => s.nom + ' (' + s.raison + ')').join(' ; ') || 'aucune réponse') + '.' };
    },
    masquerEvenements() { balisesEvt.arreter(); return true; },
    evenementsEtat: () => balisesEvt.etat(),
    evenementsEcran: () => balisesEvt.liste(),
    ouvrirEvenement(id) { const e = balisesEvt.trouver(id); return e ? balisesEvt.detail(e) : false; },
    /* Fil d'actualités par sujets : la caméra vole vers la zone, les balises pulsantes apparaissent sur les lieux, les cartes se rangent, le bandeau défile.
       o : { portee: france|monde|pays, pays?, vue?: {lat,lon,dist,nom}, sujets?: ids présentés par Raylé, donnees?: sujets du Worker (copie de ce que l'IA a lu), panneau?: ouvrir la fenêtre }. */
    async afficherFil(o) {
      const portee = ['france', 'monde', 'pays'].includes(o.portee) ? o.portee : 'monde', pays = portee === 'pays' ? String(o.pays || '').toUpperCase() : '';
      const vue = o.vue || (portee === 'france' ? { lat: 46.6, lon: 2.5, dist: 1500, nom: 'France' } : portee === 'monde' ? { lat: 20, lon: 10, dist: ORBITE.dist, nom: 'Monde' } : null);
      if (vue && o.vol !== false) volerVers({ lon: vue.lon, lat: vue.lat, dist: Math.max(C.DIST_MIN, vue.dist), cap: 0, incl: 0 });
      const nomPortee = portee === 'monde' ? 'Monde' : (vue && vue.nom) || (portee === 'france' ? 'France' : pays);   // « Sud-Ouest », « Japon »…
      try {
        let m;
        try { m = modelesFil(await chargerFil(portee, pays)); }
        catch (e) { if (!(o.donnees && o.donnees.length)) throw e; m = { sujets: [], genere: null, perime: false, indisponibles: [], sources: [] }; }   // le Worker de la page ne répond pas, mais l'IA a déjà lu les sujets
        const connus = new Set(m.sujets.map(s => s.id)), extra = (o.donnees || []).map(d => modeleSujet(d)).filter(s => s.titre && s.url && !connus.has(s.id));
        if (extra.length) m = { ...m, sujets: [...extra, ...m.sujets] };
        if (!m.sujets.length) { ui.dire('Aucun sujet d’actualité pour le moment.', 6000); return { ok: false, erreur: 'aucun sujet' }; }
        balisesActus.definir(m, { portee: nomPortee, presentes: o.sujets || [] });
        filCourant = { portee, pays, t: Date.now() };
        if (o.panneau) fenetres.panneauFil(portee, m, nomPortee);
        else for (const p of ['france', 'monde', 'pays']) fenetres.fermer('terre-fil-' + p);   // présentation par Raylé : les cartes prennent la place des panneaux
        return { ok: true, nombre: m.sujets.length, avecLieu: m.sujets.filter(s => s.lieu).length, maj: m.genere };
      } catch (e) {
        const raison = String(e && e.message || e);
        ui.dire('Actualités indisponibles : ' + raison, 9000);
        if (o.panneau) fenetres.panneauFilIndisponible(portee, raison);
        return { ok: false, erreur: raison };
      }
    },
    /* Éclaire un sujet : la caméra vole vers son lieu, sa balise s'illumine (anneaux de zoom), sa carte passe en tête. */
    eclairerSujet(id, { vol = true } = {}) {
      const s = balisesActus.sujet(id); if (!s) return false;
      balisesActus.eclairer(id);
      if (vol && s.lieu) volerVers({ lon: s.lieu.lon, lat: s.lieu.lat, dist: distanceVue(s), cap: 0, incl: 0 }, 1.8);
      return true;
    },
    apaiserSujets() { balisesActus.apaiser(); },
    aSujet: id => !!balisesActus.sujet(id),
    sujetsEtat: () => balisesActus.etat(),
    aller(r) {
      volerVers({ lon: r.lon, lat: r.lat, dist: r.distance || 12, cap: 0, incl: r.distance && r.distance < 60 ? 0.6 : 0 });
      ui.dire(libelle(r), 4000);
    },
    /* Pour les tests, les captures et les ordres vocaux. */
    etat: () => ({ actif, entree: entreeFinie, ...cam, vol: !!vol, altitude: C.pose(cam, hCible()).altitude, sol: hSol, profil: cfg.profil }),
    /* Longitude/latitude du sol sous un pixel de l'écran (coordonnées CSS du canvas), ou null (ciel). */
    pointSous(px, py) { const r = canvas.getBoundingClientRect(), A = C.pointAuSol(C.pose(cam, hCible()), fovRad(), aspect(), (px - r.left) / r.width * 2 - 1, 1 - (py - r.top) / r.height * 2, hCible()); return A ? lonLat(A) : null; },
    volerVers, placer(o) { cam = { ...cam, ...o }; vol = null; inertie = null; zoomRestant = 0; },
    diagnostic: () => globe.tuiles.diagnostic(), stats: () => ({ ...globe.tuiles.stats, vram: globe.tuiles.vram(), chargeur: chargeur.etat(), affichees: globe.tuiles.affichage().map(t => t.cle) }),
    reglages: () => ({ ...reglages }), regler: p => ui.racine && (reglages = REG.normaliser({ ...reglages, ...p }), REG.ecrire(reglages), calculer(), ui.appliquerReglages(reglages), reglages),
    sourcesAffichees: () => globe.tuiles.sourcesAffichees(),
    cameraInfo: () => ({ near: globe.camera.near, far: globe.camera.far, hSolCam, hSol }),
    sourcesRelief: () => globe.tuiles.sourcesRelief(), niveauMax: () => globe.tuiles.niveauMax(), lireUniforme: nom => (globe.partages[nom] ? globe.partages[nom].value : null),
    debogage(nom, v) { if (globe.partages[nom]) globe.partages[nom].value = v; },
    definirDate(d) { dateSimulee = d ? new Date(d) : null; },
    chercher, globe, ui, noms,
    sortirEvenement: () => api.sortir()
  };
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });
  // Ordres de la Terre (déclarés dans son manifeste) : ils passent par le bus d'ordres, comme la voix et l'IA
  if (window.RayleOrdres) {
    const sur = (action, fn) => { try { window.RayleOrdres.enregistrer('terre', action, fn, { delai: 30000 }); } catch (e) { /* ordre non déclaré par le manifeste : ignoré */ } };
    const premier = async texte => (await chercher(texte))[0] || null;
    sur('tourner_vers', async ({ lieu }) => { const l = await premier(lieu); if (!l) return { ok: false, erreur: 'lieu introuvable : « ' + lieu + ' »' }; api.aller(l); return 'En route vers ' + libelle(l) + '.'; });
    sur('afficher_actualites', async ({ pays }) => {
      const l = await premier(pays); if (!l || !l.codePays) return { ok: false, erreur: 'pays introuvable : « ' + pays + ' »' };
      const r = await api.afficherFil({ portee: 'pays', pays: l.codePays, vue: { lat: l.lat, lon: l.lon, dist: 1500, nom: l.nom }, panneau: true });
      return r.ok ? { ok: true, texte: 'Voici l’actualité : ' + l.nom + '.' } : { ok: false, erreur: r.erreur };
    });
    sur('afficher_meteo', async ({ lieu }) => { const l = await premier(lieu); if (!l) return { ok: false, erreur: 'lieu introuvable : « ' + lieu + ' »' }; const r = await api.meteo(l.lat, l.lon, l.nom); return r.ok ? { ok: true, texte: r.phrase } : { ok: false, erreur: r.erreur }; });
  }
  window.Terre = api;
  return api;
}
