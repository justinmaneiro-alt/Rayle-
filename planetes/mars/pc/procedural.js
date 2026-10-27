import * as THREE from 'three';
import { fbm2, alea, hash2 } from './mars-calcul.js';

/* ═════════════ TEXTURES ET FORMES GÉNÉRÉES PAR CODE ═════════════
   Aucun fichier d'image : tout est dessiné ici (canvas 2D) à partir de bruits reproductibles. Pas de licence à respecter, pas de téléchargement,
   et la qualité s'adapte en changeant `taille`. Seule la texture de la planète vue de l'espace vient des fichiers de la galaxie (Solar System Scope, CC BY 4.0). */
const toile = t => { const c = document.createElement('canvas'); c.width = c.height = t; return c; };
function tex(c, { repeter = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeter) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
/* Parcourt les pixels d'une toile et remplit chacun avec f(x, y) → [r, g, b] (0..255). Le bruit est périodique : la texture se raccorde. */
function remplir(c, f) {
  const ctx = c.getContext('2d'), n = c.width, img = ctx.createImageData(n, n), d = img.data;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [r, g, b] = f(x / n, y / n); const i = (y * n + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0); return ctx;
}
/* Bruit qui se raccorde sur lui-même (mélange de 4 échantillons décalés). */
function bruitPeriodique(u, v, freq, oct, graine) {
  const a = fbm2(u * freq, v * freq, oct, graine), b = fbm2((u - 1) * freq, v * freq, oct, graine), c = fbm2(u * freq, (v - 1) * freq, oct, graine), d = fbm2((u - 1) * freq, (v - 1) * freq, oct, graine);
  return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v);
}

/* Sol martien : poussière ocre-rouille, cailloux, traînées. */
export function texSol(taille = 512, graine = 3) {
  const c = toile(taille);
  remplir(c, (u, v) => {
    const g = bruitPeriodique(u, v, 9, 5, graine), f = bruitPeriodique(u, v, 40, 3, graine + 7), r = hash2(Math.floor(u * taille), Math.floor(v * taille), graine);
    const k = 0.62 + g * 0.5 + (f - 0.5) * 0.35 + (r - 0.5) * 0.08;
    return [Math.min(255, 150 * k + 30), Math.min(255, 84 * k + 14), Math.min(255, 52 * k + 8)];
  });
  return tex(c);
}
/* Plateforme de la base : régolithe tassé, traces de roues, grands cercles et chevrons d'atterrissage. Sert aussi de marque au sol (échelle 1 = 2 × rayon). */
export function texPlateforme(taille = 1024, graine = 5) {
  const c = toile(taille);
  const ctx = remplir(c, (u, v) => {
    const g = fbm2(u * 14, v * 14, 5, graine), f = fbm2(u * 70, v * 70, 3, graine + 3), x = (u - 0.5) * 2, y = (v - 0.5) * 2, r = Math.hypot(x, y);
    const k = 0.42 + g * 0.35 + (f - 0.5) * 0.12;
    return [Math.min(255, 118 * k + 16), Math.min(255, 78 * k + 12), Math.min(255, 62 * k + 10)];
  });
  const m = taille / 2;
  ctx.lineWidth = taille * 0.004; ctx.strokeStyle = 'rgba(190,225,240,0.55)';
  for (const r of [0.93, 0.62]) { ctx.beginPath(); ctx.arc(m, m, m * r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,170,70,0.55)'; ctx.beginPath(); ctx.arc(m, m + m * 0.64, m * 0.17, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(190,225,240,0.5)'; ctx.font = 'bold ' + Math.round(taille * 0.06) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('H', m, m + m * 0.64 + taille * 0.02);
  const rand = alea(11);
  ctx.strokeStyle = 'rgba(20,10,8,0.18)'; ctx.lineWidth = taille * 0.006;
  for (let i = 0; i < 9; i++) { const a = rand() * Math.PI * 2, r1 = m * (0.2 + rand() * 0.4), r2 = m * (0.7 + rand() * 0.28); ctx.beginPath(); ctx.moveTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); ctx.quadraticCurveTo(m + Math.cos(a + 0.3) * (r1 + r2) / 2, m + Math.sin(a + 0.3) * (r1 + r2) / 2, m + Math.cos(a + 0.1) * r2, m + Math.sin(a + 0.1) * r2); ctx.stroke(); }
  const fondu = ctx.createRadialGradient(m, m, m * 0.86, m, m, m);   // le bord se fond dans le sol de la planète
  fondu.addColorStop(0, 'rgba(0,0,0,0)'); fondu.addColorStop(1, 'rgba(0,0,0,1)');
  return tex(c, { repeter: false });
}
/* Plateforme : carte de transparence (disque plein qui s'éteint sur le bord). */
export function texDisqueDoux(taille = 256) {
  const c = toile(taille), ctx = c.getContext('2d'), m = taille / 2, g = ctx.createRadialGradient(m, m, m * 0.7, m, m, m);
  g.addColorStop(0, '#fff'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, taille, taille);
  return tex(c, { repeter: false, srgb: false });
}
/* Halo de lumière (lampes, balises). */
export function texHalo(taille = 128) {
  const c = toile(taille), ctx = c.getContext('2d'), m = taille / 2, g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, taille, taille);
  return tex(c, { repeter: false });
}
/* Coque des modules : tôles blanc-sable, joints, rivets, salissures de poussière. */
export function texCoque(taille = 512, graine = 8) {
  const c = toile(taille);
  const ctx = remplir(c, (u, v) => {
    const g = bruitPeriodique(u, v, 6, 4, graine), s = bruitPeriodique(u, v, 60, 2, graine + 2), k = 0.78 + g * 0.2 + (s - 0.5) * 0.06;
    const bas = Math.max(0, v - 0.7) * 0.5;                                                   // poussière qui monte du sol
    return [Math.min(255, 224 * k - bas * 80), Math.min(255, 218 * k - bas * 110), Math.min(255, 208 * k - bas * 130)];
  });
  ctx.strokeStyle = 'rgba(60,50,48,0.5)'; ctx.lineWidth = taille * 0.004;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, taille * i / 4); ctx.lineTo(taille, taille * i / 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(taille * i / 4, 0); ctx.lineTo(taille * i / 4, taille); ctx.stroke(); }
  ctx.fillStyle = 'rgba(60,50,48,0.5)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [dx, dy] of [[0.04, 0.04], [0.21, 0.04], [0.04, 0.21], [0.21, 0.21]]) { ctx.beginPath(); ctx.arc((i / 4 + dx) * taille, (j / 4 + dy) * taille, taille * 0.0045, 0, Math.PI * 2); ctx.fill(); }
  return tex(c);
}
/* Panneau solaire : cellules bleu nuit, quadrillage argenté. */
export function texSolaire(taille = 256) {
  const c = toile(taille), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, taille, taille); g.addColorStop(0, '#142a55'); g.addColorStop(0.5, '#0d1d40'); g.addColorStop(1, '#16315f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, taille, taille);
  ctx.strokeStyle = 'rgba(170,200,235,0.45)'; ctx.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) { const p = i * taille / 8; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, taille); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(taille, p); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(170,200,235,0.14)'; for (let i = 0; i < 32; i++) { const p = i * taille / 32; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, taille); ctx.stroke(); }
  return tex(c);
}

/* ── Matières de la pièce ── */
/* Béton lissé clair avec joints et très léger nuage. */
export function texBeton(taille = 512, graine = 13, sombre = false) {
  const c = toile(taille);
  const ctx = remplir(c, (u, v) => {
    const g = bruitPeriodique(u, v, 5, 5, graine), f = bruitPeriodique(u, v, 80, 2, graine + 1), k = (sombre ? 0.28 : 0.72) + g * (sombre ? 0.16 : 0.18) + (f - 0.5) * 0.05;
    return sombre ? [Math.min(255, 62 * k + 18), Math.min(255, 66 * k + 20), Math.min(255, 76 * k + 24)] : [Math.min(255, 236 * k), Math.min(255, 230 * k), Math.min(255, 220 * k)];
  });
  ctx.strokeStyle = sombre ? 'rgba(130,200,255,0.10)' : 'rgba(80,70,62,0.35)'; ctx.lineWidth = taille * 0.003;
  ctx.strokeRect(0, 0, taille, taille); ctx.beginPath(); ctx.moveTo(taille / 2, 0); ctx.lineTo(taille / 2, taille); ctx.moveTo(0, taille / 2); ctx.lineTo(taille, taille / 2); ctx.stroke();
  return tex(c);
}
/* Lames de bois clair (mur d'accent). */
export function texBois(taille = 512, graine = 21) {
  const c = toile(taille), ctx = c.getContext('2d'), n = 8;
  for (let i = 0; i < n; i++) {
    const t = 0.86 + hash2(i, 3, graine) * 0.28;
    ctx.fillStyle = `rgb(${Math.round(176 * t)},${Math.round(128 * t)},${Math.round(84 * t)})`; ctx.fillRect(i * taille / n, 0, taille / n, taille);
    for (let k = 0; k < 40; k++) { const x = i * taille / n + hash2(k, i, graine + 5) * taille / n, a = 0.05 + hash2(i, k, graine + 9) * 0.12; ctx.fillStyle = `rgba(70,40,20,${a})`; ctx.fillRect(x, 0, 1.2, taille); }
    ctx.fillStyle = 'rgba(30,18,10,0.55)'; ctx.fillRect(i * taille / n, 0, 2, taille);
  }
  return tex(c);
}
/* Tapis rond sous la table : fibres sombres et deux anneaux lumineux. */
export function texTapis(taille = 512) {
  const c = toile(taille);
  const ctx = remplir(c, (u, v) => { const f = fbm2(u * 90, v * 90, 2, 4), k = 0.7 + f * 0.5; return [22 * k, 28 * k, 38 * k]; });
  const m = taille / 2; ctx.lineWidth = taille * 0.006;
  ctx.strokeStyle = 'rgba(143,208,227,0.28)'; ctx.beginPath(); ctx.arc(m, m, m * 0.9, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(143,208,227,0.1)'; ctx.beginPath(); ctx.arc(m, m, m * 0.82, 0, Math.PI * 2); ctx.stroke();
  return tex(c, { repeter: false });
}
/* Lueur de la surface de la table. */
export function texLueurTable(taille = 256) {
  const c = toile(taille), ctx = c.getContext('2d'), m = taille / 2, g = ctx.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(140,240,255,0.95)'); g.addColorStop(0.35, 'rgba(77,227,255,0.45)'); g.addColorStop(1, 'rgba(77,227,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, taille, taille);
  ctx.strokeStyle = 'rgba(200,250,255,0.6)'; ctx.lineWidth = 1.5; for (const r of [0.28, 0.5, 0.72, 0.92]) { ctx.beginPath(); ctx.arc(m, m, m * r, 0, Math.PI * 2); ctx.stroke(); }
  return tex(c, { repeter: false });
}
/* Dégradé d'écran éteint (poste de travail). */
export function texEcran(taille = 256) {
  const c = toile(taille), ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, taille, taille);
  g.addColorStop(0, '#0a2230'); g.addColorStop(1, '#10384a'); ctx.fillStyle = g; ctx.fillRect(0, 0, taille, taille);
  ctx.strokeStyle = 'rgba(77,227,255,0.25)'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(10, 30 + i * 36); ctx.lineTo(taille - 10 - hash2(i, 1, 4) * 120, 30 + i * 36); ctx.stroke(); }
  return tex(c, { repeter: false });
}

/* ── Formes ── */
/* Lisse les normales d'une géométrie non indexée : les sommets confondus partagent la moyenne des normales de leurs faces (sinon les rochers paraissent taillés à facettes). */
export function lisserNormales(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, somme = new Map(), cle = i => Math.round(p.getX(i) * 2000) + ',' + Math.round(p.getY(i) * 2000) + ',' + Math.round(p.getZ(i) * 2000);
  for (let i = 0; i < p.count; i++) { const k = cle(i), s = somme.get(k) || [0, 0, 0]; s[0] += n.getX(i); s[1] += n.getY(i); s[2] += n.getZ(i); somme.set(k, s); }
  for (let i = 0; i < p.count; i++) { const s = somme.get(cle(i)), l = Math.hypot(s[0], s[1], s[2]) || 1; n.setXYZ(i, s[0] / l, s[1] / l, s[2] / l); }
  return g;
}
/* Rocher : icosaèdre déformé par du bruit (facettes douces). */
export function geometrieRocher(graine = 1, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 0.72 + fbm2(v.x * 2.2 + graine * 5, v.y * 2.2 + v.z * 1.7, 4, graine) * 0.7;
    v.multiplyScalar(k); v.y *= 0.72; p.setXYZ(i, v.x, v.y, v.z);
  }
  lisserNormales(g); return g;
}
/* Phobos : pomme de terre grise, ellipsoïde 13 × 11 × 9 km, creusée de cratères (le grand : Stickney). */
export function geometriePhobos(detail = 4) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3(), cr = [];
  const rand = alea(77);
  for (let i = 0; i < 26; i++) { const d = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(); cr.push({ d, r: 0.12 + rand() * 0.22, p: 0.04 + rand() * 0.08 }); }
  cr.unshift({ d: new THREE.Vector3(-1, 0.1, 0.1).normalize(), r: 0.55, p: 0.18 });   // Stickney
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let k = 1 + (fbm2(v.x * 3 + 9, v.y * 3 + v.z * 2.4, 4, 3) - 0.5) * 0.28;
    let ombre = 0;
    for (const c of cr) { const a = Math.acos(Math.min(1, v.dot(c.d))); if (a < c.r) { const t = a / c.r; k -= c.p * (1 - t * t) * (t < 0.85 ? 1 : 0.4); ombre += (1 - t) * 0.5; } }
    const m = new THREE.Vector3(v.x * 1.3, v.y * 1.1, v.z * 0.9).multiplyScalar(k); p.setXYZ(i, m.x, m.y, m.z);
    const s = 0.34 + fbm2(v.x * 6, v.z * 6, 3, 8) * 0.22 - ombre * 0.12; col[i * 3] = s * 1.05; col[i * 3 + 1] = s * 0.97; col[i * 3 + 2] = s * 0.9;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); lisserNormales(g); return g;
}
