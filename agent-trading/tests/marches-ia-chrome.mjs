/* ANALYSE IA dans Chrome : mode manuel complet (export, réponse collée, image annotée, rejets), image importée, actualités, mode automatique simulé (succès, 429, limite), tactile.
   Prérequis : node serveur.mjs 8011.   BASE=http://127.0.0.1:8011 node agent-trading/tests/marches-ia-chrome.mjs   Captures : outils-restructuration/captures-marches/ia-*.png */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { lancer, w, verif, APPAREILS, BASE } from './tactile-aide.mjs';
import { hubFixtures } from '../../marches/tests/aide-fixtures.mjs';
import { gererMarches } from '../../marches/donnees/api.js';
import { creerFournisseur, creerQuota } from '../../marches/ia/fournisseurs.js';
const { v, fin } = verif(); const DOSSIER = 'outils-restructuration/captures-marches';

/* serveur de données + fournisseur d'IA simulé (Groq factice) */
let mode429 = false; const hub = hubFixtures({}); const corpsVus = [];
const fetchIA = async (url, o) => { corpsVus.push(o.body); if (mode429) return new Response('{}', { status: 429 });
  const txt = JSON.parse(o.body).messages[0].content, m = txt.match(/plus bas ([\d.,]+) · plus haut ([\d.,]+)/), bas = parseFloat(m[1]), haut = parseFloat(m[2]), mid = (bas + haut) / 2, d = (haut - bas) / 6;
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ type: 'graphique', resume: 'Lecture automatique simulée du contexte.', zones: [{ nom: 'Résistance', bas: mid + d, haut: mid + d * 1.5, role: 'resistance' }], niveaux: [{ nom: 'Pivot', prix: mid, role: 'autre' }], scenarios: [{ nom: 'Reprise', condition: 'Si le prix clôture au-dessus de la résistance', direction: 'haussier', cible: mid + d * 2, invalidation: mid - d, chemin: [mid + d, mid + d * 1.6, mid + d * 2] }], invalidations: [{ prix: mid - d, texte: 'Sous ce niveau la lecture est annulée' }] }) } }] }), { status: 200 }); };
let ia = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'CLE-TEST-SECRETE' }, fetchImpl: fetchIA, quota: creerQuota({ limite: 3 }) });
const serveur = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); if (u.pathname === '/__429') { mode429 = u.searchParams.get('on') === '1'; res.writeHead(200); return res.end('ok'); }
  if (u.pathname === '/__quota') { ia = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'CLE-TEST-SECRETE' }, fetchImpl: fetchIA, quota: creerQuota({ limite: +u.searchParams.get('n') }) }); res.writeHead(200); return res.end('ok'); }
  const corps = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(ok => { const p = []; req.on('data', c => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); });
  const r = await gererMarches(new Request('http://x' + req.url, { method: req.method, body: corps }), { hub, ia }); res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise(ok => serveur.listen(8802, '127.0.0.1', ok));

const nav = await lancer(); const ignore = e => /Failed to load resource|ERR_|faireconomy|allorigins|net::|kraken|binance/i.test(e);
async function page(app, base) {
  const p = await nav.newPage(); p.__err = []; p.on('pageerror', e => p.__err.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignore(m.text())) p.__err.push(m.text().slice(0, 140)); });
  await p.setViewport(app === 'pc' ? { width: 1500, height: 950 } : APPAREILS[app]);
  if (base) await p.evaluateOnNewDocument(b => { try { localStorage.setItem('rayle_marches_base', b); } catch (e) { /* */ } }, base);
  await p.goto(BASE + '/agent-trading/front/or.html?pro=1' + (app === 'pc' ? '&tactile=0' : '') + '#marches', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__marches && window.__or && window.__or.graph && window.__or.graph.etat().bougies.length > 30, { timeout: 60000 }).catch(() => {});
  return p;
}
const ouvrirAnalyse = async p => { await p.evaluate(() => window.__marches.ouvrir('analyse')); await p.waitForSelector('[data-mk-ia="graphique"]', { timeout: 15000 }); await w(600); };
const reponseBonne = p => p.evaluate(() => { const b = window.__or.graph.etat().bougies, c = +(b[b.length - 1].c ?? b[b.length - 1][4]), h = c * 0.003; return JSON.stringify({ type: 'graphique', resume: 'Le prix évolue près d\'une zone de décision. Lecture du contexte uniquement.', zones: [{ nom: 'Résistance proche', bas: c + h, haut: c + h * 1.6, role: 'resistance' }, { nom: 'Support proche', bas: c - h * 1.6, haut: c - h, role: 'support' }], niveaux: [{ nom: 'Pivot', prix: c, role: 'autre' }], scenarios: [{ nom: 'Cassure haussière', condition: 'Si le prix clôture au-dessus de la résistance proche', direction: 'haussier', cible: c + h * 2.5, invalidation: c - h, chemin: [c + h, c + h * 1.8, c + h * 2.5] }, { nom: 'Retour au support', condition: 'Si le prix perd le pivot', direction: 'baissier', cible: c - h * 1.8 }], invalidations: [{ prix: c - h * 2, texte: 'Une clôture sous ce niveau annule la lecture haussière' }] }); });
const pixelsNonVides = (p, sel) => p.evaluate(s => { const cv = document.querySelector(s); if (!cv) return -1; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; const f = [d[0], d[1], d[2]]; for (let i = 0; i < d.length; i += 4 * 37) if (Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2]) > 30) n++; return n; }, sel);
const coller = async (p, sel, t) => p.evaluate((s, x) => { const e = document.querySelector(s); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }, sel, t);

/* ═══ mode manuel (serveur réel de Rayle, aucun fournisseur) ═══ */
{
  const L = 'manuel : '; const p = await page('pc', null);
  v(await p.evaluate(() => window.__or.graph.etat().bougies.length > 30), L + 'graphique du terminal chargé (bougies réelles)');
  await ouvrirAnalyse(p);
  v(await p.evaluate(() => /Mode manuel/.test(document.querySelector('[data-mk-ia="graphique"] [data-ia-etat]').textContent) && document.querySelector('[data-mk-ia="graphique"] [data-ia-auto]').hidden), L + 'sans clé : « Mode manuel », bouton automatique masqué');
  v(await p.evaluate(() => /Aide à la lecture, peut se tromper, ne pas utiliser comme signal/.test(document.querySelector('[data-mk-ia="graphique"]').innerText)), L + 'mention obligatoire visible');
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-export]').click()); await w(300);
  const tx = await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-texte]').value);
  v(/ACTIF : [A-Z]+ · UNITÉ DE TEMPS : (M5|M15|H1|H4|Jour)/.test(tx) && /MA200 :/.test(tx) && /RSI\(14\)/.test(tx) && /ÉCHELLE DE PRIX/.test(tx) && /FORMAT JSON ATTENDU/.test(tx) && /DERNIÈRES BOUGIES/.test(tx), L + 'texte exporté complet (actif, unité, bougies, MA200, RSI, échelle, format JSON)');
  v(/NIVEAUX MAJEURS/.test(tx) && /FLÈCHES v8/.test(tx), L + 'niveaux majeurs et flèches v8 présents');
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-copier]').click()); await w(300);
  v(await p.evaluate(() => /copié|Copie impossible/.test(document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent)), L + '« Copier le texte » répond (copié ou consigne claire)');
  await p.evaluate(() => { window.__tel = null; const o = URL.createObjectURL; URL.createObjectURL = b => { window.__tel = b.size; return o.call(URL, b); }; document.querySelector('[data-mk-ia="graphique"] [data-ia-capture]').click(); }); await w(1200);
  v(/Capture enregistrée/.test(await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent)) , L + '« Enregistrer la capture » produit une image PNG');
  /* rejets */
  for (const [nom, brut, motif] of [['JSON invalide', '{ ceci n\'est pas du json', /JSON|accolade/i], ['texte sans JSON', 'Désolé, je ne peux pas aider.', /aucun objet JSON/], ['probabilité chiffrée', JSON.stringify({ type: 'graphique', resume: '70 % de chances de hausse', zones: [], niveaux: [{ nom: 'a', prix: 1 }] }), /interdit|hors du graphique/], ['prix absurde', JSON.stringify({ type: 'graphique', resume: 'ok', niveaux: [{ nom: 'a', prix: 9999999 }] }), /hors du graphique/]]) {
    await coller(p, '[data-mk-ia="graphique"] [data-ia-reponse]', brut); await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-importer]').click()); await w(250);
    const r = await p.evaluate(() => ({ m: document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent, cv: !!document.querySelector('[data-mk-ia="graphique"] canvas') }));
    v(/Réponse rejetée/.test(r.m) && motif.test(r.m) && !r.cv, L + `rejet propre : ${nom} (rien dessiné)`);
  }
  /* réponse valide → image annotée */
  await coller(p, '[data-mk-ia="graphique"] [data-ia-reponse]', await reponseBonne(p)); await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-importer]').click()); await w(900);
  const ok1 = await p.evaluate(() => ({ m: document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent, cv: !!document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas'), txt: document.querySelector('[data-mk-ia="graphique"] [data-ia-sortie]').innerText }));
  v(/Réponse valide/.test(ok1.m) && ok1.cv, L + 'réponse JSON collée : validée et image annotée dessinée'); v(/Capture interne : positions exactes/.test(ok1.txt) && /Aide à la lecture, peut se tromper/.test(ok1.txt), L + 'mention « positions exactes » et avertissement sous l\'image');
  v((await pixelsNonVides(p, '[data-mk-ia="graphique"] canvas.mk-ia-canvas')) > 300, L + 'le canvas contient bien un dessin (bougies, bandes, flèches)');
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas').scrollIntoView()); await p.screenshot({ path: `${DOSSIER}/ia-manuel-annote.png` });
  const png = await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas').toDataURL('image/png')); fs.writeFileSync(`${DOSSIER}/ia-annote-interne.png`, Buffer.from(png.split(',')[1], 'base64'));
  /* image importée */
  const src = path.join(os.tmpdir(), 'rayle-capture-test.png'); const cap = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 500; const x = c.getContext('2d'); x.fillStyle = '#101a24'; x.fillRect(0, 0, 900, 500); x.strokeStyle = '#57c896'; x.beginPath(); x.moveTo(0, 400); for (let i = 1; i < 90; i++) x.lineTo(i * 10, 400 - i * 2 - Math.sin(i / 4) * 30); x.stroke(); const b = window.__or.graph.etat().bougies, l = b.slice(-110); const f = z => +(z.h ?? z[2]), g = z => +(z.l ?? z[3]); return { haut: Math.max(...l.map(f)), bas: Math.min(...l.map(g)), url: c.toDataURL() }; });
  fs.writeFileSync(src, Buffer.from(cap.url.split(',')[1], 'base64'));
  await p.evaluate(() => { document.querySelector('[data-mk-ia="graphique"] .mk-ia-img').open = true; });
  await (await p.$('[data-mk-ia="graphique"] [data-ia-fichier]')).uploadFile(src); await coller(p, '[data-mk-ia="graphique"] [data-ia-haut]', String(cap.haut)); await coller(p, '[data-mk-ia="graphique"] [data-ia-bas]', String(cap.bas));
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-importer]').click()); await w(1500);
  const ok2 = await p.evaluate(() => ({ cv: !!document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas'), t: document.querySelector('[data-mk-ia="graphique"] [data-ia-sortie]').innerText }));
  v(ok2.cv && /POSITIONS APPROXIMATIVES/.test(ok2.t), L + 'capture importée : image annotée avec la mention « positions approximatives » (texte sous l\'image)');
  const png2 = await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas').toDataURL('image/png')); fs.writeFileSync(`${DOSSIER}/ia-annote-importee.png`, Buffer.from(png2.split(',')[1], 'base64'));
  /* scénarios */
  await p.evaluate(() => document.querySelector('[data-mk-ia="scenarios"] [data-ia-export]').click()); await w(200);
  v(await p.evaluate(() => /Propose des SCÉNARIOS conditionnels/.test(document.querySelector('[data-mk-ia="scenarios"] [data-ia-texte]').value)), L + 'section Scénarios : « Exporter pour analyse » au lieu d\'être masquée');
  /* actualités */
  await p.evaluate(() => window.__marches.ouvrir('actualites')); await p.waitForSelector('[data-mk-ia="actualite"]', { timeout: 70000 }).catch(() => {}); await w(500);
  const ac = await p.evaluate(() => { const r = document.querySelector('[data-mk-ia="actualite"]'); if (!r) return null; r.querySelector('[data-ia-export]').click(); return { t: r.querySelector('[data-ia-texte]').value, titre: r.querySelector('h3').textContent }; });
  v(ac && /TITRES :/.test(ac.t) && /actualite/.test(ac.t) && /Comprendre/.test(ac.titre), L + '« Comprendre l\'actualité » : bouton « Exporter pour analyse » avec les titres et le format JSON');
  await coller(p, '[data-mk-ia="actualite"] [data-ia-reponse]', JSON.stringify({ type: 'actualite', resume: 'Les titres tournent autour de la Fed.', themes: [{ titre: 'Fed', explication: 'Plusieurs médias évoquent la prochaine réunion.', actifs: ['usd', 'or'] }] })); await p.evaluate(() => document.querySelector('[data-mk-ia="actualite"] [data-ia-importer]').click()); await w(300);
  v(await p.evaluate(() => /Fed/.test(document.querySelector('[data-mk-ia="actualite"] [data-ia-sortie]').innerText)), L + 'réponse « actualité » importée et affichée');
  v(p.__err.length === 0, L + 'aucune erreur JavaScript' + (p.__err.length ? ' : ' + p.__err.slice(0, 2).join(' | ') : '')); await p.close();
}

/* ═══ mode automatique simulé ═══ */
{
  const L = 'automatique : '; const p = await page('pc', 'http://127.0.0.1:8802'); await ouvrirAnalyse(p);
  const e = await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-etat]').textContent); v(/Mode automatique/.test(e) && /restants aujourd'hui : 3\/3/.test(e) && /gratuit/.test(e) && /jetons/.test(e), L + 'fournisseur, offre gratuite, coût estimé et quota restant affichés AVANT l\'envoi');
  v(await p.evaluate(() => !document.querySelector('[data-mk-ia="graphique"] [data-ia-auto]').hidden), L + 'bouton « Analyser automatiquement » visible');
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-auto]').click()); await p.waitForSelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas', { timeout: 20000 }).catch(() => {}); await w(400);
  v(await p.evaluate(() => !!document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas') && /groq/.test(document.querySelector('[data-mk-ia="graphique"] [data-ia-sortie]').innerText)), L + 'même JSON, même validation, même dessin (fournisseur nommé)');
  v(!(await p.content()).includes('CLE-TEST-SECRETE') && !JSON.stringify(corpsVus).includes('CLE-TEST-SECRETE'), L + 'la clé n\'apparaît ni dans la page ni dans les données envoyées'); await p.screenshot({ path: `${DOSSIER}/ia-automatique.png` });
  await fetch('http://127.0.0.1:8802/__429?on=1'); await p.evaluate(() => { document.querySelector('[data-mk-ia="graphique"] [data-ia-sortie]').innerHTML = ''; document.querySelector('[data-mk-ia="graphique"] [data-ia-auto]').click(); }); await w(1500);
  const r429 = await p.evaluate(() => ({ m: document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent, ex: !document.querySelector('[data-mk-ia="graphique"] [data-ia-zone-export]').hidden }));
  v(/quota|429/.test(r429.m) && /retour au mode manuel/.test(r429.m) && r429.ex, L + 'quota du fournisseur dépassé (429) : message clair et retour au mode manuel (export ouvert)'); await fetch('http://127.0.0.1:8802/__429?on=0');
  await fetch('http://127.0.0.1:8802/__quota?n=0'); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__marches && window.__or && window.__or.graph.etat().bougies.length > 30, { timeout: 60000 }).catch(() => {}); await ouvrirAnalyse(p);
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-auto]').click()); await w(1500);
  const rq = await p.evaluate(() => ({ m: document.querySelector('[data-mk-ia="graphique"] [data-ia-msg]').textContent, ex: !document.querySelector('[data-mk-ia="graphique"] [data-ia-zone-export]').hidden }));
  v(/limite quotidienne/.test(rq.m) && rq.ex, L + 'limite quotidienne atteinte : message clair, retour au mode manuel');
  v(p.__err.length === 0, L + 'aucune erreur JavaScript' + (p.__err.length ? ' : ' + p.__err.slice(0, 2).join(' | ') : '')); await p.close();
}

/* ═══ tactile ═══ */
{
  const L = 'tactile s23 : '; const p = await page('s23', null);
  await p.evaluate(() => { document.querySelector('[data-tt-donnees]').click(); }); await w(300); await p.evaluate(() => document.querySelector('[data-tt-tuile="marches"]').click()); await w(1500);
  await p.evaluate(() => window.__marches.ouvrir('analyse')); await p.waitForSelector('[data-mk-ia="graphique"]', { timeout: 15000 }); await w(400);
  const B = await p.evaluate(() => [...document.querySelectorAll('[data-mk-ia] button, [data-mk-ia] textarea, [data-mk-ia] input')].filter(e => e.getBoundingClientRect().width > 0).map(e => { const r = e.getBoundingClientRect(); return { n: (e.textContent || e.placeholder || e.type).trim().slice(0, 18), h: r.height, w: r.width }; }));
  v(B.length >= 6 && B.every(b => b.h >= 43.5), L + `boutons et champs d'analyse ≥ 44 px (${B.length}${B.filter(b => b.h < 43.5).length ? ' ; trop petits : ' + B.filter(b => b.h < 43.5).map(b => b.n + ' ' + Math.round(b.h)).join(', ') : ''})`);
  v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1), L + 'pas de défilement de page parasite');
  await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-export]').click()); await w(300); await coller(p, '[data-mk-ia="graphique"] [data-ia-reponse]', await reponseBonne(p)); await p.evaluate(() => document.querySelector('[data-mk-ia="graphique"] [data-ia-importer]').click()); await w(800);
  v(await p.evaluate(() => !!document.querySelector('[data-mk-ia="graphique"] canvas.mk-ia-canvas') && document.documentElement.scrollWidth <= innerWidth + 1), L + 'image annotée dessinée sans défilement horizontal'); await p.screenshot({ path: `${DOSSIER}/ia-tactile-s23.png` });
  v(p.__err.length === 0, L + 'aucune erreur JavaScript'); await p.close();
}
await nav.close(); serveur.close(); console.log(fin() ? '\n' + fin() + ' échec(s)' : '\ntout passe'); process.exit(fin() ? 1 : 0);
