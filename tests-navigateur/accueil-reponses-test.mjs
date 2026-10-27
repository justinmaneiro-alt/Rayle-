// Fenêtres holographiques de réponse : quelles fenêtres, avec quelles données (réelles ou « indisponible »), animations, mise en page, modes.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };

// faux Worker : bougies synthétiques haussières pour le Nasdaq (dernière clôture connue), panne pour l'or
const BOUGIES = Array.from({ length: 250 }, (_, i) => { const c = 19000 + i * 4 + (i % 2 ? 6 : 0); return { t: i, o: c - 3, h: c + 5, l: c - 6, c, v: 100 }; });
const DERNIERE = BOUGIES.at(-1).c, AVANT = BOUGIES.at(-2).c;
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const rep = { '/ping': { ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' }, '/securite/etat': { appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 }, '/evenements': { alertes: [] }, '/reglages': { mode: 'normal' }, '/memoire': { notes: [] }, '/souvenirs': { items: [] } }[u.pathname];
  if (u.pathname === '/marche') {
    if (u.searchParams.get('actif') === 'XAU') { res.writeHead(502, cors); return res.end(JSON.stringify({ error: 'source en panne' })); }
    res.writeHead(200, cors); return res.end(JSON.stringify({ actif: u.searchParams.get('actif'), intervalle: '1day', source: 'Mock', differe: true, bougies: BOUGIES }));
  }
  res.writeHead(rep ? 200 : 404, cors); res.end(JSON.stringify(rep || { error: 'route inconnue' }));
});
await new Promise(r => srv.listen(8788, '127.0.0.1', r));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|502/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument((q, w) => { if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); else localStorage.removeItem('rayle_entite_qualite'); localStorage.removeItem('rayle_entite_niveau'); if (w) { localStorage.setItem('rayle_worker_url', 'http://127.0.0.1:8788'); localStorage.setItem('rayle_worker_token', 'test'); } else { localStorage.removeItem('rayle_worker_url'); localStorage.removeItem('rayle_worker_token'); } }, opts.qualite, opts.worker !== false);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  return p;
}
const dialoguer = (p, q, r) => p.evaluate((q, r) => { if (q) addLine('user', q); addLine('ray', r); }, q, r);
const fenetres = p => p.evaluate(() => Array.from(document.querySelectorAll('.pn:not(.hud-out)')).map(e => e.dataset.type));
const texte = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const css = (p, sel, prop, pseudo) => p.evaluate((s, q, ps) => { const e = document.querySelector(s); return e ? getComputedStyle(e, ps || null)[q] : null; }, sel, prop, pseudo || null);

let p = await page();
// 1. réponse courte : aucune fenêtre
await dialoguer(p, 'Bonjour', 'Bonjour Justin, je suis là.'); await attendre(700);
v('réponse courte : aucune fenêtre', (await fenetres(p)).length === 0);
// 2. heure
await dialoguer(p, 'Quelle heure est-il ?', 'Il est quinze heures trente.'); await attendre(900);
v('heure : fenêtre heure avec l\'horloge de l\'appareil', (await fenetres(p)).join() === 'holo-heure' && /^\d\d:\d\d:\d\d$/.test(await texte(p, '.pn [data-h]')), await texte(p, '.pn [data-h]'));
const t1 = await texte(p, '.pn [data-h]'); await attendre(2100);
v('heure : l\'horloge de la fenêtre avance', (await texte(p, '.pn [data-h]')) !== t1);
// 3. marché avec chiffres réels
await dialoguer(p, 'Où en est le Nasdaq ?', 'Le Nasdaq est à dix-neuf mille neuf cents points.'); await attendre(2200);
const marche = await p.evaluate(() => Array.from(document.querySelectorAll('.pn[data-type="holo-marche"] .pn-chiffre')).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const fmt = n => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const varPct = ((DERNIERE - AVANT) / AVANT) * 100;
v('marché : fenêtre marché, remplace la précédente', (await fenetres(p)).join() === 'holo-marche', (await fenetres(p)).join());
v('marché : cours = dernière clôture réelle du Worker', marche[0] && marche[0].replace(/\s| /g, '').includes(String(DERNIERE)), JSON.stringify(marche));
v('marché : variation réelle, signe correct', marche[1] && marche[1].includes((varPct >= 0 ? '+' : '') + varPct.toFixed(2).replace('.', ',')), marche[1]);
v('marché : RSI et EMA 200 calculés', /RSI 14\s*\d/.test(marche[2] || '') && /AU-DESSUS/.test(marche[3] || ''), JSON.stringify(marche.slice(2)));
v('marché : source et « données différées » annoncées', /Mock/.test(await texte(p, '.pn[data-type="holo-marche"]')) && /différées/.test(await texte(p, '.pn[data-type="holo-marche"]')));
v('marché : variation colorée selon le sens', await p.evaluate(() => !!document.querySelector('.pn-v.hausse, .pn-v.baisse')));
// 4. marché en panne : indisponible, jamais un faux chiffre
await dialoguer(p, "Et le prix de l'or ?", "L'or est à deux mille quatre cents dollars."); await attendre(2200);
const or = await texte(p, '.pn[data-type="holo-marche"]');
v('marché en panne : « indisponible » et la raison, aucun chiffre', /indisponible/.test(or) && /panne/.test(or) && !/\d{4}/.test(or.replace(/journalier/g, '')), or);
// 5. définition
await dialoguer(p, "C'est quoi le RSI ?", "Le RSI est un indicateur de force relative. Il oscille entre zéro et cent. Au-dessus de soixante-dix, on parle de surachat.");
await attendre(900);
v('définition : fenêtre définition, sujet et deux premières phrases', (await fenetres(p)).join() === 'holo-definition' && (await texte(p, '.holo-sujet')) === 'RSI' && /oscille/.test(await texte(p, '.holo-def')) && !/surachat/.test(await texte(p, '.holo-def')));
// 6. points clés + onde de la voix
await dialoguer(p, 'Explique-moi la situation', 'Le marché est calme ce matin. Le Nasdaq progresse de zéro virgule deux pour cent. Le dollar reste stable. Les annonces arrivent à quatorze heures trente. Prudence avant la séance américaine.');
await attendre(900);
const nbLi = await p.evaluate(() => document.querySelectorAll('.pn .rep-pts li').length);
v('points clés : 4 points au plus, onde présente (+ fenêtre marché car la réponse cite le Nasdaq)', (await fenetres(p)).includes('holo-points') && (await fenetres(p)).includes('holo-marche') && nbLi === 4 && (await p.evaluate(() => !!document.querySelector('.rep-onde'))), String(nbLi));
await p.evaluate(() => Entite.amplitude(() => 0.9)); await attendre(1200);
const amp = await p.evaluate(() => parseFloat(document.querySelector('.rep-onde').style.getPropertyValue('--amp')));
v('l\'onde suit l\'amplitude de la voix', amp > 0.3, String(amp));
await p.evaluate(() => Entite.amplitude(null));
// 7. animations d'ouverture
v('ouverture : balayage sobre (plus de scintillement)', (await css(p, '.pn', 'animationName')).includes('v1-balaye') && !(await css(p, '.pn', 'animationName')).includes('jv-scint'), await css(p, '.pn', 'animationName'));
v('plus de lignes de scan ni de trait lumineux visibles', (await css(p, '.pn-scan', 'display')) === 'none');
v('fond transparent (on voit l\'entité derrière)', await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.pn')).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); return !!m && (m[1].split(',').length === 4 ? parseFloat(m[1].split(',')[3]) < 0.6 : true); }));
v('titre de fenêtre sobre (gris-bleu, sans lueur)', await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.pn-tete h2')); return c.textShadow === 'none'; }));
// 8. mise en page : les fenêtres restent au-dessus de la barre de boutons ; le tableau de bord recule derrière
const geo = await p.evaluate(() => { const r = e => e.getBoundingClientRect(); const barre = r(document.getElementById('barre')); return { panneaux: Array.from(document.querySelectorAll('.pn')).length, audessus: Array.from(document.querySelectorAll('.pn')).every(e => r(e).bottom <= barre.top + 2), tableau: +getComputedStyle(document.querySelector('.tb-f')).opacity }; });
v('les fenêtres ne recouvrent pas la barre de boutons', geo.panneaux > 0 && geo.audessus, JSON.stringify(geo));
v('le tableau de bord recule derrière les fenêtres de réponse', geo.tableau < 0.4, String(geo.tableau));
// 9. images/s
const f = await p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
v('images/s avec des fenêtres ouvertes (≥ 55)', f >= 55, f + ' i/s');
// 10. nouvelle question : les anciennes fenêtres se referment ; Échap
await p.evaluate(() => addLine('user', 'merci')); await attendre(1000);
v('une nouvelle question range les fenêtres', (await fenetres(p)).length === 0);
await dialoguer(p, "C'est quoi le support ?", 'Un support est un niveau où le prix a déjà rebondi.'); await attendre(800);
await p.keyboard.press('Escape'); await attendre(900);
v('Échap ferme la dernière fenêtre', (await fenetres(p)).length === 0);
// 11. alerte de prix (donnée réelle déclenchée)
await p.evaluate(() => RayleBus.emit('raylé:alerte-prix', { actif: 'NASDAQ', texte: 'Le Nasdaq passe sous 19000', prix: 19000, t: Date.now() })); await attendre(900);
const al = await texte(p, '.pn[data-type="holo-alerte"]');
v('alerte de prix : fenêtre orange avec les vraies valeurs', /NASDAQ/.test(al) && /passe sous 19000/.test(al) && /19\s?000/.test(al), al);
v('l\'alerte reste quand une réponse arrive', await (async () => { await dialoguer(p, 'Merci', 'Avec plaisir Justin. Je reste attentive aux marchés pour toi.'); await attendre(700); return (await fenetres(p)).includes('holo-alerte'); })());
await p.evaluate(() => Panneaux.fermerTout()); await attendre(800);
// 12. erreurs : aucune fenêtre
await dialoguer(p, 'prix du nasdaq', 'Erreur : Worker injoignable'); await attendre(700);
v('message d\'erreur : aucune fenêtre', (await fenetres(p)).length === 0);
await p.close();

// Worker non configuré : indisponible, expliqué
p = await page({ worker: false });
await dialoguer(p, 'Prix du bitcoin ?', 'Le Bitcoin vaut soixante mille.'); await attendre(1500);
const sans = await texte(p, '.pn[data-type="holo-marche"]');
v('sans Worker : « indisponible » et pas de chiffre', /indisponible/.test(sans) && /verrouillé|configuré/i.test(sans) && !/\d{3}/.test(sans.replace(/journalier|14/g, '')), sans);
await p.close();

// modes
p = await page({ qualite: 2 });
await dialoguer(p, "C'est quoi le RSI ?", 'Le RSI est un indicateur de force relative.'); await attendre(900);
v('mode léger : pas de trait lumineux qui descend', (await css(p, '.pn-scan', 'display')) === 'none');
v('mode léger : pas de flou d\'arrière-plan', (await css(p, '.pn', 'backdropFilter')) === 'none');
await p.close();
p = await page({ qualite: 0 });
await dialoguer(p, "C'est quoi le RSI ?", 'Le RSI est un indicateur de force relative.'); await attendre(900);
v('mode complet : flou d\'arrière-plan léger', (await css(p, '.pn', 'backdropFilter')).includes('blur'));
await p.close();
p = await page({ reduire: true });
await dialoguer(p, "C'est quoi le RSI ?", 'Le RSI est un indicateur de force relative.'); await attendre(900);
v('animations réduites : simple fondu, pas de scintillement ni de trait', (await css(p, '.pn', 'animationName')) === 'none' && (await css(p, '.pn-scan', 'display')) === 'none');
await p.close();

// téléphone
p = await page({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } });
await dialoguer(p, 'Quelle heure est-il ? Explique-moi la situation du Nasdaq', 'Le marché est calme ce matin. Le Nasdaq progresse de zéro virgule deux pour cent. Le dollar reste stable. Les annonces arrivent à quatorze heures trente.'); await attendre(1500);
const tel = await p.evaluate(() => { const pn = document.querySelector('.pn'); const r = pn.getBoundingClientRect(); const bas = document.querySelector('.barre').getBoundingClientRect().top; return { gauche: r.left, droite: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth, bas: r.bottom, barre: bas }; });
v('téléphone : la fenêtre tient dans l\'écran, sans défilement horizontal', tel.gauche >= 0 && tel.droite <= tel.iw && tel.sw <= tel.iw, JSON.stringify(tel));
const pile = await p.evaluate(() => ({ wrap: document.querySelector('.pn-wrap').getBoundingClientRect().bottom, barre: document.querySelector('.barre').getBoundingClientRect().top, n: document.querySelectorAll('.pn').length }));
v('téléphone : toute la pile de fenêtres reste au-dessus des boutons', pile.n >= 1 && pile.wrap <= pile.barre, JSON.stringify(pile));
await p.close();

v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); srv.close(); process.exit(ko ? 1 : 0);
