/* Phase D dans Chrome : questions (texte local sans Worker ; IA simulée dont les chiffres sont vérifiés), scénarios tracés et effacés,
   zoom, surlignage, couches, unité et actif, position proposée à valider d'un clic, refus d'ordre, alertes parlées, annonce à 15 min,
   mémoire du jour retrouvée après rechargement, Rayle branchée dans la vue Terminal de index.html. */
export default async function ({ verifier, w, ouvrirTerminal, nav }) {
  const ctx = await nav.createBrowserContext();
  const p = await ouvrirTerminal(ctx, { init: () => {
    window.__dit = []; window.speak = async t => { window.__dit.push(t); };
    window.__ia = 'aucune'; window.wfetch = async (chemin, o) => { if (window.__ia === 'aucune') throw new Error('Worker absent'); const b = JSON.parse(o.body); window.__ctx = b.context;
      const rep = window.__ia === 'invente' ? 'Je vise 1 234 567 pour demain.' : 'Le prix est à ' + (b.context.match(/prix ([\d  ,]+)/) || [, ''])[1].trim() + ' et je vois deux scénarios. Information de lecture, pas une promesse.';
      return { ok: true, json: async () => ({ reply: rep }) }; };
    if (!sessionStorage.getItem('initD')) { sessionStorage.setItem('initD', '1'); localStorage.clear(); localStorage.setItem('rayle_term_unite_OR', '"M15"'); indexedDB.deleteDatabase('rayle-terminal-outils'); } } });
  await p.waitForFunction(() => window.__terminal.module('rayle') && window.__terminal.module('positions') && window.__terminal.module('dessin'), { timeout: 30000 });
  const R = (txt, force = false) => p.evaluate((x, f) => window.__terminal.module('rayle').commande(x, { force: f }), txt, force);
  // niveaux autour du prix (mes outils)
  await p.evaluate(() => { const T = window.__terminal, a = T.atr(), px = T.prix(), D = T.module('dessin'); D.creerObjet('horizontale', { p: px - 1.5 * a, etiquette: 'support test' }); D.creerObjet('horizontale', { p: px + 1.5 * a, etiquette: 'résistance test' }); });
  await w(300);
  // sans Worker : texte local
  let r = await R('comment tu le sens aujourd’hui ?');
  verifier(/pas une promesse/.test(r) && /Scénario A/.test(r), 'sans Worker : réponse locale avec scénarios', r.slice(0, 120));
  const sc = await p.evaluate(() => window.__terminal.module('rayle').scenarios());
  verifier(sc.length >= 1 && sc.length <= 2 && sc.every(s => s.stop && s.cible && s.validation && s.invalidation), 'un ou deux scénarios tracés (niveaux, validation, invalidation, stop, cible)');
  // IA simulée, chiffres vérifiés
  await p.evaluate(() => { window.__ia = 'bonne'; }); r = await R('où on en est ?');
  const ctxTxt = await p.evaluate(() => window.__ctx || '');
  verifier(/SMA 200|Au-dessus/.test(ctxTxt) && /Carnet/.test(ctxTxt) && /Consignes/.test(ctxTxt), 'état structuré envoyé comme contexte à /chat');
  verifier(/deux scénarios/.test(r), 'réponse de l’IA acceptée (chiffres présents dans le contexte)');
  await p.evaluate(() => { window.__ia = 'invente'; }); r = await R('ton avis ?');
  verifier(!/1 234 567/.test(r) && /pas une promesse/.test(r), 'chiffre inventé par l’IA : remplacé par la lecture locale');
  verifier(/absents du terminal/.test(await p.evaluate(() => document.querySelector('[data-panneau="rayle"]').textContent)), 'source affichée : chiffres refusés');
  await p.evaluate(() => { window.__ia = 'aucune'; });
  r = await R("qu'est-ce qui se passe sur le carnet ?"); verifier(/carnet/i.test(r), 'question sur le carnet', r.slice(0, 100));
  // actions
  r = await R('efface les scénarios'); verifier(await p.evaluate(() => window.__terminal.module('rayle').scenarios().length) === 0, 'scénarios effacés en une phrase');
  r = await R('trace les scénarios'); verifier(await p.evaluate(() => window.__terminal.module('rayle').scenarios().length) > 0 && /scénario Rayle/.test(r), 'scénarios tracés, étiquetés « scénario Rayle »');
  await p.evaluate(() => window.__terminal.ongletBas('rayle')); await w(200); await p.click('[data-ra="effacer"]'); await w(150);
  verifier(await p.evaluate(() => window.__terminal.module('rayle').scenarios().length) === 0, 'effaçables en un clic');
  r = await R('surligne la résistance'); verifier(/surligne/.test(r), 'surligner un niveau', r);
  r = await R('zoome sur le support'); verifier(/zoome/.test(r), 'zoomer sur une zone', r);
  r = await R('affiche la MA200'); await w(500); verifier(await p.evaluate(() => window.__terminal.couches().ma200), 'afficher une couche à la voix');
  r = await R('masque la MA200'); await w(300); verifier(await p.evaluate(() => !window.__terminal.couches().ma200), 'masquer une couche à la voix');
  r = await R('passe en H1'); await p.waitForFunction(() => window.__terminal.unite() === 'H1' && window.__terminal.graph.etat().n > 50, { timeout: 60000 }); verifier(true, 'changer d’unité à la voix');
  r = await R('achète du bitcoin'); verifier(/jamais d’ordre/.test(r) && await p.evaluate(() => window.__terminal.actif()) === 'OR', 'ordre refusé, rien ne change');
  r = await R('propose-moi une position'); await w(300);
  const prop = await p.evaluate(() => window.__terminal.module('positions').positions().filter(x => x.etat === 'proposee'));
  verifier(prop.length === 1 && prop[0].origine === 'rayle' && /aucun ordre/.test(r), 'position pré-remplie proposée, à valider');
  await p.waitForSelector('[data-pa="valider"]'); await p.click('[data-pa="valider"]'); await w(300);
  verifier(await p.evaluate(id => window.__terminal.module('positions').positions().find(x => x.id === id).etat, prop[0].id) === 'attente', 'validée d’un clic');
  r = await R('passe sur le bitcoin'); await p.waitForFunction(() => window.__terminal.actif() === 'BTC', { timeout: 30000 }); verifier(true, 'changer d’actif à la voix');
  // alertes parlées
  await p.evaluate(() => { const D = window.__terminal.module('dessin'); D.E.regl.voix = true; D.alerter({ id: 'test|touche|1', objet: 'x', type: 'touche', actif: 'BTC', unite: 'M15', t: Date.now(), tFin: Date.now(), prix: 1, texte: 'Bitcoin touche 70 000', phrase: 'Bitcoin touche 70 000.' }); });
  await w(300); verifier(await p.evaluate(() => window.__dit.includes('Bitcoin touche 70 000.')), 'alerte importante annoncée à la voix (si activé)');
  await p.evaluate(() => { const D = window.__terminal.module('dessin'); D.E.regl.voix = false; window.__dit.length = 0; D.alerter({ id: 'test|touche|2', objet: 'y', type: 'touche', actif: 'BTC', unite: 'M15', t: Date.now(), tFin: Date.now(), prix: 1, texte: 'x', phrase: 'muet' }); });
  await w(200); verifier(await p.evaluate(() => !window.__dit.includes('muet')), 'voix désactivée : rien n’est dit');
  // mémoire du jour
  const m = await p.evaluate(() => window.__terminal.module('rayle').memoire().length);
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__terminal && window.__terminal.module('rayle'), { timeout: 60000 }); await w(300);
  verifier(m > 3 && await p.evaluate(() => window.__terminal.module('rayle').memoire().length) === m, 'mémoire du jour retrouvée après rechargement', m + ' entrées');
  const Lg = await p.evaluate(() => window.__longues.slice()); verifier(Math.max(0, ...Lg) < 800, 'phase D : aucune pause > 0,8 s', 'pire ' + Math.max(0, ...Lg) + ' ms');
  await p.screenshot({ path: 'captures-or/terminal-d.png' });
  // dans Rayle : la phrase passe par le terminal ouvert
  const q = await ctx.newPage(); await q.setViewport({ width: 1600, height: 900 });
  await q.goto(p.url().replace(/agent-trading\/front\/terminal\.html.*/, 'index.html'), { waitUntil: 'domcontentloaded' }); await w(2500);
  await q.evaluate(() => RayleBus.demander('vue:ouvrir', 'terminal')); await q.waitForFunction(() => window.TerminalRayle && window.TerminalRayle.module('rayle'), { timeout: 60000 });
  verifier(true, 'Rayle : module branché dans la vue Terminal (phrase.js l’interroge en premier)');
  await ctx.close();
}
