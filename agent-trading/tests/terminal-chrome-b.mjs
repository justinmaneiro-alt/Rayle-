/* Phase B dans Chrome (appelé par terminal-chrome-test.mjs B) : chaque outil dessiné à la souris, sélection, déplacement, édition,
   gomme, annuler / rétablir, tout effacer (confirmation), persistance après rechargement, zone de réaction → objet, alertes sur un objet
   posé dans le passé (historique, cloche, registre en ajout seul), aucune pause > 0,8 s. */
export default async function ({ verifier, w, ouvrirTerminal, nav }) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { init: () => { if (!sessionStorage.getItem('initB')) { sessionStorage.setItem('initB', '1'); localStorage.clear(); localStorage.setItem('rayle_term_unite_OR', '"M15"'); indexedDB.deleteDatabase('rayle-terminal-outils'); } } });
  await p.waitForFunction(() => window.__terminal.module('dessin'), { timeout: 30000 });
  const zone = await p.evaluate(() => { const r = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; });
  const pt = (fx, fy) => [zone.x + zone.l * fx, zone.y + zone.h * fy];
  const outil = async o => { await p.click(`[data-outil="${o}"]`); await w(150); };
  const clic = async (fx, fy) => { const [x, y] = pt(fx, fy); await p.mouse.move(x, y); await w(60); await p.mouse.down(); await w(40); await p.mouse.up(); await w(120); };
  const objets = () => p.evaluate(() => window.__terminal.module('dessin').objets().map(o => ({ id: o.id, type: o.type, p: o.p, bas: o.bas, haut: o.haut, t1: o.t1, t2: o.t2, alertes: o.alertes, texte: o.texte })));
  // chaque outil
  await outil('horizontale'); await clic(0.4, 0.3);
  await outil('zone'); await clic(0.3, 0.55); await clic(0.5, 0.6);
  await outil('tendance'); await clic(0.2, 0.7); await clic(0.5, 0.5);
  await outil('rayon'); await clic(0.25, 0.4); await clic(0.45, 0.35);
  await outil('verticale'); await clic(0.6, 0.5);
  await outil('texte'); await clic(0.35, 0.2); await p.type('[data-edition] input', 'Note test'); await p.keyboard.press('Enter'); await w(200);
  let L = await objets();
  verifier(['horizontale', 'zone', 'tendance', 'rayon', 'verticale', 'texte'].every(t => L.some(o => o.type === t)), 'chaque outil dessine son objet à la souris', L.map(o => o.type).join());
  verifier(L.filter(o => ['horizontale', 'zone', 'tendance', 'rayon'].includes(o.type)).every(o => o.alertes.approche && o.alertes.touche && o.alertes.rebond && o.alertes.cassure), 'alertes actives par défaut sur chaque objet de niveau');
  verifier(await p.evaluate(() => window.__terminal.outil()) === 'curseur', 'retour au curseur après un dessin');
  // mesure (temporaire, jamais enregistrée)
  await outil('mesure'); await clic(0.3, 0.6); await clic(0.5, 0.4);
  verifier(await p.evaluate(() => !!window.__terminal.module('dessin').E.mesure) && (await objets()).length === L.length, 'mesure affichée, non enregistrée');
  // sélection + déplacement d'une ligne horizontale
  await p.keyboard.press('Escape'); await w(100);
  const h0 = L.find(o => o.type === 'horizontale');
  const yH = await p.evaluate(pp => window.__terminal.graph.yDe(pp), h0.p);
  await p.mouse.move(zone.x + zone.l * 0.15, zone.y + yH); await w(80); await p.mouse.down(); await p.mouse.move(zone.x + zone.l * 0.15, zone.y + yH + 40, { steps: 6 }); await p.mouse.up(); await w(300);
  const h1 = (await objets()).find(o => o.id === h0.id);
  verifier(h1.p < h0.p, 'ligne déplacée à la souris', `${h0.p.toFixed(2)} → ${h1.p.toFixed(2)}`);
  verifier(await p.evaluate(() => !document.querySelector('[data-edition]').hidden), 'panneau d’édition ouvert sur l’objet sélectionné');
  // édition : prix, étiquette, épaisseur, m'alerter
  await p.evaluate(() => { const set = (s, v) => { const e = document.querySelector('[data-edition] ' + s); if (e.type === 'checkbox') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }; set('[data-e="p"]', '4000'); set('[data-e="etiquette"]', 'S majeur'); set('[data-e="epaisseur"]', '2'); set('[data-e="alerte"]', true); set('[data-al="approche"]', false); });
  await w(200);
  const h2 = (await objets()).find(o => o.id === h0.id), h2b = await p.evaluate(id => window.__terminal.module('dessin').objets().find(o => o.id === id), h0.id);
  verifier(h2.p === 4000 && h2b.etiquette === 'S majeur' && h2b.epaisseur === 2 && h2b.alerte && h2b.alertes.approche === false, 'édition : prix, étiquette, épaisseur, m’alerter, alerte par type');
  // annuler / rétablir
  await p.keyboard.press('Escape'); await p.keyboard.down('Control'); await p.keyboard.press('z'); await p.keyboard.up('Control'); await w(200);
  verifier((await objets()).find(o => o.id === h0.id).alertes.approche === true, 'Ctrl+Z annule la dernière modification');
  await p.click('[data-a="retablir"]'); await w(200);
  verifier((await objets()).find(o => o.id === h0.id).alertes.approche === false, 'rétablir');
  // gomme
  const n0 = (await objets()).length; const v = L.find(o => o.type === 'verticale');
  const xV = await p.evaluate(t => window.__terminal.graph.xDe(t), v.t1);
  await outil('gomme'); await p.mouse.click(zone.x + xV, zone.y + zone.h * 0.8); await w(250);
  verifier((await objets()).length === n0 - 1 && !(await objets()).some(o => o.id === v.id), 'gomme : supprime l’objet touché');
  // persistance
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__terminal && window.__terminal.module('dessin') && window.__terminal.module('dessin').objets().length > 0, { timeout: 60000 });
  verifier((await objets()).length === n0 - 1, 'objets retrouvés après rechargement (IndexedDB, par actif)');
  await p.evaluate(() => window.__terminal.choisirActif('BTC')); await p.waitForFunction(() => window.__terminal.graph.etat().actif === 'BTC' && window.__terminal.module('dessin').objets().length === 0, { timeout: 60000 });
  verifier(true, 'objets propres à chaque actif (BTC sans dessin)');
  await p.evaluate(() => window.__terminal.choisirActif('OR')); await p.waitForFunction(() => window.__terminal.graph.etat().actif === 'OR' && window.__terminal.graph.etat().n > 50 && window.__terminal.module('dessin').objets().length > 0, { timeout: 60000 });
  // zones de réaction
  await p.evaluate(() => window.__terminal.couche('zonesVol', true)); await w(1500);
  const zr = await p.evaluate(() => window.__terminal.module('dessin').zones().map(z => ({ tests: z.tests, tenues: z.tenues, p: z.p })));
  verifier(zr.length > 0 && zr.every(z => z.tenues <= z.tests), 'zones de réaction « testée N fois, a tenu M »', JSON.stringify(zr.slice(0, 3)));
  if (zr.length) {
    await p.evaluate(() => window.__terminal.module('dessin').choisirZone(window.__terminal.module('dessin').zones()[0])); await w(150);
    const txt = await p.evaluate(() => document.querySelector('[data-edition]').textContent);
    verifier(/testée \d+ fois, a tenu \d+/.test(txt) && !/%/.test(txt.replace(/\d+ %/, '')), 'boîte : statistiques réelles, aucun pourcentage');
    const avant = (await objets()).length; await p.click('[data-edition] [data-z]'); await w(300);
    const o = (await p.evaluate(() => window.__terminal.module('dessin').objets().slice(-1)[0]));
    verifier((await objets()).length === avant + 1 && o.origine === 'zone-reaction' && o.alertes.rebond, 'zone choisie → mon objet avec les mêmes alertes');
  }
  // alertes : ligne posée dans le passé sur le prix des dernières bougies M15 → événements récents → alerte
  const res = await p.evaluate(async () => {
    const T = window.__terminal, D = T.module('dessin'), B = T.serie().bougies(), ms = T.graph.ms(), now = Date.now();
    const fermees = B.filter(b => b.t + ms <= now), der = fermees[fermees.length - 1];
    D.creerObjet('horizontale', { p: der.l, cree: der.t - 30 * ms, unite: T.unite(), etiquette: 'test alerte' });
    await D.surveillerTout(); await new Promise(r => setTimeout(r, 400));
    const reg = await D.st.tout('registre');
    return { reg: reg.length, alertes: D.E.alertes.length, cloche: document.querySelector('[data-alertes-n]').hidden ? 0 : +document.querySelector('[data-alertes-n]').textContent, types: [...new Set(reg.map(e => e.type))] };
  });
  verifier(res.reg > 0, 'registre : événements inscrits', res.types.join());
  verifier(res.alertes > 0 && res.cloche > 0, 'alerte émise (historique + cloche)', `${res.alertes} alertes`);
  const doublon = await p.evaluate(async () => { const D = window.__terminal.module('dessin'), n = D.E.alertes.length; await D.surveillerTout(); return D.E.alertes.length === n; });
  verifier(doublon, 'nouvelle surveillance : aucune alerte en double');
  await p.evaluate(() => window.__terminal.ongletBas('alertes')); await w(300);
  const pa = await p.evaluate(() => document.querySelector('[data-panneau="alertes"]').textContent);
  verifier(/pas un signal ni une promesse/.test(pa) && /tant que Rayle est ouvert/.test(pa), 'mentions affichées');
  verifier(await p.evaluate(() => !document.querySelector('[data-r="telegram"]').checked), 'Telegram désactivé par défaut');
  await p.evaluate(() => window.__terminal.ongletBas('registre')); await w(600);
  verifier(/pas assez de données/.test(await p.evaluate(() => document.querySelector('[data-panneau="registre"]').textContent)), 'bilan par type d’outil : « pas assez de données » sous 30');
  // tout effacer avec confirmation
  p.once('dialog', d => d.dismiss()); await p.click('[data-a="tout-effacer"]'); await w(300);
  const nAv = (await objets()).length; verifier(nAv > 0, 'tout effacer : refus de la confirmation = rien supprimé');
  p.once('dialog', d => d.accept()); await p.click('[data-a="tout-effacer"]'); await w(300);
  verifier((await objets()).length === 0, 'tout effacer : confirmé');
  const reg2 = await p.evaluate(async () => (await window.__terminal.module('dessin').st.tout('registre')).length);
  verifier(reg2 === res.reg, 'le registre n’est jamais effacé (ajout seul)');
  const Lg = await p.evaluate(() => window.__longues.slice()); verifier(Math.max(0, ...Lg) < 800, 'phase B : aucune pause > 0,8 s', 'pire ' + Math.max(0, ...Lg) + ' ms');
  await p.screenshot({ path: 'captures-or/terminal-b.png' });
  await ctx.close();
}
