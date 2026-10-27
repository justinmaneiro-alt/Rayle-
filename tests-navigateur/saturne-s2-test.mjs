/* S2 : le squelette 3D dans la salle médicale (Chrome) : chargement progressif, sélection par clic et par ordre vocal, isolement, transparence, coupe, étiquettes, mesure,
   comparaison gauche / droite, description parlée, fiche sur l'écran mural. Captures dans docs/captures-s2/. Nécessite assets-lourds/anatomie/ (anatomie-convertir.mjs). */
import { ouvrirGalaxie, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const c = compteur(), SORTIE = '../docs/captures-s2/'; fs.mkdirSync(SORTIE, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900 });
const G = (f, ...a) => page.evaluate(f, ...a);
const nom = (t, ok, d = '') => c.verifier(t, ok, String(d).slice(0, 240));
const ordre = (action, params = {}) => G((a, p) => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: a, params: p }), action, params);

await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await page.waitForFunction(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, { timeout: 60000 }); await attendre(1200);
const t0 = Date.now();
let r = await ordre('afficher_systeme', { systeme: 'squelette' });
nom('ordre « afficher le squelette » : salle ouverte et squelette chargé', r.ok && /squelette/.test(r.texte || ''), JSON.stringify(r));
let e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('squelette : 202 os chargés, visibles', e.chargés.includes('os') && e.visibles === 202 && e.meshs === 202, JSON.stringify(e));
nom('chargement du squelette en moins de 20 s (' + (Date.now() - t0) + ' ms)', Date.now() - t0 < 20000);
await attendre(1200); await page.screenshot({ path: SORTIE + 'squelette.png' });
nom('le panneau d’anatomie est affiché avec les crédits', await G(() => { const p = document.getElementById('s-anat'); return !!p && p.offsetParent !== null && /BodyParts3D/.test(p.textContent) && /CC BY/.test(p.textContent); }));

// ── sélection et description par ordre vocal
r = await ordre('decrire', { nom: 'fémur gauche' });
e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('« décris le fémur gauche » : un os sélectionné, description parlée avec rappel de vérifier', r.ok && e.selection.length === 1 && /fémur/i.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 120));
nom('une étiquette est affichée sur l’os', e.etiquettes === 1);
await attendre(1500); await page.screenshot({ path: SORTIE + 'femur-decrit.png' });
const fiche = await G(() => (document.querySelector('.saf[data-id=fiche]') || { textContent: '' }).textContent);
nom('la fenêtre de fiche montre le nom, le latin et la confiance', /Fémur/.test(fiche) && /femoris|Os femoris/i.test(fiche) && /Niveau de confiance : élevée/.test(fiche), fiche.slice(0, 100));

// ── isoler, transparence, coupe, langues
r = await ordre('anatomie_isoler', { nom: 'tibia droit' }); e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('isoler le tibia droit : une seule pièce visible', r.ok && e.isole && e.visibles === 1 && e.selection.length === 1, JSON.stringify(e));
await attendre(900); await page.screenshot({ path: SORTIE + 'tibia-isole.png' });
r = await ordre('anatomie_tout'); e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('« affiche tout » : les 202 os de nouveau visibles, sélection vide', r.ok && e.visibles === 202 && e.selection.length === 0 && !e.isole, JSON.stringify(e));
r = await ordre('anatomie_transparence', { etat: 'oui' }); nom('transparence sans sélection : refus clair', !r.ok && /sélectionne/.test(r.erreur || ''), JSON.stringify(r));
await ordre('anatomie_montrer', { nom: 'humérus gauche' }); r = await ordre('anatomie_transparence', { etat: 'oui' }); await attendre(900);
const opa = await G(() => window.Saturne.anatomieObjet().etat.opacite);
nom('autres structures transparentes (opacité 0,15)', r.ok && Math.abs(opa - 0.15) < 1e-6, opa);
await page.screenshot({ path: SORTIE + 'humerus-transparent.png' });
await ordre('anatomie_transparence', { etat: 'non' });
r = await ordre('anatomie_coupe', { plan: 'x' }); await attendre(600);
nom('plan de coupe sagittal actif', r.ok && (await G(() => window.Saturne.anatomieObjet().etatPublic())).coupe.axe === 'x');
const nPlan = await G(() => { let n = 0; window.Saturne.salleObjet().scene.traverse(o => { if (o.isMesh && o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) n++; }); return n; });
nom('le plan de coupe est appliqué aux matériaux', nPlan > 0, nPlan);
await G(() => window.Saturne.anatomieObjet().couper('x', 0.35)); await attendre(700); await page.screenshot({ path: SORTIE + 'coupe.png' });
await ordre('anatomie_coupe', { plan: 'aucune' });
r = await ordre('anatomie_noms', { langue: 'la' }); nom('noms en latin', r.ok && (await G(() => window.Saturne.anatomieObjet().etat.langue)) === 'la');
await ordre('anatomie_noms', { langue: 'fr' });

// ── mesure et comparaison
await G(async () => { const a = window.Saturne.anatomieObjet(); await a.selectionner([a.index.resoudre('fémur gauche')[0], a.index.resoudre('tibia gauche')[0]]); });
const mes = await G(() => window.Saturne.anatomieObjet().mesurer());
nom('mesure de distance entre deux os (mm, indicatif)', mes.ok && /\d+ mm/.test(mes.texte) && /indicatif/.test(mes.texte), mes.texte || mes.erreur);
await G(async () => { const a = window.Saturne.anatomieObjet(); await a.selectionner([a.index.resoudre('fémur gauche')[0], a.index.resoudre('patella gauche')[0], a.index.resoudre('tibia gauche')[0]]); });
const ang = await G(() => window.Saturne.anatomieObjet().mesurer());
nom('mesure d’angle avec trois pièces', ang.ok && /°/.test(ang.texte), ang.texte || ang.erreur);
r = await ordre('anatomie_comparer', { nom: 'fémur' }); e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('comparaison gauche / droite du fémur : deux os sélectionnés, écart donné', r.ok && e.selection.length === 2 && /écart/.test(r.texte), r.texte || r.erreur);
await attendre(900); await page.screenshot({ path: SORTIE + 'comparaison.png' });

// ── clic sur une pièce (lancer de rayon)
await ordre('anatomie_tout'); await attendre(2200);
const cx = await G(() => { const a = window.Saturne.anatomieObjet(), s = window.Saturne.salleObjet(); const p = a.index.resoudre('fémur gauche')[0], c = a.index.centre(p); const v = a.racine.localToWorld(new (s.camera.position.constructor)(c[0], c[1], c[2])); v.project(s.camera); const r = document.getElementById('scene3d').getBoundingClientRect(); return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height]; });
const choisi = await G((x, y) => { const a = window.Saturne.anatomieObjet(); const p = a.clic(x, y, false); return p && p.nom_en; }, cx[0], cx[1]);
nom('clic sur le fémur gauche : une pièce est sélectionnée (' + choisi + ')', !!choisi);

// ── autres systèmes : muscles
r = await ordre('afficher_systeme', { systeme: 'muscles' }); e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('muscles chargés en plus du squelette', r.ok && e.chargés.includes('muscles') && e.meshs >= 202 + 416, JSON.stringify(e));
await G(() => window.Saturne.anatomieObjet().toutAfficher()); await attendre(1500); await page.screenshot({ path: SORTIE + 'os-muscles.png' });
r = await ordre('decrire', { nom: 'zzzz inexistant' }); nom('structure inconnue : réponse honnête, rien d’inventé', !r.ok && /ne trouve pas/.test(r.erreur || ''), JSON.stringify(r));
// ── S3 : muscles : fiche, couches, cotation
r = await ordre('decrire', { nom: 'biceps brachial gauche' });
nom('« décris le biceps brachial gauche » : origine, insertion, innervation, antagonistes, rappel de vérifier', r.ok && /naît de/.test(r.texte) && /Innervation : nerf musculo-cutané/.test(r.texte) && /Antagonistes/.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 140));
await attendre(1500);
const fm = await G(() => (document.querySelector('.saf[data-id=fiche]') || { textContent: '' }).textContent);
nom('la fenêtre du muscle montre origine, terminaison, innervation, action et la couche estimée', /Origine/.test(fm) && /Terminaison/.test(fm) && /Innervation/.test(fm) && /Action/.test(fm) && /Couche/.test(fm), fm.slice(0,120));
await page.screenshot({ path: SORTIE + 'biceps.png' });
await G(() => window.Saturne.anatomieObjet().toutAfficher());
const vis = () => G(() => { const a = window.Saturne.anatomieObjet(); let n = 0; for (const [id, ms] of a.etat.meshs) if (a.index.parId.get(id).type === 'muscle' && ms.some(m => m.visible)) n++; return n; });
const n1 = await vis(); r = await ordre('anatomie_couches', { niveau: 'intermediaire' }); const n2 = await vis(); await attendre(900); await page.screenshot({ path: SORTIE + 'muscles-sans-superficiels.png' });
r = await ordre('anatomie_couches', { niveau: 'profonde' }); const n3 = await vis(); await attendre(900); await page.screenshot({ path: SORTIE + 'muscles-profonds.png' });
r = await ordre('anatomie_couches', { niveau: 'toutes' }); const n4 = await vis();
nom('couches de muscles : toutes (' + n1 + ') > sans superficielle (' + n2 + ') > profonde seule (' + n3 + ') ; retour à toutes', n1 > n2 && n2 > n3 && n3 > 0 && n4 === n1, [n1, n2, n3, n4].join('/'));
r = await ordre('anatomie_cotation'); nom('échelle de cotation musculaire rappelée', r.ok && /Lovett/.test(r.texte) && /cours/.test(r.texte), r.texte);
// ── S4 : circulation, cerveau, nerfs crâniens, animation de flux
await G(() => window.Saturne.anatomieObjet().toutAfficher());
for (const sys of ['arteres', 'veines', 'cerveau', 'nerfs', 'coeur']) { r = await ordre('afficher_systeme', { systeme: sys }); nom('système « ' + sys + ' » chargé', r.ok, JSON.stringify(r)); }
e = await G(() => window.Saturne.anatomieObjet().etatPublic());
nom('artères, veines, encéphale, nerfs crâniens et cœur sont dans la scène', ['arteres', 'veines', 'cerveau', 'nerfs', 'coeur'].every(x => e.chargés.includes(x)), e.chargés.join());
r = await ordre('decrire', { nom: 'artère fémorale gauche' });
nom('« décris l’artère fémorale gauche » : origine, trajet, territoire, rappel de vérifier', r.ok && /Origine/.test(r.texte) && /Territoire/.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 130));
r = await ordre('decrire', { nom: 'hippocampe gauche' }); nom('« décris l’hippocampe » : rôle et situation', r.ok && /Rôle/.test(r.texte) && /mémoire/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 130));
await attendre(800); await page.screenshot({ path: SORTIE + 'hippocampe.png' });
const pixels = async () => page.screenshot({ type: 'jpeg', quality: 60, clip: { x: 500, y: 150, width: 600, height: 500 } });
const diffPix = (A, B) => { let d = 0; const n = Math.min(A.length, B.length); for (let i = 0; i < n; i += 7) d += Math.abs(A[i] - B[i]); return d / (n / 7); };
await ordre('anatomie_tout'); await attendre(2200);
const f0 = await pixels(); await attendre(130); const f1 = await pixels(); const sansFlux = diffPix(f0, f1);
r = await ordre('anatomie_flux', { etat: 'oui' }); nom('ordre « anime la circulation »', r.ok && /illustration/.test(r.texte) && (await G(() => window.Saturne.anatomieObjet().etatPublic().flux)), JSON.stringify(r).slice(0, 160));
await attendre(1500); await page.screenshot({ path: SORTIE + 'circulation.png' });
const prog = await G(() => { const a = window.Saturne.anatomieObjet(); const mats = new Set(); a.racine.traverse(o => { if (o.isMesh) mats.add(o.material); }); let n = 0, on = 0; for (const m of mats) if (m.userData.fluxSys) { n++; if (m.onBeforeCompile) on++; } return { n, on, flux: a.etatPublic().flux }; });
nom('matériaux animés (artères, veines, nerfs, cerveau, cœur) : ' + prog.n, prog.n >= 5 && prog.on === prog.n && prog.flux, JSON.stringify(prog));
const erreursGL = erreurs.filter(x => /shader|GLSL|WebGL: INVALID|program/i.test(x)); nom('aucune erreur de nuanceur', erreursGL.length === 0, erreursGL.slice(0, 2).join(' | '));
r = await ordre('anatomie_flux', { etat: 'non' }); nom('arrêt de l’animation', r.ok && !(await G(() => window.Saturne.anatomieObjet().etatPublic().flux)));
await G(() => window.Saturne.anatomieObjet().toutAfficher()); await ordre('anatomie_montrer', { nom: 'cervelet' }); await attendre(900); await page.screenshot({ path: SORTIE + 'cervelet.png' });
// ── S5 : mouvements
await G(() => window.Saturne.anatomieObjet().toutAfficher());
r = await ordre('animer', { mouvement: 'la marche' });
nom('ordre « montre la marche » : explication avec agonistes, antagonistes et rappel de vérifier', r.ok && /Agonistes en rouge/.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 140));
await attendre(1800);
nom('les muscles agonistes sont teintés (rouge) et les antagonistes (bleu)', await G(() => { const a = window.Saturne.anatomieObjet(); let ago = 0, ant = 0; for (const ms of a.etat.meshs.values()) for (const m of ms) if (m.userData.role) { if (m.userData.role[0] > 0.9) ago++; else ant++; } return ago > 5 && ant > 2; }));
for (const mid of ['flexion_genou', 'abduction_epaule', 'accroupissement', 'flexion_coude']) { await G(m => window.Saturne.anatomieObjet().mouvement().lancer(m), mid); await attendre(1100); await page.screenshot({ path: SORTIE + 'mvt-' + mid + '.png' }); }
await ordre('anatomie_mouvement_stop');
r = await ordre('animer', { mouvement: 'danse du ventre' }); nom('mouvement inconnu : refus honnête', !r.ok && /ne connais pas/.test(r.erreur), JSON.stringify(r));
// ── S6 : pathologies et orthopédie
await G(() => window.Saturne.anatomieObjet().toutAfficher());
const patho = (nomP, extra = {}) => ordre('afficher_pathologie', { nom: nomP + (extra.valeur ? ' de ' + extra.valeur + ' degrés' : '') });
r = await patho('scoliose', { valeur: 40 });
nom('scoliose de 40° : angle de Cobb mesuré sur le modèle, avertissement pédagogique', r.ok && /40\.\d degrés/.test(r.texte) && /pas un outil de diagnostic/.test(r.texte), (r.texte || r.erreur || '').slice(0, 150));
await attendre(1200); await page.screenshot({ path: SORTIE + 'scoliose-40.png' });
let d = await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail());
nom('la scoliose déplace des vertèbres et des côtes (' + d.spine + ' pièces) et trace les lignes de Cobb', d.spine > 40 && d.lignesCobb, JSON.stringify(d));
const ecart = await G(() => { const a = window.Saturne.anatomieObjet(), id = a.index.pieces.find(p => /^Eighth thoracic vertebra/i.test(p.nom_en)).id, m = a.etat.meshs.get(id)[0]; return Math.abs(m.matrix.elements[12] - m.userData.m0.elements[12]); });
nom('la vertèbre du sommet est décalée latéralement (' + (ecart * 1000).toFixed(0) + ' mm de plus que la pose normale)', ecart > 0.01, ecart);
r = await patho('cyphose', { valeur: 65 }); nom('hypercyphose de 65° : Cobb sagittal mesuré', r.ok && /65\.\d degrés/.test(r.texte), (r.texte || '').slice(0, 100)); await attendre(900); await page.screenshot({ path: SORTIE + 'cyphose-65.png' });
for (const [id, label] of [['transtibiale', 'amputation transtibiale'], ['transfemorale', 'amputation transfémorale'], ['syme', 'amputation de Syme'], ['desarticulation_hanche', 'désarticulation de hanche'], ['transhumerale', 'amputation transhumérale']]) {
  r = await patho(id); d = await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail()); await attendre(900); await page.screenshot({ path: SORTIE + 'amputation-' + id + '.png' });
  nom(label + ' : pièces enlevées (' + d.cachees + '), moignon, appareillage et rappel de vérifier', r.ok && d.cachees > 10 && /Appareillage/.test(r.texte) && /vérifier/i.test(r.texte), (r.texte || r.erreur || '').slice(0, 120));
}
r = await patho('transtibiale'); nom('transtibiale : longueur du moignon donnée d’après le modèle', /centimètres sous l’interligne du genou/.test(r.texte), (r.texte || '').slice(0, 220));
const clipTib = await G(() => { const a = window.Saturne.anatomieObjet(); const id = a.index.pieces.find(p => /^Right tibia$/i.test(p.nom_en)).id, m = a.etat.meshs.get(id)[0]; return { cs: m.material.__clip && m.material.__clip.uCs.value, visible: m.visible }; });
nom('le tibia droit est coupé par un plan local (et reste visible)', clipTib.cs === 1 && clipTib.visible, JSON.stringify(clipTib));
r = await patho('fracture du col du fémur'); d = await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail()); await attendre(900); await page.screenshot({ path: SORTIE + 'fracture-col-femur.png' });
nom('fracture du col du fémur : deux fragments, Garden, rappel de diagnostic', r.ok && d.fragments === 1 && /Garden/.test(r.texte) && /pas un outil de diagnostic/.test(r.texte), JSON.stringify(d));
r = await patho('pouteau-colles'); await attendre(900); await page.screenshot({ path: SORTIE + 'fracture-poignet.png' }); nom('fracture de Pouteau-Colles', r.ok && /dos de fourchette/.test(r.texte));
r = await patho('genu valgum'); nom('genu valgum : déviation mesurée en valgus sur le modèle', r.ok && /valgus/.test(r.texte) && /degrés/.test(r.texte), JSON.stringify(r).slice(0, 300)); await attendre(900); await page.screenshot({ path: SORTIE + 'genu-valgum.png' });
r = await patho('genu varum'); nom('genu varum : déviation en varus', /varus/.test(r.texte || ''), r.mesure);
r = await patho('pied tombant'); nom('pied tombant : orthèse releveur dans la prise en charge', r.ok && /releveur/i.test(r.texte)); await attendre(700); await page.screenshot({ path: SORTIE + 'pied-tombant.png' });
r = await patho('hémimélie fibulaire'); d = await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail()); nom('hémimélie fibulaire (ISO 8548-1) : la fibula droite est absente', r.ok && d.cachees === 1 && /ISO 8548-1/.test(r.texte), JSON.stringify(d));
r = await ordre('anatomie_pathologie_stop'); d = await G(() => window.Saturne.anatomieObjet().pathologiesObjet().detail());
nom('retour à l’anatomie normale', r.ok && d.cachees === 0 && d.fragments === 0 && d.spine === 0 && !d.actif, JSON.stringify(d));
r = await patho('maladie imaginaire'); nom('cas inconnu : refus honnête', !r.ok && /ne connais pas/.test(r.erreur), JSON.stringify(r));
const mem = await G(() => window.Saturne.modeles.etat());
nom('mémoire des modèles sous le plafond (' + mem.totalMo + ' Mo)', mem.totalMo < 480, JSON.stringify(mem).slice(0, 200));

// ── images/s dans la salle avec squelette + muscles
const fps = await G(async () => new Promise(res => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(n / 3); }; requestAnimationFrame(f); }));
console.log('images/s (salle, os + muscles) :', fps.toFixed(1));
nom('images/s ≥ 30 dans la salle avec os et muscles', fps >= 30, fps.toFixed(1));

await G(() => window.Saturne.sortir()); await attendre(1500);
const ex = erreurs.filter(x => !/faireconomy|404|408|ERR_FAILED|CONNECTION_REFUSED|CORS|Failed to load resource|GPU stall/.test(x));
nom('aucune erreur de page', ex.length === 0, ex.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(c.fin() ? 1 : 0);
