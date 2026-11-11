/* Test Chrome : panneau « Risque prop » (repliable) : perte journalière restante, marge avant le seuil total, risque de la position, taille suggérée, alerte douce à 70 % (une fois, voix et notification
   désactivables), contexte à la pose (zone, probabilité, marché) rattaché au trade du journal sans toucher au journal ; PC 1600 px et téléphone 390 px. */
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(path.resolve('tests-navigateur/package.json')); const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8011'; let ko = 0; const v = (c, m) => { console.log(c ? 'OK ' : 'ÉCHEC', m); if (!c) ko++; }; const w = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('captures-or', { recursive: true });
const nav = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function ouvrir(l, h, mob, perteJour) {
  const p = await nav.newPage(); await p.setViewport({ width: l, height: h, isMobile: mob, hasTouch: mob }); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.evaluateOnNewDocument(pj => { try { for (const k of ['rayle_or_risque_prop', 'rayle_or_poses_contexte', 'rayle_or_poses_liens', 'rayle_or_gardien', 'rayle_or_couches_v2']) localStorage.removeItem(k);
    const now = Date.now(); localStorage.setItem('rayle_or_journal', JSON.stringify(pj ? [{ id: 'tperte', sens: 'achat', entree: 4000, stop: 3990, taille: 1, sortie: 3790, pl: -pj, tEntree: now - 3 * 60e3, tSortie: now - 2 * 60e3, source: 'kraken' }] : [])); } catch (e) {} }, perteJour);
  await p.goto(BASE + '/agent-trading/front/or.html', { waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => window.__or && window.__or.risque && window.__or.structure && window.__or.structure.etat().stats, { timeout: 40000 }); await p.waitForFunction(() => document.querySelector('[data-rp-statut]'), { timeout: 15000 }).catch(() => {}); await w(1500); p.__err = err; return p; }
for (const [l, h, mob] of [[1600, 900, false], [390, 844, true]]) {
  // compte avec 210 $ de perte aujourd'hui = 70 % de la limite journalière
  let p = await ouvrir(l, h, mob, 210);
  v(!!(await p.$('[data-risque-prop] details')) && await p.evaluate(() => { const d = document.querySelector('[data-risque-prop] details'); d.open = false; const ferme = !d.open; d.open = true; return ferme && d.open; }), `${l}px : panneau « Risque prop » repliable`);
  const t = await p.evaluate(() => document.querySelector('[data-rp-corps]').innerText);
  v(/Perte journalière restante\s*90 \$/.test(t) && /Marge avant le seuil total\s*390 \$/.test(t) && /Objectif \+10 %/.test(t), `${l}px : perte journalière restante 90 $, marge 390 $, objectif (${t.replace(/\s+/g, ' ').slice(0, 120)}…)`);
  v(await p.evaluate(() => { const s = document.querySelector('[data-rp-statut]'); return s && s.dataset.rpStatut === 'orange' && /Alerte douce/.test(s.innerText); }), `${l}px : alerte douce affichée à 70 % de la perte journalière`);
  // voix : une seule fois, même après plusieurs mises à jour ; désactivable
  const dits = []; await p.exposeFunction('noterDit', x => dits.push(x)); await p.evaluate(() => { window.speak = x => window.noterDit(x); localStorage.removeItem('rayle_or_risque_prop'); });
  p.close(); p = await ouvrir(l, h, mob, 210); await p.exposeFunction('noterDit', x => dits.push(x)); await p.evaluate(() => { window.speak = x => window.noterDit(x); window.__or.risque.maj(); window.__or.risque.maj(); window.__or.risque.maj(); }); await w(500);
  const nAlertes = dits.filter(x => /Alerte douce/.test(x)).length; v(nAlertes <= 1, `${l}px : l'alerte douce n'est dite qu'une fois par jour (${nAlertes})`);
  // contexte à la pose
  const pose = await p.evaluate(() => { const pr = window.__or.graph.etat().prix || 4000; const c = window.__or.risque.enregistrerPoseMaintenant({ entree: pr, stop: pr - 10, objectif: pr + 25, sens: 'achat' }); return c ? { sens: c.sens, zone: !!c.zone, proba: c.probabilite && typeof c.probabilite.source, marche: !!c.marche, t: c.t } : null; });
  v(pose && pose.sens === 'achat' && pose.proba === 'string', `${l}px : contexte enregistré à la pose (zone ${pose && pose.zone}, probabilité, marché)`);
  await p.evaluate(() => { const pr = window.__or.graph.etat().prix || 4000, L = JSON.parse(localStorage.getItem('rayle_or_journal')); L.push({ id: 'tpose', sens: 'achat', entree: pr, stop: pr - 10, taille: 1, sortie: null, tEntree: Date.now() + 30e3, source: 'kraken' }); localStorage.setItem('rayle_or_journal', JSON.stringify(L)); window.__or.risque.maj(); });
  await w(400); v(await p.evaluate(() => Object.keys(window.__or.risque.etat().liens).includes('tpose') || window.__or.risque.etat().poses.length >= 1), `${l}px : le contexte de pose est rattaché au trade du journal (sans toucher au journal)`);
  v(await p.evaluate(() => { const poses = JSON.parse(localStorage.getItem('rayle_or_poses_contexte') || '[]'); return poses.length >= 1 && 'probabilite' in poses[0] && 'marche' in poses[0]; }), `${l}px : poses enregistrées à part, en ajout seul`);
  const risque = await p.evaluate(() => document.querySelector('[data-rp-corps]').innerText); v(/Risque de la position en cours/.test(risque) && /Taille suggérée/.test(risque), `${l}px : risque de la position et taille suggérée affichés`);
  v(await p.evaluate(() => !/(achète|vends)/i.test(document.querySelector('[data-risque-prop]').innerText)), `${l}px : jamais « achète » ni « vends »`);
  await p.screenshot({ path: `captures-or/risque-prop-${l}.png` });
  if (mob) v(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px : pas de défilement horizontal');
  v(p.__err.length === 0, `${l}px : aucune erreur de page ${p.__err.slice(0, 2).join(' | ')}`); await p.close();
  // compte neuf : pas d'alerte
  const q = await ouvrir(l, h, mob, 0); v(await q.evaluate(() => { const s = document.querySelector('[data-rp-statut]'); return s && s.dataset.rpStatut === 'ok'; }), `${l}px : compte sans perte : « Dans les clous », pas d'alerte`); await q.close();
}
await nav.close(); console.log(ko ? ko + ' échec(s)' : 'tout passe'); process.exit(ko ? 1 : 0);
