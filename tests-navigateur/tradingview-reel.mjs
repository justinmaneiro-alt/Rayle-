import fs from 'node:fs';
import { ouvrirGalaxie, entrerSurMars, attendreMode, attendre } from './mars-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* M2a-bis, point d : le VRAI widget TradingView (script tv.js chargé depuis les serveurs de TradingView, réseau réel) dans la grande fenêtre de Mars.
   Pour chaque instrument : iframe créée ? adresse de l'iframe ? capture. Rien n'est simulé côté TradingView. Les données du terminal Raylé viennent du faux Worker (sans importance ici).
   Navigateur : Chrome par défaut ; CHROME="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" pour Edge (le moteur de l'application PC).
   Écrit captures-mars/tv-reel-<nom>.png et un résumé sur la sortie. */
const SORTIE = 'captures-mars/'; fs.mkdirSync(SORTIE, { recursive: true });
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900, etiquette = process.env.ETIQUETTE || 'chrome';
const worker = await demarrerFauxWorkerMarche(8797);
const injecter = async p => { await p.evaluateOnNewDocument(u => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', u); localStorage.setItem('rayle_worker_token', 'test'); localStorage.removeItem('rayle_mars_trading'); }, worker.url); };
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: L, hauteur: H, avant: injecter });
const ev = (f, ...a) => page.evaluate(f, ...a);
const bilan = [];
await ev(() => window.Galaxie.regler({ qualite: 'haute', fpsMax: 0 }));
await entrerSurMars(page);
await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur', 40000);
await ev(() => window.Mars.placerInterieur({ yaw: 0, pitch: -0.06, avancee: 0.3 })); await attendre(2500);
await ev(() => window.Mars.ouvrirFenetre('graphique-us100'));
const etat = async () => ev(() => { const z = document.querySelector('.tg-zone-tv'), f = z && z.querySelector('iframe'); return { iframe: !!f, src: f ? f.src.slice(0, 160) : null, largeur: f ? f.offsetWidth : 0, hauteur: f ? f.offsetHeight : 0, message: z ? (z.querySelector('.tg-etat') || {}).textContent || null : null, api: !!(window.TradingView && window.TradingView.widget), tv: window.Mars.espaceApi().tv().etat() }; });
const attendreIframe = async (max = 25000) => { const t0 = Date.now(); let e; while (Date.now() - t0 < max) { e = await etat(); if (e.iframe && e.largeur > 300) return e; if (e.message) return e; await attendre(500); } return e; };
const cas = [['US100', 'H1'], ['XAU', 'H1'], ['BTC', 'M15'], ['SOL', 'H4'], ['EUR', 'D1'], ['US100', 'M15']];
for (const [ins, u] of cas) {
  await ev((i, x) => { window.Mars.espaceApi().choisirInstrument(i); window.Mars.espaceApi().choisirUnite(x); }, ins, u);
  const e = await attendreIframe(); await attendre(9000);   // laisse le widget dessiner ses bougies et ses études
  const nom = ins + '-' + u; await page.screenshot({ path: SORTIE + 'tv-reel-' + etiquette + '-' + nom + '.png' });
  const frames = page.frames().filter(f => /tradingview/.test(f.url())).length;
  bilan.push({ cas: nom, iframe: e.iframe, taille: e.largeur + 'x' + e.hauteur, src: e.src, framesTradingView: frames, message: e.message, symbole: e.tv && e.tv.symbole, intervalle: e.tv && e.tv.intervalle, pret: e.tv && e.tv.pret, erreur: e.tv && e.tv.erreur });
  console.log(JSON.stringify(bilan[bilan.length - 1]));
}
console.log('erreurs de la page :', erreurs.filter(x => !/faireconomy|404|Failed to load/.test(x)).slice(0, 6).join(' | ') || 'aucune');
await navigateur.close(); await worker.fermer();
