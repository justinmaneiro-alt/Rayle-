// Équipage animé : matelots, officiers (tricorne, habit bleu), canonniers (bonnet rouge, bras nus), fusiliers de marine (habit rouge), marins dans les haubans, timonier à la roue,
// cuisinier, chirurgien, dormeurs dans leurs hamacs. Tous les hommes d'un navire (ou d'une salle) sont UN maillage instancié ; l'animation est calculée dans le vertex shader à partir de
// l'attribut par sommet « aPart » (tronc, jambes, bras, tête) et de la phase / activité / vitesse par instance : des centaines d'hommes pour quelques appels de dessin.
//   activités : 0 debout · 1 patrouille · 2 grimpe aux haubans · 3 sert un canon · 4 tient la barre · 5 observe à la lunette · 6 dort (couché) · 7 assis, écrit · 8 remue la marmite · 9 transporte
//   creerFoule(THREE, {postes, graine}) → { mesh, maj(t, combat), perte(frac), detruire() }   postes : [{x, y, z, yaw, a, type, vit?}]
//   creerEquipage(THREE, {nb, navire, q, graine}) : la foule d'un navire vu de l'extérieur
export const TYPES_EQUIPAGE = [
  { nom: 'matelot', chemise: 0xf2ecdc }, { nom: 'officier', chemise: 0x1f3b82 }, { nom: 'canonnier', chemise: 0xd9c9a8 }, { nom: 'fusilier', chemise: 0xb3282a },
  { nom: 'cuisinier', chemise: 0xe8e0cc }, { nom: 'chirurgien', chemise: 0x5a5148 }, { nom: 'capitaine', chemise: 0x14307a },
];
export function creerFoule(THREE, { postes, graine = 1 }) {
  const T = THREE, N = Math.max(1, postes.length);
  const pos = [], nor = [], col = [], part = [];
  const ajoute = (g, x, y, z, p, c) => { g = g.toNonIndexed(); const pp = g.attributes.position, nn = g.attributes.normal; for (let i = 0; i < pp.count; i++) { pos.push(pp.getX(i) + x, pp.getY(i) + y, pp.getZ(i) + z); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); col.push(c[0], c[1], c[2]); part.push(p); } };
  const boite = (w, h, d, x, y, z, p, c) => ajoute(new T.BoxGeometry(w, h, d), x, y, z, p, c);
  const B = [1, 1, 1], PEAU = [.95, .72, .55];
  boite(.42, .56, .24, 0, 1.12, 0, 0, B);
  boite(.17, .72, .2, -.11, .38, 0, 1, [.4, .42, .55]); boite(.17, .72, .2, .11, .38, 0, 2, [.4, .42, .55]);
  boite(.13, .6, .15, -.28, 1.1, 0, 3, PEAU); boite(.13, .6, .15, .28, 1.1, 0, 4, PEAU);
  ajoute(new T.CylinderGeometry(.15, .15, .22, 8), 0, 1.55, 0, 5, PEAU); boite(.34, .13, .34, 0, 1.73, 0, 5, [.2, .2, .22]);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setAttribute('aPart', new T.Float32BufferAttribute(part, 1));
  const mat = new T.MeshToonMaterial({ vertexColors: true, color: 0xffffff });
  const fase = new Float32Array(N), act = new Float32Array(N), vit = new Float32Array(N), amp = new Float32Array(N); g.setAttribute('aAmp', new T.InstancedBufferAttribute(amp, 1)); g.setAttribute('aFase', new T.InstancedBufferAttribute(fase, 1)); g.setAttribute('aAct', new T.InstancedBufferAttribute(act, 1)); g.setAttribute('aVit', new T.InstancedBufferAttribute(vit, 1));
  const uT = { value: 0 }, uC = { value: 0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = uT; sh.uniforms.uC = uC;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aFase; attribute float aAct; attribute float aVit; attribute float aAmp; uniform float uT; uniform float uC;')
      .replace('#include <begin_vertex>', `vec3 transformed=vec3(position); float ph0=uT*aVit*.3+aFase; float sens=cos(ph0)>0.?1.:-1.; if(aAmp>0.){ transformed.xz*=sens; transformed.z+=sin(ph0)*aAmp; }
float t=uT*aVit+aFase; float marche=(aAct<1.5&&aAct>.5)||aAct>8.5?1.:0.; float grimpe=aAct>1.5&&aAct<2.5?1.:0.; float canon=aAct>2.5&&aAct<3.5?1.:0.; float barre=aAct>3.5&&aAct<4.5?1.:0.; float lunette=aAct>4.5&&aAct<5.5?1.:0.; float dort=aAct>5.5&&aAct<6.5?1.:0.; float assis=aAct>6.5&&aAct<7.5?1.:0.; float cuit=aAct>7.5&&aAct<8.5?1.:0.;
float s=sin(t*5.5);
if(aPart>.5&&aPart<2.5){ float sg=aPart<1.5?1.:-1.; float a=s*sg*(marche*.7+grimpe*.9+.03)+assis*1.45; float y0=.74; transformed.y-=y0; float cy=cos(a), sy=sin(a); transformed.yz=vec2(transformed.y*cy-transformed.z*sy, transformed.y*sy+transformed.z*cy); transformed.y+=y0+grimpe*max(0.,sg*s)*.18-assis*.38; }
if(aPart>2.5&&aPart<4.5){ float sg=aPart<3.5?-1.:1.; float a=-s*sg*(marche*.6)+grimpe*(sg*s>0.?-2.6:-.6)+canon*(-1.3+sin(t*2.5+(sg>0.?1.5:0.))*.9*(1.-uC*.3)+uC*sin(t*9.)*.25)+barre*(-1.2+s*.12)+lunette*(sg>0.?-2.3:-.3)+cuit*(-1.1+sin(t*3.+(sg>0.?1.:0.))*.5)+assis*(sg>0.?-1.0+sin(t*7.)*.12:-.6); float y0=1.38; transformed.y-=y0; float cy=cos(a), sy=sin(a); transformed.yz=vec2(transformed.y*cy-transformed.z*sy, transformed.y*sy+transformed.z*cy); transformed.y+=y0-assis*.38; }
if(aPart<.5||aPart>4.5){ float pench=canon*(.22+.12*sin(t*2.5))+grimpe*.1+assis*.18; float y0=.8; transformed.y-=y0; float cy=cos(pench), sy=sin(pench); transformed.yz=vec2(transformed.y*cy-transformed.z*sy, transformed.y*sy+transformed.z*cy); transformed.y+=y0+abs(s)*.03*marche-assis*.38; }
if(dort>.5){ float a=-1.5708+sin(uT*.8+aFase)*.04; float y0=.7; transformed.y-=y0; float cy=cos(a), sy=sin(a); transformed.yz=vec2(transformed.y*cy-transformed.z*sy, transformed.y*sy+transformed.z*cy); transformed.y+=y0-.3; }`);
  };
  const im = new T.InstancedMesh(g, mat, N); im.frustumCulled = false; im.name = 'foule'; im.count = postes.length;
  const M = new T.Matrix4(), Q = new T.Quaternion(), V = new T.Vector3(), Sc = new T.Vector3(1, 1, 1), E = new T.Euler(), C = new T.Color();
  const rnd = (() => { let s = 77 + graine * 131; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  postes.forEach((p, i) => {
    E.set(0, p.yaw || 0, 0); Q.setFromEuler(E); V.set(p.x, p.y, p.z); M.compose(V, Q, Sc.set(p.s || 1, p.s || 1, p.s || 1)); im.setMatrixAt(i, M);
    C.setHex(TYPES_EQUIPAGE[p.type || 0].chemise); im.setColorAt(i, C); fase[i] = rnd() * 40; act[i] = p.a || 0; amp[i] = p.amp || 0; vit[i] = p.vit || (.7 + rnd() * .6);
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  let vivants = postes.length;
  return { mesh: im, maj(t, combat) { uT.value = t; uC.value = combat; }, perte(frac) { const k = Math.max(0, Math.min(postes.length, Math.round(postes.length * (1 - frac)))); if (k === vivants) return; vivants = k; im.count = k; }, detruire() { g.dispose(); mat.dispose(); im.dispose(); }, nb: postes.length };
}
export function creerEquipage(THREE, { nb, navire, q, graine = 1 }) {
  const S = navire.forme, P = navire.plan, rnd = (() => { let s = 77 + graine * 131; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const poste = [], hv = navire.dims.W, place = (u, dx, y, yaw, a, type, extra = {}) => poste.push(Object.assign({ x: dx, z: S.zDe(u), y, yaw, a, type }, extra));
  if (navire.type.id !== 'voilier') { place(.18, 0, S.yPont(.18) + .02, 0, 4, 0); place(.2, hv * .15, S.yPont(.2), Math.PI, 5, 1); } else place(.2, 0, S.yPont(.2), 0, 4, 0);
  const nCan = Math.min(nb - poste.length - 2, Math.floor((nb - poste.length) * .45));
  for (let i = 0; i < nCan; i++) { const sg = i % 2 ? 1 : -1, u = .26 + .5 * rnd(), xx = sg * (S.x(u, S.vDepuisY(u, S.yPont(u))) - .9 - rnd() * .5); place(u, xx, S.yPont(u), sg > 0 ? -Math.PI / 2 : Math.PI / 2, 3, 2); }
  const nH = Math.floor((nb - poste.length) * .3);
  for (let i = 0; i < nH; i++) { const m = P.masts[i % P.masts.length], sg = i % 2 ? 1 : -1, k = rnd(); place(m.u, sg * (S.x(m.u, 1) * .98 - k * m.hauteur * .02 - .1), S.yPont(m.u) + 2 + k * m.hauteur * .45, sg > 0 ? -Math.PI / 2 : Math.PI / 2, 2, 0, { z: S.zDe(m.u) + (rnd() - .5) * 1.2 }); }
  while (poste.length < nb) { const u = .08 + rnd() * .84, sg = rnd() < .5 ? -1 : 1, xx = sg * rnd() * Math.max(.3, S.x(u, S.vDepuisY(u, S.yPont(u))) - .8); place(u, xx, S.yPont(u), rnd() * 6.28, rnd() < .55 ? 1 : 0, rnd() < .2 ? 3 : rnd() < .12 ? 1 : 0); }
  return creerFoule(THREE, { postes: poste, graine });
}
