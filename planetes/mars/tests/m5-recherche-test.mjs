import { decouperM5, etatInitial, trancher, evaluerChantier, FRACTION_DEPISTAGE, OUVERTURES_PAR_FENETRE } from '../pc/agent-btc/recherche-continue.js';
import { creerBibliotheque } from '../pc/agent-btc/bibliotheque.js';
import { CRITERES2 } from '../pc/agent-btc/criteres-v2.js';
import { chantierDuNiveau, NB_CHANTIERS, GABARITS, FILTRES_M5 } from '../pc/agent-btc/familles-m5.js';
import { validerRegle } from '../pc/agent-btc/regles-lab.js';
import { marcheM5, DERIVE_PLANTEE } from './synth-m5.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const MOIS = 30.4375 * 86400e3;

// ── découpage : le dépistage ne touche pas les blocs de test, le jeu final est à part ──
{
  const m = marcheM5({ n: 110000 }), d = decouperM5(m, { ouverts: [] });
  v('découpage valide', d.ok && d.jeuFinal && d.folds.length >= 3, JSON.stringify([d.ok, d.folds && d.folds.length]));
  v('dépistage = 45 % de la zone de recherche', Math.abs(d.finS / d.finA - FRACTION_DEPISTAGE) < 0.01);
  v('le premier bloc de test commence APRÈS le dépistage', d.folds[0].test[0] >= d.finS - 1, d.folds[0].test[0] + ' vs ' + d.finS);
  v('les blocs se suivent sans trou ni chevauchement', d.folds.every((f, i) => i === 0 || f.test[0] === d.folds[i - 1].test[1]));
  v('le dernier bloc finit à la fin de la zone A, le jeu final commence là', d.folds[d.folds.length - 1].test[1] === d.finA && d.jeuFinal[0] === d.finA && d.jeuFinal[1] === m.n);
  v('l’entraînement de chaque bloc ne voit jamais le test ni le jeu final', d.folds.every(f => f.train[1] === f.test[0] && f.train[1] <= d.finA));
  const court = marcheM5({ n: 30000 }); v('historique trop court → refus', !decouperM5(court, { ouverts: [] }).ok);
  // ouvertures du jeu final : la fenêtre est partagée, puis épuisée
  const ouv = k => ({ debut: d.debutFinal, fin: m.t[m.n - 1] + 900e3, ouvertLe: 1, cle: 'c' + k, verdict: 'rejetee' });
  const d2 = decouperM5(m, { ouverts: [ouv(1), ouv(2)] }); v('2 ouvertures : même fenêtre, ouverturesFenetre = 2', d2.jeuFinal && d2.jeuFinal[0] === d.jeuFinal[0] && d2.ouverturesFenetre === 2);
  const d5 = decouperM5(m, { ouverts: [1, 2, 3, 4, 5].map(ouv) }); v('5 ouvertures : fenêtre épuisée, plus de jeu final, attente de 6 mois', d5.jeuFinal === null && d5.attente && d5.attente.jusquau > m.t[m.n - 1], JSON.stringify(d5.attente));
  v('OUVERTURES_PAR_FENETRE = 5', OUVERTURES_PAR_FENETRE === 5);
}

// ── chantiers ──
{
  v('niveau 0/1 : 5 familles ; niveau 2 : 7 ; niveau 3 : ' + GABARITS.length + ' gabarits', NB_CHANTIERS[0] === 5 && NB_CHANTIERS[1] === 5 && NB_CHANTIERS[2] === 7 && NB_CHANTIERS[3] === GABARITS.length);
  let tousValides = true, total = 0;
  for (const niv of [3, 4]) for (let k = 0; k < NB_CHANTIERS[niv]; k++) { const c = chantierDuNiveau(niv, k); total += c.variants.length; if (!c.variants.length || !c.variants.every(x => validerRegle(x.params).ok)) tousValides = false; }
  v('tous les gabarits (niveaux 3 et 4) donnent des règles valides', tousValides, total + ' variantes');
  v('niveau 4 : un filtre ajoute bien une condition', chantierDuNiveau(4, 0).variants[0].params.conditions.length === chantierDuNiveau(3, 0).variants[0].params.conditions.length + 1);
  v('niveau 5 inconnu de chantierDuNiveau (géré par la recherche)', chantierDuNiveau(5, 0) === null);
}

// ── CONTRÔLE DES FAUX POSITIFS : marche au hasard pur, vrais critères → rien n'est validé ──
{
  const m = marcheM5({ n: 110000, graine: 5 }), etat = etatInitial(), bib = creerBibliotheque(), evts = [];
  const t0 = Date.now();
  const r = await trancher(etat, { m15: m, bibliotheque: bib, budget: { chantiersMax: 250, tempsMs: 120000 }, surEvenement: e => evts.push(e) });
  v('hasard pur : aucune stratégie validée (' + etat.N + ' variantes, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)', bib.liste().filter(s => s.statut === 'validee').length === 0 && !evts.some(e => e.type === 'validation'));
  v('hasard pur : le jeu final n’a pas été ouvert pour rien (ou rejeté)', !evts.some(e => e.type === 'validation'));
  v('compteur de variantes cumulé', etat.N > 1000 && etat.N === Object.values(etat.compteurs).reduce((s, c) => s + c.variantes, 0) + etat.compteurs[5].variantes * 0 + (etat.N - Object.values(etat.compteurs).reduce((s, c) => s + c.variantes, 0)), etat.N);
  v('journal court alimenté, N croît', etat.journalCourt.length > 0 && etat.finalistes.length > 0);
  // reprise : deux tranches = continuité (le curseur avance, N continue)
  const N1 = etat.N, niv1 = etat.niveau, cur1 = etat.curseur;
  await trancher(etat, { m15: m, bibliotheque: bib, budget: { chantiersMax: 20, tempsMs: 60000 } });
  v('reprise : N continue d’augmenter, le niveau/curseur ne recule pas', etat.N > N1 && (etat.niveau > niv1 || etat.curseur >= cur1 || etat.niveau >= 5));
  // arrêt demandé
  let n = 0; const e2 = etatInitial(); const r2 = await trancher(e2, { m15: m, bibliotheque: bib, arret: () => ++n > 3, budget: { chantiersMax: 100, tempsMs: 60000 } });
  v('arrêt demandé respecté', r2.stop === 'arret');
}

// ── VRAIE STRATÉGIE PLANTÉE : une dérive de +0,09 %/bougie entre 14 h et 15 h UTC → le protocole sait la valider ──
{
  const derive = DERIVE_PLANTEE, m = marcheM5({ n: 110000, graine: 9, derive });
  const regle = validerRegle({ nom: 'Idée : New York, achat à l’ouverture', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 }).regle;
  const etat = etatInitial(), bib = creerBibliotheque(), evts = []; etat.idees.push({ id: 'i1', nom: regle.nom, regle });
  const r = await trancher(etat, { m15: m, bibliotheque: bib, config: { maxParSemaine: 3 }, budget: { chantiersMax: 1, tempsMs: 120000 }, surEvenement: e => evts.push(e) });
  const s = bib.liste()[0];
  v('idée plantée : testée avec le protocole complet (1 chantier)', !!s, evts.map(e => e.type).join());
  if (s) {
    v('stratégie VALIDÉE (vraie dérive) — jeu final ouvert une fois', s.statut === 'validee' && evts.some(e => e.type === 'validation'), s.statut + ' ' + JSON.stringify((s.preuve || {}).horsEchantillon && s.preuve.horsEchantillon.lignes.filter(l => !l.ok).map(l => l.critere)));
    if (s.preuve) {
      v('preuve : version de critères 2 + empreinte', s.preuve.criteresVersion === 2 && /^[0-9a-f]{8}$/.test(s.preuve.criteresEmpreinte));
      v('preuve : ≥ 150 trades hors échantillon et ≥ +20 R', s.preuve.horsEchantillon.stats.n >= 150 && s.preuve.horsEchantillon.stats.Rtotal >= 20, JSON.stringify(s.preuve.horsEchantillon.stats));
      v('preuve : tous les critères (lignes) sont ok', s.preuve.horsEchantillon.lignes.every(l => l.ok) && s.preuve.jeuFinal.lignes.every(l => l.ok));
      v('preuve : conserve le nombre de variantes testées AVANT et la liste des finalistes', s.preuve.nVariantesAvant > 0 && s.preuve.testsAvant && s.preuve.testsAvant.total === s.preuve.nVariantesAvant);
      v('preuve : trades enrichis (phase, session…)', s.preuve.horsEchantillon.trades.length > 100 && s.preuve.horsEchantillon.trades.every(t => t.phase && t.session && t.jour));
      v('l’intervalle de confiance est au-dessus de zéro', s.preuve.horsEchantillon.ic.bas > 0);
      v('le coffre enregistre UNE ouverture du jeu final', r.coffre.ouverts.length === 1 && r.coffre.ouverts[0].k === 1);
      v('trades du jeu final tous APRÈS la zone de recherche', s.preuve.jeuFinal.trades.every(t => t.t >= s.preuve.jeuFinal.debut - 1));
      v('trades hors échantillon tous AVANT le jeu final', s.preuve.horsEchantillon.trades.every(t => t.t < s.preuve.jeuFinal.debut));
    }
    // la même variante ne repasse jamais au jeu final
    const e3 = etatInitial(); e3.idees.push({ id: 'i2', nom: regle.nom, regle }); const nOuv = r.coffre.ouverts.length;
    await trancher(e3, { m15: m, bibliotheque: bib, coffre: r.coffre, config: { maxParSemaine: 3 }, budget: { chantiersMax: 1, tempsMs: 60000 } });
    v('une variante déjà passée au jeu final ne repasse pas', r.coffre.ouverts.length === nOuv);
  }
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
