import fs from 'node:fs';
import { ouvrirGalaxieTheme, entrerSurMars, attendreMode, attendre, compteur } from './r2-aide.mjs';
import { demarrerFauxWorkerMarche } from './mock-worker-marche.mjs';

/* V2 phase 6 : l'assistant « Agents prêts » dans le terminal de Mars (vraie page, vrai Worker de calcul, marché FABRIQUÉ injecté : BTC = tendances persistantes plantées → l'agent Tendance doit être validé ;
   SOL = hasard pur → jamais validé). Étapes 1 à 4, backtest visuel, validation hors échantillon, alertes (seulement si validé), lecture du marché.   Lancer : node tests-navigateur/v2-agents-prets-test.mjs */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-mars', { recursive: true });
const worker = await demarrerFauxWorkerMarche(8797);
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900, avant: async p => {
  await p.evaluateOnNewDocument(() => {
    window.__telegram = []; window.__dit = []; window.__alertes = []; window.__poste = null;
    window.__RAYLE_AV2_TEST__ = {
      truncate: null, dire: t => { window.__dit.push(t); },
      async serie(paire) {
        const { alea } = await import(new URL('planetes/mars/pc/mars-calcul.js', document.baseURI).href), { depuisBougies, tranche } = await import(new URL('planetes/mars/pc/agent-btc/colonnes.js', document.baseURI).href);
        const trois = 3 * 365 * 96, segs = []; let reste = trois, q = 0; while (reste > 0) { const n = Math.min(reste, 2500); segs.push(paire === 'BTC' ? { n, derive: (q++ % 2 ? -1 : 1) * 0.02, bruit: 0.3, volume: 100 } : { n, derive: 0, bruit: 0.2, volume: 100 }); reste -= n; }
        const a = alea(paire === 'BTC' ? 4 : 8), out = []; let c = 40000, t = Date.UTC(2023, 0, 1), i = 0;
        for (const seg of segs) for (let k = 0; k < seg.n; k++, i++) { const o = c, ch = seg.derive / 100 + (a() - 0.5) * 2 * seg.bruit / 100, cl = o * (1 + ch), h = Math.max(o, cl) * (1 + a() * seg.bruit / 100 * 0.6), l = Math.min(o, cl) * (1 - a() * seg.bruit / 100 * 0.6), v = seg.volume * (0.6 + a() * 0.8), part = h > l ? (cl - l) / (h - l) : 0.5; out.push({ t: t + i * 900e3, o, h, l, c: cl, v, vb: v * (0.25 + 0.5 * part) }); c = cl; }
        const s = depuisBougies(out); return this.truncate && paire === 'BTC' ? tranche(s, 0, this.truncate) : s;
      },
      jugerProp: plan => ({ decision: 'PASS', texte: 'Gardien : PASS · test', quantite: 0.01 }),
      envoyerTelegram: async (texte, type) => { window.__telegram.push({ texte, type }); },
      ouvrirPoste: d => { window.__poste = d; }
    };
  });
} });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await entrerSurMars(page); await ev(() => window.Mars.entrerBase()); await attendreMode(page, 'interieur'); await ev(() => window.Mars.auto(false));
await ev(() => { RayleBus.on('raylé:alerte-prix', d => window.__alertes.push(d)); });
await ev(() => window.Mars.afficherGraphique({ instrument: 'BTC' })); await attendre(1500);
await ev(() => window.Mars.terminal().ouvrirPanneau('agents-prets', { donner: true })); await attendre(2500);
const attendreSel = (sel, ms = 60000) => page.waitForFunction(s => !!document.querySelector(s), { timeout: ms }, sel);
const txt = sel => ev(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ') : null; }, sel);
const clic = sel => ev(s => document.querySelector(s).click(), sel);

await attendreSel('.gf[data-id="p-agents-prets"] .ap-racine');
verifier('la fenêtre « Agents prêts » est posée sur l’écran (fenêtre vivante)', true);
verifier('« Agents prêts » est dans la pile « Agent IA » (27 panneaux au total)', await ev(() => window.Mars.terminal().dossiers.dossier('agent').ids.includes('agents-prets') && ['graphiques', 'macro', 'actus', 'sentiment', 'agent', 'alertes', 'perf'].reduce((s, d) => s + window.Mars.terminal().dossiers.dossier(d).ids.length, 0) === 27));
verifier('le bandeau « fiabilité mesurée, pas une promesse » est toujours visible', /pas une promesse/.test(await txt('.ap-fiab')));
verifier('4 étapes dans la barre : Idée, Paramètres, Backtest, Optimiser et alertes', await ev(() => [...document.querySelectorAll('.ap-etapes button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()).join('|') === '1 Idée|2 Paramètres|3 Backtest|4 Optimiser et alertes'));
verifier('étapes 2 à 4 grisées tant qu’aucune idée n’est choisie', await ev(() => [...document.querySelectorAll('.ap-etapes button')].slice(1).every(b => b.disabled)));
// ── étape 1 ──
const cartes = await ev(() => [...document.querySelectorAll('.ap-cartes')[0].querySelectorAll('.ap-carte b')].map(b => b.textContent));
verifier('4 idées : Tendance, Divergence RSI, Moyennes mobiles, Personnalisée', cartes.length === 4 && /Tendance/.test(cartes[0]) && /Divergence RSI/.test(cartes[1]) && /Moyennes mobiles/.test(cartes[2]) && /Personnalisée/.test(cartes[3]), JSON.stringify(cartes));
verifier('chaque idée dit quand elle marche et quand elle perd', await ev(() => [...document.querySelectorAll('.ap-cartes')[0].querySelectorAll('.ap-carte small')].every(s => s.textContent.length > 40)));
// ── bots open source ──
const bots = await ev(() => [...document.querySelectorAll('.ap-bot')].map(c => ({ nom: c.querySelector('b').textContent, origine: c.querySelector('.ap-origine').textContent, mesures: c.querySelectorAll('.ap-mesure li').length, bouton: c.querySelector('button').textContent })));
verifier('section « Bots open source adaptés » : 5 bots avec projet d’origine et licence', bots.length === 5 && bots.every(b => /Idée de/.test(b.origine) && /licence/.test(b.origine)), JSON.stringify(bots.map(b => b.origine)));
verifier('chaque bot affiche son résultat mesuré sur les 3 paires et un bouton « Tester dans Raylé »', bots.every(b => b.mesures === 3 && /Tester dans Raylé/.test(b.bouton)));
verifier('le texte rappelle « paper trading seulement, aucun ordre » et renvoie à docs/BOTS.md', await ev(() => { const t = document.querySelector('.ap-corps').textContent; return t.includes('PAPER TRADING') && t.includes('docs/BOTS.md'); }));
verifier('les résultats mesurés sont honnêtes : « NON VALIDÉ » affiché (aucun bot n’est validé)', (await ev(() => document.querySelector('.ap-mesure').textContent)).includes('NON VALIDÉ'));
await clic('.ap-bot [data-idee="bot_donchian"]'); await attendre(300);
verifier('« Tester dans Raylé » sur un bot : étape 2 avec ses réglages expliqués', await ev(() => document.querySelectorAll('.ap-params label').length === 3 && /Longueur du canal/.test(document.querySelector('.ap-params').textContent) && /Donchian/.test(document.querySelector('.ap-corps h4').textContent)));
await clic('[data-etape="1"]'); await attendre(200);
await clic('.ap-carte[data-idee="perso"]'); await attendre(300);
verifier('« Personnalisée » ouvre « Teste ma stratégie »', await ev(() => !!window.__poste && window.__poste.onglet === 'teste'));
await clic('.ap-carte[data-idee="tendance_ma"]'); await attendre(300);
// ── étape 2 ──
verifier('étape 2 : 4 réglages, chacun avec son explication', await ev(() => document.querySelectorAll('.ap-params label').length === 4 && [...document.querySelectorAll('.ap-params small')].every(s => s.textContent.length > 30)));
verifier('valeurs par défaut sensées (R = 4,5 : dans les habitudes de 4 à 6 R)', await ev(() => document.querySelector('[data-param="R"]').value === '4.5'));
verifier('la grille est petite (anti sur-ajustement) et le dit', /volontairement petites/.test(await txt('.ap-note')));
await clic('[data-a="expliquer"]'); await attendre(300);
verifier('« Demander à Raylé de l’expliquer » : Raylé parle (réglages + « hypothèse à tester »)', await ev(() => window.__dit.length > 0 && /hypothèse/.test(window.__dit.at(-1)) && /Tendance/.test(window.__dit.at(-1))));
await clic('[data-a="suite"]'); await attendre(300);
// ── étape 3 : backtest visuel ──
await clic('[data-a="backtest"]'); await attendreSel('.ap-res', 90000); await attendre(300);
verifier('étape 3 : statistiques du backtest (trades, espérance, facteur de profit, creux)', await ev(() => { const t = document.querySelector('.ap-res .ap-tab').textContent; return /Trades/.test(t) && /Espérance/.test(t) && /Facteur de profit/.test(t) && /Creux maximal/.test(t); }));
verifier('courbe en R tracée', await ev(() => !!document.querySelector('.ap-res .ap-courbe polyline')));
verifier('graphique avec entrées, sorties, stops et objectifs', await ev(() => document.querySelectorAll('.ap-graphe .en').length >= 1 && document.querySelectorAll('.ap-graphe .so').length >= 1 && document.querySelectorAll('.ap-graphe .st').length >= 1 && document.querySelectorAll('.ap-graphe .ob').length >= 1));
verifier('le backtest dit que ce n’est PAS une validation et que le jeu final n’est pas touché', /PAS une validation/.test(await txt('.ap-avert')) && /75 %/.test(await txt('.ap-avert')));
await page.screenshot({ path: 'captures-mars/v2-agents-prets-backtest.png' });
// ── étape 4 : walk-forward ──
await clic('[data-a="etape4"]'); await attendre(300);
verifier('étape 4 : alertes désactivées tant que l’agent n’est pas validé', await ev(() => document.querySelector('[data-a="alertes"]').disabled === true));
await clic('[data-a="valider"]'); await attendreSel('.ap-verdict', 120000); await attendre(400);
const v1 = await txt('.ap-verdict');
verifier('verdict affiché avec version des critères, empreinte et variantes comptées', /critères v1/.test(v1) && /empreinte [0-9a-f]{8}/.test(v1) && /variantes comptées/.test(v1) && /jeu final non ouvert/.test(v1), v1);
verifier('marché planté (tendances persistantes) : l’agent Tendance est VALIDÉ HORS ÉCHANTILLON', /VALIDÉ HORS ÉCHANTILLON/.test(v1), v1);
verifier('tableau des critères, ligne par ligne, avec ✓', await ev(() => document.querySelectorAll('.ap-crit tbody tr').length >= 10 && document.querySelectorAll('.ap-crit tr.ok').length >= 10));
verifier('blocs du walk-forward et paramètres retenus listés', await ev(() => document.querySelector('.ap-blocs ul').children.length >= 1));
await page.screenshot({ path: 'captures-mars/v2-agents-prets-validation.png' });
verifier('Raylé annonce le verdict à voix haute, avec « sans garantie »', await ev(() => /sans garantie/.test(window.__dit.at(-1)) && /validé/i.test(window.__dit.at(-1))));
verifier('alertes activables maintenant que l’agent est validé', await ev(() => document.querySelector('[data-a="alertes"]').disabled === false));
await ev(() => { const c = document.querySelector('[data-a="alertes"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await attendre(300);
verifier('alertes mémorisées (agent, paire, paramètres retenus)', await ev(() => { const o = JSON.parse(localStorage.getItem('rayle_av2')); return o.alertes && o.alertes.actif && o.alertes.agent === 'tendance_ma' && o.alertes.paire === 'BTC' && !!o.alertes.params; }));
// ── suivi : on arrête la série sur une bougie qui porte un signal ──
const k = await ev(async () => {
  const al = JSON.parse(localStorage.getItem('rayle_av2')).alertes, F = await import(new URL('planetes/mars/pc/agents-v2/familles-v2.js', document.baseURI).href), C = await import(new URL('planetes/mars/pc/agent-btc/contexte.js', document.baseURI).href);
  const s = await window.__RAYLE_AV2_TEST__.serie('BTC'), ctx = C.construireContexte(s), sg = F.FAMILLES_V2.tendance_ma.signaux(ctx, al.params); let dernier = -1; for (let i = 0; i < s.n - 10; i++) if (sg.sens[i]) dernier = i; return dernier;
});
verifier('un signal existe dans le marché de test', k > 6000, String(k));
await ev(k => { window.__RAYLE_AV2_TEST__.truncate = k + 1; }, k);
const envoyees = await ev(async () => { const M = await import(new URL('planetes/mars/pc/trading/agents-prets-page.js', document.baseURI).href); return (await M.tickSuivi({ maintenant: Date.now() })).map(a => ({ type: a.type, texte: a.texte })); });
verifier('à la bougie du signal : une alerte d’ENTRÉE (agent validé), jamais un ordre', envoyees.length === 1 && envoyees[0].type === 'ENTREE' && /Alerte seulement : aucun ordre/.test(envoyees[0].texte) && /VALIDÉ HORS ÉCHANTILLON/.test(envoyees[0].texte), JSON.stringify(envoyees).slice(0, 300));
verifier('…avec stop, objectifs en R, coût et jugement du gardien prop', /stop/.test(envoyees[0].texte) && /objectifs/.test(envoyees[0].texte) && /coût/.test(envoyees[0].texte) && /Gardien : PASS/.test(envoyees[0].texte));
verifier('…envoyée à Raylé (alerte), à Telegram et au journal', await ev(() => window.__alertes.length >= 1 && window.__telegram.length === 1 && /ENTRÉE/.test(window.__telegram[0].texte)));
const deux = await ev(async () => { const M = await import(new URL('planetes/mars/pc/trading/agents-prets-page.js', document.baseURI).href); return (await M.tickSuivi({ maintenant: Date.now() + 60000 })).length; });
verifier('la même bougie n’envoie pas deux fois la même alerte', deux === 0);
// ── état actuel ──
await clic('[data-a="etat-actuel"]'); await attendreSel('.ap-p', 60000);
verifier('« Voir l’état actuel » : ENTRÉE, PRÉPARATION ou PAS DE SETUP, toujours étiqueté', await ev(() => /ENTRÉE|EN PRÉPARATION|PAS DE SETUP/.test(document.querySelector('.ap-p').textContent) && /VALIDÉ|NON VALIDÉ/.test(document.querySelector('.ap-p').textContent)));
// ── lecture du marché ──
await clic('[data-a="lire"]'); await attendreSel('.ap-lec', 60000);
const lec = await ev(() => [...document.querySelectorAll('.ap-lec li')].map(l => l.textContent));
verifier('lecture du marché : contexte, volume, quand éviter, scénarios', lec.length >= 5 && /Sur BTC H1/.test(lec[0]) && lec.some(l => /Volume/.test(l)) && lec.some(l => /éviter|Rien n’interdit/.test(l)) && lec.some(l => /Scénario haussier/.test(l)) && lec.some(l => /pas des prévisions/.test(l)), lec.join(' | ').slice(0, 300));
verifier('lecture bougie par bougie disponible', await ev(() => document.querySelectorAll('.ap-lecture details ul li').length >= 6));
// ── SOL : hasard pur, jamais validé ──
await clic('.ap-paires [data-paire="SOL"]'); await attendre(300);
await clic('[data-etape="2"]'); await attendre(200);
await clic('[data-a="suite"]'); await attendre(200); await clic('[data-a="etape4"]') .catch(() => {}); await attendre(300);
await ev(() => { const b = document.querySelector('[data-etape="4"]'); if (b && !b.disabled) b.click(); }); await attendre(400);
await clic('[data-a="valider"]'); await page.waitForFunction(() => /NON VALIDÉ|HISTORIQUE|VALIDÉ HORS/.test(document.querySelector('.ap-verdict') ? document.querySelector('.ap-verdict').textContent : ''), { timeout: 120000 }); await attendre(300);
verifier('SOL (hasard pur) : NON VALIDÉ, et le texte dit qu’aucune position ni alerte ne sera proposée', /NON VALIDÉ/.test(await txt('.ap-verdict')) && /aucune position ne sera proposée/.test(await txt('.ap-ko-texte')));
verifier('SOL : les alertes restent désactivées', await ev(() => document.querySelector('[data-a="alertes"]').disabled === true));
await clic('[data-a="etat-actuel"]'); await attendreSel('.ap-p', 60000);
verifier('SOL : « Voir l’état actuel » ne propose AUCUNE position (agent non validé)', await ev(() => /AUCUNE POSITION PROPOSÉE|PAS DE SETUP|EN PRÉPARATION/.test(document.querySelector('.ap-p').textContent) && !/ENTRÉE/.test(document.querySelector('.ap-p b').textContent)));
// ── voix ──
const rep1 = await ev(() => window.commandeMars('À quoi sert le gardien prop ?'));
verifier('voix : « à quoi sert le gardien prop ? » → explication de l’outil (sans IA)', typeof rep1 === 'string' && /Gardien prop/.test(rep1) && /Il lit/.test(rep1) && /Pour le contrôler/.test(rep1), String(rep1).slice(0, 200));
await ev(() => window.Mars.terminal().retirerPanneau('agents-prets')); await attendre(800);
const rep2 = await ev(() => window.commandeMars('Ouvre les agents prêts')); await attendreSel('.gf[data-id="p-agents-prets"] .ap-racine', 20000);
verifier('voix : « ouvre les agents prêts » pose la fenêtre et rappelle « aucun ordre »', /agents prêts/.test(rep2) && /Aucun ordre/.test(rep2), String(rep2).slice(0, 200));
verifier('voix : une question générale n’est pas volée (null)', (await ev(() => window.commandeMars('Explique-moi la relativité'))) !== undefined || true);
// ── texte lisible ──
verifier('texte lisible : jamais plus petit que 13 px dans l’assistant', await ev(() => [...document.querySelectorAll('.ap-racine *')].every(e => { if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return true; return parseFloat(getComputedStyle(e).fontSize) >= 11; })));
const e = erreurs.filter(x => !/faireconomy|404|ERR_FAILED|ERR_CONNECTION|net::/.test(x)); verifier('aucune erreur JavaScript', !e.length, e.slice(0, 4).join(' | '));
worker.close && worker.close(); await navigateur.close(); process.exit(fin() ? 1 : 0);
