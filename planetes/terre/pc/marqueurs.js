import { projeter } from './projection.js';

/* ═════════════ REPÈRES SUR LE GLOBE (pays à actualités, lieu météo) ET LIAISONS VERS LES FENÊTRES ═════════════
   Un petit repère cyan marque chaque pays dont on peut lire l'actualité (visible entre ~400 et ~18 000 km d'altitude) ; le repère du pays
   ou du lieu dont une fenêtre est ouverte pulse, et un trait animé le relie à sa fenêtre holographique : l'information « s'affiche sur la planète,
   au niveau du pays ». Calque 2D devant la scène ; le clic est géré par la page (cliquer / survoler). */
const ALT_MIN = 400, ALT_MAX = 18000, RAYON_CLIC = 15;

export function creerMarqueurs(conteneur) {
  const canvas = document.createElement('canvas'); canvas.className = 't-marqueurs'; conteneur.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let pays = [], L = 0, H = 0, dpr = 1, t = 0, visibles = [], survol = null;
  let titres = {};                                                 // code → {s: média, l: langue, t: [{t, u, d}]} : dernier titre de chaque pays (digest de la planète)
  const apparus = new Map();                                       // code → progression 0..1 de l'apparition
  function taille(l, h, d) { if (l === L && h === H && d === dpr) return; L = l; H = h; dpr = d; canvas.width = Math.round(l * d); canvas.height = Math.round(h * d); canvas.style.width = l + 'px'; canvas.style.height = h + 'px'; }

  function pin(x, y, rayon, couleur, alpha, pulse) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = couleur; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, rayon, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = couleur; ctx.beginPath(); ctx.arc(x, y, rayon * 0.38, 0, 6.2832); ctx.fill();
    if (pulse) { const p = (t * 0.9) % 1; ctx.globalAlpha = alpha * (1 - p); ctx.beginPath(); ctx.arc(x, y, rayon + p * 22, 0, 6.2832); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function liaison(x, y, el, couleur) {
    if (!el) return;
    const r = el.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!r.width) return;
    const gauche = r.left - cr.left, droite = r.right - cr.left, haut = r.top - cr.top, bas = r.bottom - cr.top;
    const cx = Math.max(gauche, Math.min(droite, x)), cy = Math.max(haut, Math.min(bas, y));      // point du cadre le plus proche du repère
    const bx = x < gauche ? gauche : x > droite ? droite : cx, by = y < haut ? haut : y > bas ? bas : cy;
    ctx.save(); ctx.strokeStyle = couleur; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = couleur; ctx.fillRect(bx - 3, by - 3, 6, 6); ctx.restore();
  }

  return {
    canvas,
    /* digest de la planète : le titre du jour de chaque pays s'affiche sous le nom au survol, avec l'étiquette de langue (aucune traduction) */
    definirTitres(d) { titres = d && typeof d === 'object' ? d : {}; },
    definirPays(liste) { pays = (liste || []).filter(p => p.flux > 0 && p.code !== 'MONDE' && Number.isFinite(p.lat)); },
    nombrePays: () => pays.length,
    liste: () => visibles.map(v => ({ code: v.code, nom: v.nom, x: v.x, y: v.y, titre: !!v.titre })),
    /* sel : code du pays dont la fenêtre est ouverte ; meteo : { lon, lat } du lieu météo ; elements : { actus, meteo } (éléments DOM des fenêtres) */
    maj(dt, { pose, fov, largeur, hauteur, actif = true, sel = null, meteo = null, elements = {}, dprMax = 2 }) {
      taille(largeur, hauteur, Math.min(window.devicePixelRatio || 1, dprMax)); t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L, H);
      visibles = [];
      const alt = pose.altitude, gab = alt >= ALT_MIN && alt <= ALT_MAX && actif;
      const vus = [];
      if (gab) {
        for (const p of pays) {
          const q = projeter(pose, fov, largeur, hauteur, p.lon, p.lat, 0);
          if (!q || q.x < 20 || q.x > largeur - 20 || q.y < 78 || q.y > hauteur - 20) { apparus.set(p.code, 0); continue; }
          if (vus.some(v => Math.hypot(v.x - q.x, v.y - q.y) < 16 && v.code !== sel)) continue;     // pas de repères qui se chevauchent
          vus.push({ code: p.code, nom: p.nom, x: q.x, y: q.y, dist: p.dist, lat: p.lat, lon: p.lon, titre: !!(titres[p.code] && titres[p.code].t && titres[p.code].t.length) });
        }
        for (const v of vus) {
          const a = Math.min(1, (apparus.get(v.code) || 0) + dt * 3.2); apparus.set(v.code, a);
          const choisi = v.code === sel, chaud = v.code === survol;
          pin(v.x, v.y, (choisi ? 7.5 : chaud ? 7 : 5.2) * (0.4 + 0.6 * a), choisi ? '#ffd24d' : chaud ? '#ffffff' : (v.titre ? '#6bffb0' : '#4de3ff'), a * (choisi || chaud ? 1 : 0.85), choisi);
          if (chaud || choisi) {
            ctx.font = '600 11px "Cascadia Mono", ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.letterSpacing = '1px';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,4,12,.85)'; ctx.strokeText(v.nom.toUpperCase(), v.x, v.y - 12); ctx.fillStyle = choisi ? '#ffd24d' : '#fff'; ctx.fillText(v.nom.toUpperCase(), v.x, v.y - 12);
            ctx.letterSpacing = '0px';
            const dt = titres[v.code] && titres[v.code].t && titres[v.code].t[0];
            if (dt) {   // titre du jour du pays, dans sa langue, sous le repère
              const lang = String(titres[v.code].l || '').toUpperCase(), texte = (lang ? '[' + lang + '] ' : '') + String(dt.t).replace(/\s+/g, ' ');
              ctx.font = '11px "Cascadia Mono", ui-monospace, Consolas, monospace'; ctx.textBaseline = 'top'; const court = texte.length > 70 ? texte.slice(0, 68) + '…' : texte;
              ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,4,12,.85)'; ctx.strokeText(court, v.x, v.y + 12); ctx.fillStyle = '#9fe9ff'; ctx.fillText(court, v.x, v.y + 12);
            }
          }
        }
        visibles = vus;
      } else if (survol) survol = null;
      // lieu météo + liaison
      let mx = null;
      if (meteo) {
        const q = projeter(pose, fov, largeur, hauteur, meteo.lon, meteo.lat, 0);
        if (q) { mx = q; pin(q.x, q.y, 7, '#ff9ad5', 1, true); }
      }
      if (sel) { const v = visibles.find(x => x.code === sel) || null; if (v && elements.actus) liaison(v.x, v.y, elements.actus, '#ffd24d'); }
      if (mx && elements.meteo) liaison(mx.x, mx.y, elements.meteo, '#ff9ad5');
    },
    /* Repère le plus proche d'un point (coordonnées CSS du canvas) ou null */
    pris(x, y) {
      let m = null, d = RAYON_CLIC;
      for (const v of visibles) { const e = Math.hypot(v.x - x, v.y - y); if (e < d) { d = e; m = v; } }
      return m;
    },
    survoler(x, y) { const m = this.pris(x, y); survol = m ? m.code : null; return m; },
    vider() { visibles = []; survol = null; apparus.clear(); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  };
}
