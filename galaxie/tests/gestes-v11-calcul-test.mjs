// V11 : textes et logique PURS de l'aide des gestes (core/gestes/gestes-v11-calcul.js) — geste détecté en direct, aide « Que puis-je faire ? ».
// Lancer : node galaxie/tests/gestes-v11-calcul-test.mjs
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url);
const G = R('../../core/gestes/gestes-v11-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
v('5 gestes en mode simple, dans l’ordre de l’apprentissage', G.GESTES_SIMPLES.length === 5 && G.GESTES_SIMPLES.map(g => g.id).join() === 'pointer,pincer,balayer,deux,paume');
v('chaque geste a un titre, une explication et un pictogramme', G.GESTES_SIMPLES.every(g => g.titre && g.texte.length > 20 && g.pictogramme));
v('le poing, ranger, fermer, recul sont réservés au mode avancé', ['poing', 'ranger', 'fermer', 'recul'].every(id => G.GESTES_AVANCES.some(g => g.id === id)) && !G.GESTES_SIMPLES.some(g => /poing/i.test(g.titre + g.texte)));
const e = (o = {}) => ({ mode: 'engage', mains: 1, pose: 'pointer', progres: null, saisie: false, deux: null, pause: false, ...o });
v('pointer', G.geste(e()).texte === 'Pointer');
v('paume ouverte', G.geste(e({ pose: 'ouverte' })).texte === 'Paume ouverte');
v('poing : rien ne se passe, le dit simplement', G.geste(e({ pose: 'poing' })).texte === 'Poing');
v('pincer en cours (progression du pincement)', G.geste(e({ progres: { type: 'pince', v: 0.4 } })).texte === 'Pincer…' && G.geste(e({ progres: { type: 'pince', v: 0.4 } })).progres === 0.4);
v('pincé : « Pincer »', G.geste(e({ pose: 'pince' })).texte === 'Pincer');
v('glisser (saisie)', G.geste(e({ saisie: true, pose: 'pince' })).texte === 'Glisser (pincé)');
v('deux mains : agrandir / rétrécir', /agrandir/.test(G.geste(e({ mains: 2, deux: 'pince' })).texte));
v('compte à rebours de la paume : « accueil dans 0.8 s »', G.geste(e({ pose: 'ouverte', progres: { type: 'reset', v: 0.5 } })).texte === 'Paume : accueil dans 0.8 s' && G.geste(e({ pose: 'ouverte', progres: { type: 'reset', v: 0.5 } })).progres === 0.5);
v('pause en cours (mode avancé) : annulable', /rouvre la main/.test(G.geste(e({ pose: 'poing', progres: { type: 'pause', v: 0.3 } })).texte));
v('fermeture en attente de confirmation', /Fermer cette fenêtre/.test(G.geste(e({ pose: 'ouverte', progres: { type: 'fermer', v: 0.2 } })).texte));
v('en pause : le dit avec le moyen de reprendre', /En pause/.test(G.geste(e({ mode: 'pause', pause: true })).texte) && /reprends les gestes/.test(G.geste(e({ mode: 'pause', pause: true })).texte));
v('main vue mais pas encore engagée : « je m’active… » avec progression', G.geste(e({ mode: 'repos', progres: { type: 'engage', v: 0.5 } })).texte.startsWith('Main vue') && G.geste(e({ mode: 'repos', progres: { type: 'engage', v: 0.5 } })).progres === 0.5);
v('aucune main : aucune étiquette', G.geste(e({ mode: 'sans-main', mains: 0 })).texte === '' && G.geste(null).texte === '');
v('événement récent (clic < 0,7 s) affiché, puis oublié', G.geste(e(), { type: 'clic', n: 1, age: 200 }).texte === 'Clic' && G.geste(e(), { type: 'clic', n: 1, age: 900 }).texte === 'Pointer');
v('double clic et balayage', G.geste(e(), { type: 'clic', n: 2, age: 100 }).texte === 'Double clic' && G.geste(e(), { type: 'balayage', sens: 'droite', age: 100 }).texte === 'Balayage droite');
v('texte d’aide parlé : 5 gestes + pause par bouton / voix, sans poing en mode simple', /1\. Pointer/.test(G.texteAide(false)) && /5\. Paume ouverte/.test(G.texteAide(false)) && /pause les gestes/.test(G.texteAide(false)) && !/Poing/.test(G.texteAide(false)));
v('texte d’aide du mode avancé : ajoute les gestes avancés', /Mode avancé en plus/.test(G.texteAide(true)) && /Poing tenu 2 s/.test(G.texteAide(true)));
console.log('Gestes V11 (textes) : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
