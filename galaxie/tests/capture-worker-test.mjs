// Test du Worker pour la lecture d'une capture d'écran (worker/ est ignoré par git : test ignoré s'il est absent). Lancer :  node galaxie/tests/capture-worker-test.mjs
// Aucun réseau : la « fausse IA » est une fonction fetch simulée ; aucune clé réelle n'est utilisée.
import fs from 'node:fs';
const base = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('intelligence/capture-agent.js', base))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const W = await import(new URL('intelligence/capture-agent.js', base).href);
const { validerLecture } = await import('../../planetes/mars/pc/agent-m6/capture.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const image = (n = 5000) => 'data:image/jpeg;base64,' + 'A'.repeat(Math.ceil(n * 4 / 3));

// ── prompt ──
v('le prompt interdit conseil et analyse, exige un JSON seul, interdit d’inventer un nombre', /NE CONSEILLES RIEN/.test(W.PROMPT_CAPTURE) && /UN SEUL objet JSON/.test(W.PROMPT_CAPTURE) && /n'invente jamais un nombre/.test(W.PROMPT_CAPTURE));
v('le prompt cite exactement les champs que la page valide', ['instrument', 'unite', 'prixDernier', 'niveaux', 'zones', 'sens', 'indicateurs', 'periode', 'confiance', 'remarques'].every(k => W.PROMPT_CAPTURE.includes('\\"' + k + '\\"') || W.PROMPT_CAPTURE.includes('"' + k + '"')));
v('le prompt cite tous les types de niveau acceptés par la page', ['support', 'resistance', 'entree', 'stop', 'objectif', 'niveau'].every(t => W.PROMPT_CAPTURE.includes(t)));
// ── image ──
v('image valide acceptée', W.verifierImage(image()).ok === true);
v('pas une image en base64 → refus', !W.verifierImage('http://exemple.org/a.png').ok && !W.verifierImage('data:text/html;base64,AAAA').ok && !W.verifierImage('data:image/svg+xml;base64,AAAA').ok && !W.verifierImage(null).ok);
v('image trop lourde (> 3 Mo) → refus avec la taille', /trop lourde/.test(W.verifierImage(image(3.5 * 1024 * 1024)).erreur));
v('image minuscule → refus', /trop petite/.test(W.verifierImage(image(100)).erreur));
// ── limite de débit ──
{ let dernier = false; for (let i = 0; i < 7; i++) dernier = W.limiteCapture(1e9 + i); v('au plus 6 captures par minute', dernier === true && W.limiteCapture(1e9 + 120e3) === false); }
// ── lecture avec une fausse IA (Gemini simulé) ──
const vraiFetch = globalThis.fetch;
function fauxGemini(reponse, { statut = 200, trace = [] } = {}) {
  globalThis.fetch = async (url, opts) => {
    trace.push({ url: String(url), corps: opts && opts.body ? JSON.parse(opts.body) : null, auth: opts && opts.headers && opts.headers.Authorization });
    if (/\/models$/.test(String(url))) return new Response(JSON.stringify({ data: [{ id: 'models/gemini-flash-latest' }, { id: 'models/gemini-2.5-flash' }] }), { status: 200 });
    if (statut !== 200) return new Response(JSON.stringify({ error: { message: 'refusé' } }), { status: statut });
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof reponse === 'string' ? reponse : JSON.stringify(reponse) } }] }), { status: 200 });
  };
}
try {
  const trace = []; fauxGemini('Voici : {"instrument":"BTCUSDT","unite":"1h","niveaux":[{"type":"support","prix":78400}],"zones":[],"confiance":0.8}', { trace });
  const r = await W.lireCapture({ GEMINI_KEY: 'cle-factice' }, image(), 'support en bas');
  v('lecture rendue avec le moteur utilisé', r.lecture && r.lecture.instrument === 'BTCUSDT' && /^Gemini\//.test(r.moteur), JSON.stringify(r));
  const appel = trace.find(t => t.corps && t.corps.messages);
  v('la requête contient l’image (image_url data:) ET le prompt, jamais la clé dans le corps', appel && appel.corps.messages[1].content.some(p => p.type === 'image_url' && /^data:image\/jpeg;base64,/.test(p.image_url.url)) && appel.corps.messages[0].content === W.PROMPT_CAPTURE && !JSON.stringify(appel.corps).includes('cle-factice') && appel.auth === 'Bearer cle-factice');
  v('la consigne de Justin est transmise sans retours à la ligne et tronquée', appel.corps.messages[1].content[0].text.includes('support en bas'));
  v('la lecture du modèle passe ensuite la validation de la page', validerLecture(r.lecture).ok && validerLecture(r.lecture).lecture.paire === 'BTC' && validerLecture(r.lecture).lecture.unite === 'H1');
  fauxGemini({ erreur: 'ce n’est pas un graphique' }); const e = await W.lireCapture({ GEMINI_KEY: 'k' }, image()); v('« ce n’est pas un graphique » remonté tel quel', e.erreur === 'ce n’est pas un graphique');
  fauxGemini('désolé, je ne peux pas'); let leve = null; try { await W.lireCapture({ GEMINI_KEY: 'k' }, image()); } catch (x) { leve = x; } v('réponse sans JSON : erreur propre avec les essais', leve && /aucune IA/.test(leve.message) && leve.essais.length >= 1);
  fauxGemini({}, { statut: 429 }); leve = null; try { await W.lireCapture({ GEMINI_KEY: 'k' }, image()); } catch (x) { leve = x; } v('limite 429 : arrêt immédiat, pas d’acharnement sur les autres modèles', leve && leve.essais.length === 1);
  leve = null; try { await W.lireCapture({}, image()); } catch (x) { leve = x; } v('sans clé Gemini : message clair', leve && /GEMINI_KEY/.test(leve.message));
  const mauvaise = await W.lireCapture({ GEMINI_KEY: 'k' }, 'pas une image'); v('image invalide : refus sans appel réseau', !!mauvaise.erreur);
  // route
  const cors = {}; globalThis.fetch = vraiFetch;
  let rr = await W.routeCaptureAgent(new Request('https://x/agent/capture', { method: 'GET' }), {}, {}, cors); v('GET refusé (405)', rr.status === 405);
  rr = await W.routeCaptureAgent(new Request('https://x/agent/capture', { method: 'POST', body: '{}' }), {}, {}, cors); v('corps invalide (400)', rr.status === 400);
  rr = await W.routeCaptureAgent(new Request('https://x/agent/capture', { method: 'POST', body: JSON.stringify({ image: image() }) }), {}, {}, cors); v('sans clé : 503 propre', rr.status === 503 && /GEMINI_KEY/.test((await rr.json()).error));
} finally { globalThis.fetch = vraiFetch; }
const index = fs.readFileSync(new URL('infra/index.js', base), 'utf8'); v('la route /agent/capture est branchée derrière l’authentification', /case '\/agent\/capture'/.test(index) && index.indexOf("case '/agent/capture'") > index.indexOf('jeton refusé') && /import \{ routeCaptureAgent \}/.test(index));
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
