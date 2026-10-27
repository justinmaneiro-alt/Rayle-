import { creerPilote, etatPiloteVide } from '../pc/agent-btc/pilote-coeur.js';
import { profilValide, lireConsignes, dansLesHeures, appliquerContraintes, criteresDepuisProfil, comparerCriteres, avertissementSeuils, PROFIL_DEFAUT, uniteAutorisee } from '../pc/agent-btc/profil-agent.js';
import { CRITERES2 } from '../pc/agent-btc/criteres-v2.js';
import { empreinteCriteres } from '../pc/agent-btc/criteres.js';
import { validerRegle } from '../pc/agent-btc/regles-lab.js';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { marcheM5, DERIVE_PLANTEE } from './synth-m5.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

// ── profil et consignes ──
{
  const p = profilValide({ risquePct: 10, maxParSemaine: 99, maxSimultanees: 9, cible: 40, unites: ['xx'], reglesInterdites: ['weekend', 'magie'] });
  v('profil : bornes de sécurité (risque ≤ 2 %, 5 positions, 5 stratégies)', p.risquePct === 2 && p.maxParSemaine === 5 && p.maxSimultanees === 3 && p.cible === 5 && p.unites.length === 3 && p.reglesInterdites.join() === 'weekend');
  v('profil par défaut : une position à la fois, 3 par semaine, objectif +20 R / 150 trades', PROFIL_DEFAUT.maxSimultanees === 1 && PROFIL_DEFAUT.maxParSemaine === 3 && PROFIL_DEFAUT.objectif.rNetMin === 20 && PROFIL_DEFAUT.objectif.tradesMin === 150);
  const l = lireConsignes('Pas de trading le week-end. Maximum 2 positions par semaine. Risque 0,5 %. Uniquement H1 et H4. Jamais à contre-tendance. Objectif +25 R sur 200 trades. Je veux 4 stratégies. Fais-moi un café.');
  v('consignes : week-end, fréquence, risque, unités, contre-tendance, stratégies', l.patch.maxParSemaine === 2 && l.patch.risquePct === 0.5 && l.patch.unites.join() === 'h1,h4' && l.patch.reglesInterdites.includes('weekend') && l.patch.reglesInterdites.includes('contre_tendance') && l.patch.cible === 4, JSON.stringify(l.patch));
  v('consignes : l’objectif est un SEUIL (confirmation requise), pas appliqué au profil', l.seuils && l.seuils.rNetMin === 25 && l.seuils.tradesMin === 200 && !('objectif' in l.patch));
  v('consignes : une phrase incomprise est signalée, jamais devinée', l.nonComprises.length === 1 && /café/.test(l.nonComprises[0]));
  v('consignes : limites de sécurité (risque 9 % → 2 %)', lireConsignes('risque de 9 %').patch.risquePct === 2);
  v('consignes : style prudent', lireConsignes('Je suis prudent').patch.maxParSemaine === 2);
  const a = { actif: true, heureDebut: '22:00', heureFin: '07:00' };
  const pr = profilValide({ arrierePlan: a }); v('heures de recherche : fenêtre qui passe minuit', dansLesHeures(pr, new Date(2026, 0, 5, 23, 30)) && dansLesHeures(pr, new Date(2026, 0, 5, 3, 0)) && !dansLesHeures(pr, new Date(2026, 0, 5, 12, 0)));
  v('recherche en arrière-plan désactivée par défaut', !dansLesHeures(profilValide({}), new Date(2026, 0, 5, 23, 30)));
  // seuils
  const c2 = criteresDepuisProfil(profilValide({ objectif: { rNetMin: 10, tradesMin: 100, rNetHaut: 30 } }));
  const cmp = comparerCriteres(CRITERES2, c2); v('seuils : assouplissement détecté et empreinte différente', cmp.assoupli.length === 2 && cmp.empreinteApres !== cmp.empreinteAvant && /ASSOUPLISSENT/.test(avertissementSeuils(cmp)), JSON.stringify(cmp.assoupli));
  v('seuils : le plancher d’espérance +0,25 R et les critères v1 ne sont pas touchés par le profil', c2.horsEchantillon.esperanceMin === 0.25 && JSON.stringify(c2.jeuFinal) === JSON.stringify(CRITERES2.jeuFinal) && JSON.stringify(c2.robustesse) === JSON.stringify(CRITERES2.robustesse));
  v('profil par défaut = critères v2 exacts', criteresDepuisProfil(profilValide({})) === CRITERES2);
  // contraintes sur les signaux
  const m = marcheM5({ n: 6000, graine: 2 }), ctx = construireContexte(m), sig = { sens: new Int8Array(ctx.n).fill(1), stop: new Float64Array(ctx.n), R: 2 };
  appliquerContraintes(ctx, sig, { reglesInterdites: ['weekend'] }); let faux = 0; for (let i = 0; i < ctx.n; i++) { const j = Math.floor(m.t[i] / 86400e3 + 4) % 7; if ((j === 0 || j === 6) && sig.sens[i]) faux++; if (j > 0 && j < 6 && !sig.sens[i]) faux++; }
  v('contrainte « pas de week-end » : tous les signaux du week-end supprimés, les autres intacts', faux === 0, faux);
  v('unités autorisées : règle H4 interdite si H4 non autorisé', !uniteAutorisee({ famille: 'regle', params: validerRegle({ nom: 'a', cote: 'long', conditions: [{ type: 'cassure', tf: 'h4', N: 20 }], stop: { type: 'atr', tf: 'h4', k: 2 }, R: 2 }).regle }, { unites: ['m15', 'h1'] }) && uniteAutorisee({ famille: 'cassure_range', params: {} }, { unites: ['m15'] }));
}

// ── commandes du pilote ──
{
  let t = 1000; const p = creerPilote({ maintenant: () => (t += 1000) });
  v('commande inconnue refusée', p.commande({ type: 'magie' }).ok === false);
  const s = p.bibliotheque.ajouter({ nom: 'T', famille: 'retour_poc', params: { R: 4 } });
  v('activer une stratégie non validée refusé', p.commande({ type: 'activer', id: s.id }).ok === false);
  v('il n’existe AUCUNE commande pour valider', p.commande({ type: 'valider', id: s.id }).ok === false && p.commande({ type: 'statut', id: s.id, vers: 'validee' }).ok === false);
  // idée libre : traduite en règle par le Worker, VUE et VALIDÉE avant tout test
  const regle = { nom: 'Idée', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3 };
  const r1 = p.commande({ type: 'idee_proposer', regle, texteLibre: 'acheter quand le RSI est très bas', origine: 'idee-libre' });
  v('idée libre : enregistrée EN ATTENTE, description lisible renvoyée', r1.ok && /Achat quand : RSI 14 H1 < 25/.test(r1.description) && p.etat().idees[0].statut === 'a_valider');
  v('idée libre invalide (hors bornes) refusée', p.commande({ type: 'idee_proposer', regle: { ...regle, R: 99 } }).ok === false);
  v('idée libre : pas testée tant qu’elle n’est pas validée', p.vue().recherche.idees.length === 1 && p.etat().idees[0].statut === 'a_valider');
  v('idée : valider → en file', p.commande({ type: 'idee_valider', id: p.etat().idees[0].id }).ok && p.etat().idees[0].statut === 'en_file');
  const r2 = p.commande({ type: 'idee_proposer', regle: { ...regle, nom: 'Autre' } }); p.commande({ type: 'idee_refuser', id: r2.id }); v('idée refusée', p.etat().idees.find(i => i.id === r2.id).statut === 'refusee');
  // seuils
  const emp0 = empreinteCriteres(p.criteres());
  v('seuils : sans confirmation → refusé', p.commande({ type: 'seuils_appliquer', objectif: { rNetMin: 10 } }).ok === false);
  const ap = p.commande({ type: 'seuils_apercu', objectif: { rNetMin: 10 } }); v('seuils : aperçu avec avertissement', ap.ok && /ASSOUPLISSENT/.test(ap.message));
  p.etat().recherche.N = 5000; p.etat().recherche.niveau = 4;
  const sa = p.commande({ type: 'seuils_appliquer', objectif: { rNetMin: 10 }, confirme: true });
  v('seuils : confirmé → nouveaux critères, recherche repart du début, N conservé', sa.ok && empreinteCriteres(p.criteres()) !== emp0 && p.etat().recherche.niveau === 0 && p.etat().recherche.N === 5000 && p.etat().journalReglages.some(x => x.type === 'seuils'));
  v('seuils : aucune stratégie existante n’est modifiée', p.bibliotheque.liste().every(x => x.statut === 'en_recherche'));
  // consignes
  const cl = p.commande({ type: 'consignes_lire', texte: 'Pas de week-end. Maximum 2 positions par semaine.' }); v('consignes : lecture sans application', cl.ok && p.etat().profil.maxParSemaine === 3);
  p.commande({ type: 'consignes_appliquer', texte: 'Pas de week-end. Maximum 2 positions par semaine.' }); v('consignes : application', p.etat().profil.maxParSemaine === 2 && p.etat().profil.reglesInterdites.includes('weekend'));
  v('profil : l’objectif ne se change pas par la commande « profil »', (p.commande({ type: 'profil', patch: { objectif: { rNetMin: 1, tradesMin: 30, rNetHaut: 1 } } }), p.etat().profil.objectif.rNetMin === 10));
}

// ── flux complet sur un marché avec un vrai avantage planté : validation, notification, direct ──
{
  const derive = DERIVE_PLANTEE, m = marcheM5({ n: 110000, graine: 9, derive });
  let t = Date.now(); const p = creerPilote({ maintenant: () => (t += 1) });
  const regle = { nom: 'New York + volume + delta', cote: 'long', conditions: [{ type: 'session', valeurs: [2] }, { type: 'volume', min: 1 }, { type: 'delta', sens: 'avec', ratioMin: 0 }], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 };
  const id = p.commande({ type: 'idee_proposer', regle, origine: 'constructeur' }).id; p.commande({ type: 'idee_valider', id });
  const evts = []; await p.tranche({ m15: m, budget: { chantiersMax: 1, tempsMs: 120000 }, surEvenement: e => evts.push(e.type) });
  const s = p.bibliotheque.liste()[0];
  v('idée validée par l’utilisatrice → testée → VALIDÉE (backtest) avec notification', s && s.statut === 'validee' && p.vue().notifications.some(n => n.type === 'validation' && /VALIDÉE \(backtest\)/.test(n.titre) && /confirmation réelle en cours/.test(n.texte)), s && s.statut);
  v('l’idée testée est marquée « testée »', p.etat().idees.find(i => i.id === id).statut === 'testee');
  const carte = p.vue().strategies[0];
  v('carte : statut, idée en une phrase, avancement vers l’objectif, 3 jeux de résultats séparés', carte.statutLibelle === 'VALIDÉE (backtest)' && /Achat/.test(carte.idee) && carte.horsEchantillon.avancement.atteint && carte.entrainement && carte.jeuFinal && carte.compteSimule.n === 0 && /NE PAS lire comme une performance/.test(carte.entrainement.note));
  v('carte : IC et phrase du Sharpe déflaté', carte.horsEchantillon.ic.bas > 0 && /Probabilité que son avantage soit réel/.test(carte.horsEchantillon.phraseDsr));
  v('carte : confirmation « 0 trade simulé sur 20 »', /0 trade.*sur 20/.test(carte.compteSimule.confirmation.texte));
  v('portefeuille : une stratégie → pas de corrélation, courbe combinée présente', p.portefeuille().combine.n > 100 && p.portefeuille().correlations.moyenne === null);
  const dg = p.diagnosticStrategie(s.id); v('diagnostic : par phase, session… et phrases', dg.dimensions.length === 8 && dg.resume.length >= 3 && dg.dimensions.find(d => d.cle === 'session').groupes.some(g => g.valeur === 'New York'));
  // direct : on rejoue les 4 derniers jours comme des bougies « nouvelles »
  const n0 = m.n - 400, nouv = []; p.etat().derniereBarre = m.t[n0 - 1];
  for (let i = n0; i < m.n; i++) {
    const b = { t: m.t[i], o: m.o[i], h: m.h[i], l: m.l[i], c: m.c[i] }, fen = tranche(m, Math.max(0, i - 5999), i + 1);
    const r = p.traiterBarre({ fenetre: fen, bougie: b, phase: 'range' }); nouv.push(...(r.alertes || []));
  }
  const entrees = nouv.filter(a => a.type === 'ENTREE');
  v('direct : des alertes d’ENTRÉE sont produites, avec le nom de la stratégie d’origine', entrees.length >= 1 && entrees.every(a => a.nomStrategie === s.nom && a.strategie === s.id && /en confirmation réelle en cours/.test(a.texte)), entrees.length);
  v('direct : une seule position à la fois, jamais plus de 3 par semaine', (() => { const sem = new Map(); for (const a of entrees) { const k = Math.floor((a.tSignal / 86400e3 + 3) / 7); sem.set(k, (sem.get(k) || 0) + 1); } return [...sem.values()].every(x => x <= p.etat().profil.maxParSemaine) && p.etat().compte.ouvertes.length <= 1; })());
  v('direct : le compte simulé a clos des trades et alimenté la stratégie', p.etat().compte.fermees.length >= 1 && s.live.trades.length === p.etat().compte.fermees.length, p.etat().compte.fermees.length);
  v('direct : cohérence — chaque alerte a stop et objectif du bon côté', entrees.every(a => a.sens > 0 ? a.stop < a.entree && a.cible > a.entree : a.stop > a.entree && a.cible < a.entree));
  // dérive : des pertes continues en direct → surveillance puis suspension, avec notification et raison
  s.live.trades = Array.from({ length: 30 }, (_, i) => ({ R: -1, t: i, tSortie: i })); p.bibliotheque.enregistrerTradeLive(s.id, { R: -1, t: 99, tSortie: 99 });
  v('dérive : stratégie suspendue, inactive, raison écrite', s.statut === 'suspendue' && !s.active && /Dérive/.test(s.historique[s.historique.length - 1].raison));
  v('dérive : suspendue = plus aucun signal en direct', (() => { const r = p.traiterBarre({ fenetre: tranche(m, m.n - 6000, m.n), bougie: { t: m.t[m.n - 1] + 900e3, o: 1, h: 1, l: 1, c: 1 } }); return !(r.alertes || []).length; })());
  // résumé hebdomadaire
  const h = p.resumeHebdo(true); v('résumé hebdomadaire : variantes, validations, rien d’inventé', h && /variantes testées/.test(h.texte) && /Les résultats passés ne garantissent rien/.test(h.texte));
  // persistance : l'état se sérialise et se recharge à l'identique
  const copie = creerPilote({ etat: JSON.parse(JSON.stringify(p.etat())) }); v('persistance : rechargement identique (stratégies, coffre, N)', copie.bibliotheque.liste().length === 1 && copie.etat().coffre.ouverts.length === 1 && copie.etat().recherche.N === p.etat().recherche.N);
  // export / import dans un autre pilote
  const ex = p.commande({ type: 'exporter' }).texte, autre = creerPilote(); const im = autre.commande({ type: 'importer', texte: ex });
  v('export puis import dans un autre pilote : la validation est conservée (preuve vérifiable)', im.ok && autre.bibliotheque.liste()[0].statut === 'suspendue' && autre.bibliotheque.liste()[0].preuve.horsEchantillon.ok);
}

// ── intégration d'une tranche : le jeu final n'est jamais « perdu », les seuils changés pendant le calcul sont respectés ──
{
  const p = creerPilote(); const e = p.etat();
  const charge = p.preparerTranche({ budget: { chantiersMax: 0 } });
  // pendant que la tranche « calcule », une autre ouverture du jeu final est enregistrée (autre hôte) et les seuils sont changés
  e.coffre.ouverts.push({ debut: 5, fin: 9, ouvertLe: 111, cle: 'autre', verdict: 'rejetee' });
  p.commande({ type: 'seuils_appliquer', objectif: { rNetMin: 15 }, confirme: true });
  const NAvant = e.recherche.N;
  const res = { recRev: charge.recRev, recherche: { ...charge.recherche, N: NAvant + 500, niveau: 3, curseur: 2 }, coffre: { ouverts: [{ debut: 5, fin: 9, ouvertLe: 222, cle: 'calcul', verdict: 'rejetee' }] }, nouvelles: [], evenements: [], stop: 'budget' };
  p.integrerTranche(res, []);
  v('intégration : les DEUX ouvertures du jeu final sont conservées (union, aucune perdue)', p.etat().coffre.ouverts.length === 2 && p.etat().coffre.ouverts.some(o => o.cle === 'autre') && p.etat().coffre.ouverts.some(o => o.cle === 'calcul'));
  v('intégration : seuils changés pendant le calcul → la recherche reste repartie du début (niveau 0), seul N est repris', p.etat().recherche.niveau === 0 && p.etat().recherche.curseur === 0 && p.etat().recherche.N === NAvant + 500);
  const q = creerPilote(), ch2 = q.preparerTranche({ budget: { chantiersMax: 0 } });
  q.integrerTranche({ recRev: ch2.recRev, recherche: { ...ch2.recherche, N: 77, niveau: 2, curseur: 1 }, coffre: { ouverts: [] }, nouvelles: [], evenements: [], stop: 'budget' }, []);
  v('intégration normale : l’état de la recherche est repris', q.etat().recherche.N === 77 && q.etat().recherche.niveau === 2);
}

// ── honnêteté du compteur : un état neuf démarre au total des essais antérieurs, qui ne baisse jamais ──
{
  const { VARIANTES_AVANT } = await import('../pc/agent-btc/essais-anterieurs.js');
  const p = creerPilote();
  v('état neuf : le compteur N démarre au total des variantes déjà essayées (M3, M4 et développement M5)', p.etat().recherche.N === VARIANTES_AVANT.total && p.vue().recherche.Navant === VARIANTES_AVANT.total && VARIANTES_AVANT.total >= 3101 + 205000, String(p.etat().recherche.N));
  const q = creerPilote(); q.commande({ type: 'fusion_etat', id: q.etat().id, N: 10, ouverts: [] });
  v('fusion d’un état de même identité plus petit : N ne diminue jamais', q.etat().recherche.N === VARIANTES_AVANT.total);
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
