/* Tests de « MA200 H4 + zones majeures H4 » (module pur) : tendance, zones majeures, 3 types de flèches, anti-bruit, aucune bougie future (walk-forward), résultat en R, statistiques, registre, version, réglages, textes.
   Usage : node trader-pro/tests/ma200-test.mjs */
import { contexte, confirmee, analyser, suivre, statistiques, ancrer, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, sensPourBougies, ma200PourBougies, niveauParle, phraseFleche, typeLibelle, typeNom, cloturees, COULEURS, PARAMS, ALGO_ID, J, H4 } from '../terminal/ma200-h4.js';
import { analyseDe, flechesDe, nouvellesFleches, lireReglages, ecrireReglages, purgerAnciens, CLE_REGLAGES, CLE_REGISTRE } from '../terminal/fleches-registre.js';
import fs from 'node:fs';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };

/* marché synthétique déterministe en H4 : grande vague lente (la MA200 est franchie dans les deux sens) + oscillations (le prix revient toucher la MA200 et des niveaux) + bruit ; 6 bougies H4 par jour, sans week-end */
function marche(jours, graine = 11) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const T0 = Date.UTC(2020, 0, 6, 0), H = []; let prev = 1000;
  for (let d = 0; d < jours; d++) {
    if (d % 7 === 5 || d % 7 === 6) continue;
    const cible = 1000 + 60 * Math.sin(d / 110) + 25 * Math.sin(d / 9) + (alea() - 0.5) * 10, t0 = T0 + d * J; let p = prev;
    for (let k = 0; k < 6; k++) { const o = p, c = k === 5 ? cible : o + (cible - prev) / 6 + (alea() - 0.5) * 5, h = Math.max(o, c) + alea() * 3, l = Math.min(o, c) - alea() * 3; p = c; H.push({ t: t0 + k * H4, o, h, l, c, v: 100 }); }
    prev = cible;
  }
  return H;
}
const H = marche(2600), FIN = H[H.length - 1].t + H4, R = analyser(H, { maintenant: FIN }), F = R.fleches, B = R.B;

console.log('— tendance MA200 H4 —');
{
  const C = contexte(B);
  v(C.M.slice(0, 199).every(x => x == null) && C.M[199] != null && Math.abs(C.M[250] - B.slice(51, 251).reduce((s, b) => s + b.c, 0) / 200) < 1e-9, 'MA200 = moyenne simple des 200 dernières clôtures H4');
  let bon = true, n = [0, 0, 0]; for (let i = 0; i < B.length; i++) { const attendu = C.M[i] == null || C.pente[i] == null ? 0 : B[i].c > C.M[i] && C.pente[i] > 0 ? 1 : B[i].c < C.M[i] && C.pente[i] < 0 ? -1 : 0; if (attendu !== C.tend[i]) bon = false; n[C.tend[i] + 1]++; }
  v(bon && C.pente[219] === C.M[219] - C.M[199] && C.pente[218] == null, 'tendance : haussière = clôture au-dessus de la MA et pente positive sur 20 bougies, baissière = l’inverse, sinon neutre');
  v(n.every(x => x > 100), 'le marché synthétique traverse les trois états (baissière ' + n[0] + ', neutre ' + n[1] + ', haussière ' + n[2] + ')');
}

console.log('— confirmation de clôture (rejet 40 % ou reprise) —');
{
  const mk = (o, h, l, c) => ({ t: 0, o, h, l, c });
  v(confirmee([mk(10, 10, 9, 9.5), mk(9.6, 10.2, 8, 10)], 1, 1) === true, 'achat : mèche basse ≥ 40 % de la bougie');
  v(confirmee([mk(10, 10.1, 9, 9.1), mk(9.2, 10.2, 9.1, 10.1)], 1, 1) === true && confirmee([mk(10, 10.1, 9, 9.1), mk(9.2, 9.7, 9.15, 9.6)], 1, 1) === false, 'achat : bougie de reprise efface la précédente ; sans mèche ni reprise : refusé');
  v(confirmee([mk(9, 10, 9, 10), mk(10, 12, 9.9, 10.3)], 1, -1) === true && confirmee([mk(9, 10, 9, 10), mk(10, 10.1, 9, 9.1)], 1, -1) === false, 'vente : mèche haute ≥ 40 % ; grosse bougie baissière sans mèche : refusée');
}

console.log('— zones majeures —');
{
  v(R.toutesZones.length > 0 && R.toutesZones.every(z => z.touches >= PARAMS.touchesMin), 'toute zone majeure a au moins ' + PARAMS.touchesMin + ' touches (' + R.toutesZones.length + ' zones)');
  const px = B[B.length - 1].c, au = R.zones.filter(z => z.milieu > px), sous = R.zones.filter(z => z.milieu <= px);
  v(au.length <= 3 && sous.length <= 3, '3 zones au plus au-dessus et 3 au plus en dessous du prix (' + au.length + ' / ' + sous.length + ')');
  v(R.zones.every(z => z.hi >= z.lo && z.role !== 0), 'chaque zone a un rôle (support / résistance) et des bornes');
  // zone synthétique : trois sommets au même niveau, avec chute de plus de 3 ATR après chacun
  const S = []; let t = 0, px2 = 100; const bar = (o, c) => { S.push({ t: t += H4, o, h: Math.max(o, c) + 0.3, l: Math.min(o, c) - 0.3, c }); };
  for (let k = 0; k < 40; k++) bar(100, 100);
  for (let rep = 0; rep < 4; rep++) { for (let k = 0; k < 11; k++) bar(100 + k * 0.9, 100 + (k + 1) * 0.9); S[S.length - 1].h = 110; for (let k = 0; k < 12; k++) bar(110 - k * 1.2, 110 - (k + 1) * 1.2); }
  for (let k = 0; k < 15; k++) bar(95, 95);
  const Z = analyser(S, { maintenant: Infinity });
  v(Z.toutesZones.some(z => z.role < 0 && z.hi >= 109.5 && z.lo <= 110.5 && z.touches >= 3), 'trois sommets au même niveau avec grosse réaction : une résistance majeure est détectée');
  // zone cassée nettement : devient support
  const S2 = S.slice(); for (let k = 0; k < 8; k++) S2.push({ t: S2[S2.length - 1].t + H4, o: 95 + k * 3, h: 99 + k * 3, l: 94 + k * 3, c: 98 + k * 3 });
  const Z2 = analyser(S2, { maintenant: Infinity }); v(Z2.toutesZones.some(z => z.hi >= 109.5 && z.lo <= 110.5 && z.role > 0), 'clôture H4 à plus de 1 ATR au-delà de la résistance : elle devient un support');
}

console.log('— flèches : trois types, confirmées à la clôture H4 —');
{
  v(F.length > 5, 'le marché synthétique produit des flèches (' + F.length + ')');
  v(F.every(f => ['rebond', 'retest', 'zone'].includes(f.type) && (f.dir === 1 || f.dir === -1) && f.tFin === f.t + H4 && f.entree === B[f.iH4].c && Math.abs(Math.abs(f.entree - f.stop) - f.atr) < 1e-9), 'trois types seulement ; entrée = clôture de la bougie H4 ; stop = 1 ATR contre');
  v(F.filter(f => f.type !== 'retest').every(f => f.dir === R.tend[f.iH4]), 'aucune flèche a ou c contre la tendance MA200 H4, aucune en tendance neutre');
  let bon = true; for (const f of F.filter(f => f.type === 'rebond')) { const b = B[f.iH4], m = R.M[f.iH4], a = R.A[f.iH4]; if (!(f.dir > 0 ? b.l <= m + 0.25 * a && b.c > m : b.h >= m - 0.25 * a && b.c < m) || !confirmee(B, f.iH4, f.dir)) bon = false; }
  v(bon, 'rebond MA200 : la mèche touche la MA à moins de 0,25 ATR, clôture du bon côté, rejet ou reprise');
  bon = true; for (const f of F.filter(f => f.type === 'retest')) { let cass = false; for (let k = f.iH4 - 1; k >= Math.max(0, f.iH4 - PARAMS.fenetreRetest - 1); k--) if (f.dir > 0 ? B[k].c > R.M[k] + PARAMS.cassureMA * R.A[k] : B[k].c < R.M[k] - PARAMS.cassureMA * R.A[k]) cass = true; if (!cass || (f.dir > 0 ? B[f.iH4].c <= R.M[f.iH4] : B[f.iH4].c >= R.M[f.iH4])) bon = false; }
  v(bon, 'cassure + retest : une clôture franche de l’autre côté dans les 10 bougies précédentes ; jamais de flèche sur la cassure elle-même');
  bon = true; for (const f of F.filter(f => f.type === 'zone')) { const z = R.toutesZones.some(z => Math.abs(z.milieu - f.zone) < 1e-9); if (!z && !Number.isFinite(f.zone)) bon = false; } v(bon, 'rebond sur zone : la flèche porte le niveau de la zone');
  v(F.filter(f => f.type !== 'retest' && f.grosse).every(f => { const m = f.ma200, a = f.atr; return R.toutesZones.some(z => (m >= z.lo && m <= z.hi ? 0 : Math.min(Math.abs(m - z.lo), Math.abs(m - z.hi))) < a * 1.0 + 1e-9) || Math.abs(f.zone - m) < a; }), 'grosse flèche : MA200 H4 et zone majeure à moins de 1 ATR');
  const g = styleFleche({ dir: 1, grosse: true }), p = styleFleche({ dir: -1, grosse: false });
  v(g.taille > p.taille && g.forme === 'arrowUp' && g.position === 'belowBar' && p.forme === 'arrowDown' && p.position === 'aboveBar', 'grosse flèche plus grande que la petite ; verte ▲ sous la bougie, rouge ▼ au-dessus');
}

console.log('— anti-bruit —');
{
  let bon = true, opp = true; for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) { const e = F[j].iH4 - F[i].iH4; if (F[i].dir === F[j].dir && e < PARAMS.memeSens) bon = false; if (F[i].dir !== F[j].dir && e < PARAMS.sensOppose) opp = false; }
  v(bon, 'au moins 12 bougies H4 entre deux flèches du même sens');
  v(opp, 'jamais un achat et une vente à moins de 6 bougies');
  const mois = F.length / (B.length / 6 / 21); v(mois < 8, 'quelques flèches par mois seulement (' + mois.toFixed(1) + ')');
}

console.log('— aucune bougie future (walk-forward) —');
{
  const cle = f => `${f.t}|${f.dir}|${f.type}|${f.grosse}`;
  for (const N of [1500, 2200, 2900]) {
    const partiel = analyser(H.slice(0, N), { maintenant: Infinity }).fleches.map(cle), complet = F.filter(f => f.iH4 < N).map(cle);
    v(JSON.stringify(partiel) === JSON.stringify(complet), `les flèches calculées avec ${N} bougies sont exactement celles de l’analyse complète (aucune flèche ne bouge ni ne disparaît)`);
  }
  v(analyser(H.concat([{ t: FIN, o: 1, h: 1e9, l: 0, c: 5, v: 1 }]), { maintenant: FIN + 3600e3 }).fleches.length === F.length && cloturees(H.concat([{ t: FIN, o: 1, h: 1, l: 1, c: 1 }]), FIN + 3600e3).length === H.length, 'la bougie H4 en cours (non clôturée) est ignorée');
}

console.log('— résultat d’une flèche : +2 ATR avant −1 ATR —');
{
  const mkB = L => L.map((x, i) => ({ t: i * H4, o: x[0], h: x[1], l: x[2], c: x[3] })), f = (dir) => ({ dir, entree: 100, atr: 2, R: 2, iH4: 0 });
  v(suivre(f(1), mkB([[100, 100, 100, 100], [100, 105, 99, 104]])).etat === 'gagnante', 'achat : +2 ATR (104) avant −1 ATR (98) : gagnante, +2 R');
  v(suivre(f(1), mkB([[100, 100, 100, 100], [100, 101, 97.9, 99], [99, 106, 99, 105]])).r === -1, 'achat : −1 ATR touché d’abord : perdante, −1 R');
  v(suivre(f(1), mkB([[100, 100, 100, 100], [100, 105, 97, 100]])).etat === 'perdante', 'les deux dans la même bougie : perdante (prudent)');
  v(suivre(f(-1), mkB([[100, 100, 100, 100], [100, 101, 95, 96]])).r === 2 && suivre(f(-1), mkB([[100, 100, 100, 100], [100, 103, 99, 102]])).r === -1, 'vente : miroir');
  v(suivre(f(1), mkB([[100, 100, 100, 100], [100, 101, 99, 100.5]])).etat === 'en cours', 'ni l’un ni l’autre : en cours (non comptée)');
  const S = statistiques(F, B);
  v(S.total.nombre === F.length && S.total.resolues + S.total.enCours === F.length && S.parType.rebond.nombre + S.parType.retest.nombre + S.parType.zone.nombre === F.length, 'statistiques : le total est la somme des trois types');
  v(S.total.pct === null || (S.total.pct >= 0 && S.total.pct <= 100), 'statistiques : pourcentage de réussite');
  const attendu = F.reduce((s, x) => { const r = suivre(x, B); return r.etat === 'en cours' ? s : s + r.r; }, 0) / S.total.resolues; v(Math.abs(S.total.rMoyen - attendu) < 1e-9, 'statistiques : R moyen = moyenne des R des flèches résolues');
  v(R.stats.total.nombre === F.length, 'analyser() renvoie les statistiques');
}

console.log('— placement sur H1, H4 et Jour, fond, ligne MA200 —');
{
  const f = F[Math.floor(F.length / 2)];
  const h1 = []; for (const b of B) for (let k = 0; k < 4; k++) h1.push({ t: b.t + k * 3600e3, o: b.o, h: b.h, l: b.l, c: b.c });
  const j = []; for (let i = 0; i < B.length; i += 6) j.push({ t: B[i].t, o: B[i].o, h: B[i].h, l: B[i].l, c: B[i].c });
  const iH1 = indexSurUnite(h1, f, 3600e3), iH4 = indexSurUnite(B, f, H4), iJ = indexSurUnite(j, f, J);
  v(iH4 === f.iH4 && B[iH4].t === f.t, 'H4 : la flèche est sur la bougie H4 de confirmation');
  v(iH1 >= 0 && h1[iH1].t === f.t + 3 * 3600e3, 'H1 : la flèche est sur la dernière bougie H1 de la bougie H4 (heure de clôture), plus aucune restriction sur H1');
  v(iJ >= 0 && j[iJ].t <= f.t && f.tFin - 1 < j[iJ].t + J, 'Jour : la flèche est sur la bougie du jour qui contient la clôture H4');
  v(indexSurUnite(h1, { tFin: h1[0].t - 5 * H4 }, 3600e3) === -1 && indexSurUnite([], f, H4) === -1, 'hors de l’historique affiché : aucune flèche');
  const sH4 = sensPourBougies(B, R.sens, H4), sJ = sensPourBougies(j, R.sens, J), mH1 = ma200PourBougies(h1, B, R.M, 3600e3), mH4 = ma200PourBougies(B, B, R.M, H4);
  v(sH4.length === B.length && sH4.every(x => [-1, 0, 1].includes(x)) && sH4[400] === R.tend[399], 'fond H4 : la tendance de la dernière bougie H4 clôturée');
  v(sJ.length === j.length && sJ.every(x => [-1, 0, 1].includes(x)), 'fond Jour : valeurs -1 / 0 / 1');
  v(mH4[300] === R.M[300] && mH1[1200] != null && mH1[1203] === R.M[300] || mH1[1200] === R.M[299], 'MA200 H4 sur H1 : la valeur de la dernière bougie H4 clôturée à la clôture de la bougie H1');
  v(mH4.slice(0, 199).every(x => x == null), 'MA200 absente avant 200 bougies H4');
}

console.log('— textes et couleurs —');
{
  const f = { type: 'rebond', dir: 1, entree: 2650.4, stop: 2620, grosse: false }, z = { type: 'zone', dir: -1, entree: 2650, stop: 2680, grosse: true }, c = { type: 'retest', dir: -1, entree: 100, stop: 101 };
  v(niveauParle(2650.4) === '2 650' && niveauParle(1.2345) === '1,23', 'niveau énoncé');
  v(/achat/.test(phraseFleche('Or', f)) && /MA200 H4/.test(phraseFleche('Or', f)) && /stop 2 620/.test(phraseFleche('Or', f)) && /^Or :/.test(phraseFleche('Or', f)), 'phrase vocale : actif, sens, type, entrée, stop : ' + phraseFleche('Or', f));
  v(/vente/.test(phraseFleche('Or', z)) && /résistance/.test(typeLibelle(z)) && /même endroit/.test(typeLibelle(z)), 'zone grosse flèche : « résistance… MA200 et zone majeure au même endroit »');
  v(/retest/.test(typeLibelle(c)) && typeNom(f) === 'Rebond MA200' && typeNom(z) === 'Rebond sur zone' && typeNom(c) === 'Cassure + retest', 'noms des trois types');
  v(COULEURS.fond[1] && COULEURS.fond[-1] && COULEURS.zone[1] && COULEURS.zone[-1], 'couleurs du fond et des zones');
}

console.log('— registre sur l’appareil, réglages, alertes —');
{
  const st = memoire(), D = { h4: H }, t = FIN + 3600e3;
  const a = analyseDe('or', D, { maintenant: t, stockage: st });
  v(a.reg.length === F.length && a.reg.every(x => x.vueLe === t) && a.stats && a.stats.total.nombre === F.length, 'premier calcul : tout l’historique est enregistré comme déjà vu (rien n’est annoncé), statistiques calculées');
  v(a.zones.length <= 6 && a.sens.length === B.length && a.M.length === B.length, 'zones (6 au plus), tendance et MA200 renvoyées');
  v(nouvellesFleches('or', a.reg, { maintenant: t, stockage: st }).length === 0, 'aucune ancienne flèche n’est annoncée');
  const b = analyseDe('or', { h4: H.slice(0, 2000) }, { maintenant: t, stockage: memoire() }); v(b.reg.length > 0 && b.reg.length < a.reg.length, 'une série plus courte : moins de flèches');
  // nouvelle flèche : annoncée une seule fois
  const sansDer = a.reg.slice(0, -1); const st2 = memoire(); st2.setItem(CLE_REGISTRE('or'), JSON.stringify(sansDer.map(x => ({ ...x, vueLe: 1 }))));
  const c = analyseDe('or', D, { maintenant: F[F.length - 1].tFin + 3600e3, stockage: st2 }), n1 = nouvellesFleches('or', c.reg, { maintenant: F[F.length - 1].tFin + 3600e3, stockage: st2 }), n2 = nouvellesFleches('or', c.reg, { maintenant: F[F.length - 1].tFin + 3600e3, stockage: st2 });
  v(n1.length === 1 && n1[0].t === F[F.length - 1].t && n2.length === 0, 'une nouvelle flèche confirmée est annoncée une seule fois');
  v(fusionnerRegistre('or', c.reg, F).length === c.reg.length && c.reg.every(x => x.id === idFleche('or', x)), 'fusion : jamais de doublon ; identifiant stable');
  v(ancrer(c.reg[0], B) && ancrer(c.reg[0], B).iH4 === c.reg[0].iH4 && ancrer({ ...c.reg[0], t: 1 }, B) === null, 'une flèche du registre retrouve sa bougie H4');
  v(flechesDe('or', D, { maintenant: t, stockage: memoire() }).length === F.length && analyseDe('or', { h4: H.slice(0, 100) }, { maintenant: t, stockage: memoire() }).reg.length === 0, 'moins de 300 bougies H4 : aucune flèche, aucune erreur');
  const s3 = memoire(); v(lireReglages(s3).actif === true && lireReglages(s3).fond === true, 'réglages par défaut : flèches et fond activés'); ecrireReglages({ actif: false, fond: true }, s3); v(lireReglages(s3).actif === false && s3.m.has(CLE_REGLAGES), 'réglages enregistrés');
}

console.log('— version, mise à jour et anciens registres —');
{
  const lireV = (f, re) => (fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').match(re) || [])[1];
  const versions = { 'precache.json': lireV('precache.json', /"version":"([^"]+)"/), 'sw.js': lireV('sw.js', /const VERSION = '([^']+)'/), 'index.html': lireV('index.html', /RAYLE_VERSION='([^']+)'/), 'or.html': lireV('agent-trading/front/or.html', /RAYLE_OR_VERSION = '([^']+)'/), 'version.js': lireV('trader-pro/terminal/version.js', /VERSION = '([^']+)'/) };
  v(Object.values(versions).every(x => x && x === versions['sw.js']), 'la même version dans sw.js, precache.json, index.html, or.html et version.js : ' + JSON.stringify(versions));
  v(JSON.parse(fs.readFileSync(new URL('../../precache.json', import.meta.url), 'utf8')).coeur.includes('trader-pro/terminal/version.js'), 'version.js est dans la liste de précache (hors ligne)');
  const orHtml = fs.readFileSync(new URL('../../agent-trading/front/or.html', import.meta.url), 'utf8');
  v(/precache\.json/.test(orHtml) && /getRegistrations/.test(orHtml) && /caches\.delete/.test(orHtml) && /controllerchange/.test(orHtml) && />= 2\) return/.test(orHtml), 'or.html : compare à la version publiée, met le service worker à jour, vide les caches, recharge, au plus 2 tentatives par version');
  /* un appareil qui avait enregistré les flèches d'une ancienne variante (MA200 Daily + H4) ne les revoit plus */
  const st = memoire(), faux = i => ({ id: 'or|' + i + '|-1|rebond', type: 'rebond', dir: -1, t: Date.now() - i * 864e5, tFin: Date.now() - i * 864e5 + 144e5, entree: 4000, stop: 4100, R: 100, zone: 'MA200 Daily', vueLe: 1 });
  const vieux = Array.from({ length: 12 }, (_, i) => faux(i + 1));
  for (const k of ['rayle_tp_ma1_or', 'rayle_tp_ma2_or_daily2-sanspente-r3', 'rayle_tp_ma2_or_V0-base-r1']) st.setItem(k, JSON.stringify(vieux));
  st.setItem('rayle_tp_zz1_or_2_5', '[]'); st.setItem('autre_cle', 'x');
  const r = analyseDe('or', { h4: H }, { maintenant: FIN + 3600e3, stockage: st });
  v(r.reg.length > 0 && !r.reg.some(f => f.zone === 'MA200 Daily'), 'ancien registre (MA200 Daily + H4) : jamais relu, aucune ancienne flèche ne s’affiche');
  v(['rayle_tp_ma1_or', 'rayle_tp_ma2_or_daily2-sanspente-r3', 'rayle_tp_ma2_or_V0-base-r1', 'rayle_tp_zz1_or_2_5'].every(k => !st.m.has(k)) && st.m.has('autre_cle') && st.m.has(CLE_REGISTRE('or')) && ALGO_ID() === 'h4-v1', 'les anciens registres sont supprimés, la clé du registre actuel contient l’algorithme (' + ALGO_ID() + '), les autres clés restent');
  const st2 = memoire(); st2.setItem('rayle_tp_ma2_btc_' + ALGO_ID(), '[]'); v(purgerAnciens(st2) === 0 && st2.m.size === 1, 'la purge ne touche pas le registre de l’algorithme actuel');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
