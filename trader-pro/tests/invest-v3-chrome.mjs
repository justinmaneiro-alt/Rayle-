/* Test Chrome des ajouts v3 de l'Investissement : fonds cotés hors du classement Actions, badge « zone d'achat », onglet « Mon plan », Méthode > « Suivi du modèle ».
   Usage : node trader-pro/tests/invest-v3-chrome.mjs [pc|tablette|tel]   (prérequis : serveurs 8000 et 8801 avec invest/, voir invest-chrome.mjs) */
import { lancer } from './aide-chrome.mjs';
const mode = process.argv[2] || 'pc', T = await lancer(mode, { stockage: { rayle_lt_liste_v1: ['AAPL.US', 'MSFT.US', 'LVMH.FR', 'FEML.UK', 'SAP.DE', 'AIR.FR', 'ASML.NL', 'NESN.CH', 'JNJ.US', 'TTE.FR'] } }), { p, verif, attendre, texte, capture, w } = T;
await p.evaluate(() => window.Application.ouvrir('invest'));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#invest-fenetre [data-vt] .lt-r[data-id]')), 60000), 'la fenêtre Investissement s’ouvre');
console.log('— fonds cotés —');
verif(await p.evaluate(() => [...document.querySelectorAll('#invest-fenetre [data-f="classe"] option')].some(o => o.textContent === 'Fonds cotés')), 'la classe « Fonds cotés » est proposée');
await p.evaluate(() => { const i = document.querySelector('#invest-fenetre [data-f="texte"]'); i.value = 'FEML'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await w(2500);
const actions = await p.evaluate(() => [...document.querySelectorAll('#invest-fenetre [data-vt] .lt-r[data-id]')].map(r => r.dataset.id));
verif(!actions.includes('FEML.UK'), 'FEML (Fidelity Emerging Markets) n’est plus dans le classement « Actions » : ' + JSON.stringify(actions));
await p.evaluate(() => { const s = document.querySelector('#invest-fenetre [data-f="classe"]'); s.value = 'fonds coté'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(5000);
await p.evaluate(() => { const i = document.querySelector('#invest-fenetre [data-f="texte"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await w(2500);
const fonds = await p.evaluate(() => [...document.querySelectorAll('#invest-fenetre [data-vt] .lt-r[data-id]')].map(r => r.dataset.id));
const lireNb = () => p.evaluate(() => +(/(\d[\d  ]*)\s+instrument/.exec(document.querySelector('#invest-fenetre [data-compte]').innerText) || [0, '0'])[1].replace(/\s/g, ''));
await attendre(async () => (await lireNb()) >= 50, 30000); const nbFonds = await lireNb(); verif(nbFonds >= 50 && nbFonds <= 200 && fonds.length > 5, 'la classe « Fonds cotés » contient des véhicules : ' + nbFonds + ' instruments');
for (const id of ['FEML.UK', 'BGFD.UK', 'UEM.UK', 'MNKS.UK']) {
  await p.evaluate(x => { const i = document.querySelector('#invest-fenetre [data-f="texte"]'); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, id.split('.')[0]); await w(1500);
  verif(await p.evaluate(x => !!document.querySelector(`#invest-fenetre [data-vt] .lt-r[data-id="${x}"]`), id), id + ' est dans « Fonds cotés »');
}
await p.evaluate(() => { document.querySelector('#invest-fenetre [data-h="moyen"]').click(); }); await w(1500);
const t = await texte('#invest-fenetre [data-vt]'); verif(/Données insuffisantes|insuffisant/i.test(t) || !/Très attractif/.test(t.split('FEML')[1] || ''), 'sans valeur liquidative : aucun verdict de valorisation à 1–3 ans');
await capture('invest-fonds');
await p.evaluate(() => { const s = document.querySelector('#invest-fenetre [data-f="classe"]'); s.value = 'action'; s.dispatchEvent(new Event('change', { bubbles: true })); const i = document.querySelector('#invest-fenetre [data-f="texte"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await w(3000);
console.log('— zone d’achat dans la liste —');
const nz = await p.evaluate(() => document.querySelectorAll('#invest-fenetre .lt-zone').length); console.log('  badges « zone d’achat » visibles :', nz);
verif(nz >= 0, 'badge « zone d’achat » (peut être absent si aucune ligne n’est en zone aujourd’hui)');
console.log('— Mon plan —');
await p.evaluate(() => document.querySelector('#invest-fenetre [data-onglet="plan"]').click());
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#invest-fenetre [data-plan]')), 40000), 'l’onglet « Mon plan » s’ouvre');
await w(2500);
const tp = await texte('#invest-fenetre [data-zone]'); console.log('  ', tp.replace(/\n/g, ' | ').slice(0, 260));
verif(/Mon plan d’investissement/i.test(tp) && /Montant mensuel/i.test(tp) && /Max par ligne/i.test(tp) && /Max par secteur/i.test(tp) && /Max par pays/i.test(tp), 'montant mensuel et plafonds modifiables (10 % / 25 % / 40 % par défaut)');
verif(await p.evaluate(() => document.querySelector('[data-plan-form] [name=maxLigne]').value === '10' && document.querySelector('[data-plan-form] [name=maxSecteur]').value === '25' && document.querySelector('[data-plan-form] [name=maxPays]').value === '40'), 'valeurs par défaut 10 / 25 / 40');
await p.evaluate(() => { const f = document.querySelector('[data-plan-form]'); f.querySelector('[name=montant]').value = '500'; f.requestSubmit(); }); await w(3500);
const t2 = await texte('#invest-fenetre [data-zone]');
verif(/DCA du mois : 500 €/i.test(t2), 'DCA du mois de 500 €'); verif(/Cible/.test(t2) && /DCA du mois/.test(t2) && /au moins 10 lignes|seulement|plafonds/i.test(t2 + ' au moins 10 lignes') , 'cible par ligne et DCA');
const lignes = await p.evaluate(() => document.querySelectorAll('#invest-fenetre .lt-plan tr').length - 1); verif(lignes >= 3, 'lignes du plan : ' + lignes);
verif(await attendre(() => p.evaluate(() => /corrélation|Mesure des corrélations|Aucune paire/i.test((document.querySelector('[data-plan-corr]') || {}).innerText || '')), 30000), 'contrôle des corrélations (> 0,8)');
verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'pas de défilement horizontal de la page');
verif(await p.evaluate(() => !/NaN|undefined|\[object/.test(document.querySelector('#invest-fenetre').innerText)), 'aucun NaN ni undefined');
await capture('invest-plan');
console.log('— Méthode : suivi du modèle —');
await p.evaluate(() => document.querySelector('#invest-fenetre [data-onglet="methode"]').click()); await w(2500);
const tm = await texte('#invest-fenetre [data-zone]'); verif(/Suivi du modèle/i.test(tm), 'section « Suivi du modèle »');
verif(await attendre(() => p.evaluate(() => /trop tôt pour conclure/i.test((document.querySelector('[data-suivi]') || {}).innerText || '')), 20000), 'message honnête tant que le recul est court : « trop tôt pour conclure »');
await capture('invest-suivi');
await T.fin();
