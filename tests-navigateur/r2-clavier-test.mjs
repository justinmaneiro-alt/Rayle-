import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME, attendre, compteur } from './terre-aide.mjs';
import { creerServeur } from '../serveur.mjs';

/* R2 phase 6 : clavier de la tablette. Vrai AZERTY (ordre et décalages du clavier physique), lettres grandes et lisibles, clavier qui remplit TOUT l'écran en paysage et en portrait
   (tablette paysage, téléphone portrait, téléphone paysage), cibles tactiles, plein écran tenté au premier appui, pas de zoom ni de défilement ni de sélection, saisie d'un texte
   avec accents REÇUE PAR LE PC (vraie liaison, vrais événements tactiles). Lancer : node tests-navigateur/r2-clavier-test.mjs */
const { verifier, fin } = compteur();
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-r2k-'));
const srv = creerServeur({ ip: '127.0.0.1', portReseau: 0, dossierDonnees: dossier });
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + srv.address().port;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const erreurs = [];
const pc = await nav.newPage(); await pc.setViewport({ width: 1280, height: 720 });
pc.on('pageerror', e => erreurs.push('PC: ' + e.message));
await pc.goto(base + '/index.html', { waitUntil: 'load' }); await pc.waitForFunction(() => window.Telecommande && document.getElementById('telInterrupteur'), { timeout: 30000 }); await attendre(500);
await pc.evaluate(() => document.getElementById('telInterrupteur').click());
await pc.waitForFunction(() => window.Telecommande.etat().actif && window.Telecommande.connectee(), { timeout: 10000 });
const e0 = await pc.evaluate(() => window.Telecommande.etat());
const tab = await nav.newPage(); const errT = [];
tab.on('pageerror', e => errT.push(e.message));
await tab.setViewport({ width: 1280, height: 800, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const cdp = await tab.createCDPSession();
const toucher = (pts, type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
await tab.goto(e0.url, { waitUntil: 'load' }); await attendre(500);
for (const c of e0.code) await tab.evaluate(c => document.querySelector('#pave-num [data-c="' + c + '"]').click(), c);
await tab.waitForFunction(() => window.ClavierEventail.etat().liaison, { timeout: 8000 });
await tab.waitForFunction(() => window.ClavierEventail.etat().pc === true, { timeout: 8000 });
await tab.evaluate(() => window.ClavierEventail.mode('clavier')); await attendre(600);

// ── 1. disposition AZERTY ──
const touches = () => tab.evaluate(() => [...document.querySelectorAll('#lettres .touche')].map(g => ({ id: g.dataset.id, rang: +g.dataset.rang.slice(1), x: +g.dataset.x, c: g.dataset.l })));
const T = await touches();
const rang = r => T.filter(t => t.rang === r).sort((a, b) => a.x - b.x);
const seq = r => rang(r).map(t => t.c).join('');
verifier('rangée des chiffres 1234567890 puis Retour arrière', seq(0).startsWith('1234567890') && rang(0).some(t => t.id === 'effacer'), seq(0));
verifier('rangée A Z E R T Y U I O P dans l’ordre du clavier physique', seq(1).startsWith('azertyuiop'), seq(1));
verifier('rangée Q S D F G H J K L M', seq(2).startsWith('qsdfghjklm'), seq(2));
verifier('rangée W X C V B N (après Maj)', /^maj?wxcvbn/.test(seq(3).replace('maj', 'maj')) || seq(3).startsWith('majwxcvbn'), seq(3));
verifier('accents é è à ù ç présents', ['é', 'è', 'à', 'ù', 'ç'].every(c => T.some(t => t.c === c)));
verifier('ponctuation , . \' - ? ! : ; présente', [',', '.', '\'', '-', '?', '!', ':', ';'].every(c => T.some(t => t.c === c)));
verifier('Maj, Retour arrière, Entrée présents', ['maj', 'effacer', 'entree'].every(i => T.some(t => t.id === i)));
verifier('barre d’espace présente', await tab.evaluate(() => !!document.querySelector('#espace-svg [data-id="espace"]')));
const xs = c => T.find(t => t.c === c).x;
verifier('décalages physiques : A (0,5) < Q (0,75) < W (après Maj)', xs('a') < xs('q') && xs('q') < xs('w') && xs('a') === 0.5 && xs('q') === 0.75, [xs('a'), xs('q'), xs('w')].join(' / '));
verifier('Z est à droite de A, S à droite de Q, X à droite de W', xs('z') > xs('a') && xs('s') > xs('q') && xs('x') > xs('w'));
verifier('commandes de Raylé conservées (13 touches d’éventail)', await tab.evaluate(() => document.querySelectorAll('#arc .touche.cmd, #arc .touche').length === 13));
verifier('éventail en perspective et animations conservés', await tab.evaluate(() => /matrix3d/.test(getComputedStyle(document.getElementById('plan')).transform) && getComputedStyle(document.querySelector('.cad-arc.a')).animationName !== 'none'));

// ── 2. remplissage de l'écran à 3 tailles ──
const mesures = () => tab.evaluate(() => {
  const r = id => document.getElementById(id).getBoundingClientRect(), kb = r('kb'), le = document.getElementById('lettres'), W = innerWidth, H = innerHeight;
  const keys = [...document.querySelectorAll('#lettres .touche.car')].map(g => g.querySelector('path').getBBox());
  const lettre = document.querySelector('#lettres .touche.car text.grande'), fs = parseFloat(lettre.style.fontSize);
  const esp = { height: document.getElementById('espace-svg').clientHeight }, champ = r('champ'), haut = r('haut');
  return { W, H, kbGauche: kb.left, kbDroite: W - kb.right, kbBas: H - kb.bottom, vide: document.getElementById('plan').getBoundingClientRect().top - champ.bottom, lettresL: le.clientWidth, lettresH: le.clientHeight,
    minL: Math.min(...keys.map(k => k.width)), minH: Math.min(...keys.map(k => k.height)), police: fs, defile: document.documentElement.scrollHeight - H, defileL: document.documentElement.scrollWidth - W,
    espaceH: esp.height, enTete: haut.bottom, orient: document.body.dataset.orient, selection: getComputedStyle(document.body).userSelect, echelle: window.visualViewport ? window.visualViewport.scale : 1 };
});
const TAILLES = [{ nom: 'tablette paysage', l: 1280, h: 800, paysage: true, minCible: 44 }, { nom: 'téléphone portrait', l: 390, h: 844, paysage: false, minCible: 28 }, { nom: 'téléphone paysage', l: 844, h: 390, paysage: true, minCible: 34 }];
for (const t of TAILLES) {
  await tab.setViewport({ width: t.l, height: t.h, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); await attendre(700);
  const m = await mesures();
  verifier(t.nom + ' : le clavier touche les bords gauche, droit et bas (marges ≤ 8 px)', m.kbGauche <= 8 && m.kbDroite <= 8 && m.kbBas <= 8, JSON.stringify([m.kbGauche, m.kbDroite, m.kbBas]));
  verifier(t.nom + ' : pas de bande vide entre le champ de texte et les touches (visibles, en perspective)', m.vide <= 16, String(m.vide));
  verifier(t.nom + ' : les lettres occupent la largeur (' + (t.paysage ? '≥ 55 %' : '≥ 95 %') + ')', m.lettresL >= m.W * (t.paysage ? 0.55 : 0.95), m.lettresL + ' / ' + m.W);
  verifier(t.nom + ' : touches de ≥ ' + t.minCible + ' px (' + Math.round(m.minL) + ' × ' + Math.round(m.minH) + ')', m.minL >= t.minCible - 1 && m.minH >= t.minCible - 1, JSON.stringify([m.minL, m.minH]));
  verifier(t.nom + ' : lettres grandes (≥ 18 px)', m.police >= 18, String(m.police));
  verifier(t.nom + ' : aucun défilement, orientation détectée', m.defile <= 1 && m.defileL <= 1 && m.orient === (t.paysage ? 'paysage' : 'portrait'), JSON.stringify([m.defile, m.defileL, m.orient]));
  verifier(t.nom + ' : barre d’espace ≥ 34 px de haut', m.espaceH >= 34, String(m.espaceH));
  verifier(t.nom + ' : le message « tourne la tablette » n’apparaît plus', await tab.evaluate(() => getComputedStyle(document.getElementById('portrait')).display === 'none'));
}
verifier('sélection de texte et zoom désactivés', await tab.evaluate(() => getComputedStyle(document.body).userSelect === 'none' && /user-scalable=no/.test(document.querySelector('meta[name=viewport]').content) && /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content)));
verifier('zones sûres (encoche, barre de navigation) respectées', await tab.evaluate(() => { const css = [...document.styleSheets].map(s => [...s.cssRules].map(r => r.cssText).join(' ')).join(' '); return /safe-area-inset-top/.test(css) && /safe-area-inset-bottom/.test(css) && /100dvh/.test(css) && /100dvw/.test(css); }));

// ── 3. saisie réelle reçue par le PC (tablette paysage) ──
await tab.setViewport({ width: 1280, height: 800, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }); await attendre(700);
await pc.evaluate(() => { document.getElementById('k2-scroll')?.remove(); const i = document.createElement('input'); i.id = 'k2-champ'; i.type = 'text'; i.style.cssText = 'position:fixed;left:10px;top:10px;z-index:2147482999;width:600px'; document.body.appendChild(i); i.focus(); });
const centre = id => tab.evaluate(i => { const r = document.querySelector('[data-id="' + i + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
const taper = async id => { const p = await centre(id); await toucher([p], 'touchStart'); await attendre(40); await toucher([], 'touchEnd'); await attendre(90); };
const idDe = ch => ch === ' ' ? 'espace' : 'c-' + ch;
const ecrire = async txt => { for (const ch of txt) { const bas = ch.toLowerCase(); if (bas !== ch) { await taper('maj'); await taper(idDe(bas)); } else await taper(idDe(ch)); } };
const TEXTE = 'élève à Paris, ça va ? où';
await ecrire(TEXTE); await attendre(400);
const recu = await pc.evaluate(() => document.getElementById('k2-champ').value);
verifier('texte avec accents reçu par le PC : « ' + TEXTE + ' »', recu === TEXTE, JSON.stringify(recu));
await taper('maj'); await taper('c-é'); await attendre(200);
verifier('Maj + é donne É (majuscule accentuée)', (await pc.evaluate(() => document.getElementById('k2-champ').value)).endsWith('É'));
await taper('effacer'); await taper('effacer'); await attendre(250);
verifier('Retour arrière efface côté PC', (await pc.evaluate(() => document.getElementById('k2-champ').value)).length === TEXTE.length - 1, JSON.stringify(await pc.evaluate(() => document.getElementById('k2-champ').value)));
// multi-touch : deux touches en même temps
await pc.evaluate(() => { document.getElementById('k2-champ').value = ''; });
const pa = await centre('c-a'), pe = await centre('c-e');
await toucher([pa], 'touchStart'); await attendre(30); await toucher([pa, pe], 'touchStart'); await attendre(60); await toucher([pe], 'touchEnd'); await toucher([], 'touchEnd'); await attendre(200);
verifier('multi-touch : deux touches simultanées sont toutes deux prises', (await pc.evaluate(() => document.getElementById('k2-champ').value)).split('').sort().join('') === 'ae', JSON.stringify(await pc.evaluate(() => document.getElementById('k2-champ').value)));
// pincement à deux doigts sur le clavier : pas de zoom
await toucher([{ x: 300, y: 500 }, { x: 600, y: 500 }], 'touchStart'); for (let i = 1; i <= 5; i++) await toucher([{ x: 300 - i * 20, y: 500 }, { x: 600 + i * 20, y: 500 }], 'touchMove'); await toucher([], 'touchEnd'); await attendre(200);
verifier('pincement : l’échelle de la page reste 1', await tab.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1) === 1));
verifier('plein écran tenté au premier appui', await tab.evaluate(() => window.ClavierEventail.etat().pleinEcranEssaye === true));
await tab.screenshot({ path: 'docs/captures-r2/clavier-tablette.png' });
await tab.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); await attendre(700);
await tab.screenshot({ path: 'docs/captures-r2/clavier-telephone.png' });

verifier('aucune erreur JavaScript', erreurs.length === 0 && errT.length === 0, erreurs.concat(errT).slice(0, 3).join(' | '));
await nav.close(); srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
fin();
