// Générateur de navires du XVIIIe siècle : coque galbée (carènes cuivrées, bandes de sabords), pont, gaillards, galerie de poupe, mâts à hunes, vergues, voiles carrées et auriques,
// beaupré, gouvernail, roue, haubans et enfléchures, pavillons de la nation, canons. Repère du navire : +x tribord, +y haut, avant = −z (poupe en +z), flottaison à y = 0.
// Tout est paramétrique (TYPES : voilier, brick, frégate, vaisseau ; NATIONS : France, Espagne, Angleterre, Portugal). Les fonctions de forme sont pures (testées).
//   formeCoque(type) → { demiLargeur(u), yQuille(u), yPont(u), y(u, v), x(u, v), ... } ; plan(type) → mâts, voiles, canons ; construireNavire(THREE, {type, nation, q, graine}) → ensemble de maillages
import { TYPES, NATIONS, dessinerPavillon, dessinerEmbleme } from '../donnees/navires.js?v=2026.10.14.5';
import { Fusion } from './fusion.js?v=2026.10.14.5';
import { matToon, contour } from './toon.js?v=2026.10.14.5';

const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cl = (x, a, b) => Math.max(a, Math.min(b, x));

/* ═════════ forme de la coque (pure) ═════════ */
// u : 0 à la poupe, 1 à l'étrave ; z = L (0,5 − u). v : 0 à la quille, 1 au sommet du pavois.
export function formeCoque(t) {
  const L = t.longueur, W = t.largeur, T = t.tirant, F = t.francBord, gros = t.ponts >= 2, haut = t.id !== 'voilier';
  const hq = t.id === 'vaisseau' ? 1.7 : t.id === 'fregate' ? 1.25 : t.id === 'brick' ? .7 : 0, hf = t.id === 'vaisseau' ? 1.3 : t.id === 'fregate' ? 1.0 : t.id === 'brick' ? .5 : 0, pavois = t.id === 'vaisseau' ? 1.15 : t.id === 'fregate' ? 1.0 : t.id === 'brick' ? .85 : .6;
  const sheer = Math.max(.4, F * .22);
  const demiLargeur = u => {
    const hw = W / 2; let k;
    if (u > .34) { const s = (u - .34) / .66; k = Math.pow(Math.max(0, 1 - Math.pow(s, 1.8)), .72); } else { const s = u / .34; k = .8 + .2 * Math.sin(s * Math.PI / 2); }
    return hw * k;
  };
  const yQuille = u => -T * (1 - .55 * lisse(.82, 1, u) - .35 * lisse(.14, 0, u));
  const yPont = u => F + sheer * (.55 * lisse(.7, 1, u) + .65 * lisse(.45, 0, u)) + hq * lisse(.36, .3, u) + hf * lisse(.8, .86, u);
  const yHaut = u => yPont(u) + pavois * (1 - .35 * lisse(.0, .12, u) * 0);
  // profil de la section : x(u, v) en fonction de la hauteur relative v (0 quille, 1 sommet du pavois)
  const vFlottaison = u => { const yk = yQuille(u), yh = yHaut(u); return cl((0 - yk) / (yh - yk), .2, .8); };
  const prof = (u, v) => {
    const vw = vFlottaison(u), tum = (gros ? .095 : .05) * (u < .8 ? 1 : .5);
    if (v <= vw) return .07 + .93 * Math.pow(Math.sin(Math.PI / 2 * (v / vw)), .85);
    return 1 - tum * Math.pow((v - vw) / (1 - vw), 1.3);
  };
  const y = (u, v) => yQuille(u) + (yHaut(u) - yQuille(u)) * v, x = (u, v) => demiLargeur(u) * prof(u, v);
  const vDepuisY = (u, yy) => cl((yy - yQuille(u)) / (yHaut(u) - yQuille(u)), 0, 1);
  return { L, W, T, F, hq, hf, pavois, demiLargeur, yQuille, yPont, yHaut, y, x, vDepuisY, vFlottaison, prof, zDe: u => L * (.5 - u), uDe: z => .5 - z / L };
}

/* ═════════ plan de mâture, voilure et artillerie (pur) ═════════ */
export function plan(t) {
  const H = t.hauteurMat, L = t.longueur, masts = [], voiles = [];
  const def = {
    sloop: [{ u: .5, h: 1 }],
    brick: [{ u: .66, h: .94 }, { u: .36, h: 1 }],
    'trois-mats': [{ u: .76, h: .92 }, { u: .5, h: 1 }, { u: .22, h: .8 }],
  }[t.rig];
  def.forEach((m, i) => masts.push({ idx: i, u: m.u, hauteur: H * m.h, rayon: Math.max(.12, t.largeur * .028) * (.7 + m.h * .3), nom: ['misaine', 'grand mât', 'artimon'][t.rig === 'brick' ? (i === 0 ? 0 : 1) : t.rig === 'sloop' ? 1 : i] }));
  // voiles carrées : rangées successives (basse voile, hunier, perroquet, cacatois) ; l'artimon n'a pas de basse voile carrée
  const rangs = t.id === 'vaisseau' ? 4 : t.id === 'fregate' ? 3 : t.id === 'brick' ? 3 : 0;
  const larg = [1, .8, .56, .36], haut = [.2, .19, .14, .1], posY = [.27, .5, .7, .85];
  masts.forEach((m, i) => {
    if (!rangs) return; const trois = t.rig === 'trois-mats', mizzen = trois && i === 2, facteur = trois ? [.9, 1, .62][i] : t.rig === 'brick' ? [.92, 1][i] : 1;
    for (let r = mizzen ? 1 : 0; r < rangs; r++) voiles.push({ type: 'carre', mat: i, rang: r, yVergue: m.hauteur * posY[r], largeur: L * .46 * facteur * larg[r] * (t.id === 'brick' ? 1.05 : 1), hauteur: m.hauteur * haut[r] * (mizzen ? .9 : 1), emb: r === 0 && !mizzen && i === (trois ? 1 : masts.length - 1) });
  });
  // voiles à corne (aurique) : artimon ou grand-voile ; focs entre le beaupré et le mât de misaine
  const dernier = masts[masts.length - 1];
  voiles.push({ type: 'aurique', mat: masts.length - 1, yBas: t.francBord * .6 + 2.2, yHaut: dernier.hauteur * (t.rig === 'sloop' ? .78 : .52), longueurBome: L * (t.rig === 'sloop' ? .34 : .26), longueurCorne: L * (t.rig === 'sloop' ? .28 : .2), rang: 0 });
  if (t.rig === 'sloop') voiles.push({ type: 'triangle', mat: 0, rang: 1, yPointe: dernier.hauteur * 1.0, yBas: dernier.hauteur * .8, largeur: L * .2 });
  const nFocs = t.rig === 'sloop' ? 2 : t.id === 'brick' ? 2 : 3; for (let k = 0; k < nFocs; k++) voiles.push({ type: 'foc', rang: k, mat: 0 });
  // artillerie : rangées de sabords par bord
  const rangees = t.id === 'vaisseau' ? [{ n: 14, dy: .9 }, { n: 14, dy: 2.55 }, { n: 9, dy: 4.15 }] : t.id === 'fregate' ? [{ n: 18, dy: 1.25 }] : t.id === 'brick' ? [{ n: 8, dy: 1.15 }] : [{ n: 3, dy: 1.0 }];
  return { masts, voiles, rangees, canonsParBord: rangees.reduce((s, r) => s + r.n, 0) };
}

/* ═════════ matériaux ═════════ */
const VS_VOILURE = `
attribute float aKind; attribute float aMast; attribute vec2 aPivot; attribute vec2 aUV; attribute float aRang; attribute float aSail; attribute float aDmg; attribute float aLarg; attribute float aEmb;
uniform float uT, uBillow, uFlutter, uTrim, uTack; uniform vec4 uCasse[3];            // uCasse[m] = (cassé 0/1, hauteur de la cassure, côté, angle)
varying vec3 vC; varying vec3 vP; varying vec2 vUV; varying float vDmg; varying float vKind; varying float vEmb; varying float vSail;
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
void main(){
  vec3 p=position; vC=color; vUV=aUV; vDmg=aDmg; vKind=aKind; vEmb=aEmb; vSail=aSail;
  // voile carrée : gonflement vers l'avant (−z) ; fanfare quand le vent est de face
  if(aKind>1.5 && aKind<2.5){ float b=sin(aUV.x*3.14159)*sin(aUV.y*3.14159); float fl=uFlutter*sin(uT*7.+aSail*3.1+aUV.x*9.)*.35; p.z-=(uBillow+fl)*aLarg*.16*b*(1.-aRang*.12); }
  else if(aKind>2.5){ float b=sin(aUV.x*3.14159)*sin(aUV.y*3.14159); float fl=uFlutter*sin(uT*6.+aSail*2.3+aUV.y*7.)*.35; p.x+=uTack*(abs(uBillow)+fl)*aLarg*.14*b; }
  // orientation des vergues et voiles (bras) autour du mât
  if(aKind>.5){ vec2 d=p.xz-aPivot; d=rot(uTrim)*d; p.xz=aPivot+d; }
  // mât cassé : tout ce qui est au-dessus de la cassure bascule et tombe
  int m=int(aMast+.5); vec4 cs=vec4(0.); if(m==0) cs=uCasse[0]; else if(m==1) cs=uCasse[1]; else if(m==2) cs=uCasse[2];
  if(aMast>-.5 && cs.x>.5 && position.y>cs.y){ vec3 o=vec3(aPivot.x,cs.y,aPivot.y); vec3 q=p-o; float a=cs.w; float ca=cos(a), sa=sin(a); q=vec3(q.x*ca+cs.z*q.y*sa, -cs.z*q.x*sa+q.y*ca, q.z); p=o+q; p.y-=max(0.,a-1.2)*3.; }
  vP=(modelMatrix*vec4(p,1.)).xyz;
  gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);
}`;
const FS_VOILURE = `
precision highp float;
varying vec3 vC; varying vec3 vP; varying vec2 vUV; varying float vDmg; varying float vKind; varying float vEmb; varying float vSail;
uniform vec3 uSun, uAmb, uCouleurVoile, uSunCol; uniform sampler2D uEmb; uniform float uHasEmb, uLanterne;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec3 n=normalize(cross(dFdx(vP),dFdy(vP))); if(!gl_FrontFacing) n=-n;
  vec3 col=vC;
  bool voile=vKind>1.5;
  if(voile){
    float g=vDmg; float tr=n2(vUV*vec2(9.,7.)+vSail*13.)*.6+n2(vUV*23.+vSail)*.4;
    if(tr<g*.78) discard;
    if(tr<g*.78+.06*g) col=vec3(.1,.07,.05);
    if(vEmb>.5 && uHasEmb>.5){ vec4 e=texture2D(uEmb,vec2(vUV.x,vUV.y)); col=mix(col,e.rgb,e.a*.95); }
    // coutures
    float cs=step(.965,fract(vUV.x*6.))*.12; col*=1.-cs;
  }
  float l=dot(n,normalize(uSun))*.5+.5; float band=floor(l*3.)/3.;                 // 3 paliers de lumière
  vec3 lum=uAmb+uSunCol*(.35+.75*band);
  gl_FragColor=vec4(col*lum*(voile?1.:1.),1.);
  #include <colorspace_fragment>
}`;
const VS_DRAPEAU = `
attribute float aMast; uniform float uT, uVent, uSens; varying vec2 vUv; varying float vO;
void main(){ vUv=uv; float k=uv.x; vec3 p=position; float a=sin(uT*(3.+uVent*.8)-k*(5.+uVent*.4)+position.y*1.7)*.16*k*(.4+uVent*.1); p.z+=a*uSens; p.y+=sin(uT*2.2-k*3.)*.05*k; vO=a; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const FS_DRAPEAU = `
precision highp float; uniform sampler2D uMap; uniform vec3 uCouleur; uniform float uUseMap; varying vec2 vUv; varying float vO;
void main(){ vec4 c=uUseMap>.5?texture2D(uMap,vUv):vec4(uCouleur,1.); c.rgb*=.84+vO*.9; c.rgb=floor(c.rgb*7.+.5)/7.; gl_FragColor=vec4(c.rgb,1.);
#include <colorspace_fragment>
}`;

/* ═════════ construction ═════════ */
export function construireNavire(THREE, { type: tid, nation: nid, q, graine = 1 }) {
  const t = TYPES[tid], N = NATIONS[nid], S = formeCoque(t), P = plan(t), L = t.longueur;
  const groupe = new THREE.Group(); groupe.name = 'navire-' + nid + '-' + tid;
  const libres = [], vec = (x, y, z) => new THREE.Vector3(x, y, z), couleur = c => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
  const rnd = (() => { let s = 1234 + graine * 7919; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const cCoque = couleur(N.coque), cBande = couleur(N.bande), cCuivre = couleur(0x5c8a62), cPont = couleur(0xb98f5a), cBois = couleur(0x6b4a2c), cBoisClair = couleur(0x9b7040), cNoir = couleur(0x15100b), cOr = couleur(0xd9a62e);
  const mx = (px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(vec(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), vec(sx, sy, sz));
  const geo = g => { libres.push(g); return g; };

  /* ───── coque : grille de stations × sections, bâbord et tribord ───── */
  const NU = q.lod >= 2 ? 30 : 46, NV = 14, fusC = new Fusion(THREE);
  const pts = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU; const ligne = [];
    for (let k = 0; k <= 2 * NV; k++) { const side = k <= NV ? 1 : -1, v = k <= NV ? 1 - k / NV : (k - NV) / NV; ligne.push([side * S.x(u, v), S.y(u, v), S.zDe(u), v]); }
    pts.push(ligne);
  }
  const pos = [], col = [], cn = [];
  const couleurCoque = (y, side) => {
    if (y < -.12) return cCuivre;                                              // carène doublée de cuivre
    if (y < .08) return cNoir;
    for (const r of P.rangees) { const yr = S.F - r.dy; if (Math.abs(y - yr) < .62) return cBande; }
    return cCoque;
  };
  for (let i = 0; i <= NU; i++) for (let k = 0; k <= 2 * NV; k++) { const p = pts[i][k]; pos.push(p[0], p[1], p[2]); const c = couleurCoque(p[1], p[0]); col.push(c[0], c[1], c[2]); }
  for (let i = 0; i < NU; i++) for (let k = 0; k < 2 * NV; k++) { const a = i * (2 * NV + 1) + k, b = a + 1, c = a + 2 * NV + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const gCoque = geo(new THREE.BufferGeometry()); gCoque.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gCoque.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gCoque.setIndex(idx); gCoque.computeVertexNormals();
  // le dessin des bandes doit rester net : on duplique les sommets (non indexé) puis normales à plat par facette en haut, lisses en bas — on garde l'indexé pour la douceur
  const mCoque = matToon(THREE, 0xffffff, { vertexColors: true, side: THREE.DoubleSide }); libres.push(mCoque);
  const coque = new THREE.Mesh(gCoque, mCoque); coque.name = 'coque'; groupe.add(coque);
  if (q.contours) contour(THREE, coque, Math.max(.05, L * .0016), 0x140d08);

  /* ───── pont, gaillards, miroir de poupe, galerie, gouvernail, beaupré ───── */
  const fusP = new Fusion(THREE);                                                // pièces en bois : couleurs par sommet
  // pont : bande continue de bord à bord
  { const g = new THREE.BufferGeometry(), p = [], c = [], ix = []; const NS = 3;
    for (let i = 0; i <= NU; i++) { const u = i / NU, hx = S.x(u, 1) * .97; for (let s = 0; s <= NS; s++) { const xx = (s / NS * 2 - 1) * hx; p.push(xx, S.yPont(u) - .04, S.zDe(u)); const pl = (Math.floor(Math.abs(xx) / .28) % 2) ? cPont : [cPont[0] * .86, cPont[1] * .86, cPont[2] * .86]; c.push(pl[0], pl[1], pl[2]); } }
    for (let i = 0; i < NU; i++) for (let s = 0; s < NS; s++) { const a = i * (NS + 1) + s, b = a + 1, cc = a + NS + 1, d = cc + 1; ix.push(a, b, cc, b, d, cc); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(ix); g.computeVertexNormals(); libres.push(g);
    const m = matToon(THREE, 0xffffff, { vertexColors: true, side: THREE.DoubleSide }); libres.push(m); const pont = new THREE.Mesh(g, m); pont.name = 'pont'; groupe.add(pont); }
  // miroir de poupe : plan vertical avec fenêtres
  { const u = 0, zs = S.zDe(0) + .02, hxB = S.x(0, 1), yb = S.yQuille(0) + .3, yh = S.yHaut(0);
    const g = geo(new THREE.PlaneGeometry(hxB * 2, yh - yb)); fusP.ajouter(g, { matrice: mx(0, (yb + yh) / 2, zs), couleur: cCoque });
    if (t.id !== 'voilier') {
      const rangs = t.id === 'vaisseau' ? 3 : t.id === 'fregate' ? 2 : 1, nF = t.id === 'vaisseau' ? 7 : t.id === 'fregate' ? 5 : 3, fw = Math.min(1.0, hxB * 1.5 / nF), fh = t.id === 'vaisseau' ? .95 : .75;
      for (let r = 0; r < rangs; r++) for (let k = 0; k < nF; k++) { const x = (k - (nF - 1) / 2) * (hxB * 1.7 / nF), y = S.yHaut(0) - .8 - r * (fh + .45) - 1.0; fusP.ajouter(geo(new THREE.PlaneGeometry(fw, fh)), { matrice: mx(x, y, zs + .03), couleur: couleur(0xffe9a3) }); fusP.ajouter(geo(new THREE.PlaneGeometry(fw * 1.2, fh * 1.18)), { matrice: mx(x, y, zs + .015), couleur: cOr }); }
      fusP.ajouter(geo(new THREE.PlaneGeometry(hxB * 1.95, .22)), { matrice: mx(0, S.yHaut(0) - .25, zs + .03), couleur: cOr });
    }
    // gouvernail
    fusP.ajouter(geo(new THREE.BoxGeometry(.18, t.tirant * .95, 1.9)), { matrice: mx(0, -t.tirant * .45, S.zDe(0) + .55, .0, 0, 0), couleur: cBois }); }
  // galerie de poupe (balcons) pour les grands navires
  if (t.id === 'vaisseau' || t.id === 'fregate') for (const sg of [-1, 1]) fusP.ajouter(geo(new THREE.BoxGeometry(.5, .16, 1.9)), { matrice: mx(sg * (S.x(.02, 1) + .1), S.yPont(.02) - .5, S.zDe(.02) - .6), couleur: cOr });
  // beaupré (mât oblique de l'étrave), cabestan, bossoirs, chaloupe
  const tete = S.zDe(1) - 0; const beau = L * .25;
  fusP.ajouter(geo(new THREE.CylinderGeometry(t.largeur * .016, t.largeur * .028, beau, 10)), { matrice: mx(0, S.yPont(.98) + beau * .17 * .5 + .3, S.zDe(.98) - beau * .46, Math.PI / 2 + .3 + (0), 0, 0), couleur: cBois });
  fusP.ajouter(geo(new THREE.SphereGeometry(Math.max(.32, L * .007), 10, 8)), { matrice: mx(0, S.yPont(.99) - .5, S.zDe(1) + .15, 0, 0, 0, .9, 1.2, 1.8), couleur: cOr });           // figure de proue
  const pointeBeaupre = vec(0, S.yPont(.98) + .3 + Math.sin(.3) * beau * .93, S.zDe(.98) - Math.cos(.3) * beau * .93);
  // roue de barre et habitacle (gaillard d'arrière)
  if (t.id !== 'voilier') { const yr = S.yPont(.2); fusP.ajouter(geo(new THREE.TorusGeometry(.55, .05, 6, 18)), { matrice: mx(0, yr + 1.0, S.zDe(.18), 0, 0, 0), couleur: cBois }); for (let k = 0; k < 8; k++) fusP.ajouter(geo(new THREE.CylinderGeometry(.025, .025, 1.3, 5)), { matrice: mx(0, yr + 1.0, S.zDe(.18), 0, 0, k * Math.PI / 8), couleur: cBois }); fusP.ajouter(geo(new THREE.BoxGeometry(.5, 1.0, .5)), { matrice: mx(0, yr + .5, S.zDe(.15) + .1), couleur: cBoisClair }); }
  // chaloupe sur le pont, panneaux d'écoutille, cabestan
  if (t.id === 'fregate' || t.id === 'vaisseau') { fusP.ajouter(geo(new THREE.BoxGeometry(t.largeur * .22, .8, L * .16)), { matrice: mx(0, S.yPont(.58) + .45, S.zDe(.58)), couleur: cBoisClair }); fusP.ajouter(geo(new THREE.CylinderGeometry(.5, .6, 1.1, 12)), { matrice: mx(0, S.yPont(.62) + .55, S.zDe(.64)), couleur: cBois }); }
  for (const u of [.4, .54, .66]) if (t.id !== 'voilier') fusP.ajouter(geo(new THREE.BoxGeometry(t.largeur * .24, .22, t.largeur * .2)), { matrice: mx(0, S.yPont(u) + .08, S.zDe(u)), couleur: cBois });
  const gBois = fusP.construire(); libres.push(gBois);
  const mBois = matToon(THREE, 0xffffff, { vertexColors: true, side: THREE.DoubleSide }); libres.push(mBois); const bois = new THREE.Mesh(gBois, mBois); bois.name = 'bois'; groupe.add(bois);
  if (q.contours) contour(THREE, bois, Math.max(.04, L * .0012), 0x140d08);

  /* ───── sabords (décalques sombres) et fût des canons ───── */
  const fusS = new Fusion(THREE), sabords = [];
  P.rangees.forEach((r, ri) => {
    const yr = S.F - r.dy, esp = (L * .56) / Math.max(1, r.n - 1), w = Math.min(.78, esp * .3), h = w * .85;
    for (const sg of [1, -1]) for (let i = 0; i < r.n; i++) {
      const u = .2 + (r.n === 1 ? .3 : i / (r.n - 1) * .6) * (r.n === 1 ? 1 : 1) , v = S.vDepuisY(u, yr), x = sg * S.x(u, v) * 1.004, pt = vec(x, S.y(u, v), S.zDe(u));
      fusS.ajouter(geo(new THREE.PlaneGeometry(w, h)), { matrice: mx(pt.x + sg * .015, pt.y, pt.z, 0, sg * Math.PI / 2, 0), couleur: couleur(0x1b0f0a) });
      sabords.push({ cote: sg, rangee: ri, i, pos: pt, normale: vec(sg, 0, 0) });
    }
  });
  const gSab = fusS.construire(); libres.push(gSab); const mSab = matToon(THREE, 0xffffff, { vertexColors: true, side: THREE.DoubleSide }); libres.push(mSab); const sabordsMesh = new THREE.Mesh(gSab, mSab); sabordsMesh.name = 'sabords'; groupe.add(sabordsMesh);
  // canons : un maillage instancié, tube cylindrique dont la sortie est animée (attribut aOut)
  const nCan = sabords.length, gCan = geo(new THREE.CylinderGeometry(.1 + L * .0007, .15 + L * .001, 1.6 + L * .01, 12)); gCan.rotateX(Math.PI / 2); gCan.translate(0, 0, .0);
  const mCan = new THREE.MeshToonMaterial({ color: 0x1b1b1e }); libres.push(mCan);
  const aOut = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, nCan)).fill(-.6), 1); gCan.setAttribute('aOut', aOut);
  mCan.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aOut;').replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.z += aOut;'); };
  const canons = new THREE.InstancedMesh(gCan, mCan, Math.max(1, nCan)); canons.name = 'canons'; canons.frustumCulled = false;
  { const m = new THREE.Matrix4(); sabords.forEach((s, i) => { m.compose(vec(s.pos.x, s.pos.y, s.pos.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.cote > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), vec(1, 1, 1)); canons.setMatrixAt(i, m); }); canons.instanceMatrix.needsUpdate = true; }
  gCan.attributes.aOut = aOut; groupe.add(canons);
  const infoCanons = { nb: nCan, sabords, aOut, mesh: canons };

  /* ───── voilure : mâts, hunes, vergues, voiles (un seul maillage, animé dans le shader) ───── */
  const fusV = new Fusion(THREE, { aKind: 1, aMast: 1, aPivot: 2, aUV: 2, aRang: 1, aSail: 1, aDmg: 1, aLarg: 1, aEmb: 1 });
  const baseDonnees = { aKind: 0, aMast: -1, aPivot: [0, 0], aUV: [0, 0], aRang: 0, aSail: 0, aDmg: 0, aLarg: 1, aEmb: 0 };
  const voilesInfo = []; let nSail = 0; const cVoile = couleur(N.voile), cVoileOmbre = [cVoile[0] * .94, cVoile[1] * .94, cVoile[2] * .94];
  const matInfo = [];
  P.masts.forEach(m => {
    const zm = S.zDe(m.u), yd = S.yPont(m.u), h = m.hauteur, r0 = m.rayon, don = (extra = {}) => Object.assign({}, baseDonnees, { aKind: 0, aMast: m.idx, aPivot: [0, zm] }, extra);
    // mât en trois tronçons (bas-mât, mât de hune, mât de perroquet) effilés
    const segs = [[0, .56, 1, .8], [.5, .82, .72, .55], [.78, 1.0, .5, .3]];
    for (const [a, b, ra, rb] of segs) { const hh = (b - a) * h; fusV.ajouter(geo(new THREE.CylinderGeometry(r0 * rb, r0 * ra, hh, 10)), { matrice: mx(0, yd + a * h + hh / 2, zm), couleur: cBois, donnees: don() }); }
    // hune (plate-forme) et chouquet
    fusV.ajouter(geo(new THREE.CylinderGeometry(r0 * 3.3, r0 * 3.3, .14, 14)), { matrice: mx(0, yd + .54 * h, zm), couleur: cBoisClair, donnees: don() });
    if (h > 24) fusV.ajouter(geo(new THREE.CylinderGeometry(r0 * 2.3, r0 * 2.3, .12, 12)), { matrice: mx(0, yd + .8 * h, zm), couleur: cBoisClair, donnees: don() });
    matInfo.push({ idx: m.idx, zm, yd, h, r0, yCasse: yd + h * .42 });
  });
  P.voiles.forEach(vl => {
    const m = P.masts[Math.min(vl.mat, P.masts.length - 1)], zm = S.zDe(m.u), yd = S.yPont(m.u), don = (extra = {}) => Object.assign({}, baseDonnees, { aMast: m.idx, aPivot: [0, zm] }, extra);
    const sid = ++nSail;
    if (vl.type === 'carre') {
      const yv = yd + vl.yVergue, w = vl.largeur, hs = vl.hauteur;
      // vergue
      fusV.ajouter(geo(new THREE.CylinderGeometry(m.rayon * .42, m.rayon * .55, w * 1.06, 8)), { matrice: mx(0, yv, zm - m.rayon * 1.2, 0, 0, Math.PI / 2), couleur: cBois, donnees: don({ aKind: 1 }) });
      // voile : plan 12×9 légèrement trapézoïdal, accroché à la vergue
      const g = geo(new THREE.PlaneGeometry(1, 1, 12, 9)), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const gu = p.getX(i) + .5, gv = .5 - p.getY(i); const ech = 1 + .12 * gv; p.setXYZ(i, (gu - .5) * w * ech * .95, -gv * hs, 0); }
      g.computeVertexNormals();
      fusV.ajouter(g, { matrice: mx(0, yv - .1, zm - m.rayon * 1.3), couleur: (i, x, y) => cVoile, donnees: { aKind: 2, aMast: m.idx, aPivot: [0, zm], aUV: (i, x, y, z, u, v) => [u, 1 - v], aRang: vl.rang, aSail: sid, aDmg: 0, aLarg: w, aEmb: vl.emb ? 1 : 0 } });
      voilesInfo.push({ id: sid, type: 'carre', mat: m.idx, rang: vl.rang, largeur: w, hauteur: hs, pivotY: yv - hs * .5, z: zm });
    } else if (vl.type === 'aurique') {
      // grand-voile à corne : quadrilatère dans le plan longitudinal, bome en bas, corne en haut
      const yb = yd + vl.yBas, yh = yd + vl.yHaut, zA = zm + vl.longueurBome, zC = zm + vl.longueurCorne;
      fusV.ajouter(geo(new THREE.CylinderGeometry(m.rayon * .4, m.rayon * .48, vl.longueurBome, 8)), { matrice: mx(0, yb, zm + vl.longueurBome / 2 - .3, Math.PI / 2, 0, 0), couleur: cBois, donnees: don({ aKind: 1 }) });
      fusV.ajouter(geo(new THREE.CylinderGeometry(m.rayon * .3, m.rayon * .4, vl.longueurCorne, 8)), { matrice: mx(0, (yh + yb) / 2 + (yh - yb) * .2, zm + vl.longueurCorne / 2, Math.PI / 2 - .5, 0, 0), couleur: cBois, donnees: don({ aKind: 1 }) });
      const g = geo(new THREE.PlaneGeometry(1, 1, 10, 10)), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = p.getX(i) + .5, b = p.getY(i) + .5; const x = 0, z = zm + .15 + a * (vl.longueurBome * (1 - b * .25) + (zC - zm) * b * .5), y = yb + b * (yh - yb) * (1 - a * .12); p.setXYZ(i, x, y, z); }
      g.computeVertexNormals();
      fusV.ajouter(g, { couleur: cVoile, donnees: { aKind: 3, aMast: m.idx, aPivot: [0, zm], aUV: (i, x, y, z, u, v) => [u, v], aRang: 0, aSail: sid, aDmg: 0, aLarg: vl.longueurBome * .9, aEmb: 0 } });
      voilesInfo.push({ id: sid, type: 'aurique', mat: m.idx, largeur: vl.longueurBome, hauteur: yh - yb, pivotY: (yb + yh) / 2, z: zm + vl.longueurBome * .5 });
    } else if (vl.type === 'triangle') {
      const g = geo(new THREE.PlaneGeometry(1, 1, 6, 6)), p = g.attributes.position, yb = yd + vl.yBas, yh = yd + vl.yPointe; for (let i = 0; i < p.count; i++) { const a = p.getX(i) + .5, b = p.getY(i) + .5; p.setXYZ(i, 0, yb + b * (yh - yb), zm + .2 + a * vl.largeur * (1 - b)); } g.computeVertexNormals();
      fusV.ajouter(g, { couleur: cVoile, donnees: { aKind: 3, aMast: m.idx, aPivot: [0, zm], aUV: (i, x, y, z, u, v) => [u, v], aRang: 1, aSail: sid, aDmg: 0, aLarg: vl.largeur, aEmb: 0 } });
      voilesInfo.push({ id: sid, type: 'triangle', mat: m.idx, largeur: vl.largeur, hauteur: yh - yb, pivotY: (yb + yh) / 2, z: zm + vl.largeur * .4 });
    } else if (vl.type === 'foc') {
      // focs : triangles entre le beaupré et le mât de misaine, de plus en plus hauts vers l'étrave
      const mF = P.masts[0], zF = S.zDe(mF.u), yF = S.yPont(mF.u), k = vl.rang, hautF = mF.hauteur * (.52 - k * .06), yb = S.yPont(.95) + 1.2 + k * .6;
      const g = geo(new THREE.PlaneGeometry(1, 1, 6, 6)), p = g.attributes.position, zTete = zF - .4 - k * .5, zPied = pointeBeaupre.z * (.92 - k * .16), yTete = yF + hautF * (1 - k * .06);
      for (let i = 0; i < p.count; i++) { const a = p.getX(i) + .5, b = p.getY(i) + .5; p.setXYZ(i, 0, yb + b * (yTete - yb), zPied + (zTete - zPied) * b + a * 0 * 1); } // ligne : base (a) le long du bord de fuite
      for (let i = 0; i < p.count; i++) { const a = p.getX(i) + .5, b = p.getY(i) + .5, zc = zPied + (zTete - zPied) * b; p.setXYZ(i, 0, yb + b * (yTete - yb), zc + a * (zF + 1.5 - zc) * (1 - b * .9)); }
      g.computeVertexNormals();
      fusV.ajouter(g, { couleur: cVoileOmbre, donnees: { aKind: 3, aMast: -1, aPivot: [0, 0], aUV: (i, x, y, z, u, v) => [u, v], aRang: 2, aSail: sid, aDmg: 0, aLarg: Math.abs(zF - zPied) * .6, aEmb: 0 } });
      voilesInfo.push({ id: sid, type: 'foc', mat: -1, largeur: Math.abs(zF - zPied) * .6, hauteur: yTete - yb, pivotY: (yb + yTete) / 2, z: (zPied + zF) / 2 });
    }
  });
  const gVoilure = fusV.construire(); libres.push(gVoilure);
  const cv = document.createElement('canvas'); let texEmb = null; if (N.emblemeVoile) { dessinerEmbleme(cv, N.emblemeVoile); texEmb = new THREE.CanvasTexture(cv); texEmb.colorSpace = THREE.SRGBColorSpace; libres.push(texEmb); }
  const uni = { uT: { value: 0 }, uBillow: { value: .7 }, uFlutter: { value: 0 }, uTrim: { value: 0 }, uTack: { value: 1 }, uCasse: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uAmb: { value: new THREE.Vector3(.5, .5, .55) }, uSunCol: { value: new THREE.Vector3(1, .95, .85) }, uCouleurVoile: { value: new THREE.Color(N.voile) }, uEmb: { value: texEmb }, uHasEmb: { value: texEmb ? 1 : 0 }, uLanterne: { value: 0 } };
  const mVoilure = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS_VOILURE, fragmentShader: FS_VOILURE, side: THREE.DoubleSide, vertexColors: true }); libres.push(mVoilure);
  const voilure = new THREE.Mesh(gVoilure, mVoilure); voilure.name = 'voilure'; voilure.frustumCulled = false; groupe.add(voilure);

  /* ───── gréement : haubans, enfléchures, étais (traits fins) ───── */
  const lignes = [], lignesParMat = [];
  P.masts.forEach(m => {
    const zm = S.zDe(m.u), yd = S.yPont(m.u), h = m.hauteur, pts = [], uh = m.u;
    const nH = t.id === 'voilier' ? 3 : t.id === 'brick' ? 4 : 6, hunne = yd + .54 * h, rayon = m.rayon * 3;
    for (const sg of [-1, 1]) {
      const bords = []; for (let k = 0; k < nH; k++) { const u2 = uh + (k - (nH - 1) / 2) * .014 * (L / 46 + .5), xb = sg * S.x(u2, S.vDepuisY(u2, S.yPont(u2))) * .98, yb = S.yPont(u2) + .15, zb = S.zDe(u2); const zt = zm + (k - (nH - 1) / 2) * rayon * .5; pts.push(sg * rayon * .6, hunne, zt, xb, yb, zb); bords.push([xb, yb, zb, sg * rayon * .6, hunne, zt]); }
      // enfléchures : barreaux entre deux haubans voisins
      for (let k = 0; k < nH - 1; k++) for (let e = 1; e <= (t.id === 'voilier' ? 4 : 9); e++) { const a = e / ((t.id === 'voilier' ? 4 : 9) + 1), A = bords[k], B = bords[k + 1]; pts.push(A[0] + (A[3] - A[0]) * (1 - a) * 0 + (A[3] - A[0]) * a * .85 + (A[0] - A[0]), A[1] + (A[4] - A[1]) * a * .85, A[2] + (A[5] - A[2]) * a * .85, B[0] + (B[3] - B[0]) * a * .85, B[1] + (B[4] - B[1]) * a * .85, B[2] + (B[5] - B[2]) * a * .85); }
      // galhaubans vers l'arrière
      pts.push(sg * rayon * .4, yd + .78 * h, zm, sg * S.x(uh + .07, S.vDepuisY(uh + .07, S.yPont(uh + .07))), S.yPont(uh + .07) + .2, S.zDe(uh + .07));
    }
    // étais : du haut du mât vers l'avant (mât suivant ou beaupré)
    const suiv = P.masts[m.idx - 1]; if (suiv) pts.push(0, yd + .8 * h, zm - m.rayon, 0, S.yPont(suiv.u) + suiv.hauteur * .3, S.zDe(suiv.u)); else pts.push(0, yd + .85 * h, zm - m.rayon, pointeBeaupre.x, pointeBeaupre.y, pointeBeaupre.z);
    lignes.push(...pts); lignesParMat.push(pts.length / 6);
  });
  const gL = geo(new THREE.BufferGeometry()); gL.setAttribute('position', new THREE.Float32BufferAttribute(lignes, 3));
  const mL = new THREE.LineBasicMaterial({ color: 0x1e140c, transparent: true, opacity: .9 }); libres.push(mL); const gr = new THREE.LineSegments(gL, mL); gr.name = 'greement'; gr.frustumCulled = false; groupe.add(gr);

  /* ───── pavillons : pavillon de poupe, flammes de tête de mât, guidon ───── */
  const drapeaux = [], uV = { uT: { value: 0 }, uVent: { value: 5 }, uSens: { value: 1 } };
  const cvF = document.createElement('canvas'); dessinerPavillon(cvF, N.drapeau); const texF = new THREE.CanvasTexture(cvF); texF.colorSpace = THREE.SRGBColorSpace; libres.push(texF);
  const matF = new THREE.ShaderMaterial({ uniforms: Object.assign({ uMap: { value: texF }, uCouleur: { value: new THREE.Color(1, 1, 1) }, uUseMap: { value: 1 } }, uV), vertexShader: VS_DRAPEAU, fragmentShader: FS_DRAPEAU, side: THREE.DoubleSide }); libres.push(matF);
  { const w = Math.max(1.7, L * .075), g = geo(new THREE.PlaneGeometry(w, w * .62, 12, 6)); g.translate(w / 2, 0, 0); const f = new THREE.Mesh(g, matF); f.position.set(0, S.yHaut(.02) + (t.id === 'voilier' ? 3.2 : 4.4 + L * .02), S.zDe(.0) + .5); f.name = 'pavillon'; groupe.add(f); drapeaux.push(f);
    fusP.ajouter(geo(new THREE.CylinderGeometry(.045, .06, 3.2 + L * .02, 6)), { matrice: mx(0, S.yHaut(.02) + 1.6 + L * .01, S.zDe(0) + .5), couleur: cBois });
    // mât de pavillon à la poupe : ajouté au bois via un petit maillage
    const pm = new THREE.Mesh(geo(new THREE.CylinderGeometry(.045, .06, 3.6 + L * .022, 6)), mBois); pm.material = matToon(THREE, 0x6b4a2c); libres.push(pm.material); pm.position.set(0, S.yHaut(.02) + (3.6 + L * .022) / 2, S.zDe(0) + .5); groupe.add(pm); }
  P.masts.forEach(m => { const zm = S.zDe(m.u), yt = S.yPont(m.u) + m.hauteur, len = Math.max(2, L * .09), g = geo(new THREE.PlaneGeometry(len, len * .09, 10, 2)); g.translate(len / 2, 0, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: Object.assign({ uMap: { value: texF }, uCouleur: { value: new THREE.Color(N.flamme[m.idx % 2]) }, uUseMap: { value: 0 } }, uV), vertexShader: VS_DRAPEAU, fragmentShader: FS_DRAPEAU, side: THREE.DoubleSide }); libres.push(mat);
    const f = new THREE.Mesh(g, mat); f.position.set(0, yt + .5, zm); f.name = 'flamme'; groupe.add(f); drapeaux.push(f); });

  // bois : les mâts de pavillon sont fusionnés à l'init ci-dessus ; rien d'autre à ajouter
  libres.push(mBois);

  /* ───── instrumentation : éclairage commun et poses ───── */
  const lumiere = { sun: uni.uSun.value, amb: uni.uAmb.value, sunCol: uni.uSunCol.value };
  const dims = { L, W: t.largeur, T: t.tirant, F: t.francBord, yPontMax: S.yPont(0) };
  function detruire() { for (const x of libres) { try { x.dispose && x.dispose(); } catch (e) { /* déjà libéré */ } } }
  return { groupe, type: t, nation: N, forme: S, plan: P, coque, bois, sabordsMesh, voilure, uni, uV, drapeaux, canons: infoCanons, voilesInfo, matInfo, lumiere, dims, detruire, gGreement: gr, pointeBeaupre, gVoilure };
}
