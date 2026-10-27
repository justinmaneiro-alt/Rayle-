import * as THREE from 'three';
import { GROUPES } from './trading/groupes-terminal.js';
import { magasinReels } from './trading/rendu-reel.js';

/* ═════════════ LES PILES SUR LA TABLE DE MARS (V2, phase 2) ═════════════
   Avant : 21 petits plans (un par fenêtre) qui clignotaient, sautillaient et ouvraient une grande fenêtre par-dessus. Maintenant : HUIT PILES de cartes posées en arc autour de la table
   (une par dossier du terminal : Graphiques, Éco et macro, Actualités, Sentiment, Agent IA, Alertes, Performance, + « Mes fenêtres »), IMMOBILES.
   Un clic sur une pile ouvre le carrousel du dossier (core/commun/dossiers.js) ; la fenêtre choisie se pose sur l'écran, vivante (vrai contenu HTML : onglets, défilement, graphiques),
   se déplace / se redimensionne / se range avec le gestionnaire commun. Aucune animation permanente : la seule réaction est un éclairage de la couleur au survol.
   L'API est celle de l'ancien `creerHologrammes` (index.js, tests, voix) : viser, survoler, ouvrir, fermer, majReel, maj, ids, position… */
export const PILES = [...GROUPES.map(g => ({ id: g.id, titre: g.titre, icone: g.icone, n: g.panneaux.length })), { id: 'ouvertes', titre: 'Mes fenêtres', icone: '🗂', n: 0 }];
/* Nombre de fenêtres ouvertes par pile, d'après les identifiants du gestionnaire (« p-graphique-btc »…). Pur, testé. */
export function compterParDossier(idsFenetres) {
  const out = { ouvertes: 0 };
  for (const wid of idsFenetres || []) {
    const id = String(wid).replace(/^p-(libre-)?/, ''), g = GROUPES.find(x => x.panneaux.includes(id)) || (String(wid).startsWith('p-libre-') ? GROUPES[0] : null);
    if (!g) continue; out[g.id] = (out[g.id] || 0) + 1; out.ouvertes++;
  }
  return out;
}
const L = 640, H = 440;
const POLICE = '"Segoe UI Variable","Segoe UI",system-ui,sans-serif';

/* Dessin d'une carte : verre sombre, coins coupés, contour fin cyan, grande icône, nom lisible de loin. Pure fonction de dessin (aucun état). */
export function dessinerCarte(ctx, pile, { posees = 0, total = 0 } = {}) {
  const w = ctx.canvas.width, h = ctx.canvas.height, E = w / L, coupe = 26;
  ctx.setTransform(E, 0, 0, E, 0, 0); ctx.clearRect(0, 0, L, H);
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(L - 4 - coupe, 4); ctx.lineTo(L - 4, 4 + coupe); ctx.lineTo(L - 4, H - 4); ctx.lineTo(4 + coupe, H - 4); ctx.lineTo(4, H - 4 - coupe); ctx.closePath();
  const fond = ctx.createLinearGradient(0, 0, 0, H); fond.addColorStop(0, 'rgba(14,26,38,0.97)'); fond.addColorStop(1, 'rgba(6,11,17,0.98)'); ctx.fillStyle = fond; ctx.fill();
  ctx.strokeStyle = posees ? 'rgba(143,208,227,0.95)' : 'rgba(143,208,227,0.55)'; ctx.lineWidth = posees ? 3 : 2; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '150px ' + POLICE; ctx.fillStyle = '#e6eef2'; ctx.fillText(pile.icone, 34, 150);
  ctx.font = '600 28px ' + POLICE; ctx.fillStyle = 'rgba(143,208,227,0.9)'; ctx.fillText('DOSSIER', 34, 44);
  let taille = 62; const titre = pile.titre;
  do { ctx.font = '700 ' + taille + 'px ' + POLICE; taille -= 2; } while (ctx.measureText(titre).width > L - 70 && taille > 30);   // réduit la police plutôt que de couper le nom
  ctx.fillStyle = '#ffffff'; ctx.fillText(titre, 34, 290);
  ctx.font = '600 38px ' + POLICE; ctx.fillStyle = 'rgba(230,238,242,0.88)';
  const sous = pile.id === 'ouvertes' ? (posees ? posees + ' ouverte' + (posees > 1 ? 's' : '') : 'aucune ouverte') : total + ' fenêtre' + (total > 1 ? 's' : '') + (posees ? ' · ' + posees + ' ouverte' + (posees > 1 ? 's' : '') : '');
  ctx.fillText(sous, 34, 360, L - 70);
  ctx.font = '500 26px ' + POLICE; ctx.fillStyle = 'rgba(143,208,227,0.7)'; ctx.fillText('toucher pour ouvrir', 34, 408);
}

export function creerPiles({ parent, centreTable, ouvrirDossier = () => {}, ouvrirPanneau = () => {}, fermerTout = () => {}, compteurs = () => ({}), estOuvert = () => false }) {
  const groupe = new THREE.Group(); groupe.name = 'piles'; parent.add(groupe);
  const n = PILES.length, RAD = Math.PI / 180, parRangee = Math.ceil(n / 2);   // deux rangées en arc : les dossiers de travail en bas, les autres au-dessus
  const items = PILES.map((pile, i) => {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 704;
    const ctx = cv.getContext('2d'); dessinerCarte(ctx, pile, { total: pile.n });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) });
    const rangee = i < parRangee ? 0 : 1, k = rangee ? i - parRangee : i, m = rangee ? n - parRangee : parRangee, t = m === 1 ? 0 : k / (m - 1) - 0.5, a = t * 112 * RAD, rayon = 2.3, largeur = 1.0, hauteur = largeur * H / L;
    const pivot = new THREE.Group(); pivot.position.set(centreTable[0] + Math.sin(a) * rayon, rangee ? 1.92 : 1.18, centreTable[2] - Math.cos(a) * rayon * 0.78); pivot.rotation.y = -a * 0.7;
    // deux cartes en retrait : l'effet « pile »
    for (const [k, op] of [[2, 0.3], [1, 0.55]]) {
      const dos = new THREE.Mesh(new THREE.PlaneGeometry(largeur, hauteur), new THREE.MeshBasicMaterial({ color: 0x1c3446, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      dos.position.set(0.012 * k, 0.014 * k, -0.01 * k); dos.renderOrder = 5 - k; pivot.add(dos);
    }
    const plan = new THREE.Mesh(new THREE.PlaneGeometry(largeur, hauteur), mat); plan.userData.pile = pile.id; plan.renderOrder = 6; pivot.add(plan);
    const fil = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -hauteur / 2, 0), new THREE.Vector3(0, -(pivot.position.y - 0.82), 0)]), new THREE.LineBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.3 }));
    pivot.add(fil); groupe.add(pivot);
    return { def: { id: pile.id, reel: false, titre: pile.titre }, pile, plan, pivot, ctx, tex, survol: false, posees: 0 };
  });
  const cibles = items.map(x => x.plan), rayonRC = new THREE.Raycaster();
  let survolId = null, derniereSig = '';
  function viser(ndc, camera) { rayonRC.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), camera); const h = rayonRC.intersectObjects(cibles, false)[0]; return h ? 'pile:' + h.object.userData.pile : null; }
  function survoler(id) { if (id === survolId) return; survolId = id; for (const it of items) it.survol = id === 'pile:' + it.pile.id; }
  function ouvrir(id) {
    if (!id) return false;
    if (String(id).startsWith('pile:')) { ouvrirDossier(String(id).slice(5)); return true; }
    ouvrirPanneau(id); return true;                          // identifiant d'une fenêtre du terminal (voix, tests)
  }
  /* Les données réelles vont aux fenêtres vivantes (elles s'abonnent au magasin) ; les piles ne les affichent pas. */
  function majReel(id, reel) { magasinReels.poser(id, reel); }
  /* Compteurs (« 2 ouvertes ») : la carte n'est redessinée QUE quand un nombre change. */
  function majCompteurs() {
    const c = compteurs() || {}, sig = JSON.stringify(c); if (sig === derniereSig) return; derniereSig = sig;
    for (const it of items) { const k = c[it.pile.id] || 0; if (k !== it.posees) { it.posees = k; dessinerCarte(it.ctx, it.pile, { posees: k, total: it.pile.n }); it.tex.needsUpdate = true; } }
  }
  let acc = 0;
  /* Aucun mouvement : seul le survol éclaire la couleur du matériau ; les compteurs sont relus 2 fois par seconde. */
  function maj(t) {
    for (const it of items) { const cible = it.survol ? 1.5 : 1.15, c = it.plan.material.color; if (Math.abs(c.r - cible) > 0.002) { const v = c.r + (cible - c.r) * 0.25; c.setRGB(v, v, v); } }
    if (t - acc > 0.5 || t < acc) { acc = t; majCompteurs(); }
  }
  const etatPlans = () => items.map(it => ({ id: it.def.id, opacite: it.plan.material.opacity, echelle: it.pivot.scale.x, y: it.pivot.position.y }));
  return {
    groupe, items, etatPlans, viser, survoler, ouvrir, fermer: () => { if (!estOuvert()) return false; fermerTout(); return true; }, espaceFerme() {}, marquerOuvert() {}, majReel, maj, ouvert: () => (estOuvert() ? 'terminal' : null),
    ids: () => PILES.map(p => p.id), position: id => { const it = items.find(x => x.pile.id === String(id).replace(/^pile:/, '')); return it ? it.pivot.getWorldPosition(new THREE.Vector3()) : null; }, piles: true
  };
}
