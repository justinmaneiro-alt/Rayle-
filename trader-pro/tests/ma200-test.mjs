/* Tests des flèches MA200 de suivi de tendance (module pur) : cassure (0,3 ATR), rebond (1 ATR d'éloignement), jamais contre la tendance, flèche sur la bougie de confirmation, aucune bougie future,
   MA200 par unité, registre, alertes, version. Usage : node trader-pro/tests/ma200-test.mjs */
import { analyserUnite, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, ma200PourBougies, sensPourBougies, niveauParle, phraseFleche, typeLibelle, cloturees, ALGO_ID, H4, J, PARAMS } from '../terminal/ma200-h4.js';
import { analyseDe, flechesDe, nouvellesFleches, lireReglages, ecrireReglages, purgerAnciens, CLE_REGLAGES, CLE_REGISTRE } from '../terminal/fleches-registre.js';
import fs from 'node:fs';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };
const bg = (i, o, c, h, l, pas = H4) => ({ t: i * pas, o, h: h ?? Math.max(o, c) + 0.5, l: l ?? Math.min(o, c) - 0.5, c });

console.log('— cassure : 0,3 ATR de marge, flèche sur la bougie de confirmation —');
{
  const plat = Array.from({ length: 200 }, (_, i) => bg(i, 100, 100, 100.5, 99.5));   // MA = 100, ATR = 1
  const A = suite => analyserUnite(plat.concat(suite.map((x, k) => bg(200 + k, ...x))), 'H4', { maintenant: Infinity });
  // tendance initiale : première clôture à plus de 0,3 ATR de la MA, sans flèche
  v(A([[100, 102]]).fleches.length === 0 && A([[100, 102]]).tend[200] === 1, 'tendance initiale : côté de la première clôture franche, sans flèche');
  const c = A([[100, 102], [102, 99.8]]).fleches; v(c.length === 0, 'clôture sous la MA mais à moins de 0,3 ATR : pas de cassure, la tendance reste');
  const d = A([[100, 102], [102, 99.5]]); v(d.fleches.length === 1 && d.fleches[0].type === 'cassure' && d.fleches[0].dir === -1 && d.fleches[0].iH4 === 201 && d.fleches[0].t === 201 * H4, 'clôture à plus de 0,3 ATR de l’autre côté : flèche de vente sur CETTE bougie');
  v(d.tend[201] === -1, 'la tendance change à la cassure');
  const e = A([[100, 102], [102, 99.5], [99.5, 100.9], [100.9, 101.5]]).fleches; v(e.length === 2 && e[1].dir === 1 && e[1].type === 'cassure', 'cassure haussière : flèche d’achat');
  v(A([[100, 98], [98, 97], [97, 96]]).fleches.length === 0, 'la tendance continue sans nouvelle flèche (pas de rebond sans retour)');
}

console.log('— rebond : retour sur la MA, 1 ATR d’éloignement, une flèche par retour —');
{
  const plat = Array.from({ length: 200 }, (_, i) => bg(i, 100, 100, 100.5, 99.5));
  const A = suite => analyserUnite(plat.concat(suite.map((x, k) => bg(200 + k, ...x))), 'H4', { maintenant: Infinity });
  const haut = [100, 103, 105, 102.5], tocheOk = [102, 103, 103.5, 99.5];   // [o, c, h, l]
  const R1 = A([haut, tocheOk]).fleches; v(R1.length === 1 && R1[0].type === 'rebond' && R1[0].dir === 1 && R1[0].iH4 === 201, 'tendance haussière : le prix s’éloigne de plus de 1 ATR, revient toucher la MA, clôture au-dessus : flèche d’achat sur cette bougie');
  const R2 = A([haut, tocheOk, [103, 103.2, 103.5, 99.8]]).fleches; v(R2.length === 1, 'un deuxième retour sans nouvel éloignement : pas de nouvelle flèche (une seule par retour)');
  const R3 = A([haut, tocheOk, [103, 105, 106, 102.5], [105, 103, 105.5, 99.7]]).fleches; v(R3.length === 2 && R3[1].type === 'rebond', 'après un nouvel éloignement de 1 ATR : une nouvelle flèche de rebond (plusieurs rebonds dans une même tendance)');
  v(A([haut, [102, 100.4, 102.5, 99.5]]).fleches.length === 1, 'retour sur la MA avec clôture juste au-dessus : rebond');
  v(A([[100, 100.6, 100.9, 99.5], [100.6, 100.8, 101, 99.6]]).fleches.length === 0, 'sans éloignement d’1 ATR : aucun rebond');
  // tendance baissière : miroir
  const B1 = A([[100, 97, 97.5, 95], [97, 98, 99, 96], [98, 99.5, 100.4, 97.5]]).fleches; v(B1.length === 1 && B1[0].dir === -1 && B1[0].type === 'rebond' && B1[0].iH4 === 202, 'tendance baissière : retour sur la MA par le bas, clôture dessous : flèche de vente');
  // jamais contre la tendance : en tendance haussière, une bougie qui touche par le haut puis clôture sous (sans 0,3 ATR) ne donne aucune vente
  v(!A([haut, [102, 99.9, 102.5, 99.5]]).fleches.some(f => f.dir === -1), 'jamais de flèche contre la tendance (seule une cassure franche la change)');
  const S = styleFleche({ dir: 1 }), V = styleFleche({ dir: -1 }); v(S.position === 'belowBar' && S.forme === 'arrowUp' && /95,184,148/.test(S.couleur) && V.position === 'aboveBar' && V.forme === 'arrowDown' && /216,106,106/.test(V.couleur) && S.taille === V.taille && S.taille < 2, 'petite flèche verte ▲ dessous / rouge ▼ dessus');
}

console.log('— marché synthétique : propriétés, aucune bougie future —');
function marche(n, graine = 7) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }, B = []; let p = 1000;
  for (let i = 0; i < n; i++) { const c = 1000 + 60 * Math.sin(i / 110) + 25 * Math.sin(i / 9) + (alea() - 0.5) * 12, o = p; p = c; B.push({ t: i * H4, o, h: Math.max(o, c) + alea() * 3, l: Math.min(o, c) - alea() * 3, c }); }
  return B;
}
const H = marche(3000), FIN = H[H.length - 1].t + H4, R = analyserUnite(H, 'H4', { maintenant: FIN }), F = R.fleches;
{
  const nc = F.filter(f => f.type === 'cassure').length, nr = F.filter(f => f.type === 'rebond').length;
  v(nc >= 4 && nr >= 4, 'des cassures (' + nc + ') et des rebonds (' + nr + ') sont produits');
  v(F.every(f => f.t === H[f.iH4].t && f.entree === H[f.iH4].c && f.tFin === f.t + H4), 'chaque flèche est sur sa bougie de confirmation (heure et clôture de la bougie)');
  v(F.filter(f => f.type === 'rebond').every(f => f.dir === R.tend[f.iH4]) && F.filter(f => f.type === 'cassure').every(f => f.dir === R.tend[f.iH4] && R.tend[f.iH4 - 1] === -f.dir), 'rebond : toujours dans le sens de la tendance ; cassure : la tendance change à cette bougie');
  v(F.filter(f => f.type === 'cassure').every((f, i, a) => i === 0 || f.dir === -a[i - 1].dir), 'les cassures alternent forcément (hausse, baisse, hausse…)');
  v(F.filter(f => f.type === 'cassure').every(f => (f.dir > 0 ? f.entree > f.ma200 + 0.3 * f.atr : f.entree < f.ma200 - 0.3 * f.atr) - 0 === 1 || true) && F.filter(f => f.type === 'cassure').every(f => (f.dir > 0 ? f.entree - f.ma200 : f.ma200 - f.entree) >= 0.3 * f.atr - 1e-9), 'cassure : au moins 0,3 ATR de marge');
  let bon = true; const R2 = F.filter(f => f.type === 'rebond'); for (let k = 1; k < F.length; k++) { const p = F[k - 1], f = F[k]; if (f.type !== 'rebond') continue; let eloigne = false; for (let i = p.iH4 + 1; i < f.iH4; i++) if (f.dir > 0 ? R.B[i].h - R.M[i] >= R.A[i] : R.M[i] - R.B[i].l >= R.A[i]) eloigne = true; if (!eloigne) bon = false; }
  v(bon, 'entre deux flèches, avant un rebond : le prix s’est éloigné d’au moins 1 ATR de la MA200');
  for (const N of [1000, 1800, 2500]) v(JSON.stringify(analyserUnite(H.slice(0, N), 'H4', { maintenant: Infinity }).fleches.map(f => f.t + '|' + f.dir + '|' + f.type)) === JSON.stringify(F.filter(f => f.iH4 < N).map(f => f.t + '|' + f.dir + '|' + f.type)), `les flèches avec ${N} bougies sont celles de l’analyse complète (aucune ne bouge, aucune n’apparaît en arrière)`);
  v(analyserUnite(H.concat([{ t: FIN, o: 1, h: 1e9, l: 0, c: 5 }]), 'H4', { maintenant: FIN + 3600e3 }).fleches.length === F.length && cloturees(H.concat([{ t: FIN, o: 1, h: 1, l: 1, c: 1 }]), FIN + 3600e3).length === H.length, 'la bougie en cours est ignorée');
}

console.log('— MA200 par unité, placement sur H1 / H4 / Jour, fond —');
{
  const j = []; for (let i = 0; i + 6 <= H.length; i += 6) { const L = H.slice(i, i + 6); j.push({ t: L[0].t, o: L[0].o, h: Math.max(...L.map(b => b.h)), l: Math.min(...L.map(b => b.l)), c: L[5].c }); }
  const RJ = analyserUnite(j, 'J', { maintenant: Infinity });
  v(RJ.fleches.length >= 2 && RJ.fleches.every(f => f.unite === 'J' && f.tFin === f.t + J), 'le Jour a sa propre analyse (MA200 Jour) et ses propres flèches (' + RJ.fleches.length + ')');
  v(Math.abs(RJ.M[300] - j.slice(101, 301).reduce((s, b) => s + b.c, 0) / 200) < 1e-9 && Math.abs(R.M[500] - H.slice(301, 501).reduce((s, b) => s + b.c, 0) / 200) < 1e-9, 'MA200 = moyenne simple de 200 clôtures de CETTE unité');
  v(F[0].unite === 'H4', 'les flèches H4 portent l’unité H4');
  const h1 = []; for (const b of H.slice(0, 700)) for (let k = 0; k < 4; k++) h1.push({ t: b.t + k * 3600e3, o: b.o, h: b.h, l: b.l, c: b.c });
  const f = F.find(x => x.iH4 > 300 && x.iH4 < 690), iH4 = indexSurUnite(H, f, H4), iH1 = indexSurUnite(h1, f, 3600e3), iJ = indexSurUnite(j, f, J);
  v(iH4 === f.iH4, 'H4 : la flèche est sur la bougie de confirmation');
  v(h1[iH1].t === f.t + 3 * 3600e3, 'H1 : les flèches H4 sont posées sur la dernière bougie H1 de la bougie H4 (heure de la clôture)');
  v(iJ >= 0 && j[iJ].t <= f.tFin - 1 && f.tFin - 1 < j[iJ].t + J, 'Jour : bougie du jour qui contient la clôture');
  const m1 = ma200PourBougies(h1, H, R.M, 3600e3, H4), mj = ma200PourBougies(j, j, RJ.M, J, J), m4 = ma200PourBougies(H, H, R.M, H4, H4);
  v(m1[4 * 300 + 3] === R.M[300] && m1[4 * 300] === R.M[299], 'H1 : la MA200 H4 connue à la clôture de la bougie H1');
  v(mj[250] === RJ.M[250] && m4[300] === R.M[300] && m4.slice(0, 199).every(x => x == null), 'Jour : MA200 Jour ; H4 : MA200 H4 ; absente avant 200 bougies');
  const sH4 = sensPourBougies(H, R.sens, H4); v(sH4.length === H.length && sH4.every(x => [-1, 0, 1].includes(x)) && sH4[400] === R.tend[399] && sH4.some(x => x === 1) && sH4.some(x => x === -1), 'fond : tendance de la dernière bougie clôturée, vert (1) et rouge (−1) présents');
}

console.log('— alertes, registre —');
{
  v(typeLibelle({ type: 'cassure', unite: 'H4', dir: 1 }) === 'cassure MA200 H4 à la hausse' && typeLibelle({ type: 'cassure', unite: 'H4', dir: -1 }) === 'cassure MA200 H4 à la baisse' && typeLibelle({ type: 'rebond', unite: 'J', dir: 1 }) === 'rebond MA200 Jour à l’achat' && typeLibelle({ type: 'rebond', unite: 'H4', dir: -1 }) === 'rebond MA200 H4 à la vente', 'phrases d’alerte : « cassure MA200 H4 à la hausse », « rebond MA200 Jour à l’achat »…');
  v(phraseFleche('Or', { type: 'cassure', unite: 'H4', dir: 1 }) === 'Or : cassure MA200 H4 à la hausse' && niveauParle(2650.4) === '2 650', 'phrase vocale');
  const j = []; for (let i = 0; i + 6 <= H.length; i += 6) { const L = H.slice(i, i + 6); j.push({ t: L[0].t, o: L[0].o, h: Math.max(...L.map(b => b.h)), l: Math.min(...L.map(b => b.l)), c: L[5].c }); }
  const D = { h4: H, j }, st = memoire(), t = FIN + 3600e3, a = analyseDe('btc', D, { maintenant: t, stockage: st });
  v(a.reg.length === a.H4.fleches.length + a.J.fleches.length && a.reg.some(f => f.unite === 'J') && a.reg.every((f, i, r) => i === 0 || r[i - 1].tFin <= f.tFin), 'registre : flèches H4 et Jour, triées');
  v(a.reg.every(f => f.vueLe === t) && nouvellesFleches('btc', a.reg, { maintenant: t, stockage: st }).length === 0, 'premier calcul : historique déjà vu, rien n’est annoncé');
  const st2 = memoire(), dern = a.reg[a.reg.length - 1]; st2.setItem(CLE_REGISTRE('btc'), JSON.stringify(a.reg.slice(0, -1).map(x => ({ ...x, vueLe: 1 })))); const T2 = dern.tFin + 3600e3;
  const c = analyseDe('btc', D, { maintenant: T2, stockage: st2 }), n1 = nouvellesFleches('btc', c.reg, { maintenant: T2, stockage: st2 }), n2 = nouvellesFleches('btc', c.reg, { maintenant: T2, stockage: st2 });
  v(n1.length === 1 && n1[0].t === dern.t && n2.length === 0, 'une nouvelle flèche est annoncée une seule fois (voix + Telegram)');
  v(fusionnerRegistre('btc', c.reg, [...a.H4.fleches, ...a.J.fleches]).length >= c.reg.length && c.reg.every(x => x.id === idFleche('btc', x)), 'fusion : identifiant stable');
  v(flechesDe('btc', D, { maintenant: t, stockage: memoire() }).length === a.reg.length && analyseDe('btc', { h4: H.slice(0, 100), j: [] }, { maintenant: t, stockage: memoire() }).reg.length === 0, 'moins de 205 bougies : aucune flèche, aucune erreur');
  const s3 = memoire(); v(lireReglages(s3).actif === true && lireReglages(s3).fond === true, 'réglages par défaut : flèches et fond activés'); ecrireReglages({ actif: true, fond: false }, s3); v(lireReglages(s3).fond === false && s3.m.has(CLE_REGLAGES), 'réglages enregistrés');
  v(PARAMS.margeCassure === 0.3 && PARAMS.eloignement === 1 && PARAMS.ATR_N === 14 && PARAMS.MA_N === 200, 'paramètres : 0,3 ATR14, 1 ATR, MA 200');
}

console.log('— version, mise à jour et anciens registres —');
{
  const lireV = (f, re) => (fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').match(re) || [])[1];
  const versions = { 'precache.json': lireV('precache.json', /"version":"([^"]+)"/), 'sw.js': lireV('sw.js', /const VERSION = '([^']+)'/), 'index.html': lireV('index.html', /RAYLE_VERSION='([^']+)'/), 'or.html': lireV('agent-trading/front/or.html', /RAYLE_OR_VERSION = '([^']+)'/), 'version.js': lireV('trader-pro/terminal/version.js', /VERSION = '([^']+)'/) };
  v(Object.values(versions).every(x => x && x === versions['sw.js']), 'la même version partout : ' + JSON.stringify(versions));
  v(JSON.parse(fs.readFileSync(new URL('../../precache.json', import.meta.url), 'utf8')).coeur.includes('trader-pro/terminal/version.js'), 'version.js est dans le précache');
  const st = memoire(), vieux = [{ id: 'or|1|-1|cassure', type: 'cassure', dir: -1, t: 1, tFin: 2, entree: 1, stop: 2, vueLe: 1 }];
  for (const k of ['rayle_tp_ma1_or', 'rayle_tp_ma2_or_cassure-ma200-v1', 'rayle_tp_ma2_or_h4-v1']) st.setItem(k, JSON.stringify(vieux)); st.setItem('autre_cle', 'x');
  const r = analyseDe('or', { h4: marche(400), j: [] }, { maintenant: Infinity, stockage: st });
  v(['rayle_tp_ma1_or', 'rayle_tp_ma2_or_cassure-ma200-v1', 'rayle_tp_ma2_or_h4-v1'].every(k => !st.m.has(k)) && st.m.has('autre_cle') && st.m.has(CLE_REGISTRE('or')) && ALGO_ID() === 'suivi-ma200-v1', 'anciens registres supprimés (jamais relus), clé actuelle ' + ALGO_ID());
  const st2 = memoire(); st2.setItem('rayle_tp_ma2_btc_' + ALGO_ID(), '[]'); v(purgerAnciens(st2) === 0, 'la purge ne touche pas le registre actuel');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
