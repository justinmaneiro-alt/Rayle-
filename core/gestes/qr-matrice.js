"use strict";
// Mini générateur de QR code (aucune dépendance, utilisable dans la page ET dans Node : window.QrMatrice / require) : mode octets, correction d'erreur L, versions 1 à 9 (jusqu'à 230 octets ; V3 phase 4 : le QR de la caméra du téléphone porte une adresse HTTPS + un jeton).
// Sert seulement à afficher l'adresse du clavier d'essai (K1). Rendu en demi-blocs : modules clairs en « █ », sombres en espace (terminal sombre).
(function (racine) {
const CAP = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232];   // octets de données par version (niveau L)
const ECC = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30];         // octets de correction PAR BLOC
const BLOCS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2];               // nombre de blocs (tous de même taille de 1 à 9)
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]];   // centres des motifs d'alignement

// Corps de Galois GF(256), polynôme 0x11d
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function reedSolomon(donnees, n) {
  let gen = [1];
  for (let i = 0; i < n; i++) {
    const suite = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { suite[j] ^= c; suite[j + 1] ^= mul(c, EXP[i]); });
    gen = suite;
  }
  const reste = new Array(n).fill(0);
  for (const d of donnees) {
    const f = d ^ reste.shift(); reste.push(0);
    for (let j = 0; j < n; j++) reste[j] ^= mul(gen[j + 1], f);
  }
  return reste;
}

const MASQUES = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
];

function matriceQR(texte) {
  const octets = Array.from(new TextEncoder().encode(String(texte)));
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(k => octets.length + 2 <= CAP[k]);
  if (!v) throw new Error('texte trop long pour le QR code (' + octets.length + ' octets)');
  const bits = [];
  const pousser = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  pousser(4, 4); pousser(octets.length, 8); octets.forEach(o => pousser(o, 8));
  pousser(0, Math.min(4, CAP[v] * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const mots = [];
  for (let i = 0; i < bits.length; i += 8) mots.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; mots.length < CAP[v]; p++) mots.push(p % 2 ? 0x11 : 0xec);
  const taille = CAP[v] / BLOCS[v], blocs = [], eccs = [];
  for (let b = 0; b < BLOCS[v]; b++) { const d = mots.slice(b * taille, (b + 1) * taille); blocs.push(d); eccs.push(reedSolomon(d, ECC[v])); }
  const tout = [];
  for (let i = 0; i < taille; i++) for (const d of blocs) tout.push(d[i]);
  for (let i = 0; i < ECC[v]; i++) for (const e of eccs) tout.push(e[i]);

  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const fonc = Array.from({ length: n }, () => new Array(n).fill(false));
  const poser = (x, y, val) => { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = val; fonc[y][x] = true; } };
  const viseur = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); poser(cx + dx, cy + dy, d !== 2 && d !== 4); } };
  viseur(3, 3); viseur(n - 4, 3); viseur(3, n - 4);
  for (let i = 8; i < n - 8; i++) { poser(6, i, i % 2 === 0); poser(i, 6, i % 2 === 0); }
  if (v >= 2) { const c = ALIGN[v], dernier = c.length - 1; for (let a = 0; a < c.length; a++) for (let b = 0; b < c.length; b++) { if ((a === 0 && b === 0) || (a === 0 && b === dernier) || (a === dernier && b === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(c[b] + dx, c[a] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); } }
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const info = (v << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((info >>> i) & 1) === 1, a = Math.floor(i / 3), b = i % 3 + n - 11; poser(b, a, bit); poser(a, b, bit); } }
  const reserve = () => { for (let i = 0; i < 9; i++) { poser(8, i, false); poser(i, 8, false); } for (let i = 0; i < 8; i++) { poser(n - 1 - i, 8, false); poser(8, n - 1 - i, false); } };
  reserve();

  let k = 0;
  for (let droite = n - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = droite - j, y = ((droite + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!fonc[y][x] && k < tout.length * 8) { m[y][x] = ((tout[k >> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }

  const formatBits = masque => {
    const data = (1 << 3) | masque; let r = data;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    return ((data << 10) | r) ^ 0x5412;
  };
  const dessiner = (masque) => {
    const c = m.map(l => l.slice());
    const set = (x, y, val) => { c[y][x] = val; };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fonc[y][x] && MASQUES[masque](x, y)) c[y][x] = !c[y][x];
    const b = formatBits(masque), bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
    return c;
  };
  const penalite = c => {
    let p = 0;
    for (let sens = 0; sens < 2; sens++) for (let a = 0; a < n; a++) {
      let serie = 1, hist = '';
      for (let b = 0; b < n; b++) {
        const cur = sens ? c[b][a] : c[a][b];
        hist += cur ? '1' : '0';
        if (b > 0 && cur === (sens ? c[b - 1][a] : c[a][b - 1])) { serie++; if (serie === 5) p += 3; else if (serie > 5) p++; } else serie = 1;
      }
      for (const motif of ['10111010000', '00001011101']) { let i = -1; while ((i = hist.indexOf(motif, i + 1)) >= 0) p += 40; }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (c[y][x] === c[y][x + 1] && c[y][x] === c[y + 1][x] && c[y][x] === c[y + 1][x + 1]) p += 3;
    const noirs = c.flat().filter(Boolean).length;
    return p + 10 * Math.floor(Math.abs(noirs * 20 - n * n * 10) / (n * n));
  };
  let meilleur = null, mp = Infinity;
  for (let q = 0; q < 8; q++) { const c = dessiner(q), p = penalite(c); if (p < mp) { mp = p; meilleur = c; } }
  return meilleur;
}
  racine.QrMatrice = { matriceQR };
  if (typeof module !== 'undefined' && module.exports) module.exports = { matriceQR };
})(typeof globalThis !== 'undefined' ? globalThis : window);
