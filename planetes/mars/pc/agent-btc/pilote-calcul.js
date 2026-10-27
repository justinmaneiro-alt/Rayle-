import { creerBibliotheque } from './bibliotheque.js';
import { trancher } from './recherche-continue.js';
import './familles-m5.js';

/* ═════════════ CALCUL D'UNE TRANCHE DE RECHERCHE (M5 ; module pur, exécuté dans un Worker de navigateur, le processus du Veilleur ou en direct dans les tests) ═════════════
   Sans état : tout ce qu'il faut arrive dans `charge`, tout ce qui change repart dans le résultat. L'hôte (pilote-coeur.js) prépare la charge et intègre le résultat : ainsi la page peut
   continuer à utiliser et modifier le pilote pendant que le Worker calcule, sans jamais partager d'objet. Les nouvelles stratégies produites reviennent complètes (preuve incluse). */
export async function executerTranche(charge, { m15, cede = () => Promise.resolve(), arret = () => false, surEvenement = () => {} } = {}) {
  const bib = creerBibliotheque(charge.bibliotheque), avant = new Set(bib.liste().map(s => s.id)), evts = [];
  const etat = charge.recherche, coffre = JSON.parse(JSON.stringify(charge.coffre || { ouverts: [] }));
  const r = await trancher(etat, { m15, config: charge.config, bibliotheque: bib, coffre, criteres: charge.criteres, profil: charge.profil, derivBrut: charge.derivBrut || null, maintenant: () => Date.now(), budget: charge.budget, sansJeuFinal: !!charge.sansJeuFinal, cede, arret,
    surEvenement: e => { if (evts.length < 400) evts.push(e); surEvenement(e); } });
  return { recRev: charge.recRev, recherche: etat, coffre: r.coffre || coffre, nouvelles: bib.liste().filter(s => !avant.has(s.id)), evenements: evts, stop: r.stop, raison: r.raison || null };
}
