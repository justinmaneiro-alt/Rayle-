import { validerRegle, signauxDepuisRegle, voisinsRegle, regleAleatoire, decrireRegle, cleRegle, CATALOGUE } from '../pc/agent-btc/regles-lab.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { simuler } from '../pc/agent-btc/moteur.js';
import { marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const base = { nom: 'Cassure H1 en tendance', cote: 'les-deux', conditions: [{ type: 'phase', tf: 'h4', valeurs: ['tendance'] }, { type: 'cassure', tf: 'h1', N: 48 }, { type: 'volume', min: 1 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 };

// ── validation ──
v('règle valide acceptée', validerRegle(base).ok);
v('type de condition inconnu refusé', !validerRegle({ ...base, conditions: [{ type: 'magie' }] }).ok);
v('valeur hors bornes refusée (RSI 150)', !validerRegle({ ...base, conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 150 }] }).ok);
v('côté inconnu refusé', !validerRegle({ ...base, cote: 'milieu' }).ok);
v('R hors bornes refusé', !validerRegle({ ...base, R: 50 }).ok && !validerRegle({ ...base, R: 0.2 }).ok);
v('stop absent refusé', !validerRegle({ ...base, stop: null }).ok);
v('aucune condition refusée', !validerRegle({ ...base, conditions: [] }).ok);
v('trop de conditions refusé', !validerRegle({ ...base, conditions: Array.from({ length: 9 }, () => ({ type: 'volume', min: 1 })) }).ok);
v('champs inconnus supprimés (injection)', (() => { const r = validerRegle({ ...base, evil: 'x', conditions: [{ type: 'volume', min: 1, code: 'alert(1)' }] }); return r.ok && !('evil' in r.regle) && !('code' in r.regle.conditions[0]); })());
v('le catalogue contient 18 types (14 d’origine + 4 de flux ajoutés en V4 : absorption, divergence_cvd, balayage_liquidite, flux_persistant)', Object.keys(CATALOGUE).length === 18 && ['absorption', 'divergence_cvd', 'balayage_liquidite', 'flux_persistant'].every(k => CATALOGUE[k]));

// ── signaux : causalité (poison du futur par coupure), déterminisme ──
const m15 = marcheMixte(24000, 5), ctx = construireContexte(m15);
const regles = [validerRegle(base).regle, ...Array.from({ length: 60 }, (_, i) => regleAleatoire(1000 + i)).filter(Boolean)];
v('le générateur produit des règles valides', regles.length > 40 && regles.every(r => validerRegle(r).ok));
v('générateur déterministe (même graine, même règle)', cleRegle(regleAleatoire(42)) === cleRegle(regleAleatoire(42)) && cleRegle(regleAleatoire(42)) !== cleRegle(regleAleatoire(43)));
let totalSignaux = 0, incoherences = 0, testes = 0;
for (const r of regles) {
  const full = signauxDepuisRegle(ctx, r); for (let i = 0; i < ctx.n; i++) if (full.sens[i]) totalSignaux++;
  for (const cut of [9000, 14003, 20011]) {
    const part = tranche(m15, 0, cut + 1), c2 = construireContexte(part), s2 = signauxDepuisRegle(c2, r);
    testes++; for (let i = 400; i <= cut; i++) { if (s2.sens[i] !== full.sens[i] || (full.sens[i] && Math.abs(s2.stop[i] - full.stop[i]) > 1e-9)) { incoherences++; if (incoherences < 4) console.log('  incohérence règle', decrireRegle(r), 'i =', i, 'coupe =', cut); break; } }
  }
}
v('causalité : signaux identiques sur la série complète et coupée (' + testes + ' coupes)', incoherences === 0, incoherences + ' incohérences');
v('les règles produisent des signaux sur un marché synthétique', totalSignaux > 50, totalSignaux);
// front montant : pas de signaux sur deux bougies de suite pour une règle à condition d'état seulement
{
  const r = validerRegle({ nom: 'état', cote: 'long', conditions: [{ type: 'phase', tf: 'h1', valeurs: ['tendance'] }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).regle, s = signauxDepuisRegle(ctx, r);
  let consecutifs = 0; for (let i = 1; i < ctx.n; i++) if (s.sens[i] && s.sens[i - 1]) consecutifs++;
  v('déclenchement sur front montant (jamais deux signaux d’affilée pour un état)', consecutifs === 0 && s.sens.some(x => x));
}
// miroir : pour 'short', "tendance" = baisse ; un signal long n'apparaît pas en phase baissière stricte
{
  const r = validerRegle({ nom: 'x', cote: 'les-deux', conditions: [{ type: 'phase', tf: 'h1', valeurs: ['tendance'] }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }).regle, s = signauxDepuisRegle(ctx, r);
  let faux = 0; for (let i = 0; i < ctx.n; i++) { if (s.sens[i] > 0 && ctx.h1.phase[i] !== 1) faux++; if (s.sens[i] < 0 && ctx.h1.phase[i] !== 2) faux++; }
  v('phase « tendance » lue dans le sens du trade (achat en hausse, vente en baisse)', faux === 0, faux);
}
// stop du bon côté, simulation sans erreur
{
  const s = signauxDepuisRegle(ctx, regles[0]); let mal = 0; for (let i = 0; i < ctx.n; i++) { if (s.sens[i] > 0 && !(s.stop[i] < m15.c[i])) mal++; if (s.sens[i] < 0 && !(s.stop[i] > m15.c[i])) mal++; }
  v('stop toujours du bon côté du prix', mal === 0, mal);
  const sim = simuler(m15, s, {}); v('le moteur simule la règle (trades produits)', sim.trades.length > 0, sim.trades.length);
}
// voisins
{
  const vs = voisinsRegle(regles[0]); v('voisins : plusieurs règles valides, distinctes, différentes de l’originale', vs.length >= 5 && vs.every(r => validerRegle(r).ok) && new Set(vs.map(cleRegle)).size === vs.length && !vs.some(r => cleRegle(r) === cleRegle(regles[0])), vs.length);
  v('voisins : un seul nombre change à la fois', vs.every(r => { const a = JSON.stringify(regles[0]).split(/[,{}[\]]/), b = JSON.stringify(r).split(/[,{}[\]]/); return a.filter((x, k) => x !== b[k]).length <= 1; }));
}
v('description en français', /Achat ou vente quand : .*phase H4.*ET cassure.*Stop : 2 ATR H1\. Objectif : 3 R\./.test(decrireRegle(regles[0])), decrireRegle(regles[0]));

// ── causalité de TOUS les gabarits de la recherche (niveaux 3 et 4) : première, dernière et variante du milieu de chaque chantier ──
{
  const { chantierDuNiveau, NB_CHANTIERS } = await import('../pc/agent-btc/familles-m5.js');
  let testes2 = 0, incoh2 = 0;
  for (const niv of [3, 4]) for (let k = 0; k < NB_CHANTIERS[niv]; k++) {
    const c = chantierDuNiveau(niv, k), echant = [c.variants[0], c.variants[c.variants.length >> 1], c.variants[c.variants.length - 1]];
    for (const vv of echant) {
      const full = signauxDepuisRegle(ctx, vv.params);
      for (const cut of [8000, 17001]) { const c2 = construireContexte(tranche(m15, 0, cut + 1)), s2 = signauxDepuisRegle(c2, vv.params); testes2++; for (let i = 400; i <= cut; i++) if (s2.sens[i] !== full.sens[i] || (full.sens[i] && Math.abs(s2.stop[i] - full.stop[i]) > 1e-9)) { incoh2++; console.log('  gabarit incohérent', c.id, 'i =', i); break; } }
    }
  }
  v('causalité de tous les gabarits M5 (' + testes2 + ' coupes) : aucun regard vers le futur', incoh2 === 0 && testes2 > 100, incoh2 + ' incohérences sur ' + testes2);
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
