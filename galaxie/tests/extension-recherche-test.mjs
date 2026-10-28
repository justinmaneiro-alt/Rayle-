// Tests des niveaux de la recherche et du plan d'attente (V6) : plus d'impasse « espace épuisé » muette.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/extension-recherche-test.mjs
import { planAttente, heuresAvantChercheur, resteSimulation, NIVEAUX } from '../../strategies/extension-recherche.js';
import { planifierNiveaux, tachesGuidees, tachesFiltrees, RONDES_GUIDEES } from '../../agent-pc/extension.mjs';
import { ORDRE_TOUT, empreinteTache } from '../../agent-pc/recherche.mjs';
import { ORDRE_FILTREES } from '../../strategies/familles-filtrees.js';
import { EXIGENCES_V4 } from '../../strategies/familles-v4.js';
import { etatInitial } from '../../strategies/agent-etat.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

const T0 = Date.UTC(2026, 9, 28, 14, 0, 0), H = 3600e3;
v('trois niveaux nommés', NIVEAUX.length === 3 && NIVEAUX.every((n, i) => n.id === i && n.nom.length > 10));
v('Chercheur : déjà passé aujourd’hui → heures jusqu’à minuit UTC ; pas encore → tout de suite', Math.abs(heuresAvantChercheur(T0 - 3 * H, T0) - 10) < 1e-9 && heuresAvantChercheur(T0 - 30 * H, T0) === 0 && heuresAvantChercheur(null, T0) === 0);
const cand = (n, jours) => ({ id: 'c', nom: 'Cassure', paire: 'BTC', type: 'historique', statut: 'active', debut: T0 - jours * 86400e3, trades: Array.from({ length: n }, () => ({ R: 0.1 })) });
const rs = resteSimulation(cand(10, 14), T0);
v('simulation directe : 10 trades en 2 semaines → 5 trades/semaine → il en faut 20 de plus = 4 semaines, limite « trades »', Math.abs(rs.rythme - 5) < 1e-9 && Math.abs(rs.semaines - 4) < 1e-9 && rs.limite === 'trades', JSON.stringify(rs));
v('30 trades déjà faits en 1 semaine : il ne reste que le temps (3 semaines)', (() => { const r = resteSimulation(cand(40, 7), T0); return Math.abs(r.semaines - 3) < 1e-9 && r.limite === 'temps'; })());
v('aucun trade : durée inconnue (pas de chiffre inventé)', resteSimulation(cand(0, 7), T0).semaines === Infinity);

const fini = NIVEAUX.map(n => ({ ...n, total: 100, faits: 100 })), enCours = NIVEAUX.map((n, i) => ({ ...n, total: 100, faits: i === 1 ? 40 : 100 }));
const p1 = planAttente({ niveaux: enCours, maintenant: T0, variantes: 5000 });
v('tant qu’un niveau a des tâches : pas d’attente, la phrase dit où on en est', p1.attente === false && /niveau 1/.test(p1.phrase) && /60 tâche/.test(p1.phrase));
const p2 = planAttente({ niveaux: fini, maintenant: T0, variantes: 24630, pepiniere: { candidates: [cand(10, 14), { ...cand(3, 10), type: 'carnet' }] }, equipe: { derniereExecution: T0 - 2 * H }, reglage: { fichierPresent: false }, actifsExtra: [], pistes: [{ nom: 'Tendance H4', paire: 'SOL', manque: [{ texte: 'il manque 40 trades hors échantillon' }] }] });
v('espace élargi épuisé : attente + ce qu’on attend (pépinière, Chercheur), pendant combien de temps', p2.attente === true && /espace défini ET élargi/.test(p2.lignes[0]) && /Ce que j’attends/.test(p2.lignes[1]) && /pépinière/.test(p2.lignes[1]) && /Chercheur/.test(p2.lignes[1]) && p2.reprise && /prochaine échéance/.test(p2.reprise.texte), JSON.stringify(p2.lignes));
v('…avec les chiffres : variantes testées, 4 semaines pour la candidate, séance du Chercheur dans ≈ 10 heures', /24\s?630/.test(p2.lignes[0]) && /4 semaine/.test(p2.lignes[1]) && /10 heure/.test(p2.lignes[1]), p2.lignes[1]);
v('…ce que Justin peut faire (couts.json, ajouter un actif) et la meilleure piste', /couts\.json/.test(p2.lignes[2]) && /ajouter-actif/.test(p2.lignes[2]) && /Meilleure piste : Tendance H4 sur SOL/.test(p2.lignes.join(' ')));
v('la reprise estimée est la plus proche échéance (Chercheur dans 10 h < 4 semaines)', Math.abs(p2.reprise.heures - 10) < 1e-6);
const p3 = planAttente({ niveaux: fini, maintenant: T0, pepiniere: { candidates: [] }, equipe: { derniereExecution: null }, reglage: { fichierPresent: true }, actifsExtra: ['ETH'] });
v('Chercheur à solliciter tout de suite : le plan le dit ; rien à demander à Justin si tout est fait', /je le sollicite maintenant/.test(p3.lignes[1]) && p3.lignes.length === 2);

// ── planification des niveaux ──
const etat = etatInitial(T0), debutFinal = { BTC: 1, SOL: 1, DOGE: 1 }, paires = ['BTC', 'SOL', 'DOGE'], aucun = { has: () => false };
const sansFlux = ORDRE_TOUT.filter(f => !EXIGENCES_V4[f]);
const g = tachesGuidees(etat, { paires, debutFinal, cache: aucun });
v('niveau 1 : rondes × familles (sans celles qui exigent le carnet) × actifs', g.length === RONDES_GUIDEES * sansFlux.length * 3 && g.every(t => t.type === 'guidee' && t.ronde >= 1 && t.gen === 0), g.length + ' vs ' + RONDES_GUIDEES * sansFlux.length * 3);
v('chaque ronde a sa propre empreinte (graines différentes = résultats différents, jamais confondus)', new Set(g.map(t => t.empreinte)).size === g.length);
const f = tachesFiltrees(etat, { paires, debutFinal, cache: aucun, derivesDispo: { BTC: true, SOL: true, DOGE: true } }), f2 = tachesFiltrees(etat, { paires, debutFinal, cache: aucun, derivesDispo: {} });
v('niveau 2 : 96 familles filtrées × 3 actifs ; sans données de financement, les 12 familles « financement » × 3 actifs sont laissées de côté', f.length === ORDRE_FILTREES.length * 3 && f2.length === (ORDRE_FILTREES.length - 12) * 3 && f.every(t => t.type === 'exploration'), f.length + ' / ' + f2.length);
const e2 = etatInitial(T0); e2.backtests.push({ famille: 'tendance_pullback_h4', paire: 'SOL', esperance: 0.2, trades: 150 });
v('les (famille, actif) qui ont déjà montré quelque chose passent d’abord', tachesGuidees(e2, { paires, debutFinal, cache: aucun })[0].famille === 'tendance_pullback_h4' && tachesFiltrees(e2, { paires, debutFinal, cache: aucun, derivesDispo: { BTC: true, SOL: true, DOGE: true } })[0].famille.startsWith('tendance_pullback_h4+'));
const pl = planifierNiveaux(etat, { paires, debutFinal, cache: aucun, derivesDispo: { BTC: true, SOL: true, DOGE: true } });
v('au départ : on est au niveau 0 et les trois niveaux sont comptés', pl.niveau === 0 && pl.niveaux.length === 3 && pl.niveaux.every(n => n.total > 0 && n.faits === 0) && pl.taches.length === pl.niveaux[0].total);
const fait0 = new Set(planifierNiveaux(etat, { paires, debutFinal, cache: aucun, derivesDispo: {} }).taches.map(t => t.empreinte));
const pl2 = planifierNiveaux(etat, { paires, debutFinal, cache: { has: e => fait0.has(e) }, derivesDispo: { BTC: true, SOL: true, DOGE: true } });
v('niveau 0 entièrement fait → on passe au niveau 1 (guidée)', pl2.niveau === 1 && pl2.taches.every(t => t.type === 'guidee') && pl2.niveaux[0].faits === pl2.niveaux[0].total);
const tout = new Set([...fait0, ...g.map(t => t.empreinte), ...f.map(t => t.empreinte)]);
const pl3 = planifierNiveaux(etat, { paires, debutFinal, cache: { has: e => tout.has(e) }, derivesDispo: { BTC: true, SOL: true, DOGE: true } });
v('tout fait : plus aucun niveau, plus aucune tâche (c’est alors seulement que le plan d’attente prend la parole)', pl3.niveau === null && pl3.taches.length === 0 && pl3.niveaux.every(n => n.faits === n.total));
v('les coûts de couts.json changent les empreintes : la recherche est refaite avec les vrais coûts', empreinteTache({ famille: 'tendance_ma', paire: 'BTC', grille: {}, debutFinal: 1, type: 'exploration', couts: 'abcd1234' }) !== empreinteTache({ famille: 'tendance_ma', paire: 'BTC', grille: {}, debutFinal: 1, type: 'exploration', couts: '' }));
console.log('Niveaux de recherche et plan d’attente : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
