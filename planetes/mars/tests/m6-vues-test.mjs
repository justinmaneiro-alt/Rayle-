import { creerM6 } from '../pc/agent-m6/m6-etat.js';
import * as V from '../pc/trading/poste-vues-m6.js';
import { carteStrategie } from '../pc/trading/poste-vues.js';

/* Les vues M6 sont des fonctions pures qui rendent du HTML : on vérifie qu'elles rendent sans erreur sur un état neuf et sur un état rempli,
   qu'aucune valeur manquante ne s'affiche (« undefined », « NaN »), que tout texte venant de l'utilisateur est échappé, et que les mentions d'honnêteté sont là. */
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const propre = html => typeof html === 'string' && html.length > 50 && !/undefined|NaN|\[object/.test(html);
const NOW = Date.UTC(2026, 9, 23, 14), H = 3600e3;
const m = creerM6({ etat: null, maintenant: () => NOW });
const MAL = '<img src=x onerror=alert(1)>';

// ── état neuf ──
const vue = m.vue();
const gard = V.vueGardien(vue);
v('gardien (état neuf) : rendu propre, niveau, mises en garde, limites du compte', propre(gard) && /VERT/.test(gard) && /Perte du jour/.test(gard) && /Drawdown/.test(gard), gard.slice(0, 120));
v('gardien : le formulaire de contrôle avant trade propose les trois paires', ['BTC', 'SOL', 'DOGE'].every(p => gard.includes('value="' + p + '"')));
v('gardien : les règles sont dans le bloc EXPERT', /class="pa-x">/.test(gard));
v('gardien : étiquette RÉEL (saisi par toi)', /RÉEL/.test(gard));
v('tilt (état neuf) : rendu propre', propre(V.vueTilt(vue)));
v('journal (état neuf) : rendu propre, ajout manuel et import CSV proposés', (() => { const j = V.vueJournal(vue, {}); return propre(j) && /data-form="trade"|data-form="journal"|csv/i.test(j); })());

// ── contrôle avant trade : PASS puis BLOQUÉ (sans stop) affichés comme tels ──
const ctlOk = m.controle({ paire: 'BTC', sens: 1, entree: 80000, stop: 79200, objectif: 82400 });
const htmlOk = V.vueGardien(m.vue(), { controle: ctlOk, paire: 'BTC' });
v('contrôle conforme : affiché PASS avec 9 points', propre(htmlOk) && /<b>PASS<\/b>/.test(htmlOk) && (htmlOk.match(/<li class="pa-pt-/g) || []).length >= 9);
const ctlKo = m.controle({ paire: 'BTC', sens: 1, entree: 80000, stop: 0, objectif: 82400 });
const htmlKo = V.vueGardien(m.vue(), { controle: ctlKo, paire: 'BTC' });
v('contrôle sans stop : affiché BLOQUÉ', ctlKo.decision === 'BLOCK' && propre(htmlKo) && /<b>BLOQUÉ<\/b>/.test(htmlKo));

// ── échappement : le texte de l'utilisateur ne devient jamais du HTML ──
m.commande({ type: 'journal_ajouter', trade: { paire: 'BTC', sens: 'achat', t: NOW - 6 * H, tSortie: NOW - 5 * H, prixEntree: 80000, prixSortie: 79900, quantite: 0.05, strategie: MAL, frais: 1, note: MAL } });
const j2 = V.vueJournal(m.vue(), {});
v('journal : un nom de stratégie piégé ne devient jamais du HTML (nettoyé à la saisie et échappé à l’affichage)', propre(j2) && !j2.includes('<img'));
m.commande({ type: 'idee_coller', texte: MAL + ' acheter quand le RSI est bas', titre: MAL });
const idees = V.vueIdees(m.vue(), {});
v('idées : titre et texte collés piégés ne deviennent jamais du HTML', propre(idees) && !idees.includes('<img'));
v('idées : catalogue absent → invite à le charger, bouton présent', /idee-catalogue/.test(idees));
m.commande({ type: 'idee_catalogue' });
const cat = V.vueIdees(m.vue(), {});
v('idées : le catalogue porte ses crédits et ses licences (MIT, Apache-2.0)', /Apache-2\.0/.test(cat) && /MIT/.test(cat));
v('idées : les inspirations sont créditées (4 projets)', ['tradermonty', 'VictorVVedtion', 'SKE-Labs', 'Jakeschincariol'].every(x => cat.includes(x)));
v('idées : un brouillon propose « Traduire en règle » avec son identifiant', /data-a="idee-traduire" data-id="[^"]+"/.test(cat));

// ── simulation, régime, capture, santé ──
const sim0 = V.vueSimulation({ paire: 'BTC' }, null, m.vue());
v('simulation (aucune lancée) : invite à lancer, étiquette HYPOTHÉTIQUE possible, rendu propre', propre(sim0) && /Aucune simulation/.test(sim0) && /HYPOTHÉTIQUE/.test(sim0));
const reg0 = V.vueRegime({ regimes: {} });
v('régime (rien calculé) : un bouton par paire, aucun chiffre inventé', propre(reg0) && (reg0.match(/data-a="regime-calculer"/g) || []).length === 3 && !/\d+\s*\/\s*100/.test(reg0));
const cap0 = V.vueCapture({ paire: 'BTC' }, m.vue());
v('capture (rien déposé) : mention d’envoi unique à Gemini, dépôt, collage', propre(cap0) && /UNE seule fois/.test(cap0) && /data-depot/.test(cap0));
const cap1 = V.vueCapture({ paire: 'BTC', imageApercu: 'data:image/png;base64,AAAA"onerror="x' }, m.vue());
v('capture : l’aperçu est échappé dans l’attribut src', !/src="data:image\/png;base64,AAAA"onerror/.test(cap1));
v('santé (en cours) : message d’attente', /en cours/.test(V.vueSante({})));
const sante = V.vueSante({ sante: { lignes: [{ groupe: 'Données', nom: MAL, etat: 'ok', detail: MAL }, { groupe: 'Recherche', nom: 'Recherche', etat: 'alerte', detail: 'en pause' }], niveau: 'warn', phrase: 'Tout n’est pas vert.' } });
v('santé : groupes et pastilles, texte échappé', /Données/.test(sante) && /Recherche/.test(sante) && !sante.includes(MAL));

// ── coûts et recherche : valeurs réglables et avertissement ──
const couts = V.vueCoutsEtRecherche({ BTC: { vue: { couts: { fraisPct: 0.04, spreadPct: 0.01, glissementPct: 0.01, ok: true } } } });
v('coûts : un formulaire par paire, avertissement « ne change pas les coûts après avoir vu un résultat »', propre(couts) && /data-form="couts"/.test(couts) && /Changer les coûts après avoir vu/.test(couts));

// ── classes d'objectif : la famille principale (4 à 6 R) et la parallèle (2 à 3 R) sont étiquetées à part ──
const carte = (code, R) => carteStrategie({ id: 's', nom: 'Strat', statut: 'validee', active: true, compteSimule: { n: 0, confirmation: { texte: 'pas encore de trade' } }, objectifR: R, classeObjectif: { code, nom: 'nom de classe' } });
v('carte principale : badge « PRINCIPALE 5 R »', /PRINCIPALE 5 R/.test(carte('principale', 5)));
v('carte parallèle : badge « PARALLÈLE 2 R », jamais mélangée à la principale', /PARALLÈLE 2 R/.test(carte('parallele', 2)) && !/PRINCIPALE/.test(carte('parallele', 2)));
v('carte à objectif inconnu : aucun badge de classe', !/PRINCIPALE|PARALLÈLE|INTERMÉDIAIRE/.test(carte('inconnue', null)));

// ── honnêteté ──
v('la note légale est exportée et dit « pas un conseil financier » et « aucun ordre »', /pas un conseil financier/i.test(V.NOTE_LEGALE) && /Aucun ordre/.test(V.NOTE_LEGALE));
const jauge = V.jauge('Perte du jour', 200, 300, 0.67);
v('jauge : accessible (role meter, valeur en %), colorée orange à 67 %', /role="meter"/.test(jauge) && /aria-valuenow="67"/.test(jauge) && /pa-j-warn/.test(jauge));
v('jauge : au-delà de 100 % plafonnée', /aria-valuenow="100"/.test(V.jauge('x', 400, 300, 1.5)));

console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
