// Tests du SERVICE PC de l'agent (agent-pc/service.mjs) avec de FAUSSES données, un FAUX Worker, un FAUX détecteur de jeu et un FAUX exécuteur de recherche :
// identité unique et permanente, cycle sans clic, pause, commandes, version, simulation, recherche (cache, compteur de variantes), jeu = pause, reprise après Worker, rapport hebdomadaire.
// Lancer :  node galaxie/tests/agent-service-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerService } from '../../agent-pc/service.mjs';
import { chargerEtat, fichiersAgent } from '../../agent-pc/etat-agent.mjs';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import * as E from '../../strategies/agent-etat.js';
import { ETAT_REGLE_VIDE } from '../../strategies/direct-v3.js';

let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-')); process.env.RAYLE_VEILLEUR_DOSSIER = path.join(dossier, 'veilleur');
const J = 86400e3, FIN = Math.floor(Date.UTC(2026, 9, 25, 12, 0) / 900e3) * 900e3 + 5 * 60e3;   // dimanche 25 octobre 2026, 12:05 UTC
let horloge = FIN; const maintenant = () => horloge;
const TOTAL = 90000, m15 = marcheMixte(TOTAL, 9);
// les bougies se terminent « maintenant » : on décale les horodatages
const decal = (FIN - (TOTAL + 1) * 900e3) - m15.t[0]; for (let i = 0; i < m15.n; i++) m15.t[i] += decal;
const series = { BTC: m15, SOL: m15, DOGE: m15 };
let barreSignal = -1;
FAMILLES.test_signal = { id: 'test_signal', nom: 'TEST signal', description: 'signale à une bougie imposée', grille: () => ({ a: [1] }), signaux(ctx) { const n = ctx.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: 3 }; const i = barreSignal >= 0 ? barreSignal : n - 1; if (i < n) { o.sens[i] = 1; o.stop[i] = ctx.m15.c[i] * 0.98; } return o; } };

const fausseDonnees = { appels: { charger: 0, jour: 0, actualiser: 0 }, async charger() { this.appels.charger++; return []; }, async maintenirChaqueJour() { this.appels.jour++; return ['BTC', 'SOL', 'DOGE'].map(p => ({ paire: p, n: m15.n, jourFin: '2026-10-25', trous: 0, integrite: { ok: true }, derives: { financement: 4000, metrics: 2800 } })); }, async actualiser() { this.appels.actualiser++; return {}; }, serie: p => series[p] };
function fauxWorker() {
  const w = { appels: [], commandes: [], telegram: [], suiviWorker: {}, etatWorker: null, configure: true, panne: false };
  w.battement = async info => { if (w.panne) throw new Error('réseau'); w.appels.push('battement'); const c = w.commandes.splice(0); return { commandes: c }; };
  w.synchroniser = async (etat, suivi) => { if (w.panne) throw new Error('réseau'); w.appels.push('sync'); w.dernierEtat = etat; w.dernierSuivi = suivi; return { ok: true, regles: E.exporterRegles(etat).length, suiviWorker: w.suiviWorker }; };
  w.etat = async () => { if (w.panne) throw new Error('réseau'); return w.etatWorker; };
  w.commandesTraitees = async () => ({}); w.telegram = async (texte, type) => { if (w.panne) throw new Error('réseau'); w._tg.push({ texte, type }); }; w._tg = [];
  return w;
}
const jeuLibre = { jeu: false, async evaluer() { return { jeu: this.jeu, raison: this.jeu ? 'programme de jeu lancé' : null }; } };
const executions = [];
const executeur = async (tache, contexte) => {
  executions.push({ famille: tache.famille, paire: tache.paire, gen: tache.gen, variantesAvant: contexte.variantesAvant });
  const valide = tache.famille === 'tendance_ma' && tache.paire === 'BTC' && !tache.gen;
  const base = { famille: tache.famille, paire: tache.paire, type: 'exploration', t: horloge, grille: tache.grille, gen: tache.gen || 0, esperance: valide ? 0.4 : -0.1, trades: 180 };
  if (valide) return { resumes: [{ ...base, statut: 'validee_backtest', retenus: { touche: 0.3, stopATR: 1, R: 4, exigeH4: 1 }, jeuFinal: { ok: true, ouvert: true, statut: 'reussi', rang: 1 } }] };
  return { resumes: [{ ...base, statut: 'non_validee', ratees: ['Espérance nette'] }] };
};

const W = fauxWorker(), ecrireFaux = async faits => ({ lignes: ['Ligne 1 : ' + faits.variantes + ' variantes.', 'Ligne 2.', 'Ligne 3.', 'Ligne 4.', 'Rappel : les résultats passés ne garantissent rien.'], source: 'modèle de test', essais: [] });
const svc = creerService({ dossier, maintenant, donnees: fausseDonnees, sync: W, ecrire: ecrireFaux, executer: executeur, detecteur: jeuLibre, sansPriorite: true, tranchesMs: 10 * 60e3 });

// ── naissance : une seule identité ──
await svc.demarrer();
let e = svc.etat();
v('naissance : l’agent a une identité stable, un journal, aucune version', e.identite.nom === 'Kepler' && e.versions.length === 0 && e.journal.some(x => x.type === 'naissance'));
const creeLe = e.identite.creeLe;
v('démarrage : les données sont chargées', fausseDonnees.appels.charger === 1);

// ── cycle sans clic : données du jour, recherche, version ──
let cr = await svc.cycle(); e = svc.etat();
v('premier cycle : mise à jour quotidienne des données faite', fausseDonnees.appels.jour === 1 && e.donnees && e.donnees.paires.length === 3);
v('le coffre est fixé pour chaque paire (jeu final ouvert une seule fois)', e.coffre && e.coffre.BTC && e.coffre.BTC.debutFinal > m15.t[0] && e.coffre.SOL.debutFinal);
const nExec = executions.length; v('recherche : des tâches ont tourné (simples d’abord)', nExec > 0 && executions[0].gen === 0);
v('la recherche passe de la génération 0 à 1 puis 2 (espace borné)', executions.some(x => x.gen === 1) && executions.some(x => x.gen === 2) && !executions.some(x => x.gen === 3));
const idV = E.idStrategie('tendance_ma', 'BTC', { touche: 0.3, stopATR: 1, R: 4, exigeH4: 1 });
v('une stratégie validée (backtest + jeu final) crée la version v1, active', e.active === 1 && e.strategies[idV] && e.strategies[idV].phase === 'simulation' && e.versions.length === 1);
v('le jeu final a été ouvert UNE fois : ouverture notée dans le coffre', e.coffre.BTC.ouvertures.length === 1 && e.coffre.BTC.ouvertures[0].famille === 'tendance_ma');
const variantes = Object.values(e.compteurVariantes).reduce((a, b) => a + b, 0);
v('compteur de variantes : > 0 et jamais de double comptage entre BTC / SOL / DOGE pour la même grille', variantes > 0 && e.variantesVues && Object.keys(e.variantesVues).length === variantes, variantes + ' vs ' + Object.keys(e.variantesVues).length);
v('le Worker a reçu l’état (synchronisation) et la nouvelle version', W.appels.includes('sync') && W.dernierEtat.active === 1);
v('Telegram : alerte « nouvelle version » avec rappel', W._tg.some(a => /Nouvelle version v1/.test(a.texte) && /Aucun ordre/.test(a.texte)));

// ── cache : un deuxième cycle ne recalcule rien ──
const avant = executions.length; await svc.cycle();
v('cache par empreinte : rien n’est recalculé', executions.length === avant);
v('statut : recherche terminée → « en surveillance », avec le compteur', svc.statut().code === 'surveillance' && /espace de recherche/.test(svc.info().raison || ''), svc.statut().code + ' ' + svc.info().raison);

// ── surveillance : un signal → entrée simulée → alerte SIMULATION (la stratégie n'a pas fini sa simulation) ──
{
  const s = svc.etat().strategies[idV]; s.famille = 'test_signal'; s.params = { a: 1 }; const id2 = E.idStrategie('test_signal', 'BTC', { a: 1 }); delete svc.etat().strategies[idV]; s.id = id2; svc.etat().strategies[id2] = s; svc.etat().versions[0].strategies = [id2];
  const tg0 = W._tg.length; await svc.surveiller();
  const tg = W._tg.slice(tg0);
  v('signal : alerte d’ENTRÉE marquée SIMULATION envoyée par Telegram', tg.some(a => a.type === 'ENTREE' && /SIMULATION/.test(a.texte) && /Stop :/.test(a.texte) && /Taille pour risquer 1 %/.test(a.texte)), JSON.stringify(tg.map(x => x.type)));
  const n1 = W._tg.length; await svc.surveiller(); v('même bougie : pas de deuxième alerte', W._tg.length === n1);
  v('statut : « position proposée / setup en préparation » visible (entrée en attente)', svc.info().phase !== undefined && Object.values(svc.suivi()).some(x => x && x.pendante));
}

// ── commandes : pause, reprise, charge, retour arrière ──
W.commandes.push({ id: 'c1', type: 'pause' }); const execAvantPause = executions.length; await svc.cycle();
v('commande « pause » du Worker : l’agent se met en pause', svc.etat().parametresRisque.pause === true && svc.statut().code === 'pause');
barreSignal = -1; fausseDonnees.appels.actualiser = 0; await svc.cycle();
v('en pause : ni données, ni recherche, ni surveillance', fausseDonnees.appels.actualiser === 0 && executions.length === execAvantPause);
W.commandes.push({ id: 'c2', type: 'reprendre' }); W.commandes.push({ id: 'c3', type: 'charge', valeur: 'fort' }); await svc.cycle();
v('reprise + charge « fort » appliquées', svc.etat().parametresRisque.pause === false && svc.etat().parametresRisque.charge === 'fort');
W.commandes.push({ id: 'c4', type: 'charge', valeur: 'énorme' }); await svc.cycle(); v('charge inconnue ignorée', svc.etat().parametresRisque.charge === 'fort');
// version 2 puis retour arrière
E.creerVersion(svc.etat(), { candidates: [{ famille: 'fin_range', paire: 'SOL', params: { N: 96 }, validation: { statut: 'validee_backtest' } }], raison: 'test v2' }, maintenant());
W.commandes.push({ id: 'c5', type: 'retour_arriere' }); await svc.cycle(); v('retour arrière en un clic : la version précédente redevient active', svc.etat().active === 1 && svc.etat().versions.filter(x => x.active).length === 1);

// ── un jeu démarre : la recherche s'arrête ──
{
  jeuLibre.jeu = true; svc.etat().recherche.epuise = false; const n = executions.length;
  const r = await svc.chercher(); v('jeu lancé : pas de recherche (pause)', r.fait === false && /pause/.test(r.raison) && executions.length === n);
  jeuLibre.jeu = false;
}
// ── identité unique et permanente : un nouveau service reprend le MÊME agent ──
{
  const svc2 = creerService({ dossier, maintenant, donnees: fausseDonnees, sync: fauxWorker(), ecrire: ecrireFaux, executer: executeur, detecteur: jeuLibre, sansPriorite: true });
  await svc2.demarrer(); const e2 = svc2.etat();
  v('redémarrage : même identité, même date de naissance, mêmes versions, même journal', e2.identite.creeLe === creeLe && e2.versions.length === 2 && e2.journal.length > 10 && e2.compteurVariantes.BTC === svc.etat().compteurVariantes.BTC);
  const F = fichiersAgent(dossier); fs.writeFileSync(F.etat, '{ pas du json'); const e3 = chargerEtat(dossier, maintenant());
  v('fichier d’état abîmé : restauré depuis une sauvegarde tournante, l’identité n’est pas perdue', e3.identite.creeLe === creeLe && e3.journal.some(x => /abîmé/.test(x.texte)));
}
// ── reprise après une absence du PC : le Worker a avancé ──
{
  const W2 = fauxWorker(), id = E.idStrategie('test_signal', 'BTC', { a: 1 }), avance = ETAT_REGLE_VIDE(); avance.derniereBarre = m15.t[m15.n - 1]; avance.trades.push({ t: 1, tSortie: 2, R: 1, sens: 1, barres: 3, motif: 'cible', prixSortie: 1, prixEntree: 1, stop: 1, cible: 2, signalT: 0 });
  W2.etatWorker = { etat: { alertes: [{ cle: 'ENTREE:x:1', type: 'ENTREE', t: horloge - 3600e3, titre: 'envoyée par le Worker', texte: 't', mode: 'SIMULATION' }] }, suivi: { [id]: avance }, meta: { pausesRegles: {} } };
  const svc3 = creerService({ dossier: fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test2-')), maintenant, donnees: fausseDonnees, sync: W2, ecrire: ecrireFaux, executer: executeur, detecteur: jeuLibre, sansPriorite: true });
  await svc3.demarrer();
  v('démarrage : le suivi plus récent du Worker est repris, ses alertes sont ajoutées au journal', svc3.suivi()[id] && svc3.suivi()[id].trades.length === 1 && svc3.etat().alertes.some(a => a.cle === 'ENTREE:x:1') && svc3.etat().journal.some(x => /pendant l’absence du PC/.test(x.texte)));
}
// ── Worker injoignable : le service continue en local ──
{ W.panne = true; const n = svc.etat().journal.length; await svc.cycle(); v('Worker injoignable : le cycle continue, l’état du lien est « ko »', svc.info().worker.ok === false && svc.etat().journal.length >= n); W.panne = false; }
// ── rapport hebdomadaire (dimanche soir) ──
{
  horloge = Date.UTC(2026, 9, 25, 18, 5); await svc.cycle(); const r = svc.etat().rapport;
  v('rapport du dimanche soir : 5 lignes, source indiquée, une seule fois par semaine', r && r.lignes.length === 5 && r.source === 'modèle de test' && /2026-S43/.test(r.semaine));
  const t = r.t; horloge += 3600e3; await svc.cycle(); v('pas de deuxième rapport la même semaine', svc.etat().rapport.t === t);
  v('rapport envoyé à Telegram', W._tg.some(a => /Rapport hebdomadaire/.test(a.texte)));
}
// ── fichiers : état écrit, journal complet, service.json ──
{ const F = fichiersAgent(dossier); v('fichiers : agent.json, suivi.json, journal.jsonl, service.json', [F.etat, F.suivi, F.journal, F.service].every(f => fs.existsSync(f)) && fs.readFileSync(F.journal, 'utf8').trim().split('\n').length > 5); }
v('aucun jeton ni secret dans le journal', !/rd_[A-Za-z0-9_-]{8,}/.test(fs.readFileSync(fichiersAgent(dossier).journal, 'utf8')));
delete FAMILLES.test_signal; fs.rmSync(dossier, { recursive: true, force: true });
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
