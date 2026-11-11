/* Interprétation (pure, sans aucune dépendance) des phrases de la stratégie Rayle v1 : moyenne mobile, carnet, feuille de décision, scénarios. Renvoie { sujet, lettre } ou null. */
export function interpreterStrategie(texte) {
  const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ').replace(/\s+/g, ' ').trim();
  const M = re => re.test(n);
  if (M(/\bexplique( moi)? (le )?scenario\b/)) { const l = n.match(/scenario ([ab])\b/); return { sujet: 'explique', lettre: l ? l[1].toUpperCase() : 'A' }; }
  if (M(/\bscenarios?\b/) && M(/\b(montre|affiche|dessine|donne|quels sont|quel est|ou en sont)\b|\bles scenarios\b/)) return { sujet: 'scenarios' };
  if (M(/\bfeuille de decision\b|\bconditions reunies\b/)) return { sujet: 'feuille' };
  if (M(/\b(que )?lit le carnet\b|\blecture du carnet\b|\bcarnet (ici|a l arrivee)\b|\bque dit le carnet\b/)) return { sujet: 'carnet' };
  if (M(/\bmoyenne mobile\b|\bma 200\b|\bsma 200\b|\bma200\b/) && !M(/\b(explique|c est quoi|qu est ce que)\b/)) return { sujet: 'ma' };
  return null;
}
