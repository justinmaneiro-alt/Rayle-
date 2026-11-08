/* Phase E dans Chrome : couche « carte de chaleur », enregistrement du vrai carnet (1 colonne / s), écriture IndexedDB, réglage de la limite,
   effacement, aucune pause > 0,8 s. */
export default async function ({ verifier, w, ouvrirTerminal, nav }) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { init: () => { if (!sessionStorage.getItem('initE')) { sessionStorage.setItem('initE', '1'); localStorage.clear(); localStorage.setItem('rayle_term_unite_OR', '"M5"'); indexedDB.deleteDatabase('rayle-terminal-chaleur'); } } });
  await p.waitForFunction(() => window.__terminal.module('chaleur'), { timeout: 30000 });
  verifier(await p.evaluate(() => !window.__terminal.module('chaleur').E.regl.enregistrer), 'rien n’est enregistré avant l’activation');
  await p.evaluate(() => window.__terminal.couche('chaleur', true));
  await p.waitForFunction(() => window.__terminal.etatCarnet(), { timeout: 30000 }); await w(14000);
  const e = await p.evaluate(() => { const C = window.__terminal.module('chaleur'); return { n: C.colonnes().length, regl: C.E.regl, taille: C.E.taille, txt: document.querySelector('[data-d="chaleur"]').textContent }; });
  verifier(e.regl.enregistrer && e.n >= 8, 'enregistrement à partir de l’activation (1 colonne / s)', e.n + ' colonnes');
  verifier(e.taille > 0 && /enregistré depuis/.test(e.txt) && /Pas d’historique ancien/.test(e.txt), 'écrit sur l’appareil, taille et date affichées, « pas d’historique ancien »');
  await p.evaluate(() => { const i = document.querySelector('[data-ch="limiteMo"]'); i.value = '10'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  verifier(await p.evaluate(() => window.__terminal.module('chaleur').E.regl.limiteMo) === 10, 'limite de stockage réglable');
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__terminal && window.__terminal.module('chaleur') && window.__terminal.module('chaleur').colonnes().length > 0, { timeout: 60000 });
  verifier(true, 'carte retrouvée après rechargement');
  p.once('dialog', d => d.accept()); await p.click('[data-ch="effacer"]'); await w(500);
  verifier(await p.evaluate(() => window.__terminal.module('chaleur').E.taille === 0), 'enregistrement effacé');
  const Lg = await p.evaluate(() => window.__longues.slice()); verifier(Math.max(0, ...Lg) < 800, 'phase E : aucune pause > 0,8 s', 'pire ' + Math.max(0, ...Lg) + ' ms');
  await w(5000); await p.screenshot({ path: 'captures-or/terminal-e.png' });
  await ctx.close();
}
