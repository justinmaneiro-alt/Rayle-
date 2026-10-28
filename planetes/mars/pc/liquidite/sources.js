import { decoderSegments } from '../../../../strategies/liquidite/format-profondeur.js';
import { analyserLiquidite } from '../../../../strategies/liquidite/analyse.js';
import { PAIRES } from '../agent-m6/paires.js';
import { creerStockageMemoire } from '../../../../strategies/liquidite/stockage-memoire.js';

/* ═════════════ SOURCES DE LA CARTE DE LIQUIDITÉ (V4, phase 4) ═════════════
   Deux fournisseurs qui répondent aux mêmes questions (`profondeur`, `lignes`, `analyse`, `plage`, `statut`) :
   – PC : le service Kepler enregistre le carnet 24 h/24 ; la page le lit par les routes locales /__flux/… (historique, relecture, murs sur plusieurs jours) ;
   – DIRECT : la page se connecte elle-même aux flux publics (Kraken, Binance) avec le MÊME code que le service (enregistreur.mjs, en mémoire) ; direct seulement, pas d'historique, rien n'est gardé
     après fermeture ; marche sur tablette et téléphone sans le PC. Si ni l'un ni l'autre n'est possible, la fenêtre le dit clairement. */
const delai = (ms, p) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('délai dépassé')), ms))]);
const json = async (url, ms = 8000) => { const r = await delai(ms, fetch(url, { cache: 'no-store' })); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

export function creerSourcePC({ base = '' } = {}) {
  return {
    nom: 'pc', libelle: 'Service Kepler du PC (carnet enregistré)', historique: true,
    async statut() { const s = await json(base + '/__flux/statut', 3500); return { ok: !!s.ok, enregistre: !!s.enregistre, phrase: s.phrase, jours: s.jours, trous: s.trous, brut: s }; },
    async plage(cle) { const r = await json(base + '/__flux/plage?cle=' + encodeURIComponent(cle)); return r.plage; },
    async profondeur(cle, t0, t1) {
      const r = await delai(15000, fetch(base + '/__flux/profondeur?cle=' + encodeURIComponent(cle) + '&t0=' + Math.round(t0) + '&t1=' + Math.round(t1), { cache: 'no-store' })); if (!r.ok) throw new Error('HTTP ' + r.status);
      return decoderSegments(new Uint8Array(await r.arrayBuffer()));
    },
    async lignes(type, cle, t0, t1) { const r = await json(base + '/__flux/lignes?type=' + type + '&cle=' + encodeURIComponent(cle) + '&t0=' + Math.round(t0) + '&t1=' + Math.round(t1)); return r.lignes || []; },
    async analyse(actif, venue, { minutes = 20, t = null } = {}) { const r = await json(base + '/__flux/analyse?actif=' + actif + '&venue=' + venue + '&minutes=' + minutes + (t ? '&t=' + Math.round(t) : ''), 25000); return r.analyse; },
    arreter() {}
  };
}

/* Direct : `creerEnregistreur` du service PC, avec un stockage en mémoire et le WebSocket / fetch du navigateur. */
export async function creerSourceDirecte({ actif = 'BTC', importer = specifieur => import(specifieur), fetchImpl = fetch.bind(globalThis), WebSocketImpl = globalThis.WebSocket, binance = 'https://data-api.binance.vision' } = {}) {
  const { creerEnregistreur, ACTIFS } = await importer(new URL('../../../../agent-pc/flux/enregistreur.mjs', import.meta.url).href);
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
