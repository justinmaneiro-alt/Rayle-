/* Tests purs du nommage du mode Volume : plus aucune ligne ni zone sans nom lisible, placement sans chevauchement, légende. Usage : node trader-pro/tests/volume-noms-test.mjs */
import { nomLisible, nomZone, dessinerNomsVolume, LEGENDE_VOLUME, htmlLegendeVolume } from '../volume/noms.js';
import { construire } from '../volume/ict-affichage.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const textes = ['POC 3 571,62', 'POC', 'VAH', 'VAL', 'R×4', 'Mur 12,5 k', 'Rés. 3 640', 'Sup. 3 500', 'VWAP sem.', 'VWAP ancré', 'POC nu S', 'POC nu M', 'PDH', 'PDL', 'PWH', 'PWL', 'PMH', 'PML', 'Ouv. jour', 'Ouv. sem.', 'Ouv. mois', '50 %', 'EQH $$$', 'EQL $$$', 'FVG D', 'FVG W', 'OB D↑', 'OB W↓', 'Ligne', 'Boîte', 'Fib 0,618', '12,5 k', '1 250'];
for (const t of textes) { const n = nomLisible(t); v(n.length > t.length - 1 && n.length > 3 && !/sans nom/.test(n), `« ${t} » → « ${n} »`); }
v(/sans nom/.test(nomLisible('')) && nomLisible('Truc inconnu') === 'Truc inconnu', 'une étiquette vide est signalée, une inconnue garde son texte');
v(/Premium/.test(nomZone({ id: 'pd-haut' })) && /Discount/.test(nomZone({ id: 'pd-bas' })) && nomZone({ texte: 'OB D↑' }) === 'Order Block Daily haussier' && !/sans nom/.test(nomZone({ nom: 'x y' })), 'noms des zones : premium, discount, FVG / OB');
/* toutes les zones et lignes produites par ict-affichage ont un nom */
const J = 86400e3, T0 = Date.UTC(2026, 8, 1); let x = 3300, s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, B = [];
for (let i = 0; i < 90; i++) { const o = x; x += (rnd() - 0.5) * 40 + (i % 9 === 0 ? 55 : 0); B.push({ t: T0 + i * J, o, c: x, h: Math.max(o, x) + rnd() * 15, l: Math.min(o, x) - rnd() * 15, v: 1000 }); }
const A = construire(B, { PDH: true, PDL: true, PWH: true, PWL: true, OJ: true, pd: true, fvgJ: true, obJ: true, egaux: true, sweep: true }, { maintenant: T0 + 90 * J });
v(A.zones.length > 0 && A.zones.every(z => nomZone(z).length > 5 && !/sans nom/.test(nomZone(z))), `ict-affichage : ${A.zones.length} zones, toutes nommées`);
v(A.lignes.length > 0 && A.lignes.every(l => !/sans nom/.test(nomLisible(l.texte))), `ict-affichage : ${A.lignes.length} lignes, toutes nommées`);
/* dessin : pastilles sans chevauchement, 11 à 13 px */
function faux() { const L = [], c = { fillStyle: '', font: '', measureText: t => ({ width: String(t).length * 7 }), fillText: (t, x2, y, ) => L.push({ t, x: x2, y, f: c.font }), fillRect: (a, b, w, h) => L.push({ r: [a, b, w, h] }) }; c.L = L; return c; }
for (const ecran of [1600, 1024, 390]) {
  const ctx = faux(), lignes = A.lignes.map(l => ({ prix: l.prix, texte: l.texte })), pmin = Math.min(...B.map(b => b.l)), pmax = Math.max(...B.map(b => b.h)), yDe = p => 600 - 30 - ((p - pmin) / (pmax - pmin)) * 540;
  const R = dessinerNomsVolume(ctx, { W: 1000, H: 600, ecran, yDe, lignes, zones: A.zones, interdits: [{ x: 600, y: 200, w: 200, h: 120 }] });
  const rects = ctx.L.filter(e => e.r).map(e => e.r); let sans = true; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) sans = false; }
  v(sans && R.demandees > 0, `${ecran} px : ${R.placees} pastilles posées sur ${R.demandees}, aucun chevauchement`);
  v(ctx.L.filter(e => e.f).every(e => +e.f.match(/(\d+(\.\d+)?)px/)[1] >= (ecran >= 1100 ? 13 : ecran >= 700 ? 12 : 11)), `${ecran} px : texte de 13 / 12 / 11 px au moins`);
}
v(LEGENDE_VOLUME.length >= 8 && htmlLegendeVolume().includes('POC / VAH / VAL') && htmlLegendeVolume().includes('cyan'), 'légende du mode Volume : POC, réaction, VWAP, zones cyan / magenta, premium / discount, FVG / OB, chaleur, gros ordres, sessions');
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
