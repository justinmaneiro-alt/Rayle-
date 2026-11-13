/* Étude « plus d'historique de flèches + bilan honnête » de la v8 « Direct » (règles FIGÉES, sceau : historique-fleches-sceau.json).
   node agent-trading/recherche-or/historique-fleches-etude.mjs [--sans-dukascopy]   (depuis la racine du dépôt ; données : historique-donnees.mjs)
   Écrit RAPPORT-HISTORIQUE-FLECHES.md, historique-fleches-resultats.json et images-historique/*.svg. Outil de mesure : rien ici ne modifie une règle. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url'; import { Worker } from 'node:worker_threads';
import { composite, dukascopy, DECALAGE_BINANCE } from './historique-series.mjs';
import { atrSerie } from '../front/or/fleches-terminal-v1.js'; import * as V8 from '../front/or/fleches-simples-v8.js'; import { niveauxSignal } from '../front/or/signal-niveaux.js';
import { CHRONO, colorees } from '../front/or/fleches-historique-v1.js';
import { actif, PARAMS, tradesDeFleches, stats, courbes, hasard, holm, verdict, decouper, graine, REGLAGE_T, fraisUsd } from '../front/or/fleches-bilan-v1.js';
import { sceau } from './historique-sceller.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, IMG = path.join(ici, 'images-historique'); fs.mkdirSync(IMG, { recursive: true });
const f1 = (x, n = 2) => x == null || !Number.isFinite(x) ? 'n/d' : x.toFixed(n).replace('.', ','), pc = x => x == null ? 'n/d' : (x * 100).toFixed(0) + ' %', pf = x => x == null ? 'n/d' : x === Infinity ? '∞' : f1(x);
const jour = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', mois = t => new Date(t).toISOString().slice(0, 7);

/* ── calcul parallèle par segments (chaque segment = calculerHistorique avec contexte et recouvrement ; invalidations recollées par identifiant) ── */
async function calculerParallele(B, segment = 6000) {
  const dep = Math.max(V8.DEPART, 40), taches = []; for (let a = dep; a < B.length; a += segment) taches.push({ a, b: Math.min(B.length, a + segment) });
  const sorties = []; let k = 0, fait = 0; const t0 = Date.now();
  const lancer = () => new Promise(res => {
    const prochain = () => { if (k >= taches.length) return false; const T = taches[k++], lo = Math.max(0, T.a - CHRONO.recouvrement - CHRONO.contexte);
      const w = new Worker(new URL('./historique-worker.mjs', import.meta.url), { workerData: { S: B.slice(lo, T.b), lo, a: T.a, b: T.b } });
      w.once('message', m => { sorties.push(m); fait++; process.stderr.write(`\r  segment ${fait}/${taches.length} (${Math.round((Date.now() - t0) / 1000)} s)   `); }); w.once('error', e => { console.error(e); process.exit(1); }); w.once('exit', () => { if (!prochain() && fait === taches.length) res(); }); return true; };
    const n = Math.min(Math.max(2, os.cpus().length - 2), taches.length); for (let j = 0; j < n; j++) prochain();
  });
  await lancer(); process.stderr.write('\n');
  const fl = new Map(), inval = new Map(), ret = {};
  for (const s of sorties) { for (const f of s.fleches) fl.set(f.id, f); for (const q of s.invalidees) inval.set(q.id, q.invalideeT); for (const [x, v] of Object.entries(s.retirees)) ret[x] = (ret[x] || 0) + v; }
  const L = [...fl.values()].sort((x, y) => x.i - y.i || (x.id < y.id ? -1 : 1)); for (const f of L) if (inval.has(f.id)) { f.invalidee = true; f.invalideeT = inval.get(f.id); }
  return { fleches: L, retirees: ret };
}

/* ── analyse d'une série ── */
async function analyser(nom, B, { parallele = true } = {}) {
  console.log(`[${nom}] ${B.length} bougies H1 du ${jour(B[0].t)} au ${jour(B.at(-1).t)}`); const t0 = Date.now();
  const fc = path.join(ici, 'donnees', `fleches-cache-${nom.replace(/[^a-z]/gi, '').slice(0, 8)}.json`), cleC = `${sc0.sha256Global}|${B.length}|${B[0].t}|${B.at(-1).t}|${CHRONO.morceau}|${CHRONO.recouvrement}|${CHRONO.contexte}`;
  let res = null; try { const c = JSON.parse(fs.readFileSync(fc, 'utf8')); if (c.cle === cleC) { res = c.res; console.log(`[${nom}] flèches relues du cache (mêmes règles scellées, même série)`); } } catch (e) { /* pas de cache */ }
  if (!res) { res = await calculerParallele(B); fs.writeFileSync(fc, JSON.stringify({ cle: cleC, res })); }
  const A = atrSerie(B), idx = new Map(B.map((b, i) => [b.t, i]));
  const fl = res.fleches, col = colorees(fl), T = tradesDeFleches(B, col, { indexDe: idx }), ens = decouper(T, REGLAGE_T);
  console.log(`[${nom}] ${fl.length} flèches (${col.length} colorées, ${T.length} trades terminés) en ${Math.round((Date.now() - t0) / 1000)} s`);
  const eligibles = (de, a) => { const L = []; for (let i = Math.max(V8.DEPART + 1, 40); i < B.length - PARAMS.maxBougies - 1; i++) { const t = B[i].t + H; if (t >= de && t < a && A[i] > 0 && actif(B[i])) L.push(i); } return L; };
  const rnd = graine(), cles = Object.keys(ens), S = {}, Hs = {};
  for (const c of cles) {
    S[c] = stats(ens[c]); const [per, cote] = c.split('|'); const dir = cote === 'achats' ? 1 : cote === 'ventes' ? -1 : 0;
    if (S[c].n >= 1) { const el = eligibles(per === 'avant' ? 0 : REGLAGE_T, per === 'avant' ? REGLAGE_T : Infinity);
      Hs[c] = dir === 0 ? (() => { const a = ens[c].filter(t => t.dir > 0), v = ens[c].filter(t => t.dir < 0), ha = a.length ? hasard(B, A, { dir: 1, reels: a, eligibles: el, rnd }) : null, hv = v.length ? hasard(B, A, { dir: -1, reels: v, eligibles: el, rnd }) : null;
        // tous = achats + ventes : la référence du hasard est la moyenne pondérée des deux références (même mélange de sens)
        if (!ha || !hv) return ha || hv; const w = a.length / (a.length + v.length); const dist = { moyReel: S[c].RmoyNet, moyHasard: w * ha.moyHasard + (1 - w) * hv.moyHasard, p: Math.max(ha.p, hv.p), place: Math.min(ha.place, hv.place), q05: w * ha.q05 + (1 - w) * hv.q05, q95: w * ha.q95 + (1 - w) * hv.q95, n: a.length + v.length, melange: true }; return dist; })() : hasard(B, A, { dir, reels: ens[c], eligibles: el, rnd });
    } else Hs[c] = null;
  }
  // « tous » : p du hasard combiné = la plus prudente des deux p (achats, ventes) : jamais plus optimiste que le moins bon des deux sens
  const ps = cles.map(c => Hs[c] && S[c].n >= PARAMS.nMin ? Hs[c].p : 1), aj = holm(ps), verd = {}, padj = {}; cles.forEach((c, j) => { padj[c] = Hs[c] && S[c].n >= PARAMS.nMin ? aj[j] : null; verd[c] = verdict(S[c], padj[c]); });
  const cb = { avant: courbes(ens['avant|tous']), apres: courbes(ens['apres|tous']), tout: courbes(T) };
  return { nom, B, A, fl, col, T, ens, S, Hs, padj, verd, cb, retirees: res.retirees, idx };
}

/* ── dessins SVG (aucune dépendance) ── */
function svgCourbes(titre, series, { w = 900, h = 300 } = {}) {
  const pts = series.flatMap(s => s.pts); if (!pts.length) return ''; const t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(...pts.map(p => p.t)), v0 = Math.min(...pts.map(p => p.v), 1), v1 = Math.max(...pts.map(p => p.v), 1), m = 44;
  const X = t => m + (t - t0) / Math.max(1, t1 - t0) * (w - m - 10), Y = v => h - 26 - (v - v0) / Math.max(1e-9, v1 - v0) * (h - 50), cl = ['#2f7dd1', '#d1862f', '#3c9a5f', '#a23c8f'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="12"><rect width="${w}" height="${h}" fill="#fff"/><text x="${m}" y="16" font-weight="700">${titre}</text><line x1="${m}" y1="${Y(1)}" x2="${w - 10}" y2="${Y(1)}" stroke="#aaa" stroke-dasharray="4"/><text x="4" y="${Y(1) + 4}">100 %</text><text x="4" y="${Y(v1) + 4}">${(v1 * 100).toFixed(0)} %</text><text x="4" y="${Y(v0) + 4}">${(v0 * 100).toFixed(0)} %</text><text x="${m}" y="${h - 6}">${mois(t0)}</text><text x="${w - 70}" y="${h - 6}">${mois(t1)}</text>`
    + series.map((s, k) => `<polyline fill="none" stroke="${cl[k % cl.length]}" stroke-width="1.6" points="${s.pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ')}"/><text x="${w - 220}" y="${30 + 16 * k}" fill="${cl[k % cl.length]}">${s.nom}</text>`).join('') + '</svg>';
}
function svgExemple(B, f, tr, titre) {
  const i0 = B.findIndex(b => b.t === f.t), a = Math.max(0, i0 - 50), b = Math.min(B.length, i0 + 56), L = B.slice(a, b), w = 900, h = 380, m = 56;
  const hi = Math.max(...L.map(x => x.h), tr ? tr.stop : -1e9, tr ? tr.tp2 : -1e9, f.zoneHaut), lo = Math.min(...L.map(x => x.l), tr ? tr.stop : 1e9, tr ? tr.tp2 : 1e9, f.zoneBas), X = k => m + (k + 0.5) / L.length * (w - m - 10), Y = p => 30 + (hi - p) / (hi - lo) * (h - 60), cw = Math.max(2, (w - m - 10) / L.length * 0.6);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="system-ui,sans-serif" font-size="12"><rect width="${w}" height="${h}" fill="#fff"/><text x="${m}" y="16" font-weight="700">${titre}</text>`;
  s += `<rect x="${m}" y="${Y(f.zoneHaut)}" width="${w - m - 10}" height="${Math.max(2, Y(f.zoneBas) - Y(f.zoneHaut))}" fill="#d1a02f" opacity="0.25"/><text x="${m + 4}" y="${Y(f.zoneHaut) - 3}" fill="#8a6a1a">zone ${Math.round(f.zoneBas)}–${Math.round(f.zoneHaut)}</text>`;
  L.forEach((x, k) => { const up = x.c >= x.o, col = up ? '#2a8a4f' : '#c2402f'; s += `<line x1="${X(k)}" x2="${X(k)}" y1="${Y(x.h)}" y2="${Y(x.l)}" stroke="${col}"/><rect x="${X(k) - cw / 2}" y="${Y(Math.max(x.o, x.c))}" width="${cw}" height="${Math.max(1, Math.abs(Y(x.o) - Y(x.c)))}" fill="${col}"/>`; });
  if (tr) for (const [p, nom, c] of [[tr.entree, 'entrée', '#333'], [tr.stop, 'stop', '#c2402f'], [tr.tp1, 'TP1', '#2a8a4f'], [tr.tp2, 'TP2', '#1f6f3f']]) s += `<line x1="${X(i0 - a)}" x2="${w - 10}" y1="${Y(p)}" y2="${Y(p)}" stroke="${c}" stroke-dasharray="5 3"/><text x="${w - 64}" y="${Y(p) - 3}" fill="${c}">${nom} ${Math.round(p)}</text>`;
  const ax = X(i0 - a), ay = f.dir > 0 ? Y(B[i0].l) + 14 : Y(B[i0].h) - 14; s += `<text x="${ax - 8}" y="${ay + 5}" font-size="20" fill="${f.dir > 0 ? '#2a8a4f' : '#c2402f'}">${f.dir > 0 ? '▲' : '▼'}</text>`;
  if (f.invalideeT) { const k = B.findIndex(x => x.t + H === f.invalideeT); if (k >= a) s += `<line x1="${X(k - a)}" x2="${X(k - a)}" y1="30" y2="${h - 30}" stroke="#a23c8f" stroke-dasharray="3 3"/><text x="${X(k - a) + 3}" y="44" fill="#a23c8f">invalidée</text>`; }
  s += `<text x="${m}" y="${h - 8}">${jour(B[a].t)} → ${jour(B[b - 1].t)}</text></svg>`; return s;
}

/* ── exécution ── */
const sc = await sceau(), sc0 = sc, scRef = JSON.parse(fs.readFileSync(path.join(ici, 'historique-fleches-sceau.json'), 'utf8')), sceauOk = sc.sha256Global === scRef.sha256Global;
if (!sceauOk) { console.error('SCEAU DIFFÉRENT : les règles ont changé depuis le scellement ; étude refusée.'); process.exit(1); }
const co = composite(), Rcomp = await analyser('Binance (décalé) + Kraken', co.serie);
const Rduk = process.argv.includes('--sans-dukascopy') ? null : await analyser('Dukascopy XAU/USD spot', dukascopy());

/* ── rapport ── */
const ligneStat = (c, R) => { const s = R.S[c], h = R.Hs[c]; if (!s.n) return `| ${c.replace('|', ' · ')} | 0 | | | | | | | | |`; const pas = !s.assez;
  return `| ${c.replace('apres', 'après').replace('|', ' · ')} | ${s.n} | ${pas ? '—' : pc(s.reussiteBrut)} / ${pas ? '—' : pc(s.reussite)} | ${pas ? '—' : f1(s.Rmoy) + ' / ' + f1(s.RmoyNet)} | ${pas ? '—' : pf(s.pf) + ' / ' + pf(s.pfNet)} | ${pas || !h ? '—' : f1(h.moyHasard) + ' [' + f1(h.q05) + ' ; ' + f1(h.q95) + ']'} | ${pas || !h ? '—' : pc(h.place)} | ${pas || !h ? '—' : f1(h.p, 3)} | ${R.padj[c] == null ? '—' : f1(R.padj[c], 3)} | **${R.verd[c]}** |`; };
const tableauBilan = R => `| Ensemble | n trades | Réussite brut / net | R moyen brut / net | Profit factor brut / net | R net du hasard (moy. [5 % ; 95 %]) | Place du réel | p | p (Holm) | Verdict |\n|---|---|---|---|---|---|---|---|---|---|\n${['avant|tous', 'avant|achats', 'avant|ventes', 'apres|tous', 'apres|achats', 'apres|ventes'].map(c => ligneStat(c, R)).join('\n')}`;
const parMois = R => { const m = new Map(); for (const f of R.col) m.set(mois(f.tCloture), (m.get(mois(f.tCloture)) || 0) + 1); return m; };
const parAn = R => { const out = []; const ans = [...new Set(R.B.map(b => new Date(b.t).getUTCFullYear()))]; for (const a of ans) { const L = R.B.filter(b => new Date(b.t).getUTCFullYear() === a), T = R.T.filter(t => new Date(t.tEntree).getUTCFullYear() === a), ta = T.filter(t => t.dir > 0), tv = T.filter(t => t.dir < 0), m = L => L.length ? L.reduce((s, t) => s + t.Rnet, 0) / L.length : null; out.push({ a, variation: (L.at(-1).c / L[0].o - 1), n: T.length, na: ta.length, nv: tv.length, rn: m(T), ra: m(ta), rv: m(tv) }); } return out; };
const tabAn = R => `| Année | Variation du prix | Trades | Achats | Ventes | R net moyen (tous) | R net achats | R net ventes |\n|---|---|---|---|---|---|---|---|\n${parAn(R).map(x => `| ${x.a} | ${f1(x.variation * 100, 1)} % | ${x.n} | ${x.na} | ${x.nv} | ${x.n >= 5 ? f1(x.rn) : '—'} | ${x.na >= 5 ? f1(x.ra) : '—'} | ${x.nv >= 5 ? f1(x.rv) : '—'} |`).join('\n')}\n(« — » : moins de 5 trades, aucun chiffre.)`;
const bloc = (R, titre, svgNom) => {
  const mm = parMois(R), moisL = [...mm.entries()].sort(), nColoree = R.col.length, gris = R.fl.filter(f => f.contre).length, ma = R.fl.filter(f => f.type === 'ma_cassure').length, inv = R.fl.filter(f => f.invalidee).length;
  const svg = svgCourbes(`${R.nom} : capital, risque 0,5 % par trade (net de frais)`, [{ nom: 'sans composé', pts: R.cb.tout.points.map(p => ({ t: p.t, v: p.simple })) }, { nom: 'composé', pts: R.cb.tout.points.map(p => ({ t: p.t, v: p.compose })) }]); fs.writeFileSync(path.join(IMG, svgNom), svg);
  const cbL = (nm, c) => `| ${nm} | ${f1(c.finSimple * 100, 1)} % | ${f1(c.finCompose * 100, 1)} % | ${f1(c.ddSimple * 100, 1)} % | ${f1(c.ddCompose * 100, 1)} % |`;
  return `## ${titre}
Série : ${R.B.length} bougies H1 closes du ${jour(R.B[0].t)} au ${jour(R.B.at(-1).t)}.
**Flèches** : ${R.fl.length} calculées, dont ${nColoree} colorées (retournements et rebonds de base), ${gris} grises (contre-tendance), ${ma} cassures MA200 (masquées par défaut), ${inv} invalidées. **Trades simulés terminés** (colorées, invalidées comprises) : ${R.T.length}.

### Bilan (net = après frais ; « brut » = sans frais)
${tableauBilan(R)}
Plus longue série perdante (net, tous les trades) : **${R.S['avant|tous'].n || R.S['apres|tous'].n ? stats(R.T).serieMax : 0}** trades. Répartition des sorties : ${JSON.stringify(stats(R.T).raisons)}.

### Courbes de capital (0,5 % de risque par trade, net de frais)
| Ensemble | Fin, sans composé | Fin, composé | Drawdown max sans composé | Drawdown max composé |
|---|---|---|---|---|
${cbL('avant la période de réglage', R.cb.avant)}
${cbL('après la période de réglage', R.cb.apres)}
${cbL('toute la série', R.cb.tout)}
![courbes de capital](images-historique/${svgNom})

### Nombre de flèches colorées par mois
${moisL.length > 40 ? `(${moisL.length} mois : moyenne ${f1(nColoree / moisL.length, 1)} par mois ; 24 derniers mois ci-dessous)\n` : ''}| Mois | Flèches |\n|---|---|\n${moisL.slice(-24).map(([m, n]) => `| ${m} | ${n} |`).join('\n')}
`; };

// exemples réels hors échantillon (avant la période de réglage), les plus récents : une gagnante, une perdante, une invalidée
const exemples = R => { const hors = R.col.filter(f => f.tCloture < REGLAGE_T), parId = new Map(R.T.map(t => [t.id, t])), r = L => L.slice().reverse(); const gag = r(hors).find(f => parId.has(f.id) && parId.get(f.id).Rnet > 0.5 && !f.invalidee), per = r(hors).find(f => parId.has(f.id) && parId.get(f.id).Rnet < -0.5 && !f.invalidee), inv = r(hors).find(f => f.invalidee && parId.has(f.id)); return { gag, per, inv, parId }; };
const EX = exemples(Rcomp), exTxt = [], figs = {};
for (const [cle, nom] of [['gag', 'gagnante'], ['per', 'perdante'], ['inv', 'invalidée']]) { const f = EX[cle]; if (!f) { exTxt.push(`- **${nom}** : aucune trouvée dans la série.`); continue; } const tr = EX.parId.get(f.id), fichier = `exemple-${nom}.svg`; fs.writeFileSync(path.join(IMG, fichier), svgExemple(Rcomp.B, f, tr, `Flèche ${nom} (hors échantillon) : ${f.dir > 0 ? 'achat' : 'vente'} ${jour(f.tCloture)}`)); figs[cle] = fichier;
  exTxt.push(`### Exemple ${nom}\n${f.dir > 0 ? 'Achat' : 'Vente'} confirmé le ${jour(f.tCloture)} sur ${f.niveauNom || 'niveau'} ${Math.round(f.zoneBas)}–${Math.round(f.zoneHaut)} · entrée ${f1(tr.entree)} · stop ${f1(tr.stop)} · TP1 ${f1(tr.tp1)} · TP2 ${f1(tr.tp2)} · sortie ${tr.raison} le ${jour(tr.tSortie)} · **${f1(tr.R)} R brut, ${f1(tr.Rnet)} R net**${f.invalidee ? ' · invalidée à ' + jour(f.invalideeT) : ''}.\n![${nom}](images-historique/${fichier})`); }

const hors = k => (k.S['avant|tous'].n >= PARAMS.nMin);
const cible = Rduk && hors(Rduk) ? Rduk : Rcomp, vA = cible.verd['avant|tous'], vAp = Rcomp.verd['apres|tous'], sAvant = cible.S['avant|tous'], sApres = Rcomp.S['apres|tous'];
const phrase1 = vA === 'pas assez de données' ? `Hors échantillon, il n'y a pas assez de trades (${sAvant.n}) pour juger : on ne sait pas.` : vA.startsWith('mieux') ? `Hors échantillon (${cible.nom}, ${sAvant.n} trades), le résultat net de frais (${f1(sAvant.RmoyNet)} R par trade) est meilleur que le hasard après correction de Holm.` : `Hors échantillon (${cible.nom}, ${sAvant.n} trades), le résultat net de frais est de ${f1(sAvant.RmoyNet)} R par trade et n'est pas mieux que le hasard après correction de Holm.`;
const phrase2 = sApres.n < PARAMS.nMin ? `Après la période de réglage il n'y a que ${sApres.n} trades : c'est trop peu pour conclure, et ces règles y ont été choisies en regardant des exemples.` : `Après la période de réglage (${sApres.n} trades) le verdict est « ${vAp} », mais ces règles y ont été réglées : ce n'est pas un test.`;
const conclusion = vA === 'pas assez de données' ? 'on ne sait pas' : vA.startsWith('mieux') ? 'oui, un avantage hors échantillon apparaît, à confirmer en direct' : 'non, aucun avantage démontré hors échantillon';
const phrase3 = `Verdict : ${conclusion}. Seul le registre en direct (flèches posées à partir du 13 novembre 2026, lignes jamais modifiées) permettra de trancher.`;

const md = `# RAPPORT : historique des flèches v8 « Direct » et bilan honnête (${new Date().toISOString().slice(0, 10)})
**Outil de mesure, jamais un conseil ni un ordre.** Les règles de la v8 ont été **figées avant tout calcul** : SHA-256 global \`${sc.sha256Global}\` (${Object.keys(sc.fichiers).length} fichiers de règles + paramètres, détail dans \`recherche-or/historique-fleches-sceau.json\`, vérifié identique au lancement de cette étude : ${sceauOk ? 'oui' : 'NON'}). Aucune règle n'a été retouchée après avoir vu les résultats ; un mauvais résultat serait rapporté tel quel.

## 0. Méthode
- **Calcul causal** : rejeu bougie par bougie de \`fleches-simples-v8\` (à chaque pas le moteur ne voit que les bougies déjà closes), par morceaux de ${CHRONO.morceau} bougies avec ${CHRONO.recouvrement} bougies de recouvrement et ${CHRONO.contexte} de contexte (niveaux hebdomadaires, mensuels et zones recalculés de façon causale à partir des bougies). Vérifié **identique** au rejeu d'une seule passe (aucune flèche en plus ou en moins, mêmes drapeaux) : test \`tests/fleches-historique-test.mjs\`.
- **Données** : (A) référence **Binance XAUUSDT décalée de ${f1(DECALAGE_BINANCE)} $** avant la 1ʳᵉ bougie Kraken (${jour(co.serie[0].t)} → ${jour(co.serie[co.nRef].t)}, ${co.nRef} bougies), puis **Kraken PF_XAUUSD** (${co.nKraken} bougies) : c'est la série du graphique. Écart médian mesuré Kraken − Binance sur les ${co.ecartN} bougies communes : ${f1(co.ecartMedian)} $ (le décalage choisi est celui de l'appli : ${f1(DECALAGE_BINANCE)} $). (B) **Dukascopy XAU/USD spot (bid)** de 2003 à 2026-11-11 : instrument différent (spot, pas le perpétuel Kraken) mais 23 ans de hors échantillon. Les deux séries se recoupent en 2026 : ne pas les additionner.
- **Trade simulé** : entrée = clôture de confirmation ; stop = bord extérieur de la zone + 0,2 ATR ; TP1 à 1 R, TP2 à 2 R (moitié de la position à chaque cible, le stop ne bouge pas après TP1) ; sortie forcée après 48 bougies ; stop et cible dans la même bougie : le stop ; trou au-delà du stop : exécuté à l'ouverture. **Frais choisis** : spread ${PARAMS.spreadPb} point de base + glissement ${PARAMS.glissementPb} pb par aller-retour (= ${f1(fraisUsd(4000))} $ à 4 000 $), retirés du résultat en R (frais ÷ risque). Flèches comptées : retournements et rebonds de base colorés (invalidées comprises : l'invalidation n'est pas connue à l'entrée) ; cassures MA200 (masquées par défaut) et flèches grises exclues.
- **Période de réglage** : à partir du **1ᵉʳ octobre 2026** (début de la période regardée pour régler les règles). Tout ce qui est avant est du test hors échantillon. **Les règles ont été réglées sur la période récente : le hors échantillon est la partie utile.**
- **Hasard** : ${PARAMS.tirages} tirages de N entrées aléatoires par ensemble (même sens, même nombre de trades, mêmes règles de sortie, stop de même taille en ATR tiré parmi ceux des vraies flèches, entrées tirées parmi les bougies ACTIVES seulement : une première version tirait aussi les bougies plates des week-ends (31 % des bougies Dukascopy, ATR proche de 0, frais énormes en R) et rendait le hasard artificiellement mauvais ; corrigé avant de conclure). « Place du réel » = part des tirages moins bons que le réel ; p = part des tirages au moins aussi bons. Pour « tous », la référence est le mélange achats + ventes dans les mêmes proportions et la p retenue est la plus prudente des deux sens. **Correction de Holm** sur les 6 variantes (avant / après × tous / achats / ventes) de chaque série. « Mieux que le hasard » seulement si n ≥ ${PARAMS.nMin}, p corrigée < ${PARAMS.alpha} et R net moyen > 0 ; sinon « pas mieux que le hasard » ou « pas assez de données ».
- **Biais de marché** : l'or a monté fortement (2003-2011, 2019-2020, 2024-2026) puis a reculé (2011-2015, fin 2025 et 2026 selon la série) : un achat au hasard gagne donc plus qu'une vente au hasard sur ces périodes. C'est pourquoi les achats et les ventes sont comparés **chacun à ses propres tirages au hasard** et présentés séparément.

${bloc(Rcomp, '1. Série du graphique : Binance (décalé) puis Kraken', 'capital-composite.svg')}
${Rduk ? bloc(Rduk, '2. Série longue : Dukascopy XAU/USD spot 2003 → 2026', 'capital-dukascopy.svg') : ''}
${Rduk ? `### Par année (Dukascopy) : tendance du marché contre résultat par sens\n${tabAn(Rduk)}\n` : ''}
## 3. Trois exemples réels hors échantillon (série du graphique, avant le 1ᵉʳ octobre 2026)
${exTxt.join('\n\n')}

## 4. Retardement et flèches retirées par les règles (série du graphique)
${Object.entries(Rcomp.retirees).map(([k, n]) => `- ${k} : ${n}`).join('\n')}

## 5. Limites honnêtes
- Les règles v8 ont été choisies en regardant des exemples de la période récente : les résultats « après » ne sont pas un test. Les « avant » le sont, mais l'historique 2003-2025 est du **spot** Dukascopy (bid), pas le perpétuel Kraken ; les niveaux et la liquidité d'alors diffèrent.
- Les trades simulés supposent une exécution à la clôture de la bougie de confirmation, sans refus ni requote ; le glissement réel peut être pire, surtout lors des annonces.
- Les trades se chevauchent parfois ; la courbe de capital ajoute chaque trade à sa sortie sans tenir compte d'un plafond d'exposition.
- Deux variantes de sortie (TP1 seul, TP2 seul) n'ont **pas** été testées pour ne pas multiplier les comparaisons.
- n < ${PARAMS.nMin} : aucun chiffre de performance n'est donné (« pas assez de données »).

## 6. Verdict
${phrase1} ${phrase2} ${phrase3}
`;
fs.writeFileSync(path.join(ici, 'RAPPORT-HISTORIQUE-FLECHES.md'), md);
const compact = R => ({ nom: R.nom, bougies: R.B.length, du: R.B[0].t, au: R.B.at(-1).t, fleches: R.fl.length, colorees: R.col.length, trades: R.T.length, stats: R.S, p: Object.fromEntries(Object.entries(R.Hs).map(([k, v]) => [k, v && { moyHasard: v.moyHasard, place: v.place, p: v.p }])), pHolm: R.padj, verdicts: R.verd });
fs.writeFileSync(path.join(ici, 'historique-fleches-resultats.json'), JSON.stringify({ sceau: sc.sha256Global, composite: compact(Rcomp), dukascopy: Rduk && compact(Rduk), exemples: Object.fromEntries(Object.entries(EX).filter(([k]) => k !== 'parId').map(([k, f]) => [k, f && f.id])) }, null, 1));
console.log(md.split('## 6. Verdict')[1]);
