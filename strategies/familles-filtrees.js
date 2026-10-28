import { FAMILLES } from '../planetes/mars/pc/agent-btc/hypotheses.js';
import { ORDRE_V3, NOMS_V3 } from './familles-v3.js';
import { ORDRE_V6, NOMS_V6 } from './familles-v6.js';

/* ═════════════ FAMILLES FILTRÉES : « moins de trades, de meilleure qualité » (V6, phase 2 ; module pur, testé : galaxie/tests/familles-filtrees-test.mjs) ═════════════
   Chaque famille de base (V3 et V6) peut être combinée à UN filtre de contexte : séance, tendance H4 dans le même sens, marché en range, volatilité normale, volume anormal, delta (volume agressif) dans le sens
   du trade, financement des contrats à terme. Le filtre ne FAIT QUE retirer des signaux (jamais en ajouter, jamais changer un stop) : une famille filtrée a toujours moins de trades que sa base.
   Chaque filtre a son hypothèse écrite. Tous sont CAUSAUX (information connue à la clôture de la bougie i). Le filtre « financement » exige les données de financement de Binance (derives-<actif>.json) :
   sans elles il ne laisse passer AUCUN signal (jamais une valeur inventée). Les combinaisons comptent chacune comme des variantes testées (le compteur du Sharpe déflaté ne baisse jamais). */
const heure = t => Math.floor((t % 86400e3) / 3600e3);
export const FILTRES = Object.freeze({
  seance_eu_us: { nom: 'séances européenne et américaine', hypothese: 'Le volume et la direction viennent surtout entre 7 h et 21 h UTC ; la nuit, les mouvements sont plus souvent du bruit.', test: (ctx, i) => { const h = heure(ctx.m15.t[i]); return h >= 7 && h < 21; } },
  seance_us: { nom: 'séance américaine', hypothese: 'L’ouverture de Wall Street (13 h – 21 h UTC) apporte les plus gros flux de la journée.', test: (ctx, i) => { const h = heure(ctx.m15.t[i]); return h >= 13 && h < 21; } },
  tendance_h4: { nom: 'dans le sens de la tendance H4', hypothese: 'Un signal dans le sens de la tendance de fond a plus de chances de continuer que le même signal à contre-courant.', test: (ctx, i, s) => (s > 0 ? ctx.h4.phase[i] === 1 : ctx.h4.phase[i] === 2) },
  range_h1: { nom: 'marché en range (H1)', hypothese: 'Dans un marché sans tendance, les excès reviennent vers la moyenne : certaines idées n’y fonctionnent qu’à cet endroit.', test: (ctx, i) => ctx.h1.phase[i] === 3 },
  volatilite_normale: { nom: 'volatilité normale', hypothese: 'Une volatilité écrasée ou extrême rend les stops illisibles ; le milieu de la fourchette est le terrain où les stops en ATR ont un sens.', test: (ctx, i) => { const r = ctx.h1.atrRang[i]; return r >= 0.2 && r <= 0.8; } },
  volume_anormal: { nom: 'volume anormal', hypothese: 'Un volume d’au moins 1,5 fois la normale signale que de vrais acteurs participent : le signal est moins souvent du bruit.', test: (ctx, i) => ctx.m15.v[i] >= 1.5 * ctx.volMoy20[i] },
  delta_confirme: { nom: 'delta dans le sens du trade', hypothese: 'Si le volume agressif (acheteurs moins vendeurs) va dans le sens du trade, la pression réelle le soutient.', test: (ctx, i, s) => (s > 0 ? ctx.delta15[i] > 0 : ctx.delta15[i] < 0) },
  financement: { nom: 'financement des contrats à terme', exige: 'financement', hypothese: 'Quand tout le monde est du même côté (financement très élevé), l’acheteur supplémentaire paie cher et la foule est fragile : on évite d’aller dans le sens de la foule.', test: (ctx, i, s) => { const f = ctx.financement && ctx.financement[i]; return Number.isFinite(f) && (s > 0 ? f < 0.00005 : f > 0.0002); } }
});
export const ORDRE_FILTRES = Object.freeze(Object.keys(FILTRES));
export const BASES_FILTRABLES = Object.freeze([...ORDRE_V3, ...ORDRE_V6]);

/* Financement aligné sur les bougies M15 : à la bougie i, le DERNIER taux de financement publié (t ≤ ouverture de la bougie) ; NaN avant le premier. `funding` = [{ t, taux }] trié. Causal. */
export function financementM15(funding, tM15) {
  const n = tM15.length, out = new Float64Array(n).fill(NaN); if (!funding || !funding.length) return out;
  let k = -1; for (let i = 0; i < n; i++) { while (k + 1 < funding.length && funding[k + 1].t <= tM15[i]) k++; if (k >= 0) out[i] = funding[k].taux; }
  return out;
}
export const attacherFinancement = (ctx, funding) => { ctx.financement = financementM15(funding, ctx.m15.t); return ctx; };

export const idFiltree = (base, filtre) => base + '+' + filtre;
function composer(baseId, filtreId) {
  const base = FAMILLES[baseId], f = FILTRES[filtreId], id = idFiltree(baseId, filtreId);
  return {
    id, nom: (NOMS_V3[baseId] || NOMS_V6[baseId] || base.nom) + ' · ' + f.nom, unite: base.unite || 'M15', riche: !!base.riche, base: baseId, filtre: filtreId, exige: f.exige || null,
    description: 'Même idée que « ' + (NOMS_V3[baseId] || NOMS_V6[baseId] || base.nom) + ' », mais seulement quand : ' + f.nom + '. ' + f.hypothese + ' Le filtre ne fait que retirer des signaux.',
    hypothese: (base.hypothese ? base.hypothese + ' ' : '') + 'Filtre : ' + f.hypothese,
    grille: gen => base.grille(gen),
    signaux(ctx, p) {
      const s = base.signaux(ctx, p), n = ctx.n;
      for (let i = 0; i < n; i++) if (s.sens[i] !== 0 && !f.test(ctx, i, s.sens[i])) { s.sens[i] = 0; if (s.limite) s.limite[i] = NaN; if (s.cible) s.cible[i] = NaN; }
      return s;
    }
  };
}
export const ORDRE_FILTREES = [], NOMS_FILTREES = {}, FAMILLES_FILTREES = {};
for (const b of BASES_FILTRABLES) for (const f of ORDRE_FILTRES) { const fam = composer(b, f); FAMILLES_FILTREES[fam.id] = fam; FAMILLES[fam.id] = fam; ORDRE_FILTREES.push(fam.id); NOMS_FILTREES[fam.id] = fam.nom; }
Object.freeze(ORDRE_FILTREES);
export const exigencesFiltree = id => (FAMILLES_FILTREES[id] && FAMILLES_FILTREES[id].exige) || null;
