// Tests de la détection d'appareil (V7b, B1) : PC, tablette, téléphone, tablettes qui se déclarent « bureau », fenêtre de PC réduite, réglages et paramètre de développement.
// Lancer : node galaxie/tests/appareil-test.mjs
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../../core/commun/appareil.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const UA = {
  s23: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  tabS9: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadBureau: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidBureau: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};
const m = e => A.detecter(e).mode;

v('Galaxy S23 Ultra (Chrome, 412×915, tactile) → téléphone', m({ ua: UA.s23, mobileUA: true, pointsContact: 5, pointeurGrossier: true, survol: false, ecranMin: 412 }) === 'telephone');
v('Samsung Galaxy Tab S9 (800×1280) → tablette', m({ ua: UA.tabS9, mobileUA: false, pointsContact: 10, pointeurGrossier: true, survol: false, ecranMin: 800 }) === 'tablette');
v('iPhone → téléphone', m({ ua: UA.iphone, pointsContact: 5, pointeurGrossier: true, survol: false, ecranMin: 390 }) === 'telephone');
v('iPad → tablette', m({ ua: UA.ipad, pointsContact: 5, pointeurGrossier: true, survol: false, ecranMin: 820 }) === 'tablette');
v('iPadOS qui se déclare Mac (plusieurs points de contact) → tablette', m({ ua: UA.ipadBureau, plateforme: 'MacIntel', pointsContact: 5, pointeurGrossier: true, survol: false, ecranMin: 820 }) === 'tablette');
v('Android en « mode ordinateur » sur tablette (écran tactile, pointeur grossier, pas de survol) → tablette', m({ ua: UA.androidBureau, mobileUA: false, pointsContact: 10, pointeurGrossier: true, survol: false, ecranMin: 800 }) === 'tablette');
v('…et sur un petit écran → téléphone', m({ ua: UA.androidBureau, pointsContact: 5, pointeurGrossier: true, survol: false, ecranMin: 412 }) === 'telephone');
v('PC Windows avec souris → pc', m({ ua: UA.windows, mobileUA: false, pointsContact: 0, pointeurGrossier: false, survol: true, ecranMin: 1440 }) === 'pc');
v('PC portable avec écran tactile ET souris (pointeur fin, survol) → pc', m({ ua: UA.windows, mobileUA: false, pointsContact: 10, pointeurGrossier: false, survol: true, ecranMin: 1080 }) === 'pc');
v('Mac sans écran tactile → pc', m({ ua: UA.mac, plateforme: 'MacIntel', pointsContact: 0, pointeurGrossier: false, survol: true, ecranMin: 900 }) === 'pc');
v('une fenêtre de PC réduite reste en mode PC (la taille de la fenêtre ne compte pas)', m({ ua: UA.windows, pointsContact: 0, pointeurGrossier: false, survol: true, ecranMin: 1440, largeurFenetre: 360 }) === 'pc');
v('informations absentes : PC par défaut (jamais de blocage de l’interface)', m({}) === 'pc' && m({ ua: '' }) === 'pc');

v('réglage explicite « téléphone » sur un PC (pour tester)', m({ ua: UA.windows, preference: 'telephone', survol: true }) === 'telephone');
v('réglage explicite « pc » sur un téléphone', m({ ua: UA.s23, mobileUA: true, preference: 'pc', pointeurGrossier: true, survol: false, ecranMin: 412 }) === 'pc');
v('réglage invalide ignoré', m({ ua: UA.s23, mobileUA: true, preference: 'galaxie', pointeurGrossier: true, survol: false, ecranMin: 412 }) === 'telephone');
v('le paramètre de développement prime sur le réglage', A.detecter({ ua: UA.windows, preference: 'tablette', dev: 'telephone' }).mode === 'telephone' && A.detecter({ ua: UA.windows, dev: 'pc' }).source === 'url');
v('la source est dite : auto, réglage, url', A.detecter({ ua: UA.windows }).source === 'auto' && A.detecter({ ua: UA.windows, preference: 'tablette' }).source === 'reglage');
v('une raison lisible accompagne le résultat', A.detecter({ ua: UA.s23, mobileUA: true, ecranMin: 412 }).raison.length > 5);

v('Galaxie autorisée sur PC seulement', A.galaxieAutorisee('pc') === true && A.galaxieAutorisee('tablette') === false && A.galaxieAutorisee('telephone') === false);
v('thème imposé : Jarvis sur téléphone et tablette, libre sur PC', A.themeImpose('telephone') === 'jarvis' && A.themeImpose('tablette') === 'jarvis' && A.themeImpose('pc') === null);
v('message poli quand on demande Galaxie hors PC', /réservé au PC/.test(A.MESSAGE_GALAXIE) && /Jarvis/.test(A.MESSAGE_GALAXIE));
v('seuil téléphone / tablette : 600 px CSS', A.SEUIL_TELEPHONE === 600);
console.log('Appareil : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
