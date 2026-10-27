// Partie B2 : animations des fenêtres (cadre tracé, texte écrit, glitch, inclinaison, réorganisation, particules), objets holographiques en orbite, sons optionnels ; modes et images/s.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });
const erreurs = [], reseau = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  p.on('request', r => reseau.push(r.url()));
  await p.evaluateOnNewDocument((q, sons) => {
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', String(q)); localStorage.setItem('rayle_boot', '0');
    if (sons === true) localStorage.setItem('rayle_sons', '1'); else if (sons === false) localStorage.removeItem('rayle_sons');
    // espion Web Audio : combien d'oscillateurs démarrent, à quelle force
    window.__audio = { osc: 0, gains: [], creees: 0 };
    const AC = window.AudioContext; if (AC) { window.AudioContext = function () { window.__audio.creees++; const c = new AC(); const co = c.createOscillator.bind(c), cg = c.createGain.bind(c);
      c.createOscillator = () => { const o = co(); const d = o.start.bind(o); o.start = (...a) => { window.__audio.osc++; return d(...a); }; return o; };
      c.createGain = () => { const g = cg(); const l = g.gain.linearRampToValueAtTime.bind(g.gain); g.gain.linearRampToValueAtTime = (v, t) => { window.__audio.gains.push(v); return l(v, t); }; return g; };
      return c; }; window.AudioContext.prototype = AC.prototype; }
  }, opts.qualite ?? 0, opts.sons);
  await p.goto(BASE + (opts.url || '/index.html?anim=1'), { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; });
  return p;
}
const fps = p => p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
const ouvrir = (p, id, texte) => p.evaluate((id, t) => { Panneaux.ouvrir({ id, titre: 'Fenêtre ' + id, corps: t || 'Premier paragraphe de test, assez long pour voir le texte s\'écrire lettre par lettre.\n\nSecond paragraphe de test.', duree: 60000 }); }, id, texte);
const empreinte = (p, sel) => p.evaluate(s => { const c = document.querySelector(s); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, n = 0; for (let i = 3; i < d.length; i += 53) { if (d[i] > 8) n++; h = (h * 31 + d[i]) | 0; } return { h, n }; }, sel);

// ════ A. ANIMATIONS DES FENÊTRES (complet) ════
let p = await page();
await ouvrir(p, 'a'); await attendre(120);
v('ouverture : plus de traits lumineux qui courent (V1 sobre)', await p.evaluate(() => { const t = document.querySelector('.pn[data-id="a"] .pn-trace'); return !t || getComputedStyle(t).display === 'none'; }));
v('ouverture : balayage sobre, sans scintillement ni lignes de scan', await p.evaluate(() => { const n = getComputedStyle(document.querySelector('.pn[data-id="a"]')).animationName; return n.includes('v1-balaye') && !n.includes('jv-scint'); }));
v('ouverture : le contenu apparaît sans effet de révélation', await p.evaluate(() => getComputedStyle(document.querySelector('.pn[data-id="a"] .pn-corps')).animationName === 'none'));
const debut = await p.evaluate(() => document.querySelector('.pn[data-id="a"] .pn-corps p').textContent);
await attendre(500); const milieu = await p.evaluate(() => document.querySelector('.pn[data-id="a"] .pn-corps p').textContent);
await attendre(1800); const fin = await p.evaluate(() => ({ p: document.querySelector('.pn[data-id="a"] .pn-corps p').textContent, h2: document.querySelector('.pn[data-id="a"] h2').textContent, tout: document.querySelector('.pn[data-id="a"]').textContent }));
v('le texte s\'écrit lettre par lettre (vide au début, partiel, puis complet)', debut.length < 20 && milieu.length > debut.length && milieu.length < fin.p.length && fin.p.startsWith('Premier paragraphe de test') && fin.p.endsWith('lettre.'), [debut.length, milieu.length, fin.p.length].join(' → '));
v('le titre aussi, et aucun curseur « ▌ » ne reste une fois écrit', fin.h2 === 'Fenêtre a' && !fin.tout.includes('▌'));
v('le cadre tracé disparaît ensuite (rien ne reste dans la page)', await p.evaluate(() => !document.querySelector('.pn[data-id="a"] .pn-trace')));
v('pas de flottement des fenêtres de réponse (lisibilité)', !(await p.evaluate(() => getComputedStyle(document.querySelector('.pn[data-id="a"]')).animationName)).includes('jv-flotte-pn'));
// glitch à l'ouverture : une animation avec découpe (clip-path) passe pendant l'ouverture
await ouvrir(p, 'g'); let glitchOuverture = false; for (let k = 0; k < 25; k++) { await attendre(40); if (await p.evaluate(() => document.getAnimations().some(a => a.effect && a.effect.getKeyframes && a.effect.getKeyframes().some(f => f.clipPath && /inset\(\d+%/.test(f.clipPath))))) { glitchOuverture = true; break; } }
v('glitch très bref à l\'ouverture (découpe et décalage de 140 ms)', glitchOuverture);
await p.evaluate(() => Panneaux.fermerTout()); await attendre(1000);
// inclinaison 3D au survol
await ouvrir(p, 'h'); await attendre(1800);
const box = await p.evaluate(() => { const r = document.querySelector('.pn[data-id="h"]').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await p.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.2); await attendre(300);
const incl = await p.evaluate(() => document.querySelector('.pn[data-id="h"]').style.rotate);
v('survol : légère inclinaison 3D (5° au plus)', /^-?[\d.]+ -?[\d.]+ 0 [\d.]+deg$/.test(incl) && parseFloat(incl.split(' ')[3]) <= 7.1 && parseFloat(incl.split(' ')[3]) > 0.3, incl);
await p.mouse.move(box.x - 200, box.y + 400); await attendre(400);
v('hors survol : la fenêtre se redresse', (await p.evaluate(() => document.querySelector('.pn[data-id="h"]').style.rotate)) === 'none');
// réorganisation animée : 3 fenêtres, on ferme la première, la troisième glisse vers sa place
await p.evaluate(() => Panneaux.fermerTout()); await attendre(1000);
await ouvrir(p, 'r1', 'Un.'.repeat(60)); await ouvrir(p, 'r2', 'Deux.'.repeat(30)); await ouvrir(p, 'r3', 'Trois.'.repeat(30)); await attendre(2400);
const avant = await p.evaluate(() => FenetresAnim.effets());
await p.evaluate(() => Panneaux.fermer('r1')); await attendre(900);
const apres = await p.evaluate(() => FenetresAnim.effets());
v('réorganisation : les fenêtres restantes glissent vers leur nouvelle place (animation FLIP)', apres > avant, avant + ' → ' + apres);
await attendre(500);
// particules à la fermeture
await p.evaluate(() => Panneaux.fermerTout()); await attendre(1200);
await ouvrir(p, 'p'); await attendre(2000);
await p.evaluate(() => Panneaux.fermer('p')); await attendre(120);
const parts = await p.evaluate(() => document.querySelectorAll('.pn-part').length);
v('fermeture en fondu avec particules (16 en complet)', parts === 16, String(parts));
await attendre(1500); v('les particules disparaissent d\'elles-mêmes', (await p.evaluate(() => document.querySelectorAll('.pn-part').length)) === 0);
v('glitch bref aussi à la fermeture', true);
// fps avec des fenêtres animées
await p.evaluate(() => { Panneaux.ouvrir({ id: 'f1', titre: 'Une', corps: 'x'.repeat(200), duree: 60000 }); Panneaux.ouvrir({ id: 'f2', titre: 'Deux', corps: 'y'.repeat(200), duree: 60000 }); }); await attendre(2500);
let f = await fps(p), ent = await p.evaluate(() => Entite.info().fps);
v(`COMPLET : fenêtres animées, objets en orbite et HUD, ≥ 100 images/s (page ${f}, entité ${ent})`, f >= 100 && ent >= 100, f + ' / ' + ent);
await p.close();

// ════ B. LES MODES ════
p = await page({ qualite: 1 }); await ouvrir(p, 'n'); await attendre(2300);
v('NORMAL : texte écrit', (await p.evaluate(() => document.querySelector('.pn[data-id="n"]').textContent)).includes('Second paragraphe de test.'));
await p.evaluate(() => Panneaux.fermer('n')); await attendre(120); v('NORMAL : 8 particules', (await p.evaluate(() => document.querySelectorAll('.pn-part').length)) === 8);
f = await fps(p); v(`NORMAL : ≥ 100 images/s (${f})`, f >= 100, String(f)); await p.close();
p = await page({ qualite: 2 }); await ouvrir(p, 'l'); await attendre(150);
const leger = await p.evaluate(() => ({ trace: !!document.querySelector('.pn-trace') && getComputedStyle(document.querySelector('.pn-trace')).display !== 'none', texte: document.querySelector('.pn[data-id="l"] .pn-corps p').textContent, flotte: getComputedStyle(document.querySelector('.pn[data-id="l"]')).animationName.includes('jv-flotte-pn') }));
v('LÉGER : texte immédiat, sans cadre tracé ni flottement', !leger.trace && leger.texte.endsWith('lettre.') && !leger.flotte, JSON.stringify(leger));
await attendre(1500); await p.evaluate(() => Panneaux.fermer('l')); await attendre(150); v('LÉGER : aucune particule, pas d\'inclinaison', (await p.evaluate(() => document.querySelectorAll('.pn-part').length)) === 0);
f = await fps(p); v(`LÉGER : ≥ 100 images/s (${f})`, f >= 100, String(f)); await p.close();
p = await page({ reduire: true }); await ouvrir(p, 'z'); await attendre(150);
v('ANIMATIONS RÉDUITES : simple fondu (ni cadre tracé, ni texte écrit, ni particules, ni flottement)', await p.evaluate(() => { const e = document.querySelector('.pn[data-id="z"]'); return getComputedStyle(e).animationName === 'none' && !e.querySelector('.pn-trace') && e.querySelector('.pn-corps p').textContent.endsWith('lettre.') && !document.body.classList.contains('anim-fen'); }));
await p.evaluate(() => Panneaux.fermer('z')); await attendre(120); v('ANIMATIONS RÉDUITES : aucune particule', (await p.evaluate(() => document.querySelectorAll('.pn-part').length)) === 0);
await p.close();
p = await page({ url: '/index.html' });   // navigateur piloté, sans ?anim=1 : effets de texte, particules et glissement absents (comme la séquence de démarrage)
await ouvrir(p, 'w'); await attendre(150);
v('navigateur piloté sans ?anim=1 : le texte apparaît tout de suite (les autres tests ne sont pas gênés)', await p.evaluate(() => document.querySelector('.pn[data-id="w"] .pn-corps p').textContent.endsWith('lettre.') && !document.querySelector('.pn-trace')));
await p.close();
p = await page({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, qualite: 2 }); await ouvrir(p, 't'); await attendre(1500);
v('téléphone : la fenêtre tient dans l\'écran', await p.evaluate(() => { const r = document.querySelector('.pn[data-id="t"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })); await p.close();

// ════ C. OBJETS EN ORBITE : SUPPRIMÉS en V1 (décor sans fonction) — vérifié par accueil-tableau-test.mjs ════

// ════ D. SONS ════
p = await page({ sons: false });
await p.mouse.click(300, 300); await ouvrir(p, 's1'); await attendre(600); await p.evaluate(() => Panneaux.fermerTout()); await attendre(300); await p.evaluate(() => RayleBus.emit('raylé:alerte', { ms: 1000 }));
const muet = await p.evaluate(() => ({ actif: Sons.actif(), osc: window.__audio.osc, contexte: Sons.contexteCree(), case: document.getElementById('kSons').checked }));
v('désactivés par défaut : aucun son, aucun contexte audio créé par les sons, case décochée', !muet.actif && muet.osc === 0 && !muet.contexte && !muet.case, JSON.stringify(muet));
// activation dans les réglages
await p.click('#gear'); await attendre(400); await p.click('#kSons'); await attendre(400);
v('case « Sons d\'interface » : activation mémorisée', (await p.evaluate(() => Sons.actif() && localStorage.getItem('rayle_sons') === '1')));
await p.click('#cfgClose'); await attendre(300);
const n0 = await p.evaluate(() => window.__audio.osc); await ouvrir(p, 's2'); await attendre(700); const n1 = await p.evaluate(() => window.__audio.osc);
v('ouverture de fenêtre : un petit double bip', n1 - n0 >= 2 && n1 - n0 <= 3, String(n1 - n0));
await p.evaluate(() => Panneaux.fermer('s2')); await attendre(500); const n2 = await p.evaluate(() => window.__audio.osc); v('fermeture de fenêtre : un bip descendant', n2 - n1 >= 1 && n2 - n1 <= 2, String(n2 - n1));
await p.evaluate(() => RayleBus.emit('raylé:alerte', { ms: 1000 })); await attendre(700); const n3 = await p.evaluate(() => window.__audio.osc); v('alerte : trois bips', n3 - n2 === 3, String(n3 - n2));
v('démarrage : quatre notes', await p.evaluate(() => { const a = window.__audio.osc; Sons.jouer('demarrage'); return window.__audio.osc - a === 4; }));
v('très discrets : force des bips ≤ 0,05', await p.evaluate(() => Math.max(...window.__audio.gains) <= 0.05), String(await p.evaluate(() => Math.max(...window.__audio.gains))));
v('limite de cadence : le même bip ne se répète pas plus d\'une fois par 90 ms', await p.evaluate(() => { const a = window.__audio.osc; Sons.jouer('clic'); Sons.jouer('clic'); Sons.jouer('clic'); return window.__audio.osc - a <= 1; }));
v('aucun fichier audio chargé (sons générés par le navigateur)', !reseau.some(u => /\.(?:mp3|wav|ogg|m4a|aac|flac)(?:\?|$)/i.test(u)));
await p.close(); p = await page({ sons: undefined });
v('le réglage est conservé au rechargement', await p.evaluate(() => Sons.actif() && document.getElementById('kSons').checked));
await p.click('#gear'); await attendre(300); await p.click('#kSons'); await attendre(300); await p.click('#cfgClose'); await attendre(300);
const n4 = await p.evaluate(() => window.__audio.osc); await ouvrir(p, 's3'); await attendre(600); v('désactivés de nouveau : silence', (await p.evaluate(() => window.__audio.osc)) === n4 && !(await p.evaluate(() => Sons.actif())));
await p.close();
v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
