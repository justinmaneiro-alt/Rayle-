/* ═════════════ CLASSEMENT DES ACTUALITÉS FINANCIÈRES PAR IMPACT (M2b ; module pur, testé : finance-test.mjs) ═════════════
   PAR RÈGLES (mots-clés et types d'événements), jamais par IA : zéro jeton, résultat reproductible, chaque classement dit POURQUOI (raisons).
   Pour un titre (et un court résumé), rend : { impact: 'fort' | 'moyen' | 'faible', score, evenements: [...], actifs: ['US100','XAU','BTC','USD','TAUX'], raisons: [...], bougePrix }.
   `bougePrix` = « ce qui fait bouger les prix » : impact fort sur un événement macro, de banque centrale, géopolitique, de résultats d'une très grande valeur ou de régulation crypto.
   Limites assumées : un titre est classé d'après ses MOTS, pas d'après sa véracité ni la surprise réelle des chiffres (un « CPI » prévu et conforme peut peu bouger le marché). */
export const ACTIFS = Object.freeze({ US100: 'Nasdaq 100', XAU: 'Or', BTC: 'Bitcoin', USD: 'Dollar', TAUX: 'Taux' });
export const NOMS_ACTIFS = Object.freeze({ US100: 'le Nasdaq 100', XAU: 'l’or', BTC: 'le Bitcoin', USD: 'le dollar', TAUX: 'les taux' });

const norm = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'").replace(/\s+/g, ' ');
/* Événements : mots (après normalisation sans accent) → poids et actifs touchés. Les motifs sont des expressions régulières sur le texte normalisé. */
const MEGA = 'nvidia|apple|microsoft|amazon|alphabet|google|meta platforms|\\bmeta\\b|tesla|broadcom|netflix|\\bamd\\b|palantir|asml|costco';
const EVENEMENTS = [
  { id: 'banque_centrale', nom: 'banque centrale', poids: 3, actifs: ['US100', 'XAU', 'BTC', 'USD', 'TAUX'], re: /\b(fomc|federal reserve|\bfed\b(?! ex)|rate (cut|hike|decision)|interest rates?|taux directeurs?|baisse des taux|hausse des taux|dot plot|powell|lagarde|\becb\b|\bbce\b|bank of england|\bboe\b|bank of japan|\bboj\b|\bsnb\b|rba\b|quantitative (easing|tightening)|balance sheet|monetary policy|politique monetaire|jackson hole)\b/ },
  { id: 'inflation', nom: 'inflation', poids: 3, actifs: ['US100', 'XAU', 'BTC', 'USD', 'TAUX'], re: /\b(cpi|pce|ppi|inflation|consumer prices?|producer prices?|prix a la consommation|deflation|desinflation|disinflation)\b/ },
  { id: 'emploi', nom: 'emploi', poids: 3, actifs: ['US100', 'XAU', 'BTC', 'USD', 'TAUX'], re: /\b(non-?farm|nfp|payrolls?|jobs report|unemployment|jobless claims|labou?r market|chomage|emploi americain|jolts|adp employment)\b/ },
  { id: 'croissance', nom: 'croissance', poids: 2, actifs: ['US100', 'USD', 'TAUX'], re: /\b(gdp|pib|recession|ism (manufacturing|services)|pmi|retail sales|ventes au detail|consumer (confidence|sentiment))\b/ },
  { id: 'resultats', nom: 'résultats d’entreprise', poids: 2, actifs: ['US100'], re: /\b(earnings|quarterly results?|results? (beat|miss)|revenue (beat|miss|guidance)|guidance|resultats (trimestriels|annuels)|benefices?|profit warning|avertissement sur resultats)\b/ },
  { id: 'geopolitique', nom: 'géopolitique', poids: 2, actifs: ['XAU', 'USD', 'US100'], re: /\b(war|guerre|invasion|missile|ceasefire|cessez-le-feu|sanctions?|tariffs?|droits de douane|trade war|guerre commerciale|opec|strait of hormuz|nuclear|nucleaire|coup|embargo|shutdown)\b/ },
  { id: 'crypto', nom: 'crypto', poids: 2, actifs: ['BTC'], re: /\b(bitcoin|btc|crypto(currency|currencies)?|ethereum|stablecoin|etf spot|bitcoin etf|digital assets?|exchange hack|binance|coinbase|mining|halving|liquidations?)\b/ },
  { id: 'or', nom: 'or', poids: 2, actifs: ['XAU'], re: /\b(gold|xau|bullion|or (record|au plus haut)|safe[- ]haven|valeur refuge|central bank gold|achats d'or)\b/ },
  { id: 'dollar', nom: 'dollar', poids: 1, actifs: ['USD'], re: /\b(dollar index|dxy|greenback|us dollar|dollar americain|euro dollar|eur\/usd|usd\/jpy)\b/ },
  { id: 'taux', nom: 'taux obligataires', poids: 2, actifs: ['TAUX', 'US100', 'USD'], re: /\b(treasury yields?|yields?|10-year|2-year|rendements? (obligataires?|americains?)|obligations?|bond (market|sell-?off|rally)|yield curve|courbe des taux|inversion)\b/ },
  { id: 'tech_ia', nom: 'technologie et IA', poids: 1, actifs: ['US100'], re: /\b(ai\b|artificial intelligence|intelligence artificielle|chips?\b|semiconductors?|semi-?conducteurs?|data cent(er|re)s?|openai|gpu)\b/ },
  { id: 'megacap', nom: 'très grande valeur du Nasdaq 100', poids: 1, actifs: ['US100'], re: new RegExp('\\b(' + MEGA + ')\\b') }
];
/* Intensité : mots qui signalent un mouvement ou une surprise ; atténuation : titres de prévisions ou d’opinion. */
const INTENSITE = /\b(surge[sd]?|plunge[sd]?|crash(es|ed)?|soar(s|ed)?|tumble[sd]?|slump(s|ed)?|spike[sd]?|record|emergency|shock|stuns?|surprise[sd]?|unexpected(ly)?|bondit|s'envole|chute|s'effondre|plonge|flambe|choc|surprise|urgence|historique|panic|rout|meltdown|halt(s|ed)?|ban(s|ned)?|default|bankruptcy|faillite)\b/;
/* Surprise : un chiffre qui bat ou manque les prévisions fait bouger les prix (seulement pour les événements macro, de banque centrale ou de résultats). */
const SURPRISE = /\b(beats?|beat expectations|misses?|missed|tops?|topped|than expected|than forecast|above expectations|below expectations|above forecasts?|below forecasts?|surpass(es|ed)?|plus que prevu|moins que prevu|au-dessus des attentes|sous les attentes|hotter|cooler|stronger|weaker than)\b/;
const ATTENUATION = /\b(what to expect|week ahead|preview|outlook|analysts? say|opinion|explainer|how to|why you|guide|podcast|quiz|ce qu'il faut savoir|a suivre|a quoi s'attendre|requests? public comment|public comment|proposals?|enforcement actions?|termination of|appoint(s|ed|ment)?|consultation|annual report|working paper|research paper|accounts \(|staff report)\b/;
const SEUILS = { fort: 4, moyen: 2 };

/* Classe un élément { titre, resume? } (ou une chaîne). */
export function classer(item) {
  const titre = typeof item === 'string' ? item : (item && item.titre) || '', resume = typeof item === 'string' ? '' : (item && item.resume) || '';
  const t = norm(titre), r = norm(resume).slice(0, 300);
  const evenements = [], actifs = new Set(), raisons = []; let score = 0;
  for (const e of EVENEMENTS) {
    const dansTitre = e.re.test(t), dansResume = !dansTitre && e.re.test(r);
    if (!dansTitre && !dansResume) continue;
    const p = dansTitre ? e.poids : Math.ceil(e.poids / 2);
    score += p; evenements.push(e.id); e.actifs.forEach(a => actifs.add(a));
    raisons.push(e.nom + (dansTitre ? ' dans le titre' : ' dans le résumé') + ' (+' + p + ')');
  }
  if (evenements.length && INTENSITE.test(t)) { score += 1; raisons.push('mot d’intensité dans le titre (+1)'); }
  if (evenements.some(e => ['banque_centrale', 'inflation', 'emploi', 'croissance', 'resultats'].includes(e)) && SURPRISE.test(t)) { score += 1; raisons.push('chiffre qui bat ou manque les attentes (+1)'); }
  if (evenements.length >= 3) { score += 1; raisons.push('plusieurs thèmes à la fois (+1)'); }
  if (evenements.length && ATTENUATION.test(t)) { score -= 1; raisons.push('titre de prévision ou d’opinion (−1)'); }
  const impact = score >= SEUILS.fort ? 'fort' : score >= SEUILS.moyen ? 'moyen' : 'faible';
  const macro = evenements.some(e => ['banque_centrale', 'inflation', 'emploi', 'croissance', 'geopolitique'].includes(e));
  const bougePrix = impact === 'fort' && (macro || evenements.includes('crypto') || (evenements.includes('resultats') && evenements.includes('megacap')));
  return { impact, score, evenements, actifs: ['US100', 'XAU', 'BTC', 'USD', 'TAUX'].filter(a => actifs.has(a)), raisons, bougePrix };
}

export const ORDRE_IMPACT = { fort: 3, moyen: 2, faible: 1 };
/* Classe une liste, ajoute `classe` à chaque élément, trie (impact, puis date récente), filtre par actif ('US100'…) et / ou impact minimal. */
export function classerListe(items, { actif = null, impactMin = null, seulementBougePrix = false } = {}) {
  const out = (items || []).map(it => ({ ...it, classe: classer(it) }));
  return out.filter(x => (!actif || x.classe.actifs.includes(actif)) && (!impactMin || ORDRE_IMPACT[x.classe.impact] >= ORDRE_IMPACT[impactMin]) && (!seulementBougePrix || x.classe.bougePrix))
    .sort((a, b) => ORDRE_IMPACT[b.classe.impact] - ORDRE_IMPACT[a.classe.impact] || (b.t || 0) - (a.t || 0));
}
/* Résumé de répartition pour l'en-tête d'un panneau. */
export function repartition(classes) { const r = { fort: 0, moyen: 0, faible: 0 }; for (const x of classes) r[x.classe.impact]++; return r; }

/* Demande vocale → { actif } (« les actualités qui font bouger le Nasdaq » → US100). */
export function actifDeLaPhrase(texte) {
  const t = norm(texte);
  if (/\b(nasdaq|nas100|us ?100|ndx|wall street|bourse americaine|actions americaines|tech)\b/.test(t)) return 'US100';
  if (/\b(or|gold|xau)\b/.test(t) && !/\b(alors|encore|hier|dehors)\b/.test(t)) return 'XAU';
  if (/\b(bitcoin|btc|crypto|cryptos|ethereum)\b/.test(t)) return 'BTC';
  if (/\b(dollar|dxy|greenback)\b/.test(t)) return 'USD';
  if (/\b(taux|rendements?|obligations?|treasury|treasuries)\b/.test(t)) return 'TAUX';
  return null;
}
