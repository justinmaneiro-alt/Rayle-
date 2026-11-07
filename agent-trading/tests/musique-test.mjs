/* Tests purs du lecteur de musique (partie C) : node agent-trading/tests/musique-test.mjs */
import assert from 'node:assert/strict';
import { idDepuisLien, lireListe, exporter, garder, retirer, fusionner, melanger, volumeBorne, mixRefuse, estMobile, MIX } from '../front/or/musique-calcul.js';
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
eq(mixRefuse({ erreur: 150 }), true); eq(mixRefuse({ playlist: null, attenduMs: 7000 }), true, 'liste non chargée'); eq(mixRefuse({ playlist: new Array(50), attenduMs: 7000 }), false); eq(mixRefuse({ playlist: null, attenduMs: 1000 }), false, 'trop tôt pour conclure');
eq(estMobile('Mozilla/5.0 (Linux; Android 14; SM-S918B) Mobile'), true); eq(estMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
eq(MIX.liste.startsWith('RD'), true);
console.log(`musique-test : ${n} vérifications OK`);
