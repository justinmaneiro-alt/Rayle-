/* ═════════════ APPAREILLAGES EN 3D : prothèses, corsets, orthèses, zones d'appui et de décharge ═════════════
   construireAppareil(THREE, C, ctx) → { group, notes:[{p,texte,classe}], mats:[] }
   ctx : { etat, amp (définition d'amputation) | null, modele (catalogue), positions (rachis effectif), courbes (effectives), pos(repèreId, cote) → [x,y,z]|null } */
import { MATERIAUX } from './donnees-ortho.js?v=2026.10.13.10';
import { rayonTronc, PROFONDEUR_TRONC, axeMembre } from './construction.js?v=2026.10.13.10';
import { J, VERTEBRES } from './donnees-os.js?v=2026.10.13.10';

export const materiau = id => MATERIAUX.find(m => m.id === id) || MATERIAUX[0];
const COULEUR_APPUI = 0xff8a3d, COULEUR_DECHARGE = 0x4da8ff, COULEUR_FORCE = 0xff3d6e;

export function construireAppareil(THREE, C, ctx) {
  const { etat, amp, modele } = ctx;
  const group = new THREE.Group(), notes = [], mats = [];
  const choix = id => (etat.appareillage.materiaux[id]) || (modele.composants.find(c => c.id === id) || {}).defaut || 'pa6';
  const fabrique = (compId, extra) => {
    const m = materiau(choix(compId)), r = m.rendu || {};
    const mat = new THREE.MeshStandardMaterial(Object.assign({ color: m.couleur, metalness: r.metal || 0, roughness: r.rough == null ? .5 : r.rough, side: THREE.DoubleSide,
      transparent: r.alpha != null, opacity: r.alpha == null ? 1 : r.alpha }, extra || {}));
    mats.push(mat); return mat;
  };
  const basique = (couleur, op) => { const m = new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: op == null ? .85 : op, depthTest: false, depthWrite: false, toneMapped: false }); mats.push(m); return m; };
  const ajoute = (geo, mat, partie, ordre) => { const m = new THREE.Mesh(geo, mat); m.userData.partie = partie; if (ordre) m.renderOrder = ordre; group.add(m); return m; };
  const fleche = (de, vers, couleur, long) => {
    const d = new THREE.Vector3(...vers).sub(new THREE.Vector3(...de)); const L = long || d.length(); if (L < 1e-4) return;
    const a = new THREE.ArrowHelper(d.normalize(), new THREE.Vector3(...de), L, couleur, L * .3, L * .16);
    a.traverse(o => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; o.renderOrder = 12; mats.push(o.material); } });
    group.add(a);
  };
  const sensCote = C.sensCote;

  // ── Zones d'appui / décharge : marqueurs sur les repères ──
  function marqueursAppuis(cotes) {
    if (!etat.appareillage.appuis) return;
    (modele.appuis || []).forEach(ap => {
      if (!ap.repere) return;
      cotes.forEach(c => {
        const p = ctx.pos(ap.repere, c); if (!p) return;
        const col = ap.type === 'appui' ? COULEUR_APPUI : COULEUR_DECHARGE;
        ajoute(C.geoSph(p, .014, 10), basique(col, .7), 'appui', 11);
        notes.push({ p: [p[0], p[1] + .02, p[2]], texte: (ap.type === 'appui' ? '● ' : '○ ') + ap.nom, classe: ap.type });
      });
    });
  }

  // ── Prothèses ──
  function lathe(membre, s, haut, bas, epais, ouvert = true, cx) {
    const pts = []; const N = 9;
    for (let k = 0; k <= N; k++) { const y = bas + (haut - bas) * k / N; pts.push(new THREE.Vector2(axeMembre(membre, y).r + epais, y)); }
    if (!ouvert) pts.unshift(new THREE.Vector2(.001, bas));
    const g = C.nettoie(new THREE.LatheGeometry(pts, 20));
    const ax = axeMembre(membre, (haut + bas) / 2);
    g.translate((cx == null ? ax.x : cx) * s, 0, ax.z);
    return g;
  }
  function articulation(t, y, membre, s) {
    const ax = axeMembre(membre, y), out = [];
    const cyl = C.nettoie(new THREE.CylinderGeometry(.026, .026, .075, 14)); cyl.rotateZ(Math.PI / 2); cyl.translate(ax.x * s, y, ax.z); out.push(cyl);
    const bloc = C.nettoie(new THREE.BoxGeometry(.055, .07, .05)); bloc.translate(ax.x * s, y - (t === 'hanche' ? 0 : .02), ax.z); out.push(bloc);
    if (t === 'hanche' || t === 'epaule') out.push(C.geoSph([ax.x * s, y, ax.z], .034));
    return C.fusion(out);
  }
  function pylone(membre, s, y0, y1) {
    if (y0 - y1 < .02) return null;
    const a = axeMembre(membre, y0), b = axeMembre(membre, y1);
    return C.fusion(C.geoCap([a.x * s, y0, a.z], [b.x * s, y1, b.z], .015, .015, false));
  }
  function pied(s, bas) {
    const out = [], x = .09 * s;
    const cheville = C.nettoie(new THREE.CylinderGeometry(.02, .02, .035, 12)); cheville.translate(x, bas ? .085 : .1, 0); out.push(cheville);
    out.push(C.geoEll([x, .018, .06], [.036, .016, .11]));                              // quille du pied
    out.push(...C.geoCap([x, .016, -.045], [x, .075, -.005], .006, .012, false));       // lame de ressort (talon)
    return C.fusion(out);
  }
  function main(s, y0, court) {
    const ax = axeMembre('MS', y0), x = ax.x * s, out = [];
    out.push(C.geoEll([x, y0 - .045, ax.z], [.032, .05, .018]));
    [-.016, -.005, .006, .017].forEach((dx, i) => out.push(...C.geoCap([x + dx * s, y0 - .09, ax.z], [x + dx * s, y0 - .17 + (i === 1 ? -.01 : i === 3 ? .02 : 0), ax.z + .004], .006, .004)));
    out.push(...C.geoCap([x + .03 * s, y0 - .06, ax.z + .012], [x + .05 * s, y0 - .11, ax.z + .02], .007, .005));
    return C.fusion(out);
  }
  function piedPartiel(s, z0) {
    const x = .09 * s, L = .215 - z0, out = [];
    out.push(C.geoEll([x, .028, z0 + L / 2 - .004], [.042, .026, L / 2 + .004]));
    return C.fusion(out);
  }

  function prothese() {
    const cotes = amp.cote === 'DG' ? ['D', 'G'] : [amp.cote];
    const chaine = amp.prothese.chaine;
    cotes.forEach(c => {
      const s = sensCote(c), mb = amp.membre;
      let basPrec = null;
      chaine.forEach(it => {
        if (it.k === 'emboiture') {
          ajoute(lathe(mb, s, it.haut, it.bas, .011, false), fabrique('emboiture', { opacity: Math.min(materiau(choix('emboiture')).rendu.alpha || 1, .78), transparent: true }), 'emboiture');
          if (modele.composants.some(q => q.id === 'manchon')) ajoute(lathe(mb, s, it.haut - .01, it.bas + .012, .004, true), fabrique('manchon', { opacity: .55, transparent: true, depthWrite: false }), 'manchon');
          basPrec = it.bas;
        } else if (it.k === 'articulation') {
          const comp = it.t === 'genou' ? 'genou' : it.t === 'hanche' ? 'hanche' : it.t === 'coude' ? 'coude' : 'poignet';
          const gp = pylone(mb, s, basPrec == null ? it.y + .04 : basPrec, it.y + .035); if (gp) ajoute(gp, fabrique('pylone'), 'pylone');
          ajoute(articulation(it.t, it.y, mb, s), fabrique(modele.composants.some(q => q.id === comp) ? comp : 'emboiture'), 'articulation:' + it.t);
          basPrec = it.y - .035;
        } else if (it.k === 'pied') {
          const gp = pylone(mb, s, basPrec == null ? .3 : basPrec, it.bas ? .09 : .11); if (gp) ajoute(gp, fabrique('pylone'), 'pylone');
          ajoute(pied(s, it.bas), fabrique('pied'), 'pied');
        } else if (it.k === 'main') {
          const y0 = (basPrec == null ? .9 : basPrec) - .02;
          const gp = pylone(mb, s, basPrec == null ? y0 : basPrec, y0 + .005); if (gp) ajoute(gp, fabrique('pylone'), 'pylone');
          ajoute(main(s, y0, it.court), fabrique('main'), 'main');
        } else if (it.k === 'pied-partiel') {
          ajoute(piedPartiel(s, it.z), fabrique('remplissage', { opacity: .75, transparent: true }), 'remplissage');
          const lame = C.nettoie(new THREE.BoxGeometry(.06, .004, .28)); lame.translate(.09 * s, .002, .075); ajoute(lame, fabrique('lame'), 'lame');
          ajoute(lathe('MI', s, .16, .03, .008, true, .09), fabrique('emboiture', { opacity: .75, transparent: true }), 'coque');
        } else if (it.k === 'main-partielle') {
          const ax = axeMembre('MS', .8);
          ajoute(C.geoEll([.228 * s, .775, ax.z], [.04, .12, .027]), fabrique('main', { opacity: .6, transparent: true, depthWrite: false }), 'gant');
        }
      });
    });
    marqueursAppuis(cotes);
    notes.push({ p: [0, 1.76, 0], texte: modele.nom + ' · ' + amp.nom, classe: 'titre' });
  }

  // ── Corset de scoliose et orthèses du rachis ──
  const yVert = id => (VERTEBRES.find(v => v.id === id) || { y: 1.3 }).y;
  function corset() {
    const courbes = ctx.courbes || [];
    const idx = ctx.positions;
    const apexHaut = courbes.reduce((m, c) => Math.max(m, yVert(c.apex)), 0) || 1.3;
    const yTop = Math.min(Math.max(apexHaut + .13, 1.2), 1.4), yBas = .93;
    const pts = [];
    for (let k = 0; k <= 12; k++) { const y = yBas + (yTop - yBas) * k / 12; pts.push(new THREE.Vector2(rayonTronc(y) + .013, y)); }
    const coque = C.nettoie(new THREE.LatheGeometry(pts, 36, .4, Math.PI * 2 - .8)); coque.scale(1, 1, PROFONDEUR_TRONC);
    if (modele.composants.some(q => q.id === 'coque')) ajoute(coque, fabrique('coque', { opacity: .55, transparent: true, depthWrite: false }), 'coque');
    else { for (const dx of [-1, 1]) ajoute(C.fusion(C.geoCap([dx * (rayonTronc(1.1) + .02), yBas, 0], [dx * (rayonTronc(1.3) + .02), yTop, 0], .006, .006, false)), fabrique('armature'), 'armature'); }
    // fermeture ventrale : 3 sangles
    [yBas + .06, (yBas + yTop) / 2, yTop - .06].forEach(y => { const b = C.nettoie(new THREE.BoxGeometry(.11, .012, .006)); b.translate(0, y, rayonTronc(y) * PROFONDEUR_TRONC + .015); ajoute(b, fabrique(modele.composants.some(q => q.id === 'fermeture') ? 'fermeture' : 'pelote'), 'sangle'); });
    // trois points par courbure
    courbes.forEach(c => {
      const ya = yVert(c.apex), sx = c.convexite === 'D' ? -1 : 1, rr = rayonTronc(ya), p = idx.find(q => q.id === c.apex) || { x: 0 };
      const pelote = [p.x + sx * rr * .92, ya, -rr * PROFONDEUR_TRONC * .5];
      ajoute(C.geoEll(pelote, [.028, .065, .022]), fabrique('pelote'), 'pelote');
      if (etat.appareillage.appuis) { ajoute(C.geoSph(pelote, .016), basique(COULEUR_APPUI, .75), 'appui', 11); notes.push({ p: [pelote[0] + sx * .03, ya + .08, pelote[2]], texte: '● Pelote de poussée (apex ' + c.apex + ')', classe: 'appui' }); }
      const haut = [-sx * rr * .8, Math.min(ya + .17, yTop - .02), rr * PROFONDEUR_TRONC * .45], bas = [-sx * rr * .8, Math.max(ya - .17, yBas + .03), rr * PROFONDEUR_TRONC * .45];
      if (etat.appareillage.forces) {
        fleche([pelote[0] + sx * .1, pelote[1], pelote[2] - .02], [pelote[0] + sx * .025, pelote[1], pelote[2]], COULEUR_FORCE, .075);
        [haut, bas].forEach(q => fleche([q[0] - sx * .1, q[1], q[2] + .02], [q[0] - sx * .028, q[1], q[2]], COULEUR_FORCE, .075));
      }
      if (etat.appareillage.appuis) {
        [haut, bas].forEach(q => ajoute(C.geoSph(q, .014), basique(COULEUR_APPUI, .6), 'appui', 11));
        const fen = [-sx * (rr + .012), ya, -rr * PROFONDEUR_TRONC * .3];
        ajoute(C.geoEll(fen, [.01, .055, .045]), basique(COULEUR_DECHARGE, .45), 'decharge', 11);
        notes.push({ p: [fen[0] - sx * .02, ya + .06, fen[2]], texte: '○ Zone de décharge (expansion, côté concave)', classe: 'decharge' });
      }
    });
    const corr = etat.appareillage.correction;
    if (courbes.length) {
      const orig = (etat.pathologie.scoliose && etat.pathologie.scoliose.courbes) || [];
      const texte = orig.map(c => c.apex + ' ' + c.cobb + '° → ' + Math.round(c.cobb * (1 - corr / 100)) + '°').join(' · ');
      notes.push({ p: [0, 1.75, 0], texte: 'En corset (' + corr + ' % de correction) : ' + texte, classe: 'titre' });
    }
  }
  function jewett() {
    const bar = (a, b) => ajoute(C.fusion(C.geoCap(a, b, .006, .006, false)), fabrique('armature'), 'armature');
    const ster = [0, 1.37, .125], pubis = [0, .9, .105], dos = [0, 1.2, -.135];
    const pad = (c, d, nom, type) => { const b = C.nettoie(new THREE.BoxGeometry(d[0], d[1], d[2])); b.translate(c[0], c[1], c[2]); ajoute(b, fabrique('pelote'), 'pelote'); if (etat.appareillage.appuis) { ajoute(C.geoSph(c, .016), basique(COULEUR_APPUI, .75), 'appui', 11); notes.push({ p: [c[0] + .05, c[1], c[2]], texte: '● ' + nom, classe: type }); } };
    pad(ster, [.07, .05, .014], 'Appui sternal', 'appui'); pad(pubis, [.09, .04, .014], 'Appui pubien', 'appui'); pad(dos, [.09, .06, .014], 'Contre-appui dorso-lombaire', 'appui');
    [-1, 1].forEach(s => { bar([s * .04, 1.37, .12], [s * .15, 1.2, .0]); bar([s * .15, 1.2, 0], [s * .12, .96, .0]); bar([s * .12, .96, 0], [s * .045, .9, .1]); bar([s * .14, 1.2, 0], [s * .045, 1.2, -.13]); });
    if (etat.appareillage.forces) { fleche([0, 1.37, .2], [0, 1.37, .135], COULEUR_FORCE, .065); fleche([0, .9, .19], [0, .9, .115], COULEUR_FORCE, .075); fleche([0, 1.2, -.21], [0, 1.2, -.145], COULEUR_FORCE, .065); }
    notes.push({ p: [0, 1.75, 0], texte: modele.nom + ' : hyperextension 3 points', classe: 'titre' });
  }

  // ── Orthèse de membre (fracture) : coque fendue autour de la zone ──
  function manchon(f) {
    const z = modele.zone; if (!z) return;
    const cotes = [f.cote || 'D'];
    cotes.forEach(c => {
      const s = sensCote(c);
      const pts = []; for (let k = 0; k <= 8; k++) { const y = z.y0 + (z.y1 - z.y0) * k / 8; pts.push(new THREE.Vector2(axeMembre(z.membre, y).r + .012, y)); }
      const g = C.nettoie(new THREE.LatheGeometry(pts, 22, .5, Math.PI * 2 - 1)); const ax = axeMembre(z.membre, (z.y0 + z.y1) / 2); g.translate(ax.x * s, 0, ax.z);
      ajoute(g, fabrique('coque', { opacity: .6, transparent: true, depthWrite: false }), 'coque');
      if (z.pied) ajoute(C.geoEll([.09 * s, .03, .06], [.047, .036, .125]), fabrique('coque', { opacity: .6, transparent: true, depthWrite: false }), 'coque');
      if (etat.appareillage.appuis) (modele.appuis || []).forEach(ap => { if (!ap.repere) return; const p = ctx.pos(ap.repere, c); if (!p) return; ajoute(C.geoSph(p, .013), basique(ap.type === 'appui' ? COULEUR_APPUI : COULEUR_DECHARGE, .7), 'appui', 11); notes.push({ p: [p[0], p[1] + .02, p[2]], texte: (ap.type === 'appui' ? '● ' : '○ ') + ap.nom, classe: ap.type }); });
      if (modele.id === 'echarpe') { const t = C.nettoie(new THREE.TorusGeometry(.085, .007, 6, 24)); t.rotateX(Math.PI / 2); t.translate(0, 1.5, .0); ajoute(t, fabrique('sangle'), 'sangle'); }
    });
  }

  if (amp && modele.pour.amputations) prothese();
  else if (modele.pour.scoliose) corset();
  else if (modele.id === 'corset-jewett') jewett();
  else if (modele.pour.fractures) manchon(etat.pathologie.fracture || {});
  return { group, notes, mats };
}
