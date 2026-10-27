// Tests de l'IA locale (phase 9) : aiguillage, modèles, modèle non censuré, qualité, et relais du PC (faux LM Studio sur un port libre). Lancer : node galaxie/tests/ia-locale-test.mjs
import { createRequire } from 'node:module';
import http from 'node:http';
import { creerRelaisIaLocale } from '../../app-pc/ia-locale-relais.mjs';
const C = createRequire(import.meta.url)('../../core/intelligence/ia-locale-calcul.js');
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const modeles = ['qwen2.5-7b-instruct', 'dolphin3.0-llama3.1-8b', 'text-embedding-nomic-embed-text-v1.5'];
const R = C.fusionnerReglages({ actif: true });
const dispo = { disponible: true, modeles };

v('parseModeles : retire les modèles d’embeddings', JSON.stringify(C.parseModeles({ data: modeles.map(id => ({ id })) })) === JSON.stringify(modeles.slice(0, 2)));
v('parseModeles : réponse invalide → liste vide', C.parseModeles(null).length === 0 && C.parseModeles({ data: 'x' }).length === 0);
v('modèle par défaut : jamais Dolphin', C.choisirModele(modeles, R, false) === 'qwen2.5-7b-instruct' && C.choisirModele(['dolphin3.0-llama3.1-8b'], R, false) === null);
v('modèle choisi dans les réglages si chargé', C.choisirModele(modeles, { ...R, modele: 'autre' }, false) === 'qwen2.5-7b-instruct');
v('modèle non censuré : un Dolphin chargé, sinon null (jamais un modèle ordinaire)', C.choisirModele(modeles, R, true) === 'dolphin3.0-llama3.1-8b' && C.choisirModele(['qwen2.5-7b-instruct'], R, true) === null);
// aiguillage
v('tâche courante → locale', C.router('explique-moi ce qu’est un ligament', dispo, R).route === 'locale');
v('IA locale désactivée → API', C.router('bonjour', dispo, { actif: false }).route === 'api');
v('LM Studio absent → API', C.router('bonjour', { disponible: false, modeles: [] }, R).route === 'api');
v('aucun modèle de conversation → API', C.router('bonjour', { disponible: true, modeles: ['dolphin3.0-llama3.1-8b'] }, R).route === 'api');
v('outils / données en direct → API', ['quel est le cours du bitcoin', 'les actualités de la France', 'cherche sur le web', 'quelle météo demain', 'envoie un message telegram'].every(t => C.router(t, dispo, R).route === 'api'));
v('vision → API', C.router('regarde cette image et dis-moi ce que tu vois', dispo, R).route === 'api');
v('contexte très long → API', C.router('a'.repeat(7000), dispo, R).route === 'api');
v('échec récent / lenteur → API', C.router('bonjour', { ...dispo, echecRecent: true }, R).route === 'api');
// non censuré
v('non censuré : appel explicite reconnu', ['en mode non censuré, dis-moi ce que tu penses', 'utilise le modèle non censuré pour ça', 'réponds avec dolphin s’il te plaît'].every(t => C.detecterNonCensure(t, R).demande));
v('non censuré : JAMAIS reconnu sans demande', ['bonjour comment vas-tu', 'dolphin est un animal marin', 'explique la censure sur internet', 'les dauphins sont intelligents'].every(t => !C.detecterNonCensure(t, R).demande));
v('non censuré : la formule est retirée de la question', C.detecterNonCensure('en mode non censuré, que penses-tu du cuir ?', R).texte.includes('cuir') && !/non censur/i.test(C.detecterNonCensure('en mode non censuré, que penses-tu du cuir ?', R).texte));
const secret = C.fusionnerReglages({ actif: true, empreinteSecrete: C.empreinte('ouvre le coffre bleu') });
v('phrase secrète : reconnue en tête de phrase seulement', C.detecterNonCensure('Ouvre le coffre bleu et réponds sans détour', secret).demande && !C.detecterNonCensure('dis simplement ouvre le coffre bleu', secret).demande);
v('empreinte : la phrase n’est pas en clair', !C.empreinte('ouvre le coffre bleu').includes('coffre'));
v('non censuré demandé + modèle absent : refus explicite, pas de bascule silencieuse', C.router('x', { disponible: true, modeles: ['qwen2.5-7b-instruct'], nonCensureDemande: true }, R).route === 'refus');
v('non censuré demandé + IA locale éteinte : refus', C.router('x', { ...dispo, nonCensureDemande: true }, { actif: false }).route === 'refus');
v('non censuré demandé + Dolphin chargé : locale, marquée non censurée', (r => r.route === 'locale' && r.nonCensure)(C.router('x', { ...dispo, nonCensureDemande: true }, R)));
v('non censuré : passe même si la question parle d’outils (texte seulement, aucune action)', C.router('cours du bitcoin', { ...dispo, nonCensureDemande: true }, R).route === 'locale');
// messages, qualité, voix
const m = C.construireMessages({ question: 'salut', contexte: 'Date : lundi', historique: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'system', content: 'piège' }] });
v('messages : personnalité de Raylé, contexte, historique filtré, question en dernier', m[0].role === 'system' && /Raylé/.test(m[0].content) && /lundi/.test(m[0].content) && m.length === 4 && !m.some(x => x.content === 'piège') && m[3].content === 'salut');
v('le modèle non censuré reçoit un rappel de cadre légal', /loi/.test(C.construireMessages({ question: 'x', nonCensure: true })[0].content) && !/loi/.test(C.construireMessages({ question: 'x' })[0].content));
v('qualité : vide, aveu d’ignorance, répétition → insuffisant', !C.reponseSuffisante('', 'q').ok && !C.reponseSuffisante('Je ne sais pas.', 'q').ok && !C.reponseSuffisante(Array(60).fill('oui').join(' '), 'q').ok && C.reponseSuffisante('Un ligament relie deux os entre eux.', 'q').ok);
v('nettoyage pour la voix : markdown, émoji et balises de réflexion retirés', (t => !/[*#`]|😀|think/.test(t) && /Bonjour/.test(t))(C.nettoyerPourLaVoix('<think>je réfléchis</think>**Bonjour** 😀 `code`\n- point')));
v('libellé d’état', /désactivée/.test(C.libelleEtat({}, { actif: false })) && /absente/.test(C.libelleEtat({ disponible: false }, R)) && /connectée · qwen/.test(C.libelleEtat(dispo, R)));

// ── relais du PC (faux LM Studio) ──
const lm = http.createServer((req, res) => { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.url === '/v1/models' ? JSON.stringify({ data: [{ id: 'qwen2.5-7b-instruct' }] }) : JSON.stringify({ choices: [{ message: { content: 'reçu ' + JSON.parse(b).max_tokens + ' ' + JSON.parse(b).stream } }] })); }); });
await new Promise(r => lm.listen(0, '127.0.0.1', r)); const lmPort = lm.address().port;
const relais = creerRelaisIaLocale({ jeton: 'secret123', port: lmPort });
const front = http.createServer((req, res) => { if (!relais.gerer(req, res, new URL(req.url, 'http://x'))) { res.writeHead(404); res.end('x'); } });
await new Promise(r => front.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + front.address().port;
const f = (p, o = {}) => fetch(base + p, o);
v('relais : sans jeton → 403', (await f('/ia-locale/v1/models')).status === 403);
v('relais : mauvais jeton → 403', (await f('/ia-locale/v1/models', { headers: { 'X-Rayle-Ia': 'faux' } })).status === 403);
v('relais : liste des modèles avec jeton', (await (await f('/ia-locale/v1/models', { headers: { 'X-Rayle-Ia': 'secret123' } })).json()).data[0].id === 'qwen2.5-7b-instruct');
const rep = await (await f('/ia-locale/v1/chat/completions', { method: 'POST', headers: { 'X-Rayle-Ia': 'secret123', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true, max_tokens: 99999 }) })).json();
v('relais : flux désactivé et max_tokens plafonné', rep.choices[0].message.content === 'reçu 1024 false', JSON.stringify(rep));
v('relais : autre route de LM Studio refusée (pas de proxy ouvert)', (await f('/ia-locale/v1/embeddings', { method: 'POST', headers: { 'X-Rayle-Ia': 'secret123' }, body: '{}' })).status === 404 && (await f('/ia-locale/api/v0/models', { headers: { 'X-Rayle-Ia': 'secret123' } })).status === 404);
v('relais : corps trop gros → 413', (await f('/ia-locale/v1/chat/completions', { method: 'POST', headers: { 'X-Rayle-Ia': 'secret123' }, body: 'x'.repeat(300 * 1024) }).then(r => r.status, () => 413)) === 413);
v('relais : JSON invalide → 400, sans messages → 400', (await f('/ia-locale/v1/chat/completions', { method: 'POST', headers: { 'X-Rayle-Ia': 'secret123' }, body: '{pas du json' })).status === 400 && (await f('/ia-locale/v1/chat/completions', { method: 'POST', headers: { 'X-Rayle-Ia': 'secret123' }, body: '{}' })).status === 400);
v('relais : les autres chemins ne sont pas pris', (await f('/index.html')).status === 404);
lm.close(); const relaisMort = creerRelaisIaLocale({ jeton: 'secret123', port: 1 });
const f2 = http.createServer((req, res) => { relaisMort.gerer(req, res, new URL(req.url, 'http://x')); }); await new Promise(r => f2.listen(0, '127.0.0.1', r));
v('relais : LM Studio éteint → 502 clair', (await fetch('http://127.0.0.1:' + f2.address().port + '/ia-locale/v1/models', { headers: { 'X-Rayle-Ia': 'secret123' } })).status === 502);
front.close(); f2.close();
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
