// ═════════════ THÈME « ESPACE » : Terre interactive, Lune, Soleil, actualités, présentations ═════════════
// (Les planètes, les galaxies, l'ISS et l'atterrissage sur Mars s'ajoutent comme « vues » de ce même thème : voir VUES plus bas.)
// Interaction : un doigt / la souris = tourner ; pincer / molette = zoomer en continu (de l'espace jusqu'aux pays) ; toucher un pays ou une mer = sa fiche.
import { creerCiel, STYLES_CIEL } from './espace/ciel.js?v=2026.10.15.1';
import { creerTerre } from './espace/terre.js?v=2026.10.15.1';
import { creerGeo } from './espace/geo-calques.js?v=2026.10.15.1';
import { creerRayons } from './espace/effets.js?v=2026.10.15.1';
import { actusMonde, actusDe, indexerLieux, norm } from './espace/actualites.js?v=2026.10.15.1';
import { infosPays } from './donnees/pays.js?v=2026.10.15.1';
import { composerPays, composerMer, ANGLES_LIBELLES, melanger, art, designation } from './donnees/presentation.js?v=2026.10.15.1';
import { OCEANS_MERS } from './donnees/mers.js?v=2026.10.15.1';
import { ASTRES } from './donnees/planetes.js?v=2026.10.15.1';
import { composerAstre } from './donnees/presentation.js?v=2026.10.15.1';

const RAD = Math.PI / 180;
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pont = () => window.RayleUniversPont || {};
const VUES = { systeme: './espace/vue-systeme.js?v=2026.10.14.4', mars: './espace/vue-mars.js?v=2026.10.14.4' };
const VUES_SUPPL = [{ id: 'mars', texte: '🔴 Mars', titre: 'Atterrir sur Mars, et les rovers Perseverance et Curiosity' }];                                        // chips de vues ajoutées par les phases suivantes (Mars, ISS)
const VITESSES = [{ k: 1, n: 'temps réel' }, { k: 60, n: '1 minute par seconde' }, { k: 3600, n: '1 heure par seconde' }, { k: 86400, n: '1 jour par seconde' }, { k: 604800, n: '1 semaine par seconde' }];

const ASTRES_VOIX = /^(?:soleil|mercure|venus|mars|jupiter|saturne|uranus|neptune|pluton|ceres|vesta|phobos|deimos|io|europe|ganymede|callisto|titan|encelade|triton|asteroides?|ceinture d asteroides|lune)$/;
export default {
  id: 'espace', nom: 'Espace', icone: '🌍',
  async creer(ctx) {
    const { THREE, noyau, q } = ctx, hud = noyau.hud;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(42, 1, .001, 5000), rig = new THREE.Group();
    scene.add(rig); rig.add(camera);
    const vec = (x, y, z) => new THREE.Vector3(x, y, z);
    const latLonVec = (lat, lon, r = 1) => vec(r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lon * RAD));
    hud.charge('Ciel et étoiles…', .5);
    const ciel = await creerCiel(ctx); scene.add(ciel.groupe);
    hud.charge('La Terre…', .6);
    const G = await creerTerre(ctx); scene.add(G.groupe);
    hud.charge('Frontières, pays, océans…', .8);
    const geo = await creerGeo(ctx, G);
    const index = indexerLieux({ pays: window.RaylePays || [], centres: (window.RayleUI && window.RayleUI.espacePaysCentres) || [], villes: (window.RayleUI && window.RayleUI.espaceTerreDonnees && window.RayleUI.espaceTerreDonnees.VILLES) || [] });

    let vueNom = 'terre', vueObj = null;                          // vue courante : 'terre' (intégrée) ou une vue chargée à la demande (espace/vue-*.js)
    const rayons = creerRayons(THREE);
    // étiquettes de l'échelle Terre–Lune (loin seulement)
    { const wc = vec(0, 0, 0); const dist = p => camera.getWorldPosition(wc).distanceTo(p); for (const [id, txt, pos, seuil] of [['lun:terre', 'Terre', () => vec(0, 0, 0), 12], ['lun:lune', 'Lune', () => G.lune.position, 6], ['lun:soleil', 'Soleil', () => G.soleil.position, 40]]) ctx.etiquettes.ajouter({ id, texte: txt, classe: 'pays', position: pos, alpha: () => (vueNom === 'terre' && dist(pos()) > seuil ? 1 : 0) * (id === 'lun:soleil' ? .8 : 1) }); }

    /* ───── horloge du globe ───── */
    const H = { decalage: 0, vitesse: 1, pause: false };
    const ts = () => Date.now() + H.decalage;

    /* ───── caméra et contrôles ───── */
    const ctrl = noyau.orbite(camera, { min: 1.012, max: 160, rotation: .7, zoom: 1.15 });
    ctrl.c.zoomToCursor = false;
    ctrl.avant = c => {
      if (vueNom !== 'terre') { if (vueObj && vueObj.ctrlAvant) vueObj.ctrlAvant(c); return; }
      // la vitesse suit l'altitude : près du sol, on tourne lentement (la surface suit le doigt)
      const d = camera.position.length(), h = Math.max(.002, d - 1);
      c.rotateSpeed = Math.max(.025, Math.min(.85, h * .62)); c.zoomSpeed = Math.max(.5, Math.min(1.6, .5 + h * .35));
    };
    const posInitiale = () => {
      let lat = 46, lon = 2;
      try { const p = window.RayleLocalisation && RayleLocalisation.maPosition(); if (p) { lat = p.lat; lon = p.lon; } } catch (e) { /* position non partagée */ }
      return latLonVec(lat, lon, 3.6);
    };
    camera.position.copy(posInitiale()); camera.lookAt(0, 0, 0); ctrl.c.update();
    let suivre = true;
    // Quand la caméra regarde ailleurs que le centre de la Terre (vue Terre–Lune), le repère terrestre n'est plus suivi : positions et cible sont alors dans le repère du monde.
    function suivreTerre(oui) {
      if (oui === suivre) return; const w = camera.getWorldPosition(vec(0, 0, 0));
      suivre = oui; rig.rotation.y = oui ? G.terre.rotation.y : 0; rig.updateMatrixWorld(true); camera.position.copy(rig.worldToLocal(w));
      if (oui) { ctrl.c.target.set(0, 0, 0); ctrl.c.minDistance = 1.012; ctrl.c.maxDistance = 160; }
    }
    function distCam() { return camera.position.length(); }

    /* ───── vols de caméra (dans la Terre : repère terrestre, la caméra suit la rotation) ───── */
    async function vol(api, { lat, lon, dist, duree = 3.6 }) {
      suivreTerre(true); const c = ctrl.c; c.enabled = false; c.target.set(0, 0, 0);
      const p0 = camera.position.clone(), r0 = p0.length(), d0 = p0.clone().normalize(), d1 = latLonVec(lat, lon).normalize();
      const q0 = new THREE.Quaternion().setFromUnitVectors(vec(0, 0, 1), d0), q1 = new THREE.Quaternion().setFromUnitVectors(vec(0, 0, 1), d1), qq = new THREE.Quaternion();
      const ang = d0.angleTo(d1), arc = Math.min(1.6, ang * .5);   // grand détour : on prend de la hauteur au milieu du trajet
      const duree2 = Math.max(1.6, Math.min(duree + ang * .8, 7));
      await api.tween(duree2, (e) => {
        qq.slerpQuaternions(q0, q1, e);
        const r = Math.exp(Math.log(r0) * (1 - e) + Math.log(dist) * e) * (1 + arc * Math.sin(Math.PI * e) * Math.min(1, r0 > 3 ? 0.2 : 1));
        camera.position.copy(vec(0, 0, 1).applyQuaternion(qq).multiplyScalar(Math.max(1.015, r))); camera.lookAt(0, 0, 0);
      }, { ease: noyau.EASE.sinus });
      camera.position.copy(latLonVec(lat, lon, dist)); camera.lookAt(0, 0, 0); c.update(); c.enabled = true;
    }
    const distPour = c => c.type === 'pays' ? 1 + Math.max(.07, Math.min(1.7, (c.etendue || 8) * .04)) : (c.zone ? c.zone.cam : 1.6);

    /* ───── fiches ───── */
    let selection = null;
    function ficheLieu(c, { present = true } = {}) {
      const nom = c.type === 'pays' ? c.pays.nom : c.zone.nom;
      const actions = [{ texte: '🎬 Présenter', clic: () => presenter(nom) }, { texte: '📰 Actualités', clic: () => actualitesDe(nom) }, { texte: '🎯 Zoom', clic: () => aller(nom) }];
      if (c.type === 'pays') {
        hud.carte({ titre: nom, html: '<p><small>Chargement des informations…</small></p>', actions });
        infosPays({ a2: c.pays.a2, nom }).then(i => {
          if (!selection || selection.nom !== nom) return;
          const l = []; if (i.capitale) l.push('Capitale : <b>' + esc(i.capitale) + '</b>'); if (i.population) l.push('Population : environ ' + esc(Number(i.population).toLocaleString('fr-FR')) + (i.popAnnee ? ' <small>(' + i.popAnnee + ')</small>' : '')); if (i.superficie) l.push('Superficie : ' + esc(Number(i.superficie).toLocaleString('fr-FR')) + ' km²'); if (i.continent) l.push('Continent : ' + esc(i.continent));
          hud.carte({ titre: nom, html: (l.length ? '<p>' + l.join('<br>') + '</p>' : '') + (i.intro ? '<p><small>' + esc(i.intro.slice(0, 330)) + (i.intro.length > 330 ? '…' : '') + '</small></p>' : '') + (i.hors_ligne ? '<p><small>Informations en ligne indisponibles.</small></p>' : '<p><small>Sources : ' + esc((i.source || []).join(', ')) + '</small></p>'), actions });
        }).catch(() => {});
      } else {
        const m = c.zone, f = [m.chiffres[0], m.geo[0]].filter(Boolean);
        hud.carte({ titre: m.nom, html: '<p>' + f.map(esc).join('</p><p>') + '</p><p><small>Zone indicative (surbrillance approximative).</small></p>', actions });
      }
    }
    function selectionner(c) {
      const nom = c.type === 'pays' ? c.pays.nom : c.zone.nom; selection = { nom, c };
      if (c.type === 'pays') geo.surlignerPays(c.pays.num); else geo.surlignerZone({ lat: c.lat, lon: c.lon, rayon: c.zone.rayon * .85 });
      ficheLieu(c);
    }
    async function aller(nom) {
      const c = geo.centre(nom); if (!c) return { ok: false, texte: 'Je ne connais pas « ' + nom + ' » sur la carte.' };
      selectionner(c);
      await noyau.cinematique(api => vol(api, { lat: c.lat, lon: c.lon, dist: distPour(c) }));
      return { ok: true, texte: 'Voici ' + (c.type === 'pays' ? art(c.pays.nom).def : designation(c.zone.nom)) + '.' };
    }

    /* ───── actualités (pastilles sur le globe) ───── */
    let actus = { affichees: false, items: [], groupes: new Map() };
    function groupes(items) {
      const m = new Map();
      for (const it of items) { if (!it.lieu) continue; const k = it.lieu.nom; if (!m.has(k)) m.set(k, { lieu: it.lieu, items: [] }); m.get(k).items.push(it); }
      return m;
    }
    function poserPastilles() {
      ctx.etiquettes.vider('actu:');
      let i = 0;
      for (const [nom, g] of actus.groupes) {
        const l = g.lieu, loc = latLonVec(l.lat + (i % 3 - 1) * .8, l.lon + ((i * 7) % 5 - 2) * .6, 1.012); i++;
        ctx.etiquettes.ajouter({
          id: 'actu:' + nom, classe: 'actu', html: '<span class="univ-pastille"><i>📰</i>' + g.items.length + '</span>', position: () => loc.clone().applyMatrix4(G.terre.matrixWorld), visible: (w, cam) => G.visible(w, cam),
          alpha: () => 1 - Math.max(0, Math.min(1, (distCam() - 9) / 20)), onClick: () => ficheActus(nom, g.items),
        });
      }
    }
    function ficheActus(nom, items) {
      const li = items.slice(0, 6).map(a => '<li><b>' + (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + esc(a.titre) + '</a>' : esc(a.titre)) + '</b><br><small>' + esc(a.source || '') + '</small></li>').join('');
      hud.carte({ titre: '📰 ' + nom, html: '<ul class="univ-liste">' + li + '</ul>', actions: [{ texte: '🔊 Lis-moi les titres', clic: () => lireActus(nom, items) }, { texte: '📄 Résumé du 1er', clic: () => resumeArticle(items[0]) }] });
    }
    async function lireActus(nom, items) {
      const P = pont(); const t = 'À la une ' + (nom ? 'sur ' + nom : '') + ' : ' + items.slice(0, 3).map(a => a.titre.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '') + (a.source ? ', ' + a.source : '')).join(' ; ') + '.';
      if (P.dire) await P.dire(t);
    }
    async function resumeArticle(a) {
      const P = pont(); if (!a) return; hud.legende('Lecture de l’article…', 0);
      try {
        if (!P.workerPret || !P.workerPret()) throw new Error('Worker non relié');
        const d = await P.wjson('/page?url=' + encodeURIComponent(a.url), 40000);
        const texte = String(d.description || d.texte || '').replace(/\s+/g, ' ').trim().slice(0, 600);
        hud.legende(null); hud.carte({ titre: a.titre, html: '<p>' + esc(texte || 'Aucun texte lisible.') + '</p><p><small>' + esc(a.source || '') + ' · lu via le Worker</small></p>', actions: [{ texte: '🔊 Lire', clic: () => P.dire && P.dire(texte) }] });
      } catch (e) { hud.legende('Impossible de lire l’article (' + (e && e.message || e) + ').', 6000); }
    }
    async function chargerActus() {
      hud.legende('Recherche des actualités…', 0);
      const r = await actusMonde(pont(), index);
      actus.items = r.items; actus.groupes = groupes(r.items);
      if (!r.items.length) { hud.legende('Aucune actualité disponible pour l’instant (' + (r.erreur || 'sources injoignables') + '). Je n’en invente pas.', 8000); return r; }
      poserPastilles(); hud.legende(actus.groupes.size + ' lieux avec des actualités · source : ' + r.source + ' · touche une pastille.', 9000);
      return r;
    }
    async function basculerActus(v) {
      actus.affichees = v == null ? !actus.affichees : !!v;
      if (actus.affichees) { const r = await chargerActus(); if (!r.items.length) actus.affichees = false; } else { ctx.etiquettes.vider('actu:'); hud.legende(null); }
      majMenu(); return actus.affichees;
    }
    async function actualitesDe(nom) {
      hud.legende('Actualités : ' + nom + '…', 0);
      const r = await actusDe(nom, pont(), index);
      if (!r.items.length) { hud.legende('Pas d’actualité fiable trouvée pour ' + nom + ' (' + (r.erreur || 'sources injoignables') + ').', 7000); return r; }
      hud.legende(null); ficheActus(nom, r.items); return r;
    }

    /* ───── appareils (pastilles bleues) ───── */
    let repAppareils = [], appareilsOn = false;
    function poserAppareils(rep) {
      repAppareils = rep || []; ctx.etiquettes.vider('appareil:');
      if (!appareilsOn) return;
      for (const r of repAppareils) {
        const loc = latLonVec(r.lat, r.lon, 1.012), icone = r.genre === 'tablette' ? '📱' : r.genre === 'telephone' ? '📞' : '🖥';
        ctx.etiquettes.ajouter({ id: 'appareil:' + r.nom, classe: 'appareil', html: '<span class="univ-pastille appareil"><i>' + icone + '</i>' + esc(r.nom) + '</span>', position: () => loc.clone().applyMatrix4(G.terre.matrixWorld), visible: (w, cam) => G.visible(w, cam), onClick: () => noyau.cinematique(api => vol(api, { lat: r.lat, lon: r.lon, dist: 1.3 })) });
      }
    }
    const surPositions = d => { if (d && d.reperes) poserAppareils(d.reperes); };
    let desabonne = null; try { desabonne = RayleBus.on('appareils:positions', surPositions); } catch (e) { /* bus absent */ }
    async function basculerAppareils(v) {
      appareilsOn = v == null ? !appareilsOn : !!v;
      if (appareilsOn) { try { const l = await RayleLocalisation.liste(); poserAppareils(RayleLocalisation.reperes(l)); if (!RayleLocalisation.reperes(l).length) hud.legende('Aucun appareil ne partage sa position : active-le dans Réglages, ou dis « localise cet appareil ».', 7000); } catch (e) { hud.legende('Appareils indisponibles.', 4000); } }
      else ctx.etiquettes.vider('appareil:');
      majMenu(); return appareilsOn;
    }

    /* ───── satellites réels et ISS (SGP4 + CelesTrak) ───── */
    let SAT = null, satOn = false, focus = null, orbISS = null, derOrb = 0;
    async function chargerSat() {
      if (SAT) return SAT;
      hud.legende('Satellites : éléments orbitaux de CelesTrak…', 0);
      const m = await import('./espace/satellites.js?v=2026.10.15.1'); SAT = await m.creerSatellites(ctx, G); scene.add(SAT.groupe); SAT.visible(satOn);
      orbISS = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x66e6ff, transparent: true, opacity: .55, depthWrite: false })); orbISS.frustumCulled = false; orbISS.visible = false; scene.add(orbISS);
      const wp = vec(0, 0, 0);
      ctx.etiquettes.ajouter({ id: 'sat:iss', texte: '🛰 ISS', classe: 'pays', position: () => { const I = SAT.iss(ts()); return I ? wp.copy(I.pos) : wp.set(0, 0, 0); }, visible: (w, cam) => vueNom === 'terre' && satOn && G.visible(w, cam), alpha: () => { const I = SAT.iss(ts()); if (!I) return 0; return camera.getWorldPosition(vec(0, 0, 0)).distanceTo(I.pos) > .06 ? 1 : 0; }, onClick: () => voirISS() });
      for (const [nom, aff] of [['CSS (TIANHE)', '🛰 Tiangong'], ['HST', '🔭 Hubble']]) ctx.etiquettes.ajouter({ id: 'sat:' + nom, texte: aff, classe: 'mer', position: () => SAT.positionDe(nom, ts()) || vec(0, 0, 0), visible: (w, cam) => vueNom === 'terre' && satOn && G.visible(w, cam), alpha: () => (distCam() < 5 ? 1 : 0) });
      hud.legende(null); return SAT;
    }
    async function basculerSat(v) {
      satOn = v == null ? !satOn : !!v;
      if (satOn) { await chargerSat(); SAT.visible(true); const e = SAT.etat(); hud.legende(e.nb + ' satellites réels (éléments ' + e.source + (e.ageHeures != null ? ', âgés de ' + e.ageHeures + ' h' : '') + '). Touche « ISS » pour s’en approcher.' + (e.erreur ? ' [' + e.erreur + ']' : ''), 9000); }
      else if (SAT) { SAT.visible(false); orbISS.visible = false; }
      majMenu(); return satOn;
    }
    const lieuSousISS = I => { const p = geo.pays(I.lat, I.lon); if (p) return art(p.nom).def; let best = null, bd = 1e9; for (const m of OCEANS_MERS) { const d = Math.hypot(m.lat - I.lat, (((m.lon - I.lon) + 540) % 360 - 180) * Math.cos(I.lat * RAD)) / m.rayon; if (d < bd) { bd = d; best = m; } } return best && bd < 1.3 ? designation(best.nom) : 'un océan'; };
    function ficheISS() {
      const I = SAT && SAT.iss(ts()); const a = ASTRES.iss;
      const l = I ? ['Altitude : environ ' + Math.round(I.alt) + ' km', 'Vitesse : environ ' + Math.round(I.v / 100) * 100 + ' km/h', 'Au-dessus de : ' + esc(lieuSousISS(I)) + ' <small>(' + I.lat.toFixed(1) + '°, ' + I.lon.toFixed(1) + '°)</small>', 'Éléments orbitaux : ' + esc(I.source || '')] : ['Position indisponible.'];
      const un = a.records[Math.floor(Math.random() * a.records.length)];
      hud.carte({ titre: '🛰 Station spatiale internationale', html: '<p>' + l.join('<br>') + '</p><p><small>' + esc(un) + '</small></p><p><small>Modèle agrandi (×730) pour être visible ; position réelle calculée à l’instant (SGP4).</small></p>', actions: [{ texte: '🎬 Présenter', clic: () => presenterISS() }, { texte: '🎲 Autre fait', clic: () => ficheISS() }, { texte: '🌍 Retour', clic: () => { focus = null; recentrerTerre(); } }] });
    }
    async function voirISS() {
      await chargerSat(); satOn = true; SAT.visible(true); geo.effacerSurbrillance();
      const I = SAT.iss(ts()); if (!I) { hud.legende('Position de l’ISS indisponible.', 5000); return { ok: false, texte: 'Je n’ai pas la position de l’ISS pour l’instant.' }; }
      suivreTerre(false); focus = null; const c = ctrl.c; c.enabled = false; ficheISS(); majMenu();
      await noyau.cinematique(async api => {
        const c0 = camera.position.clone(), t0 = c.target.clone();
        await api.tween(5.5, e => {
          const J = SAT.iss(ts()), n = J.pos.clone().normalize(), cote = n.clone().cross(J.vel.clone().normalize()).normalize(), cible = J.pos.clone().addScaledVector(n, .020).addScaledVector(cote, .030).addScaledVector(J.vel.clone().normalize(), -.008);
          camera.position.lerpVectors(c0, cible, e); const r = t0.clone().lerp(J.pos, e); camera.lookAt(r); c.target.copy(r);
        }, { ease: noyau.EASE.sinus });
      });
      c.minDistance = .004; c.maxDistance = 160; focus = { pos: () => { const J = SAT.iss(ts()); return J ? J.pos : null; } }; c.enabled = true; c.update();
      return { ok: true, texte: 'Voici la Station spatiale internationale, à environ ' + Math.round(I.alt) + ' kilomètres d’altitude, au-dessus de ' + lieuSousISS(I) + '.' };
    }
    async function presenterISS() {
      const Pt = pont(); await voirISS(); const n = ++presEnCours, epoque = Pt.epoque ? Pt.epoque() : 0, vivant = () => n === presEnCours && (!Pt.epoque || Pt.epoque() === epoque);
      const texte = composerAstre(ASTRES.iss, { angles: 3 }); ctrl.c.autoRotate = true; ctrl.c.autoRotateSpeed = .6;
      for (let i = 0; i < texte.segments.length && vivant(); i++) { const seg = texte.segments[i]; hud.carte({ titre: '🛰 ISS', html: '<p><small>' + esc(ANGLES_LIBELLES[seg.angle] || '') + ' · ' + (i + 1) + '/' + texte.segments.length + '</small></p><p>' + esc(seg.texte) + '</p>', actions: [{ texte: '⏹ Arrêter', clic: () => { presEnCours++; try { Pt.arreter && Pt.arreter(); } catch (e) { /* rien */ } hud.carte(null); } }] }); if (Pt.dire) { if ((await Pt.dire(seg.texte)) === false) break; } else await noyau.attendre(Math.min(8, 2 + seg.texte.length / 40)); }
      ctrl.c.autoRotate = false; return { ok: true, texte: texte.segments.map(x => x.texte).join(' ') };
    }

    /* ───── présentation animée ───── */
    let presEnCours = 0;
    async function presenter(nom, options = {}) {
      const P = pont(); const c = geo.centre(nom);
      if (!c) { const t = 'Je ne trouve pas « ' + nom + ' » sur la carte : dis-moi un pays, un océan ou une mer.'; if (P.dire) await P.dire(t); return { ok: false, texte: t }; }
      const id = ++presEnCours, epoque = P.epoque ? P.epoque() : 0, vivant = () => id === presEnCours && (!P.epoque || P.epoque() === epoque);
      selectionner(c);
      const nomLieu = c.type === 'pays' ? c.pays.nom : c.zone.nom;
      const infosP = c.type === 'pays' ? infosPays({ a2: c.pays.a2, nom: nomLieu }).catch(() => ({ nom: nomLieu, hors_ligne: true, sections: {} })) : Promise.resolve(null);
      const actusP = actusDe(nomLieu, P, index).catch(() => ({ items: [] }));
      ctrl.c.autoRotate = false;
      let texte = null;
      // 1) vol de caméra vers la zone ; l'introduction est dite pendant le trajet
      const fin = noyau.cinematique(async api => { await vol(api, { lat: c.lat, lon: c.lon, dist: distPour(c) }); }, { passable: true });
      const infos = await infosP, actusR = await actusP;
      const rnd = options.rnd || Math.random;
      texte = c.type === 'pays' ? composerPays(infos, { actus: actusR.items.length || actusR.erreur !== 'Worker non relié' ? actusR.items : null, a2: c.pays.a2, rnd, angles: options.angles || 3 }) : composerMer(c.zone, { actus: actusR.items.length ? actusR.items : null, rnd, angles: options.angles || 3 });
      const dit = [];
      const montrer = (seg, i, n) => hud.carte({
        titre: (c.type === 'pays' ? '🌍 ' : '🌊 ') + nomLieu, html: '<p><small>' + esc(ANGLES_LIBELLES[seg.angle] || '') + ' · ' + (i + 1) + '/' + n + '</small></p><p>' + esc(seg.texte) + '</p>' + (seg.angle === 'actus' && actusR.items.length ? '<ul class="univ-liste">' + actusR.items.slice(0, 3).map(a => '<li>' + (a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">' + esc(a.titre) + '</a>' : esc(a.titre)) + ' <small>' + esc(a.source || '') + '</small></li>').join('') + '</ul>' : ''),
        actions: [{ texte: '⏹ Arrêter', clic: () => { presEnCours++; try { P.arreter && P.arreter(); } catch (e) { /* rien à couper */ } hud.carte(null); } }, { texte: '📰 Actualités', clic: () => actualitesDe(nomLieu) }],
      });
      await fin;
      ctrl.c.autoRotate = true; ctrl.c.autoRotateSpeed = .45;
      for (let i = 0; i < texte.segments.length && vivant(); i++) {
        const seg = texte.segments[i]; montrer(seg, i, texte.segments.length);
        if (P.dire) { const ok = await P.dire(seg.texte); if (ok === false) break; } else await noyau.attendre(Math.min(8, 2 + seg.texte.length / 40));
      }
      ctrl.c.autoRotate = false;
      if (vivant()) { geo.effacerSurbrillance(); setTimeout(() => { if (id === presEnCours) hud.carte(null); }, 12000); }
      return { ok: true, texte: texte.segments.map(s => s.texte).join(' '), sources: texte.sources };
    }
    async function surprise() {
      const pays = (window.RaylePays || []).filter(p => geo.centre(p[3]) && (geo.centre(p[3]).etendue || 0) > 1.5);
      const choix = Math.random() < .3 ? OCEANS_MERS[Math.floor(Math.random() * OCEANS_MERS.length)].nom : pays[Math.floor(Math.random() * pays.length)][3];
      return presenter(choix);
    }

    /* ───── Lune, Soleil, éclipses, temps ───── */
    const phaseTexte = p => p < .03 || p > .97 ? 'nouvelle lune' : p < .22 ? 'premier croissant' : p < .28 ? 'premier quartier' : p < .47 ? 'lune gibbeuse croissante' : p < .53 ? 'pleine lune' : p < .72 ? 'lune gibbeuse décroissante' : p < .78 ? 'dernier quartier' : 'dernier croissant';
    const infoLune = () => { const ph = window.RayleUI.astro.lune(ts()); return 'La Lune est à environ ' + (Math.round(G.moonDist() * 6371 / 1000) * 1000).toLocaleString('fr-FR') + ' kilomètres de la Terre. En ce moment : ' + phaseTexte(ph.phase) + ', éclairée à ' + Math.round(ph.eclairee * 100) + ' pour cent.'; };
    // vue d'ensemble : on recule jusqu'à voir la Terre et la Lune ensemble (orbite et étiquettes apparaissent)
    async function voirLune() {
      geo.effacerSurbrillance(); hud.carte(null); suivreTerre(false);
      await noyau.cinematique(async api => {
        const c = ctrl.c; c.enabled = false; const m = G.moonDir.clone(), dist = G.moonDist();
        const perp = m.clone().cross(vec(0, 1, 0)); if (perp.lengthSq() < .05) perp.set(1, 0, 0); perp.normalize();
        const cible = m.clone().multiplyScalar(dist * .5).addScaledVector(perp, dist * .95).add(vec(0, dist * .3, 0)), regard = m.clone().multiplyScalar(dist * .5), c0 = camera.position.clone(), r0 = c.target.clone();
        await api.tween(4.2, e => { camera.position.lerpVectors(c0, cible, e); const r = r0.clone().lerp(regard, e); camera.lookAt(r); c.target.copy(r); }, { ease: noyau.EASE.sinus });
        c.minDistance = 1.012; c.maxDistance = 400; c.update(); c.enabled = true;
      });
      const t = infoLune(); hud.legende(t, 9000); return { ok: true, texte: t };
    }
    // vue rapprochée : on se pose près de la Lune, du côté de la Terre (même phase que vue d'en bas)
    async function lunePres() {
      geo.effacerSurbrillance(); hud.carte(null); suivreTerre(false);
      await noyau.cinematique(async api => {
        const c = ctrl.c; c.enabled = false; const c0 = camera.position.clone(), r0 = c.target.clone();
        await api.tween(5, e => { const p = G.poseLunePres(); camera.position.lerpVectors(c0, p.pos, e); const reg = r0.clone().lerp(p.regard, e); camera.lookAt(reg); c.target.copy(reg); }, { ease: noyau.EASE.sinus });
        c.minDistance = .35; c.maxDistance = 400; c.update(); c.enabled = true;
      });
      const t = infoLune(); hud.legende(t, 9000); return { ok: true, texte: t };
    }
    function recentrerTerre() {
      focus = null; ctrl.c.minDistance = 1.012; ctrl.c.maxDistance = 160; G.lumiere.intensity = 3; G.ambiante.intensity = .22; suivreTerre(true); ctrl.c.target.set(0, 0, 0);
      return noyau.cinematique(api => vol(api, { lat: (window.RayleLocalisation && RayleLocalisation.maPosition() || { lat: 30 }).lat, lon: (window.RayleLocalisation && RayleLocalisation.maPosition() || { lon: 10 }).lon, dist: 3.6 }));
    }
    function regler(vitesse, pause) {
      H.vitesse = vitesse; H.pause = !!pause; majMenu();
      const v = VITESSES.find(x => x.k === vitesse);
      hud.legende(pause ? 'Temps figé.' : vitesse === 1 ? 'Heure réelle.' : 'Temps accéléré : ' + (v ? v.n : 'x' + vitesse) + '.', 4000);
    }
    const dateTexte = t => new Date(t).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
    async function eclipse(type) {
      const e = G.prochaineEclipse(ts(), 900, type === 'soleil' || type === 'lune' ? type : null);
      if (!e) { hud.legende('Pas d’éclipse trouvée dans les deux ans et demi qui viennent.', 6000); return { ok: false, texte: 'Je ne trouve pas d’éclipse dans les prochaines années.' }; }
      H.decalage = e.ts - Date.now() - 2 * 3600e3; H.vitesse = 3600 / 10; H.pause = false;
      const texte = 'Prochaine éclipse ' + (e.type === 'soleil' ? 'de Soleil ' : 'de Lune ') + e.nature + ' : ' + dateTexte(e.ts) + ' (heure de ton appareil), calculée avec les positions réelles de la Lune et du Soleil. Je me place deux heures avant et j’accélère le temps.';
      hud.legende(texte, 12000);
      if (e.type === 'soleil') { /* l'ombre de la Lune est calculée dans le shader de la Terre ; on regarde la Terre de loin */ await vol0(); } else await voirLune();
      majMenu(); return { ok: true, texte, eclipse: e };
    }
    async function vol0() { await noyau.cinematique(api => vol(api, { lat: 20, lon: 0, dist: 4.5 })); }

    /* ───── menu (chips) ───── */
    let chipSky = 0; const ids = Object.keys(STYLES_CIEL);
    function menuTerre() {
      const it = [];
      it.push({ id: 'terre', texte: '🎯 Vue d’ensemble', titre: 'Revenir à la vue d’ensemble de la Terre', clic: () => recentrerTerre() });
      it.push({ id: 'lune', texte: '🌙 Terre–Lune', titre: 'Voir la Terre et la Lune à l’échelle, avec l’orbite', clic: () => voirLune() });
      it.push({ id: 'lunepres', texte: '🌕 Lune de près', titre: 'Se poser près de la Lune (phase réelle)', clic: () => lunePres() });
      it.push({ id: 'iss', texte: '🛰 ISS', titre: 'Approche de la Station spatiale internationale (position réelle)', clic: () => voirISS() });
      it.push({ id: 'sats', texte: '🛰 Satellites', titre: 'Satellites réels autour de la Terre', actif: satOn, clic: () => basculerSat() });
      it.push({ id: 'eclipse', texte: '☀ Éclipse', titre: 'Prochaine éclipse de Soleil ou de Lune', clic: () => eclipse() });
      it.push({ id: 'actus', texte: '📰 Actualités', titre: 'Pastilles d’actualité sur le globe', actif: actus.affichees, clic: () => basculerActus() });
      it.push({ id: 'appareils', texte: '📍 Appareils', titre: 'Où sont mes appareils', actif: appareilsOn, clic: () => basculerAppareils() });
      it.push({ id: 'surprise', texte: '🎲 Surprise', titre: 'Raylé présente un pays, un océan ou une mer au hasard', clic: () => surprise() });
      it.push({ id: 'temps', texte: '⏱ ' + (H.pause ? 'Pause' : H.vitesse === 1 ? 'Temps réel' : '×' + H.vitesse), titre: 'Vitesse du temps (cycle : réel, ×60, ×3600, ×86 400, ×604 800, pause)', clic: () => { const i = H.pause ? -1 : VITESSES.findIndex(x => x.k === H.vitesse); if (H.pause) regler(1, false); else if (i === VITESSES.length - 1) regler(H.vitesse, true); else regler(VITESSES[i + 1].k, false); } });
      it.push({ id: 'ciel', texte: '🌌 ' + STYLES_CIEL[ciel.courant()].nom, titre: 'Changer le fond : ciel réel, spirale bleue, nébuleuse…', clic: async () => { chipSky = (ids.indexOf(ciel.courant()) + 1) % ids.length; await ciel.style(ids[chipSky]); majMenu(); } });
      return it;
    }
    function menu() {
      const it = [{ id: 'v-terre', texte: '🌍 Terre', titre: 'La Terre, la Lune et leurs éclipses', actif: vueNom === 'terre', clic: () => allerVue('terre') }, { id: 'v-systeme', texte: '☀ Système solaire', titre: 'Les planètes, les astéroïdes, le Soleil', actif: vueNom === 'systeme', clic: () => allerVue('systeme') }];
      for (const v of VUES_SUPPL) it.push({ id: 'v-' + v.id, texte: v.texte, titre: v.titre, actif: vueNom === v.id, clic: () => allerVue(v.id) });
      return it.concat(vueNom === 'terre' ? menuTerre() : vueObj ? vueObj.menu() : []);
    }
    const majMenu = () => hud.sousMenu(menu());

    /* ───── vues : chargées à la demande, une seule visible à la fois ───── */
    const partage = { THREE, noyau, q, ctx, hud, scene, camera, rig, ctrl, ciel, H, ts: () => ts(), vec, esc, pont, suivreTerre: v => suivreTerre(v), majMenu: () => majMenu(), art, designation, vueNom: () => vueNom, allerVue: (n, o) => allerVue(n, o), vue: () => vueObj, terre: () => ({ G, geo, vol }) };
    const cacheVues = new Map();
    async function chargerVue(nom) {
      if (cacheVues.has(nom)) return cacheVues.get(nom);
      const def = VUES[nom]; if (!def) throw new Error('vue inconnue : ' + nom);
      hud.charge('Chargement : ' + nom + '…', .3);
      const mod = await import(/* @vite-ignore */ def); const v = await mod.default(partage); cacheVues.set(nom, v); hud.charge(null); return v;
    }
    function montrerTerre(oui) { G.groupe.visible = oui; G.masquee = !oui; }
    async function allerVue(nom, opts = {}) {
      if (nom === vueNom && !opts.force) return { ok: true, texte: '' };
      hud.carte(null); hud.legende(null);
      const fond = noyau.fondu;
      await fond(true);
      try {
        if (vueObj) { vueObj.sortir(); vueObj = null; }
        if (nom === 'terre') {
          focus = null; vueNom = 'terre'; montrerTerre(true); suivreTerre(false); suivreTerre(true); ctrl.c.minDistance = 1.012; ctrl.c.maxDistance = 160; ctrl.c.autoRotate = false;
          const p = posInitiale(); camera.position.copy(p); camera.lookAt(0, 0, 0); ctrl.c.target.set(0, 0, 0); ctrl.c.update();
        } else {
          const v = await chargerVue(nom); montrerTerre(false); vueNom = nom; vueObj = v; await v.entrer(opts);
        }
      } finally { majMenu(); await fond(false); }
      return { ok: true, texte: '' };
    }

    /* ───── tap : sélection d'un pays ou d'une mer ───── */
    function tap(x, y) {
      if (vueNom !== 'terre') { if (vueObj && vueObj.tap) vueObj.tap(x, y); return; }
      const nx = x / noyau.dims().w * 2 - 1, ny = -(y / noyau.dims().h * 2 - 1), p = G.pointe(camera, nx, ny); if (!p) return;
      const pays = geo.pays(p.lat, p.lon);
      if (pays) { const c = geo.centre(pays.nom) || { type: 'pays', lat: pays.lat, lon: pays.lon, etendue: pays.etendue, pays }; c.pays = c.pays || pays; selectionner(c); return; }
      // pas de pays : la mer la plus proche dont la zone contient le point
      let best = null, bd = 1e9; for (const m of OCEANS_MERS) { const dLat = m.lat - p.lat, dLon = (((m.lon - p.lon) + 540) % 360 - 180) * Math.cos(p.lat * RAD), d = Math.hypot(dLat, dLon) / m.rayon; if (d < bd) { bd = d; best = m; } }
      if (best && bd < 1.1) selectionner({ type: best.type, lat: best.lat, lon: best.lon, zone: best, etendue: best.rayon });
    }

    /* ───── commandes (voix, bouton) ───── */
    async function commande(nom, a = {}) {
      // Mars : atterrissage, rovers (maquette 3D, pièces), questions sur les rovers
      if (['atterrir', 'rover', 'piece', 'autre-rover', 'question', 'mars-orbite'].includes(nom) || ((nom === 'presenter' || nom === 'aller') && a.nom && /perseverance|perseverence|curiosity|curiosite/.test(String(a.nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()))) {
        const mode = nom === 'atterrir' ? 'atterrir' : nom === 'mars-orbite' ? 'orbite' : 'rover';
        if (vueNom !== 'mars') { const m = await import('./espace/vue-mars.js?v=2026.10.15.1'); await allerVue('mars', { mode, rover: m.trouverRover(a.nom || a.rover || '') || undefined, force: true }); if (nom === 'atterrir') return { ok: true, texte: 'Je m’installe pour l’atterrissage : l’approche de Mars, l’entrée dans l’atmosphère, le parachute, la grue céleste. Dis « passe l’animation » pour aller directement au rover.' }; if (nom === 'rover' || nom === 'aller') return { ok: true, texte: 'Voici le rover.' }; if (nom === 'mars-orbite') return { ok: true, texte: 'Voici Mars.' }; }
        return vueObj.commande(nom === 'mars-orbite' ? 'orbite' : nom === 'aller' ? 'rover' : nom, a);
      }
      if (nom === 'vue') { const r = await allerVue(a.nom, a); return Object.assign({ ok: true, texte: a.nom === 'terre' ? 'Voici la Terre.' : a.nom === 'systeme' ? 'Voici le système solaire.' : 'C’est fait.' }, r.texte ? r : {}); }
      if (vueNom !== 'terre' && vueObj) { const r = await vueObj.commande(nom, a); if (r !== undefined) return r; }
      // astres du système solaire demandés depuis la vue Terre (planète, Soleil, astéroïdes…) : on bascule d'abord
      if ((nom === 'aller' || nom === 'presenter') && a.nom && vueNom === 'terre') { const m = await import('./espace/vue-systeme.js?v=2026.10.15.1'); const id = m.trouverAstre(a.nom); if (id && id !== 'terre' && id !== 'lune') { await allerVue('systeme'); return vueObj.commande(nom, a); } }
      if (['systeme', 'echelle'].includes(nom)) { await allerVue('systeme'); return vueObj.commande(nom, a); }
      switch (nom) {
        case 'aller': return aller(a.nom);
        case 'presenter': return presenter(a.nom, a);
        case 'surprise': return surprise();
        case 'lune': return a.pres ? lunePres() : voirLune();
        case 'eclipse': return eclipse(a.type);
        case 'iss': if (vueNom !== 'terre') await allerVue('terre'); return a.presenter ? presenterISS() : voirISS();
        case 'satellites': return basculerSat(a.oui).then(v => ({ ok: true, texte: v ? 'Les satellites réels sont affichés.' : 'J’ai retiré les satellites.' }));
        case 'terre': if (vueNom !== 'terre') await allerVue('terre'); else await recentrerTerre(); return { ok: true, texte: 'Voici la Terre.' };
        case 'actus': { if (a.nom) { const r = await actualitesDe(a.nom); return { ok: r.items.length > 0, texte: r.items.length ? 'Voici les actualités de ' + a.nom + '.' : 'Pas d’actualité fiable pour ' + a.nom + '.' }; } const v = await basculerActus(a.oui); return { ok: true, texte: v ? 'Les actualités sont sur le globe.' : 'J’ai retiré les actualités du globe.' }; }
        case 'appareils': { const v = await basculerAppareils(a.oui); return { ok: true, texte: v ? 'Tes appareils sont sur le globe.' : 'J’ai retiré tes appareils du globe.' }; }
        case 'ciel': { const id = a.style && STYLES_CIEL[a.style] ? a.style : ids[(ids.indexOf(ciel.courant()) + 1) % ids.length]; await ciel.style(id); majMenu(); return { ok: true, texte: 'Fond : ' + STYLES_CIEL[id].desc + '.' }; }
        case 'temps': regler(a.vitesse || 1, !!a.pause); return { ok: true, texte: a.pause ? 'Temps figé.' : a.vitesse > 1 ? 'Temps accéléré.' : 'Heure réelle.' };
        case 'zoom': { const d = distCam(); await noyau.tween(.9, e => { const r = Math.max(1.02, d * Math.pow(a.facteur || .6, e)); camera.position.setLength(r); ctrl.c.update(); }); return { ok: true, texte: 'Voilà.' }; }
        case 'options': return { ok: true };
        default: return { ok: false, texte: 'Commande inconnue : ' + nom };
      }
    }

    /* ───── boucle ───── */
    let tSim = 0;
    function maj(dt, t) {
      const vit = H.pause ? 0 : H.vitesse; if (vit !== 1) { H.decalage += dt * 1000 * (vit - 1); }
      tSim = H.decalage / 1000;
      if (vueNom !== 'terre') {
        rig.rotation.y = 0; if (vueObj) vueObj.maj(dt, t, ts(), tSim);
        camera.near = vueObj && vueObj.near ? vueObj.near(camera) : .05; camera.far = 12000; camera.updateProjectionMatrix(); ciel.maj(dt, t, camera); return;
      }
      G.maj(dt, t, ts(), camera, tSim);
      rig.rotation.y = suivre ? G.terre.rotation.y : 0;
      const d = distCam(), wc = camera.getWorldPosition(vec(0, 0, 0)), dLune = wc.distanceTo(G.lune.position) - G.rLune;
      camera.near = Math.max(.0004, Math.min(d - 1, dLune) * .12); camera.far = 4000; camera.updateProjectionMatrix();
      if (SAT && satOn) {
        SAT.maj(dt, t, ts(), camera, G.sunDir);
        if (t - derOrb > 1.5) { derOrb = t; const o = SAT.orbite(ts()); if (o.length > 3) { orbISS.geometry.setFromPoints(o); orbISS.visible = true; } }
        if (focus) { const p = focus.pos(); if (p) { const delta = p.clone().sub(ctrl.c.target); camera.position.add(delta); ctrl.c.target.copy(p); camera.near = Math.max(.0003, Math.min(camera.near, camera.getWorldPosition(vec(0, 0, 0)).distanceTo(p) * .1)); camera.updateProjectionMatrix(); } }
        // ombre de la Terre sur la station : on éteint le Soleil quand elle est dans l'ombre (cylindre de rayon 1)
        const I = SAT.iss(ts()); if (I) { const k = I.pos.dot(G.sunDir), perp = I.pos.clone().addScaledVector(G.sunDir, -k).length(), ombre = k < 0 ? Math.max(0, Math.min(1, (1.0 - perp) / .0012 + .5)) : 0; G.lumiere.intensity = 3 * (1 - .97 * ombre); G.ambiante.intensity = focus ? .22 + .55 * ombre : .22; }   // dans l'ombre, la station n'est éclairée que par la lueur de la Terre
      }
      ciel.maj(dt, t, camera); geo.maj(dt, d); geo.opacite(G.uniforms.uBordA.value);
    }
    function rendre(renderer) {
      renderer.render(scene, camera);
      if (vueNom === 'terre' && q.reflets) rayons.rendre(renderer, camera, G.soleil.getWorldPosition(vec(0, 0, 0)), vec(0, 0, 0), G.lune.position, G.rLune, q.id === 'haute' ? 1 : .8);
    }
    ctx.canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    majMenu(); hud.charge(null);
    G.regler({ bord: 1 });
    // les appareils déjà localisés arrivent d'eux-mêmes si le panneau a été ouvert ; sinon à la demande (chip 📍)
    return {
      scene, camera, maj, tap, menu, commande, rig, ctrl, rendre,
      qualite(nq) { G.qualite(nq); },
      redim(w, h) { geo.resolution(w, h); },
      etat() { if (vueNom !== 'terre' && vueObj) return Object.assign({ ciel: ciel.courant(), temps: { vitesse: H.vitesse, pause: H.pause, date: new Date(ts()).toISOString() } }, vueObj.etat()); const p = G.latLon(camera.getWorldPosition(vec(0, 0, 0)).multiplyScalar(1)); return { vue: 'terre', distance: +distCam().toFixed(3), altitudeKm: Math.round((distCam() - 1) * 6371), sousLaCamera: { lat: +p.lat.toFixed(2), lon: +p.lon.toFixed(2) }, selection: selection && selection.nom, ciel: ciel.courant(), temps: { vitesse: H.vitesse, pause: H.pause, date: new Date(ts()).toISOString() }, actus: actus.groupes.size, appareils: repAppareils.length, definitionTerre: undefined }; },
      detruire() { try { desabonne && desabonne(); } catch (e) { /* rien */ } presEnCours++; if (SAT) SAT.detruire(); for (const v of cacheVues.values()) { try { v.detruire(); } catch (e) { /* déjà libérée */ } } rayons.detruire(); G.detruire(); ciel.detruire(); },
      _: { connait: nom => !!geo.centre(nom) || ASTRES_VOIX.test(String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’-]/g, ' ').replace(/^(?:la |le |les |l |planete )/, '').trim()), SAT: () => SAT, voirISS, G, geo, ciel, H, vol, aller, presenter, selectionner, camera, ctrl, THREE, allerVue, vue: () => vueObj, vueNom: () => vueNom, partage },
    };
  },
};
