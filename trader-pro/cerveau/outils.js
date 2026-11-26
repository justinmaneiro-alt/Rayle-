/* ═════════════ OUTILS DU CERVEAU DE RAYLE (v8, phase 2) ═════════════
   Rayle n'invente jamais un chiffre : le modèle (Gemini, par le Worker rayle-voix) appelle ces outils, qui LISENT les données de l'application (mêmes fichiers, mêmes calculs que les fenêtres), puis il répond.
   Chaque outil renvoie un petit objet JSON (chiffres mesurés, date de la donnée) ; en cas d'absence : { indisponible: 'raison' } — jamais un chiffre inventé.
   `DECLARATIONS` : descriptions envoyées au modèle ; `executer(nom, args)` : exécution dans la page ; `lectureLocale(texte)` : repli sans IA (quota atteint). */
import { lireActifPro, lireCot, lireCalendrier, lireActus, parId as ACTIF_PAR_ID, ACTIFS } from '../commun/donnees.js';
import { sma, tendance, atr } from '../commun/analyse.js';
import { regime } from '../terminal/aides.js';
import { creerAnalyste, DECLARATIONS_ANALYSTE } from './analyste.js';

/* ───── reconnaissance des actifs (noms parlés → identifiants des données) ───── */
const ALIAS = [['or', /\b(or|gold|xau|xauusd)\b/], ['us100', /\b(nasdaq|us ?100|ndx|nas100)\b/], ['us500', /\b(s ?p ?500|us ?500|sp500|s&p)\b/], ['btc', /\b(bitcoin|btc)\b/], ['sol', /\b(solana|sol)\b/], ['dxy', /\b(dxy|dollar index|indice dollar|dollar)\b/], ['petrole', /\b(petrole|pétrole|wti|brent|oil)\b/], ['eurusd', /\b(eur ?usd|euro dollar|euro)\b/]];
export const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
export function actifDe(t) { const n = norm(t); const a = ALIAS.find(([, re]) => re.test(n)); return a ? a[0] : null; }
const idActif = a => { const x = actifDe(a); return x || (ACTIF_PAR_ID[String(a || '').toLowerCase()] ? String(a).toLowerCase() : null); };
const NOM = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', dxy: 'le dollar (DXY)', petrole: 'le pétrole', eurusd: 'l’EUR/USD' };
const CLE_TERMINAL = { or: 'OR', us100: 'NASDAQ', us500: 'SP500', btc: 'BTC', sol: 'SOL', eurusd: 'EURUSD', dxy: 'DXY' };
const arr = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);
const dec = id => (ACTIF_PAR_ID[id] ? ACTIF_PAR_ID[id].dec : 2);
const dateIso = t => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null);
const sans = raison => ({ indisponible: raison });
const manque = a => sans('actif inconnu ou non suivi : « ' + a + ' » (actifs : or, us100, us500, btc, sol, dxy ; pétrole et EUR/USD seulement dans Mes actifs ou le calendrier)');
const MAINTENANT = () => Date.now();

async function pro(id) { let e; for (let k = 0; k < 2; k++) { try { return (await lireActifPro(id, { delai: k ? 25000 : 12000 })).donnees; } catch (x) { e = x; } } throw e; }   /* une relance, avec un délai plus long (la page charge aussi la fenêtre demandée) */
const barres = (D, u) => ({ H1: D.h1, H4: D.h4, J: D.j })[u === 'D1' || u === 'Daily' || u === 'Jour' ? 'J' : u] || D.h4;

/* ───── 1. prix_et_tendance ───── */
async function prix_et_tendance({ actif, unite = 'H4' } = {}) {
  const id = idActif(actif); if (!id || !ACTIF_PAR_ID[id]) return manque(actif);
  const u = ['H1', 'H4', 'J'].includes(unite) ? unite : /^(d|j)/i.test(String(unite)) ? 'J' : 'H4';
  let D; try { D = await pro(id); } catch (e) { return sans('données de ' + id + ' injoignables (' + String(e.message || e).slice(0, 80) + ')'); }
  const B = barres(D, u), C = B.map(b => b.c), prix = Number.isFinite(D.prix) ? D.prix : C[C.length - 1], m200 = sma(C, 200).slice(-1)[0];
  const J = D.j, veille = J.length > 1 ? J[J.length - 2].c : null, tD = tendance(D.j), tH4 = tendance(D.h4), tU = tendance(B);
  let reg = null; try { const r = regime(B, D.j, u); reg = { type: r.type, sens: r.sens, volatilite: r.vol, percentileVolatilite: arr(r.percentile, 0) }; } catch (e) { reg = null; }
  let fleches = []; try { const { flechesDe } = await import('../terminal/fleches-registre.js'); fleches = flechesDe(id, D).slice(-3).reverse().map(f => ({ unite: f.unite, sens: f.dir > 0 ? 'achat (haussier)' : 'vente (baissier)', type: f.type, date: dateIso(f.tFin), niveau: arr(f.entree, dec(id)) })); } catch (e) { fleches = []; }
  const a = atr(B, 14); const atrV = Array.isArray(a) ? a[a.length - 1] : a;
  return { actif: id, nom: ACTIF_PAR_ID[id].nom, unite: u, prix: arr(prix, dec(id)), variationDepuisHierPct: veille ? arr((prix / veille - 1) * 100) : null, ma200: arr(m200, dec(id)), positionMa200: m200 ? (prix > m200 ? 'au-dessus' : 'sous') : null, ecartMa200Pct: m200 ? arr((prix / m200 - 1) * 100) : null,
    tendanceUnite: tU.sens, tendanceDaily: tD.sens, tendanceH4: tH4.sens, alignementDailyH4: tD.sens === tH4.sens ? 'aligné (' + tD.sens + ')' : 'non aligné (Daily ' + tD.sens + ', H4 ' + tH4.sens + ')', regime: reg, atr: arr(atrV, dec(id)), dernieresFleches: fleches, donneesDu: dateIso(D.t), source: D.source };
}

/* ───── 2. niveaux ───── */
async function niveaux({ actif } = {}) {
  const id = idActif(actif); if (!id || !ACTIF_PAR_ID[id]) return manque(actif);
  let D; try { D = await pro(id); } catch (e) { return sans('données injoignables (' + String(e.message || e).slice(0, 80) + ')'); }
  const sortie = { actif: id, nom: ACTIF_PAR_ID[id].nom, prix: arr(D.prix, dec(id)) };
  try { const k = CLE_TERMINAL[id]; if (k && typeof localStorage !== 'undefined') { const { lireDessins } = await import('../terminal/dessins-stockage.js'); sortie.mesNiveauxTraces = lireDessins(k).filter(o => o && o.type).slice(0, 14).map(o => ({ type: o.type, unite: o.unite, prix: o.p != null ? arr(o.p, dec(id)) : (o.p1 != null ? arr(o.p2, dec(id)) : null), etat: o.etat || null })); } else sortie.mesNiveauxTraces = 'non lisibles hors de l’appareil (aucun dessin ici)'; } catch (e) { sortie.mesNiveauxTraces = 'illisibles'; }
  try { const V = await import('../volume/volume-calcul.js'), P = V.profil(D.h4.slice(-250)); if (P) sortie.volume = { pocH4: arr(P.poc.prix, dec(id)), vah: arr(P.vah, dec(id)), val: arr(P.val, dec(id)), zonesDeVolume: (P.hvn || []).slice(0, 4).map(h => arr(h.prix, dec(id))) }; } catch (e) { sortie.volume = sans('profil de volume non calculable'); }
  try { const I = await import('../volume/ict-calcul.js'), r = I.reperes(D.h1.length ? D.h1 : D.h4, MAINTENANT()); sortie.reperesIct = [...((r && r.niveaux) || []), ...((r && r.ouvertures) || [])].map(x => ({ nom: x.nom, prix: arr(x.prix, dec(id)) })); const g = I.fairValueGaps(D.h4, { max: 3 }); sortie.fvg = (g || []).map(x => ({ sens: x.dir > 0 || x.sens === 'haussier' ? 'haussier' : 'baissier', bas: arr(x.bas != null ? x.bas : x.l, dec(id)), haut: arr(x.haut != null ? x.haut : x.h, dec(id)) })); } catch (e) { sortie.reperesIct = sans('repères ICT non calculables'); }
  try { const H = await import('../volume/htf-calcul.js'), w = H.construireHtf(D.j, { tf: 'S', n: 4, prixLive: D.prix }); if (w && w.ok !== false) sortie.bougiesWeekly = (w.bougies || []).map(b => ({ date: dateIso(b.t).slice(0, 10), ouverture: arr(b.o, dec(id)), haut: arr(b.h, dec(id)), bas: arr(b.l, dec(id)), cloture: arr(b.c, dec(id)), enCours: !!b.enCours })); } catch (e) { sortie.bougiesWeekly = sans('bougies Weekly non calculables'); }
  sortie.donneesDu = dateIso(D.t); return sortie;
}

/* ───── 3. carnet_et_volume ───── */
async function carnet_et_volume({ actif } = {}) {
  const id = idActif(actif); if (!id || !ACTIF_PAR_ID[id]) return manque(actif);
  const sortie = { actif: id };
  try { const trouver = () => { if (window.__tpVolume) return window.__tpVolume; for (const f of document.querySelectorAll('iframe')) { try { if (f.contentWindow && f.contentWindow.__tpVolume) return f.contentWindow.__tpVolume; } catch (e) { /* autre origine */ } } return null; }; const V = typeof window !== 'undefined' ? trouver() : null; if (V && V.etat && V.etat().actif === id) { const e = V.etat(); sortie.terminalVolume = { unite: e.unite, poc: arr(e.poc, dec(id)), vah: arr(e.vah, dec(id)), val: arr(e.val, dec(id)), murs: e.murs, grosOrdres: e.gros, carnetVivant: !!e.carnet, deltaReel: !!e.deltaReel }; try { await V.attendre(); sortie.lectureTerminal = V.analyse(); } catch (x) { /* pas de lecture */ } } } catch (e) { /* terminal Volume fermé */ }
  try { const D = await pro(id), V = await import('../volume/volume-calcul.js'), B = D.h4.slice(-121, -1); const rv = V.volumeRelatif(B); const c = V.cvd(B); sortie.volumeH4 = { volumeRelatifDerniereBougie: arr(Array.isArray(rv) ? rv[rv.length - 1] : rv), cvdTendance: Array.isArray(c) && c.length > 10 ? (c[c.length - 1] > c[c.length - 11] ? 'en hausse' : 'en baisse') : null, deltaEstime: !(ACTIF_PAR_ID[id] && (id === 'btc' || id === 'sol')) }; } catch (e) { sortie.volumeH4 = sans('volume non disponible pour cet actif'); }
  if (!sortie.terminalVolume) sortie.carnet = 'carnet d’ordres et gros ordres : seulement quand le terminal Volume est ouvert sur cet actif (Binance/Kraken en direct)';
  return sortie;
}

/* ───── 4. marches ───── */
async function marches({ actif } = {}) {
  const id = actif ? idActif(actif) : null, sortie = {};
  try { const r = await lireActus('marches', { delai: 8000 }), L = (r.donnees.items || []).filter(x => !id || !ACTIF_PAR_ID[id] || ACTIF_PAR_ID[id].mots.test(((x.titre || x.title || '') + ' ' + (x.resume || '')))).slice(0, 6); sortie.actualites = L.map(x => ({ titre: x.titre || x.title, source: x.source, date: dateIso(x.date) })); if (!L.length) sortie.actualites = 'aucune actualité récente' + (id ? ' pour cet actif' : ''); } catch (e) { sortie.actualites = sans('actualités injoignables'); }
  try { const r = await lireCalendrier({ delai: 8000 }), fr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }), auj = fr.format(new Date()), heure = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(t)); sortie.annoncesDuJour = (r.donnees.evenements || []).filter(e => /^(High|Medium)$/i.test(e.impact || '') && fr.format(new Date(e.date)) === auj).slice(0, 8).map(e => ({ heure: heure(e.date), titre: e.titre || e.title, pays: e.pays || e.country, impact: e.impact === 'High' ? 'fort' : 'moyen', previsionPrecedent: [e.forecast, e.previous].filter(Boolean).join(' / ') || null })); } catch (e) { sortie.annoncesDuJour = sans('calendrier injoignable'); }
  if (id && ACTIF_PAR_ID[id]) {
    try { const r = await lireCot(ACTIF_PAR_ID[id].cot, { delai: 8000 }), { analyserCot } = await import('../marches/cot.js'), a = analyserCot(r.donnees); const M = await import('../marches/cot.js'); sortie.cot = a ? { actif: id, lecture: M.lectureCot(a, ACTIF_PAR_ID[id].nom), indexSpeculateurs: a.dernier && a.dernier.indexSpec != null ? arr(a.dernier.indexSpec, 0) : null, dateMesure: a.dernier ? a.dernier.date : null } : sans('COT vide'); } catch (e) { sortie.cot = sans('COT indisponible pour cet actif'); }
    try { const { calculerScoreActif } = await import('../commun/dashboard.js'), S = await calculerScoreActif(id); sortie.scoreMarche = { score100: arr(S.score100 != null ? S.score100 : S.s100, 0), verdict: S.verdict || S.libelle || null }; } catch (e) { sortie.scoreMarche = sans('score non calculable'); }
  }
  return sortie;
}

/* ───── 5. mes_actifs ───── */
async function mes_actifs({ actif, horizon = 'moyen' } = {}) {
  const id = idActif(actif) || (actif ? null : 'or'); if (!id) return manque(actif);
  try { const M = await import('../invest/mes-actifs-calcul.js'), { creerDonnees } = await import('../invest/donnees-invest.js'), D = await creerDonnees().mesActifs(), A = D && D.actifs && D.actifs[id]; if (!A) return sans('« Mes actifs » ne couvre pas ' + id + ' ou n’est pas encore généré (tâche quotidienne)');
    const horizons = M.HORIZONS_MA.map(h => { const v = M.verdictHorizon(A.indicateurs, h.id); return { horizon: h.nom, verdict: v.libelle, score100: arr(v.score100, 0), confiancePct: arr(v.confiance, 0), raisons: (v.pourquoi || []).slice(0, 3) }; });
    return { actif: id, nom: A.nom, prix: arr(A.prix, dec(id) || 2), prixDu: dateIso(A.tPrix), prixSource: A.prixSource || null, symboleXtb: A.xtb, horizons, phrase: M.phraseVerdict(A.nom, A.indicateurs, ['tactique', 'swing', 'moyen', 'long'].includes(horizon) ? horizon : 'moyen') }; }
  catch (e) { return sans('Mes actifs illisible (' + String(e.message || e).slice(0, 80) + ')'); }
}

/* ───── 6. investissement ───── */
async function investissement({ recherche } = {}) {
  try { const V = await import('../invest/voix-invest.js'), S = (await import('../commun/voix-trader.js')).sourceInvest(); const t = await V.repondreInvest(String(recherche || ''), S); return t ? { reponse: t } : sans('aucune fiche trouvée pour « ' + recherche + ' » (donne le nom d’une action, d’un fonds ou d’un secteur)'); }
  catch (e) { return sans('Investissement illisible (' + String(e.message || e).slice(0, 80) + ')'); }
}

/* ───── 7. portefeuille_et_risque ───── */
async function portefeuille_et_risque() {
  try { const T = await import('../commun/voix-trader.js'), S = T.sourceNavigateur(), s = {}; for (const [k, q] of [['portefeuille', 'où en est mon portefeuille'], ['risque', 'quel est mon risque aujourd’hui'], ['erreursEtDiscipline', 'quelles sont mes erreurs']]) { try { s[k] = await T.repondre(q, S); } catch (e) { s[k] = null; } } return s.portefeuille || s.risque ? s : sans('historique XTB non importé sur cet appareil (fenêtre Portefeuille)'); }
  catch (e) { return sans('Portefeuille illisible (' + String(e.message || e).slice(0, 80) + ')'); }
}

/* ───── 8. couverture ───── */
async function couverture({ actif, sens = 'achat' } = {}) {
  const id = idActif(actif); if (!id) return manque(actif);
  try { const T = await import('../commun/voix-trader.js'), S = T.sourceNavigateur(), t = await T.repondre('comment me couvrir si je ' + (/vente|short|vend/i.test(sens) ? 'vends ' : 'achète ') + (NOM[id] || '').replace(/^l’|^le |^la /, '') + ' couvre ma position sur ' + (NOM[id] || id), S); return t ? { actif: id, sens, couverture: t } : sans('aucune couverture calculable pour cet actif'); }
  catch (e) { return sans('Couverture illisible (' + String(e.message || e).slice(0, 80) + ')'); }
}

/* ───── 9. etat_des_donnees ───── */
async function etat_des_donnees() {
  try { const { lireEtat, phraseDonnees } = await import('../commun/fraicheur.js'), E = await lireEtat(); return { resume: phraseDonnees(E.liste), sources: (E.liste || []).slice(0, 14).map(x => ({ source: x.nom || x.cle, statut: x.statut || x.etat, age: x.age != null ? x.age : null })) }; }
  catch (e) { return sans('état des données illisible (' + String(e.message || e).slice(0, 80) + ')'); }
}

/* ───── 3 bis. bougies_volume : le tableau « Bougies volume » du terminal (statistiques descriptives, jamais un signal) ───── */
async function bougies_volume({ actif, unite = 'H4', seuil = 2 } = {}) {
  const BV = await import('../volume/bougies-volume-calcul.js'), id = idActif(actif);
  if (!id || !BV.volumeDisponible(id)) return sans(BV.TEXTE_INDISPO + ' (disponible pour : or, Nasdaq 100, S&P 500, Bitcoin, Solana, pétrole)');
  const u = ['H1', 'H4', 'J'].includes(unite) ? unite : /^(d|j)/i.test(String(unite)) ? 'J' : 'H4', sd = BV.SEUILS.includes(+seuil) ? +seuil : BV.SEUIL_DEFAUT, pas = BV.PAS[u];
  let B = null, origine = null;
  try { const w = typeof window !== 'undefined' ? window : null, V = w && (w.__tpVolume || null); const bv = V && V.appel ? V.appel('bv') : null; if (bv && bv.donnees) { const d = bv.donnees(); if (d.actif === id && d.unite === u && d.B.length >= 60) { B = d.B; origine = 'terminal Volume ouvert (mêmes bougies que l’écran)'; } } } catch (e) { B = null; }
  if (!B) {
    try {
      const { chargerBarres } = await import('../volume/volume-donnees.js'), c = await chargerBarres(id, u); B = c.bougies; origine = 'données du mode Volume (' + c.source + ')';
      try { const { histoLong } = await import('../terminal/histo-long.js'), L = await histoLong.avant(id, u, B[0].t, { J: 40, H4: 8, H1: 3 }[u]); if (L && L.bougies.length && Math.abs(L.bougies[L.bougies.length - 1].c / B[0].o - 1) < 0.1) { B = L.bougies.concat(B); origine += ' + historique long'; } } catch (e) { /* source récente seule */ }
    } catch (e) { return sans('volume de ' + id + ' injoignable (' + String(e.message || e).slice(0, 80) + ')'); }
  }
  if (!B || B.length < 60 || !B.some(b => b.v > 0)) return sans('pas assez de bougies avec volume pour ' + id + ' en ' + u);
  const calc = BV.creerCalcul(id).maj(B), T = BV.tableau(B, calc, { seuil: sd, pas }), ligne = x => ({ nombre: x.n, mesurablesA5: x.n5, echantillonTropPetit: x.petit, continuationA5Pct: x.petit ? null : arr(x.cont5, 0), retournementA5Pct: x.petit ? null : arr(x.ret5, 0), mouvementMoyenA5Atr: x.petit ? null : arr(x.moy5, 2), mouvementMoyenA10Atr: x.petit || x.n10 < BV.MIN_CAS ? null : arr(x.moy10, 2) });
  return { actif: id, nom: ACTIF_PAR_ID[id] ? ACTIF_PAR_ID[id].nom : id, unite: u, seuilFortVolume: sd, bougiesAnalysees: B.length, origine, achatFort: ligne(T.lignes.achatFort), venteForte: ligne(T.lignes.venteForte), achatExtreme: ligne(T.lignes.achatExtreme), venteExtreme: ligne(T.lignes.venteExtreme),
    parContexte: { finDeMouvement: ligne(T.contexte.fin), sortieDeRange: ligne(T.contexte.range), milieuDeMouvement: ligne(T.contexte.milieu) }, parPositionMa200: { auDessus: ligne(T.ma.dessus), sous: ligne(T.ma.dessous) },
    resumeAdire: BV.resumeParle(T, { actif: id, unite: u, seuil: sd }), regles: 'Mouvement en ATR dans le sens de la bougie (positif = continuation). Moins de ' + BV.MIN_CAS + ' cas : échantillon trop petit, aucun pourcentage. Statistiques descriptives sur l’historique affiché, pas un signal : ne rien promettre.' };
}

/* ───── réseau d'information : À la une, personnalités, ce qui peut faire bouger un actif (notes d'importance, réaction mesurée du marché) ───── */
async function reseau_info({ sujet, actif, personne } = {}) {
  const K = await import('../reseau/client.js'), E = (await K.lireReseau()).donnees, T = await import('../reseau/etat.js'), X = await import('../reseau/textes.js'), C = await import('../reseau/config.js'), now = MAINTENANT();
  if (!E.cartes || !E.cartes.length) return sans('réseau d’information vide ou injoignable');
  const carte = c => ({ titre: c.titre, importance: c.score, il_y_a: X.ageParle(c.t, now), heureParis: X.heureParisCourte(c.t), sources: c.sources.length, personne: c.personne ? X.nomPers(c.personne) : null, actifs: c.actifs, reaction_du_marche: c.reaction && c.reaction.max ? c.reaction.texte : null, revirement: !!(c.fil && (E.fils.find(f => f.id === c.fil) || {}).revirement) });
  if (personne) { const id = (C.PERSONNES.find(p => p.alias.concat([p.nom.toLowerCase()]).some(a => norm(personne).includes(norm(a))) || {}).id); if (!id) return sans('personnalité non suivie : ' + personne); return { personne: X.nomPers(id), declarations_72h: E.cartes.filter(c => c.personne === id).sort((a, b) => b.t - a.t).slice(0, 5).map(carte) }; }
  const id = actif ? idActif(actif) : null; if (id) return { actif: id, infos: E.cartes.filter(c => c.actifs.includes(id)).sort((a, b) => b.score - a.score).slice(0, 5).map(carte), note: 'hypothèses de lecture, jamais un signal' };
  return { a_la_une: T.aLaUne(E, now, 5).map(carte), note: 'importance sur 100 : qui parle, sujet, actifs touchés, nouveauté, sources, réaction réelle du marché' };
}
export const OUTILS = { reseau_info, prix_et_tendance, niveaux, carnet_et_volume, bougies_volume, marches, mes_actifs, investissement, portefeuille_et_risque, couverture, etat_des_donnees };
/* v10 : outils de l'analyste (manuel, analyse complète, marché global, lecture du graphique) */
Object.assign(OUTILS, creerAnalyste({ OUTILS, idActif, pro, dec, dateIso, sans, manque, norm }).outils);
const A_ENUM = ['or', 'us100', 'us500', 'btc', 'sol', 'dxy'];
export const DECLARATIONS = [
  { name: 'prix_et_tendance', description: 'Prix actuel, variation, MA200 et position par rapport à elle, tendance Daily/H4 et alignement, régime de marché (tendance ou range), dernières flèches (MA200, niveaux, volume). À appeler pour tout « point sur… », « où en est… », « est-ce haussier ? ».', parameters: { type: 'object', properties: { actif: { type: 'string', description: 'or, us100 (Nasdaq), us500 (S&P 500), btc (Bitcoin), sol (Solana), dxy (dollar)', enum: A_ENUM }, unite: { type: 'string', description: 'H1, H4 (défaut) ou J (Daily)', enum: ['H1', 'H4', 'J'] } }, required: ['actif'] } },
  { name: 'niveaux', description: 'Niveaux importants : mes niveaux tracés sur le graphique, volume (POC, VAH, VAL, zones de volume), repères ICT (PDH/PDL, PWH/PWL, FVG) et bougies Weekly.', parameters: { type: 'object', properties: { actif: { type: 'string', enum: A_ENUM } }, required: ['actif'] } },
  { name: 'carnet_et_volume', description: 'Volume relatif, CVD, et — si le terminal Volume est ouvert sur l’actif — déséquilibre du carnet, gros ordres et lecture du terminal (MFI, delta).', parameters: { type: 'object', properties: { actif: { type: 'string', enum: A_ENUM } }, required: ['actif'] } },
  { name: 'bougies_volume', description: 'Tableau « Bougies volume » du terminal : après les bougies à fort volume (≥ 2 fois la médiane des 50 précédentes) et à volume extrême (≥ 3), combien de cas, % de continuation et de retournement à +5 bougies, mouvement moyen en ATR, par contexte et par position vs MA200. Pour « qu’est-ce qui se passe après les grosses bougies de volume sur l’or en H4 ? ». Chiffres et taille de l’échantillon à dire, sans rien promettre.', parameters: { type: 'object', properties: { actif: { type: 'string', description: 'or, us100, us500, btc, sol, petrole', enum: [...A_ENUM, 'petrole'] }, unite: { type: 'string', enum: ['H1', 'H4', 'J'] } }, required: ['actif'] } },
  { name: 'marches', description: 'Actualités récentes, annonces économiques du jour, rapport COT, score de marché. Sans actif : actualités et annonces générales.', parameters: { type: 'object', properties: { actif: { type: 'string', enum: A_ENUM } } } },
  { name: 'mes_actifs', description: 'Verdicts « cher / pas cher » par horizon (1–10 jours, 1–6 mois, 1–3 ans, 5–10 ans) et leurs raisons, pour l’or, le Bitcoin, Solana, le Nasdaq 100, le S&P 500, le pétrole.', parameters: { type: 'object', properties: { actif: { type: 'string', description: 'or, btc, sol, us100, us500, petrole' }, horizon: { type: 'string', enum: ['tactique', 'swing', 'moyen', 'long'] } }, required: ['actif'] } },
  { name: 'investissement', description: 'Fiche et scores d’une action, d’un fonds ou d’un secteur (fenêtre Investissement) : « Airbus est-il attractif ? », « actions européennes à 1–3 ans ».', parameters: { type: 'object', properties: { recherche: { type: 'string', description: 'la demande en français, avec le nom de la valeur' } }, required: ['recherche'] } },
  { name: 'portefeuille_et_risque', description: 'Mes positions XTB, résultats, risque engagé, limites du jour et de la semaine, statistiques et erreurs par setup.' },
  { name: 'couverture', description: 'Meilleure couverture d’une position (actif et sens achat/vente) et son taux de protection mesuré.', parameters: { type: 'object', properties: { actif: { type: 'string', enum: ['or', 'us100', 'us500', 'btc', 'sol', 'dxy', 'petrole'] }, sens: { type: 'string', enum: ['achat', 'vente'] } }, required: ['actif'] } },
  { name: 'reseau_info', description: 'Réseau d’information de Rayle (infos notées de 0 à 100) : sans argument, les 5 infos les plus importantes des dernières 24 h (« quoi de neuf d’important ? ») ; avec `personne` (Trump, Powell, Musk…), ses dernières déclarations ; avec `actif`, ce qui peut le faire bouger. Donne l’heure de Paris, la réaction réelle du marché et les revirements.', parameters: { type: 'object', properties: { personne: { type: 'string' }, actif: { type: 'string', enum: [...A_ENUM, 'petrole'] } } } },
  { name: 'etat_des_donnees', description: 'Fraîcheur des données de l’application : lesquelles sont à jour, lesquelles sont en retard.', },
  ...DECLARATIONS_ANALYSTE
];
export async function executer(nom, args) {
  const f = OUTILS[nom]; if (!f) return sans('outil inconnu : ' + nom);
  try { const r = await f(args || {}); const s = JSON.stringify(r); return s.length > 15000 ? { tronque: true, extrait: s.slice(0, 14800) } : r; }
  catch (e) { return sans('erreur de l’outil ' + nom + ' : ' + String((e && e.message) || e).slice(0, 120)); }
}
/* repli sans IA (quota Gemini atteint ou Worker injoignable) : lit le prix et la tendance de l'actif cité, jamais « aucune donnée » si la donnée existe */
export async function lectureLocale(texte) {
  /* question ICT sans IA : résumé déterministe d'UNE unité (celle nommée, sinon celle du graphique) : « En H1 : … » */
  const n = norm(texte);
  if (/\b(ict|fvg|order ?blocks?|killzones?|liquidites?|eqh|eql|top[ -]?down)\b/.test(n)) {
    const u = /\bm15\b|15 ?min/.test(n) ? 'M15' : /\bh4\b/.test(n) ? 'H4' : /\bh1\b/.test(n) ? 'H1' : /\b(daily|journalier|jour)\b/.test(n) ? 'J' : undefined, id = actifDe(texte) || undefined;
    try {
      const LI = await import('../../agent-trading/front/or/ict-lecture.js');
      if (/top[ -]?down|toutes les unites|toutes unites/.test(n)) { const L = []; for (const x of ['J', 'H4', 'H1', 'M15']) L.push(await OUTILS.lecture_ict({ actif: id, unite: x })); const T = LI.resumeTopDown(L.map((r, i) => (r && !r.indisponible ? r : { unite: ['Daily', 'H4', 'H1', 'M15'][i], indisponible: (r && r.indisponible) || 'indisponible' }))); return T.texte; }
      const r = await OUTILS.lecture_ict({ actif: id, unite: u });
      if (r && !r.indisponible) return /(vrai|valide|bon) order ?block|order ?block.*(vrai|valide)/.test(n) ? LI.verdictOrderBlock(r).texte : LI.resumeIct(r);
    } catch (e) { /* on retombe sur la lecture simple */ }
  }
  const id = actifDe(texte); if (!id || !ACTIF_PAR_ID[id]) return null;
  const r = await prix_et_tendance({ actif: id, unite: 'H4' }); if (r.indisponible) return null;
  const sgn = r.variationDepuisHierPct > 0 ? 'plus' : 'moins';
  return `${r.nom} : ${r.prix} dollars, ${sgn} ${Math.abs(r.variationDepuisHierPct)} pour cent depuis hier. Le prix est ${r.positionMa200} de sa moyenne mobile à 200 périodes (${r.ma200}, écart ${r.ecartMa200Pct} pour cent) en H4. Tendance Daily ${r.tendanceDaily}, H4 ${r.tendanceH4} : ${r.alignementDailyH4}.` + (r.regime && r.regime.type ? ` Le marché est en ${r.regime.type}.` : '');
}

/* ───── v8 phase 3 : chiffres clés (étiquettes animées) et éléments à surligner, déduits des résultats d'outils (jamais inventés) ───── */
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '—');
const sg = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + fr(Math.abs(x), d) : '—');
export function etiquettesDe(tour) {
  const E = [];
  for (const t of tour || []) {
    const r = t.resultat || {}; if (r.indisponible) continue;
    if (t.nom === 'prix_et_tendance') {
      const d = dec(r.actif); E.push({ label: r.nom + ' · prix', val: fr(r.prix, d), sous: sg(r.variationDepuisHierPct) + ' % depuis hier', ton: r.variationDepuisHierPct >= 0 ? 'haut' : 'bas' });
      if (r.ma200 != null) E.push({ label: 'MA200 ' + r.unite, val: fr(r.ma200, d), sous: sg(r.ecartMa200Pct) + ' % · prix ' + r.positionMa200, ton: r.positionMa200 === 'au-dessus' ? 'haut' : 'bas' });
      if (r.tendanceDaily) E.push({ label: 'Tendance Daily / H4', val: r.tendanceDaily, sous: 'H4 ' + r.tendanceH4, ton: r.tendanceDaily === 'haussière' ? 'haut' : r.tendanceDaily === 'baissière' ? 'bas' : '' });
    } else if (t.nom === 'niveaux') {
      const px = r.prix, L = [...(r.reperesIct || []).filter(x => x.prix != null).map(x => ({ n: x.nom, p: x.prix })), ...(r.volume ? [{ n: 'POC H4', p: r.volume.pocH4 }, { n: 'VAH', p: r.volume.vah }, { n: 'VAL', p: r.volume.val }] : [])].filter(x => Number.isFinite(x.p));
      const haut = L.filter(x => x.p > px).sort((a, b) => a.p - b.p)[0], bas = L.filter(x => x.p < px).sort((a, b) => b.p - a.p)[0];
      if (haut) E.push({ label: 'Résistance proche · ' + haut.n, val: fr(haut.p, dec(r.actif)), sous: sg((haut.p / px - 1) * 100) + ' % du prix', ton: 'bas' });
      if (bas) E.push({ label: 'Support proche · ' + bas.n, val: fr(bas.p, dec(r.actif)), sous: sg((bas.p / px - 1) * 100) + ' % du prix', ton: 'haut' });
    } else if (t.nom === 'lecture_ict' && r.tendance) {
      const d = dec(r.actif), te = r.tendance, p = r.penche || {};
      E.push({ label: 'Tendance ' + r.unite, val: te.sens === 'haussiere' ? 'haussière' : te.sens === 'baissiere' ? 'baissière' : 'indécise', sous: te.derniereCassure ? te.derniereCassure.type + ' ' + te.derniereCassure.niveau + ' ' + fr(te.derniereCassure.prix, d) : '', ton: te.sens === 'haussiere' ? 'haut' : te.sens === 'baissiere' ? 'bas' : '' });
      E.push({ label: 'Lecture ICT ' + r.unite, val: p.sens === 'achat' ? 'penche à l’achat' : p.sens === 'vente' ? 'penche à la vente' : 'neutre', sous: p.invalidation ? 'invalidation ' + fr(p.invalidation.prix, d) : '', ton: p.sens === 'achat' ? 'haut' : p.sens === 'vente' ? 'bas' : '' });
    } else if (t.nom === 'mes_actifs' && r.horizons) {
      const h = r.horizons[2] || r.horizons[0]; if (h) E.push({ label: r.nom + ' · ' + h.horizon, val: h.verdict, sous: h.score100 != null ? h.score100 + ' / 100' : '', ton: h.score100 >= 58 ? 'haut' : h.score100 < 42 ? 'bas' : '' });
    } else if (t.nom === 'marches') {
      if (r.cot && r.cot.indexSpeculateurs != null) E.push({ label: 'COT · fonds spéculatifs', val: r.cot.indexSpeculateurs + ' / 100', sous: 'index sur 3 ans', ton: '' });
      if (r.scoreMarche && r.scoreMarche.score100 != null) E.push({ label: 'Score de marché', val: r.scoreMarche.score100 + ' / 100', sous: r.scoreMarche.verdict || '', ton: r.scoreMarche.score100 >= 58 ? 'haut' : r.scoreMarche.score100 < 42 ? 'bas' : '' });
    }
  }
  return E.slice(0, 5);
}
export function surlignagesDe(tour) {
  const S = [];
  for (const t of tour || []) {
    const r = t.resultat || {}; if (r.indisponible) continue;
    if (t.nom === 'prix_et_tendance' && r.ma200 != null) S.push({ type: 'prix', actif: r.actif, prix: r.ma200, texte: 'MA200 ' + r.unite });
    if (t.nom === 'niveaux') { const px = r.prix, L = [...(r.reperesIct || []).map(x => ({ n: x.nom, p: x.prix })), ...(r.volume ? [{ n: 'POC H4', p: r.volume.pocH4 }] : [])].filter(x => Number.isFinite(x.p) && x.n !== 'Ouverture jour'); const proches = L.sort((a, b) => Math.abs(a.p - px) - Math.abs(b.p - px)).slice(0, 2); for (const x of proches) S.push({ type: 'prix', actif: r.actif, prix: x.p, texte: x.n }); }
    if (t.nom === 'marches' && r.cot) S.push({ type: 'cot', actif: (t.args && t.args.actif) || null });
    if (t.nom === 'mes_actifs') S.push({ type: 'carte', actif: r.actif });
    if (t.nom === 'lecture_ict' && r.penche && r.penche.invalidation && Number.isFinite(r.penche.invalidation.prix)) S.push({ type: 'prix', actif: r.actif, prix: r.penche.invalidation.prix, texte: 'invalidation ' + r.unite });
  }
  return S;
}
