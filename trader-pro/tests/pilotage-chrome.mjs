/* Test Chrome v8 phase 3 : Rayle ouvre et règle les fenêtres, anime ses réponses (étiquettes de chiffres clés, texte au rythme de la voix) et surligne ce dont elle parle.
   Le modèle est simulé (il appelle les outils d'action et de lecture) ; les outils et les fenêtres sont réels, sur les données de production. Un seul navigateur. Usage : node trader-pro/tests/pilotage-chrome.mjs [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const mode = process.argv[2] || 'tablette';
const pcm = Buffer.alloc(24000 * 2 * 3); const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const SCENARIOS = [   // question → appels de fonctions décidés par le « modèle »
  [/point sur l.or/i, [['ouvrir_fenetre', { fenetre: 'terminal', actif: 'or', unite: 'H4', mode: 'classique' }], ['prix_et_tendance', { actif: 'or', unite: 'H4' }]], 'terminal'],
  [/rapport cot/i, [['ouvrir_fenetre', { fenetre: 'marches', section: 'cot', actif: 'or' }], ['marches', { actif: 'or' }]], 'cot'],
  [/mode volume|weekly/i, [['ouvrir_fenetre', { fenetre: 'terminal', actif: 'or', mode: 'volume', onglet: 'htf' }], ['niveaux', { actif: 'or' }]], 'htf'],
  [/bitcoin est cher/i, [['ouvrir_fenetre', { fenetre: 'invest', section: 'mesactifs', actif: 'btc' }], ['mes_actifs', { actif: 'btc' }]], 'mesactifs'],
  [/me couvrir/i, [['ouvrir_fenetre', { fenetre: 'couverture', actif: 'or', sens: 'achat' }], ['couverture', { actif: 'or', sens: 'achat' }]], 'couverture'],
  [/mon risque/i, [['ouvrir_fenetre', { fenetre: 'portefeuille', section: 'risque' }], ['portefeuille_et_risque', {}]], 'risque'],
  [/annonces/i, [['ouvrir_fenetre', { fenetre: 'marches', section: 'aujourdhui' }], ['marches', {}]], 'annonces']
];
const requetes = []; let tts = [];
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v8', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_voix_gemini_v1: { moteur: 'gemini-f1', ton: 'naturel', vitesse: 0 }, rayle_voix_v9: '1', rayle_piper_precharge: '0', rayle_donnees_base: '' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  const rep = (statut, corps) => r.respond({ status: statut, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { tts.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  if (u.endsWith('/cerveau')) {
    const b = JSON.parse(r.postData() || '{}'); requetes.push(b); const dernier = b.contents[b.contents.length - 1];
    const frs = dernier.parts.filter(p => p.functionResponse);
    if (frs.length) { const acts = frs.map(p => p.functionResponse.name + ':' + (p.functionResponse.response.resultat.ok === false ? 'ECHEC ' + p.functionResponse.response.resultat.raison : 'ok')); await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: 'C’est fait, voici la lecture. Actions : ' + acts.join(', ') + '.\n---DETAIL---\n' + JSON.stringify(frs.map(p => p.functionResponse.response.resultat)).slice(0, 300) }] }); return true; }
    const texte = (dernier.parts[0] || {}).text || '', sc = SCENARIOS.find(s => s[0].test(texte));
    if (sc) { await rep(200, { model: 'gemini-2.5-flash', parts: sc[1].map(([name, args]) => ({ functionCall: { name, args } })) }); return true; }
    await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: 'D’accord.' }] }); return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin, capture } = T;
const poser = async q => { const t0 = Date.now(), n = tts.length; await p.evaluate(q2 => { VoixMoteurs.razLimiteurGem && VoixMoteurs.razLimiteurGem(); const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = q2; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }, q); await attendre(() => tts.length > n, 240000); if (process.env.DEBUG) console.log('  (' + Math.round((Date.now() - t0) / 1000) + ' s jusqu’à la voix)', q); await w(1500); };
const PARTIE = +(process.argv[3] || 0), dans = n => !PARTIE || PARTIE === n;   // partie 1 : terminal, COT, volume ; partie 2 : Mes actifs, couverture, risque, annonces, fermeture
await p.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) { /* */ } });   // le terminal pro ne se monte pas sous automatisation sauf ?hj=1 : on masque l'automatisation pour le cadre

await w(2500);
const J = () => p.evaluate(() => document.getElementById('log').innerText);

if (dans(1)) {
/* 1) point sur l'or → terminal sur l'or en H4, puis réponse animée avec chiffres clés et MA200 qui pulse */
await poser('Rayle, fais-moi un point sur l’or'); if (process.env.DEBUG) console.log('J', (await J()).slice(-900), 'req', requetes.length);
verif(await attendre(() => p.evaluate(() => { const f = document.querySelector('iframe.tr-or'); try { return /Or/.test(f.contentDocument.querySelector('.tor-titre b').textContent) && f.contentDocument.querySelector('[data-periode="H4"]').getAttribute('aria-pressed') === 'true'; } catch (e) { return false; } }), 90000), 'point sur l’or : le Terminal est ouvert sur l’or en H4');
let A1 = await p.evaluate(() => window.ReponseAnim.etat());   // les étiquettes restent dans le panneau même rangé : on contrôle leur présence if (process.env.DEBUG) console.log('A1', JSON.stringify(A1), (await J()).slice(-700));
verif(A1.etiquettes >= 3, 'réponse animée : panneau visible avec ' + A1.etiquettes + ' étiquettes de chiffres clés (prix, MA200, tendance)');
verif(await p.evaluate(() => [...document.querySelectorAll('#ra-panneau .ra-chip small')].some(s => /MA200/.test(s.textContent)) && /\d/.test((document.querySelector('#ra-panneau .ra-chip b') || {}).getAttribute('data-v') || '')), 'étiquette « MA200 » avec sa valeur');
await w(1500); const typed = await p.evaluate(() => document.querySelector('#ra-panneau .ra-texte').textContent.length);
verif(typed > 0, 'le texte s’écrit dans le panneau (' + typed + ' caractères à cet instant)');
verif(await attendre(() => p.evaluate(() => { const f = document.querySelector('iframe.tr-or'); try { return !!f.contentDocument.querySelector('.ra-ligne'); } catch (e) { return false; } }), 60000), 'la ligne de la MA200 est surlignée et pulse dans le graphique');
if (process.env.DEBUG) console.log('ETATTERM', JSON.stringify(await p.evaluate(() => { const f = document.querySelector('iframe.tr-or'); if (!f) return 'pas de cadre'; try { const d = f.contentDocument; return { titre: (d.querySelector('.tor-titre b') || {}).textContent, prix: (d.querySelector('[data-or-prix]') || {}).textContent, per: [...d.querySelectorAll('[data-periode]')].map(b => b.dataset.periode + ':' + b.getAttribute('aria-pressed')).join(' '), pro: !!f.contentWindow.__orPro, src: f.contentWindow.location.href }; } catch (e) { return 'ERR ' + e.message; } })));
await capture('pilotage-1-or'); if (process.env.SEUL) await fin();
}
if (dans(1)) {
/* 2) COT de l'or → Marchés, section COT, or */
await w(2500); await poser('Montre-moi le rapport COT de l’or');
verif(await attendre(() => p.evaluate(() => { const b = document.querySelector('#marches-fenetre [data-onglet="cot"]'), a = document.querySelector('#marches-fenetre [data-actif="or"]'); return b && b.getAttribute('aria-selected') === 'true' && a && a.getAttribute('aria-pressed') === 'true'; }), 20000), 'COT de l’or : Marchés ouvert, section COT, actif or sélectionné');
}
if (dans(1)) {
/* 3) mode volume + bougies Weekly */
await poser('Passe en mode volume et montre les bougies Weekly');
verif(await attendre(() => p.evaluate(() => { const f = document.querySelector('iframe.tr-or'); try { const d = f.contentDocument; return d.querySelector('.tp-mode [data-mode="volume"]').getAttribute('aria-pressed') === 'true' && d.querySelector('.tpv [data-onglet="ict"]').getAttribute('aria-selected') === 'true'; } catch (e) { return false; } }), 40000), 'Terminal en mode Volume, onglet « Bougies HTF / ICT »');
}
if (dans(2)) {
/* 4) Bitcoin cher ? → Mes actifs, carte Bitcoin */
await poser('Est-ce que le Bitcoin est cher ?');
verif(await attendre(() => p.evaluate(() => !!document.querySelector('[data-ma-actif="btc"]')), 25000), 'Bitcoin cher ? : Investissement → Mes actifs, carte Bitcoin présente');
verif(await attendre(() => p.evaluate(() => document.querySelector('[data-ma-actif="btc"]').classList.contains('ra-surligne')), 10000), 'la carte Bitcoin est mise en évidence');
}
if (dans(2)) {
/* 5) couverture */
await poser('Comment me couvrir si j’achète de l’or ?');
verif(await attendre(() => p.evaluate(() => { const s = document.querySelector('form[data-form] select[name="actif"]'); return s && /XAU/i.test(s.value); }), 25000), 'couverture : fenêtre Couverture avec l’or');
}
if (dans(2)) {
/* 6) risque */
await poser('Quel est mon risque aujourd’hui ?');
verif(await attendre(() => p.evaluate(() => { const b = document.querySelector('.tp-nav [data-onglet="risque"]'); return b && b.getAttribute('aria-selected') === 'true'; }), 20000), 'risque : Portefeuille → Risque global');
}
if (dans(2)) {
/* 7) annonces */
await poser('Quelles annonces aujourd’hui ?');
verif(await attendre(() => p.evaluate(() => { const b = document.querySelector('#marches-fenetre [data-onglet="aujourdhui"]'); return b && b.getAttribute('aria-selected') === 'true'; }), 20000), 'annonces : Marchés → Aujourd’hui (calendrier)');
}
if (dans(2)) {
/* 8) annulables à la voix, sans modifier les données */
const dessinsAvant = await p.evaluate(() => Object.keys(localStorage).filter(k => /dessins|niveaux_traces|rayle_pf_/.test(k)).map(k => k + localStorage.getItem(k).length).join());
await p.evaluate(() => { const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = 'Ferme ça'; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }); await w(2500);
verif(await attendre(() => p.evaluate(() => !document.querySelector('#marches-fenetre') && !document.querySelector('.tp-nav [data-onglet]')), 20000), '« Ferme ça » : la fenêtre se ferme');
verif(await p.evaluate(k => Object.keys(localStorage).filter(x => /dessins|niveaux_traces|rayle_pf_/.test(x)).map(x => x + localStorage.getItem(x).length).join() === k, dessinsAvant), 'aucun dessin, niveau ni donnée de Justin modifié');
verif(requetes.every(r => r.outils.some(o => o.name === 'ouvrir_fenetre') && r.outils.some(o => o.name === 'fermer_fenetre')), 'les outils d’action sont déclarés au modèle');
}
await fin();
