// Test de js/rayle/agent.js avec une page simulée (pas de navigateur) :   node tests/page-agent-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const journal = [];
const reponses = [];
const ctxVm = {
  epoch: 0, lastAct: Date.now(), processing: false, speaking: false,
  historiqueChat: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
  RayleBus: {
    etat: { vue: 'raylé' },
    demander(n, a) { journal.push('bus:' + n + (a ? ':' + (a.valeur || a.nom || a.type) : '')); if (n === 'vue') return this.etat.vue; if (n === 'vue:ouvrir') { this.etat.vue = 'terminal'; return Promise.resolve(); } if (n === 'vue:fermer') { this.etat.vue = 'raylé'; } return { ok: true }; }
  },
  Panneaux: { fermerTout() { journal.push('panneaux:fermerTout'); } },
  montrerDonnees: p => journal.push('donnees:' + p.id),
  commandeCarte: async t => { journal.push('carte:' + t); return /itin/.test(t) ? 'De A à B en voiture : 12 kilomètres.' : 'Voici A.'; },
  addLine: (k, t) => journal.push('ligne:' + k + ':' + t), errMsg: e => String(e.message || e),
  workerReady: () => true, valid: t => !!t && String(t).length > 1, workerError: async r => new Error('HTTP ' + r.status), contextText: () => 'ctx',
  wfetch: async (path, opts) => { journal.push('fetch:' + path + ':' + opts.body); const r = reponses.shift() || { ok: true, json: async () => ({ enregistre: true }) }; return r; },
  setInterval: () => 0, window: { addEventListener() {} }, console
};
vm.createContext(ctxVm);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/agent.js', import.meta.url), 'utf8') + '\nthis.executerActions=executerActions; this.noterEchange=noterEchange; this.resumerSession=resumerSession; this.askAgent=askAgent; this.compte=()=>echangesDepuisResume;', ctxVm);

let ok = 0; const t = async (n, f) => { try { journal.length = 0; await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('terminal : ouvre une seule fois puis exécute les commandes dans l’ordre, saute H4', async () => {
  await ctxVm.executerActions([
    { type: 'terminal', op: 'ouvrir' }, { type: 'terminal', op: 'commande', commande: { type: 'actif', valeur: 'BTC' } },
    { type: 'terminal', op: 'commande', commande: { type: 'unite', valeur: 'H4' } }, { type: 'terminal', op: 'commande', commande: { type: 'panneau', nom: 'rsi', action: 'ouvrir' } }], 0);
  assert.deepEqual(journal.filter(l => l.startsWith('bus:') && l !== 'bus:vue'), ['bus:vue:ouvrir', 'bus:terminal:commande:BTC', 'bus:terminal:commande:rsi']);
});
await t('fermer le terminal et les panneaux', async () => {
  await ctxVm.executerActions([{ type: 'terminal', op: 'fermer' }, { type: 'fermer_panneaux' }], 0);
  assert.ok(journal.includes('bus:vue:fermer') && journal.includes('panneaux:fermerTout'));
});
await t('carte et itinéraire : le résumé d’itinéraire est ajouté à ce qu’elle dit', async () => {
  const plus = await ctxVm.executerActions([{ type: 'carte', lieu: 'Toulouse' }, { type: 'itineraire', de: '', vers: 'Albi', profil: 'velo' }], 0);
  assert.ok(journal.includes('carte:montre-moi la carte de Toulouse'));
  assert.ok(journal.includes('carte:itinéraire vers Albi à vélo'));
  assert.match(plus, /12 kilomètres/);
});
await t('panneau de données : l’action « donnees » ouvre le panneau décrit par le Worker', async () => {
  await ctxVm.executerActions([{ type: 'donnees', panneau: { id: 'macro', titre: 'Macro' } }], 0);
  assert.ok(journal.includes('donnees:macro'));
});
await t('rendu du panneau : texte échappé, liens http(s) seulement, jauge et chiffres animés', async () => {
  const ouverts = [];
  const pd = { Panneaux: { esc: x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), ouvrir: o => ouverts.push(o) }, window: {}, document: {}, performance: { now: () => 0 }, requestAnimationFrame: f => f(1000), console };
  vm.createContext(pd);
  vm.runInContext(fs.readFileSync(new URL('../js/rayle/panneau-donnees.js', import.meta.url), 'utf8') + '\nthis.montrer=montrerDonnees;', pd);
  pd.montrer({ id: 'x', titre: 'Test', icone: 'B', jauges: [{ label: 'Peur', score: 130, etat: 'peur' }], chiffres: [{ label: 'CPI', valeur: 3.4, dec: 1, unite: ' %', delta: -0.1, deltaUnite: ' pt' }],
    lignes: [{ label: 'a', valeur: '<b>x</b>', sens: 'hausse' }], items: [{ titre: '<script>alert(1)</script>', lien: 'javascript:alert(1)' }, { titre: 'ok', lien: 'https://exemple.fr/a' }], note: 'n', pied: [{ texte: 'mauvais', url: 'javascript:1' }, { texte: 'bon', url: 'https://a.fr' }] });
  assert.equal(ouverts.length, 1); assert.equal(ouverts[0].id, 'donnees:x'); assert.equal(ouverts[0].pied.length, 1);
  const el = { html: '', querySelectorAll: () => [], set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; } };
  ouverts[0].corps(el);
  assert.ok(!/<script>/.test(el.html) && !/javascript:/.test(el.html) && !/<b>x<\/b>/.test(el.html));
  assert.ok(/href="https:\/\/exemple\.fr\/a"/.test(el.html) && /data-w="100"/.test(el.html) && /data-v="3.4"/.test(el.html) && /3,4/.test(el.html));
});
await t('une coupure (epoch change) arrête les actions restantes', async () => {
  ctxVm.epoch = 5;
  await ctxVm.executerActions([{ type: 'carte', lieu: 'X' }], 0);
  assert.equal(journal.filter(l => l.startsWith('carte:')).length, 0);
  ctxVm.epoch = 0;
});
await t('askAgent envoie agent:true et l’historique, refuse une réponse vide', async () => {
  reponses.push({ ok: true, json: async () => ({ reply: 'Salut Justin.', actions: [] }) });
  const d = await ctxVm.askAgent('salut');
  assert.equal(d.reply, 'Salut Justin.');
  assert.match(journal.find(l => l.startsWith('fetch:/chat')), /"agent":true/);
  reponses.push({ ok: true, json: async () => ({ reply: '' }) });
  await assert.rejects(() => ctxVm.askAgent('x'), /vide/);
});
await t('résumé : pas avant 2 échanges, puis envoyé au Worker et compteur remis à zéro', async () => {
  await ctxVm.resumerSession('merci');
  assert.equal(journal.filter(l => l.startsWith('fetch:/resume')).length, 0);
  ctxVm.noterEchange(); ctxVm.noterEchange();
  await ctxVm.resumerSession('merci');
  assert.equal(journal.filter(l => l.startsWith('fetch:/resume')).length, 1);
  assert.equal(ctxVm.compte(), 0);
  assert.ok(journal.some(l => /Mémoire : résumé/.test(l)));
});
await t('résumé automatique quand l’historique dépasse 8 messages (5e échange)', async () => {
  for (let i = 0; i < 4; i++) ctxVm.noterEchange();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(journal.filter(l => l.startsWith('fetch:/resume')).length, 0);   // 8 messages : pas encore
  ctxVm.noterEchange();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(journal.filter(l => l.startsWith('fetch:/resume')).length, 1);
});
await t('un échec du résumé garde le compteur pour réessayer', async () => {
  ctxVm.noterEchange(); ctxVm.noterEchange();
  reponses.push({ ok: false, status: 503, json: async () => ({}) });
  await ctxVm.resumerSession('inactif');
  assert.ok(ctxVm.compte() >= 2);
});
console.log(process.exitCode ? '\nÉCHEC' : '\n' + ok + ' tests réussis');
