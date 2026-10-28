// Tests des familles filtrées (V6) : un filtre ne fait que RETIRER des signaux, reste causal, le financement n'invente rien.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/familles-filtrees-test.mjs
import { FILTRES, ORDRE_FILTRES, ORDRE_FILTREES, NOMS_FILTREES, FAMILLES_FILTREES, BASES_FILTRABLES, financementM15, attacherFinancement, idFiltree, exigencesFiltree } from '../../strategies/familles-filtrees.js';
import { famille, tailleGrille } from '../../strategies/familles-v3.js';
import { verifierCausalite } from '../../strategies/validation-v3.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { combinaisons } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('12 familles de base × 8 filtres = 96 familles filtrées, toutes retrouvables par leur identifiant', BASES_FILTRABLES.length === 12 && ORDRE_FILTRES.length === 8 && ORDRE_FILTREES.length === 96 && ORDRE_FILTREES.every(id => famille(id) && NOMS_FILTREES[id]));
v('chaque filtre a un nom et une hypothèse écrite', ORDRE_FILTRES.every(f => FILTRES[f].nom.length > 5 && FILTRES[f].hypothese.length > 40));
v('une famille filtrée garde la grille de sa base (même taille)', ORDRE_FILTREES.slice(0, 20).every(id => tailleGrille(id) === tailleGrille(FAMILLES_FILTREES[id].base)));
v('nom et description lisibles : « base · filtre »', /·/.test(NOMS_FILTREES['tendance_ma+tendance_h4']) && /seulement quand/.test(famille('tendance_ma+tendance_h4').description));

const m = marcheMixte(30000, 9), ctx = construireContexte(m);
const compter = s => { let n = 0; for (let i = 0; i < s.sens.length; i++) if (s.sens[i] !== 0) n++; return n; };
// sous-ensemble strict de la base : mêmes signaux (sens ET stop) aux endroits conservés
for (const [base, filtre] of [['tendance_ma', 'seance_eu_us'], ['divergence_rsi', 'tendance_h4'], ['tendance_pullback_h4', 'volatilite_normale'], ['cassure_h1_retest', 'volume_anormal'], ['faux_breakout', 'delta_confirme']]) {
  const p = combinaisons(famille(base).grille(0))[0], sb = famille(base).signaux(ctx, p), sf = famille(idFiltree(base, filtre)).signaux(ctx, p);
  let ajoutes = 0, differents = 0; for (let i = 0; i < ctx.n; i++) { if (sf.sens[i] !== 0 && sb.sens[i] === 0) ajoutes++; if (sf.sens[i] !== 0 && (sf.sens[i] !== sb.sens[i] || sf.stop[i] !== sb.stop[i])) differents++; }
  v(base + ' + ' + filtre + ' : sous-ensemble strict de la base (aucun signal ajouté, aucun stop changé)', ajoutes === 0 && differents === 0 && compter(sf) <= compter(sb), JSON.stringify({ base: compter(sb), filtree: compter(sf) }));
}
{
  const p = combinaisons(famille('tendance_ma').grille(0))[0], b = compter(famille('tendance_ma').signaux(ctx, p)), f = compter(famille('tendance_ma+seance_us').signaux(ctx, p));
  v('le filtre retire vraiment des signaux (séance américaine : au moins 20 % de moins)', f < b * 0.8 && f > 0, b + ' → ' + f);
  const s = famille('tendance_ma+seance_us').signaux(ctx, p); let hors = 0; for (let i = 0; i < ctx.n; i++) if (s.sens[i] !== 0) { const h = Math.floor((ctx.m15.t[i] % 86400e3) / 3600e3); if (h < 13 || h >= 21) hors++; }
  v('…et tous les signaux restants sont bien dans la séance', hors === 0);
}
// causalité
for (const id of ['tendance_ma+tendance_h4', 'cassure_h1_retest+seance_eu_us', 'balayage_h1_delta+delta_confirme']) {
  const f = famille(id), p = combinaisons(f.grille(0))[0], r = verifierCausalite(f, p, m, { coupes: 6, fenetre: 20000 });
  v('causalité « poison du futur » : ' + id, r.ok, JSON.stringify(r));
}
// financement
{
  const funding = [{ t: Date.UTC(2024, 0, 1, 0), taux: 0.0001 }, { t: Date.UTC(2024, 0, 1, 8), taux: -0.0002 }, { t: Date.UTC(2024, 0, 1, 16), taux: 0.0006 }];
  const t = [Date.UTC(2023, 11, 31), Date.UTC(2024, 0, 1, 0, 15), Date.UTC(2024, 0, 1, 7, 45), Date.UTC(2024, 0, 1, 8, 0), Date.UTC(2024, 0, 1, 20)], f = financementM15(funding, t);
  v('financement aligné sur les bougies : dernier taux déjà publié, NaN avant le premier (aucun regard vers le futur)', Number.isNaN(f[0]) && f[1] === 0.0001 && f[2] === 0.0001 && f[3] === -0.0002 && f[4] === 0.0006, JSON.stringify(Array.from(f)));
  const p = combinaisons(famille('tendance_ma').grille(0))[0];
  const sans = famille('tendance_ma+financement').signaux(construireContexte(m), p);
  v('sans données de financement : le filtre ne laisse passer AUCUN signal (jamais une valeur inventée)', compter(sans) === 0);
  const ctxF = construireContexte(m); attacherFinancement(ctxF, [{ t: m.t[0], taux: 0.0001 }]);
  v('financement constant à 0,01 % : ni « bas » (achat) ni « très haut » (vente) → aucun signal', compter(famille('tendance_ma+financement').signaux(ctxF, p)) === 0);
  const ctxB = construireContexte(m); attacherFinancement(ctxB, [{ t: m.t[0], taux: -0.0003 }]);
  const base = famille('tendance_ma').signaux(ctxB, p), avec = famille('tendance_ma+financement').signaux(ctxB, p);
  let achatsBase = 0, achatsAvec = 0, ventesAvec = 0; for (let i = 0; i < ctxB.n; i++) { if (base.sens[i] > 0) achatsBase++; if (avec.sens[i] > 0) achatsAvec++; if (avec.sens[i] < 0) ventesAvec++; }
  v('financement très négatif : les achats de la base passent, les ventes sont filtrées', achatsAvec === achatsBase && ventesAvec === 0 && achatsBase > 0, JSON.stringify({ achatsBase, achatsAvec, ventesAvec }));
  v('la famille « financement » déclare qu’elle exige ces données', exigencesFiltree('tendance_ma+financement') === 'financement' && exigencesFiltree('tendance_ma+seance_us') === null);
}
console.log('Familles filtrées : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
