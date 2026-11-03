// KEPLER V8 : AUDIT DES VRAIS RÉSULTATS.
//   node tools/audit-kepler.mjs                 recalcule chaque trade du registre sur les vraies bougies Kraken M15, écrit les corrections et AUDIT-KEPLER.md
//   node tools/audit-kepler.mjs --sans-ecrire    même calcul, sans toucher au registre (rapport seulement)
//   node tools/audit-kepler.mjs --backtest       ajoute le backtest des stratégies existantes (entrées M15 + contexte H1, frais inclus, hors apprentissage, IC 95 %)
// Règles de l'audit (prudentes, identiques pour tous les trades) :
//   - l'ordre limite n'est rempli que si une bougie M15 a RÉELLEMENT touché le prix d'entrée (bas ≤ entrée pour un achat, haut ≥ entrée pour une vente), avant la fin de sa validité ;
//     si l'objectif est atteint avant le remplissage, l'ordre est annulé (le prix est parti sans nous) ;
//   - si le stop et l'objectif sont touchés dans la même bougie, le STOP compte (et dans la bougie du remplissage, seul le stop peut sortir) ;
//   - frais maker à l'entrée et à l'objectif, taker + demi-écart + glissement au stop et à la sortie au temps (réglage de coûts de l'agent : couts.json ou valeurs prudentes) ;
//   - un seul objectif : celui de la fiche « À COPIER » (l'exécution que Justin peut vraiment recopier) ; durée maximale 96 bougies M15 (24 h), puis sortie à la clôture.
// SIMULATION UNIQUEMENT : rien n'est envoyé à un courtier.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dossierAgent, lireJson, ecrireJson } from '../agent-pc/etat-agent.mjs';
import { creerRegistre, FICHIER_CORRECTIONS } from '../agent-pc/registre.mjs';
import { configRicheDe, lireCoutsReglage } from '../agent-pc/couts-reglage.mjs';
import { SETUPS_VOLUME } from '../strategies/volume/setups-volume.js';

const K = createRequire(import.meta.url)('../shared/portfolio.js');
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), args = new Set(process.argv.slice(2));
const dossier = dossierAgent(), Q = 900e3, MAX_BARRES = 96;
const KRAKEN = { BTC: 'XBTUSD', ETH: 'ETHUSD', SOL: 'SOLUSD', HYPE: 'HYPEUSD', DOGE: 'XDGUSD' };

async function bougiesKraken(actif) {
  const r = await fetch('https://api.kraken.com/0/public/OHLC?pair=' + KRAKEN[actif] + '&interval=15', { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Kraken HTTP ' + r.status);
  const j = await r.json(); if (j.error && j.error.length) throw new Error('Kraken : ' + j.error[0]); const l = Object.entries(j.result).find(([k, v]) => k !== 'last' && Array.isArray(v))[1];
  return l.slice(0, -1).map(k => ({ t: k[0] * 1000, o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));   // la dernière bougie (en cours) est écartée
}
const coutsDe = actif => { const c = configRicheDe(actif, lireCoutsReglage(dossier)); return { maker: c.makerPct, taker: c.fraisPct, lent: c.spreadPct / 2 + c.glissementPct }; };

/* Recalcule UN trade. Rend { statut, tEntree, tSortie, sortie, raison, R, fraisR, pourquoi } ou { statut: 'hors_donnees' }. */
export function recalculer(t, bougies, couts, maintenant = Date.now()) {
  const d = t.sens, E = t.entree, S = t.stop, T = t.tp, risque = Math.abs(E - S); if (!(risque > 0)) return { statut: 'invalide', pourquoi: 'entrée = stop' };
  const debut = t.tSignal, k0 = bougies.findIndex(b => b.t >= debut); if (k0 < 0 || bougies[0].t > debut) return { statut: 'hors_donnees', pourquoi: 'bougies Kraken absentes pour ce moment (720 dernières seulement)' };
  const finValide = t.tValide || (debut + 16 * Q); let k = k0, rempli = -1;
  for (; k < bougies.length; k++) {
    const b = bougies[k]; if (b.t >= finValide) break;
    const touche = d > 0 ? b.l <= E : b.h >= E, cible = T != null && (d > 0 ? b.h >= T : b.l <= T);
    if (touche) { rempli = k; break; }
    if (cible) return { statut: 'annulee', tSortie: b.t, raison: 'annulee', pourquoi: 'objectif atteint sans que l’entrée soit touchée' };
  }
  if (rempli < 0) return k < bougies.length || bougies[bougies.length - 1].t + Q >= finValide ? { statut: 'annulee', tSortie: finValide, raison: 'expiration', pourquoi: 'entrée jamais touchée avant la fin de validité' } : { statut: 'en_attente', pourquoi: 'entrée pas encore touchée, ordre encore valable' };
  const coutR = (pct, px) => pct / 100 * px / risque, sortir = (b, px, type, raison, pourquoi) => { const brut = d * (px - E) / risque, frais = coutR(couts.maker, E) + (type === 'maker' ? coutR(couts.maker, px) : coutR(couts.taker + couts.lent, px)); return { statut: 'cloturee', tEntree: bougies[rempli].t, tSortie: b.t, sortie: px, raison, R: +(brut - frais).toFixed(4), fraisR: +frais.toFixed(4), pourquoi }; };
  const bf = bougies[rempli]; if (d > 0 ? bf.l <= S : bf.h >= S) return sortir(bf, S, 'taker', 'sl', 'stop touché dans la bougie du remplissage');
  for (let q = rempli + 1; q < bougies.length; q++) {
    const b = bougies[q]; if (d > 0 ? b.l <= S : b.h >= S) return sortir(b, S, 'taker', 'sl', 'stop touché' + (T != null && (d > 0 ? b.h >= T : b.l <= T) ? ' (stop ET objectif dans la même bougie : le stop compte)' : ''));
    if (T != null && (d > 0 ? b.h >= T : b.l <= T)) return sortir(b, T, 'maker', 'tp', 'objectif touché');
    if (q - rempli >= MAX_BARRES) return sortir(b, b.c, 'taker', 'temps', 'durée maximale (24 h) : sortie à la clôture');
  }
  return { statut: 'ouverte', tEntree: bf.t, pourquoi: 'entrée touchée, ni stop ni objectif depuis' };
}

const fmtH = t => (t ? new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—');
async function audit() {
  const A = path.join(dossier), tr = lireJson(path.join(A, 'trader.json'), { propositions: [] }), vo = lireJson(path.join(A, 'volume-v14.json'), { signaux: [] }), ex = lireJson(path.join(A, 'registre.json'), null);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-kepler-')); if (ex) fs.writeFileSync(path.join(tmp, 'registre.json'), JSON.stringify({ ...ex, corrections: {} }));
  const reg = creerRegistre({ dossier: tmp }); reg.brancher({ trader: () => tr.propositions || [], volume: () => (vo.signaux || []).map(x => ({ ...x, nom: (SETUPS_VOLUME[x.setup] || {}).nom })) });
  const avant = reg.construire().registre, actifs = [...new Set(avant.trades.map(t => t.actif))], bougies = {}, erreurs = {};
  for (const a of actifs) { try { bougies[a] = await bougiesKraken(a); } catch (e) { erreurs[a] = String(e.message || e); } }
  let prix = {}; try { prix = K.lirePrixKraken(await (await fetch(K.urlPrixKraken(), { signal: AbortSignal.timeout(10000) })).json()); } catch (e) { /* sans prix : pas de flottant */ }
  const corrections = {}, lignes = [];
  for (const t of avant.trades) {
    if (t.statut === 'ignoree') continue; const b = bougies[t.actif]; if (!b) { lignes.push({ t, r: { statut: 'hors_donnees', pourquoi: 'bougies Kraken illisibles : ' + erreurs[t.actif] } }); continue; }
    const r = recalculer(t, b, coutsDe(t.actif)); lignes.push({ t, r });
    if (r.statut === 'cloturee' || r.statut === 'annulee') corrections[t.id] = { statut: r.statut, tEntree: r.tEntree ?? null, tSortie: r.tSortie ?? null, sortie: r.sortie ?? null, raison: r.raison, R: r.statut === 'cloturee' ? r.R : null, fraisR: r.fraisR ?? null, motif: 'audit Kraken : ' + r.pourquoi, source: t.source };
    else if (r.statut === 'ouverte' && t.statut !== 'ouverte') corrections[t.id] = { statut: 'ouverte', tEntree: r.tEntree, tSortie: null, sortie: null, R: null, raison: null, motif: 'audit Kraken : ' + r.pourquoi };
  }
  const apres = { ...avant, trades: avant.trades.map(t => (corrections[t.id] ? { ...t, ...corrections[t.id], audite: true } : t)) };
  const cA = K.calculer(avant, prix), cB = K.calculer(apres, prix);
  return { avant, apres, cA, cB, lignes, corrections, prix, erreurs };
}

/* ── Backtest : stratégies existantes, entrées M15 + contexte H1, frais inclus, hors apprentissage (40 % les plus récents), IC 95 % ── */
async function klinesBinance(sym, mois) {
  const fin = Date.now(), debut = fin - mois * 30.44 * 86400e3, out = []; let t0 = debut;
  while (t0 < fin) { const r = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=' + sym + '&interval=15m&limit=1000&startTime=' + Math.floor(t0), { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Binance HTTP ' + r.status); const j = await r.json(); if (!j.length) break; for (const k of j) out.push(k); t0 = j[j.length - 1][0] + Q; if (j.length < 1000) break; }
  const s = { n: out.length, t: new Float64Array(out.length), o: new Float64Array(out.length), h: new Float64Array(out.length), l: new Float64Array(out.length), c: new Float64Array(out.length), v: new Float64Array(out.length), vb: new Float64Array(out.length) };
  out.forEach((k, i) => { s.t[i] = +k[0]; s.o[i] = +k[1]; s.h[i] = +k[2]; s.l[i] = +k[3]; s.c[i] = +k[4]; s.v[i] = +k[5]; s.vb[i] = +k[9]; }); return s;
}
async function backtest() {
  const { retroTest } = await import('../strategies/trader/retrotest.js'), { SETUPS } = await import('../strategies/trader/moteur.js');
  const SYM = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', HYPE: 'HYPEUSDT', DOGE: 'DOGEUSDT' }, tous = [], parActif = {};
  for (const a of K.ACTIFS) {
    try {
      const mois = a === 'HYPE' ? 2 : 12, s = await klinesBinance(SYM[a], mois); if (s.n < 3000) { parActif[a] = { note: 'trop peu de bougies (' + s.n + ')' }; continue; }
      const c = configRicheDe(a, lireCoutsReglage(dossier)), r = retroTest(s, { actif: a, mois: Math.min(mois, Math.floor(s.n / 2920) - 1 || 1), couts: { fraisPct: c.fraisPct, makerPct: c.makerPct, spreadPct: c.spreadPct, glissementPct: c.glissementPct, filePct: 0.01 } });
      const clos = r.propositions.filter(p => p.resultat && p.resultat.statut === 'cloturee').sort((x, y) => x.i - y.i), coupe = Math.floor(clos.length * 0.6), oos = clos.slice(coupe);
      for (const p of oos) tous.push({ id: a + p.i + p.setup, actif: a, strategie: SETUPS[p.setup] || p.setup, statut: 'cloturee', R: p.resultat.R, tSortie: s.t[Math.min(s.n - 1, p.i)], entree: 1, stop: 2, sens: 1 });
      parActif[a] = { de: new Date(r.de).toISOString().slice(0, 10), a: new Date(r.a).toISOString().slice(0, 10), nTotal: clos.length, nOos: oos.length, debutOos: oos.length ? new Date(s.t[oos[0].i]).toISOString().slice(0, 10) : null };
    } catch (e) { parActif[a] = { note: 'erreur : ' + String(e.message || e).slice(0, 100) }; }
  }
  // Stratégies de VOLUME (setups suivis par le service) : signal détecté sur H1 (contexte), entrée et sortie jouées sur les bougies M15 (comme en direct depuis la V8)
  const vol = [], volActif = {};
  try {
    const { chargerSerie } = await import('../agent-pc/volume-donnees.mjs'), { DETECTEURS, SETUPS_VOLUME: SV } = await import('../strategies/volume/setups-volume.js'), { simulerSignal } = await import('../strategies/volume/simulation-volume.js'), { coutsPour, MOIS_PAR_ACTIF } = await import('../agent-pc/volume-recherche.mjs');
    const rech = lireJson(path.join(dossier, 'volume-v14-recherche.json'), null), configs = ((rech && rech.configs) || [{ setup: 'acceptation_hors_valeur', tf: 'H1', params: { relatif: 1, rr: 3, riskMinAtr: 3 } }]).concat(['M15', 'H1'].map(tf => ({ setup: 'impulsion_volume', tf, params: { rangeAtr: 1.5, relatif: 1.5, rr: 2, riskMinAtr: 2 } })));
    for (const a of K.ACTIFS) {
      const S = chargerSerie(a, { mois: MOIS_PAR_ACTIF[a] || 12, dossier }); if (!S) { volActif[a] = 'historique des transactions absent : non testé'; continue; }
      const m = S.m15, idxM = t => { let lo = 0, hi = m.nBarres - 1; while (lo < hi) { const k = (lo + hi + 1) >> 1; if (m.t[k] <= t) lo = k; else hi = k - 1; } return m.t[lo] === t ? lo : -1; };
      for (const c of configs) {
        const sH = c.tf === 'H1' ? S.h1 : m, sigs = DETECTEURS[c.setup](sH, c.params), trades = []; let dernier = -1;
        for (const sg of sigs) { const i = c.tf === 'H1' ? idxM(sH.t[sg.i] + sH.pas - Q) : sg.i; if (i < 0 || i <= dernier) continue; const r = simulerSignal(m, { ...sg, i, validite: c.tf === 'H1' ? sg.validite * 4 : sg.validite }, coutsPour(a, dossier), { maxBarres: 96 }); if (!r || r.ouvert) continue; dernier = r.iSortie; trades.push(r); }
        trades.sort((x, y) => x.tSortie - y.tSortie); const oos = trades.slice(Math.floor(trades.length * 0.6));
        for (const r of oos) vol.push({ id: a + c.setup + c.tf + r.tSortie, actif: a, strategie: SV[c.setup].nom + ' (signal ' + c.tf + ', entrée M15)', statut: 'cloturee', R: r.R, tSortie: r.tSortie, entree: 1, stop: 2, sens: 1 });
      }
      volActif[a] = 'de ' + S.de + ' à ' + S.a;
    }
  } catch (e) { volActif.erreur = String(e.message || e).slice(0, 160); }
  const parStrat = K.grouper(tous, t => t.strategie).concat(K.grouper(vol, t => t.strategie)), parA = K.grouper(tous.concat(vol), t => t.actif), global = K.stats(tous.concat(vol));
  return { parStrat, parA, global, parActif, volActif, nVol: vol.length };
}

const ligneR = x => (x == null ? '—' : K.signe(x, 3));
const ic = s => (s.ic95 ? K.signe(s.ic95[0], 3) + ' … ' + K.signe(s.ic95[1], 3) : '—');
async function main() {
  const a = await audit(), modifs = a.lignes.filter(l => a.corrections[l.t.id]);
  const changeR = l => { const c = a.corrections[l.t.id]; return c && (c.statut !== l.t.statut || (c.R != null && Math.abs((l.t.R ?? 0) - c.R) > 0.005) || (c.tSortie && l.t.tSortie && Math.abs(c.tSortie - l.t.tSortie) >= Q)); };
  if (!args.has('--sans-ecrire')) { ecrireJson(path.join(dossier, FICHIER_CORRECTIONS), { t: Date.now(), source: 'Kraken OHLC M15 (api.kraken.com, 720 dernières bougies)', regles: 'entrée touchée seulement ; stop d’abord si stop et objectif dans la même bougie ; frais et glissement inclus ; un seul objectif ; 24 h au plus', corrections: a.corrections }); }
  let bt = null; if (args.has('--backtest')) { bt = await backtest(); fs.writeFileSync(path.join(racine, 'shared', 'backtest-v8.json'), JSON.stringify({ t: Date.now(), periode: '12 derniers mois (HYPE : 2), 40 % les plus récents', lignes: bt.parStrat.map(x => ({ cle: x.cle, n: x.n, rMoyen: x.rMoyen, ic95: x.ic95, prouve: x.prouve })) }, null, 1)); }
  const L = [];
  L.push('# Audit Kepler V8', '', 'Généré le ' + new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) + ' par `node tools/audit-kepler.mjs' + (bt ? ' --backtest' : '') + '`. **Simulation uniquement : aucun ordre réel.**', '');
  L.push('## Règles de l’audit', '', '- Bougies **Kraken M15** réelles (API publique, 720 dernières bougies, ≈ 7,5 jours) : tous les trades du registre sont dans cette fenêtre.', '- L’entrée n’est remplie que si une bougie a **réellement touché** le prix d’entrée avant la fin de validité ; si l’objectif est atteint avant, l’ordre est annulé.', '- Stop et objectif dans la même bougie : **le stop compte** (dans la bougie du remplissage, seul le stop peut sortir).', '- Frais et glissement inclus (réglage de coûts de l’agent) ; un seul objectif (celui de la fiche « À COPIER ») ; 24 h au plus, puis sortie à la clôture.', '- Les moteurs gardaient une gestion plus favorable (sortie partielle à l’objectif 1, stop remonté à l’entrée, objectif 2) et des entrées « H1 » horodatées à l’heure ronde : l’audit applique ce que l’on peut réellement recopier chez le courtier.', '');
  L.push('## Avant / après (même module de calcul, risque ' + K.nombre(a.cB.risquePct, 2) + ' % par trade, prix Kraken du moment pour le flottant)', '', '| | Avant audit | Après audit |', '|---|---|---|');
  const row = (n, f) => L.push('| ' + n + ' | ' + f(a.cA) + ' | ' + f(a.cB) + ' |');
  row('Trades clôturés', c => String(c.stats.n)); row('Gagnants / perdants', c => c.stats.gagnes + ' / ' + c.stats.perdus); row('Réussite', c => (c.stats.taux == null ? '—' : K.nombre(c.stats.taux * 100, 1) + ' %'));
  row('R moyen (frais inclus)', c => ligneR(c.stats.rMoyen)); row('IC 95 % du R moyen', c => ic(c.stats)); row('Cumul', c => K.signe(c.stats.cumulR, 3) + ' R');
  row('Réalisé', c => K.signeUsd(c.realiseUsd)); row('Flottant', c => K.signeUsd(c.flottantUsd)); row('Capital', c => K.usd(c.capital)); row('Baisse max', c => K.nombre(c.baisseMaxPct, 2) + ' %'); row('Positions ouvertes / en attente', c => c.nOuverts + ' / ' + c.nEnAttente); row('Annulées', c => String(c.nAnnules));
  L.push('', '## Trades modifiés et pourquoi', '');
  const vraies = a.lignes.filter(changeR);
  if (!vraies.length) L.push('Aucun trade modifié de façon significative.');
  else { L.push('| Trade | Actif | Sens | Avant | Après | Pourquoi |', '|---|---|---|---|---|---|');
    for (const l of vraies) { const c = a.corrections[l.t.id], av = l.t.statut + (l.t.R != null ? ' ' + K.signe(l.t.R, 2) + ' R' : '') + (l.t.tSortie ? ' (sortie ' + fmtH(l.t.tSortie) + ')' : ''), ap = c.statut + (c.R != null ? ' ' + K.signe(c.R, 2) + ' R' : '') + (c.tSortie ? ' (sortie ' + fmtH(c.tSortie) + ')' : ''); L.push('| `' + l.t.id + '` | ' + l.t.actif + ' | ' + (l.t.sens > 0 ? 'achat' : 'vente') + ' | ' + av + ' | ' + ap + ' | ' + l.r.pourquoi + ' |'); } }
  const nonAudites = a.lignes.filter(l => l.r.statut === 'hors_donnees' || l.r.statut === 'invalide'); if (nonAudites.length) L.push('', 'Non audités : ' + nonAudites.map(l => l.t.id + ' (' + l.r.pourquoi + ')').join(' ; ') + '.');
  L.push('', '## Vrais chiffres après audit, par stratégie et par actif', '', '| Groupe | Trades | R moyen | IC 95 % | Réussite | Cumul |', '|---|---|---|---|---|---|');
  for (const g of a.cB.parStrategie.concat(a.cB.parActif)) L.push('| ' + g.cle + ' | ' + g.n + ' | ' + ligneR(g.rMoyen) + ' | ' + ic(g) + ' | ' + K.nombre(g.taux * 100, 0) + ' % | ' + K.signe(g.cumulR, 2) + ' R |');
  L.push('', a.cB.stats.n < 30 ? '**Avec ' + a.cB.stats.n + ' trades clôturés, aucun verdict n’est possible** : la fourchette à 95 % est beaucoup trop large. ' + (a.cB.stats.rMoyen > 0 ? 'Le résultat positif peut être du hasard.' : 'Le résultat est négatif.') : (a.cB.stats.prouve ? 'Résultat positif avec 95 % de confiance.' : 'Résultat **non prouvé** (la fourchette à 95 % contient zéro).'));
  if (bt) {
    L.push('', '## Backtest V8 des stratégies existantes (entrées M15, contexte H1, frais inclus)', '', 'Données Binance M15 (12 derniers mois ; HYPE : 2 mois, historique court). Seuls les **40 % de trades les plus récents** sont comptés (« hors apprentissage »). Limite honnête : les règles ont été écrites en 2026 en regardant le passé, donc aucune période n’est parfaitement « jamais vue ». Mêmes frais que l’audit, gestion du moteur (sortie partielle).', '');
    L.push('| Stratégie | Trades hors apprentissage | R moyen | IC 95 % | Réussite | Prouvée ? |', '|---|---|---|---|---|---|'); for (const g of bt.parStrat) L.push('| ' + g.cle + ' | ' + g.n + ' | ' + ligneR(g.rMoyen) + ' | ' + ic(g) + ' | ' + K.nombre(g.taux * 100, 0) + ' % | ' + (g.prouve ? '**oui**' : 'non') + ' |');
    L.push('', '| Actif | Trades | R moyen | IC 95 % | Période |', '|---|---|---|---|---|'); for (const g of bt.parA) { const p = bt.parActif[g.cle] || {}; L.push('| ' + g.cle + ' | ' + g.n + ' | ' + ligneR(g.rMoyen) + ' | ' + ic(g) + ' | ' + (p.debutOos || '?') + ' → ' + (p.a || '?') + ' |'); }
    for (const [k, p] of Object.entries(bt.parActif)) if (p.note) L.push('', '- ' + k + ' : ' + p.note);
    L.push('', 'Ensemble : ' + bt.global.n + ' trades, R moyen ' + ligneR(bt.global.rMoyen) + ' (IC 95 % ' + ic(bt.global) + ').', '', bt.parStrat.some(g => g.prouve) ? 'Stratégie(s) rentable(s) avec 95 % de confiance : ' + bt.parStrat.filter(g => g.prouve).map(g => g.cle).join(', ') + '.' : '**Aucune stratégie n’est prouvée rentable** (aucune fourchette à 95 % entièrement au-dessus de zéro). L’interface l’affiche dans le « Verdict honnête ».');
    L.push('', 'Stratégies de volume (' + bt.nVol + ' trades hors apprentissage) : signal détecté sur H1 (contexte), entrée et sortie jouées sur les bougies M15, sur l’historique des transactions installé : ' + Object.entries(bt.volActif).map(([k, x]) => k + ' ' + x).join(' ; ') + '. La recherche quotidienne du service (onglet « Positions d’avant ») utilise encore son propre rejeu H1 : ses chiffres ne sont PAS ceux du verdict.');
  }
  fs.writeFileSync(path.join(racine, 'AUDIT-KEPLER.md'), L.join('\n') + '\n');
  console.log('Audit : ' + a.lignes.length + ' trades recalculés, ' + vraies.length + ' modifiés, capital ' + K.usd(a.cA.capital) + ' → ' + K.usd(a.cB.capital) + (bt ? ' ; backtest : ' + bt.global.n + ' trades hors apprentissage' : '') + '. AUDIT-KEPLER.md écrit.' + (args.has('--sans-ecrire') ? ' (registre non modifié)' : ' Corrections : ' + path.join(dossier, FICHIER_CORRECTIONS)));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
