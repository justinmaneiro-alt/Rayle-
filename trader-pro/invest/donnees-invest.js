/* ═════════════ COUCHE DE DONNÉES DE L'INVESTISSEMENT V2 (navigateur ; fetch et base injectables pour les tests) ═════════════
   L'application ne fait que LIRE les JSON calculés chaque nuit par GitHub Actions (outils-donnees/invest/calcul-v2.mjs) et publiés sur la branche « donnees » :
   manifest.json · index/<classe>.json · saison/<classe>.json · fiches/<symbole>.json · backtest.json. Les fichiers sont chargés à la demande et gardés en mémoire. */
import { urlSnapshot } from '../../agent-trading/front/donnees/couche.js';
import { fichierDe } from './pays.js';
import { appliquerFondsCotes } from './fonds-cotes.js';

export const CLASSES = Object.freeze([['action', 'Actions'], ['fonds coté', 'Fonds cotés'], ['ETF', 'ETF'], ['devise', 'Devises'], ['indice', 'Indices'], ['matière première', 'Matières premières'], ['crypto', 'Cryptos'], ['obligataire', 'Obligataire']]);
const sans = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 .&-]/g, ' ').replace(/\s+/g, ' ').trim();
/* production : branche orpheline « donnees-invest » ; essais locaux : le réglage rayle_donnees_base (dossier de snapshots contenant invest/) prime */
export const BASE_INVEST = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees-invest/';
const baseParDefaut = () => { try { if (typeof localStorage !== 'undefined' && localStorage.getItem('rayle_donnees_base')) return urlSnapshot('invest/'); } catch (e) { /* stockage indisponible */ } return BASE_INVEST; };
export function creerDonnees({ base = baseParDefaut, fetchFn = (u, o) => fetch(u, o), ms = 25000 } = {}) {
  const caches = { shards: new Map(), saison: new Map(), fiches: new Map() }; let manifeste = null, ref = null, bt = null;
  const json = async chemin => { const r = await fetchFn(base().replace(/\/*$/, '/') + chemin, { signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }); if (!r.ok) throw new Error(chemin + ' : ' + r.status); return r.json(); };
  const D = {
    async manifeste() { return manifeste || (manifeste = await json('manifest.json')); },
    /* v7 : indicateurs quotidiens de « Mes actifs » (mes-actifs.json, publié par la tâche mes-actifs / invest) */
    async mesActifs() { return caches.mesActifs || (caches.mesActifs = json('mes-actifs.json').catch(e => { caches.mesActifs = null; throw e; })); },
    async backtest() { return bt || (bt = await json('backtest.json').catch(() => null)); },
    /* charge les fichiers d'index des classes demandées (ou de tous) ; renvoie toutes les lignes chargées */
    async lignes(classes = null) {
      const m = await D.manifeste(), shardsClasses = classes && classes.map(c => (c === 'fonds coté' ? 'action' : c)), voulus = m.shards.filter(s => !shardsClasses || shardsClasses.includes(s.classe));
      await Promise.all(voulus.map(async s => { if (!caches.shards.has(s.id)) caches.shards.set(s.id, json('index/' + s.id + '.json').then(j => j.lignes).catch(e => { caches.shards.delete(s.id); throw e; })); }));
      const out = []; for (const s of voulus) out.push(...appliquerFondsCotes(await caches.shards.get(s.id))); return out;   // fonds fermés, trusts, holdings, SPAC, trackers : classe « fonds coté »
    },
    /* encodages saisonniers de {id → { y0, r }} des shards déjà chargés + indices de référence */
    async saison(classes = null) {
      const m = await D.manifeste(), voulus = m.shards.filter(s => !classes || classes.includes(s.classe)), S = {};
      await Promise.all(voulus.map(async s => { if (!caches.saison.has(s.id)) caches.saison.set(s.id, json('saison/' + s.id + '.json').catch(() => ({}))); Object.assign(S, await caches.saison.get(s.id)); }));
      if (!ref) ref = await json('saison/indices-reference.json').catch(() => ({})); return { encodes: S, ref };
    },
    async fiche(id) { if (!caches.fiches.has(id)) caches.fiches.set(id, json('fiches/' + encodeURIComponent(fichierDe(id)) + '.json').catch(e => { caches.fiches.delete(id); throw e; })); return caches.fiches.get(id); }
  };
  return D;
}
/* retrouve un instrument par symbole XTB, symbole Yahoo ou nom (voix : « Airbus », « LVMH », « AAPL ») ; le plus gros et le mieux coté en cas d'ex æquo */
export function trouverInstrument(lignes, texte) {
  const t = sans(texte); if (!t) return null; const mots = t.split(' ').filter(w => w.length > 1);
  const note = l => {
    const id = sans(l.id), y = sans(l.y), n = sans(l.n); let s = 0;
    if (id === t || y === t || id.replace(/\.[a-z]+$/, '') === t) s = 100; else if (n === t) s = 95; else if (n.startsWith(t + ' ') || n.startsWith(t)) s = 85; else if (` ${n} `.includes(` ${t} `)) s = 70; else if (mots.length && mots.every(w => n.includes(w))) s = 55; else return 0;
    return s + (l.c === 'action' ? 5 : 0) + (l.pal === 'A' ? 3 : 0) + (l.vx ? 2 : 0) + Math.min(5, Math.log10(1 + (l.cap || 0)));
  };
  let best = null, bn = 0; for (const l of lignes) { const s = note(l); if (s > bn) { bn = s; best = l; } } return best;
}
