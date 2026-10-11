// Commandes entre appareils, côté Worker (worker/worker.js, phase 3A), avec une base D1 simulée en SQLite :   node tests/appareils-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }
const { default: worker } = await import(fichier.href);

// ── D1 simulée : prepare(sql).bind(…).first() / all() / run(), batch([…]) ──
function d1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, vals = []) => ({
    bind: (...v) => stmt(sql, v),
    async first(col) { const r = db.prepare(sql).get(...vals); return r ? (col ? r[col] : { ...r }) : null; },
    async all() { return { results: db.prepare(sql).all(...vals).map(r => ({ ...r })) }; },
    async run() { const r = /^\s*(select|with)/i.test(sql) ? (db.prepare(sql).all(...vals), { changes: 0 }) : db.prepare(sql).run(...vals); return { meta: { last_row_id: Number(r.lastInsertRowid || 0), changes: Number(r.changes || 0) } }; }
  });
  return { prepare: sql => stmt(sql), async batch(l) { const out = []; for (const s of l) out.push(await s.run()); return out; }, async exec(sql) { db.exec(sql); }, brut: db };
}
const DB = d1();
const env = { RAYLE_TOKEN: 'code-de-test-123456', DB };
const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); } };
let ip = 1;
async function appel(chemin, jeton, corps, methode) {
  const req = new Request('https://w.test' + chemin, {
    method: methode || (corps ? 'POST' : 'GET'),
    headers: { 'X-Rayle-Token': jeton, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.' + (ip++ % 200) },
    body: corps ? JSON.stringify(corps) : undefined
  });
  const r = await worker.fetch(req, env, ctx);
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

let PC, TAB, TEL, idCmd;
await t('appairage de trois appareils (PC, Tablette, Téléphone)', async () => {
  for (const nom of ['PC', 'Tablette', 'Téléphone']) {
    const r = await appel('/appareil/appairer', env.RAYLE_TOKEN, { nom });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    if (nom === 'PC') PC = r.d.jeton; else if (nom === 'Tablette') TAB = r.d.jeton; else TEL = r.d.jeton;
  }
});
await t('le code d’accès seul (niveau 0) ne peut pas envoyer de commande', async () => {
  const r = await appel('/appareil/envoyer', env.RAYLE_TOKEN, { cible: 'tablette', action: { type: 'sonner' } });
  assert.equal(r.status, 403); assert.equal(r.d.code, 'appareil_requis');
});
await t('tablette jamais ouverte : « absent » (Raylé proposera Telegram)', async () => {
  const r = await appel('/appareil/envoyer', PC, { cible: 'la tablette', action: { type: 'terminal', phrase: 'affiche l’or en H4' } });
  assert.equal(r.status, 200); assert.equal(r.d.ok, false); assert.equal(r.d.code, 'absent'); assert.equal(r.d.cible, 'Tablette'); assert.equal(r.d.telegram, false);
});
await t('la tablette interroge sa file (/evenements?c=1) : présence notée, file vide', async () => {
  const r = await appel('/evenements?c=1&a=1', TAB);
  assert.equal(r.status, 200); assert.deepEqual(r.d.commandes, []); assert.deepEqual(r.d.retours, []);
  assert.equal(r.d.rappels, undefined);   // version légère : pas d'alertes ni de rappels
  const l = await appel('/appareil/liste', PC);
  const tab = l.d.appareils.find(a => a.nom === 'Tablette');
  assert.equal(tab.ouvert, true); assert.equal(tab.actif, true);
  assert.equal(l.d.appareils.find(a => a.nom === 'Téléphone').ouvert, false);
  assert.equal(l.d.appareils.find(a => a.nom === 'PC').moi, true);
});
await t('liste blanche : type inconnu ou lien non http refusés', async () => {
  for (const action of [{ type: 'eval', code: 'alert(1)' }, { type: 'lien', url: 'javascript:alert(1)' }, { type: 'terminal' }, { type: '__proto__' }, null]) {
    const r = await appel('/appareil/envoyer', PC, { cible: 'tablette', action });
    assert.equal(r.status, 400, JSON.stringify(action)); assert.equal(r.d.code, 'interdite');
  }
});
await t('appareil inconnu, ou soi-même', async () => {
  let r = await appel('/appareil/envoyer', PC, { cible: 'frigo', action: { type: 'sonner' } });
  assert.equal(r.status, 404); assert.deepEqual(r.d.appareils.sort(), ['PC', 'Tablette', 'Téléphone']);
  r = await appel('/appareil/envoyer', PC, { cible: 'ordinateur', action: { type: 'sonner' } });
  assert.equal(r.status, 400); assert.equal(r.d.code, 'soi');
});
await t('envoi → réception (accusé) → retour « fait » → suivi par le PC', async () => {
  let r = await appel('/appareil/envoyer', PC, { cible: 'Xiaomi', action: { type: 'terminal', phrase: 'affiche l’or en H4', inutile: 'x' } });
  assert.equal(r.status, 200, JSON.stringify(r.d)); assert.equal(r.d.cible, 'Tablette'); idCmd = r.d.id; assert.ok(idCmd > 0);
  r = await appel('/appareil/commande?id=' + idCmd, PC);
  assert.equal(r.d.etat, 'attente');
  r = await appel('/evenements?c=1', TAB);
  assert.equal(r.d.commandes.length, 1);
  assert.deepEqual(r.d.commandes[0].action, { type: 'terminal', phrase: 'affiche l’or en H4' });   // champ « inutile » retiré
  assert.equal(r.d.commandes[0].de, 'PC');
  r = await appel('/evenements?c=1', TAB);
  assert.equal(r.d.commandes.length, 0, 'déjà accusée : pas redonnée');
  r = await appel('/appareil/commande?id=' + idCmd, PC);
  assert.equal(r.d.etat, 'recue');
  r = await appel('/appareil/commande?id=' + idCmd, TEL);
  assert.equal(r.status, 404, 'un autre appareil ne voit pas la commande du PC');
  r = await appel('/appareil/retour', TEL, { id: idCmd, ok: true });
  assert.equal(r.status, 404, 'seule la cible rend compte');
  r = await appel('/appareil/retour', TAB, { id: idCmd, ok: true, message: 'Je passe sur l’or. Graphique en H4.' });
  assert.equal(r.status, 200);
  r = await appel('/appareil/commande?id=' + idCmd, PC);
  assert.equal(r.d.etat, 'faite'); assert.match(r.d.message, /H4/);
  r = await appel('/evenements?c=1', PC);
  assert.deepEqual(r.d.retours, [], 'déjà annoncé par le suivi rapide : pas de doublon');
});
await t('retour manqué par le suivi rapide : livré une fois par la boucle /evenements', async () => {
  let r = await appel('/appareil/envoyer', PC, { cible: 'tablette', action: { type: 'sonner' } });
  const id = r.d.id;
  await appel('/evenements?c=1', TAB);
  await appel('/appareil/retour', TAB, { id, ok: false, message: 'son bloqué' });
  r = await appel('/evenements?c=1', PC);
  assert.equal(r.d.retours.length, 1); assert.equal(r.d.retours[0].etat, 'echec'); assert.equal(r.d.retours[0].action.type, 'sonner');
  r = await appel('/evenements?c=1', PC);
  assert.equal(r.d.retours.length, 0);
});
await t('expiration à 2 minutes : la commande n’est plus donnée, le PC apprend « expirée »', async () => {
  let r = await appel('/appareil/envoyer', PC, { cible: 'tablette', action: { type: 'meteo', ville: 'Albi' } });
  const id = r.d.id; assert.equal(r.d.expire_dans, 120);
  const vrai = Date.now;
  try {
    Date.now = () => vrai() + 121000;
    r = await appel('/evenements?c=1', TAB);
    assert.equal(r.d.commandes.length, 0);
    r = await appel('/appareil/commande?id=' + id, PC);
    assert.equal(r.d.etat, 'expiree');
    // et la tablette ne vient plus depuis 2 minutes non plus pour le PC ? elle vient d'interroger : ouverte
  } finally { Date.now = vrai; }
});
await t('/evenements complet : alertes et rappels + file de commandes', async () => {
  const r = await appel('/evenements', TAB);
  assert.equal(r.status, 200); assert.ok(Array.isArray(r.d.alertes) && Array.isArray(r.d.rappels) && Array.isArray(r.d.commandes), JSON.stringify(r.d).slice(0, 200));
  const c = await appel('/evenements', env.RAYLE_TOKEN);   // code d'accès : comme avant, sans file
  assert.ok(Array.isArray(c.d.alertes)); assert.equal(c.d.commandes, undefined);
});
await t('Telegram non lié : refus propre', async () => {
  const r = await appel('/appareil/telegram', PC, { texte: 'La météo', cible: 'Téléphone' });
  assert.equal(r.status, 400); assert.equal(r.d.code, 'telegram_absent');
});
await t('renommer : nom libre, pas de doublon', async () => {
  let r = await appel('/appareil/renommer', TAB, { nom: 'PC' });
  assert.equal(r.status, 409);
  r = await appel('/appareil/renommer', TAB, { nom: 'Tablette Xiaomi' });
  assert.equal(r.status, 200); assert.equal(r.d.nom, 'Tablette Xiaomi');
  await appel('/evenements?c=1', TAB);
  r = await appel('/appareil/envoyer', PC, { cible: 'tablette', action: { type: 'dire', texte: 'Bonjour' } });
  assert.equal(r.status, 200); assert.equal(r.d.cible, 'Tablette Xiaomi');
});
await t('journal de sécurité : chaque commande, refus et retour y sont', async () => {
  const r = await appel('/securite/journal?n=50', PC);
  const actions = r.d.journal.map(x => x.action);
  assert.ok(actions.includes('appareil.commande') && actions.includes('appareil.retour') && actions.includes('appareil.renommer'), actions.join(','));
  assert.ok(r.d.journal.some(x => x.action === 'appareil.commande' && !x.ok && /ferm/.test(x.detail)), 'envoi vers un appareil fermé noté');
  assert.ok(r.d.journal.some(x => x.action === 'appareil.commande' && /liste blanche/.test(x.detail)), 'commande interdite notée');
});
await t('limite : 15 commandes par minute et par appareil', async () => {
  let dernier;
  for (let i = 0; i < 16; i++) dernier = await appel('/appareil/envoyer', TEL, { cible: 'tablette', action: { type: 'sonner' } });
  assert.equal(dernier.status, 429);
});
await t('outil de l’agent « commande_appareil » : pose une action pour la page', async () => {
  const r = await appel('/outils', PC);
  const page = r.d.outils.flatMap(f => f.outils).find(o => o.nom === 'commande_appareil');
  assert.ok(page, 'outil déclaré');
});
console.log(ok + ' groupes réussis');
