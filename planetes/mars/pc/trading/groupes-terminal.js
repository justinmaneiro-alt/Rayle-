import { FENETRES } from '../exemples.js';

/* ═════════════ TERMINAL DE MARS PAR GROUPES (module pur, testé : planetes/mars/tests/terminal-groupes-test.mjs) ═════════════
   Les panneaux du terminal sont rangés en groupes thématiques cohérents. Chaque panneau appartient à UN groupe. Les 21 fenêtres du mur de la table + les panneaux du registre de
   l'espace de travail qui n'ont pas de fenêtre sur le mur (résumé, corrélations, Nasdaq 100, publications, agent stratège) : rien n'est oublié (le test le vérifie).
   L'état (groupe affiché + panneaux choisis) est sérialisable ; la disposition des fenêtres est mémorisée par le gestionnaire commun (cle « mars-terminal »). */
export const EXTRAS = [
  { id: 'resume', titre: 'Résumé de marché', icone: '🧾', apercu: 'RSI, MACD, ATR, structure, niveaux de l’instrument choisi', registre: 'resume', reel: true },
  { id: 'correlations', titre: 'Corrélations', icone: '🔗', apercu: 'Matrice sur 60 jours : US100, or, dollar, taux', registre: 'correlations', reel: true },
  { id: 'heatmap', titre: 'Nasdaq 100', icone: '🟩', apercu: 'Grandes valeurs de l’indice', registre: 'heatmap', reel: true },
  { id: 'publications', titre: 'Publications', icone: '🗞', apercu: 'Publications économiques à venir', registre: 'publications', reel: true },
  { id: 'strategie', titre: 'Agent stratège', icone: '🧠', apercu: 'Scénarios commentés (annoncé, pas encore branché)', registre: 'strategie', reel: false }
];
/* correspondance fenêtre du mur → panneau du registre de l'espace de travail */
export const REGISTRE_DE = { marche: 'watchlist', dashboard: 'dashboard', contexte: 'contexte', 'agent-btc': 'agent', alertes: 'alertes', calendrier: 'calendrier', cot: 'cot', 'actus-finance': 'actus', banques: 'banques', taux: 'taux' };
export const GRAPHIQUES = Object.fromEntries(FENETRES.filter(f => f.type === 'bougies').map(f => [f.id, { instrument: f.instrument, unite: f.unite }]));

export const PANNEAUX_TERMINAL = [
  ...FENETRES.map(f => ({ id: f.id, titre: f.titre, icone: f.icone, apercu: f.apercu, reel: !!f.reel, onglet: f.onglet || null, mur: true })),
  ...EXTRAS.map(e => ({ ...e, mur: false }))
];
export const panneau = id => PANNEAUX_TERMINAL.find(p => p.id === id) || null;

export const GROUPES = [
  { id: 'graphiques', titre: 'Graphiques', icone: '📈', panneaux: ['graphique-us100', 'graphique-or', 'graphique-btc', 'graphique-sol', 'graphique-doge', 'marche', 'dashboard', 'resume'] },
  { id: 'macro', titre: 'Éco et macro', icone: '🏦', panneaux: ['taux', 'banques', 'calendrier', 'cot', 'publications'] },
  { id: 'actus', titre: 'Actualités', icone: '📰', panneaux: ['actus-finance'] },
  { id: 'sentiment', titre: 'Sentiment de marché', icone: '🌡', panneaux: ['contexte', 'correlations', 'heatmap'] },
  { id: 'agent', titre: 'Agent IA', icone: '🛰', panneaux: ['agent-btc', 'propositions-agent', 'regime-marche', 'strategie'] },
  { id: 'alertes', titre: 'Alertes et veilleur', icone: '🔔', panneaux: ['alertes'] },
  { id: 'perf', titre: 'Performance et risque', icone: '🛡', panneaux: ['perf-strategies', 'gardien-prop', 'journal-tilt', 'proba-evaluation'] }
];
/* Les mêmes groupes vus comme des dossiers holographiques (core/commun/dossiers.js). */
export const DOSSIERS = GROUPES.map(g => ({ id: g.id, titre: g.titre, icone: g.icone, ids: g.panneaux }));
export const groupeDe = id => (GROUPES.find(g => g.panneaux.includes(id)) || {}).id || null;

export const PRESETS = [
  { id: 'trading', titre: 'Trading', panneaux: ['graphique-us100', 'graphique-or', 'marche', 'dashboard'] },
  { id: 'macro', titre: 'Macro', panneaux: ['calendrier', 'taux', 'banques', 'cot'] },
  { id: 'surveillance', titre: 'Surveillance', panneaux: ['alertes', 'agent-btc', 'regime-marche', 'gardien-prop'] }
];

/* Vérifie la cohérence : chaque panneau dans un seul groupe, aucun panneau oublié, aucun identifiant inconnu. Rend la liste des problèmes (vide = tout va bien). */
export function verifierGroupes() {
  const pb = [], vus = new Map();
  for (const g of GROUPES) for (const id of g.panneaux) { if (!panneau(id)) pb.push('panneau inconnu : ' + id); if (vus.has(id)) pb.push('panneau dans deux groupes : ' + id); vus.set(id, g.id); }
  for (const p of PANNEAUX_TERMINAL) if (!vus.has(p.id)) pb.push('panneau oublié : ' + p.id);
  for (const s of PRESETS) for (const id of s.panneaux) if (!panneau(id)) pb.push('préréglage ' + s.id + ' : panneau inconnu ' + id);
  return pb;
}

/* ── État ── */
export const etatInitial = () => ({ groupe: 'graphiques', ouverts: [] });
export function normaliser(e) {
  const base = etatInitial(); if (!e || typeof e !== 'object') return base;
  const groupe = GROUPES.some(g => g.id === e.groupe) ? e.groupe : base.groupe;
  const ouverts = Array.isArray(e.ouverts) ? [...new Set(e.ouverts.filter(id => panneau(id)))] : [];
  return { groupe, ouverts };
}
export function basculer(e, id) { if (!panneau(id)) return e; const ouv = e.ouverts.includes(id) ? e.ouverts.filter(x => x !== id) : [...e.ouverts, id]; return { ...e, ouverts: ouv }; }
export function ajouter(e, id) { return !panneau(id) || e.ouverts.includes(id) ? { ...e, groupe: groupeDe(id) || e.groupe } : { groupe: groupeDe(id) || e.groupe, ouverts: [...e.ouverts, id] }; }
export function appliquerPreset(e, presetId) { const s = PRESETS.find(x => x.id === presetId); return s ? { groupe: groupeDe(s.panneaux[0]) || e.groupe, ouverts: [...s.panneaux] } : e; }
export const reinitialiser = () => etatInitial();
