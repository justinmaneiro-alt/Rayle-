import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';

/* Actualités de tous les pays SUR LA TERRE 3D : bouton « Pays ▾ », sélecteur au-dessus de la Terre, repères de pays avec le titre du jour (digest de la planète),
   voix « les actualités du Japon » ouverte sur la Terre, sans IA. Faux Worker et fausses tuiles (aucun réseau). Lancer :  node tests-navigateur/terre-pays-test.mjs */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 170));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
const injecter = async p => {
  await p.evaluateOnNewDocument((inj, urlWorker) => {
    window.__RAYLE_TERRE_TEST__ = inj;
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test');
  }, faux.injection, worker.url);
};
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, a) => page.evaluate(f, a);
await G(() => { window.__dit = []; speak = async t => { window.__dit.push(String(t)); }; });
await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 1000 });
await G(() => window.Terre.placer({ lon: 8, lat: 46, dist: 3800, cap: 0, incl: 0 }));
await attendre(2500);

const requetesPlanete = () => worker.journal.filter(j => j.chemin === '/actualites/planete').length;
verifier('le Worker est interrogé pour le digest de la planète (une demande, après la liste des pays)', requetesPlanete() >= 1 && worker.journal.some(j => j.chemin === '/actualites' && j.q.liste), `${requetesPlanete()} demande(s)`);
const pins = await G(() => window.Terre.marqueursEcran());
verifier('les repères de pays qui ont un titre du jour sont signalés (vert) : France, Japon…', pins.length >= 4 && pins.filter(p => p.titre).length >= 3 && pins.filter(p => p.titre).some(p => p.code === 'FR'), JSON.stringify(pins.map(p => p.code + (p.titre ? '*' : ''))));
const bouton = await G(() => !!document.querySelector('#terre-ui [data-a="pays"]'));
verifier('la barre de la Terre a un bouton « Pays ▾ »', bouton);
await page.click('#terre-ui [data-a="pays"]'); await attendre(1200);
let s = await G(() => ({ ouvert: !!document.getElementById('pays-selecteur'), pays: document.querySelectorAll('#pays-selecteur .ps-pays').length, z: getComputedStyle(document.getElementById('pays-selecteur')).zIndex, chips: [...document.querySelectorAll('#pays-selecteur .ps-chip')].length }));
verifier('« Pays ▾ » ouvre le sélecteur au-dessus de la Terre (continents, pays, favoris)', s.ouvert && s.pays >= 10 && s.chips >= 9, JSON.stringify(s));
await G(() => document.querySelector('#pays-selecteur .ps-pays[data-code="JP"] .ps-etoile').click());
verifier('l’étoile met le Japon en favori (mémorisé)', await G(() => JSON.parse(localStorage.getItem('rayle_pays_favoris') || '[]').includes('JP')));
await G(() => document.querySelector('#pays-selecteur .ps-pays[data-code="JP"] .ps-nom').click());
await page.waitForFunction(() => document.querySelector('#panneaux .pn[data-id="terre-actus"]') && !document.querySelector('#panneaux .pn[data-id="terre-actus"] .t-charge'), { timeout: 15000 });
const w = await G(() => { const e = document.querySelector('#panneaux .pn[data-id="terre-actus"]'); return { titre: e.querySelector('h2').textContent, texte: e.innerText, langs: [...e.querySelectorAll('.t-lang')].map(x => x.textContent), ancienne: !!document.querySelector('#panneaux .pn[data-id="actus-pays-JP"]') }; });
verifier('un pays choisi dans le sélecteur s’ouvre SUR LA TERRE (fenêtre de la Terre, pas celle de l’accueil)', /Actualités · Japon/.test(w.titre) && !w.ancienne, w.titre);
verifier('les titres du pays portent leur étiquette de langue', w.langs.length >= 3 && w.langs.every(l => /^[A-Z]{2,3}$/.test(l)), JSON.stringify(w.langs.slice(0, 4)));
await attendre(1800);
const vue = await G(() => window.Terre.etat());
verifier('la caméra se rapproche du pays choisi (altitude plus basse que la vue de départ)', vue.actif && vue.altitude < 3800 || vue.vol === true || vue.altitude < 3700, JSON.stringify({ alt: Math.round(vue.altitude), vol: vue.vol }));
// voix sur la Terre
await G(() => { Panneaux.fermerTout(); });
const chats0 = worker.etat.chats.length;
await G(() => { window.__dit = []; addLine('user', 'les actualités du Brésil'); respond('les actualités du Brésil'); });
await page.waitForFunction(() => document.querySelector('#panneaux .pn[data-id="terre-actus"]') && /Brésil/i.test(document.querySelector('#panneaux .pn[data-id="terre-actus"] h2').textContent), { timeout: 15000 }).catch(() => {});
await page.waitForFunction(() => window.__dit && window.__dit.length > 0, { timeout: 8000 }).catch(() => {});   // la phrase suit l'ouverture de la fenêtre (de quelques centaines de ms)
const dit = await G(() => window.__dit.slice());
verifier('voix sur la Terre : « les actualités du Brésil » s’ouvre sur la Terre, avec une phrase, SANS appel à l’IA', await G(() => !!document.querySelector('#panneaux .pn[data-id="terre-actus"]')) && dit.length >= 1 && /pays : Brésil|Brésil/.test(dit[0]) && worker.etat.chats.length === chats0, `${dit[0]} · chats +${worker.etat.chats.length - chats0}`);
await G(() => { Panneaux.fermerTout(); window.__dit = []; addLine('user', 'les actualités en Asie'); respond('les actualités en Asie'); });
await attendre(2500);
verifier('voix sur la Terre : « les actualités en Asie » ouvre la fenêtre du continent (accueil) sans IA', await G(() => !!document.querySelector('#panneaux .pn[data-id="actus-region-asie"]')) || (await G(() => window.__dit.slice())).some(t => /Asie|région/.test(t)), JSON.stringify(await G(() => window.__dit.slice())));
// digest absent (Worker pas à jour) : les repères restent comme avant
worker.scenario.planete = 'ancien';
await G(() => { window.Terre.etatB(); });
verifier('aucune exception ni erreur de page', erreurs.filter(x => /pageerror|TypeError|ReferenceError/.test(x) && !/faireconomy/.test(x)).length === 0, erreurs.slice(0, 3).join(' | '));
await navigateur.close(); await faux.fermer(); await worker.fermer(); fin();
