/* ═════════════ TERMINAL : HISTORIQUE COMPLET D'UN ACTIF ET D'UNE UNITÉ (chargement progressif vers le passé + cache local) ═════════════
   Trois couches, de la plus récente à la plus ancienne, jamais mélangées sans étiquette :
     k : Kraken Futures (le prix du graphique) ; secours Nasdaq : Yahoo ^NDX par le Worker si le relais ne sert pas ce symbole ;
     r : référence Binance (avant le début de Kraken), décalée de l'écart MESURÉ sur les bougies communes (ref: true) ;
     b : bande ancienne (PAXG pour l'or, QQQx × rapport mesuré pour le Nasdaq), sans volume ni zones (bande: true).
   Aucune limite artificielle : on remonte page par page jusqu'à ce que chaque source n'ait plus rien. Le graphique n'affiche qu'une fenêtre
   (élargie quand on fait défiler vers la gauche) ; les calculs (SMA 200…) utilisent tout ce qui est chargé.
   Cache IndexedDB « rayle-terminal » par morceaux de 5000 bougies (écritures courtes : jamais de grosse pause). Rien n'est envoyé ailleurs. */
import { UNITES, PAR_ID_T } from './actifs-terminal.js';
import { krakenFenetre, binancePage, workerPage, relaisCompatible, PAGE_KRAKEN, PAGE_BINANCE_F, PAGE_BINANCE_S } from './sources-terminal.js';

export const MORCEAU = 5000;
export const RECOUVREMENT = 48;   // bougies communes pour mesurer l'écart (ou le rapport)
const mediane = x => { const s = x.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/* fusion de deux listes triées par t (b remplace a au même t) */
export function fusionner(a, b) {
  if (!a.length) return b.slice(); if (!b.length) return a.slice();
  if (b[0].t > a[a.length - 1].t) return a.concat(b);
  if (b[b.length - 1].t < a[0].t) return b.concat(a);
  const m = new Map(a.map(x => [x.t, x])); for (const x of b) m.set(x.t, x);
  return [...m.values()].sort((x, y) => x.t - y.t);
}
/* écart (mode « ecart ») ou rapport (mode « rapport ») mesuré sur les bougies communes les plus anciennes de la série principale */
export function mesurer(principale, autre, mode = 'ecart', n = RECOUVREMENT) {
  const m = new Map(autre.map(b => [b.t, b.c])), d = [];
  for (const b of principale) { const c = m.get(b.t); if (c > 0) { d.push(mode === 'rapport' ? b.c / c : b.c - c); if (d.length >= n) break; } }
  return d.length >= Math.min(12, n) ? { valeur: mediane(d), n: d.length } : null;
}
export const transformer = (L, mesure, mode, drapeau) => {
  const v = mesure ? mesure.valeur : (mode === 'rapport' ? 1 : 0);
  const f = mode === 'rapport' ? p => p * v : p => p + v;
  return L.map(b => ({ t: b.t, o: f(b.o), h: f(b.h), l: f(b.l), c: f(b.c), v: drapeau === 'bande' ? 0 : b.v, [drapeau]: true }));
};
/* assemblage : k, puis r avant k[0], puis b avant le début des deux (jamais deux bougies au même instant) */
export function assembler(k, r, b, mr, mb, modeBande) {
  const d0 = k.length ? k[0].t : Infinity;
  const rr = mr ? transformer(r.filter(x => x.t < d0), mr, 'ecart', 'ref') : [];
  const d1 = rr.length ? rr[0].t : d0;
  const bb = mb ? transformer(b.filter(x => x.t < d1), mb, modeBande, 'bande') : [];
  return bb.concat(rr, k);
}

/* ── cache IndexedDB (morceaux) ── */
const BASE = 'rayle-terminal', MAGASIN = 'bougies';
export function ouvrirCache(idb = globalThis.indexedDB) {
  if (!idb) return Promise.resolve(null);
  return new Promise(res => {
    let q; try { q = idb.open(BASE, 1); } catch (e) { return res(null); }
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(MAGASIN)) q.result.createObjectStore(MAGASIN); };
    q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
  });
}
function lireTout(db, prefixe) {
  return new Promise(res => {
    try {
      const tx = db.transaction(MAGASIN, 'readonly'), st = tx.objectStore(MAGASIN), out = [];
      const rq = st.openCursor(IDBKeyRange.bound(prefixe, prefixe + '￿'));
      rq.onsuccess = () => { const c = rq.result; if (!c) return res(out); out.push([c.key, c.value]); c.continue(); };
      rq.onerror = () => res(out);
    } catch (e) { res([]); }
  });
}
function ecrire(db, cle, val) { return new Promise(res => { try { const tx = db.transaction(MAGASIN, 'readwrite'); tx.objectStore(MAGASIN).put(val, cle); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); } }); }

export function creerSerie({ actif, unite, fetchFn = (...a) => fetch(...a), relais, cache = null, maintenant = () => Date.now(), wjson, pause = 350, ouvert = null } = {}) {
  const A = PAR_ID_T[actif], U = UNITES[unite]; if (!A || !U) throw new Error('actif ou unité inconnus');
  const S = { k: [], r: [], b: [], fini: { k: false, r: !A.ref, b: !A.bande }, mr: null, mb: null, source: 'kraken', erreurs: {}, assemble: null, sales: new Set(), auto: false, arret: false };
  const opt = { fetchFn, relais: relais || undefined };
  if (!relais) delete opt.relais;
  const prefixe = `${actif}|${unite}|`;
  const tOuvert = ouvert != null ? ouvert : Date.parse(A.ouvert) - 2 * 86400e3;   // mise en ligne du perpétuel : rien à demander à Kraken avant (et le relais refuse les dates trop anciennes)
  const salir = (src, L) => { for (const b of L) S.sales.add(src + '|' + Math.floor(b.t / (MORCEAU * U.ms))); };
  const invalider = () => { S.assemble = null; };

  async function lireCache() {
    if (!cache) return false;
    const L = await lireTout(cache, prefixe); if (!L.length) return false;
    const par = { k: [], r: [], b: [] };
    for (const [cle, v] of L) { const src = cle.slice(prefixe.length).split('|')[0]; if (src === 'meta') { Object.assign(S.fini, v.fini || {}); if (v.source) S.source = v.source; continue; } if (par[src] && Array.isArray(v)) par[src].push(...v); }
    for (const s of ['k', 'r', 'b']) S[s] = par[s].sort((x, y) => x.t - y.t);
    invalider(); return S.k.length > 0;
  }
  let ecriture = null;
  function planifierEcriture() {
    if (!cache || ecriture) return;
    ecriture = setTimeout(async () => {
      ecriture = null; const sales = [...S.sales]; S.sales.clear();
      for (const id of sales) {   // un morceau par écriture : jamais de longue pause
        const [src, m] = id.split('|'), d = +m * MORCEAU * U.ms, f = d + MORCEAU * U.ms;
        await ecrire(cache, `${prefixe}${src}|${m}`, S[src].filter(b => b.t >= d && b.t < f));
      }
      await ecrire(cache, `${prefixe}meta`, { fini: S.fini, source: S.source, maj: maintenant() });
    }, 1500);
  }

  async function pageRecente() {
    const fin = Math.floor(maintenant() / U.ms) * U.ms + U.ms, debut = fin - PAGE_KRAKEN * U.ms, debutK = Math.max(debut, Math.min(tOuvert, fin - 3 * U.ms));
    if (await relaisCompatible(A.symbole, opt)) {
      S.source = 'kraken';
      const L = await krakenFenetre(A.symbole, unite, S.k.length ? Math.max(debutK, S.k[S.k.length - 1].t - 3 * U.ms) : debutK, fin, opt);
      if (L.length) { S.k = fusionner(S.k, L); salir('k', L); invalider(); }
      return L.length;
    }
    // le relais ne sert pas ce symbole (ancienne version) : secours explicite
    if (A.secours && A.secours.source === 'worker') {
      S.source = 'worker'; const L = await workerPage(A.secours.actif, unite, { wjson });
      S.k = fusionner(S.k.filter(b => b.t < (L[0] ? L[0].t : Infinity)), L); S.fini.k = true; S.fini.b = true; invalider(); return L.length;
    }
    if (A.ref) {   // crypto : la référence Binance devient la série principale, étiquetée
      S.source = 'binance';
      const L = await binancePage(A.ref.source, A.ref.symbole, unite, debut + (PAGE_KRAKEN - PAGE_BINANCE_F) * U.ms, fin, opt);
      if (L.length) { S.k = fusionner(S.k, L); salir('k', L); invalider(); }
      S.fini.r = true; return L.length;
    }
    throw new Error(`le relais Kraken ne sert pas encore ${A.symbole} (redéployer rayle-or-relais)`);
  }

  /* une étape vers le passé : Kraken (ou la source principale), puis la référence, puis la bande ; renvoie le nombre de bougies ajoutées */
  async function etapeAncienne() {
    const p = S.source === 'binance' ? { src: A.ref.source, sym: A.ref.symbole, page: PAGE_BINANCE_F } : null;
    if (!S.fini.k && S.k.length) {
      const fin = S.k[0].t;
      if (S.source === 'kraken') {
        if (fin <= tOuvert) { S.fini.k = true; planifierEcriture(); return 0; }
        const de = Math.max(fin - PAGE_KRAKEN * U.ms, tOuvert), L = await krakenFenetre(A.symbole, unite, de, fin, opt);
        if (!L.length) { S.fini.k = true; } else { S.k = fusionner(L, S.k); salir('k', L); invalider(); return L.length; }
      } else if (p) {
        const de = fin - p.page * U.ms, L = await binancePage(p.src, p.sym, unite, de, fin, opt);
        if (!L.length) S.fini.k = true; else { S.k = fusionner(L, S.k); salir('k', L); invalider(); return L.length; }
      } else S.fini.k = true;
      planifierEcriture(); if (!S.fini.k) return 0;
    }
    if (!S.fini.r && A.ref && S.k.length) {
      const fin = S.r.length ? S.r[0].t : S.k[0].t + RECOUVREMENT * U.ms, de = fin - PAGE_BINANCE_F * U.ms;
      const L = await binancePage(A.ref.source, A.ref.symbole, unite, de, fin, opt);
      if (!L.length) S.fini.r = true; else { S.r = fusionner(L, S.r); salir('r', L); invalider(); planifierEcriture(); return L.length; }
    }
    if (!S.fini.b && A.bande) {
      const tete = S.r.length && S.mr ? S.r[0].t : S.k.length ? S.k[0].t : null; if (tete == null) return 0;
      const fin = S.b.length ? S.b[0].t : tete + RECOUVREMENT * U.ms;
      let L;
      if (A.bande.source === 'kraken') {
        if (!(await relaisCompatible(A.bande.symbole, opt))) { S.fini.b = true; S.erreurs.b = 'relais : ' + A.bande.symbole + ' non servi'; return 0; }
        L = await krakenFenetre(A.bande.symbole, unite, fin - PAGE_KRAKEN * U.ms, fin, opt);
      } else L = await binancePage(A.bande.source, A.bande.symbole, unite, fin - PAGE_BINANCE_S * U.ms, fin, opt);
      if (!L.length) S.fini.b = true; else { S.b = fusionner(L, S.b); salir('b', L); invalider(); planifierEcriture(); return L.length; }
    }
    planifierEcriture(); return 0;
  }
  const toutFini = () => S.fini.k && S.fini.r && S.fini.b;

  const api = {
    actif, unite,
    async demarrer() {
      try { await lireCache(); } catch (e) { /* cache illisible : on recharge */ }
      try { await pageRecente(); S.erreurs.k = null; } catch (e) { S.erreurs.k = String(e.message || e); if (!S.k.length) throw e; }
      planifierEcriture(); return api.bougies();
    },
    async rafraichir() { try { const n = await pageRecente(); S.erreurs.k = null; planifierEcriture(); return n; } catch (e) { S.erreurs.k = String(e.message || e); return 0; } },
    etapeAncienne: async () => { try { return await etapeAncienne(); } catch (e) { S.erreurs.ancien = String(e.message || e); return 0; } },
    /* boucle de fond : remonte tout l'historique, une page à la fois, avec une pause entre deux (aucune longue tâche) */
    async remonterTout({ surPage = () => {} } = {}) {
      if (S.auto) return; S.auto = true; S.arret = false; let echecs = 0;
      while (!S.arret && !toutFini()) {
        const avant = S.erreurs.ancien; S.erreurs.ancien = null;
        const n = await api.etapeAncienne();
        if (S.erreurs.ancien) { if (++echecs >= 3) break; } else echecs = 0;
        if (n) surPage(n);
        if (!S.erreurs.ancien && avant) S.erreurs.ancien = null;
        await new Promise(r => setTimeout(r, pause));
      }
      S.auto = false;
    },
    arreter() { S.arret = true; },
    bougies() {
      if (S.assemble) return S.assemble;
      if (!S.mr && A.ref && S.r.length && S.k.length && S.source === 'kraken') S.mr = mesurer(S.k, S.r, 'ecart');
      if (!S.mb && A.bande && S.b.length) { const base = S.r.length && S.mr ? transformer(S.r, S.mr, 'ecart', 'ref') : S.k; S.mb = mesurer(base, S.b, A.bande.mode); }
      S.assemble = S.source === 'kraken' ? assembler(S.k, S.r, S.b, S.mr, S.mb, A.bande && A.bande.mode) : S.k.slice();
      return S.assemble;
    },
    /* prix en direct (transactions Kraken) : met à jour la dernière bougie, en crée une nouvelle à l'heure ronde */
    prix(p, t = maintenant()) {
      if (!(p > 0) || S.source !== 'kraken' || !S.k.length) return false;
      const t0 = Math.floor(t / U.ms) * U.ms, d = S.k[S.k.length - 1];
      if (t0 === d.t) { d.h = Math.max(d.h, p); d.l = Math.min(d.l, p); d.c = p; }
      else if (t0 > d.t) S.k.push({ t: t0, o: d.c, h: Math.max(d.c, p), l: Math.min(d.c, p), c: p, v: 0 });
      else return false;
      if (S.assemble) { const e = S.assemble[S.assemble.length - 1]; if (e && e.t === t0) Object.assign(e, S.k[S.k.length - 1]); else S.assemble = null; }
      return true;
    },
    info() {
      const B = api.bougies(), nk = S.k.length;
      return { source: S.source, n: B.length, nKraken: nk, nRef: B.filter(b => b.ref).length, nBande: B.filter(b => b.bande).length, debut: B.length ? B[0].t : null, debutKraken: nk ? S.k[0].t : null, fini: { ...S.fini }, toutFini: toutFini(), ecart: S.mr, rapport: S.mb, erreurs: { ...S.erreurs }, enCours: S.auto };
    },
    _S: S
  };
  return api;
}
