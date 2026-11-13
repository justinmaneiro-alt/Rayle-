/* ═════════════ REGISTRE EN DIRECT DES FLÈCHES v8 (ajout seul) ═════════════
   Une ligne JSON par événement, dans registre-direct/registre-fleches-v8.jsonl : « debut » (1 ligne : date de départ + sceau des règles), « fleche » (date, type, niveau, entrée, stop, TP1, TP2),
   « invalidation » (si la flèche est invalidée), « resultat » (ajouté UNE fois, à la clôture de la position de lecture : stop, TP2, ou expirée après 48 bougies).
   Les lignes passées ne sont JAMAIS modifiées : chaque ligne porte l'empreinte de la précédente (chaîne SHA-256) ; une retouche ou une suppression se voit à la vérification.
   Seules les flèches posées APRÈS la ligne « debut » y entrent : c'est le seul test pleinement valable (aucune règle n'a pu être réglée sur ces bougies).
   Utilisation : node agent-trading/registre-direct.mjs --maj (télécharge Kraken H1, ajoute ce qui manque) ; --verifier ; --resume.  Appelé aussi par alertes-serveur.mjs. Aucun ordre, jamais. */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import * as V8 from './front/or/fleches-simples-v8.js'; import { niveauxSignal } from './front/or/signal-niveaux.js'; import { zonesDirect } from './front/or/zones-direct.js';
import { simulerTrade } from './front/or/fleches-bilan-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
export const FICHIER_REGISTRE = path.join(ici, 'registre-direct', 'registre-fleches-v8.jsonl');
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const empreinteLigne = (o, prec) => sha(prec + '|' + JSON.stringify(o));
export function lire(fichier = FICHIER_REGISTRE) { if (!fs.existsSync(fichier)) return []; return fs.readFileSync(fichier, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); }
/* ajoute une ligne (aucune modification des précédentes) */
function ajouter(fichier, o, lignes) {
  const prec = lignes.length ? lignes[lignes.length - 1].hash : '0'.repeat(64), ligne = { ...o, prec }; ligne.hash = empreinteLigne(o, prec);
  fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.appendFileSync(fichier, JSON.stringify(ligne) + '\n'); lignes.push(ligne); return ligne;
}
/* vérification : chaîne intacte, une seule ligne « debut », pas de doublon, un résultat par flèche au plus */
export function verifier(fichier = FICHIER_REGISTRE) {
  const L = lire(fichier), erreurs = []; let prec = '0'.repeat(64);
  L.forEach((l, i) => { const { prec: p, hash, ...o } = l; if (p !== prec) erreurs.push(`ligne ${i + 1} : chaîne rompue (ligne précédente modifiée ou retirée)`); if (hash !== empreinteLigne(o, p)) erreurs.push(`ligne ${i + 1} : empreinte fausse (ligne modifiée)`); prec = hash; });
  if (L.length && L[0].type !== 'debut') erreurs.push('la première ligne doit être « debut »'); if (L.filter(l => l.type === 'debut').length > 1) erreurs.push('plusieurs lignes « debut »');
  const vus = new Set(), res = new Set(); for (const l of L) { if (l.type === 'fleche') { if (vus.has(l.id)) erreurs.push('flèche en double ' + l.id); vus.add(l.id); } if (l.type === 'resultat') { if (res.has(l.id)) erreurs.push('résultat en double ' + l.id); res.add(l.id); if (!vus.has(l.id)) erreurs.push('résultat sans flèche ' + l.id); } }
  return { ok: !erreurs.length, lignes: L.length, erreurs };
}
export function resume(fichier = FICHIER_REGISTRE) { const L = lire(fichier), d = L.find(l => l.type === 'debut'), F = L.filter(l => l.type === 'fleche'), R = new Map(L.filter(l => l.type === 'resultat').map(l => [l.id, l])); const fin = F.filter(f => R.has(f.id)), net = fin.map(f => R.get(f.id).trade ? R.get(f.id).trade.Rnet : null).filter(x => x != null);
  return { debut: d ? d.debut : null, fleches: F.length, resultats: fin.length, ouvertes: F.length - fin.length, RnetMoyen: net.length ? net.reduce((s, x) => s + x, 0) / net.length : null, nTradesNets: net.length }; }
/* met à jour le registre d'après les bougies H1 closes B et les flèches du moteur (v8). Renvoie ce qui a été ajouté. Crée le fichier (ligne « debut ») s'il n'existe pas. */
export function mettreAJour(B, fleches, { fichier = FICHIER_REGISTRE, maintenant = Date.now(), sceauGlobal = null } = {}) {
  const lignes = lire(fichier), ajoutees = [];
  if (!lignes.length) ajoutees.push(ajouter(fichier, { type: 'debut', version: 1, debut: maintenant, moteur: V8.VERSION, sceau: sceauGlobal, note: 'Registre en ajout seul. Seules les flèches posées après cette date y entrent : test pleinement valable (règles figées avant). Repères de lecture, jamais un ordre.' }, lignes));
  const debut = lignes.find(l => l.type === 'debut').debut, ids = new Set(lignes.filter(l => l.type === 'fleche').map(l => l.id)), invs = new Set(lignes.filter(l => l.type === 'invalidation').map(l => l.id)), res = new Set(lignes.filter(l => l.type === 'resultat').map(l => l.id));
  const closes = B.filter(b => b.t + H <= maintenant && b.c > 0), idx = new Map(closes.map((b, i) => [b.t, i]));
  const eligible = f => !f.contre && f.type !== 'ma_cassure' && f.tCloture >= debut;
  for (const f of fleches.filter(eligible).sort((a, b) => a.tCloture - b.tCloture)) if (!ids.has(f.id)) {
    const n = niveauxSignal(f); if (!n) continue; ids.add(f.id);
    ajoutees.push(ajouter(fichier, { type: 'fleche', id: f.id, t: f.t, tCloture: f.tCloture, genre: f.type, dir: f.dir, niveau: f.niveauNom || null, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut, entree: n.entree, stop: n.stop, tp1: n.tp1, tp2: n.tp2, atr: f.atr, ajouteLe: maintenant }, lignes));
  }
  for (const f of fleches) if (ids.has(f.id) && f.invalidee && !invs.has(f.id)) { invs.add(f.id); ajoutees.push(ajouter(fichier, { type: 'invalidation', id: f.id, invalideeT: f.invalideeT || null, ajouteLe: maintenant }, lignes)); }
  for (const l of lignes.filter(x => x.type === 'fleche')) if (!res.has(l.id)) {
    const f = fleches.find(x => x.id === l.id), i0 = idx.get(l.t); if (!f || i0 == null) continue;
    const bo = V8.boite(closes, f); if (!bo || !bo.figee) continue;   // la position de lecture n'est pas encore close : rien n'est écrit
    const tr = simulerTrade(closes, i0, niveauxSignal(f)); res.add(l.id);
    ajoutees.push(ajouter(fichier, { type: 'resultat', id: l.id, tFin: bo.tFin, etat: bo.etat, R: bo.R, boite: { etat: bo.etat, R: bo.R, tp1Atteint: bo.tp1Atteint }, trade: tr ? { R: tr.R, Rnet: tr.Rnet, raison: tr.raison, tSortie: tr.tSortie } : null, ajouteLe: maintenant }, lignes));
  }
  return ajoutees;
}
/* passage complet (bougies H1 → rejeu v8 sur les 720 dernières bougies → mise à jour) */
export function majDepuisBougies(B, opts = {}) { const maintenant = opts.maintenant || Date.now(), closes = B.filter(b => b.t + H <= maintenant && b.c > 0); if (closes.length < 300) return []; const r = V8.calculer(closes, zonesDirect, { maintenant, bougies: 720 }); return mettreAJour(closes, r.fleches, { ...opts, maintenant }); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.includes('--verifier')) { const v = verifier(); console.log(v.ok ? `registre intact (${v.lignes} lignes)` : 'REGISTRE ALTÉRÉ :\n' + v.erreurs.join('\n')); process.exit(v.ok ? 0 : 1); }
  else if (a.includes('--resume')) console.log(JSON.stringify(resume(), null, 1));
  else if (a.includes('--maj')) {
    const { telechargerHistorique } = await import('./moteur/bougies.js'), { sceau } = await import('./recherche-or/historique-sceller.mjs');
    const B = await telechargerHistorique('PF_XAUUSD', 'H1', Date.now() - 45 * 86400e3), s = await sceau(), L = majDepuisBougies(B, { sceauGlobal: s.sha256Global });
    console.log(`${L.length} ligne(s) ajoutée(s)`, JSON.stringify(resume()));
  } else console.log('usage : node agent-trading/registre-direct.mjs --maj | --verifier | --resume');
}
