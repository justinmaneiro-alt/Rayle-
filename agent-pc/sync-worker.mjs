// Client du Worker de Raylé pour l'agent : battement (« le PC est vivant »), synchronisation de l'état, commandes. Le jeton (X-Rayle-Token) n'est jamais journalisé.
// Sans Worker configuré ou injoignable : le service continue en local (rien ne plante, le statut le dit).
export function creerSync({ config, fetchImpl = globalThis.fetch, delai = 20000 } = {}) {
  const base = config && config.url ? String(config.url).replace(/\/+$/, '') : null;
  async function appel(methode, chemin, corps) {
    if (!base) throw new Error('Worker non configuré');
    const r = await fetchImpl(base + chemin, { method: methode, headers: { 'X-Rayle-Token': config.jeton, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined, signal: AbortSignal.timeout(delai) });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' sur ' + chemin);
    return r.json();
  }
  return {
    configure: !!base,
    battement: info => appel('POST', '/agent/battement', info),                      // → { commandes: [...] }
    synchroniser: (etat, suivi, pausesLevees = {}) => appel('POST', '/agent/sync', { etat, suivi, pausesLevees }),   // → { regles, suiviWorker }
    etat: () => appel('GET', '/agent/etat'),
    commandesTraitees: ids => appel('POST', '/agent/commandes/traitees', { ids }),
    telegram: (texte, type) => appel('POST', '/telegram/envoyer', { texte, type })
  };
}
/* État allégé envoyé au Worker : listes plafonnées (D1 garde l'historique en ajoutant sans écraser). */
export function etatPourWorker(etat) {
  return { ...etat, journal: etat.journal.slice(-200), backtests: etat.backtests.slice(-80), alertes: etat.alertes.slice(-150), tradesSimules: (etat.tradesSimules || []).slice(-300) };
}
