// KEPLER V8 : test du module unique shared/portfolio.js et du registre (agent-pc/registre.mjs).
//   node galaxie/tests/portfolio-v8-test.mjs
// 1) PC et téléphone obtiennent EXACTEMENT le même résultat au centime pour un même registre et un même prix : le fichier est chargé trois fois, dans trois contextes
//    indépendants (Node = service ; « fenêtre PC » et « fenêtre téléphone » = deux contextes vm avec leur propre window, comme deux navigateurs), et les sorties sont comparées.
// 2) Les bugs listés pour la V8 sont couverts un par un.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../..'), source = fs.readFileSync(path.join(racine, 'shared/portfolio.js'), 'utf8');
let ok = 0, ko = 0; const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); } };
const K = createRequire(import.meta.url)(path.join(racine, 'shared/portfolio.js'));
const fenetre = nom => { const w = { nom, Intl, Date, Math, JSON, Number, Object, Array, String, Map, Set, isFinite, parseFloat }; w.window = w; vm.createContext(w); vm.runInContext(source, w, { filename: nom + '/portfolio.js' }); return w.KeplerPortefeuille; };
const PC = fenetre('pc'), TEL = fenetre('telephone');

const H = 3600e3, T0 = Date.UTC(2026, 10, 1, 8), Q = 900e3;
const tr = (id, actif, sens, statut, o = {}) => ({ id, actif, sens, strategie: o.strategie || 'Essai', tf: 'M15', tSignal: o.tSignal ?? T0, tValide: o.tValide ?? (o.tSignal ?? T0) + 4 * H, tEntree: o.tEntree ?? null, entree: o.entree, stop: o.stop, tp: o.tp ?? null, statut, tSortie: o.tSortie ?? null, sortie: o.sortie ?? null, raison: o.raison ?? null, motif: o.motif || '', R: o.R ?? null, ancienFormat: !!o.ancienFormat, fraisR: o.fraisR ?? null });
const registre = { v: 1, version: 42, risquePct: 1, trades: [
  tr('a', 'BTC', 1, 'cloturee', { entree: 76000, stop: 75500, tp: 77000, tEntree: T0 + Q, tSortie: T0 + 6 * Q, R: 1.87, raison: 'tp', fraisR: 0.13 }),
  tr('b', 'SOL', -1, 'cloturee', { entree: 93.48, stop: 95.91, tp: 86.19, tEntree: T0 + 2 * H, tSortie: T0 + 5 * H + 3 * Q, R: -1.1043, raison: 'sl' }),
  tr('c', 'DOGE', -1, 'cloturee', { entree: 0.0756, stop: 0.0760, tp: 0.0746, tEntree: T0 + 3 * H, tSortie: T0 + 7 * H + Q, R: 0.43, motif: 'stop remonté à l’entrée touché' }),
  tr('d', 'DOGE', -1, 'ouverte', { entree: 0.07604682923738826, stop: 0.07649619686470009, tp: 0.07463, tSignal: T0 + 8 * H, tEntree: T0 + 8 * H + Q, ancienFormat: true }),
  tr('e', 'DOGE', -1, 'ouverte', { entree: 0.0755757419111625, stop: 0.07602232584063755, tp: 0.07463, tSignal: T0 + 9 * H, tEntree: T0 + 9 * H + 2 * Q }),
  tr('f', 'SOL', -1, 'ouverte', { entree: 93.48302253328558, stop: 95.91362760289496, tp: 86.19, tSignal: T0 + 10 * H, tEntree: T0 + 10 * H }),
  tr('g', 'SOL', -1, 'en_attente', { entree: 92.1146264717953, stop: 92.6742767783612, tp: 90.87, tSignal: T0 + 11 * H, tValide: T0 + 15 * H }),
  tr('h', 'ETH', 1, 'ignoree', { entree: 2240, stop: 2220, tSignal: T0 + 11 * H, raison: 'ignore_inverse' }),
  tr('i', 'HYPE', 1, 'annulee', { entree: 83.4, stop: 82.9, tSignal: T0 + 6 * H, raison: 'expiration' })
] };
const prix = { BTC: 76455.5, ETH: 2242.51, SOL: 91.4, HYPE: 83.43, DOGE: 0.0736326 }, opts = { maintenant: T0 + 12 * H };

/* 1) Parité au centime */
const rN = K.calculer(registre, prix, opts), rPC = PC.calculer(registre, prix, opts), rTel = TEL.calculer(registre, prix, opts);
const empreinte = r => JSON.stringify({ capital: r.capital, realise: r.capitalRealise, flottant: r.flottantUsd, gain: r.gainUsd, pnl: r.pnl, viv: r.vivantes.map(l => [l.id, l.numero, l.taille && l.taille.quantite, l.flottantUsd]), courbe: r.courbe, stats: r.stats, dd: r.baisseMaxPct });
v('PC et téléphone : même capital au centime', rPC.capital === rTel.capital && Math.round(rPC.capital * 100) === Math.round(rTel.capital * 100), rPC.capital + ' / ' + rTel.capital);
v('PC, téléphone et service : sorties identiques champ par champ', empreinte(rPC) === empreinte(rTel) && empreinte(rTel) === empreinte(rN));
v('PC et téléphone : même texte affiché', PC.usd(rPC.capital) === TEL.usd(rTel.capital) && PC.etiquetteVivante(rPC.vivantes[0]) === TEL.etiquetteVivante(rTel.vivantes[0]), PC.usd(rPC.capital));
v('capital = 10 000 + réalisé + flottant (au centime)', Math.abs(rN.capital - (10000 + rN.realiseUsd + rN.flottantUsd)) < 0.005, rN.capital + ' vs ' + (10000 + rN.realiseUsd + rN.flottantUsd));
v('montants arrondis au centime', [rN.capital, rN.flottantUsd, rN.realiseUsd, ...Object.values(rN.pnl).map(p => p.usd)].every(x => Math.abs(x * 100 - Math.round(x * 100)) < 1e-6));
const r2 = K.calculer(registre, { ...prix, SOL: 91.39 }, opts); v('le flottant suit le prix (SOL −0,01 → le capital change)', r2.capital !== rN.capital && r2.flottantUsd > rN.flottantUsd);

/* 2) Bugs V8 */
v('« 1 position ouverte » alors que 3 sont en cours : 3 comptées', rN.nOuverts === 3 && rN.vivantes.filter(l => l.statut === 'ouverte').length === 3, String(rN.nOuverts));
v('flottant : AUCUNE position ouverte ignorée (ancien format compris)', rN.vivantes.filter(l => l.statut === 'ouverte').every(l => l.flottantUsd != null) && Math.abs(rN.flottantUsd - rN.vivantes.reduce((s, l) => s + (l.flottantUsd || 0), 0)) < 0.011);
v('en attente : ne compte pas dans le flottant', rN.vivantes.find(l => l.id === 'g').flottantUsd === null && rN.nEnAttente === 1);
v('sorties à l’heure réelle (pas toutes à la même heure)', new Set(rN.trades.filter(t => t.statut === 'cloturee').map(t => new Date(t.tSortie).getUTCHours() + ':' + new Date(t.tSortie).getUTCMinutes())).size === 3);
v('stop touché en gain → « Stop suiveur (gain) », jamais « SL ✓ »', K.libelleSortie(rN.trades.find(t => t.id === 'c').raison) === 'Stop suiveur (gain)' && K.libelleSortie(K.raisonSortie('stop touché', 0.4)) === 'Stop suiveur (gain)' && K.libelleSortie(K.raisonSortie('stop touché', -1)) === 'SL');
const fOuv = K.ficheCopie(rN.vivantes.find(l => l.id === 'f')), fAtt = K.ficheCopie(rN.vivantes.find(l => l.id === 'g'));
v('« valable jusqu’à » : seulement pour un ordre en attente', fOuv.validite === null && /valable jusqu’à/.test(fAtt.validite || ''), JSON.stringify([fOuv.validite, fAtt.validite]));
v('numérotation #1, #2 par actif (DOGE #1 et #2, SOL #1 ouverte et #2 en attente)', rN.numeros.d === 1 && rN.numeros.e === 2 && rN.numeros.f === 1 && rN.numeros.g === 2, JSON.stringify(rN.numeros));
v('risque total engagé par actif affiché (DOGE : 2 positions)', rN.risqueParActif.DOGE && rN.risqueParActif.DOGE.ouvertes === 2 && rN.risqueParActif.DOGE.usd > 0);
v('une seule fonction de stats : stats(trades) = celles du portefeuille', JSON.stringify(K.stats(rN.trades)) === JSON.stringify(rN.stats) && rN.stats.n === 3);
v('stats par stratégie et par actif présentes', rN.parActif.length === 3 && rN.parStrategie.length === 1);
v('période des stats indiquée', /depuis le début du registre/.test(rN.periode.texte));
const c1 = K.calculer({ ...registre, risquePct: 1 }, {}, opts).courbe, c2 = K.calculer({ ...registre, risquePct: 2 }, {}, opts).courbe;
v('courbe rejouée : dépend du risque par trade', c1[c1.length - 1][1] !== c2[c2.length - 1][1] && Math.abs((c2[c2.length - 1][1] - 10000) / (c1[c1.length - 1][1] - 10000) - 2) < 0.1);
v('risque borné (0,1 % à 2 %, 1 % par défaut)', K.bornerRisque(5) === 2 && K.bornerRisque(null) === 1 && K.bornerRisque(0.05) === 0.1);
v('ignorées et annulées : hors du capital', rN.nIgnores === 1 && rN.nAnnules === 1 && !rN.vivantes.some(l => l.id === 'h' || l.id === 'i'));

/* Taille de position */
const t = K.taille({ actif: 'DOGE', capital: 10000, risquePct: 1, entree: 0.0756, stop: 0.0760, tp: 0.0746 });
v('taille : quantité = (capital × risque) / |entrée − stop|, au pas de lot Kraken', Math.abs(t.quantite - 250000) < 1e-6 && t.risqueUsd === 100 && t.gainVise === 250 && Math.abs(t.notionnel - 18900) < 0.01, JSON.stringify(t));
const tb = K.taille({ actif: 'BTC', capital: 12345.67, risquePct: 1, entree: 76000, stop: 75500 });
v('taille BTC : 8 décimales au plus, jamais au-dessus du risque', Number(tb.quantite.toFixed(8)) === tb.quantite && tb.risqueUsd <= 123.46, JSON.stringify(tb));

/* Formats de prix (virgule française) */
v('formats : BTC 0, ETH 2, SOL 2, HYPE 3, DOGE 5 décimales', K.prix('BTC', 76455.5) === '76 456' && K.prix('ETH', 2242.514) === '2 242,51' && K.prix('SOL', 91.4) === '91,40' && K.prix('HYPE', 83.4312) === '83,431' && K.prix('DOGE', 0.0736326) === '0,07363', [K.prix('BTC', 76455.5), K.prix('ETH', 2242.514), K.prix('HYPE', 83.4312), K.prix('DOGE', 0.0736326)].join(' | '));
const gr = K.graduations('DOGE', 0.07361, 0.07364, 8);
v('axe des prix : aucun doublon une fois formaté', new Set(gr.map(g => g.texte)).size === gr.length && gr.length >= 2, gr.map(g => g.texte).join(' '));
v('message Telegram : quantité, entrée, stop (−$), objectif (+$), R:R, validité', (() => { const m = K.messageTelegram('proposition', { ...rN.vivantes.find(l => l.id === 'g') }, { raisonTexte: 'test' }); return /🔴 VENTE SOL · M15/.test(m) && /Quantité : /.test(m) && /Stop : 92,67 \(−\d+ \$\)/.test(m) && /Objectif : 90,87 \(\+\d+ \$\)/.test(m) && /R:R 1:/.test(m) && /valable jusqu’à/.test(m); })());
v('prix Kraken : lecture du ticker (clés XXBTZUSD, XDGUSD…)', JSON.stringify(K.lirePrixKraken({ result: { XXBTZUSD: { c: ['76455.5'] }, XDGUSD: { c: ['0.0736'] }, HYPEUSD: { c: ['83.4'] } } })) === JSON.stringify({ BTC: 76455.5, DOGE: 0.0736, HYPE: 83.4 }));

/* 3) Registre côté service : règle des sens opposés entre les deux moteurs, ancien format H1, version qui ne monte que si une ligne change */
const { creerRegistre, ligneTrader } = await import(pathToFileURL(path.join(racine, 'agent-pc/registre.mjs')).href);
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'kepler-v8-')), journal = [];
const reg = creerRegistre({ dossier, maintenant: () => T0 + 12 * H, journal: (c, m) => journal.push(m) });
const propsTrader = [{ id: 'T1', actif: 'DOGE', setup: 's', nom: 'Balayage · H1', tf: 'H1', sens: -1, tSignal: T0, t: T0, ttl: 32, entree: 0.076, stop: 0.0765, cible1: 0.0746, statut: 'ouverte', tEntree: T0 + Q, source: 'direct' }];
reg.brancher({ trader: () => propsTrader, volume: () => [] });
v('signal ACHAT DOGE pendant une VENTE ouverte : ignoré', reg.filtrerSignal({ id: 'X', actif: 'DOGE', sens: 1, strategie: 'Impulsion', source: 'volume', tSignal: T0 + 2 * H, entree: 0.077, stop: 0.0765 }) === true);
v('… et journalisé « ignoré : position inverse ouverte »', journal.some(m => /ignoré : position inverse ouverte/.test(m)));
v('signal VENTE DOGE (même sens) : autorisé', reg.filtrerSignal({ id: 'Y', actif: 'DOGE', sens: -1, entree: 0.0757, stop: 0.0762 }) === false);
const a1 = reg.construire(), a2 = reg.construire();
v('registre : version stable si rien ne change', a1.registre.version === a2.registre.version && a2.change === false);
v('registre : la ligne ignorée est visible (statut « ignorée »)', a1.registre.trades.some(x => x.statut === 'ignoree' && /position inverse/.test(x.note)));
propsTrader[0].statut = 'cloturee'; propsTrader[0].resultat = { statut: 'cloturee', R: -1.05, motif: 'stop touché', couts: 0.05 }; propsTrader[0].tSortieBougie = T0 + 5 * H;
const a3 = reg.construire(); v('registre : version +1 quand une ligne change', a3.change && a3.registre.version === a1.registre.version + 1);
const l = ligneTrader({ ...propsTrader[0], statut: 'ouverte' }, T0 + H);
v('position H1 ouverte avant la V8 : « ancien format », nom sans suffixe -H1, entrée M15', l.ancienFormat === true && l.strategie === 'Balayage' && l.tf === 'M15' && l.contexte === 'H1');
const lt = ligneTrader(propsTrader[0], T0 + H);
v('sortie : heure de la bougie où le stop est touché', lt.tSortie === T0 + 5 * H && lt.raison === 'sl' && lt.sortie === 0.0765);

console.log('portfolio-v8 : ' + ok + ' vérifications OK' + (ko ? ', ' + ko + ' ÉCHEC(S)' : ''));
process.exit(ko ? 1 : 0);
