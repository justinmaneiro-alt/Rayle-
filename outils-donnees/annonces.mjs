/* ═════════════ MÉMOIRE DES ANNONCES : réaction mesurée de mes actifs à 15 min, 1 h, 4 h et à la clôture du jour ═════════════
   Pour chaque annonce du calendrier (impact fort ou moyen) qui est passée, on mesure sur les bougies M15 ce qu'ont fait mes actifs ; le résultat est gardé dans reseau-annonces.json (branche « donnees »)
   et sert aux pages détail (« les 6 dernières fois… », nombre de cas) et à la note d'importance. L'historique de départ est amorcé avec les annonces à date RÉGULIÈRE (NFP : 1er vendredi du mois 8 h 30 New York ;
   stocks de pétrole EIA : mercredi 10 h 30 New York) sur les 58 derniers jours (les bougies M15 gratuites remontent à 60 jours) ; les autres types (CPI, FOMC…) s'accumulent semaine après semaine.
   Rien n'est inventé : un horizon non mesurable (marché fermé, pas encore atteint) reste vide. */
import fs from 'node:fs'; import path from 'node:path';
import { cleType, familleDe, mesurerAnnonce, datesNfp, datesEia, ACTIFS } from '../trader-pro/marches/annonce.js';

export const SYM15 = { or: 'GC_F', us100: '_NDX', us500: '_GSPC', btc: 'BTC_USD', sol: 'SOL_USD', petrole: 'CL_F', dxy: 'DX_Y_NYB' };
export const MAX_ENTREES = 500;
const lireJson = (d, n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { return null; } };
const versBougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
export function series15(dossier) { const o = {}; for (const [id, sym] of Object.entries(SYM15)) { const f = lireJson(dossier, `bougies-${sym}-15m.json`); if (f && Array.isArray(f.b)) o[id] = versBougies(f.b); } return o; }

/* met à jour la mémoire : `evenements` = annonces lues du calendrier (lireEvenements) ; renvoie { entrees, ajoutees, mesurees } */
export function majAnnonces(memoire, evenements, series, maintenant = Date.now(), { amorcer = true } = {}) {
  const M = { entrees: (memoire && memoire.entrees ? memoire.entrees : []).map(e => ({ ...e })), amorce: !!(memoire && memoire.amorce) }; let ajoutees = 0, mesurees = 0;
  const present = new Set(M.entrees.map(e => e.k + '@' + e.t)), ajouter = (titre, pays, t) => { const k = cleType(titre, pays); if (present.has(k + '@' + t)) return; present.add(k + '@' + t); M.entrees.push({ k, t, titre, pays, mesures: {}, complete: false }); ajoutees++; };
  if (amorcer && !M.amorce) { const de = maintenant - 58 * 86400e3, a = maintenant - 3 * 3600e3; for (const t of datesNfp(de, a)) ajouter('Non-Farm Employment Change', 'USD', t); for (const t of datesEia(de, a)) ajouter('Crude Oil Inventories', 'USD', t); M.amorce = true; }
  for (const e of evenements || []) if (e.t < maintenant - 15 * 60e3 && (e.impact === 'fort' || e.impact === 'moyen') && e.pays === 'USD') ajouter(e.titre, e.pays, e.t);
  for (const x of M.entrees) {
    if (x.complete || x.t > maintenant - 20 * 60e3) continue;
    for (const a of familleDe(x.titre).actifs.filter(id => ACTIFS.includes(id))) { if (!series[a]) continue; const m = mesurerAnnonce(x.t, series[a], maintenant), avant = x.mesures[a] || {}, fusion = {}; for (const k of Object.keys(m)) fusion[k] = Number.isFinite(m[k]) ? m[k] : (Number.isFinite(avant[k]) ? avant[k] : null); if (JSON.stringify(fusion) !== JSON.stringify(avant)) mesurees++; x.mesures[a] = fusion; }
    const tout = Object.values(x.mesures); x.complete = (tout.length > 0 && tout.every(m => Number.isFinite(m.pj))) || maintenant > x.t + 36 * 3600e3;
  }
  M.entrees = M.entrees.sort((a, b) => a.t - b.t).slice(-MAX_ENTREES); return { memoire: M, ajoutees, mesurees };
}
export function lireMemoireAnnonces(dossier) { return lireJson(dossier, 'reseau-annonces.json') || { entrees: [], amorce: false }; }
export function ecrireMemoireAnnonces(dossier, M) { fs.writeFileSync(path.join(dossier, 'reseau-annonces.json'), JSON.stringify(M)); }
