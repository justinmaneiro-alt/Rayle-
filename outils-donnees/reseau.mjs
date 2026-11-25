/* ═════════════ RÉSEAU D'INFORMATION : voie complète (GitHub Actions, dans la boucle du workflow « donnees ») ═════════════
   · interroge TOUTES les sources : les rapides à chaque passage (5 min), les lentes toutes les 10 minutes (Fed, BCE, Maison Blanche, SEC EDGAR, Google News par personnalité…) ;
   · dédoublonne, forme les fils d'histoire, note chaque info (règles) ;
   · mesure la RÉACTION RÉELLE du marché 5, 15 et 60 minutes après (bougies M5 des instantanés) → le score monte si le marché a bougé, et la mémoire des précédents se construit ;
   · écrit reseau-etat.json (+ reseau-actus.json pour le moteur de lecture) dans le dossier des instantanés (branche « donnees », lue par l'appli sans Worker) ;
   · envoie l'état au Worker (PUT /reseau/etat, secret LECTURE_CODE) : le Worker le fusionne avec ce que sa voie rapide a lu entre-temps et envoie les alertes Telegram.
   Usage : node outils-donnees/reseau.mjs --dossier <instantanés> [--worker https://…] [--lentes] [--sans-reseau]   (LECTURE_URL et LECTURE_CODE peuvent venir de l'environnement). Aucune clé dans ce fichier. */
import fs from 'node:fs'; import path from 'node:path';
import { SOURCES, PERSONNES, sourcesPersonnes, UA } from '../trader-pro/reseau/config.js';
import { parserFlux, parserEdgar } from '../trader-pro/reseau/parse.js';
import { integrer, etatVide, majSources, alertesDe, finaliser, fusionnerCartes } from '../trader-pro/reseau/etat.js';
import { mesurerReaction, memoriser } from '../trader-pro/reseau/reaction.js';
import { tendanceUnite } from '../trader-pro/lecture/calculs.js';
import { lireEvenements } from '../trader-pro/marches/calendrier.js';
import { MOTIFS } from './verifier-publication.mjs';
import { majAnnonces, lireMemoireAnnonces, ecrireMemoireAnnonces, series15 } from './annonces.mjs';

export const SYM5 = { or: 'GC_F', us100: '_NDX', us500: '_GSPC', btc: 'BTC_USD', sol: 'SOL_USD', petrole: 'CL_F', dxy: 'DX_Y_NYB' };
const lireJson = (d, n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { return null; } };
const versBougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
const attendre = (ms, p) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);

export async function lireUneSource(s, fetchFn = fetch, { max = 30, ms = 15000 } = {}) {
  try {
    const r = await fetchFn(s.url, { headers: { 'User-Agent': s.ua || UA, Accept: s.type === 'edgar' ? 'application/json' : 'application/rss+xml, application/atom+xml, text/xml, */*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
    if (!r.ok) return { id: s.id, nom: s.nom, voie: s.voie, ok: false, erreur: 'HTTP ' + r.status, articles: [] };
    const A = (s.type === 'edgar' ? parserEdgar(await r.json(), { nom: s.entreprise }) : parserFlux(await r.text(), { max })).map(a => ({ ...a, source: s.id }));
    return A.length ? { id: s.id, nom: s.nom, voie: s.voie, ok: true, articles: A } : { id: s.id, nom: s.nom, voie: s.voie, ok: false, erreur: 'flux vide ou illisible', articles: [] };
  } catch (e) { return { id: s.id, nom: s.nom, voie: s.voie, ok: false, erreur: String(e && e.message || e).slice(0, 100), articles: [] }; }
}
/* séries M5 + ATR H1 en % pour chaque actif (instantanés du dossier) */
export function seriesReaction(dossier, maintenant = Date.now()) {
  const out = {};
  for (const [id, sym] of Object.entries(SYM5)) {
    const m5 = lireJson(dossier, `bougies-${sym}-5m.json`), pro = lireJson(dossier, `pro-${id}.json`); if (!m5 || !Array.isArray(m5.b) || !pro) continue;
    const T = tendanceUnite(versBougies(pro.h1), 'H1', maintenant); out[id] = { M5: versBougies(m5.b), atrPct: T.dispo ? T.atrPct : null };
  }
  return out;
}
/* état du Worker = état complet de GitHub Actions (passage précédent) + état rapide du Worker (3 sources, toutes les 2 minutes) fusionnés ; `reanalyser` : la liste des personnalités a changé */
export async function lireEtatWorker(url, code, fetchFn = fetch, maintenant = Date.now()) {
  try {
    const r = await fetchFn(url.replace(/\/+$/, '') + '/reseau/etat', { headers: { 'X-Lecture-Code': code }, signal: AbortSignal.timeout(20000) }); if (!r.ok) return null; const j = await r.json();
    if (!j.etat && !j.rapide) return null; let E = { ...etatVide(), ...(j.etat || {}) };
    if (j.rapide) { E = fusionnerCartes(E, j.rapide.cartes || [], maintenant); const S = { ...(E.sources || {}) }; for (const [id, s] of Object.entries(j.rapide.sources || {})) if (!S[id] || s.t >= S[id].t) S[id] = s; E.sources = S; E.alerteesCartes = { ...(j.rapide.alerteesCartes || {}), ...(E.alerteesCartes || {}) }; E.alerteesFils = { ...(j.rapide.alerteesFils || {}), ...(E.alerteesFils || {}) }; }
    if (j.reanalyser) E.reanalyser = true; return E;
  } catch (e) { return null; }
}
export async function lireReglagesWorker(url, code, fetchFn = fetch) {
  try { const r = await fetchFn(url.replace(/\/+$/, '') + '/reseau/reglages', { headers: { 'X-Lecture-Code': code }, signal: AbortSignal.timeout(10000) }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
export async function lirePersonnesWorker(url, code, fetchFn = fetch) {
  try { const r = await fetchFn(url.replace(/\/+$/, '') + '/reseau/personnes', { headers: { 'X-Lecture-Code': code }, signal: AbortSignal.timeout(10000) }); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j.personnes) && j.personnes.length ? j.personnes : null; } catch (e) { return null; }
}
export async function envoyerEtat(etat, memoire, { url, code, fetchFn = fetch, reanalyse = false }) {
  const r = await fetchFn(url.replace(/\/+$/, '') + '/reseau/etat' + (reanalyse ? '?reanalyse=1' : ''), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Lecture-Code': code }, body: JSON.stringify({ ...etat, memoire }), signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json();
}
export async function envoyerAlertes(alertes, { url, code, fetchFn = fetch }) {
  if (!alertes.length) return { envoyees: 0 };
  const r = await fetchFn(url.replace(/\/+$/, '') + '/reseau/alertes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lecture-Code': code }, body: JSON.stringify({ alertes: alertes.map(a => ({ carteId: a.carteId, texte: a.texte, revirement: a.revirement, score: a.score, actifs: a.actifs })) }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json();
}

/* un passage complet ; `base` = état de départ (Worker ou fichier précédent) */
export async function passage(dossier, { maintenant = Date.now(), fetchFn = fetch, base = null, personnes = PERSONNES, lentes = false, reseau = true } = {}) {
  const meta = lireJson(dossier, 'reseau-meta.json') || {}, lentesAFaire = lentes || !meta.tLentes || maintenant - meta.tLentes >= 10 * 60e3;
  const defs = [...SOURCES.filter(s => s.voie === 'rapide' || lentesAFaire), ...(lentesAFaire ? sourcesPersonnes(personnes) : [])];
  let E = base ? { ...etatVide(), ...base } : etatVide(); const memoire = (base && base.memoire) || [];
  const R = reseau ? (await Promise.all(defs.map(s => attendre(25000, lireUneSource(s, fetchFn)).then(r => r || { id: s.id, nom: s.nom, voie: s.voie, ok: false, erreur: 'délai dépassé', articles: [] })))) : [];
  E.sources = majSources(E, R, maintenant); E = integrer(E, R.flatMap(r => r.articles), maintenant, { personnes, reanalyser: !!E.reanalyser }); delete E.reanalyser;
  /* réaction réelle du marché : pour les cartes de moins de 70 minutes ou pas encore mesurées */
  const series = seriesReaction(dossier, maintenant); let mem = memoire;
  for (const c of E.cartes) {
    if (!c.actifs.length || maintenant - c.t < 5 * 60e3 + 60e3) continue;
    if (c.reaction && !c.reaction.attente && maintenant - c.t > 70 * 60e3) { mem = memoriser(mem, c); continue; }
    c.reaction = mesurerReaction(c, series, maintenant); mem = memoriser(mem, c);
  }
  E = finaliser(E, maintenant, personnes, E.stats || {});
  return { etat: E, memoire: mem, resultats: R, lentesFaites: lentesAFaire, reanalyse: !!(base && base.reanalyser) };
}
/* « À la une » en tête du carrousel d'actualité de l'accueil (onglet marchés) : les 5 infos les plus importantes des 24 dernières heures (score ≥ 50) */
export function injecterALaUne(dossier, etat, maintenant = Date.now()) {
  const f = path.join(dossier, 'actus-accueil-marches.json'), d = lireJson(dossier, 'actus-accueil-marches.json'); if (!d || !Array.isArray(d.items)) return 0;
  const une = etat.cartes.filter(c => c.t >= maintenant - 24 * 3600e3 && c.score >= 50).sort((a, b) => b.score - a.score || b.t - a.t).slice(0, 5).map(c => ({ titre: '★ ' + c.titre, lien: (c.sources.find(s => s.lien) || {}).lien || null, date: c.t, resume: `Score ${c.score}/100 · ${c.sources.length} source${c.sources.length > 1 ? 's' : ''}${c.reaction && c.reaction.max ? ' · ' + c.reaction.texte : ''}`, image: null, source: 'À la une' })).filter(x => x.lien);
  const deja = new Set(une.map(x => x.titre.slice(2).toLowerCase())); d.items = [...une, ...d.items.filter(x => !deja.has(String(x.titre).toLowerCase()))]; fs.writeFileSync(f, JSON.stringify(d)); return une.length;
}
/* le garde-fou de publication refuse TOUT le dossier si un seul texte ressemble à une clé ou une adresse personnelle : les titres venus d'Internet sont donc nettoyés avant d'être écrits */
export function masquer(texte) { let t = String(texte); for (const [, re] of MOTIFS) t = t.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[masqué]'); return t; }
export const actusPourLecture = E => ({ t: E.t, items: E.cartes.filter(c => c.score >= 25).map(c => ({ titre: c.titre, source: c.sources[0] ? c.sources[0].nom : null, t: c.t, lien: (c.sources.find(s => s.lien) || {}).lien || null, score: c.score, actifs: c.actifs, nbSources: c.sources.length })) });

async function principal() {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; }, dossier = val('--dossier') || val('--sortie');
  if (!dossier || !fs.existsSync(dossier)) { console.error('dossier des instantanés absent'); process.exit(2); }
  const url = val('--worker') || process.env.LECTURE_URL, code = process.env.LECTURE_CODE, maintenant = Date.now(), reseau = !a.includes('--sans-reseau'), avecWorker = !!(url && code && reseau);
  let base = avecWorker ? await lireEtatWorker(url, code) : null; const depuisWorker = !!base; if (!base) base = lireJson(dossier, 'reseau-etat.json');
  const personnes = (avecWorker && await lirePersonnesWorker(url, code)) || PERSONNES;
  const R = await passage(dossier, { maintenant, base, personnes, lentes: a.includes('--lentes'), reseau });
  const reg = avecWorker ? await lireReglagesWorker(url, code) : null, A = alertesDe(R.etat, maintenant, { personnes, seuil: reg ? reg.seuilAlerte : undefined }); const E = A.etat;   // alertes calculées ici (score relevé par la réaction du marché) ; le Worker les envoie par Telegram
  fs.writeFileSync(path.join(dossier, 'reseau-etat.json'), masquer(JSON.stringify({ ...E, memoire: R.memoire }))); fs.writeFileSync(path.join(dossier, 'reseau-actus.json'), masquer(JSON.stringify(actusPourLecture(E))));
  const cal = lireJson(dossier, 'calendrier2.json'), AN = majAnnonces(lireMemoireAnnonces(dossier), cal ? lireEvenements(cal) : [], series15(dossier), maintenant); ecrireMemoireAnnonces(dossier, AN.memoire); const nUne = injecterALaUne(dossier, E, maintenant);
  console.log(`annonces : ${AN.memoire.entrees.length} en mémoire (+${AN.ajoutees}, ${AN.mesurees} mesures) · À la une injectée dans le carrousel : ${nUne}`);
  if (R.lentesFaites) fs.writeFileSync(path.join(dossier, 'reseau-meta.json'), JSON.stringify({ tLentes: maintenant }));
  const ok = R.resultats.filter(r => r.ok).length; console.log(`réseau : ${E.cartes.length} cartes, ${E.fils.length} fils, sources en ligne ${ok}/${R.resultats.length}${R.resultats.filter(r => !r.ok).length ? ' (hors ligne : ' + R.resultats.filter(r => !r.ok).map(r => r.id).join(', ') + ')' : ''} · base : ${depuisWorker ? 'Worker' : 'fichier'}`);
  if (avecWorker) { try { console.log('Worker : ' + JSON.stringify(await envoyerEtat(E, R.memoire, { url, code, reanalyse: !!R.reanalyse })) + ' · alertes : ' + JSON.stringify(await envoyerAlertes(A.nouvelles, { url, code }))); } catch (e) { console.error('envoi au Worker échoué : ' + e.message + ' (les fichiers publiés restent valables)'); } }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) principal();
