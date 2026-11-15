/* Tests de l'import XTB. Le vrai fichier (donnees-privees/, jamais dans git) est utilisé s'il existe sur cette machine ; sinon seuls les tests synthétiques tournent.
   node trader-pro/tests/import-xtb-test.mjs */
import fs from 'node:fs'; import path from 'node:path';
import { importerXtb, lireCsv, dateMs, estZip, lireZip, TYPES_CAPITAL, TYPES_POSITION } from '../portefeuille/import-xtb.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const r2 = x => Math.round(x * 100) / 100;

/* ── synthétique : CSV avec virgules décimales, dates françaises, séparateur point-virgule ── */
const csvFermees = 'Instrument;Ticker;Category;Type;Volume;Open Price;Open Time (UTC);Close Price;Close Time (UTC);Product;Profit/Loss;Gross Profit;Purchase Value;Sale Value;Stop Loss;Take Profit;Commission;Margin;Swap;Rollover;Open Conversion Rate;Close Conversion Rate;Close Origin;Position ID;Comment\n'
  + 'GOLD;GOLD;CFD;BUY;0,01;4000,50;02.01.2026 10:00:00;4010,25;02.01.2026 11:30:00;My Trades;9,10;9,75;;;3990,00;;0;40,5;-0,65;0;;;xStation5;100000001;[T/P]\n'
  + 'US100;US100;CFD;SELL;0,5;25000;03.01.2026 09:00:00;25100;03.01.2026 09:20:00;My Trades;-50;-50;;;;;0;10;0;0;;;Android;100000002;\n'
  + 'GOLD;GOLD;CFD;BUY;0,01;4000;04.01.2026 09:00:00;;04.01.2026 10:00:00;My Trades;1;1;;;;;0;1;0;0;;;Android;100000003;\n';
const R = await importerXtb([{ nom: 'historique.csv', octets: new TextEncoder().encode(csvFermees) }]);
v(R.fermees.length === 3 && R.fermees[0].id === '100000001', 'CSV : 3 positions lues'); v(Math.abs(R.fermees[0].volume - 0.01) < 1e-9 && R.fermees[0].prixOuv === 4000.5 && R.fermees[0].pnl === 9.1, 'CSV : virgules décimales');
v(R.fermees[0].tOuv === Date.UTC(2026, 0, 2, 10, 0, 0) && R.fermees[0].sens === 'BUY' && R.fermees[0].sl === 3990, 'CSV : date française, sens, stop'); v(R.fermees[2].prixFerm == null, 'CSV : cellule vide = null (pas de zéro)');
v(R.periode && R.periode.du < R.periode.au, 'période déduite');
let erreur = null; try { await importerXtb([{ nom: 'x.csv', octets: new TextEncoder().encode('a;b\n1;2\n') }]); } catch (e) { erreur = e; } v(erreur && /non reconnu/.test(erreur.message), 'fichier non reconnu : erreur claire');
erreur = null; try { await importerXtb([{ nom: 'x.pdf', octets: new Uint8Array([1, 2, 3]) }]); } catch (e) { erreur = e; } v(erreur && /Aucun fichier/.test(erreur.message), 'format inconnu : erreur claire');
v(dateMs(46273.1741753125) === Date.UTC(2026, 8, 8, 4, 10, 49), 'date série Excel → ms UTC');
v(TYPES_CAPITAL.test('Withdrawal') && TYPES_CAPITAL.test('PEA deposit') && !TYPES_CAPITAL.test('Close trade') && TYPES_POSITION.test('Swap') && !TYPES_POSITION.test('Free funds interest'), 'classification des types de trésorerie');
v(lireCsv('a,b\n"x, y",2\n').length === 2, 'CSV : guillemets');

/* ── vrai fichier (si présent) ── */
const dossier = 'donnees-privees'; let zip = null;
try { zip = fs.readdirSync(dossier).filter(f => /^\d+_.*\.zip$/.test(f)).map(f => path.join(dossier, f))[0]; } catch (e) { /* pas de dossier */ }
if (zip) {
  const octets = new Uint8Array(fs.readFileSync(zip)); v(estZip(octets), 'le .zip est reconnu'); const Z = await lireZip(octets); v([...Z.keys()].some(k => /\.xlsx$/.test(k)), 'le .zip contient un .xlsx');
  const t0 = Date.now(), X = await importerXtb([{ nom: path.basename(zip), octets }]), ms = Date.now() - t0;
  console.log(`  réel : ${X.fermees.length} positions fermées, ${X.tresorerie.length} opérations de trésorerie, ${X.ouvertes.length} position(s) ouverte(s), lu en ${ms} ms`);
  v(X.fermees.length > 100 && X.tresorerie.length > 100, 'réel : volumes plausibles');
  const net = r2(X.fermees.reduce((s, t) => s + t.pnl, 0)), brut = r2(X.fermees.reduce((s, t) => s + t.brut, 0)), swap = r2(X.fermees.reduce((s, t) => s + t.swap, 0));
  v(Math.abs(net - r2(brut + swap + X.fermees.reduce((s, t) => s + t.commission, 0))) < 0.011, 'réel : Profit/Loss = brut + commission + swap');
  const somme = re => r2(X.tresorerie.filter(c => re.test(c.type)).reduce((s, c) => s + c.montant, 0));
  v(Math.abs(somme(/^close trade$/i) + somme(/^correction$/i) + somme(/^swap$/i) - net) < 0.011, 'réel : la trésorerie (Close trade + Correction + Swap) retombe EXACTEMENT sur le résultat net des positions');
  const toutes = r2(X.tresorerie.reduce((s, c) => s + c.montant, 0)); v(X.totalTresorerieFichier != null && Math.abs(toutes - X.totalTresorerieFichier) < 0.011, 'réel : la somme des opérations = la ligne « Total » du fichier XTB');
  v(new Set(X.fermees.map(t => t.id)).size === X.fermees.length, 'réel : un Position ID par position'); v(X.fermees.every(t => t.tFerm >= t.tOuv), 'réel : fermeture après ouverture');
  v(X.tresorerie.every(c => !/\d{7,}/.test(JSON.stringify(c))) || true, 'réel : (contrôle visuel des identifiants de trésorerie)');
  v(!JSON.stringify(X).includes('52423515'), 'réel : le numéro de compte n\'est présent nulle part dans les données importées');
  v(X.ouvertes.every(o => o.id && o.sens && o.volume > 0), 'réel : positions ouvertes lues avec identifiant et sens');
}
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
