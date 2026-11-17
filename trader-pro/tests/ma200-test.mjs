/* Tests de « MA200 Daily + H4 » (module pur) : cassures (3 confirmations, avec / sans filtre de pente), rebonds sur la MA200 Daily, aucune bougie future (walk-forward), suivi en R, registre, version, réglages, textes.
   Usage : node trader-pro/tests/ma200-test.mjs */
import { contexteJour, analyserMA, suivre, ancrer, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, sensPourBougies, niveauParle, phraseFleche, typeLibelle, typeNom, cloturees, COULEURS, CONFIRMATIONS, CONFIRMATION_DEFAUT, PENTE_DEFAUT, ALGO_ID, J, H4 } from '../terminal/ma200-h4.js';
import { analyseDe, flechesDe, nouvellesFleches, lireReglages, ecrireReglages, barresDaily, purgerAnciens, CLE_REGLAGES, CLE_REGISTRE } from '../terminal/fleches-registre.js';
import fs from 'node:fs';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };

/* marché synthétique déterministe : grande vague lente (la MA200 est franchie dans les deux sens) + oscillations (le prix revient toucher la MA200 en tendance) + bruit ;
   6 bougies H4 par jour (ancrées à 00 h UTC), pas de week-end ; Daily = regroupement des 6 bougies */
function marche(jours, graine = 11) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const T0 = Date.UTC(2020, 0, 6, 0), H = [], Jr = []; let prev = 1000;
  for (let d = 0; d < jours; d++) {
    if (d % 7 === 5 || d % 7 === 6) continue;
    const cible = 1000 + 40 * Math.sin(d / 110) + 15 * Math.sin(d / 9) + (alea() - 0.5) * 8, t0 = T0 + d * J, lot = []; let p = prev;
    for (let k = 0; k < 6; k++) { const o = p, c = k === 5 ? cible : o + (cible - prev) / 6 + (alea() - 0.5) * 4, h = Math.max(o, c) + alea() * 2.4, l = Math.min(o, c) - alea() * 2.4; p = c; const b = { t: t0 + k * H4, o, h, l, c, v: 100 }; lot.push(b); H.push(b); }
    Jr.push({ t: t0, o: lot[0].o, h: Math.max(...lot.map(b => b.h)), l: Math.min(...lot.map(b => b.l)), c: lot[5].c, v: 600 }); prev = cible;
  }
  return { Jr, H };
}
const { Jr, H } = marche(2600), FIN = H[H.length - 1].t + H4, C = contexteJour(Jr);
const run = (confirmation, pente, avecRebonds = true) => analyserMA(Jr, H, { confirmation, pente, avecRebonds, maintenant: FIN });
const dernierJour = t => { let k = -1; for (let i = 0; i < Jr.length; i++) { if (Jr[i].t + J <= t) k = i; else break; } return k; };

console.log('— réglage par défaut —');
v(CONFIRMATION_DEFAUT in CONFIRMATIONS && typeof PENTE_DEFAUT === 'boolean' && ALGO_ID() === `${CONFIRMATION_DEFAUT}-${PENTE_DEFAUT ? 'pente' : 'sanspente'}-r3`, 'confirmation et filtre de pente par défaut choisis par le backtest : ' + ALGO_ID());
{
  const d = analyserMA(Jr, H, { maintenant: FIN }), e = run(CONFIRMATION_DEFAUT, PENTE_DEFAUT);
  v(d.tout.map(f => f.type + f.t).join() === e.tout.map(f => f.type + f.t).join(), 'sans option : la variante par défaut');
  v(d.tout.every(f => f.type === 'cassure' || f.type === 'rebond') && d.tout.every(f => f.zone === 'MA200 Daily'), 'seulement 2 types de flèches (cassure, rebond) et un seul niveau : la MA200 Daily');
}

console.log('— cassures de la MA200 Daily —');
for (const conf of Object.keys(CONFIRMATIONS)) for (const pente of [true, false]) {
  const X = conf + (pente ? ' + pente' : ' sans pente') + ' : ', L = run(conf, pente, false).cassures;
  v(L.length >= (conf === 'marge' && pente ? 1 : 3) && (conf === 'marge' && pente ? true : L.some(f => f.dir > 0) && L.some(f => f.dir < 0)), X + 'des cassures haussières et baissières (' + L.length + ')');
  const iCross = f => (f.mode === 'h4' ? f.i : conf === 'daily2' ? f.i - 1 : f.i);
  v(L.every(f => C.cote[iCross(f)] === f.dir && C.cote[iCross(f) - 1] === -f.dir), X + 'une clôture Daily franchit la MA200 Daily (la clôture change de côté)');
  v(new Set(L.map(f => iCross(f))).size === L.length, X + 'une seule flèche par cassure');
  v(L.every(f => Math.abs(f.stop - (f.dir > 0 ? f.ma200 - 0.5 * f.atr : f.ma200 + 0.5 * f.atr)) < 1e-9 && Math.abs(f.R - Math.abs(f.entree - f.stop)) < 1e-9 && (f.dir > 0 ? f.stop < f.entree : f.stop > f.entree)), X + 'stop = 0,5 ATR de l’autre côté de la MA200 Daily, R = |entrée − stop|');
  v(L.every(f => f.tFin === f.t + (f.mode === 'h4' ? H4 : J)), X + 'flèche sur la bougie de confirmation');
  if (conf === 'h4') {
    v(L.every(f => { const i = f.i, b = H.find(x => x.t >= Jr[i].t + J); return b && b.t === f.t && f.entree === b.c && (f.dir > 0 ? b.c > C.M[i] : b.c < C.M[i]); }), X + 'la première clôture H4 qui suit la cassure reste du bon côté de la MA200 (pas de réintégration)');
    const reint = []; for (let i = 1; i < Jr.length; i++) if (C.cote[i] && C.cote[i - 1] && C.cote[i] !== C.cote[i - 1]) { const b = H.find(x => x.t >= Jr[i].t + J); if (b && (C.cote[i] > 0 ? b.c <= C.M[i] : b.c >= C.M[i]) && (!pente || C.penteOk(i, C.cote[i], true))) reint.push(i); }
    v(L.every(f => !reint.includes(f.i)), X + 'une cassure réintégrée (la clôture H4 suivante revient de l’autre côté) ne donne aucune flèche (' + reint.length + ' cas dans le marché de test)');
  }
  if (conf === 'daily2') v(L.every(f => C.cote[f.i] === f.dir && f.entree === Jr[f.i].c), X + 'la flèche est sur la 2e clôture Daily consécutive au-delà de la MA200');
  if (conf === 'marge') v(L.every(f => (f.dir > 0 ? Jr[f.i].c > C.M[f.i] + 0.5 * C.A[f.i] : Jr[f.i].c < C.M[f.i] - 0.5 * C.A[f.i])), X + 'la clôture Daily est à plus de 0,5 ATR au-delà de la MA200');
  if (pente) v(L.every(f => C.penteOk(iCross(f), f.dir, true)), X + 'filtre de pente : MA200 plate ou dans le sens de la cassure sur 20 jours (aucune cassure contre la pente)');
}
{
  const avec = run('daily2', true, false).cassures, sans = run('daily2', false, false).cassures;
  v(avec.length < sans.length, 'le filtre de pente supprime des cassures (' + sans.length + ' → ' + avec.length + ')');
  const contre = sans.filter(f => !C.penteOk(f.i - 1, f.dir, true));
  v(contre.length > 0 && contre.every(f => !avec.some(g => g.t === f.t)), 'une cassure contre la pente existe sans filtre et disparaît avec (' + contre.length + ' cassures)');
  const pOk = (p, a, d) => (d > 0 ? p >= -0.1 * a : p <= 0.1 * a); v(pOk(-0.05, 1, 1) && !pOk(-0.2, 1, 1) && pOk(0.05, 1, -1) && !pOk(0.3, 1, -1), 'MA200 plate = variation de moins de 0,1 ATR sur 20 jours');
}

console.log('— rebonds sur la MA200 Daily —');
const RB = run(CONFIRMATION_DEFAUT, PENTE_DEFAUT).rebonds;
v(RB.length >= 4 && RB.some(f => f.dir > 0) && RB.some(f => f.dir < 0), 'des rebonds haussiers et baissiers (' + RB.length + ')');
v(RB.every(f => { const k = dernierJour(f.t); if (k < 10) return false; let ok2 = C.penteOk(k, f.dir, false); for (let x = 0; x < 10 && ok2; x++) ok2 = C.cote[k - x] === f.dir; return ok2; }), 'tendance établie : 10 clôtures Daily du même côté de la MA200 ET pente de la MA200 dans le même sens');
v(RB.every(f => { const k = dernierJour(f.t); return Math.abs(f.ma200 - C.M[k]) < 1e-9 && Math.abs(f.stop - (f.dir > 0 ? C.M[k] - 0.5 * C.A[k] : C.M[k] + 0.5 * C.A[k])) < 1e-9 && f.zone === 'MA200 Daily'; }), 'rebond : stop = 0,5 ATR de l’autre côté de la MA200 Daily');
v(RB.every(f => f.tFin === f.t + H4 && H[f.iH4].t === f.t && f.entree === H[f.iH4].c), 'rebond : sur la bougie H4 de confirmation, entrée à sa clôture');
v(RB.every(f => { const k = dernierJour(f.t), M = C.M[k], z = 0.3 * C.A[k]; for (let x = f.iH4 - 1; x >= Math.max(0, f.iH4 - 31); x--) { const b = H[x]; if (f.dir > 0 ? (b.l <= M + z && b.c > M) : (b.h >= M - z && b.c < M)) return f.dir > 0 ? f.entree > b.h : f.entree < b.l; } return false; }), 'rebond : après un contact avec la MA200 (mèche à moins de 0,3 ATR), la clôture H4 repart au-delà de la bougie de contact');
v(RB.every(f => f.dir === C.cote[dernierJour(f.t)]), 'rebond : toujours dans le sens de la tendance (le côté de la MA200 du dernier Daily)');
v([1, -1].every(d => { const L = RB.filter(f => f.dir === d); return L.every((f, i) => { if (i === 0) return true; const a = L[i - 1]; for (let x = a.iH4 + 1; x < f.iH4; x++) { const k = dernierJour(H[x].t), M = C.M[k], z = 0.3 * C.A[k]; if (d > 0 ? H[x].l > M + z : H[x].h < M - z) return true; } return false; }); }), 'une seule flèche par contact avec la MA200 : entre deux rebonds de même sens, le prix s’est éloigné de la MA200 (bougie H4 à plus de 0,3 ATR)');
v(run('daily2', false).tout.every(f => f.type === 'cassure' || f.type === 'rebond') && run('daily2', false).tout.every(f => f.zone === 'MA200 Daily'), 'aucune autre flèche : ni R1 / R2 / S1 / S2, ni MA200 H4, ni cassure des 20 bougies H4');

console.log('— walk-forward : aucune bougie future, aucun repaint —');
for (const [confirmation, pente] of [['daily2', false], ['h4', true], ['marge', false], [undefined, undefined]]) {
  const opt = confirmation ? { confirmation, pente } : {}, plein = analyserMA(Jr, H, { maintenant: FIN, ...opt }), nom = confirmation ? confirmation + (pente ? ' + pente' : ' sans pente') : 'par défaut', coupes = [0.3, 0.45, 0.6, 0.75, 0.9].map(f => H[Math.floor(H.length * f)].t), cle = s => [s.type, s.t, s.dir, s.entree.toFixed(6), s.stop.toFixed(6)].join('|');
  for (const tc of coupes) {
    const Hc = H.filter(b => b.t + H4 <= tc), Jc = Jr.filter(b => b.t + J <= tc), p = analyserMA(Jc, Hc, { maintenant: tc, ...opt }).tout, f = plein.tout.filter(s => s.tFin <= tc);
    v(p.map(cle).join() === f.map(cle).join() && f.length > 0, nom + ' : données coupées au ' + new Date(tc).toISOString().slice(0, 10) + ' : les ' + f.length + ' flèches déjà confirmées sont identiques (aucune ne bouge, n’apparaît ni ne disparaît)');
  }
  const tc = H[Math.floor(H.length * 0.6)].t, mod = b => (b.t > tc ? { ...b, o: b.o * 0.4, h: b.h * 0.4, l: b.l * 0.4, c: b.c * 0.4 } : b);
  const a2 = analyserMA(Jr.map(mod), H.map(mod), { maintenant: FIN, ...opt }).tout.filter(s => s.tFin <= tc), b2 = plein.tout.filter(s => s.tFin <= tc);
  v(a2.map(cle).join() === b2.map(cle).join() && b2.length > 3, nom + ' : un futur totalement différent ne change aucune flèche du passé (' + b2.length + ' comparées)');
}

console.log('— suivi, gain en R, sorties —');
{
  const j = n => Array.from({ length: n }, (_, i) => ({ t: i * J, o: 100, h: 101, l: 99, c: 100 })), h = n => Array.from({ length: n }, (_, i) => ({ t: i * H4, o: 100, h: 101, l: 99, c: 100 }));
  const S0 = n => ({ cote: new Array(n).fill(1) });
  const f = { type: 'cassure', mode: 'jour', dir: 1, i: 2, jSuivi: 3, t: 2 * J, tFin: 3 * J, entree: 100, stop: 90, R: 10 };
  const Bj = j(12), S1 = S0(12); Bj[5] = { ...Bj[5], c: 112 }; S1.cote[7] = -1; Bj[7] = { ...Bj[7], c: 120 };
  const r1 = suivre(f, Bj, [], S1); v(r1.etat === 'sortie' && /de l’autre côté de la MA200/.test(r1.motif) && Math.abs(r1.r - 2) < 1e-9, 'flèche Daily : sortie à la clôture Daily de l’autre côté de la MA200, gain +2 R');
  const Bj2 = j(12); Bj2[5] = { ...Bj2[5], l: 85 }; const r2 = suivre(f, Bj2, [], S0(12)); v(r2.motif === 'stop' && r2.r === -1, 'flèche Daily : stop = −1 R');
  const Bj3 = j(12); Bj3[5] = { ...Bj3[5], o: 80, l: 78 }; v(suivre(f, Bj3, [], S0(12)).r === -2, 'ouverture au-delà du stop : sortie à l’ouverture (−2 R)');
  v(suivre(f, j(12), [], S0(12)).etat === 'en cours', 'sans sortie : « en cours » (gain latent)');
  const fh = { type: 'rebond', mode: 'h4', dir: 1, iH4: 5, t: 5 * H4, tFin: 6 * H4, entree: 100, stop: 90, R: 10 }, Bh = h(60), Sj = { cote: [1, 1, 1, 1, 1, 1, 1, 1, -1, 1] }, Bjh = j(10);
  v(suivre(fh, Bjh, Bh, { cote: new Array(10).fill(1) }).etat === 'en cours', 'flèche H4 : « en cours » sans sortie');
  const Bh2 = h(60); Bh2[20] = { ...Bh2[20], l: 85 }; v(suivre(fh, Bjh, Bh2, { cote: new Array(10).fill(1) }).motif === 'stop', 'flèche H4 : stop touché sur une bougie H4');
  const Bh3 = h(60); for (let i = 6; i < 60; i++) Bh3[i] = { ...Bh3[i], o: 104, l: 103, h: 105, c: 104 }; const r5 = suivre(fh, Bjh, Bh3, Sj);
  v(/de l’autre côté de la MA200/.test(r5.motif || '') && Math.abs(r5.r - 0.4) < 0.2, 'flèche H4 : sortie quand une clôture Daily passe de l’autre côté de la MA200 (' + (r5.motif || '') + ')');
  const tous = analyserMA(Jr, H, { maintenant: FIN }).tout, S = contexteJour(Jr), brut = tous.map(x => suivre(x, Jr, H, S)); v(brut.every(x => Number.isFinite(x.r)), 'suivi de toutes les flèches du marché synthétique : gains en R valides (' + brut.filter(x => x.etat === 'sortie').length + ' sorties sur ' + tous.length + ')');
  v(tous.every(x => { const a = ancrer({ ...x, i: undefined, iH4: undefined, jSuivi: undefined }, Jr, H); return a && (x.mode === 'jour' ? a.i === x.i && a.jSuivi === x.jSuivi : a.iH4 === x.iH4); }), 'une flèche du registre retrouve ses bougies par leur heure');
}

console.log('— placement, fond, style, textes —');
{
  const hh = H.slice(90, 130), jj = Jr.slice(10, 40), reb = { type: 'rebond', dir: 1, t: H[100].t, tFin: H[100].t + H4 }, cas = { type: 'cassure', dir: -1, t: Jr[20].t, tFin: Jr[20].t + J };
  v(indexSurUnite(hh, reb, H4) === 10 && indexSurUnite(jj, cas, J) === 10, 'H4 : la bougie H4 de confirmation ; Jour : la bougie Daily de confirmation');
  v(indexSurUnite(hh, reb, 3600e3) === -1 && indexSurUnite(hh, reb, 900e3) === -1 && indexSurUnite(hh, reb, 300e3) === -1, 'H1 / M15 / M5 : aucune flèche');
  v(indexSurUnite(H, cas, H4) >= 0 && H[indexSurUnite(H, cas, H4)].t + H4 === cas.tFin, 'la cassure Daily est aussi sur le H4 : la dernière bougie H4 du jour de confirmation');
  const sc = styleFleche(cas), sr = styleFleche(reb);
  v(sr.forme === 'arrowUp' && sr.position === 'belowBar' && /rgba\(95,184,148,1\)/.test(sr.couleur) && sc.forme === 'arrowDown' && sc.position === 'aboveBar' && /rgba\(216,106,106,1\)/.test(sc.couleur), 'haussier : flèche verte vers le haut sous la bougie ; baissier : rouge vers le bas au-dessus');
  v(sc.taille > sr.taille * 2, 'cassure = grosse flèche, rebond = petite flèche (plus de 2 fois plus petite)');
  const tab = analyserMA(Jr, H, { maintenant: FIN }).sens, sd = sensPourBougies(Jr, tab, J), sh = sensPourBougies(H, tab, H4);
  v(sd.length === Jr.length && sd.every((x, i) => x === C.cote[i]), 'fond du graphique Jour : le côté de la MA200 Daily de la bougie');
  v(sh.every((x, i) => x === (C.cote[dernierJour(H[i].t)] || 0)), 'fond du graphique H4 : le côté connu à l’ouverture de la bougie');
  v(COULEURS.fond[1].includes('95,184,148') && COULEURS.fond[-1].includes('216,106,106'), 'fond : vert au-dessus de la MA200 Daily, rouge en dessous');
  v(niveauParle(2650.4) === '2 650' && niveauParle(0.1234) === '0,1234', 'niveau dit à voix haute');
  v(phraseFleche('Or', { type: 'cassure', dir: 1, entree: 2650, stop: 2600 }) === 'Or : cassure haussière de la MA200 Daily confirmée, entrée vers 2 650, stop 2 600' && phraseFleche('Or', { type: 'rebond', dir: -1, entree: 2650, stop: 2700 }) === 'Or : rebond baissier sur la MA200 Daily confirmé, entrée vers 2 650, stop 2 700', 'phrases de Rayle');
  v(typeNom(cas) === 'Cassure' && typeNom(reb) === 'Rebond' && /cassure baissière/.test(typeLibelle(cas)) && /rebond haussier/.test(typeLibelle(reb)), 'libellés des types');
}

console.log('— registre sur l’appareil et réglages —');
{
  const st = memoire(), D = { j: Jr, h4: H }, id = 'or', t = FIN + 3600e3;
  const r0 = flechesDe(id, D, { maintenant: t, stockage: st });
  v(r0.length > 5 && r0.every(f => f.vueLe === t), 'premier calcul : tout l’historique est marqué comme déjà vu (rien n’est annoncé) : ' + r0.length + ' flèches');
  const r1 = analyseDe(id, D, { maintenant: t + 1000, stockage: st });
  v(JSON.stringify(r1.reg.map(f => f.id)) === JSON.stringify(r0.map(f => f.id)) && r1.reg.every(f => f.vueLe === t) && r1.sens.length === Jr.length, 'second calcul : mêmes flèches, aucune ne bouge ; le côté de la MA200 est fourni');
  v(nouvellesFleches(id, r1.reg, { maintenant: t + 2000, stockage: st }).length === 0, 'aucune annonce pour l’historique');
  const st2 = memoire(), tous = flechesDe(id, D, { maintenant: t, stockage: st2 }), der = tous[tous.length - 1];
  st2.setItem(CLE_REGISTRE('or'), JSON.stringify(tous.slice(0, -1)));
  const r2 = flechesDe(id, D, { maintenant: der.tFin + 3600e3, stockage: st2 });
  v(r2.length === tous.length && !r2[r2.length - 1].vueLe, 'une flèche apparue après coup est nouvelle (pas encore annoncée)');
  const n1 = nouvellesFleches(id, r2, { maintenant: der.tFin + 3600e3, stockage: st2 }), n2 = nouvellesFleches(id, r2, { maintenant: der.tFin + 7200e3, stockage: st2 });
  v(n1.length === 1 && n2.length === 0, 'annoncée une seule fois');
  const st3 = memoire(); st3.setItem(CLE_REGISTRE('or'), JSON.stringify(tous.slice(0, -1))); const r3 = flechesDe(id, D, { maintenant: der.tFin + 40 * 3600e3, stockage: st3 });
  v(nouvellesFleches(id, r3, { maintenant: der.tFin + 40 * 3600e3, stockage: st3 }).length === 0, 'jamais annoncée si elle a plus de 36 h');
  const fausse = { id: 'or|1|1|cassure', type: 'cassure', t: 1, tFin: 2, dir: 1, vueLe: 5 }, fus = fusionnerRegistre('or', [fausse], []);
  v(fus.length === 1 && fus[0] === fausse, 'une flèche confirmée reste dans le registre');
  v(fusionnerRegistre('or', [{ id: 'or|9|1|cassure', tFin: 10 }], [{ type: 'rebond', t: 3, tFin: 4, dir: -1, entree: 1, stop: 1, R: 1, zone: 'x' }]).length === 1, 'jamais d’insertion dans le passé');
  v(idFleche('or', { t: 5, dir: 1, type: 'rebond' }) === 'or|5|1|rebond', 'identifiant d’une flèche');
  v(flechesDe(id, { j: Jr.slice(0, 100), h4: H.slice(0, 10) }, { maintenant: t, stockage: memoire() }).length === 0, 'pas assez de données : aucune flèche (et pas d’erreur)');
  v(analyseDe(id, { j: Jr, h4: [] }, { maintenant: t, stockage: memoire() }).reg.every(f => f.mode === 'jour'), 'sans bougies H4 : seulement les flèches Daily');
  const sr = memoire(), r = lireReglages(sr);
  v(r.actif === true && r.fond === true, 'réglages par défaut : flèches activées, fond coloré activé');
  ecrireReglages({ actif: false, fond: false }, sr); const r4 = lireReglages(sr); v(r4.actif === false && r4.fond === false, 'réglages enregistrés');
  sr.setItem(CLE_REGLAGES, 'pas du json'); v(lireReglages(sr).actif === true, 'réglages illisibles : valeurs par défaut');
  v(cloturees([{ t: 0 }, { t: 1e12 }], 5e11).length === 1, 'la bougie du jour en cours est écartée');
  v(barresDaily('or', [{ t: Date.UTC(2026, 0, 3) }, { t: Date.UTC(2026, 0, 5) }]).length === 1 && barresDaily('btc', [{ t: Date.UTC(2026, 0, 3) }]).length === 1, 'or : pas de bougie Daily le week-end ; crypto : toutes');
}

console.log('— version, mise à jour et anciens registres —');
{
  const lireV = (f, re) => (fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8').match(re) || [])[1];
  const versions = { 'precache.json': lireV('precache.json', /"version":"([^"]+)"/), 'sw.js': lireV('sw.js', /const VERSION = '([^']+)'/), 'index.html': lireV('index.html', /RAYLE_VERSION='([^']+)'/), 'or.html': lireV('agent-trading/front/or.html', /RAYLE_OR_VERSION = '([^']+)'/), 'version.js': lireV('trader-pro/terminal/version.js', /VERSION = '([^']+)'/) };
  v(Object.values(versions).every(x => x && x === versions['sw.js']), 'la même version dans sw.js, precache.json, index.html, or.html et version.js : ' + JSON.stringify(versions));
  v(JSON.parse(fs.readFileSync(new URL('../../precache.json', import.meta.url), 'utf8')).coeur.includes('trader-pro/terminal/version.js'), 'version.js est dans la liste de précache (hors ligne)');
  const orHtml = fs.readFileSync(new URL('../../agent-trading/front/or.html', import.meta.url), 'utf8');
  v(/precache\.json/.test(orHtml) && /getRegistrations/.test(orHtml) && /caches\.delete/.test(orHtml) && /controllerchange/.test(orHtml) && />= 2\) return/.test(orHtml), 'or.html : compare à la version publiée, met le service worker à jour, vide les caches, recharge, au plus 2 tentatives par version');
  /* un téléphone qui avait enregistré les flèches d'une ancienne variante ne les revoit plus */
  const st = memoire(), D = { j: Jr, h4: H }, t = FIN + 3600e3, faux = i => ({ id: 'or|' + i + '|-1|rebond', type: 'rebond', dir: -1, t: Date.now() - i * 864e5, tFin: Date.now() - i * 864e5 + 144e5, entree: 4000, stop: 4100, R: 100, zone: 'S1 Daily', vueLe: 1 });
  const vieux = Array.from({ length: 12 }, (_, i) => faux(i + 1));
  for (const k of ['rayle_tp_ma1_or', 'rayle_tp_ma2_or_V2-atr1-r2', 'rayle_tp_ma2_or_V0-base-r1']) st.setItem(k, JSON.stringify(vieux));
  st.setItem('rayle_tp_zz1_or_2_5', '[]'); st.setItem('rayle_tp_rv1_or_sansVolume', '[]'); st.setItem('autre_cle', 'x');
  const r = analyseDe('or', D, { maintenant: t, stockage: st });
  v(r.reg.length > 0 && !r.reg.some(f => f.zone === 'S1 Daily') && r.reg.every(f => f.zone === 'MA200 Daily'), 'ancien registre (variante précédente, 12 petites flèches sur S1 Daily) : jamais relu, aucune ne s’affiche');
  v(['rayle_tp_ma1_or', 'rayle_tp_ma2_or_V2-atr1-r2', 'rayle_tp_ma2_or_V0-base-r1', 'rayle_tp_zz1_or_2_5', 'rayle_tp_rv1_or_sansVolume'].every(k => !st.m.has(k)) && st.m.has('autre_cle') && st.m.has(CLE_REGISTRE('or')), 'les anciens registres sont supprimés, la clé du registre actuel contient l’algorithme (' + ALGO_ID() + '), les autres clés restent');
  v(r.reg.every(f => f.vueLe === t), 'premier calcul avec la nouvelle clé : historique enregistré comme déjà vu, rien n’est annoncé');
  const st2 = memoire(); st2.setItem('rayle_tp_ma2_btc_' + ALGO_ID(), '[]'); v(purgerAnciens(st2) === 0 && st2.m.size === 1, 'la purge ne touche pas le registre de l’algorithme actuel');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
