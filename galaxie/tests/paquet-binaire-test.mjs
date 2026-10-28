// Tests des paquets binaires de points de main (V5) : taille, précision, ordre, pertes, conseils.
// Lancer : node galaxie/tests/paquet-binaire-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
const C = R('../../core/gestes/gestes-calcul.js'), PB = R('../../camera/paquet-binaire.js'), H = R('../../core/gestes/main-synthetique.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const main = lat => H.creerMain({ pose: 'ouverte', lat, cx: 0.4, cy: 0.6 });
const une = { t: 1761600000123, ratio: 4 / 3, mains: [main('Right')], seq: 7, dt: 12, conf: 0.9 }, deux = { ...une, mains: [main('Left'), main('Right')], seq: 65535 };
const b1 = PB.encoder(une), b2 = PB.encoder(deux), vide = PB.encoder({ t: 5, mains: [], seq: 0 });
v('taille : 16 + 84 octets par main (100 / 184 / 16)', b1.byteLength === 100 && b2.byteLength === 184 && vide.byteLength === 16, [b1.byteLength, b2.byteLength, vide.byteLength].join('/'));
const jsonReel = JSON.stringify({ a: 'mains', t: deux.t, ratio: 1.3333, mains: deux.mains.map(m => ({ lat: m.lat, pts: m.pts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4), -0.0123]) })) }).length;   // format envoyé par l’ancienne page (x, y, z à 4 décimales)
v('plus compact que le JSON de l’ancienne page (≥ 5 fois pour deux mains)', jsonReel / b2.byteLength >= 5, jsonReel + ' octets contre ' + b2.byteLength);
const d1 = PB.decoder(b1), d2 = PB.decoder(b2);
v('aller-retour : heure, rapport, séquence, durée, confiance, nombre de mains', d1.t === une.t && Math.abs(d1.ratio - 4 / 3) < 0.001 && d1.seq === 7 && d1.dt === 12 && Math.abs(d1.conf - 0.9) < 0.005 && d1.mains.length === 1 && d2.mains.length === 2 && d2.seq === 65535);
v('mains gauche / droite conservées', d1.mains[0].lat === 'Right' && d2.mains[0].lat === 'Left' && d2.mains[1].lat === 'Right');
let err = 0; une.mains[0].pts.forEach((p, i) => { err = Math.max(err, Math.abs(p[0] - d1.mains[0].pts[i][0]), Math.abs(p[1] - d1.mains[0].pts[i][1])); });
v('précision : erreur ≤ 2,4 × 10⁻⁵ par coordonnée', err <= 2.4e-5, String(err));
const extr = PB.decoder(PB.encoder({ t: 1, mains: [{ lat: 'Left', pts: Array.from({ length: 21 }, (_, i) => [i === 0 ? -1 : i === 1 ? 2 : 0.5, i === 0 ? 2 : -1, 0]) }], seq: 1 }));
v('coordonnées aux bornes [−1 ; 2] conservées, hors bornes écrêtées', Math.abs(extr.mains[0].pts[0][0] + 1) < 1e-4 && Math.abs(extr.mains[0].pts[1][0] - 2) < 1e-4);
v('trame décodée acceptée telle quelle par la validation du moteur (aucune confiance aveugle)', C.validerMains(d2) !== null && C.validerMains(d2).seq === 65535 && C.validerMains(d2).dt === 12 && C.validerMains(d2).mains.length === 2);
v('paquets mal formés refusés : trop court, mauvaise version, longueur incohérente, vide', PB.decoder(new ArrayBuffer(4)) === null && (() => { const x = PB.encoder(une); new DataView(x).setUint8(0, 9); return PB.decoder(x) === null; })() && PB.decoder(b1.slice(0, 50)) === null && PB.decoder(null) === null);
v('heure non finie refusée', (() => { const x = PB.encoder(une); new DataView(x).setFloat64(4, NaN, true); return PB.decoder(x) === null; })());

// ── séquence ──
v('écart de séquence avec bouclage 16 bits', PB.ecartSeq(1, 65535) === 2 && PB.ecartSeq(65535, 1) === -2 && PB.ecartSeq(5, 5) === 0 && PB.ecartSeq(100, 99) === 1);
let t = 1000; const suivi = PB.creerSuivi(() => t);
const envoyer = (seqs, pas = 16) => seqs.map(s => { t += pas; return suivi.noter(s); });
const r = envoyer([1, 2, 3, 5, 4, 6, 6, 8, 9]);
v('paquet arrivé en retard écarté (jamais traité après un plus récent), doublon repéré', r[4] === 'ancien' && r[6] === 'doublon' && r[3] === 'ok' && r[5] === 'ok', JSON.stringify(r));
const st = suivi.stats();
v('pertes comptées d’après les trous de séquence (4 manquant puis arrivé en retard = perdu, 7 manquant)', st.perdusTotal === 2 && st.ecartes === 1, JSON.stringify(st));
t = 10000; const s2 = PB.creerSuivi(() => t); for (let i = 0; i < 60; i++) { t += 1000 / 60; s2.noter(i); }
v('débit mesuré sur 1 s : 60 paquets/s à 60 Hz, aucune perte, gigue faible', Math.abs(s2.stats().debit - 60) <= 1 && s2.stats().perte === 0 && s2.stats().gigue < 1, JSON.stringify(s2.stats()));
t = 20000; const s3 = PB.creerSuivi(() => t); for (let i = 0; i < 100; i++) { t += 16; if (i % 5 !== 3) s3.noter(i); }
v('20 % de paquets perdus : perte ≈ 20 %', Math.abs(s3.stats().perte - 0.2) < 0.06, JSON.stringify(s3.stats()));
t = 30000; const s4 = PB.creerSuivi(() => t); for (let i = 65500; i < 65500 + 80; i++) { t += 16; s4.noter(i & 0xFFFF); }
v('bouclage de la séquence : aucune perte inventée', s4.stats().perdusTotal === 0 && s4.stats().ecartes === 0);

// ── délai et conseils ──
v('délai bout en bout = détection + aller-retour / 2 + traitement', PB.delaiBoutEnBout(12, 20, 2) === 24 && PB.delaiBoutEnBout(12, null, 2) === null);
v('conseil : rien quand tout va bien', PB.conseil({ debit: 55, perte: 0, delai: 20 }) === '');
v('conseil : rien sans main (battement de 4 à 10 paquets/s normal)', PB.conseil({ debit: 5, mainsVues: false }) === '');
v('conseil : sous 25 paquets/s, lumière / rapprocher / fermer l’aperçu', /lumi/.test(PB.conseil({ debit: 20 })) && /aperçu/.test(PB.conseil({ debit: 20 })));
v('conseil : forte perte = Wi-Fi', /Wi-Fi/.test(PB.conseil({ debit: 50, perte: 0.3 })));
v('conseil : délai élevé', /Délai/.test(PB.conseil({ debit: 50, delai: 150 })));
console.log('Paquets binaires : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).');
process.exit(ko ? 1 : 0);
