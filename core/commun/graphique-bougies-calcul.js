"use strict";
/* ═════════════ GRAPHIQUE EN BOUGIES DE L'ACCUEIL : calculs purs (testés : galaxie/tests/graphique-bougies-test.mjs) ═════════════
   Rotation entre instruments et unités de temps, étiquette de fraîcheur, conversion des bougies pour Lightweight Charts, échelle des mini-courbes.
   Rien n'est inventé : une série vide ou en panne reste « indisponible ». Utilisable dans la page (window.GraphiqueBougiesCalcul) et sous Node (module.exports). */
(function (racine) {
  const INSTRUMENTS = ['BTC', 'SOL', 'DOGE', 'XAU', 'US100'];
  const UNITES = ['H1', 'M15', 'H4', 'D1'];
  const INTERVALLE_DEFAUT = 20, INTERVALLE_MIN = 5, INTERVALLE_MAX = 300;
  const BOUGIES_VISIBLES = { M15: 96, H1: 96, H4: 90, D1: 90 };

  const intervalleValide = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(INTERVALLE_MIN, Math.min(INTERVALLE_MAX, Math.round(n))) : INTERVALLE_DEFAUT; };

  /* n-ième paire de la rotation : on parcourt tous les instruments dans une unité, puis on change d'unité au tour suivant (« parfois les unités de temps »). */
  function paire(n, instruments = INSTRUMENTS, unites = UNITES) {
    const k = Math.max(0, Math.floor(n)), i = k % instruments.length, u = Math.floor(k / instruments.length) % unites.length;
    return { instrument: instruments[i], unite: unites[u] };
  }
  const indexDe = (inst, unite, instruments = INSTRUMENTS, unites = UNITES) => {
    const i = instruments.indexOf(inst), u = unites.indexOf(unite); return i < 0 || u < 0 ? -1 : u * instruments.length + i;
  };

  /* Étiquette de fraîcheur d'une série (serie = réponse du client de marché : { bougies, meta, erreur }). */
  function etiquette(serie) {
    if (!serie || !serie.bougies || !serie.bougies.length) return { etat: 'indispo', texte: 'INDISPONIBLE' };
    const m = serie.meta || {};
    if (m.perime || serie.erreur) return { etat: 'perime', texte: 'PÉRIMÉ' };
    if (m.secours) return { etat: 'secours', texte: 'SECOURS' };
    if (m.differe) return { etat: 'differe', texte: 'DIFFÉRÉ' };
    return { etat: 'reel', texte: 'RÉEL' };
  }

  /* Bougies du navigateur { t (ms), o, h, l, c, v } → données de Lightweight Charts (secondes), n dernières bougies. */
  function donneesGraphique(bougies, unite, couleurs = {}) {
    const n = BOUGIES_VISIBLES[unite] || 96, b = (bougies || []).slice(-n);
    const haut = couleurs.haut || 'rgba(127,227,176,.32)', bas = couleurs.bas || 'rgba(255,138,138,.32)';
    return {
      bougies: b.map(x => ({ time: Math.floor(x.t / 1000), open: x.o, high: x.h, low: x.l, close: x.c })),
      volumes: b.map(x => ({ time: Math.floor(x.t / 1000), value: x.v, color: x.c >= x.o ? haut : bas })),
      avecVolume: b.some(x => x.v > 0)
    };
  }

  const prix = (v, dec) => v == null || !Number.isFinite(v) ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function variation(pct) {
    if (pct == null || !Number.isFinite(pct)) return { texte: '—', sens: 'neutre' };
    const s = pct > 0.005 ? 'hausse' : pct < -0.005 ? 'baisse' : 'neutre';
    return { texte: (pct > 0 ? '+' : '') + pct.toFixed(2).replace('.', ',') + ' %', sens: s };
  }

  /* Échelle verticale d'une mini-courbe : une série très calme (l'or sur quelques heures) ne doit pas être étirée jusqu'à ressembler à un zigzag :
     l'amplitude affichée vaut au moins `plancher` (0,5 %) du niveau moyen. Renvoie { min, max }. */
  function echelle(valeurs, plancher = 0.005) {
    const v = (valeurs || []).filter(Number.isFinite); if (v.length < 2) return null;
    let min = Math.min(...v), max = Math.max(...v); const moy = v.reduce((a, b) => a + b, 0) / v.length, mini = Math.abs(moy) * plancher;
    if (max - min < mini) { const c = (max + min) / 2; min = c - mini / 2; max = c + mini / 2; }
    return { min, max };
  }
  /* Mini-courbe SVG : chemin lissé (moyenne mobile sur 3 points) avec l'échelle plancher. */
  function courbe(valeurs, l, h, marge = 2, plancher = 0.005) {
    const v = (valeurs || []).filter(Number.isFinite); if (v.length < 2) return null;
    const e = echelle(v, plancher), lisse = v.map((x, i) => { const a = v[Math.max(0, i - 1)], c = v[Math.min(v.length - 1, i + 1)]; return (a + x + c) / 3; });
    const pas = (l - 2 * marge) / (v.length - 1), p = e.max - e.min || 1;
    const pts = lisse.map((y, i) => [+(marge + i * pas).toFixed(1), +(marge + (h - 2 * marge) * (1 - (y - e.min) / p)).toFixed(1)]);
    return { d: 'M' + pts.map(q => q.join(' ')).join(' L'), dernier: pts[pts.length - 1], sens: v[v.length - 1] >= v[0] ? 1 : -1, n: v.length };
  }

  const api = { INSTRUMENTS, UNITES, INTERVALLE_DEFAUT, INTERVALLE_MIN, INTERVALLE_MAX, BOUGIES_VISIBLES, intervalleValide, paire, indexDe, etiquette, donneesGraphique, prix, variation, echelle, courbe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else racine.GraphiqueBougiesCalcul = api;
})(typeof window !== 'undefined' ? window : globalThis);
