/* ═════════════ NIVEAUX DE L'OR : supports / résistances et zones de volume (pur, testé, SANS regarder le futur) ═════════════
   Tout est calculé sur la RÉFÉRENCE (Binance XAUUSDT) avec les seules bougies déjà closes avant l'instant t, puis décalé de l'écart
   Kraken − Binance mesuré pour l'affichage (le graphique est en prix Kraken).
   Supports / résistances : haut et bas de la veille (jour de Paris), de la semaine précédente (lundi → dimanche, Paris), des trois dernières
   séances closes (Asie, Londres, New York) et niveaux ronds de 50 $ autour du prix.
   Zones de volume : profil des 5 derniers jours (volume de chaque M15 réparti sur son étendue), cases ≥ 80e centile fusionnées, 4 au plus. */
import { heureLocale, dateParis, seance } from './temps-or.js';
import { REGLES } from './config-or.js';

const JOUR = 86400e3;
/* clé du jour de Paris et de la semaine (lundi) d'un instant */
export function cleJour(t) { return dateParis(t); }
export function cleSemaine(t) {
  const { j } = heureLocale(t, 'Europe/Paris'), d = new Date(dateParis(t) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((j + 6) % 7)); return d.toISOString().slice(0, 10);
}
const extremes = L => L.length ? { h: Math.max(...L.map(b => b.h)), l: Math.min(...L.map(b => b.l)) } : null;

/* supports et résistances à l'instant t (bougies M15 de référence, closes avant t) */
export function niveauxCles(m15, t, { prix = null, rondPas = REGLES.rondPas, ecart = 0 } = {}) {   // ecart : les ronds sont ronds en prix KRAKEN (affiché)
  const avant = m15.filter(b => b.t + 15 * 60e3 <= t); if (!avant.length) return [];
  const jour = cleJour(t), sem = cleSemaine(t), out = [];
  // veille : dernier jour de Paris complet avant aujourd'hui (le samedi et le dimanche, quasi vides, sont sautés s'il y a moins de 20 bougies)
  const parJour = new Map(); for (const b of avant) { const k = cleJour(b.t); if (k === jour) continue; (parJour.get(k) || parJour.set(k, []).get(k)).push(b); }
  const jours = [...parJour.keys()].sort().reverse(), kv = jours.find(k => parJour.get(k).length >= 20);
  if (kv) { const e = extremes(parJour.get(kv)); out.push({ p: e.h, type: 'veille', nom: 'Veille haut', court: 'V. haut' }, { p: e.l, type: 'veille', nom: 'Veille bas', court: 'V. bas' }); }
  const parSem = new Map(); for (const b of avant) { const k = cleSemaine(b.t); if (k === sem) continue; (parSem.get(k) || parSem.set(k, []).get(k)).push(b); }
  const ks = [...parSem.keys()].sort().pop();
  if (ks) { const e = extremes(parSem.get(ks)); out.push({ p: e.h, type: 'semaine', nom: 'Semaine haut', court: 'S. haut' }, { p: e.l, type: 'semaine', nom: 'Semaine bas', court: 'S. bas' }); }
  // séances : dernière occurrence CLOSE de chacune, dans les 36 dernières heures
  const recent = avant.filter(b => b.t >= t - 36 * 3600e3), seanceCourante = seance(t) + cleJour(t);
  const groupes = new Map(); for (const b of recent) { const s = seance(b.t); if (s === 'soir') continue; const k = s + cleJour(b.t); if (k === seanceCourante) continue; (groupes.get(k) || groupes.set(k, { s, L: [] }).get(k)).L.push(b); }
  const derniere = {}; for (const [k, g] of groupes) if (g.L.length >= 8) derniere[g.s] = g;
  for (const s of ['Asie', 'Londres', 'New York']) if (derniere[s]) { const e = extremes(derniere[s].L); out.push({ p: e.h, type: 'seance', nom: `${s} haut`, court: `${s === 'New York' ? 'NY' : s.slice(0, 3)}. haut` }, { p: e.l, type: 'seance', nom: `${s} bas`, court: `${s === 'New York' ? 'NY' : s.slice(0, 3)}. bas` }); }
  const ref = (prix || avant[avant.length - 1].c) + ecart;
  for (let k = Math.floor(ref * 0.985 / rondPas) * rondPas; k <= ref * 1.015; k += rondPas) if (k > 0) out.push({ p: k - ecart, type: 'rond', nom: `Rond ${k}`, court: String(k) });
  return out;
}

/* profil de volume des n derniers jours avant t ; cases de largeur « pas » */
export function zonesVolume(m15, t, { jours = 5, pas = null, max = 4, centile = 0.8 } = {}) {
  const L = m15.filter(b => b.t + 15 * 60e3 <= t && b.t >= t - jours * JOUR && b.v > 0); if (L.length < 50) return [];
  const p0 = Math.min(...L.map(b => b.l)), p1 = Math.max(...L.map(b => b.h));
  const P = pas || Math.max(0.5, Math.round((p1 - p0) / 120 * 100) / 100), n = Math.max(1, Math.ceil((p1 - p0) / P) + 1), cases = new Float64Array(n);
  for (const b of L) { const i0 = Math.floor((b.l - p0) / P), i1 = Math.floor((b.h - p0) / P), k = i1 - i0 + 1; for (let i = i0; i <= i1; i++) cases[i] += b.v / k; }
  const tri = [...cases].sort((a, b) => a - b), seuil = tri[Math.floor(tri.length * centile)], total = cases.reduce((a, b) => a + b, 0);
  const z = []; let cur = null;
  for (let i = 0; i < n; i++) {
    if (cases[i] >= seuil && cases[i] > 0) { if (!cur) cur = { i0: i, i1: i, v: 0, pic: i }; cur.i1 = i; cur.v += cases[i]; if (cases[i] > cases[cur.pic]) cur.pic = i; }
    else if (cur) { z.push(cur); cur = null; }
  }
  if (cur) z.push(cur);
  const top = z.sort((a, b) => b.v - a.v).slice(0, max), vmax = top.length ? top[0].v : 1;
  return top.map(x => ({ bas: p0 + x.i0 * P, haut: p0 + (x.i1 + 1) * P, p: p0 + (x.pic + 0.5) * P, part: x.v / total, force: x.v / vmax, type: 'volume', nom: 'Zone de volume', court: 'Vol.' }))
    .sort((a, b) => a.p - b.p);
}

/* décale une liste de niveaux / zones de la référence vers le prix Kraken */
export function decaler(L, ecart) {
  const e = Number.isFinite(ecart) ? ecart : 0;
  return L.map(x => ({ ...x, p: x.p + e, ...(x.bas != null ? { bas: x.bas + e, haut: x.haut + e } : {}) }));
}
/* regroupe les niveaux presque confondus (moins de « tol » $) : un seul trait, noms réunis (« Veille haut · Rond 4100 ») */
export function fusionnerNiveaux(L, tol) {
  const s = L.slice().sort((a, b) => a.p - b.p), o = [];
  for (const n of s) {
    const d = o[o.length - 1];
    if (d && n.p - d.p <= tol) { d.noms.push(n.nom); d.types.add(n.type); d.court = d.court.includes(n.court) ? d.court : `${d.court} · ${n.court}`; }
    else o.push({ p: n.p, noms: [n.nom], types: new Set([n.type]), court: n.court });
  }
  return o.map(x => ({ ...x, types: [...x.types], nom: x.noms.join(' · ') }));
}
