// Captures B2 : planches de contact de l'ouverture d'une fenêtre (cadre tracé, fond déployé, texte écrit), de sa fermeture (particules), des objets en orbite et de l'objet au premier plan.
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const attendre = ms => new Promise(r => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_entite_qualite', '0'); localStorage.setItem('rayle_boot', '0'); });
await p.goto('http://127.0.0.1:8000/index.html?anim=1', { waitUntil: 'load' }); await attendre(4000);
await p.evaluate(() => { Panneaux.fermerTout(); Entite.verrou(false); Entite.verrou = () => {}; });
const planche = (imgs, cols, t, fichier) => { const lignes = Math.ceil(imgs.length / cols), W = imgs[0].width, H = imgs[0].height, tw = Math.round(W * t / H * 1) , th = t; const sh = new PNG({ width: tw * cols, height: th * lignes });
  imgs.forEach((img, k) => { const ox = (k % cols) * tw, oy = Math.floor(k / cols) * th; for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const s = (Math.floor(y * H / th) * W + Math.floor(x * W / tw)) * 4, d = ((oy + y) * sh.width + ox + x) * 4; sh.data[d] = img.data[s]; sh.data[d + 1] = img.data[s + 1]; sh.data[d + 2] = img.data[s + 2]; sh.data[d + 3] = 255; } });
  fs.writeFileSync(fichier, PNG.sync.write(sh)); };
const lire = async clip => PNG.sync.read(Buffer.from(await p.screenshot({ clip })));
// ouverture : 8 images
const clipF = { x: 0, y: 130, width: 420, height: 330 };
await p.evaluate(() => { Panneaux.ouvrir({ id: 'e', titre: 'Réponse de Raylé', corps: { html: '<ul class="rep-pts"><li>Le Nasdaq progresse de zéro virgule deux pour cent ce matin.</li><li>Le dollar reste stable face à l\'euro.</li><li>Les annonces arrivent à quatorze heures trente.</li></ul>' }, duree: 60000 }); });
const ouv = []; for (const ms of [60, 140, 150, 160, 200, 250, 350]) { await attendre(ms); ouv.push(await lire(clipF)); }
planche(ouv, 4, 330, '../captures-accueil/b2-ouverture.png');
await attendre(1500);
// fermeture : particules
await p.evaluate(() => Panneaux.fermer('e')); const fer = []; for (const ms of [30, 90, 110, 130, 150, 190]) { await attendre(ms); fer.push(await lire(clipF)); }
planche(fer, 3, 330, '../captures-accueil/b2-fermeture.png');
await attendre(1500);
// objets en orbite : 3 images à 1,5 s d'intervalle, puis l'objet demandé au premier plan
const clipO = { x: 330, y: 20, width: 940, height: 640 }; const orb = [];
for (let k = 0; k < 3; k++) { orb.push(await lire(clipO)); await attendre(1500); }
await p.evaluate(() => { addLine('user', "C'est quoi l'ADN ?"); }); await attendre(1800); orb.push(await lire(clipO));
await p.evaluate(() => { addLine('user', 'montre-moi la carte du monde'); }); await attendre(1800); orb.push(await lire(clipO));
await p.evaluate(() => { addLine('user', 'le niveau de la batterie'); }); await attendre(1800); orb.push(await lire(clipO));
planche(orb, 3, 330, '../captures-accueil/b2-orbite.png');
console.log('ok');
await b.close();
