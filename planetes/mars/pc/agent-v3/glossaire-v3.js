/* ═════════════ GLOSSAIRE DE L'AGENT (module pur, testé : galaxie/tests/agent-page-test.mjs) ═════════════
   Chaque mot technique est expliqué en UNE ligne, au survol (souris), au toucher / au focus (tablette, téléphone). `annoter(htmlEchappe)` entoure la PREMIÈRE occurrence de chaque terme
   d'une balise <abbr> ; il ne touche pas aux balises ni aux attributs déjà présents. Les définitions sont de la culture générale du trading, pas des données : aucune n'est un chiffre. */
export const TERMES = Object.freeze({
  'POC': 'Point de contrôle : le prix auquel il s’est échangé le plus de volume sur la période. Le prix y revient souvent.',
  'VWAP': 'Prix moyen de la séance pondéré par les volumes : le « prix juste » du jour pour beaucoup de traders.',
  'delta': 'Écart entre le volume des acheteurs agressifs et celui des vendeurs agressifs : positif = les acheteurs dominent.',
  'absorption': 'Un gros volume qui n’arrive pas à faire bouger le prix : quelqu’un absorbe tout ce qui est vendu (ou acheté).',
  'microstructure': 'Ce qui se passe dans les ordres eux-mêmes (volume acheteur ou vendeur, déséquilibres), plus fin que la simple bougie.',
  'espérance': 'Gain moyen par trade, en R, frais déduits. Positive = la stratégie gagne en moyenne ; ce n’est pas une promesse.',
  'hors échantillon': 'Mesuré sur des données que la stratégie n’a jamais vues pendant qu’on réglait ses paramètres : seule mesure honnête.',
  'walk-forward': 'On règle la stratégie sur le passé, on la teste sur la période suivante, puis on recommence en avançant dans le temps.',
  'backtest': 'Rejouer une stratégie sur des données passées pour voir ce qu’elle aurait donné. Les résultats passés ne garantissent rien.',
  'drawdown': 'Creux maximal : la plus grosse baisse du compte depuis son plus haut. Le compte prop impose 6 % au maximum.',
  'Sharpe déflaté': 'Probabilité que le résultat ne soit pas dû au hasard, compte tenu de TOUTES les variantes testées : plus on teste, plus la barre monte.',
  'bootstrap': 'On rejoue les trades au hasard des milliers de fois pour voir à quel point le résultat dépend de la chance.',
  'variantes testées': 'Nombre de réglages de stratégies essayés depuis le début. Ce n’est pas une note de qualité : plus il est grand, plus le hasard peut faire illusion, donc plus la preuve exigée est forte.',
  'faux breakout': 'Le prix perce un niveau évident puis revient aussitôt : les ordres placés derrière ce niveau ont été « pris ».',
  'prise de liquidité': 'Le prix va chercher les ordres (stops) rangés derrière un plus haut ou un plus bas évident, puis repart dans l’autre sens.',
  'retest': 'Après une cassure, le prix revient toucher le niveau cassé avant de repartir : on entre sur ce retour.',
  'range': 'Le prix évolue dans une boîte, entre un haut et un bas, sans tendance.',
  'divergence RSI': 'Le prix fait un nouveau creux (ou sommet) mais l’indicateur RSI, lui, ne confirme pas : l’élan s’essouffle.',
  'ATR': 'Amplitude moyenne d’une bougie : sert à placer un stop proportionnel à la volatilité du moment.',
  'R': 'Unité de gain : 1 R = ce que tu risques sur le trade (la distance jusqu’au stop). +2 R = deux fois la mise risquée.',
  'dérive': 'La stratégie fait durablement moins bien que son backtest ne le prévoyait : elle est mise en pause.',
  'simulation': 'Compte fictif de 10 000 $ où l’agent « trade » en direct sans argent : étape obligatoire avant toute alerte d’entrée réelle.',
  'compte prop': 'Compte financé par une société après une évaluation : règles strictes (ici 10 % d’objectif, 3 % de perte par jour, 6 % de creux).',
  'MA200': 'Moyenne mobile des 200 dernières bougies : la tendance de fond.',
  'volume profile': 'Histogramme du volume par niveau de prix (et non par temps) : montre où le marché a « accepté » le prix.'
});
const ordre = Object.keys(TERMES).sort((a, b) => b.length - a.length);
export const definition = t => TERMES[t] || null;
const echapAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/* `html` DOIT déjà être échappé. Les balises existantes sont laissées intactes. */
export function annoter(html) {
  const morceaux = String(html).split(/(<[^>]*>)/), faits = new Set(), dansAbbr = { n: 0 }, balises = [];
  const sortie = morceaux.map(m => {
    if (m.startsWith('<')) { if (/^<abbr\b/i.test(m)) dansAbbr.n++; else if (/^<\/abbr>/i.test(m)) dansAbbr.n--; return m; }
    if (dansAbbr.n > 0) return m;
    let t = m;
    for (const mot of ordre) {
      if (faits.has(mot)) continue;
      const re = new RegExp('(^|[^\\p{L}\\p{N}_])(' + mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\p{L}\\p{N}_])', 'u');
      const mm = re.exec(t); if (!mm) continue;
      faits.add(mot); balises.push('<abbr class="av3-t" tabindex="0" title="' + echapAttr(TERMES[mot]) + '" data-def="' + echapAttr(TERMES[mot]) + '">' + mm[2] + '</abbr>');
      t = t.slice(0, mm.index + mm[1].length) + '\u0001' + (balises.length - 1) + '\u0002' + t.slice(mm.index + mm[1].length + mm[2].length);   // marqueur sans lettre : les termes suivants ne peuvent pas s'y accrocher
    }
    return t;
  }).join('');
  return sortie.replace(/\u0001(\d+)\u0002/g, (_, i) => balises[+i]);
}
