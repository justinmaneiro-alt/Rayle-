/* Interprétation pure (sans dépendance au DOM) des phrases qui changent d'onglet, d'instrument ou lisent une page du Terminal :
   « ouvre l'investissement », « Rayle Capital », « étude de marché », « plan DCA », « intérêts composés », « mon portefeuille », « fiche de … »,
   « ouvre le COT / la santé du marché / les institutions / le calendrier / le journal / les actualités », « explique le COT »,
   « où en est la santé du marché », « qu'ont dit les banques cette semaine », « qu'est-ce qui change pour l'or », « passe sur le bitcoin ». */
import { instrumentDepuisTexte } from './or/instruments.js';
const PAGES = 'actualites?|cot|sante du marche|sante des marches|institutions?|calendrier|journal|graphique';
export function interpreterEspace(texte) {
  const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\bgolden\b|\ba plus\b/.test(n)) return false;
  if (/\b(ouvre|affiche|va|passe)\b.*\b(investissement|trading actif|espace trading|capital)\b|\betude de marche\b|\bplan dca\b|\binterets composes\b|\bmon portefeuille\b|\bfiche (de|d|du) \w+/.test(n)) return true;
  if (new RegExp(`\\b(ouvre|affiche|montre|va|passe)\\b.*\\b(${PAGES})\\b`).test(n) && !/\b(journal de trades|mon journal de bord)\b/.test(n)) return true;
  if (/\b(explique|expliquer|resume|lis)\b.*\bcot\b|\bcot\b.*\b(explique|c est quoi)\b/.test(n)) return true;
  if (/\bsante (du|des) marches?\b/.test(n)) return true;
  if (/\bbanques?\b/.test(n) && /\b(dit|disent|prevoient|prevision|previsions|annonce|objectif)\b/.test(n)) return true;
  if (/\b(ce )?qu est ce qui change pour l or\b|\bce qui change pour l or\b/.test(n)) return true;
  if (/\b(passe|bascule|mets?|met|charge)\b.*\b(sur|le|la|l)\b/.test(n) && instrumentDepuisTexte(n) && !/\b(musique|morceau|playlist|son|volume|pause)\b/.test(n)) return true;
  return false;
}
