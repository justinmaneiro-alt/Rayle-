import { ouvrirAppareil } from '../tests-navigateur/v7b-aide.mjs';
const o = await ouvrirAppareil('pc', { attente: 1500 }); const p = o.page;
await p.evaluate(() => Application.aller('anatomie')); await new Promise(r => setTimeout(r, 1500));
console.log(JSON.stringify(await p.evaluate(() => { const s = document.querySelector('.ac-vue[data-id=anatomie] .ac-icone svg'); const r = s.getBoundingClientRect(); const cs = getComputedStyle(s); const tr = s.querySelector('.ac-tr'); return { r: [r.width, r.height], disp: cs.display, stroke: cs.stroke, sw: cs.strokeWidth, op: cs.opacity, tr: getComputedStyle(tr).strokeDashoffset, vis: cs.visibility }; })));
await o.navigateur.close();
