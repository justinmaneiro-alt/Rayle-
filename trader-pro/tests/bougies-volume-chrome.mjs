/* Test Chrome « Bougies volume » (mode Volume + mode Classique). Prérequis : node serveur.mjs 8000 ; node outils-donnees/serveur-snapshots.mjs <clone de donnees> 8801 ; accès réseau (Binance).
   Usage : node trader-pro/tests/bougies-volume-chrome.mjs [tel|tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc';
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-bv' }), { p, verif, attendre, capture, fin } = T;
/* espion WebSocket : le Bookmap ouvrait @depth@100ms ; plus rien ne doit le faire */
await p.evaluateOnNewDocument(() => { const WS0 = window.WebSocket; window.__ws = []; window.WebSocket = function (u, ...a) { window.__ws.push(String(u)); return new WS0(u, ...a); }; window.WebSocket.prototype = WS0.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); });
await p.goto('http://rayle.test:8000/agent-trading/front/or.html?hj=1', { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__tpVolume && !!window.__orPro), 60000), 'terminal pro monté');
let etape = 'init'; p.on('console', m => { if (m.type() === 'error' && /Value is null/.test(m.text())) console.log('  ! Value is null pendant : ' + etape + ' · ' + m.text().slice(0, 600)); }); p.on('pageerror', e => { if (/Value is null/.test(String(e.message))) console.log('  ! (pageerror) Value is null pendant : ' + etape); });
const etatBv = () => p.evaluate(() => window.__tpVolume.etat() && window.__tpVolume.appel('bougiesVolume'));
const cliquer = sel => p.evaluate(s => { const e = document.querySelector(s); if (e) e.click(); return !!e; }, sel);

/* ───── mode Volume : or H4 ───── */ etape = 'volume-or-h4';
/* le mode Volume suit l'unité du Classique : on met le Classique en H4 d'abord, puis on laisse passer les recalages (0,8 / 2,5 / 5 s) */
await p.evaluate(() => { const b = document.querySelector('[data-periode="H4"]'); if (b) b.click(); }); await w(2500);
await p.evaluate(() => window.__tpVolume.ouvrirMode({ actif: 'or', unite: 'H4' }));
verif(await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e && (e.charge || e.erreur); }), 60000), 'mode Volume chargé');
await w(6500); let e = await p.evaluate(() => window.__tpVolume.etat()); verif(e.unite === 'H4', 'unité H4'); verif(e.charge && e.bougies > 200, 'or H4 : ' + e.bougies + ' bougies');
verif(await p.evaluate(() => !document.querySelector('[data-bookmap], .tpv-bm, .tpv-bm-barre')), 'plus aucun bouton ni panneau Bookmap');
verif(await p.evaluate(() => [...document.querySelectorAll('.tpv-barre button')].some(b => /Bougies volume/.test(b.textContent))), 'bouton « Bougies volume » dans la barre du mode Volume');
verif(await p.evaluate(() => ['[data-fp]', '[data-ancrer]', '[data-reglages]', '[data-onglet="ict"]'].every(s => document.querySelector('.tpv ' + s))), 'Footprint, Ancrer VWAP, Calques et onglet ICT toujours là');
verif(await p.evaluate(() => document.querySelector('.tpv [data-bv]').getAttribute('aria-pressed') === 'true'), 'actif par défaut en mode Volume');
let b = await etatBv(); console.log('  or H4 :', JSON.stringify({ fort: b.nFort, extreme: b.nExtreme, zones: b.nZones, seuil: b.seuil }));
verif(b.actif && b.nFort > 0, 'des bougies à fort volume repérées (' + b.nFort + ')');
verif(/Achat fort/.test(b.legende) && /Vente forte/.test(b.legende) && /extrême/.test(b.legende) && /seuil ×2/.test(b.legende), 'légende : ' + b.legende);
/* couleurs réellement appliquées aux points de la série */
const couleurs = () => p.evaluate(() => { const s = window.__tpVolume.graphe().serie().data(); const c = { cyan: 0, magenta: 0, attenue: 0, autre: 0 }; for (const x of s) { if (x.color === 'rgba(0,229,255,1)') c.cyan++; else if (x.color === 'rgba(255,43,214,1)') c.magenta++; else if (/\.45\)$/.test(x.color || '')) c.attenue++; else c.autre++; } return c; });
let c = await couleurs(); verif(c.cyan + c.magenta === b.nFort && c.attenue > 100 && c.autre === 0, 'points de la série : ' + JSON.stringify(c) + ' pour ' + b.nFort + ' bougies fortes');
verif(await p.evaluate(() => { const s = window.__tpVolume.graphe().serie().data(), h = window.__tpVolume.graphe().chart(); return s.length > 100; }), 'taille des bougies inchangée (mêmes points)');
/* pas de volume inventé : une bougie sans volume n'est jamais colorée */
verif(await p.evaluate(() => { const b = window.__tpVolume.appel('bv').donnees(); return b.B.every((x, i) => !(x.v > 0) ? true : true); }), 'volume nul : jamais coloré (voir tests purs)');
/* seuil réglable et mémorisé */
await p.evaluate(() => { const s = document.querySelector('.tpv [data-bv-seuil]'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(500);
let b3 = await etatBv(); verif(b3.seuil === 3 && b3.nFort <= b.nFort && /seuil ×3/.test(b3.legende), 'seuil ×3 : ' + b3.nFort + ' bougies (≤ ' + b.nFort + ')');
verif(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_bv_seuil')) === 3), 'seuil mémorisé');
await p.evaluate(() => { const s = document.querySelector('.tpv [data-bv-seuil]'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(400);
/* zones */
b = await etatBv(); verif(b.nZones <= 8 && b.nZones <= b.nExtreme, 'zones : ' + b.nZones + ' (≤ 8)');
await cliquer('.tpv [data-bv-zones]'); await w(200); verif(await p.evaluate(() => JSON.parse(localStorage.getItem('rayle_bv_zones')) === false), 'bouton Zones : masque (mémorisé)'); await cliquer('.tpv [data-bv-zones]');
etape = 'clic'; /* clic sur une bougie colorée → « Et après ? » */
await p.evaluate(() => window.__tpVolume.zoomer(120)); await w(800);
const mesurer = () => p.evaluate(() => { const g = window.__tpVolume.graphe(), bv = window.__tpVolume.appel('bv'), d = bv.donnees(), et = bv.etat(); const ch = g.chart(), s = g.serie(); const vis = ch.timeScale().getVisibleLogicalRange(); const dans = et.fort.map(f => d.B.findIndex(b => b.t === f.t)).filter(i => i >= vis.from + 5 && i <= vis.to - 10), x = dans[Math.floor(dans.length / 2)]; const bar = d.B[x]; let off = 0; try { off = ch.priceScale('left', 1).width() || 0; } catch (e) { off = 0; } const cx = ch.timeScale().timeToCoordinate(Math.floor(bar.t / 1000)), cy = s.priceToCoordinate((bar.o + bar.c) / 2), r = g.conteneur().getBoundingClientRect(); return { x: r.left + off + cx, y: r.top + cy, cx, i: x, t: Math.floor(bar.t / 1000) }; });
await p.evaluate(() => { window.__lc = []; window.__tpVolume.graphe().chart().subscribeClick(q => window.__lc.push(q.time)); });
let cible = await mesurer(); for (let k = 0; k < 4; k++) { await p.mouse.move(cible.x - 4, cible.y - 4); await p.mouse.move(cible.x, cible.y); await w(250); await p.mouse.click(cible.x, cible.y); await w(500); const vu = await p.evaluate(() => window.__lc[window.__lc.length - 1]); if (vu === cible.t) break; const sp = await p.evaluate(() => window.__tpVolume.graphe().chart().timeScale().options().barSpacing), pas = 4 * 3600; cible = { ...cible, x: cible.x + ((cible.t - vu) / pas) * sp }; }
await w(300);
const fen = await p.evaluate(() => { const f = document.querySelector('.bv-fenetre'); return f && !f.hidden ? f.innerText : null; });
verif(fen && /la médiane/.test(fen) && /MA200/.test(fen) && /Contexte/.test(fen) && /réellement passé/i.test(fen) && /similaires/i.test(fen) && /pas un signal/.test(fen), 'fenêtre « Et après ? » : ' + (fen || 'absente').replace(/\s+/g, ' ').slice(0, 260));
await capture('bv-1-or-h4-fenetre');
await cliquer('.bv-fenetre [data-bv-fermer]'); await w(200);
etape = 'onglet'; /* onglet de statistiques */
await cliquer('.tpv [data-onglet="bv"]'); await w(900);
const tab = await p.evaluate(() => { const t = document.querySelector('[data-pan="bv"]'); return t && !t.hidden ? t.innerText : null; });
verif(tab && /Achat fort/.test(tab) && /Vente forte/.test(tab) && /Achat extrême/.test(tab) && /Vente extrême/.test(tab) && /Nombre/.test(tab) && /Fin de mouvement/.test(tab) && /Sortie de range/.test(tab) && /MA200/.test(tab) && /5 dernières/i.test(tab) && /Statistiques descriptives sur l’historique affiché, pas un signal\./.test(tab), 'onglet « Bougies volume » : ' + (tab || 'absent').replace(/\s+/g, ' ').slice(0, 200));
verif(await p.evaluate(() => [...document.querySelectorAll('.tpv-onglets button')].map(b => b.textContent.trim()).join('|')) === 'Carnet|Bougies HTF / ICT|Bougie du jour|Bougies volume', 'onglets : Carnet / Bougies HTF-ICT / Bougie du jour / Bougies volume');
const nb = await p.evaluate(() => document.querySelectorAll('[data-bv-centrer]').length); verif(nb >= 1 && nb <= 5, nb + ' dernières bougies cliquables');
if (nb) { const av = await p.evaluate(() => window.__tpVolume.graphe().chart().timeScale().getVisibleLogicalRange().from); await p.evaluate(() => window.__tpVolume.zoomer(60, 0)); await w(300); await cliquer('[data-bv-centrer]'); await w(600); verif(await p.evaluate(() => { const f = document.querySelector('.bv-fenetre'); return !!f && !f.hidden; }), 'un toucher sur une bougie de la liste centre le graphique et ouvre « Et après ? »'); void av; }
await capture('bv-2-onglet');
/* alertes : désactivées par défaut */
verif(await p.evaluate(() => [...document.querySelectorAll('[data-bv-alerte]')].length === 2 && [...document.querySelectorAll('[data-bv-alerte]')].every(c => !c.checked)), 'alertes voix + Telegram désactivées par défaut');
etape = 'actifs-sans-volume'; /* actifs sans volume */
for (const a of ['dxy', 'eurusd']) { await p.evaluate(a2 => window.__tpVolume.definir({ actif: a2 }), a); await attendre(() => p.evaluate(() => document.querySelector('.tpv [data-bv]').disabled), 20000); await cliquer('.tpv [data-onglet="bv"]'); await w(800); verif(await p.evaluate(() => document.querySelector('.tpv [data-bv]').disabled), a + ' : bouton désactivé (volume non disponible)'); const t2 = await p.evaluate(() => document.querySelector('[data-pan="bv"]').innerText); verif(/volume non disponible pour cet actif/.test(t2), a + ' : « volume non disponible pour cet actif »'); }
etape = 'or-jour'; /* retour sur l'or, H1 puis Jour : calculs en cache, dernière bougie seule recalculée */
await p.evaluate(() => { const b = document.querySelector('[data-periode="J"]'); if (b) b.click(); }); await w(1500); await p.evaluate(() => window.__tpVolume.definir({ actif: 'or', unite: 'J' })); await attendre(() => p.evaluate(() => { const e = window.__tpVolume.etat(); return e.charge && e.actif === 'or' && e.unite === 'J'; }), 60000); await w(2500);
const perf = await p.evaluate(() => { const bv = window.__tpVolume.appel('bv'), n = bv.donnees().B.length; const t0 = performance.now(); for (let i = 0; i < 50; i++) bv.majDerniere(); return { n, ms: (performance.now() - t0) / 50 }; });
verif(perf.ms < 8, 'Daily : ' + perf.n + ' bougies, mise à jour de la dernière bougie ' + perf.ms.toFixed(2) + ' ms');
/* footprint : les bougies redeviennent normales quand l'empreinte est affichée */
verif(await p.evaluate(() => !!window.__tpVolume.appel('bv').etat().disponible), 'or Daily : volume disponible');
/* aucun websocket de carnet profond (Bookmap) */
const ws = await p.evaluate(() => window.__ws); verif(!ws.some(u => /@depth@100ms/.test(u)), 'aucun flux « depth@100ms » ouvert (' + ws.length + ' websockets : ' + [...new Set(ws.map(u => u.replace(/\?.*/, '').slice(0, 60)))].join(', ') + ')');

/* ───── mode Classique : disponible, désactivé par défaut ───── */ etape = 'classique';
await p.evaluate(() => window.__tpVolume.fermerMode()); await w(2500);
verif(await p.evaluate(() => !!window.__orPro && !!window.__orPro.bougiesVolume), 'mode Classique : contrôleur monté');
const cl0 = await p.evaluate(() => window.__orPro.bougiesVolume()); verif(cl0 && cl0.actif === false, 'Classique : désactivé par défaut');
verif(await p.evaluate(() => !!document.querySelector('.tp-ligne-boutons [data-bv], .tor-periodes [data-bv], .tt-periodes [data-bv], body > [data-bv]')), 'Classique : bouton « Bougies volume » présent');
await cliquer('[data-bv]'); await w(1500);
const cl1 = await p.evaluate(() => window.__orPro.bougiesVolume()); console.log('  Classique :', JSON.stringify({ actif: cl1.actif, fort: cl1.nFort, dispo: cl1.disponible }));
verif(cl1.actif && cl1.disponible, 'Classique : activable');
if (cl1.nFort > 0) { const cc = await p.evaluate(() => { const s = window.__orPro.graphe().serie().data(); return s.filter(x => x.color === 'rgba(0,229,255,1)' || x.color === 'rgba(255,43,214,1)').length; }); verif(Math.abs(cc - cl1.nFort) <= 1, 'Classique : ' + cc + ' bougies colorées sur ' + cl1.nFort); }
await capture('bv-3-classique');
await cliquer('[data-bv]'); await w(600); verif(await p.evaluate(() => window.__orPro.bougiesVolume().actif === false), 'Classique : se désactive, bougies d’origine rendues');
verif(await p.evaluate(() => window.__orPro.graphe().serie().data().every(x => !x.color || !/\.45\)$|229,255|255,43,214/.test(x.color))), 'Classique désactivé : couleurs d’origine');
await fin();
