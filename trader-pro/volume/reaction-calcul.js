/* ═════════════ NIVEAUX DE RÉACTION : CALCULS PURS (testés, navigateur et Node) — v4.1 ═════════════
   Un niveau de réaction est un PRIX où le marché a réagi plusieurs fois : au moins 2 rebonds ou rejets nets, chacun suivi d'un mouvement d'au moins 1 ATR dans l'autre sens.
   Détection :
     1. pivots : plus bas (ou plus haut) local sur k bougies de chaque côté, puis mouvement ≥ 1 ATR dans les `fenetre` bougies qui suivent → une RÉACTION ;
     2. regroupement : les réactions à moins de 0,35 ATR les unes des autres forment un niveau ; deux réactions de la même zone à moins de 4 bougies comptent pour une ;
     3. confluence avec le volume : HVN du profil, POC nus, déséquilibres empilés de l'empreinte, absorptions (flèches Volume) tombant dans la zone ajoutent à la force ;
     4. force = Σ (mouvement suivant, plafonné à 3 ATR × décroissance d'ancienneté) × poids de l'unité (Daily 1,6 > H4 1,25 > H1 1) + 0,8 par source de confluence distincte.
   Rien n'est calculé avec le futur d'une bougie sur elle-même : un pivot n'est confirmé qu'après k bougies, et le mouvement est mesuré sur les bougies suivantes (c'est un niveau, pas un signal d'entrée).
   On n'affiche que les 3 à 6 plus forts, séparés d'au moins 1 ATR. */
import { atr, dernier } from '../commun/analyse.js';

export const PARAMS_REACTION = Object.freeze({ pivot: 3, fenetre: 24, mouvementAtr: 1, tolAtr: 0.35, minReactions: 2, max: 6, minAffiches: 3, espaceAtr: 1, bougiesMax: { J: 1500, H4: 1500, H1: 1500 }, poidsUnite: { J: 1.6, H4: 1.25, H1: 1 }, demiVie: { J: 500, H4: 600, H1: 800 }, bonusSource: 0.8, ecartMinBougies: 4 });
export const NOM_UNITE = Object.freeze({ J: 'Daily', H4: 'H4', H1: 'H1' });

/* réactions (pivots confirmés suivis d'un mouvement ≥ mouvementAtr × ATR) : [{ i, t, prix, sens: 'support'|'resistance', mouvement (en ATR), iConf (bougie où le mouvement d'1 ATR est atteint : la réaction n'existe qu'à partir d'elle) }] */
export function trouverReactions(B, { pivot = PARAMS_REACTION.pivot, fenetre = PARAMS_REACTION.fenetre, mouvementAtr = PARAMS_REACTION.mouvementAtr } = {}) {
  const n = B.length, A = atr(B, 14), out = []; if (n < 2 * pivot + 10) return out;
  for (let i = pivot; i < n - pivot; i++) {
    const a = A[i]; if (!(a > 0)) continue; const b = B[i]; let bas = true, haut = true;
    for (let k = 1; k <= pivot; k++) { if (!(b.l <= B[i - k].l && b.l < B[i + k].l)) bas = false; if (!(b.h >= B[i - k].h && b.h > B[i + k].h)) haut = false; }
    if (!bas && !haut) continue; const fin = Math.min(n - 1, i + fenetre);
    if (bas) { let m = -Infinity, ic = -1; for (let j = i + 1; j <= fin; j++) { m = Math.max(m, B[j].h); if (ic < 0 && (m - b.l) / a >= mouvementAtr) ic = j; } const mv = (m - b.l) / a; if (mv >= mouvementAtr) out.push({ i, t: b.t, prix: b.l, sens: 'support', mouvement: mv, iConf: ic }); }
    if (haut) { let m = Infinity, ic = -1; for (let j = i + 1; j <= fin; j++) { m = Math.min(m, B[j].l); if (ic < 0 && (b.h - m) / a >= mouvementAtr) ic = j; } const mv = (b.h - m) / a; if (mv >= mouvementAtr) out.push({ i, t: b.t, prix: b.h, sens: 'resistance', mouvement: mv, iConf: ic }); }
  }
  return out;
}

/* Niveaux. volume : { hvn: [prix], nus: [prix], empiles: [{ prixBas, prixHaut }], absorptions: [prix] } (tout est facultatif) */
export function niveauxReaction(B, { unite = 'H4', max = PARAMS_REACTION.max, volume = {}, params = {} } = {}) {
  const P = { ...PARAMS_REACTION, ...params }; if (!B || B.length < 60) return { niveaux: [], atr: null, reactions: 0 };
  const X = B.length > P.bougiesMax[unite] ? B.slice(-P.bougiesMax[unite]) : B, a = dernier(atr(X, 14)); if (!(a > 0)) return { niveaux: [], atr: null, reactions: 0 };
  const R = trouverReactions(X, P).sort((x, y) => x.prix - y.prix), tol = P.tolAtr * a, px = X[X.length - 1].c, n = X.length;
  const groupes = []; for (const r of R) { const g = groupes[groupes.length - 1]; if (g && r.prix - g.min <= tol) { g.items.push(r); g.max = r.prix; } else groupes.push({ items: [r], min: r.prix, max: r.prix }); }
  const dem = P.demiVie[unite] || 600, w = P.poidsUnite[unite] || 1, hvn = volume.hvn || [], nus = volume.nus || [], emp = volume.empiles || [], abs = volume.absorptions || [];
  const liste = [];
  for (const g of groupes) {
    const items = g.items.sort((x, y) => x.i - y.i), distinctes = []; for (const r of items) { const d = distinctes[distinctes.length - 1]; if (d && r.i - d.i < P.ecartMinBougies) { if (r.mouvement > d.mouvement) distinctes[distinctes.length - 1] = r; } else distinctes.push(r); }
    if (distinctes.length < P.minReactions) continue;
    const prix = distinctes.reduce((s, r) => s + r.prix, 0) / distinctes.length, bas = Math.min(...distinctes.map(r => r.prix)), haut = Math.max(...distinctes.map(r => r.prix)), z0 = bas - 0.5 * tol, z1 = haut + 0.5 * tol;
    const dedans = p => p >= z0 && p <= z1, sources = [];
    if (hvn.some(dedans)) sources.push('HVN'); if (nus.some(dedans)) sources.push('POC nu'); if (emp.some(z => z.prixHaut >= z0 && z.prixBas <= z1)) sources.push('déséquilibres empilés'); if (abs.some(dedans)) sources.push('absorption');
    const base = distinctes.reduce((s, r) => s + Math.min(3, r.mouvement) * Math.pow(0.5, (n - 1 - r.i) / dem), 0), force = base * w + P.bonusSource * sources.length;
    const conf = distinctes.map(r => r.iConf).sort((x, y) => x - y), actifDepuis = X[conf[Math.min(1, conf.length - 1)]].t;   // le niveau n'existe qu'à partir de sa 2e réaction confirmée
    liste.push({ actifDepuis, prix, bas: Math.min(bas, prix - 0.1 * a), haut: Math.max(haut, prix + 0.1 * a), reactions: distinctes.length, force: +force.toFixed(3), sources, unite, derniere: distinctes[distinctes.length - 1].t, cote: prix >= px ? 'resistance' : 'support' });
  }
  liste.sort((x, y) => y.force - x.force); const retenus = [];
  for (const l of liste) { if (retenus.length >= max) break; if (retenus.every(x => Math.abs(x.prix - l.prix) >= P.espaceAtr * a)) retenus.push(l); }
  const fMax = retenus.length ? retenus[0].force : 1; for (const l of retenus) l.forceRel = +Math.max(0.15, Math.min(1, l.force / fMax)).toFixed(3);
  return { niveaux: retenus.sort((x, y) => y.prix - x.prix), atr: a, reactions: R.length };
}
export const etiquetteNiveau = (n, fmt = v => String(Math.round(v))) => `Réaction ×${n.reactions} · ${fmt(n.prix)} · ${NOM_UNITE[n.unite] || n.unite}`;
/* niveau le plus proche d'un prix (à `tolAtr` ATR près) : sert aux flèches Volume, au carnet et à l'empreinte */
export function niveauProche(niveaux, prix, atrVal, tolAtr = 0.5) { let m = null, d = Infinity; for (const n of niveaux || []) { const e = prix >= n.bas && prix <= n.haut ? 0 : Math.min(Math.abs(prix - n.bas), Math.abs(prix - n.haut)); if (e < d) { d = e; m = n; } } return m && d <= tolAtr * (atrVal || 0) ? m : null; }
/* phrase parlée : les niveaux les plus forts, du plus proche du prix au plus éloigné */
export function phraseNiveaux(niveaux, nom, prixActuel, fmt = v => String(Math.round(v))) {
  if (!niveaux || !niveaux.length) return `Je ne trouve pas de niveau de réaction net pour ${nom} sur cette unité de temps : il faut au moins deux rebonds ou rejets suivis d’un mouvement d’un ATR.`;
  const L = [...niveaux].sort((x, y) => Math.abs(x.prix - prixActuel) - Math.abs(y.prix - prixActuel)).slice(0, 4);
  return `Niveaux de réaction de ${nom} : ` + L.map(n => `${fmt(n.prix)}, ${n.cote === 'resistance' ? 'résistance' : 'support'}, ${n.reactions} réactions${n.sources.length ? ' avec ' + n.sources.join(' et ') : ''}`).join(' ; ') + '.';
}
