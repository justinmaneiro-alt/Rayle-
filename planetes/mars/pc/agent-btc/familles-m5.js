import { validerRegle } from './regles-lab.js';
import { FAMILLES, ORDRE_FAMILLES, ORDRE_MICRO, combinaisons } from './hypotheses.js';
import { FAMILLE_REGLE } from './regles-lab.js';

/* ═════════════ FAMILLES ET CHANTIERS DE LA RECHERCHE SANS FIN (M5 ; module pur, testé : m5-recherche-test.mjs) ═════════════
   Un CHANTIER = une idée avec sa grille de variantes (comme une « famille » de hypotheses.js). La recherche sans fin les parcourt par NIVEAUX qui s'élargissent :
     0  les 5 familles d'origine (M15 avec contexte H1 / H4)            1  les mêmes avec filtres de séance et de delta
     2  les 7 familles de microstructure (M4)                            3  les gabarits M5 sur plusieurs unités de temps (M15, H1, H4)
     4  ces gabarits avec filtres (séance, delta, volatilité)           5+ règles aléatoires du générateur (graine incrémentée, sans fin), idées de l'utilisatrice en priorité
   Les gabarits sont des règles du laboratoire (regles-lab.js) : mêmes critères, mêmes tests. Ajouter un gabarit = une entrée dans GABARITS (et c'est tout). Aucun chantier ne dépend de l'IA. */
FAMILLES.regle = FAMILLE_REGLE;                           // le moteur d'évaluation voit « règle » comme une famille de plus

const R = (cote, conditions, stop, r, nom = 'g') => validerRegle({ nom, cote, conditions, stop, R: r });
const grille = (axes, fabrique) => combinaisons(axes).map(fabrique).filter(Boolean);
const atr = (tf, k) => ({ type: 'atr', tf, k }), structure = (L, pad) => ({ type: 'structure', L, pad });
const sPhaseH4 = { type: 'phase', tf: 'h4', valeurs: ['tendance'] }, sPhaseH1 = { type: 'phase', tf: 'h1', valeurs: ['tendance'] };

export const GABARITS = [
  { id: 'donchian_h1', nom: 'Cassure de canal H1 dans le sens de la tendance H4',
    description: 'La bougie H1 qui ferme au-delà du plus haut (ou plus bas) des N dernières bougies H1, quand H4 est en tendance dans le même sens. Stop en ATR H1.',
    specs: () => grille({ N: [24, 48, 96], k: [1.5, 2.5], r: [2, 3, 4] }, p => R('les-deux', [sPhaseH4, { type: 'cassure', tf: 'h1', N: p.N }], atr('h1', p.k), p.r)) },
  { id: 'donchian_h4', nom: 'Cassure de canal H4',
    description: 'La bougie H4 qui ferme au-delà du plus haut (ou plus bas) des N dernières bougies H4, avec ou sans tendance H4 dans le même sens. Stop en ATR H4.',
    specs: () => grille({ N: [10, 20, 40], tend: [0, 1], k: [1, 2], r: [2, 3, 4] }, p => R('les-deux', [...(p.tend ? [sPhaseH4] : []), { type: 'cassure', tf: 'h4', N: p.N }], atr('h4', p.k), p.r)) },
  { id: 'repli_rsi_h1', nom: 'Repli RSI H1 dans une tendance H4',
    description: 'En tendance H4, le RSI(14) H1 passe sous un seuil bas (miroir pour la vente) : on joue la reprise de la tendance. Stop en ATR H1.',
    specs: () => grille({ seuil: [25, 30, 35], k: [1.5, 2.5], r: [1.5, 2, 3] }, p => R('les-deux', [sPhaseH4, { type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: p.seuil }], atr('h1', p.k), p.r)) },
  { id: 'extreme_rsi_h4', nom: 'Extrême de RSI H4',
    description: 'Le RSI(14) H4 est à un extrême (survente pour l’achat, surachat pour la vente) hors tendance contraire. Stop en ATR H4.',
    specs: () => grille({ seuil: [20, 25, 30], phase: [['tendance', 'range'], ['range']], k: [1, 2], r: [2, 3] }, p => R('les-deux', [{ type: 'phase', tf: 'h4', valeurs: p.phase }, { type: 'rsi', tf: 'h4', periode: 14, op: '<', seuil: p.seuil }], atr('h4', p.k), p.r)) },
  { id: 'croisement_ema_h1', nom: 'Croisement d’EMA H1 avec volume, dans la tendance H4',
    description: 'La bougie H1 ferme de l’autre côté d’une EMA, avec un volume M15 supérieur à la normale, quand H4 est en tendance dans le même sens.',
    specs: () => grille({ per: [20, 50, 100], vol: [1, 1.5], k: [2, 3], r: [2, 3, 4] }, p => R('les-deux', [sPhaseH4, { type: 'croisement', tf: 'h1', periode: p.per }, { type: 'volume', min: p.vol }], atr('h1', p.k), p.r)) },
  { id: 'cassure_asie_londres', nom: 'Cassure à l’ouverture de Londres',
    description: 'Pendant la session de Londres, une bougie M15 ferme au-delà du plus haut (ou plus bas) des N dernières bougies, avec un volume au-dessus de la normale. Stop sur la structure récente.',
    specs: () => grille({ N: [32, 48], vol: [1, 1.5], L: [16, 32], r: [2, 3] }, p => R('les-deux', [{ type: 'session', valeurs: [1] }, { type: 'cassure', tf: 'm15', N: p.N }, { type: 'volume', min: p.vol }], structure(p.L, 0.3), p.r)) },
  { id: 'balayage_session', nom: 'Balayage d’un extrême pendant Londres ou New York',
    description: 'Une mèche dépasse l’extrême des N dernières bougies puis referme à l’intérieur, pendant Londres ou New York : retour dans le sens opposé au balayage.',
    specs: () => grille({ N: [48, 96, 192], meche: [0.4, 0.5], sess: [[1], [2]], L: [8, 16], r: [2, 3] }, p => R('les-deux', [{ type: 'session', valeurs: p.sess }, { type: 'balayage', N: p.N, meche: p.meche }], structure(p.L, 0.3), p.r)) },
  { id: 'compression_h1', nom: 'Sortie de compression de volatilité H1',
    description: 'La volatilité H1 est dans le bas de sa plage récente, puis une bougie H1 ferme au-delà du canal des N dernières bougies H1.',
    specs: () => grille({ max: [0.2, 0.3], N: [24, 48], k: [1.5, 2.5], r: [2, 3, 4] }, p => R('les-deux', [{ type: 'volatilite', min: 0, max: p.max }, { type: 'cassure', tf: 'h1', N: p.N }], atr('h1', p.k), p.r)) },
  { id: 'rejet_vwap', nom: 'Rejet sur le VWAP du jour',
    description: 'Dans une tendance H1, le prix est près du VWAP du jour et une longue mèche de rejet apparaît dans le sens de la tendance.',
    specs: () => grille({ dist: [0.5, 1], ratio: [0.4, 0.5], r: [2, 3] }, p => R('les-deux', [sPhaseH1, { type: 'zone', nom: 'vwap', distance: p.dist }, { type: 'meche', ratio: p.ratio }], structure(12, 0.3), p.r)) },
  { id: 'weekend_survente', nom: 'Survente du week-end',
    description: 'Le week-end (samedi, dimanche), le RSI(14) H1 passe sous un seuil bas (miroir pour la vente) : retour vers la moyenne dans un marché moins profond.',
    specs: () => grille({ seuil: [25, 30], k: [2], r: [1.5, 2] }, p => R('les-deux', [{ type: 'jours', valeurs: [0, 6] }, { type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: p.seuil }], atr('h1', p.k), p.r)) }
];
export const FILTRES_M5 = [
  { id: 'seance', nom: 'séances européenne et américaine', condition: { type: 'session', valeurs: [1, 2] } },
  { id: 'delta', nom: 'delta dans le sens du trade', condition: { type: 'delta', sens: 'avec', ratioMin: 0.05 } },
  { id: 'volat', nom: 'volatilité H1 non comprimée', condition: { type: 'volatilite', min: 0.3, max: 1 } }
];

/* Fabrique la liste de variantes d'un chantier de famille d'origine ou de gabarit. */
const variantesFamille = (id, gen) => combinaisons(FAMILLES[id].grille(gen)).map(params => ({ famille: id, params }));
const variantesSpecs = specs => specs.map(v => ({ famille: 'regle', params: v.regle }));

/* Chantier numéro `k` du niveau `niveau` (0 à 4). Rend null quand le niveau est épuisé. Les niveaux 5 et suivants (aléatoire) sont gérés par recherche-continue.js. */
export function chantierDuNiveau(niveau, k, { derivesDisponibles = false } = {}) {
  if (niveau === 0 || niveau === 1) { const id = ORDRE_FAMILLES[k]; return id ? { id: id + '@' + niveau, nom: FAMILLES[id].nom, description: FAMILLES[id].description, niveau, variants: variantesFamille(id, niveau), famille: id, gen: niveau } : null; }
  if (niveau === 2) { const id = ORDRE_MICRO[k]; if (!id) return null; return { id: id + '@m', nom: FAMILLES[id].nom, description: FAMILLES[id].description, niveau, variants: variantesFamille(id, 0), famille: id, gen: 0, necessiteDerives: ['financement_extreme', 'purge_oi'].includes(id) }; }
  if (niveau === 3) { const g = GABARITS[k]; return g ? { id: g.id, nom: g.nom, description: g.description, niveau, variants: variantesSpecs(g.specs()), gen: 0 } : null; }
  if (niveau === 4) { const g = GABARITS[Math.floor(k / FILTRES_M5.length)], f = FILTRES_M5[k % FILTRES_M5.length]; if (!g) return null;
    const specs = g.specs().map(v => { const r = JSON.parse(JSON.stringify(v.regle)); r.conditions.push(f.condition); return validerRegle(r); }).filter(x => x.ok);
    return { id: g.id + '+' + f.id, nom: g.nom + ' · filtre ' + f.nom, description: g.description + ' Filtre ajouté : ' + f.nom + '.', niveau, variants: variantesSpecs(specs), gen: 0 }; }
  return null;
}
export const NIVEAUX = Object.freeze([
  { niveau: 0, nom: 'Familles d’origine (M15, contexte H1 et H4)' }, { niveau: 1, nom: 'Familles d’origine avec filtres de séance et de delta' }, { niveau: 2, nom: 'Microstructure (sessions, liquidité, VWAP, flux)' },
  { niveau: 3, nom: 'Gabarits multi-unités de temps (M15, H1, H4)' }, { niveau: 4, nom: 'Gabarits multi-unités avec filtres' }, { niveau: 5, nom: 'Règles aléatoires du générateur (sans fin)' }
]);
export const NB_CHANTIERS = { 0: ORDRE_FAMILLES.length, 1: ORDRE_FAMILLES.length, 2: ORDRE_MICRO.length, 3: GABARITS.length, 4: GABARITS.length * FILTRES_M5.length };
