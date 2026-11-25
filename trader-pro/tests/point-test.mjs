/* Tests des points de Rayle : règle anti-invention (extraction et vérification des nombres, retrait des phrases à nombre introuvable), composition du point (depuis la dernière connexion, nuit, matin, journée, un actif),
   « Ce que tu as raté » avec cause et état du mouvement, lecture session par session, scénarios, conseil sans ordre, fraîcheur des données, budget de mots. Usage : node trader-pro/tests/point-test.mjs */
import { collecterFaits, nombresDuTexte, nombreConnu, verifierTexte, retirerInconnus, phrases } from '../point/faits.js';
import { composerPoint, mouvementFenetre, niveauxProches, declencheur, fenetreDe, BUDGET_MOTS } from '../point/composer.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (a, m, j, h = 0, mi = 0) => Date.UTC(a, m - 1, j, h, mi), H = 3600e3, MIN = 60e3;

console.log('— extraction des nombres du texte —');
{
  const N = t => nombresDuTexte(t).map(n => n.brut + (n.strict ? '!' : ''));
  v(N('L’or vaut 3 909,23 dollars').join() === '3 909,23!', 'milliers et décimales : ' + N('L’or vaut 3 909,23 dollars'));
  v(nombresDuTexte('perte de −1,9 % en 6 bougies')[0].signe === '−' && nombresDuTexte('perte de −1,9 % en 6 bougies')[1].strict === false, 'signe explicite ; 6 bougies = comptage');
  v(N('MA200 H4 du S&P 500 et Nasdaq 100, M15').length === 0, 'les noms d’instruments et d’unités (MA200, H4, S&P 500, Nasdaq 100, M15) ne sont pas des mesures');
  const h = nombresDuTexte('à 15 h 30 et 9 h'); v(h[0].heure && h[1].minute && h[2].heure, 'heures et minutes reconnues');
  v(nombresDuTexte('score de 18 sur 100')[1] === undefined, '« sur 100 » est une échelle');
  v(nombresDuTexte('volume ×3,2 la normale')[0].strict && nombresDuTexte('12 cas')[0].strict === false && nombresDuTexte('13 cas')[0].strict === true, '×3,2 strict ; 12 comptage ; 13 strict');
  const f = collecterFaits({ a: { prix: 3555.16, pct: -2.17, t: U(2026, 11, 24, 14, 30) }, liste: [3615.07] }, { nombres: [7] });
  v(nombreConnu(nombresDuTexte('3 555')[0], f) && nombreConnu(nombresDuTexte('3 555,2')[0], f) && !nombreConnu(nombresDuTexte('3 556')[0], f), 'un niveau arrondi existe, un niveau inventé non');
  v(nombreConnu(nombresDuTexte('−2,2 %')[0], f) && !nombreConnu(nombresDuTexte('+2,2 %')[0], f) && nombreConnu(nombresDuTexte('2,17')[0], f), 'le signe écrit doit être le bon');
  v(nombreConnu(nombresDuTexte('à 15 h 30')[0], f) && nombreConnu(nombresDuTexte('à 15 h 30')[1], f) && !nombreConnu(nombresDuTexte('à 16 h 45')[0], f), 'l’heure doit venir d’un horodatage connu (Paris)');
  const t = 'L’or vaut 3 555. Il a pris 4,2 %. Le support est à 3 615. Rien d’autre.', V = verifierTexte(t, f);
  v(!V.ok && V.inconnus.length === 1 && V.inconnus[0].nombre === '4,2', 'le nombre inventé est repéré : ' + JSON.stringify(V.inconnus.map(x => x.nombre)));
  const R = retirerInconnus(t, f); v(R.texte === 'L’or vaut 3 555. Le support est à 3 615. Rien d’autre.' && R.retirees.length === 1 && !R.ok, 'la phrase à nombre introuvable est retirée, les autres gardées');
  v(phrases('Il a pris 1,2 %. Voilà.').length === 2, 'phrases');
}

/* ───── une fiche de lecture à la main (mêmes champs que trader-pro/lecture/fiche.js) ───── */
const MAINT = U(2026, 11, 24, 10, 0), mkH1 = (fin, n, p0, pas) => { const L = []; let p = p0; for (let i = n; i >= 1; i--) { const t = fin - i * H, c = p + pas; L.push([t, p, Math.max(p, c) + 1, Math.min(p, c) - 1, c]); p = c; } return L; };
function fiche(id = 'or', o = {}) {
  const h1 = mkH1(MAINT, 120, 3700, -1.3), px = h1[h1.length - 1][4];
  return {
    version: 1, actif: id, nom: id === 'or' ? 'Or' : id, t: MAINT, prix: px, tPrix: MAINT - 5 * MIN, atrJ: 80, h1,
    tendance: { J: { dispo: true, sens: 'baissier', ma200: 4283.1, ecartPct: -15.3, ecartAtr: -7.5, atrPct: 2.4 }, H4: { dispo: true, sens: 'baissier', ma200: 3909.2, ecartPct: -8.7, ecartAtr: -8.9, atr: 38.1 }, H1: { dispo: true, atrPct: 0.5 } },
    biais: 'baissier', regime: { J: { dispo: true }, H4: { dispo: true, type: 'tendance', efficacite: 0.42, compression: false, atrVsMediane: 1.2 } },
    niveaux: { reperes: { PDH: 3693.2, PDL: 3571, PWH: 3898.6, PWL: 3505.3 }, supports: [{ prix: 3505.6, unite: 'J', distancePct: -1.4 }], resistances: [{ prix: 3880.6, unite: 'H4', distancePct: 8.7 }], rangeAsie: { haut: 3615.1, bas: 3590.2, enCours: false }, balayages: [] },
    sessions: [{ id: 'asie', nom: 'Asie', jour: '2026-11-24', debut: U(2026, 11, 24), fin: U(2026, 11, 24, 8), plageParis: '1 h – 9 h (Paris)', pct: -0.3, amplitudeAtrJ: 0.4, enCours: false, comportement: { code: 'range_asiatique', typique: true, texte: 'session calme : range asiatique classique' } },
      { id: 'londres', nom: 'Londres', jour: '2026-11-24', debut: U(2026, 11, 24, 8), fin: U(2026, 11, 24, 13), plageParis: '9 h – 14 h (Paris)', pct: -1.9, amplitudeAtrJ: 1.3, enCours: true, comportement: { code: 'cassure_bas_asie', typique: true, texte: 'Londres a cassé le bas du range asiatique et tient en dessous' } }],
    score: { score100: 18, verdict: 'Vendeur fort', confiance: 0.9, composants: [], manquants: [] }, cot: null, carnet: null, statsJ: { dispo: true, situation: 'dessous|descendante', cas: 103, petit: false, horizonJours: 5, retourMoyenPct: -0.34, partHaussePct: 45, hausseMaxMedianePct: 1.44, baisseMaxMedianePct: -1.76 },
    agenda: [{ t: MAINT + 4 * H, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }], actus: [],
    volume: { J: { disponible: true, liste: [] }, H4: { disponible: true, liste: [] }, H1: { disponible: true, liste: [{ t: MAINT - 3 * H, tFin: MAINT - 2 * H, dir: -1, niveau: 'extreme', volumeRel: 3.4, contexte: 'range', positionMa200: 'dessous', stats: { n: 40, petit: false, continuation5Pct: 38, retournement5Pct: 62 } }] } },
    evenements: [{ type: 'croisement_ma200', t: MAINT - 6 * H, unite: 'H4', dir: -1, statut: 'confirmee', vraieCassure: true, volumeRelMax: 3.1, prix: 3640.2, ma200: 3648.9 }, { type: 'volume_extreme', t: MAINT - 2 * H, unite: 'H1', dir: -1, volumeRel: 3.4, contexte: 'range', positionMa200: 'dessous', prix: 3600.5 }],
    grosMouvements: [{ sens: -1, depart: MAINT - 9 * H, fin: MAINT - 1 * H, prixDepart: 3680.1, prixFin: 3570.2, pct: -3, atrH4: -3.1, bougiesH4: 6, plusHaut: 3690.4, plusBas: 3560.8, seuil: 2 }],
    manques: [], ...o
  };
}
const reseau = { cartes: [{ id: 'c1', titre: 'Trump: nouveaux droits de douane sur les puces', t: MAINT - 9 * H + 20 * MIN, score: 88, actifs: ['or', 'us100'], personne: 'trump', reaction: { max: { pct: -0.9 } } }] };

console.log('— composition des points —');
{
  const P = composerPoint({ type: 'depuis', fiches: { or: fiche() }, depuis: MAINT - 9 * H, maintenant: MAINT, reseau, evenements: [{ t: MAINT + 4 * H, titre: 'CPI m/m', pays: 'USD', impact: 'fort' }], absenceMs: 9 * H });
  v(!P.vide && P.titre === 'Depuis ta dernière connexion' && /^Tu étais absent depuis 9 heures\./.test(P.texteParle), 'point depuis la dernière connexion : « Tu étais absent depuis 9 heures. »');
  const ids = P.sections.map(s => s.id); v(['passe', 'rate', 'sessions', 'ou', 'lecture', 'scenarios', 'conseil', 'agenda'].every(x => ids.includes(x)), 'toutes les sections du plan : ' + ids.join());
  v(/L’or a perdu/.test(P.texteParle) && /de 3 \d{3} à 3 \d{3}/.test(P.texteParle), 'ce qui s’est passé : mouvement chiffré');
  v(/Tu as raté un gros mouvement sur l’or : baisse de 3,0 % en 6 bougies H4/.test(P.texteParle) && /soit 3,1 fois l’ATR H4/.test(P.texteParle) && /déclenché par les propos de Trump/.test(P.texteParle), '« Tu as raté un gros mouvement » : amplitude, bougies, ATR, déclencheur (personnalité du réseau)');
  v(/il (a déjà rendu|a rendu|tient près|continue)/.test(P.texteParle), 'dit si le mouvement est fini ou non');
  v(P.montre.length === 1 && P.montre[0].actif === 'or' && P.montre[0].unite === 'H4' && P.montre[0].t0 < MAINT - 9 * H && P.montre[0].niveaux.length > 3, 'bouton « Montre-moi » : actif, unité, période et niveaux à surligner');
  const s = P.sections.find(x => x.id === 'sessions').paragraphes.join(' '); v(/Londres \(en cours\)/.test(s) && /comportement typique/.test(s), 'session par session : typique ou inhabituel');
  v(/Scénario principal : poursuite de la baisse/.test(P.texteParle) && /103 situations semblables/.test(P.texteParle) && /−1,8 %/.test(P.texteParle) && /mis en défaut par une clôture au-dessus/.test(P.texteParle) && /Scénario alternatif/.test(P.texteParle), 'scénario principal et alternatif : objectif tiré de la base, invalidation');
  v(/On privilégie plutôt les ventes sur un rebond vers la MA200 H4 \(3 909/.test(P.texteParle) && /signal (assez solide|moyen|faible)/.test(P.texteParle) && /Prudence avant CPI m\/m à 15 h/.test(P.texteParle), 'conseil : l’outil et le chiffre cités, confiance dite, prudence avant l’annonce (heure de Paris)');
  v(!/vas-y|n.y va pas|achète maintenant|vends maintenant/i.test(P.texteParle), 'jamais d’ordre');
  v(/Une cassure avec ce volume|Grosse bougie de volume/.test(P.sections.map(x => x.paragraphes.join(' ')).join(' ')), 'les connaissances sont utilisées (tendance générale)');
  v(P.mots <= BUDGET_MOTS.depuis + 40, 'le texte parlé reste dans son budget (' + P.mots + ' mots)');
  v(verifierTexte(P.texteParle, P.faits).ok && P.retirees.length === 0, 'chaque nombre du texte final est dans la fiche ou calculé par le code');
}

console.log('— anti-invention sur un texte réécrit par une IA —');
{
  const P = composerPoint({ type: 'actif', fiches: { or: fiche() }, maintenant: MAINT, depuis: MAINT - 9 * H, reseau });
  const reecrit = P.texteParle + ' D’après moi l’or devrait toucher 3 480 puis rebondir de 5,5 %.', V = verifierTexte(reecrit, P.faits);
  v(!V.ok && V.inconnus.map(x => x.nombre).sort().join() === '3 480,5,5', 'une phrase ajoutée avec des chiffres inventés est détectée : ' + V.inconnus.map(x => x.nombre));
  const R = retirerInconnus(reecrit, P.faits); v(R.texte === P.texteParle && R.retirees.length === 1, 'et retirée, le texte d’origine reste intact');
}

console.log('— types de points, fraîcheur, cas limites —');
{
  const F = { or: fiche(), us100: fiche('us100', { prix: 20100, h1: mkH1(MAINT, 120, 20000, 0.8), grosMouvements: [], evenements: [], agenda: [], tendance: { J: { dispo: true, sens: 'haussier', ma200: 18000, atrPct: 1.1 }, H4: { dispo: true, sens: 'haussier', ma200: 19000, atr: 90 }, H1: { dispo: true, atrPct: 0.4 } }, biais: 'haussier', score: { score100: 70, verdict: 'Acheteur', composants: [], manquants: [] } }) };
  const nuit = composerPoint({ type: 'nuit', fiches: F, maintenant: MAINT, reseau }), matin = composerPoint({ type: 'matin', fiches: F, maintenant: MAINT, reseau }), jour = composerPoint({ type: 'journee', fiches: F, maintenant: MAINT, reseau });
  v(nuit.titre === 'Cette nuit' && /depuis la clôture de New York/.test(nuit.texteParle) && /^Bonjour Justin\. Voici le point du matin\./.test(matin.texteParle) && /ce qu’ont fait Londres et New York/.test(jour.texteParle), 'introductions propres à chaque point');
  v(nuit.t0 === U(2026, 11, 23, 22, 0) && jour.t0 === U(2026, 11, 24, 8, 0), 'nuit = depuis 17 h New York ; journée = depuis l’ouverture de Londres (heure d’hiver : 8 h UTC)');
  v(matin.mots <= BUDGET_MOTS.matin + 40 && matin.mots > 100, 'point du matin : 1 à 2 minutes à l’oral (' + matin.mots + ' mots)');
  v(fenetreDe('nuit', U(2026, 7, 15, 9), null) === U(2026, 7, 14, 21), 'l’été, la nuit commence à 21 h UTC (17 h à New York)');
  const un = composerPoint({ type: 'actif', fiches: F, actifs: ['us100'], maintenant: MAINT, depuis: MAINT - 6 * H }); v(un.actifs.join() === 'us100' && /Nasdaq|le Nasdaq/.test(un.texteParle) && !/\bl’or\b/.test(un.texteParle), 'point sur un seul actif : seulement lui');
  const vide = composerPoint({ type: 'nuit', fiches: {}, maintenant: MAINT }); v(vide.vide && /pas de lecture de marché disponible/.test(vide.texteParle), 'sans fiche : le dit, n’invente rien');
  const perime = composerPoint({ type: 'actif', fiches: { or: fiche('or', { tPrix: MAINT - 30 * H }) }, maintenant: MAINT, depuis: MAINT - 9 * H }); v(/Attention : mon dernier prix pour l’or date de/.test(perime.texteParle), 'données périmées : prévenu en premier');
  const calme = composerPoint({ type: 'nuit', fiches: { us100: F.us100 }, maintenant: MAINT }); v(/Rien de marquant sur mes actifs|Nasdaq/.test(calme.texteParle), 'un marché calme ne remplit pas le récit');
  const m = mouvementFenetre(fiche(), MAINT - 9 * H, MAINT); v(m && m.nbBarres >= 8 && m.hi >= m.p1 && m.lo <= m.p1 && Math.abs(m.pct - (m.p1 / m.p0 - 1) * 100) < 1e-9, 'mouvement de fenêtre : prix de départ, plus haut, plus bas');
  v(mouvementFenetre({ ...fiche(), h1: [] }, MAINT - 9 * H, MAINT) === null, 'sans bougies : null');
  const nv = niveauxProches(fiche()); v(nv.dessus.prix > fiche().prix && nv.dessous.prix <= fiche().prix && Number.isFinite(nv.dessus.distPct), 'niveaux les plus proches au-dessus et en dessous');
  v(declencheur(fiche(), { depart: MAINT - 9 * H }, null, [{ t: MAINT - 9 * H + 30 * MIN, titre: 'Non-Farm Employment Change', pays: 'USD', impact: 'fort' }], []) === 'l’annonce « Non-Farm Employment Change »', 'déclencheur : une annonce proche du départ du mouvement');
  v(declencheur(fiche(), { depart: MAINT - 9 * H }, null, [], [{ type: 'croisement_ma200', t: MAINT - 9 * H + 10 * MIN, unite: 'H4' }]) === 'la cassure de la MA200 H4' && declencheur(fiche(), { depart: MAINT - 9 * H }, null, [], []) === null, 'déclencheur : cassure de MA200, ou aucun');
}
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
