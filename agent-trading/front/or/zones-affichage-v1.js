/* ═════════════ AFFICHAGE PRÉCIS DES ZONES ET DE LA LIQUIDITÉ (pur, testé, scellé SHA-256 avant affichage) ═════════════
   Règle « zones-affichage-v1 » : ne change AUCUN calcul de niveau ; décide seulement où une zone commence, jusqu'où elle vit et comment on la dessine.
   • Naissance : la bougie H1 d'origine = le premier PIVOT (fractale de 7) dans la zone pour un niveau de pivots (sommet → résistance, creux → support) ;
     sinon la première bougie où le prix est venu toucher la zone (mèche dans la zone ± 0,1 ATR) en arrivant du bon côté.
   • Vie : la zone reste « active » jusqu'à une CLÔTURE H1 au-delà de la zone + 0,25 ATR H1. Elle s'arrête alors (trace très pâle, limitée à sa durée) et,
     dans le même instant, naît la zone « retournée » de l'autre côté (support devenu résistance, et inversement).
   • Épaisseur dessinée : au plus 0,3 ATR H1 (sa vraie largeur si plus étroite), centrée ; ligne fine au prix EXACT (centre).
   • Zones qui se chevauchent (même côté, mêmes dates) : une seule, avec la liste de ses éléments.
   • Liquidité (au moins 2 pivots à ≤ 0,2 ATR) : trait plein du 1er au dernier pivot, pointillé jusqu'au balayage (mèche au-delà) ; ensuite la ligne s'arrête.
   Aucun repaint : tout se calcule bougie close par bougie close ; une bougie future ne change jamais le passé d'une zone. */
import { atrLocal, pivots } from './niveaux-periode.js';

export const REGLES = Object.freeze({
  version: 'zones-affichage-v1',
  epaisseurAtr: 0.3,        // épaisseur dessinée maximale
  invalidationAtr: 0.25,    // clôture H1 au-delà de la zone de plus de 0,25 ATR = zone invalidée
  toucheAtr: 0.1,           // une mèche à moins de 0,1 ATR de la zone la « touche »
  fusionAtr: 0.1,           // deux zones se chevauchent si leurs bornes sont à moins de 0,1 ATR
  egauxAtr: 0.2,            // pivots de liquidité égaux : à moins de 0,2 ATR
  pivotK: 2,                // fractale de 5 bougies (2 de chaque côté)
  regard: 24 * 30,          // recherche de l'origine : 30 jours de bougies H1 (fenêtre des pivots H1 de niveaux-periode-v1)
  pivotKNiveau: 3,          // fractale de 7 bougies des niveaux H1 (niveaux-periode-v1)
  retourneesMax: 40,        // une zone peut être retournée de nombreuses fois (une zone invalidée donne toujours naissance à la zone retournée)
  proches: 6,               // étiquettes des 6 zones les plus proches
  tracesMax: 12,            // traces pâles gardées (les plus récentes)
  balayeesMax: 6            // liquidités balayées gardées
});
export const TEXTE_REGLES = `Règle figée ${REGLES.version} : origine = première mèche (±${REGLES.toucheAtr} ATR) dans la zone en venant du bon côté ; invalidation = clôture H1 à plus de ${REGLES.invalidationAtr} ATR au-delà ; épaisseur ≤ ${REGLES.epaisseurAtr} ATR ; fusion à ${REGLES.fusionAtr} ATR ; liquidité = au moins 2 pivots (fractale de 5) à ≤ ${REGLES.egauxAtr} ATR, balayée par une mèche.`;

const nb = (p, d = 0) => Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const atrH1 = h1 => { const A = atrLocal(h1, 14); for (let i = A.length - 1; i >= 0; i--) if (A[i]) return A[i]; return null; };

/* ── naissance d'une zone : (indice de la bougie d'origine, côté à la naissance) ── */
export function naissance(h1, zone, a, { coteActuel = null, pivs = null, R = REGLES } = {}) {
  const n = h1.length, tol = R.toucheAtr * a, i0 = Math.max(1, n - R.regard);
  if (zone.kind === 'sr' && pivs) { const q = pivs.find(x => x.p >= zone.bas - tol && x.p <= zone.haut + tol); if (q) return { i: q.i, cote: q.sorte === 'sommet' ? 'resistance' : 'support', pivot: true }; }
  for (let i = i0; i < n; i++) {
    const b = h1[i], av = h1[i - 1];
    if (b.h >= zone.bas - tol && b.h <= zone.haut + tol && av.c < zone.bas) return { i, cote: 'resistance' };
    if (b.l >= zone.bas - tol && b.l <= zone.haut + tol && av.c > zone.haut) return { i, cote: 'support' };
  }
  // pas de touche « venant du bon côté » dans la fenêtre : première mèche dans la zone, du côté actuel
  if (coteActuel) for (let i = i0; i < n; i++) { const b = h1[i], x = coteActuel === 'resistance' ? b.h : b.l; if (x >= zone.bas - tol && x <= zone.haut + tol) return { i, cote: coteActuel }; }
  return null;
}
/* ── vie d'une zone : suite de segments [naissance → invalidation], le dernier seul peut être actif ── */
export function vie(h1, zone, a, nais, R = REGLES) {
  const segs = []; let cote = nais.cote, i0 = nais.i; const n = h1.length;
  for (let k = 0; k <= R.retourneesMax; k++) {
    let inval = -1;
    for (let i = i0 + 1; i < n; i++) { const c = h1[i].c; if (cote === 'resistance' ? c > zone.haut + R.invalidationAtr * a : c < zone.bas - R.invalidationAtr * a) { inval = i; break; } }
    segs.push({ cote, i0, i1: inval, retournee: k > 0 });
    if (inval < 0) break;
    cote = cote === 'resistance' ? 'support' : 'resistance'; i0 = inval;
  }
  return segs;
}
const epaisseurDessin = (z, a, R) => Math.min(z.haut - z.bas, R.epaisseurAtr * a);

/* ── zones à afficher ──
   entrees : [{ id, kind, bas, haut, p?, nom, texte?, detail?, tDebut? (secours), prob?, probN?, force? }] ; renvoie { actives, traces, a } */
export function zonesAffichage(h1, entrees, { prix = null, a = null, R = REGLES } = {}) {
  const A = a || atrH1(h1); if (!A || h1.length < 30) return { actives: [], traces: [], a: A || null };
  const actives = [], traces = [], pivs = pivots(h1, R.pivotKNiveau, Math.max(R.pivotKNiveau, h1.length - R.regard), h1.length - 1);
  for (const e of entrees) {
    const z = { ...e, p: e.p ?? (e.bas + e.haut) / 2 };
    const ref = prix ?? h1[h1.length - 1].c, coteAct = z.p > ref ? 'resistance' : 'support';
    let nais = naissance(h1, z, A, { coteActuel: coteAct, pivs, R });
    if (!nais) {   // origine hors de la fenêtre chargée : bord gauche des données, côté actuel (jamais inventé : signalé « début coupé »)
      let i = -1; const t = e.tDebut; if (t != null) i = h1.findIndex(b => b.t >= t);
      nais = { i: i < 0 ? 0 : i, cote: coteAct, coupe: i <= 0 };
    }
    for (const s of vie(h1, z, A, nais, R)) {
      const base = { ...z, cote: s.cote, tDebut: h1[s.i0].t, retournee: s.retournee, coupe: !!nais.coupe && s.i0 === nais.i, epaisseur: epaisseurDessin(z, A, R) };
      if (s.i1 < 0) actives.push({ ...base, actif: true, tFin: null });
      else traces.push({ ...base, actif: false, tFin: h1[s.i1].t, tCloture: h1[s.i1].t + 3600e3 });
    }
  }
  return { actives: fusion(actives, A, R, prix), traces: traces.sort((x, y) => y.tFin - x.tFin).slice(0, R.tracesMax), a: A };
}
/* fusion : même côté, mêmes dates d'activité (toutes actives), bornes qui se touchent à 0,1 ATR → UNE zone avec la liste de ses éléments */
export function fusion(L, a, R = REGLES, prix = null) {
  const s = L.slice().sort((x, y) => x.bas - y.bas), out = [];
  for (const z of s) {
    const g = out.find(q => q.cote === z.cote && z.bas <= q.haut + R.fusionAtr * a && z.haut >= q.bas - R.fusionAtr * a);
    if (g) {
      g.elements.push(...(z.elements || [z])); g.bas = Math.min(g.bas, z.bas); g.haut = Math.max(g.haut, z.haut); g.tDebut = Math.min(g.tDebut, z.tDebut);
      g.retournee = g.retournee || z.retournee;
      if ((z.probN || 0) > (g.probN || 0)) { g.prob = z.prob; g.probN = z.probN; g.probSrc = z.probSrc; }
    } else out.push({ ...z, elements: z.elements || [z] });
  }
  return out.map(z => {
    const p = z.elements.length > 1 ? z.elements.reduce((u, e) => u + e.p, 0) / z.elements.length : z.p, e = Math.min(z.haut - z.bas, R.epaisseurAtr * a), dist = prix == null ? 0 : Math.abs(p - prix);
    return { ...z, p, epaisseur: e, dist, distAtr: dist / a, id: z.elements.map(q => q.id).join('+') };
  }).sort((x, y) => x.dist - y.dist).map((z, k) => ({ ...z, proche: k < R.proches }));
}
/* texte de survol d'une zone */
export function detailZone(z, fmt = nb) {
  const L = [`${z.cote === 'resistance' ? 'Résistance' : 'Support'}${z.retournee ? ' retournée' : ''} ${fmt(z.bas)}–${fmt(z.haut)}`, `née le ${hp(z.tDebut)} (heure de Paris)${z.coupe ? ' ou avant (historique chargé coupé)' : ''}`];
  L.push(z.actif === false ? `invalidée par une clôture H1 le ${hp(z.tCloture)} : trace grisée` : `active : invalidée par une clôture H1 à plus de ${REGLES.invalidationAtr} ATR au-delà`);
  if (z.elements && z.elements.length > 1) L.push('éléments fusionnés : ' + z.elements.map(e => e.nom + (e.texte ? ` (${e.texte})` : '')).join(' ; '));
  else if (z.nom) L.push(z.nom);
  if (z.probSrc) L.push('mesure : ' + z.probSrc);
  return L;
}

/* ══ LIQUIDITÉ ══
   items : [{ p, sorte:'haute'|'basse', raisons?, texte?, depuis?, balayeeT? }] ; une liquidité = au moins 2 pivots égaux (≤ 0,2 ATR), ou un extrême de période (veille, semaine, mois) */
export function liquiditeAffichage(h1, items, { a = null, R = REGLES } = {}) {
  const A = a || atrH1(h1); if (!A || h1.length < 30) return { actives: [], balayees: [] };
  const pv = pivots(h1, R.pivotK, 0, h1.length - 1), out = { actives: [], balayees: [] };
  for (const it of items) {
    const sorte = it.sorte, typePv = sorte === 'haute' ? 'sommet' : 'creux';
    const proches = pv.filter(x => x.sorte === typePv && Math.abs(x.p - it.p) <= R.egauxAtr * A);
    // balayage = première mèche au-delà du prix moyen des pivots, après le 1er pivot (jamais avant : causal)
    const moy = proches.length ? proches.reduce((s, x) => s + x.p, 0) / proches.length : it.p;
    const max = proches.length ? (sorte === 'haute' ? Math.max(...proches.map(x => x.p)) : Math.min(...proches.map(x => x.p))) : it.p;
    let tPremier = proches.length ? proches[0].t : (it.depuis ?? h1[h1.length - 1].t), iDernier = proches.length ? proches[proches.length - 1].i : h1.findIndex(b => b.t >= (it.depuis ?? 0));
    if (iDernier < 0) iDernier = h1.length - 1;
    // les pivots comptent seulement s'ils sont avant le balayage ; les suivants ne sont pas des pivots de cette liquidité
    let ib = -1; for (let i = (proches.length ? proches[0].i : iDernier) + 1; i < h1.length; i++) if (sorte === 'haute' ? h1[i].h > max : h1[i].l < max) { ib = i; break; }
    const avant = ib < 0 ? proches : proches.filter(x => x.i < ib), n = avant.length;
    if (n >= 1) { tPremier = avant[0].t; iDernier = avant[avant.length - 1].i; }
    const p = n >= 2 ? avant.reduce((s, x) => s + x.p, 0) / n : (n === 1 ? avant[0].p : it.p);
    const tDernier = h1[Math.min(iDernier, h1.length - 1)].t;
    const nom = sorte === 'haute' ? 'sommets' : 'creux';
    const texte = n >= 2 ? `Liquidité ${sorte} ${nb(p)} (${n} ${nom})` : (it.texte || `Liquidité ${sorte} ${nb(p)}${it.raisons && it.raisons.length ? ' (' + it.raisons.join(', ') + ')' : ''}`);
    const L = { p, sorte, n, tPremier, tDernier, texte, raisons: it.raisons || [], balayeeT: ib >= 0 ? h1[ib].t : (it.balayeeT ?? null), tBalayage: ib >= 0 ? h1[ib].t : (it.balayeeT ?? null),
      detail: [n >= 2 ? `${n} ${nom} égaux (à ${nb(R.egauxAtr, 1)} ATR près) du ${hp(tPremier)} au ${hp(tDernier)}` : `niveau unique : ${(it.raisons || []).join(', ') || 'extrême de période'}`, ib >= 0 ? `balayée le ${hp(h1[ib].t)} (mèche au-delà) : la ligne s'arrête` : 'non balayée : la ligne continue en pointillé'] };
    (L.tBalayage != null ? out.balayees : out.actives).push(L);
  }
  out.balayees = out.balayees.sort((x, y) => y.tBalayage - x.tBalayage).slice(0, R.balayeesMax);
  return out;
}
/* regroupe de la liquidité identique (même côté, à moins de 0,2 ATR) en une seule ligne */
export function dedoublonnerLiquidite(L, a, R = REGLES) {
  const out = [];
  for (const z of L.slice().sort((x, y) => y.n - x.n)) if (!out.some(q => q.sorte === z.sorte && Math.abs(q.p - z.p) <= R.egauxAtr * a && (q.tBalayage || 0) === (z.tBalayage || 0))) out.push(z);
  return out;
}
