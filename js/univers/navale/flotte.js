// Flotte : physique à voile (vent, cap, vitesse, gîte, flottaison sur la houle), artillerie (bordées, recul, boulets balistiques), dégâts progressifs (voiles déchirées, mâts qui tombent,
// équipage), naufrage, particules (fumée, flammes, éclaboussures, éclats de bois) et intelligence artificielle (patrouille, ligne de bataille, bordées).
// Repère monde : +x est, +y haut, −z nord. Cap en radians : 0 = vers le nord (−z), π/2 = vers l'ouest (−x) ; avant du navire = (−sin cap, −cos cap).
// Les chiffres de jeu (vitesse, rechargement, portée) sont des simplifications réalistes : voir donnees/navires.js.
import { ennemis } from '../donnees/navires.js?v=2026.10.14.5';
const RAD = Math.PI / 180, TAU = Math.PI * 2;
const normA = a => { a = ((a % TAU) + TAU) % TAU; return a > Math.PI ? a - TAU : a; };
export const avant = cap => [-Math.sin(cap), -Math.cos(cap)];
export const dirVent = ventDirDeg => { const a = (ventDirDeg + 180) * RAD; return [Math.sin(a), -Math.cos(a)]; };      // vers où souffle le vent

// polaire de vitesse : fraction de la vitesse maximale selon l'angle au vent (0 = vent debout). Zone interdite sous 42°.
export function polaire(twaDeg) {
  const a = Math.abs(twaDeg); if (a < 42) return 0;
  if (a < 60) return (a - 42) / 18 * .55; if (a < 110) return .55 + (a - 60) / 50 * .45; if (a < 150) return 1 - (a - 110) / 40 * .08; return .92 - (a - 150) / 30 * .12;
}
export function facteurVent(ms) { return Math.max(.42, Math.min(1, ms / 9)) * (ms > 24 ? .6 : 1); }
// angle entre l'avant du navire et la direction d'où vient le vent (degrés ; 0 = face au vent, 180 = vent arrière ; positif : le vent vient de tribord)
export function angleAuVent(cap, ventDirDeg) { const f = Math.atan2(-Math.sin(cap), Math.cos(cap)) / RAD; return normA((ventDirDeg - ((f + 360) % 360)) * RAD) / RAD; }

/* ═════════ particules ═════════ */
export function creerParticules(THREE, n = 900) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), tai = new Float32Array(n), vel = new Float32Array(n * 3), vie = new Float32Array(n), vie0 = new Float32Array(n), grav = new Float32Array(n), croi = new Float32Array(n), c0 = new Float32Array(n * 4);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); g.setAttribute('aTai', new THREE.BufferAttribute(tai, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uPx: { value: 1 } }, vertexShader: 'attribute vec4 aCol; attribute float aTai; uniform float uPx; varying vec4 vC; void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=min(220.,aTai*uPx*620./max(-mv.z,1.)); }', fragmentShader: 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.18,d); if(a<.02||vC.a<.01) discard; vec3 c=floor(vC.rgb*5.+.5)/5.; gl_FragColor=vec4(c,vC.a*a); }' });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 8; let cur = 0;
  vie.fill(-1);
  function emettre(o) { const i = cur++ % n; pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z; vel[i * 3] = o.vx || 0; vel[i * 3 + 1] = o.vy || 0; vel[i * 3 + 2] = o.vz || 0; vie[i] = vie0[i] = o.vie || 1; tai[i] = o.taille || 1; grav[i] = o.grav || 0; croi[i] = o.croiss || 0; c0.set(o.couleur || [1, 1, 1, 1], i * 4); }
  const rr = (a = 1) => (Math.random() - .5) * 2 * a;
  const api = {
    mesh: pts, emettre,
    fumee(x, y, z, k = 1, vent = [0, 0]) { for (let i = 0; i < Math.ceil(k); i++) emettre({ x: x + rr(.3), y, z: z + rr(.3), vx: vent[0] * .4 + rr(.5), vy: 1.2 + Math.random() * 1.2, vz: vent[1] * .4 + rr(.5), vie: 3 + Math.random() * 3, taille: 3.5 + Math.random() * 3, croiss: 2.4, couleur: [.38, .38, .4, .55] }); },
    flamme(x, y, z, dx, dz) { for (let i = 0; i < 7; i++) emettre({ x, y, z, vx: dx * (5 + Math.random() * 7) + rr(1.5), vy: rr(1.2), vz: dz * (5 + Math.random() * 7) + rr(1.5), vie: .22 + Math.random() * .2, taille: 2 + Math.random() * 1.6, croiss: -2, couleur: [1, .72, .25, .95] }); },
    eclaboussure(x, y, z, k = 14, f = 1) { for (let i = 0; i < k; i++) emettre({ x, y, z, vx: rr(4 * f), vy: 5 + Math.random() * 7 * f, vz: rr(4 * f), vie: .9 + Math.random() * .5, taille: 1 + Math.random() * 1.4, grav: 16, couleur: [.95, .98, 1, .9] }); },
    eclats(x, y, z, k = 12) { for (let i = 0; i < k; i++) emettre({ x, y, z, vx: rr(6), vy: 2 + Math.random() * 6, vz: rr(6), vie: .8, taille: .6 + Math.random() * .6, grav: 14, couleur: [.55, .36, .2, 1] }); },
    flash(x, y, z) { emettre({ x, y, z, vie: .12, taille: 6, couleur: [1, .9, .55, 1], croiss: 8 }); },
    maj(dt) {
      for (let i = 0; i < n; i++) {
        if (vie[i] <= 0) { col[i * 4 + 3] = 0; continue; } vie[i] -= dt; const k = Math.max(0, vie[i] / vie0[i]);
        vel[i * 3 + 1] -= grav[i] * dt; pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt; tai[i] = Math.max(.1, tai[i] + croi[i] * dt);
        col[i * 4] = c0[i * 4]; col[i * 4 + 1] = c0[i * 4 + 1]; col[i * 4 + 2] = c0[i * 4 + 2]; col[i * 4 + 3] = c0[i * 4 + 3] * (k < .5 ? k * 2 : 1);
      }
      g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aTai.needsUpdate = true; mat.uniforms.uPx.value = 1;
    },
    detruire() { g.dispose(); mat.dispose(); },
  };
  return api;
}

/* ═════════ navire de jeu ═════════ */
export class Navire {
  constructor(THREE, geo, equipage, { id, camp, nation, type, x = 0, z = 0, cap = 0 }) {
    this.T = THREE; this.geo = geo; this.equ = equipage; this.id = id; this.camp = camp; this.nation = nation; this.typeId = type; this.def = geo.type;
    this.x = x; this.z = z; this.cap = cap; this.vit = 0; this.capVoulu = cap; this.pv = this.def.pv; this.pvMax = this.def.pv; this.etat = 'navigue'; this.coule = 0; this.gite = 0; this.tangage = 0; this.y = 0;
    this.voiles = geo.voilesInfo.map(v => ({ id: v.id, pv: 100, info: v })); this.mats = geo.matInfo.map(m => ({ idx: m.idx, pv: 100, tombe: 0, cote: 1, info: m })); this.equipage = 1;
    const nc = geo.canons.nb; this.cano = { delai: new Float32Array(nc).fill(-1), depuis: new Float32Array(nc).fill(99), pret: new Uint8Array(nc).fill(1), sortie: new Float32Array(nc).fill(-.6) };
    this.recharge = { 1: 0, [-1]: 0 }; this.cible = null; this.mode = 'patrouille'; this.cooldownIA = 0; this.nom = ''; this.visible = true; this.tFeu = 0; this.etatDegats = 0;
    this.cap0 = cap; this.posExt = new THREE.Vector3();
  }
  get avant() { return avant(this.cap); }
  get vitesseNoeuds() { return this.vit * 1.944; }
  // nombre de canons restant par bord
  get canonsParCote() { const out = { 1: 0, [-1]: 0 }; this.geo.canons.sabords.forEach(s => { out[s.cote]++; }); return out; }
  /* ───── physique ───── */
  maj(dt, t, monde) {
    const d = this.def, w = monde.vent;
    if (this.etat === 'epave') return;
    if (this.etat === 'coule') {
      this.coule += dt / 14; this.vit *= 1 - dt * .3; const f = Math.min(1, this.coule);
      this.x += this.avant[0] * this.vit * dt; this.z += this.avant[1] * this.vit * dt; this.gite += (.45 * Math.sign(this.gite || 1) - this.gite) * dt * .4; this.tangage += (-.2 - this.tangage) * dt * .35;
      this.y = monde.mer.hauteur(this.x, this.z, t) - f * (d.tirant + d.francBord + 3) - .1;
      if (Math.random() < dt * 6) monde.part.eclaboussure(this.x + (Math.random() - .5) * d.largeur, this.y + d.tirant * .6, this.z + (Math.random() - .5) * d.longueur * .5, 3, .5);
      if (f >= 1) { this.etat = 'epave'; this.geo.groupe.visible = false; } this.appliquer(t); return;
    }
    // cap : rotation limitée (plus lente quand les voiles sont abîmées)
    const etatVoiles = this.fractionVoiles(), lim = d.virage * RAD * (.4 + .6 * Math.min(1, this.vit / 2 + .3)) * (.4 + .6 * etatVoiles);
    const dc = normA(this.capVoulu - this.cap); this.cap += Math.max(-lim * dt, Math.min(lim * dt, dc));
    // vitesse : polaire × vent × état des voiles
    const twa = angleAuVent(this.cap, w.dir), cible = d.vitesseMax * polaire(twa) * facteurVent(w.ms) * (.25 + .75 * etatVoiles) * (this.etat === 'coule' ? 0 : 1);
    this.vit += (cible - this.vit) * Math.min(1, dt * .35);
    this.x += this.avant[0] * this.vit * dt; this.z += this.avant[1] * this.vit * dt;
    // gîte du côté sous le vent, tangage de la houle
    const sens = twa >= 0 ? -1 : 1; this.gite += (sens * Math.min(.24, w.ms * .011 * Math.abs(Math.sin(twa * RAD)) * (this.def.ponts > 1 ? .6 : 1)) - this.gite) * Math.min(1, dt * .8);
    this.y = 0; this.appliquer(t);
    // voilure : gonflement et claquement selon l'angle au vent, bras (orientation) selon le bord
    const u = this.geo.uni, plein = polaire(twa) > .05 ? .35 + .65 * Math.min(1, this.vit / (d.vitesseMax * .8 + .1)) : .0;
    u.uBillow.value += (plein - u.uBillow.value) * Math.min(1, dt * 1.5); u.uFlutter.value = Math.abs(twa) < 55 ? 1 : Math.abs(twa) < 80 ? .35 : .08; u.uTack.value = sens; u.uTrim.value = sens * Math.max(-.7, Math.min(.7, (Math.abs(twa) - 90) * RAD * .45 - .15));
    // mâts qui tombent
    for (const m of this.mats) { if (m.pv <= 0 && m.tombe < 1.45) { m.tombe += dt * (.35 + m.tombe * .9); this.geo.uni.uCasse.value[m.idx].set(1, m.info.yCasse, m.cote, m.tombe); } }
    // fumée si très endommagé, flammes en dessous de 25 %
    if (this.pv < this.pvMax * .5 && Math.random() < dt * 3) monde.part.fumee(this.x + (Math.random() - .5) * 4, this.y + d.francBord + 1, this.z + (Math.random() - .5) * 8, 1, monde.ventVec);
    if (this.pv < this.pvMax * .25 && Math.random() < dt * 5) monde.part.flamme(this.x + (Math.random() - .5) * 5, this.y + d.francBord + 1.2, this.z + (Math.random() - .5) * 8, 0, 0);
    this.majCanons(dt);
  }
  appliquer(t) {
    const g = this.geo.groupe; g.position.set(this.x, this.y, this.z); g.rotation.set(0, 0, 0);
    // pose = lacet, puis tangage (sur la houle) et roulis (gîte)
    g.rotation.order = 'YXZ'; g.rotation.y = this.cap; g.rotation.x = this.tangage; g.rotation.z = -this.gite;
  }
  poseSurHoule(monde, t) {
    if (this.etat === 'epave' || this.etat === 'coule') return; const d = this.def, f = this.avant, L = d.longueur * .42, W = d.largeur * .4, s = [-f[1], f[0]];
    const h = (px, pz) => monde.mer.hauteur(px, pz, t), hb = h(this.x + f[0] * L, this.z + f[1] * L), hs = h(this.x - f[0] * L, this.z - f[1] * L), hp = h(this.x + s[0] * W, this.z + s[1] * W), hst = h(this.x - s[0] * W, this.z - s[1] * W), hc = h(this.x, this.z);
    this.y = (hb + hs + hp + hst + hc) / 5 - .15; this.tangage += (Math.atan2(hs - hb, L * 2) * .85 - this.tangage) * .25;
    this.rouliH = Math.atan2(hp - hst, W * 2) * .6; this.geo.groupe.position.y = this.y; this.geo.groupe.rotation.x = this.tangage; this.geo.groupe.rotation.z = -this.gite + (this.rouliH || 0) * .5;
  }
  fractionVoiles() { const v = this.voiles; if (!v.length) return 1; let s = 0; for (const x of v) s += x.pv; const m = this.mats.reduce((a, b) => a + (b.pv > 0 ? 1 : 0), 0) / Math.max(1, this.mats.length); return Math.max(.08, (s / v.length / 100) * (.3 + .7 * m)); }
  /* ───── artillerie ───── */
  // ordonne une bordée du côté (1 = tribord, −1 = bâbord) : chaque canon part avec un petit retard aléatoire
  bordee(cote) {
    if (this.etat !== 'navigue' || this.recharge[cote] > 0) return false;
    const c = this.cano, sab = this.geo.canons.sabords; let n = 0;
    sab.forEach((s, i) => { if (s.cote === cote && c.pret[i] && !s.detruit) { c.delai[i] = Math.random() * 1.7 + (s.rangee * .15); c.pret[i] = 0; n++; } });
    if (!n) return false; this.recharge[cote] = this.def.rechargement * (1 + (1 - this.equipage) * .8); return true;
  }
  majCanons(dt) {
    const c = this.cano, A = this.geo.canons.aOut.array, monde = this.monde; if (!monde) return;
    for (const k of [1, -1]) if (this.recharge[k] > 0) this.recharge[k] -= dt;
    for (let i = 0; i < c.delai.length; i++) {
      if (c.delai[i] >= 0) { c.delai[i] -= dt; if (c.delai[i] < 0) { c.depuis[i] = 0; this.tirerCanon(i, monde); } }
      if (c.depuis[i] < 90) c.depuis[i] += dt; const dep = c.depuis[i], rech = this.def.rechargement * .85;
      let o; if (dep < .12) o = .55 + (.4 - 1.5) * (dep / .12) * .6; else if (dep < rech) o = -.7; else if (dep < rech + .8) o = -.7 + (dep - rech) / .8 * 1.25; else { o = .55; c.pret[i] = 1; }
      c.sortie[i] = o; A[i] = (this.etat === 'navigue' && this.mode !== 'patrouille') || dep < rech + .8 ? o : -.65;
    }
    this.geo.canons.aOut.needsUpdate = true;
  }
  tirerCanon(i, monde) {
    const s = this.geo.canons.sabords[i], g = this.geo.groupe, T = this.T; if (s.detruit) return;
    const loc = new T.Vector3(s.pos.x + s.cote * (1.2 + this.def.longueur * .006), s.pos.y, s.pos.z); g.localToWorld(loc);
    const dirLoc = new T.Vector3(s.cote, .04 + Math.random() * .05, (Math.random() - .5) * .18).normalize(), dir = dirLoc.transformDirection(g.matrixWorld);
    const portee = this.def.portee, v = 78 + this.def.longueur * .55;                                  // vitesse initiale (m/s) : lisible à l'écran
    monde.boulets.lancer(loc, dir.multiplyScalar(v + (Math.random() - .5) * 8), this);
    monde.part.flash(loc.x, loc.y, loc.z); monde.part.flamme(loc.x, loc.y, loc.z, dir.x, dir.z); monde.part.fumee(loc.x, loc.y, loc.z, 3, monde.ventVec); monde.son && monde.son.canon(loc, this);
    this.tFeu = monde.t;
  }
  /* ───── dégâts ───── */
  impact(ptMonde, degats, monde, ch = {}) {
    if (this.etat !== 'navigue') return; const d = degats * (this.def.id === 'vaisseau' ? .75 : 1);
    monde.part.eclats(ptMonde.x, ptMonde.y, ptMonde.z, 10); monde.part.fumee(ptMonde.x, ptMonde.y, ptMonde.z, 2, monde.ventVec); monde.son && monde.son.impact(ptMonde);
    const loc = this.geo.groupe.worldToLocal(ptMonde.clone()), haut = loc.y > this.def.francBord + .5;
    if (haut || Math.random() < .35) this.toucherVoile(loc, d); else this.pv -= d;
    if (loc.y > this.def.francBord * .9 && Math.random() < .3) this.toucherMat(loc, d);
    this.equipage = Math.max(.1, this.equipage - d / (this.pvMax * .5)); this.equ && this.equ.perte(1 - this.equipage);
    const sab = this.geo.canons.sabords; if (Math.random() < .12) { const s = sab[Math.floor(Math.random() * sab.length)]; if (s) { s.detruit = true; this.cano.pret[sab.indexOf(s)] = 0; } }
    this.pv -= d * .35; this.etatDegats = 1 - Math.max(0, this.pv) / this.pvMax;
    if (this.pv <= 0) this.couler(monde);
  }
  toucherVoile(loc, d) {
    if (!this.voiles.length) return; const v = this.voiles[Math.floor(Math.random() * this.voiles.length)]; v.pv = Math.max(0, v.pv - 22 - d * .1);
    const A = this.geo.gVoilure.attributes.aSail, D = this.geo.gVoilure.attributes.aDmg; for (let i = 0; i < A.count; i++) if (A.getX(i) === v.id) D.setX(i, 1 - v.pv / 100); D.needsUpdate = true;
  }
  toucherMat(loc, d) {
    const cand = this.mats.filter(m => m.pv > 0); if (!cand.length) return; const m = cand[Math.floor(Math.random() * cand.length)]; m.pv -= 18 + d * .12; if (m.pv <= 0) { m.cote = Math.random() < .5 ? -1 : 1; this.geo.uni.uCasse.value[m.idx].set(1, m.info.yCasse, m.cote, 0.01); this.monde && this.monde.son && this.monde.son.craque(); }
  }
  couler(monde) { if (this.etat !== 'navigue') return; this.etat = 'coule'; this.coule = 0; this.gite = this.gite || .1; this.cible = null; monde.evenement && monde.evenement('coule', this); monde.son && monde.son.coule(); }
}

/* ═════════ boulets ═════════ */
export function creerBoulets(THREE, n = 200) {
  const g = new THREE.SphereGeometry(.28, 8, 6), m = new THREE.MeshToonMaterial({ color: 0x15151a }), im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; im.count = 0;
  const L = []; const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1);
  return {
    mesh: im,
    lancer(p, v, de) { if (L.length >= n) L.shift(); L.push({ p: p.clone(), v: v.clone(), de, vie: 6 }); },
    maj(dt, monde, navires) {
      for (let i = L.length - 1; i >= 0; i--) {
        const b = L[i]; b.vie -= dt; b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
        let fin = b.vie <= 0;
        if (!fin) for (const s of navires) {
          if (s === b.de || s.etat !== 'navigue') continue; const loc = s.geo.groupe.worldToLocal(b.p.clone()), d = s.def;
          if (Math.abs(loc.x) < d.largeur * .5 * .95 && Math.abs(loc.z) < d.longueur * .5 && loc.y > -d.tirant * .4 && loc.y < d.francBord + d.hauteurMat * .75) { s.impact(b.p, 14 + Math.random() * 16, monde); fin = true; break; }
        }
        if (!fin) { const h = monde.mer.hauteur(b.p.x, b.p.z, monde.t); if (b.p.y < h) { monde.part.eclaboussure(b.p.x, h, b.p.z, 16, 1); monde.son && monde.son.eclabousse(b.p); fin = true; } }
        if (fin) L.splice(i, 1);
      }
      im.count = L.length; L.forEach((b, i) => { P.copy(b.p); M.compose(P, Q, S); im.setMatrixAt(i, M); }); im.instanceMatrix.needsUpdate = true;
    },
    nombre: () => L.length, detruire() { g.dispose(); m.dispose(); im.dispose(); },
  };
}

/* ═════════ intelligence artificielle ═════════ */
export function ia(nav, monde, dt) {
  if (nav.etat !== 'navigue') return; nav.cooldownIA -= dt;
  const vivants = monde.navires.filter(n => n.etat === 'navigue');
  const ennem = vivants.filter(n => n !== nav && ennemis(nav.nation, n.nation));
  if (nav.cooldownIA <= 0) {
    nav.cooldownIA = 1.2 + Math.random() * .8;
    if (ennem.length) { let best = null, bd = 1e9; for (const e of ennem) { const d = Math.hypot(e.x - nav.x, e.z - nav.z) - (e === nav.cible ? 40 : 0); if (d < bd) { bd = d; best = e; } } nav.cible = best; nav.mode = 'combat'; }
    else { nav.cible = null; if (nav.mode === 'combat') nav.mode = 'patrouille'; }
  }
  const w = monde.vent;
  let voulu = nav.capVoulu;
  if (nav.mode === 'combat' && nav.cible) {
    const dx = nav.cible.x - nav.x, dz = nav.cible.z - nav.z, dist = Math.hypot(dx, dz), brg = Math.atan2(-dx, -dz);                // azimut de la cible (même convention que le cap)
    const D = nav.def.portee * .62, cote = nav.cote || (nav.cote = normA(brg - nav.cap) > 0 ? -1 : 1);
    // cap qui présente le flanc : perpendiculaire au relèvement, incliné vers la cible si trop loin, s'écartant si trop près
    let inc = (dist > D * 1.35 ? 45 : dist < D * .7 ? -35 : 0) * RAD; voulu = normA(brg + cote * (Math.PI / 2 - inc * 1));
    // jamais dans la zone interdite : on louvoie à ±48° du vent
    const twa = angleAuVent(voulu, w.dir); if (Math.abs(twa) < 46) { voulu = nav.cap + (twa >= 0 ? 1 : -1) * (46 - Math.abs(twa)) * RAD * 1.1; }
    nav.capVoulu = voulu;
    // bordée quand la cible est dans l'arc du flanc et à portée
    const rel = normA(brg - nav.cap), flanc = Math.abs(Math.abs(rel) - Math.PI / 2) < 22 * RAD;
    if (flanc && dist < nav.def.portee * .95) { const c = rel > 0 ? -1 : 1; nav.bordee(c); }
  } else {
    // patrouille : un cap de croisière, rafraîchi doucement ; en duo, les suiveurs gardent la station derrière le meneur
    if (nav.chef && nav.chef.etat === 'navigue') { const c = nav.chef, f = avant(c.cap), tx = c.x - f[0] * (c.def.longueur * .9 + nav.def.longueur * .9) + (nav.decalX || 0), tz = c.z - f[1] * (c.def.longueur * .9 + nav.def.longueur * .9); const dx = tx - nav.x, dz = tz - nav.z; if (Math.hypot(dx, dz) > 10) nav.capVoulu = Math.atan2(-dx, -dz); else nav.capVoulu = c.cap; }
    else { nav.cooldownPatrouille = (nav.cooldownPatrouille || 0) - dt; if (nav.cooldownPatrouille <= 0) { nav.cooldownPatrouille = 18 + Math.random() * 20; const twa0 = (Math.random() - .5) * 2 * 140 * RAD + Math.PI * .5 * (Math.random() < .5 ? 1 : -1) * 0; nav.capVoulu = nav.cap + (Math.random() - .5) * 1.2; const tw = angleAuVent(nav.capVoulu, w.dir); if (Math.abs(tw) < 55) nav.capVoulu += (tw >= 0 ? 1 : -1) * 1.0; } }
  }
  // éloignement des navires proches (évitement de collision)
  for (const o of vivants) { if (o === nav) continue; const dx = o.x - nav.x, dz = o.z - nav.z, d = Math.hypot(dx, dz), mini = (nav.def.longueur + o.def.longueur) * .45; if (d < mini) { const brg = Math.atan2(-dx, -dz), rel = normA(brg - nav.cap); nav.capVoulu = nav.cap + (rel > 0 ? -1 : 1) * .6; } }
}
