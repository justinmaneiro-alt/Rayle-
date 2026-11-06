/* ═════════════ TEXTES DES ALERTES (Telegram et carte plein écran : mêmes champs) ═════════════
   « ▼ VENTE ETH · M15 / Quantité 8,169 ETH (≈ 18 491 $) / Entrée … Stop … Objectif … / R:R 1:2,2 · valable jusqu'à 17:45 / Pourquoi : une phrase » */
import { PAR_ID } from './actifs.js';
import { fmtPrix, fmtQte, fmtNombre, fmtUSD, fmtR, heureParis } from './format.js';

export const fleche = sens => (sens === 'achat' ? '▲ HAUSSIER (simulé)' : '▼ BAISSIER (simulé)');
/* catégorie : « GRANDE » ou « normale » (les anciens trades sans catégorie sont normaux) */
export const categorie = tr => (tr && tr.categorie === 'grande' ? 'grande' : 'normale');
export const badgeCategorie = tr => (categorie(tr) === 'grande' ? 'GRANDE' : 'normale');
export const ligneRisque = tr => `Risque ${fmtUSD(tr.risqueUSD, 2)} (${fmtNombre(tr.risquePct != null ? tr.risquePct : 0.5, 1)} % du capital réalisé)`;

export function lignesTrade(tr) {
  const a = PAR_ID[tr.actif] || { unite: tr.actif };
  const px = tr.prixEntree != null ? tr.prixEntree : tr.entree;
  return [
    `${fleche(tr.sens)} ${tr.actif} · M15${categorie(tr) === 'grande' ? ' · GRANDE' : ''}`,
    `Quantité ${fmtQte(tr.actif, tr.quantite)} ${a.unite} (≈ ${fmtNombre(px * tr.quantite, 0)} $)`,
    `Entrée ${fmtPrix(tr.actif, tr.entree)} · Stop ${fmtPrix(tr.actif, tr.stop)} · Objectif ${fmtPrix(tr.actif, tr.objectif)}`
  ];
}

export function messageAlerte(type, tr) {
  const l = lignesTrade(tr);
  if (type === 'proposition') {
    l.push(`R:R 1:${fmtNombre(tr.rr, 1)} · valable jusqu’à ${heureParis(tr.validJusqu)}`);
    l.push(`Pourquoi : ${tr.pourquoi || '—'}`);
    if (tr.risqueUSD != null) l.push(ligneRisque(tr));
    l.unshift(categorie(tr) === 'grande' ? `NOUVELLE GRANDE POSITION · risque ${fmtUSD(tr.risqueUSD, 0)} (simulation)` : 'NOUVELLE POSITION (simulation)');
  } else if (type === 'entree') {
    l.unshift(`ENTRÉE TOUCHÉE${categorie(tr) === 'grande' ? ' · GRANDE' : ''} à ${heureParis(tr.tEntree, true)} (simulation)`);
    l.push(`Prix obtenu ${fmtPrix(tr.actif, tr.prixEntree)} · risque ${fmtUSD(tr.risqueUSD, 0)}`);
  } else if (type === 'sortie') {
    l.unshift(`SORTIE${categorie(tr) === 'grande' ? ' GRANDE' : ''} (${tr.raison === 'objectif' ? 'objectif atteint' : tr.raison === 'stop' ? 'stop touché' : tr.raison}) à ${heureParis(tr.tSortie, true)} (simulation)`);
    l.push(`Prix de sortie ${fmtPrix(tr.actif, tr.prixSortie)}`);
    l.push(`Résultat réel : ${fmtR(tr.r)} · ${fmtUSD(tr.pnl, 2, true)} (frais et glissement inclus)`);
  } else if (type === 'expiree') {
    l.unshift('PROPOSITION EXPIRÉE : entrée jamais touchée (simulation)');
  }
  return l.join('\n');
}
