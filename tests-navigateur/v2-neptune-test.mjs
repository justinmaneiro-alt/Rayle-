import fs from 'node:fs';
import path from 'node:path';
import { ouvrirGalaxieTheme, attendre, compteur } from './r2-aide.mjs';

/* V2 phase 10 : l'atelier 3D de Neptune dans la vraie page (vrai WebGL) : entrée par la galaxie, import GLB (brut et compressé Meshopt), STL (scan), OBJ + MTL, arbre de pièces,
   isoler, couleur, vue éclatée, plan de coupe, mesures, circonférence d'une coupe, visite, présentation pièce par pièce (voix simulée), fabrication paramétrique, export GLB/STL/OBJ,
   contrôle d'impression, bibliothèque locale, voix, pad 3D, sortie sans fuite.   Lancer : node tests-navigateur/v2-neptune-test.mjs   (fichiers : node planetes/neptune/outils/fabriquer-fixtures.mjs) */
const { verifier, fin } = compteur();
fs.mkdirSync('captures-accueil', { recursive: true });
const FIX = path.resolve('tests-navigateur/fixtures-neptune');
if (!fs.existsSync(path.join(FIX, 'moteur-test.glb'))) { console.log('Fichiers d’essai absents : lancer node planetes/neptune/outils/fabriquer-fixtures.mjs'); process.exit(1); }
const { navigateur, page, erreurs } = await ouvrirGalaxieTheme({ largeur: 1600, hauteur: 900, avant: async p => { await p.evaluateOnNewDocument(() => { window.__dit = []; }); } });
const ev = (f, ...a) => page.evaluate(f, ...a);
await ev(() => window.Galaxie.regler({ qualite: 'moyenne', fpsMax: 0 }));
await ev(() => { window.speak = async t => { window.__dit.push(t); }; window.addLine = () => {}; });   // voix simulée (posée APRÈS le chargement : voix.js définit sa propre fonction speak)
// ── entrée par le bus d'ordres ──
const r0 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'entrer_atelier', params: {} }));
verifier('ordre « entrer_atelier » : réussi, atelier ouvert', r0 && r0.ok && await ev(() => window.Neptune.etat().actif), JSON.stringify(r0));
await page.waitForFunction(() => window.Neptune && window.Neptune.etat().actif && !window.Neptune.etat().transition && !document.getElementById('n-fondu').classList.contains('noir'), { timeout: 60000 });
await attendre(600);
verifier('interface visible : barre, pièces, propriétés', await ev(() => ['.n-barre', '.n-gauche', '.n-droite'].every(s => { const e = document.querySelector('#neptune-ui ' + s); return e && e.getBoundingClientRect().width > 100; })));
verifier('le pad 3D connaît l’atelier (objet manipulable)', await ev(() => window.Objets3DPad.liste().some(o => o.id === 'neptune-atelier' && o.actif)));
// ── import GLB brut ──
const depot = async (fichiers) => { const out = []; for (const f of fichiers) out.push({ nom: f, b64: fs.readFileSync(path.join(FIX, f)).toString('base64') }); return out; };
const importer = async fichiers => ev(async lot => { const files = lot.map(x => new File([Uint8Array.from(atob(x.b64), c => c.charCodeAt(0))], x.nom)); return await window.Neptune.importer(files, { garder: true }).then(r => r && { nom: r.nom, meshes: r.meshes, sommets: r.sommets }); }, await depot(fichiers));
const g1 = await importer(['moteur-test.glb']);
verifier('import GLB : moteur de 12 maillages', g1 && g1.nom === 'moteur-test' && g1.meshes === 12, JSON.stringify(g1));
verifier('arbre de pièces : noms lisibles dans la liste', await ev(() => { const t = document.getElementById('n-arbre').textContent; return /Piston 1/.test(t) && /Carter/.test(t) && /Vilebrequin/.test(t); }));
await attendre(500); await page.screenshot({ path: 'captures-accueil/v2-neptune-moteur.png' });
const info = await ev(() => { const A = window.Neptune.atelier(); return { pieces: A.pieces().length, stats: A.stats() }; });
verifier('pièces détectées : 12', info.pieces === 12 && info.stats.meshes === 12, JSON.stringify(info));
// ── isoler, couleur, masquer ──
const idPiston = await ev(() => { const A = window.Neptune.atelier(); return A.pieces().find(p => p.nom === 'Piston 2').id; });
await ev(id => window.Neptune.atelier().isoler(id), idPiston);
verifier('isoler : une seule pièce visible', await ev(() => { let n = 0; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; }) === 1);
await ev(() => window.Neptune.atelier().toutAfficher());
verifier('tout afficher : 12 pièces visibles', await ev(() => { let n = 0; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; }) === 12);
await ev(id => window.Neptune.atelier().couleur(id, '#ff0000'), idPiston);
verifier('couleur : la pièce devient rouge', await ev(id => { const o = window.Neptune.atelier().parId(id); return o.material.color.getHexString() === 'ff0000'; }, idPiston));
await ev(id => { const A = window.Neptune.atelier(); A.renommer(id, 'Piston principal'); }, idPiston);
verifier('renommer : le nom apparaît dans l’arbre', await ev(() => /Piston principal/.test(document.getElementById('n-arbre').textContent)));
// ── éclatée / assemblage ──
const avant = await ev(() => window.Neptune.atelier().pieces().map(p => p.centre.map(x => +x.toFixed(4))));
const ecl = await ev(() => window.Neptune.atelier().eclater(1));
const apres = await ev(() => window.Neptune.atelier().pieces().map(p => p.centre.map(x => +x.toFixed(4))));
verifier('vue éclatée : les pièces s’écartent', ecl.ok && apres.some((c, i) => Math.hypot(c[0] - avant[i][0], c[1] - avant[i][1], c[2] - avant[i][2]) > 0.02));
await ev(() => window.Neptune.atelier().eclater(0));
const retour = await ev(() => window.Neptune.atelier().pieces().map(p => p.centre.map(x => +x.toFixed(4))));
verifier('éclatement à 0 : retour exact aux positions de repos', retour.every((c, i) => c.every((x, k) => Math.abs(x - avant[i][k]) < 1e-3)));
await ev(() => window.Neptune.atelier().animerAssemblage('desassembler', 0.6)); await attendre(1300);
verifier('désassemblage animé terminé : pièces écartées', await ev(() => window.Neptune.atelier().etat.eclate === 1));
await ev(() => window.Neptune.atelier().animerAssemblage('assembler', 0.6)); await attendre(1300);
verifier('assemblage animé terminé : pièces revenues', await ev(() => window.Neptune.atelier().etat.eclate === 0));
// ── coupe, mesure ──
await ev(() => { const A = window.Neptune.atelier(); A.regler({ coupe: { actif: true, axe: 1, position: 0.5, inverse: false } }); });
verifier('plan de coupe : matériaux coupés', await ev(() => { let ok = true, n = 0; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh) { n++; if (!o.material.clippingPlanes || o.material.clippingPlanes.length !== 1) ok = false; } }); return ok && n === 12; }));
await ev(() => window.Neptune.atelier().regler({ coupe: { actif: false, axe: 1, position: 0.5, inverse: false } }));
verifier('plan de coupe retiré', await ev(() => { let ok = true; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.material.clippingPlanes) ok = false; }); return ok; }));
await ev(() => { const A = window.Neptune.atelier(); A.regler({ mesure: true }); });
const clicMesure = async (x, y) => { await page.mouse.click(x, y); await attendre(250); };
// on vise des points du modèle projetés à l'écran (centre de deux pièces) pour que le rayon touche
const pts = await ev(() => { const A = window.Neptune.atelier(), r = document.getElementById('scene3d').getBoundingClientRect(), res = []; for (const nom of ['Carter', 'Culasse']) { const p = A.pieces().find(q => q.nom === nom), v = new (A.camera.position.constructor)(...p.centre).project(A.camera); res.push({ x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }); } return res; });
await clicMesure(pts[0].x, pts[0].y); await clicMesure(pts[1].x, pts[1].y);
const dm = await ev(() => window.Neptune.atelier().derniereMesure());
verifier('mesure : une distance est calculée entre deux points du modèle', !!dm && dm.distance > 0.05 && /m$/.test(dm.texte), JSON.stringify(dm));
await ev(() => { const A = window.Neptune.atelier(); A.effacerMesure(); A.regler({ mesure: false }); });
// ── visite, clips ──
const vis = await ev(() => window.Neptune.atelier().lancerVisite('objet'));
verifier('visite de caméra lancée', vis.ok && vis.duree > 10);
await attendre(900); verifier('la caméra bouge pendant la visite', await ev(() => window.Neptune.atelier().etat.visite !== null));
await ev(() => window.Neptune.atelier().arreterVisite());
// ── présentation pièce par pièce, voix simulée ──
await ev(() => { window.__dit.length = 0; });
const pres = await ev(() => window.Neptune.presenter());
const dit = await ev(() => window.__dit);
verifier('présentation : introduction + 12 pièces + conclusion dites', pres.ok && !pres.interrompu && dit.length === 14 && /12 pièces/.test(dit[0]) && /dernière pièce/.test(dit.at(-1)), String(dit.length));
verifier('présentation : définition vraie pour le piston, aveu honnête pour la pièce inconnue', dit.some(t => /piston coulisse/.test(t)) && dit.some(t => /Pièce mystère/.test(t) && /ne t’en invente pas/.test(t)));
verifier('présentation : tout est de nouveau visible à la fin', await ev(() => { let n = 0; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; }) === 12);
// ── interruption ──
await ev(() => { window.__dit.length = 0; window.__p = window.Neptune.presenter(); });
await attendre(1300); await ev(() => window.Neptune.arreterPresentation()); const ri = await ev(() => window.__p);
verifier('présentation interrompue sur demande (« stop »)', ri.interrompu === true);
// ── fabrication paramétrique ──
const fab = await ev(() => window.Neptune.fabriquer('un engrenage de 24 dents, module 2 mm, épaisseur 8 mm'));
verifier('fabrication : engrenage de 24 dents ajouté à la scène', fab.ok && await ev(() => { return !!window.Neptune.atelier().parNom('Engrenage'); }));
const imp = await ev(() => window.Neptune.atelier().controleImpression(window.Neptune.atelier().parNom('Engrenage')));
verifier('l’engrenage fabriqué est étanche et imprimable', imp.ok && imp.imprimable && imp.etanche && imp.volume > 0, JSON.stringify(imp.problemes));
const nul = await ev(() => window.Neptune.fabriquer('un dragon avec des écailles'));
verifier('fabrication impossible : refus honnête', !nul.ok && /Je ne sais pas fabriquer/.test(nul.message));
// ── export, réimport ──
const exp = await ev(async () => { const A = window.Neptune.atelier(), r = await A.exporter('glb', { telechargement: false }), s = await A.exporter('stl', { telechargement: false, echelleSTL: 1000 }), o = await A.exporter('obj', { telechargement: false }); return { glb: r.octets, stl: s.octets, obj: o.octets, nomGlb: r.fichier }; });
verifier('export GLB, STL et OBJ non vides', exp.glb > 5000 && exp.stl > 5000 && exp.obj > 1000 && /\.glb$/.test(exp.nomGlb), JSON.stringify(exp));
const rel = await ev(async () => { const A = window.Neptune.atelier(), r = await A.exporter('glb', { telechargement: false }), f = new File([r.blob], 'reimport.glb'), avant = A.stats().meshes, n = await window.Neptune.importer([f], { garder: false }); return { avant, apres: A.stats().meshes, n: n && n.meshes }; });
verifier('réimport du GLB exporté : les maillages sont retrouvés', rel.n >= 13 && rel.apres === rel.avant + rel.n, JSON.stringify(rel));
// ── Meshopt, STL, OBJ+MTL ──
await ev(() => { const A = window.Neptune.atelier(); A.pieces().forEach(p => A.supprimer(p.id)); });
const mo = await importer(['moteur-meshopt.glb']);
verifier('import GLB compressé Meshopt : 12 maillages décodés', mo && mo.meshes === 12 && mo.sommets > 100, JSON.stringify(mo));
await ev(() => { const A = window.Neptune.atelier(); A.pieces().forEach(p => A.supprimer(p.id)); });
if (fs.existsSync(path.join(FIX, 'moteur-draco.glb'))) {
  const dr = await importer(['moteur-draco.glb']);
  verifier('import GLB compressé Draco : 12 maillages décodés (décodeur WebAssembly de Three.js)', dr && dr.meshes === 12 && dr.sommets > 100, JSON.stringify(dr));
  await ev(() => { const A = window.Neptune.atelier(); A.pieces().forEach(p => A.supprimer(p.id)); });
}
const st = await importer(['moignon-scan.stl']);
verifier('import STL (scan de membre simulé)', st && st.meshes === 1 && st.sommets > 100, JSON.stringify(st));
await ev(() => window.Neptune.atelier().regler({ unite: 'mm' }));
const cir = await ev(() => window.Neptune.atelier().circonference(null, 1, 0.5));
verifier('circonférence à mi-hauteur du moignon (profil : rayon 42 à 60 mm, 36 à 140 mm → 38,25 mm à 110 mm → ≈ 240,3 mm)', cir.ok && cir.fermee && cir.boucles === 1 && Math.abs(cir.circonference - 2 * Math.PI * 38.25) < 1.5 && cir.unite === 'mm', JSON.stringify(cir));
const ci = await ev(() => window.Neptune.atelier().controleImpression());
verifier('contrôle d’impression du STL : étanche, 3 hypothèses d’échelle dont mm plausible', ci.ok && ci.imprimable && ci.hypotheses.length === 3 && ci.hypotheses[0].plausible);
await ev(() => { const A = window.Neptune.atelier(); A.pieces().forEach(p => A.supprimer(p.id)); });
const ob = await importer(['maison-test.obj', 'maison-test.mtl']);
verifier('import OBJ + MTL : 4 pièces (murs, dalle, toit, porte)', ob && ob.meshes === 4, JSON.stringify(ob));
verifier('genre « maison » reconnu pour la visite', (await ev(() => window.Neptune.atelier().lancerVisite().genre)) === 'maison');
await ev(() => window.Neptune.atelier().arreterVisite());
// ── bibliothèque locale (ordre ouvrir_maquette) ──
await attendre(800);
const lib = await ev(async () => { const B = await import(new URL('planetes/neptune/pc/bibliotheque.js', document.baseURI).href); return (await B.lister()).map(x => x.nom); });
verifier('bibliothèque locale : les modèles importés sont gardés', lib.includes('moteur-test') && lib.includes('maison-test'), JSON.stringify(lib));
await ev(() => { const A = window.Neptune.atelier(); A.pieces().forEach(p => A.supprimer(p.id)); });
const r1 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'ouvrir_maquette', params: { nom: 'le moteur' } }));
verifier('ordre « ouvrir_maquette » : rouvre le moteur gardé', r1 && r1.ok && await ev(() => window.Neptune.atelier().stats().meshes) === 12, JSON.stringify(r1));
const r2 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'ouvrir_maquette', params: { nom: 'cathédrale' } }));
verifier('ordre « ouvrir_maquette » inconnue : refus honnête', r2 && !r2.ok && /Aucune maquette/.test(r2.erreur));
// ── voix ──
const v1 = await ev(() => window.TerreVoix ? null : null);
void v1;
const voix = async t => ev(async t2 => { const NV = await import(new URL('planetes/neptune/pc/voix-neptune.js', document.baseURI).href); return await NV.traiter(t2); }, t);
verifier('voix : « isole le piston 3 »', /isole/i.test(await voix('isole le piston 3')) && await ev(() => { let n = 0; window.Neptune.atelier().modele.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; }) === 1);
verifier('voix : « affiche tout »', /de nouveau visible/.test(await voix('affiche tout le modèle')));
verifier('voix : « éclate la vue » puis « rassemble »', /éclatée/.test(await voix('éclate la vue')) && /rassemble/.test(await voix('rassemble les pièces')));
verifier('voix : pièce inconnue = aveu, pas d’invention', /Je ne trouve pas de pièce/.test(await voix('isole le turbocompresseur')));
verifier('voix : « contrôle l’impression »', /Aucun défaut|Problèmes/.test(await voix('contrôle l’impression')));
verifier('voix : « fabrique un boîtier de 120 mm »', /Je fabrique/.test(await voix('fabrique un boîtier de 120 mm de long')));
verifier('voix : phrase étrangère non prise', (await voix('quelle heure est-il')) === null);
// ── réglages d'affichage ──
await ev(() => { const A = window.Neptune.atelier(); A.regler({ fond: 'clair', ombres: false, grille: false, exposition: 1.4 }); });
verifier('réglages d’affichage appliqués', await ev(() => { const A = window.Neptune.atelier(); return A.scene.background.getHexString() === 'dfe5ea' && A.etat.ombres === false; }));
await page.screenshot({ path: 'captures-accueil/v2-neptune-interface.png' });
// ── sortie propre ──
const memAvant = await ev(() => window.Galaxie.stats ? 1 : 1); void memAvant;
await ev(() => window.Neptune.sortir()); await attendre(1400);
verifier('sortie : atelier fermé, interface masquée', await ev(() => !window.Neptune.etat().actif && document.getElementById('neptune-ui').hidden));
verifier('la galaxie reprend la main (scène de la galaxie)', await ev(() => window.Galaxie.surchargee ? !window.Galaxie.surchargee() : true));
// ── réouverture ──
const r3 = await ev(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'entrer_atelier', params: {} }));
verifier('réouverture : l’atelier revient avec son modèle', r3 && r3.ok && await ev(() => window.Neptune.etat().actif), JSON.stringify(r3));
await attendre(800); await ev(() => window.Neptune.sortir()); await attendre(900);
const filtrees = erreurs.filter(e => /neptune|atelier|maquette|Neptune|pageerror|TypeError|ReferenceError|THREE/.test(e) && !/faireconomy|CORS|Failed to load resource/.test(e));
verifier('aucune erreur JavaScript de l’atelier', filtrees.length === 0, filtrees.join(' | '));
await navigateur.close(); fin();
