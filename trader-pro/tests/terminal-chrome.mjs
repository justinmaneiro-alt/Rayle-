/* Test Chrome du terminal « pro » H4 / Jour (or.html). Usage : node trader-pro/tests/terminal-chrome.mjs [tel|tablette|pc] */
import { lancer, w } from './aide-chrome.mjs';
const vieux = Array.from({ length: 12 }, (_, i) => ({ id: 'or|' + i + '|-1|cassure', type: 'cassure', dir: -1, t: Date.now() - (i + 5) * 864e5, tFin: Date.now() - (i + 5) * 864e5 + 144e5, entree: 4000, stop: 4100, R: 100, zone: '20 dernières bougies H4', vueLe: 1 }));
const mode = process.argv[2] || 'pc', T = await lancer(mode, { stockage: { rayle_tp_ma1_or: vieux, 'rayle_tp_ma2_or_V0-base-r1': vieux } }), { p, verif, attendre, capture } = T;
const url = 'http://rayle.test:8000/agent-trading/front/or.html?hj=1';
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
verif(await attendre(() => p.evaluate(() => !!window.__orPro), 60000), 'le terminal pro est monté');
verif(await attendre(() => p.evaluate(() => window.__orPro && window.__orPro.etat().ma.length === 1), 30000), 'UNE seule MA200 sur le graphique');
verif(await p.evaluate(() => [...document.querySelectorAll('[data-periode]')].map(b => b.dataset.periode).join() === 'H1,H4,J'), 'unités proposées : H1, H4, Jour seulement (plus de M5 ni M15)');
await w(2500); const e = await p.evaluate(() => window.__orPro.etat()); console.log('  état :', JSON.stringify(e));
verif(e.niveaux >= 2 && e.niveaux <= 6, 'niveaux forts : ' + e.niveaux + ' (6 au plus)');
verif(await p.evaluate(() => Object.values(window.__or.graph.couches()).every(v => v === false)), 'graphique propre : tous les calques sont désactivés par défaut');
verif(await p.evaluate(() => [...document.querySelectorAll('.tor-graph-barre, .tor-ft-ligne, .tt-fl')].every(b => getComputedStyle(b).display === 'none')), 'barres d’outils secondaires masquées (derrière « Détails »)');
verif(await p.evaluate(() => { const s = document.querySelector('.tor-graph-source'); return !s || getComputedStyle(s).display === 'none'; }), 'ligne des sources masquée');
verif(await p.evaluate(() => [...document.querySelectorAll('.tp-b-details, .tp-b-hj')].length === 2 && [...document.querySelectorAll('.tp-b-details, .tp-b-hj')].every(b => { const r = b.getBoundingClientRect(); return r.width > 30 && r.height > 20 && r.right <= innerWidth + 1 && getComputedStyle(b).visibility !== 'hidden'; })), 'boutons « Détails » et « Signaux H4 / J » visibles à l’écran');
const labels = await p.evaluate(() => { const g = window.__or.graph; return g.chart().panes().length; }); verif(labels >= 1, 'graphique présent');
await capture('terminal-propre');
console.log('— unités de temps : UNE moyenne, celle de l’unité affichée —');
for (const per of ['H1', 'H4', 'J']) {
  await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), per); await w(9000);
  verif(await p.evaluate(() => window.__orPro.etat().ma.length === 1 && window.__or.moteur.serie().length > 200), per + ' : une seule série de moyenne, bougies présentes');
  const lg = await p.evaluate(() => [...document.querySelectorAll('.tp-ma-legende span:not(.tp-version)')].map(x => x.textContent)); verif(lg.length === 1 && lg[0].startsWith('MA200 ' + (per === 'J' ? 'Jour' : per)), per + ' : le bandeau n’affiche que la MA200 de l’unité (' + lg.join(' | ') + ')');
  verif(/prix [\d,]+ % (au-dessus|sous)/.test(lg[0] || ''), per + ' : le bandeau donne la distance du prix en %');
  const ma = await p.evaluate(() => { const B = window.__or.moteur.serie(), n = 200; let s = 0; for (const b of B.slice(-n)) s += b.c; return s / n; }); const val = await p.evaluate(() => (document.querySelector('.tp-ma-legende span:not(.tp-version)') || {}).textContent || '');
  const num = +(val.match(/MA200 \S+ ([\d\s  ]+) ·/) || [0, '0'])[1].replace(/\s/g, ''); verif(Math.abs(num - ma) <= 1, per + ' : la valeur affichée (' + num + ') est la SMA des 200 dernières bougies affichées (' + Math.round(ma) + ')');
  const niv = await p.evaluate(() => window.__orPro.niveaux().map(n => ({ nom: n.nom, src: n.src, cote: n.cote, y: n.y })));
  verif(niv.filter(n => n.cote === 'R').length <= 3 && niv.filter(n => n.cote === 'S').length <= 3, per + ' : 3 niveaux au plus de chaque côté (' + niv.length + ')');
  verif(niv.every(n => n.src === per || n.src === 'J'), per + ' : niveaux de l’unité affichée et du Jour seulement');
  const ys = niv.map(n => n.y).filter(Number.isFinite).sort((x, y) => x - y); verif(ys.every((y, i) => i === 0 || y - ys[i - 1] >= 22), per + ' : aucune étiquette ne chevauche une autre (écart mini ' + Math.round(Math.min(...ys.slice(1).map((y, i) => y - ys[i]), 999)) + ' px)');
  verif(await attendre(() => p.evaluate(() => { const r = window.__or.graph.chart().timeScale().getVisibleLogicalRange(), n = window.__or.moteur.serie().length; return !!r && r.to >= n - 12 && r.from < n; }), 15000), per + ' : la dernière bougie est visible (vue sur les dernières bougies)'); await capture('terminal-' + per);
}
console.log('— un seul prix de l’or —');
await p.evaluate(() => { window.TraderPro = { prixOr: async () => ({ prix: 3886.12, t: Date.now(), reference: true, ferme: true, pct: 0.4, source: 'XAU/USD au comptant (test)', note: 'Marché fermé : dernier cours de clôture, comme sur XTB. ' }) }; return window.__orPro.majSpot(); }); await w(2500);
const tete = await p.evaluate(() => ({ prix: document.querySelector('[data-or-prix]').textContent, v: document.querySelector('[data-or-var]').textContent, etiq: document.querySelector('.tor-titre small').textContent }));
verif(/3\s?886,12/.test(tete.prix.replace(/[\u202F\u00A0]/g, ' ')), 'l’en-tête affiche le prix de référence (' + tete.prix + ')'); verif(/marché fermé/.test(tete.v), 'mention « marché fermé » : ' + tete.v); verif(/Kraken/.test(tete.etiq) && /XAU/.test(tete.etiq), 'étiquette : ' + tete.etiq);
verif(await p.evaluate(() => !document.body.innerText.includes('Période de réglage')), 'plus de « Période de réglage » à l’écran');
console.log('— MA200 : une par graphique, calculée sur sa propre unité, tracée dès le début de l’écran —');
for (const per of ['H1', 'H4', 'J']) {
  await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), per); await w(9000);
  const r = await p.evaluate(() => { const B = window.__or.moteur.serie(), pts = window.__orPro.maPoints(), rg = window.__or.graph.chart().timeScale().getVisibleLogicalRange(); let s = 0; for (const b of B.slice(0, 200)) s += b.c; return { n: B.length, pts: pts.length, de: rg ? Math.ceil(rg.from) : null, s200: s / 200, premier: pts.length ? pts[0].value : null, dernier: pts.length ? pts[pts.length - 1].value : null, derC: B.slice(-200).reduce((a, b) => a + b.c, 0) / 200, pas: B.length > 2 ? B[B.length - 1].t - B[B.length - 2].t : 0, info: window.__orPro.maInfo() }; });
  console.log('  ' + per + ' : ' + r.n + ' bougies, ' + r.pts + ' points de MA200, bord gauche de l’écran = bougie ' + r.de + ', pas ' + r.pas / 3600e3 + ' h, source : ' + (r.info && r.info.source));
  const prolonge = r.n < 450;   // historique court (or en Daily : quelques mois chez Kraken) : complété AVANT la première bougie par la série de la même unité du robot
  verif(r.n >= 300 && (prolonge ? r.pts === r.n : r.pts === r.n - 199 && Math.abs(r.premier - r.s200) < 0.01 * r.s200 + 1), per + ' : la MA200 est calculée sur les bougies ' + per + ' (' + r.pts + ' points sur ' + r.n + ' bougies' + (prolonge ? ', historique complété avant la première bougie par la série ' + per + ' du robot' : ', la première = moyenne des 200 premières') + ')');
  verif(Math.abs(r.dernier - r.derC) <= 1, per + ' : la dernière valeur (' + Math.round(r.dernier) + ') est la moyenne des 200 dernières bougies ' + per + ' (' + Math.round(r.derC) + ')');
  verif(r.de != null && r.de >= (prolonge ? 0 : 199), per + ' : la MA200 existe dès le bord gauche de l’écran (bougie ' + r.de + ', MA200 dès la bougie ' + (prolonge ? 0 : 199) + ')');
  verif(per === 'H1' ? Math.abs(r.pas - 3600e3) < 1 : per === 'H4' ? Math.abs(r.pas - 4 * 3600e3) < 1 : Math.abs(r.pas - 86400e3) < 1, per + ' : bougies de l’unité ' + per + ' (jamais celles d’une autre unité)');
  verif(await p.evaluate(() => window.__orPro.etat().ma.length === 1 && [...document.querySelectorAll('.tp-ma-legende span:not(.tp-version)')].length === 1), per + ' : une seule ligne MA200');
  verif(await p.evaluate(() => { const k = window.__or.graph.couches(), m = window.__or.strategie.modele() || {}; return k.rayMa === false && Object.values(k).every(v => v === false) && !m.ma && !(m.boites || []).length && !(m.structure || []).length; }), per + ' : aucune autre MA200 (celle de la stratégie H1 est coupée), graphique propre conservé après le changement d’unité');
}
console.log('— MA200 Daily + H4 : grosses flèches (Daily) et petites flèches (H4) —');
await p.evaluate(() => document.querySelector('[data-periode="J"]').click()); await w(8000);
const fl = await p.evaluate(() => window.__orPro.fleches().map(x => ({ type: x.type, dir: x.dir, t: x.t, tFin: x.tFin, entree: x.entree, stop: x.stop })));
const sensTab = await p.evaluate(() => window.__orPro.sens());
verif(fl.every(x => x.type !== 'cassure') && await p.evaluate(() => !localStorage.getItem('rayle_tp_ma1_or') && !localStorage.getItem('rayle_tp_ma2_or_V0-base-r1')), 'ancien registre sur l’appareil (12 petites flèches « cassure ») : supprimé, aucune ancienne flèche affichée (' + fl.length + ' flèches)');
verif(await p.evaluate(() => { const e = document.querySelector('.tp-ma-legende .tp-version'); if (!e) return false; const r = e.getBoundingClientRect(), g = window.__or.graph.conteneur().getBoundingClientRect(); return /^v\d{4}\.\d+\.\d+\.\d+$/.test(e.textContent) && e.textContent === 'v' + window.RAYLE_OR_VERSION && window.__tpVersion === window.RAYLE_OR_VERSION && r.width > 20 && r.left >= g.left && r.right <= g.right && r.top >= g.top && r.bottom <= g.bottom; }), 'le numéro de version est affiché en petit sur le graphique (' + await p.evaluate(() => (document.querySelector('.tp-ma-legende .tp-version') || {}).textContent) + ') et correspond à la page et au code chargé');
verif(fl.length >= 6 && fl.length <= 40 && fl.some(x => x.type === 'grosse') && fl.some(x => x.type !== 'grosse') && fl.every(x => (x.dir === 1 || x.dir === -1) && x.entree > 0 && x.stop > 0 && (x.dir > 0 ? x.stop < x.entree : x.stop > x.entree)), 'des flèches existent : grosses (' + fl.filter(x => x.type === 'grosse').length + ') et petites (' + fl.filter(x => x.type !== 'grosse').length + '), stop du bon côté de l’entrée');
verif(sensTab.length >= 1000 && sensTab.every(x => [-1, 0, 1].includes(x.sens)) && sensTab.some(x => x.sens === 1) && sensTab.some(x => x.sens === -1) && sensTab.some(x => x.sens === 0), 'sens Daily sur plus de 3 ans (' + sensTab.length + ' bougies) : haussier, baissier et neutre');
const dernierSens = t => { let s = 0; for (const x of sensTab) { if (x.tFin <= t) s = x.sens; else break; } return s; };
verif(fl.filter(x => x.type !== 'grosse').every(x => x.dir === dernierSens(x.t)) && fl.filter(x => x.type === 'grosse').every((g, i, L) => i === 0 || g.dir !== L[i - 1].dir), 'jamais de flèche contradictoire : chaque petite flèche est dans le sens Daily, les grosses alternent');
const marq = {}, attJ = {};
for (const per of ['H1', 'H4', 'J']) {
  await p.evaluate(x => document.querySelector(`[data-periode="${x}"]`).click(), per); await w(8000);
  const m = await p.evaluate(() => ({ M: window.__orPro.marqueurs(), B: window.__or.moteur.serie().map(b => [b.t, window.__or.graph.tempsDeBougie(b.t)]), n: window.__orPro.etat().marques, fond: window.__orPro.fond() })); marq[per] = m;
  if (per === 'H1') { verif(m.n === 0 && m.M.length === 0 && m.fond.n === 0, 'H1 : aucune flèche, pas de fond'); continue; }
  const pas = per === 'H4' ? 4 * 3600e3 : 86400e3, att = fl.map(f => { const b = m.B.find(x => x[0] <= f.tFin - 1 && f.tFin - 1 < x[0] + pas); return b ? { b: b[1], dir: f.dir, tFin: f.tFin } : null; }).filter(Boolean), cles = new Set(att.map(a => a.b + '|' + a.dir));
  attJ[per] = att;
  verif(att.length >= 3 && m.M.length === cles.size, per + ' : toutes les flèches sont affichées (' + m.M.length + ' sur ' + att.length + ' dans la période chargée)');
  verif(m.M.every(x => x.shape === (x.position === 'belowBar' ? 'arrowUp' : 'arrowDown') && /^rgba\(/.test(x.color) && !x.text && /,1\)$/.test(x.color)), per + ' : flèche verte vers le haut sous la bougie (achat), rouge vers le bas au-dessus (vente), sans texte');
  verif(m.M.every(x => (x.position === 'belowBar' ? /rgba\(95,184,148,/ : /rgba\(216,106,106,/).test(x.color)), per + ' : couleurs verte / rouge');
  const tailles = [...new Set(m.M.map(x => x.size))].sort((a, b) => a - b); verif(tailles.length === 2 && tailles[1] > 2 * tailles[0], per + ' : grosses flèches (Daily) nettement plus grandes que les petites (H4) : ' + tailles.join(' / '));
  verif(att.every(a => m.M.some(x => x.time === a.b && x.position === (a.dir > 0 ? 'belowBar' : 'aboveBar'))), per + ' : chaque flèche est sur sa bougie de confirmation');
  verif(m.fond.n >= 100 && [-1, 0, 1].includes(m.fond.sens), per + ' : fond coloré selon le sens Daily (' + m.fond.n + ' bougies, sens actuel ' + m.fond.sens + ')');
  /* info-bulle : survol de la dernière flèche affichée */
  const pos = await p.evaluate(() => { const g = window.__or.graph, f = window.__orPro.fleches(), M = window.__orPro.marqueurs(), m = M[M.length - 1], r = g.conteneur().getBoundingClientRect(), L = f.filter(x => true).pop(); const x = g.chart().timeScale().timeToCoordinate(m.time), y = g.serie().priceToCoordinate(L.entree); return Number.isFinite(x) && Number.isFinite(y) ? { x: r.left + x, y: r.top + y } : null; });
  if (pos) {
    await p.mouse.move(5, 5); await p.mouse.move(pos.x, pos.y, { steps: 4 }); await w(900);
    const ib = await p.evaluate(() => { const e = document.querySelector('.tp-fleche-info'); if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(), g = window.__or.graph.conteneur().getBoundingClientRect(); const cache = [...document.querySelectorAll('.tp-ma-legende, .tp-ligne-boutons, .tp-ligne-boutons button')].filter(b => { const q = b.getBoundingClientRect(); return q.width > 0 && !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); }).length; return { t: e.textContent, w: r.width, h: r.height, gw: g.width, gh: g.height, dedans: r.left >= g.left - 1 && r.right <= g.right - (() => { try { return window.__or.graph.chart().priceScale('right').width() || 0; } catch (e) { return 0; } })() + 1 && r.top >= g.top - 1 && r.bottom <= g.bottom + 1, cache }; });
    verif(!!ib && /(Grosse|Petite) flèche/.test(ib.t) && /Entrée/.test(ib.t) && /Stop/.test(ib.t) && /(Gain|En cours) : [+−]\d/.test(ib.t), per + ' : l’info-bulle donne type, entrée, stop et gain en R' + (ib ? ' (' + ib.t.replace(/\n/g, ' · ') + ')' : ''));
    verif(!!ib && ib.dedans && ib.cache === 0 && ib.w < ib.gw * 0.75 && ib.h < ib.gh * 0.4, per + ' : l’info-bulle est petite, reste dans le graphique (jamais sur l’échelle des prix) et ne cache ni la légende ni les boutons');
    await capture('terminal-fleches-' + per);
    await p.mouse.move(5, 5); await w(500);
  } else verif(false, per + ' : position de la flèche introuvable');
}
await p.evaluate(() => document.querySelector('[data-periode="J"]').click()); await w(6000);
{
  const pos = await p.evaluate(() => { const g = window.__or.graph, f = window.__orPro.fleches(), M = window.__orPro.marqueurs(), m = M[M.length - 1], r = g.conteneur().getBoundingClientRect(); const x = g.chart().timeScale().timeToCoordinate(m.time), y = g.serie().priceToCoordinate(f[f.length - 1].entree); return Number.isFinite(x) && Number.isFinite(y) ? { x: r.left + x, y: r.top + y } : null; });
  const visible = () => p.evaluate(() => { const e = document.querySelector('.tp-fleche-info'); return !!e && getComputedStyle(e).display !== 'none'; });
  await p.mouse.move(5, 5); await p.mouse.move(pos.x, pos.y, { steps: 4 }); await w(900); const vu = await visible();
  await w(2000); await p.evaluate(() => window.__orPro.charger()); await w(2500); await p.evaluate(() => window.__orPro.dessiner()); await w(2500);   // la souris ne bouge plus ; le graphique se met à jour : l'info-bulle doit se fermer seule (6 s)
  verif(vu && !(await visible()), 'l’info-bulle se ferme seule au bout de 6 s, même quand le graphique se met à jour pendant que le curseur reste posé (affichée : ' + vu + ')');
  await p.mouse.move(5, 5);
}
{
  const recent = fl.filter(f => f.tFin > Date.now() - 120 * 86400e3), cleJ = new Set(attJ.J.map(a => a.tFin + '|' + a.dir)), cleH = new Set(attJ.H4.map(a => a.tFin + '|' + a.dir));
  verif(recent.length >= 3 && recent.every(f => cleJ.has(f.tFin + '|' + f.dir) && cleH.has(f.tFin + '|' + f.dir)), 'les mêmes flèches (grosses et petites) sur le Jour et sur H4 : ' + recent.length + ' flèches des 4 derniers mois présentes sur les deux');
}
console.log('— réglages : interrupteur et fond —');
verif(await p.evaluate(() => { const z = document.querySelectorAll('[data-tp-reg]'); return z.length >= 1 && document.querySelector('[data-reg="actif"]').checked && document.querySelector('[data-reg="fond"]').checked; }), 'réglages visibles : flèches et fond coloré activés par défaut');
verif(await p.evaluate(() => !!document.querySelector('.tor-ob-pan [data-tp-reg]')), 'les réglages sont dans le menu « Affichage » du terminal');
await p.evaluate(() => document.querySelector('[data-periode="J"]').click()); await w(6000);
const n0 = await p.evaluate(() => window.__orPro.etat().marques);
await p.evaluate(() => { const c = document.querySelector('.tor-ob-pan [data-reg="fond"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1200);
verif(await p.evaluate(x => window.__orPro.fond().n === 0 && window.__orPro.etat().marques === x, n0), 'fond coupé : plus de fond, les flèches restent');
await p.evaluate(() => { const c = document.querySelector('.tor-ob-pan [data-reg="fond"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1200);
verif(await p.evaluate(() => window.__orPro.fond().n > 100), 'fond remis');
await p.evaluate(() => { const c = document.querySelector('.tor-ob-pan [data-reg="actif"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1200);
verif(await p.evaluate(() => window.__orPro.etat().marques === 0 && window.__orPro.fond().n === 0 && window.__orPro.reglages().actif === false), 'interrupteur coupé : plus aucune flèche, plus de fond');
await p.evaluate(() => { const c = document.querySelector('.tor-ob-pan [data-reg="actif"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(1200);
verif(await p.evaluate(x => window.__orPro.etat().marques === x, n0), 'interrupteur remis : les mêmes flèches reviennent (' + n0 + ')');
await p.evaluate(() => document.querySelector('.tp-b-hj').click()); await w(600);
verif(await p.evaluate(() => { const a = document.querySelector('.tp-panneau'); return !!a && !a.hidden && /MA200 Daily \+ H4/.test(a.innerText) && /Sens Daily/.test(a.innerText) && /Dernières flèches/i.test(a.innerText) && /Touchez une flèche/.test(a.innerText) && /Fond coloré/.test(a.innerText); }), 'le panneau « MA200 Daily + H4 » explique la méthode, donne les réglages et liste les dernières flèches');
const txt = await p.evaluate(() => document.querySelector('.tp-panneau').innerText); console.log('  ' + txt.replace(/\s+/g, ' ').slice(0, 500));
verif(!/Signal H4|Biais Jour|Fiche d’ordre|backtest|Bilan de la méthode/i.test(txt), 'plus aucun ancien signal ni bilan de backtest dans le panneau');
verif(await p.evaluate(() => { const a = document.querySelector('.tp-panneau'), r = a.getBoundingClientRect(); return r.width <= innerWidth + 1 && a.scrollWidth <= a.clientWidth + 1; }), 'le panneau tient dans l’écran (pas de défilement horizontal)');
await capture('terminal-panneau');
await p.evaluate(() => document.querySelector('.tp-panneau [data-fermer]').click());
verif(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'aucun défilement horizontal de la page');
console.log('— ancien système : plus aucune flèche venue de l’ancien terminal —');
verif(await p.evaluate(() => !window.__or.graph.flechesTerminal && !window.__or.flechesT && !document.querySelector('[data-bilan-fleches],[data-versions-h1],[data-or="anciennesFleches"]')), 'aucun reste de l’ancien système (rebonds H1 / H4, flèches MA200, versions v1 à v9)');
console.log('— panneau Données (score, volume net, données pro) —');
await p.evaluate(() => document.querySelector('.tp-b-donnees').click());
verif(await attendre(() => p.evaluate(() => !!document.querySelector('.tp-donnees .tp-score-n') && /Volume net/.test(document.querySelector('.tp-donnees').innerText)), 40000), 'le panneau Données affiche le score et le volume net');
await w(4000); const d = await p.evaluate(() => { const z = document.querySelector('.tp-donnees'); return { t: z.innerText, n: document.querySelector('.tp-score-n').textContent.trim(), lignes: z.querySelectorAll('.tp-comp tr:not(.tp-det)').length, canv: z.querySelectorAll('canvas').length }; });
console.log('  score :', d.n); verif(/^[+−-]?\d+$/.test(d.n.replace(/\s/g, '')) && Math.abs(+d.n.replace('−', '-').replace('+', '')) <= 100, 'score entre −100 et +100 : ' + d.n);
verif(d.lignes === 7, 'six composantes avec leurs poids : ' + (d.lignes - 1)); for (const nom of ['Tendance', 'Momentum', 'Positionnement COT', 'Macro', 'Volatilité', 'Flux de volume']) verif(d.t.includes(nom), 'composante ' + nom);
verif(/H1/.test(d.t) && /H4/.test(d.t) && /Jour/.test(d.t) && !/M15|M5/.test(d.t), 'tendance, RSI et MA200 en H1, H4 et Jour seulement');
verif(/Performance/i.test(d.t) && /ATR 14/i.test(d.t) && /Niveaux clés/i.test(d.t) && /Prochaine annonce/i.test(d.t), 'données pro : performance, ATR, niveaux clés, prochaine annonce');
verif(/RÉEL|ESTIMATION|Non disponible/i.test(d.t), 'le volume net est étiqueté réel / estimation / non disponible'); verif(d.canv >= 2, 'graphiques dessinés (historique du score, volume net) : ' + d.canv);
await capture('terminal-donnees'); await p.evaluate(() => document.querySelector('.tp-donnees [data-fermer]').click());
console.log('— « Détails » —');
await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(1500);
verif(await p.evaluate(() => document.documentElement.classList.contains('tp-details') && [...document.querySelectorAll('.tor-graph-barre, .tor-ft-ligne, .tt-fl')].some(b => getComputedStyle(b).display !== 'none')), '« Détails » rend les barres d’outils');
await capture('terminal-details'); await p.evaluate(() => document.querySelector('.tp-b-details').click()); await w(800);
verif(await p.evaluate(() => Object.values(window.__or.graph.couches()).every(v => v === false)), 'retour au graphique propre');
console.log('— copie locale des bougies —');
const db = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('rayle-or-cache'); r.onsuccess = () => { try { const q = r.result.transaction('historique').objectStore('historique').getAllKeys(); q.onsuccess = () => res(q.result); } catch (er) { res([]); } }; r.onerror = () => res([]); })); verif(db.length >= 1, 'copie locale des bougies enregistrée : ' + db.join(', '));
await p.reload({ waitUntil: 'domcontentloaded' }); const t0 = Date.now(); verif(await attendre(() => p.evaluate(() => window.__or && window.__or.moteur && window.__or.moteur.serie().length > 50), 30000, 200), 'après rechargement, les bougies sont là en ' + (Date.now() - t0) + ' ms'); console.log('  premières bougies après', Date.now() - t0, 'ms ; copie utilisée :', await p.evaluate(() => !!(window.__or.moteur.S.hist && window.__or.moteur.S.hist.depuisCache)));
console.log('— mise à jour automatique : code ancien en cache —');
{
  await attendre(() => p.evaluate(() => !!window.__orPro), 60000); const V = await p.evaluate(() => window.RAYLE_OR_VERSION);
  await p.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* */ } window.__tpVersion = 'ancienne'; window.__verifierVersion(); });
  const vue = await attendre(() => p.evaluate(() => !!window.__majVersion).catch(() => true), 8000);
  const revenu = await attendre(() => p.evaluate(() => !!window.__orPro && window.__tpVersion === window.RAYLE_OR_VERSION && !window.__majVersion).catch(() => false), 90000);
  verif(vue && revenu, 'le code chargé ne correspond pas à la page : la page se met à jour toute seule (cache vidé, rechargement) et affiche la bonne version');
  verif(await p.evaluate(v => sessionStorage.getItem('rayle_maj_' + v) === '1', V).catch(() => false), 'une seule tentative de mise à jour (jamais de boucle)');
  verif(await p.evaluate(() => (document.querySelector('.tp-ma-legende .tp-version') || {}).textContent).catch(() => '') === 'v' + V, 'après la mise à jour, la version affichée est v' + V);
}
await T.fin();
