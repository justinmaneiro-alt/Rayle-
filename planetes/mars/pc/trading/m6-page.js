import { creerM6 } from '../agent-m6/m6-etat.js';
import { ouvrirStockageBtc } from '../agent-btc/stockage-btc.js';
import { creerSauvegardes, empreinte } from '../agent-m6/reproductibilite.js';
import { journalErreurs } from './pilote-page.js';

/* ═════════════ L'ÉTAT GLOBAL DU COMPTE DANS LA PAGE (M6) : gardien, tilt, journal, idées ═════════════
   UN état pour les trois paires (un compte d'évaluation = un compte), dans IndexedDB « rayle-m6 » (somme de contrôle, sauvegarde horaire, restauration automatique si l'état est abîmé), copié vers le
   Veilleur du PC (route /__veilleur/m6-etat) pour qu'il juge les alertes même quand la page est fermée. La page est l'UNIQUE écrivain : le Veilleur ne fait que lire.
   Tests : window.__RAYLE_POSTE_TEST__.m6 (instance toute faite) ou .stockageM6 / .indexedDB = null. Aucun secret ici. */
let promesse = null, instance = null, stockage = null, sauvegardes = null, minuterie = null, derniereSauvegarde = 0, derniereCopie = 0, erreurCopie = null, charge = null;
const ecouteurs = new Set();
export const surChangementM6 = f => { ecouteurs.add(f); return () => ecouteurs.delete(f); };
const diffuser = () => { for (const f of ecouteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
export const m6Charge = () => instance;
export const jugerAlerteGlobal = alerte => (instance ? instance.jugerAlerteAgent(alerte) : null);
export const infosStockageM6 = () => ({ type: stockage ? stockage.type : null, charge, erreurCopieVeilleur: erreurCopie, derniereSauvegarde, derniereCopie });

export function obtenirM6() {
  if (promesse) return promesse;
  promesse = (async () => {
    const test = window.__RAYLE_POSTE_TEST__ || {};
    if (test.m6) { instance = test.m6; instance.surChangement(() => diffuser()); return instance; }
    stockage = test.stockageM6 || await ouvrirStockageBtc(test.indexedDB === null ? null : undefined, 'rayle-m6');
    sauvegardes = creerSauvegardes(stockage, { garder: 5 });
    let etat = null; const r = await stockage.lire('m6');
    if (r && r.valeur) {
      if (r.somme && empreinte(JSON.stringify(r.valeur)) !== r.somme) {
        journalErreurs.ajouter('m6', 'état du compte et du journal corrompu : restauration de la dernière sauvegarde valide');
        const s = await sauvegardes.restaurer('m6'); if (s.etat) { etat = s.etat; charge = 'restauré depuis la sauvegarde du ' + new Date(s.t).toLocaleString('fr-FR') + ' (l’état principal était corrompu)'; } else charge = 'ÉTAT CORROMPU ET AUCUNE SAUVEGARDE : compte et journal remis à zéro';
      } else { etat = r.valeur; charge = 'chargé'; }
    } else if (!r) { const s = await sauvegardes.restaurer('m6'); if (s.etat) { etat = s.etat; charge = 'état absent : restauré depuis la sauvegarde du ' + new Date(s.t).toLocaleString('fr-FR'); } else charge = 'nouveau'; }
    instance = creerM6({ etat });
    instance.surChangement(() => { planifierSauvegarde(); diffuser(); });
    window.RayleM6 = instance;
    return instance;
  })();
  return promesse;
}
function planifierSauvegarde() { clearTimeout(minuterie); minuterie = setTimeout(() => sauver().catch(() => {}), 500); }
export async function sauver() {
  if (!instance || !stockage) return;
  const etat = instance.etat(), valeur = JSON.parse(JSON.stringify(etat));
  try { await stockage.ecrire('m6', { valeur, somme: empreinte(JSON.stringify(valeur)) }); if (Date.now() - derniereSauvegarde > 3600e3) { derniereSauvegarde = Date.now(); await sauvegardes.sauver('m6', valeur); } }
  catch (e) { journalErreurs.ajouter('m6', 'écriture impossible : ' + (e && e.message || e)); }
  // copie vers le Veilleur du PC (silencieux s'il n'existe pas : navigateur sans le serveur local)
  if (Date.now() - derniereCopie > 2000) {
    derniereCopie = Date.now();
    try { const rep = await fetch('/__veilleur/m6-etat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: JSON.stringify({ etat: valeur }) }); erreurCopie = rep.ok ? null : 'HTTP ' + rep.status; } catch (e) { erreurCopie = 'Veilleur injoignable'; }
  }
}
/* Commande sur l'état global, avec les effets qui touchent les paires (une idée validée part dans leurs files de recherche). */
export async function commandeM6(c) {
  const m = await obtenirM6(), r = m.commande(c);
  if (r.ok && c.type === 'idee_valider' && r.aEnvoyer) {
    const { obtenirHotePaire } = await import('./pilotes-paires.js'), envoyees = [], idee = m.etat().idees.find(x => x.id === r.aEnvoyer.id); idee.pilotes = idee.pilotes || {};
    for (const p of r.aEnvoyer.paires) {
      try {
        const h = await obtenirHotePaire(p, { demarrer: true }), a = await h.commande({ type: 'idee_proposer', regle: r.aEnvoyer.regle, nom: r.aEnvoyer.nom, origine: 'bibliotheque-' + (idee.source ? idee.source.type : 'utilisateur') });
        if (a.ok) { await h.commande({ type: 'idee_valider', id: a.id }); idee.pilotes[p] = a.id; envoyees.push(p); }
      } catch (e) { journalErreurs.ajouter('idees', p + ' : ' + (e && e.message || e)); }
    }
    m.commande({ type: 'idee_en_test', id: idee.id }); r.envoyees = envoyees;
  }
  return r;
}
/* Rapatrie dans la bibliothèque les verdicts des idées testées par les paires (à appeler quand un pilote change). */
export async function synchroniserIdees(hotes) {
  const m = instance; if (!m) return 0; let n = 0;
  for (const i of m.etat().idees) {
    if (i.statut !== 'en_test' || !i.pilotes) continue;
    for (const [p, idPilote] of Object.entries(i.pilotes)) {
      const h = hotes[p]; if (!h || i.resultats[p]) continue; const x = h.pilote().etat().idees.find(y => y.id === idPilote);
      if (x && x.statut === 'testee') { m.commande({ type: 'idee_resultat', id: i.id, paire: p, verdict: String(x.resultat || 'testée') }); n++; }
    }
  }
  return n;
}

/* Image d'une capture jointe à un trade : gardée sur l'appareil (IndexedDB), les 30 plus récentes seulement. */
export async function sauverImageCapture(id, dataUrl) {
  if (!stockage || !dataUrl) return false;
  try {
    await stockage.ecrire('capture:' + id, { image: dataUrl, t: Date.now() });
    const cles = (await stockage.liste()).filter(k => String(k).startsWith('capture:')).sort(); for (const k of cles.slice(0, Math.max(0, cles.length - 30))) await stockage.supprimer(k);
    return true;
  } catch (e) { journalErreurs.ajouter('m6', 'capture non gardée : ' + (e && e.message || e)); return false; }
}
export async function lireImageCapture(id) { try { const r = stockage && await stockage.lire('capture:' + id); return r ? r.image : null; } catch (e) { return null; } }
