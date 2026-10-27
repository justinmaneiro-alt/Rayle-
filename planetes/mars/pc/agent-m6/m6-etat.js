import { REGLES_PROP_DEFAUT, BASE_DEFAUT, fusionRegles, etatCompte, evaluerGardien, controleAvantTrade, jugerAlerte, taillePosition } from './gardien.js';
import { detecterTilt } from './tilt.js';
import { creerJournal, analyserCSV, proposerMappage, appliquerMappage, analyseTrade, bilanSemaine, revueDiscipline, exporterCSV } from './journal.js';
import { CATALOGUE_IDEES, nouvelleIdee, STATUTS_IDEE } from './idees.js';
import { validerRegle, decrireRegle } from '../agent-btc/regles-lab.js';

/* ═════════════ L'ÉTAT GLOBAL DU COMPTE ET DU JOURNAL (M6 ; module pur, testé : planetes/mars/tests/m6-etat-test.mjs) ═════════════
   Un compte d'évaluation, c'est UN compte pour les trois paires : le gardien, le tilt, le journal et la bibliothèque d'idées vivent donc dans UN état partagé (et non dans l'état de chaque paire).
   Même principe que le pilote : toute modification passe par `commande(…)` (liste fermée), la vue se calcule à partir de l'état, la page, le Veilleur du PC et les tests utilisent le même code.
   Aucune clé de courtier, aucun ordre, aucune IA. Les assouplissements des réglages de prudence demandent une confirmation et sont journalisés. */
export const VERSION_M6 = 1;
const clone = o => JSON.parse(JSON.stringify(o));
const PRUDENCE = ['risqueParTradePct', 'bufferSecurite', 'rrMin', 'expositionMaxPct', 'positionsMax', 'tradesParJourMax', 'pertesConsecutivesMax', 'reposApresSerieH', 'arretJourPartPct', 'revancheDelaiMin'];
const PLUS_PRUDENT_QUAND = { risqueParTradePct: 'bas', bufferSecurite: 'haut', rrMin: 'haut', expositionMaxPct: 'bas', positionsMax: 'bas', tradesParJourMax: 'bas', pertesConsecutivesMax: 'bas', reposApresSerieH: 'haut', arretJourPartPct: 'bas', revancheDelaiMin: 'haut' };

export function etatM6Vide(maintenant = Date.now()) {
  return { version: VERSION_M6, id: 'M' + maintenant.toString(36) + Math.random().toString(36).slice(2, 6), creeLe: maintenant, regles: { ...REGLES_PROP_DEFAUT }, base: { ...BASE_DEFAUT }, journal: [], levees: [], idees: [], captures: [], mappageCSV: null, fuseauCSV: 'UTC', journalReglages: [], rev: 0 };
}
/* Quels réglages de PRUDENCE deviendraient moins prudents ? (comparaison aux réglages actuels) */
export function assouplissements(avant, apres) {
  const out = [];
  for (const k of PRUDENCE) { const a = Number(avant[k]), b = Number(apres[k]); if (!(a >= 0) || !(b >= 0) || a === b) continue; const plusPrudent = PLUS_PRUDENT_QUAND[k] === 'bas' ? b < a : b > a; if (!plusPrudent) out.push({ cle: k, avant: a, apres: b }); }
  if (avant.modeDrawdown !== apres.modeDrawdown) { const ordre = { suiveur_equite: 0, suiveur_cloture: 1, fixe: 2 }; if (ordre[apres.modeDrawdown] > ordre[avant.modeDrawdown]) out.push({ cle: 'modeDrawdown', avant: avant.modeDrawdown, apres: apres.modeDrawdown }); }
  if (avant.plafondTrailing !== apres.plafondTrailing && apres.plafondTrailing === 'capital_initial') out.push({ cle: 'plafondTrailing', avant: avant.plafondTrailing, apres: apres.plafondTrailing });
  if (avant.modePerteJour !== apres.modePerteJour && apres.modePerteJour === 'cloture') out.push({ cle: 'modePerteJour', avant: avant.modePerteJour, apres: apres.modePerteJour });
  return out;
}

export function creerM6({ etat = null, maintenant = () => Date.now() } = {}) {
  const e = etat ? { ...etatM6Vide(maintenant()), ...clone(etat) } : etatM6Vide(maintenant());
  e.regles = fusionRegles(e.regles); const J = creerJournal({ maintenant }); J.restaurer(e.journal || []);
  const sync = () => { e.journal = J.tout(); e.rev++; };
  J.surChangement(() => { e.journal = J.tout(); });
  const ok = (message, extra = {}) => ({ ok: true, message, ...extra }), ko = erreur => ({ ok: false, erreur });
  const t = () => maintenant();
  const noter = (type, extra) => { e.journalReglages.push({ t: t(), type, ...extra }); if (e.journalReglages.length > 300) e.journalReglages.splice(0, e.journalReglages.length - 300); };

  function commande(c) {
    try {
      switch (c.type) {
        case 'prop_regles': {
          const apres = fusionRegles({ ...e.regles, ...(c.patch || {}) }), assoup = assouplissements(e.regles, apres);
          if (assoup.length && c.confirme !== true) return { ok: false, erreur: 'Ces réglages rendent le gardien MOINS prudent : ' + assoup.map(a => a.cle + ' ' + a.avant + ' → ' + a.apres).join(' ; ') + '. Confirme explicitement si c’est voulu (et vérifie ton contrat).', assouplissements: assoup, confirmationRequise: true };
          const avant = e.regles; e.regles = apres; noter('regles', { avant: Object.fromEntries(Object.keys(c.patch || {}).map(k => [k, avant[k]])), apres: c.patch, assouplissements: assoup }); sync();
          return ok(assoup.length ? 'Réglages enregistrés (' + assoup.length + ' assouplissement(s) confirmé(s) et journalisé(s)).' : 'Réglages du compte enregistrés.', { regles: e.regles });
        }
        case 'prop_base': {
          const eq = Number(c.equite); if (!(eq > 0)) return ko('équité invalide');
          const pic = c.pic != null && c.pic !== '' ? Number(c.pic) : eq; if (!(pic >= eq)) return ko('le pic d’équité ne peut pas être inférieur à l’équité actuelle');
          e.base = { equite: eq, pic, t: t(), note: c.note ? String(c.note).slice(0, 200) : 'saisi à la main' }; noter('base', { equite: eq, pic }); sync();
          return ok('Équité enregistrée : ' + eq + ' $ (pic ' + pic + ' $). Les trades du journal antérieurs à maintenant sont considérés comme déjà inclus dans cette équité.', { base: e.base });
        }
        case 'journal_ajouter': { const r = J.ajouter(c.trade || {}); if (!r.ok) return ko(r.erreurs.join(' ; ')); sync(); return ok('Trade ajouté au journal.', { id: r.id, analyse: r.trade.statut === 'ferme' ? analyseTrade(r.trade, { regles: e.regles }) : null }); }
        case 'journal_modifier': { const r = J.modifier(c.id, c.patch || {}); if (!r.ok) return ko(r.erreurs.join(' ; ')); sync(); return ok('Trade modifié (l’ancienne valeur est gardée dans son historique).', { analyse: r.trade.statut === 'ferme' ? analyseTrade(r.trade, { regles: e.regles }) : null }); }
        case 'journal_supprimer': { if (c.confirme !== true) return ko('confirmation nécessaire pour supprimer un trade du journal'); const r = J.supprimer(c.id); if (!r.ok) return ko(r.erreurs.join(' ; ')); noter('journal_supprime', { id: c.id }); sync(); return ok('Trade supprimé.'); }
        case 'journal_csv_apercu': {
          const csv = analyserCSV(String(c.texte || ''), c.delimiteur || null); if (!csv.ok) return ko(csv.erreur);
          const mappage = c.mappage || e.mappageCSV || proposerMappage(csv.entetes), r = appliquerMappage(csv, mappage, { fuseau: c.fuseau || e.fuseauCSV, ordre: c.ordre || null, dejaConnus: J.tout().map(x => [x.paire, x.t, x.prixEntree, x.quantite, x.sens].join('|')) });
          return ok(r.trades.length + ' trade(s) lisible(s), ' + r.rejetes.length + ' ligne(s) rejetée(s), ' + r.doublons + ' doublon(s). Rien n’est encore ajouté.', { entetes: csv.entetes, delimiteur: csv.delimiteur, mappage, previsualisation: r.trades.slice(0, 8), rejetes: r.rejetes.slice(0, 20), avertissements: r.avertissements, nLignes: csv.n, nTrades: r.trades.length, doublons: r.doublons });
        }
        case 'journal_csv_importer': {
          if (c.confirme !== true) return ko('confirmation nécessaire : regarde d’abord l’aperçu');
          const csv = analyserCSV(String(c.texte || ''), c.delimiteur || null); if (!csv.ok) return ko(csv.erreur);
          const mappage = c.mappage || e.mappageCSV || proposerMappage(csv.entetes), r = appliquerMappage(csv, mappage, { fuseau: c.fuseau || e.fuseauCSV, ordre: c.ordre || null, dejaConnus: J.tout().map(x => [x.paire, x.t, x.prixEntree, x.quantite, x.sens].join('|')) });
          const res = J.importerLignes(r.trades.map(x => ({ ...x, source: 'csv' }))); e.mappageCSV = mappage; if (c.fuseau) e.fuseauCSV = c.fuseau; noter('csv', { ajoutes: res.ajoutes, rejetes: r.rejetes.length, refus: res.refus.length }); sync();
          return ok(res.ajoutes + ' trade(s) importé(s), ' + (r.rejetes.length + res.refus.length) + ' refusé(s), ' + r.doublons + ' doublon(s) ignoré(s). Ton mappage de colonnes est mémorisé.', { ajoutes: res.ajoutes, rejetes: r.rejetes, refus: res.refus });
        }
        case 'gardien_lever': {
          if (!c.raison || String(c.raison).trim().length < 8) return ko('écris la raison de la levée (au moins 8 caractères) : elle est gardée dans le journal'); if (!['serie', 'jour', 'drawdown'].includes(c.cause)) return ko('cause inconnue');
          e.levees.push({ type: c.cause, t: t(), raison: String(c.raison).slice(0, 240) }); noter('levee', { cause: c.cause, raison: c.raison }); sync(); return ok('Coupe-circuit « ' + c.cause + ' » levé. C’est enregistré : le gardien te le rappellera dans le bilan.', {});
        }
        case 'idee_coller': { const r = nouvelleIdee({ texte: c.texte, lien: c.lien, titre: c.titre, auteur: c.auteur || 'utilisateur', mecanisme: c.mecanisme, maintenant: t() }); if (!r.ok) return ko(r.erreur); e.idees.push(r.idee); sync(); return ok('Idée enregistrée comme brouillon. Je ne la teste pas : elle doit d’abord devenir une règle précise, que tu valides.', { id: r.idee.id }); }
        case 'idee_structurer': {
          const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); const v = validerRegle(c.regle); if (!v.ok) return ko('règle invalide : ' + v.erreurs.join(' ; '));
          i.regle = v.regle; i.description = decrireRegle(v.regle); if (c.mecanisme) i.mecanisme = String(c.mecanisme).slice(0, 400); if (c.explication) i.explication = String(c.explication).slice(0, 400); i.statut = 'a_valider'; i.historique.push({ t: t(), statut: 'a_valider' }); sync();
          return ok('Règle proposée, EN ATTENTE de ton accord : ' + i.description, { description: i.description });
        }
        case 'idee_valider': {
          const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); if (i.statut !== 'a_valider') return ko('seule une idée « à valider » peut être validée (celle-ci est : ' + i.statut + ')'); if (!i.regle) return ko('cette idée n’a pas de règle');
          const paires = (c.paires && c.paires.length ? c.paires : ['BTC']).filter(p => ['BTC', 'SOL', 'DOGE'].includes(p)); if (!paires.length) return ko('choisis au moins une paire');
          i.statut = 'validee'; i.paires = paires; i.valideeLe = t(); i.historique.push({ t: t(), statut: 'validee', paires }); sync(); return ok('Idée validée : elle part dans la file de recherche de ' + paires.join(', ') + ', avec les mêmes critères que toutes les autres.', { aEnvoyer: { id: i.id, regle: i.regle, nom: i.titre, paires } });
        }
        case 'idee_en_test': { const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); i.statut = 'en_test'; i.historique.push({ t: t(), statut: 'en_test' }); sync(); return ok('ok'); }
        case 'idee_resultat': { const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); i.resultats[c.paire] = { t: t(), verdict: String(c.verdict || '').slice(0, 200) }; if (i.paires && i.paires.every(p => i.resultats[p])) { i.statut = 'testee'; i.historique.push({ t: t(), statut: 'testee' }); } sync(); return ok('Résultat noté.'); }
        case 'idee_refuser': { const i = e.idees.find(x => x.id === c.id); if (!i) return ko('idée inconnue'); i.statut = 'refusee'; i.historique.push({ t: t(), statut: 'refusee' }); sync(); return ok('Idée refusée : elle ne sera pas testée.'); }
        case 'idee_catalogue': {
          let n = 0; for (const x of CATALOGUE_IDEES) if (!e.idees.some(y => y.id === x.id)) { e.idees.push({ ...clone(x), creeLe: t(), regle: null, historique: [{ t: t(), statut: x.statut }], resultats: {} }); n++; }
          sync(); return ok(n ? n + ' idée(s) des projets open source ajoutée(s) à la bibliothèque, avec leur crédit.' : 'Le catalogue est déjà dans la bibliothèque.', { ajoutees: n });
        }
        case 'capture_noter': { e.captures.push({ id: 'cap-' + t().toString(36), t: t(), ...clone(c.capture || {}) }); if (e.captures.length > 100) e.captures.shift(); sync(); return ok('Capture notée.', { id: e.captures[e.captures.length - 1].id }); }
        case 'capture_joindre': { const x = J.trouver(c.tradeId); if (!x) return ko('trade inconnu'); const r = J.modifier(c.tradeId, { capture: c.captureId }); if (!r.ok) return ko(r.erreurs.join(' ; ')); sync(); return ok('Capture jointe au trade.'); }
        case 'fuseau_csv': { e.fuseauCSV = c.fuseau === 'Europe/Paris' ? 'Europe/Paris' : 'UTC'; sync(); return ok('Fuseau des fichiers CSV : ' + e.fuseauCSV + '.'); }
        default: return ko('commande inconnue : ' + c.type);
      }
    } catch (err) { return ko(String(err && err.message || err)); }
  }

  /* ── Vues ── */
  const ouvertes = () => J.tout().filter(x => x.statut === 'ouvert');
  function compte({ maintenant: now = t(), latent = 0 } = {}) { return etatCompte({ regles: e.regles, base: e.base, journal: J.tout(), latent, maintenant: now }); }
  function gardien(opt = {}) { const c = compte(opt), g = evaluerGardien(c, { levees: e.levees }); return { compte: c, verdict: g }; }
  function tilt(opt = {}) { return detecterTilt(J.tout(), { maintenant: opt.maintenant || t(), regles: { tradesParJourMax: e.regles.tradesParJourMax, rrMin: e.regles.rrMin, revancheDelaiMin: e.regles.revancheDelaiMin } }); }
  function controle(plan, opt = {}) { const now = opt.maintenant || t(), g = gardien({ maintenant: now, latent: opt.latent || 0 }); return controleAvantTrade(plan, { compte: g.compte, gardien: g.verdict, ouvertes: opt.ouvertes || ouvertes().map(x => ({ notionnel: (x.quantite || 0) * (x.prixEntree || 0) })), journal: J.tout(), maintenant: now }); }
  /* Jugement d'une alerte d'ENTRÉE de l'agent : lu par le pilote avant de la présenter. */
  function jugerAlerteAgent(alerte, opt = {}) { const now = opt.maintenant || t(), g = gardien({ maintenant: now }); return jugerAlerte(alerte, { compte: g.compte, gardien: g.verdict, ouvertes: ouvertes().map(x => ({ notionnel: (x.quantite || 0) * (x.prixEntree || 0) })), journal: J.tout(), maintenant: now }); }
  function bilan(date) { return bilanSemaine(J.tout(), { date: date || t(), regles: e.regles }); }
  function vue() {
    const g = gardien(), tl = tilt(), jr = J.lister();
    return { version: e.version, regles: e.regles, base: e.base, gardien: g.verdict, compte: g.compte, tilt: tl, journal: jr.slice(0, 200), nJournal: jr.length, positionsOuvertes: ouvertes().length, levees: e.levees.slice(-10), idees: e.idees.slice(), statutsIdee: STATUTS_IDEE, captures: e.captures.slice(-30), mappageCSV: e.mappageCSV, fuseauCSV: e.fuseauCSV, journalReglages: e.journalReglages.slice(-20), rev: e.rev,
      mentions: ['Ce n’est pas un conseil financier, les résultats passés ne garantissent rien.', 'Alertes seulement : aucun ordre n’est passé, aucune clé de courtier n’existe ici.', 'Vérifie dans ton contrat Kraken Prop ce qui est autorisé (alertes, robots, copie de trades) et les règles exactes du compte.'] };
  }
  return { commande, vue, etat: () => { e.journal = J.tout(); return e; }, journal: J, compte, gardien, tilt, controle, jugerAlerteAgent, bilan, revue: () => revueDiscipline(J.tout().slice(-40), e.regles), taille: plan => taillePosition({ compte: compte(), plan }), exporterCSV: () => exporterCSV(J.tout()), surChangement: f => J.surChangement(f) };
}
