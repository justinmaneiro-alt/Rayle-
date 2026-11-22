/* ═════════════ UNE SEULE SÉRIE DE BOUGIES PAR ACTIF ET PAR UNITÉ (v12, phase 1) ═════════════
   Cause du bug « BTC différent entre Classique et Volume » : le mode Volume chargeait ses propres bougies (Binance) et, sur les pages d'un actif autre que l'or,
   l'adaptateur d'instrument interceptait aussi ces requêtes Binance pour y répondre avec Yahoo en rendant les 1 500 PLUS ANCIENNES bougies (fin juillet 2025).
   Règle désormais : les prix (ouverture, haut, bas, clôture, date) viennent d'UNE seule série, celle du Classique (`serieUnique`). Le mode Volume n'ajoute
   que ses couches : le volume (v) et le volume acheteur agressif (bv) de sa source, rattachés aux bougies par la date. Module pur (testé), sans réseau. */

/* rattache le volume de la source Volume à la série unique : la bougie unique qui contient la date de la bougie de volume reçoit son volume (somme si plusieurs) */
export function canoniser(unique, volume, pas) {
  if (!Array.isArray(unique) || !unique.length) return { bougies: [], rattachees: 0, sansVolume: 0 };
  const V = [...(volume || [])].sort((a, b) => a.t - b.t), sortie = unique.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: 0, bv: undefined, ...(b.long ? { long: true } : {}) }));
  const memeGrille = new Map(sortie.map((b, i) => [b.t, i])); let j = 0, rattachees = 0;
  const vu = new Set();
  for (const x of V) {
    let i = memeGrille.get(x.t);
    if (i == null) { const m = x.t + pas / 2;   /* grilles décalées (futures à :00, indice à :30) : la bougie unique qui contient le MILIEU de la bougie de volume */
      while (j > 0 && sortie[j].t > m) j--; while (j < sortie.length - 1 && sortie[j + 1].t <= m) j++; i = sortie[j] && m >= sortie[j].t && m < sortie[j].t + pas ? j : null; }
    if (i == null) continue;
    const b = sortie[i]; b.v += x.v || 0; if (Number.isFinite(x.bv)) b.bv = (b.bv || 0) + x.bv; vu.add(i); rattachees++;
  }
  /* bougie sans volume de la source : on garde le volume de la série unique s'il existe (jamais inventé) */
  let sansVolume = 0; sortie.forEach((b, i) => { if (!vu.has(i)) { b.v = Number.isFinite(unique[i].v) ? unique[i].v : 0; if (!(b.v > 0)) sansVolume++; } if (b.bv === undefined) delete b.bv; });
  return { bougies: sortie, rattachees, sansVolume };
}

/* compare les N dernières bougies de deux séries (même date, mêmes O, H, L, C à `tol` près en fraction) ; la dernière peut avoir bougé (bougie en cours) */
export function comparer(A, B, { n = 300, tol = 1e-9, tolDerniere = 0.01 } = {}) {
  const a = (A || []).slice(-n), b = (B || []).slice(-n), diffs = [];
  if (!a.length || !b.length) return { ok: false, raison: 'série vide', n: 0, diffs, dernierA: null, dernierB: null };
  const m = new Map(b.map(x => [x.t, x]));
  const dA = a[a.length - 1].t, dB = b[b.length - 1].t;
  if (dA !== dB) diffs.push({ type: 'derniere-date', a: dA, b: dB });
  a.forEach((x, i) => {
    const y = m.get(x.t); if (!y) { diffs.push({ type: 'absente', t: x.t }); return; }
    const t = x.t === dA ? tolDerniere : tol;
    for (const k of ['o', 'h', 'l', 'c']) if (!(Math.abs(x[k] - y[k]) <= t * Math.abs(x[k]))) { diffs.push({ type: k, t: x.t, a: x[k], b: y[k] }); break; }
  });
  return { ok: diffs.length === 0, n: a.length, diffs: diffs.slice(0, 10), dernierA: dA, dernierB: dB };
}
