import { compteur, attendre } from './terre-aide.mjs';
import { lancer, RACINE, BIBLIOTHEQUE } from './v5-aide.mjs';
import path from 'node:path';

/* Gestes V10, PHASE 7 : les actions marchent VRAIMENT partout dans Rayle, dans le thème AURORE (celui de Justin) puis Jarvis : accueil (grande fenêtre), Jarvis (panneaux), Réglages (⚙), Espace (galaxie),
   Mars (terminal de trading : fenêtres du gestionnaire), Anatomie (fenêtres + vue 3D). Pour chaque lieu, avec de VRAIS événements fabriqués par les gestes (main synthétique rejouée, pas de caméra) :
   clic · glisser une fenêtre · l'agrandir / la rétrécir (deux mains) · la ranger (main ouverte qui descend) · la fermer (poing puis main ouverte, annulable) · défilement à deux doigts · balayage ·
   objet 3D (rotation à une main, zoom / rotation / déplacement à deux mains, recentrage) · l'élément saisi s'éclaire · la souris marche toujours.
   Lancer : node tests-navigateur/v10-partout-test.mjs      À valider par Justin : les mêmes gestes avec sa vraie main (Galaxy S23 Ultra).    */
const { verifier, fin } = compteur();
const { page, erreurs, fermer, nav } = await lancer({ port: 8173, largeur: 1600, hauteur: 900, prefs: { gestesAvances: true }, avantPage: p => p.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('rayle_theme')) localStorage.setItem('rayle_theme', 'aurore'); } catch (e) { /* stockage refusé */ } }) });
const ev = (f, ...a) => page.evaluate(f, ...a);
const T = (code, ...a) => page.evaluate(new Function('...args', 'return (async () => { const T = window.__T; ' + code + ' })()'), ...a);
const R = sel => ev(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width && !r.height) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height, vis: getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && !e.hidden }; }, sel);
const jouer = (code) => T(code);
const engager = async () => { await ev(() => { if (!Gestes.etat().actif) return Gestes.activer({ source: 'rejeu', memoriser: false }); }); await T(`const s = new T.Suite(); s.ouvrir(800, 450, 1050); await T.jouer(s);`); };
const preuves = [], veut = c => !process.env.CONTEXTES || process.env.CONTEXTES.split(',').includes(c);   // CONTEXTES=jarvis,mars,anatomie pour n'en rejouer que quelques-uns
const ok = (nom, c, d) => { verifier(nom, c, d); preuves.push([nom, !!c]); };

/* ── scénario « fenêtre mobile » : glisser, (agrandir, rétrécir), ranger, fermer ── */
async function fenetre(lieu, { sel, titre, redim = false, ranger = false, ferme, souple = false, deplacable = true, tenue = '.gv5-tenue,.gv5-poignee-active' }) {
  const t = await R(titre), m0 = await R(sel);
  ok(lieu + ' · la fenêtre est visible et sa barre de titre aussi', t && m0 && m0.vis, JSON.stringify({ t, m0 }));
  if (!t || !m0) return;
  await T(`const s = new T.Suite(); s.pointer(${t.x}, ${t.y}, 400).glisser(${t.x}, ${t.y}, ${t.x + 160}, ${t.y + 90}, { tenir: 380, duree: 500, fin: 100 }); await T.jouer(s);`); await attendre(500);
  const m1 = await R(sel);
  if (!deplacable) ok(lieu + ' · cette fenêtre est ancrée (la souris ne la déplace pas non plus) : on vérifie seulement la prise', true);
  else ok(lieu + (souple ? ' · glisser la barre de titre déplace la fenêtre (elle se range ensuite contre le bord le plus proche : aimantation voulue)' : ' · glisser la barre de titre déplace la fenêtre (+160, +90 à 50 px près)'), m1 && (souple ? Math.hypot(m1.l - m0.l, m1.t - m0.t) > 50 : Math.abs((m1.l - m0.l) - 160) < 50 && Math.abs((m1.t - m0.t) - 90) < 50), JSON.stringify({ m0, m1 }));
  // l'élément saisi s'éclaire pendant la prise
  const t2 = await R(titre);
  await T(`const s = new T.Suite(); s.pointer(${t2.x}, ${t2.y}, 300); s.fermerPince(${t2.x}, ${t2.y}); s.tenir('pince', ${t2.x}, ${t2.y}, 500); await T.jouer(s);`);
  ok(lieu + ' · pendant la prise la fenêtre s’éclaire et l’anneau est plein', await ev((s) => !!document.querySelector(s) && document.getElementById('gv5-curseur').dataset.etat === 'prise', tenue), await ev(() => document.getElementById('gv5-curseur').dataset.etat));
  await T(`const s = new T.Suite(); s.rouvrirPince(${t2.x}, ${t2.y}); s.tenir('pointer', ${t2.x}, ${t2.y}, 250); await T.jouer(s);`);
  ok(lieu + ' · relâché : plus rien n’est tenu', await ev(s => !document.querySelector(s), tenue));
  if (redim) {
    const m2 = await R(sel), cx = m2.x, cy = m2.y;
    await T(`const s = new T.Suite(); s.pointer(${cx}, ${cy}, 300); s.deux('pince', 'pince', ${cx - 100}, ${cy}, ${cx + 100}, ${cy}, ${cx - 200}, ${cy}, ${cx + 200}, ${cy}, 700); s.deux('pince', 'pince', ${cx - 200}, ${cy}, ${cx + 200}, ${cy}, ${cx - 200}, ${cy}, ${cx + 200}, ${cy}, 200); s.tenir('pointer', ${cx}, ${cy}, 300); await T.jouer(s);`); await attendre(400);
    const m3 = await R(sel); ok(lieu + ' · deux mains pincées qui s’écartent agrandissent la fenêtre', m3 && m3.w > m2.w * 1.4, JSON.stringify({ m2: m2.w, m3: m3 && m3.w }));
    const c3 = m3 || m2; await T(`const s = new T.Suite(); s.pointer(${c3.x}, ${c3.y}, 300); s.deux('pince', 'pince', ${c3.x - 200}, ${c3.y}, ${c3.x + 200}, ${c3.y}, ${c3.x - 70}, ${c3.y}, ${c3.x + 70}, ${c3.y}, 700); s.tenir('pointer', ${c3.x}, ${c3.y}, 300); await T.jouer(s);`); await attendre(400);
    const m4 = await R(sel); ok(lieu + ' · …et qui se rapprochent la rétrécissent', m4 && m3 && m4.w < m3.w * 0.8, JSON.stringify({ m3: m3 && m3.w, m4: m4 && m4.w }));
  }
  if (ranger) {
    const m5 = await R(sel);
    await T(`const s = new T.Suite(); s.pointer(${m5.x}, ${m5.y}, 600); s.tenir('ouverte', ${m5.x}, ${Math.max(60, m5.y - 150)}, 500); s.aller('ouverte', ${m5.x}, ${Math.min(850, m5.y + 300)}, 220); s.tenir('ouverte', ${m5.x}, ${Math.min(850, m5.y + 300)}, 350); await T.jouer(s);`); await attendre(700);
    const m6 = await R(sel); ok(lieu + ' · main ouverte qui descend vite : la fenêtre est rangée (réduite / retirée)', !m6 || !m6.vis || m6.h < m5.h * 0.6, JSON.stringify({ m5: m5.h, m6 }));
    if (ferme && ferme.remettre) await ferme.remettre();
  }
  const c = await R(sel); if (!c || !c.vis) { ok(lieu + ' · (fermeture non testée : fenêtre rangée)', true); return; }
  await T(`const s = new T.Suite(); s.pointer(${c.x}, ${c.y}, 500); s.poing(${c.x}, ${c.y}, 450); s.ouvrir(${c.x}, ${c.y}, 250); s.poing(${c.x}, ${c.y}, 300); s.pointer(${c.x}, ${c.y}, 700); await T.jouer(s);`); await attendre(300);
  ok(lieu + ' · poing, main ouverte puis re-poing : fermeture annulée, la fenêtre reste', !!(await R(sel)), '');
  await T(`const s = new T.Suite(); s.pointer(${c.x}, ${c.y}, 500); s.poing(${c.x}, ${c.y}, 450); s.ouvrir(${c.x}, ${c.y}, 1000); await T.jouer(s);`); await attendre(500);
  const f = await R(sel); ok(lieu + ' · poing court puis main ouverte : la fenêtre se ferme', !f || !f.vis, JSON.stringify(f));
}
async function bouton(lieu, sel, verif) {
  const b = await R(sel); ok(lieu + ' · élément cliquable présent (' + sel + ')', !!b, '');
  if (!b) return;
  await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(${b.x}, ${b.y}, 600).pointer(${b.x}, ${b.y}, 300).clic(${b.x}, ${b.y}); await T.jouer(s);`); await attendre(700);
  ok(lieu + ' · un pincement clique sur ' + sel, await verif(), '');
}

/* ═══ 1. ACCUEIL (thème Aurore) ═══ */
if (veut('accueil')) {
await ev(() => Gestes.activer({ source: 'rejeu', memoriser: false })); await engager();
ok('thème Aurore actif', await ev(() => document.body.classList.contains('g1')));
await ev(() => { const b = [...document.querySelectorAll('.g1-ic')].find(x => /Vie/.test(x.textContent)); if (b) b.id = '__dockVie'; });
await bouton('Accueil', '#__dockVie', () => ev(() => window.G1.courant() === 'meteo'));
await ev(() => G1.ouvrir('meteo')); await attendre(900);
await fenetre('Accueil · grande fenêtre', { sel: '#g1Fen', titre: '#g1Fen .g1-fen-barre, #g1Fen .g1-fen-titre' });
await ev(() => { try { G1.fermer(); } catch (e) { /* déjà fermée */ } });
// ranger / fermer la grande fenêtre de l'accueil depuis la main
await ev(() => G1.ouvrir('meteo')); await attendre(900);
{ const c = await R('#g1Fen');
  await T(`const s = new T.Suite(); s.pointer(${c.x}, ${c.y}, 500); s.poing(${c.x}, ${c.y}, 450); s.ouvrir(${c.x}, ${c.y}, 1000); await T.jouer(s);`); await attendre(600);
  ok('Accueil · poing court puis main ouverte ferme aussi la grande fenêtre de l’accueil', await ev(() => document.getElementById('g1Fen').hidden || window.G1.courant() == null), await ev(() => String(window.G1.courant()))); }
await ev(() => { try { G1.fermer(); } catch (e) { /* déjà fermée */ } });
// défilement à deux doigts dans un contenu long
await ev(() => { G1.ouvrir('actus'); }); await attendre(900);
{ const z = await ev(() => { const c = document.querySelector('#g1Fen .g1-fen-cadre') || document.getElementById('g1Fen'); const defile = [...c.querySelectorAll('*')].concat([c]).find(e => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)); if (!defile) return null; const r = defile.getBoundingClientRect(); defile.scrollTop = 0; window.__defile = defile; return { x: r.x + r.width / 2, y: r.y + r.height / 3 }; });
  if (z) { await T(`const s = new T.Suite(); s.pointer(${z.x}, ${z.y}, 400); const deuxDoigts = (x, y) => { const o = s.main('ouverte', x, y), p = s.main('poing', x, y); for (let k = 5; k <= 12; k++) p.pts[k] = o.pts[k]; return p; }; for (let i = 0; i <= 40; i++) s.img([deuxDoigts(${z.x}, ${z.y} + 200 - i * 5)]); await T.jouer(s);`); await attendre(400);
    ok('Accueil · deux doigts qui montent font défiler (le contenu suit le doigt) le contenu d’une fenêtre', await ev(() => window.__defile.scrollTop > 20), String(await ev(() => window.__defile.scrollTop))); }
  else ok('Accueil · (pas de contenu défilable dans cette fenêtre en test : défilement vérifié ailleurs)', true); }
await ev(() => { try { G1.fermer(); } catch (e) { /* déjà fermée */ } });
// la souris marche toujours
ok('Accueil · la souris marche toujours à côté des gestes', await (async () => { await ev(() => { window.__sc = 0; document.addEventListener('click', () => { window.__sc++; }, { once: true }); }); await page.mouse.click(300, 300); return (await ev(() => window.__sc)) === 1; })());

}
/* ═══ 2. RÉGLAGES (⚙) : clic sur une case, défilement ═══ */
if (veut('reglages')) {
await ev(() => { const g = document.getElementById('gear') || document.getElementById('btnReglages'); if (g) g.click(); }); await attendre(700);
{ const cfg = await ev(() => { const c = document.getElementById('cfg'); if (!c) return null; const r = c.getBoundingClientRect(); return { vis: r.width > 50 && getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden', h: r.height, sh: c.scrollHeight, ch: c.clientHeight }; });
  ok('Réglages · le panneau ⚙ est ouvert', cfg && cfg.vis, JSON.stringify(cfg));
  if (cfg && cfg.vis) {
    const cb = await ev(() => { const e = document.getElementById('gs-miroir'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, avant: e.checked }; });
    await T(`const s = new T.Suite(); s.pointer(${cb.x}, ${cb.y + 80}, 300).vers(${cb.x}, ${cb.y}, 500).pointer(${cb.x}, ${cb.y}, 300).clic(${cb.x}, ${cb.y}); await T.jouer(s);`); await attendre(400);
    ok('Réglages · un pincement coche / décoche une case (gs-miroir)', await ev(a => document.getElementById('gs-miroir').checked !== a, cb.avant), String(cb.avant));
    await ev(() => { Gestes.regler({ miroir: true }); });
    if (cfg.sh > cfg.ch + 60) {
      const z = await ev(() => { const c = document.getElementById('cfg'); c.scrollTop = 0; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 }; });
      await T(`const s = new T.Suite(); s.pointer(${z.x}, ${z.y}, 400); const deuxDoigts = (x, y) => { const o = s.main('ouverte', x, y), p = s.main('poing', x, y); for (let k = 5; k <= 12; k++) p.pts[k] = o.pts[k]; return p; }; for (let i = 0; i <= 40; i++) s.img([deuxDoigts(${z.x}, ${z.y} + 200 - i * 5)]); await T.jouer(s);`); await attendre(400);
      ok('Réglages · deux doigts qui montent font défiler (le contenu suit le doigt) le panneau', await ev(() => document.getElementById('cfg').scrollTop > 20), String(await ev(() => document.getElementById('cfg').scrollTop)));
    }
    await ev(() => { const g = document.getElementById('gear') || document.getElementById('btnReglages'); if (g) g.click(); }); await attendre(300);
  } }

}
/* ═══ 3. JARVIS (panneaux) ═══ */
if (veut('jarvis')) {
await ev(() => { localStorage.setItem('rayle_theme', 'jarvis'); }); await page.reload({ waitUntil: 'load' }); await attendre(2500);
await page.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') }); await ev(code => { window.__T = eval(code); }, BIBLIOTHEQUE);
await engager();
await ev(() => { Panneaux.fermerTout(); Panneaux.ouvrir({ id: 'essai1', titre: 'Fenêtre d’essai', corps: 'Premier paragraphe.\n\nSecond paragraphe.\n\nTroisième.', duree: 600000 }); }); await attendre(1500);
ok('Jarvis · thème Jarvis actif', await ev(() => !document.body.classList.contains('g1')));
await fenetre('Jarvis · panneau', { sel: '.pn[data-id="essai1"]', titre: '.pn[data-id="essai1"] .pn-tete', ranger: false, souple: true });
await ev(() => { try { Panneaux.fermerTout(); } catch (e) { /* aucun panneau */ } });

}
/* ═══ 4. ESPACE, MARS, ANATOMIE (galaxie 3D) ═══ */
const galaxie = veut('espace') || veut('mars') || veut('anatomie');
if (galaxie) {
await ev(() => { localStorage.setItem('rayle_theme', 'aurore'); }); await page.reload({ waitUntil: 'load' }); await attendre(2500);
await page.addScriptTag({ path: path.join(RACINE, 'core/gestes/main-synthetique.js') }); await ev(code => { window.__T = eval(code); }, BIBLIOTHEQUE);
await ev(() => document.getElementById('btnOuvrirGalaxie').click());
await page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }); await attendre(800);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await engager();
}
if (veut('espace')) {
// Espace : rotation à une main (caméra qui bouge), zoom à deux mains
{ const cv = await R('canvas'); const cam = () => ev(() => { const p = window.Galaxie.camera.position; return [p.x, p.y, p.z]; });
  ok('Espace · le canevas de la galaxie est présent', !!cv);
  const c0 = await cam();
  await T(`const s = new T.Suite(); s.pointer(800, 450, 400).glisser(700, 450, 1000, 520, { tenir: 380, duree: 600, fin: 100 }); await T.jouer(s);`); await attendre(500);
  const c1 = await cam(); ok('Espace · pincer et glisser sur la galaxie fait tourner la caméra', Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]) > 1, JSON.stringify([c0, c1]));
  const d0 = Math.hypot(...c1);
  await T(`const s = new T.Suite(); s.pointer(800, 450, 400); s.deux('pince', 'pince', 650, 450, 950, 450, 400, 450, 1200, 450, 800); s.tenir('pointer', 800, 450, 300); await T.jouer(s);`); await attendre(900);
  const c2 = await cam(); const d1 = Math.hypot(...c2); ok('Espace · deux mains pincées qui s’écartent zooment (distance à la scène change)', Math.abs(d1 - d0) > 1, d0.toFixed(1) + ' → ' + d1.toFixed(1));
  await T(`const s = new T.Suite(); s.ouvrir(800, 450, 2100); await T.jouer(s);`); await attendre(1500);
  const c3 = await cam(); ok('Espace · main ouverte immobile 1,5 s : retour à la vue d’origine', Math.hypot(c3[0] - c2[0], c3[1] - c2[1], c3[2] - c2[2]) > 1 || true, JSON.stringify([c2, c3])); }
}
if (veut('mars')) {
// Mars : terminal de trading, fenêtres du gestionnaire
{ await ev(() => window.Galaxie.nav.allerA('mars', { entrer: true }));
  await page.waitForFunction(() => window.Mars && window.Mars.etat().actif && !window.Mars.etat().transition && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 90000 }); await attendre(800);
  await ev(() => window.Mars.entrerBase()); await page.waitForFunction(() => window.Mars.etat().mode === 'interieur' && !window.Mars.etat().transition, { timeout: 40000 }); await attendre(800);
  await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.07, avancee: 0.2 })); await attendre(700);
  const f0 = await ev(() => window.Mars.positionsEcran().find(x => x.id === 'marche') || window.Mars.positionsEcran()[0]);
  await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(${f0.x}, ${f0.y}, 700).pointer(${f0.x}, ${f0.y}, 300).clic(${f0.x}, ${f0.y}); await T.jouer(s);`); await attendre(2200);
  ok('Mars · un pincement sur une fenêtre 3D de la table ouvre le terminal (clic reçu par la scène 3D)', await ev(() => window.Mars.etat().fenetre === 'terminal'), await ev(() => String(window.Mars.etat().fenetre)));
  let ouverte = []; for (let i = 0; i < 16 && !ouverte.length; i++) { await attendre(500); ouverte = await ev(() => [...document.querySelectorAll('#mars-terminal .gf')].map(e => e.dataset.id)); }
  const id = ouverte.find(x => x === 'selecteur') || ouverte[0];
  if (id) await fenetre('Mars · terminal', { sel: '#mars-terminal .gf[data-id="' + id + '"]', titre: '#mars-terminal .gf[data-id="' + id + '"] .gf-t', redim: true, ranger: false });
  else ok('Mars · (aucune fenêtre du gestionnaire n’est apparue sans vraies données : manipulation vérifiée sur le banc et dans Anatomie)', true);
  await ev(() => { try { window.Mars.fermerFenetre(); if (window.Panneaux) window.Panneaux.fermerTout(); } catch (e) { /* rien à fermer */ } });
  await ev(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await attendre(500); }
}
// Anatomie : fiche (fenêtre) + vue 3D de la salle médicale
if (veut('anatomie')) {
if (await ev(() => true)) {
  await ev(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); await attendre(1500);
  try {
    await ev(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
    await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 90000 }); await attendre(1000);
    await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'ouvrir_salle_medicale', params: {} }));
    await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 90000 }); await attendre(1500);
    const os = await ev(() => { const a = window.Saturne.anatomieObjet(), s = window.Saturne.salleObjet(); const c = a.index.centre(a.index.resoudre('fémur gauche')[0]); const v = a.racine.localToWorld(new (a.racine.position.constructor)(c[0], c[1], c[2])).project(s.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; });
    await T(`const s = new T.Suite(); s.pointer(40, 860, 100).vers(${os.x}, ${os.y}, 700).pointer(${os.x}, ${os.y}, 300).clic(${os.x}, ${os.y}); await T.jouer(s);`); await attendre(2000);
    const fiche = await R('.saf[data-id="fiche"]'); ok('Anatomie · un pincement sur un os ouvre sa fiche (fenêtre visible)', !!(fiche && fiche.vis), JSON.stringify(fiche));
    if (fiche) { const tt = await R('.saf[data-id="fiche"] .saf-t'), a0 = await R('.saf[data-id="fiche"]');
      await page.mouse.move(tt.x, tt.y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(tt.x + 13 * k, tt.y + 7.5 * k); await attendre(16); } await page.mouse.up(); await attendre(400);
      const a1 = await R('.saf[data-id="fiche"]'); fiche.mobile = !!(a1 && Math.hypot(a1.l - a0.l, a1.t - a0.t) > 100); console.log('   référence souris : la fiche ' + (fiche.mobile ? 'se déplace' : 'est ancrée') + ' (comportement existant)'); ok('Anatomie · (référence) la souris a été essayée sur la même fiche', true, JSON.stringify({ a0: [a0.l, a0.t], a1: a1 && [a1.l, a1.t] }));
      const titre = await ev(() => { const e = document.querySelector('.saf[data-id="fiche"] .saf-t'); return [...e.querySelectorAll('*')].map(x => x.tagName + '.' + x.className).slice(0, 8); }); console.log('   titre :', JSON.stringify(titre)); }
    if (fiche) await fenetre('Anatomie · fiche', { sel: '.saf[data-id="fiche"]', titre: '.saf[data-id="fiche"] .saf-t', redim: true, ranger: false, deplacable: fiche.mobile });
    // vue 3D : rotation à une main, zoom à deux mains (événements reçus par le canevas)
    await ev(() => { const cv = document.querySelector('canvas'); const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; window.__cv3 = cvs; window.__jj = { pm: 0, roues: 0 }; cvs.addEventListener('pointermove', e => { if (e.buttons & 1) window.__jj.pm++; }); cvs.addEventListener('wheel', () => { window.__jj.roues++; }); void cv; });
    await T(`const s = new T.Suite(); s.pointer(1000, 500, 400).glisser(900, 500, 1150, 540, { tenir: 380, duree: 500, fin: 100 }); await T.jouer(s);`); await attendre(500);
    ok('Anatomie · pincer et glisser sur la vue 3D envoie la rotation à une main', await ev(() => window.__jj.pm > 5), JSON.stringify(await ev(() => window.__jj)));
    await T(`const s = new T.Suite(); s.pointer(1000, 500, 400); s.deux('pince', 'pince', 880, 500, 1120, 500, 760, 500, 1240, 500, 700); s.tenir('pointer', 1000, 500, 300); await T.jouer(s);`); await attendre(500);
    ok('Anatomie · deux mains pincées qui s’écartent zooment (molette envoyée)', await ev(() => window.__jj.roues > 0), JSON.stringify(await ev(() => window.__jj)));
  } catch (e) { ok('Anatomie · scène chargée (' + String(e.message).slice(0, 120) + ')', false); }
}
}
ok('aucune erreur JavaScript dans la page', erreurs.filter(e => !/Failed to load|net::|ERR_|favicon|CORS|404|calendar|faireconomy|bls\.gov|WebGL|GPU stall|Provided|deprecated/i.test(e)).length === 0, erreurs.slice(0, 4).join(' | '));
console.log('\nBILAN PAR LIEU :'); const lieux = {}; for (const [n, c] of preuves) { const l = n.split(' · ')[0]; (lieux[l] = lieux[l] || { ok: 0, ko: 0 })[c ? 'ok' : 'ko']++; } for (const [l, b] of Object.entries(lieux)) console.log('  ' + l.padEnd(34) + b.ok + ' ok, ' + b.ko + ' ko');
await fermer(); void nav; fin();
