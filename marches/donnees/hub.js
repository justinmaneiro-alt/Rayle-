/* ═════════════ HUB DE DONNÉES (RAYLE MARCHÉS) : UNE interface derrière tous les connecteurs ═════════════
   Cache par lot (durée de la source), limitation d'appels par source (écart minimal, une file par source), nouvelles tentatives avec temporisation, liste blanche de domaines,
   santé par source (OK / lent / en panne, dernier succès), dernière bonne copie servie ÉTIQUETÉE périmée quand la source tombe, jamais de valeur inventée.
   Même code en local (Node), dans un Worker Cloudflare et dans les tests (fetch injectable). */
import { SOURCES, parId, FLUX } from './registre.js';
import { LOTS, gdelt } from './connecteurs.js';
import { texteDuree, presentable } from './normaliser.js';

const LENT_MS = 4000, TENTATIVES = 3, OCTETS_MAX = 6_000_000;
const attendre = ms => new Promise(r => setTimeout(r, ms));
export const DOMAINES = (() => { const s = new Set(['data-api.binance.vision', 'stablecoins.llama.fi', 'futures.kraken.com', 'api.frankfurter.app']); for (const x of SOURCES) if (x.url) { try { s.add(new URL(x.url).hostname); } catch (e) { /* ignorée */ } } for (const f of FLUX) s.add(new URL(f[2]).hostname); return s; })();

export class ErreurSource extends Error { constructor(source, message, code = 502) { super(message); this.source = source; this.code = code; } }

export function creerHub({ fetch: fetchImpl = globalThis.fetch, maintenant = () => Date.now(), env = {}, stockage = null, attente = attendre, tentatives = TENTATIVES } = {}) {
  const lots = new Map(LOTS.map(l => [l.id, l]));
  const cache = new Map();            // id de lot → { t, sortie, enCours }
  const sante = new Map();            // id de source → état
  const files = new Map();            // id de source → promesse de la file
  const dernierAppel = new Map();
  const gdeltCache = new Map();
  const actif = s => s.defaut || (s.cle ? !!env[s.cle] : false) || (s.id === 'yahoo' && env.MARCHES_YAHOO === '1');
  const ua = env.SEC_UA || 'RayleMarches usage-personnel (lecture seule, contact : voir le depot du projet)';

  const etat = id => { let e = sante.get(id); if (!e) { const s = parId.get(id); e = { id, nom: s ? s.nom : id, essais: 0, echecs: 0, dernierSucces: null, derniereErreur: null, erreur: null, ms: null, ok: null, lent: false }; sante.set(id, e); } return e; };
  function noter(id, ok, ms, erreur) { const e = etat(id); e.essais++; e.dernierEssai = new Date(maintenant()).toISOString(); e.ms = ms; if (ok) { e.ok = true; e.dernierSucces = e.dernierEssai; e.erreur = null; e.lent = ms > LENT_MS; } else { e.ok = false; e.echecs++; e.derniereErreur = e.dernierEssai; e.erreur = erreur; } }

  /* lecture HTTP d'une source : file par source (écart minimal), liste blanche, délai, tentatives avec temporisation */
  async function get(sourceId, url, { type = 'json', entetes = {} } = {}) {
    const src = parId.get(sourceId); if (!src) throw new ErreurSource(sourceId, 'source inconnue', 404);
    const u = new URL(url); if (u.protocol !== 'https:' || !DOMAINES.has(u.hostname)) throw new ErreurSource(sourceId, 'domaine non autorisé : ' + u.hostname, 403);
    const tour = async () => {
      const ecart = src.ecartMin || 0; const d = dernierAppel.get(sourceId) || 0, patiente = ecart - (maintenant() - d); if (patiente > 0) await attente(patiente); dernierAppel.set(sourceId, maintenant());
      let derniere = null;
      for (let n = 0; n < tentatives; n++) {
        const t0 = maintenant(), c = new AbortController(), tm = setTimeout(() => c.abort(), src.delai || 15000);
        try {
          const h = { 'User-Agent': sourceId === 'edgar' ? ua : 'Mozilla/5.0 (compatible; RayleMarches/1.0; usage personnel)', Accept: type === 'json' ? 'application/json' : '*/*', ...entetes };
          const r = await fetchImpl(url, { headers: h, redirect: 'follow', signal: c.signal });
          if (r.status === 429 || r.status >= 500) throw Object.assign(new Error('HTTP ' + r.status + ' (' + u.hostname + ')'), { reessayer: true });
          if (!r.ok) throw new ErreurSource(sourceId, 'HTTP ' + r.status + ' (' + u.hostname + ')' + (r.status === 451 ? ' : accès refusé depuis cette région' : ''), r.status);
          const texte = await r.text(); if (texte.length > OCTETS_MAX) throw new ErreurSource(sourceId, 'réponse trop volumineuse', 502);
          let v = texte; if (type === 'json') { try { v = JSON.parse(texte); } catch (e) { throw new ErreurSource(sourceId, 'réponse non JSON', 502); } }
          noter(sourceId, true, maintenant() - t0); return v;
        } catch (e) {
          derniere = e instanceof ErreurSource ? e : new ErreurSource(sourceId, e && e.name === 'AbortError' ? 'délai dépassé' : String(e && e.message || e).slice(0, 160), e && e.name === 'AbortError' ? 504 : 502);
          if (e instanceof ErreurSource || !(e && (e.reessayer || e.name === 'AbortError' || e instanceof TypeError))) break;   // 4xx : inutile de réessayer
          if (n < tentatives - 1) await attente(400 * Math.pow(3, n));
        } finally { clearTimeout(tm); }
      }
      noter(sourceId, false, null, derniere.message); throw derniere;
    };
    const suite = (files.get(sourceId) || Promise.resolve()).then(tour, tour);
    files.set(sourceId, suite.catch(() => {})); return suite;
  }
  const ctx = { get, maintenant, env };

  const lire = async (l, force) => {
    const c = cache.get(l.id), now = maintenant(), ttl = (l.ttl || parId.get(l.source).ttl) * 1000;
    if (!force && c && c.sortie && now - c.t < ttl) return { ...c.sortie, cache: 'frais' };
    if (c && c.enCours) return c.enCours;
    const p = (async () => {
      try {
        const brut = await l.lire(ctx), sortie = { lot: l.id, mesures: brut.mesures || [], items: brut.items || [], points: brut.points || {}, partiel: brut.partiel || [], copie: false, erreur: null, lu: new Date(maintenant()).toISOString() };
        for (const m of sortie.mesures) if (!presentable(m)) throw new Error('mesure sans source ou horodatage : ' + m.id);
        cache.set(l.id, { t: maintenant(), sortie }); if (stockage) try { stockage.ecrire(l.id, sortie); } catch (e) { /* disque indisponible */ }
        return { ...sortie, cache: 'direct' };
      } catch (e) {
        const msg = String(e && e.message || e).slice(0, 200); noter(l.source, false, null, msg);
        const ancien = (c && c.sortie) || (stockage ? (() => { try { return stockage.lire(l.id); } catch (x) { return null; } })() : null);
        const retourner = (sortie, etiquette) => { cache.set(l.id, { t: maintenant() - ttl + Math.min(ttl, 60000), sortie }); return { ...sortie, cache: etiquette }; };   // échec mémorisé 60 s : on ne martèle pas une source en panne
        if (ancien) { const marque = m => ({ ...m, etat: m.etat === 'ok' ? 'perime' : m.etat, copie: true, note: ((m.note ? m.note + ' · ' : '') + 'source injoignable (' + msg + ') : dernière valeur connue').slice(0, 400) }); return retourner({ ...ancien, mesures: ancien.mesures.map(marque), copie: true, erreur: msg }, 'perime'); }
        return retourner({ lot: l.id, mesures: [], items: [], points: {}, partiel: [], copie: false, erreur: msg }, 'aucun');
      } finally { const x = cache.get(l.id); if (x) delete x.enCours; }
    })();
    cache.set(l.id, { ...(c || { t: 0, sortie: null }), enCours: p }); return p;
  };

  async function lot(id, { force = false } = {}) {
    const l = lots.get(id); if (!l) throw new ErreurSource(id, 'lot inconnu', 404);
    const s = parId.get(l.source); if (!actif(s)) return { lot: id, mesures: [], items: [], points: {}, partiel: [], erreur: 'source désactivée par défaut (' + s.nom + ')', desactive: true, cache: 'aucun' };
    return lire(l, force);
  }
  const lotsActifs = () => LOTS.filter(l => actif(parId.get(l.source))).map(l => l.id);

  async function mesures(idsLots) { const r = await Promise.all(idsLots.map(id => lot(id))); const out = {}; for (const s of r) for (const m of s.mesures) out[m.id] = m; return out; }
  async function mesure(idMesure) {
    for (const l of LOTS) { const c = cache.get(l.id); if (c && c.sortie && c.sortie.mesures.some(m => m.id === idMesure)) return (await lot(l.id)).mesures.find(m => m.id === idMesure) || null; }
    return null;
  }
  async function items(idsLots) { const r = await Promise.all(idsLots.map(id => lot(id))); return r.flatMap(s => s.items.map(i => (s.copie ? { ...i, copie: true } : i))); }
  const points = id => { for (const c of cache.values()) if (c.sortie && c.sortie.points[id]) return c.sortie.points[id]; return null; };

  async function actualitesGdelt(q) {
    const k = String(q || '').trim().slice(0, 80); if (!k) throw new ErreurSource('gdelt', 'requête vide', 400);
    const c = gdeltCache.get(k), now = maintenant(); if (c && now - c.t < parId.get('gdelt').ttl * 1000) return c.v;
    try { const v = await gdelt(ctx, k); gdeltCache.set(k, { t: now, v }); return v; } catch (e) { noter('gdelt', false, null, e.message); if (c) return { ...c.v, copie: true, erreur: e.message }; throw e; }
  }

  function etatSources() {
    return SOURCES.map(s => {
      const e = sante.get(s.id), a = actif(s), now = maintenant();
      let statut = !a ? 'desactivee' : !e || e.ok == null ? 'non_testee' : !e.ok ? 'en_panne' : e.lent ? 'lent' : 'ok';
      const retard = e && e.dernierSucces ? (now - Date.parse(e.dernierSucces)) / 1000 : null;
      return { id: s.id, nom: s.nom, groupe: s.groupe, url: s.docs || s.url, frequence: s.frequence, cle: s.cle || false, defaut: s.defaut, active: a, limite: s.limite, conditions: s.conditions, ttlSecondes: s.ttl, statut, dernierSucces: e ? e.dernierSucces : null, retardTexte: retard == null ? 'jamais' : texteDuree(retard), derniereErreur: e ? e.erreur : null, tempsMs: e ? e.ms : null, essais: e ? e.essais : 0, echecs: e ? e.echecs : 0 };
    });
  }
  return { lot, lotsActifs, mesures, mesure, items, points, actualitesGdelt, etatSources, get, _cache: cache, actif, idsLots: () => LOTS.map(l => l.id) };
}
