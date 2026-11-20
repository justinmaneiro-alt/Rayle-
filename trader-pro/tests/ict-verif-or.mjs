/* Vérification à la main (réseau) des repères ICT sur l'or : PDH / PDL / PWH / PWL calculés par ict-calcul.js comparés à un calcul indépendant (dates explicites) sur les bougies Daily Binance XAUUSDT.
   Usage : node trader-pro/tests/ict-verif-or.mjs */
import { reperes } from '../volume/ict-calcul.js';
const r = await fetch('https://fapi.binance.com/fapi/v1/klines?symbol=XAUUSDT&interval=1d&limit=60'); const K = (await r.json()).map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
const jour = t => new Date(t).toISOString().slice(0, 10), now = Date.now(), aujourdhui = jour(now);
const R = reperes(K, now), get = id => R.niveaux.find(n => n.id === id).prix;
/* calcul indépendant : veille = bougie datée d'hier ; semaine précédente = du lundi au dimanche d'avant ; mois précédent = mois calendaire d'avant */
const d = new Date(now), dow = (d.getUTCDay() + 6) % 7, lundi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow), lundiPrec = lundi - 7 * 86400e3;
const veille = K.find(b => jour(b.t) === jour(now - 86400e3)), sem = K.filter(b => b.t >= lundiPrec && b.t < lundi), moisDeb = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1), moisFin = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), mois = K.filter(b => b.t >= moisDeb && b.t < moisFin);
const att = { PDH: veille.h, PDL: veille.l, PWH: Math.max(...sem.map(b => b.h)), PWL: Math.min(...sem.map(b => b.l)), PMH: mois.length ? Math.max(...mois.map(b => b.h)) : null, PML: mois.length ? Math.min(...mois.map(b => b.l)) : null };
console.log('Aujourd\'hui', aujourdhui, '· veille', jour(veille.t), '· semaine précédente', jour(lundiPrec), '→', jour(lundi - 86400e3), `(${sem.length} jours)`, '· mois précédent', jour(moisDeb), '→', jour(moisFin - 86400e3), `(${mois.length} jours de données)`);
let ok = 0, ko = 0; for (const [id, v] of Object.entries(att)) { if (v == null) { console.log(id.padEnd(4), 'pas assez de données pour le mois précédent (60 jours chargés)'); continue; } const c = get(id), bon = Math.abs(c - v) < 1e-6; bon ? ok++ : ko++; console.log(id.padEnd(4), 'module', c.toFixed(2).padStart(9), '· calcul indépendant', v.toFixed(2).padStart(9), bon ? '✓' : '✗'); }
console.log(ko ? `✗ ${ko} écart(s)` : `repères ICT de l'or conformes (${ok})`); process.exit(ko ? 1 : 0);
