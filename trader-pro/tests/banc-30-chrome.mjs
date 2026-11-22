/* Banc d'essai v8 : 30 questions (tests/rayle-questions.md). Chrome, un seul navigateur à la fois. Le modèle Gemini est simulé par un routeur qui appelle les outils comme le ferait le vrai modèle ;
   les outils, fenêtres, voix, panneaux et Wikipédia sont réels (données de production). Par partie pour ménager la mémoire : 1 = Q1-8 (terminal, COT, volume, Mes actifs) · 2 = Q9-15 · 3 = Q16-30 (générales et enchaînées).
   Usage : node trader-pro/tests/banc-30-chrome.mjs [1|2|3] [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const PARTIE = +(process.argv[2] || 1), mode = process.argv[3] || 'tablette', SANS = process.env.SANS_FENETRES === '1';   // SANS_FENETRES=1 : le routeur n'ouvre aucune fenêtre (contrôle voix, chiffres, images, enchaînements) ; les fenêtres sont contrôlées par pilotage-chrome.mjs
const pcm = Buffer.alloc(24000 * 2 * 2); const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const ref = async id => (await (await fetch('https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/pro-' + id + '.json')).json());
const PRIX = { or: (await ref('or')).prix, btc: (await ref('btc')).prix };
const GENERAL = { 'ciel': 'Le ciel est bleu parce que l’atmosphère diffuse davantage la lumière bleue du Soleil.', 'revolution': 'La Révolution française commence en 1789.', '17 fois 23': '17 fois 23 font 391.' };
/* « modèle » simulé : question → appels d'outils */
const dernier = { actif: null, outil: null };
function routeur(texte, systeme) {
  const t = texte.toLowerCase(); const act = /\bor\b|gold/.test(t) ? 'or' : /bitcoin|btc/.test(t) ? 'btc' : /nasdaq/.test(t) ? 'us100' : null;
  const suj = (/Sujet en cours[^:]*: (\w+)/.exec(systeme) || [])[1] || null;
  const unite = /daily|jour\b/.test(t) ? 'J' : /h4/.test(t) ? 'H4' : undefined;
  const enchaine = /^(et |puis )/.test(t.trim());
  const a = act || (enchaine ? suj || dernier.actif : null);
  let R = null;
  if (/point sur l.or/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'terminal', actif: 'or', unite: 'H4', mode: 'classique' }], ['prix_et_tendance', { actif: 'or', unite: 'H4' }]];
  else if (/o[uù] en est le bitcoin|bitcoin en daily/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'terminal', actif: 'btc', unite: 'J' }], ['prix_et_tendance', { actif: 'btc', unite: 'J' }]];
  else if (/nasdaq est au-dessus/.test(t)) R = [['prix_et_tendance', { actif: 'us100', unite: 'H4' }]];
  else if (/niveaux importants/.test(t)) R = [['niveaux', { actif: 'or' }]];
  else if (/weekly/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'terminal', actif: 'or', mode: 'volume', onglet: 'htf' }], ['niveaux', { actif: 'or' }]];
  else if (/mode volume/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'terminal', mode: 'volume' }]];
  else if (/rapport cot/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'marches', section: 'cot', actif: 'or' }], ['marches', { actif: 'or' }]];
  else if (/bitcoin est cher/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'invest', section: 'mesactifs', actif: 'btc' }], ['mes_actifs', { actif: 'btc' }]];
  else if (/me couvrir/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'couverture', actif: 'or', sens: 'achat' }], ['couverture', { actif: 'or', sens: 'achat' }]];
  else if (/mon risque/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'portefeuille', section: 'risque' }], ['portefeuille_et_risque', {}]];
  else if (/annonces/.test(t)) R = [['ouvrir_fenetre', { fenetre: 'marches', section: 'aujourdhui' }], ['marches', {}]];
  else if (/volume sur le bitcoin/.test(t)) R = [['carnet_et_volume', { actif: 'btc' }]];
  else if (/donn[ée]es .*[àa] jour/.test(t)) R = [['etat_des_donnees', {}]];
  else if (/briefing/.test(t)) R = [['marches', {}], ['prix_et_tendance', { actif: 'or', unite: 'H4' }]];
  else if (/napol[ée]on/.test(t)) R = [['afficher_images', { sujet: 'Napoléon Bonaparte' }]];
  else if (/jules c[ée]sar/.test(t)) R = [['afficher_images', { sujet: 'Jules César' }]];
  else if (/tour eiffel/.test(t)) R = [['afficher_images', { sujet: 'tour Eiffel' }]];
  else if (/mars/.test(t)) R = [['afficher_images', { sujet: 'planète Mars' }]];
  else if (/lion/.test(t)) R = [['afficher_images', { sujet: 'lion' }]];
  else if (enchaine && /cot/.test(t) && a) R = [['marches', { actif: a }]];
  else if (enchaine && a) R = [['prix_et_tendance', { actif: a, unite: unite || 'H4' }]];
  if (R && SANS) R = R.filter(([n]) => n !== 'ouvrir_fenetre');
  if (R && !R.length) R = null;
  if (R) for (const [n, args] of R) if (args.actif) dernier.actif = args.actif;
  return R;
}
const chiffre = x => (Number.isFinite(x) ? String(x) : '?');
function composer(frs) {
  const L = []; for (const p of frs) { const n = p.functionResponse.name, r = p.functionResponse.response.resultat;
    if (r.indisponible) { L.push('La donnée « ' + n + ' » est indisponible : ' + r.indisponible + '.'); continue; }
    if (n === 'prix_et_tendance') L.push(`${r.nom} : ${chiffre(r.prix)} dollars, ${r.positionMa200} de la MA200 ${r.unite} (${chiffre(r.ma200)}, écart ${chiffre(r.ecartMa200Pct)} pour cent), tendance Daily ${r.tendanceDaily}, H4 ${r.tendanceH4}.`);
    else if (n === 'niveaux') L.push(`Niveaux : ${(r.reperesIct || []).slice(0, 4).map(x => x.nom + ' ' + x.prix).join(', ')} ; POC ${r.volume && r.volume.pocH4} ; ${(r.bougiesWeekly || []).length} bougies Weekly.`);
    else if (n === 'marches') L.push(`Marchés : ${(r.actualites || []).length ? r.actualites[0].titre : 'pas d’actualité'} ; ${Array.isArray(r.annoncesDuJour) && r.annoncesDuJour.length ? r.annoncesDuJour.length + ' annonces' : 'aucune annonce forte aujourd’hui'} ; ${r.cot ? r.cot.lecture || '' : ''}`.slice(0, 300));
    else if (n === 'mes_actifs') L.push(`${r.nom} : ${r.horizons.map(h => h.horizon + ' ' + h.verdict).join(', ')}.`);
    else if (n === 'carnet_et_volume') L.push(`Volume relatif ${r.volumeH4 && r.volumeH4.volumeRelatifDerniereBougie}, CVD ${r.volumeH4 && r.volumeH4.cvdTendance}.`);
    else if (n === 'etat_des_donnees') L.push(r.resume);
    else if (n === 'couverture') L.push(String(r.couverture || '').slice(0, 220));
    else if (n === 'portefeuille_et_risque') L.push(String(r.risque || r.portefeuille || '').slice(0, 220));
    else if (n === 'afficher_images') L.push(r.ok ? 'Voici ' + r.titre + '. ' + (r.resume || '').slice(0, 140) : 'Je n’ai pas trouvé d’image libre.');
    else if (n === 'ouvrir_fenetre') L.push(r.ok ? '' : 'L’ouverture de la fenêtre a échoué : ' + r.raison + '.');
  } return (L.filter(Boolean).join(' ') || 'C’est fait.') + ' Question ' + (++nonce) + '.'; }
let tts = [], requetes = [], nonce = 0;
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v8', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_voix_gemini_v1: { moteur: 'gemini-f1', ton: 'naturel', vitesse: 0 }, rayle_voix_v9: '1', rayle_piper_precharge: '0', rayle_donnees_base: '' }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  const rep = (statut, corps) => r.respond({ status: statut, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { tts.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  if (u.endsWith('/cerveau')) {
    const b = JSON.parse(r.postData() || '{}'); requetes.push(b); const dern = b.contents[b.contents.length - 1], frs = dern.parts.filter(p => p.functionResponse);
    if (frs.length) { await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: composer(frs) + '\n---DETAIL---\nDétail à l’écran.' }] }); return true; }
    const texte = (dern.parts[0] || {}).text || '', R = routeur(texte, b.system);
    if (R) { await rep(200, { model: 'gemini-2.5-flash', parts: R.map(([name, args]) => ({ functionCall: { name, args } })) }); return true; }
    const g = Object.entries(GENERAL).find(([k]) => texte.toLowerCase().includes(k)); await rep(200, { model: 'gemini-2.5-flash', parts: [{ text: g ? g[1] : 'Voici ma réponse à ta question.' }] }); return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
await p.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) { /* */ } });
await w(2500);
await p.evaluate(() => {
  window.__ss = 0; window.__max = 0; window.__en = new Set();
  try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ }
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const el = this; if (!el.__esp) { el.__esp = 1; el.addEventListener('playing', () => { window.__en.add(el); window.__max = Math.max(window.__max, window.__en.size); }); ['ended', 'pause', 'emptied'].forEach(e => el.addEventListener(e, () => window.__en.delete(el))); } return play.call(el); };
});
const journalFin = () => p.evaluate(() => document.getElementById('log').innerText);
const poser = async q => { const n = tts.length, nr = requetes.length, j0 = (await journalFin()).length; await p.evaluate(q2 => { VoixMoteurs.razLimiteurGem && VoixMoteurs.razLimiteurGem(); const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = q2; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }, q); await attendre(() => tts.length > n, 240000); await w(1800); const j = (await journalFin()).slice(j0); return { voix: tts.length - n, nr: requetes.length - nr, journal: j, dernierTts: (tts[tts.length - 1] || {}).text || '' }; };
const clic = f => p.evaluate(f);
const termOk = (actif, unite, mode) => attendre(() => termOk1(actif, unite, mode), 120000);
const termOk1 = (actif, unite, mode) => p.evaluate((a, u, m) => { const f = document.querySelector('iframe.tr-or'); try { const d = f.contentDocument; return new RegExp(a, 'i').test(d.querySelector('.tor-titre b').textContent) && (!u || d.querySelector('[data-periode="' + u + '"]').getAttribute('aria-pressed') === 'true') && (!m || d.querySelector('.tp-mode [data-mode="' + m + '"]').getAttribute('aria-pressed') === 'true'); } catch (e) { return false; } }, actif, unite, mode);
const gen = (r, q) => { verif(r.voix === 1, q + ' · V : une seule requête vocale (' + r.voix + ')'); verif(!/aucune donn|pas d.acc/i.test(r.journal), q + ' · N : pas de « aucune donnée »'); };
const galerie = () => p.evaluate(() => { const g = document.getElementById('ra-galerie'); return g && !g.hidden ? { mini: g.querySelectorAll('.rg-mini button').length, lic: (g.querySelector('.rg-leg small') || {}).textContent || '', dates: [...g.querySelectorAll('.rg-dates li')].map(l => l.textContent) } : null; });
const px = (r, v) => r.journal.split("").filter(c => /[0-9]/.test(c)).join("").includes(String(Math.floor(v)).slice(0, 3));

if (PARTIE === 1) {
  let r = await poser('Rayle, fais-moi un point sur l’or'); gen(r, 'Q1'); verif(px(r, PRIX.or), 'Q1 · C : vrai prix de l’or (' + PRIX.or + ') ' + r.journal.slice(-260)); verif(SANS || await termOk('^Or', 'H4', 'classique'), 'Q1 · F : Terminal sur l’or en H4, Classique');
  r = await poser('Où en est le Bitcoin en Daily ?'); gen(r, 'Q2'); verif(px(r, PRIX.btc), 'Q2 · C : vrai prix du Bitcoin (' + PRIX.btc + ')'); verif(SANS || await termOk('Bitcoin', 'J'), 'Q2 · F : Terminal sur le Bitcoin, Jour');
  r = await poser('Est-ce que le Nasdaq est au-dessus de sa MA200 ?'); gen(r, 'Q3'); verif(/MA200/.test(r.journal) && /(au-dessus|sous)/.test(r.journal) && /écart -?\d/.test(r.journal), 'Q3 · C : position par rapport à la MA200 avec l’écart');
  r = await poser('Quels sont les niveaux importants sur l’or ?'); gen(r, 'Q4'); verif(/PDH \d/.test(r.journal) && /POC \d/.test(r.journal), 'Q4 · C : PDH et POC chiffrés');
  r = await poser('Montre-moi les bougies Weekly sur l’or'); gen(r, 'Q5'); verif(SANS || await attendre(() => p.evaluate(() => { try { const d = document.querySelector('iframe.tr-or').contentDocument; return d.querySelector('.tp-mode [data-mode="volume"]').getAttribute('aria-pressed') === 'true' && d.querySelector('.tpv [data-onglet="ict"]').getAttribute('aria-selected') === 'true'; } catch (e) { return false; } }), 120000), 'Q5 · F : Terminal Volume, onglet Bougies HTF'); verif(/4 bougies Weekly/.test(r.journal), 'Q5 · C : 4 bougies Weekly');
  r = await poser('Passe en mode volume'); gen(r, 'Q6'); verif(SANS || await termOk('.', null, 'volume'), 'Q6 · F : mode Volume');
  r = await poser('Montre-moi le rapport COT de l’or'); gen(r, 'Q7'); verif(SANS || await attendre(() => p.evaluate(() => { const b = document.querySelector('#marches-fenetre [data-onglet="cot"]'), a = document.querySelector('#marches-fenetre [data-actif="or"]'); return b && b.getAttribute('aria-selected') === 'true' && a && a.getAttribute('aria-pressed') === 'true'; }), 25000), 'Q7 · F : Marchés, COT, or');
  r = await poser('Est-ce que le Bitcoin est cher ?'); gen(r, 'Q8'); verif(SANS || await attendre(() => p.evaluate(() => !!document.querySelector('[data-ma-actif="btc"]')), 25000), 'Q8 · F : Mes actifs, carte Bitcoin'); verif(/1–10 jours/.test(r.journal) && /(attractif|cher|Neutre)/i.test(r.journal), 'Q8 · C : verdicts par horizon ' + r.journal.slice(-260));
}
if (PARTIE === 2) {
  let r = await poser('Comment me couvrir si j’achète de l’or ?'); gen(r, 'Q9'); verif(SANS || await attendre(() => p.evaluate(() => { const s = document.querySelector('form[data-form] select[name="actif"]'); return s && /XAU/i.test(s.value); }), 25000), 'Q9 · F : Couverture, or');
  r = await poser('Quel est mon risque aujourd’hui ?'); gen(r, 'Q10'); verif(SANS || await attendre(() => p.evaluate(() => { const b = document.querySelector('.tp-nav [data-onglet="risque"]'); return b && b.getAttribute('aria-selected') === 'true'; }), 25000), 'Q10 · F : Portefeuille, Risque global'); verif(r.journal.length > 40, 'Q10 · C : réponse chiffrée ou raison précise');
  r = await poser('Quelles annonces aujourd’hui ?'); gen(r, 'Q11'); verif(SANS || await attendre(() => p.evaluate(() => { const b = document.querySelector('#marches-fenetre [data-onglet="aujourdhui"]'); return b && b.getAttribute('aria-selected') === 'true'; }), 25000), 'Q11 · F : Marchés, Aujourd’hui'); verif(/annonce/i.test(r.journal), 'Q11 · C : annonces ou « aucune annonce forte »');
  r = await poser('Quel est le volume sur le Bitcoin ?'); gen(r, 'Q12'); verif(/Volume relatif \d/.test(r.journal), 'Q12 · C : volume relatif chiffré');
  r = await poser('Mes données sont-elles à jour ?'); gen(r, 'Q13'); verif(/(à jour|retard|pas tout|Oui|Non)/i.test(r.journal), 'Q13 · C : état des sources');
  r = await poser('Donne-moi le briefing du jour'); gen(r, 'Q14'); verif(/dollars/.test(r.journal), 'Q14 · C : mouvements chiffrés');
  const dess = await p.evaluate(() => Object.keys(localStorage).filter(k => /dessins|niveaux_traces|rayle_pf_/.test(k)).map(k => k + localStorage.getItem(k).length).join());
  await p.evaluate(() => { const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = 'Ferme ça'; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }); await w(3000);
  verif(SANS || await p.evaluate(() => !document.querySelector('#marches-fenetre') && !document.querySelector('.tp-nav [data-onglet]')), 'Q15 · F : « Ferme ça » ferme la fenêtre'); verif(SANS || await p.evaluate(k => Object.keys(localStorage).filter(x => /dessins|niveaux_traces|rayle_pf_/.test(x)).map(x => x + localStorage.getItem(x).length).join() === k, dess), 'Q15 · aucune donnée de Justin modifiée');
}
if (PARTIE === 3) {
  const images = [['Qui était Napoléon Bonaparte ?', 'Q16', true], ['Qui était Jules César ?', 'Q17', true], ['Parle-moi de la tour Eiffel', 'Q18', false], ['C’est quoi Mars ?', 'Q19', false], ['Raconte-moi ce qu’est un lion', 'Q20', false]];
  for (const [q, n, personne] of images) { await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; }); const r = await poser(q); await attendre(() => p.evaluate(() => { const g = document.getElementById('ra-galerie'); return g && !g.hidden; }), 20000); const G = await galerie(); gen(r, n); verif(G && G.mini >= 3 && /^(CC|Public|Domaine|GFDL|Attribution|PD)/i.test(G.lic), n + ' · I : panneau d’images avec licence (' + (G ? G.mini + ' images, ' + G.lic.slice(0, 30) : 'absent') + ')'); if (personne) verif(G && G.dates.some(d => /Naissance/.test(d)), n + ' · I : dates clés'); await w(9000); }
  await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; }); let r = await poser('Montre-moi la Joconde'); gen(r, 'Q21'); await w(1500); verif(!!(await galerie()), 'Q21 · I : panneau pour « Montre-moi la Joconde »'); await w(9000);
  for (const [q, n] of [['Pourquoi le ciel est-il bleu ?', 'Q22'], ['En quelle année a eu lieu la Révolution française ?', 'Q23'], ['Combien font 17 fois 23 ?', 'Q24']]) { await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; }); r = await poser(q); gen(r, n); verif(!(await galerie()), n + ' · I : pas de panneau pour une question sans sujet à illustrer'); }
  await p.evaluate(() => { const g = document.getElementById('ra-galerie'); if (g) g.hidden = true; }); r = await poser('Montre-moi xqzvbnmwk'); gen(r, 'Q25'); verif(!(await galerie()), 'Q25 · I : aucun panneau vide'); await w(9000);
  r = await poser('Rayle, fais-moi un point sur l’or'); const nr0 = requetes.length;
  r = await poser('Et en H4 ?'); gen(r, 'Q26'); verif(requetes.length > nr0 && requetes[nr0].contents.length >= 3 && /Sujet en cours.*or/.test(requetes[nr0].system), 'Q26 · mémoire : le contexte et le sujet « or » sont renvoyés'); verif(/H4/.test(r.journal), 'Q26 · C : réponse en H4');
  r = await poser('Et en Daily ?'); gen(r, 'Q27'); verif(/MA200 J/.test(r.journal), 'Q27 · C : réponse en Daily');
  r = await poser('Et le Bitcoin ?'); gen(r, 'Q28'); verif(px(r, PRIX.btc), 'Q28 · C : le sujet passe au Bitcoin, vrai prix (' + PRIX.btc + ')');
  r = await poser('Et son COT ?'); gen(r, 'Q29'); verif(/Marchés/.test(r.journal), 'Q29 · C : COT du Bitcoin demandé au bon sujet : ' + JSON.stringify(requetes[requetes.length - 2] && requetes[requetes.length - 2].system.match(/Sujet en cours[^\n]*/)));
  await p.evaluate(() => { const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = 'Retour à l’accueil'; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }); await w(2500);
  verif(SANS || await p.evaluate(() => !document.querySelector('#marches-fenetre') && !document.querySelector('iframe.tr-or') || (window.Application && window.Application.etat().index === 0)), 'Q30 · F : retour à l’accueil');
}
verif(await p.evaluate(() => window.__ss === 0), 'aucun appel à speechSynthesis.speak pendant tout le banc');
verif(await p.evaluate(() => window.__max <= 1), 'jamais deux lectures en même temps (max ' + await p.evaluate(() => window.__max) + ')');
await fin();
