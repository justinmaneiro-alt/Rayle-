import { creerPilote } from './pilote-coeur.js';

/* ═════════════ HÔTE « VEILLEUR DU PC » : la page affiche et commande, le PC cherche en arrière-plan (M5 ; testé : m5-hote-distant-test.mjs) ═════════════
   Même interface que hote-local.js ({ vue, commande, tousLesTrades, bougies… }) : la fenêtre ne sait pas lequel des deux lui répond. L'état (profil, stratégies, coffre du jeu final, recherche) vit dans
   le fichier du Veilleur ; cette page en garde une COPIE en lecture (rafraîchie toutes les quelques secondes), calcule les vues avec le même code (pilote-coeur.js) et envoie ses actions comme
   commandes (une liste fermée, aucune ne permet de forcer une validation). Les données de marché pour le graphique viennent de l'hôte local (historique du navigateur).
   Les notifications destinées à l'application sont affichées ici une seule fois puis marquées ; Telegram est envoyé par le processus du PC, pas par la page (pas de doublon). */
export function creerHoteDistant({ hoteDonnees, appeler, surChangement = () => {}, surAlerte = () => {}, surNotification = () => {}, periodeMs = 6000, maintenant = () => Date.now(), traduireIdee = null } = {}) {
  let pilote = creerPilote({ maintenant }), rev = -1, chercheur = { enMarche: false, etat: null }, timer = null, erreur = null, detruit = false, existe = false;
  const alertesVues = new Set(), notifsMontrees = new Set();
  const notifier = () => { try { surChangement(); } catch (e) { /* un écouteur défaillant ne casse pas l'hôte */ } };

  async function rafraichir() {
    if (detruit) return false;
    try {
      const r = await appeler('pilote'); if (!r || !r.ok) throw new Error((r && r.erreur) || 'réponse invalide');
      chercheur = r.chercheur || chercheur; existe = !!r.existe; erreur = null;
      if (r.existe && r.etat && r.etat.rev !== rev) {
        const premier = rev === -1; rev = r.etat.rev; pilote = creerPilote({ etat: r.etat, maintenant });
        const nouvelles = []; for (const a of pilote.etat().alertes) { if (!alertesVues.has(a.id)) { alertesVues.add(a.id); if (!premier && maintenant() - a.t < 20 * 60000) { try { surAlerte(a); } catch (x) { /* ignoré */ } } } }
        const aMarquer = []; for (const n of pilote.etat().notifications) if (!n.canaux.app && !notifsMontrees.has(n.id) && pilote.etat().profil.notifications.application) { notifsMontrees.add(n.id); aMarquer.push(n.id); try { surNotification(n); } catch (x) { /* ignoré */ } }
        if (aMarquer.length) appeler('pilote-commande', { commande: { type: 'notifs_envoyees', ids: aMarquer, canal: 'app' } }).catch(() => {});
      }
      notifier(); return true;
    } catch (e) { erreur = 'Veilleur injoignable : ' + String(e && e.message || e); notifier(); return false; }
  }
  async function commande(c) {
    let r;
    try { const rep = await appeler('pilote-commande', { commande: c }); r = rep.resultat || { ok: false, erreur: rep.erreur || 'réponse invalide' }; }
    catch (e) { return { ok: false, erreur: 'Veilleur injoignable : ' + String(e && e.message || e) }; }
    await rafraichir(); return r;
  }
  async function ideeLibre(texte) {
    if (!traduireIdee) return { ok: false, erreur: 'La traduction d’idées demande le Worker de Raylé (route /agent/idee, à déployer avec ton accord).' };
    let rep; try { rep = await traduireIdee(String(texte).slice(0, 600)); } catch (x) { return { ok: false, erreur: 'Traduction impossible : ' + String(x && x.message || x) }; }
    if (!rep || !rep.regle) return { ok: false, erreur: (rep && rep.erreur) || 'Le Worker n’a pas pu traduire cette idée en règle.' };
    const r = await commande({ type: 'idee_proposer', regle: rep.regle, origine: 'idee-libre', texteLibre: texte }); return { ...r, explication: rep.explication || null };
  }
  function vue() {
    const v = pilote.vue(), c = chercheur.etat || {}, enCours = chercheur.enMarche && c.phase === 'recherche';
    return { ...v, donnees: hoteDonnees.vue().donnees, progres: chercheur.enMarche ? { phase: c.phase, N: c.N, chantier: c.raison || null } : null, rechercheEnCours: enCours, enAttenteJeuFinal: false, erreur: erreur || (hoteDonnees.vue().erreur || null), hote: 'veilleur',
      chercheur: { enMarche: chercheur.enMarche, phase: c.phase || null, raison: c.raison || null, jeu: !!c.jeu, tranches: c.tranches || 0, vivantLe: c.vivantLe || null, telegram: c.telegram || null }, stockage: 'fichier du Veilleur' };
  }
  async function demarrer() { await rafraichir(); if (!timer) timer = setInterval(rafraichir, periodeMs); return vue(); }
  const lancerChercheur = () => appeler('chercheur-demarrer', {});
  return { demarrer, rafraichir, vue, commande, ideeLibre, lancerChercheur, detruire() { detruit = true; if (timer) clearInterval(timer); timer = null; },
    bougies: (...a) => hoteDonnees.bougies(...a), bougiesEntre: (...a) => hoteDonnees.bougiesEntre(...a), surcouches: (...a) => hoteDonnees.surcouches(...a), lectureMarche: () => hoteDonnees.lectureMarche(), serie: () => hoteDonnees.serie(),
    integrite: () => hoteDonnees.integrite(), santeEntrees: () => hoteDonnees.santeEntrees(), definirRecoupement: r => hoteDonnees.definirRecoupement(r), paire: hoteDonnees.paire || 'BTC',
    tousLesTrades: () => pilote.tousLesTrades(), portefeuille: () => pilote.portefeuille(), diagnostic: (id, source) => pilote.diagnosticStrategie(id, source), synchroniser: () => hoteDonnees.synchroniser(), miseAJour: () => hoteDonnees.miseAJour(), pilote: () => pilote,
    lancerRecherche: () => commande({ type: 'recherche_reprise' }).then(r => r.ok), pauserRecherche: () => commande({ type: 'recherche_pause' }), existe: () => existe, definirModeJeu: a => { appeler('mode-jeu', { actif: !!a }).catch(() => {}); } };
}
