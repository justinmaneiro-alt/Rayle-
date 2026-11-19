/* ═════════════ CALCUL DE L'INVESTISSEMENT V2 (Node 22, aucune dépendance) ═════════════
   Lit le catalogue data/xtb-univers/*.json, télécharge prix (Yahoo), comptes (SEC EDGAR pour les États-Unis, séries publiques Yahoo ailleurs), taux (FRED), PPA (Banque mondiale), calendrier des résultats (Nasdaq),
   calcule mesures, facteurs (percentiles neutres secteur × zone), backtest, et écrit des JSON découpés dans le dossier de sortie (servis ensuite par GitHub Pages / raw.githubusercontent.com).
   Fiable : limitation de débit, nouvelles tentatives, reprise (--reprise : une fiche calculée il y a moins de 20 h est conservée). Prix : chaque jour ; comptes : chaque semaine (cache fond/).
   Usage : node outils-donnees/invest/calcul-v2.mjs --sortie <dossier> [--reprise] [--limite N] [--classes action,ETF,devise,indice,matiere,crypto,obligataire] [--seulement ID,ID] [--conc 6] [--sans-fond]
   Variables : SEC_USER_AGENT (nom + contact exigés par la SEC ; jamais écrit dans le dépôt). Tout est gratuit, sans clé. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { URL_CHART, lireChart, URL_SERIES, lireSeriesAnnuelles, URL_RECHERCHE, lireRecherche, URL_FRED, lireFred, URL_PPP, lirePPP, URL_RESULTATS, lireResultats } from '../../trader-pro/invest/sources2.js';
import { lireFaits, UA_DEFAUT } from '../../trader-pro/invest/sources.js';
import { construireLigne } from '../../trader-pro/invest/ligne.js';
import { calculerFacteurs } from '../../trader-pro/invest/modele.js';
import { mesuresPrix, setupTactique } from '../../trader-pro/invest/technique.js';
import { matriceMensuelle, encoder, decoder } from '../../trader-pro/invest/saison.js';
import { normaliserSecteur } from '../../trader-pro/invest/secteurs.js';
import { variantesYahoo } from './tables.mjs';
import { backtest, enSerie, SIGNAUX, ajustement } from './backtest.mjs';

const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../..');
const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const sortie = path.resolve(arg('sortie', path.join(racine, 'sortie-invest'))), reprise = !!arg('reprise'), limite = +arg('limite', 0) || 0, conc = +arg('conc', 6) || 6, sansFond = !!arg('sans-fond');
const seulement = arg('seulement') ? new Set(String(arg('seulement')).split(',')) : null, classesVoulues = arg('classes') ? new Set(String(arg('classes')).split(',').map(s => ({ matiere: 'matière première', action: 'action', etf: 'ETF' })[s.toLowerCase()] || s)) : null;
const UA_SEC = process.env.SEC_USER_AGENT || UA_DEFAUT, UA_WEB = 'Mozilla/5.0 (compatible; Rayle-Invest outil de recherche personnel)', J = 86400e3, maintenant = Date.now();
for (const d of ['fiches', 'fond', 'index', 'saison']) fs.mkdirSync(path.join(sortie, d), { recursive: true });
const attendre = ms => new Promise(r => setTimeout(r, ms));
/* limiteur de débit : au plus `par` requêtes par seconde pour un hôte */
const limiteurs = {}; async function cadence(hote, par) { const L = (limiteurs[hote] = limiteurs[hote] || { suivant: 0 }), now = Date.now(); const t = Math.max(now, L.suivant); L.suivant = t + 1000 / par; if (t > now) await attendre(t - now); }
const PAR_HOTE = { 'data.sec.gov': 8, 'www.sec.gov': 5, 'api.nasdaq.com': 3, 'fred.stlouisfed.org': 4, 'api.worldbank.org': 4 };
async function obtenir(url, { ua = UA_WEB, texte = false, essais = 4, ms = 30000 } = {}) {
  const hote = new URL(url).host, par = PAR_HOTE[hote] || (/yahoo/.test(hote) ? 10 : 6);
  for (let i = 0; i < essais; i++) {
    await cadence(hote, par);
    try { const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json,text/csv,*/*' }, signal: AbortSignal.timeout(ms) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await attendre(4000 * (i + 1) ** 2); continue; } if (!r.ok) return null; return texte ? await r.text() : await r.json(); }
    catch (e) { await attendre(1500 * (i + 1)); }
  } return null;
}
const lireJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const ecrire = (f, o) => fs.writeFileSync(f, JSON.stringify(o));
const stats = { echecs: [], sansDonnees: 0 };

/* ───── catalogue ───── */
const cataloguePath = path.join(racine, 'data/xtb-univers'); let catalogue = [];
for (const n of ['actions', 'etf', 'devises', 'indices', 'matieres', 'crypto', 'obligataire']) catalogue.push(...(lireJson(path.join(cataloguePath, n + '.json'), [])));
if (classesVoulues) catalogue = catalogue.filter(c => classesVoulues.has(c.classe)); if (seulement) catalogue = catalogue.filter(c => seulement.has(c.symbole_xtb)); if (limite) catalogue = catalogue.slice(0, limite);
console.log('instruments à traiter :', catalogue.length);
const meta = lireJson(path.join(sortie, 'meta.json'), {});   // enrichissement : nom, secteur, industrie (renouvelé chaque mois)

/* ───── devises, indices de référence, SEC ───── */
const FX_LISTE = ['USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'JPY', 'AUD', 'CAD', 'HKD', 'CNY', 'BRL', 'MXN', 'SGD', 'KRW', 'TRY', 'ZAR', 'HUF', 'RON', 'INR', 'NZD', 'ILS'];
const fxEur = { EUR: 1 };
for (const c of FX_LISTE) { const j = await obtenir(URL_CHART('EUR' + c + '=X', '5d', '1d', 'div')); try { const ch = lireChart(j); if (ch.prix > 0) fxEur[c] = ch.prix; } catch (e) { /* devise absente */ } }
console.log('devises chargées :', Object.keys(fxEur).length);
const BENCH = { US: '^GSPC', FR: '^FCHI', DE: '^GDAXI', UK: '^FTSE', ES: '^IBEX', IT: 'FTSEMIB.MI', NL: '^AEX', BE: '^BFX', PT: 'PSI20.LS', CH: '^SSMI', SE: '^OMX', NO: 'OBX.OL', DK: '^OMXC25', FI: '^OMXH25', PL: 'WIG20.WA', CZ: '^STOXX50E', EU: '^STOXX50E' };
const benchD = {}, benchM = {};
for (const sym of new Set([...Object.values(BENCH), '^STOXX50E'])) { const d = await obtenir(URL_CHART(sym, '5y', '1d', 'div')), m = await obtenir(URL_CHART(sym, 'max', '1mo', 'div')); try { benchD[sym] = lireChart(d).bougies; benchM[sym] = lireChart(m).ajuste; } catch (e) { /* indice absent */ } }
const benchDe = pays => benchD[BENCH[pays]] || benchD['^STOXX50E'] || null, benchMDe = pays => benchM[BENCH[pays]] || benchM['^STOXX50E'] || null;
let secTickers = null; if (!sansFond) { const j = await obtenir('https://www.sec.gov/files/company_tickers.json', { ua: UA_SEC }); if (j) { secTickers = new Map(Object.values(j).map(x => [String(x.ticker).toUpperCase().replace('.', '-'), x.cik_str])); console.log('tickers SEC :', secTickers.size); } else console.log('tickers SEC indisponibles : les sociétés américaines hors S&P 500 passent par Yahoo'); }
/* calendrier des résultats américains (10 prochains jours) */
const resultats = new Map(); if (!sansFond) for (let k = 0; k <= 10; k++) { const d = new Date(maintenant + k * J).toISOString().slice(0, 10), j = await obtenir(URL_RESULTATS(d)); for (const x of lireResultats(j)) if (!resultats.has(x.symbole)) resultats.set(x.symbole, k); }
console.log('résultats américains annoncés (10 jours) :', resultats.size);

/* ───── traitement d'un instrument ───── */
async function chartAvecVariantes(sym, plage, pas) { for (const v of variantesYahoo(sym)) { const j = await obtenir(URL_CHART(v, plage, pas)); if (!j) continue; try { const ch = lireChart(j); if (ch.bougies.length > 5) return { ch, sym: v }; } catch (e) { /* variante suivante */ } } return null; }
async function comptes(cat, type) {
  const f = path.join(sortie, 'fond', cat.symbole_xtb + '.json'), c = lireJson(f);
  if (c && maintenant - c.t < 7 * J && c.annuel && c.annuel.length) return c;
  let r = null;
  const cik = cat.cik || (secTickers && cat.pays === 'US' ? secTickers.get(cat.symbole_yahoo.toUpperCase()) : null);
  if (cik) { try { const F = await lireFaits(cik, async (u, o) => { await cadence('data.sec.gov', 8); return fetch(u, { ...o, headers: { ...(o && o.headers), 'User-Agent': UA_SEC } }); }, UA_SEC); if (F.annuel && F.annuel.length >= 3) r = { src: 'SEC EDGAR', annuel: F.annuel, devF: 'USD', actions: F.actions, actionsT: F.actionsT }; } catch (e) { /* repli sur Yahoo */ } }
  if (!r) { const j = await obtenir(URL_SERIES(cat.symbole_yahoo)); if (j) { try { const S = lireSeriesAnnuelles(j); if (S.annuel.length) r = { src: 'Yahoo Finance (séries publiques)', annuel: S.annuel, devF: S.devise, actions: S.actions, actionsT: S.actionsT }; } catch (e) { /* aucune série */ } } }
  if (r) { r.t = maintenant; ecrire(f, r); return r; }
  return c || null;
}
async function enrichir(cat) {
  const m = meta[cat.symbole_xtb]; if (m && maintenant - m.t < 30 * J) return m;
  const j = await obtenir(URL_RECHERCHE(cat.symbole_yahoo)); const q = j ? lireRecherche(j, cat.symbole_yahoo) : null;
  const o = { t: maintenant, nom: (q && q.nom) || m && m.nom || null, secteur: (q && q.secteur) || (m && m.secteur) || null, industrie: (q && q.industrie) || (m && m.industrie) || null, type: q ? q.type : (m && m.type) || null }; meta[cat.symbole_xtb] = o; return o;
}
const resultatsFiche = new Map(), Mmat = new Map(), lignes = [], fiches = new Map();
async function traiter(cat0) {
  const cat = { ...cat0 }, fiche0 = path.join(sortie, 'fiches', cat.symbole_xtb + '.json');
  if (reprise) { const e = lireJson(fiche0); if (e && e.ligne && maintenant - (e.ligne.t || 0) < 20 * 3600e3) { lignes.push(e.ligne); if (e.saison) Mmat.set(cat.symbole_xtb, decoder(e.saison)); return; } }
  if (cat.classe === 'obligataire' && !cat.symbole_yahoo) return;   // simples références : traitées avec les taux
  const D0 = await chartAvecVariantes(cat.symbole_yahoo, '5y', '1d'); if (!D0) { stats.echecs.push(cat.symbole_xtb + ' (' + cat.symbole_yahoo + ') : aucun cours Yahoo'); return; }
  const M0 = await chartAvecVariantes(D0.sym, 'max', '1mo'); cat.symbole_yahoo = D0.sym;
  if (D0.ch.bougies.length < 60) { stats.echecs.push(cat.symbole_xtb + ' : moins de 60 séances'); return; }
  if (cat.classe === 'action' && /ETF|MUTUALFUND/i.test(D0.ch.type || '')) { cat.classe = 'ETF'; cat.categorie = cat.categorie || 'ETF coté'; }
  if (cat.classe === 'action') { const m = await enrichir(cat); cat.nom = m.nom || cat.nom || D0.ch.nom; cat.secteur = normaliserSecteur(cat.secteur) || m.secteur || null; cat.industrie = m.industrie || null; if (cat.classe === 'action' && m.type && !/EQUITY/i.test(m.type)) { /* titre exotique : on garde l'analyse prix */ } }
  else { cat.nom = cat.nom || D0.ch.nom; if (cat.classe === 'ETF' && !cat.nom) cat.nom = D0.ch.nom; if (cat.classe === 'ETF' && D0.ch.nom) cat.nom = D0.ch.nom; }
  cat.devise = D0.ch.devise; cat.bourse = D0.ch.bourse || cat.bourse;
  let C = null; if (cat.classe === 'action' && !sansFond) C = await comptes(cat, 'action');
  const r = construireLigne({ cat, D: D0.ch, M: M0 ? M0.ch : null, annuel: C ? C.annuel : null, devF: C ? C.devF : null, actions: C ? C.actions : null, actionsT: C ? C.actionsT : null, fxEur, bench: benchDe(cat.pays), benchM: benchMDe(cat.pays), maintenant });
  const l = r.ligne; if (C) { r.fiche.source = C.src; l.src = C.src === 'SEC EDGAR' ? 'SEC' : 'YH'; }
  if (cat.classe === 'ETF') { l.cat = cat.categorie || null; l.dur = cat.duree || null; if (cat.isin) l.isin = cat.isin; }
  if (cat.isin) r.fiche.isin = cat.isin;
  const ev = resultats.get(String(cat.symbole_yahoo).toUpperCase()); if (cat.pays === 'US' && cat.classe === 'action') { l.evt = ev != null ? ev : null; l.evtConnu = 1; }
  r.fiche.ligne = l; r.fiche.dispo = cat.dispo; r.fiche.pea = cat.pea; r.fiche.verifie_xtb = !!cat.verifie_xtb; r.fiche.indices = cat.indices || []; r.fiche.palier = cat.palier;
  lignes.push(l); Mmat.set(cat.symbole_xtb, r.Mm); fiches.set(cat.symbole_xtb, r.fiche); resultatsFiche.set(cat.symbole_xtb, M0 ? M0.ch.ajuste : null);
  ecrire(fiche0, r.fiche);
}
let fait = 0; const file = catalogue.slice();
await Promise.all(Array.from({ length: conc }, async () => { while (file.length) { const c = file.shift(); try { await traiter(c); } catch (e) { stats.echecs.push(c.symbole_xtb + ' : ' + e.message); } if (++fait % 100 === 0) { console.log(fait + '/' + catalogue.length, '— lignes', lignes.length, '— échecs', stats.echecs.length); ecrire(path.join(sortie, 'meta.json'), meta); } } }));
ecrire(path.join(sortie, 'meta.json'), meta);
console.log('traités :', lignes.length, '— échecs :', stats.echecs.length);

/* ───── mesures croisées : force relative contre le secteur, facteurs, spécificités par classe ───── */
const med = L => { const A = L.filter(Number.isFinite).sort((a, b) => a - b); return A.length ? A[A.length >> 1] : null; };
const actions = lignes.filter(l => l.c === 'action'), cles = l => (l.z || '') + '|' + (l.s || '');
const medSect = {}; for (const l of actions) (medSect[cles(l)] = medSect[cles(l)] || []).push(l.r.m12_1);
for (const l of actions) { const m = med(medSect[cles(l)] || []), x = l.r.m12_1; if (Number.isFinite(x) && Number.isFinite(m) && (medSect[cles(l)] || []).length >= 8) l.r.rsSec = Math.round((x - m) * 1e4) / 1e4; }
const GROUPES = { action: l => l.s || '—' };
for (const classe of ['action', 'ETF', 'devise', 'indice', 'matière première', 'crypto', 'obligataire']) { const L = lignes.filter(l => l.c === classe); if (!L.length) continue; calculerFacteurs(L, classe === 'action' ? {} : { secteur: l => (classe === 'ETF' ? l.cat || '—' : '—'), zone: l => classe === 'ETF' ? 'ETF' : classe }); }
for (const l of lignes) { const f = fiches.get(l.id); if (l.c === 'action' || true) { /* le setup tactique est un score absolu 0-100 */ if (l.r && Number.isFinite(l.r.setup)) l.f.set = l.r.setup; } if (l.c === 'action' && l.evtConnu) l.f.evt = Number.isFinite(l.evt) && l.evt <= 10 ? 25 : 100; }

/* ───── taux (FRED), PPA (Banque mondiale) ───── */
const taux = {}; const SERIES = ['DGS2', 'DGS10', 'DFII10', 'IRLTLT01DEM156N', 'IRLTLT01FRM156N', 'IRLTLT01ITM156N', 'IRLTLT01GBM156N', 'IRLTLT01ESM156N', 'IRLTLT01NLM156N', 'IRLTLT01CHM156N'];
const DEV_PAYS = { USD: 'USA', EUR: 'EMU', GBP: 'GBR', JPY: 'JPN', CHF: 'CHE', CAD: 'CAN', AUD: 'AUS', NZD: 'NZL', SEK: 'SWE', NOK: 'NOR', DKK: 'DNK', PLN: 'POL', CZK: 'CZE', HUF: 'HUN', MXN: 'MEX', TRY: 'TUR', ZAR: 'ZAF', SGD: 'SGP', BRL: 'BRA', CNH: 'CHN', INR: 'IND', ILS: 'ISR', THB: 'THA', CLP: 'CHL', RON: 'ROU' };
const OCDE = { USD: 'USA', EUR: 'EZ', GBP: 'GBR', JPY: 'JPN', CHF: 'CHE', CAD: 'CAN', AUD: 'AUS', NZD: 'NZL', SEK: 'SWE', NOK: 'NOR', DKK: 'DNK', PLN: 'POL', CZK: 'CZE', HUF: 'HUN', MXN: 'MEX', TRY: 'TUR', ZAR: 'ZAF', BRL: 'BRA', INR: 'IND', ILS: 'ISR' };
const FRED_PAYS = { USD: 'IRSTCB01USM156N', EUR: 'IRSTCB01EZM156N' };
for (const id of [...SERIES, ...Object.entries(OCDE).map(([c, p]) => FRED_PAYS[c] || 'IRSTCB01' + (p === 'EZ' ? 'EZ' : p.slice(0, 3)) + 'M156N')]) { if (taux[id]) continue; const t = await obtenir(URL_FRED(id), { texte: true, ms: 40000 }); const S = t ? lireFred(t) : []; if (S.length) taux[id] = S; }
const dernier = (id, nAns = 10) => { const S = taux[id]; if (!S || !S.length) return null; const v = S[S.length - 1][1], H = S.filter(p => p[0] > S[S.length - 1][0] - nAns * 365 * J).map(p => p[1]); return { v, t: S[S.length - 1][0], pct: H.length >= 24 ? H.filter(x => x < v).length / H.length : null }; };
const ppp = {}; for (const [c, p] of Object.entries(DEV_PAYS)) { const j = await obtenir(URL_PPP(p)); const x = j ? lirePPP(j) : null; if (x) ppp[c] = x; }
console.log('séries de taux :', Object.keys(taux).length, '— PPA :', Object.keys(ppp).length);
const prixDe = l => l.px;
for (const l of lignes.filter(x => x.c === 'devise')) {
  const base = l.id.slice(0, 3), cote = l.id.slice(3, 6); l.r.base = base; l.r.cote = cote;
  if (ppp[base] && ppp[cote] && prixDe(l) > 0) { const impl = ppp[cote].valeur / ppp[base].valeur; l.r.ppp = Math.round((impl / prixDe(l) - 1) * 1e4) / 1e4; l.r.pppAnnee = Math.min(ppp[base].annee, ppp[cote].annee); }   // > 0 : la devise de base est sous-évaluée contre la parité
  const tb = dernier(FRED_PAYS[base] || 'IRSTCB01' + (OCDE[base] === 'EZ' ? 'EZ' : (OCDE[base] || '').slice(0, 3)) + 'M156N', 5), tc = dernier(FRED_PAYS[cote] || 'IRSTCB01' + (OCDE[cote] === 'EZ' ? 'EZ' : (OCDE[cote] || '').slice(0, 3)) + 'M156N', 5);
  if (tb && tc) { l.r.carry = Math.round((tb.v - tc.v) * 100) / 100; l.r.tauxBase = tb.v; l.r.tauxCote = tc.v; }
}
const ERP = { US500: ['SP500', 'DGS10'], US100: ['NASDAQ100', 'DGS10'], FRA40: ['CAC40', 'IRLTLT01FRM156N'], DE40: ['DAX40', 'IRLTLT01DEM156N'], DE30: ['DAX40', 'IRLTLT01DEM156N'], UK100: ['FTSE100', 'IRLTLT01GBM156N'], SPA35: ['IBEX35', 'IRLTLT01ESM156N'], ITA40: ['FTSEMIB', 'IRLTLT01ITM156N'], NED25: ['AEX', 'IRLTLT01NLM156N'], SUI20: ['SMI', 'IRLTLT01CHM156N'] };
for (const l of lignes.filter(x => x.c === 'indice')) {
  const e = ERP[l.id]; if (!e) continue; const m = actions.filter(a => a.ix.includes(e[0]) && Number.isFinite(a.r.earnY) && a.r.earnY > -1 && a.r.earnY < 1).map(a => a.r.earnY), t = dernier(e[1]);
  if (m.length >= 10 && t) { l.r.earnMed = Math.round(med(m) * 1e4) / 1e4; l.r.erp = Math.round((med(m) - t.v / 100) * 1e4) / 1e4; l.r.tauxRef = t.v; l.r.nMembres = m.length; }
}
for (const l of lignes.filter(x => x.c === 'matière première')) if (/^(GOLD|SILVER)$/.test(l.id)) { const t = dernier('DFII10'); if (t) { l.r.tauxReel = t.v; l.r.reel = t.pct == null ? null : Math.round((1 - t.pct) * 1e4) / 1e4; } }
for (const l of lignes.filter(x => x.c === 'ETF' && /^Obligations/.test(x.cat || ''))) {
  const id = /euro|Euro/.test(l.cat) ? 'IRLTLT01DEM156N' : /britannique/.test(l.cat) ? 'IRLTLT01GBM156N' : /États-Unis|dollar/.test(l.cat) ? (/1-3/.test(l.cat) ? 'DGS2' : 'DGS10') : 'DGS10', t = dernier(id); if (t) { l.r.tauxRef = t.v; l.r.niv = t.pct == null ? null : Math.round(t.pct * 1e4) / 1e4; l.r.serieTaux = id; }
}
/* lignes de références de taux (non négociables) + CFD obligataires */
const refs = JSON.parse(fs.readFileSync(path.join(cataloguePath, 'obligataire.json'), 'utf8'));
for (const o of refs) {
  const sid = o.serie_fred; if (!sid) continue; const t = dernier(sid); if (!t) continue; let l = lignes.find(x => x.id === o.symbole_xtb);
  if (!l) { l = { id: o.symbole_xtb, y: o.symbole_yahoo, n: o.nom, c: 'obligataire', p: o.pays, z: o.zone, s: null, i: null, d: '%', px: t.v, t: t.t, da: o.dispo, pea: 0, pal: 'A', vx: o.verifie_xtb ? 1 : 0, ix: [], r: {}, f: {}, ref: 1 }; lignes.push(l); }
  l.r.tauxRef = t.v; l.r.niv = t.pct == null ? null : Math.round(t.pct * 1e4) / 1e4; l.r.serieTaux = sid; l.tTaux = t.t;
  if (sid === 'DGS10' && taux.DGS2) { const a = dernier('DGS2'); if (a) { l.r.pente = null; l.r.penteVal = Math.round((t.v - a.v) * 100) / 100; } }
  if (o.pays === 'FR') { const b = dernier('IRLTLT01DEM156N'); if (b) l.r.spreadOatBund = Math.round((t.v - b.v) * 100) / 100; }
}
{ const S = taux.DGS10 && taux.DGS2 ? taux.DGS10.map(p => { const q = taux.DGS2.find(x => x[0] === p[0]); return q ? p[1] - q[1] : null; }).filter(Number.isFinite).slice(-2600) : []; const cur = S.length ? S[S.length - 1] : null; const pct = cur == null ? null : S.filter(x => x < cur).length / S.length; for (const l of lignes.filter(x => x.c === 'obligataire' && x.p === 'US')) if (pct != null) { l.r.pente = Math.round(pct * 1e4) / 1e4; l.r.penteVal = Math.round(cur * 100) / 100; } }
for (const classe of ['devise', 'indice', 'matière première', 'obligataire']) { const L = lignes.filter(l => l.c === classe); calculerFacteurs(L, { secteur: () => '—', zone: () => classe }); for (const l of L) if (l.r && Number.isFinite(l.r.setup)) l.f.set = l.r.setup; }
for (const l of lignes.filter(x => x.c === 'ETF')) { /* les ETF obligataires reçoivent aussi le niveau des taux */ }
{ const L = lignes.filter(l => l.c === 'ETF'); calculerFacteurs(L, { secteur: l => (/^Obligations/.test(l.cat || '') ? 'obligations' : 'actions'), zone: () => 'ETF' }); for (const l of L) { if (l.r && Number.isFinite(l.r.setup)) l.f.set = l.r.setup; if (/^Obligations/.test(l.cat || '') && Number.isFinite(l.r.niv)) l.f.niv = l.r.niv * 100; } }

/* ───── backtest ───── */
const series = new Map(); for (const l of lignes) if (l.c === 'action' && l.pal === 'A') { const M = Mmat.get(l.id); const S = M ? enSerie(M) : null; if (S && S.r.filter(Number.isFinite).length >= 60) series.set(l.id, S); }
const bt = { t: maintenant, univers: series.size, limites: ['biais du survivant : l’univers est celui d’aujourd’hui (les sociétés disparues n’y sont pas)', 'pas de fondamentaux historiques à date : seuls les facteurs fondés sur les prix sont testés', 'rendements mensuels hors coûts de transaction et hors impôts', 'au plus 20 ans d’historique : peu de cycles'] };
if (series.size >= 100) { bt.momentum = backtest(series, SIGNAUX.momentum); bt.saison = backtest(series, SIGNAUX.saison); bt.tendance = backtest(series, SIGNAUX.tendance); }
const ajust = { mom: ajustement(bt.momentum), sai: ajustement(bt.saison), ma: ajustement(bt.tendance) };
console.log('backtest :', JSON.stringify({ mom: bt.momentum && bt.momentum.tstat, sai: bt.saison && bt.saison.tstat, ma: bt.tendance && bt.tendance.tstat }), 'ajustements', JSON.stringify(ajust));

/* ───── écriture : index découpé par classe et zone, saisonnalité, manifeste ───── */
const parFichier = {}; const nomFichier = l => (l.c === 'action' ? 'actions-' + ({ US: 'US', Europe: 'Europe' }[l.z] || 'Autres') : ({ ETF: 'etf', devise: 'devises', indice: 'indices', 'matière première': 'matieres', crypto: 'crypto', obligataire: 'obligataire' })[l.c] || 'autres');
const arrondiF = f => { const o = {}; for (const [k, v] of Object.entries(f || {})) if (Number.isFinite(v)) o[k] = Math.round(v * 10) / 10; return o; };
for (const l of lignes) { l.f = arrondiF(l.f); delete l.evtConnu; (parFichier[nomFichier(l)] = parFichier[nomFichier(l)] || []).push(l); }
const shards = [];
for (const [nom, L] of Object.entries(parFichier)) { L.sort((a, b) => a.id.localeCompare(b.id)); ecrire(path.join(sortie, 'index', nom + '.json'), { t: maintenant, lignes: L }); const S = {}; for (const l of L) { const M = Mmat.get(l.id); if (M && Object.keys(M).length) S[l.id] = encoder(M); } ecrire(path.join(sortie, 'saison', nom + '.json'), S); shards.push({ id: nom, n: L.length, classe: L[0].c }); }
/* fichiers « lite » (une page par première lettre) : de quoi recalculer les verdicts d'une liste de suivi dans le Worker Cloudflare (alertes Telegram) sans charger tout l'index */
fs.mkdirSync(path.join(sortie, 'lite'), { recursive: true }); const lite = {};
for (const l of lignes) { const k = /^[A-Z]/.test(l.id) ? l.id[0] : '0'; (lite[k] = lite[k] || []).push({ id: l.id, n: l.n, c: l.c, p: l.p, z: l.z, pal: l.pal, f: l.f, comp: l.comp, evt: l.evt, dma: l.dma, dsup: l.dsup, hyp: l.hyp, fon: l.fon, disp: l.disp, r: { z: l.r.z, nde: l.r.nde, m12: l.r.m12, financiere: l.r.financiere } }); }
for (const [k, L] of Object.entries(lite)) ecrire(path.join(sortie, 'lite', k + '.json'), { t: maintenant, lignes: L });
const saisonRef = {}; for (const [pays, sym] of Object.entries(BENCH)) if (benchM[sym]) { const M = matriceMensuelle(benchM[sym], maintenant); if (Object.keys(M).length) saisonRef[pays] = { y: sym, ...encoder(M) }; } ecrire(path.join(sortie, 'saison', 'indices-reference.json'), saisonRef);
const compte = {}; for (const l of lignes) compte[l.c] = (compte[l.c] || 0) + 1; const comptePays = {}; for (const l of lignes.filter(x => x.c === 'action')) comptePays[l.p] = (comptePays[l.p] || 0) + 1;
const manifeste = { version: 2, t: maintenant, shards, ajust, fx: fxEur, benchmarks: BENCH, comptes: compte, actionsParPays: comptePays, echecs: stats.echecs.length, taux: Object.fromEntries(Object.keys(taux).map(k => [k, dernier(k)])), ppp, sources: ['Yahoo Finance (prix, séries fondamentales hors États-Unis, recherche)', 'SEC EDGAR (fondamentaux américains)', 'FRED (taux)', 'Banque mondiale (parité de pouvoir d’achat)', 'Nasdaq (calendrier des résultats américains)', 'Table des marges XTB (liste des instruments)'] };
ecrire(path.join(sortie, 'manifest.json'), manifeste); ecrire(path.join(sortie, 'backtest.json'), bt); fs.writeFileSync(path.join(sortie, 'echecs.txt'), stats.echecs.join('\n'));
console.log('écrit :', JSON.stringify(compte), '— actions par pays', JSON.stringify(comptePays));
