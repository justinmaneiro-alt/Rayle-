// POSITIONS DE KEPLER SUR LE PC (V7) : les trois agents (Rebond, Continuation, Extrêmes) proposent des positions à chaque clôture M15 / H1 sur BTC, SOL et DOGE ; elles sont classées, suivies automatiquement,
// mesurées par type de setup (niveau de preuve), et résumées dans un bilan honnête. Tout est SIMULATION et PROPOSITION : aucun ordre n'est passé, aucune clé de courtier n'existe ici.
// État : positions.json dans le dossier de l'agent (écrit de façon atomique par le service ; lu par les routes /__agent/positions). Commandes de l'écran : positions-commandes.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { lireJson, ecrireJson } from './etat-agent.mjs';
import { tranche } from '../planetes/mars/pc/agent-btc/colonnes.js';
import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { REGLAGES_DEFAUT, proposerPourActif, budgetJour } from '../strategies/positions/moteur.js';
import { creerEtatPositions, enregistrer, majSuivi, majNiveaux, preuvesPourActif, liveParType } from '../strategies/positions/suivi.js';
import { bilanComplet, baselineHasard, phraseHebdo } from '../strategies/positions/bilan.js';
import { alertePosition, alerteSurveillance, lignesRapportPositions, ligneProposition } from '../strategies/positions/rapport.js';
import { exempleValide, resumeExemplesV7, GARDE_FOU_EXEMPLES } from '../strategies/positions/exemples.js';
import { majOccasions, resumeOccasions } from '../strategies/autonomie.js';
import { configMoteurDe } from '../planetes/mars/pc/agent-m6/couts.js';
import { configRicheDe, lireCoutsReglage } from './couts-reglage.mjs';
import { executerPositionsSync } from './positions-travailleur.mjs';
import { NIVEAUX, VERSIONS_CRITERES, empreinteV4 } from '../strategies/criteres-v4.js';
import { AGENTS } from '../strategies/positions/agents.js';

export const FICHIER_POSITIONS = 'positions.json', FICHIER_COMMANDES = 'positions-commandes.json';
const JOUR = 86400e3, FENETRE_LIVE = 30000, MESURE_TOUS_LES = 24 * 3600e3;
export const AVERTISSEMENT = 'Propositions et simulations seulement : aucun ordre n’est passé, aucun gain n’est garanti. Chaque position affiche son niveau de preuve réel.';

/* Exécute une tâche lourde dans un worker_thread (ou en direct dans les tests via `executer`). */
export function executerPositions(tache, contexte) {
  return new Promise((ok, ko) => {
    const w = new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'positions-travailleur.mjs'), { workerData: { tache, contexte } });
    let fini = false; const clore = (f, v) => { if (!fini) { fini = true; f(v); } };
    w.on('message', m => clore(ok, m)); w.on('error', e => clore(ko, e)); w.on('exit', c => { if (c !== 0) clore(ko, new Error('travailleur des positions arrêté (code ' + c + ')')); else clore(ko, new Error('travailleur sans réponse')); });
  });
}

export function creerPositions({ dossier, D, paires, maintenant = () => Date.now(), journal = () => {}, erreur = () => {}, envoyer = async () => {}, executer = executerPositions, versionCriteres = () => 'equilibre', series = null, pistesLignes = null } = {}) {
  const fichier = path.join(dossier, FICHIER_POSITIONS), fCommandes = path.join(dossier, FICHIER_COMMANDES), dossierDonnees = path.join(dossier, 'donnees');
  let etat = lireJson(fichier, null); if (!etat || etat.schema !== 1) etat = creerEtatPositions();
  for (const [k, v] of Object.entries(creerEtatPositions())) if (etat[k] === undefined || (v !== null && typeof v === 'object' && etat[k] === null)) etat[k] = v;
  const enCours = { mesure: null, taches: 0 };
  const reglages = () => ({ ...REGLAGES_DEFAUT, ...(etat.reglages || {}), versionCriteres: versionCriteres() });
  const serieDe = p => (series ? series[p] : D.serie(p));
  const contexteCouts = () => ({ dossierDonnees, couts: lireCoutsReglage(dossier) });
  const configDe = p => { try { return configRicheDe(p, lireCoutsReglage(dossier)); } catch (e) { return configMoteurDe(p); } };
  const sauver = () => { try { etat.vuePubliee = vue(); ecrireJson(fichier, etat, { copies: 1 }); } catch (e) { erreur('sauvegarde des positions', e); } };

  /* Commandes envoyées par l'écran (réglages, exemples, hypothèses). */
  async function lireCommandes() {
    const liste = lireJson(fCommandes, null); if (!Array.isArray(liste) || !liste.length) return 0;
    try { fs.unlinkSync(fCommandes); } catch (e) { /* déjà pris */ }
    for (const c of liste) {
      try {
        if (c.type === 'reglages') {
          const avant = reglages(), nouveau = { ...(etat.reglages || {}), ...c.valeur };
          const SURES = ['agents', 'actifs', 'unites', 'maxParAgent', 'maxNouvellesParJour', 'confluenceMin', 'niveauPreuveMin', 'afficherIdees', 'risquePct', 'alertesObservation', 'seuilDiamant', 'surveillance'];
          for (const k of Object.keys(nouveau)) if (!SURES.includes(k)) delete nouveau[k];
          if (nouveau.risquePct != null) nouveau.risquePct = Math.min(2, Math.max(0.05, +nouveau.risquePct || 0.5));
          if (nouveau.maxParAgent != null) nouveau.maxParAgent = Math.min(6, Math.max(1, Math.round(+nouveau.maxParAgent || 3)));
          if (nouveau.maxNouvellesParJour != null) nouveau.maxNouvellesParJour = Math.min(15, Math.max(1, Math.round(+nouveau.maxNouvellesParJour || 5)));
          if (nouveau.confluenceMin != null) nouveau.confluenceMin = Math.min(4, Math.max(1, Math.round(+nouveau.confluenceMin || 2)));
          etat.reglages = nouveau; journal('positions', 'Réglages des positions modifiés : ' + Object.keys(c.valeur || {}).join(', ') + '.');
          if (JSON.stringify(avant.agents) !== JSON.stringify(reglages().agents) || avant.confluenceMin !== reglages().confluenceMin) etat.dernierCalcul = {};      // on recalcule tout de suite
        } else if (c.type === 'exemple') {
          const ex = { ...c.valeur, id: c.valeur.id || 'ex-' + maintenant(), creeLe: maintenant() }, erreurs = exempleValide(ex);
          if (erreurs.length) { journal('positions', 'Exemple refusé : ' + erreurs.join(', ') + '.'); continue; }
          etat.exemples.push(ex); if (etat.exemples.length > 300) etat.exemples.shift(); journal('positions', 'Exemple de Justin ajouté (' + ex.actif + ' ' + ex.sens + ' ' + ex.avis + ').');
          await analyserEtTester(ex);
        } else if (c.type === 'supprimer_exemple') { etat.exemples = etat.exemples.filter(e => e.id !== c.valeur); }
      } catch (e) { erreur('commande des positions', e); }
    }
    return liste.length;
  }
  /* Analyse l'exemple, en tire (si besoin) une hypothèse et la fait tester sur d'AUTRES données. */
  async function analyserEtTester(ex) {
    const r = await executer({ type: 'exemple', exemple: ex, reglages: { confluenceMin: reglages().confluenceMin }, maintenant: maintenant() }, contexteCouts());
    if (!r || !r.ok) { ex.analyse = { statut: 'hors_donnees', pourquoi: (r && r.raison) || 'analyse impossible' }; return; }
    ex.analyse = r.analyse;
    if (r.hypothese) {
      const h = r.hypothese; h.exclure = [{ actif: ex.actif, t: ex.t }]; etat.hypotheses.push(h); if (etat.hypotheses.length > 200) etat.hypotheses.shift();
      journal('positions', 'Hypothèse née d’un exemple de Justin : ' + h.titre + ' (à tester sur d’autres données).');
      await testerUneHypothese(h);
    }
  }
  async function testerUneHypothese(h) {
    if (enCours.hypothese) return; enCours.hypothese = true;
    try {
      const vusAvant = Object.keys(etat.variantes).length;
      const r = await executer({ type: 'hypothese', hypothese: h, actifs: paires, variantesAvant: vusAvant, risquePct: reglages().risquePct }, contexteCouts());
      if (r && r.ok) { h.resultat = r.resultat; h.statut = 'testee'; etat.variantes['hyp|' + h.id] = 1; journal('positions', 'Hypothèse « ' + h.titre + ' » testée sur d’autres données : ' + r.resultat.n + ' trades, ' + (r.resultat.esperance == null ? 'espérance inconnue' : (r.resultat.esperance >= 0 ? '+' : '−') + Math.abs(r.resultat.esperance).toFixed(2).replace('.', ',') + ' R') + ' → ' + NIVEAUX[r.resultat.niveau] + '.'); }
    } catch (e) { erreur('test d’hypothèse', e); } finally { enCours.hypothese = false; }
  }

  /* Mesure des types de setup (une fois par jour et par actif, ou à la demande) : lancée en tâche de fond, intégrée quand elle revient. */
  function lancerMesures() {
    if (enCours.mesure) return; const t = maintenant(), R = reglages();
    for (const a of R.actifs) {
      if (!paires.includes(a)) continue; const m = etat.mesures[a]; if (m && t - m.dateMesure < MESURE_TOUS_LES && m.versionCriteres === R.versionCriteres) continue;
      const serie = serieDe(a); if (!serie || serie.n < 30000) continue;
      enCours.mesure = a; journal('positions', 'Mesure des types de setup sur ' + a + ' (zone de recherche).');
      executer({ type: 'mesure', actif: a, version: R.versionCriteres, risquePct: R.risquePct, etatPreuves: { variantes: etat.variantes, jeuFinal: etat.jeuFinal, live: liveEtatPreuves(a) } }, contexteCouts()).then(r => {
        if (r && r.ok) integrerMesure(a, r.resultat); else erreur('mesure ' + a, new Error((r && r.raison) || 'échec'));
      }).catch(e => erreur('mesure ' + a, e)).finally(() => { enCours.mesure = null; sauver(); });
      return;      // une seule mesure à la fois
    }
  }
  const liveEtatPreuves = a => { const l = liveParType(etat, maintenant()), o = {}; for (const [cle, v] of Object.entries(l)) if (cle.startsWith(a + '|')) o[cle.slice(a.length + 1)] = { semaines: v.semaines, esperance: v.esperance, n: v.n }; return o; };
  function integrerMesure(actif, res) {
    for (const e of res.nouveauxEssais || []) etat.variantes[e] = 1;
    for (const t of Object.values(res.types)) if (t.jeuFinal && t.jeuFinal.ouvert) etat.jeuFinal[t.cle] = t.jeuFinal;       // le coffre : un jeu final ouvert n'est JAMAIS rouvert
    const evenements = majNiveaux(etat, { ...res, versionCriteres: reglages().versionCriteres }, maintenant());
    etat.mesures[actif] = { dateMesure: res.dateMesure, zone: res.zone, nVariantes: res.nVariantes, nEffectif: res.nEffectif, versionCriteres: res.version, versionTexte: res.versionTexte, empreinte: res.empreinte, profil: res.profil, types: Object.fromEntries(Object.entries(res.types).map(([k, t]) => [k, { ...t, lignesCandidate: undefined, lignesValidee: undefined, periodes: t.periodes }])) };
    journal('positions', 'Mesure ' + actif + ' : ' + Object.values(res.types).map(t => t.nomType + ' ' + t.n + ' trades → ' + NIVEAUX[t.niveau]).join(' · '));
    for (const e of evenements) { journal('positions', e.texte); if (e.sens === 'promotion' || e.sens === 'retrogradation') envoyer(['Types de setup — ' + (e.sens === 'promotion' ? 'PROMOTION' : 'RÉTROGRADATION'), e.texte, AVERTISSEMENT].join('\n'), 'OBSERVATION').catch(() => {}); }
    sauver();
  }

  /* Calcul en direct d'un actif à la clôture d'une nouvelle bougie M15. */
  async function calculerActif(a, R) {
    const s = serieDe(a); if (!s || s.n < FENETRE_LIVE) return null; const derniere = s.t[s.n - 1];
    if (etat.dernierCalcul[a] === derniere) return null;
    const fen = tranche(s, s.n - FENETRE_LIVE, s.n), r = proposerPourActif(fen, a, { reglages: R, preuves: preuvesPourActif(etat, a), config: configDe(a) });
    etat.dernierCalcul[a] = derniere;
    const profil = etat.mesures[a] && etat.mesures[a].profil;
    const { nouvelles } = enregistrer(etat, r.propositions.filter(p => p.statut === 'en_attente' || p.statut === 'ouverte'), maintenant(), { maxParJour: R.maxNouvellesParJour });
    etat.vue = etat.vue || {}; etat.vue[a] = { t: r.t, prix: r.prix, hypothese: r.hypothese && { ...r.hypothese, confluence: r.hypothese.confluence && { n: r.hypothese.confluence.n, score: r.hypothese.confluence.score, diamant: r.hypothese.confluence.diamant, elements: r.hypothese.confluence.elements.map(e => e.texte) } }, zonesDiamant: r.zonesDiamant, ecartees: r.ecartees.length, actives: r.propositions.map(p => p.id) };
    for (const p of nouvelles) await alerterNouvelle(p, R);
    if (R.surveillance) for (const z of r.zonesDiamant.filter(z => z.enApproche)) { const cle = 'surv|' + a + '|' + z.tf + '|' + Math.round(z.niveau) + '|' + Math.floor(maintenant() / JOUR); if (!(etat.alertes || []).includes(cle)) { etat.alertes.push(cle); if (etat.alertes.length > 400) etat.alertes.shift(); await envoyer(alerteSurveillance(z, a).join('\n'), 'PREPARATION').catch(() => {}); } }
    void profil; return r;
  }
  async function alerterNouvelle(p, R) {
    const niveau = p.preuve.niveau; const live = liveParType(etat, maintenant())[p.actif + '|' + p.famille + '|' + p.type], reel = niveau === 'validee' && live && live.n >= 30 && live.semaines >= 4;
    if (niveau === 'validee') await envoyer(alertePosition(p, { mode: reel ? 'REEL' : 'SIMULATION' }).join('\n'), reel ? 'ENTREE' : 'OBSERVATION').catch(() => {});
    else if (niveau === 'candidate' && R.alertesObservation) await envoyer(alertePosition(p).join('\n'), 'OBSERVATION').catch(() => {});
  }

  /* Un cycle : commandes, mesures, calcul en direct, suivi, occasions manquées, sauvegarde. */
  async function cycle() {
    const cr = { calculs: 0, terminees: 0 }; const R = reglages();
    try { await lireCommandes(); } catch (e) { erreur('commandes des positions', e); }
    try { lancerMesures(); } catch (e) { erreur('mesures des positions', e); }
    const sMaj = {}; for (const a of R.actifs) if (paires.includes(a)) { const s = serieDe(a); if (s) sMaj[a] = s; }
    for (const a of Object.keys(sMaj)) { try { if (await calculerActif(a, R)) cr.calculs++; } catch (e) { erreur('positions ' + a, e); } }
    try { const fin = majSuivi(etat, sMaj, configDe, maintenant()); cr.terminees = fin.length; for (const p of fin) journal('positions', 'Position ' + p.actif + ' ' + p.tf + ' (' + p.nomType + ') terminée : ' + (p.resultat ? (p.resultat.R >= 0 ? '+' : '−') + Math.abs(p.resultat.R).toFixed(2).replace('.', ',') + ' R (' + p.resultat.motif + ')' : p.statut) + '.'); } catch (e) { erreur('suivi des positions', e); }
    try { await tacheQuotidienne(sMaj); } catch (e) { erreur('positions : tâches du jour', e); }
    try { await rapportDuMatin(); } catch (e) { erreur('rapport des positions', e); }
    etat.dernierCycle = maintenant(); sauver(); return cr;
  }
  async function tacheQuotidienne(sMaj) {
    const jour = Math.floor(maintenant() / JOUR); if (etat.jourTaches === jour) return; etat.jourTaches = jour;
    // pas de positions encore au hasard pour la comparaison ? on les tire une fois par jour
    const props = etat.propositions.filter(p => p.statut === 'cloturee'), par = {};
    for (const a of Object.keys(sMaj)) { const l = props.filter(p => p.actif === a); if (l.length >= 5) par[a] = baselineHasard(tranche(sMaj[a], Math.max(0, sMaj[a].n - 60000), sMaj[a].n), l, configDe(a)); }
    const tout = Object.values(par).filter(x => x.assez); etat.hasard = tout.length ? { assez: true, esperance: tout.reduce((s, x) => s + x.esperance, 0) / tout.length, n: tout.reduce((s, x) => s + x.n, 0) } : { assez: false };
    // occasions manquées : grosses impulsions que nos positions n'ont pas prises (pistes pour des hypothèses, jamais des preuves)
    for (const a of Object.keys(sMaj)) { const s = sMaj[a]; if (s.n < 3000) continue; const ctx = construireContexte(tranche(s, Math.max(0, s.n - 8000), s.n)); majOccasions(etat.occasions, ctx, props.filter(p => p.actif === a).map(p => ({ t: p.resultat.tEntree, tSortie: p.resultat.tSortie, sens: p.sens }))); }
  }

  /* Rapport Telegram du matin (une fois par jour, après 6 h UTC) : positions du jour, bilan de la veille, meilleure piste et preuve manquante. */
  async function rapportDuMatin(force = false) {
    const t = maintenant(), jour = Math.floor(t / JOUR); if (!force && (etat.jourRapport === jour || new Date(t).getUTCHours() < 6 || !etat.dernierCalcul || !Object.keys(etat.dernierCalcul).length)) return false;
    etat.jourRapport = jour; const lignes = lignesRapport(pistesRapport());
    await envoyer(['Kepler — positions du ' + new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/'), ...lignes, AVERTISSEMENT].join('\n'), 'OBSERVATION').catch(() => {}); journal('positions', 'Rapport du matin des positions envoyé (' + lignes.length + ' lignes).'); return true;
  }
  const pistesRapport = () => (typeof pistesLignes === 'function' ? pistesLignes() : []);

  /* La vue publiée (pour les routes et l'écran) : propositions actives, bilan, types, exemples, journal. */
  function vue() {
    const R = reglages(), t = maintenant(), actives = etat.propositions.filter(p => (p.statut === 'en_attente' || p.statut === 'ouverte') && t < p.tValide + 8 * 3600e3).sort((a, b) => b.qualite - a.qualite);
    const bilan = bilanComplet(etat.propositions, { risquePct: R.risquePct, maintenant: t, hasard: etat.hasard || null });
    const types = Object.values(etat.types).sort((a, b) => ({ validee: 0, candidate: 1, non_concluante: 2, non_testee: 3 }[a.niveau] - { validee: 0, candidate: 1, non_concluante: 2, non_testee: 3 }[b.niveau]) || (b.esperance || -9) - (a.esperance || -9));
    const mesures = Object.fromEntries(Object.entries(etat.mesures).map(([a, m]) => [a, { dateMesure: m.dateMesure, zone: m.zone, nVariantes: m.nVariantes, nEffectif: m.nEffectif, versionTexte: m.versionTexte, empreinte: m.empreinte, profil: m.profil && { phrases: m.profil.phrases, ecartes: m.profil.ecartes } }]));
    const hyp = []; for (const a of Object.keys(etat.vue || {})) if (etat.vue[a].hypothese) hyp.push({ actif: a, ...etat.vue[a].hypothese });
    const jf = Object.keys(etat.jeuFinal).length;
    return { ok: true, t, reglages: R, avertissement: AVERTISSEMENT, versionCriteres: VERSIONS_CRITERES[R.versionCriteres], empreinteV4: empreinteV4(), niveaux: NIVEAUX, agents: AGENTS,
      propositions: actives.slice(0, 40), recentes: etat.propositions.slice(-60).reverse(), hypotheses_du_moment: hyp, zonesDiamant: Object.fromEntries(Object.entries(etat.vue || {}).map(([a, v]) => [a, v.zonesDiamant])), prix: Object.fromEntries(Object.entries(etat.vue || {}).map(([a, v]) => [a, { prix: v.prix, t: v.t }])),
      bilan, phraseHebdo: phraseHebdo(bilan.tous), types, mesures, journalNiveaux: etat.journalNiveaux.slice(-30).reverse(), exemples: etat.exemples.slice(-30).reverse().map(e => ({ ...e })), resumeExemples: resumeExemplesV7(etat.exemples), gardeExemples: GARDE_FOU_EXEMPLES,
      hypotheses: etat.hypotheses.slice(-30).reverse(), occasions: resumeOccasions(etat.occasions), essais: { total: Object.keys(etat.variantes).length, jeuxFinauxOuverts: jf }, mesureEnCours: enCours.mesure, dernierCycle: etat.dernierCycle || null };
  }
  /* Lignes du rapport du matin. */
  function lignesRapport(pistes = []) {
    const v = vue(); return lignesRapportPositions({ vue: { propositions: v.propositions, hypothese: v.hypotheses_du_moment[0], zonesDiamant: Object.values(v.zonesDiamant).flat() }, bilan: v.bilan, pistes, maintenant: maintenant() });
  }
  return { cycle, vue, lignesRapport, rapportDuMatin, etat: () => etat, sauver, reglages, lireCommandes, lancerMesures, integrerMesure, calculerActif, enCours: () => enCours };
}
export { ligneProposition, executerPositionsSync, budgetJour };
