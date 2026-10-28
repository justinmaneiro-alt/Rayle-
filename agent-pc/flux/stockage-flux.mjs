// Stockage des flux enregistrés (V4, phase 2) : fichiers par heure, compressés quand l'heure est finie, quota de disque avec purge des plus vieilles données BRUTES (les agrégats d'une minute,
// les dérivés et le journal des trous sont gardés indéfiniment). Dossier : %LOCALAPPDATA%\Rayle\agent\flux\ (RAYLE_AGENT_DOSSIER pour les tests). Jamais dans git.
//   profondeur/<clé>/<AAAA-MM-JJ>/<HH>.bin[.gz]   carnet par tranches, une seconde par enregistrement (format : strategies/liquidite/format-profondeur.js)
//   trades|evenements|liquidations|derives/<clé>/<AAAA-MM-JJ>/<HH>.jsonl[.gz]   une ligne JSON par seconde / événement / relevé
//   agg1m/<clé>/<AAAA-MM>.jsonl                  agrégats d'une minute (gardés)        trous.jsonl   journal des coupures (gardé)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { TAILLE_ENTETE, encoderEntete, decoderFichier, tailleEnregistrement } from '../../strategies/liquidite/format-profondeur.js';

export const TYPES_BRUTS = Object.freeze(['profondeur', 'trades', 'evenements', 'liquidations']);
const pad = n => String(n).padStart(2, '0');
export const jourUTC = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
export const heureUTC = t => pad(new Date(t).getUTCHours());
export const moisUTC = t => jourUTC(t).slice(0, 7);
const cleSure = c => String(c).replace(/[^A-Za-z0-9_-]/g, '_');

export function creerStockage({ dossier, maintenant = () => Date.now(), quotaOctets = 15 * 1024 ** 3, tamponMs = 5000 } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const tampons = new Map();                                   // chemin → { morceaux: Uint8Array[], octets }
  let dernierVidage = 0;
  const chemin = (...p) => path.join(dossier, ...p);
  const ajouterTampon = (f, octets) => { let t = tampons.get(f); if (!t) tampons.set(f, t = { morceaux: [], octets: 0 }); t.morceaux.push(octets); t.octets += octets.length; };
  /* Écrit tout ce qui attend (appelé toutes les quelques secondes et à l'arrêt). Une erreur de disque n'arrête rien : elle est rendue. */
  function vider() {
    const erreurs = [];
    for (const [f, t] of tampons) {
      if (!t.octets) continue;
      try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, Buffer.concat(t.morceaux)); t.morceaux = []; t.octets = 0; } catch (e) { erreurs.push(String(e.message).slice(0, 120)); if (t.octets > 64 * 1024 ** 2) { t.morceaux = []; t.octets = 0; } }
    }
    dernierVidage = maintenant(); return erreurs;
  }
  const videSiBesoin = () => { if (maintenant() - dernierVidage >= tamponMs) return vider(); return []; };

  /* Profondeur : l'en-tête est écrit une fois par fichier (le fichier de l'heure en cours). */
  const entetesEcrits = new Set();
  /* Reprise après un arrêt brutal : un dernier enregistrement coupé en deux fausserait tous les suivants ; on rogne le fichier au dernier enregistrement complet. */
  function reparerFin(f, entete) {
    try {
      if (!fs.existsSync(f)) return; const t = fs.statSync(f).size; if (t < TAILLE_ENTETE) { fs.unlinkSync(f); return; }
      const reste = (t - TAILLE_ENTETE) % tailleEnregistrement(entete.nTranches); if (reste) fs.truncateSync(f, t - reste);
    } catch (e) { /* tant pis */ }
  }
  function ecrireProfondeur(cle, tMs, enregistrement, entete) {
    const f = chemin('profondeur', cleSure(cle), jourUTC(tMs), heureUTC(tMs) + '.bin');
    if (!entetesEcrits.has(f)) { entetesEcrits.add(f); reparerFin(f, entete); if (!fs.existsSync(f) || fs.statSync(f).size < TAILLE_ENTETE) ajouterTampon(f, encoderEntete(entete)); if (entetesEcrits.size > 200) entetesEcrits.clear(); }
    ajouterTampon(f, enregistrement); return videSiBesoin();
  }
  function ecrireLigne(type, cle, tMs, objet) {
    const f = chemin(type, cleSure(cle), jourUTC(tMs), heureUTC(tMs) + '.jsonl'); ajouterTampon(f, Buffer.from(JSON.stringify(objet) + '\n')); return videSiBesoin();
  }
  /* Journaux permanents (écriture immédiate : rares). */
  function ecrireDirect(f, ligne) { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify(ligne) + '\n'); return true; } catch (e) { return false; } }
  const ecrireAgg1m = (cle, tMs, objet) => ecrireDirect(chemin('agg1m', cleSure(cle), moisUTC(tMs) + '.jsonl'), objet);
  const noterTrou = trou => ecrireDirect(chemin('trous.jsonl'), trou);

  /* Compresse les fichiers d'heures TERMINÉES (tout fichier brut dont l'heure n'est plus l'heure courante). */
  function compresserFinis() {
    const maintenantMs = maintenant(), courant = jourUTC(maintenantMs) + '/' + heureUTC(maintenantMs); let n = 0;
    for (const type of [...TYPES_BRUTS, 'derives']) {
      const base = chemin(type); if (!fs.existsSync(base)) continue;
      for (const cle of fs.readdirSync(base)) for (const jour of safeList(path.join(base, cle))) for (const fich of safeList(path.join(base, cle, jour))) {
        if (!/\.(bin|jsonl)$/.test(fich)) continue; if (jour + '/' + fich.slice(0, 2) === courant) continue;
        const f = path.join(base, cle, jour, fich); if (tampons.has(f) && tampons.get(f).octets) continue;
        try { fs.writeFileSync(f + '.gz', zlib.gzipSync(fs.readFileSync(f), { level: 6 })); fs.unlinkSync(f); entetesEcrits.delete(f); n++; } catch (e) { /* fichier occupé : au prochain tour */ }
      }
    }
    return n;
  }
  /* Taille par type et par jour (octets) ; sert au quota et au statut. */
  function inventaire() {
    const parJour = new Map(), parType = {}; let total = 0;
    for (const type of TYPES_BRUTS) {
      const base = chemin(type); if (!fs.existsSync(base)) continue; parType[type] = 0;
      for (const cle of safeList(base)) for (const jour of safeList(path.join(base, cle))) for (const fich of safeList(path.join(base, cle, jour))) {
        let s = 0; try { s = fs.statSync(path.join(base, cle, jour, fich)).size; } catch (e) { continue; }
        parJour.set(jour, (parJour.get(jour) || 0) + s); parType[type] += s; total += s;
      }
    }
    return { total, parJour, parType };
  }
  /* Purge : supprime les JOURS bruts les plus anciens jusqu'à repasser sous 90 % du quota. Ne touche jamais aux agrégats, dérivés, trous. Rend { supprimes: [jours], avant, apres }. */
  function purger() {
    vider(); const inv = inventaire(), cible = quotaOctets * 0.9, supprimes = []; if (inv.total <= quotaOctets) return { supprimes, avant: inv.total, apres: inv.total, quota: quotaOctets };
    let reste = inv.total; const jours = [...inv.parJour.keys()].sort(), aujourdhui = jourUTC(maintenant());
    for (const jour of jours) {
      if (reste <= cible || jour >= aujourdhui) break;
      for (const type of TYPES_BRUTS) { const base = chemin(type); if (!fs.existsSync(base)) continue; for (const cle of safeList(base)) { const d = path.join(base, cle, jour); try { if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* tant pis */ } } }
      reste -= inv.parJour.get(jour); supprimes.push(jour);
    }
    return { supprimes, avant: inv.total, apres: Math.max(0, reste), quota: quotaOctets };
  }
  const espaceLibre = () => { try { const s = fs.statfsSync(dossier); return Number(s.bavail) * Number(s.bsize); } catch (e) { return null; } };

  /* ── lecture (relecture, tests, moteur de liquidité) ── */
  const lireBrut = f => { for (const g of [f, f + '.gz']) { if (fs.existsSync(g)) { let b = fs.readFileSync(g); if (g.endsWith('.gz')) b = zlib.gunzipSync(b); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); } } return null; };
  function* heures(t0, t1) { for (let h = Math.floor(t0 / 3600e3) * 3600e3; h <= t1; h += 3600e3) yield h; }
  function lireProfondeur(cle, t0, t1) {
    vider(); const out = []; let entete = null;
    for (const h of heures(t0, t1)) { const b = lireBrut(chemin('profondeur', cleSure(cle), jourUTC(h), heureUTC(h) + '.bin')); if (!b) continue; const d = decoderFichier(b); if (!d) continue; entete = d.entete; for (const r of d.enregistrements) if (r.tSec * 1000 >= t0 && r.tSec * 1000 <= t1) out.push(r); }
    return { entete, enregistrements: out };
  }
  function lireLignes(type, cle, t0, t1) {
    vider(); const out = [];
    for (const h of heures(t0, t1)) { const b = lireBrut(chemin(type, cleSure(cle), jourUTC(h), heureUTC(h) + '.jsonl')); if (!b) continue; for (const l of Buffer.from(b).toString('utf8').split('\n')) { if (!l) continue; try { const o = JSON.parse(l); if (o.t >= t0 && o.t <= t1) out.push(o); } catch (e) { /* ligne coupée */ } } }
    return out;
  }
  function lireAgg1m(cle, t0, t1) {
    const out = []; for (let m = new Date(t0); m.getTime() <= t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
      const f = chemin('agg1m', cleSure(cle), moisUTC(m.getTime()) + '.jsonl'); if (!fs.existsSync(f)) continue;
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) { if (!l) continue; try { const o = JSON.parse(l); if (o.t >= t0 && o.t <= t1) out.push(o); } catch (e) { /* coupée */ } }
    } return out;
  }
  function lireTrous(depuis = 0) { const f = chemin('trous.jsonl'); if (!fs.existsSync(f)) return []; return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(x => x && x.t >= depuis); }
  return { dossier, chemin, ecrireProfondeur, ecrireLigne, ecrireAgg1m, noterTrou, vider, compresserFinis, inventaire, purger, espaceLibre, lireProfondeur, lireLignes, lireAgg1m, lireTrous, quotaOctets, jourUTC };
}
function safeList(d) { try { return fs.readdirSync(d); } catch (e) { return []; } }
