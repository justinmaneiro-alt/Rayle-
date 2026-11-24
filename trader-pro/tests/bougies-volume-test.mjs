/* Bougies volume : calculs purs (volume relatif sur médiane, sources, contexte, zones, statistiques, aucune bougie future). node trader-pro/tests/bougies-volume-test.mjs */
import { creerCalcul, classe, contexteDe, suite, statsGroupe, tableau, similaires, zones, dernieres, alertesCloture, phraseAlerte, resumeParle, sourceBarre, COMEX_JUSQU_AU, SEUIL_EXTREME, MIN_CAS, estEnCours } from '../volume/bougies-volume-calcul.js';

let ok = 0, ko = 0; const v = (nom, c, d = '') => { if (c) ok++; else { ko++; console.log('✗', nom, d); } };
const H4 = 4 * 3600e3;
let graine = 12345; const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
/* série aléatoire reproductible : 600 bougies H4, quelques pics de volume */
function serie(n = 600, t0 = Date.UTC(2026, 0, 1), { picsA = [] } = {}) {
  const B = []; let p = 100;
  for (let i = 0; i < n; i++) { const o = p, c = p + (alea() - 0.5) * 2, h = Math.max(o, c) + alea(), l = Math.min(o, c) - alea(); B.push({ t: t0 + i * H4, o, h, l, c, v: 1000 + alea() * 200 }); p = c; }
  for (const [i, f] of picsA) B[i].v = 1100 * f;
  return B;
}

/* 1. volume relatif = volume ÷ médiane des 50 précédentes, bougie actuelle exclue */
{ const B = serie(120); B[100].v = 5000; const c = creerCalcul('btc').maj(B);
  const ref = B.slice(50, 100).map(b => b.v).sort((a, b) => a - b), med = (ref[24] + ref[25]) / 2;
  v('rel = v / médiane des 50 précédentes', Math.abs(c.rel(100) - 5000 / med) < 1e-9, c.rel(100) + ' vs ' + 5000 / med);
  const B2 = B.map(b => ({ ...b })); B2[100].v = 9999; const c2 = creerCalcul('btc').maj(B2); v('la bougie actuelle n’entre pas dans sa propre médiane', Math.abs(c2.rel(100) - 9999 / med) < 1e-9);
  v('pas assez de bougies de référence : pas de volume relatif', c.rel(5) == null && c.rel(19) == null && c.rel(21) != null); }

/* 2. aucune bougie future : la classe de la bougie i ne change pas quand on retire les suivantes */
{ const B = serie(500, undefined, { picsA: [[300, 3.4], [320, 2.2], [450, 3.1]] }), cF = creerCalcul('btc').maj(B); let diff = 0;
  for (const n of [260, 321, 380, 451]) { const c = creerCalcul('btc').maj(B.slice(0, n)); for (let i = 0; i < n; i++) { const a = classe(B, cF, i, 2), b = classe(B.slice(0, n), c, i, 2); if (a.niveau !== b.niveau || a.dir !== b.dir || a.rel !== b.rel || cF.ctx(i) !== c.ctx(i) || cF.ma(i) !== c.ma(i) || cF.atr(i) !== c.atr(i)) diff++; } }
  v('classe, contexte, MA200 et ATR identiques sans les bougies futures', diff === 0, diff + ' différences'); }

/* 3. changement de source : la médiane n'utilise que des bougies de la même source */
{ const t0 = COMEX_JUSQU_AU - 60 * H4, B = serie(120, t0); for (let i = 0; i < 60; i++) B[i].v = 100000;   // avant le 2026-08-05 : COMEX, volumes énormes ; après : Binance, petits volumes
  const c = creerCalcul('or').maj(B); B[100].v = 2500;
  const c2 = creerCalcul('or').maj(B);
  v('source COMEX avant le 2026-08-05', sourceBarre(B[10], 'or') === 'comex' && sourceBarre(B[80], 'or') === 'binance-kraken');
  v('juste après le changement : pas assez de référence de la même source → bougie non colorée', c.rel(62) == null && c.rel(70) == null, String(c.rel(62)));
  v('une fois assez de bougies de la nouvelle source, médiane sur cette source seule', c2.rel(100) > 2 && c2.rel(100) < 3, String(c2.rel(100)));
  const long = serie(120); long.forEach((b, i) => { b.long = i < 60; if (i < 60) b.v = 1e6; }); long[100].v = 2400; const cl = creerCalcul('btc').maj(long);
  v('historique long / source récente : sources séparées', cl.rel(65) == null && cl.rel(100) > 1.9 && cl.rel(100) < 2.6, String(cl.rel(100))); }

/* 4. volume nul : jamais de volume inventé */
{ const B = serie(100); B[80].v = 0; const c = creerCalcul('btc').maj(B); v('volume nul : pas de classe', c.rel(80) == null && classe(B, c, 80, 2).niveau === 0);
  const B3 = serie(100); for (const b of B3) b.v = 0; const c3 = creerCalcul('btc').maj(B3); v('série sans volume : rien n’est coloré', B3.every((b, i) => classe(B3, c3, i, 1.5).niveau === 0)); }

/* 5. seuils fort / extrême, sens */
{ const B = serie(100); B[90].v = 2300; B[91].v = 3600; B[92].v = 2200; B[92].c = B[92].o - 0.5; B[93].v = 2300; B[93].c = B[93].o; const c = creerCalcul('btc').maj(B);
  v('fort ≥ 2', classe(B, c, 90, 2).niveau !== 0 || c.rel(90) < 2, String(c.rel(90)));
  const x = classe(B, c, 91, 2); v('extrême ≥ 3', x.niveau === 2 && c.rel(91) >= SEUIL_EXTREME, JSON.stringify(x));
  v('seuil 3 : une bougie à ×2,1 n’est plus colorée', classe(B, c, 92, 3).niveau === 0);
  v('doji : pas de sens, pas de couleur', classe(B, c, 93, 2).niveau === 0);
  v('sens vendeur si clôture < ouverture', classe(B, c, 92, 2).dir === -1 || classe(B, c, 92, 2).niveau === 0); }

/* 6. contexte (passé seulement) */
{ const B = []; let p = 100; for (let i = 0; i < 40; i++) { const o = p, c = p + 1; B.push({ t: i * H4, o, h: c + 0.2, l: o - 0.2, c, v: 1000 }); p = c; }
  v('fin de mouvement : 5/7 haussières + plus haut des 20', contexteDe(B, 35) === 'fin');
  const R = []; for (let i = 0; i < 30; i++) { const o = 100 + (i % 2 ? 0.3 : -0.3); R.push({ t: i * H4, o, h: 100.6, l: 99.4, c: 100 + (i % 2 ? -0.3 : 0.3), v: 1000 }); }
  R.push({ t: 30 * H4, o: 100, h: 102.5, l: 99.9, c: 102, v: 1000 }); v('sortie de range : clôture au-dessus du plus haut des 20 précédentes', contexteDe(R, 30) === 'range');
  const M = R.slice(0, 29); M.push({ t: 29 * H4, o: 100, h: 100.3, l: 99.9, c: 100.2, v: 1000 }); v('sinon milieu de mouvement', contexteDe(M, 29) === 'milieu', String(contexteDe(M, 29)));
  v('moins de 20 bougies : contexte inconnu', contexteDe(B, 10) == null); }

/* 7. calcul incrémental = calcul complet */
{ const B = serie(400, undefined, { picsA: [[390, 3.5]] }), inc = creerCalcul('btc'); inc.maj(B.slice(0, 380)); for (let n = 381; n <= 400; n++) inc.maj(B.slice(0, n)); const tout = creerCalcul('btc').maj(B);
  let d = 0; for (let i = 0; i < 400; i++) if (inc.rel(i) !== tout.rel(i) || inc.atr(i) !== tout.atr(i) || inc.ma(i) !== tout.ma(i) || inc.ctx(i) !== tout.ctx(i)) d++; v('incrémental identique au calcul complet', d === 0, d + '');
  const Bm = B.map(b => ({ ...b })); Bm[399].v = 100; inc.maj(Bm); v('la dernière bougie est recalculée quand son volume change', inc.rel(399) < 0.2); }

/* 8. suite : variation à +1/+3/+5/+10, extrêmes favorable/défavorable */
{ const B = []; let p = 100; for (let i = 0; i < 40; i++) { const o = p, c = p + (i % 2 ? 0.2 : -0.2); B.push({ t: i * H4, o, h: Math.max(o, c) + 0.3, l: Math.min(o, c) - 0.3, c, v: 1000 }); p = c; }
  B[30] = { t: 30 * H4, o: 100, h: 101.2, l: 99.9, c: 101, v: 4000 }; for (let j = 31; j < 40; j++) { const o = j === 31 ? 101 : B[j - 1].c, c = o + 0.5; B[j] = { t: j * H4, o, h: c + 0.1, l: o - 0.1, c, v: 1000 }; }
  const c = creerCalcul('btc').maj(B), s = suite(B, c, 30, 39);
  v('+1 bougie', Math.abs(s.horizons[0].pct - 0.5 / 101 * 100) < 1e-9); v('+3 bougies', Math.abs(s.horizons[1].atr - 1.5 / c.atr(30)) < 1e-9); v('+10 : indisponible (9 bougies seulement)', s.horizons[3].pct == null);
  v('mouvement favorable > défavorable', s.favorable.atr > s.defavorable.atr); v('haut repris', s.hautRepris === true); v('bas non repris', s.basRepris === false); }

/* 9. statistiques : petit échantillon, pas de pourcentage ; zones */
{ const B = serie(500, undefined, { picsA: [[200, 3.5], [250, 3.2], [300, 3.6], [330, 2.4]] }); B[200].c = B[200].o + 1; B[250].c = B[250].o - 1; B[300].c = B[300].o + 1;
  const c = creerCalcul('btc').maj(B), T = tableau(B, c, { seuil: 2, pas: H4, maintenant: B[499].t + H4 });
  v('petit échantillon marqué', T.lignes.achatFort.petit === true && T.lignes.achatFort.n >= 1 && T.lignes.achatFort.n < MIN_CAS);
  v('nombre de cas cohérent', T.lignes.achatFort.n + T.lignes.venteForte.n === T.total);
  const txt = resumeParle(T, { actif: 'or', unite: 'H4', seuil: 2 }); v('résumé parlé : échantillon trop petit, sans pourcentage', /échantillon trop petit/.test(txt) && !/\d\s?%/.test(txt) && /pas un signal/.test(txt), txt);
  const Z = zones(B, c, { pas: H4, maintenant: B[499].t + H4 }); v('zones : seulement les bougies extrêmes', Z.every(z => [200, 250, 300].includes(z.i)));
  const b = B[200]; v('zone = corps de la bougie', Z.every(z => z.bas === Math.min(B[z.i].o, B[z.i].c) && z.haut === Math.max(B[z.i].o, B[z.i].c)));
  /* zone traversée en clôture : retirée */
  const B2 = B.map(x => ({ ...x })); B2[210].c = Math.min(B2[200].o, B2[200].c) - 5; const c2 = creerCalcul('btc').maj(B2); v('zone traversée en clôture : disparaît', !zones(B2, c2, { pas: H4, maintenant: B2[499].t + H4 }).some(z => z.i === 200)); }
{ const B = serie(900), c0 = creerCalcul('btc'); for (let k = 0; k < 15; k++) { const i = 100 + k * 40; B[i].v = 1100 * 4; B[i].c = B[i].o + 0.4; B[i].o = B[i].c - 0.8; }   // 15 bougies extrêmes très haussières, puis aucune clôture sous leur corps
  for (let i = 0; i < B.length; i++) if (!(i >= 100 && (i - 100) % 40 === 0)) { B[i].c = Math.max(B[i].c, 101); B[i].o = Math.max(B[i].o, 100.5); B[i].l = Math.min(B[i].l, B[i].c); }
  const c = c0.maj(B), Z = zones(B, c, { pas: H4, maintenant: B[899].t + H4 }); v('au plus 8 zones, les plus récentes', Z.length <= 8 && (Z.length === 0 || Z[Z.length - 1].i >= Z[0].i)); }

/* 10. bougie en cours, alertes H4 / Jour, textes */
{ const B = serie(100); B[99].v = 5000; const c = creerCalcul('btc').maj(B), fin = B[99].t + H4;
  v('bougie en cours détectée', estEnCours(B[99], H4, B[99].t + 100) && !estEnCours(B[99], H4, fin));
  v('pas d’alerte tant que la bougie n’est pas close', alertesCloture(B, c, { actif: 'or', unite: 'H4', pas: H4, maintenant: B[99].t + 100 }).length === 0);
  const A = alertesCloture(B, c, { actif: 'or', unite: 'H4', pas: H4, maintenant: fin + 60e3 }); v('alerte à la clôture', A.length === 1 && A[0].t === B[99].t, JSON.stringify(A));
  v('pas d’alerte en H1', alertesCloture(B, c, { actif: 'or', unite: 'H1', pas: 3600e3, maintenant: fin }).length === 0);
  v('pas d’alerte pour le passé (plus de 36 h)', alertesCloture(B, c, { actif: 'or', unite: 'H4', pas: H4, maintenant: fin + 40 * 3600e3 }).length === 0);
  v('phrase d’alerte', phraseAlerte({ actif: 'or', unite: 'H4', dir: -1, rel: 3.4, ma: 'dessous' }) === 'Bougie de volume extrême vendeur sur l’or en H4, ×3,4 la médiane, sous la MA200.', phraseAlerte({ actif: 'or', unite: 'H4', dir: -1, rel: 3.4, ma: 'dessous' })); }

console.log(ko ? `✗ ${ko} échec(s) / ${ok + ko}` : `✓ ${ok} vérifications : bougies volume (calculs purs)`); process.exit(ko ? 1 : 0);
