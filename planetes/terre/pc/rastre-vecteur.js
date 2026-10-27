import { R, RAD, lonDeX, latDeY, vers, sub, unit, norme } from './geo.js';
import { traitFrontiere, traitRoute, traitEau, surface, classeLieu, nomLieu, importance } from './style-vecteur.js';
import { classifyRings } from '../vendor/vector-tile.js';
import earcut from '../vendor/earcut.js';

/* ═════════════ DESSIN DES TUILES VECTORIELLES ═════════════
   Utilisé dans un Worker (OffscreenCanvas), mais sans rien qui l'y oblige : on lui passe un contexte 2D et une tuile décodée.
   `zAff` = niveau de la tuile affichée (z,x,y) ; `rect` = [ox, oy, k] : sous-rectangle de la tuile vectorielle source qui la couvre
   (k < 1 quand la tuile affichée est plus fine que les données, au-delà du niveau 14). */
const ETENDUE = 4096;

function fabriquerProjection(taille, rect, etendue) {
  const [ox, oy, k] = rect, s = taille / (etendue * k);
  return { X: x => (x - ox * etendue) * s, Y: y => (y - oy * etendue) * s, s };
}
const tracer = (ctx, lignes, X, Y, ferme) => {
  ctx.beginPath();
  for (const l of lignes) { if (l.length < 2) continue; ctx.moveTo(X(l[0].x), Y(l[0].y)); for (let i = 1; i < l.length; i++) ctx.lineTo(X(l[i].x), Y(l[i].y)); if (ferme) ctx.closePath(); }
};
const prop = f => f.properties || {};

export function dessiner(ctx, vt, { zAff, taille, rect, avecBatiments2D = true, lat = 45, sansSurfaces = false }) {
  const e = (vt.layers.boundary || vt.layers.water || vt.layers.place || { extent: ETENDUE }).extent || ETENDUE;
  const { X, Y } = fabriquerProjection(taille, rect, e);
  const echelle = taille / 512;
  ctx.clearRect(0, 0, taille, taille);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const mParPx = 40075016.7 * Math.cos(lat * RAD) / 2 ** zAff / taille;   // mètres au sol par pixel de cette tuile
  if (zAff >= 15 && !sansSurfaces) { ctx.fillStyle = zAff >= 16 ? 'rgba(44,50,64,0.36)' : 'rgba(44,50,64,0.16)'; ctx.fillRect(0, 0, taille, taille); }   // fond de plan : l'image satellite devient discrète
  // 1. surfaces (eau, parcs, usages du sol, bâtiments à plat)
  for (const nom of ['landcover', 'landuse', 'park', 'water', 'building']) {
    const couche = vt.layers[nom]; if (!couche || sansSurfaces || (nom === 'building' && !avecBatiments2D)) continue;   // sous une photo aérienne, les aplats de couleur la masqueraient
    for (let i = 0; i < couche.length; i++) {
      const f = couche.feature(i); if (f.type !== 3) continue;
      const c = surface(nom, prop(f), zAff); if (!c) continue;
      ctx.beginPath(); ctx.fillStyle = c;                          // un remplissage par entité : deux polygones qui se chevauchent ne s'annulent pas
      for (const l of f.loadGeometry()) { if (l.length < 3) continue; ctx.moveTo(X(l[0].x), Y(l[0].y)); for (let j = 1; j < l.length; j++) ctx.lineTo(X(l[j].x), Y(l[j].y)); ctx.closePath(); }
      ctx.fill('evenodd');
    }
  }
  // 2. lignes, regroupées par style pour limiter les changements d'état du contexte
  const groupes = new Map();
  const ajouter = (trait, f) => {
    const cle = trait.couleur + '|' + trait.largeur.toFixed(1) + '|' + (trait.tirets || '') + '|' + (trait.ordre || 0) + '|' + (trait.lisere ? 1 : 0);
    let g = groupes.get(cle); if (!g) groupes.set(cle, g = { trait, lignes: [] });
    for (const l of f.loadGeometry()) g.lignes.push(l);
  };
  const eaux = vt.layers.waterway; if (eaux) for (let i = 0; i < eaux.length; i++) { const f = eaux.feature(i), t = traitEau(prop(f), zAff); if (t) ajouter(t, f); }
  const routes = vt.layers.transportation; if (routes) for (let i = 0; i < routes.length; i++) { const f = routes.feature(i); if (f.type !== 2) continue; const t = traitRoute(prop(f), zAff, mParPx); if (t) ajouter(t, f); }
  const front = vt.layers.boundary; if (front) for (let i = 0; i < front.length; i++) { const f = front.feature(i), t = traitFrontiere(prop(f), zAff); if (t) ajouter(t, f); }
  const ordre = [...groupes.values()].sort((a, b) => (a.trait.ordre || 0) - (b.trait.ordre || 0) || (a.trait.couleur.includes('77,227,255') ? 1 : 0) - (b.trait.couleur.includes('77,227,255') ? 1 : 0));
  for (const { trait, lignes } of ordre) {                          // d'abord les liserés sombres des routes larges
    if (!trait.lisere || sansSurfaces) continue;
    ctx.strokeStyle = trait.lisere.couleur; ctx.lineWidth = trait.lisere.largeur * echelle; ctx.setLineDash([]);
    tracer(ctx, lignes, X, Y, false); ctx.stroke();
  }
  for (const { trait, lignes } of ordre) {
    ctx.strokeStyle = trait.couleur; ctx.lineWidth = trait.largeur * echelle * (sansSurfaces ? 0.3 : 1);   // sous une photo aérienne, les routes ne sont qu'un filet (lumières de nuit, repérage)
    ctx.setLineDash(trait.tirets ? trait.tirets.map(v => v * echelle) : []);
    tracer(ctx, lignes, X, Y, false); ctx.stroke();
  }
  ctx.setLineDash([]);
}

/* Noms de lieux contenus dans la tuile affichée (z,x,y). Chaque point n'appartient qu'à UNE tuile : les doublons des marges disparaissent. */
export function lieux(vt, { z, x, y, zs, xs, ys, rect }) {
  const [ox, oy, k] = rect, sortie = [], n = 2 ** zs;
  for (const nom of ['place', 'water_name', 'mountain_peak']) {
    const couche = vt.layers[nom]; if (!couche) continue;
    const e = couche.extent || ETENDUE;
    for (let i = 0; i < couche.length; i++) {
      const f = couche.feature(i), p = prop(f), classe = classeLieu(nom, p), nm = classe && nomLieu(p);
      if (!nm) continue;
      const g = f.loadGeometry()[0]; if (!g || !g[0]) continue;
      const u = g[0].x / e, v = g[0].y / e;                        // position dans la tuile source (0..1)
      const uu = (u - ox) / k, vv = (v - oy) / k;                  // dans la tuile affichée
      if (uu < 0 || uu >= 1 || vv < 0 || vv >= 1) continue;
      sortie.push({ n: nm, c: classe, i: importance(classe, p), lon: lonDeX(xs + u, zs), lat: latDeY(ys + v, zs), alt: p.ele ?? null });
    }
  }
  return sortie;
}

/* ── Bâtiments en volume ──
   Pour chaque empreinte (polygone) : toit triangulé (earcut) et murs. Les positions sont relatives au centre de la tuile affichée
   (double précision → flottant). Hauteurs en km (render_height est en mètres). Le relief n'est PAS connu ici : le nuanceur de sommets
   ajoute l'altitude du sol lue au centre de l'empreinte (attribut uvC = position du centre dans la tuile affichée). */
export function batiments(vt, { z, x, y, zs, xs, ys, rect, max = 3500 }) {
  const couche = vt.layers.building; if (!couche) return null;
  const [ox, oy, k] = rect, e = couche.extent || ETENDUE;
  const c0 = vers(lonDeX(x + 0.5, z), latDeY(y + 0.5, z));
  const pos = [], rad = [], nrm = [], uvc = [], hh = [], idx = [];
  const sommet = (px, py, haut, uc, vc, n) => {
    const lon = lonDeX(xs + px / e, zs), lat = latDeY(ys + py / e, zs), a = lat * RAD, o = lon * RAD, ca = Math.cos(a);
    const dx = ca * Math.cos(o), dy = Math.sin(a), dz = -ca * Math.sin(o);
    pos.push(R * dx - c0[0], R * dy - c0[1], R * dz - c0[2]); rad.push(dx, dy, dz);
    nrm.push(dx, dy, dz); uvc.push(uc, vc); hh.push(haut);
    return pos.length / 3 - 1;
  };
  /* Normales de face d'un bâtiment (sommets v0.., triangles i0..) : calculées avec les hauteurs, orientées à l'opposé du centre du volume. */
  const normales = (v0, i0) => {
    const eff = v => [pos[v * 3] + rad[v * 3] * hh[v], pos[v * 3 + 1] + rad[v * 3 + 1] * hh[v], pos[v * 3 + 2] + rad[v * 3 + 2] * hh[v]];
    let cx = 0, cy = 0, cz = 0; const nv = pos.length / 3 - v0;
    for (let v = v0; v < v0 + nv; v++) { const q = eff(v); cx += q[0]; cy += q[1]; cz += q[2]; }
    cx /= nv; cy /= nv; cz /= nv;
    for (let i = i0; i < idx.length; i += 3) {
      const A = eff(idx[i]), B = eff(idx[i + 1]), C = eff(idx[i + 2]);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz); if (l < 1e-18) continue; nx /= l; ny /= l; nz /= l;
      const mx = (A[0] + B[0] + C[0]) / 3 - cx, my = (A[1] + B[1] + C[1]) / 3 - cy, mz = (A[2] + B[2] + C[2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (const s of [idx[i], idx[i + 1], idx[i + 2]]) { nrm[s * 3] = nx; nrm[s * 3 + 1] = ny; nrm[s * 3 + 2] = nz; }
    }
  };
  let compte = 0;
  for (let i = 0; i < couche.length && compte < max; i++) {
    const f = couche.feature(i); if (f.type !== 3) continue;
    const p = prop(f), haut = Math.max(2, (p.render_height ?? 6)) / 1000, bas = Math.max(0, p.render_min_height ?? 0) / 1000;
    if (haut <= bas) continue;
    for (const anneaux of classifyRings(f.loadGeometry())) {
      if (compte >= max) break;
      let sx = 0, sy = 0, m = 0; const ext = anneaux[0];
      for (const q of ext) { sx += q.x; sy += q.y; m++; }
      if (m < 3) continue;
      const cu = (sx / m / e - ox) / k, cv = (sy / m / e - oy) / k;
      if (cu < 0 || cu >= 1 || cv < 0 || cv >= 1) continue;       // le bâtiment appartient à la tuile qui contient son centre
      let aire = 0; for (let j = 0; j < m; j++) { const a = ext[j], b = ext[(j + 1) % m]; aire += a.x * b.y - b.x * a.y; }
      if (Math.abs(aire) / 2 * (40075000 / (2 ** zs * e)) ** 2 < 12 && haut < 0.004) continue;   // trop petit : ignoré
      const v0 = pos.length / 3, i0 = idx.length;
      const plat = [], trous = [];
      anneaux.forEach((r, ri) => { if (ri > 0) trous.push(plat.length / 2); for (const q of r) plat.push(q.x, q.y); });
      const tri = earcut(plat, trous);
      for (let j = 0; j < plat.length; j += 2) sommet(plat[j], plat[j + 1], haut, cu, cv, [0, 0, 0]);
      for (const t of tri) idx.push(v0 + t);
      for (const r of anneaux) {
        const n = r.length;
        for (let j = 0; j < n; j++) {
          const a = r[j], b = r[(j + 1) % n]; if (a.x === b.x && a.y === b.y) continue;
          const vA = sommet(a.x, a.y, bas, cu, cv, [0, 0, 0]), vB = sommet(b.x, b.y, bas, cu, cv, [0, 0, 0]), vC = sommet(b.x, b.y, haut, cu, cv, [0, 0, 0]), vD = sommet(a.x, a.y, haut, cu, cv, [0, 0, 0]);
          idx.push(vA, vB, vC, vA, vC, vD);
        }
      }
      normales(v0, i0);
      compte++;
    }
  }
  if (!compte) return null;
  return { pos: new Float32Array(pos), rad: new Float32Array(rad), nrm: new Float32Array(nrm), uvc: new Float32Array(uvc), h: new Float32Array(hh), idx: new Uint32Array(idx), n: compte };
}
