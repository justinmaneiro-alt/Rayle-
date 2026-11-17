/* Tests des Retournements Daily (module pur) : aucune bougie future (walk-forward), règles anti-bruit, plan d'entrée, registre, réglages, textes. Usage : node trader-pro/tests/retournements-test.mjs */
import { retournements, contexteJour, cloturees, fusionnerRegistre, idRetournement, styleFleche, indexSurUnite, niveauParle, phraseFleche, simuler, VERSIONS, VERSION_DEFAUT, versionDe, PARAMS, J, H4 } from '../terminal/retournements-daily.js';
import { flechesDe, nouvellesFleches, lireReglages, ecrireReglages, versionActive, lireRegistre, barresDaily, CLE_REGLAGES } from '../terminal/fleches-registre.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), m }; };

/* marché synthétique déterministe : oscillation lente + bruit, 6 bougies H4 par jour (ancrées à 22 h UTC), Daily = regroupement des 6 bougies, volume avec pics */
function marche(jours, graine = 7) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const T0 = Date.UTC(2020, 0, 5, 22), H = [], Jr = []; let p = 1000, vol = 100;
  for (let d = 0; d < jours; d++) {
    const dow = (d % 7); if (dow === 5 || dow === 6) continue;   // pas de week-end
    const t0 = T0 + d * J, lot = [];
    for (let k = 0; k < 6; k++) { const o = p, tend = Math.sin((d * 6 + k) / 30) * 2.2, c = o + tend + (alea() - 0.5) * 9, h = Math.max(o, c) + alea() * 3, l = Math.min(o, c) - alea() * 3; p = c; const b = { t: t0 + k * H4, o, h, l, c, v: Math.round(vol * (0.5 + alea())) }; lot.push(b); H.push(b); }
    Jr.push({ t: t0, o: lot[0].o, h: Math.max(...lot.map(b => b.h)), l: Math.min(...lot.map(b => b.l)), c: lot[5].c, v: Math.round(lot.reduce((a, b) => a + b.v, 0) * (alea() < 0.25 ? 1.8 : 1)) });
  }
  return { Jr, H };
}
const { Jr, H } = marche(1500), FIN = H[H.length - 1].t + H4;

console.log('— retournements : règles —');
const res = {}; for (const k of Object.keys(VERSIONS)) res[k] = retournements(Jr, H, { version: k, maintenant: FIN });
const S = res.sansVolume.signaux;
v(S.length >= 5, 'le marché synthétique produit des retournements (sans filtre volume) : ' + S.length);
v(res.complete.signaux.length <= S.length, 'la version complète (filtre volume) ne produit jamais plus de signaux que « sans filtre volume » : ' + res.complete.signaux.length + ' ≤ ' + S.length);
for (const k of Object.keys(VERSIONS)) {
  const L = res[k].signaux, X = k + ' : ';
  v(L.every((s, i) => i === 0 || s.t >= L[i - 1].t), X + 'signaux dans l’ordre chronologique');
  v(new Set(L.map(s => s.zone.id)).size === L.length, X + '1 seule flèche par zone');
  v([1, -1].every(d => { const t = L.filter(s => s.dir === d).map(s => s.t); return t.every((x, i) => i === 0 || x - t[i - 1] >= PARAMS.espaceMemeSensJ * J); }), X + 'au moins 10 jours entre deux flèches de même sens');
  v(L.every(s => s.rr >= PARAMS.minR - 1e-9), X + 'objectif toujours à 2 R ou plus de l’entrée (' + L.length + ' signaux)');
  v(L.every(s => (s.dir > 0 ? s.stop < s.entree && s.objectif > s.entree : s.stop > s.entree && s.objectif < s.entree)), X + 'stop et objectif du bon côté de l’entrée');
  v(L.every(s => s.tFin <= FIN && H[s.iH4].t === s.t && s.tFin === s.t + H4), X + 'la flèche est sur une bougie H4 terminée (la bougie de confirmation)');
  v(L.every(s => s.t >= s.tTouch + J && s.t < s.tTouch + J + (PARAMS.fenetreJ + 1) * J), X + 'confirmation dans les 5 jours qui suivent le touch');
  v(L.every(s => (s.dir > 0 ? s.entree > s.declencheur : s.entree < s.declencheur)), X + 'la clôture H4 de confirmation dépasse le dernier sommet (creux) H4 de la descente (montée)');
}
v(res.complete.signaux.every(s => s.ratio >= PARAMS.volMult), 'version complète : volume du touch ≥ 1,2 × la moyenne des 20 jours');
v(res.tendance.signaux.every(s => (s.dir > 0 ? s.tendance === 1 : s.tendance === -1)), 'version « sens de la MA200 » : jamais à contre-sens de la MA200 Daily');
v(versionDe('n’importe quoi') === VERSION_DEFAUT && versionDe('tendance') === 'tendance', 'version inconnue : retour à la version par défaut (' + VERSION_DEFAUT + ')');

console.log('— walk-forward : aucune bougie future, aucun repaint —');
{
  const coupes = [0.35, 0.5, 0.65, 0.8, 0.93].map(f => H[Math.floor(H.length * f)].t), cle = s => s.t + '|' + s.dir + '|' + s.zone.id + '|' + s.entree.toFixed(6) + '|' + s.stop.toFixed(6) + '|' + s.objectif.toFixed(6);
  for (const tc of coupes) {
    const Hc = H.filter(b => b.t + H4 <= tc), Jc = Jr.filter(b => b.t + J <= tc), p = retournements(Jc, Hc, { version: 'sansVolume', maintenant: tc }).signaux, f = S.filter(s => s.tFin <= tc);
    v(p.map(cle).join() === f.map(cle).join(), 'données coupées au ' + new Date(tc).toISOString().slice(0, 10) + ' : les ' + f.length + ' signaux déjà confirmés sont identiques (aucun ne bouge, n’apparaît ni ne disparaît)');
  }
  /* modifier tout le FUTUR ne change rien au passé */
  const tc = H[Math.floor(H.length * 0.6)].t, futur = H.map(b => (b.t > tc ? { ...b, o: b.o * 0.5, h: b.h * 0.5, l: b.l * 0.5, c: b.c * 0.5 } : b)), futurJ = Jr.map(b => (b.t > tc ? { ...b, o: b.o * 0.5, h: b.h * 0.5, l: b.l * 0.5, c: b.c * 0.5 } : b));
  const a = retournements(Jr, H, { version: 'sansVolume', maintenant: FIN }).signaux.filter(s => s.tFin <= tc), b = retournements(futurJ, futur, { version: 'sansVolume', maintenant: FIN }).signaux.filter(s => s.tFin <= tc);
  v(a.map(cle).join() === b.map(cle).join() && a.length > 0, 'un futur totalement différent ne change aucun signal du passé (' + a.length + ' signaux comparés)');
  /* les zones d'une bougie k ne dépendent que des bougies 0…k */
  const C = contexteJour(Jr), C2 = contexteJour(Jr.slice(0, 700)), k = 600, z1 = JSON.stringify(C.zonesA(k)), z2 = JSON.stringify(C2.zonesA(k));
  v(z1 === z2, 'les zones Daily connues à la bougie ' + k + ' sont les mêmes avec ou sans les bougies suivantes');
}

console.log('— zones —');
{
  const C = contexteJour(Jr), Z = C.zonesA(800), w = PARAMS.zoneATR * C.A[800];
  v(Z.length >= 6 && Z.length <= 11, 'zones à la bougie 800 : ' + Z.length + ' (3 sommets + 3 creux au plus, R1 R2 S1 S2, MA200)');
  v(Z.every(z => Math.abs(z.haut - z.bas - 2 * w) < 1e-9 && Math.abs((z.haut + z.bas) / 2 - z.niveau) < 1e-9), 'zone = niveau ± 0,3 ATR(14) Daily');
  v(Z.filter(z => z.type === 'sommet').length <= 3 && Z.filter(z => z.type === 'creux').length <= 3 && Z.filter(z => z.type === 'ma200').length === 1, '3 derniers sommets, 3 derniers creux, une MA200');
  v(C.zonesA(0).length === 0 && C.zonesA(5).length === 0, 'pas de zone sans ATR (début de série)');
}

console.log('— placement, style, textes, simulation —');
{
  const f = { t: H[100].t, tFin: H[100].t + H4, dir: 1 }, hh = H.slice(90, 130), jj = Jr.slice(10, 40), jf = { t: Jr[20].t + 5 * 3600e3, tFin: Jr[20].t + 9 * 3600e3, dir: -1 };
  v(indexSurUnite(hh, f, H4) === 10 && indexSurUnite(hh, { t: H[100].t + H4 * 100, tFin: H[100].t + H4 * 101, dir: 1 }, H4) === -1 && indexSurUnite(hh.map(b => ({ ...b, t: b.t + 2 * 3600e3 })), f, H4) === 10 - 1 + 1, 'H4 : la bougie H4 de confirmation exacte');
  v(indexSurUnite(jj, jf, J) === 10, 'Jour : la bougie Daily qui contient la confirmation');
  v(indexSurUnite(hh, f, 3600e3) === -1 && indexSurUnite(hh, f, 900e3) === -1 && indexSurUnite(hh, f, 300e3) === -1, 'H1 / M15 / M5 : aucune flèche');
  const sh = styleFleche({ dir: 1 }), sb = styleFleche({ dir: -1 });
  v(sh.forme === 'arrowUp' && sh.position === 'belowBar' && /rgba\(95,184,148,1\)/.test(sh.couleur) && sb.forme === 'arrowDown' && sb.position === 'aboveBar' && /rgba\(216,106,106,1\)/.test(sb.couleur), 'haussier : flèche verte vers le haut sous la bougie ; baissier : rouge vers le bas au-dessus ; pleine');
  v(niveauParle(2650.4) === '2 650' && niveauParle(0.1234) === '0,1234', 'niveau dit à voix haute');
  v(phraseFleche('Or', { dir: 1, entree: 2650 }) === 'Or : retournement haussier Daily confirmé, entrée vers 2 650' && /baissier/.test(phraseFleche('Or', { dir: -1, entree: 1 })), 'phrase de Rayle');
  const Bh = [{ t: 0, o: 10, h: 11, l: 9, c: 10 }, { t: 1, o: 10, h: 12, l: 9.5, c: 11 }, { t: 2, o: 11, h: 14, l: 10, c: 13 }, { t: 3, o: 13, h: 15, l: 12, c: 14 }];
  v(simuler({ dir: 1, iH4: 0, entree: 10, stop: 9, objectif: 13, R: 1, rr: 3 }, Bh).r === 3 && simuler({ dir: 1, iH4: 0, entree: 10, stop: 9.8, objectif: 20, R: 0.2, rr: 50 }, Bh).r === -1, 'simulation : objectif = +rr, stop = −1 R');
  v(simuler({ dir: 1, iH4: 0, entree: 10, stop: 9.6, objectif: 12, R: 0.4, rr: 5 }, [{ ...Bh[0] }, { t: 1, o: 9.4, h: 9.9, l: 9.2, c: 9.5 }]).r < -1, 'simulation : ouverture au-delà du stop = sortie à l’ouverture (perte supérieure à 1 R)');
  v(simuler({ dir: 1, iH4: 0, entree: 10, stop: 9, objectif: 20, R: 1, rr: 10 }, [Bh[0], { t: 1, o: 10, h: 21, l: 8, c: 15 }]).r === -1, 'simulation : stop et objectif dans la même bougie → stop d’abord (prudent)');
}

console.log('— registre sur l’appareil et réglages —');
{
  const st = memoire(), D = { j: Jr, h4: H }, id = 'or', t = FIN + 3600e3;
  const r0 = flechesDe(id, D, { maintenant: t, stockage: st, version: 'sansVolume' });
  v(r0.length > 0 && r0.every(f => f.vueLe === t), 'premier calcul : tout l’historique est marqué comme déjà vu (rien n’est annoncé)');
  const r1 = flechesDe(id, D, { maintenant: t + 1000, stockage: st, version: 'sansVolume' });
  v(JSON.stringify(r1.map(f => f.id)) === JSON.stringify(r0.map(f => f.id)) && r1.every(f => f.vueLe === t), 'second calcul : mêmes flèches, aucune ne bouge');
  v(nouvellesFleches(id, r1, { maintenant: t + 2000, stockage: st, version: 'sansVolume' }).length === 0, 'aucune annonce pour l’historique');
  /* une nouvelle flèche (registre sans la dernière) est annoncée une seule fois, et seulement si elle est récente */
  const st2 = memoire(); const tous = flechesDe(id, D, { maintenant: t, stockage: st2, version: 'sansVolume' }), der = tous[tous.length - 1];
  const garde = tous.slice(0, -1); st2.setItem('rayle_tp_rv1_or_sansVolume', JSON.stringify(garde));
  const r2 = flechesDe(id, D, { maintenant: der.tFin + 3600e3, stockage: st2, version: 'sansVolume' });
  v(r2.length === tous.length && !r2[r2.length - 1].vueLe, 'une flèche apparue après coup est nouvelle (pas encore annoncée)');
  const n1 = nouvellesFleches(id, r2, { maintenant: der.tFin + 3600e3, stockage: st2, version: 'sansVolume' }), n2 = nouvellesFleches(id, r2, { maintenant: der.tFin + 7200e3, stockage: st2, version: 'sansVolume' });
  v(n1.length === 1 && n2.length === 0, 'annoncée une seule fois');
  const st3 = memoire(); st3.setItem('rayle_tp_rv1_or_sansVolume', JSON.stringify(garde)); const r3 = flechesDe(id, D, { maintenant: der.tFin + 40 * 3600e3, stockage: st3, version: 'sansVolume' });
  v(nouvellesFleches(id, r3, { maintenant: der.tFin + 40 * 3600e3, stockage: st3, version: 'sansVolume' }).length === 0, 'jamais annoncée si elle a plus de 36 h');
  /* une flèche déjà confirmée ne disparaît pas, même si le recalcul ne la reproduit plus */
  const fausse = { id: 'or|1|1', t: 1, tFin: 2, dir: 1, zone: { nom: 'x' }, vueLe: 5 }, fus = fusionnerRegistre('or', [fausse], []);
  v(fus.length === 1 && fus[0] === fausse, 'une flèche confirmée reste dans le registre');
  v(fusionnerRegistre('or', [{ id: 'or|9|1', t: 9, tFin: 10 }], [{ t: 3, tFin: 4, dir: -1, zone: {}, entree: 1, stop: 1, objectif: 1, R: 1, rr: 1 }]).length === 1, 'jamais d’insertion dans le passé');
  v(idRetournement('or', { t: 5, dir: 1 }) === 'or|5|1', 'identifiant d’une flèche');
  v(flechesDe(id, { j: Jr.slice(0, 100), h4: H.slice(0, 10) }, { maintenant: t, stockage: memoire() }).length === 0, 'pas assez de données : aucune flèche (et pas d’erreur)');
  /* réglages */
  const sr = memoire(); const r = lireReglages(sr);
  v(r.actif === true && r.version === VERSION_DEFAUT, 'réglages par défaut : activé, version ' + VERSION_DEFAUT);
  ecrireReglages({ actif: false, version: 'tendance' }, sr); const r4 = lireReglages(sr); v(r4.actif === false && r4.version === 'tendance' && versionActive(r4) === 'tendance', 'réglages enregistrés');
  sr.setItem(CLE_REGLAGES, '{"actif":true,"version":"?"}'); v(lireReglages(sr).version === VERSION_DEFAUT, 'version invalide ignorée');
  sr.setItem(CLE_REGLAGES, 'pas du json'); v(lireReglages(sr).actif === true, 'réglages illisibles : valeurs par défaut');
  v(cloturees([{ t: 0 }, { t: 1e12 }], 5e11).length === 1, 'la bougie du jour en cours est écartée');
  v(barresDaily('or', [{ t: Date.UTC(2026, 0, 3), v: 1 }, { t: Date.UTC(2026, 0, 5), v: 1 }]).length === 1 && barresDaily('btc', [{ t: Date.UTC(2026, 0, 3), v: 1 }]).length === 1, 'or : pas de bougie Daily le week-end ; crypto : toutes');
  const vj = [[Date.UTC(2026, 0, 5, 4), 99999]]; v(barresDaily('or', [{ t: Date.UTC(2026, 0, 5), v: 3 }], vj)[0].v === 99999, 'or : le volume des futures COMEX (vj) remplace celui du perpétuel Kraken');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
