// Diagnostic de Kepler : « pourquoi rien n'est validé ? » (V4, phase 1 ; refait chaque jour par le service, phase 8).
//   node agent-pc/diagnostic.mjs [--sortie docs/DIAGNOSTIC_KEPLER.md] [--rapide]
// Lit l'état de l'agent (entonnoir de rejet), balaie les variantes de chaque famille sur la zone de recherche (jamais le jeu final), compare au hasard, écrit un document en français.
// Aucun critère de validation n'est lu en écriture ; aucun ordre ; aucun réseau.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierAgent, fichiersAgent, chargerEtat } from './etat-agent.mjs';
import { chargerSerie } from './travailleur.mjs';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { ORDRE_PAIRES } from '../planetes/mars/pc/agent-m6/paires.js';
import { ORDRE_V3, NOMS_V3 } from '../strategies/familles-v3.js';
import { CRITERES3, empreinteV3 } from '../strategies/criteres-v3.js';
import { entonnoir, parFamilleActif, balayerFamille, hasard, conclusion } from '../strategies/diagnostic-v4.js';

const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Calcule le diagnostic complet. `series` = { BTC: m15, … } ; `etat` = état de l'agent. Rend un objet sérialisable. */
export function calculerDiagnostic(etat, series, { rapide = false, familles = ORDRE_V3, maintenant = Date.now() } = {}) {
  const bal = [], hasardParPaire = [];
  for (const p of ORDRE_PAIRES) {
    const m15 = series[p]; if (!m15 || !m15.n) continue;
    const debutFinal = etat.coffre && etat.coffre[p] && etat.coffre[p].debutFinal; if (!debutFinal) continue;
    let fin = 0; while (fin < m15.n && m15.t[fin] < debutFinal) fin++;                           // zone de recherche seulement
    const ctx = construireContexte(tranche(m15, 0, fin));
    const config = configMoteurDe(p), plage = { de: 0, a: fin };
    for (const id of familles) bal.push({ paire: p, famille: balayerFamille(ctx, id, config, plage), ...{ variantes: 0 } });
    hasardParPaire.push({ paire: p, ...hasard(ctx, config, plage, { essais: rapide ? 6 : 20 }), couts: config });
  }
  for (const b of bal) { b.variantes = b.famille.variantes; b.avecAssezDeTrades = b.famille.avecAssezDeTrades; b.positivesNettes = b.famille.positivesNettes; b.positivesBrutes = b.famille.positivesBrutes; b.nettesSeuil = b.famille.nettesSeuil; }
  const ent = entonnoir(etat.backtests), pf = parFamilleActif(etat.backtests, { tradesMin: CRITERES3.horsEchantillon.tradesMin });
  const concl = conclusion({ entonnoirRes: ent, balayages: bal, pairesHasard: hasardParPaire });
  return { t: maintenant, criteres: { v3: empreinteV3() }, variantesTestees: Object.values(etat.compteurVariantes || {}).reduce((a, b) => a + b, 0), compteur: etat.compteurVariantes, entonnoir: ent, parFamille: pf, balayages: bal.map(b => ({ paire: b.paire, ...b.famille })), hasard: hasardParPaire, conclusion: concl };
}

export function redigerMarkdown(d, { audit = '' } = {}) {
  const L = [];
  L.push('# Diagnostic de Kepler : pourquoi rien n’est validé ?', '', '_Généré le ' + new Date(d.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC par `node agent-pc/diagnostic.mjs` à partir des vraies données du service. Les critères de validation (v3 `' + d.criteres.v3 + '`) n’ont pas été touchés._', '');
  L.push('## En bref', '', ...d.conclusion.lignes.map(x => '- ' + x), '');
  L.push('## 1. L’entonnoir de rejet', '', d.variantesTestees + ' variantes ont été testées (' + Object.entries(d.compteur || {}).map(([k, v]) => k + ' ' + v).join(', ') + '), regroupées en **' + d.entonnoir.evaluations + ' évaluations** (une famille de stratégies sur un actif, avec le walk-forward). Résultat : **' + d.entonnoir.validees + ' validée**.', '',
    '| Critère | Évaluations qui le ratent | Part | Ratent SEULEMENT celui-là |', '|---|---:|---:|---:|', ...d.entonnoir.criteres.map(c => '| ' + c.critere + ' | ' + c.rate + ' | ' + Math.round(c.part * 100) + ' % | ' + c.seul + ' |'), '',
    'Lecture : si le verrou était un critère « un peu trop strict », beaucoup d’évaluations ne rateraient que lui. Ici une évaluation rate en moyenne ' + fmt(d.entonnoir.moyenneRatees, 1) + ' critères (minimum ' + d.entonnoir.minRatees + ', médiane ' + d.entonnoir.medianeRatees + ').', '');
  L.push('## 2. Familles et actifs', '', 'Meilleure espérance **hors échantillon** (walk-forward) trouvée pour chaque famille × actif, avec le nombre de trades (il en faut ≥ ' + d.parFamille.tradesMin + ').', '',
    '| Famille | Actif | Espérance (R/trade) | Trades | Critères ratés |', '|---|---|---:|---:|---:|', ...d.parFamille.liste.map(x => '| ' + x.nom + ' | ' + x.paire + ' | ' + fmt(x.esperance) + ' | ' + x.trades + ' | ' + x.ratees + ' |'), '');
  L.push('**Les « presque »** (espérance positive mais trop peu de trades) : ' + (d.parFamille.presque.length ? '' : 'aucune.'), '', ...d.parFamille.presque.map(x => '- ' + x.nom + ' sur ' + x.paire + ' : ' + fmt(x.esperance) + ' R sur seulement ' + x.trades + ' trades (preuve insuffisante, pas une découverte).'), '');
  L.push('### Balayage des variantes sur la zone de recherche (avant / après frais)', '', '_Mesuré sur les données qui servent à choisir : optimiste. Sert à comprendre, pas à valider._', '',
    '| Actif | Famille | Variantes | ≥ 30 trades | Positives avant frais | Positives après frais | ≥ +0,25 R | Espérance nette médiane | Coût médian des frais (R) | Meilleure (≥ 30 trades) |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...d.balayages.map(b => '| ' + b.paire + ' | ' + b.nom + ' | ' + b.variantes + ' | ' + b.avecAssezDeTrades + ' | ' + b.positivesBrutes + ' | ' + b.positivesNettes + ' | ' + b.nettesSeuil + ' | ' + fmt(b.esperanceNetteMediane) + ' | ' + fmt(b.coutMoyenR) + ' | ' + (b.meilleur ? fmt(b.meilleur.esperance) + ' R / ' + b.meilleur.n + ' trades' : '—') + ' |'), '');
  L.push('### Le hasard, avec les mêmes coûts', '', '| Actif | Essais | Espérance moyenne | Meilleur essai | Avant frais (moyenne) | Frais moyens (R) | Frais par côté / spread / glissement (%) |', '|---|---:|---:|---:|---:|---:|---|',
    ...d.hasard.map(h => '| ' + h.paire + ' | ' + h.essais + ' | ' + fmt(h.esperanceMoyenne) + ' | ' + fmt(h.esperanceMax) + ' | ' + fmt(h.bruteMoyenne) + ' | ' + fmt(h.coutsMoyens) + ' | ' + h.couts.fraisPct + ' / ' + h.couts.spreadPct + ' / ' + h.couts.glissementPct + ' |'), '');
  L.push('## 3. Audit anti-triche du pipeline', '', audit || '_(voir le texte d’audit)_', '');
  L.push('## 4. Conclusion en langage simple', '', d.conclusion.verdict, '', '**Ce que cela veut dire pour la suite (V4) :** le moteur de validation fait son travail (il refuse ce qui n’est pas prouvé). Ce qui manque, ce sont des **données qui portent de l’information** (flux d’ordres, liquidité, liquidations, profil de volume) et des **idées avec une raison économique**. Les phases 2 à 7 de la V4 ajoutent exactement cela ; la validation, elle, ne devient pas plus facile.', '');
  return L.join('\n');
}

export const AUDIT_V4 = [
  '| Point contrôlé | Résultat |', '|---|---|',
  '| Signal sur bougie fermée, exécution à l’ouverture suivante | **OK.** `moteur.js` : le signal naît à la clôture de la bougie i, l’entrée se fait à l’ouverture de i + 1, avec spread et glissement défavorables. |',
  '| Pas de regard vers le futur dans les signaux | **OK.** Chaque stratégie passe le test du « poison du futur » (`verifierCausalite`) avant toute évaluation ; les informations H1 / H4 sont alignées sur la dernière bougie **fermée**. |',
  '| Stop et objectif dans la même bougie | **OK, prudent.** C’est le stop qui est compté. Un gap au-delà du stop sort à l’ouverture, au prix pire. |',
  '| Frais, spread, glissement | **OK mais à vérifier par Justin.** BTC 0,06 % par côté + 0,02 % + 0,02 %, SOL et DOGE plus larges. Ce sont des valeurs prudentes pour un CFD / prop, **pas les frais publics Kraken au comptant** (plus élevés). Les changer après coup serait de la sur-optimisation : ne le faire que si ce sont les vrais frais du contrat. |',
  '| Positions simultanées | **OK.** Une seule position à la fois, repos de 4 h après une sortie, 5 positions par semaine au plus, position ouverte à la fin des données non comptée. |',
  '| Séparation entraînement / test | **BUG CORRIGÉ.** Dans le walk-forward, le score d’entraînement comptait les trades **entrés** avant la fin de l’entraînement, même si leur **sortie** tombait dans le bloc de test : le résultat de ces trades dépendait donc d’un prix posté après la coupe (une fuite minuscule : au plus un trade par bloc, mais une fuite quand même). Désormais ces trades sont écartés de l’entraînement (`planetes/mars/pc/agent-btc/evaluation.js`, « purge V4 »). Effet : le choix des paramètres devient un peu plus honnête ; les critères ne changent pas. Les résultats en cache sont recalculés (le compteur de variantes ne baisse jamais). |',
  '| Jeu final | **OK.** Fixé une fois (coffre), jamais ouvert (0 ouverture sur BTC, SOL, DOGE), ce diagnostic ne le touche pas non plus. |',
  '| Tests multiples | **OK, et très sévère.** Le Sharpe déflaté et « espérance > hasard attendu » utilisent le nombre TOTAL de variantes jamais testées (plus de 8 000) : le seuil monte avec √(2 ln N). C’est volontaire (honnêteté), mais ça veut dire qu’une stratégie doit être **nettement** bonne, pas marginale. Les variantes d’une même famille sont corrélées, donc la correction est probablement plus dure que nécessaire : **je ne l’ai pas assouplie** (règle du projet). |'
].join('\n');

const estPrincipal = () => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (e) { return false; } };
if (estPrincipal()) {
  const args = process.argv.slice(2), arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const dossier = dossierAgent(), F = fichiersAgent(dossier), etat = chargerEtat(dossier), series = {};
  for (const p of ORDRE_PAIRES) series[p] = await chargerSerie(F.donnees, p).catch(() => null);
  const d = calculerDiagnostic(etat, series, { rapide: args.includes('--rapide') });
  const sortie = path.resolve(arg('--sortie') || path.join(racine, 'docs', 'DIAGNOSTIC_KEPLER.md'));
  fs.writeFileSync(sortie, redigerMarkdown(d, { audit: AUDIT_V4 }), 'utf8');
  fs.writeFileSync(path.join(dossier, 'diagnostic.json'), JSON.stringify(d), 'utf8');
  console.log('Diagnostic écrit : ' + sortie); console.log(d.conclusion.lignes.join('\n'));
}
