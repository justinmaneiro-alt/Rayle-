// Tests des familles de la V6 (stratégies où les frais pèsent peu) : causalité, grilles, hypothèses, coût en R, validation, et une stratégie TRUQUÉE qui doit être rejetée.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/familles-v6-test.mjs
import { FAMILLES_V6, ORDRE_V6, NOMS_V6, tailleGrilleV6, hypotheseV6 } from '../../strategies/familles-v6.js';
import { famille, tailleGrille } from '../../strategies/familles-v3.js';
import { validerV3, verifierCausalite } from '../../strategies/validation-v3.js';
import { combinaisons, FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { evaluerVariante } from '../../planetes/mars/pc/agent-btc/evaluation.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { CRITERES3, empreinteV3 } from '../../strategies/criteres-v3.js';
import { empreinteCriteres } from '../../planetes/mars/pc/agent-btc/criteres.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('six familles V6 enregistrées dans le moteur', ORDRE_V6.length === 6 && ORDRE_V6.every(id => famille(id) && FAMILLES[id] === FAMILLES_V6[id]));
v('chaque famille : nom, description et HYPOTHÈSE économique écrites en français (qui perd, qui gagne, pourquoi, risque)', ORDRE_V6.every(id => NOMS_V6[id].length > 8 && FAMILLES_V6[id].description.length > 150 && /Qui perd/.test(hypotheseV6(id)) && /Qui gagne/.test(hypotheseV6(id)) && /Risque/.test(hypotheseV6(id))));
v('grilles raisonnables : de 8 à 50 variantes (jamais de grille aveugle)', ORDRE_V6.every(id => tailleGrilleV6(id) >= 8 && tailleGrilleV6(id) <= 50 && tailleGrille(id) === tailleGrilleV6(id)), ORDRE_V6.map(id => id + '=' + tailleGrilleV6(id)).join(' '));
v('marquées « riches » (signaux avec options d’exécution) et avec une unité de temps H1 / H4 / session', ORDRE_V6.every(id => FAMILLES_V6[id].riche === true && /H1|H4|session/.test(FAMILLES_V6[id].unite)));

const m = marcheMixte(30000, 9), ctx = construireContexte(m), historique = marcheMixte(170000, 5), config = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02, filePct: 0.02 }, plage = { de: 0, a: m.n };

// ── causalité : le signal en i ne dépend que de ce qui est connu à la clôture de i ──
for (const id of ORDRE_V6) {
  const grille = FAMILLES_V6[id].grille(0), combos = combinaisons(grille), essais = [combos[0], combos[combos.length - 1], combos[Math.floor(combos.length / 2)]];
  const res = essais.map(p => verifierCausalite(FAMILLES_V6[id], p, m, { coupes: 6, fenetre: 20000 }));
  v('causalité « poison du futur » : ' + id + ' (3 jeux de paramètres)', res.every(r => r.ok), JSON.stringify(res.map(r => r.ecarts)));
}

// ── signaux bien formés et coûts en R faibles ──
for (const id of ORDRE_V6) {
  const combos = combinaisons(FAMILLES_V6[id].grille(0)), p = combos[0], sig = FAMILLES_V6[id].signaux(ctx, p);
  let n = 0, mauvais = 0; for (let i = 0; i < ctx.n; i++) if (sig.sens[i] !== 0) { n++; const s = sig.sens[i]; if (!(s > 0 ? sig.stop[i] < ctx.m15.c[i] : sig.stop[i] > ctx.m15.c[i])) mauvais++; if (sig.limite && Number.isFinite(sig.limite[i]) && !(s > 0 ? sig.limite[i] > sig.stop[i] : sig.limite[i] < sig.stop[i])) mauvais++; }
  v(id + ' : produit des signaux, tous avec un stop du bon côté (et un niveau limite entre le prix et le stop)', sig.riche === true && n > 3 && mauvais === 0, JSON.stringify({ n, mauvais }));
}
{
  let tot = 0, nT = 0, rr = [];
  for (const id of ORDRE_V6) for (const p of combinaisons(FAMILLES_V6[id].grille(0)).slice(0, 6)) { const e = evaluerVariante(ctx, id, p, config, plage); for (const t of e.trades) { tot += t.coutsTotalR; nT++; rr.push(t.distancePct); } }
  const vieux = (() => { let c = 0, k = 0; for (const id of ['tendance_ma', 'divergence_rsi', 'faux_breakout']) for (const p of combinaisons(famille(id).grille(0)).slice(0, 6)) { const e = evaluerVariante(ctx, id, p, config, plage); for (const t of e.trades) { c += t.coutsTotalR; k++; } } return k ? c / k : 0; })();
  v('coût moyen des familles V6 (tous les coûts, en R) : sous 0,12 R, contre bien plus pour les familles M15 d’origine', nT > 200 && tot / nT < 0.12 && vieux > tot / nT * 1.5, 'V6 ' + (tot / nT).toFixed(3) + ' R sur ' + nT + ' trades ; anciennes ' + vieux.toFixed(3));
  v('les stops de la V6 sont larges (au moins 1,5 % en moyenne) : c’est ce qui rend les frais supportables', rr.reduce((a, b) => a + b, 0) / rr.length > 1.5, String(rr.reduce((a, b) => a + b, 0) / rr.length));
}
// ── les trades portent les mêmes champs que ceux du moteur d'origine (walk-forward, statistiques, régimes) ──
{
  const e = evaluerVariante(ctx, 'tendance_pullback_h4', combinaisons(FAMILLES_V6.tendance_pullback_h4.grille(0))[0], config, plage), t = e.trades[0];
  v('un trade riche a les champs du moteur d’origine (R, Rbrut, coutsR, distancePct, entree, sortie, t, tSortie, sens, barres, motif) + RbrutIdeal et coutsTotalR', t && ['R', 'Rbrut', 'coutsR', 'distancePct', 'entree', 'sortie', 't', 'tSortie', 'sens', 'barres', 'motif', 'RbrutIdeal', 'coutsTotalR'].every(k => k in t) && e.ordres && 'poses' in e.ordres);
}

// ── validation complète d'une famille V6 : même protocole, mêmes critères, rien d'assoupli ──
{
  const r = validerV3(historique, 'tendance_pullback_h4', { config, variantesAvant: 0 });
  v('validation V3 d’une famille V6 : s’exécute, statut cohérent, résultat complet (wf, bootstrap, prop, régimes) et coût moyen en R', r.ok && ['validee_backtest', 'non_validee', 'insuffisant'].includes(r.statut) && r.statut !== 'insuffisant' && r.wf && r.bootstrap && r.prop && r.regimes && r.coutMoyenR != null, r.statut + ' ' + (r.raison || ''));
  v('critères inchangés : v1 c9995253, v3 c9b4ddd4, résultat rattaché aux mêmes empreintes', empreinteCriteres() === 'c9995253' && empreinteV3() === 'c9b4ddd4' && r.criteres.v3 === 'c9b4ddd4' && CRITERES3.horsEchantillon.tradesMin === 150 && CRITERES3.horsEchantillon.esperanceMin === 0.25);
  v('un marché de bruit sans aucun avantage ne produit JAMAIS une stratégie validée (sur toutes les familles V6)', ORDRE_V6.every(id => validerV3(historique, id, { config, variantesAvant: 0 }).statut !== 'validee_backtest'));
}

// ── la stratégie TRUQUÉE : elle regarde le futur ; elle doit être REJETÉE, même si elle « gagne » ──
FAMILLES.triche_v6 = { id: 'triche_v6', nom: 'Triche (regarde le futur)', riche: true, unite: 'H1', description: 'Test : achète quand la bougie suivante monte.', grille: () => ({ a: [1, 2], b: [1] }),
  signaux(ctx, p) { const n = ctx.n, sens = new Int8Array(n), stop = new Float64Array(n); for (let i = 450; i < n - 2; i++) if (ctx.m15.c[i + 2] > ctx.m15.c[i] * 1.002) { sens[i] = 1; stop[i] = ctx.m15.c[i] * 0.99; } return { riche: true, sens, stop, R: 2, options: { stopMinAuto: true, coutPlafondR: 0.08, rrMin: 1.5 } }; } };
{
  const e = evaluerVariante(ctx, 'triche_v6', { a: 1, b: 1 }, config, plage);
  const r = validerV3(historique, 'triche_v6', { config, variantesAvant: 0 });
  v('la stratégie truquée « gagne » sur le papier (elle triche) mais la validation la REJETTE pour regard vers le futur', e.stats.esperance > 0 && r.statut === 'rejetee_causalite' && /futur/.test(r.raison), r.statut + ' esp ' + e.stats.esperance.toFixed(2));
}
// ── un « pic isolé » (une seule variante chanceuse) n'est pas une stratégie : il faut aussi des voisins positifs ──
{
  FAMILLES.pic_v6 = { id: 'pic_v6', nom: 'Pic isolé', riche: true, unite: 'H1', description: 'Test.', grille: () => ({ a: [1, 2, 3, 4, 5] }), signaux(ctx, p) { return FAMILLES.tendance_pullback_h4.signaux(ctx, { ema: 20, stopATR: 2, R: 2, sortie: 'fixe' }); } };
  const r = validerV3(historique, 'pic_v6', { config, variantesAvant: 5000 });
  v('avec des milliers de variantes déjà testées, un résultat moyen ne passe pas le Sharpe déflaté', r.statut !== 'validee_backtest');
  delete FAMILLES.pic_v6;
}
delete FAMILLES.triche_v6;
console.log('Familles V6 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
