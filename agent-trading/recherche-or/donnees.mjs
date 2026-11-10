/* Chargement des données Dukascopy XAU/USD (voir telecharger.mjs). Horodatages UTC (ms). H1 = bougies bid + spread observé (ask − bid à l'ouverture, en $).
   Heure de Paris = UTC + 1 h (hiver) ou + 2 h (été, du dernier dimanche de mars au dernier dimanche d'octobre) : les séances sont définies en UTC fixe (voir TEXTE_SEANCES). */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url)), D = path.join(ici, 'donnees');
export const TEXTE_SEANCES = 'Séances en UTC fixe : Asie 00:00–07:00, Londres 07:00–13:00, New York 13:00–21:00 (l\'ouverture de New York est à 13:30 UTC, 14:30 à Paris en hiver, 15:30 en été). Pas de décalage d\'heure d\'été appliqué (documenté, identique pour tous les tests).';
const lire = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []);
export function charger({ debut = 2003, fin = 2025 } = {}) {
  const h1 = [], m15 = [];
  for (let a = debut; a <= fin; a++) {
    const bid = lire(path.join(D, `xauusd-h1-bid-${a}.json`)), ask = new Map(lire(path.join(D, `xauusd-h1-ask-${a}.json`)).map(b => [b[0], b]));
    for (const b of bid) { const k = ask.get(b[0]); h1.push({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5], sp: k ? Math.max(0, k[1] - b[1]) : null }); }
    for (const b of lire(path.join(D, `xauusd-m15-bid-${a}.json`))) m15.push({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] });
  }
  // spread manquant : médiane de l'année (jamais 0)
  const parAn = new Map(); for (const b of h1) if (b.sp != null && b.sp > 0) { const y = new Date(b.t).getUTCFullYear(); if (!parAn.has(y)) parAn.set(y, []); parAn.get(y).push(b.sp); }
  const med = new Map([...parAn].map(([y, v]) => [y, v.sort((x, z) => x - z)[v.length >> 1]]));
  for (const b of h1) if (b.sp == null || b.sp <= 0) b.sp = med.get(new Date(b.t).getUTCFullYear()) ?? 0.4;
  return { h1, m15, medianeSpread: Object.fromEntries(med) };
}
export const annee = t => new Date(t).getUTCFullYear();
