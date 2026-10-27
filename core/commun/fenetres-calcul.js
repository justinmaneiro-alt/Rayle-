/* ═════════════ GESTIONNAIRE DE FENÊTRES COMMUN : CALCULS PURS (testés) ═════════════
   Placement, taille et rangement de fenêtres en rectangles { x, y, l, h } dans un écran { l, h }. Aucune dépendance au navigateur.
   creerCalcul({ marge, haut, bas, miniL, miniH, seuilEtroit, zones, tailles, plafond }) rend les fonctions d'un « profil » (anatomie, Mars, accueil…) :
   - haut / bas : bandes réservées en haut et en bas de l'écran (barre d'état, barre « Fenêtres »)
   - zones(ecran) : rectangles à éviter si possible ({ x, y, l, h, poids })
   - tailles : { genre: [part de la largeur, part de la hauteur] } ; plafond : { genre: [largeur max, hauteur max] }
   Les fenêtres ne sont jamais minuscules : taille minimale confortable, et réduites au plus à 50 % de leur taille voulue (jamais sous 460 × 380 sur un écran large, ni sous le minimum) pour trouver une place. */
export function creerCalcul(cfg = {}) {
  const MARGE = cfg.marge ?? 10, HAUT_RESERVE = cfg.haut ?? 56, BAS_RESERVE = cfg.bas ?? 64, MINI_L = cfg.miniL ?? 320, MINI_H = cfg.miniH ?? 200, SEUIL_ETROIT = cfg.seuilEtroit ?? 821;
  const TAILLES = { fiche: [0.30, 0.78], mouvement: [0.34, 0.74], vue3d: [0.30, 0.55], pathologie: [0.34, 0.76], catalogue: [0.36, 0.80], aide: [0.26, 0.4], graphique: [0.40, 0.62], panneau: [0.32, 0.62], petite: [0.2, 0.3], ...(cfg.tailles || {}) };
  const PLAFOND = { catalogue: [900, 1000], graphique: [1400, 900], petite: [440, 360], ...(cfg.plafond || {}) }, PLAFOND_DEFAUT = [820, 1000];
  const zonesCfg = cfg.zones || (() => []);
  const etroit = ecran => ecran.l < SEUIL_ETROIT;
  const aire = (a, b) => Math.max(0, Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  /* Taille par défaut selon le genre et l'écran ; jamais plus grande que l'écran utile, jamais sous le minimum confortable. */
  function tailleParDefaut(genre, ecran) {
    const utileL = ecran.l - 2 * MARGE, utileH = ecran.h - HAUT_RESERVE - BAS_RESERVE, b = TAILLES[genre] || [0.30, 0.60], pl = PLAFOND[genre] || PLAFOND_DEFAUT;
    let l = Math.round(ecran.l * b[0]), h = Math.round(ecran.h * b[1]);
    l = Math.max(MINI_L, Math.min(l, pl[0])); h = Math.max(MINI_H, Math.min(h, pl[1]));
    return { l: Math.min(l, utileL), h: Math.min(h, utileH) };
  }
  /* Ramène un rectangle entièrement dans l'écran utile : jamais tronqué par un bord, jamais complètement hors de l'écran. */
  function limiter(r, ecran) {
    const l = Math.max(Math.min(MINI_L, ecran.l - 2 * MARGE), Math.min(r.l, ecran.l - 2 * MARGE)), h = Math.max(Math.min(MINI_H, ecran.h - HAUT_RESERVE - BAS_RESERVE), Math.min(r.h, ecran.h - HAUT_RESERVE - BAS_RESERVE));
    const x = Math.max(MARGE, Math.min(r.x, ecran.l - MARGE - l)), y = Math.max(HAUT_RESERVE, Math.min(r.y, ecran.h - BAS_RESERVE - h));
    return { x, y, l, h };
  }
  function placer1(existantes, taille, ecran, pas) {
    const t = limiter({ x: 0, y: 0, l: taille.l, h: taille.h }, ecran);
    if (etroit(ecran)) return { x: MARGE, y: HAUT_RESERVE, l: ecran.l - 2 * MARGE, h: ecran.h - HAUT_RESERVE - BAS_RESERVE, cout: 0 };
    const zones = zonesCfg(ecran); let meilleur = null;
    const xMax = ecran.l - MARGE - t.l, yMax = ecran.h - BAS_RESERVE - t.h;
    for (let x = xMax; x >= MARGE; x -= pas) for (let y = HAUT_RESERVE; y <= yMax; y += pas) {
      const c = { x, y, l: t.l, h: t.h }; let cout = 0;
      for (const e of existantes) cout += aire(c, e);
      for (const z of zones) cout += aire(c, z) * (z.poids ?? 1);
      cout += (xMax - x) * 0.02 + (y - HAUT_RESERVE) * 0.01;
      if (!meilleur || cout < meilleur.cout - 1e-9) meilleur = { cout, x, y };
      if (cout === 0) break;
    }
    return { x: meilleur ? meilleur.x : xMax, y: meilleur ? meilleur.y : HAUT_RESERVE, l: t.l, h: t.h, cout: meilleur ? meilleur.cout : 1e12 };
  }
  /* Plancher de lisibilité d'une fenêtre qui cherche sa place : 460 × 380 sur un écran large (jamais plus que sa taille voulue), le minimum absolu sinon. */
  const planchers = (taille, ecran) => (ecran.l >= 1280 ? { l: Math.min(taille.l, Math.max(cfg.plancherL ?? 460, Math.round(taille.l * 0.75))), h: Math.min(taille.h, Math.max(cfg.plancherH ?? 380, Math.round(taille.h * 0.75))) } : { l: Math.min(taille.l, MINI_L), h: Math.min(taille.h, MINI_H) });
  /* Meilleur emplacement. Si aucune place libre, la fenêtre peut rétrécir jusqu'à 50 % de sa taille (jamais sous 460 × 380 sur un écran large) ; sinon elle recouvre le moins possible. */
  function placer(existantes, taille, ecran, { pas = 24 } = {}) {
    let essai = placer1(existantes, taille, ecran, pas);
    const pl = planchers(taille, ecran);
    for (const k of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      if (essai.cout < 60 || etroit(ecran)) break;
      const e2 = placer1(existantes, { l: Math.max(pl.l, Math.round(taille.l * k)), h: Math.max(pl.h, Math.round(taille.h * k)) }, ecran, pas);
      if (e2.cout < essai.cout - 1) essai = e2;
    }
    const { cout, ...r } = essai; void cout; return r;
  }
  /* Réorganisation en grille propre : si tout tient, colonnes régulières (rangées de même hauteur) ; sinon repli sur placer(). */
  function reorganiser(liste, ecran) {
    const n = liste.length; if (!n) return [];
    if (etroit(ecran)) return liste.map(f => ({ id: f.id, ...placer([], { l: f.l, h: f.h }, ecran) }));
    const zones = zonesCfg(ecran).filter(z => (z.poids ?? 1) >= 3), gauche = zones.reduce((m, z) => Math.max(m, z.x + z.l), 0);
    const x0 = Math.max(MARGE, gauche), L = ecran.l - MARGE - x0, H = ecran.h - HAUT_RESERVE - BAS_RESERVE;
    let meilleure = null;                    // la grille dont les cases sont les plus grandes à proportion d'écran (≈ 1,35 de large pour 1 de haut)
    for (let cols = 1; cols <= n; cols++) {
      const rangs = Math.ceil(n / cols), l = Math.floor((L - (cols - 1) * MARGE) / cols), h = Math.floor((H - (rangs - 1) * MARGE) / rangs);
      if (l < MINI_L || h < MINI_H) continue;
      const note = Math.min(l / 1.35, h); if (!meilleure || note > meilleure.note) meilleure = { cols, l, h, note };
    }
    if (meilleure) { const { cols, l, h } = meilleure; return liste.map((f, i) => ({ id: f.id, x: x0 + (i % cols) * (l + MARGE), y: HAUT_RESERVE + Math.floor(i / cols) * (h + MARGE), l, h })); }
    const posees = [], sortie = [];
    for (const f of liste) { const p = placer(posees, { l: f.l, h: f.h }, ecran); posees.push(p); sortie.push({ id: f.id, ...p }); }
    return sortie;
  }
  function recouvrements(liste) {
    const n = []; for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) { const a = aire(liste[i], liste[j]); if (a > 0) n.push([liste[i].id, liste[j].id, a]); }
    return n;
  }
  const dansEcran = (r, ecran) => r.x >= 0 && r.y >= 0 && r.x + r.l <= ecran.l && r.y + r.h <= ecran.h;
  /* Zone « agrandie » : tout l'écran utile. */
  const pleinEcran = ecran => limiter({ x: MARGE, y: HAUT_RESERVE, l: ecran.l - 2 * MARGE, h: ecran.h - HAUT_RESERVE - BAS_RESERVE }, ecran);
  /* Redimensionnement à deux doigts : le rectangle de départ est mis à l'échelle autour de son centre (ratio d'écartement des doigts), puis ramené dans l'écran. */
  function pincer(r0, ratio, ecran) {
    const k = Math.max(0.4, Math.min(4, ratio)), l = Math.round(r0.l * k), h = Math.round(r0.h * k), cx = r0.x + r0.l / 2, cy = r0.y + r0.h / 2;
    return limiter({ x: Math.round(cx - l / 2), y: Math.round(cy - h / 2), l, h }, ecran);
  }
  return { MARGE, HAUT_RESERVE, BAS_RESERVE, MINI_L, MINI_H, SEUIL_ETROIT, etroit, tailleParDefaut, limiter, placer, reorganiser, recouvrements, dansEcran, pleinEcran, pincer, chevauchement: aire };
}
export const calculDefaut = creerCalcul();
