/* ═════════════ CARNET DE PRÉVISIONS (GitHub Actions, dans la boucle des données) ═════════════
   À chaque tour : (1) enregistre le scénario principal que Rayle donnerait pour chaque actif (au plus un toutes les 12 h par actif, plus à chaque changement de sens ou de situation clé) ;
   (2) vérifie automatiquement les prévisions mûres à +1, +3 et +5 jours (juste / faux / neutre / invalidé) avec les bougies H1 ; (3) écrit previsions.json (branche « donnees », lu par l'appli sans Worker)
   et envoie le carnet au Worker (PUT /copilote/previsions). Rien de personnel : ce sont des scénarios sur des marchés publics.
   Usage : node outils-donnees/previsions.mjs --dossier <instantanés>   Variables : LECTURE_URL, LECTURE_CODE */
import fs from 'node:fs'; import path from 'node:path';
import { blocActif } from '../trader-pro/point/composer.js';
import { enregistrer, verifier, statistiques, MAX_PREVISIONS } from '../trader-pro/copilote/previsions.js';

const lireJson = (d, n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { return null; } };
const vb = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }));
export function lireFiches(dossier) { const F = {}; for (const id of ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy']) { const f = lireJson(dossier, `lecture-${id}.json`); if (f) F[id] = f; } return F; }
export function barresH1(dossier, ids) { const B = {}; for (const id of ids) { const p = lireJson(dossier, `pro-${id}.json`); if (p && Array.isArray(p.h1)) B[id] = vb(p.h1); } return B; }
/* un passage : enregistre puis vérifie ; renvoie { liste, ajoutees, verifiees } */
export function passage({ liste = [], fiches, barres, maintenant = Date.now() }) {
  const scen = [], atrJ = {}; for (const F of Object.values(fiches)) { if (!Number.isFinite(F.prix)) continue; const b = blocActif(F, { depuis: maintenant - 24 * 3600e3, maintenant, reseau: null, evenements: [], previsions: null }); if (b.scenData) scen.push({ actif: F.actif, ...b.scenData }); if (Number.isFinite(F.atrJ)) atrJ[F.actif] = F.atrJ; }
  const E = enregistrer(liste, scen, maintenant, { atrJ }), V = verifier(E.liste, barres, maintenant); return { liste: V.liste.slice(-MAX_PREVISIONS), ajoutees: E.ajoutees, verifiees: V.verifiees };
}
export async function lireDuWorker(url, code, fetchFn = fetch) { try { const r = await fetchFn(url.replace(/\/+$/, '') + '/copilote/previsions', { headers: { 'X-Lecture-Code': code }, signal: AbortSignal.timeout(20000) }); return r.ok ? (await r.json()).previsions || [] : null; } catch (e) { return null; } }
export async function envoyerAuWorker(liste, { url, code, fetchFn = fetch }) { const r = await fetchFn(url.replace(/\/+$/, '') + '/copilote/previsions', { method: 'PUT', headers: { 'X-Lecture-Code': code, 'Content-Type': 'application/json' }, body: JSON.stringify({ previsions: liste }), signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error('le Worker a répondu ' + r.status); return r.json(); }
export async function executer({ dossier, url, code, maintenant = Date.now(), fetchFn = fetch, journal = console.log } = {}) {
  const fiches = lireFiches(dossier); if (!Object.keys(fiches).length) { journal('prévisions : pas de fiche de lecture'); return { statut: 'sans données' }; }
  let base = url && code ? await lireDuWorker(url, code, fetchFn) : null; const depuisWorker = Array.isArray(base); if (!depuisWorker) { const f = lireJson(dossier, 'previsions.json'); base = f && Array.isArray(f.liste) ? f.liste : []; }
  const R = passage({ liste: base, fiches, barres: barresH1(dossier, Object.keys(fiches)), maintenant });
  fs.writeFileSync(path.join(dossier, 'previsions.json'), JSON.stringify({ t: maintenant, liste: R.liste, stats: statistiques(R.liste, maintenant).global }));
  let envoi = 'fichier seulement'; if (url && code && (R.ajoutees || R.verifiees || !depuisWorker)) { try { await envoyerAuWorker(R.liste, { url, code, fetchFn }); envoi = 'Worker'; } catch (e) { envoi = 'Worker en échec (' + e.message + ')'; } }
  journal(`prévisions : ${R.liste.length} au carnet (+${R.ajoutees} enregistrée${R.ajoutees > 1 ? 's' : ''}, ${R.verifiees} vérification${R.verifiees > 1 ? 's' : ''}) · ${envoi}`); return { statut: 'ok', ...R, envoi };
}
async function principal() {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; }, dossier = val('--dossier'); if (!dossier || !fs.existsSync(dossier)) { console.error('dossier des instantanés absent'); process.exit(2); }
  try { await executer({ dossier, url: val('--worker') || process.env.LECTURE_URL, code: process.env.LECTURE_CODE }); } catch (e) { console.error('prévisions : échec : ' + e.message); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) principal();
