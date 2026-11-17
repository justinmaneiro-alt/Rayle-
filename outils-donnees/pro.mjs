/* ═════════════ INSTANTANÉS « PRO » : séries compactes par actif pour les fenêtres Marchés, Couverture, Terminal ═════════════
   Pourquoi : les fichiers bougies-*.json font jusqu'à 1,3 Mo (trop lent sur téléphone). Ici : un fichier par actif, avec J, H4, H1, M15 déjà prêts (≈ 100 Ko).
   Or : la série de référence est Kraken PF_XAUUSD (le même instrument que le terminal, le plus proche du XAU/USD au comptant de XTB). Kraken n'a que ~100 jours d'historique :
   avant sa première bougie on complète avec les futures COMEX (GC=F) RECALÉS du décalage médian mesuré sur la période commune ; le recalage est écrit dans le fichier (champ « recalage »).
   Rien n'est inventé : si Kraken est injoignable, l'or reste sur GC=F, clairement étiqueté « futures ».
   Données de marché publiques seulement. Aucun secret. */
import fs from 'node:fs'; import path from 'node:path';
import { regrouper, enH4, ANCRE_H4, H, J } from '../trader-pro/commun/analyse.js';

export const ACTIFS_PRO = Object.freeze([
  { id: 'or', nom: 'Or (XAU/USD)', sym: 'GC=F', kraken: 'PF_XAUUSD' },
  { id: 'us100', nom: 'Nasdaq 100', sym: '^NDX' },
  { id: 'us500', nom: 'S&P 500', sym: '^GSPC' },
  { id: 'btc', nom: 'Bitcoin', sym: 'BTC-USD' },
  { id: 'sol', nom: 'Solana', sym: 'SOL-USD' },
  { id: 'dxy', nom: 'Indice dollar', sym: 'DX-Y.NYB' },
  { id: 'eurusd', nom: 'EUR/USD', sym: 'EURUSD=X' }
]);
const nomBougies = (sym, iv) => `bougies-${String(sym).replace(/[^A-Za-z0-9]/g, '_')}-${iv}.json`;
const lire = (dossier, nom) => { try { const d = JSON.parse(fs.readFileSync(path.join(dossier, nom), 'utf8')); return d && Array.isArray(d.b) ? { ...d, bougies: d.b.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v: v || 0 })) } : null; } catch (e) { return null; } };
const compact = B => B.map(b => [b.t, +b.o.toFixed(6), +b.h.toFixed(6), +b.l.toFixed(6), +b.c.toFixed(6), Math.round(b.v || 0)]);
export const mediane = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

/* bougies Kraken Futures (API publique des graphiques) ; res = 15m | 1h | 1d ; pagination par 2000 */
export async function bougiesKrakenFutures(symbole, res, depuis, { fetchFn = fetch, max = 8 } = {}) {
  let from = Math.floor(depuis / 1000), tout = [];
  for (let k = 0; k < max; k++) {
    const r = await fetchFn(`https://futures.kraken.com/api/charts/v1/trade/${symbole}/${res}?from=${from}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('futures.kraken.com a répondu ' + r.status); const j = await r.json(); const L = (j.candles || []).map(c => ({ t: c.time, o: +c.open, h: +c.high, l: +c.low, c: +c.close, v: +c.volume || 0 })).filter(b => b.c > 0);
    tout = tout.concat(L); if (!j.more_candles || !L.length) break; from = Math.floor(L[L.length - 1].t / 1000) + 1;
  }
  const m = new Map(tout.map(b => [b.t, b])); return [...m.values()].sort((a, b) => a.t - b.t);
}
/* Recale les bougies `ancien` (futures) sur le niveau de `ref` (Kraken) : décalage = médiane de (ref − ancien) aux instants communs ; ne garde que ce qui précède la première bougie de ref. */
export function completerAvant(ref, ancien) {
  if (!ref.length || !ancien.length) return { bougies: ref, decalage: null, ajoutees: 0 };
  const m = new Map(ancien.map(b => [b.t, b.c])), d = []; for (const b of ref) { const g = m.get(b.t); if (g != null) d.push(b.c - g); }
  if (d.length < 20) return { bougies: ref, decalage: null, ajoutees: 0 };
  const dec = mediane(d), t0 = ref[0].t, avant = ancien.filter(b => b.t < t0).map(b => ({ ...b, o: b.o + dec, h: b.h + dec, l: b.l + dec, c: b.c + dec }));
  return { bougies: avant.concat(ref), decalage: dec, ajoutees: avant.length, communes: d.length };
}
/* même recalage avec un décalage déjà connu (séries dont les horodatages ne coïncident pas) */
export const prolongerAvant = (ref, ancien, dec) => (ref.length ? ancien.filter(b => b.t < ref[0].t).map(b => ({ ...b, o: b.o + dec, h: b.h + dec, l: b.l + dec, c: b.c + dec })).concat(ref) : ancien);
/* un fichier pro pour un actif à partir des bougies déjà publiées (et de Kraken pour l'or) */
export async function construireActif(a, dossier, { fetchFn = fetch, maintenant = Date.now() } = {}) {
  const h1 = lire(dossier, nomBougies(a.sym, '1h')), m15 = lire(dossier, nomBougies(a.sym, '15m')), j = lire(dossier, nomBougies(a.sym, '1d'));
  if (!h1 || !j) throw new Error('bougies source absentes pour ' + a.sym);
  let B1 = h1.bougies, B15 = m15 ? m15.bougies : [], BJ = j.bougies, source = h1.source || 'Yahoo Finance', recalage = null, prix = h1.prix, tPrix = h1.tPrix;
  if (a.kraken) {
    try {
      const k1 = await bougiesKrakenFutures(a.kraken, '1h', 1700000000e3, { fetchFn }), k15 = await bougiesKrakenFutures(a.kraken, '15m', maintenant - 55 * J, { fetchFn }), kj = await bougiesKrakenFutures(a.kraken, '1d', 1700000000e3, { fetchFn });
      if (k1.length > 200) {
        const c1 = completerAvant(k1, B1); B1 = c1.bougies; recalage = { decalage: c1.decalage, communes: c1.communes || 0, ajoutees: c1.ajoutees, sur: 'GC=F (futures COMEX) avant le ' + new Date(k1[0].t).toISOString().slice(0, 10) };
        if (k15.length > 100) B15 = completerAvant(k15, B15).bougies;
        if (kj.length > 20 && c1.decalage != null) BJ = prolongerAvant(kj, BJ, c1.decalage);   // les bougies journalières n'ont pas les mêmes heures : on réutilise le décalage mesuré sur les H1
        prix = k1[k1.length - 1].c; tPrix = k1[k1.length - 1].t + H; source = 'Kraken PF_XAUUSD (perpétuel suivant le XAU/USD) ; historique avant août 2026 : futures COMEX recalés';
      }
    } catch (e) { source = 'Yahoo Finance GC=F (futures COMEX) : Kraken injoignable (' + String(e.message || e).slice(0, 60) + ')'; }
  }
  const h4 = enH4(B1, maintenant).map(({ enCours, ...b }) => b);
  /* or : volume Daily des futures COMEX (GC=F), seul vrai volume de l'or (le perpétuel Kraken n'a qu'un volume en contrats, sans rapport) : sert au filtre volume des Retournements Daily */
  const vj = a.kraken ? j.bougies.slice(-1300).map(b => [b.t, b.v || 0]) : null;
  return { id: a.id, nom: a.nom, sym: a.sym, source, recalage, t: maintenant, prix, tPrix, j: compact(BJ.slice(-1300)), h4: compact(h4.slice(-900)), h1: compact(B1.slice(-700)), m15: compact(B15.slice(-500)), ...(vj ? { vj } : {}) };
}
export async function construirePro(dossier, opts = {}) {
  const ecrits = [], echecs = [];
  for (const a of ACTIFS_PRO) {
    try { const d = await construireActif(a, dossier, opts); const txt = JSON.stringify(d); fs.writeFileSync(path.join(dossier, `pro-${a.id}.json`), txt); ecrits.push({ nom: `pro-${a.id}.json`, octets: txt.length }); }
    catch (e) { echecs.push({ nom: `pro-${a.id}.json`, erreur: String(e && e.message || e) }); }
  }
  return { ecrits, echecs };
}
