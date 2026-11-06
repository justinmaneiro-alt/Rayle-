/* ═════════════ ONGLET « GRAPHIQUE KRAKEN » : widget gratuit de TradingView (script tv.js, sans clé), symboles KRAKEN ═════════════
   Conditions d'utilisation des widgets TradingView (vérifiées le 2026-11-05) : gratuits sur un site ou une application, à condition de garder le
   logo et le lien d'attribution « TradingView » visibles et de ne pas modifier les données ; la page ne lit rien du widget (iframe externe).
   Symboles vérifiés le 2026-11-05 avec la recherche de symboles de TradingView (bourse KRAKEN) : perpétuels « .PM » = mêmes instruments que l'agent.
   Le graphique copilote (avec les zones et les niveaux) reste l'affichage principal ; ce widget n'a ni zones ni niveaux du copilote. */
export const URL_TV = 'https://s3.tradingview.com/tv.js';
export const SYMBOLES_TV = Object.freeze({
  BTC: 'KRAKEN:BTCUSD.PM', ETH: 'KRAKEN:ETHUSD.PM', HYPE: 'KRAKEN:HYPEUSD.PM',
  OR: 'KRAKEN:XAUUSD.PM',          // or : perpétuel PF_XAUUSD (existe chez TradingView ; spot PAXG / XAUT seulement en jetons)
  SP500: 'KRAKEN:SPYXUSD.PM',      // jeton SPYx (pas l'indice S&P 500 : Kraken n'a pas de perpétuel sur l'indice)
  NASDAQ: 'KRAKEN:QQQXUSD.PM'      // jeton QQQx (l'indice existe aussi : KRAKEN:US100USD.PM, non utilisé par l'agent)
});
const INTERVALLES = { M15: '15', H1: '60' };

export function configurationKraken(actif, unite, conteneurId) {
  const symbol = SYMBOLES_TV[actif]; if (!symbol) return null;
  return { container_id: conteneurId, autosize: true, symbol, interval: INTERVALLES[unite] || '15', timezone: 'Europe/Paris', locale: 'fr', theme: 'dark', style: '1',
    hide_side_toolbar: false, allow_symbol_change: false, enable_publishing: false, withdateranges: true, save_image: false, details: false };
}

let promesse = null;
function chargerScript() {
  if (window.TradingView && window.TradingView.widget) return Promise.resolve();
  return promesse || (promesse = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = URL_TV; s.async = true;
    const minuterie = setTimeout(() => { promesse = null; ko(new Error('le widget TradingView ne répond pas (réseau ou bloqueur)')); }, 12000);
    s.onload = () => { clearTimeout(minuterie); ok(); }; s.onerror = () => { clearTimeout(minuterie); promesse = null; ko(new Error('script TradingView bloqué ou hors ligne')); };
    document.head.appendChild(s);
  }));
}

export function creerGraphiqueKraken(boite) {
  let cle = null, n = 0;
  async function afficher(actif, unite) {
    const k = actif + '|' + unite; if (k === cle) return; cle = k;
    const cfg = configurationKraken(actif, unite, 'at-tv-' + (++n));
    if (!cfg) { boite.innerHTML = `<p class="at-tv-msg">Pas de symbole Kraken chez TradingView pour ${actif} : utilisez le graphique copilote.</p>`; return; }
    boite.innerHTML = `<div class="at-tv-cadre" id="${cfg.container_id}"></div><p class="at-tv-pied">Graphique <a href="https://fr.tradingview.com/symbols/${cfg.symbol.replace(':', '-')}/" target="_blank" rel="noopener">${cfg.symbol}</a> par TradingView · sans les zones du copilote</p>`;
    try { await chargerScript(); if (cle !== k) return; new window.TradingView.widget(cfg); }
    catch (e) { boite.innerHTML = `<p class="at-tv-msg">Graphique Kraken indisponible : ${String(e.message || e)}. Le graphique copilote reste disponible.</p>`; cle = null; }
  }
  return { afficher, oublier() { cle = null; boite.innerHTML = ''; } };
}
