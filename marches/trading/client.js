import { INSTRUMENTS, UNITES } from './instruments.js';
import { aDuVolume } from './indicateurs.js';
import { appliquerVolumeProxy, doitRafraichir, fusionner, limiter, marcheProbablementFerme, nettoyer } from './serie.js';

/* ═════════════ CLIENT DES DONNÉES DE MARCHÉ (navigateur ; testable : tout ce qui touche au réseau et au disque est injecté) ═════════════
   Une seule route du Worker sert à tout : GET /marche?actif=…&intervalle=…&n=500 (Yahoo Finance, Twelve Data, secours automatiques, cache dans le Worker).
   Ici : historique gardé dans le navigateur (IndexedDB) et fusionné à chaque réponse, une seule requête en vol par série, rafraîchissement raisonnable
   (jamais si l'onglet est caché, très rare quand le marché est fermé), source / heure / secours toujours conservés avec les bougies, aucune donnée inventée :
   en cas d'échec on garde les dernières bougies connues, marquées « périmées », ou rien. Aucun appel à l'IA. */
const N_DEMANDE = 500;

export function creerClient({ appeler, stockage, maintenant = () => Date.now(), visible = () => (typeof document === 'undefined' ? true : !document.hidden), ferme = marcheProbablementFerme }) {
  const memoire = new Map(), enVol = new Map(), abonnements = new Map(), stats = { requetes: 0, echecs: 0, cache: 0 };
  const cle = (id, u) => id + '|' + u;

  async function lire(id, u) {
    const k = cle(id, u); if (memoire.has(k)) return memoire.get(k);
    let e = null; try { e = stockage ? await stockage.lire(k) : null; } catch (x) { e = null; }
    const v = e || { cle: k, bougies: [], meta: null, volume: null, lecture: null };
    memoire.set(k, v); return v;
  }
  async function ecrire(e) { memoire.set(e.cle, e); try { if (stockage) await stockage.ecrire(e); } catch (x) { /* disque plein ou interdit : on continue en mémoire */ } }

  // au plus 3 requêtes en même temps vers le Worker (le plan gratuit et Yahoo n'aiment pas les rafales)
  let actives = 0; const attente = [];
  const prendre = () => (actives < 3 ? (actives++, Promise.resolve()) : new Promise(ok => attente.push(ok)));
  const rendre_ = () => { const s = attente.shift(); if (s) s(); else actives--; };
  async function brut(actif, uWorker) {
    await prendre();
    try { return await brutLibre(actif, uWorker); } finally { rendre_(); }
  }
  async function brutLibre(actif, uWorker) {
    stats.requetes++;
    const o = await appeler('/marche?actif=' + encodeURIComponent(actif) + '&intervalle=' + uWorker + '&n=' + N_DEMANDE);
    if (!o || !Array.isArray(o.bougies)) throw new Error((o && o.error) || 'réponse du Worker inattendue');
    return o;
  }

  /* Rend l'état d'une série : { bougies, meta:{source, symbole, secours, differe, note, majWorker, recuLe, cache, perime}, volume:{type, note, couverture}, erreur, rafraichie } */
  async function serie(idInstrument, idUnite, { force = false, rafraichirMs = null } = {}) {
    const ins = INSTRUMENTS[idInstrument], un = UNITES[idUnite];
    if (!ins || !un) throw new Error('instrument ou unité inconnu');
    const k = cle(idInstrument, idUnite), e = await lire(idInstrument, idUnite), t = maintenant();
    const due = doitRafraichir({ derniereLecture: e.lecture, rafraichirMs: rafraichirMs || un.rafraichir, maintenant: t, visible: visible(), ferme: ferme(t), force: force || !e.bougies.length });
    if (!due) { stats.cache++; return rendre(e, null, false); }
    if (enVol.has(k)) return enVol.get(k);
    const p = (async () => {
      try {
        const o = await brut(ins.actif, un.worker);
        let nouvelles = nettoyer(o.bougies), volume = null;
        if (ins.volume.type !== 'aucun') {
          const proxyActif = ins.volume.proxy, avecPropre = aDuVolume(nouvelles);
          if (ins.volume.type === 'indice' && avecPropre) volume = { type: 'indice', note: ins.volume.note, couverture: 1 };
          else if (ins.volume.type === 'reel' && avecPropre) volume = { type: 'reel', note: ins.volume.note, couverture: 1 };
          else if (proxyActif) {
            try {
              const p2 = await brut(proxyActif, un.worker), r = appliquerVolumeProxy(nouvelles, nettoyer(p2.bougies), un.ms);
              if (r.couverture > 0.2) { nouvelles = r.bougies; volume = { type: 'proxy', note: ins.volume.proxyNote || ins.volume.note, couverture: r.couverture, source: p2.source, symbole: p2.symbole_source }; }
            } catch (x) { volume = { type: 'aucun', note: 'volume indisponible : ' + String(x.message || x).slice(0, 80) }; }
          }
          if (!volume) volume = { type: 'aucun', note: 'pas de volume gratuit pour cet instrument' };
        } else volume = { type: 'aucun', note: ins.volume.note };
        const fusion = limiter(fusionner(e.bougies, nouvelles), un.historiqueMax);
        const meta = { source: o.source, symbole: o.symbole_source, secours: !!o.secours, differe: !!o.differe, note: o.note || '', majWorker: o.maj || null, recuLe: t, cache: o.cache || null, perime: !!o.perime, essais: o.essais || null };
        const ne = { cle: k, bougies: fusion, meta, volume, lecture: t };
        await ecrire(ne);
        return rendre(ne, null, true);
      } catch (x) {
        stats.echecs++;
        const ne = { ...e, lecture: e.bougies.length ? t - Math.max(0, (rafraichirMs || un.rafraichir) - 30e3) : null };   // on réessaiera dans ~30 s
        memoire.set(k, ne);
        return rendre(ne, String(x && x.message || x), false);
      } finally { enVol.delete(k); }
    })();
    enVol.set(k, p); return p;
  }
  function rendre(e, erreur, rafraichie) {
    const meta = e.meta ? { ...e.meta, perime: e.meta.perime || (erreur != null && e.bougies.length > 0) } : null;
    return { instrument: e.cle.split('|')[0], unite: e.cle.split('|')[1], bougies: e.bougies, meta, volume: e.volume, erreur, rafraichie, vide: !e.bougies.length };
  }

  /* Surveillance : redemande la série quand elle est due (onglet visible seulement) et prévient `cb` à chaque nouveauté. Rend la fonction d'arrêt. */
  function abonner(idInstrument, idUnite, cb, { rafraichirMs = null, tick = 15000, forcer = false } = {}) {
    const k = cle(idInstrument, idUnite) + '#' + Math.random().toString(36).slice(2, 7);
    const passe = async premier => { try { const r = await serie(idInstrument, idUnite, { rafraichirMs, force: premier && forcer }); if (premier || r.rafraichie || r.erreur) cb(r); } catch (x) { cb({ erreur: String(x.message || x), bougies: [], vide: true }); } };
    const timer = setInterval(() => passe(false), tick);
    abonnements.set(k, timer); passe(true);
    return () => { clearInterval(timer); abonnements.delete(k); };
  }
  const arreterTout = () => { for (const t of abonnements.values()) clearInterval(t); abonnements.clear(); };
  return { serie, abonner, arreterTout, appeler, stats: () => ({ ...stats, abonnements: abonnements.size, series: memoire.size }), oublier: () => { memoire.clear(); } };
}
