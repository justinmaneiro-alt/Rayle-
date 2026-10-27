import { lireMarche } from '../agent-btc/lecture.js';

/* ═════════════ RÉGIME DE MARCHÉ CRYPTO : score composite 0-100 (M6 ; module pur, testé : planetes/mars/tests/m6-regime-test.mjs) ═════════════
   Idée et convention de score reprises du « Crypto Regime Analyzer » de tradermonty/claude-trading-skills (MIT, voir CREDITS.md) : 100 = marché SAIN et favorable à la prise de risque (« risk-on »),
   0 = marché défensif (« risk-off »), composantes pondérées, une composante manquante est écartée et son poids redistribué, zones RISK_ON ≥ 80 / NEUTRE 40-79 / RISK_OFF < 40. Réécrit ici en JavaScript,
   avec des données gratuites et sans clé (Binance pour les bougies et le financement, CoinGecko et alternative.me pour le contexte), calculé POUR UNE PAIRE (BTC, SOL ou DOGE).
   Composantes (chacune de 0 à 100, 100 = favorable) :
   - TENDANCE (25 %)     prix contre la MA 200 H4, pente de la MA 200 H4, phase H1 ;
   - STRUCTURE (15 %)    sommets et creux montants (H1 et H4) ;
   - FINANCEMENT (20 %)  taux de financement des contrats perpétuels contre ses 30 derniers jours : sain entre le 40e et le 75e centile, surchauffe au-delà du 90e (acheteurs surchargés), capitulation sous le 10e ;
   - VOLATILITÉ ET DRAWDOWN (30 %)  volatilité H1 (percentile de l'ATR % sur 30 jours : agitée = moins sain) et distance au plus haut de l'année (drawdown) ;
   - VOLUME (10 %)       volume des 4 dernières heures contre la normale (participation).
   Ce score DÉCRIT l'état du marché, il ne prédit rien et n'autorise ni ne bloque aucun trade à lui seul. L'ÉTIQUETTE de régime (tendance haussière / baissière / range / volatil) vient de règles écrites ici.
   Contexte hors score : peur et cupidité (alternative.me), capitalisation mondiale et dominance du bitcoin (CoinGecko). Aucune IA. */
const bornes = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const f0 = x => Math.round(x);
export const POIDS_REGIME = Object.freeze({ tendance: 0.25, structure: 0.15, financement: 0.20, volatilite: 0.30, volume: 0.10 });
export const ZONES_REGIME = Object.freeze([{ code: 'RISK_ON', min: 80, nom: 'risk-on (conditions saines, favorables à la prise de risque)' }, { code: 'NEUTRE', min: 40, nom: 'neutre (conditions mitigées, pas de conclusion forte)' }, { code: 'RISK_OFF', min: 0, nom: 'risk-off (conditions défensives)' }]);
export const zoneDe = score => ZONES_REGIME.find(z => score >= z.min);

export function percentile(valeurs, x) { const v = valeurs.filter(Number.isFinite); if (v.length < 10 || !Number.isFinite(x)) return null; let k = 0; for (const y of v) if (y <= x) k++; return k / v.length; }
/* Santé du financement selon son percentile p (0..1) : sain 0,40-0,75 ; surchauffe au-dessus de 0,90 ; capitulation sous 0,10 ; progressif entre les deux. */
export function santeFinancement(p) { return p >= 0.4 && p <= 0.75 ? 100 - Math.abs(p - 0.575) * 40 : p > 0.75 ? bornes(100 - (p - 0.75) / 0.25 * 70, 30, 100) : bornes(30 + p / 0.4 * 70, 30, 100); }

/* Plus gros recul depuis le plus haut des 365 derniers jours (ou de ce qu'on a), en %, sur les bougies M15. */
export function drawdownAnnuel(serie) {
  const n = serie.n; if (n < 96 * 30) return null; const a = Math.max(0, n - 96 * 365); let hi = -Infinity; for (let i = a; i < n; i++) if (serie.h[i] > hi) hi = serie.h[i];
  return { pct: (hi - serie.c[n - 1]) / hi * 100, jours: Math.round((n - a) / 96) };
}

export function composantes({ lecture, funding = null, serie = null }) {
  const c = {}, vol = lecture.volatilite, dd = serie ? drawdownAnnuel(serie) : null;
  // volatilité et drawdown
  const sv = vol.percentile != null ? 100 - vol.percentile * 100 : null, sd = dd ? bornes(100 - dd.pct * 3.3) : null, parts = [sv, sd].filter(x => x != null);
  c.volatilite = { nom: 'Volatilité et drawdown', poids: POIDS_REGIME.volatilite, valeur: parts.length ? f0(parts.reduce((s, x) => s + x, 0) / parts.length) : null, etat: parts.length ? 'reel' : 'indisponible',
    texte: (vol.percentile != null ? vol.note + ' (ATR H1 ' + vol.atrH1Pct.toFixed(2).replace('.', ',') + ' % du prix)' : 'volatilité indisponible') + (dd ? ' ; à ' + dd.pct.toFixed(1).replace('.', ',') + ' % sous le plus haut des ' + dd.jours + ' derniers jours' : '') };
  // tendance
  const px = lecture.prix, ma = lecture.ma200.h4, dist = Number.isFinite(ma) ? (px - ma) / ma * 100 : null, pente = lecture.ma200.penteH4Pct, ph = lecture.phase.code;
  if (dist != null) {
    const s = 0.4 * Math.sign(dist) * Math.min(1, Math.abs(dist) / 5) + 0.3 * bornes((pente || 0) / 3, -1, 1) + 0.3 * (ph === 1 ? 1 : ph === 2 ? -1 : 0), dir = f0(50 + 50 * bornes(s, -1, 1));
    c.tendance = { nom: 'Tendance', poids: POIDS_REGIME.tendance, valeur: dir, direction: dir, etat: 'reel', texte: 'prix ' + (dist >= 0 ? 'au-dessus' : 'sous') + ' la MA 200 H4 (' + Math.abs(dist).toFixed(1).replace('.', ',') + ' %), phase H1 : ' + lecture.phase.phase };
  } else c.tendance = { nom: 'Tendance', poids: POIDS_REGIME.tendance, valeur: null, direction: null, etat: 'indisponible', texte: 'MA 200 H4 indisponible (historique trop court)' };
  // financement
  if (funding && funding.length >= 12) {
    const taux = funding.map(x => x.taux), dernier = taux[taux.length - 1], p = percentile(taux.slice(-90), dernier);
    c.financement = { nom: 'Financement', poids: POIDS_REGIME.financement, valeur: p != null ? f0(santeFinancement(p)) : null, etat: p != null ? 'reel' : 'indisponible', percentile: p, taux: dernier,
      texte: 'taux ' + (dernier * 100).toFixed(4).replace('.', ',') + ' % par 8 h, ' + (p == null ? '' : p >= 0.9 ? 'acheteurs très surchargés (surchauffe)' : p >= 0.75 ? 'acheteurs plutôt chargés' : p <= 0.1 ? 'vendeurs très surchargés (capitulation)' : p <= 0.25 ? 'vendeurs plutôt chargés' : 'équilibré') + ' par rapport aux 30 derniers jours' };
  } else c.financement = { nom: 'Financement', poids: POIDS_REGIME.financement, valeur: null, etat: 'indisponible', texte: 'financement indisponible (Binance injoignable ou paire sans contrat perpétuel)' };
  // volume
  const r = lecture.volume.relatif4h;
  c.volume = r != null ? { nom: 'Volume', poids: POIDS_REGIME.volume, valeur: f0(r <= 0.3 ? 0 : r >= 2.5 ? 100 : r <= 1 ? (r - 0.3) / 0.7 * 50 : 50 + (r - 1) / 1.5 * 50), etat: 'reel', texte: lecture.volume.note + ' (' + r.toFixed(1).replace('.', ',') + ' fois la normale sur 4 h)' }
    : { nom: 'Volume', poids: POIDS_REGIME.volume, valeur: null, etat: 'indisponible', texte: 'volume relatif indisponible' };
  // structure
  const sc = t => (/montants/.test(t) ? 1 : /descendants/.test(t) ? -1 : 0);
  c.structure = { nom: 'Structure', poids: POIDS_REGIME.structure, valeur: f0(50 + 25 * sc(lecture.structure.h1) + 25 * sc(lecture.structure.h4)), etat: 'reel', texte: 'H1 : ' + lecture.structure.h1 + ' ; H4 : ' + lecture.structure.h4 };
  return c;
}

export function etiquetteRegime(c) {
  const v = k => (c[k] && c[k].valeur != null ? c[k].valeur : null), vol = c.volatilite && c.volatilite.etat === 'reel' ? c.volatilite : null, t = c.tendance ? c.tendance.direction : null, st = v('structure');
  const agitation = vol && Number.isFinite(vol.agitation) ? vol.agitation : null;
  if (agitation != null && agitation >= 85) return { code: 'volatil', nom: 'volatilité extrême' + (t != null ? (t >= 60 ? ' avec biais haussier' : t <= 40 ? ' avec biais baissier' : '') : '') };
  if (t != null && t >= 65 && (st == null || st >= 50)) return { code: 'tendance_haussiere', nom: 'tendance haussière' };
  if (t != null && t <= 35 && (st == null || st <= 50)) return { code: 'tendance_baissiere', nom: 'tendance baissière' };
  return { code: 'range', nom: 'range ou transition (pas de direction claire)' };
}

/* entrée : { serie (colonnes M15), funding?, fearGreed?, global?, paire? } → régime complet. */
export function calculerRegime({ serie, funding = null, fearGreed = null, global = null, paire = null }) {
  const lecture = lireMarche(serie);
  if (!lecture.ok) return { ok: false, erreur: lecture.raison };
  const c = composantes({ lecture, funding, serie }); c.volatilite.agitation = lecture.volatilite.percentile != null ? f0(lecture.volatilite.percentile * 100) : null;
  const dispo = Object.values(c).filter(x => x.valeur != null), manquantes = Object.values(c).filter(x => x.valeur == null).map(x => x.nom), somme = dispo.reduce((s, x) => s + x.poids, 0);
  for (const x of Object.values(c)) x.poidsEffectif = x.valeur != null && somme > 0 ? x.poids / somme : 0;           // poids redistribué sur les composantes disponibles
  const score = dispo.length ? f0(dispo.reduce((s, x) => s + x.valeur * x.poids, 0) / somme) : null, zone = score == null ? null : zoneDe(score), etiquette = etiquetteRegime(c);
  const contexte = [];
  contexte.push(fearGreed && fearGreed.etat === 'reel' ? { nom: 'Peur et cupidité', valeur: fearGreed.valeur, texte: 'indice ' + fearGreed.valeur + '/100 (' + fearGreed.libelle + '), source alternative.me' } : { nom: 'Peur et cupidité', valeur: null, texte: 'indisponible' });
  contexte.push(global && global.etat === 'reel' ? { nom: 'Marché crypto mondial', valeur: global.variation24h, texte: 'capitalisation ' + (global.variation24h >= 0 ? '+' : '−') + Math.abs(global.variation24h).toFixed(1).replace('.', ',') + ' % sur 24 h, dominance du bitcoin ' + global.dominanceBtc.toFixed(1).replace('.', ',') + ' %, source CoinGecko' } : { nom: 'Marché crypto mondial', valeur: null, texte: 'indisponible' });
  const nomPaire = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }[paire] || (paire || 'Le marché');
  const phrase = nomPaire + ' : régime « ' + etiquette.nom + ' », score ' + (score == null ? '—' : score + '/100') + (zone ? ' (' + zone.nom + ')' : '') + '. 100 = marché sain et favorable à la prise de risque, 0 = défensif. ' +
    dispo.map(x => x.nom.toLowerCase() + ' ' + x.valeur).join(', ') + '. ' + (manquantes.length ? 'Écarté faute de données (son poids est redistribué) : ' + manquantes.join(', ').toLowerCase() + '. ' : '') + 'Ce score décrit l’état du marché, il ne prédit rien et ne décide d’aucun trade.';
  return { ok: true, paire, score, zone, etiquette, composantes: c, manquantes, contexte, phrase, t: serie.t[serie.n - 1] + 900e3, note: 'Aucune IA : règles écrites dans regime.js ; convention de score du Crypto Regime Analyzer (MIT). Contexte hors score.' };
}
