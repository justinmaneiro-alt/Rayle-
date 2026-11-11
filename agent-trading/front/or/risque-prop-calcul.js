/* ═════════════ RISQUE PROP : calculs purs du panneau « Risque prop » (testés) ═════════════
   Compte Kraken Pro de départ : 10 000 $, objectif +10 %, perte journalière maximale 3 %, perte totale maximale 6 % (réglages communs avec le gardien : mêmes limites, jamais deux configurations).
   Alerte douce à 70 % de la perte journalière autorisée. AUCUN blocage d'ordre : le panneau affiche, il ne décide pas. Jamais « achète » / « vends ».
   Contexte à la pose d'une position : la zone la plus proche, la probabilité MESURÉE (ou « non mesurée »), l'état du marché au moment de la pose ; enregistré à part (ajout seul), rattaché au trade du journal par l'heure. */
import { etatGardien, taillePosition, DEFAUTS } from './gardien-calcul.js';
import { risqueDollars } from './journal-calcul.js';
import { KRAKEN } from './config-or.js';

export const PROP = Object.freeze({ capital: 10000, objectifPct: 10, limiteJourPct: 3, limiteTotalePct: 6, alerteDouceFraction: 0.7, risqueDefautPct: 0.5 });
const num = x => (Number.isFinite(+x) ? +x : null);
const defini = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null));   // une clé absente ne doit jamais écraser un défaut

/* état du compte prop : restes en $ et en %, part utilisée de la perte journalière, alerte douce */
export function etatProp(trades, { reglages = {}, maintenant = Date.now(), latent = 0 } = {}) {
  const R = { ...DEFAUTS, ...PROP, capital: PROP.capital, limiteJour: PROP.limiteJourPct, limiteTotale: PROP.limiteTotalePct, objectif: PROP.objectifPct, ...defini(reglages) };
  const G = etatGardien(trades, { reglages: { capital: R.capital, limiteJour: R.limiteJour, limiteTotale: R.limiteTotale, objectif: R.objectif, base: R.base || 'solde', stopJour: R.stopJour, alerteJour: R.alerteJour, pertesDeSuite: R.pertesDeSuite, alertesTotales: R.alertesTotales }, maintenant, latent });
  const C = G.capital, limJ$ = C * R.limiteJour / 100, limT$ = C * R.limiteTotale / 100, perteJ$ = Math.max(0, -G.pnlJour), utilise = limJ$ ? perteJ$ / limJ$ : 0;
  return {
    capital: C, equite: G.actuel, pnlJour: G.pnlJour, realise: G.realise,
    limiteJour$: limJ$, perteJour$: perteJ$, perteJourPct: G.perteJourPct, resteJour$: Math.max(0, limJ$ - perteJ$), resteJourPct: Math.max(0, R.limiteJour - G.perteJourPct), utiliseJour: utilise,
    limiteTotale$: limT$, perteTotale$: Math.max(0, C - G.actuel), perteTotalePct: G.perteTotalePct, margeTotale$: Math.max(0, G.actuel - (C - limT$)), margeTotalePct: Math.max(0, R.limiteTotale - G.perteTotalePct),
    objectif$: C * R.objectif / 100, gain$: G.actuel - C, gainPct: G.gainPct, resteObjectif$: Math.max(0, C * (1 + R.objectif / 100) - G.actuel), avancement: G.avancement,
    alerteDouce: utilise >= PROP.alerteDouceFraction && utilise < 1, limiteJourAtteinte: utilise >= 1, statut: G.statut, jour: G.tradesJour, seuilDouxPct: R.limiteJour * PROP.alerteDouceFraction, seuilDoux$: limJ$ * PROP.alerteDouceFraction
  };
}
/* risque d'une position : en $ et en % de l'équité ; taille connue (trade ouvert) ou suggérée */
export function risquePosition({ entree, stop, taille, equite, tailleContrat = KRAKEN.tailleContrat }) {
  const e = num(entree), s = num(stop), q = num(taille), eq = num(equite);
  if (!(e > 0) || !(s > 0) || !(q > 0)) return { ok: false, raison: 'il manque l’entrée, le stop ou la taille' };
  const dist = Math.abs(e - s), r$ = dist * q * tailleContrat; return { ok: true, distance: dist, risque$: r$, risquePct: eq > 0 ? r$ / eq * 100 : null };
}
/* taille suggérée pour un risque choisi (en % de l'équité) */
export const tailleSuggeree = ({ equite, risquePct, entree, stop }) => taillePosition({ equite, risquePct, entree, stop });
export const risqueDuTradeOuvert = t => { const r = risqueDollars(t); return r == null ? null : r * 1; };

/* message de l'alerte douce (jamais un ordre) */
export function messageAlerteDouce(E) {
  const f = x => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `Alerte douce : ${Math.round(E.utiliseJour * 100)} % de ta perte journalière autorisée est utilisée (${f(E.perteJourPct)} % sur ${f(E.limiteJour$ / E.capital * 100)} %), il reste ${Math.round(E.resteJour$)} dollars avant la limite. Information seulement : rien n'est bloqué.`;
}
/* alerte douce : se déclenche UNE fois par jour de Paris et par franchissement du seuil (mémoire fournie par l'appelant) */
export function doitAlerter(E, memoire, jourCle) { if (!E.alerteDouce) return false; if (memoire && memoire.jour === jourCle && memoire.faite) return false; return true; }

/* ── contexte à la pose d'une position ── */
const ph = z => ({ bas: z.bas, haut: z.haut, cote: z.cote, nom: (z.elements && z.elements[0] && z.elements[0].nom) || z.nom || (z.cote === 'support' ? 'Support' : 'Résistance'), retournee: !!z.retournee, tDebut: z.tDebut });
export function contextePose({ pos, t, prix, a, zonesAffichees = [], zonesRetour = [], etatMarche = null, killzone = null, evenements = [] }) {
  const e = num(pos && pos.entree); if (!(e > 0)) return null;
  const A = a || 1, proches = zonesAffichees.map(z => ({ z, d: e >= z.bas && e <= z.haut ? 0 : Math.min(Math.abs(e - z.bas), Math.abs(e - z.haut)) })).sort((x, y) => x.d - y.d), z0 = proches[0];
  const zone = z0 && z0.d <= 1.5 * A ? { ...ph(z0.z), distAtr: z0.d / A, dedans: z0.d === 0 } : null;
  const pr = zonesRetour.map(z => ({ z, d: e >= z.bas && e <= z.haut ? 0 : Math.min(Math.abs(e - z.bas), Math.abs(e - z.haut)) })).sort((x, y) => x.d - y.d)[0];
  const proba = pr && pr.d <= 1.5 * A ? (pr.z.prob != null ? { valeur: pr.z.prob, n: pr.z.probN || null, source: pr.z.probSrc || 'mesurée', mesuree: true } : { valeur: null, n: pr.z.probN || 0, source: 'non mesurée (pas assez de cas)', mesuree: false }) : { valeur: null, n: 0, source: zone ? 'zone sans probabilité mesurée' : 'aucune zone proche', mesuree: false };
  return { t, prix, atr: a || null, sens: pos.sens || (num(pos.stop) != null && pos.stop < e ? 'achat' : 'vente'), entree: e, stop: num(pos.stop), objectif: num(pos.objectif), zone, probabilite: proba, marche: etatMarche, killzone, evenements: evenements.slice(0, 6) };
}
/* rattache les contextes de pose aux trades du journal (à 20 minutes près, jamais deux fois le même contexte) */
export function rattacher(poses, trades, deja = {}) {
  const out = { ...deja }, pris = new Set(Object.values(deja).map(x => x.t));
  for (const tr of trades) { if (out[tr.id] || !tr.tEntree) continue; let best = null; for (const p of poses) { if (pris.has(p.t)) continue; if (p.sens && tr.sens && p.sens !== tr.sens) continue; const d = Math.abs(p.t - tr.tEntree); if (d <= 20 * 60e3 && (!best || d < best.d)) best = { p, d }; } if (best) { out[tr.id] = best.p; pris.add(best.p.t); } }
  return out;
}
export function phraseContexte(c) {
  if (!c) return 'contexte de pose indisponible';
  const f = (x, d = 0) => (x == null ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const L = [`${c.sens} à ${f(c.entree, 2)}${c.stop ? ', stop ' + f(c.stop, 2) : ''}${c.objectif ? ', objectif ' + f(c.objectif, 2) : ''}`];
  L.push(c.zone ? `zone la plus proche : ${c.zone.cote === 'support' ? 'support' : 'résistance'}${c.zone.retournee ? ' retournée' : ''} ${f(c.zone.bas, 1)}–${f(c.zone.haut, 1)}${c.zone.dedans ? ' (entrée dans la zone)' : ' à ' + f(c.zone.distAtr, 1) + ' ATR'}` : 'aucune zone à moins de 1,5 ATR');
  L.push(c.probabilite.mesuree ? `probabilité mesurée ${Math.round(c.probabilite.valeur * 100)} % (${c.probabilite.source})` : `probabilité : ${c.probabilite.source}`);
  if (c.marche) L.push(c.marche); if (c.killzone) L.push('killzone : ' + c.killzone);
  return L.join(' · ');
}
