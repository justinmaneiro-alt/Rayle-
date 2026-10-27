"use strict";
/* ═════════════ GESTES (V2, phase 11) : calcul PUR, partagé par la page Rayle, la page « Caméra Rayle » du téléphone et les tests Node ═════════════
   Entrée : des images de points de main (21 repères MediaPipe par main). Sortie : des messages de la télécommande (mêmes actions que le pad de la tablette : pointeur, clic, verrou,
   lacher, zoom, defile, objet…) + des événements pour l'écran d'aide. Rien ici ne touche au DOM ni à la caméra : testé sous Node avec des suites de points enregistrées
   (galaxie/tests/gestes-test.mjs). AUCUNE IMAGE n'est traitée ici : seulement des coordonnées.
   Vocabulaire :  pointer (index tendu) = curseur · pincer et relâcher = clic · pincer et tenir = saisir / déplacer (fenêtre ou objet 3D) · pincer à deux mains et écarter = redimensionner / zoom ·
                  main ouverte qui balaie = faire défiler les piles · poing tenu = ranger les fenêtres · deux mains ouvertes qui tournent = faire pivoter l'objet 3D · deux poings tenus = gestes en pause. */
(function (racine) {
  const PI = Math.PI;
  // repères MediaPipe
  const P = { poignet: 0, pouceBase: 2, pouceIp: 3, pouceBout: 4, indexMcp: 5, indexPip: 6, indexBout: 8, majeurMcp: 9, majeurPip: 10, majeurBout: 12, annMcp: 13, annPip: 14, annBout: 16, auriMcp: 17, auriPip: 18, auriBout: 20 };
  const DOIGTS = [['index', 5, 6, 8], ['majeur', 9, 10, 12], ['annulaire', 13, 14, 16], ['auriculaire', 17, 18, 20]];
  const DEFAUTS = {
    seuilFerme: 0.30, seuilOuvre: 0.45,      // distance pouce–index / taille de la main : en dessous = pincé, au-dessus = ouvert (hystérésis)
    delaiMaintien: 280, clicMax: 380, doubleClic: 650, deriveClic: 0.22,   // ms ; dérive max pendant un clic (en tailles de main)
    zoneUtile: 0.6,                           // largeur de déplacement de la main (en fraction de la largeur de l'image) qui couvre tout l'écran
    zoneMorte: 0.0015,                        // sous ce déplacement (unités d'image) le curseur ne bouge pas
    stabilite: 2,                             // images consécutives pour changer de pose
    oneEuro: { minCutoff: 1.4, beta: 0.03, dCutoff: 1 },
    balayage: { vitesseMin: 1.15, distanceMin: 0.2, dureeMax: 520, recharge: 850 },
    poingMs: 650, deuxPoingsMs: 1500, perteMainMs: 280,
    zoomGain: 2400, rotationGain: 0.5, miroir: true, droitier: true,
    ecran: { l: 1920, h: 1080 }, ratio: 4 / 3
  };
  const fusion = (a, b) => { const r = Object.assign({}, a); for (const k of Object.keys(b || {})) r[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') ? fusion(a[k], b[k]) : b[k]; return r; };

  // ── filtre One Euro (Casiez et coll., 2012) : lisse beaucoup à basse vitesse (tremblement), peu à haute vitesse (réactivité) ──
  function creerOneEuro(cfg) {
    let x = null, dx = 0, tPrec = null;
    const alpha = (coupure, dt) => { const tau = 1 / (2 * PI * coupure); return 1 / (1 + tau / dt); };
    return {
      filtrer(valeur, t) {
        if (x === null || tPrec === null) { x = valeur; tPrec = t; return valeur; }
        const dt = Math.max(1e-3, (t - tPrec) / 1000); tPrec = t;
        const dv = (valeur - x) / dt; dx = dx + alpha(cfg.dCutoff, dt) * (dv - dx);
        const c = cfg.minCutoff + cfg.beta * Math.abs(dx); x = x + alpha(c, dt) * (valeur - x); return x;
      },
      reset() { x = null; tPrec = null; dx = 0; }
    };
  }

  // ── géométrie d'une main : points 2D en « unités de largeur d'image » (x multiplié par le rapport l/h) ──
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const milieu = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const echelleMain = pts => Math.max(1e-6, d2(pts[P.poignet], pts[P.majeurMcp]));
  function angleEn(a, b, c) { const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], n = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]); if (n < 1e-9) return 180; return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n))) * 180 / PI; }
  /* Doigt tendu : le bout est plus loin du poignet que l'articulation et le doigt est presque droit. */
  function doigtTendu(pts, mcp, pip, bout) { return d2(pts[bout], pts[P.poignet]) > d2(pts[pip], pts[P.poignet]) * 1.08 && angleEn(pts[mcp], pts[pip], pts[bout]) > 150; }
  function doigtsTendus(pts) { const r = {}; for (const [nom, mcp, pip, bout] of DOIGTS) r[nom] = doigtTendu(pts, mcp, pip, bout); return r; }
  const pincement = pts => d2(pts[P.pouceBout], pts[P.indexBout]) / echelleMain(pts);
  const centrePaume = pts => [(pts[P.poignet][0] + pts[P.majeurMcp][0] + pts[P.indexMcp][0] + pts[P.auriMcp][0]) / 4, (pts[P.poignet][1] + pts[P.majeurMcp][1] + pts[P.indexMcp][1] + pts[P.auriMcp][1]) / 4];
  /* Pose d'après les points (sans hystérésis : l'état « pincé » est tenu par le moteur). */
  function poseBrute(pts, pince) {
    const t = doigtsTendus(pts), nbTendus = Object.values(t).filter(Boolean).length;
    if (pince) return 'pince';
    if (nbTendus === 4) return 'ouverte';
    if (t.index && !t.majeur && !t.annulaire && !t.auriculaire) return 'pointer';
    if (nbTendus === 0) return 'poing';
    return 'autre';
  }

  // ── validation des points reçus du téléphone (liste blanche : rien d'autre ne passe) ──
  const nb = v => typeof v === 'number' && isFinite(v);
  function validerMains(msg) {
    if (!msg || typeof msg !== 'object' || msg.a !== 'mains' || !Array.isArray(msg.mains) || msg.mains.length > 2) return null;
    const t = nb(msg.t) ? Math.max(0, Math.min(1e13, msg.t)) : null, ratio = nb(msg.ratio) ? Math.max(0.3, Math.min(4, msg.ratio)) : 4 / 3, mains = [];
    if (t === null) return null;
    for (const m of msg.mains) {
      if (!m || (m.lat !== 'Left' && m.lat !== 'Right') || !Array.isArray(m.pts) || m.pts.length !== 21) return null;
      const pts = [];
      for (const p of m.pts) { if (!Array.isArray(p) || p.length < 2 || p.length > 3 || !p.every(nb)) return null; pts.push([Math.round(Math.max(-1, Math.min(2, p[0])) * 1e4) / 1e4, Math.round(Math.max(-1, Math.min(2, p[1])) * 1e4) / 1e4, Math.round(Math.max(-2, Math.min(2, p[2] || 0)) * 1e4) / 1e4]); }
      mains.push({ lat: m.lat, pts });
    }
    return { a: 'mains', t, ratio, mains };
  }

  /* ── calibration : à partir d'échantillons mesurés sur la personne, pas d'après des chiffres « moyens » ──
     pincements : rapports pouce–index mesurés main OUVERTE (ouvert) puis PINCÉE (ferme). zone : positions du bout de l'index en balayant l'écran de la main (coins). */
  function calibrerSeuils({ ouvert = [], ferme = [] } = {}) {
    if (ouvert.length < 5 || ferme.length < 5) return { ok: false, raison: 'Pas assez de mesures : ouvre la main puis pince, quelques secondes chacun.' };
    const moy = l => l.reduce((s, x) => s + x, 0) / l.length, tri = l => l.slice().sort((a, b) => a - b), mO = tri(ouvert)[Math.floor(ouvert.length * 0.25)], mF = tri(ferme)[Math.floor(ferme.length * 0.75)];
    if (!(mO > mF + 0.12)) return { ok: false, raison: 'Ouvert et pincé sont trop proches (' + mO.toFixed(2) + ' contre ' + mF.toFixed(2) + ') : écarte plus le pouce et l’index, ou rapproche la main de la caméra.' };
    return { ok: true, seuilFerme: +(mF + (mO - mF) * 0.28).toFixed(3), seuilOuvre: +(mF + (mO - mF) * 0.55).toFixed(3), moyenneOuvert: +moy(ouvert).toFixed(3), moyenneFerme: +moy(ferme).toFixed(3) };
  }
  function calibrerZone(points) {
    if (points.length < 10) return { ok: false, raison: 'Pas assez de points : balaie lentement tout l’écran avec le doigt.' };
    const xs = points.map(p => p[0]).sort((a, b) => a - b), q = (l, f) => l[Math.floor((l.length - 1) * f)], largeur = q(xs, 0.95) - q(xs, 0.05);
    if (largeur < 0.08) return { ok: false, raison: 'Mouvement trop petit : déplace la main plus largement.' };
    return { ok: true, zoneUtile: +Math.max(0.15, Math.min(1.2, largeur * 1.05)).toFixed(3) };
  }

  /* ── moteur de gestes ── */
  function creerMoteur(options) {
    const o = fusion(DEFAUTS, options || {});
    const S = { mains: new Map(), pause: false, deuxPoingsDepuis: 0, dernierClic: -1e9, derniereRecharge: -1e9, deux: null, derniereVue: 0, saisie: null, tDernier: 0 };
    const nouvelleMain = () => ({ filtres: Array.from({ length: 63 }, () => creerOneEuro(o.oneEuro)), pose: 'autre', poseBrute: 'autre', compte: 0, pince: false, ref: null, derniereVue: 0, enPince: null, histo: [], ouverteDepuis: 0, poingDepuis: 0, dernierePose: 'autre' });
    const gainX = () => o.ecran.l / Math.max(0.05, o.zoneUtile * o.ratio), gainY = () => o.ecran.h / Math.max(0.05, o.zoneUtile);   // pixels d'écran par unité d'image

    function lisser(h, main, t) {   // points filtrés (x multiplié par le rapport, miroir si caméra frontale)
      if (h.brut && h.derniereVue) {   // main disparue depuis longtemps, ou saut impossible du poignet (autre main à la place, étiquette gauche/droite inversée) : on repart de zéro, sans entraîner le curseur
        const dt = t - h.derniereVue, saut = d2(h.brut[0], [(o.miroir ? 1 - main.pts[0][0] : main.pts[0][0]) * o.ratio, main.pts[0][1]]);
        if (dt > o.perteMainMs || saut / Math.max(0.016, dt / 1000) > 6) { for (const f of h.filtres) f.reset(); h.ref = null; h.enPince = null; h.histo.length = 0; h.pose = 'autre'; h.poseBrute = 'autre'; h.compte = 0; h.pince = false; }
      }
      const pts = [], brut = [];   // points bruts (pour reconnaître les poses : aucun retard) et filtrés (pour le curseur)
      for (let i = 0; i < 21; i++) {
        const p = main.pts[i], x = (o.miroir ? 1 - p[0] : p[0]) * o.ratio, y = p[1], z = (p[2] || 0) * o.ratio;
        brut.push([x, y, z]); pts.push([h.filtres[3 * i].filtrer(x, t), h.filtres[3 * i + 1].filtrer(y, t), h.filtres[3 * i + 2].filtrer(z, t)]);
      }
      h.brut = brut; return pts;
    }
    function cleMain(lat, vues) { let k = o.miroir ? (lat === 'Left' ? 'Right' : 'Left') : lat; while (vues.has(k)) k = k === 'Left' ? 'Right' : 'Left'; vues.add(k); return k; }

    function liberer(sortie, raison) {
      if (S.saisie) { sortie.msgs.push({ a: 'lacher' }); sortie.evenements.push({ type: 'lacher', raison }); S.saisie = null; }
      if (S.deux && S.deux.type === 'zoom2') sortie.evenements.push({ type: 'fin_zoom' });
      S.deux = null; for (const h of S.mains.values()) { h.enPince = null; h.ref = null; }
    }

    function traiter(frame) {
      const t = frame.t, sortie = { msgs: [], evenements: [], etat: null };
      S.tDernier = t;
      if (frame.ratio && Math.abs(frame.ratio - o.ratio) > 1e-3) o.ratio = frame.ratio;
      const vues = new Set(), actives = [];
      for (const main of (frame.mains || [])) {
        if (!main || !Array.isArray(main.pts) || main.pts.length !== 21) continue;
        const cle = cleMain(main.lat, vues); let h = S.mains.get(cle); if (!h) { h = nouvelleMain(); S.mains.set(cle, h); }
        h.pts = lisser(h, main, t); h.derniereVue = t; h.cle = cle;
        const ech = echelleMain(h.brut), r = pincement(h.brut);
        // état pincé avec hystérésis
        if (h.pince && r > o.seuilOuvre) h.pince = false; else if (!h.pince && r < o.seuilFerme) h.pince = true;
        const brute = poseBrute(h.brut, h.pince); h.ech = ech; h.ratioPince = r;
        if (brute === h.poseBrute) h.compte++; else { h.poseBrute = brute; h.compte = 1; }
        if (h.compte >= o.stabilite && h.pose !== brute) { h.precedente = h.pose; h.pose = brute; h.ref = null; if (brute === 'ouverte') h.ouverteDepuis = t; if (brute === 'poing') h.poingDepuis = t; }
        if (h.pose === 'ouverte' && !h.ouverteDepuis) h.ouverteDepuis = t; if (h.pose !== 'ouverte') h.ouverteDepuis = 0; if (h.pose !== 'poing') h.poingDepuis = 0;
        h.centre = centrePaume(h.pts); h.pointe = h.pts[P.indexBout]; h.milieuPince = milieu(h.pts[P.pouceBout], h.pts[P.indexBout]);
        actives.push(h);
      }
      // mains perdues
      for (const [cle, h] of S.mains) if (!actives.includes(h) && t - h.derniereVue > o.perteMainMs) {
        if (h.enPince && S.saisie && S.saisie.cle === cle) liberer(sortie, 'main perdue'); S.mains.delete(cle);
        if (S.deux) liberer(sortie, 'main perdue');
      }
      sortie.etat = { mains: actives.length, poses: actives.map(h => h.cle + ':' + h.pose), pause: S.pause, saisie: !!S.saisie, deux: S.deux ? S.deux.type : null };
      if (S.pause) {
        // seule sortie de pause possible : deux poings tenus
        if (actives.length === 2 && actives.every(h => h.pose === 'poing')) { S.deuxPoingsDepuis = S.deuxPoingsDepuis || t; if (t - S.deuxPoingsDepuis >= o.deuxPoingsMs) { S.pause = false; S.deuxPoingsDepuis = 0; sortie.evenements.push({ type: 'pause', actif: false }); sortie.etat.pause = false; } } else S.deuxPoingsDepuis = 0;
        return sortie;
      }
      // deux poings tenus = pause
      if (actives.length === 2 && actives.every(h => h.pose === 'poing')) {
        S.deuxPoingsDepuis = S.deuxPoingsDepuis || t;
        if (t - S.deuxPoingsDepuis >= o.deuxPoingsMs) { liberer(sortie, 'pause'); S.pause = true; S.deuxPoingsDepuis = 0; sortie.evenements.push({ type: 'pause', actif: true }); sortie.etat.pause = true; return sortie; }
      } else S.deuxPoingsDepuis = 0;

      // ── deux mains ──
      if (actives.length === 2) {
        const [a, b] = actives.slice().sort((u, v) => u.centre[0] - v.centre[0]);
        if (a.pose === 'pince' && b.pose === 'pince') {   // redimensionner / zoom
          const dist = d2(a.milieuPince, b.milieuPince);
          if (!S.deux || S.deux.type !== 'zoom2') { liberer(sortie, 'deux mains'); S.deux = { type: 'zoom2', dist, t0: t }; sortie.evenements.push({ type: 'debut_zoom' }); }
          else { const d = (dist - S.deux.dist) * o.zoomGain; S.deux.dist = dist; if (Math.abs(d) > 4) sortie.msgs.push({ a: 'zoom', delta: Math.max(-300, Math.min(300, Math.round(d))) }); }
          return sortie;
        }
        if (a.pose === 'ouverte' && b.pose === 'ouverte') {   // faire pivoter l'objet 3D
          const ang = Math.atan2(b.centre[1] - a.centre[1], b.centre[0] - a.centre[0]);
          if (!S.deux || S.deux.type !== 'rotation2') { liberer(sortie, 'deux mains'); S.deux = { type: 'rotation2', ang, t0: t }; sortie.evenements.push({ type: 'debut_rotation' }); }
          else { let da = ang - S.deux.ang; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI; S.deux.ang = ang; if (Math.abs(da) > 0.008) sortie.msgs.push({ a: 'objet', g: 'tourner', dx: Math.max(-1, Math.min(1, -da * o.rotationGain)), dy: 0 }); }
          return sortie;
        }
        if (S.deux) liberer(sortie, 'fin des deux mains');
      } else if (S.deux) { liberer(sortie, 'une seule main'); }

      // ── une main (ou deux mains de poses différentes : la main « active » commande le curseur) ──
      const ordre = actives.slice().sort((u, v) => (u.cle === (o.droitier ? 'Right' : 'Left') ? -1 : 1) - (v.cle === (o.droitier ? 'Right' : 'Left') ? -1 : 1));
      const active = ordre.find(h => h.pose === 'pointer' || h.pose === 'pince');
      for (const h of ordre) {
        // balayage de la main ouverte
        h.histo.push({ t, x: h.centre[0], y: h.centre[1] }); while (h.histo.length && t - h.histo[0].t > o.balayage.dureeMax) h.histo.shift();
        if (h.pose === 'ouverte' && !(active && active !== h && S.saisie) && t - S.derniereRecharge > o.balayage.recharge && t - h.ouverteDepuis > 120 && h.histo.length >= 4) {
          const p1 = h.histo[h.histo.length - 1]; let trouve = null;
          for (let i = 0; i < h.histo.length - 2 && !trouve; i++) {   // on cherche, dans la fenêtre, un départ qui donne un balayage assez long ET assez rapide (la main immobile avant le geste ne dilue pas la vitesse)
            const p0 = h.histo[i], dt = (p1.t - p0.t) / 1000, dx = (p1.x - p0.x) / o.ratio, dy = p1.y - p0.y;
            if (dt > 0.08 && Math.abs(dx) >= o.balayage.distanceMin && Math.abs(dx) / dt >= o.balayage.vitesseMin && Math.abs(dx) > Math.abs(dy) * 1.8) trouve = { dx };
          }
          if (trouve) {
            const sens = trouve.dx > 0 ? 1 : -1; S.derniereRecharge = t; h.histo.length = 0;
            sortie.msgs.push({ a: 'defile', dx: -sens * 700, dy: 0 }); sortie.evenements.push({ type: 'balayage', sens: sens > 0 ? 'droite' : 'gauche' });
          }
        }
        // poing tenu : ranger
        if (h.pose === 'poing' && h.poingDepuis && t - h.poingDepuis >= o.poingMs && actives.length === 1 && !h.rangee) { h.rangee = true; sortie.evenements.push({ type: 'ranger' }); }
        if (h.pose !== 'poing') h.rangee = false;
      }
      for (const h of ordre) {     // relâchement d'un pincement : traité pour toute main, même si sa pose est devenue « ouverte » (c'est le cas quand les autres doigts sont tendus)
        if (!h.enPince || h.pose === 'pince') continue;
        const ep = h.enPince; h.enPince = null; h.ref = null;
        if (ep.grabbe) { sortie.msgs.push({ a: 'lacher' }); sortie.evenements.push({ type: 'lacher', raison: 'relâché' }); S.saisie = null; }
        else {
          const derive = d2(h.centre, ep.centre0) / ep.ech;   // la paume sert de repère : le bout de l'index se déplace de lui-même quand on pince
          if (t - ep.t0 <= o.clicMax && derive <= o.deriveClic) { const n = t - S.dernierClic <= o.doubleClic ? 2 : 1; S.dernierClic = t; sortie.msgs.push({ a: 'clic', n, bouton: 0 }); sortie.evenements.push({ type: 'clic', n }); }
        }
      }
      if (active) {
        const h = active, ptRef = h.pose === 'pince' ? h.milieuPince : h.pointe;
        if (!h.ref) h.ref = ptRef.slice();
        const dx = ptRef[0] - h.ref[0], dy = ptRef[1] - h.ref[1], deplacement = Math.hypot(dx, dy);
        const emettre = seuil => {   // déplacement du curseur : seulement au-delà de la zone morte (le petit tremblement ne s'accumule pas : la référence ne bouge pas tant qu'on reste dedans)
          if (deplacement <= seuil) return;
          sortie.msgs.push({ a: 'pointeur', dx: Math.max(-300, Math.min(300, dx * gainX())), dy: Math.max(-300, Math.min(300, dy * gainY())) }); h.ref = ptRef.slice();
        };
        if (h.pose === 'pince') {
          if (!h.enPince) { h.enPince = { t0: t, depart: ptRef.slice(), centre0: h.centre.slice(), grabbe: false, ech: h.ech }; }
          const ep = h.enPince;
          if (!ep.grabbe && t - ep.t0 >= o.delaiMaintien) { ep.grabbe = true; S.saisie = { cle: h.cle }; sortie.msgs.push({ a: 'verrou' }); sortie.evenements.push({ type: 'saisie' }); h.ref = ptRef.slice(); }
          else if (ep.grabbe) emettre(o.zoneMorte * 0.5);
        } else if (h.pose === 'pointer') emettre(o.zoneMorte);
      } else {
        for (const h of ordre) if (h.enPince) h.enPince = null;
        if (S.saisie && !actives.some(h => h.cle === S.saisie.cle && h.pose === 'pince')) liberer(sortie, 'main ouverte');
      }
      return sortie;
    }
    function pause(oui) { S.pause = !!oui; S.deuxPoingsDepuis = 0; }
    function reinitialiser() { S.mains.clear(); S.deux = null; S.saisie = null; S.deuxPoingsDepuis = 0; }
    return { traiter, pause, reinitialiser, options: o, etat: () => ({ pause: S.pause, saisie: !!S.saisie, mains: S.mains.size, deux: S.deux ? S.deux.type : null }), regler(patch) { Object.assign(o, fusion(o, patch)); } };
  }

  racine.GestesCalcul = { DEFAUTS, P, DOIGTS, creerOneEuro, echelleMain, doigtTendu, doigtsTendus, pincement, centrePaume, poseBrute, validerMains, calibrerSeuils, calibrerZone, creerMoteur, fusion, d2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.GestesCalcul;
})(typeof globalThis !== 'undefined' ? globalThis : window);
