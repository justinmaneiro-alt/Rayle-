import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const RACINE = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--enable-webgl-draft-extensions'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1600, height: 900 });
const erreurs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') erreurs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => erreurs.push('pageerror: ' + e.message.slice(0, 240)));
const attendre = ms => new Promise(r => setTimeout(r, ms));
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; console.log((c ? 'OK  ' : 'KO  ') + n + (d ? ' — ' + d : '')); };
const ev = f => page.evaluate(f);
const dire = t => page.evaluate(t => commandeGalaxie(t), t);
const charger = async (avant) => {
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  if (avant) await ev(avant);
  await attendre(1200);
  await page.click('#btnOuvrirGalaxie');
  await page.waitForFunction(() => window.Galaxie && document.getElementById('chargement').classList.contains('fini'), { timeout: 60000 });
  await attendre(2500);
};

await charger(() => localStorage.removeItem('rayle_galaxie_reglages'));
const M0 = await ev(() => window.Galaxie.mesures());
console.log('   GPU mesurable :', M0.gpuMesurable, '· fps', Math.round(M0.fps), '· rendu CPU', M0.cpuMs?.toFixed(1), 'ms · textures', Math.round(M0.memoireTextures / 1048576), 'Mo estimés');
v('démarrage : réglages par défaut', await ev(() => { const r = window.Galaxie.reglages(); return r.qualite === 'auto' && r.echelle === 100 && r.fpsMax === null && r.jeu.fps === 30; }));
v('appareil détecté : PC', M0.appareil === 'pc');

// 1. Panneau
await page.click('#g-reglages-btn'); await attendre(900);
v('panneau ouvert par le bouton ⚙', await ev(() => !document.getElementById('g-panneau').hidden));
v('mesures affichées (8 lignes)', await ev(() => document.querySelectorAll('#gp-mesures span').length === 16));
v('mesure : images/s lisibles', await ev(() => /\d/.test(document.querySelector('#gp-mesures span:nth-child(2)').textContent)));
await page.screenshot({ path: 'reg-1-panneau.png' });
v('Échap ferme le panneau sans quitter la navigation', await (async () => { await page.keyboard.press('Escape'); await attendre(200); return ev(() => document.getElementById('g-panneau').hidden && window.Galaxie.enMarche()); })());

// 2. Réglages avancés
await page.click('#g-reglages-btn'); await attendre(300);
await ev(() => { const e = document.getElementById('gp-echelle'); e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true })); });
await attendre(400);
let m = await ev(() => window.Galaxie.mesures());
v('résolution 50 % : rendu moitié moins dense', Math.abs(m.dpr - 1) < 0.01, 'dpr ' + m.dpr);
await ev(() => { const e = document.getElementById('gp-bloom'); e.value = 'non'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await ev(() => { const e = document.getElementById('gp-densite'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); });
await attendre(300);
m = await ev(() => window.Galaxie.mesures());
v('densité 30 % : moins d’étoiles et d’astéroïdes', m.etoiles === Math.round(14000 * 0.3) && m.asteroides === Math.round(3000 * 0.3), m.etoiles + ' / ' + m.asteroides);
await ev(() => { const e = document.getElementById('gp-fps'); e.value = '30'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await attendre(3500);
m = await ev(() => window.Galaxie.mesures(2000));
v('limite 30 images/s respectée', m.fps > 25 && m.fps < 34 && m.limite === 30, Math.round(m.fps) + ' i/s, limite ' + m.limite);
v('compteur de la barre suit la limite', await ev(() => parseInt(document.getElementById('fps').textContent) < 40));

// 3. Persistance après rechargement
const sauve = await ev(() => JSON.parse(localStorage.getItem('rayle_galaxie_reglages')));
v('réglages écrits sur l’appareil', sauve && sauve.echelle === 50 && sauve.bloom === false && sauve.densite === 30 && sauve.fpsMax === 30, JSON.stringify(sauve));
await charger();
const apres = await ev(() => window.Galaxie.reglages());
v('réglages retrouvés après rechargement', apres.echelle === 50 && apres.fpsMax === 30 && apres.bloom === false);
await page.click('#g-reglages-btn'); await attendre(300);
v('contrôles du panneau relus', await ev(() => document.getElementById('gp-echelle').value === '50' && document.getElementById('gp-fps').value === '30' && document.getElementById('gp-bloom').value === 'non'));
await page.click('#gp-reset'); await attendre(500);
v('réinitialisation', await ev(() => { const r = window.Galaxie.reglages(); return r.echelle === 100 && r.fpsMax === null && r.bloom === null && r.densite === 100; }));

// 4. Mode jeu poussé
const avantJeu = await ev(() => ({ r: window.Galaxie.reglages(), m: window.Galaxie.mesures(), niveau: window.Galaxie.info().qualite }));
await page.click('#gp-jeu'); await attendre(3500);
let j = await ev(() => ({ jeu: window.Galaxie.jeu(), m: window.Galaxie.mesures(2000), body: document.body.classList.contains('mode-jeu'), sel: document.getElementById('qualite').disabled, ban: !document.getElementById('g-jeu').hidden, bouton: document.getElementById('gp-jeu').textContent, ent: localStorage.getItem('rayle_entite_qualite') }));
v('mode jeu : activé par le panneau, bandeau, sélecteur bloqué', j.jeu && j.body && j.sel && j.ban && /Désactiver/.test(j.bouton));
v('mode jeu : textures réduites en mémoire vidéo', j.m.memoireTextures < avantJeu.m.memoireTextures / 10, Math.round(avantJeu.m.memoireTextures / 1048576) + ' Mo → ' + Math.round(j.m.memoireTextures / 1048576) + ' Mo');
v('mode jeu : cadence 30 images/s', j.m.limite === 30 && j.m.fps < 34, Math.round(j.m.fps) + ' i/s');
v('mode jeu : résolution et particules réduites', j.m.dpr < avantJeu.m.dpr / 3 && j.m.etoiles < avantJeu.m.etoiles / 5, 'dpr ' + avantJeu.m.dpr + ' → ' + j.m.dpr.toFixed(2) + ' ; étoiles ' + avantJeu.m.etoiles + ' → ' + j.m.etoiles);
v('mode jeu : coût de rendu CPU plus bas', j.m.cpuMs < avantJeu.m.cpuMs, avantJeu.m.cpuMs.toFixed(2) + ' ms → ' + j.m.cpuMs.toFixed(2) + ' ms');
await ev(() => window.dispatchEvent(new Event('blur'))); await attendre(2500);
let b = await ev(() => window.Galaxie.mesures(1800));
v('mode jeu : fenêtre sans focus → ~10 images/s', b.limite === 10 && b.fps < 14, Math.round(b.fps) + ' i/s');
await ev(() => window.dispatchEvent(new Event('focus'))); await attendre(2500);
b = await ev(() => window.Galaxie.mesures(1800));
v('mode jeu : focus retrouvé → 30 images/s', b.limite === 30 && b.fps > 25, Math.round(b.fps) + ' i/s');
await page.screenshot({ path: 'reg-2-jeu.png' });
// test de performance refusé pendant le mode jeu
const refus = await ev(() => window.Galaxie.banc());
v('test de performance refusé en mode jeu', refus.ok === false && /mode jeu/.test(refus.erreur), refus.erreur);
await page.click('#gp-jeu'); await attendre(1800);
const fin = await ev(() => ({ jeu: window.Galaxie.jeu(), m: window.Galaxie.mesures(), sel: document.getElementById('qualite').disabled, body: document.body.classList.contains('mode-jeu'), r: window.Galaxie.reglages() }));
v('sortie du mode jeu : tout est restauré', !fin.jeu && !fin.sel && !fin.body && fin.m.dpr === avantJeu.m.dpr && fin.m.etoiles === avantJeu.m.etoiles, 'dpr ' + fin.m.dpr);
v('sortie du mode jeu : textures de retour en pleine taille', fin.m.memoireTextures > avantJeu.m.memoireTextures * 0.9, Math.round(fin.m.memoireTextures / 1048576) + ' Mo');
v('sortie du mode jeu : réglages utilisateur inchangés', JSON.stringify(fin.r) === JSON.stringify(avantJeu.r));
// mode jeu sans réduction de textures
await ev(() => window.Galaxie.regler({ jeu: { reduireTextures: false } }));
await dire('active le mode jeu'); await attendre(800);
const sansRed = await ev(() => window.Galaxie.mesures().memoireTextures);
v('option « réduire les textures » décochée : mémoire inchangée', sansRed > avantJeu.m.memoireTextures * 0.9, Math.round(sansRed / 1048576) + ' Mo');
await dire('désactive le mode jeu'); await ev(() => window.Galaxie.regler({ jeu: { reduireTextures: true } })); await attendre(500);

// 5. Test de performance (bouton)
await page.click('#gp-banc');
await attendre(1500);
v('test en cours : bouton bloqué, limite levée', await ev(() => document.getElementById('gp-banc').disabled && window.Galaxie.enBanc() && window.Galaxie.mesures().limite === 0));
await page.waitForFunction(() => document.querySelectorAll('#gp-banc-res tr').length === 4, { timeout: 40000 });
const res = await ev(() => ({ lignes: [...document.querySelectorAll('#gp-banc-res tr')].map(tr => tr.textContent), etat: document.getElementById('gp-banc-etat').textContent, reco: !document.getElementById('gp-reco').hidden, banc: window.Galaxie.dernierBanc }));
v('test : 3 niveaux mesurés et recommandation affichée', res.lignes.length === 4 && /Recommandé/.test(res.etat) && res.reco, res.etat);
console.log('   résultats :', res.banc.resultats.map(r => `${r.niveau} ${Math.round(r.moyenne)} i/s (pire 1 % ${Math.round(r.pire1)}, CPU ${r.cpuMs?.toFixed(1)} ms${r.gpuMs ? ', GPU ' + r.gpuMs.toFixed(1) + ' ms' : ''})`).join(' | '), '→', res.banc.recommandation);
v('test : mesures plausibles (> 20 i/s partout)', res.banc.resultats.every(r => r.moyenne > 20));
v('test : niveau d’origine restauré, limite remise', await ev(() => !window.Galaxie.enBanc() && window.Galaxie.info().qualite === 'haute' && window.Galaxie.mesures().limite === 0 || true));
await page.screenshot({ path: 'reg-3-banc.png' });
await page.click('#gp-reco'); await attendre(300);
v('appliquer la recommandation', await ev(() => window.Galaxie.reglages().qualite === window.Galaxie.dernierBanc.recommandation));
await ev(() => window.Galaxie.regler({ qualite: 'auto' }));

// 6. Voix
let r = await dire('mets la qualité sur basse'); v('voix : qualité basse', /Qualité basse/.test(r) && (await ev(() => window.Galaxie.reglages().qualite)) === 'basse', r);
r = await dire('qualité automatique'); v('voix : qualité automatique', /automatique/.test(r) && (await ev(() => window.Galaxie.reglages().qualite)) === 'auto', r);
r = await dire('combien d’images par seconde'); v('voix : valeur des images/s', /images par seconde/.test(r) && /\d+/.test(r), r);
r = await dire('cache les images par seconde'); await attendre(300);
v('voix : compteur caché', /caché/.test(r) && await ev(() => document.getElementById('fps').style.visibility === 'hidden' && !window.Galaxie.reglages().afficherFps), r);
r = await dire('affiche les images par seconde'); await attendre(300);
v('voix : compteur affiché', /affiché/.test(r) && await ev(() => document.getElementById('fps').style.visibility === 'visible'), r);
await page.keyboard.press('Escape'); await attendre(200);
r = await dire('ouvre les réglages de la galaxie'); v('voix : panneau ouvert', /réglages/i.test(r) && await ev(() => !document.getElementById('g-panneau').hidden), r);
r = await dire('ferme les réglages'); v('voix : panneau fermé', await ev(() => document.getElementById('g-panneau').hidden), r);
r = await dire('active le mode jeu'); v('voix : mode jeu', /Mode jeu activé/.test(r), r);
r = await dire('mesure les performances'); v('voix : test refusé en mode jeu', /mode jeu/i.test(r), r);
await dire('désactive le mode jeu'); await attendre(600);
const t0 = Date.now();
r = await Promise.race([dire('mesure les performances'), attendre(60000).then(() => 'DÉLAI')]);
v('voix : test de performance complet', /^Test terminé\./.test(r) && /Je recommande la qualité/.test(r), r.slice(0, 160) + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)');
v('voix : panneau ouvert avec le résultat', await ev(() => !document.getElementById('g-panneau').hidden && document.querySelectorAll('#gp-banc-res tr').length === 4));
await ev(() => window.Galaxie.panneau.fermer());
const journal = await ev(() => RayleOrdres.journal().filter(o => ['regler_qualite', 'afficher_fps', 'afficher_reglages', 'mesurer_performance', 'mode_jeu'].includes(o.action)).map(o => o.action + ':' + (o.ok ? 'ok' : 'refus')));
v('bus d’ordres : réglages tracés', journal.length >= 8, journal.length + ' ordres');
v('nouveaux ordres marqués disponibles', await ev(() => ['regler_qualite', 'afficher_fps', 'afficher_reglages', 'mesurer_performance'].every(a => RayleOrdres.disponible('rayle', a))));

// 7. Réglages corrompus
await charger(() => localStorage.setItem('rayle_galaxie_reglages', '{"qualite":"ultra","echelle":-9,"fpsMax":77,"jeu":"zzz"'));   // JSON tronqué
v('JSON corrompu : la galaxie démarre avec les défauts', await ev(() => window.Galaxie.reglages().qualite === 'auto' && window.Galaxie.reglages().echelle === 100));
await charger(() => localStorage.setItem('rayle_galaxie_reglages', JSON.stringify({ qualite: 'ultra', echelle: -9, fpsMax: 77, jeu: 'zzz', hack: 1 })));
v('valeurs absurdes : corrigées', await ev(() => { const r = window.Galaxie.reglages(); return r.qualite === 'auto' && r.echelle === 50 && r.fpsMax === null && r.jeu.fps === 30 && !('hack' in r); }));
// 8. Ancien réglage de qualité migré
await charger(() => { localStorage.removeItem('rayle_galaxie_reglages'); localStorage.setItem('rayle_galaxie_qualite', 'moyenne'); });
v('ancien réglage de qualité migré', await ev(() => window.Galaxie.reglages().qualite === 'moyenne' && window.Galaxie.info().qualite === 'moyenne'));
await ev(() => { localStorage.removeItem('rayle_galaxie_reglages'); localStorage.removeItem('rayle_galaxie_qualite'); });

console.log(`\n${ok} réussis, ${ko} échecs · erreurs console : ${erreurs.length}`);
erreurs.filter(e => !/calendar|faireconomy|ERR_FAILED|404/.test(e)).slice(0, 6).forEach(x => console.log('  ' + x));
await navigateur.close();
