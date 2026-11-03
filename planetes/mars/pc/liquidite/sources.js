import { decoderSegments } from './moteur/format-profondeur.js';
import { analyserLiquidite } from './moteur/analyse.js';
const PAIRES = { BTC: { ronds: [1000, 5000] }, SOL: { ronds: [5, 10] }, DOGE: { ronds: [0.01, 0.05] } };   // niveaux ronds affichés sur la carte
import { creerStockageMemoire } from './moteur/stockage-memoire.js';

/* ═════════════ SOURCES DE LA CARTE DE LIQUIDITÉ (V4, phase 4) ═════════════
   Deux fournisseurs qui répondent aux mêmes questions (`profondeur`, `lignes`, `analyse`, `plage`, `statut`) :
   – PC : le service du PC enregistre le carnet ;
   – DIRECT : la page se connecte elle-même aux flux publics (Kraken, Binance) avec le MÊME code que le service (enregistreur.mjs, en mémoire) ; direct seulement, pas d'historique, rien n'est gardé
     après fermeture ; marche sur tablette et téléphone sans le PC. Si ni l'un ni l'autre n'est possible, la fenêtre le dit clairement. */
const delai = (ms, p) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('délai dépassé')), ms))]);
const json = async (url, ms = 8000) => { const r = await delai(ms, fetch(url, { cache: 'no-store' })); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

/* Direct : `creerEnregistreur` du service PC, avec un stockage en mémoire et le WebSocket / fetch du navigateur. */
export async function creerSourceDirecte({ actif = 'BTC', importer = specifieur => import(specifieur), fetchImpl = fetch.bind(globalThis), WebSocketImpl = globalThis.WebSocket, binance = 'https://data-api.binance.vision' } = {}) {
  const { creerEnregistreur, ACTIFS } = await importer(new URL('./moteur/enregistreur.mjs', import.meta.url).href);
  const memoire = creerStockageMemoire({ dureeS: 2400 });
  const get = async url => { const r = await delai(20000, fetchImpl(url)); if (!r.ok) { const e = new Error('HTTP ' + r.status); e.statut = r.status; e.retryApres = Number(r.headers.get('retry-after')) || null; throw e; } return r.json(); };
  const rec = creerEnregistreur({ stockage: memoire, actifs: [actif], fetchJson: get, WebSocketImpl }); rec.demarrer();
  let m15 = null, m15T = 0;
  async function bougies() {
    if (m15 && Date.now() - m15T < 600e3) return m15;
    try { const j = await get(binance + '/api/v3/klines?symbol=' + ACTIFS[actif].binance + '&interval=15m&limit=1000'), n = j.length; const col = f => Float64Array.from(j, f); m15 = { n, t: col(k => +k[0]), o: col(k => +k[1]), h: col(k => +k[2]), l: col(k => +k[3]), c: col(k => +k[4]), v: col(k => +k[5]), vb: col(k => +k[9]) }; m15T = Date.now(); } catch (e) { m15 = null; }
    return m15;
  }
  return {
    nom: 'directe', libelle: 'Connexion directe aux flux publics (direct seulement)', historique: false, memoire, rec,
    async statut() { const e = rec.etat(); return { ok: true, enregistre: e.enMarche !== false, phrase: 'Direct depuis le navigateur : ' + memoire.taille() + ' secondes en mémoire, pas d’historique.', jours: 0, trous: memoire.lireTrous().length, brut: e }; },
    async plage() { return null },
    async profondeur(cle, t0, t1) { return memoire.lireProfondeur(cle, t0, t1); },
    async lignes(type, cle, t0, t1) { return memoire.lireLignes(type, cle, t0, t1); },
    async analyse(act, venue, { minutes = 20 } = {}) {
      const cle = venue + '-' + act, t1 = Date.now(), t0 = t1 - minutes * 60e3, d = memoire.lireProfondeur(cle, t0, t1), k = await bougies();
      return analyserLiquidite({ actif: act, venue, maintenant: t1, donnees: d, evenements: memoire.lireLignes('evenements', cle, t0, t1), trades: memoire.lireLignes('trades', cle, t0, t1), barresProfil: null, m15: k, metrics: null, derives: memoire.lireLignes('derives', 'binance-fut-' + act, t1 - 6 * 3600e3, t1), joursCarnet: 0, ronds: (PAIRES[act] || {}).ronds || [] });
    },
    arreter() { try { rec.arreter(); } catch (e) { /* déjà arrêté */ } }
  };
}
