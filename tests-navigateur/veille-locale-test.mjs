// Veille locale (claquements + mot « Raylé » par Vosk) avec de FAUX micros : enregistrements synthétiques et voix Windows (Hortense).
// Chaque scénario lance un Chrome dont le « micro » rejoue un fichier WAV en boucle. node tests-navigateur/veille-locale-test.mjs [scenario]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
const { verifier, fin } = compteur();
const SCENARIOS = [
  ['claquement-mains', 'main', true], ['claquement-doigts', 'doigts', true], ['double-claquement', 'main', true, { double: true }],
  ['clavier', null, false], ['porte', null, false], ['voix-synthetique', null, false], ['bruit', null, false],
  ['rayle', 'mot', true], ['he-rayle', 'mot', true], ['rayle-heure', 'mot', true], ['conversation', null, false]
];
const choisi = process.argv[2];
for (const [wav, attendu, doitDeclencher, reglages] of SCENARIOS) {
  if (choisi && choisi !== wav) continue;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve('audio', wav + '.wav'), '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage(); const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  const r = await page.evaluate(async (reglages, avecMot) => {
    const evts = []; await VeilleLocale.demarrer({ surDeclencheur: d => evts.push(d), reglages: { motCle: avecMot, ...(reglages || {}) } });
    await new Promise(r => setTimeout(r, avecMot ? 16000 : 12000));
    const e = VeilleLocale.etat(); await VeilleLocale.arreter(); return { evts, e };
  }, reglages || null, /rayle|conversation/.test(wav));
  const sources = [...new Set(r.evts.map(d => d.source))];
  if (doitDeclencher) verifier(`${wav} : déclenche « ${attendu} »`, sources.includes(attendu), JSON.stringify(sources) + ' ' + JSON.stringify(r.e.claquements.slice(-2)) + ' mot=' + r.e.motCle + ' écouté=' + r.e.derniereEcoute);
  else verifier(`${wav} : aucun déclenchement`, r.evts.length === 0, JSON.stringify(r.evts) + ' ' + JSON.stringify(r.e.claquements.slice(-3)) + ' écouté=' + r.e.derniereEcoute);
  if (wav === 'rayle') verifier('mot-clé local : le modèle est chargé, rien n’est envoyé au réseau', r.e.motCle === 'pret' && r.e.envoiReseau === false && r.e.erreur === '', JSON.stringify([r.e.motCle, r.e.erreur]));
  verifier(`${wav} : aucune erreur JavaScript`, erreurs.length === 0, erreurs.join('|'));
  await b.close();
}
fin();
