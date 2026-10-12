/* ═════════════ PAGE « MONDE » : la Terre interactive, les zones chaudes, les fiches pays, la carte économique TradingView ═════════════
   - Vue Terre : le globe réaliste du fond (ui/fond-globe.js, mode interactif) — rotation au doigt ou à la souris, zoom (molette, pincement),
     clic sur un pays → zoom fluide puis fiche. Couches : places boursières (ouvert/fermé, arcs), actualités (points qui pulsent, zones chaudes),
     calendrier économique (prochaines annonces), indicateur coloré (inflation, croissance, chômage, taux directeur, PIB).
   - Vue Carte TradingView : widget « Economic Map » (Web Component) + actualités TradingView (Top Stories).
   - Données : Worker /monde (zones, indicateur, pays) et /calendar ; contours des pays : js/vendor/world-110m.json (Natural Earth).
   - Raylé : service du bus 'monde:commande' ; ce qui est affiché part dans le pont du terminal (contexte de l'IA).
   - Éco : la vue Terre est désactivée (carte TradingView seule). */
import { appelWorker, esc, nombre } from './hud.js?v=2026.10.12.2';

const UI = window.RayleUI || {};
const REGIONS = {
  monde: { nom: 'le monde', lat: 20, lon: 10, dist: 3.4, tv: 'global' },
  europe: { nom: "l'Europe", lat: 50, lon: 12, dist: 2.1, tv: 'europe' },
  asie: { nom: "l'Asie", lat: 32, lon: 100, dist: 2.4, tv: 'asia' },
  moyenorient: { nom: 'le Moyen-Orient', lat: 28, lon: 47, dist: 1.9, tv: 'asia' },
  afrique: { nom: "l'Afrique", lat: 4, lon: 20, dist: 2.4, tv: 'africa' },
  ameriquenord: { nom: "l'Amérique du Nord", lat: 42, lon: -100, dist: 2.3, tv: 'north-america' },
  ameriquesud: { nom: "l'Amérique du Sud", lat: -18, lon: -60, dist: 2.3, tv: 'south-america' },
  oceanie: { nom: "l'Océanie", lat: -25, lon: 140, dist: 2.3, tv: 'oceania' }
};
const INDICS = { inflation: ['Inflation', 'iryy'], croissance: ['Croissance du PIB', 'gdp'], chomage: ['Chômage', 'ur'], taux: ['Taux directeur', 'intr'], pib: ['PIB', 'gdp'] };
const CENTRES = { US: [39, -98], RU: [60, 95], CA: [57, -100], FR: [46.6, 2.5], NO: [62, 10], CN: [35, 104], AU: [-25, 134], BR: [-10, -52], ID: [-2, 118], JP: [36.5, 138.5], GB: [53.5, -1.8], IN: [22, 79], NZ: [-41.5, 173], DK: [56, 10], GR: [39.3, 22], IT: [42.8, 12.5], ES: [40.2, -3.6], CL: [-33, -71], AR: [-35, -64], MY: [3.5, 102] };
const DEVISE_PAYS = { USD: 'US', EUR: 'DE', GBP: 'GB', JPY: 'JP', CNY: 'CN', AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH' };
const sansAnim = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const palier = () => { try { return UI.reglages().palier; } catch (e) { return 1; } };

export function creerPageMonde({ racine }) {
  racine.innerHTML =
    '<div class="pw-tete"><h2>MONDE <span class="px" id="pwInfo">—</span></h2>'
    + '<div class="pw-vues" role="group" aria-label="Vue"><button type="button" data-v="terre" class="actif">Terre</button><button type="button" data-v="tv">Carte TradingView</button></div>'
    + '<div class="pw-couches" role="group" aria-label="Couches">'
    + '<label><input type="checkbox" data-c="places" checked> Places boursières</label>'
    + '<label><input type="checkbox" data-c="actus" checked> Actualités</label>'
    + '<label><input type="checkbox" data-c="calendrier" checked> Calendrier</label>'
    + '<select id="pwIndic" aria-label="Indicateur sur la carte"><option value="">Indicateur : aucun</option>'
    + Object.entries(INDICS).map(([k, v]) => '<option value="' + k + '">' + v[0] + '</option>').join('') + '</select></div></div>'
    + '<div class="pw-corps">'
    + '<div class="pw-scene" id="pwScene"><div class="pw-etiquettes" id="pwEtiq"></div><div class="pw-bulle" id="pwBulle" hidden></div>'
    + '<div class="pw-legende" id="pwLegende" hidden></div><div class="pw-etat" id="pwEtat">Chargement de la Terre…</div>'
    + '<div class="pw-zones" id="pwZones"></div></div>'
    + '<aside class="pw-fiche hud-cadre" id="pwFiche" hidden></aside>'
    + '<div class="pw-tv" id="pwTv" hidden><div class="pw-tv-carte" id="pwTvCarte"></div><div class="pw-tv-actus" id="pwTvActus"></div></div>'
    + '</div>';
  const $ = s => racine.querySelector(s);
  const scene = $('#pwScene'), etiq = $('#pwEtiq'), bulle = $('#pwBulle'), legende = $('#pwLegende'), etat = $('#pwEtat'), fiche = $('#pwFiche'), tv = $('#pwTv'), info = $('#pwInfo'), zonesEl = $('#pwZones');
  const C = { places: true, actus: true, calendrier: true };
  let vue = 'terre', ouverte = false, globe = null, chargement = null, canvas = null, raf = 0, tPrec = 0, dernier = 0;
  let pays = null, parA2 = new Map(), zones = [], evenements = [], indic = '', valeursIndic = null, choisi = null, ficheDonnees = null;
  let cible = { lat: 20, lon: 10, dist: 3.4 }, actuel = { lat: 20, lon: 10, dist: 3.4 }, inactifDepuis = performance.now();
  let calque = null, ptsZones = null, ptsCal = null, tvPret = false, tvRegion = 'global', tvMetric = 'iryy';

  /* ───── contours des pays (une fois) ───── */
  async function chargerGeo() {
    if (pays) return;
    if (!window.topojson) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = new URL('js/vendor/topojson-client.min.js', document.baseURI).href; s.onload = ok; s.onerror = () => ko(new Error('topojson indisponible')); document.head.appendChild(s); });
    const topo = await (await fetch(new URL('js/vendor/world-110m.json', document.baseURI).href)).json();
    const table = new Map((window.RaylePays || []).map(l => [l[0], l]));
    pays = topojson.feature(topo, topo.objects.countries).features.map(f => {
      const t = table.get(f.id); if (!t) return null;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let x0 = 180, x1 = -180, y0 = 90, y1 = -90, meilleur = null, aire = 0;
      for (const p of polys) {
        const r = p[0]; let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < r.length - 1; i++) { const [xa, ya] = r[i], [xb, yb] = r[i + 1], k = xa * yb - xb * ya; a += k; cx += (xa + xb) * k; cy += (ya + yb) * k; }
        for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (Math.abs(a) > aire && Math.abs(a) > 1e-9) { aire = Math.abs(a); meilleur = [cy / (3 * a), cx / (3 * a)]; }
      }
      const c = CENTRES[t[1]] || meilleur || [(y0 + y1) / 2, (x0 + x1) / 2];
      return { num: f.id, a2: t[1], a3: t[2], nom: t[3], polys, bbox: [x0, y0, x1, y1], c, etendue: Math.sqrt(aire) };
    }).filter(Boolean);
    parA2 = new Map(pays.map(p => [p.a2, p]));
    parA2.set('EU', { a2: 'EU', a3: 'EMU', nom: 'Zone euro', c: [50.8, 4.4], polys: [], bbox: [0, 0, 0, 0], etendue: 12 });
  }
  const dansAnneau = (x, y, r) => { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; };
  function paysEn(lat, lon) {
    for (const p of pays) {
      const [x0, y0, x1, y1] = p.bbox; if (lat < y0 || lat > y1 || lon < x0 || lon > x1) continue;
      for (const poly of p.polys) if (dansAnneau(lon, lat, poly[0]) && !poly.slice(1).some(h => dansAnneau(lon, lat, h))) return p;
    }
    return null;
  }

  /* ───── calque équirectangulaire : contours, pays choisi, indicateur coloré ───── */
  const couleurs = () => { try { return UI.couleurs(); } catch (e) { return [[255, 79, 216], [155, 92, 255], [255, 158, 240], [106, 60, 255]]; } };
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  let seuils = [];
  function couleurValeur(v) {
    if (v == null) return null;
    let i = 0; while (i < seuils.length && v > seuils[i]) i++;
    const k = i / Math.max(1, seuils.length), c = couleurs();
    return k < .5 ? mix(c[3], c[1], k * 2) : mix(c[1], mix(c[0], [255, 255, 255], .25), (k - .5) * 2);
  }
  function valeurDe(p) { if (!valeursIndic) return null; const x = valeursIndic.valeurs[valeursIndic.cle === 'a2' ? p.a2 : p.a3]; return x ? x.v : null; }
  function dessinerCalque() {
    if (!globe) return;
    const W = palier() === 0 ? 4096 : 2048, H = W / 2;
    if (!calque || calque.width !== W) { calque = document.createElement('canvas'); calque.width = W; calque.height = H; }
    const g = calque.getContext('2d'), c = couleurs();
    g.clearRect(0, 0, W, H); g.lineJoin = 'round';
    const X = l => (l + 180) / 360 * W, Y = l => (90 - l) / 180 * H;
    const tracer = (p, dec) => {
      g.beginPath();
      for (const poly of p.polys) for (const r of poly) {
        let prev = r[0][0];
        r.forEach(([lon, lat], i) => { let l = lon; while (l - prev > 180) l -= 360; while (l - prev < -180) l += 360; prev = l; const x = X(l + dec), y = Y(lat); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.closePath();
      }
    };
    for (const p of pays) for (const dec of [0, -360, 360]) {
      if (dec && !(p.bbox[2] - p.bbox[0] > 300 || (dec < 0 && p.bbox[2] > 170) || (dec > 0 && p.bbox[0] < -170))) continue;
      tracer(p, dec);
      const v = indic ? couleurValeur(valeurDe(p)) : null;
      if (v) { g.fillStyle = rgba(v, .62); g.fill('evenodd'); }
      if (choisi && p.a2 === choisi.a2) { g.fillStyle = rgba(c[0], .22); g.fill('evenodd'); g.strokeStyle = rgba(c[0], .95); g.lineWidth = W / 1024 * 2.4; g.stroke(); }
      else { g.strokeStyle = rgba(c[1], .42); g.lineWidth = W / 1024 * 1.1; g.stroke(); }
    }
    globe.calque(calque);
  }
  function majLegende() {
    if (!indic || !valeursIndic) { legende.hidden = true; return; }
    const c = couleurs(), u = valeursIndic.unite === 'USD' ? '' : ' ' + valeursIndic.unite;
    const fmt = v => valeursIndic.unite === 'USD' ? (v >= 1e12 ? nombre(v / 1e12, 1) + ' k Md $' : nombre(v / 1e9, 0) + ' Md $') : nombre(v, 1) + u;
    legende.innerHTML = '<b>' + esc(valeursIndic.nom) + '</b><span class="pw-degrade" style="background:linear-gradient(90deg,' + rgba(c[3], 1) + ',' + rgba(c[1], 1) + ',' + rgba(mix(c[0], [255, 255, 255], .25), 1) + ')"></span>'
      + '<span class="pw-bornes"><i>' + esc(fmt(seuils[0])) + '</i><i>' + esc(fmt(seuils[seuils.length - 1])) + '</i></span><small>' + esc(valeursIndic.source) + '</small>';
    legende.hidden = false;
  }
  async function choisirIndicateur(id) {
    indic = INDICS[id] ? id : '';
    $('#pwIndic').value = indic;
    tvMetric = indic ? INDICS[indic][1] : tvMetric; if (tvPret) majTv();
    if (!indic) { valeursIndic = null; dessinerCalque(); majLegende(); ecrirePont(); return; }
    try {
      valeursIndic = await appelWorker('/monde?type=indicateur&id=' + indic, {}, 25000);
      const vs = pays.map(valeurDe).filter(v => v != null).sort((a, b) => a - b);
      seuils = [.1, .25, .4, .55, .7, .85, .95].map(q => vs[Math.floor(q * (vs.length - 1))]);
    } catch (e) { valeursIndic = null; etat.textContent = 'Indicateur indisponible : ' + e.message; etat.hidden = false; }
    dessinerCalque(); majLegende(); ecrirePont();
  }

  /* ───── marqueurs : zones chaudes (pulsent) et annonces du calendrier ───── */
  const VS_PTS = `attribute float a_taille; attribute float a_chaleur; uniform float u_t,u_px; varying float v_k; varying float v_ch;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float p=0.5+0.5*sin(u_t*(2.0+4.0*a_chaleur)+a_taille*7.0);
 v_k=0.55+0.45*p*a_chaleur; v_ch=a_chaleur; gl_PointSize=u_px*a_taille*(1.0+0.35*p*a_chaleur)*(3.0/-mv.z); gl_Position=projectionMatrix*mv; }`;
  const FS_PTS = `uniform vec3 u_c,u_c2; varying float v_k; varying float v_ch;
void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.0,d); float coeur=smoothstep(0.18,0.0,d);
 vec3 c=mix(u_c,u_c2,v_ch); gl_FragColor=vec4((c*a+vec3(1.0)*coeur*0.6)*v_k,a*v_k); }`;
  function nuage(liste, uC) {
    const T = globe.THREE, g = new T.BufferGeometry(), pos = [], ta = [], ch = [];
    for (const x of liste) { const v = globe.vec(x.lat, x.lon, 1.012); pos.push(v.x, v.y, v.z); ta.push(x.taille); ch.push(x.chaleur); }
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('a_taille', new T.Float32BufferAttribute(ta, 1)); g.setAttribute('a_chaleur', new T.Float32BufferAttribute(ch, 1));
    const m = new T.ShaderMaterial({ uniforms: Object.assign({ u_t: { value: 0 }, u_px: { value: 26 } }, uC), vertexShader: VS_PTS, fragmentShader: FS_PTS, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    const p = new T.Points(g, m); globe.ajouter(p); return p;
  }
  const uZones = {}, uCal = {};
  function majMarqueurs() {
    if (!globe) return;
    const T = globe.THREE;
    [ptsZones, ptsCal].forEach(p => { if (p) { p.parent.remove(p); p.geometry.dispose(); p.material.dispose(); } });
    if (!uZones.u_c) { uZones.u_c = { value: new T.Color() }; uZones.u_c2 = { value: new T.Color() }; uCal.u_c = { value: new T.Color() }; uCal.u_c2 = { value: new T.Color() }; }
    const lz = zones.map(z => { const p = parA2.get(z.a2); return p ? { lat: p.c[0], lon: p.c[1], taille: .7 + z.chaleur * 1.3, chaleur: z.chaleur } : null; }).filter(Boolean);
    ptsZones = lz.length ? nuage(lz, uZones) : null;
    const parPays = {};
    evenements.forEach(e => { const a2 = DEVISE_PAYS[e.cur]; if (a2) (parPays[a2] = parPays[a2] || []).push(e); });
    const lc = Object.entries(parPays).map(([a2, l]) => { const p = parA2.get(a2 === 'DE' ? 'EU' : a2) || parA2.get(a2); return p ? { lat: p.c[0] - 2.5, lon: p.c[1] + 3, taille: .6 + Math.min(1, l.length / 6) * .6, chaleur: l.some(e => /high/i.test(e.imp)) ? .6 : .2 } : null; }).filter(Boolean);
    ptsCal = lc.length ? nuage(lc, uCal) : null;
    appliquerCouches();
  }
  function appliquerCouches() {
    if (!globe) return;
    globe.places(C.places);
    if (ptsZones) ptsZones.visible = C.actus;
    if (ptsCal) ptsCal.visible = C.calendrier;
    zonesEl.hidden = !C.actus;
  }

  /* ───── étiquettes (DOM) : pays choisi, zones les plus chaudes, prochaines annonces ───── */
  const heure = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  function etiquettes() {
    const l = [];
    if (choisi) l.push({ p: choisi, txt: choisi.nom, cl: 'choisi' });
    if (C.actus) zones.slice(0, 6).forEach(z => { const p = parA2.get(z.a2); if (p && (!choisi || p.a2 !== choisi.a2)) l.push({ p, txt: p.nom + ' · ' + z.score + (z.impact.length ? ' · ' + z.impact.join(', ') : ''), cl: 'zone' + (z.impact.length ? ' impact' : '') }); });
    if (C.calendrier) {
      const vus = new Set();
      evenements.slice(0, 12).forEach(e => { const a2 = DEVISE_PAYS[e.cur]; const p = a2 && (parA2.get(a2 === 'DE' ? 'EU' : a2)); if (p && !vus.has(p.a2) && vus.size < 4) { vus.add(p.a2); l.push({ p, txt: e.cur + ' · ' + heure(e.t) + ' ' + e.titre, cl: 'cal', dec: [-2.5, 3] }); } });
    }
    while (etiq.children.length < l.length) etiq.appendChild(document.createElement('span'));
    [...etiq.children].forEach((el, i) => {
      const x = l[i];
      if (!x) { el.hidden = true; return; }
      const d = x.dec || [0, 0], q = globe.projeter(x.p.c[0] + d[0], x.p.c[1] + d[1]);
      el.hidden = q.face < .12;
      if (el.hidden) return;
      if (el.textContent !== x.txt) el.textContent = x.txt;
      el.className = 'pw-etiq ' + x.cl;
      el.style.transform = 'translate(' + q.x.toFixed(0) + 'px,' + q.y.toFixed(0) + 'px)';
    });
  }
  function majListeZones() {
    zonesEl.innerHTML = zones.length ? '<b>Zones chaudes</b>' + zones.slice(0, 6).map(z => { const p = parA2.get(z.a2); return p ? '<button type="button" data-a2="' + esc(z.a2) + '">' + esc(p.nom) + ' <i>' + z.score + '</i>' + (z.impact.length ? ' <em>' + esc(z.impact.join(' · ')) + '</em>' : '') + '</button>' : ''; }).join('') : '';
  }
  zonesEl.addEventListener('click', e => { const b = e.target.closest('button[data-a2]'); if (b) allerPays(b.dataset.a2, true); });

  /* ───── fiche pays ───── */
  let jetonFiche = 0;
  function rendreFiche(d, p) {
    const m = d.macro || {}, ligne = (k, f) => m[k] ? '<div class="pw-l"><span>' + esc(m[k].nom) + '</span><b>' + f(m[k]) + '</b><small>' + esc(m[k].date || '') + '</small></div>' : '';
    const pct = x => esc(nombre(x.v, Math.round(x.v * 10) === x.v * 10 ? 1 : 2)) + ' %', pib = x => esc(x.v >= 1e12 ? nombre(x.v / 1e12, 2) + ' k Md $' : nombre(x.v / 1e9, 0) + ' Md $');
    const ind = d.indice ? '<div class="pw-indice"><span>' + esc(d.indice.nom) + '</span><b>' + esc(nombre(d.indice.prix, 2)) + '</b>' + (d.indice.variation_pct != null ? '<i class="' + (d.indice.variation_pct >= 0 ? 'up' : 'down') + '">' + (d.indice.variation_pct >= 0 ? '+' : '') + esc(nombre(d.indice.variation_pct, 2)) + ' %</i>' : '') + '</div>' : '';
    const ev = (d.evenements || []).map(e => '<li><b>' + esc(new Date(e.t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) + ' ' + heure(e.t)) + '</b> ' + esc(e.devise) + ' · ' + esc(e.titre) + (/high/i.test(e.imp) ? ' <em>fort</em>' : '') + '</li>').join('');
    const ac = (d.actus || []).slice(0, 5).map(a => '<li>' + (a.lien ? '<a href="' + esc(a.lien) + '" target="_blank" rel="noopener noreferrer">' + esc(a.titre) + '</a>' : esc(a.titre)) + ' <small>' + esc(a.source || '') + '</small></li>').join('');
    fiche.innerHTML = '<header class="pn-tete"><span class="pn-ico">◈</span><h2>' + esc(p.nom) + (d.devise ? ' · ' + esc(d.devise) : '') + '</h2><button type="button" class="pn-x" data-fermer aria-label="Fermer la fiche">✕</button></header>'
      + '<div class="pw-fiche-corps">' + ind
      + (d.resume ? '<p class="pw-resume">' + esc(d.resume) + '</p><button type="button" class="pw-bouton" data-lire>🎙 Raylé le lit</button>' : '')
      + '<h3>Macro</h3>' + (ligne('inflation', pct) + ligne('croissance', pct) + ligne('chomage', pct) + ligne('taux', pct) + ligne('pib', pib) || '<p class="pw-vide">Pas de données.</p>')
      + '<h3>Calendrier (7 jours)</h3>' + (ev ? '<ul>' + ev + '</ul>' : '<p class="pw-vide">Aucune annonce importante prévue.</p>')
      + '<h3>Actualités</h3>' + (ac ? '<ul>' + ac + '</ul>' : '<p class="pw-vide">Rien de récent.</p>')
      + '<small class="pw-src">Banque mondiale (annuel), BIS, Yahoo, Forex Factory, Google Actualités</small></div>';
  }
  fiche.addEventListener('click', e => {
    if (e.target.closest('[data-fermer]')) { fermerFiche(); return; }
    if (e.target.closest('[data-lire]') && ficheDonnees && ficheDonnees.resume) RayleBus.demander('rayle:dire', ficheDonnees.resume);
  });
  function fermerFiche() { fiche.hidden = true; choisi = null; ficheDonnees = null; dessinerCalque(); ecrirePont(); }
  async function ouvrirFiche(p) {
    const j = ++jetonFiche;
    choisi = p; ficheDonnees = null; dessinerCalque();
    fiche.hidden = false; fiche.classList.remove('hud-in'); void fiche.offsetWidth; fiche.classList.add('hud-in');
    fiche.innerHTML = '<header class="pn-tete"><span class="pn-ico">◈</span><h2>' + esc(p.nom) + '</h2><button type="button" class="pn-x" data-fermer aria-label="Fermer la fiche">✕</button></header><div class="pw-fiche-corps"><p class="loading">Raylé rassemble les données…</p></div>';
    ecrirePont();
    try {
      const d = await appelWorker('/monde?type=pays&a2=' + p.a2 + '&a3=' + p.a3 + '&nom=' + encodeURIComponent(p.nom), {}, 30000);
      if (j !== jetonFiche) return null;
      ficheDonnees = d; rendreFiche(d, p); ecrirePont();
      return d;
    } catch (e) {
      if (j === jetonFiche) fiche.querySelector('.pw-fiche-corps').innerHTML = '<p class="pw-vide">Fiche indisponible : ' + esc(e.message) + '</p>';
      return null;
    }
  }

  /* ───── navigation : pays, régions ───── */
  function viser(lat, lon, dist) { cible = { lat, lon, dist }; inactifDepuis = performance.now(); if (sansAnim()) actuel = Object.assign({}, cible); }
  function allerPays(a2, avecFiche) {
    const p = parA2.get(a2); if (!p) return null;
    if (vue !== 'terre' && palier() < 2) changerVue('terre');
    const dist = Math.max(1.55, Math.min(2.6, 1.45 + p.etendue / 40));
    viser(p.c[0], p.c[1], dist);
    return avecFiche ? ouvrirFiche(p) : (choisi = p, dessinerCalque(), ecrirePont(), null);
  }
  function allerRegion(id) {
    const r = REGIONS[id]; if (!r) return false;
    tvRegion = r.tv; if (tvPret) majTv();
    if (vue === 'terre') viser(r.lat, r.lon, r.dist);
    ecrirePont(); return true;
  }

  /* ───── la Terre (three.js, partagé avec le fond) ───── */
  async function preparerGlobe() {
    if (globe) return Promise.resolve();
    if (chargement) return chargement;
    chargement = (async () => {
      etat.hidden = false; etat.textContent = 'Chargement de la Terre…';
      await chargerGeo();
      canvas = document.createElement('canvas'); canvas.className = 'pw-canvas'; scene.prepend(canvas);
      const q = palier() === 0 ? 0 : 1;
      globe = await UI.fondsReels.globe(canvas, { q, hd: (UI.reglages && UI.reglages().anim) === 'max', interactif: true });
      globe.taille(); globe.vue(actuel.lat, actuel.lon, actuel.dist);
      brancherGestes(); dessinerCalque(); majMarqueurs();
      etat.hidden = true;
    })().catch(e => { etat.hidden = false; etat.textContent = 'Terre indisponible (' + e.message + ') : utilise la carte TradingView.'; globe = null; })
      .finally(() => { chargement = null; });
    return chargement;
  }
  function boucle(now) {
    raf = requestAnimationFrame(boucle);
    if (!ouverte || !globe || vue !== 'terre' || document.hidden) { tPrec = 0; return; }
    if (now - dernier < 1000 / (palier() === 0 ? 40 : 28) - 2) return;
    dernier = now;
    const dt = tPrec ? Math.min(.1, (now - tPrec) / 1000) : 0; tPrec = now;
    if (!glisse && !choisi && now - inactifDepuis > 20000) cible.lon += dt * 2.5;      // au repos : la Terre tourne doucement
    const k = 1 - Math.exp(-dt * 3.2);
    let dl = ((cible.lon - actuel.lon + 540) % 360) - 180;
    actuel.lon += dl * k; actuel.lat += (cible.lat - actuel.lat) * k; actuel.dist += (cible.dist - actuel.dist) * k;
    globe.vue(actuel.lat, actuel.lon, actuel.dist);
    const c = couleurs();
    if (uZones.u_c) { uZones.u_c.value.setRGB(c[0][0] / 255, c[0][1] / 255, c[0][2] / 255); uZones.u_c2.value.setRGB(1, .82, .45); uCal.u_c.value.setRGB(c[2][0] / 255, c[2][1] / 255, c[2][2] / 255); uCal.u_c2.value.setRGB(1, 1, 1); }
    [ptsZones, ptsCal].forEach(p => { if (p) p.material.uniforms.u_t.value = now / 1000; });
    globe.image(now, dt);
    etiquettes();
  }
  // gestes : glisser pour tourner, molette / pincement pour zoomer, toucher / clic pour choisir un pays
  let glisse = false;
  function brancherGestes() {
    const pointeurs = new Map(); let depart = null, ecart0 = 0, dist0 = 3.4, bouge = 0;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointeurs.set(e.pointerId, [e.clientX, e.clientY]); depart = [e.clientX, e.clientY]; bouge = 0; glisse = true; inactifDepuis = performance.now();
      if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; ecart0 = Math.hypot(a[0] - b[0], a[1] - b[1]); dist0 = cible.dist; } });
    canvas.addEventListener('pointermove', e => {
      if (!pointeurs.has(e.pointerId)) { survol(e); return; }
      const avant = pointeurs.get(e.pointerId); pointeurs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; const ecart = Math.hypot(a[0] - b[0], a[1] - b[1]); if (ecart0) cible.dist = Math.max(1.35, Math.min(5, dist0 * ecart0 / ecart)); bouge = 99; return; }
      const dx = e.clientX - avant[0], dy = e.clientY - avant[1]; bouge += Math.abs(dx) + Math.abs(dy);
      const f = .22 * actuel.dist / 3.4;
      cible.lon -= dx * f; cible.lat = Math.max(-80, Math.min(80, cible.lat + dy * f));
      if (sansAnim()) actuel = Object.assign({}, cible);
    });
    const fin = e => {
      const etaitClic = pointeurs.size === 1 && bouge < 6;
      pointeurs.delete(e.pointerId); if (!pointeurs.size) glisse = false;
      if (etaitClic && e.type === 'pointerup') { const r = canvas.getBoundingClientRect(), g = globe.pick(e.clientX - r.left, e.clientY - r.top); const p = g && paysEn(g.lat, g.lon); if (p) allerPays(p.a2, true); }
    };
    canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
    canvas.addEventListener('wheel', e => { e.preventDefault(); cible.dist = Math.max(1.35, Math.min(5, cible.dist * (1 + Math.sign(e.deltaY) * .12))); inactifDepuis = performance.now(); }, { passive: false });
    canvas.addEventListener('pointerleave', () => { bulle.hidden = true; });
  }
  let survolT = 0;
  function survol(e) {
    if (e.pointerType !== 'mouse' || performance.now() - survolT < 80) return; survolT = performance.now();
    const r = canvas.getBoundingClientRect(), g = globe.pick(e.clientX - r.left, e.clientY - r.top), p = g && paysEn(g.lat, g.lon);
    if (!p) { bulle.hidden = true; canvas.style.cursor = 'grab'; return; }
    const v = valeurDe(p), z = zones.find(x => x.a2 === p.a2);
    bulle.textContent = p.nom + (v != null ? ' · ' + valeursIndic.nom + ' ' + nombre(v, valeursIndic.unite === 'USD' ? 0 : 1) + (valeursIndic.unite === 'USD' ? ' $' : ' ' + valeursIndic.unite) : '') + (z ? ' · ' + z.score + ' actus' : '');
    bulle.style.transform = 'translate(' + (e.clientX - r.left + 14) + 'px,' + (e.clientY - r.top + 12) + 'px)'; bulle.hidden = false; canvas.style.cursor = 'pointer';
  }
  window.addEventListener('resize', () => { if (globe && ouverte) globe.taille(); });

  /* ───── carte TradingView (Web Component « Economic Map ») + actualités TradingView ───── */
  function majTv() {
    const el = tv.querySelector('tv-economic-map'); if (!el) return;
    el.setAttribute('metric', tvMetric); el.setAttribute('region', tvRegion);
    try { el.metric = tvMetric; el.region = tvRegion; } catch (e) {}
  }
  function preparerTv() {
    if (tvPret) return; tvPret = true;
    // Web Component « Economic Map » (TradingView) : chargé une fois, par import() (fiable dans le terminal)
    import('https://widgets.tradingview-widget.com/w/fr/tv-economic-map.js').then(() => majTv()).catch(e => { tv.querySelector('#pwTvCarte').innerHTML = '<p class="pw-vide" style="padding:12px">Carte TradingView indisponible : ' + esc(e.message) + '</p>'; });
    const carte = document.createElement('tv-economic-map'); carte.setAttribute('theme', 'dark'); tv.querySelector('#pwTvCarte').appendChild(carte); majTv();
    const w = document.createElement('div'); w.className = 'tradingview-widget-container'; w.style.height = '100%';
    const i = document.createElement('div'); i.className = 'tradingview-widget-container__widget'; i.style.height = '100%'; w.appendChild(i);
    const s = document.createElement('script'); s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js'; s.async = true;
    s.innerHTML = JSON.stringify({ feedMode: 'all_symbols', isTransparent: true, displayMode: 'regular', width: '100%', height: '100%', colorTheme: 'dark', locale: 'fr' });
    w.appendChild(s); tv.querySelector('#pwTvActus').appendChild(w);
  }
  function changerVue(v) {
    if (v === 'terre' && palier() >= 2) v = 'tv';
    vue = v;
    racine.querySelectorAll('.pw-vues button').forEach(b => b.classList.toggle('actif', b.dataset.v === v));
    scene.hidden = v !== 'terre'; tv.hidden = v !== 'tv';
    if (v !== 'terre') fiche.hidden = true;
    racine.querySelector('.pw-couches').classList.toggle('pw-inactif', v !== 'terre');
    if (v === 'tv') preparerTv(); else preparerGlobe().then(() => { if (globe) globe.taille(); });
    ecrirePont();
  }
  racine.querySelectorAll('.pw-vues button').forEach(b => { b.onclick = () => changerVue(b.dataset.v); });
  racine.querySelectorAll('.pw-couches input').forEach(c => { c.onchange = () => { C[c.dataset.c] = c.checked; appliquerCouches(); ecrirePont(); }; });
  $('#pwIndic').onchange = e => choisirIndicateur(e.target.value);

  /* ───── données : zones chaudes (30 min) et annonces (calendrier) ───── */
  let minuteur = 0;
  async function chargerDonnees() {
    try {
      const d = await appelWorker('/monde?type=zones', {}, 30000);
      zones = (d.zones || []).filter(z => parA2.has(z.a2));
      info.textContent = d.nbTitres + ' titres analysés · ' + new Date(d.maj).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { info.textContent = 'actualités indisponibles'; }
    try {
      const cal = await appelWorker('/calendar', {}, 20000), maintenant = Date.now();
      evenements = (Array.isArray(cal) ? cal : []).map(e => ({ t: Date.parse(e.date), cur: String(e.country || '').toUpperCase(), titre: String(e.title || ''), imp: String(e.impact || '') }))
        .filter(e => isFinite(e.t) && e.t > maintenant && e.t < maintenant + 48 * 36e5 && /^(High|Medium)$/i.test(e.imp)).sort((a, b) => a.t - b.t);
    } catch (e) { evenements = []; }
    majListeZones(); majMarqueurs(); ecrirePont();
  }

  /* ───── pont : ce que Raylé sait de la page ───── */
  function ecrirePont() {
    const m = { vue: vue === 'terre' ? 'Terre (globe interactif)' : 'carte économique TradingView (' + tvMetric + ', ' + tvRegion + ')',
      couches: Object.keys(C).filter(k => C[k]).join(', '), indicateur: indic ? INDICS[indic][0] : '',
      zones: zones.slice(0, 6).map(z => { const p = parA2.get(z.a2); return (p ? p.nom : z.a2) + ' (' + z.score + ' titres' + (z.impact.length ? ', impact ' + z.impact.join(' et ') : '') + ')'; }) };
    if (choisi) {
      m.pays = choisi.nom;
      if (ficheDonnees) {
        const d = ficheDonnees, x = d.macro || {};
        m.fiche = [d.indice ? d.indice.nom + ' ' + d.indice.prix + (d.indice.variation_pct != null ? ' (' + d.indice.variation_pct + ' %)' : '') : '',
          ...['inflation', 'croissance', 'chomage', 'taux'].filter(k => x[k]).map(k => x[k].nom + ' ' + x[k].v + ' % (' + x[k].date + ')'),
          (d.evenements || []).slice(0, 3).map(e => e.devise + ' ' + e.titre).join(' ; '), d.resume ? 'résumé : ' + d.resume : ''].filter(Boolean).join(' · ');
      }
    }
    try { RayleBus.fusion('terminal', { monde: m }); } catch (e) {}
  }

  /* ───── commandes de Raylé ───── */
  function commande(c) {
    if (!c) return null;
    if (c.action === 'vue') { changerVue(c.valeur === 'tv' ? 'tv' : 'terre'); return { ok: true, vue }; }
    if (c.action === 'region') return { ok: allerRegion(c.id), nom: (REGIONS[c.id] || {}).nom };
    if (c.action === 'indicateur') { if (!INDICS[c.valeur]) return { ok: false }; choisirIndicateur(c.valeur); return { ok: true, nom: INDICS[c.valeur][0] }; }
    if (c.action === 'couche') { if (!(c.nom in C)) return { ok: false }; C[c.nom] = !!c.oui; const i = racine.querySelector('input[data-c="' + c.nom + '"]'); if (i) i.checked = C[c.nom]; appliquerCouches(); ecrirePont(); return { ok: true }; }
    if (c.action === 'pays') {
      const go = () => allerPays(c.a2, !!c.fiche);
      return { ok: true, fiche: (pays ? Promise.resolve() : chargerGeo()).then(go) };
    }
    return null;
  }
  RayleBus.fournir('monde:commande', commande);

  /* ───── ouverture / fermeture de la page ───── */
  function ouvrir() {
    ouverte = true;
    if (palier() >= 2) { changerVue('tv'); racine.querySelector('.pw-vues button[data-v="terre"]').title = 'Vue Terre désactivée en mode Éco'; }
    else changerVue(vue);
    chargerGeo().then(chargerDonnees).catch(() => {});
    clearInterval(minuteur); minuteur = setInterval(chargerDonnees, 30 * 60000);
    if (!raf) raf = requestAnimationFrame(boucle);
  }
  function fermer() {
    ouverte = false; clearInterval(minuteur);
    // la Terre libère la carte graphique quand on quitte la page (le fond d'écran reprend la sienne)
    if (globe) { try { globe.detruire(); } catch (e) {} globe = null; ptsZones = ptsCal = null; if (canvas) canvas.remove(); canvas = null; }
    try { RayleBus.fusion('terminal', { monde: null }); } catch (e) {}
  }
  return { ouvrir, fermer, commande, regions: REGIONS };
}
