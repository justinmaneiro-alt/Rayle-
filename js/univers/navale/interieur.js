// Visite de l'INTÉRIEUR d'un navire (PC et tablette) : on marche en première personne sur le pont, puis on descend par les échelles dans les batteries (canons servis par leurs équipes),
// la cabine du capitaine, la cuisine, les hamacs, l'infirmerie, la soute à poudre et la cale. Tout est paramétrique, à l'échelle du navire (un vaisseau de 69 m comme le HMS Victory :
// ponts de 1,9 m sous barrots, 14 ou 9 canons par bord et par batterie…), et suit le roulis du navire : la caméra est enfant du groupe du navire.
// En bataille : bordées visibles et audibles dans les batteries (recul des canons, éclairs, fumée), secousses quand le navire est touché, cris de l'équipage.
//   planInterieur(forme, type) → { niveaux:[{k, role, nom, sol, plafond, h, salles:[{id, nom, u0, u1}]}], trappes:[u, u], y0 }   (pur, testé)
//   entrer({THREE, ctx, noyau, hud, scene, camera, ctrl, navire, monde, theme, son, meteo, piece?}) → Promise<{ok, texte, sortir, aller, visiter, salles}>
import { Fusion } from './fusion.js?v=2026.10.14.5';
import { matToon } from './toon.js?v=2026.10.14.5';
import { creerFoule } from './equipage.js?v=2026.10.14.5';

const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const EP = 0.25;            // épaisseur d'un pont
export const EYE = 1.62;    // hauteur des yeux
const SPEC = {
  voilier: [['pont'], ['faux', 1.6], ['cale', 1.3]],
  brick: [['pont'], ['faux', 1.75], ['cale', 2.0]],
  fregate: [['pont'], ['batterie', 1.85], ['faux', 1.7], ['cale', 2.2]],
  vaisseau: [['pont'], ['batterie', 1.95], ['batterie', 1.95], ['batterie', 2.0], ['faux', 1.7], ['cale', 2.6]],
};
const U_TRAPPES = { voilier: [.4, .74], brick: [.5, .83], fregate: [.36, .63], vaisseau: [.36, .63] };
const NOMS_BAT = { 1: ['Batterie'], 3: ['Batterie haute', 'Batterie moyenne', 'Batterie basse'] };
export const TEXTES = {
  pont: ['Voici le pont supérieur, à l’air libre. Le timonier tient la barre, les marins manœuvrent les voiles et les vigies guettent l’horizon. Chaque matin, le pont est lavé à grande eau et frotté à la pierre.', 'Sur un navire de guerre, on respecte les quarts : quatre heures de service, quatre heures de repos. La cloche rythme toute la journée.'],
  cabine: ['La cabine du capitaine, à l’arrière : c’est la seule vraie pièce privée du bord. Il y a une table à cartes, un lit suspendu et de grandes fenêtres sur la mer.', 'En cas de combat, les cloisons sont démontées pour dégager les canons : même le capitaine doit céder sa chambre.'],
  batterie: ['Une batterie de canons. Chaque pièce pèse plusieurs tonnes et est servie par six à huit hommes : on charge la poudre, le boulet, on bourre, on pointe, on tire.', 'Au tir, le canon recule de plusieurs mètres, retenu par de gros cordages. Le bruit est assourdissant et la fumée remplit tout l’entrepont : les canonniers deviennent souvent sourds.'],
  cuisine: ['La cuisine du bord : un fourneau de fonte et de grosses marmites. Le coq prépare du lard salé, des pois, du biscuit trempé dans la soupe.', 'Dès que le combat commence, on éteint les feux de la cuisine pour éviter les incendies.'],
  hamacs: ['Les hamacs de l’équipage. Chaque homme dispose d’à peine trente-cinq centimètres de large, et l’on dort par roulement : pendant qu’un quart travaille, l’autre dort.', 'Le matin, les hamacs sont roulés et rangés dans les filets du bastingage : ils servent aussi de protection contre les balles.'],
  infirmerie: ['L’infirmerie, au fond du faux-pont : c’est l’endroit le moins exposé aux boulets. Le chirurgien y opère les blessés sur une table, sans anesthésie, le plus vite possible.', 'En bataille, la pièce se remplit de blessés. Le chirurgien est aidé par de jeunes mousses qui portent les hommes et les bandages.'],
  soute: ['La soute à poudre, tout au fond du navire, sous la ligne de flottaison. Elle est doublée de plomb ou de cuivre et éclairée de l’extérieur par une lanterne derrière une vitre, pour qu’aucune flamme n’y entre.', 'On y marche en chaussons de feutre, sans aucun objet de fer. Les « poudriers », souvent des enfants, courent apporter les gargousses de poudre aux canons.'],
  cale: ['La cale : le fond du navire. On y range des tonneaux d’eau douce, de vin et de viande salée, des sacs de biscuit et le lest, des pierres lourdes qui stabilisent la coque.', 'La pompe à chaîne y rejette sans arrêt l’eau qui s’infiltre. L’odeur est terrible, et les rats sont chez eux.'],
};

/* ═════════ plan des niveaux (pur) ═════════ */
export function planInterieur(S, type) {
  const spec = SPEC[type.id] || SPEC.brick, y0 = S.yPont(.5), nb = spec.filter(s => s[0] === 'batterie').length;
  const niveaux = [{ k: 0, role: 'pont', nom: 'Pont supérieur', sol: y0, plafond: y0 + 40, h: 40, salles: [{ id: 'pont', nom: 'Pont supérieur', u0: .1, u1: .9 }] }];
  let haut = y0 - EP, ib = 0;
  spec.slice(1).forEach(([role, h], i) => {
    const plafond = haut, sol = plafond - h, k = i + 1, salles = []; let nom;
    if (role === 'batterie') {
      nom = (NOMS_BAT[nb] || ['Batterie'])[ib] || 'Batterie'; const premiere = ib === 0, derniere = ib === nb - 1;
      if (premiere) salles.push({ id: 'cabine', nom: 'Cabine du capitaine', u0: .03, u1: .2, cloison: true });
      salles.push({ id: 'batterie', nom, u0: premiere ? .2 : .03, u1: derniere ? .82 : .97 });
      if (derniere) salles.push({ id: 'cuisine', nom: 'Cuisine', u0: .82, u1: .97 });
      ib++;
    } else if (role === 'faux') {
      nom = 'Faux-pont';
      if (type.id === 'voilier') salles.push({ id: 'cabine', nom: 'Cabine du capitaine', u0: .03, u1: .2, cloison: true }, { id: 'infirmerie', nom: 'Infirmerie', u0: .21, u1: .29, cloison: true }, { id: 'hamacs', nom: 'Hamacs de l’équipage', u0: .33, u1: .6 }, { id: 'cuisine', nom: 'Cuisine', u0: .64, u1: .9 });
      else if (type.id === 'brick') salles.push({ id: 'cabine', nom: 'Cabine du capitaine', u0: .03, u1: .18, cloison: true }, { id: 'infirmerie', nom: 'Infirmerie', u0: .2, u1: .3, cloison: true }, { id: 'hamacs', nom: 'Hamacs de l’équipage', u0: .33, u1: .66 }, { id: 'cuisine', nom: 'Cuisine', u0: .7, u1: .92 });
      else salles.push({ id: 'infirmerie', nom: 'Infirmerie', u0: .06, u1: .22, cloison: true }, { id: 'hamacs', nom: 'Hamacs de l’équipage', u0: .26, u1: .8 });
    } else {
      nom = 'Cale';
      salles.push({ id: 'soute', nom: 'Soute à poudre', u0: type.id === 'voilier' ? .1 : .12, u1: .3, cloison: true }, { id: 'cale', nom: 'Cale', u0: .34, u1: .92 });
    }
    niveaux.push({ k, role, nom, sol, plafond, h, salles }); haut = sol - EP;
  });
  return { niveaux, trappes: U_TRAPPES[type.id] || U_TRAPPES.brick, y0, nb };
}

/* ═════════ construction d'un niveau ═════════ */
function carteTexture(T, nom) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 360; const g = c.getContext('2d');
  g.fillStyle = '#e8d3a0'; g.fillRect(0, 0, 512, 360); g.strokeStyle = '#6b4a2a'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 350);
  g.fillStyle = '#c9b27a'; g.beginPath(); g.moveTo(40, 60); g.bezierCurveTo(120, 20, 220, 90, 180, 150); g.bezierCurveTo(140, 200, 60, 190, 40, 120); g.fill(); g.beginPath(); g.moveTo(330, 230); g.bezierCurveTo(420, 190, 480, 260, 440, 320); g.bezierCurveTo(380, 340, 320, 300, 330, 230); g.fill();
  g.strokeStyle = '#8a3a22'; g.lineWidth = 3; g.setLineDash([9, 7]); g.beginPath(); g.moveTo(120, 170); g.bezierCurveTo(220, 240, 300, 120, 380, 250); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 60 * i + 20); g.lineTo(512, 60 * i + 20); g.stroke(); }
  g.fillStyle = '#8a3a22'; g.beginPath(); g.arc(420, 80, 38, 0, 6.3); g.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(420, 80); g.lineTo(420 + Math.sin(a) * (i % 2 ? 22 : 38), 80 - Math.cos(a) * (i % 2 ? 22 : 38)); g.lineTo(420 + Math.sin(a + .4) * 10, 80 - Math.cos(a + .4) * 10); g.fill(); }
  g.fillStyle = '#4a2e18'; g.font = 'bold 18px serif'; g.fillText('N', 413, 34); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function creerBatisseur(T, B) {
  const F = new Fusion(T), L = new Fusion(T), W = new Fusion(T), liberer = [], cache = {};
  const col = hex => { const c = new T.Color(hex); return [c.r, c.g, c.b]; };
  const gb = (k, f) => cache[k] || (liberer.push(cache[k] = f()), cache[k]);
  const Q = new T.Quaternion(), V = new T.Vector3(), Sc = new T.Vector3(), E = new T.Euler();
  const mat = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { E.set(rx, ry, rz); Q.setFromEuler(E); return new T.Matrix4().compose(V.set(x, y, z), Q, Sc.set(sx, sy, sz)); };
  const api = {
    F, L, W, liberer, col, gb,
    box: (x, y, z, w, h, d, c, ry = 0, rx = 0, rz = 0) => F.ajouter(gb('b', () => new T.BoxGeometry(1, 1, 1)), { matrice: mat(x, y, z, w, h, d, rx, ry, rz), couleur: col(c) }),
    cyl: (x, y, z, r, h, c, o = {}) => F.ajouter(gb('c' + (o.seg || 10), () => new T.CylinderGeometry(1, 1, 1, o.seg || 10)), { matrice: mat(x, y, z, r * (o.sx || 1), h, r * (o.sz || 1), o.rx || 0, o.ry || 0, o.rz || 0), couleur: col(c) }),
    sph: (x, y, z, r, c, o = {}) => F.ajouter(gb('s', () => new T.SphereGeometry(1, 8, 6)), { matrice: mat(x, y, z, r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)), couleur: col(c) }),
    lum: (x, y, z, w, h, d, c) => L.ajouter(gb('b', () => new T.BoxGeometry(1, 1, 1)), { matrice: mat(x, y, z, w, h, d), couleur: col(c) }),
    fen: (x, y, z, w, h, d) => W.ajouter(gb('b', () => new T.BoxGeometry(1, 1, 1)), { matrice: mat(x, y, z, w, h, d), couleur: [1, 1, 1] }),
    grille(pos, couleurs) {                  // quads donnés par 4 sommets → fusionnés (couleur par quad)
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); liberer.push(g);
      F.ajouter(g, { matrice: new T.Matrix4(), couleur: (i) => { const q = Math.floor(i / 6) * 3; return [couleurs[q], couleurs[q + 1], couleurs[q + 2]]; } });
    },
  };
  return api;
}
function quads(pos, cols, p, c) {          // p : 4 points [x,y,z] ; deux triangles
  const [a, b, d, e] = p; for (const v of [a, b, d, a, d, e]) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 6; i++) cols.push(c[0], c[1], c[2]);
}

function batirNiveau(B, niv, plan) {
  const { T, S, P, type, nation, bas, rnd, tx } = B, k = niv.k, N = plan.niveaux.length, U = plan.trappes;
  const groupe = new T.Group(); groupe.name = 'niveau' + k; const bt = creerBatisseur(T, B), { box, cyl, sph, lum, fen, col } = bt;
  const rects = [], circles = [], foules = [], postes = [], L = S.L;
  const lg = (z, y) => { const u = S.uDe(z); return S.x(u, S.vDepuisY(u, y)); };
  const zc = i => S.zDe(U[i % 2]);
  const sol = niv.sol, plaf = niv.plafond, h = niv.h;
  const res = { k, groupe, rects, circles, foules, salles: [], canons: null, flash: [] };
  if (k === 0) {                                                   // pont : seul le contour de l'écoutille
    const u = U[0], z = S.zDe(u), y = S.yPont(u);
    for (const [bx, bz, bw, bd] of [[0, z - 1.0, 1.7, .14], [0, z + 1.0, 1.7, .14], [-.82, z, .14, 2.1], [.82, z, .14, 2.1]]) box(bx, y + .12, bz, bw, .26, bd, 0x4a2e18);
    const g = new T.PlaneGeometry(1.5, 1.86); g.rotateX(-Math.PI / 2); bt.liberer.push(g); bt.F.ajouter(g, { matrice: new T.Matrix4().makeTranslation(0, y + .03, z), couleur: col(0x0b0705) });
    for (let i = 0; i < 4; i++) box(0, y - .15 - i * .32, z - .93, .8, .05, .05, 0x7a5a30);
    rects.push({ x0: -.82, x1: .82, z0: z - 1.0, z1: z + 1.0 });
    for (const m of P.masts) circles.push({ x: 0, z: S.zDe(m.u), r: m.rayon * 1.15 + .3 });
    finaliser(bt, B, res, groupe); return res;
  }
  /* étendue du niveau */
  const largeur = (z) => Math.min(lg(z, sol + .35), lg(z, plaf - .2));
  let uMin = .5, uMax = .5; while (uMin > .02 && lg(S.zDe(uMin - .005), sol + .5) > 1.2 && lg(S.zDe(uMin - .005), plaf - .2) > 1.2) uMin -= .005; while (uMax < .98 && lg(S.zDe(uMax + .005), sol + .5) > 1.2 && lg(S.zDe(uMax + .005), plaf - .2) > 1.2) uMax += .005;
  const zS = S.zDe(uMin), zB = S.zDe(uMax); res.uMin = uMin; res.uMax = uMax; res.zS = zS; res.zB = zB; res.largeur = largeur;
  const cPlanche = [col(0xc9a064), col(0xb68a52)], cMur = [col(0x7b4d28), col(0x92602f)], cPlaf = [col(0x56361c), col(0x654123)];
  const pasZ = bas ? .8 : .5, zLignes = (extras) => { const a = [zS]; for (let z = zS - pasZ; z > zB + pasZ * .4; z -= pasZ) a.push(z); a.push(zB); for (const e of extras) if (e < zS - .05 && e > zB + .05) a.push(e); a.sort((p, q) => q - p); return a.filter((z, i, t) => i === 0 || t[i - 1] - z > .02); };
  const dalle = (y, trou, cc) => {
    const pos = [], cols = [], zs = zLignes(trou ? [trou - .93, trou + .93] : []);
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2, wa = largeur(za) - .02, wb = largeur(zb) - .02, nP = Math.max(1, Math.round((wa - .7) / .6)), dansTrou = trou && zm < trou + .93 && zm > trou - .93;
      for (const sg of [-1, 1]) for (let j = 0; j < nP; j++) {
        const xa = (z, w) => sg * (.7 + (w - .7) * j / nP), xb = (z, w) => sg * (.7 + (w - .7) * (j + 1) / nP);
        quads(pos, cols, [[xa(za, wa), y, za], [xb(za, wa), y, za], [xb(zb, wb), y, zb], [xa(zb, wb), y, zb]], cc[(j + (i % 9 === 0 ? 1 : 0)) % 2]);
      }
      if (!dansTrou) quads(pos, cols, [[-.7, y, za], [.7, y, za], [.7, y, zb], [-.7, y, zb]], cc[i % 2]);
    }
    bt.grille(pos, cols);
  };
  const trouSol = k < N - 1 ? zc(k) : null, trouPlaf = zc(k - 1);
  dalle(sol, trouSol, cPlanche); dalle(plaf, trouPlaf, cPlaf);
  /* murs de coque (membrures tous les 1,1 m) */
  { const pos = [], cols = [], zs = zLignes([]);
    for (const sg of [-1, 1]) for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], c = cMur[Math.floor(i / 2) % 2], ym = sol + h * .62;
      quads(pos, cols, [[sg * lg(za, sol), sol, za], [sg * lg(za, ym), ym, za], [sg * lg(zb, ym), ym, zb], [sg * lg(zb, sol), sol, zb]], c);
      quads(pos, cols, [[sg * lg(za, ym), ym, za], [sg * lg(za, plaf), plaf, za], [sg * lg(zb, plaf), plaf, zb], [sg * lg(zb, ym), ym, zb]], cMur[(Math.floor(i / 2) + 1) % 2]);
    }
    for (const [z, sg] of [[zS, 0], [zB, 1]]) quads(pos, cols, [[-lg(z, sol), sol, z], [lg(z, sol), sol, z], [lg(z, plaf), plaf, z], [-lg(z, plaf), plaf, z]], col(0x5e3a1d));
    bt.grille(pos, cols);
    for (let z = zS - .9; z > zB + .5; z -= bas ? 2.4 : 1.2) for (const sg of [-1, 1]) box(sg * (largeur(z) - .04), sol + h / 2, z, .12, h, .2, 0x4a2e18);
    for (let z = zS - .8; z > zB + .4; z -= bas ? 2.2 : 1.1) { if (trouPlaf && Math.abs(z - trouPlaf) < 1.0) continue; box(0, plaf - .11, z, 2 * largeur(z) - .1, .22, .24, 0x4a2e18); }
  }
  /* mâts qui traversent le niveau */
  for (const m of P.masts) { const zm = S.zDe(m.u); if (zm > zS - .5 || zm < zB + .5) continue; const r = Math.max(.28, m.rayon * 1.25);
    cyl(0, (sol + plaf) / 2, zm, r, h + EP, 0xb98a52, { seg: 12 }); for (const yy of [sol + .45, plaf - .45]) cyl(0, yy, zm, r * 1.08, .12, 0x3a3d44, { seg: 12 }); circles.push({ x: 0, z: zm, r: r + .3 }); }
  /* échelle de l'écoutille du dessus + garde-corps de l'écoutille du dessous */
  { const z0 = zc(k - 1) - .95; for (const sx of [-.38, .38]) box(sx, (sol + plaf + EP) / 2, z0, .07, h + EP, .07, 0x7a5a30); for (let yy = sol + .28; yy < plaf + EP; yy += .32) box(0, yy, z0, .8, .05, .05, 0x8a6a3a); }
  if (trouSol != null) { rects.push({ x0: -.78, x1: .78, z0: trouSol - 1.0, z1: trouSol + 1.0 }); for (const [bx, bz, bw, bd] of [[0, trouSol - 1.0, 1.7, .1], [0, trouSol + 1.0, 1.7, .1], [-.8, trouSol, .1, 2.1], [.8, trouSol, .1, 2.1]]) box(bx, sol + .09, bz, bw, .18, bd, 0x3a2412); }
  { let c = 0; for (let z = zS - 5; z > zB + 2; z -= 6.5) { const x = (c++ % 2 ? 1 : -1) * (largeur(z) - 1.0); lum(x, plaf - .36, z, .2, .26, .2, 0xffc860); box(x, plaf - .15, z, .03, .3, .03, 0x2a1a0e); box(x, plaf - .52, z, .26, .04, .26, 0x2a2d33); box(x, plaf - .22, z, .26, .04, .26, 0x2a2d33); } }
  /* ─── salles ─── */
  const cloisons = [], A = {};
  for (const s of niv.salles) {
    const u0 = Math.max(s.u0, uMin + .012), u1 = Math.max(s.u1, u0 + .08), z0 = S.zDe(u0), z1 = S.zDe(Math.min(u1, uMax - .012)), zm = (z0 + z1) / 2;
    const salle = Object.assign({}, s, { u0, u1, z0, z1, zm, spawn: { x: 0, z: s.id === 'cale' ? zm : z0 - 2.4, yaw: 0 } }); res.salles.push(salle); A[s.id] = salle;
    if (s.cloison) { const zb = z1, w = largeur(zb) - .05, pt = 1.0; salle.spawn = { x: 0, z: zb + 1.5, yaw: Math.PI };
      for (const sg of [-1, 1]) { const xc = sg * (.55 + (w - .55) / 2); box(xc, sol + h / 2, zb, w - .55, h, .12, 0x6a4424); rects.push({ x0: Math.min(sg * .55, sg * w), x1: Math.max(sg * .55, sg * w), z0: zb - .1, z1: zb + .1 }); }
      box(0, plaf - .16, zb, 1.1, .32, .12, 0x6a4424); box(-.56, sol + h / 2, zb, .08, h, .16, 0x3a2412); box(.56, sol + h / 2, zb, .08, h, .16, 0x3a2412); void pt; }
  }
  const canonMeshes = [];
  for (const s of res.salles) salleMeubles(s);
  function equipe(x, y, z, yaw, a, type, extra = {}) { postes.push(Object.assign({ x, y, z, yaw, a, type }, extra)); }
  function salleMeubles(s) {
    const { z0, z1, zm } = s, w = largeur(zm), rr = rnd;
    if (s.id === 'cabine') {
      const zt = zm + .2; box(0, sol + .78, zt, 2.3, .09, 1.15, 0x8a5a2e); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * 1.05, sol + .38, zt + sz * .5, .1, .76, .1, 0x5a3a1e);
      const m = new T.Mesh(new T.PlaneGeometry(1.3, .9), new T.MeshToonMaterial({ map: tx.carte, color: 0xffffff })); m.rotation.x = -Math.PI / 2; m.position.set(-.1, sol + .83, zt); m.rotation.z = .12; groupe.add(m); bt.liberer.push(m.geometry, m.material);
      for (const sz of [-1, 1]) { box(0, sol + .5, zt + sz * 1.0, .62, .08, .62, 0x7a4a24); box(0, sol + .9, zt + sz * 1.28, .62, .8, .08, 0x7a4a24); for (const a of [-1, 1]) for (const b of [-1, 1]) box(a * .27, sol + .24, zt + sz * 1.0 + b * .27, .06, .48, .06, 0x5a3a1e); }
      const lit = (z0 - 1.6); box(w - 1.15, sol + .45, lit, 1.5, .1, 2.3, 0x5a3a1e); box(w - 1.15, sol + .58, lit, 1.4, .18, 2.2, 0xf1ead2); box(w - 1.15, sol + .7, lit + .5, 1.3, .1, 1.1, nation.bande2 || 0x9a2a2a);
      box(-(w - .8), sol + .5, zm - .2, 1.0, 1.0, 1.9, 0x6a4424); box(-(w - .8), sol + 1.02, zm - .2, 1.1, .08, 2.0, 0xe0b040);                         // coffre doré
      const zf = zS - .1;                                                                                                     // galerie de poupe : cinq fenêtres
      for (let i = -2; i <= 2; i++) { const x = i * Math.min(1.25, (largeur(zS) - .6) / 2.4); if (Math.abs(x) < largeur(zS) - .7) { fen(x, sol + h * .62, zf - .02, .85, .75, .06); for (const [bx, by, bw, bh] of [[x, sol + h * .62 + .42, .98, .1], [x, sol + h * .62 - .42, .98, .1], [x - .46, sol + h * .62, .1, .8], [x + .46, sol + h * .62, .1, .8], [x, sol + h * .62, .05, .75]]) box(bx, by, zf - .05, bw, bh, .1, 0x3a2412); } }
      for (const sg of [-1, 1]) canonCabine(sg, zm - .6 + sg * 0 + (sg > 0 ? .5 : -.1));
      equipe(-.2, sol, zt + 1.28, Math.PI, 7, 6); equipe(.7, sol, zt - 1.2, 0, 0, 1);
      equipe(.45, sol, s.z1 + .9, 0, 0, 3); equipe(-.45, sol, s.z1 + .9, 0, 0, 3);
    } else if (s.id === 'batterie') {
      const n = type.id === 'fregate' ? 18 : (plan.nb === 3 ? [9, 14, 14][Math.max(0, k - 1)] : 14), u0 = s.u0 + .045, u1 = Math.min(s.u1 - .04, .78), pas = (S.zDe(u0) - S.zDe(u1)) / n;
      const items = [];
      for (const sg of [-1, 1]) for (let i = 0; i < n; i++) {
        const z = S.zDe(u0) - pas * (i + .5); if (trouPlaf && Math.abs(z - trouPlaf) < 1.4 || (trouSol && Math.abs(z - trouSol) < 1.6) || P.masts.some(m => Math.abs(S.zDe(m.u) - z) < 1.2)) continue;
        const wp = lg(z, sol + .95); items.push({ x: sg * (wp - .14 - 1.5), z, sg, wp, recul: 0, t: 99, delai: -1 });
        fen(sg * (wp - .01), sol + .95, z, .05, .62, .72); for (const [by, bh] of [[sol + 1.3, .08], [sol + .6, .08]]) box(sg * (wp - .02), by, z, .08, bh, .86, 0x2a1a0e); for (const dz of [-.4, .4]) box(sg * (wp - .02), sol + .95, z + dz, .08, .7, .08, 0x2a1a0e);
        sph(sg * (wp - .8), sol + .11, z + pas * .3, .11, 0x23242a); sph(sg * (wp - .8) + sg * .22, sol + .11, z + pas * .3, .11, 0x23242a); sph(sg * (wp - .9), sol + .3, z + pas * .3, .11, 0x23242a); cyl(sg * (wp - 1.1), sol + .22, z - pas * .3, .17, .44, 0x6a4424, { seg: 8 });
        const sy = sg > 0 ? Math.PI / 2 : -Math.PI / 2, xr = sg * (wp - 1.5 - 1.55);
        equipe(xr, sol, z - .42, sy, 3, 2); equipe(xr, sol, z + .42, sy, 3, 2); if (i % 3 === 0) equipe(xr + sg * .3, sol, z + pas * .35, sy + Math.PI, 9, 0, { amp: 0 });
      }
      res.canons = { items, zone: s }; canonMeshes.push(items);
      equipe(0, sol, zm, 0, 1, 1, { amp: Math.min(5, (z0 - z1) * .3) });
      for (const sg of [-1, 1]) rects.push({ x0: Math.min(sg * (w - .15), sg * (w - 1.05)), x1: Math.max(sg * (w - .15), sg * (w - 1.05)), z0: z1, z1: z0 }); void rr;
    } else if (s.id === 'cuisine') {
      const xs = largeur(zm) - 1.6, z = zm + 1.0; box(xs, sol + .5, z, 2.2, 1.0, 1.4, 0x9c3b27); box(xs, sol + 1.04, z, 2.3, .1, 1.5, 0x2b2d33); cyl(xs - .55, sol + 1.3, z, .45, .5, 0x3a3d44); cyl(xs + .55, sol + 1.3, z, .4, .45, 0x4a4d54); cyl(xs, plaf - .5, z + .5, .12, h - 1.6, 0x2b2d33, { seg: 8 });
      lum(xs - 1.12, sol + .4, z, .05, .45, .7, 0xff7a20); res.feu = { x: xs - 1.12, y: sol + .4, z }; box(xs, sol + .08, z + 1.1, 1.8, .16, .5, 0x4a2e18);
      cyl(xs, sol + .5, z - 1.5, .5, 1.0, 0x6a4424, { seg: 10 }); cyl(xs + .9, sol + .5, z - 1.5, .45, .9, 0x6a4424, { seg: 10 });
      box(-xs + .6, sol + .75, zm - .5, 2.4, .08, 1.0, 0x9b7040); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(-xs + .6 + sx * 1.1, sol + .38, zm - .5 + sz * .4, .08, .76, .08, 0x5a3a1e);
      for (const [dx, c] of [[-.7, 0xd9a24a], [-.3, 0xd9a24a], [.2, 0xf1dd8a], [.7, 0xb3282a]]) cyl(-xs + .6 + dx, sol + .86, zm - .5, .17, .12, c, { seg: 8 });
      for (let i = 0; i < 4; i++) sph(-xs + 1.0 + i * .45 - 1.3, plaf - .5, zm - 1.5, .2, 0xd98a8a, { sy: 1.5 });
      for (let i = 0; i < 5; i++) { const x = -xs + .2 + i * .55; cyl(x, sol + h * .62, s.z0 - .2, .1, .08, 0x9a9da4, { seg: 8, rx: Math.PI / 2 }); }
      equipe(xs - .1, sol, z + .95, Math.PI, 8, 4); equipe(-1.3, sol, zm + .2, 0, 9, 0, { amp: 1.4 }); equipe(-xs + .6, sol, zm - 1.2, 0, 0, 0);
    } else if (s.id === 'hamacs') {
      const n = 0, items = []; void n;
      for (let z = z0 - .9; z > z1 + .9; z -= (bas ? 1.9 : 1.05)) {
        const wh = largeur(z) - .5, cols = Math.max(1, Math.floor((wh - 1.05) / .6) + 1);
        for (const sg of [-1, 1]) for (let c = 0; c < cols; c++) {
          const x = sg * (1.15 + c * .6), y = plaf - .88 - rnd() * .06; items.push({ x, y, z, sag: .9 + rnd() * .2 });
          box(x, plaf - .45, z - .88, .03, .9, .03, 0x3a2a18); box(x, plaf - .45, z + .88, .03, .9, .03, 0x3a2a18);
          if (rnd() < .66) equipe(x, y - .02, z, 0, 6, rnd() < .15 ? 1 : 0);
        }
      }
      res.hamacs = items; for (const sg of [-1, 1]) rects.push({ x0: sg > 0 ? 1.0 : -(largeur(zm)), x1: sg > 0 ? largeur(zm) : -1.0, z0: z1, z1: z0 });
    } else if (s.id === 'infirmerie') {
      const zt = zm + .6; box(0, sol + .8, zt, 1.9, .12, 1.0, 0xd8cdb0); box(.3, sol + .86, zt, .8, .02, .5, 0x8a1c1c); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(sx * .85, sol + .4, zt + sz * .4, .1, .8, .1, 0x5a3a1e);
      for (let i = 0; i < 4; i++) { const sg = i % 2 ? 1 : -1, z = zm - .4 - Math.floor(i / 2) * 1.6 + 1.2; box(sg * (largeur(z) - 1.2), sol + .4, z, 1.0, .08, 2.0, 0x5a3a1e); box(sg * (largeur(z) - 1.2), sol + .5, z, .9, .12, 1.9, 0xe8dfc6); }
      box(1.1, sol + .35, zt - .9, .9, .5, .6, 0x6a4424); box(-1.2, sol + .5, zm + 1.0, .6, 1.0, .6, 0x4a2e18); cyl(-1.2, sol + 1.04, zm + 1.0, .28, .12, 0x3a3d44);
      equipe(0, sol, zt + .85, Math.PI, 0, 5); equipe(.9, sol, zm - .6, 0, 9, 0, { amp: 1.0 });
      res.blesses = []; for (let i = 0; i < 4; i++) { const sg = i % 2 ? 1 : -1, z = zm - .4 - Math.floor(i / 2) * 1.6 + 1.2; res.blesses.push({ x: sg * (largeur(z) - 1.2), y: sol + .52, z, yaw: Math.PI / 2 * 0, a: 6, type: 0 }); }
      rects.push({ x0: -1.0, x1: 1.0, z0: zt - .5, z1: zt + .5 });
    } else if (s.id === 'soute') {
      for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) for (let j = 0; j < Math.floor((z0 - z1) / .8) - 1; j++) { const z = z0 - .7 - j * .8, x = sg * (largeur(z) - .6 - i * .72); if (Math.abs(x) < .8) continue; cyl(x, sol + .42, z, .34, .84, 0x6a4424, { seg: 10 }); cyl(x, sol + .24, z, .365, .06, 0x3a3d44, { seg: 10 }); cyl(x, sol + .62, z, .365, .06, 0x3a3d44, { seg: 10 }); if (i === 0) cyl(x, sol + 1.26, z, .34, .84, 0x6a4424, { seg: 10 }); }
      box(0, plaf - .8, s.z1 + .06, .5, .55, .06, 0x2a1a0e); lum(0, plaf - .8, s.z1 + .1, .38, .43, .03, 0xffd060);
      equipe(-.45, sol, zm - .6, 0, 9, 0, { amp: 1.8, vit: 1.4 }); equipe(.45, sol, zm - 1.2, Math.PI, 9, 0, { amp: 1.4, vit: 1.2 });
      rects.push({ x0: -.9, x1: .9, z0: zm - 3.0, z1: zm - 2.2 });
    } else if (s.id === 'cale') {
      const eau = new T.Mesh(new T.PlaneGeometry(2 * largeur(zm), z0 - z1), new T.MeshToonMaterial({ color: 0x1d4a6a, transparent: true, opacity: .72 })); eau.rotation.x = -Math.PI / 2; eau.position.set(0, sol + .08, zm); groupe.add(eau); bt.liberer.push(eau.geometry, eau.material); res.eau = eau;
      for (let z = z0 - .8; z > z1 + .8; z -= 1.0) for (const sg of [-1, 1]) { const x = sg * (largeur(z) - .7); if (rnd() < .55) { cyl(x, sol + .5, z, .38, 1.0, 0x6a4424, { seg: 10 }); cyl(x, sol + .3, z, .405, .06, 0x3a3d44, { seg: 10 }); cyl(x, sol + .7, z, .405, .06, 0x3a3d44, { seg: 10 }); if (rnd() < .5) cyl(x, sol + 1.5, z, .38, 1.0, 0x6a4424, { seg: 10 }); } else if (rnd() < .6) { box(x, sol + .35, z, .8, .7, .7, 0xb98a52); sph(x - sg * .2, sol + .2, z + .1, .35, 0xd9c08a, { sy: .7 }); } }
      for (let i = 0; i < (bas ? 14 : 30); i++) sph((rnd() - .5) * 2 * (largeur(zm) - 1.4), sol + .12, z1 + 1 + rnd() * (z0 - z1 - 2), .22 + rnd() * .12, 0x7a7d85, { sy: .55 });
      const pz = zm + 3.0; for (const sg of [-1]) { cyl(sg * 1.2, (sol + plaf) / 2, pz, .14, h, 0x9a9da4, { seg: 8 }); box(sg * 1.2, sol + 1.1, pz, .06, .06, 1.1, 0x5a3a1e); }
      for (let i = 0; i < 3; i++) cyl(0, sol + .12 + i * .12, z1 + 1.8, .9 - i * .06, .1, 0xc9a064, { seg: 14 });
      equipe(-1.5, sol, pz + .3, Math.PI / 2, 0, 0);
    }
  }
  function canonCabine(sg, z) { const wp = lg(z, sol + .95), items = res.canonsCab || (res.canonsCab = []); items.push({ x: sg * (wp - .14 - 1.5), z, sg, wp, recul: 0, t: 99, delai: -1 }); fen(sg * (wp - .01), sol + .95, z, .05, .62, .72); }
  if (canonMeshes.length || res.canonsCab) {
    const items = (res.canons ? res.canons.items : []).concat(res.canonsCab || []); if (!res.canons) res.canons = { items }; else res.canons.items = items;
    const f = new Fusion(T), cG = new T.CylinderGeometry(.14, .25, 2.55, 10); cG.rotateZ(-Math.PI / 2); cG.translate(.25, .98, 0); f.ajouter(cG, { couleur: col(0x2b2d33) }); cG.dispose();
    const ca = new T.BoxGeometry(1.7, .3, .8); f.ajouter(ca, { matrice: new T.Matrix4().makeTranslation(-.15, .55, 0), couleur: col(0x9c3b27) }); ca.dispose();
    for (const dz of [-.46, .46]) { const sl = new T.BoxGeometry(1.5, .45, .1); f.ajouter(sl, { matrice: new T.Matrix4().makeTranslation(-.15, .48, dz), couleur: col(0x9c3b27) }); sl.dispose(); }
    for (const [wx, wz] of [[-.75, -.46], [-.75, .46], [.35, -.46], [.35, .46]]) { const wg = new T.CylinderGeometry(.21, .21, .14, 10); wg.rotateX(Math.PI / 2); f.ajouter(wg, { matrice: new T.Matrix4().makeTranslation(wx, .21, wz), couleur: col(0x3a2412) }); wg.dispose(); }
    const geo = f.construire(), im = new T.InstancedMesh(geo, matToon(T, 0xffffff, { vertexColors: true }), items.length), M = new T.Matrix4(), Qr = new T.Quaternion(), Vv = new T.Vector3();
    items.forEach((it, i) => { Qr.setFromAxisAngle(new T.Vector3(0, 1, 0), it.sg > 0 ? 0 : Math.PI); M.compose(Vv.set(it.x, sol, it.z), Qr, new T.Vector3(1, 1, 1)); im.setMatrixAt(i, M); }); im.frustumCulled = false; groupe.add(im);
    res.canons.im = im; res.canons.sol = sol; bt.liberer.push(geo, im.material);
  }
  const bleuss = res.blesses; void bleuss;
  const nHam = (res.hamacs || []).length;
  if (nHam) {
    const gH = new T.SphereGeometry(1, 10, 6), mH = matToon(T, 0xffffff), im = new T.InstancedMesh(gH, mH, nHam), M = new T.Matrix4(), Qr = new T.Quaternion(), C = new T.Color();
    res.hamacs.forEach((hm, i) => { M.compose(new T.Vector3(hm.x, hm.y, hm.z), Qr, new T.Vector3(.27, .17 * hm.sag, .95)); im.setMatrixAt(i, M); C.setHSL(.1 + rnd() * .03, .3 + rnd() * .15, .72 + rnd() * .12); im.setColorAt(i, C); });
    im.frustumCulled = false; groupe.add(im); bt.liberer.push(gH, mH, im);
  }
  /* équipes */
  if (postes.length) { const fl = creerFoule(T, { postes, graine: 3 + k }); groupe.add(fl.mesh); foules.push(fl); res.equipe = fl; }
  if (res.blesses) { const fb = creerFoule(T, { postes: res.blesses, graine: 9 }); groupe.add(fb.mesh); foules.push(fb); res.blessesFoule = fb; }
  finaliser(bt, B, res, groupe); return res;
}
function finaliser(bt, B, res, groupe) {
  const T = B.T, gF = bt.F.construire(), gL = bt.L.construire(), gW = bt.W.construire();
  const mF = matToon(T, 0xffffff, { vertexColors: true, side: T.DoubleSide }), mL = new T.MeshBasicMaterial({ vertexColors: true }), meshF = new T.Mesh(gF, mF), meshL = new T.Mesh(gL, mL), meshW = new T.Mesh(gW, B.matFen);
  meshF.frustumCulled = meshL.frustumCulled = meshW.frustumCulled = false; groupe.add(meshF, meshL, meshW); res.libres = [gF, gL, gW, mF, mL, ...bt.liberer];
  res.balayer = () => { for (const o of res.libres) if (o && o.dispose) o.dispose(); for (const f of res.foules) f.detruire(); if (res.canons && res.canons.im) res.canons.im.dispose(); };
}

/* ═════════ entrée dans le navire ═════════ */
export async function entrer(o) {
  const { THREE: T, ctx, noyau, hud, scene, camera, ctrl, navire: n, monde, theme, son } = o;
  if (!n) return { ok: false, texte: 'Aucun navire à visiter.' };
  if (theme.dedans) { if (o.piece) await theme.dedans.aller(o.piece); return theme.dedans.resume(); }
  if (noyau.enCinematique && noyau.enCinematique()) noyau.passerAnimation();                 // l'arrivée depuis l'espace se termine avant d'entrer
  const S = n.geo.forme, P = n.geo.plan, type = n.def, nation = n.geo.nation, plan = planInterieur(S, type), q = ctx.q || {}, bas = (q.lod || 0) >= 2;
  const rnd = (() => { let s = 4242 + n.id * 17; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const matFen = new T.MeshBasicMaterial({ color: 0xbfe0ff }), tx = { carte: carteTexture(T, n.nom) };
  const B = { T, S, P, type, nation: { bande2: nation.bande2 }, bas, rnd, tx, matFen };
  const sortie = noyau.fondu ? noyau.fondu(true) : Promise.resolve(); await sortie;
  const racine = n.geo.groupe, salle = new T.Group(); salle.name = 'interieur'; racine.add(salle);
  const niveaux = new Array(plan.niveaux.length).fill(null); let nivC = 0, enCours = true;
  const assurer = k => { if (k < 0 || k >= niveaux.length || niveaux[k]) return niveaux[k]; const r = batirNiveau(B, plan.niveaux[k], plan); niveaux[k] = r; salle.add(r.groupe); return r; };
  // lumières propres à l'intérieur (intensité nulle sur le pont : pas de recompilation des matériaux)
  const amb = new T.HemisphereLight(0xffe2b0, 0x3a2410, 0), lampe = new T.PointLight(0xffc880, 0, 16, 1.4), flash = new T.PointLight(0xff9a40, 0, 18, 1.7);
  salle.add(amb, lampe, flash);
  // fumée intérieure
  const tf = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new T.CanvasTexture(c); return t; })();
  const fumees = []; for (let i = 0; i < (bas ? 24 : 48); i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: tf, color: 0x8d8a85, transparent: true, opacity: 0, depthWrite: false })); sp.visible = false; sp.userData = { vie: 0, v: new T.Vector3() }; salle.add(sp); fumees.push(sp); }
  let ifum = 0; const puff = (x, y, z, vx, vy, vz, taille = 1.2) => { const sp = fumees[ifum++ % fumees.length]; sp.position.set(x, y, z); sp.userData.vie = 1; sp.userData.v.set(vx, vy, vz); sp.userData.t0 = taille; sp.scale.setScalar(taille); sp.visible = true; };
  /* état du joueur */
  const p = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, bob: 0, trans: null };
  const touches = {}, joy = { x: 0, y: 0 }; let secousse = 0, pvPrec = n.pv, recPrec = { 1: n.recharge[1], [-1]: n.recharge[-1] }, tCri = 3, tCraque = 6;
  const niv = () => plan.niveaux[nivC], oeil = () => Math.min(EYE, (niv().h || 3) - .28);
  const yDeck = z => S.yPont(S.uDe(z));
  /* interface */
  const vue = ctx.canvas.parentElement, ui = document.createElement('div'); ui.className = 'univ-int'; const etiq = vue.querySelector('.univ-labels'); if (etiq) etiq.style.visibility = 'hidden';       // pas d'étiquettes de navires à l'intérieur
  ui.innerHTML = '<div class="univ-int-nom"></div><div class="univ-int-act"></div><div class="univ-joy" hidden><i></i></div><div class="univ-int-aide"></div>'; vue.appendChild(ui);
  const eNom = ui.querySelector('.univ-int-nom'), eAct = ui.querySelector('.univ-int-act'), eJoy = ui.querySelector('.univ-joy'), eAide = ui.querySelector('.univ-int-aide');
  const tactile = matchMedia('(pointer:coarse)').matches; eAide.textContent = tactile ? 'Joystick à gauche pour marcher · glisse ailleurs pour regarder' : 'ZQSD / WASD ou flèches : marcher · glisser la souris : regarder · Maj : courir · E : échelle · Échap : sortir';
  if (tactile) eJoy.hidden = false;
  const piecesDe = () => plan.niveaux.flatMap(nv => { const r = niveaux[nv.k]; return nv.salles.map(s => ({ k: nv.k, id: s.id, nom: s.nom })); });
  const salleDe = (id) => { for (const nv of plan.niveaux) { const s = nv.salles.find(x => x.id === id); if (s) return { k: nv.k, s }; } return null; };
  /* mouvement */
  function limites(x, z) {
    const r = niveaux[nivC]; if (nivC === 0) { const zmin = S.zDe(.96), zmax = S.zDe(.05); z = cl(z, zmin, zmax); const w = S.x(S.uDe(z), S.vDepuisY(S.uDe(z), yDeck(z))) - .6; x = cl(x, -w, w); }
    else if (r) { z = cl(z, r.zB + .55, r.zS - .55); const w = r.largeur(z) - .45; x = cl(x, -w, w); }
    if (r) { for (const c of r.circles) { const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz); if (d < c.r) { x = c.x + dx / (d || 1) * c.r; z = c.z + dz / (d || 1) * c.r; } }
      for (const b of r.rects) { const rad = .3; if (x > b.x0 - rad && x < b.x1 + rad && z > b.z0 - rad && z < b.z1 + rad) { const dl = [x - (b.x0 - rad), (b.x1 + rad) - x, z - (b.z0 - rad), (b.z1 + rad) - z], m = Math.min(...dl), i = dl.indexOf(m); if (i === 0) x = b.x0 - rad; else if (i === 1) x = b.x1 + rad; else if (i === 2) z = b.z0 - rad; else z = b.z1 + rad; } } }
    return [x, z];
  }
  function visibilites() {
    for (let k = 0; k < niveaux.length; k++) { const r = niveaux[k]; if (r) r.groupe.visible = nivC === 0 ? k === 0 : Math.abs(k - nivC) <= 1 && k > 0 || k === 0 && nivC === 1; }
    if (nivC === 0) { for (let k = 1; k < niveaux.length; k++) if (niveaux[k]) niveaux[k].groupe.visible = false; }
    cacherExterieur(nivC > 0);
  }
  const caches = [], lumOrig = new Map();
  function cacherExterieur(oui) {
    if (oui && !caches.length) { for (const c of scene.children) { if (c === racine || c.isLight || !c.visible) continue; c.visible = false; caches.push(c); } for (const c of racine.children) { if (c === salle || !c.visible) continue; c.visible = false; caches.push(c); } }
    else if (!oui) { for (const c of caches) c.visible = true; caches.length = 0; for (const [l, i] of lumOrig) l.intensity = i; lumOrig.clear(); }
  }
  async function aller(id, kk) {
    const alias = { pont: 'pont', batterie: 'batterie', batteries: 'batterie', canons: 'batterie', cuisine: 'cuisine', cabine: 'cabine', capitaine: 'cabine', hamacs: 'hamacs', dortoir: 'hamacs', soute: 'soute', poudre: 'soute', infirmerie: 'infirmerie', cale: 'cale' }, ident = alias[id] || id;
    const cible = kk != null ? (plan.niveaux[kk] && plan.niveaux[kk].salles.some(x => x.id === ident) ? { k: kk, s: plan.niveaux[kk].salles.find(x => x.id === ident) } : null) : salleDe(ident);
    if (!cible) return false; await (noyau.fondu ? noyau.fondu(true) : 0); placer(cible.k, cible.s); eNom.textContent = cible.s.nom; hud.legende(TEXTES[cible.s.id] ? TEXTES[cible.s.id][0] : cible.s.nom, 11000); majMenu(); noyau.fondu && noyau.fondu(false); return true;
  }
  function placer(k, s) {
    nivC = k; assurer(k); assurer(k - 1); assurer(k + 1); const r = niveaux[k], sp = r && r.salles.find(x => x.id === s.id);
    let x = 0, z = sp ? sp.spawn.z : S.zDe((s.u0 + s.u1) / 2), yaw = sp ? sp.spawn.yaw : 0; if (k === 0) z = S.zDe(.3);
    [x, z] = limites(x, z); Object.assign(p, { x, z, yaw, pitch: 0, vx: 0, vz: 0, trans: null }); visibilites();
  }
  function pres() { const r = []; for (const c of [nivC - 1, nivC]) { if (c < 0 || c >= niveaux.length - 1) continue; const zt = S.zDe(plan.trappes[c % 2]) - 1.45; if (Math.hypot(p.x, p.z - zt) < 2.2) r.push({ c, haut: c === nivC - 1, zt }); } return r; }
  function changer(c, haut) {
    if (p.trans) return; const dest = haut ? c : c + 1, zt = S.zDe(plan.trappes[c % 2]) - 1.45; assurer(dest); assurer(dest - 1); assurer(dest + 1);
    const y1 = dest === 0 ? yDeck(zt) : plan.niveaux[dest].sol; p.trans = { t: 0, de: { x: p.x, z: p.z, y: p.y }, a: { x: 0, z: zt, y: y1 }, dest }; son && son.craque && son.craque();
  }
  /* entrées clavier / pointeur */
  const kd = e => { if (e.target && /input|textarea|select/i.test(e.target.tagName)) return; touches[e.code] = true; if (e.code === 'KeyE') { const l = pres(); if (l.length) changer(l[0].c, l[0].haut); } if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); sortir(); } };
  const ku = e => { touches[e.code] = false; };
  window.addEventListener('keydown', kd, true); window.addEventListener('keyup', ku, true);
  const reg = { id: null, x: 0, y: 0 }, canvas = ctx.canvas;
  const pd = e => { if (e.target !== canvas) return; reg.id = e.pointerId; reg.x = e.clientX; reg.y = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* sans capture */ } };
  const pm = e => { if (e.pointerId !== reg.id) return; p.yaw -= (e.clientX - reg.x) * .0052; p.pitch = cl(p.pitch - (e.clientY - reg.y) * .0042, -1.2, 1.2); reg.x = e.clientX; reg.y = e.clientY; };
  const pu = e => { if (e.pointerId === reg.id) reg.id = null; };
  canvas.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu); window.addEventListener('pointercancel', pu);
  const roue = e => { e.preventDefault(); const a = -Math.sign(e.deltaY) * .6; p.vx += -Math.sin(p.yaw) * a * 4; p.vz += -Math.cos(p.yaw) * a * 4; }; canvas.addEventListener('wheel', roue, { passive: false });
  { let jid = null, j0 = null; const jd = e => { jid = e.pointerId; j0 = { x: e.clientX, y: e.clientY }; eJoy.setPointerCapture(e.pointerId); e.preventDefault(); }, jm = e => { if (e.pointerId !== jid) return; const dx = cl((e.clientX - j0.x) / 50, -1, 1), dy = cl((e.clientY - j0.y) / 50, -1, 1); joy.x = dx; joy.y = dy; eJoy.firstChild.style.transform = 'translate(' + dx * 30 + 'px,' + dy * 30 + 'px)'; }, ju = e => { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; eJoy.firstChild.style.transform = ''; }; eJoy.addEventListener('pointerdown', jd); eJoy.addEventListener('pointermove', jm); eJoy.addEventListener('pointerup', ju); eJoy.addEventListener('pointercancel', ju); }
  /* menu bas de l'écran */
  function majMenu() {
    const items = [], vus = new Set(); for (const pc of piecesDe()) { if (vus.has(pc.id) && pc.id !== 'batterie') continue; vus.add(pc.id); items.push({ id: 'p-' + pc.k + pc.id, texte: ({ pont: '⚓ Pont', cabine: '📜 Capitaine', batterie: '💣 ' + pc.nom, cuisine: '🍲 Cuisine', hamacs: '🛏 Hamacs', infirmerie: '🩺 Infirmerie', soute: '🛢 Poudre', cale: '📦 Cale' })[pc.id] || pc.nom, actif: niv().salles.some(s => s.id === pc.id) && pc.k === nivC, clic: () => aller(pc.id, pc.k) }); }
    items.push({ id: 'i-visite', texte: '🗣 Visite guidée', clic: () => visiter() }, { id: 'i-feu', texte: '💥 Bordée', clic: () => theme._.tirer(n) }, { id: 'i-sortir', texte: '🚪 Sortir', clic: () => sortir() }); hud.sousMenu(items);
  }
  /* boucle */
  const dir = new T.Vector3(), lastFumeeT = { t: 0 };
  function majInt(dt, t) {
    if (!enCours) return; if (n.etat !== 'navigue') { hud.legende('Le navire sombre ! Retour à l’extérieur.', 6000); sortir(); return; }
    const nv = niv();
    // déplacement
    if (!p.trans) {
      const av = (touches.KeyW || touches.KeyZ || touches.ArrowUp ? 1 : 0) - (touches.KeyS || touches.ArrowDown ? 1 : 0) - joy.y, lat = (touches.KeyD ? 1 : 0) - (touches.KeyA || touches.KeyQ ? 1 : 0) + joy.x, vit = (touches.ShiftLeft || touches.ShiftRight ? 4.2 : 2.3);
      if (touches.ArrowLeft) p.yaw += dt * 1.6; if (touches.ArrowRight) p.yaw -= dt * 1.6;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw), tx = (fx * av + rx * lat) * vit, tz = (fz * av + rz * lat) * vit, k = Math.min(1, dt * 8);
      p.vx += (tx - p.vx) * k; p.vz += (tz - p.vz) * k; const [nx, nz] = limites(p.x + p.vx * dt, p.z + p.vz * dt); p.x = nx; p.z = nz; p.bob += Math.hypot(p.vx, p.vz) * dt * 2.2;
      p.y = nivC === 0 ? yDeck(p.z) : nv.sol;
    } else {
      const tr = p.trans; tr.t += dt / 1.0; const e = tr.t < 1 ? tr.t * tr.t * (3 - 2 * tr.t) : 1; p.x = tr.de.x + (tr.a.x - tr.de.x) * e; p.z = tr.de.z + (tr.a.z - tr.de.z) * e; p.y = tr.de.y + (tr.a.y - tr.de.y) * e + Math.sin(e * Math.PI) * .25;
      if (tr.t >= 1) { nivC = tr.dest; p.trans = null; visibilites(); eNom.textContent = plan.niveaux[nivC].nom; majMenu(); }
    }
    // caméra (enfant du groupe du navire : suit roulis et tangage)
    const r = niveaux[nivC], sec = secousse > .01 ? secousse : 0; secousse *= Math.pow(.02, dt);
    camera.position.set(p.x + (Math.random() - .5) * sec * .5, p.y + oeil() + Math.sin(p.bob) * .035 + (Math.random() - .5) * sec * .4, p.z + (Math.random() - .5) * sec * .5);
    camera.rotation.set(p.pitch + (Math.random() - .5) * sec * .08, p.yaw + (Math.random() - .5) * sec * .06, 0, 'YXZ'); camera.near = .08;
    // lumières
    const sous = nivC > 0; amb.intensity = sous ? .85 : 0; lampe.intensity = sous ? 2.2 : 0; lampe.position.copy(camera.position).add(dir.set(0, -.45, 0));
    if (sous) { for (const c of scene.children) if (c.isLight) { if (!lumOrig.has(c)) lumOrig.set(c, c.intensity); c.intensity = 0; } scene.fog.density = 0.004; scene.fog.color.setRGB(.05, .035, .02); } else { amb.intensity = 0; }
    const ce = theme._.ciel && theme._.ciel.etat && theme._.ciel.etat.couleurs; if (ce) { const j = Math.max(.08, theme._.meteo().jour != null ? theme._.meteo().jour : 1); matFen.color.setRGB(Math.min(1, ce.horizon[0] * 1.4 + .1) * (.35 + .65 * j), Math.min(1, ce.horizon[1] * 1.4 + .1) * (.35 + .65 * j), Math.min(1, ce.horizon[2] * 1.4 + .2) * (.35 + .65 * j)); }
    // combat
    const combat = n.mode !== 'patrouille' ? 1 : 0, frac = n.pv / n.pvMax;
    for (const cote of [1, -1]) { if (n.recharge[cote] > recPrec[cote] + .5) volee(cote); recPrec[cote] = n.recharge[cote]; }
    if (n.pv < pvPrec - 1) { secousse = Math.min(1.4, secousse + .5 + (pvPrec - n.pv) / n.pvMax * 6); son && son.craque && son.craque(); if (sous) for (let i = 0; i < 6; i++) puff(p.x + (Math.random() - .5) * 3, p.y + 1.8, p.z + (Math.random() - .5) * 3, 0, -.2, 0, .6); } pvPrec = n.pv;
    if (combat || frac < .7) { tCri -= dt; if (tCri < 0) { tCri = 1.5 + Math.random() * 3.5; if (sous && son) son.cri(); } }
    tCraque -= dt; if (tCraque < 0) { tCraque = 6 + Math.random() * 10; if (sous && son && Math.random() < .6) son.craque(); }
    for (const kk of [nivC - 1, nivC, nivC + 1]) { const rr = niveaux[kk]; if (!rr) continue;
      for (const fl of rr.foules) fl.maj(t, combat); if (rr.blessesFoule) rr.blessesFoule.perte(Math.max(.25, 1 - (1 - frac) * 1.1));
      if (rr.canons && rr.canons.im) majCanons(rr, dt);
      if (rr.eau) rr.eau.position.y = plan.niveaux[kk].sol + .08 + Math.sin(t * 1.3) * .03; }
    for (const sp of fumees) { const d = sp.userData; if (d.vie <= 0) { sp.visible = false; continue; } d.vie -= dt / 7; sp.position.addScaledVector(d.v, dt); d.v.multiplyScalar(1 - dt * .3); sp.scale.setScalar(d.t0 * (1 + (1 - d.vie) * 3.2)); sp.material.opacity = Math.min(.5, d.vie * .6) * (sous ? 1 : 0); }
    flash.intensity *= Math.pow(.0005, dt);
    // boutons d'échelle
    const l = sous || nivC === 0 ? pres() : []; const cle = l.map(x => (x.haut ? 'h' : 'b') + x.c).join(); if (eAct.dataset.cle !== cle) { eAct.dataset.cle = cle; eAct.textContent = ''; for (const x of l) { const b = document.createElement('button'); b.type = 'button'; b.className = 'univ-b'; b.textContent = x.haut ? '⬆ Monter (E)' : '⬇ Descendre (E)'; b.addEventListener('click', () => changer(x.c, x.haut)); eAct.appendChild(b); } }
    const nom = nivC === 0 ? 'Pont supérieur' : (nv.salles.map(s => { const rr = niveaux[nivC]; const sp = rr && rr.salles.find(x => x.id === s.id); return sp && p.z <= sp.z0 + .3 && p.z >= sp.z1 - .3 ? s.nom : null; }).find(Boolean) || nv.nom); if (eNom.textContent !== nom) { eNom.textContent = nom; const sId = nv.salles.find(s => s.nom === nom); if (sId && TEXTES[sId.id] && sId.id !== (majInt.derniere || '')) { majInt.derniere = sId.id; hud.legende(TEXTES[sId.id][0], 9000); } }
    void r; void lastFumeeT;
  }
  function volee(cote) {
    for (const kk of [nivC - 1, nivC, nivC + 1]) { const r = niveaux[kk]; if (!r || !r.canons) continue; for (const it of r.canons.items) if (it.sg === cote && it.delai < 0) it.delai = Math.random() * 1.6; }
    secousse = Math.min(1.2, secousse + .35);
  }
  function majCanons(r, dt) {
    const c = r.canons, im = c.im, sol = c.sol, M = new T.Matrix4(), Qr = new T.Quaternion(), ax = new T.Vector3(0, 1, 0); let chg = false;
    c.items.forEach((it, i) => {
      if (it.delai >= 0) { it.delai -= dt; if (it.delai < 0) { it.t = 0; it.delai = -1; const sous = nivC > 0 && Math.abs(plan.niveaux.indexOf(plan.niveaux[r.k]) - nivC) <= 1;
        if (sous) { const px = it.sg * (it.wp - .4), py = sol + .95, pz = it.z; puff(px, py, pz, it.sg * 1.2, .25, 0, 1.4); puff(px - it.sg * 1.3, py + .1, pz, it.sg * .6, .3, (Math.random() - .5) * .5, 1.9); puff(px - it.sg * 2.2, py, pz, 0, .2, (Math.random() - .5) * .4, 1.6); flash.position.set(px - it.sg * .5, py + .3, pz); flash.intensity = 120; secousse = Math.min(1.2, secousse + .1); } }
      }
      if (it.t < 3) { it.t += dt; const a = it.t; it.recul = a < .09 ? a / .09 : Math.max(0, 1 - (a - .09) / 2.4); chg = true; if (it.t >= 3) it.recul = 0; const rr = it.recul * 1.05;
        Qr.setFromAxisAngle(ax, it.sg > 0 ? 0 : Math.PI); M.compose(new T.Vector3(it.x - it.sg * rr, sol, it.z), Qr, new T.Vector3(1, 1, 1)); im.setMatrixAt(i, M); }
    });
    if (chg) im.instanceMatrix.needsUpdate = true;
  }
  /* visite guidée */
  const ORDRE = ['pont', 'cabine', 'batterie', 'cuisine', 'hamacs', 'infirmerie', 'soute', 'cale']; let visite = 0;
  async function visiter() {
    const Pt = window.RayleUniversPont || {}, id = Pt.epoque ? Pt.epoque() : 0, ma = ++visite; const tous = ORDRE.filter(i => salleDe(i));
    for (const i of tous) { if (!enCours || ma !== visite) return { ok: true, texte: 'Visite interrompue.' }; await aller(i);
      for (const ph of TEXTES[i]) { hud.legende(ph, 13000); if (Pt.dire) { if ((await Pt.dire(ph)) === false || (Pt.epoque && Pt.epoque() !== id)) return { ok: true, texte: 'Visite interrompue.' }; } else await noyau.attendre(Math.min(9, 2 + ph.length / 38)); if (!enCours || ma !== visite) return { ok: true, texte: 'Visite interrompue.' }; } }
    return { ok: true, texte: 'Fin de la visite du ' + type.nom + '.' };
  }
  /* sortie */
  const majTheme = theme.maj; theme.maj = (dt, t) => { majTheme(dt, t); try { majInt(dt, t); } catch (e) { console.warn('[interieur]', e); } };
  async function sortir() {
    if (!enCours) return; enCours = false; visite++; await (noyau.fondu ? noyau.fondu(true) : 0);
    theme.maj = majTheme; theme.dedans = null; window.removeEventListener('keydown', kd, true); window.removeEventListener('keyup', ku, true); canvas.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); window.removeEventListener('pointercancel', pu); canvas.removeEventListener('wheel', roue);
    cacherExterieur(false); racine.remove(salle); for (const r of niveaux) if (r) r.balayer(); for (const sp of fumees) sp.material.dispose(); tf.dispose(); matFen.dispose(); tx.carte.dispose(); amb.dispose(); lampe.dispose(); flash.dispose();
    scene.attach(camera); if (etiq) etiq.style.visibility = ''; camera.near = .3; camera.position.set(n.x + 42, n.y + 20, n.z + 64); ctrl.c.target.set(n.x, 8, n.z); camera.lookAt(ctrl.c.target); camera.updateProjectionMatrix(); ctrl.c.enabled = true; ctrl.c.update(); ui.remove();
    theme._.reglerMode('suivre'); theme.menu && hud.sousMenu(theme.menu()); noyau.fondu && noyau.fondu(false); hud.legende('Retour à l’extérieur.', 3000);
  }
  /* départ */
  racine.add(camera); ctrl.c.enabled = false; camera.near = .08; camera.updateProjectionMatrix();
  theme.dedans = { aller, sortir, visiter, salles: piecesDe, etat: () => ({ niveau: nivC, x: p.x, z: p.z, y: p.y, yaw: p.yaw, secousse }), pousser: (x, z, yaw) => { Object.assign(p, { x, z }); if (yaw != null) p.yaw = yaw; }, monter: () => { const l = pres(); if (l.length) changer(l[0].c, l[0].haut); return l.length; }, resume: () => ({ ok: true, texte: 'Vous êtes dans ' + eNom.textContent + '.' }) };
  const depart = o.piece ? (salleDe(o.piece) || salleDe('pont')) : salleDe('pont');
  placer(depart.k, depart.s); eNom.textContent = depart.s.nom; majMenu(); noyau.fondu && noyau.fondu(false);
  hud.carte && hud.carte(null); hud.legende('Visite du ' + type.nom + ' (' + n.nom + ') — ' + (tactile ? 'joystick pour marcher' : 'ZQSD pour marcher, souris pour regarder') + '. Descends par l’échelle (E).', 9000);
  return { ok: true, texte: 'Vous montez à bord ' + ({ voilier: 'du voilier', brick: 'du brick', fregate: 'de la frégate', vaisseau: 'du vaisseau de ligne' }[type.id] || 'du navire') + ' ' + n.nom + '. Marchez sur le pont, puis descendez par l’échelle jusqu’aux batteries, à la cuisine, aux hamacs, à l’infirmerie, à la soute à poudre et à la cale.', sortir, aller, visiter, salles: piecesDe };
}
