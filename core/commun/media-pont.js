"use strict";
/* ═════════════ MUSIQUE ET TÉLÉ PARTOUT DANS RAYLE (pont, script classique) ═════════════
   window.RayleMedia : commande(texte) pour la voix depuis n'importe quel écran (« lance ma playlist », « pause », « suivant »…), ouvrir('musique' | 'tele').
   Le module (agent-trading/front/or/media-rayle.js) n'est chargé qu'à la première phrase qui parle de musique ou de télé, ou au premier clic.
   Tuiles « ♪ Musique » et « 📺 Télé » sur l'accueil (thèmes Aurore et Jarvis, PC). Dossier agent-trading/ absent : tout se retire en silence. */
(function () {
  if (window.RAYLE_SATELLITE || window.RayleMedia) return;
  const URL_MOD = new URL('agent-trading/front/or/media-rayle.js', document.baseURI).href;
  let mod = null, absent = false;
  const charger = () => mod ? Promise.resolve(mod) : import(URL_MOD).then(m => { mod = m; brancherEtat(); return m; });
  // filtre rapide : on ne charge le module que si la phrase peut le concerner (le module décide ensuite, avec une grammaire stricte)
  const PEUT_ETRE = /musique|playlist|mix|morceau|chanson|titre|pause|reprend|continue|lecture|suivant|pr[ée]c[ée]dent|passe|reviens|retour|volume|\bson\b|muet|fort|baisse|monte|stop|arr[eê]te|m[ée]lang|al[ée]atoire|shuffle|next|play|t[ée]l[ée]|garde|retire|combien/i;
  async function commande(texte) {
    if (absent || !PEUT_ETRE.test(String(texte || ''))) return null;
    try { const m = await charger(); return await m.commande(texte); } catch (e) { absent = true; retirer(); return null; }
  }
  function ouvrir(quoi) { return charger().then(m => m.ouvrir(quoi)).catch(() => { absent = true; retirer(); }); }

  /* ── tuiles de l'accueil (à droite du bouton 🗂 du tiroir de fenêtres) ── */
  const css = document.createElement('style');
  css.textContent = `.md-tuiles{position:fixed;left:68px;bottom:12px;z-index:60;display:flex;gap:8px}
.md-tuiles[hidden]{display:none}
.md-tuiles button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:118px;max-width:220px;min-height:52px;padding:8px 12px;background:#070c12;border:1px solid rgba(143,208,227,.3);border-radius:6px;color:#d7e3ea;font:600 13px system-ui,sans-serif;cursor:pointer;text-align:left}
.md-tuiles button:hover,.md-tuiles button:focus-visible{border-color:rgba(143,208,227,.7);outline:none}
.md-tuiles small{font:400 11.5px system-ui,sans-serif;color:#7d8a90;max-width:196px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.md-tuiles button.md-actif small{color:#8fd0e3}`;
  document.head.appendChild(css);
  const tuiles = document.createElement('nav'); tuiles.className = 'md-tuiles'; tuiles.id = 'mdTuiles'; tuiles.setAttribute('aria-label', 'Musique et télé'); tuiles.hidden = true;
  tuiles.innerHTML = '<button type="button" data-md="musique" aria-label="Ouvrir la musique">♪ Musique<small data-md-s="musique">« lance ma playlist »</small></button><button type="button" data-md="tele" aria-label="Ouvrir la télé">📺 Télé<small data-md-s="tele">mode télé et télécommande</small></button>';
  tuiles.addEventListener('click', e => { const b = e.target.closest('[data-md]'); if (b) ouvrir(b.dataset.md); });
  function retirer() { tuiles.remove(); }
  function brancherEtat() {
    if (!mod || !mod.surEtat) return;
    mod.surEtat(E => {
      const m = tuiles.querySelector('[data-md-s="musique"]'), t = tuiles.querySelector('[data-md-s="tele"]');
      m.textContent = E.musique ? (E.titre || 'en lecture') : '« lance ma playlist »'; m.parentNode.classList.toggle('md-actif', E.musique);
      t.textContent = E.tele ? 'télé connectée' : 'mode télé et télécommande'; t.parentNode.classList.toggle('md-actif', E.tele);
    });
  }
  const pc = () => !window.RayleAppareil || !RayleAppareil.estPC || RayleAppareil.estPC();
  function majVisibilite(vue) { tuiles.hidden = !(pc() && (vue || (window.RayleBus && RayleBus.demander && RayleBus.demander('vue')) || 'rayle') === 'rayle'); }
  function demarrer() {
    document.body.appendChild(tuiles); majVisibilite();
    if (window.RayleBus && RayleBus.on) RayleBus.on('vue:changee', e => majVisibilite(e && e.vue));
    fetch(URL_MOD, { method: 'HEAD', cache: 'no-store' }).then(r => { if (!r.ok) { absent = true; retirer(); } }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();

  window.RayleMedia = { commande, ouvrir, charger, tuiles: () => tuiles };
})();
