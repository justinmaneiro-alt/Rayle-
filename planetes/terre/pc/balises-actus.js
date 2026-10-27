import { projeter } from './projection.js';
import { disposerCartes, elementsBandeau, libelleMaj, libelleImportance, categorie } from './actus-sujets.js';

/* ═════════════ BALISES D'ACTUALITÉ SUR LA TERRE ═════════════
   Calque 2D devant la scène (même principe que marqueurs.js) :
   · balises pulsantes ancrées sur les lieux des sujets (couleur = catégorie, taille = nombre de médias qui en parlent) ;
   · cartes holographiques (titre, média, heure, lien) rangées dans les marges, reliées à leur balise par un trait animé ;
   · bandeau défilant des titres ; anneaux de zoom autour de la balise éclairée (sujet présenté par Raylé).
   Données : jamais inventées (titre, média, date, lien du flux ; localisation « estimée » signalée). Respecte le mode (body[data-hud]) et « réduire les animations ». */
const NB_CARTES = { complet: 6, normal: 4, leger: 2 };
const CARTE_L = 262, CARTE_H = 118;
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const reduitMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function creerBalisesActus(conteneur, { surChoix = () => {}, surLien = null } = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 't-balises'; conteneur.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const couche = document.createElement('div'); couche.className = 't-cartes'; conteneur.appendChild(couche);
  const bandeau = document.createElement('div'); bandeau.className = 't-bandeau'; bandeau.hidden = true; conteneur.appendChild(bandeau);
  let sujets = [], parId = new Map(), meta = { genere: null, perime: false, indisponibles: [], portee: '' };
  let L = 0, H = 0, dpr = 1, t = 0, tDef = 0, visibles = [], survol = null, eclaire = null, tEclaire = 0, selection = null, presentes = [], actif = false;
  const apparus = new Map(), cartes = new Map(), anneaux = [];     // id → progression 0..1 ; id → { el, x, y, cote } ; anneaux de zoom en cours
  let obstacles = [], nImages = 0;

  function taille(l, h, d) { if (l === L && h === H && d === dpr) return; L = l; H = h; dpr = d; canvas.width = Math.round(l * d); canvas.height = Math.round(h * d); canvas.style.width = l + 'px'; canvas.style.height = h + 'px'; }
  const mode = () => (document.body && document.body.dataset.hud) || 'normal';
  const reduit = () => !!(reduitMq && reduitMq.matches);

  /* ── bandeau défilant ── */
  function dessinerBandeau() {
    const els = elementsBandeau(sujets, mode() === 'leger' ? 8 : 14);
    bandeau.hidden = !actif || !els.length;
    if (!els.length) { bandeau.replaceChildren(); return; }
    const item = e => '<a class="t-bd-i" href="#" data-id="' + esc(e.id) + '"><i style="background:' + e.couleur + '"></i><b>' + esc(e.source) + '</b> ' + esc(e.texte) + '</a>';
    const html = els.map(item).join('');
    bandeau.innerHTML = '<span class="t-bd-t">' + esc(meta.portee ? meta.portee.toUpperCase() : 'ACTUALITÉS') + '</span><div class="t-bd-v"><div class="t-bd-piste" style="animation-duration:' + Math.max(40, els.length * 7) + 's">' + html + html + '</div></div>';
    bandeau.classList.toggle('t-fixe', reduit());
  }
  bandeau.addEventListener('click', e => { const a = e.target.closest('[data-id]'); if (!a) return; e.preventDefault(); surChoix(a.dataset.id, 'bandeau'); });

  /* ── cartes holographiques ── */
  function creerCarte(s) {
    const el = document.createElement('article'); el.className = 't-carte'; el.dataset.id = s.id; el.style.setProperty('--c', s.couleur);
    el.innerHTML = '<header><i></i><span>' + esc(s.catNom) + '</span><em>' + esc(libelleImportance(s.importance)) + '</em></header>'
      + '<div class="t-c-img"></div>'
      + '<a class="t-c-titre" href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.titre) + '</a>'
      + '<footer><b>' + esc(s.source) + '</b>' + (s.quand ? ' · ' + esc(s.quand) : '') + (s.lieu ? ' · ' + esc(s.lieu.texte) : '') + '</footer>';
    const zone = el.querySelector('.t-c-img');
    if (window.ImagesActus && ImagesActus.attacher(zone, s, { lieu: s.lieu })) el.classList.add('t-avec-image'); else zone.remove();   // image du média, sinon photo libre du lieu, sinon vue cartographique
    el.addEventListener('mouseenter', () => { survol = s.id; });
    el.addEventListener('mouseleave', () => { if (survol === s.id) survol = null; });
    el.addEventListener('click', e => { if (!e.target.closest('a')) surChoix(s.id, 'carte'); else if (surLien) surLien(s, e); });
    couche.appendChild(el);
    return el;
  }
  function retirerCarte(id) { const c = cartes.get(id); if (!c) return; c.el.classList.add('t-sort'); setTimeout(() => c.el.remove(), 350); cartes.delete(id); }

  function liaison(x, y, c, couleur, force) {
    const bx = c.cote === 'droite' ? c.x : c.x + CARTE_L, by = c.y + 22;
    ctx.save(); ctx.strokeStyle = couleur; ctx.lineWidth = force ? 1.8 : 1.2; ctx.globalAlpha = force ? 0.95 : 0.6;
    if (!reduit()) { ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 30; }
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = couleur; ctx.fillRect(bx - 3, by - 3, 6, 6);
    if (!reduit() && mode() !== 'leger') { const p = (t * 0.55 + (hash(c.id) % 10) / 10) % 1; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(x + (bx - x) * p, y + (by - y) * p, 2.2, 0, 6.2832); ctx.fill(); }
    ctx.restore();
  }

  function balise(x, y, s, a, forte, rang) {
    const r = s.rayon * (0.4 + 0.6 * a) * (forte ? 1.35 : 1), calme = reduit() || mode() === 'leger';
    ctx.globalAlpha = a; ctx.strokeStyle = s.couleur; ctx.fillStyle = s.couleur; ctx.lineWidth = forte ? 2.2 : 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = a * (forte ? 1 : 0.9); ctx.beginPath(); ctx.arc(x, y, Math.max(2, r * 0.42), 0, 6.2832); ctx.fill();
    if (!calme || forte) {
      const periode = s.importance >= 5 ? 1.5 : s.importance >= 3 ? 2 : 2.8, ph = ((t + (hash(s.id) % 100) / 100 * periode) % periode) / periode;
      ctx.globalAlpha = a * (1 - ph) * (s.importance >= 3 ? 0.9 : 0.65); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y, r + ph * (14 + s.rayon * 1.6), 0, 6.2832); ctx.stroke();
      if (s.importance >= 5 && !calme) { const p2 = (ph + 0.5) % 1; ctx.globalAlpha = a * (1 - p2) * 0.5; ctx.beginPath(); ctx.arc(x, y, r + p2 * (14 + s.rayon * 1.6), 0, 6.2832); ctx.stroke(); }
    }
    if (forte) {   // balise éclairée : halo et réticule
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4); g.addColorStop(0, s.couleur + '88'); g.addColorStop(1, s.couleur + '00');
      ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = s.couleur; ctx.lineWidth = 1.2;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(x + dx * (r + 3), y + dy * (r + 3)); ctx.lineTo(x + dx * (r + 11), y + dy * (r + 11)); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  const api = {
    canvas, couche, bandeau,
    /* modele : { sujets, genere, perime, indisponibles } issu de modelesFil ; portee : texte du bandeau (« France », « Monde »…) */
    definir(modele, { portee = '', presentes: ids = [] } = {}) {
      sujets = modele.sujets.slice(); parId = new Map(sujets.map(s => [s.id, s]));
      meta = { genere: modele.genere, perime: !!modele.perime, indisponibles: modele.indisponibles || [], portee };
      presentes = ids.filter(id => parId.has(id)); selection = null; eclaire = null; actif = true;
      for (const id of [...cartes.keys()]) retirerCarte(id);
      apparus.clear(); tDef = 0; dessinerBandeau();
    },
    /* Ajoute des sujets sans remplacer les autres (sujets présentés par l'IA que le fil ne contient pas encore) */
    ajouter(liste) { let neuf = false; for (const s of liste) if (!parId.has(s.id)) { sujets.push(s); parId.set(s.id, s); neuf = true; } if (neuf) dessinerBandeau(); },
    vider() { sujets = []; parId.clear(); presentes = []; selection = null; eclaire = null; actif = false; visibles = []; for (const id of [...cartes.keys()]) retirerCarte(id); apparus.clear(); bandeau.hidden = true; if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); },
    actif: () => actif,
    sujet: id => parId.get(id) || null,
    /* Éclaire une balise (sujet présenté) : halo, anneaux de zoom, carte mise en avant. */
    eclairer(id) { if (!parId.has(id)) return false; eclaire = id; tEclaire = 0; selection = id; if (!reduit()) anneaux.push({ id, t: 0 }); return true; },
    apaiser() { eclaire = null; },
    eclaire: () => eclaire,
    choisir(id) { selection = parId.has(id) ? id : null; },
    pris(x, y) { let m = null, d = 1e9; for (const v of visibles) { const e = Math.hypot(v.x - x, v.y - y); if (e < Math.max(14, v.s.rayon + 7) && e < d) { d = e; m = v.s; } } return m; },
    survoler(x, y) { const m = api.pris(x, y); survol = m ? m.id : null; return m; },
    /* Pour les tests et l'IA : ce qui est réellement à l'écran */
    etat: () => ({ actif, sujets: sujets.length, visibles: visibles.map(v => ({ id: v.s.id, x: Math.round(v.x), y: Math.round(v.y), couleur: v.s.couleur, rayon: v.s.rayon, importance: v.s.importance })), cartes: [...cartes.entries()].map(([id, c]) => ({ id, x: Math.round(c.x), y: Math.round(c.y), cote: c.cote })), eclaire, selection, maj: meta.genere, bandeau: !bandeau.hidden, pannes: meta.indisponibles.slice() }),
    majTexte: () => libelleMaj(meta.genere),
    maj(dt, { pose, fov, largeur, hauteur, actif: autorise = true, dprMax = 2, jeu = false }) {
      taille(largeur, hauteur, Math.min(window.devicePixelRatio || 1, dprMax)); t += dt; tEclaire += dt; tDef += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L, H);
      visibles = [];
      const montrer = actif && autorise && sujets.length > 0;
      bandeau.style.display = montrer && !jeu ? '' : 'none'; couche.style.display = montrer ? '' : 'none';
      if (!montrer) { for (const id of [...cartes.keys()]) retirerCarte(id); return; }
      // projection des sujets localisés ; plus important d'abord pour garder les grandes balises au premier plan
      const vus = [];
      for (const s of sujets) {
        if (!s.lieu) continue;
        const q = projeter(pose, fov, largeur, hauteur, s.lieu.lon, s.lieu.lat, 0);
        if (!q || q.x < 10 || q.x > largeur - 10 || q.y < 70 || q.y > hauteur - 10) { apparus.set(s.id, 0); continue; }
        vus.push({ s, x: q.x, y: q.y });
      }
      vus.sort((a, b) => b.s.importance - a.s.importance);
      const gardes = [];
      for (const v of vus) { if (gardes.some(g => Math.hypot(g.x - v.x, g.y - v.y) < 9 && g.s.id !== eclaire && v.s.id !== eclaire)) continue; gardes.push(v); }
      visibles = gardes;
      gardes.forEach((v, i) => {
        const a0 = apparus.get(v.s.id) || 0;
        const a = reduit() ? 1 : (tDef > Math.min(1.2, i * 0.05) ? Math.min(1, a0 + dt * 2.4) : a0); apparus.set(v.s.id, a);   // apparition échelonnée, la plus importante d'abord
        v.a = a * (v.s.id === survol || v.s.id === eclaire ? 1 : 0.92);
      });
      // cartes : sujets présentés, puis le plus important, la carte choisie ou survolée ; nombre selon le mode
      const nb = jeu ? 2 : (NB_CARTES[mode()] || 4);
      const voulus = [];
      const ajout = id => { const v = gardes.find(g => g.s.id === id); if (v && !voulus.includes(v)) voulus.push(v); };
      if (selection) ajout(selection); if (eclaire) ajout(eclaire);
      for (const id of presentes) ajout(id);
      for (const v of gardes) ajout(v.s.id);
      const choisis = voulus.slice(0, nb);
      if (++nImages % 12 === 1) obstacles = [...document.querySelectorAll('#panneaux .pn')].map(el => el.getBoundingClientRect()).filter(r => r.width > 40).map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height }));   // fenêtres holographiques ouvertes : les cartes s'écartent
      const pos = disposerCartes(choisis.map(v => ({ id: v.s.id, x: v.x, y: v.y })), largeur, hauteur, { carteL: CARTE_L, carteH: CARTE_H, max: nb, obstacles });
      for (const id of [...cartes.keys()]) if (!pos[id]) retirerCarte(id);
      for (const v of choisis) {
        const p = pos[v.s.id]; if (!p) continue;
        let c = cartes.get(v.s.id);
        if (!c) { c = { id: v.s.id, el: creerCarte(v.s), x: p.x, y: p.y, cote: p.cote, premier: true }; cartes.set(v.s.id, c); c.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; requestAnimationFrame(() => c.el.classList.add('t-entre')); }
        else if (c.x !== p.x || c.y !== p.y) { c.x = p.x; c.y = p.y; c.cote = p.cote; c.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; }
        c.el.classList.toggle('t-eclaire', v.s.id === eclaire); c.el.classList.toggle('t-choisie', v.s.id === selection);
      }
      // dessin : traits, balises, anneaux de zoom
      for (const v of choisis) { const c = cartes.get(v.s.id); if (c) liaison(v.x, v.y, c, v.s.couleur, v.s.id === eclaire || v.s.id === selection); }
      for (const v of gardes) balise(v.x, v.y, v.s, v.a, v.s.id === eclaire || v.s.id === survol || v.s.id === selection);
      for (let i = anneaux.length - 1; i >= 0; i--) {
        const an = anneaux[i], v = gardes.find(g => g.s.id === an.id); an.t += dt;
        if (an.t > 1.4 || !v) { if (an.t > 1.4) anneaux.splice(i, 1); continue; }
        ctx.strokeStyle = v.s.couleur; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { const p = Math.min(1, Math.max(0, (an.t - k * 0.16) / 0.9)); if (p <= 0 || p >= 1) continue; ctx.globalAlpha = (1 - p) * 0.85; ctx.beginPath(); ctx.arc(v.x, v.y, 12 + (1 - p) * 90, 0, 6.2832); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
  };
  return api;
}
