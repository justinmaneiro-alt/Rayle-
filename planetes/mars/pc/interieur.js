import * as THREE from 'three';
import { texBeton, texBois, texTapis, texLueurTable, texEcran, texHalo } from './procedural.js';
import { DECALAGE } from './paysage.js';

/* ═════════════ LE SALON : UNE SEULE PIÈCE, FUTURISTE ET SIMPLE ═════════════
   12 m × 8,4 m, 3,5 m sous plafond. Repère : x = est, y = haut, z = sud ; le spectateur entre par le sud et regarde le nord.
   Grandes baies panoramiques au nord (le paysage) et à l'ouest (le coucher de soleil), bande vitrée à l'est ; mur de lames de bois au sud (porte, cuisine).
   Au centre : la table holographique (les fenêtres flottantes sont dans hologrammes.js). Tout est construit avec des formes simples + textures générées. */
export const SALLE = { largeur: 12, profondeur: 8.4, hauteur: 3.5 };
const CYAN_HDR = new THREE.Color(0.30, 0.89, 1.0), CHAUD_HDR = new THREE.Color(1.0, 0.82, 0.58);

export function creerSalon({ profil, aniso = 8 }) {
  const racine = new THREE.Group(); racine.name = 'salon';
  const { largeur: W, profondeur: D, hauteur: H } = SALLE, ombre = profil.ombres > 0;
  const rep = (t, x, y) => { t.repeat.set(x, y); return t; };
  const mBeton = new THREE.MeshStandardMaterial({ map: rep(texBeton(profil.niveau === 'basse' ? 256 : 512, 13, false), 3, 1.6), roughness: 0.9, metalness: 0, envMapIntensity: 0.4 });
  const mSol = new THREE.MeshStandardMaterial({ map: rep(texBeton(profil.niveau === 'basse' ? 256 : 512, 29, true), 5, 3.4), roughness: 0.28, metalness: 0.25, envMapIntensity: profil.reflets ? 1.1 : 0.3 });
  const mBois = new THREE.MeshStandardMaterial({ map: rep(texBois(512, 21), 3, 1), roughness: 0.62, metalness: 0, envMapIntensity: 0.3 });
  const mPlafond = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.85, metalness: 0.1 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0x232a35, roughness: 0.35, metalness: 0.85, envMapIntensity: 1 });
  const mMetalClair = new THREE.MeshStandardMaterial({ color: 0xb9c1cc, roughness: 0.3, metalness: 0.9, envMapIntensity: 1 });
  const mTissu = new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 1, metalness: 0 });
  const mTissuSombre = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 1, metalness: 0 });
  const mCoussinCyan = new THREE.MeshStandardMaterial({ color: 0x2c8aa0, roughness: 1 }), mCoussinRouille = new THREE.MeshStandardMaterial({ color: 0xb2623c, roughness: 1 });
  const mPierre = new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.25, metalness: 0.05, envMapIntensity: 0.9 });
  const mGraphite = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.55, metalness: 0.3 });
  const mFeuille = new THREE.MeshStandardMaterial({ color: 0x4f8a52, roughness: 0.8 }), mPot = new THREE.MeshStandardMaterial({ color: 0x8c6a52, roughness: 0.9 });
  const mLedCyan = new THREE.MeshBasicMaterial({ color: CYAN_HDR.clone().multiplyScalar(2.0) }), mLedChaud = new THREE.MeshBasicMaterial({ color: CHAUD_HDR.clone().multiplyScalar(1.7) });
  const mEcran = new THREE.MeshBasicMaterial({ map: texEcran(256), color: new THREE.Color(1.3, 1.3, 1.3) });
  const mVerre = new THREE.MeshStandardMaterial({ color: 0xbfe2f0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 2.2 });
  const B = (w, h, d, x, y, z, mat, { cast = true, recoit = true } = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = ombre && cast; m.receiveShadow = ombre && recoit; racine.add(m); return m; };
  const dans = (groupe, w, h, d, x, y, z, mat, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = ombre && cast; m.receiveShadow = ombre; groupe.add(m); return m; };

  // ── Sol, socle, plafond ──
  B(W + 0.6, 0.32, D + 0.6, 0, -0.16, 0, mSol);                                  // dalle (dessus à y = 0)
  B(W + 1.0, DECALAGE - 0.16, D + 1.0, 0, -0.16 - (DECALAGE - 0.16) / 2, 0, mBeton, { cast: false });   // socle qui descend jusqu'au terrain
  B(W + 0.6, 0.25, D + 0.6, 0, H + 0.125, 0, mPlafond, { cast: false });
  // terrasse devant la baie nord
  B(W + 0.6, 0.3, 2.6, 0, -0.15, -D / 2 - 1.3 - 0.3, mBeton);
  B(W + 0.6, 0.05, 0.05, 0, 0.02, -D / 2 - 2.6 - 0.28, mLedCyan, { cast: false });

  /* Mur avec ouverture rectangulaire. axe 'x' : mur le long de x à z = pos ; axe 'z' : mur le long de z à x = pos. */
  function mur(axe, pos, longueur, ouv, mat, epaisseur = 0.3) {
    const [a0, a1, y0, y1] = ouv, demi = longueur / 2, put = (l0, l1, h0, h1) => {
      if (l1 - l0 < 0.001 || h1 - h0 < 0.001) return;
      const lg = l1 - l0, ct = (l0 + l1) / 2, ch = (h0 + h1) / 2;
      if (axe === 'x') B(lg, h1 - h0, epaisseur, ct, ch, pos, mat); else B(epaisseur, h1 - h0, lg, pos, ch, ct, mat);
    };
    put(-demi, a0, 0, H); put(a1, demi, 0, H); put(a0, a1, y1, H); put(a0, a1, 0, y0);
  }
  mur('x', -D / 2 - 0.15, W + 0.6, [-5.65, 5.65, 0.1, 3.15], mBeton);                // nord : grande baie
  mur('z', -W / 2 - 0.15, D + 0.6, [-3.75, 2.2, 0.1, 3.15], mBeton);                // ouest : baie
  mur('z', W / 2 + 0.15, D + 0.6, [-3.7, -0.4, 0.9, 2.95], mBeton);                 // est : bande vitrée
  B(W + 0.6, H, 0.3, 0, H / 2, D / 2 + 0.15, mBois);                                // sud : lames de bois
  // meneaux (fins montants noirs) et vitrage
  const montants = (axe, pos, a0, a1, y0, y1, n) => { for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; if (axe === 'x') B(0.07, y1 - y0, 0.1, t, (y0 + y1) / 2, pos, mMetal, { cast: false }); else B(0.1, y1 - y0, 0.07, pos, (y0 + y1) / 2, t, mMetal, { cast: false }); } };
  montants('x', -D / 2, -5.65, 5.65, 0.1, 3.15, 8); montants('z', -W / 2, -3.75, 2.2, 0.1, 3.15, 4); montants('z', W / 2, -3.7, -0.4, 0.9, 2.95, 2);
  B(11.4, 0.07, 0.1, 0, 3.15, -D / 2, mMetal, { cast: false }); B(11.4, 0.07, 0.1, 0, 0.1, -D / 2, mMetal, { cast: false });
  B(0.1, 0.07, 6, -W / 2, 3.15, -0.8, mMetal, { cast: false });
  if (profil.reflets) {
    for (const [w, h, x, y, z, ry] of [[11.3, 3.05, 0, 1.62, -D / 2 + 0.02, 0], [5.95, 3.05, -W / 2 + 0.02, 1.62, -0.78, Math.PI / 2], [3.3, 2.05, W / 2 - 0.02, 1.92, -2.05, -Math.PI / 2]]) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mVerre); v.position.set(x, y, z); v.rotation.y = ry; v.renderOrder = 5; racine.add(v);
    }
  }
  // rainures lumineuses : le long du plafond et des baies
  B(11.4, 0.04, 0.06, 0, H - 0.03, -D / 2 + 0.2, mLedChaud, { cast: false }); B(0.06, 0.04, 8, -W / 2 + 0.2, H - 0.03, 0, mLedChaud, { cast: false }); B(0.06, 0.04, 8, W / 2 - 0.2, H - 0.03, 0, mLedChaud, { cast: false });
  for (const x of [-3.9, 3.9]) B(0.08, 0.03, 6.4, x, H - 0.02, 0.2, mLedChaud, { cast: false });
  const anneau = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.025, 8, 96), mLedChaud); anneau.rotation.x = Math.PI / 2; anneau.position.set(0, H - 0.04, -0.6); racine.add(anneau);
  const anneauC = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.015, 8, 96), mLedCyan); anneauC.rotation.x = Math.PI / 2; anneauC.position.set(0, H - 0.04, -0.6); racine.add(anneauC);
  // plinthe lumineuse cyan au pied du mur sud
  B(11.8, 0.03, 0.04, 0, 0.1, D / 2 - 0.05, mLedCyan, { cast: false });
  // porte (cadre + vantail), au sud-ouest
  B(1.3, 2.4, 0.06, -4.2, 1.2, D / 2 - 0.02, mMetal); B(1.1, 2.3, 0.04, -4.2, 1.17, D / 2 - 0.06, mGraphite); B(0.04, 2.3, 0.05, -3.58, 1.17, D / 2 - 0.08, mLedCyan, { cast: false });

  // ── La table holographique (centre) ──
  const table = new THREE.Group(); table.position.set(0, 0, -0.6); racine.add(table);
  const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 0.72, 40), mMetal); pied.position.y = 0.36; pied.castShadow = ombre; table.add(pied);
  const socleT = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.012, 8, 64), mLedCyan); socleT.rotation.x = Math.PI / 2; socleT.position.y = 0.03; table.add(socleT);
  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 80), new THREE.MeshStandardMaterial({ color: 0x050b14, roughness: 0.06, metalness: 0.92, envMapIntensity: 1.6 }));
  plateau.scale.set(1.78, 1, 0.9); plateau.position.y = 0.755; plateau.castShadow = ombre; plateau.receiveShadow = ombre; table.add(plateau);
  const liseré = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 120), mLedCyan); liseré.rotation.x = Math.PI / 2; liseré.scale.set(1.78, 0.9, 1); liseré.position.y = 0.792; table.add(liseré);
  const lueur = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: texLueurTable(256), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  lueur.rotation.x = -Math.PI / 2; lueur.position.y = 0.796; table.add(lueur);
  const faisceau = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 1.4, 48, 1, true), new THREE.MeshBasicMaterial({ color: CYAN_HDR.clone().multiplyScalar(0.5), transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  faisceau.position.y = 1.5; faisceau.scale.set(1.5, 1, 0.8); table.add(faisceau);
  const tapis = new THREE.Mesh(new THREE.CircleGeometry(2.75, 72), new THREE.MeshStandardMaterial({ map: texTapis(512), roughness: 1, metalness: 0 })); tapis.rotation.x = -Math.PI / 2; tapis.position.set(0, 0.008, -0.6); tapis.receiveShadow = ombre; racine.add(tapis);

  // ── Canapés (est et ouest de la table) ──
  function canape(longueur, couleurTissu, coussins) {
    const g = new THREE.Group();
    dans(g, longueur, 0.18, 0.95, 0, 0.14, 0, mGraphite);
    dans(g, longueur - 0.2, 0.22, 0.88, 0, 0.34, 0.02, couleurTissu);
    dans(g, longueur, 0.62, 0.22, 0, 0.62, -0.42, couleurTissu);
    for (const s of [-1, 1]) dans(g, 0.22, 0.5, 0.95, s * (longueur / 2 - 0.11), 0.43, 0, couleurTissu);
    coussins.forEach((c, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.14), c); m.position.set(-longueur / 2 + 0.55 + i * 0.7, 0.62, -0.26); m.rotation.set(-0.25, (i - 1) * 0.15, (i % 2 ? 0.08 : -0.1)); m.castShadow = ombre; g.add(m); });
    return g;
  }
  const cW = canape(2.7, mTissu, [mCoussinCyan, mCoussinRouille, mCoussinCyan]); cW.position.set(-3.35, 0, -0.6); cW.rotation.y = Math.PI / 2; racine.add(cW);
  const cE = canape(2.7, mTissu, [mCoussinRouille, mCoussinCyan, mCoussinRouille]); cE.position.set(3.35, 0, -0.6); cE.rotation.y = -Math.PI / 2; racine.add(cE);
  // fauteuils bas, côté sud de la table
  for (const [x, z, c] of [[-1.7, 1.4, mCoussinCyan], [1.9, 1.2, mCoussinRouille], [-0.4, 1.9, mTissu]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.38, 28), c); p.position.set(x, 0.19, z); p.castShadow = ombre; p.receiveShadow = ombre; racine.add(p); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 28), mMetalClair); d.position.set(x, 0.01, z); racine.add(d); }

  // ── Cuisine ouverte (sud-est) : plan de travail, îlot, tabourets, suspensions ──
  B(5.0, 0.9, 0.68, 3.0, 0.45, D / 2 - 0.5, mGraphite); B(5.1, 0.05, 0.74, 3.0, 0.925, D / 2 - 0.5, mPierre);
  B(5.0, 0.04, 0.03, 3.0, 0.06, D / 2 - 0.16, mLedCyan, { cast: false });
  for (let i = 0; i < 3; i++) B(1.4, 0.55, 0.32, 1.6 + i * 1.5, 2.1, D / 2 - 0.34, mBois);                          // placards hauts
  const ilot = new THREE.Group(); ilot.position.set(3.2, 0, 1.55); racine.add(ilot);
  dans(ilot, 2.6, 0.9, 0.9, 0, 0.45, 0, mBois); dans(ilot, 2.8, 0.05, 1.05, 0, 0.925, 0.02, mPierre); dans(ilot, 2.6, 0.03, 0.04, 0, 0.06, 0.46, mLedCyan, false);
  for (let i = 0; i < 3; i++) { const t = new THREE.Group(); t.position.set(-0.8 + i * 0.8, 0, 0.78); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24), mTissuSombre); s.position.y = 0.72; const j = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.72, 10), mMetalClair); j.position.y = 0.36; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), mMetalClair); p.position.y = 0.01; t.add(s, j, p); t.traverse(o => { if (o.isMesh) o.castShadow = ombre; }); ilot.add(t); }
  for (let i = 0; i < 2; i++) { const lampe = new THREE.Group(); lampe.position.set(-0.7 + i * 1.4, 0, 0); const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.4, 4), mMetal); fil.position.y = H - 0.7; const globe = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 6, 14), mLedChaud); globe.position.y = 2.05; lampe.add(fil, globe); ilot.add(lampe); }

  // ── Poste de travail (sud-ouest) ──
  const bureau = new THREE.Group(); bureau.position.set(-5.2, 0, 3.0); racine.add(bureau);
  dans(bureau, 0.75, 0.04, 2.0, 0, 0.74, 0, mBois); for (const z of [-0.9, 0.9]) dans(bureau, 0.7, 0.72, 0.05, 0, 0.36, z, mMetal);
  for (const z of [-0.5, 0.5]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.4), mEcran); e.position.set(0.2, 1.1, z); e.rotation.y = Math.PI / 2 - 0.25 * Math.sign(z) * -1; bureau.add(e); const pie = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.05), mMetal); pie.position.set(0.16, 0.9, z); bureau.add(pie); const cadre = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.43, 0.69), mMetal); cadre.position.set(0.185, 1.1, z); cadre.rotation.y = e.rotation.y - Math.PI / 2; bureau.add(cadre); }
  const chaise = new THREE.Group(); chaise.position.set(0.8, 0, 0); chaise.rotation.y = -Math.PI / 2;
  dans(chaise, 0.5, 0.08, 0.5, 0, 0.5, 0, mTissuSombre); dans(chaise, 0.5, 0.55, 0.07, 0, 0.8, 0.25, mTissuSombre); dans(chaise, 0.06, 0.45, 0.06, 0, 0.25, 0, mMetalClair); dans(chaise, 0.55, 0.04, 0.55, 0, 0.02, 0, mMetalClair);
  bureau.add(chaise);

  // ── Plantes ──
  function plante(x, z, echelle = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * echelle, 0.2 * echelle, 0.5 * echelle, 20), mPot); pot.position.y = 0.25 * echelle; pot.castShadow = ombre; g.add(pot);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, f = new THREE.Mesh(new THREE.SphereGeometry(0.16 * echelle, 10, 8), mFeuille); f.scale.set(0.7, 3.2, 0.25); f.position.set(Math.cos(a) * 0.15 * echelle, (0.85 + (i % 3) * 0.12) * echelle, Math.sin(a) * 0.15 * echelle); f.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5); f.castShadow = ombre; g.add(f); }
    racine.add(g); return g;
  }
  plante(-5.3, -3.5, 1.5); plante(5.35, -3.6, 1.3); plante(-5.35, 1.7, 0.9); plante(5.4, 0.3, 1.0);
  // lampadaire d'angle
  const lamp = new THREE.Group(); lamp.position.set(-5.4, 0, -1.9);
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.7, 8), mMetalClair); tige.position.y = 0.85; const arc = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.012, 6, 24, Math.PI * 0.8), mMetalClair); arc.position.set(0.45, 1.7, 0); arc.rotation.z = Math.PI * 0.1;
  const abat = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), mLedChaud); abat.position.set(0.82, 1.55, 0); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), mMetalClair); base.position.y = 0.015; lamp.add(tige, arc, abat, base); racine.add(lamp);

  // ── Lumières (nombre selon la qualité) ──
  const lumieres = [];
  const point = (c, i, d, x, y, z) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); racine.add(l); lumieres.push(l); return l; };
  const sources = [
    () => point(0x8fd0e3, 5, 8, 0, 1.05, -0.6),
    () => point(0xffd9a8, 9, 12, 0, H - 0.5, -0.6),
    () => point(0xffc890, 5, 7, 3.2, 2.05, 1.55),
    () => point(0xffc890, 3, 6, -5.2, 1.6, 3.0),
    () => point(0xffd9a8, 4, 7, -5.0, 1.6, -1.9),
    () => point(0xffe6c8, 4, 9, 0, 2.6, 2.8)
  ];
  sources.slice(0, Math.max(1, profil.lumieres)).forEach(f => f());

  let t0 = 0;
  function maj(t, nuit) {
    t0 = t;
    // Les lampes de la pièce se renforcent à la tombée de la nuit ; la table respire doucement
    const k = 0.7 + nuit * 0.5;
    mLedChaud.color.copy(CHAUD_HDR).multiplyScalar(1.7 * k); mLedCyan.color.copy(CYAN_HDR).multiplyScalar(1.5 + 0.15 * Math.sin(t * 1.6));
    lueur.material.opacity = 0.55 + 0.1 * Math.sin(t * 1.3);
    if (lumieres[0]) lumieres[0].intensity = 4.6 + 0.8 * Math.sin(t * 1.3);
    if (lumieres[1]) lumieres[1].intensity = 3.5 + 6 * nuit;
    faisceau.material.opacity = 0.04 + 0.012 * Math.sin(t * 0.9);
  }
  return { groupe: racine, table, maj, lumieres, materiaux: { verre: mVerre, sol: mSol } };
}
