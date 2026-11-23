/* ═════════════ RAPPORTS GUIDÉS (v11, phases 1 et 3) : construction des étapes à partir des VRAIES données ═════════════
   Un rapport = une suite d'ÉTAPES. Chaque étape sait : quelle page ouvrir (`page`), comment cadrer le graphique (`cadrage`), quoi montrer (`segments[].montrer`), ce que Rayle dit (`segments[].texte`, une phrase ou deux par segment : l'animation suit la voix segment par segment),
   la carte résumé à l'écran (`carte`), un détail plus poussé (`detail`, « détaille ça ») et l'heure des données. Ce module ne touche NI l'écran NI le réseau : tout passe par `src` (voir lecteur.js ; les tests fournissent de fausses données).
   Garde-fous : aucune valeur inventée (un chiffre absent donne une étape « donnée manquante » que Rayle annonce puis passe) ; scénarios en « si… alors » avec déclencheur, entrée, invalidation et objectifs pris dans les niveaux mesurés ; jamais d'ordre ni de certitude.
   src = { pro(id) → instantané pro, outil(nom, args) → résultat des outils du cerveau, cot(inst) → JSON COT brut, calendrier() → JSON brut, macro() → JSON brut, statsFleches() → JSON, maintenant() }. */
import { lireUnite, phraseUnite, semaines, positionPrix, arrondir, SEUILS, atrA } from './bougies.js';
import { analyserCot, dateFr, indexCot, ZONE_HAUTE, ZONE_BASSE } from '../marches/cot.js';
import { lireEvenements, evenementsMajeurs, classerEvenement, heureParis, DEVISES_ACTIF } from '../marches/calendrier.js';
import { expliquerImpact } from '../marches/impact.js';
import { phraseStats } from '../terminal/stats-fleches.js';
import { pocsNus } from '../volume/volume-calcul.js';
import { correlation, rendements, tendance, sma } from '../commun/analyse.js';
import * as nar from './narration.js';

export const ACTIFS_COT = ['or', 'us100', 'us500', 'dxy', 'btc'];
const COT_INST = { or: 'OR', us100: 'NASDAQ', us500: 'SP500', btc: 'BTC', sol: 'SOL', dxy: 'DXY', eurusd: 'EURUSD' };
const NOMS = { or: "l'or", us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', dxy: 'le dollar (DXY)', eurusd: "l'EUR/USD", petrole: 'le pétrole' };
const NOMS_COURTS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', dxy: 'Dollar (DXY)', eurusd: 'EUR/USD', petrole: 'Pétrole' };
const DEC = { or: 2, us100: 1, us500: 1, btc: 0, sol: 2, dxy: 2, eurusd: 4, petrole: 2 };
export const TOUS_ACTIFS = ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'eurusd', 'dxy'];
const TERMINAL = new Set(['or', 'us100', 'us500', 'btc', 'sol', 'dxy', 'eurusd']);   // actifs que le terminal sait ouvrir (le pétrole passe par Mes actifs)
/* Estimation du coût en caractères parlés AVANT de lire (nombre d'étapes × moyenne mesurée sur les rapports de test) ; le coût réel est mesuré étape par étape. */
export const COUT_MOYEN_ETAPE = { complet: 350, cot: 230, marche: 215, macro: 450 };   // v12 : mesuré sur les textes explicatifs (rapports-textes.mjs)

/* ───── formats ───── */
const NB = /[  ]/g;
export const fr = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(NB, ' ') : '—');
const sg = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + fr(Math.abs(x), d) : '—');
const dc = id => (DEC[id] != null ? DEC[id] : 2);
const nom = id => NOMS[id] || id;
const parseIso = s => (typeof s === 'number' ? s : Date.parse(String(s || '').replace(' UTC', 'Z').replace(' ', 'T')));
export const quand = iso => { const t = parseIso(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)).replace(',', '').replace(' ', ' à ') + ' (Paris)' : 'heure inconnue'; };
const tonDe = s => (/haussi|hausse|au-dessus|acheteu/.test(s || '') ? 'haut' : /baissi|baisse|sous|vendeu/.test(s || '') ? 'bas' : '');
const indispo = r => !r || r.indisponible || r.__erreur;
const lcFirst = t => String(t || '').replace(/^[A-ZÉÈÀ]/, c => c.toLowerCase());
const parle = t => String(t == null ? '' : t).replace(/(\d)\.(\d)/g, '$1,$2').replace(/%/g, ' pour cent');
const raison = r => (r && (r.indisponible || r.__erreur)) || 'donnée absente';

/* ───── fabrique d'étapes ───── */
function etape(o) {
  const segs = (o.segments || []).filter(s => s && s.texte).map(s => ({ ...s, texte: String(s.texte).replace(/\s+/g, ' ').trim() }));
  const texte = segs.map(s => s.texte).join(' ');
  return { ok: true, passer: false, detail: '', annotations: [], ...o, segments: segs, texte, caracteres: texte.length };
}
function manque(id, chapitre, titre, page, why) {
  const texte = titre + ' : ' + why + ' Je passe à la suite.';
  return { ok: false, passer: true, id, chapitre, titre, page, cadrage: null, segments: [{ texte }], texte, caracteres: texte.length, detail: '', annotations: [], carte: { titre, lignes: [{ label: 'Donnée manquante', val: why, ton: 'bas' }] }, manque: why };
}
const memo = f => { const m = new Map(); return k => { const c = k == null ? '_' : String(k); if (!m.has(c)) m.set(c, Promise.resolve().then(() => f(k)).catch(e => ({ __erreur: String((e && e.message) || e).slice(0, 120) }))); return m.get(c); }; };
const sec = (a, b) => (b == null ? a : a + ' ' + b);

/* niveaux (nom, prix) exploitables, tirés de l'outil `niveaux` */
export function listeNiveaux(niv) {
  const L = []; if (indispo(niv)) return L;
  for (const x of niv.reperesIct || []) if (Number.isFinite(x.prix) && !/^Ouv/i.test(x.nom)) L.push({ nom: x.nom, prix: x.prix, type: 'ict' });
  if (niv.volume && !niv.volume.indisponible) for (const [n, p] of [['POC H4', niv.volume.pocH4], ['VAH H4', niv.volume.vah], ['VAL H4', niv.volume.val]]) if (Number.isFinite(p)) L.push({ nom: n, prix: p, type: 'volume' });
  for (const x of Array.isArray(niv.mesNiveauxTraces) ? niv.mesNiveauxTraces : []) if (Number.isFinite(x.prix)) L.push({ nom: 'ton niveau tracé en ' + (x.unite || '?'), prix: x.prix, type: 'trace' });
  for (const g of niv.fvg || []) { if (Number.isFinite(g.bas)) L.push({ nom: 'FVG ' + g.sens + ' (bas)', prix: g.bas, type: 'fvg' }); if (Number.isFinite(g.haut)) L.push({ nom: 'FVG ' + g.sens + ' (haut)', prix: g.haut, type: 'fvg' }); }
  const vus = new Set(); return L.filter(x => { const k = x.nom + '|' + x.prix; if (vus.has(k)) return false; vus.add(k); return true; });
}

/* ───── scénarios : « si… alors » avec déclencheur, entrée, invalidation, objectifs ───── */
export function scenarios(an, id) {
  const d = dc(id), px = an.prix, aH = an.h4 && an.h4.atr, au = (an.position && an.position.auDessus) || [], en = (an.position && an.position.enDessous) || [];
  const s = x => (x === 'haussière' ? 1 : x === 'baissière' ? -1 : 0), pm = x => (x === 'au-dessus' ? 1 : x === 'sous' ? -1 : 0);
  const facteurs = [['Weekly', s(an.weekly && an.weekly.tendance)], ['Daily', s(an.daily && an.daily.tendance)], ['H4', s(an.h4 && an.h4.tendance)], ['prix par rapport à la MA200 Daily', pm(an.daily && an.daily.positionMa200)]];
  const score = facteurs.reduce((t, f) => t + f[1], 0), regimeRange = /range/i.test((an.daily && an.daily.regime && an.daily.regime.type) || '');
  const sens = score >= 2 ? 1 : score <= -2 ? -1 : 0, niveau = Math.abs(score) >= 3 && !regimeRange ? 'fort' : Math.abs(score) >= 2 ? 'moyen' : 'faible';
  const pour = facteurs.filter(f => f[1] === (sens || 0) && sens !== 0).map(f => f[0]), contre = facteurs.filter(f => sens !== 0 && f[1] === -sens).map(f => f[0]);
  const raisonConf = sens === 0 ? 'signaux partagés entre les unités de temps (' + facteurs.map(f => f[0] + ' ' + (f[1] > 0 ? 'haussier' : f[1] < 0 ? 'baissier' : 'neutre')).join(', ') + ')' : pour.length + ' signal(aux) sur 4 dans le même sens (' + pour.join(', ') + ')' + (contre.length ? ', contre : ' + contre.join(', ') : '') + (regimeRange ? ' ; marché en range, confiance plafonnée' : '');
  const P = x => (x ? fr(x.prix, d) : null), marge = Number.isFinite(aH) ? 0.5 * aH : 0;
  /* objectifs : niveaux suivants, sans doublon (deux niveaux au même prix, ou à moins d'un quart d'ATR l'un de l'autre, n'en font qu'un) */
  const objectifs = (L, k) => { const out = [], sep = 0.25 * (aH || 0); for (const x of L.slice(k)) { if (out.length >= 2) break; if (out.every(o => Math.abs(o.prix - x.prix) > sep + 1e-9)) out.push({ prix: x.prix, nom: x.niveau }); } return out; };
  const mk = (titre, dir, declencheur, entree, invalidationPrix, objs, conf, annotations) => ({ titre, sens: dir, declencheur, entree, invalidation: invalidationPrix != null ? { prix: invalidationPrix, texte: (dir > 0 ? 'clôture H4 sous ' : dir < 0 ? 'clôture H4 au-dessus de ' : 'sortie du range à ') + fr(invalidationPrix, d) } : null, objectifs: objs, confiance: conf, annotations });
  let principal, alternatif;
  if (!au.length || !en.length) return { disponible: false, raison: 'pas assez de niveaux mesurés de part et d’autre du prix pour poser des scénarios', score, facteurs };
  const A = au[0], B = en[0];
  const hausse = () => mk('Scénario haussier', 1, 'clôture H4 au-dessus de ' + P(A) + ' (' + A.niveau + ')', 'retest de ' + P(A) + ' après la cassure, ou rebond sur ' + P(B) + ' (' + B.niveau + ')', B.prix - marge, objectifs(au, 1).length ? objectifs(au, 1) : [{ prix: A.prix + (aH || 0) * 2, nom: 'A.T.R. ×2 au-dessus du déclencheur' }], null,
    [{ type: 'niveau', prix: A.prix, texte: 'déclencheur haussier' }, { type: 'niveau', prix: B.prix - marge, texte: 'invalidation' }, ...objectifs(au, 1).map(o => ({ type: 'niveau', prix: o.prix, texte: 'objectif ' + o.nom }))]);
  const baisse = () => mk('Scénario baissier', -1, 'clôture H4 sous ' + P(B) + ' (' + B.niveau + ')', 'retest de ' + P(B) + ' par en dessous, ou rejet sur ' + P(A) + ' (' + A.niveau + ')', A.prix + marge, objectifs(en, 1).length ? objectifs(en, 1) : [{ prix: B.prix - (aH || 0) * 2, nom: 'A.T.R. ×2 sous le déclencheur' }], null,
    [{ type: 'niveau', prix: B.prix, texte: 'déclencheur baissier' }, { type: 'niveau', prix: A.prix + marge, texte: 'invalidation' }, ...objectifs(en, 1).map(o => ({ type: 'niveau', prix: o.prix, texte: 'objectif ' + o.nom }))]);
  if (sens > 0) { principal = hausse(); alternatif = baisse(); }
  else if (sens < 0) { principal = baisse(); alternatif = hausse(); }
  else {
    principal = mk('Scénario de range', 0, 'le prix reste entre ' + P(B) + ' et ' + P(A), 'rebond sur ' + P(B) + ' (achat) ou rejet sur ' + P(A) + ' (vente), avec confirmation en H4', null, [{ prix: sens === 0 && px - B.prix < A.prix - px ? A.prix : B.prix, nom: 'l’autre borne du range' }], null, [{ type: 'zone', prix: B.prix, prix2: A.prix, texte: 'range' }]);
    alternatif = mk('Sortie du range', 0, 'clôture H4 hors de ' + P(B) + ' – ' + P(A), 'après la cassure, retest du niveau cassé', null, [], null, []);
  }
  principal.confiance = { niveau, raison: raisonConf }; alternatif.confiance = { niveau: 'faible', raison: 'scénario contraire au biais principal (' + raisonConf + ')' };
  return { disponible: true, score, facteurs, principal, alternatif };
}
const phraseScenario = (sc, id) => {
  const d = dc(id), o = sc.objectifs.length ? ' Objectifs : ' + sc.objectifs.map(x => fr(x.prix, d) + ' (' + x.nom + ')').join(', puis ') + '.' : '';
  return sc.titre + ' : si ' + sc.declencheur + ', entrée possible : ' + sc.entree + (sc.invalidation ? '. Invalidation : ' + sc.invalidation.texte : '') + '.' + o;
};

/* corrélation sur 60 séances de l'actif avec un autre (rendements journaliers alignés par date) */
export function corrJours(Ja, Jb, n = 60) {
  const cle = t => Math.floor(t / 86400e3), mb = new Map((Jb || []).map(b => [cle(b.t), b.c])), A = [], B = [];
  for (const b of (Ja || []).slice(-(n + 10))) if (mb.has(cle(b.t))) { A.push(b.c); B.push(mb.get(cle(b.t))); }
  const r = correlation(rendements(A.slice(-n - 1)), rendements(B.slice(-n - 1))); return r == null ? null : arrondir(r, 2);
}

/* Couleur d'un actif (mêmes règles que marche_global) : Daily + H4 + position par rapport à la MA200 Daily ; ne lit que les bougies déjà chargées. */
const sgn = x => (x === 'haussière' ? 1 : x === 'baissière' ? -1 : 0);
export function couleurDe(Dn, id) {
  const px = Number.isFinite(Dn.prix) ? Dn.prix : Dn.h4[Dn.h4.length - 1].c, tJ = tendance(Dn.j), tH = tendance(Dn.h4), mJ = Dn.j.length >= 200 ? sma(Dn.j.map(b => b.c), 200).slice(-1)[0] : null;
  const score = sgn(tJ.sens) + sgn(tH.sens) + (mJ ? (px > mJ ? 1 : -1) : 0), couleur = score >= 2 ? 'haussier' : score <= -2 ? 'baissier' : 'neutre', veille = Dn.j.length > 1 ? Dn.j[Dn.j.length - 2].c : null;
  return { actif: id, nom: NOMS_COURTS[id] || id, couleur, score, prix: px, variationJourPct: veille ? (px / veille - 1) * 100 : null, phrase: (NOMS_COURTS[id] || id) + ' : Daily ' + tJ.sens + ', H4 ' + tH.sens + (mJ ? ', prix ' + (px > mJ ? 'au-dessus' : 'sous') + ' la MA200 Daily' : ''), donneesDu: Number.isFinite(Dn.t) ? new Date(Dn.t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null };
}
export function climatDe(liste) {
  const g = id => liste.find(x => x.actif === id) || { score: 0 }, actions = (g('us100').score + g('us500').score) / 2, dollar = g('dxy').score;
  const lecture = actions >= 1 && dollar <= 0 ? 'risk-on (actions américaines fortes, dollar pas haussier)' : actions <= -1 || dollar >= 2 ? 'risk-off (actions faibles ou dollar fort)' : 'mitigé (signaux partagés entre actions et dollar)';
  return { lecture, base: 'score actions ' + actions.toFixed(1) + ', score dollar ' + dollar };
}

/* ═════════════════════ A. RAPPORT COMPLET D'UN ACTIF ═════════════════════ */
function rapportComplet(id, src) {
  const d = dc(id), N = nom(id), NP = nar.nomParle(id), cap = NOMS_COURTS[id];
  const proM = memo(x => src.pro(x)), D = () => proM(id), niv = memo(() => src.outil('niveaux', { actif: id })), ana = memo(() => src.outil('analyse_marche', { actif: id })), clim = memo(async () => { const L = []; for (const o of ['us100', 'us500', 'dxy']) { try { const x = await proM(o); if (!indispo(x)) L.push(couleurDe(x, o)); } catch (e) { /* cet actif manquera au climat */ } } if (L.length < 2) return { indisponible: 'moins de deux actifs de référence lisibles (Nasdaq, S&P 500, dollar)' }; return { actifs: L, climat: climatDe(L), donneesDu: L[0].donneesDu }; });
  const mac = memo(() => src.macro()), cal = memo(() => src.calendrier()), maj = memo(() => src.outil('mes_actifs', { actif: id, horizon: 'swing' })), pt4 = memo(() => src.outil('prix_et_tendance', { actif: id, unite: 'H4' }));
  const marc = memo(() => src.outil('marches', { actif: id })), cotBrut = memo(() => src.cot(COT_INST[id])), stats = memo(() => (src.statsFleches ? src.statsFleches() : null));
  const pageT = (unite, extra) => ({ fenetre: 'terminal', actif: id, unite, ...(extra || {}) });
  const terminalOk = TERMINAL.has(id);
  const lire = async (unite, B, n, an, nomMa200, prix) => {
    const nv = await niv(id), ma = unite === 'S' ? (an.weekly && an.weekly.moyenne50Semaines) : unite === 'J' ? (an.daily && an.daily.ma200) : (an.h4 && an.h4.ma200);
    return lireUnite(B, { n, niveaux: listeNiveaux(nv), dec: d, unite: unite === 'S' ? 'Weekly' : unite === 'J' ? 'Daily' : 'H4', ma200: ma, nomMa200, prix, enCours: unite === 'S' || unite === 'J' });
  };
  const bougiesSegments = (L, uniteCode, nomU, ref) => {
    const S = []; if (!L || !L.disponible) return S;
    const der = L.derniere, av = L.bougies[L.bougies.length - 2];
    const vue = (b, lib) => ({ type: 'bougie', unite: uniteCode, t: b.t, tFin: uniteCode === 'S' ? b.t + 5 * 86400e3 : null, jours: uniteCode === 'S' && ref && ref.W[b.index] ? [ref.J[ref.W[b.index].i0], ref.J[ref.W[b.index].i1]].map(x => ({ o: x.o, h: x.h, l: x.l, c: x.c })) : null, o: b.o, h: b.h, l: b.l, c: b.c, texte: lib || b.etiquette });
    S.push({ texte: nar.bougie(L, nomU), montrer: [vue(der)], bougie: der.index });
    const pos = L.position, pn = nar.position(pos, L.prix); if (pos.disponible) S.push({ texte: pn.texte, montrer: [...pos.sur, ...pos.proche].slice(0, 2).map(n => ({ type: 'prix', prix: n.prix, texte: n.nom })).concat(!pos.sur.length && !pos.proche.length ? [pos.dessus, pos.dessous].filter(Boolean).map(n => ({ type: 'prix', prix: n.prix, texte: n.nom })) : []) });
    else S.push({ texte: pn.texte });
    return S;
  };
  const ligneBougie = (b, lib) => ({ label: lib, val: b.etiquette, ton: b.figures.find(f => f.sens) ? (b.figures.find(f => f.sens).sens > 0 ? 'haut' : 'bas') : '' });

  const etapes = [];
  /* 1 · contexte global */
  etapes.push({ id: 'contexte', chapitre: 'Contexte global', faire: async () => {
    const [g, m, c, mc] = await Promise.all([clim(), mac(), cal(), marc()]);
    if (indispo(g)) return manque('contexte', 'Contexte global', 'Contexte global', { fenetre: 'marches', section: 'aujourdhui' }, 'le tour des marchés est indisponible (' + raison(g) + ').');
    const S = [], L = [], dxy = (g.actifs || []).find(x => x.actif === 'dxy'), us = (g.actifs || []).filter(x => x.actif === 'us100' || x.actif === 'us500');
    S.push({ texte: nar.contexte({ id, climat: g.climat.lecture }).climat, ligne: 0 }); L.push({ label: 'Climat', val: g.climat.lecture.split(' (')[0], ton: /risk-on/.test(g.climat.lecture) ? 'haut' : /risk-off/.test(g.climat.lecture) ? 'bas' : '' });
    if (dxy && dxy.couleur !== 'indisponible') { S.push({ texte: nar.contexte({ id, dxy }).dollar, ligne: 1 }); L.push({ label: 'Dollar (DXY)', val: dxy.couleur + (dxy.variationJourPct != null ? ' · ' + sg(dxy.variationJourPct) + ' % sur la séance' : ''), ton: dxy.couleur === 'haussier' ? 'bas' : dxy.couleur === 'baissier' ? 'haut' : '' }); }
    else L.push({ label: 'Dollar (DXY)', val: 'indisponible', ton: '' });
    if (us.length) { S.push({ texte: nar.contexte({ id, us }).actions, ligne: 2 }); L.push({ label: 'Actions US', val: us.map(x => x.nom + ' ' + x.couleur).join(' · '), ton: '' }); }
    const mes = (k, nomM) => { for (const s of (m && m.sections) || []) for (const x of s.mesures || []) if (x.id === k) return x; return null; };
    const t10 = mes('taux.ust10'), pente = mes('taux.pente10_2'), reel = mes('taux.reel10');
    if (t10 && Number.isFinite(t10.valeur)) { S.push({ texte: nar.contexte({ id, t10: t10.valeur, reel: reel && reel.valeur }).taux, ligne: 3 }); L.push({ label: 'Taux 10 ans', val: fr(t10.valeur, 2) + ' %' + (reel && Number.isFinite(reel.valeur) ? ' · réel ' + fr(reel.valeur, 2) + ' %' : ''), ton: '' }); }
    else { S.push({ texte: 'Les taux américains ne sont pas lisibles pour le moment.', ligne: 3 }); L.push({ label: 'Taux 10 ans', val: 'indisponible', ton: '' }); }
    const act = !indispo(mc) && Array.isArray(mc.actualites) ? mc.actualites.slice(0, 2) : [];
    if (act.length) { S.push({ texte: nar.contexte({ id, titre: nar.cleanTitre(act[0].titre), actuExiste: true }).actu, ligne: 4 }); L.push({ label: 'Actualité', val: act[0].titre.slice(0, 70) + (act[0].source ? ' · ' + act[0].source : ''), ton: '' }); }
    else { S.push({ texte: 'Aucune actualité récente ne cite ' + NP + '.', ligne: 4 }); L.push({ label: 'Actualité', val: 'aucune actualité récente', ton: '' }); }
    let ann = []; if (!indispo(c)) ann = evenementsMajeurs(lireEvenements(c), src.maintenant(), { max: 40, pays: (DEVISES_ACTIF[id] || ['USD']) }).slice(0, 3);
    if (ann.length) { S.push({ texte: nar.contexte({ id, ann, maintenant: src.maintenant() }).annonces, ligne: 5 }); L.push({ label: 'Annonces fortes', val: ann.map(a => a.titre).join(' · '), ton: '' }); }
    else { S.push({ texte: indispo(c) ? 'Le calendrier est indisponible.' : 'Pas d’annonce à fort impact à venir cette semaine pour ' + NP + '.', ligne: 5 }); L.push({ label: 'Annonces fortes', val: indispo(c) ? 'calendrier indisponible' : 'aucune à fort impact', ton: '' }); }
    return etape({ id: 'contexte', chapitre: 'Contexte global', titre: 'Contexte global', page: { fenetre: 'marches', section: 'aujourdhui' }, segments: S, carte: { titre: 'Contexte global · ' + cap, grand: { label: 'Climat', val: g.climat.lecture.split(' (')[0] }, lignes: L }, detail: 'Détail du contexte : ' + (g.actifs || []).map(x => x.phrase).join(' ; ') + '. ' + (g.climat.base || ''), donneesDu: g.donneesDu });
  } });

  /* 2 · Weekly */
  etapes.push({ id: 'weekly', chapitre: 'Weekly', faire: async () => {
    const [Dn, an, nv] = await Promise.all([D(), ana(), niv()]); const page = pageT('J', { mode: 'volume', onglet: 'htf' });
    if (indispo(Dn) || indispo(an)) return manque('weekly', 'Weekly', 'Weekly', page, 'les données de ' + N + ' sont indisponibles (' + raison(indispo(an) ? an : Dn) + ').');
    const W = semaines(Dn.j), L = await lire('S', W, 4, an, 'MA50 semaines', an.prix);
    if (!L.disponible) return manque('weekly', 'Weekly', 'Weekly', page, 'pas assez de semaines pour lire les bougies Weekly (' + L.raison + ').');
    const w = an.weekly, S = [];
    S.push({ texte: nar.tendanceUnite({ nomU: 'Weekly', tendance: w.tendance, structure: w.structure }), ligne: 0 });
    if (w.moyenne50Semaines != null) S.push({ texte: nar.maUnite({ nomU: '', position: w.positionMoyenne50, ecartPct: null, nomMa: 'moyenne à cinquante semaines' }), ligne: 1, montrer: [{ type: 'prix', prix: w.moyenne50Semaines, texte: 'MA50 semaines' }] });
    S.push(...bougiesSegments(L, 'S', 'Weekly', { W, J: Dn.j }).map(s => ({ ...s, ligne: s.bougie != null ? 2 : 3 })));
    const wk = (nv.bougiesWeekly || []).filter(b => Number.isFinite(b.bas));
    if (wk.length) { const zb = wk.slice(-3); S.push({ texte: 'Les plus bas récents : des zones de rebond.', ligne: 3, montrer: zb.map(b => ({ type: 'prix', prix: b.bas, texte: 'bas hebdo' })).slice(-2) }); }
    const lg = [{ label: 'Tendance Weekly', val: w.tendance, ton: tonDe(w.tendance) }, { label: 'MA50 semaines', val: w.moyenne50Semaines != null ? fr(w.moyenne50Semaines, d) + ' · prix ' + w.positionMoyenne50 : 'indisponible', ton: w.positionMoyenne50 === 'au-dessus' ? 'haut' : w.positionMoyenne50 === 'sous' ? 'bas' : '' }, ligneBougie(L.derniere, 'Bougie en cours'), { label: 'Position', val: L.position.phrase, ton: '' }];
    return etape({ id: 'weekly', chapitre: 'Weekly', titre: 'Weekly', page, cadrage: { unite: 'J', barres: 70 }, segments: S, carte: { titre: 'Weekly · ' + cap, grand: { label: 'Tendance Weekly', val: w.tendance }, lignes: lg }, detail: 'Détail Weekly : ' + L.bougies.map(b => b.etiquette + ' (haut ' + fr(b.h, d) + ', bas ' + fr(b.l, d) + ')').join(' ; ') + '. ATR hebdomadaire ' + fr(L.atr, d) + '.', donneesDu: an.donneesDu, focus: { type: 'bougie', unite: 'S', t: L.derniere.t, tFin: L.derniere.t + 5 * 86400e3, h: L.derniere.h, l: L.derniere.l, texte: L.derniere.etiquette } });
  } });

  /* 3 · Daily, 4 · H4 */
  const unite = (code, titre, chap, B, nbBarres) => async () => {
    const idEt = code === 'J' ? 'daily' : 'h4';
    const [Dn, an] = await Promise.all([D(), ana()]); const page = pageT(code === 'J' ? 'J' : 'H4', { mode: 'classique' });
    if (indispo(Dn) || indispo(an)) return manque(idEt, chap, titre, page, 'les données de ' + N + ' sont indisponibles (' + raison(indispo(an) ? an : Dn) + ').');
    const bars = code === 'J' ? Dn.j : Dn.h4, u = code === 'J' ? an.daily : an.h4, L = await lire(code, bars, 4, an, 'MA200 ' + (code === 'J' ? 'Daily' : 'H4'), an.prix);
    if (!L.disponible) return manque(idEt, chap, titre, page, 'pas assez de bougies pour la lecture (' + L.raison + ').');
    const S = [];
    S.push({ texte: nar.tendanceUnite({ nomU: titre, tendance: u.tendance, regime: u.regime, structure: u.structure }), ligne: 0 });
    if (u.ma200 != null) S.push({ texte: nar.maUnite({ nomU: titre, position: u.positionMa200, ecartPct: u.ecartMa200Pct }), ligne: 1, montrer: [{ type: 'prix', prix: u.ma200, texte: 'MA200 ' + titre }] });
    else S.push({ texte: 'La MA200 ' + titre + ' n’est pas calculable (moins de deux cents bougies).', ligne: 1 });
    S.push(...bougiesSegments(L, code === 'J' ? 'J' : 'H4', titre).map(s => ({ ...s, ligne: s.bougie != null ? 2 : 3 })));
    let fl = [], stat = null;
    if (code === 'H4') {
      const p4 = await pt4(); fl = !indispo(p4) ? (p4.dernieresFleches || []).filter(f => f.unite === 'H4' || !f.unite).slice(0, 3) : [];
      const st = await stats(), ts = st && st.actifs && st.actifs[id] && st.actifs[id].H4 && st.actifs[id].H4.types;
      if (fl.length) { const f0 = fl[0], cle = String(f0.type || '').toLowerCase(), tp = ts && Object.keys(ts).find(k => k === cle || (st.types || []).some(t => t.id === k && t.nom === f0.type)); stat = tp ? phraseStats(N, 'H4', ts[tp]) : null;
        S.push({ texte: nar.flechesH4({ fl, N: NP, taux: tp ? ts[tp].taux : null, n: tp ? ts[tp].n : 0, maintenant: src.maintenant() }), ligne: 4, montrer: fl.slice(0, 2).filter(f => Number.isFinite(f.niveau)).map(f => ({ type: 'prix', prix: f.niveau, texte: 'flèche ' + f.type })) }); }
      else S.push({ texte: 'Aucune flèche récente en H4.', ligne: 4 });
    }
    const lg = [{ label: 'Tendance · régime', val: u.tendance + (u.regime && u.regime.type ? ' · ' + u.regime.type : ''), ton: tonDe(u.tendance) }, { label: 'MA200 ' + titre, val: u.ma200 != null ? fr(u.ma200, d) + ' · prix ' + u.positionMa200 + ' (' + sg(u.ecartMa200Pct) + ' %)' : 'indisponible', ton: u.positionMa200 === 'au-dessus' ? 'haut' : u.positionMa200 === 'sous' ? 'bas' : '' }, ligneBougie(L.derniere, 'Dernière bougie'), { label: 'Position', val: L.position.phrase, ton: '' }];
    if (code === 'H4') lg.push({ label: 'Flèches', val: fl.length ? fl.map(f => f.sens.split(' ')[0] + ' ' + f.type).join(' · ') : 'aucune récente', ton: '' });
    return etape({ id: idEt, chapitre: chap, titre, page, cadrage: { unite: code === 'J' ? 'J' : 'H4', barres: nbBarres }, segments: S, carte: { titre: titre + ' · ' + cap, grand: { label: 'Prix', val: fr(an.prix, d) }, lignes: lg }, detail: 'Détail ' + titre + ' : ' + L.bougies.map(b => b.etiquette + ' (' + b.forme.sens + (b.forme.tailleAtr != null ? ', ' + fr(b.forme.tailleAtr, 1) + ' ATR' : '') + (b.volume ? ', ' + b.volume.lib : '') + ')').join(' ; ') + '. ATR ' + fr(L.atr, d) + '. ' + (stat ? stat + '.' : ''), donneesDu: an.donneesDu, focus: { type: 'bougie', unite: code === 'J' ? 'J' : 'H4', t: L.derniere.t, h: L.derniere.h, l: L.derniere.l, texte: L.derniere.etiquette } });
  };
  etapes.push({ id: 'daily', chapitre: 'Daily', faire: unite('J', 'Daily', 'Daily', null, 60) });
  etapes.push({ id: 'h4', chapitre: 'H4', faire: unite('H4', 'H4', 'H4', null, 90) });

  /* 5 · Volume */
  etapes.push({ id: 'volume', chapitre: 'Volume', faire: async () => {
    const [Dn, nv, an] = await Promise.all([D(), niv(), ana()]); const page = pageT('H4', { mode: 'volume' });
    if (indispo(nv) || !nv.volume || nv.volume.indisponible) return manque('volume', 'Volume', 'Volume', page, 'le profil de volume n’est pas calculable pour ' + N + '.');
    const v = nv.volume, px = an && !indispo(an) ? an.prix : nv.prix, S = [], lg = [];
    const place = px > v.vah ? 'au-dessus de la zone de valeur' : px < v.val ? 'sous la zone de valeur' : 'dans la zone de valeur';
    S.push({ texte: nar.volumeProfil({ N: NP, px, v }), ligne: 0, montrer: [{ type: 'prix', prix: v.pocH4, texte: 'POC H4' }, { type: 'zone', prix: v.val, prix2: v.vah, texte: 'zone de valeur' }] });
    lg.push({ label: 'POC · zone de valeur', val: fr(v.pocH4, d) + ' · ' + fr(v.val, d) + ' – ' + fr(v.vah, d), ton: '' }, { label: 'Prix', val: place, ton: px > v.vah ? 'haut' : px < v.val ? 'bas' : '' });
    let nus = []; try { if (!indispo(Dn)) nus = [...pocsNus(Dn.h4, 'semaine', { max: 2 })].slice(0, 2); } catch (e) { nus = []; }
    if (nus.length) { S.push({ texte: nar.volumeNus({ nus, px }), ligne: 2, montrer: nus.map(n => ({ type: 'prix', prix: n.prix, texte: 'POC nu' })) }); lg.push({ label: 'POC nus', val: nus.map(n => fr(n.prix, d)).join(' · '), ton: '' }); } else { S.push({ texte: 'Aucun niveau de volume non revisité à proximité.', ligne: 2 }); lg.push({ label: 'POC nus', val: 'aucun', ton: '' }); }
    const vv = !indispo(an) ? an.volumeEtFlux && an.volumeEtFlux.volumeH4 : null;
    if (vv && !vv.indisponible) { S.push({ texte: nar.volumeFlux({ vv }), ligne: 3 }); lg.push({ label: 'Volume relatif · CVD', val: fr(vv.volumeRelatifDerniereBougie, 1) + ' × · CVD ' + (vv.cvdTendance || '?'), ton: vv.cvdTendance === 'en hausse' ? 'haut' : vv.cvdTendance === 'en baisse' ? 'bas' : '' }); }
    else { S.push({ texte: 'Volume et CVD indisponibles pour cet actif.', ligne: 3 }); lg.push({ label: 'Volume · CVD', val: 'indisponible', ton: '' }); }
    lg.push({ label: 'Footprint · carnet', val: 'lecture en direct…', ton: '' });
    return etape({ id: 'volume', chapitre: 'Volume', titre: 'Volume', page, cadrage: { unite: 'H4', barres: 80 }, segments: S, carte: { titre: 'Volume · ' + cap, grand: { label: 'POC H4', val: fr(v.pocH4, d) }, lignes: lg }, detail: 'Détail du volume : zones de volume fort à ' + (v.zonesDeVolume || []).map(x => fr(x, d)).join(', ') + '. Le POC est le prix où il s’est échangé le plus de volume ; hors de la zone de valeur le prix est « cher » ou « bon marché » pour les participants.', donneesDu: an && an.donneesDu,
      /* Une fois le terminal Volume ouvert sur l'actif : lecture du footprint et du carnet en direct (la même phrase que le terminal), dite après le texte principal ; sinon on le dit */
      suite: async () => { const r = await src.outil('carnet_et_volume', { actif: id }); const tv = r && r.terminalVolume, lt = r && r.lectureTerminal;
        let texte, val; if (tv && lt && typeof lt === 'string') { texte = nar.carnetDirect({ tv, lt, N: NP }); val = (tv.murs && tv.murs.length ? tv.murs.length + ' mur(s)' : 'pas de mur') + (tv.carnetVivant ? ' · carnet vivant' : ''); }
        else { texte = nar.carnetDirect({ tv: null, lt: null, N: NP }); val = 'indisponible (pas de flux direct)'; }
        return { texte, ligne: { index: 4, label: 'Footprint · carnet', val, ton: '' } }; } });
  } });

  /* 6 · COT */
  etapes.push({ id: 'cot', chapitre: 'COT', faire: async () => {
    const page = { fenetre: 'marches', section: 'cot', actif: id };
    if (!COT_INST[id]) return manque('cot', 'COT', 'COT', page, 'il n’existe pas de rapport COT pour ' + N + '.');
    const raw = await cotBrut(); if (indispo(raw)) return manque('cot', 'COT', 'COT', page, 'le rapport COT est indisponible (' + raison(raw) + ').');
    const a = analyserCot(raw); if (!a) return manque('cot', 'COT', 'COT', page, 'pas assez de semaines de COT publiées.');
    const dd = a.dernier, S = [{ texte: nar.cotCourt({ N: NP, a }), ligne: 0, montrer: [{ type: 'element', selecteur: '.tp-cartes > div:nth-child(2)', texte: 'indice COT' }] }];
    return etape({ id: 'cot', chapitre: 'COT', titre: 'COT', page, segments: S, carte: { titre: 'COT · ' + cap, grand: { label: 'Indice COT 3 ans', val: dd.indexSpec == null ? '—' : fr(dd.indexSpec, 0) + ' / 100' }, lignes: [{ label: a.nomSpec, val: fr(dd.spec, 0) + ' net · ' + sg(dd.varSpec, 0), ton: '' }, { label: 'Lecture', val: 'rapport COT pour le détail', ton: '' }] }, detail: 'Lecture du COT : ' + a.libelle + '. ' + dateFr(dd.date) + '.', donneesDu: dd.date + ' (mardi de mesure)' });
  } });

  /* 7 · Valorisation */
  etapes.push({ id: 'valo', chapitre: 'Valorisation', faire: async () => {
    const m = await maj(); const page = { fenetre: 'invest', section: 'mesactifs', actif: id };
    if (indispo(m)) return manque('valo', 'Valorisation', 'Valorisation', page, 'la valorisation « Mes actifs » est indisponible pour ' + N + ' (' + raison(m) + ').');
    const H = m.horizons || [], S = [{ texte: nar.valorisation({ N: NP, H }).verdict, ligne: 0, montrer: [{ type: 'element', selecteur: '[data-ma-actif="' + id + '"]', texte: 'verdict Mes actifs' }] }];
    const rs = (H[1] || H[0] || {}).raisons || []; if (rs.length) S.push({ texte: nar.valorisation({ N: NP, H }).raisons, ligne: 1 });
    return etape({ id: 'valo', chapitre: 'Valorisation', titre: 'Valorisation', page, segments: S, carte: { titre: 'Valorisation · ' + cap, grand: { label: (H[1] || H[0]).horizon, val: (H[1] || H[0]).verdict }, lignes: H.map(h => ({ label: h.horizon, val: h.verdict + ' · ' + h.score100 + ' / 100 · confiance ' + h.confiancePct + ' %', ton: h.score100 >= 58 ? 'haut' : h.score100 < 42 ? 'bas' : '' })) }, detail: 'Détail : ' + (m.phrase || '') + ' Prix lu le ' + quand(m.prixDu) + '.', donneesDu: m.prixDu });
  } });

  /* 8 · Scénarios */
  etapes.push({ id: 'scenarios', chapitre: 'Scénarios', faire: async () => {
    const [an, nv] = await Promise.all([ana(), niv()]); const page = pageT('H4', { mode: 'classique' });
    if (indispo(an)) return manque('scenarios', 'Scénarios', 'Scénarios', page, 'les données pour poser des scénarios sont indisponibles (' + raison(an) + ').');
    const sc = scenarios(an, id); void nv;
    if (!sc.disponible) return manque('scenarios', 'Scénarios', 'Scénarios', page, sc.raison + '.');
    const S = [{ texte: nar.scenarioPrincipal({ sc, d }), ligne: 0, montrer: sc.principal.annotations.map(x => (x.type === 'zone' ? { type: 'zone', prix: x.prix, prix2: x.prix2, texte: x.texte } : { type: 'prix', prix: x.prix, texte: x.texte })).slice(0, 4) },
      { texte: nar.scenarioAlternatif({ sc }), ligne: 1, montrer: sc.alternatif.annotations.map(x => ({ type: 'prix', prix: x.prix, texte: x.texte })).slice(0, 3) }];
    const ann = [...sc.principal.annotations, ...sc.alternatif.annotations].filter(x => Number.isFinite(x.prix)).slice(0, 8);
    return etape({ id: 'scenarios', chapitre: 'Scénarios', titre: 'Scénarios', page, cadrage: { unite: 'H4', barres: 90 }, segments: S, annotations: ann, scenarios: { principal: sc.principal, alternatif: sc.alternatif }, contexte: { prix: an.prix, atr: an.h4.atr, dec: d, niveaux: [...(an.position.auDessus || []).map(x => ({ nom: x.niveau, prix: x.prix })), ...(an.position.enDessous || []).map(x => ({ nom: x.niveau, prix: x.prix }))], donneesDu: an.donneesDu }, carte: { titre: 'Scénarios · ' + cap, grand: { label: sc.principal.titre, val: 'confiance ' + sc.principal.confiance.niveau }, lignes: [{ label: sc.principal.titre, val: 'si ' + sc.principal.declencheur, ton: sc.principal.sens > 0 ? 'haut' : sc.principal.sens < 0 ? 'bas' : '' }, { label: 'Invalidation', val: sc.principal.invalidation ? sc.principal.invalidation.texte : 'sortie du range', ton: 'bas' }, { label: 'Objectifs', val: sc.principal.objectifs.map(o => fr(o.prix, d)).join(' puis ') || 'à définir', ton: 'haut' }, { label: sc.alternatif.titre, val: 'si ' + sc.alternatif.declencheur, ton: '' }] }, detail: 'Détail des scénarios. Biais mesuré : ' + sc.facteurs.map(f => f[0] + ' ' + (f[1] > 0 ? 'haussier' : f[1] < 0 ? 'baissier' : 'neutre')).join(', ') + '. Entrée du principal : ' + sc.principal.entree + '. Entrée de l’alternatif : ' + sc.alternatif.entree + '. L’A.T.R. H4 est de ' + fr(an.h4.atr, d) + ' : l’invalidation est placée une demi A.T.R. au-delà du niveau.', donneesDu: an.donneesDu });
  } });

  /* 9 · Vigilance et risque */
  etapes.push({ id: 'risque', chapitre: 'Vigilance et risque', faire: async () => {
    const [an, c, Dn] = await Promise.all([ana(), cal(), D()]); const page = { fenetre: 'portefeuille', section: 'risque' };
    if (indispo(an)) return manque('risque', 'Vigilance et risque', 'Vigilance et risque', page, 'les données sont indisponibles (' + raison(an) + ').');
    const S = [], lg = [], ev = !indispo(c) ? evenementsMajeurs(lireEvenements(c), src.maintenant(), { max: 40, pays: DEVISES_ACTIF[id] || ['USD'] }).slice(0, 2) : [];
    S.push({ texte: nar.vigilance({ N: NP, ev, devises: DEVISES_ACTIF[id] || ['USD'], maintenant: src.maintenant() }), ligne: 0 }); lg.push({ label: 'Annonces', val: ev.length ? ev.map(a => a.titre).join(' · ') : 'aucune forte à venir', ton: ev.length ? 'bas' : 'haut' });
    const atrPct = an.daily && an.daily.atr && an.prix ? an.daily.atr / an.prix * 100 : null;
    S.push({ texte: nar.volatilite({ atrPct, regime: an.daily && an.daily.regime }), ligne: 1 }); lg.push({ label: 'Volatilité (ATR Daily)', val: atrPct != null ? fr(atrPct, 1) + ' % du prix' : 'indisponible', ton: '' });
    const cors = []; if (!indispo(Dn)) for (const o of ['dxy', 'us100']) if (o !== id) { const x = await proM(o); if (!indispo(x)) { const r = corrJours(Dn.j, x.j, 60); if (r != null) cors.push({ o, r }); } }
    if (cors.length) { S.push({ texte: nar.correlations({ N: NP, cors }), ligne: 2 }); lg.push({ label: 'Corrélations 60 séances', val: cors.map(x => NOMS_COURTS[x.o] + ' ' + fr(x.r, 2)).join(' · '), ton: '' }); }
    else { S.push({ texte: 'Les corrélations ne sont pas calculables pour le moment.', ligne: 2 }); lg.push({ label: 'Corrélations', val: 'indisponible', ton: '' }); }
    const r = an.monRisque;
    if (r && !r.indisponible && (r.risque || r.portefeuille)) { S.push({ texte: nar.risquePerso(r), ligne: 3, montrer: [{ type: 'element', selecteur: '.tp-carte', texte: 'mon risque' }] }); lg.push({ label: 'Mon risque', val: String(r.risque || r.portefeuille).slice(0, 110), ton: '' }); }
    else { S.push({ texte: 'Ton risque engagé n’est pas lisible : l’historique XTB n’est pas importé sur cet appareil.', ligne: 3 }); lg.push({ label: 'Mon risque', val: 'historique XTB non importé', ton: '' }); }
    return etape({ id: 'risque', chapitre: 'Vigilance et risque', titre: 'Vigilance et risque', page, segments: S, carte: { titre: 'Vigilance · ' + cap, grand: { label: 'Volatilité', val: atrPct != null ? fr(atrPct, 1) + ' %' : '—' }, lignes: lg }, detail: r && !r.indisponible ? 'Détail du risque : ' + [r.portefeuille, r.risque].filter(Boolean).join(' ').slice(0, 700) : 'Pas de détail de risque : historique non importé.', donneesDu: an.donneesDu });
  } });
  etapes.prechauffer = () => { clim(); ana(); niv(); D(); cotBrut(); };   /* lancé dès la demande : le gros des lectures se fait pendant l'ouverture de la barre et la première étape */
  return etapes;
}

/* ═════════════════════ B. RAPPORT COT ═════════════════════ */
const pctRang = (serie, k) => { const w = serie.slice(-k); if (w.length < Math.min(k, 26)) return null; const v = w[w.length - 1]; return Math.round(w.filter(x => x <= v).length / w.length * 100); };
const prixAuxDates = (dates, jours) => { const out = []; let k = 0; for (const dt of dates) { const t = Date.parse(dt + 'T23:59:59Z'); while (k + 1 < jours.length && jours[k + 1].t <= t) k++; out.push(jours.length && jours[k].t <= t ? jours[k].c : null); } return out; };
/* épisodes d'extrême du COT index : semaine d'entrée + prix 8 semaines plus tard (si on a le prix) */
export function episodesExtremes(a, px, sens, horizon = 8) {
  const idx = a.indexSpec, ep = []; let dans = false;
  for (let i = 0; i < idx.length; i++) { const e = idx[i] != null && (sens === 'haut' ? idx[i] >= ZONE_HAUTE : idx[i] <= ZONE_BASSE); if (e && !dans) { ep.push({ i, date: a.dates[i], index: idx[i] }); dans = true; } if (!e) dans = false; }
  return ep.map(x => { const p0 = px ? px[x.i] : null, p1 = px && x.i + horizon < px.length ? px[x.i + horizon] : null; return { ...x, prix0: p0, apres: p0 != null && p1 != null ? (p1 / p0 - 1) * 100 : null }; });
}
function rapportCot(id, src) {
  const N = nom(id), NP = nar.nomParle(id), cap = NOMS_COURTS[id], inst = COT_INST[id], d = dc(id);
  const page = { fenetre: 'marches', section: 'cot', actif: id }, raw = memo(() => (inst ? src.cot(inst) : { indisponible: 'aucun rapport COT pour ' + N })), D = memo(() => src.pro(id));
  const ana = memo(async () => { const r = await raw(); if (indispo(r)) return { err: raison(r) }; const a = analyserCot(r); return a ? { a, brut: r } : { err: 'pas assez de semaines de COT publiées (moins de huit)' }; });
  const sur = (n) => '.tp-cartes > div:nth-child(' + n + ')';
  const note = id === 'eurusd' || id === 'sol' ? 'La fenêtre COT n’affiche pas ' + N + ' : je te montre ses chiffres dans ma carte.' : '';
  const sans = (cid, chap, why) => manque(cid, chap, chap, page, why);
  const etapes = [];
  etapes.push({ id: 'positions', chapitre: 'Positions nettes', faire: async () => {
    const r = await ana(); if (r.err) return sans('positions', 'Positions nettes', r.err + '.');
    const { a } = r, dd = a.dernier, S = [{ texte: nar.cotPositions({ N: NP, a })[0], ligne: 0 }];
    if (note) S.push({ texte: note, ligne: 0 });
    S.push({ texte: nar.cotPositions({ N: NP, a })[1], ligne: 1, montrer: [{ type: 'element', selecteur: sur(1), texte: a.nomSpec }] });
    S.push({ texte: nar.cotPositions({ N: NP, a })[2], ligne: 2, montrer: [{ type: 'element', selecteur: sur(3), texte: a.nomComm }] });
    S.push({ texte: nar.cotPositions({ N: NP, a })[3], ligne: 3 });
    return etape({ id: 'positions', chapitre: 'Positions nettes', titre: 'Positions nettes', page, segments: S, carte: { titre: 'COT · positions nettes · ' + cap, grand: { label: a.nomSpec, val: fr(dd.spec, 0) }, lignes: [{ label: 'Date de mesure', val: dateFr(dd.date) + ' (mardi)', ton: '' }, { label: a.nomSpec, val: fr(dd.spec, 0) + ' net · ' + sg(dd.varSpec, 0) + ' / semaine', ton: dd.varSpec > 0 ? 'haut' : dd.varSpec < 0 ? 'bas' : '' }, { label: a.nomComm, val: fr(dd.comm, 0) + ' net · ' + sg(dd.varComm, 0) + ' / semaine', ton: '' }, { label: 'Petits spéculateurs', val: 'non fournis par la source', ton: '' }] }, detail: 'Détail : contrats longs et courts du dernier rapport. ' + a.source + '. Les positions nettes sont longues moins courtes.', donneesDu: dd.date + ' (mardi de mesure)' });
  } });
  etapes.push({ id: 'indice', chapitre: 'Indice COT', faire: async () => {
    const r = await ana(); if (r.err) return sans('indice', 'Indice COT', r.err + '.');
    const { a } = r, dd = a.dernier, p52 = pctRang(a.spec, 52), p156 = pctRang(a.spec, 156);
    if (dd.indexSpec == null) return sans('indice', 'Indice COT', 'l’historique est trop court (moins d’un an) pour situer la position.');
    const ext = dd.extremeSpec === 'haut' ? 'extrême acheteur : la position est déjà très chargée' : dd.extremeSpec === 'bas' ? 'extrême vendeur : la position vendeuse est très chargée' : 'pas d’extrême : ni trop acheteur, ni trop vendeur';
    const S = [{ texte: nar.cotIndice({ a, p52 }).extreme, ligne: 0, montrer: [{ type: 'element', selecteur: sur(2), texte: 'indice COT' }] },
      { texte: nar.cotIndice({ a, p52 }).percentile, ligne: 1 }];
    if (dd.indexComm != null) S.push({ texte: nar.cotIndice({ a, p52 }).comm, ligne: 2 });
    return etape({ id: 'indice', chapitre: 'Indice COT', titre: 'Indice COT', page, segments: S, contexte: { indexSpec: dd.indexSpec, spec: dd.spec, oi: dd.oi, dateMesure: dd.date }, carte: { titre: 'COT · indice · ' + cap, grand: { label: 'Indice COT 3 ans', val: fr(dd.indexSpec, 0) + ' / 100' }, lignes: [{ label: 'Spéculateurs', val: fr(dd.indexSpec, 0) + ' / 100 · ' + (dd.extremeSpec ? 'extrême ' + (dd.extremeSpec === 'haut' ? 'acheteur' : 'vendeur') : 'pas d’extrême'), ton: dd.extremeSpec === 'haut' ? 'bas' : dd.extremeSpec === 'bas' ? 'haut' : '' }, { label: 'Percentile 52 semaines', val: p52 == null ? '—' : p52 + ' %', ton: '' }, { label: 'Percentile 3 ans', val: p156 == null ? '—' : p156 + ' %', ton: '' }, { label: 'Commerciaux', val: dd.indexComm == null ? '—' : fr(dd.indexComm, 0) + ' / 100', ton: '' }] }, detail: 'L’indice COT vaut 0 au plus bas de la position nette sur trois ans et 100 à son plus haut ; au-dessus de ' + ZONE_HAUTE + ' ou sous ' + ZONE_BASSE + ' on parle d’extrême.', donneesDu: dd.date + ' (mardi de mesure)' });
  } });
  etapes.push({ id: 'oi', chapitre: 'Intérêt ouvert', faire: async () => {
    const r = await ana(); if (r.err) return sans('oi', 'Intérêt ouvert', r.err + '.');
    const { a } = r, dd = a.dernier, oi = a.oi, n = oi.length, v4 = n > 4 ? oi[n - 1] - oi[n - 5] : null, v13 = n > 13 ? oi[n - 1] - oi[n - 14] : null;
    const tend = v13 == null ? 'indéterminée' : v13 > 0 ? 'en hausse' : v13 < 0 ? 'en baisse' : 'stable';
    const S = [{ texte: nar.cotOi({ tend, v13 })[0], ligne: 0, montrer: [{ type: 'element', selecteur: sur(4), texte: 'intérêt ouvert' }] },
      { texte: nar.cotOi({ tend, v13 })[1], ligne: 1 }];
    return etape({ id: 'oi', chapitre: 'Intérêt ouvert', titre: 'Intérêt ouvert', page, segments: S, carte: { titre: 'COT · intérêt ouvert · ' + cap, grand: { label: 'Intérêt ouvert', val: fr(dd.oi, 0) }, lignes: [{ label: 'Semaine', val: sg(dd.varOi, 0), ton: '' }, { label: '4 semaines', val: v4 == null ? '—' : sg(v4, 0), ton: '' }, { label: '13 semaines', val: v13 == null ? '—' : sg(v13, 0), ton: v13 > 0 ? 'haut' : v13 < 0 ? 'bas' : '' }, { label: 'Tendance', val: tend, ton: '' }] }, detail: 'L’intérêt ouvert est le nombre total de contrats en cours.', donneesDu: dd.date + ' (mardi de mesure)' });
  } });
  etapes.push({ id: 'divergence', chapitre: 'Prix et positionnement', faire: async () => {
    const r = await ana(); if (r.err) return sans('divergence', 'Prix et positionnement', r.err + '.');
    const Dn = inst && TERMINAL.has(id) ? await D() : null; if (!Dn || indispo(Dn)) return sans('divergence', 'Prix et positionnement', 'le prix de ' + N + ' n’est pas disponible ici : pas de comparaison prix et positionnement.');
    const { a } = r, px = prixAuxDates(a.dates, Dn.j), n = a.dates.length - 1, k = 8, p0 = px[n - k], p1 = px[n]; if (p0 == null || p1 == null) return sans('divergence', 'Prix et positionnement', 'historique de prix trop court.');
    const dp = (p1 / p0 - 1) * 100, ds = a.spec[n] - a.spec[n - k], dir = dp > 1 ? 1 : dp < -1 ? -1 : 0, ds_ = ds > 0 ? 1 : ds < 0 ? -1 : 0;
    const diverge = dir !== 0 && ds_ !== 0 && dir !== ds_;
    const S = [{ texte: nar.cotDivergence({ N: NP, dp, ds, nomSpec: a.nomSpec, diverge, dir, ds_ })[0], ligne: 0 },
      { texte: nar.cotDivergence({ N: NP, dp, ds, nomSpec: a.nomSpec, diverge, dir, ds_ })[1], ligne: 1 }];
    return etape({ id: 'divergence', chapitre: 'Prix et positionnement', titre: 'Prix et positionnement', page, segments: S, carte: { titre: 'COT · divergence · ' + cap, grand: { label: 'Divergence', val: diverge ? 'oui' : 'non' }, lignes: [{ label: 'Prix, 8 semaines', val: sg(dp, 1) + ' %', ton: dp > 0 ? 'haut' : 'bas' }, { label: a.nomSpec + ', 8 sem.', val: sg(ds, 0), ton: ds > 0 ? 'haut' : 'bas' }, { label: 'Divergence', val: diverge ? 'oui' : 'non', ton: diverge ? 'bas' : '' }] }, detail: 'Le prix est pris à la clôture du mardi de chaque rapport (jamais de valeur du futur).', donneesDu: a.dernier.date + ' (mardi de mesure)' });
  } });
  etapes.push({ id: 'historique', chapitre: 'Historique', faire: async () => {
    const r = await ana(); if (r.err) return sans('historique', 'Historique', r.err + '.');
    const { a } = r, Dn = TERMINAL.has(id) ? await D() : null, px = Dn && !indispo(Dn) ? prixAuxDates(a.dates, Dn.j) : null;
    const hauts = episodesExtremes(a, px, 'haut'), bas = episodesExtremes(a, px, 'bas'), dd = a.dernier;
    const dire = e => dateFr(e.date) + ' (indice ' + fr(e.index, 0) + ')' + (e.apres != null ? ', puis ' + sg(e.apres, 1) + ' pour cent de prix en huit semaines' : '');
    const HT = nar.cotHistorique({ hauts, bas, avecPrix: !!px, maintenant: src.maintenant() }), S = HT.map((t, i) => ({ texte: t, ligne: i, ...(i === 0 ? { montrer: [{ type: 'element', selecteur: '[data-g]', texte: 'historique du COT' }] } : {}) }));
    const ok = [...hauts, ...bas].filter(e => e.apres != null);
    return etape({ id: 'historique', chapitre: 'Historique', titre: 'Historique', page, segments: S, carte: { titre: 'COT · historique · ' + cap, grand: { label: 'Épisodes extrêmes', val: String(hauts.length + bas.length) }, lignes: [...hauts.slice(-2).map(e => ({ label: 'Extrême acheteur', val: dire(e), ton: 'bas' })), ...bas.slice(-2).map(e => ({ label: 'Extrême vendeur', val: dire(e), ton: 'haut' }))] }, detail: 'Mesure sur ' + a.dates.length + ' semaines (' + dateFr(a.dates[0]) + ' à ' + dateFr(dd.date) + '). ' + (ok.length ? ok.length + ' épisodes avec prix connu : c’est un petit échantillon, pas une règle.' : 'Aucun épisode avec prix connu.'), donneesDu: dd.date + ' (mardi de mesure)' });
  } });
  etapes.push({ id: 'conclusion', chapitre: 'Conclusion', faire: async () => {
    const r = await ana(); if (r.err) return sans('conclusion', 'Conclusion', r.err + '.');
    const { a } = r, dd = a.dernier, ext = dd.extremeSpec;
    const imp = ext === 'haut' ? 'Les fonds sont très acheteurs : le carburant d’une hausse se raréfie et un retournement serait plus brutal ; à surveiller sur les semaines à venir, sans en faire un signal de vente.' : ext === 'bas' ? 'Les fonds sont très vendeurs : un rebond violent est possible s’ils rachètent ; à surveiller, sans en faire un signal d’achat.' : 'Aucun extrême : le positionnement ne donne pas, à lui seul, d’indication marquée pour les prochaines semaines.';
    const S = [{ texte: nar.cotConclusion({ ext })[0], ligne: 0 }, { texte: nar.cotConclusion({ ext })[1], ligne: 1 }];
    return etape({ id: 'conclusion', chapitre: 'Conclusion', titre: 'Conclusion', page, segments: S, carte: { titre: 'COT · conclusion · ' + cap, grand: { label: 'Positionnement', val: ext ? 'extrême ' + (ext === 'haut' ? 'acheteur' : 'vendeur') : 'sans extrême' }, lignes: [{ label: 'Implication', val: imp.slice(0, 130), ton: '' }, { label: 'Limites', val: 'indicateur lent · donnée du mardi ' + dateFr(dd.date), ton: '' }] }, detail: 'Résumé : ' + lectureResume(a, N), donneesDu: dd.date + ' (mardi de mesure)' });
  } });
  etapes.prechauffer = () => { ana(); D(); };
  return etapes;
}
const lectureResume = (a, N) => { const d = a.dernier; return N + ' : ' + a.nomSpec + ' ' + fr(d.spec, 0) + ' net, indice ' + (d.indexSpec == null ? '—' : fr(d.indexSpec, 0)) + ', intérêt ouvert ' + fr(d.oi, 0) + '.'; };

/* ═════════════════════ C. RAPPORT « MARCHÉ GLOBAL » ═════════════════════ */
function rapportMarche(src) {
  const glob = memo(() => src.outil('marche_global', {})), etapes = [];
  const ligneActif = x => ({ label: x.nom, val: x.couleur + (x.variationJourPct != null ? ' · ' + sg(x.variationJourPct) + ' %' : ''), ton: x.couleur === 'haussier' ? 'haut' : x.couleur === 'baissier' ? 'bas' : '' });
  etapes.push({ id: 'climat', chapitre: 'Climat', faire: async () => {
    const g = await glob(); const page = { fenetre: 'marches', section: 'actifs' };
    if (indispo(g)) return manque('climat', 'Climat', 'Climat', page, 'le tour des marchés est indisponible (' + raison(g) + ').');
    return etape({ id: 'climat', chapitre: 'Climat', titre: 'Le marché en global', page, contexte: { climat: g.climat.lecture.split(' (')[0], couleurs: Object.fromEntries((g.actifs || []).map(x => [x.actif, x.couleur])) }, segments: [{ texte: nar.climatGlobal(g.climat.lecture), ligne: 0 }], carte: { titre: 'Marché global', grand: { label: 'Climat', val: g.climat.lecture.split(' (')[0] }, lignes: (g.actifs || []).map(ligneActif) }, detail: g.avertissement + ' ' + g.climat.base, donneesDu: g.donneesDu });
  } });
  for (const id of ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'eurusd', 'dxy']) etapes.push({ id: 'actif-' + id, chapitre: NOMS_COURTS[id], faire: async () => {
    const g = await glob(); const x = !indispo(g) ? (g.actifs || []).find(a => a.actif === id) : null;
    const page = TERMINAL.has(id) ? { fenetre: 'terminal', actif: id, unite: 'H4', mode: 'classique' } : { fenetre: 'invest', section: 'mesactifs', actif: id };
    if (!x || x.couleur === 'indisponible') return manque('actif-' + id, NOMS_COURTS[id], NOMS_COURTS[id], page, x && x.phrase ? (x.phrase.startsWith(NOMS_COURTS[id] + ' : ') ? x.phrase.slice(NOMS_COURTS[id].length + 3) : x.phrase) : 'les données sont indisponibles.');
    let pos = '', montrer = [], pl = null;
    if (TERMINAL.has(id) && id !== 'eurusd') {
      const [nv, Dn] = await Promise.all([memo(() => src.outil('niveaux', { actif: id }))(id), memo(() => src.pro(id))(id)]);
      if (!indispo(nv) && !indispo(Dn)) { const A = atrA(Dn.h4), atr = A[A.length - 1]; pl = positionPrix(x.prix, listeNiveaux(nv), atr, { dec: dc(id), unite: 'H4' }); pos = pl.disponible ? ' ' + pl.phrase : ''; montrer = pl.disponible ? [...pl.sur, ...pl.proche].slice(0, 1).concat(!pl.sur.length && !pl.proche.length ? [pl.dessous, pl.dessus].filter(Boolean).slice(0, 1) : []).map(n => ({ type: 'prix', prix: n.prix, texte: n.nom })) : []; }
    }
    return etape({ id: 'actif-' + id, chapitre: NOMS_COURTS[id], titre: NOMS_COURTS[id], page, cadrage: TERMINAL.has(id) ? { unite: 'H4', barres: 90 } : null, segments: [{ texte: nar.actifGlobal({ id, x, pl, prix: x.prix }), ligne: 0, montrer }], carte: { titre: NOMS_COURTS[id], grand: { label: x.couleur, val: x.prix != null ? fr(x.prix, dc(id)) : '—' }, lignes: [{ label: 'Lecture', val: x.phrase, ton: x.couleur === 'haussier' ? 'haut' : x.couleur === 'baissier' ? 'bas' : '' }, ...(x.variationJourPct != null ? [{ label: 'Séance', val: sg(x.variationJourPct) + ' %', ton: x.variationJourPct >= 0 ? 'haut' : 'bas' }] : []), ...(pl && pl.disponible ? [{ label: 'Position', val: pl.phrase, ton: '' }] : [])] }, detail: 'Détail ' + NOMS_COURTS[id] + ' : ' + x.phrase + (x.aligne ? ', Daily et H4 alignés' : '') + '. Données du ' + quand(x.donneesDu) + '.', donneesDu: x.donneesDu });
  } });
  for (const k of [0, 1]) for (const part of ['lecture', 'scenarios']) etapes.push({ id: 'top' + (k + 1) + '-' + part, chapitre: 'Top ' + (k + 1), faire: async () => {
    const g = await glob(), t = !indispo(g) ? (g.lesDeuxPlusInteressants || [])[k] : null;
    if (!t) return manque('top' + (k + 1) + '-' + part, 'Top ' + (k + 1), 'Top ' + (k + 1), { fenetre: 'marches', section: 'actifs' }, 'pas assez d’actifs lisibles pour un ' + (k + 1) + 'er du classement.');
    const sub = rapportComplet(t.actif, src), cle = part === 'lecture' ? 'daily' : 'scenarios', f = sub.find(e => e.id === cle), s = await f.faire();
    if (!s.ok) return { ...s, chapitre: 'Top ' + (k + 1) };
    const intro = part === 'lecture' ? nar.introTop({ k, t }) : '';
    return { ...s, id: 'top' + (k + 1) + '-' + part, chapitre: 'Top ' + (k + 1) + ' · ' + t.nom, titre: (part === 'lecture' ? 'Lecture' : 'Scénarios') + ' · ' + t.nom, segments: intro ? [{ texte: intro, ligne: 0 }, ...s.segments] : s.segments, texte: (intro ? intro + ' ' : '') + s.texte, caracteres: s.caracteres + (intro ? intro.length + 1 : 0) };
  } });
  etapes.prechauffer = () => { glob(); for (const id of ['or', 'us100', 'us500', 'btc', 'sol', 'dxy']) { try { Promise.resolve(src.pro(id)).catch(() => {}); } catch (e) { /* préchauffage facultatif */ } } };   /* v12 : les instantanés des actifs sont lus pendant la première étape (la première étape est courte) */
  return etapes;
}

/* ═════════════════════ D. RAPPORT MACRO ET CALENDRIER ═════════════════════ */
/* réaction MESURÉE d'un actif à une annonce déjà publiée : variation entre la clôture H1 avant l'heure de l'annonce et celle 2 h après */
export function reactionAnnonce(H1, t, heures = 2) {
  if (!H1 || H1.length < 10) return null; let i0 = -1; for (let i = 0; i < H1.length; i++) { if (H1[i].t + 3600e3 <= t) i0 = i; else break; } if (i0 < 0 || t - (H1[i0].t + 3600e3) > 3 * 3600e3) return null; /* dernière bougie H1 CLÔTURÉE avant l'annonce */
  const j = H1.findIndex(b => b.t + 3600e3 >= t + heures * 3600e3); if (j < 0) return null; /* première bougie H1 dont la clôture tombe au moins 2 h après */ return arrondir((H1[j].c / H1[i0].c - 1) * 100, 2);
}
function rapportMacro(src) {
  const cal = memo(() => src.calendrier()), etapes = [], page = { fenetre: 'marches', section: 'aujourdhui' }, pro = memo(id => src.pro(id));
  etapes.push({ id: 'semaine', chapitre: 'La semaine', faire: async () => {
    const c = await cal(); if (indispo(c)) return manque('semaine', 'La semaine', 'La semaine', page, 'le calendrier est indisponible (' + raison(c) + ').');
    const tous = lireEvenements(c), maintenant = src.maintenant(), fortes = tous.filter(e => e.impact === 'fort'), avenir = fortes.filter(e => e.t > maintenant - 15 * 60e3);
    if (!tous.length) return manque('semaine', 'La semaine', 'La semaine', page, 'le calendrier est vide.');
    const parJour = {}; for (const e of avenir) { const j = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(new Date(e.t)); (parJour[j] = parJour[j] || []).push(e); }
    const SS = nar.macroSemaine({ nbAvenir: avenir.length, parJour }), S = SS.map((t, i) => ({ texte: t, ligne: Math.min(i, 1) }));
    return etape({ id: 'semaine', chapitre: 'La semaine', titre: 'La semaine', page, segments: S, carte: { titre: 'Annonces de la semaine', grand: { label: 'À venir (impact fort)', val: String(avenir.length) }, lignes: Object.entries(parJour).slice(0, 5).map(([j, L]) => ({ label: j, val: L.slice(0, 3).map(e => e.titre).join(' · '), ton: '' })) }, detail: 'Calendrier : source Forex Factory, heures de Paris. Les annonces déjà passées ne sont pas relues ici.', donneesDu: new Date(maintenant).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' });
  } });
  for (let k = 0; k < 4; k++) etapes.push({ id: 'annonce-' + (k + 1), chapitre: 'Annonce ' + (k + 1), faire: async () => {
    const c = await cal(); if (indispo(c)) return manque('annonce-' + (k + 1), 'Annonce ' + (k + 1), 'Annonce ' + (k + 1), page, 'le calendrier est indisponible.');
    const maintenant = src.maintenant(), ev = evenementsMajeurs(lireEvenements(c), maintenant, { max: 12 })[k];
    if (!ev) return manque('annonce-' + (k + 1), 'Annonce ' + (k + 1), 'Annonce ' + nar.mot(k + 1), page, 'pas d’autre annonce à fort impact à venir.');
    const cl = classerEvenement(ev.titre, ev.pays), concernes = Object.entries(DEVISES_ACTIF).filter(([, dv]) => dv.includes(ev.pays)).map(([a]) => a).filter(a => a !== 'eurusd' || true);
    const mecan = ['or', 'us100'].map(a => ({ a, e: expliquerImpact({ titre: ev.titre, resume: '' }, a) })).filter(x => x.e.regles.length);
    /* réactions passées MESURÉES : annonces de même nom déjà publiées dans le calendrier (cette semaine) */
    const passes = lireEvenements(c).filter(e => e.titre === ev.titre && e.t < maintenant - 2.5 * 3600e3 && e.actuel), meas = [];
    for (const a of ['or', 'us100']) { try { const D = await pro(a); if (!indispo(D)) for (const p of passes.slice(-2)) { const r = reactionAnnonce(D.h1, p.t); if (r != null) meas.push({ a, r, t: p.t }); } } catch (e) { /* actif sans données */ } }
    const AN = nar.macroAnnonce({ ev, concernes, mecan, meas, maintenant }), S = [AN.intro, AN.concernes, AN.mecanisme, AN.mesure].map((t, i) => ({ texte: t, ligne: i }));
    return etape({ id: 'annonce-' + (k + 1), chapitre: 'Annonce ' + (k + 1), titre: ev.titre, page, segments: S, carte: { titre: ev.titre, grand: { label: heureParis(ev.t), val: cl.etiquette }, lignes: [{ label: 'Consensus', val: ev.prevu || '—', ton: '' }, { label: 'Précédent', val: ev.precedent || '—', ton: '' }, { label: 'Actifs concernés', val: concernes.map(a => NOMS_COURTS[a]).join(' · ') || '—', ton: '' }, { label: 'Réaction mesurée', val: meas.length ? meas.map(m => NOMS_COURTS[m.a] + ' ' + sg(m.r, 2) + ' %').join(' · ') : 'non mesurable', ton: '' }] }, detail: mecan.map(x => nom(x.a) + ' : ' + x.e.texte).join(' ') || 'Aucune règle de lecture ne relie directement cette annonce à l’or ou au Nasdaq.', donneesDu: new Date(maintenant).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' });
  } });
  return etapes;
}

/* ═════════════════════ fabrique de rapports ═════════════════════ */
export const TYPES = Object.freeze({ complet: 'Rapport complet', cot: 'Rapport COT', marche: 'Rapport marché global', macro: 'Rapport macro et calendrier' });
export function creerRapport(type, { actif = 'or' } = {}, src) {
  const id = actif, titre = type === 'complet' ? 'Rapport complet · ' + (NOMS_COURTS[id] || id) : type === 'cot' ? 'Rapport COT · ' + (NOMS_COURTS[id] || id) : type === 'marche' ? 'Rapport marché global' : 'Rapport macro et calendrier';
  const etapes = type === 'complet' ? rapportComplet(id, src) : type === 'cot' ? rapportCot(id, src) : type === 'marche' ? rapportMarche(src) : type === 'macro' ? rapportMacro(src) : null;
  if (!etapes) throw new Error('type de rapport inconnu : ' + type);
  return { type, actif: type === 'complet' || type === 'cot' ? id : null, titre, etapes, prechauffer: etapes.prechauffer || null, estimation: etapes.length * (COUT_MOYEN_ETAPE[type] || 500), nbEtapes: etapes.length };
}

/* ───── reconnaissance de la demande (texte parlé → rapport), sans IA ───── */
const normT = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9&/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ALIAS = [['or', /\b(or|gold|xau|xauusd)\b/], ['us100', /\b(nasdaq|us ?100|ndx|nas100)\b/], ['us500', /\b(s ?p ?500|us ?500|sp500|s&p)\b/], ['btc', /\b(bitcoin|btc)\b/], ['sol', /\b(solana|sol)\b/], ['dxy', /\b(dxy|dollar index|indice dollar|dollar)\b/], ['petrole', /\b(petrole|wti|brent|oil)\b/], ['eurusd', /\b(eur ?usd|eur\/usd|euro dollar|euro)\b/]];
export function demandeRapport(texte) {
  const n = ' ' + normT(texte).replace(/^(hey |dis moi |dis )?(rayle|rayle ) ?/, '') + ' ';
  if (!/\brapports?\b|\bannonces? (de |cette )?semaine|\bquelles annonces\b/.test(n)) return null;
  const actif = (ALIAS.find(([, re]) => re.test(n)) || [])[0] || null;
  if (/\bcot\b|commitments|positionnement/.test(n)) return { type: 'cot', actif: actif || 'or' };
  if (/annonces?|calendrier|macro/.test(n) && !/rapport complet/.test(n)) return { type: 'macro', actif: null };
  if (/\b(marche|marches)\b|global|tour d horizon/.test(n) && !actif) return { type: 'marche', actif: null };
  if (/rapport/.test(n)) return { type: 'complet', actif: actif || 'or', parDefaut: !actif };
  return null;
}
void SEUILS; void indexCot; void sec;
