// Géographie de la Terre : frontières, zone surlignée, recherche du pays sous un point, étiquettes (pays, villes, océans, mers) qui apparaissent selon le zoom.
// Données : contours world-atlas 1:110m (js/vendor/world-110m.json, ISC) en local ; 1:50m (plus fin, ≈ 0,75 Mo) chargé à la demande depuis jsDelivr quand on s'approche.
// creerGeo(ctx, terre) → { pret, bordures(), pays(lat, lon), paysParNum(num), surlignerPays(num), surlignerZone(zone), effacerSurbrillance(), etiquettes(), maj(camera), centre(nom), … }
import { OCEANS_MERS } from '../donnees/mers.js?v=2026.10.15.6';

const RAD = Math.PI / 180;
const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function chargerScript(url) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => ko(new Error('script ' + url)); document.head.appendChild(s); });
}

export async function creerGeo(ctx, G) {
  const { THREE, noyau, q } = ctx;
  const base = new URL('../../../', import.meta.url).href;
  if (!window.topojson) await chargerScript(base + 'js/vendor/topojson-client.min.js');
  const topo110 = await (await fetch(base + 'js/vendor/world-110m.json')).json();
  let topo = topo110, features = window.topojson.feature(topo, topo.objects.countries).features, finesse = 110;
  const PAYS = window.RaylePays || [], parNum = new Map(PAYS.map(p => [p[0], { num: p[0], a2: p[1], a3: p[2], nom: p[3] }]));
  const CENTRES = (window.RayleUI && window.RayleUI.espacePaysCentres) || [];
  const centres = new Map(CENTRES.map(c => [String(c[0]).padStart(3, '0'), { lat: c[1], lon: c[2], etendue: c[3] }]));
  const bbox = new Map();
  function indexer() {
    bbox.clear();
    for (const f of features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      bbox.set(f, [x0, y0, x1, y1]);
    }
  }
  indexer();
  const numDe = f => String(f.id).padStart(3, '0');

  /* ───── frontières : lignes 3D épaisses de quelques pixels (restent nettes jusqu'au plus fort zoom) ───── */
  const [{ LineSegments2 }, { LineSegmentsGeometry }, { LineMaterial }] = await Promise.all([import('three/addons/lines/LineSegments2.js'), import('three/addons/lines/LineSegmentsGeometry.js'), import('three/addons/lines/LineMaterial.js')]);
  const matLigne = new LineMaterial({ color: 0xffdf9a, linewidth: 1.2, transparent: true, opacity: .9, depthWrite: false, worldUnits: false });
  let lignes = null;
  const R_BORD = 1.0009;
  function construireBordures() {
    const maille = window.topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const pos = [], P = (lo, la) => { const a = la * RAD, b = lo * RAD; return [R_BORD * Math.cos(a) * Math.cos(b), R_BORD * Math.sin(a), -R_BORD * Math.cos(a) * Math.sin(b)]; };
    for (const ligne of maille.coordinates) for (let i = 0; i < ligne.length - 1; i++) {
      const [x0, y0] = ligne[i], [x1, y1] = ligne[i + 1]; if (Math.abs(x1 - x0) > 180) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (finesse === 50 ? 1.5 : 2.5)));
      for (let k = 0; k < n; k++) { pos.push(...P(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n), ...P(x0 + (x1 - x0) * (k + 1) / n, y0 + (y1 - y0) * (k + 1) / n)); }
    }
    const geom = new LineSegmentsGeometry(); geom.setPositions(pos);
    if (lignes) { G.terre.remove(lignes); lignes.geometry.dispose(); }
    lignes = new LineSegments2(geom, matLigne); lignes.renderOrder = 3; lignes.frustumCulled = false; G.terre.add(lignes);
  }
  construireBordures();
  function resolution(w, h) { const d = ctx.renderer.getPixelRatio(); matLigne.resolution.set(w * d, h * d); matLigne.linewidth = (finesse === 50 ? 1.25 : 1.5) * d; }
  let chargement50 = null;
  async function affiner() {                                          // 50m à la demande
    if (finesse === 50 || chargement50 || q.bordsPays === 'proches') return;
    chargement50 = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(r => r.json()).then(t => { topo = t; features = window.topojson.feature(topo, topo.objects.countries).features; finesse = 50; indexer(); construireBordures(); }).catch(e => { console.warn('[geo] 50m indisponible', e && e.message); });
  }

  /* ───── recherche du pays sous un point ───── */
  function dansAnneau(x, y, ring) { let dedans = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dedans = !dedans; } return dedans; }
  function pays(lat, lon) {
    for (const f of features) {
      const b = bbox.get(f); if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polys) if (dansAnneau(lon, lat, p[0]) && !p.slice(1).some(h => dansAnneau(lon, lat, h))) return paysParNum(numDe(f));
    }
    return null;
  }
  function paysParNum(num) {
    num = String(num).padStart(3, '0'); const p = parNum.get(num), c = centres.get(num); const f = features.find(x => numDe(x) === num);
    if (!p && !f) return null;
    return Object.assign({ num, nom: (f && f.properties && f.properties.name) || num }, p || {}, c || {});
  }
  function trouverPaysParNom(nom) {
    const n = norm(nom).replace(/^(?:le|la|les|l|l ) /, '').trim();
    let best = null;
    for (const p of PAYS) { const nn = norm(p[3]); if (nn === n || norm(p[1]) === n || norm(p[2]) === n) return paysParNum(p[0]); if (!best && n.length > 3 && (nn.startsWith(n + ' ') || nn.endsWith(' ' + n))) best = p; }
    return best ? paysParNum(best[0]) : null;
  }
  // alias courants (noms d'usage) qui diffèrent de la table ISO
  const ALIAS = { 'etats unis': 'US', 'usa': 'US', 'amerique': 'US', 'royaume uni': 'GB', 'angleterre': 'GB', 'grande bretagne': 'GB', 'russie': 'RU', 'coree du sud': 'KR', 'coree du nord': 'KP', 'republique tcheque': 'CZ', 'tchequie': 'CZ', 'birmanie': 'MM', 'myanmar': 'MM', 'cote d ivoire': 'CI', 'vietnam': 'VN', 'iran': 'IR', 'syrie': 'SY', 'bolivie': 'BO', 'venezuela': 'VE', 'tanzanie': 'TZ', 'laos': 'LA', 'moldavie': 'MD', 'macedoine': 'MK', 'palestine': 'PS', 'taiwan': 'TW', 'turquie': 'TR', 'emirats arabes unis': 'AE', 'pays bas': 'NL', 'hollande': 'NL', 'republique democratique du congo': 'CD', 'rdc': 'CD', 'congo': 'CG' };
  function trouverPays(nom) {
    const n = norm(nom).replace(/^(?:le|la|les|l|l ) /, '').trim(); if (ALIAS[n]) { const p = PAYS.find(x => x[1] === ALIAS[n]); if (p) return paysParNum(p[0]); }
    return trouverPaysParNom(nom);
  }

  /* ───── surbrillance : calque 2048×1024 (pays plein, ou zone arrondie pour une mer / un océan) ───── */
  const LH = q.tex >= 4096 ? 4096 : 2048; const cvH = document.createElement('canvas'); cvH.width = LH; cvH.height = LH / 2; const gH = cvH.getContext('2d');
  G.poserHL(cvH);
  const X = lo => (lo + 180) / 360 * LH, Y = la => (90 - la) / 180 * (LH / 2);
  function chemin(g, f) { const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; g.beginPath(); for (const p of polys) for (const ring of p) { let prev = null; for (const [lo, la] of ring) { const x = X(lo), y = Y(la); if (prev && Math.abs(lo - prev[0]) < 180) g.lineTo(x, y); else g.moveTo(x, y); prev = [lo, la]; } g.closePath(); } }
  let hlAnim = null;
  function surlignerPays(num, couleur = '#ffb43c') {
    const f = features.find(x => numDe(x) === String(num).padStart(3, '0')); if (!f) return false;
    gH.clearRect(0, 0, LH, LH / 2);
    chemin(gH, f); gH.fillStyle = couleur; gH.globalAlpha = .4; gH.fill('evenodd'); gH.globalAlpha = 1;
    gH.lineWidth = LH / 1500 + 1; gH.strokeStyle = '#fff3c4'; gH.stroke();
    G.uniforms.uHLoc.value = 0; G.poserHL(cvH); animerHL(1); return true;
  }
  // zone ronde (mer, océan) : disque flou dont l'étendue en longitude tient compte de la latitude
  function surlignerZone({ lat, lon, rayon = 10, couleur = '#38b6ff', ratio = 1 }) {
    gH.clearRect(0, 0, LH, LH / 2);
    const cy = Y(lat), cx = X(lon), ry = rayon / 180 * (LH / 2), rx = Math.min(LH / 2, rayon * ratio / Math.max(.25, Math.cos(lat * RAD)) / 360 * LH);
    for (const dx of [-LH, 0, LH]) { gH.save(); gH.translate(cx + dx, cy); gH.scale(rx / ry, 1); const gr = gH.createRadialGradient(0, 0, ry * .05, 0, 0, ry); gr.addColorStop(0, couleur + 'dd'); gr.addColorStop(.5, couleur + 'aa'); gr.addColorStop(.85, couleur + '44'); gr.addColorStop(1, couleur + '00'); gH.fillStyle = gr; gH.beginPath(); gH.arc(0, 0, ry, 0, 6.2832); gH.fill(); gH.restore(); }
    G.uniforms.uHLoc.value = 1; G.poserHL(cvH); animerHL(1); return true;       // la zone ne colore que l'eau (masque des océans)
  }
  function animerHL(cible) { hlAnim = { de: G.uniforms.uHLk.value, vers: cible, t: 0 }; }
  function effacerSurbrillance() { animerHL(0); }

  /* ───── centres (pour viser) ───── */
  function centreNom(nom) {
    const n = norm(nom); const p = trouverPays(nom); if (p && p.lat != null) return { lat: p.lat, lon: p.lon, etendue: p.etendue || 10, type: 'pays', pays: p };
    const m = OCEANS_MERS.find(o => norm(o.nom) === n || (o.alias || []).some(a => norm(a) === n) || norm(o.nom).replace(/^(?:ocean|mer|golfe) (?:de |du |des |d )?/, '') === n);
    if (m) return { lat: m.lat, lon: m.lon, etendue: m.rayon, type: m.type, zone: m };
    return null;
  }

  /* ───── étiquettes ───── */
  const E = ctx.etiquettes, items = [];
  const vloc = (lat, lon, r = 1.004) => { const a = lat * RAD, b = lon * RAD; return new THREE.Vector3(r * Math.cos(a) * Math.cos(b), r * Math.sin(a), -r * Math.cos(a) * Math.sin(b)); };
  const tmp = new THREE.Vector3();
  function ajouterEtiquette(id, texte, classe, lat, lon, alpha, rayon) {
    const loc = vloc(lat, lon, rayon || 1.003);
    E.ajouter({ id, texte, classe, position: () => tmp.copy(loc).applyMatrix4(G.terre.matrixWorld), visible: (w, cam) => G.visible(w, cam), alpha });
    items.push(id);
  }
  function montrerEtiquettes() {
    const dist = () => G.camDist || 3.4;
    for (const c of CENTRES) {
      const num = String(c[0]).padStart(3, '0'), p = parNum.get(num); if (!p) continue; const et = c[3];
      ajouterEtiquette('pays:' + num, p.nom, 'pays', c[1], c[2], () => { const d = dist(); return lisse(5, 9, et / (d - 1 + .12)) * (1 - lisse(14, 30, d)); });
    }
    for (const o of OCEANS_MERS) {
      const grand = o.type === 'ocean';
      ajouterEtiquette('mer:' + o.id, o.nom, grand ? 'ocean' : 'mer', o.lat, o.lon, () => {
        const d = dist(); if (grand) return lisse(1.9, 2.6, d) * (1 - lisse(9, 20, d));
        const ech = o.rayon / (d - .95); return lisse(5, 9, ech) * (1 - lisse(3.4, 4.6, d)) * (d > 1.05 ? 1 : .5);
      }, 1.004);
    }
    const V = (window.RayleUI && window.RayleUI.espaceTerreDonnees && window.RayleUI.espaceTerreDonnees.VILLES) || [];
    V.forEach((v, i) => ajouterEtiquette('ville:' + i, v[0], 'ville', v[1], v[2], () => 1 - lisse(1.28, 1.5, dist()), 1.003));
  }
  montrerEtiquettes();
  function viderEtiquettes() { for (const id of items) E.retirer(id); items.length = 0; }

  function maj(dt, camDist) {
    G.camDist = camDist;
    if (camDist < 1.45) affiner();
    if (hlAnim) { hlAnim.t += dt; const k = Math.min(1, hlAnim.t / .8); G.surbrillance(hlAnim.de + (hlAnim.vers - hlAnim.de) * k); if (k >= 1) hlAnim = null; }
  }
  return {
    pret: true, pays, paysParNum, trouverPays, surlignerPays, surlignerZone, effacerSurbrillance, centre: centreNom, maj, viderEtiquettes, affiner,
    nbPays: () => features.length, finesse: () => finesse, bordures: construireBordures, resolution, opacite: o => { matLigne.opacity = o; lignes.visible = o > .02; }, norm, OCEANS_MERS,
  };
}
