import { creerHistorique } from './historique.js';
import { tranche as tranchePlage, regrouper, MS, versBougies } from './colonnes.js';
import { construireContexte } from './contexte.js';
import { construireMicro } from './micro-mesures.js';
import { creerPilote, etatPiloteVide } from './pilote-coeur.js';
import { executerTranche } from './pilote-calcul.js';
import { lireMarche } from './lecture.js';
import { sessionDe, SESSIONS, zonesLiquidite } from './micro-mesures.js';
import { empreinte } from '../agent-m6/reproductibilite.js';
import { auditerBougies } from '../agent-m6/integrite.js';
import { PAS_M15 } from './sources.js';

/* ═════════════ HÔTE LOCAL DU PILOTE : tout dans le navigateur (M5 ; testé : m5-hote-test.mjs avec de faux échanges et un faux disque) ═════════════
   Relie : les données (historique BTC 9 ans dans IndexedDB), le pilote (état, commandes), la recherche sans fin (Worker de navigateur : l'interface ne gèle pas), le suivi en direct (une fois par minute,
   bougies fermées seulement), la sauvegarde (IndexedDB, clé « pilote ») et les notifications. L'hôte du Veilleur (PC) fait la même chose dans un processus Node : l'interface ne voit que cette interface
   { vue, commande, … } et ne sait pas lequel des deux répond. Aucun ordre réel, aucune clé de courtier, aucune IA. */
const PAUSE_CHARGE = { max: 0, normale: 150, douce: 1200 };          // pause entre deux tranches (ms) ; le Worker a en plus ses propres pauses
const FENETRE_LIVE = 16000;
const PERIODE_SAUVEGARDE_MS = 3600e3;                                // une sauvegarde de secours par heure au plus (rotation des 5 dernières : reproductibilite.js)

/* Calculateur dans le même processus (tests, navigateur sans Worker) : même protocole que worker-pilote.js. */
export function calculateurEnProcessus() {
  let serie = null, arret = false;
  return { envoyerSerie: s => { serie = s; }, arreter: () => { arret = true; }, terminer: () => { arret = true; },
    tranche: (charge, surEvenement) => { arret = false; return executerTranche(charge, { m15: serie, cede: () => new Promise(r => setTimeout(r, 0)), arret: () => arret, surEvenement }); } };
}
/* Calculateur dans un Worker de navigateur. */
export function calculateurWorker(creerWorker) {
  const w = creerWorker(); let attente = null, surEv = () => {}, versionSerie = 0;
  w.onmessage = ev => { const m = ev.data || ev; if (m.type === 'evenement') surEv(m.ev); else if (m.type === 'fin' && attente) { const a = attente; attente = null; a.ok(m.res); } else if (m.type === 'erreur' && attente) { const a = attente; attente = null; a.ko(new Error(m.message)); } };
  w.onerror = e => { if (attente) { const a = attente; attente = null; a.ko(new Error(String(e && e.message || 'erreur du Worker'))); } };
  return { envoyerSerie: s => { versionSerie++; w.postMessage({ type: 'serie', serie: s }); }, arreter: () => w.postMessage({ type: 'arret' }), terminer: () => { try { w.terminate(); } catch (e) { /* fini */ } },
    tranche: (charge, surEvenement) => new Promise((ok, ko) => { surEv = surEvenement || (() => {}); attente = { ok, ko }; w.postMessage({ type: 'tranche', charge }); }) };
}

export function creerHoteLocal({ stockage, lire, calculateur = null, maintenant = () => Date.now(), periodeMs = 60000, surChangement = () => {}, surAlerte = () => {}, surNotification = () => {}, envoyerTelegram = null, traduireIdee = null, annees = 9.17, pausePersonnalisee = null, paire = 'BTC', sources = null, ordreSources = null, sauvegardes = null, erreurs = null, jugerAlerte = null } = {}) {
  const jugerAlerteHote = a => (jugerAlerte ? jugerAlerte(a) : null);                // le gardien prop juge chaque alerte d'ENTRÉE (compte partagé par les paires)
  const histo = creerHistorique({ stockage, lire, maintenant, annees, ...(sources ? { sources } : {}), ...(ordreSources ? { ordre: ordreSources } : {}) });
  let pilote = creerPilote({ maintenant, paire, jugerAlerte: jugerAlerteHote }), derniereSauvegarde = 0, calc = calculateur, serieEnvoyee = 0, timer = null, detruit = false, boucle = false, progres = null, donneesProgres = null, erreur = null, miseAJourEnCours = false, ecriture = null, enAttente = false;
  const notifier = () => { try { surChangement(); } catch (e) { /* un écouteur défaillant ne casse pas l'hôte */ } };
  const calculateurPret = () => (calc || (calc = calculateurEnProcessus()));

  async function sauver() {
    if (ecriture) return ecriture;
    ecriture = (async () => {
      await Promise.resolve(); ecriture = null;
      try {
        const etat = pilote.etat();
        await stockage.ecrire('pilote', { valeur: etat, somme: empreinte(JSON.stringify(etat)) });         // somme de contrôle : une corruption se voit au chargement
        if (sauvegardes && maintenant() - derniereSauvegarde > PERIODE_SAUVEGARDE_MS) { derniereSauvegarde = maintenant(); await sauvegardes.sauver('pilote', etat); }
      } catch (e) { if (erreurs) erreurs.ajouter('sauvegarde', e && e.message || e); /* disque plein */ }
    })();
    return ecriture;
  }
  async function charger() {
    const r = await stockage.lire('pilote');
    if (r && r.valeur) {
      if (r.somme && empreinte(JSON.stringify(r.valeur)) !== r.somme) {          // état principal corrompu : on retombe sur la dernière sauvegarde valide, et on le dit
        if (erreurs) erreurs.ajouter('etat', 'état du pilote corrompu (somme de contrôle différente) : restauration de la dernière sauvegarde valide');
        const s = sauvegardes ? await sauvegardes.restaurer('pilote') : { etat: null };
        if (s.etat) { pilote = creerPilote({ etat: s.etat, maintenant, paire, jugerAlerte: jugerAlerteHote }); erreur = 'état corrompu : restauré depuis la sauvegarde du ' + new Date(s.t).toLocaleString('fr-FR'); return; }
        erreur = 'état du pilote corrompu et aucune sauvegarde valide : redémarrage à zéro'; return;
      }
      pilote = creerPilote({ etat: r.valeur, maintenant, paire, jugerAlerte: jugerAlerteHote });
    } else if (sauvegardes && !r) {                                              // aucun état mais des sauvegardes (disque vidé) : on les reprend
      const s = await sauvegardes.restaurer('pilote'); if (s.etat) { pilote = creerPilote({ etat: s.etat, maintenant, paire, jugerAlerte: jugerAlerteHote }); erreur = 'état absent : restauré depuis la sauvegarde du ' + new Date(s.t).toLocaleString('fr-FR'); }
    }
  }

  /* ── Notifications : application (Rayle) et Telegram, chacune une seule fois ── */
  async function diffuserNotifications() {
    const e = pilote.etat(), nouvelles = e.notifications.filter(n => !n.canaux.app || (!n.canaux.telegram && envoyerTelegram && e.profil.notifications.telegram && !n.telegramEchec));
    for (const n of nouvelles) {
      if (!n.canaux.app && e.profil.notifications.application) { try { surNotification(n); n.canaux.app = true; } catch (x) { /* fenêtre absente */ } }
      if (!n.canaux.telegram && envoyerTelegram && e.profil.notifications.telegram) { try { await envoyerTelegram('Agent ' + paire + ' · ' + n.titre + '\n' + n.texte, n.type); n.canaux.telegram = true; } catch (x) { n.telegramEchec = String(x && x.message || x).slice(0, 80); } }
    }
    if (nouvelles.length) await sauver();
  }

  /* ── Données ── */
  async function synchroniser() {
    donneesProgres = { phase: 'telechargement', bougies: 0 }; notifier();
    try { await histo.synchroniser({ surProgres: p => { donneesProgres = p.phase === 'termine' ? null : p; notifier(); } }); }
    catch (e) { donneesProgres = { phase: 'erreur', message: String(e && e.message || e) }; erreur = donneesProgres.message; notifier(); return false; }
    donneesProgres = null; const s = histo.serie();
    if (s.n && pilote.etat().derniereBarre == null) pilote.etat().derniereBarre = s.t[s.n - 1];
    await sauver(); notifier(); return s.n > 0;
  }
  const donnees = () => { const d = histo.etat(); return { n: d.n, debut: d.debut, fin: d.fin, source: d.source, secours: d.secours, deltaReelPct: d.deltaReelPct, lacunes: d.lacunes || [], nbLacunes: (d.lacunes || []).length, majLe: d.majLe, erreur: d.erreur || erreur, annees: d.annees, progres: donneesProgres, prix: d.n ? histo.serie().c[histo.serie().n - 1] : null, anneesCible: annees }; };

  /* ── Direct ── */
  async function miseAJour() {
    if (miseAJourEnCours || detruit) return; miseAJourEnCours = true;
    try {
      if (!histo.serie().n) { await synchroniser(); return; }
      const r = await histo.actualiser();
      if (r.nouvelles && r.nouvelles.length) {
        const s = histo.serie(), liste = r.nouvelles;
        for (let i = 0; i < liste.length; i++) {
          const b = liste[i], derniere = i === liste.length - 1, fen = derniere ? tranchePlage(s, Math.max(0, s.n - FENETRE_LIVE), s.n) : null;
          const res = pilote.traiterBarre({ fenetre: fen, bougie: b });
          for (const a of res.alertes || []) { try { surAlerte(a); } catch (x) { /* ignoré */ } if (envoyerTelegram && pilote.etat().profil.notifications.telegram) { try { await envoyerTelegram((a.type === 'ENTREE' ? (a.gardien && a.gardien.decision === 'BLOCK' ? '⛔ ' : '🟢 ') : '🟡 ') + a.texte, a.type); } catch (x) { /* Telegram indisponible */ } } }
        }
        pilote.resumeHebdo(); await diffuserNotifications(); await sauver();
      } else pilote.resumeHebdo();
      notifier();
    } catch (e) { erreur = String(e && e.message || e); notifier(); } finally { miseAJourEnCours = false; }
  }

  /* ── Recherche sans fin ── */
  function envoyerSerieSiBesoin() { const s = histo.serie(); if (!s.n) return false; const c = calculateurPret(); if (!serieEnvoyee || s.n - serieEnvoyee >= 96) { c.envoyerSerie(s); serieEnvoyee = s.n; } return true; }
  async function boucleRecherche() {
    if (boucle || detruit) return; boucle = true; progres = { phase: 'demarrage', N: pilote.etat().recherche.N }; notifier();
    try {
      while (!detruit) {
        const e = pilote.etat();
        if (e.pause) { progres = null; break; }
        if (enJeu) { progres = { phase: 'pause_jeu' }; notifier(); await new Promise(ok => setTimeout(ok, 2500)); continue; }
        if (!envoyerSerieSiBesoin()) { progres = null; break; }
        const charge = pilote.preparerTranche(); if (!charge) { progres = null; break; }
        let res;
        try { res = await calculateurPret().tranche(charge, ev => { if (ev.type === 'progres' || ev.type === 'chantier' || ev.type === 'debut') { progres = { phase: 'calcul', N: ev.N != null ? ev.N : progres && progres.N, niveau: ev.niveau, chantier: ev.chantier ? ev.chantier.nom : progres && progres.chantier }; notifier(); } }); }
        catch (x) { erreur = 'recherche : ' + String(x && x.message || x); progres = null; notifier(); break; }
        const r = pilote.integrerTranche(res, charge.idees);
        await diffuserNotifications(); await sauver(); notifier();
        if (['objectif', 'refus', 'arret'].includes(r.stop)) { progres = null; break; }
        if (r.stop === 'attente_jeu_final') { progres = { phase: 'attente_jeu_final' }; enAttente = true; break; }
        const pause = pausePersonnalisee != null ? pausePersonnalisee : PAUSE_CHARGE[pilote.etat().profil.budget.charge] || 1200;
        await new Promise(ok => setTimeout(ok, pause));
      }
    } finally { boucle = false; if (!pilote.etat().pause && progres && progres.phase === 'demarrage') progres = null; notifier(); }
  }
  /* Mode jeu de Rayle : la recherche locale s'arrête tant qu'il est actif (le calcul en cours est interrompu proprement). */
  let enJeu = false; const definirModeJeu = a => { enJeu = !!a; if (enJeu && calc) calc.arreter(); notifier(); };
  function lancerRecherche() { if (boucle) return false; if (!histo.serie().n) return false; pilote.commande({ type: 'recherche_reprise' }); boucleRecherche(); return true; }
  function pauserRecherche() { pilote.commande({ type: 'recherche_pause' }); if (calc) calc.arreter(); sauver(); notifier(); }

  /* ── Interface ── */
  async function commande(c) {
    let r;
    if (c.type === 'recherche_pause') { pauserRecherche(); return { ok: true, message: 'Recherche en pause.' }; }
    if (c.type === 'recherche_reprise') { return lancerRecherche() ? { ok: true, message: 'Recherche reprise.' } : { ok: false, erreur: 'pas de données ou recherche déjà en cours' }; }
    r = pilote.commande(c);
    if (r.ok && ['activer', 'suspendre', 'reactiver', 'supprimer', 'dupliquer', 'profil', 'consignes_appliquer', 'seuils_appliquer', 'importer', 'idee_proposer', 'idee_valider', 'idee_refuser', 'pause', 'reinitialiser_compte', 'vider_alertes'].includes(c.type)) { await sauver(); await diffuserNotifications(); notifier(); }
    if (r.ok && c.type === 'idee_valider' && !boucle) lancerRecherche();
    return r;
  }
  /* « Idée libre » : le texte est envoyé UNE fois au Worker (peu de jetons) qui répond par une règle structurée ; elle est enregistrée EN ATTENTE, montrée à l'utilisatrice, jamais testée sans son accord. */
  async function ideeLibre(texte) {
    if (!traduireIdee) return { ok: false, erreur: 'La traduction d’idées demande le Worker de Raylé (route /agent/idee, à déployer avec ton accord). En attendant, utilise le constructeur de règles.' };
    let rep; try { rep = await traduireIdee(String(texte).slice(0, 600)); } catch (x) { return { ok: false, erreur: 'Traduction impossible : ' + String(x && x.message || x) }; }
    if (!rep || !rep.regle) return { ok: false, erreur: (rep && rep.erreur) || 'Le Worker n’a pas pu traduire cette idée en règle.' };
    const r = pilote.commande({ type: 'idee_proposer', regle: rep.regle, origine: 'idee-libre', texteLibre: texte }); if (r.ok) { await sauver(); notifier(); }
    return { ...r, explication: rep.explication || null };
  }

  /* ── Données pour le graphique ── */
  function bougies(unite = 'm15', n = 1500, avant = null) {
    const s = histo.serie(); if (!s.n) return { unite, bougies: [] };
    const fin = avant != null ? Math.max(0, Math.min(s.n, avant)) : s.n;
    let src = s, idxFin = fin;
    if (unite !== 'm15') { src = regrouper(tranchePlage(s, Math.max(0, fin - n * (unite === 'h4' ? 16 : 4) - 64), fin), MS[unite.toUpperCase()]).serie; idxFin = src.n; }
    const a = Math.max(0, idxFin - n), out = [];
    for (let i = a; i < idxFin; i++) out.push({ t: src.t[i], o: src.o[i], h: src.h[i], l: src.l[i], c: src.c[i], v: src.v[i] });
    return { unite, bougies: out };
  }
  /* Surcouches (POC, zone de valeur, VWAP, extrêmes de l'Asie, phase, session) sur les `n` dernières bougies M15 : tableaux alignés sur les bougies renvoyées par bougies('m15', n). */
  function surcouches(n = 1500) {
    const s = histo.serie(); if (!s.n) return null; const fen = tranchePlage(s, Math.max(0, s.n - Math.max(n, 3500)), s.n), ctx = construireContexte(fen), mi = construireMicro(ctx), a = Math.max(0, fen.n - n), out = { t: [], poc: [], vah: [], val: [], vwap: [], asieHaut: [], asieBas: [], veilleHaut: [], veilleBas: [], phase: [], session: [], liquidite: [] };
    for (let i = a; i < fen.n; i++) { out.t.push(fen.t[i]); out.poc.push(ctx.h1.poc[i]); out.vah.push(ctx.h1.vah[i]); out.val.push(ctx.h1.val[i]); out.vwap.push(mi.vwap[i]); out.asieHaut.push(mi.asiaHaut[i]); out.asieBas.push(mi.asiaBas[i]); out.veilleHaut.push(mi.veilleHaut[i]); out.veilleBas.push(mi.veilleBas[i]); out.phase.push(ctx.h1.phase[i]); out.session.push(mi.sess[i]); }
    try { out.liquidite = zonesLiquidite(ctx, fen.n - 1).map(z => ({ prix: z.prix, type: z.type, cote: z.cote, distanceATR: z.distanceATR })); } catch (e) { out.liquidite = []; }       // zones PROBABLES (lecture), pas des ordres réels
    return out;
  }
  /* Bougies entre deux instants (ms), dans l'unité demandée : sert au graphique (aller à un trade, rejouer un trade). Au plus `max` bougies. */
  function bougiesEntre(unite, t0, t1, max = 2500) {
    const s = histo.serie(); if (!s.n) return { unite, bougies: [] };
    let a = 0, b = s.n; while (a < b) { const m = (a + b) >> 1; if (s.t[m] < t0 - 16 * 3600e3) a = m + 1; else b = m; } let i0 = a; a = i0; b = s.n; while (a < b) { const m = (a + b) >> 1; if (s.t[m] <= t1 + 16 * 3600e3) a = m + 1; else b = m; } const i1 = a;
    let src = tranchePlage(s, i0, i1); if (unite !== 'm15') src = regrouper(src, MS[unite.toUpperCase()]).serie;
    const out = []; for (let i = 0; i < src.n && out.length < max; i++) if (src.t[i] >= t0 - (unite === 'h4' ? 48 : unite === 'h1' ? 12 : 3) * 3600e3 && src.t[i] <= t1 + (unite === 'h4' ? 48 : unite === 'h1' ? 12 : 3) * 3600e3) out.push({ t: src.t[i], o: src.o[i], h: src.h[i], l: src.l[i], c: src.c[i], v: src.v[i] });
    return { unite, bougies: out };
  }
  /* Lecture du marché (phase, volume, direction du volume, volatilité…) : recalculée seulement quand une nouvelle bougie ferme. */
  let lecture = null, lectureDe = -1;
  function lectureMarche() {
    const s = histo.serie(); if (!s.n) return null; if (lectureDe !== s.t[s.n - 1]) { try { lecture = lireMarche(s.n > 30000 ? tranchePlage(s, s.n - 30000, s.n) : s); } catch (e) { lecture = { ok: false, raison: String(e && e.message || e) }; } lectureDe = s.t[s.n - 1]; }
    return lecture ? { ...lecture, session: SESSIONS[sessionDe(s.t[s.n - 1])] } : null;
  }
  /* Reprend l'état d'un autre hôte (retour du Veilleur vers la page). */
  async function adopterEtat(etat) { pilote = creerPilote({ etat: JSON.parse(JSON.stringify(etat)), maintenant, paire, jugerAlerte: jugerAlerteHote }); await sauver(); notifier(); }
  const serie = () => histo.serie();

  async function demarrer({ synchro = false, boucleDirect = true, chercher = false } = {}) {
    await charger(); await histo.charger();
    if (synchro) await synchroniser();
    if (boucleDirect && !timer) timer = setInterval(miseAJour, periodeMs);
    notifier();
    if (chercher) lancerRecherche();
    return vue();
  }
  function vue() {
    const v = pilote.vue();
    return { ...v, donnees: donnees(), progres, rechercheEnCours: boucle, enAttenteJeuFinal: enAttente, erreur, hote: 'local', paire, stockage: stockage.type || '?' };
  }
  /* ── Fiabilité (M6) : intégrité des données, recoupement avec une autre source, santé ── */
  let integriteMemo = { cle: null, val: null }, recoupement = null;
  function integrite() {
    const s = histo.serie(); if (!s.n) return null; const cle = s.n + ':' + s.t[s.n - 1];
    if (integriteMemo.cle !== cle) { integriteMemo = { cle, val: auditerBougies(versBougies(s), { pas: PAS_M15 }) }; }
    return integriteMemo.val;
  }
  const definirRecoupement = r => { recoupement = r ? { ...r, majLe: maintenant() } : null; notifier(); };
  function santeEntrees() {
    const s = histo.serie(), d = histo.etat();
    return { paire, n: s.n, derniere: s.n ? s.t[s.n - 1] : null, source: d.source, secours: d.secours, integrite: integrite(), recoupement };
  }
  function detruire() { detruit = true; if (timer) clearInterval(timer); timer = null; if (calc) calc.terminer(); }
  return { demarrer, synchroniser, miseAJour, commande, ideeLibre, vue, lancerRecherche, pauserRecherche, definirModeJeu, adopterEtat, bougies, bougiesEntre, lectureMarche, tousLesTrades: () => pilote.tousLesTrades(), portefeuille: () => pilote.portefeuille(), diagnostic: (id, source) => pilote.diagnosticStrategie(id, source), surcouches, serie, integrite, definirRecoupement, santeEntrees, paire, detruire, pilote: () => pilote, histo, diffuserNotifications, sauver, _boucle: () => boucle };
}
export { etatPiloteVide };
