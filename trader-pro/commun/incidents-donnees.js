/* ═════════════ INCIDENTS DE DONNÉES + COHÉRENCE DES PRIX (v7, phase 1) ═════════════
   · journal des incidents (série raccordée refusée, prix incohérents) lu par la page « État des données » ;
   · registre des derniers prix vus par chaque surface (Classique, Volume, Marchés, accueil) et contrôle : tous identiques à 0,5 % près.
   Stockage local (appareil), injectable pour les tests. */
const CLE_INC = 'rayle_incidents_donnees_v1', CLE_PRIX = 'rayle_prix_vus_v1';
const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
const lire = (cle, st = ls()) => { try { return JSON.parse(st.getItem(cle)) || null; } catch (e) { return null; } };
const ecrire = (cle, v, st = ls()) => { try { st.setItem(cle, JSON.stringify(v)); } catch (e) { /* stockage plein ou absent */ } };

export function noterIncident(inc, { st = ls(), maintenant = Date.now() } = {}) {
  if (!st) return null; const L = lire(CLE_INC, st) || [], cle = [inc.type, inc.actif, inc.unite, inc.detail].join('|');
  const dernier = L.find(x => x.cle === cle); if (dernier && maintenant - dernier.t < 10 * 60e3) return dernier;
  const e = { ...inc, cle, t: maintenant }; L.unshift(e); ecrire(CLE_INC, L.slice(0, 40), st); return e;
}
export const lireIncidents = ({ st = ls(), maintenant = Date.now(), jours = 3 } = {}) => ((st && lire(CLE_INC, st)) || []).filter(x => maintenant - x.t < jours * 86400e3);

/* source : 'classique' | 'volume' | 'marches' | 'accueil' ; prix en unités de l'actif (pas d'échelle d'affichage) */
export function noterPrix(actif, source, prix, { st = ls(), maintenant = Date.now() } = {}) {
  if (!st || !actif || !source || !Number.isFinite(prix) || prix <= 0) return; const R = lire(CLE_PRIX, st) || {}; (R[actif] = R[actif] || {})[source] = { p: prix, t: maintenant }; ecrire(CLE_PRIX, R, st);
}
/* écarts : pour chaque actif, les surfaces vues depuis moins de `fraicheurMs` dont le prix s'écarte de plus de `tol` de la médiane */
export function ecartsPrix(R, { tol = 0.005, fraicheurMs = 15 * 60e3, maintenant = Date.now() } = {}) {
  const out = []; for (const [actif, S] of Object.entries(R || {})) {
    const v = Object.entries(S).filter(([, x]) => maintenant - x.t < fraicheurMs); if (v.length < 2) continue;
    const s = v.map(([, x]) => x.p).sort((a, b) => a - b), med = s[s.length >> 1];
    const hors = v.filter(([, x]) => Math.abs(x.p / med - 1) > tol); if (hors.length) out.push({ actif, mediane: med, hors: hors.map(([k, x]) => ({ source: k, prix: x.p, ecart: x.p / med - 1 })), vus: v.map(([k]) => k) });
  } return out;
}
export function controlerCoherence({ st = ls(), maintenant = Date.now() } = {}) {
  const R = st ? lire(CLE_PRIX, st) : null, E = ecartsPrix(R, { maintenant });
  for (const e of E) noterIncident({ type: 'coherence', actif: e.actif, detail: e.hors.map(h => `${h.source} ${h.prix} (${(h.ecart * 100).toFixed(2)} %)`).join(' ; ') + ' contre la médiane ' + e.mediane }, { st, maintenant });
  return E;
}
