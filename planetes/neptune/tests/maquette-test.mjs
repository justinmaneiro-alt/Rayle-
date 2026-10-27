// Tests des calculs de l'atelier 3D de Neptune (phase 10). Lancer : node planetes/neptune/tests/maquette-test.mjs
import * as M from '../pc/maquette-calcul.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const proche = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ── volumes et étanchéité des formes de base (valeurs analytiques) ──
const boite = M.formeBoite(1, 2, 3), sb = M.statsMaillage(boite);
v('boîte 1×2×3 : volume 6, surface 22, étanche', proche(sb.volume, 6) && proche(sb.surface, 22) && sb.etanche && sb.triangles === 12);
const cyl = M.statsMaillage(M.formeCylindre(1, 2, 128)), sph = M.statsMaillage(M.formeSphere(1, 64)), tore = M.statsMaillage(M.formeTore(2, 0.5, 96, 48));
v('cylindre r1 h2 : volume ≈ 2π', proche(cyl.volume, 2 * Math.PI, 0.01) && cyl.etanche);
v('sphère r1 : volume ≈ 4π/3', proche(sph.volume, 4 * Math.PI / 3, 0.02) && sph.etanche);
v('tore R2 r0,5 : volume ≈ 2π²·R·r²', proche(tore.volume, 2 * Math.PI ** 2 * 2 * 0.25, 0.02) && tore.etanche);
const formes = { cone: M.formeCone(1, 2), tube: M.formeTube(1, 0.8, 2), engrenage: M.formeEngrenage({ dents: 16 }), boitier: M.formeBoitier(), coque: M.formeCoque(), mat: M.formeMat(), casque: M.formeCasque(), plastron: M.formePlastron(), brassard: M.formeBrassard() };
for (const [k, f] of Object.entries(formes)) { const s = M.statsMaillage(f); v('forme « ' + k + ' » : étanche, orientée vers l’extérieur (volume > 0)', s.etanche && s.volumeSigne > 0 && !s.normalesInversees, JSON.stringify({ o: s.aretesOuvertes, i: s.aretesIncoherentes, vol: s.volumeSigne })); }
v('tube : volume = π(R²−r²)h', proche(M.statsMaillage(M.formeTube(1, 0.8, 2, 128)).volume, Math.PI * (1 - 0.64) * 2, 0.01));
v('boîtier : volume = extérieur − cavité', proche(M.statsMaillage(M.formeBoitier({ l: 0.1, h: 0.05, p: 0.07, paroi: 0.003 })).volume, 0.1 * 0.05 * 0.07 - 0.094 * 0.047 * 0.064, 0.01));
v('engrenage : le nombre de dents change la taille', M.statsMaillage(M.formeEngrenage({ dents: 40 })).boite.dim[0] > M.statsMaillage(M.formeEngrenage({ dents: 12 })).boite.dim[0] * 2.5);

// ── contrôle d’impression ──
const troue = { positions: boite.positions, index: boite.index.slice(0, 33) };
const rt = M.verifierImpression(troue);
v('maillage troué : non imprimable, arêtes ouvertes signalées en français', !rt.imprimable && rt.problemes.some(p => /ouverte/.test(p)) && /parois trop fines/.test(rt.note));
const retourne = M.transformer(boite, { echelle: [-1, 1, 1] });
v('miroir : normales corrigées (le volume reste positif)', M.statsMaillage(retourne).volumeSigne > 0 && M.statsMaillage(retourne).etanche);
const permut = Uint32Array.from(boite.index); for (let t = 0; t < permut.length; t += 3) { const x = permut[t + 1]; permut[t + 1] = permut[t + 2]; permut[t + 2] = x; }
v('normales intérieures détectées', M.verifierImpression({ positions: boite.positions, index: permut }).problemes.some(p => /négatif|retourn/.test(p)));
v('boîte 1×2×3 : imprimable', M.verifierImpression(boite).imprimable);
const soudure = M.statsMaillage(M.fusionner([M.formeBoite(1, 1, 1), M.formeBoite(1, 1, 1)]));
v('sommets coïncidents soudés avant le comptage', M.statsMaillage(M.formeBoite(1, 1, 1)).sommetsSoudes === 8 && soudure.sommets === 16);
const hyp = M.hypothesesEchelle(M.formeBoite(50, 30, 20));
v('hypothèses d’échelle : mm, cm, m ; volume en cm³', hyp.length === 3 && proche(hyp[0].volume_cm3, 30, 0.01) && hyp[0].plausible && !hyp[2].plausible);

// ── mesures : coupe d’un cylindre = cercle ──
const c = M.coupe(M.formeCylindre(0.05, 0.4, 96), 1, 0.05);
v('coupe d’un cylindre (scan simplifié) : 1 boucle fermée, circonférence ≈ 2πr, aire ≈ πr²', c.nbBoucles === 1 && c.tousFermes && proche(c.longueurContour, 2 * Math.PI * 0.05, 0.01) && proche(c.aire, Math.PI * 0.05 ** 2, 0.02), JSON.stringify({ n: c.nbBoucles, l: c.longueurContour, a: c.aire }));
v('coupe hors du solide : vide', M.coupe(M.formeCylindre(0.05, 0.4), 1, 5).vide);
v('coupe du tube : 2 boucles (paroi)', M.coupe(M.formeTube(1, 0.8, 2, 64), 1, 0).nbBoucles === 2);
v('distance', proche(M.distance([0, 0, 0], [3, 4, 0]), 5));

// ── STL / OBJ ──
const bin = M.exporterSTLBinaire(boite), relu = M.lireSTL(bin);
v('STL binaire : taille 84 + 50·n, relecture identique (volume)', bin.length === 84 + 50 * 12 && proche(M.statsMaillage({ positions: relu.positions }).volume, 6));
const asc = M.exporterSTLAscii(boite), relu2 = M.lireSTL(new TextEncoder().encode(asc));
v('STL ASCII : relecture identique', /^solid/.test(asc) && proche(M.statsMaillage({ positions: relu2.positions }).volume, 6));
v('STL : échelle d’export (m → mm)', proche(M.statsMaillage({ positions: M.lireSTL(M.exporterSTLBinaire(boite, { echelle: 1000 })).positions }).volume, 6e9, 0.01));
const obj = M.exporterOBJ(boite, { nom: 'ma boîte' });
v('OBJ : 8 sommets, 12 faces, indices à partir de 1', (obj.match(/^v /gm) || []).length === 8 && (obj.match(/^f /gm) || []).length === 12 && obj.split('\n').filter(l => l[0] === 'f').every(l => l.split(' ').slice(1).every(x => +x >= 1)));
v('STL binaire tronqué refusé', (() => { try { M.lireSTL(bin.slice(0, 200)); return false; } catch (e) { return true; } })());

// ── vue éclatée ──
const pieces = [{ id: 'a', centre: [-1, 0, 0], rayon: 0.5 }, { id: 'b', centre: [1, 0, 0], rayon: 0.5 }, { id: 'c', centre: [0, 1, 0], rayon: 0.3 }];
const ex = M.exploser(pieces, 1);
v('éclatée : chaque pièce s’éloigne du centre dans sa direction', ex.get('a')[0] < 0 && ex.get('b')[0] > 0 && ex.get('c')[1] > 0);
v('éclatée : facteur 0 = aucun déplacement', [...M.exploser(pieces, 0).values()].every(d => d.every(x => x === 0)));
v('éclatée : pièce au centre → poussée vers le haut (pas de NaN)', M.exploser([{ id: 'z', centre: [0, 0, 0], rayon: 1 }], 1).get('z').every(Number.isFinite));

// ── visite pièce par pièce ──
v('nom lisible', M.nomLisible('Piston_01.001') === 'Piston' && M.nomLisible('Vilebrequin') === 'Vilebrequin' && M.nomLisible('') === 'Pièce sans nom');
v('glossaire : piston, mât, plastron définis ; pièce inconnue = aucune définition inventée', M.definition('Piston_2') && M.definition('grand-voile') && M.definition('Plastron') && M.definition('xyz_42') === null);
v('texte d’une pièce inconnue : dit qu’il n’invente pas', /ne t’en invente pas/.test(M.textePiece({ nom: 'xyz_42' }, 0, 3)));
v('texte d’une pièce connue : définition + dimensions en cm', (t => /Pièce 2 sur 5/.test(t) && /piston coulisse/.test(t) && /8 sur 4 sur 4 centimètres/.test(t))(M.textePiece({ nom: 'Piston', boite: { dim: [80, 40, 40] } }, 1, 5, { unite: 'mm' })));
v('ordre : grosses pièces d’abord', M.ordrePresentation([{ nom: 'a', volume: 1 }, { nom: 'b', volume: 9 }, { nom: 'c', volume: 4 }]).map(p => p.nom).join('') === 'bca');
v('intro de visite', /3 pièces/.test(M.introPresentation('moteur_v8', 3)));

// ── visites de caméra ──
const bb = { min: [-5, 0, -3], max: [5, 4, 3], dim: [10, 4, 6], centre: [0, 2, 0] };
v('genre depuis le nom', M.genreDepuisNom('maison_moderne.glb') === 'maison' && M.genreDepuisNom('Voilier XVIII') === 'bateau' && M.genreDepuisNom('moteur') === 'objet');
for (const g of ['maison', 'bateau', 'objet']) { const pts = M.visiteCamera(bb, g); v('visite « ' + g + ' » : points valides, durée > 0', pts.length >= 8 && pts.every(p => p.pos.every(Number.isFinite) && p.cible.every(Number.isFinite)) && M.dureeTrajet(pts) > 10); }
const trajet = M.visiteCamera(bb, 'objet'), e0 = M.echantillonnerTrajet(trajet, 0), e1 = M.echantillonnerTrajet(trajet, 1), em = M.echantillonnerTrajet(trajet, 0.5);
v('trajet : départ et arrivée sur les points, continuité', M.distance(e0.pos, trajet[0].pos) < 1e-6 && M.distance(e1.pos, trajet.at(-1).pos) < 1e-6 && em.pos.every(Number.isFinite));

// ── animation ──
const piste = { cible: 'a', propriete: 'position', cles: [{ t: 0, v: [0, 0, 0] }, { t: 2, v: [10, 0, 0], ease: 'lineaire' }] };
v('image clé : interpolation linéaire et bornes', M.evaluerPiste(piste, 1)[0] === 5 && M.evaluerPiste(piste, -1)[0] === 0 && M.evaluerPiste(piste, 9)[0] === 10);
const decal = new Map([['a', [2, 0, 0]], ['b', [-2, 0, 0]]]), repos = new Map([['a', [0, 0, 0]], ['b', [1, 0, 0]]]);
const ass = M.pistesAssemblage(decal, repos, { sens: 'assembler', duree: 3 }), des = M.pistesAssemblage(decal, repos, { sens: 'desassembler', duree: 3 });
v('assemblage : de la position éclatée vers le repos', M.evaluerPiste(ass[0], 0)[0] === 2 && M.evaluerPiste(ass[0], 99)[0] === 0 && M.evaluerPiste(ass[1], 99)[0] === 1);
v('désassemblage : du repos vers la position éclatée', M.evaluerPiste(des[0], 0)[0] === 0 && M.evaluerPiste(des[0], 99)[0] === 2 && M.dureePistes(ass) > 2);

// ── description en français ──
const eng = M.interpreterDescription('un engrenage de 24 dents, module 2 mm, épaisseur 8 mm');
v('description : engrenage 24 dents module 2 mm épaisseur 8 mm', eng.ok && eng.pieces[0].type === 'engrenage' && eng.pieces[0].params.dents === 24 && proche(eng.pieces[0].params.module, 0.002) && proche(eng.pieces[0].params.epaisseur, 0.008), JSON.stringify(eng.pieces[0] && eng.pieces[0].params));
const bat = M.interpreterDescription('un voilier de 12 m de long');
v('description : voilier = coque + mât, longueur 12 m', bat.ok && bat.pieces.map(p => p.type).join() === 'coque,mat' && proche(bat.pieces[0].params.longueur, 12), JSON.stringify(bat.pieces.map(p => p.params)));
const boi = M.interpreterDescription('un boîtier de 120 mm de long, 40 mm de haut, 80 mm de profondeur, paroi 2 mm');
v('description : boîtier aux bonnes dimensions', boi.ok && proche(boi.pieces[0].params.l, 0.12) && proche(boi.pieces[0].params.h, 0.04) && proche(boi.pieces[0].params.p, 0.08) && proche(boi.pieces[0].params.paroi, 0.002), JSON.stringify(boi.pieces[0] && boi.pieces[0].params));
const arm = M.interpreterDescription('une armure');
v('description : armure = pièces simples, avec avertissement honnête', arm.ok && arm.pieces.length === 4 && arm.notes.some(n => /pas une armure détaillée/.test(n)));
const nul = M.interpreterDescription('un dragon réaliste avec des écailles');
v('description inconnue : refus honnête avec la liste de ce qui est possible', !nul.ok && /Je ne sais pas fabriquer/.test(nul.message) && /importe un fichier libre/.test(nul.message));
v('description vide', !M.interpreterDescription('').ok);
for (const p of [...eng.pieces, ...bat.pieces, ...boi.pieces, ...arm.pieces]) { const s = M.statsMaillage(M.construireForme(p)); v('pièce fabriquée « ' + p.nom + ' » : maillage étanche et imprimable', s.etanche && s.volumeSigne > 0); }
v('forme inconnue refusée', (() => { try { M.construireForme({ type: 'licorne' }); return false; } catch (e) { return true; } })());
v('transformation : mise à l’échelle et déplacement', (b => proche(b.dim[0], 4) && proche(b.centre[1], 10))(M.boite(M.transformer(M.formeBoite(1, 1, 1), { echelle: [4, 1, 1], deplacement: [0, 10, 0] }))));

// ── sources libres et attribution ──
v('attribution complète : texte lisible', (a => a.ok && /par Ada/.test(a.texte) && /Attribution/.test(a.texte) && /sketchfab/.test(a.texte))(M.attribution({ titre: 'Voilier', auteur: 'Ada', licence: 'cc-by', url: 'https://sketchfab.com/x', source: 'Sketchfab' })));
v('attribution : licence inconnue ou propriétaire refusée', !M.attribution({ titre: 'x', auteur: 'y', licence: 'Tous droits réservés', url: 'https://a' }).ok && M.attribution({ titre: 'x', auteur: 'y', licence: 'Tous droits réservés', url: 'https://a' }).manque.includes('licence reconnue'));
v('attribution : CC0 sans auteur acceptée, CC-BY sans auteur refusée', M.attribution({ titre: 'x', licence: 'CC0', url: 'https://a' }).ok && !M.attribution({ titre: 'x', licence: 'CC-BY', url: 'https://a' }).ok);
v('sources listées : adresses https', M.SOURCES_MODELES.length >= 4 && M.SOURCES_MODELES.every(s => /^https:\/\//.test(s.url)));
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
