import { combinaisons, cleParams } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { evaluerVariante } from '../planetes/mars/pc/agent-btc/evaluation.js';
import { alea } from '../planetes/mars/pc/mars-calcul.js';
import { famille } from './familles-v3.js';

/* ═════════════ OPTIMISATION GUIDÉE (V6, phase 2 ; module pur, testé : galaxie/tests/optimisation-guidee-test.mjs) ═════════════
   Au lieu d'une grille aveugle, une petite RECHERCHE ÉVOLUTIVE (méthode de l'entropie croisée : on tire des paramètres, on garde l'élite, on retire autour d'elle) explore l'espace continu d'une famille et ne
   garde, pour la validation, qu'une PETITE grille (≤ 27 variantes) centrée sur les zones où l'espérance NETTE (après frais, spread, glissement) est positive.
   GARDES-FOUS contre la sur-optimisation :
   · la recherche n'utilise QUE le premier bloc d'entraînement du walk-forward (avant tout bloc de test) : aucune donnée de test, et jamais le jeu final, ne guide le choix ;
   · le score est une statistique de type « t » (espérance × √trades) avec un minimum de trades : un pic isolé sur peu de trades ne gagne pas ;
   · CHAQUE paramètre évalué compte comme une variante testée (le compteur, utilisé par le Sharpe déflaté, ne baisse jamais) : la liste complète est rendue dans `explorees` ;
   · graine fixe par ronde : résultat reproductible. Rien ici n'assouplit un critère : la grille résultante passe ensuite par la validation V3 complète (walk-forward, voisins, Monte Carlo, Sharpe déflaté…). */
const entier = valeurs => valeurs.every(x => Number.isInteger(x));
const bornes = valeurs => ({ min: Math.min(...valeurs), max: Math.max(...valeurs), entier: entier(valeurs) });
const arrondi = (x, b) => (b.entier ? Math.max(1, Math.round(x)) : +x.toFixed(3));

/* Espace de recherche d'une grille : les paramètres numériques deviennent des intervalles (élargis de 25 % de chaque côté, jamais négatifs), les autres des listes de choix. */
export function espaceDe(grille) {
  const esp = {};
  for (const [k, v] of Object.entries(grille)) {
    if (v.every(x => typeof x === 'number') && v.length > 1) { const b = bornes(v), marge = (b.max - b.min) * 0.25; esp[k] = { type: 'nombre', min: Math.max(b.min > 0 ? b.min * 0.5 : b.min - marge, b.min - marge), max: b.max + marge, entier: b.entier, origine: v.slice() }; }
    else esp[k] = { type: 'choix', valeurs: v.slice() };
  }
  return esp;
}
const tirer = (esp, a) => { const p = {}; for (const [k, e] of Object.entries(esp)) p[k] = e.type === 'nombre' ? arrondi(e.min + a() * (e.max - e.min), e) : e.valeurs[Math.floor(a() * e.valeurs.length)]; return p; };
function gauss(a) { const u = Math.max(1e-9, a()), w = a(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); }
/* Tire autour de l'élite : chaque paramètre numérique = valeur d'un élu choisi au hasard + bruit gaussien (écart-type = écart observé dans l'élite, plancher 5 % de l'intervalle) ; choix = valeur d'un élu, 25 % du temps au hasard. */
function tirerAutour(esp, elite, a) {
  const p = {};
  for (const [k, e] of Object.entries(esp)) {
    const base = elite[Math.floor(a() * elite.length)].params[k];
    if (e.type === 'nombre') { const vals = elite.map(x => x.params[k]), moy = vals.reduce((s, x) => s + x, 0) / vals.length, sd = Math.max(Math.sqrt(vals.reduce((s, x) => s + (x - moy) ** 2, 0) / vals.length), 0.05 * (e.max - e.min)); p[k] = arrondi(Math.min(e.max, Math.max(e.min, base + gauss(a) * sd)), e); }
    else p[k] = a() < 0.25 ? e.valeurs[Math.floor(a() * e.valeurs.length)] : base;
  }
  return p;
}

/* Recherche. `plage` = { de, a } : le bloc d'entraînement initial. Rend { evaluees: [{ params, n, esperance, score }], elite, grille (petite), explorees (tous les paramètres évalués), meilleur, iterations }. */
export function rechercheGuidee({ ctx, id, config = {}, plage, graine = 1, iterations = 4, population = 16, elite = 4, tradesMin = 20, grilleBase = null, surProgres = null, evaluateur = null }) {
  const fam = evaluateur ? null : famille(id); if (!fam && !evaluateur) throw new Error('famille inconnue : ' + id);
  const g0 = grilleBase || fam.grille(0), esp = espaceDe(g0), a = alea(graine * 7919 + 17), vus = new Map();
  const evaluer = p => {
    const cle = cleParams(p); if (vus.has(cle)) return vus.get(cle);
    const e = evaluateur ? { stats: evaluateur(p, plage) } : evaluerVariante(ctx, id, p, config, plage), st = e.stats, score = st.n >= tradesMin && st.esperance != null ? st.esperance * Math.sqrt(st.n) : -Infinity;
    const r = { params: p, n: st.n, esperance: st.esperance, score, cle }; vus.set(cle, r); return r;
  };
  // génération 0 : la grille d'origine (les valeurs que l'on testait déjà) + des tirages au hasard dans l'espace élargi
  const graines = combinaisons(g0).filter((_, i, l) => l.length <= population / 2 || i % Math.ceil(l.length / (population / 2)) === 0).slice(0, Math.floor(population / 2));
  let pop = [...graines, ...Array.from({ length: Math.max(population - graines.length, 4) }, () => tirer(esp, a))].map(evaluer), elus = [];
  for (let it = 0; it < iterations; it++) {
    elus = [...vus.values()].filter(x => x.score > -Infinity).sort((x, y) => y.score - x.score).slice(0, elite);
    if (surProgres) surProgres((it + 1) / (iterations + 1));
    if (elus.length < 2) { pop = Array.from({ length: population }, () => tirer(esp, a)).map(evaluer); continue; }          // rien de prometteur : on explore plus largement
    pop = Array.from({ length: population }, () => tirerAutour(esp, elus, a)).map(evaluer);
  }
  elus = [...vus.values()].filter(x => x.score > -Infinity).sort((x, y) => y.score - x.score).slice(0, elite);
  const positives = elus.filter(x => x.esperance > 0);
  return { evaluees: [...vus.values()], elite: elus, positives: positives.length, meilleur: elus[0] || null, grille: petiteGrille(g0, positives.length >= 2 ? positives : elus, esp), explorees: [...vus.values()].map(x => x.params), iterations, population };
}

/* Petite grille autour de l'élite : pour chaque paramètre, les valeurs distinctes de l'élite (au plus 3, la valeur du milieu comprise) ; au plus `max` combinaisons (on fige d'abord les paramètres qui varient le moins). */
export function petiteGrille(grilleBase, elite, esp = espaceDe(grilleBase), max = 27) {
  if (!elite.length) return grilleBase;
  const g = {};
  for (const k of Object.keys(grilleBase)) {
    const vals = [...new Set(elite.map(x => x.params[k]))].sort((x, y) => (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))));
    if (vals.length <= 3) g[k] = vals; else { const m = Math.floor(vals.length / 2); g[k] = [vals[0], vals[m], vals[vals.length - 1]]; }
  }
  const taille = gr => Object.values(gr).reduce((s, v) => s * v.length, 1);
  while (taille(g) > max) {
    const cles = Object.keys(g).filter(k => g[k].length > 1).sort((x, y) => g[x].length - g[y].length);
    if (!cles.length) break;
    const k = cles[0], meilleur = elite[0].params[k]; g[k] = [meilleur];                                // on fige d'abord le paramètre qui varie le moins
  }
  return g;
}

/* Le premier bloc d'entraînement d'un découpage de walk-forward (avant tout bloc de test) : la SEULE zone que la recherche guidée a le droit de regarder. */
export function plageGuidage(dec) { return dec && dec.ok && dec.folds.length ? { de: 0, a: dec.folds[0].train[1] } : null; }
