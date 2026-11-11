/* STATISTIQUES RÉELLES de schemas-retournement-v1 (Dukascopy XAU/USD, H1 et H4 agrégé) : pour chaque famille (divergences RSI régulières / cachées, double sommet / creux, tête et épaules,
   balayage de liquidité avec réintégration, bougies de retournement), seule, en zone, en zone avec changement de caractère :
   fréquence avec laquelle le prix atteint +1,5 ATR dans le sens attendu AVANT −1,5 ATR, dans les 6, 12 et 24 bougies, comptée depuis la CLÔTURE de la bougie de confirmation (référence = cette clôture,
   les bougies suivantes seulement : aucune avance sur le futur) ; deux bougies qui touchent les deux barrières = échec (prudent). Base = la même mesure sur TOUTES les bougies, dans le même sens.
   Séparément sur les 18 derniers mois et sur 2015–2025. n < 30 = « pas assez de données ». Test z contre la base, correction de Holm sur tous les essais. Écrit front/or/schemas-stats.json et RAPPORT-SCHEMAS-OR.md (local). */
import fs from 'node:fs';
import { charger } from './donnees.mjs'; import * as S from '../front/or/schemas-retournement-v1.js'; import * as SM from '../front/or/structure-marche-v1.js'; import { atrLocal } from '../front/or/niveaux-periode.js';
import { phi } from './stats.mjs';
const H = 3600e3, HOR = [6, 12, 24], SEUIL = 1.5, FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] };
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };
const D = charger({ debut: 2014, fin: 2026 }), H1 = D.h1.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), H4 = SM.agreger(H1, 4 * H).filter((b, i, A) => b.n === 4 || i < A.length - 1);

/* zones simples et causales pour l'historique : un amas d'au moins 2 pivots confirmés (fractale de 5, 720 dernières bougies) à ≤ 0,3 ATR de la mèche de la bougie */
function fabriquerZones(B, pv, A) {
  const H_ = pv.filter(p => p.type === 'H'), L_ = pv.filter(p => p.type === 'L');
  const cherche = (L, j, prix, at) => { let n = 0, lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].conf <= j - 1) lo = m + 1; else hi = m; }
    for (let k = lo - 1; k >= 0 && L[k].i >= j - 720; k--) if (Math.abs(L[k].p - prix) <= 0.3 * at) n++; return n >= 2; };
  return (j, dir, b) => { const at = A[j] || A[j - 1]; if (!at) return null; return dir > 0 ? (cherche(L_, j, B[j].l, at) ? { cote: 'support' } : null) : (cherche(H_, j, B[j].h, at) ? { cote: 'resistance' } : null); };
}
/* résultat d'un événement : 1 = +1,5 ATR avant −1,5 ATR dans les N bougies, −1 = l'inverse (−1,5 ATR d'abord), 0 = aucune barrière */
function issue(B, i, dir, a, N) {
  const ref = B[i].c, haut = ref + SEUIL * a, bas = ref - SEUIL * a;
  for (let k = i + 1; k <= Math.min(B.length - 1, i + N); k++) { const b = B[k], hit = dir > 0 ? b.h >= haut : b.l <= bas, adv = dir > 0 ? b.l <= bas : b.h >= haut; if (adv) return -1; if (hit) return 1; }
  return 0;
}
function mesurer(B, tf, periode) {
  const A = atrLocal(B, 14), pv = S.pivotsK(B), zones = fabriquerZones(B, pv, A), n = B.length;
  const R = S.analyser(B, { tf, periode, zones });
  // changements de caractère de la structure (structure-marche-v1) : indices par sens
  const SMR = SM.analyser(B, { K: SM.P.K, periode }), choch = SMR.events.filter(e => e.type === 'choch');
  const chochRecent = (i, dir) => choch.some(e => e.dir === dir && e.i <= i && e.i >= i - 12);
  // événements retenus : posés / confirmés seulement (jamais « en formation »)
  const E = [];
  const ajoute = (famille, e, ref, enZ) => { if (ref + 24 >= n) return; const a = A[ref] || A[ref - 1]; if (!a) return; E.push({ famille, dir: e.dir, i: ref, t: B[ref].t, a, enZone: !!enZ, choch: chochRecent(ref, e.dir) }); };
  for (const d of R.divergences) ajoute(`divergence_${d.sous}_${d.dir > 0 ? 'haussiere' : 'baissiere'}`, d, d.i, d.enZone);
  for (const d of R.doubles) if (d.statut === 'confirme') ajoute(d.dir < 0 ? 'double_sommet' : 'double_creux', d, d.iConfirm, zones(d.i2, d.dir, B[d.i2]));
  for (const d of R.tetes) if (d.statut === 'confirme') ajoute(d.dir < 0 ? 'tete_epaules' : 'tete_epaules_inversee', d, d.iConfirm, zones(d.iTete, d.dir, B[d.iTete]));
  for (const d of R.balayages) ajoute(`balayage_${d.dir < 0 ? 'haut' : 'bas'}`, d, d.i, d.enZone);
  for (const d of R.bougies) ajoute(`bougie_${d.nom.replace(/ /g, '_')}`, d, d.i, true);
  // base : toutes les bougies, séparément pour un sens haussier et baissier, par fenêtre et horizon
  const base = {};
  for (const [fen, [d0, d1]] of Object.entries(FEN)) { base[fen] = {}; for (const N of HOR) { let up = 0, dn = 0, m = 0; for (let i = 30; i < n - 24; i++) { if (B[i].t < d0 || B[i].t >= d1) continue; const a = A[i]; if (!a) continue; m++; const r = issue(B, i, 1, a, N); if (r === 1) up++; else if (r === -1) dn++; } base[fen][N] = { n: m, up: m ? up / m : null, dn: m ? dn / m : null, partUp: up + dn ? up / (up + dn) : 0.5 }; } }
  return { E, base, B, nEvt: E.length };
}
const brut = {};
for (const [tf, B, per] of [['H1', H1, H], ['H4', H4, 4 * H]]) brut[tf] = mesurer(B, tf, per);
const CONDITIONS = { seul: () => true, en_zone: e => e.enZone, en_zone_choch: e => e.enZone && e.choch };
const sortie = { version: S.VERSION, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1 et H4 agrégé', fenetres: { recent: "2025-05-01 → aujourd'hui (18 mois)", long: '2015–2025' }, horizons: HOR, seuilAtr: SEUIL, sha256_module: JSON.parse(fs.readFileSync(new URL('../front/or/schemas-retournement-v1.sceau.json', import.meta.url), 'utf8')).sha256, H1: {}, H4: {} };
const cellules = [];
for (const tf of ['H1', 'H4']) {
  const { E, B, base } = brut[tf]; const A = atrLocal(B, 14), familles = [...new Set(E.map(e => e.famille))].sort();
  for (const f of familles) { sortie[tf][f] = {};
    for (const [cnom, cf] of Object.entries(CONDITIONS)) { sortie[tf][f][cnom] = {};
      for (const [fen, [d0, d1]] of Object.entries(FEN)) {
        const L = E.filter(e => e.famille === f && cf(e) && e.t >= d0 && e.t < d1), cel = { n: L.length, assez: L.length >= 30 };
        for (const N of HOR) {
          const out = L.map(e => issue(B, e.i, e.dir, e.a, N)), k = out.filter(x => x === 1).length, adv = out.filter(x => x === -1).length, dec = k + adv, up = L.filter(e => e.dir > 0).length;
          // fréquence demandée (+1,5 ATR avant −1,5 ATR) et sa base ; part parmi les issues tranchées (corrige l'effet de la volatilité du moment : elle gonfle les deux barrières)
          const bF = L.length ? (up * base[fen][N].up + (L.length - up) * base[fen][N].dn) / L.length : null, p = L.length ? k / L.length : null;
          const bPart = L.length ? (up * base[fen][N].partUp + (L.length - up) * (1 - base[fen][N].partUp)) / L.length : null, part = dec ? k / dec : null;
          const z = dec >= 1 && bPart > 0 && bPart < 1 ? (part - bPart) / Math.sqrt(bPart * (1 - bPart) / dec) : 0, pv = 2 * (1 - phi(Math.abs(z)));
          cel['h' + N] = { k, adv, n: L.length, nTranches: dec, p, ic: wilson(k, L.length), base: bF, part, partIc: wilson(k, dec), basePart: bPart, ecart: part == null ? null : part - bPart, pBrut: pv };
          if (dec >= 30) cellules.push({ tf, f, cnom, fen, N, cel: cel['h' + N] }); }
        sortie[tf][f][cnom][fen] = cel;
      } } }
}
// Holm sur toutes les cellules testables (n ≥ 30)
const ord = cellules.slice().sort((a, b) => a.cel.pBrut - b.cel.pBrut), m = ord.length; let mx = 0;
ord.forEach((c, r) => { mx = Math.max(mx, Math.min(1, (m - r) * c.cel.pBrut)); c.cel.pHolm = mx; c.cel.distingue = c.cel.pHolm < 0.05 && c.cel.part > c.cel.basePart ? 'mieux' : c.cel.pHolm < 0.05 ? 'moins bien' : 'non'; });
sortie.nEssais = m; fs.writeFileSync(new URL('../front/or/schemas-stats.json', import.meta.url), JSON.stringify(sortie));
// rapport local
const pc = x => (x == null ? '—' : (x * 100).toFixed(0) + ' %'), L = ['# Schémas de retournement v1 : statistiques réelles (local)', '', `Module scellé ${sortie.sha256_module.slice(0, 16)}… · ${sortie.source} · calculé le ${sortie.calcule}. Mesure : +${SEUIL} ATR dans le sens attendu avant −${SEUIL} ATR, depuis la clôture de la bougie de confirmation. Base = même mesure sur toutes les bougies. ATTENTION : la fréquence brute est gonflée par la volatilité du moment (les événements surviennent quand le marché bouge : les DEUX barrières sont touchées plus souvent) ; le verdict utilise donc la PART parmi les issues tranchées (barrière favorable d'abord / une des deux), comparée à la même part sur toutes les bougies. Holm sur ${m} essais (n ≥ 30).`, ''];
const lignes = [];
for (const tf of ['H1', 'H4']) for (const f of Object.keys(sortie[tf])) for (const c of Object.keys(CONDITIONS)) for (const fen of ['recent', 'long']) { const x = sortie[tf][f][c][fen]; if (!x.n) continue;
  const h = x.h12; lignes.push(`| ${tf} | ${f} | ${c} | ${fen === 'recent' ? '18 mois' : '2015–2025'} | ${x.n}${x.assez ? '' : ' (< 30)'} | ${x.assez ? pc(x.h6.p) + ' / ' + pc(x.h12.p) + ' / ' + pc(x.h24.p) : 'pas assez de données'} | ${x.assez ? pc(h.base) : '—'} | ${x.assez ? pc(h.part) + ' contre ' + pc(h.basePart) : '—'} | ${x.assez ? (h.distingue === 'mieux' ? 'MIEUX que la base' : h.distingue === 'moins bien' ? 'moins bien que la base' : 'pas de différence nette') : '—'} |`); }
L.push('| TF | famille | condition | fenêtre | n | fréquence +1,5 ATR avant −1,5 ATR (6 / 12 / 24 bougies) | base (12) | part parmi les issues tranchées (12) contre base | verdict (12 bougies, Holm) |', '|---|---|---|---|---|---|---|---|---|', ...lignes);
const dist = cellules.filter(c => c.cel.distingue !== 'non'); L.push('', `## Ce qui se distingue du hasard (Holm < 5 %) : ${dist.length} cellule(s) sur ${m}`, ...dist.map(c => `- ${c.tf} · ${c.f} · ${c.cnom} · ${c.fen} · ${c.N} bougies : part ${pc(c.cel.part)} contre ${pc(c.cel.basePart)} de base parmi ${c.cel.nTranches} issues tranchées (fréquence brute ${pc(c.cel.p)} contre ${pc(c.cel.base)}, n = ${c.cel.n}) → ${c.cel.distingue}`));
const divSeule = cellules.filter(c => c.f.startsWith('divergence') && c.cnom === 'seul'); L.push('', `## La divergence seule apporte-t-elle quelque chose ? ${divSeule.filter(c => c.cel.distingue === 'mieux').length} cellule(s) « seule » mieux que la base sur ${divSeule.length} testables.`);
fs.writeFileSync(new URL('./RAPPORT-SCHEMAS-OR.md', import.meta.url), L.join('\n')); console.log(L.slice(0, 4).join('\n')); console.log(`événements H1 : ${brut.H1.nEvt}, H4 : ${brut.H4.nEvt} ; essais testables : ${m} ; distincts : ${dist.length}`); console.log(L.slice(-4 - dist.length).join('\n'));
