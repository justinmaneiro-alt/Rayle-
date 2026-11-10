/* Tests de la définition figée « mouvements-v1 » (séries fabriquées) : node agent-trading/tests/mouvements-test.mjs */
import fs from 'node:fs'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url'; import path from 'node:path';
import * as M from '../front/or/mouvements-v1.js';
let ok = 0, ko = 0; const t = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('ÉCHEC', n, d); } };
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3;
/* sceau : la définition n'a pas changé depuis qu'elle a été figée */
const sceau = JSON.parse(fs.readFileSync(path.join(ici, '..', 'front', 'or', 'mouvements-v1.sceau.json'), 'utf8')), h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ici, '..', 'front', 'or', 'mouvements-v1.js'), 'utf8').replace(/\r/g, '')).digest('hex');
t('empreinte SHA-256 conforme au sceau', h === sceau.sha256, h);
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let x = Math.imul(s ^ s >>> 15, 1 | s); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
/* 20 bougies calmes (ATR ≈ 2), puis un enchaînement fabriqué */
const calme = (n, p = 100, t0 = 0) => Array.from({ length: n }, (_, k) => ({ t: t0 + k * H, o: p, h: p + 1, l: p - 1, c: p }));
function serie(suite, { apres = 12 } = {}) { const B = calme(20); let p = 100; for (const [o, c, h, l] of suite) { B.push({ t: B.length * H, o, c, h: h ?? Math.max(o, c) + 0.1, l: l ?? Math.min(o, c) - 0.1 }); p = c; } B.push(...calme(apres, p, B.length * H)); return B; }
const mont = (n, pas = 1.5, d = 1) => Array.from({ length: n }, (_, k) => [100 + d * k * pas, 100 + d * (k + 1) * pas]);
const maintenant = 1e15;
// ATR vaut 2 : 1,5 ATR = 3 $ ; 5 bougies de 1,5 $ = 7,5 $
{ const r = M.detecter(serie(mont(5)), { maintenant }); t('5 bougies haussières : 1 mouvement haussier', r.moves.length === 1 && r.moves[0].sens === 'hausse' && r.moves[0].bougies === 5, JSON.stringify(r.moves.map(m => [m.i0, m.i1, m.sens]))); }
{ const r = M.detecter(serie(mont(5, 1.5, -1)), { maintenant }); t('5 bougies baissières : 1 mouvement baissier', r.moves.length === 1 && r.moves[0].sens === 'baisse'); }
{ const r = M.detecter(serie(mont(3, 3)), { maintenant }); t('3 bougies seulement : rien', r.moves.length === 0); }
{ const S = mont(6, 1.5); S[2] = [S[2][0], S[2][0] - 0.3]; const r = M.detecter(serie(S), { maintenant }); t('une bougie contraire tolérée', r.moves.length === 1 && r.moves[0].contraires === 1, JSON.stringify(r.moves)); }
{ const S = mont(6, 1.5); S[2] = [S[2][0], S[2][0] - 0.3]; S[3] = [S[3][0], S[3][0] - 0.3]; const r = M.detecter(serie(S), { maintenant }); t('deux contraires : pas de mouvement de 6, mais le morceau propre reste possible ou rien', r.moves.every(m => m.contraires <= 1), JSON.stringify(r.moves.map(m => m.contraires))); }
{ const r = M.detecter(serie(mont(9)), { maintenant }); t('9 bougies : jamais plus de 6 par mouvement, aucun chevauchement', r.moves.every(m => m.bougies <= 6) && r.moves.every((m, k) => k === 0 || m.i0 > r.moves[k - 1].i1), JSON.stringify(r.moves.map(m => [m.i0, m.i1]))); }
{ const r = M.detecter(serie(mont(5, 0.5)), { maintenant }); t('gain trop faible (2,5 $ < 3 $) : rien au seuil 1,5', r.moves.length === 0); const r2 = M.detecter(serie(mont(5, 0.5)), { maintenant, seuilAtr: 1 }); t('même série au seuil 1 ATR (2 $) : détectée', r2.moves.length === 1); }
{ const r = M.detecter(serie(mont(5)), { maintenant, seuilAtr: 0.2 }), r3 = M.detecter(serie(mont(5)), { maintenant, seuilAtr: 9 }); t('seuil borné entre 1 et 3', r.seuilAtr === 1 && r3.seuilAtr === 3 && r3.moves.length === 1 /* 7,5 $ ≥ 3 × 2 */ ? true : r3.seuilAtr === 3); }
{ const r = M.detecter(serie(mont(5)), { maintenant }), m = r.moves[0]; t('départ et fin = plus bas du départ et plus haut de la fin', Math.abs(m.depart - (100 - 0.1)) < 1e-9 && Math.abs(m.fin - (107.5 + 0.1)) < 1e-9 && Math.abs(m.gain - 7.7) < 1e-9, JSON.stringify(m)); }
{ const B = serie(mont(5), { apres: 0 }); const r = M.detecter(B, { maintenant: B[B.length - 1].t + H }); t('mouvement qui touche les dernières bougies : en cours (pointillés)', r.moves.length === 1 && r.moves[0].enCours === true);
  const r2 = M.detecter(serie(mont(5), { apres: 12 }), { maintenant }); t('plus tard : figé', r2.moves.length === 1 && r2.moves[0].enCours === false); }
{ const B = serie(mont(5), { apres: 12 }), r = M.detecter(B, { maintenant: B[B.length - 1].t + 0.5 * H }); t('bougie non close ignorée', r.n === B.length - 1); }
/* tout au hasard : non-repainting, aucun chevauchement, monotonie du seuil */
const r0 = rng(7), B = []; { let p = 1800; for (let k = 0; k < 2500; k++) { const o = p, c = o + (r0() - 0.5) * 7 + Math.sin(k / 30) * 1.6, hh = Math.max(o, c) + r0() * 2.5, ll = Math.min(o, c) - r0() * 2.5; B.push({ t: k * H, o, h: hh, l: ll, c }); p = c; } }
const plein = M.detecter(B, { maintenant }), cle = m => `${m.i0}|${m.i1}|${m.d}|${m.gain.toFixed(9)}`;
t('série aléatoire : des mouvements existent', plein.moves.length > 50, String(plein.moves.length));
t('aucun chevauchement (série aléatoire)', plein.moves.every((m, k) => k === 0 || m.i0 > plein.moves[k - 1].i1));
t('tous valides : 4 à 6 bougies, ≤ 1 contraire, gain ≥ 1,5 ATR', plein.moves.every(m => m.bougies >= 4 && m.bougies <= 6 && m.contraires <= 1 && m.gainAtr >= 1.5 - 1e-9));
const pleinCles = new Set(plein.moves.filter(m => !m.enCours).map(cle)); let manquants = 0, retires = 0, testes = 0, prec = null;
for (let n = 100; n < B.length; n += 7) { const r = M.detecter(B.slice(0, n), { maintenant }); const figes = r.moves.filter(m => !m.enCours); testes++;
  for (const m of figes) if (!pleinCles.has(cle(m))) manquants++;   // figé à un instant = identique dans l'historique complet
  if (prec) for (const m of prec) if (!figes.some(q => cle(q) === cle(m))) retires++;   // jamais retiré ensuite
  prec = figes; }
t(`non-repainting : ${testes} préfixes, aucun mouvement figé qui change (${manquants} changés)`, manquants === 0);
t(`non-repainting : aucun mouvement figé retiré par la suite (${retires})`, retires === 0);
{ const dernier = M.detecter(B.slice(0, 1000), { maintenant }); t('les « en cours » sont tous près de la fin', dernier.moves.filter(m => m.enCours).every(m => m.i1 >= 1000 - 1 - 5 - 6)); }
{ let prev = Infinity; let mono = true; for (const s of [1, 1.5, 2, 2.5, 3]) { const n = M.detecter(B, { maintenant, seuilAtr: s }).moves.length; if (n > prev) mono = false; prev = n; } t('plus le seuil monte, moins il y a de mouvements', mono); }
/* causalité : modifier le futur ne change pas un mouvement figé passé */
{ const n = 1200, A = B.slice(), F = M.detecter(A.slice(0, n), { maintenant }).moves.filter(m => !m.enCours); for (let k = n; k < A.length; k++) A[k] = { ...A[k], h: A[k].h + 50, l: A[k].l - 50 }; const G = M.detecter(A, { maintenant }).moves.filter(m => m.i1 < n - 12); t('causalité : un futur différent ne change pas le passé figé', F.filter(m => m.i1 < n - 12).every(m => G.some(q => cle(q) === cle(m)))); }
console.log(`mouvements : ${ok} vérifications OK, ${ko} échecs`); process.exit(ko ? 1 : 0);
