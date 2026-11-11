/* Tests de ict-v1 : fuseaux New York → Paris autour des deux changements d'heure, jours de marché, déplacement, FVG (rempli / partiel / inversé), order block et breaker,
   liquidité (PDH/PDL, balayage), AMD / Judas, premium / discount, rapport, non-repaint sur des centaines de préfixes, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as I from '../front/or/ict-v1.js'; import { prng } from '../recherche-or/stats.mjs'; import { atrLocal } from '../front/or/niveaux-periode.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3;
// ── fuseaux : 02:00 New York (début de Londres) converti en heure de Paris ──
const cas = [['2026-03-04', 8, 'hiver partout : NY −5, Paris +1'], ['2026-03-12', 7, 'NY a changé (−4), pas Paris (+1) : seulement 5 h d\'écart'], ['2026-04-02', 8, 'les deux en été : 6 h d\'écart'], ['2026-10-23', 8, 'Paris encore en été (+2), NY en été (−4)'], ['2026-10-30', 7, 'Paris repassé en hiver (+1), NY encore en été : 5 h'], ['2026-11-04', 8, 'NY repassé en hiver (−5), Paris +1 : 6 h']];
for (const [j, h, nom] of cas) { const [y, m, d] = j.split('-').map(Number), t = I.instantNY(y, m, d, 2, 0); v(I.hhmmParis(t) === String(h).padStart(2, '0') + ':00', `02:00 New York le ${j} = ${String(h).padStart(2, '0')}:00 à Paris (${nom}) : trouvé ${I.hhmmParis(t)}`); }
v(I.instantNY(2026, 3, 12, 2, 0) === Date.UTC(2026, 2, 12, 6, 0), '02:00 NY le 12/03/2026 = 06:00 UTC (EDT)'); v(I.instantNY(2026, 3, 4, 2, 0) === Date.UTC(2026, 2, 4, 7, 0), '02:00 NY le 04/03/2026 = 07:00 UTC (EST)');
// veille et lendemain des changements d'heure : jamais un décalage fixe
const dst = [[2026, 3, 7], [2026, 3, 8], [2026, 3, 9], [2026, 3, 28], [2026, 3, 29], [2026, 3, 30], [2026, 10, 24], [2026, 10, 25], [2026, 10, 26], [2026, 10, 31], [2026, 11, 1], [2026, 11, 2]];
let monotone = true, decal = new Set(); for (const [y, m, d] of dst) { let prev = -Infinity; for (let h = 0; h <= 24; h++) { const t = I.instantNY(y, m, d, h, 0); if (t < prev) monotone = false; prev = t; } decal.add(I.hhmmParis(I.instantNY(y, m, d, 12, 0))); }
v(monotone, 'instantNY croît avec l\'heure murale autour des deux changements d\'heure'); v(decal.size === 2 && decal.has('17:00') && decal.has('18:00'), 'midi NY = 17:00 ou 18:00 à Paris selon la date (5 h ou 6 h d écart) : ' + [...decal].join(', '));
for (const j of ['2026-03-09', '2026-03-30', '2026-10-26', '2026-11-02']) { const F = I.fenetresKillzones(j), L = F.find(f => f.id === 'londres'), A = F.find(f => f.id === 'asie'); v(L.fin - L.debut === 3 * H && A.fin - A.debut === 4 * H, `killzones du ${j} : Londres 3 h, Asie 4 h`); v(A.fin <= L.debut && A.debut < A.fin, `${j} : l'Asie (veille 20h–00h NY) précède Londres`); }
const sb = I.fenetresKillzones('2026-03-12').filter(f => f.id.startsWith('sb_')); v(sb.length === 3 && sb.every(f => f.fin - f.debut === H), 'trois Silver Bullet d\'une heure');
// jours de marché : le jour change à 18:00 NY
v(I.jourMarche(Date.UTC(2026, 10, 2, 0, 0)).cle === '2026-11-02' && I.jourMarche(Date.UTC(2026, 10, 1, 22, 0)).cle === '2026-11-01', 'jour de marché : dimanche 17:00 NY encore dimanche, 19:00 NY déjà lundi');
v(I.jourMarche(Date.UTC(2026, 10, 3, 12, 0)).semaine === '2026-11-02', 'semaine = lundi du jour de marché');
// ── briques ──
const base = (n, t0) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * H, o: 100, h: 100.6 + 0.1 * (i % 3), l: 99.4 - 0.1 * ((i + 1) % 3), c: 100 + (i % 2 ? 0.2 : -0.2), v: 100 }));
const t0 = Date.UTC(2026, 2, 9, 0, 0);
const dep = { o: 100.2, h: 103.1, l: 100.1, c: 103, v: 300 }; const A0 = 1.4;
v(I.estDeplacement(dep, 1.2) && !I.estDeplacement({ o: 100, h: 103.1, l: 97, c: 103 }, 1.2), 'déplacement : corps ≥ 1,5 ATR et peu de mèche ; une grande mèche l\'exclut');
const mkBars = extra => { const B = base(60, t0); for (const [i, b] of extra) B[i] = { t: t0 + i * H, v: 100, ...b }; return B; };
// FVG haussier : barre 40 contraire (OB), 41 déplacement, 42 trou
const B1 = mkBars([[40, { o: 100.5, h: 100.6, l: 99.8, c: 99.9 }], [41, { o: 99.9, h: 103.1, l: 99.85, c: 103 }], [42, { o: 103, h: 103.6, l: 102.2, c: 103.3 }]]);
for (let i = 43; i < 60; i++) B1[i] = { t: t0 + i * H, o: 103.3, h: 103.8, l: 102.9, c: 103.4, v: 100 };
let F = I.fvgListe(B1).filter(z => z.dir > 0); v(F.length === 1 && F[0].bas === 100.6 && Math.abs(F[0].haut - 102.2) < 1e-9 && F[0].statut === 'non_rempli', 'FVG haussier détecté, non rempli');
v(F[0].tCloture === B1[42].t + H, 'FVG posé à la clôture de la 3e bougie');
const B2 = B1.map(b => ({ ...b })); B2[50] = { ...B2[50], l: 101.5 }; F = I.fvgListe(B2).filter(z => z.dir > 0); v(F[0].statut === 'partiel' && F[0].tPartiel === B2[50].t, 'FVG partiel : le prix y entre sans le traverser');
const B3 = B1.map(b => ({ ...b })); B3[50] = { ...B3[50], l: 100.3 }; F = I.fvgListe(B3).filter(z => z.dir > 0); v(F[0].statut === 'rempli' && F[0].tRempli === B3[50].t && !F[0].inverse, 'FVG rempli : le prix traverse tout le trou');
const B4 = B1.map(b => ({ ...b })); B4[50] = { ...B4[50], l: 99.6, c: 100.2 }; B4[51] = { ...B4[51], c: 99.9, l: 99.7 }; F = I.fvgListe(B4).filter(z => z.dir > 0); v(F[0].inverse && F[0].tInverse != null, 'FVG inversé : une clôture traverse le trou');
const miroir = B => B.map(b => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));
v(I.fvgListe(miroir(B1)).filter(z => z.dir < 0).length === 1, 'FVG baissier (miroir)');
// order block
const OB = I.orderBlocks(B1).filter(z => z.dir > 0); v(OB.length === 1 && OB[0].iOb === 40 && OB[0].bas === 99.8 && OB[0].haut === 100.6 && OB[0].statut === 'actif', 'order block haussier : dernière bougie contraire avant le déplacement qui casse la structure');
const B5 = B1.map(b => ({ ...b })); B5[50] = { ...B5[50], o: 103, c: 99.5, l: 99.4, h: 103.1 }; const OB5 = I.orderBlocks(B5).filter(z => z.dir > 0)[0]; v(OB5.statut === 'invalide' && OB5.breaker && OB5.breaker.dir < 0 && OB5.breaker.tCloture > OB5.tOb, 'order block invalidé par une clôture sous son bas → breaker baissier');
v(I.orderBlocks(miroir(B1)).filter(z => z.dir < 0).length === 1, 'order block baissier (miroir)');
// ── liquidité, AMD : trois jours d'heures continues, valeurs réglées à la main ──
const lundi = Date.UTC(2026, 2, 9, 5, 0);   // 00:00 NY du lundi 9 mars (EDT : 04:00 UTC ; ici 05:00 UTC = 01:00 NY, simple point de départ)
const D = []; for (let i = 0; i < 24 * 4; i++) D.push({ t: Date.UTC(2026, 2, 8, 23, 0) + i * H, o: 100, h: 100.4, l: 99.6, c: 100 + (i % 2 ? 0.1 : -0.1), v: 100 });
const jMar = I.jours(D); v(jMar.length >= 3, 'jours de marché reconstitués (' + jMar.length + ')');
const cle = '2026-03-11', F11 = Object.fromEntries(I.fenetresKillzones(cle).map(f => [f.id, f]));
const setH = (t, o) => { const i = D.findIndex(b => b.t === t); if (i >= 0) D[i] = { ...D[i], ...o }; return i; };
for (let t = F11.asie.debut; t < F11.asie.fin; t += H) setH(t, { h: 101, l: 100, o: 100.5, c: 100.5 });   // plage asiatique 100–101
for (let t = F11.londres.debut; t < F11.londres.fin; t += H) setH(t, { h: 100.8, l: 100.2, o: 100.5, c: 100.5 });
const iM = setH(F11.londres.debut + H, { o: 100.5, h: 102.2, l: 100.4, c: 100.8 });   // mèche au-dessus de 101 à 03:00 NY
for (let t = F11.ny_am.debut; t < F11.ny_am.fin; t += H) { const k = (t - F11.ny_am.debut) / H; setH(t, { o: 100.8 - k * 1.2, c: 100.8 - (k + 1) * 1.2, h: 100.9 - k * 1.2, l: 100.7 - (k + 1) * 1.2 }); }
const J = I.jours(D), AM = I.amdJours(D, J).find(e => e.jour === cle);
v(AM && AM.accumulation.h === 101 && AM.accumulation.l === 100, 'AMD : plage asiatique 100–101'); v(AM.manipulation && AM.manipulation.cote === 'haut' && AM.manipulation.i === iM && Math.abs(AM.manipulation.depasse - 1.2) < 1e-9, 'AMD : manipulation = mèche au-dessus du haut asiatique pendant Londres'); v(AM.distribution && AM.distribution.mouvement < 0 && AM.sens === 'judas', 'AMD : distribution baissière de New York AM → schéma Judas (' + (AM.sens) + ')');
const LQ = I.liquidites(D, J); const jPrev = J.find(j => j.cle === '2026-03-10'), pdh = LQ.find(l => l.nom === 'PDH' && l.jour === cle);
v(pdh && pdh.p === jPrev.h && pdh.cote === 'BSL', 'PDH du 11/03 = plus haut du 10/03'); v(LQ.every(l => l.tSweep == null || l.tSweep >= l.tForm), 'un balayage ne précède jamais la formation');
v(LQ.some(l => l.nom === 'haut plage asiatique' && l.jour === cle && l.tSweep != null), 'le haut de la plage asiatique est balayé par la mèche de Londres');
// ── analyse, objets visibles, rapport ──
const rnd = prng(7); let c = 100; const cl = []; for (let i = 0; i < 24 * 25; i++) { c += (rnd() - 0.5) * 1.6 + Math.sin(i / 20) * 0.3; cl.push(c); }
const L25 = cl.map((c, i) => { const o = i ? cl[i - 1] : c; return { t: Date.UTC(2026, 0, 5, 0, 0) + i * H, o, h: Math.max(o, c) + 0.4 * rnd(), l: Math.min(o, c) - 0.4 * rnd(), c, v: 100 }; });
const AN = I.analyser(L25); v(AN && AN.jours.length === 5 && AN.fvg.length > 0 && AN.liquidites.length > 5 && AN.pd.haut > AN.pd.bas, 'analyse de la semaine glissante : 5 jours, FVG et liquidités trouvés');
const vis = I.objetsVisibles(AN, { max: 8 }); v(vis.filter(o => o.actif).length <= 8, 'au plus 8 objets actifs visibles par défaut'); v(I.objetsVisibles(AN, { max: 3 }).filter(o => o.actif).length <= 3, 'le curseur de filtre réduit les objets');
const dists = vis.filter(o => o.actif).map(o => o.dist); v(dists.every((d, k) => k === 0 || d >= dists[k - 1]), 'les objets actifs sont triés du plus proche au plus éloigné');
const Rp = I.rapport(AN, { maintenant: AN.tFin }); v(Rp.lignes.length >= 8 && /Interprétation de l'ICT/.test(Rp.texte) && !/(achète|vends)/i.test(Rp.texte) && /Killzone/.test(Rp.texte), 'rapport : résumé, zones, killzone, biais, sans ordre');
v(/Prix dans la plage de la semaine/.test(Rp.texte) && /heure de Paris/.test(Rp.texte), 'rapport : valeurs réelles et heures de Paris');
const kz = I.killzoneEnCours(I.instantNY(2026, 3, 12, 3, 30)); v(kz.enCours.some(f => f.id === 'londres') && kz.enCours.some(f => f.id === 'sb_londres'), 'killzone en cours à 03:30 NY : Londres et Silver Bullet'); v(kz.prochaine && kz.prochaine.id === 'ny_am' || kz.prochaine, 'prochaine killzone connue');
// ── non-repaint : états monotones sur des préfixes ──
const rang = { non_rempli: 0, partiel: 1, rempli: 2 }; let rep = 0, nPref = 0;
const pleine = { fvg: new Map(I.fvgListe(L25).map(z => [z.id, z])), ob: new Map(I.orderBlocks(L25).map(z => [z.id, z])), liq: new Map(I.liquidites(L25, I.jours(L25)).map(z => [z.id, z])) };
for (let n = 150; n <= L25.length; n += 2) {
  const P = L25.slice(0, n); nPref++; const Jp = I.jours(P);
  for (const z of I.fvgListe(P)) { const f = pleine.fvg.get(z.id); if (!f) { rep++; continue; } if (rang[z.statut] > rang[f.statut]) rep++; if (z.tPartiel != null && z.tPartiel !== f.tPartiel) rep++; if (z.tRempli != null && z.tRempli !== f.tRempli) rep++; if (z.tInverse != null && z.tInverse !== f.tInverse) rep++; }
  for (const z of I.orderBlocks(P)) { const f = pleine.ob.get(z.id); if (!f) { rep++; continue; } if (z.statut === 'invalide' && (f.statut !== 'invalide' || f.tInval !== z.tInval)) rep++; if (z.tTouche != null && z.tTouche !== f.tTouche) rep++; }
  for (const z of I.liquidites(P, Jp)) { if (z.nom === 'PDH' || z.nom === 'PDL' || z.nom === 'PWH' || z.nom === 'PWL' || /plage|session|égaux/.test(z.nom)) { const f = pleine.liq.get(z.id); if (!f) { if (!/plage|session/.test(z.nom)) rep++; continue; } if (z.tSweep != null && z.tSweep !== f.tSweep) rep++; } }
}
v(rep === 0 && nPref >= 150, `non-repaint sur ${nPref} préfixes : ${rep} écart(s)`);
const sceau = JSON.parse(fs.readFileSync(new URL('../front/or/ict-v1.sceau.json', import.meta.url), 'utf8'));
const h = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/ict-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(h === sceau.sha256, 'sceau SHA-256 de ict-v1.js (' + h.slice(0, 8) + ')');
void atrLocal; console.log(`ict : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
