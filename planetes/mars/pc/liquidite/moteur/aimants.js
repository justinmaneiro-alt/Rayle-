/* ═════════════ CARTE DES AIMANTS : « OÙ VA LE MARCHÉ ? » (V4, phase 3 ; module pur, testé : galaxie/tests/liquidite-test.mjs) ═════════════
   On classe les zones au-dessus et en dessous du prix par ATTRACTIVITÉ : liquidité posée (murs fiables), volume historique (profil : POC, nœuds), stops probables (plus hauts / bas égaux, jour et semaine
   précédents, ronds), amas de liquidations estimés ; moins une zone est loin, plus elle attire. On en tire le PROCHAIN OBJECTIF probable, le NIVEAU DE DÉFENSE et l'INVALIDATION, chacun avec une
   explication courte construite à partir des chiffres (jamais d'un modèle de langage).
   Honnêteté : c'est une HYPOTHÈSE de lecture du marché, pas une prédiction prouvée ni un ordre. Les scores sont des heuristiques non calibrées ; les familles de stratégies qui s'en servent doivent passer les
   critères de validation habituels. Chaque zone dit d'où elle vient (observé, estimé, historique). */
export const POIDS = Object.freeze({ liquidite: 0.3, volume: 0.25, stops: 0.25, liquidations: 0.2 });
export const fmtPrix = p => (p == null ? '—' : p.toLocaleString('fr-FR', { maximumFractionDigits: p >= 1000 ? 0 : p >= 10 ? 2 : p >= 1 ? 3 : 5 }));
const fmtUsd = x => (x >= 1e9 ? (x / 1e9).toFixed(1) + ' G$' : x >= 1e6 ? (x / 1e6).toFixed(1) + ' M$' : x >= 1e3 ? Math.round(x / 1e3) + ' k$' : Math.round(x) + ' $').replace('.', ',');
const fmtN = (x, d = 1) => x.toFixed(d).replace('.', ',');
const minutes = s => (s >= 3600 ? fmtN(s / 3600) + ' h' : Math.max(1, Math.round(s / 60)) + ' min');
const TYPES_PISCINE = { egaux: 'plus hauts / bas égaux', jour_prec: 'extrême du jour précédent', semaine_prec: 'extrême de la semaine précédente', rond: 'niveau rond', range: 'borne du range' };

/* Au plus 3 raisons, les plus fortes d'abord (« + N autres » sinon). */
function expliquer(sources) { const tri = sources.slice().sort((a, b) => b.valeur - a.valeur), textes = [...new Set(tri.map(s => s.texte))]; return textes.slice(0, 3).join(' ; ') + (textes.length > 3 ? ' (+ ' + (textes.length - 3) + ' autres)' : ''); }

/* Rassemble les sources en zones (une zone = prix + composantes), fusionne celles qui sont à moins de `fusionPct` l'une de l'autre. */
function collecter({ prix, murs = [], profil = null, noeuds = null, piscines = null, liquidations = null }, fusionPct) {
  const zones = [], ajouter = (p, cle, valeur, texte, origine) => { if (!(p > 0) || !(valeur > 0)) return; zones.push({ prix: p, cle, valeur: Math.min(1, valeur), texte, origine }); };
  for (const m of murs) { const fi = m.fiabilite ? m.fiabilite.score : 0.5; ajouter(m.prix, 'liquidite', Math.min(1, (m.ratioMediane || 0) / 10) * (0.35 + 0.65 * fi) * (m.actif === false ? 0.4 : 1), 'mur ' + (m.cote === 'bid' ? 'acheteur' : 'vendeur') + ' de ' + fmtN(m.ratioMediane || 0) + '× la médiane (' + fmtUsd(m.usdMax) + '), tenu ' + minutes(m.dureeS || 0) + (m.fiabilite ? ', ' + m.fiabilite.niveau + (m.fiabilite.executions ? ', déjà attaqué ' + m.fiabilite.executions + ' fois' : '') : ''), 'observé'); }
  if (profil) { ajouter(profil.poc, 'volume', 1, 'point de contrôle du profil de volume (POC)', 'historique'); ajouter(profil.vah, 'volume', 0.6, 'haut de la zone de valeur (VAH)', 'historique'); ajouter(profil.val, 'volume', 0.6, 'bas de la zone de valeur (VAL)', 'historique'); }
  if (noeuds) { for (const h of noeuds.hvn || []) ajouter(h.prix, 'volume', Math.min(1, h.force / 4), 'nœud de gros volume (× ' + fmtN(h.force) + ' la médiane)', 'historique'); for (const l of noeuds.lvn || []) ajouter(l.prix, 'volume', 0.35, 'trou de volume (le prix le traverse vite)', 'historique'); }
  if (piscines) for (const cote of ['hauts', 'bas']) for (const q of piscines[cote] || []) {
    const v = q.type === 'egaux' ? 0.4 + 0.2 * Math.max(0, (q.touches || 1) - 1) : q.type === 'jour_prec' ? 0.6 : q.type === 'semaine_prec' ? 0.8 : q.type === 'range' ? 0.5 : (q.pas && q.pas >= prix * 0.0025 ? 0.5 : 0.3);
    ajouter(q.prix, 'stops', v, (cote === 'hauts' ? 'stops au-dessus : ' : 'stops en dessous : ') + (TYPES_PISCINE[q.type] || q.type) + (q.type === 'egaux' ? ' (' + q.touches + ' touches)' : ''), 'observé');
  }
  if (liquidations && liquidations.amas && liquidations.amas.length) { const tri = liquidations.amas.map(a => a.usd).sort((a, b) => a - b), ref = tri[Math.floor(tri.length * 0.85)] || tri[tri.length - 1]; for (const a of liquidations.amas.slice(0, 30)) ajouter(a.prix, 'liquidations', Math.min(1, a.usd / (ref * 2)), 'liquidations ' + (a.cote === 'long' ? 'de longs' : 'de courts') + ' estimées ≈ ' + fmtUsd(a.usd) + ' (ESTIMÉ)', 'estimé'); }
  zones.sort((a, b) => a.prix - b.prix); const fus = [];
  for (const z of zones) { const p = fus[fus.length - 1]; if (p && Math.abs(z.prix - p.prix) / prix * 100 <= fusionPct) { p.sources.push(z); } else fus.push({ prix: z.prix, sources: [z] }); }
  return fus.map(f => { const poids = f.sources.reduce((a, s) => a + s.valeur, 0); return { ...f, prix: f.sources.reduce((a, s) => a + s.prix * s.valeur, 0) / poids }; });
}

/* Évalue toutes les zones. `disponibles` : quelles familles de sources sont réellement présentes (les poids sont renormalisés sur celles-là : l'absence de carnet ne pénalise pas les autres zones). */
export function carteAimants(entree, { fusionPct = 0.12, rayonPct = 3, distanceRefPct = 1.2, biaisPoids = 0.3, maxZones = 6 } = {}) {
  const { prix } = entree; if (!(prix > 0)) return null;
  const dispo = { liquidite: (entree.murs || []).length > 0, volume: !!(entree.profil || entree.noeuds), stops: !!(entree.piscines && ((entree.piscines.hauts || []).length || (entree.piscines.bas || []).length)), liquidations: !!(entree.liquidations && (entree.liquidations.amas || []).length) };
  const somme = Object.keys(POIDS).reduce((a, k) => a + (dispo[k] ? POIDS[k] : 0), 0) || 1;
  const zones = collecter(entree, fusionPct).filter(z => Math.abs(z.prix - prix) / prix * 100 <= rayonPct && Math.abs(z.prix - prix) / prix * 100 >= 0.03).map(z => {
    const comp = { liquidite: 0, volume: 0, stops: 0, liquidations: 0 }; for (const s of z.sources) comp[s.cle] = Math.max(comp[s.cle], s.valeur);
    const brut = Object.keys(POIDS).reduce((a, k) => a + (dispo[k] ? POIDS[k] * comp[k] : 0), 0) / somme, familles = Object.keys(comp).filter(k => comp[k] > 0).length;
    const d = (z.prix - prix) / prix * 100, score = brut * (1 + 0.15 * (familles - 1)) * Math.exp(-Math.abs(d) / distanceRefPct);
    return { prix: z.prix, cote: d > 0 ? 'haut' : 'bas', distancePct: d, score, composantes: comp, familles, origines: [...new Set(z.sources.map(s => s.origine))], explication: expliquer(z.sources) };
  }).sort((a, b) => b.score - a.score);
  const haut = zones.filter(z => z.cote === 'haut').slice(0, maxZones), bas = zones.filter(z => z.cote === 'bas').slice(0, maxZones);
  const pr = entree.pression && entree.pression.pression != null ? entree.pression.pression : 0, biais = Math.max(-1, Math.min(1, pr + (entree.tendance ? 0.3 * entree.tendance : 0)));
  const sH = haut.length ? haut[0].score * (1 + biaisPoids * biais) : 0, sB = bas.length ? bas[0].score * (1 - biaisPoids * biais) : 0;
  const avert = ['Hypothèse de lecture du marché : ni prédiction prouvée, ni ordre.'];
  if (!dispo.liquidite) avert.push('Pas de carnet d’ordres enregistré pour cette lecture : les murs ne comptent pas.'); if (dispo.liquidations && haut.concat(bas).some(z => z.origines.includes('estimé'))) avert.push('Les liquidations sont ESTIMÉES (hypothèse sur les leviers).');
  if (entree.joursCarnet != null && entree.joursCarnet < 14) avert.push('Carnet enregistré depuis ' + fmtN(entree.joursCarnet) + ' jour(s) seulement : preuve statistique insuffisante avant 14 jours.');
  if (!haut.length && !bas.length) return { prix, zones: [], haut, bas, objectif: null, defense: null, invalidation: null, resume: ['Pas de zone attractive assez nette autour du prix.'], avertissements: avert, dispo, confiance: 'aucune' };
  const cote = sH >= sB ? 'haut' : 'bas', cible = (cote === 'haut' ? haut : bas)[0], oppose = cote === 'haut' ? bas : haut, marge = Math.abs(sH - sB) / Math.max(sH, sB, 1e-9);
  // défense : la zone opposée la plus forte dans le rayon proche (1 %), sinon la plus proche ; invalidation : un peu au-delà
  const proches = oppose.filter(z => Math.abs(z.distancePct) <= 1), defense = (proches.length ? proches : oppose.slice().sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct)))[0] || null;
  const atrPct = entree.atr ? entree.atr / prix * 100 : 0.15, margePct = Math.max(0.08, 0.35 * atrPct);
  const invalidationPrix = defense ? defense.prix * (1 + (cote === 'haut' ? -1 : 1) * margePct / 100) : prix * (1 + (cote === 'haut' ? -1 : 1) * Math.max(0.3, atrPct) / 100);
  const confiance = (cible.familles >= 3 && marge >= 0.25 ? 'moyenne' : cible.familles >= 2 && marge >= 0.1 ? 'faible' : 'très faible');
  const dir = cote === 'haut' ? 'au-dessus' : 'en dessous';
  const objectif = { prix: cible.prix, cote, distancePct: cible.distancePct, score: cible.score, explication: cible.explication };
  const defenseOut = defense ? { prix: defense.prix, distancePct: defense.distancePct, explication: defense.explication } : null;
  const invalidation = { prix: invalidationPrix, texte: 'si le prix clôture ' + (cote === 'haut' ? 'sous ' : 'au-dessus de ') + fmtPrix(invalidationPrix) + ', la lecture est fausse' };
  const resume = [
    'Prochain aimant probable : ' + fmtPrix(cible.prix) + ' (' + dir + ', ' + (cible.distancePct > 0 ? '+' : '') + fmtN(cible.distancePct, 2) + ' %) — ' + cible.explication + '.',
    defense ? 'Niveau de défense : ' + fmtPrix(defense.prix) + ' (' + fmtN(defense.distancePct, 2) + ' %) — ' + defense.explication + '.' : 'Niveau de défense : aucun niveau net en face.',
    'Invalidation : ' + invalidation.texte + '. Confiance ' + confiance + '. Hypothèse, pas une promesse.'
  ];
  return { prix, zones, haut, bas, objectif, defense: defenseOut, invalidation, resume, avertissements: avert, dispo, confiance, biais, scores: { haut: sH, bas: sB } };
}
