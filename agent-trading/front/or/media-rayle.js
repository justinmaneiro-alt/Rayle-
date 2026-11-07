/* ═════════════ MUSIQUE ET TÉLÉ : TUILES INDÉPENDANTES DE RAYLE (hors de la page de l'or) ═════════════
   Un seul lecteur de musique pour tout Rayle (musique.js) et une seule télécommande (telecommande.js) : mêmes modules que le mode télé,
   aucune copie. Fermer une fenêtre la cache seulement : la musique continue, la télé reste appairée.
   commande(texte) : commandes vocales depuis n'importe quel écran (« lance ma playlist », « pause », « suivant »…), sans ouvrir la page de l'or. */
import { monterMusique } from './musique.js';
import { monterTelecommandeBloc } from './telecommande.js';
import { interpreter } from './commandes-or.js';
import { ouvrirCadre } from '../fenetre-cadre.js';
import { chargerCssOr } from './tableau-or.js';

let musique = null, tele = null;
const fen = { musique: null, tele: null }, abonnes = new Set();
const diffuser = () => { for (const f of abonnes) try { f(etat()); } catch (e) { /* abonné cassé */ } };

/* le lecteur unique (créé à la première demande ; son petit lecteur YouTube flotte en bas à droite, comme avant) */
export function lecteur() {
  if (musique) return musique;
  musique = monterMusique(null, { notifier: t => console.info('musique :', t) });
  musique.surEtat(diffuser);
  return musique;
}
/* la télécommande vit dans un élément gardé en mémoire : l'appairage survit à la fermeture de la fenêtre */
function telecommande() {
  if (tele) return tele;
  chargerCssOr();
  const el = document.createElement('section'); el.className = 'tor-bloc md-tele';
  const tc = monterTelecommandeBloc(el);
  const tv = new URL('../../../tv/', import.meta.url).href;
  el.insertAdjacentHTML('beforeend', `<p class="tor-doux">Sur la télé : ouvre <a href="${tv}" target="_blank" rel="noopener">l’adresse du mode télé</a> (ou <b>/tv</b> après l’adresse de Rayle), puis entre ici le code à 4 chiffres affiché. La télécommande seule sur un téléphone : <b>/tc</b>.</p><div class="tor-actions"><button type="button" data-md="tv-ici">Ouvrir le mode télé sur cet écran</button></div>`);
  el.querySelector('[data-md="tv-ici"]').onclick = () => window.open(tv, '_blank', 'noopener');
  tele = { el, tc };
  return tele;
}
export const etat = () => {
  const t = musique && musique.actif() ? musique.titre() : null;
  return { musique: !!(musique && musique.actif()), titre: t ? t.titre : '', tele: !!(tele && tele.tc.connectee()) };
};
export function surEtat(f) { abonnes.add(f); f(etat()); return () => abonnes.delete(f); }

export function ouvrir(quoi) {
  if (quoi !== 'musique' && quoi !== 'tele') return null;
  if (fen[quoi]) { fen[quoi].montrer(); return fen[quoi]; }
  chargerCssOr();
  const monter = el => {
    const r = document.createElement('div'); r.className = 'tor md-tuile'; el.appendChild(r);
    if (quoi === 'musique') { const b = document.createElement('section'); b.className = 'tor-bloc'; r.appendChild(b); lecteur().attacher(b); }
    else r.appendChild(telecommande().el);
    return {};
  };
  fen[quoi] = ouvrirCadre({ titre: quoi === 'musique' ? '♪ MUSIQUE' : '📺 TÉLÉ', ariaLabel: quoi === 'musique' ? 'Musique' : 'Télé', garder: true, largeur: 600, hauteur: quoi === 'musique' ? 440 : 500, min: [340, 280], monter });
  return fen[quoi];
}
export const fermer = quoi => { if (fen[quoi] && fen[quoi].ouverte) { fen[quoi].fermer(); return true; } return false; };
export const ouverte = quoi => !!(fen[quoi] && fen[quoi].ouverte);

/* commande vocale ou écrite ; renvoie la phrase à dire, ou null si ce n'est pas pour la musique ou la télé.
   global = true : phrase venue de n'importe quel écran (les commandes courtes ne sont prises que si une musique joue). */
export async function commande(texte, { global = true } = {}) {
  const c = interpreter(texte, { global, musiqueActive: !!(musique && musique.actif()) });
  if (c.type === 'fenetre') { ouvrir(c.quoi); return c.quoi === 'musique' ? 'J’ouvre la musique.' : 'J’ouvre la télé.'; }
  if (c.type !== 'musique' && c.type !== 'vue') return null;
  if (tele && tele.tc.connectee()) { const r = tele.tc.phrase(texte); if (r) return r; }
  if (c.type === 'vue') return null;
  const r = await lecteur().commande(c); diffuser(); return r;
}
