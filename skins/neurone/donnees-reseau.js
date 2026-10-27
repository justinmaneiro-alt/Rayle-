import { generateur } from '../../galaxie/reseau.js';

/* ═════════════ DONNÉES DE RENDU DE L'ENTITÉ (module pur, partagé par la galaxie et l'accueil) ═════════════
   À partir du réseau généré (galaxie/reseau.js), construit les tableaux de sommets des neurones (points) et des connexions (segments),
   y compris les attributs qui pilotent les impulsions le long des fils. Même ordre de tirages aléatoires qu'à l'origine : le même nuage partout. */
export function preparerDonnees(reseau) {
  const rand = generateur(5);
  const graine = new Float32Array(reseau.N); for (let i = 0; i < reseau.N; i++) graine[i] = rand();
  const E = reseau.aretes.length;
  const pL = new Float32Array(E * 6), aU = new Float32Array(E * 2), aPh = new Float32Array(E * 2), aV = new Float32Array(E * 2), aW = new Float32Array(E * 2), aGr = new Float32Array(E * 2), aRad = new Float32Array(E * 2);
  const chainePh = new Map(), chaineV = new Map();
  reseau.aretes.forEach((e, i) => {
    if (!chainePh.has(e.chaine)) { chainePh.set(e.chaine, rand()); chaineV.set(e.chaine, 0.09 + rand() * 0.16); }
    const ph = chainePh.get(e.chaine), v = chaineV.get(e.chaine), gr = (graine[e.a] + graine[e.b]) / 2;
    const larg = e.long > 1 ? 900 : 60;   // impulsion étroite sur un filament long, plus large sur un lien isolé
    for (let k = 0; k < 2; k++) {
      const n = k === 0 ? e.a : e.b;
      pL[i * 6 + k * 3] = reseau.pos[n * 3]; pL[i * 6 + k * 3 + 1] = reseau.pos[n * 3 + 1]; pL[i * 6 + k * 3 + 2] = reseau.pos[n * 3 + 2];
      aU[i * 2 + k] = k === 0 ? e.u0 : e.u1; aPh[i * 2 + k] = ph; aV[i * 2 + k] = v; aW[i * 2 + k] = larg; aGr[i * 2 + k] = gr;
      aRad[i * 2 + k] = (0.5 + 0.7 * Math.exp(-Math.hypot(reseau.pos[n * 3], reseau.pos[n * 3 + 1], reseau.pos[n * 3 + 2]) * 2.2)) * (e.tipe === 2 ? 1.9 : e.tipe === 1 ? 0.8 : 0.65);   // les filaments des couches ressortent
    }
  });
  return { N: reseau.N, E, graine, pL, aU, aPh, aV, aW, aGr, aRad };
}
