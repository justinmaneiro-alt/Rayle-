/* ═════════════ NOMS DES NIVEAUX EN FRANÇAIS CLAIR (pur, testé) ═════════════
   Les niveaux du moteur (règles figées zones-or-v1 : veille, semaine, séances, ronds) gardent leurs noms courts en interne ; à l'écran,
   dans la lecture du graphique et la liste des zones, ils s'écrivent en toutes lettres. Les supports, résistances et la liquidité DESSINÉS
   sur le graphique viennent maintenant de la période affichée : niveaux-periode.js (la sélection « repères » d'avant est remplacée). */
const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
export function nomClair(nom) {
  const m = String(nom || '').match(/^(Veille|Semaine|Asie|Londres|New York) (haut|bas)$/);
  if (m) return `plus ${m[2]} ${{ Veille: 'de la veille', Semaine: 'de la semaine dernière', Asie: 'de la séance asiatique', Londres: 'de la séance de Londres', 'New York': 'de la séance de New York' }[m[1]]}`;
  const r = String(nom || '').match(/^Rond (\d+)$/); if (r) return `niveau rond ${nb(+r[1])}`;
  return String(nom || '').toLowerCase();
}
