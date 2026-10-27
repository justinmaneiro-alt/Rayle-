// Génère des enregistrements SYNTHÉTIQUES (WAV 16 kHz mono) pour tester la veille locale : claquement de mains, de doigts, clavier, porte, voix, bruit de fond.
// Chrome les rejoue en boucle comme « micro » (--use-file-for-fake-audio-capture). node tests-navigateur/audio/generer-claquements.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dossier = path.dirname(fileURLToPath(import.meta.url)), SR = 16000;
let graine = 777; const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296 * 2 - 1; };
const silence = (ms, bruit = 0.004) => { const a = new Float32Array(Math.round(SR * ms / 1000)); for (let i = 0; i < a.length; i++) a[i] = bruit * alea() + 0.002 * Math.sin(2 * Math.PI * 50 * i / SR); return a; };
const assembler = m => { const o = new Float32Array(m.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of m) { o.set(x, p); p += x.length; } return o; };
function pic({ amp = 0.5, att = 1, tau = 15, duree = 120, mode = 'large' }) { const n = Math.round(SR * duree / 1000), a = new Float32Array(n); let lp = 0, prev = 0; for (let i = 0; i < n; i++) { const t = i / SR * 1000, env = t < att ? t / att : Math.exp(-(t - att) / tau); let b = alea(); if (mode === 'aigu') { const h = b - prev; prev = b; b = h * 0.7; } else if (mode === 'grave') { lp += 0.02 * (b - lp); b = lp * 6; } else { const h = b - 0.6 * prev; prev = b; b = h * 0.8; } a[i] = amp * env * b; } return a; }
const voix = (ms, f0 = 140, amp = 0.2) => { const n = Math.round(SR * ms / 1000), a = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, t / 0.03) * Math.min(1, (ms / 1000 - t) / 0.05); let s = 0; for (let h = 1; h <= 12; h++) s += Math.sin(2 * Math.PI * f0 * h * t) / h; a[i] = amp * env * s * 0.5; } return a; };
function ecrire(nom, x) { const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40); for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2); fs.writeFileSync(path.join(dossier, nom + '.wav'), b); }
ecrire('claquement-mains', assembler([silence(1800), pic({ amp: 0.5, tau: 18 }), silence(1800)]));
ecrire('claquement-doigts', assembler([silence(1800), pic({ amp: 0.4, att: 0.5, tau: 3.5, duree: 40, mode: 'aigu' }), silence(1800)]));
ecrire('double-claquement', assembler([silence(1800), pic({ amp: 0.5, tau: 18 }), silence(350), pic({ amp: 0.5, tau: 18 }), silence(1800)]));
const frappe = []; for (let i = 0; i < 14; i++) { frappe.push(pic({ amp: 0.12, att: 0.3, tau: 1.5, duree: 15, mode: 'aigu' })); frappe.push(silence(100 + Math.round(60 * Math.abs(alea())))); }
ecrire('clavier', assembler([silence(1500), ...frappe, silence(1500)]));
ecrire('porte', assembler([silence(1800), pic({ amp: 0.6, att: 5, tau: 90, duree: 400, mode: 'grave' }), silence(1800)]));
ecrire('voix-synthetique', assembler([silence(1000), voix(900), silence(300), voix(700, 220), silence(1500)]));
ecrire('bruit', silence(5000, 0.01));
console.log('ok');
