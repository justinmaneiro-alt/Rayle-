/* STATISTIQUES RÉELLES de ma-evenements-v1 (Dukascopy XAU/USD, H1, SMA 200 H1) — STRATEGIE-RAYLE.md §3.
   1) Pour chaque événement (cassure, cassure confirmée, fausse cassure / réintégration, rebond), haussier et baissier : fréquence de continuation = +2 ATR avant −1 ATR dans les 12 bougies, comptée depuis
      la CLÔTURE de la bougie de l'événement (les bougies suivantes seulement), IC de Wilson, n, base (même mesure sur toutes les bougies, même sens) ; part des issues tranchées (corrige l'effet de la volatilité du moment).
   2) Classification des cassures à leur clôture : pour chaque classe de chacune des six caractéristiques, et chaque paire de classes : fréquence de continuation et part de cassures qui deviennent « vraies ».
   3) Test de gestion (stop 1,5 ATR, équilibre après +1 R, stop suiveur 3 ATR, frais Kraken et CFD) de « rebond sur MA » et « fausse cassure / réintégration » contre 1 000 entrées au hasard, achats et ventes séparés.
   Séparément sur les 18 derniers mois et sur 2015–2025. n < 30 = « pas assez de données ». Écrit front/or/ma-stats.json et RAPPORT-MA-OR.md (local). */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { charger } from './donnees.mjs'; import * as M from '../front/or/ma-evenements-v1.js'; import { prng } from './stats.mjs';
const D_ = () => charger({ debut: 2014, fin: 2026 });
const H = 3600e3, FEN = { recent: [Date.UTC(2025, 4, 1), Infinity], long: [Date.UTC(2015, 0, 1), Date.UTC(2026, 0, 1)] };
const ouvert = b => !(b.h === b.l && !b.v);   // 29 % des bougies Dukascopy sont des bougies plates de week-end (volume nul) : retirées, elles dilueraient l'ATR
const H1 = D_().h1.filter(ouvert), B = H1.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })), SP = H1.map(b => b.sp), n = B.length;
const R = M.analyser(B), A = R.atr, ev = R.events;
const sha = crypto.createHash('sha256').update(fs.readFileSync(new URL('../front/or/ma-evenements-v1.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const dans = (t, f) => t >= FEN[f][0] && t < FEN[f][1];
// issue de continuation de chaque bougie dans chaque sens
const iss = { 1: new Int8Array(n), [-1]: new Int8Array(n) }, valide = new Uint8Array(n);
for (let i = 0; i < n - M.P.continuation.bougies; i++) { if (A[i] == null) continue; valide[i] = 1; iss[1][i] = M.issueContinuation(B, i, 1, A[i]); iss[-1][i] = M.issueContinuation(B, i, -1, A[i]); }
const base = {}; for (const f of Object.keys(FEN)) { base[f] = {}; for (const d of [1, -1]) { let m = 0, k = 0, adv = 0; for (let i = 0; i < n; i++) if (valide[i] && dans(B[i].t, f)) { m++; if (iss[d][i] === 1) k++; else if (iss[d][i] === -1) adv++; } base[f][d] = { m, taux: m ? k / m : null, part: k + adv ? k / (k + adv) : null }; } }
function cellule(liste, f) {
  const L = liste.filter(e => dans(e.t, f) && valide[e.i]); const m = L.length; let k = 0, adv = 0, bT = 0, bP = 0;
  for (const e of L) { const s = iss[e.sens][e.i]; if (s === 1) k++; else if (s === -1) adv++; bT += base[f][e.sens].taux; bP += base[f][e.sens].part; }
  const dec = k + adv, c = { n: m, assez: m >= 30 }; if (!m) { c.verdict = 'pas assez de données'; return c; }
  c.k = k; c.taux = k / m; c.ic = M.wilson(k, m); c.base = bT / m; c.tranchees = dec; c.part = dec ? k / dec : null; c.icPart = dec ? M.wilson(k, dec) : null; c.basePart = bP / m;
  c.verdict = !c.assez ? 'pas assez de données' : c.icPart && c.icPart[0] > c.basePart + 0.05 ? 'au-dessus de la base' : c.icPart && c.icPart[1] < c.basePart - 0.05 ? 'en dessous de la base' : 'pas nettement différent de la base';
  return c;
}
// événements avec le sens de continuation attendu : cassure / confirmée = sens de la cassure ; fausse = sens du retour (e.dir) ; rebond = e.dir
const parType = { cassure: [], cassure_confirmee: [], cassure_fausse: [], rebond: [] };
for (const e of ev) { const o = { ...e, sens: e.dir }; if (e.type === 'cassure') parType.cassure.push(o); else if (e.type === 'confirmee') parType.cassure_confirmee.push(o); else if (e.type === 'fausse') parType.cassure_fausse.push(o); else if (e.type === 'rebond') parType.rebond.push(o); }
const sortie = { version: M.VERSION, sha256: sha, calcule: new Date().toISOString().slice(0, 10), source: 'Dukascopy XAU/USD (bid), H1, SMA 200 H1', fenetres: { recent: "2025-05-01 → aujourd'hui (18 mois)", long: '2015–2025' }, mesure: '+2 ATR avant −1 ATR en 12 bougies depuis la clôture de la bougie de l\'événement', nBougies: n, evenements: {}, classes: {}, gestion: {}, comptes: {} };
for (const [type, L] of Object.entries(parType)) { sortie.evenements[type] = {}; for (const [nom, d] of [['haussier', 1], ['baissier', -1]]) { const S = L.filter(e => e.sens === d); sortie.evenements[type][nom] = { recent: cellule(S, 'recent'), long: cellule(S, 'long') }; } sortie.comptes[type] = L.length; }
// classification des cassures : le sens de continuation est celui de la cassure ; « vraie » = la cassure est confirmée avant d'être réintégrée
const issueCas = new Map(); for (const e of ev) if (e.ref && ['confirmee', 'fausse', 'expiree'].includes(e.type)) issueCas.set(e.ref, e.type);
const cassures = parType.cassure.filter(e => e.profil).map(e => ({ ...e, vraie: issueCas.get(e.id) === 'confirmee', tranche: issueCas.has(e.id) && issueCas.get(e.id) !== 'expiree' }));
function celVraie(L, f) { const S = L.filter(e => dans(e.t, f) && e.tranche); const k = S.filter(e => e.vraie).length; return { n: S.length, assez: S.length >= 30, taux: S.length ? k / S.length : null, ic: S.length ? M.wilson(k, S.length) : null }; }
const CAR = M.CARACTERISTIQUES, classesDe = c => [...new Set(cassures.map(e => e.profil[c]))].sort();
const stockerClasse = (cle, L) => { const o = { recent: cellule(L, 'recent'), long: cellule(L, 'long'), vraie: { recent: celVraie(L, 'recent'), long: celVraie(L, 'long') } }; if (o.recent.n >= 15 || o.long.n >= 15) sortie.classes[cle] = o; };
stockerClasse('toutes', cassures);
for (const c of CAR) for (const v of classesDe(c)) stockerClasse(`${c}=${v}`, cassures.filter(e => e.profil[c] === v));
for (let a = 0; a < CAR.length; a++) for (let b = a + 1; b < CAR.length; b++) for (const va of classesDe(CAR[a])) for (const vb of classesDe(CAR[b])) stockerClasse(`${CAR[a]}=${va} & ${CAR[b]}=${vb}`, cassures.filter(e => e.profil[CAR[a]] === va && e.profil[CAR[b]] === vb));
// ── test de gestion ──
const GESTION = { winsorisation: 'R plafonné à [−5 ; +10]', stopAtr: 1.5, equilibreR: 1, suiveurAtr: 3, maxBougies: 48, kraken: 'frais 0,05 % du notionnel (0,1 % aller-retour) + écart acheteur/vendeur observé', cfd: '1,5 × l\'écart acheteur/vendeur observé (aucune commission)' };
function tradeR(i, d) {
  const a = A[i]; if (a == null || i + 1 >= n) return null; const entree = B[i].c, risque = GESTION.stopAtr * a; let stop = entree - d * risque, fav = 0, be = false, sortie_ = null;
  for (let k = i + 1; k <= Math.min(n - 1, i + GESTION.maxBougies); k++) {
    const b = B[k]; const touche = d > 0 ? b.l <= stop : b.h >= stop;
    if (touche) { sortie_ = stop; break; }
    fav = Math.max(fav, d > 0 ? b.h - entree : entree - b.l);
    if (!be && fav >= GESTION.equilibreR * risque) { be = true; stop = entree; }
    if (be) { const suiv = entree + d * (fav - GESTION.suiveurAtr * a); if (d > 0 ? suiv > stop : suiv < stop) stop = suiv; }
    if (k === Math.min(n - 1, i + GESTION.maxBougies)) sortie_ = b.c;
  }
  if (sortie_ == null) return null;
  const brut = d * (sortie_ - entree) / risque, sp = SP[i] || 0.4, krakenR = (0.001 * entree + sp) / risque, cfdR = (1.5 * sp) / risque;
  const cap = x => Math.max(-5, Math.min(10, x));   // winsorisation à [−5 R ; +10 R] : une bougie à ATR minuscule (heures creuses) ferait exploser les frais en R et les moyennes
  const r = { brut: cap(brut), kraken: cap(brut - krakenR), cfd: cap(brut - cfdR) }; return Number.isFinite(r.brut) && Number.isFinite(r.kraken) && Number.isFinite(r.cfd) ? r : null;   // une bougie incomplète dans les données : écartée
}
const rb = { 1: new Array(n).fill(null), [-1]: new Array(n).fill(null) }; for (let i = 0; i < n - GESTION.maxBougies - 1; i++) { if (A[i] == null) continue; rb[1][i] = tradeR(i, 1); rb[-1][i] = tradeR(i, -1); }
const g = prng(20261111), moy = a => a.reduce((s, x) => s + x, 0) / (a.length || 1), pct = (v, p) => { const s = v.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function testGestion(L, d, f) {
  const S = L.filter(e => e.sens === d && dans(e.t, f) && rb[d][e.i]); const out = { n: S.length, assez: S.length >= 30 }; if (!S.length) return out;
  const pool = []; for (let i = 0; i < n; i++) if (rb[d][i] && dans(B[i].t, f)) pool.push(i);
  for (const cle of ['brut', 'kraken', 'cfd']) {
    const m = moy(S.map(e => rb[d][e.i][cle])); const tir = []; let sup = 0;
    for (let q = 0; q < 1000; q++) { let s = 0; for (let k = 0; k < S.length; k++) s += rb[d][pool[Math.floor(g() * pool.length)]][cle]; tir.push(s / S.length); if (s / S.length >= m) sup++; }
    out[cle] = { moyenneR: m, hasard: { moyenneR: moy(tir), p5: pct(tir, 0.05), p95: pct(tir, 0.95) }, rangHasard: sup / 1000, gagnants: S.filter(e => rb[d][e.i][cle] > 0).length / S.length };
  }
  const k = out.kraken, c = out.cfd; out.verdict = !out.assez ? 'pas assez de données' : (k.moyenneR > k.hasard.p95 && k.moyenneR > 0) ? 'avantage mesuré (Kraken)' : (c.moyenneR > c.hasard.p95 && c.moyenneR > 0) ? 'avantage mesuré (CFD seulement)' : (k.moyenneR > k.hasard.p95 || c.moyenneR > c.hasard.p95) ? 'moins mauvais que le hasard mais perdant après frais : aucun avantage démontré' : 'aucun avantage démontré'; return out;
}
sortie.gestion = { regles: GESTION, tirages: 1000 };
for (const [nom, L] of [['rebond', parType.rebond], ['fausse_cassure', parType.cassure_fausse]]) { sortie.gestion[nom] = {}; for (const [sn, d] of [['achat', 1], ['vente', -1]]) { sortie.gestion[nom][sn] = {}; for (const f of Object.keys(FEN)) sortie.gestion[nom][sn][f] = testGestion(L, d, f); } }
fs.writeFileSync(new URL('../front/or/ma-stats.json', import.meta.url), JSON.stringify(sortie));
// ── rapport local ──
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %'), L = [];
L.push(`# Moyenne mobile (SMA 200 H1) — statistiques réelles`, '', `Dukascopy XAU/USD H1, ${n} bougies. Règle ${M.VERSION} (SHA-256 ${sha.slice(0, 12)}…). Calculé le ${sortie.calcule}. Mesure : ${sortie.mesure}.`, '');
L.push('## Événements', '', '| événement | sens | fenêtre | n | continuation | IC 95 % | base | part tranchée | base | verdict |', '|---|---|---|---|---|---|---|---|---|---|');
for (const [t, o] of Object.entries(sortie.evenements)) for (const [s, q] of Object.entries(o)) for (const f of ['long', 'recent']) { const c = q[f]; L.push(`| ${t} | ${s} | ${f} | ${c.n} | ${pc(c.taux)} | ${c.ic ? pc(c.ic[0]) + '–' + pc(c.ic[1]) : '—'} | ${pc(c.base)} | ${pc(c.part)} | ${pc(c.basePart)} | ${c.verdict || '—'} |`); }
L.push('', `## Classification des cassures (${cassures.length} cassures) — cellules avec n ≥ 15`, '', '| classe | fenêtre | n | continuation | base | part tranchée | base | verdict | devient vraie (n) |', '|---|---|---|---|---|---|---|---|---|');
for (const [k, o] of Object.entries(sortie.classes)) if (!k.includes('&')) for (const f of ['long', 'recent']) { const c = o[f], vr = o.vraie[f]; L.push(`| ${k} | ${f} | ${c.n} | ${pc(c.taux)} | ${pc(c.base)} | ${pc(c.part)} | ${pc(c.basePart)} | ${c.verdict || '—'} | ${pc(vr.taux)} (${vr.n}) |`); }
const nPaires = Object.keys(sortie.classes).filter(k => k.includes('&')).length, dist = Object.entries(sortie.classes).filter(([k, o]) => k.includes('&') && ['long', 'recent'].every(f => o[f].verdict && o[f].verdict !== 'pas assez de données' && o[f].verdict !== 'pas nettement différent de la base' && o[f].verdict === o.long.verdict));
L.push('', `Paires de classes : ${nPaires} cellules testées (n ≥ 15) ; ${dist.length} se distinguent de la base sur les DEUX fenêtres (avec autant de cellules, quelques-unes le font par hasard : lecture prudente).`); for (const [k, o] of dist.slice(0, 20)) L.push(`- ${k} : ${o.long.verdict} (long n = ${o.long.n}, ${pc(o.long.part)} contre ${pc(o.long.basePart)} ; récent n = ${o.recent.n})`);
L.push('', '## Test de gestion contre 1 000 entrées au hasard', '', `Règles : stop ${GESTION.stopAtr} ATR, équilibre après +${GESTION.equilibreR} R, stop suiveur ${GESTION.suiveurAtr} ATR, sortie au plus tard après ${GESTION.maxBougies} bougies. Kraken : ${GESTION.kraken}. CFD : ${GESTION.cfd}.`, '', '| règle | sens | fenêtre | n | R moyen brut | R net Kraken | R net CFD | hasard Kraken (moy. [p5–p95]) | rang | verdict |', '|---|---|---|---|---|---|---|---|---|---|');
for (const [nom, o] of Object.entries(sortie.gestion)) if (nom !== 'regles' && nom !== 'tirages') for (const [s, q] of Object.entries(o)) for (const f of ['long', 'recent']) { const c = q[f]; if (!c.kraken) { L.push(`| ${nom} | ${s} | ${f} | ${c.n} | — | — | — | — | — | pas assez de données |`); continue; } L.push(`| ${nom} | ${s} | ${f} | ${c.n} | ${c.brut.moyenneR.toFixed(3)} | ${c.kraken.moyenneR.toFixed(3)} | ${c.cfd.moyenneR.toFixed(3)} | ${c.kraken.hasard.moyenneR.toFixed(3)} [${c.kraken.hasard.p5.toFixed(3)} ; ${c.kraken.hasard.p95.toFixed(3)}] | ${c.kraken.rangHasard.toFixed(3)} | ${c.verdict} |`); }
fs.writeFileSync(new URL('./RAPPORT-MA-OR.md', import.meta.url), L.join('\n') + '\n');
console.log(L.join('\n'));
