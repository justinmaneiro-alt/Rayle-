import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
/* Non-régression du bug « cadre TradingView vide » (V3 phase 1) : réseau RÉEL.
   1. Terminal 2D : 5 actifs × 5 unités, le widget DOIT envoyer ses messages de démarrage et remplir le cadre ; jamais de message de secours.
   2. Même chose en émulation tablette (tactile, 1180×820).
   3. Script tv.js bloqué, ou cadre muet (widgetembed vide) : le message de secours visible apparaît (délai raccourci par __TV_DELAI_MS__).
   Un cadre qui reste vide plus de N secondes fait ÉCHOUER le test. */
const T = compteur();
const NAV = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
async function ouvrir({ largeur = 1600, hauteur = 900, tablette = false, delai = 0, intercepter = null } = {}) {
  const page = await NAV.newPage(); const erreurs = [];
  await page.setViewport({ width: largeur, height: hauteur, hasTouch: tablette, isMobile: tablette, deviceScaleFactor: tablette ? 2 : 1 });
  page.on('pageerror', e => erreurs.push(e.message));
  if (intercepter) { await page.setRequestInterception(true); page.on('request', r => intercepter(r)); }
  await page.evaluateOnNewDocument((d) => {
    localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_terminal_prefs', JSON.stringify({ source: 'tradingview' })); if (d) window.__TV_DELAI_MS__ = d;
    window.__tvMsg = 0; window.addEventListener('message', e => { if (/tradingview/.test(e.origin) && e.data && (e.data.name === 'tv-widget-load' || (typeof e.data === 'string' && /tv-widget-load/.test(e.data)))) window.__tvMsg++; });
  }, delai);
  await page.goto(BASE + '/index.html#terminal', { waitUntil: 'load' });
  await page.waitForSelector('#tabs button', { timeout: 20000 }); await attendre(500);
  return { page, erreurs };
}
const cliquerTexte = (page, sel, texte) => page.evaluate((s, t) => { const b = [...document.querySelectorAll(s)].find(x => x.textContent.trim() === t); if (b) b.click(); return !!b; }, sel, texte);
async function etatCadre(page) { return page.evaluate(() => { const b = document.getElementById('tv-chart'), f = b && b.querySelector('iframe'), r = f && f.getBoundingClientRect(), br = b.getBoundingClientRect(); return { iframe: !!f, l: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, bl: Math.round(br.width), bh: Math.round(br.height), secours: !!b.querySelector('.tv-secours'), msg: window.__tvMsg }; }); }
async function attendreWidget(page, avant, max = 25000) { const t0 = Date.now(); while (Date.now() - t0 < max) { const e = await etatCadre(page); if (e.msg > avant && e.iframe) return e; if (e.secours) return e; await attendre(300); } return etatCadre(page); }
const ACTIFS = ['NASDAQ', 'BITCOIN', 'SOLANA', 'OR', 'EUR/USD'], UNITES = ['M5', 'M15', 'H1', 'H4', 'D1'];

for (const [nom, tab] of [['PC', false], ['tablette émulée', true]]) {
  const { page, erreurs } = await ouvrir(tab ? { largeur: 1180, hauteur: 820, tablette: true } : {});
  let e = await attendreWidget(page, 0);
  T.verifier(`${nom} : premier affichage — le widget démarre`, e.msg > 0 && !e.secours, JSON.stringify(e));
  for (const a of ACTIFS) {
    for (const u of (tab ? ['H1'] : UNITES)) {
      const avant = (await etatCadre(page)).msg;
      await cliquerTexte(page, '#tabs button', a); await cliquerTexte(page, '#ivs button', u);
      e = await attendreWidget(page, avant);
      const plein = e.l >= e.bl * 0.9 && e.h >= e.bh * 0.9 && e.l > 300;
      T.verifier(`${nom} : ${a} ${u} — widget démarré, cadre rempli, pas de secours`, e.msg > avant && !e.secours && plein, `iframe ${e.l}×${e.h} dans ${e.bl}×${e.bh}`);
    }
  }
  T.verifier(`${nom} : aucune erreur JavaScript`, erreurs.length === 0, erreurs.join(' | '));
  await page.close();
}
/* Script tv.js bloqué */
{
  const { page } = await ouvrir({ delai: 4000, intercepter: r => /s3\.tradingview\.com\/tv\.js/.test(r.url()) ? r.abort() : r.continue() });
  await attendre(1500); const e = await etatCadre(page);
  T.verifier('script bloqué : message de secours visible', e.secours);
  const lien = await page.evaluate(() => { const a = document.querySelector('#tv-chart .tv-secours a'); return a ? a.href : ''; });
  T.verifier('script bloqué : lien « nouvel onglet » vers tradingview.com avec le symbole', /^https:\/\/www\.tradingview\.com\/chart\/\?symbol=CAPITALCOM%3AUS100&interval=60$/.test(lien), lien);
  await page.close();
}
/* Cadre muet : le script charge, mais la page du widget est vide (aucun message envoyé) */
{
  const { page } = await ouvrir({ delai: 4000, intercepter: r => /s\.tradingview\.com\/widgetembed/.test(r.url()) ? r.respond({ status: 200, contentType: 'text/html', body: '<html><body style="background:#ddd"></body></html>' }) : r.continue() });
  await attendre(7000); const e = await etatCadre(page);
  T.verifier('cadre muet (gris, sans message) : message de secours visible après le délai', e.secours && e.iframe, JSON.stringify(e));
  const visible = await page.evaluate(() => { const s = document.querySelector('#tv-chart .tv-secours'); if (!s) return false; const r = s.getBoundingClientRect(); return r.width > 200 && r.height > 100 && /n.a pas pu se charger/.test(s.textContent); });
  T.verifier('cadre muet : le message est lisible (taille et texte)', visible);
  await page.evaluate(() => document.querySelector('#tv-chart .tv-secours [data-a=alt]').click()); await attendre(800);
  T.verifier('« Graphique Raylé » du message de secours bascule sur le graphique Raylé', await page.evaluate(() => document.querySelector('#srcSw button[data-src=rayle]').classList.contains('actif')));
  await page.close();
}
await NAV.close();
process.exit(T.fin() ? 1 : 0);
