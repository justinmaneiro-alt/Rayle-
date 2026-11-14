/* ═════════════ PANNEAUX DE RAYLE MARCHÉS : quelles mesures, quels événements, quelles actualités ═════════════
   Aucun calcul de marché ici : seulement la composition des vues et deux calculs purs (corrélations, tri du calendrier). Les chiffres viennent du hub, avec leur source. */
import { MOTS_ACTIFS } from './registre.js';

export const COMMANDES = [
  ['OR', 'or', 'Or : proxy PAXG, taux réels, dollar, positions COT'], ['US100', 'us100', 'Nasdaq 100 : VIX, rendements, calendrier'], ['BTC', 'btc', 'Bitcoin : financement, intérêt ouvert, DVOL, peur/avidité, chaîne'],
  ['USD', 'usd', 'Dollar : indice large, EUR/USD, taux'], ['CHF', 'chf', 'Franc suisse : USD/CHF, positions COT, taux'], ['MACRO', 'macro', 'Courbe des taux, taux directeurs, inflation, chômage'],
  ['COT', 'cot', 'Positions CFTC des spéculateurs et commerciaux'], ['CAL', 'calendrier', 'Calendrier officiel des 14 prochains jours (heure de Paris)'], ['NEWS', 'actualites', 'Fil d\'actualités filtrable par actif'],
  ['CORR', 'correlations', 'Corrélations glissantes 30 / 90 jours'], ['SOURCES', 'sources', 'État des sources'], ['VUE', 'ensemble', 'Vue d\'ensemble des marchés']
];
export const ALIAS = { or: 'or', us100: 'us100', btc: 'btc', usd: 'usd', chf: 'chf', gold: 'or', xau: 'or', paxg: 'or', nasdaq: 'us100', ndx: 'us100', bitcoin: 'btc', dollar: 'usd', dxy: 'usd', franc: 'chf', 'franc suisse': 'chf', taux: 'macro', macro: 'macro', cot: 'cot', calendrier: 'calendrier', cal: 'calendrier', agenda: 'calendrier', news: 'actualites', actus: 'actualites', actualites: 'actualites', actualite: 'actualites', corr: 'correlations', correlation: 'correlations', correlations: 'correlations', sources: 'sources', source: 'sources', vue: 'ensemble', ensemble: 'ensemble', accueil: 'ensemble' };
export const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* « COT OR » → { panneau:'cot', actif:'or' } ; « FRED DFII10 » → { panneau:'fred', serie:'DFII10' } ; null si rien ne correspond */
export function lireCommande(texte) {
  const t = norm(texte).replace(/^\//, ''); if (!t) return null;
  const m = t.match(/^fred\s+([a-z0-9_]{2,25})$/i); if (m) return { panneau: 'fred', serie: m[1].toUpperCase() };
  const mots = t.split(' '), p = ALIAS[mots[0]] || ALIAS[mots.slice(0, 2).join(' ')]; if (!p) return null;
  const actif = mots.slice(1).map(x => ALIAS[x]).find(x => ['or', 'us100', 'btc', 'usd', 'chf'].includes(x)) || null;
  return { panneau: p, actif };
}
export const suggestions = (saisie, max = 8) => {
  const t = norm(saisie); const liste = COMMANDES.map(([c, p, d]) => ({ commande: c, panneau: p, description: d }));
  liste.push({ commande: 'COT OR', panneau: 'cot', actif: 'or', description: 'COT de l\'or' }, { commande: 'COT BTC', panneau: 'cot', actif: 'btc', description: 'COT du Bitcoin' }, { commande: 'FRED DFII10', panneau: 'fred', serie: 'DFII10', description: 'Série FRED (taux réel 10 ans)' });
  if (!t) return liste.slice(0, max);
  return liste.filter(s => norm(s.commande).startsWith(t) || norm(s.commande).includes(t) || norm(s.description).includes(t)).slice(0, max);
};

/* Composition de chaque panneau : lots à lire, sections de mesures, filtre d'événements / d'actualités */
const LOTS_PRIX = ['kraken-spot', 'fred', 'cboe', 'frankfurter', 'bce', 'binance-spot'];
export const PANNEAUX = {
  ensemble: { titre: 'Vue d\'ensemble', lots: LOTS_PRIX, sections: [['Prix', ['or.paxg', 'us100.fred', 'btc.kraken', 'usd.large', 'chf.frankfurter', 'eurusd.bce']], ['Volatilité et taux', ['marche.vix', 'taux.ust2', 'taux.ust10', 'taux.ust30', 'taux.reel10']]] },
  or: { titre: 'Or', actif: 'or', lots: ['kraken-spot', 'fred', 'cftc', 'calendrier', 'rss-officiels', 'rss-medias'], sections: [['Prix', ['or.paxg']], ['Moteurs de l\'or', ['taux.reel10', 'usd.large', 'taux.ust10', 'marche.vix']], ['Positions (COT)', ['cot.or.spec', 'cot.or.comm']]], absent: ['Avoirs des ETF d\'or : source publique lisible non trouvée (voir le rapport)', 'Stocks du Comex : fichier Excel binaire non lu (voir le rapport)'] },
  us100: { titre: 'US100 (Nasdaq 100)', actif: 'us100', lots: ['fred', 'cboe', 'cftc', 'calendrier', 'rss-medias', 'rss-officiels'], sections: [['Prix', ['us100.fred']], ['Risque et taux', ['marche.vix', 'taux.ust10', 'taux.ust2', 'taux.pente10_2', 'macro.credit']], ['Positions (COT)', ['cot.us100.spec', 'cot.us100.comm']]], absent: ['Prix en temps réel de l\'indice : non disponible gratuitement (clôture quotidienne seulement)', 'Calendrier des résultats d\'entreprises : source officielle gratuite non trouvée'] },
  btc: { titre: 'Bitcoin', actif: 'btc', lots: ['kraken-spot', 'kraken-futures', 'binance-spot', 'binance-derives', 'deribit', 'altme', 'mempool', 'defillama', 'cftc', 'rss-medias'], sections: [['Prix', ['btc.kraken', 'btc.binance', 'btc.deribit', 'btc.volume24']], ['Dérivés', ['btc.funding', 'btc.funding.kraken', 'btc.oi', 'btc.oi.kraken', 'btc.longshort', 'btc.dvol', 'btc.putcall']], ['Sentiment et chaîne', ['crypto.fng', 'btc.chaine.hauteur', 'btc.chaine.frais', 'defi.tvl', 'defi.stablecoins']], ['Positions (COT)', ['cot.btc.spec', 'cot.btc.comm']]], absent: [] },
  usd: { titre: 'Dollar', actif: 'usd', lots: ['fred', 'bce', 'cftc', 'calendrier', 'rss-officiels'], sections: [['Niveaux', ['usd.large', 'eurusd.bce', 'taux.ust10', 'taux.fed']], ['Positions (COT)', ['cot.usd.spec', 'cot.usd.comm']]], absent: ['Indice DXY (ICE) : non disponible gratuitement ; l\'indice large de la Fed est utilisé à la place'] },
  chf: { titre: 'Franc suisse', actif: 'chf', lots: ['frankfurter', 'fred', 'cftc', 'rss-medias'], sections: [['Niveaux', ['chf.frankfurter', 'chf.fred']], ['Positions (COT)', ['cot.chf.spec', 'cot.chf.comm']], ['Contexte', ['marche.vix', 'taux.ust10']]], absent: ['Taux directeur de la BNS : source officielle lisible non trouvée'] },
  macro: { titre: 'Macro', lots: ['fred', 'bce', 'eurostat', 'insee', 'calendrier'], sections: [['Courbe des taux américains', ['taux.ust2', 'taux.ust10', 'taux.ust30', 'taux.pente10_2', 'taux.reel10']], ['Taux directeurs', ['taux.fed', 'taux.bce']], ['Inflation', ['macro.cpi', 'macro.hicp.ea', 'macro.hicp.fr', 'macro.ipc.fr']], ['Activité, monnaie, crédit', ['macro.chomage', 'macro.m2', 'macro.credit']]], absent: [] },
  cot: { titre: 'COT (CFTC)', lots: ['cftc'], sections: [['Or', ['cot.or.spec', 'cot.or.comm']], ['US100', ['cot.us100.spec', 'cot.us100.comm']], ['Bitcoin', ['cot.btc.spec', 'cot.btc.comm']], ['Dollar', ['cot.usd.spec', 'cot.usd.comm']], ['Franc suisse', ['cot.chf.spec', 'cot.chf.comm']]], absent: [] }
};
export const PANNEAUX_EVENEMENTS = ['or', 'us100', 'usd', 'macro', 'calendrier', 'chf', 'btc'];

/* ─── calendrier : 14 jours à venir, heure de Paris ─── */
export const heureParis = (ms, avecHeure = true) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', ...(avecHeure ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(ms));
export function calendrier14(items, now, jours = 14, actif = null) {
  return items.filter(i => i.type === 'evenement' && i.dateMs >= now - 6 * 3600e3 && i.dateMs <= now + jours * 864e5 && (!actif || (i.actifs || []).includes(actif)))
    .sort((a, b) => a.dateMs - b.dateMs).map(i => ({ ...i, quand: heureParis(i.dateMs, i.heureConnue !== false), heureIndiquee: i.heureConnue !== false }));
}

/* ─── actualités filtrées par actif ─── */
export function filtrerActus(items, actif, max = 30) {
  const l = items.filter(i => i.type === 'actu' && (!actif || (i.actifs || []).includes(actif) || (MOTS_ACTIFS[actif] && MOTS_ACTIFS[actif].test(i.titre))));
  const vus = new Set(), sortie = [];
  for (const i of l.sort((a, b) => b.publieMs - a.publieMs)) { const k = norm(i.titre).slice(0, 60); if (vus.has(k)) continue; vus.add(k); sortie.push(i); if (sortie.length >= max) break; }
  return sortie;
}

/* ─── corrélations glissantes : rendements sur jours ouvrés consécutifs communs (variations pour les taux) ─── */
export const ACTIFS_CORR = [['or', 'Or (PAXG)', 'or.paxg.jour', 'rendement'], ['us100', 'US100', 'us100.fred', 'rendement'], ['btc', 'Bitcoin', 'btc.kraken.jour', 'rendement'], ['usd', 'Dollar large', 'usd.large', 'rendement'], ['reel', 'Taux réel 10 ans', 'taux.reel10', 'difference'], ['chf', 'Franc suisse (USD/CHF)', 'chf.frankfurter', 'rendement']];
const jourOuvre = t => { const d = new Date(t).getUTCDay(); return d !== 0 && d !== 6; };
const cle = t => new Date(t).toISOString().slice(0, 10);
function rendements(pts, mode) {
  const m = new Map(); for (const [t, v] of pts) if (jourOuvre(t) && isFinite(v)) m.set(cle(t), v);
  const out = new Map();
  for (const [k, v] of m) { const prec = new Date(k + 'T00:00:00Z'); prec.setUTCDate(prec.getUTCDate() - (prec.getUTCDay() === 1 ? 3 : 1)); const p = m.get(cle(prec.getTime())); if (p == null) continue; if (mode === 'difference') out.set(k, v - p); else if (p > 0 && v > 0) out.set(k, Math.log(v / p)); }
  return out;
}
export function pearson(a, b) { const n = a.length; if (n < 8) return null; const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; } return saa && sbb ? sab / Math.sqrt(saa * sbb) : null; }
export function correlations(seriesParId, fenetreJours, maintenant = Date.now()) {
  const R = {}; let dernier = null;
  for (const [id, , sid, mode] of ACTIFS_CORR) { const pts = seriesParId[sid]; if (pts && pts.length) { R[id] = rendements(pts, mode); const k = [...R[id].keys()].sort().pop(); if (k && (!dernier || k > dernier)) dernier = k; } }
  if (!dernier) return { fenetreJours, calculeLe: new Date(maintenant).toISOString(), dernierJour: null, actifs: [], matrice: [], n: [] };
  const limite = new Date(dernier + 'T00:00:00Z').getTime() - fenetreJours * 864e5, ids = ACTIFS_CORR.filter(a => R[a[0]]);
  const matrice = ids.map(a => ids.map(b => { if (a[0] === b[0]) return { r: 1, n: null }; const communs = [...R[a[0]].keys()].filter(k => R[b[0]].has(k) && new Date(k + 'T00:00:00Z').getTime() > limite).sort(); const r = pearson(communs.map(k => R[a[0]].get(k)), communs.map(k => R[b[0]].get(k))); return { r: r == null ? null : Math.round(r * 100) / 100, n: communs.length }; }));
  return { fenetreJours, calculeLe: new Date(maintenant).toISOString(), dernierJour: dernier, actifs: ids.map(a => ({ id: a[0], nom: a[1], serie: a[2], methode: a[3] === 'difference' ? 'variation quotidienne' : 'rendement logarithmique quotidien' })), matrice, note: 'Corrélations de Pearson sur les jours ouvrés communs (week-ends exclus), jamais d\'interpolation ; n = nombre de jours utilisés ; peu de jours = peu fiable.' };
}
