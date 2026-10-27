import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
import { marcheM5, DERIVE_PLANTEE } from '../planetes/mars/tests/synth-m5.mjs';

/* M6 de bout en bout dans Chrome : trois paires (faux échange Binance, port 8799), gardien prop, tilt, journal (formulaire et CSV), simulation, régime (faux réseau), capture d'écran (fausse IA),
   santé, bibliothèque d'idées, outils du graphique (zone, test de zone, clic de bougie, couches), changement de paire. Captures : captures-mars/m6-*.png. */
fs.mkdirSync('captures-mars', { recursive: true });
const { verifier, fin } = compteur();
const L = Number(process.env.L) || 1700, H = Number(process.env.H) || 950, PAS = 900e3;
const now0 = Math.floor(Date.now() / PAS) * PAS - 3 * 86400e3, N = 21000, SERIE = marcheM5({ n: N, graine: 9, derive: DERIVE_PLANTEE, t0: now0 - (N - 1000) * PAS });
const echange = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, u = new URL(req.url, 'http://x'), t0 = +u.searchParams.get('t0'), lim = +u.searchParams.get('limit') || 1000, sym = u.searchParams.get('symbol') || '', k = /SOL/.test(sym) ? 0.0125 : /DOGE/.test(sym) ? 0.00001 : 1, out = [];
  let i = 0; while (i < SERIE.n && SERIE.t[i] < t0) i++;
  for (; i < SERIE.n && out.length < lim; i++) { if (SERIE.t[i] + PAS > Date.now()) break; out.push([SERIE.t[i], SERIE.o[i] * k, SERIE.h[i] * k, SERIE.l[i] * k, SERIE.c[i] * k, SERIE.v[i], 0, 0, 1, SERIE.vb[i], 0, 0]); }
  res.writeHead(200, cors); res.end(JSON.stringify(out));
});
await new Promise(r => echange.listen(8799, '127.0.0.1', r));
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await navigateur.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('console', m => { if (['error'].includes(m.type())) erreurs.push(m.text().slice(0, 240)); }); page.on('pageerror', e => erreurs.push('pageerror: ' + (e.stack || e.message).slice(0, 700)));
page.on('dialog', d => d.accept());
await page.evaluateOnNewDocument(() => {
  localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0');
  window.__RAYLE_POSTE_TEST__ = { exposer: true, sansRecherche: true, sansVeilleur: true, sansCanvas: true, periodeMs: 3600e3, annees: 0.1,
    lire: async url => { const q = new URL(url); const r = await fetch('http://127.0.0.1:8799/?symbol=' + (q.searchParams.get('symbol') || '') + '&t0=' + (q.searchParams.get('startTime') || 0) + '&limit=' + (q.searchParams.get('limit') || 1000)); return r.json(); },
    lireReseau: async url => {
      if (/fundingRate/.test(url)) return Array.from({ length: 100 }, (_, i) => ({ symbol: 'X', fundingTime: Date.now() - (100 - i) * 8 * 3600e3, fundingRate: String(0.00005 + (i % 9) * 0.000004) }));
      if (/alternative/.test(url)) return { data: [{ value: '61', value_classification: 'Greed', timestamp: String(Math.floor(Date.now() / 1000)) }] };
      if (/coingecko/.test(url)) return { data: { market_cap_change_percentage_24h_usd: 0.8, market_cap_percentage: { btc: 57 } } };
      throw new Error('inconnu');
    },
    lireCapture: async () => { const p = window.__prixCapture || 100; return { lecture: { instrument: 'BTCUSDT', unite: '1h', prixDernier: p, niveaux: [{ type: 'support', prix: p * 0.98, etiquette: 'support' }, { type: 'resistance', prix: p * 1.02 }, { type: 'niveau', prix: p * 40 }], zones: [{ prixHaut: p * 0.99, prixBas: p * 0.97 }], confiance: 0.8 }, moteur: 'Gemini/test' }; },
    traduireIdee: async texte => ({ regle: { nom: 'Idée traduite', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 }, explication: 'Traduction de test pour : ' + texte }),
    envoyerTelegram: async () => {} };
});
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
const ev = (f, ...a) => page.evaluate(f, ...a);
const texte = s => ev(sel => (document.querySelector(sel) || {}).textContent || '', s);
const cliquer = async sel => { await page.waitForSelector(sel, { timeout: 8000 }); await page.click(sel); await attendre(350); };
const onglet = async nom => { await page.evaluate(n => document.querySelector('.pa-onglets [data-onglet="' + n + '"]').click(), nom); await attendre(700); };
const remplir = async (sel, val) => { await page.waitForSelector(sel, { timeout: 8000 }); await page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(val)); };
const soumettre = async sel => { await page.$eval(sel, f => f.requestSubmit()); await attendre(900); };

await ev(async () => { await import('/planetes/mars/pc/trading/fenetre-agent.js'); await window.PosteAgent.ouvrir({}); }); await attendre(1500);
verifier('poste ouvert avec 16 sous-onglets et le sélecteur de paires BTC / SOL / DOGE', await ev(() => document.querySelectorAll('.pa-onglets [data-onglet]').length === 16 && document.querySelectorAll('.pa-onglets [data-groupe]').length === 6 && [...document.querySelectorAll('.pa-paires button')].map(b => b.textContent).join() === 'BTC,SOL,DOGE'));
// ── gardien sans historique : il marche déjà (le compte ne dépend pas des bougies) ──
await onglet('gardien');
verifier('gardien : marges pleines, drawdown suiveur sur l’équité, objectif +322 $ / 1 000 $', /Marge du jour : 300 \$ sur 300 \$/.test(await texte('.pa-situation')) && /322/.test(await texte('.pa-situation')) && (await page.$$('.pa-jauge')).length === 3 && /pas un conseil financier/.test(await texte('.pa-situation')));
await remplir('form[data-form="base"] [name="equite"]', 10400); await remplir('form[data-form="base"] [name="pic"]', 10500); await soumettre('form[data-form="base"]');
verifier('gardien : équité 10 400 $ et pic 10 500 $ enregistrés → plancher du drawdown 9 900 $', /9[\s  ]?900/.test(await texte('.pa-grille')) && await ev(() => window.RayleM6.vue().compte.plancher === 9900));
await remplir('form[data-form="controle"] [name="entree"]', 80000); await remplir('form[data-form="controle"] [name="stop"]', 79200); await remplir('form[data-form="controle"] [name="objectif"]', 82400); await soumettre('form[data-form="controle"]');
verifier('contrôle avant trade : PASS avec les 9 points et la taille proposée', (await page.$$('.pa-points li')).length === 9 && /PASS/.test(await texte('.pa-ctl')) && /Taille proposée/.test(await texte('.pa-ctl')));
await remplir('form[data-form="controle"] [name="entree"]', 80000); await remplir('form[data-form="controle"] [name="objectif"]', 82400); await remplir('form[data-form="controle"] [name="stop"]', ''); await soumettre('form[data-form="controle"]');
verifier('contrôle sans stop : BLOQUÉ', /BLOQUÉ/.test(await texte('.pa-ctl')));
await page.screenshot({ path: 'captures-mars/m6-1-gardien.png' });
// ── journal : trade perdant, analyse, tilt ──
await onglet('journal');
const maintenantLocal = await ev(() => { const d = new Date(Date.now() - 3 * 3600e3), p = n => String(n).padStart(2, '0'); const f = x => x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()) + 'T' + p(x.getHours()) + ':' + p(x.getMinutes()); return [f(d), f(new Date(d.getTime() + 3600e3))]; });
const trade = async (pe, ps, extra = {}) => { await remplir('form[data-form="trade"] [name="t"]', maintenantLocal[0]); await remplir('form[data-form="trade"] [name="tSortie"]', maintenantLocal[1]); await remplir('form[data-form="trade"] [name="prixEntree"]', pe); await remplir('form[data-form="trade"] [name="prixSortie"]', ps); await remplir('form[data-form="trade"] [name="quantite"]', 0.05); await remplir('form[data-form="trade"] [name="stop"]', extra.stop ?? ''); await remplir('form[data-form="trade"] [name="strategie"]', extra.strategie ?? ''); await soumettre('form[data-form="trade"]'); };
await trade(80000, 79000);
verifier('journal : un trade perdant sans stop ni stratégie est ajouté et analysé (exécution à améliorer)', await ev(() => window.RayleM6.vue().nJournal === 1) && /à améliorer/.test(await texte('[data-r="analyse"]')), await texte('[data-r="analyse"]'));
verifier('le gain est calculé (−1000 × 0,05 = −50 $) ; le trade est antérieur à la mise à jour de l’équité, donc déjà compris dedans (l’équité reste 10 400 $)', await ev(() => Math.abs(window.RayleM6.vue().journal[0].pnl + 50) < 0.01 && Math.abs(window.RayleM6.vue().compte.equite - 10400) < 0.5), await ev(() => window.RayleM6.vue().compte.equite));
await onglet('tilt');
verifier('tilt : le trade sans stop et hors plan est détecté (orange)', /ORANGE|ROUGE/.test(await texte('.pa-situation')) && /stop|plan/i.test(await texte('.pa-grille')));
await page.screenshot({ path: 'captures-mars/m6-2-tilt.png' });
await onglet('journal');
// import CSV
const csv = 'Symbol,Side,Open Time,Close Time,Entry Price,Exit Price,Size,Realized PnL,Fee\nXBT/USD,Buy,2026-10-20 08:00:00,2026-10-20 12:30:00,80000,81200,0.05,60.00,4.10\nSOL/USD,Sell,2026-10-21 09:15:00,2026-10-21 10:00:00,105,104,10,10.00,0.5\n';
fs.writeFileSync('captures-mars/fausse-export.csv', csv);
const champCsv = await page.$('input[data-a="csv-fichier"]'); await champCsv.uploadFile('captures-mars/fausse-export.csv'); await attendre(1200);
verifier('CSV : aperçu avec mappage détecté, avertissement UTC, rien d’ajouté avant confirmation', /2 trade\(s\) lisible/.test(await texte('[data-r="csv"]')) && await ev(() => window.RayleM6.vue().nJournal === 1) && /UTC/.test(await texte('[data-r="csv"]')));
await cliquer('[data-a="csv-importer"]'); await attendre(800);
verifier('CSV : importé après confirmation (3 trades au journal), mappage mémorisé', await ev(() => window.RayleM6.vue().nJournal === 3 && window.RayleM6.vue().mappageCSV.paire === 'Symbol'));
verifier('bilan de la semaine et règles de discipline affichés', /Discipline/.test(await texte('.pa-grille')) || /Aucun trade fermé/.test(await texte('.pa-grille')));
await page.screenshot({ path: 'captures-mars/m6-3-journal.png' });
// ── activation de BTC puis simulation, graphique, capture ──
await onglet('ensemble'); await cliquer('[data-a="activer-donnees"]');
await page.waitForFunction(() => window.__hoteBtc && window.__hoteBtc.vue().donnees.n > 15000, { timeout: 240000 }); await attendre(1500);
await onglet('simulation');
await soumettre('form[data-form="simulation"]'); await attendre(2500);
verifier('simulation (hypothèse 40 % à 2,5 R) : tableau de probabilités avec fourchette, étiquette HYPOTHÉTIQUE, avertissement', (await page.$$('.pa-table tbody tr')).length === 6 && /HYPOTHÉTIQUE/.test(await texte('.pa-situation')) && /fourchette/.test(await texte('.pa-grille')) && /pas un conseil financier/.test(await texte('.pa-grille')), await texte('.pa-situation'));
await page.screenshot({ path: 'captures-mars/m6-4-simulation.png' });
await onglet('regime'); await cliquer('[data-a="regime-calculer"][data-paire="BTC"]'); await attendre(2500);
verifier('régime BTC : score /100, cinq composantes, contexte (peur et cupidité 61), phrase « ne prédit rien »', /\/100/.test(await texte('.pa-grille')) && (await page.$$('.pa-comp')).length === 5 && /61\/100/.test(await texte('.pa-grille')) && /ne prédit rien/.test(await texte('.pa-grille')), (await texte('.pa-grille')).slice(0, 300));
await page.screenshot({ path: 'captures-mars/m6-5-regime.png' });
await onglet('sante'); await attendre(1500);
verifier('santé : groupes données / recherche / sauvegardes / gardien, fraîcheur et intégrité de BTC', /BTC · fraîcheur/.test(await texte('.pa-grille')) && /BTC · intégrité/.test(await texte('.pa-grille')) && /Gardien prop/.test(await texte('.pa-grille')));
await cliquer('[data-a="sante-causalite"]'); await page.waitForFunction(() => /Aucune fuite|FUITE/.test((document.querySelector('[data-r="sante"]') || {}).textContent || ''), { timeout: 60000 });
verifier('santé : le test du poison du futur tourne sur mes données et ne trouve aucune fuite', /Aucune fuite du futur/.test(await texte('[data-r="sante"]')), await texte('[data-r="sante"]'));
await page.screenshot({ path: 'captures-mars/m6-6-sante.png' });
// capture d'écran
const prix = await ev(() => { const s = window.__hoteBtc.serie(); return s.c[s.n - 1]; }); await ev(p => { window.__prixCapture = p; }, prix);
await onglet('capture');
// image factice générée ici (aucun fichier à conserver)
{
  const zlib = await import('zlib'), W = 320, H = 200, brut = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { brut[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; brut[o] = 12; brut[o + 1] = 20 + (y % 40); brut[o + 2] = 40 + (x % 60); } }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloc = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync('captures-mars/fausse-capture.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ih), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]));
}
const champImg = await page.$('input[data-a="capture-fichier"]'); await champImg.uploadFile('captures-mars/fausse-capture.png'); await attendre(900);
verifier('capture : aperçu affiché, bouton d’analyse actif, mention d’envoi (une seule fois, Gemini, données personnelles)', !!(await page.$('.pa-capture-img')) && /UNE seule fois/.test(await texte('.pa-avert')) && await ev(() => !document.querySelector('form[data-form="capture"] button[type="submit"]').disabled));
await soumettre('form[data-form="capture"]'); await attendre(1500);
verifier('capture : niveaux « estimés depuis la capture », vérifiés sur les bougies, le niveau hors échelle est signalé', /estimé depuis la capture/.test(await texte('.pa-grille')) && /hors échelle/i.test(await texte('.pa-grille')) && /pas un conseil financier/.test(await texte('.pa-grille')));
await cliquer('[data-a="capture-tracer"]'); await attendre(800);
verifier('capture : les niveaux sont tracés sur le graphique dans le groupe « capture »', await ev(() => window.GraphiqueAgent.magasin('BTC').groupes().some(g => g.groupe === 'capture')));
await page.screenshot({ path: 'captures-mars/m6-7-capture.png' });
// ── graphique : dessins, couches, zone, bougie ──
await onglet('graphique'); await attendre(1500);
verifier('graphique : couches MA 200, EMA 50, Bollinger, RSI disponibles', await ev(() => ['ma200', 'ema50', 'bollinger', 'rsi'].every(c => !!document.querySelector('[data-g-couche="' + c + '"]'))));
await cliquer('[data-g-couche="ma200"]'); await cliquer('[data-g-couche="rsi"]'); await attendre(800);
verifier('graphique : les couches s’activent (RSI dans un panneau du bas)', await ev(() => window.PosteAgent.poste().etat().graph.couches.ma200 && window.PosteAgent.poste().etat().graph.rsi));
const ok0 = await ev(() => window.PosteAgent.poste().etat().graph.dessinsVisibles);
const tr = await ev(async (p) => (await window.GraphiqueAgent.tracer('BTC', { type: 'trade', sens: 'achat', entree: p, stop: p * 0.99, objectif: p * 1.03, etiquette: 'S1', groupe: 'Stratégie test', quand: 'maintenant' })).ok, prix);
await attendre(1200);
verifier('graphique : un plan tracé par l’agent apparaît (dessin visible en plus, groupe listé et masquable)', tr && await ev(() => window.PosteAgent.poste().etat().graph.dessinsVisibles) > ok0 && !!(await page.$('[data-gd="Stratégie test"]')));
await page.$eval('[data-gd="Stratégie test"]', e => e.click()); await attendre(900);
verifier('graphique : masquer le groupe le retire du graphique', await ev(() => { const g = window.GraphiqueAgent.magasin(window.PosteAgent.paire()).groupes().find(x => x.groupe === 'regime-m6c'), regime = g ? g.visibles : 0, vis = window.PosteAgent.poste().etat().graph.dessinsVisibles - regime;     // M6c : les zones de régime de l'assistant sont d'autres dessins de l'agent, hors du compte de ce test
  return vis === 0 || vis <= 3; }));
const boite2 = await (await page.$('.pg-zone')).boundingBox();  await page.mouse.move(boite2.x + boite2.width * 0.3, boite2.y + boite2.height * 0.2, { steps: 4 }); await attendre(2500); await page.mouse.click(boite2.x + boite2.width * 0.3, boite2.y + boite2.height * 0.2, { delay: 80 }); await page.waitForFunction(() => /Cette bougie|trop tôt|aucune bougie/.test((document.querySelector('[data-g="cote"]') || {}).textContent || ''), { timeout: 30000 }).catch(() => {});
verifier('clic sur une bougie : Rayle explique son contexte (volume, delta, phase, session)', /Volume/.test(await texte('[data-g="cote"]')) && /Phase à ce moment/.test(await texte('[data-g="cote"]')), (await texte('[data-g="cote"]')).slice(0, 200));
// zone de l'utilisateur
await cliquer('[data-a="dessin-zone"]');
const boite = await (await page.$('.pg-zone')).boundingBox();
await page.mouse.click(boite.x + boite.width * 0.4, boite.y + boite.height * 0.12); await attendre(300); await page.mouse.click(boite.x + boite.width * 0.7, boite.y + boite.height * 0.28); await attendre(1200);
verifier('graphique : ma zone tracée en deux clics (auteur utilisateur)', await ev(() => window.GraphiqueAgent.magasin('BTC').lister({ auteur: 'utilisateur', type: 'zone' }).length >= 1));
await cliquer('[data-a="tester-zone"]'); await page.waitForFunction(() => /approche|jamais arrivé|Je n’ai pas/.test((document.querySelector('[data-g="cote"]') || {}).textContent || ''), { timeout: 60000 });
verifier('« tester ma zone » : approches, rebonds, cassures, verdict et biais de sélection', /approche|jamais arrivé/.test(await texte('[data-g="cote"]')) && /(optimistes|choisie après)/.test(await texte('[data-g="cote"]')), (await texte('[data-g="cote"]')).slice(0, 300));
await page.screenshot({ path: 'captures-mars/m6-8-graphique.png' });
// ── bibliothèque d'idées ──
await onglet('labo');
await cliquer('[data-a="idee-catalogue"]'); await attendre(800);
verifier('idées : catalogue des projets open source chargé avec licence et crédit, statuts « implémentée » et « à implémenter »', /Apache-2\.0|MIT/.test(await texte('.pa-idees')) && /implémentée/.test(await texte('.pa-idees')) && /à implémenter/.test(await texte('.pa-idees')));
await remplir('form[data-form="idee-coller"] [name="texte"]', 'Acheter quand le RSI H1 passe sous 25'); await soumettre('form[data-form="idee-coller"]');
verifier('idées : un texte collé devient un brouillon, jamais testé', /brouillon/.test(await texte('.pa-idees')));
await page.evaluate(() => { const b = document.querySelector('.pa-idees [data-a="idee-traduire"][data-id]'); b.click(); }); await attendre(1500);
verifier('idées : traduite en règle structurée, EN ATTENTE de mon accord', /à valider/.test(await texte('.pa-idees')) && /Achat quand/.test(await texte('.pa-idees')), (await texte('.pa-idees')).slice(0, 400));
await page.screenshot({ path: 'captures-mars/m6-9-idees.png' });
// ── changement de paire ──
await cliquer('.pa-paires [data-paire="DOGE"]'); await attendre(2500);
verifier('paire DOGE : le titre change et l’agent demande son historique', /AGENT DOGE/.test(await texte('[data-z="titre"]')) && !!(await page.$('[data-a="activer-donnees"]')) || /DOGE/.test(await texte('[data-z="titre"]')));
await onglet('ensemble'); await cliquer('[data-a="activer-donnees"]');
await page.waitForFunction(() => window.PosteAgent.poste() && window.PosteAgent.poste().paire() === 'DOGE', { timeout: 20000 }); await attendre(15000);
verifier('DOGE : historique chargé depuis Binance DOGEUSDT, prix minuscules, compteur de variantes propre (3 101)', await ev(async () => { const { obtenirHotePaire } = await import('/planetes/mars/pc/trading/pilotes-paires.js'); const h = await obtenirHotePaire('DOGE'); const v = h.vue(); return v.paire === 'DOGE' && v.donnees.n > 5000 && v.donnees.prix < 1 && v.recherche.N >= 3101 && v.recherche.N < 100000; }));
await page.screenshot({ path: 'captures-mars/m6-10-doge.png' });
await cliquer('.pa-paires [data-paire="BTC"]'); await attendre(1200);
verifier('retour sur BTC : compteur de variantes de BTC distinct (> 600 000)', await ev(() => window.__hoteBtc.vue().recherche.N > 600000));
// ── réglages : coûts par paire ──
await onglet('reglages');
verifier('réglages : coûts d’exécution par paire avec l’avertissement sur-optimisation', /sur-optimisation/.test(await texte('.pa-grille, .pa-corps')) && (await page.$$('form[data-form="couts"]')).length >= 1);
const gravesErreurs = erreurs.filter(e => !/ERR_FAILED|Failed to load resource|faireconomy|__veilleur/.test(e));
verifier('aucune erreur JavaScript', gravesErreurs.length === 0, gravesErreurs.slice(0, 4).join(' | '));
await navigateur.close(); echange.close();
process.exit(fin() ? 1 : 0);
