// V11 : calculs purs de la liaison (camera/liaison-calcul.js) — choix du chemin avec hystérésis, libellés, candidats ICE, DIAGNOSTIC en français pour chaque panne connue.
// Lancer : node galaxie/tests/liaison-calcul-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
const L = R('../../camera/liaison-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// ── candidats ICE ──
const hote = 'candidate:1 1 udp 2122260223 192.168.1.20 54321 typ host generation 0';
const mdns = 'candidate:2 1 udp 2113937151 5c6d1d4a-1b2c-4d5e-8f90-a1b2c3d4e5f6.local 51000 typ host generation 0';
const srf = 'candidate:3 1 udp 1686052607 82.1.2.3 40000 typ srflx raddr 192.168.1.20 rport 54321';
const rel = 'candidate:4 1 udp 41885439 104.30.1.2 50000 typ relay raddr 82.1.2.3 rport 40000';
v('candidat : type « host »', L.typeCandidat(hote).type === 'host' && !L.typeCandidat(hote).mdns);
v('candidat : adresse masquée « .local » reconnue', L.typeCandidat(mdns).type === 'host' && L.typeCandidat(mdns).mdns === true);
v('candidat : « srflx » et « relay »', L.typeCandidat(srf).type === 'srflx' && L.typeCandidat(rel).type === 'relay');
v('candidat : texte absurde → null', L.typeCandidat('n’importe quoi') === null && L.typeCandidat('') === null && L.typeCandidat(null) === null);
const c = L.candidatsVides(); [hote, mdns, srf, rel, rel, 'rien'].forEach(t => L.compterCandidat(c, t));
v('comptage : 2 locaux (dont 1 masqué), 1 public, 2 relais', c.host === 2 && c.mdns === 1 && c.srflx === 1 && c.relay === 2, JSON.stringify(c));

// ── choix du chemin ──
const ch = L.choisirChemin;
v('rien d’ouvert : ancien relais', ch({ directOuvert: false, relaisOuvert: false }) === 'worker');
v('seul le direct : direct', ch({ directOuvert: true, relaisOuvert: false }) === 'direct');
v('seul le relais : relais', ch({ directOuvert: false, relaisOuvert: true }) === 'relais');
v('les deux, sans mesure : direct par défaut, sinon on garde le chemin courant', ch({ directOuvert: true, relaisOuvert: true }) === 'direct' && ch({ directOuvert: true, relaisOuvert: true, courant: 'relais' }) === 'relais');
v('les deux : le direct reste choisi s’il est aussi rapide', ch({ directOuvert: true, relaisOuvert: true, rttDirect: 30, rttRelais: 60, courant: 'direct' }) === 'direct');
v('hystérésis : on ne quitte pas le direct pour un gain de 10 ms', ch({ directOuvert: true, relaisOuvert: true, rttDirect: 70, rttRelais: 60, courant: 'direct' }) === 'direct');
v('le direct devient très lent : on passe au relais', ch({ directOuvert: true, relaisOuvert: true, rttDirect: 400, rttRelais: 60, courant: 'direct' }) === 'relais');
v('hystérésis : on ne revient pas au direct pour un gain de 5 ms', ch({ directOuvert: true, relaisOuvert: true, rttDirect: 55, rttRelais: 60, courant: 'relais' }) === 'relais');
v('le direct redevient nettement meilleur : retour au direct', ch({ directOuvert: true, relaisOuvert: true, rttDirect: 15, rttRelais: 80, courant: 'relais' }) === 'direct');
// pas d'oscillation : valeurs qui fluctuent autour de l'égalité
let courant = 'direct', bascules = 0; for (let i = 0; i < 200; i++) { const a = 40 + (i % 7) * 4, b = 44 + (i % 5) * 4; const n = ch({ directOuvert: true, relaisOuvert: true, rttDirect: a, rttRelais: b, courant }); if (n !== courant) bascules++; courant = n; }
v('aucune oscillation quand les deux chemins se valent (200 mesures bruitées → ≤ 1 bascule)', bascules <= 1, String(bascules));

// ── libellés ──
v('libellé « Direct · 58 paquets/s · 22 ms »', L.libelleChemin({ chemin: 'direct', debit: 58, delai: 22 }) === 'Direct · 58 paquets/s · 22 ms');
v('libellé « Relais temps réel · 41 paquets/s · 55 ms »', L.libelleChemin({ chemin: 'relais', debit: 41, delai: 55.2 }) === 'Relais temps réel · 41 paquets/s · 55 ms');
v('libellé sans délai connu', L.libelleChemin({ chemin: 'relais', debit: 41, delai: null }) === 'Relais temps réel · 41 paquets/s');
v('libellé de l’ancien relais et de l’absence de liaison', /Worker lent/.test(L.libelleChemin({ chemin: 'worker', debit: 4 })) && L.libelleChemin({ chemin: 'aucun' }) === 'Aucune liaison');
v('classe : ≥ 30 paquets/s = ok, en dessous = à surveiller, aucun lien = ko', L.classeChemin({ chemin: 'direct', debit: 50 }) === 'ok' && L.classeChemin({ chemin: 'relais', debit: 12 }) === 'att' && L.classeChemin({ chemin: 'worker', debit: 20 }) === 'att' && L.classeChemin({ chemin: 'aucun' }) === 'ko');

// ── diagnostic : une situation = une cause claire ──
const base = () => ({ worker: { joignable: true, version: 11, relais: true, turn: true }, signal: { offre: true, reponse: true }, ice: { etat: 'connected', conn: 'connected', local: { host: 1, srflx: 1, relay: 1, mdns: 0 }, distant: { host: 1, srflx: 1, relay: 1, mdns: 0 }, paire: 'host' }, ws: { etat: 'ouvert', rtt: 12 }, direct: { ouvert: true, rtt: 5 }, chemin: 'direct', debit: 58, delai: 22 });
const etape = (r, id) => r.etapes.find(e => e.id === id);
let d = L.diagnostiquer(base());
v('diagnostic : tout va bien en direct', /Tout va bien/.test(d.cause) && d.etapes.every(e => e.etat === 'ok') && d.conseils.length === 0, JSON.stringify(d.etapes.map(e => e.id + ':' + e.etat)));
v('diagnostic : le chemin utilisé est écrit avec le débit et le délai', /Direct · 58 paquets\/s · 22 ms/.test(etape(d, 'chemin').detail));
let f = base(); f.worker = { joignable: true, version: null, relais: false, turn: null }; f.ws = { etat: 'refuse', code: 404 }; f.chemin = 'worker'; f.debit = 6; f.direct = { ouvert: false }; f.ice = { etat: 'checking', local: L.candidatsVides(), distant: L.candidatsVides() };
d = L.diagnostiquer(f);
v('diagnostic : Worker pas à jour → « Mise à jour du Worker requise » + commande', /Mise à jour du Worker requise/.test(d.cause) && d.conseils.some(c => /wrangler deploy/.test(c)) && etape(d, 'worker').etat === 'ko');
f = base(); f.worker.relais = false; f.ws = { etat: 'ferme', code: 501, raison: 'relais temps réel non installé sur ce Worker (Durable Object absent)' }; f.chemin = 'direct';
d = L.diagnostiquer(f); v('diagnostic : Durable Object absent (501) → redéployer', /Mise à jour du Worker requise/.test(d.cause) && etape(d, 'relais').etat === 'ko' && /Durable Object absent/.test(etape(d, 'relais').detail));
f = base(); f.worker.joignable = false; f.worker.version = null; d = L.diagnostiquer(f); v('diagnostic : Worker injoignable', /ne répond pas/.test(d.cause) && etape(d, 'worker').etat === 'ko');
f = base(); f.signal = { offre: true, reponse: false, erreur: 'signalisation injoignable' }; f.ice = { etat: 'new', local: L.candidatsVides(), distant: L.candidatsVides() }; f.direct = { ouvert: false }; f.chemin = 'relais';
d = L.diagnostiquer(f); v('diagnostic : signalisation en échec → la cause est dite', /signalisation/i.test(d.cause) && etape(d, 'signal').etat === 'ko');
// 4G/5G contre Ethernet : on a une adresse publique mais pas de TURN
f = base(); f.worker.turn = false; f.ice = { etat: 'failed', conn: 'failed', local: { host: 1, srflx: 1, relay: 0, mdns: 0 }, distant: { host: 1, srflx: 1, relay: 0, mdns: 0 } }; f.direct = { ouvert: false, echec: 'la liaison directe a échoué' }; f.chemin = 'relais'; f.debit = 55;
d = L.diagnostiquer(f); v('diagnostic : téléphone en 4G/5G et PC en Wi-Fi, sans TURN → réseaux différents, pas de pont', /pas sur le même réseau|n’y a pas de serveur TURN/.test(d.cause) && d.conseils.some(c => /même Wi-Fi/i.test(c)) && d.conseils.some(c => /TURN/.test(c)) && etape(d, 'turn').etat === 'att');
// isolation / mDNS / pare-feu : que des adresses masquées, aucune publique
f = base(); f.worker.turn = false; f.ice = { etat: 'failed', conn: 'failed', local: { host: 2, srflx: 0, relay: 0, mdns: 2 }, distant: { host: 2, srflx: 0, relay: 0, mdns: 2 } }; f.direct = { ouvert: false, echec: 'x' }; f.chemin = 'relais';
d = L.diagnostiquer(f); v('diagnostic : adresses « .local » masquées et aucune publique → isolation des appareils ou pare-feu', /masque les adresses locales/.test(d.cause) && /isolation/.test(d.cause) && etape(d, 'stun').etat === 'ko', d.cause);
// rien reçu de l'autre côté
f = base(); f.ice = { etat: 'failed', conn: 'failed', local: { host: 1, srflx: 1, relay: 0, mdns: 0 }, distant: L.candidatsVides() }; f.direct = { ouvert: false, echec: 'x' };
d = L.diagnostiquer(f); v('diagnostic : aucune adresse reçue de l’autre côté → signalisation incomplète', /signalisation est incomplète/.test(d.cause));
// TURN configuré mais le réseau le bloque
f = base(); f.ice = { etat: 'failed', conn: 'failed', local: { host: 1, srflx: 1, relay: 1, mdns: 0 }, distant: { host: 1, srflx: 1, relay: 1, mdns: 0 } }; f.direct = { ouvert: false, echec: 'x' };
d = L.diagnostiquer(f); v('diagnostic : même avec le relais TURN, la connexion échoue → pare-feu / réseau d’entreprise', /Même avec le serveur de relais/.test(d.cause));
f = base(); f.worker.turn = true; f.ice = { etat: 'failed', conn: 'failed', local: { host: 1, srflx: 1, relay: 0, mdns: 0 }, distant: { host: 1, srflx: 1, relay: 0, mdns: 0 } }; f.direct = { ouvert: false, echec: 'x' };
d = L.diagnostiquer(f); v('diagnostic : TURN configuré mais aucune adresse de relais → ports 3478 / 5349 bloqués', etape(d, 'turn').etat === 'ko' && /3478/.test(etape(d, 'turn').detail));
// dernier recours
f = base(); f.chemin = 'worker'; f.debit = 5; f.direct = { ouvert: false }; f.ws = { etat: 'connexion' }; f.ice = { etat: '', local: L.candidatsVides(), distant: L.candidatsVides() };
d = L.diagnostiquer(f); v('diagnostic : seul l’ancien relais marche → dit que c’est le dernier recours', /dernier recours/.test(etape(d, 'chemin').detail) && /ancien relais/.test(d.cause));
f = base(); f.chemin = 'relais'; f.debit = 12; f.direct = { ouvert: false }; d = L.diagnostiquer(f); v('diagnostic : liaison établie mais lente (12 paquets/s) → le dit', /lente/.test(d.cause) && etape(d, 'chemin').etat === 'att');
const txt = L.texteDiagnostic(L.diagnostiquer(base()));
v('texte : titre, une ligne par étape avec ✔, cause', /^DIAGNOSTIC DE LIAISON/.test(txt) && (txt.match(/✔/g) || []).length >= 5 && /Cause :/.test(txt));
v('texte d’une panne : contient les conseils (→)', /→ /.test(L.texteDiagnostic(L.diagnostiquer((() => { const x = base(); x.worker = { joignable: true, version: null }; return x; })()))));
v('aucune étape ne contient « undefined » ou « NaN » (faits vides compris)', [base(), {}, { worker: {}, ice: {}, ws: {} }].every(x => !/undefined|NaN/.test(L.texteDiagnostic(L.diagnostiquer(x)))));
console.log('Liaison (calculs purs, V11) : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
