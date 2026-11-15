/* ═════════════ IMPACT D'UNE ACTUALITÉ SUR UN ACTIF : règles de lecture (sans IA) ═════════════
   Chaque règle décrit un MÉCANISME classique en « si… alors… », jamais une prévision, une probabilité ou un conseil. Sans règle applicable : on le dit.
   (L'explication par l'IA de Rayle est facultative et se demande par un bouton ; ces règles fonctionnent même sans Worker.) */
const R = [
  { id: 'fed', motif: /\bfed\b|powell|fomc|federal reserve|rate (cut|hike)|interest rate|baisse des taux|hausse des taux/i, theme: 'Taux et banque centrale', texte: {
    or: 'Si les marchés comprennent un ton plus accommodant (baisses de taux), les taux réels baissent et le dollar fléchit : mécanisme plutôt favorable à l’or. Un ton plus ferme joue en sens inverse.',
    us100: 'Les valeurs de croissance du Nasdaq sont sensibles aux taux : un ton plus accommodant soutient plutôt leurs valorisations, un ton plus ferme les pèse.',
    us500: 'Des taux plus bas soutiennent plutôt les valorisations des actions ; des taux plus hauts les pèsent, surtout pour les valeurs de croissance.',
    btc: 'Le bitcoin réagit souvent à la liquidité : des taux plus bas lui sont plutôt favorables, des taux plus hauts plutôt défavorables.',
    sol: 'Comme les autres cryptomonnaies, Solana réagit à la liquidité : taux plus bas plutôt favorable, taux plus hauts plutôt défavorable.',
    dxy: 'Un ton plus ferme de la Fed soutient plutôt le dollar ; un ton plus accommodant le fragilise.' } },
  { id: 'inflation', motif: /inflation|\bcpi\b|\bpce\b|consumer prices|prix à la consommation/i, theme: 'Inflation', texte: {
    or: 'Si l’inflation surprend à la hausse, elle peut soutenir l’or comme protection, mais elle peut aussi relever les taux attendus, ce qui le pèse : les deux effets se contredisent, regarder la réaction des taux réels.',
    us100: 'Une inflation plus forte que prévu peut faire remonter les taux attendus, ce qui pèse plutôt sur les valeurs de croissance.',
    us500: 'Une inflation plus forte que prévu peut relever les taux attendus et peser sur les actions ; une inflation plus faible les soulage.',
    btc: 'Une inflation plus faible que prévu (baisses de taux plus probables) est plutôt lue positivement par le bitcoin ; l’inverse plutôt négativement.',
    sol: 'Même logique que le bitcoin : inflation plus faible plutôt favorable, plus forte plutôt défavorable.',
    dxy: 'Une inflation plus forte que prévu soutient plutôt le dollar via des taux plus hauts attendus.' } },
  { id: 'emploi', motif: /jobs|payroll|nonfarm|non-farm|unemployment|jobless|emploi|chômage/i, theme: 'Emploi américain', texte: {
    or: 'Un marché du travail plus fort que prévu soutient plutôt le dollar et les taux, ce qui pèse sur l’or ; un marché plus faible rend les baisses de taux plus probables, ce qui le soutient.',
    us100: 'Des chiffres très forts peuvent inquiéter (taux plus hauts) ; des chiffres très faibles peuvent inquiéter (croissance) : la réaction dépend de ce que le marché craint à ce moment.',
    us500: 'Même ambiguïté que pour le Nasdaq : « bonne nouvelle = mauvaise nouvelle » selon que le marché craint les taux ou la récession.',
    btc: 'Des chiffres faibles qui rendent les baisses de taux plus probables sont plutôt lus positivement ; des chiffres forts plutôt négativement.',
    sol: 'Même lecture que le bitcoin.', dxy: 'Des chiffres plus forts que prévu soutiennent plutôt le dollar.' } },
  { id: 'geopolitique', motif: /\bwar\b|attack|missile|sanction|conflict|tension|ceasefire|guerre|invasion|strike on/i, theme: 'Géopolitique', texte: {
    or: 'Une montée des tensions pousse souvent des capitaux vers les valeurs refuge dont l’or ; une détente joue plutôt en sens inverse.',
    us100: 'Une montée des tensions pèse plutôt sur les actions (aversion au risque) ; une détente les soutient.',
    us500: 'Une montée des tensions pèse plutôt sur les actions ; une détente les soutient.',
    btc: 'Réaction variable : parfois traité comme actif de risque (baisse), parfois comme refuge ; observer la réaction plutôt que la supposer.',
    sol: 'Actif plus risqué que le bitcoin : une aversion au risque le pèse plutôt.', dxy: 'Le dollar sert souvent de refuge en cas de tension.' } },
  { id: 'douane', motif: /tariff|trade war|customs|douane|droits de douane|trade deal/i, theme: 'Commerce et droits de douane', texte: {
    or: 'Des droits de douane accrus alimentent l’incertitude et le besoin de protection (plutôt favorable à l’or) mais peuvent aussi renforcer le dollar.',
    us100: 'Les valeurs technologiques, très exposées aux chaînes d’approvisionnement mondiales, réagissent plutôt négativement à une escalade.',
    us500: 'Une escalade pèse plutôt sur les actions exposées à l’international ; un accord les soulage.',
    btc: 'Effet indirect : l’aversion au risque pèse plutôt, la défiance envers les monnaies peut soutenir.', sol: 'Effet indirect, comme le bitcoin.', dxy: 'Le dollar tend à se renforcer en cas d’escalade, mais cela dépend du camp touché.' } },
  { id: 'resultats', motif: /earnings|results|guidance|revenue|nvidia|apple|microsoft|alphabet|amazon|meta\b|tesla|résultats/i, theme: 'Résultats d’entreprises', texte: {
    us100: 'Les grandes valeurs technologiques pèsent lourd dans le Nasdaq 100 : des résultats ou des prévisions meilleurs que prévu soutiennent l’indice, des déceptions le pèsent.',
    us500: 'Les mêmes grandes valeurs pèsent aussi dans le S&P 500 (moins que dans le Nasdaq).' } },
  { id: 'banques-centrales-or', motif: /central bank.*gold|gold reserves|world gold council|wgc|gold demand|achats d’or/i, theme: 'Demande d’or', texte: {
    or: 'Des achats soutenus des banques centrales ou une demande en hausse soutiennent plutôt le prix de l’or sur la durée ; une baisse de la demande l’affaiblit.' } },
  { id: 'dollar', motif: /dollar|dxy|greenback/i, theme: 'Dollar', texte: {
    or: 'Le dollar et l’or évoluent souvent en sens inverse : un dollar plus fort pèse plutôt sur l’or, un dollar plus faible le soutient.',
    btc: 'Un dollar plus fort pèse plutôt sur le bitcoin (liquidité plus rare), un dollar plus faible le soutient.', dxy: 'C’est l’actif concerné.' } },
  { id: 'petrole', motif: /\boil\b|crude|opec|brent|pétrole|energy prices/i, theme: 'Pétrole et énergie', texte: {
    or: 'Un pétrole en forte hausse relance les craintes d’inflation (effet ambigu pour l’or : soutien comme protection, mais taux attendus plus hauts).',
    us100: 'Un pétrole nettement plus cher pèse plutôt sur les marges et la consommation, donc sur les actions.', us500: 'Même mécanisme : pétrole plus cher plutôt négatif, sauf pour le secteur énergétique.' } },
  { id: 'crypto', motif: /bitcoin|crypto|etf flows|stablecoin|sec .*crypto|ethereum|solana/i, theme: 'Crypto-actifs', texte: {
    btc: 'Des entrées dans les ETF ou un cadre réglementaire plus clair soutiennent plutôt le bitcoin ; des sorties ou des restrictions le pèsent.',
    sol: 'Solana suit le marché crypto avec un effet amplifié ; les annonces propres à Solana (ETF, réseau) comptent aussi.' } }
];
export function expliquerImpact(item, actifId) {
  const t = `${item && item.titre || ''} ${item && item.resume || ''}`, trouvees = [];
  for (const r of R) if (r.motif.test(t) && r.texte[actifId]) trouvees.push({ theme: r.theme, texte: r.texte[actifId] });
  return trouvees.length ? { regles: trouvees.slice(0, 2), texte: trouvees.slice(0, 2).map(x => `${x.theme} : ${x.texte}`).join(' ') } : { regles: [], texte: 'Pas de lien direct reconnu avec cet actif par les règles de lecture : à lire comme contexte général.' };
}
export const THEMES = R.map(r => r.theme);
