// Répertoire, messages et appels préparés, côté page (js/rayle/repertoire.js, phase 4A), avec une page et un Worker simulés :
//   node tests/repertoire-commandes-test.mjs
// Les numéros utilisés ici sont fictifs (plage 06 39 98 réservée à la fiction par l'ARCEP).
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const norm = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cmdNorm = n => String(n || '').replace(/[?!.,;:…«»"]/g, ' ').replace(/(?:^|\s)(?:(?:hey|he|eh|ok|okay|dis)\s+)?rayle(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
const lire = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const NUM_MAMAN = '+33639980001', NUM_LUCAS = '+33639980002';

function page(appareil, connus) {
  const journal = [], requetes = [], ouverts = [], panneaux = new Map(), ls = { dev: 'rd_jeton_de_test', devnom: appareil };
  if (connus) ls.rayle_appareils_connus = JSON.stringify(connus);
  let contacts = [
    { id: 1, nom: 'Maman', surnoms: [], numero: NUM_MAMAN, email: 'maman@exemple.fr', appli: 'whatsapp' },
    { id: 2, nom: 'Lucas', surnoms: ['mon frère'], numero: NUM_LUCAS, email: '', appli: 'sms' }
  ];
  const reponses = {
    '/repertoire': c => c ? (requetes.push('ecriture ' + JSON.stringify(c)), { status: 200, d: { ok: true, contact: Object.assign({ id: 9, appli: 'whatsapp' }, c.contact) } }) : { status: 200, d: { contacts } },
    '/message/rediger': c => ({ status: 200, d: { message: c.brouillon ? c.brouillon + ' J’ai pris du pain.' : 'Je rentre vers 19 h, à tout à l’heure !' } }),
    '/appareil/envoyer': c => ({ status: 200, d: { ok: true, id: 41, cible: c.cible } }),
    '/appareil/commande': () => ({ status: 200, d: { id: 41, etat: 'faite', cible: 'Téléphone' } }),
    '/appareil/retour': () => ({ status: 200, d: { ok: true } }),
    '/appareil/liste': () => ({ status: 200, d: { appareils: [] } })
  };
  const elt = (tag) => {
    const e = { tag, classList: { add() {}, remove() {}, contains: () => false, toggle() {} }, addEventListener() {}, appendChild() {}, append() {}, setAttribute() {}, querySelector: () => elt(), style: {}, dataset: {}, textContent: '', value: '', hidden: false, disabled: false, remove() {}, focus() {}, select() {} };
    if (tag === 'a') e.click = () => ouverts.push(e.href);
    return e;
  };
  const ctx = {
    console, norm, cmdNorm, performance, URL, encodeURIComponent, Blob: class { constructor() {} },
    setTimeout: (f, ms) => (ms <= 1500 ? setTimeout(f, 0) : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
    store: { get: k => (ls[k] || '').trim(), set: (k, v) => { if (v) ls[k] = v; else delete ls[k]; } },
    KEY_WDEV: 'dev', KEY_WDEVNOM: 'devnom', KEY_WTOK: 'tok', W: { url: () => 'https://w.test' },
    document: { addEventListener() {}, createElement: elt, body: elt(), hidden: false, execCommand: () => false },
    navigator: { userAgent: 'Test', clipboard: { writeText: async t => { journal.push('copié:' + t); } } }, Audio: class { play() { return Promise.resolve(); } pause() {} },
    location: {},
    $: () => elt(), cfgMsg: elt(), fx: (a, b) => b, pick: a => a[0],
    addLine: (k, t) => journal.push('ligne:' + k + ':' + t), speak: t => { journal.push('dit:' + t); return Promise.resolve(); },
    errMsg: e => String(e && e.message || e), workerReady: () => true,
    speaking: false, processing: false, queue: [], micOn: true, reveilActif: () => true, enterVeille() {}, stopListening() {}, cutAll() {}, garderEcranAllume() {},
    Panneaux: {
      liste: () => [...panneaux.values()].map(p => ({ id: p.id, titre: p.titre, type: p.type })), contenu: () => null,
      ouvrir: o => { panneaux.set(o.id, o); journal.push('panneau:' + o.id + ':' + o.titre); return o.id; }, fermer: id => { panneaux.delete(id); return true; }, fermerTout: () => panneaux.clear(),
      esc: t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    },
    RayleBus: { fournir() {}, on() {}, demander() { return null; } },
    async wfetch(chemin, opts) {
      const corps = opts && opts.body ? JSON.parse(opts.body) : null;
      requetes.push(chemin + (corps ? ' ' + JSON.stringify(corps) : ''));
      const f = reponses[chemin.split('?')[0]];
      const r = f ? f(corps, chemin) : { status: 404, d: { error: 'route inconnue' } };
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.d };
    },
    async wjson(chemin) { const r = await ctx.wfetch(chemin, { method: 'GET' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
    meteoSpeech: () => '', montrerMeteo() {}, commandeTerminal: async () => null, commandeCarte: async () => null, commandeMonde: async () => null
  };
  ctx.window = ctx;
  ctx.window.open = url => { ouverts.push(url); return {}; };
  vm.createContext(ctx);
  let apiApp = null, api = null;
  ctx.__RAYLE_TEST_APPAREILS__ = o => { apiApp = o; };
  ctx.__RAYLE_TEST_REPERTOIRE__ = o => { api = o; };
  vm.runInContext(lire('../js/rayle/appareils.js'), ctx);
  vm.runInContext(lire('../js/rayle/repertoire.js'), ctx);
  api.contacts(contacts);
  return { ctx, api, apiApp, journal, requetes, ouverts, panneaux, ls, reponses, vider() { journal.length = 0; requetes.length = 0; ouverts.length = 0; } };
}

let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 4).join('\n    ')); process.exitCode = 1; } };
const P = page('Téléphone');
const R = P.api.RayleRepertoire;
const cl = x => (x == null ? null : JSON.parse(JSON.stringify(x)));
const LISTE = [{ id: 1, nom: 'Maman', surnoms: [], numero: NUM_MAMAN, email: 'maman@exemple.fr', appli: 'whatsapp' }, { id: 2, nom: 'Lucas', surnoms: ['mon frère'], numero: NUM_LUCAS, email: '', appli: 'sms' }];
const A = q => { const r = cl(R.analyser(q, LISTE)); if (r && r.contact && r.contact.nom && r.contact.id) r.contact = r.contact.nom; return r; };

await t('numéros : format international (France par défaut)', () => {
  assert.equal(R.numero('06 39 98 00 01'), NUM_MAMAN);
  assert.equal(R.numero('06.39.98.00.01'), NUM_MAMAN);
  assert.equal(R.numero('0033 6 39 98 00 01'), NUM_MAMAN);
  assert.equal(R.numero('+33 (0)6 39 98 00 01'), NUM_MAMAN);
  assert.equal(R.numero('+33 06 39 98 00 01'), NUM_MAMAN);
  assert.equal(R.numero('6 39 98 00 01'), NUM_MAMAN);
  assert.equal(R.numero('+44 7700 900123'), '+447700900123');
  for (const x of ['12345', '01 23', '', 'bonjour', '+0 12 34 56 78']) assert.equal(R.numero(x), '', x);
  assert.equal(R.lisible(NUM_MAMAN), '06 39 98 00 01');
  assert.equal(R.masque(NUM_MAMAN), '•• •• •• •• 01');
});
await t('masquer : numéros et adresses jamais vers l’IA, prix intacts', () => {
  const m = R.masquer('ajoute Maman au 06 39 98 00 01 ou au +33 6 39 98 00 02, mail maman@exemple.fr');
  assert.ok(!/\d{2}\s?\d{2}\s?\d{2}/.test(m) && !/@/.test(m), m);
  assert.match(m, /\[numéro\].*\[numéro\].*\[adresse\]/);
  for (const q of ['l’or à 2 650,5 et l’US100 à 21 345', 'alerte sur le Nasdaq à 30 900', 'rappelle-moi dans 20 minutes', 'le CPI sort à 14 h 30']) assert.equal(R.masquer(q), q);
});
await t('liens : wa.me, sms:, mailto:, tel: avec le texte prêt (rien n’est envoyé)', () => {
  assert.equal(R.lienWhatsApp(NUM_MAMAN, 'Je rentre vers 19 h & toi ?'), 'https://wa.me/33639980001?text=Je%20rentre%20vers%2019%20h%20%26%20toi%20%3F');
  assert.equal(R.lienSms(NUM_MAMAN, 'Ok'), 'sms:+33639980001?body=Ok');
  assert.equal(R.lienMail('maman@exemple.fr', 'Coucou'), 'mailto:maman@exemple.fr?body=Coucou');
  assert.equal(R.lienTel(NUM_MAMAN), 'tel:+33639980001');
  assert.equal(R.lien('mail', { numero: NUM_MAMAN, email: '' }, 'x'), '');
});
await t('trouver un contact : nom, surnom, « ma mère » ↔ « Maman », sans accents', () => {
  assert.equal(R.trouver(LISTE, 'maman').nom, 'Maman');
  assert.equal(R.trouver(LISTE, 'ma mère').nom, 'Maman');
  assert.equal(R.trouver(LISTE, 'mon frère').nom, 'Lucas');
  assert.equal(R.trouver(LISTE, 'mon frerot').nom, 'Lucas');
  assert.equal(R.trouver(LISTE, 'LUCAS').nom, 'Lucas');
  assert.equal(R.trouver(LISTE, 'Paul'), null);
  assert.equal(R.trouver(LISTE, 'la tablette'), null);
});
await t('comprendre : ajouter, changer un numéro, lister, supprimer, préférence, surnom, mail', () => {
  assert.deepEqual(A('Raylé, ajoute Maman au 06 39 98 00 01'), { type: 'ajouter', contact: { nom: 'Maman', surnoms: [], numero: NUM_MAMAN }, numeroDit: true, numeroValide: true });
  const l = A('ajoute mon frère Lucas au 06 39 98 00 02 sur WhatsApp');
  assert.equal(l.contact.nom, 'Lucas'); assert.deepEqual(l.contact.surnoms, ['mon frère']); assert.equal(l.contact.appli, 'whatsapp'); assert.equal(l.contact.numero, NUM_LUCAS);
  assert.equal(A('enregistre le numéro de Tata Sophie : 06 39 98 00 03').contact.nom, 'Tata Sophie');
  assert.equal(A('ajoute Paul à mon répertoire au 06 39 98 00 04 par SMS').contact.appli, 'sms');
  assert.equal(A('ajoute Paul à mon répertoire au 06 39 98 00 04 par SMS').contact.nom, 'Paul');
  assert.equal(A('change le numéro de Maman : 06 39 98 00 09').contact.numero, '+33639980009');
  assert.equal(A('ajoute Léa au répertoire').contact.nom, 'Léa');
  assert.equal(A('ajoute Léa au répertoire').numeroDit, false);
  assert.equal(A('ajoute Léa au 06 12'), null);   // ni numéro complet ni « répertoire » : ce n'est pas un contact
  assert.equal(A('ajoute Léa au numéro 06 12 34').numeroValide, false);
  assert.equal(A('qui est dans mon répertoire ?').type, 'lister');
  assert.equal(A('montre-moi mes contacts').type, 'lister');
  assert.deepEqual(A('supprime Maman du répertoire'), { type: 'supprimer', nom: 'maman' });
  assert.deepEqual(A('Maman préfère les SMS'), { type: 'appli', nom: 'maman', appli: 'sms' });
  assert.deepEqual(A('pour Lucas, utilise WhatsApp'), { type: 'appli', nom: 'lucas', appli: 'whatsapp' });
  assert.deepEqual(A('ajoute le surnom ma mère à Maman'), { type: 'surnom', surnom: 'ma mere', nom: 'maman' });
  const m = A('ajoute l’adresse mail de Maman : maman point dupont arobase exemple point fr');
  assert.equal(m.type, 'mail'); assert.equal(m.email, 'maman.dupont@exemple.fr');
  assert.equal(A('importe mes contacts du téléphone').type, 'importer');
});
await t('comprendre : envoyer un message (canal, appareil, contenu)', () => {
  assert.deepEqual(A('Raylé, envoie à Maman que je rentre vers 19 h'), { type: 'message', contact: 'Maman', qui: 'Maman', canal: '', appareil: '', contenu: 'je rentre vers 19 h' });
  let x = A('envoie un SMS à ma mère pour lui dire que je suis en retard');
  assert.equal(x.contact, 'Maman'); assert.equal(x.canal, 'sms'); assert.equal(x.contenu, 'je suis en retard');
  x = A('envoie à Maman par mail que les papiers sont prêts'); assert.equal(x.canal, 'mail'); assert.equal(x.contenu, 'les papiers sont prêts');
  x = A('envoie à Maman que les papiers sont prêts par WhatsApp'); assert.equal(x.canal, 'whatsapp'); assert.equal(x.contenu, 'les papiers sont prêts');
  x = A('écris à Lucas que le match est à 20 h sur le téléphone'); assert.equal(x.contact, 'Lucas'); assert.equal(x.appareil, 'telephone'); assert.equal(x.contenu, 'le match est à 20 h');
  x = A('dis à mon frère que je l’aime'); assert.equal(x.contact, 'Lucas'); assert.equal(x.contenu, 'je l’aime');
  x = A('envoie un message à Maman'); assert.equal(x.contact, 'Maman'); assert.equal(x.contenu, '');
  x = A('demande à Maman de m’appeler ce soir'); assert.equal(x.contenu, 'demande-lui de m’appeler ce soir');
  x = A('envoie un message à Paul que j’arrive'); assert.equal(x.contact, null); assert.equal(x.qui, 'Paul');
  x = A('tu peux envoyer un texto à Maman : j’arrive dans 10 minutes'); assert.equal(x.canal, 'sms'); assert.equal(x.contenu, 'j’arrive dans 10 minutes');
});
await t('comprendre : appeler (téléphone, WhatsApp, urgence) et ne pas confondre avec un rappel', () => {
  assert.deepEqual(A('appelle Maman'), { type: 'appel', contact: 'Maman', qui: 'Maman', canal: 'telephone', appareil: '' });
  assert.equal(A('appelle Maman sur WhatsApp').canal, 'whatsapp');
  assert.equal(A('appelle mon frère en visio').canal, 'whatsapp');
  assert.equal(A('appelle Maman sur le téléphone').appareil, 'telephone');
  assert.equal(A('passe un coup de fil à Lucas').contact, 'Lucas');
  assert.equal(A('téléphone à Maman').contact, 'Maman');
  assert.deepEqual(A('appelle Paul'), { type: 'appel', contact: null, qui: 'Paul', canal: 'telephone', appareil: '' });
  assert.equal(A('appelle les pompiers').type, 'urgence');
  assert.equal(A('appelle le 15').type, 'urgence');
  for (const q of ['appelle-moi Justin', 'appelle moi Justin', 'rappelle-moi dans 20 minutes', 'rappelle moi demain à 8 h de réviser', 'rappelle Maman demain à 18 h', 'mes rappels', 'rappelle-moi d’appeler Maman'])
    assert.equal(A(q), null, q);
});
await t('lire les messages reçus : jamais, réponse honnête', () => {
  for (const q of ['lis-moi mes messages', 'est-ce que j’ai des nouveaux messages ?', 'qui m’a écrit ?', 'lis mes SMS', 'regarde mes mails', 'consulte mes WhatsApp', 'qu’a répondu Maman ?'])
    assert.equal(A(q) && A(q).type, 'lire_messages', q);
});
await t('rien à voir : la phrase suit son chemin habituel', () => {
  for (const q of ['envoie ce panneau sur la tablette', 'dis à la tablette que le repas est prêt', 'affiche l’or en H4', 'ajoute une alerte sur l’or à 2650', 'note que ma règle est de ne pas trader le vendredi',
    'mets le terminal sur le PC', 'quel est le prix de l’or ?', 'ajoute kiné jeudi 14 h', 'ajoute un rappel demain à 8 h', 'envoie-moi le briefing sur Telegram', 'dis-moi le prix du Bitcoin', 'écris un code HTML', 'change le fond', 'envoie à la tablette le panneau', 'dis bonjour'])
    assert.equal(A(q), null, q);
});

await t('envoyer : rédige, affiche, lit, DEMANDE avant d’ouvrir ; « oui » ouvre WhatsApp avec le texte prêt', async () => {
  P.vider();
  const r = await P.api.commandeMessages('Raylé, envoie à Maman que je rentre vers 19 h');
  assert.match(r, /Maman : « Je rentre vers 19 h, à tout à l’heure ! »\. Je l’ouvre dans WhatsApp \?/);
  const red = P.requetes.find(x => x.startsWith('/message/rediger'));
  assert.ok(red && /"contact":"Maman"/.test(red) && !/63998|33639/.test(red), red);   // l'IA ne reçoit que le nom
  assert.ok(P.panneaux.has('msg:brouillon'));
  assert.deepEqual(P.ouverts, []);                                        // rien d'ouvert sans confirmation
  assert.equal(P.api.etat().etape, 'message');
  const o = await P.api.commandeMessages('oui');
  assert.deepEqual(P.ouverts, ['https://wa.me/33639980001?text=' + encodeURIComponent('Je rentre vers 19 h, à tout à l’heure !')]);
  assert.match(o, /il ne reste qu’à appuyer sur Envoyer/);
  assert.equal(P.api.etat(), null); assert.ok(!P.panneaux.has('msg:brouillon'));
});
await t('modifier puis annuler : rien ne s’ouvre', async () => {
  P.vider();
  await P.api.commandeMessages('envoie à Maman que je rentre vers 19 h');
  const m = await P.api.commandeMessages('modifie : ajoute que j’ai pris du pain');
  assert.match(m, /nouvelle version : « Je rentre vers 19 h, à tout à l’heure ! J’ai pris du pain\. »/);
  const red = P.requetes.filter(x => x.startsWith('/message/rediger')).pop();
  assert.match(red, /"brouillon":"Je rentre/); assert.match(red, /"consigne":"ajoute que j’ai pris du pain"/);
  assert.equal(await P.api.commandeMessages('annule'), 'D’accord, j’abandonne ce message.');
  assert.deepEqual(P.ouverts, []); assert.equal(P.api.etat(), null);
});
await t('« par SMS » change le canal, « oui » ouvre sms: avec le texte', async () => {
  P.vider();
  await P.api.commandeMessages('envoie à Maman que je rentre vers 19 h');
  assert.match(await P.api.commandeMessages('par SMS'), /par SMS\. Je l’ouvre \?/);
  await P.api.commandeMessages('vas-y');
  assert.equal(P.ouverts[0], 'sms:+33639980001?body=' + encodeURIComponent('Je rentre vers 19 h, à tout à l’heure !'));
});
await t('appli préférée du contact (Lucas : SMS) et mail sans adresse refusé proprement', async () => {
  P.vider();
  assert.match(await P.api.commandeMessages('dis à mon frère que je passe le prendre'), /Je l’ouvre dans les SMS \?/);
  await P.api.commandeMessages('non');
  assert.match(await P.api.commandeMessages('envoie un mail à Lucas que le dossier est prêt'), /Je n’ai pas l’adresse mail de Lucas/);
  assert.deepEqual(P.ouverts, []);
});
await t('« envoie un message à Maman » sans contenu : elle demande quoi dire, puis rédige', async () => {
  P.vider();
  assert.equal(await P.api.commandeMessages('envoie un message à Maman'), 'Qu’est-ce que tu veux dire à Maman ?');
  assert.match(await P.api.commandeMessages('que je serai en retard'), /Je l’ouvre dans WhatsApp \?/);
  assert.match(P.requetes.find(x => x.startsWith('/message/rediger')), /"texte":"je serai en retard"/);
  await P.api.commandeMessages('annule');
});
await t('une autre phrase pendant l’attente : la proposition tombe, rien ne s’ouvre', async () => {
  P.vider();
  await P.api.commandeMessages('envoie à Maman que je rentre vers 19 h');
  assert.equal(await P.api.commandeMessages('quel temps fait-il à Toulouse ?'), null);
  assert.equal(P.api.etat(), null);
  assert.equal(await P.api.commandeMessages('oui'), null);
  assert.deepEqual(P.ouverts, []);
});
await t('appeler sur le téléphone : confirmation, puis tel: ; sur WhatsApp : la conversation et l’icône d’appel', async () => {
  P.vider();
  assert.equal(await P.api.commandeMessages('appelle Maman'), 'J’appelle Maman ?');
  assert.deepEqual(P.ouverts, []);
  assert.match(await P.api.commandeMessages('oui'), /J’ouvre l’appel vers Maman/);
  assert.deepEqual(P.ouverts, ['tel:+33639980001']);
  P.vider();
  assert.match(await P.api.commandeMessages('appelle Maman sur WhatsApp'), /touch.*l’icône d’appel/);
  assert.match(await P.api.commandeMessages('ok'), /touche l’icône d’appel dans WhatsApp/);
  assert.deepEqual(P.ouverts, ['https://wa.me/33639980001']);
});
await t('contact inconnu, urgence, lecture des messages : réponses claires sans rien ouvrir', async () => {
  P.vider();
  assert.match(await P.api.commandeMessages('appelle Paul'), /Je n’ai pas « Paul » dans ton répertoire/);
  assert.match(await P.api.commandeMessages('lis-moi mes messages'), /Je ne peux pas lire tes messages/);
  assert.match(await P.api.commandeMessages('appelle les pompiers'), /112/);
  assert.deepEqual(P.ouverts, []);
  assert.ok(!P.requetes.some(x => x.startsWith('/message')));
});
await t('ajouter à la voix : le Worker reçoit la fiche (numéro au format international)', async () => {
  P.vider();
  const r = await P.api.commandeMessages('Raylé, ajoute Tata Sophie au 06 39 98 00 03 par SMS');
  const e = P.requetes.find(x => x.startsWith('ecriture '));
  assert.ok(e && /"op":"ajouter"/.test(e) && /"nom":"Tata Sophie"/.test(e) && /"numero":"\+33639980003"/.test(e) && /"appli":"sms"/.test(e), e);
  assert.match(r, /Tata Sophie est dans ton répertoire, au 06 … 03/);
  P.vider();
  assert.equal(await P.api.commandeMessages('ajoute Léa au répertoire'), 'Quel est le numéro de Léa ?');
  await P.api.commandeMessages('06 39 98 00 05');
  assert.ok(P.requetes.some(x => /"nom":"Léa".*"numero":"\+33639980005"/.test(x)));
  P.vider();
  assert.equal(await P.api.commandeMessages('supprime Maman du répertoire'), 'Je retire Maman du répertoire ?');
  assert.equal(await P.api.commandeMessages('oui'), 'Maman est retiré du répertoire.');
  assert.ok(P.requetes.some(x => /"op":"supprimer","id":1/.test(x)));
});
await t('qui est dans mon répertoire : les noms à voix haute, jamais les numéros', async () => {
  P.vider();
  const r = await P.api.commandeMessages('qui est dans mon répertoire ?');
  assert.equal(r, 'Il y a 2 personnes dans ton répertoire : Maman et Lucas.');
  const pn = P.panneaux.get('msg:repertoire');
  assert.ok(pn && !/63998/.test(pn.corps.html) && /•• •• •• •• 01/.test(pn.corps.html), pn && pn.corps.html);
});

// PC : pas de carte SIM → « je l'envoie sur le téléphone ? » (commandes entre appareils, phase 3A)
const PC = page('PC', ['PC', 'Téléphone', 'Tablette']);
await t('PC : « appelle Maman » propose le téléphone ; « oui » y envoie seulement le nom', async () => {
  PC.vider();
  assert.match(await PC.api.commandeMessages('appelle Maman'), /Cet appareil ne peut pas appeler\. Je mets l’appel vers Maman prêt sur ton téléphone \?/);
  const r = await PC.api.commandeMessages('oui');
  const e = PC.requetes.find(x => x.startsWith('/appareil/envoyer'));
  assert.ok(e && /"cible":"Téléphone"/.test(e) && /"action":\{"type":"appel","contact":"Maman","canal":"telephone"\}/.test(e) && !/63998/.test(e), e);
  assert.match(r, /L’appel vers Maman est prêt sur le téléphone/);
  assert.deepEqual(PC.ouverts, []);
});
await t('PC : « envoie à Maman que … sur le téléphone » : le texte prêt part sur le téléphone, sans numéro', async () => {
  PC.vider();
  assert.match(await PC.api.commandeMessages('envoie à Maman que je rentre vers 19 h sur le téléphone'), /Je le mets prêt sur ton téléphone \?/);
  const r = await PC.api.commandeMessages('oui');
  const e = PC.requetes.find(x => x.startsWith('/appareil/envoyer'));
  assert.ok(e && /"type":"message","contact":"Maman","canal":"whatsapp","texte":"Je rentre vers 19 h/.test(e) && !/63998/.test(e), e);
  assert.match(r, /Le message pour Maman est prêt sur le téléphone/);
  assert.deepEqual(PC.ouverts, []);
});
await t('PC : WhatsApp s’ouvre ici (WhatsApp Web) ; les SMS proposent le téléphone', async () => {
  PC.vider();
  assert.match(await PC.api.commandeMessages('envoie à Maman que je rentre'), /Je l’ouvre dans WhatsApp \?/);
  await PC.api.commandeMessages('oui');
  assert.match(PC.ouverts[0], /^https:\/\/wa\.me\/33639980001\?text=/);
  PC.vider();
  assert.match(await PC.api.commandeMessages('envoie un SMS à Maman que je rentre'), /Les SMS partent du téléphone/);
  await PC.api.commandeMessages('oui');
  assert.ok(PC.requetes.some(x => /\/appareil\/envoyer.*"canal":"sms"/.test(x)));
  assert.deepEqual(PC.ouverts, []);
});
await t('téléphone : message reçu du PC → panneau prêt, rien d’ouvert avant « oui » ou un toucher', async () => {
  P.vider();
  await P.apiApp.appExecuter({ id: 77, de: 'PC', action: { type: 'message', contact: 'Maman', canal: 'whatsapp', texte: 'Je rentre vers 19 h.' } });
  assert.ok(P.panneaux.has('msg:brouillon'));
  assert.ok(P.journal.some(x => /dit:Message pour Maman prêt, envoyé par PC/.test(x)));
  assert.ok(P.requetes.some(x => /\/appareil\/retour .*"id":77,"ok":true/.test(x)));
  assert.deepEqual(P.ouverts, []);
  await P.panneaux.get('msg:brouillon').pied[0].clic();          // toucher « Ouvrir dans WhatsApp »
  assert.deepEqual(P.ouverts, ['https://wa.me/33639980001?text=' + encodeURIComponent('Je rentre vers 19 h.')]);
  P.vider();
  await P.apiApp.appExecuter({ id: 78, de: 'PC', action: { type: 'appel', contact: 'Inconnu', canal: 'telephone' } });
  assert.ok(P.requetes.some(x => /\/appareil\/retour .*"id":78,"ok":false/.test(x)));
});
await t('l’agent du Worker peut demander un message : même chemin, même confirmation', async () => {
  P.vider();
  const r = await P.api.repActionAgent({ type: 'message', contact: 'ma mère', contenu: 'je rentre vers 19 h', canal: '' });
  assert.match(r, /Je l’ouvre dans WhatsApp \?/);
  assert.deepEqual(P.ouverts, []);
  await P.api.commandeMessages('annule');
});
await t('appareil non appairé : le répertoire le dit', async () => {
  const X = page('Téléphone'); X.ls.dev = '';
  assert.match(await X.api.commandeMessages('envoie à Maman que je rentre'), /appareil appairé/);
  assert.match(await X.api.commandeMessages('lis mes messages'), /Je ne peux pas lire tes messages/);
});
await t('respond() : masquage avant l’IA et répertoire avant les autres appareils (phrase.js)', () => {
  const s = lire('../js/rayle/phrase.js');
  assert.ok(s.indexOf('commandeMessages(text)') > 0 && s.indexOf('commandeMessages(text)') < s.indexOf('commandeAppareils(text)'));
  assert.ok(s.indexOf('RayleRepertoire.masquer(text)') > 0 && s.indexOf('RayleRepertoire.masquer(text)') < s.indexOf('askAgent(text)'));
  assert.ok(/<script src="js\/rayle\/repertoire\.js\?v=/.test(lire('../index.html')));
});
console.log(ok + ' groupes réussis');
