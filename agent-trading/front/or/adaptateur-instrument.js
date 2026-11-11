/* ═════════════ ADAPTATEUR D'INSTRUMENT (navigateur) — fait tourner le moteur de l'or sur n'importe quel instrument ═════════════
   Le moteur, les zones, les niveaux, la structure, l'ICT et les flèches lisent « Kraken » (relais) et « Binance » (klines). Pour un instrument
   autre que l'or, on répond à ces mêmes requêtes avec les bougies du serveur local (/__bougies, Yahoo) : un seul code, aucune règle dupliquée.
   Rien n'est inventé : si la source ne répond pas, la requête échoue avec la raison et le bandeau l'affiche.
   Les clés de stockage de l'or (rayle_or_*, base rayle-or-outils) sont suffixées par instrument : les zones tracées d'un instrument ne
   se mélangent jamais à celles d'un autre. À importer EN PREMIER (avant tout module du moteur). */
import { instrument, actifCourant, cleDe, baseDe, echelleDe, ID_DEFAUT } from './instruments.js';
import { RELAIS, BINANCE, PERIODES } from './config-or.js';

export const ACTIF = actifCourant();
export const INSTR = instrument(ACTIF);
const YAHOO = { M5: '5m', M15: '15m', H1: '1h', H4: '1h', J: '1d' };
const parPeriode = res => Object.values(PERIODES).find(p => p.kraken === res || p.binance === res);

/* H4 = 4 bougies H1 alignées sur l'UTC (même découpage que le reste du terminal) */
export function agreger(B, ms) {
  const o = []; let cur = null;
  for (const b of B) { const t0 = Math.floor(b.t / ms) * ms; if (!cur || cur.t !== t0) { cur = { t: t0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }; o.push(cur); } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; } }
  return o;
}
export function creerAdaptateur(inst, { fetchReel, ttl = 20e3, maintenant = () => Date.now() } = {}) {
  const memoire = new Map();
  async function serie(periodeId) {
    const k = periodeId, c = memoire.get(k);
    if (c && maintenant() - c.t < ttl) return c.p;
    const intervalle = YAHOO[periodeId], p = (async () => {
      const r = await fetchReel(`/__bougies?sym=${encodeURIComponent(inst.yahoo)}&interval=${intervalle}`);
      if (!r.ok) { let m = ''; try { m = (await r.json()).erreur || ''; } catch (e) { /* */ } throw new Error(`serveur local : ${r.status}${m ? ' · ' + m : ''}`); }
      const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
      if (!/json/.test(type)) throw new Error('le serveur du PC ne sert pas les données du Terminal (relance l’application Rayle)');
      const d = await r.json(), K = echelleDe(inst); let B = (d.bougies || []).map(b => (K === 1 ? b : { ...b, o: b.o * K, h: b.h * K, l: b.l * K, c: b.c * K })); if (K !== 1 && d.prix > 0) d.prix = d.prix * K;
      if (periodeId === 'H4') B = agreger(B, PERIODES.H4.ms);
      return { ...d, bougies: B };
    })();
    memoire.set(k, { t: maintenant(), p }); p.catch(() => memoire.delete(k));
    return p;
  }
  const json = (corps) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return async function adapter(url, opts) {
    const u = String(url);
    if (u.startsWith(RELAIS + '/kraken/bougies')) {
      const q = new URL(u).searchParams, P = parPeriode(q.get('res')); if (!P) throw new Error('période inconnue');
      const d = await serie(P.id), de = (+q.get('from') || 0) * 1000, a = q.get('to') ? +q.get('to') * 1000 : Infinity;
      return json({ candles: d.bougies.filter(b => b.t >= de && b.t < a).map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })) });
    }
    if (u.startsWith(RELAIS + '/kraken/ticker')) {
      const d = await serie('M15'), der = d.bougies[d.bougies.length - 1]; if (!der) throw new Error('aucune bougie');
      const prix = d.prix > 0 ? d.prix : der.c, tp = d.tPrix || der.t, il = d.bougies.filter(b => b.t <= tp - 24 * 3600e3).pop();
      return json({ ticker: { symbol: inst.yahoo, last: prix, lastTime: new Date(tp).toISOString(), bid: prix, ask: prix, open24h: il ? il.c : null } });
    }
    if (u.startsWith(RELAIS + '/kraken/instrument')) return json({ instrument: { symbol: inst.yahoo, tradeable: true } });
    if (u.startsWith(BINANCE.klines)) {
      const q = new URL(u).searchParams, P = parPeriode(q.get('interval')); if (!P) throw new Error('période inconnue');
      const d = await serie(P.id), de = +q.get('startTime') || 0, a = q.get('endTime') ? +q.get('endTime') : Infinity, lim = +q.get('limit') || 1500;
      return json(d.bougies.filter(b => b.t >= de && b.t <= a).slice(0, lim).map(b => [b.t, String(b.o), String(b.h), String(b.l), String(b.c), String(b.v), b.t + P.ms - 1, String(b.v * b.c), 0, String(b.v / 2), '0', '0']));
    }
    if (u.startsWith(BINANCE.ticker)) {
      const d = await serie('H1'), n = maintenant(), L = d.bougies.filter(b => b.t >= n - 24 * 3600e3);
      return json(inst.volume === 'aucun' ? { symbol: inst.yahoo } : { symbol: inst.yahoo, quoteVolume: String(L.reduce((s, b) => s + b.v * b.c, 0)) });
    }
    return null;   // pas une requête du moteur : fetch d'origine
  };
}

/* installation (navigateur, instrument autre que l'or seulement) */
function installer() {
  if (typeof window === 'undefined' || ACTIF === ID_DEFAUT || window.__adaptateurInstrument) return;
  window.__adaptateurInstrument = ACTIF;
  const fetchOrig = window.fetch.bind(window), A = creerAdaptateur(INSTR, { fetchReel: u => fetchOrig(u) });
  window.fetch = async function (url, opts) { const r = await A(typeof url === 'string' ? url : (url && url.url) || url, opts); return r || fetchOrig(url, opts); };
  // stockage : clés suffixées par instrument (les clés qui ne commencent pas par rayle_or_ ne bougent pas)
  const P = Storage.prototype, g = P.getItem, s = P.setItem, d = P.removeItem;
  P.getItem = function (k) { return g.call(this, this === window.localStorage ? cleDe(k, ACTIF) : k); };
  P.setItem = function (k, v) { return s.call(this, this === window.localStorage ? cleDe(k, ACTIF) : k, v); };
  P.removeItem = function (k) { return d.call(this, this === window.localStorage ? cleDe(k, ACTIF) : k); };
  if (window.indexedDB) { const o = IDBFactory.prototype.open; IDBFactory.prototype.open = function (nom, ...r) { return o.call(this, baseDe(nom, ACTIF), ...r); }; }
}
installer();
