/* Monte Carlo du challenge prop : +10 % avant −6 % (perte maximale statique), perte journalière max 3 %. Les trades sont tirés avec remise parmi les R nets observés (validation),
   regroupés en jours de `parJour` trades en moyenne ; risque fixe par trade (0,5 % du capital initial par défaut). Pur : fonction `challenge(R, opts)`. */
import { prng } from './stats.mjs';
export function challenge(R, { risque = 0.005, objectif = 0.10, perteMax = 0.06, perteJour = 0.03, parJour = 1, maxJours = 400, tirages = 5000, graine = 99 } = {}) {
  if (!R.length) return { reussite: 0, echecPerte: 0, echecJour: 0, expire: 0, tirages: 0 };
  const rnd = prng(graine); let ok = 0, ePerte = 0, eJour = 0, exp = 0;
  for (let k = 0; k < tirages; k++) {
    let cap = 1, fini = false;
    for (let j = 0; j < maxJours && !fini; j++) {
      const debut = cap, nT = Math.max(0, Math.round(parJour + (rnd() - 0.5) * 2 * Math.sqrt(parJour))); // nombre de trades du jour, autour de la moyenne
      for (let q = 0; q < nT; q++) { cap += risque * R[Math.floor(rnd() * R.length)]; if (cap <= 1 - perteMax) { ePerte++; fini = true; break; } if (debut - cap >= perteJour) { eJour++; fini = true; break; } if (cap >= 1 + objectif) { ok++; fini = true; break; } }
    }
    if (!fini) exp++;
  }
  return { reussite: ok / tirages, echecPerte: ePerte / tirages, echecJour: eJour / tirages, expire: exp / tirages, tirages };
}
