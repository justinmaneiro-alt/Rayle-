import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* V2 phase 13 : fuites mémoire. Ouvre puis ferme 50 fenêtres du système Panneaux (réponses, actualités…) et 50 fenêtres du bureau Jarvis (tableau de bord posé dans une fenêtre déplaçable), puis
   compare le tas JavaScript (après ramasse-miettes forcé), le nombre de nœuds DOM et d'écouteurs, avec le départ.   Lancer : node tests-navigateur/v2-fuite-fenetres-test.mjs */
const { verifier, fin } = compteur();
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info', '--window-size=1600,900'] });
const page = await nav.newPage(); await page.setViewport({ width: 1600, height: 900 });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_boot_jarvis', '0'); localStorage.setItem('rayle_theme', 'jarvis'); } catch (e) { /* stockage refusé */ } });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(5000);
const ev = (f, ...a) => page.evaluate(f, ...a);
const cdp = await page.createCDPSession();
const etat = async () => { await ev(() => { window.gc(); window.gc(); }); await attendre(400); await ev(() => { window.gc(); }); const m = await cdp.send('Runtime.getHeapUsage'); const c = await cdp.send('Memory.getDOMCounters'); return { tasMo: +(m.usedSize / 1048576).toFixed(1), noeuds: c.nodes, ecouteurs: c.jsEventListeners }; };
const depart = await etat();
// ── 1. 50 fenêtres du système Panneaux ──
await ev(async () => { for (let i = 0; i < 50; i++) { const id = Panneaux.ouvrir({ id: 'fuite-' + i, type: 'holo-test', icone: '◈', titre: 'Essai ' + i, duree: 0, corps: { html: '<div class="x"><p>' + 'texte '.repeat(60) + '</p><button>ok</button><canvas width="300" height="200"></canvas></div>' } }); await new Promise(r => setTimeout(r, 25)); Panneaux.fermer(id); await new Promise(r => setTimeout(r, 25)); } });
await attendre(1500);
const apresPanneaux = await etat();
verifier('50 fenêtres Panneaux ouvertes puis fermées : aucune ne reste dans la page', await ev(() => document.querySelectorAll('#panneaux .pn[data-id^="fuite-"]').length) === 0);
verifier('mémoire : le tas grossit de moins de 12 Mo', apresPanneaux.tasMo - depart.tasMo < 12, JSON.stringify({ depart, apresPanneaux }));
verifier('DOM : retour à ±150 nœuds du départ', Math.abs(apresPanneaux.noeuds - depart.noeuds) < 150, depart.noeuds + ' → ' + apresPanneaux.noeuds);
verifier('écouteurs : retour à ±60 du départ', Math.abs(apresPanneaux.ecouteurs - depart.ecouteurs) < 60, depart.ecouteurs + ' → ' + apresPanneaux.ecouteurs);
// ── 2. 50 fenêtres du bureau Jarvis (tableau de bord → fenêtre déplaçable → fermer) ──
let posees = 0;
for (let i = 0; i < 25; i++) {
  for (const w of ['meteo', 'marche']) {
    const ok = await ev(w2 => { const b = document.querySelector('#tableau .tb-f[data-id="' + w2 + '"] .tb-pose'); if (!b) return false; b.click(); return true; }, w); if (!ok) continue; await attendre(260);
    const ferme = await ev(w2 => { const f = document.querySelector('.gf[data-id="w-' + w2 + '"] [data-b="fermer"]'); if (!f) return false; f.click(); return true; }, w); if (ferme) posees++; await attendre(200);
  }
}
await attendre(1500);
const apresBureau = await etat();
verifier('fenêtres du bureau : ' + posees + ' ouvertes puis fermées, aucune ne reste', posees >= 30 && await ev(() => document.querySelectorAll('.gf').length) === 0, String(posees));
verifier('mémoire : le tas grossit de moins de 20 Mo en tout', apresBureau.tasMo - depart.tasMo < 20, JSON.stringify({ depart, apresBureau }));
verifier('DOM : retour à ±250 nœuds du départ', Math.abs(apresBureau.noeuds - depart.noeuds) < 250, depart.noeuds + ' → ' + apresBureau.noeuds);
verifier('écouteurs : retour à ±100 du départ', Math.abs(apresBureau.ecouteurs - depart.ecouteurs) < 100, depart.ecouteurs + ' → ' + apresBureau.ecouteurs);
console.log('\nTas JavaScript (Mo) : départ ' + depart.tasMo + ' · après 50 Panneaux ' + apresPanneaux.tasMo + ' · après ' + posees + ' fenêtres du bureau ' + apresBureau.tasMo + '   |   nœuds DOM : ' + depart.noeuds + ' → ' + apresBureau.noeuds + '   |   écouteurs : ' + depart.ecouteurs + ' → ' + apresBureau.ecouteurs);
fs.mkdirSync('docs/resultats-v2', { recursive: true }); fs.writeFileSync('docs/resultats-v2/fuites.json', JSON.stringify({ date: new Date().toISOString(), depart, apresPanneaux, apresBureau, fenetresBureau: posees }, null, 1));
verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
await nav.close(); fin();
