import { demarrerWorkerReel } from './worker-local-reel.mjs';
import { creerClient } from '../planetes/mars/pc/trading/client.js';
import { INSTRUMENTS, ORDRE_UNITES, UNITES, WATCHLIST } from '../planetes/mars/pc/trading/instruments.js';
import * as I from '../planetes/mars/pc/trading/indicateurs.js';
import { resume, correlations } from '../planetes/mars/pc/trading/analyse.js';
import { lireCotations } from '../planetes/mars/pc/trading/cotations.js';
import { descriptionSource } from '../planetes/mars/pc/trading/espace.js';

/* VRAIS APPELS depuis ce poste : le mini-Worker local exécute la VRAIE route /marche du dossier worker/ (Yahoo Finance ; Twelve Data seulement si TWELVEDATA_KEY existe ici,
   ce qui n'est pas le cas en local : l'or passe alors par son secours Yahoo, GC=F) ; le client et les indicateurs du navigateur tournent par-dessus.
   Rien n'est déployé, rien n'est écrit. Usage : node tests-navigateur/mars-trading-reel.mjs */
const w = await demarrerWorkerReel(8799);
const ok = (nom, cond, detail = '') => { console.log((cond ? 'OK  ' : 'KO  ') + nom + (detail !== '' ? ' — ' + detail : '')); if (!cond) process.exitCode = 1; };
const appeler = async path => { const r = await fetch(w.url + path); const o = await r.json().catch(() => null); if (!r.ok) throw new Error('HTTP ' + r.status + ' · ' + ((o && o.error) || 'erreur')); return o; };
const client = creerClient({ appeler, stockage: null });
const lignes = [];
for (const id of ['US100', 'XAU', 'DXY', 'US10Y', 'VIX']) {
  for (const u of ORDRE_UNITES) {
    const t0 = Date.now();
    const r = await client.serie(id, u, { force: true });
    const b = r.bougies, der = b[b.length - 1], d = descriptionSource(r);
    const ind = b.length ? I.calculerTout(b) : null, rs = b.length >= 30 ? resume(b) : null;
    lignes.push({ id, u, n: b.length, source: r.meta && r.meta.source, symbole: r.meta && r.meta.symbole, secours: r.meta && r.meta.secours, differe: r.meta && r.meta.differe, volume: r.volume && r.volume.type, couv: r.volume && r.volume.couverture != null ? Math.round(r.volume.couverture * 100) : null, derniere: der ? new Date(der.t).toISOString().slice(0, 16) : null, age: der ? Math.round((Date.now() - der.t) / 3600e3) + ' h' : null, ms: Date.now() - t0, erreur: r.erreur,
      ma200: ind && ind.ma200[b.length - 1] != null, rsi: ind && ind.rsi[b.length - 1] != null ? +ind.rsi[b.length - 1].toFixed(1) : null, niveaux: rs ? rs.supports.length + '/' + rs.resistances.length : null });
    ok(id + ' ' + u + ' : bougies réelles valides', b.length >= 100 && b.every(x => x.h >= x.l && x.o > 0 && x.c > 0) && !r.erreur, JSON.stringify({ n: b.length, source: r.meta && r.meta.source, erreur: r.erreur }));
  }
}
console.log('\nIns   Unité  n    Source           Symbole    Secours Différé Volume (couv.)    Dernière bougie    Âge    ms    MA200 RSI   S/R');
for (const l of lignes) console.log(l.id.padEnd(6) + l.u.padEnd(6) + String(l.n).padEnd(5) + String(l.source).padEnd(17) + String(l.symbole).padEnd(11) + String(l.secours).padEnd(8) + String(l.differe).padEnd(7) + (String(l.volume) + (l.couv != null ? ' (' + l.couv + ' %)' : '')).padEnd(19) + String(l.derniere).padEnd(19) + String(l.age).padEnd(7) + String(l.ms).padEnd(6) + String(l.ma200).padEnd(6) + String(l.rsi).padEnd(6) + l.niveaux);
const us = lignes.filter(l => l.id === 'US100'), or = lignes.filter(l => l.id === 'XAU');
ok('US100 : source Yahoo Finance (^NDX), volume de l\'indice pour M15 / H1 / D1', us.every(l => l.source === 'Yahoo Finance' && l.symbole === '^NDX') && ['M15', 'H1', 'D1'].every(u => us.find(l => l.u === u).volume === 'indice'), JSON.stringify(us.map(l => [l.u, l.volume])));
ok('or : volume PROXY (GC=F) ou absent, jamais présenté comme réel', or.every(l => l.volume === 'proxy' || l.volume === 'aucun'), JSON.stringify(or.map(l => [l.u, l.volume, l.couv])));
ok('DXY, US10Y, VIX : aucun volume', lignes.filter(l => ['DXY', 'US10Y', 'VIX'].includes(l.id)).every(l => l.volume === 'aucun'));
ok('MA200 disponible partout (assez de bougies)', lignes.every(l => l.ma200), JSON.stringify(lignes.filter(l => !l.ma200).map(l => l.id + l.u)));
const cot = await lireCotations(client);
console.log('\nWatchlist (dernier prix M15 contre clôture de la veille) :');
for (const q of cot) console.log('  ' + q.nom.padEnd(6) + (q.vide ? 'INDISPONIBLE ' + q.erreur : String(q.prix.toFixed(q.decimales)).padEnd(12) + (q.pct >= 0 ? '+' : '') + q.pct.toFixed(2) + ' %  ' + q.source + (q.differe ? ' (différé)' : '') + (q.secours ? ' SECOURS' : '')));
ok('watchlist : 5 cotations réelles', cot.length === 5 && cot.every(q => !q.vide && Number.isFinite(q.prix) && q.pct != null), JSON.stringify(cot.map(q => [q.id, q.pct && +q.pct.toFixed(2)])));
ok('variations du jour plausibles (< 15 %)', cot.every(q => Math.abs(q.pct) < 15));
const series = {}; for (const id of ['US100', 'XAU', 'DXY', 'US10Y', 'VIX']) series[id] = (await client.serie(id, 'D1')).bougies;
const co = correlations(series, 60);
console.log('\nCorrélations (60 jours, variations quotidiennes) :'); console.log('       ' + co.ids.map(i => i.padEnd(7)).join('')); for (const a of co.ids) console.log(a.padEnd(7) + co.ids.map(b => (co.matrice[a][b] == null ? '—' : co.matrice[a][b].toFixed(2)).padEnd(7)).join(''));
ok('corrélations : 5 × 5 calculées sur des jours réels', co.ids.length === 5 && co.ids.every(a => co.ids.every(b => co.matrice[a][b] != null)));
const n = w.journal.filter(p => p.startsWith('/marche')).length;
console.log('\nRequêtes vers /marche : ' + n + ' (client : ' + JSON.stringify(client.stats()) + ')');
ok('nombre de requêtes raisonnable (< 60 pour tout le terminal)', n < 60, n);
await w.fermer();
