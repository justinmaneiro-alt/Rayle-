/* ═════════════ COUCHE DE DONNÉES UNIQUE (navigateur ; testable sous Node : stockage et fetch injectables) ═════════════
   But : l'application marche SANS le PC. Trois niveaux, utilisés par toutes les fenêtres :
     (a) lecture DIRECTE depuis l'appareil des sources gratuites qui autorisent les appels navigateur (CORS) ;
     (b) SNAPSHOTS JSON publiés par un robot GitHub Actions (branche « donnees ») pour les sources qui bloquent le navigateur ;
     (c) CACHE LOCAL (IndexedDB) : dernière donnée connue de chaque source, avec son horodatage.
   Un serveur du PC (127.0.0.1) reste un BONUS facultatif, essayé en premier seulement quand la page est servie par le PC.
   Jamais de valeur inventée : sans réseau, snapshot ni cache, on lève une erreur lisible (aucun « HTTP 404 » brut). */

export const BASE_SNAPSHOTS = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/';
const DB = 'rayle-donnees', STORE = 'cache';

/* ───── stockage : IndexedDB, sinon mémoire (navigation privée, tests) ───── */
export function creerStockage(idb = globalThis.indexedDB) {
  const memoire = new Map(); let db = null, essai = null;
  const ouvrir = () => essai || (essai = new Promise(res => {
    if (!idb) return res(null);
    try { const r = idb.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => { db = r.result; res(db); }; r.onerror = () => res(null); r.onblocked = () => res(null); } catch (e) { res(null); }
  }));
  const tx = async (mode, f) => { const d = await ouvrir(); if (!d) return undefined; return new Promise(res => { try { const t = d.transaction(STORE, mode), r = f(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch (e) { res(undefined); } }); };
  return {
    async lire(cle) { const v = await tx('readonly', s => s.get(cle)); return v !== undefined ? v : (memoire.get(cle) || null); },
    async ecrire(cle, valeur) { memoire.set(cle, valeur); await tx('readwrite', s => s.put(valeur, cle)); },
    async cles() { const k = await tx('readonly', s => s.getAllKeys()); return k || [...memoire.keys()]; },
    async effacer() { memoire.clear(); await tx('readwrite', s => s.clear()); }
  };
}

/* ───── état des sources (page « État des sources ») ───── */
const ETATS = new Map();
export const etatSources = () => [...ETATS.values()].sort((a, b) => a.cle.localeCompare(b.cle));
export function noterEtat(cle, e) { ETATS.set(cle, { cle, ...(ETATS.get(cle) || {}), ...e }); try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rayle:donnees-etat', { detail: ETATS.get(cle) })); } catch (x) { /* */ } }
export const oublierEtats = () => ETATS.clear();

export const baseSnapshots = () => { try { return (globalThis.localStorage && localStorage.getItem('rayle_donnees_base')) || BASE_SNAPSHOTS; } catch (e) { return BASE_SNAPSHOTS; } };
export const urlSnapshot = (nom, base = baseSnapshots()) => base.replace(/\/*$/, '/') + nom;
/* la page est-elle servie par le PC (serveur local) ? */
export function originePc(loc = globalThis.location) { try { return loc && /^(127\.0\.0\.1|localhost)$/.test(loc.hostname) && /^https?:$/.test(loc.protocol) ? loc.origin : null; } catch (e) { return null; } }

async function lireJson(url, { fetchFn, ms = 12000, exigerJson = true }) {
  const r = await fetchFn(url, { cache: 'no-cache', signal: globalThis.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
  if (!r.ok) throw new Error(new URL(url, 'http://x').host + ' a répondu ' + r.status);
  const type = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
  if (exigerJson && type && !/json|text\/plain|octet/.test(type)) throw new Error('réponse inattendue (' + type.split(';')[0] + ')');
  const d = await r.json(); if (d && d.erreur && !d.t) throw new Error(String(d.erreur)); return d;
}

/* Lecture d'une donnée.
   cle      : identifiant stable (cache et état)
   sources  : [{ niveau: 'pc'|'direct'|'snapshot', nom, url? | lire?: async () => donnees, ms? }] essayées dans l'ordre
   ttl      : ms pendant lesquelles le cache est servi sans réseau (0 = toujours revalider)
   valider  : (donnees) => true | message d'erreur
   Retour   : { donnees, origine: 'pc'|'direct'|'snapshot'|'cache', t (ms, quand la donnée a été obtenue), horsLigne: null | { depuis, raison } } */
export async function lireDonnee(cle, { sources = [], ttl = 0, valider = () => true, stockage = null, fetchFn = (...a) => fetch(...a), maintenant = () => Date.now(), tolererCacheVieux = true } = {}) {
  const st = stockage || (stockage = creerStockageParDefaut());
  const c = await st.lire(cle).catch(() => null);
  if (c && ttl > 0 && maintenant() - c.t < ttl) { noterEtat(cle, { origine: 'cache', t: c.t, source: c.nom || null, erreur: null, horsLigne: false, ttl }); return { donnees: c.donnees, origine: 'cache', t: c.t, horsLigne: null, source: c.nom || null }; }
  const erreurs = [];
  for (const s of sources) {
    try {
      const d = s.lire ? await s.lire() : await lireJson(s.url, { fetchFn, ms: s.ms || 12000 });
      const v = valider(d); if (v !== true) throw new Error(typeof v === 'string' ? v : 'données invalides');
      const t = maintenant(); await st.ecrire(cle, { t, nom: s.nom, niveau: s.niveau, donnees: d }).catch(() => {});
      const tSnap = d && Number.isFinite(d.t) ? d.t : t;
      noterEtat(cle, { origine: s.niveau, t: s.niveau === 'snapshot' ? tSnap : t, source: s.nom, erreur: null, horsLigne: false, erreurs });
      return { donnees: d, origine: s.niveau, t: s.niveau === 'snapshot' ? tSnap : t, horsLigne: null, source: s.nom };
    } catch (e) { erreurs.push((s.nom || s.niveau) + ' : ' + String(e && e.message || e).slice(0, 120)); }
  }
  if (c && tolererCacheVieux) { noterEtat(cle, { origine: 'cache', t: c.t, source: c.nom || null, erreur: erreurs.join(' · ') || null, horsLigne: true }); return { donnees: c.donnees, origine: 'cache', t: c.t, horsLigne: { depuis: c.t, raison: erreurs.join(' · ') || 'aucune source' }, source: c.nom || null }; }
  noterEtat(cle, { origine: null, t: null, erreur: erreurs.join(' · ') || 'aucune source', horsLigne: true });
  const e = new Error('Aucune donnée pour le moment : le réseau et les snapshots ne répondent pas, et rien n’est encore gardé sur cet appareil. ' + (erreurs[0] ? '(' + erreurs[0] + ')' : '')); e.sansDonnee = true; e.detail = erreurs; throw e;
}
let stockageDefaut = null; export const creerStockageParDefaut = () => stockageDefaut || (stockageDefaut = creerStockage());

/* texte du badge : « hors ligne : dernière donnée du 14/11 à 12:03 » */
export function badge(res, { langue = 'fr-FR' } = {}) {
  if (!res) return '';
  const f = t => { try { const d = new Date(t); return d.toLocaleDateString(langue, { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' }) + ' à ' + d.toLocaleTimeString(langue, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); } catch (e) { return ''; } };
  if (res.horsLigne) return 'hors ligne : dernière donnée du ' + f(res.horsLigne.depuis);
  if (res.origine === 'snapshot' && res.t) return 'snapshot du ' + f(res.t);
  if (res.origine === 'cache' && res.t) return 'copie locale du ' + f(res.t);
  return '';
}
export const age = (t, maintenant = Date.now()) => (Number.isFinite(t) ? Math.max(0, maintenant - t) : null);
export const phraseAge = ms => { if (ms == null) return 'jamais'; const m = Math.round(ms / 60000); if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + ' min'; const h = Math.round(m / 60); if (h < 48) return 'il y a ' + h + ' h'; return 'il y a ' + Math.round(h / 24) + ' j'; };
