/* ═════════════ COPILOTE RAYLE MARCHÉS : réponses sur les données, SANS IA et SANS invention ═════════════
   Associe une question à des mesures du hub par mots-clés, puis répond avec chaque chiffre, sa source et sa date. Aucune mesure trouvée = « je n'ai pas cette donnée ».
   Une mesure périmée est dite périmée. Rien n'est jamais déduit de la mémoire du modèle : le texte est assemblé à partir des mesures reçues. */
import { norm } from './panneaux.js';
import { dateFr } from './normaliser.js';

/* sujets : mots-clés → mesures à citer (dans l'ordre) */
export const SUJETS = [
  { re: /taux reels?|tips|dfii|real yield/, ids: ['taux.reel10'], lots: ['fred'] },
  { re: /rendements?|taux (us|americain|du tresor)|treasur|ust|courbe des taux|pente/, ids: ['taux.ust2', 'taux.ust10', 'taux.ust30', 'taux.pente10_2'], lots: ['fred'] },
  { re: /taux directeur|fed funds|taux de la fed|banque centrale|fomc/, ids: ['taux.fed', 'taux.bce'], lots: ['fred', 'bce'] },
  { re: /bce|ecb|facilite de depot/, ids: ['taux.bce'], lots: ['bce'] },
  { re: /inflation|cpi|ipc|ipch|prix a la conso/, ids: ['macro.cpi', 'macro.hicp.ea', 'macro.hicp.fr', 'macro.ipc.fr'], lots: ['fred', 'eurostat', 'insee'] },
  { re: /chomage|emploi|unemployment/, ids: ['macro.chomage'], lots: ['fred'] },
  { re: /masse monetaire|\bm2\b/, ids: ['macro.m2'], lots: ['fred'] },
  { re: /credit|high yield|haut rendement|spread/, ids: ['macro.credit'], lots: ['fred'] },
  { re: /\bvix\b|volatilite implicite du s|peur/, ids: ['marche.vix', 'marche.vix.fred'], lots: ['cboe', 'fred'] },
  { re: /dollar|usd|dxy/, ids: ['usd.large', 'eurusd.bce'], lots: ['fred', 'bce'] },
  { re: /franc suisse|chf/, ids: ['chf.frankfurter', 'chf.fred'], lots: ['frankfurter', 'fred'] },
  { re: /\bor\b|gold|xau|paxg/, ids: ['or.paxg', 'taux.reel10', 'usd.large', 'cot.or.spec'], lots: ['kraken-spot', 'fred', 'cftc'] },
  { re: /nasdaq|us100|ndx/, ids: ['us100.fred', 'marche.vix', 'cot.us100.spec'], lots: ['fred', 'cboe', 'cftc'] },
  { re: /financement|funding/, ids: ['btc.funding', 'btc.funding.kraken'], lots: ['binance-derives', 'kraken-futures'] },
  { re: /interet ouvert|open interest|\boi\b/, ids: ['btc.oi', 'btc.oi.kraken'], lots: ['binance-derives', 'kraken-futures'] },
  { re: /dvol|volatilite (du )?bitcoin|options/, ids: ['btc.dvol', 'btc.putcall'], lots: ['deribit'] },
  { re: /avidite|fear|greed|sentiment crypto/, ids: ['crypto.fng'], lots: ['altme'] },
  { re: /mempool|chaine|hashrate|frais de transaction|bloc/, ids: ['btc.chaine.hauteur', 'btc.chaine.frais'], lots: ['mempool'] },
  { re: /stablecoins?|tvl|defi/, ids: ['defi.stablecoins', 'defi.tvl'], lots: ['defillama'] },
  { re: /bitcoin|btc|crypto/, ids: ['btc.kraken', 'btc.binance', 'btc.dvol', 'btc.funding'], lots: ['kraken-spot', 'binance-spot', 'deribit', 'binance-derives'] },
  { re: /\bcot\b|positions? (nette|des speculateurs)|speculateurs|commitments/, ids: ['cot.or.spec', 'cot.us100.spec', 'cot.btc.spec', 'cot.usd.spec', 'cot.chf.spec'], lots: ['cftc'] }
];

const fmt = (v, u) => { const a = Math.abs(v), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3; return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v) + (u ? ' ' + u : ''); };
export function phraseMesure(m) {
  if (!m || m.etat === 'indisponible') return (m ? m.libelle : 'Donnée') + ' : indisponible' + (m && m.note ? ' (' + m.note + ')' : '') + '.';
  let t = m.libelle + ' : ' + fmt(m.valeur, m.unite) + ' (source : ' + m.source + ', donnée du ' + dateFr(m.horodatage) + ', ' + m.fraicheur + ', âge ' + m.retardTexte + ').';
  if (m.precedente != null) { const dv = m.valeur - m.precedente; t += ' Précédente : ' + fmt(m.precedente, m.unite) + (m.unite === '$' || m.unite === 'pts' || m.unite === 'indice' ? ' (' + (dv >= 0 ? '+' : '') + (m.precedente ? (dv / m.precedente * 100).toFixed(2) : '?') + ' %)' : ' (' + (dv >= 0 ? '+' : '') + fmt(dv, '') + ')') + '.'; }
  if (m.etat === 'perime') t += ' ATTENTION : donnée périmée, dernière valeur connue.';
  return t;
}

export async function repondre(question, hub) {
  const q = norm(question); if (!q) return { texte: 'Posez une question sur les données de marché affichées.', mesures: [], trouve: false };
  const sujets = SUJETS.filter(s => s.re.test(q)); if (!sujets.length) return { texte: 'Je n\'ai pas cette donnée : la question ne correspond à aucune série du terminal (or, US100, Bitcoin, dollar, franc suisse, taux, inflation, VIX, COT).', mesures: [], trouve: false };
  const ids = [...new Set(sujets.flatMap(s => s.ids))].slice(0, 6), lots = [...new Set(sujets.flatMap(s => s.lots))];
  const m = await hub.mesures(lots), trouvees = ids.map(id => m[id]).filter(Boolean);
  if (!trouvees.length) return { texte: 'Je n\'ai pas cette donnée pour le moment : les sources concernées (' + lots.join(', ') + ') ne répondent pas et aucune dernière valeur n\'est en mémoire.', mesures: [], trouve: false };
  return { texte: trouvees.map(phraseMesure).join(' ') + ' Lecture seule : ce ne sont ni des conseils ni des signaux.', mesures: trouvees.map(x => x.id), trouve: true };
}
