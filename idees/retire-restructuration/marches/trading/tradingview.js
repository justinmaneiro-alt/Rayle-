import { INSTRUMENTS, UNITES } from './instruments.js';

/* ═════════════ WIDGET TRADINGVIEW (mode par défaut de l'espace de travail ; le graphique maison est le 2e mode) ═════════════
   Même widget que l'ancien terminal (script tv.js de TradingView, gratuit, sans clé) : thème sombre, fuseau Paris, barre de dessin, MA 200 (EMA, longueur 200 imposée
   par les « studies ») ET RSI 14 préchargés. Le widget est une fenêtre externe (iframe) : la page ne peut pas lire ce qu'il affiche, ni le piloter après coup ;
   changer d'instrument ou d'unité le recrée. Si le script est bloqué (réseau, bloqueur de pubs), on le dit et on propose le graphique Raylé. */
export const URL_TV = 'https://s3.tradingview.com/tv.js';
export const DELAI_CHARGEMENT_MS = 12000;

/* Configuration du widget pour un instrument + une unité (fonction pure, testée). */
export function configurationTV(idInstrument, idUnite, conteneurId) {
  const ins = INSTRUMENTS[idInstrument], un = UNITES[idUnite];
  if (!ins || !ins.tv || !un) return null;
  return {
    container_id: conteneurId, autosize: true, symbol: ins.tv, interval: un.tv, timezone: 'Europe/Paris', locale: 'fr', theme: 'dark', style: '1', toolbar_bg: '#0a0710',
    hide_top_toolbar: false, hide_side_toolbar: false, allow_symbol_change: false, enable_publishing: false, save_image: true, withdateranges: true,
    studies: [{ id: 'MAExp@tv-basicstudies', version: 60, inputs: { length: 200, in_0: 200 } }, { id: 'RSI@tv-basicstudies', version: 60, inputs: { length: 14 } }],
    studies_overrides: { 'moving average exponential.plot.color': '#ff3399', 'moving average exponential.plot.linewidth': 2 },
    overrides: { 'paneProperties.background': '#06040b', 'paneProperties.backgroundType': 'solid', 'paneProperties.vertGridProperties.color': 'rgba(255,0,127,0.06)', 'paneProperties.horzGridProperties.color': 'rgba(255,0,127,0.06)' }
  };
}

let promesseScript = null;
function chargerScript(fenetre = window, delai = DELAI_CHARGEMENT_MS) {
  if (fenetre.TradingView && fenetre.TradingView.widget) return Promise.resolve();
  if (promesseScript) return promesseScript;
  promesseScript = new Promise((ok, ko) => {
    const sc = fenetre.document.createElement('script'); sc.src = URL_TV; sc.async = true;
    const arret = setTimeout(() => { promesseScript = null; sc.remove(); ko(new Error('délai dépassé')); }, delai);
    sc.onload = () => { clearTimeout(arret); ok(); };
    sc.onerror = () => { clearTimeout(arret); promesseScript = null; ko(new Error('script bloqué')); };
    fenetre.document.head.appendChild(sc);
  });
  return promesseScript;
}

/* Un widget dans `boite`. Rend { definir(instrument, unite), etat(), detruire() }. */
export function creerTradingView({ boite, fenetre = window, surAlternative = null }) {
  let jeton = 0, courant = null, erreur = null, pret = false, detruit = false, enAttente = null, garde = null, secours = false, arretTaille = null;
  const idInterne = 'tv-mars-' + Math.random().toString(36).slice(2, 8);
  async function definir(instrument, unite) {
    const cfg = configurationTV(instrument, unite, idInterne);
    if (!cfg) return false;
    courant = { instrument, unite, symbole: cfg.symbol, intervalle: cfg.interval };
    const mon = ++jeton; erreur = null; pret = false;
    boite.innerHTML = '<div id="' + idInterne + '" style="width:100%;height:100%"></div><div class="tg-tv-etat" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9bc4d6;pointer-events:none">Chargement de TradingView…</div>';
    secours = false; if (garde) garde.arreter(); garde = null; if (arretTaille) { arretTaille(); arretTaille = null; }
    const G = fenetre.TVGarde;
    if (G) garde = G.surveiller({ fenetre, surPret: () => { if (mon !== jeton || detruit) return; fenetre.setTimeout(() => { if (mon === jeton && !detruit) G.ajusterTaille(boite); }, 1200); if (arretTaille) arretTaille(); arretTaille = G.suivreTaille(boite); }, surEchec: () => { if (mon === jeton && !detruit) { secours = true; erreur = 'aucun message du widget'; G.afficherSecours(boite, { symbole: cfg.symbol, intervalle: cfg.interval, reessayer: () => definir(instrument, unite), alternative: surAlternative, libelleAlt: 'Graphique Raylé' }); } } });   // un cadre resté vide ne donne aucune erreur : sans message du widget dans les 15 s, message de secours visible
    try { await chargerScript(fenetre); }
    catch (e) { if (mon !== jeton || detruit) return false; erreur = e.message; boite.innerHTML = '<div class="tg-etat" style="display:flex">Graphique TradingView indisponible (' + e.message + ' : réseau ou bloqueur). Utilise le mode « Raylé » (bouton en haut).</div>'; if (garde) garde.arreter(); if (fenetre.TVGarde) fenetre.TVGarde.afficherSecours(boite, { symbole: cfg.symbol, intervalle: cfg.interval, raison: 'Le script TradingView est bloqué (' + e.message + ') : réseau, pare-feu ou bloqueur de publicités.', reessayer: () => definir(instrument, unite), alternative: surAlternative, libelleAlt: 'Graphique Raylé' }); return false; }
    if (mon !== jeton || detruit) return false;
    try { new fenetre.TradingView.widget(cfg); pret = true; const etat = boite.querySelector('.tg-tv-etat'); if (etat) setTimeout(() => etat.remove(), 1500); }
    catch (e) { erreur = String(e.message || e); boite.innerHTML = '<div class="tg-etat" style="display:flex">Graphique TradingView indisponible : ' + erreur + '</div>'; return false; }
    return true;
  }
  return { definir, etat: () => ({ ...courant, pret, erreur, secours }), detruire() { detruit = true; jeton++; if (garde) garde.arreter(); if (arretTaille) arretTaille(); boite.innerHTML = ''; } };
}
