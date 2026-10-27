// Données historiques OHLCVT de Kraken (le marché où Justin trade) : téléchargement gratuit, vérification SHA-256, extraction de quelques paires, lecture des CSV, repérage des trous.
//   node agent-pc/kraken-ohlcvt.mjs --statut               ce qui est déjà là
//   node agent-pc/kraken-ohlcvt.mjs --telecharger          jeu complet (5 morceaux d'environ 2 Go) + fichiers trimestriels, avec reprise ; ATTEND ≈ 10 Go de disque
//   node agent-pc/kraken-ohlcvt.mjs --extraire             extrait BTC, SOL, DOGE en 15 / 60 / 240 minutes (sans recoller l'archive)
// Page officielle : support.kraken.com, « Downloadable historical OHLCVT (Open, High, Low, Close, Volume, Trades) data ». Les données restent pour la recherche PERSONNELLE : jamais dans git.
// Format d'un fichier : CSV SANS en-tête : horodatage, ouverture, plus haut, plus bas, clôture, volume, trades. Seules les périodes AVEC des trades existent : les trous ne sont PAS remplis
// (on les repère et on les marque, on n'invente rien).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASE = 'https://assets.kraken.com/marketing/institutions/';
export const MORCEAUX = Object.freeze(['Kraken_OHLCVT_Full.zip.part00', 'Kraken_OHLCVT_Full.zip.part01', 'Kraken_OHLCVT_Full.zip.part02', 'Kraken_OHLCVT_Full.zip.part03', 'Kraken_OHLCVT_Full.zip.part04']);
export const FICHIER_SOMMES = 'OHLCVT_Full_PARTS_SHA256SUMS.txt';
export const SHA256_ARCHIVE_COMPLETE = 'bc273e9027470b07d790a7fa4df9bb43f0dfc527c20c6ecae48402e123e7b1c7';   // indiqué par la page de Kraken (archive recollée)
export const TRIMESTRIELS = Object.freeze(['Kraken_OHLCVT_2026Q1.zip', 'Kraken_OHLCVT_2026Q2.zip', 'Kraken_OHLCVT_2026Q3.zip']);   // mises à jour : à compléter chaque trimestre
export const PAIRES_KRAKEN = Object.freeze({ BTC: ['XBTUSD'], SOL: ['SOLUSD'], DOGE: ['XDGUSD', 'DOGEUSD'] });
export const INTERVALLES = Object.freeze([15, 60, 240]);
export const MOTIF_EXTRACTION = '^(XBTUSD|SOLUSD|XDGUSD|DOGEUSD)_(15|60|240)\\.csv$';

/* Lit un CSV Kraken (texte) → bougies { t (ms), o, h, l, c, v, trades }. Ignore les lignes invalides ; l'horodatage est en secondes (converti en ms). */
export function analyserCsv(texte) {
  const out = [];
  for (const ligne of String(texte).split(/\r?\n/)) {
    if (!ligne) continue; const x = ligne.split(','); if (x.length < 6) continue;
    const t = Number(x[0]), o = +x[1], h = +x[2], l = +x[3], c = +x[4], v = +x[5], n = x.length > 6 ? +x[6] : NaN;
    if (![t, o, h, l, c, v].every(Number.isFinite) || o <= 0 || h < l || h < Math.max(o, c) - 1e-12 * h || l > Math.min(o, c) + 1e-12 * h) continue;
    out.push({ t: t < 1e11 ? t * 1000 : t, o, h, l, c, v, trades: Number.isFinite(n) ? n : null });
  }
  return out;
}
/* Fusionne plusieurs listes (jeu complet + trimestriels) : une bougie par instant, triée. En cas de doublon la PREMIÈRE liste gagne (le jeu complet est la référence). */
export function fusionner(...listes) {
  const m = new Map(); for (const l of listes) for (const b of l) if (!m.has(b.t)) m.set(b.t, b);
  return [...m.values()].sort((a, b) => a.t - b.t);
}
/* Trous : intervalles où il manque au moins une bougie (période sans trade, ou donnée absente). Rien n'est rempli. */
export function trous(bougies, pasMs) {
  const out = []; for (let i = 1; i < bougies.length; i++) { const e = bougies[i].t - bougies[i - 1].t; if (e > pasMs + 1) out.push({ de: bougies[i - 1].t + pasMs, a: bougies[i].t, manquantes: Math.round(e / pasMs) - 1 }); }
  return out;
}
export function resumeTrous(bougies, pasMs) {
  const t = trous(bougies, pasMs), manq = t.reduce((a, x) => a + x.manquantes, 0), total = bougies.length + manq;
  return { n: bougies.length, trous: t.length, manquantes: manq, partManquante: total ? manq / total : 0, plusGrand: t.reduce((a, x) => Math.max(a, x.manquantes), 0), debut: bougies.length ? bougies[0].t : null, fin: bougies.length ? bougies[bougies.length - 1].t : null };
}
export function lireSommes(texte) {
  const out = {}; for (const l of String(texte).split(/\r?\n/)) { const m = /^([0-9a-f]{64})\s+\*?(\S+)$/i.exec(l.trim()); if (m) out[m[2]] = m[1].toLowerCase(); } return out;
}
export function sha256Fichier(chemin) {
  return new Promise((ok, ko) => { const h = crypto.createHash('sha256'), s = fs.createReadStream(chemin); s.on('data', d => h.update(d)); s.on('error', ko); s.on('end', () => ok(h.digest('hex'))); });
}
/* Vérifie les morceaux présents contre le fichier de sommes. Rend { ok, details:[{nom, present, ok}] }. */
export async function verifierMorceaux(dossier, sommes) {
  const details = [];
  for (const nom of MORCEAUX) {
    const f = path.join(dossier, nom); if (!fs.existsSync(f)) { details.push({ nom, present: false, ok: false }); continue; }
    details.push({ nom, present: true, ok: (await sha256Fichier(f)) === sommes[nom] });
  }
  return { ok: details.every(d => d.ok), details };
}
/* Téléchargement avec reprise (Range). `fetchImpl` injectable pour les tests. */
export async function telecharger(url, destination, { fetchImpl = globalThis.fetch, surProgres = () => {} } = {}) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tmp = destination + '.partiel'; let debut = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
  const tete = await fetchImpl(url, { method: 'HEAD' }); if (!tete.ok) throw new Error('HTTP ' + tete.status + ' pour ' + url);
  const total = Number(tete.headers.get('content-length')) || 0;
  if (fs.existsSync(destination) && total && fs.statSync(destination).size === total) return { deja: true, octets: total };
  if (total && debut > total) { fs.unlinkSync(tmp); debut = 0; }
  const rep = await fetchImpl(url, { headers: debut ? { Range: 'bytes=' + debut + '-' } : {} });
  if (!rep.ok && rep.status !== 206) throw new Error('HTTP ' + rep.status);
  if (debut && rep.status !== 206) { fs.unlinkSync(tmp); debut = 0; }
  const sortie = fs.createWriteStream(tmp, { flags: debut ? 'a' : 'w' }); let recu = debut;
  const lecteur = rep.body.getReader();
  for (;;) { const { done, value } = await lecteur.read(); if (done) break; if (!sortie.write(value)) await new Promise(r => sortie.once('drain', r)); recu += value.length; surProgres(recu, total); }
  await new Promise(r => sortie.end(r));
  if (total && recu !== total) throw new Error('téléchargement incomplet (' + recu + ' / ' + total + ') : relance la commande pour reprendre');
  fs.renameSync(tmp, destination); return { deja: false, octets: recu };
}
/* Lit une série (paire, intervalle) à partir des dossiers extraits : le jeu complet d'abord, les trimestriels ensuite (ils complètent, n'écrasent jamais). */
export function lireSerie(dossierExtrait, paire, intervalle) {
  const noms = PAIRES_KRAKEN[paire]; if (!noms) throw new Error('paire inconnue : ' + paire);
  const listes = [];
  if (!fs.existsSync(dossierExtrait)) return { bougies: [], resume: resumeTrous([], intervalle * 60e3), sources: [] };
  const sous = fs.readdirSync(dossierExtrait, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => (a === 'complet' ? -1 : b === 'complet' ? 1 : a < b ? -1 : 1)), sources = [];
  for (const d of sous) for (const nom of noms) { const f = path.join(dossierExtrait, d, nom + '_' + intervalle + '.csv'); if (fs.existsSync(f)) { listes.push(analyserCsv(fs.readFileSync(f, 'utf8'))); sources.push(d + '/' + nom); } }
  const bougies = fusionner(...listes);
  return { bougies, resume: resumeTrous(bougies, intervalle * 60e3), sources };
}

/* ── ligne de commande ── */
const estPrincipal = () => { try { return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href; } catch (e) { return false; } };
if (estPrincipal()) {
  const { dossierAgent } = await import('./etat-agent.mjs');
  const racine = path.join(dossierAgent(), 'donnees', 'kraken'), brut = path.join(racine, 'telechargements'), extrait = path.join(racine, 'extrait'), arg = process.argv[2];
  if (arg === '--statut' || !arg) {
    for (const nom of [...MORCEAUX, ...TRIMESTRIELS]) { const f = path.join(brut, nom); console.log((fs.existsSync(f) ? 'présent   ' : 'absent    ') + nom + (fs.existsSync(f) ? ' (' + Math.round(fs.statSync(f).size / 1e6) + ' Mo)' : '')); }
    for (const p of Object.keys(PAIRES_KRAKEN)) for (const i of INTERVALLES) { const s = lireSerie(extrait, p, i); if (s.bougies.length) console.log(p + ' ' + i + ' min : ' + s.bougies.length + ' bougies, ' + s.resume.trous + ' trous (' + (s.resume.partManquante * 100).toFixed(1) + ' % manquantes)'); }
  } else if (arg === '--telecharger') {
    fs.mkdirSync(brut, { recursive: true });
    await telecharger(BASE + FICHIER_SOMMES, path.join(brut, FICHIER_SOMMES));
    for (const nom of [...MORCEAUX, ...TRIMESTRIELS]) { process.stdout.write(nom + ' … '); const r = await telecharger(BASE + nom, path.join(brut, nom), { surProgres: (a, t) => { if (t) process.stdout.write('\r' + nom + ' ' + Math.round(a / t * 100) + ' %   '); } }); console.log(r.deja ? 'déjà là' : 'ok'); }
    const v = await verifierMorceaux(brut, lireSommes(fs.readFileSync(path.join(brut, FICHIER_SOMMES), 'utf8')));
    console.log(v.ok ? 'Sommes SHA-256 : toutes correctes.' : 'ATTENTION : somme SHA-256 incorrecte pour ' + v.details.filter(d => !d.ok).map(d => d.nom).join(', ') + ' (supprime ces fichiers et relance).');
    process.exit(v.ok ? 0 : 1);
  } else if (arg === '--extraire') {
    const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'extraire-kraken.py');
    const r = spawnSync('python', ['-I', py, brut, extrait, MOTIF_EXTRACTION], { stdio: 'inherit' }); process.exit(r.status || 0);
  } else { console.log('Options : --statut, --telecharger, --extraire'); }
}
