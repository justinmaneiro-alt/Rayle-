// v10 phase 3 : activation par le prénom (écoute locale Vosk, voix Windows Hortense comme faux micro). Prénom seul, prénom + question, question de suivi sans le prénom, retour en veille après 8 s,
// faux déclenchements (rail, réel, rallye, conversation), stop / pause / reprends, sensibilités. La reconnaissance du navigateur et la voix de Rayle sont simulées (aucun réseau).
// Prérequis : node serveur.mjs 8000 (depuis la racine du dépôt). Usage : cd tests-navigateur && node activation-v10-test.mjs
import puppeteer from 'puppeteer-core';
import path from 'node:path'; import { createRequire } from 'node:module';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
const { verifier, fin } = compteur(); const D = createRequire(import.meta.url)('../core/voice/declencheurs-calcul.js');
async function lancer(wav, reglages = null, { mobile = false } = {}) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve('audio', wav + '.wav'), '--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await b.newPage(); const erreurs = []; if (mobile) { await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'); await page.setViewport({ width: 1024, height: 768, isMobile: true, hasTouch: true }); } page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.evaluateOnNewDocument(r => {
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); if (!/Android/.test(navigator.userAgent)) localStorage.setItem('rayle_mode_ecoute', 'mainslibres'); localStorage.setItem('rayle_piper_precharge', '0');
    if (r) localStorage.setItem('rayle_activation', JSON.stringify(r)); else localStorage.removeItem('rayle_activation');
    window.__sr = { starts: 0, stops: 0, actif: false, t: [] };
    class FauxSR { start() { if (window.__sr.actif) { const e = new Error('déjà démarré'); e.name = 'InvalidStateError'; throw e; } window.__sr.actif = true; window.__sr.starts++; window.__sr.t.push(Date.now()); window.__srInst = this; setTimeout(() => this.onstart && this.onstart(), 5); } stop() { this.abort(); } abort() { if (window.__sr.actif) { window.__sr.actif = false; window.__sr.stops++; setTimeout(() => this.onend && this.onend(), 5); } } }
    window.SpeechRecognition = window.webkitSpeechRecognition = FauxSR;
    window.__emettre = t => { const a = [{ transcript: t }]; a.isFinal = true; window.__srInst.onresult({ resultIndex: 0, results: [a] }); };
  }, reglages);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  await page.evaluate(() => { window.__dit = []; window.__users = []; window.__onUserOrig = window.onUser; window.speak = t => { window.__dit.push(String(t)); }; window.onUser = (t, v) => { window.__users.push(String(t)); }; });
  return { b, page, erreurs };
}
const etat = page => page.evaluate(() => ({ etat: Activation.etat(), sr: { ...window.__sr }, dit: window.__dit.slice(), users: window.__users.slice(), puces: Activation.puces() }));
const demarrer = page => page.evaluate(() => { startListening(); });
const SANS_CLAQUEMENTS = { mains: false, doigts: false };

/* 1. prénom seul : ACTIF, pas de phrase d'accueil, petit son d'écoute après 1,6 s, la reconnaissance du navigateur démarre */
{ const { b, page, erreurs } = await lancer('rayle', SANS_CLAQUEMENTS); const d = await page.evaluate(() => Activation.reglages().delai); verifier('durée du mode conversation par défaut : 8 s', d === 8, String(d));
  await demarrer(page); await page.waitForFunction(() => Activation.etat() === 'ACTIF', { timeout: 40000 }).catch(() => {}); await attendre(3200); const e = await etat(page);
  verifier('1. « Rayle » seul → ACTIF, reconnaissance du navigateur démarrée', e.etat === 'ACTIF' && e.sr.starts >= 1, JSON.stringify([e.etat, e.sr.starts]));
  const ACCUEIL = /Oui, Justin|Je t.écoute|Présent|Dis-moi tout|Dites-moi tout/; verifier('1. « Rayle » seul → aucune phrase d’accueil du type « Oui, Justin ? » (le message de bienvenue de la toute première activation est autre chose)', !e.dit.some(t => ACCUEIL.test(t)), JSON.stringify(e.dit));
  verifier('1. « Rayle » seul → petit son d’écoute joué', e.puces >= 1, String(e.puces)); verifier('1. aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | ')); await b.close(); }
/* 2 et 3. prénom + question dans la même phrase, puis question de suivi sans le prénom, puis retour en veille après 8 s */
{ const { b, page } = await lancer('rayle-point-or', SANS_CLAQUEMENTS); await demarrer(page); await page.waitForFunction(() => Activation.etat() === 'ACTIF', { timeout: 40000 }).catch(() => {}); const t0 = Date.now();
  await attendre(400); await page.evaluate(() => window.__emettre('fais-moi un point sur l’or')); await attendre(400); let e = await etat(page);
  verifier('2. « Rayle, fais-moi un point sur l’or » → ACTIF, la reconnaissance démarre tout de suite', e.etat === 'ACTIF' && e.sr.starts >= 1, JSON.stringify([e.etat, e.sr.starts]));
  verifier('2. la question est traitée directement (sans repasser par « Rayle »)', e.users.some(t => /point sur l.or/.test(t)), JSON.stringify(e.users));
  verifier('2. aucune phrase d’accueil, aucun petit son (la question est déjà là)', !e.dit.some(t => /Oui, Justin|Je t.écoute|Présent|Dis-moi tout|Dites-moi tout/.test(t)) && e.puces === 0, JSON.stringify([e.dit, e.puces]));
  await page.evaluate(() => window.__emettre('et en H4 ?')); await attendre(500); e = await etat(page);
  verifier('3. question de suivi « et en H4 ? » sans le prénom, dans les 8 s → traitée', e.users.some(t => /et en h4/i.test(t)) && e.etat === 'ACTIF', JSON.stringify(e.users));
  await page.waitForFunction(() => Activation.etat() === 'VEILLE', { timeout: 20000 }).catch(() => {}); e = await etat(page); const dt = (Date.now() - t0) / 1000;
  verifier('3. après 8 s de silence → retour en VEILLE (pas COUPÉ)', e.etat === 'VEILLE', e.etat + ' après ' + dt.toFixed(1) + ' s'); await b.close(); }
/* 4. faux déclenchements : phrases qui contiennent des mots proches du prénom */
for (const [wav, nom] of [['rail-gare', '« le rail de la gare… »'], ['reel', '« c’est réel, regarde… »'], ['rallye', '« le rallye de Monte-Carlo… »'], ['conversation', 'conversation ordinaire']]) {
  const { b, page } = await lancer(wav, SANS_CLAQUEMENTS); await demarrer(page); await attendre(7500); const e = await etat(page);
  verifier('4. faux déclenchement évité : ' + nom, e.etat === 'VEILLE' && e.sr.starts === 0, JSON.stringify([e.etat, e.sr.starts])); await b.close(); }
/* 5. stop, pause, reprends (le vrai traitement des commandes ; la voix est simulée) */
{ const { b, page } = await lancer('bruit', SANS_CLAQUEMENTS); await demarrer(page); await page.waitForFunction(() => Activation.etat() === 'VEILLE', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { Activation.declencher({ source: 'mot' }); }); await attendre(800);
  await page.evaluate(() => { window.onUser = window.__onUserOrig; });   // retour au vrai traitement des phrases
  await page.evaluate(() => { speaking = true; lastSpokenRaw = 'Voici le point sur l’or. Il reste au-dessus de sa moyenne mobile.'; onUser('Rayle, stop', true); }); await attendre(400);
  let r = await page.evaluate(() => ({ coupee: window.__paroleCoupee, parle: speaking })); verifier('5. « Rayle, stop » : la parole est coupée', r.parle === false && /point sur l.or/.test(r.coupee || ''), JSON.stringify(r));
  await page.evaluate(() => { window.__dit.length = 0; onUser('Rayle, reprends', true); }); await attendre(400); r = await page.evaluate(() => window.__dit.slice()); verifier('5. « Rayle, reprends » : relit la réponse interrompue', r.some(t => /point sur l.or/.test(t)), JSON.stringify(r));
  await page.evaluate(() => { Activation.declencher({ source: 'mot' }); onUser('Rayle, mets-toi en pause', true); }); await attendre(600); const e = await etat(page); verifier('5. « Rayle, mets-toi en pause » : micro coupé (COUPÉ) jusqu’au prochain toucher', e.etat === 'COUPÉ', e.etat); await b.close(); }
/* 7. tablette / téléphone (Android simulé, mode d’écoute « auto ») : l’écoute locale du prénom remplace le mode « toucher » */
{ const { b, page, erreurs } = await lancer('rayle', SANS_CLAQUEMENTS, { mobile: true }); const m = await page.evaluate(() => ({ mobile: IS_MOBILE, mode: modeEcoute(), toucher: modeToucher() }));
  verifier('7. tablette : écoute mains libres par le prénom (plus le mode « toucher »)', m.mobile && m.mode === 'mainslibres' && !m.toucher, JSON.stringify(m));
  await demarrer(page); await page.waitForFunction(() => Activation.etat() === 'ACTIF', { timeout: 40000 }).catch(() => {}); await attendre(500); const e = await etat(page);
  verifier('7. tablette : « Rayle » entendu en local → ACTIF', e.etat === 'ACTIF' && e.sr.starts >= 1, JSON.stringify([e.etat, e.sr.starts])); verifier('7. tablette : aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | ')); await b.close(); }
/* 6. sensibilités du prénom */
const cas = (n, t, att) => verifier('6. sensibilité ' + n + ' : « ' + t + ' » → ' + (att ? 'déclenche' : 'ne déclenche pas'), D.motCleDansTexte(t, null, n) === att);
cas('stricte', 'rayé', true); cas('stricte', 'rayé quelle heure', false); cas('stricte', 'rayé quoi', true); cas('stricte', 'le rayé', false);
cas('normale', 'rayé [unk] [unk]', true); cas('normale', 'le relais de la course', false); cas('large', 'rayé [unk] [unk] [unk] [unk]', true); cas('large', 'ce matin le rallye de monte carlo', false);
verifier('6. quatre mots proches du prénom reconnus (relais, rayé, rallye, raillé)', ['relais', 'rayé', 'rallye', 'raillé'].every(m => D.motCleDansTexte(m, null, 'normale')));
fin();
