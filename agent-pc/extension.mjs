// Niveaux de la recherche de Kepler (V6) : tâches de l'optimisation GUIDÉE (niveau 1) et des familles FILTRÉES (niveau 2), et plan des niveaux. Le niveau 0 est planifier() de recherche.mjs.
// Un niveau n'est abordé que lorsque le précédent est ENTIÈREMENT fait (le cache par empreinte dit ce qui est fait) : la recherche ne s'arrête donc jamais à « espace épuisé » tant qu'il reste un niveau.
import { planifier, empreinteTache, grilleDe, ORDRE_TOUT } from './recherche.mjs';
import { ORDRE_FILTREES, exigencesFiltree, FAMILLES_FILTREES } from '../strategies/familles-filtrees.js';
import { ordonnerFamilles } from '../strategies/autonomie.js';
import { EXIGENCES_V4 } from '../strategies/familles-v4.js';
import { NIVEAUX } from '../strategies/extension-recherche.js';
import { famille } from '../strategies/familles-v3.js';

export const RONDES_GUIDEES = 6;
/* La meilleure espérance connue de chaque (famille, actif) : sert à regarder d'abord les familles qui ont déjà montré quelque chose. */
function meilleurs(etat) {
  const m = new Map(); for (const b of etat.backtests || []) { if (b.esperance == null || !(b.trades >= 30)) continue; const k = b.famille + ':' + b.paire; if (!m.has(k) || b.esperance > m.get(k)) m.set(k, b.esperance); }
  return m;
}
const note = (m, f, p) => { const base = FAMILLES_FILTREES[f] ? FAMILLES_FILTREES[f].base : f; return m.has(f + ':' + p) ? m.get(f + ':' + p) : m.has(base + ':' + p) ? m.get(base + ':' + p) : -Infinity; };

export function tachesGuidees(etat, { paires, debutFinal, cache, couts = '', rondes = RONDES_GUIDEES, familles = ORDRE_TOUT, priorites = null, revue = false }) {
  const mb = meilleurs(etat), out = [];
  for (let r = 1; r <= rondes; r++) {
    const ronde = [];
    for (const f of ordonnerFamilles(familles, priorites, { revue })) {
      if (EXIGENCES_V4[f]) continue;                                                                    // les familles qui exigent le carnet ou l'empreinte n'ont pas de données historiques à guider
      for (const p of paires) {
        if (!debutFinal[p]) continue; const grille = grilleDe(f, 0), emp = empreinteTache({ famille: f, paire: p, grille, debutFinal: debutFinal[p], type: 'guidee-' + r, couts });
        if (cache.has(emp)) continue; ronde.push({ type: 'guidee', ronde: r, gen: 0, famille: f, paire: p, grille, empreinte: emp, debutFinal: debutFinal[p], taille: 27, note: note(mb, f, p) });
      }
    }
    ronde.sort((a, b) => b.note - a.note); out.push(...ronde.map(({ note: n, ...t }) => t));       // dans une ronde, les (famille, actif) les plus prometteurs d'abord
  }
  return out;
}
export function tachesFiltrees(etat, { paires, debutFinal, cache, couts = '', derivesDispo = {}, familles = ORDRE_FILTREES }) {
  const mb = meilleurs(etat), out = [];
  for (const f of familles) for (const p of paires) {
    if (!debutFinal[p]) continue; if (exigencesFiltree(f) === 'financement' && !derivesDispo[p]) continue;      // pas de données de financement : pas de tâche inutile
    const fam = famille(f); if (!fam) continue; const grille = fam.grille(0), emp = empreinteTache({ famille: f, paire: p, grille, debutFinal: debutFinal[p], type: 'exploration', couts });
    if (cache.has(emp)) continue; out.push({ type: 'exploration', gen: 0, famille: f, paire: p, grille, empreinte: emp, debutFinal: debutFinal[p], taille: Object.values(grille).reduce((a, v) => a * v.length, 1), note: note(mb, f, p) });
  }
  out.sort((a, b) => b.note - a.note); return out.map(({ note: n, ...t }) => t);
}
/* Tous les niveaux : { niveau (le premier non terminé, ou null), taches (de ce niveau), niveaux: [{ id, nom, total, faits }] }. */
export function planifierNiveaux(etat, opts) {
  const aucun = { has: () => false }, tout = (fn, o) => fn(etat, { ...o, cache: aucun }), n0t = tout(planifier, opts).length, n1t = tout(tachesGuidees, opts).length, n2t = tout(tachesFiltrees, opts).length;
  const n0 = planifier(etat, opts), n1 = tachesGuidees(etat, opts), n2 = tachesFiltrees(etat, opts);
  const niveaux = [{ ...NIVEAUX[0], total: n0t, faits: n0t - n0.length }, { ...NIVEAUX[1], total: n1t, faits: n1t - n1.length }, { ...NIVEAUX[2], total: n2t, faits: n2t - n2.length }];
  const listes = [n0, n1, n2], i = listes.findIndex(l => l.length > 0);
  return { niveau: i < 0 ? null : i, taches: i < 0 ? [] : listes[i], niveaux };
}
