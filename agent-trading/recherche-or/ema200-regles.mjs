/* RÈGLES FIGÉES « ema200-v1 » (SHA-256 dans ema200-sceau.json, posé AVANT tout test). Pur : pas de réseau, pas de fichier. Bougies { t (ouverture, ms), o, h, l, c }, H1, bougies plates retirées.
   Aucun réglage après les résultats. Utilisé par ema200-etude.mjs (2026 Dukascopy + contrôle Kraken) et ema200-registre.mjs (registre en avant). */
export const VERSION = 'ema200-v1';
export const P = Object.freeze({
  ema: 200,                 // EMA200 des clôtures (alpha 2/201), initialisée par la moyenne des 200 premières clôtures de la série fournie
  atr: 14,                  // ATR(14) = moyenne simple des 14 derniers vrais ranges
  toucheAtr: 0.3,           // rebond : la mèche arrive à ≤ 0,3 ATR de l'EMA (ou la dépasse) et la clôture reste du même côté
  fausseBougies: 6,         // fausse cassure : re-traversée dans les 6 bougies suivant la cassure
  horizons: [6, 12, 24],    // sortie à la clôture de la bougie i + h
  stopAtr: 1.5,             // stop à 1,5 ATR de l'entrée (entrée à l'ouverture de la bougie suivant l'événement)
  rangeFenetre: 50, rangeTraversees: 3,   // « range » : au moins 3 traversées de l'EMA (clôture de l'autre côté) sur les 50 dernières bougies, la bougie de l'événement incluse
  toucheCompteurBougies: 12,              // compteur de touches : cassure = clôture qui traverse l'EMA dans les 12 bougies à partir de la touche (touche incluse)
  coutCfdFoisSpread: 1.5,   // frais CFD (compte de Justin) = 1,5 × l'écart acheteur/vendeur Dukascopy de la bougie d'entrée, sans commission ; frais Kraken = 0,1 % du prix + cet écart
  fraisKrakenPct: 0.001,
  tirages: 1000, graine: 20261111, casMin: 30, debut: '2026-01-01'
});
export function emaSerie(B, n = P.ema) {
  const o = new Array(B.length).fill(null); if (B.length < n) return o; let s = 0; for (let i = 0; i < n; i++) s += B[i].c; let e = s / n; o[n - 1] = e; const k = 2 / (n + 1);
  for (let i = n; i < B.length; i++) { e = B[i].c * k + e * (1 - k); o[i] = e; } return o;
}
export function atrSerie(B, n = P.atr) { const o = new Array(B.length).fill(null), tr = i => Math.max(B[i].h - B[i].l, Math.abs(B[i].h - B[i - 1].c), Math.abs(B[i].l - B[i - 1].c)); for (let i = n; i < B.length; i++) { let s = 0; for (let k = i - n + 1; k <= i; k++) s += tr(k); o[i] = s / n; } return o; }
const cote = (B, E, i) => (E[i] == null ? 0 : B[i].c > E[i] ? 1 : B[i].c < E[i] ? -1 : 0);
const touche = (B, E, A, i, s) => E[i] != null && A[i] != null && (s > 0 ? B[i].l <= E[i] + P.toucheAtr * A[i] : B[i].h >= E[i] - P.toucheAtr * A[i]);
/* événements à la CLÔTURE de la bougie i : { id, type: 'cassure' | 'rebond' | 'fausse', dir (+1 achat / −1 vente), i, t }. depuisI : premier indice retenu (la série sert d'échauffement avant). */
export function evenements(B, { depuisI = 0, E = emaSerie(B), A = atrSerie(B) } = {}) {
  const ev = [], side = B.map((_, i) => cote(B, E, i)), cass = [];
  for (let i = 1; i < B.length; i++) {
    if (E[i] == null || E[i - 1] == null || A[i] == null) continue;
    const s = side[i], sp = side[i - 1]; if (!s || !sp) continue;
    if (s !== sp) { cass.push({ i, s }); if (i >= depuisI) ev.push({ id: `cassure|${B[i].t}|${s}`, type: 'cassure', dir: s, i, t: B[i].t }); }
    else if (touche(B, E, A, i, s) && !touche(B, E, A, i - 1, s) && i >= depuisI) ev.push({ id: `rebond|${B[i].t}|${s}`, type: 'rebond', dir: s, i, t: B[i].t });
  }
  for (const c of cass) for (let k = c.i + 1; k <= Math.min(B.length - 1, c.i + P.fausseBougies); k++) { if (side[k] === -c.s) { if (k >= depuisI) ev.push({ id: `fausse|${B[k].t}|${-c.s}`, type: 'fausse', dir: -c.s, i: k, t: B[k].t, iCassure: c.i }); break; } }
  const ordre = { cassure: 0, fausse: 1, rebond: 2 }; return ev.sort((a, b) => a.i - b.i || ordre[a.type] - ordre[b.type]);
}
/* range à la bougie i : traversées de l'EMA (changement de côté de la clôture) parmi les 50 dernières bougies, i incluse */
export function traversees(B, E, i) { let n = 0; for (let k = Math.max(1, i - P.rangeFenetre + 1); k <= i; k++) { const a = cote(B, E, k), b = cote(B, E, k - 1); if (a && b && a !== b) n++; } return n; }
export const enRange = (B, E, i) => traversees(B, E, i) >= P.rangeTraversees;
/* un trade : entrée à l'ouverture de la bougie e = i + 1 dans le sens dir, stop à 1,5 ATR(i), sortie à la clôture de la bougie i + h ; renvoie R brut (sans frais) et le risque, ou null */
export function trade(B, A, i, dir, h) {
  const e = i + 1, f = i + h; if (A[i] == null || f >= B.length) return null; const entree = B[e].o, risque = P.stopAtr * A[i], stop = entree - dir * risque;
  for (let k = e; k <= f; k++) { if (dir > 0 ? B[k].l <= stop : B[k].h >= stop) { const px = dir > 0 ? Math.min(stop, B[k].o) : Math.max(stop, B[k].o); return { R0: dir * (px - entree) / risque, risque, entree, stoppe: true, sortie: k }; } }
  return { R0: dir * (B[f].c - entree) / risque, risque, entree, stoppe: false, sortie: f };
}
/* compteur de touches de l'EMA : chaque « touche » (première bougie d'un épisode à ≤ 0,3 ATR de l'EMA, venant du côté s) est numérotée depuis la dernière traversée ; issue = cassure dans les 12 bougies */
export function touches(B, { E = emaSerie(B), A = atrSerie(B), depuisI = 0 } = {}) {
  const T = [], side = B.map((_, i) => cote(B, E, i)); let k = 0;
  for (let i = 1; i < B.length; i++) {
    if (E[i] == null || A[i] == null || !side[i - 1]) continue;
    if (side[i] && side[i] !== side[i - 1]) {   // traversée : si le prix n'était pas déjà en train de toucher l'EMA, c'est une touche qui casse (numérotée), puis on repart de zéro
      if (!touche(B, E, A, i - 1, side[i - 1]) && i >= depuisI && i + P.toucheCompteurBougies - 1 < B.length) T.push({ i, t: B[i].t, numero: k + 1, cote: side[i - 1], cassure: true });
      k = 0; continue;
    }
    const s = side[i - 1]; if (!touche(B, E, A, i, s) || touche(B, E, A, i - 1, s)) continue; k++;
    let casse = false; for (let q = i; q <= Math.min(B.length - 1, i + P.toucheCompteurBougies - 1); q++) if (side[q] && side[q] !== s) { casse = true; break; }
    if (i + P.toucheCompteurBougies - 1 < B.length && i >= depuisI) T.push({ i, t: B[i].t, numero: k, cote: s, cassure: casse });
  }
  return T;
}
