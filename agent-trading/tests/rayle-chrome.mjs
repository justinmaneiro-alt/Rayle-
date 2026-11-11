/* Test Chrome de la stratégie Rayle v1 : moyenne mobile et événements (phase 1), boîtes et ligne de retournement (phase 2), carnet (3), feuille de décision (4), scénarios (5), voix (6).
   Série H1 injectée (aucun réseau). PC 1600 px et téléphone 390 px. Épuré : 12 objets au plus (hors bougies et moyenne mobile), aucune étiquette ne chevauche une autre. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const H = 3600e3, fin = Math.floor(Date.now() / H) * H - H, N = 24 * 45;
let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
let c = 4000; const cl = []; for (let i = 0; i < N; i++) { c += (rnd() - 0.5) * 9 + Math.sin(i / 37) * 3.2; cl.push(c); }
const serie = cl.map((x, i) => { const o = i ? cl[i - 1] : x; return { t: fin - (N - 1 - i) * H, o, h: Math.max(o, x) + rnd() * 3, l: Math.min(o, x) - rnd() * 3, c: x, v: 80 + rnd() * 80 }; });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); p.__err = []; p.on('pageerror', e => p.__err.push(e.message));
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/^rayle_or_/.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__or && window.__or.strategie && window.__or.structure && window.__or.structure.etat().stats && window.__or.strategie.etat().stats.ma && window.__or.graph.etat().bougies.length > 20, { timeout: 40000 }).catch(() => {});
  return p;
}
const chevauche = (a, b) => a.x0 < b.x0 + b.w && a.x0 + a.w > b.x0 && a.y0 < b.y0 + b.h && a.y0 + a.h > b.y0;
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  const p = await ouvrir(l, h, mob);
  v(await p.evaluate(() => !!document.querySelector('[data-rayle]') && !!document.querySelector('[data-graph-barre] [data-a="ray-vue"]')), `${l}px : panneau Rayle et bouton Épuré / Complet collé au graphique`);
  v(await p.evaluate(() => ['rayMa', 'rayBoites'].every(k => document.querySelector(`[data-couche="${k}"]`).checked) && !document.querySelector('[data-couche="rayScenarios"]').checked && ['ictLiquidite', 'schemas', 'rsi'].every(k => !document.querySelector(`[data-couche="${k}"]`).checked)), `${l}px : couches Rayle par défaut ; ICT, RSI et schémas restent décochés (aucune couche supprimée)`);
  await p.evaluate(b => { window.__or.structure.injecterH1(b); window.__or.structure.maj(true); window.__or.strategie.maj(true); }, serie); await p.waitForFunction(() => window.__or.graph.rayleEtat().cadres > 0, { timeout: 8000 }).catch(() => {}); await w(300);
  const e1 = await p.evaluate(() => window.__or.graph.rayleEtat()); v((e1.types.ma || 0) === 1, `${l}px : la moyenne mobile est dessinée (${JSON.stringify(e1.types)})`);
  const st = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { evts: E.res.events.length, types: [...new Set(E.res.events.map(e => e.type))], aff: E.m.evenements.length, vue: E.reg.vue }; });
  v(st.evts >= 5 && st.types.includes("cassure"), `${l}px : événements calculés sur ${serie.length} bougies (${JSON.stringify(st)})`);
  v(st.vue === 'epure' && st.aff <= 2, `${l}px : Épuré par défaut, ${st.aff} événement(s) affiché(s)`);
  v(await p.evaluate(() => window.__or.strategie.compterObjets() <= 12), `${l}px : Épuré : 12 objets au plus hors bougies et moyenne mobile`);
  const E1 = await p.evaluate(() => window.__or.graph.rayleEtat()); let rien = true; for (let i = 0; i < E1.etiquettes.length; i++) for (let j = i + 1; j < E1.etiquettes.length; j++) if (chevauche(E1.etiquettes[i], E1.etiquettes[j])) rien = false;
  v(rien, `${l}px : aucune étiquette ne chevauche une autre (${E1.etiquettes.length} étiquettes)`);
  const tx = await p.evaluate(() => document.querySelector('[data-rayle]').innerText); v(/moyenne mobile 200/i.test(tx) && /en observation/i.test(tx) && !/(achète|vends|achetez|vendez)/i.test(tx), `${l}px : texte du panneau (observation, jamais un ordre)`);
  // Complet
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(500);
  const st2 = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { vue: E.reg.vue, aff: E.m.evenements.length }; }); v(st2.vue === 'complet' && st2.aff >= st.aff, `${l}px : Complet affiche tout ce que Rayle calcule (${st2.aff} événements)`);
  const E2 = await p.evaluate(() => window.__or.graph.rayleEtat()); let rien2 = true; for (let i = 0; i < E2.etiquettes.length; i++) for (let j = i + 1; j < E2.etiquettes.length; j++) if (chevauche(E2.etiquettes[i], E2.etiquettes[j])) rien2 = false; v(rien2, `${l}px : Complet : aucune étiquette ne chevauche une autre`);
  await p.screenshot({ path: `captures-or/rayle-${l}-complet.png` });
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(400);
  await p.screenshot({ path: `captures-or/rayle-${l}.png` });
  // ── phase 2 : boîtes, ligne de retournement, bandeau ──
  await p.evaluate(() => { const E = window.__or.strategie.etat(), z = E.zones.find(q => !q.invalide); window.__or.strategie.injecterPrix(z ? (z.cote === 'vente' ? z.bas - 1.2 * z.atr : z.haut + 1.2 * z.atr) : E.B[E.B.length - 1].c); }); await w(500);   // le prix est placé à 1,2 ATR d'une zone valide
  const z2 = await p.evaluate(() => { const E = window.__or.strategie.etat(); return { zones: E.zones.length, bandeau: E.bandeau, ligne: E.m.ligne && E.m.ligne.texte, structure: E.m.structure.length, boites: E.m.boites.length, vue: E.reg.vue, objets: window.__or.strategie.compterObjets() }; });
  v(/Tendance H4 .* · H1 .*mouvement en cours/.test(z2.bandeau), `${l}px : bandeau d'état (tendance H1/H4, ligne, prochaine zone, mouvement) : ${z2.bandeau.slice(0, 120)}`);
  v(z2.structure <= 3 && (z2.ligne == null || /^Retournement (baissier|haussier)/.test(z2.ligne)), `${l}px : ligne de retournement unique et au plus 3 cassures étiquetées (${z2.ligne})`);
  v(z2.objets <= 12, `${l}px : Épuré : ${z2.objets} objets (12 au plus)`);
  v(z2.boites <= 5, `${l}px : Épuré : au plus 2 boîtes de chaque côté plus la golden zone (${z2.boites})`);
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(500);
  const z3 = await p.evaluate(() => { const E = window.__or.strategie.etat(), g = window.__or.graph.rayleEtat(); return { zones: E.zones.length, boites: E.m.boites.length, types: g.types, vue: E.reg.vue, bandeauCache: document.querySelector('[data-ray-bandeau]').hidden, etiq: g.etiquettes, boitesTxt: E.m.boites.map(b => b.etiquette) }; });
  v(z3.vue === 'complet' && z3.zones > 0 && z3.boites > 0 && (z3.types.boite || 0) > 0, `${l}px : Complet : les boîtes sont dessinées (zones ${z3.zones}, boîtes ${z3.boites} ; ${JSON.stringify(z3.boitesTxt.slice(0, 3))} ; ${JSON.stringify(z3.types)})`);
  v(z3.boitesTxt.every(t => /^(Zone de (vente|achat) · (\d+ % · n = \d+|pas de mesure)|Golden zone)/.test(t)), `${l}px : une seule étiquette « Zone de vente · 60 % · n = 20 » par boîte`);
  let rien3 = true; for (let i = 0; i < z3.etiq.length; i++) for (let j = i + 1; j < z3.etiq.length; j++) if (chevauche(z3.etiq[i], z3.etiq[j])) rien3 = false; v(rien3, `${l}px : Complet avec boîtes : aucune étiquette ne chevauche une autre (${z3.etiq.length})`);
  await p.screenshot({ path: `captures-or/rayle-${l}-boites.png` });
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(300);
  // ── phase 3 : lecture du carnet à l'arrivée sur une boîte (carnet et transactions injectés) ──
  const r3 = await p.evaluate(() => {
    const S = window.__or.strategie, E = S.etat(), z = E.zones.find(q => !q.invalide); if (!z) return { sansZone: true };
    const mid = z.cote === 'vente' ? z.bas - 0.1 * z.atr : z.haut + 0.1 * z.atr, bids = [], asks = [];
    for (let k = 0; k < 60; k++) { bids.push([mid - 0.05 - k * 0.25, 5 + (k % 3)]); asks.push([mid + 0.05 + k * 0.25, 5 + (k % 3)]); } asks.push([mid + 0.3, 500]);
    const now = Date.now(), trades = []; for (let k = 0; k < 30; k++) trades.push({ t: now - 280e3 + k * 9e3, p: mid - k * 0.2, q: 14, cote: 'sell' });
    S.injecterPrix(mid); S.carte.injecter({ carnet: { bids: new Map(bids), asks: new Map(asks), pret: true }, trades });
    const l1 = S.carte.tick(), n1 = S.carte.registre().filter(r => r.kind === 'arrivee').length; S.carte.tick(); const n2 = S.carte.registre().filter(r => r.kind === 'arrivee').length;
    const c = document.querySelector('[data-ray-carte]'); return { l: l1 && l1.texte, pression: l1 && l1.pression, visible: c && !c.hidden, bougie: c && c.querySelector('.tor-ray-bougie') && c.querySelector('.tor-ray-bougie').className, texteCarte: c && c.innerText, n1, n2, rapport: S.carte.rapport().phrases[0], mention: c && /non validée/.test(c.innerText) };
  });
  if (r3.sansZone) v(true, `${l}px : (aucune zone valide dans la série de test, lecture du carnet non exercée)`);
  else {
    v(r3.visible && /pression vendeuse/.test(r3.l) && /rouge/.test(r3.bougie), `${l}px : arrivée sur une boîte : carte visible, mini-bougie rouge, verdict (${(r3.l || '').slice(0, 130)})`);
    v(r3.mention && /Carnet · zone/.test(r3.texteCarte), `${l}px : « lecture en observation, non validée » et titre de la carte`);
    v(r3.n1 === 1 && r3.n2 === 1, `${l}px : enregistreur forward : une arrivée enregistrée, pas de doublon (${r3.n1}, ${r3.n2})`);
    v(/Pas assez de données/.test(r3.rapport), `${l}px : rapport honnête (${r3.rapport.slice(0, 70)})`);
    const fe = await p.evaluate(() => { const el = document.querySelector('[data-ray-feuille]'), S = window.__or.strategie, f = S.feuille(); return { n: el.querySelectorAll('li').length, vertes: el.querySelectorAll('li.ok').length, texte: el.querySelector('.tor-ray-feuille-n').textContent, cond3: f.conditions[2].ok, cote: f.zone && f.zone.cote, contexte: f.contexte, journal: S.feuilleEtat() }; });
    v(fe.n === 5 && fe.contexte && /^\d \/ 5 conditions réunies$/.test(fe.texte) && fe.vertes === parseInt(fe.texte), `${l}px : feuille de décision : 5 conditions, « ${fe.texte} »`);
    v(fe.cond3 === (fe.cote === 'vente'), `${l}px : condition 3 (carnet dans le sens de la boîte) : ${fe.cond3} pour une zone de ${fe.cote} avec pression vendeuse`);
    v(fe.journal && fe.journal.conditions.length === 5 && fe.journal.version === 'feuille-decision-v1', `${l}px : l'état des 5 conditions est prêt pour le journal`);
    await p.screenshot({ path: `captures-or/rayle-${l}-carnet.png` });
    await p.evaluate(() => { const S = window.__or.strategie, far = S.etat().B[S.etat().B.length - 1].c + 5000; S.injecterPrix(far); S.carte.injecter({ carnet: { bids: new Map([[far - 0.25, 5]]), asks: new Map([[far + 0.25, 5]]), pret: true }, trades: [] }); S.carte.tick(); });
    v(await p.evaluate(() => document.querySelector('[data-ray-carte]').hidden), `${l}px : loin de toute boîte, la carte disparaît`);
    v(await p.evaluate(() => /Pas de contexte/.test(document.querySelector('[data-ray-feuille] .tor-ray-feuille-n').textContent)), `${l}px : au milieu, la feuille dit « Pas de contexte »`);
  }
  // journal : à la pose d'une position, l'état des 5 conditions est enregistré
  if (!mob) {
    const j = await p.evaluate(async () => { const f = document.querySelector('[data-journal-bloc] form'); if (!f) return { sansFormulaire: true }; const S = window.__or.strategie; const px = S.etat().B[S.etat().B.length - 1].c;
      f.entree.value = px.toFixed(2); f.stop.value = (px - 15).toFixed(2); f.taille.value = '0.1'; f.etiquette.value = 'autre'; f.requestSubmit(); await new Promise(r => setTimeout(r, 700));
      const T = JSON.parse(localStorage.getItem('rayle_or_journal') || '[]'), d = T[T.length - 1]; return { n: T.length, feuille: d && d.feuille, msg: document.querySelector('[data-j-msg]').textContent }; });
    v(j.sansFormulaire || (j.feuille && j.feuille.conditions.length === 5 && j.feuille.version === 'feuille-decision-v1'), `${l}px : le journal enregistre l'état des 5 conditions à la pose (${j.sansFormulaire ? 'formulaire absent' : JSON.stringify(j.feuille)} ${j.msg || ''})`);
    const rp = await p.evaluate(() => window.__or.strategie.rapportFeuille().phrase); v(/Pas assez de trades/.test(rp), `${l}px : rapport local honnête (${rp.slice(0, 80)})`);
  }
  // ── phase 5 : scénarios dessinés ──
  await p.evaluate(() => window.__or.strategie.injecterPrix(null)); await w(300);
  v(await p.evaluate(() => !document.querySelector('[data-couche="rayScenarios"]').checked && !!document.querySelector('[data-a="ray-scen"]') && !!document.querySelector('[data-ray-hor]')), `${l}px : bouton « Scénarios » et sélecteur 1 j / 3 j / 1 sem collés au graphique, couche décochée par défaut`);
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-scen"]').click()); await p.waitForFunction(() => (window.__or.graph.rayleEtat().types.scenario || 0) > 0, { timeout: 8000 }).catch(() => {}); await w(300);
  const s5 = await p.evaluate(() => { const S = window.__or.strategie, sv = S.scenarios(), g = window.__or.graph.rayleEtat(), reg = S.registreScenarios(); return { couche: document.querySelector('[data-couche="rayScenarios"]').checked, n: sv && sv.actifs.length, ids: sv && sv.actifs.map(a => a.id), etiq: sv && sv.actifs.map(a => a.etiquette), bougies: sv && sv.bougies, cone: sv && sv.cone && sv.cone.length, types: g.types, etiquettes: g.etiquettes, objets: S.compterObjets(), poses: reg.filter(r => r.kind === 'pose').length, horizons: [...new Set(reg.filter(r => r.kind === 'pose').map(r => r.horizon))].sort(), json: JSON.stringify(sv && sv.actifs), fiab: S.fiabiliteScenarios().horizons['1j'].phrase, panneau: document.querySelector('[data-ray-scen-corps]').innerText }; });
  v(s5.couche && s5.n === 2 && s5.ids.join() === 'A,B' && s5.bougies === 24 && s5.cone === 24, `${l}px : le bouton dessine A et B sur 1 jour avec le cône (${s5.cone} bougies)`);
  v((s5.types.scenario || 0) === 2, `${l}px : deux trajets dessinés (${JSON.stringify(s5.types)})`);
  v(s5.etiq.every(e => /^Scénario [AB] · (\d+ % \(hasard \d+ %, n = \d+\)|pas assez de données \(hasard \d+ %\))$/.test(e)), `${l}px : étiquettes avec le hasard à côté (${s5.etiq.join(' | ')})`);
  v(s5.objets <= 12, `${l}px : Épuré avec scénarios : ${s5.objets} objets (12 au plus)`);
  let rien5 = true; for (let i = 0; i < s5.etiquettes.length; i++) for (let j = i + 1; j < s5.etiquettes.length; j++) if (chevauche(s5.etiquettes[i], s5.etiquettes[j])) rien5 = false; v(rien5, `${l}px : scénarios : aucune étiquette ne chevauche une autre (${s5.etiquettes.length})`);
  v(/Scénarios, pas prévisions|scénarios, pas prévisions/.test(s5.panneau) && /Fiabilité des scénarios/.test(s5.panneau) && /pas assez de données/.test(s5.fiab), `${l}px : panneau : « scénarios, pas prévisions » et fiabilité honnête (${s5.fiab.slice(0, 70)})`);
  v(s5.poses === 6 && s5.horizons.join() === '1j,1sem,3j', `${l}px : archive forward : une pose par horizon et par scénario (${s5.poses})`);
  await p.evaluate(() => window.__or.strategie.maj(true)); await w(200);
  const s5b = await p.evaluate(() => { const S = window.__or.strategie; return { json: JSON.stringify(S.scenarios().actifs), poses: S.registreScenarios().filter(r => r.kind === 'pose').length }; });
  v(s5b.json === s5.json && s5b.poses === s5.poses, `${l}px : figés jusqu'à la bougie suivante : même tracé après un nouveau calcul, pas de nouvelle pose`);
  await p.evaluate(() => { const s = document.querySelector('[data-ray-hor]'); s.value = '3j'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await w(500);
  v(await p.evaluate(() => window.__or.strategie.scenarios().bougies === 72 && window.__or.graph.rayleEtat().types.scenario === 2), `${l}px : horizon 3 jours = 72 bougies`);
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(400);
  await p.screenshot({ path: `captures-or/rayle-${l}-scenarios.png` });
  await p.evaluate(() => document.querySelector('[data-graph-barre] [data-a="ray-vue"]').click()); await w(300);
  await p.evaluate(() => { const s = document.querySelector('[data-ray-hor]'); s.value = '1j'; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-graph-barre] [data-a="ray-scen"]').click(); }); await w(400);
  v((await p.evaluate(() => window.__or.graph.rayleEtat())).types.scenario === undefined, `${l}px : un second clic efface les scénarios`);
  // ── phase 6 : Rayle (voix et texte) ──
  const vx = await p.evaluate(async () => { window.speak = () => {}; const o = {}; for (const [k, t] of [['ma', 'Où en est la moyenne mobile ?'], ['carnet', 'Que lit le carnet ici ?'], ['feuille', 'Où en est la feuille de décision ?'], ['scen', 'Montre-moi les scénarios'], ['expl', 'Explique le scénario A'], ['autre', 'on en est où ?']]) o[k] = await window.TableauOr.commande(t); o.couche = document.querySelector('[data-couche="rayScenarios"]').checked; return o; });
  v(/moyenne mobile 200 H1/.test(vx.ma) && /ATR/.test(vx.ma), `${l}px : « Où en est la moyenne mobile ? » : ${String(vx.ma).slice(0, 100)}…`);
  v(typeof vx.carnet === 'string' && /(carnet|boîte|Résistance|Support)/.test(vx.carnet), `${l}px : « Que lit le carnet ici ? » : ${String(vx.carnet).slice(0, 100)}…`);
  v(/(\d \/ 5 conditions réunies|Pas de contexte)/.test(vx.feuille) && /jamais un ordre/.test(vx.feuille), `${l}px : « Où en est la feuille de décision ? » : ${String(vx.feuille).slice(0, 100)}…`);
  v(vx.couche && /Scénario A · /.test(vx.scen) && /Scénario B · /.test(vx.scen) && /Scénarios, pas prévisions\./.test(vx.scen), `${l}px : « Montre-moi les scénarios » affiche la couche et lit A et B (${String(vx.scen).slice(0, 90)}…)`);
  v(/cible/.test(vx.expl) && /invalidation/.test(vx.expl) && /hasard/.test(vx.expl), `${l}px : « Explique le scénario A » : cible, invalidation, hasard`);
  v(!/(achète|achetez|vends|vendez|prends position)/i.test(JSON.stringify(vx)), `${l}px : aucune réponse ne dit d'acheter ou de vendre`);
  v(typeof vx.autre === 'string' && !/Scénario/.test(vx.autre), `${l}px : les autres commandes (« on en est où ? ») restent inchangées`);
  await p.evaluate(() => { if (document.querySelector('[data-couche="rayScenarios"]').checked) document.querySelector('[data-graph-barre] [data-a="ray-scen"]').click(); }); await w(300);
  // couche décochée : plus de moyenne mobile
  await p.evaluate(() => { document.querySelector('.tor-couches').open = true; const c = document.querySelector('[data-couche="rayMa"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await w(400);
  v((await p.evaluate(() => window.__or.graph.rayleEtat())).types.ma === undefined, `${l}px : décocher la couche retire la moyenne mobile`);
  await p.evaluate(() => { const c = document.querySelector('[data-couche="rayMa"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
