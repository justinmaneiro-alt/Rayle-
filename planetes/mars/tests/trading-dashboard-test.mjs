import * as D from '../pc/trading/dashboard.js';
import * as N from '../pc/trading/instruments.js';
import * as I from '../pc/trading/indicateurs.js';
import { configurationTV } from '../pc/trading/tradingview.js';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

function bougies(n = 400, graine = 3, ancre = 60000, vol = true, pas = 900e3) {
  const a = alea(graine), out = []; let c = ancre;
  for (let i = 0; i < n; i++) { const o = c, mv = (a() - 0.49) * 200 + Math.sin(i / 17) * 60, cl = o + mv, h = Math.max(o, cl) + a() * 80, l = Math.min(o, cl) - a() * 80; out.push({ t: Date.UTC(2026, 9, 1) + i * pas, o, h, l, c: cl, v: vol ? Math.round(5 + a() * 40) : 0 }); c = cl; }
  return out;
}
const B = bougies();

// ── volume net (formule de l'ancien terminal : ±volume × clôture sur 20 bougies) ──
const seg = [{ o: 1, c: 2, v: 10, h: 2, l: 1, t: 0 }, { o: 2, c: 1, v: 5, h: 2, l: 1, t: 1 }];
v('volume net : + pour une bougie haussière, - pour une baissière', D.volumeNet(seg, 20, true) === 10 * 2 - 5 * 1);
v('volume net : null sans volume réel (indice, proxy, devises)', D.volumeNet(seg, 20, false) === null);
v('volume net : null si aucune bougie n’a de volume', D.volumeNet(seg.map(x => ({ ...x, v: 0 })), 20, true) === null);
v('volume net : 20 dernières bougies seulement', (() => { const b = bougies(60); let att = 0; for (const x of b.slice(-20)) att += (x.c >= x.o ? 1 : -1) * x.v * x.c; return Math.abs(D.volumeNet(b, 20, true) - att) < 1e-6; })());

// ── colonne : mêmes formules que le dashboard de l’ancien terminal ──
const c = D.colonne(B, { volumeReel: true });
const closes = B.map(x => x.c), e200 = I.ema(closes, 200).at(-1), r = I.rsi(closes, 14).at(-1);
v('colonne : tendance = prix contre EMA 200', c.dispo && c.bull === (closes.at(-1) > e200));
v('colonne : RSI 14 identique à l’indicateur', Math.abs(c.rsi - r) < 1e-9);
v('colonne : score borné 0-100 et entier', Number.isInteger(c.score) && c.score >= 0 && c.score <= 100);
v('colonne : score = 60/40 ± 0,3 (RSI - 50) ± 5', (() => { const att = Math.max(0, Math.min(100, Math.round((c.bull ? 60 : 40) + (c.rsi - 50) * 0.3 + (c.net >= 0 ? 5 : -5)))); return att === c.score; })());
v('colonne : support sous le prix, résistance au-dessus', (c.support == null || c.support < c.prix) && (c.resistance == null || c.resistance > c.prix));
v('colonne : sans volume réel, volume net absent', D.colonne(B, { volumeReel: false }).net === null);
v('colonne : moins de 30 bougies = indisponible, rien d’inventé', D.colonne(B.slice(0, 10)).dispo === false && D.colonne([]).dispo === false && D.colonne(null).dispo === false);
const court = D.colonne(bougies(120));
v('colonne : sans EMA 200 (historique court), tendance et score non calculés', court.dispo && court.bull === null && court.score === null && court.rsi != null);

// ── global ──
const haut = { dispo: true, bull: true, score: 70 }, bas = { dispo: true, bull: false, score: 30 };
v('global : haussier si au moins 2 unités le sont', D.global([haut, haut, bas, bas]).tendance === 'Haussier' && D.global([haut, bas, bas, bas]).tendance === 'Baissier');
v('global : score = moyenne des unités', D.global([haut, bas]).score === 50);
v('global : aucune unité = rien', D.global([{ dispo: false }, { dispo: false }]).tendance === null);

v('formaterUsd', D.formaterUsd(2.5e9) === '+2.5 Md$' && D.formaterUsd(-1500) === '-1.5 k$' && D.formaterUsd(null) === 'n/d');

// ── contexte ──
const reponse = { maj: '2026-10-21T10:00:00Z', lignes: [
  { id: 'VIX', label: 'VIX', unite: '', prix: 17.2, veille: 16.9, variation_pct: 1.78, source: 'Yahoo Finance', secours: false },
  { id: 'DXY', label: 'Dollar (DXY)', unite: '', prix: 99.1, variation_pct: -0.2, source: 'Yahoo Finance', secours: false },
  { id: 'US10Y', label: 'Taux US 10 ans', unite: '%', prix: 4.1, variation_pct: 0.5, source: 'Yahoo Finance', secours: false },
  { id: 'NVDA', label: 'Nvidia', prix: 180, variation_pct: 1.2, source: 'Finnhub', secours: false },
  { id: 'AAPL', label: 'Apple', prix: 250, variation_pct: -0.4, source: 'Yahoo Finance', secours: true }] };
const ctx = D.lignesContexte(reponse, Date.parse('2026-10-21T10:02:00Z'));
v('contexte : 5 lignes, sources distinctes, âge', ctx.lignes.length === 5 && ctx.sources.length === 2 && ctx.ageMs === 120000);
v('contexte : étiquettes DIFFÉRÉ et SECOURS', ctx.etiquettes.includes('différé ~15 min') && ctx.etiquettes.includes('secours'));
v('contexte : ancienne copie signalée', D.lignesContexte({ ...reponse, perime: true }).etiquettes.includes('ancienne copie'));
v('contexte : réponse invalide = indisponible', D.lignesContexte(null).etiquettes.includes('indisponible') && D.lignesContexte({ error: 'x' }).lignes.length === 0);
const cst = D.constatsContexte(ctx);
v('contexte : constats chiffrés (VIX, dollar, taux, valeurs)', cst.length === 4 && /VIX 17,2 : marché calme/.test(cst[0]) && /Dollar en baisse/.test(cst[1]) && /1 grandes valeurs sur 2/.test(cst[3]), cst.join(' | '));

// ── instruments ajoutés : Bitcoin, Solana, EUR/USD ──
v('instruments : Bitcoin, Solana, EUR/USD présents avec actif Worker', N.INSTRUMENTS.BTC.actif === 'BTC' && N.INSTRUMENTS.SOL.actif === 'SOL' && N.INSTRUMENTS.EUR.actif === 'EUR');
v('instruments : volume réel pour BTC et SOL, aucun pour EUR/USD', N.INSTRUMENTS.BTC.volume.type === 'reel' && N.INSTRUMENTS.SOL.volume.type === 'reel' && N.INSTRUMENTS.EUR.volume.type === 'aucun');
v('voix : « montre-moi le bitcoin en H4 »', JSON.stringify(N.analyserDemande('montre-moi le bitcoin en H4')) === JSON.stringify({ instrument: 'BTC', unite: 'H4' }));
v('voix : « mets solana »', (N.analyserDemande('mets solana') || {}).instrument === 'SOL');
v('voix : « affiche l’euro dollar »', (N.analyserDemande('affiche l\'euro dollar') || {}).instrument === 'EUR');
v('voix : « l’or » n’est pas pris pour autre chose', N.trouverInstrument("montre-moi l'or") === 'XAU' && N.trouverInstrument('le nasdaq') === 'US100');

// ── widget TradingView : symboles et études ──
const cfg = configurationTV('US100', 'H1', 'x');
v('TradingView : US100 en CFD, H1 = 60', cfg.symbol === 'CAPITALCOM:US100' && cfg.interval === '60');
v('TradingView : MA 200 (exponentielle, longueur 200) ET RSI préchargés', cfg.studies.some(s => s.id === 'MAExp@tv-basicstudies' && s.inputs.length === 200) && cfg.studies.some(s => s.id === 'RSI@tv-basicstudies'));
v('TradingView : thème sombre, fuseau Paris, français', cfg.theme === 'dark' && cfg.timezone === 'Europe/Paris' && cfg.locale === 'fr');
v('TradingView : symboles des cinq actifs', ['US100:CAPITALCOM:US100', 'XAU:OANDA:XAUUSD', 'BTC:BINANCE:BTCUSDT', 'SOL:BINANCE:SOLUSDT', 'EUR:FX:EURUSD'].every(t => { const [i, ...s] = t.split(':'); return configurationTV(i, 'M15', 'x').symbol === s.join(':'); }));
v('TradingView : unités M15 / H4 / D1', configurationTV('BTC', 'M15', 'x').interval === '15' && configurationTV('BTC', 'H4', 'x').interval === '240' && configurationTV('BTC', 'D1', 'x').interval === 'D');
v('TradingView : instrument ou unité inconnu = null', configurationTV('???', 'H1', 'x') === null && configurationTV('BTC', 'W1', 'x') === null);

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
