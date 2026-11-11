import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const o = await ouvrirAppareil('pc', { attente: 2500, storage: { rayle_worker_url: 'http://127.0.0.1:8788', rayle_worker_token: 'essai' } });
console.log(await o.page.evaluate(async () => { try { await EtatSources.afficher(false); return document.getElementById('etatSources').innerText.slice(0, 300); } catch (e) { return 'ERR ' + e.message; } }));
console.log(o.erreurs.slice(0, 5)); await o.navigateur.close();
