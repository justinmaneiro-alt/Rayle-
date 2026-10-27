import { creerVaisseau } from './vaisseau-3d.js';

/* Dans la vue d'ensemble de la galaxie, la silhouette provisoire du vaisseau d'anatomie (cylindre et tore) est remplacée par le vrai modèle, en détail réduit
   (le niveau élevé est réservé à la visite du vaisseau). Le modèle est attaché au même point d'orbite que l'ancien ; celui-ci est seulement masqué, il reste
   en secours si le remplacement échoue. */
export function remplacer(g) {
  const cfg = g.registre.planetes.find(p => p.id === 'saturne'), o = g.systeme.parId('saturne');
  if (!cfg || !o || !cfg.satellites) return null;
  const i = cfg.satellites.findIndex(s => s.id === 'vaisseau-anatomie'); if (i < 0) return null;
  const hote = o.satellites[i].vaisseau, niveau = g.info().qualite === 'basse' ? 0 : 1;
  const v = creerVaisseau({ detail: niveau, graine: 11 });
  v.groupe.rotation.y = -Math.PI / 2;                // le nez (−Z du modèle) suit la trajectoire, comme la proue de l'ancienne silhouette
  for (const c of hote.children) c.visible = false;
  hote.add(v.groupe);
  const lie = { vaisseau: v, hote };
  g.vaisseauGalaxie = lie;
  let t = 0; const maj = () => { if (g.enMarche()) { t += 0.016; v.maj(0.016, t, 0.06, { anneauVitesse: 0.1 }); } requestAnimationFrame(maj); };
  requestAnimationFrame(maj);
  return lie;
}
