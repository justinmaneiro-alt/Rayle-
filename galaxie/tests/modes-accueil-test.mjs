// Tests des modes de l'accueil. Lancer :  node galaxie/tests/modes-accueil-test.mjs
import { MODES, detecterMode, modeEffectif } from '../../skins/neurone/modes-accueil.js';
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const nom = e => MODES[detecterMode(e)].nom;
v('trois modes, du plus lourd au plus léger', MODES.map(m => m.nom).join() === 'complet,normal,leger' && MODES[0].nuee > MODES[1].nuee && MODES[1].nuee > MODES[2].nuee);
v('le complet a la lueur de la galaxie haute, le léger n\'en a pas', MODES[0].bloom && MODES[0].force === 0.85 && !MODES[2].bloom);
v('PC gamer : complet', nom({ largeur: 2560, coeurs: 16, memoire: 8, gpu: 'ANGLE (NVIDIA GeForce RTX 3070)' }) === 'complet');
v('PC modeste (4 cœurs) : normal', nom({ largeur: 1920, coeurs: 4, memoire: 8 }) === 'normal');
v('PC avec peu de mémoire : normal', nom({ largeur: 1920, coeurs: 8, memoire: 4 }) === 'normal');
v('tablette milieu de gamme : normal', nom({ largeur: 820, tactile: true, coeurs: 8, memoire: 4 }) === 'normal');
v('tablette faible : léger', nom({ largeur: 820, tactile: true, coeurs: 4, memoire: 2 }) === 'leger');
v('téléphone : léger', nom({ largeur: 390, tactile: true, coeurs: 8, memoire: 8 }) === 'leger');
v('rendu logiciel (SwiftShader) : léger', nom({ largeur: 1920, coeurs: 16, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' }) === 'leger');
v('GPU mobile faible (Mali-T) : léger', nom({ largeur: 1000, tactile: true, coeurs: 8, memoire: 8, gpu: 'Mali-T720' }) === 'leger');
v('mémoire inconnue (Safari, Firefox) : pas de pénalité', nom({ largeur: 1920, coeurs: 8, memoire: null }) === 'complet');
v('environnement vide : valeur par défaut valide', detecterMode() >= 0 && detecterMode() <= 2);
v('choix manuel prioritaire', modeEffectif(2, { largeur: 2560, coeurs: 16 }) === 2 && modeEffectif('1', { largeur: 390 }) === 1 && modeEffectif(0, { largeur: 390 }) === 0);
v('auto ou valeur étrangère : détection', modeEffectif('auto', { largeur: 390 }) === 2 && modeEffectif(3, { largeur: 2560, coeurs: 16 }) === 0 && modeEffectif(null, { largeur: 390 }) === 2);
// ── le PC de Justin : Ryzen 7 7700X (16 fils), RTX 3070, 32 Go (Chrome annonce 8 au maximum), écran 1440p ──
import { largeurAppareil } from '../../skins/neurone/modes-accueil.js';
const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const pc = (fenetre, hauteur = 800) => ({ largeur: largeurAppareil({ largeurFenetre: fenetre, hauteurFenetre: hauteur, largeurEcran: 2560, tactile: false }), tactile: false, memoire: 8, coeurs: 16, gpu: RTX });
v('Ryzen 7 7700X + RTX 3070, fenêtre plein écran : complet', nom(pc(2560, 1300)) === 'complet');
v('même PC, petite fenêtre de Chrome (900 px) : complet (on compte l ecran, pas la fenetre)', nom(pc(900, 700)) === 'complet' && nom(pc(480, 700)) === 'complet');
v('même PC avec un écran tactile mais la souris comme pointeur : complet', nom({ ...pc(1400), tactile: false }) === 'complet');
v('largeur : fenetre pour un telephone, ecran pour un PC', largeurAppareil({ largeurFenetre: 390, hauteurFenetre: 844, largeurEcran: 390, tactile: true }) === 390 && largeurAppareil({ largeurFenetre: 900, hauteurFenetre: 700, largeurEcran: 2560, tactile: false }) === 2560);
v('téléphone en paysage : toujours léger', nom({ largeur: largeurAppareil({ largeurFenetre: 844, hauteurFenetre: 390, largeurEcran: 844, tactile: true }), tactile: true, memoire: 8, coeurs: 8, gpu: 'Adreno (TM) 730' }) !== 'complet');
console.log(`${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
