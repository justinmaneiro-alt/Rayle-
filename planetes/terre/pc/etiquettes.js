import { vers, sub, dot, distanceKm, faceCamera } from './geo.js';
import { ECHELLE_LIEUX } from './style-vecteur.js';

/* ═════════════ NOMS DE LIEUX SUR LE GLOBE ═════════════
   Calque 2D devant la scène. Les noms viennent des tuiles vectorielles affichées (jamais inventés). On garde les plus importants selon
   l'altitude, sans chevauchement, et chacun apparaît / disparaît en douceur (fondu, glissement, point qui pulse). */
const STYLES = {
  continent: { px: 16, maj: true, esp: 5, couleur: '#cfeaff', opaque: 0.55 }, country: { px: 13, maj: true, esp: 3, couleur: '#7fe9ff', opaque: 0.9 },
  state: { px: 11, maj: true, esp: 2, couleur: '#e6f4ff', opaque: 0.7 }, province: { px: 11, maj: true, esp: 2, couleur: '#e6f4ff', opaque: 0.72 },
  island: { px: 11.5, esp: 0.5, couleur: '#bfe3ff', opaque: 0.85 }, city: { px: 13.5, gras: true, esp: 0.4, couleur: '#ffffff', point: true, opaque: 1 },
  town: { px: 12, esp: 0.3, couleur: '#f4f4ff', point: true, opaque: 0.95 }, village: { px: 11, esp: 0.2, couleur: '#ececf8', point: true, opaque: 0.9 },
  suburb: { px: 10.5, esp: 0.2, couleur: '#e0e0ee', opaque: 0.8 }, hamlet: { px: 10, esp: 0.1, couleur: '#d6d6e6', point: true, opaque: 0.8 },
  quarter: { px: 10, esp: 0.1, couleur: '#d0d0e0', opaque: 0.75 }, neighbourhood: { px: 10, esp: 0.1, couleur: '#d0d0e0', opaque: 0.7 },
  isolated_dwelling: { px: 9.5, esp: 0, couleur: '#c8c8d8', opaque: 0.7 }, mer: { px: 12, ital: true, esp: 3, couleur: '#8fc4ff', opaque: 0.85 }, pic: { px: 10.5, esp: 0.2, couleur: '#ffd9a8', point: true, opaque: 0.9 }
};
const MAX_AFFICHES = 80;
const PORTEE_KM = { town: 220, village: 70, suburb: 45, hamlet: 30, quarter: 25, neighbourhood: 20, isolated_dwelling: 15, pic: 110, island: 800 };   // au-delà (et plus loin que 3 fois l'altitude), ces noms restent cachés

export function creerEtiquettes(conteneur) {
  const canvas = document.createElement('canvas'); canvas.className = 't-noms'; conteneur.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const items = new Map();
  let L = 0, H = 0, dpr = 1;
  function taille(l, h, d) { if (l === L && h === H && d === dpr) return; L = l; H = h; dpr = d; canvas.width = Math.round(l * d); canvas.height = Math.round(h * d); canvas.style.width = l + 'px'; canvas.style.height = h + 'px'; }
  const texte = (c, s, st) => (st.maj ? s.toLocaleUpperCase('fr') : s);

  function dessiner(it, alpha, t) {
    const st = STYLES[it.c]; if (!st) return;
    const police = (st.ital ? 'italic ' : '') + (st.gras ? '600 ' : '400 ') + st.px + 'px "Cascadia Mono", ui-monospace, Consolas, monospace';
    ctx.font = police;
    const s = texte(it.c, it.n, st) + (it.c === 'pic' && it.alt ? '  ' + Math.round(it.alt) + ' m' : '');
    if (!it.w) { ctx.letterSpacing = st.esp + 'px'; it.w = ctx.measureText(s).width; }
    ctx.letterSpacing = st.esp + 'px';
    const glisse = (1 - alpha) * 9, x = it.x, y = it.y - glisse;
    ctx.globalAlpha = alpha * st.opaque;
    if (st.point) {
      const p = 3 + (alpha < 1 ? (1 - alpha) * 8 : 0);
      ctx.beginPath(); ctx.arc(x, it.y, 2.2, 0, 6.2832); ctx.fillStyle = it.c === 'pic' ? '#ffb347' : '#ff3399'; ctx.fill();
      if (alpha < 1) { ctx.beginPath(); ctx.arc(x, it.y, p, 0, 6.2832); ctx.strokeStyle = 'rgba(77,227,255,' + (0.7 * (1 - alpha)) + ')'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const ty = st.point ? y - 6 : y + st.px * 0.4;
    ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(2,4,12,0.78)'; ctx.strokeText(s, x, ty);
    ctx.fillStyle = st.couleur; ctx.fillText(s, x, ty);
  }

  return {
    canvas, items,
    /* Nom du lieu affiché le plus proche d'un point (degrés), à moins de maxKm ; null sinon (jamais de nom deviné). */
    proche(lon, lat, maxKm = 60) {
      let m = null, d = maxKm;
      for (const it of items.values()) {
        if (it.alpha < 0.3 || !['city', 'town', 'village', 'suburb', 'hamlet'].includes(it.c)) continue;
        const e = distanceKm(lon, lat, it.lon, it.lat); if (e < d) { d = e; m = it; }
      }
      return m ? m.n : null;
    },
    vider() { items.clear(); ctx.clearRect(0, 0, canvas.width, canvas.height); },
    /* tuiles : tuiles affichées ({z, lieux}) ; pose : caméra ; dt en secondes. */
    maj(dt, { pose, fov, largeur, hauteur, tuiles, altitudeSol, exag, actif = true, dprMax = 2 }) {
      taille(largeur, hauteur, Math.min(window.devicePixelRatio || 1, dprMax));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L, H);
      const cand = [], dansCand = new Set();
      if (actif) {
        const cam = pose.cam, ty = Math.tan(fov / 2), tx = ty * (largeur / hauteur);
        for (const t of tuiles) for (const l of t.lieux) {
          const seuil = ECHELLE_LIEUX[l.c]; if (!seuil || seuil[0] > t.z) continue;
          // un nom de pays disparaît quand on est très près (les villes prennent le relais)
          if ((l.c === 'country' || l.c === 'continent') && t.z > 7) continue;
          if (l.c === 'state' && t.z > 10) continue;
          const k = l.n + '|' + l.lon.toFixed(2) + '|' + l.lat.toFixed(2);
          let it = items.get(k);
          if (!it) { it = { k, n: l.n, c: l.c, imp: l.i, lon: l.lon, lat: l.lat, alt: l.alt, h: null, alpha: 0, cible: 0, vu: 0, x: 0, y: 0, w: 0 }; items.set(k, it); }
          if (!dansCand.has(it)) { dansCand.add(it); cand.push(it); }
        }
        cand.sort((a, b) => a.imp - b.imp);
        const places = [];
        let n = 0;
        for (const it of cand) {
          if (n >= MAX_AFFICHES * 2) break;
          if (it.h === null) it.h = (altitudeSol ? altitudeSol(it.lon, it.lat) : 0) * exag;
          const P = vers(it.lon, it.lat, it.h), rel = sub(P, cam);
          if (!faceCamera(P, cam)) { it.cible = 0; continue; }                 // derrière l'horizon
          const z = dot(rel, pose.avant); if (z < 0.05) { it.cible = 0; continue; }
          const sx = (dot(rel, pose.droite) / (z * tx) * 0.5 + 0.5) * largeur, sy = (0.5 - dot(rel, pose.haut) / (z * ty) * 0.5) * hauteur;
          if (sx < -40 || sx > largeur + 40 || sy < 78 || sy > hauteur - 10) { it.cible = 0; continue; }
          const portee = PORTEE_KM[it.c]; if (portee && z > Math.max(portee, pose.altitude * 3)) { it.cible = 0; continue; }
          it.x = sx; it.y = sy;
          // place libre ? (rectangle approximatif autour du nom)
          const st = STYLES[it.c], w = (it.w || it.n.length * st.px * 0.62 + 10) + 8, h = st.px + 12, r = [sx - w / 2, sy - h - (st.point ? 4 : 0), w, h + 6];
          let libre = true;
          for (const q of places) if (r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]) { libre = false; break; }
          if (libre && places.length < MAX_AFFICHES) { places.push(r); it.cible = 1; n++; } else it.cible = 0;
          it.vu = 1;
        }
      }
      const vitesse = Math.min(1, dt * 7);
      for (const it of items.values()) {
        if (!dansCand.has(it) || !actif) it.cible = 0;
        it.alpha += (it.cible - it.alpha) * vitesse;
        if (it.alpha > 0.02) dessiner(it, it.alpha, 0);
      }
      ctx.globalAlpha = 1;
      if (items.size > 600) for (const [k, it] of items) { if (items.size <= 600) break; if (it.alpha < 0.02 && it.cible === 0) items.delete(k); }
    }
  };
}
