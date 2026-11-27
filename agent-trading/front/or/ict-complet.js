/* ═════════════ ICT COMPLET : TOUTE LA STRUCTURE DE LA PARTIE VISIBLE (pur, testé) ═════════════
   Le calcul porte sur TOUTES les bougies chargées (ict-v2) ; ce module fournit les briques que ict-objets.js assemble pour la plage visible :
   · zonesA : l'état des FVG, des order blocks et des breakers À LA DERNIÈRE BOUGIE VISIBLE (une zone peut être fraîche, testée, remplie ou cassée) ;
   · obDeCassure : l'order block de chaque BOS / MSS ;
   · choisirSommets : 12 sommets et creux au plus (HH, HL, LH, LL, ITH, ITL) ;
   · fusionnerZones : Unicorn d'abord, puis deux zones qui se recouvrent à plus de 60 %, puis le carré combiné « OB · OTE ».
   Interprétation de l'ICT : une description, jamais un ordre. */

export const MAX_SOMMETS = 12, SEUIL_FUSION = 0.6;

/* distance d'une zone au prix de référence */
const distZ = (z, p) => (p >= z.bas && p <= z.haut ? 0 : Math.min(Math.abs(p - z.bas), Math.abs(p - z.haut)));

/* état des zones à l'indice v1 (dernière bougie visible). Renvoie des entrées au format de `an.pdArrays` (+ `actif` : encore utilisable, `tRempliOb` : bougie qui a rempli un OB) */
export function zonesA(an, B, v1, prix, atr) {
  const tV1 = B[v1].t, out = [], u = an.nom, push = z => { z.distance = distZ(z, prix); z.distanceAtr = atr ? z.distance / atr : null; z.dedans = z.distance === 0; out.push(z); };
  for (const z of an.fvg || []) {
    if (z.i > v1) continue;
    const rempli = z.tRempli != null && z.tRempli <= tV1, inv = z.inverse && z.tInverse != null && z.tInverse <= tV1;
    if (inv) { if (z.ifvgActif && !(z.iInverse > v1)) push({ ...z, id: z.id + '|inv', unite: u, type: 'FVG', dir: -z.dir, sens: z.dir > 0 ? 'baissier' : 'haussier', inverse: true, statut: 'inverse', actif: true, creeEn: z.iInverse }); continue; }
    const tCe = z.tCe != null && z.tCe <= tV1;
    push({ ...z, unite: u, type: 'FVG', sens: z.dir > 0 ? 'haussier' : 'baissier', inverse: false, tRempli: rempli ? z.tRempli : null, statut: rempli ? 'rempli' : tCe ? 'ce_touche' : 'non_rempli', actif: !rempli, creeEn: z.i });
  }
  for (const z of an.ob || []) {
    if (z.i > v1) continue;
    const casse = z.tCasse != null && z.tCasse <= tV1;
    if (casse) { if (z.breaker && z.breaker.t <= tV1) push({ ...z.breaker, unite: u, sens: z.breaker.dir > 0 ? 'haussier' : 'baissier', actif: true, creeEn: z.breaker.i, fort: false, liquidite: z.breaker.avecLiquidite }); continue; }
    const teste = z.tTeste != null && z.tTeste <= tV1; let tR = null;
    for (let j = z.i + 1; j <= v1; j++) if (z.dir > 0 ? B[j].l <= z.bas : B[j].h >= z.haut) { tR = B[j].t; break; }
    push({ ...z, unite: u, sens: z.dir > 0 ? 'haussier' : 'baissier', statut: teste ? 'teste' : 'frais', tRempliOb: tR, rempli: tR != null, actif: tR == null, creeEn: z.i });
  }
  return out;
}

/* l'order block d'une cassure : la dernière candidate de même sens avant la cassure, dont la reversal candle clôture au plus tard à la cassure */
export function obDeCassure(an, e) {
  const C = (an.ob || []).filter(z => z.dir === e.dir && z.iReversal <= e.i && z.iCandidate <= e.i && z.iCandidate >= e.i - 80);
  return C.sort((a, b) => b.iCandidate - a.iCandidate)[0] || null;
}

/* 12 sommets et creux au plus, par écran : les ITH / ITL d'abord, puis les autres répartis régulièrement sur la plage */
export function choisirSommets(S, max = MAX_SOMMETS) {
  const L = [...S].sort((a, b) => a.i - b.i); if (L.length <= max) return L;
  const gros = L.filter(s => s.nom === 'ITH' || s.nom === 'ITL'), petits = L.filter(s => s.nom !== 'ITH' && s.nom !== 'ITL');
  let pris = gros.slice(-max); const reste = max - pris.length;
  if (reste > 0 && petits.length) { const k = Math.min(reste, petits.length), pas = petits.length / k, ch = []; for (let q = 0; q < k; q++) ch.push(petits[Math.min(petits.length - 1, Math.floor(q * pas + pas / 2))]); pris = pris.concat(ch); }
  return pris.sort((a, b) => a.i - b.i).slice(0, max);
}

/* recouvrement vertical de deux zones, rapporté à la plus petite des deux (0 à 1) */
export function recouvrement(a, b) {
  const h = Math.min(a.haut, b.haut) - Math.max(a.bas, b.bas); if (!(h > 0)) return 0;
  const m = Math.min(a.haut - a.bas, b.haut - b.bas); return m > 0 ? h / m : 1;
}
const memeTemps = (a, b) => (a.tFin == null || a.tFin >= b.tDebut) && (b.tFin == null || b.tFin >= a.tDebut);

/* Unicorn d'abord (le FVG et le breaker qui le composent disparaissent), puis deux zones de même sens qui se recouvrent à plus de 60 % n'en font plus qu'une
   (la plus prioritaire reste, le nom de l'autre passe dans la bulle) ; enfin un OB dans l'OTE prend un seul carré combiné « OB · OTE ». Renvoie la liste sans les zones absorbées. */
export function fusionnerZones(O) {
  const sup = new Set(), zones = () => O.filter(o => o.kind === 'zone' && !sup.has(o));
  for (const u of O.filter(o => o.kind === 'zone' && /^unicorn\|/.test(o.id))) for (const o of zones()) if (o !== u && (o.court === 'FVG' || o.court === 'BRK') && (o.dir > 0) === (u.dir > 0) && recouvrement(o, u) > SEUIL_FUSION) { sup.add(o); u.autres.push(o.court); }
  const Z = zones().filter(o => !/^(unicorn|bpr|gap)\|/.test(o.id) && o.dir !== 0).sort((a, b) => (b.prio || 0) - (a.prio || 0));
  for (let i = 0; i < Z.length; i++) { if (sup.has(Z[i])) continue; for (let j = i + 1; j < Z.length; j++) { const a = Z[i], b = Z[j]; if (sup.has(b) || (a.dir > 0) !== (b.dir > 0) || !memeTemps(a, b) || recouvrement(a, b) <= SEUIL_FUSION) continue; sup.add(b); a.autres.push(b.nom); } }
  const fib = O.find(o => o.kind === 'fib' && o.ote);
  if (fib) for (const o of zones()) if ((o.court === 'OB' || o.court === 'OB fort') && recouvrement(o, fib.ote) > SEUIL_FUSION) { o.court = o.court + ' · OTE'; fib.oteFusion = true; }
  return O.filter(o => !sup.has(o));
}
