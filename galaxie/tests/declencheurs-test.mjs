// Tests des déclencheurs locaux (claquements) sur des signaux SYNTHÉTIQUES. Lancer :  node galaxie/tests/declencheurs-test.mjs
// Les vrais claquements, dans ta pièce et avec ton micro, restent à vérifier à la main (docs/activation-vocale.md).
import { createRequire } from 'node:module';
const D = createRequire(import.meta.url)('../../core/voice/declencheurs-calcul.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const SR = 48000;
let graine = 12345; const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296 * 2 - 1; };
const silence = (ms, bruit = 0.004) => { const a = new Float32Array(Math.round(SR * ms / 1000)); for (let i = 0; i < a.length; i++) a[i] = bruit * alea() + 0.002 * Math.sin(2 * Math.PI * 50 * i / SR); return a; };
const assembler = morceaux => { const n = morceaux.reduce((s, m) => s + m.length, 0), o = new Float32Array(n); let p = 0; for (const m of morceaux) { o.set(m, p); p += m.length; } return o; };
/* bruit à enveloppe : attaque att ms, retombée exponentielle tau ms, filtré : mode 'large' (claquement de mains), 'aigu' (doigts), 'grave' (porte), 'clavier' */
function pic({ amp = 0.5, att = 1, tau = 15, duree = 120, mode = 'large' }) {
  const n = Math.round(SR * duree / 1000), a = new Float32Array(n); let lp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR * 1000, env = (t < att ? t / att : Math.exp(-(t - att) / tau));
    let b = alea();
    if (mode === 'aigu') { const h = b - prev; prev = b; b = h * 0.7; }
    else if (mode === 'grave') { lp += 0.01 * (b - lp); b = lp * 9; }
    else if (mode === 'large') { const h = b - 0.6 * prev; prev = b; b = h * 0.8; }
    a[i] = amp * env * b;
  }
  return a;
}
const voix = (ms, f0 = 140, amp = 0.2) => { const n = Math.round(SR * ms / 1000), a = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, t / 0.03) * Math.min(1, (ms / 1000 - t) / 0.05); let s = 0; for (let h = 1; h <= 12; h++) s += Math.sin(2 * Math.PI * f0 * h * t * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t))) / h; a[i] = amp * env * s * 0.5; } return a; };
const jouer = (signal, opt = {}) => { const evts = []; const d = D.creerDetecteur({ sampleRate: SR, surEvenement: e => evts.push(e), ...opt }); for (let i = 0; i < signal.length; i += 512) d.traiter(signal.subarray(i, Math.min(signal.length, i + 512))); return { evts, d }; };
const piece = (...m) => assembler([silence(1500), ...m, silence(1200)]);

// ── ce qui doit déclencher ──
let r = jouer(piece(pic({ amp: 0.5, tau: 18, mode: 'large' })));
v('claquement de mains : un seul événement, type « main »', r.evts.length === 1 && r.evts[0].type === 'main', JSON.stringify(r.d.journal()));
r = jouer(piece(pic({ amp: 0.4, att: 0.5, tau: 3.5, duree: 40, mode: 'aigu' })));
v('claquement de doigts : un seul événement, type « doigts »', r.evts.length === 1 && r.evts[0].type === 'doigts', JSON.stringify(r.d.journal()));
r = jouer(piece(pic({ amp: 0.5, tau: 18 }), silence(600), pic({ amp: 0.5, tau: 18 })));
v('deux claquements espacés de 0,6 s (mode simple) : deux événements', r.evts.length === 2, String(r.evts.length));
r = jouer(piece(pic({ amp: 0.5, tau: 18 }), silence(130), pic({ amp: 0.5, tau: 18 })));
v('deux claquements à 0,25 s d’intervalle : le second est dans la période réfractaire → un seul', r.evts.length === 1, String(r.evts.length));

// ── double claquement ──
r = jouer(piece(pic({ amp: 0.5, tau: 18 }), silence(350), pic({ amp: 0.5, tau: 18 })), { double: true });
v('double claquement (option) : déclenche après le second, marqué « double »', r.evts.length === 1 && r.evts[0].double === true, JSON.stringify(r.evts));
r = jouer(piece(pic({ amp: 0.5, tau: 18 })), { double: true });
v('double claquement (option) : un seul claquement ne déclenche rien', r.evts.length === 0, String(r.evts.length));
r = jouer(piece(pic({ amp: 0.5, tau: 18 }), silence(1500), pic({ amp: 0.5, tau: 18 })), { double: true });
v('double claquement (option) : deux claquements trop espacés ne déclenchent rien', r.evts.length === 0, String(r.evts.length));

// ── ce qui ne doit PAS déclencher ──
r = jouer(piece(silence(3000)));
v('silence et bruit de fond : rien', r.evts.length === 0);
r = jouer(piece(pic({ amp: 0.6, att: 5, tau: 90, duree: 400, mode: 'grave' })));
v('porte qui claque (graves, long) : rien', r.evts.length === 0, JSON.stringify(r.d.journal()));
r = jouer(piece(voix(900), silence(300), voix(700, 220)));
v('voix : rien', r.evts.length === 0, JSON.stringify(r.d.journal()));
const frappe = []; for (let i = 0; i < 12; i++) { frappe.push(pic({ amp: 0.1 + 0.05 * Math.abs(alea()), att: 0.3, tau: 1.5, duree: 15, mode: 'aigu' })); frappe.push(silence(90 + Math.round(60 * Math.abs(alea())))); }
r = jouer(piece(...frappe));
v('frappe au clavier (rafale de petits pics) : rien', r.evts.length === 0, JSON.stringify(r.d.journal().slice(0, 4)));
const frappe2 = []; for (let i = 0; i < 10; i++) { frappe2.push(pic({ amp: 0.3, att: 0.3, tau: 1.5, duree: 15, mode: 'aigu' })); frappe2.push(silence(110)); }
r = jouer(piece(...frappe2));
v('frappe plus forte, régulière : au plus le tout premier pic (la garde attend trois pics)', r.evts.length <= 1, String(r.evts.length));
r = jouer(piece(pic({ amp: 0.03, tau: 18 })));
v('bruit sec très faible (3 %) : rien', r.evts.length === 0, JSON.stringify(r.d.journal()));
r = jouer(piece(pic({ amp: 0.5, tau: 18 })), { main: false });
v('claquement de mains désactivé : rien', r.evts.length === 0);
r = jouer(piece(pic({ amp: 0.4, att: 0.5, tau: 3.5, duree: 40, mode: 'aigu' })), { doigts: false });
v('claquement de doigts désactivé : rien', r.evts.length === 0);

// ── robustesse ──
const bruyant = (ms, a) => { const s = silence(ms, a); return s; };
r = jouer(assembler([bruyant(1500, 0.03), pic({ amp: 0.6, tau: 18 }), bruyant(1200, 0.03)]));
v('pièce un peu bruyante (bruit 3 %) : le claquement fort passe', r.evts.length === 1, JSON.stringify(r.d.journal()));
r = jouer(assembler([bruyant(1500, 0.03), pic({ amp: 0.12, tau: 18 }), bruyant(1200, 0.03)]), { sensibilite: 2 });
v('pièce bruyante, claquement faible, sensibilité basse : rien', r.evts.length === 0);
r = jouer(piece(pic({ amp: 0.12, tau: 18 })), { sensibilite: 9 });
const rBas = jouer(piece(pic({ amp: 0.12, tau: 18 })), { sensibilite: 1 });
v('la sensibilité compte : un claquement léger passe à 9 mais pas à 1', r.evts.length === 1 && rBas.evts.length === 0, r.evts.length + ' / ' + rBas.evts.length);
const d = D.creerDetecteur({ sampleRate: SR, sensibilite: 5 }); d.regler({ sensibilite: 10, main: false, double: true });
v('réglages à chaud', d.etat().sensibilite === 10 && d.etat().main === false && d.etat().double === true);
v('seuils : plus la sensibilité monte, plus le seuil baisse', D.seuilsPour(10).K < D.seuilsPour(5).K && D.seuilsPour(5).K < D.seuilsPour(1).K && D.seuilsPour(1).amin > D.seuilsPour(10).amin);
// découpage en morceaux de taille quelconque : même résultat
const sig = piece(pic({ amp: 0.5, tau: 18 }));
const a1 = jouer(sig).evts.length; const d2 = D.creerDetecteur({ sampleRate: SR }); let n2 = 0; for (let i = 0; i < sig.length; i += 77) n2 += d2.traiter(sig.subarray(i, Math.min(sig.length, i + 77))).length;
v('découpage des échantillons en morceaux quelconques : même résultat', a1 === 1 && n2 === 1, a1 + ' / ' + n2);
// autres fréquences d'échantillonnage
const SR2 = 44100; const sig44 = (() => { const s = new Float32Array(Math.round(SR2 * 3)); for (let i = 0; i < s.length; i++) s[i] = 0.004 * alea(); const deb = Math.round(SR2 * 1.5); for (let i = 0; i < Math.round(SR2 * 0.12); i++) { const t = i / SR2 * 1000; s[deb + i] += 0.5 * Math.exp(-t / 18) * alea(); } return s; })();
const d3 = D.creerDetecteur({ sampleRate: SR2 }); let n3 = 0; for (let i = 0; i < sig44.length; i += 512) n3 += d3.traiter(sig44.subarray(i, Math.min(sig44.length, i + 512))).length;
v('44,1 kHz : le claquement est détecté', n3 === 1, String(n3));
v('aucun NaN dans l’état', !/NaN/.test(JSON.stringify(d3.etat())));

// mot-clé local
v('mot-clé : « relais » seul, « rayé [unk] [unk] », « [unk] relais »', D.motCleDansTexte('relais') && D.motCleDansTexte('rayé [unk] [unk]') && D.motCleDansTexte('[unk] relais'));
v('mot-clé : phrase longue ou mot en fin de phrase : rien', !D.motCleDansTexte('[unk] [unk] [unk] relais') && !D.motCleDansTexte('le relais de la course') && !D.motCleDansTexte('') && !D.motCleDansTexte('[unk] [unk]') && !D.motCleDansTexte(null));
v('mot-clé : accents et casse ignorés, mots personnalisés', D.motCleDansTexte('Rayé') && D.motCleDansTexte('RALLYE') && D.motCleDansTexte('réalé', ['réalé']) && !D.motCleDansTexte('relais', ['réalé']));
v('grammaire Vosk : JSON valide avec [unk], sans doublon', (() => { const g = JSON.parse(D.grammaireMotCle(['Relais', 'relais', 'rayé'])); return g.length === 3 && g.includes('[unk]'); })());
{ const SR16 = 16000, sig = new Float32Array(SR16 * 3); for (let i = 0; i < sig.length; i++) sig[i] = 0.004 * alea(); const deb = SR16 * 1.5; let prev = 0; for (let i = 0; i < SR16 * 0.12; i++) { const t = i / SR16 * 1000, b = alea(), h = b - 0.6 * prev; prev = b; sig[deb + i] += 0.5 * Math.exp(-t / 18) * h * 0.8; }
  const d4 = D.creerDetecteur({ sampleRate: SR16 }); let n4 = 0; for (let i = 0; i < sig.length; i += 2048) n4 += d4.traiter(sig.subarray(i, Math.min(sig.length, i + 2048))).length;
  v('16 kHz (fréquence de la veille locale) : le claquement est détecté une fois', n4 === 1, String(n4)); }

console.log(`\n${ok} réussis, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
