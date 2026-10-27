// Tests des astéroïdes (formes et répartition). Lancer :  node galaxie/tests/asteroides-test.mjs
import { TYPES, FINESSES, CLASSES_COULEUR, construireForme, repartirCeinture, etatAsteroide, icosphere } from '../asteroides-formes.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };
const stat = (tab) => { const m = tab.reduce((a, b) => a + b, 0) / tab.length; return { moy: m, sigma: Math.sqrt(tab.reduce((a, b) => a + (b - m) ** 2, 0) / tab.length) }; };

// Icosphère
for (const [n, f] of [[0, 20], [1, 80], [2, 320], [3, 1280], [4, 5120]]) v(`icosphère ${n} : ${f} triangles`, icosphere(n).faces.length === f);
v('finesse maximale : moins de 65 000 sommets (index 16 bits)', icosphere(Math.max(...Object.values(FINESSES).flat())).sommets.length < 65000);

// Modèles : ni sphères, ni dégénérés
const formes = {};
for (const t of TYPES) {
  const f = construireForme(t, 4, 3 + TYPES.indexOf(t)); formes[t] = f;
  const rayons = []; for (let i = 0; i < f.sommets; i++) rayons.push(Math.hypot(f.pos[i * 3], f.pos[i * 3 + 1], f.pos[i * 3 + 2]));
  const { moy, sigma } = stat(rayons);
  v(`${t} : valeurs finies, normales unitaires`, f.pos.every(Number.isFinite) && f.nor.every(Number.isFinite) && (() => { for (let i = 0; i < f.sommets; i += 37) { const l = Math.hypot(f.nor[i * 3], f.nor[i * 3 + 1], f.nor[i * 3 + 2]); if (Math.abs(l - 1) > 0.01) return false; } return true; })());
  v(`${t} : pas une sphère (rayon varie de plus de 12 %)`, sigma / moy > 0.12, (sigma / moy).toFixed(2));
  v(`${t} : taille raisonnable (rayon moyen 0,5 à 1,5)`, moy > 0.5 && moy < 1.5, moy.toFixed(2));
}
const etendue = f => [0, 1, 2].map(a => { let mn = 1e9, mx = -1e9; for (let i = 0; i < f.sommets; i++) { mn = Math.min(mn, f.pos[i * 3 + a]); mx = Math.max(mx, f.pos[i * 3 + a]); } return mx - mn; });
const eAl = etendue(formes.allonge).sort((a, b) => b - a), eAp = etendue(formes.aplati).sort((a, b) => b - a);
v('allongé : au moins 2,2 fois plus long que large', eAl[0] / eAl[2] > 2.2, (eAl[0] / eAl[2]).toFixed(2));
v('aplati : au moins 2 fois plus large qu’épais', eAp[0] / eAp[2] > 2, (eAp[0] / eAp[2]).toFixed(2));
// fragment : beaucoup de facettes planes (normales proches entre voisins) ; cratères : cuvettes (rayon inférieur à la moyenne locale)
const rayonMin = f => { let m = 1e9; for (let i = 0; i < f.sommets; i++) m = Math.min(m, Math.hypot(f.pos[i * 3], f.pos[i * 3 + 1], f.pos[i * 3 + 2])); return m; };
v('cratères : des cuvettes nettes (rayon minimal < 0,75 × moyen)', rayonMin(formes.crateres) < 0.75 * stat(Array.from({ length: formes.crateres.sommets }, (_, i) => Math.hypot(formes.crateres.pos[i * 3], formes.crateres.pos[i * 3 + 1], formes.crateres.pos[i * 3 + 2]))).moy);
let plan = 0, tot = 0; const F = formes.fragment;
for (let i = 0; i < F.index.length; i += 3) { const a = F.index[i], b = F.index[i + 1], c = F.index[i + 2]; const d = (k, l) => F.nor[k * 3] * F.nor[l * 3] + F.nor[k * 3 + 1] * F.nor[l * 3 + 1] + F.nor[k * 3 + 2] * F.nor[l * 3 + 2]; tot++; if (d(a, b) > 0.999 && d(b, c) > 0.999) plan++; }
v('fragment : de grandes faces planes (au moins 15 % des triangles)', plan / tot > 0.15, (plan / tot * 100).toFixed(0) + ' %');
v('les cinq modèles sont tous différents', new Set(TYPES.map(t => Array.from(formes[t].pos.slice(0, 60)).map(x => x.toFixed(2)).join())).size === 5);
v('déterministe', JSON.stringify(Array.from(construireForme('patate', 2, 3).pos.slice(0, 20))) === JSON.stringify(Array.from(construireForme('patate', 2, 3).pos.slice(0, 20))));
v('graine différente : autre caillou', construireForme('patate', 2, 3).pos[7] !== construireForme('patate', 2, 9).pos[7]);

// Finesses : la qualité basse est bien plus légère
const tris = n => FINESSES[n].map(s => icosphere(s).faces.length);
v('qualité basse : modèles plus simples que haute, sur les trois tailles', tris('basse').every((t, i) => t < tris('haute')[i]) && tris('moyenne').every((t, i) => t <= tris('haute')[i]), `${tris('haute')} / ${tris('moyenne')} / ${tris('basse')}`);

// Répartition
const N = 3000, a = repartirCeinture(N, 57, 66);
const tailles = Array.from(a.taille).sort((x, y) => x - y);
v('beaucoup de petits : médiane < 0,07', tailles[N >> 1] < 0.07, tailles[N >> 1].toFixed(3));
v('quelques gros : au moins 40 de taille > 0,15, mais moins de 10 %', tailles.filter(t => t > 0.15).length >= 40 && tailles.filter(t => t > 0.15).length < N * 0.10, String(tailles.filter(t => t > 0.15).length));
v('plus gros : < 0,5 ; plus petit > 0,04', tailles[N - 1] < 0.5 && tailles[0] > 0.04, `${tailles[0].toFixed(3)} … ${tailles[N - 1].toFixed(3)}`);
v('rapport de tailles très étendu (> 6)', tailles[N - 1] / tailles[0] > 6, (tailles[N - 1] / tailles[0]).toFixed(1));
const rep = Array.from({ length: 5 }, (_, c) => Array.from(a.classe).filter(x => x === c).length);
v('couleurs : gris, brun, ocre, noir carbone et métal tous présents', rep.every(n => n > 0), CLASSES_COULEUR.map((c, i) => c + ' ' + rep[i]).join(', '));
v('métalliques : quelques-uns seulement (2 à 10 %)', rep[4] / N > 0.02 && rep[4] / N < 0.1, (rep[4] / N * 100).toFixed(1) + ' %');
v('couleurs variées (écart-type de luminosité > 0,08)', stat(Array.from({ length: N }, (_, i) => (a.teinte[i * 3] + a.teinte[i * 3 + 1] + a.teinte[i * 3 + 2]) / 3)).sigma > 0.08);
v('les cinq modèles servent tous', TYPES.every((_, t) => Array.from(a.type).filter(x => x === t).length > N * 0.1));
v('trois finesses : petits majoritaires, moyens, quelques gros détaillés', (() => { const c = [0, 1, 2].map(l => Array.from(a.lod).filter(x => x === l).length); return c[0] > N * 0.7 && c[1] > N * 0.1 && c[2] >= N * 0.03 && c[2] < N * 0.06; })());
v('tous dans la ceinture (57 à 66, à 3 % près d’excentricité)', Array.from(a.r0).every(r => r >= 55 && r <= 68));
v('orbites légèrement excentriques (0 à 5 %), pas toutes circulaires', Math.max(...a.exc) < 0.05 && stat(Array.from(a.exc)).moy > 0.01);
v('rotations lentes et variées : vitesse entre 0,02 et 0,6 rad/s, deux sens', Array.from(a.vitRot).every(x => Math.abs(x) >= 0.029 && Math.abs(x) <= 0.54) && a.vitRot.some(x => x > 0) && a.vitRot.some(x => x < 0));
v('axes de rotation unitaires et variés', Array.from({ length: N }, (_, i) => Math.hypot(a.axe[i * 3], a.axe[i * 3 + 1], a.axe[i * 3 + 2])).every(l => Math.abs(l - 1) < 1e-3) && stat(Array.from({ length: N }, (_, i) => a.axe[i * 3])).sigma > 0.4);
v('les plus proches du soleil vont plus vite (loi de Kepler)', (() => { const i = Array.from(a.r0).findIndex(r => r < 59), j = Array.from(a.r0).findIndex(r => r > 64); return a.omega[i] > a.omega[j]; })());

// Mouvement : position et orientation changent avec le temps, sans dérive
const s0 = etatAsteroide(a, 5, 0, {}), s1 = etatAsteroide(a, 5, 100, {}), s2 = etatAsteroide(a, 5, 0, {});
v('orbite : l’astéroïde avance', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.01, Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(3));
v('rotation : l’orientation change', Math.abs(s1.qx - s0.qx) + Math.abs(s1.qy - s0.qy) + Math.abs(s1.qz - s0.qz) + Math.abs(s1.qw - s0.qw) > 0.01);
v('l’état est une fonction pure du temps', s0.x === s2.x && s0.qw === s2.qw);
v('quaternions unitaires', [0, 10, 1000].every(t => { const q = etatAsteroide(a, 9, t, {}); return Math.abs(Math.hypot(q.qx, q.qy, q.qz, q.qw) - 1) < 1e-4; }));
v('épaisseur de la ceinture raisonnable (|y| < 3)', Array.from({ length: N }, (_, i) => Math.abs(etatAsteroide(a, i, 500, {}).y)).every(y => y < 3));
v('déterminisme de la répartition', repartirCeinture(50, 57, 66).r0[10] === repartirCeinture(50, 57, 66).r0[10]);

console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
