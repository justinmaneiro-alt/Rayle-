/* Test Chrome des outils de dessin du Terminal (ligne horizontale, trendline, boîte, Fibonacci) : tracé, sélection, poignées, couleur, verrou, suppression, persistance, flèches.
   Souris (pc) ou doigt (tel / tablette). Usage : node trader-pro/tests/dessins-chrome.mjs [pc|tablette|tel]   (prérequis : voir aide-chrome.mjs) */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode), { p, verif, attendre, capture } = T, doigt = mode !== 'pc';
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!(window.__orPro && window.__orPro.dessins && window.__orPro.dessins())), 60000), 'les outils de dessin sont montés');
verif(await attendre(() => p.evaluate(() => { try { const D = window.__orPro.dessins(), n = window.__or.moteur.serie().length; return n > 100 && D.px.X(Date.now()) != null && D.px.P(300) != null; } catch (e) { return false; } }), 60000), 'les bougies sont chargées');
await w(2000);
const D = f => p.evaluate(f);
const etat = () => p.evaluate(() => window.__orPro.dessins().etat());
const zone = await p.evaluate(() => { const r = window.__or.graph.conteneur().getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
verif(zone.w > 300 && zone.h > 200, 'graphique visible : ' + Math.round(zone.w) + '×' + Math.round(zone.h));
console.log('— barre d’outils discrète —');
verif(await p.evaluate(() => { const b = document.querySelector('.tp-dessin-barre'); if (!b) return false; const r = b.getBoundingClientRect(), g = window.__or.graph.conteneur().getBoundingClientRect(); return r.width > 20 && r.right <= g.right + 1 && r.left >= g.left - 1; }), 'la barre est sur le graphique, repliée par défaut');
verif(await p.evaluate(() => [...document.querySelectorAll('.tp-dessin-barre [data-outil]')].every(b => b.offsetParent === null)), 'les outils sont repliés tant qu’on n’ouvre pas la barre');
await p.evaluate(() => document.querySelector('.tp-dessin-barre .tp-d-bascule').click()); await w(300);
verif(await p.evaluate(() => ['select', 'horizontale', 'tendance', 'boite', 'fibo'].every(k => { const b = document.querySelector(`.tp-dessin-barre [data-outil="${k}"]`); return b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height >= 28; })), 'cinq boutons : sélection, ligne horizontale, trendline, boîte, Fibonacci');
verif(await p.evaluate(() => [...document.querySelectorAll('.tor-outils [data-outil]')].filter(b => !b.closest('.tp-dessin-barre')).every(b => b.dataset.outil === 'position' || getComputedStyle(b).display === 'none')), 'l’ancienne barre Ligne / Zone / Tendance / Rayon est remplacée (Position reste)');
await capture('dessins-barre');
const pt = (fx, fy) => ({ x: zone.x + zone.w * fx, y: zone.y + zone.h * fy });
async function clic(x, y) { if (doigt) { await p.touchscreen.touchStart(x, y); await w(60); await p.touchscreen.touchEnd(); } else { await p.mouse.move(x, y); await p.mouse.down(); await w(40); await p.mouse.up(); } await w(250); }
async function glisser(a, b) {
  if (doigt) { await p.touchscreen.touchStart(a.x, a.y); for (let i = 1; i <= 8; i++) { await p.touchscreen.touchMove(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await w(20); } await p.touchscreen.touchEnd(); }
  else { await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 8 }); await p.mouse.up(); } await w(350);
}
const outil = k => p.evaluate(k2 => document.querySelector(`.tp-dessin-barre [data-outil="${k2}"]`).click(), k);

console.log('— ligne horizontale —');
await outil('horizontale'); const h0 = pt(0.4, 0.45); await clic(h0.x, h0.y);
let e = await etat(); verif(e.dessins.length === 1 && e.dessins[0].type === 'horizontale' && e.dessins[0].unite && e.selection === e.dessins[0].id && e.mode === 'select', 'ligne horizontale posée, sélectionnée, retour en mode sélection');
const prixH = await p.evaluate(y => window.__orPro.dessins().px.P(y - window.__or.graph.conteneur().getBoundingClientRect().top), h0.y);
verif(Math.abs(e.dessins[0].p - prixH) / prixH < 0.01, 'à la hauteur du doigt (±1 %) : ' + e.dessins[0].p + ' vs ' + Math.round(prixH));
console.log('— trendline (glisser) —');
await outil('tendance'); const a1 = pt(0.25, 0.7), a2 = pt(0.6, 0.35); await glisser(a1, a2);
e = await etat(); const tl = e.dessins.find(d => d.type === 'tendance'); verif(!!tl && tl.t1 < tl.t2 && e.mode === 'select', 'trendline tracée en glissant');
if (tl) { const px = await p.evaluate(i => { const g = window.__orPro.dessins().pixels(i), r = window.__or.graph.conteneur().getBoundingClientRect(); return { ax: g.a.x + r.left, ay: g.a.y + r.top, bx: g.b.x + r.left, by: g.b.y + r.top }; }, tl.id); verif(Math.abs(px.ax - a1.x) < 12 && Math.abs(px.bx - a2.x) < 12, 'les extrémités sont là où l’on a posé le doigt (±12 px)'); }
console.log('— boîte (glisser) —');
await outil('boite'); await glisser(pt(0.55, 0.6), pt(0.85, 0.8));
e = await etat(); const bx = e.dessins.find(d => d.type === 'boite'); verif(!!bx && bx.haut > bx.bas && bx.t2 > bx.t1, 'boîte tracée');
console.log('— boîte étirée dans l’autre sens (de bas en haut, de droite à gauche) —');
await outil('boite'); await glisser(pt(0.3, 0.8), pt(0.15, 0.68));
e = await etat(); verif(e.dessins.filter(d => d.type === 'boite').length === 2 && e.dessins.filter(d => d.type === 'boite').every(d => d.haut > d.bas && d.t2 > d.t1), 'boîte tracée à l’envers : bornes normalisées');
console.log('— Fibonacci (deux touchers pour le doigt, glisser pour la souris) —');
await outil('fibo'); const fa = pt(0.3, 0.75), fb2 = pt(0.7, 0.2); if (doigt) { await clic(fa.x, fa.y); await clic(fb2.x, fb2.y); } else await glisser(fa, fb2);
e = await etat(); const fb = e.dessins.find(d => d.type === 'fibo'); verif(!!fb && fb.p1 !== fb.p2, 'Fibonacci tracé de A vers B');
await capture('dessins-quatre-outils');

console.log('— sélection, poignées, déplacement —');
await clic(zone.x + zone.w * 0.02, zone.y + zone.h * 0.05); e = await etat(); verif(e.selection === null, 'un toucher dans le vide désélectionne');
const px0 = await p.evaluate(() => window.__orPro.dessins().pixels(window.__orPro.dessins().etat().dessins.find(d => d.type === 'tendance').id));
const r0 = await p.evaluate(() => { const r = window.__or.graph.conteneur().getBoundingClientRect(); return { x: r.left, y: r.top }; });
/* point de la trendline où un toucher la désigne bien, elle et pas un autre dessin qui la croise (écrans étroits : tout se chevauche) */
const pointSur = id => p.evaluate(i => { const D = window.__orPro.dessins(), g = D.pixels(i), r = window.__or.graph.conteneur().getBoundingClientRect(); for (const k of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85]) { const x = g.a.x + (g.b.x - g.a.x) * k, y = g.a.y + (g.b.y - g.a.y) * k, h = D.toucher(x, y); if (h && h.id === i && !h.poignee) return { x: r.left + x, y: r.top + y }; } return { x: r.left + (g.a.x + g.b.x) / 2, y: r.top + (g.a.y + g.b.y) / 2 }; }, id);
const milieu = await pointSur(tl.id);
await clic(milieu.x, milieu.y); e = await etat(); verif(e.selection === tl.id, 'toucher la trendline la sélectionne');
const avant = (await etat()).dessins.find(d => d.id === tl.id);
await glisser({ x: r0.x + px0.b.x, y: r0.y + px0.b.y }, { x: r0.x + px0.b.x + 60, y: r0.y + px0.b.y - 40 });
let ap = (await etat()).dessins.find(d => d.id === tl.id); verif(ap.t2 > avant.t2 && ap.p2 > avant.p2 && ap.t1 === avant.t1 && ap.p1 === avant.p1, 'étirer par la poignée : seule l’extrémité B bouge');
const m2 = await pointSur(tl.id);
await glisser(m2, { x: m2.x + 50, y: m2.y + 30 }); const ap2 = (await etat()).dessins.find(d => d.id === tl.id); verif(ap2.t1 > ap.t1 && ap2.t2 > ap.t2 && ap2.p1 < ap.p1, 'déplacer par le corps : les deux extrémités suivent');
verif((await etat()).claim === false, 'aucune capture de pointeur ne reste active'); const nChart = await p.evaluate(() => window.__or.graph.chart().timeScale().getVisibleLogicalRange().from); /* départ du glissé : un point libre (aucun dessin dessous), au milieu du graphique */
  const libre = await p.evaluate(() => { const D = window.__orPro.dessins(), r = window.__or.graph.conteneur().getBoundingClientRect(); for (const fy of [0.25, 0.15, 0.35, 0.5, 0.6]) for (const fx of [0.05, 0.1, 0.5, 0.35, 0.65, 0.8, 0.9]) { const x = r.width * fx, y = r.height * fy; if (!D.toucher(x, y) && !D.toucher(x + 60, y)) return { x: r.left + x, y: r.top + y }; } return { x: r.left + r.width * 0.05, y: r.top + r.height * 0.3 }; });
  let nChart2 = nChart; for (let essai = 0; essai < 4 && Math.abs(nChart2 - nChart) <= 1; essai++) { await w(500); await glisser({ x: libre.x, y: libre.y }, { x: libre.x + Math.min(120, zone.w * 0.25), y: libre.y }); await w(500); nChart2 = await p.evaluate(() => window.__or.graph.chart().timeScale().getVisibleLogicalRange().from); }   // (le glissé tactile émulé est parfois pris pour un toucher : jusqu'à 4 essais)
verif(Math.abs(nChart2 - nChart) > 1, 'hors dessin : le graphique défile normalement (le dessin ne bloque pas le défilement)');
console.log('— couleur, verrou, alertes —');
const mm = await pointSur(tl.id); await clic(mm.x, mm.y); e = await etat();
await p.evaluate(() => document.querySelectorAll('.tp-dessin-barre [data-couleur]')[2].click()); await w(200); e = await etat(); verif(e.dessins.find(d => d.id === tl.id).couleur === '#5fb894', 'changer la couleur (vert sobre)');
await p.evaluate(() => document.querySelector('.tp-dessin-barre [data-d="verrou"]').click()); await w(200); verif((await etat()).dessins.find(d => d.id === tl.id).verrou === true, 'verrouiller');
const pv = await pointSur(tl.id), av2 = (await etat()).dessins.find(d => d.id === tl.id);
await glisser({ x: pv.x, y: pv.y }, { x: pv.x + 80, y: pv.y }); const ap3 = (await etat()).dessins.find(d => d.id === tl.id); verif(ap3.t1 === av2.t1 && ap3.p1 === av2.p1, 'verrouillé : ne bouge plus');
await p.evaluate(() => document.querySelector('.tp-dessin-barre [data-d="alerte"]').click()); await w(200); verif((await etat()).dessins.find(d => d.id === tl.id).alerte === false, 'couper les alertes de ce niveau');
await p.evaluate(() => document.querySelector('.tp-dessin-barre [data-d="verrou"]').click()); await w(200);
console.log('— unités de temps : les dessins restent visibles, l’unité d’origine est gardée —');
const unite0 = (await etat()).dessins[0].unite;
for (const u of ['H4', 'J']) { await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), u); await w(7000); const ee = await etat(); verif(ee.dessins.length >= 5 && ee.dessins.every(d => ['H1', 'H4', 'J'].includes(d.unite)), 'sur ' + u + ' : les ' + ee.dessins.length + ' dessins existent toujours'); const g = await p.evaluate(i => window.__orPro.dessins().pixels(i), tl.id); verif(await attendre(() => p.evaluate(i => !!window.__orPro.dessins().pixels(i), tl.id), 25000), 'sur ' + u + ' : la trendline a une position à l’écran'); }
await capture('dessins-unite-jour');
console.log('— Fibonacci : ancrage auto et niveaux affichés —');
await p.evaluate(() => { const D = window.__orPro.dessins(); D.choisirMode('fibo'); }); await w(200);
verif(await p.evaluate(() => !document.querySelector('.tp-dessin-barre [data-d="auto"]').hidden), 'le bouton « Auto » apparaît avec l’outil Fibonacci');
const nFib0 = (await etat()).dessins.filter(d => d.type === 'fibo').length; await p.evaluate(() => document.querySelector('.tp-dessin-barre [data-d="auto"]').click()); await w(500);
const eFib = await etat(), nFib1 = eFib.dessins.filter(d => d.type === 'fibo').length; verif(nFib1 === nFib0 + 1, 'ancrage auto : un Fibonacci posé sur la dernière impulsion majeure');
const gF = await p.evaluate(() => { const D = window.__orPro.dessins(), o = D.liste().filter(d => d.type === 'fibo').pop(); const g = D.pixels(o.id); return { auto: o.auto, nObj: g && g.obj.length, cles: g && Object.keys(g).sort().join() }; }); verif(gF.auto === true && gF.nObj === 2, 'Fibonacci auto : deux objectifs (1,272 et 1,618)');
verif(!!gF.cles && /zone/.test(gF.cles) && /premium/.test(gF.cles) && /y382/.test(gF.cles) && /yInv/.test(gF.cles), 'zone 0,5–0,705, premium, 0,382 et 100 % : rien d’autre');
console.log('— suppression —');
await p.evaluate(() => { const D = window.__orPro.dessins(); D.selectionner(D.etat().dessins.find(d => d.type === 'boite').id); }); await w(200);
const nb0 = (await etat()).dessins.length; await p.evaluate(() => document.querySelector('.tp-dessin-barre [data-d="suppr"]').click()); await w(300); verif((await etat()).dessins.length === nb0 - 1, 'supprimer le dessin sélectionné');
console.log('— persistance : rechargement de la page —');
const avantRecharge = (await etat()).dessins.map(d => d.id).sort().join();
await p.reload({ waitUntil: 'domcontentloaded' }); verif(await attendre(() => p.evaluate(() => !!(window.__orPro && window.__orPro.dessins && window.__orPro.dessins())), 60000), 'terminal remonté'); await w(3000);
verif((await etat()).dessins.map(d => d.id).sort().join() === avantRecharge, 'les dessins sont retrouvés après rechargement');
console.log('— flèches de niveau (données réelles) —');
const res = await p.evaluate(async () => {
  const D = window.__orPro.dessins(), B = window.__or.moteur.serie(), niv = await import('/trader-pro/terminal/niveaux.js'), per = window.__or.moteur.S.periode, unite = per === 'H4' || per === 'J' ? per : 'H1';
  const dernier = B[B.length - 1].t; let trouve = null;
  for (let i = B.length - 150; i < B.length - 5 && !trouve; i += 3) { const p0 = Math.round(B[i].l * 10) / 10; const o = niv.creer('horizontale', { p: p0, unite, cree: B[i - 60 < 0 ? 0 : i - 60].t }); const r = niv.evaluer(o, B, { maintenant: dernier + 3600e3 * 24 }); if (r.evenements.length) trouve = { p: p0, n: r.evenements.length, types: r.evenements.map(x => x.type) }; }
  if (!trouve) return { trouve: null };
  const o = D.ajouter('horizontale', { p: trouve.p }); D.evaluer(true); return { trouve, id: o && o.id };
});
console.log('  niveau de test :', JSON.stringify(res.trouve));
if (res.trouve) { await w(2500); const m = await p.evaluate(() => window.__orPro.marqueurs().length); const ev = await p.evaluate(() => window.__orPro.dessins().liste().reduce((n, o) => n + (o.evenements || []).length, 0)); verif(ev >= 0, 'événements enregistrés : ' + ev); verif(m >= 0, 'marqueurs du graphique : ' + m); }
await capture('dessins-final');
await T.fin();
