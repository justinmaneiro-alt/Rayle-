// V7b : tests par APPAREIL (Galaxy S23 Ultra émulé, tablette, PC). Faux Worker (actualités). Lancer : node tests-navigateur/v7b-appareils-test.mjs   (serveur : node serveur.mjs)
import fs from 'node:fs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';
import { ouvrirAppareil, galaxieChargee, dire, panneaux, vueCourante, attendre, ko as fmtKo } from './v7b-aide.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + String(d).replace(/\s+/g, ' ').slice(0, 220) : '')); };
const BRUIT = /calendar|faireconomy|ERR_FAILED|404|502|Failed to load resource|CORS/;
const worker = await demarrerFauxWorker(8795);
const storage = { rayle_worker_url: 'http://127.0.0.1:8795', rayle_worker_token: 'test' };
fs.mkdirSync('docs/captures-v7b', { recursive: true });

for (const cle of ['telephone', 'tablette']) {
  console.log('\n── ' + cle + ' ──');
  const o = await ouvrirAppareil(cle, { storage });
  const { page } = o;
  const info = await page.evaluate(() => ({ mode: RayleAppareil.mode(), html: document.documentElement.dataset.appareil, g1: document.body.classList.contains('g1'), jarvis: document.body.classList.contains('jarvis'), galBtn: getComputedStyle(document.getElementById('btnOuvrirGalaxie')).display, carte: !!document.getElementById('btnCarteTerre'), choix: !!document.getElementById('appareilChoix'), bus: RayleBus.etat('appareil'), tw: document.documentElement.scrollWidth, iw: innerWidth }));
  v('mode ' + cle + ' détecté (appareil émulé, pas la taille de fenêtre)', info.mode === cle && info.html === cle && info.bus && info.bus.mode === cle, JSON.stringify(info.bus));
  v('thème Jarvis (jamais Aurore), accueil prêt', info.jarvis && !info.g1);
  v('le bouton Galaxie n’existe pas à l’écran ; « Carte » prend sa place', info.galBtn === 'none' && info.carte);
  v('aucun réglage ne permet d’activer Galaxie (pas de sélecteur « Appareil »)', !info.choix);
  v('aucune barre de défilement horizontale', info.tw <= info.iw + 1, info.tw + ' / ' + info.iw);
  v('démarrage : aucun fichier lourd de Galaxie chargé (3D, textures, planètes, three.js)', galaxieChargee(o.requetes).length === 0, galaxieChargee(o.requetes).map(r => r.url).join(', '));
  v('démarrage : le moteur de l’accueil Aurore n’est pas chargé non plus', !o.requetes.some(r => /g1-accueil|graphique-bougies|galaxie\.css/.test(r.url)), o.requetes.filter(r => /g1-accueil|graphique-bougies|galaxie\.css/.test(r.url)).map(r => r.url).join(','));
  console.log('   poids : ' + o.requetes.length + ' fichiers, ' + fmtKo(o.octets.total) + ', chargé en ' + o.chargeMs + ' ms');
  await page.evaluate(() => { Entite.verrou && Entite.verrou(false); });
  // galaxie demandée : refus poli, on reste dans Jarvis
  for (const phrase of ['ouvre la galaxie', 'active le mode galaxie', 'va sur Mars']) {
    const dit = await dire(page, phrase, 1500);
    v('« ' + phrase + ' » → refus poli, on reste sur Jarvis', /réservé au PC/.test(dit) && /Jarvis/.test(dit) && (await vueCourante(page)) === 'rayle', dit);
  }
  await page.evaluate(() => RayleBus.demander('vue:ouvrir', 'galaxie')).catch(() => {});
  await attendre(400);
  v('…même par un appel direct du code : la galaxie ne s’ouvre pas', (await vueCourante(page)) === 'rayle' && galaxieChargee(o.requetes).length === 0);
  // actualités
  const dA = await dire(page, 'Donne-moi l’actualité en France', 2600);
  const pA = await panneaux(page);
  v('« l’actualité en France » ouvre une fenêtre d’actualités dans Jarvis', pA.some(id => /actu|ac-|france/i.test(id)) && (await vueCourante(page)) === 'rayle', pA.join(',') + ' | ' + dA);
  const largeurFen = await page.evaluate(() => { const e = document.querySelector('#panneaux .pn:not(.hud-out)'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, iw: innerWidth }; });
  v('la fenêtre tient dans l’écran (pas de débordement)', largeurFen && largeurFen.x >= -1 && largeurFen.x + largeurFen.w <= largeurFen.iw + 1, JSON.stringify(largeurFen));
  await page.screenshot({ path: 'docs/captures-v7b/' + cle + '-actualites.png' });
  await page.evaluate(() => Panneaux.fermerTout());
  // terminal
  const dT = await dire(page, 'Affiche le terminal', 2500);
  v('« affiche le terminal » ouvre le terminal dans Jarvis', (await vueCourante(page)) === 'terminal', dT);
  const tw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, vis: !document.getElementById('vueTerminal').hidden }));
  v('le terminal est visible et ne dépasse pas la largeur', tw.vis && tw.sw <= tw.iw + 1, JSON.stringify(tw));
  await page.screenshot({ path: 'docs/captures-v7b/' + cle + '-terminal.png' });
  await page.evaluate(() => RayleBus.demander('vue:fermer')); await attendre(600);
  v('retour à Jarvis', (await vueCourante(page)) === 'rayle');
  // agent Kepler : positions du jour
  const dK = await dire(page, 'Ouvre l’agent', 3500);
  const pK = await page.evaluate(() => ({ ouvert: !!document.querySelector('.pn[data-id*="agent"]'), onglets: Array.from(document.querySelectorAll('[data-av3-vue]')).map(b => b.dataset.av3Vue), sw: document.documentElement.scrollWidth, iw: innerWidth }));
  v('« ouvre l’agent » : la fenêtre Kepler s’ouvre avec les onglets Positions du jour, Bilan, Pourquoi pas plus', pK.ouvert && ['positions', 'bilan', 'pourquoi', 'exemples', 'reglages_pos'].every(x => pK.onglets.includes(x)), JSON.stringify(pK) + dK);
  await page.evaluate(() => { const b = document.querySelector('[data-av3-vue="positions"]'); if (b) b.click(); }); await attendre(1500);
  const tpos = await page.evaluate(() => ({ texte: (document.querySelector('.av4') || {}).innerText || '', sw: document.documentElement.scrollWidth, iw: innerWidth }));
  v('l’onglet « Positions du jour » répond honnêtement (service du PC absent : message clair, pas de chiffre inventé)', /Positions du jour|service du PC|pas encore calcul/i.test(tpos.texte), tpos.texte.slice(0, 120));
  v('…sans débordement horizontal', tpos.sw <= tpos.iw + 1, tpos.sw + '/' + tpos.iw);
  await page.screenshot({ path: 'docs/captures-v7b/' + cle + '-agent.png' });
  await page.evaluate(() => Panneaux.fermerTout());
  // carte de la Terre (sans galaxie)
  await page.evaluate(() => document.getElementById('btnCarteTerre').click()); await attendre(3500);
  const carte = await page.evaluate(() => ({ ouvert: window.HoteModules && HoteModules.ouvert(), ui: !!document.querySelector('#terre-leger:not([hidden])'), retour: (document.querySelector('.tl-retour') || {}).textContent }));
  v('la carte légère de la Terre s’ouvre SANS galaxie (hôte mobile)', carte.ouvert && carte.ui && /Retour/.test(carte.retour || ''), JSON.stringify(carte));
  v('…et ne charge aucun fichier lourd de Galaxie ni three.js', galaxieChargee(o.requetes).length === 0, galaxieChargee(o.requetes).map(r => r.url).join(', '));
  await page.screenshot({ path: 'docs/captures-v7b/' + cle + '-carte.png' });
  await page.evaluate(() => HoteModules.fermer()); await attendre(500);
  v('fermer la carte ramène à Jarvis', !(await page.evaluate(() => HoteModules.ouvert())));
  // cibles tactiles
  const petits = await page.evaluate(() => Array.from(document.querySelectorAll('button.gros')).filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map(b => b.id || b.textContent.trim()));
  v('boutons principaux ≥ 44 px', petits.length === 0, petits.join(','));
  v('aucune erreur de page', o.erreurs.filter(e => !BRUIT.test(e)).length === 0, o.erreurs.filter(e => !BRUIT.test(e)).slice(0, 3).join(' | '));
  await o.navigateur.close();
}

// paysage téléphone
{
  const o = await ouvrirAppareil('telephone', { storage, paysage: true });
  const r = await o.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, mode: RayleAppareil.mode() }));
  v('téléphone en paysage : toujours le mode téléphone, sans défilement horizontal', r.mode === 'telephone' && r.sw <= r.iw + 1 && r.iw > r.ih, JSON.stringify(r));
  await o.page.screenshot({ path: 'docs/captures-v7b/telephone-paysage.png' });
  await o.navigateur.close();
}

// PC : tout comme avant, Galaxie disponible ; les paramètres de développement
console.log('\n── pc ──');
{
  const o = await ouvrirAppareil('pc', { storage, storage: { ...storage, rayle_theme: 'jarvis' } });
  const i = await o.page.evaluate(() => ({ mode: RayleAppareil.mode(), gal: getComputedStyle(document.getElementById('btnOuvrirGalaxie')).display, carte: !!document.getElementById('btnCarteTerre'), choix: !!document.getElementById('appareilChoix'), css: !!document.querySelector('link[href*="galaxie.css"]'), g1js: !!window.G1 }));
  v('PC : mode pc, bouton Galaxie visible, pas de bouton Carte, moteur Aurore chargé, réglage « Appareil » proposé', i.mode === 'pc' && i.gal !== 'none' && !i.carte && i.css && i.g1js && i.choix, JSON.stringify(i));
  await o.page.evaluate(() => document.getElementById('btnOuvrirGalaxie').click());
  await o.page.waitForFunction(() => document.getElementById('chargement')?.classList.contains('fini'), { timeout: 90000 }).catch(() => {});
  v('PC : la Galaxie s’ouvre toujours', (await vueCourante(o.page)) === 'galaxie');
  v('PC : les fichiers de Galaxie sont chargés', galaxieChargee(o.requetes).length > 5);
  await o.navigateur.close();
  const d1 = await ouvrirAppareil('pc', { url: '/index.html?appareil=telephone', attente: 1500 });
  const m1 = await d1.page.evaluate(() => ({ mode: RayleAppareil.mode(), source: RayleAppareil.source() }));
  v('paramètre de développement ?appareil=telephone sur un PC : mode téléphone, Galaxie refusée', m1.mode === 'telephone' && m1.source === 'url');
  await d1.navigateur.close();
  const d2 = await ouvrirAppareil('telephone', { url: '/index.html?appareil=pc', attente: 1500 });
  v('?appareil=pc sur un téléphone émulé : mode pc (test)', (await d2.page.evaluate(() => RayleAppareil.mode())) === 'pc');
  await d2.navigateur.close();
}
worker.close && worker.close();
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
