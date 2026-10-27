import { creerBibliotheque, STATUTS } from './bibliotheque.js';
import { CRITERES2, avancement } from './criteres-v2.js';
import { etatInitial, trancher } from './recherche-continue.js';
import { VARIANTES_AVANT, plancherVariantes } from './essais-anterieurs.js';
import { COUTS_DEFAUT } from '../agent-m6/couts.js';
import { detecterStagnation, pivoter, suivreRecherche } from '../agent-m6/stagnation.js';
import { PROFIL_DEFAUT, REGLES_INTERDITES, avertissementSeuils, comparerCriteres, criteresDepuisProfil, lireConsignes, profilValide } from './profil-agent.js';
import { avancerCompte, compteVide, detecterSetups, estSuivie, planifierEntrees } from './suivi-live.js';
import { combiner, correlations, phrasePortefeuille } from './portefeuille.js';
import { diagnostiquer } from './diagnostic.js';
import { progressionConfirmation } from './derive.js';
import { intervalleEsperance, phraseDeflation } from './stats-m5.js';
import { statistiques } from './moteur.js';
import { decrireRegle, validerRegle } from './regles-lab.js';
import { executerTranche } from './pilote-calcul.js';
import { FAMILLES } from './hypotheses.js';
import { construireContexte } from './contexte.js';
import { PHASES } from './lecture.js';

/* ═════════════ LE PILOTE DE L'AGENT BTC (M5 ; module pur, testé : m5-pilote-test.mjs) ═════════════
   L'état complet du « poste de pilotage » : profil, bibliothèque de stratégies, coffre du jeu final, état de la recherche sans fin, compte simulé, alertes, notifications, idées en attente.
   Trois hôtes l'utilisent avec le MÊME code : la page (état dans IndexedDB, recherche dans un Worker de navigateur), le Veilleur du PC (état dans un fichier, recherche en arrière-plan à
   priorité basse) et les tests. Toute modification passe par `commande(…)` : une liste fermée d'actions, aucune ne permet de forcer une validation.
   Zéro appel à l'IA ici. Les « idées libres » arrivent déjà traduites en règle structurée (par le Worker, à la demande) et restent EN ATTENTE jusqu'à ce que l'utilisatrice les VOIE et les VALIDE. */
const clone = o => JSON.parse(JSON.stringify(o));
const MAX_ALERTES = 80, MAX_NOTIFS = 200;
export const VERSION_PILOTE = 1;

export function etatPiloteVide(maintenant = Date.now(), paire = 'BTC') {
  const plancher = plancherVariantes(paire), recherche = etatInitial(); recherche.N = plancher; recherche.Navant = plancher;       // honnêteté : les essais antérieurs sur ces données comptent déjà
  return { version: VERSION_PILOTE, paire, couts: { ...(COUTS_DEFAUT[paire] || COUTS_DEFAUT.BTC) }, id: 'P' + maintenant.toString(36) + Math.random().toString(36).slice(2, 8), fusionnes: {}, creeLe: maintenant, profil: profilValide({}), bibliotheque: { strategies: [], journal: [], compteurId: 0 }, coffre: { ouverts: [] }, recherche, compte: compteVide(), alertes: [], notifications: [], setups: {}, ecartees: [],
    derniereBarre: null, recRev: 0, idees: [], hebdo: { derniere: maintenant }, pause: false, journalReglages: [], essais: [] };
}

function unionCoffre(a, b) {
  const vus = new Set(), out = [];
  for (const o of [...((a && a.ouverts) || []), ...((b && b.ouverts) || [])]) { const k = o.debut + '|' + o.ouvertLe + '|' + (o.cle || ''); if (!vus.has(k)) { vus.add(k); out.push(o); } }
  return { ouverts: out.sort((x, y) => x.ouvertLe - y.ouvertLe) };
}
const NOMS_ACTIFS = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' }, RONDS = { SOL: [10, 5], DOGE: [0.05, 0.01] };       // nom parlé et « nombres ronds » de chaque paire
/* jugerAlerte(alerte) → { decision, texte, marge, … } : fourni par l'hôte (état global du compte, agent-m6/m6-etat.js). Sans lui, les alertes sont présentées comme avant. */
export function creerPilote({ etat = null, maintenant = () => Date.now(), paire = 'BTC', jugerAlerte = null } = {}) {
  let e = etat ? { ...etatPiloteVide(maintenant(), (etat && etat.paire) || paire), ...clone(etat) } : etatPiloteVide(maintenant(), paire);
  e.profil = profilValide(e.profil); e.compte = { ...compteVide(), ...e.compte };
  const bib = creerBibliotheque(e.bibliotheque); e.bibliotheque = bib.etat();      // l'objet de la bibliothèque est partagé : e.bibliotheque reste à jour
  let idNotif = e.notifications.reduce((m, n) => Math.max(m, n.num || 0), 0);
  const notifier = (type, titre, texte, extra = {}) => { const n = { num: ++idNotif, id: type + ':' + idNotif, type, titre, texte, t: maintenant(), canaux: { app: false, telegram: false }, ...extra }; e.notifications.push(n); if (e.notifications.length > MAX_NOTIFS) e.notifications.splice(0, e.notifications.length - MAX_NOTIFS); return n; };
  const criteres = () => criteresDepuisProfil(e.profil);

  /* ── Commandes ── */
  function commande(c) {
    const t = maintenant();
    try {
      switch (c.type) {
        case 'activer': bib.activer(c.id, t); return ok('Stratégie activée : elle sera suivie en direct.');
        case 'pause': bib.desactiver(c.id, t); return ok('Stratégie mise en pause : plus de signal, son suivi est conservé.');
        case 'suspendre': bib.suspendre(c.id, c.raison || 'suspendue manuellement', t); notifier('suspension', 'Stratégie suspendue', (bib.trouver(c.id).nom) + ' : ' + (c.raison || 'suspendue manuellement') + '.', { strategie: c.id }); return ok('Stratégie suspendue.');
        case 'reactiver': bib.reactiver(c.id, t); return ok('Stratégie réactivée. Son suivi en direct repart de zéro.');
        case 'supprimer': { const nom = (bib.trouver(c.id) || {}).nom; if (!bib.supprimer(c.id, t)) return ko('stratégie inconnue'); return ok('Stratégie « ' + nom + ' » supprimée (le journal garde la trace).'); }
        case 'dupliquer': {                                       // une copie sert à MODIFIER une règle puis à la reproposer : la validation n'est jamais héritée
          const s = bib.trouver(c.id); if (!s) return ko('stratégie inconnue');
          if (!s.regle) return ko('Cette stratégie vient d’une famille de l’agent (paramètres figés) : elle ne se copie pas telle quelle. Pour en tester une variante, écris-la dans le constructeur de règles.');
          return ok('Règle copiée dans le laboratoire : modifie-la puis propose-la. Elle repassera tous les tests, comme n’importe quelle idée (la validation n’est jamais héritée).', { regle: clone(s.regle), nom: s.nom + ' (variante)' });
        }
        case 'profil': { e.profil = profilValide({ ...e.profil, ...(c.patch || {}), objectif: e.profil.objectif, confirmationTrades: e.profil.confirmationTrades }); return ok('Profil enregistré.', { profil: e.profil }); }
        case 'consignes_lire': { const r = lireConsignes(c.texte); return ok(r.comprises.length ? 'Voici ce que j’ai compris. Rien n’est appliqué avant ta confirmation.' : 'Je n’ai rien compris d’exploitable dans ce texte.', { lecture: r }); }
        case 'consignes_appliquer': {
          const r = lireConsignes(c.texte), avant = { ...e.profil }; e.profil = profilValide({ ...e.profil, ...r.patch, consignes: c.texte });
          e.journalReglages.push({ t, type: 'consignes', texte: String(c.texte).slice(0, 500), effets: r.comprises.map(x => x.effet) }); return ok('Consignes appliquées : ' + (r.comprises.length || 0) + ' règle(s) comprise(s).', { lecture: r, profil: e.profil, seuilsNonAppliques: r.seuils, avant });
        }
        case 'seuils_apercu': { const p2 = profilValide({ ...e.profil, objectif: { ...e.profil.objectif, ...(c.objectif || {}) }, confirmationTrades: c.confirmationTrades != null ? c.confirmationTrades : e.profil.confirmationTrades }); const cmp = comparerCriteres(criteres(), criteresDepuisProfil(p2)); return ok(avertissementSeuils(cmp), { comparaison: cmp }); }
        case 'seuils_appliquer': {
          if (c.confirme !== true) return ko('confirmation explicite nécessaire pour changer les seuils de validation');
          const p2 = profilValide({ ...e.profil, objectif: { ...e.profil.objectif, ...(c.objectif || {}) }, confirmationTrades: c.confirmationTrades != null ? c.confirmationTrades : e.profil.confirmationTrades }), cmp = comparerCriteres(criteres(), criteresDepuisProfil(p2));
          if (!cmp.assoupli.length && !cmp.durci.length) return ok('Aucun changement de seuil.');
          e.profil = p2; e.recRev = (e.recRev || 0) + 1; e.recherche.niveau = 0; e.recherche.curseur = 0; e.recherche.objectifAtteint = false;       // nouvelle recherche depuis le début ; le compteur de variantes N est CONSERVÉ
          e.journalReglages.push({ t, type: 'seuils', avertissement: avertissementSeuils(cmp), avant: cmp.empreinteAvant, apres: cmp.empreinteApres });
          return ok('Seuils modifiés. Ils ne valent que pour les futures recherches ; la recherche repart du début et le nombre de variantes testées est conservé.', { comparaison: cmp });
        }
        case 'couts': {                                           // coûts d'exécution de la paire (frais, spread, glissement) : réglage sensible, jamais fait en silence
          if (c.confirme !== true) return ko('confirmation explicite nécessaire : changer les coûts après avoir vu un résultat est de la sur-optimisation ; ne le fais que si ce sont tes VRAIS coûts');
          const n = {}; for (const k of ['fraisPct', 'spreadPct', 'glissementPct']) { const x = Number(c[k]); if (!(x >= 0 && x <= 2)) return ko(k + ' doit être entre 0 et 2 (en % du prix)'); n[k] = x; }
          const avant = { ...e.couts }; e.couts = n; e.journalReglages.push({ t, type: 'couts', avant, apres: n });
          return ok('Coûts enregistrés. Ils valent pour les prochains tests et le compte simulé ; les stratégies déjà validées l’ont été avec les anciens coûts.', { avant, apres: n });
        }
        case 'idee_proposer': {
          const v = validerRegle(c.regle); if (!v.ok) return ko('règle invalide : ' + v.erreurs.join(' ; '));
          const idee = ideeDepuis(c.nom || v.regle.nom, v.regle, c.origine || 'constructeur', t, false, c.texteLibre); e.idees.push(idee); return ok('Idée enregistrée EN ATTENTE de ta validation. Vérifie la règle ci-dessous : rien n’est testé avant ton accord.', { id: idee.id, description: decrireRegle(v.regle) });
        }
        case 'idee_valider': { const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); if (i.statut !== 'a_valider') return ko('idée déjà ' + i.statut); i.statut = 'en_file'; i.valideeLe = t; return ok('Idée validée : elle sera testée en priorité, avec exactement les mêmes critères que les autres.'); }
        case 'idee_refuser': { const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); i.statut = 'refusee'; return ok('Idée refusée, elle ne sera pas testée.'); }
        case 'importer': { const r = bib.importer(c.texte, t); e.bibliotheque = bib.etat(); return ok(r.ajoutees + ' stratégie(s) importée(s), ' + r.degradees + ' ramenée(s) « en recherche » (preuve non vérifiable), ' + r.ignorees + ' ignorée(s).', r); }
        case 'exporter': return ok('Bibliothèque exportée.', { texte: bib.exporter(t) });
        case 'recherche_pause': e.pause = true; return ok('Recherche en pause.');
        case 'recherche_reprise': e.pause = false; return ok('Recherche reprise.');
        case 'vider_alertes': e.alertes = []; return ok('Alertes effacées.');
        case 'reinitialiser_compte': e.compte = compteVide(); e.alertes = []; for (const s of bib.liste()) s.live = { trades: [], depuis: t }; return ok('Compte simulé remis à zéro.');
        case 'coffre_fusionner': { e.coffre = unionCoffre(e.coffre, { ouverts: c.ouverts || [] }); return ok('Ouvertures du jeu final fusionnées (aucune ne se perd).'); }
        case 'fusion_etat': {                                       // passage page → Veilleur quand les deux ont déjà vécu : coffre en union, compteur de variantes jamais sous-estimé
          const N = Math.max(0, Number(c.N) || 0); e.fusionnes = e.fusionnes || {};
          if (c.id === e.id) e.recherche.N = Math.max(e.recherche.N, N);
          else { const vu = e.fusionnes[c.id] || 0; if (N > vu) { e.recherche.N += N - vu; e.fusionnes[c.id] = N; } }
          e.coffre = unionCoffre(e.coffre, { ouverts: c.ouverts || [] }); return ok('États fusionnés : le nombre de variantes testées ne diminue jamais.');
        }
        case 'notifs_envoyees': { for (const n of e.notifications) if (c.ids.includes(n.id)) n.canaux[c.canal] = true; return ok('ok'); }
        default: return ko('commande inconnue : ' + c.type);
      }
    } catch (err) { return ko(err.message); }
  }
  const ok = (message, extra = {}) => ({ ok: true, message, ...extra });
  const ko = erreur => ({ ok: false, erreur });
  function ideeDepuis(nom, regle, origine, t, valideeAuto, texteLibre = null) {
    return { id: 'I' + (e.idees.length + 1) + '-' + t.toString(36), nom, regle: clone(regle), description: decrireRegle(regle), origine, texteLibre, creeLe: t, statut: valideeAuto ? 'en_file' : 'a_valider' };
  }

  /* ── Recherche : une tranche en trois temps (préparer → exécuter, éventuellement dans un Worker → intégrer) ── */
  function preparerTranche(deps = {}) {
    if (e.pause) return null;
    e.recherche.idees = e.idees.filter(i => i.statut === 'en_file').map(i => ({ id: i.id, nom: i.nom, regle: i.regle }));       // les idées validées passent devant
    e.bibliotheque = bib.etat();
    return clone({ recherche: e.recherche, coffre: e.coffre, bibliotheque: e.bibliotheque, criteres: criteres(), profil: { ...e.profil, paire: e.paire || 'BTC', continuerApresObjectif: false }, config: configMoteur(), derivBrut: deps.derivBrut || null, sansJeuFinal: !!deps.sansJeuFinal, recRev: e.recRev || 0,
      budget: { chantiersMax: e.profil.budget.chantiersParTranche, tempsMs: e.profil.budget.tempsMsParTranche, ...(deps.budget || {}) }, idees: e.recherche.idees.map(i => i.id) });
  }
  function integrerTranche(res, chargeIdees = []) {
    const avantN = e.recherche.N, changeEntreTemps = res.recRev !== undefined && res.recRev !== (e.recRev || 0);
    // Les ouvertures du jeu final ne se perdent JAMAIS (union avec ce que l'état contient déjà) ; si les seuils ont changé pendant le calcul, l'état de la recherche (repartie de zéro) est conservé, seul N est repris.
    if (changeEntreTemps) e.recherche.N = Math.max(e.recherche.N, res.recherche.N); else e.recherche = res.recherche;
    e.coffre = unionCoffre(e.coffre, res.coffre);
    bib.integrer(res.nouvelles); e.bibliotheque = bib.etat();
    for (const ev of res.evenements) traiterEvenement(ev);
    const restantes = new Set((e.recherche.idees || []).map(x => x.id));
    for (const i of e.idees) if (i.statut === 'en_file' && chargeIdees.includes(i.id) && !restantes.has(i.id)) { i.statut = 'testee'; i.testeeLe = maintenant(); i.resultat = (e.recherche.journalCourt.slice().reverse().find(j => j.chantier === 'idee:' + i.id) || {}).decision || 'testée'; }
    if (!changeEntreTemps) e.recherche.idees = [];
    // M6 : suivi de la progression et PIVOT de famille si la meilleure piste proche stagne (les critères ne changent pas, seulement ce qu'on teste)
    const maintenantT = maintenant(); suivreRecherche(e.recherche, maintenantT);
    const st = detecterStagnation(e.recherche);
    if (st.stagne && e.recherche.niveau >= 5 && !e.recherche.objectifAtteint) { const pv = pivoter(e.recherche, maintenantT, st.phrase.replace(/\.$/, '')); if (pv.ok) notifier('pivot', 'La recherche change de famille', pv.texte, {}); }
    return { stop: res.stop, nouvellesVariantes: e.recherche.N - avantN, evenements: res.evenements };
  }
  /* Exécution directe (tests, Veilleur) : tout dans le même processus. */
  async function tranche(deps = {}) {
    const charge = preparerTranche(deps); if (!charge) return { stop: 'pause' };
    const res = await executerTranche(charge, { m15: deps.m15, cede: deps.cede, arret: deps.arret, surEvenement: deps.surEvenement });
    return integrerTranche(res, charge.idees);
  }
  const configMoteur = () => ({ ...(e.couts || {}), risquePct: e.profil.risquePct, maxParSemaine: e.profil.maxParSemaine, reposBarres: Math.round(e.profil.reposHeures * 4) });     // coûts propres à la paire (M6) puis réglages du profil
  function traiterEvenement(ev) {
    if (ev.type === 'validation') { const s = bib.trouver(ev.id); notifier('validation', 'Stratégie VALIDÉE (backtest)', (s ? s.nom : ev.nom) + ' : ' + Math.round(ev.oos.Rtotal * 10) / 10 + ' R net hors échantillon sur ' + ev.oos.n + ' trades, jeu final tenu. Elle est « en confirmation réelle en cours » : ce n’est pas encore une preuve.', { strategie: ev.id, N: ev.N }); }
    else if (ev.type === 'rejet_final') notifier('rejet', 'Candidate rejetée au jeu final', ev.nom + ' avait passé tous les tests hors échantillon mais échoue au jeu final (' + (ev.echecs || []).join(' ; ') + '). C’est le rôle du jeu final : écarter les chances.', { strategie: ev.id, N: ev.N });
    else if (ev.type === 'attente_jeu_final') notifier('attente', 'Candidate en attente du jeu final', ev.raison, {});
  }

  /* ── Direct : une bougie M15 fermée ── */
  function traiterBarre({ fenetre, bougie, phase = null }) {
    if (e.derniereBarre != null && bougie.t <= e.derniereBarre) return { deja: true };
    const profil = e.profil, cfg = configMoteur(), clos = avancerCompte(e.compte, bougie, { profil, config: cfg });
    for (const tr of clos) {
      const s = bib.trouver(tr.strategie); if (!s) continue; const avant = s.statut, d = bib.enregistrerTradeLive(s.id, { R: tr.R, t: tr.t, tSortie: tr.tSortie, motif: tr.motif, sens: tr.sens }, maintenant(), criteres());
      if (d && d.changement && s.statut !== avant) {
        const titre = s.statut === 'confirmee' ? 'Stratégie CONFIRMÉE EN RÉEL' : s.statut === 'surveillance' ? 'Stratégie en SURVEILLANCE' : s.statut === 'suspendue' ? 'Stratégie SUSPENDUE' : 'Stratégie : retour à la normale';
        notifier(s.statut === 'suspendue' ? 'suspension' : s.statut === 'surveillance' ? 'surveillance' : s.statut === 'confirmee' ? 'confirmation' : 'retour', titre, s.nom + ' : ' + d.raison, { strategie: s.id });
      }
    }
    e.bibliotheque = bib.etat();
    let alertes = [];
    if (fenetre) {
      const ctx = construireContexte(fenetre), strategies = bib.liste(), profilAlerte = { ...profil, paire: e.paire || 'BTC', nomActif: NOMS_ACTIFS[e.paire] || 'Bitcoin' };
      if (e.paire && e.paire !== 'BTC') ctx.ronds = RONDS[e.paire] || undefined;
      const r = detecterSetups({ ctx, strategies, compte: e.compte, alertes: e.alertes, profil: profilAlerte, config: cfg, phase: phase || PHASES[ctx.h1.phase[ctx.n - 1]] || null });
      e.setups = r.setups; e.ecartees = r.ecartees;
      for (const a of r.alertes) if (!e.alertes.some(x => x.id === a.id)) {
        // M6 : le GARDIEN PROP juge chaque alerte d'ENTRÉE (compte partagé par les trois paires). Les statistiques de la stratégie (compte simulé) ne dépendent JAMAIS de ton compte : seule la présentation change.
        if (a.type === 'ENTREE' && jugerAlerte) { try { const j = jugerAlerte(a); if (j) { a.gardien = { decision: j.decision, texte: j.texte, marge: j.marge, quantite: j.quantite, niveau: j.niveau, blocages: j.controle ? j.controle.blocages : [], avertissements: j.controle ? j.controle.avertissements : [] }; a.texte = j.decision === 'PASS' ? a.texte + ' · ' + j.texte : j.decision === 'BLOCK' ? '⛔ ENTRÉE BLOQUÉE PAR LE GARDIEN (' + j.controle.blocages[0] + ') · ' + j.marge + ' · pour mémoire : ' + a.texte : a.texte + ' · ⚠ ' + j.texte; } } catch (x) { a.gardien = { decision: 'INCONNU', texte: 'le gardien n’a pas pu juger cette alerte : ' + String(x && x.message || x).slice(0, 80) }; } }
        e.alertes.unshift(a); alertes.push(a);
      }
      e.alertes.length = Math.min(e.alertes.length, MAX_ALERTES); planifierEntrees(e.compte, alertes);
    }
    e.derniereBarre = bougie.t; return { alertes, clos };
  }

  /* ── Résumé hebdomadaire ── */
  function resumeHebdo(force = false) {
    const t = maintenant();
    if (!force && (!e.profil.notifications.hebdo || t - e.hebdo.derniere < 7 * 86400e3)) return null;
    const depuis = e.hebdo.derniere, ev = e.notifications.filter(n => n.t >= depuis && n.type !== 'hebdo'), r = e.recherche;
    const val = ev.filter(n => n.type === 'validation').length, susp = ev.filter(n => ['suspension', 'surveillance'].includes(n.type)).length, rej = ev.filter(n => n.type === 'rejet').length;
    const actives = bib.liste().filter(estSuivie).length, trades = e.compte.fermees.filter(x => x.tSortie >= depuis), Rsem = trades.reduce((s, x) => s + x.R, 0);
    const texte = 'Résumé de la semaine : ' + (r.N - (e.hebdo.NDebut || 0)).toLocaleString('fr-FR') + ' variantes testées cette semaine (' + r.N.toLocaleString('fr-FR') + ' au total ; plus il y en a, plus la barre du hasard monte). ' + val + ' validation(s), ' + rej + ' rejet(s) au jeu final, ' + susp + ' surveillance(s) ou suspension(s). ' +
      actives + ' stratégie(s) active(s) ; ' + trades.length + ' trade(s) simulé(s) en direct pour ' + (Rsem >= 0 ? '+' : '') + Rsem.toFixed(1).replace('.', ',') + ' R. ' + (r.objectifAtteint ? 'Objectif atteint.' : 'La recherche continue : objectif de ' + e.profil.cible + ' stratégie(s) validée(s) et complémentaire(s).') + ' Les résultats passés ne garantissent rien.';
    e.hebdo = { derniere: t, NDebut: r.N }; return notifier('hebdo', 'Résumé hebdomadaire de l’agent BTC', texte);
  }

  /* ── Vues pour l'interface ── */
  function tradesStrategie(s) { return s.preuve ? { oos: s.preuve.horsEchantillon.trades || [], final: s.preuve.jeuFinal.trades || [], live: s.live.trades || [] } : { oos: [], final: [], live: [] }; }
  const premiereFrase = d => String(d || '').split(/(?<=[.!?])\s/)[0];
  /* M6 : famille « principale » (objectif de 4 à 6 R) ou « parallèle » (2 à 3 R, étiquetée à part) : mêmes critères pour les deux, jamais mélangées dans les chiffres. */
  function classeObjectif(s) {
    const R = s.regle ? s.regle.R : (s.params && s.params.R != null ? s.params.R : null);
    return { objectifR: R, classeObjectif: R == null ? { code: 'inconnue', nom: 'objectif inconnu' } : R >= 4 ? { code: 'principale', nom: 'famille principale (objectif de 4 à 6 R)' } : R <= 3 ? { code: 'parallele', nom: 'famille parallèle (objectif de 2 à 3 R), étiquetée à part' } : { code: 'intermediaire', nom: 'objectif intermédiaire (3 à 4 R)' } };
  }
  function carte(s) {
    const p = s.preuve, oos = p ? p.horsEchantillon : null, tr = tradesStrategie(s), crit = criteres();
    const stOOS = oos ? oos.stats : null, ic = oos ? intervalleEsperance(tr.oos.map(x => x.R)) : null, live = statistiques(tr.live.map(x => ({ ...x, barres: 1, sens: x.sens || 1 })), { barres: 0, risquePct: e.profil.risquePct });
    const idee = s.regle ? decrireRegle(s.regle) : premiereFrase(s.description);
    return {
      id: s.id, nom: s.nom, statut: s.statut, statutLibelle: STATUTS[s.statut], active: s.active, ...classeObjectif(s), idee,regles: s.regle ? decrireRegle(s.regle) : (FAMILLES[s.famille] ? FAMILLES[s.famille].description : s.description) + ' Paramètres : ' + JSON.stringify(s.params), famille: s.famille, redondante: !!s.redondante, notes: s.notes || '', correlationMax: s.correlationMax != null ? s.correlationMax : null,
      entrainement: p && p.zoneA ? { n: p.zoneA.n, esperance: p.zoneA.esperance, factProfit: p.zoneA.factProfit, note: 'Sur la zone de recherche (a servi à choisir les paramètres) : NE PAS lire comme une performance.' } : null,
      horsEchantillon: stOOS ? { ...stOOS, ic, courbeR: oos.courbeR, avancement: avancement(stOOS, crit), dsr: oos.dsr, phraseDsr: phraseDeflation(oos.dsr, p.nVariantesAvant) } : null,
      jeuFinal: p ? { ...p.jeuFinal.stats, ok: p.jeuFinal.ok, courbeR: p.jeuFinal.courbeR, k: p.jeuFinal.k } : null,
      compteSimule: { n: live.n, esperance: live.esperance, tauxReussite: live.tauxReussite, factProfit: live.factProfit, Rtotal: live.Rtotal, ddR: live.ddR, courbeR: live.courbeR, confirmation: progressionConfirmation(tr.live, crit) },
      nVariantesAvant: p ? p.nVariantesAvant : null, valideeLe: s.valideeLe || null, historique: s.historique.slice(-6), derniereRaison: s.historique.length ? s.historique[s.historique.length - 1].raison : null,
      setup: e.setups[s.id] || null, echantillonInsuffisant: oos ? oos.stats.n < crit.objectif.tradesMin : false
    };
  }
  function portefeuille() {
    const suivies = bib.liste().filter(s => s.preuve && ['validee', 'confirmee', 'surveillance', 'suspendue'].includes(s.statut)).map(s => ({ id: s.id, nom: s.nom, trades: [...tradesStrategie(s).oos, ...tradesStrategie(s).final].sort((a, b) => a.t - b.t) }));
    const corr = correlations(suivies), comb = combiner(suivies, { maxSimultanees: e.profil.maxSimultanees, risquePct: e.profil.risquePct });
    const chev = suivies.length > 1 ? comb.ecartes.length : 0;
    return { strategies: suivies.map(s => ({ id: s.id, nom: s.nom, n: s.trades.length })), correlations: corr, combine: { n: comb.stats.n, Rtotal: comb.stats.Rtotal, esperance: comb.stats.esperance, ddR: comb.stats.ddR, courbeR: comb.courbeR, ecartes: comb.ecartes.length, parStrategie: comb.parStrategie }, chevauchements: chev, phrases: phrasePortefeuille(corr, comb), note: 'Trades hors échantillon et jeu final seulement ; jamais l’entraînement.' };
  }
  /* Tous les trades connus de toutes les stratégies, étiquetés par origine (oos = hors échantillon, final = jeu final, live = compte simulé) : jamais additionnés sans étiquette. */
  function tousLesTrades() {
    const out = [];
    for (const s of bib.liste()) { if (!s.preuve) continue; const tr = tradesStrategie(s); for (const [source, liste] of [['oos', tr.oos], ['final', tr.final], ['live', tr.live]]) for (const x of liste) out.push({ ...x, strategie: s.id, nomStrategie: s.nom, source }); }
    return out;
  }
  function diagnosticStrategie(id, source = 'oos') { const s = bib.trouver(id); if (!s || !s.preuve) return null; const tr = tradesStrategie(s); return diagnostiquer(source === 'final' ? tr.final : source === 'tout' ? [...tr.oos, ...tr.final] : tr.oos, { nomStrategie: s.nom }); }
  function vue() {
    const r = e.recherche, crit = criteres(), cartes = bib.visibles().map(carte), validees = cartes.filter(c => ['validee', 'confirmee', 'surveillance'].includes(c.statut) && !c.redondante).length;
    return { paire: e.paire || 'BTC', couts: e.couts, profil: e.profil, criteres: { version: crit.version, modifie: !!crit.modifie, objectif: crit.objectif, horsEchantillon: crit.horsEchantillon, deflation: crit.deflation, jeuFinal: crit.jeuFinal, robustesse: crit.robustesse, monteCarlo: crit.monteCarlo, confirmation: crit.confirmation },
      strategies: cartes, rejetees: bib.liste().filter(s => s.statut === 'rejetee').map(s => ({ id: s.id, nom: s.nom, raison: s.historique[s.historique.length - 1].raison })),
      recherche: { N: r.N, Navant: r.Navant || 0, niveau: r.niveau, niveauNom: r.niveau <= 4 ? ['Familles d’origine', 'Familles avec filtres', 'Microstructure', 'Gabarits multi-unités', 'Gabarits avec filtres'][r.niveau] : 'Règles aléatoires (sans fin)', curseur: r.curseur, graine: r.graine, objectifAtteint: r.objectifAtteint, valideesComptees: validees, cible: e.profil.cible, pause: e.pause, dernierChantier: r.dernierChantier, compteurs: r.compteurs, presque: r.presque.slice(0, 8), pistes: r.pistes.slice(0, 8), idees: e.idees.slice(-20), miseAJourLe: r.miseAJourLe,
        avertissement: 'Chaque variante testée de plus durcit le seuil du hasard (Sharpe déflaté). ' + r.N.toLocaleString('fr-FR') + ' variantes testées au total.',
        stagnation: detecterStagnation(r), pivots: (r.pivots || []).slice(-10), focus: r.focus ? r.focus.code : null, file: (r.file || []).length },
      journal: r.journalCourt.slice(-120), alertes: e.alertes.slice(0, 30), setups: e.setups, notifications: e.notifications.slice(-30), compte: { ouvertes: e.compte.ouvertes.map(p => ({ id: p.id, strategie: p.strategie, sens: p.sens, entree: p.pos.fill, stop: p.pos.stop, cible: p.pos.cible, entreeT: p.entreeT })), attente: e.compte.attente, fermees: e.compte.fermees.slice(-60) },
      coffre: e.coffre, journalReglages: e.journalReglages.slice(-20), derniereBarre: e.derniereBarre, bibliothequeJournal: bib.journal().slice(-60), essais: e.essais };
  }
  return { commande, tranche, preparerTranche, integrerTranche, traiterBarre, resumeHebdo, vue, carte, portefeuille, diagnosticStrategie, tousLesTrades, notifier, etat: () => { e.bibliotheque = bib.etat(); return e; }, bibliotheque: bib, criteres, tradesStrategie };
}
export { REGLES_INTERDITES, PROFIL_DEFAUT };
