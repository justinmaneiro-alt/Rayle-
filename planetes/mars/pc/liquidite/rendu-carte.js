import { prixDeLigne } from '../../../../strategies/liquidite/carte-chaleur.js';
import { fmtPrix } from '../../../../strategies/liquidite/aimants.js';

/* ═════════════ DESSIN DE LA CARTE DE LIQUIDITÉ (V4, phase 4) : canvas 2D, sans dépendance, ≈ 30 images/s ═════════════
   Prix en ordonnée (à DROITE, comme Bookmap), temps vers la GAUCHE (le présent est au bord droit de la carte). Couleur = taille des ordres posés (dollars). Bulles = transactions (taille = volume, vert =
   acheteur agressif, rouge = vendeur agressif). Marques = murs (couleur selon leur fiabilité) ; lignes = aimants (cible, défense, invalidation). Dessous : CVD, delta par seconde, déséquilibre du carnet.
   À droite : profil de volume avec POC / VAH / VAL. Les fonctions de calcul (couleurs, mise en page, conversions) sont pures et testées ; `dessiner` ne fait que peindre. */
export function couleurChaleur(i) {                                      // i ∈ [0, 1] → [r, g, b, a] (0–255) ; transparent à 0
  if (!(i > 0)) return [0, 0, 0, 0]; i = Math.min(1, i);
  const pts = [[0, [6, 14, 60, 0]], [0.08, [14, 30, 120, 150]], [0.3, [0, 120, 200, 210]], [0.55, [0, 205, 150, 235]], [0.78, [245, 215, 40, 250]], [1, [255, 255, 255, 255]]];
  for (let k = 1; k < pts.length; k++) if (i <= pts[k][0]) { const [a, ca] = pts[k - 1], [b, cb] = pts[k], f = (i - a) / (b - a); return ca.map((x, j) => Math.round(x + (cb[j] - x) * f)); }
  return [255, 255, 255, 255];
}
export const COULEURS = Object.freeze({ fond: '#05090e', texte: '#cfe3ee', doux: '#8fb2c3', prix: '#ffffff', achat: 'rgba(47,209,139,0.62)', vente: 'rgba(255,93,110,0.62)', cible: '#6fd3ee', defense: '#2fd18b', invalidation: '#ff5d6e', poc: '#ffb000', fiable: '#2fd18b', incertain: '#e9a23b', leurre: '#ff5d6e' });
export const couleurMur = niveau => (niveau === 'fiable' ? COULEURS.fiable : niveau === 'leurre probable' ? COULEURS.leurre : COULEURS.incertain);

/* Mise en page : { heat: {x, y, w, h}, axe: {x, w}, profil: {x, w}|null, bas: {y, h, bandes: [{y, h}, …]} }. `etroit` (téléphone) : pas de profil, bandes plus basses. */
export function miseEnPage(W, H, { profil = true } = {}) {
  const etroit = W < 560, margeAxe = etroit ? 54 : 70, wProfil = profil && !etroit ? Math.min(120, Math.round(W * 0.14)) : 0, hBas = Math.max(60, Math.round(H * (etroit ? 0.22 : 0.26))), hHeat = H - hBas - 18;
  const heat = { x: 0, y: 0, w: W - margeAxe - wProfil, h: hHeat }, bande = Math.floor(hBas / 3);
  return { heat, axe: { x: heat.x + heat.w + wProfil, w: margeAxe }, profil: wProfil ? { x: heat.x + heat.w, w: wProfil } : null, bas: { y: hHeat + 18, h: hBas, bandes: [0, 1, 2].map(k => ({ y: hHeat + 18 + k * bande, h: bande - 2 })) }, etroit };
}
/* Conversions : temps (ms) → x, prix → y, pour une plage donnée. Le temps va de la gauche (t0) à la droite (t1). */
export function convertisseurs(lay, { t0, t1, pMin, pMax }) {
  const h = lay.heat;
  return { x: t => h.x + (t - t0) / (t1 - t0) * h.w, y: p => h.y + (pMax - p) / (pMax - pMin) * h.h, t: x => t0 + (x - h.x) / h.w * (t1 - t0), p: y => pMax - (y - h.y) / h.h * (pMax - pMin) };
}
/* Plage de prix visible : centrée sur le milieu actuel, ± `pct` % (zoom), élargie si une cible importante est plus loin (jamais coupée). */
export function plagePrix(mid, pct, { extras = [] } = {}) {
  let bas = mid * (1 - pct / 100), haut = mid * (1 + pct / 100); for (const p of extras) { if (p > 0 && Math.abs(p - mid) / mid * 100 <= pct * 2.5) { bas = Math.min(bas, p * 0.9998); haut = Math.max(haut, p * 1.0002); } }
  return { pMin: bas, pMax: haut };
}
export function graduations(pMin, pMax, n = 6) {
  const brut = (pMax - pMin) / n, e = Math.pow(10, Math.floor(Math.log10(brut))), m = brut / e, pas = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e, out = [];
  for (let p = Math.ceil(pMin / pas) * pas; p <= pMax; p += pas) out.push(p); return out;
}
const hhmmss = t => new Date(t).toISOString().slice(11, 19);

let tampon = null, memo = null;                                                    // canevas hors écran pour l'image de chaleur + dernière image calculée (réutilisée tant que rien ne change)
function imageChaleur(carte, ech, pMin, pMax) {
  if (memo && memo.carte === carte && memo.pMin === pMin && memo.pMax === pMax && memo.ref === ech.reference) return memo.im;
  const lignes0 = Math.max(0, Math.floor((pMin - carte.prixMin) / carte.pas)), lignes1 = Math.min(carte.nPrix - 1, Math.ceil((pMax - carte.prixMin) / carte.pas)), nL = Math.max(1, lignes1 - lignes0 + 1), nT = carte.nT;
  if (!tampon) tampon = document.createElement('canvas'); tampon.width = nT; tampon.height = nL; const c = tampon.getContext('2d'), img = c.createImageData(nT, nL), d = img.data;
  for (let i = 0; i < nT; i++) for (let j = lignes0; j <= lignes1; j++) { const v = carte.valeurs[i * carte.nPrix + j]; if (!(v > 0)) continue; const [r, g, b, a] = couleurChaleur(ech.intensite(v)), o = ((nL - 1 - (j - lignes0)) * nT + i) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a; }
  c.putImageData(img, 0, 0); const im = { canvas: tampon, lignes0, lignes1, nL }; memo = { carte, pMin, pMax, ref: ech.reference, im }; return im;
}

/* modele : { carte, ech (échelleIntensite), mids: [[tMs, prix]], trades: [{ t, achatUsd, venteUsd, cloture }], murs, aimants, profil: { histo: [[prix, usd]], poc, vah, val }, cvd: Float64Array, desequ: [{ t, 'd0.5' }],
              fenetreS, tFin (ms), pct (zoom ± %), options: { bulles, murs, aimants } } */
export function dessiner(ctx, W, H, modele) {
  const lay = miseEnPage(W, H, { profil: !!(modele.profil && modele.profil.histo) }), { carte } = modele; ctx.clearRect(0, 0, W, H); ctx.fillStyle = COULEURS.fond; ctx.fillRect(0, 0, W, H);
  if (!carte || !carte.nT) { ctx.fillStyle = COULEURS.doux; ctx.font = '13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(modele.message || 'En attente de données…', W / 2, H / 2); return lay; }
  const tFin = modele.tFin || carte.tSec[carte.nT - 1] * 1000, t1 = tFin + 1000, t0 = t1 - modele.fenetreS * 1000, mid = carte.mid[carte.nT - 1], o = modele.options || {};
  const extras = o.aimants && modele.aimants ? [modele.aimants.objectif && modele.aimants.objectif.prix, modele.aimants.defense && modele.aimants.defense.prix] : [];
  const { pMin, pMax } = modele.plageY || plagePrix(mid, modele.pct || 0.5, { extras }), cv = convertisseurs(lay, { t0, t1, pMin, pMax }), h = lay.heat;
  // 1) chaleur
  const im = imageChaleur(carte, modele.ech, pMin, pMax); ctx.save(); ctx.beginPath(); ctx.rect(h.x, h.y, h.w, h.h); ctx.clip(); ctx.imageSmoothingEnabled = false;
  const xg = cv.x(carte.tSec[0] * 1000), xd = cv.x((carte.tSec[carte.nT - 1] + carte.agregationS) * 1000), yH = cv.y(carte.prixMin + (im.lignes1 + 1) * carte.pas), yB = cv.y(carte.prixMin + im.lignes0 * carte.pas);
  ctx.drawImage(im.canvas, xg, yH, Math.max(1, xd - xg), Math.max(1, yB - yH));
  // 2) zones d'aimants (bandes très légères) et lignes
  if (o.aimants && modele.aimants) {
    const A = modele.aimants; for (const z of [...(A.haut || []).slice(0, 3), ...(A.bas || []).slice(0, 3)]) { const y = cv.y(z.prix); ctx.fillStyle = 'rgba(111,211,238,' + Math.min(0.16, 0.04 + z.score * 0.25) + ')'; ctx.fillRect(h.x, y - 3, h.w, 6); }
  }
  // 3) ligne de prix
  ctx.strokeStyle = COULEURS.prix; ctx.lineWidth = 1.2; ctx.beginPath(); let debut = true; for (const [t, p] of modele.mids || []) { if (t < t0) continue; const x = cv.x(t), y = cv.y(p); if (debut) { ctx.moveTo(x, y); debut = false; } else ctx.lineTo(x, y); } ctx.stroke();
  // 4) bulles de transactions
  if (o.bulles !== false) { const ref = Math.max(1, ...(modele.trades || []).map(t => Math.max(t.achatUsd, t.venteUsd))) ; for (const t of modele.trades || []) { if (t.t < t0 || !(t.cloture > 0)) continue; const x = cv.x(t.t), y = cv.y(t.cloture); for (const [usd, c] of [[t.achatUsd, COULEURS.achat], [t.venteUsd, COULEURS.vente]]) { if (!(usd > 0)) continue; const r = Math.min(lay.etroit ? 9 : 16, 1.5 + Math.sqrt(usd / ref) * (lay.etroit ? 8 : 14)); if (r < 1.8) continue; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); } } }
  // 5) lignes cible / défense / invalidation
  const ligne = (p, couleur, texte) => { if (!(p >= pMin && p <= pMax)) return; const y = cv.y(p); ctx.strokeStyle = couleur; ctx.setLineDash([6, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(h.x, y); ctx.lineTo(h.x + h.w, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = couleur; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(texte, h.x + 6, y - 3); };
  if (o.aimants && modele.aimants && modele.aimants.objectif) { ligne(modele.aimants.objectif.prix, COULEURS.cible, 'cible ' + fmtPrix(modele.aimants.objectif.prix)); if (modele.aimants.defense) ligne(modele.aimants.defense.prix, COULEURS.defense, 'défense'); if (modele.aimants.invalidation) ligne(modele.aimants.invalidation.prix, COULEURS.invalidation, 'invalidation'); }
  // 6) murs (marques à droite de la carte)
  if (o.murs !== false) for (const m of modele.murs || []) { if (!m.actif || m.prix < pMin || m.prix > pMax) continue; const y = cv.y(m.prix); ctx.fillStyle = couleurMur(m.fiabilite && m.fiabilite.niveau); ctx.fillRect(h.x + h.w - 7, y - 2, 7, 4); if (!lay.etroit) { ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.fillText((m.usdMax >= 1e6 ? (m.usdMax / 1e6).toFixed(1) + ' M$' : Math.round(m.usdMax / 1e3) + ' k$'), h.x + h.w - 10, y + 3); } }
  ctx.restore();
  // 7) axe des prix (à droite) et du temps
  ctx.fillStyle = COULEURS.doux; ctx.font = '11px ui-monospace,Consolas,monospace'; ctx.textAlign = 'left'; ctx.strokeStyle = 'rgba(143,178,195,.12)'; ctx.lineWidth = 1;
  for (const p of graduations(pMin, pMax)) { const y = cv.y(p); ctx.beginPath(); ctx.moveTo(h.x, y); ctx.lineTo(h.x + h.w, y); ctx.stroke(); ctx.fillText(fmtPrix(p), lay.axe.x + 6, y + 4); }
  ctx.fillStyle = COULEURS.prix; ctx.fillRect(lay.axe.x, cv.y(mid) - 8, lay.axe.w - 2, 16); ctx.fillStyle = '#05090e'; ctx.fillText(fmtPrix(mid), lay.axe.x + 4, cv.y(mid) + 4);
  ctx.fillStyle = COULEURS.doux; ctx.textAlign = 'center'; for (let k = 0; k <= 4; k++) { const t = t0 + (t1 - t0) * k / 4; ctx.fillText(hhmmss(t), Math.min(W - 34, Math.max(30, cv.x(t))), h.h + 13); }
  // 8) profil de volume vertical
  if (lay.profil && modele.profil && modele.profil.histo) {
    const pf = modele.profil, max = Math.max(1, ...pf.histo.map(x => x[1])); ctx.save(); ctx.beginPath(); ctx.rect(lay.profil.x, h.y, lay.profil.w, h.h); ctx.clip();
    for (const [p, usd] of pf.histo) { if (p < pMin || p > pMax) continue; const y = cv.y(p), l = usd / max * (lay.profil.w - 6); ctx.fillStyle = 'rgba(143,208,227,.35)'; ctx.fillRect(lay.profil.x + lay.profil.w - l, y - 2, l, 4); }
    const rep = (p, c, txt, tiret) => { if (!(p >= pMin && p <= pMax)) return; const y = cv.y(p); ctx.strokeStyle = c; ctx.setLineDash(tiret ? [4, 3] : []); ctx.beginPath(); ctx.moveTo(lay.profil.x, y); ctx.lineTo(lay.profil.x + lay.profil.w, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = c; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(txt, lay.profil.x + 3, y - 2); };
    rep(pf.poc, COULEURS.poc, 'POC', false); rep(pf.vah, COULEURS.doux, 'VAH', true); rep(pf.val, COULEURS.doux, 'VAL', true); ctx.restore();
  }
  // 9) bandes du bas : CVD, delta par seconde, déséquilibre
  const [b1, b2, b3] = lay.bas.bandes, serie = (b, valeurs, fmt, couleur, zero) => {
    ctx.save(); ctx.beginPath(); ctx.rect(h.x, b.y, h.w, b.h); ctx.clip(); ctx.fillStyle = 'rgba(143,178,195,.05)'; ctx.fillRect(h.x, b.y, h.w, b.h);
    const pts = valeurs.filter(v => v[0] >= t0 && Number.isFinite(v[1])); if (pts.length > 1) { let mn = Infinity, mx = -Infinity; for (const v of pts) { if (v[1] < mn) mn = v[1]; if (v[1] > mx) mx = v[1]; } if (zero) { mn = Math.min(mn, 0); mx = Math.max(mx, 0); } const sp = mx - mn || 1, yy = v => b.y + b.h - 2 - (v - mn) / sp * (b.h - 4);
      if (zero) { ctx.strokeStyle = 'rgba(143,178,195,.3)'; ctx.beginPath(); ctx.moveTo(h.x, yy(0)); ctx.lineTo(h.x + h.w, yy(0)); ctx.stroke(); }
      ctx.strokeStyle = couleur; ctx.lineWidth = 1.2; ctx.beginPath(); pts.forEach((v, k) => { const x = cv.x(v[0]), y = yy(v[1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    ctx.restore(); ctx.fillStyle = COULEURS.doux; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText(fmt, h.x + 4, b.y + 10);
  };
  serie(b1, modele.cvdPoints || [], 'CVD (achats − ventes cumulés)', '#6fd3ee', true);
  ctx.save(); ctx.beginPath(); ctx.rect(h.x, b2.y, h.w, b2.h); ctx.clip(); ctx.fillStyle = 'rgba(143,178,195,.05)'; ctx.fillRect(h.x, b2.y, h.w, b2.h);
  const tr = (modele.trades || []).filter(t => t.t >= t0); if (tr.length) { const mx = Math.max(1, ...tr.map(t => Math.max(t.achatUsd, t.venteUsd))), mid2 = b2.y + b2.h / 2, bw = Math.max(1, h.w / (modele.fenetreS * 1.2)); for (const t of tr) { const x = cv.x(t.t); ctx.fillStyle = COULEURS.achat; ctx.fillRect(x, mid2 - t.achatUsd / mx * (b2.h / 2 - 1), bw, t.achatUsd / mx * (b2.h / 2 - 1)); ctx.fillStyle = COULEURS.vente; ctx.fillRect(x, mid2, bw, t.venteUsd / mx * (b2.h / 2 - 1)); } }
  ctx.restore(); ctx.fillStyle = COULEURS.doux; ctx.font = '10px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Volume agressif par seconde (achat ↑ / vente ↓)', h.x + 4, b2.y + 10);
  serie(b3, (modele.desequ || []).map(d => [d.t, d['d0.5']]), 'Déséquilibre du carnet à 0,5 % (bid − ask)', '#e9a23b', true);
  return lay;
}
