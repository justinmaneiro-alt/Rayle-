// Telecharge (ou complete) les donnees gratuites des contrats a terme BTC (financement, interet ouvert, ratios) dans donnees-btc-cache/deriv/ (ignore par git).
// Lancer :  node planetes/mars/outils-agent/telecharger-deriv.mjs [annees]      (premier passage : quelques minutes)
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { creerDeriv } from '../pc/agent-btc/deriv-donnees.js';
import { stockageFichier } from '../../../app-pc/veilleur/stockage-fichier.mjs';
import { DOSSIER_CACHE } from '../tests/aide-btc.mjs';
import path from 'node:path';
const inflate = promisify(zlib.inflateRaw);
const lireJson = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
const lireOctets = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return new Uint8Array(await r.arrayBuffer()); };
const annees = Number(process.argv[2]) || 4, t0 = Date.now();
const d = creerDeriv({ stockage: stockageFichier(path.join(DOSSIER_CACHE, 'deriv')), lireJson, lireOctets, inflater: async b => new Uint8Array(await inflate(Buffer.from(b))), annees, concurrence: 8 });
await d.charger();
let derniere = 0;
const e = await d.synchroniser({ surProgres: p => { if (Date.now() - derniere > 4000 || p.phase === 'termine') { derniere = Date.now(); console.log('  ', p.phase, p.fait != null ? p.fait + '/' + p.total : (p.lignes || '')); } } });
console.log('termine en', Math.round((Date.now() - t0) / 1000), 's :', JSON.stringify({ ...e, majLe: undefined }));
