// Chargeur des barres M15 avec empreinte (V14) : lit l'historique des transactions résumé par historique-trades.mjs (un fichier .jsonl.gz par jour) et construit la série de volume
// (strategies/volume/serie-volume.js) — la MÊME série pour la recherche, l'affichage et le suivi en direct.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dossierAgent } from './etat-agent.mjs';
import { creerConstructeur, agregerH1 } from '../strategies/volume/serie-volume.js';

export const SYMBOLES = Object.freeze({ BTC: 'BTCUSDT', SOL: 'SOLUSDT', DOGE: 'DOGEUSDT' });
export const dossierTrades = (actif, dossier = dossierAgent()) => path.join(dossier, 'flux-historique', 'trades', 'spot-' + SYMBOLES[actif]);

export function joursDisponibles(actif, dossier) {
  const d = dossierTrades(actif, dossier); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/.test(f)).map(f => f.slice(0, 10)).sort();
}
/* Charge les `mois` derniers mois (ou de `depuis` à `jusqua`) ; retourne { m15, h1, jours, de, a, trous } ou null si rien. */
export function chargerSerie(actif, { mois = 12, depuis = null, jusqua = null, dossier, garderFp = 1500, extra = null, maintenant = Date.now() } = {}) {
  let jours = joursDisponibles(actif, dossier); if (!jours.length) return null;
  const dernier = jours[jours.length - 1];
  if (!depuis) { const d = new Date(dernier + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - mois); depuis = d.toISOString().slice(0, 10); }
  jours = jours.filter(j => j >= depuis && (!jusqua || j <= jusqua));
  const cons = creerConstructeur({ garderFp }); let trous = 0, precedent = null, barres = 0;
  for (const j of jours) {
    if (precedent && (Date.parse(j) - Date.parse(precedent)) > 86400e3 * 1.5) trous++;
    precedent = j;
    const txt = zlib.gunzipSync(fs.readFileSync(path.join(dossierTrades(actif, dossier), j + '.jsonl.gz'))).toString();
    for (const l of txt.split('\n')) { if (!l) continue; try { const b = JSON.parse(l); if (b && b.t && b.fp) { cons.ajouter(b); barres++; } } catch (e) { /* ligne coupée : ignorée */ } }
  }
  let direct = 0, dernierT = -Infinity;     // barres du direct (enregistreur), ajoutées APRÈS l'historique exact ; la barre en cours n'est jamais ajoutée
  if (extra && extra.length) {
    const finHistorique = jours.length ? Date.parse(jours[jours.length - 1]) + 86400e3 : 0;
    for (const b of extra) { if (b.t < finHistorique || b.t + 900000 > maintenant || b.t <= dernierT) continue; cons.ajouter(b); dernierT = b.t; direct++; barres++; }
  }
  if (!barres) return null;
  const m15 = cons.finir(), h1 = agregerH1(m15);
  return { actif, m15, h1, jours: jours.length, de: jours[0], a: jours[jours.length - 1], trous, barres, direct };
}
