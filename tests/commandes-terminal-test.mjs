// Commandes vocales du terminal (js/rayle/commandes-terminal.js) avec une page simulée, sans navigateur :   node tests/commandes-terminal-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmdNorm = n => String(n || '').replace(/[?!.,;:…«»"]/g, ' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const journal = [];
const ctxVm = {
  norm, cmdNorm, pick: a => a[0], console,
  RayleBus: { demander(n, a) { journal.push([n, a]); if (n === 'vue') return ctxVm.vue; return { ok: true }; }, on() {} },
  miniReactor: { addEventListener() {} }, reactor: { click() {} }, addLine() {}, speak() {}, cutAll() {}, updateBridgeStatus() {}
};
ctxVm.vue = 'terminal';
vm.createContext(ctxVm);
vm.runInContext(fs.readFileSync(new URL('../js/rayle/commandes-terminal.js', import.meta.url), 'utf8')
  + '\nthis.analyser=analyserCommandeTerminal; this.ferme=estFermetureTerminal; this.phrase=phraseTerminal; this.commande=commandeTerminal;', ctxVm);

let ok = 0; const t = async (n, f) => { try { journal.length = 0; await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };
const plan = (txt, ouvert = true) => { const r = ctxVm.analyser(txt, { ouvert }); return r === null ? null : JSON.parse(JSON.stringify(r)); };   // copie : les objets de la page simulée ont un autre prototype
const types = txt => (plan(txt) || { actions: [] }).actions.map(a => a.type);

await t('« graphique seul », « ajoute le RSI », « trace les supports », « passe en H4 », « retour au dashboard »', () => {
  assert.deepEqual(plan('graphique seul').actions, [{ type: 'mode', valeur: 'graphique', libelle: 'le graphique seul' }]);
  assert.deepEqual(plan('Raylé, ajoute le RSI').actions, [{ type: 'graphique', reglages: { rsi: true } }]);
  assert.deepEqual(plan('trace les supports').actions, [{ type: 'graphique', reglages: { supports: true } }]);
  assert.deepEqual(plan('passe en H4').actions, [{ type: 'unite', valeur: '240', libelle: 'H4' }]);
  assert.deepEqual(plan('retour au dashboard').actions.map(a => a.type + ':' + (a.valeur || a.nom)), ['mode:dashboard', 'panneau:dashboard']);
});
await t('autres unités : M5, M15, H1, journalier ; « 5 minutes » ne se confond pas avec « 15 minutes »', () => {
  const u = txt => plan(txt).actions.find(a => a.type === 'unite').valeur;
  assert.equal(u('mets M5'), '5'); assert.equal(u('passe en 5 minutes'), '5'); assert.equal(u('passe en 15 minutes'), '15');
  assert.equal(u('mets le graphique en H1'), '60'); assert.equal(u('passe en journalier'), 'D'); assert.equal(u('mets le daily'), 'D'); assert.equal(u('passe en D1'), 'D');
  assert.deepEqual(plan('affiche l’or en H4').actions.map(a => a.type + ':' + a.valeur), ['actif:XAU', 'unite:240']);
});
await t('plusieurs réglages dans une phrase, le verbe se transmet', () => {
  assert.deepEqual(plan('ajoute le RSI et trace les supports').actions, [{ type: 'graphique', reglages: { rsi: true, supports: true } }]);
  assert.deepEqual(plan('enlève le RSI et les supports').actions, [{ type: 'graphique', reglages: { rsi: false, supports: false } }]);
  assert.deepEqual(plan('ajoute la moyenne mobile 200').actions, [{ type: 'graphique', reglages: { ma200: true } }]);
  assert.deepEqual(plan('retire les supports').actions, [{ type: 'graphique', reglages: { supports: false } }]);
});
await t('modes : graphique avec le RSI, plein écran, dashboard complet', () => {
  assert.equal(plan('graphique avec le RSI').actions[0].valeur, 'graphique_rsi');
  assert.equal(plan('graphique et RSI').actions[0].valeur, 'graphique_rsi');
  assert.equal(plan('mets le graphique en plein écran').actions[0].valeur, 'graphique');
  assert.equal(plan('dashboard complet').actions[0].valeur, 'dashboard');
  assert.equal(plan('affiche le dashboard').actions[0].valeur, 'dashboard');
});
await t('source du graphique, annotations, numéros de bougies', () => {
  assert.deepEqual(plan('passe sur TradingView').actions[0].reglages, { source: 'tradingview' });
  assert.deepEqual(plan('affiche ton graphique').actions[0].reglages, { source: 'rayle' }); assert.deepEqual(plan('passe sur le graphique intégré').actions[0].reglages, { source: 'rayle' });
  assert.deepEqual(plan('efface les annotations').actions, [{ type: 'annotation', effacer: true }]);
  const b = plan('numérote les 8 dernières bougies').actions[0]; assert.equal(b.type, 'bougies'); assert.equal(b.n, 8);
});
await t('pages : marchés, rendements, COT (avec actif), analyse', () => {
  assert.deepEqual(plan('ouvre la page marchés').actions[0], { type: 'page', valeur: 'marches', section: '', libelle: 'la page Marchés' });
  assert.equal(plan('montre-moi les rendements obligataires').actions[0].section, 'rendements');
  assert.deepEqual([plan('ouvre le COT').actions[0].valeur, plan('ouvre le COT').actions[0].actif], ['cot', '']);
  assert.equal(plan('ouvre le COT du Nasdaq').actions[0].actif, 'NDX'); assert.equal(plan('ouvre les rapports COT de l’or').actions[0].actif, 'XAU');
  assert.equal(plan('ouvre la page analyse').actions[0].valeur, 'analyse'); assert.equal(plan('ouvre l’analyse fondamentale').actions[0].valeur, 'analyse');
  assert.equal(plan('va sur la page analyse de l’or').actions[0].actif, 'XAU');
});
await t('le terminal fermé s’ouvre d’abord ; les phrases « question » restent à l’IA', () => {
  assert.equal(plan('graphique seul', false).ouvrir, true); assert.equal(plan('graphique seul', true).ouvrir, false);
  for (const q of ['explique-moi le COT de l’or', 'quel est le RSI du Nasdaq', 'comment va le marché', 'analyse fondamentale du Nasdaq', 'que dit le COT', 'pourquoi les supports tiennent']) assert.equal(plan(q), null, q);
  assert.equal(plan('bonjour Raylé'), null); assert.equal(plan('rappelle-moi dans 20 minutes'), null);
});
await t('fermeture : « retour » et « ferme le terminal » ferment toujours ; « retour au dashboard » non', () => {
  assert.equal(ctxVm.ferme('retour'), true); assert.equal(ctxVm.ferme('ferme le terminal'), true); assert.equal(ctxVm.ferme('Raylé retour'), true);
  assert.equal(ctxVm.ferme('retour au dashboard'), false); assert.equal(ctxVm.ferme('retour au terminal'), false);
  assert.deepEqual(plan('retour au dashboard').fermer, undefined);
});
await t('commandes existantes intactes (actif, panneaux, M15)', () => {
  assert.deepEqual(plan('passe sur le Bitcoin').actions.map(a => a.valeur), ['BTC']);
  assert.deepEqual(plan('ferme le carnet').actions[0], { type: 'panneau', nom: 'carnet', action: 'fermer', libelle: "le carnet d'ordres" });
  assert.deepEqual(plan('mets M15').actions.map(a => a.valeur), ['15']);
  assert.deepEqual(plan('ferme le terminal'), { fermer: true });
  assert.deepEqual(plan('ouvre le terminal', false), { ouvrir: true, actions: [] });
});
await t('phrases dites par Raylé après les commandes', async () => {
  const dit = txt => ctxVm.phrase(plan(txt), plan(txt).actions.map(() => ({ ok: true })), true, true);
  assert.equal(dit('graphique seul'), 'Graphique seul.'); assert.equal(dit('ajoute le RSI'), "J'ajoute le RSI.");
  assert.equal(dit('trace les supports et enlève le RSI'), 'Je retire le RSI. Je trace les supports et les résistances.');
  assert.match(dit('retour au dashboard'), /Retour au dashboard/); assert.match(dit('passe en H4'), /Graphique en H4/);
});
await t('exécution : les commandes passent par le bus, plus de refus pour H4', async () => {
  ctxVm.vue = 'terminal';
  const r = await ctxVm.commande('passe en H4');
  assert.match(r, /H4/); assert.ok(journal.some(([n, a]) => n === 'terminal:commande' && a.valeur === '240'));
});
console.log(process.exitCode ? '\nÉCHEC' : '\n' + ok + ' tests réussis');
