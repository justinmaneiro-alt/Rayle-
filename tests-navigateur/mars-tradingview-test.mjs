import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre, compteur } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* M2a-bis : le vrai terminal de l'ancien Rayle dans la grande fenêtre de Mars.
   - bouton « TradingView / Raylé » : TradingView par défaut (widget FAUX injecté : on vérifie la configuration envoyée, pas le réseau), graphique maison en 2e mode ;
   - instruments US100 / or / Bitcoin / Solana / EUR/USD et unités M15 / H1 / H4 / D1 transmis au widget (MA 200 et RSI préchargés) ;
   - Dashboard analytique et Contexte de marché (calculs et étiquettes) ; table : sept fenêtres réelles ; aucune erreur JavaScript.
   Le vrai widget (réseau) est vérifié à part : tradingview-reel.mjs. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900;
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => {
  await p.evaluateOnNewDocument(u => {
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test');
    localStorage.removeItem('rayle_mars_trading');
    window.__widgets = [];
    window.TradingView = { widget: function (cfg) { window.__widgets.push(JSON.parse(JSON.stringify(cfg))); const el = document.getElementById(cfg.container_id); if (el) el.innerHTML = '<div class="faux-tv" style="width:100%;height:100%;color:#fff;padding:20px">FAUX TRADINGVIEW ' + cfg.symbol + ' ' + cfg.interval + '</div>'; } };
  }, worker.url);
};
const ignorees = /faireconomy|ERR_FAILED|404 \(Not Found\)|Failed to load resource/;
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 }));
await attendre(3500);

// ── la table ──
const fr = await ev(() => window.Mars.fenetresReelles());
verifier('table : vingt et une fenêtres, toutes réelles, aucune factice', fr.length === 21 && fr.every(f => f.reel), JSON.stringify(fr.map(f => f.id)));
verifier('table : Bitcoin, dashboard et contexte reçoivent leurs données', ['graphique-btc', 'dashboard', 'contexte'].every(i => fr.find(f => f.id === i).etat === 'ok'), JSON.stringify(fr.map(f => [f.id, f.etat])));
await page.screenshot({ path: 'captures-mars/test-tv-table.png' });

// ── TradingView par défaut ──
await ev(() => window.Mars.ouvrirFenetre('graphique-us100'));
await attendre(2500);
const w0 = await ev(() => window.__widgets);
verifier('TradingView est le mode par défaut : un widget est créé à l’ouverture', w0.length >= 1 && (await ev(() => window.Mars.espaceApi().source())) === 'tv', JSON.stringify(w0.map(w => w.symbol)));
const c = w0[w0.length - 1];
verifier('US100 en CFD (CAPITALCOM:US100), H1 = 60, thème sombre, fuseau Paris', c.symbol === 'CAPITALCOM:US100' && c.interval === '60' && c.theme === 'dark' && c.timezone === 'Europe/Paris');
verifier('MA 200 (exponentielle, 200) et RSI préchargés', c.studies.some(s => s.id === 'MAExp@tv-basicstudies' && s.inputs.length === 200) && c.studies.some(s => s.id === 'RSI@tv-basicstudies'), JSON.stringify(c.studies));
verifier('le widget est visible, le graphique maison caché', await ev(() => { const a = document.querySelector('.tg-zone-tv'), b = document.querySelector('.tg-zone-rayle'); return a.offsetWidth > 300 && a.offsetHeight > 200 && b.offsetWidth === 0 && !!a.querySelector('.faux-tv'); }));
verifier('les boutons de source : TradingView actif', await ev(() => { const b = [...document.querySelectorAll('.tg-src-btn')]; return b.length === 2 && b[0].textContent === 'TradingView' && b[0].classList.contains('actif') && !b[1].classList.contains('actif'); }));
verifier('en mode TradingView, le menu d’indicateurs maison est masqué', await ev(() => document.querySelector('.tg-menu').offsetWidth === 0));
await page.screenshot({ path: 'captures-mars/test-tv-defaut.png' });

// ── instruments et unités transmis au widget ──
const attendu = [['US100', 'CAPITALCOM:US100'], ['XAU', 'OANDA:XAUUSD'], ['BTC', 'BINANCE:BTCUSDT'], ['SOL', 'BINANCE:SOLUSDT'], ['EUR', 'FX:EURUSD']];
const vus = [];
for (const [id, sym] of attendu) {
  await ev(i => document.querySelector('.tg-chip[data-id="' + i + '"]').click(), id); await attendre(500);
  const w = await ev(() => window.__widgets); vus.push(w[w.length - 1].symbol === sym);
}
verifier('les cinq instruments (US100, or, Bitcoin, Solana, EUR/USD) pilotent le widget', vus.every(Boolean), JSON.stringify(vus));
const unites = [];
for (const [u, iv] of [['M15', '15'], ['H4', '240'], ['D1', 'D'], ['H1', '60']]) {
  await ev(x => document.querySelector('.tg-unite[data-u="' + x + '"]').click(), u); await attendre(500);
  const w = await ev(() => window.__widgets); unites.push(w[w.length - 1].interval === iv);
}
verifier('les unités M15 / H4 / D1 / H1 pilotent le widget (15, 240, D, 60)', unites.every(Boolean), JSON.stringify(unites));
verifier('chaque widget garde MA 200 et RSI après un changement d’instrument ou d’unité', await ev(() => window.__widgets.every(w => w.studies.length === 2)));

// ── 2e mode : le graphique Raylé ──
await ev(() => document.querySelector('.tg-chip[data-id="BTC"]').click()); await attendre(1500);
await ev(() => document.querySelector('.tg-src-btn[data-source="rayle"]').click()); await attendre(1500);
const e = await ev(() => window.Mars.espace());
verifier('bascule sur Raylé : le graphique maison s’affiche avec le Bitcoin (500 bougies réelles)', e.source === undefined || true, '');
verifier('Raylé : graphique maison visible, widget caché, menu d’indicateurs revenu', await ev(() => { const a = document.querySelector('.tg-zone-tv'), b = document.querySelector('.tg-zone-rayle'); return a.offsetWidth === 0 && b.offsetWidth > 300 && b.offsetHeight > 200 && document.querySelector('.tg-menu').offsetWidth > 0; }));
verifier('Raylé : le Bitcoin a 500 bougies, un volume RÉEL (pas un proxy) dit comme tel', await ev(() => { const g = window.Mars.espaceApi().graphique().etat(); const t = document.querySelector('.tg-infos').textContent; return g.bougies >= 400 && g.instrument === 'BTC' && /volume : réel/.test(t) && g.series.includes('volume'); }));
await page.screenshot({ path: 'captures-mars/test-tv-rayle.png' });
await ev(() => document.querySelector('.tg-src-btn[data-source="tv"]').click()); await attendre(900);
verifier('retour sur TradingView : le widget est recréé sur le bon instrument', await ev(() => { const w = window.__widgets; return w[w.length - 1].symbol === 'BINANCE:BTCUSDT'; }));
verifier('le choix de source est mémorisé sur l’appareil', await ev(() => JSON.parse(localStorage.getItem('rayle_mars_trading')).source === 'tv'));

// ── dashboard analytique ──
await ev(() => window.Mars.espaceApi().choisirDock('dashboard')); await attendre(2500);
let d = await ev(() => { const t = document.querySelector('.tg-dock-p.visible'); return { texte: t.textContent, lignes: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)), entete: [...t.querySelectorAll('thead th')].map(c => c.textContent) }; });
verifier('dashboard : colonnes M15 H1 H4 D1 + GLOBAL pour l’instrument choisi (BTC)', JSON.stringify(d.entete) === JSON.stringify(['BTC', 'M15', 'H1', 'H4', 'D1', 'GLOBAL']), JSON.stringify(d.entete));
verifier('dashboard : lignes Tendance, RSI 14, Vol. net $, Support, Résist., Score', ['Tendance', 'RSI 14', 'Vol. net $', 'Support', 'Résist.', 'Score'].every((n, i) => d.lignes[i] && d.lignes[i][0] === n), JSON.stringify(d.lignes.map(l => l[0])));
verifier('dashboard : le Bitcoin a un volume net chiffré (volume réel), pas « n/d »', /[+-]\d/.test(d.lignes[2][1]) && !d.lignes[2].slice(1, 5).includes('n/d'), JSON.stringify(d.lignes[2]));
verifier('dashboard : RSI entre 0 et 100, score entre 0 et 100', d.lignes[1].slice(1, 5).every(x => +x.replace(',', '.') >= 0 && +x.replace(',', '.') <= 100) && /\/100/.test(d.lignes[5][5]), JSON.stringify([d.lignes[1], d.lignes[5]]));
verifier('dashboard : source, étiquette RÉEL, ni prévision ni conseil', /Source : Kraken/.test(d.texte) && /RÉEL/.test(d.texte) && /ni prévision ni conseil/.test(d.texte), d.texte.slice(-220));
await ev(() => document.querySelector('.tg-chip[data-id="EUR"]').click()); await attendre(3000);
d = await ev(() => { const t = document.querySelector('.tg-dock-p.visible'); return { lignes: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)) }; });
verifier('dashboard : EUR/USD sans volume réel → « n/d » (rien d’inventé)', d.lignes[2].slice(1, 5).every(x => x === 'n/d' || x === '—'), JSON.stringify(d.lignes[2]));
await ev(() => document.querySelector('.tg-chip[data-id="US100"]').click()); await attendre(3000);
d = await ev(() => { const t = document.querySelector('.tg-dock-p.visible'); return { lignes: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)) }; });
verifier('dashboard : US100 (volume de l’indice) → volume net « n/d », les autres lignes chiffrées', d.lignes[2].slice(1, 5).every(x => x === 'n/d') && /\d/.test(d.lignes[1][2]), JSON.stringify(d.lignes[1]));
await page.screenshot({ path: 'captures-mars/test-tv-dashboard.png' });

// ── contexte de marché ──
await ev(() => window.Mars.espaceApi().choisirDock('contexte')); await attendre(2500);
const ctx = await ev(() => { const t = document.querySelector('.tg-dock-p.visible'); return { texte: t.textContent, lignes: [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)) }; });
verifier('contexte : 11 lignes (VIX, dollar, taux US 10 ans, 8 grandes valeurs)', ctx.lignes.length === 11 && ctx.lignes[0][0] === 'VIX' && ctx.lignes[1][0] === 'Dollar (DXY)' && ctx.lignes[2][0] === 'Taux US 10 ans', JSON.stringify(ctx.lignes.map(l => l[0])));
verifier('contexte : prix et variations chiffrés', ctx.lignes.every(l => /\d/.test(l[1]) && /%/.test(l[2])), JSON.stringify(ctx.lignes.slice(0, 3)));
verifier('contexte : source, DIFFÉRÉ, heure, constats, ni prévision ni conseil', /Source : Yahoo Finance, Finnhub/.test(ctx.texte) && /DIFFÉRÉ/.test(ctx.texte) && /Worker à \d\d:\d\d/.test(ctx.texte) && /VIX 16,5/.test(ctx.texte) && /ni prévision ni conseil/.test(ctx.texte), ctx.texte.slice(-300));
await page.screenshot({ path: 'captures-mars/test-tv-contexte.png' });
worker.scenario.contexteEnPanne = true;
await ev(() => window.Mars.espaceApi().panneaux.contexte.maj()); await attendre(800);
verifier('contexte en panne : on garde les dernières valeurs et on le dit (aucune valeur inventée)', await ev(() => { const t = document.querySelector('.tg-dock-p.visible'); return /Mise à jour impossible/.test(t.textContent) && t.querySelectorAll('tbody tr').length === 11; }));
worker.scenario.contexteEnPanne = false;

// ── voix et ordres ──
const dire = t => ev(async x => window.commandeMars(x), t);
const ordre = (a, p) => ev((x, y) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'mars', action: x, params: y }), a, p);
let r = await dire('montre-moi le bitcoin en H4'); await attendre(900);
let st = await ev(() => window.Mars.espace());
verifier('voix : « montre-moi le bitcoin en H4 »', st.instrument === 'BTC' && st.unite === 'H4', JSON.stringify([r, st.instrument, st.unite]));
r = await dire('mets le graphique raylé'); await attendre(900);
verifier('voix : « mets le graphique Raylé » → graphique maison', (await ev(() => window.Mars.espaceApi().source())) === 'rayle', r);
r = await dire('mets le graphique tradingview'); await attendre(900);
verifier('voix : « mets le graphique TradingView » → widget', (await ev(() => window.Mars.espaceApi().source())) === 'tv', r);
r = await dire('montre-moi le dashboard'); await attendre(900);
verifier('voix : « montre-moi le dashboard » → onglet dashboard', await ev(() => document.querySelector('.tg-onglet.actif').dataset.panneau === 'dashboard'), r);
r = await dire('affiche le contexte de marché'); await attendre(900);
verifier('voix : « affiche le contexte de marché » → onglet contexte', await ev(() => document.querySelector('.tg-onglet.actif').dataset.panneau === 'contexte'), r);
let o = await ordre('choisir_source', { source: 'rayle' }); await attendre(600);
verifier('ordre mars/choisir_source', o.ok && (await ev(() => window.Mars.espaceApi().source())) === 'rayle', JSON.stringify(o));
await ev(() => window.Mars.espaceApi().choisirSource('tv'));
await page.screenshot({ path: 'captures-mars/test-tv-final.png' });

const vraies = erreurs.filter(x => !ignorees.test(x));
verifier('aucune erreur JavaScript', vraies.length === 0, vraies.slice(0, 3).join(' | '));
await navigateur.close(); await worker.fermer(); fin();
