/* ═════════════ MOTEUR DE BACKTEST (M3b ; module pur, déterministe, testé : planetes/mars/tests/agent-backtest-test.mjs) ═════════════
   Tourne dans le NAVIGATEUR (jamais dans le Worker), dans un Worker de navigateur pour ne pas ralentir l'interface.
   Règles du simulateur (écrites avant tout test) :
   - le SIGNAL naît à la clôture de la bougie i (il n'utilise que les bougies 0..i : les signaux sont produits par des fonctions causales, vérifiées par le test du « poison du futur ») ;
   - l'EXÉCUTION se fait à l'OUVERTURE de la bougie suivante (i + 1), avec spread et glissement défavorables ;
   - stop et objectif sont surveillés à chaque bougie suivante, dès la bougie d'entrée ; si les deux sont touchés dans la même bougie, c'est le STOP qui est compté (hypothèse prudente) ;
   - une ouverture qui saute au-delà du stop (gap) sort à l'ouverture, au prix pire ; un temps maximum de détention ferme la position à la clôture ;
   - UNE seule position à la fois, pas de martingale, pas de pyramidage, pas de renforcement ; repos entre deux positions ; maximum de positions par semaine ;
   - taille = risque fixe (en % du capital, réglable) divisé par la distance au stop ; frais par côté, spread, glissement réalistes (réglables) ;
   - une position encore ouverte à la fin des données n'est PAS comptée (aucun résultat inventé).
   Les résultats sont exprimés en R (multiples du risque pris, frais et glissement inclus) et en % du capital (rendement composé). */
export const CONFIG_DEFAUT = Object.freeze({
  risquePct: 1,            // % du capital risqué par position
  fraisPct: 0.06,          // frais par côté, en % du montant (ordre au marché sur un échange ; à régler pour un CFD)
  spreadPct: 0.02,         // écart acheteur / vendeur, en % du prix
  glissementPct: 0.02,     // glissement à l'exécution au marché, en % du prix (stop et entrée)
  maxBarres: 192,          // détention maximale : 192 bougies M15 = 2 jours
  maxParSemaine: 5,        // positions ouvertes au plus par semaine (semaine UTC, lundi → dimanche)
  reposBarres: 16,         // repos après une sortie : 16 bougies M15 = 4 heures
  distanceMinPct: 0.25,    // un stop plus proche que 0,25 % du prix est écarté (frais disproportionnés)
  distanceMaxPct: 6        // un stop plus loin que 6 % est écarté (risque trop large pour du M15)
});
export const semaineUTC = t => Math.floor((t / 86400e3 + 3) / 7);

/* ── Briques partagées par le backtest ET le compte simulé en direct (une seule logique d'exécution : ce qui est testé est ce qui tourne) ── */
export const fusionConfig = config => ({ ...CONFIG_DEFAUT, ...config });
/* Remplissage d'une entrée : s = +1 / −1, ouverture = ouverture de la bougie d'exécution, stop = niveau du signal, R = multiple visé. Rend null si la distance au stop est hors limites. */
export function ouvrirPosition(cfg, s, ouverture, stop, R) {
  const fill = ouverture * (1 + s * (cfg.glissementPct / 100 + cfg.spreadPct / 200)), dist = s > 0 ? fill - stop : stop - fill, pct = dist / fill * 100;
  if (!(dist > 0) || pct < cfg.distanceMinPct || pct > cfg.distanceMaxPct) return null;
  return { s, fill, stop, dist, pct, R, cible: fill + s * R * dist };
}
/* Une bougie { o, h, l, c } de plus pour la position pos ; premiere = c'est la bougie d'entrée ; detenues = nombre de bougies depuis l'entrée, celle-ci comprise. Rend { prix, motif } ou null. */
export function evaluerBougie(cfg, pos, b, premiere, detenues) {
  const s = pos.s, slip = cfg.glissementPct / 100, demi = cfg.spreadPct / 200;
  const touchStop = s > 0 ? b.l <= pos.stop : b.h >= pos.stop, touchCible = s > 0 ? b.h >= pos.cible : b.l <= pos.cible;
  if (touchStop) { const gap = !premiere && (s > 0 ? b.o < pos.stop : b.o > pos.stop); return { prix: (gap ? b.o : pos.stop) * (1 - s * slip), motif: 'stop' }; }
  if (touchCible) { const gap = !premiere && (s > 0 ? b.o > pos.cible : b.o < pos.cible); return { prix: (gap ? b.o : pos.cible) * (1 - s * demi), motif: 'cible' }; }
  if (detenues >= cfg.maxBarres) return { prix: b.c * (1 - s * (slip + demi)), motif: 'temps' };
  return null;
}
/* Résultat en R d'une position sortie à prixSortie (frais déduits ; risque = 1). */
export function resultatPosition(cfg, pos, prixSortie) {
  const qte = 1 / pos.dist, brut = pos.s * (prixSortie - pos.fill) * qte, couts = cfg.fraisPct / 100 * (pos.fill + prixSortie) * qte;
  return { R: brut - couts, Rbrut: brut, coutsR: couts };
}

/* signaux = { sens: Int8Array (+1 achat, −1 vente, 0 rien), stop: Float64Array (niveau de stop absolu), R: multiple visé } ; plage = { de, a } (indices M15, a exclu). */
export function simuler(m15, signaux, config = {}, plage = {}) {
  const cfg = fusionConfig(config), { o, h, l, c, t } = m15, n = m15.n, de = Math.max(0, plage.de || 0), a = Math.min(n, plage.a == null ? n : plage.a);
  const { sens, stop: niveauStop, R } = signaux;
  const trades = []; let i = de, prochain = de, semaine = -1, nSemaine = 0, tronque = 0;
  while (i < a - 1) {
    if (i < prochain || sens[i] === 0) { i++; continue; }
    const s = sens[i], e = i + 1;                                           // entrée à l'ouverture de la bougie suivante
    const sem = semaineUTC(t[e]); if (sem !== semaine) { semaine = sem; nSemaine = 0; }
    if (nSemaine >= cfg.maxParSemaine) { i++; continue; }
    const pos = ouvrirPosition(cfg, s, o[e], niveauStop[i], R);
    if (!pos) { i++; continue; }
    nSemaine++;
    let sortie = -1, ex = null;
    for (let j = e; j < a; j++) { ex = evaluerBougie(cfg, pos, { o: o[j], h: h[j], l: l[j], c: c[j] }, j === e, j - e + 1); if (ex) { sortie = j; break; } }
    if (sortie < 0) { tronque = 1; break; }                                 // position encore ouverte à la fin des données : non comptée
    const r = resultatPosition(cfg, pos, ex.prix);
    trades.push({ signal: i, entree: e, sortie, t: t[e], tSortie: t[sortie], sens: s, prixEntree: pos.fill, stop: pos.stop, cible: pos.cible, prixSortie: ex.prix, motif: ex.motif, R: r.R, Rbrut: r.Rbrut, coutsR: r.coutsR, distancePct: pos.pct, barres: sortie - e + 1 });
    prochain = sortie + cfg.reposBarres; i = Math.max(sortie, i + 1);
  }
  return { trades, tronque: !!tronque, config: cfg };
}

/* Statistiques d'une liste de trades. `barres` = nombre de bougies M15 de la période étudiée (pour les trades par semaine). */
export function statistiques(trades, { barres = 0, risquePct = CONFIG_DEFAUT.risquePct } = {}) {
  const n = trades.length;
  if (!n) return { n: 0, gagnants: 0, tauxReussite: null, esperance: null, factProfit: null, Rtotal: 0, ddR: 0, ddPct: 0, rendementPct: 0, parSemaine: 0, dureeMoy: null, meilleur: null, pire: null, concentration: null, longs: 0, courts: 0, ecartType: null, courbeR: [0] };
  let somme = 0, gains = 0, pertes = 0, g = 0, sommeCar = 0, pic = 0, ddR = 0, eq = 1, picEq = 1, ddPct = 0, barresTot = 0, longs = 0, courts = 0, meilleur = -Infinity, pire = Infinity;
  const courbeR = [0];
  for (const x of trades) {
    somme += x.R; sommeCar += x.R * x.R; if (x.R > 0) { gains += x.R; g++; } else pertes += -x.R;
    courbeR.push(somme); if (somme > pic) pic = somme; if (pic - somme > ddR) ddR = pic - somme;
    eq *= 1 + risquePct / 100 * x.R; if (eq > picEq) picEq = eq; if ((picEq - eq) / picEq > ddPct) ddPct = (picEq - eq) / picEq;
    barresTot += x.barres; x.sens > 0 ? longs++ : courts++; if (x.R > meilleur) meilleur = x.R; if (x.R < pire) pire = x.R;
  }
  const moy = somme / n, variance = Math.max(0, sommeCar / n - moy * moy);
  return { n, gagnants: g, tauxReussite: g / n, esperance: moy, factProfit: pertes > 0 ? gains / pertes : (gains > 0 ? Infinity : null), Rtotal: somme, ddR, ddPct: ddPct * 100, rendementPct: (eq - 1) * 100,
    parSemaine: barres > 0 ? n / (barres / 672) : null, dureeMoy: barresTot / n, meilleur, pire, concentration: gains > 0 ? Math.max(...trades.map(x => x.R)) / gains : null, longs, courts, ecartType: Math.sqrt(variance), courbeR };
}
