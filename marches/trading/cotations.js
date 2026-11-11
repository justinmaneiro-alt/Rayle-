import { INSTRUMENTS, WATCHLIST } from './instruments.js';
import { dernieresClotures, variationJour } from './serie.js';

/* Cotations de la watchlist : dernier prix (dernière bougie M15, repli sur le journalier) contre la clôture de la veille (journalier). Sert à la watchlist de l'espace de travail
   ET à la fenêtre « Marché » de la table : mêmes chiffres, même source, mêmes heures. Rien n'est inventé : une ligne sans donnée reste vide avec sa raison. */
export async function lireCotations(client, ids = WATCHLIST) {
  return Promise.all(ids.map(async id => {
    const ins = INSTRUMENTS[id];
    try {
      const m15 = await client.serie(id, 'M15', { rafraichirMs: ins.quota ? 300e3 : 120e3 }), d1 = await client.serie(id, 'D1', { rafraichirMs: ins.quota ? 600e3 : 300e3 });   // l'or passe par Twelve Data (≈ 750 requêtes par jour, partagées avec les alertes de prix) : on le ménage
      const source = m15.bougies.length ? m15 : d1.bougies.length ? d1 : null;
      if (!source) return { id, nom: ins.court, vide: true, erreur: m15.erreur || d1.erreur || 'aucune donnée' };
      const dernier = source.bougies[source.bougies.length - 1], v = variationJour(d1.bougies, dernier.c);
      return { id, nom: ins.court, longNom: ins.nom, decimales: ins.decimales, unite: ins.unite || '', prix: dernier.c, t: dernier.t, pct: v ? v.pct : null, variation: v ? v.variation : null, veille: v ? v.veille : null,
        courbe: dernieresClotures(source.bougies, 40), source: source.meta ? source.meta.source : null, differe: !!(source.meta && source.meta.differe), perime: !!(source.meta && source.meta.perime), secours: !!(source.meta && source.meta.secours), recuLe: source.meta ? source.meta.recuLe : null, erreur: source.erreur };
    } catch (e) { return { id, nom: ins.court, vide: true, erreur: String(e && e.message || e) }; }
  }));
}
