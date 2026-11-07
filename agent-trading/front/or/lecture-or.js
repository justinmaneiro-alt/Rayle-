/* ═════════════ LECTURE DU GRAPHIQUE EN FRANÇAIS SIMPLE (pur, testé) ═════════════
   Phrases courtes, parlables (pas de markdown, pas d'émoji). Jamais d'ordre d'achat ou de vente : des constats. */
import { nomClair } from './reperes-or.js';
import { texteHistorique } from './zones-or.js';

const nb = p => Math.round(p).toLocaleString('fr-FR').replace(/ | /g, ' ');
export const NOM_COTE = { support: 'un support', resistance: 'une résistance' };
const nomZone = z => (z.vol && z.cles.length ? 'zone de volume et niveau clé' : z.vol ? 'zone de volume' : (z.noms[0] ? nomClair(z.noms[0]) : 'niveau'));   // « plus bas de la séance de Londres », jamais « londres bas »

/* une zone et son état : « on est sur un support à 4 085, testé 6 fois, a tenu 4 » */
export function phraseZone(z, etat) {
  const ou = etat === 'sur' ? 'on est sur' : etat === 'approche' ? 'on approche' : 'le plus proche est';
  const de = etat === 'approche' ? (z.cote === 'support' ? 'd’un support' : 'd’une résistance') : NOM_COTE[z.cote];
  return `${ou} ${de} à ${nb(z.p)} (${nomZone(z)}), ${texteHistorique(z).replace('testée', z.cote === 'support' ? 'testé' : 'testée')}`;
}
export function phraseEvenement(ev, z) {
  if (ev.type === 'rejet') return `Rejet sur ${z.cote === 'support' ? 'le support' : 'la résistance'} à ${nb(z.p)}, le delta se retourne. Information de marché, pas un signal.`;
  if (ev.type === 'cassure') return `Cassure ${ev.sens === 'hausse' ? 'au-dessus de la résistance' : 'sous le support'} à ${nb(z.p)}, avec du volume. Information de marché, pas un signal.`;
  if (ev.type === 'approche') return `On approche ${z.cote === 'support' ? 'd’un support' : 'd’une résistance'} à ${nb(z.p)}, ${texteHistorique(z)}.`;
  if (ev.type === 'sur') return `${z.cote === 'support' ? 'Sur le support' : 'Sur la résistance'} à ${nb(z.p)}, ${texteHistorique(z)}.`;
  return '';
}
/* panneau « Lecture du graphique » : biais H1, zone la plus proche au-dessus et au-dessous, état courant */
export function lecture({ prix, zones, biais, etats, marche, fiable = true }) {
  if (!(prix > 0)) return { biais: 'inconnu', dessus: null, dessous: null, etat: 'Pas de prix pour le moment.', phrase: 'Je n’ai pas encore de prix de l’or.' };
  const dessus = zones.filter(z => z.bas > prix).sort((a, b) => a.bas - b.bas)[0] || null;
  const dessous = zones.filter(z => z.haut < prix).sort((a, b) => b.haut - a.haut)[0] || null;
  const dedans = zones.find(z => z.bas <= prix && z.haut >= prix) || null;
  const proche = dedans || zones.slice().sort((a, b) => a.dist - b.dist)[0] || null;
  const e = proche ? (dedans ? 'sur' : etats[proche.id] || 'loin') : null;
  const B = { haussier: 'haussier', baissier: 'baissier', neutre: 'neutre', inconnu: 'inconnu' }[biais.biais] || 'inconnu';
  let etat = proche ? phraseZone(proche, e) : 'aucune zone proche';
  etat = etat.charAt(0).toUpperCase() + etat.slice(1) + '.';
  const morceaux = [`L’or est à ${nb(prix)}.`, `Biais H1 ${B}.`, etat];
  if (!marche.ouvert) morceaux.push(marche.raison === 'week-end' ? 'Le marché de l’or est fermé, le perpétuel bouge peu.' : 'Pause quotidienne du marché.');
  if (!fiable) morceaux.push('Données peu fiables en ce moment.');
  return { biais: B, dessus, dessous, proche, etatCode: e, etat, phrase: morceaux.join(' ') };
}
