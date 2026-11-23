/* Tests purs de la narration des rapports (v12, phase 4). Usage : node trader-pro/tests/narration-test.mjs */
import * as N from '../rapports/narration.js';
import { compterChiffres } from './rapports-textes.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };

/* nombres arrondis */
v(N.approx(3549.94) === 'environ 3 550' || N.approx(3549.94) === 'près de 3 550', 'approx : 3 549,94 → « ' + N.approx(3549.94) + ' »');
v(/^près de 3 550$/.test(N.approx(3546)) && /^un peu plus de 3 550$/.test(N.approx(3553)), 'approx : « près de » sous l’arrondi, « un peu plus de » au-dessus (' + N.approx(3546) + ' / ' + N.approx(3553) + ')');
v(N.approx(60855) === 'un peu plus de 60 900' || N.approx(60855) === 'près de 60 900' || /60 900|60 800|60 900/.test(N.approx(60855)), 'approx : jamais plus de trois chiffres significatifs (' + N.approx(60855) + ')');
v(N.approx(1.0845) === 'près de 1,08' || N.approx(1.0845) === 'un peu plus de 1,08' || N.approx(1.0845) === 'environ 1,08', 'approx : devises à trois chiffres significatifs (' + N.approx(1.0845) + ')');
v(N.pourcent(0.46) === 'environ 0,5 pour cent' && N.pourcent(-2.4) === 'environ 2,5 pour cent' && N.pourcent(58.3) === 'environ 58 pour cent', 'pourcent : arrondis lisibles (' + N.pourcent(0.46) + ', ' + N.pourcent(-2.4) + ', ' + N.pourcent(58.3) + ')');
v(N.mot(3) === 'trois' && N.mot(0) === 'zéro', 'mot : nombres en lettres');
v(N.sansChiffres('Gold holds near record') === 'Gold holds near record' && N.sansChiffres('Fed cuts 25 bps') === '' && N.sansChiffres('prix loin de sa moyenne à 200 jours') === 'prix loin de sa moyenne de long terme', 'sansChiffres : titres sans nombre gardés, avec nombre écartés, moyennes reformulées');

/* dates : jamais de nombre */
const MAINT = Date.UTC(2026, 10, 22, 14, 5);   // dimanche 22/11/2026
v(N.moment(Date.UTC(2026, 10, 24, 13, 30), MAINT) === 'mardi vers midi' || /mardi/.test(N.moment(Date.UTC(2026, 10, 24, 13, 30), MAINT)), 'moment : jour de semaine + moment de la journée (' + N.moment(Date.UTC(2026, 10, 24, 13, 30), MAINT) + ')');
v(/^demain/.test(N.moment(Date.UTC(2026, 10, 23, 9, 0), MAINT)) && /^aujourd’hui/.test(N.moment(Date.UTC(2026, 10, 22, 19, 0), MAINT)), 'moment : « demain », « aujourd’hui »');
v(!/\d/.test(N.moment(Date.UTC(2026, 10, 26, 19, 30), MAINT)), 'moment : aucun chiffre');
v(N.ilYa('2026-11-21', MAINT) === 'hier' && N.ilYa('2026-08-01', MAINT) === 'il y a quelques mois' && N.ilYa('2024-01-01', MAINT) === 'il y a longtemps', 'ilYa : hier / quelques mois / longtemps');

/* position et bougies */
const pos = { disponible: true, sur: [{ nom: 'PDL', prix: 3511.4, classe: 'sur' }], proche: [], dessus: { nom: 'PDH', prix: 3624 }, dessous: { nom: 'PDL', prix: 3511.4 } };
const P = N.position(pos, 3515);
v(/juste sur le support PDL/.test(P.texte) && /À surveiller/.test(P.texte) && /clôture sous 3[   ]\d{3} environ/.test(P.texte), 'position : « sur le support », niveau à surveiller arrondi : ' + P.texte);
v(compterChiffres(P.texte) === 1, 'position : un seul chiffre');
v(/un de tes niveaux tracés/.test(N.position({ ...pos, sur: [{ nom: 'ton niveau tracé en H4', prix: 3515, classe: 'sur' }] }, 3515).texte), 'position : « un de tes niveaux tracés »');
const L = { disponible: true, derniere: { forme: { sens: 'haussière', taille: 'grande' }, enCours: true, figures: [{ id: 'pin-bas' }], contexte: [{ niveau: 'POC H4', role: 'support', rejet: true }], volume: { lib: 'volume fort' } } };
const B = N.bougie(L, 'Daily'); v(/haussière/.test(B) && /vendeurs ont été repoussés/.test(B) && /rebondi sur le support POC H4/.test(B) && /Volume fort/.test(B) && compterChiffres(B) === 0, 'bougie : forme, sens de la figure, contexte et volume, sans chiffre : ' + B);

/* COT : ce que ça implique */
const a = { dernier: { spec: -5000, varSpec: 1200, extremeSpec: null, indexComm: 40, extremeComm: null } };
v(/commencé à racheter.*début de retournement/.test(N.cotPositions({ N: 'l’or', a })[1]), 'COT : vendeurs nets qui rachètent = début de retournement possible');
v(/allégé.*s’essouffle/.test(N.cotPositions({ N: 'l’or', a: { dernier: { spec: 5000, varSpec: -900 } } })[1]), 'COT : acheteurs nets qui allègent = élan qui s’essouffle');
v(/extrême côté achat/.test(N.cotIndice({ a: { dernier: { extremeSpec: 'haut', indexComm: null } }, p52: 90 }).extreme) && /c’est haut/.test(N.cotIndice({ a: { dernier: { extremeSpec: 'haut', indexComm: null } }, p52: 90 }).percentile), 'COT : extrême acheteur expliqué, percentile traduit (« c’est haut »)');
v(N.cotHistorique({ hauts: [], bas: [], avecPrix: true, maintenant: MAINT }).length === 1, 'COT : sans extrême dans l’historique, une phrase honnête');

/* contexte */
const C = N.contexte({ id: 'or', climat: 'risk-off (actions faibles ou dollar fort)', dxy: { couleur: 'haussier' }, us: [{ actif: 'us100', couleur: 'baissier' }, { actif: 'us500', couleur: 'baissier' }], t10: 4.21, reel: 1.9, titre: '', actuExiste: true, ann: [{ titre: 'Core PCE', t: Date.UTC(2026, 10, 24, 14, 30), prevu: '0,4 %', precedent: '0,3 %' }], maintenant: MAINT });
v(/prudent/.test(C.climat) && /pèse souvent sur l'or/.test(C.dollar) && /mal orientées/.test(C.actions) && /4,2 pour cent/.test(C.taux) && /frein/.test(C.taux) && /Des articles récents parlent de l'or/.test(C.actu) && /plus élevé que le précédent/.test(C.annonces), 'contexte : climat, effet du dollar sur l’actif, actions, taux et ce qu’ils impliquent, attente comparée sans chiffre');
v([C.climat, C.dollar, C.actions, C.taux, C.actu, C.annonces].every(t => compterChiffres(t) <= 1) && compterChiffres(Object.values(C).join(' ')) <= 1, 'contexte : un seul chiffre pour toute l’étape (' + compterChiffres(Object.values(C).join(' ')) + ')');

/* compteur de chiffres (outil du test) */
v(compterChiffres('près de 3 550 et environ 60 pour cent') === 2 && compterChiffres('MA200 Daily, H4, S&P 500, Nasdaq 100') === 0 && compterChiffres('le 24 novembre à 14 h 30') === 3, 'compterChiffres : noms exclus, nombres comptés');

console.log(ko ? `narration-test : ${ko} échec(s)` : `narration-test : tout passe (${ok})`); process.exit(ko ? 1 : 0);
