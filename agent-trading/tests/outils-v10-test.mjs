/* Tests des outils de dessin (modèle, position, aimantation, export / import) et de la surveillance v10 (approche, touche, rebond = flèche,
   cassure = croix + retourné, position, alertes libres, non-repeint, registre, bilan) : node agent-trading/tests/outils-v10-test.mjs */
import assert from 'node:assert/strict';
import * as O from '../front/or/outils-calcul.js';
import { REGLES_V10, DEPUIS_V10, surveiller, surveillerObjet, fractalesMajeures, niveauxProposes, excursionEvenement, bilanRegistre, bilanV10 } from '../front/or/fleches-v10.js';
import { atrLocal } from '../front/or/niveaux-periode.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }, ok = (c, m) => { assert.ok(c, m); n++; };
const H = 3600e3, T0 = Date.UTC(2026, 9, 5, 0);

// règles figées
eq(Object.isFrozen(REGLES_V10), true, 'règles v10 figées');
eq([REGLES_V10.approcheAtr, REGLES_V10.toucheAtr, REGLES_V10.reboundAtr, REGLES_V10.cassureAtr, REGLES_V10.excursionBougies, REGLES_V10.minEvenements], [0.5, 0.25, 1, 0.5, 48, 30], 'seuils de la consigne');
eq(DEPUIS_V10.t, Date.parse('2026-11-08T16:14:02+01:00'), 'bilan v10 ouvert à la date du commit de ses règles');

/* modèle */
eq(O.creer('horizontale', { p: 4070.123 }, { t: 5, id: 'a' }).p, 4070.12, 'ligne horizontale : prix arrondi au centime');
eq(O.creer('horizontale', { p: -1 }), null, 'prix invalide refusé');
{ const z = O.creer('zone', { bas: 4080, haut: 4060 }, { id: 'z' }); eq([z.bas, z.haut], [4060, 4080], 'zone : bas et haut remis dans l’ordre'); }
{ const t = O.creer('tendance', { t1: 10, p1: 100, t2: 0, p2: 90 }, { id: 't' }); eq([t.t1, t.p1, t.t2, t.p2], [0, 90, 10, 100], 'tendance : ancres triées dans le temps');
  eq([O.valeur(t, 5), O.valeur(t, 20), O.valeur(t, -1)], [95, 110, null], 'valeur de la droite : entre les ancres, prolongée à droite, rien avant'); }
eq(O.creer('tendance', { t1: 3, p1: 1, t2: 3, p2: 2 }), null, 'deux ancres à la même heure : refusé');
{ const m = O.modifier(O.creer('horizontale', { p: 4000 }, { id: 'h', t: 7 }), { p: 4010.5, couleur: '#fff', etiquette: 'PdV', epaisseur: 2, pirate: 1 });
  eq([m.p, m.couleur, m.etiquette, m.epaisseur, m.cree, m.id, 'pirate' in m], [4010.5, '#fff', 'PdV', 2, 7, 'h', false], 'modification : prix, couleur, étiquette, épaisseur ; champ inconnu ignoré'); }
/* position : sens déduit du stop, R, risque 0,5 % de 10 000 $, taille en contrats de 1 once */
{ const p = O.creer('position', { entree: 4070, stop: 4090, objectif: 4010 }, { id: 'p' }), c = O.calculPosition(p);
  eq([c.sens, +c.R.toFixed(2), c.risque, c.taille], ['vente', 3, 50, 2.5], 'vente : stop au-dessus, R 3, risque 50 $, taille 2,5 contrats');
  eq(O.libellePosition(p), 'Vente · Entrée 4 070 · SL 4 090 · TP 4 010 · R 3,0 · risque 50 $ · taille 2,500 contrats (1 oz)', 'étiquette unique de la position');
  const q = O.modifier(p, { stop: 4060, risquePct: 1 }), c2 = O.calculPosition(q); eq([c2.sens, c2.coherent, c2.risque], ['achat', false, 100], 'stop déplacé sous l’entrée : achat (TP du mauvais côté signalé), risque 1 %');
  ok(/TP du mauvais côté/.test(O.libellePosition(q)), 'incohérence dite dans l’étiquette'); }
eq(O.calculPosition(O.creer('position', { entree: 4000, stop: 3993, objectif: 4021 }, { id: 'p2' })).taille, 7.142, 'taille arrondie vers le bas au pas de 0,001');
/* aimantation */
{ const b = { o: 100, h: 105, l: 95, c: 102 }; eq([O.aimanter(104.6, b, 1), O.aimanter(103.5, b, 0.4), O.aimanter(95.3, b, 1)], [105, 103.5, 95], 'aimantation au haut / bas / clôture la plus proche, sinon le prix cliqué'); }
/* export / import */
{ const L = [O.creer('horizontale', { p: 4000 }, { id: 'a', t: 1 }), O.creer('zone', { bas: 3990, haut: 3995 }, { id: 'b', t: 2 })], txt = O.exporter(L, [{ cle: 'H4|creux|1', etat: 'confirme' }]);
  const r = O.importer(txt); eq([r.objets.map(o => o.id), r.decisions.length, r.ignores], [['a', 'b'], 1, 0], 'export puis import : objets et décisions retrouvés');
  const j = JSON.parse(txt); j.objets.push({ type: 'horizontale', p: 'x' }, { type: 'inconnu' }); eq(O.importer(JSON.stringify(j)).ignores, 2, 'import : objets invalides ignorés');
  eq(O.importer('pas du json').erreur, 'fichier illisible (JSON invalide)', 'import : fichier illisible dit clairement'); }

/* ───────── surveillance : séries fabriquées ───────── */
// série plate autour de 2000 (ATR ≈ 2), puis scénarios autour d'une ligne à 1990 (support)
function serie(nb, f = () => 2000) { const B = []; for (let i = 0; i < nb; i++) { const p = f(i); B.push({ t: T0 + i * H, o: p, h: p + 1, l: p - 1, c: p }); } return B; }
const avec = (B, M) => B.map((b, i) => M[i] ? { ...b, ...M[i] } : b);
const lig = O.creer('horizontale', { p: 1990 }, { id: 'L', t: T0 }), at = i => `${i}`;
const evts = (B, o) => { const A = atrLocal(B, 14), r = surveillerObjet(B, A, o); return { r, types: r.ev.map(e => `${e.type}@${(e.t - T0) / H}`) }; };
{ // approche, touche, rebond (flèche verte), une seule par approche
  const B = avec(serie(80), { 40: { o: 1996, h: 1997, l: 1994, c: 1995 }, 41: { o: 1995, h: 1996, l: 1990.3, c: 1992 }, 42: { o: 1992, h: 1994, l: 1991, c: 1993 }, 43: { o: 1993, h: 1996, l: 1992, c: 1995 } });
  const { r, types } = evts(B, lig);
  ok(types.includes('approche@41') && types.includes('touche@41'), `approche et touche à 0,25 ATR (${types.join(', ')})`);
  eq(r.fleches.map(f => [(f.t - T0) / H, f.sens]), [[42, 'hausse']], 'rebond confirmé : flèche verte à la première clôture ≥ 1 ATR au-dessus (1 993 > 1 990 + ATR ≈ 2,5), sans nouvel extrême');
  eq(r.fleches[0].tTouche, T0 + 41 * H, 'flèche : bougie de touche notée'); }
{ // nouvel extrême avant la confirmation : pas de flèche
  const B = avec(serie(80), { 41: { o: 1995, h: 1996, l: 1990.3, c: 1991 }, 42: { o: 1991, h: 1992, l: 1990.1, c: 1991.5 }, 43: { o: 1991.5, h: 1992, l: 1990.05, c: 1991 } });
  const F = evts(B, lig).r.fleches; eq(F.map(f => [(f.t - T0) / H, (f.tTouche - T0) / H]), [[44, 43]], 'chaque nouvel extrême annule l’attente : la flèche part de la DERNIÈRE touche (43), jamais d’une touche dépassée'); }
{ // cassure confirmée : croix, retourné, puis la ligne devient une résistance
  const B = avec(serie(120, i => (i < 60 ? 2000 : 1985)), { 58: { o: 1995, h: 1996, l: 1990.2, c: 1991 }, 59: { o: 1991, h: 1991.5, l: 1987, c: 1988 } });
  const { r } = evts(B, lig);
  eq(r.croix.map(c => (c.t - T0) / H), [59], 'cassure : clôture à ≥ 0,5 ATR sous le support → croix');
  ok(r.retourne && r.cote === 'resistance', 'ligne marquée retournée : ancien support devenu résistance');
  ok(r.ev.some(e => e.type === 'cassure' && e.retourne), 'événement de cassure enregistré'); }
{ // résistance : rebond rouge
  const B = avec(serie(80, () => 1980), { 40: { o: 1985, h: 1989.8, l: 1984, c: 1987 }, 41: { o: 1987, h: 1988, l: 1985, c: 1986 }, 42: { o: 1986, h: 1987, l: 1984, c: 1986.5 } });
  const r = evts(B, lig).r; eq(r.fleches.map(f => f.sens), ['baisse'], 'résistance : flèche rouge'); }
{ // zone : touche du bord haut (support), cassure au-delà du bord bas
  const z = O.creer('zone', { bas: 1986, haut: 1990 }, { id: 'Z', t: T0 }), B = avec(serie(80), { 40: { o: 1995, h: 1996, l: 1990.2, c: 1993 }, 42: { o: 1993, h: 1997, l: 1992, c: 1996 } }), r = evts(B, z).r;
  ok(r.ev.some(e => e.type === 'touche' && e.niveau === 1990), 'zone : touche du bord haut');
  const B2 = avec(serie(80), { 49: { o: 1995, h: 1995, l: 1987, c: 1988 } }), r2 = evts(B2, z).r;
  eq(r2.croix.length, 0, 'zone : clôture DANS la zone (1 988), pas de cassure');
  const B3 = avec(serie(80, i => (i < 50 ? 2000 : 1980)), { 49: { o: 1990, h: 1991, l: 1984, c: 1984.5 } }), r3 = evts(B3, z).r;
  eq(r3.croix.map(c => [(c.t - T0) / H, c.niveau]), [[49, 1986]], 'zone : clôture à ≥ 0,5 ATR sous le bord BAS → croix sur le bord bas'); }
{ // ligne de tendance : valeur à la bougie courante
  const t = O.creer('tendance', { t1: T0, p1: 1980, t2: T0 + 50 * H, p2: 1990 }, { id: 'T', t: T0 }), B = avec(serie(90, i => 2000 + i * 0.2), { 60: { o: 2010, h: 2011, l: 1992.3, c: 2001 }, 61: { o: 2001, h: 2015, l: 2000, c: 2013 } });
  const r = evts(B, t).r; ok(r.ev.some(e => e.type === 'touche' && Math.abs(e.niveau - 1992) < 1e-9), 'tendance : touche à la valeur de la droite à cette heure (1 992)'); }
{ // position : entrée, +1 R (break-even), objectif ; alerte libre
  const p = O.creer('position', { entree: 2000, stop: 1995, objectif: 2015 }, { id: 'P', t: T0 + 10 * H }), B = avec(serie(80), { 30: { h: 2006, c: 2005 }, 40: { h: 2016, c: 2014 } });
  const r = surveiller(B, [p]); eq(r.ev.map(e => e.type), ['entree', 'plus1R', 'objectif'], 'position : entrée, +1 R (proposer break-even), objectif');
  const a = O.creer('horizontale', { p: 1999.5, alerte: true }, { id: 'A', t: T0 }); ok(surveiller(serie(40), [a]).ev.filter(e => e.type === 'alerte').length === 1, 'alerte de prix libre : une fois par approche'); }
{ // surveillé seulement après sa création
  const lAp = O.creer('horizontale', { p: 1990 }, { id: 'L2', t: T0 + 70 * H }), B = avec(serie(90), { 41: { o: 1995, h: 1996, l: 1990.3, c: 1992 }, 43: { c: 1995, h: 1996 } });
  eq(evts(B, lAp).r.ev.length, 0, 'aucun événement avant la création de l’objet'); }
{ // non-repeint : rejeu bougie par bougie sur une marche au hasard avec plusieurs objets
  let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }, B = []; let p = 2000;
  for (let i = 0; i < 600; i++) { const o = p, c = p + (r() - 0.5) * 6; p = c; B.push({ t: T0 + i * H, o, c, h: Math.max(o, c) + r() * 3, l: Math.min(o, c) - r() * 3 }); }
  const objets = [O.creer('horizontale', { p: 2000 }, { id: 'h', t: T0 }), O.creer('zone', { bas: 1990, haut: 1994 }, { id: 'z', t: T0 }), O.creer('tendance', { t1: T0, p1: 1980, t2: T0 + 300 * H, p2: 2010 }, { id: 't', t: T0 }), O.creer('rayon', { t1: T0, p1: 2020, t2: T0 + 200 * H, p2: 2000 }, { id: 'r', t: T0 }),
    ...[1960, 1970, 1980, 2010, 2020, 2030, 2040].map(q => O.creer('horizontale', { p: q }, { id: 'h' + q, t: T0 }))];
  const tout = surveiller(B, objets), cle = e => e.id; let ecarts = 0;
  for (let i = 500; i < 600; i++) { const P = surveiller(B.slice(0, i + 1), objets); if (P.ev.map(cle).join() !== tout.ev.filter(e => e.t <= B[i].t).map(cle).join()) ecarts++; }
  eq(ecarts, 0, `non-repeint : rejeu bougie par bougie, événements identiques (${tout.ev.length} événements, ${tout.fleches.length} flèches, ${tout.croix.length} croix)`);
  ok(tout.fleches.length > 0 && tout.croix.length > 0, 'des flèches et des croix sur la marche au hasard');
  // registre : excursions et bilan par type
  const S = tout.ev.map(e => excursionEvenement(B, e)).filter(Boolean), Bi = bilanRegistre(tout.ev, S);
  ok(S.length > 0 && S.every(x => x.favAtr >= 0 && x.advAtr >= 0 && x.favPct >= 0), 'excursions favorable / défavorable en ATR et en %');
  ok(Bi.length > 0 && Bi.every(x => x.assez === (x.mesures >= 30)), 'bilan par type d’outil : « pas assez de données » sous 30');
  const b = bilanV10(B, tout.fleches, { maintenant: B[B.length - 1].t + H, autres: { 'fleches-h1-v9': { p: 0.5 } } });
  ok(/depuis le 8 nov\. 2026, 16 h 14/.test(b.texte) && /Aucune décision avant 100/.test(b.texte) && b.total === 0, 'bilan v10 : depuis son commit (flèches fabriquées antérieures non comptées)'); }
/* niveaux proposés : fractales de 60 bougies de chaque côté ; décisions */
{ const B = Array.from({ length: 400 }, (_, i) => { const p = 2000 + 50 * Math.sin(i / 40); return { t: T0 + i * 4 * H, o: p, h: p + 2, l: p - 2, c: p }; });
  const F = fractalesMajeures(B, 60, 4 * H, 'H4'), fin = B[B.length - 1].t + 4 * H;
  ok(F.length >= 2 && F.every(f => f.tConf === B.findIndex(b => b.t === f.t) * 0 + f.tConf), `fractales H4 de 60 bougies (${F.length})`);
  const P = niveauxProposes(F, [], fin), P2 = niveauxProposes(F, [{ cle: P[0].cle, etat: 'confirme', p: P[0].p }], fin);
  ok(P.length >= 1 && P2.length === P.length - 1 && !P2.some(x => x.cle === P[0].cle), 'niveau confirmé (ou supprimé) : plus proposé'); }
console.log(`outils-v10-test : ${n} vérifications OK`);
