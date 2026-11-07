/* Test Chrome du tableau de bord de l'or (parties A à D) avec les VRAIES données (Kraken, Binance, relais dédié, YouTube) :
   graphique = API Kraken (bougies closes, heure de Paris), milieu du carnet ≈ prix affiché, PC (carnet à droite) / téléphone (une colonne, pas de
   défilement horizontal), parité terminal de Mars = page or.html, outil Position, journal + gardien, ni musique ni télé dans la page (tuiles indépendantes : media-chrome-test.mjs), mode télé 1920 × 1080 + télécommande.
   Prérequis : node serveur.mjs 8011 (racine du dépôt).  Usage : node agent-trading/tests/or-chrome-test.mjs  (captures dans captures-or/, ignoré par git) */
import { createRequire } from 'node:module';
import fs from 'node:fs'; import path from 'node:path';
import { depuisKraken } from '../front/or/bougies-or.js';
import { decalage } from '../front/or/temps-or.js';
const require = createRequire(path.resolve('tests-navigateur/package.json'));
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011', SORTIE = path.resolve('captures-or'); fs.mkdirSync(SORTIE, { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let nOk = 0; const echecs = [], erreurs = [];
const verifier = (c, m, d = '') => { if (c) { nOk++; console.log('OK ', m); } else { echecs.push(m); console.log('ÉCHEC', m, d); } };
const w = ms => new Promise(r => setTimeout(r, ms));
async function page(l, h, mobile = false) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  if (mobile) await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  p.on('pageerror', e => erreurs.push(`${l}px : ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_BLOCKED|youtube|googlevideo|doubleclick|status of 404/i.test(m.text())) erreurs.push(`${l}px console : ${m.text().slice(0, 160)}`); });
  return p;
}
await nav.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);

/* ── PC 1600 × 900 ── */
const pc = await page(1600, 900); await pc.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await w(9000);
const g = await pc.evaluate(() => { const d = window.__or.graph.serie().data(); return { d: d.slice(-60), carnet: document.querySelector('.tor-carnet').getBoundingClientRect().left, graph: document.querySelector('.tor-graph').getBoundingClientRect().right, disp: document.querySelector('.tor').dataset.disposition }; });
verifier(g.disp === 'pc' && g.carnet >= g.graph - 2, 'PC : graphique à gauche, carnet à droite');
// graphique = API Kraken : mêmes prix pour les bougies closes, temps décalé de l'heure de Paris
const kr = depuisKraken(await (await fetch(`https://futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/15m?from=${Math.floor(Date.now() / 1000) - 70 * 900}`)).json());
const parT = new Map(kr.map(b => [Math.floor((b.t + decalage(b.t)) / 1000), b])); let communes = 0, diff = 0;
for (const x of g.d.slice(0, -2)) { const b = parT.get(x.time); if (!b) continue; communes++; if (b.o !== x.open || b.h !== x.high || b.l !== x.low || b.c !== x.close) diff++; }
verifier(communes >= 30 && diff === 0, `graphique M15 = API Kraken (heure de Paris) : ${communes} bougies comparées, ${diff} différentes`);
const v = await pc.evaluate(() => window.__or.valeurs());
verifier(v.carnet && Math.abs(v.carnet.milieu - v.prix) / v.prix < 0.001, `carnet : milieu ${v.carnet && v.carnet.milieu} ≈ prix affiché ${v.prix} (< 0,1 %)`);
verifier(v.zones.length >= 3 && v.zones.length <= 5, `3 à 5 zones de retournement (${v.zones.length})`);
verifier(/Biais H1/.test(v.lecture) && !/achète|vends|achat conseillé/i.test(v.lecture), 'lecture en français, sans ordre');
const couches = await pc.evaluate(() => [...document.querySelectorAll('[data-couche]')].map(c => c.dataset.couche));
verifier(couches.join() === 'sr,liquidite,fleches,volume', 'couches : supports et résistances, liquidité, flèches de rebond, zones de volume');
const sans = await pc.evaluate(() => document.body.innerText); verifier(!/\b(BTC|ETH|HYPE|Nasdaq|S&P)\b/.test(sans), 'aucun autre actif que l’or à l’écran');
verifier(await pc.evaluate(() => !!document.querySelector('.tv-lw-attribution, a[href*="tradingview"]')), 'attribution TradingView visible');
// réponse « on en est où »
verifier(/L’or est à/.test(await pc.evaluate(() => window.__or.repondre('Rayle, on en est où ?'))), '« Rayle, on en est où ? » répond');
// outil Position : 3 clics → ratio
const r = await pc.evaluate(() => { const lw = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: lw.left + lw.width * 0.4, y: lw.top + lw.height * 0.5 }; });
await pc.click('[data-a="position"]'); await pc.mouse.click(r.x, r.y); await w(600); await pc.mouse.click(r.x + 40, r.y + 60); await w(600); await pc.mouse.click(r.x + 80, r.y - 120); await w(400);
const pos = await pc.evaluate(() => ({ p: window.__or.graph.position(), t: document.querySelector('[data-pos]').textContent }));
verifier(pos.p && pos.p.entree && pos.p.stop && pos.p.objectif && /gain\/risque 2/.test(pos.t), 'outil Position : entrée, stop, objectif, gain/risque ≈ 2', pos.t);
await pc.screenshot({ path: path.join(SORTIE, 'pc-tableau.png') });
// journal → clôture → gardien → taille
const j = await pc.evaluate(async () => {
  const el = document.querySelector('[data-journal-bloc]'), f = el.querySelector('[data-j-saisie]'); el.querySelector('[data-a="j-depuis-position"]').click();
  f.taille.value = '2'; f.etiquette.value = 'support de volume'; f.raison.value = 'test automatique'; f.requestSubmit(); await new Promise(r => setTimeout(r, 300));
  const b = el.querySelector('[data-cloturer]'), L = b.closest('tr'); L.querySelector('[name=sortie]').value = f.stop.value || (window.__or.graph.position().stop); L.querySelector('[name=frais]').value = '0.8'; b.click();
  await new Promise(r => setTimeout(r, 500)); const T = window.__or.modules.journal.trades().filter(t => t.source === 'saisie');
  return { n: T.length, r: T.at(-1), jour: el.querySelector('[data-j-jour-lecture]').innerText, gardien: document.querySelector('[data-g-statut]').dataset.gStatut, taille: document.querySelector('[data-g-taille]').innerText };
});
verifier(j.n >= 1 && j.r.sortie > 0 && j.r.enrich && j.r.enrich.seance, 'journal : trade saisi, enrichi (séance, distances), clôturé', JSON.stringify(j.r && j.r.enrich));
verifier(/trade/.test(j.jour), 'journal du jour : lecture factuelle'); verifier(['ok', 'attention'].includes(j.gardien), 'gardien : statut affiché ' + j.gardien); verifier(/contrat/.test(j.taille), 'calculateur de taille en contrats', j.taille);
await pc.evaluate(() => document.querySelector('[data-journal-bloc]').scrollIntoView()); await w(300); await pc.screenshot({ path: path.join(SORTIE, 'pc-journal.png') });
await pc.evaluate(() => document.querySelector('[data-gardien-bloc]').scrollIntoView()); await w(300); await pc.screenshot({ path: path.join(SORTIE, 'pc-gardien.png') });
// barre du haut opaque : le contenu ne passe jamais en transparence dessous
await pc.evaluate(() => window.scrollTo(0, 500)); await w(300);
const barre = await pc.evaluate(() => { const b = document.querySelector('.tor-tete'), r = b.getBoundingClientRect(), fond = getComputedStyle(b).backgroundColor, dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { fond, dessus: b.contains(dessus), haut: r.top }; });
verifier(/^rgb\(/.test(barre.fond) && barre.dessus && barre.haut <= 1, 'barre du haut opaque et au-dessus du contenu en défilant', JSON.stringify(barre));
await pc.screenshot({ path: path.join(SORTIE, 'pc-barre-defilement.png') }); await pc.evaluate(() => window.scrollTo(0, 0));
// la page de l'or ne garde que graphique, carnet, lecture, journal, gardien et calculateur : ni musique ni télé
const blocs = await pc.evaluate(() => ({ mu: !!document.querySelector('[data-musique-bloc], [data-m="playlist"]'), tv: !!document.querySelector('[data-tele-bloc], [data-tc-form]'), txt: /Mode télé|Ma playlist fixe/.test(document.querySelector('.tor').innerText) }));
verifier(!blocs.mu && !blocs.tv && !blocs.txt, 'page de l’or : aucune section Musique ni Mode télé', JSON.stringify(blocs));
// la musique reste pilotable depuis la zone de demande (même lecteur unique que le reste de Rayle)
await pc.evaluate(() => window.__or.repondre('joue le mix')); await w(9000);
const m1 = await pc.evaluate(async () => { const M = await import('/agent-trading/front/or/media-rayle.js'), p = M.lecteur().lecteur(); return { pl: (p.getPlaylist() || []).length, etat: p.getPlayerState() }; });
verifier(m1.pl > 1 || m1.etat != null, `Mix lancé depuis la page de l’or par le lecteur commun (${m1.pl} morceaux, état ${m1.etat})`);
await pc.evaluate(() => window.__or.repondre('arrête la musique'));

/* ── parité : terminal de Mars (fenêtre de l'agent) = page or.html ── */
const mars = await page(1600, 900); await mars.goto(BASE + '/tc/', { waitUntil: 'domcontentloaded' });
await mars.evaluate(async () => { const m = await import('/agent-trading/front/fenetre-agent.js'); m.ouvrirFenetre(); }); await w(9000);
const [vm, vp] = [await mars.evaluate(() => window.TableauOr.valeurs()), await pc.evaluate(() => window.__or.valeurs())];
verifier(vm.zones.join() === vp.zones.join() && Math.abs(vm.prix - vp.prix) / vp.prix < 0.0005, 'Mars et le tableau de bord : mêmes zones, même prix', `${vm.prix} / ${vp.prix} · ${vm.zones} / ${vp.zones}`);
verifier(await mars.evaluate(() => /OR · TABLEAU DE BORD/.test(document.querySelector('.at-pc-barre').textContent)), 'fenêtre de Mars : tableau de bord de l’or');
verifier(await mars.evaluate(() => !document.querySelector('.at-pc [data-musique-bloc], .at-pc [data-tele-bloc]') && !!document.querySelector('.at-pc-barre [data-a="musique"]') && !!document.querySelector('.at-pc-barre [data-a="tele"]')), 'fenêtre « ◈ » de Mars : sans musique ni télé, boutons ♪ et 📺 vers les tuiles');
await mars.screenshot({ path: path.join(SORTIE, 'mars-fenetre.png') }); await mars.close();

/* ── téléphone 390 × 844 et tablette 820 × 1180 ── */
for (const [l, h, nom] of [[390, 844, 'telephone'], [820, 1180, 'tablette']]) {
  const t = await page(l, h, true); await t.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await w(9000);
  const d = await t.evaluate(() => ({ disp: document.querySelector('.tor').dataset.disposition, ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth, carnetSous: document.querySelector('.tor-carnet').getBoundingClientRect().top >= document.querySelector('.tor-graph').getBoundingClientRect().bottom - 2 }));
  verifier(d.disp === 'colonne' && d.carnetSous, `${nom} : une colonne (carnet sous le graphique)`); verifier(d.ovf <= 0, `${nom} : pas de défilement horizontal`, d.ovf);
  await t.screenshot({ path: path.join(SORTIE, `${nom}-tableau.png`) });
  for (const [s, f] of [['[data-journal-bloc]', 'journal'], ['[data-gardien-bloc]', 'gardien']]) { await t.evaluate(x => document.querySelector(x).scrollIntoView(), s); await w(250); await t.screenshot({ path: path.join(SORTIE, `${nom}-${f}.png`) }); }
  await t.close();
}

/* ── mode télé 1920 × 1080 + télécommande du téléphone ── */
const tv = await page(1920, 1080); await tv.goto(BASE + '/tv/', { waitUntil: 'domcontentloaded' }); await w(9000);
const code = await tv.evaluate(() => document.querySelector('[data-code]').textContent);
verifier(/^\d{4}$/.test(code), 'télé : code à 4 chiffres affiché ' + code);
const tvd = await tv.evaluate(() => ({ fs: parseFloat(getComputedStyle(document.querySelector('.tv')).fontSize), qr: document.querySelector('[data-qr]').width > 0, adr: /Rayle-\/tv/.test(document.body.innerText), prix: document.querySelector('[data-prix]').textContent }));
verifier(tvd.fs >= 26 && tvd.qr && tvd.adr && /\d/.test(tvd.prix), 'télé : gros textes, QR code, adresse courte, prix de l’or');
await tv.screenshot({ path: path.join(SORTIE, 'tele-1920x1080.png') });
const tc = await page(390, 844, true); await tc.goto(BASE + '/tc/?code=' + code, { waitUntil: 'domcontentloaded' }); await w(3000);
verifier(/Connectée/.test(await tc.evaluate(() => document.querySelector('[data-tc-etat]').textContent)), 'télécommande connectée par le code');
await tc.screenshot({ path: path.join(SORTIE, 'telecommande.png') });
await tc.evaluate(() => document.querySelector('[data-tc="terre"]').click()); await w(7000);
verifier(await tv.evaluate(() => window.__tele.vue() === 'terre' && !!window.__tele.terre()), 'commande « affiche la Terre » exécutée par la télé');
await tv.screenshot({ path: path.join(SORTIE, 'tele-terre.png') });
await tc.evaluate(() => document.querySelector('[data-tc="or"]').click()); await w(1500);
verifier(await tv.evaluate(() => window.__tele.vue() === 'or'), 'commande « affiche l’or »');
await tv.keyboard.press('ArrowRight'); verifier(await tv.evaluate(() => document.querySelector('.tv-bas .focus').dataset.b === 'terre'), 'navigation aux flèches de la télécommande');
await tc.close(); await tv.close(); await pc.close();
verifier(!erreurs.length, 'aucune erreur de page', erreurs.slice(0, 5).join(' | '));
await nav.close();
console.log(`\n${nOk} réussis, ${echecs.length} échecs`); process.exit(echecs.length ? 1 : 0);
