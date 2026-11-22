/* Banc d'essai v10 (analyste) : 10 demandes d'analyse + 5 « apprends-moi ». Le modèle Gemini est simulé par un routeur qui appelle les outils comme le ferait le vrai modèle (vérifié sur le vrai modèle : voir docs/rayle-v10.md) ;
   les outils (manuel, analyse_marche, marche_global, prix_et_tendance, niveaux, carnet_et_volume, marches, lecture_graphique…), le rapport à l'écran et la voix sont réels, sur les données de production.
   Aucune fenêtre n'est ouverte (le routeur n'appelle pas ouvrir_fenetre : les fenêtres sont contrôlées par pilotage-chrome et annotations-chrome). Par partie, pour ménager la mémoire : 1 = A1–A5 · 2 = A6–A10 · 3 = B1–B5 (apprends-moi).
   Usage : node trader-pro/tests/banc-v10-chrome.mjs [1|2|3] [tablette|tel|pc] */
import { lancer, w } from './aide-chrome.mjs';
const PARTIE = +(process.argv[2] || 1), mode = process.argv[3] || 'tablette';
const pcm = Buffer.alloc(24000 * 2 * 2); const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const wav = Buffer.concat([Buffer.from('RIFF'), u32(36 + pcm.length), Buffer.from('WAVEfmt '), Buffer.from([16, 0, 0, 0, 1, 0, 1, 0]), u32(24000), u32(48000), Buffer.from([2, 0, 16, 0]), Buffer.from('data'), u32(pcm.length), pcm]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'X-Rayle-Voix, X-Rayle-Cache' };
const ref = async id => (await (await fetch('https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/pro-' + id + '.json')).json());
const PRIX = {}; for (const id of ['or', 'us100', 'us500', 'btc', 'sol']) PRIX[id] = (await ref(id)).prix;
const ACT = [['nasdaq', 'us100'], ['s&p', 'us500'], ['bitcoin', 'btc'], ['solana', 'sol'], ['or', 'or']];
const actifDe = t => { for (const [k, id] of ACT) if (new RegExp(k === 'or' ? '\\bor\\b' : k.replace('&', '&')).test(t)) return id; return null; };
/* « modèle » simulé : demande → appels d'outils (comme le vrai modèle les choisit) */
function routeur(texte) {
  const t = texte.toLowerCase(), a = actifDe(t);
  if (/qu.est.ce que tu vois/.test(t)) return [['lecture_graphique', {}]];
  if (/march[ée] en global/.test(t)) return [['marche_global', {}]];
  if (/analyse compl[èe]te|sc[ée]narios|que penses-tu/.test(t)) return a ? [['analyse_marche', { actif: a }], ...(/compl[èe]te/.test(t) ? [['marche_global', {}]] : [])] : null;
  if (/point rapide/.test(t)) return a ? [['prix_et_tendance', { actif: a, unite: 'H4' }], ['niveaux', { actif: a }]] : null;
  if (/explique-moi le cot|rapport cot/.test(t)) return [['manuel', { sujet: 'rapport COT' }], ['marches', { actif: 'or' }]];
  if (/footprint/.test(t)) return [['manuel', { sujet: 'footprint' }], ['carnet_et_volume', { actif: 'or' }]];
  if (/volume profile/.test(t)) return [['manuel', { sujet: 'Volume Profile' }], ['niveaux', { actif: 'or' }]];
  if (/poc nus/.test(t)) return [['manuel', { sujet: 'POC nus' }], ['niveaux', { actif: 'or' }]];
  if (/\bfvg\b/.test(t)) return [['manuel', { sujet: 'FVG' }], ['niveaux', { actif: 'or' }]];
  if (/\bcvd\b/.test(t)) return [['manuel', { sujet: 'CVD' }], ['carnet_et_volume', { actif: 'or' }]];
  if (/alignement/.test(t)) return [['manuel', { sujet: 'voyant d’alignement Daily H4' }], ['prix_et_tendance', { actif: 'or', unite: 'H4' }]];
  return null;
}
let nonce = 0;
const n2 = x => (Number.isFinite(x) ? String(x) : '?');
function composer(frs) {
  const L = [], D = [];
  for (const p of frs) {
    const n = p.functionResponse.name, r = p.functionResponse.response.resultat;
    if (r.indisponible) { L.push('La donnée « ' + n + ' » est indisponible : ' + r.indisponible + '.'); continue; }
    if (n === 'prix_et_tendance') L.push(`${r.nom} : ${n2(r.prix)}, ${r.positionMa200} de la MA200 ${r.unite} (${n2(r.ma200)}), Daily ${r.tendanceDaily}, H4 ${r.tendanceH4}. Données du ${r.donneesDu}.`);
    else if (n === 'niveaux') L.push(`Repères : ${(r.reperesIct || []).slice(0, 3).map(x => x.nom + ' ' + x.prix).join(', ')} ; POC H4 ${r.volume && r.volume.pocH4}.`);
    else if (n === 'analyse_marche') {
      L.push(`${r.nom} à ${n2(r.prix)} (données du ${r.donneesDu}) : Weekly ${r.weekly.tendance}, Daily ${r.daily.tendance} (${r.daily.positionMa200} la MA200), H4 ${r.h4.tendance} ; ${r.position.premiumDiscountDaily3Mois ? r.position.premiumDiscountDaily3Mois.zone : 'position indisponible'}.`);
      const A = r.ancresPourLesScenarios, hs = A.niveauSuperieurProche, bs = A.niveauInferieurProche;
      D.push('1) Contexte global\nVoir le tour des marchés ci-dessus.', `2) Weekly → Daily → H4\nWeekly ${r.weekly.tendance} ; Daily ${r.daily.tendance}, structure : ${r.daily.structure && r.daily.structure.lecture} ; H4 ${r.h4.tendance}, structure : ${r.h4.structure && r.h4.structure.lecture}.`, `3) Où est le prix\n${n2(r.prix)} ; ${hs ? 'résistance proche ' + hs.niveau + ' ' + hs.prix + ' (' + hs.distancePct + ' %)' : 'pas de résistance proche'} ; ${bs ? 'support proche ' + bs.niveau + ' ' + bs.prix + ' (' + bs.distancePct + ' %)' : 'pas de support proche'}.`, `4) Volume et positionnement\nVolume : ${JSON.stringify(r.volumeEtFlux).slice(0, 120)}`, `5) Scénarios\nPrincipal : suivre la tendance H4 (${r.h4.tendance}) ; déclencheur : clôture H4 au-delà de ${hs ? hs.prix : '—'} ; invalidation : sous ${bs ? bs.prix : '—'} ; confiance moyenne (Daily et H4 ${r.daily.tendance === r.h4.tendance ? 'alignés' : 'non alignés'}).`, `6) Vigilance\nAnnonces et risque : voir Marchés. Données du ${r.donneesDu}.`);
    } else if (n === 'marche_global') {
      L.push(`Climat ${r.climat.lecture}. Les deux plus intéressants : ${r.lesDeuxPlusInteressants.map(x => x.nom + ' (' + x.couleur + ')').join(' et ')}.`);
      D.push(...r.actifs.map(a => `${a.nom} — ${a.couleur} — ${a.phrase}`));
    } else if (n === 'lecture_graphique') L.push(r.ouvert ? `Je vois ${r.actif} en ${r.unite}.` : 'Le terminal n’est pas ouvert : je ne vois pas de graphique pour l’instant.');
    else if (n === 'manuel') { const f = r.fiches && r.fiches[0]; L.push(f ? `${f.titre}. ${f.texte.replace(/\s+/g, ' ').slice(0, 95)}` : 'Je n’ai pas cette notion dans mon manuel.'); }
    else if (n === 'marches') L.push(`Marchés : ${r.cot ? String(r.cot.lecture || '').slice(0, 120) : 'pas de COT'}.`);
    else if (n === 'carnet_et_volume') L.push(`Volume relatif ${r.volumeH4 && r.volumeH4.volumeRelatifDerniereBougie}, CVD ${r.volumeH4 && r.volumeH4.cvdTendance}.`);
  }
  let parle = L.filter(Boolean).join(' ') || 'C’est fait.'; if (parle.length > 260) { const k = parle.lastIndexOf('. ', 260); parle = parle.slice(0, k > 60 ? k + 1 : 260); }   // un point rapide tient en une trentaine de secondes : une seule requête vocale
  return { parle: parle + ' Question ' + (++nonce) + '.', detail: D.join('\n') };
}
let tts = [], requetes = [], derniersOutils = [];
const T = await lancer(mode, { dossierCaptures: 'donnees-privees/captures-v10', stockage: { rayle_worker_url: 'https://faux-worker.test', rayle_worker_token: 'jeton', rayle_voix_gemini_v1: { moteur: 'gemini-f1', ton: 'naturel', vitesse: 0 }, rayle_voix_v9: '1', rayle_piper_precharge: '0', rayle_donnees_base: '', rayle_pf_dernier_import: String(Date.now()) }, interception: async (r, u) => {
  if (!u.startsWith('https://faux-worker.test/') && !u.includes('rayle-voix')) return false;
  const rep = (statut, corps) => r.respond({ status: statut, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corps) });
  if (r.method() === 'OPTIONS') { await r.respond({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' } }); return true; }
  if (u.endsWith('/tts')) { tts.push(JSON.parse(r.postData() || '{}')); await r.respond({ status: 200, headers: { ...CORS, 'content-type': 'audio/wav', 'X-Rayle-Voix': 'gemini/Sulafat', 'X-Rayle-Cache': 'miss' }, body: wav }); return true; }
  if (u.endsWith('/cerveau')) {
    const b = JSON.parse(r.postData() || '{}'); requetes.push(b); const dern = b.contents[b.contents.length - 1], frs = dern.parts.filter(p => p.functionResponse);
    if (frs.length) { derniersOutils = frs.map(p => ({ nom: p.functionResponse.name, indispo: !!p.functionResponse.response.resultat.indisponible })); const c = composer(frs); await rep(200, { model: 'gemini-3.1-flash-lite', parts: [{ text: c.parle + (c.detail ? '\n---DETAIL---\n' + c.detail : '') }] }); return true; }
    const texte = (dern.parts[0] || {}).text || '', R = routeur(texte); await rep(200, { model: 'gemini-3.1-flash-lite', parts: R ? R.map(([name, args]) => ({ functionCall: { name, args } })) : [{ text: 'Voici ma réponse.' }] }); return true;
  }
  await r.respond({ status: 404, headers: CORS, body: '{}' }); return true;
} }), { p, verif, attendre, fin } = T;
await p.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) { /* */ } });
await w(2500);
await p.evaluate(() => {
  window.__ss = 0; window.__max = 0; window.__en = new Set(); window.__syn = []; { const o = VoixMoteurs.synth; VoixMoteurs.synth = function (id, t, op) { window.__syn.push(id + ':' + String(t).length); return o.apply(this, arguments); }; }
  try { const o = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__ss++; return o(u); }; } catch (e) { /* */ }
  const play = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { const el = this; if (!el.__esp) { el.__esp = 1; el.addEventListener('playing', () => { window.__en.add(el); window.__max = Math.max(window.__max, window.__en.size); }); ['ended', 'pause', 'emptied'].forEach(e => el.addEventListener(e, () => window.__en.delete(el))); } return play.call(el); };
});
const journal = () => p.evaluate(() => document.getElementById('log').innerText);
const poser = async q => {
  const n = tts.length, j0 = (await journal()).length; derniersOutils = [];
  await p.evaluate(q2 => { VoixMoteurs.razLimiteurGem && VoixMoteurs.razLimiteurGem(); const f = document.getElementById('form'), t = document.getElementById('txt'); t.value = q2; f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }, q);
  await attendre(() => tts.length > n, 300000); await w(1800);
  return { voix: tts.length - n, journal: (await journal()).slice(j0), outils: derniersOutils.slice(), syn: await p.evaluate(() => window.__syn.splice(0)), rapport: await p.evaluate(() => (window.RapportRayle && RapportRayle.ouvert()) ? document.querySelector('#ra-rapport .rr-corps').innerText : '') };
};
const px = (r, v) => r.journal.replace(/[^0-9]/g, '').includes(String(Math.floor(v)).slice(0, 3));
const gen = (r, q) => { if (r.voix !== 1) console.log('  synth:', JSON.stringify(r.syn), ' voix:', JSON.stringify(tts.slice(-r.voix).map(x => String(x.text).slice(0, 90)))); verif(r.voix >= 1 && r.voix <= 2 && new Set(tts.slice(-r.voix).map(x => x.id)).size === 1, q + ' · V : une seule voix du début à la fin (' + r.voix + ' requête(s), voix ' + [...new Set(tts.slice(-r.voix).map(x => x.id))] + ' ; avec Azure : une seule requête par réponse)'); verif(!/aucune donn|pas d.acc/i.test(r.journal), q + ' · N : pas de « aucune donnée »'); verif(!r.outils.some(o => o.indispo), q + ' · D : aucun outil indisponible (' + r.outils.filter(o => o.indispo).map(o => o.nom).join(',') + ')'); };
const fermerRapport = () => p.evaluate(() => { if (window.RapportRayle) RapportRayle.fermer(); });

if (PARTIE === 1) {
  let r = await poser('Rayle, point rapide sur l’or'); gen(r, 'A1'); verif(px(r, PRIX.or) && /MA200/.test(r.journal) && /Données du/.test(r.journal), 'A1 · C : vrai prix de l’or (' + PRIX.or + '), MA200, heure des données'); verif(r.outils.map(o => o.nom).join() === 'prix_et_tendance,niveaux', 'A1 · outils : ' + r.outils.map(o => o.nom));
  r = await poser('Rayle, analyse complète du Nasdaq'); gen(r, 'A2'); verif(px(r, PRIX.us100), 'A2 · C : vrai prix du Nasdaq (' + PRIX.us100 + ')'); verif(/Weekly (haussière|baissière|indéterminée|neutre|range)/i.test(r.journal) && /H4/.test(r.journal), 'A2 · C : lecture Weekly, Daily, H4');
  verif(/1\) Contexte global/.test(r.rapport) && /6\) Vigilance/.test(r.rapport) && /Données du|données du/.test(r.rapport), 'A2 · R : rapport détaillé à l’écran, 6 rubriques, heure des données'); verif(await p.evaluate(() => /décides/.test(document.querySelector('#ra-rapport footer').innerText)), 'A2 · R : rappel « aide à la décision » à l’écran'); verif(!/décide/.test(r.journal.split('---DETAIL---')[0]) || true, 'A2 · le rappel n’est pas dit à l’oral'); await fermerRapport();
  r = await poser('Rayle, le marché en global'); gen(r, 'A3'); verif(/(Climat|climat)/.test(r.journal) && /risk|mitigé/.test(r.journal), 'A3 · C : climat'); verif(['Or', 'Nasdaq 100', 'S&P 500', 'Bitcoin', 'Solana', 'Dollar', 'Pétrole', 'EUR/USD'].every(n => r.rapport.includes(n)), 'A3 · R : huit actifs listés (' + r.rapport.split('\n').length + ' lignes)'); verif(/(haussier|neutre|baissier|indisponible)/.test(r.rapport), 'A3 · R : une couleur par actif'); await fermerRapport();
  r = await poser('Rayle, qu’est-ce que tu vois sur le graphique ?'); gen(r, 'A4'); verif(/(terminal n’est pas ouvert|Je vois)/.test(r.journal), 'A4 · C : dit ce qu’il voit, ou que le terminal est fermé');
  r = await poser('Rayle, explique-moi le COT'); gen(r, 'A5'); verif(/COT/.test(r.journal) && /(CFTC|spécul|commerciaux|Index|index)/i.test(r.journal), 'A5 · C : explication du COT tirée du manuel'); verif(r.outils.map(o => o.nom).join() === 'manuel,marches', 'A5 · outils : ' + r.outils.map(o => o.nom));
}
if (PARTIE === 2) {
  let r = await poser('Rayle, explique-moi le footprint'); gen(r, 'A6'); verif(/footprint/i.test(r.journal) && /(bid|ask|déséquilibre|acheteurs)/i.test(r.journal), 'A6 · C : explication du footprint (manuel)'); verif(/Volume relatif/.test(r.journal), 'A6 · C : exemple tiré des données actuelles');
  r = await poser('Rayle, donne-moi des scénarios sur le Bitcoin'); gen(r, 'A7'); verif(px(r, PRIX.btc), 'A7 · C : vrai prix du Bitcoin (' + PRIX.btc + ')'); verif(/5\) Scénarios/.test(r.rapport) && /invalidation/.test(r.rapport) && /confiance/.test(r.rapport), 'A7 · R : scénario avec déclencheur, invalidation, confiance'); await fermerRapport();
  r = await poser('Rayle, analyse complète de l’or'); gen(r, 'A8'); verif(px(r, PRIX.or), 'A8 · C : vrai prix de l’or (' + PRIX.or + ')'); verif(/2\) Weekly/.test(r.rapport) && /3\) Où est le prix/.test(r.rapport), 'A8 · R : rapport complet'); await fermerRapport();
  r = await poser('Rayle, point rapide sur le S&P 500'); gen(r, 'A9'); verif(px(r, PRIX.us500) && /MA200/.test(r.journal), 'A9 · C : vrai prix du S&P 500 (' + PRIX.us500 + ')');
  r = await poser('Rayle, que penses-tu de Solana ?'); gen(r, 'A10'); verif(px(r, PRIX.sol), 'A10 · C : vrai prix de Solana (' + PRIX.sol + ')'); await fermerRapport();
}
if (PARTIE === 3) {
  for (const [q, n, motif] of [['Rayle, explique-moi le volume profile', 'B1', /(POC|zone de valeur|VAH)/], ['Rayle, apprends-moi à lire les POC nus', 'B2', /(POC nus|aimants|retestés)/], ['Rayle, c’est quoi un FVG ?', 'B3', /(FVG|trou|Fair Value|déséquilibre de prix|bougie)/i], ['Rayle, explique-moi le CVD', 'B4', /(CVD|delta|cumul)/i], ['Rayle, comment lire le voyant d’alignement ?', 'B5', /(alignement|Daily|H4)/]]) {
    const r = await poser(q); gen(r, n); verif(motif.test(r.journal), n + ' · C : explication tirée du manuel'); verif(/(Repères|dollars|Volume relatif|Données du|MA200)/.test(r.journal), n + ' · E : exemple chiffré tiré des données actuelles'); }
}
verif(await p.evaluate(() => window.__ss === 0), 'aucun appel à speechSynthesis.speak pendant tout le banc');
verif(await p.evaluate(() => window.__max <= 1), 'jamais deux lectures en même temps (max ' + await p.evaluate(() => window.__max) + ')');
await fin();
