// Frais en R de Kepler (V6, phase 1) : « où l'avantage brut existe-t-il mais est-il détruit par les frais ? ».
//   node agent-pc/couts-en-r.mjs [--sortie docs/COUTS_EN_R.md] [--rapide] [--familles id1,id2] [--paires BTC,SOL]
// Lit les vraies bougies du service (zone de RECHERCHE seulement : le jeu final n'est jamais lu), simule toutes les variantes de la grille de base de chaque famille avec les coûts de couts.json (sinon les
// valeurs prudentes), regroupe les trades par taille de stop et écrit un document en français + couts-en-r.json (pour l'écran). Aucun critère de validation n'est lu en écriture ; aucun ordre ; aucun réseau.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierAgent, fichiersAgent, chargerEtat } from './etat-agent.mjs';
import { chargerSerie } from './travailleur.mjs';
import { lireCoutsReglage, configRicheDe, phraseSource } from './couts-reglage.mjs';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { ORDRE_PAIRES } from '../planetes/mars/pc/agent-m6/paires.js';
import { ORDRE_V3 } from '../strategies/familles-v3.js';
import { ORDRE_V4 } from '../strategies/familles-v4.js';
import { hasard } from '../strategies/diagnostic-v4.js';
import { analyserFamilleCouts, syntheseCouts, lignesTableau, comparerEntreesFamille } from '../strategies/analyse-couts.js';
import { coutEstimeR, tauxEquilibre, esperanceProfil } from '../strategies/couts-r.js';

const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d).replace('.', ','));   // jamais « -0,00 »
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ORDRE_V6 = []; try { ORDRE_V6 = (await import('../strategies/familles-v6.js')).ORDRE_V6 || []; } catch (e) { /* la V6 n'est pas encore là : on analyse les familles existantes */ }

export function calculerCouts(etat, series, { familles = [...ORDRE_V3, ...ORDRE_V4, ...ORDRE_V6], paires = ORDRE_PAIRES, rapide = false, reglage = lireCoutsReglage(), maintenant = Date.now(), surProgres = null } = {}) {
  const analyses = [], hasardParPaire = [], configs = {}, entrees = [];
  for (const p of paires) {
    const m15 = series[p]; if (!m15 || !m15.n) continue;
    const debutFinal = etat.coffre && etat.coffre[p] && etat.coffre[p].debutFinal; if (!debutFinal) continue;
    let fin = 0; while (fin < m15.n && m15.t[fin] < debutFinal) fin++;                           // zone de recherche seulement
    const ctx = construireContexte(tranche(m15, 0, fin)), config = configRicheDe(p, reglage), plage = { de: 0, a: fin }; configs[p] = config;
    for (const id of familles) { try { const a = analyserFamilleCouts(ctx, id, config, plage); analyses.push({ paire: p, analyse: a }); if (surProgres) surProgres(p, id); } catch (e) { analyses.push({ paire: p, erreur: id + ' : ' + e.message }); } }
    for (const id of familles) { try { const c = comparerEntreesFamille(ctx, id, config, plage, { maxVariantes: rapide ? 4 : 12 }); if (c) entrees.push({ paire: p, ...c }); } catch (e) { /* famille sans choix d'entrée */ } }
    hasardParPaire.push({ paire: p, ...hasard(ctx, config, plage, { essais: rapide ? 6 : 20 }) });
  }
  const ok = analyses.filter(a => a.analyse);
  return { t: maintenant, source: phraseSource(reglage), reglageEmpreinte: reglage.empreinte, configs, analyses: ok.map(a => ({ paire: a.paire, id: a.analyse.id, nom: a.analyse.nom, unite: a.analyse.unite, variantes: a.analyse.variantes, positivesBrutes: a.analyse.positivesBrutes, positivesNettes: a.analyse.positivesNettes, bandes: a.analyse.bandes.map(b => ({ libelle: b.libelle, n: b.n, brute: b.brute, couts: b.couts, nette: b.nette, tauxReussite: b.tauxReussite })), resume: a.analyse.resume })),
    erreurs: analyses.filter(a => a.erreur).map(a => a.erreur), hasard: hasardParPaire, entrees, synthese: syntheseCouts(ok, { hasard: hasardParPaire }), lignes: lignesTableau(ok) };
}

export function redigerMarkdown(d) {
  const L = [];
  L.push('# Les frais en « R » : où l’avantage disparaît', '', '_Généré le ' + new Date(d.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC par `node agent-pc/couts-en-r.mjs`, à partir des vraies bougies du service (zone de recherche seulement ; le jeu final n’est jamais lu). Les critères de validation (v3 `c9b4ddd4`) ne sont pas touchés._', '');
  L.push('## En bref', '', ...d.synthese.lignes.map(x => '- ' + x), '');
  L.push('## Comment lire ce document', '',
    '**1 R = ce qu’on risque sur un trade** (la distance entre l’entrée et le stop). Un trade perdant coûte −1 R, un trade gagnant à objectif 2 R rapporte +2 R, **moins les frais**. Les frais sont des pourcentages du prix (frais de la plateforme à l’entrée et à la sortie, spread, glissement) ; exprimés en R ils valent :', '',
    '> coût en R = (2 × frais + spread + 2 × glissement) ÷ distance au stop (en %)', '',
    'Exemple : un stop à 0,3 % du prix avec 0,15 % de coûts au total fait perdre **0,5 R avant même d’avoir une chance de gagner** ; le même coût avec un stop à 3 % ne fait perdre que 0,05 R. Plus le stop est proche, plus les frais pèsent. C’est pour cela que les décisions en H1 et H4 (stops larges) souffrent moins que celles en M15 (stops serrés).', '');
  L.push('## Les coûts utilisés', '', d.source, '', '| Actif | Frais « taker » (marché) | Frais « maker » (ordre limite) | Spread | Glissement | Profondeur de file |', '|---|---:|---:|---:|---:|---:|',
    ...Object.entries(d.configs).map(([p, c]) => '| ' + p + ' | ' + fmt(c.fraisPct, 3) + ' % | ' + fmt(c.makerPct, 3) + ' % | ' + fmt(c.spreadPct, 3) + ' % | ' + fmt(c.glissementPct, 3) + ' % | ' + fmt(c.filePct, 3) + ' % |'), '',
    '**Question pour Justin** : quels sont tes vrais frais sur le compte prop Kraken (maker, taker, spread) ? Remplis `couts.json` (modèle : `couts.exemple.json`, dans le dossier de l’agent) ; sans cela les valeurs prudentes ci-dessus s’appliquent (voir `docs/QUESTIONS_POUR_JUSTIN.md`).', '');
  const dist = [0.3, 0.5, 1, 2, 4], base = Object.values(d.configs)[0];
  if (base) {
    L.push('### Combien coûtent les frais selon la taille du stop (actif : première paire, coûts ci-dessus)', '', '| Distance au stop | Coût en R, au marché des deux côtés | Entrée limite + sortie au marché | Tout en ordres limites | Taux de réussite minimal à RR = 2 (marché) |', '|---:|---:|---:|---:|---:|',
      ...dist.map(x => '| ' + fmt(x, 1) + ' % | ' + fmt(coutEstimeR(base, x)) + ' R | ' + fmt(coutEstimeR(base, x, { entree: 'limite' })) + ' R | ' + fmt(coutEstimeR(base, x, { entree: 'limite', sortie: 'limite' })) + ' R | ' + Math.round(tauxEquilibre(2, coutEstimeR(base, x)) * 100) + ' % |'), '');
    L.push('**Ton profil visé : 45 % de réussite, rapport gain/risque 2.** Espérance nette par trade selon le coût : ' + [0, 0.05, 0.1, 0.2, 0.4].map(c => fmt(c, 2) + ' R de frais → ' + (esperanceProfil(0.45, 2, c) >= 0 ? '+' : '') + fmt(esperanceProfil(0.45, 2, c)) + ' R').join(' · ') + '. Le critère de validation demande +0,25 R par trade : il laisse donc **au plus 0,10 R de frais** à ce profil (0,45 × 2 − 0,55 = +0,35 R avant frais).', '');
  }
  L.push('## Avant frais, frais, après frais : par famille, actif et taille de stop', '',
    '_Tous les trades de toutes les variantes de la grille de base, regroupés ; les variantes voisines se recouvrent et ces données servent déjà à choisir : les chiffres sont optimistes, ils servent à comprendre, pas à valider. Seules les cases d’au moins 30 trades sont montrées._', '',
    '| Famille | Actif | Unité | Stop (distance) | Trades | Avant frais (R) | Frais (R) | Après frais (R) | Réussite |', '|---|---|---|---|---:|---:|---:|---:|---:|',
    ...d.lignes.filter(l => l.n >= 30).sort((a, b) => a.famille.localeCompare(b.famille) || a.paire.localeCompare(b.paire) || a.distanceMoyennePct - b.distanceMoyennePct).map(l => '| ' + l.famille + ' | ' + l.paire + ' | ' + l.unite + ' | ' + l.bande + ' | ' + l.n + ' | ' + fmt(l.brute) + ' | ' + fmt(l.couts) + ' | ' + fmt(l.nette) + ' | ' + Math.round(l.tauxReussite * 100) + ' % |'), '');
  L.push('## Où l’avantage brut existe mais est détruit', '', d.synthese.detruit.length ? '| Famille | Actif | Stop | Trades | Avant frais | Frais | Après frais |\n|---|---|---|---:|---:|---:|---:|\n' + d.synthese.detruit.map(l => '| ' + l.famille + ' | ' + l.paire + ' | ' + l.bande + ' | ' + l.n + ' | ' + fmt(l.brute) + ' R | ' + fmt(l.couts) + ' R | ' + fmt(l.nette) + ' R |').join('\n') : '_Aucune case (≥ 100 trades) avec un avantage brut positif détruit par les frais._', '');
  L.push('## Ordre au marché ou ordre limité (maker) ?', '', 'Mêmes signaux, deux façons d’entrer. L’ordre limité paie moins de frais (frais « maker », ni spread ni glissement) MAIS n’est rempli que si le prix traverse le niveau (d’au moins la « profondeur de file ») : on compte les ordres non remplis, ceux « partis sans nous » (le prix est allé vers l’objectif sans passer par notre niveau) et les remplissages « adverses » (la bougie de remplissage se referme contre nous). **Un ordre limité qui rate justement les bons trades ne vaut rien.**', '',
    d.entrees && d.entrees.length ? '| Famille | Actif | Trades marché | Espérance marché | Trades limite | Espérance limite | Frais en R (marché → limite) | Remplis | Non remplis | Partis sans nous | Adverses | Trades manqués (espérance) |\n|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---|\n' + d.entrees.map(e => '| ' + e.nom + ' | ' + e.paire + ' | ' + e.marche.n + ' | ' + fmt(e.marche.esperance) + ' | ' + e.limite.n + ' | ' + fmt(e.limite.esperance) + ' | ' + fmt(e.marche.couts) + ' → ' + fmt(e.limite.couts) + ' | ' + (e.tauxRemplissage == null ? '—' : Math.round(e.tauxRemplissage * 100) + ' %') + ' | ' + e.ordres.nonRemplis + ' | ' + e.ordres.partisSansNous + ' | ' + (e.partAdverse == null ? '—' : Math.round(e.partAdverse * 100) + ' %') + ' | ' + e.tradesManques + ' (' + fmt(e.esperanceTradesManques) + ' R) |').join('\n') : '_Aucune famille avec choix d’entrée dans cette analyse._', '');
  L.push('## Le hasard, avec les mêmes coûts', '', '| Actif | Essais | Espérance moyenne | Meilleur essai | Avant frais | Frais (R) |', '|---|---:|---:|---:|---:|---:|',
    ...d.hasard.map(h => '| ' + h.paire + ' | ' + h.essais + ' | ' + fmt(h.esperanceMoyenne) + ' | ' + fmt(h.esperanceMax) + ' | ' + fmt(h.bruteMoyenne) + ' | ' + fmt(h.coutsMoyens) + ' |'), '',
    '## Familles et paires dont le calcul a échoué', '', d.erreurs.length ? d.erreurs.map(x => '- ' + x).join('\n') : '_aucune_', '');
  return L.join('\n');
}

const estPrincipal = () => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (e) { return false; } };
if (estPrincipal()) {
  const args = process.argv.slice(2), arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const dossier = dossierAgent(), F = fichiersAgent(dossier), etat = chargerEtat(dossier), series = {}, paires = (arg('--paires') || ORDRE_PAIRES.join(',')).split(',');
  for (const p of paires) series[p] = await chargerSerie(F.donnees, p).catch(() => null);
  const familles = arg('--familles') ? arg('--familles').split(',') : undefined;
  const t0 = Date.now(), d = calculerCouts(etat, series, { rapide: args.includes('--rapide'), paires, ...(familles ? { familles } : {}), surProgres: (p, id) => process.stdout.write('.') });
  const sortie = path.resolve(arg('--sortie') || path.join(racine, 'docs', 'COUTS_EN_R.md'));
  fs.writeFileSync(sortie, redigerMarkdown(d), 'utf8'); fs.writeFileSync(path.join(dossier, 'couts-en-r.json'), JSON.stringify(d), 'utf8');
  console.log('\nÉcrit : ' + sortie + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)'); console.log(d.synthese.lignes.join('\n'));
}
