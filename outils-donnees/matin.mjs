/* ═════════════ LE POINT DU MATIN SUR TELEGRAM (sans PC allumé) : message VOCAL + version texte ═════════════
   Lancé par GitHub Actions (workflow « matin », et à chaque tour de la boucle des données). Tout est gratuit : calcul = fiches de lecture déjà publiées, voix = Azure Speech (offre gratuite F0, clé en secret GitHub)
   puis, en secours, une voix Piper installée par le workflow ; sans voix, le texte part quand même. L'envoi passe par le Worker (les secrets Telegram restent dans le Worker : POST /copilote/matin).
   Heure et jours réglables dans Marchés › Actualité › Sources et réglages (réglage « matin » du Worker). Une seule fois par jour (le Worker garde la date du dernier envoi).
   Usage : node outils-donnees/matin.mjs --dossier <instantanés> [--forcer] [--texte-seul-si-echec] [--sans-piper]   Variables : LECTURE_URL, LECTURE_CODE, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, PIPER_MODELE (facultatif) */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
import { composerPoint } from '../trader-pro/point/composer.js';
import { lireEvenements } from '../trader-pro/marches/calendrier.js';
import { TZ } from '../trader-pro/lecture/sessions.js';

export const VOIX_DEFAUT = 'fr-FR-VivienneMultilingualNeural', FORMAT_OGG = 'ogg-24khz-16bit-mono-opus';
const lireJson = (d, n) => { try { return JSON.parse(fs.readFileSync(path.join(d, n), 'utf8')); } catch (e) { return null; } };
const parisParties = t => { const p = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ.paris, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(t)), g = k => p.find(x => x.type === k).value; return { jour: `${g('year')}-${g('month')}-${g('day')}`, h: +g('hour'), m: +g('minute'), semaine: { 'lun.': 1, 'mar.': 2, 'mer.': 3, 'jeu.': 4, 'ven.': 5, 'sam.': 6, 'dim.': 7 }[g('weekday')] || 0 }; };
/* est-ce l'heure d'envoyer ? fenêtre de 40 minutes après l'heure réglée (GitHub peut retarder un déclenchement), un des jours choisis, pas déjà envoyé aujourd'hui */
export function heureEnvoi(reglagesMatin, dernierEnvoi, maintenant = Date.now(), { fenetreMin = 40 } = {}) {
  const m = reglagesMatin || {}, P = parisParties(maintenant); if (m.actif === false) return { du: false, raison: 'désactivé dans les réglages' };
  if (!(m.jours || [1, 2, 3, 4, 5]).includes(P.semaine)) return { du: false, raison: 'pas un jour choisi', jour: P.jour };
  const [hh, mm] = String(m.heure || '07:00').split(':').map(Number), ecoule = (P.h * 60 + P.m) - (hh * 60 + mm);
  if (ecoule < 0) return { du: false, raison: 'pas encore l’heure', jour: P.jour }; if (ecoule > fenetreMin) return { du: false, raison: 'fenêtre d’envoi dépassée', jour: P.jour };
  if (dernierEnvoi === P.jour) return { du: false, raison: 'déjà envoyé aujourd’hui', jour: P.jour }; return { du: true, jour: P.jour };
}
/* texte de la version écrite (Telegram) : sections du point */
/* version texte : tient dans un message Telegram (4 096 caractères) : on garde les sections dans l'ordre et on coupe par paragraphe entier, jamais au milieu d'une phrase */
export function texteTelegram(P, max = 3700) {
  const pied = '\n\n(Lecture seule : aucun ordre, aucune décision à ta place.)'; let sortie = '☀️ Point du matin';
  for (const s of P.sections.filter(x => x.paragraphes.length)) { let bloc = `\n\n${s.titre.toUpperCase()}`, n = 0; for (const p of s.paragraphes) { if ((sortie + bloc + '\n' + p + pied).length > max) break; bloc += '\n' + p; n++; } if (n) sortie += bloc; }
  return sortie + pied;
}
export function composerMatin(dossier, maintenant = Date.now()) {
  const fiches = {}; for (const id of ['or', 'us100', 'us500', 'btc', 'sol', 'petrole', 'dxy']) { const f = lireJson(dossier, `lecture-${id}.json`); if (f) fiches[id] = f; }
  const reseau = lireJson(dossier, 'reseau-etat.json'), cal = lireJson(dossier, 'calendrier2.json');
  return composerPoint({ type: 'matin', fiches, maintenant, reseau, evenements: cal ? lireEvenements(cal) : [] });
}
/* ───── voix : Azure d'abord, Piper en secours ───── */
export const ssml = (texte, voix = VOIX_DEFAUT) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR"><voice name="${voix}"><prosody rate="-3%" pitch="-2%">${String(texte).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</prosody></voice></speak>`;
export async function voixAzure(texte, { cle, region, fetchFn = fetch } = {}) {
  if (!cle || !region) throw new Error('Azure non configuré (AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)');
  const r = await fetchFn(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': cle, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': FORMAT_OGG, 'User-Agent': 'rayle-matin' }, body: ssml(texte), signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('Azure a répondu ' + r.status); const b = Buffer.from(await r.arrayBuffer()); if (b.length < 1000 || b.slice(0, 4).toString() !== 'OggS') throw new Error('Azure n’a pas renvoyé de fichier OGG'); return b;
}
export function voixPiper(texte, { modele = process.env.PIPER_MODELE, piper = process.env.PIPER_BIN || 'piper', lancer = spawnSync } = {}) {
  if (!modele) throw new Error('voix Piper non installée (PIPER_MODELE)'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-piper-')), wav = path.join(tmp, 'a.wav'), ogg = path.join(tmp, 'a.ogg');
  try {
    const p = lancer(piper, ['--model', modele, '--output_file', wav], { input: texte, encoding: 'utf8', timeout: 180000 }); if (p.status !== 0 || !fs.existsSync(wav)) throw new Error('Piper a échoué : ' + String(p.stderr || '').slice(0, 120));
    const f = lancer('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '32k', '-ar', '24000', '-ac', '1', ogg], { encoding: 'utf8', timeout: 120000 }); if (f.status !== 0 || !fs.existsSync(ogg)) throw new Error('ffmpeg a échoué : ' + String(f.stderr || '').slice(0, 120));
    return fs.readFileSync(ogg);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
export async function synthetiser(texte, { azure = {}, piper = true, fetchFn = fetch, piperFn = voixPiper } = {}) {
  const echecs = []; try { return { audio: await voixAzure(texte, { ...azure, fetchFn }), moteur: 'azure', echecs }; } catch (e) { echecs.push('Azure : ' + e.message); }
  if (piper) { try { return { audio: piperFn(texte), moteur: 'piper', echecs }; } catch (e) { echecs.push('Piper : ' + e.message); } }
  return { audio: null, moteur: null, echecs };
}
/* ───── envoi par le Worker ───── */
export async function lireEtatWorker(url, code, fetchFn = fetch) {
  const h = { 'X-Lecture-Code': code }, base = url.replace(/\/+$/, ''), [rg, ma] = await Promise.all([fetchFn(base + '/reseau/reglages', { headers: h, signal: AbortSignal.timeout(15000) }), fetchFn(base + '/copilote/matin', { headers: h, signal: AbortSignal.timeout(15000) })]);
  if (!rg.ok) throw new Error('réglages : le Worker a répondu ' + rg.status); const reglages = await rg.json(); return { matin: reglages.matin, silenceJusqua: reglages.silenceJusqua || 0, dernierEnvoi: ma.ok ? (await ma.json()).dernierEnvoi : null };
}
export async function envoyerMatin({ url, code, texte, jour, audio = null, forcer = false, fetchFn = fetch }) {
  const fd = new FormData(); fd.append('texte', texte); fd.append('jour', jour); if (forcer) fd.append('forcer', '1'); if (audio) fd.append('voix', new Blob([audio], { type: 'audio/ogg' }), 'point.ogg');
  const r = await fetchFn(url.replace(/\/+$/, '') + '/copilote/matin', { method: 'POST', headers: { 'X-Lecture-Code': code }, body: fd, signal: AbortSignal.timeout(60000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'le Worker a répondu ' + r.status); return j;
}
export async function executer({ dossier, url, code, forcer = false, texteSeulSiEchec = true, piper = true, maintenant = Date.now(), fetchFn = fetch, env = process.env, piperFn = voixPiper, journal = console.log } = {}) {
  if (!url || !code) { journal('matin : LECTURE_URL ou LECTURE_CODE absent : rien à faire'); return { statut: 'non configuré' }; }
  const E = await lireEtatWorker(url, code, fetchFn), due = heureEnvoi(E.matin, E.dernierEnvoi, maintenant); if (!due.du && !forcer) { journal('matin : ' + due.raison); return { statut: 'pas maintenant', raison: due.raison }; }
  const jour = due.jour || parisParties(maintenant).jour, P = composerMatin(dossier, maintenant); if (P.vide) { journal('matin : pas de fiche de lecture disponible'); return { statut: 'sans données' }; }
  let audio = null, moteur = null, echecs = []; if (E.matin && E.matin.vocal === false) echecs.push('voix désactivée dans les réglages'); else { const S = await synthetiser(P.texteParle, { azure: { cle: env.AZURE_SPEECH_KEY, region: env.AZURE_SPEECH_REGION }, piper, fetchFn, piperFn }); audio = S.audio; moteur = S.moteur; echecs = S.echecs; }
  if (!audio && !texteSeulSiEchec && !(E.matin && E.matin.vocal === false)) { journal('matin : pas de voix disponible (' + echecs.join(' ; ') + ') : le texte n’est pas envoyé ici, le workflow « matin » réessaiera avec Piper'); return { statut: 'voix absente', echecs }; }
  const r = await envoyerMatin({ url, code, texte: texteTelegram(P), jour, audio, forcer, fetchFn }); journal(`matin : envoyé (${r.deja ? 'déjà fait' : (r.vocal ? 'vocal' : 'texte seul') + (moteur ? ' · voix ' + moteur : '')})${echecs.length ? ' · ' + echecs.join(' ; ') : ''}`);
  return { statut: 'envoyé', ...r, moteur, echecs, mots: P.mots };
}
async function principal() {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; }, dossier = val('--dossier'); if (!dossier || !fs.existsSync(dossier)) { console.error('dossier des instantanés absent'); process.exit(2); }
  if (a.includes('--seulement-verifier')) {   // pour le workflow : ne lance l'installation de la voix de secours que s'il faut vraiment envoyer
    try { const url = val('--worker') || process.env.LECTURE_URL, code = process.env.LECTURE_CODE, E = await lireEtatWorker(url, code), d = heureEnvoi(E.matin, E.dernierEnvoi, Date.now()); console.log('matin : ' + (d.du ? 'à envoyer' : d.raison)); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `du=${d.du || a.includes('--forcer')}\n`); } catch (e) { console.error('matin : ' + e.message); if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'du=false\n'); } return;
  }
  try { await executer({ dossier, url: val('--worker') || process.env.LECTURE_URL, code: process.env.LECTURE_CODE, forcer: a.includes('--forcer'), texteSeulSiEchec: !a.includes('--pas-de-texte-seul'), piper: !a.includes('--sans-piper') }); } catch (e) { console.error('matin : échec : ' + e.message); process.exit(a.includes('--forcer') ? 1 : 0); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) principal();
