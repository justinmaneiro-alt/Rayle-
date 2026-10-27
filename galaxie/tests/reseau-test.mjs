// Tests du nuage de neurones. Lancer :  node galaxie/tests/reseau-test.mjs
import { genererReseau, aretesPour, NB_NEURONES_MAX, COUCHES } from '../reseau.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };

const t0 = Date.now();
const R = genererReseau();
const ms = Date.now() - t0;
console.log(`   ${R.N} neurones, ${R.aretes.length} connexions, ${R.filaments} filaments, généré en ${ms} ms`);

v('milliers de neurones', R.N === NB_NEURONES_MAX && R.N >= 10000);
v('au moins une connexion par neurone en moyenne', R.aretes.length >= R.N * 1.2, String(R.aretes.length));
v('génération rapide (< 3 s)', ms < 3000, ms + ' ms');
v('positions finies', R.pos.every(Number.isFinite) && R.poids.every(Number.isFinite));
v('poids bornés', Math.min(...R.poids) > 0 && Math.max(...R.poids) <= 1.8);

// Déterminisme : le même nuage à chaque lancement
const R2 = genererReseau();
v('déterministe', R2.aretes.length === R.aretes.length && R2.pos[300] === R.pos[300] && R2.pos[R.N * 3 - 1] === R.pos[R.N * 3 - 1]);
v('graine différente : autre nuage', genererReseau(2000, 99).pos[30] !== genererReseau(2000, 11).pos[30]);

// Forme : irrégulière, pas une sphère
const rayons = []; for (let i = 0; i < R.N; i++) rayons.push(Math.hypot(R.pos[i * 3], R.pos[i * 3 + 1], R.pos[i * 3 + 2]));
const moy = rayons.reduce((a, b) => a + b, 0) / R.N, sigma = Math.sqrt(rayons.reduce((a, b) => a + (b - moy) ** 2, 0) / R.N);
v('étendue plausible (rayon moyen 0,3 à 1,0)', moy > 0.3 && moy < 1.0, moy.toFixed(2));
v('épaisseur radiale variée (pas une coque)', sigma / moy > 0.35, (sigma / moy).toFixed(2));
const ext = [0, 1, 2].map(a => { let mn = 1e9, mx = -1e9; for (let i = 0; i < R.N; i++) { const x = R.pos[i * 3 + a]; mn = Math.min(mn, x); mx = Math.max(mx, x); } return mx - mn; });
v('forme non sphérique (axes inégaux)', Math.max(...ext) / Math.min(...ext) > 1.2, ext.map(x => x.toFixed(2)).join(' / '));
let proche = 0, loin = 0; for (const r of rayons) { if (r < 0.3) proche++; else if (r > 0.9 && r < 1.4) loin++; }
const densCoeur = proche / (0.3 ** 3), densBord = loin / (1.4 ** 3 - 0.9 ** 3);
v('cœur bien plus dense (par unité de volume) que la périphérie', densCoeur > densBord * 4, `${Math.round(densCoeur)} vs ${Math.round(densBord)} par unité de volume`);
let poidsCoeur = 0, nc = 0, poidsBord = 0, nb = 0; rayons.forEach((r, i) => { if (r < 0.25) { poidsCoeur += R.poids[i]; nc++; } else if (r > 0.9) { poidsBord += R.poids[i]; nb++; } });
v('le cœur est plus brillant', poidsCoeur / nc > (poidsBord / Math.max(1, nb)) * 1.5, (poidsCoeur / nc).toFixed(2) + ' vs ' + (poidsBord / Math.max(1, nb)).toFixed(2));

// Connexions
v('indices valides, aucune boucle', R.aretes.every(e => e.a >= 0 && e.b >= 0 && e.a < R.N && e.b < R.N && e.a !== e.b));
const paires = new Set(R.aretes.map(e => (e.a < e.b ? e.a * R.N + e.b : e.b * R.N + e.a)));
v('aucune connexion en double', paires.size === R.aretes.length);
const longueurs = R.aretes.map(e => Math.hypot(R.pos[e.a * 3] - R.pos[e.b * 3], R.pos[e.a * 3 + 1] - R.pos[e.b * 3 + 1], R.pos[e.a * 3 + 2] - R.pos[e.b * 3 + 2])).sort((a, b) => a - b);
v('connexions courtes (fines et locales)', longueurs[Math.floor(longueurs.length * 0.99)] < 0.2, longueurs[Math.floor(longueurs.length * 0.99)].toFixed(3));
v('coordonnées le long des filaments dans [0,1]', R.aretes.every(e => e.u0 >= 0 && e.u1 <= 1 && e.u1 > e.u0));
v('filaments longs (ramifications) et liens isolés présents', R.aretes.filter(e => e.long > 5).length > 500 && R.aretes.filter(e => e.long === 1).length > 500, `${R.aretes.filter(e => e.long > 5).length} / ${R.aretes.filter(e => e.long === 1).length}`);
let degre = new Uint16Array(R.N); for (const e of R.aretes) { degre[e.a]++; degre[e.b]++; }
const isoles = degre.filter(d => d === 0).length;
v('très peu de neurones isolés (< 12 %)', isoles / R.N < 0.12, (isoles / R.N * 100).toFixed(1) + ' %');

// Sous-ensembles (qualité réduite)
v('préfixe : arêtes triées par plus grand indice', R.maxParArete.every((x, i) => i === 0 || x >= R.maxParArete[i - 1]));
for (const k of [1250, 2500, 7000, R.N]) {
  const m = aretesPour(R, k);
  const valides = R.aretes.slice(0, m).every(e => e.a < k && e.b < k);
  const complet = R.aretes.slice(m).every(e => e.a >= k || e.b >= k);
  v(`sous-ensemble de ${k} neurones : ${m} connexions, toutes valides et complètes`, valides && complet);
}
v('le sous-ensemble reste réparti partout (pas seulement le cœur)', (() => { let n = 0, loin = 0; for (let i = 0; i < 2500; i++) { n++; if (Math.hypot(R.pos[i * 3], R.pos[i * 3 + 1], R.pos[i * 3 + 2]) > 0.7) loin++; } return loin / n > 0.1; })());
v('2500 neurones gardent des connexions', aretesPour(R, 2500) > 500, String(aretesPour(R, 2500)));

// Structure de l’entité : couches concentriques, contour polygonal, densité décroissante, neurones « hubs »
v('trois couches concentriques (cages de sommets)', R.sommets.length === 3 && R.sommets.every((s, i) => s === COUCHES[i].V), JSON.stringify(R.sommets));
const cage = R.aretes.filter(e => e.tipe === 2);
v('filaments droits des couches (contour presque polygonal) : plus de 1 500 liens', cage.length > 1500, String(cage.length));
v('les trois types de liens existent (couche, ramification, voisinage)', [0, 1, 2].every(t => R.aretes.some(e => e.tipe === t)));
const tranches = [[0, 0.25], [0.25, 0.5], [0.5, 0.8], [0.8, 1.1]].map(([a, b]) => { let c = 0; for (const r of rayons) if (r >= a && r < b) c++; return c / ((b ** 3 - a ** 3) * 4 / 3 * Math.PI); });
v('densité par volume strictement décroissante du cœur vers l’extérieur', tranches.every((d, i) => i === 0 || d < tranches[i - 1]), tranches.map(d => Math.round(d)).join(' > '));
const nbHubs = R.hub.reduce((s, x) => s + x, 0);
v('neurones « hubs » (gros et blancs) : 4 à 10 % des neurones', nbHubs / R.N > 0.04 && nbHubs / R.N < 0.10, (nbHubs / R.N * 100).toFixed(1) + ' %');
let loin2 = 0; for (const r of rayons) if (r > 1.25) loin2++;
v('le contour reste net : presque rien au-delà de 1,6 du centre', rayons.filter(r => r > 1.6).length / R.N < 0.005);
const m = R.aretes.length / R.N;
v('très fins fils : 1 à 2 connexions par neurone en moyenne', m > 1 && m < 2.2, m.toFixed(2));

console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
