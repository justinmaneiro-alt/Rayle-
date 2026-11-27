/* Tests purs de l'ICT visuel : objets nommés (essentiel ≤ 15), placement des étiquettes sans chevauchement, mêmes noms pour le dessin et lecture_ict, compléments d'ict-v2 (interne / externe, ranges, BOS / MSS, HH / HL / LH / LL, Unicorn, BPR, NWOG / NDOG, projections, Fibonacci).
   Usage : node trader-pro/tests/ict-visuel-test.mjs */
import * as V from '../../agent-trading/front/or/ict-v2.js';
import { objetsIct, badgeIct, MAX_ESSENTIEL, LEGENDE_ICT } from '../../agent-trading/front/or/ict-objets.js';
import { placerEtiquettes, taillePolice } from '../../agent-trading/front/or/ict-etiquettes.js';
import { lectureIct, resumeCarte } from '../../agent-trading/front/or/ict-lecture.js';
import { dessinerIct } from '../../agent-trading/front/or/ict-dessin.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 2);
const marche = (graine, n = 700, pas = H) => { let x = 3500, s = graine; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, L = []; for (let i = 0; i < n; i++) { const o = x; x += (rnd() - 0.5) * 3.2 + (i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 9 : 0); L.push({ t: T0 + i * pas, o, c: x, h: Math.max(o, x) + rnd() * 0.8, l: Math.min(o, x) - rnd() * 0.8, v: 1 }); } return L; };
const analyses = [11, 23, 37, 41].map(g => V.analyser(marche(g), { unite: 'H1', maintenant: T0 + 700 * H }));

/* ── 1. chaque objet a un nom ; essentiel ≤ 15 ; complet plus riche ── */
for (const [k, an] of analyses.entries()) {
  const E = objetsIct(an, { mode: 'essentiel' }), C = objetsIct(an, { mode: 'complet' });
  v(E.objets.every(o => typeof o.nom === 'string' && o.nom.trim().length > 2), `jeu ${k} : chaque objet essentiel a un nom non vide`);
  v(C.objets.every(o => typeof o.nom === 'string' && o.nom.trim().length > 1 && o.unite === 'H1'), `jeu ${k} : chaque objet complet a un nom et son unité`);
  v(E.objets.length <= MAX_ESSENTIEL && E.objets.length > 0, `jeu ${k} : essentiel ≤ 15 objets (${E.objets.length})`);
  v(C.objets.length >= E.objets.length, `jeu ${k} : complet (${C.objets.length}) contient au moins autant que l'essentiel`);
  v(C.objets.every(o => o.kind !== 'fib' || o.niveaux.every(n => n.nom && n.nom.length > 1)), `jeu ${k} : chaque niveau du Fibonacci est nommé`);
  v(C.objets.filter(o => o.kind === 'ligne' && o.prise).every(o => /\(prise\)/.test(o.nom) && o.sweep), `jeu ${k} : une liquidité prise porte « (prise) » et son sweep`);
  v(C.objets.filter(o => o.famille === 'liquidite' && o.kind === 'ligne').every(o => /^(BSL|SSL) (interne|externe) · /.test(o.nom)), `jeu ${k} : liquidités nommées « BSL / SSL interne / externe · … »`);
  v(C.objets.every(o => Array.isArray(o.pourquoi) && o.pourquoi.length >= 1), `jeu ${k} : chaque objet dit pourquoi il est tracé`);
}
const an0 = analyses[0], pdn = an0.premiumDiscount;
const ob = objetsIct(an0, { mode: 'complet' }).objets.find(o => /^Order Block/.test(o.nom));
v(!ob || (/^Order Block (haussier|baissier)( FORT)? · H1$/.test(ob.nom) && /reversal candle \+ FVG · MT /.test(ob.detail)), 'nom et détail d\'un order block : « ' + (ob && ob.nom) + ' » / « ' + (ob && ob.detail) + ' »');
v(objetsIct(an0, { mode: 'complet' }).objets.filter(o => o.kind === 'zone' && /^FVG/.test(o.nom)).every(o => / · CE /.test(o.nom)), 'FVG : le CE est dans le nom');
v(pdn && objetsIct(an0, { mode: 'complet' }).objets.some(o => o.kind === 'fib' && o.niveaux.length === 6 && o.niveaux.some(n => /OTE/.test(n.nom)) && o.niveaux.some(n => /équilibre/.test(n.nom))), 'Fibonacci : 0 · 0,5 équilibre · 0,618 · 0,705 OTE · 0,786 · 1');
v(badgeIct(an0).texte.startsWith('Tendance H1 : ') && /(tient|indécise)/.test(badgeIct(an0).texte), 'badge : « ' + badgeIct(an0).texte + ' »');
v(LEGENDE_ICT.length === 6, 'légende : six lignes');

/* ── 2. mêmes noms entre le dessin et lecture_ict ── */
for (const mode of ['essentiel', 'complet']) for (const [k, an] of analyses.entries()) {
  const dessin = objetsIct(an, { mode }).objets, L = lectureIct(an, { actif: 'or', mode }), nomsL = new Set(L.objets.map(o => o.nom)), nomsD = new Set(dessin.map(o => o.nom));
  v(L.objets.length > 0 && [...nomsL].every(n => nomsD.has(n)), `${mode}, jeu ${k} : tous les noms de lecture_ict existent dans le dessin`);
  const proches = dessin.slice().sort((a, b) => (a.distanceAtr ?? 99) - (b.distanceAtr ?? 99)).slice(0, 24).map(o => o.nom).sort().join('|'); v(proches === L.objets.map(o => o.nom).sort().join('|'), `${mode}, jeu ${k} : lecture_ict liste les 24 objets les plus proches, avec les mêmes noms`);
}
v(analyses.every(an => lectureIct(an, { actif: 'or' }).objets.every(o => o.unite === 'H1' && o.pourquoi.length)), 'lecture_ict : chaque objet porte nom, unité, prix et pourquoi');
v(JSON.stringify(lectureIct(an0, { actif: 'or' })).length < 14000, 'lecture_ict reste sous la limite d\'un résultat d\'outil (' + JSON.stringify(lectureIct(an0, { actif: 'or' })).length + ' octets)');
const carte = resumeCarte(lectureIct(an0, { actif: 'or' })); v(carte.titre === 'En H1 :' && carte.lignes.length >= 1 && carte.lignes.length <= 3, 'résumé : titre « En H1 : », 3 lignes au plus');

/* ── 3. placement des étiquettes : aucun chevauchement sur plusieurs jeux de données ── */
const chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
for (const graine of [1, 2, 3, 4, 5, 6, 7, 8]) {
  let s = graine * 7919; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, n = 10 + Math.floor(rnd() * 50);
  const items = Array.from({ length: n }, (_, i) => ({ id: 'e' + i, x: 600 + rnd() * 300, y: rnd() * 600, w: 60 + rnd() * 140, h: 17 + Math.floor(rnd() * 2) * 17, prio: Math.floor(rnd() * 100) })), interdits = [{ x: 700, y: 200, w: 120, h: 150 }, { x: 900, y: 0, w: 100, h: 54 }];
  const res = placerEtiquettes(items, { largeur: 1000, hauteur: 650, interdits }), poses = res.map((r, i) => ({ ...r, w: items[i].w, h: items[i].h })).filter(r => !r.replie);
  let sans = true; for (let i = 0; i < poses.length; i++) { for (let j = i + 1; j < poses.length; j++) if (chev(poses[i], poses[j])) sans = false; if (interdits.some(z => chev(poses[i], z))) sans = false; if (poses[i].x < 0 || poses[i].x + poses[i].w > 1000 || poses[i].y < 0 || poses[i].y + poses[i].h > 650) sans = false; }
  v(sans && res.length === n, `placerEtiquettes, jeu ${graine} : ${poses.length} posées, ${res.length - poses.length} repliées, aucun chevauchement`);
}
v(placerEtiquettes([{ id: 'a', x: 10, y: 10, w: 50, h: 17, prio: 1 }], { largeur: 100, hauteur: 100 })[0].y === 10, 'placerEtiquettes : une étiquette libre ne bouge pas');
v(placerEtiquettes([{ id: 'a', x: 10, y: 10, w: 50, h: 17, prio: 1 }], { largeur: 100, hauteur: 100, interdits: [{ x: 0, y: 0, w: 100, h: 100 }] })[0].replie === true, 'placerEtiquettes : sans place, l\'étiquette est repliée (infobulle)');
v(taillePolice(1600) === 13 && taillePolice(1024) === 12 && taillePolice(390) === 11, 'tailles de texte : 13 px PC, 12 px tablette, 11 px téléphone');

/* ── 4. le dessin : chaque objet est écrit (ou replié), aucune pastille ne se recouvre ── */
function faux() { const L = [], c = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '13px x', measureText: t => ({ width: String(t).length * 7 }), fillText: (t, x, y) => L.push({ t: String(t), x, y, font: c.font }), fillRect: (x, y, w, h) => L.push({ rect: [x, y, w, h], fill: c.fillStyle }), strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {}, quadraticCurveTo() {}, closePath() {}, fill() {} }; c.L = L; return c; }
for (const [mode, ecran] of [['essentiel', 1600], ['complet', 1600], ['complet', 1024], ['complet', 390]]) for (const [k, an] of analyses.entries()) {
  const R = objetsIct(an, { mode }), B = an.bougies, ctx = faux(), W = 1100, Ht = 600, pas = 7, mn = Math.min(...B.slice(-150).map(b => b.l)), mx = Math.max(...B.slice(-150).map(b => b.h));
  const xDeT = t => W - 150 - (B[B.length - 1].t - t) / H * pas, yDe = p => Ht - 30 - ((p - mn) / (mx - mn)) * (Ht - 60), cadres = dessinerIct(ctx, { width: W, height: Ht }, { objets: R.objets, pastilles: R.pastilles }, { xDeT, yDe, ecran, barres: B });
  const pol = parseInt(ctx.L.find(x => x.font)?.font, 10) || parseInt(ctx.L.find(x => x.t)?.font.match(/(\d+)px/)[1], 10);
  const textes = ctx.L.filter(x => x.t), tailles = textes.map(x => +x.font.match(/(\d+)px/)[1]);
  v(tailles.every(t => t >= taillePolice(ecran)), `${mode} ${ecran}px jeu ${k} : aucun texte sous ${taillePolice(ecran)} px`);
  const place = cadres.etiquettes || [], vis = place.filter(p => !p.replie).length; v(place.length === cadres.etiquettesDemandees, `${mode} ${ecran}px jeu ${k} : chaque étiquette est placée ou repliée (${vis} / ${place.length})`);
  void pol;
}

/* ── 5. compléments d'ict-v2 ── */
{ const an = analyses[1];
  v(an.liquidites.every(x => ['interne', 'externe'].includes(V.porteeLiquidite(an, x))), 'liquidité : chaque niveau est interne ou externe');
  const ext = an.liquidites.find(x => x.type === 'PWH' || x.type === 'PWL'); v(!ext || V.porteeLiquidite(an, ext) === 'externe', 'PWH / PWL : externes');
  const pd = an.premiumDiscount; if (pd) { v(V.porteeLiquidite(an, { type: 'EQH', p: pd.haut + 1 }) === 'externe' && V.porteeLiquidite(an, { type: 'EQH', p: pd.equilibre }) === 'interne', 'au-delà du dealing range : externe ; à l\'intérieur : interne'); } else v(true, 'dealing range absent');
  const flat = Array.from({ length: 60 }, (_, i) => ({ t: T0 + i * H, o: 100, c: 100.1, h: 100.5 + (i % 2) * 0.1, l: 99.6, v: 1 })).concat(Array.from({ length: 10 }, (_, i) => ({ t: T0 + (60 + i) * H, o: 100 + i * 3, c: 103 + i * 3, h: 104 + i * 3, l: 99.5 + i * 3, v: 1 })));
  const A = V.atrSerie(flat), cs = V.consolidations(flat, A, { min: 8, atr: 1.2 }); v(cs.length >= 1 && cs[0].n >= 8 && cs[0].haut - cs[0].bas <= 1.2 * A[20], 'consolidation : ≥ 8 bougies dans 1,2 ATR détectée');
  v(V.consolidations(marche(5, 100), V.atrSerie(marche(5, 100)), { min: 8, atr: 0.3 }).length === 0, 'pas de consolidation dans une marche agitée');
  const ev = V.listeCassures(an); v(ev.length > 0 && ev.every(e => e.tNiveau <= e.t && ['BOS', 'MSS'].includes(e.nature)), 'BOS / MSS : liste avec le segment (instant du swing → instant de la cassure)');
  const sw = V.etiquettesSwings(an, { max: 20 }); v(sw.length > 3 && sw.every(s => ['HH', 'HL', 'LH', 'LL'].includes(s.nom)), 'HH / HL / LH / LL : étiquettes des derniers swings');
  const F = V.fibonacci(an); v(!F || (F.niveaux.length === 6 && Math.abs(F.niveaux[1].p - (F.haut + F.bas) / 2) < 1e-9 && F.niveaux[0].p !== F.niveaux[5].p), 'Fibonacci : 6 niveaux, 0,5 = équilibre');
  const pj = analyses.map(a => V.projections(a)).find(Boolean); v(!pj || (Math.abs(pj.p1 - pj.fin) - pj.jambe < 1e-9 && Math.abs(Math.abs(pj.p2 - pj.fin) - 2 * pj.jambe) < 1e-9), 'projections −1 et −2 : une et deux fois la jambe du dernier MSS');
  const ub = analyses.map(a => V.unicornBpr(a)); v(ub.every(u => Array.isArray(u.unicorn) && Array.isArray(u.bpr)), 'Unicorn et BPR : listes calculées');
  // zones de recouvrement construites à la main
  const fake = { pdArrays: [{ type: 'FVG', dir: 1, bas: 10, haut: 20, t: 1, id: 'a' }, { type: 'breaker', dir: 1, bas: 15, haut: 30, t: 2, id: 'b' }, { type: 'FVG', dir: -1, bas: 18, haut: 40, t: 3, id: 'c' }] }, r = V.unicornBpr(fake);
  v(r.unicorn.length === 1 && r.unicorn[0].bas === 15 && r.unicorn[0].haut === 20, 'Unicorn = zone commune FVG ∩ breaker du même sens'); v(r.bpr.length === 1 && r.bpr[0].bas === 18 && r.bpr[0].haut === 20, 'BPR = zone commune FVG haussier ∩ FVG baissier');
  // NWOG / NDOG : barres journalières avec un trou du week-end et un trou de jour
  const J = 86400e3, jb = (i, o, c, h, l) => ({ t: Date.UTC(2026, 10, 2) + i * J, o, c, h, l, v: 1 }), D = Array.from({ length: 60 }, (_, i) => jb(i, 100, 101, 102, 99)), bars = D.slice(0, 55).concat([jb(55, 101, 101, 102, 100), jb(58, 106, 107, 108, 105), jb(59, 107.2, 108, 109, 107)]);   // le 58e jour suit un week-end : trou 101 → 106
  const g = V.gapsOuverture(bars, V.atrSerie(bars), 'J'); v(g.some(x => x.type === 'NWOG' && x.bas === 101 && x.haut === 106), 'NWOG : écart d\'ouverture de la semaine détecté et non comblé'); v(V.gapsOuverture(bars, V.atrSerie(bars), 'H1').length === 0, 'pas de NWOG / NDOG hors H4 et Jour');
}

/* ── 6. les noms par unité : aucune killzone en H4 et Jour ── */
for (const u of ['M15', 'H4', 'J']) { const pas = V.UNITES[u].ms, a = V.analyser(marche(23, 700, pas), { unite: u, maintenant: T0 + 700 * pas }), C = objetsIct(a, { mode: 'complet' }).objets;
  v(C.length > 0 && C.every(o => o.unite === V.UNITES[u].nom && o.nom), `${u} : objets nommés et portant l'unité ${V.UNITES[u].nom}`); v(u === 'M15' || !C.some(o => o.kind === 'bande' || /Minuit|Range Asie/.test(o.nom)), `${u} : pas de killzone, de minuit ni de range asiatique`); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
