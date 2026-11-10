/* Tests de la PARTIE B du terminal (pur, Node) : chaque motif de bougie sur bougies fabriquées, statistique (« pas assez de données »), régime et événements de niveaux,
   bougie du carnet, CVD / profil / VWAP / séances / niveaux ronds / absorption, état exposé à Rayle, rapport du jour.
   Usage : node agent-trading/tests/terminal-b-analyses-test.mjs */
import * as A from '../front/terminal/analyses-calcul.js';
import * as K from '../front/terminal/carnet-bougie-calcul.js';
import { etatEtendu, lignesEtendues, rapportJour, estRapport, SEPARATION } from '../front/terminal/rapport-jour.js';
import { COUCHES, defauts } from '../front/terminal/couches-terminal.js';
let ok = 0, ko = 0; const t = (c, m, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', m, d); } };
const bg = (o, h, l, c, v = 100, i = 0) => ({ t: 1_700_000_000_000 + i * 3600e3, o, h, l, c, v });
/* tendance précédente fabriquée : 8 bougies qui montent ou descendent de 1 par bougie (amplitude 1) */
const avant = (sens, p0 = 100) => Array.from({ length: 8 }, (_, i) => { const m = p0 + sens * i, c = m + sens * 0.9; return bg(m, Math.max(m, c) + 0.1, Math.min(m, c) - 0.1, c, 100, i); });
const suite = (pre, ...bs) => { const B = pre.slice(); bs.forEach((b, k) => B.push({ ...b, t: pre[pre.length - 1].t + (k + 1) * 3600e3 })); return B; };
const detecte = (B, id) => A.motifsA(B, B.length - 1).includes(id);

const bas = avant(-1), haut = avant(+1);
const fin = B => B[B.length - 1].c;
t(detecte(suite(bas, bg(fin(bas), fin(bas) + 0.1, fin(bas) - 3, fin(bas) + 0.2)), 'marteau'), 'marteau après baisse');
t(!detecte(suite(haut, bg(fin(haut), fin(haut) + 0.1, fin(haut) - 3, fin(haut) + 0.2)), 'marteau'), 'pas de marteau après une hausse');
t(detecte(suite(bas, bg(fin(bas), fin(bas) + 3, fin(bas) - 0.1, fin(bas) + 0.2)), 'marteau_inverse'), 'marteau inversé après baisse');
t(detecte(suite(haut, bg(fin(haut), fin(haut) + 3, fin(haut) - 0.1, fin(haut) + 0.2)), 'etoile_filante'), 'étoile filante après hausse');
t(detecte(suite(haut, bg(110, 111, 109, 110.05)), 'doji'), 'doji');
t(detecte(suite(haut, bg(110, 110.3, 107, 109.8)), 'pin_haussier') && !detecte(suite(haut, bg(110, 110.3, 107, 109.8)), 'pin_baissier'), 'pin bar haussière');
t(detecte(suite(haut, bg(110, 113, 109.7, 110.2)), 'pin_baissier'), 'pin bar baissière');
{ const B = suite(bas, bg(99, 99.2, 97, 97.4), bg(97, 100.2, 96.8, 100)); t(detecte(B, 'avalement_haussier'), 'avalement haussier'); }
{ const B = suite(haut, bg(105, 107, 104.8, 106.8), bg(107, 107.2, 104, 104.5)); t(detecte(B, 'avalement_baissier'), 'avalement baissier'); }
{ const B = suite(bas, bg(103, 103.1, 99, 99.2), bg(100, 101.5, 99.8, 101)); t(detecte(B, 'harami_haussier'), 'harami haussier'); }
{ const B = suite(haut, bg(100, 104, 99.9, 103.9), bg(102.8, 103.5, 102, 102.4)); t(detecte(B, 'harami_baissier'), 'harami baissier'); }
{ const B = suite(bas, bg(100, 100.2, 96, 96.3), bg(95.8, 96.4, 95.4, 95.9), bg(96, 99.5, 95.9, 99.4)); t(detecte(B, 'etoile_matin'), 'étoile du matin'); }
{ const B = suite(haut, bg(100, 104.2, 99.8, 104), bg(104.5, 105.1, 104.1, 104.6), bg(104.4, 104.5, 100.5, 100.8)); t(detecte(B, 'etoile_soir'), 'étoile du soir'); }
{ const B = suite(bas, bg(100, 102.1, 99.9, 102), bg(101.5, 104.1, 101.4, 104), bg(103.5, 106.1, 103.4, 106)); t(detecte(B, 'trois_soldats'), 'trois soldats blancs'); }
{ const B = suite(haut, bg(106, 106.1, 103.9, 104), bg(104.5, 104.6, 101.9, 102), bg(102.5, 102.6, 99.9, 100)); t(detecte(B, 'trois_corbeaux'), 'trois corbeaux noirs'); }
{ const B = suite(haut, bg(100, 106, 99, 105), bg(103, 104, 101, 102)); t(detecte(B, 'inside_bar'), 'inside bar'); }
{ const B = suite(haut, bg(103, 104, 102, 103.5), bg(103, 106, 100, 105)); t(detecte(B, 'outside_bar'), 'outside bar'); }
t(A.motifsA([bg(1, 1, 1, 1)], 0).length === 0, 'bougie plate : aucun motif');
t(Object.keys(A.MOTIFS).length === 16, '16 motifs au catalogue');

// statistique : < 30 occurrences → « pas assez de données »
{ const B = suite(bas, bg(fin(bas), fin(bas) + 0.1, fin(bas) - 3, fin(bas) + 0.2), bg(101, 103, 100.5, 102), bg(102, 104, 101, 103), bg(103, 105, 102, 104), bg(104, 106, 103, 105), bg(105, 107, 104, 106), bg(106, 108, 105, 107));
  const s = A.statistique(B, 'marteau'); t(!s.suffisant && /pas assez de données/.test(s.texte), 'statistique : pas assez de données sous 30 occurrences', s.texte); }
{ // série longue répétitive : 40 marteaux suivis de hausse → statistique suffisante
  const B = []; let p = 100; for (let k = 0; k < 45; k++) { for (let i = 0; i < 6; i++) { B.push(bg(p, p + 0.2, p - 1.1, p - 0.9, 100, B.length)); p -= 0.9; } B.push(bg(p, p + 0.05, p - 4, p + 0.2, 100, B.length)); for (let i = 0; i < 6; i++) { B.push(bg(p, p + 1.1, p - 0.1, p + 0.9, 100, B.length)); p += 0.9; } }
  const s = A.statistique(B, 'marteau'); t(s.suffisant && s.occurrences >= 30 && /testé \d+ fois, a fonctionné \d+ fois/.test(s.texte), 'statistique : « testé N fois, a fonctionné M »', s.texte); }
{ const B = suite(bas, bg(fin(bas), fin(bas) + 0.1, fin(bas) - 3, fin(bas) + 0.2));
  const L = A.lireMotifs(B, null, { niveaux: [{ p: fin(bas) - 2.8, nom: 'support de la veille' }], ma200: fin(bas) + 0.1 });
  const M0 = L.find(m => m.id === 'marteau'); t(M0 && M0.contexte.surNiveau && M0.contexte.surNiveau.type === 'support' && M0.contexte.ma200Proche && M0.coherent === true && /Lecture, pas un signal d’ordre/.test(M0.texte), 'contexte : sur un support, MA200 proche, jamais un signal', M0 && M0.texte); }

// régime et événements
{ const R = []; for (let i = 0; i < 60; i++) { const m = 100 + (i % 2 ? 2 : -2) + 0.0; R.push(bg(m, m + 1.5 + (i % 4 === 0 ? 1 : 0), m - 1.5 - (i % 5 === 0 ? 1 : 0), 100 + (i % 2 ? 1.2 : -1.2), 100, i)); }
  const g = A.regime(R); t(g.regime === 'range', 'régime : range reconnu', JSON.stringify(g)); }
{ const R = Array.from({ length: 60 }, (_, i) => bg(100 + i, 101 + i, 99.5 + i, 100.8 + i, 100, i)); t(A.regime(R).regime === 'tendance haussière', 'régime : tendance haussière'); }
{ const R = Array.from({ length: 60 }, (_, i) => bg(200 - i, 200.5 - i, 199 - i, 199.2 - i, 100, i)); t(A.regime(R).regime === 'tendance baissière', 'régime : tendance baissière'); }
t(A.regime([bg(1, 2, 0, 1)]).regime === 'inconnu', 'régime : pas assez de bougies = inconnu (dit pourquoi)');
{ const R = Array.from({ length: 50 }, (_, i) => bg(100, 101, 99, 100, 100, i)); for (let i = 50; i < 55; i++) R.push(bg(100, 100.2, 99.8, 100, 100, i)); t(A.regime(R).compression === true, 'compression de volatilité', JSON.stringify(A.regime(R))); }
{ const B = Array.from({ length: 30 }, (_, i) => bg(100, 101, 99, 100.2, 100, i)); B.push(bg(100.2, 103.5, 100, 103.2, 100, 30));
  const E = A.evenementsNiveau(B, [{ p: 101.5, nom: 'ma résistance' }]); t(E.some(e => e.type === 'cassure' && e.sens === 'hausse'), 'événement : cassure haussière confirmée', JSON.stringify(E)); }
{ const B = Array.from({ length: 30 }, (_, i) => bg(100, 101, 99, 100.2, 100, i)); B.push(bg(100.2, 101.4, 100, 101.2, 100, 30)); B.push(bg(101.2, 102, 101.1, 101.8, 100, 31)); B[B.length - 2].c = 100.8;
  const E = A.evenementsNiveau(B, [{ p: 101, nom: 'niveau' }]); t(E.some(e => e.type === 'traversee' || e.type === 'cassure'), 'événement : traversée détectée', JSON.stringify(E)); }
{ const B = Array.from({ length: 30 }, (_, i) => bg(98, 99, 97, 98.2, 100, i)); B.push(bg(98.2, 101.3, 98, 100.9, 100, 30)); B.push(bg(100.9, 101, 98.6, 98.8, 100, 31));
  const E = A.evenementsNiveau(B, [{ p: 100, nom: 'résistance' }]); t(E.some(e => e.type === 'faux_mouvement' && e.sens === 'baisse'), 'événement : faux mouvement (balayage puis retour)', JSON.stringify(E)); }
{ const B = Array.from({ length: 30 }, (_, i) => bg(103, 104, 102.5, 103.2, 100, i)); B.push(bg(103, 103.2, 99.9, 100.3, 100, 30)); B.push(bg(100.2, 102, 99.9, 101.6, 100, 31));
  const E = A.evenementsNiveau(B, [{ p: 100, nom: 'support' }]); t(E.some(e => e.type === 'retournement' && e.sens === 'hausse'), 'événement : retournement haussier sur un niveau', JSON.stringify(E)); }

// outils institutionnels
const tx = [{ t: 1000, q: 5, cote: 'buy' }, { t: 2000, q: 2, cote: 'sell' }, { t: 3000, q: 4, cote: 'buy' }];
t(A.cvd(tx).map(x => x.v).join() === '5,3,7', 'CVD cumulé');
t(A.deltaParPeriode(tx, 2000).map(x => x.delta).join() === '3,4' || A.deltaParPeriode(tx, 2000).length === 2, 'delta par période');
{ const B = [bg(100, 101, 99, 100, 10, 0), bg(100, 102, 100, 101, 100, 1), bg(101, 102, 100, 101, 100, 2), bg(101, 104, 101, 103, 5, 3)];
  const P = A.profilVolume(B, { cases: 20 }); t(P && P.poc > 100 && P.poc < 102 && P.val <= P.poc && P.vah >= P.poc, 'profil de volume : POC / VAL / VAH cohérents', JSON.stringify({ poc: P && P.poc, val: P && P.val, vah: P && P.vah }));
  t(A.profilVolume([bg(1, 1, 1, 1, 0)]) === null, 'profil : prix plat = null'); t(/volume absent/.test(A.profilVolume([bg(1, 2, 0, 1, 0, 0)]).raison), 'profil : volume absent dit'); }
{ const V = A.vwap([bg(10, 12, 8, 10, 100), bg(10, 14, 10, 12, 300)]); t(Math.abs(V[0].v - 10) < 1e-9 && Math.abs(V[1].v - (10 * 100 + 12 * 300) / 400) < 1e-9, 'VWAP : prix typique pondéré par le volume'); }
{ const mt = Date.UTC(2026, 10, 10, 12, 0), B = [-26, -25, -3, -2, -1, 0].map((h, i) => ({ t: mt + h * 3600e3, o: 100 + i, h: 110 + i, l: 90 + i, c: 105 + i, v: 10 }));
  const E = A.extremes(B, mt); t(E.veille && E.veille.haut >= 110 && E.jour && E.jour.haut > 0, 'extrêmes de la veille et du jour', JSON.stringify(E));
  const va = A.vwapAncre(B, B[3].t); t(va.length === 3 && va[0].t === B[3].t, 'VWAP ancré : part de la bougie cliquée'); }
{ const mt = Date.UTC(2026, 10, 10, 20, 0), B = [7, 12, 17].map((h, i) => ({ t: Date.UTC(2026, 10, 10, h - 1, 0), o: 100, h: 101 + i, l: 99 - i, c: 100.5, v: 10 }));
  const S = A.plagesSeances(B, mt); t(S.length === 3 && S.find(x => x.id === 'asie').n >= 1 && S.find(x => x.id === 'londres').n >= 1, 'séances Asie / Londres / New York', JSON.stringify(S.map(x => [x.id, x.n]))); }
{ const R = A.niveauxRonds(4070.25); t(R.some(x => x.p === 4100) && R.some(x => x.p === 4050 || x.p === 4000), 'niveaux ronds autour de 4070', JSON.stringify(R.map(x => x.p))); t(A.niveauxRonds(0).length === 0, 'niveaux ronds : prix absent'); }
{ const B = Array.from({ length: 30 }, (_, i) => bg(100, 101, 99, 100, 100, i)); for (let i = 24; i < 30; i++) B[i] = bg(100, 100.3, 99.8, 100.1, 400, i);
  const a = A.absorption(B, [{ t: B[24].t, q: 50, cote: 'buy' }]); t(a && a.type === 'absorption' && /déduction, pas une certitude/.test(a.texte) && /vendeurs passifs/.test(a.cote), 'absorption : étiquetée « déduction, pas une certitude »', a && a.texte); t(A.absorption(Array.from({ length: 30 }, (_, i) => bg(100, 101, 99, 100, 100, i))) === null, 'absorption : rien si volume normal'); }
{ const T = Array.from({ length: 80 }, (_, i) => ({ t: i, p: i % 8 === 0 ? 100 : 101 + (i % 8) * 0.1, q: i % 8 === 0 ? 1 : 0.2, cote: 'buy' })); const o = A.ordresCaches(T, []); t(o && o.p === 100 && /déduction/.test(o.texte), 'ordre caché probable : étiqueté déduction'); t(A.ordresCaches(T, [100]) === null, 'ordre caché : pas si un mur est visible'); t(A.ordresCaches([], []) === null, 'ordres cachés : trop peu de données'); }

// bougie du carnet
{ const book = (b, a) => ({ bids: new Map(b), asks: new Map(a) });
  const p1 = K.pression(book([[100, 30], [99.9, 30]], [[100.1, 10], [100.2, 10]])); t(Math.abs(p1.valeur - 0.5) < 1e-9, 'pression nette = (achat − vente) / total', JSON.stringify(p1));
  t(K.pression(book([[100, 1]], [[100.1, 3]])).valeur === -0.5, 'pression vendeuse négative');
  t(K.pression(book([[100, 5], [90, 1000]], [[100.1, 5]])).valeur === 0, 'fenêtre ±0,5 % : un niveau lointain est ignoré');
  t(K.pression(book([[100, 5], [99.9, 100]], [[100.1, 5], [100.2, 1]]), { niveaux: 1 }).valeur === 0, 'N premiers niveaux');
  t(K.pression(null) === null && K.pression(book([], [[1, 1]])) === null, 'carnet vide : null');
  const C = K.creerBougiesCarnet('15s'); const T0 = 1_700_000_000_000 - (1_700_000_000_000 % 15000);
  C.ajouterPression(T0 + 100, 0.2); C.ajouterPression(T0 + 5000, 0.6); C.ajouterPression(T0 + 9000, -0.3); C.ajouterPression(T0 + 14000, 0.1);
  C.ajouterEchange(T0 + 200, 5, 'buy'); C.ajouterEchange(T0 + 300, 2, 'sell');
  let b = C.derniere(); t(b.o === 0 && b.h === 0.6 && b.l === -0.3 && b.c === 0.1, 'bougie : part de zéro, plus haut / plus bas / clôture de la pression', JSON.stringify(b)); t(b.delta === 3 && b.ouverte, 'delta des échanges de la période (achats − ventes)');
  C.ajouterPression(T0 + 16000, -0.5); t(C.bougies().length === 2 && C.bougies()[0].c === 0.1 && !C.bougies()[0].ouverte && C.bougies()[1].o === 0, 'nouvelle période : la précédente est fermée, la suivante repart de zéro');
  for (const p of Object.keys(K.PERIODES)) t(K.creerBougiesCarnet(p).periode() === p, 'période ' + p); t((() => { try { K.creerBougiesCarnet('7s'); } catch (e) { return true; } })(), 'période inconnue refusée');
  t(/acheteuse/.test(K.lectureBougieCarnet({ o: 0, h: 0.6, l: -0.1, c: 0.5, delta: 3 })) && /Mesuré depuis l’ouverture/.test(K.lectureBougieCarnet(null)), 'lecture de la bougie pour Rayle + mention'); }

// couches : tout ce qui s'ajoute est désactivé par défaut
{ const nouvelles = ['carnetBougie', 'cvd', 'profilVolume', 'vwap', 'vwapAncre', 'extremes', 'seances', 'rondes', 'motifs', 'evenements']; const D = defauts();
  t(nouvelles.every(id => COUCHES.some(c => c.id === id) && D[id] === false), 'nouvelles couches présentes ET désactivées par défaut', nouvelles.filter(id => !(COUCHES.some(c => c.id === id) && D[id] === false)).join()); t(D.chaleur === false && D.volume === true, 'chaleur toujours désactivée, graphique vierge inchangé'); }

// état étendu et rapport
const base = { actif: 'XAU' };
const X = etatEtendu({ base, motifs: [{ nom: 'marteau', sens: 'hausse', texte: 'marteau à la clôture', stat: { texte: 'pas assez de données' } }], chaleur: { resume: 'mur acheteur persistant vers 4060' }, bougieCarnet: { texte: 'pression acheteuse' }, institutionnel: { cvd: 120, poc: 4065, val: 4050, vah: 4080, vwap: 4062, deduction: 'absorption probable (déduction, pas une certitude)' }, regimeInfo: { regime: 'range', raison: 'amplitude 4 ATR', compression: true }, evenements: [{ type: 'cassure', texte: 'cassure haussière de 4080' }], annonces: [{ titre: 'CPI', devise: 'USD', sortie: true, effet: '+0,4 %' }, { titre: 'NFP', devise: 'USD', dansMin: 90 }] });
const LX = lignesEtendues(X, { fmt: String }).join('\n');
for (const m of ['Motifs de bougies', 'Régime', 'range', 'Carte de chaleur', 'Bougie du carnet', 'CVD 120', 'POC 4065', 'VWAP', 'déduction, pas une certitude', 'cassure haussière', 'CPI', 'NFP', 'FAITS MESURÉS', 'coïncide avec', 'au plus deux scénarios']) t(LX.includes(m), 'état exposé à Rayle contient : ' + m, LX.slice(0, 200));
t(/Hypothèses/.test(X.separation) && X.chaleur.source && X.bougieCarnet.source, 'chaque rubrique cite sa source');
t(lignesEtendues(etatEtendu({ base })).length === 1, 'rubriques absentes : rien d\'inventé (seule la consigne reste)');

const MT = Date.UTC(2026, 10, 10, 14, 0); const jb = h => Date.UTC(2026, 10, 10, h, 0);
const actif = { nom: 'Or', prix: 4070.25, B: [8, 9, 10, 11, 12, 13].map((h, i) => ({ t: jb(h), o: 4050 + i * 4, h: 4056 + i * 4, l: 4046 + i * 4, c: 4054 + i * 4, v: 100 })), tendances: { M15: 'haussière', H1: 'haussière' }, ma200: 4020, niveaux: { dessus: [{ p: 4095 }], dessous: [{ p: 4050 }] }, carnet: { lecture: 'plus d’acheteurs que de vendeurs près du prix' }, pressionCarnet: 0.32, positions: [{ sens: 'achat', etat: 'ouverte' }], annonces: [{ titre: 'CPI', devise: 'USD', sortie: true, effet: '+0,4 %' }, { titre: 'NFP', devise: 'USD', t: MT + 2 * 3600e3 }], motifs: [{ nom: 'marteau', stat: { texte: 'pas assez de données' } }], evenements: [{ texte: 'cassure haussière de 4050' }], cot: 'spéculateurs nets acheteurs', actus: ['Le dollar recule'], scenarios: [{ nom: 'A · rebond', sens: 'hausse', niveau: 4050, validation: 'clôture au-dessus', invalidation: 'clôture sous 4040' }, { nom: 'B · cassure', sens: 'hausse', niveau: 4095, validation: 'x', invalidation: 'y' }, { nom: 'C · trois', sens: 'baisse', niveau: 1, validation: 'x', invalidation: 'y' }] };
const fm = (n, x) => Number(x).toFixed(2).replace('.', ','), hr = () => '14 h';
const Rn = rapportJour([actif], { fmt: fm, heure: hr, maintenant: MT, detail: 'normal' });
t(/RAPPORT DU JOUR/.test(Rn.texte) && /ouverture/.test(Rn.texte) && /plus haut/.test(Rn.texte) && /Maintenant/.test(Rn.texte) && /À venir/.test(Rn.texte) && /COT/.test(Rn.texte) && /Annonces sorties/.test(Rn.texte) && /effet mesuré \+0,4 %/.test(Rn.texte), 'rapport : ce qui s\'est passé, état actuel, ce qui arrive, COT, effet mesuré des annonces', Rn.texte.slice(0, 300));
t((Rn.texte.match(/Scénario [A-Z]/g) || []).length === 2, 'rapport : deux scénarios au maximum (le troisième est écarté)');
t(Rn.texte.includes(SEPARATION) && /Information de lecture, pas un signal ni une promesse/.test(Rn.texte) && /tant que Rayle est ouvert/.test(Rn.texte), 'rapport : séparation faits / hypothèses et mention');
t(/n’en est pas forcément l’effet/.test(Rn.texte) && !/a causé|à cause de/.test(Rn.texte), 'rapport : une annonce n\'est jamais présentée comme la cause');
const mots = x => x.split(/\s+/).length;
const Rc = rapportJour([actif], { fmt: fm, heure: hr, maintenant: MT, detail: 'court' }), Rd = rapportJour([actif], { fmt: fm, heure: hr, maintenant: MT, detail: 'detail' });
t(Rd.texte.length > Rn.texte.length && Rn.texte.length > Rc.texte.length, 'rapport : détail réglable (court < normal < détaillé)', [Rc.texte.length, Rn.texte.length, Rd.texte.length].join());
t(/Le dollar recule/.test(Rd.texte) && !/Le dollar recule/.test(Rn.texte), 'rapport détaillé : actualités utiles ajoutées');
t(mots(Rn.parle) / 2.7 <= 125 && mots(Rn.parle) >= 30 && /Information de lecture/.test(Rn.parle), 'version parlée : ≤ 2 minutes', Math.round(mots(Rn.parle) / 2.7) + ' s');
t(/données indisponibles/.test(rapportJour([{ nom: 'Solana', prix: null, B: [] }], { fmt: fm, heure: hr, maintenant: MT }).texte) && /Aucun actif/.test(rapportJour([], {}).texte), 'rapport : donnée absente = « je ne sais pas »');
t(rapportJour([actif, { ...actif, nom: 'Bitcoin' }], { fmt: fm, heure: hr, maintenant: MT }).sections.length === 2, 'rapport : plusieurs actifs suivis');
t(estRapport('Rayle, fais-moi un rapport sur les marchés aujourd’hui') === 'normal' && estRapport('fais-moi un rapport détaillé du jour') === 'detail' && estRapport('donne-moi un rapport rapide') === 'court' && estRapport('quelle heure est-il') === null, 'commande vocale du rapport reconnue');

console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
