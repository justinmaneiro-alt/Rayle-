// Tests de l'analyse des frais en R, des réglages de coûts et de la phrase d'état (V6, phase 1).
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/couts-r-analyse-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyserFamilleCouts, lignesTableau, syntheseCouts } from '../../strategies/analyse-couts.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { etatInitial, fraisMoyenR, phraseFraisEtat, chiffres } from '../../strategies/agent-etat.js';
import { faitsRapport, rapportTemplate, accepterTexteModele } from '../../strategies/rapport-v3.js';
import { lireCoutsReglage, configRicheDe, ecrireExemple, phraseSource, fichierCouts } from '../../agent-pc/couts-reglage.mjs';
import { configMoteurDe } from '../../planetes/mars/pc/agent-m6/couts.js';
import { empreinteTache } from '../../agent-pc/recherche.mjs';
import { redigerMarkdown } from '../../agent-pc/couts-en-r.mjs';
import { estimerPourCle, suggestion } from '../../agent-pc/estimer-couts.mjs';

let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── analyse sur des bougies synthétiques ──
const m15 = marcheMixte(16000, 5), ctx = construireContexte(m15), config = { fraisPct: 0.06, makerPct: 0.024, spreadPct: 0.02, glissementPct: 0.02 }, plage = { de: 0, a: m15.n };
const a = analyserFamilleCouts(ctx, 'tendance_ma', config, plage);
v('analyse d’une famille : variantes, trades regroupés, bandes de stop', a.variantes > 5 && a.tradesPoolesN > 200 && a.bandes.length === 5 && a.unite === 'M15', JSON.stringify({ v: a.variantes, n: a.tradesPoolesN }));
v('cohérence : coût moyen = avant frais − après frais', Math.abs(a.resume.couts - (a.resume.brute - a.resume.nette)) < 1e-9);
const avecTrades = a.bandes.filter(b => b.n >= 20);
v('plus le stop est loin, moins les frais pèsent (coût décroissant d’une bande à l’autre)', avecTrades.length >= 2 && avecTrades.every((b, i) => i === 0 || b.couts <= avecTrades[i - 1].couts + 0.01), JSON.stringify(avecTrades.map(b => [b.libelle, +b.couts.toFixed(2)])));
v('les frais sont un coût : après frais est toujours en dessous d’avant frais', a.bandes.filter(b => b.n).every(b => b.nette < b.brute));
const lignes = lignesTableau([{ paire: 'BTC', analyse: a }]);
v('tableau à plat : famille, actif, unité, bande, trades', lignes.length > 0 && lignes.every(l => l.famille && l.paire === 'BTC' && l.unite === 'M15' && l.n > 0));
const s = syntheseCouts([{ paire: 'BTC', analyse: a }], { hasard: [{ essais: 5, esperanceMoyenne: -0.25 }] });
v('synthèse en phrases : coût moyen, phrase « Frais moyens… », plancher du hasard', s.lignes.length >= 3 && /Frais moyens/.test(s.lignes.join(' ')) && /plancher/.test(s.lignes.join(' ')) && s.coutMoyen > 0);
v('un seul coût de frais plus élevé (x3) augmente le coût moyen en R', (() => { const b = analyserFamilleCouts(ctx, 'tendance_ma', { ...config, fraisPct: 0.18 }, plage); return b.resume.couts > a.resume.couts * 1.5; })());
v('document généré sans trou (aucune case « undefined » / NaN)', (() => { const md = redigerMarkdown({ t: 1761600000000, source: 'x', configs: { BTC: { ...config, filePct: 0.02 } }, synthese: s, lignes, hasard: [{ paire: 'BTC', essais: 5, esperanceMoyenne: -0.25, esperanceMax: 0.05, bruteMoyenne: -0.01, coutsMoyens: 0.24 }], erreurs: [] }); return md.length > 1500 && !/undefined|NaN/.test(md) && /Frais moyens|frais/.test(md) && /## Où l’avantage brut existe/.test(md) && /vrais frais/.test(md); })());

// ── réglages de coûts de Justin ──
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-couts-'));
const r0 = lireCoutsReglage(dossier);
v('sans fichier : valeurs prudentes, source « défaut », aucune erreur', r0.source === 'defaut' && !r0.fichierPresent && r0.erreurs.length === 0 && r0.couts.BTC.fraisPct === 0.06);
const cr = configRicheDe('BTC', r0);
v('configuration du simulateur : taker = frais, maker plus bas, spread, glissement, profondeur de file', cr.fraisPct === 0.06 && cr.makerPct < cr.fraisPct && cr.spreadPct === 0.02 && cr.filePct === 0.02);
v('identique à l’ancienne configuration pour les coûts de base (aucun résultat ne bouge sans fichier)', ['fraisPct', 'spreadPct', 'glissementPct'].every(k => cr[k] === configMoteurDe('BTC')[k]));
const ex = ecrireExemple(dossier); v('modèle à remplir écrit (couts.exemple.json)', ex && fs.existsSync(ex));
fs.writeFileSync(fichierCouts(dossier), JSON.stringify({ BTC: { takerPct: 0.05, makerPct: 0.01, spreadPct: 0.01, glissementPct: 0.015 } }));
const r1 = lireCoutsReglage(dossier);
v('fichier valide : ses valeurs sont appliquées à BTC seulement', r1.source === 'fichier' && r1.couts.BTC.fraisPct === 0.05 && r1.couts.SOL.fraisPct === 0.06 && configRicheDe('BTC', r1).makerPct === 0.01);
v('l’empreinte des coûts change avec les coûts (la recherche est refaite), pas sans', r1.empreinte !== r0.empreinte && lireCoutsReglage(dossier).empreinte === r1.empreinte);
v('l’empreinte d’une tâche contient celle des coûts (même tâche, coûts différents → autre résultat en cache)', empreinteTache({ famille: 'tendance_ma', paire: 'BTC', grille: { a: [1] }, debutFinal: 1, type: 'exploration', couts: r1.empreinte }) !== empreinteTache({ famille: 'tendance_ma', paire: 'BTC', grille: { a: [1] }, debutFinal: 1, type: 'exploration', couts: '' }));
v('écrire le modèle ne touche jamais au fichier de Justin', (() => { const avant = fs.readFileSync(fichierCouts(dossier), 'utf8'); ecrireExemple(dossier); return fs.readFileSync(fichierCouts(dossier), 'utf8') === avant; })());
fs.writeFileSync(fichierCouts(dossier), JSON.stringify({ BTC: { takerPct: -3 } }));
const r2 = lireCoutsReglage(dossier);
v('fichier avec une erreur : PAS appliqué à moitié (valeurs prudentes), erreur signalée en clair', r2.source === 'defaut' && r2.fichierPresent && r2.erreurs.length === 1 && r2.couts.BTC.fraisPct === 0.06 && /erreurs/.test(phraseSource(r2)));
fs.writeFileSync(fichierCouts(dossier), '{ pas du json');
v('fichier illisible : valeurs prudentes, aucun plantage', lireCoutsReglage(dossier).source === 'defaut');
v('phrases de source des coûts', /défaut|prudentes/.test(phraseSource(r0)) && /couts\.json/.test(phraseSource(r1)));

// ── la phrase de l'état ──
const etat = etatInitial(1761600000000);
v('sans mesure : « pas encore mesurés »', fraisMoyenR(etat) === null && /pas encore mesurés/.test(phraseFraisEtat(etat)));
etat.frais = { t: 1, coutMoyenR: 0.15, trades: 1000 };
v('état mesuré chaque jour : « Frais moyens : 0,15 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 38 %. »', phraseFraisEtat(etat) === 'Frais moyens : 0,15 R par trade. Taux de réussite minimal pour être rentable avec RR=2 : 38 %.', phraseFraisEtat(etat));
const c = chiffres(etat); v('les chiffres de l’agent portent les frais moyens et le taux d’équilibre', c.fraisMoyenR === 0.15 && Math.abs(c.tauxEquilibreRR2 - 1.15 / 3) < 1e-9);
const e2 = etatInitial(1); e2.backtests.push({ coutMoyenR: 0.1, trades: 100 }, { coutMoyenR: 0.4, trades: 300 }); v('à défaut, moyenne pondérée des résumés de validation', Math.abs(fraisMoyenR(e2) - 0.325) < 1e-9);
const f = faitsRapport(etat, { pcVivant: true }, 1761600000000), lig = rapportTemplate(f);
v('le rapport de l’agent contient la phrase des frais, sans ajouter de ligne (toujours 5)', lig.length === 5 && lig.join(' ').includes('Frais moyens : 0,15 R par trade'), String(lig.length));
v('un texte reformulé par un modèle garde la phrase sans chiffre inventé', accepterTexteModele(lig.join(' '), f).ok);
v('un modèle qui invente un chiffre de frais est refusé', !accepterTexteModele(lig.join(' ').replace('0,15', '0,07'), f).ok);
// ── estimation d'après un (faux) carnet enregistré ──
{
  const t1 = Date.UTC(2026, 9, 28, 12, 0, 0), enr = [];
  for (let s = 0; s < 600; s++) { const tSec = Math.floor((t1 - 3600e3) / 1000) + s * 5, bid = new Float32Array(10).fill(0), ask = new Float32Array(10).fill(0); bid[0] = 200000; bid[1] = 300000; ask[0] = 100000; ask[1] = 100000; ask[2] = 500000; enr.push({ tSec, meilleurBid: 99999.5, meilleurAsk: 100000.5, bid, ask }); }
  const lire = () => ({ entete: { nTranches: 10, pasPct: 0.02, unite: 100 }, enregistrements: enr }), e = estimerPourCle(lire, 'faux-BTC', { t1, heures: 2, montants: [5000, 100000, 1e8] });
  v('carnet enregistré : spread moyen = 1 $ sur 100 000 $ = 0,001 %', e.ok && Math.abs(e.spreadMoyenPct - 0.001) < 1e-6, JSON.stringify(e.spreadMoyenPct));
  v('glissement d’un petit ordre : dans la première tranche (0,01 %), plus grand pour un gros ordre', e.glissement[5000].achatMedianPct > 0 && e.glissement[100000].achatMedianPct >= e.glissement[5000].achatMedianPct, JSON.stringify(e.glissement[5000]) + JSON.stringify(e.glissement[100000]));
  v('ordre trop gros pour le carnet enregistré : « carnet insuffisant », aucun faux chiffre', e.glissement[1e8].achatMedianPct === null && e.glissement[1e8].carnetInsuffisant.achat > 0);
  v('suggestion pour couts.json seulement (jamais appliquée seule) avec le plancher de mesure expliqué', (() => { const s = suggestion(e, 5000); return s && s.spreadPct > 0 && s.glissementPct >= 0 && /PLANCHER/.test(s.note); })());
  v('pas de carnet sur la période : on le dit', !estimerPourCle(() => ({ entete: null, enregistrements: [] }), 'vide', {}).ok);
}
console.log('Frais en R (analyse, réglages, état) : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
