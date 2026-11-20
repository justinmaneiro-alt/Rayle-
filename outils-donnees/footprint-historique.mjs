/* ═════════════ FOOTPRINT HISTORIQUE (v4.1) : volume acheteur / vendeur agressif par case de prix, dans chaque bougie H1, H4 et Daily ═════════════
   Source : archives quotidiennes GRATUITES de Binance (data.binance.vision, futures « um », fichiers aggTrades : une ligne par transaction agrégée,
   avec le côté de l'AGRESSEUR : is_buyer_maker = vrai → l'agresseur est le VENDEUR). Tâche GitHub Actions (.github/workflows/footprint.yml) → branche orpheline « footprint » :
     <actif>/<unité>/<taille de case>/<AAAA-MM>.json.gz   et   index.json (lu par le navigateur)   et   etat.json (jours déjà traités, lu par la tâche seulement).
   Rien ne passe par le Worker Cloudflare ni par KV : fichiers statiques servis par le CDN de GitHub.
   Format d'un fichier : { pas, u, b: [[t en secondes (ouverture de la bougie, UTC), [[indice de case, volume vendeur, volume acheteur, nombre de transactions], …]], …] } ;
   prix de la case = indice × pas (borne basse, case = [prix, prix + pas[). Les tailles de case sont des multiples entiers de la plus fine : les regroupements sont exacts.
   Les jours sont traités du plus récent au plus ancien, avec un budget de temps : une première exécution interrompue reprend où elle s'était arrêtée. */
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';

const H = 3600e3, J = 86400e3;
export const PAS_UNITE = Object.freeze({ H1: H, H4: 4 * H, J });
/* fin = case la plus fine (toujours un diviseur entier des autres tailles) ; tailles = 3 tailles par unité ; jours = profondeur maximale ; depuis = premier jour du perpétuel (XAUUSDT : 2025-12-11) */
export const ACTIFS = Object.freeze([
  { id: 'or', symbole: 'XAUUSDT', nom: 'Or (perpétuel XAUUSDT)', fin: 0.5, depuis: '2025-12-11', jours: 1200, tailles: { H1: [0.5, 1, 2], H4: [1, 2, 5], J: [2, 5, 10] } },
  { id: 'btc', symbole: 'BTCUSDT', nom: 'Bitcoin (perpétuel BTCUSDT)', fin: 5, depuis: '2020-01-01', jours: 1095, tailles: { H1: [5, 10, 25], H4: [10, 25, 50], J: [50, 100, 250] } },
  { id: 'sol', symbole: 'SOLUSDT', nom: 'Solana (perpétuel SOLUSDT)', fin: 0.05, depuis: '2020-09-14', jours: 1095, tailles: { H1: [0.05, 0.1, 0.25], H4: [0.1, 0.25, 0.5], J: [0.25, 0.5, 1] } }
]);
export const URL_JOUR = (symbole, jour) => `https://data.binance.vision/data/futures/um/daily/aggTrades/${symbole}/${symbole}-aggTrades-${jour}.zip`;

/* ───── fonctions pures (testées) ───── */
const arrondi3 = x => Math.round(x * 1000) / 1000;
export const jourDe = t => new Date(t).toISOString().slice(0, 10);
export const moisDe = t => new Date(t).toISOString().slice(0, 7);
export function joursEntre(debut, fin) { const L = []; for (let t = Date.parse(debut + 'T00:00:00Z'); t <= Date.parse(fin + 'T00:00:00Z'); t += J) L.push(jourDe(t)); return L; }
export const nomTaille = x => String(+Number(x).toPrecision(8));
/* "id,prix,qté,premier,dernier,temps,is_buyer_maker" → { p, q, t, vendeur } ; null pour l'en-tête ou une ligne cassée */
export function lireLigne(l) {
  const a = l.indexOf(','), b = l.indexOf(',', a + 1), c = l.indexOf(',', b + 1), d = l.indexOf(',', c + 1), e = l.indexOf(',', d + 1), f = l.indexOf(',', e + 1);
  if (f < 0) return null; const p = +l.slice(a + 1, b), q = +l.slice(b + 1, c), t = +l.slice(e + 1, f);
  if (!(p > 0) || !(q >= 0) || !(t > 0)) return null; return { p, q, t, vendeur: l.charCodeAt(f + 1) === 116 };   // 't' de « true »
}
/* Agrégateur : une transaction met à jour UNE case de l'heure (la plus fine), tout le reste se déduit par regroupement exact. */
export function creerAgregateur(fin) {
  const heures = new Map();   // heure (ms) → Map(indice fin → [vendeur, acheteur, n])
  return {
    ajouter(p, q, t, vendeur) {
      const h = Math.floor(t / H) * H; let m = heures.get(h); if (!m) { m = new Map(); heures.set(h, m); }
      const i = Math.floor(p / fin + 1e-9); let e = m.get(i); if (!e) { e = [0, 0, 0]; m.set(i, e); } e[vendeur ? 0 : 1] += q; e[2]++;
    },
    heures
  };
}
/* regroupe des cases [i, vendeur, acheteur, n] vers une taille multiple entière : ratio = nouvelle taille / taille actuelle */
export function regrouper(cases, ratio) {
  if (ratio === 1) return cases.map(c => c.slice()); const m = new Map();
  for (const [i, s, b, n] of cases) { const k = Math.floor(i / ratio); const e = m.get(k) || [k, 0, 0, 0]; e[1] += s; e[2] += b; e[3] += n; m.set(k, e); }
  return [...m.values()].sort((x, y) => x[0] - y[0]);
}
/* bougies d'une unité à partir des heures : { t(ms) → cases fines triées } */
export function bougiesDeUnite(heures, unite) {
  const pas = PAS_UNITE[unite], out = new Map();
  for (const [h, m] of heures) {
    const t0 = Math.floor(h / pas) * pas; let o = out.get(t0); if (!o) { o = new Map(); out.set(t0, o); }
    for (const [i, e] of m) { const x = o.get(i); if (x) { x[0] += e[0]; x[1] += e[1]; x[2] += e[2]; } else o.set(i, e.slice()); }
  }
  return new Map([...out].map(([t, m]) => [t, [...m].map(([i, e]) => [i, e[0], e[1], e[2]]).sort((a, b) => a[0] - b[0])]));
}
/* résultat d'un jour pour (unité, taille) : [[t en secondes, cases arrondies]] */
export function bougiesTaillees(heures, unite, tailleFin, taille) {
  const ratio = Math.round(taille / tailleFin), B = bougiesDeUnite(heures, unite), out = [];
  for (const [t, cases] of [...B].sort((a, b) => a[0] - b[0])) out.push([Math.round(t / 1000), regrouper(cases, ratio).map(([i, s, b, n]) => [i, arrondi3(s), arrondi3(b), n])]);
  return out;
}
/* fusionne les bougies d'un nouveau jour dans le contenu existant d'un fichier mensuel (la bougie la plus récente l'emporte) */
export function fusionnerMois(existant, nouvelles) { const m = new Map((existant || []).map(x => [x[0], x])); for (const x of nouvelles) m.set(x[0], x); return [...m.values()].sort((a, b) => a[0] - b[0]); }

/* ───── lecture d'une archive zip (une seule entrée, deflate) sans outil externe, en flux ───── */
export function entreeZip(buf) {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error('archive zip illisible'); const methode = buf.readUInt16LE(8), nom = buf.readUInt16LE(26), extra = buf.readUInt16LE(28);
  return { methode, debut: 30 + nom + extra };
}
export function lireLignesZip(buf, surLigne) {
  const { methode, debut } = entreeZip(buf);
  return new Promise((ok, ko) => {
    let reste = '', n = 0; const traiter = (txt, fin) => { const L = (reste + txt).split('\n'); reste = fin ? '' : L.pop(); for (const l of L) { if (l.length > 10) { surLigne(l); n++; } } if (fin && reste) { surLigne(reste); n++; } };
    if (methode === 0) { traiter(buf.subarray(debut).toString('latin1'), true); return ok(n); }
    const z = zlib.createInflateRaw(); z.on('data', c => traiter(c.toString('latin1'), false)); z.on('end', () => { traiter('', true); ok(n); }); z.on('error', ko); z.end(buf.subarray(debut));
  });
}
export async function agregerJour(buf, fin) {
  const A = creerAgregateur(fin); let lignes = 0; await lireLignesZip(buf, l => { const x = lireLigne(l); if (x) { A.ajouter(x.p, x.q, x.t, x.vendeur); lignes++; } });
  return { heures: A.heures, transactions: lignes };
}

/* ───── réseau ───── */
async function telecharger(url, essais = 4) {
  let derniere; for (let i = 0; i < essais; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(180000) }); if (r.status === 404) return null; if (!r.ok) throw new Error(`${new URL(url).host} a répondu ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { derniere = e; await new Promise(res => setTimeout(res, 1500 * (i + 1))); }
  }
  throw derniere;
}
export const gz = o => zlib.gzipSync(Buffer.from(JSON.stringify(o)), { level: 9 });
const lireGz = f => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch (e) { return null; } };
const lireJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

/* écrit les bougies d'un jour dans les fichiers mensuels de l'actif (fusion) */
export function ecrireJour(dossier, a, heures) {
  for (const unite of ['H1', 'H4', 'J']) for (const taille of a.tailles[unite]) {
    const bougies = bougiesTaillees(heures, unite, a.fin, taille); if (!bougies.length) continue;
    const mois = moisDe(bougies[0][0] * 1000), f = path.join(dossier, a.id, unite, nomTaille(taille), mois + '.json.gz'); fs.mkdirSync(path.dirname(f), { recursive: true });
    const ex = lireGz(f); fs.writeFileSync(f, gz({ pas: taille, u: unite, b: fusionnerMois(ex && ex.b, bougies) }));
  }
}
/* taille cumulée des fichiers (octets) */
export function tailleDossier(d) { let s = 0; for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); s += e.isDirectory() ? tailleDossier(p) : fs.statSync(p).size; } return s; }

/* ───── programme principal : node outils-donnees/footprint-historique.mjs --sortie <dossier> [--seulement or,btc] [--minutes 100] [--jours 30] ───── */
const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
if (process.argv[1] && /footprint-historique\.mjs$/.test(process.argv[1])) {
  const sortie = path.resolve(arg('sortie') || 'footprint-sortie'), seulement = (arg('seulement') || '').split(',').filter(Boolean), budget = (+arg('minutes') || 100) * 60e3, limiteJours = +arg('jours') || 0, debut0 = Date.now();
  fs.mkdirSync(sortie, { recursive: true }); const etat = lireJson(path.join(sortie, 'etat.json')) || { actifs: {} }, hier = jourDe(Date.now() - J);
  for (const a of ACTIFS.filter(x => !seulement.length || seulement.includes(x.id))) {
    const e = etat.actifs[a.id] = etat.actifs[a.id] || { faits: [], absents: [] }, faits = new Set(e.faits), absents = new Set(e.absents);
    const premier = jourDe(Math.max(Date.parse(a.depuis + 'T00:00:00Z'), Date.parse(hier + 'T00:00:00Z') - (a.jours - 1) * J));
    let aFaire = joursEntre(premier, hier).filter(j => !faits.has(j) && !absents.has(j)).reverse();   // le plus récent d'abord
    if (limiteJours) aFaire = aFaire.slice(0, limiteJours); let nOk = 0, nAbs = 0, nTr = 0;
    console.log(`${a.id} : ${aFaire.length} jour(s) à traiter (de ${premier} à ${hier})`);
    for (let k = 0; k < aFaire.length; k += 3) {
      if (Date.now() - debut0 > budget) { console.log(`${a.id} : budget de temps atteint, la suite sera reprise à la prochaine exécution`); break; }
      const lot = aFaire.slice(k, k + 3), buf = await Promise.all(lot.map(j => telecharger(URL_JOUR(a.symbole, j)).catch(err => { console.error('✗ ' + a.id + ' ' + j + ' : ' + err.message); return undefined; })));
      for (let i = 0; i < lot.length; i++) {
        if (buf[i] === undefined) continue; if (buf[i] === null) { absents.add(lot[i]); nAbs++; continue; }
        try { const r = await agregerJour(buf[i], a.fin); if (!r.transactions) { absents.add(lot[i]); nAbs++; continue; } ecrireJour(sortie, a, r.heures); faits.add(lot[i]); nOk++; nTr += r.transactions; }
        catch (err) { console.error('✗ ' + a.id + ' ' + lot[i] + ' : ' + err.message); }
      }
      e.faits = [...faits].sort(); e.absents = [...absents].sort(); fs.writeFileSync(path.join(sortie, 'etat.json'), JSON.stringify(etat));
    }
    e.faits = [...faits].sort(); e.absents = [...absents].sort(); console.log(`${a.id} : ${nOk} jour(s) écrits (${nTr.toLocaleString('fr-FR')} transactions), ${nAbs} absent(s)`);
  }
  /* index lu par le navigateur : pour chaque actif, plage couverte, tailles, mois disponibles par unité */
  const index = { t: Date.now(), format: '{pas,u,b:[[t secondes,[[indice,vendeur,acheteur,n]]]]} ; prix = indice × pas ; un fichier gzip par mois', source: 'Binance data.binance.vision (futures um, aggTrades)', actifs: {} };
  for (const a of ACTIFS) {
    const e = etat.actifs[a.id]; if (!e || !e.faits.length) continue; const faits = [...e.faits].sort(), mois = {};
    for (const u of ['H1', 'H4', 'J']) mois[u] = [...new Set(faits.map(j => j.slice(0, 7)))];
    index.actifs[a.id] = { nom: a.nom, symbole: a.symbole, fin: a.fin, tailles: a.tailles, debut: faits[0], dernier: faits[faits.length - 1], jours: faits.length, mois, trous: joursEntre(faits[0], faits[faits.length - 1]).filter(j => !faits.includes(j)).length };
  }
  fs.writeFileSync(path.join(sortie, 'index.json'), JSON.stringify(index));
  const octets = tailleDossier(sortie), parActif = Object.fromEntries(ACTIFS.map(a => [a.id, tailleDossier(path.join(sortie, a.id))]));
  console.log('taille des fichiers : ' + (octets / 1e6).toFixed(1) + ' Mo au total · ' + Object.entries(parActif).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)} Mo`).join(' · '));
}
