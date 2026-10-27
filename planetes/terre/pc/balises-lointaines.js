import * as THREE from 'three';
import { vers, unit } from './geo.js';
import { chargerFil } from './fil-actus.js';
import { modelesFil } from './actus-sujets.js';

/* ═════════════ LA TERRE VUE DE LOIN : discrètes balises d'actualité ═════════════
   Dans la galaxie (avant d'entrer en orbite), la Terre est déjà vivante : jour et nuit, nuages, lumières de villes, et de petites balises qui pulsent sur les pays
   où il se passe quelque chose (sujets couverts par plusieurs médias, d'après le fil du Worker). Données réelles seulement : sans Worker, ou source en panne,
   aucune balise (rien d'inventé). Calque 2D léger au-dessus de la scène ; coupé en mode jeu, quand la Terre passe en orbite, et réduit en qualité basse. */
const MAX = { haute: 16, moyenne: 10, basse: 6 };
const reduitMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

export function demarrer(G) {
  const o = G.systeme.parId('terre');
  if (!o) return null;
  const racine = document.getElementById('vueGalaxie') || G.canvas.parentElement;
  const cv = document.createElement('canvas'); cv.id = 'terre-balises-lointaines'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
  G.canvas.insertAdjacentElement('afterend', cv);
  const ctx = cv.getContext('2d');
  let balises = [], dernierChargement = -1e9, enCours = false, panne = false, actif = true, t = 0, derniere = performance.now(), message = '';
  const ep = new THREE.Vector3(), cam = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3(), l = new THREE.Vector3();
  const workerOk = () => { try { return (typeof workerReady === 'function' && !!workerReady()); } catch (e) { return false; } };

  async function charger() {
    if (enCours || !workerOk() || performance.now() - dernierChargement < (panne ? 300000 : 600000)) return;
    enCours = true; dernierChargement = performance.now();
    try {
      const m = modelesFil(await chargerFil('monde'));
      balises = m.sujets.filter(s => s.lieu).sort((a, b) => b.importance - a.importance).slice(0, 24).map(s => ({ id: s.id, importance: s.importance, couleur: s.couleur, local: new THREE.Vector3(...unit(vers(s.lieu.lon, s.lieu.lat))), titre: s.titre }));
      panne = false; message = '';
    } catch (e) { panne = true; balises = []; message = String(e && e.message || e); }
    enCours = false;
  }

  function image(maintenant) {
    requestAnimationFrame(image);
    const dt = Math.min(0.1, (maintenant - derniere) / 1000); derniere = maintenant; t += dt;
    const rect = G.canvas.getBoundingClientRect(), w = Math.round(rect.width), h = Math.round(rect.height);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.clearRect(0, 0, w, h);
    if (!actif || !G.enMarche() || G.surchargee() || G.jeu() || !balises.length && !workerOk()) return;
    if (!balises.length && !enCours) charger();
    if (performance.now() - dernierChargement > 600000) charger();
    if (!balises.length) return;
    o.sphere.updateWorldMatrix(true, false);
    o.sphere.getWorldPosition(ep); cam.copy(G.camera.position);
    const R = o.config.rayon, dist = cam.distanceTo(ep), tan = Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2));
    const rpx = R / (dist * tan) * h / 2;
    if (rpx < 16 || dist < R * 1.5 || G.nav.etat().sas) return;
    const calme = reduitMq && reduitMq.matches, nb = MAX[G.info().qualite] || 10;
    l.copy(cam).sub(ep).normalize();
    let n_ = 0;
    for (const b of balises) {
      if (n_ >= nb) break;
      n.copy(b.local).transformDirection(o.sphere.matrixWorld);
      const face = n.dot(l); if (face < 0.16) continue;
      p.copy(ep).addScaledVector(n, R * 1.01).project(G.camera);
      if (p.z > 1) continue;
      const x = (p.x * 0.5 + 0.5) * w, y = (-p.y * 0.5 + 0.5) * h; n_++;
      const a = Math.min(1, (face - 0.16) * 4) * 0.9, r = Math.max(2, Math.min(5, rpx / 28)) * (b.importance >= 4 ? 1.35 : b.importance >= 2 ? 1.1 : 0.9);
      ctx.fillStyle = ctx.strokeStyle = b.couleur; ctx.lineWidth = 1.1;
      ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.2832); ctx.fill();
      if (!calme) { const periode = b.importance >= 4 ? 1.6 : 2.6, ph = ((t + (hash(b.id) % 100) / 100 * periode) % periode) / periode; ctx.globalAlpha = a * (1 - ph) * 0.8; ctx.beginPath(); ctx.arc(x, y, r + ph * (r * 3.2 + 6), 0, 6.2832); ctx.stroke(); }
      else { ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 6.2832); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(image);
  return {
    arreter() { actif = false; cv.remove(); },
    etat: () => ({ balises: balises.length, panne, message, canvas: cv }),
    /* Pour les tests : donne directement des sujets (comme le ferait le Worker) */
    definir(sujets) { balises = sujets.filter(s => s.lieu).map(s => ({ id: s.id, importance: s.importance, couleur: s.couleur, local: new THREE.Vector3(...unit(vers(s.lieu.lon, s.lieu.lat))), titre: s.titre })); dernierChargement = performance.now(); }
  };
}
