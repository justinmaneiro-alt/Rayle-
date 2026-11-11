/* Tests de l'affichage des zones (zones-affichage-v1) : naissance, vie, invalidation, retournement, épaisseur, fusion, liquidité, non-repaint, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as Z from '../front/or/zones-affichage-v1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, t0 = Date.UTC(2026, 0, 5);
// série H1 à partir de clôtures ; mèche ±0,5 ; la bougie i ouvre à la clôture précédente
const serie = cl => cl.map((c, i) => { const o = i ? cl[i - 1] : c; return { t: t0 + i * H, o, h: Math.max(o, c) + 0.5, l: Math.min(o, c) - 0.5, c, v: 100 }; });
// 40 bougies calmes autour de 100, puis montée vers 110
const calme = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 1 : -1));
const montee = [102, 104, 106, 108, 109.5, 108, 106, 104, 103];
const B1 = serie([...calme, ...montee]);
const a = Z.atrH1(B1); v(a > 0.5 && a < 5, 'ATR H1 calculé');
const zone = { id: 'r', kind: 'sr', bas: 109.6, haut: 110.0, nom: 'Résistance test' };
let R = Z.zonesAffichage(B1, [zone], { prix: 103 });
v(R.actives.length === 1 && R.actives[0].cote === 'resistance' && R.actives[0].actif, 'zone au-dessus du prix : résistance active');
const iOrigine = B1.findIndex(b => b.h >= 109.6);
v(R.actives[0].tDebut === B1[iOrigine].t, "la zone naît à la bougie où le prix l'a touchée (pas à gauche du graphique)");
v(R.actives[0].tFin === null && R.traces.length === 0, 'active : pas de fin, pas de trace');
const large = Z.zonesAffichage(B1, [{ id: 'l', kind: 'sr', bas: 108, haut: 112, nom: 'large' }], { prix: 103 });
v(Math.abs(large.actives[0].epaisseur - 0.3 * a) < 1e-9, 'zone large : épaisseur dessinée = 0,3 ATR');
const fine = Z.zonesAffichage(B1, [{ id: 'f', kind: 'sr', bas: 109.9, haut: 110.0, nom: 'fine' }], { prix: 103 });
v(Math.abs(fine.actives[0].epaisseur - 0.1) < 1e-9, 'zone étroite : vraie largeur');
// invalidation : clôture au-delà de 110 + 0,25 ATR → trace + zone retournée (support)
const B2 = serie([...calme, ...montee.slice(0, 5), 112, 113, 114]);
R = Z.zonesAffichage(B2, [zone], { prix: 114 });
v(R.traces.length === 1 && R.traces[0].cote === 'resistance' && R.traces[0].tFin === B2[B2.length - 3].t, "invalidation à la première clôture au-delà de la zone + 0,25 ATR");
v(R.actives.length === 1 && R.actives[0].cote === 'support' && R.actives[0].retournee && R.actives[0].tDebut === R.traces[0].tFin, "retournement : un support naît à la bougie de l'invalidation");
const B3 = serie([...calme, ...montee.slice(0, 5), 109, 109.2]); B3[B3.length - 1].h = 113;
R = Z.zonesAffichage(B3, [zone], { prix: 109.2 });
v(R.traces.length === 0, "une mèche au-delà n'invalide pas (il faut une clôture)");
R = Z.zonesAffichage(B1, [zone, { id: 'r2', kind: 'sr', bas: 109.7, haut: 110.1, nom: 'autre' }], { prix: 103 });
v(R.actives.length === 1 && R.actives[0].elements.length === 2 && /autre/.test(Z.detailZone(R.actives[0]).join(' ')), 'zones qui se chevauchent : une seule avec la liste de ses éléments');
R = Z.zonesAffichage(B1, [zone, { id: 'r3', kind: 'sr', bas: 95, haut: 95.4, nom: 'loin' }], { prix: 103 });
v(R.actives.length === 2, 'zones éloignées : pas de fusion');
const espace = Array.from({ length: 9 }, (_, k) => ({ id: 'e' + k, kind: 'sr', bas: 109.6 + k * 3, haut: 110 + k * 3, nom: 'x' }));
R = Z.zonesAffichage(B1, espace, { prix: 103 }); v(R.actives.filter(z => z.proche).length <= 6, 'au plus 6 zones « proches » (étiquetées)');
R = Z.zonesAffichage(B1, [{ id: 'x', kind: 'volume', bas: 100.7, haut: 101.1, nom: 'vol', tDebut: t0 + 5 * H }], { prix: 103 });
v(R.actives.length + R.traces.length >= 1, 'zone sans touche trouvée : placée sur son instant de formation fourni');
// liquidité : deux sommets égaux puis balayage
const serieL = cl => cl.map((c, i) => ({ t: t0 + i * H, o: i ? cl[i - 1] : c, h: c + 0.5, l: c - 0.5, c, v: 100 }));
const dessin = [102, 106, 108, 106, 104, 102, 104, 106, 108.2, 106, 104, 102, 103, 104, 106, 107, 110];
const BL = serieL([...calme, ...dessin]);
const liq = Z.liquiditeAffichage(BL, [{ p: 108.5, sorte: 'haute', raisons: ['sommets égaux'] }]);
const tous = [...liq.actives, ...liq.balayees];
v(tous.length === 1, 'une liquidité'); const L = tous[0];
v(L && L.n >= 2 && /sommets/.test(L.texte) && L.tBalayage != null && liq.balayees.length === 1, "sommets égaux balayés : la ligne s'arrête à la bougie de balayage");
v(L && L.tPremier < L.tDernier && L.tDernier < L.tBalayage, 'ordre : 1er pivot < dernier pivot < balayage');
const BL2 = serieL([...calme, ...dessin.slice(0, 14)]); const l2 = Z.liquiditeAffichage(BL2, [{ p: 108.5, sorte: 'haute', raisons: ['sommets égaux'] }]);
v(l2.actives.length === 1 && l2.actives[0].tBalayage == null && /^Liquidité haute 10\d \(2 sommets\)$/.test(l2.actives[0].texte), 'non balayée : ligne active, étiquette « Liquidité haute 108 (2 sommets) » : ' + (l2.actives[0] && l2.actives[0].texte));
// non-repaint : sur tous les préfixes, une trace décidée ne bouge plus
const longue = serie([...calme, ...montee, 110, 111, 112, 111, 109, 108, 107, 109, 110.5, 111.5, 112.5, 113, 112, 110, 109, 108.5]);
let prev = null, repaint = 0, nPref = 0;
for (let k = 45; k <= longue.length; k++) {
  const P = longue.slice(0, k), r = Z.zonesAffichage(P, [zone], { prix: P[P.length - 1].c, a: 2 }); nPref++;
  const traces = r.traces.map(x => `${x.cote}|${x.tDebut}|${x.tFin}`);
  if (prev) for (const t of prev) if (!traces.includes(t)) repaint++;
  prev = traces;
}
v(repaint === 0 && nPref >= 10, `non-repaint sur ${nPref} préfixes : aucune trace ne change une fois décidée`);
const sceau = JSON.parse(fs.readFileSync(new URL('../front/or/zones-affichage-v1.sceau.json', import.meta.url), 'utf8'));
const h = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/zones-affichage-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(h === sceau.sha256, 'sceau SHA-256 de zones-affichage-v1.js (' + h.slice(0, 8) + ')');
console.log(`zones-affichage : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
