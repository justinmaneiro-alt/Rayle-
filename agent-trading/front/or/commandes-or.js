/* ═════════════ COMMANDES EN FRANÇAIS (texte ou voix) DU TABLEAU DE BORD, DU LECTEUR DE MUSIQUE ET DU MODE TÉLÉ (pur, testé) ═════════════ */
import { interpreterStrategie } from './rayle-voix-interp.js';
import { interpreterEspace } from '../espaces-voix.js';
export function normaliser(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ?]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^(hey |dis moi |dis |ok )?(rayle|raylee|raille|rael|ray le|ray)\b ?/, '').trim();
}
const M = (n, re) => re.test(n);
/* global : la phrase vient de n'importe quel écran de Rayle (pas seulement de la page de l'or). Les commandes courtes et ambiguës
   (« pause », « suivant », « plus fort », « mélange »…) ne sont prises que si une musique est en cours (musiqueActive) ; sinon elles
   restent aux autres écrans (« image suivante », « pause les gestes »…). */
const TRANSPORT = new Set(['pause', 'reprendre', 'suivant', 'precedent', 'volume_plus', 'volume_moins', 'muet', 'melange', 'stop']);
export function interpreter(texte, { global = false, musiqueActive = false } = {}) {
  const c = interpreterBrut(texte);
  if (global && c.type === 'musique' && TRANSPORT.has(c.cmd) && !musiqueActive && !/\b(musique|playlist|morceau|chanson|titre|son|volume)\b/.test(normaliser(texte))) return { type: null };
  if (global && c.type === 'vue') return { type: null };   // « affiche l'or / la Terre » : seulement pour le mode télé ou la page de l'or
  return c;
}
function interpreterBrut(texte) {
  const n = normaliser(texte); if (!n) return { type: null };
  // fenêtres indépendantes de Rayle
  if (M(n, /\b(ouvre|affiche|montre)\b.*\b(le lecteur de musique|la musique|la fenetre musique|ma musique)\b/)) return { type: 'fenetre', quoi: 'musique' };
  if (M(n, /\b(ouvre|affiche|montre)\b.*\b(la tele|le mode tele|la telecommande|la fenetre tele)\b/)) return { type: 'fenetre', quoi: 'tele' };
  // « pourquoi l'or bouge ? » et fiches « comment lire ça »
  if (M(n, /pourquoi l or (bouge|monte|baisse|chute|recule|grimpe|s envole|decroche|stagne)|qu est ce qui fait (bouger|monter|baisser) l or|explique (moi )?(le mouvement|la hausse|la baisse) de l or/)) return { type: 'pourquoi' };
  if (M(n, /\b(explique|expliquer|c est quoi|qu est ce que|a quoi sert|comment lire|comment on lit|comment lis)\b/) && M(n, /vwap|profil de volume|\bpoc\b|zone de valeur|\bcvd\b|delta|plus haut.*(veille|semaine)|plus bas.*(veille|semaine)|ouverture du jour|ouverture de la semaine|seance|session|asie|londres|new york|balayage|niveaux? ronds?|prix ronds?|liquidite|carte thermique|heatmap|mouvements? h1|positions? de rayle|trades? simules?|propositions?|ce qui fait bouger|facteurs|structure|rebond ou retournement|changement de caractere|impulsion|retournements?|divergences?|\brsi\b|schemas? de retournement|double sommet|double creux|tete et epaules|\bict\b|killzones?|silver bullet|order blocks?|breakers?|\bfvg\b|premium|discount|\bote\b|judas|\bamd\b/)) return { type: 'outil' };
  if (M(n, /\bpropositions?( h1| de rayle)?\b|\bqu est ce que (tu )?propose\b|\bles setups\b/) && !M(n, /\b(explique|c est quoi|qu est ce que c est)\b/)) return { type: 'propositions' };
  if (M(n, /\banalyse ict\b|\bict de la semaine\b|\brapport ict\b|\b(efface|masque|ferme) l analyse ict\b/)) return { type: 'ict' };
  if (interpreterEspace(texte)) return { type: 'espace' };
  if (interpreterStrategie(texte)) return { type: 'strategie' };   // moyenne mobile, carnet à l'arrivée sur une boîte, feuille de décision, scénarios (stratégie Rayle v1)
  if (M(n, /\b(y a t il|il y a|vois tu|detecte|as tu vu)\b.*\b(divergence|double sommet|double creux|tete et epaules|balayage)|\b(divergences? rsi|schemas? de retournement)\b/)) return { type: 'schemas' };
  if (M(n, /\bou en est la (tendance|structure)\b|\bquelle est la tendance\b|\betat de la tendance\b|\brebond ou retournement\b/)) return { type: 'tendance' };
  // lecture du graphique
  if (M(n, /\bon en est ou\b|\bou en est (l or|on)\b|\bque fait l or\b|\blecture du graphique\b|\bfais le point\b|\bpoint sur l or\b/)) return { type: 'lecture' };
  // musique : pause d'abord (« mets en pause la musique » n'est pas « mets la musique »)
  if (M(n, /\bmets? (la musique |le morceau )?en pause\b|\bpause (la |le )?(musique|morceau)\b/)) return { type: 'musique', cmd: 'pause' };
  // musique : lancer
  if (M(n, /\b(lance|mets|met|joue|demarre)\b.*\b(ma |la )?(playlist|liste)( fixe)?\b/) && !M(n, /\bmix\b/)) return { type: 'musique', cmd: 'playlist' };
  if (M(n, /\b(joue|lance|mets|met)\b.*\bmix\b/)) return { type: 'musique', cmd: 'mix' };
  if (M(n, /\b(mets|met|lance|joue)\b.*\b(ma |de la |la )?musique\b|\bmusique s il te plait\b/)) return { type: 'musique', cmd: 'playlist' };
  if (M(n, /\b(garde|ajoute|enregistre)\b.*\b(ce |le )?(morceau|titre|son|chanson)\b/)) return { type: 'musique', cmd: 'garder' };
  if (M(n, /\b(retire|enleve|supprime)\b.*\b(ce |le )?(morceau|titre|son|chanson)\b/)) return { type: 'musique', cmd: 'retirer' };
  if (M(n, /\bcombien\b.*\b(morceaux|titres|chansons)\b/)) return { type: 'musique', cmd: 'combien' };
  if (M(n, /\b(quel|c est quoi|qu est ce que c est)\b.*\b(morceau|titre|chanson|musique)\b/)) return { type: 'musique', cmd: 'quoi' };
  if (M(n, /\b(arrete|stoppe|coupe|eteins)\b.*\bmusique\b|^stop( la musique)?$/)) return { type: 'musique', cmd: 'stop' };
  if (M(n, /\b(coupe|enleve) le son\b|^muet$|\bmode muet\b/)) return { type: 'musique', cmd: 'muet' };
  if (M(n, /\b(remets|reactive|rallume) le son\b/)) return { type: 'musique', cmd: 'muet', v: 0 };
  if (M(n, /^(pause|mets en pause|met en pause)$|\bpause (la )?musique\b/)) return { type: 'musique', cmd: 'pause' };
  if (M(n, /^(reprends?|reprendre|continue|play|lecture)$|\breprends? la musique\b/)) return { type: 'musique', cmd: 'reprendre' };
  // transport : formulations explicites seulement (« qu'est-ce qui se passe », « monte à bord », « image suivante » ne sont pas de la musique)
  if (M(n, /^(suivant|passe|next|au suivant)$|\b(morceau|titre|son) suivant\b|\bchanson suivante\b|\bpasse (au |a la )?(morceau |titre |chanson )?suivante?\b|\bpasse (ce|le) (morceau|titre|son)\b/)) return { type: 'musique', cmd: 'suivant' };
  if (M(n, /^(precedent|reviens)$|\b(morceau|titre|son) precedent\b|\bchanson precedente\b|\breviens au (morceau|titre|son) (precedent|d avant)\b/)) return { type: 'musique', cmd: 'precedent' };
  if (M(n, /\b(monte|augmente)\b.*\b(le son|la musique|le volume)\b|\bvolume plus\b|^(plus fort|monte le son)$/)) return { type: 'musique', cmd: 'volume_plus' };
  if (M(n, /\b(baisse|diminue)\b.*\b(le son|la musique|le volume)\b|\bvolume moins\b|^(moins fort|baisse le son)$/)) return { type: 'musique', cmd: 'volume_moins' };
  if (M(n, /^(melange|aleatoire|shuffle|lecture aleatoire)$|\bmelange (la |ma )?(playlist|musique|liste)\b|\b(playlist|musique) (en )?aleatoire\b/)) return { type: 'musique', cmd: 'melange' };
  // vues (mode télé)
  if (M(n, /\b(affiche|montre|mets)\b.*\b(l or|le graphique|l or)\b/)) return { type: 'vue', vue: 'or' };
  if (M(n, /\b(affiche|montre|mets)\b.*\bterre\b/)) return { type: 'vue', vue: 'terre' };
  return { type: null };
}
