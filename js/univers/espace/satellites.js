// Satellites réels et ISS : positions calculées par SGP4 (ui/sgp4.js) à partir des éléments publics de CelesTrak (stations + « visual » : les ~170 satellites les plus brillants),
// rafraîchis toutes les 6 h (cache local), avec TLE de secours embarqué pour l'ISS. L'ISS est dessinée avec le modèle détaillé de ui/espace-iss.js (modules, 8 ailes solaires articulées,
// radiateurs, Soyouz, Progress, Crew Dragon, Canadarm2) orienté comme la vraie station (treillis perpendiculaire à la trajectoire), ses ailes suivent le Soleil.
// Rien n'est inventé : si CelesTrak est injoignable et sans cache, seule l'ISS (TLE de secours, précision dégradée avec l'âge) est affichée, et le dit.
// creerSatellites(ctx, G) → { groupe, maj(dt, t, ts, camera, sunDir), iss(ts) → {pos, vel, alt, lat, lon, v}, orbite(ts), liste, visible(oui), etat(), charger(), detruire() }
const CLE = 'rayle_univers_tle_v1', TTL = 6 * 3600e3;
const URL_TLE = g => 'https://celestrak.org/NORAD/elements/gp.php?GROUP=' + g + '&FORMAT=tle';
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* quota : tant pis */ } };
export function parserTLE(texte) {
  const l = String(texte || '').split(/\r?\n/).map(x => x.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < l.length; i++) if (l[i + 1][0] === '1' && l[i + 2][0] === '2' && l[i + 1].length >= 68) { out.push({ nom: l[i].trim(), l1: l[i + 1], l2: l[i + 2] }); i += 2; }
  return out;
}
const AFFICHES = { 'ISS (ZARYA)': 'ISS', 'CSS (TIANHE)': 'Tiangong', HST: 'Hubble' };

export async function creerSatellites(ctx, G) {
  const { THREE, q } = ctx, UI = window.RayleUI, SG = UI.sgp4, A = UI.astro;
  const groupe = new THREE.Group(); groupe.name = 'satellites';
  const vec = (x, y, z) => new THREE.Vector3(x, y, z), R_T = 6371;
  let sats = [], source = 'aucune', age = null, erreur = '';
  const issSecours = () => { try { const t = UI.espace && UI.espace.iss; return t || null; } catch (e) { return null; } };

  /* ───── chargement des éléments orbitaux ───── */
  async function charger(force) {
    let cache = null; try { cache = JSON.parse(lsGet(CLE) || 'null'); } catch (e) { /* illisible */ }
    let data = cache && !force && Date.now() - cache.t < TTL ? cache : null;
    if (!data) {
      try {
        const [st, vi] = await Promise.all([fetch(URL_TLE('stations')), fetch(URL_TLE('visual'))]);
        if (!st.ok || !vi.ok) throw new Error('CelesTrak ' + st.status + '/' + vi.status);
        data = { t: Date.now(), stations: parserTLE(await st.text()), visual: parserTLE(await vi.text()) };
        if (!data.stations.length) throw new Error('réponse vide');
        lsSet(CLE, JSON.stringify(data)); erreur = '';
      } catch (e) { erreur = String(e && e.message || e); data = cache; }
    }
    const liste = []; const vus = new Set();
    if (data) for (const [cat, arr] of [['station', data.stations], ['visuel', data.visual]]) for (const s of arr) {
      if (vus.has(s.nom)) continue; vus.add(s.nom);
      try { const sat = SG.lireTLE(s.l1, s.l2); liste.push({ nom: s.nom, cat, sat, ok: true, epoque: s.l1.slice(18, 32) }); } catch (e) { /* orbite lointaine ou TLE refusé */ }
    }
    sats = liste; source = data ? (data === cache && erreur ? 'cache (réseau injoignable)' : Date.now() - data.t < 6e4 ? 'CelesTrak (à l’instant)' : 'CelesTrak (cache)') : 'aucune';
    age = data ? (Date.now() - data.t) / 36e5 : null;
    reconstruire(); return etat();
  }

  /* ───── nuage de points ───── */
  let pts = null, pos = null, couls = null;
  function reconstruire() {
    if (pts) { groupe.remove(pts); pts.geometry.dispose(); pts.material.dispose(); }
    const n = Math.max(1, sats.length); pos = new Float32Array(n * 3); couls = new Float32Array(n * 3);
    sats.forEach((s, i) => { const c = s.nom === 'ISS (ZARYA)' ? [.3, .95, 1] : s.cat === 'station' ? [1, .65, .25] : s.nom === 'HST' ? [1, .9, .3] : [.8, .88, 1]; couls.set(c, i * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(couls, 3)); g.boundingSphere = new THREE.Sphere(vec(0, 0, 0), 5);
    pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.4, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, opacity: .95 })); pts.frustumCulled = false; pts.renderOrder = 7; groupe.add(pts);
  }
  const _p = vec(0, 0, 0), _v = vec(0, 0, 0);
  function etatSat(s, ts) { try { const p = SG.propager(s.sat, ts); return { p: [p.x / R_T, p.z / R_T, -p.y / R_T], v: [p.vx, p.vz, -p.vy], brut: p }; } catch (e) { return null; } }

  /* ───── ISS : modèle détaillé ───── */
  let issModele = null, issGroupe = new THREE.Group(); issGroupe.visible = false; groupe.add(issGroupe);
  const TAILLE_ISS = 0.0125;                                     // longueur affichée (rayons terrestres) : ≈ 80 km, la vraie station mesure 109 m (agrandie ×730 pour être visible)
  function monterModele() {
    if (issModele || !UI.espaceISS) return;
    issModele = UI.espaceISS.construire(THREE, { niveau: q.lod >= 1 ? 1 : 0 });
    issModele.groupe.scale.setScalar(TAILLE_ISS / 109); issGroupe.add(issModele.groupe);
  }
  function posISS(ts) {
    const s = sats.find(x => x.nom === 'ISS (ZARYA)');
    if (s) { const e = etatSat(s, ts); if (e) { const g = SG.geodesique(e.brut, ts); return { pos: vec(...e.p), vel: vec(...e.v), alt: g.alt, lat: g.lat, lon: g.lon, v: Math.hypot(...e.v) * 3600, source }; } }
    const t = issSecours(); if (t) { try { const p = t.position(ts), d = A.direction(p.ra, p.dec), pos = vec(d[0], d[1], d[2]).multiplyScalar(p.r || 1.066), p2 = t.position(ts + 10000), d2 = A.direction(p2.ra, p2.dec), q2 = vec(d2[0], d2[1], d2[2]).multiplyScalar(p2.r || 1.066); return { pos, vel: q2.sub(pos).multiplyScalar(R_T / 10), alt: p.alt, lat: p.lat, lon: p.lon, v: 27600, source: 'TLE de secours' }; } catch (e) { /* aucun repli */ } }
    return null;
  }
  const bx = vec(1, 0, 0), by = vec(0, 1, 0), bz = vec(0, 0, 1), M = new THREE.Matrix4(), sunLocal = vec(0, 0, 1);
  function maj(dt, t, ts, camera, sunDir, ombre) {
    if (!pts || !groupe.visible) return;
    for (let i = 0; i < sats.length; i++) { const e = etatSat(sats[i], ts); if (e) { pos[i * 3] = e.p[0]; pos[i * 3 + 1] = e.p[1]; pos[i * 3 + 2] = e.p[2]; } else { pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 1e6; } }
    pts.geometry.attributes.position.needsUpdate = true;
    const I = posISS(ts);
    if (I) {
      issGroupe.visible = true; issGroupe.position.copy(I.pos);
      by.copy(I.pos).normalize(); bz.copy(I.vel).normalize(); bx.crossVectors(by, bz).normalize(); bz.crossVectors(bx, by).normalize();
      M.makeBasis(bx, by, bz); issGroupe.quaternion.setFromRotationMatrix(M);
      if (issModele) { sunLocal.set(sunDir.dot(bx), sunDir.dot(by), sunDir.dot(bz)); issModele.maj([sunLocal.x, sunLocal.y, sunLocal.z], dt); }
    }
  }
  function orbite(ts, avantMin = 45, apresMin = 50, pas = 1) {
    const s = sats.find(x => x.nom === 'ISS (ZARYA)'), out = [];
    for (let m = -avantMin; m <= apresMin; m += pas) { const e = s ? etatSat(s, ts + m * 6e4) : null; if (e) out.push(vec(...e.p)); }
    return out;
  }
  const etat = () => ({ nb: sats.length, source, ageHeures: age == null ? null : +age.toFixed(1), erreur, iss: !!sats.find(s => s.nom === 'ISS (ZARYA)') });
  function detruire() { if (pts) { pts.geometry.dispose(); pts.material.dispose(); } if (issModele) issModele.dispose(); }
  await charger(false);
  monterModele();
  return { groupe, maj, iss: posISS, orbite, liste: () => sats.map(s => ({ nom: s.nom, cat: s.cat, affiche: AFFICHES[s.nom] || null })), visible: oui => { groupe.visible = oui; }, etat, charger, detruire, issGroupe, taille: TAILLE_ISS, positionDe: (nom, ts) => { const s = sats.find(x => x.nom === nom); const e = s && etatSat(s, ts); return e ? vec(...e.p) : null; } };
}
