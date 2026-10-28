import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { AgregateurBarres, trancheDe, prixDeTranche, deltaBarre, pocBarre, profilVolume, noeudsVolume } from '../../strategies/liquidite/barres-flux.js';
import { planArchives, planJournalier, lireLigneAggTrade, resumerAggTrades, resumerBookDepth, resumerMetrics, telecharger, creerHistorique, lireBarresTrades } from '../../agent-pc/flux/historique-trades.mjs';
import { ouvrirZip, lireLignes, fluxDepuisOctets } from '../../agent-pc/flux/zip-flux.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-hist-test-'));
const proche = (a, b, tol) => Math.abs(a - b) <= tol;

/* ZIP minimal à une entrée (méthode 8 ou 0) construit à la main : sert à tester le lecteur sans dépendance. */
function fabriquerZip(nom, contenu, methode = 8) {
  const donnees = Buffer.from(contenu), comp = methode === 8 ? zlib.deflateRawSync(donnees) : donnees, nomB = Buffer.from(nom);
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 6); loc.writeUInt16LE(methode, 8); loc.writeUInt32LE(0, 14); loc.writeUInt32LE(0, 18); loc.writeUInt32LE(0, 22); loc.writeUInt16LE(nomB.length, 26);   // tailles à 0 : « data descriptor » comme les vraies archives
  const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(0, 4); dd.writeUInt32LE(comp.length, 8); dd.writeUInt32LE(donnees.length, 12);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 8); cd.writeUInt16LE(methode, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(donnees.length, 24); cd.writeUInt16LE(nomB.length, 28); cd.writeUInt32LE(0, 42);
  const debutCd = loc.length + nomB.length + comp.length + dd.length, eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + nomB.length, 12); eocd.writeUInt32LE(debutCd, 16);
  return Buffer.concat([loc, nomB, comp, dd, cd, nomB, eocd]);
}

/* ── barres M15 avec empreinte ── */
{
  const barres = []; const A = new AgregateurBarres(b => barres.push(b)), t0 = Date.UTC(2026, 0, 5, 10, 0, 0);
  A.ajouter(t0 + 1000, 100, 2, false); A.ajouter(t0 + 2000, 100.5, 1, true); A.ajouter(t0 + 3000, 100, 1, false); A.ajouter(t0 + 900000 + 5, 101, 3, true);
  A.ajouter(t0 + 10, 99, 1, true);                                                                  // plus vieille que la barre en cours → ignorée et comptée
  A.finir();
  v('barres : deux barres M15 alignées', barres.length === 2 && barres[0].t === t0 && barres[1].t === t0 + 900000);
  v('barres : volume agressif en dollars et nombre de trades', barres[0].achatUsd === 300 && barres[0].venteUsd === 101 && barres[0].n === 3 && barres[0].plusGrosUsd === 200 && deltaBarre(barres[0]) === 199);
  v('barres : ouverture, haut, bas, clôture', barres[0].ouv === 100 && barres[0].haut === 100.5 && barres[0].bas === 100 && barres[0].cloture === 100);
  v('barres : transaction hors ordre ignorée et comptée', A.desordre === 1);
  const fp = barres[0].fp; v('barres : empreinte triée par tranche, achat et vente séparés', fp.length === 2 && fp[0][0] < fp[1][0] && fp.reduce((a, x) => a + x[1], 0) === 300 && fp.reduce((a, x) => a + x[2], 0) === 101, JSON.stringify(fp));
  v('barres : tranche ↔ prix', proche(prixDeTranche(trancheDe(100)), 100, 100 * 0.0002) && pocBarre(barres[0]) > 99.9 && pocBarre(barres[0]) < 100.1);
}
/* ── profil de volume ── */
{
  const mk = (t, lignes) => ({ t, fp: lignes.map(([p, a, v]) => [trancheDe(p), a, v]), achatUsd: 0, venteUsd: 0 });
  const barres = [mk(0, [[100, 1000, 1000], [100.02, 500, 500], [99.98, 300, 200]]), mk(1, [[100, 2000, 1000], [101, 100, 100], [103, 50, 40], [97, 40, 60]])];
  const p = profilVolume(barres);
  v('profil : POC = tranche au plus gros volume (≈ 100)', proche(p.poc, 100, 0.03), String(p.poc));
  v('profil : zone de valeur contient le POC, VAL < POC < VAH', p.val <= p.poc && p.poc <= p.vah && p.vah - p.val < 3, JSON.stringify([p.val, p.poc, p.vah]));
  v('profil : vide → null', profilVolume([]) === null);
  // nœuds : deux gros nœuds séparés par un trou
  const gros = []; for (let i = 0; i < 40; i++) { const p0 = 100 + i * 0.02; const vol = (i >= 5 && i <= 9) || (i >= 28 && i <= 33) ? 5000 : (i >= 15 && i <= 22 ? 20 : 400); gros.push([p0, vol, vol]); }
  const n = noeudsVolume(profilVolume([mk(0, gros)]));
  v('nœuds : deux HVN et au moins un LVN (trou de volume) entre les deux', n.hvn.length >= 2 && n.lvn.length >= 1 && n.lvn.some(x => x.prix > 100.2 && x.prix < 100.6), JSON.stringify({ hvn: n.hvn.length, lvn: n.lvn.map(x => x.prix.toFixed(2)) }));
}
/* ── lecture des archives ── */
{
  v('ligne aggTrade : en-tête ignoré', lireLigneAggTrade('agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker') === null);
  const l = lireLigneAggTrade('1,100.5,2.0,1,1,1767607200000,true,True'); v('ligne aggTrade : vendeur agressif quand is_buyer_maker = true', l && l.vendeurAgresseur === true && l.prix === 100.5 && l.t === 1767607200000);
  v('ligne aggTrade : microsecondes (spot depuis 2025) ramenées en millisecondes', lireLigneAggTrade('1,100.5,2.0,1,1,1767607200000123,false,True').t === 1767607200000);
  v('ligne aggTrade : ligne cassée refusée', lireLigneAggTrade('5,abc,1,1,1,1767607200000,false') === null && lireLigneAggTrade('5,100,0,1,1,1767607200000,false') === null);
  const csv = 'agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker\n' + [1, 2, 3].map(i => i + ',100,1,1,1,' + (Date.UTC(2026, 0, 5, 10, 0, i)) + ',false').join('\n') + '\n4,101,2,1,1,' + (Date.UTC(2026, 0, 6, 0, 1, 0)) + ',true\n';
  const zip = path.join(tmp, 'a.zip'); fs.writeFileSync(zip, fabriquerZip('BTCUSDT-aggTrades-2026-01.csv', csv));
  const z = ouvrirZip(zip); v('zip : entrée lue dans le répertoire central (tailles fiables malgré le data descriptor)', z.nom === 'BTCUSDT-aggTrades-2026-01.csv' && z.tailleOriginale === Buffer.byteLength(csv));
  const r = await resumerAggTrades(z.flux); v('résumé : 4 transactions, 2 jours, barres M15 par jour', r.transactions === 4 && r.jours.size === 2 && r.jours.get('2026-01-05')[0].achatUsd === 300 && r.jours.get('2026-01-06')[0].venteUsd === 202, JSON.stringify([...r.jours.keys()]));
  const zip0 = path.join(tmp, 'b.zip'); fs.writeFileSync(zip0, fabriquerZip('x.csv', 'a\nb\nc', 0)); const lignes = []; await lireLignes(ouvrirZip(zip0).flux, l => lignes.push(l)); v('zip non compressé (méthode 0) lu', lignes.join('|') === 'a|b|c');
  let erreur = null; try { fs.writeFileSync(path.join(tmp, 'c.zip'), Buffer.alloc(100)); ouvrirZip(path.join(tmp, 'c.zip')); } catch (e) { erreur = e.message; } v('zip illisible → erreur claire', /ZIP/.test(erreur || ''));
  const bd = await resumerBookDepth(fluxDepuisOctets(Buffer.from('timestamp,percentage,depth,notional\n2026-01-05 10:00:10,-1.00,5,1000\n2026-01-05 10:00:40,-1.00,5,3000\n2026-01-05 10:01:10,1.00,5,500\n2026-01-05 10:16:00,1.00,5,700\n')));
  v('bookDepth : moyenne par M15 et côté (bid = pourcentage négatif)', bd.barres.length === 2 && bd.barres[0].b1 === 2000 && bd.barres[0].a1 === 500 && bd.barres[1].a1 === 700);
  const me = await resumerMetrics(fluxDepuisOctets(Buffer.from('create_time,symbol,sum_open_interest,sum_open_interest_value,count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,count_long_short_ratio,sum_taker_long_short_vol_ratio\n2026-01-05 10:05:00,BTCUSDT,100,8000000,1.2,1.3,1.4,0.9\n')));
  v('metrics : intérêt ouvert et ratios', me.length === 1 && me[0][1] === 100 && me[0][6] === 0.9);
}
/* ── plan de téléchargement ── */
{
  const maintenant = Date.UTC(2026, 9, 28, 12, 0, 0), p = planArchives({ type: 'aggTrades', marche: 'fut', symbole: 'BTCUSDT', mois: 3, maintenant });
  v('plan : 3 archives mensuelles (juillet, août, septembre) puis des jours d’octobre jusqu’à avant-hier', p.filter(x => x.periode === 'mensuel').map(x => x.date).join() === '2026-07,2026-08,2026-09' && p.filter(x => x.periode === 'jour')[0].date === '2026-10-01' && p[p.length - 1].date === '2026-10-26');
  v('plan : adresses data.binance.vision (comptant et futures)', /data\.binance\.vision\/data\/futures\/um\/monthly\/aggTrades\/BTCUSDT\/BTCUSDT-aggTrades-2026-07\.zip$/.test(p[0].url) && /spot\/daily\/aggTrades\/ETHUSDT\/ETHUSDT-aggTrades-2026-10-01\.zip$/.test(planArchives({ type: 'aggTrades', marche: 'spot', symbole: 'ETHUSDT', mois: 0, maintenant })[0].url));
  const j = planJournalier({ type: 'metrics', marche: 'fut', symbole: 'BTCUSDT', jours: 3, maintenant }); v('plan journalier : 3 derniers jours jusqu’à avant-hier', j.map(x => x.date).join() === '2026-10-24,2026-10-25,2026-10-26');
}
/* ── téléchargement avec reprise (faux serveur) ── */
{
  const contenu = Buffer.from('0123456789'.repeat(100)), dest = path.join(tmp, 'dl', 'f.zip'); let appels = [];
  const faux = async (url, opt) => { const h = opt.headers || {}, debut = h.Range ? Number(h.Range.match(/bytes=(\d+)-/)[1]) : 0; appels.push(debut); if (url.endsWith('404.zip')) return { status: 404, ok: false }; if (debut >= contenu.length) return { status: 416, ok: false };
    const corps = contenu.subarray(debut); return { status: debut ? 206 : 200, ok: true, headers: { get: () => String(corps.length) }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(corps)); c.close(); } }) }; };
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, contenu.subarray(0, 400));
  const r = await telecharger('https://x/f.zip', dest, { fetchImpl: faux }); v('téléchargement : reprise à l’octet 400 (en-tête Range)', appels[0] === 400 && r.reprise && fs.readFileSync(dest).equals(contenu));
  const r2 = await telecharger('https://x/f.zip', dest, { fetchImpl: faux }); v('téléchargement : fichier déjà complet (416) → rien à refaire', r2.reprise === true && fs.readFileSync(dest).equals(contenu));
  const r3 = await telecharger('https://x/404.zip', path.join(tmp, 'dl', 'g.zip'), { fetchImpl: faux }); v('téléchargement : archive absente (404) → signalée, pas d’erreur', r3.absent === true);
}
/* ── historique complet : une archive → fichiers par jour → relecture ── */
{
  const csv = 'agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker\n' + [1, 2, 3].map(i => i + ',100,1,1,1,' + (Date.UTC(2026, 0, 5, 10, 0, i)) + ',false').join('\n') + '\n4,101,2,1,1,' + (Date.UTC(2026, 0, 6, 0, 1, 0)) + ',true\n';
  const zipOctets = fabriquerZip('BTCUSDT-aggTrades-2026-01.csv', csv); const dos = path.join(tmp, 'agent'); const logs = [];
  const faux = async () => ({ status: 200, ok: true, headers: { get: () => String(zipOctets.length) }, body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(zipOctets)); c.close(); } }) });
  const H = creerHistorique({ dossier: dos, fetchImpl: faux, journal: m => logs.push(m) });
  const a = { periode: 'mensuel', date: '2026-01', url: 'https://data.binance.vision/x.zip' };
  v('historique : une archive mensuelle traitée', await H.traiterAggTrades('fut', 'BTCUSDT', a) === 'fait');
  v('historique : la deuxième fois, rien n’est refait (reprise)', await H.traiterAggTrades('fut', 'BTCUSDT', a) === 'deja');
  const b = lireBarresTrades(dos, 'fut', 'BTCUSDT', Date.UTC(2026, 0, 5), Date.UTC(2026, 0, 6, 23, 59));
  v('historique : barres relues pour la période', b.length === 2 && b[0].achatUsd === 300 && b[1].venteUsd === 202);
  v('historique : l’archive téléchargée est supprimée après résumé (disque limité)', !fs.existsSync(path.join(dos, 'flux-historique', '_telechargements', 'trades-fut-BTCUSDT-2026-01.zip')));
  v('historique : résumé du statut', H.resume()['fut-BTCUSDT'].jours === 2 && H.resume()['fut-BTCUSDT'].du === '2026-01-05');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
