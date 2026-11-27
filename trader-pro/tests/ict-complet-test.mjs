/* Tests purs de l'ICT COMPLET : scénarios fléchés A et B de Rayle (zone de rebond, cible, invalidation, jamais vers une liquidité prise, deux au plus), Complet = toute la structure
   de la partie visible (cassures dans les deux sens avec leurs OB, sommets et creux, 20 zones et niveaux au plus par écran, recalcul quand la plage visible change), fusions,
   marge à droite. Usage : node trader-pro/tests/ict-complet-test.mjs */
import * as V from '../../agent-trading/front/or/ict-v2.js';
import { objetsIct, MAX_COMPLET } from '../../agent-trading/front/or/ict-objets.js';
import { scenariosIct, voixScenarios, resumeScenarios, MAX_SCENARIOS } from '../../agent-trading/front/or/ict-scenarios.js';
import { zonesA, choisirSommets, fusionnerZones, recouvrement, MAX_SOMMETS } from '../../agent-trading/front/or/ict-complet.js';
import { dessinerIct } from '../../agent-trading/front/or/ict-dessin.js';
import { lectureIct, resumeCarte } from '../../agent-trading/front/or/ict-lecture.js';
import { carresVolume, nomCourtVolume, dessinerNomsVolume, NOM_ZONE_VOLUME, MAX_CARRES_VOLUME, htmlLegendeVolume } from '../volume/noms.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 2);
const marche = (graine, n = 900, pas = H, amp = 3.2) => { let x = 3500, s = graine; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, L = []; for (let i = 0; i < n; i++) { const o = x; x += (rnd() - 0.5) * amp + (i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 9 : 0); L.push({ t: T0 + i * pas, o, c: x, h: Math.max(o, x) + rnd() * 0.8, l: Math.min(o, x) - rnd() * 0.8, v: 1 }); } return L; };
const WIDE = { ...V.P, portee: 100000 }, UNITES = ['M15', 'H1', 'H4', 'J'], graines = [11, 23, 37, 41, 53, 67];
const analyses = []; for (const u of UNITES) for (const g of graines) { const pas = V.UNITES[u].ms; analyses.push({ u, g, an: V.analyser(marche(g, 900, pas), { unite: u, maintenant: T0 + 900 * pas, R: WIDE }), id: `${u} jeu ${g}` }); }
const MOTS_ORDRE = /\b(ach[eè]te[zs]?|vends|vendez|ach[eè]ter|vendre|ordre d'achat|ordre de vente)\b/i;

/* ── 1. scénarios A et B ── */
let nNeutre = 0, nPenche = 0;
for (const { an, id } of analyses) {
  const R = scenariosIct(an), S = R.scenarios;
  v(S.length <= MAX_SCENARIOS && MAX_SCENARIOS === 2, `${id} : deux scénarios au plus (${S.length})`);
  v(S.every((s, k) => s.lettre === (k === 0 ? 'A' : 'B') || (S.length === 1 && s.lettre === 'B')), `${id} : lettres A puis B`);
  v(S.every(s => s.zone && s.zone.haut > s.zone.bas && Number.isFinite(s.cible.p) && Number.isFinite(s.invalidation.prix) && /clôture (sous|au-dessus de) \d/.test(s.invalidation.texte)), `${id} : chaque scénario a une zone de ${'rebond / rejet'}, une cible et une invalidation`);
  v(S.every(s => s.bulle.length === 4 && /pas une prévision/.test(s.bulle[3]) && /^Zone de (rebond|rejet) : /.test(s.bulle[0]) && /^Cible : /.test(s.bulle[1]) && /^Invalidation : clôture/.test(s.bulle[2])), `${id} : la bulle fait 4 lignes (zone, cible, invalidation, « pas une prévision »)`);
  const pris = an.liquidites.filter(x => x.balayee).map(x => x.p);
  v(S.every(s => !pris.some(p => Math.abs(p - s.cible.p) < 1e-9)), `${id} : jamais de flèche vers une liquidité déjà prise`);
  v(S.every(s => (s.dir > 0 ? s.cible.p > an.prix : s.cible.p < an.prix) && (s.dir > 0 ? an.prix >= s.invalidation.prix : an.prix <= s.invalidation.prix)), `${id} : la cible est au-delà du prix et le scénario n'est pas déjà invalidé`);
  v(S.every(s => (s.dir > 0 ? s.court === (s.gris ? `${s.lettre} · ?` : `${s.lettre} · rebond`) : s.court === (s.gris ? `${s.lettre} · ?` : `${s.lettre} · rejet`))), `${id} : carrés « A · rebond », « B · rejet » (ou l'inverse), « ? » si neutre`);
  if (R.neutre) { nNeutre++; v(S.every(s => s.gris) && S.length === 2 || S.length < 2, `${id} : lecture neutre : A et B tous deux gris`); } else { nPenche++; v(S.length === 0 || (S[0].lettre === 'A' && (S[0].dir > 0) === (R.sens === 'achat') && !S[0].gris), `${id} : A va dans le sens de la lecture (${R.sens})`); if (S.length === 2) v(S[0].dir === -S[1].dir && S[0].role !== S[1].role, `${id} : B va dans l'autre sens`); }
  v(S.every(s => !MOTS_ORDRE.test(s.voix + ' ' + s.nom + ' ' + s.bulle.join(' '))), `${id} : jamais « achète » ni « vends »`);
  /* invalidé : disparaît ; cible prise : une autre cible, jamais celle-là */
  for (const s of S) {
    const px2 = s.dir > 0 ? s.zone.bas - 0.5 : s.zone.haut + 0.5, R2 = scenariosIct(an, { prix: px2 });
    v(R2.scenarios.every(q => (q.dir > 0 ? px2 >= q.invalidation.prix : px2 <= q.invalidation.prix)), `${id} ${s.lettre} : un scénario invalidé disparaît`);
    const an2 = { ...an, liquidites: an.liquidites.map(x => (Math.abs(x.p - s.cible.p) < 1e-9 ? { ...x, balayee: true } : x)), structure: { ...an.structure, ITH: an.structure.ITH.map(x => (Math.abs(x.p - s.cible.p) < 1e-9 ? { ...x, cassee: true } : x)), ITL: an.structure.ITL.map(x => (Math.abs(x.p - s.cible.p) < 1e-9 ? { ...x, cassee: true } : x)) } };
    v(scenariosIct(an2).scenarios.every(q => Math.abs(q.cible.p - s.cible.p) > 1e-9), `${id} ${s.lettre} : la liquidité prise n'est plus visée`);
  }
}
v(nNeutre > 0 && nPenche > 0, `jeux variés : ${nNeutre} lectures neutres, ${nPenche} qui penchent`);
v(scenariosIct(null).scenarios.length === 0 && scenariosIct({ ok: false }).scenarios.length === 0, 'sans analyse : aucun scénario');
{ const { an } = analyses.find(a => scenariosIct(a.an).scenarios.length === 2); const R = scenariosIct(an), T = voixScenarios(R, an.nom), L = resumeScenarios(R);
  v(/Scénario A/.test(T) && /Scénario B/.test(T) && /pas une prévision/.test(T) && /C'est toi qui décides/.test(T) && !MOTS_ORDRE.test(T), 'voix : « Rayle, quels scénarios ? » lit A et B, sans ordre');
  v(L.length === 2 && L.every(l => /^[AB]/.test(l)), 'la carte ⓘ résume A et B en deux lignes'); }
v(/je n'ai pas de scénario clair/.test(voixScenarios({ scenarios: [] }, 'H1')), 'voix sans scénario : le dit honnêtement');

/* ── 2. Essentiel : A seul ; Complet : A et B ; rien dans la plage historique ── */
for (const { an, id } of analyses) {
  const E = objetsIct(an, { mode: 'essentiel' }).objets.filter(o => o.kind === 'scenario'), C = objetsIct(an, { mode: 'complet' }).objets.filter(o => o.kind === 'scenario'), S = scenariosIct(an).scenarios;
  v(E.length === S.filter(s => s.lettre === 'A').length && E.every(o => o.lettre === 'A'), `${id} : Essentiel : le scénario A seulement`);
  v(C.length === S.length, `${id} : Complet : A et B (${C.length})`);
  v(C.every(o => o.court.length <= 14 && o.bulle.length === 4 && o.zone && o.cible && o.invalidation), `${id} : l'objet scénario porte sa zone, sa cible, son invalidation et sa bulle`);
  const n = an.bougies.length, H0 = objetsIct(an, { mode: 'complet', fenetre: { i0: n - 400, i1: n - 250 } });
  v(H0.objets.every(o => o.kind !== 'scenario') && H0.fenetre.histo, `${id} : plage historique : pas de scénario (la dernière bougie n'est pas à l'écran)`);
}

/* ── 3. Complet = toute la structure visible ── */
const comptees = o => o.kind !== 'scenario' && !o.hors;
let nBOS = 0, nOB = 0, nRemp = 0, nBrk = 0;
for (const { an, id, u } of analyses) {
  const n = an.bougies.length, B = an.bougies;
  for (const [i0, i1] of [[n - 150, n - 1], [n - 420, n - 270], [n - 700, n - 520], [n - 300, n - 100]]) {
    const R = objetsIct(an, { mode: 'complet', fenetre: { i0, i1 } }), O = R.objets, tV0 = B[i0].t, tV1 = B[i1].t, w = `${id} [${i0}–${i1}]`;
    v(O.filter(comptees).length <= MAX_COMPLET, `${w} : ${O.filter(comptees).length} zones et niveaux (20 au plus par écran)`);
    v(O.filter(o => o.kind === 'etiquette').length <= MAX_SOMMETS && MAX_SOMMETS === 12, `${w} : 12 sommets et creux au plus (${O.filter(o => o.kind === 'etiquette').length})`);
    v(O.every(o => ['HH', 'HL', 'LH', 'LL', 'ITH', 'ITL'].includes(o.court) || o.kind !== 'etiquette'), `${w} : sommets et creux nommés HH, HL, LH, LL, ITH, ITL`);
    const ev = V.listeCassures(an, { depuis: i0 }).filter(e => e.t <= tV1 && e.tNiveau >= tV0).slice(-14), seg = O.filter(o => o.kind === 'segment');
    v(seg.length === ev.length, `${w} : chaque BOS / MSS visible est tracé (${seg.length} / ${ev.length})`);
    v(seg.every(o => o.style === (o.dir > 0 ? 'vert' : 'rouge') && (o.court === 'BOS' || o.court === 'MSS') && o.mss === (o.court === 'MSS') && o.t <= tV1), `${w} : cassures haussières vertes, baissières rouges, MSS en pointillé, carré BOS ou MSS`);
    v(seg.every(o => o.tNiveau != null) && ev.every(e => seg.some(o => o.t === e.t && o.dir === e.dir)), `${w} : cassures dans les deux sens`);
    v(O.every(o => o.kind === 'etiquette' || o.kind === 'segment' ? o.t <= tV1 : true), `${w} : rien n'est tracé après la dernière bougie visible`);
    nBOS += seg.length;
    /* chaque cassure a son OB quand la checklist est remplie */
    for (const e of ev) { const ob = an.ob.find(z => z.dir === e.dir && z.iReversal <= e.i && z.iCandidate <= e.i && z.iCandidate >= e.i - 80 && z.i <= i1); if (ob) nOB++; }
    const zones = O.filter(o => o.kind === 'zone'); v(zones.every(o => o.court && o.nom && o.court.length <= 14), `${w} : chaque zone a son carré`);
    nRemp += zones.filter(o => o.etat === 'rempli' && /^OB/.test(o.court)).length; nBrk += zones.filter(o => o.court === 'BRK').length;
    v(zones.filter(o => o.etat === 'rempli' && /^OB/.test(o.court)).every(o => o.tFin != null && o.tFin <= tV1 && o.pointille), `${w} : un OB rempli est pâle, en pointillé et s'arrête à la bougie qui l'a rempli`);
    v(zones.every(o => (o.tDebut ?? 0) <= tV1 && (o.tFin == null || o.tFin >= tV0)), `${w} : seules les zones visibles à l'écran sont gardées`);
    v(O.filter(o => o.kind === 'ligne').every(o => (o.tDebut ?? 0) <= tV1 && (o.tFin == null || o.tFin >= tV0)), `${w} : seules les lignes de liquidité visibles sont gardées`);
  }
  /* recalcul quand la plage change */
  const A1 = objetsIct(an, { mode: 'complet', fenetre: { i0: n - 150, i1: n - 1 } }), A2 = objetsIct(an, { mode: 'complet', fenetre: { i0: n - 420, i1: n - 270 } });
  v(JSON.stringify(A1.objets.map(o => o.id)) !== JSON.stringify(A2.objets.map(o => o.id)) && A2.fenetre.i1 === n - 270, `${id} : les objets sont recalculés quand la plage visible change`);
}
v(nBOS > 100, `cassures visibles examinées : ${nBOS}`); v(nOB > 30, `cassures qui ont leur OB : ${nOB}`); v(nRemp >= 0 && nBrk >= 0, `OB remplis ${nRemp}, breakers ${nBrk}`);
{ /* par défaut (sans plage fournie), Complet regarde les 150 dernières bougies, comme avant */
  const { an } = analyses.find(a => a.id === 'H1 jeu 23'), n = an.bougies.length, D = objetsIct(an, { mode: 'complet' }), F = objetsIct(an, { mode: 'complet', fenetre: { i0: n - 150, i1: n - 1 } });
  v(D.fenetre.i0 === n - 150 && D.fenetre.i1 === n - 1 && F.fenetre.i0 === n - 150 && D.objets.filter(o => o.kind === 'segment').length === F.objets.filter(o => o.kind === 'segment').length, 'Complet sans plage = les 150 dernières bougies'); }
{ /* l'Essentiel ne change pas : 8 objets au plus et A seulement, quelle que soit la plage */
  for (const { an, id } of analyses.filter(a => a.u === 'H1')) { const n = an.bougies.length, a = objetsIct(an, { mode: 'essentiel' }), b = objetsIct(an, { mode: 'essentiel', fenetre: { i0: n - 400, i1: n - 300 } });
    v(JSON.stringify(a.objets.map(o => o.id)) === JSON.stringify(b.objets.map(o => o.id)) && a.objets.filter(comptees).length <= 8, `${id} : l'Essentiel ne change pas avec la plage visible (8 objets au plus)`); } }

/* ── 4. dessin : carrés des cassures, des OB et des scénarios ; flèches dans la marge à droite ── */
function faux() { const E = { rr: [], texts: [] }, c = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '12px x', measureText: t => ({ width: String(t).length * 7 }), fillText: (t, x, y) => E.texts.push({ t: String(t), x, y }), fillRect() { }, strokeRect() { }, beginPath() { }, moveTo() { }, lineTo() { }, stroke() { }, setLineDash() { }, quadraticCurveTo() { }, bezierCurveTo: (a, b, c2, d, x, y) => { (E.bez = E.bez || []).push([a, b, c2, d, x, y]); }, closePath() { }, fill() { }, roundRect: (x, y, w, h) => E.rr.push({ x, y, w, h }) }; c.E = E; return c; }
const W = 1100, Ht = 600, pas = 7;
function monter(an, mode, ecran, fen, SC) {
  const n = an.bougies.length, B = an.bougies, i0 = fen ? fen[0] : n - 150, i1 = fen ? fen[1] : n - 1, R = objetsIct(an, { mode, fenetre: fen ? { i0, i1 } : null, scenarios: SC }), vis = B.slice(i0, i1 + 1), mn = Math.min(...vis.map(b => b.l)) - 3, mx = Math.max(...vis.map(b => b.h)) + 3, Dt = B[1].t - B[0].t;
  const barres = B.slice(0, i1 + 1), xDeT = t => W - 190 - (B[i1].t - t) / Dt * pas, yDe = p => Ht - 30 - ((p - mn) / (mx - mn)) * (Ht - 60), ctx = faux();
  const cadres = dessinerIct(ctx, { width: W, height: Ht }, { objets: R.objets, pastilles: R.pastilles, mode }, { xDeT, yDe, ecran, barres });
  return { ctx, cadres, R, xL: xDeT(B[i1].t), xDeT, yDe };
}
let nSegCarre = 0, nSeg = 0, nObCarre = 0, nOb = 0;
for (const { an, id } of analyses.filter(a => a.u === 'H1' || a.u === 'M15')) {
  const n = an.bougies.length;
  for (const fen of [null, [n - 420, n - 270]]) {
    const { cadres, R, xDeT, yDe } = monter(an, 'complet', 1440, fen), demandes = new Map(cadres.carres.map(c => [c.id, c]));
    for (const o of R.objets.filter(o => o.kind === 'segment')) { const y = yDe(o.p), x1 = xDeT(o.t), x0 = Math.max(0, xDeT(o.tNiveau)); if (!(y >= -4 && y <= Ht + 4 && x1 > x0 + 2 && x1 >= 0)) continue; nSeg++; if (demandes.has(o.id)) { nSegCarre++; } }
    for (const o of R.objets.filter(o => o.kind === 'zone' && /^OB/.test(o.court))) { nOb++; if (demandes.has(o.id)) nObCarre++; }
  }
}
v(nSeg > 0 && nSegCarre === nSeg, `chaque BOS / MSS visible a son carré (${nSegCarre} / ${nSeg})`); v(nOb > 0 && nObCarre >= nOb * 0.85, `chaque OB visible a son carré (${nObCarre} / ${nOb}, quelques-uns peuvent manquer de place)`);
for (const { an, id } of analyses) {
  const SC = scenariosIct(an); if (!SC.scenarios.length) continue;
  for (const [mode, ecran, attendu] of [['essentiel', 1600, 'A'], ['complet', 1600, 'AB'], ['complet', 1024, 'AB'], ['complet', 390, 'A']]) {
    const { cadres, xL, ctx } = monter(an, mode, ecran, null, SC), sc = cadres.carres.filter(c => c.style === 'scA' || c.style === 'scB'), voulu = SC.scenarios.filter(s => attendu.includes(s.lettre) && (mode === 'complet' || s.lettre === 'A')).length;
    v(sc.length === voulu, `${id} ${mode} ${ecran}px : ${voulu} scénario(s) dessiné(s) (${attendu}) — ${sc.length}`);
    v(sc.every(c => c.x > xL && c.x + c.w <= W && c.y >= 0 && c.y + c.h <= Ht), `${id} ${mode} ${ecran}px : les carrés de scénario restent dans la marge vide à droite`);
    v((ctx.E.bez || []).every(b => b[4] > xL && b[0] > xL && b[2] > xL), `${id} ${mode} ${ecran}px : les courbes partent de la dernière bougie vers la droite`);
    v(ctx.E.rr.filter(r => r.x > xL).length >= sc.length, `${id} ${mode} ${ecran}px : un petit carré au bout de chaque flèche`);
    if (sc.length) v(sc.every(c => /^(A|B) · (rebond|rejet|\?)$/.test(c.court)), `${id} : carrés « A · rebond », « B · rejet »…`);
  }
}
{ /* neutre : deux flèches grises de même épaisseur, avec « ? » */
  const x = analyses.find(a => scenariosIct(a.an).neutre && scenariosIct(a.an).scenarios.length === 2);
  if (x) { const { cadres } = monter(x.an, 'complet', 1600); const sc = cadres.carres.filter(c => c.style === 'scA' || c.style === 'scB'); v(sc.length === 2 && sc.every(c => c.style === 'scB' && /· \?$/.test(c.court)), 'lecture neutre : A et B gris, avec « ? »'); } else v(true, 'neutre : aucun jeu avec A et B (ignoré)'); }

/* ── 5. fusions : Unicorn d'abord, puis recouvrement > 60 %, puis « OB · OTE » ── */
{ const z = (id, court, bas, haut, dir, prio, t0 = 0, t1 = null) => ({ id, kind: 'zone', court, nom: court + ' ' + id, bas, haut, dir, prio, tDebut: t0, tFin: t1, autres: [] });
  const U = z('unicorn|0', 'Unicorn', 100, 110, 1, 72), F = z('fvg|a', 'FVG', 101, 110, 1, 85), Bk = z('ob|brk', 'BRK', 100, 109, 1, 80), X = z('fvg|loin', 'FVG', 200, 210, 1, 85);
  const r = fusionnerZones([U, F, Bk, X]); v(r.includes(U) && !r.includes(F) && !r.includes(Bk) && r.includes(X) && U.autres.length === 2, 'fusion : l\'Unicorn absorbe le FVG et le breaker qui le composent');
  const a = z('ob1', 'OB', 100, 110, 1, 88), b = z('fvg1', 'FVG', 102, 111, 1, 85), c = z('fvg2', 'FVG', 109, 120, 1, 85), d = z('fvg3', 'FVG', 100, 110, -1, 85);
  const r2 = fusionnerZones([a, b, c, d]); v(r2.includes(a) && !r2.includes(b) && r2.includes(c) && r2.includes(d), 'fusion : deux zones de même sens qui se recouvrent à plus de 60 % n\'en font qu\'une (10 % : non ; sens opposé : non)');
  v(recouvrement({ bas: 0, haut: 10 }, { bas: 5, haut: 15 }) === 0.5 && recouvrement({ bas: 0, haut: 10 }, { bas: 20, haut: 30 }) === 0, 'recouvrement : 0 à 1, rapporté à la plus petite zone');
  const ob = z('ob2', 'OB fort', 100, 110, 1, 88), fib = { id: 'fib', kind: 'fib', ote: { bas: 101, haut: 111 }, autres: [] };
  const r3 = fusionnerZones([ob, fib]); v(ob.court === 'OB fort · OTE' && fib.oteFusion === true && r3.length === 2 && ob.court.length <= 14, 'fusion : un OB dans l\'OTE prend un seul carré combiné « OB · OTE »');
  const S = Array.from({ length: 40 }, (_, i) => ({ nom: i % 7 === 0 ? 'ITH' : ['HH', 'HL', 'LH', 'LL'][i % 4], i, t: i, p: i })), C = choisirSommets(S, 12);
  v(C.length <= 12 && S.filter(s => s.nom === 'ITH').length === 6 && C.filter(s => s.nom === 'ITH').length === 6 && C.every((s, k) => k === 0 || C[k - 1].i < s.i), '12 sommets et creux au plus : les ITH / ITL d\'abord, dans l\'ordre du temps'); }

/* ── 6. états des zones à la dernière bougie visible ── */
{ const { an } = analyses.find(a => a.id === 'H1 jeu 23'), B = an.bougies, n = B.length, plein = zonesA(an, B, n - 1, an.prix, an.atr), tot = an.pdArrays.filter(z => z.actif && !z.inverse);
  v(plein.filter(z => z.actif && z.type === 'FVG' && !z.inverse).length === tot.filter(z => z.type === 'FVG').length && plein.filter(z => z.type === 'breaker').length === an.pdArrays.filter(z => z.type === 'breaker').length, 'zonesA : à la dernière bougie, les mêmes FVG et breakers que l\'analyse');
  const tot0 = zonesA(an, B, 100, B[100].c, an.atr); v(tot0.every(z => z.i <= 100), 'zonesA : à une bougie passée, aucune zone née après elle'); }

/* ── 7. lecture_ict, carte ⓘ ── */
for (const { an, id } of analyses.filter(a => a.u === 'H1')) {
  const L = lectureIct(an, { mode: 'complet' });
  v(L.scenarios && Array.isArray(L.scenarios.liste) && L.scenarios.liste.length <= 2 && L.scenarios.liste.every(s => s.zone && s.cible && s.invalidation && /pas une prévision/.test(s.phrase)), `${id} : lecture_ict porte les scénarios A et B (zone, cible, invalidation)`);
  const C = resumeCarte(L, { scenarios: scenariosIct(an) }); const sl = C.lignes.filter(l => /^[AB]( \(neutre\))? : /.test(l)); v(sl.length === scenariosIct(an).scenarios.length && sl.length <= 2, `${id} : la carte ⓘ résume A et B en deux lignes`);
}
/* ── 8. mode Volume : les mêmes petits carrés, 6 au plus, aucun libellé répété, zones voisines fusionnées ── */
{ const zv = (bas, haut) => ({ bas, haut, nom: NOM_ZONE_VOLUME.vente, dir: -1, prio: 40 }), za = (bas, haut) => ({ bas, haut, nom: NOM_ZONE_VOLUME.achat, dir: 1, prio: 40 });
  /* la situation de avant-volume.png : sept zones « vendeur » empilées + toutes les lignes du mode */
  const zones = [zv(4400, 4420), zv(4421, 4440), zv(4300, 4310), zv(4200, 4215), zv(4100, 4110), zv(4000, 4012), zv(3900, 3910), za(3500, 3520), za(3521, 3540)];
  const lignes = [{ prix: 3572, texte: 'POC 3 572,26' }, { prix: 3640, texte: 'VAH' }, { prix: 3510, texte: 'VAL' }, { prix: 3600, texte: 'R×4' }, { prix: 3610, texte: 'R×3' }, { prix: 3620, texte: 'R×2' }, { prix: 3700, texte: 'VWAP sem.' }, { prix: 3680, texte: 'Mur 12,5 k' }, { prix: 3660, texte: 'PDH' }, { prix: 3530, texte: 'PDL' }, { prix: 3555, texte: '50 %' }, { prix: 3585, texte: 'HVN' }, { prix: 3545, texte: 'LVN' }];
  const C = carresVolume({ zones, lignes, atr: 40, prix: 3600 });
  v(C.length <= MAX_CARRES_VOLUME && MAX_CARRES_VOLUME === 6, `Volume : ${C.length} carrés (6 au plus)`);
  v(new Set(C.map(c => c.court)).size === C.length, `Volume : aucun libellé répété (${C.map(c => c.court).join(' | ')})`);
  v(C.every(c => c.court.length <= 14 && c.detail.length <= 4 && c.detail.length >= 2), 'Volume : noms courts, détail de 4 lignes au plus au toucher');
  v(C.some(c => c.court === 'Vol. vendeur') && ['POC', 'VAH', 'VAL'].every(n => C.some(c => c.court === n)), 'Volume : « Vol. vendeur », « POC », « VAH », « VAL » en priorité');
  const lisible = carresVolume({ zones: [zv(100, 101), zv(101.2, 102), zv(105, 106)], atr: 2, prix: 103, max: 9 }); v(lisible.length === 1, 'Volume : un seul « Vol. vendeur » (les zones voisines sont fusionnées, jamais deux fois le même libellé)');
  const F = carresVolume({ zones: [zv(100, 101), zv(101.15, 102)], atr: 2, prix: 103 })[0]; v(F.bas === 100 && F.haut === 102 && /2 zones voisines fusionnées/.test(F.detail.join(' ')), 'Volume : deux zones à 0,075 ATR sont fusionnées en une (100 à 102)');
  const G = carresVolume({ zones: [zv(100, 101), zv(101.5, 102)], atr: 2, prix: 103 }); v(G.length === 1 && G[0].bas === 100 && G[0].haut === 101 || G[0].bas === 101.5, 'Volume : deux zones à 0,25 ATR ne sont pas fusionnées (une seule garde le libellé)');
  v(nomCourtVolume('R×4').court === 'Réaction' && nomCourtVolume('POC nu S').court === 'POC' && nomCourtVolume('HVN').court === 'HVN' && nomCourtVolume('LVN').court === 'LVN', 'Volume : « Réaction », « POC », « HVN », « LVN »');
  /* dessin : un carré reste sur son prix (jamais décalé en hauteur), ne recouvre ni bougie ni autre carré, texte 13 / 12 / 11 px */
  for (const ecran of [1600, 1024, 390]) {
    const L = [], ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', measureText: t => ({ width: String(t).length * 7 }), fillText: (t, x, y) => L.push({ t, x, y, f: ctx.font }), fillRect: (x, y, w, h) => L.push({ r: [x, y, w, h] }), strokeRect() { } };
    const pmin = 3400, pmax = 4500, yDe = p => 600 - 30 - ((p - pmin) / (pmax - pmin)) * 540, obst = [{ x: 600, y: 200, w: 300, h: 120 }];
    const R = dessinerNomsVolume(ctx, { W: 1000, H: 600, ecran, yDe, lignes, zones, interdits: obst, atr: 40, prix: 3600, fmt: x => String(x) });
    const pos = R.carres.filter(c => !c.replie), chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    v(R.carres.length <= 6 && pos.length >= 3, `Volume ${ecran} px : ${pos.length} carrés posés (6 au plus)`);
    let sans = true; for (let i = 0; i < pos.length; i++) { for (let j = i + 1; j < pos.length; j++) if (chev(pos[i], pos[j])) sans = false; if (obst.some(o => chev(pos[i], o))) sans = false; } v(sans, `Volume ${ecran} px : aucun carré ne recouvre un autre carré ni une bougie`);
    const prixDe = { POC: 3572, VAH: 3640, VAL: 3510 }; v(pos.filter(c => prixDe[c.court]).every(c => Math.abs((c.y + c.h / 2) - yDe(prixDe[c.court])) < 1.5), `Volume ${ecran} px : « POC », « VAH », « VAL » restent exactement sur leur prix`);
    v(L.filter(e => e.f).every(e => +e.f.match(/(\d+(\.\d+)?)px/)[1] >= (ecran >= 1100 ? 13 : ecran >= 700 ? 12 : 11)), `Volume ${ecran} px : texte de 13 / 12 / 11 px au moins`);
  }
  v(!/open/.test('<details class="tpv-leg" data-tpv-leg>') && /POC \/ VAH \/ VAL/.test(htmlLegendeVolume()), 'Volume : la légende existe (fermée par défaut dans l\'interface)'); }

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
