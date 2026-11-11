/* ÉTUDE « TENDANCE DAILY » : cassure de canal de N jours, sortie par stop suiveur 3 ATR(20) ou canal N/2, 10 actifs, quelques trades par an.
   Règles : tendance-regles.json (figées, SHA-256 vérifié). Réutilise stats.mjs (Holm, prng) ; n'utilise ni simulateur.mjs (H1/M15) ni prop.mjs (challenge) : pas de duplication, la mécanique daily est ici.
   Protocole : `node tendance-etude.mjs etape1` (N par actif sur 2012-2019, validation 2020-2023, données COUPÉES fin 2023 : le test final n'est pas chargé)
               puis, UNE fois, `node tendance-etude.mjs final` (test 2024-2026, 2021-2026, rapport). */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { holm, prng } from './stats.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), lire = f => fs.readFileSync(path.join(ici, f), 'utf8');
const brut = lire('tendance-regles.json').replace(/\r\n/g, '\n'), sceau = JSON.parse(lire('tendance-regles.sceau.json'));
if (crypto.createHash('sha256').update(brut).digest('hex') !== sceau.sha256) { console.error('Les règles ont changé depuis leur figeage : arrêt.'); process.exit(1); }
const REG = JSON.parse(brut), etape = process.argv[2]; if (!['etape1', 'final'].includes(etape)) { console.error('usage : etape1 | final'); process.exit(1); }
const F1 = path.join(ici, 'resultats-tendance-etape1.json'); if (etape === 'final' && !fs.existsSync(F1)) { console.error('Faire d\'abord etape1.'); process.exit(1); }
const IDS = Object.keys(REG.actifs), NS = REG.signaux.N_possibles, RISQ = REG.risque.risque_par_trade, CAP_DEV = REG.risque.plafond_net_par_devise, BUDGET = REG.risque.budget_risque_total, CAP_BLOC = REG.risque.plafond_bloc_correle_part_du_budget * BUDGET;
const FIN = etape === 'etape1' ? 2023 : 9999, DEB_ETUDE = 2012;
/* ── données ── */
const ouvert = b => !(b[2] === b[3] && !b[5]);
function charger(id) {
  let R = JSON.parse(lire(`donnees/daily-${id}.json`)).filter(ouvert); R = R.slice(0, -1);   // dernier jour incomplet retiré
  const B = R.map(b => { const d = new Date(b[0] + 4 * 3600e3); return { t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], an: d.getUTCFullYear(), date: d.toISOString().slice(0, 10) }; }).filter(b => b.an <= FIN);
  const n = B.length, A = new Array(n).fill(null), tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c));
  for (let i = 20; i < n; i++) { let s = 0; for (let k = i - 19; k <= i; k++) s += tr(k); A[i] = s / 20; }
  return { id, B, A, n };
}
const D = Object.fromEntries(IDS.map(id => [id, charger(id)]));
const cout = (id, px) => { const c = REG.couts[id]; return c.fixe != null ? c.fixe : c.pct * px; };
/* ── un trade depuis une entrée à l'ouverture du jour e (signal à la clôture de e-1) ── */
function essai(X, e, dir, N) {
  const { B, A, n } = X, a = A[e - 1]; if (a == null || e >= n) return null; const nh = Math.floor(N / 2), entree = B[e].o, risque = 3 * a; let stop = entree - dir * risque, best = entree;
  for (let k = e; k < n; k++) {
    const b = B[k];
    if (dir > 0 ? b.l <= stop : b.h >= stop) { const px = dir > 0 ? Math.min(stop, b.o) : Math.max(stop, b.o); return fin(X, e, k, dir, entree, risque, px, false, false); }
    best = dir > 0 ? Math.max(best, b.c) : Math.min(best, b.c); if (A[k] != null) { const ns = best - dir * 3 * A[k]; stop = dir > 0 ? Math.max(stop, ns) : Math.min(stop, ns); }
    if (k - nh >= 0) { let ext = dir > 0 ? Infinity : -Infinity; for (let q = k - nh; q <= k - 1; q++) ext = dir > 0 ? Math.min(ext, B[q].l) : Math.max(ext, B[q].h);
      if (dir > 0 ? b.c < ext : b.c > ext) { if (k + 1 >= n) return fin(X, e, k, dir, entree, risque, b.c, true, true); return fin(X, e, k + 1, dir, entree, risque, B[k + 1].o, true, false); } }
  }
  return fin(X, e, n - 1, dir, entree, risque, B[n - 1].c, false, true);
}
const fin = (X, e, i1, dir, entree, risque, px, ouv, encours) => ({ e, i1, dir, R0: dir * (px - entree) / risque, costR: cout(X.id, entree) / risque, ouv, encours, entree, risque });
function signal(X, i, N) { if (i < N || i < 21) return 0; const { B } = X; let hi = -Infinity, lo = Infinity; for (let k = i - N; k <= i - 1; k++) { hi = Math.max(hi, B[k].h); lo = Math.min(lo, B[k].l); } return B[i].c > hi ? 1 : B[i].c < lo ? -1 : 0; }
/* stratégie seule sur un actif (toutes les entrées, sans plafonds) */
function strategie(X, N) {
  const T = []; let t = 21; while (t < X.n - 1) { const s = signal(X, t, N); if (!s) { t++; continue; } const r = essai(X, t + 1, s, N); if (!r) break; T.push({ ...r, an: X.B[t + 1].an, date: X.B[t + 1].date }); if (r.encours) break; t = Math.max(r.i1, t + 1); }
  return T.filter(r => !r.encours);
}
/* ── statistiques ── */
const fen = ([a, b]) => r => r.an >= a && r.an <= b, net = (r, m) => r.R0 - r.costR * m;
function annees(X, [a, b]) { const d0 = Math.max(Date.UTC(a, 0, 1), Date.parse(X.B[Math.min(X.n - 1, 21)].date)), d1 = Math.min(Date.UTC(b + 1, 0, 1), Date.parse(X.B[X.n - 1].date)); return Math.max(0.01, (d1 - d0) / 86400e3 / 365.25); }
function stats(T, m, ans) {
  const n = T.length, R = T.map(r => net(r, m)), g = R.filter(x => x > 0), p = R.filter(x => x <= 0); let c = 0, pic = 0, dd = 0; for (const x of R) { c += x; pic = Math.max(pic, c); dd = Math.min(dd, c - pic); }
  return { n, parAn: ans ? n / ans : null, reussite: n ? g.length / n : null, gainMoyen: g.length ? g.reduce((s, x) => s + x, 0) / g.length : null, perteMoyenne: p.length ? p.reduce((s, x) => s + x, 0) / p.length : null, esperance: n ? R.reduce((s, x) => s + x, 0) / n : null, pireBaisseR: dd };
}
const detail = (T, X, f, ans) => { const L = T.filter(fen(f)), o = { tous: stats(L, 1, ans), stress: stats(L, REG.couts.stress, ans), achats: stats(L.filter(r => r.dir > 0), 1, ans), ventes: stats(L.filter(r => r.dir < 0), 1, ans) }; return o; };
/* ── choix de N sur la calibration ── */
const choixN = {}; const calib = REG.decoupage.calibration;
if (etape === 'etape1') { for (const id of IDS) { const X = D[id], essais = {}; let meilleur = null; for (const N of NS) { const T = strategie(X, N).filter(fen(calib)); const s = stats(T, 1, 1); essais[N] = { n: s.n, esperance: s.esperance }; if (s.n >= REG.signaux.calibration_minimum_trades && (meilleur == null || s.esperance > essais[meilleur].esperance)) meilleur = N; }
    choixN[id] = { N: meilleur ?? REG.signaux.N_defaut_si_calibration_insuffisante, defaut: meilleur == null, essais }; } }
else Object.assign(choixN, JSON.parse(fs.readFileSync(F1, 'utf8')).choixN);
/* ── caches pour le contrôle aléatoire et le portefeuille ── */
const cache = {}; for (const id of IDS) { const X = D[id], N = choixN[id].N, L = new Array(X.n).fill(null), S = new Array(X.n).fill(null); for (let e = 22; e < X.n - 1; e++) { const l = essai(X, e, 1, N), s = essai(X, e, -1, N); if (l && !l.encours) L[e] = l; if (s && !s.encours) S[e] = s; } cache[id] = { L, S, T: strategie(X, N) }; }
function controle(periode, minTrades = 30) {
  const rnd = prng(REG.controle.graine + periode[0]), out = {}, pool = {}, tir = REG.controle.tirages, moyAct = {}, nAct = {}; let sPool = 0, nPool = 0;
  for (const id of IDS) { const X = D[id], T = cache[id].T.filter(fen(periode)); nAct[id] = { l: T.filter(r => r.dir > 0).length, s: T.filter(r => r.dir < 0).length }; moyAct[id] = T.length ? T.reduce((s, r) => s + net(r, 1), 0) / T.length : null;
    const dispo = (arr) => { const v = []; for (let e = 22; e < X.n - 1; e++) if (arr[e] && X.B[e].an >= periode[0] && X.B[e].an <= periode[1]) v.push(net(arr[e], 1)); return v; }; pool[id] = { L: dispo(cache[id].L), S: dispo(cache[id].S) }; }
  const sommes = IDS.map(() => new Float64Array(tir)); const pooled = new Float64Array(tir); let nTot = 0;
  IDS.forEach((id, j) => { const { l, s } = nAct[id], P = pool[id]; if (l + s === 0 || (l && !P.L.length) || (s && !P.S.length)) return; nTot += l + s; for (let k = 0; k < tir; k++) { let t = 0; for (let q = 0; q < l; q++) t += P.L[Math.floor(rnd() * P.L.length)]; for (let q = 0; q < s; q++) t += P.S[Math.floor(rnd() * P.S.length)]; sommes[j][k] = t; pooled[k] += t; } });
  const res = {}, ps = [], ids = [];
  IDS.forEach((id, j) => { const n = nAct[id].l + nAct[id].s; if (n < minTrades || moyAct[id] == null) { res[id] = { n, p: null }; return; } const m = Array.from(sommes[j], x => x / n).sort((a, b) => a - b), plus = m.filter(x => x >= moyAct[id]).length; res[id] = { n, p: (plus + 1) / (tir + 1), moyenneAleatoire: m.reduce((s, x) => s + x, 0) / tir, p95: m[Math.floor(0.95 * tir)] }; ps.push(res[id].p); ids.push(id); });
  const adj = holm(ps); ids.forEach((id, k) => { res[id].pHolm = adj[k]; });
  let sStrat = 0; for (const id of IDS) sStrat += (moyAct[id] ?? 0) * (nAct[id].l + nAct[id].s);
  const mp = nTot ? Array.from(pooled, x => x / nTot).sort((a, b) => a - b) : null, moyStrat = nTot ? sStrat / nTot : null;
  res.__pool = mp && nTot >= minTrades ? { n: nTot, p: (mp.filter(x => x >= moyStrat).length + 1) / (tir + 1), moyenneAleatoire: mp.reduce((s, x) => s + x, 0) / tir, p95: mp[Math.floor(0.95 * tir)], moyenneStrategie: moyStrat } : { n: nTot, p: null };
  return res;
}
/* ── portefeuille : plafonds par devise et par bloc, taille = 0,5 % du capital courant ── */
function portefeuille(m) {
  const dates = new Set(); for (const id of IDS) for (const b of D[id].B) if (b.an >= DEB_ETUDE) dates.add(b.date); const J = [...dates].sort();
  const idx = Object.fromEntries(IDS.map(id => [id, new Map(D[id].B.map((b, i) => [b.date, i]))])), libre = Object.fromEntries(IDS.map(id => [id, ''])), signaux = {};
  for (const id of IDS) { const N = choixN[id].N; signaux[id] = new Int8Array(D[id].n); for (let i = 22; i < D[id].n; i++) signaux[id][i] = signal(D[id], i, N); }
  let reel = REG.risque.capital_depart, ouverts = [], trades = [], bloques = 0, pic = reel, serie = []; const eq = [];
  for (const d of J) {
    const realiser = tr => { reel += tr.riskUSD * (tr.R0 - tr.costR * m); trades.push({ id: tr.id, an: tr.an, date: tr.date, dir: tr.dir, R0: tr.R0, costR: tr.costR, sortie: d }); };
    ouverts = ouverts.filter(tr => { if (tr.sortieDate <= d && tr.alOuverture) { realiser(tr); return false; } return true; });
    for (const id of IDS) { const e = idx[id].get(d); if (e == null || libre[id] > d || ouverts.some(o => o.id === id)) continue; if (!signaux[id][e - 1]) continue; const dir = signaux[id][e - 1], r = (dir > 0 ? cache[id].L : cache[id].S)[e]; if (!r) continue;
      const cfg = REG.actifs[id], tot = ouverts.length * RISQ + RISQ; if (tot > BUDGET + 1e-12) { bloques++; continue; }
      const bloc = ouverts.filter(o => REG.actifs[o.id].bloc === cfg.bloc).length * RISQ + RISQ; if (bloc > CAP_BLOC + 1e-12) { bloques++; continue; }
      const net = {}; for (const o of ouverts) { const c = REG.actifs[o.id]; net[c.base] = (net[c.base] || 0) + o.dir * RISQ; net[c.quote] = (net[c.quote] || 0) - o.dir * RISQ; } net[cfg.base] = (net[cfg.base] || 0) + dir * RISQ; net[cfg.quote] = (net[cfg.quote] || 0) - dir * RISQ;
      if (Math.abs(net[cfg.base]) > CAP_DEV + 1e-12 || Math.abs(net[cfg.quote]) > CAP_DEV + 1e-12) { bloques++; continue; }
      const eqNow = eq.length ? eq[eq.length - 1].v : reel, X = D[id], sortieDate = X.B[r.i1].date; ouverts.push({ id, dir, e, R0: r.R0, costR: r.costR, riskUSD: RISQ * eqNow, entree: r.entree, risque: r.risque, an: X.B[e].an, date: d, sortieDate, alOuverture: r.i1 > e && Math.abs(0) === 0 && sortieALOuverture(X, r) }); libre[id] = sortieDate; }
    ouverts = ouverts.filter(tr => { if (tr.sortieDate <= d && !tr.alOuverture) { realiser(tr); return false; } return true; });
    let mtm = 0; for (const tr of ouverts) { const i = idx[tr.id].get(d), px = i != null ? D[tr.id].B[i].c : D[tr.id].B[tr.derniere ?? tr.e].c; if (i != null) tr.derniere = i; mtm += tr.riskUSD * (tr.dir * (px - tr.entree) / tr.risque - tr.costR * m); }
    eq.push({ d, v: reel + mtm });
  }
  return { trades, eq, bloques, final: eq.length ? eq[eq.length - 1].v : reel };
}
/* sortie à l'ouverture d'un jour (canal N/2) plutôt qu'en cours de séance : le cours de sortie est exactement l'ouverture de la bougie de sortie */
const sortieALOuverture = (X, r) => Math.abs((X.B[r.i1].o - r.entree) * r.dir / r.risque - r.R0) < 1e-9;
function statPort(P, periode, m) {
  const T = P.trades.filter(fen(periode)), ans = (Math.min(Date.parse(`${periode[1] + 1}-01-01`), Date.parse(P.eq[P.eq.length - 1].d)) - Math.max(Date.parse(`${periode[0]}-01-01`), Date.parse(P.eq[0].d))) / 86400e3 / 365.25;
  const L = P.eq.filter(q => +q.d.slice(0, 4) >= periode[0] && +q.d.slice(0, 4) <= periode[1]); let pic = -Infinity, dd = 0; for (const q of L) { pic = Math.max(pic, q.v); dd = Math.min(dd, q.v / pic - 1); }
  const s = (X, ms) => stats(X, ms, ans); return { tous: s(T, m), achats: s(T.filter(r => r.dir > 0), m), ventes: s(T.filter(r => r.dir < 0), m), pireBaissePct: dd, rendementPct: L.length ? L[L.length - 1].v / L[0].v - 1 : null };
}
/* ── analyse d'une période ── */
function periode(nom, per) {
  const cs = controle(per), o = { nom, per, actifs: {}, portefeuille: {} };
  for (const id of IDS) { const ans = annees(D[id], per), d = detail(cache[id].T, D[id], per, ans), c = cs[id], n = d.tous.n;
    const verdict = n < 30 ? 'pas assez de données' : c.pHolm < 0.05 && d.tous.esperance > 0 ? 'bat le hasard' : 'ne bat pas le hasard'; o.actifs[id] = { N: choixN[id].N, defaut: choixN[id].defaut, ...d, controle: c, verdict }; }
  const P1 = portefeuille(1), P2 = portefeuille(REG.couts.stress), sp = statPort(P1, per, 1), ss = statPort(P2, per, REG.couts.stress), pool = cs.__pool;
  o.portefeuille = { ...sp, stress: ss.tous, bloques: P1.bloques, controleGroupe: pool, verdict: sp.tous.n < 30 ? 'pas assez de données' : pool.p != null && pool.p < 0.05 && sp.tous.esperance > 0 ? 'bat le hasard' : 'ne bat pas le hasard' };
  return o;
}
const PER = etape === 'etape1' ? [['calibration 2012-2019', REG.decoupage.calibration], ['validation 2020-2023', REG.decoupage.validation]] : [['calibration 2012-2019', REG.decoupage.calibration], ['validation 2020-2023', REG.decoupage.validation], ['test final 2024-2026', REG.decoupage.test_final], ['2021-2026', REG.decoupage.rapport_2021_2026]];
const sortie = { version: REG.version, etape, calcule: new Date().toISOString().slice(0, 10), sha_regles: sceau.sha256, choixN, periodes: PER.map(([n, p]) => periode(n, p)) };
fs.writeFileSync(etape === 'etape1' ? F1 : path.join(ici, 'resultats-tendance-final.json'), JSON.stringify(sortie));
console.log(etape, 'terminé');
for (const p of sortie.periodes) { console.log('\n== ' + p.nom); for (const id of IDS) { const a = p.actifs[id]; console.log(id.padEnd(7), 'N', a.N, 'n', a.tous.n, 'R', a.tous.esperance?.toFixed(3), 'p', a.controle.pHolm?.toFixed(3) ?? '-', a.verdict); } const q = p.portefeuille; console.log('PORTEFEUILLE n', q.tous.n, 'R', q.tous.esperance?.toFixed(3), 'DD', (q.pireBaissePct * 100).toFixed(1) + '%', 'rend', (q.rendementPct * 100).toFixed(1) + '%', 'p groupé', q.controleGroupe.p?.toFixed(3), q.verdict); }
if (etape === 'final') fs.writeFileSync(path.join(ici, 'trades-tendance-final.json'), JSON.stringify(IDS.flatMap(id => cache[id].T.map(r => ({ id, date: r.date, an: r.an, dir: r.dir, R: net(r, 1), brut: r.R0 })))));   // liste des trades (même résultat que le rapport)
