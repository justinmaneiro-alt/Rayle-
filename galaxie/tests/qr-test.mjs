// Générateur de QR code partagé (core/gestes/qr-matrice.js) : tailles par version, motifs de repérage, limite de longueur. La LECTURE réelle a été vérifiée avec le décodeur jsQR (hors dépôt) : 14 longueurs de 10 à 230 octets, versions 1 à 9.
import { createRequire } from 'node:module';
const { matriceQR } = createRequire(import.meta.url)('../../core/gestes/qr-matrice.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const attendu = [[10, 21], [100, 37], [106, 37], [107, 41], [134, 41], [135, 45], [154, 45], [190, 49], [200, 53], [230, 53]];
for (const [len, n] of attendu) { const m = matriceQR('a'.repeat(len)); v('longueur ' + len + ' → ' + n + ' modules', m.length === n && m.every(l => l.length === n), String(m.length)); }
const m = matriceQR('https://exemple.test/camera/#s=abc&j=def');
const viseur = (x0, y0) => { for (let d = 0; d < 7; d++) for (const [x, y] of [[x0 + d, y0], [x0 + d, y0 + 6], [x0, y0 + d], [x0 + 6, y0 + d]]) if (!m[y][x]) return false; return m[y0 + 3][x0 + 3] && !m[y0 + 1][x0 + 1]; };
const n = m.length;
v('trois motifs de repérage présents', viseur(0, 0) && viseur(n - 7, 0) && viseur(0, n - 7));
v('module sombre fixe', m[n - 8][8] === true);
v('trop long : erreur claire', (() => { try { matriceQR('a'.repeat(231)); return false; } catch (e) { return /trop long/.test(e.message); } })());
v('texte accentué (UTF-8) accepté', matriceQR('Caméra Rayle é').length === 21);
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
