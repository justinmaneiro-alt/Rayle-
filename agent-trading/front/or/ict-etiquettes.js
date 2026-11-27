/* Placement des étiquettes du dessin ICT (pur, testé) : aucune étiquette ne chevauche une autre ni une zone interdite (dernières bougies, badge…).
   Chaque étiquette est un rectangle { id, x, y, w, h, prio } à la place voulue ; on essaie des décalages verticaux de plus en plus grands (dessous, dessus, dessous…) ;
   si vraiment rien n'est libre, l'étiquette est « repliée » : son contenu reste dans l'infobulle. Les étiquettes de priorité haute sont placées en premier. */
const chevauche = (a, b, marge = 1) => a.x < b.x + b.w + marge && b.x < a.x + a.w + marge && a.y < b.y + b.h + marge && b.y < a.y + a.h + marge;
export function placerEtiquettes(items, { largeur = 1e9, hauteur = 1e9, interdits = [], essais = 8, marge = 1 } = {}) {
  const ordre = items.map((it, k) => ({ it, k })).sort((a, b) => (b.it.prio || 0) - (a.it.prio || 0) || a.it.y - b.it.y || a.k - b.k), poses = [], res = new Array(items.length);
  for (const { it, k } of ordre) {
    const x = Math.max(0, Math.min(largeur - it.w, it.x)); let place = null;
    for (let s = 0; s <= essais * 2 && !place; s++) {
      const dec = s === 0 ? 0 : (s % 2 ? 1 : -1) * Math.ceil(s / 2) * (it.h + 2), y = it.y + dec; if (y < 0 || y + it.h > hauteur) continue;
      const r = { x, y, w: it.w, h: it.h }; if (!poses.some(p => chevauche(r, p, marge)) && !interdits.some(p => chevauche(r, p, 0))) place = r;
    }
    if (place) { poses.push(place); res[k] = { id: it.id, x: place.x, y: place.y, replie: false }; } else res[k] = { id: it.id, x, y: it.y, replie: true };
  }
  return res;
}
/* taille de texte selon l'écran : 13 px PC, 12 px tablette, 11 px téléphone, jamais moins */
export const taillePolice = largeurEcran => (largeurEcran >= 1100 ? 13 : largeurEcran >= 700 ? 12 : 11);
