/* ═════════════ MODÈLE DE VOL DU VAISSEAU (pur : aucun navigateur, aucune bibliothèque 3D ; testé sous Node) ═════════════
   Tout est en double précision (nombres JavaScript) : la position du vaisseau reste exacte même très loin de l'origine ; le rendu n'utilise que des
   positions RELATIVES à la caméra (three.js calcule la matrice vue × modèle en double avant de l'envoyer au GPU), ce qui tient lieu d'origine flottante.
   Repère du vaisseau : avant = −Z, droite = +X, haut = +Y (comme une caméra three.js). Unité : l'unité de la galaxie ; temps en secondes.
   Entrées (cmd) : trans = [droite, haut, avant] ∈ [−1, 1]³ ; rot = [tangage (nez vers le haut > 0), lacet (nez vers la gauche > 0), roulis (à droite > 0)] ∈ [−1, 1]³ ;
   post = postcombustion ; frein = freinage actif. Réglages d'état : assist (assistance de vol : la vitesse suit la consigne et s'annule sans entrée),
   limiteur (vitesse plafonnée), ou vol newtonien pur (la poussée s'ajoute à la vitesse, rien ne la freine). */

export const PARAMS = Object.freeze({
  accAvant: 7, accLat: 3.5, accVert: 3.5,       // accélérations (u/s²)
  vitMax: 8, facteurPost: 3.5,                   // vitesse de croisière (u/s) et facteur de postcombustion (vitesse et accélération)
  vitAbsolue: 80,                                // plafond absolu même sans limiteur
  freinage: 12,                                  // décélération du frein (u/s²)
  rotMax: [1.3, 1.1, 1.7], rotAccel: 7,          // vitesses de rotation maximales (rad/s) et rapidité de réponse
  margeSurface: 0.02,                            // distance minimale à la surface d'un astre (u)
  vitProche: 1.4, vitProcheMin: 0.35,            // près d'un astre : vitesse permise = max(min, coefficient × altitude)
  mu: 4                                           // « gravité de jeu » pour les orbites : v² = mu / r (utilisé seulement par la mise en orbite)
});

/* ── algèbre minimale (tableaux de nombres) ── */
export const norme = v => Math.hypot(v[0], v[1], v[2]);
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = a => { const n = norme(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const lim = (v, a, b) => Math.max(a, Math.min(b, v));
const limiterNorme = (v, max) => { const n = norme(v); return n > max ? mul(v, max / n) : v; };
/* quaternion [x, y, z, w] */
export const QID = [0, 0, 0, 1];
export const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
export const qNorm = q => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export const qAxe = (axe, ang) => { const s = Math.sin(ang / 2), u = unit(axe); return [u[0] * s, u[1] * s, u[2] * s, Math.cos(ang / 2)]; };
export function qVec(q, v) {                      // rotation d'un vecteur par un quaternion
  const [x, y, z, w] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export const qConj = q => [-q[0], -q[1], -q[2], q[3]];
/* quaternion qui oriente l'avant (−Z) vers la direction d, le haut aussi proche que possible de h */
export function qRegarde(d, h = [0, 1, 0]) {
  const f = unit(d); let r = cross(f, h); if (norme(r) < 1e-6) r = cross(f, [1, 0, 0]); r = unit(r);
  const u = cross(r, f), z = mul(f, -1);          // colonnes : droite, haut, arrière (+Z)
  const m00 = r[0], m01 = u[0], m02 = z[0], m10 = r[1], m11 = u[1], m12 = z[1], m20 = r[2], m21 = u[2], m22 = z[2];
  const tr = m00 + m11 + m22; let x, y, zq, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; zq = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; zq = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; zq = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; zq = 0.25 * s; }
  return qNorm([x, y, zq, w]);
}

export function etatInitial(o = {}) {
  return { pos: [0, 0, 0], vel: [0, 0, 0], q: QID.slice(), om: [0, 0, 0], assist: true, limiteur: true, post: false, orbite: null, collision: 0, ...o };
}

/* Astre le plus proche (surface) : { corps, d (centre), alt (surface) } ; corps : [{ id, pos, rayon }] */
export function plusProche(pos, corps) {
  let m = null;
  for (const c of corps) {
    const d = norme(sub(pos, c.pos)), alt = d - c.rayon;
    if (!m || alt < m.alt) m = { corps: c, d, alt };
  }
  return m;
}
/* Vitesse permise à cette altitude (le vaisseau ralentit en approchant d'un astre : on ne s'écrase pas à pleine vitesse). */
export const vitesseProche = (alt, p = PARAMS) => Math.max(p.vitProcheMin, p.vitProche * Math.max(alt, 0));

/* Un pas de simulation. Renvoie des événements éventuels : { collision: id } . L'état est modifié en place. */
export function pas(e, cmd, dt, p = PARAMS, corps = [], echelle = 1) {
  const ev = {};
  const trans = cmd.trans || [0, 0, 0], rot = cmd.rot || [0, 0, 0];
  const post = !!(cmd.post && !cmd.frein);
  e.post = post;
  if (e.orbite && (norme(trans) > 0.05 || cmd.frein)) e.orbite = null;      // toute poussée volontaire quitte l'orbite
  if (e.orbite) return avancerOrbite(e, dt, corps, ev);

  // ── rotation (repère du vaisseau) : la vitesse angulaire suit la consigne ; en vol newtonien pur elle persiste sans entrée
  const rm = p.rotMax;
  const cible = [rot[0] * rm[0], rot[1] * rm[1], -rot[2] * rm[2]];   // roulis > 0 = aile droite vers le bas (rotation autour de +Z de signe opposé)
  const k = Math.min(1, p.rotAccel * dt);
  if (e.assist || norme(rot) > 0.01) for (let i = 0; i < 3; i++) e.om[i] += (cible[i] - e.om[i]) * k;
  const w = norme(e.om);
  if (w > 1e-9) e.q = qNorm(qMul(e.q, qAxe([e.om[0], e.om[1], e.om[2]], w * dt)));   // om = (tangage autour de +X, lacet autour de +Y, roulis autour de −Z) appliqué dans le repère du vaisseau

  // ── translation
  const pf = post ? p.facteurPost : 1, echelleV = echelle;
  const vmax = Math.min(p.vitMax * pf * echelleV, p.vitAbsolue * echelleV);
  const base = [trans[0] * p.accLat, trans[1] * p.accVert, trans[2] * p.accAvant].map(v => v * pf * echelleV);
  const acc = qVec(e.q, [base[0], base[1], -base[2]]);                      // monde
  if (cmd.vitesseVoulue) {                                                  // pilote automatique : consigne de vitesse en repère monde
    const dv = sub(cmd.vitesseVoulue, e.vel), a = p.accAvant * p.facteurPost * echelleV * 1.2;
    e.vel = add(e.vel, limiterNorme(dv, a * dt));
  } else if (cmd.frein) {
    const n = norme(e.vel), d = p.freinage * echelleV * dt;
    e.vel = n <= d ? [0, 0, 0] : mul(e.vel, (n - d) / n);
  } else if (e.assist) {                                                    // assistance : la vitesse suit la consigne (nulle sans entrée)
    const voulue = qVec(e.q, [trans[0] * vmax, trans[1] * vmax * 0.6, -trans[2] * vmax]);
    const dv = sub(voulue, e.vel), aMax = Math.max(Math.hypot(...base) || 0, (p.accAvant * 0.6) * pf * echelleV);
    e.vel = add(e.vel, limiterNorme(dv, aMax * dt));
  } else {                                                                  // vol newtonien : la poussée s'ajoute, rien ne freine
    e.vel = add(e.vel, mul(acc, dt));
    if (e.limiteur) e.vel = limiterNorme(e.vel, vmax);
  }
  if (e.limiteur || e.assist) e.vel = limiterNorme(e.vel, vmax * (cmd.vitesseVoulue ? 1.5 : 1));
  e.vel = limiterNorme(e.vel, p.vitAbsolue * echelleV);

  // ── près d'un astre : plafond de vitesse selon l'altitude, puis déplacement, puis collision
  const pr = corps.length ? plusProche(e.pos, corps) : null;
  if (pr && pr.alt < pr.corps.rayon * 3 && !cmd.vitesseVoulue) {
    const vl = vitesseProche(pr.alt, p) * echelleV * (post ? 1.6 : 1);
    if (norme(e.vel) > vl) e.vel = mul(e.vel, Math.max(vl / norme(e.vel), 1 - 3 * dt));
  }
  e.pos = add(e.pos, mul(e.vel, dt));
  e.collision = 0;
  for (const c of corps) {
    const v = sub(e.pos, c.pos), d = norme(v), mini = c.rayon + p.margeSurface;
    if (d < mini) {
      const n = d > 1e-9 ? mul(v, 1 / d) : [0, 1, 0];
      e.pos = add(c.pos, mul(n, mini));
      const vn = dot(sub(e.vel, c.vel || [0, 0, 0]), n);
      if (vn < 0) e.vel = sub(e.vel, mul(n, vn));                           // la vitesse vers l'astre est annulée : on glisse, on ne traverse pas
      e.collision = 1; ev.collision = c.id;
    }
  }
  return ev;
}

/* ── orbite circulaire cinématique autour d'un astre : mu de jeu, sens et plan choisis ── */
export function orbiteCirculaire(corps, altitude, { normale = [0, 1, 0], depart = null, sens = 1, mu = PARAMS.mu } = {}) {
  const r = corps.rayon + altitude, n = unit(normale);
  let radial = depart ? sub(depart, corps.pos) : [1, 0, 0];
  radial = sub(radial, mul(n, dot(radial, n))); if (norme(radial) < 1e-6) radial = cross(n, [0, 0, 1]); radial = unit(radial);
  const vit = Math.sqrt(mu / r), angle = Math.atan2(dot(cross(radial, [1, 0, 0]), n), dot(radial, [1, 0, 0]));
  return { corps: corps.id, r, n, sens, vit, omega: sens * vit / r, base: radial, angle: 0, periode: 2 * Math.PI * r / vit, angle0: angle };
}
function avancerOrbite(e, dt, corps, ev) {
  const o = e.orbite, c = corps.find(x => x.id === o.corps);
  if (!c) { e.orbite = null; return ev; }
  o.angle += o.omega * dt;
  const tang = cross(o.n, o.base), ca = Math.cos(o.angle), sa = Math.sin(o.angle);
  const radial = add(mul(o.base, ca), mul(tang, sa)), tangente = add(mul(o.base, -sa), mul(tang, ca));
  e.pos = add(c.pos, mul(radial, o.r));
  e.vel = add(mul(tangente, o.omega * o.r), c.vel || [0, 0, 0]);
  e.q = qRegarde(mul(tangente, Math.sign(o.sens) || 1));                     // le nez suit la trajectoire
  e.om = [0, 0, 0];
  return ev;
}
export function entrerEnOrbite(e, c, altitude = c.rayon * 1.2, opts = {}) {
  e.orbite = orbiteCirculaire(c, altitude, { depart: e.pos, ...opts });
  const o = e.orbite;
  // l'angle de départ est celui de la position actuelle : pas de saut
  const radial = unit(sub(e.pos, c.pos)); const proj = sub(radial, mul(o.n, dot(radial, o.n)));
  o.base = norme(proj) > 1e-6 ? unit(proj) : o.base; o.angle = 0;
  return o;
}

/* ── pilote automatique : va vers un astre et s'arrête à l'altitude demandée ──
   Rend { cmd, arrive, dist, etape } ; cmd est à passer à pas(). La cible bouge (orbites) : on vise sa position actuelle et on copie sa vitesse. */
export function piloteAuto(e, cible, { altitude = cible.rayon * 1.2, p = PARAMS, echelle = 1, tol = 0.15 } = {}) {
  const versCentre = sub(cible.pos, e.pos), dC = norme(versCentre), dir = dC > 1e-9 ? mul(versCentre, 1 / dC) : [0, 0, -1];
  const point = sub(cible.pos, mul(dir, cible.rayon + altitude));            // point d'arrivée, côté vaisseau
  const reste = norme(sub(point, e.pos));
  const aF = p.accAvant * p.facteurPost * echelle, vCroi = p.vitMax * p.facteurPost * echelle * 0.9;
  const vc = cible.vel || [0, 0, 0];
  const relative = sub(e.vel, vc);
  const vVoulue = Math.min(vCroi, Math.sqrt(2 * aF * 0.55 * Math.max(reste - tol * 0.5, 0)) + 0.02);
  const vers = reste > 1e-9 ? mul(sub(point, e.pos), 1 / reste) : [0, 0, 0];
  const cmd = { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: false, vitesseVoulue: add(vc, mul(vers, vVoulue)) };
  // orientation : le nez vers la destination (rotation proportionnelle)
  const avant = qVec(e.q, [0, 0, -1]), hautV = qVec(e.q, [0, 1, 0]), droite = qVec(e.q, [1, 0, 0]);
  const cible2 = reste > 0.5 ? vers : unit(versCentre);
  const eLac = dot(cible2, droite), eTan = dot(cible2, hautV);               // composantes de l'erreur dans le repère du vaisseau
  cmd.rot = [lim(eTan * 3, -1, 1), lim(-eLac * 3, -1, 1), 0];
  const arrive = reste < tol && norme(relative) < 0.35;
  return { cmd, arrive, dist: reste, vitesse: norme(relative), etape: reste < tol * 4 ? 'approche finale' : reste > 2 ? 'croisière' : 'freinage' };
}

/* ── télémétrie pour les écrans du cockpit ── */
export function telemetrie(e, corps = [], echelle = { kmParUnite: 1 }) {
  const v = norme(e.vel), avant = qVec(e.q, [0, 0, -1]);
  const cap = (Math.atan2(avant[0], -avant[2]) * 180 / Math.PI + 360) % 360;       // 0 = −Z, 90 = +X
  const tangage = Math.asin(lim(avant[1], -1, 1)) * 180 / Math.PI;
  const droite = qVec(e.q, [1, 0, 0]), roulis = -Math.asin(lim(droite[1], -1, 1)) * 180 / Math.PI;
  const pr = corps.length ? plusProche(e.pos, corps) : null;
  return { vitesse: v, vitesseKmS: v * (echelle.kmParUnite || 1), cap, tangage, roulis, proche: pr ? { id: pr.corps.id, nom: pr.corps.nom || pr.corps.id, distance: pr.d, altitude: pr.alt } : null, orbite: e.orbite ? e.orbite.corps : null, assist: e.assist, limiteur: e.limiteur, post: e.post };
}
