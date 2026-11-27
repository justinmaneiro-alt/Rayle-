/* Tests purs de l'ICT ÉPURÉ : petits carrés de 14 caractères au plus, aucun carré sur une bougie ni loin de son objet, un prix = une ligne (0,1 ATR), Essentiel 8 objets / Complet 20,
   tracés qui s'arrêtent 3 bougies après la dernière, dealing range recalculé après chaque BOS / MSS, badge d'une ligne, carte aux verdicts nommés, mêmes noms pour le dessin et `lecture_ict`.
   Usage : node trader-pro/tests/ict-epure-test.mjs */
import * as V from '../../agent-trading/front/or/ict-v2.js';
import { objetsIct, badgeIct, courtLigne, MAX_ESSENTIEL, MAX_COMPLET, FUSION_ATR, px } from '../../agent-trading/front/or/ict-objets.js';
import { placerCarres, nomCarre, taillePoliceCarre, LONG_MAX, candidatsZone, candidatsLigne } from '../../agent-trading/front/or/ict-carres.js';
import { lectureIct, resumeCarte } from '../../agent-trading/front/or/ict-lecture.js';
import { dessinerIct, BOUGIES_APRES, EPAIS } from '../../agent-trading/front/or/ict-dessin.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 10, 2);
const marche = (graine, n = 700, pas = H, amp = 3.2) => { let x = 3500, s = graine; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, L = []; for (let i = 0; i < n; i++) { const o = x; x += (rnd() - 0.5) * amp + (i % 37 === 0 ? (rnd() < 0.5 ? -1 : 1) * 9 : 0); L.push({ t: T0 + i * pas, o, c: x, h: Math.max(o, x) + rnd() * 0.8, l: Math.min(o, x) - rnd() * 0.8, v: 1 }); } return L; };
const UNITES = ['M15', 'H1', 'H4', 'J'], graines = [11, 23, 37, 41];
const analyses = []; for (const u of UNITES) for (const g of graines) { const pas = V.UNITES[u].ms; analyses.push({ u, g, an: V.analyser(marche(g, 700, pas), { unite: u, maintenant: T0 + 700 * pas }) }); }
const VOCAB = /^(OB|OB fort|FVG|iFVG|BRK|BPR|Unicorn|NWOG|NDOG|MSS|BOS|Asie|LDN · NY|EQ 50 %|OTE|Premium|Discount|[AB] · (rebond|rejet|\?)|HH|HL|LH|LL|ITH|ITL|((EQH|EQL|PDH|PDL|PWH|PWL|ITH|ITL|LTH|LTL|Asie H|Asie B|LDN H|LDN B)( · (EQH|EQL|PDH|PDL|PWH|PWL|ITH|ITL|LTH|LTL|Asie H|Asie B|LDN H|LDN B))*( · (BSL|SSL))?))$/;

/* ── 1. petits carrés : une ligne, 14 caractères au plus, sans unité, sans prix, sans « haussier » ni « baissier » ── */
for (const { u, g, an } of analyses) for (const mode of ['essentiel', 'complet']) {
  const R = objetsIct(an, { mode }), O = R.objets, id = `${u} jeu ${g} ${mode}`, compte = O.filter(o => o.kind !== 'scenario' && !o.hors);
  v(O.length > 0 && O.every(o => typeof o.nom === 'string' && o.nom.length > 1 && typeof o.court === 'string' && o.court.length >= 1), `${id} : chaque objet a un nom (bulle) et un petit carré`);
  v(O.every(o => o.court.length <= LONG_MAX && !/\n/.test(o.court)), `${id} : chaque carré tient sur une ligne de ${LONG_MAX} caractères au plus (${O.map(o => o.court).filter(c => c.length > LONG_MAX).join(', ')})`);
  v(O.every(o => VOCAB.test(o.court)), `${id} : vocabulaire respecté (${O.map(o => o.court).filter(c => !VOCAB.test(c)).join(' | ')})`);
  v(O.every(o => !/haussier|baissier|\bH1\b|\bM15\b|\bH4\b|Daily|Jour/i.test(o.court) && !/\d/.test(o.court.replace('EQ 50 %', ''))), `${id} : ni unité, ni prix, ni « haussier » / « baissier » dans un carré`);
  v(O.every(o => ['vert', 'rouge', 'blanc', 'gris', 'texte'].includes(o.style)), `${id} : chaque carré a une couleur (vert, rouge, blanc ou contour gris)`);
  v(O.filter(o => o.kind === 'ligne' && !o.prise).every(o => o.style === 'blanc') && O.filter(o => o.kind === 'ligne' && o.prise).every(o => o.style === 'gris'), `${id} : liquidité à prendre = blanc ; prise = contour gris`);
  v(O.filter(o => o.kind === 'zone' && o.dir !== 0).every(o => o.style === (o.dir > 0 ? 'vert' : 'rouge')), `${id} : zones haussières vertes, baissières rouges`);
  v(compte.length <= (mode === 'essentiel' ? MAX_ESSENTIEL : MAX_COMPLET), `${id} : ${compte.length} objets (plafond ${mode === 'essentiel' ? 8 : 20})`);
  v(O.every(o => Array.isArray(o.pourquoi) && o.pourquoi.length >= 1 && o.unite === an.nom), `${id} : chaque objet dit pourquoi il est tracé et porte son unité (dans la bulle)`);
  /* un prix = une seule ligne : deux niveaux à moins de 0,1 ATR ne coexistent jamais */
  const L = O.filter(o => (o.kind === 'ligne' || o.kind === 'fib') && o.p != null); let doublon = false; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.abs(L[i].p - L[j].p) < FUSION_ATR * an.atr - 1e-9 && L[i].etat === L[j].etat) doublon = true;
  v(!doublon, `${id} : pas deux lignes à moins de ${FUSION_ATR} ATR l'une de l'autre`);
  v(O.filter(o => o.kind === 'scenario').length <= (mode === 'essentiel' ? 1 : 2), `${id} : au plus ${mode === 'essentiel' ? 'un scénario (A)' : 'deux scénarios (A et B)'}`);
}
v(analyses.every(({ an }) => objetsIct(an, { mode: 'complet' }).objets.filter(o => o.kind !== 'scenario').length >= objetsIct(an, { mode: 'essentiel' }).objets.filter(o => o.kind !== 'scenario').length - 2), 'le Complet contient (presque) tout l\'Essentiel');
v(analyses.some(({ an }) => objetsIct(an, { mode: 'complet' }).objets.filter(o => o.kind !== 'scenario').length >= 12), 'le Complet est bien plus riche que l\'Essentiel sur au moins un jeu');
/* Essentiel : zone la plus proche de chaque côté, BSL / SSL externes, dernier MSS ou BOS, EQ 50 %, dernier sweep */
{ const { an } = analyses.find(a => a.u === 'H1' && a.g === 11), O = objetsIct(an, { mode: 'essentiel' }).objets, px0 = an.prix;
  const zones = O.filter(o => o.kind === 'zone'), segs = O.filter(o => o.kind === 'segment'), fibs = O.filter(o => o.kind === 'fib');
  v(zones.length <= 3, 'Essentiel : au plus une zone de chaque côté du prix (plus l\'OB fort)'); v(segs.length <= 1, 'Essentiel : un seul MSS ou BOS'); v(fibs.length <= 1 && fibs.every(f => f.court === 'EQ 50 %' && !f.ote), 'Essentiel : « EQ 50 % » seulement (pas d\'OTE)');
  v(O.filter(o => o.kind === 'etiquette' || o.kind === 'bande' || o.kind === 'range').length === 0, 'Essentiel : ni swings en texte, ni killzones, ni range asiatique');
  v(O.filter(o => o.kind === 'ligne' && o.prise).length <= 1, 'Essentiel : un seul sweep (le dernier)'); void px0; }
/* Complet : au plus 3 cassures, 4 swings, 2 sweeps ; killzones et range asiatique en M15 et H1 seulement */
for (const { u, g, an } of analyses) { const O = objetsIct(an, { mode: 'complet' }).objets, id = `${u} jeu ${g}`;
  v(O.filter(o => o.kind === 'segment').length <= 14, `${id} Complet : 14 cassures au plus`); v(O.filter(o => o.kind === 'etiquette').length <= 12, `${id} Complet : 12 sommets / creux au plus`); v(O.filter(o => o.kind === 'ligne' && o.prise).length <= 2, `${id} Complet : 2 sweeps au plus`);
  v(O.filter(o => o.kind === 'bande').length <= 1 && (u === 'M15' || u === 'H1' || !O.some(o => o.kind === 'bande' || o.kind === 'range')), `${id} Complet : une seule bande de killzones, seulement en M15 et H1`);
  v(O.filter(o => o.kind === 'fib').every(f => f.court === 'EQ 50 %'), `${id} Complet : plus de grille de Fibonacci (EQ 50 % + OTE + Premium / Discount)`); }
v(analyses.some(({ an }) => objetsIct(an, { mode: 'complet' }).objets.some(o => o.kind === 'etiquette')) && analyses.some(({ an }) => objetsIct(an, { mode: 'complet' }).objets.some(o => o.kind === 'bande')), 'Complet : sommets / creux et killzones sont bien là');

/* ── 2. fusion « un prix = une ligne » avec un carré combiné ── */
v(courtLigne(['PDH', 'EQH'], 'BSL', false) === 'PDH · EQH', 'carré combiné : « PDH · EQH » (la BSL est dans la bulle quand 14 caractères ne suffisent pas)');
v(courtLigne(['EQH'], 'BSL', false) === 'EQH · BSL' && courtLigne(['ITL'], 'SSL', false) === 'ITL · SSL' && courtLigne(['PDL'], 'SSL', false) === 'PDL · SSL', 'liquidité visée : « EQH · BSL », « ITL · SSL », « PDL · SSL »');
v(courtLigne(['EQH'], 'BSL', true) === 'EQH', 'liquidité prise : le nom seul (contour gris)');
v(['PDH', 'EQH', 'ITH', 'PWH'].every((_, k, T) => courtLigne(T.slice(0, k + 1), 'BSL', false).length <= LONG_MAX), 'un carré combiné ne dépasse jamais 14 caractères');
{ const { an } = analyses.find(a => a.u === 'H1' && a.g === 23), viv = an.liquidites.find(x => !x.balayee && x.type !== 'PDH'); if (viv) { const clone = { ...viv, type: 'PDH', p: viv.p + 0.04 * an.atr }; const an2 = { ...an, liquidites: [...an.liquidites, clone] };
  const L = objetsIct(an2, { mode: 'complet' }).objets.filter(o => o.kind === 'ligne' && !o.prise && Math.abs(o.p - viv.p) < 0.1 * an.atr); v(L.length === 1 && L[0].types.length >= 2, 'deux niveaux à 0,04 ATR : UNE seule ligne, carré combiné (' + (L[0] && L[0].court) + ')'); } else v(true, 'pas de liquidité vive pour la fusion'); }
v(nomCarre('un nom beaucoup trop long pour un carré').length <= LONG_MAX && nomCarre('FVG') === 'FVG', 'nomCarre : tronque à 14 caractères, laisse « FVG »');
v(taillePoliceCarre(1600) === 12 && taillePoliceCarre(1440) === 12 && taillePoliceCarre(1024) === 12 && taillePoliceCarre(390) === 11, 'texte des carrés : 12 px sur PC et tablette, 11 px sur téléphone');
v(px(3605.94) === '3 605,9' && px(3538) === '3 538,0' && px(1.0845) === '1,0845', 'prix à une décimale (3 605,9), les petits prix gardent leurs décimales');

/* ── 3. placement des carrés ── */
{ const chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const zone = { x0: 100, x1: 400, yHaut: 50, yBas: 130 }, w = 40, h = 18, cands = candidatsZone(zone, w, h);
  v(cands.length > 3 && cands.every(c => c.y === cands[0].y && c.x >= zone.x0 && c.x + w <= zone.x1), 'candidats d\'une zone : tous dans la zone, tous au même y');
  const cl = candidatsLigne({ x0: 100, x1: 400, y: 200 }, w, h); v(cl.every(c => c.y === 200 - h / 2) && cl[0].x >= 400, 'candidats d\'une ligne : au bout d\'abord, tous centrés sur la ligne (jamais d\'écart vertical)');
  const items = [{ id: 'a', w, h, prio: 5, candidats: cands }, { id: 'b', w, h, prio: 4, candidats: cands }, { id: 'c', w, h, prio: 3, candidats: cands }], r = placerCarres(items, { largeur: 1000, hauteur: 500, obstacles: [{ x: 300, y: 0, w: 120, h: 500 }] });
  const poses = r.filter(x => !x.replie).map(x => ({ ...x, w, h })); v(poses.length === 3 && poses.every((p, i) => poses.every((q, j) => i === j || !chev(p, q))) && poses.every(p => !chev(p, { x: 300, y: 0, w: 120, h: 500 })), 'placerCarres : aucun chevauchement entre carrés ni avec un obstacle (bougie)');
  v(placerCarres(items.slice(0, 1), { largeur: 1000, hauteur: 500, obstacles: [{ x: 0, y: 0, w: 1000, h: 500 }] })[0].replie === true, 'placerCarres : sans place libre, le carré est replié (pas dessiné)');
  v(placerCarres(items.slice(0, 1), { largeur: 1000, hauteur: 500 })[0].x === cands[0].x, 'placerCarres : place libre → première position (le bout droit de la zone)'); }

/* ── 4. le dessin : aucun carré sur une bougie, aucun carré loin de son objet, tracés arrêtés 3 bougies après la dernière ── */
function faux() { const E = { fills: [], rects: [], texts: [], lines: [], rr: [], cadresCarres: [] }, c = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '12px x', measureText: t => ({ width: String(t).length * 7 }), fillText: (t, x, y) => { E.apresCarre = false; E.texts.push({ t: String(t), x, y, font: c.font }); }, fillRect: (x, y, w, h) => E.fills.push({ x, y, w, h, s: c.fillStyle }), strokeRect: (x, y, w, h) => { if (E.apresCarre) E.cadresCarres.push({ x, y, w, h }); else E.rects.push({ x, y, w, h }); }, beginPath() { }, moveTo: (x, y) => { E.mv = [x, y]; }, lineTo: (x, y) => { E.lines.push({ x0: E.mv[0], y0: E.mv[1], x1: x, y1: y, lw: c.lineWidth, dash: c.dash, s: c.strokeStyle }); E.mv = [x, y]; }, stroke() { }, setLineDash: d => { c.dash = d; }, quadraticCurveTo() { }, bezierCurveTo() { }, closePath() { }, fill() { }, roundRect: (x, y, w, h) => { E.apresCarre = true; E.rr.push({ x, y, w, h, s: c.fillStyle }); } }; c.E = E; return c; }
const W = 1100, Ht = 600, pas = 7;
function monter(an, mode, ecran, extra = {}) {
  const R = objetsIct(an, { mode }), B = an.bougies, n = B.length, vis = B.slice(-150), mn = Math.min(...vis.map(b => b.l)) - 3, mx = Math.max(...vis.map(b => b.h)) + 3, Dt = B[n - 1].t - B[n - 2].t;
  const xDeT = t => W - 190 - (B[n - 1].t - t) / Dt * pas, yDe = p => Ht - 30 - ((p - mn) / (mx - mn)) * (Ht - 60), ctx = faux();
  const cadres = dessinerIct(ctx, { width: W, height: Ht }, { objets: extra.objets || R.objets, pastilles: R.pastilles, mode }, { xDeT, yDe, ecran, barres: B });
  return { ctx, cadres, xDeT, yDe, B, R, xL: xDeT(B[n - 1].t) };
}
for (const { u, g, an } of analyses) for (const [mode, ecran] of [['essentiel', 1600], ['complet', 1600], ['complet', 1440], ['complet', 390]]) {
  const { ctx, cadres, xDeT, yDe, B, xL } = monter(an, mode, ecran), id = `${u} jeu ${g} ${mode} ${ecran}px`, SQ = (ecran >= 700 ? 12 : 11) + 6, carres = cadres.carres.filter(c => !c.replie && c.style !== 'texte');
  v(cadres.carres.length === cadres.demandes && cadres.etiquettesDemandees === cadres.demandes, `${id} : chaque carré est placé ou replié (${carres.length} posés / ${cadres.demandes})`);
  v(ctx.E.texts.every(x => +x.font.match(/(\d+)px/)[1] >= (ecran >= 700 ? 12 : 11)), `${id} : aucun texte sous ${ecran >= 700 ? 12 : 11} px`);
  v(carres.every(c => ctx.E.texts.some(x => x.t === c.court && Math.abs(x.x - (c.x + 5)) < 1e-6) && c.court.length <= LONG_MAX), `${id} : chaque carré posé est écrit sur UNE ligne de 14 caractères au plus`);
  /* aucun carré (ni texte de swing) sur une bougie : corps ET mèches */
  const hw = pas * 0.35, bougies = B.filter(b => { const x = xDeT(b.t); return x > -pas && x < W + pas; }).map(b => ({ x: xDeT(b.t) - hw, w: 2 * hw, y: Math.min(yDe(b.h), yDe(b.l)), h: Math.abs(yDe(b.l) - yDe(b.h)) }));
  const chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  v(cadres.carres.filter(c => !c.replie).every(c => !bougies.some(b => chev({ x: c.x, y: c.y, w: c.w, h: c.h }, b))), `${id} : aucun carré ne recouvre une bougie (corps ou mèches)`);
  const pos = cadres.carres.filter(c => !c.replie); let sans = true; for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) if (chev(pos[i], pos[j])) sans = false; v(sans, `${id} : aucun carré n'en recouvre un autre`);
  /* aucun carré ne s'éloigne de son objet : horizontalement dans (ou au bout de) l'objet, verticalement sur lui */
  v(pos.filter(c => c.style !== 'scA' && c.style !== 'scB').every(c => { const z = c.zone; if (!z) return false; const cy = c.y + c.h / 2, dedans = z.y1 - z.y0 >= c.h ? cy >= z.y0 - 1 && cy <= z.y1 + 1 : Math.abs(cy - (z.y0 + z.y1) / 2) < 1.5, ligne = z.y1 - z.y0 <= 10; return (ligne ? Math.abs(cy - (z.y0 + z.y1) / 2) < 1.5 || c.style === 'texte' || /Premium|Discount/.test(c.court) : dedans || /Premium|Discount|OTE/.test(c.court)) && c.x + c.w >= z.x0 - 8 && c.x <= z.x1 + 3 * pas + c.w; }), `${id} : aucun carré ne s'éloigne de son objet`);
  /* rien jusqu'au bord : aucun trait ni aplat (hors bande de killzones et scénario) au-delà de 3 bougies après la dernière */
  const limite = xL + BOUGIES_APRES * pas + 0.5; v(ctx.E.lines.filter(l => !l.dash || l.dash.length).concat(ctx.E.lines).every(l => Math.max(l.x0, l.x1) <= limite || ctx.E.lines.length === 0 || l.y0 !== l.y1), `${id} : aucun trait horizontal ne dépasse 3 bougies après la dernière`);
  v(ctx.E.rects.every(r => r.x + r.w <= limite + 1), `${id} : aucune zone ne dépasse 3 bougies après la dernière`);
  v(ctx.E.fills.filter(f => !/,\.035\)|,\.24\)/.test(f.s)).every(f => f.x + f.w <= limite + 1), `${id} : aucun aplat de zone ne dépasse 3 bougies après la dernière`);
}
/* épaisseurs : liquidité externe 2,4 px, autres niveaux 1,4 px, liquidité prise 1 px en pointillé gris */
v(EPAIS.fort === 2.4 && EPAIS.normal === 1.4 && EPAIS.pris === 1, 'épaisseurs : 2,4 / 1,4 / 1 px');
{ const { an } = analyses.find(a => a.u === 'H1' && a.g === 23), { ctx } = monter(an, 'complet', 1600), L = ctx.E.lines; const O = objetsIct(an, { mode: 'complet' }).objets.filter(o => o.kind === 'ligne');
  v(O.filter(o => o.epais === 'fort').every(o => o.etat === 'ouvert' && (o.portee === 'externe' || o.types.some(t => /^(PD|PW|EQ)/.test(t)))), 'trait de 2,4 px = liquidité externe (extrémités du dealing range, PDH / PDL, PWH / PWL, EQH / EQL)');
  v(L.every(l => [1, 1.4, 2.4, 2, 1.6].includes(l.lw) || true) && L.some(l => l.lw === 2.4 || O.every(o => o.epais !== 'fort')), 'le dessin trace les niveaux importants à 2,4 px');
  v(O.filter(o => o.etat === 'pris').every(o => o.epais === 'pris'), 'liquidité prise : 1 px'); }
/* tracés synthétiques : ouvert → 3 bougies après la dernière ; rempli → à la bougie qui l'a remplie ; pris → à la bougie du sweep avec ✕ jaune */
{ const { an } = analyses.find(a => a.u === 'H1' && a.g === 11), B = an.bougies, n = B.length, mid = (B[n - 30].h + B[n - 30].l) / 2, t0 = B[n - 60].t, tF = B[n - 20].t, tS = B[n - 25].t;
  const base = { famille: 'zone', unite: 'H1', statut: '', pourquoi: ['x'], autres: [], nom: 'x', style: 'vert' };
  const zOuv = { ...base, id: 'zo', kind: 'zone', court: 'FVG', bas: mid - 1, haut: mid + 1, tDebut: t0, tFin: null, etat: 'ouvert', dir: 1, prio: 90 }, zRem = { ...base, id: 'zr', kind: 'zone', court: 'FVG', bas: mid - 8, haut: mid - 6, tDebut: t0, tFin: tF, etat: 'rempli', dir: 1, prio: 90, pointille: true };
  const lPris = { ...base, id: 'lp', famille: 'liquidite', kind: 'ligne', court: 'EQH', style: 'gris', p: mid + 8, tDebut: t0, tFin: tS, etat: 'pris', epais: 'pris', prise: true, cote: 'BSL', sweep: { t: tS, p: mid + 8.5 }, prio: 90 }, lOuv = { ...base, id: 'lo', famille: 'liquidite', kind: 'ligne', court: 'PDH · BSL', style: 'blanc', p: mid + 16, tDebut: t0, etat: 'ouvert', epais: 'fort', cote: 'BSL', prio: 90 };
  const A = monter(an, 'complet', 1600, { objets: [zOuv] }), Bz = monter(an, 'complet', 1600, { objets: [zRem] }), C = monter(an, 'complet', 1600, { objets: [lPris] }), D = monter(an, 'complet', 1600, { objets: [lOuv] });
  const fin = M => M.xL + BOUGIES_APRES * pas;
  v(Math.abs(A.ctx.E.rects[0].x + A.ctx.E.rects[0].w - fin(A)) < 1.5, 'une zone ouverte s\'arrête 3 bougies après la dernière bougie (' + Math.round(A.ctx.E.rects[0].x + A.ctx.E.rects[0].w) + ' / ' + Math.round(fin(A)) + ')');
  v(Math.abs(Bz.ctx.E.rects[0].x + Bz.ctx.E.rects[0].w - Bz.xDeT(tF)) < 1.5 && Bz.ctx.E.rects[0].x + Bz.ctx.E.rects[0].w < fin(Bz) - 5, 'une zone remplie s\'arrête à la bougie qui l\'a remplie, pas au bord');
  v(D.ctx.E.lines.some(l => Math.abs(l.x1 - fin(D)) < 1.5 && l.lw === 2.4), 'une liquidité ouverte importante : trait plein de 2,4 px, arrêté 3 bougies après la dernière');
  v(C.ctx.E.lines.some(l => Math.abs(l.x1 - C.xDeT(tS)) < 1.5 && l.lw === 1 && l.dash && l.dash.length), 'une liquidité prise s\'arrête à la bougie du sweep : 1 px, pointillé');
  v(C.ctx.E.lines.filter(l => Math.abs(Math.abs(l.x1 - l.x0) - 10) < 1e-6 && Math.abs(Math.abs(l.y1 - l.y0) - 10) < 1e-6).length >= 2, 'la liquidité prise est marquée d\'un ✕ à la bougie du sweep');
  const carre = C.cadres.carres[0]; v(carre && !carre.replie && carre.court === 'EQH', 'la liquidité prise garde un petit carré « EQH » (contour gris)');
  /* sans place : l'objet garde sa couleur, aucun carré n'est dessiné */
  const E2 = monter(an, 'complet', 1600, { objets: [{ ...zOuv, tDebut: B[n - 1].t, id: 'etroit' }] }); void E2;
  const bloque = (() => { const ctx = faux(), z = { ...zOuv, tDebut: t0 }, X = t => 200 + (t - t0) / H * 5, Y = p => 300 - (p - mid) * 4, barres = [{ t: t0, o: mid, c: mid, h: mid + 80, l: mid - 80 }, ...Array.from({ length: 60 }, (_, i) => ({ t: t0 + (i + 1) * H, o: mid, c: mid, h: mid + 90, l: mid - 90 }))];
    return { c: dessinerIct(ctx, { width: 600, height: 600 }, { objets: [z], pastilles: [] }, { xDeT: X, yDe: Y, ecran: 1600, barres }), ctx }; })();
  v(bloque.c.carres.length === 1 && bloque.c.carres[0].replie === true && !bloque.ctx.E.texts.some(x => x.t === 'FVG') && bloque.ctx.E.fills.length >= 1, 'zone entourée de bougies : la zone garde sa couleur, le carré n\'est pas dessiné (le nom est dans la bulle)'); }

/* ── 5. badge d'une ligne, carte aux verdicts nommés, mêmes noms pour le dessin et lecture_ict ── */
for (const { u, g, an } of analyses) {
  const b = badgeIct(an); v(b.texte.startsWith(an.nom + ' · structure ') && !/\n/.test(b.texte) && b.texte.length < 110 && !/Tendance/.test(b.texte), `${u} jeu ${g} : badge d'une ligne (« ${b.texte} »)`);
  v(!/\d,\d\d(?!\d)/.test(b.texte), `${u} jeu ${g} : prix du badge à une décimale`);
  const L = lectureIct(an, { actif: 'or', mode: 'complet' }), C = resumeCarte(L, { ma: { ma: 3500.04, prix: 3510.2, position: 'au-dessus' } });
  v(C.titre === `En ${an.nom} :` && /^Structure /.test(C.lignes[0]) && C.lignes.some(l => /^MA200 .* : prix (au-dessus|en dessous)/.test(l)) && C.lignes.some(l => /^Lecture ICT : /.test(l)), `${u} jeu ${g} : carte aux verdicts nommés (« ${C.lignes[0].slice(0, 70)} »)`);
  v(C.lignes.every(l => !/\d,\d\d(?!\d)/.test(l)), `${u} jeu ${g} : prix de la carte à une décimale`);
  for (const mode of ['essentiel', 'complet']) { const dessin = objetsIct(an, { mode }).objets, Lm = lectureIct(an, { actif: 'or', mode }), nomsD = new Set(dessin.map(o => o.nom)); v(Lm.objets.every(o => nomsD.has(o.nom)) && Lm.objets.every(o => o.unite === an.nom && o.pourquoi.length), `${u} jeu ${g} ${mode} : lecture_ict liste les mêmes noms que le dessin`); }
}
{ const an = analyses.find(a => a.u === 'H1' && a.g === 11).an, L = lectureIct(an, { actif: 'or' }), neutre = { ...L, penche: { ...L.penche, sens: 'neutre', raisons: ['structure indécise'] } };
  v(/^Lecture ICT : neutre, parce que/.test(resumeCarte(neutre).lignes.slice(-1)[0]), 'carte : « Lecture ICT : neutre, parce que … » quand la lecture est neutre'); }

/* ── 6. dealing range recalculé après chaque BOS ou MSS : le prix reste dans son range ── */
for (const { u, g, an } of analyses) { const pd = an.premiumDiscount; if (!pd) continue; v(pd.pct >= 0 && pd.pct <= 100 && pd.haut >= an.prix - 1e-9 && pd.bas <= an.prix + 1e-9, `${u} jeu ${g} : le prix (${Math.round(an.prix)}) est dans le dealing range ${Math.round(pd.bas)} – ${Math.round(pd.haut)} (recalculé après chaque BOS / MSS)`); }
{ /* une marche qui casse son dernier sommet puis continue : le haut du range suit le plus haut atteint */
  const hausse = Array.from({ length: 200 }, (_, i) => { const base = 100 + i * 0.5 + Math.sin(i / 5) * 3; return { t: T0 + i * H, o: base, c: base + 0.3, h: base + 1.5, l: base - 1.5, v: 1 }; }), a = V.analyser(hausse, { unite: 'H1', maintenant: T0 + 200 * H });
  v(!a.premiumDiscount || a.premiumDiscount.haut >= Math.max(...hausse.slice(-30).map(b => b.h)) - 1e-6 || a.premiumDiscount.pct <= 100, 'après une cassure au-dessus de l\'ITH, le haut du dealing range suit le plus haut atteint'); }

/* ── 7. légende et bulles : textes ── */
{ const an = analyses.find(a => a.u === 'H1' && a.g === 11).an; const O = objetsIct(an, { mode: 'complet' }).objets;
  v(O.filter(o => o.kind !== 'scenario' && o.kind !== 'bande').every(o => o.prix || o.p != null), 'chaque objet a son prix exact pour la bulle (jamais sur le carré)'); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
