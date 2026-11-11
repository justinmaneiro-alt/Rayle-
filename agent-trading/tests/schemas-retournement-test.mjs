/* Tests de schemas-retournement-v1 : RSI, divergences (4 sortes), double sommet/creux, tête et épaules, balayage avec réintégration, bougies en zone,
   miroirs, non-repaint sur des centaines de préfixes, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as S from '../front/or/schemas-retournement-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);
const chemin = (pts, depart = 100) => { const c = [depart]; let d = depart; for (const [fin, n] of pts) { for (let k = 1; k <= n; k++) c.push(d + (fin - d) * k / n); d = fin; } return c; };
const barres = (cl, w = 0.3) => cl.map((c, i) => { const o = i ? cl[i - 1] : c; return { t: t0 + i * H, o, h: Math.max(o, c) + w, l: Math.min(o, c) - w, c, v: 100 }; });
const miroir = B => B.map(b => ({ ...b, o: 400 - b.o, h: 400 - b.l, l: 400 - b.h, c: 400 - b.c }));
// RSI
const mont = barres(chemin([[130, 30]])); const r = S.rsi(mont); v(r[30] === 100 && r[5] == null, 'RSI : 100 sur une hausse continue, null avant 14 clôtures');
const alt = barres(Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 1 : 0))); const ra = S.rsi(alt); v(Math.abs(ra[59] - 50) < 8, 'RSI : ≈ 50 sur une alternance +1 / −1 (' + ra[59].toFixed(1) + ')');
// pivots : confirmés 2 bougies après
const pvt = S.pivotsK(barres(chemin([[110, 10], [100, 10], [110, 10]]))); v(pvt.every(p => p.conf === p.i + 2) && pvt.some(p => p.type === 'H') && pvt.some(p => p.type === 'L'), 'pivots : fractale de 5, confirmés 2 bougies après');
// divergence régulière baissière : 2e sommet plus haut, RSI plus bas
const Bd = barres(chemin([[120, 20], [108, 10], [122, 14], [112, 8]], 100));
const D = S.divergences(Bd), dr = D.filter(d => d.sous === 'reguliere' && d.dir === -1);
v(dr.length === 1 && dr[0].p2 > dr[0].p1 && dr[0].r2 < dr[0].r1 && dr[0].i === dr[0].i2 + 2, 'divergence régulière baissière : prix plus haut, RSI plus bas, posée à la confirmation du 2e pivot');
v(dr[0] && dr[0].t === Bd[dr[0].i].t && dr[0].tCloture === dr[0].t + H, "elle est posée à la clôture de la bougie de confirmation");
const Dm = S.divergences(miroir(Bd)).filter(d => d.sous === 'reguliere' && d.dir === 1); v(Dm.length === 1, 'divergence régulière haussière (miroir)');
// cachée : RSI injecté (prix : sommet plus bas ; RSI : plus haut) -> cachée baissière
const Bh = barres(chemin([[120, 10], [108, 10], [118, 10], [108, 8]], 100)); const pvh = S.pivotsK(Bh), Hh = pvh.filter(p => p.type === 'H'); const Rh = new Array(Bh.length).fill(50); Rh[Hh[0].i] = 60; Rh[Hh[1].i] = 70;
const Dh = S.divergences(Bh, { R: Rh }).filter(d => d.sous === 'cachee'); v(Dh.length === 1 && Dh[0].dir === -1, 'divergence cachée baissière : sommet plus bas sur le prix, RSI plus haut');
const Rh2 = Rh.slice(); Rh2[Hh[1].i] = 55; v(S.divergences(Bh, { R: Rh2 }).filter(d => d.sous === 'cachee').length === 0, 'RSI plus bas ET prix plus bas : pas de divergence');
const Bp = barres(chemin([[120, 3], [112, 3], [122, 3], [112, 3]], 100)); v(S.divergences(Bp).length === 0, 'pivots trop proches (< 5 bougies) : aucune divergence');
// double sommet
const Bs = barres(chemin([[120, 10], [110, 10], [120.2, 10], [108, 6]], 100)); const SD = S.schemasDoubles(Bs).filter(x => x.dir === -1);
v(SD.length === 1 && SD[0].statut === 'confirme' && Bs[SD[0].iConfirm].c < SD[0].nl && SD[0].cible < SD[0].nl, 'double sommet confirmé par une clôture sous la ligne de cou ; cible = hauteur reportée');
const Bf = barres(chemin([[120, 10], [110, 10], [120.2, 10], [114, 4]], 100)); const SF = S.schemasDoubles(Bf).filter(x => x.dir === -1); v(SF.length === 1 && SF[0].statut === 'formation', 'double sommet en formation tant que la ligne de cou tient');
const Bi = barres(chemin([[120, 10], [110, 10], [120.2, 10], [117, 3], [125, 6]], 100)); const SI = S.schemasDoubles(Bi).filter(x => x.dir === -1); v(SI.length === 1 && SI[0].statut === 'invalide', 'double sommet invalidé par une clôture au-delà de l\'extrême');
const Bc = barres(chemin([[120, 10], [110, 10], [125, 10]], 100)); v(S.schemasDoubles(Bc).length === 0, 'deux sommets trop différents : pas de double sommet');
const SM = S.schemasDoubles(miroir(Bs)).filter(x => x.dir === 1); v(SM.length === 1 && SM[0].statut === 'confirme', 'double creux confirmé (miroir)');
// tête et épaules
const Bt = barres(chemin([[110, 10], [100, 8], [120, 12], [101, 12], [110.5, 10], [96, 8]], 100)); const ST = S.schemasTete(Bt).filter(x => x.dir === -1);
v(ST.length === 1 && ST[0].statut === 'confirme' && ST[0].points.length === 3 && ST[0].points[1].p > ST[0].points[0].p + 5, 'tête et épaules confirmée sous la ligne de cou');
v(ST[0] && ST[0].cible < ST[0].cou.p1, 'cible indicative sous la ligne de cou');
const STi = S.schemasTete(miroir(Bt)).filter(x => x.dir === 1); v(STi.length === 1 && STi[0].statut === 'confirme', 'tête et épaules inversée (miroir)');
// balayage avec réintégration
const Bb = barres(chemin([[110, 10], [100, 10], [105, 5]], 100)); const n0 = Bb.length;
const mecheOk = [...Bb, { t: t0 + n0 * H, o: 105, h: 111.5, l: 104.5, c: 108.5, v: 1 }]; v(S.balayages(mecheOk).filter(x => x.dir === -1).length === 1, 'balayage avec réintégration : mèche au-dessus du sommet, clôture en dessous');
const sansRein = [...Bb, { t: t0 + n0 * H, o: 105, h: 112, l: 104.5, c: 111.8, v: 1 }]; v(S.balayages(sansRein).length === 0, 'clôture au-delà : ce n\'est pas une réintégration');
const BbM = miroir(mecheOk); v(S.balayages(BbM).filter(x => x.dir === 1).length === 1, 'balayage de liquidité basse (miroir)');
// bougies seulement en zone
const base = barres(chemin([[120, 20], [100, 20]], 100)); const marteau = { t: t0 + base.length * H, o: 100.2, h: 100.7, l: 96, c: 100.5, v: 1 }; const Bm = [...base, marteau];
const zoneS = [{ bas: 95, haut: 97, cote: 'support', tDebut: t0, tFin: null }], A = S.analyser(Bm, { zones: null });
v(A.bougies.length === 0, 'bougies de retournement : rien hors zone');
const A2 = S.analyser(Bm, { zones: (() => { const at = new Array(Bm.length).fill(3); return S.enZoneListe(zoneS, at, Bm); })() }); v(A2.bougies.some(b => b.nom === 'marteau' && b.dir === 1), 'marteau en zone de support : détecté');
const zoneFuture = [{ bas: 95, haut: 97, cote: 'support', tDebut: t0 + 1e6 * H, tFin: null }]; v(S.analyser(Bm, { zones: S.enZoneListe(zoneFuture, new Array(Bm.length).fill(3), Bm) }).bougies.length === 0, 'une zone née plus tard ne qualifie pas une bougie passée (pas de repaint)');
// phrases
const ph = S.phraseAttention({ kind: 'divergence', sous: 'reguliere', dir: -1, tf: 'H1', enZone: {} }); v(/^Attention : divergence baissière RSI H1 en zone de vente/.test(ph) && !/(achète|vends)/i.test(ph), 'phrase : « Attention : divergence baissière RSI H1 en zone de vente »');
v(/contre ta position : protection ou réduction à envisager/.test(S.phraseAttention({ kind: 'divergence', sous: 'reguliere', dir: -1, tf: 'H1', enZone: null }, { contre: { sens: 'achat' } })), 'phrase : contre une position d\'achat');
v(!/contre ta position/.test(S.phraseAttention({ kind: 'divergence', sous: 'reguliere', dir: -1, tf: 'H1' }, { contre: { sens: 'vente' } })), 'phrase : pas « contre ta position » quand le sens suit la position');
// non-repaint : préfixes d'une marche aléatoire (centaines de préfixes)
const rnd = prng(42); let c = 100; const cl = [c]; for (let i = 1; i < 500; i++) { c += (rnd() - 0.5) * 3 + Math.sin(i / 9) * 0.8; cl.push(c); } const BL = barres(cl, 0.4);
const tous = a => [...a.divergences, ...a.doubles, ...a.tetes, ...a.balayages];
const full = S.analyser(BL), fp = new Map(tous(full).map(e => [e.id, e])); let repaint = 0, nPref = 0, vus = 0;
for (let n = 60; n <= BL.length; n += 1) {
  const sub = S.analyser(BL.slice(0, n)); nPref++;
  for (const e of tous(sub)) { vus++; const f = fp.get(e.id); if (!f) { repaint++; continue; }
    if (e.statut === 'pose' && (f.i !== e.i || f.t !== e.t)) repaint++;
    if (e.statut === 'confirme' && (f.statut !== 'confirme' || f.tConfirm !== e.tConfirm)) repaint++;
    if (e.statut === 'invalide' && (f.statut !== 'invalide' || f.tInval !== e.tInval)) repaint++;
    if (e.statut === 'formation' && !['formation', 'confirme', 'invalide'].includes(f.statut)) repaint++;
    if (e.tFormation != null && f.tFormation !== e.tFormation) repaint++; }
  // aucun événement final manqué : tout événement posé / confirmé de la série complète dont la clôture est connue au préfixe existe dans le préfixe
  const ids = new Set(tous(sub).map(e => e.id)); for (const f of tous(full)) { if ((f.statut === 'pose' || f.statut === 'confirme') && f.i <= n - 1 && !ids.has(f.id)) repaint++; }
}
v(repaint === 0 && nPref >= 400 && vus > 100, `non-repaint sur ${nPref} préfixes (${vus} événements vérifiés) : ${repaint} écart(s)`);
v(tous(full).length > 20, 'la marche aléatoire produit des événements (' + tous(full).length + ')');
const sceau = JSON.parse(fs.readFileSync(new URL('../front/or/schemas-retournement-v1.sceau.json', import.meta.url), 'utf8'));
const h = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/schemas-retournement-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(h === sceau.sha256, 'sceau SHA-256 de schemas-retournement-v1.js (' + h.slice(0, 8) + ')');
console.log(`schemas-retournement : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
