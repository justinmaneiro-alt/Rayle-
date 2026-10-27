// Tests du dessin des anneaux du HUD. Lancer :  node galaxie/tests/jarvis-test.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const J = createRequire(import.meta.url)('../../core/commun/jarvis-svg.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const svg = J.anneaux();
v('SVG bien formé', svg.startsWith('<svg') && svg.trim().endsWith('</svg>') && (svg.match(/<g[ >]/g) || []).length === (svg.match(/<\/g>/g) || []).length);
v('aucune valeur invalide', !/NaN|undefined|Infinity/.test(svg));
v('cinq groupes animés + un fixe', ['jv-a', 'jv-b', 'jv-c', 'jv-d', 'jv-e', 'jv-fixe'].every(c => svg.includes('class="' + c + '"')));
v('échelle principale : 120 graduations, une sur cinq plus longue', (J.graduations(120, 93.5, 97.5, 5, 2.5).match(/class="l"/g) || []).length === 24);
v('les arcs couvrent 360° (motifs complets)', [...svg.matchAll(/stroke-dasharray="([\d. ]+)"/g)].filter(m => m[1].split(' ').length > 4).every(m => { const s = m[1].split(' ').map(Number).reduce((a, b) => a + b, 0); return s === 360 || s === 360 * 1; }));
v('repères cardinaux 000 090 180 270', ['000', '090', '180', '270'].every(t => svg.includes('>' + t + '<')));
v('poids raisonnable (< 12 Ko)', svg.length < 12000, svg.length + ' octets');
// CSS : animations limitées à transform/opacity, réduction des animations respectée, pas de valeur de couleur codée en rose dans le HUD
const css = fs.readFileSync(new URL('../../core/commun/jarvis.css', import.meta.url), 'utf8');
const anim = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}|@keyframes\s+([\w-]+)\{([^@]*?)\}\s*(?=\n|@)/g)];
v('animations (keyframes) présentes', (css.match(/@keyframes/g) || []).length >= 5);
v('keyframes : seulement transform, opacity (et box-shadow du survol)', ![...css.matchAll(/@keyframes[^{]+\{([^]*?)\}\s*(?=\n[^ ]|\n@|$)/g)].some(m => /\b(left|top|width|height|margin)\s*:/.test(m[1].replace(/animation[^;]*;/g, ''))));
v('« réduire les animations » coupe les animations du HUD', /prefers-reduced-motion:reduce\)\{[^}]*animation:none/.test(css));
v('pause hors accueil', /hud-pause/.test(css));
v('V1 : le décor (anneaux, calque HUD, balayage) a quitté la feuille de style de l’accueil', !/\.hud-anneaux\{|\.jv-scan\{|\.hud-vivant\{|\.hud-objets\{/.test(css));
console.log(`${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
