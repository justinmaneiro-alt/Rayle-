/* Test Chrome de la fenêtre Couverture. Usage : node trader-pro/tests/couverture-chrome.mjs [tel|tablette|pc] */
import { lancer } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tel', T = await lancer(mode), { p, verif, attendre, texte, capture, w } = T;
await capture('accueil-dock'); verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'l’accueil (dock à 9 icônes) ne dépasse pas la largeur de l’écran');
await p.evaluate(() => window.Application.ouvrir('couverture'));
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#couverture-fenetre .tp-nav'))), 'la fenêtre Couverture s’ouvre');
verif(await p.evaluate(() => window.Application.fenetres.some(f => f.id === 'couverture')), 'Couverture est une fenêtre du carrousel');
console.log('— corrélations —');
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#couverture-fenetre .tp-heat td[data-p]')), 30000), 'la matrice de corrélations s’affiche (plus de chargement infini)');
await capture('couverture-corr');
const n = await p.evaluate(() => document.querySelectorAll('#couverture-fenetre .tp-heat tr').length - 1); verif(n >= 8, 'au moins 8 actifs dans la matrice : ' + n);
verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'pas de défilement horizontal de la page');
for (const h of [30, 250]) { await p.evaluate(h2 => document.querySelector(`#couverture-fenetre [data-h="${h2}"]`).click(), h); await w(500); verif(await p.evaluate(h2 => document.querySelector(`#couverture-fenetre [data-h="${h2}"]`).getAttribute('aria-pressed') === 'true', h), 'horizon ' + h + ' j sélectionné'); }
await p.evaluate(() => document.querySelector('#couverture-fenetre .tp-heat td[data-p]').click());
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#couverture-fenetre [data-detail] canvas')), 15000), 'la corrélation glissante est dessinée');
await p.evaluate(() => { const c = document.querySelector('#couverture-fenetre .tp-corps'); c.scrollTop = c.scrollHeight; }); await w(400); await capture('couverture-glissante');
console.log('— couvrir une position —');
await p.evaluate(() => document.querySelector('#couverture-fenetre [data-onglet="couvrir"]').click()); await w(800);
await p.evaluate(() => { const f = document.querySelector('#couverture-fenetre [data-form]'); f.querySelector('[name=notionnel]').value = '10000'; f.requestSubmit(); });
verif(await attendre(() => p.evaluate(() => document.querySelectorAll('#couverture-fenetre .tp-cand tr[data-cand]').length >= 3), 20000), 'plusieurs candidats classés');
verif(await attendre(() => p.evaluate(() => !!document.querySelector('#couverture-fenetre [data-resultats] canvas')), 15000), 'courbes « seule » et « couverte » dessinées');
const t = await texte('#couverture-fenetre [data-resultats]'); verif(/Taille conseillée/.test(t) && /fiable|fragile|éviter/.test(t), 'taille conseillée et verdict affichés');
verif(/achat|vente/.test(await texte('#couverture-fenetre .tp-cand')), 'le sens de la couverture est affiché');
await p.evaluate(() => { const c = document.querySelector('#couverture-fenetre .tp-corps'); c.scrollTop = 250; }); await w(400); await capture('couverture-resultats');
await p.evaluate(() => document.querySelectorAll('#couverture-fenetre [data-cand]')[1].click()); await w(800);
verif(await p.evaluate(() => document.querySelectorAll('#couverture-fenetre .tp-cand tr.tp-sel').length === 1), 'un autre candidat peut être choisi');
verif(await p.evaluate(() => document.documentElement.scrollWidth <= visualViewport.width + 1), 'pas de défilement horizontal de la page (résultats)');
console.log('— changer l’actif efface / recalcule les résultats ; la virgule est conservée —');
const nom0 = await p.evaluate(() => document.querySelector('#couverture-fenetre [name=actif] option:checked').textContent), titre0 = await texte('#couverture-fenetre [data-resultats] h3.tp-titre');
verif(await p.evaluate(() => { const s = document.querySelector('#couverture-fenetre [name=actif]'); s.selectedIndex = (s.selectedIndex + 1) % s.options.length; s.dispatchEvent(new Event('change', { bubbles: true })); return !document.querySelector('#couverture-fenetre [data-resultats] .tp-cand'); }), 'dès que l’actif change, les anciens résultats disparaissent (même instant)');
const nom1 = await p.evaluate(() => document.querySelector('#couverture-fenetre [name=actif] option:checked').textContent);
verif(await attendre(() => p.evaluate(n => { const h = document.querySelector('#couverture-fenetre [data-resultats] h3.tp-titre'); return !!h && h.textContent.includes(n); }, nom1), 15000), 'le titre est recalculé pour le nouvel actif (' + nom0 + ' → ' + nom1 + ')');
verif(!(await texte('#couverture-fenetre [data-resultats] h3.tp-titre')).includes(titre0.split(' sur ').pop()) || nom0 === nom1, 'l’ancien titre n’est plus affiché');
for (const nom of ['spread', 'swap']) { await p.click(`#couverture-fenetre [name=${nom}]`, { clickCount: 3 }); await p.keyboard.type('0,1'); await w(150); verif(await p.evaluate(n => document.querySelector(`#couverture-fenetre [name=${n}]`).value === '0,1', nom), nom + ' : « 0,1 » garde sa virgule'); }
await w(1500); verif(await p.evaluate(() => document.querySelector('#couverture-fenetre [name=spread]').value === '0,1'), 'la saisie survit au recalcul');
await p.evaluate(() => window.Application.fermer()); await w(1200);
verif(await p.evaluate(() => !document.querySelector('#couverture-fenetre')), 'la fenêtre se ferme proprement');
await T.fin();
