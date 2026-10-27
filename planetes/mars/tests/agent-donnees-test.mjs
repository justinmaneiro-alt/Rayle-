import { SOURCES, PAS_M15, alignerM15, bougieValide, telechargerPlage } from '../pc/agent-btc/sources.js';
import { MS, concatener, depuisBougies, fusionner, lacunes, regrouper, versBougies } from '../pc/agent-btc/colonnes.js';
import { creerHistorique } from '../pc/agent-btc/historique.js';
import { ouvrirStockageBtc } from '../pc/agent-btc/stockage-btc.js';
import { bougiesSynth, T0 } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const sansPause = () => Promise.resolve();

// ── analyse des formats de réponse ──
const kB = [Date.UTC(2026, 0, 1), '100.0', '101.0', '99.0', '100.5', '12.5', 0, '1250', 100, '7.5', '750', '0'];
const pb = SOURCES.binance.analyser([kB]);
v('Binance : ligne de klines → bougie (ouverture, OHLC, volume, volume acheteur)', pb.length === 1 && pb[0].t === kB[0] && pb[0].o === 100 && pb[0].h === 101 && pb[0].l === 99 && pb[0].c === 100.5 && pb[0].v === 12.5 && pb[0].vb === 7.5);
v('Binance : réponse inattendue = erreur claire', (() => { try { SOURCES.binance.analyser({ code: -1121 }); return false; } catch (e) { return /inattendue/.test(e.message); } })());
const ps = SOURCES.bitstamp.analyser({ data: { pair: 'BTC/USD', ohlc: [{ timestamp: '1767225600', open: '100', high: '101', low: '99', close: '100.5', volume: '3.2' }] } });
v('Bitstamp : champs en texte → nombres, secondes → ms, pas de volume acheteur', ps[0].t === 1767225600000 && ps[0].c === 100.5 && ps[0].v === 3.2 && Number.isNaN(ps[0].vb));
v('Binance fournit le delta réel, Bitstamp non', SOURCES.binance.deltaReel === true && SOURCES.bitstamp.deltaReel === false);
v('bougieValide : refuse prix négatif, haut < bas, NaN', bougieValide({ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }) && !bougieValide({ t: 1, o: -1, h: 2, l: 0.5, c: 1.5, v: 1 }) && !bougieValide({ t: 1, o: 1, h: 0.9, l: 0.5, c: 1.5, v: 1 }) && !bougieValide({ t: 1, o: NaN, h: 2, l: 0.5, c: 1.5, v: 1 }));

// ── faux serveur d'échange : sert des pages de 1000 bougies depuis startTime, avec ses appels journalisés ──
const SYN = bougiesSynth({ segments: [{ n: 3000, derive: 0.001, bruit: 0.15, volume: 100 }], graine: 5 });
function fauxBinance({ panneApres = Infinity } = {}) {
  const journal = []; let appels = 0;
  const lire = async url => {
    appels++; journal.push(url);
    if (url.includes('binance') && appels > panneApres) throw new Error('HTTP 451');
    if (url.includes('bitstamp')) { const t0 = +new URL(url).searchParams.get('start') * 1000; return { data: { ohlc: SYN.filter(b => b.t >= t0).slice(0, 1000).map(b => ({ timestamp: String(b.t / 1000), open: String(b.o), high: String(b.h), low: String(b.l), close: String(b.c), volume: String(b.v) })) } }; }
    const t0 = +new URL(url).searchParams.get('startTime'); const l = SYN.filter(b => b.t >= t0).slice(0, +new URL(url).searchParams.get('limit'));
    return l.map(b => [b.t, String(b.o), String(b.h), String(b.l), String(b.c), String(b.v), b.t + 899999, '0', 1, String(b.vb), '0', '0']);
  };
  return { lire, journal, appels: () => appels };
}

// ── téléchargement par pages ──
{
  const f = fauxBinance(), res = await telechargerPlage('binance', f.lire, T0, T0 + 3000 * PAS_M15, { pause: sansPause });
  v('téléchargement : 3 pages de 1000 pour 3000 bougies', f.journal.length >= 3 && res.length === 3000, f.journal.length + ' requêtes, ' + res.length + ' bougies');
  v('téléchargement : triées, sans doublon, contiguës', res.every((b, i) => i === 0 || b.t - res[i - 1].t === PAS_M15));
  v('téléchargement : volume acheteur conservé', res.every(b => Number.isFinite(b.vb)));
  const partiel = await telechargerPlage('binance', fauxBinance().lire, T0 + 100 * PAS_M15, T0 + 150 * PAS_M15, { pause: sansPause });
  v('téléchargement : borne de fin respectée (pas de bougie au-delà)', partiel.length === 50 && partiel[partiel.length - 1].t === T0 + 149 * PAS_M15);
  let tentatives = 0; const capricieux = async url => { if (++tentatives < 3) throw new Error('réseau'); return fauxBinance().lire(url); };
  const r2 = await telechargerPlage('binance', capricieux, T0, T0 + 10 * PAS_M15, { pause: sansPause });
  v('téléchargement : deux échecs réseau puis succès (nouvelles tentatives)', r2.length === 10 && tentatives === 3);
  let erreur = null; try { await telechargerPlage('binance', async () => { throw new Error('HTTP 451'); }, T0, T0 + 10 * PAS_M15, { pause: sansPause }); } catch (e) { erreur = e; }
  v('téléchargement : échec persistant → l’erreur remonte (l’appelant bascule sur le secours)', erreur && /451/.test(erreur.message));
}

// ── colonnes : fusion, lacunes, regroupement ──
{
  const b = bougiesSynth({ segments: [{ n: 96 * 3, derive: 0.01, bruit: 0.2, volume: 50 }], graine: 2, t0: Date.UTC(2024, 0, 1) });
  const s = depuisBougies(b);
  v('colonnes : aller-retour bougies ↔ colonnes', versBougies(s).every((x, i) => x.t === b[i].t && x.c === b[i].c && x.vb === b[i].vb));
  const f = fusionner(depuisBougies(b.slice(0, 200)), depuisBougies(b.slice(150)));
  v('fusion : une bougie par instant, triée', f.n === b.length && f.t.every((t, i) => i === 0 || t > f.t[i - 1]));
  v('concaténation de blocs disjoints', concatener([depuisBougies(b.slice(0, 100)), depuisBougies(b.slice(100))]).n === b.length);
  const trou = depuisBougies(b.filter((_, i) => i < 50 || i >= 60));
  v('lacunes : 10 bougies manquantes repérées', lacunes(trou).length === 1 && lacunes(trou)[0].manquantes === 10);
  const h1 = regrouper(s, MS.H1);
  v('H1 : 4 bougies M15 → 1 (ouverture de la 1re, clôture de la dernière, plus haut, plus bas, volume additionné)', h1.serie.n === 72 && h1.serie.o[0] === b[0].o && h1.serie.c[0] === b[3].c && Math.abs(h1.serie.h[0] - Math.max(...b.slice(0, 4).map(x => x.h))) < 1e-9 && Math.abs(h1.serie.l[0] - Math.min(...b.slice(0, 4).map(x => x.l))) < 1e-9 && Math.abs(h1.serie.v[0] - b.slice(0, 4).reduce((a, x) => a + x.v, 0)) < 1e-9);
  v('H1 : le volume acheteur s’additionne aussi', Math.abs(h1.serie.vb[5] - b.slice(20, 24).reduce((a, x) => a + x.vb, 0)) < 1e-9);
  v('H1 : finDe = index de la dernière sous-bougie (alignement sans regard vers le futur)', h1.finDe[0] === 3 && h1.finDe[5] === 23);
  const h4 = regrouper(s, MS.H4), d1 = regrouper(s, MS.D1);
  v('H4 : 16 bougies M15 → 1 ; D1 : 96 → 1', h4.serie.n === 18 && d1.serie.n === 3);
  const incomplet = regrouper(depuisBougies(b.slice(0, 98)), MS.D1);
  v('bougie en cours ou incomplète : jamais rendue (98 bougies = 1 jour complet seulement)', incomplet.serie.n === 1);
  const avecTrou = regrouper(trou, MS.H1);
  v('bougie bâtie sur un trou : jamais rendue', avecTrou.serie.n === 69 && avecTrou.serie.t.every((t, i) => i === 0 || t > avecTrou.serie.t[i - 1]));
  const sansVb = regrouper(depuisBougies(b.map(x => ({ ...x, vb: NaN }))), MS.H1);
  v('sans volume acheteur à la source : il reste inconnu (NaN), pas inventé', Number.isNaN(sansVb.serie.vb[0]));
}

// ── historique : synchronisation, reprise, secours, mise à jour ──
{
  const fin = alignerM15(T0 + 3000 * PAS_M15), maintenant = () => fin + 5 * 60e3;       // maintenant = 5 min après la fermeture de la bougie 2999
  const st = await ouvrirStockageBtc(null), f = fauxBinance();
  const h = creerHistorique({ stockage: st, lire: f.lire, maintenant, annees: 3000 * PAS_M15 / (365.25 * 86400e3), pause: sansPause });
  const e = await h.synchroniser();
  v('historique : première synchronisation (3000 bougies fermées, Binance, delta réel)', e.n === 3000 && e.source === 'binance' && e.secours === false && e.deltaReelPct === 1, JSON.stringify([e.n, e.source, e.secours, e.deltaReelPct]));
  v('historique : début et fin datés', e.debut === T0 && e.fin === T0 + 3000 * PAS_M15);
  v('historique : stocké par blocs mensuels (clés M15:AAAA-MM) et méta', (await st.liste()).some(k => k === 'M15:2024-01') && (await st.liste()).includes('meta'));
  const apres = f.journal.length;
  await h.synchroniser();
  v('historique : une seconde synchronisation ne redemande rien (rien à compléter)', f.journal.length === apres, f.journal.length - apres + ' requêtes de plus');
  const h2 = creerHistorique({ stockage: st, lire: f.lire, maintenant, annees: 3000 * PAS_M15 / (365.25 * 86400e3), pause: sansPause });
  const e2 = await h2.charger();
  v('historique : rechargé depuis le disque après redémarrage (mêmes bougies, même source)', e2.n === 3000 && e2.source === 'binance' && h2.serie().c[2999] === h.serie().c[2999]);
  // mise à jour : 2 nouvelles bougies fermées
  SYN.push(...bougiesSynth({ segments: [{ n: 2, derive: 0.001 }], graine: 9, t0: T0 + 3000 * PAS_M15, prix: SYN[SYN.length - 1].c }));
  const h3 = creerHistorique({ stockage: st, lire: f.lire, maintenant: () => T0 + 3002 * PAS_M15 + 2 * 60e3, annees: 1, pause: sansPause });
  await h3.charger(); const u = await h3.actualiser();
  v('actualiser : récupère seulement les nouvelles bougies fermées (2)', u.nouvelles.length === 2 && h3.serie().n === 3002, u.nouvelles.length);
  const u2 = await h3.actualiser();
  v('actualiser : rien de nouveau tant qu’aucune bougie n’est fermée', u2.nouvelles.length === 0);
  SYN.length = 3000;
}
{
  const fin = alignerM15(T0 + 3000 * PAS_M15), maintenant = () => fin + 5 * 60e3, annees = 3000 * PAS_M15 / (365.25 * 86400e3);
  const st = await ouvrirStockageBtc(null), f = fauxBinance({ panneApres: 0 });
  const h = creerHistorique({ stockage: st, lire: f.lire, maintenant, annees, pause: sansPause });
  const e = await h.synchroniser();
  v('secours : Binance en panne (HTTP 451) → Bitstamp prend le relais, dit SECOURS', e.n === 3000 && e.source === 'bitstamp' && e.secours === true, JSON.stringify([e.n, e.source, e.secours]));
  v('secours : le volume acheteur est inconnu (delta ESTIMÉ), pas inventé', e.deltaReelPct === 0 && Number.isNaN(h.serie().vb[10]));
}
{
  const st = await ouvrirStockageBtc(null), h = creerHistorique({ stockage: st, lire: async () => { throw new Error('HTTP 503'); }, maintenant: () => T0 + 99999999, annees: 0.01, pause: sansPause });
  const e = await h.synchroniser();
  v('toutes les sources en panne : aucune bougie inventée, erreur dite', e.n === 0 && /503/.test(e.erreur || ''), JSON.stringify([e.n, e.erreur]));
}

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
