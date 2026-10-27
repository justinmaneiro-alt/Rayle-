import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as I from '../pc/trading/indicateurs.js';
import * as S from '../pc/trading/serie.js';
import * as A from '../pc/trading/analyse.js';
import * as N from '../pc/trading/instruments.js';
import { alea } from '../pc/mars-calcul.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
const proche = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const racine = fileURLToPath(new URL('../../..', import.meta.url));

/* Bougies de test : marche aléatoire reproductible, avec tendance et oscillations, volumes, un pas de 15 minutes. */
function bougies(n = 400, graine = 7, t0 = Date.UTC(2026, 9, 1, 13, 30), pas = 900e3, ancre = 20000, vol = true) {
  const a = alea(graine), out = []; let c = ancre;
  for (let i = 0; i < n; i++) {
    const o = c, mv = (a() - 0.49) * 30 + Math.sin(i / 17) * 8, cl = o + mv, h = Math.max(o, cl) + a() * 12, l = Math.min(o, cl) - a() * 12;
    out.push({ t: t0 + i * pas, o, h, l, c: cl, v: vol ? Math.round(1000 + a() * 9000) : 0 }); c = cl;
  }
  return out;
}
const B = bougies(), C = B.map(x => x.c);

// ── Moyennes, RSI, ATR, MACD, Bollinger ──
const s3 = I.sma([1, 2, 3, 4, 5], 3);
v('SMA : null puis moyennes', s3[0] === null && s3[1] === null && s3[2] === 2 && s3[3] === 3 && s3[4] === 4);
const e3 = I.ema([1, 2, 3, 4, 5], 3);
v('EMA : amorcée par la moyenne simple', e3[2] === 2 && proche(e3[3], 3) && proche(e3[4], 4));
v('séries de la même longueur que les bougies', [I.sma(C, 200), I.ema(C, 200), I.rsi(C), I.atr(B), I.vwap(B)].every(s => s.length === B.length));
v('MA200 : null avant la 200e bougie, valeur ensuite', I.sma(C, 200)[198] === null && I.sma(C, 200)[199] !== null);
const R = I.rsi(C, 14);
v('RSI entre 0 et 100', R.filter(x => x != null).every(x => x >= 0 && x <= 100) && R[13] === null && R[14] !== null);
v('RSI : tendance haussière pure = 100', I.rsi(Array.from({ length: 30 }, (_, i) => i), 14)[29] === 100);
const M = I.macd(C);
v('MACD : ligne = EMA12 - EMA26 ; histogramme = ligne - signal', (() => { const i = 300, e12 = I.ema(C, 12)[i], e26 = I.ema(C, 26)[i]; return proche(M.macd[i], e12 - e26) && proche(M.histogramme[i], M.macd[i] - M.signal[i]); })());
v('MACD : signal disponible après 26 + 9 - 1 bougies', M.signal[32] === null && M.signal[33] !== null);
const BB = I.bollinger(C, 20, 2);
v('Bollinger : bande haute > milieu > bande basse, symétrique', (() => { const i = 100; return BB.haut[i] > BB.milieu[i] && BB.milieu[i] > BB.bas[i] && proche(BB.haut[i] - BB.milieu[i], BB.milieu[i] - BB.bas[i], 1e-7); })());
v('Bollinger : milieu = SMA 20', proche(BB.milieu[150], I.sma(C, 20)[150]));
const AT = I.atr(B, 14);
v('ATR positif', AT.filter(x => x != null).every(x => x > 0) && AT[13] !== null && AT[12] === null);

// ── VWAP par séance ──
const V = I.vwap(B);
v('VWAP : un prix entre le plus bas et le plus haut de la séance', (() => { const i = 10; return V[i] >= Math.min(...B.slice(0, i + 1).map(x => x.l)) && V[i] <= Math.max(...B.slice(0, i + 1).map(x => x.h)); })());
const duJ = I.jourUTC(B[0].t); const premierNouveau = B.findIndex(x => I.jourUTC(x.t) !== duJ);
v('VWAP : repart à zéro à chaque nouvelle séance (jour)', premierNouveau > 0 && proche(V[premierNouveau], (B[premierNouveau].h + B[premierNouveau].l + B[premierNouveau].c) / 3));
v('VWAP : sans volume → null (rien d\'inventé)', I.vwap(bougies(50, 3, undefined, undefined, undefined, false)).every(x => x === null));
v('aDuVolume', I.aDuVolume(B) && !I.aDuVolume(bougies(50, 3, undefined, undefined, undefined, false)));

// ── Profil de volume ──
const P = I.profilVolume(B.slice(-200), 40);
v('profil de volume : somme des tranches = volume total', P && proche(P.niveaux.reduce((s, x) => s + x.volume, 0), B.slice(-200).reduce((s, x) => s + x.v, 0), 1e-4 * P.total));
v('profil de volume : POC dans la plage, zone de valeur autour du POC', P.poc >= P.min && P.poc <= P.max && P.val <= P.poc && P.vah >= P.poc);
v('profil de volume : la zone de valeur contient au moins 70 % du volume', (() => { const dans = P.niveaux.filter(x => x.prix >= P.val && x.prix <= P.vah).reduce((s, x) => s + x.volume, 0); return dans >= 0.7 * P.total - 1e-6; })());
v('profil de volume : null sans volume', I.profilVolume(bougies(50, 3, undefined, undefined, undefined, false)) === null);
const plat = I.profilVolume([{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 10 }, { t: 1, o: 2, h: 3, l: 2, c: 3, v: 10 }], 4);
v('profil de volume : bougie répartie sur sa plage', plat && proche(plat.total, 20) && plat.niveaux[0].volume > 0 && plat.niveaux[3].volume > 0);

// ── Supports et résistances ──
const NV = I.niveauxCles(B.slice(-400), I.atr(B, 14)[B.length - 1]);
const px = B[B.length - 1].c;
v('niveaux : supports sous le prix, résistances au-dessus', NV.supports.every(x => x.prix < px) && NV.resistances.every(x => x.prix > px));
v('niveaux : trois au plus de chaque côté, écart minimum entre eux', NV.supports.length <= 3 && NV.resistances.length <= 3 && NV.supports.every((x, i) => i === 0 || Math.abs(x.prix - NV.supports[i - 1].prix) >= NV.atr * 0.99));
v('niveaux : trop peu de bougies → rien', I.niveauxCles(B.slice(0, 20)).supports.length === 0);

// ── Même résultat que le Worker (si le dossier worker/ existe) ──
const wBougies = racine + 'worker/src/terminal/bougies.js', wGraph = racine + 'worker/src/terminal/graphique.js';
if (fs.existsSync(wBougies)) {
  try {
    const W = await import(pathToFileURL(wBougies).href), G = await import(pathToFileURL(wGraph).href);
    const egal = (a, b) => a.length === b.length && a.every((x, i) => (x == null && b[i] == null) || proche(x, b[i], 1e-9));
    v('identique au Worker : EMA 20, 50 et 200', egal(I.ema(C, 20), W.serieEMA(C, 20)) && egal(I.ema(C, 200), W.serieEMA(C, 200)));
    v('identique au Worker : RSI 14', egal(I.rsi(C, 14), W.serieRSI(C, 14)));
    v('identique au Worker : ATR 14', egal(I.atr(B, 14), W.serieATR(B, 14)));
    const nvW = G.niveauxCles(B.slice(-400), W.serieATR(B, 14)[B.length - 1]);
    v('identique au Worker : supports et résistances', nvW.supports.length === NV.supports.length && nvW.resistances.length === NV.resistances.length
      && nvW.supports.every((x, i) => proche(x.prix, +NV.supports[i].prix.toFixed(x.prix.toString().split('.')[1] ? x.prix.toString().split('.')[1].length : 0), 1e-6)), JSON.stringify([nvW.supports.map(x => x.prix), NV.supports.map(x => x.prix)]));
  } catch (e) { console.log('(comparaison avec le Worker ignorée : ' + e.message.slice(0, 80) + ')'); }
}

// ── Séries : fusion, proxy de volume, variations, rafraîchissement ──
const a1 = bougies(10, 1), a2 = bougies(10, 2).map(x => ({ ...x, t: x.t + 5 * 900e3 }));
const f = S.fusionner(a1, a2);
v('fusion : une bougie par instant, triée, la plus récente gagne', f.length === 15 && f.every((x, i) => i === 0 || x.t > f[i - 1].t) && f[7].c === a2[2].c);
v('fusion : idempotente', JSON.stringify(S.fusionner(f, a2)) === JSON.stringify(f));
v('limiter : garde les plus récentes', S.limiter(f, 5).length === 5 && S.limiter(f, 5)[4].t === f[14].t);
v('nettoyer : écarte les bougies invalides', S.nettoyer([{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 5 }, { t: 2, o: 1, h: 0.5, l: 2, c: 1, v: 1 }, { t: NaN, o: 1, h: 1, l: 1, c: 1 }, { t: 3, o: 'x', h: 1, l: 1, c: 1 }]).length === 1);
const cash = bougies(8, 4, Date.UTC(2026, 9, 1, 0, 0), 4 * 3600e3, 100, false), fut = bougies(40, 5, Date.UTC(2026, 9, 1, 0, 0), 3600e3, 100, true);
const pv = S.appliquerVolumeProxy(cash, fut, 4 * 3600e3);
v('proxy de volume : somme des bougies horaires dans chaque H4', proche(pv.bougies[1].v, fut.slice(4, 8).reduce((s, x) => s + x.v, 0)) && pv.couverture === 1);
v('proxy de volume : n\'invente rien sans correspondance', S.appliquerVolumeProxy(cash, [], 4 * 3600e3).bougies.every(x => x.v === 0));
const jr = [{ t: Date.UTC(2026, 9, 19), c: 100 }, { t: Date.UTC(2026, 9, 20), c: 102 }, { t: Date.UTC(2026, 9, 21), c: 101 }];
const vj = S.variationJour(jr, 103, Date.UTC(2026, 9, 21, 15));
v('variation du jour : par rapport à la clôture de la veille', vj && vj.veille === 102 && proche(vj.variation, 1) && proche(vj.pct, 100 / 102));
v('variation du jour : pas assez de données → null', S.variationJour([jr[0]], 1) === null);
v('bougie en cours détectée', S.enCours({ t: Date.now() - 1000 }, 900e3) && !S.enCours({ t: Date.now() - 2e6 }, 900e3));
v('âge lisible', S.age(30e3) === 'il y a 30 s' && S.age(5 * 60e3) === 'il y a 5 min' && S.age(3 * 3600e3) === 'il y a 3 h' && S.age(null) === 'inconnu');
v('heure de Paris', /^\d{2}\/\d{2} \d{2}:\d{2}$/.test(S.heureParis(Date.UTC(2026, 9, 21, 12, 0))));
v('week-end détecté', S.marcheProbablementFerme(0, Date.UTC(2026, 9, 24, 12)) && !S.marcheProbablementFerme(0, Date.UTC(2026, 9, 21, 12)));
v('rafraîchissement : onglet caché → non, forcé → oui, trop tôt → non, assez tard → oui',
  !S.doitRafraichir({ derniereLecture: 0, rafraichirMs: 1000, maintenant: 5000, visible: false }) && S.doitRafraichir({ derniereLecture: 4999, rafraichirMs: 1000, maintenant: 5000, force: true })
  && !S.doitRafraichir({ derniereLecture: 4500, rafraichirMs: 1000, maintenant: 5000 }) && S.doitRafraichir({ derniereLecture: 3000, rafraichirMs: 1000, maintenant: 5000 }));
v('rafraîchissement : marché fermé → beaucoup plus rare', !S.doitRafraichir({ derniereLecture: 0, rafraichirMs: 120e3, maintenant: 200e3, ferme: true }) && S.doitRafraichir({ derniereLecture: 0, rafraichirMs: 120e3, maintenant: 700e3, ferme: true }));

// ── Lecture du marché et corrélations ──
const rs = A.resume(B);
v('résumé : prix, RSI, MA200, ATR, niveaux, structure', rs && rs.prix === px && rs.rsi != null && rs.ma200 != null && rs.atr > 0 && Array.isArray(rs.supports) && typeof rs.structure === 'string');
v('résumé : tendance dite par rapport à la MA200 (constat, pas prévision)', /MA200/.test(rs.tendanceMa200) && rs.distanceMa200Pct != null);
v('résumé : historique trop court → null', A.resume(B.slice(0, 20)) === null);
v('résumé : pas de MA200 avec 100 bougies, dit pourquoi', /indisponible/.test(A.resume(B.slice(0, 100)).tendanceMa200));
const jours = (n, f2, graine) => { const a = alea(graine); let c = 100; return Array.from({ length: n }, (_, i) => { c *= 1 + f2(i, a); return { t: Date.UTC(2026, 6, 1) + i * 86400e3, c }; }); };
const sx = jours(100, (i, a) => (a() - 0.5) * 0.02, 1);
const co = A.correlations({ X: sx, MEME: sx.map(x => ({ ...x })), Y: sx.map((x, i) => ({ t: x.t, c: 1e4 / x.c })), Z: jours(100, (i, a) => (a() - 0.5) * 0.02, 99) }, 60);
v('corrélation : un instrument avec lui-même = 1', co.matrice.X.X === 1 && proche(co.matrice.X.MEME, 1, 1e-9));
v('corrélation : l\'inverse est fortement négatif', co.matrice.X.Y < -0.99, co.matrice.X.Y);
v('corrélation : deux marches indépendantes sont peu corrélées', Math.abs(co.matrice.X.Z) < 0.4, co.matrice.X.Z);
v('corrélation : symétrique', proche(co.matrice.X.Z, co.matrice.Z.X, 1e-12));
v('corrélation : trop peu de jours communs → null (rien d\'inventé)', A.correlations({ X: sx.slice(0, 12), Y: sx.slice(0, 12) }, 60).matrice.X.Y === null);
v('corrélation : joint sur la DATE (séances décalées dans la journée)', (() => { const dec = sx.map(x => ({ t: x.t + 6 * 3600e3, c: x.c })); return proche(A.correlations({ X: sx, D: dec }, 60).matrice.X.D, 1, 1e-9); })());
v('lecture d\'une corrélation', A.lectureCorrelation(0.85) === 'forte positive' && A.lectureCorrelation(-0.5) === 'moyenne négative' && A.lectureCorrelation(0.05) === 'quasi nulle' && A.lectureCorrelation(null) === 'indisponible');

// ── Instruments et langage parlé ──
v('instruments : US100, or, dollar, taux, VIX', ['US100', 'XAU', 'DXY', 'US10Y', 'VIX'].every(id => N.instrument(id)));
v('unités : M15, H1, H4, D1 → intervalles du Worker', N.UNITES.M15.worker === '15min' && N.UNITES.H1.worker === '1h' && N.UNITES.H4.worker === '4h' && N.UNITES.D1.worker === '1day');
v('l\'or : volume dit PROXY, le Nasdaq : volume de l\'indice (≠ CFD)', N.INSTRUMENTS.XAU.volume.type === 'proxy' && /PROXY/.test(N.INSTRUMENTS.XAU.volume.note) && /PAS le volume du CFD/.test(N.INSTRUMENTS.US100.volume.note));
const D = t => N.analyserDemande(t);
const cas = [['montre-moi l’or en H1', 'XAU', 'H1'], ['Montre moi le Nasdaq en daily', 'US100', 'D1'], ['affiche US100 en H4', 'US100', 'H4'], ['passe en M15', null, 'M15'], ['mets l’or', 'XAU', null],
  ['change pour le nasdaq 100', 'US100', null], ['va sur l’or en quatre heures', 'XAU', 'H4'], ['ouvre le dollar en journalier', 'DXY', 'D1'], ['affiche le VIX', 'VIX', null], ['montre les taux en H1', 'US10Y', 'H1'],
  ['mets le graphique en une heure', null, 'H1']];
for (const [t, i, u] of cas) { const r = D(t); v('voix : « ' + t + ' » → ' + (i || '—') + ' ' + (u || '—'), r && r.instrument === i && r.unite === u, JSON.stringify(r)); }
for (const t of ['quel est le prix de l’or', 'combien vaut le nasdaq en H1', 'explique-moi le VIX', 'la météo à Paris', 'va sur Mars', 'entre dans la base', 'montre-moi la Terre', 'achète de l’or', 'bonjour Raylé'])
  v('voix : ignoré « ' + t + ' »', D(t) === null, JSON.stringify(D(t)));
v('trouverInstrument : la plus longue expression gagne', N.trouverInstrument('le nasdaq 100') === 'US100' && N.trouverInstrument('xau usd') === 'XAU');
v('libellé de la demande', N.libelleDemande('XAU', 'H1') === 'Or en H1' && N.libelleDemande(null, 'D1') === 'D1');
console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
