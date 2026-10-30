"use strict";
/* ═════════════ GESTES V5 : moteur « souris dans l'air », calcul PUR (aucun accès au DOM, testé sous Node) ═════════════
   Entrée : des images de points de main (21 repères MediaPipe par main), comme le moteur de la V2 (gestes-calcul.js, conservé tel quel : réglage « moteur V2 »).
   Sortie : des ACTIONS en coordonnées d'écran ABSOLUES (pixels), appliquées par gestes-v5-actions.js :
     curseur {x,y} · clic {n,bouton} · prise {x,y} / deplace {x,y} / lache · defile {dx,dy} · deux_debut / deux {type,p1,p2,d,ang} / deux_fin
   et des ÉVÉNEMENTS pour l'interface (engage, pause, reprise, balayage, ranger_bas, vue_initiale, accueil, suivre, fermer_*…).
   V11 — MODE SIMPLE (par défaut) : 5 gestes seulement, sans faux déclenchements.
     pointer (la pointe de l'index déplace le curseur) · pincer = clic, pincer et bouger = glisser · balayer main ouverte = parcourir/revenir · deux mains qui s'écartent ou se rapprochent = agrandir/rétrécir ·
     paume ouverte immobile 1,5 s = vue d'origine / accueil. Engagement : une main visible et stable 0,4 s suffit ; sortir la main du cadre désengage. AUCUNE pause par un geste (ni poing, ni main à plat, ni deux poings) :
     la pause se fait par le bouton, par la voix, ou (mode avancé seulement) par un poing IMMOBILE tenu 2 s avec barre de progression, annulable en rouvrant la main.
     MODE AVANCÉ (`gestesAvances: true`) : poing (pause, fermer), ranger vers le bas, recul = accueil, deux doigts = défiler, index immobile = suivre, deux mains ouvertes = pivoter.
   Principes :
     · zone active centrale réglable (70 % × 70 % du cadre par défaut) étirée sur tout l'écran ; mode relatif en option ;
     · lissage One Euro des repères PUIS du curseur, plus une légère prédiction (1 à 2 images) ; main sortie du cadre < 0,5 s : état conservé ;
     · pincement mesuré par rapport à la taille de la main, hystérésis, durée minimale ; le curseur SE FIGE dès que le pincement s'amorce ;
     · engagement (main ouverte tenue ≈ 0,7 s) et pause (poing tenu 1 s) : sans engagement, aucune action n'est envoyée ;
     · doigts tendus/repliés avec hystérésis par doigt : les poses intermédiaires ne déclenchent rien. */
(function (racine) {
  const GC = racine.GestesCalcul || (typeof require === 'function' ? require('./gestes-calcul.js') : null);
  if (!GC) throw new Error('GestesV5 demande gestes-calcul.js');
  const { P, DOIGTS, creerOneEuro, echelleMain, centrePaume, fusion, d2 } = GC;
  const PI = Math.PI, milieu = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const borne = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, u) => a + (b - a) * u;

  const DEFAUTS = {
    ecran: { l: 1920, h: 1080 }, ratio: 4 / 3, miroir: true, droitier: true,
    zone: { l: 0.7, h: 0.7, cx: 0.5, cy: 0.5 },      // fractions du CADRE de la caméra (largeur, hauteur, centre) qui couvrent TOUT l'écran
    modeRelatif: false, gainRelatif: 1.5,            // relatif : la main peut se reposer ; gain = déplacement d'écran par déplacement de main (en « zones »)
    lissage: 0.5,                                    // 0 réactif … 1 très lissé
    predictionMs: 30,
    zoneMorte: 6, zoneAuto: true, zoneMorteMax: 16, facteurBruit: 1.6,   // zoneAuto : la zone morte grandit toute seule (jusqu'à zoneMorteMax) si le tremblement mesuré à l'arrêt est plus fort que prévu
                                       // V10 : rayon (px) de la zone morte du curseur : la main immobile qui tremble ne le bouge pas (0 = désactivée) ; en mouvement il suit à 6 px près
    sensibiliteClic: 1,                              // multiplie les seuils de pincement (plus grand = plus facile à pincer)
    seuilFerme: 0.30, seuilOuvre: 0.45,              // distance pouce–index / taille de la main : sous seuilFerme = pincé, au-dessus de seuilOuvre = ouvert
    clicMin: 60, clicMax: 420, relacheImages: 2, rejetAberrant: true,   // V10 : un pincement de moins de 60 ms est un parasite de la détection (une image à 30/s), pas un clic ; une image « ouverte » isolée ne relâche pas (il faut 2 images de suite)
    delaiMaintien: 260, doubleClic: 650, deriveClic: 0.25,
    engagementMs: 700, pauseMs: 2000, deuxPoingsMs: 1500, exigerEngagement: true,
    gestesAvances: false, engagementRapideMs: 400, desengageRapideMs: 1000, vitesseStable: 1.6,   // V11 : mode simple par défaut ; engagement en 0,4 s (main visible et non agitée) ; désengagement 1 s après la sortie du cadre
    perteMainMs: 500, desengageMs: 2500, stabiliteMs: 55,
    balayage: { vitesseMin: 1.15, distanceMin: 0.2, dureeMax: 520, recharge: 850 },
    rangerBas: { vitesseMin: 1.0, distanceMin: 0.18 },
    fermer: { poingMin: 180, poingMax: 900, ouvertureMs: 450, confirmationMs: 500 },
    suivreMs: 1000, suivreRayon: 28, resetMs: 1500, resetRayon: 0.06,
    recul: { fenetreMs: 450, rapport: 0.72, recharge: 1800 }, reculActif: true,   // main ouverte qui recule = retour à l'accueil (désactivable)
    gainDefile: 1.6, defileMort: 0.004,
    gainRotation: 0.5, gainZoom: 1
  };

  // ── doigts tendus / repliés, avec hystérésis PAR DOIGT (un doigt à mi-course garde son dernier état : pas de pose parasite) ──
  function angleEn(a, b, c) { const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], n = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]); if (n < 1e-9) return 180; return Math.acos(borne((v1[0] * v2[0] + v1[1] * v2[1]) / n, -1, 1)) * 180 / PI; }
  function majDoigts(etat, pts) {
    const w = pts[P.poignet];
    for (const [nom, mcp, pip, bout] of DOIGTS) {
      const dB = d2(pts[bout], w), dP = d2(pts[pip], w), ang = angleEn(pts[mcp], pts[pip], pts[bout]);
      if (dB > dP * 1.08 && ang > 150) etat[nom] = true;
      else if (dB < dP * 1.0 || ang < 118) etat[nom] = false;
      else if (etat[nom] === undefined) etat[nom] = ang > 135;
    }
    return etat;
  }
  /* Pose d'après l'état des doigts (le pincement est géré à part). */
  function poseDoigts(e) {
    const n = (e.index ? 1 : 0) + (e.majeur ? 1 : 0) + (e.annulaire ? 1 : 0) + (e.auriculaire ? 1 : 0);
    if (n === 4) return 'ouverte';
    if (n === 0) return 'poing';
    if (e.index && !e.majeur && !e.annulaire && !e.auriculaire) return 'pointer';
    if (e.index && e.majeur && !e.annulaire && !e.auriculaire) return 'deux';
    return 'autre';
  }
  /* Un bout de doigt « utile » pour pincer : il pointe vers l'avant (loin du poignet), ce qui exclut le poing (bout recourbé contre la paume). */
  /* V11 : paume « bien droite » (doigts vers le haut, à 40° près) : seule une main présentée ainsi, immobile 1,5 s, ramène à l'accueil. Une main qui se repose penchée ou de profil ne déclenche rien. */
  const paumeDroite = (pts, ratio) => { const w = pts[P.poignet], m = pts[P.majeurMcp], dx = (m[0] - w[0]) * (ratio || 4 / 3), dy = m[1] - w[1]; return dy < 0 && Math.abs(dx) < Math.abs(dy) * 0.84; };
  const boutAvance = (pts, bout, mcp) => d2(pts[bout], pts[P.poignet]) > d2(pts[mcp], pts[P.poignet]) * 1.12;

  // ── projection image → écran (zone active) ──
  function versEcran(u, v, o) {
    const z = o.zone, x = (u - (z.cx - z.l / 2)) / z.l, y = (v - (z.cy - z.h / 2)) / z.h;
    return [borne(x, 0, 1) * (o.ecran.l - 1), borne(y, 0, 1) * (o.ecran.h - 1)];
  }

  /* Aimantation douce vers les cibles cliquables (rectangles d'écran { x, y, l, h, id }). Zone cliquable élargie à `min` pixels (≈ 44) : dedans, le curseur est ramené DANS l'élément (le clic l'atteint) ;
     à moins de `rayon` pixels, il est attiré d'une fraction `force`. Renvoie { x, y, cible, dedans }. */
  function aimanter(x, y, cibles, { rayon = 56, force = 0.35, min = 44, capture = 0 } = {}) {
    let meilleur = null, dMin = Infinity;
    for (const c of cibles || []) {
      const ex = Math.max(0, (min - c.l) / 2), ey = Math.max(0, (min - c.h) / 2);
      const dedansElargi = x >= c.x - ex && x <= c.x + c.l + ex && y >= c.y - ey && y <= c.y + c.h + ey;
      const px = borne(x, c.x, c.x + c.l), py = borne(y, c.y, c.y + c.h), d = Math.hypot(x - px, y - py);
      const captee = dedansElargi || d <= capture;   // « capture » : à un clic, un élément à moins de `capture` pixels est visé à coup sûr
      const note = captee ? d - 1000 : d;   // un élément dont la zone élargie contient le curseur passe avant les autres
      if ((captee || d <= rayon) && note < dMin) { dMin = note; meilleur = { c, px, py, d, dedansElargi: captee }; }
    }
    if (!meilleur) return { x, y, cible: null, dedans: false };
    const { c, px, py, d, dedansElargi } = meilleur, marge = Math.min(6, c.l / 3, c.h / 3);
    const cx = borne(px, c.x + marge, c.x + c.l - marge), cy = borne(py, c.y + marge, c.y + c.h - marge);
    if (dedansElargi) return { x: d === 0 ? x : cx, y: d === 0 ? y : cy, cible: c.id, dedans: true };
    const k = force * (1 - d / rayon); return { x: x + (cx - x) * k, y: y + (cy - y) * k, cible: c.id, dedans: false };
  }

  /* ── calibrage automatique (10 s) : taille de la main, zone confortable, seuils de pincement ──
     échantillons : { ratios:[pouce–index / taille], pointes:[[u,v]] (bout de l'index, miroir, 0…1), echelles:[taille de la main en largeur d'image],
                      repos:[[x,y]] (bout de l'index IMMOBILE, en pixels d'écran : sert à régler la zone morte sur le tremblement réel de cette main et de cette caméra), vitesses:[largeurs d'image par seconde pendant le balayage] } */
  function calibrerAuto({ ratios = [], pointes = [], echelles = [], repos = [], vitesses = [] } = {}) {
    const q = (l, f) => { const s = l.slice().sort((a, b) => a - b); return s[Math.floor((s.length - 1) * f)]; };
    const sortie = { ok: true, raisons: [] };
    if (pointes.length >= 20) {
      const us = pointes.map(p => p[0]), vs = pointes.map(p => p[1]), lu = q(us, 0.95) - q(us, 0.05), lv = q(vs, 0.95) - q(vs, 0.05);
      if (lu < 0.08 || lv < 0.05) { sortie.zone = null; sortie.raisons.push('Mouvement trop petit : balaie tout l’écran avec le doigt, coins compris.'); }
      else sortie.zone = { l: +borne(lu * 1.08, 0.3, 1).toFixed(3), h: +borne(lv * 1.08, 0.3, 1).toFixed(3), cx: +((q(us, 0.95) + q(us, 0.05)) / 2).toFixed(3), cy: +((q(vs, 0.95) + q(vs, 0.05)) / 2).toFixed(3) };
    } else { sortie.zone = null; sortie.raisons.push('Pas assez de points de la main pour régler la zone.'); }
    if (ratios.length >= 20) {   // deux groupes (pincé / ouvert) : 2-moyennes en une dimension
      let a = q(ratios, 0.1), b = q(ratios, 0.9);
      for (let i = 0; i < 12; i++) { const g1 = ratios.filter(r => Math.abs(r - a) <= Math.abs(r - b)), g2 = ratios.filter(r => Math.abs(r - a) > Math.abs(r - b)); if (!g1.length || !g2.length) break; a = g1.reduce((s, x) => s + x, 0) / g1.length; b = g2.reduce((s, x) => s + x, 0) / g2.length; }
      if (b - a < 0.15) { sortie.seuils = null; sortie.raisons.push('Pincé et ouvert sont trop proches (' + a.toFixed(2) + ' contre ' + b.toFixed(2) + ') : pince plusieurs fois franchement, puis rouvre la main.'); }
      else sortie.seuils = { seuilFerme: +(a + (b - a) * 0.3).toFixed(3), seuilOuvre: +(a + (b - a) * 0.55).toFixed(3), pince: +a.toFixed(3), ouvert: +b.toFixed(3) };
    } else { sortie.seuils = null; sortie.raisons.push('Pas assez de mesures de pincement : pince et rouvre plusieurs fois.'); }
    if (echelles.length >= 10) {
      const e = q(echelles, 0.5); sortie.tailleMain = +e.toFixed(4);
      sortie.distance = e < 0.07 ? 'trop loin : rapproche la main (40 à 60 cm)' : e > 0.3 ? 'trop près : éloigne la main (40 à 60 cm)' : 'bonne distance';
    }
    if (repos.length >= 15) {   // V10 : zone morte réglée sur le bruit mesuré (2,5 écarts-types, entre 4 et 14 px)
      const mx = repos.reduce((a, p) => a + p[0], 0) / repos.length, my = repos.reduce((a, p) => a + p[1], 0) / repos.length;
      const sigma = Math.sqrt(repos.reduce((a, p) => a + (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my), 0) / repos.length / 2);
      sortie.zoneMorte = +borne(sigma * 2.5, 4, 14).toFixed(1); sortie.tremblementBrut = +(sigma * 2).toFixed(1);
    } else sortie.raisons.push('Pas assez de points à l’arrêt pour régler la zone morte : garde l’index immobile quelques secondes.');
    if (vitesses.length >= 10) {   // V10 : vitesse habituelle du doigt → lissage (rapide : plus réactif ; lent et précis : plus stable)
      const v = q(vitesses, 0.9); sortie.vitesse = +v.toFixed(2); sortie.lissage = v > 1.5 ? 0.35 : v < 0.6 ? 0.6 : 0.5;
    }
    sortie.ok = !!(sortie.zone || sortie.seuils || sortie.zoneMorte);
    return sortie;
  }

  // ══════════════ moteur ══════════════
  function creerMoteur(options) {
    const o = fusion(DEFAUTS, options || {});
    const seuils = () => ({ f: o.seuilFerme * o.sensibiliteClic, o: o.seuilOuvre * o.sensibiliteClic });
    const cfgPoint = () => ({ minCutoff: lerp(5, 2.5, o.lissage), beta: 2.5, dCutoff: 1 });   // repères de la main : beta grand = peu de retard quand la main bouge, calme à l'arrêt
    const cfgEcran = () => ({ minCutoff: lerp(6, 1.2, o.lissage), beta: 0.006, dCutoff: 1 });   // curseur à l'écran, en pixels
    const S = {
      mains: new Map(), mode: 'sans-main', modeDepuis: 0, dernierClic: -1e9, derniereRecharge: -1e9, derniereRangee: -1e9, dernierRecul: -1e9,
      cur: { x: o.ecran.l / 2, y: o.ecran.h / 2 }, libre: { x: o.ecran.l / 2, y: o.ecran.h / 2 }, stable: { x: o.ecran.l / 2, y: o.ecran.h / 2 }, hist: [], dz: { x: o.ecran.l / 2, y: o.ecran.h / 2 }, fh: [], verrou: false, bruit: null, fx: creerOneEuro(cfgEcran()), fy: creerOneEuro(cfgEcran()), vit: { x: 0, y: 0 }, tCur: 0,
      prise: null, deux: null, deuxPoingsDepuis: 0, sansMainDepuis: 0, ouverteDepuis: 0, poingDepuis: 0, progres: null, fermer: null, arretDepuis: 0, arretPos: null, suivreFait: false, resetFait: false,
      derniereVue: 0, tDernier: 0, rel: null
    };
    const nouvelleMain = () => ({ filtres: Array.from({ length: 63 }, () => creerOneEuro(cfgPoint())), doigts: {}, pose: 'autre', candidate: 'autre', candidateDepuis: 0, pince: null, rI: 9, rM: 9, ech: 0.1, histo: [], derniereVue: 0, brut: null, pts: null, centre: [0, 0], enPince: null, aPoseDepuis: 0 });

    function lisser(h, main, t) {
      const x0 = (o.miroir ? 1 - main.pts[0][0] : main.pts[0][0]) * o.ratio;
      if (h.brut && h.derniereVue) {
        const dt = t - h.derniereVue, saut = d2(h.brut[0], [x0, main.pts[0][1]]), vite = saut / Math.max(0.016, dt / 1000) > 6;
        const remise = () => { for (const f of h.filtres) f.reset(); h.doigts = {}; h.pince = null; h.enPince = null; h.histo.length = 0; h.pose = 'autre'; h.candidate = 'autre'; h.suspect = null; };
        if (dt > o.perteMainMs) remise();
        else if (vite && (!o.rejetAberrant || !(h.pince || h.enPince))) remise();   // le rejet ne protège que les pincements en cours (clic, saisie) : en pointant, un saut est suivi tout de suite comme avant
        else if (vite) {   // V10 : un saut énorme d'UNE seule image est une détection aberrante (la main ne téléporte pas) : elle est IGNORÉE ; si l'image suivante confirme le saut, c'est réel
          const s = h.suspect;
          if (s && (s.n >= 2 || d2([s.x, s.y], [x0, main.pts[0][1]]) / Math.max(0.016, (t - s.t) / 1000) < 6)) remise();   // jamais plus de 2 images ignorées de suite : un vrai geste très vif est accepté
          else { h.suspect = { x: x0, y: main.pts[0][1], t, n: s ? s.n + 1 : 1 }; return h.pts; }
        } else h.suspect = null;
      }
      const pts = [], brut = [];
      for (let i = 0; i < 21; i++) {
        const p = main.pts[i], x = (o.miroir ? 1 - p[0] : p[0]) * o.ratio, y = p[1], z = (p[2] || 0) * o.ratio;
        brut.push([x, y, z]); pts.push([h.filtres[3 * i].filtrer(x, t), h.filtres[3 * i + 1].filtrer(y, t), h.filtres[3 * i + 2].filtrer(z, t)]);
      }
      h.brut = brut; return pts;
    }
    const cleMain = (lat, vues) => { let k = o.miroir ? (lat === 'Left' ? 'Right' : 'Left') : lat; while (vues.has(k)) k = k === 'Left' ? 'Right' : 'Left'; vues.add(k); return k; };
    const ptEcran = pt => versEcran(pt[0] / o.ratio, pt[1], o);

    function changerMode(m, t, sortie, evt) { if (S.mode === m) return; S.mode = m; S.modeDepuis = t; S.progres = null; if (evt) sortie.evenements.push(evt); }
    function libererTout(sortie, raison) {
      if (S.prise) { sortie.actions.push({ a: 'lache' }); sortie.evenements.push({ type: 'lacher', raison }); S.prise = null; }
      if (S.deux) { sortie.actions.push({ a: 'deux_fin' }); sortie.evenements.push({ type: 'fin_deux' }); S.deux = null; }
      if (S.fermer) { sortie.evenements.push({ type: 'fermer_annule' }); S.fermer = null; }
      for (const h of S.mains.values()) { h.enPince = null; }
    }

    /* curseur filtré + prédiction ; renvoie la position à AFFICHER */
    function suivreCurseur(brut, t) {
      if (!S.tCur || t - S.tCur > 500) { S.fx.reset(); S.fy.reset(); S.vit = { x: 0, y: 0 }; S.cur = { x: brut[0], y: brut[1] }; S.dz = { x: brut[0], y: brut[1] }; S.fh = []; S.verrou = false; S.tCur = t - 16; }   // premier point, ou main revenue après une absence : on repart d'ici sans « glissade »
      let x = S.fx.filtrer(brut[0], t), y = S.fy.filtrer(brut[1], t);
      if (o.zoneMorte > 0) {
        if (o.zoneAuto) {   // bruit mesuré en ligne : écart entre la mesure brute et sa version filtrée, retenu seulement quand le doigt est presque immobile
          const e = Math.hypot(brut[0] - x, brut[1] - y), vit = Math.hypot(S.vit.x, S.vit.y);
          if (vit < 60 && e < 60) S.bruit = S.bruit == null ? e : S.bruit * 0.97 + e * 0.03;
        }
        const zone = o.zoneAuto && S.bruit != null ? Math.max(o.zoneMorte, Math.min(o.zoneMorteMax, S.bruit * o.facteurBruit)) : o.zoneMorte;
        const dx = x - S.dz.x, dy = y - S.dz.y, d = Math.hypot(dx, dy);
        S.fh.push({ t, x, y }); while (S.fh.length > 1 && t - S.fh[0].t > 150) S.fh.shift();
        const dep = Math.hypot(x - S.fh[0].x, y - S.fh[0].y);   // déplacement du point filtré sur 150 ms : le geste volontaire le dépasse, le tremblement non
        if (S.verrou) { if (d > zone * 1.8 || dep > zone * 1.2) S.verrou = false; }
        else if (dep < zone * 0.6 && d <= zone * 1.2) S.verrou = true;   // la main s'est calmée : le curseur se verrouille (aucune marche d'escalier due au bruit)
        const zoneVive = zone * Math.max(0, Math.min(1, 1 - (dep / 0.15 - 60) / 300));   // en mouvement rapide la zone morte fond (de 60 à 360 px/s) : aucun retard sur un geste vif
        if (!S.verrou && d > zoneVive) { const k = (d - zoneVive) / d; S.dz.x += dx * k; S.dz.y += dy * k; }
        x = S.dz.x; y = S.dz.y;
      }   // zone morte : le curseur ne bouge que si le point filtré s'éloigne de plus de `zoneMorte` px
      const dt = Math.max(1e-3, (t - (S.tCur || t - 16)) / 1000); S.tCur = t;
      const vx = (x - S.cur.x) / dt, vy = (y - S.cur.y) / dt; S.vit.x = S.vit.x * 0.5 + vx * 0.5; S.vit.y = S.vit.y * 0.5 + vy * 0.5;
      const v = Math.hypot(S.vit.x, S.vit.y); let px = x, py = y;
      const cadence = S.dtEma ? Math.max(0, Math.min(1, (1000 / S.dtEma - 12) / 18)) : 1;   // V10 : la prédiction s’éteint sous 12 images/s (elle dépasserait la cible) et est complète à partir de 30
      if (v > 120 && o.predictionMs > 0 && cadence > 0) { const avance = Math.min(70, v * o.predictionMs * cadence / 1000); px = x + S.vit.x / v * avance; py = y + S.vit.y / v * avance; }   // extrapolation de 1 à 2 images, bornée à 70 px
      return [borne(px, 0, o.ecran.l - 1), borne(py, 0, o.ecran.h - 1), x, y];
    }

    function traiter(frame) {
      const t = frame.t, sortie = { actions: [], evenements: [], etat: null, t };
      if (S.tDernier) { const d = t - S.tDernier; if (d > 0 && d < 500) S.dtEma = S.dtEma ? S.dtEma * 0.9 + d * 0.1 : d; }   // intervalle moyen entre deux images
      S.tDernier = t;
      if (frame.ratio && Math.abs(frame.ratio - o.ratio) > 1e-3) o.ratio = frame.ratio;
      const vues = new Set(), actives = [], sc = seuils();
      for (const main of (frame.mains || [])) {
        if (!main || !Array.isArray(main.pts) || main.pts.length !== 21) continue;
        const cle = cleMain(main.lat, vues); let h = S.mains.get(cle); if (!h) { h = nouvelleMain(); S.mains.set(cle, h); }
        h.pts = lisser(h, main, t); h.derniereVue = t; h.cle = cle;
        const b = h.brut, ech = echelleMain(b); h.ech = ech;
        h.rI = d2(b[P.pouceBout], b[P.indexBout]) / ech; h.rM = d2(b[P.pouceBout], b[P.majeurBout]) / ech;
        h.iOk = boutAvance(b, P.indexBout, P.indexMcp); h.mOk = boutAvance(b, P.majeurBout, P.majeurMcp);
        // pincement avec hystérésis, deux sortes : pouce–index (clic, saisie) et pouce–majeur (clic droit)
        const ouvre = (h.pince === 'index' && (h.rI > sc.o || !h.iOk)) || (h.pince === 'majeur' && (h.rM > sc.o || !h.mOk));
        if (ouvre) { h.ouvreN = (h.ouvreN || 0) + 1; if (h.ouvreN >= o.relacheImages) { h.pince = null; h.ouvreN = 0; } }
        else h.ouvreN = 0;
        h.relachePend = !!(h.pince && h.ouvreN > 0);
        if (!h.pince) { if (h.rI < sc.f && h.iOk && h.rI <= h.rM) h.pince = 'index'; else if (h.rM < sc.f && h.mOk && h.rM < h.rI) h.pince = 'majeur'; }
        if (h.pince && !ouvre) h.pinceVueT = t;   // pinceVueT : dernier instant où le pincement était RÉELLEMENT vu (la durée d'un clic ne compte pas l'image de doute)
        h.proche = h.pince ? true : ((h.rI < sc.o && h.iOk && h.rI <= h.rM) || (h.rM < sc.o && h.mOk && h.rM < h.rI));   // le pincement s'amorce : le curseur se fige
        majDoigts(h.doigts, b);
        let brute = h.pince ? 'pince' : poseDoigts(h.doigts); if (!o.gestesAvances && brute === 'deux') brute = 'pointer';   // V11 : index + majeur à demi tendus = un pointeur, pas un geste de défilement
        if (brute !== h.candidate) { h.candidate = brute; h.candidateDepuis = t; }
        if (h.candidate !== h.pose && (h.candidate === 'pince' || t - h.candidateDepuis >= o.stabiliteMs)) { h.precedente = h.pose; h.pose = h.candidate; h.aPoseDepuis = t; }
        h.centre = centrePaume(h.pts); h.pointe = h.pts[P.indexBout]; h.milieuPince = milieu(h.pts[P.pouceBout], h.pts[h.pince === 'majeur' ? P.majeurBout : P.indexBout]);
        actives.push(h);
      }
      for (const [cle, h] of S.mains) if (!actives.includes(h) && t - h.derniereVue > o.perteMainMs) {   // main sortie du cadre depuis plus de 0,5 s
        if (S.prise && S.prise.cle === cle) libererTout(sortie, 'main perdue'); else if (S.deux) libererTout(sortie, 'main perdue');
        S.mains.delete(cle);
      }
      const nbVues = actives.length;
      if (nbVues) { S.sansMainDepuis = 0; S.derniereVue = t; }
      else if (!S.sansMainDepuis) S.sansMainDepuis = t;
      // ── état d'engagement ──
      if (!nbVues) {
        S.vueDepuis = 0;
        const desMs = o.gestesAvances ? o.desengageMs : Math.min(o.desengageMs, o.desengageRapideMs);
        if (S.mode !== 'pause' && S.mode !== 'sans-main' && S.sansMainDepuis && t - S.sansMainDepuis >= desMs) { libererTout(sortie, 'plus de main'); changerMode('sans-main', t, sortie, { type: 'sans_main' }); }
        sortie.etat = etat(actives); return sortie;
      }
      if (S.mode === 'sans-main') changerMode(o.exigerEngagement ? 'repos' : 'engage', t, sortie, o.exigerEngagement ? null : { type: 'engage' });
      const dom = (cle => actives.find(h => h.cle === cle))(o.droitier ? 'Right' : 'Left') || actives[0];

      // poing / main ouverte tenus : pause et engagement (une main suffit, elles ne doivent pas bouger vite)
      const refMain = actives.length === 2 && actives.every(h => h.pose === 'poing') ? null : dom;
      if (refMain) {
        const vite = (() => { const hh = refMain.histo; return hh.length > 3 && Math.hypot(refMain.centre[0] - hh[0].x, refMain.centre[1] - hh[0].y) / Math.max(0.05, (t - hh[0].t) / 1000) > 1.1; })();
        if (refMain.pose === 'ouverte' && !vite) S.ouverteDepuis = S.ouverteDepuis || t; else S.ouverteDepuis = 0;
        if (refMain.pose === 'poing' && !vite) S.poingDepuis = S.poingDepuis || t; else S.poingDepuis = 0;
      }
      for (const h of actives) { h.histo.push({ t, x: h.centre[0], y: h.centre[1], e: h.ech }); while (h.histo.length && t - h.histo[0].t > Math.max(o.balayage.dureeMax, o.recul.fenetreMs)) h.histo.shift(); }
      // deux poings tenus = pause, et la reprise
      if (o.gestesAvances && actives.length === 2 && actives.every(h => h.pose === 'poing')) {
        S.deuxPoingsDepuis = S.deuxPoingsDepuis || t;
        if (t - S.deuxPoingsDepuis >= o.deuxPoingsMs) {
          S.deuxPoingsDepuis = 0; if (S.mode === 'pause') changerMode('engage', t, sortie, { type: 'reprise' }); else { libererTout(sortie, 'pause'); changerMode('pause', t, sortie, { type: 'pause', actif: true }); }
          sortie.etat = etat(actives); return sortie;
        }
      } else S.deuxPoingsDepuis = 0;

      if (S.mode === 'repos' || S.mode === 'pause') {
        const reprise = S.mode === 'pause';
        if (!o.gestesAvances && S.mode === 'pause') { S.vueDepuis = 0; sortie.etat = etat(actives); return sortie; }   // mode simple : la pause ne se lève ni ne s'enclenche par un geste (bouton ou voix)
        if (!o.gestesAvances) {   // mode simple : une main visible et stable pendant 0,4 s engage le pointeur, quelle que soit sa pose
          const hh = dom.histo; let trajet = 0; for (let i = 1; i < hh.length; i++) trajet += Math.hypot(hh[i].x - hh[i - 1].x, hh[i].y - hh[i - 1].y);
          const agitee = hh.length > 3 && trajet / Math.max(0.05, (hh[hh.length - 1].t - hh[0].t) / 1000) > o.vitesseStable;   // chemin PARCOURU (un va-et-vient rapide compte, même s'il revient à son point de départ)
          if (agitee || !S.vueDepuis) S.vueDepuis = t;
          const v = (t - S.vueDepuis) / o.engagementRapideMs; S.progres = { type: 'engage', v: Math.min(1, v) };
          if (v >= 1) { S.vueDepuis = 0; S.progres = null; changerMode('engage', t, sortie, { type: 'engage' }); }
        } else if (S.ouverteDepuis) {
          const v = (t - S.ouverteDepuis) / o.engagementMs; S.progres = { type: 'engage', v: Math.min(1, v) };
          if (v >= 1) { S.ouverteDepuis = 0; changerMode('engage', t, sortie, reprise ? { type: 'reprise' } : { type: 'engage' }); }
        } else S.progres = null;
        if (S.mode !== 'engage') { const h = dom; if (h && (h.pose === 'pointer' || h.pose === 'pince')) { const b = ptEcran(h.pointe); const c = suivreCurseur(b, t); S.cur = { x: c[2], y: c[3] }; S.affiche = { x: c[0], y: c[1] }; } sortie.etat = etat(actives); return sortie; }
      }
      // ── mode engagé ──
      // poing tenu = pause
      if (o.gestesAvances && S.poingDepuis && actives.length === 1) {
        const v = (t - S.poingDepuis) / o.pauseMs; S.progres = { type: 'pause', v: Math.min(1, v) };
        if (v >= 1) { S.poingDepuis = 0; libererTout(sortie, 'pause'); changerMode('pause', t, sortie, { type: 'pause', actif: true }); sortie.etat = etat(actives); return sortie; }
      } else if (S.progres && S.progres.type === 'pause') S.progres = null;

      // ── deux mains ──
      if (actives.length === 2) {
        const [a, b] = actives.slice().sort((u, v) => u.centre[0] - v.centre[0]);
        const deuxPinces = a.pince === 'index' && b.pince === 'index', deuxOuvertes = a.pose === 'ouverte' && b.pose === 'ouverte';
        if (deuxPinces || deuxOuvertes) {
          const type = (deuxPinces || !o.gestesAvances) ? 'pince' : 'ouvertes';   // V11 : en mode simple, deux mains (pincées ou ouvertes) qui s'écartent / se rapprochent = agrandir / rétrécir
          const p1 = ptEcran(a.centre), p2 = ptEcran(b.centre), c1 = deuxPinces ? ptEcran(a.milieuPince) : p1, c2 = deuxPinces ? ptEcran(b.milieuPince) : p2;   // p = paumes (distance et angle : stables quand les doigts se ferment), c = points visés (quelle fenêtre ou quel objet)
          const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
          if (!S.deux || S.deux.type !== type) {
            if (S.prise) libererTout(sortie, 'deux mains'); else if (S.deux) { sortie.actions.push({ a: 'deux_fin' }); }
            S.deux = { type, d0: d, ang0: ang }; sortie.actions.push({ a: 'deux_debut', type, p1, p2, c1, c2, d, ang }); sortie.evenements.push({ type: type === 'pince' ? 'debut_zoom' : 'debut_rotation' });
          } else sortie.actions.push({ a: 'deux', type, p1, p2, c1, c2, d, ang, d0: S.deux.d0, ang0: S.deux.ang0 });
          for (const h of actives) h.enPince = null;
          sortie.etat = etat(actives); return sortie;
        }
        if (S.deux) { sortie.actions.push({ a: 'deux_fin' }); sortie.evenements.push({ type: 'fin_deux' }); S.deux = null; }
      } else if (S.deux) { sortie.actions.push({ a: 'deux_fin' }); sortie.evenements.push({ type: 'fin_deux' }); S.deux = null; }

      // ── une main (la main dominante commande le curseur) ──
      const h = dom, ordre = actives.slice().sort((u, v) => (u === h ? -1 : 1) - (v === h ? -1 : 1));
      const suit = h.pose === 'pointer' || h.pose === 'pince' || h.pose === 'deux';
      const prisePourCurseur = h.pose === 'pointer' ? ptEcran(h.pointe) : h.pose === 'pince' ? ptEcran(h.milieuPince) : ptEcran(milieu(h.pts[P.indexBout], h.pts[P.majeurBout])), ancrePaume = ptEcran(h.centre);   // saisie : on suit la PAUME, pas le bout des doigts (qui se rapprochent en pinçant)
      let ptCurseur = null;   // position d'écran à afficher et à utiliser pour cette image
      if (suit) {
        if (o.modeRelatif && h.pose !== 'pince') {
          const u = h.pointe[0] / o.ratio, v = h.pointe[1];
          if (!S.rel) S.rel = { u, v, x: S.cur.x, y: S.cur.y };
          const kx = o.gainRelatif * o.ecran.l / o.zone.l, ky = o.gainRelatif * o.ecran.h / o.zone.h;
          const c = suivreCurseur([borne(S.rel.x + (u - S.rel.u) * kx, 0, o.ecran.l - 1), borne(S.rel.y + (v - S.rel.v) * ky, 0, o.ecran.h - 1)], t); S.cur = { x: c[2], y: c[3] }; ptCurseur = [c[0], c[1]];
        } else { const c = suivreCurseur(prisePourCurseur, t); S.cur = { x: c[2], y: c[3] }; ptCurseur = [c[0], c[1]]; }
      } else S.rel = null;
      if (suit && !h.proche && !S.prise) { S.libre = { x: ptCurseur[0], y: ptCurseur[1] }; }
      /* Position « stable » : celle d'il y a ≈ 120 ms. Quand on replie les doigts (poing, main qui s'ouvre…), le bout de l'index se déplace avant que la pose ne change : les gestes qui visent une fenêtre
         ou un objet (ranger, fermer, suivre, défiler, vue initiale) utilisent donc la position d'AVANT le repli. */
      if (suit && h.pose === 'pointer') { S.hist.push({ t, x: S.affiche ? S.affiche.x : ptCurseur[0], y: S.affiche ? S.affiche.y : ptCurseur[1] }); while (S.hist.length && t - S.hist[0].t > 500) S.hist.shift(); let k = null; for (const e of S.hist) if (t - e.t >= 120) k = e; if (k) S.stable = { x: k.x, y: k.y }; else if (S.hist.length) S.stable = { x: S.hist[0].x, y: S.hist[0].y }; }
      // le pincement s'amorce : le curseur reste là où il était juste avant (le doigt qui se rapproche ne le fait pas bouger)
      let affiche = ptCurseur ? { x: ptCurseur[0], y: ptCurseur[1] } : (S.affiche || S.libre);
      if (h.proche && !S.prise) affiche = { x: S.libre.x, y: S.libre.y };
      if (h.pose === 'deux') affiche = { x: S.libre.x, y: S.libre.y };
      if (S.prise && h.enPince && h.relachePend && S.affiche) { affiche = { x: S.affiche.x, y: S.affiche.y }; }   // image de doute (peut-être un relâchement) : la position tenue ne bouge pas
      else if (S.prise && h.enPince) {   // saisie : la position suit le déplacement de la main depuis le début du pincement
        const dx = ancrePaume[0] - h.enPince.depart[0], dy = ancrePaume[1] - h.enPince.depart[1];
        const c = suivreCurseur([borne(S.prise.x0 + dx, 0, o.ecran.l - 1), borne(S.prise.y0 + dy, 0, o.ecran.h - 1)], t); affiche = { x: c[0], y: c[1] };
      }
      S.affiche = affiche;

      // pincement : clic, clic droit, saisie
      const finClic = (hh) => {
        const ep = hh.enPince; hh.enPince = null; if (!ep) return;
        if (ep.grabbe) { if (S.prise) { sortie.actions.push({ a: 'lache' }); sortie.evenements.push({ type: 'lacher', raison: 'relâché' }); S.prise = null; } return; }
        const derive = d2(hh.centre, ep.centre0) / ep.ech, duree = (hh.pinceVueT || t) - ep.t0;
        if (duree >= o.clicMin && duree <= o.clicMax && derive <= o.deriveClic) {
          const n = ep.type === 'index' && t - S.dernierClic <= o.doubleClic ? 2 : 1; if (ep.type === 'index') S.dernierClic = t;
          sortie.actions.push({ a: 'clic', n, bouton: ep.type === 'majeur' ? 2 : 0, x: ep.x, y: ep.y }); sortie.evenements.push({ type: ep.type === 'majeur' ? 'clic_droit' : 'clic', n });
        }
      };
      for (const hh of ordre) if (hh.enPince && hh.pince !== hh.enPince.type) finClic(hh);   // pincement relâché (même si la pose est devenue « ouverte »)
      if (h.pince) {
        if (!h.enPince) h.enPince = { t0: t, type: h.pince, depart: ancrePaume.slice(), centre0: h.centre.slice(), ech: h.ech, grabbe: false, x: S.libre.x, y: S.libre.y };
        const ep = h.enPince;
        if (!ep.grabbe && ep.type === 'index' && t - ep.t0 >= o.delaiMaintien && d2(h.centre, ep.centre0) / ep.ech <= o.deriveClic * 3) {
          ep.grabbe = true; S.prise = { cle: h.cle, x0: ep.x, y0: ep.y }; sortie.actions.push({ a: 'prise', x: ep.x, y: ep.y }); sortie.evenements.push({ type: 'saisie' });
          affiche = { x: ep.x, y: ep.y }; S.affiche = affiche;
        }
        if (S.progres === null || S.progres.type === 'pince') { const v = ep.grabbe ? 1 : Math.min(1, (t - ep.t0) / o.delaiMaintien); S.progres = { type: 'pince', v }; }
      } else if (S.progres && S.progres.type === 'pince') S.progres = null;
      if (!h.pince && !S.prise && h.proche) { const r = h.rI < h.rM ? h.rI : h.rM; S.progres = { type: 'pince', v: borne(1 - (r - sc.f) / Math.max(0.01, sc.o - sc.f), 0, 1) * 0.6 }; }
      else if (!h.pince && S.progres && S.progres.type === 'pince') S.progres = null;
      if (S.prise && !h.pince) { sortie.actions.push({ a: 'lache' }); sortie.evenements.push({ type: 'lacher', raison: 'main ouverte' }); S.prise = null; }
      if (S.prise) { sortie.actions.push({ a: 'deplace', x: affiche.x, y: affiche.y }); }
      else if (suit && h.pose !== 'deux') sortie.actions.push({ a: 'curseur', x: affiche.x, y: affiche.y, fige: !!h.proche });

      // défilement à deux doigts
      if (h.pose === 'deux' && o.gestesAvances) {
        const m = milieu(h.pts[P.indexBout], h.pts[P.majeurBout]);
        if (h.defile && t - h.defile.t < 120) { const dv = m[1] - h.defile.y; if (Math.abs(dv) > o.defileMort) sortie.actions.push({ a: 'defile', dx: 0, dy: Math.round(-dv * o.ecran.h * o.gainDefile), x: S.libre.x, y: S.libre.y }); }
        h.defile = { t, y: m[1] };
      } else h.defile = null;

      // balayages et gestes de la main ouverte
      for (const hh of ordre) {
        const ouverte = hh.pose === 'ouverte';
        if (ouverte && !(S.prise) && hh.histo.length >= 4) {
          const p1 = hh.histo[hh.histo.length - 1]; let trouve = null;
          for (let i = 0; i < hh.histo.length - 2 && !trouve; i++) {
            const p0 = hh.histo[i]; if (t - p0.t > o.balayage.dureeMax) continue;
            const dt = (p1.t - p0.t) / 1000, dx = (p1.x - p0.x) / o.ratio, dy = p1.y - p0.y;
            if (dt <= 0.08) continue;
            if (t - S.derniereRecharge > o.balayage.recharge && Math.abs(dx) >= o.balayage.distanceMin && Math.abs(dx) / dt >= o.balayage.vitesseMin && Math.abs(dx) > Math.abs(dy) * 1.8) trouve = { type: 'balayage', sens: dx > 0 ? 1 : -1 };
            else if (o.gestesAvances && t - S.derniereRangee > o.balayage.recharge && dy >= o.rangerBas.distanceMin && dy / dt >= o.rangerBas.vitesseMin && dy > Math.abs(dx) * 1.8) trouve = { type: 'ranger_bas' };
          }
          if (trouve && trouve.type === 'balayage') { S.derniereRecharge = t; hh.histo.length = 0; sortie.actions.push({ a: 'defile', dx: -trouve.sens * 700, dy: 0, x: S.stable.x, y: S.stable.y }); sortie.evenements.push({ type: 'balayage', sens: trouve.sens > 0 ? 'droite' : 'gauche' }); }
          else if (trouve && trouve.type === 'ranger_bas') { S.derniereRangee = t; hh.histo.length = 0; sortie.actions.push({ a: 'ranger', x: S.stable.x, y: S.stable.y }); sortie.evenements.push({ type: 'ranger_bas' }); }
          // la main recule : taille apparente qui diminue vite, sans balayer
          if (!trouve && o.gestesAvances && o.reculActif && t - S.dernierRecul > o.recul.recharge) {
            const e0 = Math.max(...hh.histo.filter(p => t - p.t <= o.recul.fenetreMs).map(p => p.e)), dep = Math.hypot(p1.x - hh.histo[0].x, p1.y - hh.histo[0].y) / o.ratio;
            if (hh.histo.length > 6 && p1.e < e0 * o.recul.rapport && dep < 0.18) { S.dernierRecul = t; hh.histo.length = 0; sortie.evenements.push({ type: 'accueil' }); sortie.actions.push({ a: 'accueil' }); }
          }
        }
      }
      // main ouverte immobile 1,5 s : vue initiale
      if (h.pose === 'ouverte' && !S.prise && (o.gestesAvances || paumeDroite(h.brut, o.ratio))) {
        const hh = h.histo, immobile = hh.length > 4 && t - hh[0].t >= 250 && Math.hypot(h.centre[0] - hh[0].x, h.centre[1] - hh[0].y) / o.ratio < o.resetRayon;
        if (immobile) { S.arretDepuis = S.arretDepuis || t; if (!S.resetFait && t - S.arretDepuis >= o.resetMs) { S.resetFait = true; sortie.actions.push({ a: 'vue_initiale', x: S.stable.x, y: S.stable.y }); sortie.evenements.push({ type: 'vue_initiale' }); } else if (!S.resetFait && (!S.progres || S.progres.type === 'reset')) S.progres = { type: 'reset', v: Math.min(1, (t - S.arretDepuis) / o.resetMs) }; }   // V11 : l'anneau se remplit vraiment (avant, sa valeur restait figée à sa première image)
        else { S.arretDepuis = 0; S.resetFait = false; if (S.progres && S.progres.type === 'reset') S.progres = null; }
      } else { S.arretDepuis = 0; S.resetFait = false; if (S.progres && S.progres.type === 'reset') S.progres = null; }

      // poing court puis main qui s'ouvre = fermer la fenêtre sous le curseur (confirmation visible de 0,5 s, annulable)
      if (S.fermer) {   // la main doit RESTER ouverte pendant la confirmation : tout autre geste (poing, pincement, pointer) annule
        if (h.pose !== 'ouverte') { sortie.evenements.push({ type: 'fermer_annule' }); sortie.actions.push({ a: 'fermer_annule' }); S.fermer = null; if (S.progres && S.progres.type === 'fermer') S.progres = null; }
        else { const v = (t - S.fermer.t0) / o.fermer.confirmationMs; S.progres = { type: 'fermer', v: Math.min(1, v) }; if (v >= 1) { sortie.actions.push({ a: 'fermer', x: S.stable.x, y: S.stable.y }); sortie.evenements.push({ type: 'fermer' }); S.fermer = null; S.progres = null; } }
      } else if (o.gestesAvances) {
        if (h.pose === 'poing') { if (!h.poingDebut) h.poingDebut = t; } else {
          if (h.poingDebut && (h.pose === 'ouverte') && h.precedente === 'poing') { const dur = t - h.poingDebut; if (dur >= o.fermer.poingMin && dur <= o.fermer.poingMax && t - h.aPoseDepuis <= o.fermer.ouvertureMs) { S.fermer = { t0: t }; sortie.evenements.push({ type: 'fermer_debut' }); sortie.actions.push({ a: 'fermer_debut', x: S.stable.x, y: S.stable.y }); } }
          h.poingDebut = 0;
        }
      }
      // pointer immobile 1 s : suivre / centrer
      if (o.gestesAvances && h.pose === 'pointer' && !S.prise) {
        if (!S.arretPos || Math.hypot(affiche.x - S.arretPos.x, affiche.y - S.arretPos.y) > o.suivreRayon) { S.arretPos = { x: affiche.x, y: affiche.y, t }; S.suivreFait = false; if (S.progres && S.progres.type === 'suivre') S.progres = null; }
        else if (!S.suivreFait) { const v = (t - S.arretPos.t) / o.suivreMs; if (v >= 1) { S.suivreFait = true; if (S.progres && S.progres.type === 'suivre') S.progres = null; sortie.actions.push({ a: 'suivre', x: affiche.x, y: affiche.y }); sortie.evenements.push({ type: 'suivre' }); } else if (v > 0.25 && !S.progres) S.progres = { type: 'suivre', v }; else if (S.progres && S.progres.type === 'suivre') S.progres = { type: 'suivre', v }; }
      } else { S.arretPos = null; S.suivreFait = false; if (S.progres && S.progres.type === 'suivre') S.progres = null; }

      sortie.etat = etat(actives); return sortie;
    }

    function etat(actives) {
      const h = actives && actives[0];
      return { mode: S.mode, mains: actives ? actives.length : 0, poses: (actives || []).map(x => x.cle + ':' + x.pose), pose: h ? h.pose : null, pause: S.mode === 'pause', engage: S.mode === 'engage', saisie: !!S.prise, deux: S.deux ? S.deux.type : null, simple: !o.gestesAvances, progres: S.progres, curseur: S.affiche ? { x: S.affiche.x, y: S.affiche.y } : null, pincement: h ? { index: +h.rI.toFixed(3), majeur: +h.rM.toFixed(3), type: h.pince } : null, points: (actives || []).map(x => x.pts) };
    }
    function pause(oui) { S.mode = oui ? 'pause' : 'engage'; S.modeDepuis = S.tDernier; S.progres = null; S.vueDepuis = 0; }
    function engager() { S.mode = 'engage'; S.modeDepuis = S.tDernier; S.progres = null; }
    function reinitialiser() { S.mains.clear(); S.deux = null; S.prise = null; S.fermer = null; S.deuxPoingsDepuis = 0; S.mode = 'sans-main'; S.progres = null; S.rel = null; }
    function regler(patch) {
      Object.assign(o, fusion(o, patch));
      if (patch && ('lissage' in patch)) { S.fx = creerOneEuro(cfgEcran()); S.fy = creerOneEuro(cfgEcran()); for (const h of S.mains.values()) h.filtres = Array.from({ length: 63 }, () => creerOneEuro(cfgPoint())); }
    }
    return { traiter, pause, engager, reinitialiser, regler, options: o, etat: () => ({ mode: S.mode, pause: S.mode === 'pause', engage: S.mode === 'engage', saisie: !!S.prise, deux: S.deux ? S.deux.type : null, mains: S.mains.size, progres: S.progres, curseur: S.affiche || null }) };
  }

  racine.GestesV5 = { DEFAUTS, creerMoteur, aimanter, versEcran, calibrerAuto, majDoigts, poseDoigts, boutAvance };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.GestesV5;
})(typeof globalThis !== 'undefined' ? globalThis : window);
