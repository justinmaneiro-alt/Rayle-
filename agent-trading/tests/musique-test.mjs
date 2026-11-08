/* Tests purs du lecteur de musique (partie C) : node agent-trading/tests/musique-test.mjs */
import assert from 'node:assert/strict';
import { idDepuisLien, lireListe, exporter, garder, retirer, fusionner, melanger, volumeBorne, estMobile, MIX, CODES_REFUS, estRefus, apresRefus, noterNonLisible, idPlaylistDepuisLien, urlLecteur, SANDBOX, PERMISSIONS } from '../front/or/musique-calcul.js';
import { alea } from '../front/or/zones-or.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
for (const [l, id] of [['https://www.youtube.com/watch?v=5Xq5Up-6bSg&list=RDGMEMHDXYb1_DDSgDsobPsOFxpAVM5Xq5Up-6bSg', '5Xq5Up-6bSg'], ['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'], ['youtube.com/shorts/abcdefghijk', 'abcdefghijk'], ['https://music.youtube.com/watch?v=abcdefghij_', 'abcdefghij_'], ['https://m.youtube.com/watch?v=abcdefghij-', 'abcdefghij-'], ['https://www.youtube.com/embed/abcdefghijk', 'abcdefghijk'], ['abcdefghijk', 'abcdefghijk'], ['https://evil.com/watch?v=abcdefghijk', null], ['bonjour', null], ['', null]]) eq(idDepuisLien(l), id, l);
const L = lireListe('https://youtu.be/aaaaaaaaaaa # Titre A\n\nhttps://youtu.be/aaaaaaaaaaa\nnimporte quoi\nhttps://www.youtube.com/watch?v=bbbbbbbbbbb');
eq(L.morceaux, [{ id: 'aaaaaaaaaaa', titre: 'Titre A' }, { id: 'bbbbbbbbbbb', titre: null }], 'sans doublon, titre après #'); eq(L.rejets, ['nimporte quoi']);
eq(lireListe(exporter(L.morceaux)).morceaux, L.morceaux, 'export → import identique');
let r = garder([], { id: 'aaaaaaaaaaa', titre: 'A' }); eq(r.etat, 'ajoute'); r = garder(r.liste, { id: 'aaaaaaaaaaa', titre: 'A' }); eq(r.etat, 'deja'); eq(r.liste.length, 1, 'jamais deux fois le même morceau');
eq(garder([], { id: 'x' }).etat, 'invalide'); eq(retirer(r.liste, 'aaaaaaaaaaa').etat, 'retire'); eq(retirer([], 'aaaaaaaaaaa').etat, 'absent');
eq(fusionner([{ id: 'aaaaaaaaaaa', titre: null }], [{ id: 'aaaaaaaaaaa', titre: 'A' }, { id: 'bbbbbbbbbbb' }]), { liste: [{ id: 'aaaaaaaaaaa', titre: 'A' }, { id: 'bbbbbbbbbbb', titre: null }], ajoutes: 1 });
const M = melanger([1, 2, 3, 4, 5], alea(2)); eq([...M].sort(), [1, 2, 3, 4, 5], 'mélange : mêmes morceaux');
eq(volumeBorne(130), 100); eq(volumeBorne(-5), 0);
// refus du lecteur intégré : passer au suivant, ou arrêter net (jamais de boucle, jamais d'onglet)
for (const c of [2, 5, 100, 101, 150, 153]) eq(estRefus(c), true, 'code ' + c); eq(estRefus(1), false); eq(CODES_REFUS.length, 6);
eq(apresRefus({ index: 0, longueur: 3, echecsSuite: 1 }), { action: 'suivant', index: 1 });
eq(apresRefus({ index: 1, longueur: 3, echecsSuite: 2 }), { action: 'suivant', index: 2 }, 'deux refus sur trois : on continue');
eq(apresRefus({ index: 2, longueur: 3, echecsSuite: 3 }).raison, 'tous', 'tous refusés à la suite : arrêt');
eq(apresRefus({ index: 2, longueur: 3, echecsSuite: 1 }).raison, 'fin', 'dernier refusé : fin, pas de retour au début');
eq(apresRefus({ index: 0, longueur: 3, echecsSuite: 1, dejaRefuse: true }).raison, 'boucle', 'déjà refusé : arrêt anti-boucle');
eq(apresRefus({ index: 0, longueur: 1 }).raison, 'seul'); eq(apresRefus({ index: -1, longueur: 0 }).raison, 'seul', 'liste inconnue : arrêt');
{ // simulation : une liste où TOUT est refusé s'arrête après N refus, sans boucle
  let i = 0, k = 0, d; const refus = new Set(); do { k++; d = apresRefus({ index: i, longueur: 4, echecsSuite: k, dejaRefuse: refus.has(i) }); refus.add(i); if (d.action === 'suivant') i = d.index; } while (d.action === 'suivant' && k < 50); eq([d.action, k], ['arret', 4], 'tout refusé : 4 essais puis arrêt'); }
let NL = noterNonLisible([], { id: 'kJQP7kiw5Fk', titre: null, code: 150 }); NL = noterNonLisible(NL, { id: 'aaaaaaaaaaa', titre: 'A' }); NL = noterNonLisible(NL, { id: 'kJQP7kiw5Fk', titre: 'Despacito', code: 150 });
eq(NL.map(m => [m.id, m.titre]), [['kJQP7kiw5Fk', 'Despacito'], ['aaaaaaaaaaa', 'A']], 'non lisibles : sans doublon, récent d’abord, titre complété');
eq(noterNonLisible(NL, { id: 'x' }), NL, 'identifiant invalide ignoré');
{ let gros = []; for (let k = 0; k < 60; k++) gros = noterNonLisible(gros, { id: String(k).padStart(11, 'a') }); eq(gros.length, 50, '50 au plus'); }
// lien de ma playlist YouTube
for (const [l, id] of [['https://www.youtube.com/playlist?list=PLabcdefghij0123456789', 'PLabcdefghij0123456789'], ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij0123456789&index=3', 'PLabcdefghij0123456789'], ['https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijklmn', 'OLAK5uy_abcdefghijklmn'], ['  PLabcdefghij0123456789 ', 'PLabcdefghij0123456789'], ['https://www.youtube.com/playlist?list=WL', null], ['https://www.youtube.com/playlist?list=LL', null], ['https://evil.com/playlist?list=PLabcdefghij0123456789', null], ['https://youtu.be/dQw4w9WgXcQ', null], ['bonjour', null], ['', null]]) eq(idPlaylistDepuisLien(l), id, 'playlist : ' + l);
// cadre restreint : jamais de fenêtre ni de navigation de la page
eq(SANDBOX.split(' ').sort(), ['allow-presentation', 'allow-same-origin', 'allow-scripts']); eq(/popups|top-navigation|modals/.test(SANDBOX), false, 'ni popups ni navigation de la page');
eq(PERMISSIONS.includes('autoplay'), true);
const u1 = new URL(urlLecteur({ source: 'playlist', liste: 'PLabcdefghij0123456789', origine: 'http://127.0.0.1:8011' }));
eq([u1.hostname, u1.pathname, u1.searchParams.get('list'), u1.searchParams.get('enablejsapi'), u1.searchParams.get('origin')], ['www.youtube-nocookie.com', '/embed/videoseries', 'PLabcdefghij0123456789', '1', 'http://127.0.0.1:8011']);
const u2 = new URL(urlLecteur({ source: 'mix', video: MIX.video, liste: MIX.liste })); eq([u2.pathname, u2.searchParams.get('list')], ['/embed/' + MIX.video, MIX.liste]);
const u3 = new URL(urlLecteur({ source: 'fixe', ids: ['aaaaaaaaaaa', 'bad', 'bbbbbbbbbbb', 'ccccccccccc'] })); eq([u3.pathname, u3.searchParams.get('playlist')], ['/embed/aaaaaaaaaaa', 'bbbbbbbbbbb,ccccccccccc']);
eq(urlLecteur({ source: 'fixe', ids: [] }), null); eq(urlLecteur({ source: 'playlist', liste: null }), null);
eq(estMobile('Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile'), true); eq(estMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
eq(MIX.liste.startsWith('RD'), true);
// commandes depuis n'importe quel écran de Rayle (tuiles indépendantes) : strictes, jamais de vol de phrase aux autres écrans
const { interpreter } = await import('../front/or/commandes-or.js');
const G = (t, actif) => interpreter(t, { global: true, musiqueActive: actif });
eq(G('lance ma playlist', false), { type: 'musique', cmd: 'playlist' }); eq(G('ouvre la musique', false), { type: 'fenetre', quoi: 'musique' }); eq(G('ouvre le mode télé', false), { type: 'fenetre', quoi: 'tele' });
for (const t of ['pause', 'suivant', 'plus fort', 'stop', 'reviens']) eq(G(t, false).type, null, `« ${t} » sans musique en cours : laissé aux autres écrans`);
eq(G('pause', true).cmd, 'pause'); eq(G('suivant', true).cmd, 'suivant'); eq(G('Raylé, morceau suivant', false).cmd, 'suivant', 'formulation explicite');
for (const t of ['qu’est-ce qui se passe à Paris', 'image suivante', 'monte à bord', 'pause les gestes', 'affiche la Terre', 'passe sur le Bitcoin']) eq(G(t, true).type, null, `« ${t} » n’est pas de la musique`);
eq(G('mets en pause la musique', false).cmd, 'pause', '« mets en pause la musique » ≠ « mets la musique »');
eq(interpreter('affiche la Terre').vue, 'terre', 'mode télé : les vues restent');
const { pluriel } = await import('../front/or/texte-or.js');
eq([0, 1, 2, 13].map(k => pluriel(k, 'morceau', 'morceaux')), ['0 morceau', '1 morceau', '2 morceaux', '13 morceaux']); eq(pluriel(1500, 'trade'), '1 500 trades');
console.log(`musique-test : ${n} vérifications OK`);
