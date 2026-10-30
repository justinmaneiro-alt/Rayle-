// Tests de l'adaptation de la résolution du téléphone (V10, phase 2) : décisions pures, sans caméra.
// Lancer : node galaxie/tests/adaptation-camera-test.mjs
import { createRequire } from 'node:module';
const A = createRequire(import.meta.url)('../../camera/adaptation.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const jouer = (ad, secondes, f, depart = 0) => { const sorties = []; for (let i = 0; i < secondes; i++) sorties.push(ad.echantillon({ t: depart + i, ...f(depart + i) })); return sorties; };
const actions = s => s.filter(x => x.action !== 'rien');

{ const ad = A.creerAdaptation({ niveau: 2 }), s = jouer(ad, 6, () => ({ camFps: 58, detFps: 20, detMs: 48 }));
  v('détection lente (20 images/s, 48 ms) alors que la caméra suit : on baisse la résolution d’un niveau', actions(s).length === 1 && actions(s)[0].action === 'baisser' && actions(s)[0].niveau === 1, JSON.stringify(actions(s)));
  v('la raison est en français et chiffrée', /Détection trop lente \(20 images\/s, 48 ms par image\)/.test(actions(s)[0].raison), actions(s)[0].raison); }
{ const ad = A.creerAdaptation({ niveau: 2 }), s = jouer(ad, 30, () => ({ camFps: 58, detFps: 20, detMs: 48 }));
  v('toujours lent : un niveau de plus après le repos, jamais deux d’un coup', actions(s).map(x => x.niveau).join() === '1,0', actions(s).map(x => x.niveau).join());
  v('au plus bas niveau et toujours lent : on PROPOSE le calcul sur le PC (jamais activé tout seul)', s.some(x => x.proposerPc) && !s.some(x => x.action === 'pc'), s.length); }
{ const ad = A.creerAdaptation({ niveau: 2, auto: false }), s = jouer(ad, 20, () => ({ camFps: 58, detFps: 15, detMs: 60 }));
  v('adaptation automatique coupée (retour manuel) : aucune décision, la résolution ne bouge pas', actions(s).length === 0 && ad.etat().niveau === 2); }
{ const ad = A.creerAdaptation({ niveau: 2 }), s = jouer(ad, 10, () => ({ camFps: 24, detFps: 24, detMs: 9 }));
  v('caméra lente à cause de la lumière (24 images/s, détection qui suit) : conseil « plus de lumière »', s.some(x => x.lumiere) && /plus de lumière/.test(s.find(x => x.lumiere).raison)); }
{ const ad = A.creerAdaptation({ niveau: 0, niveauMax: 2 }), s = jouer(ad, 30, () => ({ camFps: 60, detFps: 60, detMs: 7 }));
  v('stable et rapide pendant 12 s : on remonte d’un niveau, pas plus', actions(s).length >= 1 && actions(s)[0].action === 'monter' && actions(s)[0].niveau === 1, JSON.stringify(actions(s).map(x => x.niveau)));
  v('jamais au-dessus du maximum choisi', jouer(A.creerAdaptation({ niveau: 1, niveauMax: 1 }), 60, () => ({ camFps: 60, detFps: 60, detMs: 7 })).every(x => x.action === 'rien')); }
{ // oscillation : monte, retombe tout de suite → verrouillage de 2 minutes
  const ad = A.creerAdaptation({ niveau: 1, niveauMax: 2 }); let t = 0, montees = 0;
  for (let cycle = 0; cycle < 4; cycle++) { const rapide = jouer(ad, 25, () => ({ camFps: 60, detFps: 60, detMs: 7 }), t); t += 25; montees += actions(rapide).filter(x => x.action === 'monter').length; jouer(ad, 12, () => ({ camFps: 58, detFps: 20, detMs: 50 }), t); t += 12; }
  v('anti-oscillation : après être redescendu juste après une montée, on cesse de remonter pendant un moment (au plus 2 montées en 4 cycles)', montees <= 2, 'montées ' + montees); }
{ const ad = A.creerAdaptation({ niveau: 2 }), s = jouer(ad, 40, t => ({ camFps: 60, detFps: t < 16 ? 58 : 58 - (t - 16) * 1.6, detMs: 8 }));
  v('cadence qui s’effondre avec le temps : mode économe signalé', s.some(x => x.eco), s.length); }
{ const ad = A.creerAdaptation({ niveau: 2 }), s = jouer(ad, 12, () => ({ camFps: 58, detFps: 57, detMs: 9 }));
  v('tout va bien : aucune décision inutile', actions(s).length === 0 && s.every(x => !x.proposerPc && !x.lumiere)); }
console.log('Adaptation de la caméra : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
