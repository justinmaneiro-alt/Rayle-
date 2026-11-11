/* STATISTIQUES RÉELLES des éléments ICT (ict-v1) sur Dukascopy XAU/USD H1 : 18 derniers mois ET 2015–2025, séparément. Écrit front/or/ict-stats.json (lu par l'interface) et RAPPORT-ICT-OR.md (local).
   • Zones (FVG non rempli, order block, breaker, OTE) : « tient » = au premier retour dans la zone (48 bougies après sa formation), le prix s'en éloigne de 0,5 ATR du bon côté avant de la dépasser de 0,25 ATR
     (deux dans la même bougie = « ne tient pas »). Comparé à des zones de MÊME largeur placées au hasard du même côté du prix (distance 0,3 à 3 ATR), même règle, 200 tirages par événement.
   • Événements directionnels (balayage PDH/PDL, PWH/PWL, Judas swing, cassure de la plage asiatique à Londres) : +1,5 ATR avant −1,5 ATR depuis la CLÔTURE de la bougie de l'événement (6, 12, 24 bougies) ;
     verdict sur la PART des issues tranchées (la volatilité du moment gonfle les deux barrières), comparée à la même part sur toutes les bougies.
   • Killzones : étendue moyenne des bougies (en ATR) dans la fenêtre contre toutes les autres bougies ; intervalle de confiance, n.
   n < 30 → « pas assez de données » ; Holm sur tous les essais testables. */
import fs from 'node:fs';
import { charger } from './donnees.mjs'; import * as I from '../front/or/ict-v1.js'; import { atrLocal } from '../front/or/niveaux-periode.js'; import { phi, prng } from './stats.mjs';
const H = 3600e3, HOR = [6, 12, 24], SEUIL = 1.5, FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] };
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, c = (p + z * z / (2 * n)) / (1 + z * z / n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n); return [c - h, c + h]; };
const D = charger({ debut: 2014, fin: 2026 }), B = D.h1.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), n = B.length, A = atrLocal(B, 14);
const rnd = prng(2026), t00 = Date.now();
const issue = (i, dir, a, N) => { const ref = B[i].c, haut = ref + SEUIL * a, bas = ref - SEUIL * a; for (let k = i + 1; k <= Math.min(n - 1, i + N); k++) { const b = B[k], hit = dir > 0 ? b.h >= haut : b.l <= bas, adv = dir > 0 ? b.l <= bas : b.h >= haut; if (adv) return -1; if (hit) return 1; } return 0; };
/* « tient » d'une zone [bas, haut] de côté « support » (dir > 0) ou « résistance », depuis l'indice f : résultat null (pas touchée en 48 bougies), 1 tient, 0 ne tient pas */
function tient(f, bas, haut, dir, a) {
  for (let j = f + 1; j <= Math.min(n - 1, f + 48); j++) {
    const b = B[j]; if (b.l > haut || b.h < bas) continue;   // pas encore touchée
    for (let q = j; q <= Math.min(n - 1, j + 48); q++) { const x = B[q], casse = dir > 0 ? x.l <= bas - 0.25 * a : x.h >= haut + 0.25 * a, ok = dir > 0 ? x.h >= haut + 0.5 * a : x.l <= bas - 0.5 * a; if (casse) return 0; if (ok && q > j) return 1; }
    return 0;
  }
  return null;
}
const base = {}; for (const [fen, [d0, d1]] of Object.entries(FEN)) { base[fen] = {}; for (const N of HOR) { let up = 0, dn = 0; for (let i = 30; i < n - 24; i++) { if (B[i].t < d0 || B[i].t >= d1 || !A[i]) continue; const r = issue(i, 1, A[i], N); if (r === 1) up++; else if (r === -1) dn++; } base[fen][N] = up + dn ? up / (up + dn) : 0.5; } }
// ── événements ──
const J = I.jours(B), E = { zones: [], dir: [] };
const fvg = I.fvgListe(B), ob = I.orderBlocks(B), liq = I.liquidites(B, J), amd = I.amdJours(B, J);
const zonePush = (famille, f, bas, haut, dir) => { if (f + 60 >= n || !A[f]) return; E.zones.push({ famille, f, t: B[f].t, bas, haut, dir, a: A[f], c: B[f].c }); };
for (const z of fvg) zonePush('fvg_' + (z.dir > 0 ? 'haussier' : 'baissier'), z.i, z.bas, z.haut, z.dir);
for (const z of ob) { zonePush('order_block_' + (z.dir > 0 ? 'haussier' : 'baissier'), z.i, z.bas, z.haut, z.dir); if (z.breaker) { const f = B.findIndex((b, k) => k >= z.i && b.t === z.breaker.tDebut); if (f > 0) zonePush('breaker_' + (z.breaker.dir > 0 ? 'haussier' : 'baissier'), f, z.breaker.bas, z.breaker.haut, z.breaker.dir); } }
// OTE : à chaque cassure de structure (structure-marche-v1, K = 5), plage des 60 bougies, zone 62–79 % dans le sens de la cassure
import('../front/or/structure-marche-v1.js').then(SM => {
  const S = SM.analyser(B, { K: SM.P.K, periode: H });
  for (const e of S.events.filter(e => e.type === 'bos' || e.type === 'choch')) { const f = e.i; if (f < 60) continue; let hh = -Infinity, ll = Infinity; for (let k = f - 59; k <= f; k++) { hh = Math.max(hh, B[k].h); ll = Math.min(ll, B[k].l); } const r = hh - ll; if (e.dir > 0) zonePush('ote_haussier', f, hh - 0.79 * r, hh - 0.62 * r, 1); else zonePush('ote_baissier', f, ll + 0.62 * r, ll + 0.79 * r, -1); }
  suite();
});
function suite() {
  // directionnels
  const dirPush = (famille, i, dir) => { if (i + 24 >= n || i < 30 || !A[i]) return; E.dir.push({ famille, i, t: B[i].t, dir, a: A[i] }); };
  for (const l of liq.filter(l => ['PDH', 'PDL', 'PWH', 'PWL'].includes(l.nom) && l.tSweep != null)) { const i = B.findIndex((b, k) => b.t === l.tSweep && k > 0); if (i < 0) continue; if (B[i].c < l.p && l.cote === 'BSL' || B[i].c > l.p && l.cote === 'SSL') dirPush(`balayage_${l.nom}_reintegre`, i, l.cote === 'BSL' ? -1 : 1); dirPush(`balayage_${l.nom}`, i, l.cote === 'BSL' ? -1 : 1); }
  for (const e of amd) if (e.manipulation) { const m = e.manipulation; dirPush('judas_swing_londres', m.i, m.cote === 'haut' ? -1 : 1); }
  for (const e of amd) { const F = I.fenetresKillzones(e.jour).find(f => f.id === 'londres'); const i0 = B.findIndex(b => b.t >= F.debut); for (let i = i0; i >= 0 && i < n && B[i].t < F.fin; i++) { if (B[i].c > e.accumulation.h) { dirPush('cassure_plage_asiatique_londres_continuation', i, 1); break; } if (B[i].c < e.accumulation.l) { dirPush('cassure_plage_asiatique_londres_continuation', i, -1); break; } } }
  // killzones : étendue moyenne en ATR
  const kzx = {}; for (const [fen] of Object.entries(FEN)) kzx[fen] = {};
  const toutes = { recent: [], long: [] }; for (let i = 30; i < n; i++) if (A[i]) { const r = (B[i].h - B[i].l) / A[i]; for (const [fen, [d0, d1]] of Object.entries(FEN)) if (B[i].t >= d0 && B[i].t < d1) toutes[fen].push([i, r]); }
  const parKz = {}; for (const j of J) for (const f of I.fenetresKillzones(j.cle)) { const i0 = B.findIndex((b, k) => 0 && k); void i0; }
  const dansKz = new Map(); // indice de bougie → ids de killzones
  { let p = 0; for (const j of J) for (const f of I.fenetresKillzones(j.cle)) { while (p > 0 && B[p].t > f.debut) p--; while (p < n && B[p].t < f.debut) p++; for (let i = p; i < n && B[i].t < f.fin; i++) { if (!dansKz.has(i)) dansKz.set(i, []); dansKz.get(i).push(f.id); } } }
  const ids = I.KILLZONES.map(k => k.id);
  const sortie = { version: I.VERSION, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1', fenetres: { recent: "2025-05-01 → aujourd'hui (18 mois)", long: '2015–2025' }, horizons: HOR, sha256_module: JSON.parse(fs.readFileSync(new URL('../front/or/ict-v1.sceau.json', import.meta.url), 'utf8')).sha256, zones: {}, directionnels: {}, killzones: {} };
  const cellules = [];
  // zones
  const fams = [...new Set(E.zones.map(e => e.famille))].sort();
  for (const f of fams) { sortie.zones[f] = {}; for (const [fen, [d0, d1]] of Object.entries(FEN)) { const L = E.zones.filter(e => e.famille === f && e.t >= d0 && e.t < d1); let k = 0, nt = 0, bk = 0, bn = 0;
      for (const e of L) { const r = tient(e.f, e.bas, e.haut, e.dir, e.a); if (r != null) { nt++; k += r; }
        const w = e.haut - e.bas; for (let q = 0; q < 200; q++) { const d = (0.3 + rnd() * 2.7) * e.a, c = e.dir > 0 ? e.c - d : e.c + d, z = e.dir > 0 ? [c - w, c] : [c, c + w]; const rb = tient(e.f, z[0], z[1], e.dir, e.a); if (rb != null) { bn++; bk += rb; } } }
      const b = bn ? bk / bn : null, p = nt ? k / nt : null, z = nt >= 1 && b > 0 && b < 1 ? (p - b) / Math.sqrt(b * (1 - b) / nt) : 0, pv = 2 * (1 - phi(Math.abs(z)));
      const c = { n: L.length, nTouches: nt, assez: nt >= 30, tient: k, taux: p, ic: wilson(k, nt), base: b, ecart: p == null ? null : p - b, pBrut: pv, tauxTouche: L.length ? nt / L.length : null }; sortie.zones[f][fen] = c; if (nt >= 30) cellules.push({ type: 'zone', f, fen, N: 0, cel: c }); } }
  // directionnels
  const fd = [...new Set(E.dir.map(e => e.famille))].sort();
  for (const f of fd) { sortie.directionnels[f] = {}; for (const [fen, [d0, d1]] of Object.entries(FEN)) { const L = E.dir.filter(e => e.famille === f && e.t >= d0 && e.t < d1), cel = { n: L.length, assez: false };
      for (const N of HOR) { const out = L.map(e => issue(e.i, e.dir, e.a, N)), k = out.filter(x => x === 1).length, adv = out.filter(x => x === -1).length, dec = k + adv, up = L.filter(e => e.dir > 0).length;
        const bPart = L.length ? (up * base[fen][N] + (L.length - up) * (1 - base[fen][N])) / L.length : null, part = dec ? k / dec : null, z = dec >= 1 && bPart > 0 && bPart < 1 ? (part - bPart) / Math.sqrt(bPart * (1 - bPart) / dec) : 0, pv = 2 * (1 - phi(Math.abs(z)));
        cel['h' + N] = { k, adv, nTranches: dec, part, partIc: wilson(k, dec), basePart: bPart, ecart: part == null ? null : part - bPart, pBrut: pv }; if (dec >= 30) { cel.assez = true; cellules.push({ type: 'dir', f, fen, N, cel: cel['h' + N] }); } }
      sortie.directionnels[f][fen] = cel; } }
  // killzones
  for (const id of ids) { sortie.killzones[id] = {}; for (const fen of Object.keys(FEN)) { const T = toutes[fen], dans = T.filter(([i]) => (dansKz.get(i) || []).includes(id)), hors = T.filter(([i]) => !(dansKz.get(i) || []).includes(id)); const m = a => a.reduce((s, x) => s + x[1], 0) / Math.max(1, a.length), sd = a => { const mu = m(a); return Math.sqrt(a.reduce((s, x) => s + (x[1] - mu) ** 2, 0) / Math.max(1, a.length - 1)); };
      const nD = dans.length, nH = hors.length, md = m(dans), mh = m(hors), se = Math.sqrt(sd(dans) ** 2 / Math.max(1, nD) + sd(hors) ** 2 / Math.max(1, nH)), z = se ? (md - mh) / se : 0, pv = 2 * (1 - phi(Math.abs(z)));
      const c = { n: nD, assez: nD >= 30, moyenne: md, ic: [md - 1.96 * sd(dans) / Math.sqrt(Math.max(1, nD)), md + 1.96 * sd(dans) / Math.sqrt(Math.max(1, nD))], base: mh, rapport: mh ? md / mh : null, pBrut: pv }; sortie.killzones[id][fen] = c; if (nD >= 30) cellules.push({ type: 'kz', f: id, fen, N: 0, cel: c }); } }
  const ord = cellules.slice().sort((a, b) => a.cel.pBrut - b.cel.pBrut), m = ord.length; let mx = 0;
  ord.forEach((c, r) => { mx = Math.max(mx, Math.min(1, (m - r) * c.cel.pBrut)); c.cel.pHolm = mx; const sup = c.type === 'zone' ? c.cel.taux > c.cel.base : c.type === 'dir' ? c.cel.part > c.cel.basePart : c.cel.moyenne > c.cel.base; c.cel.distingue = c.cel.pHolm < 0.05 ? (sup ? 'mieux' : 'moins bien') : 'non'; });
  sortie.nEssais = m; fs.writeFileSync(new URL('../front/or/ict-stats.json', import.meta.url), JSON.stringify(sortie));
  const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %'), L = ['# ICT v1 : statistiques réelles (local)', '', `Module scellé ${sortie.sha256_module.slice(0, 16)}… · ${sortie.source} · calculé le ${sortie.calcule}. Holm sur ${m} essais (n ≥ 30). Zones : « tient » = le prix s'éloigne de 0,5 ATR du bon côté avant de dépasser la zone de 0,25 ATR, au premier retour (48 bougies), contre des zones de même largeur placées au hasard du même côté. Directionnels : part des issues tranchées (+1,5 ATR avant −1,5 ATR) contre la même part sur toutes les bougies (la volatilité du moment gonfle les deux barrières). Killzones : étendue moyenne de la bougie en ATR contre toutes les autres.`, ''];
  L.push('## Zones', '| famille | fenêtre | événements | retours | tient | base (zones au hasard) | verdict |', '|---|---|---|---|---|---|---|');
  for (const f of fams) for (const fen of ['recent', 'long']) { const c = sortie.zones[f][fen]; L.push(`| ${f} | ${fen === 'recent' ? '18 mois' : '2015–2025'} | ${c.n} | ${c.nTouches}${c.assez ? '' : ' (< 30)'} | ${c.assez ? pc(c.taux) : 'pas assez de données'} | ${c.assez ? pc(c.base) : '—'} | ${c.assez ? (c.distingue === 'mieux' ? 'MIEUX que le hasard' : c.distingue === 'moins bien' ? 'moins bien que le hasard' : 'pas de différence nette') : '—'} |`); }
  L.push('', '## Événements directionnels (12 bougies)', '| famille | fenêtre | n | issues tranchées | part favorable | base | verdict |', '|---|---|---|---|---|---|---|');
  for (const f of fd) for (const fen of ['recent', 'long']) { const c = sortie.directionnels[f][fen], h = c.h12; L.push(`| ${f} | ${fen === 'recent' ? '18 mois' : '2015–2025'} | ${c.n} | ${h.nTranches} | ${c.assez ? pc(h.part) : 'pas assez de données'} | ${c.assez ? pc(h.basePart) : '—'} | ${c.assez ? (h.distingue === 'mieux' ? 'MIEUX que le hasard' : h.distingue === 'moins bien' ? 'moins bien que le hasard' : 'pas de différence nette') : '—'} |`); }
  L.push('', '## Killzones (étendue moyenne en ATR)', '| killzone | fenêtre | n | moyenne | base (hors killzone) | rapport | verdict |', '|---|---|---|---|---|---|---|');
  for (const id of ids) for (const fen of ['recent', 'long']) { const c = sortie.killzones[id][fen]; L.push(`| ${id} | ${fen === 'recent' ? '18 mois' : '2015–2025'} | ${c.n} | ${c.moyenne.toFixed(2)} | ${c.base.toFixed(2)} | ${c.rapport ? c.rapport.toFixed(2) : '—'} | ${c.distingue === 'mieux' ? 'plus volatile' : c.distingue === 'moins bien' ? 'moins volatile' : 'pas de différence nette'} |`); }
  const dist = cellules.filter(c => c.cel.distingue !== 'non'); L.push('', `## Ce qui se distingue du hasard (Holm < 5 %) : ${dist.length} cellule(s) sur ${m}`, ...dist.map(c => `- ${c.type} · ${c.f} · ${c.fen}${c.N ? ' · ' + c.N + ' bougies' : ''} → ${c.cel.distingue}`));
  fs.writeFileSync(new URL('./RAPPORT-ICT-OR.md', import.meta.url), L.join('\n')); console.log(`événements : zones ${E.zones.length}, directionnels ${E.dir.length} ; essais ${m} ; distincts ${dist.length} ; ${(Date.now() - t00) / 1000} s`); console.log(L.slice(-Math.min(40, dist.length + 3)).join('\n'));
}
