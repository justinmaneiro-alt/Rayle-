import assert from 'node:assert/strict';
import { verifierRaccord, PAS } from '../commun/serie-continue.js';
import { noterIncident, lireIncidents, noterPrix, ecartsPrix, controlerCoherence } from '../commun/incidents-donnees.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const J = PAS.J, bar = (t, c) => ({ t, o: c, h: c * 1.01, l: c * 0.99, c, v: 1 });
const serie = (t0, nb, c0, pas = J) => Array.from({ length: nb }, (_, i) => bar(t0 + i * pas, c0));

/* raccord sain : une bougie commune, aucun trou */
let L = serie(0, 100, 100), R = serie(100 * J, 5, 100);
ok(verifierRaccord(L, R, { unite: 'J', actif: 'btc' }).ok, 'raccord continu accepté');
/* le cas de la vidéo : l'historique s'arrête, la bougie en direct est 6 mois plus loin et −50 % */
L = serie(0, 100, 118000); R = [bar(400 * J, 59000)];
let v = verifierRaccord(L, R, { unite: 'J', actif: 'btc' }); ok(!v.ok && v.raison === 'saut', 'saut de 50 % refusé');
/* trou sans saut : plus de 2 bougies manquantes (crypto) */
L = serie(0, 100, 100); R = serie(104 * J, 3, 100); v = verifierRaccord(L, R, { unite: 'J', actif: 'btc' }); ok(!v.ok && v.raison === 'trou' && v.manquantes === 4, '4 bougies manquantes refusées');
R = serie(102 * J, 3, 100); ok(verifierRaccord(L, R, { unite: 'J', actif: 'btc' }).ok, '2 bougies manquantes tolérées');
/* écart de 9 % accepté, 11 % refusé */
L = serie(0, 50, 100); ok(verifierRaccord(L, serie(50 * J, 3, 109), { unite: 'J', actif: 'or' }).ok, '9 % accepté'); ok(!verifierRaccord(L, serie(50 * J, 3, 111), { unite: 'J', actif: 'or' }).ok, '11 % refusé');
/* week-end sur un marché fermé : pas un trou */
const H4 = PAS.H4; L = serie(0, 50, 100, H4); ok(verifierRaccord(L, serie(50 * H4 + 2 * 86400e3, 3, 100, H4), { unite: 'H4', actif: 'or' }).ok, 'week-end toléré hors crypto');
ok(verifierRaccord([], serie(0, 3, 1), {}).ok && verifierRaccord(serie(0, 3, 1), [], {}).ok, 'séries vides acceptées');

/* incidents */
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)) }; };
let st = mem(), t = 1e12;
noterIncident({ type: 'raccord', actif: 'btc', unite: 'H4', detail: 'x' }, { st, maintenant: t }); noterIncident({ type: 'raccord', actif: 'btc', unite: 'H4', detail: 'x' }, { st, maintenant: t + 1000 });
ok(lireIncidents({ st, maintenant: t + 2000 }).length === 1, 'même incident non dupliqué sous 10 min');
ok(lireIncidents({ st, maintenant: t + 4 * 86400e3 }).length === 0, 'incident de plus de 3 jours masqué');

/* cohérence des prix : 0,5 % près */
st = mem(); for (const [s, p] of [['classique', 61000], ['volume', 61100], ['marches', 61020], ['accueil', 60980]]) noterPrix('BTC', s, p, { st, maintenant: t });
ok(controlerCoherence({ st, maintenant: t + 1000 }).length === 0, 'écarts de 0,2 % acceptés');
noterPrix('BTC', 'volume', 59000, { st, maintenant: t }); const E = controlerCoherence({ st, maintenant: t + 1000 });
ok(E.length === 1 && E[0].hors[0].source === 'volume', 'le prix de Volume à −3 % est signalé'); ok(lireIncidents({ st, maintenant: t + 2000 }).some(i => i.type === 'coherence'), 'incident de cohérence noté');
ok(ecartsPrix({ OR: { classique: { p: 1, t: 0 }, volume: { p: 2, t: 0 } } }, { maintenant: 1e9 }).length === 0, 'prix périmés ignorés');
console.log('coherence-v7 : ' + n + ' vérifications OK');
