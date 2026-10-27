// Partie A : entité vivante (états, regard, clic, vie spontanée) et séquence de démarrage ; images/s dans les trois modes.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument((q, boot) => { if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); else localStorage.removeItem('rayle_entite_qualite'); localStorage.removeItem('rayle_entite_niveau'); if (boot === false) localStorage.setItem('rayle_boot', '0'); else localStorage.removeItem('rayle_boot'); }, opts.qualite, opts.boot);
  await p.goto(BASE + (opts.url || '/index.html'), { waitUntil: 'load' }); await attendre(opts.attente || 3800);
  return p;
}
const info = p => p.evaluate(() => Entite.info());
const fps = p => p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);

let p = await page({ boot: false });
await p.evaluate(() => { Entite.verrou(false); Entite.verrou = () => {}; });

// ── veille : vie spontanée ──
await p.evaluate(() => Entite.etat('veille')); await attendre(1500);
let i = await info(p);
v('veille : étincelles actives', i.vie.etincelles > 0.8, JSON.stringify(i.vie));
let maxOndes = 0; for (let k = 0; k < 40; k++) { maxOndes = Math.max(maxOndes, (await info(p)).vie.ondes); await attendre(350); }
v('veille : au moins une vague ou une pensée en 14 s', maxOndes >= 1, String(maxOndes));

// ── écoute ──
await p.evaluate(() => Entite.etat('listening')); await attendre(2200); i = await info(p);
const lum0 = i.lum;
v('écoute : les filaments se resserrent', i.vie.serre > 0.5, String(i.vie.serre));
await p.evaluate(() => Entite.amplitude(() => 0.9)); await attendre(900); i = await info(p);
v("écoute : l'entité s'éclaire avec la voix réelle", i.lum > lum0 * 1.5, lum0 + ' → ' + i.lum);
await p.evaluate(() => Entite.amplitude(null));

// ── réflexion ──
await p.evaluate(() => Entite.etat('thinking')); await attendre(2500); i = await info(p);
v('réflexion : tourbillon, impulsions rapides, violet', i.vie.tourb > 0.7 && i.vie.pulse > 2.2 && i.c[0] > 0.6 && i.c[2] > 0.9, JSON.stringify({ c: i.c, v: i.vie }));

// ── transitions fluides (réflexion → parole) ──
await p.evaluate(() => Entite.etat('speaking')); await attendre(120); const t1 = await info(p); await attendre(250); const t2 = await info(p); await attendre(2500); const t3 = await info(p);
v('transition progressive : ni saut ni retard (violet → rose)', t1.c[0] > 0.78 && t1.c[0] < 0.99 && t2.c[0] > t1.c[0] && t3.c[0] > 0.97, [t1.c[0], t2.c[0], t3.c[0]].join(' → '));

// ── parole : vagues sur les pics de voix ──
await p.evaluate(() => { window.__t0 = performance.now(); Entite.amplitude(() => 0.5 + 0.5 * Math.sin((performance.now() - window.__t0) / 1000 * 8)); });
let ondesParole = 0; for (let k = 0; k < 20; k++) { ondesParole = Math.max(ondesParole, (await info(p)).vie.ondes); await attendre(150); }
v('parole : des vagues partent du cœur sur les pics de voix', ondesParole >= 2, String(ondesParole));
await p.evaluate(() => Entite.amplitude(null));

// ── alerte ──
await p.evaluate(() => Entite.etat('idle')); await attendre(1200);
await p.evaluate(() => Entite.alerte(2500)); await attendre(250); i = await info(p);
v('alerte : secousse, flash orange', i.vie.secousse > 0.3 && i.vie.flashCol[2] < 0.95 && i.c[0] > 0.5, JSON.stringify(i.vie));
await attendre(1800); i = await info(p);
v('alerte : la secousse est brève', i.vie.secousse < 0.05, String(i.vie.secousse));
await attendre(2500);

// ── regard : suit le curseur / le doigt ──
await p.evaluate(() => Entite.etat('idle')); await attendre(500);
const c = await p.evaluate(() => { const r = document.getElementById('reactor').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await p.mouse.move(c.x + 500, c.y); await attendre(900); i = await info(p);
const droite = i.vie.incl[0];
await p.mouse.move(c.x - 500, c.y); await attendre(900); i = await info(p);
const gauche = i.vie.incl[0];
await p.mouse.move(c.x, c.y + 400); await attendre(900); i = await info(p);
v('regard : inclinaison vers le curseur (droite, gauche, bas)', droite > 0.15 && gauche < -0.15 && i.vie.incl[1] > 0.08, JSON.stringify({ droite, gauche, bas: i.vie.incl[1] }));
await attendre(3600); i = await info(p);
v('regard : oublié après quelques secondes sans mouvement', Math.abs(i.vie.incl[0]) < 0.05 && Math.abs(i.vie.incl[1]) < 0.05, JSON.stringify(i.vie.incl));
// ── clic : une onde ──
await attendre(3000); const avant = (await info(p)).vie.ondes;
await p.mouse.click(c.x, c.y); await attendre(200); i = await info(p);
v('un clic sur l\'entité envoie une onde depuis le cœur', i.vie.ondes >= 1 && i.vie.ondes >= avant, avant + ' → ' + i.vie.ondes);
await p.close();

// ── images/s dans les trois modes, avec toute la vie ──
for (const [nom, q] of [['complet', 0], ['normal', 1], ['léger', 2]]) {
  const pp = await page({ qualite: q, boot: false });
  await pp.evaluate(() => { Entite.verrou(false); Entite.verrou = () => {}; Entite.etat('thinking'); });
  await attendre(1500);
  const f = await fps(pp), ii = await info(pp);
  v(`${nom} : ≥ 55 images/s avec la vie complète (page ${f}, entité ${ii.fps})`, f >= 55 && ii.fps >= 55 && ii.mode === (q === 0 ? 'complet' : q === 1 ? 'normal' : 'leger'), JSON.stringify({ f, fps: ii.fps }));
  await pp.close();
}
// tablette simulée (cadence limitée à 60 i/s, processeur ralenti)
{
  const pt = await page({ qualite: 1, boot: false, viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const cdp = await pt.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await pt.evaluate(() => { Entite.verrou(false); Entite.verrou = () => {}; Entite.etat('thinking'); }); await attendre(1500);
  const f = await fps(pt), ii = await info(pt);
  v(`tablette simulée (normal, processeur ralenti ×4) : ≥ 55 images/s (page ${f}, entité ${ii.fps})`, f >= 55 && ii.fps >= 55, JSON.stringify({ f, fps: ii.fps }));
  await pt.close();
}

// ── séquence de démarrage ──
p = await page({ url: '/index.html?boot=1', attente: 700 });
v('démarrage : la séquence est affichée, le tableau de bord masqué', await p.evaluate(() => !!document.getElementById('boot') && document.body.classList.contains('boot') && getComputedStyle(document.querySelector('.tb')).opacity === '0'));
v('démarrage : anneaux, échelle et texte système', await p.evaluate(() => !!document.querySelector('#boot .boot-anneaux svg') && !!document.querySelector('#boot .boot-echelle') && document.querySelectorAll('#boot .boot-l').length >= 4));
const lignes = await p.evaluate(() => Array.from(document.querySelectorAll('#boot .boot-l')).map(e => e.textContent));
v('démarrage : le texte ne dit que des choses vraies (horloge, écran, mode, Worker, neurones)', lignes.some(l => /HORLOGE .* \d\d:\d\d:\d\d/.test(l)) && lignes.some(l => l.includes('1600×900')) && lignes.some(l => /MODE .* (COMPLET|NORMAL|LÉGER)/.test(l)) && lignes.some(l => /WORKER .* (CONFIGURÉE|NON CONFIGURÉE)/.test(l)), lignes.join(' | '));
await attendre(900);
const forme = (await info(p)).vie.forme;
v('démarrage : l\'entité se forme pendant la séquence', forme > 0.05 && forme < 1, String(forme));
await attendre(3900);
v('démarrage : terminé en moins de 5 s, tableau de bord affiché, entité complète', await p.evaluate(() => !document.getElementById('boot') && !document.body.classList.contains('boot') && getComputedStyle(document.querySelector('.tb')).opacity === '1') && (await info(p)).vie.forme === 1);
await p.close();
// passable d'un clic
p = await page({ url: '/index.html?boot=1', attente: 1100 });
await p.mouse.click(300, 300); await attendre(1500);
v('démarrage : un clic l\'abrège', await p.evaluate(() => !document.getElementById('boot') && !document.body.classList.contains('boot')) && (await info(p)).vie.forme === 1);
await p.close();
// léger : court, sans anneaux
p = await page({ url: '/index.html?boot=1', qualite: 2, attente: 500 });
v('démarrage léger : court, sans anneaux animés', await p.evaluate(() => !!document.getElementById('boot') && document.getElementById('boot').dataset.mode === 'leger' && !document.querySelector('#boot .boot-anneaux')));
await attendre(2400);
v('démarrage léger : terminé en moins de 3 s', await p.evaluate(() => !document.getElementById('boot')));
await p.close();
// supprimé : animations réduites, lien direct, réglage, navigateur piloté
p = await page({ url: '/index.html?boot=1', reduire: true, attente: 600 });
v('animations réduites : pas de séquence de démarrage', await p.evaluate(() => !document.getElementById('boot') && !document.body.classList.contains('boot')));
await p.close();
p = await page({ url: '/index.html?boot=1#terminal', attente: 800 });
v('lien direct vers le terminal : pas de séquence', await p.evaluate(() => !document.getElementById('boot')));
await p.close();
p = await page({ url: '/index.html?boot=1', boot: false, attente: 600 });
v('réglage « séquence de démarrage » désactivé : pas de séquence', await p.evaluate(() => !document.getElementById('boot') && document.getElementById('kBoot').checked === false));
await p.close();
p = await page({ attente: 600 });
v('navigateur piloté par un test : pas de séquence par défaut (les autres tests ne sont pas gênés)', await p.evaluate(() => !document.getElementById('boot')));
await p.close();
// téléphone : la séquence tient dans l'écran
p = await page({ url: '/index.html?boot=1', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }, attente: 1800 });
const tel = await p.evaluate(() => { const r = document.querySelector('#boot .boot-bloc').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, bas: r.bottom, ih: innerHeight, gauche: r.left, droite: r.right }; });
v('téléphone : la séquence tient dans l\'écran', tel.sw <= tel.iw && tel.bas <= tel.ih && tel.gauche >= 0 && tel.droite <= tel.iw, JSON.stringify(tel));
await p.close();

v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
