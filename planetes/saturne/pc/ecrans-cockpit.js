/* ═════════════ ÉCRANS HOLOGRAPHIQUES DU COCKPIT (dessins 2D dans des canvas, puis utilisés comme textures) ═════════════
   Style de la V1 : fond sombre translucide, un seul accent cyan froid (#8fd0e3) et du sable discret (#c9b27a), rouge et vert seulement pour des valeurs d'alerte,
   chiffres en police à chasse fixe. Aucune donnée inventée : tout vient de la télémétrie du modèle de vol (vol-calcul.js) ou de l'état réel de Raylé et des
   alertes reçues ; une information absente s'écrit « — ». Aucune dépendance à three.js : testable (les fonctions reçoivent un contexte 2D). */
export const COULEURS = { fond: 'rgba(4,9,15,0.86)', cyan: '#8fd0e3', cyanDoux: 'rgba(143,208,227,0.35)', sable: '#c9b27a', blanc: '#e8f4fb', rouge: '#ff6b6b', vert: '#41e0a0', orange: '#ffb347', gris: 'rgba(160,185,200,0.55)' };
export const POLICE = '"Cascadia Mono", Consolas, "Courier New", monospace';
export const TAILLE = { l: 512, h: 320 };
const C = COULEURS;

function cadre(ctx, titre, droite = '') {
  const { l, h } = TAILLE;
  ctx.clearRect(0, 0, l, h); ctx.fillStyle = C.fond; ctx.fillRect(0, 0, l, h);
  ctx.strokeStyle = C.cyanDoux; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(l - 24, 3); ctx.lineTo(l - 3, 24); ctx.lineTo(l - 3, h - 3); ctx.lineTo(24, h - 3); ctx.lineTo(3, h - 24); ctx.lineTo(3, 10); ctx.closePath(); ctx.stroke();   // coins coupés
  ctx.font = `600 15px ${POLICE}`; ctx.fillStyle = C.cyan; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(titre, 18, 28);
  ctx.textAlign = 'right'; ctx.fillStyle = C.gris; ctx.font = `13px ${POLICE}`; ctx.fillText(droite, l - 18, 28); ctx.textAlign = 'left';
  ctx.strokeStyle = C.cyanDoux; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, 38); ctx.lineTo(l - 14, 38); ctx.stroke();
}
const texte = (ctx, t, x, y, { taille = 14, couleur = C.blanc, align = 'left', poids = 400 } = {}) => { ctx.font = `${poids} ${taille}px ${POLICE}`; ctx.fillStyle = couleur; ctx.textAlign = align; ctx.fillText(t, x, y); ctx.textAlign = 'left'; };
export const formater = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ','));
export const formaterDistanceKm = km => (km === null || !Number.isFinite(km) ? '—' : km >= 1e9 ? formater(km / 1e9, 2) + ' Md km' : km >= 1e6 ? formater(km / 1e6, 1) + ' M km' : km >= 1e3 ? Math.round(km).toLocaleString('fr-FR') + ' km' : Math.round(km) + ' km');
function barre(ctx, x, y, w, h, v, couleur = C.cyan, marque = null) {
  ctx.fillStyle = 'rgba(143,208,227,0.12)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = couleur; ctx.fillRect(x, y, Math.max(0, Math.min(1, v)) * w, h);
  if (marque !== null) { ctx.fillStyle = C.sable; ctx.fillRect(x + marque * w - 1, y - 3, 2, h + 6); }
}

/* ── écran de gauche : navigation (astre le plus proche, autres astres, radar relatif) ──
   t : télémétrie ; cibles : [{ nom, distance, dir: [x, y, z] unitaire dans le repère du vaisseau (−Z = devant) }] ; km : kilomètres par unité de la galaxie ; autopilote : { cible, dist, etape } ou null */
export function dessinerNavigation(ctx, t, { cibles = [], km = 1, autopilote = null } = {}) {
  cadre(ctx, 'NAVIGATION', t.orbite ? 'EN ORBITE · ' + t.orbite.toUpperCase() : 'EN VOL');
  const p = t.proche;
  texte(ctx, 'ASTRE LE PLUS PROCHE', 18, 62, { taille: 11, couleur: C.gris });
  texte(ctx, p ? p.nom.toUpperCase() : '—', 18, 92, { taille: 28, couleur: C.cyan, poids: 600 });
  texte(ctx, 'ALTITUDE', 18, 118, { taille: 11, couleur: C.gris }); texte(ctx, p ? formaterDistanceKm(p.altitude * km) : '—', 18, 140, { taille: 20 });
  texte(ctx, p ? formater(p.altitude, 2) + ' u' : '', 18, 158, { taille: 12, couleur: C.gris });
  // radar : vue du dessus dans le repère du vaisseau (le haut de l'écran = devant)
  const cx = 372, cy = 168, r = 100;
  ctx.strokeStyle = C.cyanDoux; ctx.lineWidth = 1; for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, 6.2832); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = C.sable; ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx - 5, cy + 6); ctx.lineTo(cx + 5, cy + 6); ctx.closePath(); ctx.fill();
  const dmax = Math.max(1, ...cibles.slice(0, 6).map(c => c.distance));
  cibles.slice(0, 8).forEach(c => {
    const horiz = Math.hypot(c.dir[0], c.dir[2]) || 1e-6, rr = Math.min(1, Math.log10(1 + c.distance) / Math.log10(1 + Math.max(dmax, 200))) * r;
    const x = cx + (c.dir[0] / horiz) * rr, y = cy + (c.dir[2] / horiz) * rr, haut = c.dir[1] > 0.2 ? '▲' : c.dir[1] < -0.2 ? '▼' : '●';
    ctx.fillStyle = c.nom === (p && p.nom) ? C.cyan : C.blanc; ctx.font = `10px ${POLICE}`; ctx.fillText(haut, x - 4, y + 4); ctx.fillText(c.nom.slice(0, 3).toUpperCase(), x + 7, y + 4);
  });
  // liste des astres
  texte(ctx, 'ASTRES', 18, 188, { taille: 11, couleur: C.gris });
  cibles.slice(0, 5).forEach((c, i) => { texte(ctx, c.nom, 18, 208 + i * 20, { taille: 13 }); texte(ctx, formaterDistanceKm(c.distance * km), 200, 208 + i * 20, { taille: 13, couleur: C.cyan, align: 'right' }); });
  if (autopilote) { ctx.fillStyle = 'rgba(201,178,122,0.14)'; ctx.fillRect(14, 288, 484, 24); texte(ctx, 'PILOTE AUTO → ' + autopilote.cible.toUpperCase() + ' · ' + autopilote.etape + ' · ' + formaterDistanceKm(autopilote.dist * km), 22, 305, { taille: 12, couleur: C.sable }); }
}

/* ── écran du centre : attitude, cap, vitesse ── */
export function dessinerAttitude(ctx, t, { vmax = 8, vmaxPost = 28, km = 1 } = {}) {
  cadre(ctx, 'ATTITUDE · CAP · VITESSE', t.assist ? 'ASSISTANCE' : 'VOL LIBRE');
  const cx = 256, cy = 168, r = 96;
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.clip();
  const pas = r / 30;                                   // pixels par degré de tangage
  ctx.translate(cx, cy); ctx.rotate((t.roulis || 0) * Math.PI / 180);
  const dy = (t.tangage || 0) * pas;
  ctx.fillStyle = 'rgba(40,90,130,0.45)'; ctx.fillRect(-r * 2, -r * 3 + dy, r * 4, r * 3); ctx.fillStyle = 'rgba(120,96,60,0.4)'; ctx.fillRect(-r * 2, dy, r * 4, r * 3);
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r, dy); ctx.lineTo(r, dy); ctx.stroke();
  ctx.font = `10px ${POLICE}`; ctx.fillStyle = C.cyan;
  for (let a = -60; a <= 60; a += 10) { if (!a) continue; const y = dy - a * pas, w = a % 30 === 0 ? 36 : 22; ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillText(String(Math.abs(a)), w + 4, y + 3); }
  ctx.restore();
  ctx.strokeStyle = C.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();
  ctx.strokeStyle = C.sable; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 10, cy); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx + 30, cy); ctx.stroke();
  // ruban de cap
  const cap = t.cap || 0; ctx.fillStyle = 'rgba(143,208,227,0.08)'; ctx.fillRect(116, 46, 280, 22); ctx.save(); ctx.beginPath(); ctx.rect(116, 46, 280, 22); ctx.clip();
  ctx.font = `12px ${POLICE}`; ctx.fillStyle = C.blanc;
  for (let a = Math.floor(cap / 5) * 5 - 40; a <= cap + 40; a += 5) { const x = 256 + (a - cap) * 3.4, aa = ((a % 360) + 360) % 360; ctx.fillStyle = C.cyan; ctx.fillRect(x, 58, 1, aa % 10 === 0 ? 10 : 5); if (aa % 30 === 0) { const nom = { 0: 'N', 90: 'E', 180: 'S', 270: 'O' }[aa] || String(aa); ctx.fillStyle = C.blanc; ctx.fillText(nom, x - 7, 56); } }
  ctx.restore(); ctx.fillStyle = C.sable; ctx.beginPath(); ctx.moveTo(256, 70); ctx.lineTo(251, 78); ctx.lineTo(261, 78); ctx.closePath(); ctx.fill();
  texte(ctx, String(Math.round(cap)).padStart(3, '0') + '°', 256, 98, { taille: 13, align: 'center', couleur: C.sable });
  // vitesse (gauche) et cap / tangage (droite)
  texte(ctx, 'VITESSE', 22, 134, { taille: 11, couleur: C.gris }); texte(ctx, formater(t.vitesse, 1), 22, 168, { taille: 32, couleur: t.post ? C.sable : C.cyan, poids: 600 }); texte(ctx, 'u/s', 24, 186, { taille: 12, couleur: C.gris });
  texte(ctx, formater(t.vitesseKmS, 0) + ' km/s', 22, 206, { taille: 13 });
  barre(ctx, 22, 218, 100, 7, t.vitesse / vmaxPost, t.post ? C.sable : C.cyan, vmax / vmaxPost);
  texte(ctx, 'CROISIÈRE ' + formater(vmax, 0), 22, 242, { taille: 10, couleur: C.gris });
  texte(ctx, 'TANGAGE', 396, 134, { taille: 11, couleur: C.gris }); texte(ctx, formater(t.tangage, 0) + '°', 396, 160, { taille: 22 });
  texte(ctx, 'ROULIS', 396, 188, { taille: 11, couleur: C.gris }); texte(ctx, formater(t.roulis, 0) + '°', 396, 214, { taille: 22 });
  const drapeau = (txt, on, x, couleur = C.cyan) => { ctx.strokeStyle = on ? couleur : C.gris; ctx.lineWidth = 1; ctx.strokeRect(x, 276, 112, 24); texte(ctx, txt, x + 56, 293, { taille: 12, align: 'center', couleur: on ? couleur : C.gris }); };
  drapeau('ASSISTANCE', t.assist, 22); drapeau('LIMITEUR', t.limiteur, 150); drapeau('POSTCOMB.', t.post, 278, C.sable); drapeau(t.orbite ? 'ORBITE' : 'LIBRE', !!t.orbite, 406);
}

/* ── écran de droite : systèmes, état de Raylé, alertes des agents ── */
export function dessinerSystemes(ctx, t, { energie = 1, poussee = 0, rayle = 'idle', alertes = [], horloge = '' } = {}) {
  cadre(ctx, 'SYSTÈMES', horloge);
  texte(ctx, 'ÉNERGIE', 18, 62, { taille: 11, couleur: C.gris }); barre(ctx, 18, 70, 220, 10, energie, energie < 0.2 ? C.rouge : C.cyan); texte(ctx, Math.round(energie * 100) + ' %', 246, 80, { taille: 13 });
  texte(ctx, 'RÉACTEURS', 18, 108, { taille: 11, couleur: C.gris });
  for (let i = 0; i < 3; i++) { barre(ctx, 18 + i * 76, 116, 66, 10, Math.min(1, poussee) * (0.9 + 0.1 * Math.sin(i * 2.1)), poussee > 1 ? C.sable : C.cyan); }
  texte(ctx, 'POUSSÉE ' + Math.round(poussee * 100) + ' %', 18, 148, { taille: 12 });
  const ETATS = { idle: ['EN VEILLE', C.gris], listening: ['J’ÉCOUTE', C.cyan], thinking: ['RÉFLEXION', C.sable], speaking: ['PARLE', C.vert], alert: ['ALERTE', C.rouge] };
  const [etat, coul] = ETATS[rayle] || [String(rayle).toUpperCase(), C.cyan];
  texte(ctx, 'RAYLÉ', 280, 62, { taille: 11, couleur: C.gris }); ctx.fillStyle = coul; ctx.beginPath(); ctx.arc(288, 84, 6, 0, 6.2832); ctx.fill(); texte(ctx, etat, 302, 89, { taille: 15, couleur: coul, poids: 600 });
  texte(ctx, 'ALERTES DES AGENTS', 18, 182, { taille: 11, couleur: C.gris });
  if (!alertes.length) texte(ctx, 'Aucune alerte', 18, 206, { taille: 13, couleur: C.gris });
  alertes.slice(0, 4).forEach((a, i) => { ctx.fillStyle = a.niveau === 'haute' ? C.rouge : C.orange; ctx.fillRect(18, 198 + i * 22, 3, 14); texte(ctx, String(a.texte).slice(0, 52), 28, 210 + i * 22, { taille: 12 }); });
  texte(ctx, 'Pédagogique · ne remplace pas un avis médical', 18, 306, { taille: 10, couleur: C.gris });
}

/* Collimateur (HUD) projeté sur la verrière : transparent, très discret. */
export function dessinerCollimateur(ctx, t, { w = 512, h = 288 } = {}) {
  ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(143,208,227,0.8)'; ctx.fillStyle = 'rgba(143,208,227,0.9)'; ctx.lineWidth = 2;
  const cx = w / 2, cy = h / 2; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 6.2832); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 18, cy); ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 34, cy); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx, cy - 18); ctx.stroke();
  ctx.font = `600 18px ${POLICE}`; ctx.textAlign = 'right'; ctx.fillText(formater(t.vitesse, 1) + ' u/s', cx - 96, cy + 6); ctx.textAlign = 'left'; ctx.fillText(String(Math.round(t.cap || 0)).padStart(3, '0') + '°', cx + 96, cy + 6);
  if (t.proche) { ctx.font = `13px ${POLICE}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(201,178,122,0.95)'; ctx.fillText(t.proche.nom.toUpperCase() + ' · ' + formater(t.proche.altitude, 1) + ' u', cx, h - 20); ctx.textAlign = 'left'; }
}

/* Panneau de la porte de la salle médicale. */
export function dessinerPorte(ctx, { w = 256, h = 96 } = {}) {
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(4,9,15,0.9)'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = C.cyanDoux; ctx.lineWidth = 2; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.font = `600 17px ${POLICE}`; ctx.fillStyle = C.cyan; ctx.textAlign = 'center'; ctx.fillText('SALLE MÉDICALE', w / 2, 40); ctx.font = `11px ${POLICE}`; ctx.fillStyle = C.gris; ctx.fillText('anatomie · table holographique', w / 2, 62); ctx.fillStyle = C.sable; ctx.fillText('touche M · ou dis « ouvre la salle médicale »', w / 2, 82); ctx.textAlign = 'left';
}
