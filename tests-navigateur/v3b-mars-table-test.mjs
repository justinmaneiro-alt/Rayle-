import { spawn, execFileSync } from 'node:child_process';

/* V3b, dans la VRAIE base de Mars : on entre dans le salon, on pose les fenêtres « Agent BTC », « Propositions de l'agent », « Régime de marché », « Agent stratège » du terminal (comme un clic sur la table)
   et on lit ce qu'elles affichent avec les VRAIS chiffres du service PC (comparés à `service.mjs --statut`). Lancer : node tests-navigateur/v3b-mars-table-test.mjs   (le service de l'agent doit tourner) */
const PORT = 8141, BASE = 'http://127.0.0.1:' + PORT; process.env.BASE = BASE;   // AVANT d'importer les aides (elles lisent BASE à l'import)
const { attendre, compteur } = await import('./terre-aide.mjs'); const T = compteur();
const cli = JSON.parse(execFileSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'agent-pc/service.mjs', '--statut'], { encoding: 'utf8' }));
const serveur = spawn(process.execPath, ['serveur.mjs', String(PORT)], { env: { ...process.env, RAYLE_PORT_RESEAU: String(PORT + 1) }, stdio: 'ignore' });
for (let k = 0; k < 60; k++) { try { if ((await fetch(BASE + '/index.html')).ok) break; } catch (e) { /* démarrage */ } await attendre(200); }
const { ouvrirGalaxieTheme } = await import('./r2-aide.mjs');
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1500, hauteur: 950, avant: async p => {
  await p.setRequestInterception(true);
  p.on('request', r => { if (/data-api\.binance\.vision\/api\/v3\/klines/.test(r.url()) && /startTime=/.test(r.url())) r.abort(); else r.continue(); });
} });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await ev(() => window.Galaxie.nav.allerA('mars', { entrer: true }));
await page.waitForFunction(() => window.Mars && window.Mars.etat().actif && !window.Mars.etat().transition && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 90000 });
await attendre(600); await ev(() => window.Mars.entrerBase());
await page.waitForFunction(() => window.Mars.etat().mode === 'interieur' && !window.Mars.etat().transition && !document.getElementById('m-fondu').classList.contains('noir'), { timeout: 60000 });
await attendre(1500);
T.verifier('on est dans le salon de Mars', await ev(() => window.Mars.etat().mode === 'interieur'));

const fenetre = id => ev(i => { const el = document.querySelector('#panneaux .pn[data-id="' + i + '"], #panneaux .pn[data-id*="' + i + '"]'); return el ? el.innerText : null; }, id);
const nombre = t => Number(String(t).replace(/\D/g, ''));

// ── Agent BTC ──
await ev(() => window.Mars.ouvrirPanneauTerminal('agent-btc')); await attendre(4000);
const texteAgent = await ev(() => { const el = document.querySelector('.tg-agent-v3'); return el ? el.innerText : null; });
T.verifier('« Agent BTC » de la table : la NOUVELLE page (agent Kepler) s’affiche', !!texteAgent && /que fait l’agent/i.test(texteAgent), (texteAgent || '').slice(0, 100));
T.verifier('« Agent BTC » : plus de « PAS DE RECHERCHE » ni de « Lancer la recherche »', !!texteAgent && !/PAS DE RECHERCHE|Lancer la recherche/i.test(texteAgent));
const m = (texteAgent || '').match(/(\d[\d\s  ]*)\s*variantes testées/i);
T.verifier('« Agent BTC » : le vrai nombre de variantes du service PC (' + cli.variantesTestees + ')', !!m && nombre(m[1]) >= cli.variantesTestees && nombre(m[1]) < cli.variantesTestees + 5000, m && m[1]);
await page.screenshot({ path: 'docs/captures-v3b/mars-agent-btc.png' });

// ── fenêtres de la table (terminal) : propositions, régime ──
await ev(() => window.Mars.ouvrirPanneauTerminal('propositions-agent')); await ev(() => window.Mars.ouvrirPanneauTerminal('regime-marche')); await attendre(12000);
const tp = await ev(() => { const l = [...document.querySelectorAll('.tm-reel')].map(e => e.innerText); return l; });
const prop = tp.find(t => /Pourquoi pas de setup/.test(t)), reg = tp.find(t => /Régime actuel de chaque actif|Bitcoin/.test(t) && /ADX|range|tendance|transition/.test(t));
T.verifier('« Propositions de l’agent » : pourquoi pas de setup + ce qu’il manque (sans aucune position)', !!prop && /Pour valider/.test(prop) && /150/.test(prop), (prop || tp.join(' || ')).slice(0, 200));
T.verifier('« Régime de marché » : le régime de Bitcoin, Solana et Dogecoin', !!reg && /Bitcoin/.test(reg) && /Solana/.test(reg) && /Dogecoin/.test(reg), (reg || tp.join(' || ')).slice(0, 300));
T.verifier('aucune de ces fenêtres ne dit « active l’agent sur une paire » ni « paire non activée »', !/non activée|active l’agent sur/.test(tp.join(' ')));
await page.screenshot({ path: 'docs/captures-v3b/mars-fenetres.png' });

// ── Agent stratège ──
await ev(() => window.Mars.ouvrirPanneauTerminal('strategie')); await attendre(2500);
const strat = await ev(() => { const el = document.querySelector('.tg-bientot'); return el ? el.innerText : null; });
T.verifier('« Agent stratège » : explication claire, plus de « Arrive à l’étape M4 »', !!strat && /pas d’agent stratège séparé/i.test(strat) && !/M4|ARRIVE À/i.test(strat), strat);
const graves = erreurs.filter(e => !/favicon|ERR_FAILED|Failed to load resource|404|WebGL|GPU stall|faireconomy|CORS policy|aborted|ERR_ABORTED/i.test(e));
T.verifier('aucune erreur JavaScript', graves.length === 0, graves.slice(0, 3).join(' | '));
await navigateur.close(); serveur.kill(); T.fin();
process.exit(0);
