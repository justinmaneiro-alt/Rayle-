import { depuisBougies } from '../agent-btc/colonnes.js';
import { analyserAssistant } from '../agent-m6c/assistant-regime.js';
import { STATUTS_M6C } from '../agent-m6c/resultats-m6c.js';
import { PAIRES } from '../agent-m6/paires.js';

/* ═════════════ RÉGIME ACTUEL DE CHAQUE ACTIF, SANS DÉPENDRE DE L'ANCIEN AGENT (V3b) ═════════════
   Les fenêtres « Régime de marché » et « Propositions » doivent être utiles même sans position et même si l'ancien pilote par paire n'est pas activé : on lit les vraies bougies M15 de Binance
   (gratuit, sans clé, CORS ouvert : 4 requêtes de 1 000 bougies par actif, une fois toutes les 15 minutes), on les regroupe en H1 et on applique le détecteur de régime (agent-m6c/detecteur-regime.js,
   le même que l'assistant de régime). Aucune IA, aucun ordre. Une panne dit « indisponible » avec sa raison, jamais un régime inventé. */
const TTL = 15 * 60e3, memo = {}, enCours = {};
const test = () => window.__RAYLE_POSTE_TEST__ || {};
const lireReseau = url => (test().lireReseau ? test().lireReseau(url) : fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('Binance HTTP ' + r.status); return r.json(); }));

export async function bougiesM15(symbole, n = 3600) {
  const PAS = 900e3; let fin = Date.now(), tout = [];
  for (let k = 0; k < Math.ceil(n / 1000) + 1 && tout.length < n; k++) {
    const j = await lireReseau('https://data-api.binance.vision/api/v3/klines?symbol=' + symbole + '&interval=15m&limit=1000&endTime=' + fin);
    if (!Array.isArray(j) || !j.length) break;
    tout = j.map(x => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], vb: x[9] == null ? NaN : +x[9] })).concat(tout);
    fin = +j[0][0] - 1;
  }
  const limite = Math.floor(Date.now() / PAS) * PAS;   // la bougie en cours n'est pas fermée : jamais utilisée
  return tout.filter(b => b.t + PAS <= limite && [b.o, b.h, b.l, b.c].every(Number.isFinite)).slice(-n);
}

export async function regimePourActif(paire, { force = false } = {}) {
  const m = memo[paire]; if (!force && m && Date.now() - m.t < TTL) return m.valeur;
  if (enCours[paire]) return enCours[paire];
  enCours[paire] = (async () => {
    let valeur;
    try {
      const sym = PAIRES[paire].binance, b = await bougiesM15(sym), serie = depuisBougies(b), a = analyserAssistant({ serie, paire, statuts: STATUTS_M6C[paire] || {}, maintenant: Date.now() });
      valeur = a && a.ok ? { ok: true, regime: a.regime, t: Date.now(), bougies: b.length, derniere: b.length ? b[b.length - 1].t : null } : { ok: false, erreur: (a && a.erreur) || 'analyse impossible', t: Date.now() };
    } catch (e) { valeur = { ok: false, erreur: String((e && e.message) || e), t: Date.now() }; }
    memo[paire] = { t: Date.now(), valeur }; return valeur;
  })().finally(() => { delete enCours[paire]; });
  return enCours[paire];
}
export async function regimesActifs(paires = ['BTC', 'SOL', 'DOGE'], opts = {}) {
  const out = {}; await Promise.all(paires.map(async p => { out[p] = await regimePourActif(p, opts); })); return out;
}
export const regimesActifsMemo = () => Object.fromEntries(Object.entries(memo).map(([p, x]) => [p, x.valeur]));
