/* ═════════════ HISTORIQUE DES FLÈCHES v8 (calcul causal par morceaux, cache) — module NOUVEAU, ne modifie aucune règle ═════════════
   Rejoue fleches-simples-v8 (« Direct », règles FIGÉES : voir recherche-or/historique-fleches-sceau.json) bougie par bougie sur une longue série H1 : à chaque bougie le moteur ne voit
   que les bougies déjà closes (rejouer() découpe la série à chaque pas). Pour ne jamais bloquer l'interface, la série est traitée par MORCEAUX : chaque morceau rejoue un
   RECOUVREMENT de bougies avant sa zone (pour reconstruire la mémoire du moteur : anti-aller-retour, 2ᵉ touche, repos) sur un CONTEXTE de prix (niveaux hebdomadaires / mensuels, zones),
   puis seules les flèches de sa propre zone sont gardées ; entre deux morceaux on rend la main (cede) et on annonce la progression.
   Les flèches ne bougent jamais : même identifiant (type|heure|sens|niveau), même place que dans le flux bougie par bougie (testé).
   Cache : clé = empreinte de la série + empreinte des règles ; fichier en Node, IndexedDB dans le navigateur. */
import * as V8 from './fleches-simples-v8.js';
import { zonesDirect } from './zones-direct.js';

export const CHRONO = Object.freeze({ morceau: 800, recouvrement: 640, contexte: 3000, version: 'historique-v1' });
const H = 3600e3;

/* un morceau : renvoie ses flèches (indices GLOBAUX) et ses invalidations */
export function calculerMorceau(B, a, b, { zonesA = zonesDirect, recouvrement = CHRONO.recouvrement, contexte = CHRONO.contexte, exclure = null } = {}) {
  const dep = Math.max(V8.DEPART, 40), debutRejeu = Math.max(dep, a - recouvrement), lo = Math.max(0, debutRejeu - contexte);
  const S = B.slice(lo, b), r = V8.rejouer(S, zonesA, { depart: debutRejeu - lo, exclure });
  const fl = [];
  for (const g of r.toutes) {
    const i = g.i + lo; if (i < (a <= dep ? a - 1 : a) || i >= b) continue;   // la toute première bougie jugée est DEPART − 1 (n = DEPART dans rejouer)
    const f = { ...g, i, indexDessin: (g.indexDessin ?? g.i) + lo, indexApparition: (g.indexApparition ?? g.i) + lo }; if (f.touchI != null) f.touchI += lo; fl.push(f);
  }
  return { fleches: fl, invalidees: r.invalidees, alertes: r.alertes || [], retirees: r.retirees || {} };
}

/* calcul complet, asynchrone : cede() est appelé entre deux morceaux (setTimeout 0 dans la page), onProgres(0..1) */
export async function calculerHistorique(B, { depart = 0, morceau = CHRONO.morceau, recouvrement = CHRONO.recouvrement, contexte = CHRONO.contexte, zonesA = zonesDirect, cede = null, onProgres = null, exclure = null, annule = null } = {}) {
  const closes = B.filter(b => b.c > 0), dep = Math.max(V8.DEPART, 40, depart); const fl = new Map(), inval = new Map(), retirees = {};
  const a0 = Math.max(dep, 40); let n = 0;
  for (let a = a0; a < closes.length; a += morceau) {
    if (annule && annule()) return null;
    const b = Math.min(closes.length, a + morceau), m = calculerMorceau(closes, a, b, { zonesA, recouvrement, contexte, exclure });
    for (const f of m.fleches) fl.set(f.id, f);
    for (const q of m.invalidees) inval.set(q.id, q.invalideeT);
    for (const [k, v] of Object.entries(m.retirees)) retirees[k] = (retirees[k] || 0) + v;
    n += b - a; if (onProgres) onProgres(Math.min(1, n / Math.max(1, closes.length - a0)));
    if (cede) await cede();
  }
  const L = [...fl.values()].sort((x, y) => x.i - y.i || (x.id < y.id ? -1 : 1));
  for (const f of L) if (inval.has(f.id)) { f.invalidee = true; f.invalideeT = inval.get(f.id); }
  return { fleches: L, retirees, n: closes.length, version: V8.VERSION, calculeLe: Date.now(), invalidees: [...inval].map(([id, invalideeT]) => ({ id, invalideeT })) };
}

/* flèches visibles par défaut : retournements et rebonds de base, colorées (pas contre-tendance) ; les cassures MA200 restent masquées */
export const colorees = L => L.filter(f => !f.contre && f.type !== 'ma_cassure');

/* ── fenêtre d'historique choisie ── */
export const FENETRES = Object.freeze({ '1m': 30, '3m': 91, '6m': 182, tout: null });
export const depuisFenetre = (cle, maintenant) => { const j = FENETRES[cle]; return j == null ? 0 : maintenant - j * 86400e3; };

/* ── empreintes (cache) ── */
export function empreinte(texte) { let h1 = 0x811c9dc5, h2 = 0x9747b28c; for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519); } return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); }
export const empreinteRegles = () => empreinte(CHRONO.version + '|' + V8.VERSION + '|' + JSON.stringify(V8.P, Object.keys(V8.P).sort()) + '|' + CHRONO.morceau + '|' + CHRONO.recouvrement + '|' + CHRONO.contexte);
export const empreinteSerie = B => B.length ? empreinte(B.length + '|' + B[0].t + '|' + B[B.length - 1].t + '|' + B[B.length - 1].c + '|' + B[(B.length >> 1)].c) : '0';

/* cache navigateur (IndexedDB « rayle-or-fleches-histo », magasin « calculs ») : un enregistrement par série (clé = id de la série) ; jamais d'exception vers l'appelant */
export function ouvrirCache(idb = (typeof indexedDB !== 'undefined' ? indexedDB : null)) {
  if (!idb) return { async lire() { return null; }, async ecrire() { return false; }, async supprimer() { return false; } };
  const base = new Promise((ok, ko) => { const r = idb.open('rayle-or-fleches-histo', 1); r.onupgradeneeded = () => r.result.createObjectStore('calculs'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  const tx = async (mode, f) => { const d = await base; return new Promise((ok, ko) => { const t = d.transaction('calculs', mode), s = t.objectStore('calculs'), q = f(s); t.oncomplete = () => ok(q && q.result); t.onerror = () => ko(t.error); }); };
  return { async lire(cle) { try { return (await tx('readonly', s => s.get(cle))) || null; } catch (e) { return null; } }, async ecrire(cle, v) { try { await tx('readwrite', s => s.put(v, cle)); return true; } catch (e) { return false; } }, async supprimer(cle) { try { await tx('readwrite', s => s.delete(cle)); return true; } catch (e) { return false; } } };
}

/* calcul avec cache : reprend un calcul déjà fait pour la même empreinte de règles ; si la série a seulement GRANDI (même début, mêmes bougies communes), on ne recalcule que la fin (à partir de recouvrement + 1 morceau avant) */
export async function historiqueAvecCache(B, cache, { id = 'or-h1', onProgres = null, cede = null, annule = null, zonesA = zonesDirect, calculer = calculerHistorique } = {}) {
  const er = empreinteRegles(), es = empreinteSerie(B), clef = id;
  let ancien = await cache.lire(clef);
  if (ancien && ancien.regles === er && ancien.serie === es) return { ...ancien.res, depuisCache: true };
  const exact = await cache.lire(clef + '|' + es); if (exact && exact.regles === er && exact.serie === es) return { ...exact.res, depuisCache: true };   // enregistrement exact d'une série déjà calculée (2e série, autre instrument ou retour en arrière)
  let depart = 0, base = null;
  if (ancien && ancien.regles === er && ancien.res && ancien.res.n > 0) {
    const t0 = ancien.t0, t1 = ancien.t1, i1 = B.findIndex(b => b.t === t1);
    if (B[0] && B[0].t === t0 && i1 >= 0 && i1 === ancien.res.n - 1) { depart = Math.max(0, i1 - CHRONO.morceau); base = ancien.res.fleches.filter(f => f.i < depart); }
  }
  const res = await calculer(B, { depart: Math.max(depart, 0), onProgres, cede, annule, zonesA }); if (!res) return null;
  if (base) { const ids = new Set(res.fleches.map(f => f.id)); res.fleches = base.filter(f => !ids.has(f.id)).concat(res.fleches); res.reprise = true; }
  const enr = { regles: er, serie: es, t0: B[0] ? B[0].t : 0, t1: B.length ? B[B.length - 1].t : 0, res }; await cache.ecrire(clef, enr);
  try { const idx = (await cache.lire(clef + '|index')) || { l: [] }, l = [es, ...idx.l.filter(x => x !== es)]; await cache.ecrire(clef + '|' + es, enr); await cache.ecrire(clef + '|index', { l: l.slice(0, 3) }); if (cache.supprimer) for (const x of l.slice(3)) await cache.supprimer(clef + '|' + x); } catch (e) { /* cache seulement */ }   // garde les 3 derniers calculs exacts
  return res;
}
