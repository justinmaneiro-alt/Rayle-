// Commandes entre appareils, côté page (js/rayle/appareils.js), avec une page et un Worker simulés :   node tests/appareils-commandes-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmdNorm = n => String(n || '').replace(/[?!.,;:…«»"]/g, ' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const journal = [], requetes = [], ls = {};
let reponses = {};                         // chemin (sans paramètres) → fonction(corps, chemin) → {status, d}
const elt = () => ({ classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector: () => elt(), style: {}, textContent: '', value: '' });
const panneaux = [];
const ctx = {
  console, norm, cmdNorm, performance, URL, Blob: class { constructor() {} }, setTimeout: (f, ms) => (ms <= 1500 ? setTimeout(f, 0) : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
  store: { get: k => (ls[k] || '').trim(), set: (k, v) => { if (v) ls[k] = v; else delete ls[k]; } },
  KEY_WDEV: 'dev', KEY_WDEVNOM: 'devnom', KEY_WTOK: 'tok',
  document: { addEventListener() {}, createElement: elt, body: elt(), hidden: false },
  navigator: {}, Audio: class { play() { return Promise.resolve(); } pause() {} },
  $: () => elt(), cfgMsg: elt(), fx: (a, b) => b, pick: a => a[0],
  addLine: (k, t) => journal.push('ligne:' + k + ':' + t), speak: t => { journal.push('dit:' + t); return Promise.resolve(); },
  errMsg: e => String(e && e.message || e), workerReady: () => true,
  speaking: false, processing: false, queue: [], micOn: true, reveilActif: () => true, enterVeille: () => journal.push('veille'), stopListening: () => journal.push('micro coupé'),
  cutAll: () => journal.push('cutAll'), garderEcranAllume() {},
  Panneaux: {
    liste: () => panneaux.map(p => ({ id: p.id, titre: p.titre, type: p.type })),
    contenu: id => { const p = panneaux.find(x => x.id === id); return p ? { titre: p.titre, icone: p.icone, type: p.type, html: p.html, liens: p.liens || [] } : null; },
    ouvrir: o => { journal.push('panneau:' + o.id + ':' + o.titre); ctx.dernierPanneau = o; return o.id; }, fermer: () => true, fermerTout: () => journal.push('panneaux fermés'),
    esc: t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  },
  RayleBus: { fournir() {}, on() {}, demander(n, a) { journal.push('bus:' + n + (a && a.type ? ':' + a.type + ':' + (a.valeur || a.nom || '') : typeof a === 'string' ? ':' + a : '')); if (n === 'vue') return ctx.vue; if (n === 'vue:ouvrir') { ctx.vue = 'terminal'; return Promise.resolve(); } if (n === 'ui:commande') return /fond|theme/.test(a) ? 'Fond globe activé.' : null; return { ok: true }; } },
  miniReactor: { addEventListener() {} }, reactor: { click() {} }, updateBridgeStatus() {},
  async wfetch(chemin, opts) {
    const corps = opts && opts.body ? JSON.parse(opts.body) : null;
    requetes.push(chemin + (corps ? ' ' + JSON.stringify(corps) : ''));
    const f = reponses[chemin.split('?')[0]];
    const r = f ? f(corps, chemin) : { status: 404, d: { error: 'route inconnue' } };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.d };
  },
  async wjson(chemin) { const r = await ctx.wfetch(chemin, { method: 'GET' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
  meteoSpeech: d => 'À ' + d.ville + ', il fait 18 degrés.', montrerMeteo: d => journal.push('panneau météo ' + d.ville),
  citiesOf: t => (String(t).match(/\b[A-ZÀ-Ý][a-zà-ÿ]+\b/g) || []).filter((w, i) => i > 0 || !/^(?:Lis|Dis|Affiche|Montre|Mets)$/.test(w)).slice(0, 1),
  commandeMonde: async t => 'Japon, à l’écran.', commandeCarte: async t => 'Voici Toulouse, Justin.'
};
ctx.window = ctx; ctx.vue = 'rayle';
vm.createContext(ctx);
vm.runInContext('const METEO_RE=' + lire('../js/rayle/savoirs.js').match(/const METEO_RE=(\/.+\/);/)[1] + ';', ctx);
vm.runInContext(lire('../js/rayle/pays-donnees.js'), ctx);
vm.runInContext(lire('../js/rayle/commandes-monde.js'), ctx);
vm.runInContext(lire('../js/rayle/commandes-terminal.js'), ctx);
vm.runInContext(lire('../js/rayle/carte.js').replace(/^/, ''), ctx);
{ const sansDom = { console, performance }; sansDom.window = sansDom; vm.createContext(sansDom);   // ui/settings.js sans document : seulement l'analyse des commandes
  for (const f of ['../ui/themes.js', '../ui/settings.js']) vm.runInContext(lire(f), sansDom);
  ctx.RayleUI = sansDom.RayleUI; }
let api = null; ctx.__RAYLE_TEST_APPAREILS__ = o => { api = o; };
vm.runInContext(lire('../js/rayle/appareils.js'), ctx);
const A = api.RayleAppareils;
const cl = x => (x == null ? null : JSON.parse(JSON.stringify(x)));
const X = (t, connus) => cl(A.extraireCible(t, connus || ['PC', 'Téléphone', 'Tablette']));
const C = t => cl(A.classer(t));

let ok = 0; const t = async (n, f) => { try { journal.length = 0; requetes.length = 0; await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('repérer l’appareil visé et garder la phrase intacte (accents, majuscules)', () => {
  assert.deepEqual(X('Raylé, affiche l’or en H4 sur la tablette'), { cible: 'tablette', phrase: 'affiche l’or en H4' });
  assert.deepEqual(X('mets le terminal sur le PC'), { cible: 'pc', phrase: 'mets le terminal' });
  assert.deepEqual(X('lis-moi la météo sur le téléphone'), { cible: 'telephone', phrase: 'lis-moi la météo' });
  assert.deepEqual(X('envoie ce panneau sur la tablette'), { cible: 'tablette', phrase: 'envoie ce panneau' });
  assert.deepEqual(X('fais sonner le téléphone'), { cible: 'telephone', phrase: 'fais sonner' });
  assert.deepEqual(X('ouvre ce lien sur le PC'), { cible: 'pc', phrase: 'ouvre ce lien' });
  assert.deepEqual(X('mets en veille la tablette'), { cible: 'tablette', phrase: 'mets en veille' });
  assert.deepEqual(X('mets la tablette en veille'), { cible: 'tablette', phrase: 'mets en veille' });
  assert.deepEqual(X('coupe la tablette'), { cible: 'tablette', phrase: 'coupe' });
  assert.deepEqual(X('montre-moi Toulouse sur mon portable'), { cible: 'portable', phrase: 'montre-moi Toulouse' });
  assert.deepEqual(X('affiche le Bitcoin sur l’ordinateur'), { cible: 'ordinateur', phrase: 'affiche le Bitcoin' });
  assert.deepEqual(X('affiche l’or sur le salon', ['Salon']), { cible: 'salon', phrase: 'affiche l’or' });
});
await t('pas d’appareil : rien n’est pris', () => {
  for (const q of ['affiche l’or en H4', 'quel est le meilleur téléphone ?', 'achète une tablette', 'mets le graphique sur le dashboard', 'le téléphone de Paul est cassé', 'ouvre le terminal'])
    assert.equal(X(q), null, q);
});
await t('liste blanche : chaque demande devient une action connue', () => {
  assert.deepEqual(C('affiche l’or en H4'), { type: 'terminal', phrase: 'affiche l’or en H4' });
  assert.deepEqual(C('mets le terminal'), { type: 'terminal', phrase: 'mets le terminal' });
  assert.deepEqual(C('lis-moi la météo'), { type: 'meteo', ville: '' });
  assert.deepEqual(C('la météo à Albi'), { type: 'meteo', ville: 'Albi' });
  assert.deepEqual(C('envoie ce panneau'), { type: 'panneau' });
  assert.deepEqual(C('envoie ça'), { type: 'panneau' });
  assert.deepEqual(C('envoie-le'), { type: 'panneau' });
  assert.deepEqual(C('fais sonner'), { type: 'sonner' });
  assert.deepEqual(C('ouvre ce lien'), { type: 'lien', url: '' });
  assert.deepEqual(C('ouvre https://exemple.fr/page?a=1'), { type: 'lien', url: 'https://exemple.fr/page?a=1' });
  assert.deepEqual(C('mets en veille'), { type: 'veille' });
  assert.deepEqual(C('coupe'), { type: 'couper' });
  assert.deepEqual(C('montre-moi le Japon'), { type: 'monde', phrase: 'montre-moi le Japon' });
  assert.deepEqual(C('montre-moi Toulouse'), { type: 'carte', phrase: 'montre-moi Toulouse' });
  assert.deepEqual(C('mets le fond globe'), { type: 'ui', phrase: 'mets le fond globe' });
  assert.deepEqual(C('dis que le repas est prêt'), { type: 'dire', texte: 'le repas est prêt' });
  for (const q of ['dis-moi le prix de l’or', 'mets une alerte', 'efface tous mes fichiers', 'exécute ce code', 'quel temps fera-t-il ? non, supprime le Drive'.slice(0, 0) || 'supprime le Drive'])
    assert.equal(C(q), null, q);
});
await t('nettoyage du HTML d’un panneau reçu : pas de script, pas d’attribut dangereux, liens http seulement', () => {
  const h = A.nettoyerHtml('<div class="pn-l" onclick="x()"><span>Prix</span><b style="color:red">12</b></div><script>alert(1)</script><img src=x onerror=alert(1)>'
    + '<a href="javascript:alert(1)">piège</a><a href="https://ex.fr/?a=1&amp;b=2" target="_self">bon</a><iframe src="https://evil"></iframe><p>a < b</p><svg><script>z()</script></svg><unknown>texte</unknown>');
  assert.ok(!/script|onerror|onclick|style=|iframe|javascript|svg|<img|unknown/i.test(h), h);
  assert.ok(h.includes('<div class="pn-l"><span>Prix</span><b>12</b></div>'), h);
  assert.ok(h.includes('<a href="https://ex.fr/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">bon</a>'), h);
  assert.ok(h.includes('<a>piège</a>') && h.includes('texte') && h.includes('a &lt; b'), h);
  assert.equal(A.nettoyerHtml('<b>gras<i>italique</b> fin'), '<b>gras<i>italique</i></b> fin');
});
await t('phrases de résultat : « c’est affiché sur la tablette », genres et échecs', () => {
  assert.equal(A.phraseResultat({ etat: 'faite' }, 'Tablette', { type: 'terminal' }), 'C’est affiché sur la tablette.');
  assert.equal(A.phraseResultat({ etat: 'faite' }, 'Téléphone', { type: 'sonner' }), 'Le téléphone sonne. Touche son écran pour l’arrêter.');
  assert.equal(A.phraseResultat({ etat: 'faite' }, 'Tablette', { type: 'couper' }), 'La tablette est coupée.');
  assert.equal(A.phraseResultat({ etat: 'faite' }, 'PC', { type: 'couper' }), 'Le PC est coupé.');
  assert.equal(A.phraseResultat({ etat: 'echec', message: 'son bloqué.' }, 'Téléphone', { type: 'sonner' }), 'Le téléphone n’a pas pu le faire : son bloqué.');
  assert.equal(A.phraseResultat({ etat: 'expiree' }, 'Tablette Xiaomi', { type: 'meteo' }), 'La tablette Xiaomi n’a pas répondu à temps.');
});

// ── Parcours complet avec un Worker simulé ──
ls.dev = 'rd_jeton'; ls.devnom = 'PC';
let etatCmd = 'faite', idCmd = 6;
reponses = {
  '/appareil/envoyer': c => (c.cible === 'telephone' ? { status: 200, d: { ok: false, code: 'absent', cible: 'Téléphone', telegram: true } } : { status: 200, d: { ok: true, id: ++idCmd, cible: 'Tablette' } }),
  '/appareil/commande': () => ({ status: 200, d: { id: idCmd, etat: etatCmd, message: '' } }),
  '/appareil/telegram': () => ({ status: 200, d: { ok: true } }),
  '/appareil/retour': () => ({ status: 200, d: { ok: true } }),
  '/meteo': () => ({ status: 200, d: { ville: 'Castres' } })
};
await t('« affiche l’or en H4 sur la tablette » : envoi, suivi, « c’est affiché sur la tablette »', async () => {
  const r = await api.commandeAppareils('Raylé, affiche l’or en H4 sur la tablette');
  assert.equal(r, 'C’est affiché sur la tablette.');
  assert.equal(requetes[0], '/appareil/envoyer {"cible":"tablette","action":{"type":"terminal","phrase":"affiche l’or en H4"}}');
  assert.ok(requetes.some(q => q.startsWith('/appareil/commande?id=7')));
});
await t('« sur le PC » dit sur le PC : exécuté ici, rien n’est envoyé', async () => {
  const r = cl(await api.commandeAppareils('mets le terminal sur l’ordinateur'));
  assert.deepEqual(r, { texte: 'mets le terminal' }); assert.equal(requetes.length, 0);
});
await t('appareil fermé : Raylé propose Telegram, « oui » l’envoie', async () => {
  let r = await api.commandeAppareils('fais sonner le téléphone');
  assert.match(r, /Le téléphone n’est pas ouvert\. Tu veux que je l’envoie sur Telegram à la place \?/);
  r = await api.commandeAppareils('oui vas-y');
  assert.equal(r, 'C’est parti sur Telegram.');
  assert.ok(requetes.some(q => q.startsWith('/appareil/telegram') && /Ton téléphone est ici/.test(q)), requetes.join('\n'));
  r = await api.commandeAppareils('fais sonner le téléphone'); r = await api.commandeAppareils('non merci');
  assert.equal(r, 'D’accord, je laisse tomber.');
});
await t('« envoie ce panneau sur la tablette » : le panneau part nettoyé ; sans panneau, Raylé le dit', async () => {
  let r = await api.commandeAppareils('envoie ce panneau sur la tablette');
  assert.equal(r, 'Il n’y a aucun panneau à envoyer pour le moment.');
  panneaux.push({ id: 'meteo:Albi', type: 'meteo', titre: 'Météo · Albi', icone: '⛅', html: '<div class="pn-gros">18<small> °C</small></div><script>x()</script>', liens: [{ texte: 'Source', url: 'https://open-meteo.com' }] });
  r = await api.commandeAppareils('envoie ce panneau sur la tablette');
  assert.equal(r, 'C’est affiché sur la tablette.');
  const envoi = JSON.parse(requetes[0].slice(requetes[0].indexOf(' ') + 1));
  assert.deepEqual(envoi.action.panneau, { titre: 'Météo · Albi', icone: '⛅', html: '<div class="pn-gros">18<small> °C</small></div>', liens: [{ texte: 'Source', url: 'https://open-meteo.com' }] });
});
await t('pas de réponse en 7 s : « j’attends », puis le retour arrive par la boucle /evenements', async () => {
  etatCmd = 'recue';
  const vrai = Date.now; let decal = 0; ctx.Date = class extends Date { static now() { return vrai() + decal; } };
  vm.runInContext('Date=this.Date', ctx);
  const p = api.commandeAppareils('affiche le Bitcoin sur la tablette');
  for (let i = 0; i < 20 && !requetes.some(q => q.startsWith('/appareil/commande')); i++) await new Promise(r => setTimeout(r, 5));
  decal = 8000;
  const r = await p;
  vm.runInContext('Date=this.Date.__proto__', ctx);
  assert.equal(r, 'C’est envoyé sur la tablette, j’attends qu’elle réponde.');
  api.appRecevoir({ retours: [{ id: idCmd, cible: 'Tablette', action: { type: 'terminal' }, etat: 'faite', message: '' }] });
  await new Promise(r => setTimeout(r, 5));
  assert.ok(journal.includes('dit:C’est affiché sur la tablette.'), journal.join('\n'));
  api.appRecevoir({ retours: [{ id: idCmd, cible: 'Tablette', action: { type: 'terminal' }, etat: 'faite' }] });
  assert.equal(journal.filter(l => l === 'dit:C’est affiché sur la tablette.').length, 1, 'pas annoncé deux fois');
  etatCmd = 'faite';
});
await t('résultat livré par la boucle pendant le suivi rapide : annoncé une seule fois', async () => {
  etatCmd = 'recue';
  const p = api.commandeAppareils('affiche le Nasdaq sur la tablette');
  for (let i = 0; i < 50 && !requetes.some(q => q.startsWith('/appareil/commande')); i++) await new Promise(r => setTimeout(r, 2));
  api.appRecevoir({ retours: [{ id: idCmd, cible: 'Tablette', action: { type: 'terminal' }, etat: 'faite', message: '' }] });
  etatCmd = 'faite';
  assert.equal(await p, 'C’est affiché sur la tablette.');
  await new Promise(r => setTimeout(r, 5));
  assert.equal(journal.filter(l => l.startsWith('dit:')).length, 0, journal.join('\n'));
});
await t('appareil qui reçoit : exécute seulement la liste blanche et rend compte', async () => {
  ctx.vue = 'rayle';
  await api.appExecuter({ id: 21, de: 'PC', action: { type: 'terminal', phrase: 'affiche l’or en H4' } });
  assert.ok(journal.includes('bus:terminal:commande:actif:XAU') && journal.includes('bus:terminal:commande:unite:240'), journal.join('\n'));
  assert.match(requetes.at(-1), /^\/appareil\/retour \{"id":21,"ok":true,"message":"J'ouvre le terminal\. Je passe sur l'or\. Graphique en H4\."\}$/);
  await api.appExecuter({ id: 22, de: 'PC', action: { type: 'eval', code: 'alert(1)' } });
  assert.match(requetes.at(-1), /"id":22,"ok":false,"message":"commande inconnue"/);
  await api.appExecuter({ id: 23, de: 'PC', action: { type: 'meteo', ville: 'Castres' } });
  assert.ok(journal.includes('panneau météo Castres') && journal.includes('dit:À Castres, il fait 18 degrés.'));
  await api.appExecuter({ id: 24, de: 'PC', action: { type: 'lien', url: 'javascript:alert(1)' } });
  assert.match(requetes.at(-1), /"id":24,"ok":false/);
  await api.appExecuter({ id: 25, de: 'Téléphone', action: { type: 'panneau', panneau: { titre: 'Actus', html: '<p>ok</p><script>x</script>', liens: [{ texte: 'a', url: 'javascript:x' }] } } });
  assert.equal(ctx.dernierPanneau.corps.html, '<p>ok</p>'); assert.equal(ctx.dernierPanneau.pied.length, 0);
  await api.appExecuter({ id: 26, de: 'PC', action: { type: 'veille' } });
  assert.ok(journal.includes('veille') && journal.includes('panneaux fermés'));
  await api.appExecuter({ id: 27, de: 'PC', action: { type: 'couper' } });
  assert.ok(journal.includes('micro coupé'));
  await api.appExecuter({ id: 28, de: 'PC', action: { type: 'ui', phrase: 'mets le fond globe' } });
  assert.match(requetes.at(-1), /"id":28,"ok":true,"message":"Fond globe activé\."/);
});
await t('la boucle livre une commande une seule fois', async () => {
  const avant = requetes.length;
  api.appRecevoir({ commandes: [{ id: 40, de: 'PC', action: { type: 'dire', texte: 'coucou' } }, { id: 40, de: 'PC', action: { type: 'dire', texte: 'coucou' } }] });
  api.appRecevoir({ commandes: [{ id: 40, de: 'PC', action: { type: 'dire', texte: 'coucou' } }] });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(requetes.slice(avant).filter(q => q.startsWith('/appareil/retour')).length, 1);
});
console.log(ok + ' groupes réussis');
