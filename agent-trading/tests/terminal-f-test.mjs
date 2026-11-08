/* Tests des CORRECTIONS du terminal (suite de la phase A, 2026-11-08 ; pur, Node) : score figé, RSI, colonnes multi-unités, colonne globale,
   rang de l'ATR, séances, corrélations, COT complet, calendrier complet, sections pour Rayle, signaux, lecture RSS, relais local, position
   (bornes d'affichage conservées). Usage : node agent-trading/tests/terminal-f-test.mjs */
import { rsi, niveauxProches, volNet, score, SCORE_V1, detailScore, colonne, colonneGlobale, rangAtr, seances, correlation, motCorrelation, cotComplet,
  calendrierSemaine, filtrerCalendrier, compteARebours, LIES, CORRELES } from '../front/terminal/tableau-calcul.js';
import { lignesSections, texteSection, signaux, QUESTIONS_SECTIONS } from '../front/terminal/sections-rayle.js';
import { originePc, choisirRelais, relaisCourant, relaisEstLocal, oublierChoixRelais, cotesJour } from '../front/terminal/sources-terminal.js';
import { creerPosition, modifierPosition } from '../front/terminal/positions-calcul.js';
import { lireFlux, SYMBOLES_YAHOO } from '../../app-pc/terminal-sources.mjs';

let ok = 0, ko = 0;
const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };
const serie = (n, f, t0 = Date.UTC(2026, 0, 1), ms = 3600e3) => Array.from({ length: n }, (_, i) => { const c = f(i); return { t: t0 + i * ms, o: c, h: c + 1, l: c - 1, c, v: 10 + (i % 7) }; });

// RSI
const monte = serie(60, i => 100 + i), baisse = serie(60, i => 200 - i);
t(rsi(monte, 14).at(-1) === 100 && rsi(baisse, 14).at(-1) === 0, 'RSI : 100 en hausse continue, 0 en baisse continue');
const zz = serie(80, i => 100 + (i % 2 ? 1 : -1)); t(Math.abs(rsi(zz, 14).at(-1) - 50) < 8, 'RSI ≈ 50 en zigzag', rsi(zz, 14).at(-1));
t(rsi(serie(10, i => i + 1), 14).every(x => x === null), 'RSI null sans assez de bougies');
// niveaux, volume net
const np = niveauxProches(105, [{ p: 100 }, { p: 103 }, { p: 108 }, { p: 120 }]); t(np.support === 103 && np.resistance === 108, 'support et résistance les plus proches');
t(niveauxProches(105, []).support === null, 'aucun niveau : null');
const vn = volNet([{ usd: 100, achatUsd: 70 }, { usd: 100, achatUsd: 60 }]); t(vn.net === 60 && vn.total === 200 && Math.abs(vn.part - 0.3) < 1e-9, 'volume net = acheteurs − vendeurs', JSON.stringify(vn));
t(volNet([]) === null && volNet([{ usd: 1, achatUsd: NaN }]) === null, 'volume net inconnu → null');
// score figé
t(SCORE_V1.id === 'score-lecture-v1' && Object.isFrozen(SCORE_V1) && Object.values(SCORE_V1.poids).reduce((a, b) => a + b) === 100, 'score : formule figée, poids = 100');
const sMax = score({ tendance: 'haussière', rsi: 100, volNet: { part: 1 }, prix: 100, support: 100, resistance: 110, acheteurs: 1 });
const sMin = score({ tendance: 'baissière', rsi: 0, volNet: { part: -1 }, prix: 110, support: 100, resistance: 110, acheteurs: 0 });
t(sMax.total === 100 && sMin.total === 0 && sMax.couleur === 'haut' && sMin.couleur === 'bas', 'score : bornes 0 et 100, couleurs');
const sInc = score({}); t(sInc.total === 50 && sInc.inconnues.length === 5 && sInc.couleur === 'neutre', 'score : tout inconnu = 50, inconnues listées');
t(/pas une prévision/.test(detailScore(sMax)) && /tendance 30,0\/30/.test(detailScore(sMax)), 'détail du score : composantes et mention', detailScore(sMax).slice(0, 80));
// colonnes
const B = serie(400, i => 100 + i * 0.1);
const col = colonne({ B, niveaux: [{ p: 120 }, { p: 160 }], vol: [{ usd: 10, achatUsd: 8 }], acheteurs: 0.6 });
t(col.pret && col.tendance.sens === 'haussière' && col.rsi > 50 && col.support === 120 && col.resistance === 160 && col.volNet.net > 0 && col.mini.length === 60, 'colonne : tendance, RSI, niveaux, volume, mini-graphique');
t(colonne({ B: serie(5, i => i + 1) }).pret === false, 'colonne : pas assez de bougies');
const colB = colonne({ B: serie(400, i => 200 - i * 0.1) });
const G = colonneGlobale({ M5: col, M15: col, H1: colB, J: colB }, 150);
t(G.pret && G.tendance.sens === 'baissière' && G.score.total === Math.round((col.score.total * 2 + colB.score.total * 5) / 7), 'colonne globale : majorité et score pondérés (M5 1, M15 1, H1 2, J 3)', JSON.stringify(G.tendance));
// santé
const ra = rangAtr(serie(300, i => 100 + (i > 280 ? (i % 2) * 8 : 0)));
t(ra && ra.rang === 100 && ra.serie.length <= 200, 'rang historique de l’ATR (100 = le plus agité)', ra && ra.rang);
const lun = Date.UTC(2026, 10, 9, 10, 0);   // lundi 9 nov 2026, 11 h à Paris
const se = seances(lun), L = Object.fromEntries(se.map(x => [x.id, x]));
t(L.londres.ouverte && !L.ny.ouverte && !L.asie.ouverte && L.ny.ouvreDans === (14.5 - 10) * 3600e3, 'séances : Londres ouverte, New York ouvre à 14 h 30 UTC', JSON.stringify(se.map(x => [x.id, x.ouverte, x.ouvreDans])));
const dim = seances(Date.UTC(2026, 10, 8, 12)); t(dim.every(x => !x.ouverte), 'séances fermées le dimanche');
const ete = seances(Date.UTC(2026, 6, 6, 13, 35)); t(ete.find(x => x.id === 'ny').ouverte, 'New York ouverte à 13 h 35 UTC en été (heure d’été)');
const A1 = serie(90, i => 100 * Math.exp(Math.sin(i) * 0.02), Date.UTC(2026, 0, 1), 864e5), A2 = A1.map(p => ({ t: p.t, c: p.c * 2 })), A3 = A1.map(p => ({ t: p.t, c: 1e4 / p.c }));
t(Math.abs(correlation(A1, A2).r - 1) < 1e-9 && Math.abs(correlation(A1, A3).r + 1) < 1e-9, 'corrélation : +1 et −1');
t(correlation(A1.slice(0, 5), A2).r === null && motCorrelation(-0.8) === 'forte négative' && motCorrelation(0.1) === 'quasi nulle', 'corrélation : trop court = null, mots');
// COT complet (lignes CFTC)
const ligne = (d, nl, ns, cl, cs, rl, rs, oi) => ({ report_date_as_yyyy_mm_dd: d + 'T00:00:00.000', open_interest_all: String(oi), noncomm_positions_long_all: String(nl), noncomm_positions_short_all: String(ns), comm_positions_long_all: String(cl), comm_positions_short_all: String(cs), nonrept_positions_long_all: String(rl), nonrept_positions_short_all: String(rs) });
const C = cotComplet([ligne('2026-11-03', 220, 40, 60, 270, 30, 20, 400), ligne('2026-10-27', 200, 50, 70, 250, 25, 25, 380)], 'Or');
const sp = C.categories[0];
t(sp.net === 180 && sp.variation === 30 && sp.varLong === 20 && sp.varShort === -10 && Math.abs(sp.pctOi - 45) < 1e-9 && C.oiVar === 20, 'COT : achats, ventes, net, variation hebdo, % de l’intérêt ouvert');
t(C.categories.length === 3 && C.serie.length === 2 && C.serie[0].date === '2026-10-27' && C.publication === '2026-11-06', 'COT : trois catégories, série chronologique, publication le vendredi');
t(cotComplet([]) === null, 'COT vide → null');
// calendrier
const brut = [{ title: 'CPI m/m', country: 'USD', date: '2026-11-10T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.2%', actual: '' }, { title: 'PMI', country: 'EUR', date: '2026-11-09T04:00:00-05:00', impact: 'Low' }, { title: 'Holiday', country: 'JPY', date: '2026-11-09T00:00:00-05:00', impact: 'Holiday' }];
const cal = calendrierSemaine(brut);
t(cal.length === 3 && cal[0].impact === 'ferie' && cal[2].impact === 'fort' && cal[2].prevu === '0.3%', 'calendrier complet (tous impacts), trié');
t(filtrerCalendrier(cal, { devises: ['USD'] }).length === 1 && filtrerCalendrier(cal, { impactMin: 'fort' }).length === 1 && filtrerCalendrier(cal, {}).length === 2, 'filtres par devise et impact');
t(compteARebours(3725e3) === '1 h 02 min' && compteARebours(65e3) === '1 min 05 s' && compteARebours(-1) === '—', 'compte à rebours');
t(['NASDAQ', 'OR', 'BTC', 'SOL', 'DOGE'].every(a => LIES[a] && LIES[a].syms.every(s => SYMBOLES_YAHOO.test(s)) && CORRELES[a].every(([s]) => SYMBOLES_YAHOO.test(s))), 'entreprises liées et corrélations : symboles dans la liste blanche du PC');
// sections pour Rayle et signaux
const now = Date.UTC(2026, 11, 1, 12);
const X = { tableau: { cols: { M5: col, M15: col, H1: colB, J: colB, G } }, cot: C, annonces: [{ t: now + 20 * 60e3, devise: 'USD', titre: 'CPI', impact: 'fort', prevu: '0.3%' }], rapports: [{ titre: 'FOMC statement', source: 'Fed', date: now }], actus: [{ titre: 'L’or monte' }], journal: { ouvertes: 1, attente: 0, closes: 2, dernier: 'Or achat objectif atteint +2,00 R' }, sante: { rangAtr: 80, seances: se, correlations: [{ nom: 'Dollar', r: -0.6 }], lies: [{ s: 'GLD', var: 1.2 }] } };
const ls = lignesSections(X, { fmt: x => String(x), heure: () => '12 h 20', maintenant: now }).join('\n');
t(/Tableau multi-unités/.test(ls) && /COT Or/.test(ls) && /CPI/.test(ls) && /FOMC/.test(ls) && /Journal : 1 position/.test(ls) && /ATR au 80e centile/.test(ls), 'toutes les sections exposées dans le contexte de Rayle');
const E0 = { actif: 'OR', nomActif: 'Or', unite: 'H1', atr: 10, ma200: { valeur: 4000, distance: 3 }, positions: [{ actif: 'OR', sens: 'achat', etat: 'ouverte', entree: 1, stop: 0.5, objectif: 2 }], sante: { volatilite: { mot: 'normale' } } };
const sg = signaux(E0, X, { maintenant: now, fmt: String, heure: () => '12 h 20' });
t(sg.some(s => /annonce dans 20 minutes/.test(s.texte)) && sg.some(s => /approche la SMA 200/.test(s.texte)) && sg.some(s => /COT montre/.test(s.texte)), 'signaux : annonce dans 20 min, SMA 200 proche, COT', sg.map(s => s.texte).join(' | '));
for (const id of ['tableau', 'sante', 'calendrier', 'cot', 'rapports', 'actus', 'journal']) { const r = texteSection(id, E0, X, { fmt: String, heure: () => '12 h 20', maintenant: now }); t(r && /pas une promesse/i.test(r) && !/\b(achète|vends|passe un ordre)\b/i.test(r), `réponse locale de Rayle pour « ${id} »`, r && r.slice(0, 90)); }
t(/je ne sais pas/i.test(texteSection('tableau', E0, {})), 'tableau absent : « je ne sais pas »');
t(Object.keys(QUESTIONS_SECTIONS).length >= 10, 'une question « demander à Rayle » par section');
// RSS
const rss = `<rss><channel><item><title><![CDATA[FOMC &amp; statement]]></title><link>https://www.federalreserve.gov/x.htm</link><pubDate>Wed, 04 Nov 2026 19:00:00 GMT</pubDate><description>&lt;span class="a"&gt;The Committee&lt;/span&gt; decided…</description></item><item><title>Ancien</title><link>javascript:alert(1)</link><pubDate>Mon, 01 Jan 2018 00:00:00 GMT</pubDate></item></channel></rss>`;
const it = lireFlux(rss);
t(it.length === 2 && it[0].titre === 'FOMC & statement' && it[0].resume === 'The Committee decided…' && it[1].lien === '' && it[0].date > it[1].date, 'RSS : titre, résumé sans balises encodées, lien sûr, tri par date', JSON.stringify(it[0]));
const atom = `<feed><entry><title>Gold demand</title><link href="https://www.gold.org/a"/><updated>2026-11-01T00:00:00Z</updated><summary>Q3</summary></entry></feed>`;
t(lireFlux(atom)[0].lien === 'https://www.gold.org/a', 'Atom : lien par href');
// relais local
t(originePc({ protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8000' }) === 'http://127.0.0.1:8000' && originePc({ protocol: 'https:', hostname: 'justinmaneiro-alt.github.io', origin: 'x' }) === null, 'origine du PC reconnue seulement en local');
oublierChoixRelais();
await choisirRelais({ loc: { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:9' }, fetchFn: async () => ({ ok: true, json: async () => ({ ticker: { symbol: 'PF_US100USD' } }) }) });
t(relaisEstLocal() && relaisCourant() === 'http://127.0.0.1:9/__relais', 'relais du PC choisi quand il sert le Nasdaq');
oublierChoixRelais();
await choisirRelais({ loc: { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:9' }, fetchFn: async () => ({ ok: true, json: async () => ({ ticker: { symbol: 'PF_XAUUSD' } }) }) });
t(!relaisEstLocal() && /rayle-or-relais/.test(relaisCourant()), 'relais du PC refusé s’il renvoie un autre symbole (jamais l’or sous un autre nom)');
oublierChoixRelais();
let err = ''; try { await cotesJour(['NVDA'], { loc: null, wjson: null }); } catch (e) { err = e.message; } t(/ni serveur du PC ni Worker/.test(err), 'cotations liées : erreur claire sans source');
// position : longueur horizontale conservée par les modifications
const p = creerPosition({ actif: 'OR', entree: 100, stop: 99, objectif: 102, tAff0: 1000, tAff1: 5000 }, { pasQ: 0.001 });
const p2 = modifierPosition(p, { stop: 98.5 }, { pasQ: 0.001 });
t(p.tAff0 === 1000 && p2.tAff1 === 5000 && p2.stop === 98.5, 'position : bornes horizontales conservées après modification');
console.log(`terminal corrections (F) : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
