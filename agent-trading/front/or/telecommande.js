/* ═════════════ TÉLÉCOMMANDE DE LA TÉLÉ (téléphone, tablette, application PC) ═════════════
   Code à 4 chiffres affiché sur la télé → relais dédié sans secret → la télé exécute. Rien n'est stocké ; aucune donnée personnelle envoyée. */
import { creerLien } from './tele-lien.js';
import { codeValide } from './tele-calcul.js';
import { interpreter } from './commandes-or.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BOUTONS = [['playlist', '▶ Ma playlist'], ['mix', '▶ Le Mix'], ['pause_reprendre', '⏯ Pause / reprendre'], ['precedent', '⏮'], ['suivant', '⏭'], ['volume_moins', '🔉'], ['volume_plus', '🔊'], ['muet', '🔇'], ['melange', '🔀'], ['stop', '⏹ Arrêter'], ['or', 'Affiche l’or'], ['terre', 'Affiche la Terre']];
export function monterTelecommande(el, { codeDepart = null, compact = false } = {}) {
  el.innerHTML = `<div class="tc">${compact ? '<h3>Commander la télé</h3>' : '<h1>Télécommande de Rayle</h1>'}
    <form class="tc-code" data-tc-form><label>Code affiché sur la télé <input inputmode="numeric" pattern="\\d{4}" maxlength="4" data-tc-code placeholder="1234"></label><button type="submit">Connecter</button></form>
    <p class="tc-etat" data-tc-etat aria-live="polite">Pas connectée.</p>
    <div class="tc-boutons" data-tc-boutons hidden>${BOUTONS.map(([c, t]) => `<button type="button" data-tc="${c}">${t}</button>`).join('')}</div>
    <p class="tc-titre" data-tc-titre></p></div>`;
  const q = s => el.querySelector(s); let lien = null;
  function connecter(code) {
    if (!codeValide(code)) { q('[data-tc-etat]').textContent = 'Le code fait 4 chiffres.'; return; }
    if (lien) lien.fermer();
    lien = creerLien({ role: 'commande', code, surEtat: e => { q('[data-tc-etat]').textContent = { connexion: 'Connexion…', 'appairé': `Connectée à la télé ${code}.`, reconnexion: 'Reconnexion…', introuvable: 'Aucune télé avec ce code : vérifie les 4 chiffres affichés sur la télé.', erreur: 'Relais indisponible.' }[e.etat] || e.etat; q('[data-tc-boutons]').hidden = e.etat !== 'appairé' && e.etat !== 'reconnexion'; },
      surMessage: m => { if (m.t === 'etat' && m.titre != null) q('[data-tc-titre]').textContent = m.titre ? `En cours : ${m.titre}${m.lecture === false ? ' (pause)' : ''}` : ''; } });
  }
  q('[data-tc-form]').addEventListener('submit', e => { e.preventDefault(); connecter(q('[data-tc-code]').value.trim()); });
  el.addEventListener('click', e => { const b = e.target.closest('[data-tc]'); if (b && lien) { if (navigator.vibrate) try { navigator.vibrate(8); } catch (er) { /* */ } if (!lien.envoyer({ t: 'cmd', cmd: b.dataset.tc })) q('[data-tc-etat]').textContent = 'Pas encore connectée…'; } });
  if (codeDepart && codeValide(codeDepart)) { q('[data-tc-code]').value = codeDepart; connecter(codeDepart); }
  return {
    connectee: () => !!lien && !q('[data-tc-boutons]').hidden,
    /* une phrase (« lance ma playlist », « affiche la Terre ») envoyée à la télé ; renvoie la réponse à dire, ou null si ce n'est pas une commande de télé */
    phrase(texte) { const c = interpreter(texte); if (!lien || q('[data-tc-boutons]').hidden) return null; const cmd = c.type === 'musique' ? c.cmd : c.type === 'vue' ? c.vue : null; if (!cmd || ['garder', 'retirer', 'combien', 'quoi'].includes(cmd)) return null; lien.envoyer({ t: 'cmd', cmd }); return 'C’est envoyé à la télé.'; },
    envoyer: cmd => lien && lien.envoyer({ t: 'cmd', cmd }),
    detruire() { lien && lien.fermer(); }
  };
}
export const CSS_TC = `.tc{font:18px/1.4 system-ui,sans-serif;color:#d7e3ea}.tc h1{font-size:22px}.tc-code{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
.tc input{font:700 28px ui-monospace,monospace;width:5.5em;letter-spacing:.2em;padding:6px 10px;background:#0c131a;color:#e0c27f;border:1px solid rgba(143,208,227,.3);border-radius:6px}
.tc button{font:600 18px system-ui;color:#d7e3ea;background:#101820;border:1px solid rgba(143,208,227,.3);border-radius:10px;padding:14px 12px;min-height:56px;cursor:pointer}
.tc-boutons[hidden]{display:none}.tc-boutons{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px}.tc-titre{color:#8fd0e3}`;
/* bloc du tableau de bord (téléphone, tablette, application PC) */
export function monterTelecommandeBloc(el) {
  if (!document.getElementById('tc-css')) { const s = document.createElement('style'); s.id = 'tc-css'; s.textContent = CSS_TC; document.head.appendChild(s); }
  el.innerHTML = '<h2>Mode télé <small>ouvre justinmaneiro-alt.github.io/Rayle-/tv sur la télé, puis entre le code affiché</small></h2><div></div>';
  return monterTelecommande(el.lastElementChild, { compact: true });
}
