/* ═════════════ BOOKMAP (v12, phase 2) — calcul PUR (testé) ═════════════
   Carte de chaleur de la liquidité : pour chaque seconde, la quantité d'ordres en attente à chaque niveau de prix (carnet Binance mis à jour toutes les 100 ms),
   bulles des grosses transactions (vert = achat agressif, rouge = vente agressive), ligne de prix. Rien ici ne touche au réseau, à l'écran ni au stockage.
   · creerCarnetLocal : carnet complet reconstruit selon la méthode officielle de Binance (instantané REST + différences du flux @depth, contrôle pu/u).
   · creerGrille      : colonnes d'une seconde ; chaque colonne garde, par niveau de prix (palier), la quantité MAXIMALE vue pendant la seconde (un mur éphémère reste visible).
   · creerBulles      : transactions gardées au-dessus d'un seuil minimal ; sélection par seuil réglable.
   · matrice / palette / duree : tout ce qu'il faut pour dessiner la zone VISIBLE seulement. */

export const TICKS = Object.freeze({ btc: 0.1, sol: 0.01, or: 0.01 });
/* palier d'une case de la carte : ~0,003 % du prix, arrondi à 1, 2 ou 5 × 10^k, jamais sous le pas de cotation */
export function palierBookmap(prix, actif) {
  const brut = Math.max(prix * 0.00003, TICKS[actif] || 0), e = Math.pow(10, Math.floor(Math.log10(brut))), r = brut / e, m = r >= 5 ? 5 : r >= 2 ? 2 : 1;
  return Math.max(+(m * e).toPrecision(6), TICKS[actif] || 0);
}
export const DEMI_FENETRE = 250;   // nombre de cases gardées de chaque côté du prix dans une colonne

/* ───── carnet local (Binance futures : https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/How-to-manage-a-local-order-book-correctly) ───── */
export function creerCarnetLocal() {
  const B = new Map(), A = new Map(); let pret = false, derniere = null, minId = 0, tampon = [], resyncs = 0, maj = 0;
  const appliquer = (M, L) => { for (const [p, q] of L) { const prix = +p, qte = +q; if (qte > 0) M.set(prix, qte); else M.delete(prix); } };
  function traiter(e) {   // e : { U, u, pu, b, a, E }
    if (derniere == null) { if (e.u < minId) return 'ok'; }   // juste après l'instantané : les événements plus vieux que lui sont ignorés
    else if (e.pu !== derniere) return 'resync';
    appliquer(B, e.b || []); appliquer(A, e.a || []); derniere = e.u; maj = e.E || Date.now(); return 'ok';
  }
  return {
    /* instantané REST : { lastUpdateId, bids, asks } ; rejoue les événements mis en attente (le premier doit avoir U <= lastUpdateId <= u, puis pu = u précédent) */
    instantane(s) {
      B.clear(); A.clear(); appliquer(B, s.bids || []); appliquer(A, s.asks || []); derniere = null; pret = false; minId = s.lastUpdateId;
      const L = tampon.filter(e => e.u >= minId).sort((x, y) => x.U - y.U); tampon = [];
      if (L.length && L[0].U > minId) return 'resync';
      for (const e of L) { if (traiter(e) === 'resync') return 'resync'; }
      pret = true; return 'ok';
    },
    evenement(e) { if (!pret) { tampon.push(e); if (tampon.length > 5000) tampon.shift(); return 'attente'; } const r = traiter(e); if (r === 'resync') { resyncs++; pret = false; tampon = [e]; derniere = null; } return r; },
    /* nouvelle connexion : la continuité est rompue, on repart d'un instantané */
    reinitialiser() { pret = false; tampon = []; derniere = null; },
    pret: () => pret, resyncs: () => resyncs, derniereMaj: () => maj,
    meilleurs() { let bb = -Infinity, ba = Infinity; for (const p of B.keys()) if (p > bb) bb = p; for (const p of A.keys()) if (p < ba) ba = p; return { bid: bb, ask: ba, mid: bb > 0 && ba < Infinity ? (bb + ba) / 2 : null }; },
    /* niveaux regroupés par palier autour du milieu : [{ bin, qte, cote }] (cote : 'b' acheteurs, 'a' vendeurs) */
    niveaux(palier, demi = DEMI_FENETRE) {
      const { mid } = this.meilleurs(); if (!(mid > 0)) return { mid: null, niveaux: [] }; const c = Math.round(mid / palier), sortie = new Map();
      for (const [M, cote] of [[B, 'b'], [A, 'a']]) for (const [p, q] of M) { const bin = Math.round(p / palier); if (Math.abs(bin - c) > demi) continue; const x = sortie.get(bin); if (x) x.qte += q; else sortie.set(bin, { bin, qte: q, cote }); }
      return { mid, niveaux: [...sortie.values()] };
    },
    taille: () => B.size + A.size
  };
}

/* ───── grille : colonnes d'une seconde ───── */
export function creerGrille({ palier, binMs = 1000, dureeMs = 3 * 3600e3, demi = DEMI_FENETRE } = {}) {
  let cols = [], cur = null;
  const ouvrirCol = t => ({ t: Math.floor(t / binMs) * binMs, mid: null, acc: new Map(), pic: null });
  function fermer(c) {
    if (!c.acc.size) return { t: c.t, mid: c.mid, i0: 0, q: new Float32Array(0), n: 0 };
    let lo = Infinity, hi = -Infinity; for (const b of c.acc.keys()) { if (b < lo) lo = b; if (b > hi) hi = b; }
    const q = new Float32Array(hi - lo + 1); for (const [b, v] of c.acc) q[b - lo] = v; return { t: c.t, mid: c.mid, i0: lo, q, n: c.acc.size };
  }
  const G = {
    palier, binMs, demi,
    /* niveaux : sortie de creerCarnetLocal().niveaux ; t : date en ms */
    ajouter(mid, niveaux, t) {
      if (!cur) cur = ouvrirCol(t);
      if (t >= cur.t + binMs) { cols.push(fermer(cur)); cur = ouvrirCol(t); const max = Math.ceil(dureeMs / binMs); if (cols.length > max + 50) cols = cols.slice(cols.length - max); }
      if (mid > 0) cur.mid = mid; for (const x of niveaux) { const v = cur.acc.get(x.bin) || 0; if (x.qte > v) cur.acc.set(x.bin, x.qte); }
    },
    colonnes: () => cols, courante: () => cur ? { t: cur.t, mid: cur.mid } : null,
    /* colonnes rechargées depuis le stockage (déjà fermées, dans l'ordre) : insérées avant les colonnes actuelles */
    inserer(L) { if (!L.length) return; const t0 = cols.length ? cols[0].t : (cur ? cur.t : Infinity); const avant = L.filter(c => c.t < t0); cols = avant.concat(cols); },
    vider() { cols = []; cur = null; },
    /* durée couverte (ms) */
    couverture() { const a = cols.length ? cols[0].t : (cur ? cur.t : null), b = cur ? cur.t : (cols.length ? cols[cols.length - 1].t : null); return a != null && b != null ? b - a + binMs : 0; },
    premiereDate: () => (cols.length ? cols[0].t : (cur ? cur.t : null)),
    /* matrice des cases visibles : nCols colonnes de largeur `pasMs` finissant à tFin, lignes de binHaut (en haut) à binBas inclus. Valeur = maximum de la quantité. */
    matrice(tFin, pasMs, nCols, binBas, binHaut) {
      const nRows = Math.max(1, binHaut - binBas + 1), M = new Float32Array(nCols * nRows), tDebut = tFin - nCols * pasMs; const mids = new Array(nCols).fill(null);
      const toutes = cur ? cols.concat([{ t: cur.t, mid: cur.mid, i0: 0, q: new Float32Array(0), n: 0, vive: cur }]) : cols;
      /* première colonne utile par dichotomie */
      let lo = 0, hi = toutes.length; while (lo < hi) { const m = (lo + hi) >> 1; if (toutes[m].t < tDebut - binMs) lo = m + 1; else hi = m; }
      for (let k = lo; k < toutes.length; k++) {
        const c = toutes[k]; if (c.t >= tFin) break; const j = Math.floor((c.t - tDebut) / pasMs); if (j < 0 || j >= nCols) continue;
        if (c.mid != null) mids[j] = c.mid;
        if (c.vive) { for (const [b, v] of c.vive.acc) { if (b < binBas || b > binHaut) continue; const idx = (binHaut - b) * nCols + j; if (v > M[idx]) M[idx] = v; } continue; }
        const q = c.q, i0 = c.i0, b0 = Math.max(binBas, i0), b1 = Math.min(binHaut, i0 + q.length - 1);
        for (let b = b0; b <= b1; b++) { const v = q[b - i0]; if (v > 0) { const idx = (binHaut - b) * nCols + j; if (v > M[idx]) M[idx] = v; } }
      }
      return { M, nCols, nRows, mids, tDebut };
    }
  };
  return G;
}

/* ───── bulles : transactions ───── */
export function creerBulles({ max = 20000 } = {}) {
  let L = [], tailles = [];
  return {
    /* garde toute transaction >= seuilMin (borne basse du réglage) ; renvoie vrai si gardée */
    ajouter(tr, seuilMin) { tailles.push(tr.qte); if (tailles.length > 1500) tailles.splice(0, 300); if (!(tr.qte >= seuilMin)) return false; L.push({ t: tr.t, p: tr.prix, q: tr.qte, cote: tr.cote }); if (L.length > max) L = L.slice(L.length - Math.floor(max * 0.9)); return true; },
    liste: () => L, tailles: () => tailles, inserer(B) { if (!B.length) return; const t0 = L.length ? L[0].t : Infinity; L = B.filter(b => b.t < t0).concat(L); }, vider() { L = []; tailles = []; },
    visibles(t0, t1, seuil) { const o = []; for (let i = L.length - 1; i >= 0; i--) { const b = L[i]; if (b.t < t0) break; if (b.t <= t1 && b.q >= seuil) o.push(b); } return o.reverse(); }
  };
}
/* seuil automatique : 97,5e centile des tailles récentes (au moins 20 transactions, sinon 0 : rien n'est inventé) */
export function seuilAuto(tailles) { if (!tailles || tailles.length < 20) return 0; const s = [...tailles].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.975))]; }
export const MULTIPLICATEURS_SEUIL = Object.freeze([0.25, 0.5, 1, 2, 4]);
/* rayon d'une bulle en pixels : proportionnel à la racine du volume rapporté au seuil, borné */
export const rayonBulle = (q, seuil, { min = 3, max = 30 } = {}) => Math.max(min, Math.min(max, min + 4.5 * Math.sqrt(Math.max(0, q) / Math.max(seuil, 1e-12))));

/* ───── couleurs : noir → bleu nuit → turquoise → jaune → blanc ───── */
export function paletteChaleur(n = 256) {
  const stops = [[0, [0, 0, 0]], [0.18, [8, 18, 70]], [0.4, [18, 110, 140]], [0.62, [60, 190, 120]], [0.82, [245, 215, 70]], [1, [255, 255, 255]]], L = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { const x = i / (n - 1); let k = 1; while (k < stops.length - 1 && x > stops[k][0]) k++; const [x0, c0] = stops[k - 1], [x1, c1] = stops[k], f = (x - x0) / (x1 - x0 || 1); for (let c = 0; c < 3; c++) L[i * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f); }
  return L;
}
/* valeur de référence du contraste : 98e centile des cases non vides visibles (une case géante ne doit pas écraser le reste) */
export function referenceContraste(M) {
  const v = []; for (let i = 0; i < M.length; i += Math.max(1, Math.floor(M.length / 6000))) if (M[i] > 0) v.push(M[i]); if (!v.length) return 0; v.sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * 0.98))];
}
/* intensité 0..1 d'une case : (q / ref × contraste)^0,6 */
export const intensite = (q, ref, contraste = 1) => (q > 0 && ref > 0 ? Math.min(1, Math.pow(Math.min(1, (q / ref) * contraste), 0.6)) : 0);

/* ───── durée gardée sur l'appareil, selon la mémoire ───── */
export function dureeConseillee({ memoireGo = null, quotaOctets = null, usageOctets = 0 } = {}) {
  const H = 3600e3; let h = memoireGo == null ? 2 : memoireGo >= 8 ? 6 : memoireGo >= 4 ? 3 : memoireGo >= 2 ? 1.5 : 1;
  /* ~12 Mo par heure de carte sur disque : jamais plus de 5 % de l'espace libre */
  if (quotaOctets > 0) { const libre = Math.max(0, quotaOctets - usageOctets); h = Math.min(h, Math.max(0.5, (libre * 0.05) / 12e6)); }
  return Math.round(h * H);
}
/* nombre de cases mémorisées par heure (pour afficher une estimation) */
export const octetsParColonne = (g) => g.colonnes().reduce((s, c) => s + 24 + c.q.byteLength, 0);
