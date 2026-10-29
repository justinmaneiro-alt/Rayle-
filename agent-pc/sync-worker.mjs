// Client du Worker de Raylé pour l'agent : battement (« le PC est vivant »), synchronisation de l'état, commandes. Le jeton (X-Rayle-Token) n'est jamais journalisé.
// Sans Worker configuré ou injoignable : le service continue en local (rien ne plante, le statut le dit).
export function creerSync({ config, fetchImpl = globalThis.fetch, delai = 20000 } = {}) {
  const base = config && config.url ? String(config.url).replace(/\/+$/, '') : null;
  /* Retrait progressif : après une erreur du Worker (429, 5xx, réseau, limite du jour), on n'insiste pas : pause de 1 min, puis 2, 4… jusqu'à 30 min ; un succès remet tout à zéro. */
  let attente = 0, reprise = 0;
  async function appel(methode, chemin, corps) {
    if (!base) throw new Error('Worker non configuré');
    if (Date.now() < reprise) throw new Error('Worker en pause (limité ou injoignable), nouvel essai dans ' + Math.ceil((reprise - Date.now()) / 60e3) + ' min');
    let r;
    try { r = await fetchImpl(base + chemin, { method: methode, headers: { 'X-Rayle-Token': config.jeton, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(delai) }); }
    catch (e) { attente = Math.min(Math.max(attente * 2, 60e3), 30 * 60e3); reprise = Date.now() + attente; throw e; }
    if (!r.ok) {
      if (r.status === 429 || r.status >= 500) { attente = Math.min(Math.max(attente * 2, r.status === 503 ? 5 * 60e3 : 60e3), 30 * 60e3); reprise = Date.now() + attente; }
      let msg = ''; if (r.status === 503) { try { const j = await r.json(); if (j && j.limite) msg = ' : ' + j.error; } catch (e) { /* pas de détail */ } }
      throw new Error('HTTP ' + r.status + ' sur ' + chemin + msg);
    }
    attente = 0; reprise = 0;
    return r.json();
  }
  return {
    configure: !!base,
    battement: info => appel('POST', '/agent/battement', info),                      // → { commandes: [...] }
    synchroniser: (etat, suivi, pausesLevees = {}, forcer = false) => appel('POST', '/agent/sync', { etat, suivi, pausesLevees, forcer }),   // → { regles, suiviWorker }
    etat: () => appel('GET', '/agent/etat'),
    commandesTraitees: ids => appel('POST', '/agent/commandes/traitees', { ids }),
    telegram: (texte, type) => appel('POST', '/telegram/envoyer', { texte, type })
  };
}
/* État allégé envoyé au Worker : listes plafonnées (D1 garde l'historique en ajoutant sans écraser). */
export function etatPourWorker(etat) {
  return { ...etat, journal: etat.journal.slice(-200), backtests: etat.backtests.slice(-80), alertes: etat.alertes.slice(-150), tradesSimules: (etat.tradesSimules || []).slice(-300) };
}
