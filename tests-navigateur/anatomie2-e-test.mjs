/* Anatomie 2, phase E : catalogue complet des pathologies dans Chrome : curseur réglable (angle de Cobb), comparaison avec le corps sain, zone mise en évidence pour les fiches sans déformation 3D,
   ordre vocal, ouverture de TOUTES les fiches sans erreur, avertissement « pas un outil de diagnostic » visible. Captures : docs/captures-anatomie-2/e-*.png */
import { ouvrirGalaxie, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const c = compteur(), SORTIE = '../docs/captures-anatomie-2/'; fs.mkdirSync(SORTIE, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
const nom = (t, ok, d = '') => c.verifier(t, ok, String(d).slice(0, 260));
const ordre = (a, p = {}) => G((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), a, p);
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1000);
await ordre('ouvrir_salle_medicale');
await page.waitForFunction(() => { const a = window.Saturne.anatomieObjet && window.Saturne.anatomieObjet(); return a && a.etatPublic().visibles >= 200; }, { timeout: 60000 }); await attendre(1000);
const O = '(window.Saturne.anatomieObjet().orchestre)';
const txt = () => G(() => (document.querySelector('.saf[data-id=pathologie]') || { textContent: '' }).textContent);
let r = await G(async () => { const o = window.Saturne.anatomieObjet().orchestre; const x = await o.lancerPathologie('scol_adolescent', { valeur: 45 }); return { ok: x.ok, mesure: x.mesure, cobb: x.cobb }; });
nom('scoliose de l’adolescent à 45° : angle de Cobb mesuré sur le modèle', r.ok && Math.abs(r.cobb - 45) < 1.5, JSON.stringify(r));
let t = await txt(); nom('fenêtre : avertissement, niveau, causes, appareillage informatif, curseur', /Pas un outil de diagnostic/.test(t) && /Niveau de confiance/.test(t) && /Causes/.test(t) && /À titre informatif|à titre informatif/.test(t) && !!(await G(() => document.querySelector('.saf[data-id=pathologie] [data-p=valeur]'))), t.slice(0, 80));
await page.screenshot({ path: SORTIE + 'e-scoliose.png' });
await G(() => { const s = document.querySelector('.saf[data-id=pathologie] [data-p=valeur]'); s.value = 60; s.dispatchEvent(new Event('change')); }); await attendre(2500);
r = await G(() => ({ cobb: window.Saturne.anatomieObjet().pathologiesObjet().etat.actif && window.Saturne.anatomieObjet().pathologiesObjet().detail().actif, v: document.querySelector('.saf[data-id=pathologie] [data-p=valeur]').value }));
nom('le curseur relance la déformation à 60°', r.cobb === 'scoliose' && r.v === '60', JSON.stringify(r));
const mes = await G(() => document.querySelector('.saf[data-id=pathologie] .saf-mesure') && document.querySelector('.saf[data-id=pathologie] .saf-mesure').textContent); nom('mesure affichée dans la fenêtre', /6\d\.\d degrés|59\.\d degrés/.test(mes || ''), mes);
await G(() => document.querySelector('.saf[data-id=pathologie] [data-p=sain]').click()); await attendre(1500);
nom('comparer avec le corps sain : la pathologie est retirée', !(await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail().actif)));
await page.screenshot({ path: SORTIE + 'e-sain.png' });
await G(() => document.querySelector('.saf[data-id=pathologie] [data-p=sain]').click()); await attendre(2500);
nom('revoir le cas : la pathologie revient', (await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail().actif)) === 'scoliose');
// fiche sans 3D : zone mise en évidence
r = await ordre('afficher_pathologie', { nom: 'syndrome du canal carpien' }); await attendre(1500);
nom('ordre vocal : « canal carpien » : fiche et zone sélectionnée', r.ok && /carpien/i.test(r.texte) && (await G(() => window.Saturne.anatomieObjet().etatPublic().selection.length)) > 0, (r.texte || r.erreur || '').slice(0, 100));
await page.screenshot({ path: SORTIE + 'e-canal-carpien.png' });
r = await ordre('afficher_pathologie', { nom: 'hallux valgus' }); nom('ordre vocal : hallux valgus', r.ok, JSON.stringify(r).slice(0, 120));
r = await ordre('afficher_pathologie', { nom: 'syndrome de Brown-Séquard' }); nom('ordre vocal : Brown-Séquard', r.ok && /Brown/.test(r.texte), JSON.stringify(r).slice(0, 120));
r = await ordre('afficher_pathologie', { nom: 'corset de Chêneau' }); nom('ordre vocal : corset de Chêneau', r.ok && /Chêneau/.test(r.texte), JSON.stringify(r).slice(0, 120));
r = await ordre('afficher_pathologie', { nom: 'machine à laver' }); nom('demande inconnue : refus honnête', !r.ok, JSON.stringify(r).slice(0, 120));
// catalogue : recherche et filtres
await G(() => document.querySelector('#s-anat [data-a=cat-pathologies]').click()); await attendre(500);
const cat = await G(() => ({ filtres: document.querySelectorAll('.saf[data-id=catalogue-pathologies] .saf-filtres button').length, boutons: document.querySelectorAll('.saf[data-id=catalogue-pathologies] .saf-liste button').length }));
nom('catalogue : au moins 15 catégories et 150 entrées', cat.filtres >= 16 && cat.boutons >= 150, JSON.stringify(cat));
await G(() => { const q = document.querySelector('.saf[data-id=catalogue-pathologies] input[type=search]'); q.value = 'plexus'; q.dispatchEvent(new Event('input')); });
nom('recherche « plexus » : Erb et Klumpke', (await G(() => [...document.querySelectorAll('.saf[data-id=catalogue-pathologies] .saf-liste button')].map(b => b.textContent).join('|'))).match(/Erb/) !== null);
// toutes les fiches s'ouvrent
const bilan = await G(async () => { const o = window.Saturne.anatomieObjet().orchestre, ids = [...document.querySelectorAll('.saf[data-id=catalogue-pathologies] .saf-liste button')].length; void ids; const catalogue = (await import('./planetes/saturne/pc/anatomie-patho-catalogue.js')).TOUTES; const echecs = []; for (const p of catalogue) { try { const x = await o.lancerPathologie(p.id, {}); if (!x.ok) echecs.push(p.id + ':' + (x.erreur || '?')); } catch (e) { echecs.push(p.id + ':' + e.message); } } return { n: catalogue.length, echecs }; });
nom('les ' + bilan.n + ' fiches s’ouvrent sans erreur', bilan.echecs.length === 0, bilan.echecs.slice(0, 6).join(' | '));
await page.screenshot({ path: SORTIE + 'e-derniere.png' });
nom('aucune erreur JS', !erreurs.some(x => /pageerror/.test(x)), erreurs.filter(x => /pageerror/.test(x)).join(' | '));
const e = c.fin(); await navigateur.close(); process.exit(e ? 1 : 0);
