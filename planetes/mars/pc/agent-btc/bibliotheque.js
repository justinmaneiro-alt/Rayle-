import { empreinteCriteres } from './criteres.js';
import { CRITERES2 } from './criteres-v2.js';
import { prochainStatut } from './derive.js';

/* ═════════════ BIBLIOTHÈQUE DE STRATÉGIES (M5 ; module pur, testé : m5-bibliotheque-test.mjs) ═════════════
   Une stratégie = une famille (hypotheses*.js) ou une règle du laboratoire + des paramètres figés + son dossier de preuves. Persistante, sauvegardée, exportable en fichier.
   Statuts : en_recherche → validee → confirmee ; validee/confirmee ⇄ surveillance → suspendue ; rejetee (n'a pas passé le jeu final) ; une stratégie supprimée disparaît de la liste mais le journal garde sa trace.
   RÈGLE : le statut « validee » ne s'obtient QUE par `valider(id, preuve)` avec une preuve qui passe tous les critères (hors échantillon + jeu final). Aucune fonction ne permet de forcer une validation,
   et l'import d'un fichier ne fait pas confiance au statut : il est vérifié par un sceau (un fichier modifié à la main revient « en_recherche »). Dupliquer ne copie JAMAIS la validation :
   la copie est « en_recherche » et doit repasser tous les tests. */
export const STATUTS = Object.freeze({ en_recherche: 'EN RECHERCHE', validee: 'VALIDÉE (backtest)', confirmee: 'CONFIRMÉE EN RÉEL', surveillance: 'EN SURVEILLANCE', suspendue: 'SUSPENDUE', rejetee: 'REJETÉE' });
const TRANSITIONS = { en_recherche: ['validee', 'rejetee'], validee: ['confirmee', 'surveillance', 'suspendue'], confirmee: ['surveillance', 'suspendue'], surveillance: ['validee', 'confirmee', 'suspendue'], suspendue: ['validee', 'surveillance'], rejetee: [] };
export const VERSION_FICHIER = 1;
const clone = o => JSON.parse(JSON.stringify(o));
const sceauDe = s => empreinteCriteres({ id: s.id, famille: s.famille, regle: s.regle || null, params: s.params, statut: s.statut, valide: s.preuve ? { v: s.preuve.criteresVersion, n: s.preuve.nVariantesAvant, ok: s.preuve.horsEchantillon && s.preuve.horsEchantillon.ok, f: s.preuve.jeuFinal && s.preuve.jeuFinal.ok } : null });

export function creerBibliotheque(etatInitial = null) {
  let liste = etatInitial && Array.isArray(etatInitial.strategies) ? clone(etatInitial.strategies) : [], journal = etatInitial && Array.isArray(etatInitial.journal) ? clone(etatInitial.journal) : [], compteurId = etatInitial && etatInitial.compteurId || liste.length;
  const trace = (t, id, evenement, detail) => { journal.push({ t, id, evenement, detail }); if (journal.length > 500) journal.splice(0, journal.length - 500); };
  const trouver = id => liste.find(s => s.id === id) || null;
  const nouvelId = famille => 'S' + String(++compteurId).padStart(3, '0') + '-' + String(famille).replace(/[^a-z0-9_]/gi, '').slice(0, 14) + '-' + (Date.now() % 1679616).toString(36);   // suffixe horaire : deux hôtes (page, Veilleur) ne produisent jamais le même identifiant

  function ajouter({ nom, famille, params, regle = null, description = '', statut = 'en_recherche', t = Date.now(), idForce = null }) {
    if (!STATUTS[statut] || statut === 'validee' || statut === 'confirmee') throw new Error('une stratégie ne naît pas validée : utiliser valider() avec une preuve');
    const s = { id: idForce || nouvelId(famille), nom, famille, params: clone(params || {}), regle: regle ? clone(regle) : null, description, statut, active: false, creeLe: t, preuve: null, live: { trades: [] }, historique: [{ t, de: null, vers: statut, raison: 'création' }], notes: '' };
    s.sceau = sceauDe(s); liste.push(s); trace(t, s.id, 'creation', nom); return s;
  }
  function changerStatut(id, vers, raison, t = Date.now()) {
    const s = trouver(id); if (!s) throw new Error('stratégie inconnue : ' + id);
    if (s.statut === vers) return s;
    if (!TRANSITIONS[s.statut].includes(vers)) throw new Error('transition interdite : ' + s.statut + ' → ' + vers);
    if (vers === 'validee' && s.statut === 'en_recherche') throw new Error('validation uniquement par valider()');
    s.historique.push({ t, de: s.statut, vers, raison: raison || '' }); s.statut = vers; if (vers === 'suspendue') s.active = false; s.sceau = sceauDe(s); trace(t, id, 'statut', STATUTS[vers] + (raison ? ' : ' + raison : '')); return s;
  }
  /* preuve = { criteresVersion, criteresEmpreinte, horsEchantillon:{ok, lignes, stats, trades?, courbeR, mc, ic, dsr}, jeuFinal:{ok, lignes, stats}, nVariantesAvant, testsAvant:[…], avancement, attendu:{esperance, sigma, ddP95} } */
  function valider(id, preuve, t = Date.now()) {
    const s = trouver(id); if (!s) throw new Error('stratégie inconnue : ' + id);
    if (s.statut !== 'en_recherche') throw new Error('seule une stratégie en recherche peut être validée');
    if (!preuve || !preuve.horsEchantillon || preuve.horsEchantillon.ok !== true) throw new Error('validation refusée : critères hors échantillon non tous tenus');
    if (!preuve.jeuFinal || preuve.jeuFinal.ok !== true) throw new Error('validation refusée : jeu final non tenu');
    if (!(preuve.criteresVersion >= 2) && preuve.criteresVersion !== 1) throw new Error('validation refusée : version de critères inconnue');
    s.preuve = clone(preuve); s.historique.push({ t, de: 'en_recherche', vers: 'validee', raison: 'tous les critères tenus (version ' + preuve.criteresVersion + ')' }); s.statut = 'validee'; s.active = true; s.valideeLe = t; s.sceau = sceauDe(s);
    trace(t, id, 'validation', s.nom + ' · après ' + preuve.nVariantesAvant + ' variantes testées'); return s;
  }
  function rejeter(id, raison, preuve = null, t = Date.now()) {
    const s = trouver(id); if (!s) throw new Error('stratégie inconnue : ' + id);
    if (s.statut !== 'en_recherche') throw new Error('seule une stratégie en recherche peut être rejetée');
    if (preuve) s.preuve = clone(preuve); s.historique.push({ t, de: 'en_recherche', vers: 'rejetee', raison }); s.statut = 'rejetee'; s.active = false; s.sceau = sceauDe(s); trace(t, id, 'rejet', raison); return s;
  }
  const activer = (id, t = Date.now()) => { const s = trouver(id); if (!s) throw new Error('stratégie inconnue'); if (!['validee', 'confirmee', 'surveillance'].includes(s.statut)) throw new Error('seule une stratégie validée peut être activée'); s.active = true; trace(t, id, 'activation', ''); return s; };
  const desactiver = (id, t = Date.now()) => { const s = trouver(id); if (!s) throw new Error('stratégie inconnue'); s.active = false; trace(t, id, 'pause', ''); return s; };
  function suspendre(id, raison = 'suspendue manuellement', t = Date.now()) { const s = trouver(id); if (!s) throw new Error('stratégie inconnue'); if (['validee', 'confirmee', 'surveillance'].includes(s.statut)) return changerStatut(id, 'suspendue', raison, t); s.active = false; return s; }
  /* Réactivation manuelle d'une suspendue : revient « validée » (les trades en direct repartent de zéro pour la dérive). */
  function reactiver(id, t = Date.now()) { const s = trouver(id); if (!s || s.statut !== 'suspendue') throw new Error('seule une stratégie suspendue peut être réactivée'); s.live = { trades: [], depuis: t }; changerStatut(id, 'validee', 'réactivation manuelle ; suivi en direct repart de zéro', t); s.active = true; return s; }
  function supprimer(id, t = Date.now()) { const k = liste.findIndex(s => s.id === id); if (k < 0) return false; trace(t, id, 'suppression', liste[k].nom); liste.splice(k, 1); return true; }
  function dupliquer(id, t = Date.now()) {
    const s = trouver(id); if (!s) throw new Error('stratégie inconnue');
    const c = ajouter({ nom: s.nom + ' (copie)', famille: s.famille, params: s.params, regle: s.regle, description: s.description, t }); c.notes = 'Copie de ' + s.id + ' : la validation n’est PAS héritée, elle doit repasser tous les tests.'; c.sceau = sceauDe(c); return c;
  }
  /* Trades simulés en direct + réévaluation de la dérive. Rend { statut, raison, changement }. */
  function enregistrerTradeLive(id, trade, t = Date.now(), criteres = CRITERES2) {
    const s = trouver(id); if (!s || !s.preuve) return null; s.live.trades.push({ ...trade }); if (s.live.trades.length > 500) s.live.trades.shift();
    const d = prochainStatut(s.statut, s.live.trades, s.preuve.attendu || null, criteres);
    if (d.changement && TRANSITIONS[s.statut].includes(d.statut)) changerStatut(id, d.statut, d.raison, t);
    return d;
  }
  /* Fusion de stratégies produites par NOTRE PROPRE recherche (Worker de navigateur ou processus du Veilleur) : confiance interne, le sceau est recalculé. Rend le nombre ajouté. */
  function integrer(nouvelles) { let n = 0; for (const brute of nouvelles || []) { if (!brute || !brute.id || trouver(brute.id)) continue; const s = clone(brute); s.sceau = sceauDe(s); liste.push(s); n++; compteurId = Math.max(compteurId, liste.length); } return n; }
  function exporter(t = Date.now()) { return JSON.stringify({ format: 'rayle-bibliotheque-btc', version: VERSION_FICHIER, exporteLe: t, strategies: clone(liste), journal: clone(journal), compteurId }, null, 1); }
  /* Import : valide la forme ; recalcule le sceau ; un statut qui ne correspond pas au sceau est ramené à en_recherche (jamais de validation « de confiance »). Rend { ajoutees, degradees, ignorees }. */
  function importer(texte, t = Date.now()) {
    let o; try { o = JSON.parse(texte); } catch (e) { throw new Error('fichier illisible'); }
    if (!o || o.format !== 'rayle-bibliotheque-btc' || !Array.isArray(o.strategies)) throw new Error('ce n’est pas une bibliothèque Rayle');
    const res = { ajoutees: 0, degradees: 0, ignorees: 0 };
    for (const brute of o.strategies) {
      if (!brute || !brute.id || !brute.famille || !brute.params || trouver(brute.id)) { res.ignorees++; continue; }
      const s = clone(brute), sceauRecu = s.sceau;
      if (sceauRecu !== sceauDe(s) || (['validee', 'confirmee', 'surveillance', 'suspendue'].includes(s.statut) && !(s.preuve && s.preuve.horsEchantillon && s.preuve.horsEchantillon.ok && s.preuve.jeuFinal && s.preuve.jeuFinal.ok))) {
        s.statut = 'en_recherche'; s.active = false; s.preuve = null; s.historique.push({ t, de: null, vers: 'en_recherche', raison: 'import : preuve de validation non vérifiable, la stratégie doit repasser les tests' }); res.degradees++;
      }
      s.sceau = sceauDe(s); liste.push(s); res.ajoutees++;
    }
    compteurId = Math.max(compteurId, o.compteurId || 0, liste.length); trace(t, null, 'import', res.ajoutees + ' ajoutée(s), ' + res.degradees + ' dégradée(s)'); return res;
  }
  return { ajouter, integrer, valider, rejeter, changerStatut, activer, desactiver, suspendre, reactiver, supprimer, dupliquer, enregistrerTradeLive, exporter, importer, trouver,
    liste: () => liste, visibles: () => liste.filter(s => s.statut !== 'rejetee'), actives: () => liste.filter(s => s.active && ['validee', 'confirmee', 'surveillance'].includes(s.statut)), journal: () => journal,
    etat: () => ({ strategies: liste, journal, compteurId }) };
}
