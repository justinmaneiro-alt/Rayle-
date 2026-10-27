// Tests de la microstructure (M4) : concepts, voix, mesures causales, dérivés (zip, CSV, alignement), 7 hypothèses préenregistrées (grilles, causalité, signaux).
// Lancer :  node planetes/mars/tests/agent-micro-test.mjs
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { tranche } from '../pc/agent-btc/colonnes.js';
import { construireContexte } from '../pc/agent-btc/contexte.js';
import { CONCEPTS, CONCEPTS_PAR_ID, detecterQuestionMicro, expliquerConcept, phraseCourte } from '../pc/agent-btc/micro-concepts.js';
import { SESSIONS, absorption, alignerDeriv, construireMicro, indiceLiquidations, lireMicro, rondLePlusProche, sessionDe, zonesLiquidite } from '../pc/agent-btc/micro-mesures.js';
import { URL_ARCHIVE, analyserFunding, analyserMetrics, creerDeriv, lireZipTexte, telechargerFunding } from '../pc/agent-btc/deriv-donnees.js';
import { FAMILLES, combinaisons } from '../pc/agent-btc/hypotheses.js';
import { FAMILLES_MICRO, ORDRE_MICRO } from '../pc/agent-btc/hypotheses-micro.js';
import { empreinteCriteres } from '../pc/agent-btc/criteres.js';
import { marcheMixte, serieSynth, T0 } from './synth-btc.mjs';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const deflate = promisify(zlib.deflateRaw), inflate = promisify(zlib.inflateRaw);

/* ── critères figés : la version et l'empreinte du préenregistrement ── */
v('critères inchangés : empreinte c9995253 (version 1)', empreinteCriteres() === 'c9995253');

/* ── concepts ── */
const ids = ['liquidite', 'balayage', 'absorption', 'desequilibre', 'sessions', 'prix_ronds', 'vwap', 'volatilite', 'financement', 'interet_ouvert', 'liquidations'];
v('11 concepts demandés', CONCEPTS.length === 11 && ids.every(i => CONCEPTS_PAR_ID[i]));
v('chaque concept a mécanisme, mesure, limites, établi, discuté, voix', CONCEPTS.every(c => ['mecanisme', 'mesure', 'limites', 'etabli', 'discute', 'voix'].every(k => typeof c[k] === 'string' && c[k].length > 40) && c.nom.length >= 4 && c.alias.length >= 2));
v('jamais de manipulation attribuée à un acteur précis', CONCEPTS.every(c => !/manipul|baleines?\b|teneurs? de march|market makers? (?:chass|manipul)|institutions? (?:chass|manipul)/i.test(JSON.stringify(c))));
v('les textes parlés : pas de markdown ni d’émoji', CONCEPTS.every(c => !/[*#_`]|[\u{1F300}-\u{1FAFF}]/u.test(c.voix)));
v('les textes parlés sont courts (< 800 caractères)', CONCEPTS.every(c => c.voix.length < 800), CONCEPTS.map(c => c.voix.length).join());
v('liquidations : dit qu’il n’existe pas de donnée complète gratuite, indice ESTIMÉ', /estim/i.test(CONCEPTS_PAR_ID.liquidations.voix) && /complète gratuite|donnée complète/.test(CONCEPTS_PAR_ID.liquidations.voix));
v('phraseCourte : une phrase', phraseCourte('absorption').endsWith('.') && phraseCourte('absorption').length < 250 && phraseCourte('inconnu') === '');
const q = t => detecterQuestionMicro(t);
v('voix : « explique l’absorption »', (q('explique l’absorption') || {}).concept === 'absorption');
v('voix : « c’est quoi le funding »', (q('c’est quoi le funding') || {}).concept === 'financement');
v('voix : « qu’est-ce que l’intérêt ouvert »', (q('qu’est-ce que l’intérêt ouvert') || {}).concept === 'interet_ouvert');
v('voix : « explique le balayage de liquidité »', (q('explique le balayage de liquidité') || {}).concept === 'balayage');
v('voix : « explique les liquidations »', (q('explique les liquidations') || {}).concept === 'liquidations');
v('voix : « c’est quoi le VWAP »', (q('c’est quoi le VWAP') || {}).concept === 'vwap');
v('voix : « explique la compression de volatilité »', (q('explique la compression de volatilité') || {}).concept === 'volatilite');
v('voix : « quelle session est en cours ? »', (q('quelle session est en cours ?') || {}).sujet === 'session');
v('voix : « où sont les zones de liquidité ? »', (q('où sont les zones de liquidité ?') || {}).sujet === 'zones');
v('voix : phrases étrangères ignorées', q('quelle heure est-il') === null && q('explique la recette de la quiche') === null && q('montre-moi l’or en H1') === null);

/* ── sessions et prix ronds ── */
const h = (hh, mm = 0) => Date.UTC(2026, 9, 21, hh, mm);
v('sessions : 3 h = Asie, 9 h = Londres, 15 h = New York, 22 h = creux', [3, 9, 15, 22].map(x => SESSIONS[sessionDe(h(x))]).join() === 'Asie,Londres,New York,creux de fin de journée');
v('sessions : bords 7 h, 13 h 30, 21 h', sessionDe(h(6, 45)) === 0 && sessionDe(h(7)) === 1 && sessionDe(h(13, 15)) === 1 && sessionDe(h(13, 30)) === 2 && sessionDe(h(21)) === 3);
v('prix ronds : multiple le plus proche', rondLePlusProche(82600, 5000) === 85000 && rondLePlusProche(81000, 10000) === 80000 && rondLePlusProche(82400, 5000) === 80000);

/* ── mesures sur un jour écrit à la main : Asie 100–102, VWAP, veille ── */
function jour(d0, plan) {   // plan : fonction (k) → { o,h,l,c,v,vb } pour k=0..95
  return Array.from({ length: 96 }, (_, k) => { const b = plan(k); return { t: d0 + k * 900e3, vb: b.v / 2, ...b }; });
}
const D0 = Date.UTC(2026, 3, 1);
let bougies = [];
for (let d = 0; d < 20; d++) bougies.push(...jour(D0 + d * 86400e3, k => { const base = 100 + Math.sin(d * 3 + k / 12) * 1.5 + (d === 19 && k >= 40 ? 0 : 0); return { o: base, h: base + 0.4, l: base - 0.4, c: base + 0.05, v: 100 }; }));
const S = (() => { const s = serieSynth({ segments: [{ n: 1, derive: 0, bruit: 0.01 }] }); return s; })();
import('../pc/agent-btc/colonnes.js').then(() => {});
const { depuisBougies } = await import('../pc/agent-btc/colonnes.js');
const serieMain = depuisBougies(bougies);
const ctxMain = construireContexte(serieMain), mi = construireMicro(ctxMain);
const iJ = (d, hh, mm = 0) => d * 96 + hh * 4 + mm / 15;
{
  const i = iJ(19, 10); // 10 h UTC du dernier jour
  let hautAsie = -Infinity, basAsie = Infinity; for (let k = 0; k < 32; k++) { const b = bougies[19 * 96 + k]; hautAsie = Math.max(hautAsie, b.h); basAsie = Math.min(basAsie, b.l); }
  v('Asie : haut et bas de la session (00–08 h) connus à 10 h', Math.abs(mi.asiaHaut[i] - hautAsie) < 1e-9 && Math.abs(mi.asiaBas[i] - basAsie) < 1e-9);
  v('Asie : inconnus pendant la session (jamais de regard vers le futur)', Number.isNaN(mi.asiaHaut[iJ(19, 5)]) && Number.isNaN(mi.asiaBas[iJ(19, 7, 45)]));
  v('Asie : définitifs dès 8 h pile', Math.abs(mi.asiaHaut[iJ(19, 8)] - hautAsie) < 1e-9);
  let hv = -Infinity, bv = Infinity; for (let k = 0; k < 96; k++) { const b = bougies[18 * 96 + k]; hv = Math.max(hv, b.h); bv = Math.min(bv, b.l); }
  v('veille : haut et bas de la veille', Math.abs(mi.veilleHaut[i] - hv) < 1e-9 && Math.abs(mi.veilleBas[i] - bv) < 1e-9);
  // VWAP à la main sur les bougies 0..k du dernier jour
  const k = 42; let sv = 0, svp = 0, svp2 = 0; for (let m = 0; m <= k; m++) { const b = bougies[19 * 96 + m], tp = (b.h + b.l + b.c) / 3; sv += b.v; svp += b.v * tp; svp2 += b.v * tp * tp; }
  const w = svp / sv, sg = Math.sqrt(svp2 / sv - w * w), ii = 19 * 96 + k;
  v('VWAP ancré à 00 h UTC : valeur et écart-type pondérés', Math.abs(mi.vwap[ii] - w) < 1e-9 && Math.abs(mi.sigma[ii] - sg) < 1e-9);
  v('VWAP : repart à zéro à minuit', Math.abs(mi.vwap[19 * 96] - (bougies[19 * 96].h + bougies[19 * 96].l + bougies[19 * 96].c) / 3) < 1e-9);
}

/* ── causalité des mesures : « poison du futur » ── */
{
  const M = marcheMixte(9000, 12), ctxP = construireContexte(M), miP = construireMicro(ctxP);
  const derivBrut = syntheseDeriv(M, 7), dP = alignerDeriv(M.t, derivBrut);
  let bon = true, detail = '';
  const champs = ['asiaHaut', 'asiaBas', 'veilleHaut', 'veilleBas', 'vwap', 'sigma', 'volRel', 'ampATR', 'deltaRatio', 'cvd8', 'ratio8'];
  for (const i of [2000, 5000, 8000]) {
    const c = construireContexte(tranche(M, 0, i + 1)), m = construireMicro(c), d = alignerDeriv(tranche(M, 0, i + 1).t, derivBrut);
    for (const ch of champs) for (let j = 500; j <= i; j += 11) { const a = miP[ch][j], b = m[ch][j]; if (!((Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9)) { bon = false; detail = ch + ' i=' + i + ' j=' + j; break; } }
    for (const ch of ['funding', 'fundingPct', 'oi', 'oiVar1h', 'oiVar4h', 'taker']) for (let j = 500; j <= i; j += 11) { const a = dP[ch][j], b = d[ch][j]; if (!((Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9)) { bon = false; detail = 'deriv ' + ch + ' i=' + i + ' j=' + j; break; } }
    if (!bon) break;
  }
  v('MESURES CAUSALES : identiques sur la série complète et sur la série coupée (11 mesures + 6 dérivées × 3 instants)', bon, detail);
  // lecture : la lecture à i est la même avec ou sans le futur
  let lecOk = true; for (const i of [3000, 6000]) { const a = lireMicro(ctxP, dP, i), c = construireContexte(tranche(M, 0, i + 1)), b = lireMicro(c, alignerDeriv(tranche(M, 0, i + 1).t, derivBrut), i); if (JSON.stringify(a) !== JSON.stringify(b)) { lecOk = false; } }
  v('lireMicro causale (même texte avec ou sans le futur)', lecOk);
  const L = lireMicro(ctxP, dP, 6000);
  v('lireMicro : session, VWAP, ronds, zones, flux, volatilité renseignés', L.ok && L.session.nom && L.vwap && L.ronds.length === 2 && Array.isArray(L.zones) && L.flux && L.volatilite.note);
  v('lireMicro : financement et intérêt ouvert RÉELS étiquetés, liquidations ESTIMÉES', L.financement.etat === 'reel' && L.interetOuvert.etat === 'reel' && L.liquidations.etat === 'estime');
  const Ls = lireMicro(ctxP, null, 6000);
  v('sans dérivés : INDISPONIBLE (rien d’inventé)', Ls.financement.etat === 'indisponible' && Ls.interetOuvert.etat === 'indisponible' && Ls.liquidations.etat === 'indisponible');
}

/* ── dérivés : alignement causal ── */
{
  const t = new Float64Array(8).map((_, k) => Date.UTC(2026, 0, 1, 7) + k * 900e3);
  const raw = { funding: [{ t: Date.UTC(2026, 0, 1, 0), taux: 0.0001 }, { t: Date.UTC(2026, 0, 1, 8), taux: 0.0005 }], metrics: [{ t: Date.UTC(2026, 0, 1, 7, 0), oi: 100, taker: 1, lsGros: 1, lsComptes: 1 }, { t: Date.UTC(2026, 0, 1, 7, 50), oi: 120, taker: 2, lsGros: 1, lsComptes: 1 }] };
  const d = alignerDeriv(t, raw);
  v('financement : connu seulement après son heure de règlement + 5 minutes (bougie 7 h 45, clôture 8 h : pas encore ; 8 h 00, clôture 8 h 15 : oui)', d.funding[0] === 0.0001 && d.funding[3] === 0.0001 && d.funding[4] === 0.0005, Array.from(d.funding).join());
  v('intérêt ouvert : la mesure de 7 h 50 n’est utilisée qu’à partir de 7 h 55 (sécurité 5 minutes)', d.oi[2] === 100 && d.oi[3] === 120 && d.oi[0] === 100, Array.from(d.oi).join());
  v('intérêt ouvert : pas de mesure plus vieille que 3 heures (trou signalé par NaN)', Number.isNaN(alignerDeriv(new Float64Array([Date.UTC(2026, 0, 1, 13)]), raw).oi[0]));
  v('sans données : disponible = faux', alignerDeriv(t, { funding: [], metrics: [] }).disponible.funding === false);
}

/* ── zip, CSV, téléchargements ── */
{
  const csv = 'create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio\n'
    + '2025-03-10 00:00:00,BTCUSDT,69777.1030000000000000,5667296305.6600000000000000,3.22810475,1.96046500,2.75533295,1.63949200\n'
    + '2025-03-10 00:05:00,BTCUSDT,69845.3970000000000000,5670733877.5049940000000000,3.26018408,1.93873000,2.78790329,1.12957300\n'
    + '2025-03-10 00:10:00,BTCUSDT,,,,,,\n';
  const comp = await deflate(Buffer.from(csv)), nom = Buffer.from('BTCUSDT-metrics-2025-03-10.csv');
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(csv.length, 22); loc.writeUInt16LE(nom.length, 26);
  const zip = new Uint8Array(Buffer.concat([loc, nom, comp]));
  const inf = async b => new Uint8Array(await inflate(Buffer.from(b)));
  const txt = await lireZipTexte(zip, inf);
  v('zip : lecture d’un fichier deflate', txt === csv);
  const L = analyserMetrics(txt);
  v('métriques : 2 lignes valides (la ligne vide est ignorée), heures UTC, champs', L.length === 2 && L[0].t === Date.UTC(2025, 2, 10, 0, 0) && L[0].oi === 69777.103 && L[0].lsComptes === 2.75533295 && L[0].lsGros === 1.960465 && L[0].taker === 1.639492);
  let echec = null; try { await lireZipTexte(new Uint8Array(40), inf); } catch (e) { echec = e.message; }
  v('zip invalide : erreur claire', /invalide/.test(echec || ''));
  v('adresse d’archive', URL_ARCHIVE('2025-03-10') === 'https://data.binance.vision/data/futures/um/daily/metrics/BTCUSDT/BTCUSDT-metrics-2025-03-10.zip');
  // funding paginé
  const pages = []; const lireJson = async url => { pages.push(url); const t0 = +new URL(url).searchParams.get('startTime'); return Array.from({ length: t0 < 3000 ? 1000 : 3 }, (_, k) => ({ fundingTime: t0 + k, fundingRate: '0.0001' })); };
  const f = await telechargerFunding(lireJson, 0, 1e9, { pause: async () => {} });
  v('financement : pagination sans doublon', f.length === 3003 && new Set(f.map(x => x.t)).size === f.length && pages.length === 4, pages.length + ' pages, ' + f.length);
  v('financement : réponse inattendue = erreur', (() => { try { analyserFunding({ code: -1 }); return false; } catch (e) { return true; } })());
  // creerDeriv de bout en bout avec faux disque et faux réseau
  const disque = new Map(), stockage = { lire: async k => disque.get(k) || null, ecrire: async (k, x) => { disque.set(k, { ...x, cle: k }); }, liste: async () => [...disque.keys()] };
  const maintenant = Date.UTC(2025, 2, 12, 12);
  const jours = []; const lireOctets = async url => { const j = url.match(/(\d{4}-\d\d-\d\d)\.zip/)[1]; jours.push(j); if (j === '2025-03-09') throw new Error('HTTP 404'); return zip; };
  const lj = async url => (url.includes('fundingRate') ? [{ fundingTime: Date.UTC(2025, 2, 11, 8), fundingRate: '0.0002' }] : []);
  const dd = creerDeriv({ stockage, lireJson: lj, lireOctets, inflater: inf, maintenant: () => maintenant, annees: 0.01, concurrence: 2, pause: async () => {} });
  const e = await dd.synchroniser();
  v('creerDeriv : télécharge les jours, tolère un jour manquant, écrit par mois', jours.length >= 3 && e.joursManquants >= 1 && [...disque.keys()].some(k => k.startsWith('DERIV:metrics:2025-03')) && e.funding === 1);
  const dd2 = creerDeriv({ stockage, lireJson: lj, lireOctets, inflater: inf, maintenant: () => maintenant, annees: 0.01, pause: async () => {} });
  const e2 = await dd2.charger();
  v('creerDeriv : relit le disque', e2.metrics === e.metrics && dd2.brut().funding.length === 1);
}

/* ── zones de liquidité, absorption, indice de liquidations ── */
{
  // marché plat avec deux sommets presque égaux, un creux et un prix rond
  const b = []; let t = Date.UTC(2026, 5, 1);
  const bar = (o, hi, lo, c, vol = 100) => ({ t: (t += 900e3) - 900e3, o, h: hi, l: lo, c, v: vol, vb: vol / 2 });
  for (let k = 0; k < 600; k++) b.push(bar(80000, 80040, 79960, 80000));
  // deux sommets égaux à 80 400 séparés
  const ecrire = (idx, hi) => { b[idx] = bar(80000, hi, 79990, 80010); b[idx].t = Date.UTC(2026, 5, 1) + idx * 900e3; };
  ecrire(500, 80400); ecrire(540, 80410);
  const sx = depuisBougies(b), cx = construireContexte(sx);
  const zs = zonesLiquidite(cx, 599);
  v('zones : égaux hauts détectés (2 sommets à 80 400 / 80 410)', zs.some(z => z.type === 'égaux hauts' && z.touches === 2 && z.prix >= 80400 && z.prix <= 80410 + 1e-9), JSON.stringify(zs.map(z => z.type + '@' + Math.round(z.prix))));
  v('zones : prix rond 80 000 proche', zs.some(z => z.rond && z.prix === 80000));
  v('zones : chaque zone a côté et distance en ATR', zs.every(z => ['dessus', 'dessous'].includes(z.cote) && Number.isFinite(z.distanceATR)));
}
{
  const b = []; let t = Date.UTC(2026, 5, 1); const vb = (v, r) => (v / 2) * (1 + r);
  for (let k = 0; k < 500; k++) b.push({ t: (t += 900e3) - 900e3, o: 80000, h: 80050, l: 79950, c: 80000, v: 100, vb: 50 });
  // bougie d'absorption : volume 400, petite amplitude, delta vendeur (vb faible), clôture haute
  b[499] = { t: b[499].t, o: 79990, h: 80020, l: 79960, c: 80015, v: 400, vb: 100 };
  const cx = construireContexte(depuisBougies(b)), a = absorption(cx, 499);
  v('absorption : volume élevé + petite amplitude + delta vendeur + clôture haute = absorption haussière', a && a.sens === 1 && /absorb/.test(a.texte), JSON.stringify(a));
  v('absorption : bougie normale = rien', absorption(cx, 450) === null);
  const d = { oiVar1h: new Float64Array(500).fill(0), disponible: { oi: true } }; d.oiVar1h[499] = -0.03;
  b[498] = { t: b[498].t, o: 80300, h: 80300, l: 78900, c: 79000, v: 800, vb: 200 };
  const cy = construireContexte(depuisBougies(b));
  const liq = indiceLiquidations(cy, d, 499);
  v('indice de liquidations : forte baisse de l’OI + grande bougie baissière = longs ESTIMÉ', liq && liq.estime === true && liq.cote === 'longs', JSON.stringify(liq));
  v('indice de liquidations : sans baisse de l’OI = rien', indiceLiquidations(cy, { oiVar1h: new Float64Array(500), disponible: { oi: true } }, 499) === null);
}

/* ── hypothèses préenregistrées ── */
const nbVar = ORDRE_MICRO.map(f => combinaisons(FAMILLES_MICRO[f].grille(0)).length);
v('7 familles préenregistrées', ORDRE_MICRO.length === 7 && ORDRE_MICRO.every(f => FAMILLES[f] === FAMILLES_MICRO[f]));
v('variantes : 32 + 16×6 = 128 en génération 0', nbVar.join() === '32,16,16,16,16,16,16' && nbVar.reduce((a, b) => a + b, 0) === 128, nbVar.join());
v('la grille ne s’étend pas à la génération 1 (aucune liberté non déclarée)', ORDRE_MICRO.every(f => JSON.stringify(FAMILLES_MICRO[f].grille(0)) === JSON.stringify(FAMILLES_MICRO[f].grille(1))));
v('objectif 4 à 6 R pour toutes', ORDRE_MICRO.every(f => FAMILLES_MICRO[f].grille(0).R.every(r => r >= 4 && r <= 6)));
v('chaque famille décrit son mécanisme sans accuser d’acteur', ORDRE_MICRO.every(f => FAMILLES_MICRO[f].description.length > 80 && !/manipul|baleine/i.test(FAMILLES_MICRO[f].description)));

function syntheseDeriv(M, graine) {
  const a = alea(graine), funding = [], metrics = []; let taux = 0.0001, oi = 90000;
  for (let t = Math.floor(M.t[0] / (8 * 3600e3)) * 8 * 3600e3; t <= M.t[M.n - 1] + 900e3; t += 8 * 3600e3) { taux = Math.max(-0.0008, Math.min(0.001, taux + (a() - 0.5) * 0.0002)); funding.push({ t, taux }); }
  for (let t = M.t[0]; t <= M.t[M.n - 1] + 900e3; t += 300e3) { oi *= 1 + (a() - 0.5) * 0.004; metrics.push({ t, oi, oiValeur: oi * 80000, lsGros: 1 + a(), lsComptes: 1 + a(), taker: 0.5 + a() }); }
  return { funding, metrics };
}
{
  const M = marcheMixte(9000, 8), derivBrut = syntheseDeriv(M, 3), ctxPlein = construireContexte(M, { deriv: alignerDeriv(M.t, derivBrut) });
  let bon = true, detail = '', testes = 0;
  for (const f of ORDRE_MICRO) {
    const jeux = combinaisons(FAMILLES[f].grille(0)); const choix = [jeux[0], jeux[Math.floor(jeux.length / 2)], jeux[jeux.length - 1]];
    for (const p of choix) {
      const plein = FAMILLES[f].signaux(ctxPlein, p);
      for (const i of [1500, 4000, 6500, 8500]) {
        const coupe = tranche(M, 0, i + 1), court = FAMILLES[f].signaux(construireContexte(coupe, { deriv: alignerDeriv(coupe.t, derivBrut) }), p); testes++;
        for (let j = 0; j <= i; j++) if (plein.sens[j] !== court.sens[j] || (plein.sens[j] !== 0 && Math.abs(plein.stop[j] - court.stop[j]) > 1e-9)) { bon = false; detail = f + ' i=' + i + ' j=' + j; break; }
        if (!bon) break;
      }
      if (!bon) break;
    }
    if (!bon) break;
  }
  v('SIGNAUX CAUSAUX des 7 hypothèses (y compris les dérivés) : identiques sur la série complète et coupée en i (7 × 3 jeux × 4 instants = ' + testes + ' contrôles)', bon, detail);
  // sans dérivés : H6 et H7 muets, les autres non
  const ctxSans = construireContexte(M);
  v('sans dérivés : financement_extreme et purge_oi ne produisent aucun signal', ['financement_extreme', 'purge_oi'].every(f => FAMILLES[f].signaux(ctxSans, combinaisons(FAMILLES[f].grille(0))[0]).sens.every(x => x === 0)));
  // chaque famille produit des signaux sur un marché varié (mécanique vivante) avec au moins un jeu de paramètres ; sens ±1 ; stop du bon côté
  const compte = {}; let coteBon = true;
  const M2 = marcheMixte(30000, 4), d2 = syntheseDeriv(M2, 5), ctx2 = construireContexte(M2, { deriv: alignerDeriv(M2.t, d2) });
  for (const f of ORDRE_MICRO) {
    let max = 0;
    for (const p of combinaisons(FAMILLES[f].grille(0))) {
      const s = FAMILLES[f].signaux(ctx2, p); let n = 0;
      for (let i = 0; i < M2.n; i++) if (s.sens[i] !== 0) { n++; if (s.sens[i] > 0 ? !(s.stop[i] < M2.c[i]) : !(s.stop[i] > M2.c[i])) coteBon = false; }
      max = Math.max(max, n);
    }
    compte[f] = max;
  }
  v('le stop est du bon côté du prix à la clôture du signal', coteBon);
  v('mécanique vivante sur un marché synthétique varié (absorption_niveau et purge_oi exigent un delta contraire ou une purge, que ce marché ne fabrique pas : ils sont vérifiés par scénario plus bas)', ORDRE_MICRO.filter(f => !['absorption_niveau', 'purge_oi'].includes(f)).every(f => compte[f] > 0), JSON.stringify(compte));
}

/* ── scénario écrit à la main : balayage du haut de l’Asie ── */
{
  const b = []; const d0 = Date.UTC(2026, 3, 1);
  for (let d = 0; d < 6; d++) for (let k = 0; k < 96; k++) { const hh = k / 4, base = 100 + (hh < 8 ? 0.4 * Math.sin(k) : 0); b.push({ t: d0 + d * 86400e3 + k * 900e3, o: base, h: base + 0.3, l: base - 0.3, c: base, v: 100, vb: 50 }); }
  // jour 5 : Asie 99,6–100,7 ; à 9 h une bougie balaie 100,7 avec mèche haute et gros volume, puis la suivante referme dessous
  const i0 = 5 * 96;
  let AH = -Infinity, AL = Infinity; for (let k = 0; k < 32; k++) { AH = Math.max(AH, b[i0 + k].h); AL = Math.min(AL, b[i0 + k].l); }
  const j = i0 + 9 * 4; b[j] = { t: b[j].t, o: 100.3, h: AH + 0.6, l: 100.2, c: 100.35, v: 300, vb: 140 };
  const sx = depuisBougies(b), cx = construireContexte(sx);
  // les 400 premières bougies sont de la chauffe : on abaisse DEPART en testant sur une série plus longue
  v('scénario balayage : la série est assez longue (jour 5 après la chauffe de 400 bougies)', j > 400);
  const s = FAMILLES.sweep_asie.signaux(cx, { meche: 0.3, volMult: 1.0, rb: 1, pad: 0.1, R: 4 });
  v('scénario balayage : signal de VENTE sur la bougie qui balaie l’Asie et referme dessous, stop au-dessus de la mèche', s.sens[j] === -1 && Math.abs(s.stop[j] - (AH + 0.6 + 0.1 * cx.h1.atr[j])) < 1e-6, s.sens[j] + ' ' + s.stop[j]);
  const sSans = FAMILLES.sweep_asie.signaux(cx, { meche: 0.9, volMult: 1.0, rb: 1, pad: 0.1, R: 4 });
  v('scénario balayage : mèche trop courte pour le seuil = pas de signal', sSans.sens[j] === 0);
}

/* ── scénario écrit à la main : absorption sur le bas de la veille ── */
{
  const b = []; const d0 = Date.UTC(2026, 3, 1);
  for (let d = 0; d < 6; d++) for (let k = 0; k < 96; k++) b.push({ t: d0 + d * 86400e3 + k * 900e3, o: 100, h: 100.3, l: 99.7, c: 100, v: 100, vb: 50 });
  const j = 5 * 96 + 12 * 4;
  b[j] = { t: b[j].t, o: 100, h: 100.2, l: 99.85, c: 100.15, v: 300, vb: 100 };           // gros volume, petite amplitude, delta vendeur, clôture haute, bas à 0,15 du bas de la veille (99,7)
  b[j + 1] = { t: b[j + 1].t, o: 100.15, h: 100.4, l: 100.1, c: 100.35, v: 120, vb: 70 }; // confirmation : clôture au-dessus du haut de la bougie d'absorption
  const cx = construireContexte(depuisBougies(b));
  const s = FAMILLES.absorption_niveau.signaux(cx, { volMin: 1.5, ampMax: 0.9, zoneProx: 0.5, R: 4 });
  v('scénario absorption : ACHAT à la bougie de confirmation, stop sous le bas de l’absorption', s.sens[j + 1] === 1 && Math.abs(s.stop[j + 1] - (99.85 - 0.2 * cx.h1.atr[j + 1])) < 1e-6, s.sens[j + 1] + ' ' + s.stop[j + 1]);
  v('scénario absorption : pas de signal sur la bougie d’absorption elle-même', s.sens[j] === 0);
  const s2 = FAMILLES.absorption_niveau.signaux(cx, { volMin: 2.5, ampMax: 0.9, zoneProx: 0.5, R: 4 });
  v('scénario absorption : volume 3 fois la normale < seuil 2,5 ? non (3 ≥ 2,5) → signal conservé', s2.sens[j + 1] === 1);
  const s3 = FAMILLES.absorption_niveau.signaux(cx, { volMin: 2.5, ampMax: 0.6, zoneProx: 0.5, R: 4 });
  v('scénario absorption : amplitude trop grande pour le seuil 0,6 ATR = pas de signal', s3.sens[j + 1] === 0 || cx.micro.ampATR[j] <= 0.6, String(cx.micro.ampATR[j]));
}

/* ── scénario écrit à la main : purge de l’intérêt ouvert puis reprise ── */
{
  const b = []; const d0 = Date.UTC(2026, 3, 1);
  for (let d = 0; d < 6; d++) for (let k = 0; k < 96; k++) b.push({ t: d0 + d * 86400e3 + k * 900e3, o: 100, h: 100.3, l: 99.7, c: 100, v: 100, vb: 50 });
  const j = 5 * 96 + 12 * 4;
  b[j] = { t: b[j].t, o: 100, h: 100, l: 97, c: 97.2, v: 900, vb: 250 };                  // grande bougie baissière (amplitude 3, ATR M15 ≈ 0,6)
  b[j + 1] = { t: b[j + 1].t, o: 97.3, h: 98.8, l: 97.2, c: 98.6, v: 400, vb: 260 };        // reprise : clôture à ≥ 40 % de l'amplitude au-dessus du bas
  const metrics = []; const tFlush = b[j].t;
  for (let t = d0; t <= b[j + 1].t + 900e3; t += 300e3) metrics.push({ t, oi: t < tFlush + 300e3 ? 100000 : 96500, oiValeur: 1e10, lsGros: 1, lsComptes: 1, taker: 1 });
  const cx = construireContexte(depuisBougies(b), { deriv: alignerDeriv(depuisBougies(b).t, { funding: [], metrics }) });
  const s = FAMILLES.purge_oi.signaux(cx, { oiDrop: 0.03, rangeATR: 2, retrace: 0.4, R: 4 });
  v('scénario purge : ACHAT à la reprise après une chute de l’intérêt ouvert de 3,5 %, stop sous le plus bas de la purge', s.sens[j + 1] === 1 && Math.abs(s.stop[j + 1] - (97 - 0.2 * cx.h1.atr[j + 1])) < 1e-6, s.sens[j + 1] + ' ' + s.stop[j + 1] + ' oiVar1h=' + cx.deriv.oiVar1h[j + 1]);
  const s2 = FAMILLES.purge_oi.signaux(cx, { oiDrop: 0.04, rangeATR: 2, retrace: 0.4, R: 4 });
  v('scénario purge : seuil de baisse de l’intérêt ouvert non atteint (4 %) = pas de signal', s2.sens[j + 1] === 0);
  const s3 = FAMILLES.purge_oi.signaux(cx, { oiDrop: 0.03, rangeATR: 2, retrace: 0.6, R: 4 });
  v('scénario purge : reprise insuffisante (60 % exigés, 53 % obtenus) = pas de signal', s3.sens[j + 1] === 0, String((98.6 - 97) / 3));
}

console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
