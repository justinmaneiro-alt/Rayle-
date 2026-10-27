import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BASE, CHROME, attendre } from './terre-aide.mjs';
/* Capture de l'accueil (thème au choix) : THEME=jarvis|aurore  LARGEUR HAUTEUR  SORTIE */
const L = Number(process.env.L) || 1600, H = Number(process.env.H) || 900, theme = process.env.THEME || 'jarvis';
fs.mkdirSync('captures-accueil', { recursive: true });
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await nav.newPage(); await page.setViewport({ width: L, height: H });
await page.evaluateOnNewDocument(t => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', t); } catch (e) {} }, theme);
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(6000);
await page.screenshot({ path: `captures-accueil/v2-${theme}-${L}.png` }); console.log('ok');
await nav.close();
