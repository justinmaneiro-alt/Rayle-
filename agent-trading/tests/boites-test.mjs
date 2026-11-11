/* Tests de boites-v1 : niveaux (swings H4, veille, semaine, volume), confluence, hauteur, côté, invalidation (ne revient pas), sélection (≥ 50 %, n ≥ 15, ≤ 4 ATR, 2 par côté),
   « pas de zone forte », ligne de retournement, non-repaint sur des préfixes, sceau SHA-256, statistiques publiées. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as Z from '../front/or/boites-v1.js'; import { analyser as SM } from '../front/or/structure-marche-v1.js'; import { prng } from '../recherche-or/stats.mjs';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);   // lundi 5 janvier 2026 00:00 UTC
function marche(N, graine = 5, derive = 0) { const g = prng(graine), B = []; let c = 4000; for (let i = 0; i < N; i++) { const o = c; c = o + (g() - 0.5) * 6 + Math.sin(i / 30) * 1.5 + derive; B.push({ t: t0 + i * H, o, h: Math.max(o, c) + g() * 2, l: Math.min(o, c) - g() * 2, c, v: 50 + g() * 100 }); } return B; }
const B = marche(900), prep = Z.preparer(B);
// niveaux : natures présentes à la fin
const L = Z.niveauxA(prep, B.length - 1), nat = new Set(L.map(x => x.nature)); v(nat.has('swing_h4') && nat.has('veille') && nat.has('semaine') && nat.has('volume'), 'niveaux : swings H4, veille, semaine précédente et volume présents (' + [...nat] + ')');
// veille = haut/bas du jour de marché précédent
const fin = B.length - 1, d = prep.jourDe[fin], pj = prep.J[d - 1]; v(L.find(x => x.nom === 'Haut de la veille').p === pj.h && L.find(x => x.nom === 'Bas de la veille').p === pj.l, 'haut/bas de la veille = extrêmes du jour de marché précédent');
// profil de volume : POC dans la plage de la période, VAL ≤ POC ≤ VAH
const pf = Z.niveauxA(prep, fin).filter(x => x.nature === 'volume'), poc = pf.find(x => x.nom === 'POC').p, vah = pf.find(x => x.nom === 'VAH').p, val = pf.find(x => x.nom === 'VAL').p; v(val <= poc && poc <= vah, 'profil : VAL ≤ POC ≤ VAH');
// zones à chaque bougie : confluence ≥ 2, hauteur ≤ 0,3 ATR, côté cohérent, aucune zone invalide non marquée
let nZ = 0, haut = true, conf = true, cote = true, inval = true; for (let i = 200; i < B.length; i += 5) for (const z of Z.zonesA(prep, i)) { nZ++; if (z.haut - z.bas > 0.3 * z.atr + 1e-9 || z.haut - z.bas < 0.1 * z.atr - 1e-9) haut = false; if (z.conf < 2 || z.natures.length !== z.conf) conf = false; const c = B[i].c; if ((z.bas > c && z.cote !== 'vente') || (z.haut < c && z.cote !== 'achat')) cote = false; if (z.invalide !== (z.tInval != null)) inval = false; }
v(nZ > 20, 'des zones apparaissent sur une série longue (' + nZ + ')'); v(haut, 'hauteur entre 0,1 et 0,3 ATR'); v(conf, 'confluence = nombre de natures différentes, au moins 2'); v(cote, 'côté : vente au-dessus du prix, achat en dessous'); v(inval, 'invalide ⇔ date d\'invalidation');
// invalidation : une zone invalidée ne revient jamais (monotone)
{ const vus = new Map(); let revient = false; for (let i = 200; i < B.length; i++) for (const z of Z.zonesA(prep, i)) { const a = vus.get(z.id + '|' + z.tFormation); if (a && z.invalide === false && a.invalide) revient = true; vus.set(z.id + '|' + z.tFormation, { invalide: z.invalide }); } v(!revient, 'une zone invalidée par une clôture à plus de 0,25 ATR ne redevient jamais valide'); }
// sélection : probabilité, n, distance, 2 par côté
const faux = (cote, conf, taux, n) => ({ [cote]: { [conf]: { long: { assez: n >= 30, n, taux }, recent: { assez: false, n: 3, taux: 0.5 } } } });
const stats = { zones: { vente: { 'conf=2': { long: { nT: 200, taux: 0.55 } }, 'conf=3': { long: { nT: 12, taux: 0.9 } }, 'conf=4+': { long: { nT: 40, taux: 0.45 } } }, achat: { 'conf=2': { long: { nT: 300, taux: 0.6 } } } } };
const z = (cote, prix, conf) => ({ id: cote + prix, cote, prix, bas: prix - 0.4, haut: prix + 0.4, conf, natures: [], niveaux: [], tFormation: 0, tInval: null, invalide: false });
const zs = [z('vente', 4010, 2), z('vente', 4020, 2), z('vente', 4030, 2), z('vente', 4015, 3), z('vente', 4012, 4), z('achat', 3990, 2), z('achat', 3980, 2), z('achat', 3700, 2)];
const sel = Z.selectionner(zs, { prix: 4000, atr: 5, stats });
v(sel.zones.filter(q => q.cote === 'vente').length === 2 && sel.zones.filter(q => q.cote === 'achat').length === 2, 'au plus 2 zones au-dessus et 2 en dessous');
v(!sel.zones.some(q => q.prix === 4015 || q.prix === 4012), 'refusées : n < 15 (conf 3) et probabilité < 50 % (conf 4+)'); v(!sel.zones.some(q => q.prix === 3700 || q.prix === 4030), 'refusées : au-delà de 4 ATR');
v(Z.selectionner(zs, { prix: 4000, atr: 5, stats: { zones: {} } }).message === 'Pas de zone forte à proximité', '« Pas de zone forte à proximité » sans probabilité mesurée');
v(Z.selectionner([{ ...z('vente', 4005, 2), invalide: true }], { prix: 4000, atr: 5, stats }).zones.length === 0, 'une zone invalidée n\'est jamais proposée');
// étendue : 40 bougies à droite au maximum ; invalidation
{ const e = Z.etendue({ tFormation: 100, tInval: null }, 5000, Z.P); v(e.tFin === 5000 + 40 * H, 'étendue : 40 bougies à droite de la dernière'); v(Z.etendue({ tFormation: 100, tInval: 4000 }, 5000).tFin === 4000, 'étendue : arrêt à l\'invalidation'); }
// ligne de retournement
{ const Bs = marche(500, 9, 0.35), sm = SM(Bs, { periode: H }); const l = Z.ligneRetournement(sm, Bs); v(l === null || (/^Retournement (baissier si clôture H1 sous|haussier si clôture H1 au-dessus de) \d/.test(l.texte) && l.p > 0), 'ligne de retournement : une phrase avec le niveau (' + (l && l.texte) + ')');
  v(Z.dernieresCassures(sm, Bs).length <= 3, 'au plus 3 cassures étiquetées'); const mono = marche(500, 9, 0.5); const lm = Z.ligneRetournement(SM(mono, { periode: H }), mono); v(!lm || lm.dir === -1, 'tendance haussière : retournement baissier sous le creux protégé'); }
// non-repaint : l'état à la bougie k ne dépend pas de la suite
{ const Bn = marche(1100, 11), pleine = Z.preparer(Bn); let bon = true, essais = 0; for (let k = 320; k <= 1100; k += 13) { const pre = Z.preparer(Bn.slice(0, k)); essais++; const f = x => Z.zonesA(x, k - 1).map(q => [q.id, q.conf, q.tFormation, q.invalide, q.tInval, Math.round(q.bas * 1e6), Math.round(q.haut * 1e6)].join('|')).join(';'); if (f(pre) !== f(pleine)) { bon = false; console.log('repaint au préfixe', k); break; } }
  v(bon && essais >= 55, 'non-repaint : zones identiques avec la série tronquée (' + essais + ' préfixes)'); }
// sceau et statistiques publiées
{ const f = new URL('../front/or/boites-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/boites-v1.sceau.json', import.meta.url), 'utf8')), sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === Z.VERSION && s.sha256 === sha, 'sceau SHA-256 de boites-v1.js');
  const j = JSON.parse(fs.readFileSync(new URL('../front/or/boites-stats.json', import.meta.url), 'utf8')); v(j.sha256 === s.sha256, 'boites-stats.json calculé avec la règle scellée actuelle'); let petit = true; for (const cote of ['vente', 'achat']) for (const c of Object.values(j.zones[cote] || {})) for (const f of ['recent', 'long']) if (c[f] && c[f].nT < 30 && c[f].verdict !== 'pas assez de données') petit = false; v(petit, 'n < 30 = « pas assez de données »'); }
console.log(`boites : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);

