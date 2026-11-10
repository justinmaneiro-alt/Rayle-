/* ═════════════ TERMINAL : RAYLE DÉCRIT, FAIT LE POINT ET EXPLIQUE (pur, testé : agent-trading/tests/terminal-voix-test.mjs) ═════════════
   · « Décris mon terminal »  → ce qui est AFFICHÉ (actif, unité, couches, outils, positions), sans IA, sans rien inventer ;
   · « Fais-moi le point »     → briefing de 30 à 60 secondes, dans l'ordre : prix et tendance, SMA 200, niveaux, carnet, annonces, COT, santé, positions,
                                 un ou deux scénarios (validation, invalidation), puis « information de lecture, pas un signal » ;
   · « Explique-moi le COT / la santé du marché / ce tableau de bord / ce niveau » → mode pédagogique (« comme à un débutant », « en détail »),
                                 puis la lecture du moment ;
   · relances (« et le carnet ? », « pourquoi ? », « en détail ») : la conversation reste suivie.
   Règles : aucun chiffre qui ne vienne de l'état ; une donnée absente se dit ; jamais d'ordre ; aucune prévision présentée comme certaine. */
import { MENTION_LECTURE } from './lecture-rayle.js';
import { texteSection } from './sections-rayle.js';

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
const r1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const DEV = { USD: 'américain', EUR: 'européen', GBP: 'britannique', JPY: 'japonais', CHF: 'suisse', CAD: 'canadien', AUD: 'australien', NZD: 'néo-zélandais', CNY: 'chinois' };
const Le = n => (n === 'Or' ? 'L’or' : 'Le ' + n), de = n => (n === 'Or' ? 'de l’or' : 'du ' + n);

/* ───────── intention (avant l'intention de lecture-rayle.js ; null si la phrase n'est pas pour ce module) ───────── */
export function niveauPedagogique(texte) {
  const t = norm(texte);
  if (/(debutant|comme (a|si) (un )?(enfant|novice)|tres simple|simplement|vulgaris|facon simple|pour les nuls|sans jargon)/.test(t)) return 'debutant';
  if (/(en detail|plus en detail|detaille|approfondi|a fond|technique|complet|precisement)/.test(t)) return 'detail';
  return 'normal';
}
const SUJETS = [
  ['cot', /\b(cot|commitments? of traders|positionnement des (grands )?(acteurs|speculateurs))\b/],
  ['sante', /(sante|sante du marche|etat du marche|volatilite)/],
  ['tableau', /(tableau de bord|dashboard|tableau multi|score)/],
  ['ma200', /(ma ?200|moyenne mobile|sma ?200|moyenne 200)/],
  ['carnet', /(carnet|order ?book|gros paquets|murs?)/],
  ['niveau', /(niveau|support|resistance|zone)/]
];
export function intentionVoix(texte, { derniere = null, maintenant = Date.now() } = {}) {
  const t = norm(texte).trim();
  if (!t) return null;
  if (/\b(achete|vends|vend|passe (un |l')?ordre|execute)\b/.test(t) && !/propose/.test(t)) return null;   // les ordres sont refusés par lecture-rayle.js
  if (/(decris|decrit|decrire|raconte|dis).{0,25}(mon |le |l')?(terminal|ecran|graphique)|qu'est[- ]ce (qui est|qu'il y a|que j'ai) (affiche|sur (mon |l')?(ecran|terminal|graphique))|ce que je (vois|regarde)|qu'est[- ]ce que je regarde/.test(t)) return { type: 'decrire' };
  if (/(fais|donne|fait)[- ]moi (le |un )?(point|briefing|bilan|resume)|fais (le )?point|le point (sur|complet)|briefing|etat des lieux|bilan du marche|resume (moi )?(le )?marche/.test(t)) return { type: 'point' };
  if (/(explique|expliquer|expliquez|c'est quoi|qu'est[- ]ce que (c'est|veut dire|signifie)|que (veut dire|signifie)|comment (lire|comprendre|interpreter|on lit)|a quoi (sert|servent)|apprends|montre[- ]moi comment)/.test(t)) {
    for (const [id, re] of SUJETS) if (re.test(t)) return { type: 'expliquer', sujet: id, niveau: niveauPedagogique(t) };
    if (/(ce tableau|cette section|ca|cela)/.test(t) && derniere) return { type: 'relance', niveau: niveauPedagogique(t) };
  }
  if (derniere && maintenant - derniere.t < 4 * 60e3 && /^(et |et alors|alors|pourquoi|comment (ca|cela)|developpe|plus de details?|en detail|explique(-moi)? (mieux|plus|encore)|vas-y|continue|repete|redis|c'est a dire|ca veut dire quoi|que veux-tu dire)/.test(t)) {
    for (const [id, re] of SUJETS) if (re.test(t)) return { type: 'expliquer', sujet: id, niveau: niveauPedagogique(t) };
    return { type: 'relance', niveau: niveauPedagogique(t) };
  }
  return null;
}

/* ───────── « décris mon terminal » ───────── */
export function decrire(E, info = {}, { fmt = x => String(x) } = {}) {
  const P = [];
  if (!(E.prix > 0)) P.push(`Tu regardes ${E.nomActif} en ${E.unite}, mais le prix n’est pas encore arrivé.`);
  else P.push(`Tu regardes ${E.nomActif === 'Or' ? 'l’or' : E.nomActif} en ${E.unite}, le prix est à ${fmt(E.prix)}${E.tendance && E.tendance.sens !== 'inconnue' ? `, tendance ${E.tendance.sens}` : ''}.`);
  const c = info.couches || [];
  P.push(c.length ? `Couches affichées : ${c.join(', ')}.` : 'Le graphique est vierge : aucune couche en plus des bougies.');
  const o = info.outils || {};
  const n = (o.lignes || 0) + (o.zones || 0) + (o.autres || 0);
  if (n) P.push(`Tu as ${n} dessin${n > 1 ? 's' : ''} : ${[o.lignes ? `${o.lignes} ligne${o.lignes > 1 ? 's' : ''}` : '', o.zones ? `${o.zones} zone${o.zones > 1 ? 's' : ''}` : '', o.autres ? `${o.autres} autre${o.autres > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}.`);
  else P.push('Aucun dessin de toi sur ce graphique.');
  const pos = E.positions || [];
  if (pos.length) { const ou = pos.filter(p => p.etat === 'ouverte').length, at = pos.filter(p => p.etat === 'attente').length, pr = pos.filter(p => p.etat === 'proposee').length;
    P.push(`Positions suivies : ${[ou ? `${ou} ouverte${ou > 1 ? 's' : ''}` : '', at ? `${at} en attente` : '', pr ? `${pr} proposée${pr > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}. Ce sont des positions simulées.`); }
  else P.push('Aucune position en cours.');
  if (E.scenarios && E.scenarios.liste && E.scenarios.liste.length && c.includes('Scénarios de Rayle')) P.push(`Mes scénarios sont tracés (${E.scenarios.liste.length}).`);
  P.push(E.carnet ? 'Le carnet d’ordres est reçu.' : 'Le carnet d’ordres n’est pas encore reçu.');
  return P.join(' ');
}

/* ───────── « fais-moi le point » : 30 à 60 secondes ───────── */
export function motsParles(texte) {   // estimation des mots réellement prononcés : un nombre de n chiffres devient ~ n/2 + 2 mots
  return String(texte).split(/\s+/).filter(Boolean).reduce((n, m) => { const d = (m.match(/\d/g) || []).length; return n + (d ? Math.ceil(d / 2) + 2 : 1); }, 0);
}
export function dureeEstimee(texte) { return Math.round(motsParles(texte) / 2.7); }   // ≈ 2,7 mots par seconde (voix un peu lente, mesuré sur Kokoro)
export function briefing(E, X = {}, { fmt = x => String(x), heure = t => new Date(t).toISOString(), maintenant = Date.now() } = {}) {
  const P = [];
  if (!(E.prix > 0)) return `Je n’ai pas le prix ${de(E.nomActif)} pour l’instant, je ne peux pas faire le point. ${MENTION_LECTURE}`;
  // 1. prix et tendance
  P.push(`D’abord le prix. ${Le(E.nomActif)} est à ${fmt(E.prix)} en ${E.unite}${E.tendance && E.tendance.sens !== 'inconnue' ? `, tendance ${E.tendance.sens}` : ', tendance pas claire'}.`);
  // 2. SMA 200
  if (E.ma200) P.push(`Moyenne mobile deux cents à ${fmt(E.ma200.valeur)}, le prix est ${E.ma200.cote}${E.ma200.proche ? ' et elle est tout près' : ''}.`);
  else P.push('Pas assez de bougies pour la moyenne mobile deux cents.');
  // 3. niveaux et zones qui comptent
  const s = E.niveaux && E.niveaux.dessous[0], r = E.niveaux && E.niveaux.dessus[0];
  P.push(s || r ? `Niveaux qui comptent : ${r ? `résistance ${fmt(r.p)}` : 'pas de résistance marquée'}, ${s ? `support ${fmt(s.p)}` : 'pas de support marqué'}.` : 'Aucun niveau marqué autour du prix.');
  // 4. carnet d'ordres
  if (E.carnet) {
    const q = [E.carnet.lecture];
    const mur = E.carnet.mursVente[0] || E.carnet.mursAchat[0]; if (mur) q.push(`mur ${E.carnet.mursVente[0] ? 'vendeur' : 'acheteur'} vers ${fmt(mur.p)}`);
    const g = E.carnet.paquets && E.carnet.paquets[0]; if (g) q.push(`gros paquet récent en ${g.cote}`);
    P.push(`Carnet : ${q.join(', ').replace(/^carnet /, '')}.`);
  } else P.push('Carnet pas encore reçu.');
  // 5. annonces à venir
  const an = (X.annonces || E.annonces || []).filter(a => a.t >= maintenant && (a.impact === 'fort' || a.dansMin != null)).slice(0, 1);
  P.push(an.length ? `À venir : ${an.map(a => { const m = a.dansMin != null ? a.dansMin : Math.round((a.t - maintenant) / 60e3); return `${a.titre} ${DEV[a.devise] || a.devise} ${m < 120 ? `dans ${m} minutes` : 'à ' + heure(a.t)}`; }).join(', ')}.` : 'Pas d’annonce forte à venir.');
  // 6. COT
  const cot = X.cot || E.cot;
  if (cot && cot.categories) { const c0 = cot.categories[0]; P.push(`COT : spéculateurs nets ${c0.net > 0 ? 'acheteurs' : 'vendeurs'} de ${Math.abs(c0.net).toLocaleString('fr-FR')} contrats, un contexte et pas un signal.`); }
  else P.push(E.cotAbsent ? 'Pas de COT pour cet actif.' : 'COT indisponible pour l’instant.');
  // 7. santé du marché
  if (E.sante && (E.sante.volatilite || E.sante.volumeRelatif)) P.push(`Santé du marché : volatilité ${E.sante.volatilite ? E.sante.volatilite.mot : 'inconnue'}, volume ${E.sante.volumeRelatif ? E.sante.volumeRelatif.mot : 'inconnu'}.`);
  // 8. positions en cours
  const pos = E.positions || [];
  P.push(pos.length ? `Tes positions simulées : ${pos.length === 1 ? 'une' : pos.length}, ${pos[0].sens === 'achat' ? 'd’achat' : 'de vente'} ${pos[0].etat}, stop ${fmt(pos[0].stop)}, objectif ${fmt(pos[0].objectif)}.` : 'Aucune position en cours.');
  // 9. un ou deux scénarios
  const L = (E.scenarios && E.scenarios.liste) || [];
  const court = x => String(x).replace(/\d+\.\d+/g, m => fmt(+m)).replace(/ ?[+−-] ?\d+(?:,\d+)? ATR/g, '').replace(/ ?\([^)]*\)/g, '').replace(/ après une touche/g, '').trim();
  if (L.length) for (const sc of L.slice(0, 2)) P.push(`Scénario ${sc.nom.split(' · ')[0]}, ${sc.sens === 'hausse' ? 'à la hausse' : 'à la baisse'} depuis ${fmt(sc.niveau)}. Validé par ${court(sc.validation)} ; invalidé par ${court(sc.invalidation)}.`);
  else P.push(`Pas de scénario clair : ${E.scenarios && E.scenarios.raison ? E.scenarios.raison : 'données insuffisantes'}.`);
  P.push('Information de lecture, pas un signal.');
  if (dureeEstimee(P.join(' ')) > 58 && L.length > 1) { const i = P.findIndex(x => x.startsWith('Scénario ' + L[1].nom.split(' · ')[0] + ',')); if (i > 0) P.splice(i, 1); }   // 30 à 60 secondes : au-delà, un seul scénario
  return P.join(' ');
}
export const CONSIGNE_BRIEFING = 'Fais-moi le point comme un briefing parlé de 30 à 60 secondes (environ 100 à 150 mots), dans cet ordre : prix et tendance, moyenne mobile 200, niveaux et zones qui comptent, carnet d’ordres (gros paquets, déséquilibre), annonces à venir, COT, santé du marché, positions en cours, puis un ou deux scénarios au maximum avec leurs niveaux de validation et d’invalidation. Termine par : information de lecture, pas un signal. Aucune prévision certaine, aucun ordre, aucun chiffre absent du terminal.';

/* ───────── « explique-moi… » : pédagogie en trois niveaux, puis la lecture du moment ───────── */
export const EXPLICATIONS = Object.freeze({
  cot: {
    debutant: 'Le COT, c’est un rapport publié chaque semaine aux États-Unis. Il dit combien de contrats les gros acteurs ont acheté ou vendu : les fonds spéculatifs d’un côté, les entreprises qui se couvrent de l’autre. Un peu comme savoir où les gros ont posé leurs jetons.',
    normal: 'Le rapport COT, publié le vendredi pour le mardi précédent, montre le positionnement net des spéculateurs et des commerciaux sur les contrats à terme. Quand les spéculateurs sont très acheteurs ou très vendeurs, le marché peut être fragile à un retournement. Les commerciaux sont souvent à l’inverse.',
    detail: 'Le Commitments of Traders de la CFTC est publié le vendredi avec les positions du mardi. On y lit le net, achats moins ventes, des fonds spéculatifs, des commerciaux et des petits porteurs. On le compare à son historique : un extrême indique un positionnement chargé, donc un risque de liquidation, mais il ne donne pas le moment. Le retard de trois jours en fait un contexte, jamais un déclencheur.'
  },
  sante: {
    debutant: 'La santé du marché dit si le marché est calme ou agité, et s’il y a du monde. Une volatilité forte veut dire que les prix bougent vite. Un volume faible veut dire peu de participants, donc des mouvements moins fiables.',
    normal: 'La santé du marché résume la volatilité, mesurée par l’ATR et comparée à l’historique, le volume relatif, le spread, les séances ouvertes et les corrélations avec d’autres actifs. Elle aide à savoir si les mouvements actuels sont ordinaires ou inhabituels.',
    detail: 'On y regarde l’ATR rapporté à son centile historique, le volume de la bougie comparé à la moyenne des dernières, le spread, les séances ouvertes, Asie, Londres, New York, dont dépend la liquidité, et les corrélations à soixante jours avec les actifs liés. Une volatilité haute avec un volume faible est un signal de prudence : les mouvements sont rapides mais peu soutenus.'
  },
  tableau: {
    debutant: 'Ce tableau regarde le même actif à plusieurs échelles de temps, de quelques minutes à plusieurs jours, et dit pour chacune si ça monte ou si ça baisse. Quand tout le monde est d’accord, la tendance est plus solide.',
    normal: 'Le tableau multi-unités donne, pour chaque unité de temps, la tendance, le RSI, le volume net, le support et la résistance, puis un score global sur cent. C’est une synthèse de lecture : plus les unités sont d’accord, plus la lecture est cohérente.',
    detail: 'Chaque colonne calcule une tendance par la structure et la moyenne mobile, un RSI à quatorze périodes, un volume net acheteur moins vendeur, et le support et la résistance les plus proches. Le score global combine ces éléments avec des poids fixes écrits à l’avance. Il mesure l’accord entre unités, pas la probabilité d’un mouvement.'
  },
  niveau: {
    debutant: 'Un niveau, c’est un prix où le marché a déjà réagi plusieurs fois : il a rebondi ou il a été refoulé. Un support est en dessous du prix, une résistance au-dessus. Plus il a été touché, plus il compte.',
    normal: 'Les niveaux marquent des prix où le marché a réagi : supports sous le prix, résistances au-dessus. J’en liste de plusieurs sortes : les tiens, les automatiques selon le nombre de touches, les zones de volume et la moyenne mobile deux cents. Un niveau cassé peut changer de rôle.',
    detail: 'Un niveau est confirmé par le nombre de touches et par la réaction qui a suivi. Les zones de réaction viennent du profil de volume : un prix très échangé attire le marché. La distance est mesurée en ATR pour comparer des actifs différents. Un niveau cassé avec clôture confirmée devient souvent un niveau retourné, support devenu résistance ou l’inverse.'
  },
  ma200: {
    debutant: 'La moyenne mobile deux cents est la moyenne des deux cents derniers prix de clôture. C’est une ligne lente que beaucoup regardent : au-dessus, le marché est plutôt fort ; en dessous, plutôt faible.',
    normal: 'La moyenne mobile deux cents lisse les deux cents dernières clôtures. Elle sert de repère de tendance de fond et de niveau où le prix réagit souvent, parce que beaucoup d’acteurs la surveillent.',
    detail: 'La SMA 200 est la moyenne simple des deux cents dernières clôtures de l’unité affichée. Sa pente donne la tendance de fond, la distance du prix en ATR dit s’il est étiré, et ses retests sont des zones de décision. Je peux aussi l’afficher en H1 ou en journalier sur toutes les unités.'
  },
  carnet: {
    debutant: 'Le carnet d’ordres, c’est la liste de ce que les gens veulent acheter et vendre, avec les prix. Un gros paquet d’ordres à un prix, c’est un mur : il peut freiner le marché.',
    normal: 'Le carnet liste les ordres d’achat et de vente en attente autour du prix. Le déséquilibre dit si les acheteurs ou les vendeurs dominent près du prix, et un mur est un niveau où l’on voit beaucoup plus d’ordres que d’habitude.',
    detail: 'Je regarde le carnet à plus ou moins un pour cent du prix. Le déséquilibre est la part des acheteurs dans la quantité totale. Un mur est un niveau dont le montant dépasse trois fois la médiane. Les gros paquets sont les transactions au-dessus d’un seuil adapté à l’actif. Les ordres du carnet peuvent être retirés à tout moment : c’est une intention, pas un engagement.'
  }
});
const SECTION_POUR = { cot: 'cot', sante: 'sante', tableau: 'tableau', carnet: null, niveau: null, ma200: null };
export function expliquer(sujet, niveau, E, X = {}, aide = {}) {
  const exp = EXPLICATIONS[sujet]; if (!exp) return null;
  const P = [exp[niveau] || exp.normal];
  let lecture = null;
  if (SECTION_POUR[sujet]) lecture = texteSection(SECTION_POUR[sujet], E, X, aide);
  else if (sujet === 'ma200' && E.ma200) lecture = `Ici, la moyenne deux cents est à ${(aide.fmt || String)(E.ma200.valeur)}, et le prix est ${E.ma200.cote}.`;
  else if (sujet === 'niveau' && E.niveaux && (E.niveaux.dessous[0] || E.niveaux.dessus[0])) { const f = aide.fmt || String, s = E.niveaux.dessous[0], r = E.niveaux.dessus[0]; lecture = `Sur ton graphique : ${r ? `résistance ${f(r.p)}` : 'pas de résistance marquée'}, ${s ? `support ${f(s.p)}` : 'pas de support marqué'}.`; }
  else if (sujet === 'carnet' && E.carnet) lecture = `En ce moment, ${E.carnet.lecture}.`;
  if (lecture) P.push('Dans ton terminal maintenant : ' + String(lecture).replace(new RegExp(' ?' + MENTION_LECTURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), ''));
  else if (SECTION_POUR[sujet] !== undefined) P.push('Je n’ai pas la donnée du moment pour l’instant.');
  P.push(MENTION_LECTURE);
  return P.join(' ');
}
export const consigneExplication = (sujet, niveau) => `Explique ${({ cot: 'le rapport COT', sante: 'la santé du marché', tableau: 'le tableau de bord multi-unités', niveau: 'ce que sont les niveaux', ma200: 'la moyenne mobile deux cents', carnet: 'le carnet d’ordres' })[sujet] || sujet} ${niveau === 'debutant' ? 'comme à un débutant complet, avec une image simple et sans jargon' : niveau === 'detail' ? 'en détail, avec la méthode de calcul et les limites' : 'clairement, en quelques phrases'}, puis dis ce que ça montre dans mon terminal en ce moment, avec les seuls chiffres du terminal.`;

/* ───────── mémoire de la conversation (la session) ───────── */
export function historique(echanges, n = 6) {
  const H = []; for (const e of (echanges || []).slice(-n)) { H.push({ role: 'user', content: String(e.q).slice(0, 300) }); H.push({ role: 'assistant', content: String(e.rep).slice(0, 600) }); } return H;
}
