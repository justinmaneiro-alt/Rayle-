// Capture de l'ANCIEN design (worktree du tag sur le port 8010). node outils-restructuration/capture-ancien.mjs <sortie.png> [couleur] [appareil]
process.env.BASE = 'http://127.0.0.1:8010';
const { ouvrirAppareil } = await import('../tests-navigateur/v7b-aide.mjs');
const [sortie, couleur = 'ambre', cle = 'pc1600'] = process.argv.slice(2);
const o = await ouvrirAppareil(cle, { attente: 6000, storage: { rayle_theme: 'aurore', rayle_g1_couleur: couleur } });
await o.page.screenshot({ path: sortie }); console.log('ok', await o.page.evaluate(() => document.body.className + ' | ' + document.body.dataset.g1c)); await o.navigateur.close();
