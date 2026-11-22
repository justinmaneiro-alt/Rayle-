// Tests de la voix de Rayle (calculs purs) : classement des voix du système, hauteur et vitesse, contrôle d'un enregistrement, choix par défaut.
// Lancer :  node galaxie/tests/voix-moteurs-test.mjs
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../../core/voice/voix-moteurs-calcul.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// classement des voix du système : Edge « Natural » > Google français > Samsung > Windows ; féminines d'abord ; non françaises écartées
const voix = [
  { name: 'Microsoft Henri Online (Natural) - French (France)', lang: 'fr-FR', localService: false },
  { name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', localService: false },
  { name: 'Google français', lang: 'fr-FR' }, { name: 'Samsung French female', lang: 'fr-FR' },
  { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR' }, { name: 'Microsoft Paul', lang: 'fr-FR' },
  { name: 'Google US English', lang: 'en-US' }, { name: 'Microsoft Eloise Online (Natural) - French (Canada)', lang: 'fr_CA' }
];
const r = C.classerVoixSysteme(voix, true).map(x => x.voix.name);
v('l\'anglais est écarté', !r.some(n => /US English/.test(n)));
v('Edge Natural féminine en tête', /Denise/.test(r[0]) || /Eloise/.test(r[0]), r[0]);
v('Edge Natural masculine après les féminines Natural', r.indexOf(voix[0].name) > r.indexOf(voix[1].name));
v('Google français devant Windows', r.indexOf('Google français') < r.indexOf('Microsoft Hortense - French (France)'));
v('voix masculine Windows en dernier', r[r.length - 1] === 'Microsoft Paul', r.join(' | '));
v('familles', C.familleVoixSysteme(voix[1]) === 'Edge Natural' && C.familleVoixSysteme(voix[2]) === 'Google' && C.familleVoixSysteme(voix[3]) === 'Samsung / Android' && C.familleVoixSysteme(voix[4]) === 'Windows');
v('aucune voix française → liste vide', C.classerVoixSysteme([{ name: 'English', lang: 'en-GB' }], true).length === 0);
v('liste absente → liste vide', C.classerVoixSysteme(null, true).length === 0);

// hauteur et vitesse : la hauteur change sans changer le rythme
let f = C.facteursLecture(1, 0); v('sans hauteur : rien ne change', f.vitesseLecture === 1 && f.vitesseMoteur === 1);
f = C.facteursLecture(0.92, 10); v('hauteur +10 % : lecture ×1,1', Math.abs(f.vitesseLecture - 1.1) < 1e-9);
v('rythme conservé : vitesse moteur × lecture = vitesse voulue', Math.abs(f.vitesseMoteur * f.vitesseLecture - 0.92) < 1e-9);
f = C.facteursLecture(1, -20); v('hauteur −20 % : lecture ×0,8', Math.abs(f.vitesseLecture - 0.8) < 1e-9 && Math.abs(f.vitesseMoteur * f.vitesseLecture - 1) < 1e-9);
f = C.facteursLecture(5, 90); v('valeurs bornées', f.vitesseLecture <= 1.35 && f.vitesseMoteur <= 2 && f.vitesseMoteur >= 0.5);
f = C.facteursLecture('abc', 'xyz'); v('valeurs absurdes : défauts', f.vitesseLecture === 1 && f.vitesseMoteur === 1);

// contrôle d'un enregistrement WAV (test automatique d'un moteur)
function wav(secondes, amplitude, taux = 22050) {
  const n = Math.floor(secondes * taux), b = new ArrayBuffer(44 + n * 2), d = new DataView(b);
  const e = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  e(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); e(8, 'WAVE'); e(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, taux, true); d.setUint32(28, taux * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); e(36, 'data'); d.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.round(Math.sin(i / 12) * amplitude * 32767), true);
  return new Uint8Array(b);
}
let a = C.analyserWav(wav(2, 0.4)); v('WAV valide : ok, durée 2 s', a.ok && Math.abs(a.duree - 2) < 0.01 && a.niveau > 0.2, JSON.stringify(a));
a = C.analyserWav(wav(2, 0)); v('WAV silencieux : refusé', !a.ok && /silenc/.test(a.raison), JSON.stringify(a));
a = C.analyserWav(wav(0.1, 0.4)); v('WAV trop court : refusé', !a.ok && /court/.test(a.raison));
a = C.analyserWav(new Uint8Array(100)); v('pas un WAV : refusé', !a.ok);
a = C.analyserWav(new TextEncoder().encode('{"erreur":"panne simulée"}'.padEnd(80, ' '))); v('réponse d\'erreur JSON : refusée', !a.ok);

// choix par défaut : la première voix de l'ordre de préférence dont le test a réussi ; sinon la voix du système
v('ordre de préférence : local d\'abord', C.ORDRE_DEFAUT[0] === 'kokoro-siwis' && C.ORDRE_DEFAUT[C.ORDRE_DEFAUT.length - 1] === 'systeme');
v('Kokoro OK → Kokoro', C.choisirParDefaut({ 'kokoro-siwis': { ok: true }, 'piper-siwis': { ok: true } }) === 'kokoro-siwis');
v('Kokoro en échec → Piper', C.choisirParDefaut({ 'kokoro-siwis': { ok: false }, 'piper-siwis': { ok: true } }) === 'piper-siwis');
v('locales en échec, Edge OK → Edge', C.choisirParDefaut({ 'kokoro-siwis': { ok: false }, 'piper-siwis': { ok: false }, edge: { ok: true } }) === 'edge');
v('tout en échec → voix du système (jamais muette)', C.choisirParDefaut({ 'kokoro-siwis': { ok: false } }) === 'systeme' && C.choisirParDefaut({}) === 'systeme' && C.choisirParDefaut(null) === 'systeme');
v('phrase d\'essai demandée', /Bonjour, je suis Rayle/.test(C.PHRASE_ESSAI) && /quatre mille soixante-dix dollars/.test(C.PHRASE_ESSAI) && /moyenne mobile/.test(C.PHRASE_ESSAI));
// v7 : regroupement des phrases pour Gemini (une requête par réponse) et limiteur de départs (3 par minute)
const R = C.regrouperPourGemini;
v('4 phrases courtes → 1 seule requête', R(['Un.', 'Deux.', 'Trois.', 'Quatre.']).length === 1 && R(['Un.', 'Deux.', 'Trois.', 'Quatre.'])[0] === 'Un. Deux. Trois. Quatre.');
const longue = Array.from({ length: 30 }, (_, i) => 'Ceci est la phrase numéro ' + i + ', assez longue pour remplir.');
const L = R(longue, 550); v('réponse trop longue : découpée sous 550 caractères', L.length >= 3 && L.every(x => x.length <= 550), L.map(x => x.length).join(','));
v('aucun texte perdu au découpage', L.join(' ').replace(/\s+/g, ' ') === longue.join(' '));
v('une phrase unique démesurée est coupée aux espaces', R(['mot '.repeat(400)], 550).every(x => x.length <= 550) && R(['mot '.repeat(400)], 550).length >= 3);
v('entrée vide', R([]).length === 0 && R(['', '  ']).length === 0);
{ let t = 0; const lim = C.creerLimiteur({ max: 3, fenetre: 62000, maintenant: () => t });
  v('3 départs immédiats', lim.creneau() === 0 && lim.creneau() === 0 && lim.creneau() === 0);
  t = 10000; const d = lim.creneau(); v('le 4e attend la fin de la fenêtre du 1er (≈ 52 s)', d === 52000, String(d));
  t = 62001; v('après la fenêtre : de nouveau libre', lim.creneau() === 0); }
/* v9 : découpage pour Piper (la première part part vite) */
{ const L = C.decouperPourPiper(['Voici le point sur l’or, qui reste au-dessus de sa moyenne mobile à deux cents jours, avec un volume plutôt faible aujourd’hui.', 'Oui.', 'Le Bitcoin est plus fragile.']);
  v('Piper : première part ≤ 90 caractères', L[0].length <= 90, L[0]); v('Piper : parts ≤ 140 caractères', L.every(x => x.length <= 140)); v('Piper : miettes rattachées (« Oui. » avec la suivante)', L.some(x => /^Oui. Le Bitcoin/.test(x)), JSON.stringify(L));
  v('Piper : aucun texte perdu', L.join(' ').replace(/s+/g, ' ').length >= 130); v('Piper : liste vide acceptée', C.decouperPourPiper([]).length === 0); }
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
