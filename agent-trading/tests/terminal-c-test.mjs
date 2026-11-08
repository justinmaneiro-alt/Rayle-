/* Tests de la PHASE C du terminal de Rayle (pur, Node) : calcul de la position (sens, R, risque $, taille), machine d'état
   (attente → ouverte → objectif / stop ; annulée ; clôturée à la main ; stop avant objectif dans la même bougie ; +1 R ; break-even ;
   proposition de Rayle à valider), lignes de journal, bilans (« pas assez de données » sous 30), gardien (2 %, 3 %, 6 %), export / import.
   Usage : node agent-trading/tests/terminal-c-test.mjs */
import { calcul, creerPosition, modifierPosition, suivre, cloturer, annuler, passerBE, valider, resultatR, ligneJournal, bilan, gardien, latent, exporterJson, exporterCsv, importerJson, importerCsv, jourParis, FINAUX } from '../front/terminal/positions-calcul.js';

let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, b = (i, l, h, c = (l + h) / 2) => ({ t: i * H, o: c, h, l, c, v: 1 });

const p0 = creerPosition({ actif: 'OR', unite: 'H1', cree: 0, entree: 4000, stop: 3990, objectif: 4020 }, { pasQ: 0.001 });
const c = calcul(p0, { pasQ: 0.001 });
t(c.achat && c.risqueU === 10 && c.risque$ === 50 && c.rObjectif === 2 && Math.abs(c.taille - 5) < 1e-9, 'achat : risque 0,5 % de 10 000 $ = 50 $, 5 contrats, 2 R');
const v = creerPosition({ actif: 'BTC', cree: 0, entree: 76000, stop: 76500, objectif: 75000, risquePct: 1 }, { pasQ: 0.0001 }), cv = calcul(v, { pasQ: 0.0001 });
t(!cv.achat && cv.risque$ === 100 && Math.abs(cv.taille - 0.2) < 1e-9 && cv.rObjectif === 2, 'vente déduite du stop au-dessus ; risque modifiable (1 %)');
t(creerPosition({ actif: 'OR', entree: 4000, stop: 3990, objectif: 3980 }) === null && creerPosition({ actif: 'OR', entree: 4000, stop: 4000, objectif: 4010 }) === null, 'objectif du mauvais côté ou stop nul : refusé');
t(p0.etat === 'attente', 'état initial : en attente');

// attente → ouverte → objectif
{ const r = suivre(p0, [b(1, 4005, 4012), b(2, 3999, 4006), b(3, 4004, 4011), b(4, 4012, 4021)]);
  t(r.p.etat === 'objectif' && r.p.tEntree === 2 * H && r.p.tSortie === 4 * H, 'attente → ouverte → objectif atteint');
  t(r.evenements.map(e => e.type).join() === 'ouverte,plus1R,objectif', 'événements : ouverte, +1 R, objectif', r.evenements.map(e => e.type).join());
  t(Math.abs(r.evenements[2].R - 2) < 1e-9, 'résultat +2 R');
  t(suivre(r.p, [b(5, 3000, 5000)]).evenements.length === 0, 'état final figé'); }
// stop avant objectif dans la même bougie
{ const r = suivre(p0, [b(1, 3999, 4001), b(2, 3985, 4025)]); t(r.p.etat === 'stop' && r.evenements.at(-1).R === -1, 'stop ET objectif dans la même bougie : stop d’abord (−1 R)'); }
// entrée et stop dans la même bougie
{ const r = suivre(p0, [b(1, 3985, 4003)]); t(r.p.etat === 'stop', 'entrée puis stop dans la même bougie'); }
// pas d'entrée → reste en attente ; bougies avant la création ignorées
{ const p = { ...p0, cree: 5 * H }; const r = suivre(p, [b(1, 3990, 4010), b(6, 4010, 4015)]); t(r.p.etat === 'attente' && !r.evenements.length, 'bougies avant la création ignorées ; entrée non touchée = en attente'); }
// annulée / clôturée / break-even / proposition
t(annuler(p0, 9).etat === 'annulee' && annuler({ ...p0, etat: 'ouverte' }) === null, 'annuler seulement avant l’entrée');
{ const o = suivre(p0, [b(1, 3998, 4011)]).p; t(o.etat === 'ouverte' && o.plus1R, 'ouverte + 1 R');
  const be = passerBE(o); t(be.stop === 4000 && be.be && calcul(be).risqueU === 10, 'break-even : stop à l’entrée, R calculé sur le risque initial');
  const s = suivre(be, [b(2, 3999.5, 4005)]); t(s.p.etat === 'stop' && s.evenements.at(-1).R === 0, 'stop au break-even = 0 R');
  const cl = cloturer(o, 4005, 3 * H); t(cl.etat === 'cloturee' && Math.abs(resultatR(cl, 4005) - 0.5) < 1e-9 && cl.historique.at(-1).R === 0.5, 'clôturée à la main : +0,5 R'); }
{ const pr = creerPosition({ actif: 'OR', cree: 0, entree: 4000, stop: 3990, objectif: 4020, etat: 'proposee', origine: 'rayle' }); t(suivre(pr, [b(1, 3990, 4030)]).evenements.length === 0, 'proposition de Rayle : jamais suivie avant validation'); t(valider(pr).etat === 'attente', 'valider la proposition d’un clic'); }
t(modifierPosition({ ...p0, etat: 'stop' }, { stop: 3995 }) === null, 'position finie : non modifiable');
{ const o = { ...p0, etat: 'ouverte' }, m = modifierPosition(o, { stop: 3995, entree: 1 }); t(m.entree === 4000 && m.stop === 3995 && m.stop0 === 3990, 'position ouverte : entrée figée, stop déplaçable, R sur le stop initial'); }

// journal
{ const r = suivre(p0, [b(1, 3999, 4001), b(2, 4010, 4021)]); const L = r.evenements.map(e => ligneJournal({ ...r.p, setup: 'W/M' }, e));
  t(L.length === 2 && L[1].R === 2 && L[1].duree === H && L[1].setup === 'W/M' && L[0].R === null && L[0].sens === 'achat', 'lignes de journal : date, actif, sens, prix, R, durée, setup'); }

// bilans et gardien
const fin = (i, R, setup = 'W/M', actif = 'OR', t0 = Date.UTC(2026, 10, 9, 9)) => ({ ...creerPosition({ actif, cree: t0 + i * H, entree: 4000, stop: 3990, objectif: 4020, setup }), etat: R < 0 ? 'stop' : 'objectif', tEntree: t0 + i * H, tSortie: t0 + i * H + 600e3, prixSortie: 4000 + 10 * R });
{ const P = Array.from({ length: 29 }, (_, i) => fin(i, i % 3 ? 2 : -1)); const B = bilan(P, 'setup'); t(B[0].n === 29 && !B[0].assez, 'bilan par setup : « pas assez de données » sous 30');
  P.push(fin(29, 2)); const B2 = bilan(P, 'setup'); t(B2[0].assez && Math.abs(B2[0].total - (19 * 2 - 10 + 2)) < 1e-9, 'bilan à 30 trades');
  t(bilan(P, 'actif')[0].nom === 'OR' && /h$/.test(bilan(P, 'heure')[0].nom), 'bilans par actif et par heure'); }
{ const now = Date.UTC(2026, 10, 9, 15), J = [fin(0, -1, 'x', 'OR', now - 5 * H), fin(1, -1, 'x', 'OR', now - 5 * H), fin(2, -1, 'x', 'OR', now - 5 * H), fin(3, -1, 'x', 'OR', now - 5 * H)];
  let g = gardien(J.slice(0, 3), { maintenant: now }); t(g.niveau === 'ok' && Math.abs(g.pertesJourPct - 1.5) < 1e-9, 'gardien : 1,5 % = dans les limites');
  g = gardien(J, { maintenant: now }); t(g.niveau === 'alerte' && /2 %/.test(g.message), 'gardien : alerte à 2 % de perte du jour');
  g = gardien(J, { maintenant: now, latent: -100 }); t(g.niveau === 'avertissement', 'gardien : avertissement à 3 % (latent compris)');
  const veille = Array.from({ length: 12 }, (_, i) => fin(i, -1, 'x', 'OR', now - 30 * H)); g = gardien(veille, { maintenant: now }); t(g.niveau === 'limite' && g.drawdownPct >= 6, 'gardien : limite de 6 % au total');
  t(gardien([fin(0, 4, 'x', 'OR', now - 50 * H), ...Array.from({ length: 10 }, (_, i) => fin(i + 1, -1, 'x', 'OR', now - 40 * H))], { maintenant: now }).drawdownPct === 5, 'drawdown mesuré depuis le plus haut de l’équité');
  t(Math.abs(latent([{ ...J[0], etat: 'ouverte' }], () => 3995) + 25) < 1e-9, 'latent des positions ouvertes'); }
t(jourParis(Date.UTC(2026, 10, 9, 23, 30)) === '2026-11-10', 'jour de Paris (après minuit à Paris)');

// export / import
{ const P = [fin(0, 2)], L = suivre(p0, [b(1, 3999, 4001)]).evenements.map(e => ligneJournal(p0, e));
  const d = importerJson(exporterJson(P, L)); t(d.positions.length === 1 && d.positions[0].etat === 'objectif' && d.lignes.length === 1, 'export / import JSON');
  const csv = exporterCsv([{ ...L[0], note: 'a;b "c"' }]); const back = importerCsv(csv); t(back.length === 1 && back[0].note === 'a;b "c"' && back[0].actif === 'OR', 'export / import CSV (séparateur et guillemets)');
  let e = null; try { importerJson('{"format":"x"}'); } catch (x) { e = x; } t(!!e, 'import étranger refusé'); }
t(FINAUX.includes('cloturee') && FINAUX.includes('annulee'), 'états finaux');

console.log(`terminal phase C : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
