// Éclipses : recherche de la prochaine éclipse de Soleil ou de Lune par la géométrie réelle Soleil–Terre–Lune (module pur, testé sous node).
// On cherche, heure par heure, un minimum de la séparation angulaire Lune–Soleil (éclipse de Soleil) ou Lune–anti-Soleil (éclipse de Lune).
// Une éclipse de Soleil exige une séparation < ~1,5° vue du centre de la Terre (totale ou annulaire sous ~0,9°) ; une éclipse de Lune, < ~1,5° (pénombre), < ~1° (partielle), < ~0,45° (totale).
// Précision : celle des éléments orbitaux de ui/astro.js (≈ 0,1° sur la Lune) : le jour est juste, l'heure à une demi-heure près environ.
// prochaineEclipse(A, ts0, jours, seul?) → { type:'soleil'|'lune', ts, sep, nature:'totale'|'annulaire'|'partielle'|'par la pénombre' } ou null
export function prochaineEclipse(A, ts0, jours = 800, seul) {
  const pas = 3600e3;
  const mesure = ts => { const s = A.soleilEq(ts), l = A.luneEq(ts), sep = A.separation(s, l); return { sep, anti: 180 - sep, dist: l.dist }; };
  let p = mesure(ts0), c = mesure(ts0 + pas);
  for (let ts = ts0 + 2 * pas; ts < ts0 + jours * 864e5; ts += pas) {
    const n = mesure(ts), t = ts - pas;
    if (c.sep < p.sep && c.sep <= n.sep && c.sep < 1.55 && (!seul || seul === 'soleil')) return { type: 'soleil', ts: t, sep: c.sep, nature: c.sep < .93 ? (c.dist < 60.3 ? 'totale' : 'annulaire') : 'partielle' };
    if (c.anti < p.anti && c.anti <= n.anti && c.anti < 1.6 && (!seul || seul === 'lune')) return { type: 'lune', ts: t, sep: c.anti, nature: c.anti < .45 ? 'totale' : c.anti < .98 ? 'partielle' : 'par la pénombre' };
    p = c; c = n;
  }
  return null;
}
// toutes les éclipses d'une période (pour tester contre les dates publiées)
export function eclipsesEntre(A, ts0, ts1) {
  const out = []; let t = ts0;
  while (t < ts1) { const e = prochaineEclipse(A, t, Math.ceil((ts1 - t) / 864e5)); if (!e || e.ts > ts1) break; out.push(e); t = e.ts + 5 * 864e5; }
  return out;
}
