/* ═════════════ LECTEUR DE RAPPORTS (v11) : branche le moteur sur la vraie voix de Rayle, les vraies données et le vrai écran ═════════════
   Voix : la voix UNIQUE de l'application (`speak`, Azure Vivienne puis Piper en secours) : une requête par étape ; l'animation suit la lecture segment par segment grâce à l'horloge du lecteur audio ;
   l'étape suivante est préparée (données + voix en cache) pendant que l'étape en cours est lue. Aucune voix du système, aucun speechSynthesis. */
import { creerMoteur, SILENCE } from './moteur.js';
import { creerEcran } from './ecran.js';
import * as Actions from '../cerveau/actions.js';
import { OUTILS } from '../cerveau/outils.js';
import { lireActifPro, lireCot, lireCalendrier, lireSnapshot } from '../commun/donnees.js';

const ATT = ms => new Promise(r => setTimeout(r, ms));
const CPS = 14.5;   // caractères parlés par seconde (repli quand la durée réelle du son n'est pas connue)

export function creerLecteurReel() {
  const W = window;
  const src = {
    pro: async id => (await lireActifPro(id, { delai: 25000 })).donnees,
    outil: async (nom, args) => { const f = OUTILS[nom]; if (!f) return { indisponible: 'outil inconnu : ' + nom }; try { return await f(args || {}); } catch (e) { return { indisponible: 'erreur ' + nom + ' : ' + String((e && e.message) || e).slice(0, 90) }; } },
    cot: async inst => (await lireCot(inst, { delai: 15000 })).donnees,
    calendrier: async () => (await lireCalendrier({ delai: 15000 })).donnees,
    macro: async () => (await lireSnapshot('marches-macro.json', { delai: 12000, valider: d => (d && d.sections ? true : 'panneau vide') })).donnees,
    statsFleches: async () => { const r = await fetch(new URL('../terminal/stats-fleches.json', import.meta.url).href); return r.json(); },
    maintenant: () => Date.now()
  };
  const audio = () => (typeof audioEl !== 'undefined' ? audioEl : null);
  const jeton = () => (typeof speakToken !== 'undefined' ? speakToken : 0);
  const parle = () => (typeof speaking !== 'undefined' ? speaking : false);
  let pauseSrc = null, vitesse = 1;

  async function parler(texte, { surProgression } = {}) {
    const a = audio(), v = vitesse; let events = 0, pret = false, t0 = Date.now(), pausee = 0, tPause = 0;
    const surParole = () => { events++; pret = events === 1; if (pret && a) { try { a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true; a.defaultPlaybackRate = v; a.playbackRate = v; } catch (e) { /* */ } } };
    W.addEventListener('rayle:parole', surParole);
    const iv = setInterval(() => {
      try { const e = moteur.etat(); if (e && e.actif && e.pause && a && !a.paused && !pauseSrc) env.pauseVoix(); } catch (x) { /* le moteur n'est pas encore là */ }   // pause demandée avant que le son ne démarre
      if (a && a.paused && pauseSrc) { if (!tPause) tPause = Date.now(); return; } if (tPause) { pausee += Date.now() - tPause; tPause = 0; }
      let f; if (pret && a && a.duration > 0 && isFinite(a.duration)) f = a.currentTime / a.duration; else f = Math.min(0.97, (Date.now() - t0 - pausee) / 1000 / (texte.length / (CPS * v)));
      try { surProgression && surProgression(Math.max(0, Math.min(1, f))); } catch (e) { /* */ }
    }, 100);
    let p; try { p = W.speak(texte); } catch (e) { p = Promise.resolve(); }
    const tok = jeton();   // speak() incrémente son jeton tout de suite : si un autre texte prend la parole, le jeton change
    try { await p; } catch (e) { /* la voix indisponible n'arrête pas la visite : le texte reste à l'écran */ }
    clearInterval(iv); W.removeEventListener('rayle:parole', surParole);
    return { interrompu: jeton() !== tok };
  }
  const env = {
    src, store: W.localStorage, maintenant: () => Date.now(),
    quota: () => { try { return W.VoixMoteurs && W.VoixMoteurs.quotaAzure ? W.VoixMoteurs.quotaAzure() : null; } catch (e) { return null; } },
    parler,
    pauseVoix() { const a = audio(); if (a && !a.paused) { pauseSrc = a.src; try { a.pause(); } catch (e) { /* */ } } },
    reprendreVoix() { const a = audio(); if (a && pauseSrc && a.src === pauseSrc && !a.ended) { try { const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ } } pauseSrc = null; },
    arreterVoix() { pauseSrc = null; try { if (typeof cancelSpeech === 'function') cancelSpeech(); } catch (e) { /* */ } },
    voixLibre: async () => { const t0 = Date.now(); while (parle() && Date.now() - t0 < 5000) await ATT(100); },
    prechauffer(texte) { try { if (typeof W.preparerParole === 'function') W.preparerParole(texte); } catch (e) { /* facultatif */ } },
    vitesse(v) { vitesse = v; const a = audio(); if (a && !a.paused) { try { a.preservesPitch = true; a.playbackRate = v; } catch (e) { /* */ } } },
    annoter: async liste => Actions.executerAction('annoter_graphique', { annotations: liste })
  };
  const ecran = creerEcran({ document, actions: Actions, quota: env.quota });
  env.ecran = ecran;
  const moteur = creerMoteur(env); ecran.lier(moteur);
  return { moteur, ecran, env, SILENCE };
}
