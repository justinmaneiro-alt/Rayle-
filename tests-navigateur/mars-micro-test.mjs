import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* Microstructure (M4) dans la fenêtre « Agent BTC » et à la voix (Chrome) : faux échange (bougies synthétiques générées dans la page), faux contrats à terme (financement, zip d'intérêt ouvert non compressé),
   aucun réseau réel. Vérifie : section « Microstructure » avec une phrase d'explication par mesure, étiquettes RÉEL / ESTIMÉ / INDISPONIBLE, bouton d'activation des dérivés, mesures de financement et d'intérêt ouvert
   après activation, voix (« explique l'absorption », « quelle session est en cours ? », « où sont les zones de liquidité ? »), phrases étrangères ignorées, aucune erreur JavaScript.
   Lancer :  node tests-navigateur/mars-micro-test.mjs   (serveur local sur le port 8000 : node serveur.mjs) */
const { verifier, fin } = compteur();
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await navigateur.newPage(); await page.setViewport({ width: 1500, height: 1000 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_agent_btc_actif', '1');
  const PAS = 900e3, FIN = Math.floor(Date.now() / PAS) * PAS, N = 60000;
  // bougies synthétiques déterministes (marche aléatoire à graine fixe)
  let g = 12345; const alea = () => { g = (g * 1664525 + 1013904223) >>> 0; return g / 4294967296; };
  const barres = []; let c = 78000;
  for (let k = 0; k < N; k++) { const t = FIN - (N - k) * PAS, o = c, ch = (alea() - 0.5) * 0.004 + Math.sin(k / 700) * 0.0002; c = o * (1 + ch); const h = Math.max(o, c) * (1 + alea() * 0.0012), l = Math.min(o, c) * (1 - alea() * 0.0012), v = 80 + alea() * 120, vb = v * (0.25 + 0.5 * alea()); barres.push([t, o, h, l, c, v, 0, 0, 1, vb, 0, 0]); }
  const appelsDeriv = []; window.__appelsDeriv = appelsDeriv;
  // zip « stocké » (méthode 0) contenant un CSV d'intérêt ouvert pour le jour demandé
  const zipDuJour = jour => {
    const t0 = Date.parse(jour + 'T00:00:00Z'); let csv = 'create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio\n';
    for (let k = 0; k < 288; k++) { const d = new Date(t0 + k * 300e3); csv += d.toISOString().slice(0, 19).replace('T', ' ') + ',BTCUSDT,' + (90000 + k * 2 + (t0 / 86400e3 % 50) * 10) + ',7000000000,1.5,1.2,2.1,1.1\n'; }
    const data = new TextEncoder().encode(csv), nom = new TextEncoder().encode('BTCUSDT-metrics-' + jour + '.csv'), out = new Uint8Array(30 + nom.length + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 0, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, nom.length, true); out.set(nom, 30); out.set(data, 30 + nom.length); return out;
  };
  window.__RAYLE_AGENT_TEST__ = {
    indexedDB: null, periodeMs: 1e9, exposer: true, synchro: true,
    lire: async url => {
      const u = new URL(url);
      if (u.host === 'data-api.binance.vision') { const t0 = +u.searchParams.get('startTime'), lim = +u.searchParams.get('limit'); return barres.filter(b => b[0] >= t0 && b[0] + PAS <= FIN + 60e3).slice(0, lim); }
      appelsDeriv.push(u.pathname);
      if (u.pathname.endsWith('/fundingRate')) { const t0 = +u.searchParams.get('startTime'), out = []; for (let t = Math.max(t0, FIN - 4 * 365 * 86400e3); t <= FIN && out.length < 1000; t += 8 * 3600e3) out.push({ fundingTime: Math.ceil(t / (8 * 3600e3)) * (8 * 3600e3), fundingRate: String(0.0001 + 0.00005 * Math.sin(t / 5e8)) }); return out.filter((x, i, a) => i === 0 || x.fundingTime !== a[i - 1].fundingTime); }
      if (u.pathname.startsWith('/futures/data/')) {   // routes « récentes » (30 jours) : une ligne de 5 minutes
        const a = +u.searchParams.get('startTime'), b = Math.min(+u.searchParams.get('endTime'), FIN + 3600e3), out = [];
        for (let t = Math.ceil(a / 300e3) * 300e3; t <= b && out.length < 500; t += 300e3) out.push(u.pathname.endsWith('openInterestHist') ? { sumOpenInterest: String(90500), sumOpenInterestValue: '7e9', timestamp: t } : u.pathname.endsWith('takerlongshortRatio') ? { buySellRatio: '1.05', timestamp: t } : { longShortRatio: '1.3', timestamp: t });
        return out;
      }
      return [];
    },
    lireOctets: async url => { const j = url.match(/(\d{4}-\d\d-\d\d)\.zip/)[1]; appelsDeriv.push('zip:' + j); return zipDuJour(j); },
    inflater: async b => b
  };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await attendre(1500);
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(async () => { const A = await import(new URL('planetes/mars/pc/trading/session-agent.js', document.baseURI).href); const a = await A.obtenirAgent({ demarrer: false }); await a.demarrer({ synchro: true, boucle: false }); window.__A = A; });
await ev(() => { const el = document.createElement('div'); el.id = 'banc'; el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#05080c;overflow:auto'; document.body.appendChild(el); });
await ev(async () => { const m = await import(new URL('planetes/mars/pc/trading/panneau-agent.js', document.baseURI).href); window.__P = m.creerPanneauAgent({}); document.getElementById('banc').appendChild(window.__P.racine); });
await page.waitForFunction(() => /Microstructure/.test(document.querySelector('.ag-micro')?.textContent || '') && /Session en cours/.test(document.querySelector('.ag-micro').textContent), { timeout: 30000 });
const txt = () => ev(() => document.querySelector('.ag-micro').textContent);
let t = await txt();

verifier('section « Microstructure » présente avec session, zones, VWAP, prix ronds, déséquilibre, absorption, volatilité', ['Session en cours', 'Zones de liquidité proches', 'VWAP du jour', 'Prix rond le plus proche', 'Déséquilibre acheteur / vendeur', 'Absorption', 'Volatilité'].every(s => t.includes(s)), t.slice(0, 300));
verifier('chaque mesure a sa phrase d’explication (11 phrases d’aide)', await ev(() => document.querySelectorAll('.ag-micro .ag-aide').length) >= 10, String(await ev(() => document.querySelectorAll('.ag-micro .ag-aide').length)));
verifier('aide de l’absorption : texte du mécanisme', /volume .*mouvement|bouge peu|prix bouge/i.test(await ev(() => [...document.querySelectorAll('.ag-micro .ag-aide')].map(e => e.textContent).join(' '))));
verifier('financement / intérêt ouvert : INDISPONIBLES avant activation (rien d’inventé)', /Financement\s*INDISPONIBLE/.test(t) && /Intérêt ouvert\s*INDISPONIBLE/.test(t) && /données non chargées/.test(t));
verifier('liquidations : jamais de montant réel, étiquetées (INDISPONIBLE sans intérêt ouvert)', /Liquidations\s*INDISPONIBLE/.test(t) && /jamais de montant réel/.test(t));
verifier('bouton « Activer financement et intérêt ouvert »', await ev(() => !!document.querySelector('.ag-micro [data-a="deriv"]')));

// activation des dérivés
await ev(() => document.querySelector('.ag-micro [data-a="deriv"]').click());
await page.waitForFunction(() => /Financement\s*RÉEL/.test(document.querySelector('.ag-micro').textContent) && /Intérêt ouvert\s*RÉEL/.test(document.querySelector('.ag-micro').textContent), { timeout: 120000 });
t = await txt();
verifier('après activation : financement RÉEL (taux, rang sur 90 jours) et intérêt ouvert RÉEL (BTC, variation)', /Financement\s*RÉEL[\s\S]*% \/ 8 h/.test(t) && /Intérêt ouvert\s*RÉEL[\s\S]*BTC/.test(t), t.slice(t.indexOf('Financement'), t.indexOf('Financement') + 250));
verifier('liquidations : ESTIMÉES (jamais « réelles »)', /Liquidations\s*ESTIMÉ/.test(t) && !/Liquidations\s*RÉEL/.test(t));
verifier('indication « une seule plateforme »', /Une seule plateforme/.test(await ev(() => document.querySelector('.ag-derives')?.textContent || '')));
const appels = await ev(() => window.__appelsDeriv);
verifier('réseau : financement et archives zip appelés, aucun autre service', appels.some(a => a.endsWith('/fundingRate')) && appels.some(a => a.startsWith('zip:')) && appels.every(a => a.endsWith('/fundingRate') || a.startsWith('zip:') || a.startsWith('/futures/data/')), appels.slice(0, 5).join());

// voix
const voix = p => ev(p => window.commandeMars(p), p);
let r = await voix('explique l’absorption');
verifier('voix : « explique l’absorption » (mécanisme + état en cours)', /absorption/i.test(r) && /En ce moment/.test(r), r.slice(0, 160));
r = await voix('quelle session est en cours ?');
verifier('voix : « quelle session est en cours ? »', /La session en cours est (Asie|Londres|New York|creux)/.test(r), r.slice(0, 160));
r = await voix('où sont les zones de liquidité ?');
verifier('voix : « où sont les zones de liquidité ? » (zones probables, pas certaines)', /Bitcoin à/.test(r) && /pas certaines|probables/.test(r), r.slice(0, 200));
r = await voix('c’est quoi le funding');
verifier('voix : « c’est quoi le funding » avec la valeur réelle', /financement/i.test(r) && /pour cent/.test(r) && /réelle|Donnée réelle/.test(r), r.slice(0, 220));
r = await voix('explique les liquidations');
verifier('voix : liquidations = indice estimé, jamais réel', /estim/i.test(r) && /aucune donnée réelle|pas une donnée réelle|Rien n’est affiché comme réel|donnée complète gratuite/.test(r), r.slice(0, 260));
r = await voix('explique le balayage de liquidité');
verifier('voix : le balayage ne prétend pas qu’un acteur manipule', /balayage/i.test(r) && /ne prouve pas|pas qu.un acteur/.test(r) && !/manipul/i.test(r));
verifier('voix : phrases étrangères ignorées', (await voix('quelle heure est-il')) == null && (await voix('explique la recette de la quiche')) == null);
const filtrees = erreurs.filter(e => !/Failed to load resource|net::ERR|workers\.dev|faireconomy/.test(e));
verifier('aucune erreur JavaScript', filtrees.length === 0, filtrees.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(fin() ? 1 : 0);
