/* Test Chrome v8 phase 2 : le cerveau (Gemini + outils) lit les vraies données de l'application. Le Worker rayle-voix est simulé (le « modèle » appelle un outil puis rédige avec le résultat) ;
   les OUTILS sont réels et lisent la branche de données de production. Prérequis : node serveur.mjs 8000 ; accès réseau. Usage : node trader-pro/tests/cerveau-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const pcm = Buffer.alloc(24000 * 2); const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
const ref = await (await fetch('https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/pro-or.json')).json();   // prix réel de l'or dans la branche de données
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
let requetes = [], tts = [], panneCerveau = null;
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v8', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_voix_gemini_v1: { moteur: 'gemini-f1', ton: 'naturel', vitesse: 0 }, rayle_voix_v9: '1', rayle_piper_precharge: '0', rayle_donnees_base: 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  const rep = (statut, corps, h = {}) => r.respond({ status: statut, headers: { ...CORS, 'content-type': 'application/json', ...h }, body: typeof corps === 'string' ? corps : JSON.stringify(corps) });
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { tts.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  if (u.endsWith('/cerveau')) {
    const b = JSON.parse(r.postData() || '{}'); requetes.push(b);
    if (panneCerveau) { await rep(panneCerveau.statut, { error: panneCerveau.msg, quota: panneCerveau.quota }); return true; }
    const dernier = b.contents[b.contents.length - 1], texte = (dernier.parts[0] || {}).text || '', fr = dernier.parts[0] && dernier.parts[0].functionResponse;
    if (fr) { const res = fr.response.resultat; const prix = res.prix, nom = res.nom || res.actif; await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: `${nom} vaut ${prix} dollars, ${res.positionMa200} de sa MA200 (${res.ecartMa200Pct} pour cent). Tendance Daily ${res.tendanceDaily} (contexte : ${b.contents.length} messages).\n---DETAIL---\n- Prix : ${prix}\n- MA200 : ${res.ma200}\n- Régime : ${(res.regime || {}).type}` }] }); return true; }
    if (/point sur l.or/i.test(texte)) { await rep(200, { model: 'gemini-2.5-flash', parts: [{ functionCall: { name: 'prix_et_tendance', args: { actif: 'or', unite: 'H4' } } }] }); return true; }
    if (/et en h4/i.test(texte)) { await rep(200, { model: 'gemini-2.5-flash', parts: [{ functionCall: { name: 'prix_et_tendance', args: { actif: 'or', unite: 'H4' } } }] }); return true; }
    await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: 'Napoléon Bonaparte est né en 1769 en Corse et il est devenu empereur des Français en 1804.' }] }); return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
const poser = async q => { const n = tts.length, t0 = Date.now(); await p.evaluate(q2 => { VoixMoteurs.razLimiteurGem && VoixMoteurs.razLimiteurGem(); const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = q2; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }, q); await attendre(() => tts.length > n, 25000); await w(2500); if (process.env.DEBUG) console.log('  (' + (Date.now() - t0 - 2500) + ' ms)', q); return tts.length - n; };
const journal = () => p.evaluate(() => document.getElementById('log') ? document.getElementById('log').innerText : document.body.innerText);
await w(2500);
verif(await p.evaluate(() => !!window.Cerveau && Cerveau.dispo()), 'le cerveau est branché et disponible (code d’accès présent)');
let n = await poser('Rayle, fais-moi un point sur l’or');
const J1 = await journal(); if (process.env.DEBUG) console.log('JOURNAL', J1.slice(-900), 'req', requetes.length, 'dispo', await p.evaluate(() => Cerveau.dispo()));
verif(n === 1, 'point sur l’or : UNE seule requête vocale (' + n + ')');
verif(requetes.length === 2, 'deux tours avec le modèle : question → outil → réponse (' + requetes.length + ')');
verif(requetes[0].outils.some(o => o.name === 'prix_et_tendance') && requetes[0].outils.length >= 9, 'les 9 outils sont déclarés au modèle : ' + requetes[0].outils.map(o => o.name).join(','));
verif(/Rayle, l.assistante de trading experte/.test(requetes[0].system) && /n.inventes jamais un chiffre/.test(requetes[0].system), 'consigne de personnalité envoyée');
const prixAffiche = String(Math.round(ref.prix));
verif(J1.includes(prixAffiche) || J1.replace(/[\s  ]/g, '').includes(prixAffiche), 'la réponse affichée contient le VRAI prix de l’or de l’application (' + ref.prix + ')');
verif(!/aucune donn|pas d.acc/i.test(J1.split('point sur l')[1] || ''), 'pas de « aucune donnée » ni de « pas d’accès »');
verif(/Outils : prix_et_tendance/.test(J1), 'la trace des outils appelés est affichée');
verif(/Prix : /.test(J1), 'le détail complet reste à l’écran');
verif(tts[0] && !/---DETAIL---/.test(tts[0].text) && !/MA200 : /.test(tts[0].text) && /vaut/.test(tts[0].text), 'la voix lit seulement le résumé : ' + (tts[0] && tts[0].text.slice(0, 80)));
/* mémoire : « et en H4 ? » */
requetes = []; n = await poser('Et en H4 ?');
verif(requetes.length >= 1 && requetes[0].contents.length >= 3 && /Sujet en cours.*or/.test(requetes[0].system), 'mémoire de conversation : le contexte précédent et le sujet « or » sont renvoyés (' + requetes[0].contents.length + ' messages)');
/* question générale */
requetes = []; n = await poser('Qui était Napoléon Bonaparte ?');
verif(n === 1 && requetes.length === 1, 'question générale : un seul tour, sans outil');
/* panne / quota : message clair + lecture locale des vrais chiffres, jamais « aucune donnée » */
panneCerveau = { statut: 429, msg: 'Gemini indisponible : gemini-2.5-flash : quota (429)', quota: true }; n = await poser('Rayle, fais-moi un point sur l’or'); const J2 = await journal();
verif(/limite gratuite/.test(J2), 'quota atteint : message clair dans le journal');
verif(/Je te donne la lecture directe des données/.test(J2) && /dollars/.test(J2.split('lecture directe')[1] || ''), 'quota atteint : lecture directe des chiffres de l’or, sans IA');
verif(n === 1, 'quota atteint : la lecture locale est quand même dite (une requête vocale)');
await fin();
