/* ═════════════ ALERTES DU COPILOTE (sans PC allumé) : seulement les GROS moments, jamais le bruit ═════════════
   Lancé à chaque tour de la boucle des données (GitHub Actions), juste après le calcul des fiches de lecture. Détecte :
     · cassure CONFIRMÉE de la MA200 H4 / Daily avec fort volume (M5 / M15 / H1 seulement si volume extrême ET dans le sens du contexte) ;
     · bougie de volume extrême au sommet ou au creux d'un gros mouvement ;
     · balayage d'un niveau clé (veille, semaine, range asiatique) puis retour ;
     · début probable d'un mouvement de plusieurs jours ;
     · annonce importante dans 30 minutes ;
     · changement VRAI de la lecture pour une idée ouverte du carnet (gros volume contre toi, MA200 perdue, balayage contre toi, invalidation touchée).
   Chaque alerte = une phrase claire + le conseil, jamais un ordre. Elles passent par le Worker (POST /reseau/alertes) : Telegram (sans notification pendant « alertes silencieuses ») et voix de l'appli.
   Chaque type se coupe dans Réglages. Le Worker n'envoie jamais deux fois la même alerte (registre par identifiant).
   Usage : node outils-donnees/copilote.mjs --dossier <instantanés>   Variables : LECTURE_URL, LECTURE_CODE */
import fs from 'node:fs'; import path from 'node:path';
import { detecterMoments, phraseAlerteMoment } from '../trader-pro/copilote/moments.js';
import { changementsDeLecture } from '../trader-pro/copilote/carnet.js';
import { lireEvenements } from '../trader-pro/marches/calendrier.js';
import { noteAnnonce } from '../trader-pro/marches/annonce.js';
import { heureParis } from '../trader-pro/lecture/sessions.js';

export const TYPE_REGLAGE = Object.freeze({ cassure_ma200: 'cassure', climax: 'climax', balayage: 'balayage', debut_mouvement: 'mouvement' });
const lireJson = (d, n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { return null; } };
const heureP = t => heureParis(t).replace(/^0/, '').replace(':', ' h ').replace(/ h 00$/, ' h');
export function lireFiches(dossier) { const F = {}; for (const id of ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy']) { const f = lireJson(dossier, `lecture-${id}.json`); if (f) F[id] = f; } return F; }

/* alertes à envoyer maintenant : [{ carteId, texte, score, actifs, revirement }] */
export function calculerAlertes({ fiches, evenements = [], carnet = [], reglages = {}, maintenant = Date.now() }) {
  const flags = { cassure: true, climax: true, balayage: true, annonce: true, idee: true, mouvement: true, ...(reglages.copilote || {}) }, A = [];
  for (const F of Object.values(fiches)) for (const m of detecterMoments(F, { maintenant, maxAgeMs: 3 * 3600e3 })) if (flags[TYPE_REGLAGE[m.type]] && m.severite >= 2) A.push({ carteId: m.id, texte: phraseAlerteMoment(m), score: 90, actifs: [m.actif], revirement: false, type: m.type });
  if (flags.annonce) for (const e of evenements.filter(x => x.t > maintenant && x.t - maintenant <= 30 * 60e3 && x.impact === 'fort' && x.pays === 'USD')) { const n = noteAnnonce(e, { maintenant, fiches }); if (n.score >= 50) A.push({ carteId: `annonce|${e.t}|${e.titre.slice(0, 30)}`, texte: `${e.titre} dans moins de 30 minutes (${heureP(e.t)}), importance ${n.score} sur 100 : prudence, la volatilité attendue rend les premières minutes erratiques.`, score: 90, actifs: [], revirement: false, type: 'annonce' }); }
  if (flags.idee) for (const e of carnet.filter(x => x.etat === 'ouvert')) for (const c of changementsDeLecture(e, fiches[e.actif], maintenant)) A.push({ carteId: `idee|${e.id}|${c.cle}`, texte: `Ton idée sur ${e.actif} : ${c.texte}`, score: 90, actifs: [e.actif], revirement: c.gravite >= 3, type: 'idee' });
  return A;
}
export async function executer({ dossier, url, code, maintenant = Date.now(), fetchFn = fetch, journal = console.log } = {}) {
  if (!url || !code) { journal('copilote : LECTURE_URL ou LECTURE_CODE absent : rien à faire'); return { statut: 'non configuré' }; }
  const base = url.replace(/\/+$/, ''), h = { 'X-Lecture-Code': code }, get = async chemin => { try { const r = await fetchFn(base + chemin, { headers: h, signal: AbortSignal.timeout(20000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const [reglages, car] = await Promise.all([get('/reseau/reglages'), get('/copilote/carnet')]), fiches = lireFiches(dossier), cal = lireJson(dossier, 'calendrier2.json');
  if (!Object.keys(fiches).length) { journal('copilote : pas de fiche de lecture'); return { statut: 'sans données' }; }
  const A = calculerAlertes({ fiches, evenements: cal ? lireEvenements(cal) : [], carnet: car && Array.isArray(car.entrees) ? car.entrees : [], reglages: reglages || {}, maintenant });
  if (!A.length) { journal('copilote : rien de gros à signaler'); return { statut: 'rien', alertes: 0 }; }
  const r = await fetchFn(base + '/reseau/alertes', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ alertes: A.map(a => ({ carteId: a.carteId, texte: a.texte, revirement: a.revirement, score: a.score, actifs: a.actifs })) }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('le Worker a répondu ' + r.status); const j = await r.json(); journal(`copilote : ${A.length} alerte(s) candidate(s), ${j.envoyees} envoyée(s) (les déjà-annoncées sont ignorées)`); return { statut: 'envoyé', alertes: A.length, ...j };
}
async function principal() {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; }, dossier = val('--dossier'); if (!dossier || !fs.existsSync(dossier)) { console.error('dossier des instantanés absent'); process.exit(2); }
  try { await executer({ dossier, url: val('--worker') || process.env.LECTURE_URL, code: process.env.LECTURE_CODE }); } catch (e) { console.error('copilote : échec : ' + e.message + ' (les alertes seront recalculées au prochain tour)'); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) principal();
