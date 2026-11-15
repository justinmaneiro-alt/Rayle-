/* Backtest HONNÊTE des signaux H4 / Jour : or, Nasdaq 100, Bitcoin. Usage : node trader-pro/terminal/backtest-hj.mjs <dossier-instantanés> [sortie.json]
   Méthode : règles fixées d'avance (signaux-hj.js) ; trois jeux de paramètres seulement (tolérance au niveau 0,2 / 0,3 / 0,45 ATR) ; WALK-FORWARD : sur chaque fenêtre, le jeu choisi est celui qui a le meilleur facteur de profit
   sur la période d'apprentissage (au moins 8 trades), puis il est appliqué à la période SUIVANTE, jamais vue : les trades de ces périodes de test forment le résultat « hors échantillon ». Entrée à l'ouverture de la bougie suivante,
   stop prioritaire, coûts inclus. Données publiques (Yahoo via le robot, Binance). Rien n'est ajusté pour embellir le résultat : si ce n'est pas rentable, le verdict le dit. */
import fs from 'node:fs'; import path from 'node:path';
import { signaux, simuler, statistiques, PARAMS } from './signaux-hj.js';
import { enH4 } from '../commun/analyse.js';

const dossier = process.argv[2] || '.', sortie = process.argv[3] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'backtest-hj.json');
const lire = nom => { const d = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')); return d.b.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v: v || 0 })).filter(x => x.c > 0 && x.h >= x.l); };
async function binance(intervalle, depuis) {
  let out = [], t = depuis; for (let k = 0; k < 60; k++) { const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${intervalle}&startTime=${t}&limit=1000`); if (!r.ok) throw new Error('Binance ' + r.status); const L = await r.json(); if (!L.length) break; out = out.concat(L.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }))); t = L[L.length - 1][0] + 1; if (L.length < 1000) break; } return out;
}
const JEUX = [{ nom: 'tolérance 0,2 ATR', tol: 0.2 }, { nom: 'tolérance 0,3 ATR', tol: 0.3 }, { nom: 'tolérance 0,45 ATR', tol: 0.45 }].map(j => ({ ...j, P: { ...PARAMS, tol: j.tol } }));
const AN = 365.25 * 86400e3;

function walkForward(B, jour, tf, cout, { apprentissage, test }) {
  const t0 = B[0].t, tFin = B[B.length - 1].t, fenetres = [], oos = [], ins = []; let choix = {};
  const lancer = (P, de, a) => { const S = signaux(B, jour, tf, P).filter(s => s.t >= de && s.t < a); return simuler(B, S, { cout, P }); };
  for (let t = t0 + apprentissage; t + test * 0.5 <= tFin; t += test) {
    const appr = JEUX.map(j => { const T = lancer(j.P, t - apprentissage, t), st = statistiques(T); return { j, T, st }; });
    const eligibles = appr.filter(a => a.st.n >= 8 && a.st.profitFactor != null).sort((a, b) => b.st.profitFactor - a.st.profitFactor), meilleur = eligibles.length ? eligibles[0] : appr[1];
    const T = lancer(meilleur.j.P, t, Math.min(t + test, tFin + 1)); fenetres.push({ debut: new Date(t).toISOString().slice(0, 10), fin: new Date(Math.min(t + test, tFin)).toISOString().slice(0, 10), jeu: meilleur.j.nom, apprentissage: { n: meilleur.st.n, pf: meilleur.st.profitFactor }, test: { n: T.length } });
    choix[meilleur.j.nom] = (choix[meilleur.j.nom] || 0) + 1; oos.push(...T); ins.push(...meilleur.T);
  }
  return { fenetres, oos, ins, choix };
}
const resume = st => (st.n ? { n: st.n, reussite: +st.winRate.toFixed(3), rMoyen: +st.rMoyen.toFixed(3), profitFactor: st.profitFactor == null ? null : +st.profitFactor.toFixed(2), rTotal: +st.rTotal.toFixed(1), drawdownR: +st.drawdownR.toFixed(1), gainMoyenR: st.gainMoyenR && +st.gainMoyenR.toFixed(2), perteMoyenneR: st.perteMoyenneR && +st.perteMoyenneR.toFixed(2) } : { n: 0 });
const courbeEchantillon = T => { let c = 0; const pts = T.map(t => [t.tSortie, +(c += t.r).toFixed(2)]); const pas = Math.max(1, Math.floor(pts.length / 80)); return pts.filter((_, i) => i % pas === 0 || i === pts.length - 1); };
function verdict(oos, ans) { if (ans < 3 && oos.n >= 30 && oos.rMoyen > 0.1) return { niveau: 'fragile', texte: 'Résultat hors échantillon positif (R moyen ' + oos.rMoyen + ', facteur de profit ' + oos.profitFactor + ') MAIS sur une période courte (' + ans.toFixed(1) + ' an) : cela peut refléter un simple marché porteur, pas un avantage durable. À confirmer.' }; if (oos.n < 30) return { niveau: 'insuffisant', texte: 'Pas assez de trades hors échantillon (' + oos.n + ') pour conclure.' }; if (oos.rMoyen > 0.1 && oos.profitFactor > 1.2) return { niveau: 'positif', texte: 'Résultat hors échantillon positif (R moyen ' + oos.rMoyen + ', facteur de profit ' + oos.profitFactor + ') : encourageant, à confirmer en direct.' }; if (oos.rMoyen > 0) return { niveau: 'fragile', texte: 'Résultat hors échantillon à peine positif (R moyen ' + oos.rMoyen + ') : pas démontré, la marge d\'erreur dépasse le gain.' }; return { niveau: 'negatif', texte: 'NON RENTABLE hors échantillon (R moyen ' + oos.rMoyen + ', facteur de profit ' + (oos.profitFactor ?? 'n.d.') + ') : ces règles n\'ont pas d\'avantage démontré sur cet actif et cette unité de temps.' }; }

const ACTIFS = [
  { id: 'or', nom: 'Or (futures COMEX GC=F, Yahoo)', cout: 0.5, unite: '$', jour: () => lire('bougies-GC_F-1d.json'), h1: () => lire('bougies-GC_F-1h.json'), note: 'Futures continus non ajustés : les changements de contrat créent de petits sauts. H4 : seulement ~2 ans (limite de Yahoo).' },
  { id: 'us100', nom: 'Nasdaq 100 (^NDX, Yahoo)', cout: 2, unite: 'points', jour: () => lire('bougies-_NDX-1d.json'), h1: () => lire('bougies-_NDX-1h.json'), note: 'Indice au comptant : séance américaine seulement (le CFD de XTB cote presque 24 h). H4 : ~2 ans.' },
  { id: 'btc', nom: 'Bitcoin (BTC/USDT, Binance)', cout: 20, unite: '$', jour: () => binance('1d', Date.UTC(2017, 7, 20)), h4: () => binance('4h', Date.UTC(2017, 7, 20)), note: 'Données Binance depuis août 2017 ; Bitcoin cote 24 h sur 24.' }
];
const rapport = { genere: new Date().toISOString(), methode: 'walk-forward, 3 jeux de paramètres, entrée à l\'ouverture suivante, stop prioritaire, coûts inclus', actifs: [] };
for (const a of ACTIFS) {
  const jour = await a.jour(); const h4 = a.h4 ? await a.h4() : enH4(await a.h1(), Date.now()).filter(x => !x.enCours).map(({ enCours, ...b }) => b);
  const entree = { id: a.id, nom: a.nom, note: a.note, cout: a.cout, unite: a.unite, jour: { debut: new Date(jour[0].t).toISOString().slice(0, 10), fin: new Date(jour[jour.length - 1].t).toISOString().slice(0, 10), bougies: jour.length }, h4: { debut: new Date(h4[0].t).toISOString().slice(0, 10), fin: new Date(h4[h4.length - 1].t).toISOString().slice(0, 10), bougies: h4.length }, tf: {} };
  for (const [tf, B, cfg] of [['J', jour, { apprentissage: 3 * AN, test: AN }], ['H4', h4, { apprentissage: 1 * AN, test: 0.5 * AN }]]) {
    if (B.length < 600) { entree.tf[tf] = { erreur: 'historique trop court (' + B.length + ' bougies)' }; continue; }
    const wf = walkForward(B, jour, tf, a.cout, cfg), ansOOS = wf.fenetres.length ? (Date.parse(wf.fenetres[wf.fenetres.length - 1].fin) - Date.parse(wf.fenetres[0].debut)) / AN : 0, sOOS = statistiques(wf.oos), sINS = statistiques(wf.ins), fixe = simuler(B, signaux(B, jour, tf, PARAMS), { cout: a.cout }), sFixe = statistiques(fixe), annees = (B[B.length - 1].t - B[0].t) / AN;
    entree.tf[tf] = { fenetres: wf.fenetres.length, choix: wf.choix, horsEchantillon: resume(sOOS), enEchantillon: resume(sINS), toutLHistorique: resume(sFixe), parAn: +(sFixe.n / annees).toFixed(1), parMois: +(sFixe.n / annees / 12).toFixed(1), anneesHorsEchantillon: +ansOOS.toFixed(1), verdict: verdict(resume(sOOS), ansOOS), courbeHorsEchantillon: courbeEchantillon(wf.oos), derniersSignaux: signaux(B, jour, tf, PARAMS).slice(-5).map(s => ({ t: s.t, dir: s.dir, type: s.type, entree: +s.entree.toFixed(2), sl: +s.sl.toFixed(2), tp: +s.tp.toFixed(2), rr: s.rr })) };
  }
  rapport.actifs.push(entree); console.log(a.id, JSON.stringify(Object.fromEntries(Object.entries(entree.tf).map(([k, v]) => [k, v.erreur || { oos: v.horsEchantillon, pf: v.horsEchantillon.profitFactor, parMois: v.parMois, verdict: v.verdict.niveau }]))));
}
fs.writeFileSync(sortie, JSON.stringify(rapport)); console.log('écrit', sortie);

/* rapport lisible (Markdown) */
const f = v => (v == null ? 'n.d.' : String(v).replace('.', ','));
let md = '# Backtest des signaux H4 / Jour (généré le ' + rapport.genere.slice(0, 10) + ')\n\nMéthode : ' + rapport.methode + '. Règles de `trader-pro/terminal/signaux-hj.js`, fixées avant le calcul. Résultats en R (1 R = le risque pris sur le trade), coûts inclus. **Un backtest n’est pas une garantie.**\n\n';
for (const a of rapport.actifs) {
  md += '## ' + a.nom + '\n' + a.note + ' Coût supposé : ' + a.cout + ' ' + a.unite + ' par trade. Jour : ' + a.jour.debut + ' → ' + a.jour.fin + ' (' + a.jour.bougies + ' bougies) ; H4 : ' + a.h4.debut + ' → ' + a.h4.fin + ' (' + a.h4.bougies + ' bougies).\n\n';
  md += '| Unité | Signaux / mois | Hors échantillon : trades | Réussite | R moyen | Facteur de profit | Drawdown (R) | Période hors échantillon | Verdict |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const [tf, r] of Object.entries(a.tf)) { if (r.erreur) { md += '| ' + tf + ' | | | | | | | | ' + r.erreur + ' |\n'; continue; } const o = r.horsEchantillon; md += '| ' + tf + ' | ' + f(r.parMois) + ' | ' + o.n + ' | ' + Math.round(o.reussite * 100) + ' % | ' + f(o.rMoyen) + ' | ' + f(o.profitFactor) + ' | ' + f(o.drawdownR) + ' | ' + f(r.anneesHorsEchantillon) + ' an(s) | **' + r.verdict.niveau + '** : ' + r.verdict.texte + ' |\n'; }
  md += '\n';
}
md += '## Lecture honnête\n- « Hors échantillon » = trades pris sur des périodes jamais vues au moment de choisir le jeu de paramètres (walk-forward).\n- Un résultat positif sur peu d’années dans un marché haussier (l’or depuis 2024) ne prouve pas un avantage durable.\n- Les futures (or, Nasdaq) ne sont pas les CFD de XTB : spread, swap et gaps de week-end diffèrent.\n- Premier essai (délai H4 de 6 bougies, 6,3 signaux par mois sur l’or) : or H4 hors échantillon R moyen +0,125 sur 95 trades ; Nasdaq H4 −0,278 ; Bitcoin H4 −0,161 ; les résultats Jour étaient identiques. Le délai a été porté à 12 bougies pour respecter « quelques signaux par mois » (choix sur le nombre de signaux, pas sur le résultat).\n';
fs.writeFileSync(path.join(path.dirname(sortie), 'BACKTEST-HJ.md'), md);
