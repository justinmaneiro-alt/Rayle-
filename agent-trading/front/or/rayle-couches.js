/* Couches de la stratégie Rayle v1 (STRATEGIE-RAYLE.md) : libellés et valeurs par défaut, séparés du reste pour que le graphique les importe sans tirer l'interface. */
export const COUCHES_RAYLE = Object.freeze({
  rayMa: 'Rayle · moyenne mobile 200 et ses événements (cassure, fausse cassure, rebond)',
  rayBoites: 'Rayle · boîtes de retournement et ligne de retournement',
  rayScenarios: 'Rayle · scénarios dessinés (cône, trajets A et B)'
});
export const COUCHES_RAYLE_DEFAUT = Object.freeze({ rayMa: true, rayBoites: true, rayScenarios: false });
