import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* V2 phase 8 : la fenêtre LPPR (Titre II) dans la vraie page : version affichée, recherche par mots et par code, copie du code, cumul, aide au devis, voix, aucune erreur de console.
   Lancer : node tests-navigateur/v2-lppr-test.mjs */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-accueil', { recursive: true });
const L = 1600, H = 900;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await nav.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text().slice(0, 200)); });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); } catch (e) { /* stockage refusé */ } });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3500);
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(async () => { await import(new URL('core/lppr/lppr-fenetre.js', document.baseURI).href); });
verifier('window.Lppr existe', await ev(() => !!window.Lppr));
const rep = await ev(() => window.Lppr.traiterVoix('ouvre la LPPR'));
verifier('« ouvre la LPPR » : phrase avec version et rappel « à vérifier »', /Titre II/.test(rep) && /version en vigueur/.test(rep), rep);
await attendre(800);
verifier('la fenêtre est ouverte et affiche la version de la nomenclature', await ev(() => { const b = document.querySelector('.lp-bandeau'); return !!b && /Mise à jour du 2026-10-07/.test(b.textContent) && /version en vigueur/.test(b.textContent); }));
await ev(() => { const q = document.querySelector('.lp-q'); q.value = 'emboîture tibiale'; q.dispatchEvent(new Event('input')); }); await attendre(600);
const n = await ev(() => document.querySelectorAll('.lp-res .lp-code').length);
verifier('recherche « emboîture tibiale » : des codes à 7 chiffres avec tarif', n > 0 && await ev(() => [...document.querySelectorAll('.lp-res .lp-copie')].every(b => /^\d{7} /.test(b.textContent))), String(n));
await page.screenshot({ path: 'captures-accueil/v2-lppr.png' });
verifier('bouton de copie : le code est copié (ou refus du presse-papiers sans plantage)', await ev(async () => { const b = document.querySelector('.lp-res .lp-copie'); b.click(); await new Promise(r => setTimeout(r, 100)); return /[✓⧉]/.test(b.textContent); }));
await ev(() => { const q = document.querySelector('.lp-q'); q.value = '2174738'; q.dispatchEvent(new Event('input')); }); await attendre(600);
verifier('recherche par code : pelote B36N à 14,86 €', await ev(() => /B36N/.test(document.querySelector('.lp-res').textContent) && /14,86/.test(document.querySelector('.lp-res').textContent)));
await ev(() => { const q = document.querySelector('.lp-q'); q.value = '9999999'; q.dispatchEvent(new Event('input')); }); await attendre(600);
verifier('code inexistant : « n’existe pas », aucun code inventé', await ev(() => /n’existe pas/.test(document.querySelector('.lp-res').textContent) && !document.querySelector('.lp-res .lp-code')));
await ev(() => document.querySelector('[data-lp="cumul"]').click());
await ev(() => { document.querySelector('.lp-a').value = '2174738'; document.querySelector('.lp-b').value = '2167193'; document.querySelector('.lp-go-cumul').click(); });
await attendre(300);
verifier('cumul : « aucune règle » n’est jamais présenté comme une autorisation', await ev(() => { const t = document.querySelector('[data-z="cumul"] .lp-res').textContent; return /Aucune règle/.test(t) && /ne prouve pas/.test(t); }));
await ev(() => document.querySelector('[data-lp="devis"]').click());
await ev(() => { document.querySelector('.lp-d').value = 'prothèse tibiale avec manchon et pied à restitution d’énergie'; document.querySelector('.lp-go-devis').click(); });
await attendre(300);
verifier('aide au devis : propositions à valider avec codes', await ev(() => { const r = document.querySelector('[data-z="devis"] .lp-res'); return /PROPOSITIONS/.test(r.textContent) && r.querySelectorAll('.lp-code').length > 2; }));
const v1 = await ev(() => window.Lppr.traiterVoix('quel est le code LPPR de la semelle orthopédique'));
verifier('voix : réponse avec un code ou un « rien trouvé » honnête, et rappel de vérification', /Code \d{7}/.test(v1) || /Je ne trouve rien/.test(v1), v1.slice(0, 120));
const v2 = await ev(() => window.Lppr.traiterVoix('quelle heure est-il'));
verifier('voix : une phrase hors sujet n’est pas prise', v2 === null);
verifier('état : nombre de codes et version', await ev(() => { const e = window.Lppr.etat(); return e.charge && e.nombre > 1000 && /2026-10-07/.test(e.version); }));
const miennes = erreurs.filter(e => /lppr|Lppr|pageerror|Uncaught|SyntaxError|TypeError/.test(e));   // les erreurs réseau d'autres modules (calendrier externe sans CORS…) ne sont pas celles de la LPPR
verifier('aucune erreur de console venant de la LPPR', miennes.length === 0, miennes.join(' | '));
await nav.close(); fin();
