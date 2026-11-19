/* ═════════════ DESSINS : validation et fusion (module PUR, partagé par l'application et par le Worker Portefeuille) ═════════════
   Chaque dessin porte `maj` (ms) : en cas de conflit entre deux appareils, le plus récent gagne, champ par champ non (dessin entier). Un dessin supprimé reste une « pierre tombale » { id, supprime: true, maj }
   pendant 30 jours pour que la suppression se propage aux autres appareils. Les événements (flèches) se fusionnent par UNION sur l'identifiant : une flèche annoncée par un appareil (vueLe) n'est pas ré-annoncée par les autres. */
export const MAX_DESSINS = 300, MAX_EVENEMENTS = 200, JOURS_PIERRE = 30;
const TYPES = ['horizontale', 'tendance', 'boite', 'fibo'], UNITES = ['H1', 'H4', 'J'];
const nb = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const idOk = s => typeof s === 'string' && /^[A-Za-z0-9:._|-]{1,80}$/.test(s);

function nettoyerEvenement(e) {
  if (!e || !idOk(e.id) || !['rebond', 'cassure', 'retest'].includes(e.type) || !(e.dir === 1 || e.dir === -1) || nb(e.t) == null || nb(e.tFin) == null) return null;
  return { id: e.id, niveauId: idOk(e.niveauId) ? e.niveauId : null, type: e.type, dir: e.dir, unite: UNITES.includes(e.unite) ? e.unite : 'H4', t: e.t, tFin: e.tFin, entree: nb(e.entree), niveau: nb(e.niveau), volRatio: nb(e.volRatio), atr: nb(e.atr), vueLe: nb(e.vueLe) };
}
/* dessin (ou pierre tombale) → copie nettoyée, ou null */
export function nettoyerDessin(d) {
  if (!d || typeof d !== 'object' || !idOk(d.id) || nb(d.maj) == null) return null;
  if (d.supprime === true) return { id: d.id, supprime: true, maj: d.maj };
  if (!TYPES.includes(d.type) || !UNITES.includes(d.unite)) return null;
  const o = { id: d.id, type: d.type, unite: d.unite, couleur: typeof d.couleur === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.couleur) ? d.couleur : '#8fd0e3', verrou: !!d.verrou, alerte: d.alerte !== false, cree: nb(d.cree) ?? d.maj, maj: d.maj };
  if (d.type === 'horizontale') { if (!(nb(d.p) > 0)) return null; o.p = d.p; }
  else { for (const k of ['t1', 't2']) { if (nb(d[k]) == null) return null; o[k] = d[k]; } if (d.type === 'boite') { if (!(nb(d.bas) > 0) || !(nb(d.haut) > 0)) return null; o.bas = d.bas; o.haut = d.haut; } else { for (const k of ['p1', 'p2']) { if (!(nb(d[k]) > 0)) return null; o[k] = d[k]; } if (d.type === 'fibo') o.auto = !!d.auto; } }
  o.evenements = (Array.isArray(d.evenements) ? d.evenements : []).slice(-MAX_EVENEMENTS).map(nettoyerEvenement).filter(Boolean);
  return o;
}
export const nettoyerListe = L => (Array.isArray(L) ? L : []).slice(0, MAX_DESSINS * 2).map(nettoyerDessin).filter(Boolean);
/* union des événements par id ; vueLe : la plus ancienne annonce connue (nul = jamais annoncée) */
function unirEvenements(a = [], b = []) {
  const m = new Map(); for (const e of [...a, ...b]) { const x = m.get(e.id); if (!x) m.set(e.id, { ...e }); else x.vueLe = x.vueLe != null && e.vueLe != null ? Math.min(x.vueLe, e.vueLe) : (x.vueLe ?? e.vueLe ?? null); }
  return [...m.values()].sort((p, q) => p.tFin - q.tFin).slice(-MAX_EVENEMENTS);
}
/* fusion de deux listes (locale et distante) : le plus récent gagne ; événements en union ; pierres tombales de plus de 30 jours supprimées */
export function fusionner(local = [], distant = [], maintenant = Date.now()) {
  const m = new Map();
  for (const d of [...local, ...distant]) {
    const x = m.get(d.id); if (!x) { m.set(d.id, d); continue; }
    const gagnant = d.maj > x.maj ? d : x, autre = gagnant === d ? x : d;
    m.set(d.id, gagnant.supprime ? gagnant : { ...gagnant, evenements: unirEvenements(gagnant.evenements, autre.supprime ? [] : autre.evenements) });
  }
  return [...m.values()].filter(d => !(d.supprime && maintenant - d.maj > JOURS_PIERRE * 86400e3)).sort((p, q) => (p.cree || p.maj) - (q.cree || q.maj)).slice(-MAX_DESSINS);
}
export const visibles = L => (L || []).filter(d => !d.supprime);
/* suppression : pierre tombale */
export const supprimer = (L, id, maintenant = Date.now()) => (L || []).map(d => (d.id === id ? { id, supprime: true, maj: maintenant } : d));
export const remplacer = (L, o) => { const i = (L || []).findIndex(d => d.id === o.id); const R = (L || []).slice(); if (i >= 0) R[i] = o; else R.push(o); return R; };
