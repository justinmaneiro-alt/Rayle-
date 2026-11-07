/* ═════════════ COMMANDES EN FRANÇAIS (texte ou voix) DU TABLEAU DE BORD, DU LECTEUR DE MUSIQUE ET DU MODE TÉLÉ (pur, testé) ═════════════ */
export function normaliser(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^(hey |dis moi |dis |ok )?(rayle|raylee|raille|rael|ray le|ray)\b ?/, '').trim();
}
const M = (n, re) => re.test(n);
export function interpreter(texte) {
  const n = normaliser(texte); if (!n) return { type: null };
  // lecture du graphique
  if (M(n, /\bon en est ou\b|\bou en est (l or|on)\b|\bque fait l or\b|\blecture du graphique\b|\bfais le point\b|\bpoint sur l or\b/)) return { type: 'lecture' };
  // musique : lancer
  if (M(n, /\b(lance|mets|met|joue|demarre)\b.*\b(ma |la )?(playlist|liste)( fixe)?\b/) && !M(n, /\bmix\b/)) return { type: 'musique', cmd: 'playlist' };
  if (M(n, /\b(joue|lance|mets|met)\b.*\bmix\b/)) return { type: 'musique', cmd: 'mix' };
  if (M(n, /\b(mets|met|lance|joue)\b.*\b(ma |de la |la )?musique\b|\bmusique s il te plait\b/)) return { type: 'musique', cmd: 'playlist' };
  if (M(n, /\b(garde|ajoute|enregistre)\b.*\b(ce |le )?(morceau|titre|son|chanson)\b/)) return { type: 'musique', cmd: 'garder' };
  if (M(n, /\b(retire|enleve|supprime)\b.*\b(ce |le )?(morceau|titre|son|chanson)\b/)) return { type: 'musique', cmd: 'retirer' };
  if (M(n, /\bcombien\b.*\b(morceaux|titres|chansons)\b/)) return { type: 'musique', cmd: 'combien' };
  if (M(n, /\b(quel|c est quoi|qu est ce que c est)\b.*\b(morceau|titre|chanson|musique)\b/)) return { type: 'musique', cmd: 'quoi' };
  if (M(n, /\b(arrete|stoppe|coupe|eteins)\b.*\bmusique\b|^stop( la musique)?$/)) return { type: 'musique', cmd: 'stop' };
  if (M(n, /\b(coupe|enleve) le son\b|^muet$|\bmode muet\b/)) return { type: 'musique', cmd: 'muet' };
  if (M(n, /\b(remets|reactive|rallume) le son\b/)) return { type: 'musique', cmd: 'muet', v: 0 };
  if (M(n, /^(pause|mets en pause|met en pause)$|\bpause (la )?musique\b/)) return { type: 'musique', cmd: 'pause' };
  if (M(n, /^(reprends?|reprendre|continue|play|lecture)$|\breprends? la musique\b/)) return { type: 'musique', cmd: 'reprendre' };
  if (M(n, /\b(suivant|morceau suivant|chanson suivante|passe|next)\b/)) return { type: 'musique', cmd: 'suivant' };
  if (M(n, /\b(precedent|morceau precedent|chanson precedente|reviens)\b/)) return { type: 'musique', cmd: 'precedent' };
  if (M(n, /\b(monte|augmente|plus fort)\b.*\b(son|volume)?\b|\bvolume plus\b|^plus fort$/)) return { type: 'musique', cmd: 'volume_plus' };
  if (M(n, /\b(baisse|diminue|moins fort)\b|\bvolume moins\b/)) return { type: 'musique', cmd: 'volume_moins' };
  if (M(n, /\b(melange|aleatoire|shuffle)\b/)) return { type: 'musique', cmd: 'melange' };
  // vues (mode télé)
  if (M(n, /\b(affiche|montre|mets)\b.*\b(l or|le graphique|l or)\b/)) return { type: 'vue', vue: 'or' };
  if (M(n, /\b(affiche|montre|mets)\b.*\bterre\b/)) return { type: 'vue', vue: 'terre' };
  return { type: null };
}
