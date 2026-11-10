/* PHASE 2 : évalue la liste FIGÉE (liste-figee.json) sur le développement (2003–2014) puis la validation (2015–2019). Les données 2020–2025 ne sont PAS chargées ici (test-final.mjs, une seule fois).
   Sorties locales (ignorées par git) : resultats-recherche.json et RAPPORT-RECHERCHE-OR.md. Usage : node recherche.mjs */
import fs from 'node:fs'; import crypto from 'node:crypto';
import { charger } from './donnees.mjs'; import { construire } from './contexte.mjs'; import { SPECS, signaux } from './familles.mjs';
import { essai, enchainer } from './simulateur.mjs'; import { rejouer } from './simulateur2.mjs';
import { resume, moyenne, ecart, phi, prng, holm, parAnnee } from './stats.mjs';
const sha = t => crypto.createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex'), lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const F = JSON.parse(lire('./liste-figee.json')), C = JSON.parse(lire('./criteres.json')), DEC = JSON.parse(lire('./decoupage.json'));
if (sha(JSON.stringify(SPECS)) !== F.sha256_liste || sha(lire('./criteres.json')) !== F.sha256_criteres || sha(lire('./decoupage.json')) !== F.sha256_decoupage) { console.error('REFUS : la liste, les critères ou le découpage ont changé depuis le gel.'); process.exit(1); }
const ANNEES_DEV = [DEC.developpement.de, DEC.developpement.a], ANNEES_VAL = [DEC.validation.de, DEC.validation.a];
const X = construire(charger({ debut: ANNEES_DEV[0], fin: ANNEES_VAL[1] })); console.log('H1 chargées (2003–2019) :', X.n);
const V = C.validation, TIRAGES = V.hasard.tirages;
// tableaux de R net par barre et par gestion (pour le tirage au hasard) : seulement sur la validation
const iVal0 = X.an.findIndex(a => a >= ANNEES_VAL[0]), iVal1 = X.n - 2;
const configs = new Map(); const cle = s => `${s.stopK}|${s.mgmt}`;
function tableau(s) { const k = cle(s); if (configs.has(k)) return configs.get(k); const T = { c: [new Float32Array(X.n).fill(NaN), new Float32Array(X.n).fill(NaN)], k: [new Float32Array(X.n).fill(NaN), new Float32Array(X.n).fill(NaN)] }; for (let i = iVal0; i <= iVal1; i++) { if (X.atr[i] == null) continue; for (const [di, d] of [[0, 1], [1, -1]]) { const r = essai(X, i, d, s.stopK, s.mgmt); if (r) { T.c[di][i] = r.Rc; T.k[di][i] = r.Rk; } } } configs.set(k, T); return T; }
const pools = new Map(); for (let i = iVal0; i <= iVal1; i++) { if (X.atr[i] == null) continue; const k = X.hr[i] * 3 + X.tJour[i] + 1; if (!pools.has(k)) pools.set(k, []); pools.get(k).push(i); }
const res = [];
for (const s of SPECS) {
  const sigs = signaux(s, X), Tdev = enchainer(X, sigs, s, { de: ANNEES_DEV[0], a: ANNEES_DEV[1] }), Tval = enchainer(X, sigs, s, { de: ANNEES_VAL[0], a: ANNEES_VAL[1] });
  const sum = T => ({ brut: resume(T.map(t => t.Rbrut)), cfd: resume(T.map(t => t.Rc)), krk: resume(T.map(t => t.Rk)) });
  const dev = sum(Tdev), val = sum(Tval), pire = val.cfd.moy <= val.krk.moy ? 'cfd' : 'krk', devPire = dev.cfd.moy <= dev.krk.moy ? 'cfd' : 'krk';
  const cleR = pire === 'cfd' ? 'Rc' : 'Rk', Rv = Tval.map(t => t[cleR]);
  // années rentables (validation)
  const pa = parAnnee(Tval, cleR), annees = []; for (let a = ANNEES_VAL[0]; a <= ANNEES_VAL[1]; a++) { const r = pa.get(a) || []; annees.push({ an: a, n: r.length, moy: moyenne(r) }); }
  const rentables = annees.filter(x => x.n > 0 && x.moy > 0).length / annees.length;
  // tirages au hasard (mêmes heures, même régime Jour, même sens, même gestion)
  let moyHasard = null, sdHasard = null, pEmp = null, pNorm = null;
  if (Tval.length >= 20) {
    const T = tableau(s), tab = pire === 'cfd' ? T.c : T.k, rnd = prng(1234567 + s.id.charCodeAt(0) * 100 + s.id.length), M = new Float64Array(TIRAGES);
    const cand = Tval.map(t => ({ pool: pools.get(X.hr[t.i] * 3 + X.tJour[t.i] + 1), di: t.d === 1 ? 0 : 1 }));
    for (let b = 0; b < TIRAGES; b++) { let somme = 0, n = 0; for (const c of cand) { if (!c.pool) continue; const r = tab[c.di][c.pool[Math.floor(rnd() * c.pool.length)]]; if (!Number.isNaN(r)) { somme += r; n++; } } M[b] = n ? somme / n : 0; }
    const arr = Array.from(M); moyHasard = moyenne(arr); sdHasard = ecart(arr) || 1e-9; const moy = val[pire].moy; pEmp = (arr.filter(x => x >= moy).length + 1) / (TIRAGES + 1); pNorm = 1 - phi((moy - moyHasard) / sdHasard);
  }
  res.push({ id: s.id, famille: s.famille, libelle: s.libelle, stopK: s.stopK, mgmt: s.mgmt, signaux: sigs.length, dev: { n: dev.cfd.n, brut: dev.brut.moy, cfd: dev.cfd.moy, krk: dev.krk.moy, pire: dev[devPire].moy }, val: { n: val.cfd.n, brut: val.brut.moy, cfd: val.cfd.moy, krk: val.krk.moy, pire, moy: val[pire].moy, ic95: val[pire].ic95, gain: val[pire].gain }, annees, anneesRentables: rentables, hasard: { moy: moyHasard, sd: sdHasard, pEmp, pNorm }, _Tval: Tval });
}
const adj = holm(res.map(r => (r.hasard.pNorm == null ? 1 : Math.max(r.hasard.pNorm, 1e-300))));
res.forEach((r, k) => { r.hasard.pHolm = adj[k]; });
// voisins : tous les autres variantes de la famille ont un R net moyen (pire scénario, validation) > 0
for (const r of res) { const autres = res.filter(x => x.famille === r.famille && x.id !== r.id); r.voisinsPositifs = autres.length > 0 && autres.every(x => x.val.moy > 0); }
// audit du second simulateur : 50 trades au hasard parmi tous les trades de validation (graine fixe) + les trades de chaque candidat
const rnd = prng(987654), tous = res.flatMap(r => r._Tval.map(t => ({ r, t }))); let ecarts = 0; const audit = [];
const comparer = (t, s) => { const q = rejouer(X.t.map((_, i) => ({ t: X.t[i], o: X.o[i], h: X.h[i], l: X.l[i], c: X.c[i], sp: X.sp[i] })), t.i, t.d, s.stopK, s.mgmt); return q && Math.abs(q.Rbrut - t.Rbrut) < 1e-9 && Math.abs(q.Rc - t.Rc) < 1e-9 && Math.abs(q.Rk - t.Rk) < 1e-9 && q.barSortie === t.jSortie; };
const Bcache = X.t.map((_, i) => ({ t: X.t[i], o: X.o[i], h: X.h[i], l: X.l[i], c: X.c[i], sp: X.sp[i] }));
const cmp2 = (t, s) => { const q = rejouer(Bcache, t.i, t.d, s.stopK, s.mgmt); return q && Math.abs(q.Rbrut - t.Rbrut) < 1e-9 && Math.abs(q.Rc - t.Rc) < 1e-9 && Math.abs(q.Rk - t.Rk) < 1e-9 && q.barSortie === t.jSortie; };
for (let k = 0; k < 50 && tous.length; k++) { const { r, t } = tous[Math.floor(rnd() * tous.length)]; const ok = cmp2(t, SPECS.find(s => s.id === r.id)); audit.push({ id: r.id, i: t.i, ok }); if (!ok) ecarts++; }
for (const r of res) { const T = r._Tval; let bad = 0, n = Math.min(50, T.length); const sp = SPECS.find(s => s.id === r.id); for (let k = 0; k < n; k++) if (!cmp2(T[Math.floor(rnd() * T.length)], sp)) bad++; r.audit = { compares: n, ecarts: bad }; }
// verdict
for (const r of res) {
  const ok = {
    dev_positif: r.dev.pire > 0, trades: r.val.n >= V.trades_min, moyenne: r.val.moy > V.R_net_moyen_min, ic: r.val.ic95[0] > V.intervalle_confiance_95_au_dessus_de,
    hasard: r.hasard.pHolm != null && r.hasard.pHolm < V.hasard.p_max_apres_holm, annees: r.anneesRentables >= V.annees_rentables_min, voisins: r.voisinsPositifs, audit: r.audit.ecarts === 0 && ecarts === 0
  };
  r.criteres = ok; r.validee = Object.values(ok).every(Boolean); delete r._Tval;
}
const sortie = { genere: new Date().toISOString(), liste_sha256: F.sha256_liste, variantes: res.length, auditGlobal: { compares: audit.length, ecarts }, retenues: res.filter(r => r.validee).map(r => r.id), resultats: res };
fs.writeFileSync(new URL('./resultats-recherche.json', import.meta.url), JSON.stringify(sortie, null, 1));
// rapport honnête
const f2 = x => (x == null ? '—' : (x >= 0 ? '+' : '') + x.toFixed(3)), pc = x => (x * 100).toFixed(0) + ' %';
const top = res.slice().sort((a, b) => b.val.moy - a.val.moy).slice(0, 10);
const L = ['# Recherche de stratégie H1 sur l\'or — rapport (local)', '', `Liste figée : ${F.sha256_liste.slice(0, 16)}… (${res.length} variantes, toutes comptées dans Holm). Développement 2003–2014, validation 2015–2019 ; le test final 2020–2025 n'est pas encore regardé.`, '', `Audit du second simulateur : ${audit.length} trades au hasard, ${ecarts} écart(s).`, '', `**Variantes retenues : ${sortie.retenues.length ? sortie.retenues.join(', ') : 'AUCUNE'}**`, '', '## Les 10 meilleures variantes (R net moyen en validation, scénario le plus défavorable)', '', '| variante | trades val. | R brut | R net CFD | R net Kraken | IC 95 % (pire) | hasard (moy.) | p Holm | années + | dév. (pire) | critères manquants |', '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const r of top) L.push(`| ${r.id} ${r.libelle} | ${r.val.n} | ${f2(r.val.brut)} | ${f2(r.val.cfd)} | ${f2(r.val.krk)} | ${f2(r.val.ic95[0])} … ${f2(r.val.ic95[1])} | ${f2(r.hasard.moy)} | ${r.hasard.pHolm == null ? '—' : r.hasard.pHolm.toExponential(1)} | ${pc(r.anneesRentables)} | ${f2(r.dev.pire)} | ${Object.entries(r.criteres).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'aucun'} |`);
L.push('', '## Toutes les variantes', '', '| id | libellé | signaux | trades dév. | R net dév. (pire) | trades val. | R net val. (pire) | p Holm |', '|---|---|---|---|---|---|---|---|');
for (const r of res) L.push(`| ${r.id} | ${r.libelle} | ${r.signaux} | ${r.dev.n} | ${f2(r.dev.pire)} | ${r.val.n} | ${f2(r.val.moy)} | ${r.hasard.pHolm == null ? '—' : r.hasard.pHolm.toExponential(1)} |`);
fs.writeFileSync(new URL('./RAPPORT-RECHERCHE-OR.md', import.meta.url), L.join('\n'));
console.log(L.slice(0, 22).join('\n')); console.log('retenues :', sortie.retenues);
