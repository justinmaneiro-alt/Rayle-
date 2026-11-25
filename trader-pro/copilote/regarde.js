/* ═════════════ « REGARDE ÇA » et « RAYLE, MONTRE-MOI » : le copilote en direct sur le graphique ═════════════
   · ouvrirRegardeCa(moment) : graphique centré sur le gros moment, éléments surlignés (bougie, volume, MA200, niveau balayé, zone), panneau « Ce qu'il faut regarder » (3 à 5 chiffres, chacun avec pourquoi il compte)
     et explication à la voix (ce que Rayle voit, ce que ça veut dire, scénario, ce qui l'invaliderait, stats de notre base).
   · ouvrirMontreMoi(actif) : Rayle parcourt les outils un par un en les surlignant ; on peut l'interrompre (« pourquoi celle-là ? », « et le volume là ? »).
   Lecture seule : aucun ordre. */
import { lireFiches } from '../reseau/client.js';
import { detecterMoments } from './moments.js';
import { etapesVisite, repondreQuestion } from './visite-outils.js';
import { parler as parlerIA } from '../commun/ia.js';
import { texteBougie } from './relecture.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const htmlRegarde = m => `<h4 class="tp-regarde-titre">Ce qu’il faut regarder</h4><ul class="tp-regarde">${m.chiffres.map(c => `<li><b>${esc(c.label)}</b><small>${esc(c.pourquoi)}</small></li>`).join('')}</ul>`;
export async function momentsActuels({ actif = null, maxAgeMs = 6 * 3600e3, maintenant = Date.now() } = {}) {
  const fiches = await lireFiches(); return Object.values(fiches).filter(F => !actif || F.actif === actif).flatMap(F => detecterMoments(F, { maintenant, maxAgeMs })).sort((a, b) => b.severite - a.severite || b.t - a.t);
}
export async function ouvrirRegardeCa(m, { parler = parlerIA, racine = document.body } = {}) {
  const R = await import('./relecture.js'), fin = Date.now();
  const G = await R.ouvrirRelecture({ actif: m.actif, unite: m.unite === 'M15' || m.unite === 'M5' ? 'H1' : m.unite, t0: m.t - 6 * 3600e3, t1: fin, niveaux: [], titre: m.titre, nom: m.nom, racine, parler, auDemarrage: false, surlignages: m.surlignages, panneauHtml: htmlRegarde(m), texteInitial: m.texteVoix });
  G.afficher(G.R.bougies.length - 1); G.surligner(m.surlignages); parler(m.texteVoix); return G;
}
/* « Rayle, montre-moi » : la visite des outils */
export async function ouvrirMontreMoi(actif, { unite = 'H4', parler = parlerIA, racine = document.body, auto = true } = {}) {
  const fiches = await lireFiches(), F = fiches[actif]; if (!F) throw new Error('pas de lecture de marché disponible pour cet actif');
  const E = etapesVisite(F, { unite }), R = await import('./relecture.js'), now = Date.now();
  const G = await R.ouvrirRelecture({ actif, unite, t0: now - 3 * 86400e3, t1: now, titre: `Rayle te montre : ${F.nom}`, nom: F.nom, racine, parler, auDemarrage: false, texteInitial: 'Je te montre les outils un par un. Appuie sur « Suivant » ou laisse-moi parler.' });
  G.afficher(G.R.bougies.length - 1);
  G.el.querySelector('.tp-actions').insertAdjacentHTML('beforebegin', `<div class="tp-rel-question"><input type="text" data-question placeholder="Interromps-moi : « pourquoi celle-là ? », « et le volume là ? »" aria-label="Poser une question à Rayle"><button type="button" data-poser>Demander</button></div>`);
  G.el.querySelector('.tp-actions').innerHTML = '<button type="button" data-prec-etape>◀ Étape précédente</button> <button type="button" data-suiv-etape>Suivant ▶</button> <button type="button" data-auto>⏸ Pause de la visite</button>';
  let k = -1, enAttente = null, enCours = auto;
  const dire = t => { try { parler(t); } catch (e) { /* voix absente */ } }, delai = t => Math.max(4000, t.split(/\s+/).length * 400);
  const aller = n => { k = Math.min(E.length - 1, Math.max(0, n)); const e = E[k]; clearTimeout(enAttente); G.surligner(e.surligner); G.panneau(`<h4 class="tp-regarde-titre">${esc(e.titre)} <small>(${k + 1} / ${E.length})</small></h4>`); G.ecrire(e.texte); dire(e.texte); if (enCours && k < E.length - 1) enAttente = setTimeout(() => aller(k + 1), delai(e.texte)); };
  G.el.addEventListener('click', e => {
    if (e.target.closest('[data-suiv-etape]')) { enCours = false; aller(k + 1); } else if (e.target.closest('[data-prec-etape]')) { enCours = false; aller(k - 1); }
    else if (e.target.closest('[data-auto]')) { enCours = !enCours; e.target.closest('[data-auto]').textContent = enCours ? '⏸ Pause de la visite' : '▶ Reprendre la visite'; clearTimeout(enAttente); if (enCours && k < E.length - 1) enAttente = setTimeout(() => aller(k + 1), 800); }
    else if (e.target.closest('[data-poser]')) poser();
  });
  const poser = () => { const inp = G.el.querySelector('[data-question]'), q = inp.value; if (!q.trim()) return; inp.value = ''; enCours = false; clearTimeout(enAttente); const info = G.courante(), r = repondreQuestion(q, { F, etape: E[k] || null, info, texteBougie: texteBougie(info, { nom: F.nom, unite }) }); if (r == null) { aller(k + 1); return; } G.ecrire(r); dire(r); };
  G.el.querySelector('[data-question]').addEventListener('keydown', e => { if (e.key === 'Enter') poser(); });
  setTimeout(() => aller(0), 600); return Object.assign(G, { etapes: E, aller, poser });
}
