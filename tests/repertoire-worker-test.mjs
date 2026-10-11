// Répertoire, rédaction des messages et widget, côté Worker (worker/worker.js, phase 4A), avec une base D1 simulée en SQLite :
//   node tests/repertoire-worker-test.mjs
// Le dossier worker/ n'est pas publié sur GitHub : sans lui, le test est simplement sauté. Aucun appel réseau réel :
// fetch est remplacé (IA simulée, marchés indisponibles). Numéros fictifs (plage 06 39 98 réservée à la fiction).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const fichier = new URL('../worker/worker.js', import.meta.url);
if (!fs.existsSync(fichier)) { console.log('  (worker/worker.js absent : test sauté)'); process.exit(0); }

// ── fetch simulé : l'IA répond, tout le reste (marchés, calendrier) est indisponible ──
const envoisIA = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url && url.url || url);
  if (/\/models\b/.test(u)) return new Response(JSON.stringify({ data: [] }), { status: 200 });
  if (/chat\/completions/.test(u)) {
    const corps = JSON.parse(opts.body);
    envoisIA.push(corps);
    return new Response(JSON.stringify({ choices: [{ message: { content: '« Je rentre vers 19 h, à tout à l’heure ! »' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('indisponible', { status: 503 });
};
const { default: worker } = await import(fichier.href);

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
async function brut(chemin, jeton, corps, methode, ipFixe) {
  const h = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ipFixe || '10.1.0.' + (ip++ % 200) };
  if (jeton) h['X-Rayle-Token'] = jeton;
  return worker.fetch(new Request('https://w.test' + chemin, { method: methode || (corps ? 'POST' : 'GET'), headers: h, body: corps ? JSON.stringify(corps) : undefined }), env, ctx);
}
async function appel(chemin, jeton, corps, methode, ipFixe) {
  const r = await brut(chemin, jeton, corps, methode, ipFixe);
  return { status: r.status, d: await r.json().catch(() => ({})) };
}

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

let PC, TEL, idMaman;
await t('appairage (PC, Téléphone)', async () => {
  for (const nom of ['PC', 'Téléphone']) {
    const r = await appel('/appareil/appairer', env.RAYLE_TOKEN, { nom });
    assert.equal(r.status, 200, JSON.stringify(r.d));
    if (nom === 'PC') PC = r.d.jeton; else TEL = r.d.jeton;
  }
});
await t('le code d’accès seul ne lit ni n’écrit le répertoire', async () => {
  assert.equal((await appel('/repertoire', env.RAYLE_TOKEN)).status, 403);
  assert.equal((await appel('/repertoire', env.RAYLE_TOKEN, { op: 'ajouter', contact: { nom: 'Maman', numero: '06 39 98 00 01' } })).status, 403);
  assert.equal((await appel('/message/rediger', env.RAYLE_TOKEN, { contact: 'Maman', texte: 'je rentre' })).status, 403);
  assert.equal((await appel('/repertoire', 'mauvais')).status, 401);
});
await t('ajouter : numéro mis au format international, appli par défaut WhatsApp', async () => {
  const r = await appel('/repertoire', PC, { op: 'ajouter', contact: { nom: 'Maman', surnoms: 'ma mère, m’man', numero: '06 39 98 00 01' } });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  idMaman = r.d.contact.id;
  assert.deepEqual({ nom: r.d.contact.nom, numero: r.d.contact.numero, appli: r.d.contact.appli, surnoms: r.d.contact.surnoms }, { nom: 'Maman', numero: '+33639980001', appli: 'whatsapp', surnoms: ['ma mère', 'm’man'] });
  const l = await appel('/repertoire', TEL);
  assert.equal(l.status, 200); assert.equal(l.d.contacts.length, 1); assert.equal(l.d.contacts[0].numero, '+33639980001');
});
await t('fiches invalides refusées (sans nom, numéro faux, ni numéro ni mail)', async () => {
  for (const contact of [{ numero: '06 39 98 00 01' }, { nom: 'X', numero: '1234' }, { nom: 'Y' }, { nom: '<script>', numero: 'abc' }, null]) {
    const r = await appel('/repertoire', PC, { op: 'ajouter', contact });
    assert.equal(r.status, 400, JSON.stringify(contact));
  }
});
await t('même nom : la fiche est complétée (surnoms gardés, numéro remplacé), pas dupliquée', async () => {
  const r = await appel('/repertoire', PC, { op: 'ajouter', contact: { nom: 'maman', numero: '+33 6 39 98 00 09', surnoms: ['mère'], appli: 'sms' } });
  assert.equal(r.status, 200); assert.equal(r.d.maj, true);
  const l = (await appel('/repertoire', PC)).d.contacts;
  assert.equal(l.length, 1); assert.equal(l[0].numero, '+33639980009'); assert.equal(l[0].appli, 'sms');
  assert.deepEqual(l[0].surnoms, ['ma mère', 'm’man', 'mère']);
  const m = await appel('/repertoire', PC, { op: 'ajouter', contact: { nom: 'Maman', email: 'Maman@Exemple.fr' } });
  assert.equal(m.status, 200);
  const x = (await appel('/repertoire', PC)).d.contacts[0];
  assert.equal(x.email, 'maman@exemple.fr'); assert.equal(x.numero, '+33639980009'); assert.equal(x.appli, 'sms');
});
await t('modifier (par id), homonyme refusé, supprimer', async () => {
  const b = await appel('/repertoire', PC, { op: 'ajouter', contact: { nom: 'Lucas', numero: '06 39 98 00 02' } });
  const idLucas = b.d.contact.id;
  const m = await appel('/repertoire', PC, { op: 'modifier', id: idLucas, contact: { nom: 'Lucas Martin', numero: '06 39 98 00 02', appli: 'appel', surnoms: ['mon frère'] } });
  assert.equal(m.status, 200);
  assert.equal((await appel('/repertoire', PC, { op: 'modifier', id: idLucas, contact: { nom: 'Maman', numero: '06 39 98 00 02' } })).status, 409);
  assert.equal((await appel('/repertoire', PC, { op: 'modifier', id: 999, contact: { nom: 'Z', numero: '06 39 98 00 02' } })).status, 404);
  const s = await appel('/repertoire', PC, { op: 'supprimer', id: idLucas });
  assert.equal(s.status, 200); assert.equal(s.d.nom, 'Lucas Martin');
  assert.equal((await appel('/repertoire', PC)).d.contacts.length, 1);
});
await t('importer (sélecteur de contacts) : nouveaux ajoutés, noms existants jamais écrasés', async () => {
  const r = await appel('/repertoire', TEL, { op: 'importer', contacts: [
    { nom: 'Maman', numero: '06 39 98 00 77' }, { nom: 'Tata Sophie', numero: '06 39 98 00 03' }, { nom: 'Papi', numero: '+33 6 39 98 00 04' }, { nom: 'Sans numéro' }, { nom: '', numero: '06 39 98 00 05' }] });
  assert.equal(r.status, 200); assert.equal(r.d.ajoutes, 2); assert.equal(r.d.ignores, 3);
  const l = (await appel('/repertoire', PC)).d.contacts;
  assert.deepEqual(l.map(c => c.nom), ['Maman', 'Papi', 'Tata Sophie']);
  assert.equal(l.find(c => c.nom === 'Maman').numero, '+33639980009');
});
await t('journal de sécurité : les noms, jamais les numéros ni les adresses', async () => {
  const lignes = DB.brut.prepare("SELECT action, detail FROM journal_actions WHERE action LIKE 'repertoire.%'").all();
  assert.ok(lignes.length >= 5, lignes.length);
  for (const l of lignes) assert.ok(!/\d{2}\s?\d{2}\s?\d{2}\s?\d{2}|@/.test(l.detail), l.detail);
});
await t('rédiger : l’IA ne reçoit que le nom et les mots de Justin (numéros et adresses masqués)', async () => {
  envoisIA.length = 0;
  env.GROQ_KEY = 'cle-factice';
  const r = await appel('/message/rediger', PC, { contact: 'Maman', canal: 'whatsapp', texte: 'je rentre vers 19 h, rappelle-moi au 06 39 98 00 01 ou écris à moi@exemple.fr' });
  assert.equal(r.status, 200, JSON.stringify(r.d));
  assert.equal(r.d.message, 'Je rentre vers 19 h, à tout à l’heure !');           // guillemets retirés
  const tout = JSON.stringify(envoisIA);
  assert.ok(envoisIA.length >= 1);
  assert.ok(/Maman/.test(tout) && /\[numéro\]/.test(tout) && /\[adresse\]/.test(tout), tout.slice(0, 400));
  assert.ok(!/63998|39 98|33639980009|moi@exemple|maman@exemple/.test(tout), 'numéro ou adresse envoyé à l’IA');
  assert.match(tout, /premi\\u00e8re personne|première personne/);
  const m = await appel('/message/rediger', PC, { contact: 'Maman', canal: 'sms', brouillon: 'Je rentre vers 19 h.', consigne: 'ajoute que j’ai pris du pain' });
  assert.equal(m.status, 200);
  assert.match(JSON.stringify(envoisIA[envoisIA.length - 1].messages), /Modification demand/);
  assert.equal((await appel('/message/rediger', PC, { contact: 'Maman' })).status, 400);
  delete env.GROQ_KEY;
  const sans = await appel('/message/rediger', PC, { contact: 'Maman', texte: 'je rentre' });
  assert.equal(sans.status, 503);                                                   // la page garde alors les mots de Justin
});
await t('commande entre appareils : « message » et « appel » acceptés (nom seulement), nettoyés', async () => {
  await appel('/evenements?c=1&a=1', TEL);
  const r = await appel('/appareil/envoyer', PC, { cible: 'téléphone', action: { type: 'message', contact: 'Maman<script>', canal: 'pigeon', texte: 'Je rentre\u0000 vers 19 h.', numero: '+33639980009' } });
  assert.equal(r.status, 200, JSON.stringify(r.d)); assert.equal(r.d.ok, true);
  const f = await appel('/evenements?c=1&a=1', TEL);
  const a = f.d.commandes[0].action;
  assert.deepEqual(a, { type: 'message', contact: 'Mamanscript', canal: 'whatsapp', texte: 'Je rentre  vers 19 h.' });
  const b = await appel('/appareil/envoyer', PC, { cible: 'téléphone', action: { type: 'appel', contact: 'Maman', canal: 'whatsapp' } });
  assert.equal(b.d.ok, true);
  assert.deepEqual((await appel('/evenements?c=1&a=1', TEL)).d.commandes[0].action, { type: 'appel', contact: 'Maman', canal: 'whatsapp' });
  for (const action of [{ type: 'message', contact: 'Maman' }, { type: 'appel' }, { type: 'message', texte: 'x' }])
    assert.equal((await appel('/appareil/envoyer', PC, { cible: 'téléphone', action })).status, 400, JSON.stringify(action));
  const j = DB.brut.prepare("SELECT detail FROM journal_actions WHERE action = 'appareil.commande' AND ok = 1 ORDER BY id DESC LIMIT 2").all().map(x => x.detail);
  assert.ok(j.some(x => /appeler Maman/.test(x)) && j.some(x => /message pour Mamanscript/.test(x)), j.join(' | '));
});

let JW;
await t('widget : sans jeton, mauvais jeton ou jeton principal → refusé', async () => {
  for (const k of ['', 'rw_faux', env.RAYLE_TOKEN, PC]) {
    const r = await brut('/widget?k=' + encodeURIComponent(k));
    assert.equal(r.status, 401, k);
  }
  assert.equal((await appel('/widget/jeton', env.RAYLE_TOKEN, { op: 'generer' })).status, 403);   // créé seulement depuis un appareil appairé
});
await t('widget : jeton séparé créé depuis un appareil appairé, relisible par un autre', async () => {
  const r = await appel('/widget/jeton', PC, { op: 'generer' });
  assert.equal(r.status, 200); assert.match(r.d.jeton, /^rw_[0-9a-f]{48}$/);
  JW = r.d.jeton;
  assert.equal((await appel('/widget/jeton', TEL)).d.jeton, JW);
  assert.equal((await appel('/repertoire', JW)).status, 401);                        // le jeton widget n'ouvre rien d'autre
  assert.equal((await appel('/mini', JW)).status, 401);
});
await t('widget JSON : champs prévus, aucune donnée personnelle, lecture seule', async () => {
  // une alerte posée et un rappel aujourd'hui (dans une heure), pour les compteurs
  const maintenant = Date.now();
  await appel('/taches', PC);   // crée les tables si besoin
  DB.brut.prepare("INSERT INTO alertes (actif, niveau, sens, cree) VALUES ('XAU', 4000, 'dessus', ?)").run(maintenant);
  DB.brut.prepare("INSERT INTO rappels (texte, quand, cree) VALUES ('appeler Maman au 06 39 98 00 09', ?, ?)").run(maintenant + 60000, maintenant);
  const r = await brut('/widget?k=' + JW);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /application\/json/);
  const d = await r.json();
  for (const k of ['maj', 'us100_prix', 'us100_var', 'us100_fleche', 'or_prix', 'or_var', 'annonce_texte', 'seance', 'alertes_texte', 'rappels_texte', 'message']) assert.ok(k in d, k);
  assert.equal(d.us100_prix, '—');                                                    // marchés indisponibles dans le test : tirets, pas d'erreur
  assert.equal(d.alertes, 1);
  assert.ok(d.rappels >= 0 && d.rappels <= 1);
  const tout = JSON.stringify(d);
  assert.ok(!/Maman|Papi|Sophie|63998|@|appeler/.test(tout), tout);                   // ni contacts, ni texte de rappel, ni numéro
  assert.equal((await brut('/widget?k=' + JW, null, { x: 1 }, 'POST')).status, 405);
});
await t('widget texte : quelques lignes lisibles', async () => {
  const r = await brut('/widget?k=' + JW + '&format=texte');
  assert.equal(r.status, 200); assert.match(r.headers.get('Content-Type'), /text\/plain/);
  const s = await r.text();
  assert.match(s, /^RAYLÉ · \d\d:\d\d\nUS100 .*\nOR .*\nAnnonce : .*\n.*\nAlertes \d · Rappels \d\n.+$/);
});
await t('widget : cache de 60 s (deux lectures, une seule production)', async () => {
  const a = await (await brut('/widget?k=' + JW)).json(), b = await (await brut('/widget?k=' + JW)).json();
  assert.equal(a.t, b.t);
});
await t('widget : nouveau jeton → l’ancien ne marche plus ; révoquer → plus rien', async () => {
  const n = await appel('/widget/jeton', TEL, { op: 'generer' });
  assert.notEqual(n.d.jeton, JW);
  assert.equal((await brut('/widget?k=' + JW)).status, 401);
  assert.equal((await brut('/widget?k=' + n.d.jeton)).status, 200);
  assert.equal((await appel('/widget/jeton', PC, { op: 'revoquer' })).status, 200);
  assert.equal((await brut('/widget?k=' + n.d.jeton)).status, 401);
  assert.equal((await appel('/widget/jeton', PC)).d.jeton, null);
  const j = DB.brut.prepare("SELECT detail FROM journal_actions WHERE action = 'widget.jeton'").all();
  assert.equal(j.length, 3); assert.ok(!j.some(x => /rw_/.test(x.detail)));
});
await t('widget : trop de mauvais jetons depuis une même adresse → 429', async () => {
  let s = 0;
  for (let i = 0; i < 9; i++) s = (await brut('/widget?k=rw_mauvais' + i, null, null, 'GET', '10.9.9.9')).status;
  assert.equal(s, 429);
});
await t('agent : outils « preparer_message » et « appeler_contact » (côté page), action posée sans numéro', async () => {
  const o = await appel('/outils', PC);
  const noms = JSON.stringify(o.d);
  assert.match(noms, /preparer_message/); assert.match(noms, /appeler_contact/);
  const src = fs.readFileSync(fichier, 'utf8');
  assert.match(src, /tu ne lis ni ses SMS, ni ses WhatsApp, ni ses mails re\\xE7us/);
  assert.match(src, /VERSION = "phase1[23]-[a-z]+-2026-10-11"/);
});
console.log(ok + ' groupes réussis');
