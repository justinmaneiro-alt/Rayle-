import { DEG, ajouter, sub, mul, dot, croix, norme, unitaire, dist, lerp, identite, multiplier, chaine, translation, rotationAxe, point, direction, rotationAutour, inverseRigide, rotationRepere, rotationEntre, axeAngle, angleEntre, angleSigne, projeteSurPlan, quatDepuisMat, matDepuisQuat, slerp } from './anatomie-mat4.js';
const cl01 = x => Math.max(0, Math.min(1, x));
import { SEGMENTS, ORDRE, PARENT, PIVOT, COTES, centreDeMasse } from './anatomie-corps.js';

/* ═════════════ ANATOMIE : MOTEUR DE CINÉMATIQUE V2 (module pur, Phase C) ═════════════
   À partir d'une « pose » (angles articulaires + placement du bassin + pieds posés), calcule la transformation rigide de chacun des 20 segments (repère du modèle au repos).
   - Articulations à axes physiologiques : charnières (genou, coude, cheville…), rotules à plan d'élévation (hanche, épaule : pas de blocage de cardan), rachis en trois étages.
   - Rythme scapulo-huméral : l'orientation du bras est celle demandée (thoraco-humérale) ; clavicule et scapula tournent pour la porter (≈ 2:1 : 120° gléno-huméral, 60° scapulo-thoracique).
   - Pieds posés : cinématique inverse à deux segments (cuisse, jambe) : la cheville reste EXACTEMENT où on la place (pas de glissement), le genou suit l'axe du pied (pied tourné de yaw), le bassin
     est abaissé automatiquement si la jambe ne peut pas atteindre le pied.
   - Équilibre : le bassin est translaté horizontalement pour que le centre de gravité (masses de Winter) se projette au centre de la base d'appui (polygone convexe des pieds posés).
   - Contrôles : angles mesurés par articulation pour comparer aux amplitudes de référence (ROM, À VÉRIFIER), polygone d'appui, marge du centre de gravité.
   Convention de signe (physique, vérifiée par les tests) : fl > 0 flexion (hanche, épaule, coude, tronc, tête : vers l'avant ; genou : jambe vers l'arrière ; cheville : orteils vers le haut = dorsiflexion),
   ab > 0 abduction (membres) ou inclinaison vers la DROITE (rachis), rot > 0 rotation externe (membres) ou vers la DROITE (rachis). */
const Dn = [0, -1, 0], Up = [0, 1, 0];
const rad = x => x * DEG;
const part = m => [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, 0, 0, 0, 1];     // partie rotation seule

export function creerCinematique(corps) {
  const P = corps.pivots, a = corps.ant, Fw = [0, 0, a], cR = corps.cote.droit, lat = S => corps.lat(S), Lat = S => [lat(S), 0, 0];
  const hip0 = S => P['hanche' + S], kn0 = S => P['genou' + S], an0 = S => P['cheville' + S];
  const u0 = S => unitaire(sub(kn0(S), hip0(S))), s0 = S => unitaire(sub(an0(S), kn0(S)));
  const repos = Object.fromEntries(SEGMENTS.map(s => [s, identite()]));

  /* rotations élémentaires du rachis (rotule fl / ab / rot) */
  const Rx = th => rotationAxe([1, 0, 0], th), Ry = th => rotationAxe(Up, th), Rz = th => rotationAxe([0, 0, 1], th);
  const rotRachis = (j = {}) => chaine(Rx(a * rad(j.fl || 0)), Rz(-cR * rad(j.ab || 0)), Ry(a * cR * rad(j.rot || 0)));
  /* rotule à plan d'élévation (hanche, épaule). Entrées : { plan, ele, rot } ou { fl, ab, rot } (convertis). plan : 0 = abduction (frontal), 90 = flexion (sagittal). */
  function versPlanEle(j = {}) {
    if (j.ele !== undefined) return { plan: j.plan === undefined ? 0 : j.plan, ele: j.ele, rot: j.rot || 0 };
    const fl = j.fl || 0, ab = j.ab || 0, ele = Math.hypot(fl, ab);
    if (ele < 1e-9) return { plan: 0, ele: 0, rot: j.rot || 0 };
    return { plan: Math.atan2(fl, ab) / DEG, ele, rot: j.rot || 0 };
  }
  function rotBoule(S, j) {
    const { plan, ele, rot } = versPlanEle(j), p = rad(plan);
    const d = [Math.cos(p) * lat(S), 0, Math.sin(p) * a];                                   // direction dans le plan transverse : latérale (plan 0) ou vers l'avant (plan 90)
    const axe = croix(Dn, d), ax = norme(axe) < 1e-9 ? [0, 0, 1] : axe;
    return multiplier(rotationAxe(ax, rad(ele)), Ry(a * lat(S) * rad(rot)));                // rotation propre d'abord (axe du membre au repos), puis élévation
  }
  const rotCharniere = (th, signe) => Rx(signe * a * rad(th));                              // axe médio-latéral

  /* ── rythme scapulo-huméral ── */
  const AXE_SCAP = S => { const c = rad(30), v = ajouter(mul(Fw, Math.cos(c)), mul(Lat(S), Math.sin(c))); return mul(v, a * lat(S)); };
  function ceinture(S, ele, plan, spec) {
    const ov = spec || {};
    const rotHaut = ov.scap && ov.scap.rotHaut !== undefined ? ov.scap.rotHaut : Math.max(0, ele - 20) * (60 / 160);
    const elev = ov.clav && ov.clav.elev !== undefined ? ov.clav.elev : Math.min(15, ele * 0.09), prot = ov.clav && ov.clav.prot !== undefined ? ov.clav.prot : Math.sin(rad(Math.max(0, Math.min(150, plan)))) * Math.min(1, ele / 120) * 18;
    return { rotHaut, elev, prot };
  }
  const clavRot = (S, elev, prot) => chaine(rotationAxe([0, 0, lat(S)], rad(elev)), Ry(-a * lat(S) * rad(prot)));

  /* ── sections : pose d'un côté (jambe) ── */
  function empreintePied(S, p = {}) {
    const ch = an0(S), toe = corps.pied[S].orteils;
    let T = translation([p.dx || 0, p.dy || 0, p.dz || 0]);
    if (p.yaw) T = multiplier(T, rotationAutour(ch, Up, rad(p.yaw)));
    if (p.pitch) T = multiplier(T, rotationAutour(ch, [1, 0, 0], -a * rad(p.pitch)));          // pitch > 0 : orteils vers le haut
    if (p.talon) T = multiplier(T, rotationAutour(toe, [1, 0, 0], a * rad(p.talon)));          // talon levé (autour des orteils)
    return T;
  }
  function ikJambe(S, T, hanche, cible, pole) {
    const L1 = corps.jambes[S].L1, L2 = corps.jambes[S].L2, A = cible;
    const v = sub(A, hanche); let d = norme(v), manque = 0; const u = unitaire(v);
    const dmax = (L1 + L2) * 0.9998, dmin = Math.abs(L1 - L2) + 1e-3;
    if (d > dmax) { manque = d - dmax; d = dmax; } else if (d < dmin) d = dmin;
    const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
    let pp = sub(pole, mul(u, dot(pole, u))); if (norme(pp) < 1e-6) pp = sub(Fw, mul(u, dot(Fw, u))); pp = unitaire(pp);
    const K = ajouter(ajouter(hanche, mul(u, aa)), mul(pp, h)), up = unitaire(sub(K, hanche)), us = unitaire(sub(A, K)), hax = unitaire(croix(unitaire(sub(A, hanche)), pp));
    const ref = Fw, h0c = unitaire(croix(u0(S), ref)), h0s = unitaire(croix(s0(S), ref));
    const Rc = rotationRepere(u0(S), h0c, up, hax), Rs = rotationRepere(s0(S), h0s, us, hax);
    T['cuisse' + S] = chaine(translation(hanche), Rc, translation(mul(hip0(S), -1)));
    T['jambe' + S] = chaine(translation(K), Rs, translation(mul(kn0(S), -1)));
    return { genou: K, manque, hax };
  }

  /* ── pose complète ── */
  function poser(spec = {}) {
    const J = spec.joints || {}, pel = spec.pelvis || {}, avert = [];
    let dx = pel.dx || 0, dy = pel.dy || 0, dz = pel.dz || 0, essai = 0, T, info;
    const iks = !!spec.pied && Object.values(spec.pied).some(q => q.ik !== false);          // sans pied posé par cinématique inverse, déplacer le bassin ferait glisser les pieds
    const equilibre = spec.equilibre !== false && spec.equilibre !== null && iks ? spec.equilibre || { mode: 'marge' } : null;
    for (;;) {
      ({ T, info } = construire(dx, dy, dz));
      if (info.manqueMax > 1e-5 && essai < 6 && spec.abaisser !== false) { dy -= info.manqueMax + 1e-4; essai++; continue; }          // le bassin descend si la jambe ne peut pas atteindre le pied
      break;
    }
    /* Équilibre. Mode « marge » (défaut) : le bassin ne bouge que si le centre de gravité s'approche à moins de `marge` (4 cm) du bord de la base d'appui ; mode « centre » : le centre
       de gravité est ramené exactement au centre de la base d'appui (mouvements symétriques en chaîne fermée : squat, fente). */
    if (equilibre) {
      const m0 = equilibre.marge === undefined ? 0.04 : equilibre.marge, centre = equilibre.mode === 'centre';
      for (let k = 0; k < 60; k++) {
        const g = centreDeMasse(corps, T, point), cible = equilibre.cible || info.appui.centre, ex = cible[0] - g[0], ez = cible[1] - g[2];
        if (centre ? Math.hypot(ex, ez) < 3e-4 : margeDansPolygone(info.appui.polygone, [g[0], g[2]]) >= m0) break;
        const k2 = centre ? 1.3 : 0.3; dx += (equilibre.axes === 'z' ? 0 : ex) * k2; dz += (equilibre.axes === 'x' ? 0 : ez) * k2;
        ({ T, info } = construire(dx, dy, dz));
        if (info.manqueMax > 1e-5) { dy -= info.manqueMax + 1e-4; ({ T, info } = construire(dx, dy, dz)); }
      }
    }
    const cdg = centreDeMasse(corps, T, point);
    return { T, cdg, appui: info.appui, equilibre: !!equilibre, marge: margeDansPolygone(info.appui.polygone, [cdg[0], cdg[2]]), pieds: info.pieds, angles: mesurer(T, J), pelvis: { dx, dy, dz }, avertissements: avert, manque: info.manqueMax };
  }

  function construire(dx, dy, dz) {
    const spec = construire.spec, J = spec.joints || {}, pel = spec.pelvis || {}, T = { ...repos };
    const mil = corps.hancheMilieu;
    // bassin : rotation autour du milieu des hanches, puis translation
    const Rb = chaine(Rx(a * rad(pel.fl || 0)), Rz(-cR * rad(pel.ab || 0)), Ry(a * cR * rad(pel.rot || 0)));
    T.bassin = chaine(translation([dx, dy, dz]), translation(mil), Rb, translation(mul(mil, -1)));
    const L = (seg, R) => chaine(translation(P[PIVOT[seg]]), R, translation(mul(P[PIVOT[seg]], -1)));
    T.lombaire = multiplier(T.bassin, L('lombaire', rotRachis(J.lombaire)));
    T.tronc = multiplier(T.lombaire, L('tronc', rotRachis(J.tronc)));
    T.tete = multiplier(T.tronc, L('tete', rotRachis(J.tete)));
    for (const S of COTES) {
      const ep = J['epaule' + S] || {}, pe = versPlanEle(ep), cei = ceinture(S, pe.ele, pe.plan, { clav: J['clav' + S], scap: J['scap' + S] });
      T['clav' + S] = multiplier(T.tronc, L('clav' + S, clavRot(S, cei.elev, cei.prot)));
      T['scap' + S] = multiplier(T['clav' + S], L('scap' + S, rotationAxe(AXE_SCAP(S), rad(cei.rotHaut))));
      const G = point(T['scap' + S], P['epaule' + S]), Rw = multiplier(part(T.tronc), rotBoule(S, ep));
      T['bras' + S] = chaine(translation(G), Rw, translation(mul(P['epaule' + S], -1)));
      const co = J['coude' + S] || {}; T['avantbras' + S] = multiplier(T['bras' + S], L('avantbras' + S, chaine(rotCharniere(co.fl || 0, -1), Ry(a * lat(S) * rad(co.pro || 0)))));
      const po = J['poignet' + S] || {}; T['main' + S] = multiplier(T['avantbras' + S], L('main' + S, chaine(Rz(lat(S) * rad(po.dev || 0)), rotCharniere(po.fl || 0, -1))));
    }
    const pieds = {}, appuiPieds = []; let manqueMax = 0;
    for (const S of COTES) {
      const hanche = point(T.bassin, hip0(S)), p = spec.pied && spec.pied[S];
      if (p && p.ik !== false) {
        const Tf = empreintePied(S, p), A = point(Tf, an0(S)), pole = p.pole || direction(Tf, Fw);
        const r = ikJambe(S, T, hanche, A, [pole[0], 0, pole[2]]); T['pied' + S] = Tf; manqueMax = Math.max(manqueMax, r.manque);
        if (typeof p.cheville === 'number') {              // pied qui pend (phase d'envol, pas) : son orientation suit la jambe ; mélange avec l'orientation à plat selon p.melange (1 = pied à plat sur le sol)
          const Trel = multiplier(T['jambe' + S], L('pied' + S, rotCharniere(p.cheville, -1))), w = p.melange === undefined ? 0 : cl01(p.melange);
          const Rm = w >= 1 ? part(Tf) : w <= 0 ? part(Trel) : matDepuisQuat(slerp(quatDepuisMat(part(Trel)), quatDepuisMat(part(Tf)), w));
          T['pied' + S] = chaine(translation(A), Rm, translation(mul(an0(S), -1)));
        }
        pieds[S] = { cheville: A, erreur: r.manque, genou: r.genou, appui: p.appui !== false };
        if (p.appui !== false) appuiPieds.push(S);
      } else {
        const h = J['hanche' + S] || {}, g = J['genou' + S] || {}, c = J['cheville' + S] || {};
        T['cuisse' + S] = multiplier(T.bassin, L('cuisse' + S, rotBoule(S, h)));
        T['jambe' + S] = multiplier(T['cuisse' + S], L('jambe' + S, chaine(Rz(lat(S) * rad(g.ab || 0)), rotCharniere(g.fl || 0, 1))));
        T['pied' + S] = multiplier(T['jambe' + S], L('pied' + S, chaine(rotationAxe([0, 0, 1], rad((c.inv || 0) * lat(S))), rotCharniere(c.fl || 0, -1))));
        pieds[S] = { cheville: point(T['pied' + S], an0(S)), erreur: 0, genou: point(T['jambe' + S], kn0(S)), appui: !!(p && p.appui !== false) };
        if (p && p.appui !== false) appuiPieds.push(S);              // pied compté dans la base d'appui sans cinématique inverse (jambe en rotation libre)
      }
    }
    const polygone = polygoneAppui(T, appuiPieds, spec), centre = polygone.length ? centroide(polygone) : [mil[0] + dx, mil[2] + dz];
    return { T, info: { pieds, manqueMax, appui: { pieds: appuiPieds, polygone, centre } } };
  }

  /* base d'appui : coins de chaque pied posé (talon → orteils, largeur du pied), enveloppe convexe dans le plan horizontal (x, z) */
  function polygoneAppui(T, lesPieds, spec) {
    const pts = [];
    for (const S of lesPieds) {
      const f = corps.pied[S], p = spec.pied[S] || {}, Tf = T['pied' + S], lev = (p.talon || 0) > 6;
      const t = point(Tf, f.talon), o = point(Tf, f.orteils); const axe = unitaire([o[0] - t[0], 0, o[2] - t[2]]); const lt = [-axe[2], 0, axe[0]], w = f.demiLargeur * 0.9;
      const debut = lev ? lerp(t, o, 0.55) : t;
      for (const e of [debut, o]) for (const s of [-1, 1]) pts.push([e[0] + lt[0] * w * s, e[2] + lt[2] * w * s]);
    }
    return enveloppe(pts);
  }

  /* ── angles mesurés (comparés aux amplitudes de référence) ── */
  function mesurer(T) {
    const out = {}, X = [1, 0, 0], Z = [0, 0, 1], deg = r => r / DEG;
    const Ibas = inverseRigide(T.bassin);
    /* rotule : décompose R en élévation, plan d'élévation (0 = abduction, 90 = flexion) et rotation propre (> 0 : externe) */
    const boule = (S, R) => {
      const s = rotationEntre(Dn, direction(R, Dn)), { axe, angle } = axeAngle(s), d = croix(axe, Dn), ele = deg(angle);
      const plan = ele < 1e-6 ? 0 : deg(Math.atan2(dot(d, Fw) * a * a, dot(d, [lat(S), 0, 0]) * lat(S) * lat(S))), ax = multiplier(inverseRigide(s), R);
      const rot = deg(angleSigne(Fw, direction(ax, Fw), Up)) * a * lat(S);
      return { ele, plan, fl: ele * Math.sin(plan * DEG), ab: ele * Math.cos(plan * DEG), rot };
    };
    /* charnière : angle signé, dans le plan perpendiculaire à l'axe h, entre l'axe du segment proximal et l'axe du segment distal (la valeur du repos est retirée) */
    const charniere = (h, p0, d0, p1, d1) => { if (dot(h, X) < 0) h = mul(h, -1); const f = (p, d) => angleSigne(projeteSurPlan(p, h), projeteSurPlan(d, h), h); return deg(f(p1, d1) - f(p0, d0)); };
    for (const S of COTES) {
      const R = multiplier(part(Ibas), part(T['cuisse' + S]));
      out['hanche' + S] = boule(S, R);
      const hax = direction(T['cuisse' + S], X), us = direction(T['cuisse' + S], u0(S)), ss = direction(T['jambe' + S], s0(S));
      out['genou' + S] = { fl: a * charniere(hax, u0(S), s0(S), us, ss) };
      const pie = unitaire(sub(point(T['pied' + S], corps.pied[S].orteils), point(T['pied' + S], corps.pied[S].talon))), pie0 = unitaire(sub(corps.pied[S].orteils, corps.pied[S].talon));
      out['cheville' + S] = { fl: -a * charniere(hax, s0(S), pie0, ss, pie) };
      const Rt = multiplier(part(inverseRigide(T.tronc)), part(T['bras' + S])); out['epaule' + S] = boule(S, Rt);
      /* coude et poignet : rotation relative exacte du segment par rapport à son parent (R = Rx(flexion) · Ry(pronation) ; R = Rz(déviation) · Rx(flexion)) */
      const Rco = multiplier(part(inverseRigide(T['bras' + S])), part(T['avantbras' + S])), Rpo = multiplier(part(inverseRigide(T['avantbras' + S])), part(T['main' + S]));
      out['coude' + S] = { fl: -a * deg(Math.atan2(Rco[6], Rco[5])), pro: deg(Math.atan2(Rco[8], Rco[0])) / (a * lat(S)) };
      out['poignet' + S] = { fl: -a * deg(Math.atan2(Rpo[6], Rpo[10])), dev: deg(Math.atan2(Rpo[1], Rpo[0])) * lat(S) };
      const sc = multiplier(part(inverseRigide(T.tronc)), part(T['scap' + S])), ax = axeAngle(sc); out['scap' + S] = { rotHaut: deg(ax.angle) };
    }
    const rel = (parent, enfant) => { const R = multiplier(part(inverseRigide(T[parent])), part(T[enfant])), v = direction(R, Up), f = direction(R, Fw); return { fl: a * deg(angleSigne(Up, v, X)), ab: -cR * deg(angleSigne(projeteSurPlan(Up, Z), projeteSurPlan(v, Z), Z)), rot: a * cR * deg(angleSigne(projeteSurPlan(Fw, Up), projeteSurPlan(f, Up), Up)) }; };
    out.lombaire = rel('bassin', 'lombaire'); out.tronc = rel('lombaire', 'tronc'); out.tete = rel('tronc', 'tete');
    return out;
  }

  const exposee = {
    corps, poser(spec) { construire.spec = spec; return poser(spec); }, rotBoule, rotRachis, versPlanEle, ceinture, mesurer,
    /* Nombre de segments, noms et index (uniformes du nuanceur) */
    segments: SEGMENTS, ordre: ORDRE, parent: PARENT,
    /* Pose au repos (identité partout) */
    repos: () => ({ ...repos }),
    /* Longueur de jambe maximale (hanche → cheville) et distance de repos */
    longueursJambe: S => ({ L1: corps.jambes[S].L1, L2: corps.jambes[S].L2, repos: dist(hip0(S), an0(S)) })
  };
  return exposee;
}

/* ── géométrie 2D utilitaire ── */
export function enveloppe(points) {
  const p = points.map(q => q.slice()).sort((x, y) => x[0] - y[0] || x[1] - y[1]); if (p.length < 3) return p;
  const cr = (o, a2, b) => (a2[0] - o[0]) * (b[1] - o[1]) - (a2[1] - o[1]) * (b[0] - o[0]), bas = [], haut = [];
  for (const q of p) { while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], q) <= 0) bas.pop(); bas.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], q) <= 0) haut.pop(); haut.push(q); }
  bas.pop(); haut.pop(); return bas.concat(haut);
}
export function centroide(poly) { let x = 0, z = 0; for (const q of poly) { x += q[0]; z += q[1]; } return [x / poly.length, z / poly.length]; }
/* Distance signée du point au polygone convexe : POSITIVE à l'intérieur (marge jusqu'au bord le plus proche), négative à l'extérieur. */
export function margeDansPolygone(poly, pt) {
  if (poly.length < 3) return -1;
  let min = Infinity, dedans = true;
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length], ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez) || 1;
    const s = (ex * (pt[1] - A[1]) - ez * (pt[0] - A[0])) / L;           // > 0 : à gauche de l'arête (polygone anti-horaire)
    if (s < 0) dedans = false; min = Math.min(min, Math.abs(s));
  }
  return dedans ? min : -min;
}
void unitaire; void lerp; void dist;

/* Contexte transmis aux mouvements : orientation du modèle, côté droit, centre des pieds (projection horizontale [x, z]). */
export function contexteMouvement(corps) {
  const centrePied = S => { const f = corps.pied[S]; return [(f.talon[0] + f.orteils[0]) / 2, (f.talon[2] + f.orteils[2]) / 2]; };
  return { corps, a: corps.ant, cR: corps.cote.droit, lat: S => corps.lat(S), centrePied, centreDeux: () => { const d = centrePied('D'), g = centrePied('G'); return [(d[0] + g[0]) / 2, (d[1] + g[1]) / 2]; } };
}
