/* Surimpression de la carte de liquidité sur le graphique « Raylé » du terminal (V4, phase 4) : murs actifs, cible, défense, invalidation, posés en lignes de prix par-dessus les bougies.
   Fonctionne seulement sur le graphique Raylé (le widget TradingView est une iframe : on ne peut pas dessiner dessus). Source : le service PC (/__flux/analyse) ; sans lui, rien n'est tracé
   et le dit. Aucun ordre ; ce sont des HYPOTHÈSES de lecture (titres « mur » / « cible », jamais « achète »). */
export const ACTIF_DE = Object.freeze({ BTC: 'BTC', SOL: 'SOL', DOGE: 'DOGE' });
const fmtM = u => (u >= 1e6 ? (u / 1e6).toFixed(1).replace('.', ',') + ' M$' : Math.round(u / 1e3) + ' k$');
const COUL = { fiable: 'rgba(47,209,139,.9)', incertain: 'rgba(233,162,59,.9)', 'leurre probable': 'rgba(255,93,110,.75)' };

/* Pure : analyse → lignes de prix pour `graphique.surimposer`. Au plus 6 murs (les plus gros, actifs, dans ±2 %) + cible, défense, invalidation. */
export function niveauxDepuisAnalyse(a, { maxMurs = 6, rayonPct = 2 } = {}) {
  if (!a || !(a.prix > 0)) return [];
  const out = [];
  for (const m of (a.murs || []).filter(x => x.actif && x.distancePct <= rayonPct).slice(0, maxMurs)) out.push({ prix: m.prix, couleur: COUL[m.fiabilite && m.fiabilite.niveau] || COUL.incertain, titre: 'mur ' + (m.cote === 'bid' ? 'ach. ' : 'vend. ') + fmtM(m.usdMax) + (m.fiabilite && m.fiabilite.niveau === 'leurre probable' ? ' (leurre ?)' : ''), epaisseur: 1, tirets: true });
  const A = a.aimants; if (A && A.objectif) {
    out.push({ prix: A.objectif.prix, couleur: 'rgba(111,211,238,1)', titre: 'cible (hypothèse)', epaisseur: 2, tirets: false });
    if (A.defense) out.push({ prix: A.defense.prix, couleur: 'rgba(47,209,139,1)', titre: 'défense', epaisseur: 1, tirets: false });
    if (A.invalidation) out.push({ prix: A.invalidation.prix, couleur: 'rgba(255,93,110,1)', titre: 'invalidation', epaisseur: 1, tirets: true });
  }
  return out;
}
export function creerSurimpression({ graphique, instrument, venue = 'binance-spot', fetchImpl = (u, o) => fetch(u, o), surEtat = () => {}, intervalleMs = 20000 }) {
  let actif = false, minuteur = 0, dernier = null;
  async function maj() {
    const g = graphique(); if (!actif || !g || !g.surimposer) return;
    const act = ACTIF_DE[instrument()]; if (!act) { g.surimposer([]); surEtat({ ok: false, texte: 'Pas de carnet pour cet instrument (BTC, SOL ou DOGE seulement).' }); return; }
    try {
      const r = await fetchImpl('/__flux/analyse?actif=' + act + '&venue=' + venue + '&minutes=20', { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); if (!j.ok) throw new Error(j.erreur || 'erreur');
      dernier = j.analyse; const n = niveauxDepuisAnalyse(dernier); g.surimposer(n); surEtat({ ok: true, texte: n.length ? n.length + ' niveaux de liquidité posés (hypothèses de lecture)' : 'Aucun mur net en ce moment.', analyse: dernier });
    } catch (e) { g.surimposer([]); surEtat({ ok: false, texte: 'Surimpression indisponible : le service PC ne répond pas (' + String(e.message).slice(0, 60) + ').' }); }
  }
  return { activer() { if (actif) return; actif = true; maj(); minuteur = setInterval(maj, intervalleMs); }, desactiver() { actif = false; clearInterval(minuteur); const g = graphique(); if (g && g.surimposer) g.surimposer([]); surEtat({ ok: true, texte: '' }); }, maj, actif: () => actif, dernier: () => dernier };
}
