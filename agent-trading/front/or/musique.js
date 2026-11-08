/* ═════════════ LECTEUR DE MUSIQUE (API IFrame OFFICIELLE de YouTube, aucune clé, aucune extraction d'audio, aucun scraping) ═════════════
   Petit lecteur flottant, réduit (356 × 200 : jamais sous le minimum de 200 × 200 demandé par YouTube) ou agrandi. Trois sources :
   « ma playlist YouTube » (lien enregistré sur l'appareil), « ma liste de morceaux » (liens un par un) et le Mix d'origine (secours).
   AUCUNE fenêtre ni aucun onglet ne s'ouvre sans un clic volontaire : le cadre du lecteur est restreint (sandbox sans allow-popups ni
   allow-top-navigation, voir musique-calcul.js) et un morceau refusé par le lecteur intégré est sauté, noté dans « Morceaux non lisibles »,
   jamais ouvert sur YouTube. Les publicités du lecteur restent affichées, dans la petite fenêtre, telles que YouTube les envoie.
   Commandes : voir commandes-or.js. Listes stockées sur l'appareil (localStorage, erreurs rattrapées) ; jamais par le Worker « rayle ». */
import { MIX, CLE_FIXE, CLE_PLAYLIST, CLE_NON_LISIBLES, lireListe, exporter, garder, retirer, fusionner, melanger, volumeBorne, estRefus, apresRefus, noterNonLisible, idPlaylistDepuisLien, urlLecteur, SANDBOX, PERMISSIONS } from './musique-calcul.js';
import { lireJSON, ecrireJSON, copier } from './stockage-or.js';
import { pluriel } from './texte-or.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sur = f => { try { return f(); } catch (e) { return null; } };
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
.mu-flash{position:absolute;left:6px;right:6px;top:34px;z-index:1;padding:6px 8px;border-radius:4px;background:rgba(5,8,12,.92);border:1px solid #e3b98f;color:#f3d9bf;font:12px system-ui;pointer-events:none}.mu-flash[hidden]{display:none}
.mu-lecteur{width:356px;height:200px}.mu-lecteur iframe{display:block;width:100%;height:100%;border:0}.mu-flot.mu-grand .mu-lecteur{width:min(854px,92vw);height:min(480px,52vw)}
.mu-lancer{position:fixed;inset:0;z-index:2147480001;display:flex;align-items:center;justify-content:center;background:rgba(2,4,8,.6)}
.mu-lancer button{font:600 26px system-ui;padding:22px 34px;border-radius:10px;background:#8fd0e3;color:#04121a;border:0;cursor:pointer}
.mu-liste{max-height:260px;overflow:auto;margin:6px 0;padding-left:22px}.mu-liste li{margin:2px 0}.mu-liste li.mu-cur{color:#8fd0e3}
.mu-pl{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}.mu-pl label{flex:1 1 260px;display:flex;flex-direction:column;gap:3px}.mu-pl input{width:100%;box-sizing:border-box}
@media (max-width:600px){.mu-flot{left:8px;right:8px;bottom:8px}.mu-lecteur{width:100%;height:200px}.mu-flot header span{max-width:none}}`;
const NOMS = { playlist: 'ta playlist YouTube', fixe: 'ta liste de morceaux', mix: 'le Mix' };

export function monterMusique(elDepart, { tableau = null, notifier, parler: dire, conteneurFlottant = document.body } = {}) {
  const note = notifier || (tableau ? tableau.notifier : () => {});
  if (!document.getElementById('mu-css')) { const s = document.createElement('style'); s.id = 'mu-css'; s.textContent = CSS; document.head.appendChild(s); }
  let fixe = lireJSON(CLE_FIXE, []); if (!Array.isArray(fixe)) fixe = [];
  let nonLisibles = lireJSON(CLE_NON_LISIBLES, []); if (!Array.isArray(nonLisibles)) nonLisibles = [];
  let maPlaylist = lireJSON(CLE_PLAYLIST, null); if (typeof maPlaylist !== 'string' || !idPlaylistDepuisLien(maPlaylist)) maPlaylist = null;
  let player = null, source = null, generation = 0, verif = null, minuteurFlash = null, volume = lireJSON('rayle_musique_volume', 60);
  let echecsSuite = 0, refuses = new Set(), secoursFait = false, file = { ids: [], pos: 0 };
  const sauver = () => { if (!ecrireJSON(CLE_FIXE, fixe)) note('Musique : impossible d’enregistrer la liste sur cet appareil (stockage refusé). Exporte-la.', { niveau: 'fort' }); };
  let el = elDepart;
  const rendreControles = () => { if (el) el.innerHTML = `<h2>Musique <small>lecteur officiel YouTube · « lance ma playlist », « joue le mix », « garde ce morceau »…</small></h2>
    <div class="mu-pl"><label>Lien de ma playlist YouTube<input type="text" data-m-pl inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://www.youtube.com/playlist?list=PL…  ou  PL…"></label><button type="button" data-m="pl_enregistrer">Enregistrer</button><button type="button" data-m="pl_oublier">Oublier</button></div>
    <div class="tor-actions"><button type="button" data-m="playlist">▶ Ma playlist</button><button type="button" data-m="mix">▶ Le Mix</button><button type="button" data-m="fixe">▶ Ma liste de morceaux</button><button type="button" data-m="pause">⏸</button><button type="button" data-m="reprendre">⏵</button><button type="button" data-m="precedent">⏮</button><button type="button" data-m="suivant">⏭</button><button type="button" data-m="volume_moins">🔉</button><button type="button" data-m="volume_plus">🔊</button><button type="button" data-m="muet">🔇</button><button type="button" data-m="melange">🔀</button><button type="button" data-m="stop">⏹</button><button type="button" data-m="garder">＋ Garde ce morceau</button><button type="button" data-m="retirer">－ Retire ce morceau</button></div>
    <p data-m-etat class="tor-doux"></p>
    <details data-m-nl-bloc><summary>Morceaux non lisibles (<span data-m-nl-n>0</span>)</summary><p class="tor-doux">Refusés par le lecteur intégré (l’auteur interdit l’intégration, vidéo privée ou supprimée) : ils sont sautés automatiquement. Remplace-les dans ta playlist.</p><ol class="mu-liste" data-m-nl></ol><div class="tor-actions"><button type="button" data-m="nl_vider">Vider la liste</button></div></details>
    <details><summary>Ma liste de morceaux (<span data-m-n>0 morceau</span>)</summary><ol class="mu-liste" data-m-liste></ol>
      <p class="tor-doux">Importer une liste : colle des liens YouTube, un par ligne (texte après « # » = titre).</p>
      <textarea data-m-import rows="4" style="width:100%" placeholder="https://www.youtube.com/watch?v=…&#10;https://youtu.be/… # titre"></textarea>
      <div class="tor-actions"><button type="button" data-m="importer">Importer</button><button type="button" data-m="exporter">Exporter ma liste (presse-papiers)</button></div></details>`;
    const i = q('[data-m-pl]'); if (i) { i.value = maPlaylist || ''; i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); surBouton('pl_enregistrer'); } }; }
  };
  const q = s => el && el.querySelector(s);
  const flot = document.createElement('section'); flot.className = 'mu-flot'; flot.hidden = true; flot.setAttribute('aria-label', 'Lecteur de musique');
  flot.innerHTML = '<header><span data-m-titre>Musique</span><button type="button" data-m="taille" title="Agrandir / réduire">⤢</button><button type="button" data-m="stop" title="Arrêter">✕</button></header><p class="mu-flash" data-m-flash role="status" hidden></p><div class="mu-lecteur"></div>';
  conteneurFlottant.appendChild(flot);
  rendreControles();
  function etat(t) { const e = q('[data-m-etat]'); if (e) e.textContent = t; }
  function flash(t, ms = 3500) { const f = flot.querySelector('[data-m-flash]'); f.textContent = t; f.hidden = false; clearTimeout(minuteurFlash); minuteurFlash = setTimeout(() => { f.hidden = true; }, ms); }
  function majListe() {
    const n = q('[data-m-n]'); if (n) n.textContent = pluriel(fixe.length, 'morceau', 'morceaux');
    const cur = player && player.getVideoData ? (sur(() => player.getVideoData()) || {}).video_id : null, L = q('[data-m-liste]');
    if (L) L.innerHTML = fixe.map(m => `<li class="${m.id === cur ? 'mu-cur' : ''}">${esc(m.titre || 'titre inconnu')} <small class="tor-doux">${m.id}</small></li>`).join('');
    const nn = q('[data-m-nl-n]'); if (nn) nn.textContent = nonLisibles.length;
    const NL = q('[data-m-nl]'); if (NL) NL.innerHTML = nonLisibles.map(m => `<li>${esc(m.titre || 'titre inconnu')} · <a href="https://www.youtube.com/watch?v=${m.id}" target="_blank" rel="noopener noreferrer">youtu.be/${m.id}</a>${m.code != null ? ` <small class="tor-doux">(erreur ${m.code})</small>` : ''}</li>`).join('');
  }
  function titreCourant() { try { const d = player.getVideoData(); return d && d.title ? { id: d.video_id, titre: d.title } : null; } catch (e) { return null; } }
  function majTitre() { const t = titreCourant(); flot.querySelector('[data-m-titre]').textContent = t ? ({ mix: 'Mix · ', playlist: 'Ma playlist · ', fixe: 'Ma liste · ' }[source] || '') + t.titre : 'Musique'; if (t) { const m = fixe.find(x => x.id === t.id && !x.titre); if (m) { m.titre = t.titre; sauver(); } } majListe(); diffuser(); }
  /* état minimal pour la télécommande (mode télé) */
  let surEtat = null; const diffuser = () => { if (surEtat) { const t = titreCourant(); surEtat({ titre: t ? t.titre : '', lecture: player && player.getPlayerState ? sur(() => player.getPlayerState()) === 1 : false, volume }); } };

  function grosBouton() {
    if (document.querySelector('.mu-lancer')) return;
    const d = document.createElement('div'); d.className = 'mu-lancer'; d.innerHTML = '<button type="button">▶ Lancer la musique</button>';
    d.querySelector('button').onclick = () => { d.remove(); try { player.playVideo(); } catch (e) { /* */ } };
    document.body.appendChild(d);
  }
  function surveillerDemarrage() {
    setTimeout(() => { try { const s = player.getPlayerState(); if (s !== 1 && s !== 3 && source) { grosBouton(); etat('Le navigateur a bloqué le démarrage du son : appuie sur « Lancer la musique ».'); } } catch (e) { /* */ } }, 2500);
  }
  function arreter(msg) {
    clearTimeout(verif); sur(() => player.stopVideo()); source = null; flot.hidden = true; const b = document.querySelector('.mu-lancer'); if (b) b.remove();
    if (msg) { etat(msg); note(msg, { niveau: 'fort', dit: false }); } diffuser(); return msg;
  }
  /* un morceau refusé par le lecteur intégré : noté, sauté ; arrêt net si tous échouent à la suite, en fin de liste, ou en cas de boucle */
  function surRefus(code) {
    const vd = sur(() => player.getVideoData()) || {};
    /* en mode « file » (un seul morceau par cadre, ordre tenu par Rayle) le morceau refusé est connu exactement ;
       sinon (liste native du lecteur : Mix, ma playlist YouTube) on lit sa position dans la liste du lecteur */
    const enFile = file.ids.length > 0, pl = enFile ? file.ids : (sur(() => player.getPlaylist()) || []);
    const i = enFile ? file.pos : sur(() => player.getPlaylistIndex()), idx = typeof i === 'number' && i >= 0 ? i : -1;
    const id = (enFile ? file.ids[file.pos] : vd.video_id || pl[idx]) || (source === 'mix' ? MIX.video : null) || null;
    const titre = (fixe.find(x => x.id === id) || {}).titre || vd.title || null, deja = !!id && refuses.has(id);
    if (id) refuses.add(id); echecsSuite++;
    if (id) { nonLisibles = noterNonLisible(nonLisibles, { id, titre, code, quand: new Date().toISOString() }); ecrireJSON(CLE_NON_LISIBLES, nonLisibles); majListe(); }
    if (source === 'playlist' && !pl.length && !secoursFait) return secours(`Ta playlist YouTube ne se lit pas dans Rayle (erreur ${code} : privée, introuvable ou refusée par le lecteur intégré). Je lance le Mix en secours.`);
    const d = apresRefus({ index: idx, longueur: pl.length, echecsSuite, dejaRefuse: deja });
    /* après un refus, le lecteur officiel reste figé sur son écran d'erreur (playVideoAt / nextVideo / loadPlaylist n'y font plus rien, mesuré) :
       on recrée le cadre sur le morceau suivant, en mode « file » (identifiants lus par getPlaylist), même source affichée */
    if (d.action === 'suivant') { flash('Morceau non lisible dans Rayle, passé.'); etat(`Morceau non lisible dans Rayle (erreur ${code}), passé : ${titre || id || 'titre inconnu'}.`); demarrer(source, pl, { pos: d.index }); return; }
    const nom = NOMS[source] || 'la liste';
    const msg = { tous: `Aucun morceau de ${nom} n’est lisible dans Rayle (${pluriel(echecsSuite, 'refus', 'refus')} à la suite) : lecture arrêtée. Remplace-les (panneau « Morceaux non lisibles »).`,
      fin: `Dernier morceau non lisible dans Rayle : fin de ${nom}.`, boucle: 'Ce morceau a déjà été refusé pendant cette lecture : arrêt, pour ne pas tourner en boucle.',
      seul: source === 'mix' ? 'Le Mix n’est pas lisible dans Rayle (refusé par le lecteur intégré) : lecture arrêtée. Colle le lien de ta playlist YouTube dans la fenêtre Musique.' : 'Ce morceau n’est pas lisible dans Rayle : lecture arrêtée.' }[d.raison];
    flash(msg, 6000); arreter(msg); const det = q('[data-m-nl-bloc]'); if (det) det.open = true;
  }
  function secours(msg) { secoursFait = true; flash(msg, 6000); etat(msg); note(msg, { niveau: 'fort', dit: false }); demarrer('mix'); return 'Ta playlist ne se lit pas ici, je lance le Mix.'; }
  /* mode « file » : morceau précédent / suivant / fin, tenu par Rayle */
  function aller(pos) {
    if (!file.ids.length) return false;
    if (pos >= file.ids.length) { arreter(`Fin de ${NOMS[source] || 'la liste'}.`); return true; }
    demarrer(source, file.ids, { pos: Math.max(0, pos) }); return true;
  }
  /* chaque lancement recrée le cadre RESTREINT puis y branche le lecteur officiel (YT.Player sur un iframe existant, méthode documentée).
     Liste de morceaux : UN SEUL morceau par cadre (mesuré : avec « playlist=… » dans l'adresse, un morceau refusé plus loin dans la liste
     fait échouer le cadre entier par une erreur 150 attribuée au premier, pourtant lisible) */
  async function demarrer(src, ids = [], reprise = null) {
    const L = ids.filter(Boolean).slice(0, 200), pos = reprise ? Math.min(reprise.pos || 0, Math.max(0, L.length - 1)) : 0;
    const url = L.length ? urlLecteur({ source: 'fixe', ids: [L[pos]], origine: location.origin }) : urlLecteur({ source: src, video: MIX.video, liste: src === 'mix' ? MIX.liste : maPlaylist, origine: location.origin });
    if (!url) return null;
    const g = ++generation; let YT;
    try { YT = await chargerApiYouTube(); } catch (e) { etat('Lecteur YouTube indisponible : ' + e.message); return null; }
    if (g !== generation) return null;
    clearTimeout(verif); sur(() => player && player.destroy()); player = null;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', SANDBOX); f.setAttribute('allow', PERMISSIONS); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.title = 'Lecteur YouTube'; f.src = url;
    flot.querySelector('.mu-lecteur').replaceChildren(f); flot.hidden = false;
    source = src; file = { ids: L, pos };
    if (!reprise) { echecsSuite = 0; refuses = new Set(); if (src !== 'mix') secoursFait = false; }
    return new Promise(ok => {
      const p = new YT.Player(f, { events: {
        onReady: () => { if (g !== generation) return; sur(() => p.setVolume(volume)); ok(p); },
        onStateChange: ev => { if (g !== generation) return; if (ev.data === 1) { echecsSuite = 0; const b = document.querySelector('.mu-lancer'); if (b) b.remove(); } if (ev.data === 0 && file.ids.length) { aller(file.pos + 1); return; } majTitre(); },
        onError: ev => { if (g !== generation) return; if (estRefus(ev.data)) surRefus(ev.data); else etat(`Erreur du lecteur YouTube (${ev.data}).`); }
      } });
      player = p;
      if (src === 'playlist' && !L.length) verif = setTimeout(() => { if (g !== generation || source !== 'playlist') return; const pl = sur(() => p.getPlaylist()) || [], s = sur(() => p.getPlayerState()); if (!pl.length && s !== 1 && s !== 3 && !secoursFait) secours('Ta playlist YouTube ne s’est pas chargée (privée, introuvable ou refusée par le lecteur intégré). Je lance le Mix en secours.'); }, 9000);
      surveillerDemarrage();
    });
  }
  async function lancer(quoi) {
    if (quoi === 'playlist' && !maPlaylist) { if (fixe.length) quoi = 'fixe'; else { demarrer('mix'); const m = 'Aucune playlist enregistrée : je lance le Mix. Colle le lien de ta playlist YouTube dans la fenêtre Musique.'; etat(m); return 'Aucune playlist enregistrée, je lance le Mix.'; } }
    if (quoi === 'fixe' && !fixe.length) { etat('Ta liste de morceaux est vide : lance le Mix et dis « garde ce morceau », ou importe des liens.'); return 'Ta liste de morceaux est vide. Lance le Mix et dis garde ce morceau, ou importe des liens.'; }
    if (quoi === 'mix') { demarrer('mix'); etat('Lecture du Mix YouTube.'); return 'Je lance le Mix.'; }
    if (quoi === 'playlist') { demarrer('playlist'); etat('Lecture de ta playlist YouTube.'); return 'Je lance ta playlist YouTube.'; }
    demarrer('fixe', fixe.map(m => m.id)); etat(`Lecture de ta liste de morceaux (${pluriel(fixe.length, 'morceau', 'morceaux')}).`);
    return `Je lance ta playlist, ${fixe.length} morceau${fixe.length > 1 ? 'x' : ''}.`;
  }
  async function commande(c) {
    const cmd = typeof c === 'string' ? c : c.cmd;
    if (cmd === 'playlist' || cmd === 'mix' || cmd === 'fixe') return lancer(cmd);
    if (cmd === 'combien') return `Il y a ${fixe.length} morceau${fixe.length > 1 ? 'x' : ''} dans ta liste.`;
    if (cmd === 'garder' || cmd === 'retirer' || cmd === 'quoi') {
      const t = player ? titreCourant() : null; if (!t) return player && source ? 'Le morceau charge encore, redemande dans une seconde.' : 'Aucun morceau en cours.';
      if (cmd === 'quoi') return `C’est ${t.titre}.`;
      const r = cmd === 'garder' ? garder(fixe, t) : retirer(fixe, t.id); fixe = r.liste; sauver(); majListe();
      return { ajoute: `${t.titre} est gardé dans ta liste (${fixe.length} morceau${fixe.length > 1 ? 'x' : ''}).`, deja: 'Ce morceau est déjà dans ta liste.', retire: `${t.titre} est retiré de ta liste.`, absent: 'Ce morceau n’est pas dans ta liste.', invalide: 'Je ne peux pas garder ce morceau.' }[r.etat];
    }
    if (!player || !source) return cmd === 'stop' ? 'La musique est déjà arrêtée.' : 'Aucune musique en cours. Dis « lance ma playlist ».';
    const p = player;
    switch (cmd) {
      case 'pause': p.pauseVideo(); return 'Pause.';
      case 'reprendre': p.playVideo(); surveillerDemarrage(); return 'Je reprends.';
      case 'suivant': if (!aller(file.pos + 1)) p.nextVideo(); return 'Morceau suivant.';
      case 'precedent': if (!aller(file.pos - 1)) p.previousVideo(); return 'Morceau précédent.';
      case 'volume_plus': case 'volume_moins': volume = volumeBorne((p.getVolume ? p.getVolume() : volume) + (cmd === 'volume_plus' ? 10 : -10)); p.setVolume(volume); if (p.isMuted && p.isMuted()) p.unMute(); ecrireJSON('rayle_musique_volume', volume); diffuser(); return `Volume ${volume}.`;
      case 'muet': if (p.isMuted && p.isMuted() || c.v === 0) { p.unMute(); return 'Son remis.'; } p.mute(); return 'Son coupé.';
      case 'melange': if (source === 'fixe') demarrer('fixe', melanger(fixe.map(m => m.id))); else if (file.ids.length) demarrer(source, melanger(file.ids)); else { p.setShuffle(true); p.nextVideo(); } return 'Lecture mélangée.';
      case 'stop': arreter('Musique arrêtée.'); return 'Musique arrêtée.';
    }
    return null;
  }
  async function surBouton(m) {
    if (m === 'taille') { flot.classList.toggle('mu-grand'); return; }
    if (m === 'pl_enregistrer') {
      const i = q('[data-m-pl]'), id = idPlaylistDepuisLien(i && i.value);
      if (!id) { etat('Lien non reconnu : colle un lien youtube.com/playlist?list=… (ou …watch?v=…&list=…), ou l’identifiant seul (PL…).'); return; }
      maPlaylist = id; if (i) i.value = id;
      etat(ecrireJSON(CLE_PLAYLIST, id) ? 'Playlist enregistrée sur cet appareil : « lance ma playlist » la lancera.' : 'Playlist gardée pour cette session seulement (stockage refusé par le navigateur).'); return;
    }
    if (m === 'pl_oublier') { maPlaylist = null; try { localStorage.removeItem(CLE_PLAYLIST); } catch (e) { /* */ } const i = q('[data-m-pl]'); if (i) i.value = ''; etat('Playlist oubliée : « lance ma playlist » lancera ta liste de morceaux, ou le Mix.'); return; }
    if (m === 'nl_vider') { nonLisibles = []; ecrireJSON(CLE_NON_LISIBLES, nonLisibles); majListe(); etat('Liste des morceaux non lisibles vidée.'); return; }
    if (m === 'importer') { const z = q('[data-m-import]'), r = lireListe(z.value), f = fusionner(fixe, r.morceaux); fixe = f.liste; sauver(); majListe(); z.value = ''; etat(`${pluriel(f.ajoutes, 'morceau ajouté', 'morceaux ajoutés')}${r.rejets.length ? `, ${pluriel(r.rejets.length, 'ligne non reconnue', 'lignes non reconnues')}` : ''}.`); return; }
    if (m === 'exporter') { const ok = await copier(exporter(fixe)); etat(ok ? `Liste copiée (${pluriel(fixe.length, 'lien', 'liens')}) : colle-la dans « Importer » sur l’autre appareil.` : 'Copie refusée par le navigateur.'); return; }
    const r = await commande({ cmd: m }); if (r) etat(r);
  }
  const surClic = e => { const b = e.target.closest('[data-m]'); if (b) surBouton(b.dataset.m); };
  for (const root of [el, flot]) if (root) root.addEventListener('click', surClic);
  majListe();
  /* tuile indépendante : les commandes s'affichent dans une fenêtre qu'on peut fermer sans couper la musique */
  function attacher(nouvel) { if (el) el.removeEventListener('click', surClic); el = nouvel; rendreControles(); if (el) el.addEventListener('click', surClic); majListe(); diffuser(); }
  const actif = () => !!player && source != null;
  return { commande, lancer, attacher, detacher: () => attacher(null), actif, liste: () => fixe.slice(), nonLisibles: () => nonLisibles.slice(), playlist: () => maPlaylist, titre: titreCourant, lecteur: () => player, source: () => source, surEtat(f) { surEtat = f; }, detruire() { clearTimeout(verif); generation++; try { player && player.destroy(); } catch (e) { /* */ } flot.remove(); } };
}
