/* Mise en mots naturels : le point est d'abord écrit par le code (déterministe, chiffres vérifiés) ; si l'IA de Rayle est joignable, elle le REFORMULE à l'oral, puis chaque nombre de sa version est revérifié
   (trader-pro/point/faits.js). Un seul chiffre inventé, un ordre, une réponse vide ou trop longue : on garde la version du code. Pur (l'IA est injectée), testé. */
import { verifierTexte, nombresDuTexte } from './faits.js';
export const CONSIGNE = 'Réécris ce point de marché pour qu’il soit dit à voix haute, en français parlé, naturel et chaleureux, comme une analyste qui explique à Justin ce qui s’est passé. Règles STRICTES : garde exactement les mêmes chiffres et niveaux (n’en ajoute AUCUN, n’en change aucun) ; garde toutes les prudences (« plutôt », « envisageable », « signal moyen »…) ; pas de liste, pas de titre ; aucun ordre ni « vas-y » ou « n’y va pas » ; environ la même longueur.';
const ORDRES = /\b(vas-y|n.y va pas|achète|achetez|vends|vendez|je te conseille d.(acheter|vendre)|entre en position|ouvre une position|prends une position)\b/i;
export async function polir(texte, faits, { demanderIA, maxRatio = 1.25, minRatio = 0.6 } = {}) {
  if (typeof demanderIA !== 'function') return { texte, source: 'regles', raison: 'IA non configurée' };
  let r; try { r = await demanderIA(`${CONSIGNE}\n\nTexte à reformuler :\n${texte}`, { contexte: 'Reformulation à l’oral d’un point de marché. Aucun chiffre nouveau.' }); } catch (e) { return { texte, source: 'regles', raison: 'IA indisponible : ' + String(e && e.message || e).slice(0, 80) }; }
  const t = r && typeof r.texte === 'string' ? r.texte.replace(/\s+/g, ' ').trim() : ''; if (!t) return { texte, source: 'regles', raison: 'réponse vide' };
  if (t.length > texte.length * maxRatio || t.length < texte.length * minRatio) return { texte, source: 'regles', raison: 'longueur inattendue' };
  if (ORDRES.test(t)) return { texte, source: 'regles', raison: 'ordre détecté' };
  const V = verifierTexte(t, faits); if (!V.ok) return { texte, source: 'regles', raison: `chiffre introuvable dans la fiche : ${V.inconnus.slice(0, 2).map(x => x.nombre).join(', ')}`, rejete: t };
  const gardes = nombresDuTexte(texte).filter(n => n.strict), dits = new Set(nombresDuTexte(t).filter(n => n.strict).map(n => n.valeur));
  if (gardes.length && gardes.filter(n => dits.has(n.valeur)).length < gardes.length * 0.6) return { texte, source: 'regles', raison: 'trop de chiffres supprimés' };
  return { texte: t, source: 'ia', raison: null };
}
