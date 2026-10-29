// Compare docs/captures-v7b/avant et apres : signatures de l'interface (strictes, sauf « reglages » : ids seulement) et pixels (tolérance 0,5 %). Sort en erreur si le PC a changé.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { CHROME } from './terre-aide.mjs';
const A = JSON.parse(fs.readFileSync('docs/captures-v7b/avant/signatures.json')), B = JSON.parse(fs.readFileSync('docs/captures-v7b/apres/signatures.json'));
let ko = 0;
for (const k of Object.keys(A)) {
  const id = x => x.split('@')[0], ea = A[k].elements, eb = B[k].elements;
  const AUTORISES = /^appareil/;   // seul changement voulu sur PC : le réglage « Appareil » (⚙) demandé par la phase B1
  const da = k === 'reglages' ? ea.map(id).filter(x => !eb.map(id).includes(x)) : ea.filter(x => !eb.includes(x)), db = (k === 'reglages' ? eb.map(id).filter(x => !ea.map(id).includes(x)) : eb.filter(x => !ea.includes(x))).filter(x => !AUTORISES.test(x));
  const bt = JSON.stringify(A[k].boutons) === JSON.stringify(B[k].boutons) || k === 'reglages', th = A[k].theme === B[k].theme;
  const ok = da.length === 0 && db.length === 0 && bt && th; if (!ok) ko++;
  console.log((ok ? 'OK  ' : 'KO  ') + 'signature ' + k + (ok ? '' : ' — retirés: ' + da.slice(0, 5) + ' ajoutés: ' + db.slice(0, 5) + (bt ? '' : ' boutons différents') + (th ? '' : ' thème différent')));
}
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new' }), page = await nav.newPage();
for (const k of Object.keys(A)) {
  const a = 'data:image/png;base64,' + fs.readFileSync('docs/captures-v7b/avant/' + k + '.png').toString('base64'), b = 'data:image/png;base64,' + fs.readFileSync('docs/captures-v7b/apres/' + k + '.png').toString('base64');
  const part = await page.evaluate(async (a, b) => { const l = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; }), [ia, ib] = await Promise.all([l(a), l(b)]); const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 40) n++; return n / (da.length / 4); }, a, b);
  const ok = part < 0.005 || k === 'reglages';   // le panneau ⚙ gagne la section « Appareil » (changement voulu) : ses pixels sont décalés if (!ok) ko++; console.log((ok ? 'OK  ' : 'KO  ') + 'pixels ' + k + ' : ' + (part * 100).toFixed(3) + ' % de pixels différents');
}
await nav.close(); console.log(ko ? '\nLE PC A CHANGÉ (' + ko + ')' : '\nPC identique'); process.exit(ko ? 1 : 0);
