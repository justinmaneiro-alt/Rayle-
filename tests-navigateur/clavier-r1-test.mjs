import puppeteer from 'puppeteer-core';
/* R1 phase 3 : clavier en éventail et pavé de la télécommande, fidèles au modèle (dessin original). Page ouverte hors liaison (essai local) avec de vrais événements tactiles.
   Vérifie : perspective nette, zone tactile EXACTE sous le doigt (chaque touche répond à son propre centre), glyphes + lettres AZERTY lisibles, éventail de commandes, bague lumineuse,
   barre d'espace flottante indépendante, rangée active et onde, textes d'état, palette bleu nuit + blanc-cyan, pavé en matrice de points avec anneau, traînée et onde, réglages conservés. */
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu'] });
const erreurs = [];
async function ouvrir(L, H) {
  const p = await b.newPage(); await p.setViewport({ width: L, height: H, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await p.evaluateOnNewDocument(() => { localStorage.removeItem('rayle_clavier_reglages'); });
  await p.goto(BASE + '/clavier/index.html', { waitUntil: 'load' }); await attendre(500);
  return p;
}
const touche = async (p, cdp, x, y, duree = 90) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await attendre(duree); };
const lever = cdp => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const centre = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);

let p = await ouvrir(1024, 600); const cdp = await p.createCDPSession();
v('palette de la télécommande : bleu nuit + blanc-cyan (indépendante de l’accueil rose)', await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return s.getPropertyValue('--a').trim() === '#9be9ff' && s.getPropertyValue('--nuit').trim() === '#030a1c' && s.getPropertyValue('--a').trim() !== '#ff5aa5'; }));
v('éventail posé en perspective (inclinaison nette, matrice 3D)', await p.evaluate(() => { const m = getComputedStyle(document.getElementById('plan')).transform; return /matrix3d/.test(m); }));
v('quart d’anneau à gauche : 3 arcs concentriques, 13 touches de commande à petites étiquettes en capitales', await p.evaluate(() => { const c = [...document.querySelectorAll('#arc .touche.cmd')], rangs = new Set(c.map(g => g.dataset.rang)); const t = c[0].querySelector('text'); const s = getComputedStyle(t); return c.length === 13 && rangs.size === 3 && s.textTransform === 'uppercase' && parseFloat(s.letterSpacing) > 0.5 && parseFloat(s.fontSize) <= 14; }));
v('étiquettes de commandes de Raylé (Accueil, Retour, Fermer, Terre, Mars, Saturne, Capture, Échap…)', await p.evaluate(() => { const t = [...document.querySelectorAll('#arc .touche.cmd text')].map(e => e.textContent); return ['Accueil', 'Retour', 'Fermer', 'Terre', 'Mars', 'Saturne', 'Atelier 3D', 'Précédent', 'Suivant', 'Plein écran', 'Mode léger', 'Capture', 'Échap'].every(n => t.includes(n)); }));
v('bague circulaire lumineuse (cadran) au centre', await p.evaluate(() => { const c = document.getElementById('cadran'); return c.querySelectorAll('circle').length >= 3 && c.querySelectorAll('.cad-arc').length === 3 && c.getBoundingClientRect().width > 50 && /drop-shadow/.test(getComputedStyle(c).filter); }));
v('bloc de touches à droite : 5 rangées, glyphe discret + GRANDE lettre AZERTY', await p.evaluate(() => { const rangs = new Set([...document.querySelectorAll('#lettres .touche')].map(g => g.dataset.rang)); const car = [...document.querySelectorAll('#lettres .touche.car')]; const lettres = 'azertyuiopqsdfghjklmwxcvbn'.split(''); const l = car.map(g => g.querySelector('text.grande').textContent); const ok = lettres.every(c => l.includes(c)); return rangs.size === 5 && car.every(g => g.querySelector('path.glyphe') && g.querySelector('text.grande')) && ok; }));
v('lettres lisibles (≥ 9 px à l’écran) et glyphes tous différents', await p.evaluate(() => { const car = [...document.querySelectorAll('#lettres .touche.car')]; const tailles = car.map(g => g.querySelector('text.grande').getBoundingClientRect().height); const ds = car.map(g => g.querySelector('path.glyphe').getAttribute('d')); return Math.min(...tailles) >= 9 && new Set(ds).size >= car.length - 4; }));
v('touches en traits fins brillants (bords lumineux) sur bleu nuit', await p.evaluate(() => { const s = getComputedStyle(document.querySelector('#lettres .touche.car path')); return parseFloat(s.strokeWidth) <= 1.5 && /drop-shadow/.test(s.filter) && /rgb\(1[5-9]\d|rgb\(19\d/.test(s.stroke); }));
v('matrice de points lumineux qui s’estompe autour du clavier', await p.evaluate(() => /radial-gradient/.test(getComputedStyle(document.getElementById('plan'), '::before').backgroundImage) && /radial-gradient/.test(getComputedStyle(document.getElementById('plan'), '::before').maskImage || getComputedStyle(document.getElementById('plan'), '::before').webkitMaskImage || 'radial-gradient')));
v('barre d’espace longue, lumineuse, indépendante et flottante (hors de l’éventail)', await p.evaluate(() => { const e = document.getElementById('espace-svg'), plan = document.getElementById('plan'); const r = e.getBoundingClientRect(), pr = plan.getBoundingClientRect(); const s = getComputedStyle(e); return !plan.contains(e) && r.width > 400 && r.width > 8 * r.height && s.animationName !== 'none' && /drop-shadow/.test(s.filter) && r.top >= pr.bottom - 12; }));
// zone tactile exacte : chaque touche répond à son propre centre
const exact = await p.evaluate(() => { const bad = []; let n = 0; for (const g of document.querySelectorAll('.touche')) { const r = g.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const t = document.elementFromPoint(x, y); n++; if (!t || t.closest('.touche') !== g) bad.push(g.dataset.id + ' → ' + (t && t.closest('.touche') ? t.closest('.touche').dataset.id : t && t.tagName)); } return { n, bad }; });
v('zone tactile exacte sous le doigt : chaque touche (' + exact.n + ') répond à son centre malgré la perspective', exact.n >= 60 && exact.bad.length === 0, exact.bad.slice(0, 5).join(' | '));
// vrais doigts
await p.evaluate(() => window.ClavierEventail.mode('clavier')); await attendre(300);
let c = await centre(p, '[data-id="c-e"]'); await touche(p, cdp, c.x, c.y);
v('doigt sur « e » : rangée active en bleu plus vif, onde qui se propage, touche allumée', await p.evaluate(() => document.querySelectorAll('#lettres .touche.rang').length >= 9 && !!document.querySelector('#lettres .onde') && document.querySelector('[data-id="c-e"]').classList.contains('on')));
await lever(cdp); await attendre(200);
v('« e » tapé dans le champ de test (lettre AZERTY conservée)', await p.evaluate(() => window.ClavierEventail.etat().texte === 'e'));
v('relâché : rangée et onde retirées', await p.evaluate(async () => { await new Promise(r => setTimeout(r, 800)); return document.querySelectorAll('.touche.rang').length === 0 && document.querySelectorAll('.onde').length === 0; }));
c = await centre(p, '[data-id="espace"]'); await touche(p, cdp, c.x, c.y); await lever(cdp); await attendre(150);
v('barre d’espace flottante : un doigt écrit une espace', await p.evaluate(() => window.ClavierEventail.etat().texte === 'e '));
c = await centre(p, '[data-id="mars"]'); const evt = p.evaluate(() => new Promise(r => document.addEventListener('rayle:touche', e => { if (e.detail.type === 'commande') r(e.detail.touche); }, { once: true })));
await touche(p, cdp, c.x, c.y); await lever(cdp);
v('touche de l’éventail « Mars » : commande émise', (await Promise.race([evt, attendre(1500).then(() => 'rien')])) === 'mars');
c = await centre(p, '[data-id="echap"]'); const evt2 = p.evaluate(() => new Promise(r => document.addEventListener('rayle:touche', e => { if (e.detail.touche === 'Escape') r('Escape'); }, { once: true })));
await touche(p, cdp, c.x, c.y); await lever(cdp);
v('touche « Échap » : touche Escape émise', (await Promise.race([evt2, attendre(1500).then(() => 'rien')])) === 'Escape');
// textes d'état
v('texte d’état le long du bord : PRÊT', await p.evaluate(async () => { await new Promise(r => setTimeout(r, 1500)); return document.getElementById('bord-texte').textContent === 'PRÊT'; }));
await p.evaluate(() => document.getElementById('etat').click()); await attendre(200);
v('texte d’état le long du bord : VEILLE', await p.evaluate(() => document.getElementById('bord-texte').textContent === 'VEILLE' && document.getElementById('etat').textContent === 'VEILLE'));
await p.evaluate(() => document.getElementById('etat').click());
const p2 = await ouvrir(1024, 600);
v('texte d’état au démarrage : MISE SOUS TENSION', await p2.evaluate(() => document.getElementById('bord-texte').textContent === 'MISE SOUS TENSION'));
await p2.close();
// réglages conservés : gaucher / droitier, taille
await p.evaluate(() => { const s = document.getElementById('r-main'); s.value = 'droite'; s.dispatchEvent(new Event('change')); }); await attendre(300);
v('gaucher : l’éventail passe à droite (miroir), touches toujours exactes', await p.evaluate(() => { const arc = document.getElementById('arc').getBoundingClientRect(), le = document.getElementById('lettres').getBoundingClientRect(); const bad = [...document.querySelectorAll('.touche')].filter(g => { const r = g.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !t || t.closest('.touche') !== g; }); return arc.x > le.x && bad.length === 0; }));
await p.evaluate(() => { const s = document.getElementById('r-main'); s.value = 'gauche'; s.dispatchEvent(new Event('change')); const t = document.getElementById('r-taille'); t.value = 85; t.dispatchEvent(new Event('input')); }); await attendre(300);
v('taille réglable conservée', await p.evaluate(() => window.ClavierEventail.etat().reglages.taille === 85));
await p.evaluate(() => { const t = document.getElementById('r-taille'); t.value = 100; t.dispatchEvent(new Event('input')); document.getElementById('r-ok').click(); });
// pavé
await p.evaluate(() => window.ClavierEventail.mode('pave')); await attendre(500);
const pixels = () => p.evaluate(() => { const cv = document.getElementById('pave-cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, fort = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 10) { n++; if (d[i] > 200) fort++; } return { n, fort, w: cv.width }; });
const px0 = await pixels();
v('pavé : surface en matrice de points lumineux avec bords brillants', px0.n > 3000 && px0.fort > 200, JSON.stringify(px0));
v('pavé : coin incliné (découpe), indication d’état et aide des gestes en petit', await p.evaluate(() => { const e = document.getElementById('pave'); const s = getComputedStyle(e); return /polygon/.test(s.clipPath) && document.getElementById('pave-etat').textContent === 'PRÊT' && /double tap/.test(document.querySelector('.pave-aide').textContent) && parseFloat(getComputedStyle(document.querySelector('.pave-aide')).fontSize) <= 12; }));
const pv = await centre(p, '#pave');
await touche(p, cdp, pv.x - 60, pv.y, 60);
for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pv.x - 60 + i * 14, y: pv.y - i * 4, id: 1 }] }); await attendre(30); }
const px1 = await pixels();
v('pavé : anneau-curseur lumineux sous le doigt, traînée et onde, état « CONTACT »', await p.evaluate(() => /CONTACT/.test(document.getElementById('pave-etat').textContent)) && px1.fort > px0.fort + 30, JSON.stringify(px1));
await lever(cdp); await attendre(900);
v('pavé : au repos, l’état revient à « PRÊT » et la traînée s’efface', await p.evaluate(() => document.getElementById('pave-etat').textContent === 'PRÊT'));
// autres modes intacts
for (const m of ['rayle', 'pilotage', 'clavier']) { await p.evaluate(m => window.ClavierEventail.mode(m), m); await attendre(150); v('mode ' + m + ' toujours disponible', await p.evaluate(m => window.ClavierEventail.etat().mode === m && !document.getElementById('v-' + m).hidden, m)); }
v('aucune erreur de page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await b.close();
console.log('\n' + ok + ' OK, ' + ko + ' KO'); process.exit(ko ? 1 : 0);
