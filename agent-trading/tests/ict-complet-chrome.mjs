/* Test Chrome de l'ICT COMPLET sur le chemin RÉEL du terminal (or.html + integration.js, SANS ?pro=1) : scénarios fléchés A et B (Essentiel : A ; Complet : A et B ; téléphone : A), marge vide à droite
   (20 % PC et tablette, 25 % téléphone, rendue quand l'ICT est éteint), bulle de 4 lignes au toucher d'une flèche, carte ⓘ, voix, Complet recalculé quand on fait défiler (M15, deux jours en arrière),
   plafonds par écran, captures. REEL=1 : vraies bougies de l'or ; PREFIXE : préfixe des captures.
   Prérequis : node serveur.mjs 8011. Usage : node agent-trading/tests/ict-complet-chrome.mjs [tab1440|pc1600|tel384|tab1024] */
import fs from 'node:fs';
import { initPrix, lancer, ouvrir, VUES, w, SOURCE } from './ict-visuel-aide.mjs';
VUES.tel384 = [384, 800, true];
let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; };
const DOSSIER = process.env.CAPTURES || 'captures-or'; fs.mkdirSync(DOSSIER, { recursive: true }); await initPrix(); console.log('données :', SOURCE);
const PLAN = { tab1440: ['H1', 'M15', 'H4'], pc1600: ['H1'], tel384: ['H1'], tab1024: ['H1'] };
const demandees = process.argv[2] ? [process.argv[2]] : ['tab1440', 'tel384'], PREF = process.env.PREFIXE || 'complet';
const nav = await lancer();
const unite = (p, u) => p.evaluate(x => { document.querySelector(`[data-periode="${x}"]`).click(); }, u).then(() => p.waitForFunction(x => window.__or.moteur.S.periode === x && window.__or.moteur.serie().length > 100, { timeout: 30000 }, u).catch(() => {})).then(() => w(3500));
/* part de la largeur du graphique (panneau des bougies, sans l'axe des prix) qui est vide à droite de la dernière bougie */
const marge = p => p.evaluate(() => { const g = window.__or.graph, ts = g.chart().timeScale(), B = g.etat().bougies, W = ts.width(), x = g.xDeT(B[B.length - 1].t); return { W, x, part: +((W - x) / W).toFixed(3) }; });
const state = p => p.evaluate(() => { const g = window.__or.graph, et = g.ictEtat(), m = window.__or.ict.modele(), B = g.etat().bougies, gr = g.conteneur().getBoundingClientRect();
  return { carres: et.carres, types: et.types, objets: m.objets.map(o => ({ kind: o.kind, court: o.court, hors: !!o.hors, lettre: o.lettre, famille: o.famille })), fenetre: m.fenetre, xL: g.xDeT(B[B.length - 1].t), W: g.chart().timeScale().width(), gr: { left: gr.left, top: gr.top, w: gr.width, h: gr.height } }; });
for (const vue of demandees) {
  const tel = vue.startsWith('tel'), p = await ouvrir(nav, VUES[vue]);
  v(await p.evaluate(() => !/pro=1/.test(location.search)), `${vue} : chemin réel, sans ?pro=1`);
  await unite(p, PLAN[vue][0]);
  const m0 = await marge(p); await p.evaluate(() => document.querySelector('.tp-b-ict').click()); await w(2500);
  for (const u of PLAN[vue]) {
    await unite(p, u);
    for (const mode of ['essentiel', 'complet']) {
      await p.evaluate(m => window.__or.ict.mode(m), mode); await w(1500);
      const id = `${vue} ${u} ${mode}`, S = await state(p), M = await marge(p), sc = S.carres.filter(c => c.style === 'scA' || c.style === 'scB' || c.scenario);
      const attendu = mode === 'essentiel' || tel ? 1 : 2, nObj = S.objets.filter(o => o.kind === 'scenario').length;
      v(nObj >= 1 && nObj <= (mode === 'essentiel' ? 1 : 2), `${id} : ${nObj} scénario(s) dans le modèle (Essentiel : A ; Complet : A et B)`);
      v(sc.length >= 1 && sc.length <= attendu, `${id} : ${sc.length} flèche(s) dessinée(s) à l'écran (${tel ? 'téléphone : A seulement' : mode === 'essentiel' ? 'A' : 'A et B'}) : ${sc.map(c => c.court).join(' | ')}`);
      v(sc.every(c => /^(A|B) · (rebond|rejet|\?)$/.test(c.court)), `${id} : carrés « A · rebond », « B · rejet » ou « ? »`);
      v(M.part >= (tel ? 0.245 : 0.195), `${id} : marge vide à droite = ${(M.part * 100).toFixed(1)} % de la largeur (au moins ${tel ? 25 : 20} %)`);
      v(sc.every(c => c.x > S.xL && c.x + c.w <= S.W + 2), `${id} : flèches et carrés dans la marge vide à droite`);
      const poses = S.carres.filter(c => !c.replie), chev = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; let sans = true; for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) if (chev(poses[i], poses[j])) sans = false;
      v(sans, `${id} : aucun carré n'en recouvre un autre`);
      v(S.objets.filter(o => o.kind !== 'scenario' && !o.hors).length <= (mode === 'essentiel' ? 8 : 20), `${id} : ${S.objets.filter(o => o.kind !== 'scenario' && !o.hors).length} zones et niveaux (${mode === 'essentiel' ? 8 : 20} au plus)`);
      if (mode === 'complet') { const nS = S.objets.filter(o => o.kind === 'etiquette').length; v(nS <= 12, `${id} : ${nS} sommets / creux (12 au plus)`); v(S.objets.filter(o => o.kind === 'segment').length > 0, `${id} : cassures BOS / MSS visibles (${S.objets.filter(o => o.kind === 'segment').length})`); }
      await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-${u}-${mode}.png` });
    }
  }
  /* bulle d'une flèche, carte ⓘ, voix */
  await unite(p, PLAN[vue][0]); await p.evaluate(m => window.__or.ict.mode(m), 'complet'); await w(1500);
  const S = await state(p), A = S.carres.find(c => c.scenario || c.style === 'scA' || c.style === 'scB');
  if (A) { await p.mouse.click(S.gr.left + A.x + A.w / 2, S.gr.top + A.y + A.h / 2); await w(500);
    const b = await p.evaluate(() => { const e = document.querySelector('[data-ict-bulle]'); return { ouverte: !e.hidden, lignes: [...e.querySelectorAll('.l')].map(x => x.textContent), titre: (e.querySelector('h4') || {}).textContent, bouton: !!e.querySelector('[data-ict-explique]') }; });
    v(b.ouverte && b.lignes.length === 4 && /^Zone de (rebond|rejet) : /.test(b.lignes[0]) && /^Cible : /.test(b.lignes[1]) && /^Invalidation : clôture (sous|au-dessus de) /.test(b.lignes[2]) && /pas une prévision/.test(b.lignes[3]) && b.bouton, `${vue} : toucher la flèche ouvre une bulle de 4 lignes (zone, cible, invalidation, « pas une prévision ») et « Rayle, explique » dessous (${b.lignes.join(' / ')})`);
    await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-bulle.png` });
    await p.evaluate(() => document.querySelector('[data-ict-bulle-x]').click()); await w(200);
  } else v(false, `${vue} : aucune flèche à toucher`);
  await p.evaluate(() => document.querySelector('[data-ict-i]').click()); await w(300);
  const carte = await p.evaluate(() => document.querySelector('[data-ict-carte]').innerText);
  v(/(^|\n)A( \(neutre\))? : /.test(carte), `${vue} : la carte ⓘ résume le scénario A${tel ? '' : ' et B'} (${carte.split('\n').filter(l => /^[AB]( \(neutre\))? : /.test(l)).length} ligne(s))`);
  await p.evaluate(() => document.querySelector('[data-ict-i]').click()); await w(200);
  /* marge rendue quand l'ICT est éteint */
  await p.evaluate(() => window.__or.ict.activer(false)); await w(1800); const m2 = await marge(p);
  v(m2.part < 0.12, `${vue} : l'ICT éteint, la marge d'avant est rendue (${(m2.part * 100).toFixed(1)} % ; avant ${(m0.part * 100).toFixed(1)} %)`);
  await p.evaluate(() => window.__or.ict.activer(true)); await w(1800);
  /* Complet recalculé quand on fait défiler : M15, deux jours en arrière */
  if (PLAN[vue].includes('M15')) {
    await unite(p, 'M15'); await p.evaluate(m => window.__or.ict.mode(m), 'complet'); await w(1500);
    const avant = await state(p), ids = JSON.stringify(avant.objets.map(o => o.kind + o.court));
    /* un vrai glissé de la souris (comme au doigt), jusqu'à avoir reculé de deux jours (192 bougies M15) */
    const lim = await p.evaluate(() => { const r = window.__or.graph.chart().timeScale().getVisibleLogicalRange(); return r.from - 192; });
    for (let k = 0; k < 6; k++) { const r = await p.evaluate(() => window.__or.graph.chart().timeScale().getVisibleLogicalRange()); if (r.from <= lim) break; const y = S.gr.top + S.gr.h * 0.55; await p.mouse.move(S.gr.left + 150, y); await p.mouse.down(); await p.mouse.move(S.gr.left + 1250, y, { steps: 12 }); await p.mouse.up(); await w(300); }
    await w(700);
    const S2 = await state(p);
    const pl = await p.evaluate(() => window.__or.graph.plageVisible());
    v(S2.fenetre && S2.fenetre.histo && JSON.stringify(S2.objets.map(o => o.kind + o.court)) !== ids, `${vue} M15 : après deux jours en arrière, les objets sont recalculés pour la plage visible (${S2.objets.length} objets ; fenêtre ${JSON.stringify(S2.fenetre)}, plage ${JSON.stringify(pl)}, limite ${lim})`);
    v(S2.objets.filter(o => o.kind === 'segment').length >= 1, `${vue} M15 : de la structure dans la baisse (${S2.objets.filter(o => o.kind === 'segment').length} cassures, ${S2.objets.filter(o => o.kind === 'etiquette').length} sommets / creux)`);
    v(S2.objets.filter(o => o.kind !== 'scenario' && !o.hors).length <= 20 && S2.objets.filter(o => o.kind === 'etiquette').length <= 12, `${vue} M15 : 20 zones et niveaux, 12 sommets au plus par écran`);
    await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-M15-complet-defile.png` });
  }
  /* la voix, en dernier : la réponse de Rayle prend la main sur le graphique (ce n'est pas propre à l'ICT) */
  const voix = await p.evaluate(async () => { const T = window.TableauOr, r = T && T.commande ? await T.commande('Rayle, quels scénarios ?') : null; return typeof r === 'string' ? r : (r && r.texte) || window.__or.ict.commande('Rayle, quels scénarios ?'); });   // le vrai chemin des commandes vocales de Rayle, puis la commande ICT
  v(/Scénario A/.test(voix || '') && (tel || /Scénario B/.test(voix || '') || /pas de scénario/.test(voix || '')) && !/\b(achète|vends)\b/i.test(voix || ''), `${vue} : « Rayle, quels scénarios ? » lit A et B (${(voix || '').slice(0, 90)}…)`);
  /* mode Volume : petits carrés, 6 au plus, jamais deux fois le même libellé, légende fermée, bulle de 4 lignes au toucher */
  if (!tel) {
    await p.evaluate(() => document.querySelector('.tp-mode [data-mode="volume"]').click());
    await p.waitForFunction(() => window.__tpVolume && window.__tpVolume.etat && window.__tpVolume.etat() && window.__tpVolume.etat().charge, { timeout: 90000 }).catch(() => {}); await w(2500);
    for (const u of ['H4', 'H1']) {
      await p.evaluate(x => document.querySelector(`.tpv [data-unite="${x}"]`).click(), u);
      await p.waitForFunction(x => { const s = window.__tpVolume.etat(); return s && s.charge && s.unite === x && s.bougies > 100; }, { timeout: 90000 }, u).catch(() => {}); await w(3500);
      const N = await p.evaluate(() => { const n = window.__tpvNoms; return n ? { dem: n.demandees, carres: n.carres.filter(c => !c.replie).map(c => ({ court: c.court, nDetail: c.detail.length, x: c.x, y: c.y, w: c.w, h: c.h })), tous: n.carres.map(c => c.court) } : null; });
      v(N && N.carres.length >= 1 && N.carres.length <= 6, `Volume ${u} : ${N ? N.carres.length : 0} petits carrés (6 au plus) : ${N ? N.carres.map(c => c.court).join(' | ') : ''}`);
      v(N && new Set(N.tous).size === N.tous.length, `Volume ${u} : aucun libellé répété (${N ? N.tous.join(' | ') : ''})`);
      v(N && N.carres.every(c => c.nDetail <= 4 && /^(POC|VAH|VAL|HVN|LVN|Réaction|Vol\. acheteur|Vol\. vendeur|VWAP|Mur|Support|Résistance|PDH|PDL|PWH|PWL|PMH|PML|EQH|EQL|FVG|OB|EQ 50 %|Ouverture|Gros ordre|Premium|Discount)/.test(c.court) && c.court.length <= 14), `Volume ${u} : noms courts (« Vol. vendeur », « VAH », « POC »…)`);
      v(await p.evaluate(() => { const d = document.querySelector('.tpv [data-tpv-leg]'); return !!d && !d.open; }), `Volume ${u} : la légende est fermée par défaut`);
      const vis = await p.evaluate(() => [...document.querySelectorAll('.tpv-graph *')].filter(e => e.children.length === 0 && /laissée par une bougie à fort volume/.test(e.textContent)).length); v(vis === 0, `Volume ${u} : plus aucun libellé long « laissée par une bougie à fort volume » à l'écran`);
      await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-volume-${u}.png` });
      if (N && N.carres[0] && u === 'H4') { const g = await p.evaluate(() => { const r = document.querySelector('.tpv-graph').getBoundingClientRect(); return { l: r.left, t: r.top }; }), c = N.carres[0];
        await p.mouse.click(g.l + c.x + c.w / 2, g.t + c.y + c.h / 2); await w(500);
        const b = await p.evaluate(() => { const e = document.querySelector('[data-info]'); return { ouverte: !e.hidden, lignes: e.querySelectorAll('b, div').length, texte: e.innerText }; });
        v(b.ouverte && b.lignes >= 1 && b.lignes <= 4, `Volume : toucher « ${c.court} » ouvre une bulle de ${b.lignes} ligne(s) (4 au plus)`); await p.screenshot({ path: `${DOSSIER}/${PREF}-${vue}-volume-bulle.png` }); }
    }
  }
  v(p.__err.length === 0, `${vue} : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`);
  await p.close();
}
await nav.close(); console.log(ko ? `${ko} échec(s)` : 'tous les tests Chrome passent'); process.exit(ko ? 1 : 0);
