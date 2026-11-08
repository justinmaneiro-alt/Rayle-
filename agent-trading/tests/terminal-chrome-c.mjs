/* Phase C dans Chrome : outil Position (clic → trois lignes + étiquette), déplacement d'une ligne, édition du risque, suivi d'état sur les
   vraies bougies (position posée dans le passé : entrée touchée, stop ou objectif), journal automatique, setup et note, bilans,
   gardien visible, clôture à la main, annulation, export, persistance. */
export default async function ({ verifier, w, ouvrirTerminal, nav }) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { init: () => { if (!sessionStorage.getItem('initC')) { sessionStorage.setItem('initC', '1'); localStorage.clear(); localStorage.setItem('rayle_term_unite_OR', '"M15"'); indexedDB.deleteDatabase('rayle-terminal-outils'); } } });
  await p.waitForFunction(() => window.__terminal.module('positions') && window.__terminal.module('dessin'), { timeout: 30000 });
  const r = await p.evaluate(() => { const b = document.querySelector('[data-graph]').getBoundingClientRect(); return { x: b.left, y: b.top, l: b.width, h: b.height }; });
  await p.click('[data-outil="position"]'); await w(150);
  await p.mouse.click(r.x + r.l * 0.6, r.y + r.h * 0.6); await w(400);
  const P1 = await p.evaluate(() => window.__terminal.module('positions').positions().map(x => ({ id: x.id, etat: x.etat, entree: x.entree, stop: x.stop, objectif: x.objectif, risquePct: x.risquePct, capital: x.capital })));
  verifier(P1.length === 1 && P1[0].etat === 'attente' && P1[0].risquePct === 0.5 && P1[0].capital === 10000, 'clic « Position » : position en attente, 0,5 % de 10 000 $');
  verifier(Math.abs((P1[0].objectif - P1[0].entree) / (P1[0].entree - P1[0].stop) - 2) < 1e-6, 'objectif par défaut à 2 R');
  const ed = await p.evaluate(() => document.querySelector('[data-edition]').textContent);
  verifier(/R · risque \d+ \$ · [\d ,]+ contrats/.test(ed), 'étiquette : R, risque en $, taille en contrats', ed.match(/[\d,]+ R · risque.*contrats/) && ed.match(/[\d,]+ R · risque.*contrats/)[0]);
  // déplacer la ligne de stop
  const yS = await p.evaluate(s => window.__terminal.graph.yDe(s), P1[0].stop);
  await p.click('[data-pa="fermer"]'); await w(100);
  await p.mouse.move(r.x + r.l * 0.75, r.y + yS); await p.mouse.down(); await p.mouse.move(r.x + r.l * 0.75, r.y + yS + 25, { steps: 5 }); await p.mouse.up(); await w(300);
  const s2 = await p.evaluate(id => window.__terminal.module('positions').positions().find(x => x.id === id).stop, P1[0].id);
  verifier(Math.abs(s2 - P1[0].stop) > 0, 'ligne de stop déplacée à la souris', `${P1[0].stop.toFixed(2)} → ${s2.toFixed(2)}`);
  // risque modifiable
  await p.evaluate(() => { const i = document.querySelector('[data-edition] [data-p="risquePct"]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await w(200);
  verifier(await p.evaluate(id => window.__terminal.module('positions').positions().find(x => x.id === id).risquePct, P1[0].id) === 1, 'risque modifiable (1 %)');
  // setup + note → journal
  await p.evaluate(() => { const s = document.querySelector('[data-edition] [data-p="setup"]'); s.value = 'W/M'; s.dispatchEvent(new Event('change', { bubbles: true })); const n = document.querySelector('[data-edition] [data-p="note"]'); n.value = 'test note'; n.dispatchEvent(new Event('change', { bubbles: true })); }); await w(200);
  // annuler (retirer)
  await p.click('[data-pa="annuler"]'); await w(300);
  verifier(await p.evaluate(id => window.__terminal.module('positions').positions().find(x => x.id === id).etat, P1[0].id) === 'annulee', 'retirée avant l’entrée : annulée');
  // suivi sur les vraies bougies : position posée 40 bougies plus tôt, entrée au prix d'une bougie passée
  const suivi = await p.evaluate(async () => {
    const T = window.__terminal, M = T.module('positions'), B = T.serie().bougies(), ms = T.graph.ms(), i = B.length - 40, b = B[i], a = T.atr();
    const pos = await M.creer({ entree: b.c, stop: b.c - a * 0.5, objectif: b.c + a * 0.5, cree: b.t - ms, setup: 'autre' });
    // la date de création dans le passé
    const P = M.positions().find(x => x.id === pos.id); P.cree = b.t - ms; await M.suivreTout(); await new Promise(r => setTimeout(r, 300));
    const q = M.positions().find(x => x.id === pos.id); return { etat: q.etat, lignes: M.lignes().filter(l => l.position === pos.id).map(l => l.evenement), id: pos.id };
  });
  verifier(['ouverte', 'objectif', 'stop'].includes(suivi.etat) && suivi.lignes.includes('ouverte'), 'suivi d’état sur les vraies bougies (entrée touchée)', suivi.etat + ' · ' + suivi.lignes.join());
  verifier(suivi.etat === 'ouverte' || suivi.lignes.includes(suivi.etat), 'ligne de journal ajoutée à chaque changement');
  if (suivi.etat === 'ouverte') { await p.evaluate(id => window.__terminal.module('positions').actionner(id, 'cloturer'), suivi.id); await w(300); verifier(await p.evaluate(id => window.__terminal.module('positions').positions().find(x => x.id === id).etat, suivi.id) === 'cloturee', 'clôturée à la main'); }
  await p.evaluate(() => window.__terminal.ongletBas('journal')); await w(300);
  const j = await p.evaluate(() => document.querySelector('[data-panneau="journal"]').textContent);
  verifier(/Gardien/.test(j) && /limite du défi 6 %/.test(j) && /alerte 2 %/.test(j), 'gardien de drawdown visible (2 %, 3 %, 6 %)');
  verifier(/Bilan par setup/.test(j) && /pas assez de données/.test(j), 'bilans par setup, actif, heure (« pas assez de données »)');
  verifier(/test note/.test(j) && /W\/M/.test(j), 'setup et note dans le journal');
  verifier(await p.evaluate(() => !!document.querySelector('[data-gardien]').textContent), 'badge du gardien dans la barre du haut');
  const dl = await p.evaluate(() => { const ex = window.__terminal.module('positions'); return ex.lignes().length; });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__terminal && window.__terminal.module('positions'), { timeout: 60000 }); await w(500);
  verifier(await p.evaluate(() => window.__terminal.module('positions').lignes().length) === dl, 'journal retrouvé après rechargement');
  const Lg = await p.evaluate(() => window.__longues.slice()); verifier(Math.max(0, ...Lg) < 800, 'phase C : aucune pause > 0,8 s', 'pire ' + Math.max(0, ...Lg) + ' ms');
  await p.screenshot({ path: 'captures-or/terminal-c.png' });
  await ctx.close();
}
