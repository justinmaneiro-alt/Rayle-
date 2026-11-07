/* Tests purs du mode télé (partie D) + lien avec un faux WebSocket : node agent-trading/tests/tele-test.mjs */
import assert from 'node:assert/strict';
import { codeAleatoire, codeValide, urlTelecommande, toucheVersAction, voisin, ajusterQualite, sousSolaire, texteMeteo, ADRESSE_COURTE } from '../front/or/tele-calcul.js';
import { creerLien } from '../front/or/tele-lien.js';
import { admettre, COMMANDES } from '../../relais-or/index.js';
let n = 0; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; }; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(codeValide(codeAleatoire(() => 0.0042)), 'code à 4 chiffres'); eq(codeAleatoire(() => 0.0042), '0042'); eq(codeValide('12a4'), false);
eq(urlTelecommande('1234'), 'https://justinmaneiro-alt.github.io/Rayle-/tc/?code=1234'); ok(ADRESSE_COURTE.endsWith('/tv'));
eq(toucheVersAction({ key: 'ArrowRight' }), { nav: 'droite' }); eq(toucheVersAction({ keyCode: 23 }), { ok: true }, 'OK de télécommande Android'); eq(toucheVersAction({ key: 'MediaPlayPause' }), { cmd: 'pause_reprendre' }); eq(toucheVersAction({ key: 'a' }), null);
const B = [{ x: 0, y: 0, l: 100, h: 50 }, { x: 120, y: 0, l: 100, h: 50 }, { x: 240, y: 0, l: 100, h: 50 }, { x: 120, y: 80, l: 100, h: 50 }];
eq(voisin(B, 0, 'droite'), 1); eq(voisin(B, 1, 'bas'), 3); eq(voisin(B, 0, 'gauche'), 0, 'rien à gauche : reste'); eq(voisin(B, 3, 'haut'), 1);
eq(ajusterQualite(2, 20), 1, 'baisse sous 28 i/s'); eq(ajusterQualite(1, 40), 1, 'zone neutre'); eq(ajusterQualite(1, 60), 2); eq(ajusterQualite(0, 10), 0);
const s = sousSolaire(Date.UTC(2026, 5, 21, 12)); ok(Math.abs(s.lat - 23.44) < 0.6 && Math.abs(s.lon) < 1, 'solstice à midi UTC'); eq(texteMeteo(3), 'Couvert');
// toutes les commandes envoyées par la télécommande passent la liste blanche du relais
for (const c of ['playlist', 'mix', 'pause_reprendre', 'precedent', 'suivant', 'volume_moins', 'volume_plus', 'muet', 'melange', 'stop', 'or', 'terre']) ok(COMMANDES.includes(c) && admettre(JSON.stringify({ t: 'cmd', cmd: c })), 'relais accepte ' + c);
// lien avec un faux WebSocket : la télé change de code si le sien est pris (fermeture sans ouverture)
const ouverts = []; class FauxWS { constructor(u) { this.u = u; ouverts.push(this); this.readyState = 0; setTimeout(() => { if (u.includes('code=1111')) { this.onclose && this.onclose({}); } else { this.readyState = 1; this.onopen && this.onopen(); } }, 5); } send(x) { this.envoye = x; } close() { this.readyState = 3; } }
const etats = []; const L = creerLien({ role: 'tele', code: '1111', WS: FauxWS, surEtat: e => etats.push(e) });
await new Promise(r => setTimeout(r, 3500)); L.fermer();
ok(etats.some(e => e.etat === 'en attente' && e.code !== '1111'), 'code déjà pris : nouveau code'); ok(ouverts[0].u.includes('role=tele'));
const recus = []; const C = creerLien({ role: 'commande', code: '2222', WS: FauxWS, surMessage: m => recus.push(m) });
await new Promise(r => setTimeout(r, 20)); ok(C.envoyer({ t: 'cmd', cmd: 'pause' }), 'envoi'); ouverts.at(-1).onmessage({ data: JSON.stringify({ t: 'etat', titre: 'x' }) }); eq(recus, [{ t: 'etat', titre: 'x' }]); C.fermer();
console.log(`tele-test : ${n} vérifications OK`);
