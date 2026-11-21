/* ═════════════ SÉRIE CONTINUE (v6, phase A2) — une seule série de bougies par actif et par unité, sans trou ni saut d'échelle ═════════════
   Ordre de fusion : historique long (recalé) → source récente → temps réel ; en cas de bougie commune, la source la PLUS RÉCENTE gagne.
   Contrôles automatiques (module pur, testé) :
     · bougie isolée : une bougie dont l'ouverture ET la clôture s'écartent de plus de 30 % des deux voisines (qui, elles, se suivent) est rejetée et notée ;
     · trou : plus de 2 bougies manquantes de suite sur un marché ouvert 24/7 (crypto) — sur les autres marchés on ne signale que les trous de plus de 5 jours (week-ends, fériés) ;
     · bougie incohérente : h < l, valeur nulle ou non finie, bougie hors grille ;
   Les incidents sont rendus (liste lisible) et jamais silencieux. */
export const PAS = Object.freeze({ H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 });
export const MARCHE_24_7 = Object.freeze({ btc: true, sol: true });

const ok = b => b && [b.o, b.h, b.l, b.c].every(x => Number.isFinite(x) && x > 0) && b.h >= b.l && Number.isFinite(b.t);
const mediane = L => { if (!L.length) return null; const s = [...L].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* fusion : sources = [[bougies…], …] du plus ancien au plus récent ; renvoie une liste triée sans doublon */
export function fusionner(...sources) {
  const m = new Map(); for (const S of sources) for (const b of S || []) if (ok(b)) m.set(b.t, b);
  return [...m.values()].sort((a, b) => a.t - b.t);
}

/* rapport médian clôture(récente) / clôture(longue) sur les bougies communes ; null s'il y en a moins de 5 */
export function ecartSources(longues, recentes) {
  const L = new Map(longues.map(b => [b.t, b])), r = []; for (const b of recentes) { const x = L.get(b.t); if (x && x.c > 0 && b.c > 0) r.push(b.c / x.c); }
  if (r.length < 5) return null; return { ratio: mediane(r), n: r.length };
}
/* recale la série longue pour qu'elle se raccorde à la récente : rapport mesuré sur les bougies communes, sinon sur le saut entre la dernière longue et la première récente (< 5 % : pas de recalage) */
export function raccorder(longues, recentes) {
  if (!longues.length || !recentes.length) return { bougies: fusionner(longues, recentes), ratio: 1, methode: 'aucun', n: 0 };
  const e = ecartSources(longues, recentes); let ratio = 1, methode = 'aucun', n = 0;
  if (e && Math.abs(e.ratio - 1) < 0.2) { ratio = e.ratio; methode = 'bougies communes'; n = e.n; }
  else { const avant = [...longues].reverse().find(b => b.t < recentes[0].t); if (avant) { const sauts = avant.c > 0 ? recentes[0].o / avant.c : 1; if (Math.abs(sauts - 1) < 0.05 && Math.abs(sauts - 1) > 1e-9) { ratio = sauts; methode = 'saut de raccord'; n = 1; } } }
  const L = ratio === 1 ? longues : longues.map(b => ({ ...b, o: b.o * ratio, h: b.h * ratio, l: b.l * ratio, c: b.c * ratio }));
  return { bougies: fusionner(L, recentes), ratio, methode, n };
}

/* contrôle : renvoie { bougies (nettoyées), incidents[], trous[] } ; ne modifie pas l'entrée */
export function controler(B, { unite = 'J', actif = '', seuilSaut = 0.3, maxTrou = 2 } = {}) {
  const pas = PAS[unite] || PAS.J, incidents = [], trous = [], v = [];
  for (const b of B) { if (!ok(b)) { incidents.push({ type: 'incoherente', t: b && b.t }); continue; } v.push(b); }
  /* bougies isolées : écart > seuilSaut des deux voisines, alors que les voisines se tiennent entre elles */
  const gardees = [];
  for (let i = 0; i < v.length; i++) {
    const b = v[i], p = v[i - 1], s = v[i + 1];
    if (p && s) { const dev = x => Math.min(Math.abs(b.o / x.c - 1), Math.abs(b.c / x.c - 1)); /* ouverture ET clôture hors de portée : une mèche profonde (krach éclair réel) n'est pas une bougie fausse */ if (dev(p) > seuilSaut && dev(s) > seuilSaut && Math.abs(p.c / s.c - 1) < seuilSaut) { incidents.push({ type: 'isolee', t: b.t, c: b.c, voisines: [p.c, s.c] }); continue; } }
    gardees.push(b);
  }
  /* trous */
  const est24 = !!MARCHE_24_7[actif];
  for (let i = 1; i < gardees.length; i++) { const dt = gardees[i].t - gardees[i - 1].t, manq = Math.round(dt / pas) - 1; if (est24 ? manq > maxTrou : (unite === 'J' ? dt > 6 * 86400e3 : dt > 5 * 86400e3)) trous.push({ de: gardees[i - 1].t, a: gardees[i].t, manquantes: manq }); }
  return { bougies: gardees, incidents, trous };
}

/* résumé d'une ligne pour « Détails » */
export function resume(r) {
  const parties = []; if (r.incidents.length) parties.push(r.incidents.length + ' bougie(s) rejetée(s)'); if (r.trous.length) parties.push(r.trous.length + ' trou(s)');
  return parties.length ? 'Contrôle : ' + parties.join(', ') : 'Contrôle : série continue';
}

/* v7 : contrôle du raccord (historique long → source récente). Rejeté si l'écart de prix entre la dernière bougie historique et la première récente dépasse 10 %
   (après le recalage mesuré), ou s'il manque plus de 2 bougies entre les deux (marché 24/7 ; ailleurs : plus de 5 jours). Pur, testé. */
export function verifierRaccord(longues, recentes, { unite = 'J', actif = '', maxSaut = 0.10, maxManquantes = 2 } = {}) {
  if (!longues || !longues.length || !recentes || !recentes.length) return { ok: true, raison: null, manquantes: 0, saut: 0 };
  const pas = PAS[unite] || PAS.J, t0 = recentes[0].t, avant = [...longues].reverse().find(b => b.t < t0);
  if (!avant) return { ok: true, raison: null, manquantes: 0, saut: 0 };
  const e = ecartSources(longues, recentes), ratio = e && Math.abs(e.ratio - 1) < 0.2 ? e.ratio : 1;
  const dt = t0 - avant.t, manquantes = Math.max(0, Math.round(dt / pas) - 1), saut = recentes[0].o / (avant.c * ratio) - 1;
  const trop = MARCHE_24_7[actif] ? manquantes > maxManquantes : dt > (unite === 'J' ? 6 : 5) * 86400e3;
  if (Math.abs(saut) > maxSaut) return { ok: false, raison: 'saut', manquantes, saut, de: avant.t, a: t0 };
  if (trop) return { ok: false, raison: 'trou', manquantes, saut, de: avant.t, a: t0 };
  return { ok: true, raison: null, manquantes, saut };
}
