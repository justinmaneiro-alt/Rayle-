/* ═════════════ MODE VOLUME : DONNÉES DE BOUGIES AVEC VOLUME (v4) — la source réelle de chaque volume est affichée ═════════════
   Honnêteté : l'or au comptant et le forex n'ont PAS de volume centralisé (sur XTB c'est un volume de ticks). On utilise le meilleur volume réel gratuit de chaque actif et on l'écrit :
     · Or : perpétuel Binance XAUUSDT (volume réel + côté de l'agresseur → delta réel) et Kraken PF_XAUUSD (carnet, transactions) ; option « COMEX » = futures GC=F (volume institutionnel, via Yahoo).
     · Bitcoin, Solana : Binance (volume réel + côté) et Kraken (carnet, transactions).
     · Nasdaq 100, S&P 500 : volume des futures NQ=F / ES=F (CME, via Yahoo, différé) ; pas de carnet gratuit, pas de côté → delta ESTIMÉ depuis la bougie.
     · EUR/USD : volume des futures 6E=F (CME) ; à défaut, volume de ticks (Dukascopy) clairement étiqueté. Delta estimé.
   Les bougies Binance viennent de l'API publique (CORS ouvert) ; celles de Yahoo viennent des instantanés du robot GitHub (indépendants du PC). */
import { enH4 } from './volume-calcul.js';

export const BASE_SNAPSHOTS = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/';
export const UNITES_VOLUME = Object.freeze(['H1', 'H4', 'J']);
export const PAS_UNITE = Object.freeze({ H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 });
const BINANCE_INTERVALLE = { H1: '1h', H4: '4h', J: '1d' };

export const ACTIFS_VOLUME = Object.freeze([
  { id: 'or', nom: 'Or', court: 'XAU/USD', binance: 'XAUUSDT', repli: 'GC=F', yahoo: 'GC=F', yahooNom: 'COMEX GC', live: true, carnet: true, decimales: 2,
    badge: { reel: 'Volume réel · Binance XAUUSDT (perpétuel) + Kraken PF_XAUUSD', ref: 'Volume institutionnel · futures COMEX GC (Yahoo, différé) · prix des futures, pas du comptant' }, typeVolume: 'reel', deltaReel: true },
  { id: 'btc', nom: 'Bitcoin', court: 'BTC/USD', binance: 'BTCUSDT', repli: 'BTC-USD', live: true, carnet: true, decimales: 0, badge: { reel: 'Volume réel · Binance + Kraken' }, typeVolume: 'reel', deltaReel: true },
  { id: 'sol', nom: 'Solana', court: 'SOL/USD', binance: 'SOLUSDT', repli: 'SOL-USD', live: true, carnet: true, decimales: 2, badge: { reel: 'Volume réel · Binance + Kraken' }, typeVolume: 'reel', deltaReel: true },
  { id: 'us100', nom: 'Nasdaq 100', court: 'US100', yahoo: 'NQ=F', repli: '^NDX', yahooNom: 'CME NQ', live: false, carnet: false, decimales: 1, badge: { reel: 'Volume des futures CME · NQ (Yahoo, différé) · prix des futures' }, typeVolume: 'futures', deltaReel: false },
  { id: 'us500', nom: 'S&P 500', court: 'US500', yahoo: 'ES=F', repli: '^GSPC', yahooNom: 'CME ES', live: false, carnet: false, decimales: 1, badge: { reel: 'Volume des futures CME · ES (Yahoo, différé) · prix des futures' }, typeVolume: 'futures', deltaReel: false },
  { id: 'eurusd', nom: 'EUR/USD', court: 'EUR/USD', yahoo: '6E=F', repli: 'EURUSD=X', yahooNom: 'CME 6E', live: false, carnet: false, decimales: 5, badge: { reel: 'Volume des futures CME · 6E (Yahoo, différé) · prix des futures' }, typeVolume: 'futures', deltaReel: false }
]);
export const parId = Object.freeze(Object.fromEntries(ACTIFS_VOLUME.map(a => [a.id, a])));
export const nomFichierBougies = (sym, iv) => `bougies-${String(sym).replace(/[^A-Za-z0-9]/g, '_')}-${iv}.json`;

/* texte du badge sous le titre : source et type de volume, et si le delta est réel ou estimé */
export function badgeSource(actif, source = 'reel') {
  const a = typeof actif === 'string' ? parId[actif] : actif; if (!a) return '';
  if (source === 'repli') return 'Volume indisponible · bougies de secours · delta estimé';
  const t = (a.badge && (a.badge[source] || a.badge.reel)) || '';
  const d = source === 'ref' || !a.deltaReel ? ' · delta estimé (pas de côté dans ce volume)' : ' · delta réel (côté de l’agresseur)';
  return t + d;
}

const nettoyer = L => { const m = new Map(); for (const b of L) if (b && b.c > 0 && b.h >= b.l && Number.isFinite(b.t)) m.set(b.t, b); return [...m.values()].sort((a, b) => a.t - b.t); };
const json = async (url, fetchFn, ms = 20000) => { const r = await fetchFn(url, { signal: globalThis.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }); if (!r.ok) throw new Error(new URL(url).host + ' a répondu ' + r.status); return r.json(); };

/* Binance (perpétuels) : pages de 1500 bougies, en remontant ; [t, o, h, l, c, v, …, 9 = volume acheteur agressif] */
export async function bougiesBinance(symbole, unite, { pages = 3, fetchFn = (...a) => fetch(...a), maintenant = Date.now() } = {}) {
  const iv = BINANCE_INTERVALLE[unite], pas = PAS_UNITE[unite]; let fin = maintenant + pas, tout = [];
  for (let p = 0; p < pages; p++) {
    const L = await json(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbole}&interval=${iv}&endTime=${Math.floor(fin)}&limit=1500`, fetchFn);
    if (!Array.isArray(L) || !L.length) break;
    tout = L.map(x => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], bv: +x[9] })).concat(tout);
    fin = L[0][0] - 1; if (L.length < 1500) break;
  }
  return nettoyer(tout);
}
/* Yahoo (instantanés du robot) : { b: [[t, o, h, l, c, v]] } ; H4 = 4 bougies H1 sur la grille UTC */
export async function bougiesYahoo(sym, unite, { fetchFn = (...a) => fetch(...a), base = BASE_SNAPSHOTS } = {}) {
  const iv = unite === 'J' ? '1d' : '1h', d = await json(base + nomFichierBougies(sym, iv), fetchFn);
  if (!d || !Array.isArray(d.b) || !d.b.length) throw new Error('instantané ' + sym + ' vide');
  const B = nettoyer(d.b.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v: v || 0 })));
  return { bougies: unite === 'H4' ? enH4(B) : B, t: d.t || null };
}
/* point d'entrée : { bougies, source ('reel' | 'ref'), deltaReel, aVolume, note, t } */
export async function chargerBarres(id, unite, { source = 'reel', fetchFn = (...a) => fetch(...a), maintenant = Date.now() } = {}) {
  const a = parId[id]; if (!a) throw new Error('actif inconnu : ' + id);
  if (a.binance && source !== 'ref') {
    let B = [], erreur = null; try { B = await bougiesBinance(a.binance, unite, { fetchFn, maintenant }); if (B.length < 50) erreur = 'Binance ' + a.binance + ' : moins de 50 bougies'; } catch (e) { erreur = String(e && e.message || e); }
    if (!erreur) return { bougies: B, source: 'reel', deltaReel: true, aVolume: B.some(b => b.v > 0), note: null, t: maintenant };
    const r2 = a.repli ? await bougiesYahoo(a.repli, unite, { fetchFn }).catch(() => null) : null;   // v6 : Binance injoignable → instantané du robot (prix et volume Yahoo, différés)
    if (r2) return { bougies: r2.bougies, source: 'repli', deltaReel: false, aVolume: r2.bougies.some(b => b.v > 0), note: 'Binance injoignable (' + erreur + ') : instantané du robot (différé), delta estimé.', t: r2.t, repli: erreur };
    throw new Error(erreur);
  }
  if (a.yahoo) {
    /* v6 (A0) : jamais d'écran vide. Si le fichier des futures manque (404, robot pas encore passé), on affiche quand même les bougies de l'indice ou de la paire au comptant (sans volume) avec un badge « volume indisponible » */
    let r, erreur = null; try { r = await bougiesYahoo(a.yahoo, unite, { fetchFn }); } catch (e) { erreur = String(e && e.message || e); }
    if (r) return { bougies: r.bougies, source: a.binance ? 'ref' : 'reel', deltaReel: false, aVolume: r.bougies.some(b => b.v > 0), note: r.bougies.some(b => b.v > 0) ? null : 'Cette source ne fournit pas de volume sur cette unité.', t: r.t, repli: null };
    if (a.repli) { const r2 = await bougiesYahoo(a.repli, unite, { fetchFn }).catch(() => null); if (r2) return { bougies: r2.bougies, source: 'repli', deltaReel: false, aVolume: false, note: 'Volume indisponible (' + erreur + ') : bougies de l’indice au comptant, sans volume.', t: r2.t, repli: erreur }; }
    if (a.binance) { const B = await bougiesBinance(a.binance, unite, { fetchFn, maintenant }); if (B.length >= 50) return { bougies: B, source: 'reel', deltaReel: true, aVolume: true, note: null, t: maintenant, repli: erreur }; }
    throw new Error(erreur || 'aucune bougie disponible pour ' + id);
  }
  throw new Error('aucune source de volume pour ' + id);
}
/* âge lisible d'une donnée */
export function ageDonnee(t, maintenant = Date.now()) { if (!Number.isFinite(t)) return 'âge inconnu'; const m = Math.max(0, Math.round((maintenant - t) / 60000)); if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + ' min'; const h = Math.round(m / 60); return h < 48 ? 'il y a ' + h + ' h' : 'il y a ' + Math.round(h / 24) + ' j'; }
