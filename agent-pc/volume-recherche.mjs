// Recherche V14 : stratégies construites sur les vrais indicateurs de volume (delta, CVD, profil, empreinte, absorption), sur des mois de transactions réelles.
//   node agent-pc/volume-recherche.mjs [--actifs BTC,SOL,DOGE]      écrit volume-v14-recherche.json + volume-v14-rejoue.json (+ coffre du jeu de test, jamais recalculé)
//   node agent-pc/volume-recherche.mjs --entonnoir                  mesure l'entonnoir des filtres (docs/DIAGNOSTIC_V14.md)
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dossierAgent, lireJson, ecrireJson } from './etat-agent.mjs';
import { chargerSerie } from './volume-donnees.mjs';
import { rechercher, entonnoir, evaluerVariante } from '../strategies/volume/recherche-volume.js';
import { portefeuille, stats, COUTS_DEFAUT } from '../strategies/volume/simulation-volume.js';
import { configRicheDe, lireCoutsReglage } from './couts-reglage.mjs';

export const FICHIER_RECHERCHE = 'volume-v14-recherche.json', FICHIER_COFFRE = 'volume-v14-coffre.json', FICHIER_REJOUE = 'volume-v14-rejoue.json', FICHIER_ENTONNOIR = 'volume-v14-entonnoir.json';
export const MOIS_PAR_ACTIF = Object.freeze({ BTC: 12, SOL: 36, DOGE: 36 });          // BTC : l'historique récent est téléchargé sur 12 mois ; SOL et DOGE en ont 3 ans
export function coutsPour(actif, dossier) {
  try { const c = configRicheDe(actif, lireCoutsReglage(dossier)); return { makerPct: c.makerPct, fraisPct: c.fraisPct, glissementPct: c.glissementPct, spreadPct: c.spreadPct, hypothese: 'frais du réglage de l’agent (couts.json ou valeurs prudentes)' }; } catch (e) { return { ...COUTS_DEFAUT }; }
}
/* Coûts COMMUNS aux actifs d'une recherche : le plus prudent de chacun (jamais plus optimiste que le pire actif). */
export function coutsCommuns(actifs, dossier) { const l = actifs.map(a => coutsPour(a, dossier)); return { makerPct: Math.max(...l.map(c => c.makerPct)), fraisPct: Math.max(...l.map(c => c.fraisPct)), glissementPct: Math.max(...l.map(c => c.glissementPct)), spreadPct: Math.max(...l.map(c => c.spreadPct)), hypothese: l[0].hypothese + ' ; le plus prudent des actifs' }; }
export function chargerSeries({ actifs = ['BTC', 'SOL', 'DOGE'], dossier = dossierAgent(), moisParActif = MOIS_PAR_ACTIF } = {}) {
  const series = {}, couvertures = {};
  for (const a of actifs) { const r = chargerSerie(a, { mois: moisParActif[a] || 12, dossier }); if (r) { series[a] = r; couvertures[a] = { de: r.de, a: r.a, jours: r.jours, trous: r.trous, barresM15: r.m15.nBarres }; } }
  return { series, couvertures };
}
export function choisirConfigsLive(finalistes, { n = 3, cibleSemaine = 2.5, rMin = 0.05 } = {}) {
  // Objectif de flux (3 à 10 propositions par semaine et par actif) : par setup, on préfère la variante qui atteint ≈ la cible SANS dégrader le R moyen hors apprentissage ; sinon la meilleure en R.
  const parSetup = new Map(); for (const f of finalistes) { if (f.oos.n < 30) continue; if (!parSetup.has(f.setup)) parSetup.set(f.setup, []); parSetup.get(f.setup).push(f); }
  const choix = [];
  for (const l of parSetup.values()) {
    const meilleur = [...l].sort((a, b) => b.oos.rMoyen - a.oos.rMoyen)[0], assezFrequent = l.filter(f => f.parSemaineActif >= cibleSemaine && f.oos.rMoyen >= rMin).sort((a, b) => b.oos.rMoyen - a.oos.rMoyen)[0], f = assezFrequent || meilleur;
    choix.push({ setup: f.setup, tf: f.tf, params: f.params, niveau: f.etiquette.niveau, oosR: f.oos.rMoyen, oosN: f.oos.n, parSemaineActif: f.parSemaineActif, pourquoi: assezFrequent ? 'variante qui atteint la fréquence visée sans dégrader le R moyen' : 'meilleure variante en R moyen hors apprentissage' });
  }
  choix.sort((a, b) => b.oosR - a.oosR); const positifs = choix.filter(c => c.oosR > 0);      // on concentre le portefeuille virtuel sur les 2-3 meilleurs ; si aucun n'est positif, on suit seulement le moins mauvais
  return (positifs.length ? positifs : choix.slice(0, 1)).slice(0, n);
}
/* Lance la recherche complète et ÉCRIT les fichiers ; rend le résumé. Le service l'appelle une fois par jour. */
export function lancerRecherche({ dossier = dossierAgent(), actifs = ['BTC', 'SOL', 'DOGE'], surProgres = null } = {}) {
  const { series, couvertures } = chargerSeries({ actifs, dossier }); if (!Object.keys(series).length) return { ok: false, raison: 'aucune donnée de transactions installée' };
  const couts = coutsCommuns(Object.keys(series), dossier), coffre = lireJson(path.join(dossier, FICHIER_COFFRE), {}) || {};
  const t0 = Date.now(), r = rechercher({ series, couts, coffre, surProgres, finalistesParSetup: 4 });
  const finalistes = r.finalistes.map(v => ({ id: v.id, setup: v.setup, tf: v.tf, params: v.params, appr: v.appr, valid: v.valid, test: v.test, testDejaOuvert: v.testDejaOuvert, oos: v.oos, parActif: v.parActif, etiquette: v.etiquette, parSemaineActif: v.parSemaineActif, hasardPool: v.hasardPool, signaux: v.signaux, nonRemplis: v.nonRemplis }));
  const configs = choisirConfigsLive(finalistes);
  const sortie = { t: Date.now(), dureeMs: Date.now() - t0, couvertures, couts, nEssais: r.nEssais, zones: r.zones, finalistes, configs, classement: r.variantes.map(v => ({ id: v.id, nAppr: v.appr.n, rAppr: v.appr.rMoyen, nValid: v.valid.n, rValid: v.valid.rMoyen })).sort((a, b) => b.rValid - a.rValid).slice(0, 40) };
  ecrireJson(path.join(dossier, FICHIER_RECHERCHE), sortie); ecrireJson(path.join(dossier, FICHIER_COFFRE), r.coffre);
  // REJOUÉ : les trades que les stratégies suivies AURAIENT pris sur toute la période (étiquetés « rejoué, pas réel »)
  const rejoue = { t: Date.now(), couvertures, couts, configs: [], trades: [] };
  for (const c of configs) {
    const ev = evaluerVariante(series, c.setup, c.params, c.tf, couts), tr = Object.values(ev.par).flat().filter(t => !t.ouvert).sort((a, b) => a.tEntree - b.tEntree);
    const par = {}; for (const [a, l] of Object.entries(ev.par)) par[a] = stats(l);
    rejoue.configs.push({ ...c, cle: c.setup + '·' + c.tf, stats: stats(tr), parActif: par });
    for (const t of tr) rejoue.trades.push({ cle: c.setup + '·' + c.tf, actif: t.actif, tf: c.tf, setup: c.setup, niv: t.niv, sens: t.sens, tSignal: t.tSignal, tEntree: t.tEntree, tSortie: t.tSortie, entree: t.entree, stop: t.stop, rr: t.rr, sortie: t.sortie, statut: t.statut, R: +t.R.toFixed(4), raison: t.raison });
  }
  rejoue.portefeuille = (() => { const p = portefeuille(rejoue.trades, { capital0: 10000, risquePct: 1 }); const pas = Math.max(1, Math.floor(p.courbe.length / 160)); return { ...p, courbe: p.courbe.filter((_, i) => i % pas === 0 || i === p.courbe.length - 1), pris: undefined, nPris: p.pris.length }; })();
  ecrireJson(path.join(dossier, FICHIER_REJOUE), rejoue);
  return { ok: true, nEssais: r.nEssais, finalistes: finalistes.length, configs, couvertures };
}
const estPrincipal = () => { try { return !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const dossier = dossierAgent(), actifs = val('--actifs', 'BTC,SOL,DOGE').split(',');
  if (args.includes('--entonnoir')) {
    const { series, couvertures } = chargerSeries({ actifs, dossier }); console.log('Données :', JSON.stringify(couvertures)); const couts = coutsCommuns(Object.keys(series), dossier);
    const reglages = [
      { setup: 'absorption_extreme', tf: 'H1', params: { fen: 24, facteur: 1.5, entree: 0.5, rr: 2, riskMinAtr: 2 } }, { setup: 'absorption_extreme', tf: 'M15', params: { fen: 96, facteur: 2, entree: 0.5, rr: 2, riskMinAtr: 2 } },
      { setup: 'rejet_niveau', tf: 'M15', params: { niveaux: 'poc,vah,val', meche: 0.3, relatif: 0.5, rr: 2, riskMinAtr: 2 } }, { setup: 'rejet_niveau', tf: 'H1', params: { niveaux: 'poc,vah,val', meche: 0.3, relatif: 0.5, rr: 2, riskMinAtr: 2 } },
      { setup: 'acceptation_hors_valeur', tf: 'H1', params: { relatif: 1, rr: 2, riskMinAtr: 2 } }, { setup: 'divergence_cvd', tf: 'H1', params: { fen: 24, rr: 2, riskMinAtr: 2 } }, { setup: 'diamant', tf: 'M15', params: { minConf: 2, facteur: 1, rr: 2, riskMinAtr: 2 } }
    ];
    const e = entonnoir({ series, couts, reglages }); ecrireJson(path.join(dossier, FICHIER_ENTONNOIR), { t: Date.now(), couvertures, couts, lignes: e });
    for (const x of e) { console.log('\n' + x.setup + ' ' + x.tf + ' : ' + x.base.n + ' trades sans filtre, ' + x.parSemaineActifSansFiltre.toFixed(1) + '/sem/actif, R ' + x.base.rMoyen.toFixed(3)); for (const c of x.cumule) console.log('   + ' + c.filtre.padEnd(38) + ' restants ' + String(c.restants).padStart(4) + ' (' + c.parSemaineActif.toFixed(1) + '/sem) R ' + c.rMoyen.toFixed(3) + (c.rMoyenElimines != null ? ' | éliminés ' + c.elimines + ' R ' + c.rMoyenElimines.toFixed(3) : '')); }
  } else {
    const r = lancerRecherche({ dossier, actifs, surProgres: n => { if (n % 50 === 0) process.stdout.write('.'); } }); console.log('\n' + JSON.stringify(r.ok ? { nEssais: r.nEssais, configs: r.configs, couvertures: r.couvertures } : r));
    const s = lireJson(path.join(dossier, FICHIER_RECHERCHE), null);
    for (const f of (s && s.finalistes) || []) console.log(f.id.split('@')[0], '| appr', f.appr.n, f.appr.rMoyen.toFixed(3), '| valid', f.valid.n, f.valid.rMoyen.toFixed(3), '| test', f.test.n, f.test.rMoyen.toFixed(3), '| oos', f.oos.n, f.oos.rMoyen.toFixed(3), 'IC', f.oos.ic95.map(x => x.toFixed(3)).join('..'), '|', f.etiquette.niveau, '| /sem/actif', f.parSemaineActif.toFixed(1), '| hasard', f.hasardPool.rMoyen.toFixed(3));
  }
}
