/* Interprétation pure (sans dépendance) des phrases qui changent d'espace ou pilotent l'investissement : « ouvre l'investissement », « trading actif », « Rayle Capital », « étude de marché », « plan DCA », « intérêts composés », « mon portefeuille », « fiche de … ». */
export function interpreterEspace(texte) {
  const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(ouvre|affiche|va|passe)\b.*\b(investissement|trading actif|espace trading|capital)\b|\betude de marche\b|\bplan dca\b|\binterets composes\b|\bmon portefeuille\b|\bfiche (de|d|du) \w+/.test(n) && !/\bgolden\b|\ba plus\b/.test(n);
}
