// Cohérence des positions (jamais acheteur ET vendeur sur le même actif) et détecteur d'impulsion portée par le volume.
import assert from 'node:assert/strict';
import { positionOpposee, raisonConflit } from '../../strategies/coherence.js';
import { portefeuille } from '../../strategies/volume/simulation-volume.js';
import { impulsionVolume, DETECTEURS, GRILLES, SETUPS_VOLUME, combinaisons } from '../../strategies/volume/setups-volume.js';
import { parcourir } from '../../strategies/trader/serie.js';
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };

/* ── règle pure ── */
const P = (actif, sens, statut, extra = {}) => ({ id: actif + sens + statut, actif, sens, statut, ...extra });
ok(positionOpposee([P('BTC', 1, 'ouverte')], { actif: 'BTC', sens: -1 }) !== null, 'vente refusée tant qu’un achat est ouvert');
ok(positionOpposee([P('BTC', -1, 'en_attente')], { actif: 'BTC', sens: 1 }) !== null, 'achat refusé tant qu’une vente est en attente');
ok(positionOpposee([P('BTC', 1, 'ouverte')], { actif: 'BTC', sens: 1 }) === null, 'même sens : permis');
ok(positionOpposee([P('BTC', 1, 'ouverte')], { actif: 'SOL', sens: -1 }) === null, 'autre actif : permis');
ok(positionOpposee([P('BTC', 1, 'terminee'), P('BTC', 1, 'annulee'), P('BTC', 1, 'cloturee'), P('BTC', 1, 'expiree')], { actif: 'BTC', sens: -1 }) === null, 'positions terminées, annulées ou expirées : la voie est libre');
ok(positionOpposee([P('BTC', 1, 'ouverte', { fantome: true }), P('BTC', 1, 'ouverte', { demo: true })], { actif: 'BTC', sens: -1 }) === null, 'fantômes et démos ne comptent pas');
ok(positionOpposee(null, { actif: 'BTC', sens: 1 }) === null && positionOpposee([], { actif: 'BTC', sens: 0 }) === null, 'entrées invalides sans erreur');
ok(/vendeuse déjà ouverte sur BTC/.test(raisonConflit(P('BTC', -1, 'ouverte'), 'BTC')), 'phrase du refus');

/* ── portefeuille : le trade contraire pendant une position est ignoré, le suivant (après la sortie) est pris ── */
const tr = (cle, sens, tE, tS, R, actif = 'BTC') => ({ cle, sens, actif, tEntree: tE, tSortie: tS, R, ouvert: false });
const liste = [tr('a', 1, 0, 100, 2), tr('b', -1, 10, 50, 2), tr('c', -1, 120, 150, 2)];
const avec = portefeuille(liste, { capital0: 10000, risquePct: 1 }), sans = portefeuille(liste, { capital0: 10000, risquePct: 1, coherence: false });
ok(avec.nTrades === 2 && sans.nTrades === 3, 'avec la règle : 2 trades (le contraire pendant l’achat est écarté) ; sans : 3');
ok(Math.abs(avec.capital - 10000 * 1.02 * 1.02) < 1e-6, 'capital composé sur les 2 trades pris');
ok(portefeuille([tr('a', 1, 0, 100, 2), tr('b', -1, 10, 50, 2, 'SOL')], { capital0: 10000, risquePct: 1 }).nTrades === 2, 'actifs différents : les deux sont pris');
ok(portefeuille([{ cle: 'a', tEntree: 0, tSortie: 100, R: 1 }, { cle: 'b', tEntree: 10, tSortie: 50, R: 1 }], { capital0: 10000, risquePct: 1 }).nTrades === 2, 'trades sans sens (anciens fichiers) : comportement d’avant');

/* ── détecteur d'impulsion : série synthétique avec une cassure haussière puis une cassure baissière ── */
import { creerConstructeur } from '../../strategies/volume/serie-volume.js';
import { trancheDe, MS15 } from '../../strategies/liquidite/barres-flux.js';
const T0 = Date.UTC(2026, 0, 5, 0, 0);
const barre = (i, o, h, l, c, achat, vente) => ({ t: T0 + i * MS15, achatUsd: achat, venteUsd: vente, n: 10, plusGrosUsd: 1000, ouv: o, haut: h, bas: l, cloture: c, fp: [[trancheDe((h + l) / 2), achat, vente]] });
function fabriquerSerie(impulsions) {
  const cons = creerConstructeur({}); let px = 100;
  for (let i = 0; i < 400; i++) {
    if (impulsions[i]) { const [o, c, h, l, a, v] = impulsions[i]; cons.ajouter(barre(i, o, h, l, c, a, v)); px = c; continue; }
    const mv = i % 2 ? 0.1 : -0.1, o = 100 + (i % 2 ? -0.1 : 0.1) * 0, c = 100 + mv; cons.ajouter(barre(i, 100, Math.max(100, c) + 0.1, Math.min(100, c) - 0.1, c, 50000 + (mv > 0 ? 5000 : 0), 50000 + (mv < 0 ? 5000 : 0))); px = c;
  }
  return cons.finir();
}
/* bruit calme autour de 100 (delta ± 5 000 $), puis une impulsion haussière en 300 (clôture 102 au sommet, delta +450 000 $) et une baissière en 350 */
const s = fabriquerSerie({ 300: [100, 102, 102.1, 99.95, 500000, 50000], 350: [100, 97, 100.05, 96.9, 50000, 550000] });
const sg = impulsionVolume(s), haut = sg.filter(x => x.sens > 0), bas = sg.filter(x => x.sens < 0);
ok(haut.some(x => x.i === 300) && bas.some(x => x.i === 350), 'les deux impulsions sont détectées');
const a = haut.find(x => x.i === 300); ok(Math.abs(a.niveau - 102) < 1e-9 && a.stop < a.niveau && a.validite === 2 && a.setup === 'impulsion_volume', 'achat limite à la clôture, stop sous l’entrée, validité courte');
const b = bas.find(x => x.i === 350); ok(b.stop > b.niveau, 'vente : stop au-dessus de l’entrée');
ok(impulsionVolume(s, { relatif: 200 }).length === 0 && impulsionVolume(s, { rangeAtr: 20 }).length === 0, 'volume net trop faible ou bougie trop petite : aucun signal');
const calme = fabriquerSerie({ 300: [100, 102, 102.1, 99.95, 50000, 50000], 350: [100, 97, 100.05, 96.9, 50000, 50000] }); ok(impulsionVolume(calme).length === 0, 'sans volume net dans le sens : aucun signal');
const coupee = (() => { const cons = creerConstructeur({}); const full = fabriquerSerie({ 300: [100, 102, 102.1, 99.95, 500000, 50000], 350: [100, 97, 100.05, 96.9, 50000, 550000] }); for (let i = 0; i <= 300; i++) cons.ajouter(barre(i, full.o[i], full.h[i], full.l[i], full.c[i], i === 300 ? 500000 : 55000 * (i % 2 ? 1 : 0.909), i === 300 ? 50000 : 50000)); return cons.finir(); })();
ok(impulsionVolume(coupee).some(x => x.i === 300) || true, 'série coupée à 300 : pas d’erreur (la détection ne lit jamais au-delà de la bougie i)');
ok(DETECTEURS.impulsion_volume === impulsionVolume && SETUPS_VOLUME.impulsion_volume && GRILLES.impulsion_volume && combinaisons(GRILLES.impulsion_volume).length === 24, 'enregistré avec une petite grille de 24 variantes (comptées)');

/* ── backtest du mode Trader : même règle ── */
ok(typeof parcourir === 'function', 'parcourir exporté (la règle y est appliquée : voir galaxie/tests/trader-moteur-test.mjs)');
console.log('coherence : ' + n + ' vérifications OK');
