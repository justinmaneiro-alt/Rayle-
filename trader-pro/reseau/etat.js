/* ═════════════ RÉSEAU D'INFORMATION : cartes dédoublonnées, fils d'histoire, score d'importance 0-100 transparent, alertes ═════════════
   Fonctions PURES (aucun réseau, aucune horloge cachée) : la même logique tourne dans le Worker (voie rapide) et dans GitHub Actions (voie complète + réaction du marché).
   Une même info reprise par 5 sources = UNE carte « 5 sources ». Les infos liées (même personne, même sujet, 72 h) forment un FIL avec sa chronologie ; un revirement est repéré.
   Le score est expliqué : qui parle, sujet, actifs touchés, nouveauté, nombre de sources, réaction réelle du marché. Jamais un signal : une hypothèse. */
import { SOURCES, PERSONNES, SUJETS, STANCE, TOUS, NOMS_COURTS } from './config.js';

export const FENETRE_MS = 72 * 3600e3, MAX_CARTES = 200, SEUIL_ALERTE = 80;
const SRC = Object.freeze(Object.fromEntries(SOURCES.map(s => [s.id, s])));
const VIDES = new Set('the and for with from that this has have are was were will its his her their after over into amid says said say new about not but you your une les des est que qui dans sur pour par avec aux ses son sont plus tout very more than also been being what when where which while'.split(' '));
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^financialjuice:\s*/, '').replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '').replace(/[^a-z0-9%$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const jetons = titre => new Set(norm(titre).split(' ').filter(w => w.length > 2 && !VIDES.has(w)));
export function similaires(a, b) {
  if (!a.size || !b.size) return false; let n = 0; for (const x of a) if (b.has(x)) n++;
  const union = a.size + b.size - n; return (n / union >= 0.55) || (n >= 4 && n / Math.min(a.size, b.size) >= 0.8);
}
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
const nomPersonne = (cfg, id) => { const p = cfg.find(x => x.id === id) || {}; return p.court || p.nom || id; };

/* ───── analyse d'un texte : personne, sujets, actifs, sens du propos ───── */
export function analyser(texte, source, personnes = PERSONNES) {
  const t = String(texte || '').toLowerCase(), S = source ? SRC[source] : null;
  let personne = null, p = null;
  for (const x of personnes) if (x.alias.some(a => t.includes(a))) { if (!p || x.poids > p.poids) { p = x; personne = x.id; } }
  if (S && S.personne && !personne) { personne = S.personne; p = personnes.find(x => x.id === personne) || null; }
  const sujets = SUJETS.filter(s => s.motif.test(texte)).sort((a, b) => b.poids - a.poids), actifs = new Set(S && S.actifs && S.genre === 'officiel' ? S.actifs : []);   // seules les sources OFFICIELLES (Fed, BCE, EDGAR…) ajoutent leurs actifs d'office ; une source crypto qui parle de Nvidia ne touche pas Solana
  for (const s of sujets) s.actifs.forEach(a => actifs.add(a));
  if (p && p.actifs !== 'tous') p.actifs.forEach(a => actifs.add(a));   // « tous » : seuls les actifs du SUJET sont touchés (une déclaration sur les puces touche le Nasdaq, pas l'or)
  const esc = STANCE.escalade.test(texte), apa = STANCE.apaisement.test(texte), stance = esc && !apa ? 1 : apa && !esc ? -1 : 0;
  return { personne, sujets: sujets.map(s => s.id), actifs: TOUS.filter(a => actifs.has(a)), stance };
}

/* ───── score d'importance 0-100 : règles d'abord, transparent ───── */
export function noterCarte(c, maintenant = Date.now(), personnes = PERSONNES) {
  const D = [], p = c.personne ? personnes.find(x => x.id === c.personne) : null;
  let who = 4, whoTxt = 'source généraliste';
  const poidsSrc = Math.max(0, ...c.sources.map(s => { const d = SRC[s.id]; return d ? (d.genre === 'officiel' ? d.poids || 3 : 0) : 0; }));
  if (p) { who = Math.round(p.poids / 5 * 25); whoTxt = `${p.nom} (poids ${p.poids}/5)`; }
  if (poidsSrc) { const w = Math.round(poidsSrc / 5 * 25); if (w > who) { who = w; whoTxt = `source officielle (poids ${poidsSrc}/5)`; } }
  if (who <= 8 && c.sources.some(s => SRC[s.id] && SRC[s.id].genre === 'marche' && /rapide/.test(SRC[s.id].voie))) { who = Math.max(who, 8); whoTxt = 'fil de marché rapide'; }
  D.push({ id: 'qui', libelle: 'Qui parle', points: who, max: 25, pourquoi: whoTxt });
  const s0 = c.sujets.length ? SUJETS.find(s => s.id === c.sujets[0]) : null; D.push({ id: 'sujet', libelle: 'Sujet', points: s0 ? s0.poids : 0, max: 20, pourquoi: s0 ? s0.nom : 'aucun sujet de marché reconnu' });
  const na = c.actifs.length; D.push({ id: 'actifs', libelle: 'Actifs touchés', points: Math.min(15, 4 * na), max: 15, pourquoi: na ? c.actifs.map(a => NOMS_COURTS[a]).join(', ') : 'aucun de mes actifs' });
  const age = maintenant - c.t, nouv = age <= 30 * 60e3 ? 10 : age <= 2 * 3600e3 ? 6 : age <= 6 * 3600e3 ? 3 : 0; D.push({ id: 'nouveaute', libelle: 'Nouveauté', points: nouv, max: 10, pourquoi: age <= 30 * 60e3 ? 'moins de 30 minutes' : age <= 2 * 3600e3 ? 'moins de 2 heures' : age <= 6 * 3600e3 ? 'moins de 6 heures' : 'plus de 6 heures' });
  const rapides = c.sources.filter(s => s.t - c.t <= 15 * 60e3), ns = new Set(rapides.map(s => s.id + '|' + (s.editeur || ''))).size; D.push({ id: 'sources', libelle: 'Reprise par d’autres sources en moins de 15 min', points: Math.min(10, 3 * (ns - 1)), max: 10, pourquoi: `${ns} source${ns > 1 ? 's' : ''}` });
  const r = c.reaction && c.reaction.max, pr = r ? Math.min(30, Math.round(20 * Math.max(0, r.atr - 0.3))) : 0;
  D.push({ id: 'reaction', libelle: 'Réaction réelle du marché', points: pr, max: 30, pourquoi: r ? c.reaction.texte : (c.reaction && c.reaction.attente ? 'mesure en cours (5, 15 et 60 minutes)' : 'pas encore mesurée') });
  return { score: Math.max(0, Math.min(100, D.reduce((x, d) => x + d.points, 0))), detail: D };
}

/* ───── intégration d'articles dans l'état ───── */
export const etatVide = () => ({ version: 1, t: 0, cartes: [], fils: [], sources: {}, alertes: [], alerteesCartes: {}, alerteesFils: {} });
const priorite = id => { const s = SRC[id]; return s ? (s.genre === 'officiel' ? 3 : s.genre === 'personne' ? 3 : s.genre === 'marche' ? 2 : 1) : 0; };

export function integrer(etat, articles, maintenant = Date.now(), { personnes = PERSONNES, reanalyser = false } = {}) {
  const E = { ...etat, cartes: etat.cartes.map(c => ({ ...c, sources: c.sources.slice() })) };
  const idx = E.cartes.map(c => ({ c, j: jetons(c.titre) }));
  let nouvelles = 0, ajoutsSources = 0;
  for (const a of articles) {
    if (!a || !a.titre || !Number.isFinite(a.t) || a.t < maintenant - FENETRE_MS || a.t > maintenant + 10 * 60e3) continue;
    const S = SRC[a.source], titre = (S && S.nettoyer ? a.titre.replace(S.nettoyer, '') : a.titre).trim(), j = jetons(titre); let m = idx.find(x => Math.abs(x.c.t - a.t) <= 6 * 3600e3 && similaires(x.j, j));
    const vu = a.vu || maintenant;
    const gid = a.guid ? String(a.guid).slice(0, 40) : null, ed = a.editeur || null;   // Google News relaie la même histoire par plusieurs éditeurs : chaque éditeur compte comme une source
    if (m) { const meme = m.c.sources.find(s => s.id === a.source && (s.editeur || null) === ed); if (meme) { if (meme.guid === gid || (!gid && meme.lien === a.lien)) continue; m = null; } }   // une source ne compte qu'une fois par carte : son 2e article, même proche, est une AUTRE carte (suite ou revirement d'un fil)
    if (m) {
      const c = m.c;
      c.sources.push({ id: a.source, nom: ed ? `${S ? S.nom.replace(/^Google News : /, '') : a.source} › ${ed}` : (S ? S.nom : a.source), editeur: ed, t: a.t, vu, lien: c.sources.length < 3 ? a.lien || null : null, guid: gid }); ajoutsSources++;
      if (priorite(a.source) > Math.max(...c.sources.slice(0, -1).map(s => priorite(s.id)))) { c.titre = titre; c.resume = a.resume || c.resume; m.j = jetons(titre); }
      if (a.t < c.t) c.t = a.t;
    } else {
      const c = { id: 'c' + hash(norm(titre) + '|' + Math.floor(a.t / 3600e3)), titre: titre.slice(0, 220), resume: (a.resume || '').slice(0, 160), t: a.t, vuLe: vu, sources: [{ id: a.source, nom: ed ? `${S ? S.nom.replace(/^Google News : /, '') : a.source} › ${ed}` : (S ? S.nom : a.source), editeur: ed, t: a.t, vu, lien: a.lien || null, guid: gid }], personne: null, sujets: [], actifs: [], stance: 0, fil: null, reaction: null, score: 0, analysee: false, editeur: a.editeur || null };
      E.cartes.push(c); idx.push({ c, j }); nouvelles++;
    }
  }
  return finaliser(E, maintenant, personnes, { nouvelles, ajoutsSources }, { reanalyser });
}
/* fusion de cartes venues d'un autre écrivain (GitHub Actions → Worker) : même carte = même id ou titres semblables ; on garde l'union des sources et la réaction mesurée */
export function fusionnerCartes(etat, cartes, maintenant = Date.now(), { personnes = PERSONNES } = {}) {
  const E = { ...etat, cartes: etat.cartes.map(c => ({ ...c, sources: c.sources.slice() })) }, idx = E.cartes.map(c => ({ c, j: jetons(c.titre) }));
  for (const n of cartes || []) {
    if (!n || !n.titre || !Number.isFinite(n.t) || !Array.isArray(n.sources) || n.t < maintenant - FENETRE_MS) continue; const j = jetons(n.titre);
    const m = idx.find(x => x.c.id === n.id) || idx.find(x => Math.abs(x.c.t - n.t) <= 6 * 3600e3 && similaires(x.j, j));
    if (!m) { const c = { ...n, sources: n.sources.slice() }; E.cartes.push(c); idx.push({ c, j }); continue; }
    for (const s of n.sources) if (!m.c.sources.some(x => x.id === s.id)) m.c.sources.push(s);
    if (n.reaction && (!m.c.reaction || (n.reaction.mesuree || 0) >= (m.c.reaction.mesuree || 0))) m.c.reaction = n.reaction;
    if (n.t < m.c.t) m.c.t = n.t;
  }
  return finaliser(E, maintenant, personnes, {});
}
/* `reanalyser` : refaire l'analyse (personne, sujets, actifs) de toutes les cartes (après un changement de la liste des personnalités). Sinon seules les cartes neuves sont analysées : le Worker gratuit n'a que 10 ms de CPU. */
export function finaliser(E, maintenant, personnes = PERSONNES, stats = {}, { reanalyser = false } = {}) {
  E.cartes = E.cartes.filter(c => c.t >= maintenant - FENETRE_MS && !(c.analysee && ((c.score < 20 && maintenant - c.t > 12 * 3600e3) || (!c.actifs.length && !c.personne && maintenant - c.t > 3600e3))));   // les infos sans intérêt n'encombrent pas l'état au-delà de 12 h
  for (const c of E.cartes) {
    if (reanalyser || !c.analysee) { const A = analyser(`${c.titre}. ${c.resume || ''}`, c.sources[0] && c.sources[0].id, personnes), premierePers = c.sources.map(s => SRC[s.id] && SRC[s.id].personne).find(Boolean); Object.assign(c, A); if (!c.personne && premierePers) c.personne = premierePers; c.analysee = true; }
    c.score = noterCarte(c, maintenant, personnes).score; delete c.detail; c.sources.sort((x, y) => x.t - y.t); if (c.sources.length > 12) c.sources.length = 12;   // le détail du score se recalcule à l'affichage (noterCarte) : on ne le stocke pas
  }
  E.cartes.sort((a, b) => b.t - a.t); if (E.cartes.length > MAX_CARTES) E.cartes = E.cartes.sort((a, b) => b.score - a.score || b.t - a.t).slice(0, MAX_CARTES).sort((a, b) => b.t - a.t);
  E.fils = construireFils(E.cartes); E.t = maintenant; E.stats = { ...(E.stats || {}), ...stats };
  for (const [k, t] of Object.entries(E.alerteesCartes || {})) if (t < maintenant - FENETRE_MS) delete E.alerteesCartes[k];
  for (const [k, t] of Object.entries(E.alerteesFils || {})) if (t < maintenant - FENETRE_MS) delete E.alerteesFils[k];
  return E;
}

/* ───── fils d'histoire : même personne + même sujet principal sur 72 h ───── */
export function construireFils(cartes) {
  const G = new Map(); for (const c of cartes) { c.fil = null; if (!c.personne || !c.sujets.length) continue; const k = `${c.personne}|${c.sujets[0]}`; if (!G.has(k)) G.set(k, []); G.get(k).push(c); }
  const fils = [];
  for (const [k, L] of G) {
    if (L.length < 2) continue; L.sort((a, b) => a.t - b.t); const [personne, sujet] = k.split('|'); let dernierSens = 0, revirement = false, tRev = null;
    const chrono = L.map((c, i) => { let type = i === 0 ? 'declaration' : 'suite'; if (c.stance !== 0) { if (dernierSens !== 0 && c.stance !== dernierSens) { type = 'revirement'; revirement = true; tRev = c.t; } dernierSens = c.stance; } return { id: c.id, t: c.t, titre: c.titre, type, stance: c.stance, score: c.score }; });
    const id = 'f' + hash(k); for (const c of L) c.fil = id;
    fils.push({ id, personne, sujet, debut: L[0].t, dernier: L[L.length - 1].t, nb: L.length, revirement, tRevirement: tRev, chronologie: chrono, scoreMax: Math.max(...L.map(c => c.score)) });
  }
  return fils.sort((a, b) => b.dernier - a.dernier);
}

/* ───── À LA UNE : les 5 infos les plus importantes des 24 dernières heures ───── */
export function aLaUne(etat, maintenant = Date.now(), n = 5) { return etat.cartes.filter(c => c.t >= maintenant - 24 * 3600e3).sort((a, b) => b.score - a.score || b.t - a.t).slice(0, n); }
/* une ligne par personne suivie : dernière déclaration, heure, impact mesuré */
export function lignesPersonnes(etat, personnes = PERSONNES) {
  return personnes.map(p => { const L = etat.cartes.filter(c => c.personne === p.id).sort((a, b) => b.t - a.t), d = L[0] || null; return { ...p, derniere: d ? { id: d.id, titre: d.titre, t: d.t, score: d.score, reaction: d.reaction && d.reaction.max ? d.reaction.texte : null, fil: d.fil } : null, nb72h: L.length }; });
}

/* ───── alertes : score ≥ seuil, 1 par fil toutes les 30 min sauf revirement ───── */
export const titreCourt = (t, n = 110) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1) > 40 ? s.lastIndexOf(' ', n - 1) : n - 1).replace(/[,;:\s]+$/, '') + '…'; };
export function phraseAlerte(c, { revirement = false, personnes = PERSONNES } = {}) {
  const qui = c.personne ? `${nomPersonne(personnes, c.personne)}${c.sources[0] && SRC[c.sources[0].id] && SRC[c.sources[0].id].genre === 'personne' ? ' sur ' + SRC[c.sources[0].id].nom.replace(/ \(.*\)/, '') : ''}` : (c.sources[0] ? c.sources[0].nom : 'Info');
  const touche = c.reaction && c.reaction.max ? c.reaction.texte.replace(/^le marché a réagi : /, '') : (c.actifs.length ? c.actifs.slice(0, 2).map(a => NOMS_COURTS[a]).join(' et ') + ' touché' + (c.actifs.length > 1 ? 's' : '') : '');
  return `${revirement ? 'REVIREMENT. ' : ''}${qui} : ${titreCourt(c.titre)}${/[.!?…]$/.test(titreCourt(c.titre)) ? '' : '.'} ${touche ? touche + '. ' : ''}Score ${c.score}.`;
}
export function alertesDe(etat, maintenant = Date.now(), { seuil = SEUIL_ALERTE, personnes = PERSONNES, maxAgeMs = 3 * 3600e3 } = {}) {
  const E = { ...etat, alerteesCartes: { ...(etat.alerteesCartes || {}) }, alerteesFils: { ...(etat.alerteesFils || {}) }, alertes: (etat.alertes || []).slice() }, nouvelles = [];
  for (const c of E.cartes.slice().sort((a, b) => a.t - b.t)) {
    if (c.score < seuil || maintenant - c.t > maxAgeMs || E.alerteesCartes[c.id]) continue;
    const fil = c.fil ? etat.fils.find(f => f.id === c.fil) : null, rev = !!(fil && fil.revirement && fil.tRevirement === c.t), cle = c.personne && c.sujets[0] ? `${c.personne}|${c.sujets[0]}` : null;   // la clé du fil existe dès la première carte (le fil lui-même n'apparaît qu'à la deuxième)
    if (cle && E.alerteesFils[cle] && maintenant - E.alerteesFils[cle] < 30 * 60e3 && !rev) { E.alerteesCartes[c.id] = maintenant; continue; }   // regroupée avec l'alerte récente du même fil
    E.alerteesCartes[c.id] = maintenant; if (cle) E.alerteesFils[cle] = maintenant;
    const a = { id: 'a' + c.id, carteId: c.id, t: maintenant, score: c.score, revirement: rev, texte: phraseAlerte(c, { revirement: rev, personnes }), actifs: c.actifs, fil: c.fil }; nouvelles.push(a);
  }
  E.alertes = [...nouvelles, ...E.alertes].slice(0, 30); return { etat: E, nouvelles };
}

/* ───── tableau d'état des sources : en ligne / hors ligne, dernière info, délai moyen entre la publication et notre lecture ───── */
export const MAX_DELAIS = 30;
/* resultats : [{ id, ok, erreur?, articles: [{ t, guid, lien }] }] ; renvoie la nouvelle table des sources (n'écrase pas les sources non interrogées ce passage) */
export function majSources(etat, resultats, maintenant = Date.now()) {
  const S = { ...(etat.sources || {}) };
  for (const r of resultats) {
    const d = SRC[r.id] || { nom: r.nom || r.id, voie: r.voie || 'lente' }, avant = S[r.id] || { delais: [] }, connus = new Set();
    for (const c of etat.cartes || []) for (const s of c.sources) if (s.id === r.id) connus.add(s.guid || s.lien);
    const nouveaux = (r.articles || []).filter(a => !connus.has(a.guid ? String(a.guid).slice(0, 40) : a.lien) && a.t <= maintenant + 60e3 && maintenant - a.t < 2 * 3600e3), delais = (avant.delais || []).slice();
    if (avant.t) for (const a of nouveaux) delais.push(Math.max(0, maintenant - a.t));   // la toute première lecture d'une source ne mesure aucun délai (elle voit d'un coup tout l'historique du flux) while (delais.length > MAX_DELAIS) delais.shift();
    const derniere = (r.articles || []).reduce((m, a) => Math.max(m, a.t), avant.derniere || 0) || null;
    S[r.id] = { id: r.id, nom: d.nom, voie: d.voie, ok: !!r.ok, t: maintenant, erreur: r.ok ? null : String(r.erreur || 'pas de réponse').slice(0, 120), derniere, n: (r.articles || []).length, delais, delaiMoyenMs: delais.length ? Math.round(delais.reduce((x, y) => x + y, 0) / delais.length) : (avant.delaiMoyenMs ?? null), okDepuis: r.ok ? (avant.ok ? avant.okDepuis || maintenant : maintenant) : null };
  }
  return S;
}
export const tableauSources = (etat, maintenant = Date.now()) => [...SOURCES, ...Object.values(etat.sources || {}).filter(s => !SRC[s.id]).map(s => ({ id: s.id, nom: s.nom, voie: s.voie }))].map(d => { const s = (etat.sources || {})[d.id]; return { id: d.id, nom: d.nom, voie: d.voie, etat: !s ? 'jamais interrogée' : s.ok ? 'en ligne' : 'hors ligne', erreur: s && !s.ok ? s.erreur : null, verifieeIlYa: s ? maintenant - s.t : null, derniere: s ? s.derniere : null, delaiMoyenMs: s ? s.delaiMoyenMs : null }; });
