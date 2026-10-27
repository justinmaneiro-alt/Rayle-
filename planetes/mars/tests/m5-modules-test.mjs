import { creerBibliotheque, STATUTS } from '../pc/agent-btc/bibliotheque.js';
import { correlations, combiner, chevauchements, serieJournaliere } from '../pc/agent-btc/portefeuille.js';
import { evaluerDerive, prochainStatut, progressionConfirmation } from '../pc/agent-btc/derive.js';
import { diagnostiquer, statGroupe } from '../pc/agent-btc/diagnostic.js';
import { enrichirTrades, expliquerTrade } from '../pc/agent-btc/contexte-trades.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { CRITERES2 } from '../pc/agent-btc/criteres-v2.js';
import { alea } from '../pc/mars-calcul.js';
import { marcheMixte } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const leve = (f) => { try { f(); return false; } catch (e) { return true; } };
const A = alea(11), gauss = () => { let s = 0; for (let i = 0; i < 12; i++) s += A(); return s - 6; };
const JOUR = 86400e3, T0 = Date.UTC(2024, 0, 1);

// ── bibliothèque : aucune validation « forcée » ──
{
  const b = creerBibliotheque();
  v('ajouter validee interdit', leve(() => b.ajouter({ nom: 'x', famille: 'f', params: {}, statut: 'validee' })));
  const s = b.ajouter({ nom: 'Test', famille: 'retour_poc', params: { R: 4 } });
  v('naît en recherche, inactive', s.statut === 'en_recherche' && !s.active);
  v('changerStatut → validee interdit', leve(() => b.changerStatut(s.id, 'validee', 'je veux')));
  v('valider sans preuve refusé', leve(() => b.valider(s.id, null)));
  v('valider avec hors échantillon non tenu refusé', leve(() => b.valider(s.id, { criteresVersion: 2, horsEchantillon: { ok: false }, jeuFinal: { ok: true } })));
  v('valider avec jeu final non tenu refusé', leve(() => b.valider(s.id, { criteresVersion: 2, horsEchantillon: { ok: true }, jeuFinal: { ok: false } })));
  const preuve = { criteresVersion: 2, horsEchantillon: { ok: true, stats: { n: 160, Rtotal: 30 } }, jeuFinal: { ok: true }, nVariantesAvant: 5000, testsAvant: ['a', 'b'], attendu: { esperance: 0.3, sigma: 1.2, ddP95: 10 } };
  b.valider(s.id, preuve); v('validation avec preuve complète', s.statut === 'validee' && s.active && s.preuve.nVariantesAvant === 5000);
  v('rejetée → plus de transition', (() => { const r = b.ajouter({ nom: 'r', famille: 'f', params: {} }); b.rejeter(r.id, 'jeu final raté'); return leve(() => b.changerStatut(r.id, 'validee', '')) && leve(() => b.activer(r.id)); })());
  // dupliquer ne copie pas la validation
  const c = b.dupliquer(s.id); v('copie = en recherche, sans preuve, inactive', c.statut === 'en_recherche' && !c.preuve && !c.active && c.id !== s.id);
  // export / import
  const txt = b.exporter(), b2 = creerBibliotheque(); const r = b2.importer(txt);
  v('import conserve la validation vérifiée', r.ajoutees === 3 && b2.trouver(s.id).statut === 'validee' && r.degradees === 0, JSON.stringify(r));
  const forge = JSON.parse(txt); forge.strategies.find(x => x.id === c.id).statut = 'validee';
  const b3 = creerBibliotheque(); const r3 = b3.importer(JSON.stringify(forge));
  v('un fichier modifié à la main (validation forgée) est dégradé', b3.trouver(c.id).statut === 'en_recherche' && r3.degradees >= 1, JSON.stringify(r3));
  const forge2 = JSON.parse(txt); forge2.strategies.find(x => x.id === s.id).preuve.horsEchantillon.ok = false;
  const b4 = creerBibliotheque(); b4.importer(JSON.stringify(forge2)); v('preuve falsifiée → dégradée', b4.trouver(s.id).statut === 'en_recherche');
  v('import refuse un mauvais fichier', leve(() => b3.importer('{"a":1}')) && leve(() => b3.importer('pas du json')));
  v('import ignore les doublons', b2.importer(txt).ignorees === 3);
  // suspension / réactivation / suppression
  b.suspendre(s.id, 'test'); v('suspendre → suspendue, inactive', s.statut === 'suspendue' && !s.active);
  v('activer une suspendue interdit', leve(() => b.activer(s.id)));
  b.reactiver(s.id); v('réactivation manuelle → validée, suivi à zéro', s.statut === 'validee' && s.live.trades.length === 0 && s.active);
  v('supprimer', b.supprimer(s.id) && !b.trouver(s.id) && !b.supprimer(s.id));
  v('persistance : etat() → creerBibliotheque(etat)', creerBibliotheque(JSON.parse(JSON.stringify(b.etat()))).liste().length === b.liste().length);
}

// ── dérive ──
{
  const attendu = { esperance: 0.3, sigma: 1.2, ddP95: 8 };
  const bons = Array.from({ length: 30 }, () => ({ R: 0.3 + 1.2 * gauss() }));
  v('comportement conforme → ok', evaluerDerive(bons, attendu).statut === 'ok');
  v('trop peu de trades → pas de verdict', evaluerDerive(bons.slice(0, 5), attendu).insuffisant === true);
  const mauvais = Array.from({ length: 30 }, () => ({ R: -0.6 + 1.2 * gauss() }));
  const em = evaluerDerive(mauvais, attendu); v('dégradation nette → surveillance ou suspension', ['surveillance', 'suspendue'].includes(em.statut) && /Dérive/.test(em.raison), JSON.stringify([em.statut, em.z]));
  const terrible = Array.from({ length: 40 }, () => ({ R: -1 }));
  v('pertes continues → suspendue', evaluerDerive(terrible, attendu).statut === 'suspendue');
  v('suspendue reste suspendue même si ça remonte', prochainStatut('suspendue', bons, attendu).statut === 'suspendue');
  v('surveillance → retour normal si z ≥ 0', prochainStatut('surveillance', Array.from({ length: 12 }, () => ({ R: 0.5 })), attendu).statut === 'validee');
  const vingt = Array.from({ length: 22 }, (_, i) => ({ R: i % 3 === 0 ? -1 : 1 }));
  v('confirmée en réel après le nombre de trades sans dérive', prochainStatut('validee', vingt, attendu).statut === 'confirmee', JSON.stringify(prochainStatut('validee', vingt, attendu).statut));
  v('pas confirmée avant le nombre de trades', prochainStatut('validee', vingt.slice(0, 12), attendu).statut === 'validee');
  v('progression confirmation', progressionConfirmation(vingt.slice(0, 5)).texte.includes('5 trades simulés en direct sur 20'));
  // via la bibliothèque : une stratégie qui se dégrade passe en surveillance puis suspendue
  const b = creerBibliotheque(), s = b.ajouter({ nom: 'D', famille: 'f', params: {} });
  b.valider(s.id, { criteresVersion: 2, horsEchantillon: { ok: true }, jeuFinal: { ok: true }, nVariantesAvant: 1, attendu });
  let dernier = null; for (let i = 0; i < 40; i++) dernier = b.enregistrerTradeLive(s.id, { R: -1, t: i });
  v('bibliothèque : dégradation continue → suspendue, inactive, raison écrite', s.statut === 'suspendue' && !s.active && s.historique.some(h => h.vers === 'surveillance' || h.vers === 'suspendue') && /Dérive/.test(s.historique[s.historique.length - 1].raison), s.statut);
}

// ── portefeuille ──
{
  const mk = (id, nom, f) => ({ id, nom, trades: Array.from({ length: 200 }, (_, i) => ({ t: T0 + i * JOUR, tSortie: T0 + i * JOUR + 6 * 3600e3, R: f(i), sens: 1, barres: 24 })) });
  const a = mk('a', 'A', () => gauss()), copie = { id: 'c', nom: 'C', trades: a.trades.map(x => ({ ...x })) }, anti = { id: 'n', nom: 'N', trades: a.trades.map(x => ({ ...x, R: -x.R })) }, indep = mk('i', 'I', () => gauss());
  const c = correlations([a, copie, anti, indep]);
  v('corrélation avec soi-même = 1, copie = 1', Math.abs(c.matrice[0][0] - 1) < 1e-9 && Math.abs(c.matrice[0][1] - 1) < 1e-9);
  v('corrélation opposée = −1', Math.abs(c.matrice[0][2] + 1) < 1e-9);
  v('indépendante proche de 0', Math.abs(c.matrice[0][3]) < 0.25, c.matrice[0][3]);
  v('matrice symétrique', c.matrice[1][3] === c.matrice[3][1]);
  const ch = chevauchements([a, copie]); v('chevauchements de deux copies : 200 paires', ch.nombre === 200, ch.nombre);
  const comb = combiner([a, copie], { maxSimultanees: 1 }); v('une seule position à la fois : la copie est écartée', comb.acceptes.length === 200 && comb.ecartes.length === 200, comb.acceptes.length + '/' + comb.ecartes.length);
  const comb2 = combiner([a, copie], { maxSimultanees: 2 }); v('2 simultanées : tout est accepté', comb2.acceptes.length === 400);
  v('courbe de capital combinée : longueur = trades + 1', comb.courbeR.length === 201);
  const x = combiner([a, indep]); v('stats combinées cohérentes', Math.abs(x.stats.Rtotal - x.acceptes.reduce((s, t) => s + t.R, 0)) < 1e-9);
  const sj = serieJournaliere(a.trades, Math.floor(T0 / JOUR), Math.floor(T0 / JOUR) + 199); v('série journalière = un trade par jour', sj.length === 200 && Math.abs(sj[0] - a.trades[0].R) < 1e-12);
}

// ── contexte des trades et diagnostic ──
{
  const m15 = marcheMixte(30000), ctx = construireContexte(m15);
  const tr = []; for (let i = 3000; i < 29000; i += 217) tr.push({ signal: i, entree: i + 1, sortie: i + 20, t: m15.t[i + 1], tSortie: m15.t[i + 20], sens: i % 2 ? 1 : -1, R: gauss() * 1.2 + (i % 3 === 0 ? 0.8 : -0.1), barres: 20, motif: 'stop' });
  const e = enrichirTrades(tr, ctx);
  v('trades enrichis : tous les champs', e.every(x => x.phase && x.session && x.vol && x.jour && x.saison && x.trimestre && x.regime));
  v('pas de mutation des originaux', tr[0].phase === undefined);
  // le contexte vient de l'index du signal : même résultat si on tronque la série juste après le signal (pas de regard vers le futur)
  const i = tr[5].signal, cut = construireContexte({ ...m15, n: i + 1, t: m15.t.subarray(0, i + 1), o: m15.o.subarray(0, i + 1), h: m15.h.subarray(0, i + 1), l: m15.l.subarray(0, i + 1), c: m15.c.subarray(0, i + 1), v: m15.v.subarray(0, i + 1), vb: m15.vb.subarray(0, i + 1) });
  const e2 = enrichirTrades([tr[5]], cut)[0];
  v('contexte du trade identique avec la série coupée au signal (sans futur)', e2.phase === e[5].phase && e2.phaseH4 === e[5].phaseH4 && e2.vol === e[5].vol && Math.abs(e2.volRel - e[5].volRel) < 1e-9, JSON.stringify([e2.phase, e[5].phase, e2.vol, e[5].vol]));
  const d = diagnostiquer(e, { nomStrategie: 'Test' });
  v('diagnostic : 8 dimensions, résumé en français', d.dimensions.length === 8 && d.resume.length >= 3 && /Au total/.test(d.resume[0]));
  v('somme des groupes = total (chaque dimension)', d.dimensions.every(dim => dim.groupes.reduce((s, g) => s + g.n, 0) === e.length));
  // un groupe trop petit ne conclut pas
  const petit = diagnostiquer(e.slice(0, 5)); v('petit échantillon : « trop peu pour conclure »', petit.dimensions[0].groupes.every(g => /trop peu/.test(g.phrase)));
  // groupe clairement mauvais détecté
  const biaise = e.map(x => ({ ...x, session: 'Asie', R: -1 })); const db = diagnostiquer(biaise); v('groupe clairement perdant → « ça ne marche pas »', /ça ne marche pas/.test(db.dimensions.find(x => x.cle === 'session').groupes[0].phrase) && /Quand ça ne marche pas/.test(db.resume.join(' ')));
  v('avertissement exploratoire présent', /Exploratoire/.test(d.avertissement));
  const ex = expliquerTrade({ ...e[0], motif: 'stop', R: -1.02 }, 'Retour sur POC'); v('explication d’un trade perdant', /Perdant/.test(ex.fin) && /Pris le/.test(ex.pris));
  v('explication d’un trade gagnant', /Gagnant/.test(expliquerTrade({ ...e[0], motif: 'cible', R: 4.2 }, 'X').fin));
}

// ── le nombre de trades de confirmation du PROFIL est respecté ──
{
  const b = creerBibliotheque(), s = b.ajouter({ nom: 'C', famille: 'f', params: {} }), attendu = { esperance: 0.3, sigma: 1.2, ddP95: 8 };
  b.valider(s.id, { criteresVersion: 2, horsEchantillon: { ok: true }, jeuFinal: { ok: true }, nVariantesAvant: 1, attendu });
  const crit = { ...CRITERES2, confirmation: { tradesReels: 10 } };
  for (let i = 0; i < 12; i++) b.enregistrerTradeLive(s.id, { R: i % 2 ? 1 : 0.4, t: i }, 1000 + i, crit);
  v('confirmation avec 10 trades (réglage du profil) au lieu de 20 : CONFIRMÉE EN RÉEL', s.statut === 'confirmee', s.statut);
  const b2 = creerBibliotheque(), s2 = b2.ajouter({ nom: 'C2', famille: 'f', params: {} }); b2.valider(s2.id, { criteresVersion: 2, horsEchantillon: { ok: true }, jeuFinal: { ok: true }, nVariantesAvant: 1, attendu });
  for (let i = 0; i < 12; i++) b2.enregistrerTradeLive(s2.id, { R: i % 2 ? 1 : 0.4, t: i }, 1000 + i);
  v('avec le réglage par défaut (20 trades), 12 trades ne suffisent pas', s2.statut === 'validee', s2.statut);
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
