// M6 partie 1 et 2 : intégrité des données, recoupement, reproductibilité, sauvegardes, coûts, santé, paires.
// Lancer :  node planetes/mars/tests/m6-fiabilite-test.mjs
import { auditerBougies, fraicheur, recouper, correlation, PAS } from '../pc/agent-m6/integrite.js';
import { empreinte, empreinteSerie, signerResultat, verifierResultat, memesConditions, emballer, deballer, creerSauvegardes } from '../pc/agent-m6/reproductibilite.js';
import { coutEnR, coutMoyenTrades, sensibiliteCouts, phraseFragilite, coutsDe, configMoteurDe } from '../pc/agent-m6/couts.js';
import { construireSante, creerJournalErreurs } from '../pc/agent-m6/sante.js';
import { PAIRES, ORDRE_PAIRES, trouverPaire, sourceBinance, analyserKraken, urlKraken } from '../pc/agent-m6/paires.js';
import { depuisBougies } from '../pc/agent-btc/colonnes.js';
import { simuler } from '../pc/agent-btc/moteur.js';
import { alea } from '../pc/mars-calcul.js';
import { bougiesSynth } from './synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const T0 = Date.UTC(2025, 0, 1), P = PAS.M15;
const barres = (n, t0 = T0) => bougiesSynth({ segments: [{ n, derive: 0, bruit: 0.2, volume: 100 }], graine: 4, t0 });

// ── intégrité ──
{
  const b = barres(500);
  const a0 = auditerBougies(b);
  v('série propre : niveau ok, aucun problème', a0.niveau === 'ok' && a0.problemes.length === 0 && a0.manquantes === 0, a0.phrase);
  const trou = b.filter((_, i) => i < 100 || i >= 112), a1 = auditerBougies(trou);
  v('trou de 12 bougies détecté et compté', a1.trous.length === 1 && a1.trous[0].manquantes === 12 && a1.manquantes === 12, JSON.stringify(a1.trous));
  const dbl = [...b.slice(0, 50), b[49], ...b.slice(50)], a2 = auditerBougies(dbl);
  v('doublon détecté', a2.doublons === 1 && a2.niveau === 'attention', a2.phrase);
  const dec = b.map(x => ({ ...x, t: x.t + 3600e3 + 1000 })), a3 = auditerBougies(dec);
  v('heures non alignées détectées (niveau ko)', a3.desalignees === b.length && a3.niveau === 'ko');
  const inv = b.map((x, i) => (i === 10 ? { ...x, h: x.l - 1 } : x)), a4 = auditerBougies(inv);
  v('bougie invalide (haut < bas) détectée', a4.invalides === 1 && a4.niveau === 'ko');
  const rec = [...b.slice(0, 20), b[5], ...b.slice(20)], a5 = auditerBougies(rec);
  v('recul dans le temps détecté', a5.reculs >= 1 && a5.niveau === 'ko', a5.phrase);
  const saut = b.map((x, i) => (i >= 30 ? { ...x, o: x.o * 1.6, h: x.h * 1.6, l: x.l * 1.6, c: x.c * 1.6 } : x)), a6 = auditerBougies(saut);
  v('saut de prix aberrant détecté', a6.sauts.length === 1 && a6.niveau === 'attention', JSON.stringify(a6.sauts));
  const vn = b.map((x, i) => (i >= 40 && i < 55 ? { ...x, v: 0 } : x)), a7 = auditerBougies(vn);
  v('volume nul en série détecté', a7.problemes.some(p => p.code === 'volume_nul'));
}
// ── fraîcheur ──
{
  const derniere = T0, f1 = fraicheur(derniere, derniere + P + 60e3), f2 = fraicheur(derniere, derniere + 6 * P), f3 = fraicheur(derniere, derniere + 40 * P);
  v('fraîcheur : bougie juste fermée = ok', f1.etat === 'ok');
  v('fraîcheur : 6 bougies de retard = attention, 40 = périmé (ko)', f2.etat === 'attention' && f3.etat === 'ko' && /PÉRIMÉ/.test(f3.phrase));
  v('fraîcheur : aucune donnée = ko', fraicheur(NaN, 0).etat === 'ko');
}
// ── recoupement ──
{
  const a = barres(800), a2 = alea(5), b = a.map(x => ({ ...x, c: x.c * (1 + (a2() - 0.5) * 0.0006), v: x.v * 0.9 }));
  const r = recouper(a, b, { nomA: 'Binance', nomB: 'Kraken' });
  v('recoupement : deux sources cohérentes = ok', r.niveau === 'ok' && r.decalage === 0 && r.correlation > 0.95, r.phrase);
  const decale = b.map((x, i) => ({ ...x, t: a[Math.min(a.length - 1, i + 4)].t }));          // Kraken dont les heures sont avancées d'une heure
  const r2 = recouper(a, decale, { nomA: 'Binance', nomB: 'Kraken' });
  v('recoupement : une heure de décalage est DÉTECTÉE', r2.niveau === 'ko' && r2.decalage !== 0, r2.phrase);
  const faux = b.map((x, i) => (i > 100 && i < 400 ? { ...x, c: x.c * 1.03 } : x)), r3 = recouper(a, faux, { nomA: 'A', nomB: 'B' });
  v('recoupement : prix décalé de 3 % signalé', r3.niveau !== 'ok' && r3.partHorsTolerance > 0.2, r3.phrase);
  v('recoupement : trop peu de bougies communes = impossible', recouper(a.slice(0, 5), b.slice(0, 5)).niveau === 'ko');
  v('corrélation de variables égales = 1', Math.abs(correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
}
// ── reproductibilité ──
{
  v('empreinte stable et sensible', empreinte('abc') === empreinte('abc') && empreinte('abc') !== empreinte('abd') && empreinte('abc').length === 16);
  const s = depuisBougies(barres(300)), e1 = empreinteSerie(s), s2 = depuisBougies(barres(300)); s2.c[150] += 1e-9;
  v('empreinte de série : identique pour les mêmes données', empreinteSerie(depuisBougies(barres(300))) === e1);
  v('empreinte de série : change au moindre nombre (1e-9 sur un prix)', empreinteSerie(s2) !== e1);
  const sd = depuisBougies(bougiesSynth({ segments: [{ n: 100, derive: 0, bruit: 0.2, volume: 100 }], graine: 4, t0: T0, prix: 0.08 })), sd2 = depuisBougies(bougiesSynth({ segments: [{ n: 100, derive: 0, bruit: 0.2, volume: 100 }], graine: 4, t0: T0, prix: 0.080001 }));
  v('empreinte : distingue des prix de DOGE qui ne diffèrent que de 0,001 %', empreinteSerie(sd) !== empreinteSerie(sd2));
  const r = signerResultat({ R: 12.5, n: 160 }, { donnees: { paire: 'BTC', empreinte: e1 }, graine: 42, criteres: 'c9995253', config: { risquePct: 1 } });
  v('résultat signé : vérifiable', verifierResultat(r).ok && r.meta.codeVersion === 'm6.1');
  const triche = JSON.parse(JSON.stringify(r)); triche.resultat.R = 99;
  v('résultat modifié : sceau cassé', !verifierResultat(triche).ok);
  const triche2 = JSON.parse(JSON.stringify(r)); triche2.meta.graine = 43;
  v('conditions modifiées : sceau cassé', !verifierResultat(triche2).ok);
  const r2 = signerResultat({ R: 12.5, n: 160 }, { donnees: { paire: 'SOL', empreinte: e1 }, graine: 42, criteres: 'c9995253', config: { risquePct: 1 } });
  const cmp = memesConditions(r, r2); v('conditions différentes listées (données)', !cmp.memes && cmp.differences.includes('données'));
  v('non signé refusé', !verifierResultat({ resultat: 1 }).ok);
  // le moteur est reproductible : deux exécutions = résultats identiques à la virgule près
  const serie = depuisBougies(bougiesSynth({ segments: [{ n: 4000, derive: 0.01, bruit: 0.15, volume: 100 }], graine: 8, t0: T0 }));
  const sig = { sens: new Int8Array(serie.n), stop: new Float64Array(serie.n), R: 3 }; for (let i = 100; i < serie.n - 50; i += 211) { sig.sens[i] = 1; sig.stop[i] = serie.c[i] * 0.99; }
  const x1 = simuler(serie, sig, {}), x2 = simuler(serie, sig, {});
  v('moteur : même entrée = même sortie (reproductible)', JSON.stringify(x1.trades) === JSON.stringify(x2.trades) && x1.trades.length > 5);
}
// ── sauvegardes ──
{
  const disque = new Map(), stock = { lire: async k => disque.get(k) || null, ecrire: async (k, v) => { disque.set(k, v); }, supprimer: async k => { disque.delete(k); }, liste: async () => [...disque.keys()] };
  let t = 1000; const sv = creerSauvegardes(stock, { garder: 3, maintenant: () => t++ });
  const etat = { profil: { risque: 1 }, journal: [1, 2, 3], compte: { fermees: [] } };
  const env = emballer(etat); v('enveloppe : relit le même état', JSON.stringify(deballer(env)) === JSON.stringify(etat));
  const corrompue = { ...env, contenu: env.contenu.replace('journal', 'journaX') };
  let leve = false; try { deballer(corrompue); } catch (e) { leve = /corrompue/.test(e.message); } v('contenu altéré : corruption détectée', leve);
  let leve2 = false; try { deballer({ ...env, contenu: env.contenu.slice(0, -5) }); } catch (e) { leve2 = /tronquée/.test(e.message); } v('contenu tronqué : détecté', leve2);
  (async () => {
    for (let i = 0; i < 5; i++) await sv.sauver('pilote', { ...etat, i });
    const e1 = await sv.etat('pilote'); v('rotation : 3 sauvegardes gardées sur 5', e1.n === 3 && e1.corrompues === 0, JSON.stringify(e1));
    const r1 = await sv.restaurer('pilote'); v('restauration de la plus récente', r1.etat && r1.etat.i === 4);
    // on corrompt la plus récente : la précédente valide est restaurée, la corrompue est signalée
    const cles = (await stock.liste()).sort(), derniere = cles[cles.length - 1], e = await stock.lire(derniere); await stock.ecrire(derniere, { ...e, contenu: e.contenu.replace('"i":4', '"i":9') });
    const r2 = await sv.restaurer('pilote'); v('plantage / corruption : retombe sur la précédente valide', r2.etat && r2.etat.i === 3 && r2.rejetees.length === 1, JSON.stringify(r2.rejetees));
    const e2 = await sv.etat('pilote'); v('état des sauvegardes : 1 corrompue comptée', e2.corrompues === 1 && e2.derniere != null);
    const vide = await creerSauvegardes({ lire: async () => null, ecrire: async () => {}, supprimer: async () => {}, liste: async () => [] }).restaurer('x'); v('aucune sauvegarde : état null', vide.etat === null);
    fin();
  })();
}
// ── coûts ──
{
  const cfg = coutsDe('BTC'); v('coûts par paire : BTC < SOL < DOGE (spreads plus larges sur les alts)', coutsDe('BTC').spreadPct < coutsDe('SOL').spreadPct && coutsDe('SOL').spreadPct < coutsDe('DOGE').spreadPct);
  const c = coutEnR({ fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 }, 1);
  v('coût en R pour un stop à 1 % : 2×0,06 + 0,02 + 2×0,02 = 0,18 R', Math.abs(c.total - 0.18) < 1e-12 && Math.abs(c.frais - 0.12) < 1e-12);
  const c2 = coutEnR(cfg, 0.25); v('stop 4× plus proche = coût 4× plus élevé', Math.abs(c2.total - 4 * coutEnR(cfg, 1).total) < 1e-9);
  const trades = [{ distancePct: 0.5, R: 2 }, { distancePct: 1, R: -1 }, { distancePct: 2, R: 3 }];
  const m = coutMoyenTrades(trades, cfg); v('coût moyen décomposé', m.n === 3 && Math.abs(m.total - (m.frais + m.spread + m.glissement)) < 1e-12 && /Coût moyen/.test(m.phrase));
  const sens = sensibiliteCouts(trades, cfg, [1, 1.5, 3]); v('sensibilité : plus de coûts = espérance plus basse', sens[0].esperance > sens[1].esperance && sens[1].esperance > sens[2].esperance);
  v('phrase de fragilité', typeof phraseFragilite(sensibiliteCouts([{ distancePct: 0.3, R: 0.1 }, { distancePct: 0.3, R: 0.1 }], cfg)) === 'string' && /FRAGILE/.test(phraseFragilite(sensibiliteCouts([{ distancePct: 0.3, R: 0.1 }, { distancePct: 0.3, R: 0.1 }], cfg))));
  v('configMoteurDe rend les trois clés du moteur', Object.keys(configMoteurDe('DOGE')).sort().join() === 'fraisPct,glissementPct,spreadPct' && configMoteurDe('DOGE', { fraisPct: 0.02 }).fraisPct === 0.02);
  // un stop plus large coûte moins cher en R : preuve avec le vrai moteur (R net moyen d'une stratégie sans avantage)
  const serie = depuisBougies(bougiesSynth({ segments: [{ n: 6000, derive: 0, bruit: 0.2, volume: 100 }], graine: 3, t0: T0 }));
  const sg = (k) => { const s = { sens: new Int8Array(serie.n), stop: new Float64Array(serie.n), R: 2 }; for (let i = 100; i < serie.n - 200; i += 97) { s.sens[i] = 1; s.stop[i] = serie.c[i] * (1 - k); } return s; };
  const proche = simuler(serie, sg(0.003), { distanceMinPct: 0.1, reposBarres: 0 }), loin = simuler(serie, sg(0.02), { distanceMinPct: 0.1, reposBarres: 0 });
  const moy = x => x.trades.reduce((s, t) => s + t.coutsR, 0) / x.trades.length;
  v('moteur : coûts de frais par trade plus lourds quand le stop est proche', proche.trades.length > 10 && loin.trades.length > 10 && moy(proche) > 3 * moy(loin), moy(proche) + ' vs ' + moy(loin));
}
// ── paires ──
{
  v('trois paires : BTC, SOL, DOGE', ORDRE_PAIRES.join() === 'BTC,SOL,DOGE' && Object.keys(PAIRES).length === 3);
  v('alias reconnus à la voix', trouverPaire('montre-moi dogecoin') === 'DOGE' && trouverPaire('la solana en h1') === 'SOL' && trouverPaire('bitcoin') === 'BTC' && trouverPaire('hello') === null);
  const s = sourceBinance('DOGE'); v('URL Binance DOGE', /symbol=DOGEUSDT/.test(s.url(1, 1000)) && /interval=15m/.test(s.url(1, 1000)) && s.limite === 1000);
  const j = { error: [], result: { XDGUSD: [[1700000000, '0.08', '0.09', '0.07', '0.085', '0.08', '1234.5', 10], [1700000900, '0.085', '0.09', '0.08', '0.088', '0.085', '99', 3]], last: 1700000900 } };
  const k = analyserKraken(j, 'DOGE'); v('Kraken : bougie en cours écartée, secondes → ms, volume en 7e colonne', k.length === 1 && k[0].t === 1700000000000 && k[0].v === 1234.5 && k[0].c === 0.085);
  let e = false; try { analyserKraken({ error: ['EQuery:Unknown asset pair'] }, 'SOL'); } catch (x) { e = /Kraken/.test(x.message); } v('Kraken : erreur de l’API remontée', e);
  v('URL Kraken : XDG pour DOGE, XBT pour BTC', /pair=XDGUSD/.test(urlKraken('DOGE')) && /pair=XBTUSD/.test(urlKraken('BTC')));
}
// ── santé ──
function fin() {
  const maintenant = T0 + 10 * 86400e3, J = creerJournalErreurs(3, () => maintenant);
  for (let i = 0; i < 5; i++) J.ajouter('binance', 'erreur ' + i); v('journal d’erreurs borné (anneau de 3)', J.tout().length === 3 && J.tout()[0].message === 'erreur 2');
  const s = construireSante({ paires: { BTC: { n: 1000, derniere: maintenant - 2 * P, source: 'binance', integrite: { niveau: 'ok', phrase: 'ok' }, recoupement: { niveau: 'ok', phrase: 'cohérent' } }, SOL: { n: 0 }, DOGE: { n: 500, derniere: maintenant - 90 * P, source: 'bitstamp', secours: true } },
    recherche: { enCours: false, pause: true, N: 700000, majLe: maintenant - 3600e3 }, sauvegardes: { n: 3, corrompues: 1, derniere: maintenant - 3 * 3600e3 }, veilleur: { actif: false }, erreurs: J.tout(), causalite: { ok: true, phrase: 'aucune fuite' } }, maintenant);
  v('santé : une paire sans historique = « neutre » (non activé, bouton d’activation, pas une panne), une paire périmée = ko, niveau global ko', s.niveau === 'ko' && s.lignes.some(l => l.nom === 'SOL' && l.etat === 'neutre' && l.action && l.action.type === 'activer-paire') && s.lignes.some(l => l.nom === 'DOGE · fraîcheur' && l.etat === 'ko'));
  v('santé : recoupement absent = inconnu (jamais présenté comme bon)', s.lignes.find(l => l.nom === 'SOL · recoupement Kraken') === undefined && s.lignes.find(l => l.nom === 'DOGE · recoupement Kraken').etat === 'inconnu');
  v('santé : sauvegarde corrompue signalée', s.lignes.find(l => l.nom === 'Sauvegardes automatiques').etat === 'attention');
  v('santé : Veilleur absent = inconnu', s.lignes.find(l => l.nom === 'Veilleur du PC').etat === 'inconnu');
  const bon = construireSante({ paires: { BTC: { n: 1000, derniere: maintenant - 2 * P, source: 'binance', integrite: { niveau: 'ok', phrase: 'ok' }, recoupement: { niveau: 'ok', phrase: 'ok' } } }, erreurs: [] }, maintenant);
  v('santé : tout bon = ok', bon.niveau === 'ok' && /en ordre/.test(bon.phrase), bon.niveau + JSON.stringify(bon.lignes.map(l => l.etat)));
  console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
}
