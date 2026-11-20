/* ═════════════ HISTORIQUE LONG (client) : lit les années gzip publiées par outils-donnees/historique-long.mjs (branche « historique ») ═════════════
   Chargées À LA DEMANDE (une année à la fois) quand on fait défiler vers la gauche ; mémorisées dans la page. Chaque bougie [t en s, o, h, l, c, v].
   RECALAGE : tout l'historique long est multiplié par l'écart mesuré (rapport médian Terminal en direct / historique sur les bougies communes récentes, écrit dans index.json) :
   aucune bougie récente n'est modifiée, le raccord est donc continu ; sans mesure (ratio 1, « non mesuré ») rien n'est recalé et c'est écrit dans Détails.
   Module pur côté calcul (testé) ; réseau et décompression injectables. */
export const BASE_HISTO = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/historique/';
/* identifiants du Terminal (instruments.js) → identifiants de la branche */
export const ID_HISTO = Object.freeze({ OR: 'or', NASDAQ: 'us100', SP500: 'us500', BTC: 'btc', SOL: 'sol', EURUSD: 'eurusd' });
/* périodes du Terminal → unités de la branche (M5 et M15 n'ont pas d'historique long) */
export const UNITE_HISTO = Object.freeze({ J: 'J', H4: 'H4', H1: 'H1' });

async function gunzipNavigateur(octets) {
  if (typeof DecompressionStream === 'undefined') throw new Error('ce navigateur ne sait pas décompresser le gzip');
  const flux = new Blob([octets]).stream().pipeThrough(new DecompressionStream('gzip')); return await new Response(flux).text();
}
export async function gunzip(octets) {
  if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof window === 'undefined') { const z = await import('node:zlib'); return z.gunzipSync(Buffer.from(octets)).toString('utf8'); }
  return gunzipNavigateur(octets);
}
export const recaler = (B, ratio) => (ratio > 0 && Math.abs(ratio - 1) > 1e-9 ? B.map(b => ({ ...b, o: b.o * ratio, h: b.h * ratio, l: b.l * ratio, c: b.c * ratio })) : B);
export const decompacter = L => L.map(([t, o, h, l, c, v]) => ({ t: t * 1000, o, h, l, c, v: v || 0, long: true }));

export function creerHistoLong({ fetchFn = (...a) => fetch(...a), base = BASE_HISTO, decompresser = gunzip, ms = 20000 } = {}) {
  let indexP = null; const annees = new Map();   // clé actif|unité|année → promesse de bougies recalées
  const index = () => indexP || (indexP = fetchFn(base + 'index.json', { cache: 'no-cache', signal: globalThis.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }).then(r => { if (!r.ok) throw new Error('branche historique : HTTP ' + r.status); return r.json(); }).catch(e => { indexP = null; throw e; }));
  const fiche = async (actif, unite) => { const I = await index(); const a = I.actifs && I.actifs[actif]; return a && a.unites && a.unites[unite] ? a.unites[unite] : null; };
  async function annee(actif, unite, an) {
    const cle = actif + '|' + unite + '|' + an; if (annees.has(cle)) return annees.get(cle);
    const p = (async () => {
      const f = await fiche(actif, unite); if (!f || !f.annees.includes(an)) return [];
      const r = await fetchFn(base + actif + '/' + unite + '/' + an + '.json.gz', { signal: globalThis.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined }); if (!r.ok) throw new Error(actif + ' ' + unite + ' ' + an + ' : HTTP ' + r.status);
      const B = decompacter(JSON.parse(await decompresser(new Uint8Array(await r.arrayBuffer()))));
      return recaler(B, f.ecart && f.ecart.mesure ? f.ecart.ratio : 1);
    })().catch(e => { annees.delete(cle); throw e; });
    annees.set(cle, p); return p;
  }
  return {
    index, fiche, annee,
    /* bougies recalées strictement avant `avantT` (ms) : les `nb` années les plus récentes qui en contiennent. epuise = plus rien d'avant. */
    async avant(actif, unite, avantT, nb = 1) {
      const f = await fiche(actif, unite); if (!f) return { bougies: [], epuise: true, fiche: null };
      const candidates = f.annees.filter(a => Date.UTC(a, 0, 1) < avantT).sort((x, y) => y - x); let tout = [], pris = 0;
      for (const a of candidates) { const B = (await annee(actif, unite, a)).filter(b => b.t < avantT); if (!B.length) continue; tout = B.concat(tout); if (++pris >= nb) break; }
      const premier = tout.length ? tout[0].t : avantT, reste = f.annees.some(a => Date.UTC(a + 1, 0, 1) <= premier);
      return { bougies: tout, epuise: !reste, fiche: f };
    },
    /* texte de l'onglet Détails */
    async description(actif, unite) {
      const f = await fiche(actif, unite).catch(() => null); if (!f) return null; const e = f.ecart || {}, d = t => new Date(t).toISOString().slice(0, 10);
      return { source: f.source, debut: d(f.debut), fin: d(f.fin), n: f.n, ecart: e.mesure ? { ratio: e.ratio, pct: (e.ratio - 1) * 100, absolu: e.ecartMedian, n: e.n, de: d(e.de), a: d(e.a), deH1: !!e.deH1, deJ: !!e.deJ } : null, raisonEcart: e.mesure ? null : (e.raison || 'non mesuré') };
    },
    oublier() { annees.clear(); indexP = null; }
  };
}
export const histoLong = creerHistoLong();
export function phraseEcart(d) {
  if (!d) return 'Historique long : indisponible pour cet actif.';
  const base = `Historique long : ${d.source}, du ${d.debut} au ${d.fin} (${d.n.toLocaleString('fr-FR')} bougies).`;
  if (!d.ecart) return base + ` Écart avec le temps réel : non mesuré (${d.raisonEcart}) : aucun recalage.`;
  const pct = d.ecart.pct, abs = d.ecart.absolu;
  return base + ` Écart mesuré avec le temps réel : ${(pct >= 0 ? '+' : '−') + Math.abs(pct).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} % (médiane ${abs >= 0 ? '+' : '−'}${Math.abs(abs).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}) sur ${d.ecart.n} bougies communes du ${d.ecart.de} au ${d.ecart.a}${d.ecart.deH1 ? ' (mesuré en H1)' : d.ecart.deJ ? ' (mesuré en Daily)' : ''} ; l’historique est recalé de ce rapport.`;
}
