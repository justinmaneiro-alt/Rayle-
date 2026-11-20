/* Signaux calculés par GitHub Actions (v6, B3) : flèches MA200 (H4 et Daily) et flèches Volume (H1, H4, Daily) des actifs suivis, dernières bougies CLOSES par unité (pour les niveaux tracés).
   Écrit signaux.json dans le dossier de sortie (branche donnees) : petit fichier (quelques ko) lu par le Worker aux clôtures, qui n'a donc AUCUN calcul lourd à faire (10 ms de CPU maximum sur le plan gratuit).
   Limite assumée : le volume vient de Yahoo (futures, différé), pas des perpétuels Binance du terminal Volume (Binance refuse les serveurs américains de GitHub) : les flèches Volume du Worker peuvent différer
   légèrement de celles du terminal ; les flèches MA200 sont identiques (mêmes prix et même code que le Terminal).
   Usage : node outils-donnees/signaux.mjs --sortie sortie */
import fs from 'node:fs'; import path from 'node:path';
import { analyserUnite, idFleche, phraseFleche } from '../trader-pro/terminal/ma200-h4.js';
import { flechesVolume, enH4 } from '../trader-pro/volume/volume-calcul.js';
const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const sortie = path.resolve(arg('sortie') || 'donnees-sortie');
const ACTIFS = { or: { nom: 'Or', vol: 'GC_F' }, us100: { nom: 'Nasdaq 100', vol: 'NQ_F' }, us500: { nom: 'S&P 500', vol: 'ES_F' }, btc: { nom: 'Bitcoin', vol: 'BTC_USD' }, sol: { nom: 'Solana', vol: 'SOL_USD' }, eurusd: { nom: 'EUR/USD', vol: '6E_F' } };
const PAS = { H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 }, RECENT = 36 * 3600e3, now = Date.now();
const lire = f => { try { return JSON.parse(fs.readFileSync(path.join(sortie, f), 'utf8')); } catch (e) { return null; } };
const barres = L => (L || []).map(b => (Array.isArray(b) ? { t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] || 0 } : { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 })).filter(b => b.c > 0 && b.h >= b.l).sort((a, b) => a.t - b.t);
const closes = (B, pas) => B.filter(b => b.t + pas <= now);
const compact = b => b && { t: b.t, o: +b.o.toPrecision(8), h: +b.h.toPrecision(8), l: +b.l.toPrecision(8), c: +b.c.toPrecision(8) };
const sortieJson = { t: now, version: 1, actifs: {} };
for (const [id, A] of Object.entries(ACTIFS)) {
  const pro = lire(`pro-${id}.json`), fiche = { nom: A.nom, derniere: {}, fleches: [] }; if (!pro) { sortieJson.actifs[id] = { ...fiche, erreur: 'pro-' + id + '.json absent' }; continue; }
  const src = { H1: barres(pro.h1), H4: barres(pro.h4), J: barres(pro.j) };
  for (const u of ['H1', 'H4', 'J']) { const C = closes(src[u], PAS[u]); fiche.derniere[u] = { derniere: compact(C[C.length - 1]), precedente: compact(C[C.length - 2]) }; }
  /* MA200 (mêmes fonctions que le Terminal) */
  for (const u of ['H4', 'J']) { try { if (src[u].length >= 205) for (const f of analyserUnite(src[u], u, { maintenant: now }).fleches) if (now - f.tFin < RECENT && f.tFin <= now) fiche.fleches.push({ id: idFleche(id, f), source: 'ma200', unite: u, t: f.t, tFin: f.tFin, dir: f.dir, type: f.type, texte: phraseFleche(A.nom, f), niveau: f.entree }); } catch (e) { /* cette unité est ignorée */ } }
  /* Volume (volume des futures Yahoo : H1, H4 dérivé du H1, Daily) */
  try {
    const h1 = barres((lire(`bougies-${A.vol}-1h.json`) || {}).b), j = barres((lire(`bougies-${A.vol}-1d.json`) || {}).b), V = { H1: h1.slice(-1500), H4: enH4(h1).slice(-1500), J: j.slice(-1500) };
    for (const u of ['H1', 'H4', 'J']) { const C = closes(V[u], PAS[u]); if (C.length < 80) continue; for (const f of flechesVolume(C, { unite: u, niveauxReac: [] })) if (f.tFin && now - f.tFin < RECENT && f.tFin <= now) fiche.fleches.push({ id: `${id}|${u}|${f.t}|${f.dir}|${f.type}`, source: 'volume', unite: u, t: f.t, tFin: f.tFin, dir: f.dir, type: f.type, texte: `${A.nom} : ${f.libelle}`, niveau: f.niveau }); }
  } catch (e) { /* volume indisponible pour cet actif */ }
  sortieJson.actifs[id] = fiche;
}
fs.mkdirSync(sortie, { recursive: true }); fs.writeFileSync(path.join(sortie, 'signaux.json'), JSON.stringify(sortieJson));
const n = Object.values(sortieJson.actifs).reduce((s, a) => s + (a.fleches ? a.fleches.length : 0), 0); console.log('signaux.json : ' + Object.keys(sortieJson.actifs).length + ' actifs, ' + n + ' flèche(s) de moins de 36 h, ' + fs.statSync(path.join(sortie, 'signaux.json')).size + ' octets');
