// Tests purs des sujets d'actualité affichés sur la Terre. Lancer :  node planetes/terre/tests/actus-sujets-test.mjs
import * as A from '../pc/actus-sujets.js';
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const maintenant = Date.parse('2026-10-17T12:00:00Z');
const s1 = { id: 'a', titre: '  Séisme au   Japon  ', categorie: 'environnement', importance: 5, date: '2026-10-17T11:30:00Z', lieu: { nom: 'Tokyo', lat: 35.68, lon: 139.69, type: 'ville', estime: true, origine: 'texte' }, regions: [], sources: [{ nom: 'Le Monde', url: 'https://lemonde.fr/a', date: '2026-10-17T11:30:00Z', titre: 'x' }, { nom: 'BFM', url: 'javascript:alert(1)', date: null, titre: 'y' }, { nom: 'franceinfo', url: 'https://francetvinfo.fr/b', titre: 'z' }] };
const m = A.modeleSujet(s1, maintenant);
v('titre nettoyé, catégorie et couleur', m.titre === 'Séisme au Japon' && m.cat === 'environnement' && m.couleur === A.CATEGORIES.environnement.couleur);
v('lien dangereux écarté, média principal sûr', m.source === 'Le Monde' && m.nbSources === 2 && m.autres.length === 1 && !JSON.stringify(m).includes('javascript'));
v('date relative', m.quand === 'il y a 30 min', m.quand);
v('lieu estimé signalé', m.lieu.estime === true && /localisation estimée/.test(m.lieu.texte));
v('catégorie inconnue → « À la une »', A.modeleSujet({ ...s1, categorie: 'zzz' }, maintenant).cat === 'autre');
v('sujet sans lieu → lieu null, texte honnête', A.modeleSujet({ ...s1, lieu: null }, maintenant).lieu === null && A.libelleLieu(null) === 'lieu non déterminé');
v('taille de balise croît avec le nombre de médias et plafonne', A.tailleBalise(1) < A.tailleBalise(2) && A.tailleBalise(2) < A.tailleBalise(5) && A.tailleBalise(7) === A.tailleBalise(20));
v('niveaux d’importance', A.niveauImportance(1) === 'faible' && A.niveauImportance(2) === 'moyen' && A.niveauImportance(4) === 'fort' && A.niveauImportance(9) === 'majeur');
v('libellé d’importance', A.libelleImportance(1) === 'signalé par 1 média' && A.libelleImportance(3) === 'repris par 3 médias');
const f = A.modelesFil({ sujets: [s1, { ...s1, id: 'b', sources: [{ nom: 'X', url: 'ftp://x' }] }], genere: '2026-10-17T11:56:00Z', sources: { ok: ['Le Monde'], indisponibles: [{ nom: 'La Dépêche', erreur: 'HTTP 503' }] } }, { maintenant });
v('fil : sujet sans lien sûr écarté, pannes listées', f.sujets.length === 1 && f.indisponibles[0] === 'La Dépêche');
v('dernière mise à jour lisible', /mis à jour il y a 4 min/.test(A.libelleMaj(f.genere, maintenant)) && A.libelleMaj(null) === 'mise à jour inconnue');
// cartes
const bal = [{ id: 'a', x: 300, y: 300 }, { id: 'b', x: 320, y: 320 }, { id: 'c', x: 1200, y: 400 }, { id: 'd', x: 1250, y: 410 }, { id: 'e', x: 400, y: 700 }];
const pos = A.disposerCartes(bal, 1600, 900);
const rects = Object.entries(pos).map(([id, p]) => ({ id, ...p }));
const chevauche = (a, b) => a.cote === b.cote && a.x < b.x + 262 && a.x + 262 > b.x && a.y < b.y + 118 && a.y + 118 > b.y;
let recouvre = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (chevauche(rects[i], rects[j])) recouvre++;
v('cartes : aucune ne chevauche une autre', recouvre === 0 && rects.length === 5, JSON.stringify(rects));
v('cartes : toutes dans l’écran, sous le haut et au-dessus du bas', rects.every(r => r.y >= 100 && r.y + 118 <= 900 - 90 && r.x >= 0 && r.x + 262 <= 1600));
const beaucoup = Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, x: i % 2 ? 200 : 1400, y: 150 + i * 50 }));
const p2 = A.disposerCartes(beaucoup, 1600, 900), r2 = Object.entries(p2).map(([id, p]) => ({ id, ...p }));
v('cartes : au plus 7 affichées, sans chevauchement, même en nombre', r2.length === 7 && r2.every((a, i) => r2.every((b, j) => i >= j || !chevauche(a, b))), String(r2.length));
v('cartes : petite fenêtre, reste dans l’écran', Object.values(A.disposerCartes(bal, 900, 600)).every(p => p.y + 118 <= 600 - 90 + 1));
const obs = A.disposerCartes([{ id: 'a', x: 300, y: 200 }, { id: 'b', x: 320, y: 260 }], 1600, 900, { obstacles: [{ x: 1300, y: 100, w: 290, h: 400 }] });
v('cartes : elles glissent sous une fenêtre ouverte (obstacle)', Object.values(obs).every(p => p.cote !== 'droite' || p.y >= 510), JSON.stringify(obs));
const plein = A.disposerCartes([{ id: 'a', x: 300, y: 200 }], 1600, 900, { obstacles: [{ x: 1300, y: 0, w: 290, h: 900 }] });
v('cartes : si plus de place, la carte est omise (pas de chevauchement)', Object.keys(plein).length === 0);
// segments
const seg = A.segmenter('Voici l’actualité en France. [1] D’après Le Monde, des manifestations ont lieu. [2] D’après franceinfo, un séisme. [3] ');
v('segments : introduction + 2 segments (le vide est ignoré)', seg.intro === 'Voici l’actualité en France.' && seg.segments.length === 2 && seg.segments[0].n === 1 && /^D’après Le Monde/.test(seg.segments[0].texte) && seg.segments[1].n === 2, JSON.stringify(seg));
v('segments : texte sans marqueurs', !/\[\d/.test(seg.propre) && /manifestations ont lieu\. D’après franceinfo/.test(seg.propre), seg.propre);
v('segments : réponse sans marqueur → rien à découper', A.segmenter('Bonjour').segments.length === 0 && A.segmenter(null).propre === '');
v('sansMarqueurs : [12] supprimé, [a] conservé', A.sansMarqueurs('a [12] b [x] c') === 'a b [x] c');
const bd = A.elementsBandeau([{ id: '1', titre: 't1', couleur: '#fff', source: 's', importance: 1 }, { id: '2', titre: 't2', couleur: '#fff', source: 's', importance: 4 }], 5);
v('bandeau : les plus importants d’abord', bd[0].id === '2');
v('distance de vue selon le type de lieu', A.distanceVue({ lieu: { type: 'ville' } }) < A.distanceVue({ lieu: { type: 'pays' } }));
// images des flux RSS : https seulement, rien d'inventé
const avecImage = A.modeleSujet({ ...s1, image: 'https://img.media.fr/a.jpg', sources: [{ nom: 'Média A', url: 'https://a.fr/x', titre: 'T', image: 'https://img.media.fr/a.jpg' }, { nom: 'Média B', url: 'https://b.fr/y', image: 'http://img.media.fr/b.jpg' }, { nom: 'Média C', url: 'https://c.fr/z' }] }, maintenant);
v('image du sujet : adresse https gardée', avecImage.image === 'https://img.media.fr/a.jpg' && avecImage.sources[0].image === 'https://img.media.fr/a.jpg');
v('image : http, javascript:, data:, texte ou absence → null', avecImage.sources[1].image === null && avecImage.sources[2].image === null && A.imageSure('javascript:alert(1)') === null && A.imageSure('data:image/png;base64,AAAA') === null && A.imageSure('https://x y.fr/a.jpg') === null && A.imageSure(null) === null && A.imageSure(42) === null && m.image === null);
console.log(`${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
