import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';
import { compteur } from './terre-aide.mjs';
/* Non-régression V3 phase 1 : TradingView dans la fenêtre du terminal de Mars (réseau RÉEL pour TradingView, faux Worker pour le reste), mode V2 par défaut.
   Pour 5 actifs : le widget démarre (message reçu), pas de message de secours, et le graphique REMPLIT le cadre (constaté : sans correctif, le graphique n'en occupait que les deux tiers).
   À lancer avec : node --import ./tests-navigateur/theme-jarvis-hook.mjs tests-navigateur/tradingview-mars-test.mjs */
const T = compteur();
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); localStorage.removeItem('rayle_mars_trading');
  window.__tvMsg = 0; window.addEventListener('message', e => { if (/tradingview/.test(e.origin) && e.data && e.data.name === 'tv-widget-load') window.__tvMsg++; }); }, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 })); await attendre(2000);
await ev(() => window.Mars.ouvrirEspaceComplet({ instrument: 'US100', unite: 'H1', source: 'tv' })); await attendre(1500);
/* Part du cadre où se trouvent des pixels « de graphique » (couleurs distinctes) : on prend le tiers droit de l'iframe, hors axe des prix. */
async function remplissage() {
  const r = await ev(() => { const f = document.querySelector('.tg-zone-tv iframe'); const b = f && f.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; });
  if (!r) return null;
  const png = await page.screenshot({ clip: { x: r.x + r.w * 0.55, y: r.y + r.h * 0.12, width: r.w * 0.25, height: r.h * 0.5 }, encoding: 'base64' });
  return ev(async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); return set.size; }, png);
}
for (const [ins, u] of [['US100', 'H1'], ['XAU', 'H1'], ['BTC', 'M15'], ['SOL', 'H4'], ['EUR', 'D1']]) {
  const premier = ins === 'US100'; const avant = premier ? 0 : await ev(() => window.__tvMsg);
  await ev((i, x) => { window.Mars.espaceApi().choisirInstrument(i); window.Mars.espaceApi().choisirUnite(x); }, ins, u);
  const t0 = Date.now(); while (Date.now() - t0 < 25000 && (await ev(() => window.__tvMsg)) <= avant) await attendre(300);
  await attendre(4500);   // laisse le widget dessiner, puis le correctif de taille agir
  const s = await ev(() => ({ secours: !!document.querySelector('.tg-zone-tv .tv-secours'), msg: window.__tvMsg }));
  const couleurs = await remplissage();
  T.verifier(`Mars : ${ins} ${u} — widget démarré, pas de message de secours`, s.msg > avant && !s.secours);
  T.verifier(`Mars : ${ins} ${u} — le graphique remplit le cadre (tiers droit non vide)`, couleurs !== null && couleurs > 25, 'couleurs distinctes : ' + couleurs);
}
T.verifier('Mars : aucune erreur JavaScript', erreurs.filter(x => /^pageerror/.test(x)).length === 0, erreurs.slice(0, 3).join(' | '));
await navigateur.close(); await worker.fermer();
process.exit(T.fin() ? 1 : 0);
