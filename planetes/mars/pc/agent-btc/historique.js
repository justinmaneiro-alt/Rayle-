import { CHAMPS, concatener, depuisBougies, fusionner, lacunes, serieVide, tranche, versBougies } from './colonnes.js';
import { ORDRE_SOURCES, PAS_M15, SOURCES, alignerM15, telechargerPlage } from './sources.js';

/* ═════════════ HISTORIQUE BITCOIN M15 (M3a ; testé : agent-donnees-test.mjs avec de fausses sources et un faux disque) ═════════════
   Plusieurs années de bougies M15 fermées, gardées dans le navigateur (IndexedDB, un bloc par mois), complétées en continu. H1, H4 et D1 s'en déduisent (colonnes.js : regrouper), donc UN seul
   téléchargement. Source principale Binance (delta réel), secours Bitstamp (delta estimé) : si la principale échoue, on bascule et on le dit. Chaque donnée affiche sa source et son heure.
   Jamais de bougie en cours (on décide sur des bougies fermées) ; jamais de bougie inventée : un trou reste un trou et il est signalé. */
const cleBloc = t => 'M15:' + new Date(t).toISOString().slice(0, 7);
const debutMois = t => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };

export function creerHistorique({ stockage, lire, maintenant = () => Date.now(), annees = 4, ordre = ORDRE_SOURCES, pause, sources = null } = {}) {   // `sources` : table de sources d'une autre paire (M6 : SOL, DOGE) ; par défaut celles de BTC
  let serie = serieVide(0), meta = { source: null, secours: false, majLe: null, lacunes: [], deltaReelPct: 0, erreur: null, sources: {} }, enCours = null;

  async function charger() {
    const cles = (await stockage.liste()).filter(k => k.startsWith('M15:')).sort();
    const blocs = [], sources = {};
    for (const k of cles) {
      const b = await stockage.lire(k); if (!b || !b.t) continue;
      const bloc = { n: b.t.length }; for (const c of CHAMPS) bloc[c] = b[c]; blocs.push(bloc);
      sources[b.source] = (sources[b.source] || 0) + b.t.length;
    }
    const s = concatener(blocs); serie = s; const m = await stockage.lire('meta');
    meta = { ...meta, ...(m && m.valeur ? m.valeur : {}), sources, lacunes: lacunes(s), deltaReelPct: reelPct(s) };
    return etat();
  }
  const reelPct = s => { if (!s.n) return 0; let k = 0; for (let i = 0; i < s.n; i++) if (!Number.isNaN(s.vb[i])) k++; return k / s.n; };
  const etat = () => ({ n: serie.n, debut: serie.n ? serie.t[0] : null, fin: serie.n ? serie.t[serie.n - 1] + PAS_M15 : null, ...meta, annees: serie.n ? (serie.t[serie.n - 1] - serie.t[0]) / (365.25 * 86400e3) : 0 });

  async function ecrireBlocs(bougies, source) {
    const parMois = new Map();
    for (const b of bougies) { const k = cleBloc(b.t); if (!parMois.has(k)) parMois.set(k, []); parMois.get(k).push(b); }
    for (const [k, liste] of parMois) {
      const ancien = await stockage.lire(k); let s = depuisBougies(liste), src = source;
      if (ancien && ancien.t) { const a = { n: ancien.t.length }; for (const c of CHAMPS) a[c] = ancien[c]; s = fusionner(a, s); if (ancien.source !== source) src = ancien.source + '+' + source; }
      const bloc = { source: src, n: s.n, maj: maintenant() }; for (const c of CHAMPS) bloc[c] = s[c];
      await stockage.ecrire(k, bloc);
    }
  }

  /* Télécharge [t0, t1[ avec la source principale, bascule sur le secours en cas d'échec. Rend { bougies, source, secours, erreur }. */
  async function recuperer(t0, t1, surProgres, arret) {
    let derniereErreur = null;
    for (let i = 0; i < ordre.length; i++) {
      const src = (sources || SOURCES)[ordre[i]];
      try {
        const bougies = await telechargerPlage(src, lire, t0, t1, { surPage: p => surProgres && surProgres({ ...p, source: src.nom }), pause, arret });
        if (bougies.length || i === ordre.length - 1) return { bougies, source: src.id, secours: i > 0, erreur: derniereErreur };
      } catch (e) { derniereErreur = src.nom + ' : ' + String(e && e.message || e).slice(0, 100); }
    }
    return { bougies: [], source: null, secours: true, erreur: derniereErreur };
  }

  /* Complète l'historique jusqu'à `annees` années en arrière et jusqu'à maintenant. Idempotent, interruptible (arret), une seule exécution à la fois. */
  function synchroniser({ surProgres = () => {}, arret = () => false } = {}) {
    if (enCours) return enCours;
    enCours = (async () => {
      try {
        await charger();
        const now = maintenant(), fermeJusqua = alignerM15(now);            // bougies dont l'ouverture < fermeJusqua sont fermées
        const cible = alignerM15(now - annees * 365.25 * 86400e3);
        const plages = [];
        if (!serie.n) plages.push([cible, fermeJusqua]);
        else {
          if (serie.t[0] > cible + 2 * 86400e3) plages.push([cible, serie.t[0]]);
          if (serie.t[serie.n - 1] + PAS_M15 < fermeJusqua) plages.push([serie.t[serie.n - 1] + PAS_M15, fermeJusqua]);
        }
        let secours = false, erreur = null, source = meta.source;
        for (const [a, b] of plages) {
          surProgres({ phase: 'telechargement', de: a, a: b, bougies: 0 });
          const r = await recuperer(a, b, p => surProgres({ phase: 'telechargement', ...p }), arret);
          if (r.erreur) erreur = r.erreur; if (r.secours) secours = true; if (r.source) source = r.source;
          if (r.bougies.length) await ecrireBlocs(r.bougies, r.source);
        }
        await charger();
        const info = { source, secours: secours || meta.secours, majLe: maintenant(), erreur };
        await stockage.ecrire('meta', { valeur: info });
        meta = { ...meta, ...info };
        surProgres({ phase: 'termine', ...etat() });
        return etat();
      } finally { enCours = null; }
    })();
    return enCours;
  }

  /* Mise à jour courte (toutes les minutes) : seulement les bougies fermées depuis la dernière. Rend les nouvelles bougies (peut être vide). */
  async function actualiser() {
    if (!serie.n) await charger();
    const now = maintenant(), fermeJusqua = alignerM15(now), depuis = serie.n ? serie.t[serie.n - 1] + PAS_M15 : alignerM15(now - 7 * 86400e3);
    if (depuis >= fermeJusqua) return { nouvelles: [], etat: etat() };
    const r = await recuperer(depuis, fermeJusqua, null, () => false);
    if (r.bougies.length) { await ecrireBlocs(r.bougies, r.source); const avant = serie.n; await charger(); const info = { source: r.source, secours: r.secours, majLe: maintenant(), erreur: r.erreur }; await stockage.ecrire('meta', { valeur: info }); meta = { ...meta, ...info }; return { nouvelles: versBougies(serie, avant), etat: etat() }; }
    meta = { ...meta, erreur: r.erreur, majLe: maintenant() };
    return { nouvelles: [], etat: etat(), erreur: r.erreur };
  }
  return { charger, synchroniser, actualiser, serie: () => serie, etat, vider: async () => { await stockage.vider(); serie = serieVide(0); } };
}
export { tranche };
