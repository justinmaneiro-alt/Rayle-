/* ÉTUDE DES PRÉCURSEURS + MESURES DE LA FAMILLE p (démarrage confirmé). Développement 2003–2014 et validation 2015–2019 seulement (2020–2025 jamais chargé ici).
   Mouvement = définition figée mouvements-v1 (4 à 6 bougies H1, ≥ 1,5 ATR). Pour chaque bougie b (clôturée), on regarde si un mouvement de sens d DÉMARRE dans les 6 bougies suivantes (b+1 … b+6).
   Conditions mesurées à la clôture de b seulement (rien du futur). Retenue = probabilité conditionnelle nettement au-dessus de la base (rapport ≥ 1,3 ET borne basse de Wilson 95 % > base) en développement ET en validation,
   avec correction de Bonferroni sur le nombre de conditions. Le calendrier économique historique n'est pas disponible gratuitement : seule une approximation (premier vendredi du mois = emploi US) est testée, étiquetée. */
import fs from 'node:fs';
import { charger } from './donnees.mjs'; import { construire } from './contexte.mjs'; import { SPECS, signaux } from './familles.mjs';
import { essai } from './simulateur.mjs'; import { resume, moyenne, ecart, phi, prng } from './stats.mjs';
import { detecter } from '../front/or/mouvements-v1.js';
const X = construire(charger({ debut: 2003, fin: 2019 })), n = X.n;
const B = X.t.map((t, i) => ({ t, o: X.o[i], h: X.h[i], l: X.l[i], c: X.c[i] }));
const mv = detecter(B, { seuilAtr: 1.5 }).moves; console.log('mouvements :', mv.length);
const cumul = { 1: new Int32Array(n + 8), '-1': new Int32Array(n + 8) }; for (const d of [1, -1]) { const s = new Uint8Array(n + 8); for (const m of mv) if (m.d === d) s[m.i0] = 1; for (let i = 0; i < n + 7; i++) cumul[d][i + 1] = cumul[d][i] + s[i]; }
const E = (b, d) => (b + 7 <= n ? (d === 0 ? (cumul[1][b + 7] - cumul[1][b + 1] + cumul[-1][b + 7] - cumul[-1][b + 1]) > 0 : (cumul[d][b + 7] - cumul[d][b + 1]) > 0) : null);
const wilson = (k, N) => { if (!N) return [0, 1]; const z = 1.96, p = k / N, c = (p + z * z / (2 * N)) / (1 + z * z / N), h = z * Math.sqrt(p * (1 - p) / N + z * z / (4 * N * N)) / (1 + z * z / N); return [c - h, c + h]; };
const premierVendredi = t => { const d = new Date(t); return d.getUTCDay() === 5 && d.getUTCDate() <= 7; };
// conditions : chaque fonction (b) -> null (condition non remplie) ou {d} (d = sens attendu, 0 = sans sens)
const A = i => X.atr[i];
const COND = [
  ['sweep_veille', b => { if (X.pdh[b] == null) return null; if (X.h[b] > X.pdh[b] && X.c[b] < X.pdh[b]) return { d: -1 }; if (X.l[b] < X.pdl[b] && X.c[b] > X.pdl[b]) return { d: 1 }; return null; }, 'bougie b balaie le plus haut/bas de la veille puis réintègre (sens attendu = retournement)'],
  ['touche_veille', b => { if (X.pdh[b] == null) return null; if (Math.abs(X.h[b] - X.pdh[b]) < 0.25 * A(b)) return { d: 0 }; if (Math.abs(X.l[b] - X.pdl[b]) < 0.25 * A(b)) return { d: 0 }; return null; }, 'bougie b touche (à 0,25 ATR) le plus haut/bas de la veille'],
  ['cassure_veille', b => { if (X.pdh[b] == null) return null; if (X.c[b] > X.pdh[b] && X.c[b - 1] <= X.pdh[b]) return { d: 1 }; if (X.c[b] < X.pdl[b] && X.c[b - 1] >= X.pdl[b]) return { d: -1 }; return null; }, 'clôture de b au-delà du plus haut/bas de la veille (sens = cassure)'],
  ['session_asie', b => (X.hr[b] < 7 ? { d: 0 } : null), 'b en séance asiatique (UTC 0–7)'], ['session_londres', b => (X.hr[b] >= 7 && X.hr[b] < 13 ? { d: 0 } : null), 'b en séance de Londres'], ['session_ny', b => (X.hr[b] >= 13 && X.hr[b] < 21 ? { d: 0 } : null), 'b en séance de New York'],
  ['ouverture_londres', b => (X.hr[b] === 6 || X.hr[b] === 7 ? { d: 0 } : null), 'b = dernière bougie asiatique ou première de Londres'], ['ouverture_ny', b => (X.hr[b] === 12 || X.hr[b] === 13 ? { d: 0 } : null), 'b juste avant / à l\'ouverture de New York'],
  ['compression', b => (A(b) < 0.7 * X.atr100[b] ? { d: 0 } : null), 'volatilité basse : ATR < 0,7 × sa moyenne sur 100'], ['nr7', b => { const r = k => X.h[k] - X.l[k]; for (let k = b - 6; k < b; k++) if (r(b) >= r(k)) return null; return { d: 0 }; }, 'bougie b la plus étroite des 7 dernières'],
  ['loin_vwap', b => { if (!X.vsd[b] || X.hr[b] < 3) return null; const z = (X.c[b] - X.vw[b]) / X.vsd[b]; return Math.abs(z) > 1.5 ? { d: -Math.sign(z) } : null; }, 'prix à plus de 1,5 écart-type du VWAP de séance (sens attendu = retour au VWAP)'],
  ['loin_sma200', b => { if (X.sma200[b] == null) return null; const z = (X.c[b] - X.sma200[b]) / A(b); return Math.abs(z) > 6 ? { d: -Math.sign(z) } : null; }, 'prix à plus de 6 ATR de la SMA200 H1 (sens attendu = retour)'],
  ['tendance_jour_haussiere', b => (X.tJour[b] > 0 ? { d: 1 } : null), 'tendance Jour haussière (sens attendu = hausse)'], ['tendance_jour_baissiere', b => (X.tJour[b] < 0 ? { d: -1 } : null), 'tendance Jour baissière (sens attendu = baisse)'],
  ['emploi_us_approx', b => (premierVendredi(X.t[b]) && X.hr[b] >= 11 && X.hr[b] <= 13 ? { d: 0 } : null), 'APPROXIMATION : 1er vendredi du mois, 11–13 h UTC (publication de l\'emploi américain)'],
  ['jour_lundi', b => (new Date(X.t[b]).getUTCDay() === 1 ? { d: 0 } : null), 'lundi'], ['jour_vendredi', b => (new Date(X.t[b]).getUTCDay() === 5 ? { d: 0 } : null), 'vendredi'],
  ['volume_fort_corps', b => (X.medVol20[b] != null && X.v[b] > 1.5 * X.medVol20[b] && Math.abs(X.c[b] - X.o[b]) >= A(b) ? { d: Math.sign(X.c[b] - X.o[b]) } : null), 'bougie b à gros volume de ticks (> 1,5 × médiane) et gros corps (≥ 1 ATR), sens attendu = celui de b']
];
const periodes = { dev: [2003, 2014], val: [2015, 2019] };
const dansP = (b, p) => X.an[b] >= periodes[p][0] && X.an[b] <= periodes[p][1];
const sortie = []; const nCond = COND.length;
for (const [nom, f, texte] of COND) {
  const r = { nom, texte };
  for (const p of ['dev', 'val']) {
    let k = 0, N = 0, kb = 0, Nb = 0; const Rn = [];
    for (let b = 250; b < n - 8; b++) {
      if (!dansP(b, p) || X.atr[b] == null) continue;
      const e0 = E(b, 0); if (e0 == null) continue; const c = f(b);
      // base : même type de sens (si le sens attendu existe, base = probabilité d'un mouvement de CE sens ; sinon, de n'importe quel sens)
      const dd = c ? c.d : 0; const ev = E(b, dd); if (c) { N++; if (ev) k++; if (dd !== 0) { const t = essai(X, b, dd, 1.5, 'fixe'); if (t) Rn.push(Math.min(t.Rc, t.Rk)); } }
    }
    // base globale, par sens attendu moyen : proportion de bougies b avec mouvement du même type
    const baseSens = { 0: 0, 1: 0, '-1': 0 }, nb = { 0: 0, 1: 0, '-1': 0 }; for (let b = 250; b < n - 8; b++) { if (!dansP(b, p) || X.atr[b] == null || E(b, 0) == null) continue; for (const d of [0, 1, -1]) { nb[d]++; if (E(b, d)) baseSens[d]++; } }
    r[p] = { N, k, prob: N ? k / N : 0, wil: wilson(k, N), baseAny: baseSens[0] / nb[0], baseUp: baseSens[1] / nb[1], baseDown: baseSens[-1] / nb[-1], R: resume(Rn) };
  }
  sortie.push(r);
}
// base à utiliser selon le sens de la condition (les conditions mélangent parfois les sens : on prend la base moyenne des sens)
for (const r of sortie) { for (const p of ['dev', 'val']) { const o = r[p]; const sensible = !['session_asie', 'session_londres', 'session_ny', 'ouverture_londres', 'ouverture_ny', 'compression', 'nr7', 'emploi_us_approx', 'jour_lundi', 'jour_vendredi', 'touche_veille'].includes(r.nom); o.base = sensible ? (o.baseUp + o.baseDown) / 2 : o.baseAny; o.lift = o.base ? o.prob / o.base : 0; const se = Math.sqrt(o.base * (1 - o.base) / Math.max(1, o.N)); o.pBinom = o.N ? 1 - phi((o.prob - o.base) / Math.max(se, 1e-9)) : 1; } r.retenue = ['dev', 'val'].every(p => r[p].N >= 100 && r[p].lift >= 1.3 && r[p].wil[0] > r[p].base && r[p].pBinom * nCond < 0.05); }
// ── famille p : démarrage confirmé (stop 1,5 ATR, sortie par temps), part du mouvement restante, probabilité de continuation, comparaison au hasard ──
const sp = SPECS.find(s => s.id === 'p2'), sigs = signaux(sp, X); const rnd = prng(424242);
const statP = (liste, de, a) => { const Rs = [], rest = [], tot = [], cont = []; for (const s of liste) { const i = s.i, an = X.an[i + 1]; if (an < de || an > a || i + 7 >= n || X.atr[i] == null) continue; const d = s.d, e = X.o[i + 1];
  const dep = d === 1 ? Math.min(X.l[i - 2], X.l[i - 1], X.l[i]) : Math.max(X.h[i - 2], X.h[i - 1], X.h[i]); let ext = d === 1 ? -Infinity : Infinity; for (let k = i + 1; k <= i + 6; k++) ext = d === 1 ? Math.max(ext, X.h[k]) : Math.min(ext, X.l[k]);
  const total = d * (ext - dep), reste = d * (ext - e); if (total > 0) { tot.push(total); rest.push(Math.max(0, reste)); }
  let bons = 0; for (let k = i + 1; k <= i + 3; k++) if (d * (X.c[k] - X.o[k]) > 0) bons++; cont.push(d * (X.c[i + 3] - X.c[i]) > 0 && bons >= 2 ? 1 : 0);
  const t = essai(X, i, d, 1.5, 'fixe'); if (t) Rs.push(Math.min(t.Rc, t.Rk)); } return { n: cont.length, partRestante: tot.length ? moyenne(rest) / moyenne(tot) : null, probContinuation: moyenne(cont), R: resume(Rs) }; };
const poolHasard = new Map(); for (let i = 250; i < n - 8; i++) { if (X.atr[i] == null) continue; const k = X.hr[i] * 3 + X.tJour[i] + 1; if (!poolHasard.has(k)) poolHasard.set(k, []); poolHasard.get(k).push(i); }
const hasardP = (liste, de, a) => { const tir = []; for (let b = 0; b < 200; b++) { const L = []; for (const s of liste) { if (X.an[s.i + 1] < de || X.an[s.i + 1] > a) continue; const pl = poolHasard.get(X.hr[s.i] * 3 + X.tJour[s.i] + 1).filter(j => X.an[j + 1] >= de && X.an[j + 1] <= a); if (pl.length) L.push({ i: pl[Math.floor(rnd() * pl.length)], d: s.d }); } tir.push(statP(L, de, a)); } return { partRestante: moyenne(tir.map(x => x.partRestante ?? 0)), probContinuation: moyenne(tir.map(x => x.probContinuation)), R: moyenne(tir.map(x => x.R.moy)), sdR: ecart(tir.map(x => x.R.moy)) }; };
const pdev = { reel: statP(sigs, 2003, 2014), hasard: hasardP(sigs, 2003, 2014) }, pval = { reel: statP(sigs, 2015, 2019), hasard: hasardP(sigs, 2015, 2019) };
fs.writeFileSync(new URL('./resultats-precurseurs.json', import.meta.url), JSON.stringify({ genere: new Date().toISOString(), mouvements: mv.length, conditions: sortie, demarrage: { dev: pdev, val: pval } }, null, 1));
const f = x => (x == null ? '—' : x.toFixed(3)), pc = x => (x * 100).toFixed(1) + ' %';
const L = ['# Précurseurs des mouvements H1 et démarrage confirmé (local)', '', `Mouvements (définition mouvements-v1, ≥ 1,5 ATR, 4–6 bougies) 2003–2019 : ${mv.length}. Test final 2020–2025 non chargé.`, '', '## Conditions (probabilité qu\'un mouvement de sens attendu démarre dans les 6 bougies suivantes)', '', '| condition | dév. N | dév. prob (base) | rapport | val. N | val. prob (base) | rapport | R net d\'un trade (val., pire) | retenue |', '|---|---|---|---|---|---|---|---|---|'];
for (const r of sortie) L.push(`| ${r.nom} — ${r.texte} | ${r.dev.N} | ${pc(r.dev.prob)} (${pc(r.dev.base)}) | ${f(r.dev.lift)} | ${r.val.N} | ${pc(r.val.prob)} (${pc(r.val.base)}) | ${f(r.val.lift)} | ${r.val.R.n ? f(r.val.R.moy) + ' (n=' + r.val.R.n + ')' : '—'} | ${r.retenue ? 'OUI' : 'non'} |`);
L.push('', '## Famille p : démarrage confirmé (stop 1,5 ATR, sortie par temps, pire scénario de frais)', '', '| période | démarrages | part du mouvement restante après l\'entrée | probabilité de continuation ≥ 3 bougies | R net moyen | hasard : part restante | hasard : continuation | hasard : R net |', '|---|---|---|---|---|---|---|---|');
for (const [nom, o] of [['2003–2014', pdev], ['2015–2019', pval]]) L.push(`| ${nom} | ${o.reel.n} | ${pc(o.reel.partRestante ?? 0)} | ${pc(o.reel.probContinuation)} | ${f(o.reel.R.moy)} (IC ${f(o.reel.R.ic95[0])} … ${f(o.reel.R.ic95[1])}) | ${pc(o.hasard.partRestante)} | ${pc(o.hasard.probContinuation)} | ${f(o.hasard.R)} (sd ${f(o.hasard.sdR)}) |`);
L.push('', '« Continuation ≥ 3 bougies » = clôture de la bougie i+3 au-delà de celle de i dans le sens du démarrage ET au moins 2 des 3 bougies suivantes dans ce sens. « Part restante » = (extrême des 6 bougies suivantes − prix d\'entrée) / (extrême − départ du mouvement), en moyenne.');
fs.writeFileSync(new URL('./RAPPORT-PRECURSEURS-OR.md', import.meta.url), L.join('\n')); console.log(L.join('\n')); console.log('retenues :', sortie.filter(r => r.retenue).map(r => r.nom));
