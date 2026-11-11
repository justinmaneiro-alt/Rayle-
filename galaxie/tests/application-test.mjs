// Application Raylé : choix de la fenêtre à partir d'une phrase (voix / texte). Le script de la page est chargé avec un faux DOM absorbant.
// node galaxie/tests/application-test.mjs
import fs from 'node:fs';
const absorbant = () => { const f = function () {}; return new Proxy(f, { get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : proxy), apply: () => proxy, construct: () => proxy, set: () => true, has: () => true }); };
const proxy = absorbant();
const appels = []; const fen = { document: proxy, RayleBus: proxy, addEventListener() {}, innerWidth: 1000, Application: null, setTimeout, console };
const sandbox = { requestAnimationFrame: () => 0, window: fen, document: fen.document, navigator: {}, performance: { now: () => 0 }, setTimeout, clearTimeout, CustomEvent: function () {}, console, location: { search: '' } };
new Function(...Object.keys(sandbox), fs.readFileSync('core/commun/application.js', 'utf8'))(...Object.values(sandbox));
const A = fen.Application;
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
v('Application exposée', !!A && typeof A.commande === 'function');
v('cinq fenêtres dans l’ordre', JSON.stringify(A.fenetres.map(f => f.id)) === JSON.stringify(['rayle', 'terminal', 'anatomie', 'terre', 'dev3d']));
const trouve = t => { const f = A._trouver(t); return f && f.id; };
v('« le terminal » → terminal', trouve('le terminal') === 'terminal');
v('« anatomie » → anatomie', trouve('l’anatomie') === 'anatomie');
v('« actualité » → terre', trouve('l’actualité') === 'terre');
v('« la Terre » → terre', trouve('la Terre') === 'terre');
v('« développement 3D » → dev3d', trouve('le développement 3D') === 'dev3d');
v('« BIM » → dev3d', trouve('bim') === 'dev3d');
v('« accueil » → rayle', trouve('retour à l’accueil') === 'rayle');
v('mot inconnu → rien', trouve('pizza napolitaine') === null || trouve('pizza napolitaine') === undefined);
const r = t => A.commande(t);
v('« va à droite » reconnu', r('va à droite') !== null);
v('« fenêtre précédente » reconnu', r('fenêtre précédente') !== null);
v('« ouvre le terminal » reconnu', /terminal/.test(String(r('Rayle, ouvre le terminal'))), String(r('Rayle, ouvre le terminal')));
v('« ouvre l’anatomie » reconnu', /anatomie/.test(String(r('ouvre l’anatomie'))));
v('« montre l’actualité » reconnu', /Terre/.test(String(r('montre l’actualité'))), String(r('montre l’actualité')));
v('phrase sans rapport → null (la phrase continue vers l’IA)', r('quel temps fait-il demain') === null && r('raconte-moi une blague') === null);
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
