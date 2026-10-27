/* ═════════════ DÉCOR DE LA GALAXIE ═════════════
   Les corps célestes (soleil, planètes, vaisseaux) sont décrits par leurs manifestes : planetes/<id>/manifeste.json
   (liste dans planetes/index.json, format dans galaxie/validateur.js). Ici ne reste que le décor commun.
   Textures : Solar System Scope (CC BY 4.0), voir galaxie/CREDITS.md. */
export const CEINTURE = { interieur: 57, exterieur: 66 };

/* Vitesses de base du système (1 = vitesse d'origine) : rotation des planètes sur elles-mêmes et révolution sur leur orbite.
   Réglage facile : modifier ces deux nombres, ou le curseur « Vitesse du système » du panneau ⚙ (qui multiplie les deux). */
export const VITESSES = { rotation: 0.5, orbite: 0.5 };
export const CIEL = { texture: 'galaxie/textures/8k_stars_milky_way.jpg' };
