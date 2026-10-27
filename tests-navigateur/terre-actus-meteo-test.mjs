import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';

/* Point B : actualités par pays, météo d'un lieu, radar de pluie, image du jour, nuages et pluie animés.
   Faux Worker (/actualites, /meteo) et fausses sources de tuiles/radar : déterministe, sans réseau. Captures dans captures-terre/. */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 160));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
const injecter = async p => {
  await p.evaluateOnNewDocument((inj, urlWorker) => {
    window.__RAYLE_TERRE_TEST__ = inj;
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test');
  }, faux.injection, worker.url);
};
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, a) => page.evaluate(f, a);
const ecran = f => G(f);
const ignorees = /faireconomy|404|408|502|ERR_FAILED|ERR_CONNECTION|Failed to load resource|favicon|INSUFFICIENT|route inconnue|non configuré/;
const exceptions = () => erreurs.filter(x => !ignorees.test(x) && /pageerror|TypeError|ReferenceError/.test(x)).length;
const fenetre = id => G(id => { const el = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return el ? { texte: el.innerText, html: el.innerHTML, liens: [...el.querySelectorAll('a')].map(a => ({ href: a.href, rel: a.rel, cible: a.target })), titre: el.querySelector('h2').textContent } : null; }, id);
const attendreFenetre = (id, contient) => page.waitForFunction((id, c) => { const el = document.querySelector('#panneaux .pn[data-id="' + id + '"]'); return !!el && !el.querySelector('.t-charge') && (!c || el.innerText.includes(c)); }, { timeout: 15000 }, id, contient).catch(() => {});

await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 1000 });

// ── 1. Repères de pays et actualités ──
await G(() => window.Terre.placer({ lon: 8, lat: 46, dist: 3800, cap: 0, incl: 0 }));
await attendre(1500);
let b = await G(() => window.Terre.etatB());
verifier('la liste des pays vient du Worker', b.pays >= 10 && worker.journal.some(j => j.chemin === '/actualites' && j.q.liste), `pays ${b.pays}`);
const pins = await G(() => window.Terre.marqueursEcran());
verifier('des repères de pays sont visibles sur le globe', pins.length >= 4 && pins.some(p => p.code === 'FR'), JSON.stringify(pins.map(p => p.code)));
const fr = pins.find(p => p.code === 'FR');
await page.mouse.move(fr.x, fr.y); await attendre(200);
verifier('survol d’un repère : curseur « main »', (await G(() => document.getElementById('scene3d').style.cursor)) === 'pointer');
await page.mouse.click(fr.x, fr.y);
await attendreFenetre('terre-actus', 'Titre d’essai'.replace('’', '\''));
let w = await fenetre('terre-actus');
verifier('un clic sur le repère de la France ouvre ses actualités', w && /Actualités · France/.test(w.titre) && /Titre d'essai numéro 1 pour France/.test(w.texte), w && w.titre);
verifier('chaque titre est un lien externe sûr (titre, média, date seulement)', w.liens.filter(l => /exemple\.test/.test(l.href)).length === 10 && w.liens.every(l => /noopener/.test(l.rel) && l.cible === '_blank'));
verifier('le média, le temps écoulé et les médias en panne sont indiqués', /Journal A/.test(w.texte) && /il y a \d+ min/.test(w.texte) && /Indisponibles : Journal C/.test(w.texte) && /Titres et liens seulement/.test(w.texte));
await attendre(2800);
b = await G(() => window.Terre.etatB());
const etat = await G(() => window.Terre.etat());
verifier('la caméra a volé jusqu’à la France et le repère est sélectionné', b.actusSel === 'FR' && Math.abs(etat.lat - 46.6) < 3 && Math.abs(etat.dist - 1500) < 300, JSON.stringify({ lat: etat.lat, dist: etat.dist }));
await attendreChargement(page, { calme: 1000 });
await page.screenshot({ path: '../captures-terre/b-actus-france.png' });

// ── 2. Pannes et Worker ancien / verrouillé ──
worker.scenario.actus = 'panne';
await G(() => window.Terre.actualites('JP', 'Japon')); await attendreFenetre('terre-actus', 'INDISPONIBLE');
w = await fenetre('terre-actus');
verifier('sources en panne : « Indisponible » et la raison, aucun titre inventé', /indisponible/i.test(w.texte) && /indisponibles/i.test(w.texte) && !/Titre d'essai/.test(w.texte), w.texte.slice(0, 120));
worker.scenario.actus = 'ancien';
await G(() => window.Terre.actualites('DE', 'Allemagne')); await attendreFenetre('terre-actus', 'INDISPONIBLE');
w = await fenetre('terre-actus');
verifier('Worker pas à jour : message clair', /pas à jour/.test(w.texte), w.texte.slice(0, 160));
worker.scenario.actus = 'vide';
await G(() => window.Terre.actualites('ES', 'Espagne')); await attendreFenetre('terre-actus', 'Aucun titre');
w = await fenetre('terre-actus');
verifier('aucun titre : le dit', /Aucun titre trouvé/.test(w.texte), w.texte.slice(0, 120));
worker.scenario.actus = 'ok';
const jeton = await G(() => { const t = localStorage.getItem('rayle_worker_token'); localStorage.setItem('rayle_worker_token', ''); return t; });
await G(() => window.Terre.actualites('IT', 'Italie')); await attendreFenetre('terre-actus', 'INDISPONIBLE');
w = await fenetre('terre-actus');
verifier('Worker verrouillé : le dit, sans appel réseau', /verrouillé/.test(w.texte), w.texte.slice(0, 120));
await G(t => localStorage.setItem('rayle_worker_token', t), jeton);
await G(() => window.Terre.actualites('MONDE', 'Monde')); await attendreFenetre('terre-actus', 'Titre d');
w = await fenetre('terre-actus');
verifier('« Monde » : à la une dans le monde', /À la une dans le monde/.test(w.titre), w.titre);

// ── 3. Météo d'un lieu ──
await G(() => window.Terre.placer({ lon: 2.2, lat: 43.6, dist: 700, cap: 0, incl: 0 }));
const r = await G(() => window.Terre.meteo(43.6047, 2.2399, 'Castres'));
await attendreFenetre('terre-meteo', 'Castres');
w = await fenetre('terre-meteo');
verifier('fenêtre météo : température, état du ciel, vent, humidité, 24 h, 6 jours', r.ok && /18°/.test(w.texte) && /Couvert/.test(w.texte) && /22 km\/h · ONO/.test(w.texte) && /78 %/.test(w.texte) && /Aujourd’hui/.test(w.texte) && w.html.includes('t-courbe') && (w.html.match(/<li>/g) || []).length === 6, w.texte.slice(0, 200));
verifier('source, licence et modèle Météo-France annoncés', /Open-Meteo\.com/.test(w.texte) && /CC BY 4\.0/.test(w.texte) && /Météo-France/.test(w.texte));
verifier('phrase parlée construite avec les seules valeurs reçues', /Castres/.test(r.phrase) && /18 degrés/.test(r.phrase) && /couvert/.test(r.phrase), r.phrase);
const reqM = worker.journal.filter(j => j.chemin === '/meteo').pop();
verifier('coordonnées envoyées avec 3 décimales au plus, jeton d’appareil présent', /^\d+\.\d{1,3}$/.test(reqM.q.lat) && /^\d+\.\d{1,3}$/.test(reqM.q.lon) && reqM.jeton === 'test', JSON.stringify(reqM));
await attendre(2800);
b = await G(() => window.Terre.etatB());
verifier('le lieu météo est marqué sur le globe et lié à la fenêtre', b.lieuMeteo && Math.abs(b.lieuMeteo.lat - 43.6047) < 1e-6 && b.fenetres.includes('terre-meteo'));
verifier('la météo locale alimente les nuages animés', b.meteoLocale && b.meteoLocale.couverture === 85 && b.meteoLocale.vent === 22 && b.meteoLocale.direction === 288, JSON.stringify(b.meteoLocale));
await G(() => window.Terre.placer({ lon: 2.2399, lat: 43.6047, dist: 60, cap: 0.2, incl: 0.65 }));
await attendreChargement(page, { calme: 1000 }); await attendre(1200);
const nuages = await G(() => { const m = window.Terre.globe.meteoAnim; return { visible: m.nuages.visible, opacite: m.nuages.material.uniforms.uOpacite.value, couv: m.nuages.material.uniforms.uCouverture.value }; });
verifier('les nuages locaux apparaissent au-dessus du lieu avec la couverture réelle (85 %)', nuages.visible && nuages.opacite > 0.5 && Math.abs(nuages.couv - 0.85) < 1e-6, JSON.stringify(nuages));
await page.screenshot({ path: '../captures-terre/b-meteo-nuages.png' });
const d1 = await G(() => window.Terre.globe.meteoAnim.nuages.material.uniforms.uDerive.value.toArray()); await attendre(1500);
const d2 = await G(() => window.Terre.globe.meteoAnim.nuages.material.uniforms.uDerive.value.toArray());
const sens = Math.hypot(d2[0] - d1[0], d2[1] - d1[1]);
verifier('les nuages dérivent (vent d’ouest-nord-ouest : vers l’est-sud-est)', sens > 0.05 && d2[0] > d1[0] && d2[1] < d1[1], `déplacement ${sens.toFixed(2)} km, vers (${(d2[0] - d1[0]).toFixed(2)} ; ${(d2[1] - d1[1]).toFixed(2)})`);
verifier('pas de pluie quand il ne pleut pas', !(await G(() => window.Terre.globe.meteoAnim.pluie.visible)));

// pluie réelle : animation de pluie près du sol
worker.scenario.meteo = 'pluie';
await G(() => window.Terre.meteo(43.6047, 2.2399, 'Castres')); await attendreFenetre('terre-meteo', 'Pluie');
await G(() => window.Terre.placer({ lon: 2.2399, lat: 43.6047, dist: 0.9, cap: 0.2, incl: 0.9 }));
await attendre(1500);
const pluie = await G(() => { const m = window.Terre.globe.meteoAnim; return { visible: m.pluie.visible, opacite: m.pluie.material.uniforms.uOpacite.value, n: m.pluie.geometry.drawRange.count }; });
verifier('il pleut vraiment (2,4 mm) : la pluie s’anime près du sol', pluie.visible && pluie.opacite > 0.1 && pluie.n > 1000, JSON.stringify(pluie));
await page.screenshot({ path: '../captures-terre/b-meteo-pluie.png' });
await G(() => window.Terre.placer({ lon: 2.2399, lat: 43.6047, dist: 90, cap: 0.2, incl: 0.5 })); await attendre(800);
verifier('pas de pluie vue d’en haut', !(await G(() => window.Terre.globe.meteoAnim.pluie.visible)));
worker.scenario.meteo = 'panne';
await G(() => window.Terre.meteo(35.7, 139.7, 'Tokyo')); await attendreFenetre('terre-meteo', 'INDISPONIBLE');
w = await fenetre('terre-meteo');
verifier('météo en panne : « Indisponible » et la raison', /indisponible/i.test(w.texte) && /Open-Meteo/.test(w.texte), w.texte.slice(0, 150));
verifier('en panne, la météo locale précédente n’est pas réutilisée pour Tokyo', (await G(() => window.Terre.etatB().lieuMeteo)) === null);
worker.scenario.meteo = 'ok';

// ── 4. Recherche : météo et actualités à un clic ──
await G(() => window.Terre.orbite()); await attendre(2800);
await page.type('#terre-ui .t-recherche input', 'Toulouse'); await page.keyboard.press('Enter');
await page.waitForFunction(() => !document.querySelector('#terre-ui .t-actions').hidden, { timeout: 10000 });
const chips = await G(() => [...document.querySelectorAll('#terre-ui .t-actions button')].map(x => x.textContent));
verifier('après une recherche : « Météo · lieu » et « Actualités · pays » proposés', chips.length === 2 && /Météo · Toulouse/.test(chips[0]) && /Actualités · France/.test(chips[1]), chips.join(' | '));
await page.evaluate(() => document.querySelectorAll('#terre-ui .t-actions button')[1].click());
await attendreFenetre('terre-actus', 'Titre d');
w = await fenetre('terre-actus');
verifier('le bouton « Actualités · France » ouvre la fenêtre', /Actualités · France/.test(w.titre));
await page.evaluate(() => document.querySelectorAll('#terre-ui .t-actions button')[0].click());
await attendreFenetre('terre-meteo', 'Toulouse');
w = await fenetre('terre-meteo');
verifier('le bouton « Météo · Toulouse » ouvre la fenêtre météo', /Météo · Toulouse/.test(w.titre), w.titre);

// ── 5. Radar de pluie ──
await G(() => { window.Terre.placer({ lon: 2.5, lat: 46.5, dist: 1800, cap: 0, incl: 0 }); window.Terre.regler({ radar: true }); });
await page.waitForFunction(() => window.Terre.etatB().radar.n === 13 && window.Terre.etatB().radar.tuiles > 0, { timeout: 20000 }).catch(() => {});
b = await G(() => window.Terre.etatB());
verifier('radar : 13 images connues, des tuiles d’écho affichées sur le globe', b.radar.actif && b.radar.n === 13 && b.radar.rang === 12 && b.radar.tuiles > 0, JSON.stringify(b.radar));
const uiRadar = await G(() => ({ visible: !document.querySelector('#terre-ui .t-radar').hidden, texte: document.querySelector('.t-radar-heure').textContent, max: document.querySelector('[data-radar]').max }));
verifier('curseur du radar : dernière image, heure indiquée', uiRadar.visible && /écho de \d\d:\d\d \(dernière image\)/.test(uiRadar.texte) && uiRadar.max === '12', JSON.stringify(uiRadar));
await attendreChargement(page, { calme: 800 });
await page.screenshot({ path: '../captures-terre/b-radar.png' });
await page.evaluate(() => document.querySelector('[data-a="radar-lecture"]').click()); await attendre(2600);
const rangs = await G(() => window.Terre.etatB().radar);
verifier('animation du radar : les images défilent', rangs.lecture && rangs.rang !== 12 && rangs.rang >= 5, JSON.stringify(rangs));
await page.evaluate(() => document.querySelector('[data-a="radar-lecture"]').click()); await attendre(300);
verifier('l’animation s’arrête', !(await G(() => window.Terre.etatB().radar.lecture)));
const avantRang = (await G(() => window.Terre.etatB().radar.rang));
await page.evaluate(() => { const c = document.querySelector('[data-radar]'); c.value = '3'; c.dispatchEvent(new Event('input', { bubbles: true })); }); await attendre(600);
verifier('le curseur choisit l’image', (await G(() => window.Terre.etatB().radar.rang)) === 3 && avantRang !== 3);
await G(() => window.Terre.regler({ radar: false })); await attendre(800);
verifier('radar coupé : plus d’écho, interface repliée', (await G(() => window.Terre.etatB().radar.tuiles)) === 0 && (await G(() => document.querySelector('#terre-ui .t-radar').hidden)));
faux.reglages.radar = '500';
await G(() => { window.Terre.oublierRadar(); window.Terre.regler({ radar: true }); });
await page.waitForFunction(() => /indisponible/.test(document.querySelector('.t-radar-heure').textContent), { timeout: 10000 }).catch(() => {});
verifier('radar en panne : « radar indisponible »', /radar indisponible/.test(await G(() => document.querySelector('.t-radar-heure').textContent)));
await G(() => window.Terre.regler({ radar: false })); faux.reglages.radar = 'ok';

// ── 6. Image du jour (vrais nuages) ──
const avantReq = faux.journal.length;
await G(() => { window.Terre.placer({ lon: 10, lat: 40, dist: 9000, cap: 0, incl: 0 }); window.Terre.regler({ nuagesReels: true }); });
await attendreChargement(page, { calme: 1000 });
const viirs = faux.journal.slice(avantReq).filter(p => p.startsWith('/gibsroot/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/'));
verifier('image du jour : les tuiles VIIRS (hier) sont demandées', viirs.length > 0 && /\/default\/\d{4}-\d\d-\d\d\/GoogleMapsCompatible_Level9\//.test(viirs[0]), viirs[0]);
verifier('image du jour : la coque de nuages décorative est coupée (les vrais nuages sont dans l’imagerie)', (await G(() => window.Terre.globe.scene.children.find(o => o.material && o.material.uniforms && o.material.uniforms.uNuages).material.uniforms.uOpacite.value)) === 0);
await page.screenshot({ path: '../captures-terre/b-nuages-reels.png' });
await G(() => window.Terre.regler({ nuagesReels: false }));

// ── 7. Sortie : tout est refermé, vie privée ──
await page.keyboard.press('Escape'); await attendre(250);
if (await G(() => window.Terre.etat().actif)) await page.keyboard.press('Escape');
await page.waitForFunction(() => !window.Terre.etat().actif, { timeout: 15000 });
await attendre(1500);   // les fenêtres se referment avec une petite animation
verifier('à la sortie, les fenêtres de la Terre se ferment', (await G(() => window.Terre.etatB().fenetres.length)) === 0 && !(await fenetre('terre-actus')) && !(await fenetre('terre-meteo')));
const lieux = worker.journal.filter(j => j.chemin === '/meteo').map(j => j.q);
verifier('aucune coordonnée météo plus précise que 3 décimales', lieux.every(q => /^-?\d+(\.\d{1,3})?$/.test(q.lat) && /^-?\d+(\.\d{1,3})?$/.test(q.lon)), String(lieux.length) + ' requêtes');
verifier('aucune exception JavaScript', exceptions() === 0, erreurs.filter(x => !ignorees.test(x)).slice(0, 3).join(' || '));

console.log('requêtes au faux Worker :', worker.journal.length, '· aux faux serveurs de tuiles :', faux.journal.length);
await navigateur.close(); await faux.fermer(); await worker.fermer();
process.exit(fin() ? 1 : 0);
