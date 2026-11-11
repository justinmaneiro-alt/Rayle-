/* Couches de la stratégie Rayle v1 (STRATEGIE-RAYLE.md) : libellés et valeurs par défaut, séparés du reste pour que le graphique les importe sans tirer l'interface. */
export const COUCHES_RAYLE = Object.freeze({
  rayMa: 'Rayle · moyenne mobile 200 et ses événements (cassure, fausse cassure, rebond)',
  rayBoites: 'Rayle · boîtes de retournement et ligne de retournement',
  rayNiveaux: 'Rayle · niveaux majeurs (veille, semaine, mois, profils, nombres ronds) : 3 au-dessus, 3 en dessous',
  rayGolden: 'Rayle · golden zone (61,8 % à 78,6 % du dernier élan)',
  rayScenarios: 'Rayle · scénarios dessinés (cône, trajets A et B)'
});
export const COUCHES_RAYLE_DEFAUT = Object.freeze({ rayMa: true, rayBoites: true, rayGolden: true, rayNiveaux: false, rayScenarios: false });
