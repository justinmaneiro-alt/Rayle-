// Test de la route Telegram du Worker (fichiers locaux ignorés par git) avec un FAUX Telegram et une FAUSSE base D1.
// Aucun message réel n'est envoyé, aucun jeton réel n'est lu. Lancer :  node galaxie/tests/telegram-worker-test.mjs
import fs from 'node:fs';
const racine = new URL('../../worker/src/', import.meta.url);
if (!fs.existsSync(new URL('telegram/telegram.js', racine))) { console.log('worker/ absent (ignoré par git) : test ignoré'); process.exit(0); }
let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

/* fausse D1 : tables compteurs et reglages */
function fauxDB() {
  const compteurs = new Map(), reglages = new Map();
  const prep = sql => ({ bind: (...a) => ({
    first: async () => {
      if (/FROM compteurs/.test(sql)) return compteurs.has(a[0]) ? { valeur: compteurs.get(a[0]) } : null;
      if (/FROM reglages/.test(sql)) return reglages.has(a[0]) ? { valeur: reglages.get(a[0]) } : null;
      return null;
    },
    run: async () => {
      if (/INTO compteurs/.test(sql)) compteurs.set(a[0], (compteurs.get(a[0]) || 0) + a[1]);
      else if (/INTO reglages/.test(sql)) reglages.set(a[0], a[1]);
      else if (/DELETE FROM reglages/.test(sql)) reglages.delete(a[0]);
      return {};
    },
    all: async () => ({ results: [] })
  }), run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) });
  return { prepare: prep, batch: async () => [], compteurs, reglages };
}
/* faux Telegram */
const appels = [];
let maj = [], webhookActif = false;
globalThis.fetch = async (url, opts) => {
  const m = String(url).match(/api\.telegram\.org\/bot([^/]+)\/(\w+)/);
  if (!m) return new Response('{}', { status: 404 });
  const corps = JSON.parse(opts.body || '{}');
  appels.push({ jeton: m[1], methode: m[2], corps });
  const rep = (ok, result, desc) => new Response(JSON.stringify(ok ? { ok: true, result } : { ok: false, description: desc }), { status: ok ? 200 : 409 });
  if (m[2] === 'getUpdates') return webhookActif ? rep(false, null, 'Conflict: webhook is active') : rep(true, maj);
  if (m[2] === 'deleteWebhook') { webhookActif = false; return rep(true, true); }
  return rep(true, { message_id: 1 });
};
const T = await import(new URL('telegram/telegram.js', racine).href);
const { MEM } = await import(new URL('infra/cache.js', racine).href);
const cors = {};
const env = (extra = {}) => (MEM.clear(), { TELEGRAM_TOKEN: 'FAUX_JETON_DE_TEST', DB: fauxDB(), ...extra });
const post = (corps) => new Request('https://x/telegram/envoyer', { method: 'POST', body: JSON.stringify(corps) });
const route = (chemin, req, e) => T.routeTelegram(req, new URL('https://x' + chemin), e, null, cors);

/* envoi simple vers l'identifiant enregistré */
{
  const e = env(); e.DB.reglages.set('telegram_chat', '123456789');
  appels.length = 0;
  const r = await route('/telegram/envoyer', post({ texte: 'ENTREE test', type: 'ENTREE', chat_id: '999' }), e);
  v('envoi : 200', r.status === 200);
  v('envoi : une seule requête Telegram', appels.length === 1 && appels[0].methode === 'sendMessage');
  v('envoi : destinataire = identifiant enregistré, JAMAIS celui de la requête', appels[0].corps.chat_id === '123456789');
  v('envoi : texte transmis', appels[0].corps.text === 'ENTREE test');
}
/* sans identifiant, sans jeton, texte absent */
{
  appels.length = 0;
  let r = await route('/telegram/envoyer', post({ texte: 'x' }), env());
  v('sans discussion : 409', r.status === 409 && appels.length === 0);
  r = await route('/telegram/envoyer', post({ texte: 'x' }), env({ TELEGRAM_TOKEN: undefined }));
  v('sans jeton : 400', r.status === 400);
  const e = env(); e.DB.reglages.set('telegram_chat', '1');
  r = await route('/telegram/envoyer', post({}), e);
  v('sans texte : 400', r.status === 400);
  r = await route('/telegram/envoyer', new Request('https://x/telegram/envoyer'), e);
  v('GET refusé : 405', r.status === 405);
}
/* secret TELEGRAM_CHAT_ID prioritaire */
{
  const e = env({ TELEGRAM_CHAT_ID: '555' }); e.DB.reglages.set('telegram_chat', '1');
  appels.length = 0; await route('/telegram/envoyer', post({ texte: 'a' }), e);
  v('secret TELEGRAM_CHAT_ID prioritaire', appels[0].corps.chat_id === '555');
}
/* limite de débit : 4 par minute */
{
  const e = env(); e.DB.reglages.set('telegram_chat', '1'); appels.length = 0;
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await route('/telegram/envoyer', post({ texte: 'm' + i }), e)).status);
  v('limite par minute : 4 envois puis 429', codes.join() === '200,200,200,200,429,429', codes.join());
  v('limite : pas d’appel Telegram au-delà', appels.length === 4);
}
/* texte long tronqué */
{
  const e = env(); e.DB.reglages.set('telegram_chat', '1'); appels.length = 0;
  await route('/telegram/envoyer', post({ texte: 'a'.repeat(9000) }), e);
  v('texte long tronqué', appels[0].corps.text.length <= T.LIMITES.tailleMax);
}
/* état : jamais l'identifiant */
{
  const e = env(); e.DB.reglages.set('telegram_chat', '777888999');
  const r = await route('/telegram/etat', new Request('https://x/telegram/etat'), e);
  const t = await r.text();
  v('état : lié', JSON.parse(t).lie === true && JSON.parse(t).configure === true);
  v('état : n’expose pas l’identifiant', !t.includes('777888999'));
}
/* liaison : /lier, webhook ancien, privé seulement */
{
  const e = env(); webhookActif = true; appels.length = 0;
  maj = [{ message: { text: 'bonjour', chat: { id: 1, type: 'private' } } }];
  let r = await route('/telegram/lier', new Request('https://x/telegram/lier', { method: 'POST' }), e);
  v('liaison : sans « /lier » → 404 et rien d’enregistré', r.status === 404 && !e.DB.reglages.has('telegram_chat'));
  maj = [{ message: { text: '/lier', chat: { id: -100, type: 'group' } } }, { message: { text: '/lier', chat: { id: 4242, type: 'private' } } }];
  MEM.clear();
  r = await route('/telegram/lier', new Request('https://x/telegram/lier', { method: 'POST' }), e);
  MEM.clear();
  v('liaison : enregistre la discussion privée', r.status === 200 && e.DB.reglages.get('telegram_chat') === '4242');
  v('liaison : ancien webhook retiré', appels.some(a => a.methode === 'deleteWebhook'));
  maj = [{ message: { text: '/lier', chat: { id: 9, type: 'private' } } }];
  r = await route('/telegram/lier', new Request('https://x/telegram/lier', { method: 'POST' }), e);
  MEM.clear();
  v('liaison : jamais remplacée sans retrait', e.DB.reglages.get('telegram_chat') === '4242');
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
