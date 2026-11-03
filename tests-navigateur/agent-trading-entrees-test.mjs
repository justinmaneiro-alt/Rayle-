// Agent de trading V2 : les deux points d'entrée dans Rayle (téléphone : écran Marchés ; PC : fenêtre Panneaux).
// Prérequis : node serveur.mjs 8000 ; un relais de test sur ws://127.0.0.1:8799 (agent-trading/moteur/tests/relais-demo.mjs, local).
import { ouvrirMobile, attendre } from './v8-aide.mjs';
import { ouvrirAppareil } from './v7b-aide.mjs';
let ok = 0, ko = 0; const t = (nom, c) => { if (c) ok++; else { ko++; console.log('ÉCHEC', nom); } };

const m = await ouvrirMobile('telephone', { storage: { rayle_agent_trading_url: 'http://127.0.0.1:8799' } });
const p = m.page;
await p.evaluate(() => document.querySelector('button[data-ecran="marches"]').click()); await attendre(800);
const tuile = await p.evaluate(() => { const b = [...document.querySelectorAll('.m-tuile')].find(x => /Agent de trading/.test(x.textContent)); if (b) b.click(); return !!b; });
t('téléphone : tuile « Agent de trading » dans Marchés', tuile);
await p.waitForFunction(() => document.querySelector('.at-plein .at') && document.querySelector('.at-capital'), { timeout: 20000 }).catch(() => {});
const r = await p.evaluate(() => ({ vue: !!document.querySelector('.at-plein .at'), disposition: document.querySelector('.at') && document.querySelector('.at').dataset.disposition, onglets: document.querySelectorAll('.at-onglets [data-onglet]').length }));
t('téléphone : la fenêtre s’ouvre en plein écran, en onglets', r.vue && r.disposition === 'mobile' && r.onglets === 4);
await p.screenshot({ path: 'agent-trading/moteur/tests/captures/entree-telephone.png' }).catch(() => {});
await m.fermer();

const pc = await ouvrirAppareil('pc', { storage: { rayle_agent_trading_url: 'http://127.0.0.1:8799', rayle_worker_token: 'test' } });
await pc.page.evaluate(() => import('/agent-trading/front/fenetre-agent.js').then(x => x.ouvrirFenetre()));
await pc.page.waitForFunction(() => document.querySelector('.at-fenetre .at, #panneaux .at'), { timeout: 15000 }).catch(() => {});
t('PC : la fenêtre s’ouvre dans le gestionnaire de fenêtres (Panneaux)', await pc.page.evaluate(() => !!document.querySelector('.at')));
await pc.navigateur.close();
console.log(`entrées agent de trading : ${ok} réussis, ${ko} échoués`); process.exit(ko ? 1 : 0);
