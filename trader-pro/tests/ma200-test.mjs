/* Tests de « MA200 Daily + H4 » (module pur) : sens Daily, grosses et petites flèches, jamais de flèche contradictoire, aucune bougie future (walk-forward), suivi en R, registre, réglages, textes.
   Usage : node trader-pro/tests/ma200-test.mjs */
import { sensJour, petitesFleches, analyserMA, suivre, ancrer, fusionnerRegistre, idFleche, styleFleche, indexSurUnite, sensPourBougies, niveauParle, phraseFleche, typeLibelle, cloturees, PARAMS, COULEURS, J, H4 } from '../terminal/ma200-h4.js';
import { analyseDe, flechesDe, nouvellesFleches, lireReglages, ecrireReglages, lireRegistre, barresDaily, CLE_REGLAGES } from '../terminal/fleches-registre.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const memoire = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), m }; };

/* marché synthétique déterministe : grandes vagues (changements de sens Daily) + oscillations (replis) + bruit ; 6 bougies H4 par jour (22 h UTC), pas de week-end ; Daily = regroupement des 6 bougies */
function marche(jours, graine = 11) {
  let s = graine; const alea = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const T0 = Date.UTC(2020, 0, 6, 0), H = [], Jr = []; let p = 1000;
  for (let d = 0; d < jours; d++) {
    if (d % 7 === 5 || d % 7 === 6) continue;
    const t0 = T0 + d * J, lot = [];
    for (let k = 0; k < 6; k++) { const o = p, c = o + Math.sin(d / 90) * 3.2 + Math.sin(d / 7) * 2.4 + (alea() - 0.5) * 9, h = Math.max(o, c) + alea() * 3, l = Math.min(o, c) - alea() * 3; p = c; const b = { t: t0 + k * H4, o, h, l, c, v: 100 }; lot.push(b); H.push(b); }
    Jr.push({ t: t0, o: lot[0].o, h: Math.max(...lot.map(b => b.h)), l: Math.min(...lot.map(b => b.l)), c: lot[5].c, v: 600 });
  }
  return { Jr, H };
}
const { Jr, H } = marche(2400), FIN = H[H.length - 1].t + H4, A = analyserMA(Jr, H, { maintenant: FIN }), S = A.S;

console.log('— sens Daily et grosses flèches —');
v(S.gros.length >= 3, 'le marché synthétique produit des croisements confirmés : ' + S.gros.length);
v(S.gros.every((g, i) => i === 0 || g.dir !== S.gros[i - 1].dir), 'les grosses flèches alternent : une seule par croisement, jamais deux du même sens d’affilée');
{
  const bon = Jr.every((b, i) => { const m = S.M[i], a = S.A[i]; if (m == null || a == null) return S.sens[i] === 0; const haut = b.c > m + PARAMS.bande * a, bas = b.c < m - PARAMS.bande * a; return haut || bas || S.sens[i] === 0; });
  v(bon, 'dans la bande MA200 ± 0,5 ATR le sens est toujours NEUTRE');
  const conf = Jr.every((b, i) => { if (S.sens[i] === 1) return i >= 1 && b.c > S.M[i] + PARAMS.bande * S.A[i] && Jr[i - 1].c > S.M[i - 1] + PARAMS.bande * S.A[i - 1] || S.sens[i - 1] === 1 || S.cote[i] === 1; if (S.sens[i] === -1) return S.cote[i] === -1; return true; });
  v(conf && S.sens.every((x, i) => x === 0 || x === S.cote[i]), 'le sens (haussier / baissier) n’existe que pour le côté confirmé par 2 clôtures');
  const g = S.gros[0], i = g.i; v(g.dir > 0 ? Jr[i].c > S.M[i] + 0.5 * S.A[i] && Jr[i - 1].c > S.M[i - 1] + 0.5 * S.A[i - 1] : Jr[i].c < S.M[i] - 0.5 * S.A[i] && Jr[i - 1].c < S.M[i - 1] - 0.5 * S.A[i - 1], 'la grosse flèche est sur la 2e clôture Daily consécutive au-delà de la bande');
  v(S.gros.every(g => g.dir > 0 ? g.stop < g.entree && Math.abs(g.stop - (g.ma200 - S.A[g.i])) < 1e-9 : g.stop > g.entree && Math.abs(g.stop - (g.ma200 + S.A[g.i])) < 1e-9), 'grosse flèche : stop = 1 ATR Daily derrière la MA200 Daily');
  v(S.gros.every(g => g.tFin === g.t + J && g.type === 'grosse'), 'grosse flèche : sur la bougie Daily du croisement (confirmée à sa clôture)');
  /* le sens ne change que sur 2 clôtures de l'autre côté : aucun aller-retour d'un jour */
  const flips = []; for (let i2 = 1; i2 < Jr.length; i2++) if (S.cote[i2] !== S.cote[i2 - 1]) flips.push(i2);
  v(flips.length >= S.gros.length && S.gros.every(g => flips.includes(g.i)), 'une grosse flèche exactement le jour où le côté confirmé change');
}

console.log('— petites flèches H4 : dans le sens Daily, jamais contradictoires —');
const P = A.petites;
v(P.length >= 10 && P.some(f => f.type === 'rebond') && P.some(f => f.type === 'cassure'), 'des petites flèches (rebonds et cassures) : ' + P.length + ' dont ' + P.filter(f => f.type === 'rebond').length + ' rebonds');
const dernierJour = t => { let k = -1; for (let i = 0; i < Jr.length; i++) { if (Jr[i].t + J <= t) k = i; else break; } return k; };
v(P.every(f => f.dir === S.sens[dernierJour(f.t)] && f.dir !== 0), 'chaque petite flèche est dans le sens Daily en vigueur (jamais neutre, jamais contradictoire)');
v(P.every(f => { for (const g of S.gros) if (g.tFin <= f.t && g.dir !== f.dir) { const apres = S.gros.filter(x => x.tFin > g.tFin && x.tFin <= f.t); if (!apres.length) return false; } return true; }), 'après un changement de sens Daily : plus aucune petite flèche dans l’ancien sens');
{
  const tous = A.tout; let contra = 0; for (let i = 1; i < tous.length; i++) { const a = tous[i - 1], b = tous[i]; if (a.type === 'grosse' && b.type !== 'grosse' && b.dir !== a.dir && b.tFin > a.tFin) { const g2 = S.gros.find(x => x.tFin > a.tFin); if (!g2 || g2.tFin > b.t) contra++; } }
  v(contra === 0, 'aucune flèche contradictoire entre une grosse flèche et la petite flèche suivante');
}
for (const d of [1, -1]) { const L = P.filter(f => f.dir === d); v(L.every((f, i) => i === 0 || f.t - L[i - 1].t >= PARAMS.espaceH4J * J), (d > 0 ? 'achat' : 'vente') + ' : au moins 3 jours entre deux petites flèches (' + L.length + ')'); }
v(P.every(f => f.tFin === f.t + H4 && H[f.iH4].t === f.t), 'une petite flèche est sur une bougie H4 terminée (la bougie de confirmation)');
v(P.every(f => (f.dir > 0 ? f.stop < f.entree : f.stop > f.entree) && Math.abs(f.R - Math.abs(f.entree - f.stop)) < 1e-9), 'petite flèche : stop du bon côté, R = |entrée − stop|');
v(P.every(f => Math.abs(Math.abs(f.stop - f.creux) - f.atr * PARAMS.stopATR) < 1e-9), 'petite flèche : stop = 1 ATR Daily au-delà du dernier creux (sommet) H4 du repli');
v(P.filter(f => f.type === 'cassure').every(f => { let ext = f.dir > 0 ? -Infinity : Infinity; for (let x = f.iH4 - 20; x < f.iH4; x++) ext = f.dir > 0 ? Math.max(ext, H[x].h) : Math.min(ext, H[x].l); return f.dir > 0 ? f.entree > ext : f.entree < ext; }), 'cassure : clôture H4 au-delà du plus haut (bas) des 20 dernières bougies H4');
v(P.filter(f => f.type === 'rebond').every(f => /MA200 H4|MA200 Daily|[SR][12] Daily/.test(f.zone)), 'rebond : sur MA200 H4, MA200 Daily ou S1 / S2 (R1 / R2) Daily');
{
  /* 1 petite flèche par repli : entre deux flèches du même sens, le prix a reculé d'au moins 1 ATR Daily depuis son extrême */
  const parRepli = [1, -1].every(d => { const L = P.filter(f => f.dir === d); return L.every((f, i) => { if (i === 0) return true; const a = L[i - 1]; if (a.tFin > f.t || sensEntre(a.t, f.t) !== d) return true; let pic = d > 0 ? H[a.iH4].h : H[a.iH4].l, recul = false; for (let x = a.iH4 + 1; x <= f.iH4; x++) { pic = d > 0 ? Math.max(pic, H[x].h) : Math.min(pic, H[x].l); const aj = S.A[dernierJour(H[x].t)]; if (aj != null && (d > 0 ? H[x].l <= pic - PARAMS.repliATR * aj : H[x].h >= pic + PARAMS.repliATR * aj)) recul = true; } return recul; }); });
  function sensEntre(t1, t2) { const a = S.sens[dernierJour(t1)], b = S.sens[dernierJour(t2)]; return a === b ? a : 0; }
  v(parRepli, 'au plus 1 petite flèche par repli : un recul d’au moins 1 ATR Daily sépare deux petites flèches du même sens');
}

console.log('— walk-forward : aucune bougie future, aucun repaint —');
{
  const coupes = [0.3, 0.45, 0.6, 0.75, 0.9].map(f => H[Math.floor(H.length * f)].t), cle = s => [s.type, s.t, s.dir, s.entree.toFixed(6), s.stop.toFixed(6), s.zone].join('|');
  for (const tc of coupes) {
    const Hc = H.filter(b => b.t + H4 <= tc), Jc = Jr.filter(b => b.t + J <= tc), p = analyserMA(Jc, Hc, { maintenant: tc }).tout, f = A.tout.filter(s => s.tFin <= tc);
    v(p.map(cle).join() === f.map(cle).join() && f.length > 0, 'données coupées au ' + new Date(tc).toISOString().slice(0, 10) + ' : les ' + f.length + ' flèches déjà confirmées sont identiques (aucune ne bouge, n’apparaît ni ne disparaît)');
  }
  const tc = H[Math.floor(H.length * 0.6)].t, mod = b => (b.t > tc ? { ...b, o: b.o * 0.4, h: b.h * 0.4, l: b.l * 0.4, c: b.c * 0.4 } : b);
  const a = analyserMA(Jr.map(mod), H.map(mod), { maintenant: FIN }).tout.filter(s => s.tFin <= tc), b = A.tout.filter(s => s.tFin <= tc);
  v(a.map(cle).join() === b.map(cle).join() && b.length > 5, 'un futur totalement différent ne change aucune flèche du passé (' + b.length + ' comparées)');
}

console.log('— suivi, gain en R, sorties —');
{
  const j = n => Array.from({ length: n }, (_, i) => ({ t: i * J, o: 100, h: 101, l: 99, c: 100 }));
  const SS = { gros: [{ type: 'grosse', dir: -1, i: 6, tFin: 7 * J }] };
  const g = { type: 'grosse', dir: 1, i: 2, t: 2 * J, tFin: 3 * J, entree: 100, stop: 90, R: 10 }, Bj = j(10);
  Bj[4] = { ...Bj[4], c: 115 }; Bj[6] = { ...Bj[6], c: 120 };
  const r1 = suivre(g, Bj, [], SS); v(r1.etat === 'sortie' && r1.motif === 'changement de sens Daily' && Math.abs(r1.r - 2) < 1e-9, 'grosse flèche : sortie au changement de sens Daily, gain = +2 R');
  const Bj2 = j(10); Bj2[4] = { ...Bj2[4], l: 85 }; const r2 = suivre(g, Bj2, [], { gros: [] }); v(r2.motif === 'stop' && r2.r === -1, 'grosse flèche : stop = −1 R');
  const Bj3 = j(10); Bj3[4] = { ...Bj3[4], o: 80, l: 78 }; v(suivre(g, Bj3, [], { gros: [] }).r === -2, 'ouverture au-delà du stop : sortie à l’ouverture (−2 R)');
  v(suivre(g, j(10), [], { gros: [] }).etat === 'en cours', 'sans sortie : « en cours » (gain latent)');
  const h = n => Array.from({ length: n }, (_, i) => ({ t: i * H4, o: 100, h: 101, l: 99, c: 100 }));
  const f = { type: 'cassure', dir: 1, iH4: 5, t: 5 * H4, tFin: 6 * H4, entree: 100, stop: 90, creux: 98, R: 10 };
  const Bh = h(40); for (let i = 6; i < 14; i++) Bh[i] = { ...Bh[i], l: 100 + i, h: 103 + i, c: 102 + i };   // montée, creux H4 qui remontent
  Bh[10] = { ...Bh[10], l: 96, h: 112, c: 108 };   // creux important à 96 sous 98 ? non : niveau de sortie = max(creux, pivots)
  const r3 = suivre(f, [], Bh, { gros: [] }); v(r3.etat === 'sortie' && r3.motif === 'cassure du dernier creux H4' || r3.motif === 'stop' || r3.etat === 'en cours', 'petite flèche : suivi H4 sans erreur (' + r3.motif + ')');
  const f2 = { ...f, creux: 99 }, Bh2 = h(30); for (let i = 6; i < 30; i++) Bh2[i] = { ...Bh2[i], o: 104, l: 103.5, h: 105, c: 104.5 }; Bh2[12] = { ...Bh2[12], c: 98.5, l: 98 };
  const r4 = suivre(f2, [], Bh2, { gros: [] }); v(r4.motif === 'cassure du dernier creux H4' && Math.abs(r4.r - (-1.5 / 10)) < 1e-9, 'petite flèche : sortie sur la clôture H4 sous le dernier creux important (−0,15 R)');
  const Bh3 = h(30); for (let i = 6; i < 30; i++) Bh3[i] = { ...Bh3[i], o: 104, l: 103.5, h: 105, c: 104.5 }; const r5 = suivre(f2, [{ t: 0, o: 100, h: 101, l: 99, c: 100 }], Bh3, { gros: [{ type: 'grosse', dir: -1, i: 1, tFin: 10 * H4 }] });
  v(r5.motif === 'changement de sens Daily' && Math.abs(r5.r - 0.45) < 0.2, 'petite flèche : sortie au changement de sens Daily');
  const brut = A.tout.map(x => suivre(x, Jr, H, S)); v(brut.every(x => Number.isFinite(x.r)), 'suivi de toutes les flèches du marché synthétique : gains en R valides (' + brut.filter(x => x.etat === 'sortie').length + ' sorties)');
  v(A.tout.every(x => { const a = ancrer({ ...x, i: undefined, iH4: undefined }, Jr, H); return a && (x.type === 'grosse' ? a.i === x.i : a.iH4 === x.iH4); }), 'une flèche du registre retrouve ses bougies par leur heure');
}

console.log('— placement, fond, style, textes —');
{
  const hh = H.slice(90, 130), jj = Jr.slice(10, 40), pet = { type: 'rebond', dir: 1, t: H[100].t, tFin: H[100].t + H4 }, gro = { type: 'grosse', dir: -1, t: Jr[20].t, tFin: Jr[20].t + J };
  v(indexSurUnite(hh, pet, H4) === 10 && indexSurUnite(jj, gro, J) === 10, 'H4 : la bougie H4 de confirmation ; Jour : la bougie Daily du croisement');
  v(indexSurUnite(hh, pet, 3600e3) === -1 && indexSurUnite(hh, pet, 900e3) === -1 && indexSurUnite(hh, pet, 300e3) === -1, 'H1 / M15 / M5 : aucune flèche');
  v(indexSurUnite(H, gro, H4) >= 0 && H[indexSurUnite(H, gro, H4)].t + H4 === gro.tFin, 'la grosse flèche est aussi sur le H4 : la dernière bougie H4 du jour du croisement');
  const sg = styleFleche(gro), sp = styleFleche(pet);
  v(sp.forme === 'arrowUp' && sp.position === 'belowBar' && /rgba\(95,184,148,1\)/.test(sp.couleur) && sg.forme === 'arrowDown' && sg.position === 'aboveBar' && /rgba\(216,106,106,1\)/.test(sg.couleur), 'haussier : flèche verte vers le haut sous la bougie ; baissier : rouge vers le bas au-dessus');
  v(sg.taille > sp.taille * 2, 'grosse flèche (Daily) nettement plus grande que la petite (H4)');
  const tab = A.sens, sd = sensPourBougies(Jr, tab, J), sh = sensPourBougies(H, tab, H4);
  v(sd.length === Jr.length && sd.every((x, i) => x === S.sens[i]), 'fond du graphique Jour : le sens Daily de la bougie');
  v(sh.every((x, i) => x === (S.sens[dernierJour(H[i].t)] || 0)), 'fond du graphique H4 : le sens Daily connu à l’ouverture de la bougie');
  v(COULEURS.fond[1].includes('95,184,148') && COULEURS.fond[-1].includes('216,106,106') && COULEURS.fond[0].includes('150,160,170'), 'fond : vert (haussier), rouge (baissier), gris (neutre)');
  v(niveauParle(2650.4) === '2 650' && niveauParle(0.1234) === '0,1234', 'niveau dit à voix haute');
  v(/grosse flèche haussière Daily/.test(phraseFleche('Or', { type: 'grosse', dir: 1, entree: 2650 })) && /petite flèche H4 baissière, rebond sur MA200 Daily, entrée vers 2 650, stop 2 700/.test(phraseFleche('Or', { type: 'rebond', dir: -1, zone: 'MA200 Daily', entree: 2650, stop: 2700 })) && /cassure/.test(phraseFleche('Or', { type: 'cassure', dir: 1, entree: 1, stop: 0.5 })), 'phrases de Rayle');
  v(/croisement MA200 Daily haussier/.test(typeLibelle(gro.dir > 0 ? gro : { ...gro, dir: 1 })) && /rebond sur/.test(typeLibelle({ type: 'rebond', zone: 'S1 Daily' })) && /20 dernières/.test(typeLibelle({ type: 'cassure' })), 'libellés des types');
}

console.log('— registre sur l’appareil et réglages —');
{
  const st = memoire(), D = { j: Jr, h4: H }, id = 'or', t = FIN + 3600e3;
  const r0 = flechesDe(id, D, { maintenant: t, stockage: st });
  v(r0.length > 5 && r0.every(f => f.vueLe === t), 'premier calcul : tout l’historique est marqué comme déjà vu (rien n’est annoncé) : ' + r0.length + ' flèches');
  const r1 = analyseDe(id, D, { maintenant: t + 1000, stockage: st });
  v(JSON.stringify(r1.reg.map(f => f.id)) === JSON.stringify(r0.map(f => f.id)) && r1.reg.every(f => f.vueLe === t) && r1.sens.length === Jr.length, 'second calcul : mêmes flèches, aucune ne bouge ; le sens Daily est fourni');
  v(nouvellesFleches(id, r1.reg, { maintenant: t + 2000, stockage: st }).length === 0, 'aucune annonce pour l’historique');
  const st2 = memoire(), tous = flechesDe(id, D, { maintenant: t, stockage: st2 }), der = tous[tous.length - 1];
  st2.setItem('rayle_tp_ma1_or', JSON.stringify(tous.slice(0, -1)));
  const r2 = flechesDe(id, D, { maintenant: der.tFin + 3600e3, stockage: st2 });
  v(r2.length === tous.length && !r2[r2.length - 1].vueLe, 'une flèche apparue après coup est nouvelle (pas encore annoncée)');
  const n1 = nouvellesFleches(id, r2, { maintenant: der.tFin + 3600e3, stockage: st2 }), n2 = nouvellesFleches(id, r2, { maintenant: der.tFin + 7200e3, stockage: st2 });
  v(n1.length === 1 && n2.length === 0, 'annoncée une seule fois');
  const st3 = memoire(); st3.setItem('rayle_tp_ma1_or', JSON.stringify(tous.slice(0, -1))); const r3 = flechesDe(id, D, { maintenant: der.tFin + 40 * 3600e3, stockage: st3 });
  v(nouvellesFleches(id, r3, { maintenant: der.tFin + 40 * 3600e3, stockage: st3 }).length === 0, 'jamais annoncée si elle a plus de 36 h');
  const fausse = { id: 'or|1|1|grosse', type: 'grosse', t: 1, tFin: 2, dir: 1, vueLe: 5 }, fus = fusionnerRegistre('or', [fausse], []);
  v(fus.length === 1 && fus[0] === fausse, 'une flèche confirmée reste dans le registre');
  v(fusionnerRegistre('or', [{ id: 'or|9|1|grosse', tFin: 10 }], [{ type: 'rebond', t: 3, tFin: 4, dir: -1, entree: 1, stop: 1, R: 1, zone: 'x' }]).length === 1, 'jamais d’insertion dans le passé');
  v(idFleche('or', { t: 5, dir: 1, type: 'rebond' }) === 'or|5|1|rebond', 'identifiant d’une flèche');
  v(flechesDe(id, { j: Jr.slice(0, 100), h4: H.slice(0, 10) }, { maintenant: t, stockage: memoire() }).length === 0, 'pas assez de données : aucune flèche (et pas d’erreur)');
  v(analyseDe(id, { j: Jr, h4: [] }, { maintenant: t, stockage: memoire() }).reg.every(f => f.type === 'grosse'), 'sans bougies H4 : seulement les grosses flèches (Daily)');
  const sr = memoire(), r = lireReglages(sr);
  v(r.actif === true && r.fond === true, 'réglages par défaut : flèches activées, fond coloré activé');
  ecrireReglages({ actif: false, fond: false }, sr); const r4 = lireReglages(sr); v(r4.actif === false && r4.fond === false, 'réglages enregistrés');
  sr.setItem(CLE_REGLAGES, 'pas du json'); v(lireReglages(sr).actif === true, 'réglages illisibles : valeurs par défaut');
  v(cloturees([{ t: 0 }, { t: 1e12 }], 5e11).length === 1, 'la bougie du jour en cours est écartée');
  v(barresDaily('or', [{ t: Date.UTC(2026, 0, 3) }, { t: Date.UTC(2026, 0, 5) }]).length === 1 && barresDaily('btc', [{ t: Date.UTC(2026, 0, 3) }]).length === 1, 'or : pas de bougie Daily le week-end ; crypto : toutes');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
