// M6 partie 5 : régime de marché crypto (score composite 0-100), données gratuites (financement, peur et cupidité, capitalisation mondiale).
// Lancer :  node planetes/mars/tests/m6-regime-test.mjs
import { calculerRegime, composantes, etiquetteRegime, percentile, santeFinancement, drawdownAnnuel, POIDS_REGIME, zoneDe, ZONES_REGIME } from '../pc/agent-m6/regime.js';
import { lireFinancement, lireFearGreed, lireGlobal, chargerContexteRegime, URL_FNG, URL_GLOBAL } from '../pc/agent-m6/regime-donnees.js';
import { URL_FUNDING } from '../pc/agent-m6/paires.js';
import { marcheM5 } from './synth-m5.mjs';
import { marcheMixte } from './synth-btc.mjs';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const fund = (n, f) => Array.from({ length: n }, (_, i) => ({ t: Date.UTC(2026, 8, 1) + i * 8 * 3600e3, taux: f(i) }));

// ── briques ──
{
  v('poids : somme = 1', proche(Object.values(POIDS_REGIME).reduce((s, x) => s + x, 0), 1));
  v('zones : 80 risk-on, 40 neutre, 0 risk-off', zoneDe(95).code === 'RISK_ON' && zoneDe(80).code === 'RISK_ON' && zoneDe(79).code === 'NEUTRE' && zoneDe(40).code === 'NEUTRE' && zoneDe(39).code === 'RISK_OFF' && ZONES_REGIME.length === 3);
  v('santé du financement : 100 au milieu sain, 30 aux extrêmes', santeFinancement(0.575) === 100 && proche(santeFinancement(1), 30) && proche(santeFinancement(0), 30) && santeFinancement(0.95) < santeFinancement(0.8) && santeFinancement(0.05) < santeFinancement(0.3) && santeFinancement(0.4) > 90);
  v('percentile : rang du dernier parmi les autres', percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10) === 1 && percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5) === 0.5 && percentile([1, 2, 3], 2) === null);
  const M = marcheMixte(12000, 4); const dd = drawdownAnnuel(M); v('drawdown annuel : recul depuis le plus haut, en %, avec la fenêtre', dd && dd.pct >= 0 && dd.pct < 100 && dd.jours > 100, JSON.stringify(dd));
  v('drawdown : pas assez d’historique → null', drawdownAnnuel({ n: 1000 }) === null);
}
// ── régime complet ──
{
  const hausse = marcheM5({ n: 30000, graine: 4, derive: () => 0.012, bruitPct: 0.1, centrer: false, prix: 100 });
  const R = calculerRegime({ serie: hausse, funding: fund(100, i => 0.00008 + (i % 7) * 0.000004), paire: 'SOL' });
  v('marché haussier régulier : régime calculé avec 5 composantes', R.ok && Object.values(R.composantes).every(c => c.valeur != null) && R.manquantes.length === 0, JSON.stringify(R.manquantes));
  v('étiquette « tendance haussière », tendance > 65', R.etiquette.code === 'tendance_haussiere' && R.composantes.tendance.valeur > 65, JSON.stringify([R.etiquette, R.composantes.tendance]));
  v('score entre 0 et 100, zone cohérente, poids effectifs = 1', R.score >= 0 && R.score <= 100 && R.zone && R.zone.code === zoneDe(R.score).code && proche(Object.values(R.composantes).reduce((s, c) => s + c.poidsEffectif, 0), 1, 1e-9));
  v('la phrase donne le sens des extrêmes, le nom de la paire, et rappelle que ça ne prédit rien', /Solana/.test(R.phrase) && /100 = marché sain/.test(R.phrase) && /ne prédit rien/.test(R.phrase), R.phrase);
  const baisse = calculerRegime({ serie: marcheM5({ n: 30000, graine: 4, derive: () => -0.012, bruitPct: 0.1, prix: 100000 }), funding: fund(100, () => 0.00005), paire: 'BTC' });
  v('marché baissier régulier : « tendance baissière » et score plus bas que le haussier', baisse.etiquette.code === 'tendance_baissiere' && baisse.score < R.score, baisse.score + ' vs ' + R.score);
  v('contexte hors score : indisponible quand on ne l’a pas, jamais inventé', R.contexte.every(c => c.valeur === null && c.texte === 'indisponible'));
  const avec = calculerRegime({ serie: hausse, funding: null, fearGreed: { etat: 'reel', valeur: 72, libelle: 'cupidité' }, global: { etat: 'reel', variation24h: -1.4, dominanceBtc: 58.2 }, paire: 'BTC' });
  v('contexte fourni : peur et cupidité, capitalisation, dominance', /72\/100 \(cupidité\)/.test(avec.contexte[0].texte) && /−1,4 %/.test(avec.contexte[1].texte) && /58,2 %/.test(avec.contexte[1].texte));
  v('sans financement : composante écartée, nommée, poids redistribué', avec.manquantes.join() === 'Financement' && avec.composantes.financement.poidsEffectif === 0 && /Écarté faute de données/.test(avec.phrase) && proche(Object.values(avec.composantes).reduce((s, c) => s + c.poidsEffectif, 0), 1, 1e-9) && avec.composantes.tendance.poidsEffectif > POIDS_REGIME.tendance);
  v('historique trop court : erreur claire, pas de score inventé', !calculerRegime({ serie: marcheMixte(500, 1) }).ok && /insuffisant/i.test(calculerRegime({ serie: marcheMixte(500, 1) }).erreur));
  // financement : surchauffe contre sain
  const sain = calculerRegime({ serie: hausse, funding: fund(100, i => 0.0001 * (0.8 + 0.4 * ((i * 37) % 100) / 100) * (i === 99 ? 1 : 1)) });
  const surchauffe = calculerRegime({ serie: hausse, funding: [...fund(99, i => 0.00005 + (i % 5) * 0.000002), { t: Date.UTC(2026, 11, 1), taux: 0.0012 }] });
  v('financement en surchauffe (centile 100 %) : composante basse, texte « surchauffe »', surchauffe.composantes.financement.valeur <= 31 && /surchauffe/.test(surchauffe.composantes.financement.texte) && surchauffe.score < R.score + 1, JSON.stringify(surchauffe.composantes.financement));
  const capit = calculerRegime({ serie: hausse, funding: [...fund(99, i => 0.00005 + (i % 5) * 0.000002), { t: Date.UTC(2026, 11, 1), taux: -0.0009 }] });
  v('financement très négatif (capitulation) : composante basse aussi', capit.composantes.financement.valeur <= 35 && /capitulation/.test(capit.composantes.financement.texte));
  v('le régime est déterministe', JSON.stringify(calculerRegime({ serie: hausse, funding: fund(100, () => 0.0001) })) === JSON.stringify(calculerRegime({ serie: hausse, funding: fund(100, () => 0.0001) })));
  // étiquette « volatil »
  const c = { volatilite: { etat: 'reel', agitation: 92 }, tendance: { direction: 70 }, structure: { valeur: 60 } }; v('volatilité extrême (92e centile) prime : « volatilité extrême avec biais haussier »', /volatilité extrême avec biais haussier/.test(etiquetteRegime(c).nom) && etiquetteRegime(c).code === 'volatil');
  v('range quand ni tendance ni volatilité extrême', etiquetteRegime({ volatilite: { etat: 'reel', agitation: 40 }, tendance: { direction: 52 }, structure: { valeur: 50 } }).code === 'range');
}
// ── données gratuites : URL, lecture, pannes, cache ──
{
  v('URL financement : Binance fapi avec le bon symbole', /fapi\.binance\.com\/fapi\/v1\/fundingRate\?symbol=DOGEUSDT/.test(URL_FUNDING('DOGE', 123, 150)) && /SOLUSDT/.test(URL_FUNDING('SOL', 1)) && URL_FNG.includes('alternative.me') && URL_GLOBAL.includes('coingecko'));
  const faux = async url => {
    if (/fundingRate/.test(url)) return [{ symbol: 'SOLUSDT', fundingTime: 1792684800001, fundingRate: '0.00003682' }, { symbol: 'SOLUSDT', fundingTime: 1792713600006, fundingRate: '0.00009274' }];
    if (/alternative/.test(url)) return { data: [{ value: '68', value_classification: 'Greed', timestamp: '1792627200' }] };
    if (/coingecko/.test(url)) return { data: { market_cap_change_percentage_24h_usd: 0.84, market_cap_percentage: { btc: 57.1 } } };
    throw new Error('inconnu');
  };
  const f = await lireFinancement('SOL', faux); v('financement lu : taux triés et convertis en nombres', f.etat === 'reel' && f.liste.length === 2 && f.liste[0].taux === 0.00003682 && f.liste[0].t < f.liste[1].t);
  const g = await lireFearGreed(faux); v('peur et cupidité lue et traduite', g.etat === 'reel' && g.valeur === 68 && g.libelle === 'cupidité');
  const gl = await lireGlobal(faux); v('capitalisation mondiale lue', gl.etat === 'reel' && gl.variation24h === 0.84 && gl.dominanceBtc === 57.1);
  const panne = async () => { throw new Error('HTTP 429'); };
  const [p1, p2, p3] = [await lireFinancement('BTC', panne), await lireFearGreed(panne), await lireGlobal(panne)];
  v('pannes : « indisponible » avec la raison, jamais de valeur inventée', [p1, p2, p3].every(x => x.etat === 'indisponible' && /429/.test(x.erreur)));
  v('réponses inattendues : indisponible aussi', (await lireFinancement('BTC', async () => ({ erreur: 1 }))).etat === 'indisponible' && (await lireFearGreed(async () => ({}))).etat === 'indisponible' && (await lireGlobal(async () => ({ data: {} }))).etat === 'indisponible');
  let appels = 0; const compte = async u => { appels++; return faux(u); }, cache = {};
  const a = await chargerContexteRegime({ paire: 'SOL', lire: compte, cache, maintenant: 1000 }); const n1 = appels;
  const b = await chargerContexteRegime({ paire: 'SOL', lire: compte, cache, maintenant: 1000 + 5 * 60e3 }); const n2 = appels;
  const c2 = await chargerContexteRegime({ paire: 'SOL', lire: compte, cache, maintenant: 1000 + 11 * 60e3 });
  v('contexte complet en 3 appels, relu depuis le cache pendant 10 minutes, rechargé ensuite', a.funding && a.fearGreed.etat === 'reel' && a.global.etat === 'reel' && n1 === 3 && n2 === 3 && appels === 6 && c2.funding);
  const cache2 = {}; await chargerContexteRegime({ paire: 'SOL', lire: panne, cache: cache2, maintenant: 1 }); v('une panne n’est PAS mise en cache', Object.keys(cache2).length === 0);
  const mixte = await chargerContexteRegime({ paire: 'DOGE', lire: async u => (/fundingRate/.test(u) ? panne() : faux(u)), cache: {}, maintenant: 1 });
  v('financement en panne seul : le reste est quand même lu', mixte.funding === null && mixte.financementEtat.etat === 'indisponible' && mixte.fearGreed.etat === 'reel');
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
