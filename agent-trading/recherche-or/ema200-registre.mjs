/* REGISTRE EN AVANT « EMA200 H1 » (ajout seul) : note chaque NOUVEL événement dès la clôture de sa bougie, avec les règles figées de ema200-regles.mjs (SHA-256 vérifié), sur les bougies Kraken PF_XAUUSD.
   Fichier : registre-ema200-avant.jsonl (une ligne JSON par enregistrement, jamais réécrit : seulement des lignes ajoutées). À relancer à volonté : `node ema200-registre.mjs`.
   Lignes : « ouverture » (une fois), « evenement » (numéro dans la suite du journal 2026, indicateur de range, champ pris = null à remplir à la main dans le CSV), « resultat » (6, 12, 24 bougies : R brut, stop touché ; le R net se calcule avec la règle de frais figée et l'écart de référence de la ligne d'ouverture). */
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import * as R from './ema200-regles.mjs'; import { charger } from './donnees.mjs';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, F = path.join(ici, 'registre-ema200-avant.jsonl'), sceau = JSON.parse(fs.readFileSync(path.join(ici, 'ema200-sceau.json'), 'utf8'));
if (crypto.createHash('sha256').update(fs.readFileSync(path.join(ici, 'ema200-regles.mjs'), 'utf8').replace(/\r\n/g, '\n')).digest('hex') !== sceau.sha256) { console.error('Les règles ont changé depuis leur figeage : arrêt.'); process.exit(1); }
const lignes = fs.existsSync(F) ? fs.readFileSync(F, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [], ajout = x => { fs.appendFileSync(F, JSON.stringify(x) + '\n'); lignes.push(x); };
const now = Date.now(), r = await fetch(`https://futures.kraken.com/api/charts/v1/trade/PF_XAUUSD/1h?from=${Math.floor((now - 1700 * H) / 1000)}&to=${Math.floor(now / 1000)}`); if (!r.ok) { console.error('Kraken a répondu', r.status); process.exit(1); }
const K = (await r.json()).candles.map(c => ({ t: c.time, o: +c.open, h: +c.high, l: +c.low, c: +c.close })).filter(b => b.t + H <= now && !(b.h === b.l)); if (K.length < 300) { console.error('Pas assez de bougies Kraken'); process.exit(1); }
const E = R.emaSerie(K), A = R.atrSerie(K);
let ouv = lignes.find(l => l.kind === 'ouverture');
if (!ouv) {
  const res = JSON.parse(fs.readFileSync(path.join(ici, 'resultats-ema200.json'), 'utf8')), sp = charger({ debut: 2026, fin: 2026 }).h1.filter(b => !(b.h === b.l && !b.v)).map(b => b.sp).sort((a, b) => a - b);
  ouv = { kind: 'ouverture', version: R.VERSION, sha_regles: sceau.sha256, tOuverture: K[K.length - 1].t + H, ouverteLe: new Date(now).toISOString(), source: 'Kraken PF_XAUUSD H1', numeroDepart: res.dernierNumero, ecartReferenceDukascopy: sp[sp.length >> 1], fraisCfd: `${R.P.coutCfdFoisSpread} × l'écart de référence`, fraisKraken: `${R.P.fraisKrakenPct * 100} % du prix + l'écart de référence` }; ajout(ouv);
}
const deja = new Set(lignes.filter(l => l.kind === 'evenement').map(l => l.id)); let numero = Math.max(ouv.numeroDepart, ...lignes.filter(l => l.kind === 'evenement').map(l => l.numero), 0);
const premier = K.findIndex(b => b.t + H > ouv.tOuverture), EV = premier < 0 ? [] : R.evenements(K, { depuisI: premier, E, A }); let nouveaux = 0;
for (const e of EV) { if (deja.has(e.id)) continue; numero++; nouveaux++; ajout({ kind: 'evenement', numero, id: e.id, type: e.type, dir: e.dir, sens: e.dir > 0 ? 'achat' : 'vente', t: e.t, tCloture: e.t + H, cloture: K[e.i].c, ema200: E[e.i], atr: A[e.i], range: R.enRange(K, E, e.i), traversees50: R.traversees(K, E, e.i), pris: null, notee: new Date(now).toISOString() }); }
const idx = new Map(K.map((b, i) => [b.t, i])); let resultats = 0;
for (const ev of lignes.filter(l => l.kind === 'evenement')) { const i = idx.get(ev.t); if (i == null) continue; for (const h of R.P.horizons) { if (lignes.some(l => l.kind === 'resultat' && l.id === ev.id && l.h === h)) continue; const t = R.trade(K, A, i, ev.dir, h); if (!t) continue; resultats++; ajout({ kind: 'resultat', id: ev.id, numero: ev.numero, h, R_brut: t.R0, risque: t.risque, entree: t.entree, stoppe: t.stoppe, tSortie: K[t.sortie].t + H, notee: new Date(now).toISOString() }); } }
console.log(`registre : ${nouveaux} nouvel(s) événement(s), ${resultats} résultat(s) ajouté(s) ; ${lignes.filter(l => l.kind === 'evenement').length} événements au total ; dernière bougie ${new Date(K[K.length - 1].t).toISOString()}`);
