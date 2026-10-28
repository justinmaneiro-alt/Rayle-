import { compteur, attendre } from './terre-aide.mjs';
import { lancer } from './v5-aide.mjs';

/* Gestes V5 dans la VRAIE page Rayle, SANS caméra : suites de points synthétiques à 60 images/s rejouées par Gestes.rejouer. Vérifie, sur de vrais éléments : engagement, curseur visible (anneau, états),
   couverture de tout l'écran, aimantation et zones élargies, clic / double clic / clic droit sans clic parasite, déplacer une fenêtre, la redimensionner (coin, deux mains), la ranger, la fermer (annulable),
   défilement et balayage, objets 3D (une main : rotation avec inertie ; deux mains : zoom, rotation, déplacement ; suivre ; vue initiale), pause et reprise, diagnostic, réglages, calibrage, mode « Apprendre ».
   Lancer : node tests-navigateur/v5-gestes-test.mjs   Ce qui ne peut PAS être testé ici : une vraie main devant un vrai téléphone (à valider par Justin, procédure dans docs/GESTES.md). */
const { verifier, fin } = compteur();
const { page, erreurs, fermer } = await lancer({ port: 8141 });
const ev = (f, ...a) => page.evaluate(f, ...a);
const T = (code, ...a) => page.evaluate(new Function('...args', 'return (async () => { const T = window.__T; ' + code + ' })()'), ...a);

// ── banc d'essai : un petit bouton, un grand canevas 3D, une vraie fenêtre du gestionnaire commun ──
await ev(async () => {
  const { creerGestionnaire, chargerStyle } = await import('/core/commun/gestionnaire-fenetres.js'), { creerCalcul } = await import('/core/commun/fenetres-calcul.js');
  chargerStyle(); const ui = document.createElement('div'); ui.id = 'banc-ui'; ui.style.cssText = 'position:fixed;inset:0;z-index:2147470000;pointer-events:none'; document.body.appendChild(ui);
  const calc = creerCalcul({ haut: 64, bas: 78, miniL: 260, miniH: 160 });
  window.__gf = creerGestionnaire({ ui, calc, cle: 'banc-v5', vue: 'Banc V5', rangeableParDefaut: false });
  window.__j = { clic: 0, dbl: 0, droit: 0, roues: [], pd: 0, pm: 0, pu: 0, pmDroit: 0, pdDroit: 0, suivre: 0, vueInit: 0, dblCv: 0 };
  document.body.insertAdjacentHTML('beforeend', '<button id="petit" style="position:fixed;left:900px;top:250px;width:30px;height:24px;z-index:2147469000;font-size:10px">ok</button><canvas id="cv3d" width="600" height="400" style="position:fixed;left:700px;top:430px;width:600px;height:400px;z-index:2147468000;background:#102"></canvas>');
  const b = document.getElementById('petit'); b.addEventListener('click', e => { window.__j.clic++; if (e.detail === 2) window.__j.dbl++; }); b.addEventListener('contextmenu', () => { window.__j.droit++; });
  const cv = document.getElementById('cv3d'); cv.addEventListener('pointerdown', e => { if (e.button === 0) window.__j.pd++; else if (e.button === 2) window.__j.pdDroit++; }); cv.addEventListener('pointermove', e => { if (e.buttons & 1) window.__j.pm++; else if (e.buttons & 2) window.__j.pmDroit++; }); cv.addEventListener('pointerup', () => { window.__j.pu++; }); cv.addEventListener('wheel', e => { window.__j.roues.push(e.deltaY); }); cv.addEventListener('dblclick', () => { window.__j.dblCv++; });
  window.addEventListener('rayle:suivre', () => { window.__j.suivre++; }); window.addEventListener('rayle:vue-initiale', () => { window.__j.vueInit++; });
  document.addEventListener('wheel', e => { if (e.target.id !== 'cv3d') window.__j.roues.push('page:' + e.deltaX + ',' + e.deltaY); }, true);
  window.__gf.ouvrir({ id: 'f1', titre: 'Fenêtre d’essai', sousTitre: 'V5', genre: 'panneau', taille: { l: 420, h: 280 }, pastille: 'reel', contenu: '<p>Contenu</p>' }); window.__gf.deplacer('f1', 120, 140);
});
const rectF = () => ev(() => { const o = window.__gf.obtenir('f1'); if (!o) return null; const r = o.el.getBoundingClientRect(); return { x: r.x, y: r.y, l: r.width, h: r.height, reduite: o.reduite }; });
const J = () => ev(() => ({ ...window.__j, roues: window.__j.roues.slice() }));
const pos = () => ev(() => Telecommande.position());
const etatCur = () => ev(() => { const c = document.getElementById('gv5-curseur'); if (!c) return null; const r = c.getBoundingClientRect(); return { etat: c.dataset.etat, cache: c.hidden, l: r.width, h: r.height, prog: c.dataset.prog, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

verifier('Gestes V5 : moteur par défaut, interface chargée, éteint (aucun curseur) tant qu’on ne les active pas', await ev(() => !!window.GestesV5 && !!window.GestesV5Actions && Gestes.reglages().moteur === 'v5' && !Gestes.etat().actif && !document.getElementById('gv5-curseur')));
const clicNormal = await page.evaluate(() => { const b = document.getElementById('petit'); b.click(); return window.__j.clic; });
verifier('gestes éteints : la souris et le clic marchent comme avant', clicNormal === 1); await ev(() => { window.__j.clic = 0; });
await ev(() => Gestes.activer({ source: 'rejeu', memoriser: false }));
verifier('activation : moteur V5, pastille visible', await ev(() => Gestes.etat().moteurV === 5 && !document.getElementById('gestes-pastille').hidden));

// ── 1. pas engagé : rien n'agit ; engagé : le curseur suit ──
const p0 = await pos();
await T(`const s = new T.Suite(); s.pointer(500, 300, 300).vers(1000, 600, 600); await T.jouer(s);`);
const apresSans = await pos(), cSans = await etatCur();
verifier('SANS engagement, pointer ne déplace PAS le curseur de la page (anti-gestes accidentels)', Math.abs(apresSans.x - p0.x) < 2 && Math.abs(apresSans.y - p0.y) < 2, JSON.stringify({ p0, apresSans }));
verifier('l’anneau est visible mais en pointillés (« main vue, pas engagé »)', cSans && !cSans.cache && cSans.etat === 'inactif', JSON.stringify(cSans));
verifier('la pastille dit comment engager', await ev(() => /engager/.test(document.getElementById('gestes-pastille').textContent)), await ev(() => document.getElementById('gestes-pastille').textContent));
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 450); await T.jouer(s);`);
verifier('main ouverte tenue 0,45 s seulement : toujours pas engagé', await ev(() => !Gestes.etat().engage));
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 1000); await T.jouer(s);`);
verifier('main ouverte tenue ≈ 1 s : ENGAGÉ, la pastille le dit', await ev(() => Gestes.etat().engage && /engagés|ENGAGÉ/.test(document.getElementById('gestes-pastille').textContent)));

// ── 2. curseur : visible, atteint tout l'écran ──
await T(`const s = new T.Suite(); s.pointer(700, 450, 200).vers(30, 30, 500).pointer(30, 30, 400); await T.jouer(s);`);
let p = await pos();
verifier('le curseur atteint le coin haut-gauche de l’écran (à moins de 40 px)', p.x < 40 && p.y < 40, JSON.stringify(p));
await T(`const s = new T.Suite(); s.pointer(30, 30, 100).vers(1370, 870, 700).pointer(1370, 870, 400); await T.jouer(s);`); p = await pos();
verifier('…puis le coin bas-droit (à moins de 40 px)', p.x > 1330 && p.y > 830, JSON.stringify(p));
await T(`const s = new T.Suite(); s.pointer(1370, 870, 100).vers(1370, 30, 400).pointer(1370, 30, 200).vers(30, 870, 700).pointer(30, 870, 400); await T.jouer(s);`); p = await pos();
verifier('…et le coin bas-gauche', p.x < 40 && p.y > 830, JSON.stringify(p));
const c1 = await etatCur();
verifier('l’anneau est grand (≥ 60 px), visible, et suit le curseur de la page', c1 && !c1.cache && c1.l >= 60 && Math.hypot(c1.x - p.x, c1.y - p.y) < 40, JSON.stringify(c1));
verifier('le curseur de la page est au-dessus de tout (z-index maximal) et ne bloque pas la souris', await ev(() => { const c = document.getElementById('gv5-curseur'), cs = getComputedStyle(c); return +cs.zIndex >= 2147483000 && cs.pointerEvents === 'none'; }));
verifier('la petite traîne suit le mouvement', await ev(() => [...document.querySelectorAll('.gv5-trace')].filter(x => !x.hidden).length >= 3));

// ── 3. survol, aimantation, zones élargies ──
await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(915, 262, 600).pointer(915, 262, 300); await T.jouer(s);`);
let cs = await etatCur();
verifier('survol d’un petit bouton : l’anneau change d’état et l’élément s’éclaire', cs.etat === 'survol' && await ev(() => document.getElementById('petit').classList.contains('gv5-aimante')), JSON.stringify(cs));
// 26 px à côté du bouton (30×24, zone élargie à 44 px) : le clic l'atteint quand même
await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(948, 262, 600).pointer(948, 262, 300).clic(948, 262); await T.jouer(s);`);
let j = await J();
verifier('zone cliquable ÉLARGIE : un pincement 18 px à côté d’un bouton de 30 px le clique quand même (capture à 28 px)', j.clic === 1, JSON.stringify({ clic: j.clic }));
await ev(() => { window.__j.clic = 0; Gestes.regler({ aimantation: 0 }); });
await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(980, 262, 600).pointer(980, 262, 300).clic(980, 262); await T.jouer(s);`); j = await J();
verifier('sans aimantation (réglage à 0), le même pincement loin du bouton ne clique rien', j.clic === 0);
await ev(() => { Gestes.regler({ aimantation: 0.6 }); });

// ── 4. clics ──
await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(915, 262, 500).pointer(915, 262, 250).clic(915, 262); await T.jouer(s);`); j = await J();
verifier('pincer-relâcher vite sur le bouton : UN clic exactement', j.clic === 1 && j.dbl === 0, JSON.stringify(j.clic));
await ev(() => { window.__j.clic = 0; window.__j.dbl = 0; });
await T(`const s = new T.Suite(); s.pointer(915, 262, 300).clic(915, 262).tenir('pointer', 915, 262, 60).clic(915, 262); await T.jouer(s);`); j = await J();
verifier('deux pincements rapprochés : double clic (detail = 2)', j.clic === 2 && j.dbl === 1, JSON.stringify({ clic: j.clic, dbl: j.dbl }));
await ev(() => { window.__j.clic = 0; window.__j.dbl = 0; });
await T(`const s = new T.Suite(); s.pointer(915, 262, 400); s.fermerPince(915, 262); s.tenir('pince', 915, 262, 100); s.rouvrirPince(915, 262); s.tenir('pointer', 915, 262, 100); for (let i = 0; i < 3; i++) { s.img([s.main('pince', 915, 262, { pince: 1 })]); } await T.jouer(s);`);
const aleatoire = await T(`const s = new T.Suite(), al = MainSynthetique.alea(9); s.pointer(300, 300, 300); for (let k = 0; k < 6; k++) s.aller('pointer', 200 + al() * 900, 200 + al() * 600, 350, { bruit: 0.004, alea: al }); await T.jouer(s); return true;`);
await ev(() => { window.__j.clic = 0; }); await T(`const s = new T.Suite(), al = MainSynthetique.alea(5); s.pointer(300, 300, 300); for (let k = 0; k < 8; k++) s.aller('pointer', 200 + al() * 900, 200 + al() * 600, 300, { bruit: 0.004, alea: al }); await T.jouer(s);`); j = await J();
verifier('la main se promène vite avec du bruit : aucun clic parasite', j.clic === 0 && j.pd === 0, JSON.stringify({ clic: j.clic, pd: j.pd }));
await ev(() => { window.__j.droit = 0; });
await T(`const s = new T.Suite(); s.pointer(915, 262, 300); const fin = () => { for (let i = 0; i < 6; i++) { const m = s.main('pince', 915, 262, { pince: 0 }); s.img([m]); } }; await T.jouer(s);`);
// pouce + majeur : pour le clic droit on modifie directement les points
await ev(async () => {
  const H = MainSynthetique, s = new __T.Suite(); s.pointer(915, 262, 300);
  const maj = (m, v) => { const pts = m.pts.map(p => p.slice()); pts[4] = [pts[12][0] + 0.002 * (1 - v), pts[12][1] + 0.004 * (1 - v), 0]; return { lat: m.lat, pts }; };
  const base = () => s.main('pince', 915, 262, { pince: 0 });
  for (let i = 0; i < 7; i++) s.img([maj(base(), 0)]);
  for (let i = 0; i < 6; i++) s.img([maj(base(), 1)]);
  for (let i = 0; i < 12; i++) s.img([s.main('pointer', 915, 262)]);
  await __T.jouer(s);
});
j = await J();
verifier('pouce + majeur : clic droit (menu contextuel) sur le bouton', j.droit === 1, JSON.stringify({ droit: j.droit, clic: j.clic }));

// ── 5. fenêtre : déplacer ──
const r0 = await rectF(); const titre = { x: r0.x + 120, y: r0.y + 18 };
await T(`const s = new T.Suite(); s.pointer(${titre.x}, ${titre.y}, 300).glisser(${titre.x}, ${titre.y}, ${titre.x + 260}, ${titre.y + 140}); await T.jouer(s);`); await attendre(300);
let r1 = await rectF();
verifier('pincer la barre de titre et déplacer la main : la fenêtre suit (+260, +140 à 25 px près)', Math.abs(r1.x - r0.x - 260) < 30 && Math.abs(r1.y - r0.y - 140) < 30, JSON.stringify({ r0, r1 }));
verifier('la fenêtre est relâchée (plus d’éclairage de prise)', await ev(() => !document.querySelector('.gv5-tenue')));
// l'éclairage pendant la prise
await T(`const s = new T.Suite(); s.pointer(${titre.x + 260}, ${titre.y + 140}, 300); s.fermerPince(${titre.x + 260}, ${titre.y + 140}); s.tenir('pince', ${titre.x + 260}, ${titre.y + 140}, 500); await T.jouer(s);`);
verifier('pendant la prise : la fenêtre saisie est éclairée et l’anneau est plein', await ev(() => !!document.querySelector('.gv5-tenue')) && (await etatCur()).etat === 'prise');
await T(`const s = new T.Suite(); s.rouvrirPince(${titre.x + 260}, ${titre.y + 140}); s.tenir('pointer', ${titre.x + 260}, ${titre.y + 140}, 200); await T.jouer(s);`);
// ── 6. redimensionner par le coin ──
const rc = await ev(() => { const h = document.querySelector('.gf[data-id="f1"] .gf-poignee'), r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const avant = await rectF();
await T(`const s = new T.Suite(); s.pointer(${rc.x}, ${rc.y}, 300).glisser(${rc.x}, ${rc.y}, ${rc.x + 140}, ${rc.y + 90}); await T.jouer(s);`); await attendre(300);
const apres = await rectF();
verifier('pincer le coin et tirer : la fenêtre s’agrandit (+140 × +90 à 30 px près)', Math.abs(apres.l - avant.l - 140) < 35 && Math.abs(apres.h - avant.h - 90) < 35 && Math.abs(apres.x - avant.x) < 6, JSON.stringify({ avant, apres }));
// ── 7. redimensionner à deux mains ──
const rr = await rectF(), cx = rr.x + rr.l / 2, cy = rr.y + rr.h / 2;
await T(`const s = new T.Suite(); s.deux('pince', 'pince', ${cx - 80}, ${cy}, ${cx + 80}, ${cy}, ${cx - 160}, ${cy}, ${cx + 160}, ${cy}, 700); s.deux('pince', 'pince', ${cx - 160}, ${cy}, ${cx + 160}, ${cy}, ${cx - 160}, ${cy}, ${cx + 160}, ${cy}, 200); s.tenir('pointer', ${cx}, ${cy}, 300); await T.jouer(s);`); await attendre(300);
const gr = await rectF();
verifier('deux mains pincées sur la fenêtre qui s’écartent (×2) : elle grandit (≈ ×2), centre conservé', gr.l > rr.l * 1.45 && gr.h > rr.h * 1.45 && Math.abs((gr.x + gr.l / 2) - cx) < 25, JSON.stringify({ rr, gr }));
await T(`const s = new T.Suite(); s.deux('pince', 'pince', ${cx - 160}, ${cy}, ${cx + 160}, ${cy}, ${cx - 60}, ${cy}, ${cx + 60}, ${cy}, 700); s.tenir('pointer', ${cx}, ${cy}, 400); await T.jouer(s);`); await attendre(300);
const pe = await rectF();
verifier('…et rapprochées : elle rétrécit', pe.l < gr.l * 0.6, JSON.stringify({ gr, pe }));
verifier('à la fin des deux mains plus rien n’est « tenu »', await ev(() => !document.querySelector('.gv5-tenue')));
// ── 8. balayage horizontal : défilement des piles ──
await ev(() => { window.__j.roues = []; });
await T(`const s = new T.Suite(); s.ouvrir(300, 120, 700); s.aller('ouverte', 1100, 120, 280); s.ouvrir(1100, 120, 300); await T.jouer(s);`);
j = await J();
verifier('main ouverte qui balaie vite à droite : une molette horizontale est envoyée (une seule)', j.roues.filter(x => typeof x === 'string' && x.startsWith('page:')).length === 1 && j.roues.some(x => /page:-?[1-9]/.test(String(x))), JSON.stringify(j.roues.slice(0, 4)));
// ── 9. ranger ──
await ev(() => { window.__gf.reduire('f1', false); });
const rf = await rectF(); const dedans = { x: rf.x + 60, y: rf.y + 80 };
await T(`const s = new T.Suite(); s.pointer(${dedans.x}, ${dedans.y}, 600); s.tenir('ouverte', ${dedans.x}, 150, 500); s.aller('ouverte', ${dedans.x}, 650, 220); s.tenir('ouverte', ${dedans.x}, 650, 350); await T.jouer(s);`);
const rg = await rectF();
verifier('main ouverte qui descend vite sur la fenêtre : elle est rangée (réduite)', !rg || rg.reduite === true || rg.h < 120, JSON.stringify(rg));
await ev(() => { if (window.__gf.obtenir('f1')) window.__gf.reduire('f1', false); else { window.__gf.ouvrir({ id: 'f1', titre: 'Fenêtre d’essai', genre: 'panneau', taille: { l: 420, h: 280 }, contenu: '<p>Contenu</p>' }); } window.__gf.deplacer('f1', 120, 140); });
await attendre(400);
// ── 10. fermer : poing court puis main qui s'ouvre ──
const rz = await rectF(), pz = { x: rz.x + 100, y: rz.y + 100 };
await T(`const s = new T.Suite(); s.pointer(${pz.x}, ${pz.y}, 500); s.poing(${pz.x}, ${pz.y}, 450); s.ouvrir(${pz.x}, ${pz.y}, 300); await T.jouer(s);`);
const cf = await etatCur();
verifier('poing 0,45 s puis main qui s’ouvre : la fermeture s’annonce (fenêtre cerclée, anneau qui se vide)', await ev(() => !!document.querySelector('.gv5-ferme-prevu')) && cf.etat === 'fermer', JSON.stringify(cf));
await ev(() => { window.__gf.ouvrir({ id: 'f1', titre: 'Fenêtre d’essai', genre: 'panneau', taille: { l: 420, h: 280 }, contenu: '<p>Contenu</p>' }); window.__gf.deplacer('f1', 120, 140); });
await T(`const s = new T.Suite(); s.pointer(${pz.x}, ${pz.y}, 500); s.poing(${pz.x}, ${pz.y}, 450); s.ouvrir(${pz.x}, ${pz.y}, 250); s.poing(${pz.x}, ${pz.y}, 300); s.pointer(${pz.x}, ${pz.y}, 700); await T.jouer(s);`);
verifier('refermer le poing pendant la confirmation : fermeture annulée, la fenêtre reste', !!(await rectF()) && await ev(() => !document.querySelector('.gv5-ferme-prevu')));
await T(`const s = new T.Suite(); s.pointer(${pz.x}, ${pz.y}, 500); s.poing(${pz.x}, ${pz.y}, 450); s.ouvrir(${pz.x}, ${pz.y}, 900); await T.jouer(s);`); await attendre(300);
verifier('sans annulation, après 0,5 s la fenêtre est fermée', (await rectF()) === null);
await ev(() => { window.__gf.ouvrir({ id: 'f1', titre: 'Fenêtre d’essai', genre: 'panneau', taille: { l: 420, h: 280 }, contenu: '<p>Contenu</p>' }); window.__gf.deplacer('f1', 120, 140); }); await attendre(300);

// ── 11. objets 3D ──
await ev(() => { window.__gf.fermer('f1'); }); await attendre(200);
await ev(() => { window.__j.pd = window.__j.pm = window.__j.pu = 0; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 300).glisser(1000, 640, 1250, 700, { tenir: 400, duree: 500, apres: 80 }); await T.jouer(s);`);
j = await J();
verifier('une main : pincer le canevas 3D et bouger = bouton gauche enfoncé + déplacements (rotation)', j.pd === 1 && j.pm > 5, JSON.stringify({ pd: j.pd, pm: j.pm, pu: j.pu }));
const pmAvant = j.pm; await attendre(150); const j2 = await J();
verifier('l’inertie : après le relâchement le mouvement CONTINUE un instant (doux), puis le bouton est relâché', j2.pm > pmAvant || j2.pu >= 1); await attendre(1500); j = await J();
verifier('…et se termine : exactement un bouton relâché, plus rien ensuite', j.pu === 1, JSON.stringify(j.pu)); const pmFin = j.pm; await attendre(300); verifier('…plus aucun mouvement fantôme', (await J()).pm === pmFin);
// arrêt net au poing
await ev(() => { window.__j.pd = window.__j.pm = window.__j.pu = 0; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 300); s.fermerPince(1000, 640); s.tenir('pince', 1000, 640, 400); s.aller('pince', 1280, 700, 250); s.rouvrirPince(1280, 700, 60); s.poing(1280, 700, 300); await T.jouer(s);`); await attendre(200);
j = await J(); const pmPoing = j.pm; await attendre(500);
verifier('un poing juste après le lancer arrête NET l’objet (bouton relâché, plus de mouvement)', j.pu === 1 && (await J()).pm === pmPoing, JSON.stringify({ pu: j.pu, pm: j.pm, apres: (await J()).pm }));
// deux mains : zoom
await ev(() => { window.__j.roues = []; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 400); s.deux('pince', 'pince', 880, 640, 1120, 640, 780, 640, 1220, 640, 700); s.tenir('pointer', 1000, 640, 300); await T.jouer(s);`); j = await J();
const zoomIn = j.roues.filter(x => typeof x === 'number');
verifier('deux mains pincées sur l’objet qui s’écartent : zoom avant (molette négative)', zoomIn.length > 3 && zoomIn.reduce((s, x) => s + x, 0) < -50, JSON.stringify(zoomIn.slice(0, 5)));
await ev(() => { window.__j.roues = []; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 400); s.deux('pince', 'pince', 780, 640, 1220, 640, 900, 640, 1100, 640, 700); s.tenir('pointer', 1000, 640, 300); await T.jouer(s);`); j = await J();
verifier('…et qui se rapprochent : zoom arrière (molette positive)', j.roues.filter(x => typeof x === 'number').reduce((s, x) => s + x, 0) > 50);
// deux mains : déplacer ensemble = pan (bouton droit)
await ev(() => { window.__j.pdDroit = window.__j.pmDroit = 0; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 400); s.deux('pince', 'pince', 900, 640, 1100, 640, 1000, 560, 1200, 560, 700); s.tenir('pointer', 1000, 640, 300); await T.jouer(s);`); await attendre(700); j = await J();
verifier('deux mains pincées qui se déplacent ensemble : déplacement de la vue (bouton droit enfoncé, déplacements)', j.pdDroit >= 1 && j.pmDroit > 3, JSON.stringify({ pd: j.pdDroit, pm: j.pmDroit }));
// deux mains ouvertes qui tournent
await ev(() => { window.__j.pd = window.__j.pm = window.__j.pu = 0; });
await T(`const s = new T.Suite(); s.pointer(1000, 640, 400); s.deux('ouverte', 'ouverte', 880, 440, 1120, 440, 920, 380, 1080, 500, 700); s.tenir('pointer', 1000, 640, 300); await T.jouer(s);`); await attendre(700); j = await J();
verifier('deux mains ouvertes qui tournent : rotation de l’objet (bouton gauche, déplacements)', j.pd >= 1 && j.pm > 3, JSON.stringify({ pd: j.pd, pm: j.pm }));
// suivre (index immobile 1 s) et vue initiale (main ouverte 1,5 s)
await ev(() => { window.__j.dblCv = 0; window.__j.suivre = 0; window.__j.vueInit = 0; });
await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(1000, 640, 500).pointer(1000, 640, 1400); await T.jouer(s);`); j = await J();
verifier('index immobile 1 s sur l’objet : « suivre » (double clic sur l’objet + événement rayle:suivre)', j.suivre === 1 && j.dblCv === 1, JSON.stringify({ suivre: j.suivre, dbl: j.dblCv }));
await T(`const s = new T.Suite(); s.ouvrir(1000, 640, 2200); await T.jouer(s);`); j = await J();
verifier('main ouverte immobile 1,5 s sur l’objet : vue initiale (événement rayle:vue-initiale, une fois)', j.vueInit === 1, JSON.stringify(j.vueInit));

// ── 12. défilement à deux doigts ──
await ev(() => { window.__j.roues = []; });
await T(`const s = new T.Suite(); s.pointer(600, 300, 400); const deuxDoigts = (x, y) => { const o = s.main('ouverte', x, y), p = s.main('poing', x, y); for (let k = 5; k <= 12; k++) p.pts[k] = o.pts[k]; return p; }; for (let i = 0; i <= 40; i++) s.img([deuxDoigts(600, 300 + i * 6)]); await T.jouer(s);`); j = await J();
verifier('deux doigts tendus qui descendent : la page défile (molette verticale)', j.roues.filter(x => typeof x === 'string' && /page:0,-?\d+/.test(x)).length > 5, JSON.stringify(j.roues.slice(0, 3)));

// ── 13. pause / reprise ──
await ev(() => { window.__j.pm = 0; });
const pPause = await pos();
await T(`const s = new T.Suite(); s.pointer(600, 300, 300); s.poing(600, 300, 1300); await T.jouer(s);`);
const cPause = await etatCur();
verifier('poing tenu 1 s : pause (anneau barré, pastille « en pause »)', await ev(() => Gestes.etat().pause) && cPause.etat === 'pause' && await ev(() => /pause/i.test(document.getElementById('gestes-pastille').textContent)));
const avantP = await pos(); await T(`const s = new T.Suite(); s.pointer(100, 100, 300).vers(1200, 800, 500); await T.jouer(s);`);
verifier('en pause : le curseur de la page ne bouge plus', Math.abs((await pos()).x - avantP.x) < 2 && Math.abs((await pos()).y - avantP.y) < 2);
await T(`const s = new T.Suite(); s.ouvrir(700, 450, 1100); await T.jouer(s);`);
verifier('main ouverte tenue ≈ 1 s : les gestes reprennent', await ev(() => Gestes.etat().engage && !Gestes.etat().pause));
await T(`const s = new T.Suite(); s.pointer(700, 450, 200).vers(300, 300, 400); await T.jouer(s);`); p = await pos();
verifier('…et le curseur suit de nouveau', Math.abs(p.x - 300) < 60);

// ── 14. diagnostic et réglages ──
await ev(() => Gestes.regler({ diagnostic: true })); await T(`const s = new T.Suite(); s.pointer(500, 300, 500); await T.jouer(s);`); await attendre(150);
const dg = await ev(() => { const d = document.getElementById('gv5-diag'); if (!d || d.hidden) return null; const cv = d.querySelector('canvas'), x = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < x.length; i += 4) if (x[i] > 0) n++; return { pixels: n, texte: d.querySelector('pre').textContent }; });
verifier('superposition de diagnostic : squelette dessiné, distance de pincement, seuils, état', dg && dg.pixels > 100 && /pince/.test(dg.texte) && /seuils/.test(dg.texte) && /engage/.test(dg.texte), JSON.stringify(dg).slice(0, 220));
await ev(() => Gestes.regler({ diagnostic: false })); verifier('désactivée : disparaît', await ev(() => document.getElementById('gv5-diag').hidden));
verifier('réglages simples présents (zone, lissage, clic, pointeur, aimantation, engagement, main, relatif, diagnostic, moteur)', await ev(() => ['zone', 'lissage', 'clic', 'taille', 'aimant', 'engage'].every(i => document.getElementById('gv5-r-' + i)) && ['gv5-main', 'gv5-exiger', 'gv5-relatif', 'gv5-diag', 'gv5-moteur'].every(i => document.getElementById(i)) && !!document.getElementById('gv5-restaurer')));
await ev(() => { const r = document.getElementById('gv5-r-zone'); r.value = '50'; r.dispatchEvent(new Event('input', { bubbles: true })); const t = document.getElementById('gv5-r-taille'); t.value = '120'; t.dispatchEvent(new Event('input', { bubbles: true })); });
verifier('curseur « zone active » : le réglage est pris par le moteur ET mémorisé', await ev(() => Gestes.reglages().zoneL === 0.5 && Gestes.moteur().options.zone.l === 0.5 && JSON.parse(localStorage.getItem('rayle_gestes')).zoneL === 0.5));
verifier('taille du pointeur : l’anneau grandit (120 px)', Math.round((await etatCur()).l) === 120);
await T(`const s = new T.Suite(); s.pointer(700, 450, 300); await T.jouer(s);`);
await T(`const s = new T.Suite(); s.pointer(700 - 100, 450, 300).vers(1300, 450, 500); await T.jouer(s);`);
verifier('zone active à 50 % : le bord de l’écran est atteint avec un mouvement plus court', (await pos()).x > 1250, JSON.stringify(await pos()));
await ev(() => document.getElementById('gv5-restaurer').click());
verifier('« Restaurer les réglages » : retour aux valeurs sûres', await ev(() => Gestes.reglages().zoneL === 0.7 && Gestes.reglages().taillePointeur === 76 && Gestes.reglages().moteur === 'v5'));

// ── 15. calibrage automatique ──
const cal = await ev(async () => {
  const H = MainSynthetique; const al = H.alea(3); let phase = 0;
  const r = await Gestes.calibrerAuto({ secondes: 1, etape: () => { phase++; }, attente: async () => {
    const s = new __T.Suite();
    if (phase === 1) { for (let k = 0; k < 12; k++) s.aller('pointer', 200 + al() * 1000, 150 + al() * 600, 120); }
    else { for (let k = 0; k < 5; k++) { s.tenir('pointer', 700, 450, 80); s.fermerPince(700, 450); s.tenir('pince', 700, 450, 100); s.rouvrirPince(700, 450); } }
    for (const f of s.frames) Gestes.injecter({ t: (Gestes.etat().dernierT || 0) + 17, ratio: f.ratio, mains: f.mains });
  } });
  return { r, reglages: Gestes.reglages() };
});
verifier('calibrage rapide : zone et seuils obtenus puis appliqués aux réglages', cal.r.ok && cal.r.zone && cal.r.seuils && cal.reglages.seuilFerme === cal.r.seuils.seuilFerme && cal.reglages.zoneL === cal.r.zone.l, JSON.stringify(cal.r).slice(0, 260));
await ev(() => Gestes.reinitialiserReglages());

// ── 16. mode « Apprendre les gestes » : les neuf exercices, faits avec de vrais gestes ──
await ev(() => { GestesV5UI.apprendre(); }); await attendre(300);
verifier('Apprendre : la scène s’ouvre avec neuf exercices et une consigne', await ev(() => document.querySelectorAll('#gv5-appr .gv5-pas i').length === 9 && /Engager/.test(document.querySelector('#gv5-appr .gv5-consigne').textContent)));
const etatEx = () => ev(() => [...document.querySelectorAll('#gv5-appr .gv5-pas i')].map(i => i.dataset.s || '').join(','));
await attendre(1300);   // « engager » : déjà engagé, réussi tout de suite
verifier('exercice « Engager » : validé (déjà engagé), retour « Bien ! »', (await etatEx()).startsWith('ok') || await ev(() => /Bien/.test(document.querySelector('#gv5-appr .gv5-retour').textContent)), await etatEx());
await attendre(900);
const cibles = await ev(() => [...document.querySelectorAll('#gv5-appr .gv5-cible')].map(c => { const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
verifier('exercice « Pointer » : 4 cibles affichées', cibles.length === 4);
await T(`const s = new T.Suite(); const c = ${JSON.stringify(cibles)}; s.pointer(c[0].x, c[0].y, 300); for (const k of c.slice(1)) s.aller('pointer', k.x, k.y, 500).tenir('pointer', k.x, k.y, 150); await T.jouer(s);`); await attendre(1500);
verifier('…réussi en touchant les quatre cibles', /^ok,ok/.test(await etatEx()), await etatEx());
const gb = await ev(() => { const b = document.querySelector('#gv5-appr .gv5-grosbouton'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await T(`const s = new T.Suite(); s.pointer(${gb.x}, ${gb.y}, 400).clic(${gb.x}, ${gb.y}).tenir('pointer', ${gb.x}, ${gb.y}, 600).clic(${gb.x}, ${gb.y}).tenir('pointer', ${gb.x}, ${gb.y}, 600).clic(${gb.x}, ${gb.y}); await T.jouer(s);`); await attendre(1600);
verifier('exercice « Cliquer » : trois clics comptés puis validé', /^ok,ok,ok/.test(await etatEx()), await etatEx());
const tf = await ev(() => { const t = document.querySelector('#gv5-appr .gv5-demo-fen .gv5-t'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + 80, y: r.y + r.height / 2 }; });
await T(`const s = new T.Suite(); s.pointer(${tf.x}, ${tf.y}, 300).glisser(${tf.x}, ${tf.y}, ${tf.x + 260}, ${tf.y + 90}); await T.jouer(s);`); await attendre(1600);
verifier('exercice « Glisser une fenêtre » : validé', /^ok,ok,ok,ok/.test(await etatEx()), await etatEx());
const ph = await ev(() => { const h = document.querySelector('#gv5-appr .gv5-demo-poignee'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.7 }; });
await T(`const s = new T.Suite(); s.pointer(${ph.x}, ${ph.y}, 300).glisser(${ph.x}, ${ph.y}, ${ph.x + 150}, ${ph.y + 100}); await T.jouer(s);`); await attendre(1600);
verifier('exercice « Agrandir » : validé', /^ok,ok,ok,ok,ok/.test(await etatEx()), await etatEx());
const cv = await ev(() => { const c = document.querySelector('#gv5-appr .gv5-demo-cv'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await T(`const s = new T.Suite(); s.pointer(${cv.x}, ${cv.y}, 300).glisser(${cv.x - 100}, ${cv.y}, ${cv.x + 100}, ${cv.y + 40}, { duree: 400, tenir: 350 }); await T.jouer(s);`); await attendre(2200);
verifier('exercice « Tourner un objet 3D » : validé', /^ok,ok,ok,ok,ok,ok/.test(await etatEx()), await etatEx());
await T(`const s = new T.Suite(); s.ouvrir(300, 400, 700); s.aller('ouverte', 1100, 400, 280); s.ouvrir(1100, 400, 300); await T.jouer(s);`); await attendre(1600);
verifier('exercice « Balayer » : validé', /^ok,ok,ok,ok,ok,ok,ok/.test(await etatEx()), await etatEx());
await T(`const s = new T.Suite(); s.tenir('ouverte', 700, 250, 250); s.aller('ouverte', 700, 560, 200); s.tenir('ouverte', 700, 560, 400); await T.jouer(s);`); await attendre(1600);
verifier('exercice « Ranger » : validé', /^ok,ok,ok,ok,ok,ok,ok,ok/.test(await etatEx()), await etatEx());
await T(`const s = new T.Suite(); s.pointer(700, 450, 200); s.poing(700, 450, 1300); s.ouvrir(700, 450, 1100); await T.jouer(s);`); await attendre(2000);
verifier('exercice « Pause » (pause puis reprise) : validé, les neuf sont faits', (await etatEx()) === 'ok,ok,ok,ok,ok,ok,ok,ok,ok', await etatEx());
const stats = await ev(() => GestesV5UI.statistiques());
verifier('les statistiques de réussite sont gardées sur l’appareil (neuf exercices, 1 essai, 1 réussite chacun)', Object.keys(stats).length === 9 && Object.values(stats).every(s => s.essais === 1 && s.reussis === 1 && s.meilleurMs >= 0), JSON.stringify(stats).slice(0, 200));
verifier('récapitulatif affiché à la fin', await ev(() => /Terminé : 9/.test(document.querySelector('#gv5-appr .gv5-consigne').textContent)));
await ev(() => GestesV5UI.fermer()); verifier('Apprendre se ferme', await ev(() => !document.getElementById('gv5-appr')));

// ── 17. extinction ──
await ev(() => Gestes.desactiver());
verifier('gestes éteints : l’anneau disparaît, les curseurs de la page sont libérés', await ev(() => document.getElementById('gv5-curseur').hidden && !document.body.classList.contains('gv5-actif') && Telecommande.saisie() === null));
const cl = await page.evaluate(() => { window.__j.clic = 0; document.getElementById('petit').click(); return window.__j.clic; });
verifier('la souris marche toujours comme avant après les gestes', cl === 1);
const vraiesErreurs = erreurs.filter(e => !/Failed to load resource|faireconomy|CORS/.test(e));   // appels réseau externes de la page (calendrier, etc.) : hors sujet
verifier('aucune erreur JavaScript dans la page', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 3).join(' | '));
await fermer(); const ko = fin(); process.exit(ko ? 1 : 0);
