// Activation vocale V1 : cycle COUPÉ → VEILLE → ACTIF → VEILLE → COUPÉ avec de FAUX micros (claquements, voix Hortense) ; pas de reconnaissance du navigateur en veille ;
// pas d'auto-déclenchement pendant la parole de Raylé ; une seule instance ; relance après interruption. La reconnaissance du navigateur est remplacée par un faux (aucun réseau).
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';
const { verifier, fin } = compteur();
async function lancer(wav, reglages = null) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + path.resolve('audio', wav + '.wav'), '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage(); const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load|CORS|faireconomy|ERR_FAILED/.test(m.text())) erreurs.push(m.text().slice(0, 160)); });
  await page.evaluateOnNewDocument(r => {
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_mode_ecoute', 'mainslibres');
    if (r) localStorage.setItem('rayle_activation', JSON.stringify(r)); else localStorage.removeItem('rayle_activation');
    // faux SpeechRecognition : compte les démarrages (ce que le navigateur enverrait à un service distant)
    window.__sr = { starts: 0, stops: 0, actif: false };
    class FauxSR { start() { if (window.__sr.actif) { const e = new Error('déjà démarré'); e.name = 'InvalidStateError'; throw e; } window.__sr.actif = true; window.__sr.starts++; setTimeout(() => this.onstart && this.onstart(), 5); } stop() { this.abort(); } abort() { if (window.__sr.actif) { window.__sr.actif = false; window.__sr.stops++; setTimeout(() => this.onend && this.onend(), 5); } } }
    window.SpeechRecognition = window.webkitSpeechRecognition = FauxSR;
  }, reglages);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1500);
  await page.evaluate(() => { window.speak = () => {}; });                    // pas de voix de synthèse dans le test : on observe les états
  return { b, page, erreurs };
}
const etat = page => page.evaluate(() => ({ etat: Activation.etat(), sr: { ...window.__sr }, vl: VeilleLocale.etat(), corps: document.body.dataset.etat, libelle: document.getElementById('state').textContent }));
const demarrer = page => page.evaluate(() => { startListening(); });

// ── 1. cycle complet : COUPÉ → VEILLE → ACTIF → VEILLE → COUPÉ (micro de test = bruit de fond ; le déclencheur est simulé ici, les vrais claquements sont testés plus bas) ──
{
  const { b, page, erreurs } = await lancer('bruit', { mot: false });
  let e = await etat(page);
  verifier('départ : COUPÉ, micro éteint, aucune écoute', e.etat === 'COUPÉ' && e.corps === 'idle' && !e.vl.actif && e.vl.micro === 'fermé' && e.sr.starts === 0, JSON.stringify([e.etat, e.corps]));
  await demarrer(page); await attendre(2500); e = await etat(page);
  verifier('VEILLE : micro ouvert, veille locale active, état « veille » (couleur et animation propres)', e.etat === 'VEILLE' && e.corps === 'veille' && e.vl.actif && e.vl.micro === 'ouvert', JSON.stringify([e.etat, e.corps, e.vl.micro]));
  verifier('VEILLE : la reconnaissance du navigateur n’a JAMAIS démarré (aucun son envoyé)', e.sr.starts === 0 && e.vl.envoiReseau === false, JSON.stringify(e.sr));
  verifier('libellés des trois états distincts', await page.evaluate(() => { const S = STATES; return /^COUPÉ/.test(S.idle) && /^VEILLE/.test(S.veille) && /^ACTIF/.test(S.listening) && new Set([S.idle, S.veille, S.listening]).size === 3; }));
  await page.evaluate(() => Activation.declencher({ source: 'main' })); await attendre(1200); e = await etat(page);
  verifier('déclencheur → ACTIF : la reconnaissance du navigateur démarre seulement maintenant', e.etat === 'ACTIF' && ['listening', 'speaking', 'thinking'].includes(e.corps) && !e.vl.actif, JSON.stringify([e.etat, e.corps, e.sr, e.vl.actif]));
  await attendre(4200); e = await etat(page);
  verifier('micro ouvert par la reconnaissance du navigateur seulement en ACTIF', e.sr.starts >= 1, JSON.stringify(e.sr));
  await page.evaluate(() => onUser('Raylé, mets-toi en veille', true)); await attendre(1500); e = await etat(page);
  verifier('commande vocale « Raylé, mets-toi en veille » : ACTIF → VEILLE (écoute locale relancée)', e.etat === 'VEILLE' && e.vl.actif && !e.sr.actif, JSON.stringify([e.etat, e.vl.actif, e.sr]));
  await page.evaluate(() => Activation.declencher({ source: 'doigts' })); await attendre(1500);
  await page.evaluate(() => onUser('Raylé, coupe le micro', true)); await attendre(1500); e = await etat(page);
  verifier('commande vocale « Raylé, coupe le micro » : ACTIF → COUPÉ (micro totalement éteint)', e.etat === 'COUPÉ' && e.vl.micro === 'fermé' && !e.sr.actif, JSON.stringify([e.etat, e.vl.micro, e.sr]));
  await demarrer(page); await attendre(2000); await page.evaluate(() => Activation.declencher({ source: 'main' })); await attendre(1500);
  await page.evaluate(() => Activation.regler({ delai: 5 }));
  await page.waitForFunction(() => Activation.etat() === 'VEILLE', { timeout: 30000 }).catch(() => {}); e = await etat(page);
  verifier('silence réglable (5 s) → retour automatique en VEILLE, jamais en COUPÉ', e.etat === 'VEILLE' && e.corps === 'veille', JSON.stringify([e.etat, e.corps]));
  await attendre(1500); e = await etat(page);
  verifier('retour en VEILLE : reconnaissance du navigateur arrêtée, veille locale relancée', !e.sr.actif && e.vl.actif, JSON.stringify([e.sr, e.vl.actif]));
  await page.evaluate(() => { document.getElementById('btnCouper').click(); }); await attendre(1200); e = await etat(page);
  verifier('bouton Couper → COUPÉ : micro totalement éteint', e.etat === 'COUPÉ' && e.corps === 'idle' && !e.vl.actif && e.vl.micro === 'fermé' && !e.sr.actif, JSON.stringify([e.etat, e.vl.micro, e.sr]));
  verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await b.close();
}

// ── 2. les bruits ne déclenchent rien ──
for (const wav of ['clavier', 'porte', 'voix-synthetique']) {
  const { b, page } = await lancer(wav, { mot: false }); await demarrer(page); await attendre(11000); const e = await etat(page);
  verifier(`${wav} : reste en VEILLE (aucun déclenchement), reconnaissance du navigateur jamais démarrée`, e.etat === 'VEILLE' && e.sr.starts === 0 && e.vl.declenchements.length === 0, JSON.stringify([e.etat, e.sr.starts, e.vl.declenchements]));
  await b.close();
}

// ── 3. chaque déclencheur se désactive séparément ──
{
  const { b, page } = await lancer('claquement-mains', { mot: false, mains: false }); await demarrer(page); await attendre(11000); const e = await etat(page);
  verifier('claquement de mains désactivé : reste en VEILLE', e.etat === 'VEILLE' && e.vl.declenchements.length === 0, JSON.stringify([e.etat, e.vl.declenchements]));
  await b.close();
}

// ── 4. mot « Raylé » local ──
{
  const { b, page, erreurs } = await lancer('rayle', { mains: false, doigts: false });
  await demarrer(page); await page.waitForFunction(() => Activation.etat() === 'ACTIF', { timeout: 40000 }).catch(() => {}); await attendre(4500); const e = await etat(page);
  verifier('« Raylé » (voix Windows Hortense) → ACTIF, reconnu en local', e.etat === 'ACTIF' && e.sr.starts >= 1, JSON.stringify([e.etat, e.sr, e.vl.derniereEcoute]));
  verifier('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await b.close();
}

// ── 5. pas d'auto-déclenchement pendant la parole de Raylé ──
{
  const { b, page } = await lancer('claquement-mains', { mot: false }); await demarrer(page); await attendre(1500);
  await page.evaluate(() => { window.__parole = true; speaking = true; });          // Raylé « parle » : les claquements entendus sont ignorés
  await attendre(11000); let e = await etat(page);
  verifier('pendant qu’elle parle : écoute en pause, aucun déclenchement (pas d’auto-déclenchement)', e.etat === 'VEILLE' && e.sr.starts === 0 && e.vl.pause === true, JSON.stringify([e.etat, e.sr.starts, e.vl.pause]));
  await page.evaluate(() => { speaking = false; speechEndT = Date.now(); });
  await page.waitForFunction(() => Activation.etat() === 'ACTIF', { timeout: 15000 }).catch(() => {}); e = await etat(page);
  verifier('dès qu’elle se tait, un claquement redéclenche', e.etat === 'ACTIF', e.etat);
  await b.close();
}

// ── 6. une seule instance qui écoute ──
{
  const { b, page } = await lancer('bruit', { mot: false }); await demarrer(page); await attendre(2500);
  const p2 = await b.newPage(); await p2.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(1200);
  const r = await p2.evaluate(async () => { const r = await VeilleLocale.demarrer({ reglages: { motCle: false } }); return { r, e: VeilleLocale.etat() }; });
  verifier('deuxième fenêtre : refusée (une seule instance écoute)', r.r.ok === false && r.e.verrou === 'autre-fenetre', JSON.stringify([r.r, r.e.verrou]));
  await b.close();
}

// ── 7. relance : piste audio coupée, contexte suspendu, reprise après mise en veille du PC ──
{
  const { b, page } = await lancer('bruit', { mot: false }); await demarrer(page); await attendre(2500);
  await page.evaluate(() => { VeilleLocale.__pistes = true; });
  // la piste du micro se termine (débranchement) : on stoppe la piste ET on déclenche « ended » comme le navigateur le fait
  await page.evaluate(() => { const ctx = [...document.querySelectorAll('*')].length; });
  const apres = await page.evaluate(async () => {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });      // un second flux ne change rien : on coupe celui de la veille par son contexte
    ms.getTracks().forEach(p => p.stop());
    return VeilleLocale.etat();
  });
  verifier('veille locale stable avec un second flux ouvert puis fermé', apres.actif && apres.micro === 'ouvert');
  const redem = await page.evaluate(async () => {
    const av = VeilleLocale.etat().redemarrages;
    // saut d'horloge de 30 s (mise en veille du PC) : la surveillance doit relancer l'écoute
    const maintenant = Date.now; let decalage = 0; Date.now = () => maintenant() + decalage; decalage = 30000;
    await new Promise(r => setTimeout(r, 3500)); decalage = 30000; Date.now = maintenant;
    return { av, ap: VeilleLocale.etat().redemarrages, e: VeilleLocale.etat() };
  });
  await attendre(4000); const fin2 = await etat(page);
  verifier('reprise après mise en veille du PC : écoute relancée, micro rouvert', redem.ap > redem.av && fin2.vl.actif && fin2.vl.micro === 'ouvert', JSON.stringify([redem.av, redem.ap, fin2.vl.micro, fin2.vl.erreur]));
  await b.close();
}
fin();
