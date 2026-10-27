// Tests des données de l'agent : fichiers Kraken OHLCVT (lecture, trous, fusion, SHA-256, reprise de téléchargement), dérivés Binance (financement, intérêt ouvert, archives zip), intégrité.
// Lancer :  node galaxie/tests/agent-donnees-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { analyserCsv, fusionner, trous, resumeTrous, lireSommes, verifierMorceaux, telecharger, lireSerie, MORCEAUX, MOTIF_EXTRACTION, sha256Fichier } from '../../agent-pc/kraken-ohlcvt.mjs';
import { mettreAJourDerives, reduireHoraire, urlArchive, urlFunding, lireDerives } from '../../agent-pc/derives.mjs';
import { verifierIntegrite } from '../../agent-pc/donnees-agent.mjs';
import { depuisBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';

let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-donnees-'));

/* ── CSV Kraken ── */
const csv = ['1700000000,100,101,99,100.5,12.5,30', '1700000900,100.5,102,100,101,8,12', '1700001800,101,101.5,100.8,101.2,5,7', '1700004500,101.2,103,101,102,9,11', 'pas,une,ligne', '1700005400,100,99,101,100,1,1'].join('\n');
const b = analyserCsv(csv);
v('CSV : sans en-tête, horodatage en secondes converti en ms, lignes invalides ignorées (haut < bas)', b.length === 4 && b[0].t === 1700000000000 && b[0].trades === 30 && b[3].c === 102, JSON.stringify(b.length));
const tr = trous(b, 900e3);
v('trous : détectés, JAMAIS remplis (période sans trade)', tr.length === 1 && tr[0].manquantes === 2 && b.length === 4, JSON.stringify(tr));
const rs = resumeTrous(b, 900e3); v('résumé : part manquante = 2 bougies sur 6', rs.manquantes === 2 && Math.abs(rs.partManquante - 2 / 6) < 1e-9 && rs.trous === 1);
const f = fusionner(b.slice(0, 2), [{ ...b[1], c: 999 }, b[2], b[3]]);
v('fusion : une bougie par instant, la première liste (jeu complet) gagne', f.length === 4 && f[1].c === 101 && f.every((x, i) => i === 0 || x.t > f[i - 1].t));
const somme = lireSommes('12ce809a0cc12c421f9bb871434f71eca8b3c258cb194efae258318a683b9491  Kraken_OHLCVT_Full.zip.part00\nautre ligne');
v('fichier de sommes SHA-256 lu', somme['Kraken_OHLCVT_Full.zip.part00'] === '12ce809a0cc12c421f9bb871434f71eca8b3c258cb194efae258318a683b9491' && Object.keys(somme).length === 1);
{
  const d = path.join(tmp, 'morceaux'); fs.mkdirSync(d); const sommes = {};
  for (const nom of MORCEAUX) { const contenu = Buffer.from('contenu de ' + nom); fs.writeFileSync(path.join(d, nom), contenu); sommes[nom] = crypto.createHash('sha256').update(contenu).digest('hex'); }
  v('SHA-256 : tous les morceaux corrects', (await verifierMorceaux(d, sommes)).ok);
  fs.writeFileSync(path.join(d, MORCEAUX[2]), 'ABÎMÉ'); const r = await verifierMorceaux(d, sommes);
  v('SHA-256 : un morceau abîmé est repéré par son nom', !r.ok && r.details.filter(x => !x.ok).map(x => x.nom).join() === MORCEAUX[2]);
  fs.unlinkSync(path.join(d, MORCEAUX[4])); v('SHA-256 : un morceau absent est signalé', (await verifierMorceaux(d, sommes)).details[4].present === false);
}
{
  const gros = Buffer.alloc(300000, 7), dest = path.join(tmp, 'dl', 'x.part'); let appels = [];
  const fetchOk = async (url, opts = {}) => { appels.push(opts.method || (opts.headers && opts.headers.Range) || 'GET'); const range = opts.headers && opts.headers.Range ? Number(/bytes=(\d+)-/.exec(opts.headers.Range)[1]) : 0; const corps = gros.subarray(range);
    if (opts.method === 'HEAD') return { ok: true, status: 200, headers: new Map([['content-length', String(gros.length)]]) };
    return { ok: true, status: range ? 206 : 200, headers: new Map(), body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(corps.subarray(0, Math.min(corps.length, opts.coupe ? 100000 : corps.length)))); c.close(); } }) }; };
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest + '.partiel', gros.subarray(0, 120000));
  const r = await telecharger('https://x.test/f', dest, { fetchImpl: fetchOk });
  v('téléchargement : reprend un fichier partiel (Range) sans tout refaire', !r.deja && fs.statSync(dest).size === 300000 && appels.includes('bytes=120000-'), JSON.stringify(appels));
  const r2 = await telecharger('https://x.test/f', dest, { fetchImpl: fetchOk }); v('téléchargement : déjà complet → rien à faire', r2.deja === true);
  let coupe = false; try { await telecharger('https://x.test/g', path.join(tmp, 'dl', 'g'), { fetchImpl: async (u, o = {}) => o.method === 'HEAD' ? { ok: true, headers: new Map([['content-length', '1000']]) } : { ok: true, status: 200, headers: new Map(), body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(400)); c.close(); } }) } }); } catch (e) { coupe = /incomplet/.test(e.message); }
  v('téléchargement coupé : erreur claire, le fichier partiel est gardé pour reprendre', coupe && fs.existsSync(path.join(tmp, 'dl', 'g.partiel')));
}
{
  const ex = path.join(tmp, 'extrait'); fs.mkdirSync(path.join(ex, 'complet'), { recursive: true }); fs.mkdirSync(path.join(ex, 'Kraken_OHLCVT_2026Q3'), { recursive: true });
  fs.writeFileSync(path.join(ex, 'complet', 'XBTUSD_15.csv'), '1700000000,100,101,99,100.5,12.5,30\n1700000900,100.5,102,100,101,8,12\n'); fs.writeFileSync(path.join(ex, 'Kraken_OHLCVT_2026Q3', 'XBTUSD_15.csv'), '1700000900,1,1,1,1,1,1\n1700001800,101,101.5,100.8,101.2,5,7\n');
  const s = lireSerie(ex, 'BTC', 15);
  v('série Kraken : le jeu complet d’abord, le trimestriel complète sans écraser', s.bougies.length === 3 && s.bougies[1].o === 100.5 && s.sources.length === 2, JSON.stringify(s.sources));
  v('motif d’extraction : BTC, SOL, DOGE en 15 / 60 / 240 minutes seulement', ['XBTUSD_15.csv', 'SOLUSD_240.csv', 'XDGUSD_60.csv', 'DOGEUSD_15.csv'].every(n => new RegExp(MOTIF_EXTRACTION).test(n)) && !['XBTUSD_1.csv', 'ETHUSD_15.csv', 'XBTEUR_15.csv'].some(n => new RegExp(MOTIF_EXTRACTION).test(n)));
}
/* ── dérivés Binance ── */
{
  const j = 86400e3, now = Date.UTC(2026, 9, 27, 12), zipDe = csvTxt => { const nom = Buffer.from('x.csv'), donnees = zlib.deflateRawSync(Buffer.from(csvTxt)); const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(donnees.length, 18); h.writeUInt32LE(csvTxt.length, 22); h.writeUInt16LE(nom.length, 26); return new Uint8Array(Buffer.concat([h, nom, donnees])); };
  const metriques = jour => 'create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio\n' + [0, 5, 60, 65, 120].map((m, i) => jour + ' 00:' + String(m % 60).padStart(2, '0') + ':00,BTCUSDT,' + (1000 + i) + ',' + (50000 * (1000 + i)) + ',1.1,1.2,1.3,0.9').join('\n');
  let appelsFunding = 0, appelsZip = 0;
  const fetchJson = async url => { if (/fundingRate/.test(url)) { appelsFunding++; const t0 = +/startTime=(\d+)/.exec(url)[1]; return appelsFunding > 1 ? [] : Array.from({ length: 120 }, (_, i) => ({ fundingTime: t0 + i * 8 * 3600e3, fundingRate: '0.0001' })); } return []; };
  const fetchOctets = async url => { appelsZip++; const jour = /metrics-(\d{4}-\d\d-\d\d)\.zip/.exec(url)[1]; if (jour === '2026-10-20') throw new Error('HTTP 404'); return zipDe(metriques(jour)); };
  const d = path.join(tmp, 'derives'), r = await mettreAJourDerives({ paire: 'BTC', dossier: d, fetchJson, fetchOctets, maintenant: () => now, joursMetrics: 10, pause: async () => {} });
  v('dérivés : financement chargé (historique complet depuis le début de la paire)', r.financement === 120 && r.fundingNouveaux === 120 && r.financementDernier.taux === 0.0001, JSON.stringify(r.financementDernier));
  v('dérivés : intérêt ouvert chargé, un jour absent (404) est simplement sauté', r.metricsJours === 9 && r.metrics > 0 && r.erreurs.length === 0, JSON.stringify([r.metricsJours, r.metrics]));
  const lu = lireDerives(d, 'BTC'); v('dérivés : relus depuis le disque, une ligne par HEURE (5 minutes réduites)', lu.metrics.length === 9 && lu.metrics.every(x => x.t % 3600e3 === 0 && x.oi > 0), String(lu.metrics.length));
  const z0 = appelsZip; await mettreAJourDerives({ paire: 'BTC', dossier: d, fetchJson, fetchOctets, maintenant: () => now, joursMetrics: 10, pause: async () => {} });
  v('dérivés : deuxième passage → seulement ce qui manque (le jour 404 est réessayé, rien d’autre)', appelsZip - z0 === 1, String(appelsZip - z0));
  let erreur = null; const rr = await mettreAJourDerives({ paire: 'SOL', dossier: d, fetchJson: async () => { throw new Error('HTTP 451'); }, fetchOctets: async () => { throw new Error('x'); }, maintenant: () => now, joursMetrics: 2, pause: async () => {} }).catch(e => { erreur = e; });
  v('dérivés : financement en panne → erreur signalée, rien d’inventé, pas de plantage', !erreur && rr.erreurs.some(x => /financement/.test(x)) && rr.financement === 0);
  v('URLs : symbole de la paire (SOL, DOGE)', /symbol=SOLUSDT/.test(urlFunding('SOLUSDT', 1)) && /DOGEUSDT-metrics-2026-01-02\.zip/.test(urlArchive('DOGEUSDT', '2026-01-02')));
  v('réduction horaire : la dernière valeur de l’heure', reduireHoraire([{ t: 3600e3 * 5 + 1, oi: 1, oiValeur: 1, lsGros: NaN, lsComptes: 1, taker: 1 }, { t: 3600e3 * 5 + 300e3, oi: 2, oiValeur: 2, lsGros: 1, lsComptes: 1, taker: 1 }]).length === 1 && reduireHoraire([{ t: 3600e3 * 5 + 1, oi: 1 }, { t: 3600e3 * 5 + 300e3, oi: 2 }])[0].oi === 2);
}
/* ── intégrité ── */
{
  const bons = depuisBougies([{ t: 0, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }, { t: 900e3, o: 1.5, h: 2, l: 1, c: 1.2, v: 1 }]); v('intégrité : série saine', verifierIntegrite(bons).ok);
  const mauvais = depuisBougies([{ t: 0, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }, { t: 0, o: 1.5, h: 1, l: 1.2, c: 1.2, v: 1 }, { t: -5, o: 1, h: 1, l: 1, c: 1, v: 1 }]); const iv = verifierIntegrite(mauvais);
  v('intégrité : doublon, désordre et bougie incohérente repérés', !iv.ok && iv.doublons === 1 && iv.desordre === 1 && iv.incoherentes >= 1, JSON.stringify(iv));
}
await sha256Fichier(path.join(tmp, 'dl', 'x.part')).then(h => v('sha256Fichier fonctionne sur un fichier', h.length === 64));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
