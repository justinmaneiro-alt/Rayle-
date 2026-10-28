import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';

/* V3 phase 5 : Jupiter, structure vide, dans la vraie page. Aller sur Jupiter ouvre une fenêtre HONNÊTE (« pas encore construit ») sur PC comme en tablette (terminal-2d) ; les ordres « coder » et
   « montrer_resultat » du manifeste répondent qu'ils ne sont pas construits ; Échap ferme tout ; aucune erreur. Lancer : node tests-navigateur/v3-jupiter-test.mjs */
const { verifier, fin } = compteur();
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1400, hauteur: 900 });
const ev = (f, ...a) => page.evaluate(f, ...a);
const attendreJupiter = () => page.waitForFunction(() => window.Jupiter && window.Jupiter.etat().actif && !!document.querySelector('#panneaux .pn[data-id="jupiter-attente"]'), { timeout: 40000 });

await ev(() => window.Galaxie.nav.allerA('jupiter', { entrer: true })); await attendreJupiter(); await attendre(500);
const f = await ev(() => { const el = document.querySelector('#panneaux .pn[data-id="jupiter-attente"]'); return { texte: el.innerText, visible: el.getBoundingClientRect().width > 200 }; });
verifier('PC : aller sur Jupiter ouvre la fenêtre « pas encore construit »', f.visible && /pas encore construit/i.test(f.texte), f.texte.slice(0, 120));
verifier('la fenêtre dit la vérité : agents non créés, ordres non actifs, vaisseau à venir', /pas encore créés/.test(f.texte) && /pas encore actifs/.test(f.texte) && /à venir/.test(f.texte));
verifier('window.Jupiter : état « structure-vide », 0 agent', await ev(() => window.Jupiter.etat().mode === 'structure-vide' && window.Jupiter.etat().agents === 0));
const o1 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'jupiter', action: 'coder', params: { demande: 'un petit site' } }));
verifier('ordre « coder » : refus honnête (aucun faux code)', o1 && o1.ok === false && /pas encore construits/.test(o1.erreur || ''), JSON.stringify(o1));
const o2 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'jupiter', action: 'montrer_resultat', params: {} }));
verifier('ordre « montrer_resultat » : rien à montrer', o2 && o2.ok === false && /aucun code/.test(o2.erreur || ''), JSON.stringify(o2));
await page.screenshot({ path: 'captures-accueil/v3-jupiter.png' });
await page.keyboard.press('Escape'); await attendre(1500);
verifier('Échap : la fenêtre se ferme et Jupiter n’est plus actif', await ev(() => !document.querySelector('#panneaux .pn[data-id="jupiter-attente"]') && window.Jupiter.etat().actif === false));

// tablette : même structure par terminal-2d
await ev(() => window.Galaxie.regler({ appareil: 'tablette' }));
await ev(() => window.Galaxie.nav.allerA('jupiter', { entrer: true })); await attendreJupiter();
verifier('tablette : la même fenêtre honnête (module terminal-2d)', await ev(() => !!document.querySelector('#panneaux .pn[data-id="jupiter-attente"]')));
await page.keyboard.press('Escape'); await attendre(1200);
const graves = erreurs.filter(e => !/favicon|ERR_FAILED|Failed to load resource|404|WebGL|GPU stall|faireconomy|CORS policy/i.test(e));
verifier('aucune erreur JavaScript', graves.length === 0, graves.slice(0, 3).join(' | '));
await navigateur.close(); fin();
