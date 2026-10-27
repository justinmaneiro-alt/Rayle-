import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre } from './terre-aide.mjs';
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 } });
const page = await nav.newPage();
page.on('console', m => { if (/^MSG/.test(m.text())) console.log(m.text().slice(0, 300)); });
await page.evaluateOnNewDocument(() => { localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_terminal_prefs', JSON.stringify({ source: 'tradingview' })); window.addEventListener('message', e => console.log('MSG ' + e.origin + ' ' + (typeof e.data === 'string' ? e.data : JSON.stringify(e.data)).slice(0, 200))); });
await page.goto(BASE + '/index.html#terminal'); await attendre(10000); await nav.close();
