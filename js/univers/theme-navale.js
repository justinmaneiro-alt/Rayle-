// ═════════════ THÈME « BATAILLE NAVALE, ANNÉES 1700 » (rendu dessin animé) ═════════════
// Mer animée, ciel et météo réels du lieu et de l'heure, navires de quatre nations (voilier, brick, frégate, vaisseau de ligne), équipages animés, combats, intérieur des navires.
// Interaction : un doigt / la souris = tourner ; pincer / molette = zoomer ; toucher un navire = le suivre ; vues : ensemble, suivre, pont, libre.
import { lireMeteo, surcharger, resume } from './navale/meteo.js?v=2026.10.14.5';
import { creerMer } from './navale/mer.js?v=2026.10.14.5';
import { creerCiel, altAz } from './navale/ciel.js?v=2026.10.14.5';
import { construireNavire } from './navale/navire-geo.js?v=2026.10.14.5';
import { creerEquipage } from './navale/equipage.js?v=2026.10.14.5';
import { Navire, creerParticules, creerBoulets, ia, dirVent } from './navale/flotte.js?v=2026.10.14.5';
import { creerSon } from './navale/son.js?v=2026.10.14.5';
import { NATIONS, tirerScenario, FAITS_TYPE, FAITS_NATION, VIE_A_BORD } from './donnees/navires.js?v=2026.10.14.5';

const RAD = Math.PI / 180;
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pont = () => window.RayleUniversPont || {};
const NOMS = { france: ['Le Soleil Royal', 'La Bretagne', 'Le Redoutable', 'L’Hermione', 'Le Vengeur', 'La Belle Poule', 'Le Téméraire', 'L’Intrépide'], angleterre: ['HMS Victory', 'HMS Temeraire', 'HMS Surprise', 'HMS Bellerophon', 'HMS Defiance', 'HMS Agamemnon', 'HMS Pickle', 'HMS Swiftsure'], espagne: ['Santísima Trinidad', 'San Juan Nepomuceno', 'Santa Ana', 'Real Carlos', 'San Justo', 'Rayo', 'Neptuno', 'Argonauta'], portugal: ['Nossa Senhora da Conceição', 'São Sebastião', 'Dom João', 'Príncipe Real', 'Rainha de Portugal', 'São Gabriel', 'Vasco da Gama', 'Afonso de Albuquerque'] };

export default {
  id: 'navale', nom: 'Bataille navale', icone: '⚓',
  async creer(ctx) {
    const { THREE, noyau, q } = ctx, hud = noyau.hud, A = window.RayleUI.astro;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, .3, 14000);
    const vec = (x, y, z) => new THREE.Vector3(x, y, z);
    hud.charge('Météo du lieu…', .5);
    let loc = null; try { const p = window.RayleLocalisation && RayleLocalisation.maPosition(); if (p) loc = p; } catch (e) { /* position non partagée : lieu de l'ambiance */ }
    if (ctx.options && ctx.options.lat != null && ctx.options.lon != null) loc = { lat: +ctx.options.lat, lon: +ctx.options.lon };
    let meteo = await lireMeteo(loc ? { lat: loc.lat, lon: loc.lon } : {}); if (ctx.options && ctx.options.meteo) meteo = surcharger(meteo, ctx.options.meteo);
    hud.charge('La mer et le ciel…', .7);
    const ciel = creerCiel(THREE, { q }); scene.add(ciel.mesh, ciel.lumiere.soleil, ciel.lumiere.lune, ciel.lumiere.hemi);
    const mer = creerMer(THREE, { q }); scene.add(mer.mesh);
    scene.fog = new THREE.FogExp2(0xaed0ee, .00022);
    mer.regler({ houle: meteo.houle, ventDir: meteo.ventDir });
    const part = creerParticules(THREE, q.fumee > .6 ? 1400 : 700); scene.add(part.mesh);
    const boulets = creerBoulets(THREE); scene.add(boulets.mesh);
    const son = creerSon(THREE, camera);
    camera.position.set(0, 14, 90); camera.lookAt(0, 4, 0);
    const ctrl = noyau.orbite(camera, { cible: vec(0, 6, 0), min: 6, max: 1500, rotation: .8, zoom: 1.2 }); ctrl.c.maxPolarAngle = Math.PI * .497;

    /* ───── monde ───── */
    const T = { decalage: 0 }; const ts = () => Date.now() + T.decalage;
    const monde = { mer, part, boulets, navires: [], t: 0, vent: { dir: meteo.ventDir, ms: meteo.ventMs }, ventVec: dirVent(meteo.ventDir), son, evenement: null, fini: false };
    const journal = [];
    monde.evenement = (type, n) => { if (type === 'coule') { const msg = n.nom + ' (' + NATIONS[n.nation].nom + ') coule !'; journal.push(msg); hud.legende('💥 ' + msg, 6000); try { RayleBus.emit('univers:navale', { evenement: 'coule', navire: n.nom, nation: n.nation }); } catch (e) { /* bus absent */ } } };
    let nomsPris = new Set();
    function nomPour(nation) { const l = NOMS[nation].filter(x => !nomsPris.has(x)); const x = (l.length ? l : NOMS[nation])[Math.floor(Math.random() * (l.length || NOMS[nation].length))]; nomsPris.add(x); return x; }
    let suivi = null, mode = 'ensemble', scenarioActuel = null;
    const L = ctx.etiquettes;

    function ajouterNavire(type, nation, x, z, cap, camp) {
      const g = construireNavire(THREE, { type, nation, q, graine: monde.navires.length + 3 });
      const nbEq = Math.max(6, Math.round(g.type.equipageVu * (.4 + .6 * q.equipage)));
      const eq = creerEquipage(THREE, { nb: nbEq, navire: g, q, graine: monde.navires.length + 1 }); g.groupe.add(eq.mesh);
      const n = new Navire(THREE, g, eq, { id: monde.navires.length, camp: camp || NATIONS[nation].alliance, nation, type, x, z, cap }); n.monde = monde; n.nom = nomPour(nation); n.equ = eq;
      n.capVoulu = cap; scene.add(g.groupe); monde.navires.push(n);
      const hex = c => '#' + c.toString(16).padStart(6, '0');
      L.ajouter({ id: 'nav:' + n.id, html: '<span class="nat" style="background:' + hex(NATIONS[nation].coque) + ';border-color:' + hex(NATIONS[nation].bande) + '"></span>' + esc(n.nom) + '<span class="univ-barre-vie"><i id="pv' + n.id + '" style="width:100%"></i></span>', classe: 'navire', position: () => vec(n.x, n.y + n.def.francBord + n.def.hauteurMat * .92 + 3, n.z), visible: () => n.etat === 'navigue', alpha: () => { const d = camera.position.distanceTo(vec(n.x, 0, n.z)); return d < 40 ? 0 : 1 - Math.max(0, Math.min(1, (d - 900) / 400)); }, onClick: () => suivre(n) });
      return n;
    }
    function viderFlotte() { for (const n of monde.navires) { scene.remove(n.geo.groupe); n.geo.detruire(); n.equ.detruire(); L.retirer('nav:' + n.id); } monde.navires.length = 0; nomsPris = new Set(); suivi = null; journal.length = 0; monde.fini = false; }
    function lancerScenario(nom, force) {
      viderFlotte(); const sc = (force && force.navires) ? force : tirerScenario(Math.random, nom); scenarioActuel = sc;
      const maxN = q.id === 'haute' ? 16 : q.id === 'moyenne' ? 10 : 6, liste = sc.navires.slice(0, maxN);
      const cap0 = (Math.random() * 360) * RAD;
      if (sc.nom === 'balade' || sc.nom === 'duo') {
        let chef = null; liste.forEach((s, i) => { const n = ajouterNavire(s.type, s.nation, i * 60 * Math.cos(cap0 + 1.5), i * 60 * Math.sin(cap0 + 1.5), cap0, s.nation); if (i === 0) chef = n; else { n.chef = chef; n.decalX = (i % 2 ? 1 : -1) * 20; } });
        for (const n of monde.navires) n.mode = 'patrouille';
      } else {
        // deux camps face à face à ~430 m, cap l'un vers l'autre ; ils se mettent en ligne de file en manœuvrant
        const axe = Math.random() * Math.PI * 2, ex = Math.sin(axe), ez = -Math.cos(axe), px = -ez, pz = ex, camps = {};
        liste.forEach(s => { (camps[s.camp] = camps[s.camp] || []).push(s); });
        Object.keys(camps).forEach((c, ci) => { const s = ci ? 1 : -1, nL = camps[c].length; camps[c].forEach((sh, i) => { const lat = (i - (nL - 1) / 2) * 95, along = s * 215; const n = ajouterNavire(sh.type, sh.nation, ex * along + px * lat, ez * along + pz * lat, Math.atan2(ex * s, ez * s) + (Math.random() - .5) * .3, c); n.mode = 'combat'; }); });
      }
      suivre(monde.navires[0], 'ensemble'); mode = 'ensemble'; ctrl.c.enabled = true; ctrl.c.target.set(0, 8, 0); camera.position.set(0, 90, 260); majMenu();
      const t = ({ balade: 'Un navire : ', duo: 'Deux navires : ', escarmouche: 'Une escarmouche : ', bataille: 'Une bataille : ' })[sc.nom] + monde.navires.map(n => n.def.art + ' ' + NATIONS[n.nation].adj + ' ' + n.nom).slice(0, 4).join(', ') + (monde.navires.length > 4 ? ' et ' + (monde.navires.length - 4) + ' autres' : '') + '.';
      hud.legende(t, 9000); return { ok: true, texte: t, scenario: sc };
    }

    /* ───── caméras : ensemble · suivre · pont · libre ───── */
    let yaw = 0, pitch = -.05, glisseOrbite = false;
    function suivre(n, m) { suivi = n; if (m) mode = m; if (n) ficheNavire(n); majMenu(); }
    function reglerMode(m) {
      mode = m; ctrl.c.enabled = m !== 'pont'; ctrl.c.enablePan = m === 'libre';
      if (m === 'pont') { yaw = 0; pitch = -.05; hud.legende('Vue du pont : glisse pour regarder autour de toi (ou les flèches du clavier).', 6000); }
      else { ctrl.c.minDistance = 6; if (m === 'suivre' && suivi) { const d = camera.position.distanceTo(vec(suivi.x, 0, suivi.z)); if (d > 260 || d < 20) camera.position.set(suivi.x + 50, 22, suivi.z + 70); } }
      majMenu();
    }
    function majCamera(dt) {
      if (!monde.navires.length || api.dedans) return;
      if (mode === 'ensemble') {
        let cx = 0, cz = 0, n = 0, r = 30; for (const s of monde.navires) if (s.etat === 'navigue') { cx += s.x; cz += s.z; n++; } if (!n) return; cx /= n; cz /= n; for (const s of monde.navires) if (s.etat === 'navigue') r = Math.max(r, Math.hypot(s.x - cx, s.z - cz));
        const t = ctrl.c.target, k = Math.min(1, dt * 1.2), dx = (cx - t.x) * k, dz = (cz - t.z) * k; t.x += dx; t.z += dz; t.y = 8; camera.position.x += dx; camera.position.z += dz;
        const dist = camera.position.distanceTo(t), veut = Math.max(110, r * 2.4 + 80); if (!glisseOrbite && Math.abs(dist - veut) > veut * .25) camera.position.sub(t).multiplyScalar(1 + (veut - dist) / dist * Math.min(1, dt * .4)).add(t);
      } else if (mode === 'suivre' && suivi) { const t = ctrl.c.target, dx = suivi.x - t.x, dz = suivi.z - t.z; t.x += dx; t.z += dz; t.y += (suivi.y + 6 - t.y) * .2; camera.position.x += dx; camera.position.z += dz; }
      else if (mode === 'pont' && suivi) {
        const g = suivi.geo.groupe, S = suivi.geo.forme, p = vec(0, S.yPont(.2) + 1.75, S.zDe(.16)); g.localToWorld(p); camera.position.copy(p);
        const a = suivi.cap + yaw, dir = vec(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch)); camera.lookAt(p.clone().add(dir)); ctrl.c.target.copy(p.clone().add(dir.multiplyScalar(5)));
      }
    }
    /* ───── arrivée depuis l'espace / départ vers l'espace ───── */
    let brumeArr = 0; const BLANC = new THREE.Color(0xe4edf7), lerp = (a, b, k) => a + (b - a) * k;
    async function arrivee() {
      ctrl.c.enabled = false; brumeArr = 1; const fin = () => { brumeArr = 0; camera.position.set(0, 90, 260); ctrl.c.target.set(0, 8, 0); camera.lookAt(ctrl.c.target); ctrl.c.enabled = true; ctrl.c.update(); majMenu(); };
      camera.position.set(260, 2400, 540); camera.lookAt(0, 8, 0);
      hud.legende('Nous arrivons au-dessus de ' + (ctx.options.lieuNom || 'l’océan') + '…', 6000);
      await noyau.cinematique(async a => { await a.tween(7, e => { const y = Math.exp(Math.log(2400) * (1 - e) + Math.log(90) * e); camera.position.set(lerp(260, 0, e), y, lerp(540, 260, e)); camera.lookAt(0, lerp(8, 8, e), 0); brumeArr = Math.pow(1 - e, 1.4); }, { ease: noyau.EASE.douce }); }, { fin });
      fin();
    }
    async function ascension(a) {
      ctrl.c.enabled = false; const p0 = camera.position.clone(), c0 = ctrl.c.target.clone(), h0 = Math.max(20, p0.y);
      await a.tween(5.5, e => { const y = Math.exp(Math.log(h0) * (1 - e) + Math.log(4200) * e); camera.position.set(lerp(p0.x, c0.x + 300, e), y, lerp(p0.z, c0.z + 600, e)); camera.lookAt(c0.x, 0, c0.z); brumeArr = Math.max(0, Math.min(1, (e - .3) / .6)); }, { ease: noyau.EASE.douce });
    }
    const ptr = { x: 0, y: 0, on: false };
    ctx.canvas.addEventListener('pointerdown', e => { glisseOrbite = true; ptr.on = true; ptr.x = e.clientX; ptr.y = e.clientY; son.activer(); });
    ctx.canvas.addEventListener('pointermove', e => { if (!ptr.on || mode !== 'pont') return; yaw -= (e.clientX - ptr.x) * .004; pitch = Math.max(-1, Math.min(.8, pitch - (e.clientY - ptr.y) * .004)); ptr.x = e.clientX; ptr.y = e.clientY; });
    const relache = () => { glisseOrbite = false; ptr.on = false; }; window.addEventListener('pointerup', relache);
    const touches = e => { if (mode !== 'pont') return; if (e.key === 'ArrowLeft') yaw += .06; if (e.key === 'ArrowRight') yaw -= .06; if (e.key === 'ArrowUp') pitch = Math.min(.8, pitch + .05); if (e.key === 'ArrowDown') pitch = Math.max(-1, pitch - .05); };
    window.addEventListener('keydown', touches);

    /* ───── fiche, tir, présentation, intérieur ───── */
    function ficheNavire(n) {
      if (!n) return; const d = n.def, c = n.canonsParCote, pv = Math.max(0, Math.round(100 * n.pv / n.pvMax));
      hud.carte({ titre: '⚓ ' + n.nom, html: '<p><b>' + esc(d.nom.charAt(0).toUpperCase() + d.nom.slice(1)) + '</b> · ' + esc(NATIONS[n.nation].nom) + '</p><p>Longueur ' + d.longueur + ' m · ' + (c[1] + c[-1]) + ' canons · équipage ' + d.equipage + '<br>Coque : ' + pv + ' % · vitesse ' + n.vitesseNoeuds.toFixed(1).replace('.', ',') + ' nœuds</p><p><small>' + esc(NATIONS[n.nation].devise) + '</small></p>',
        actions: [{ texte: '👁 Pont', clic: () => reglerMode('pont') }, { texte: '🎥 Suivre', clic: () => reglerMode('suivre') }, { texte: '🔭 Ensemble', clic: () => reglerMode('ensemble') }, { texte: '💥 Bordée', clic: () => tirer(n) }, { texte: '🚪 Intérieur', clic: () => interieur(n) }, { texte: '🎬 Présenter', clic: () => presenter(n) }] });
    }
    function tirer(n) {
      n = n || suivi; if (!n) return { ok: false, texte: 'Aucun navire sélectionné.' }; if (n.mode === 'patrouille') n.mode = 'combat-manuel';
      const cible = monde.navires.filter(o => o !== n && o.etat === 'navigue').sort((a, b) => Math.hypot(a.x - n.x, a.z - n.z) - Math.hypot(b.x - n.x, b.z - n.z))[0];
      let cote = 1; if (cible) { const brg = Math.atan2(-(cible.x - n.x), -(cible.z - n.z)); cote = (((brg - n.cap + 9 * Math.PI) % (2 * Math.PI)) - Math.PI) > 0 ? -1 : 1; }
      const ok = n.bordee(cote) || n.bordee(-cote); son.activer(); return { ok, texte: ok ? n.nom + ' tire une bordée !' : 'Les canons rechargent encore.' };
    }
    async function presenter(n) {
      n = n || suivi || monde.navires[0]; if (!n) return { ok: false, texte: 'Aucun navire.' }; const Pt = pont(), d = n.def, F = FAITS_TYPE[d.id], N = FAITS_NATION[n.nation], r = a => a[Math.floor(Math.random() * a.length)];
      const phr = [d.reelle, r(F.histoire), r(F.armement), r(N), r(F.anecdotes), r(VIE_A_BORD)].filter(Boolean).sort(() => Math.random() - .5).slice(0, 4);
      phr.unshift('Voici ' + n.nom + ', ' + d.art.replace(/^le /, 'un ').replace(/^la /, 'une ') + ' ' + NATIONS[n.nation].adj + ' de ' + d.longueur + ' mètres de long.');
      suivre(n, 'suivre'); const id = Pt.epoque ? Pt.epoque() : 0;
      for (const p of phr) { hud.legende(p, 12000); if (Pt.dire) { if ((await Pt.dire(p)) === false || (Pt.epoque && Pt.epoque() !== id)) break; } else await noyau.attendre(Math.min(7, 2 + p.length / 45)); }
      return { ok: true, texte: phr.join(' ') };
    }
    async function interieur(n, piece) {
      let m; try { m = await import('./navale/interieur.js?v=2026.10.14.5'); } catch (e) { hud.legende('L’intérieur n’est pas disponible : ' + e.message, 6000); return { ok: false, texte: 'L’intérieur n’est pas disponible.' }; }
      return m.entrer({ THREE, ctx, noyau, hud, scene, camera, ctrl, navire: n || suivi || monde.navires.find(x => x.etat === 'navigue'), piece, monde, theme: api, son, meteo: () => meteo });
    }
    function tap(x, y) {
      if (api.dedans) return;
      const { w, h } = noyau.dims(); let best = null, bd = 60;
      for (const n of monde.navires) { if (n.etat !== 'navigue') continue; const p = vec(n.x, n.y + n.def.francBord + 3, n.z).project(camera); if (p.z > 1) continue; const d = Math.hypot((p.x * .5 + .5) * w - x, (-p.y * .5 + .5) * h - y); if (d < bd) { bd = d; best = n; } }
      if (best) suivre(best);
    }

    /* ───── météo, heure, lanternes ───── */
    function etatCiel() {
      const p = A.position(ts(), meteo.lat, meteo.lon), lu = A.luneEq(ts()), la = altAz(A, lu.ra, lu.dec, meteo.lat, meteo.lon, ts()), ph = A.lune(ts());
      const alt = meteo.forceMoment ? meteo.soleilAlt : p.altitude, jour = meteo.forceMoment ? meteo.jour : (A.luminosite ? A.luminosite(alt) : Math.max(0, Math.min(1, (alt + 8) / 20)));
      const chaud = Math.max(0, 1 - Math.abs(alt) / 9) * (1 - Math.max(0, (alt - 4) / 8));
      return { jour, chaud, nuages: meteo.nuages, orage: meteo.orage, brouillard: meteo.brouillard, pluie: meteo.pluie, ventDir: meteo.ventDir, soleil: { alt, az: p.azimut }, lune: { alt: la.alt, az: la.az, phase: ph.phase, eclairee: ph.eclairee } };
    }
    function appliquerMeteo(o) {
      const forceM = !!o.moment; meteo = surcharger(meteo, o); if (forceM) meteo.forceMoment = true;
      if (o.meteo || o.vent != null) { mer.regler({ houle: meteo.houle, ventDir: meteo.ventDir }); monde.vent.ms = meteo.ventMs; monde.vent.dir = meteo.ventDir; monde.ventVec = dirVent(meteo.ventDir); }
      const t = resume(meteo); hud.legende(t, 7000); return { ok: true, texte: t };
    }
    const texL = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(.3, 'rgba(255,190,80,.6)'); gr.addColorStop(1, 'rgba(255,150,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    function majLanternes(jour) {
      for (const n of monde.navires) {
        if (!n.lanternes) { n.lanternes = []; const S = n.geo.forme; for (const [x, y, z, s] of [[0, S.yPont(.02) + 3.2, S.zDe(.0) + 1.2, 4], [0, S.yPont(.5) + n.def.hauteurMat * .5, S.zDe(.5), 3], [0, S.yPont(.98) + 1.5, S.zDe(.96), 2.5]]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sp.position.set(x, y, z); sp.scale.setScalar(s * (1 + n.def.longueur / 60)); n.geo.groupe.add(sp); n.lanternes.push(sp); } }
        const k = Math.max(0, 1 - jour * 3.2); for (const sp of n.lanternes) { sp.visible = k > .02; sp.material.opacity = k * (.85 + .15 * Math.sin(monde.t * 5 + n.id)); }
      }
    }

    /* ───── boucle ───── */
    let pluieAcc = 0;
    function maj(dt, t) {
      monde.t = t; const e = etatCiel(); ciel.maj(dt, t, camera, e);
      scene.fog.color.setRGB(...ciel.etat.couleurs.horizon); scene.fog.density = .00022 + e.brouillard * .0075 + e.orage * .0004 + brumeArr * .0011; if (brumeArr > 0) scene.fog.color.lerp(BLANC, Math.min(1, brumeArr * 1.2));
      mer.maj(dt, t, camera, Object.assign({ sunDir: ciel.etat.sunDir, moonDir: ciel.etat.moonDir, couleurs: ciel.etat.couleurs, eclair: ciel.etat.eclair }, e));
      const lum = ciel.etat.sunDir.y > -.1 ? ciel.etat.sunDir : ciel.etat.moonDir, amb = vec(.4 + .3 * e.jour + ciel.etat.eclair * .5, .4 + .3 * e.jour + ciel.etat.eclair * .5, .5 + .2 * e.jour + ciel.etat.eclair * .5);
      const vivants = monde.navires.filter(n => n.etat === 'navigue');
      for (const n of monde.navires) {
        ia(n, monde, dt); n.maj(dt, t, monde); n.poseSurHoule(monde, t);
        const u = n.geo.uni, uv = n.geo.uV; u.uT.value = t; uv.uT.value = t; uv.uVent.value = meteo.ventMs; u.uSun.value.copy(lum); u.uAmb.value.copy(amb); u.uSunCol.value.set(.4 + e.jour, .45 + .95 * e.jour, .6 + .85 * e.jour).multiplyScalar(e.jour > .3 ? 1 : .6);
        n.equ.maj(t, n.mode === 'patrouille' ? 0 : 1); const b = document.getElementById('pv' + n.id); if (b) b.style.width = Math.max(0, 100 * n.pv / n.pvMax) + '%';
        const wa = Math.atan2(-monde.ventVec[0], -monde.ventVec[1]); for (const d of n.geo.drapeaux) d.rotation.y = n.cap - wa + Math.PI / 2 * 0 - Math.PI / 2 * 0 + Math.PI;
      }
      majLanternes(e.jour);
      boulets.maj(dt, monde, monde.navires); part.maj(dt);
      if (meteo.pluie > .25) { pluieAcc += dt * 260 * meteo.pluie; while (pluieAcc > 1) { pluieAcc--; part.emettre({ x: camera.position.x + (Math.random() - .5) * 70, y: camera.position.y + 18 + Math.random() * 12, z: camera.position.z + (Math.random() - .5) * 70, vx: monde.ventVec[0] * 6, vy: -26, vz: monde.ventVec[1] * 6, vie: .9, taille: .3, couleur: [.7, .78, .9, .6] }); } }
      son.reglerAmbiance(Math.min(1, meteo.ventMs / 18));
      majCamera(dt);
      if (scenarioActuel && (scenarioActuel.nom === 'bataille' || scenarioActuel.nom === 'escarmouche') && !monde.fini && monde.navires.length > 1) { const camps = new Set(vivants.map(n => n.camp)); if (camps.size <= 1) { monde.fini = true; hud.legende('🏁 ' + (camps.size ? 'Le camp ' + (camps.has('bourbon') ? 'franco-espagnol' : 'anglo-portugais') + ' l’emporte.' : 'Plus aucun navire à flot.'), 9000); } }
      camera.far = 14000; camera.updateProjectionMatrix();
    }

    /* ───── menu et commandes ───── */
    let meteoIdx = -1, heureIdx = -1;
    function menu() {
      return [
        { id: 'sc-bal', texte: '⛵ Balade', titre: 'Un seul navire qui se promène', clic: () => lancerScenario('balade') },
        { id: 'sc-duo', texte: '⛵⛵ Duo', titre: 'Deux navires ensemble', clic: () => lancerScenario('duo') },
        { id: 'sc-esc', texte: '⚔ Escarmouche', titre: 'Petit combat, 1 à 2 navires par camp', clic: () => lancerScenario('escarmouche') },
        { id: 'sc-bat', texte: '💥 Bataille', titre: 'Grande bataille, jusqu’à 4 navires par nation', clic: () => lancerScenario('bataille') },
        { id: 'cam-ens', texte: '🔭 Ensemble', actif: mode === 'ensemble', clic: () => reglerMode('ensemble') },
        { id: 'cam-suiv', texte: '🎥 Suivre', actif: mode === 'suivre', clic: () => { if (!suivi) suivre(monde.navires.find(n => n.etat === 'navigue')); reglerMode('suivre'); } },
        { id: 'cam-pont', texte: '👁 Pont', actif: mode === 'pont', clic: () => { if (!suivi) suivre(monde.navires.find(n => n.etat === 'navigue')); reglerMode('pont'); } },
        { id: 'cam-lib', texte: '🕹 Libre', actif: mode === 'libre', clic: () => reglerMode('libre') },
        { id: 'suiv', texte: '⏭ Navire suivant', clic: () => { const v = monde.navires.filter(n => n.etat === 'navigue'); if (v.length) suivre(v[(v.indexOf(suivi) + 1) % v.length]); } },
        { id: 'feu', texte: '💥 Feu !', titre: 'Bordée du navire suivi', clic: () => tirer() },
        { id: 'int', texte: '🚪 Intérieur', titre: 'Visiter l’intérieur du navire (pont, batteries, cuisine, cabine, soute, infirmerie, cale)', clic: () => interieur() },
        { id: 'meteo', texte: '☁ Météo', titre: 'Passe à la tempête, la pluie, le brouillard, le calme, le beau temps', clic: () => { const o = ['tempete', 'pluie', 'brouillard', 'calme', 'clair']; meteoIdx = (meteoIdx + 1) % o.length; appliquerMeteo({ meteo: o[meteoIdx] }); } },
        { id: 'heure', texte: '🕒 Heure', titre: 'Aube, jour, crépuscule, nuit', clic: () => { const o = ['aube', 'jour', 'crepuscule', 'nuit']; heureIdx = (heureIdx + 1) % o.length; appliquerMeteo({ moment: o[heureIdx] }); } },
        { id: 'son', texte: son.estMuet() ? '🔇 Son' : '🔊 Son', clic: () => { son.activer(); son.muet(!son.estMuet()); majMenu(); } },
      ];
    }
    const majMenu = () => hud.sousMenu(menu());
    // le navire demandé (type, nation) : celui qui existe déjà, sinon une balade avec ce navire
    function assurerNavire(a = {}) {
      const v = monde.navires.filter(n => n.etat === 'navigue');
      let n = v.find(x => (!a.type || x.typeId === a.type) && (!a.nation || x.nation === a.nation));
      if (!n && (a.type || a.nation)) { const nat = a.nation || ['france', 'espagne', 'angleterre', 'portugal'][Math.floor(Math.random() * 4)]; lancerScenario('balade', { nom: 'balade', navires: [{ type: a.type || 'fregate', nation: nat }] }); n = monde.navires[0]; }
      return n || suivi || v[0];
    }
    async function commande(nom, a = {}) {
      switch (nom) {
        case 'scenario': return lancerScenario(a.nom);
        case 'meteo': return appliquerMeteo(a);
        case 'camera': reglerMode(a.mode || 'ensemble'); return { ok: true, texte: ({ ensemble: 'Vue d’ensemble.', suivre: 'Je suis le navire.', pont: 'Vue du pont.', libre: 'Caméra libre.' })[a.mode] || 'Caméra changée.' };
        case 'tirer': return tirer();
        case 'terre': return commande('espace', a);
        case 'suivre': { assurerNavire(a); const v = monde.navires.filter(n => n.etat === 'navigue'); const n = v.find(x => a.nom && x.nom.toLowerCase().includes(String(a.nom).toLowerCase())) || (a.nation && v.find(x => x.nation === a.nation)) || (a.type && v.find(x => x.typeId === a.type)) || v[0]; if (!n) return { ok: false, texte: 'Aucun navire à flot.' }; suivre(n, 'suivre'); return { ok: true, texte: 'Je suis ' + n.nom + '.' }; }
        case 'presenter': return presenter(assurerNavire(a));
        case 'interieur': return interieur(assurerNavire(a), a.piece);
        case 'piece': if (api.dedans) { const ok = await api.dedans.aller(a.piece); return { ok, texte: ok ? 'Voici : ' + a.piece + '.' : 'Je ne trouve pas cette pièce sur ce navire.' }; } return interieur(assurerNavire(a), a.piece);
        case 'sortir-interieur': if (api.dedans) { await api.dedans.sortir(); return { ok: true, texte: 'Retour à l’extérieur.' }; } return { ok: true, texte: 'Vous êtes déjà dehors.' };
        case 'visite-interieur': { const r = await interieur(assurerNavire(a), a.piece); if (api.dedans) api.dedans.visiter(); return r; }
        case 'info-meteo': { const t = resume(meteo); hud.legende(t, 8000); return { ok: true, texte: t }; }
        case 'son': son.activer(); son.muet(!!a.muet); majMenu(); return { ok: true, texte: a.muet ? 'Son coupé.' : 'Son activé.' };
        case 'espace': { noyau.changerTheme('espace', { depuis: 'navale', lat: meteo.lat, lon: meteo.lon }).catch(e => console.warn('[navale] retour espace', e)); return { ok: true, texte: 'Je remonte vers l’espace.' }; }
        case 'options': return { ok: true };
        default: return { ok: false, texte: 'Commande inconnue : ' + nom };
      }
    }
    ctx.canvas.addEventListener('wheel', ev => ev.preventDefault(), { passive: false });
    lancerScenario(ctx.options && ctx.options.scenario, ctx.options && ctx.options.navires ? { nom: 'balade', navires: ctx.options.navires } : undefined);
    hud.charge(null); majMenu();
    hud.legende(resume(meteo) + ' (' + meteo.source + ')', 9000);
    if (ctx.options && ctx.options.depuis === 'espace') setTimeout(() => arrivee().catch(e => console.warn('[navale] arrivée', e)), 120);
    const api = {
      scene, camera, maj, tap, ctrl, menu, commande,
      etat: () => ({ vue: 'navale', scenario: scenarioActuel && scenarioActuel.nom, mode, navires: monde.navires.map(n => ({ nom: n.nom, nation: n.nation, type: n.typeId, etat: n.etat, pv: Math.round(100 * n.pv / n.pvMax), vit: +n.vitesseNoeuds.toFixed(1) })), suivi: suivi && suivi.nom, meteo: { vent: meteo.ventMs, houle: meteo.houle, moment: meteo.moment, pluie: meteo.pluie, orage: meteo.orage }, boulets: boulets.nombre() }),
      detruire() { window.removeEventListener('keydown', touches); window.removeEventListener('pointerup', relache); viderFlotte(); part.detruire(); boulets.detruire(); ciel.detruire(); mer.detruire(); son.arreter(); },
      _: { monde, mer, ciel, part, boulets, ajouterNavire, lancerScenario, reglerMode, suivre, tirer, T, THREE, meteo: () => meteo, appliquerMeteo, ctrl, presenter, interieur, journal, arrivee, ascension, vueNom: () => 'navale' },
    };
    return api;
  },
};
