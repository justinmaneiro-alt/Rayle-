// Test du Worker pour la traduction d'une « idée libre » en règle (worker/ est ignoré par git : test ignoré s'il est absent). Lancer :  node galaxie/tests/idee-agent-worker-test.mjs
import fs from 'node:fs';
const base = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('intelligence/idee-agent.js', base))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
const W = await import(new URL('intelligence/idee-agent.js', base).href);
const { CATALOGUE, STOPS, LIMITES, validerRegle } = await import('../../planetes/mars/pc/agent-btc/regles-lab.js');
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

// le prompt reste synchronisé avec le catalogue de la page
v('le prompt cite TOUS les types du catalogue de la page', Object.keys(CATALOGUE).every(k => W.PROMPT_IDEE.includes('- ' + k + ' {')), Object.keys(CATALOGUE).filter(k => !W.PROMPT_IDEE.includes('- ' + k + ' {')).join());
v('le prompt cite les deux types de stop et les bornes de R', Object.keys(STOPS).every(k => W.PROMPT_IDEE.includes('"type":"' + k + '"')) && W.PROMPT_IDEE.includes('[' + LIMITES.R[0] + '..' + LIMITES.R[1] + ']'));
v('le prompt interdit les conseils et exige un JSON seul', /UN SEUL objet JSON/.test(W.PROMPT_IDEE) && /aucun conseil financier/.test(W.PROMPT_IDEE));
// bornes numériques du prompt = bornes du catalogue
let bornesOk = true;
for (const [type, c] of Object.entries(CATALOGUE)) for (const [champ, dom] of Object.entries(c.champs)) {
  if (typeof dom[0] !== 'number' || champ === 'valeurs') continue;
  const ligne = W.PROMPT_IDEE.split('\n').find(l => l.startsWith('- ' + type + ' {')) || '';
  if (!ligne.includes(champ + ':[' + dom[0] + '..' + dom[1] + ']')) { bornesOk = false; console.log('   borne absente ou différente :', type, champ, dom.join('..'), '→', ligne.slice(0, 120)); }
}
v('les bornes numériques du prompt = celles du catalogue', bornesOk);
// extraction du JSON
const j = W.extraireJson('Voici : {"regle":{"nom":"a \\" } b","cote":"long"},"explication":"ok"} merci');
v('extraction du JSON même avec des accolades dans une chaîne', j && j.regle.nom === 'a " } b' && j.explication === 'ok');
v('extraction : pas de JSON → null', W.extraireJson('rien') === null && W.extraireJson('{ cassé') === null);
v('une règle venant du modèle passe par validerRegle côté page (champ inconnu supprimé, hors bornes refusé)', (() => { const brut = { nom: 'x', cote: 'long', conditions: [{ type: 'rsi', tf: 'h1', periode: 14, op: '<', seuil: 25, truc: 1 }], stop: { type: 'atr', tf: 'h1', k: 2 }, R: 3, evil: 1 }; const r = validerRegle(brut); return r.ok && !('evil' in r.regle) && !('truc' in r.regle.conditions[0]) && !validerRegle({ ...brut, R: 40 }).ok; })());
// route
const cors = {};
let r = await W.routeIdeeAgent(new Request('https://x/agent/idee', { method: 'GET' }), {}, {}, cors); v('GET refusé (405)', r.status === 405);
r = await W.routeIdeeAgent(new Request('https://x/agent/idee', { method: 'POST', body: '{}' }), {}, {}, cors); v('corps invalide refusé (400)', r.status === 400);
r = await W.routeIdeeAgent(new Request('https://x/agent/idee', { method: 'POST', body: JSON.stringify({ texte: 'court' }) }), {}, {}, cors); const c = await r.json(); v('texte trop court → message clair, aucun appel d’IA', r.status === 200 && /phrase un peu plus complète/.test(c.erreur));
r = await W.routeIdeeAgent(new Request('https://x/agent/idee', { method: 'POST', body: JSON.stringify({ texte: 'acheter quand le RSI est très bas en H1' }) }), {}, {}, cors); v('sans clé IA configurée : 503 propre (pas de plantage)', r.status === 503);
const index = fs.readFileSync(new URL('infra/index.js', base), 'utf8'); v('la route /agent/idee est branchée dans l’entrée du Worker (derrière l’authentification)', /case '\/agent\/idee'/.test(index) && index.indexOf("case '/agent/idee'") > index.indexOf('authentifier(request, env)'));
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
