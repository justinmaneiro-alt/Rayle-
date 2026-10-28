import * as THREE from 'three';
import * as M from './mars-calcul.js';
import { creerOrbite } from './orbite.js';
import { creerPaysage } from './paysage.js';
import { creerSalon } from './interieur.js';
import { creerHologrammes } from './hologrammes.js';
import { creerPiles, compterParDossier } from './piles-table.js';
import { afficher as afficherMarche, espaceOuvert, fermerEspace, ouvrirEspace, surEspaceFerme } from './trading/fenetre.js';
import { obtenirClient } from './trading/session.js';
/* R2 : le terminal par groupes (fenêtres du gestionnaire commun) est chargé au premier clic sur un panneau du mur ; l'espace de travail d'avant reste pour la voix. */
let modTerminal = null;
const chargerTerminal = quandFerme => import('./trading/terminal-groupes.js').then(T => { modTerminal = T; T.surTerminalFerme(quandFerme); return T; });
const ancienSysteme = () => { try { return localStorage.getItem('rayle_fenetres_v1') === '1'; } catch (e) { return false; } };   // interrupteur de ⚙ : ancien système de fenêtres
const terminalActif = () => !!(modTerminal && modTerminal.terminalOuvert());
import { lireCotations } from './trading/cotations.js';
import { UNITES_DASHBOARD, colonne, lignesContexte } from './trading/dashboard.js';
import { INSTRUMENTS } from './trading/instruments.js';
import { analyserDemande, libelleDemande } from './trading/instruments.js';

/* ═════════════ MARS : MODULE PC ═════════════
   Appelé par la galaxie quand la caméra arrive sur Mars (manifeste modules.pc.entree). `entrer(G)` : fondu, la galaxie dessine la scène de Mars à la place de la sienne
   (G.surcharger), la souris est déléguée ici (G.nav.deleguer), la rotation de Mars s'arrête ; Échap ramène à la galaxie (événement galaxie:sortie).
   Deux scènes : l'ORBITE (la planète et la base vue de l'espace, avec ses deux moitiés BUREAU et TERMINAL) et l'INTÉRIEUR (le salon et sa table holographique).
   Zoomer sur la base fait entrer ; dézoomer au fond du salon fait ressortir (seuils différents : pas de va-et-vient). Tout est paresseux. */
let inst = null, enCours = null;
const attendre = ms => new Promise(r => setTimeout(r, ms));
const facile = e => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
const angleCourt = (de, vers) => { let d = (vers - de) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
const S = M.SEUILS;

export function entrer(G, options = {}) {
  if (!enCours) enCours = (async () => { inst = inst || await construire(G); await inst.entrer(options); })().finally(() => { enCours = null; });
  return enCours;
}
export const sortir = () => inst && inst.sortir();

async function construire(G) {
  const racine = document.getElementById('vueGalaxie');
  if (!document.getElementById('mars-css')) { const l = document.createElement('link'); l.id = 'mars-css'; l.rel = 'stylesheet'; l.href = new URL('./mars.css', import.meta.url).href; document.head.appendChild(l); }
  const tex = G.texturesPlanete('mars');
  if (!tex || !tex.map) throw new Error('texture de Mars introuvable dans la galaxie');

  // ── Interface (DOM) ──
  const ui = document.createElement('div'); ui.id = 'mars-ui'; ui.hidden = true;
  ui.innerHTML = '<div class="m-etiquettes"><button type="button" class="m-etiq bureau" data-zone="bureau" hidden><b>Bureau</b><small>BIENTÔT</small></button><button type="button" class="m-etiq terminal" data-zone="terminal" hidden><b>Terminal de trading</b><small>ENTRER</small></button></div>'
    + '<div class="m-titre"><b>M A R S</b><span id="m-sous-titre">Base Raylé</span></div>'
    + '<div class="m-boutons"><button type="button" id="m-entrer">Entrer dans la base</button><button type="button" id="m-sortir-base" hidden>Sortir de la base</button><button type="button" id="m-quitter">Quitter Mars</button></div>'
    + '<div class="m-aide" id="m-aide"></div>'
    + '<div class="m-heure"><span>HEURE SIMULÉE</span><b id="m-heure-txt">17:24</b><input type="range" id="m-heure" min="0" max="24" step="0.05" aria-label="Heure solaire locale simulée"><button type="button" id="m-auto" title="Faire défiler le temps">⏵</button></div>'
    + '<div class="m-message" id="m-message" hidden></div><div class="m-fondu" id="m-fondu"></div>';
  racine.appendChild(ui);
  const $ = id => ui.querySelector('#' + id);
  const fonduEl = $('m-fondu'), messageEl = $('m-message');
  let minuteurMessage = 0;
  const dire = (txt, ms = 5000) => { messageEl.textContent = txt; messageEl.hidden = false; messageEl.style.opacity = 1; clearTimeout(minuteurMessage); minuteurMessage = setTimeout(() => { messageEl.style.opacity = 0; setTimeout(() => { messageEl.hidden = true; }, 380); }, ms); };
  const fondu = async (noir, ms = 450) => { fonduEl.style.transitionDuration = ms + 'ms'; fonduEl.classList.toggle('noir', noir); await attendre(ms + 30); };

  // ── État ──
  let profil = M.profil(G.info().qualite, G.jeu()), orb = null, int = null;
  let mode = 'off', actif = false, transition = false, entreeFinie = false;
  let heure = M.HEURE_DEPART, auto = true, heureSim = 0, tTotal = 0;
  let distCible = S.ORBITE_DEPART, entreeVoulue = false, bloqueJusqua = 0, poussee = 0, vol = null, geste = null, inertie = null;
  let pincement = 0;
  let yaw = 0, pitch = -0.07, avancee = 0, poussInt = 0, intVitYaw = 0;
  const canvas = G.canvas, ecran = () => ({ l: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
  const ndc = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2]; };
  let tailleVue = [0, 0];
  const tactile = () => profil.niveau === 'basse' || profil.niveau === 'jeu';
  const terminalV2 = opts => chargerTerminal(() => { if (int) int.holo.espaceFerme(); }).then(T => T.ouvrirTerminal({ tactile: tactile(), sansSelecteur: true, ouvrirEspace: d => ouvrirEspace(d, { tactile: tactile() }), ouvrirPoste: d => import('./trading/fenetre-agent.js').then(P => P.ouvrirPoste(d)), ...opts }));

  function construireOrbite() { if (orb) { orb.dispose(); } orb = creerOrbite({ profil, textureMars: tex.map, ciel: G.ciel }); }
  function construireInterieur() {
    if (int) { return; }
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xaa7755, 0.0002);
    const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 12000);
    const paysage = creerPaysage({ profil, ciel: G.ciel }); scene.add(paysage.groupe);
    const salon = creerSalon({ profil }); scene.add(salon.groupe);
    const ancienne = () => creerHologrammes({ parent: salon.groupe, centreTable: [0, 0, -0.6], ouvrirEspace: o => ((o && (o.focus === 'agent' || o.dock === 'agent')) ? import('./trading/fenetre-agent.js').then(M => M.ouvrirPoste({ onglet: o.onglet, paire: o.paire })) : (() => { const tactile = profil.niveau === 'basse' || profil.niveau === 'jeu'; try { if (localStorage.getItem('rayle_mars_ancien_espace') === '1') return ouvrirEspace(o, { tactile }); } catch (e) { /* stockage interdit */ } return chargerTerminal(() => { if (int) int.holo.espaceFerme(); }).then(T => T.ouvrirTerminal({ panneau: o && o.fenetre, tactile, ouvrirEspace: d => ouvrirEspace(d, { tactile }), ouvrirPoste: d => import('./trading/fenetre-agent.js').then(P => P.ouvrirPoste(d)) })); })()), fermerEspace: () => { fermerEspace(); if (modTerminal) modTerminal.fermerTerminal(); } });
    /* V2 : les PILES sur la table (par défaut) ; l'ancien mur de 21 fenêtres (grandes fenêtres au clic) reste derrière l'interrupteur ⚙ « Utiliser l'ancien système de fenêtres ». */
    const holo = ancienSysteme() ? ancienne() : creerPiles({
      parent: salon.groupe, centreTable: [0, 0, -0.6],
      ouvrirDossier: gid => { if (gid === 'ouvertes') { if (window.TiroirFenetres) window.TiroirFenetres.ouvrir(); return; } terminalV2().then(T => T.ouvrirDossier(gid)); },
      ouvrirPanneau: id => { terminalV2({ panneau: id }); },
      fermerTout: () => { if (modTerminal) modTerminal.fermerTerminal(); },
      compteurs: () => (terminalActif() ? compterParDossier(modTerminal.terminal().etat().fenetres) : {}), estOuvert: terminalActif
    });
    scene.environmentIntensity = 0.85;
    int = { scene, camera, paysage, salon, holo, pmrem: null, envTexture: null, heureEnv: -99, tEnv: -99 };
  }
  function disposerInterieur() {
    if (!int) return;
    int.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const l = Array.isArray(o.material) ? o.material : [o.material]; l.forEach(m => { if (m.map && m !== tex.map) m.map.dispose(); m.dispose(); }); } });
    if (int.envTexture) int.envTexture.dispose(); if (int.pmrem) int.pmrem.dispose(); int = null;
  }
  function verifierProfil() {
    const p = M.profil(G.info().qualite, G.jeu());
    if (orb && (p.niveau !== profil.niveau)) { profil = p; disposerInterieur(); construireOrbite(); }
    profil = p;
  }

  // Carte d'environnement (reflets du sol et des vitres), régénérée quand le ciel a bien changé
  function majEnvironnement(force = false) {
    if (!int || !profil.reflets) return;
    if (!force && (Math.abs(heure - int.heureEnv) < 0.5 || tTotal - int.tEnv < 4)) return;
    if (!int.pmrem) { int.pmrem = new THREE.PMREMGenerator(G.renderer); }
    const sc = int.paysage.sceneEnvironnement(), rt = int.pmrem.fromScene(sc, 0.02);
    if (int.envTexture) int.envTexture.dispose(); int.envTexture = rt.texture; int.scene.environment = rt.texture; int.heureEnv = heure; int.tEnv = tTotal;
  }

  // ── Données réelles des fenêtres de la table (Worker : /marche) : abonnements ouverts seulement dans le salon ──
  let arretsDonnees = [];
  function arreterDonnees() { for (const f of arretsDonnees) { try { f(); } catch (e) { /* déjà arrêté */ } } arretsDonnees = []; }
  async function demarrerDonnees() {
    arreterDonnees();
    let client; try { client = await obtenirClient(); } catch (e) { return; }
    if (mode !== 'interieur' || !int) return;
    const reelDe = (r, unite) => (r.vide ? (r.erreur ? { etat: 'indisponible', erreur: r.erreur } : { etat: 'chargement' }) : { etat: 'ok', bougies: r.bougies, meta: r.meta, volume: r.volume, unite });
    for (const [fenetreId, ins] of [['graphique-us100', 'US100'], ['graphique-or', 'XAU'], ['graphique-btc', 'BTC'], ['graphique-sol', 'SOL'], ['graphique-doge', 'DOGE']])
      arretsDonnees.push(client.abonner(ins, 'H1', r => { if (int) int.holo.majReel(fenetreId, reelDe(r, 'H1')); }, { tick: 20000 }));
    const boucle = async () => { try { const cot = await lireCotations(client); if (int && mode === 'interieur') int.holo.majReel('marche', { etat: cot.some(q => !q.vide) ? 'ok' : 'indisponible', cotations: cot, erreur: (cot.find(q => q.erreur) || {}).erreur }); } catch (e) { if (int) int.holo.majReel('marche', { etat: 'indisponible', erreur: String(e && e.message || e) }); } };
    boucle(); const t = setInterval(boucle, 120000); arretsDonnees.push(() => clearInterval(t));
    // dashboard analytique (US100, 4 unités) et contexte de marché (route /contexte) : mêmes calculs que dans l'espace de travail
    const tableau = async () => {
      try {
        const ins = INSTRUMENTS.US100, series = []; for (const u of UNITES_DASHBOARD) { series.push(await client.serie('US100', u)); if (!int || mode !== 'interieur') return; }
        const colonnes = series.map(r => colonne(r.bougies)), m = series.map(r => r.meta).find(Boolean);
        int.holo.majReel('dashboard', colonnes.some(c => c.dispo) ? { etat: 'ok', colonnes, instrument: ins.court, source: m ? m.source : null, perime: !!(m && m.perime) } : { etat: 'indisponible', erreur: (series.find(r => r.erreur) || {}).erreur || 'pas assez de bougies' });
      } catch (e) { if (int) int.holo.majReel('dashboard', { etat: 'indisponible', erreur: String(e && e.message || e) }); }
    };
    tableau(); const t2 = setInterval(tableau, 180000); arretsDonnees.push(() => clearInterval(t2));
    const contexte = async () => {
      try { const c = lignesContexte(await client.appeler('/contexte')); if (int && mode === 'interieur') int.holo.majReel('contexte', c.lignes.some(l => l.prix != null) ? { etat: 'ok', lignes: c.lignes, sources: c.sources.join(', '), perime: c.etiquettes.includes('ancienne copie') } : { etat: 'indisponible', erreur: 'aucune cotation' }); }
      catch (e) { if (int) int.holo.majReel('contexte', { etat: 'indisponible', erreur: String(e && e.message || e) }); }
    };
    contexte(); const t3 = setInterval(contexte, 180000); arretsDonnees.push(() => clearInterval(t3));
    // Agent BTC : la fenêtre lit l'état de l'agent Kepler (service du PC, sinon Worker) : mise à jour dans fenetres-m6.js (V3b). L'ancien agent du navigateur n'est plus démarré ici.
    demarrerFinance();
    // M6 : les six fenêtres de performance de l'agent (gardien prop, journal et tilt, propositions, performance, régime, probabilité de réussite)
    try { const M6 = await import('./trading/fenetres-m6.js'); const stop = M6.demarrerFenetresM6({ majReel: (id, r) => { if (int) int.holo.majReel(id, r); }, actif: () => !!int && mode === 'interieur' }); arretsDonnees.push(stop); } catch (e) { for (const id of ['gardien-prop', 'journal-tilt', 'propositions-agent', 'perf-strategies', 'regime-marche', 'proba-evaluation']) if (int) int.holo.majReel(id, { etat: 'indisponible', erreur: String(e && e.message || e) }); }
  }
  /* Hub Finance (nuit n° 2) : cinq fenêtres de la table alimentées par des sources gratuites (CFTC, Trésor, BLS, flux publics, calendriers). Chaque fenêtre porte l'étiquette de sa donnée
     (RÉEL / DIFFÉRÉ / PÉRIMÉ / INDISPO) ; une source en panne affiche sa raison, jamais un chiffre inventé. La fenêtre « Alertes » lit le Veilleur. */
  async function demarrerFinance() {
    let F, COT, CAL, TAUX, FLUX; try { [F, COT, CAL, TAUX, FLUX] = await Promise.all([import('./finance/donnees.js'), import('./finance/cot-calcul.js'), import('./finance/calendrier-calcul.js'), import('./finance/taux-calcul.js'), import('./finance/flux-calcul.js')]); } catch (e) { return; }
    const fin = F.obtenirFinance(), vivant = () => int && mode === 'interieur';
    const publier = (id, r, fabriquer) => { if (!vivant()) return; if (r.etat !== 'ok') { int.holo.majReel(id, { etat: 'indisponible', erreur: r.raison }); return; } try { int.holo.majReel(id, { etat: 'ok', etiquette: r.etiquette, ...fabriquer(r) }); } catch (e) { int.holo.majReel(id, { etat: 'indisponible', erreur: String(e && e.message || e) }); } };
    const f2 = (x, d = 2) => (x == null ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
    const couleurImpact = i => (i === 'high' || i === 'fort' ? '#ff6b6b' : i === 'medium' || i === 'moyen' ? '#ffb347' : '#8fb2c3');
    const boucler = (f, ms) => { f(); const t = setInterval(f, ms); arretsDonnees.push(() => clearInterval(t)); };
    boucler(async () => publier('calendrier', await fin.calendrier(), r => {
      const m = Date.now(), l = CAL.filtrerCalendrier(r.evenements, { impactMin: 'medium', de: m - 3600e3, a: m + 7 * 86400e3 }).slice(0, 5);
      return { entete: 'Prochains événements (heure de Paris)', liste: l.map(e => ({ g: CAL.heureParis(e.t) + ' ' + e.pays + ' ' + e.titre.replace(/^Fed · /, ''), d: CAL.compteARebours(e.t, m), c: couleurImpact(e.impact) })), vide: 'Aucun événement important à venir', pied: r.sources.filter(s => s.etat === 'ok').length + '/' + r.sources.length + ' sources' };
    }), 120000);
    boucler(async () => {
      const ids = ['NDX', 'XAU', 'BTC'], res = await Promise.all(ids.map(id => fin.cot(id))), ok = res.filter(r => r.etat === 'ok');
      if (!ok.length) { publier('cot', res[0], () => ({})); return; }
      publier('cot', ok[0], () => {
        const date = ok[0].analyse.date; return { entete: 'Spéculateurs · net · percentile 3 ans', liste: ok.map(r => { const c = r.analyse.categories.find(x => x.spec); return { g: COT.CONTRATS_COT[r.contrat].id + ' ' + (c.net > 0 ? 'net acheteur' : 'net vendeur'), d: (c.net > 0 ? '+' : '') + Math.round(c.net).toLocaleString('fr-FR') + ' · ' + (c.percentile == null ? '—' : c.percentile + 'e'), c: c.extreme ? '#ffb347' : '#cfeaff' }; }), pied: 'CFTC · mardi ' + date };
      });
    }, 1800000);
    boucler(async () => publier('actus-finance', await fin.flux('actus'), r => {
      const l = r.items.filter(i => i.classe.impact !== 'faible').slice(0, 5); return { entete: 'À la une par impact (règles, pas d’IA)', liste: l.map(i => ({ g: i.titre, c: couleurImpact(i.classe.impact) })), vide: 'Aucun titre important', pied: r.sources.filter(s => s.etat === 'ok').length + ' flux' };
    }), 180000);
    boucler(async () => publier('banques', await fin.flux('banques'), r => {
      const l = r.items.slice(0, 5), age = t => { if (!t) return ''; const j = Math.floor((Date.now() - t) / 86400e3); return j <= 0 ? 'auj.' : j + ' j'; }; return { entete: 'Publications officielles', liste: l.map(i => ({ g: (i.banque || '') + ' · ' + i.titre, d: age(i.t), c: '#cfeaff' })), vide: 'Aucune publication', pied: 'sources officielles' };
    }), 300000);
    boucler(async () => {
      const [c, b] = await Promise.all([fin.courbe(), fin.bls()]);
      publier('taux', c, r => {
        const g = e => r.courbe.lignes.find(l => l.echeance === e), liste = ['2Y', '10Y', '30Y'].filter(g).map(e => ({ g: e === '2Y' ? '2 ans' : e === '10Y' ? '10 ans' : '30 ans', d: f2(g(e).taux) + ' %  ' + (g(e).jour > 0 ? '+' : '') + g(e).jour + ' pb', c: '#cfeaff' }));
        liste.push({ g: 'Écart 2s10s', d: (r.courbe.ecarts['2s10s'] > 0 ? '+' : '') + r.courbe.ecarts['2s10s'] + ' pb', c: r.courbe.inversion2s10s ? '#ff6b6b' : '#cfeaff' });
        if (b.etat === 'ok' && b.donnees.chomage) liste.push({ g: 'Chômage US', d: f2(b.donnees.chomage[0].valeur, 1) + ' %', c: '#cfeaff' });
        return { entete: 'Courbe américaine · ' + r.courbe.date, liste, pied: 'Trésor américain · BLS' };
      });
    }, 900000);
    // Alertes du Veilleur
    const alertes = () => {
      if (!vivant()) return; const P = window.VeilleurPage;
      if (!P || P.disponible() === false) { int.holo.majReel('alertes', { etat: 'indisponible', erreur: 'Veilleur : application PC requise' }); return; }
      if (P.disponible() === null) return;
      const e = P.etat(), a = P.alertes().slice(0, 4), tn = { ENTREE: 'ENTRÉE', PREPARATION: 'PRÉPARATION', OBSERVATION: 'OBSERVATION', MACRO: 'MACRO' };
      int.holo.majReel('alertes', { etat: 'ok', etiquette: e && e.enMarche ? 'RÉEL' : 'PÉRIMÉ', entete: (e && e.enMarche ? 'Veilleur en marche' : 'Veilleur ARRÊTÉ') + (e && e.reglages && e.reglages.actif ? ' · activé' : ' · désactivé'),
        liste: a.map(x => ({ g: (tn[x.type] || x.type) + ' · ' + String(x.resume || '').replace(/^PRÉPARATION · /, ''), c: x.type === 'ENTREE' ? '#41e0a0' : x.type === 'MACRO' ? '#ffb347' : '#cfeaff' })), vide: 'Aucune alerte (normal sans stratégie validée)', pied: 'Bitcoin M15 · Telegram + application' });
    };
    alertes(); const offA = window.VeilleurPage ? window.VeilleurPage.surChangement(alertes) : null; const tA = setInterval(alertes, 30000); arretsDonnees.push(() => { clearInterval(tA); if (offA) offA(); });
  }
  surEspaceFerme(() => { if (int) int.holo.espaceFerme(); });

  // ── Orbite : vol de caméra, zoom, entrée automatique ──
  function volOrbite(vers, duree) {
    return new Promise(res => { const v = orb.vue; if (vol) vol.fin(false); vol = { de: { lon: v.lon, lat: v.lat, dist: v.dist }, vers, t: 0, duree, fin: ok => { vol = null; res(ok); } }; });
  }
  function majOrbite(dt) {
    const v = orb.vue;
    if (vol) {
      vol.t += dt / vol.duree; const e = facile(Math.min(1, vol.t));
      v.lon = vol.de.lon + angleCourt(vol.de.lon, vol.vers.lon) * e; v.lat = vol.de.lat + (vol.vers.lat - vol.de.lat) * e;
      v.dist = vol.de.dist + (vol.vers.dist - vol.de.dist) * e + Math.sin(Math.PI * e) * 0.1 * Math.abs(vol.vers.dist - vol.de.dist); distCible = v.dist;
      if (vol.t >= 1) { v.lon = vol.vers.lon; v.lat = vol.vers.lat; v.dist = distCible = vol.vers.dist; vol.fin(true); }
    } else {
      const avant = v.dist;
      v.dist += (distCible - v.dist) * (1 - Math.exp(-dt * 9));
      const zoomAvant = distCible < v.dist - 0.02;
      if (zoomAvant && !geste) {                             // « zoom sur la base » : la caméra glisse doucement vers elle quand elle est dans l'axe
        const f = M.forceAssist(v.dist, orb.angleBase());
        if (f > 0) { const k = 1 - Math.exp(-dt * f * 3.2); v.lon += angleCourt(v.lon, M.BASE.lon) * k; v.lat += (M.BASE.lat - v.lat) * k; }
      }
      if (inertie && !geste) { v.lon += inertie.vLon * dt; v.lat = Math.max(-85, Math.min(85, v.lat + inertie.vLat * dt)); const f = Math.exp(-dt * 3.4); inertie.vLon *= f; inertie.vLat *= f; if (Math.abs(inertie.vLon) + Math.abs(inertie.vLat) < 0.02) inertie = null; }
      if (mode === 'orbite' && !transition && M.peutEntrer({ distCentre: v.dist, angleBase: orb.angleBase(), molettePositive: entreeVoulue, maintenant: performance.now(), bloqueJusqua })) api.entrerBase();
    }
    v.lon = ((v.lon + 540) % 360) - 180;
  }

  // ── Intérieur : tête (lacet / tangage) et avancée sur l'axe de la pièce ──
  const P0 = new THREE.Vector3(0.0, 1.62, 3.6), P1 = new THREE.Vector3(0.0, 1.6, 1.5);
  function majInterieur(dt) {
    const c = int.camera;
    yaw += intVitYaw * dt; intVitYaw *= Math.exp(-dt * 6);
    c.position.lerpVectors(P0, P1, avancee);
    c.rotation.set(pitch, yaw, 0, 'YXZ');
    int.holo.maj(tTotal);
  }

  // ── Souris (déléguée par la navigation de la galaxie) ──
  const doigts = new Map();   // pointeurs tactiles actifs (pincement)
  const ecartDoigts = () => { const [a, b] = [...doigts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const handlers = {
    pointerdown(e) {
      if (transition) return;
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.isPrimary) doigts.clear();   // premier doigt d'un nouveau geste : aucun autre doigt ne peut être posé
      if (e.pointerType === 'touch') { doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (doigts.size === 2) { geste = null; inertie = null; pincement = ecartDoigts(); return; } }
      if (vol) vol.fin(false); inertie = null; intVitYaw = 0;
      geste = { x: e.clientX, y: e.clientY, bouge: 0, dernier: performance.now(), v: null, bouton: e.button };
    },
    pointermove(e) {
      if (doigts.has(e.pointerId)) { doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (doigts.size === 2) { const n = ecartDoigts(); if (pincement) zoomer((pincement - n) * 3.2); pincement = n; return; } }
      if (!geste) {
        if (mode === 'interieur' && int && !transition) { const h = int.holo.viser(ndc(e), int.camera); int.holo.survoler(h); canvas.style.cursor = h ? 'pointer' : ''; }
        else if (mode === 'orbite' && orb && !transition) canvas.style.cursor = orb.viserZone(ndc(e)) ? 'pointer' : '';
        return;
      }
      const dx = e.clientX - geste.x, dy = e.clientY - geste.y; geste.x = e.clientX; geste.y = e.clientY; geste.bouge += Math.abs(dx) + Math.abs(dy);
      const { h } = ecran();
      if (mode === 'orbite') {
        const v = orb.vue, alt = Math.max(1, v.dist - M.R), deg = alt * 0.768 / (h * M.R) * 180 / Math.PI, maintenant = performance.now(), dt = Math.max(0.004, (maintenant - geste.dernier) / 1000);
        const dLon = -dx * deg, dLat = dy * deg; geste.dernier = maintenant;
        v.lon += dLon; v.lat = Math.max(-85, Math.min(85, v.lat + dLat)); geste.v = { vLon: dLon / dt, vLat: dLat / dt };
      } else if (mode === 'interieur') { yaw -= dx * 0.0042; pitch = Math.max(-1.1, Math.min(1.1, pitch - dy * 0.0042)); intVitYaw = 0; }
    },
    pointerup(e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
      const etaitPincement = doigts.size === 2; doigts.delete(e.pointerId); if (doigts.size < 2) pincement = 0;
      if (etaitPincement) { geste = null; return; }
      const g = geste; geste = null; if (!g || transition) return;
      if (g.bouge < 5 && g.bouton === 0) {
        if (mode === 'interieur') {
          const id = int.holo.viser(ndc(e), int.camera);
          if (id) int.holo.ouvrir(id); else if (!terminalActif()) int.holo.fermer();   // clic sur une fenêtre : en grand ; clic ailleurs : la ferme (sauf le terminal par groupes : Échap ou ✕)
        } else if (mode === 'orbite') {
          const z = orb.viserZone(ndc(e)); if (z) api.choisirZone(z);
        }
        return;
      }
      if (mode === 'orbite' && g.v && performance.now() - g.dernier < 90 && Math.abs(g.v.vLon) + Math.abs(g.v.vLat) > 3) inertie = { ...g.v };
    },
    pointercancel(e) { doigts.delete(e.pointerId); pincement = 0; geste = null; },
    wheel(e) { zoomer(e.deltaY * (e.deltaMode === 1 ? 33 : 1)); },
    dblclick() { }
  };
  /* Zoom : d > 0 recule, d < 0 avance (unités de la molette ; un pincement tactile est converti). */
  function zoomer(d) {
    {
      if (transition) return;
      if (mode === 'orbite') {
        if (vol) vol.fin(false);
        if (d > 0 && distCible >= S.SORTIE_GALAXIE * 0.995) {                            // dézoomer au maximum et insister : retour à la galaxie
          const r = M.pousser(poussee, d, S.SORTIE_POUSSEE); poussee = r.cumul; if (r.sortir) { sortirParZoom(); return; }
        } else poussee = 0;
        entreeVoulue = d < 0;
        const alt = Math.max(0.5, distCible - M.R); distCible = Math.max(S.DIST_MIN, Math.min(S.DIST_MAX, M.R + alt * Math.exp(d * 0.0016)));
      } else if (mode === 'interieur') {
        if (d > 0 && avancee <= 0.001) { const r = M.pousser(poussInt, d, S.INT_POUSSEE); poussInt = r.cumul; if (r.sortir) { api.sortirBase(); return; } }
        else poussInt = 0;
        avancee = Math.max(0, Math.min(1, avancee - d * 0.0011));
      }
    }
  }
  function sortirParZoom() {
    G.orienterVersPlanete('mars', orb.direction(), orb.vue.dist / M.R);
    G.nav.fermerSas();                                              // événement galaxie:sortie → api.sortir()
    sortieRapide = true;
  }
  let sortieRapide = false, exposureAvant = null;
  const touche = e => {
    if (!actif) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target && e.target.tagName)) return;
    if (e.key === 'Escape') {
      if (mode === 'interieur' && int && int.holo.ouvert()) { int.holo.fermer(); e.stopImmediatePropagation(); return; }
      if (mode === 'interieur') { e.stopImmediatePropagation(); api.sortirBase(); return; }
    }
  };
  window.addEventListener('keydown', touche, true);

  // ── Boutons et curseurs ──
  $('m-entrer').addEventListener('click', () => api.entrerBase());
  $('m-sortir-base').addEventListener('click', () => api.sortirBase());
  $('m-quitter').addEventListener('click', () => G.nav.fermerSas());
  ui.querySelectorAll('.m-etiq').forEach(b => b.addEventListener('click', () => api.choisirZone(b.dataset.zone)));
  const curseur = $('m-heure'), btnAuto = $('m-auto');
  curseur.addEventListener('input', () => { auto = false; btnAuto.textContent = '⏵'; api.definirHeure(Number(curseur.value)); });
  btnAuto.addEventListener('click', () => { auto = !auto; btnAuto.textContent = auto ? '⏸' : '⏵'; });
  const format = h => { const t = ((h % 24) + 24) % 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };

  function majInterface() {
    const o = mode === 'orbite', i = mode === 'interieur';
    $('m-entrer').hidden = !o; $('m-sortir-base').hidden = !i; $('m-quitter').hidden = !(o || i) && !actif;
    $('m-sous-titre').textContent = i ? M.BASE.nom + ' · salon du terminal' : M.BASE.nom + ' · ' + M.BASE.site;
    $('m-aide').textContent = i ? 'Glisser : regarder autour · Molette : avancer vers la table, reculer pour ressortir · Clic sur une fenêtre : l’ouvrir · Clic ailleurs : la fermer · Échap : sortir de la base'
      : 'Glisser : faire tourner Mars · Molette : zoom (zoomez sur la base pour entrer) · Clic sur TERMINAL : entrer · BUREAU : bientôt · Échap : retour à la galaxie';
  }

  /* Écran en hauteur (téléphone) : champ de vision plus large pour voir toute la table et les fenêtres. */
  function ajusterCameraInterieur() { const a = ecran().l / Math.max(1, ecran().h); int.camera.aspect = a; int.camera.fov = a < 1 ? Math.min(104, 72 / Math.pow(a, 0.55)) : 72; int.camera.updateProjectionMatrix(); }

  // ── Une image ──
  function maj(dt, t) {
    tTotal += dt; heureSim += dt * 0.02;
    if (auto) heure = (heure + dt * 0.02) % 24;
    curseur.value = heure; $('m-heure-txt').textContent = format(heure);
    const { l, h } = ecran();
    if (l !== tailleVue[0] || h !== tailleVue[1]) { tailleVue = [l, h]; orb.redimensionner(l, h); if (int) ajusterCameraInterieur(); }
    if (mode === 'orbite') {
      majOrbite(dt);
      const info = orb.maj(dt, tTotal, heure, heureSim);
      // étiquettes de la base : seulement quand on s'en approche
      const proches = orb.vue.dist < M.R + 62 && !transition, pos = proches ? orb.projeterAncres(l, h) : null;
      ui.querySelectorAll('.m-etiq').forEach(b => {
        const p = pos && pos[b.dataset.zone], vis = !!(p && p.visible);
        b.hidden = !proches; b.dataset.cache = vis ? '0' : '1';
        if (vis) b.style.transform = 'translate(' + (p.x).toFixed(1) + 'px,' + (p.y).toFixed(1) + 'px) translate(-50%,-100%)';
      });
    } else if (mode === 'interieur') {
      int.paysage.reglerHeure(heure, heureSim, int.scene, true);
      int.paysage.maj(tTotal); int.salon.maj(tTotal, int.paysage.etat.nuit);
      majEnvironnement();
      majInterieur(dt);
    }
  }

  // ── Bascules de scène ──
  function afficherScene(scene, camera, fn) { G.surcharger({ scene, camera, maj: fn }); }
  function versOrbite(vue) {
    arreterDonnees();
    if (int) { int.holo.fermer(); G.renderer.shadowMap.enabled = false; }
    if (exposureAvant !== null) { G.renderer.toneMappingExposure = exposureAvant; exposureAvant = null; }
    orb.scene.add(G.ciel.groupe); G.ciel.groupe.quaternion.identity();
    Object.assign(orb.vue, vue); distCible = orb.vue.dist; vol = null; inertie = null;
    mode = 'orbite'; afficherScene(orb.scene, orb.camera, maj); majInterface();
    for (const b of ui.querySelectorAll('.m-etiq')) b.hidden = true;
  }
  function versInterieur() {
    construireInterieur();
    G.renderer.shadowMap.enabled = profil.ombres > 0; G.renderer.shadowMap.type = THREE.PCFSoftShadowMap; exposureAvant = G.renderer.toneMappingExposure; G.renderer.toneMappingExposure = 0.78;
    int.paysage.pivotCiel.add(G.ciel.groupe);
    int.paysage.reglerHeure(heure, heureSim, int.scene, true); majEnvironnement(true);
    yaw = 0; pitch = -0.07; avancee = 0; poussInt = 0; intVitYaw = 0;
    ajusterCameraInterieur();
    mode = 'interieur'; afficherScene(int.scene, int.camera, maj); majInterface();
    for (const b of ui.querySelectorAll('.m-etiq')) b.hidden = true;
    demarrerDonnees();
  }

  const api = {
    /* Arrivée depuis la galaxie : on regarde la base de loin, côté jour. */
    async entrer({ rapide = false } = {}) {
      if (actif) return;
      actif = true; entreeFinie = false; transition = true; verifierProfil();
      await fondu(true, rapide ? 140 : 380);
      if (!orb) construireOrbite();
      entreeVoulue = false; poussee = 0; bloqueJusqua = performance.now() + 800;
      G.nav.selectionner(null);
      versOrbite({ lon: M.BASE.lon - 38, lat: M.BASE.lat + 12, dist: S.ORBITE_DEPART });
      G.nav.deleguer(handlers);
      racine.classList.add('mars-orbite'); ui.hidden = false;
      window.dispatchEvent(new CustomEvent('mars:entree', {}));
      await attendre(rapide ? 40 : 120);
      await fondu(false, rapide ? 320 : 650);
      transition = false; entreeFinie = true;
      volOrbite({ lon: M.BASE.lon - 3, lat: M.BASE.lat + 4, dist: M.R + 46 }, rapide ? 1.4 : 2.8);   // s'approche de la base
    },
    async sortir() {
      if (!actif) return;
      transition = true; if (vol) vol.fin(false);
      const rapide = sortieRapide; sortieRapide = false;
      await fondu(true, rapide ? 160 : 420);
      arreterDonnees();
      if (int) { int.holo.fermer(); G.renderer.shadowMap.enabled = false; }
      if (exposureAvant !== null) { G.renderer.toneMappingExposure = exposureAvant; exposureAvant = null; }
      G.surcharger(null); G.nav.deleguer(null);
      G.ciel.groupe.scale.setScalar(1); G.ciel.groupe.position.set(0, 0, 0); G.ciel.groupe.quaternion.identity(); G.scene.add(G.ciel.groupe);
      actif = false; mode = 'off'; geste = null; entreeVoulue = false;
      disposerInterieur();
      racine.classList.remove('mars-orbite'); ui.hidden = true; canvas.style.cursor = '';
      window.dispatchEvent(new CustomEvent('mars:sortie', {}));
      await attendre(rapide ? 40 : 120);
      await fondu(false, rapide ? 380 : 600);
      transition = false;
    },
    /* Entre dans la base : la caméra file vers elle, fondu, le salon. */
    async entrerBase() {
      if (!actif || transition) return mode === 'interieur';
      if (mode === 'interieur') return true;
      transition = true;
      const ok = await volOrbite({ lon: M.BASE.lon, lat: M.BASE.lat, dist: M.R + 8 }, 1.5);
      if (!ok || !actif) { transition = false; return false; }
      await fondu(true, 240);                                   // V2 : fondu court (le vol d'approche a déjà rempli l'écran par la base), pas de pause noire
      versInterieur();
      window.dispatchEvent(new CustomEvent('mars:base', { detail: { dedans: true } }));
      await attendre(30);
      await fondu(false, 620);
      transition = false; return true;
    },
    /* Ressort : la caméra reparaît bien plus haut que le seuil d'entrée (pas de va-et-vient). */
    async sortirBase() {
      if (!actif || transition || mode !== 'interieur') return mode !== 'interieur';
      transition = true;
      await fondu(true, 240);
      versOrbite({ lon: M.BASE.lon - 4, lat: M.BASE.lat + 3, dist: S.SORTIE_BASE_DIST });
      bloqueJusqua = performance.now() + S.BLOCAGE_MS; entreeVoulue = false;
      window.dispatchEvent(new CustomEvent('mars:base', { detail: { dedans: false } }));
      await attendre(30);
      await fondu(false, 620);
      transition = false; return true;
    },
    choisirZone(zone) {
      if (zone === 'bureau') { dire(M.ZONES_BASE.bureau.message, 5500); window.dispatchEvent(new CustomEvent('mars:bureau', {})); return { ok: true, bientot: true }; }
      api.entrerBase(); return { ok: true };
    },
    definirHeure(h) { heure = ((Number(h) % 24) + 24) % 24; curseur.value = heure; if (int) int.paysage.reglerHeure(heure, heureSim, int.scene, true); },
    ouvrirFenetre(id) { return mode === 'interieur' && int ? int.holo.ouvrir(id) : false; },
    /* « montre-moi l'or en H1 » : entre dans la base si besoin, ouvre l'espace de travail et règle l'instrument / l'unité. */
    async afficherGraphique({ instrument, unite, source }) {
      if (!actif) return { ok: false, erreur: 'Mars n’est pas ouverte' };
      if (mode !== 'interieur') { const ok = await api.entrerBase(); if (!ok) return { ok: false, erreur: 'impossible d’entrer dans la base' }; }
      if (!ancienSysteme() && instrument && source !== 'tv' && source !== 'rayle') {            // V2 : « montre-moi l'or en H1 » pose une fenêtre vivante sur l'écran (TradingView / Raylé : l'espace complet, comme avant)
        try { const T = await terminalV2(); T.ouvrirGraphique(instrument, unite || 'H1'); return { ok: true, libelle: libelleDemande(instrument, unite) || instrument }; }
        catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
      }
      try { const libelle = await afficherMarche({ instrument, unite, source }, { tactile: profil.niveau === 'basse' || profil.niveau === 'jeu' }); if (int) int.holo.marquerOuvert('espace'); return { ok: true, libelle }; }
      catch (e) { return { ok: false, erreur: String(e && e.message || e) }; }
    },
    analyserDemande,
    espace: () => { const e = espaceOuvert(); return e ? e.etat() : null; },
    fenetresReelles: () => (int ? int.holo.items.map(i => ({ id: i.def.id, reel: !!i.def.reel, etat: i.reel ? i.reel.etat : null, source: i.reel && i.reel.meta ? i.reel.meta.source : null, bougies: i.reel && i.reel.bougies ? i.reel.bougies.length : 0, cotations: i.reel && i.reel.cotations ? i.reel.cotations.length : 0, erreur: i.reel ? i.reel.erreur || null : null })) : []),
    espaceApi: () => espaceOuvert(),
    terminal: () => (modTerminal ? modTerminal.terminal() : null),
    ouvrirEspaceComplet: async d => { const r = await ouvrirEspace(d || {}, { tactile: profil.niveau === 'basse' || profil.niveau === 'jeu' }); if (int && d && d.fenetre) int.holo.marquerOuvert(d.fenetre); return !!r; },   // l'espace de travail d'avant (TradingView, indicateurs, dock) : voix, bouton « TradingView… » du terminal
    fermerFenetre() { return int ? int.holo.fermer() : false; },
    dire,
    /* Pour les tests, les captures et les ordres vocaux. */
    ouvrirPanneauTerminal: async id => { await terminalV2({ panneau: id }); return true; },       // voix et tests : pose un panneau du terminal sur l'écran (« ouvre les agents prêts »)
    etat: () => ({ actif, mode, transition, entree: entreeFinie, heure, heureSim, dist: orb ? orb.vue.dist : 0, lon: orb ? orb.vue.lon : 0, lat: orb ? orb.vue.lat : 0, angleBase: orb ? orb.angleBase() : 0, fenetre: int ? int.holo.ouvert() : null, vol: !!vol, profil: profil.niveau, auto, message: messageEl.hidden ? '' : messageEl.textContent,
      yaw, pitch, avancee, fenetres: int ? int.holo.ids() : [] }),
    placerOrbite(v) { if (!orb) return; Object.assign(orb.vue, v); if (v.dist !== undefined) distCible = v.dist; vol = null; inertie = null; },
    placerInterieur(o) { if (o.yaw !== undefined) yaw = o.yaw; if (o.pitch !== undefined) pitch = o.pitch; if (o.avancee !== undefined) avancee = o.avancee; },
    definirTempsSim(h) { heureSim = Number(h) || 0; },
    lunes: () => orb ? { phobos: orb.phobos.position.toArray(), deimos: orb.deimos.position.toArray() } : null,
    auto: oui => { auto = !!oui; btnAuto.textContent = auto ? '⏸' : '⏵'; },
    etatPlans: () => (int ? int.holo.etatPlans() : []),
    positionsEcran: () => {                                           // fenêtres holographiques en coordonnées CSS du canvas (tests : clics réels)
      if (!int || mode !== 'interieur') return [];
      const r = canvas.getBoundingClientRect(), out = [];
      for (const id of int.holo.ids()) { const p = int.holo.position(id); if (!p) continue; const q = p.clone().project(int.camera); out.push({ id, x: r.left + (q.x * 0.5 + 0.5) * r.width, y: r.top + (-q.y * 0.5 + 0.5) * r.height, devant: q.z < 1 }); }
      return out;
    },
    zonesEcran: () => { if (mode !== 'orbite' || !orb) return {}; const r = canvas.getBoundingClientRect(), p = orb.projeterAncres(r.width, r.height), o = {}; for (const [k, v] of Object.entries(p)) o[k] = { x: r.left + v.x, y: r.top + v.y, visible: v.visible }; return o; },
    baseEcran: () => { if (!orb) return null; const r = canvas.getBoundingClientRect(), w = new THREE.Vector3(...orb.dirBase).multiplyScalar(M.R).project(orb.camera); return { x: r.left + (w.x * 0.5 + 0.5) * r.width, y: r.top + (-w.y * 0.5 + 0.5) * r.height }; },
    scene: () => ({ orbite: orb && orb.scene, interieur: int && int.scene }), M,
    mesures: () => G.mesures(1000)
  };
  window.addEventListener('galaxie:sortie', () => { if (actif) api.sortir(); });
  G.surChangement(() => { if (actif && mode === 'interieur') G.renderer.shadowMap.enabled = M.profil(G.info().qualite, G.jeu()).ombres > 0; });
  window.Mars = api;
  return api;
}
