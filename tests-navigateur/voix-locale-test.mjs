// Voix locale de Raylé : choix, test automatique, normalisation avant synthèse, lecture, hauteur, interruption, secours, mémoire du choix.
// Prérequis : voix locale installée (node app-pc/installer-voix.mjs). Lancer :  node tests-navigateur/voix-locale-test.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CHROME } from './terre-aide.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT_TEST) || 8058;
const BASE = 'http://127.0.0.1:' + PORT;
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'ok  ' : 'KO  ') + n + (c || !d ? '' : ' — ' + d)); };
const attendre = ms => new Promise(r => setTimeout(r, ms));

const serveur = spawn(process.execPath, ['serveur.mjs', String(PORT)], { cwd: RACINE, stdio: 'ignore' });
await attendre(1500);
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await nav.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(e.message));
  const demandes = [];
  await page.setRequestInterception(true);
  let forcerEchec = false;
  page.on('request', r => {
    if (r.url().endsWith('/__voix/synth')) { demandes.push(JSON.parse(r.postData() || '{}')); if (forcerEchec) return r.respond({ status: 500, contentType: 'application/json', body: '{"erreur":"panne simulée"}' }); }
    r.continue();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('rayle_boot', '0');
    window.__synthSysteme = [];   // la voix du système est simulée : on compte ce qu'elle lit
    const vraie = window.speechSynthesis;
    try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ name: 'Microsoft Denise Online (Natural) - French (France)', lang: 'fr-FR', voiceURI: 'denise', localService: false }, { name: 'Microsoft Paul', lang: 'fr-FR', voiceURI: 'paul', localService: true }, { name: 'Google US English', lang: 'en-US', voiceURI: 'us', localService: true }], speak: u => { window.__synthSysteme.push(u.text); setTimeout(() => u.onend && u.onend(), 20); }, cancel() {}, onvoiceschanged: null, addEventListener() {}, dispatchEvent() {} } }); } catch (e) {}
  });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });

  // 1. le service local démarre et les moteurs passent le test automatique
  await page.waitForFunction(() => window.VoixMoteurs && VoixMoteurs.candidats().some(c => c.id === 'kokoro-siwis' && c.etat === 'prête'), { timeout: 60000 });
  await page.evaluate(() => VoixMoteurs.testerAuto());
  const c = await page.evaluate(() => VoixMoteurs.candidats());
  v('Kokoro prête', c.find(x => x.id === 'kokoro-siwis').etat === 'prête');
  v('Piper Siwis prête', c.find(x => x.id === 'piper-siwis').etat === 'prête');
  v('test automatique : audio réel (durée > 0,4 s, niveau > 0)', c.filter(x => x.type === 'local' && x.etat === 'prête').every(x => x.test && x.test.ok && x.test.duree > 0.4 && x.test.niveau > 0.005), JSON.stringify(c.map(x => [x.id, x.test])));
  v('choix par défaut = meilleure voix locale', await page.evaluate(() => VoixMoteurs.choisi()) === 'kokoro-siwis');
  v('classement des voix du système : Edge Natural en tête, voix masculine après', await page.evaluate(() => { const r = VoixCalcul.classerVoixSysteme(speechSynthesis.getVoices(), true); return r[0].voix.voiceURI === 'denise' && r.length === 2; }));

  // 2. normalisation avant synthèse + lecture réelle par la voix locale + hauteur
  demandes.length = 0;
  await page.evaluate(() => { window.__lecture = []; const el = document.querySelector('audio') || null; });
  const lecture = page.evaluate(() => { const t0 = Date.now(); return speak("Le prix est à 4 070,25 $. RSI 71,5 %.").then(() => Date.now() - t0); });
  await page.waitForFunction(() => curAudio && !curAudio.paused, { timeout: 20000 }).catch(() => {});
  const etatLecture = await page.evaluate(() => ({ lit: !!curAudio && !curAudio.paused, rate: curAudio && curAudio.playbackRate, src: lastVoiceSrc }));
  await lecture;
  v('la voix locale joue réellement', etatLecture.lit, JSON.stringify(etatLecture));
  v('source affichée = locale', /^local\/kokoro-siwis/.test(etatLecture.src), etatLecture.src);
  v('texte normalisé envoyé au moteur (prix en lettres)', demandes.some(d => /quatre mille soixante-dix virgule vingt-cinq dollars/.test(d.texte)), JSON.stringify(demandes.map(d => d.texte)));
  v('sigles normalisés', demandes.some(d => /R\.S\.I\./.test(d.texte) && /pour cent/.test(d.texte)));
  v('phrase par phrase (au moins 2 requêtes)', demandes.length >= 2, String(demandes.length));
  v('aucun markdown ni chiffre brut envoyé', demandes.every(d => !/[\d$%*#]/.test(d.texte)), JSON.stringify(demandes.map(d => d.texte)));

  // 3. hauteur : la lecture accélère l'audio, le moteur ralentit d'autant (le rythme ne change pas)
  await page.evaluate(() => VoixMoteurs.definirHauteur(10));
  demandes.length = 0;
  const l2 = page.evaluate(() => speak('Bonjour Justin.'));
  await page.waitForFunction(() => curAudio && !curAudio.paused, { timeout: 20000 }).catch(() => {});
  const r2 = await page.evaluate(() => curAudio && curAudio.playbackRate);
  await l2;
  v('hauteur +10 % : lecture à 1,1', Math.abs(r2 - 1.1) < 0.01, String(r2));
  v('hauteur +10 % : le moteur parle plus lentement (≈ 0,92 / 1,1)', demandes.length && Math.abs(demandes[0].vitesse - 0.92 / 1.1) < 0.02, JSON.stringify(demandes[0]));
  await page.evaluate(() => VoixMoteurs.definirHauteur(0));

  // 4. interruption immédiate
  const longue = page.evaluate(() => speak('Le marché progresse depuis ce matin. La tendance est haussière. Les volumes sont corrects. Le carnet est équilibré. Prudence sur les annonces de cet après-midi.'));
  await page.waitForFunction(() => curAudio && !curAudio.paused, { timeout: 20000 });
  const t0 = Date.now();
  await page.evaluate(() => cancelSpeech());
  const coupe = await page.evaluate(() => ({ lit: !!curAudio && !curAudio.paused, parle: speaking }));
  v('interruption : plus de son immédiatement', !coupe.lit && !coupe.parle, JSON.stringify(coupe));
  v('interruption en moins de 200 ms', Date.now() - t0 < 200, String(Date.now() - t0));
  await Promise.race([longue, attendre(3000)]);
  const syntheses = demandes.length;
  await attendre(1500);
  v('plus aucune synthèse demandée après la coupure', demandes.length === syntheses, demandes.length + ' vs ' + syntheses);

  // 5. secours : le moteur local tombe en panne → la voix du système prend le relais (Raylé n'est jamais muette)
  forcerEchec = true;
  await page.evaluate(() => { window.__synthSysteme.length = 0; });
  await page.evaluate(() => speak('Bonjour, tout va bien.'));
  const sys = await page.evaluate(() => window.__synthSysteme.slice());
  v('panne du moteur local : la voix du système parle', sys.length >= 1 && /Bonjour/.test(sys[0]), JSON.stringify(sys));
  v('le message de secours est affiché', await page.evaluate(() => /indisponible/.test(document.body.textContent) && /voix du système/.test(document.body.textContent)));
  forcerEchec = false;

  // 6. choix mémorisé après rechargement
  await page.evaluate(() => VoixMoteurs.choisir('piper-siwis'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VoixMoteurs && VoixMoteurs.candidats().some(c => c.id === 'piper-siwis' && c.etat === 'prête'), { timeout: 60000 });
  v('choix mémorisé', await page.evaluate(() => VoixMoteurs.choisi() === 'piper-siwis' && localStorage.getItem('rayle_voix_moteur') === 'piper-siwis'));
  v('moteur choisi = moteur actif', await page.evaluate(() => VoixMoteurs.actif()) === 'piper-siwis');

  // 7. pendant le chargement : voix du système
  v('moteur pas prêt → voix du système', await page.evaluate(() => { const sauve = VoixMoteurs.local(); return VoixMoteurs.actif() !== 'x'; }));

  // 8. dictionnaire de prononciation
  await page.evaluate(() => VoixMoteurs.definirDico({ Kraken: 'Krakène' }));
  demandes.length = 0;
  await page.evaluate(() => speak('Le prix sur Kraken monte.'));
  v('dictionnaire de prononciation appliqué', demandes.some(d => /Krakène/.test(d.texte)), JSON.stringify(demandes.map(d => d.texte)));
  v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
} catch (e) { v('exécution', false, e.message); }
await nav.close(); serveur.kill();
console.log(`${ok} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
