/* ═════════════ ÉCRAN « TRADES SIMULÉS » : calculs purs (testés, utilisés par le Worker et la page) ═════════════
   Les données viennent de moteur/copilote/structure/audit/analyse-realite.mjs (front/or/donnees-trades/trades.json, ignoré par git) :
   les trades des études structure-v1 / structure-v2 tels que la simulation les a pris (bougies PAXG H1, UTC). Simulation, jamais un ordre. */
export const FILTRES = Object.freeze([['tous', 'Tous'], ['gagnants', 'Gagnants'], ['perdants', 'Perdants'], ['be', 'Break-even / sortie partielle'], ['stop', 'Stoppés'], ['cible', 'Cible atteinte'], ['tenue', 'Sortis au temps']]);
const H = 3600e3, EPS = 0.05;   // un trade « break-even » finit à moins de 0,05 R de zéro, ou sort au break-even

export const estBreakEven = t => t.sorties.some(s => /break-even/.test(s.raison)) || (Math.abs(t.R) < EPS && !/stop/.test(t.sortie));
export function accepte(t, filtre) {
  if (filtre === 'gagnants') return t.Rnet > 0;
  if (filtre === 'perdants') return t.Rnet <= 0;
  if (filtre === 'be') return estBreakEven(t);
  if (filtre === 'stop') return /^stop/.test(t.sortie) || t.sorties.some(s => /^stop/.test(s.raison));
  if (filtre === 'cible') return /cible/.test(t.sortie) || t.sorties.some(s => /cible/.test(s.raison));
  if (filtre === 'tenue') return /tenue/.test(t.sortie);
  return true;
}
export function lister(trades, filtre = 'tous', { debut = -Infinity, fin = Infinity } = {}) {
  const out = []; trades.forEach((t, i) => { if (t.te >= debut && t.te < fin && accepte(t, filtre)) out.push(i); });
  return out;
}
export function resume(trades, indices) {
  const T = indices.map(i => trades[i]), n = T.length, s = f => T.reduce((a, t) => a + f(t), 0);
  return { n, gagnants: T.filter(t => t.Rnet > 0).length, Rbrut: n ? s(t => t.R) / n : null, Rnet: n ? s(t => t.Rnet) / n : null, fraisR: n ? s(t => t.fraisR) / n : null };
}
/* navigation dans la liste filtrée : pos = position dans `indices` */
export function voisin(indices, courant, sens) {
  if (!indices.length) return null; const p = indices.indexOf(courant);
  if (p < 0) return sens > 0 ? indices[0] : indices[indices.length - 1];
  return indices[(p + sens + indices.length) % indices.length];
}
/* couleur selon le R net : vert si gagnant, rouge si perdant, gris si proche de zéro */
export const couleurR = r => (r > EPS ? '#4cc38a' : r < -EPS ? '#e5645f' : '#9aa7b0');
/* bougies autour d'un trade : de 40 h avant l'entrée à 40 h après la sortie (au plus 400 bougies) */
export function fenetre(bars, t, marge = 40 * H) {
  const deb = t.te - marge, fin = t.tx + marge; let a = 0, b = bars.length;
  while (a < b) { const m = (a + b) >> 1; if (bars[m][0] < deb) a = m + 1; else b = m; }
  let c = a; while (c < bars.length && bars[c][0] <= fin) c++;
  return bars.slice(a, Math.min(c, a + 400));
}
const dec = (x, d = 2) => Number(x).toFixed(d).replace('.', ','), dh = t => new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
export const sensTexte = t => (t.sens === 'achat' ? 'Achat' : 'Vente');
/* fiche d'un trade : lignes [libellé, valeur] */
export function fiche(t, { capital = 10000, risquePct = 0.5 } = {}) {
  const risqueUSD = capital * risquePct / 100, fraisUSD = t.fraisR * risqueUSD, unites = risqueUSD / t.risque;
  return [
    ['Date du signal', dh(t.t)], ['Entrée', `${dh(t.te)} · ${dec(t.entree)}`], ['Stop', dec(t.stop)], ['Cible', dec(t.cible)],
    ['Sortie', t.sorties.map(s => `${s.part === 'p1' ? '1re moitié' : s.part === 'p2' ? '2e moitié' : 'tout'} : ${s.raison} à ${dec(s.prix)} (${dh(s.t)})`).join(' ; ')],
    ['Distance du stop', `${dec(t.risque)} (${dec(t.distATR)} ATR H1)`], ['Cible visée', `${dec(t.objR, 1)} R`],
    ['R brut', `${t.R >= 0 ? '+' : ''}${dec(t.R, 3)} R`],
    ['Frais', `${dec(t.fraisR, 3)} R · ${dec(t.fraisPerOnce, 2)} $ par once · ${dec(fraisUSD, 2)} $ pour ${dec(risqueUSD, 0)} $ risqués (${dec(unites, 3)} once)`],
    ['R net', `${t.Rnet >= 0 ? '+' : ''}${dec(t.Rnet, 3)} R`], ['Bougies H1 tenues', String(t.bougies)], ['Niveau', `${t.type || ''} ${dec(t.niveau)}`.trim()], ['Régime SMA200 H1', t.regime]
  ];
}
/* marqueurs et segments à dessiner pour un trade (temps en secondes pour lightweight-charts) */
export function dessin(t) {
  const s = x => Math.floor(x / 1000), d = t.sens === 'achat' ? 1 : -1, couleur = couleurR(t.Rnet), tx = Math.max(t.tx, t.te + H);
  const marques = [{ time: s(t.te), position: d > 0 ? 'belowBar' : 'aboveBar', color: couleur, shape: d > 0 ? 'arrowUp' : 'arrowDown', text: `${sensTexte(t)} ${dec(t.entree)}` }];
  for (const x of t.sorties) marques.push({ time: s(x.t), position: d > 0 ? 'aboveBar' : 'belowBar', color: couleur, shape: 'circle', text: libelleSortie(x.raison) });
  return { marques, segments: [{ id: 'entree', a: t.entree, t0: s(t.te), t1: s(tx), couleur: '#cfd8dc', trait: 2 }, { id: 'stop', a: t.stop, t0: s(t.te), t1: s(tx), couleur: '#e5645f', trait: 0 }, { id: 'cible', a: t.cible, t0: s(t.te), t1: s(tx), couleur: '#4cc38a', trait: 0 }], couleur };
}
export function libelleSortie(r) { return /break-even/.test(r) ? 'break-even' : /^stop/.test(r) ? 'stop' : /^\+1R/.test(r) ? '+1 R' : /cible/.test(r) ? 'cible' : /tenue/.test(r) ? 'temps écoulé' : r; }
