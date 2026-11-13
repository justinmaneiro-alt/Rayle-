/* Fil de calcul : rejoue la v8 sur un segment [a, b[ d'une série (indices globaux) avec contexte et recouvrement. Utilisé par historique-fleches-etude.mjs */
import { parentPort, workerData } from 'node:worker_threads';
import { calculerHistorique } from '../front/or/fleches-historique-v1.js';
const { S, lo, a, b } = workerData;   // S = série[lo, b[ (le contexte et le recouvrement sont inclus par l'appelant)
const r = await calculerHistorique(S, { depart: a - lo });
const fl = r.fleches.map(f => ({ ...f, i: f.i + lo, indexDessin: f.indexDessin + lo, indexApparition: f.indexApparition + lo, touchI: f.touchI != null ? f.touchI + lo : undefined }));
parentPort.postMessage({ a, b, fleches: fl, retirees: r.retirees, invalidees: r.invalidees });
