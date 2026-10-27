import { creerClient } from '../pc/trading/client.js';
import { ouvrirStockage } from '../pc/trading/stockage.js';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

/* Faux Worker : /marche?actif=…&intervalle=…&n=… rend des bougies reproductibles ; un instant `maintenant` pilote la dernière bougie. */
function fauxWorker({ volumes = {}, pannes = new Set(), debut = Date.UTC(2026, 9, 12, 13, 30) } = {}) {
  const journal = [];
  const pas = { '15min': 900e3, '1h': 3600e3, '4h': 14400e3, '1day': 86400e3 };
  const appeler = async path => {
    journal.push(path);
    const u = new URL('http://x' + path), actif = decodeURIComponent(u.searchParams.get('actif')), iv = u.searchParams.get('intervalle'), n = Number(u.searchParams.get('n'));
    if (pannes.has(actif)) throw new Error('HTTP 502 · données indisponibles pour ' + actif);
    const a = alea(actif.length * 31 + iv.length), out = []; let c = 100;
    const fin = fauxWorker.maintenant || Date.UTC(2026, 9, 21, 15, 0);
    for (let i = n - 1; i >= 0; i--) { const o = c, cl = o + (a() - 0.5) * 2; out.push({ t: fin - i * pas[iv], o, h: Math.max(o, cl) + a(), l: Math.min(o, cl) - a(), c: cl, v: volumes[actif] === false ? 0 : Math.round(500 + a() * 500) }); c = cl; }
    return { actif, nom: actif, intervalle: iv, source: actif.startsWith('Y:') || actif === 'NDX' ? 'Yahoo Finance' : 'Twelve Data', symbole_source: actif, secours: false, differe: actif === 'NDX', note: 'note ' + actif, maj: new Date(fin).toISOString(), cache: 'non', bougies: out };
  };
  return { appeler, journal };
}
fauxWorker.maintenant = Date.UTC(2026, 9, 21, 15, 0);
let T = Date.UTC(2026, 9, 21, 15, 0);
const nouveau = (w, opts = {}) => creerClient({ appeler: w.appeler, stockage: opts.stockage || null, maintenant: () => T, visible: () => opts.visible !== false, ferme: () => !!opts.ferme });

// 1. Première lecture : une requête, source et heure conservées
let w = fauxWorker(), c = nouveau(w);
let r = await c.serie('US100', 'M15');
v('1. première lecture : une seule requête vers /marche (actif NDX, 15min, n=500)', w.journal.length === 1 && /actif=NDX&intervalle=15min&n=500/.test(w.journal[0]), w.journal.join(' '));
v('1. 500 bougies, source et note conservées', r.bougies.length === 500 && r.meta.source === 'Yahoo Finance' && r.meta.differe === true && /NDX/.test(r.meta.note));
v('1. l\'heure de réception est enregistrée', r.meta.recuLe === T && r.rafraichie === true);
v('1. Nasdaq : le volume de l\'indice est utilisé (pas de requête proxy)', r.volume.type === 'indice' && w.journal.length === 1);

// 2. Deuxième lecture rapprochée : aucune requête
r = await c.serie('US100', 'M15');
v('2. une relecture immédiate ne refait aucune requête', w.journal.length === 1 && r.rafraichie === false);
T += 60e3; r = await c.serie('US100', 'M15');
v('2. une minute plus tard : toujours aucune requête (M15 = 2 min)', w.journal.length === 1);
T += 61e3; r = await c.serie('US100', 'M15');
v('2. au-delà de 2 minutes : une nouvelle requête', w.journal.length === 2 && r.rafraichie === true);
v('2. les bougies sont fusionnées sans doublon', r.bougies.length === 500 || r.bougies.length === 501 || r.bougies.length === 502, r.bougies.length);

// 3. Requêtes en double regroupées
w = fauxWorker(); c = nouveau(w);
const [r1, r2] = await Promise.all([c.serie('XAU', 'H1', { force: true }), c.serie('XAU', 'H1', { force: true })]);
v('3. deux demandes en même temps = une seule requête (+ le volume de substitution)', w.journal.filter(p => /actif=XAU&/.test(p)).length === 1, w.journal.join(' | '));

// 4. L'or : pas de volume gratuit → volume du contrat à terme, étiqueté PROXY
v('4. l\'or demande aussi GC=F pour le volume et le dit', w.journal.some(p => /actif=Y%3AGC%3DF/.test(p)) && r1.volume.type === 'proxy' && /GC=F/.test(r1.volume.note) && r1.volume.couverture > 0.9, JSON.stringify(r1.volume));
v('4. les bougies de l\'or portent un volume (substitution)', r1.bougies.some(x => x.v > 0));
w = fauxWorker({ volumes: { XAU: false }, pannes: new Set(['Y:GC=F']) }); c = nouveau(w);
r = await c.serie('XAU', 'H1', { force: true });
v('4. si le proxy tombe : prix gardés, volume « aucun », message clair, rien d\'inventé', r.bougies.length === 500 && r.volume.type === 'aucun' && /indisponible/.test(r.volume.note) && r.bougies.every(x => x.v === 0));

// 5. Indices sans volume : aucune requête de plus
w = fauxWorker(); c = nouveau(w);
r = await c.serie('VIX', 'D1');
v('5. VIX : pas de volume, pas de requête proxy', w.journal.length === 1 && r.volume.type === 'aucun');
w = fauxWorker({ volumes: { NDX: false } }); c = nouveau(w);
r = await c.serie('US100', 'H1');
v('5. Nasdaq sans volume dans la source : essaie le contrat NQ=F, étiqueté proxy', w.journal.some(p => /Y%3ANQ%3DF/.test(p)) && r.volume.type === 'proxy');

// 6. Panne du Worker : on garde les dernières bougies, marquées périmées
w = fauxWorker(); c = nouveau(w);
await c.serie('US100', 'D1'); T += 700e3;
w.appeler = async () => { throw new Error('Worker injoignable'); };
const c2 = creerClient({ appeler: w.appeler, stockage: null, maintenant: () => T, visible: () => true, ferme: () => false });
r = await c2.serie('US100', 'D1');
v('6. première lecture en panne : liste vide, erreur dite, aucune exception', r.vide === true && /injoignable/.test(r.erreur) && r.bougies.length === 0);
const w2 = fauxWorker(), c3 = creerClient({ appeler: async p => { if (c3.panne) throw new Error('HTTP 502'); return w2.appeler(p); }, stockage: null, maintenant: () => T, visible: () => true, ferme: () => false });
await c3.serie('US100', 'D1'); c3.panne = true; T += 700e3;
r = await c3.serie('US100', 'D1');
v('6. panne après une lecture réussie : bougies gardées, marquées périmées, erreur dite', r.bougies.length > 100 && r.meta.perime === true && /502/.test(r.erreur));
const avant = w2.journal.length; T += 5e3; await c3.serie('US100', 'D1');
v('6. après un échec : on ne martèle pas le Worker (nouvel essai après ~30 s)', w2.journal.length === avant);
c3.panne = false; T += 40e3; r = await c3.serie('US100', 'D1');
v('6. le Worker revient : tout redevient normal', r.erreur === null && r.meta.perime === false);

// 7. Onglet caché, marché fermé
w = fauxWorker(); c = nouveau(w, { visible: false });
r = await c.serie('US100', 'H1');
v('7. onglet caché mais aucune donnée : on charge quand même une fois', r.bougies.length === 500);
T += 10e6; r = await c.serie('US100', 'H1');
v('7. onglet caché avec des données : on ne redemande rien', w.journal.length === 1);
w = fauxWorker(); c = nouveau(w, { ferme: true });
await c.serie('US100', 'M15'); T += 150e3; await c.serie('US100', 'M15');
v('7. marché fermé : bien moins de requêtes (au moins 10 minutes entre deux)', w.journal.length === 1);

// 8. Historique gardé (IndexedDB ou mémoire) et limité
const stock = await ouvrirStockage(null);
v('8. sans IndexedDB : repli sur la mémoire', stock.type === 'memoire');
w = fauxWorker(); c = nouveau(w, { stockage: stock });
await c.serie('XAU', 'D1');
const c4 = nouveau(w, { stockage: stock });
const avantReload = w.journal.length;
r = await c4.serie('XAU', 'D1');
v('8. un nouveau client retrouve l\'historique enregistré sans requête', r.bougies.length === 500 && w.journal.length === avantReload, r.bougies.length + ' / ' + (w.journal.length - avantReload));
const lonc = fauxWorker(); const c5 = nouveau(lonc, { stockage: await ouvrirStockage(null) });
for (let i = 0; i < 3; i++) { fauxWorker.maintenant += i * 40 * 86400e3; T += 700e3; await c5.serie('VIX', 'D1', { force: true }); }
fauxWorker.maintenant = Date.UTC(2026, 9, 21, 15, 0);
v('8. l\'historique s\'allonge au fil des lectures (fusion)', (await c5.serie('VIX', 'D1')).bougies.length > 500);
const gros = fauxWorker(); const c6 = nouveau(gros, { stockage: null }); r = await c6.serie('US100', 'D1');
v('8. instrument et unité inconnus : erreur claire', await c6.serie('???', 'D1').then(() => false, e => /inconnu/.test(e.message)));

// 9. Surveillance
w = fauxWorker(); c = nouveau(w);
const recus = []; const stop = c.abonner('US100', 'M15', x => recus.push(x), { tick: 20 });
await new Promise(res => setTimeout(res, 120)); stop(); const n0 = recus.length;
await new Promise(res => setTimeout(res, 80));
v('9. surveillance : une première lecture, puis arrêt propre', n0 >= 1 && recus.length === n0 && c.stats().abonnements === 0);
console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
