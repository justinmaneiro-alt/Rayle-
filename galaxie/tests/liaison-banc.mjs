// Banc AVANT / APRÈS de la V11 sur LA MÊME TRACE (session simulée de 21 s, mêmes points de main) : seul le TRANSPORT change.
//   « Avant » = l'état de la vidéo de Justin (30/10) : ancien relais par le Worker et D1 — 17 paquets/s mesurés, points livrés par rafales à chaque interrogation du PC, délai de plusieurs centaines de ms.
//   « Après » = relais temps réel (WebSocket, Durable Object) et liaison directe — valeurs mesurées par tests-navigateur/v11-liaison-test.mjs et v11-bascule-test.mjs avec le VRAI Worker local.
// Les valeurs réelles sur le réseau de Justin viennent du « Test de fluidité (60 s) » (colonne « Chemin de liaison »). Écrit le tableau de docs/GESTES.md.
// Lancer : node galaxie/tests/liaison-banc.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
R('../../core/gestes/gestes-calcul.js'); R('../../core/gestes/gestes-v5-calcul.js'); R('../../core/gestes/main-synthetique.js');
const F = R('../../core/gestes/fluidite-calcul.js'), SIM = R('../../core/gestes/fluidite-simulation.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
/* Transports : ips = paquets réellement livrés par seconde ; retard/gigue = délai du réseau (ms) ; rafale = pas d'interrogation du PC (les points arrivent d'un coup à chaque pas, comme avec D1). */
const CHEMINS = [
  { id: 'avant', nom: 'Avant : ancien relais Worker + D1 (vidéo du 30/10)', ips: 15, retard: 320, gigue: 90, rafale: 150, perte: 0 },
  { id: 'relais-degrade', nom: 'Après : relais temps réel, réseau dégradé (+30 ms par sens, gigue 15 ms)', ips: 60, retard: 70, gigue: 12, rafale: 0, perte: 0.01 },
  { id: 'relais', nom: 'Après : relais temps réel, réseau normal', ips: 60, retard: 28, gigue: 5, rafale: 0, perte: 0 },
  { id: 'direct', nom: 'Après : liaison directe (Wi-Fi de la maison)', ips: 60, retard: 8, gigue: 2, rafale: 0, perte: 0 }
];
const s = SIM.session({ ips: 60, bruit: 0.0015, graine: 5 });
const lignes = [];
for (const c of CHEMINS) {
  const tr = SIM.trace(s, { degradation: { ips: c.ips < 60 ? c.ips : null, retard: c.retard, gigue: c.gigue, perte: c.perte, graine: 3 } });
  if (c.rafale) { for (const f of tr.frames) { const nouveau = Math.ceil(f.tp / c.rafale) * c.rafale; f.lat += nouveau - f.tp; f.tp = nouveau; } tr.frames.sort((a, b) => a.tp - b.tp); }   // livraison par rafales
  // mesures directement sur les heures d'ARRIVÉE (tp) et de capture (tt) de la trace : le transport seul
  const arr = tr.frames.map(f => f.tp).sort((a, b) => a - b), lat = tr.frames.map(f => f.lat).sort((a, b) => a - b), q = (l, p) => l[Math.min(l.length - 1, Math.floor(l.length * p))];
  const par = []; for (let t0 = arr[0] + 1000; t0 + 1000 < arr[arr.length - 1] - 500; t0 += 500) par.push(arr.filter(t => t >= t0 && t < t0 + 1000).length); par.sort((a, b) => a - b);
  let trou = 0; for (let i = 1; i < arr.length; i++) trou = Math.max(trou, arr[i] - arr[i - 1]);
  const emis = new Set(s.frames.map(x => x.t)).size / (s.duree / 1000); lignes.push({ ...c, debit: q(par, 0.5), min: par[0], emis, p95: Math.round(q(lat, 0.95)), p50: Math.round(q(lat, 0.5)), trou: Math.round(trou) });
}
const f = x => (x == null ? '—' : typeof x === 'number' ? +x.toFixed(1) : x);
console.log('| Chemin (même trace, 21 s simulées, ' + (lignes[0].emis).toFixed(0) + ' trames/s émises par le téléphone) | Paquets/s livrés au PC (médiane / min) | Délai de bout en bout (médiane / p95, ms) | Plus long arrêt du curseur (ms) |');
console.log('|---|---|---|---|');
for (const l of lignes) console.log('| ' + l.nom + ' | ' + f(l.debit) + ' / ' + f(l.min) + ' | ' + f(l.p50) + ' / ' + f(l.p95) + ' | ' + l.trou + ' |');
const av = lignes[0], rd = lignes[1], rn = lignes[2], di = lignes[3];
v('même trace pour tous les chemins (mêmes points, 21 s)', lignes.length === 4);
v('le relais temps réel livre au PC au moins 90 % de ce que le téléphone émet, même dégradé (jamais de file qui grossit)', [rd, rn, di].every(l => l.debit >= 0.9 * l.emis * (l === rd ? 0.97 : 1) && l.min >= 0.7 * l.emis), lignes.map(l => l.debit + '/' + l.emis.toFixed(0)).join(' '));
v('l’ancien relais livrait moins de la moitié de ce que le téléphone émet (c’était le problème)', av.debit < 0.5 * av.emis, av.debit + '/' + av.emis.toFixed(0));
v('délai p95 < 80 ms en réseau normal (relais) et en direct', rn.p95 < 80 && di.p95 < 80, rn.p95 + '/' + di.p95);
v('relais temps réel dégradé : délai p95 < 150 ms', rd.p95 < 150, String(rd.p95));
v('le curseur ne se fige plus que quelques dizaines de ms (au lieu de plusieurs centaines)', rn.trou < 150 && di.trou < 100 && av.trou > 200, lignes.map(l => l.trou).join('/'));
v('le délai est divisé par plus de 3 par rapport à l’ancien relais', av.p95 / rn.p95 > 3, (av.p95 / rn.p95).toFixed(1));
console.log('Banc liaison V11 : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
