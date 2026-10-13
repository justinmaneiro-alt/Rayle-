// Connexion Google (js/drive/auth.js) et sélecteur de fichiers avec de FAUX services Google :   node tests/drive-auth-test.mjs
// Vérifie surtout : aucun secret ni jeton stocké durablement, expiration, reconnexion silencieuse, messages clairs, config vide par défaut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { creerAuth, choisirFichiers, lireConfig, MESSAGE_CONFIG, PORTEE } from '../js/drive/auth.js';
import { MIMES_ACCEPTES } from '../js/drive/formats.js';

let ok = 0;
const t = async (nom, f) => { try { await f(); ok++; console.log('  ✔', nom); } catch (e) { console.log('  ✘', nom, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };

const CLIENT = '123456789012-abcdefghij.apps.googleusercontent.com';
function monde({ config = { clientId: CLIENT, appId: '123456789012', apiKey: '' }, reponse } = {}) {
  const stock = new Map(), journal = [], G = { RAYLE_DRIVE_CONFIG: config }; let maintenant = 1_000_000;
  G.google = { accounts: { oauth2: {
    initTokenClient(o) { journal.push(['init', o.client_id, o.scope]); return { requestAccessToken(opts) { journal.push(['demande', opts]); setTimeout(() => (reponse || ((o2) => o2.callback({ access_token: 'jeton-' + journal.length, expires_in: 3600 })))(o), 0); } }; },
    revoke(tok, cb) { journal.push(['revoke', tok]); cb(); }
  } } };
  const stockage = { get: k => (stock.has(k) ? stock.get(k) : null), set: (k, v) => { v == null ? stock.delete(k) : stock.set(k, v); } };
  const auth = creerAuth({ G, charger: async () => {}, maintenant: () => maintenant, stockage, delaiSilencieux: 30 });
  return { auth, stock, journal, G, avancer: ms => { maintenant += ms; } };
}

await t('config-drive.js livré VIDE : aucun identifiant, aucun secret dans le dépôt', () => {
  const src = fs.readFileSync(new URL('../js/config-drive.js', import.meta.url), 'utf8');
  assert.match(src, /clientId: ''/); assert.match(src, /appId: ''/); assert.match(src, /apiKey: ''/);
  assert.ok(!/apps\.googleusercontent\.com['"]/.test(src.replace(/«[^»]*»/g, '')), 'pas d’identifiant client réel');
  assert.ok(!/GOCSPX|client_secret|ya29\.|AIza/.test(src), 'aucun secret');
  for (const dir of ['js', 'css', 'docs']) for (const f of fs.readdirSync(new URL('../' + dir + '/', import.meta.url), { recursive: true })) {
    if (!/\.(js|css|md|html)$/.test(f)) continue;
    const c = fs.readFileSync(new URL('../' + dir + '/' + f, import.meta.url), 'utf8'); assert.ok(!/GOCSPX-[\w-]{10,}|ya29\.[\w-]{20,}|AIza[\w-]{30,}/.test(c), 'secret trouvé dans ' + dir + '/' + f);
  }
});
await t('identifiant absent ou mal formé : message clair vers docs/drive.md, jamais de plantage', async () => {
  for (const config of [{}, { clientId: '' }, { clientId: 'pas-un-identifiant' }]) {
    const { auth, journal } = monde({ config });
    assert.equal(lireConfig({ RAYLE_DRIVE_CONFIG: config }).valide, false); assert.equal(auth.etat().configure, false);
    await assert.rejects(() => auth.connecter(), e => /docs\/drive\.md/.test(e.message) && e.raison === 'config');
    await assert.rejects(() => auth.jeton(), e => e.raison === 'config'); assert.equal(journal.length, 0, 'Google n’est même pas contacté');
  }
  assert.match(MESSAGE_CONFIG, /js\/config-drive\.js/);
});
await t('connexion : portée drive.file seulement ; le jeton reste EN MÉMOIRE, seul un repère « connecté » est gardé', async () => {
  const { auth, stock, journal } = monde();
  const jeton = await auth.connecter();
  assert.deepEqual(journal[0], ['init', CLIENT, PORTEE]); assert.equal(PORTEE, 'https://www.googleapis.com/auth/drive.file');
  assert.equal(auth.etat().connecte, true); assert.equal(auth.etat().expireDans > 3000, true);
  assert.deepEqual([...stock.keys()], ['rayle_drive_connecte']); assert.equal(stock.get('rayle_drive_connecte'), '1');
  assert.ok(![...stock.values()].some(v => String(v).includes(jeton)), 'le jeton n’est écrit nulle part');
});
await t('le jeton est réutilisé tant qu’il est valide, puis renouvelé en silence (prompt vide) à l’expiration', async () => {
  const { auth, journal, avancer } = monde();
  const j1 = await auth.connecter(); assert.equal(await auth.jeton(), j1);
  assert.equal(journal.filter(x => x[0] === 'demande').length, 1, 'une seule demande tant que valide');
  avancer(3600 * 1000 - 10_000);                                         // il reste 10 s : trop juste, on renouvelle
  const j2 = await auth.jeton(); assert.notEqual(j2, j1);
  assert.deepEqual(journal.filter(x => x[0] === 'demande').map(x => x[1].prompt), ['consent', '']);
  assert.equal((await auth.jeton(true)) !== j2, true, 'forcer renouvelle même si valide');
});
await t('reconnexion impossible sans geste : erreur « reconnexion » (le bouton « Se connecter à Google » prend le relais)', async () => {
  const m = monde({ reponse: () => {} });                               // Google ne répond jamais (fenêtre bloquée)
  m.stock.set('rayle_drive_connecte', '1');
  await assert.rejects(() => m.auth.jeton(), e => e.raison === 'reconnexion' && /Se connecter à Google/.test(e.message));
  const sans = monde();                                                   // jamais connecté : on ne tente même pas
  await assert.rejects(() => sans.auth.jeton(), e => e.raison === 'reconnexion'); assert.equal(sans.journal.length, 0);
});
await t('fenêtre bloquée / fermée / refus : messages distincts, état propre', async () => {
  const bloque = monde({ reponse: o => o.error_callback({ type: 'popup_failed_to_open' }) });
  await assert.rejects(() => bloque.auth.connecter(), e => e.raison === 'popup' && /bloqué la fenêtre/.test(e.message));
  const ferme = monde({ reponse: o => o.error_callback({ type: 'popup_closed' }) });
  await assert.rejects(() => ferme.auth.connecter(), e => e.raison === 'fermee');
  const refus = monde({ reponse: o => o.callback({ error: 'access_denied' }) });
  await assert.rejects(() => refus.auth.connecter(), e => e.raison === 'refus' && /access_denied/.test(e.message)); assert.equal(refus.auth.etat().connecte, false);
});
await t('déconnexion : jeton révoqué chez Google, repère effacé, plus d’accès sans nouvelle connexion', async () => {
  const { auth, journal, stock } = monde();
  const j = await auth.connecter(); await auth.deconnecter();
  assert.deepEqual(journal.find(x => x[0] === 'revoke'), ['revoke', j]); assert.equal(stock.size, 0); assert.equal(auth.etat().connecte, false);
  await assert.rejects(() => auth.jeton(), e => e.raison === 'reconnexion');
});
await t('les abonnés sont prévenus (bouton « Se connecter / Se déconnecter » mis à jour)', async () => {
  const { auth } = monde(); const vus = []; auth.surChangement(e => vus.push(e.connecte));
  await auth.connecter(); await auth.deconnecter(); assert.deepEqual(vus, [true, false]);
});

/* ───── sélecteur ───── */
function fauxPicker() {
  const rec = { vues: [], options: {} }, P = {};
  P.ViewId = { DOCS: 'docs' }; P.Feature = { MULTISELECT_ENABLED: 'multi' }; P.Action = { PICKED: 'picked', CANCEL: 'cancel' };
  P.Response = { ACTION: 'action', DOCUMENTS: 'docs' }; P.Document = { ID: 'id', NAME: 'name', MIME_TYPE: 'mimeType' };
  P.DocsView = class { constructor(v) { this.v = v; } setMimeTypes(m) { this.mimes = m; return this; } setIncludeFolders() { return this; } setOwnedByMe(b) { this.propre = b; return this; } };
  P.PickerBuilder = class {
    addView(v) { rec.vues.push(v); return this; } enableFeature(f) { rec.options.feature = f; return this; } setOAuthToken(t) { rec.options.jeton = t; return this; } setLocale(l) { rec.options.locale = l; return this; }
    setTitle() { return this; } setAppId(a) { rec.options.appId = a; return this; } setDeveloperKey(k) { rec.options.cle = k; return this; } setCallback(cb) { rec.cb = cb; return this; }
    build() { return { setVisible: v => { rec.visible = v; } }; }
  };
  return { P, rec };
}
await t('sélecteur : jeton OAuth, types de fichiers pris en charge, identifiant de projet seulement s’il est configuré, pas de clé par défaut', async () => {
  const m = monde(); const { P, rec } = fauxPicker();
  m.G.gapi = { load: (n, o) => o.callback() }; m.G.google.picker = P;
  await m.auth.connecter();
  const p = choisirFichiers({ auth: m.auth, mimes: MIMES_ACCEPTES, G: m.G, charger: async () => {} });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(rec.visible, true); assert.equal(rec.options.appId, '123456789012'); assert.equal(rec.options.cle, undefined, 'aucune clé d’API si non configurée'); assert.equal(rec.options.locale, 'fr');
  assert.ok(rec.vues[0].mimes.includes('application/vnd.google-apps.document') && rec.vues[0].mimes.includes('application/pdf'));
  rec.cb({ action: 'picked', docs: [{ id: 'a1', name: 'Cours', mimeType: 'application/pdf' }] });
  assert.deepEqual(await p, [{ id: 'a1', name: 'Cours', mimeType: 'application/pdf' }]);
});
await t('sélecteur annulé → liste vide ; sans config → message clair', async () => {
  const m = monde(); const { P, rec } = fauxPicker(); m.G.gapi = { load: (n, o) => o.callback() }; m.G.google.picker = P;
  await m.auth.connecter();
  const p = choisirFichiers({ auth: m.auth, mimes: [], G: m.G, charger: async () => {} }); await new Promise(r => setTimeout(r, 20)); rec.cb({ action: 'cancel' }); assert.deepEqual(await p, []);
  await assert.rejects(() => choisirFichiers({ auth: m.auth, mimes: [], G: { RAYLE_DRIVE_CONFIG: {} }, charger: async () => {} }), /config-drive/);
  const non = monde(); await assert.rejects(() => choisirFichiers({ auth: non.auth, mimes: [], G: non.G, charger: async () => {} }), e => e.raison === 'reconnexion');
});
console.log(`${ok} tests réussis`);
