/* Tests de la PHASE A du terminal de Rayle (pur, Node) : actifs, sources (relais compatible ou non), historique progressif (fusion, écart et
   rapport mesurés, assemblage, pagination vers le passé, secours), SMA 200 sur tout l'historique et projetée (sans valeur du futur),
   heure de Paris, couches mémorisées par actif, dashboards (COT, calendrier, actualités), relais (liste blanche des symboles).
   Usage : node agent-trading/tests/terminal-a-test.mjs */
import { ACTIFS_TERMINAL, PAR_ID_T, UNITES, fmt, auTick, actifDepuisTexte, uniteDepuisTexte } from '../front/terminal/actifs-terminal.js';
import { relaisCompatible, oublierCompat, depuisKraken } from '../front/terminal/sources-terminal.js';
import { fusionner, mesurer, assembler, transformer, creerSerie } from '../front/terminal/historique-terminal.js';
import { sma, smaProjetee, atr, decalageParis, tempsParis, tempsCroissants, tendance, sante } from '../front/terminal/indicateurs.js';
import { lireCouches, ecrireCouches, coucheDepuisTexte, defauts } from '../front/terminal/couches-terminal.js';
import { resumeCot, annonces, prochaine, actusFinance, COT_ABSENT } from '../front/terminal/dashboards-calcul.js';
import { indiceDe, tempsDe } from '../front/terminal/graphique-terminal.js';
import { cible, SYMBOLES } from '../../relais-or/index.js';

let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3;

/* ── actifs ── */
t(ACTIFS_TERMINAL.map(a => a.symbole).join() === 'PF_XAUUSD,PF_US100USD,PF_XBTUSD,PF_SOLUSD,PF_DOGEUSD', 'les 5 actifs et leurs symboles Kraken');
t(fmt('DOGE', 0.123456) === '0,12346' && fmt('BTC', 76012.4) === '76 012' && fmt('OR', 4058.391) === '4 058,39', 'format par actif');
t(Math.abs(auTick('OR', 4058.387) - 4058.39) < 1e-9 && auTick('NASDAQ', 25012.6) === 25013, 'arrondi au pas de prix');
t(actifDepuisTexte('montre le bitcoin') === 'BTC' && actifDepuisTexte('passe sur le Nasdaq') === 'NASDAQ' && actifDepuisTexte("l'or") === 'OR' && actifDepuisTexte('doge') === 'DOGE' && actifDepuisTexte('solana') === 'SOL', 'actif reconnu dans une phrase');
t(uniteDepuisTexte('mets le H4') === 'H4' && uniteDepuisTexte('en 15 minutes') === 'M15' && uniteDepuisTexte('le journalier') === 'J' && uniteDepuisTexte('une heure') === 'H1', 'unité reconnue dans une phrase');

/* ── relais : liste blanche fixe ── */
t(SYMBOLES.length === 6 && cible('https://r/kraken/bougies?res=1h&from=1600000000&sym=PF_SOLUSD').url === 'https://futures.kraken.com/api/charts/v1/trade/PF_SOLUSD/1h?from=1600000000', 'relais : bougies d’un symbole de la liste');
t(cible('https://r/kraken/bougies?res=1h&from=1790000000').url.includes('/PF_XAUUSD/'), 'relais : sans sym = or (ancien comportement)');
t(!!cible('https://r/kraken/ticker?sym=PF_ETHUSD').erreur && !!cible('https://r/kraken/bougies?res=1h&from=1790000000&sym=../x').erreur, 'relais : symbole hors liste refusé');
t(cible('https://r/kraken/tickers').filtre === 'tickers', 'relais : tickers groupés');

/* ── bougies synthétiques ── */
const serieH = (n, t0, p0 = 100, pas = H, f = i => Math.sin(i / 7) * 3) => Array.from({ length: n }, (_, i) => { const c = p0 + f(Math.round(t0 / pas) + i); return { t: t0 + i * pas, o: c - 0.2, h: c + 1, l: c - 1, c, v: 10 + (i % 5) }; });
const fauxFetch = routes => async url => { for (const [re, f] of routes) { const m = url.match(re); if (m) { const d = await f(url, m); return { ok: true, status: 200, json: async () => d }; } } return { ok: false, status: 404, json: async () => ({}) }; };

/* ── relais compatible ? ── */
oublierCompat();
const vieux = fauxFetch([[/kraken\/ticker/, () => ({ ticker: { symbol: 'PF_XAUUSD', last: 4000 } })]]);
t(await relaisCompatible('PF_XBTUSD', { fetchFn: vieux, relais: 'https://v' }) === false, 'ancien relais (renvoie l’or) : non compatible pour BTC');
t(await relaisCompatible('PF_XAUUSD', { fetchFn: vieux, relais: 'https://v' }) === true, 'ancien relais : compatible pour l’or');

/* ── fusion, écart, rapport, assemblage ── */
const a = serieH(5, 0), b = serieH(5, 3 * H).map(x => ({ ...x, c: x.c + 50 }));
const f = fusionner(a, b); t(f.length === 8 && f[3].c === b[0].c, 'fusion : le plus récent remplace au même instant');
t(fusionner(serieH(3, 10 * H), serieH(3, 0)).map(x => x.t / H).join() === '0,1,2,10,11,12', 'fusion : bloc ancien devant');
const K = serieH(100, 200 * H), Rf = serieH(300, 0).map(x => ({ ...x, c: x.c - 2.1, o: x.o - 2.1, h: x.h - 2.1, l: x.l - 2.1 }));
const me = mesurer(K, Rf, 'ecart'); t(me && Math.abs(me.valeur - 2.1) < 1e-9 && me.n === 48, 'écart mesuré sur 48 bougies communes');
const Q = serieH(300, 0).map(x => ({ ...x, c: x.c / 41 }));
const mr = mesurer(K, Q, 'rapport'); t(mr && Math.abs(mr.valeur - 41) < 1e-6, 'rapport mesuré (QQQx → Nasdaq)');
t(mesurer(K, serieH(5, 0), 'ecart') === null, 'pas assez de bougies communes : rien de mesuré');
const asm = assembler(K, Rf, serieH(400, -200 * H), me, { valeur: 3, n: 48 }, 'ecart');
t(asm[0].bande && asm.find(x => x.ref) && !asm[asm.length - 1].ref && !asm[asm.length - 1].bande, 'assemblage : bande, puis référence, puis Kraken');
t(asm.every((x, i) => !i || x.t > asm[i - 1].t), 'assemblage : temps strictement croissants, jamais deux bougies au même instant');
t(asm.filter(x => x.bande).every(x => x.v === 0), 'bande ancienne : sans volume');
t(Math.abs(asm.find(x => x.ref && x.t === 100 * H).c - (Rf[100].c + 2.1)) < 1e-9, 'référence décalée de l’écart mesuré');

/* ── série complète : page récente + remontée vers le passé (Kraken, puis Binance, puis bande) ── */
{
  const maint = 1800 * H + 1, kAll = serieH(1000, 800 * H, 4000), rAll = serieH(1500, 0, 3998), bAll = serieH(800, -500 * H, 3990);
  let appels = 0;
  const fx = fauxFetch([
    [/ticker\?sym=PF_XAUUSD/, () => ({ ticker: { symbol: 'PF_XAUUSD' } })],
    [/kraken\/bougies\?sym=PF_XAUUSD&res=1h&from=(-?\d+)&to=(-?\d+)/, (u, m) => { appels++; const de = m[1] * 1000, aa = m[2] * 1000; return { candles: kAll.filter(x => x.t >= de && x.t < aa).map(x => ({ time: x.t, open: '' + x.o, high: '' + x.h, low: '' + x.l, close: '' + x.c, volume: '' + x.v })) }; }],
    [/fapi\/v1\/klines\?symbol=XAUUSDT&interval=1h&startTime=(-?\d+)&endTime=(-?\d+)/, (u, m) => rAll.filter(x => x.t >= +m[1] && x.t <= +m[2]).slice(0, 1500).map(x => [x.t, x.o, x.h, x.l, x.c, x.v])],
    [/api\/v3\/klines\?symbol=PAXGUSDT&interval=1h&startTime=(-?\d+)&endTime=(-?\d+)/, (u, m) => bAll.filter(x => x.t >= +m[1] && x.t <= +m[2]).slice(0, 1000).map(x => [x.t, x.o, x.h, x.l, x.c, 0])]
  ]);
  oublierCompat();
  const s = creerSerie({ actif: 'OR', unite: 'H1', fetchFn: fx, relais: 'https://n', maintenant: () => maint, pause: 0, ouvert: -1e15 });
  const B0 = await s.demarrer(); t(B0.length === 1000 && B0[0].t === 800 * H, 'page récente Kraken (≤ 2000 bougies)');
  await s.remonterTout(); const B = s.bougies(), inf = s.info();
  t(inf.toutFini, 'historique remonté jusqu’au bout de chaque source');
  t(inf.nKraken === 1000 && inf.nRef === 800 && inf.nBande === 500, 'Kraken 1000, référence 800 avant Kraken, bande 500 avant la référence', JSON.stringify(inf));
  t(inf.ecart && Math.abs(inf.ecart.valeur - 2) < 1e-9 && inf.rapport && Math.abs(inf.rapport.valeur - 10) < 1e-9, 'écarts mesurés (référence, bande)');
  t(B.every((x, i) => !i || x.t > B[i - 1].t) && B[0].t === -500 * H, 'série complète triée depuis le début de la bande');
  // prix en direct : met à jour la dernière bougie, en crée une nouvelle à l'heure ronde
  const n0 = s.bougies().length; t(s.prix(4100, 1799 * H + 10) && s.bougies()[n0 - 1].c === 4100 && s.bougies()[n0 - 1].h >= 4100, 'prix en direct : dernière bougie mise à jour');
  t(s.prix(4101, 1800 * H + 5) && s.bougies().length === n0 + 1, 'prix en direct : nouvelle bougie à l’heure ronde');
}
{ // ancien relais : crypto → secours Binance étiqueté ; Nasdaq sans Worker → erreur claire
  oublierCompat();
  const btc = serieH(1500, 100 * H, 76000);
  const fx = fauxFetch([[/ticker\?sym=/, () => ({ ticker: { symbol: 'PF_XAUUSD' } })], [/fapi\/v1\/klines\?symbol=BTCUSDT&interval=1h&startTime=(-?\d+)&endTime=(-?\d+)/, (u, m) => btc.filter(x => x.t >= +m[1] && x.t <= +m[2]).slice(0, 1500).map(x => [x.t, x.o, x.h, x.l, x.c, x.v])]]);
  const s = creerSerie({ actif: 'BTC', unite: 'H1', fetchFn: fx, relais: 'https://v', maintenant: () => 1600 * H + 1, pause: 0 });
  const B = await s.demarrer(); t(s.info().source === 'binance' && B.length && B[B.length - 1].c > 70000, 'ancien relais : BTC en secours Binance (jamais le prix de l’or)');
  const n = creerSerie({ actif: 'NASDAQ', unite: 'H1', fetchFn: fx, relais: 'https://v', maintenant: () => 1600 * H + 1, wjson: null });
  let err = null; try { await n.demarrer(); } catch (e) { err = e.message; } t(/Worker de Rayle non connecté/.test(err || ''), 'Nasdaq sans relais ni Worker : erreur claire, aucune bougie');
  const n2 = creerSerie({ actif: 'NASDAQ', unite: 'H1', fetchFn: fx, relais: 'https://v', maintenant: () => 1600 * H + 1, wjson: async () => ({ bougies: serieH(500, 0, 25000).map(x => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })) }) });
  const B2 = await n2.demarrer(); t(n2.info().source === 'worker' && B2.length === 500 && B2[0].c > 20000, 'Nasdaq : secours Yahoo ^NDX par le Worker, étiqueté');
}
t(depuisKraken({ candles: [{ time: 1, open: '1', high: '2', low: '0.5', close: '1.5', volume: '3' }] })[0].c === 1.5, 'lecture des bougies Kraken');

/* ── indicateurs ── */
const S200 = sma(serieH(450, 0, 100, H, i => i), 200);
t(S200[198] === null && Math.abs(S200[199] - 199.5) < 1e-9 && Math.abs(S200[449] - 449.5) < 1e-9, 'SMA 200 sur tout l’historique');
{ const M15 = serieH(4 * 300, 0, 100, 15 * 60e3, i => i), H1 = serieH(300, 0, 100, H, i => i * 4 + 3);
  const P = smaProjetee(M15, H1, H, 200), sH = sma(H1, 200);
  const i = 4 * 250 + 2; // bougie M15 à 250 h 30 : dernière H1 CLOSE = celle de 249 h
  t(Math.abs(P[i] - sH[249]) < 1e-9, 'SMA 200 H1 projetée : valeur de la dernière bougie H1 close (rien du futur)');
  t(P[4 * 199 + 3] === null && P[4 * 200] != null, 'SMA projetée inconnue avant 200 bougies H1 closes'); }
t(decalageParis(Date.UTC(2026, 6, 1)) === 7200e3 && decalageParis(Date.UTC(2026, 0, 15)) === 3600e3, 'heure de Paris : été +2 h, hiver +1 h');
t(decalageParis(Date.UTC(2026, 9, 25, 0, 59)) === 7200e3 && decalageParis(Date.UTC(2026, 9, 25, 1, 0)) === 3600e3, 'changement d’heure d’octobre à 01:00 UTC');
{ const B = [{ t: Date.UTC(2026, 9, 25, 0, 0) }, { t: Date.UTC(2026, 9, 25, 1, 0) }]; const s2 = tempsCroissants(B); t(s2[1] > s2[0], 'temps croissants au changement d’heure'); }
t(tempsParis(Date.UTC(2026, 0, 1, 12)) === Date.UTC(2026, 0, 1, 13) / 1000, 'temps du graphique = heure murale de Paris');
const A = atr(serieH(30, 0)); t(A[12] === null && Math.abs(A[13] - 2) < 1.5, 'ATR');
t(tendance(serieH(260, 0, 100, H, i => i), sma(serieH(260, 0, 100, H, i => i), 200)).sens === 'haussière', 'tendance haussière');
t(sante(serieH(10, 0)).volatilite === null, 'santé : rien d’inventé sous 30 bougies');
{ const B = serieH(60, 0); B[58].v = 100; const s3 = sante(B, { spread: 0.5, prix: 100, desequilibre: { achat: 0.6 } }); t(s3.volumeRelatif && s3.volumeRelatif.mot === 'fort' && Math.abs(s3.spreadPct - 0.5) < 1e-9, 'santé : volume relatif et spread'); }
{ const B = serieH(10, 0); t(Math.abs(indiceDe(B, 3.5 * H, H) - 3.5) < 1e-9 && indiceDe(B, 12 * H, H) === 12 && tempsDe(B, 11, H) === 11 * H && tempsDe(B, 2.5, H) === 2.5 * H, 'indice logique ⇄ temps (extrapolé au-delà des bords)'); }

/* ── couches ── */
{ const mem = new Map(), st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const d = lireCouches('BTC', st); t(d.volume === true && d.ma200 === false && d.sr === false, 'graphique vierge par défaut (volume seul)');
  ecrireCouches('BTC', { ...d, ma200: true }, st); t(lireCouches('BTC', st).ma200 === true && lireCouches('OR', st).ma200 === false, 'couches mémorisées PAR ACTIF');
  st.setItem('rayle_term_couches_SOL', '{pas du json'); t(JSON.stringify(lireCouches('SOL', st)) === JSON.stringify(defauts()), 'mémoire corrompue : défauts'); }
t(coucheDepuisTexte('affiche la MA200') === 'ma200' && coucheDepuisTexte('la moyenne 200 en H1') === 'ma200H1' && coucheDepuisTexte('masque les supports') === 'sr' && coucheDepuisTexte('les liquidités') === 'liquidite', 'couche reconnue dans une phrase');

/* ── dashboards ── */
{ const d = { nom: 'Or (COMEX)', source: 'CFTC', stats: { derniere: { date: '2026-11-03', publication: '2026-11-06', long: 300000, short: 80000, net: 220000, oi: 500000, pct_oi: 44, commerciaux_net: -230000 }, variation_semaine: -5000, variation_4_semaines: 12000, percentile_1an: 72, lecture: 'positionnement acheteur élevé' }, serie: [{ date: '2026-10-27', net: 225000, commerciaux_net: -1 }] };
  const r = resumeCot(d); t(r.categories[0].net === 220000 && r.categories[1].net === -230000 && r.serie.length === 1 && r.centile1an === 72, 'COT : positions nettes par catégorie'); t(resumeCot({}) === null, 'COT vide : rien'); }
t(!!COT_ABSENT.SOL && !!COT_ABSENT.DOGE, 'COT : Solana et Dogecoin sans rapport (dit clairement)');
{ const now = Date.UTC(2026, 10, 9, 12); const L = annonces([{ date: new Date(now + 3600e3).toISOString(), country: 'USD', impact: 'High', title: 'CPI' }, { date: new Date(now + 7200e3).toISOString(), country: 'USD', impact: 'Low', title: 'x' }, { date: new Date(now - 5 * 3600e3).toISOString(), country: 'EUR', impact: 'High', title: 'vieux' }, { date: new Date(now + 600e3).toISOString(), country: 'AUD', impact: 'High', title: 'aud' }], { maintenant: now });
  t(L.length === 1 && L[0].titre === 'CPI' && L[0].impact === 'fort', 'calendrier : impact fort / moyen, devises suivies, pas les anciennes'); t(prochaine(L, now).titre === 'CPI', 'prochaine annonce forte'); }
{ const L = actusFinance([{ titre: 'Le bitcoin dépasse 80 000 dollars', sources: [{ nom: 'A', url: 'https://a', date: '2026-11-08T10:00:00Z' }] }, { titre: 'Match de football', sources: [] }, { titre: 'La Fed laisse ses taux inchangés', sources: [{ nom: 'B', url: 'https://b' }] }], 'BTC');
  t(L.length === 2 && /bitcoin/.test(L[0].titre) && L[0].lien === 'https://a', 'actualités : finance seulement, actif en premier'); }

console.log(`terminal phase A : ${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
