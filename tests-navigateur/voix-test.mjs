import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(m.text().slice(0, 220)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const ev = f => page.evaluate(f);
const dire = t => page.evaluate(t => commandeGalaxie(t), t);   // commandeGalaxie est une fonction globale de la page
const nav = () => ev(() => window.Galaxie ? window.Galaxie.nav.etat() : null);
const vue = () => ev(() => RayleBus.demander('vue'));
await attendre(1500);

v('au démarrage : vue Raylé, galaxie cachée', (await vue()) === 'rayle' && await ev(() => document.getElementById('vueGalaxie').hidden));
v('bouton Galaxie présent', await ev(() => !!document.getElementById('btnOuvrirGalaxie')));

// 1. Ouverture par le bouton
await page.click('#btnOuvrirGalaxie'); await attendre(3500);
v('bouton : la vue galaxie s’ouvre', (await vue()) === 'galaxie' && await ev(() => !document.getElementById('vueGalaxie').hidden));
v('adresse #galaxie', await ev(() => location.hash === '#galaxie'));
v('scène en marche', await ev(() => window.Galaxie && window.Galaxie.enMarche()));
v('8 planètes chargées', (await ev(() => window.Galaxie.info())).planetes.length === 8);
await page.screenshot({ path: 'vox-1-galaxie.png' });

// 2. Voix : aller sur Mars
let r = await dire('va sur Mars');
v('« va sur Mars » → phrase', r === 'Cap sur Mars.', r);
await attendre(3300);
let e = await nav();
v('vol terminé : focus Mars, sas ouvert', e.focus === 'mars' && e.sas === true, JSON.stringify(e));
v('le sas montre ● pour les ordres branchés ? (Mars : aucun branché)', (await ev(() => [...document.querySelectorAll('#sas-ordres li')].every(li => li.textContent.startsWith('○')))));
await page.screenshot({ path: 'vox-2-mars.png' });

// 3. Retour par étapes
r = await dire('retour');
v('« retour » sur une planète → vue d’ensemble', r === 'Retour à la vue d’ensemble.', r);
await attendre(3000); e = await nav();
v('de retour à la vue d’ensemble', e.focus === null && e.distance > 70, e.distance.toFixed(0));
r = await dire('retour');
v('« retour » dans la vue d’ensemble → quitte la galaxie', r === 'Retour à Raylé.' && (await vue()) === 'rayle', r);
await attendre(400);
v('la scène ne dessine plus (économie du PC)', await ev(() => !window.Galaxie.enMarche()));
v('adresse nettoyée', await ev(() => location.hash === ''));

// 4. Aller quelque part depuis l’écran principal : ouvre la galaxie toute seule
r = await dire('emmène-moi sur Saturne');
v('« emmène-moi sur Saturne » depuis Raylé', r === 'Cap sur Saturne.' && (await vue()) === 'galaxie', r);
await attendre(3300);
v('arrivé sur Saturne', (await nav()).focus === 'saturne');
r = await dire('montre-moi le vaisseau du capitaine');
v('vaisseau par alias', r === 'Cap sur le vaisseau du capitaine (code).', r);
await attendre(3300);
v('arrivé sur le vaisseau', (await nav()).focus === 'arcadia');
r = await dire('va sur Uranus'); v('planète en attente : phrase adaptée', r === 'Cap sur Uranus. Elle attend encore d’être programmée.', r);
await attendre(3000);
r = await dire('retour à la galaxie'); v('« retour à la galaxie » (ouverte)', r === 'Retour à la vue d’ensemble.', r);
await attendre(3000);

// 5. Ordres du bus
const journal = await ev(() => RayleOrdres.journal());
v('journal du bus : aller_a enregistrés', journal.filter(o => o.action === 'aller_a' && o.ok).length >= 4, journal.length + ' ordres');
v('ordres « rayle » marqués disponibles', await ev(() => RayleOrdres.disponible('rayle', 'aller_a') && RayleOrdres.disponible('rayle', 'retour') && RayleOrdres.disponible('rayle', 'mode_jeu') && !RayleOrdres.disponible('mars', 'changer_actif')));
const refus = await ev(() => RayleOrdres.envoyer({ vers: 'mars', action: 'changer_actif', params: { actif: 'XAU' } }));
v('ordre prévu pour Mars : refus propre', refus.ok === false && /prévu/.test(refus.erreur), refus.erreur);
const refus2 = await ev(() => RayleOrdres.envoyer({ vers: 'rayle', action: 'aller_a', params: { cible: 'pluton' } }));
v('cible inconnue : refus propre', refus2.ok === false && /connais/.test(refus2.erreur), refus2.erreur);

// 6. Le soleil suit l’état de Raylé
const soleilEtat = () => ev(() => window.Galaxie.soleil.nomEtat);
for (const [s, attendu] of [['listening', 'listening'], ['thinking', 'thinking'], ['speaking', 'speaking'], ['idle', 'idle']]) {
  await ev(`setState('${s}')`); await attendre(120);
  v('soleil : état ' + s, (await soleilEtat()) === attendu, await soleilEtat());
}
await ev(() => RayleBus.emit('raylé:alerte', { ms: 700 })); await attendre(150);
v('soleil : alerte', (await soleilEtat()) === 'alerte');
await attendre(900);
v('soleil : retour à l’état normal après l’alerte', (await soleilEtat()) === 'idle', await soleilEtat());
await ev(() => setState('speaking')); await ev(() => addLine('ray', 'Bonjour, je suis là.')); await attendre(100);
v('sous-titre de la galaxie', await ev(() => document.getElementById('g-dit').textContent.includes('Bonjour') && document.getElementById('g-etat').textContent.length > 0));
await ev(() => setState('idle'));

// 7. Mode jeu
r = await dire('active le mode jeu');
v('mode jeu : phrase', /Mode jeu activé/.test(r), r);
await attendre(500);
v('mode jeu : galaxie en qualité basse, sélecteur bloqué, bandeau', await ev(() => window.Galaxie.jeu() && document.getElementById('qualite-actuelle').textContent === 'mode jeu' && document.getElementById('qualite').disabled && !document.getElementById('g-jeu').hidden && document.body.classList.contains('mode-jeu')));
await attendre(2500);
const fpsJeu = await ev(() => window.Galaxie.mesures(1500).fps);
v('mode jeu : images/s plafonnées ~30', fpsJeu < 40, fpsJeu.toFixed(0) + ' i/s');
r = await dire('active le mode jeu'); v('mode jeu déjà actif : message', /déjà actif/.test(r), r);
r = await dire('désactive le mode jeu');
v('mode jeu : désactivation', /désactivé/.test(r), r);
await attendre(600);
v('mode jeu : tout est restauré', await ev(() => !window.Galaxie.jeu() && window.Galaxie.info().qualite === 'haute' && !document.getElementById('qualite').disabled && document.getElementById('g-jeu').hidden && !document.body.classList.contains('mode-jeu')));

// 8. Fermeture, touches, historique
r = await dire('ferme la galaxie'); v('« ferme la galaxie »', r === 'Retour à Raylé.' && (await vue()) === 'rayle', r);
await attendre(300);
const camAvant = await ev(() => window.Galaxie.camera.position.toArray());
await page.keyboard.press('h'); await page.keyboard.press('Escape'); await attendre(500);
const camApres = await ev(() => window.Galaxie.camera.position.toArray());
v('touches H et Échap sans effet quand la galaxie est fermée', JSON.stringify(camAvant) === JSON.stringify(camApres));
await dire('ouvre la galaxie'); await attendre(800);
v('« ouvre la galaxie »', (await vue()) === 'galaxie');
await ev(() => history.back()); await attendre(800);
v('bouton Précédent du navigateur : ferme la galaxie', (await vue()) === 'rayle');

// 9. Cohabitation avec le terminal
r = await ev(() => commandeTerminal('ouvre le terminal'));
v('« ouvre le terminal » toujours géré par le terminal', (await vue()) === 'terminal', String(r).slice(0, 60));
r = await dire('va sur Mars');
v('depuis le terminal : « va sur Mars » ouvre la galaxie', r === 'Cap sur Mars.' && (await vue()) === 'galaxie', r);
await attendre(3300);
r = await ev(() => commandeTerminal('ouvre le terminal')); await attendre(500);
v('puis retour au terminal', (await vue()) === 'terminal');
await ev(() => RayleBus.demander('vue:fermer')); await attendre(300);
v('retour à Raylé depuis le terminal', (await vue()) === 'rayle');

// 10. Phrases étrangères : aucune interférence
for (const t of ['quel est le prix de l’or', 'passe sur le bitcoin', 'bonjour Raylé', 'la terre est-elle ronde', 'mets M15']) {
  const x = await dire(t); v('ignorée par la galaxie : « ' + t + ' »', x === null, String(x));
}
// 11. Chemin complet respond() (voix de synthèse comprise)
const rep = await Promise.race([ev(async () => { await respond('va sur Jupiter'); return [...document.querySelectorAll('#log .line.ray')].pop()?.textContent || ''; }), attendre(20000).then(() => 'DÉLAI')]);
v('respond() complet : réponse affichée', /Cap sur Jupiter/.test(rep), rep.slice(0, 80));
await attendre(3200);
v('respond() : on est bien sur Jupiter', (await vue()) === 'galaxie' && (await nav()).focus === 'jupiter');
await page.screenshot({ path: 'vox-3-jupiter.png' });

console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.length}`);
erreurs.slice(0, 6).forEach(x => console.log('  ' + x));
await navigateur.close();
