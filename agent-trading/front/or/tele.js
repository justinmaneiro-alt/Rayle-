/* ═════════════ MODE TÉLÉ (or.html?tele=1, adresse courte /tv) : mise en page « 10 pieds », 100 % gratuit ═════════════
   Textes très grands, contraste élevé, aucun survol, navigation aux flèches de la télécommande (OK = valider), écran gardé allumé (Wake Lock),
   plein écran au premier appui. Contenu : graphique de l'or avec zones et niveaux (mêmes modules que le tableau de bord), fil « Ce qui se passe »,
   lecteur de musique (même playlist sur cet appareil), Terre classique allégée, heure et météo, adresse courte, QR code et code d'appairage. */
import { creerMoteurOr } from './moteur-or.js';
import { creerGraphiqueOr } from './graphique-or.js';
import { monterMusique } from './musique.js';
import { creerLien } from './tele-lien.js';
import { ADRESSE_COURTE, urlTelecommande, toucheVersAction, voisin, texteMeteo } from './tele-calcul.js';
import { heureParis } from './temps-or.js';
import { esc, nb, parler } from './tableau-or.js';
import { lireJSON } from './stockage-or.js';

const CSS = `
html,body{background:#000}
.tv{--t:#f2f6f8;--d:#9fb0b8;--a:#8fd0e3;--s:#e0c27f;position:fixed;inset:0;display:grid;grid-template-rows:auto 1fr auto;color:var(--t);background:#000;font:28px/1.3 system-ui,'Segoe UI',sans-serif;overflow:hidden;cursor:none}
.tv-haut{display:flex;align-items:center;gap:40px;padding:18px 40px;border-bottom:2px solid #1d2a32}
.tv-heure{font:700 64px ui-monospace,Consolas,monospace;letter-spacing:.02em}
.tv-meteo{color:var(--d)}
.tv-or{margin-left:auto;text-align:right}.tv-or b{font:700 54px ui-monospace,monospace}.tv-or small{display:block;color:var(--d);font-size:22px}
.tv-appairage{display:flex;align-items:center;gap:22px;padding-left:30px;border-left:2px solid #1d2a32}
.tv-appairage canvas{width:150px;height:150px;background:#fff;padding:8px;border-radius:6px;image-rendering:pixelated}
.tv-code{font:700 60px ui-monospace,monospace;color:var(--s);letter-spacing:.12em}
.tv-adr{font-size:22px;color:var(--d)}
.tv-milieu{display:grid;grid-template-columns:1fr 560px;min-height:0}
.tv-vue{position:relative;min-height:0}.tv-vue>div{position:absolute;inset:0}
.tv-cote{border-left:2px solid #1d2a32;padding:20px 26px;display:flex;flex-direction:column;gap:18px;min-height:0;overflow:hidden}
.tv-cote h2{margin:0;font-size:26px;color:var(--a);letter-spacing:.06em;text-transform:uppercase}
.tv-lecture{font-size:28px}
.tv-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;overflow:hidden;font-size:24px}
.tv-fil time{color:var(--d);margin-right:10px;font-family:ui-monospace,monospace}
.tv-musique{font-size:24px;color:var(--d)}.tv-musique b{color:var(--t)}
.tv-bas{display:flex;gap:16px;padding:14px 40px;border-top:2px solid #1d2a32;flex-wrap:wrap}
.tv-bas button{font:600 28px system-ui;color:var(--t);background:#0d151b;border:3px solid #22323c;border-radius:12px;padding:14px 26px;min-width:120px}
.tv-bas button.focus,.tv-bas button:focus{outline:none;border-color:var(--s);background:#1b2730;transform:scale(1.06)}
.tv-bandeau{position:absolute;left:24px;top:16px;z-index:3;font-size:24px;color:var(--s);background:rgba(0,0,0,.75);padding:6px 14px;border-radius:8px}
.tv-msg{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9;background:#0d151b;border:3px solid var(--a);border-radius:14px;padding:16px 28px;font-size:30px;max-width:80vw}
.tv .mu-flot{right:30px;bottom:110px}.tv .mu-flot .mu-lecteur{width:480px;height:270px}
`;
export async function monterTele(el) {
  if (!document.getElementById('tv-css')) { const s = document.createElement('style'); s.id = 'tv-css'; s.textContent = CSS; document.head.appendChild(s); }
  document.title = 'Rayle · Télé';
  el.innerHTML = `<div class="tv">
    <header class="tv-haut"><div class="tv-heure" data-heure>--:--</div><div class="tv-meteo" data-meteo>Météo…</div>
      <div class="tv-or"><b data-prix>—</b><small>Or · Kraken PF_XAUUSD · <span data-var></span></small></div>
      <div class="tv-appairage"><canvas data-qr width="200" height="200" aria-label="QR code de la télécommande"></canvas><div><div class="tv-adr">Télécommande : ${esc(ADRESSE_COURTE.replace('/tv', '/tc'))}</div><div class="tv-code" data-code>····</div><div class="tv-adr" data-lien>connexion…</div><div class="tv-adr">Cette page : ${esc(ADRESSE_COURTE)}</div></div></div></header>
    <main class="tv-milieu"><section class="tv-vue"><p class="tv-bandeau" data-bandeau hidden></p><div data-graph></div><div data-terre hidden></div></section>
      <aside class="tv-cote"><h2>Lecture</h2><p class="tv-lecture" data-lecture>Chargement des données de l’or…</p><h2>Ce qui se passe</h2><ol class="tv-fil" data-fil></ol><h2>Musique</h2><p class="tv-musique" data-musique>Arrêtée</p></aside></main>
    <nav class="tv-bas" data-boutons>
      <button data-b="or">Or</button><button data-b="terre">Terre</button><button data-b="playlist">▶ Ma playlist</button><button data-b="mix">▶ Le Mix</button><button data-b="pause_reprendre">⏯</button><button data-b="suivant">⏭</button><button data-b="volume_moins">🔉</button><button data-b="volume_plus">🔊</button><button data-b="plein">Plein écran</button><button data-b="caster" hidden>Caster sur la télé</button>
    </nav></div>`;
  const R = el.firstElementChild, q = s => R.querySelector(s);
  const fil = []; const ajouterFil = (texte, t = Date.now()) => { fil.unshift({ texte, t }); fil.length = Math.min(fil.length, 12); q('[data-fil]').innerHTML = fil.map(x => `<li><time>${heureParis(x.t)}</time>${esc(x.texte)}</li>`).join(''); };
  let bulle = null; const message = t => { clearTimeout(bulle); let m = q('.tv-msg'); if (!m) { m = document.createElement('div'); m.className = 'tv-msg'; R.appendChild(m); } m.textContent = t; bulle = setTimeout(() => m.remove(), 5000); };

  // or : mêmes modules que le tableau de bord
  const graph = creerGraphiqueOr(q('[data-graph]'), { mobile: false });
  const moteur = creerMoteurOr({ etudeAuto: false, surMaj: S => {
    graph.bougies(moteur.serie(), S.hist ? S.refP : S.periode === 'M15' ? S.refM15 : S.refP, { cle: S.periode + (S.hist ? ':historique' : ':court'), debutKraken: S.hist && S.k.length ? S.k[0].t : null, ecart: S.ecart }); graph.dessin({ zonesVol: S.zonesVol, niveaux: S.niveaux, retournement: S.zones, prix: S.prix });
    q('[data-prix]').textContent = nb(S.prix); const o = S.ticker && S.ticker.open24h; q('[data-var]').textContent = S.prix && o ? `${S.prix >= o ? '+' : ''}${nb((S.prix / o - 1) * 100)} % sur 24 h` : '';
    if (S.lecture) q('[data-lecture]').textContent = S.lecture.phrase;
    const b = q('[data-bandeau]'), msg = S.marche && !S.marche.ouvert ? S.marche.texte : S.retard && S.retard.enRetard ? S.retard.texte : null; b.hidden = !msg; b.textContent = msg || '';
  }, surEvenement: ev => { if (ev.dit) ajouterFil(ev.texte, ev.t); } });
  moteur.demarrer().then(S => { if (S.lecture) ajouterFil(S.lecture.etat); }).catch(e => ajouterFil('Données de l’or indisponibles : ' + e.message));
  graph.couches({ volume: true, sr: true, retournement: true });

  // musique (même playlist que cet appareil)
  const musique = monterMusique(null, { notifier: t => { ajouterFil(t); message(t); }, conteneurFlottant: R });
  musique.surEtat(e => { q('[data-musique]').innerHTML = e.titre ? `<b>${esc(e.titre)}</b> · ${e.lecture ? 'en lecture' : 'en pause'} · volume ${e.volume}` : 'Arrêtée'; lien.envoyer({ t: 'etat', titre: e.titre || '', lecture: !!e.lecture, volume: e.volume }); });

  // Terre classique allégée (chargée à la demande)
  let terre = null, vue = 'or';
  async function afficher(v) {
    vue = v; q('[data-graph]').hidden = v !== 'or'; q('[data-terre]').hidden = v !== 'terre'; q('[data-bandeau]').style.visibility = v === 'or' ? '' : 'hidden';
    if (v === 'terre' && !terre) { try { const m = await import('./terre-tele.js'); terre = await m.creerTerreTele(q('[data-terre]')); } catch (e) { message('Terre indisponible sur cette télé : ' + e.message); } }
    if (terre) terre.pause(v !== 'terre');
    lien.envoyer({ t: 'etat', vue: v });
  }
  async function executer(cmd) {
    if (cmd === 'or' || cmd === 'terre') { afficher(cmd); return; }
    if (cmd === 'musique') cmd = 'playlist';
    if (cmd === 'pause_reprendre') { const p = musique.lecteur(); cmd = p && p.getPlayerState && p.getPlayerState() === 1 ? 'pause' : 'reprendre'; }
    if (cmd === 'plein') { pleinEcran(); return; }
    if (cmd === 'caster') { caster(); return; }
    const r = await musique.commande({ cmd }); if (r) message(r);
  }

  // appairage
  let dernierQr = null;
  const lien = creerLien({ role: 'tele', surMessage: m => { if (m.t === 'cmd' && m.cmd !== 'ping') { ajouterFil('Télécommande : ' + m.cmd.replace('_', ' ')); executer(m.cmd); } }, surEtat: e => {
    q('[data-code]').textContent = e.code; q('[data-lien]').textContent = { 'en attente': 'en attente d’une télécommande', 'appairé': 'télécommande connectée', connexion: 'connexion…', reconnexion: 'reconnexion…', erreur: 'relais indisponible' }[e.etat] || e.etat;
    if (e.etat === 'appairé') message('Télécommande connectée.'); dessinerQr(urlTelecommande(e.code));
  } });
  async function dessinerQr(texte) {
    if (texte === dernierQr) return; dernierQr = texte;
    if (!globalThis.QrMatrice) await new Promise(ok => { const s = document.createElement('script'); s.src = new URL('../../../core/gestes/qr-matrice.js', import.meta.url).href; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });
    if (!globalThis.QrMatrice) return; const M = QrMatrice.matriceQR(texte), c = q('[data-qr]'), x = c.getContext('2d'), n = M.length, k = Math.floor(200 / (n + 2));
    c.width = c.height = k * (n + 2); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (M[y][i]) x.fillRect((i + 1) * k, (y + 1) * k, k, k);
  }

  // heure, météo (Open-Meteo, gratuit, sans clé ; ville de l'appareil si connue, sinon Paris)
  const tic = () => { q('[data-heure]').textContent = heureParis(Date.now()); }; tic(); const minuteur = setInterval(tic, 10e3);
  async function meteo() {
    const v = lireJSON('rayle_or_tele_ville', null) || { nom: 'Paris', lat: 48.8566, lon: 2.3522 };
    try { const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&current=temperature_2m,weather_code&timezone=Europe%2FParis`)).json(); q('[data-meteo]').textContent = `${v.nom} ${Math.round(d.current.temperature_2m)} °C · ${texteMeteo(d.current.weather_code)}`; }
    catch (e) { q('[data-meteo]').textContent = 'Météo indisponible'; }
  }
  meteo(); const minuteurMeteo = setInterval(meteo, 15 * 60e3);

  // écran jamais en veille
  let verrou = null; const garderAllume = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') verrou = await navigator.wakeLock.request('screen'); } catch (e) { /* refusé : la télé gère sa veille */ } };
  garderAllume(); document.addEventListener('visibilitychange', garderAllume);
  function pleinEcran() { try { (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement); } catch (e) { message('Plein écran refusé par le navigateur.'); } garderAllume(); }

  // API Presentation de Chrome (gratuite) : « Caster sur la télé » quand elle existe ; sinon le code d'appairage reste la solution
  const PR = typeof window.PresentationRequest === 'function' ? new PresentationRequest([location.href.replace(/([?&])tele=1/, '$1tele=1')]) : null;
  if (PR) { q('[data-b="caster"]').hidden = false; PR.getAvailability && PR.getAvailability().then(a => { const maj = () => { q('[data-b="caster"]').hidden = !a.value; }; maj(); a.onchange = maj; }).catch(() => { /* disponibilité inconnue : bouton laissé */ }); }
  async function caster() { if (!PR) { message('Caster n’est pas disponible ici : ouvre l’adresse courte sur la télé et utilise le code.'); return; } try { await PR.start(); message('Page envoyée à la télé.'); } catch (e) { message('Cast impossible (' + e.name + ') : utilise le code d’appairage.'); } }

  // navigation à la télécommande : flèches + OK, aucune souris nécessaire
  const boutons = () => [...R.querySelectorAll('[data-b]')].filter(b => !b.hidden);
  let iFocus = 0; const focus = i => { const L = boutons(); iFocus = Math.max(0, Math.min(L.length - 1, i)); L.forEach((b, k) => b.classList.toggle('focus', k === iFocus)); L[iFocus] && L[iFocus].focus({ preventScroll: true }); };
  let premierAppui = true;
  const touche = e => {
    const a = toucheVersAction(e); if (!a) return; e.preventDefault();
    if (premierAppui && (a.ok || a.nav)) { premierAppui = false; pleinEcran(); }
    if (a.nav) { const L = boutons(), pos = L.map(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; }); focus(voisin(pos, iFocus, a.nav)); }
    else if (a.ok) { const b = boutons()[iFocus]; if (b) executer(b.dataset.b); }
    else if (a.cmd) executer(a.cmd);
  };
  document.addEventListener('keydown', touche);
  R.addEventListener('click', e => { const b = e.target.closest('[data-b]'); if (b) { iFocus = boutons().indexOf(b); focus(iFocus); executer(b.dataset.b); } });
  focus(0);
  const api = { R, moteur, musique, lien, executer, afficher, vue: () => vue, terre: () => terre, detruire() { clearInterval(minuteur); clearInterval(minuteurMeteo); document.removeEventListener('keydown', touche); lien.fermer(); moteur.arreter(); musique.detruire(); terre && terre.detruire(); graph.detruire(); el.innerHTML = ''; } };
  window.__tele = api; return api;
}
