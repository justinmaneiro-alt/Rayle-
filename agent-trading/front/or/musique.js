/* ═════════════ LECTEUR DE MUSIQUE (API IFrame OFFICIELLE de YouTube, aucune clé, aucune extraction d'audio, aucun scraping) ═════════════
   Petit lecteur flottant, réduit (356 × 200 : jamais sous le minimum de 200 × 200 demandé par YouTube) ou agrandi. Deux sources :
   le Mix d'origine (s'il est refusé dans le lecteur intégré : ouverture du lien YouTube, dit clairement) et « ma playlist fixe » (toujours intégrée).
   Commandes : voir commandes-or.js. Liste stockée sur l'appareil (localStorage, erreurs rattrapées) ; jamais par le Worker « rayle ». */
import { MIX, CLE_FIXE, lireListe, exporter, garder, retirer, fusionner, melanger, volumeBorne, mixRefuse, estMobile } from './musique-calcul.js';
import { lireJSON, ecrireJSON, copier } from './stockage-or.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let promesseApi = null;
export function chargerApiYouTube() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  return promesseApi || (promesseApi = new Promise((ok, ko) => {
    const avant = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (avant) try { avant(); } catch (e) { /* */ } ok(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { promesseApi = null; ko(new Error('API YouTube bloquée ou hors ligne')); }; document.head.appendChild(s);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { promesseApi = null; ko(new Error('API YouTube : pas de réponse')); } }, 15000);
  }));
}
const CSS = `.mu-flot{position:fixed;right:14px;bottom:14px;z-index:2147480000;background:#05080c;border:1px solid rgba(143,208,227,.35);border-radius:6px;box-shadow:0 10px 36px rgba(0,0,0,.6);display:flex;flex-direction:column}
.mu-flot[hidden]{display:none}.mu-flot header{display:flex;align-items:center;gap:6px;padding:4px 6px;color:#d7e3ea;font:12px system-ui}
.mu-flot header span{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:260px}
.mu-flot header button{background:#101820;border:1px solid rgba(143,208,227,.25);color:#d7e3ea;border-radius:4px;min-width:28px;min-height:26px;cursor:pointer}
.mu-lecteur{width:356px;height:200px}.mu-flot.mu-grand .mu-lecteur{width:min(854px,92vw);height:min(480px,52vw)}
.mu-lancer{position:fixed;inset:0;z-index:2147480001;display:flex;align-items:center;justify-content:center;background:rgba(2,4,8,.6)}
.mu-lancer button{font:600 26px system-ui;padding:22px 34px;border-radius:10px;background:#8fd0e3;color:#04121a;border:0;cursor:pointer}
.mu-liste{max-height:260px;overflow:auto;margin:6px 0;padding-left:22px}.mu-liste li{margin:2px 0}.mu-liste li.mu-cur{color:#8fd0e3}
@media (max-width:600px){.mu-flot{left:8px;right:8px;bottom:8px}.mu-lecteur{width:100%;height:200px}.mu-flot header span{max-width:none}}`;

export function monterMusique(el, { tableau = null, notifier, parler: dire, conteneurFlottant = document.body } = {}) {
  const note = notifier || (tableau ? tableau.notifier : () => {});
  if (!document.getElementById('mu-css')) { const s = document.createElement('style'); s.id = 'mu-css'; s.textContent = CSS; document.head.appendChild(s); }
  let fixe = lireJSON(CLE_FIXE, []); if (!Array.isArray(fixe)) fixe = [];
  let player = null, source = null, pret = null, debutMix = 0, verifMix = null, ordre = [], volume = lireJSON('rayle_musique_volume', 60);
  const sauver = () => { if (!ecrireJSON(CLE_FIXE, fixe)) note('Musique : impossible d’enregistrer la liste sur cet appareil (stockage refusé). Exporte-la.', { niveau: 'fort' }); };
  if (el) el.innerHTML = `<h2>Musique <small>lecteur officiel YouTube · « lance ma playlist », « joue le mix », « garde ce morceau »…</small></h2>
    <div class="tor-actions"><button type="button" data-m="playlist">▶ Ma playlist fixe</button><button type="button" data-m="mix">▶ Le Mix</button><button type="button" data-m="pause">⏸</button><button type="button" data-m="reprendre">⏵</button><button type="button" data-m="precedent">⏮</button><button type="button" data-m="suivant">⏭</button><button type="button" data-m="volume_moins">🔉</button><button type="button" data-m="volume_plus">🔊</button><button type="button" data-m="muet">🔇</button><button type="button" data-m="melange">🔀</button><button type="button" data-m="stop">⏹</button><button type="button" data-m="garder">＋ Garde ce morceau</button><button type="button" data-m="retirer">－ Retire ce morceau</button></div>
    <p data-m-etat class="tor-doux"></p>
    <details><summary>Ma playlist fixe (<span data-m-n>0</span> morceaux)</summary><ol class="mu-liste" data-m-liste></ol>
      <p class="tor-doux">Importer une liste : colle des liens YouTube, un par ligne (texte après « # » = titre).</p>
      <textarea data-m-import rows="4" style="width:100%" placeholder="https://www.youtube.com/watch?v=…&#10;https://youtu.be/… # titre"></textarea>
      <div class="tor-actions"><button type="button" data-m="importer">Importer</button><button type="button" data-m="exporter">Exporter ma liste (presse-papiers)</button></div></details>`;
  const flot = document.createElement('section'); flot.className = 'mu-flot'; flot.hidden = true; flot.setAttribute('aria-label', 'Lecteur de musique');
  flot.innerHTML = '<header><span data-m-titre>Musique</span><button type="button" data-m="taille" title="Agrandir / réduire">⤢</button><button type="button" data-m="stop" title="Arrêter">✕</button></header><div class="mu-lecteur"><div data-m-yt></div></div>';
  conteneurFlottant.appendChild(flot);
  const q = s => el && el.querySelector(s);
  function etat(t) { const e = q('[data-m-etat]'); if (e) e.textContent = t; }
  function majListe() {
    const n = q('[data-m-n]'); if (n) n.textContent = fixe.length;
    const cur = player && player.getVideoData ? (player.getVideoData() || {}).video_id : null, L = q('[data-m-liste]');
    if (L) L.innerHTML = fixe.map(m => `<li class="${m.id === cur ? 'mu-cur' : ''}">${esc(m.titre || 'titre inconnu')} <small class="tor-doux">${m.id}</small></li>`).join('');
  }
  function titreCourant() { try { const d = player.getVideoData(); return d && d.title ? { id: d.video_id, titre: d.title } : null; } catch (e) { return null; } }
  function majTitre() { const t = titreCourant(); flot.querySelector('[data-m-titre]').textContent = t ? (source === 'mix' ? 'Mix · ' : 'Ma playlist · ') + t.titre : 'Musique'; if (t) { const m = fixe.find(x => x.id === t.id && !x.titre); if (m) { m.titre = t.titre; sauver(); } } majListe(); diffuser(); }
  /* état minimal pour la télécommande (mode télé) */
  let surEtat = null; const diffuser = () => { if (surEtat) { const t = titreCourant(); surEtat({ titre: t ? t.titre : '', lecture: player && player.getPlayerState ? player.getPlayerState() === 1 : false, volume }); } };

  function grosBouton() {
    if (document.querySelector('.mu-lancer')) return;
    const d = document.createElement('div'); d.className = 'mu-lancer'; d.innerHTML = '<button type="button">▶ Lancer la musique</button>';
    d.querySelector('button').onclick = () => { d.remove(); try { player.playVideo(); } catch (e) { /* */ } };
    document.body.appendChild(d);
  }
  function surveillerDemarrage() {
    setTimeout(() => { try { const s = player.getPlayerState(); if (s !== 1 && s !== 3) { grosBouton(); etat('Le navigateur a bloqué le démarrage du son : appuie sur « Lancer la musique ».'); } } catch (e) { /* */ } }, 2500);
  }
  /* le Mix (liste « RD… ») n'est accepté qu'à la CRÉATION du lecteur avec sa vidéo de départ (loadPlaylist le refuse) : le lecteur est recréé pour lui */
  async function lecteur(mix = false) {
    if (player && !mix && source !== 'mix') return player;
    if (player && (mix || source === 'mix')) { try { player.destroy(); } catch (e) { /* */ } player = null; pret = null; const d = document.createElement('div'); d.dataset.mYt = ''; flot.querySelector('.mu-lecteur').replaceChildren(d); }
    if (pret) return pret;
    pret = chargerApiYouTube().then(YT => new Promise(ok => {
      flot.hidden = false;
      player = new YT.Player(flot.querySelector('[data-m-yt]'), {
        width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        ...(mix ? { videoId: MIX.video } : {}),
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin, ...(mix ? { list: MIX.liste, listType: 'playlist', autoplay: 1 } : {}) },
        events: {
          onReady: () => { try { player.setVolume(volume); } catch (e) { /* */ } ok(player); },
          onStateChange: ev => { if (ev.data === 1) { const b = document.querySelector('.mu-lancer'); if (b) b.remove(); } majTitre(); },
          onError: ev => { if (source === 'mix' && mixRefuse({ erreur: ev.data })) basculerMix('erreur ' + ev.data); else { etat(`Morceau illisible dans le lecteur intégré (erreur ${ev.data}) : passage au suivant.`); try { player.nextVideo(); } catch (e) { /* */ } } }
        }
      });
    }));
    pret.catch(e => { pret = null; etat('Lecteur YouTube indisponible : ' + e.message); });
    return pret;
  }
  /* le Mix refusé par le lecteur intégré : on ouvre le lien YouTube (appli sur téléphone, nouvel onglet sur PC), et on le dit */
  function basculerMix(raison) {
    clearTimeout(verifMix); try { player.stopVideo(); } catch (e) { /* */ }
    const msg = `Le lecteur intégré refuse le Mix (${raison}). Je l’ouvre sur YouTube${estMobile() ? ' (application)' : ' dans un nouvel onglet'}. Pour l’avoir ici, importe ses morceaux dans ta playlist fixe.`;
    etat(msg); note(msg, { niveau: 'fort' });
    const w = estMobile() ? (location.href = MIX.url, null) : window.open(MIX.url, '_blank', 'noopener');
    if (!estMobile() && !w) { etat(msg + ' L’ouverture a été bloquée : lien → ' + MIX.url); }
    const z = q('[data-m-import]'); if (z) { z.closest('details').open = true; }
    return msg;
  }
  async function lancer(quoi) {
    if (quoi !== 'mix' && !fixe.length) { etat('Ta playlist fixe est vide : lance le Mix et dis « garde ce morceau », ou importe des liens.'); return 'Ta playlist fixe est vide. Lance le Mix et dis garde ce morceau, ou importe des liens.'; }
    const p = await lecteur(quoi === 'mix'); flot.hidden = false;
    if (quoi === 'mix') {
      source = 'mix'; debutMix = Date.now(); try { p.playVideo(); } catch (e) { /* */ }
      clearTimeout(verifMix); verifMix = setTimeout(() => { let pl = null; try { pl = p.getPlaylist(); } catch (e) { /* */ } if (mixRefuse({ playlist: pl, attenduMs: Date.now() - debutMix })) basculerMix('liste non chargée'); }, 6500);
      surveillerDemarrage(); etat('Lecture du Mix YouTube.'); return 'Je lance le Mix.';
    }
    if (!fixe.length) { etat('Ta playlist fixe est vide : lance le Mix et dis « garde ce morceau », ou importe des liens.'); return 'Ta playlist fixe est vide. Lance le Mix et dis garde ce morceau, ou importe des liens.'; }
    source = 'fixe'; ordre = fixe.map(m => m.id);
    p.loadPlaylist(ordre.slice(0, 200), 0); surveillerDemarrage(); etat(`Lecture de ta playlist fixe (${fixe.length} morceaux).`);
    return `Je lance ta playlist, ${fixe.length} morceau${fixe.length > 1 ? 'x' : ''}.`;
  }
  async function commande(c) {
    const cmd = typeof c === 'string' ? c : c.cmd;
    if (cmd === 'playlist' || cmd === 'mix') return lancer(cmd);
    if (cmd === 'combien') return `Il y a ${fixe.length} morceau${fixe.length > 1 ? 'x' : ''} dans ta playlist.`;
    if (cmd === 'garder' || cmd === 'retirer' || cmd === 'quoi') {
      const t = player ? titreCourant() : null; if (!t) return player && source ? 'Le morceau charge encore, redemande dans une seconde.' : 'Aucun morceau en cours.';
      if (cmd === 'quoi') return `C’est ${t.titre}.`;
      const r = cmd === 'garder' ? garder(fixe, t) : retirer(fixe, t.id); fixe = r.liste; sauver(); majListe();
      return { ajoute: `${t.titre} est gardé dans ta playlist (${fixe.length} morceau${fixe.length > 1 ? 'x' : ''}).`, deja: 'Ce morceau est déjà dans ta playlist.', retire: `${t.titre} est retiré de ta playlist.`, absent: 'Ce morceau n’est pas dans ta playlist.', invalide: 'Je ne peux pas garder ce morceau.' }[r.etat];
    }
    if (!player) return cmd === 'stop' ? 'La musique est déjà arrêtée.' : 'Aucune musique en cours. Dis « lance ma playlist ».';
    const p = player;
    switch (cmd) {
      case 'pause': p.pauseVideo(); return 'Pause.';
      case 'reprendre': p.playVideo(); surveillerDemarrage(); return 'Je reprends.';
      case 'suivant': p.nextVideo(); return 'Morceau suivant.';
      case 'precedent': p.previousVideo(); return 'Morceau précédent.';
      case 'volume_plus': case 'volume_moins': volume = volumeBorne((p.getVolume ? p.getVolume() : volume) + (cmd === 'volume_plus' ? 10 : -10)); p.setVolume(volume); if (p.isMuted && p.isMuted()) p.unMute(); ecrireJSON('rayle_musique_volume', volume); diffuser(); return `Volume ${volume}.`;
      case 'muet': if (p.isMuted && p.isMuted() || c.v === 0) { p.unMute(); return 'Son remis.'; } p.mute(); return 'Son coupé.';
      case 'melange': if (source === 'fixe') { ordre = melanger(fixe.map(m => m.id)); p.loadPlaylist(ordre.slice(0, 200), 0); } else p.setShuffle(true); return 'Lecture mélangée.';
      case 'stop': clearTimeout(verifMix); p.stopVideo(); flot.hidden = true; source = null; etat('Musique arrêtée.'); return 'Musique arrêtée.';
    }
    return null;
  }
  async function surBouton(m) {
    if (m === 'taille') { flot.classList.toggle('mu-grand'); return; }
    if (m === 'importer') { const z = q('[data-m-import]'), r = lireListe(z.value), f = fusionner(fixe, r.morceaux); fixe = f.liste; sauver(); majListe(); z.value = ''; etat(`${f.ajoutes} morceau(x) ajouté(s)${r.rejets.length ? `, ${r.rejets.length} ligne(s) non reconnue(s)` : ''}.`); return; }
    if (m === 'exporter') { const ok = await copier(exporter(fixe)); etat(ok ? `Liste copiée (${fixe.length} liens) : colle-la dans « Importer » sur l’autre appareil.` : 'Copie refusée par le navigateur.'); return; }
    const r = await commande({ cmd: m }); if (r) etat(r);
  }
  for (const root of [el, flot]) if (root) root.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) surBouton(b.dataset.m); });
  majListe();
  return { commande, lancer, liste: () => fixe.slice(), titre: titreCourant, lecteur: () => player, surEtat(f) { surEtat = f; }, detruire() { clearTimeout(verifMix); try { player && player.destroy(); } catch (e) { /* */ } flot.remove(); } };
}
