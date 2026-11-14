/* ═════════════ TERRE MOBILE : globe complet, autonome, sans le PC ni la galaxie ═════════════
   Pourquoi : sur téléphone, le module 3D du PC (tuiles de plusieurs serveurs, Workers, texture 8k) restait sur « Chargement de la Terre… ».
   Ici : textures libres hébergées dans le dépôt (Solar System Scope, CC BY 4.0, d'après NASA Blue Marble / Black Marble) en deux niveaux
   (1k immédiate, 4k ensuite selon l'appareil), jour / nuit calculés d'après le vrai Soleil, nuages, atmosphère, étoiles, séismes USGS (direct),
   météo Open-Meteo (direct), recherche de ville, actualités du monde (snapshot). Indicateur de progression, erreur claire + « Réessayer », libération
   complète de la mémoire à la fermeture, pause quand l'onglet est caché. Aucun appel obligatoire à un serveur du PC. */
import * as T from './terre-calcul.js';
import { lireDonnee, badge, creerStockageParDefaut } from '../../../agent-trading/front/donnees/couche.js';
import { lireRoute } from '../../../agent-trading/front/donnees/routes.js';

const BASE = new URL('./textures/', import.meta.url).href;
const THREE_URL = new URL('../../../galaxie/vendor/three.module.min.js', import.meta.url).href;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let instance = null;
export const etat = () => (instance ? instance.etat() : { actif: false });

async function telecharger(url, suivi, cle) {
  const r = await fetch(url, { cache: 'force-cache' }); if (!r.ok) throw new Error('texture introuvable (' + r.status + ')');
  const total = +r.headers.get('content-length') || 0; suivi[cle] = { total: total || 700000, charge: 0 };
  if (!r.body || !r.body.getReader) { const b = await r.blob(); suivi[cle] = { total: b.size, charge: b.size }; return b; }
  const lecteur = r.body.getReader(), morceaux = []; let n = 0;
  for (;;) { const { done, value } = await lecteur.read(); if (done) break; morceaux.push(value); n += value.length; suivi[cle].charge = n; if (n > suivi[cle].total) suivi[cle].total = n; }
  suivi[cle].charge = suivi[cle].total; return new Blob(morceaux, { type: r.headers.get('content-type') || 'image/jpeg' });
}
const qualiteChoisie = () => { try { return localStorage.getItem('rayle_qualite') || 'auto'; } catch (e) { return 'auto'; } };

export async function ouvrir({ racine = document.body, onFermer = () => {} } = {}) {
  if (instance) return instance;
  const el = document.createElement('section'); el.id = 'terre-mobile'; el.setAttribute('aria-label', 'La Terre');
  el.innerHTML = `<canvas class="tm-toile" aria-hidden="true"></canvas>
    <div class="tm-charge" role="status"><div class="tm-globe" aria-hidden="true"></div><p class="tm-msg">Chargement de la Terre…</p><div class="tm-barre"><i></i></div><p class="tm-detail"></p></div>
    <div class="tm-erreur" hidden role="alert"><p class="tm-erreur-txt"></p><button type="button" data-a="reessayer">Réessayer</button></div>
    <header class="tm-tete"><b>Terre</b><span class="tm-info"></span></header>
    <form class="tm-recherche" role="search"><input type="search" placeholder="Ville ou pays" aria-label="Chercher un lieu" autocomplete="off"><button type="submit" aria-label="Aller à ce lieu">Aller</button></form>
    <nav class="tm-couches" aria-label="Couches"><button type="button" data-c="seismes" aria-pressed="true">Séismes</button><button type="button" data-c="nuages" aria-pressed="true">Nuages</button><button type="button" data-c="nuit" aria-pressed="true">Jour / nuit</button><button type="button" data-c="rotation" aria-pressed="true">Rotation</button><button type="button" data-a="actus">Actualités</button></nav>
    <aside class="tm-fiche" hidden></aside><p class="tm-credit">Textures : Solar System Scope (CC BY 4.0), d’après NASA · séismes : USGS · météo : Open-Meteo</p>`;
  racine.appendChild(el);
  const $ = s => el.querySelector(s);
  const S = { couches: { seismes: true, nuages: true, nuit: true, rotation: true }, ferme: false, THREE: null, gl: null, suivi: {}, haute: false, erreur: null, pret: false, vue: { lat: 30, lon: 10, dist: 3.4 }, vit: { lon: 0, lat: 0 } };
  const maj = (msg, detail) => { const m = $('.tm-msg'); if (m && msg) m.textContent = msg; const d = $('.tm-detail'); if (d && detail != null) d.textContent = detail; const b = $('.tm-barre i'); if (b) b.style.width = Math.round(T.progression(S.suivi) * 100) + '%'; };
  const echec = (e, titre = 'La Terre n’a pas pu s’afficher') => { S.erreur = String(e && e.message || e); console.warn('[terre mobile]', e); $('.tm-charge').hidden = true; const x = $('.tm-erreur'); x.hidden = false; $('.tm-erreur-txt').textContent = titre + ' : ' + S.erreur + '.'; };

  /* ───── WebGL ───── */
  function creerGl() {
    const toile = $('.tm-toile'), test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('WebGL n’est pas disponible sur cet appareil ou ce navigateur');
    const THREE = S.THREE, rend = new THREE.WebGLRenderer({ canvas: toile, antialias: false, alpha: false, powerPreference: 'high-performance' });
    S.maxTex = rend.capabilities.maxTextureSize; S.res = T.choisirResolution({ maxTexture: S.maxTex, memoireGo: navigator.deviceMemory || 4, mode: (window.RayleAppareil && window.RayleAppareil.mode()) || 'telephone', qualite: qualiteChoisie() });
    rend.setPixelRatio(Math.min(window.devicePixelRatio || 1, S.res.ratio)); rend.setClearColor(0x02040a, 1); rend.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
    S.gl = { rend, scene, cam, toile, jetables: [] }; return S.gl;
  }
  const jeter = o => { try { o.dispose && o.dispose(); } catch (e) { /* */ } };
  function construire() {
    const { THREE } = S, { scene, jetables } = S.gl; const garde = o => { jetables.push(o); return o; };
    const sol = new THREE.SphereGeometry(1, S.res.ratio >= 2 ? 96 : 64, S.res.ratio >= 2 ? 64 : 48); garde(sol);
    S.u = { jour: { value: S.tex.jour1k }, nuit: { value: S.tex.nuit }, soleil: { value: new THREE.Vector3(1, 0, 0) }, nuitActive: { value: 1 } };
    const matSol = garde(new THREE.ShaderMaterial({ uniforms: S.u,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D jour; uniform sampler2D nuit; uniform vec3 soleil; uniform float nuitActive; varying vec2 vUv; varying vec3 vN; void main(){ float d = dot(normalize(vN), normalize(soleil)); float k = mix(1.0, smoothstep(-0.12, 0.18, d), nuitActive); vec3 j = texture2D(jour, vUv).rgb * (0.42 + 0.95 * max(d, 0.0) * nuitActive + 0.75 * (1.0 - nuitActive)); vec3 n = texture2D(nuit, vUv).rgb * 1.35; vec3 c = mix(n * 0.9 + texture2D(jour, vUv).rgb * 0.05, j, k); gl_FragColor = vec4(c, 1.0); }' }));
    S.sol = new THREE.Mesh(sol, matSol); S.sol.matrixAutoUpdate = true; scene.add(S.sol);
    if (S.res.nuages && S.tex.nuages) { const m = garde(new THREE.MeshBasicMaterial({ map: S.tex.nuages, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.NormalBlending })); S.nuages = new THREE.Mesh(garde(new THREE.SphereGeometry(1.012, 64, 48)), m); scene.add(S.nuages); }
    const atm = garde(new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { soleil: S.u.soleil },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = (modelViewMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; varying vec3 vP; void main(){ float f = pow(0.78 - dot(vN, normalize(-vP)), 3.0); gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * clamp(f, 0.0, 1.0) * 0.55; }' }));
    scene.add(new THREE.Mesh(garde(new THREE.SphereGeometry(1.06, 48, 32)), atm));
    const n = S.res.etoiles, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u), R = 40 + Math.random() * 10; pos.set([R * r * Math.cos(a), R * u, R * r * Math.sin(a)], i * 3); }
    const gE = garde(new THREE.BufferGeometry()); gE.setAttribute('position', new THREE.BufferAttribute(pos, 3)); scene.add(new THREE.Points(gE, garde(new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }))));
    S.groupeSeismes = new THREE.Group(); scene.add(S.groupeSeismes);
    S.marque = new THREE.Mesh(garde(new THREE.RingGeometry(0.012, 0.018, 24)), garde(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }))); S.marque.visible = false; scene.add(S.marque);
  }
  function placerCamera() {
    const { cam } = S.gl, v = S.vue, p = T.versVecteur(T.limiterLat(v.lat), v.lon, T.limiterDistance(v.dist)); cam.position.set(p.x, p.y, p.z); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
    const bas = $('.tm-info'); if (bas) bas.textContent = `${Math.abs(v.lat).toFixed(0)}°${v.lat >= 0 ? 'N' : 'S'} ${Math.abs(((v.lon + 540) % 360) - 180).toFixed(0)}°${((v.lon + 540) % 360) - 180 >= 0 ? 'E' : 'O'}`;
  }
  function orienterSoleil() { const s = T.pointSousSoleil(Date.now()), v = T.versVecteur(s.lat, s.lon); S.u.soleil.value.set(v.x, v.y, v.z); }
  function redim() { const { rend, cam, toile } = S.gl, w = toile.clientWidth || el.clientWidth || 360, h = toile.clientHeight || el.clientHeight || 640; rend.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); if (!S.distInit) { S.distInit = true; S.vue.dist = w / h < 0.8 ? 4.8 : 3.6; } }

  /* ───── chargement ───── */
  async function chargerTexture(nom, { flip = true } = {}) {
    const THREE = S.THREE, blob = await telecharger(BASE + nom, S.suivi, nom); maj();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY' }); const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(4, S.gl.rend.capabilities.getMaxAnisotropy()); t.needsUpdate = true; return t;
  }
  async function demarrer() {
    $('.tm-erreur').hidden = true; $('.tm-charge').hidden = false; S.erreur = null; maj('Chargement de la Terre…', 'moteur 3D'); S.suivi = {};
    try {
      S.THREE = S.THREE || await import(THREE_URL); if (S.ferme) return; if (!S.gl) creerGl(); redim();
      S.tex = S.tex || {}; maj('Chargement de la Terre…', 'images (basse résolution)');
      const [j, n, c] = await Promise.all([S.tex.jour1k || chargerTexture('jour-1k.jpg'), S.tex.nuit || chargerTexture('nuit-2k.jpg'), S.res.nuages ? (S.tex.nuages || chargerTexture('nuages-1k.jpg')).catch(() => null) : Promise.resolve(null)]);
      if (S.ferme) { [j, n, c].forEach(t => t && jeter(t)); return; } S.tex.jour1k = j; S.tex.nuit = n; S.tex.nuages = c; if (!S.sol) construire();
      S.pret = true; $('.tm-charge').hidden = true; orienterSoleil(); placerCamera(); boucle(); chargerSeismes();
      if (S.res.haute && !S.haute) hauteResolution();
    } catch (e) { if (!S.ferme) echec(e); }
  }
  async function hauteResolution() {
    try { const bar = $('.tm-tete .tm-info'); const t = await chargerTexture('jour-4k.jpg'); if (S.ferme) { jeter(t); return; } if (S.u) { const ancien = S.u.jour.value; S.u.jour.value = t; S.tex.jour4k = t; S.haute = true; if (ancien !== t && ancien) { jeter(ancien); } } bar && 0; }
    catch (e) { console.info('[terre mobile] haute résolution indisponible :', e && e.message); }
  }

  /* ───── séismes (USGS, direct) ───── */
  async function chargerSeismes() {
    if (!S.couches.seismes) return;
    try {
      const r = await lireDonnee('seismes', { ttl: 5 * 60e3, stockage: creerStockageParDefaut(), sources: [{ niveau: 'direct', nom: 'USGS (direct)', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', ms: 12000 }], valider: d => (d && Array.isArray(d.features) ? true : 'réponse invalide') });
      S.seismes = T.lireSeismes(r.donnees, 60); S.seismesBadge = badge(r); dessinerSeismes();
    } catch (e) { S.seismes = []; S.seismesBadge = 'séismes indisponibles (' + String(e.message).slice(0, 60) + ')'; }
  }
  function dessinerSeismes() {
    const { THREE } = S, g = S.groupeSeismes; if (!g) return;
    for (const m of [...g.children]) { g.remove(m); jeter(m.geometry); jeter(m.material); }
    if (!S.couches.seismes) return;
    for (const q of S.seismes || []) { const p = T.versVecteur(q.lat, q.lon, 1.004), m = new THREE.Mesh(new THREE.SphereGeometry(T.rayonSeisme(q.mag), 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.couleurSeisme(q.mag)), transparent: true, opacity: 0.9 })); m.position.set(p.x, p.y, p.z); m.userData = q; g.add(m); }
  }

  /* ───── fiches : météo d'un point, séisme, actualités ───── */
  const fiche = html => { const f = $('.tm-fiche'); f.innerHTML = html + '<button type="button" class="tm-x" data-a="fiche-fermer" aria-label="Fermer la fiche">×</button>'; f.hidden = false; };
  async function meteo(lat, lon, nom) {
    fiche(`<h3>${esc(nom || lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°')}</h3><p class="tm-doux">Météo en cours de lecture…</p>`);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
      const r = await lireDonnee('meteo|' + lat.toFixed(1) + '|' + lon.toFixed(1), { ttl: 10 * 60e3, stockage: creerStockageParDefaut(), sources: [{ niveau: 'direct', nom: 'Open-Meteo (direct)', url, ms: 10000 }], valider: d => (d && d.current ? true : 'réponse invalide') });
      const c = r.donnees.current, b = badge(r);
      fiche(`<h3>${esc(nom || lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°')}</h3><p class="tm-grand">${Math.round(c.temperature_2m)} °C <small>${esc(T.texteMeteo(c.weather_code))}</small></p><p>Ressenti ${Math.round(c.apparent_temperature)} °C · humidité ${c.relative_humidity_2m} % · vent ${Math.round(c.wind_speed_10m)} km/h · pluie ${c.precipitation} mm</p>${b ? `<p class="tm-doux">${esc(b)}</p>` : ''}<p class="tm-doux">Source : Open-Meteo.</p>`);
    } catch (e) { fiche(`<h3>${esc(nom || 'Ce lieu')}</h3><p class="tm-doux">Météo indisponible : ${esc(e.message)}</p>`); }
  }
  async function nommer(lat, lon) {
    try { const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&localityLanguage=fr`, { signal: AbortSignal.timeout(6000) }); const d = await r.json(); return d.city || d.locality || d.principalSubdivision || d.countryName || null; } catch (e) { return null; }
  }
  function ficheSeisme(q) { fiche(`<h3>Séisme M ${q.mag.toFixed(1)}</h3><p>${esc(q.lieu || 'lieu non précisé')}</p><p>${q.prof != null ? 'Profondeur ' + Math.round(q.prof) + ' km · ' : ''}${new Date(q.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (heure de Paris)</p>${q.lien ? `<p><a href="${esc(q.lien)}" target="_blank" rel="noopener noreferrer">Fiche USGS</a></p>` : ''}<p class="tm-doux">Source : USGS, données préliminaires.${S.seismesBadge ? ' ' + esc(S.seismesBadge) + '.' : ''}</p>`); }
  async function actualites() {
    fiche('<h3>Actualités du monde</h3><p class="tm-doux">Lecture…</p>');
    try { const r = await lireRoute('/__actus?q=tout&n=14'), b = badge(r), L = (r.donnees.items || []).slice(0, 14);
      fiche(`<h3>Actualités du monde</h3>${b ? `<p class="tm-doux">${esc(b)}</p>` : ''}<ul class="tm-actus">${L.map(x => `<li><a href="${/^https?:\/\//.test(x.lien || '') ? esc(x.lien) : '#'}" target="_blank" rel="noopener noreferrer">${esc(x.titre)}</a><small>${esc(x.source || '')}${x.date ? ' · ' + new Date(x.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</small></li>`).join('') || '<li class="tm-doux">Aucune actualité disponible.</li>'}</ul>`);
    } catch (e) { fiche(`<h3>Actualités du monde</h3><p class="tm-doux">${esc(e.message)}</p>`); }
  }
  async function chercher(texte) {
    const q = String(texte || '').trim(); if (q.length < 2) return;
    try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=fr&format=json`, { signal: AbortSignal.timeout(8000) }); const d = await r.json(), l = d.results && d.results[0];
      if (!l) { fiche(`<h3>Lieu introuvable</h3><p class="tm-doux">Aucun résultat pour « ${esc(q)} ».</p>`); return; }
      volerVers(l.latitude, l.longitude, 1.9); meteo(l.latitude, l.longitude, [l.name, l.admin1, l.country].filter(Boolean).join(', '));
    } catch (e) { fiche(`<h3>Recherche indisponible</h3><p class="tm-doux">${esc(e.name === 'TimeoutError' ? 'délai dépassé' : e.message)}. La recherche demande une connexion.</p>`); }
  }
  function volerVers(lat, lon, dist = 2) { S.vol = { t0: performance.now(), d: 900, de: { ...S.vue }, vers: { lat, lon: ((lon - S.vue.lon + 540) % 360) - 180 + S.vue.lon, dist } }; S.vit.lon = S.vit.lat = 0; S.couches.rotation && (S.pauseRot = performance.now() + 4000); }

  /* ───── gestes : un doigt tourne, deux doigts zooment, appui bref = météo / séisme ───── */
  const ptrs = new Map(); let gest = null;
  const ecart = () => { const [a, b] = [...ptrs.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null; };
  const sur = (n, f, o) => el.addEventListener(n, f, o);
  const surToile = e => !e.target.closest('.tm-couches,.tm-fiche,.tm-recherche,.tm-erreur,.tm-tete');
  sur('pointerdown', e => { if (!surToile(e) || !S.pret) return; el.setPointerCapture && el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); gest = { t: performance.now(), x: e.clientX, y: e.clientY, bouge: 0, dist0: ecart(), d0: S.vue.dist }; S.vit.lon = S.vit.lat = 0; S.vol = null; });
  sur('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) { const d = ecart(); if (gest && gest.dist0) S.vue.dist = T.limiterDistance(gest.d0 * gest.dist0 / Math.max(20, d)); if (gest) gest.bouge += 99; return; }
    const k = 0.18 * (S.vue.dist - 0.9) / 2.5; S.vue.lon -= dx * k; S.vue.lat = T.limiterLat(S.vue.lat + dy * k); S.vit.lon = -dx * k * 60; S.vit.lat = dy * k * 60; if (gest) gest.bouge += Math.abs(dx) + Math.abs(dy);
  });
  const fin = e => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (!p || !gest) return; if (ptrs.size === 0 && gest.bouge < 8 && performance.now() - gest.t < 350) { S.vit.lon = S.vit.lat = 0; toucher(e.clientX, e.clientY); } if (ptrs.size === 0) gest = null; };
  sur('pointerup', fin); sur('pointercancel', fin);
  sur('wheel', e => { if (!surToile(e)) return; S.vue.dist = T.limiterDistance(S.vue.dist * (1 + Math.sign(e.deltaY) * 0.08)); e.preventDefault(); }, { passive: false });
  function toucher(cx, cy) {
    const { cam, toile } = S.gl, r = toile.getBoundingClientRect(), x = ((cx - r.left) / r.width) * 2 - 1, y = -((cy - r.top) / r.height) * 2 + 1, THREE = S.THREE;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), cam);
    const pt = T.toucherSphere(ray.ray.origin, ray.ray.direction); if (!pt) { $('.tm-fiche').hidden = true; return; }
    const ll = T.depuisVecteur(pt);
    const q = (S.couches.seismes && S.seismes || []).map(s => [T.distanceAngulaire(s, ll), s]).sort((a, b) => a[0] - b[0])[0];
    if (q && q[0] < 2.2 + S.vue.dist * 0.6) { ficheSeisme(q[1]); return; }
    const m = T.versVecteur(ll.lat, ll.lon, 1.006); S.marque.position.set(m.x, m.y, m.z); S.marque.lookAt(m.x * 2, m.y * 2, m.z * 2); S.marque.visible = true;
    meteo(ll.lat, ll.lon, null); nommer(ll.lat, ll.lon).then(n => { if (n && !$('.tm-fiche').hidden) { const h = $('.tm-fiche h3'); if (h && /°/.test(h.textContent)) h.textContent = n; } });
  }

  /* ───── boucle (pause si caché ou fermé) ───── */
  let raf = 0, dernier = 0;
  function boucle() {
    cancelAnimationFrame(raf); if (S.ferme || !S.pret) return;
    const tick = t => {
      if (S.ferme) return; raf = requestAnimationFrame(tick); if (document.hidden) { dernier = t; return; }
      const dt = Math.min(0.05, (t - (dernier || t)) / 1000); dernier = t;
      if (S.vol) { const k = Math.min(1, (t - S.vol.t0) / S.vol.d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; S.vue.lat = S.vol.de.lat + (S.vol.vers.lat - S.vol.de.lat) * e; S.vue.lon = S.vol.de.lon + (S.vol.vers.lon - S.vol.de.lon) * e; S.vue.dist = S.vol.de.dist + (S.vol.vers.dist - S.vol.de.dist) * e; if (k >= 1) S.vol = null; }
      else if (!ptrs.size) { S.vue.lon += S.vit.lon * dt; S.vue.lat = T.limiterLat(S.vue.lat + S.vit.lat * dt); S.vit.lon = T.amortir(S.vit.lon, dt); S.vit.lat = T.amortir(S.vit.lat, dt); if (S.couches.rotation && !S.vit.lon && t > (S.pauseRot || 0)) S.vue.lon += 3.5 * dt; }
      if (S.nuages) { S.nuages.visible = !!S.couches.nuages; S.nuages.rotation.y += 0.004 * dt; }
      if (!S.derniereSoleil || t - S.derniereSoleil > 30000) { S.derniereSoleil = t; orienterSoleil(); }
      placerCamera(); S.gl.rend.render(S.gl.scene, S.gl.cam);
    };
    raf = requestAnimationFrame(tick);
  }

  /* ───── interface ───── */
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.c) { const k = b.dataset.c; S.couches[k] = !S.couches[k]; b.setAttribute('aria-pressed', String(S.couches[k])); if (k === 'nuit' && S.u) S.u.nuitActive.value = S.couches.nuit ? 1 : 0; if (k === 'seismes') { S.couches.seismes ? (S.seismes ? dessinerSeismes() : chargerSeismes()) : dessinerSeismes(); } if (k === 'rotation') S.vit.lon = 0; return; }
    if (b.dataset.a === 'reessayer') { demarrer(); return; }
    if (b.dataset.a === 'fiche-fermer') { $('.tm-fiche').hidden = true; S.marque && (S.marque.visible = false); return; }
    if (b.dataset.a === 'actus') actualites();
  });
  $('.tm-recherche').addEventListener('submit', e => { e.preventDefault(); chercher($('.tm-recherche input').value); });
  const surVisibilite = () => { if (!document.hidden) dernier = 0; };
  const surTaille = () => { if (S.gl) redim(); };
  const surPerte = e => { e.preventDefault(); S.pret = false; cancelAnimationFrame(raf); echec(new Error('le contexte graphique a été perdu (mémoire)'), 'Affichage interrompu'); };
  document.addEventListener('visibilitychange', surVisibilite); window.addEventListener('resize', surTaille); $('.tm-toile').addEventListener('webglcontextlost', surPerte);

  function fermer() {
    if (S.ferme) return; S.ferme = true; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', surVisibilite); window.removeEventListener('resize', surTaille);
    try { if (S.groupeSeismes) for (const m of [...S.groupeSeismes.children]) { jeter(m.geometry); jeter(m.material); } if (S.gl) { S.gl.jetables.forEach(jeter); Object.values(S.tex || {}).forEach(t => t && jeter(t)); S.gl.rend.dispose(); try { S.gl.rend.forceContextLoss(); } catch (e) { /* */ } } } catch (e) { console.warn('[terre mobile] libération :', e); }
    el.remove(); instance = null; try { onFermer(); } catch (e) { /* */ }
  }
  instance = { fermer, volerVers, chercher, meteo, etat: () => ({ actif: !S.ferme, pret: S.pret, haute: S.haute, erreur: S.erreur, couches: { ...S.couches }, seismes: (S.seismes || []).length, vue: { ...S.vue }, resolution: S.res || null, jetables: S.gl ? S.gl.jetables.length : 0 }) };
  demarrer();
  return instance;
}
export function fermer() { if (instance) instance.fermer(); }
