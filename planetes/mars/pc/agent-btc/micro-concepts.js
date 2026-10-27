/* ═════════════ CONCEPTS DE MICROSTRUCTURE DU MARCHÉ BITCOIN (M4 ; module pur, testé : micro-concepts-test.mjs) ═════════════
   Source unique du texte : alimente la voix (« explique l'absorption »), la fenêtre « Agent BTC » (phrase d'explication sous chaque mesure) et le document docs/microstructure-btc.md (généré par
   planetes/mars/outils-agent/generer-doc-micro.mjs). Aucune IA : modèles de phrases rédigés à la main.
   RÈGLES DE LANGAGE : on décrit des MÉCANISMES et des MESURES, jamais des intentions. On ne dit JAMAIS qu'un acteur précis (« les baleines », « les market makers », « les institutions »…) manipule le marché :
   des ordres s'accumulent à certains prix, le prix peut s'en approcher ; on ne sait pas qui les a placés. Chaque concept dit ce qui est ÉTABLI, ce qui est DISCUTÉ, et ses LIMITES. */
import { normaliser } from '../trading/instruments.js';

export const CONCEPTS = [
  {
    id: 'liquidite', nom: 'Liquidité et zones de stops', alias: ['liquidite', 'zones de liquidite', 'zone de liquidite', 'zones de stops', 'zone de stop', 'les stops', 'pools de liquidite', 'liquidity'],
    mecanisme: 'Des ordres s’accumulent à des prix « évidents » : au-dessus des sommets récents, sous les creux récents, autour des plus hauts et plus bas de la veille ou de la séance, près des nombres ronds. Ce sont des stops de positions déjà ouvertes et des ordres d’entrée en cassure. Quand le prix atteint ces zones, beaucoup d’ordres sont exécutés d’un coup : le volume et la volatilité montent, et le prix peut aller plus loin ou revenir.',
    mesure: 'Rayle repère : égaux hauts et égaux bas (plusieurs extrêmes à moins de 0,15 ATR les uns des autres), plus haut et plus bas de la veille, de la semaine et de la séance asiatique, nombres ronds proches. Distance du prix à chaque zone en ATR H1.',
    limites: 'On voit où les ordres sont PROBABLES, pas où ils sont réellement : le carnet d’ordres n’est pas dans les bougies. Une zone « évidente » est vue par tout le monde, ce qui peut aussi l’user.',
    etabli: 'Les ordres se regroupent à des prix ronds et aux extrêmes récents (études sur le marché des changes de la Réserve fédérale de New York, Osler 2000 et 2003) ; la volatilité monte quand ces zones sont touchées.',
    discute: 'Qu’on puisse en tirer un avantage net de frais sur le Bitcoin : très peu de preuves publiques solides.',
    voix: 'La liquidité, ce sont les ordres qui attendent à certains prix : stops au-dessus des sommets récents et sous les creux récents, ordres de cassure, nombres ronds. Quand le prix arrive sur ces zones, beaucoup d’ordres sont exécutés d’un coup, donc le volume et la volatilité montent. Je repère ces zones à partir des bougies : égaux hauts, égaux bas, plus haut et plus bas de la veille et de la séance. Je ne vois pas le carnet d’ordres, donc ce sont des zones probables, pas certaines.'
  },
  {
    id: 'balayage', nom: 'Balayage de liquidité', alias: ['balayage', 'balayage de liquidite', 'sweep', 'liquidity sweep', 'faux breakout', 'chasse aux stops', 'stop hunt', 'mèche de balayage', 'meche de balayage'],
    mecanisme: 'Le prix dépasse brièvement un extrême évident, déclenche les stops et les ordres de cassure qui s’y trouvent, puis referme à l’intérieur de l’ancienne zone. Une fois ces ordres consommés, plus personne n’alimente le mouvement dans ce sens : le prix revient souvent vers l’autre côté. Ce n’est pas la preuve qu’un acteur précis « chasse les stops » : c’est ce qu’on observe quand l’offre ou la demande se tarit après une série d’ordres exécutés.',
    mesure: 'Mèche qui dépasse un extrême des N dernières bougies, clôture revenue à l’intérieur dans 1 à 3 bougies, volume supérieur à la normale. Mesuré sur les extrêmes de la séance asiatique, de la veille et des N dernières bougies.',
    limites: 'Beaucoup de faux signaux : un dépassement de sommet suivi d’une clôture à l’intérieur est courant, et parfois c’est le début d’une vraie cassure. La définition de « revenu à l’intérieur » est arbitraire.',
    etabli: 'Les dépassements d’extrêmes sont suivis d’une hausse temporaire de volume et de volatilité.',
    discute: 'Que le retour ait un avantage statistique exploitable : populaire dans les cercles de trading (méthodes « smart money »), non démontré de façon indépendante. Rayle le teste de façon stricte.',
    voix: 'Un balayage de liquidité, c’est un dépassement bref d’un sommet ou d’un creux évident : les stops et les ordres de cassure qui s’y trouvent sont exécutés, puis le prix referme à l’intérieur. Une fois ces ordres consommés, le mouvement manque de carburant et le prix revient souvent de l’autre côté. Attention : ça ne prouve pas qu’un acteur précis chasse les stops, et c’est aussi souvent le début d’une vraie cassure. Je le mesure avec la mèche, la clôture et le volume, et je le teste en backtest sans rien assouplir.'
  },
  {
    id: 'absorption', nom: 'Absorption', alias: ['absorption', 'absorber', 'absorbe', 'ordres passifs', 'order flow absorption'],
    mecanisme: 'Beaucoup de volume est échangé, mais le prix bouge peu. Si les vendeurs agressifs dominent et que le prix ne baisse pas, des ordres d’achat passifs (limites) absorbent la pression ; l’inverse pour les acheteurs. Le mouvement qui devait venir ne vient pas, ce qui peut précéder un retournement.',
    mesure: 'Volume de la bougie rapporté à la moyenne des 20 précédentes, amplitude rapportée à l’ATR M15, et signe du delta opposé à la direction que le prix « devait » prendre. Une bougie à gros volume, petite amplitude et delta contraire est marquée « absorption possible ».',
    limites: 'Le delta d’une plateforme (ici Binance) ne couvre pas tout le marché. « Acheteur agressif » ne veut pas dire « acheteur motivé ». Une petite amplitude avec gros volume peut aussi être une simple indécision.',
    etabli: 'Le déséquilibre entre ordres agressifs et passifs explique une partie des variations de prix à très court terme (Cont, Kukanov et Stoikov, 2014, marchés d’actions).',
    discute: 'Que l’« absorption » repérée sur des bougies de 15 minutes soit un signal fiable sur le Bitcoin : l’effet documenté concerne des échelles de secondes à minutes.',
    voix: 'L’absorption, c’est beaucoup de volume avec peu de mouvement. Par exemple, les vendeurs agressifs dominent mais le prix ne baisse pas : des ordres d’achat passifs absorbent la pression, et le mouvement attendu ne vient pas. Je la repère avec le volume relatif, l’amplitude de la bougie et le signe du delta. Limites : le delta ne couvre que la plateforme que je lis, et un gros volume avec petite amplitude peut aussi être de l’indécision.'
  },
  {
    id: 'desequilibre', nom: 'Déséquilibre acheteur / vendeur', alias: ['desequilibre', 'desequilibre acheteur vendeur', 'imbalance', 'delta', 'flux d ordres', 'order flow', 'pression acheteuse', 'pression vendeuse'],
    mecanisme: 'À chaque transaction, un camp prend l’initiative (il « paie le spread ») : l’acheteur agressif lève une offre, le vendeur agressif frappe une demande. Quand l’un des deux camps domine pendant plusieurs bougies, la pression pousse le prix dans son sens, jusqu’à ce que les ordres passifs en face s’épuisent ou le fassent céder.',
    mesure: 'Delta = volume acheteur agressif − volume vendeur agressif (réel sur Binance : champ « taker »). Rapport delta / volume par bougie, cumul sur 8 et 24 bougies (CVD), divergences entre le prix et le CVD.',
    limites: 'Une seule plateforme ; le volume des autres plateformes et des contrats à terme n’est pas inclus ici. À 15 minutes, le lien avec la direction suivante est faible et instable.',
    etabli: 'Le déséquilibre du flux d’ordres explique une part importante des variations de prix à très court terme (Cont, Kukanov, Stoikov, 2014).',
    discute: 'La valeur prédictive des divergences prix / CVD à 15 minutes ou plus.',
    voix: 'Le déséquilibre acheteur vendeur mesure qui prend l’initiative : l’acheteur agressif achète au prix demandé, le vendeur agressif vend au prix offert. Le delta est la différence entre les deux volumes, et le CVD est son cumul. Quand un camp domine, il pousse le prix, jusqu’à ce que les ordres passifs en face cèdent. C’est établi à très court terme, mais à quinze minutes le lien avec la direction suivante est faible. Je lis le delta réel de Binance, pas celui du marché entier.'
  },
  {
    id: 'sessions', nom: 'Sessions Asie, Londres, New York', alias: ['sessions', 'session', 'seance', 'seances', 'asie', 'londres', 'new york', 'killzone', 'horaires', 'quelle session', 'session en cours'],
    mecanisme: 'Le Bitcoin se négocie jour et nuit, mais l’activité suit les heures des grandes places : le volume et la volatilité montent à l’ouverture de Londres, puis de New York, et sont plus calmes pendant la nuit européenne. Les sommets et creux de la session asiatique servent souvent de référence (zone de liquidité) pour les sessions suivantes.',
    mesure: 'Heures UTC : Asie 00 h – 08 h, Londres 07 h – 16 h, New York 13 h 30 – 21 h (les chevauchements existent). Rayle donne la session en cours, le haut et le bas de la session asiatique, et la volatilité et le volume relatifs à l’heure habituelle.',
    limites: 'Les heures sont des conventions, qui bougent avec l’heure d’été. L’effet d’une session sur la DIRECTION des prix est faible ; l’effet sur le volume et la volatilité est net.',
    etabli: 'Saisonnalité intrajournalière du volume et de la volatilité du Bitcoin, liée aux horaires des marchés européens et américains (plusieurs études).',
    discute: 'Que des comportements directionnels précis (par exemple « l’Asie crée l’extrême, Londres le balaie ») soient exploitables.',
    voix: 'Les sessions suivent les heures des grandes places financières : Asie de minuit à huit heures UTC, Londres de sept à seize heures, New York de treize heures trente à vingt et une heures. Le Bitcoin se négocie tout le temps, mais le volume et la volatilité montent à l’ouverture de Londres puis de New York. Les extrêmes de la session asiatique servent souvent de repère. L’effet sur la volatilité est net, l’effet sur la direction est faible.'
  },
  {
    id: 'prix_ronds', nom: 'Prix ronds', alias: ['prix ronds', 'prix rond', 'nombres ronds', 'niveaux ronds', 'niveau rond', 'round numbers', 'chiffres ronds'],
    mecanisme: 'Les traders placent leurs ordres sur des nombres faciles : 80 000, 85 000, 100 000 dollars. Des ordres limites, des stops et des objectifs s’y concentrent, ce qui crée des zones où le prix ralentit, rebondit ou accélère en les traversant.',
    mesure: 'Distance du prix au multiple de 5 000 et de 10 000 dollars le plus proche, en ATR H1, et comportement de la bougie quand le niveau est touché (rejet ou franchissement avec volume).',
    limites: 'L’effet est plus visible sur des niveaux très ronds et sur des prix bas ; avec un Bitcoin à plusieurs dizaines de milliers de dollars, les niveaux sont espacés.',
    etabli: 'Concentration d’ordres aux nombres ronds sur le marché des changes (Osler, 2003) ; clustering des prix aux nombres ronds sur de nombreux actifs.',
    discute: 'Que ce soit exploitable sur le Bitcoin après frais.',
    voix: 'Les prix ronds sont des niveaux faciles à retenir comme quatre-vingt mille ou cent mille dollars. Des ordres limites, des stops et des objectifs s’y concentrent, donc le prix y ralentit, rebondit ou accélère en les franchissant. L’effet est documenté sur le marché des changes. Sur le Bitcoin, il est plausible mais pas prouvé comme exploitable après frais. Je mesure la distance au multiple de cinq mille et dix mille dollars le plus proche.'
  },
  {
    id: 'vwap', nom: 'VWAP', alias: ['vwap', 'prix moyen pondere', 'prix moyen pondere par le volume', 'vwap ancre', 'volume weighted'],
    mecanisme: 'Le VWAP est le prix moyen d’une période pondéré par les volumes échangés : combien les participants ont payé en moyenne. Ancré au début de la journée UTC, il sert de repère : au-dessus, les acheteurs de la journée sont en gain en moyenne ; en dessous, ce sont les vendeurs. Les bandes à ± 1 et 2 écarts-types mesurent l’éloignement.',
    mesure: 'VWAP ancré à 00 h UTC avec ses bandes (écart-type pondéré), distance du prix en écarts-types, pente.',
    limites: 'Sur le Bitcoin il n’y a pas de bande de prix unique : ce VWAP vient d’une plateforme (Binance) et diffère légèrement des autres. L’ancrage à minuit UTC est une convention.',
    etabli: 'Le VWAP est la référence d’exécution des grands ordres sur les marchés d’actions.',
    discute: 'Son rôle d’aimant ou de support/résistance sur le Bitcoin : fréquemment cité, peu étudié.',
    voix: 'Le VWAP est le prix moyen de la journée pondéré par les volumes : ce que les participants ont payé en moyenne. Au-dessus, les acheteurs de la journée sont en gain en moyenne, en dessous ce sont les vendeurs. Les bandes montrent l’éloignement en écarts-types. C’est une référence d’exécution sur les actions. Sur le Bitcoin, mon VWAP vient d’une seule plateforme, et son rôle d’aimant est cité mais peu démontré.'
  },
  {
    id: 'volatilite', nom: 'Compression et expansion de volatilité', alias: ['compression', 'expansion', 'compression de volatilite', 'expansion de volatilite', 'volatilite', 'squeeze', 'bollinger', 'regroupement de volatilite'],
    mecanisme: 'La volatilité vient par vagues : des périodes calmes suivies de périodes agitées. Quand l’amplitude des bougies se resserre fortement (compression), une expansion suit en moyenne, mais on ne sait pas dans quel sens.',
    mesure: 'Percentile de l’ATR H1 sur 30 jours, largeur des bandes de Bollinger, rang de l’amplitude de la bougie courante parmi les 7 dernières, rapport ATR court / ATR long.',
    limites: 'Savoir que la volatilité va monter ne dit pas dans quel sens le prix ira. Les cassures de compression sont souvent fausses d’abord.',
    etabli: 'La volatilité se regroupe en grappes (Mandelbrot 1963 ; Engle 1982) et revient vers sa moyenne : c’est l’un des faits les mieux établis des marchés.',
    discute: 'Que trader la direction de la cassure après compression soit rentable.',
    voix: 'La volatilité vient par vagues : des périodes calmes puis des périodes agitées. Quand l’amplitude des bougies se resserre beaucoup, c’est une compression, et une expansion suit en moyenne. C’est l’un des faits les mieux établis des marchés. Mais je ne sais pas dans quel sens le prix partira, et les premières cassures sont souvent fausses. Je mesure le percentile de l’ATR et la largeur des bandes de Bollinger.'
  },
  {
    id: 'financement', nom: 'Taux de financement', alias: ['financement', 'taux de financement', 'funding', 'funding rate', 'le funding', 'perpetuel', 'contrat perpetuel'],
    mecanisme: 'Les contrats perpétuels n’ont pas d’échéance. Pour garder leur prix proche du prix au comptant, les acheteurs paient les vendeurs quand le contrat est plus cher que le comptant, et inversement (toutes les 8 heures sur Binance). Un financement très positif signale beaucoup de positions acheteuses à effet de levier ; très négatif, beaucoup de vendeuses.',
    mesure: 'Taux de financement de Binance (historique complet gratuit depuis 2019), son rang parmi les 90 derniers jours, et le signe. Étiqueté RÉEL pour Binance, UNE plateforme seulement.',
    limites: 'Une plateforme ; le financement est connu seulement aux heures de règlement (00 h, 08 h, 16 h UTC). Un financement élevé peut durer longtemps dans un marché haussier.',
    etabli: 'Le mécanisme (arrimage au prix comptant) ; les extrêmes de financement reflètent un positionnement concentré.',
    discute: 'Que les extrêmes de financement prédisent des retournements : parfois constaté, instable selon les périodes.',
    voix: 'Le financement est un paiement toutes les huit heures entre acheteurs et vendeurs des contrats perpétuels, qui garde leur prix proche du comptant. Quand il est très positif, beaucoup d’acheteurs à effet de levier sont en place, et les positions sont encombrées d’un côté. Les extrêmes sont parfois suivis de retournements, mais ce n’est pas stable. Je lis celui de Binance, une seule plateforme.'
  },
  {
    id: 'interet_ouvert', nom: 'Intérêt ouvert', alias: ['interet ouvert', 'open interest', 'oi', 'l interet ouvert', 'positions ouvertes'],
    mecanisme: 'L’intérêt ouvert est le nombre de contrats à terme encore ouverts. S’il monte avec le prix, de nouvelles positions s’ouvrent (souvent acheteuses) ; s’il baisse avec le prix, des positions se ferment ou sont liquidées ; s’il monte quand le prix baisse, de nouvelles positions vendeuses s’ouvrent. Plus il y a de positions avec effet de levier, plus un mouvement brusque peut en forcer la fermeture.',
    mesure: 'Intérêt ouvert Binance USD-M (archives gratuites, pas de 5 minutes depuis 2020), variation sur 1 h et 24 h comparée au prix, rapport long/short des comptes et des gros comptes. Étiqueté RÉEL pour Binance seulement.',
    limites: 'Une plateforme (les autres existent) ; l’interprétation « nouveaux acheteurs ou nouveaux vendeurs » est une lecture, pas une mesure : chaque contrat a un acheteur et un vendeur.',
    etabli: 'Les chutes brutales d’intérêt ouvert accompagnent les liquidations en chaîne.',
    discute: 'La valeur prédictive de l’intérêt ouvert pour la direction future.',
    voix: 'L’intérêt ouvert est le nombre de contrats à terme encore ouverts. S’il monte avec le prix, de nouvelles positions s’ouvrent. S’il baisse brusquement avec un gros mouvement, des positions sont fermées ou liquidées. Attention : chaque contrat a un acheteur et un vendeur, donc dire qui ouvre est une lecture, pas une mesure. Je lis celui de Binance, une seule plateforme.'
  },
  {
    id: 'liquidations', nom: 'Liquidations', alias: ['liquidations', 'liquidation', 'liquidations en chaine', 'cascade de liquidations', 'cascade', 'liquidated', 'rekt'],
    mecanisme: 'Quand le prix va contre une position à effet de levier et que la marge ne suffit plus, la plateforme la ferme de force au marché. Ces ordres forcés s’ajoutent au mouvement et peuvent déclencher d’autres liquidations (cascade). Après la cascade, la pression forcée disparaît.',
    mesure: 'Pas de donnée complète gratuite : Binance ne fournit plus l’historique et ne diffuse qu’un échantillon ; OKX donne les toutes dernières seulement. Rayle fabrique un PROXY ESTIMÉ : forte baisse de l’intérêt ouvert pendant une bougie ou une série de bougies de grande amplitude.',
    limites: 'Le proxy peut se tromper : l’intérêt ouvert baisse aussi quand des traders ferment volontairement. Aucun montant de liquidation n’est affiché comme réel.',
    etabli: 'Le mécanisme, et le fait que les cascades de liquidations existent lors de forts mouvements.',
    discute: 'La possibilité d’en tirer un signal systématique sans données complètes.',
    voix: 'Une liquidation, c’est la fermeture forcée d’une position à effet de levier quand la marge ne suffit plus. Ces ordres forcés s’ajoutent au mouvement et peuvent déclencher d’autres liquidations en chaîne. Il n’existe pas de donnée complète gratuite, donc je n’affiche aucun montant réel. Je fabrique seulement un indice estimé, à partir d’une forte baisse de l’intérêt ouvert pendant une grosse bougie, et je l’étiquette estimé.'
  }
];

export const CONCEPTS_PAR_ID = Object.fromEntries(CONCEPTS.map(c => [c.id, c]));

/* Phrase parlée → { sujet: 'micro', concept } ou { sujet: 'session' | 'zones' } ou null.
   « explique l'absorption », « c'est quoi le funding », « quelle session est en cours ? », « où sont les zones de liquidité ? » */
export function detecterQuestionMicro(texte) {
  const t = normaliser(texte); if (!t || t.split(' ').length > 16) return null;
  const q = /\b(?:explique|expliquer|c est quoi|qu est ce que|qu est ce qu|que veut dire|que signifie|definis|definition|parle moi|dis moi|comment marche|a quoi sert)\b/.test(t) || /^qu\b/.test(t);
  if (/\b(?:quelle|quel)\b/.test(t) && /\bsession\b/.test(t) && /\b(?:cours|actuelle|maintenant|en ce moment|on est)\b/.test(t)) return { sujet: 'session' };
  if (/\b(?:ou sont|ou est|quelles sont|montre|donne|affiche|y a t il)\b/.test(t) && /\b(?:zones? de liquidite|liquidite|zones? de stops?|stops?|pools? de liquidite)\b/.test(t)) return { sujet: 'zones' };
  if (/\b(?:ou sont|quelles sont|montre|donne)\b/.test(t) && /\bprix ronds?\b|\bnombres? ronds?\b/.test(t)) return { sujet: 'zones' };
  if (/\bqu est ce qui\b|\bresume\b|\blecture\b|\bcomprends? tu\b/.test(t) && /\bmicrostructure\b/.test(t)) return { sujet: 'micro_resume' };
  if (!q && !/\bexplique/.test(t)) return null;
  let meilleur = null, taille = 0;
  for (const c of CONCEPTS) for (const a of c.alias) { if (a.length > taille && new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t)) { meilleur = c; taille = a.length; } }
  return meilleur ? { sujet: 'micro', concept: meilleur.id } : null;
}

/* Texte parlé d'un concept (aucune donnée du marché : voir explications.js pour la version avec les mesures en cours). */
export function expliquerConcept(id) { const c = CONCEPTS_PAR_ID[id]; return c ? c.voix : null; }
/* Phrase courte pour la fenêtre (une ligne sous chaque mesure). */
export function phraseCourte(id) { const c = CONCEPTS_PAR_ID[id]; if (!c) return ''; const m = c.mecanisme; const i = m.indexOf('. '); return i > 0 ? m.slice(0, i + 1) : m; }
