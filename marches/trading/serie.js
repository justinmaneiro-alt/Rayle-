/* ═════════════ SÉRIES DE BOUGIES : fusion, volume de substitution, variations (module pur, testé : planetes/mars/tests/trading-serie-test.mjs) ═════════════
   L'historique est gardé dans le navigateur (IndexedDB, voir stockage.js) : chaque réponse du Worker (≤ 500 bougies) est FUSIONNÉE avec ce qu'on a déjà, ce qui
   donne peu à peu un historique plus long que ce que les sources gratuites rendent d'un coup. */

/* Fusionne deux séries (même instrument, même unité) : une bougie par instant, la plus récente version gagne (la dernière bougie évolue), triée. */
export function fusionner(anciennes, nouvelles) {
  const m = new Map();
  for (const x of anciennes || []) m.set(x.t, x);
  for (const x of nouvelles || []) m.set(x.t, x);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
export const limiter = (b, max) => (b.length > max ? b.slice(b.length - max) : b);
/* Écarte les bougies manifestement invalides (valeurs non numériques, haut < bas…) : une source peut en renvoyer. */
export function nettoyer(b) {
  return (b || []).filter(x => x && Number.isFinite(x.t) && [x.o, x.h, x.l, x.c].every(Number.isFinite) && x.h >= x.l - 1e-9)
    .map(x => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: Number.isFinite(x.v) && x.v > 0 ? x.v : 0 }));
}
/* La dernière bougie est-elle encore en cours de formation ? */
export const enCours = (bougie, ms, maintenant = Date.now()) => !!bougie && bougie.t + ms > maintenant;

/* Volume de substitution : pour chaque bougie, on additionne le volume des bougies du produit proxy dont l'instant tombe dans [t, t + ms).
   Tolérant aux découpages différents (un H4 de Twelve Data et un H4 reconstruit de Yahoo n'ont pas les mêmes bornes). */
export function appliquerVolumeProxy(bougies, proxy, ms) {
  const p = (proxy || []).filter(x => x.v > 0).sort((a, b) => a.t - b.t), out = [];
  let j = 0, couvert = 0;
  for (const x of bougies) {
    while (j < p.length && p[j].t < x.t) j++;
    let k = j, s = 0;
    while (k < p.length && p[k].t < x.t + ms) { s += p[k].v; k++; }
    if (s > 0) couvert++;
    out.push({ ...x, v: s });
  }
  return { bougies: out, couverture: bougies.length ? couvert / bougies.length : 0 };
}

/* Variation du jour : clôture de la veille (série journalière) et dernier prix connu. La dernière bougie journalière peut être celle du jour (en cours). */
export function variationJour(journalieres, dernierPrix, maintenant = Date.now()) {
  const b = journalieres || []; if (b.length < 2) return null;
  const jour = t => Math.floor(t / 86400e3), der = b[b.length - 1];
  const veille = jour(der.t) === jour(maintenant) || der.t + 86400e3 > maintenant ? b[b.length - 2] : der;
  const prix = dernierPrix != null ? dernierPrix : der.c;
  return { prix, veille: veille.c, variation: prix - veille.c, pct: veille.c ? (prix - veille.c) / veille.c * 100 : null };
}
/* Mini-courbe : les n dernières clôtures. */
export const dernieresClotures = (b, n = 40) => b.slice(-n).map(x => x.c);

/* Âge lisible d'une donnée (« il y a 3 min »). */
export function age(ms) {
  if (ms == null || !Number.isFinite(ms)) return 'inconnu';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return 'il y a ' + s + ' s'; const m = Math.round(s / 60);
  if (m < 60) return 'il y a ' + m + ' min'; const h = Math.round(m / 60);
  if (h < 48) return 'il y a ' + h + ' h'; return 'il y a ' + Math.round(h / 24) + ' j';
}
export function heureParis(t, avecDate = true) {
  try {
    const o = { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false };
    if (avecDate) Object.assign(o, { day: '2-digit', month: '2-digit' });
    return new Date(t).toLocaleString('fr-FR', o).replace(',', '');
  } catch (e) { return new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; }
}
/* Marchés fermés ? Un indice américain ou l'or ne cotent pas le week-end : la dernière bougie peut avoir plusieurs jours sans que ce soit une panne. */
export function marcheProbablementFerme(t, maintenant = Date.now()) {
  const d = new Date(maintenant), j = d.getUTCDay();
  return j === 6 || (j === 0 && d.getUTCHours() < 21) || (j === 5 && d.getUTCHours() >= 22);
}
/* Politique de rafraîchissement : on ne redemande pas avant la durée de l'unité, et pas du tout si l'onglet est caché ou le marché fermé (sauf demande explicite). */
export function doitRafraichir({ derniereLecture, rafraichirMs, maintenant = Date.now(), visible = true, ferme = false, force = false }) {
  if (force) return true;
  if (!visible) return false;
  if (derniereLecture == null) return true;
  return maintenant - derniereLecture >= (ferme ? Math.max(rafraichirMs * 5, 600e3) : rafraichirMs);
}
