import * as THREE from 'three';
import { R, ECHELLE_BASE, alea, borner } from './mars-calcul.js';
import { texCoque, texSolaire, texPlateforme, texDisqueDoux, texHalo } from './procedural.js';

/* ═════════════ LA BASE MARTIENNE VUE DE L'ESPACE ═════════════
   Repère local : x = est, y = haut, z = sud, origine = le point de la surface. Moitié OUEST = BUREAU (ambre, « bientôt »), moitié EST = TERMINAL DE TRADING (cyan).
   Échelle exagérée (la base fait ~8 unités de scène de large, soit ~270 km) : sinon on ne la verrait pas depuis l'orbite.
   `maj(t, nuit)` : les lumières s'intensifient la nuit (matières émissives + halos au sol), les balises clignotent. */
const CYAN = new THREE.Color(0.30, 0.89, 1.0), AMBRE = new THREE.Color(1.0, 0.62, 0.22), BLANC = new THREE.Color(1, 0.96, 0.9);
const chute = (x, z) => -(x * x + z * z) / (2 * R);   // la surface s'incurve : un objet à 4 unités du centre est 0,08 plus bas

export function creerBase({ profil, aniso = 8 }) {
  const racine = new THREE.Group(); racine.name = 'base-martienne';
  const coque = new THREE.MeshStandardMaterial({ map: texCoque(profil.detailBase ? 512 : 256), roughness: 0.55, metalness: 0.22, color: 0xf2eee6 });
  const coqueBureau = coque.clone(); coqueBureau.color = new THREE.Color(0xf6ecdf);
  const metal = new THREE.MeshStandardMaterial({ color: 0x59606c, roughness: 0.38, metalness: 0.72 });
  const verre = new THREE.MeshStandardMaterial({ color: 0xa7dcf5, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide, emissive: CYAN.clone().multiplyScalar(0.25) });
  const verreBureau = verre.clone(); verreBureau.color = new THREE.Color(0xffe0b0); verreBureau.emissive = AMBRE.clone().multiplyScalar(0.2);
  const lueurDome = new THREE.MeshBasicMaterial({ color: CYAN.clone(), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  const lueurBureau = new THREE.MeshBasicMaterial({ color: AMBRE.clone(), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
  const ledT = new THREE.MeshBasicMaterial({ color: CYAN.clone() }), ledB = new THREE.MeshBasicMaterial({ color: AMBRE.clone() }), fenT = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.95, 1) }), fenB = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5) });
  const balise = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.15, 0.1) });
  const zones = { bureau: new THREE.Group(), terminal: new THREE.Group() };
  zones.bureau.name = 'zone-bureau'; zones.terminal.name = 'zone-terminal';
  const pickables = [];
  const marquer = (obj, zone) => { obj.traverse(o => { if (o.isMesh) { o.userData.zone = zone; pickables.push(o); } }); return obj; };
  const poser = (obj, x, z, y = 0, groupe = null) => { obj.position.set(x, y + chute(x, z) + 0.02, z); (groupe || racine).add(obj); return obj; };
  const seg = profil.detailBase >= 2 ? 40 : profil.detailBase === 1 ? 28 : 16;

  // Plateforme sous la base : calotte de sphère qui épouse la courbure, texture de régolithe tassé et marques d'atterrissage
  const rayonPlateforme = ECHELLE_BASE * 0.78, angle = Math.asin(rayonPlateforme / R);
  const geoPlat = new THREE.SphereGeometry(R + 0.03, 96, 14, 0, Math.PI * 2, 0, angle);
  { const p = geoPlat.attributes.position, uv = geoPlat.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * rayonPlateforme) + 0.5, p.getZ(i) / (2 * rayonPlateforme) + 0.5); }
  const plateforme = new THREE.Mesh(geoPlat, new THREE.MeshStandardMaterial({ map: texPlateforme(profil.detailBase ? 1024 : 512), alphaMap: texDisqueDoux(256), transparent: true, roughness: 1, metalness: 0, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  plateforme.position.y = -R; plateforme.renderOrder = 1; racine.add(plateforme);

  // ── Dôme (hémisphère de verre à nervures) ──
  function dome(rayon, mV, mL, mLed, nerv = 8) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(rayon, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), mV));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(rayon * 0.96, seg, Math.round(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), mL));
    const nervure = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.4, metalness: 0.6 });
    for (let i = 0; i < nerv; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(rayon, rayon * 0.014, 5, seg, Math.PI), nervure); t.rotation.y = i * Math.PI / nerv; g.add(t); }
    for (const h of [0.35, 0.68]) { const r = Math.cos(h * Math.PI / 2) * rayon; const t = new THREE.Mesh(new THREE.TorusGeometry(r, rayon * 0.012, 5, seg), nervure); t.rotation.x = Math.PI / 2; t.position.y = Math.sin(h * Math.PI / 2) * rayon; g.add(t); }
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(rayon * 1.04, rayon * 1.1, rayon * 0.14, seg), coque); socle.position.y = rayon * 0.07; g.add(socle);
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(rayon * 1.05, rayon * 0.022, 6, seg * 2), mLed); anneau.rotation.x = Math.PI / 2; anneau.position.y = rayon * 0.15; g.add(anneau);
    return g;
  }
  // ── Module cylindrique couché (axe x ou z) avec rangée de hublots lumineux ──
  function module(long, rayon, mCoque, mFen, axe = 'x', hublots = 5) {
    const g = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.CapsuleGeometry(rayon, long, 6, seg), mCoque); corps.rotation.z = Math.PI / 2; g.add(corps);
    for (let i = 0; i < hublots; i++) { const x = (i / (hublots - 1) - 0.5) * long * 0.9; const h = new THREE.Mesh(new THREE.BoxGeometry(long * 0.1, rayon * 0.28, rayon * 0.12), mFen); h.position.set(x, rayon * 0.28, rayon * 0.93); g.add(h); const h2 = h.clone(); h2.position.z = -rayon * 0.93; g.add(h2); }
    const ceinture = new THREE.Mesh(new THREE.TorusGeometry(rayon * 1.01, rayon * 0.05, 6, seg), metal); ceinture.rotation.y = Math.PI / 2; ceinture.position.x = long * 0.36; g.add(ceinture);
    const c2 = ceinture.clone(); c2.position.x = -long * 0.36; g.add(c2);
    if (axe === 'z') g.rotation.y = Math.PI / 2;
    g.position.y = rayon; return g;
  }
  const tube = (x1, z1, x2, z2, rayon = 0.14) => {
    const l = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.CylinderGeometry(rayon, rayon, l, 14), coque);
    m.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(m); g.rotation.y = -Math.atan2(z2 - z1, x2 - x1); g.position.set((x1 + x2) / 2, rayon, (z1 + z2) / 2); return g;
  };
  const antenne = (haut, mLed) => {
    const g = new THREE.Group(), mat = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, haut, 8), metal); mat.position.y = haut / 2; g.add(mat);
    for (let i = 1; i <= 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28 - i * 0.05, 0.012, 0.012), metal); b.position.y = haut * (0.4 + i * 0.16); g.add(b); }
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), balise); b.position.y = haut + 0.02; g.add(b); g.userData.balise = b; return g;
  };
  const parabole = (r) => {
    const g = new THREE.Group(), pied = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 10), metal); pied.position.y = 0.25; g.add(pied);
    const bras = new THREE.Group(); bras.position.y = 0.55;
    const coupe = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, 0.9), new THREE.MeshStandardMaterial({ color: 0xeceff2, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
    coupe.rotation.x = -Math.PI / 2 + 0.55; coupe.position.y = 0; bras.add(coupe);
    const foyer = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, r * 0.9, 6), metal); foyer.rotation.x = 0.55; foyer.position.set(0, r * 0.45, -r * 0.2); bras.add(foyer);
    g.add(bras); return g;
  };

  // ── TERMINAL DE TRADING (est) ──
  const T = zones.terminal;
  const domeT = dome(1.3, verre, lueurDome, ledT, 10); poser(domeT, 2.7, 0, 0, T);
  poser(module(1.9, 0.34, coque, fenT, 'x', 4), 3.55, -1.35, 0, T);
  poser(module(1.5, 0.3, coque, fenT, 'z', 4), 4.25, 0.35, 0, T);
  poser(module(1.4, 0.28, coque, fenT, 'x', 3), 3.35, 1.5, 0, T);
  poser(tube(1.4, 0, 0.2, 0), 0, 0, 0, T); T.children[T.children.length - 1].position.set((1.4 + 0.2) / 2, 0.14, 0);
  const parab = parabole(0.5); poser(parab, 4.6, -1.65, 0, T);
  const ant1 = antenne(1.2, ledT); poser(ant1, 3.15, -2.2, 0, T);
  // champ de panneaux solaires du terminal (instancié)
  const panneau = new THREE.BoxGeometry(0.62, 0.018, 0.4);
  const matSol = new THREE.MeshStandardMaterial({ map: texSolaire(256), roughness: 0.22, metalness: 0.75, color: 0xbfd0ff });
  function champSolaire(cols, rangs, x0, z0, pasX, pasZ, zone) {
    const m = new THREE.InstancedMesh(panneau, matSol, cols * rangs), d = new THREE.Object3D();
    let k = 0;
    for (let j = 0; j < rangs; j++) for (let i = 0; i < cols; i++) { const x = x0 + i * pasX, z = z0 + j * pasZ; d.position.set(x, 0.17 + chute(x, z), z); d.rotation.set(-0.42, 0, 0); d.updateMatrix(); m.setMatrixAt(k++, d.matrix); }
    m.instanceMatrix.needsUpdate = true; zone.add(m);
    for (let j = 0; j < rangs; j++) for (let i = 0; i < cols; i++) { const x = x0 + i * pasX, z = z0 + j * pasZ; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 5), metal); p.position.set(x, 0.085 + chute(x, z), z + 0.02); zone.add(p); }
  }
  champSolaire(5, 2, 2.3, 2.15, 0.7, 0.5, T);
  // ── BUREAU (ouest) ──
  const B = zones.bureau;
  const domeB = dome(0.95, verreBureau, lueurBureau, ledB, 8); poser(domeB, -2.7, 0.1, 0, B);
  poser(module(1.6, 0.32, coqueBureau, fenB, 'x', 4), -3.55, -1.3, 0, B);
  poser(module(1.4, 0.3, coqueBureau, fenB, 'z', 4), -4.1, 0.9, 0, B);
  poser(module(1.2, 0.27, coqueBureau, fenB, 'x', 3), -2.2, 1.45, 0, B);
  const tB = tube(-1.7, 0.1, -0.2, 0.0); B.add(tB); tB.position.y = 0.14 + chute(-1, 0);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.8 + i * 0.12, 18), coque); poser(r, -1.2 + i * 0.5, -2.05, 0.4 + i * 0.06, B); const bande = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.016, 5, 20), ledB); bande.rotation.x = Math.PI / 2; bande.position.y = 0.25; r.add(bande); }
  const ant2 = antenne(1.5, ledB); poser(ant2, -3.9, -2.05, 0, B);
  champSolaire(3, 2, -3.5, 2.0, 0.7, 0.5, B);
  // ── Noyau central (sas), piste d'atterrissage et passerelles ──
  const noyau = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.5, seg), coque); cyl.position.y = 0.25; noyau.add(cyl);
  const toit = new THREE.Mesh(new THREE.SphereGeometry(0.58, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal); toit.position.y = 0.5; noyau.add(toit);
  const anneauNoyau = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, seg * 2), ledT); anneauNoyau.rotation.x = Math.PI / 2; anneauNoyau.position.y = 0.38; noyau.add(anneauNoyau);
  poser(noyau, 0, 0, 0);
  const antC = antenne(0.9, ledT); poser(antC, 0.15, -0.5, 0.5);
  // navette posée sur la piste (sud)
  const navette = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 14), coque); fus.rotation.x = Math.PI / 2; fus.position.y = 0.33; navette.add(fus);
  const nez = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 14), metal); nez.rotation.x = -Math.PI / 2; nez.position.set(0, 0.33, -0.65); navette.add(nez);
  for (const s of [-1, 1]) { const aile = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.35), metal); aile.position.set(s * 0.33, 0.28, 0.12); aile.rotation.z = s * -0.1; navette.add(aile); const jambe = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), metal); jambe.position.set(s * 0.12, 0.1, 0.2); navette.add(jambe); }
  poser(navette, 0.2, 2.95, 0);
  // Lampes de balisage (instances + halos additifs la nuit)
  const lampes = [], rand = alea(31);
  const ajouterLampe = (x, z, c) => lampes.push({ x, z, c });
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; ajouterLampe(Math.cos(a) * 0.62, 2.95 + Math.sin(a) * 0.62, BLANC); }              // piste
  for (let i = 0; i < 8; i++) { ajouterLampe(0.9 + i * 0.22, 0.45 + (i % 2) * -0.9, CYAN); ajouterLampe(-0.9 - i * 0.22, 0.45 + (i % 2) * -0.9, AMBRE); }   // allées
  for (let i = 0; i < 6; i++) { ajouterLampe(-0.1 + (i % 2) * 0.2, 0.85 + i * 0.3, BLANC); }
  const ledGeo = new THREE.SphereGeometry(0.026, 8, 6), ledInst = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), lampes.length), d = new THREE.Object3D();
  const posHalo = new Float32Array(lampes.length * 3), colHalo = new Float32Array(lampes.length * 3);
  lampes.forEach((l, i) => { d.position.set(l.x, 0.05 + chute(l.x, l.z), l.z); d.updateMatrix(); ledInst.setMatrixAt(i, d.matrix); ledInst.setColorAt(i, l.c); posHalo.set([l.x, 0.08 + chute(l.x, l.z), l.z], i * 3); colHalo.set([l.c.r, l.c.g, l.c.b], i * 3); });
  ledInst.instanceColor.needsUpdate = true; racine.add(ledInst);
  const geoHalo = new THREE.BufferGeometry(); geoHalo.setAttribute('position', new THREE.BufferAttribute(posHalo, 3)); geoHalo.setAttribute('color', new THREE.BufferAttribute(colHalo, 3));
  const halos = new THREE.Points(geoHalo, new THREE.PointsMaterial({ map: texHalo(128), size: 0.55, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halos.frustumCulled = false; racine.add(halos);
  // Halos autour des dômes (lumière qui déborde)
  const grandHalo = (x, z, c, taille) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHalo(128), color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.setScalar(taille); s.position.set(x, 0.5 + chute(x, z), z); racine.add(s); return s; };
  const sprites = [grandHalo(2.7, 0, CYAN, 4.2), grandHalo(-2.7, 0.1, AMBRE, 3.2), grandHalo(0, 0, CYAN, 2.2)];

  racine.add(zones.bureau, zones.terminal);
  marquer(zones.bureau, 'bureau'); marquer(zones.terminal, 'terminal');
  // les parties communes (noyau, piste) servent d'entrée du terminal
  marquer(noyau, 'terminal');

  // Points d'ancrage pour les étiquettes (repère local)
  const ancres = { bureau: new THREE.Vector3(-2.9, 1.9, 0.2), terminal: new THREE.Vector3(2.9, 2.1, 0.0) };

  function maj(t, nuit) {
    const k = 0.55 + nuit * 1.55;                                               // intensité des lumières
    ledT.color.copy(CYAN).multiplyScalar(k); ledB.color.copy(AMBRE).multiplyScalar(k);
    fenT.color.setRGB(0.7, 0.95, 1).multiplyScalar(0.7 + nuit * 1.7); fenB.color.setRGB(1, 0.8, 0.5).multiplyScalar(0.7 + nuit * 1.7);
    lueurDome.opacity = 0.08 + nuit * 0.2; lueurBureau.opacity = 0.07 + nuit * 0.18;
    verre.emissive.copy(CYAN).multiplyScalar(0.08 + nuit * 0.55); verreBureau.emissive.copy(AMBRE).multiplyScalar(0.06 + nuit * 0.45);
    halos.material.opacity = borner(0.15 + nuit * 0.85, 0, 1);
    sprites[0].material.opacity = 0.05 + nuit * 0.3; sprites[1].material.opacity = 0.04 + nuit * 0.26; sprites[2].material.opacity = 0.04 + nuit * 0.22;
    const clignote = (Math.sin(t * 3.1) > 0.55) ? 1 : 0.12;
    balise.color.setRGB(1, 0.15, 0.1).multiplyScalar(0.3 + 2.2 * clignote);
    parab.children[parab.children.length - 1].rotation.y = Math.sin(t * 0.2) * 0.7;
  }
  return { groupe: racine, zones, pickables, ancres, maj, rayon: ECHELLE_BASE / 2 };
}
