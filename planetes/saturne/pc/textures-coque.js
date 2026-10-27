import * as THREE from 'three';

/* ═════════════ TEXTURES PROCÉDURALES DE LA COQUE (aucune image externe) ═════════════
   Générées une fois dans des canvas 2D, à partir d'une graine : couleur (plaques de blindage, bandes d'accent sable et cyan de la direction artistique V1),
   rugosité (rayures, usure), relief (rainures, rivets : normales calculées d'après une carte de hauteur par différences de Sobel) et émissive (hublots, voyants).
   Tout est original : les motifs sont tirés au hasard par une petite fonction pseudo-aléatoire, ne copient aucun vaisseau existant. */
export const ACCENT_CYAN = '#8fd0e3', ACCENT_SABLE = '#c9b27a';
export function alea(graine) { let s = graine >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/* Carte de hauteur → carte de normales (tangent space) par Sobel. */
function normalesDepuisHauteur(cvH, force = 2.5) {
  const w = cvH.width, h = cvH.height, src = cvH.getContext('2d').getImageData(0, 0, w, h).data, sortie = canvas(w, h), cx = sortie.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -gx * force, ny = gy * force, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0); return sortie;
}

/* Plaques de blindage : grille irrégulière de panneaux (largeurs et hauteurs variées), un ton légèrement différent chacun, joints sombres, rivets, rayures. */
export function peindreCoque({ taille = 1024, graine = 7, teinte = [212, 218, 226], accents = true, hublots = true } = {}) {
  const R = alea(graine), n = taille;
  const couleur = canvas(n, n), rug = canvas(n, n), haut = canvas(n, n), emi = canvas(n, n);
  const c = couleur.getContext('2d'), r = rug.getContext('2d'), h = haut.getContext('2d'), e = emi.getContext('2d');
  c.fillStyle = `rgb(${teinte.join(',')})`; c.fillRect(0, 0, n, n);
  r.fillStyle = '#8a8a8a'; r.fillRect(0, 0, n, n);
  h.fillStyle = '#808080'; h.fillRect(0, 0, n, n);
  e.fillStyle = '#000'; e.fillRect(0, 0, n, n);
  // grille de panneaux
  const rangees = []; let y = 0;
  while (y < n) { const hh = Math.round(n * (0.06 + R() * 0.12)); rangees.push([y, Math.min(hh, n - y)]); y += hh; }
  for (const [y0, hh] of rangees) {
    let x = 0;
    while (x < n) {
      const ww = Math.round(n * (0.08 + R() * 0.2)), w2 = Math.min(ww, n - x), v = (R() - 0.5) * 22;
      c.fillStyle = `rgb(${teinte.map(t => Math.max(0, Math.min(255, t + v))).join(',')})`; c.fillRect(x, y0, w2, hh);
      r.fillStyle = `rgb(${130 + R() * 70},${130 + R() * 70},${130 + R() * 70})`; r.fillRect(x, y0, w2, hh);
      h.fillStyle = `rgb(${120 + R() * 20},${120 + R() * 20},${120 + R() * 20})`; h.fillRect(x, y0, w2, hh);
      // joints (rainure)
      c.fillStyle = 'rgba(30,36,46,0.55)'; c.fillRect(x, y0, w2, 2); c.fillRect(x, y0, 2, hh);
      h.fillStyle = '#202020'; h.fillRect(x, y0, w2, 3); h.fillRect(x, y0, 3, hh);
      // rivets
      if (w2 > 40 && hh > 30 && R() < 0.8) for (const [rx, ry] of [[x + 8, y0 + 9], [x + w2 - 9, y0 + 9], [x + 8, y0 + hh - 9], [x + w2 - 9, y0 + hh - 9]]) { h.fillStyle = '#d8d8d8'; h.beginPath(); h.arc(rx, ry, 2.2, 0, 6.3); h.fill(); c.fillStyle = 'rgba(40,46,58,.5)'; c.beginPath(); c.arc(rx, ry, 1.6, 0, 6.3); c.fill(); }
      // trappe, évent ou voyant
      const tirage = R();
      if (tirage < 0.14 && w2 > 60 && hh > 40) { const px = x + w2 * 0.2, py = y0 + hh * 0.25, pw = w2 * 0.6, ph = hh * 0.5; c.fillStyle = 'rgba(25,30,40,.45)'; c.fillRect(px, py, pw, ph); h.fillStyle = '#404040'; h.fillRect(px, py, pw, ph); for (let k = 0; k < 5; k++) { h.fillStyle = '#a0a0a0'; h.fillRect(px + 4, py + 4 + k * (ph / 5), pw - 8, 2); } }
      else if (tirage < 0.22 && accents) { c.fillStyle = ACCENT_SABLE; c.fillRect(x + 4, y0 + hh * 0.42, w2 - 8, Math.max(3, hh * 0.1)); e.fillStyle = 'rgba(201,178,122,.18)'; e.fillRect(x + 4, y0 + hh * 0.42, w2 - 8, Math.max(3, hh * 0.1)); }
      else if (tirage < 0.27 && accents) { c.fillStyle = ACCENT_CYAN; c.fillRect(x + 6, y0 + hh * 0.46, w2 * 0.4, 4); e.fillStyle = ACCENT_CYAN; e.fillRect(x + 6, y0 + hh * 0.46, w2 * 0.4, 4); }
      x += w2;
    }
  }
  // rayures et usure
  for (let k = 0; k < n * 0.9; k++) { const x = R() * n, y2 = R() * n, l = 6 + R() * 40, a = R() * 6.28; r.strokeStyle = `rgba(${R() < 0.5 ? 255 : 30},${R() < 0.5 ? 255 : 30},255,0.18)`; r.lineWidth = 0.6 + R() * 1.2; r.beginPath(); r.moveTo(x, y2); r.lineTo(x + Math.cos(a) * l, y2 + Math.sin(a) * l); r.stroke(); c.strokeStyle = 'rgba(60,66,78,.12)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y2); c.lineTo(x + Math.cos(a) * l, y2 + Math.sin(a) * l); c.stroke(); }
  for (let k = 0; k < 40; k++) { const x = R() * n, y2 = R() * n, rr = 20 + R() * 70, g = c.createRadialGradient(x, y2, 0, x, y2, rr); g.addColorStop(0, 'rgba(40,36,30,.16)'); g.addColorStop(1, 'rgba(40,36,30,0)'); c.fillStyle = g; c.fillRect(x - rr, y2 - rr, rr * 2, rr * 2); }
  // hublots lumineux
  if (hublots) for (const [y0, hh] of rangees) if (R() < 0.2 && hh > 40) { const nb = 4 + (R() * 10 | 0), pas = n / nb; for (let k = 0; k < nb; k++) { const on = R() < 0.82; if (!on) continue; const x = k * pas + pas * 0.2, w2 = pas * 0.6; c.fillStyle = 'rgb(18,24,34)'; c.fillRect(x, y0 + hh * 0.3, w2, hh * 0.35); e.fillStyle = R() < 0.7 ? 'rgb(120,200,225)' : 'rgb(230,205,150)'; e.fillRect(x + 1, y0 + hh * 0.3 + 1, w2 - 2, hh * 0.35 - 2); } }
  const map = new THREE.CanvasTexture(couleur), roughnessMap = new THREE.CanvasTexture(rug), normalMap = new THREE.CanvasTexture(normalesDepuisHauteur(haut)), emissiveMap = new THREE.CanvasTexture(emi);
  map.colorSpace = THREE.SRGBColorSpace; emissiveMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, roughnessMap, normalMap, emissiveMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.needsUpdate = true; }
  return { map, roughnessMap, normalMap, emissiveMap, canvas: couleur };
}

/* Texture « verre » rayée pour les verrières (carte d'alpha et de rugosité) : fines rayures, poussière, bords plus épais. */
export function peindreVerre({ taille = 512, graine = 3 } = {}) {
  const R = alea(graine), n = taille, cv = canvas(n, n), c = cv.getContext('2d');
  c.fillStyle = '#000'; c.fillRect(0, 0, n, n);
  for (let k = 0; k < 90; k++) { const x = R() * n, y = R() * n, l = 10 + R() * 90, a = R() * 6.28; c.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.1})`; c.lineWidth = 0.5 + R() * 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  for (let k = 0; k < 24; k++) { const x = R() * n, y = R() * n, rr = 25 + R() * 80, g = c.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* Sprite rond pour les flammes et les particules (dégradé radial). */
export function spriteLueur(couleurs = ['rgba(255,255,255,1)', 'rgba(150,220,255,.8)', 'rgba(60,140,255,0)']) {
  const cv = canvas(128, 128), c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  couleurs.forEach((col, i) => g.addColorStop(i / (couleurs.length - 1), col)); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
