// M6 : le « poison du futur » pour TOUTES les mesures et TOUTES les stratégies (familles d'origine, microstructure, gabarits, règles aléatoires, détecteurs ICT, indicateurs du graphique).
// Lancer :  node planetes/mars/tests/m6-poison-test.mjs
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { alignerDeriv, construireMicro } from '../pc/agent-btc/micro-mesures.js';
import { FAMILLES, ORDRE_TOUTES, combinaisons } from '../pc/agent-btc/hypotheses.js';
import { GABARITS } from '../pc/agent-btc/familles-m5.js';
import { regleAleatoire, signauxDepuisRegle, validerRegle } from '../pc/agent-btc/regles-lab.js';
import { verifierColonnes, verifierSignaux, poisonner, couper, phraseCausalite } from '../pc/agent-m6/causalite.js';
import { REGISTRE_DETECTEURS_M6 } from '../pc/agent-m6/registre-causal.js';
import { marcheMixte } from './synth-btc.mjs';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

const M = marcheMixte(12000, 9), COUPES = [4001, 7003, 10007];
function syntheseDeriv(S, graine) {
  const a = alea(graine), funding = [], metrics = []; let taux = 0.0001, oi = 90000;
  for (let t = Math.floor(S.t[0] / (8 * 3600e3)) * 8 * 3600e3; t <= S.t[S.n - 1] + 900e3; t += 8 * 3600e3) { taux = Math.max(-0.0008, Math.min(0.001, taux + (a() - 0.5) * 0.0002)); funding.push({ t, taux }); }
  for (let t = S.t[0]; t <= S.t[S.n - 1] + 900e3; t += 300e3) { oi *= 1 + (a() - 0.5) * 0.004; metrics.push({ t, oi, oiValeur: oi * 80000, lsGros: 1 + a(), lsComptes: 1 + a(), taker: 0.5 + a() }); }
  return { funding, metrics };
}
const derivBrut = syntheseDeriv(M, 3);
const ctxDe = s => construireContexte(s, { deriv: alignerDeriv(s.t, derivBrut) });

// ── sanité du harnais : une fonction qui TRICHE doit être attrapée ──
{
  const triche = s => ({ x: Float64Array.from(s.c, (_, j) => (j + 1 < s.n ? s.c[j + 1] : s.c[j])) });          // regarde la bougie suivante
  const r = verifierColonnes(triche, M, COUPES);
  v('le harnais ATTRAPE une fuite (valeur de la bougie suivante)', !r.ok && r.violations.length > 0, JSON.stringify(r.violations[0]));
  const honnete = s => ({ x: Float64Array.from(s.c, (_, j) => (j > 0 ? s.c[j - 1] : s.c[j])) });
  v('le harnais laisse passer une fonction honnête', verifierColonnes(honnete, M, COUPES).ok);
  const p = poisonner(M, 5000);
  v('poisonner ne touche pas le passé', p.c[4999] === M.c[4999] && p.c[5000] === M.c[5000] && p.c[5001] !== M.c[5001] && p.v[6000] === 1e12);
  v('couper garde exactement i+1 bougies', couper(M, 5000).n === 5001);
}

// ── familles d'origine et microstructure : deux jeux de paramètres chacune ──
let nSignaux = 0;
for (const id of ORDRE_TOUTES) {
  const F = FAMILLES[id], liste = combinaisons(F.grille(0)), jeux = [liste[0], liste[Math.floor(liste.length / 2)]];
  for (const [k, p] of jeux.entries()) {
    const r = verifierSignaux(s => F.signaux(ctxDe(s), p), M, COUPES);
    const plein = F.signaux(ctxDe(M), p); for (let i = 0; i < M.n; i++) if (plein.sens[i]) nSignaux++;
    v('famille ' + id + ' #' + (k + 1) + ' : ' + phraseCausalite(r, id), r.ok, JSON.stringify(r.violations[0]));
  }
}
v('les familles produisent des signaux sur le marché synthétique', nSignaux > 20, nSignaux);

// ── gabarits M5 ──
for (const g of GABARITS) {
  const specs = g.specs(), jeux = [specs[0], specs[Math.floor(specs.length / 2)]];
  for (const [k, sp] of jeux.entries()) {
    const r = verifierSignaux(s => signauxDepuisRegle(ctxDe(s), sp.regle), M, COUPES);
    v('gabarit ' + g.id + ' #' + (k + 1), r.ok, JSON.stringify(r.violations[0]));
  }
}

// ── règles aléatoires ──
{
  let n = 0, mauvais = 0;
  for (let g = 3000; g < 3030; g++) {
    const r = regleAleatoire(g); if (!r || !validerRegle(r).ok) continue; n++;
    const res = verifierSignaux(s => signauxDepuisRegle(ctxDe(s), r), M, [5003, 9001]);
    if (!res.ok) { mauvais++; console.log('  fuite règle aléatoire', g, JSON.stringify(res.violations[0])); }
  }
  v('30 règles aléatoires : aucune fuite (' + n + ' testées)', n >= 20 && mauvais === 0, mauvais);
}

// ── mesures de microstructure ──
{
  const champs = ['asiaHaut', 'asiaBas', 'veilleHaut', 'veilleBas', 'vwap', 'sigma', 'volRel', 'ampATR', 'deltaRatio', 'cvd8', 'ratio8'];
  const r = verifierColonnes(s => { const mi = construireMicro(ctxDe(s)), o = {}; for (const c of champs) o[c] = mi[c]; return o; }, M, [4001, 8003]);
  v('mesures de microstructure : aucune fuite (' + r.testes + ' contrôles)', r.ok, JSON.stringify(r.violations[0]));
}

// ── détecteurs et indicateurs ajoutés par M6 (ICT, graphique, régime, etc.) ──
for (const d of REGISTRE_DETECTEURS_M6) {
  const r = d.type === 'signaux' ? verifierSignaux(s => d.calculer(s, ctxDe), M, COUPES, d.options || {}) : verifierColonnes(s => d.calculer(s, ctxDe), M, COUPES, d.options || {});
  v('M6 · ' + d.nom + ' : ' + phraseCausalite(r, d.nom), r.ok, JSON.stringify(r.violations[0]));
}
v('le registre M6 n’est pas vide (au moins ICT + indicateurs du graphique)', REGISTRE_DETECTEURS_M6.length >= 4, REGISTRE_DETECTEURS_M6.length);

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
