/* ═════════════ PAGE or.html : tableau de bord complet, ou mode télé (?tele=1 / grand écran sans souris fine) ═════════════ */
import { monterTableauOr } from './tableau-or.js';

export function estTele(loc = location, m = globalThis.matchMedia) {
  const q = new URLSearchParams(loc.search);
  if (q.get('tele') === '1') return true; if (q.get('tele') === '0') return false;
  try { return screen.width >= 1900 && m && m('(pointer: coarse), (pointer: none)').matches && !m('(pointer: fine)').matches && !('ontouchstart' in window); } catch (e) { return false; }
}

/* monte les modules B et C dans leurs blocs ; chacun est indépendant (un échec n'empêche pas le reste) */
export async function monterModules(T) {
  const R = T.R, essais = [
    ['journal', './journal-ui.js', 'monterJournal', '[data-journal-bloc]'],
    ['gardien', './gardien-ui.js', 'monterGardien', '[data-gardien-bloc]'],
    ['musique', './musique.js', 'monterMusique', '[data-musique-bloc]']
  ];
  for (const [nom, f, fn, sel] of essais) {
    try { const m = await import(f); T.monterModule(nom, m[fn](R.querySelector(sel), { tableau: T })); }
    catch (e) { const b = R.querySelector(sel); if (b) b.innerHTML = `<h2>${nom}</h2><p class="tor-doux">Module indisponible : ${String(e.message).replace(/</g, '&lt;')}</p>`; console.error(nom, e); }
  }
}

export function demarrerPage(el) {
  if (estTele()) return import('./tele.js').then(m => m.monterTele(el));
  const T = monterTableauOr(el, { contexte: 'page' });
  window.TableauOr = T;   // commandes vocales de Rayle : TableauOr.commande(texte)
  monterModules(T);
  return T;
}
