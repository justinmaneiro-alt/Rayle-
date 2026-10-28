// Empreinte COMPACTE de l'historique des transactions (V4, phase 5) : résume les barres M15 avec empreinte (flux-historique/trades/<marché>-<symbole>/*.jsonl.gz) en quelques tableaux par barre et
// en profils de la veille / de la semaine d'avant (POC, zone de valeur, nœuds HVN et trous LVN). Calculé une fois et gardé dans flux-historique/compact/ (recalculé si de nouveaux jours arrivent).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { dossierHistorique } from './historique-trades.mjs';
import { creerCompacteur } from '../../strategies/liquidite/contexte-flux.js';

const VERSION = 1;
export function listerJours(dossier, marche, sym) {
  const d = path.join(dossierHistorique(dossier), 'trades', marche + '-' + sym); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.jsonl.gz')).map(f => f.slice(0, 10)).sort();
}
export function construireCompact(dossier, marche, sym, { de = null, a = null } = {}) {
  const d = path.join(dossierHistorique(dossier), 'trades', marche + '-' + sym), c = creerCompacteur(); let n = 0;
  for (const j of listerJours(dossier, marche, sym)) {
    if ((de && j < de) || (a && j > a)) continue;
    for (const l of zlib.gunzipSync(fs.readFileSync(path.join(d, j + '.jsonl.gz'))).toString('utf8').split('\n')) { if (!l) continue; try { c.ajouter(JSON.parse(l)); n++; } catch (e) { /* ligne coupée */ } }
  }
  const r = c.finir(); r.barresLues = n; return r;
}
/* Rend le compact (depuis le cache s'il est à jour) ou null s'il n'y a aucune donnée. `jours` du cache = liste des jours pris en compte (à jour si identique à la liste actuelle). */
export function chargerCompact(dossier, marche, sym) {
  const jours = listerJours(dossier, marche, sym); if (!jours.length) return null;
  const f = path.join(dossierHistorique(dossier), 'compact', marche + '-' + sym + '.json.gz');
  try { if (fs.existsSync(f)) { const c = JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); if (c.version === VERSION && c.nJours === jours.length && c.dernierJour === jours[jours.length - 1]) return c.compact; } } catch (e) { /* cache abîmé : on recalcule */ }
  const compact = construireCompact(dossier, marche, sym);
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify({ version: VERSION, nJours: jours.length, dernierJour: jours[jours.length - 1], compact }))); fs.renameSync(tmp, f); } catch (e) { /* disque : on garde en mémoire */ }
  return compact;
}
