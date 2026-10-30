// Barres M15 du direct à partir de l'enregistreur de flux du service (V14) : une ligne par SECONDE (achat / vente agressifs, ouverture, haut, bas, clôture). Le détail par prix n'existe pas à cette
// finesse : l'empreinte des barres du direct est APPROCHÉE (volume placé à la clôture de chaque seconde) et la barre porte `approx: true`. Les profils des jours TERMINÉS viennent de l'historique exact.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dossierAgent } from './etat-agent.mjs';
import { trancheDe, MS15 } from '../strategies/liquidite/barres-flux.js';

const jourISO = t => new Date(t).toISOString().slice(0, 10);
export function lireFichier(f) {
  for (const g of [f + '.gz', f]) { if (!fs.existsSync(g)) continue; try { let b = fs.readFileSync(g); if (g.endsWith('.gz')) b = zlib.gunzipSync(b); return b.toString().split('\n').filter(Boolean); } catch (e) { return []; } }
  return null;
}
/* Barres M15 du direct pour `actif` entre depuisT (inclus, aligné sur 15 min) et maintenant. Retourne { barres, trous } ; les barres incomplètes (moins de 50 % des secondes) sont marquées. */
export function barresDirect(actif, { depuisT, maintenant = Date.now(), dossier = dossierAgent() } = {}) {
  const racine = path.join(dossier, 'flux', 'trades', 'binance-spot-' + actif), barres = new Map(); let lignes = 0;
  for (let j = Math.floor(depuisT / 86400e3) * 86400e3; j <= maintenant; j += 86400e3) {
    for (let h = 0; h < 24; h++) {
      const t0 = j + h * 3600e3; if (t0 + 3600e3 < depuisT || t0 > maintenant) continue;
      const l = lireFichier(path.join(racine, jourISO(j), String(h).padStart(2, '0') + '.jsonl')); if (!l) continue;
      for (const txt of l) {
        let r; try { r = JSON.parse(txt); } catch (e) { continue; } if (!r.t || r.t < depuisT) continue; lignes++;
        const t = Math.floor(r.t / MS15) * MS15; let b = barres.get(t);
        if (!b) barres.set(t, b = { t, achatUsd: 0, venteUsd: 0, n: 0, plusGrosUsd: 0, ouv: r.ouv, haut: r.haut, bas: r.bas, cloture: r.cloture, secondes: 0, fpMap: new Map(), approx: true });
        b.achatUsd += r.achatUsd || 0; b.venteUsd += r.venteUsd || 0; b.n += r.n || 0; b.secondes++; if (r.haut > b.haut) b.haut = r.haut; if (r.bas < b.bas) b.bas = r.bas; b.cloture = r.cloture;
        if (r.plusGros && r.plusGros.usd > b.plusGrosUsd) b.plusGrosUsd = r.plusGros.usd;
        const k = trancheDe(r.cloture); let e = b.fpMap.get(k); if (!e) b.fpMap.set(k, e = [0, 0]); e[0] += r.achatUsd || 0; e[1] += r.venteUsd || 0;
      }
    }
  }
  const out = [...barres.values()].sort((a, b) => a.t - b.t).map(b => ({ t: b.t, achatUsd: Math.round(b.achatUsd), venteUsd: Math.round(b.venteUsd), n: b.n, plusGrosUsd: Math.round(b.plusGrosUsd), ouv: b.ouv, haut: b.haut, bas: b.bas, cloture: b.cloture, approx: true, secondes: b.secondes, fp: [...b.fpMap.entries()].sort((x, y) => x[0] - y[0]).map(([k, [a, v]]) => [k, Math.round(a), Math.round(v)]) }));
  return { barres: out, lignes };
}
