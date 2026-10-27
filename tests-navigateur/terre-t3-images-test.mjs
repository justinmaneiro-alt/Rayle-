import { ouvrirGalaxie, entrerEnOrbite, attendre, attendreChargement, compteur } from './terre-aide.mjs';
import { demarrerFauxServeur } from './mock-terre.mjs';
import { demarrerFauxWorker } from './mock-worker-terre.mjs';
import { PNG } from 'pngjs';
import fs from 'node:fs';

/* Phase T3 : images dans les actualités de la Terre (cartes sur le globe, panneau France). Faux Worker, faux Commons, faux serveurs d'images et de tuiles :
   déterministe, sans réseau. Vérifie les trois niveaux (image du flux → photo libre du lieu → vue cartographique), les crédits, les licences, la limite de
   demandes, le cache, l'option « désactiver » et le mode léger. Captures dans docs/captures-t3/. */
const { verifier: v0, fin } = compteur();
const verifier = (n, c, d = '') => v0(n, c, String(d).replace(/\s+/g, ' ').slice(0, 240));
const faux = await demarrerFauxServeur(8123), worker = await demarrerFauxWorker(8795);
const SORTIE = '../docs/captures-t3/'; fs.mkdirSync(SORTIE, { recursive: true });
const png = (r, g, b) => { const p = new PNG({ width: 96, height: 64 }); for (let i = 0; i < p.data.length; i += 4) { p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255; } return PNG.sync.write(p); };
const compt = { commons: [], enVol: 0, maxVol: 0, images: [] };
const COMMONS = (u) => {
  const q = u.searchParams, coord = q.get('ggscoord');
  const page = (i, titre, lic, art) => ({ index: i, title: 'File:' + titre, imageinfo: [{ thumburl: 'https://upload.faux.test/' + i + '.jpg', url: 'https://upload.faux.test/' + i + '.jpg', width: 1400, height: 900, mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: lic }, Artist: { value: art } } }] });
  if (coord) {
    const [lat] = coord.split('|').map(Number);
    if (Math.abs(lat - 45.76) < 0.05) return { query: { pages: { 1: page(1, 'Lyon_Presqu_ile.jpg', 'CC BY-SA 4.0', '<a href="x">Marie Lyon</a>'), 2: page(2, 'Interdit.jpg', 'All rights reserved', 'X') } } };
    if (Math.abs(lat - 43.6) < 0.05) return { query: { pages: { 1: page(3, 'Toulouse_Capitole.jpg', 'CC BY 4.0', 'Paul Garonne') } } };
    if (Math.abs(lat - 48.39) < 0.05) return { query: { pages: { 1: page(4, 'Brest_proprio.jpg', 'All rights reserved', 'Y') } } };
  }
  return {};
};
const injecter = async p => {
  await p.evaluateOnNewDocument((inj, urlWorker, ia) => {
    window.__RAYLE_TERRE_TEST__ = inj; window.__RAYLE_IA_TEST__ = ia;
    localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.setItem('rayle_worker_url', urlWorker); localStorage.setItem('rayle_worker_token', 'test');
  }, faux.injection, worker.url, { gibs: faux.base + '/gibs', eox: faux.base + '/eox' });
  await p.setRequestInterception(true);
  p.on('request', async r => {
    const u = new URL(r.url());
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (u.host === 'img.faux.test') { compt.images.push(u.pathname); return /casse/.test(u.pathname) ? r.respond({ status: 404, headers: cors, body: 'x' }) : r.respond({ status: 200, headers: cors, contentType: 'image/png', body: png(60, 110, 160) }); }
    if (u.host === 'upload.faux.test') return r.respond({ status: 200, headers: cors, contentType: 'image/png', body: png(120, 160, 90) });
    if (u.host === 'commons.wikimedia.org') {
      compt.commons.push(u.searchParams.get('ggscoord') || u.searchParams.get('gsrsearch')); compt.enVol++; compt.maxVol = Math.max(compt.maxVol, compt.enVol);
      await new Promise(ok => setTimeout(ok, 250));
      compt.enVol--;
      return r.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(COMMONS(u)) });
    }
    r.continue().catch(() => {});
  });
};
const { navigateur, page, erreurs } = await ouvrirGalaxie({ avant: injecter });
const G = (f, ...a) => page.evaluate(f, ...a);
await entrerEnOrbite(page, { directe: true });
await attendreChargement(page, { calme: 900 });
await G(() => { document.body.dataset.hud = 'complet'; });

const lignePanneau = titre => G(t => { const li = [...document.querySelectorAll('#panneaux .t-fil li')].find(x => x.innerText.includes(t)); if (!li) return null; const z = li.querySelector('.t-f-img'); return { zone: !!z, vide: !!z && z.classList.contains('ia-vide'), plein: !!z && z.classList.contains('ia-plein'), classe: z ? (z.querySelector('.ia-fig') || {}).className || '' : '', credit: z && z.querySelector('.ia-credit') ? z.querySelector('.ia-credit').textContent : '', href: z && z.querySelector('a') ? z.querySelector('a').href : '', imgs: z ? z.querySelectorAll('img').length : 0, pin: z ? !!z.querySelector('.ia-pin') : false, src: z && z.querySelector('img') ? z.querySelector('img').src : '' }; }, titre);
const attendreZones = () => page.waitForFunction(() => { const z = [...document.querySelectorAll('#panneaux .t-fil .t-f-img')]; return z.length > 0 && z.every(x => !x.classList.contains('ia-attente')) && (x => x)(true); }, { timeout: 20000 });

await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await page.waitForFunction(() => !!document.querySelector('#panneaux .pn[data-id="terre-fil-france"] .t-fil li'), { timeout: 20000 });
await attendreZones(); await attendre(1500);
await page.screenshot({ path: SORTIE + 'panneau-france.png' });

const bordeaux = await lignePanneau('Bordeaux'), toulouse = await lignePanneau('Toulouse'), lyon = await lignePanneau('Lyon'), brest = await lignePanneau('Brest'), sansLieu = await lignePanneau('réforme administrative');
verifier('Bordeaux : image du flux du média, légende « © Sud Ouest », lien vers l’article', bordeaux && /ia-flux/.test(bordeaux.classe) && /© Sud Ouest/.test(bordeaux.credit) && /exemple\.test\/bordeaux-tram\/1/.test(bordeaux.href) && /img\.faux\.test\/bordeaux/.test(bordeaux.src), JSON.stringify(bordeaux));
verifier('Toulouse : l’image du flux est introuvable → photo libre Commons avec auteur et licence', toulouse && /ia-commons/.test(toulouse.classe) && /Commons · Paul Garonne · CC BY 4\.0/.test(toulouse.credit) && /commons\.wikimedia\.org\/wiki\/File:Toulouse_Capitole/.test(toulouse.href), JSON.stringify(toulouse));
verifier('Lyon : pas d’image de flux → photo Commons libre (la photo « tous droits réservés » est écartée)', lyon && /ia-commons/.test(lyon.classe) && /Marie Lyon · CC BY-SA 4\.0/.test(lyon.credit) && /Lyon_Presqu/.test(lyon.href), JSON.stringify(lyon));
verifier('Brest : aucune photo libre → vue cartographique (4 tuiles, repère, crédit de la source)', brest && /ia-carte/.test(brest.classe) && brest.imgs === 4 && brest.pin && /Carte · /.test(brest.credit), JSON.stringify(brest));
verifier('sujet sans lieu et sans image : aucune image inventée (zone vide, masquée)', sansLieu && sansLieu.vide && !sansLieu.plein, JSON.stringify(sansLieu));
const nCommons = compt.commons.length;
verifier('Commons : au plus 2 demandes en parallèle', compt.maxVol <= 2, 'max ' + compt.maxVol);
verifier('Commons : une demande par lieu (pas de doublon), jamais pour un sujet qui a son image', new Set(compt.commons).size === compt.commons.length && !compt.commons.some(c => /44\.8/.test(String(c))), compt.commons.join(' ; '));

// cartes holographiques sur le globe
await page.waitForFunction(() => document.querySelectorAll('#terre-ui .t-carte').length >= 3, { timeout: 20000 });
await attendre(2500);
await page.screenshot({ path: SORTIE + 'terre-cartes.png' });
const cartes = await G(() => [...document.querySelectorAll('#terre-ui .t-carte')].map(c => { const z = c.querySelector('.t-c-img'); return { id: c.dataset.id, zone: !!z, plein: !!z && z.classList.contains('ia-plein'), vide: !!z && z.classList.contains('ia-vide'), type: z && z.querySelector('.ia-fig') ? [...z.querySelector('.ia-fig').classList].find(x => /^ia-(flux|commons|carte)$/.test(x)) : null, credit: z && z.querySelector('.ia-credit') ? z.querySelector('.ia-credit').textContent : '' }; }));
verifier('cartes du globe : chaque carte a une zone d’image, remplie ou masquée proprement', cartes.length >= 3 && cartes.every(c => c.zone && (c.plein || c.vide)), JSON.stringify(cartes));
verifier('cartes du globe : au moins une carte avec image, légende non vide', cartes.some(c => c.plein && c.credit.length > 3), cartes.map(c => c.type + ':' + c.credit).join(' | '));
verifier('cartes du globe : aucune adresse dangereuse', await G(() => ![...document.querySelectorAll('#terre-ui .t-carte img, #terre-ui .t-carte a')].some(e => /javascript:/i.test(e.src || e.href || ''))));

// cache : rouvrir le panneau ne refait aucune demande Commons
await G(() => { window.Panneaux.fermer('terre-fil-france'); });
await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await page.waitForFunction(() => !!document.querySelector('#panneaux .pn[data-id="terre-fil-france"] .t-fil li'), { timeout: 20000 });
await attendre(1500);
verifier('cache de 7 jours : rouvrir le panneau ne refait aucune demande à Commons', compt.commons.length === nCommons, `${nCommons} → ${compt.commons.length}`);

// option : désactiver les images
await G(() => { window.ImagesActus.reglage.ecrire(false); window.Panneaux.fermer('terre-fil-france'); });
await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await page.waitForFunction(() => !!document.querySelector('#panneaux .pn[data-id="terre-fil-france"] .t-fil li'), { timeout: 20000 });
await attendre(800);
verifier('option « Images dans les actualités » coupée : plus aucune zone d’image dans le panneau', await G(() => document.querySelectorAll('#panneaux .pn[data-id="terre-fil-france"] .t-f-img').length === 0));
await G(() => { window.ImagesActus.reglage.ecrire(true); document.body.dataset.hud = 'leger'; window.Panneaux.fermer('terre-fil-france'); });
await G(() => document.querySelector('#terre-ui [data-a="france"]').click());
await page.waitForFunction(() => !!document.querySelector('#panneaux .pn[data-id="terre-fil-france"] .t-fil li'), { timeout: 20000 });
await attendre(800);
verifier('mode léger : aucune image dans les actualités', await G(() => window.ImagesActus.actif() === false && document.querySelectorAll('#panneaux .pn[data-id="terre-fil-france"] .t-f-img').length === 0));
await G(() => { document.body.dataset.hud = 'complet'; });
verifier('réglage ⚙ de la Terre : la case « Images dans les actualités » existe et reflète l’option', await G(() => { const c = document.querySelector('#terre-ui [data-ia-reglage]'); return !!c && c.checked === window.ImagesActus.reglage.lire(); }));
const exc = erreurs.filter(x => /pageerror|TypeError|ReferenceError/.test(x));
verifier('aucune exception de page', exc.length === 0, exc.slice(0, 3).join(' | '));
await navigateur.close(); await faux.fermer(); worker.fermer && worker.fermer();
process.exit(fin() ? 1 : 0);
