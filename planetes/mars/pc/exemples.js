import { alea } from './mars-calcul.js';

/* ═════════════ CONTENUS D'EXEMPLE DES FENÊTRES DE LA TABLE (module pur, testé : planetes/mars/tests/exemples-test.mjs) ═════════════
   Étape M1 : AUCUNE donnée réelle. Tout ce qui sort d'ici est factice, fabriqué par un générateur reproductible, et porte le marqueur EXEMPLE.
   Les vraies données (graphiques, positions, performance, signaux de l'agent) remplaceront ces générateurs aux étapes suivantes ; les fenêtres, elles, resteront. */
export const MARQUEUR = 'EXEMPLE';
export const AVERTISSEMENT = 'EXEMPLE · données factices, aucune valeur réelle';
export const estExemple = f => !f.reel;
export const INSTRUMENTS = [
  { id: 'US100', nom: 'Nasdaq 100', ancre: 20150, pas: 14 },     // départ : US100 « Nasdaq 100 » puis l'or
  { id: 'XAUUSD', nom: 'XAU/USD (or)', ancre: 3960, pas: 3.2 }
];
export const INDICATEURS = ['EMA', 'MA'];                          // moyennes mobiles au choix (exponentielle ou simple)

/* Bougies fictives (marche aléatoire reproductible). */
export function bougies(graine = 1, n = 60, ancre = 20150, pas = 14) {
  const a = alea(graine), out = []; let c = ancre;
  for (let i = 0; i < n; i++) {
    const o = c, mv = (a() - 0.48) * pas * 2.2, cl = o + mv, h = Math.max(o, cl) + a() * pas * 0.9, l = Math.min(o, cl) - a() * pas * 0.9;
    out.push({ i, o, h, l, c: cl }); c = cl;
  }
  return out;
}
export function moyenneSimple(valeurs, n) { return valeurs.map((_, i) => (i + 1 < n ? null : valeurs.slice(i + 1 - n, i + 1).reduce((s, x) => s + x, 0) / n)); }
export function moyenneExp(valeurs, n) { const k = 2 / (n + 1); let m = null; return valeurs.map((x, i) => { m = m === null ? x : x * k + m * (1 - k); return i + 1 < n ? null : m; }); }
export function courbe(graine = 2, n = 60, depart = 10000) { const a = alea(graine), out = []; let c = depart; for (let i = 0; i < n; i++) { c *= 1 + (a() - 0.43) * 0.012; out.push(c); } return out; }

export function positions() {
  return [
    { actif: 'US100', sens: 'Achat', taille: 0.5, entree: 20112.4, courant: 20148.9, pl: 18.2 },
    { actif: 'XAU/USD', sens: 'Vente', taille: 0.2, entree: 3968.1, courant: 3961.5, pl: 13.2 },
    { actif: 'US100', sens: 'Achat', taille: 0.3, entree: 20190.0, courant: 20148.9, pl: -12.3 }
  ];
}
export function signaux() {
  return [
    { heure: '14:32', actif: 'US100', texte: 'Exemple de signal : cassure de la moyenne mobile, attente de confirmation.' },
    { heure: '13:05', actif: 'XAU/USD', texte: 'Exemple de signal : RSI en zone haute, prudence.' },
    { heure: '09:48', actif: 'US100', texte: 'Exemple de signal : volume en baisse avant l’annonce.' }
  ];
}
export function evenements() {
  return [
    { heure: '14:30', pays: 'US', nom: 'Exemple · Emplois non agricoles', impact: 3 },
    { heure: '16:00', pays: 'US', nom: 'Exemple · Indice ISM des services', impact: 2 },
    { heure: '20:00', pays: 'US', nom: 'Exemple · Discours de la banque centrale', impact: 3 }
  ];
}
export function tuiles() {
  return [{ nom: 'RSI 14', valeur: '57,3' }, { nom: 'EMA 200', valeur: '19 842' }, { nom: 'MA 50', valeur: '20 031' }, { nom: 'Variation jour', valeur: '+0,62 %' }];
}

/* Les fenêtres de la table (13 depuis la nuit n° 2 : les 7 d'origine + alertes, calendrier, COT, actualités financières, banques centrales, taux ; AUCUNE fenêtre factice). `type` choisit le dessin ; `apercu` est le texte court gravé sur la fenêtre flottante.
   `reel: true` = la fenêtre affiche de VRAIES données (Worker) ; `etat0` = état affiché tant que rien n'est branché ('bientot' : fonction annoncée, aucun chiffre).
   `instrument` : identifiant du terminal (trading/instruments.js) ; `dock` : panneau du bas ouvert avec la fenêtre. */
export const FENETRES = [
  { id: 'graphique-us100', titre: 'US100 · Nasdaq 100', icone: '📈', type: 'bougies', reel: true, instrument: 'US100', unite: 'H1', apercu: 'Bougies H1 réelles' },
  { id: 'graphique-or', titre: 'XAU/USD · or', icone: '🥇', type: 'bougies', reel: true, instrument: 'XAU', unite: 'H1', apercu: 'Bougies H1 réelles' },
  { id: 'graphique-btc', titre: 'Bitcoin · BTC/USD', icone: '₿', type: 'bougies', reel: true, instrument: 'BTC', unite: 'H1', apercu: 'Bougies H1 réelles' },
  { id: 'marche', titre: 'Marché · watchlist', icone: '🌐', type: 'marche', reel: true, dock: 'correlations', focus: 'watchlist', apercu: 'Cotations réelles' },
  { id: 'dashboard', titre: 'Dashboard analytique', icone: '🧭', type: 'dashboard', reel: true, instrument: 'US100', dock: 'dashboard', focus: 'dashboard', apercu: 'Tendance, RSI, volume, niveaux, score' },
  { id: 'contexte', titre: 'Contexte de marché', icone: '🌡', type: 'contexte', reel: true, dock: 'contexte', focus: 'contexte', apercu: 'VIX, dollar, taux, grandes valeurs' },
  { id: 'agent-btc', titre: 'Agent BTC', icone: '🛰', type: 'agent', reel: true, instrument: 'BTC', unite: 'M15', dock: 'agent', focus: 'agent', apercu: 'Phase du marché, setup, performance' },
  { id: 'alertes', titre: 'Alertes · Veilleur', icone: '🔔', type: 'alertes', reel: true, dock: 'alertes', focus: 'alertes', apercu: 'Entrées, préparations, macro' },
  { id: 'calendrier', titre: 'Calendrier économique', icone: '📅', type: 'calendrier', reel: true, dock: 'calendrier', focus: 'calendrier', apercu: 'Événements à venir, prévu, précédent, réel' },
  { id: 'cot', titre: 'COT · positions des fonds', icone: '🏛', type: 'cot', reel: true, dock: 'cot', focus: 'cot', apercu: 'Positions nettes par catégorie (CFTC)' },
  { id: 'actus-finance', titre: 'Actualités financières', icone: '📰', type: 'actus', reel: true, dock: 'actus', focus: 'actus', apercu: 'Titres classés par impact' },
  { id: 'banques', titre: 'Banques centrales', icone: '🏦', type: 'banques', reel: true, dock: 'banques', focus: 'banques', apercu: 'Fed, BCE, BoE, BoJ… (sources officielles)' },
  { id: 'taux', titre: 'Taux et inflation', icone: '📉', type: 'taux', reel: true, dock: 'taux', focus: 'taux', apercu: 'Courbe 2 / 10 / 30 ans, CPI, chômage' },
  // M6 : Solana et Dogecoin (mêmes bougies réelles que les autres), puis les six fenêtres de PERFORMANCE de l'agent (étiquetées RÉEL / SIMULÉ / BACKTEST / ESTIMÉ ; un clic ouvre le poste sur le bon onglet)
  { id: 'graphique-sol', titre: 'Solana · SOL/USD', icone: '◎', type: 'bougies', reel: true, instrument: 'SOL', unite: 'H1', apercu: 'Bougies H1 réelles' },
  { id: 'graphique-doge', titre: 'Dogecoin · DOGE/USD', icone: 'Ð', type: 'bougies', reel: true, instrument: 'DOGE', unite: 'H1', apercu: 'Bougies H1 réelles' },
  { id: 'perf-strategies', titre: 'Performance des stratégies', icone: '📊', type: 'perf', reel: true, dock: 'agent', focus: 'agent', onglet: 'strategies', apercu: 'Courbes de capital en R (BACKTEST, SIMULÉ)' },
  { id: 'gardien-prop', titre: 'Gardien prop', icone: '🛡', type: 'gardien', reel: true, dock: 'agent', focus: 'agent', onglet: 'gardien', apercu: 'Perte du jour, drawdown, objectif +10 %' },
  { id: 'propositions-agent', titre: 'Propositions de l’agent', icone: '🎯', type: 'propositions', reel: true, dock: 'agent', focus: 'agent', onglet: 'ensemble', apercu: 'Setups, signaux et décision du gardien' },
  { id: 'regime-marche', titre: 'Régime de marché', icone: '🌡', type: 'regime', reel: true, dock: 'agent', focus: 'agent', onglet: 'regime', apercu: 'Score 0-100 de BTC, SOL, DOGE' },
  { id: 'journal-tilt', titre: 'Journal et tilt', icone: '📓', type: 'journaltilt', reel: true, dock: 'agent', focus: 'agent', onglet: 'journal', apercu: 'Trades, discipline, niveau de tilt' },
  { id: 'proba-evaluation', titre: 'Probabilité de réussite', icone: '🎲', type: 'proba', reel: true, dock: 'agent', focus: 'agent', onglet: 'simulation', apercu: 'Évaluation : objectif avant limites (ESTIMÉ)' }
];
export const fenetre = id => FENETRES.find(f => f.id === id) || null;
