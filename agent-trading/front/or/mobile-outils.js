"use strict";
/* Terminal sur petit écran (≤ 820 px, téléphone ou fenêtre étroite) : les barres d'outils (couches, dessin, positions, propositions, flèches…) sont REPLIÉES derrière un bouton « Outils »,
   pour que le graphique (bougies, flèches, zones, RSI) occupe l'écran. Aucune fonction n'est retirée : un appui sur « Outils » les rouvre. Le choix est mémorisé sur l'appareil. */
export function monterOutilsMobiles(R) {
  const mq = window.matchMedia ? window.matchMedia('(max-width: 820px)') : { matches: false, addEventListener() {} };
  const tete = R.querySelector('.tor-tete') || R.querySelector('header'); if (!tete || R.querySelector('[data-mo-bouton]')) return null;
  const cle = 'rayle_or_outils_ouverts'; let ouvert = false; try { ouvert = localStorage.getItem(cle) === '1'; } catch (e) { /* */ }
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tor-mo-bouton'; b.dataset.moBouton = ''; b.hidden = true;
  const maj = () => { R.toggleAttribute('data-replie', mq.matches && !ouvert); b.hidden = !mq.matches; b.setAttribute('aria-expanded', String(ouvert)); b.textContent = ouvert ? 'Outils ▴' : 'Outils ▾'; };
  b.addEventListener('click', () => { ouvert = !ouvert; try { localStorage.setItem(cle, ouvert ? '1' : '0'); } catch (e) { /* */ } maj(); });
  tete.appendChild(b); (mq.addEventListener ? mq.addEventListener('change', maj) : null); maj();
  return { ouvert: () => ouvert, replie: () => R.hasAttribute('data-replie') };
}
