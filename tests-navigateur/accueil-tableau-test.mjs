// Accueil V1 : tableau de bord vivant (remplace accueil-hud-test.mjs). Décor supprimé, sept fenêtres réelles (données injectées, sans réseau),
// états de couleur, réglages et persistance, recul pendant une réponse, mode léger, animations réduites, téléphone, texte visible propre.
import puppeteer from 'puppeteer-core';
import { defautsTexte } from './texte-visible.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:8000', CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const erreurs = [];
async function page(opts = {}) {
  const p = await b.newPage(); await p.setViewport(opts.viewport || { width: 1600, height: 900 });
  if (opts.reduire) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/calendar|faireconomy|ERR_FAILED|404|Failed to load|CORS/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument((q, garder) => { if (q != null) localStorage.setItem('rayle_entite_qualite', String(q)); else localStorage.removeItem('rayle_entite_qualite'); localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!garder) localStorage.removeItem('rayle_tableau_bord'); window.__RAYLE_TB_TEST__ = { sansReseau: true }; }, opts.qualite == null ? null : opts.qualite, !!opts.garder);
  await p.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(opts.attente || 3500);
  return p;
}
const css = (p, sel, prop) => p.evaluate((s, q) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[q] : null; }, sel, prop);
const injecter = p => p.evaluate(() => {
  const TB = window.TableauBord, now = Date.now(); TB.definirReglages({ meteo: { nom: 'Pau', lat: 43.3, lon: -0.37 } });
  const serie = (a, c, n = 40) => Array.from({ length: n }, (_, i) => a + (c - a) * i / n + Math.sin(i) * (c - a) * 0.05);
  TB.injecter('meteo', { etat: 'ok', nom: 'Pau', temp: 14.2, ressenti: 12.8, categorie: 'pluie', libelle: 'Pluie', vent: 18, pluie: 0.4, jours: [{ jour: 'auj.', min: 9, max: 16 }, { jour: 'sam.', min: 10, max: 15 }, { jour: 'dim.', min: 8, max: 18 }] });
  TB.injecter('actus', { titres: Array.from({ length: 6 }, (_, i) => ({ titre: 'Titre d’actualité numéro ' + (i + 1), source: 'Source ' + i, quand: 'il y a ' + (i + 1) + ' h', couleur: '#8fd0e3' })), perime: false });
  TB.injecter('marche', { lignes: [{ id: 'BTC', nom: 'BTC', prix: 67890.4, decimales: 1, pct: 1.23, courbe: serie(66000, 67900), t: now }, { id: 'SOL', nom: 'SOL', prix: 152.31, decimales: 2, pct: -0.84, courbe: serie(156, 152), t: now }, { id: 'DOGE', nom: 'DOGE', prix: 0.16421, decimales: 5, pct: 2.4, courbe: serie(0.15, 0.164), t: now }, { id: 'XAU', nom: 'Or', vide: true, erreur: 'aucune donnée' }, { id: 'US100', nom: 'US100', prix: 20512.4, decimales: 1, pct: -0.42, courbe: serie(20650, 20512), t: now, differe: true }] });
  TB.injecter('terre', { lignes: [{ id: 'a', type: 'seisme', titre: 'M 5.6 · Chili', severite: 3, age: 'il y a 1 h' }], etiquette: 'reel' });
  TB.injecter('reels', { 'gardien-prop': { etat: 'ok', pied: 'ORANGE · marge 120 $' }, 'regime-marche': { etat: 'bientot', message: 'calcul en cours' }, 'propositions-agent': { etat: 'ok', etiquette: 'SIMULÉ', liste: [{ g: 'BTC ACHAT · Cassure', d: 'PASS' }] } });
  TB.injecter('pilote', { paires: ['BTC'], enRecherche: false, valides: 0 });
});

let p = await page(); await injecter(p); await attendre(800);
const ids = await p.evaluate(() => [...document.querySelectorAll('.tb-f')].map(e => e.dataset.id));
v('sept fenêtres : heure, météo, actualités, système, agent, marché, Terre', ids.length === 7 && ['heure', 'meteo', 'actus', 'systeme', 'agent', 'marche', 'terre'].every(i => ids.includes(i)), ids.join());
v('décor supprimé : plus d’anneaux, de coins, d’échelles, de radar, de hexagones, d’objets en orbite', await p.evaluate(() => ['.hud-anneaux', '.hud', '.jv-coin', '.jv-echelle', '.jv-donnees', '.hud-vivant', '.hud-objets', '.amb', '.jv-scan'].every(s => !document.querySelector(s))));
v('aucune trame de lignes sur l’accueil', await p.evaluate(() => ![...document.querySelectorAll('.tb, .tb *')].some(e => /repeating/.test(getComputedStyle(e).backgroundImage))));
v('les fenêtres sont dans l’écran, sans chevaucher l’entité', await p.evaluate(() => { const r = document.getElementById('reactor').getBoundingClientRect(); return [...document.querySelectorAll('.tb-f')].every(e => { const q = e.getBoundingClientRect(); return q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight && (q.right < r.left + r.width * .2 || q.left > r.right - r.width * .2); }); }));
v('aucune fenêtre coupée par le bas de la colonne', await p.evaluate(() => [...document.querySelectorAll('.tb-col')].every(c => { const f = c.lastElementChild.getBoundingClientRect(), k = c.getBoundingClientRect(); return f.bottom <= k.bottom + 1; })));
const h1 = await p.evaluate(() => document.querySelector('[data-id=heure] [data-z=s]').textContent); await attendre(2200);
const h2 = await p.evaluate(() => document.querySelector('[data-id=heure] [data-z=s]').textContent);
v('l’horloge avance', /^\d\d$/.test(h1) && h1 !== h2, h1 + ' → ' + h2);
v('marché : prix, variation colorée selon le sens, mini-courbes tracées', await p.evaluate(() => { const r = document.querySelector('.tb-m[data-i=BTC]'); return /67\s890,4/.test(r.querySelector('.tb-p').textContent.replace(/[\u202f\u00a0]/g, ' ')) && r.querySelector('.tb-v').dataset.s === '1' && document.querySelector('.tb-m[data-i=SOL] .tb-v').dataset.s === '-1' && r.querySelector('path').getAttribute('d').startsWith('M'); }));
v('marché : une ligne sans donnée dit « indispo. », pas de faux prix', await p.evaluate(() => { const r = document.querySelector('.tb-m[data-i=XAU]'); return r.classList.contains('vide') && /indispo/.test(r.textContent); }));
v('marché : étiquette DIFFÉRÉ quand une source est différée', (await p.evaluate(() => document.querySelector('[data-id=marche] .tb-et').textContent)) === 'DIFFÉRÉ');
v('agent : gardien orange, signal simulé étiqueté, régime absent = tiret', await p.evaluate(() => { const t = document.querySelector('[data-id=agent]').textContent; return /ORANGE/.test(t) && /simulé/.test(t) && /RÉGIME\s*—|Régime\s*—/i.test(t.replace(/\s+/g, ' ')) && document.querySelector('[data-id=agent] .tb-et').textContent === 'SIMULÉ'; }));
v('système : worker verrouillé (donnée réelle), micro coupé', await p.evaluate(() => { const t = document.querySelector('[data-id=systeme]').textContent; return /VERROUILL/.test(t) && /COUP/.test(t); }));
v('météo : température, ressenti, trois jours', await p.evaluate(() => { const t = document.querySelector('[data-id=meteo]').textContent; return /14°/.test(t) && /ressenti 13°/.test(t) && document.querySelectorAll('[data-id=meteo] .tb-jours span').length === 3; }));
v('météo sans ville : invitation à en choisir une', await p.evaluate(() => { window.TableauBord.definirReglages({}); return true; }) && /Aucune ville choisie/.test(await p.evaluate(() => document.querySelector('[data-id=meteo]').textContent)));
await injecter(p);
const sale = await defautsTexte(p, '.tb'); v('texte visible du tableau : jamais « undefined », « NaN », « [object Object] »', sale && sale.length === 0, sale ? sale.join(' | ') : 'absent');

// couleurs d'état
const couleur = () => p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--jv').trim());
const par = {};
for (const e of ['idle', 'veille', 'listening', 'thinking', 'speaking']) { await p.evaluate(x => RayleBus.fusion('raylé', { etat: x }), e); await attendre(150); par[e] = await couleur(); }
v('couleur par état : trois états du micro (coupé gris, veille cyan, actif cyan vif) + réflexion sable + parole blanche', par.idle === '#7f939f' && par.veille === '#8fd0e3' && par.listening === '#6fd3ee' && par.thinking === '#c9b27a' && par.speaking === '#e6f4f8', JSON.stringify(par));
await p.evaluate(() => RayleBus.fusion('raylé', { etat: 'veille' })); await attendre(1300);
v('système : le micro suit l’état (VEILLE)', await p.evaluate(() => /VEILLE/.test(document.querySelector('[data-id=systeme]').textContent)));
await p.evaluate(() => RayleBus.emit('raylé:alerte', { ms: 1200 })); await attendre(200);
v('alerte : orange sobre', (await couleur()) === '#e9a23b', await couleur());
await attendre(1600); v('l’alerte se termine', (await couleur()) !== '#e9a23b');
await p.evaluate(() => RayleBus.fusion('raylé', { etat: 'idle' }));

// recul quand Raylé répond
const op = () => p.evaluate(() => +getComputedStyle(document.querySelector('.tb-f[data-id=marche]')).opacity);
await p.evaluate(() => window.Panneaux.fermerTout()); await attendre(1200);
const avant = await op();
await p.evaluate(() => window.Panneaux.ouvrir({ id: 'rep', type: 'holo-reponse', titre: 'Réponse', etat: 'reel', corps: 'Le Bitcoin vaut 67 890 dollars.' })); await attendre(900);
const pendant = await op();
v('réponse : le tableau recule (atténué, flou) derrière la réponse', avant > 0.9 && pendant < 0.4 && (await css(p, '.tb-f[data-id=marche]', 'filter')) !== 'none', avant + ' → ' + pendant);
v('réponse : la fenêtre de réponse est au premier plan et lisible', await p.evaluate(() => { const r = document.querySelector('#panneaux .pn').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e.closest('.pn'); }));
v('réponse : pastille d’état dans l’en-tête', await p.evaluate(() => document.querySelector('#panneaux .pn .pn-etat').textContent === 'RÉEL'));
await p.evaluate(() => window.Panneaux.fermerTout()); await attendre(1400);
v('fermeture : retour animé au tableau de bord', (await op()) > 0.9, String(await op()));

// clic sur une fenêtre = vue complète
await p.evaluate(() => window.TableauBord.ouvrir('meteo')); await attendre(500);
v('clic météo : vue complète en panneau', await p.evaluate(() => /Pluie/.test((document.querySelector('#panneaux .pn[data-id="tb-meteo"]') || { textContent: '' }).textContent)));
await p.evaluate(() => window.Panneaux.fermerTout());
await p.click('.tb-f[data-id=systeme]'); await attendre(600);
v('clic système : ouvre les réglages', await p.evaluate(() => document.getElementById('cfg').classList.contains('open')));

// réglages : masquer, déplacer, persister
v('réglages : section « Tableau de bord » avec une ligne par fenêtre', await p.evaluate(() => document.querySelectorAll('#tbReglages .tb-rr').length === 7));
await p.evaluate(() => { const c = document.querySelector('#tbReglages [data-r=vis][data-id=terre]'); c.click(); });
await attendre(400);
v('réglages : masquer « Événements Terre » la retire', await p.evaluate(() => !document.querySelector('.tb-f[data-id=terre]')));
await p.evaluate(() => document.querySelector('#tbReglages [data-r=cote][data-id=meteo]').click()); await attendre(400);
v('réglages : changer de côté déplace la météo à droite', await p.evaluate(() => !!document.querySelector('.tb-col.d .tb-f[data-id=meteo]')));
await p.evaluate(() => document.querySelector('#tbReglages [data-r=haut][data-id=actus]').click()); await attendre(300);
v('réglages : monter une fenêtre change l’ordre', await p.evaluate(() => [...document.querySelectorAll('.tb-col.g .tb-f')].map(e => e.dataset.id)[0] === 'actus' || [...document.querySelectorAll('.tb-col.g .tb-f')].map(e => e.dataset.id).indexOf('actus') < [...document.querySelectorAll('.tb-col.g .tb-f')].map(e => e.dataset.id).indexOf('systeme')));
await p.evaluate(() => { document.querySelector('#tbReglages [data-r=actif]').click(); }); await attendre(300);
v('réglages : tableau coupé = aucune fenêtre', await p.evaluate(() => getComputedStyle(document.getElementById('tableau')).display === 'none'));
await p.evaluate(() => { document.querySelector('#tbReglages [data-r=actif]').click(); }); await attendre(300);
const sauve = await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_tableau_bord')));
v('réglages : enregistrés sur l’appareil seulement', sauve && sauve.fenetres.terre.visible === false && sauve.fenetres.meteo.cote === 'd');
await p.close();
p = await page({ garder: true });
v('persistance : après rechargement, mêmes réglages', await p.evaluate(() => !document.querySelector('.tb-f[data-id=terre]') && !!document.querySelector('.tb-col.d .tb-f[data-id=meteo]')));
await p.evaluate(() => localStorage.removeItem('rayle_tableau_bord')); await p.close();

// terminal : tout s'arrête
p = await page(); await injecter(p);
await p.click('#btnOuvrirTerminal'); await attendre(2500);
v('terminal ouvert : tableau caché et en pause', (await css(p, '#tableau', 'display')) === 'none' && (await p.evaluate(() => document.body.classList.contains('tb-pause'))));
await p.evaluate(() => RayleBus.emit('vue:demande', { vue: 'rayle' })); await attendre(1500);
v('retour à l’accueil : le tableau revient', (await css(p, '#tableau', 'display')) !== 'none' && !(await p.evaluate(() => document.body.classList.contains('tb-pause'))));
await p.close();

// mode léger
p = await page({ qualite: 2 }); await injecter(p); await attendre(800);
v('mode léger : quatre fenêtres essentielles', await p.evaluate(() => document.body.dataset.hud === 'leger' && [...document.querySelectorAll('.tb-f')].map(e => e.dataset.id).sort().join() === 'agent,heure,marche,systeme'));
v('mode léger : aucune animation continue ni flou d’arrière-plan', (await css(p, '.tb-f', 'animationName')) === 'none' && (await css(p, '.tb-spark circle', 'animationName')) === 'none');
await p.close();
// animations réduites
p = await page({ reduire: true }); await injecter(p); await attendre(500);
v('« réduire les animations » : aucune animation du tableau', (await css(p, '.tb-f', 'animationName')) === 'none' && (await css(p, '.tb-sec .arc', 'animationName')) === 'none');
await p.close();
// téléphone
p = await page({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } });
const larg = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
v('téléphone : pas de défilement horizontal, tableau caché (écran trop étroit)', larg.sw <= larg.iw && (await css(p, '#tableau', 'display')) === 'none', JSON.stringify(larg));
v('téléphone : boutons ≥ 44 px', await p.evaluate(() => [...document.querySelectorAll('.barre button')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 44))));
await p.close();
// vitesse (information : le GPU doit être libre pour que la mesure ait un sens)
p = await page(); await injecter(p);
const fps = await p.evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(f); })`);
console.log('INFO images/s de la page avec le tableau de bord : ' + fps + (fps < 55 ? ' (sous 55 : vérifier que le GPU n’est pas occupé par un autre programme)' : ''));
await p.close();
v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
console.log(`${ok} OK, ${ko} KO`); await b.close(); process.exit(ko ? 1 : 0);
