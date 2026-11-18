/* Tests de « cassure de la MA200 H4 » (module pur) : 2 clôtures H4 d'affilée, alternance, extrême du mouvement, aucune bougie future, registre, version, alertes.
   Usage : node trader-pro/tests/ma200-test.mjs */
import { analyser, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, ma200PourBougies, niveauParle, phraseFleche, typeLibelle, cloturees, ALGO_ID, H4, J } from '../terminal/ma200-h4.js';
import { analyseDe, flechesDe, nouvellesFleches, lireReglages, ecrireReglages, purgerAnciens, CLE_REGLAGES, CLE_REGISTRE } from '../terminal/fleches-registre.js';
import fs from 'node:fs';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };
const bougie = (i, o, c, h = Math.max(o, c) + 1, l = Math.min(o, c) - 1) => ({ t: i * H4, o, h, l, c });

console.log('— 2 clôtures d’affilée —');
{
  // 200 bougies plates à 100 (MA = 100), puis scénarios
  const base = Array.from({ length: 200 }, (_, i) => bougie(i, 100, 100, 100.5, 99.5));
  const A = (suite) => analyser(base.concat(suite.map((c, k) => bougie(200 + k, 100, c, Math.max(100, c) + 1, Math.min(100, c) - 1))), { maintenant: Infinity });
  v(A([105]).fleches.length === 0, 'une seule clôture au-dessus de la MA200 H4 : aucune flèche (fausse cassure)');
  v(A([105, 99, 105]).fleches.length === 0, 'clôture au-dessus, retour dessous, puis au-dessus : aucune flèche');
  const a = A([105, 106]).fleches;
  v(a.length === 1 && a[0].dir === 1 && a[0].iH4 === 201, '2 clôtures au-dessus : une flèche d’achat, à la 2e clôture');
  const b = A([95, 94]).fleches; v(b.length === 1 && b[0].dir === -1, '2 clôtures en dessous : une flèche de vente');
  v(A([105, 106, 107, 108, 109]).fleches.length === 1, 'les clôtures suivantes du même côté ne donnent pas d’autre flèche (jamais deux flèches du même sens d’affilée)');
  const alt = A([105, 106, 95, 94, 96, 97, 110, 111]).fleches.map(f => f.dir); v(alt.join() === '1,-1,1', 'les flèches alternent : achat, vente, achat (' + alt.join() + ')');
  v(A([105, 106, 105, 106, 105, 106]).fleches.length === 1, 'jamais deux achats d’affilée');
}

console.log('— position : extrême du mouvement —');
{
  const base = Array.from({ length: 200 }, (_, i) => bougie(i, 100, 100, 100.5, 99.5));
  // baisse jusqu'à un plus bas à 90 (mèche), puis remontée : l'achat est posé sur la bougie du plus bas
  const S = base.concat([bougie(200, 100, 95, 100.5, 94), bougie(201, 95, 92, 95.5, 90), bougie(202, 92, 99.5), bougie(203, 99.5, 103, 104, 99), bougie(204, 103, 105, 106, 102)]);
  const R = analyser(S, { maintenant: Infinity }), f = R.fleches;
  v(f.length >= 2 && f[0].dir === -1 && f[1].dir === 1, 'vente puis achat (' + f.map(x => x.dir).join() + ')');
  const ach = f.find(x => x.dir === 1);
  v(ach && ach.stop === 90 && ach.tExt === 201 * H4 && ach.iH4 === 204, 'achat : sous le plus bas (90) atteint avant la cassure, sur la bougie qui le porte');
  const ven = f[0]; v(ven.stop >= 100.5 && ven.tExt <= ven.t, 'vente : au-dessus du plus haut du mouvement');
  v(indexSurUnite(S, ach, H4) === 201 && indexSurUnite(S, { ...ach, tExt: undefined, tFin: ach.tFin }, H4) === 204, 'la flèche est sur la bougie de l’extrême (sinon la bougie de confirmation)');
  const st = styleFleche(ach), sv = styleFleche(ven); v(st.position === 'belowBar' && st.forme === 'arrowUp' && /95,184,148/.test(st.couleur) && sv.position === 'aboveBar' && sv.forme === 'arrowDown' && /216,106,106/.test(sv.couleur), 'achat : verte ▲ sous la bougie ; vente : rouge ▼ au-dessus');
}

console.log('— marché synthétique : alternance, aucune bougie future —');
function marche(n, graine = 7) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }, B = []; let p = 1000;
  for (let i = 0; i < n; i++) { const c = 1000 + 60 * Math.sin(i / 110) + 25 * Math.sin(i / 9) + (alea() - 0.5) * 12, o = p; p = c; B.push({ t: i * H4, o, h: Math.max(o, c) + alea() * 3, l: Math.min(o, c) - alea() * 3, c }); }
  return B;
}
const H = marche(3000), FIN = H[H.length - 1].t + H4, R = analyser(H, { maintenant: FIN }), F = R.fleches;
{
  v(F.length >= 6, 'des flèches sont produites (' + F.length + ')');
  v(F.every((f, i) => i === 0 || f.dir === -F[i - 1].dir), 'alternance stricte sur tout l’historique');
  v(F.every(f => R.cote[f.iH4] === f.dir && R.cote[f.iH4 - 1] === f.dir && R.cote[f.iH4 - 2] !== f.dir), 'chaque flèche : exactement à la 2e clôture H4 d’affilée du même côté (la 1re clôture ne suffit pas)');
  v(F.every(f => f.entree === H[f.iH4].c && (f.dir > 0 ? f.stop <= Math.min(...H.slice(f.iH4 - 1, f.iH4 + 1).map(b => b.l)) : f.stop >= Math.max(...H.slice(f.iH4 - 1, f.iH4 + 1).map(b => b.h)))), 'la flèche est sous le plus bas (achat) / au-dessus du plus haut (vente) du mouvement');
  for (const N of [1000, 1800, 2500]) v(JSON.stringify(analyser(H.slice(0, N), { maintenant: Infinity }).fleches.map(f => f.t + '|' + f.dir)) === JSON.stringify(F.filter(f => f.iH4 < N).map(f => f.t + '|' + f.dir)), `les flèches avec ${N} bougies sont celles de l’analyse complète (aucune ne bouge)`);
  v(analyser(H.concat([{ t: FIN, o: 1, h: 1e9, l: 0, c: 5 }]), { maintenant: FIN + 3600e3 }).fleches.length === F.length && cloturees(H.concat([{ t: FIN, o: 1, h: 1, l: 1, c: 1 }]), FIN + 3600e3).length === H.length, 'la bougie H4 en cours est ignorée');
}

console.log('— MA200 H4 sur H1, H4 et Jour —');
{
  const h1 = []; for (const b of H.slice(0, 600)) for (let k = 0; k < 4; k++) h1.push({ t: b.t + k * 3600e3, o: b.o, h: b.h, l: b.l, c: b.c });
  const j = []; for (let i = 0; i < 600; i += 6) j.push({ t: H[i].t, o: H[i].o, h: H[i].h, l: H[i].l, c: H[i].c });
  const m4 = ma200PourBougies(H, H, R.M, H4), m1 = ma200PourBougies(h1, H, R.M, 3600e3), mj = ma200PourBougies(j, H, R.M, J);
  v(Math.abs(R.M[299] - H.slice(100, 300).reduce((s, b) => s + b.c, 0) / 200) < 1e-9 && m4.slice(0, 199).every(x => x == null) && m4[300] === R.M[300], 'MA200 = moyenne simple des 200 dernières clôtures H4');
  v(m1[4 * 300 + 3] === R.M[300] && m1[4 * 300] === R.M[299], 'H1 : la valeur de la dernière bougie H4 clôturée à la clôture de la bougie H1');
  v(mj[50] === R.M[50 * 6 + 5], 'Jour : la valeur à la clôture du jour');
  const f = F[2], iH1 = indexSurUnite(h1, f, 3600e3), iJ = indexSurUnite(j, f, J); v(f.iH4 < 600 ? iH1 >= 0 && iJ >= 0 : true, 'la flèche existe aussi sur H1 et sur Jour');
  v(indexSurUnite([], f, H4) === -1, 'aucune bougie : aucune flèche');
}

console.log('— textes, alertes, registre —');
{
  v(niveauParle(2650.4) === '2 650', 'niveau énoncé');
  v(phraseFleche('Or', { dir: 1 }) === 'Or : cassure MA200 H4 à la hausse' && phraseFleche('Or', { dir: -1 }) === 'Or : cassure MA200 H4 à la baisse' && typeLibelle({ dir: -1 }) === 'cassure MA200 H4 à la baisse', 'phrase d’alerte : « cassure MA200 H4 à la hausse / à la baisse »');
  const st = memoire(), D = { h4: H }, t = FIN + 3600e3, a = analyseDe('or', D, { maintenant: t, stockage: st });
  v(a.reg.length === F.length && a.reg.every(x => x.vueLe === t) && nouvellesFleches('or', a.reg, { maintenant: t, stockage: st }).length === 0, 'premier calcul : historique enregistré comme déjà vu, rien n’est annoncé');
  const st2 = memoire(); st2.setItem(CLE_REGISTRE('or'), JSON.stringify(a.reg.slice(0, -1).map(x => ({ ...x, vueLe: 1 })))); const T2 = F[F.length - 1].tFin + 3600e3;
  const c = analyseDe('or', D, { maintenant: T2, stockage: st2 }), n1 = nouvellesFleches('or', c.reg, { maintenant: T2, stockage: st2 }), n2 = nouvellesFleches('or', c.reg, { maintenant: T2, stockage: st2 });
  v(n1.length === 1 && n1[0].t === F[F.length - 1].t && n2.length === 0, 'une nouvelle cassure validée est annoncée une seule fois (voix + Telegram)');
  v(fusionnerRegistre('or', c.reg, F).length === c.reg.length && c.reg.every(x => x.id === idFleche('or', x)), 'fusion : jamais de doublon');
  v(flechesDe('or', D, { maintenant: t, stockage: memoire() }).length === F.length && analyseDe('or', { h4: H.slice(0, 100) }, { maintenant: t, stockage: memoire() }).reg.length === 0, 'moins de 205 bougies H4 : aucune flèche, aucune erreur');
  const s3 = memoire(); v(lireReglages(s3).actif === true, 'réglage par défaut : flèches activées'); ecrireReglages({ actif: false }, s3); v(lireReglages(s3).actif === false && s3.m.has(CLE_REGLAGES), 'réglage enregistré');
}

console.log('— version, mise à jour et anciens registres —');
{
  const lireV = (f, re) => (fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').match(re) || [])[1];
  const versions = { 'precache.json': lireV('precache.json', /"version":"([^"]+)"/), 'sw.js': lireV('sw.js', /const VERSION = '([^']+)'/), 'index.html': lireV('index.html', /RAYLE_VERSION='([^']+)'/), 'or.html': lireV('agent-trading/front/or.html', /RAYLE_OR_VERSION = '([^']+)'/), 'version.js': lireV('trader-pro/terminal/version.js', /VERSION = '([^']+)'/) };
  v(Object.values(versions).every(x => x && x === versions['sw.js']), 'la même version partout : ' + JSON.stringify(versions));
  v(JSON.parse(fs.readFileSync(new URL('../../precache.json', import.meta.url), 'utf8')).coeur.includes('trader-pro/terminal/version.js'), 'version.js est dans le précache');
  const st = memoire(), vieux = [{ id: 'or|1|-1|rebond', type: 'rebond', dir: -1, t: 1, tFin: 2, entree: 1, stop: 2, vueLe: 1 }];
  for (const k of ['rayle_tp_ma1_or', 'rayle_tp_ma2_or_h4-v1', 'rayle_tp_ma2_or_daily2-sanspente-r3']) st.setItem(k, JSON.stringify(vieux)); st.setItem('autre_cle', 'x');
  const r = analyseDe('or', { h4: H }, { maintenant: FIN + 3600e3, stockage: st });
  v(r.reg.length > 0 && r.reg.every(f => f.type === 'cassure'), 'anciens registres jamais relus : que des cassures');
  v(['rayle_tp_ma1_or', 'rayle_tp_ma2_or_h4-v1', 'rayle_tp_ma2_or_daily2-sanspente-r3'].every(k => !st.m.has(k)) && st.m.has('autre_cle') && st.m.has(CLE_REGISTRE('or')) && ALGO_ID() === 'cassure-ma200-v1', 'anciens registres supprimés, clé actuelle ' + ALGO_ID());
  const st2 = memoire(); st2.setItem('rayle_tp_ma2_btc_' + ALGO_ID(), '[]'); v(purgerAnciens(st2) === 0, 'la purge ne touche pas le registre actuel');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
