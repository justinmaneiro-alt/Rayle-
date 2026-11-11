/* Tests de scenarios-v1 : régime de volatilité, grille de distances, cône, probabilité de premier passage (toujours avec le hasard b / (a + b), n et IC), génération A / B, horizons,
   contexte non validé séparé, marquage forward (réalisé / invalidé / expiré), fiabilité (Brier), aucun mot d'ordre, sceau SHA-256, statistiques publiées. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as S from '../front/or/scenarios-v1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, T0 = Date.UTC(2026, 1, 2), G = S.P.grille;
// statistiques synthétiques : cône en racine du temps ; premier passage = hasard, sauf une cellule volontairement au-dessus
function faux({ surcote = 0, nT = 2000 } = {}) {
  const cone = {}; for (const r of ['bas', 'moyen', 'haut']) { const k = r === 'bas' ? 1.3 : r === 'moyen' ? 1 : 0.8; cone[r] = { p50h: [], p50b: [], p80h: [], p80b: [] }; for (let h = 1; h <= 120; h++) { cone[r].p50h.push(0.5 * k * Math.sqrt(h) * 1.1); cone[r].p50b.push(0.5 * k * Math.sqrt(h)); cone[r].p80h.push(1.0 * k * Math.sqrt(h) * 1.1); cone[r].p80b.push(1.0 * k * Math.sqrt(h)); } }
  const ppp = { long: {}, recent: {} }; for (const fen of ['long', 'recent']) for (const N of [24, 72, 120]) { ppp[fen][N] = { tous: { tous: {} }, haussier: { '1': {}, '-1': {} }, baissier: { '1': {}, '-1': {} }, mixte: { '1': {}, '-1': {} } };
    for (const a of G) for (const b of G) { const c = { n: nT + 100, nT: fen === 'recent' ? Math.round(nT / 8) : nT, k: Math.round((fen === 'recent' ? nT / 8 : nT) * (b / (a + b) + surcote)), mediane: 5 }; ppp[fen][N].tous.tous[S.cleCellule(a, b)] = c; ppp[fen][N].haussier['1'][S.cleCellule(a, b)] = c; ppp[fen][N].baissier['-1'][S.cleCellule(a, b)] = c; ppp[fen][N].mixte['1'][S.cleCellule(a, b)] = c; ppp[fen][N].mixte['-1'][S.cleCellule(a, b)] = c; ppp[fen][N].baissier['1'][S.cleCellule(a, b)] = c; ppp[fen][N].haussier['-1'][S.cleCellule(a, b)] = c; } }
  return { cone, ppp };
}
const st = faux(), stHaut = faux({ surcote: 0.08 });
// régime
const A = Array.from({ length: 600 }, (_, i) => 5 + (i % 100) / 10); v(S.regimeVol(A, 599) !== null && S.regimeVol(A, 50) === null, 'régime : null sans 100 valeurs');
const Ab = A.map((x, i) => (i === 599 ? 99 : x)); v(S.regimeVol(Ab, 599) === 'haut', 'régime haut quand l\'ATR est dans le dernier tercile'); v(S.regimeVol(A.map((x, i) => (i === 599 ? 0.1 : x)), 599) === 'bas', 'régime bas');
v(S.etatTendance(1, 1) === 'haussier' && S.etatTendance(-1, -1) === 'baissier' && S.etatTendance(1, -1) === 'mixte' && S.etatTendance(0, 1) === 'mixte', 'état de tendance : H1 et H4');
// grille
v(S.classeDistance(1.2) === 1 && S.classeDistance(1.3) === 1.5 && S.classeDistance(0.2) === null && S.classeDistance(5) === null, 'grille : distance à la classe la plus proche, null hors table');
// cône
const cn = S.cone(st, 'moyen', 4000, 10, T0, 24); v(cn.length === 24 && cn[0].t === T0 + H && cn[23].t === T0 + 24 * H, 'cône : une ligne par bougie future jusqu\'à l\'horizon'); v(cn.every((q, i) => q.p80h >= q.p50h && q.p50h > 4000 && q.p80b <= q.p50b && q.p50b < 4000 && (i === 0 || q.p80h >= cn[i - 1].p80h)), 'cône : p80 enveloppe p50, croissant avec le temps');
v(S.cone(st, 'moyen', 4000, 10, T0, 120).length === 120, 'cône sur 1 semaine : 120 bougies'); v(S.dureeMediane(st, 'moyen', 2.5, 1, 120) >= 20 && S.dureeMediane(st, 'moyen', 50, 1, 24) === 24, 'durée médiane : bougies pour atteindre la distance (plafonnée à l\'horizon)');
// probabilité
const p0 = S.probabilite(st, { dir: 1, a: 1, b: 1.5, horizon: 24, etat: 'haussier', sma: 1 }); v(Math.abs(p0.hasard - 0.6) < 1e-9 && p0.n === 2000 && p0.verdict === 'écart non net' && Math.abs(p0.taux - 0.6) < 0.001, 'probabilité = hasard : « écart non net » (' + p0.verdict + ')');
const p1 = S.probabilite(stHaut, { dir: 1, a: 1, b: 1.5, horizon: 24, etat: 'haussier', sma: 1 }); v(p1.verdict === 'au-dessus du hasard' && p1.taux > p1.hasard && p1.ic[0] > p1.hasard, 'probabilité nettement supérieure : « au-dessus du hasard » seulement quand l\'IC exclut le hasard');
const p2 = S.probabilite(st, { dir: -1, a: 1.5, b: 1, horizon: 24, etat: 'baissier', sma: -1 }); v(Math.abs(p2.hasard - 1 / 2.5) < 1e-9 && Math.abs(p2.taux - 0.4) < 0.002, 'sens baissier : cible à 1,5 ATR, invalidation à 1 ATR : hasard 40 %, mesuré 40 % (' + p2.taux.toFixed(3) + ')');
const pf = S.probabilite(faux({ nT: 20 }), { dir: 1, a: 1, b: 1, horizon: 24, etat: 'haussier', sma: 1 }); v(pf.verdict === 'pas assez de données' && pf.taux === null && pf.hasard === 0.5, 'n < 30 : « pas assez de données », hasard quand même affiché');
v(S.probabilite(st, { dir: 1, a: 9, b: 1, horizon: 24, etat: 'haussier', sma: 1 }).mesure === false, 'distance hors table : pas de mesure inventée'); v(S.probabilite(null, { dir: 1, a: 1, b: 1, horizon: 24, etat: 'mixte', sma: 1 }).verdict === 'pas assez de données', 'sans statistiques : pas assez de données');
// génération
const B = Array.from({ length: 300 }, (_, i) => ({ t: T0 - (299 - i) * H, o: 4000, h: 4004, l: 3996, c: 4000 })), prix = 4000, atr = 10;
const niveaux = [{ p: 4018, nom: 'Résistance' }, { p: 4040, nom: 'Sommet H4' }, { p: 4075, nom: 'POC' }, { p: 3985, nom: 'Bas de la veille' }, { p: 3960, nom: 'Creux H4' }, { p: 3930, nom: 'Nœud de volume' }];
const ligne = { dir: -1, p: 3975, texte: 'Retournement baissier si clôture H1 sous 3 975' };
const ctx = { B, atr, prix, t1: 1, t4: 1, positionMa: 1, niveaux, ligne, stats: st, horizon: '1j', regime: 'moyen', tDerniere: B[299].t };
const sc = S.construire(ctx); const [a, b] = sc.actifs;
v(sc.actifs.length === 2 && a.id === 'A' && b.id === 'B' && a.dir === 1 && b.dir === -1 && sc.bougies === 24 && sc.rappel === 'Scénarios, pas prévisions.', 'deux scénarios : A continuation (haussier) et B opposé');
v(a.points[0].t === B[299].t && a.points[0].p === prix && a.points.every((q, i) => i === 0 || q.t >= a.points[i - 1].t) && a.points[a.points.length - 1].t <= B[299].t + 24 * H, 'trajet A : part de la dernière bougie, temps croissants, dans l\'horizon');
v(a.cible.p === 4040 && a.points.some(q => q.p === 4018) && a.invalidation.p === 3975 && /ligne de retournement/.test(a.invalidation.nom), 'A : points de passage par les niveaux (4 018 puis 4 040), invalidation = ligne de retournement');
v(b.points.some(q => q.p === 4018) && b.cible.p === 3985 && b.invalidation.p === 4020.5, 'B : rejet de la zone 4 018 puis retour vers 3 985, invalidation au-delà de la zone (' + b.invalidation.p + ')');
v(/^Scénario A · \d+ % \(hasard \d+ %, n = \d+\)$/.test(a.etiquette) && /^Scénario B · \d+ % \(hasard \d+ %, n = \d+\)$/.test(b.etiquette), 'étiquette « Scénario A · 52 % (hasard 47 %, n = 38) » (' + a.etiquette + ')');
v(/condition : clôture H1 au-dessus de 4 018/.test(a.condition) && /invalidation : clôture H1 sous 3 975/.test(a.condition), 'condition de déclenchement et invalidation en clôture H1');
v(a.detail.some(d => /durée typique mesurée.*5 bougies/.test(d)) && a.detail.some(d => /contre \d+ % pour le hasard b \/ \(a \+ b\)/.test(d)) && a.detail.some(d => /Scénarios, pas prévisions|scénarios, pas prévisions/.test(d)), 'détail : durée typique mesurée, hasard à côté, rappel « scénarios, pas prévisions »');
// horizons
for (const [h, N] of [['1j', 24], ['3j', 72], ['1sem', 120]]) { const x = S.construire({ ...ctx, horizon: h }); v(x.bougies === N && x.cone.length === N && x.actifs.every(q => q.points[q.points.length - 1].t <= B[299].t + N * H), `horizon ${h} = ${N} bougies`); }
// contexte non validé : affiché à part, jamais intégré à la probabilité
const x1 = S.construire({ ...ctx, contexte: ['carnet : pression vendeuse', 'delta −420 sur 5 min'] }), x2 = S.construire({ ...ctx, contexte: [] }); v(x1.contexte.length === 2 && x1.actifs[0].proba.taux === x2.actifs[0].proba.taux && x1.actifs[1].etiquette === x2.actifs[1].etiquette, 'contexte non validé : à part, la probabilité est identique avec ou sans');
v(JSON.stringify(S.construire(ctx)) === JSON.stringify(S.construire(ctx)), 'déterministe : même contexte, même tracé (aucun repaint entre deux clôtures)');
// sans niveau : projection
const xp = S.construire({ ...ctx, niveaux: [], ligne: null }); v(xp.actifs[0].cible.p === 4015 && /projection/.test(xp.actifs[0].cible.nom) && xp.actifs[0].detail.some(d => /projection/.test(d)) && xp.actifs[0].invalidation.indicatif, 'sans niveau connu : projection de 1,5 ATR dite comme telle, stop indicatif');
// tendance baissière : A descend
const xb = S.construire({ ...ctx, t1: -1, t4: -1, positionMa: -1, ligne: { dir: 1, p: 4025, texte: 'Retournement haussier si clôture H1 au-dessus de 4 025' } }); v(xb.actifs[0].dir === -1 && xb.actifs[0].cible.p === 3960 && xb.actifs[0].invalidation.p === 4025, 'tendance baissière : A descend, invalidation = ligne de retournement haussière');
// sans statistiques
const xs = S.construire({ ...ctx, stats: null }); v(xs.cone === null && /pas assez de données \(hasard \d+ %\)/.test(xs.actifs[0].etiquette), 'sans statistiques : « pas assez de données », jamais un pourcentage inventé');
// mots d'ordre
v(!/(achète|achetez|vends|vendez|entre en position)/i.test(JSON.stringify([sc, x1, xp, xb])), 'aucun mot d\'ordre');
// forward : marquage
const Bf = Array.from({ length: 200 }, (_, i) => ({ t: T0 + i * H, o: 4000, h: 4004, l: 3996, c: 4000 })), pose = S.enregistrement(sc, sc.actifs[0], T0 + 2 * H);
v(pose.kind === 'pose' && pose.id.endsWith('|A') && pose.cible === 4040 && pose.invalidation === 3975 && pose.bougies === 24, 'enregistrement : id, cible, invalidation, probabilité, hasard, n');
v(S.resoudre(pose, Bf.slice(0, 10)) === null, 'avant l\'échéance sans touche : pas encore résolu'); v(S.resoudre(pose, Bf).statut === 'expire', 'échéance sans touche : expiré');
const Br = Bf.map(b => ({ ...b })); Br[6].h = 4041; v(S.resoudre(pose, Br).statut === 'realise', 'cible touchée : réalisé'); const Bi = Bf.map(b => ({ ...b })); Bi[5].l = 3974; Bi[6].h = 4041; v(S.resoudre(pose, Bi).statut === 'invalide', 'invalidation touchée d\'abord : invalidé'); const Bm = Bf.map(b => ({ ...b })); Bm[6].h = 4041; Bm[6].l = 3974; v(S.resoudre(pose, Bm).statut === 'invalide', 'les deux dans la même bougie : invalidé (prudent)');
// fiabilité
const reg = []; for (let k = 0; k < 40; k++) { const id = '1j|' + k + '|A'; reg.push({ kind: 'pose', id, horizon: '1j', proba: 0.6 }, { kind: 'resultat', id, statut: k < 24 ? 'realise' : 'invalide' }); }
const fi = S.fiabilite(reg); v(fi.horizons['1j'].assez && Math.abs(fi.horizons['1j'].brier - (0.6 * 0.16 + 0.4 * 0.36)) < 1e-9 && fi.horizons['1j'].courbe.length === 1 && Math.abs(fi.horizons['1j'].courbe[0].observe - 0.6) < 1e-9, 'fiabilité : score de Brier et courbe de calibration (prévu 60 %, observé 60 %)');
v(!S.fiabilite(reg.slice(0, 6)).horizons['1j'].assez && /pas assez de données/.test(S.fiabilite(reg.slice(0, 6)).horizons['1j'].phrase) && /pas assez de données/.test(S.fiabilite([]).horizons['3j'].phrase), 'fiabilité : n < 30 = message honnête');
// sceau et statistiques publiées
{ const f = new URL('../front/or/scenarios-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/scenarios-v1.sceau.json', import.meta.url), 'utf8')), sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === S.VERSION && s.sha256 === sha, 'sceau SHA-256 de scenarios-v1.js');
  const j = JSON.parse(fs.readFileSync(new URL('../front/or/scenarios-stats.json', import.meta.url), 'utf8')); v(j.sha256 === s.sha256, 'scenarios-stats.json calculé avec la règle scellée actuelle'); v(['bas', 'moyen', 'haut'].every(r => j.cone[r].p50h.length === 120 && j.cone[r].p80h[119] > j.cone[r].p50h[119]) && j.cone.haut.p50h[23] < j.cone.bas.p50h[23], 'cône publié : 120 bougies par régime, p80 > p50 ; en ATR le régime haut est moins étendu que le bas (normalisation)');
  const c = j.ppp.long[24].tous.tous['1|1']; v(c.nT > 1000 && Math.abs(c.k / c.nT - 0.5) < 0.05, 'premier passage publié : à distances égales, ≈ 50 % (' + (c.k / c.nT).toFixed(3) + ', n = ' + c.nT + ')'); }
console.log(`scenarios : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
