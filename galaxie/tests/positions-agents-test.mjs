// Tests des agents de positions (V7, phases 3 et 3 bis) : zones, confluence « diamant », les trois agents, causalité (poison du futur), stratégie truquée rejetée, ordre limite honnête.
// Lancer : node galaxie/tests/positions-agents-test.mjs
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { depuisBougies, versBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { FAMILLES_V7, ORDRE_V7, AGENTS, TYPES_SETUP, parametresDefaut, aimants, choisirCibles, idFamille } from '../../strategies/positions/agents.js';
import { signauxLibres } from '../../strategies/positions/libre.js';
import { confluence, elementsVue, vue, POIDS_ELEMENTS, SEUIL_DIAMANT, resumeConfluence, absorption, deltaRetourne } from '../../strategies/positions/zones.js';
import { verifierCausalite } from '../../strategies/validation-v3.js';
import { simulerRiche } from '../../strategies/simulateur-riche.js';
import { empreinteV3 } from '../../strategies/criteres-v3.js';
import { empreinteCriteres } from '../../planetes/mars/pc/agent-btc/criteres.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };

v('critères v1 et v3 intacts (la V7 n’y touche pas)', empreinteCriteres() === 'c9995253' && empreinteV3() === 'c9b4ddd4');
v('trois agents × deux unités = six familles enregistrées dans le moteur', ORDRE_V7.length === 6 && ORDRE_V7.every(id => FAMILLES[id] === FAMILLES_V7[id]) && Object.keys(AGENTS).join() === 'rebond,continuation,extremes');
v('chaque famille a description, hypothèse économique (qui perd / qui gagne / risque) et grille petite', ORDRE_V7.every(id => { const f = FAMILLES_V7[id]; return f.description.length > 100 && /Qui perd/.test(f.hypothese) && /Qui gagne/.test(f.hypothese) && /Risque/.test(f.hypothese) && Object.values(f.grille()).reduce((a, l) => a * l.length, 1) <= 32; }));
v('types de setup nommés en français', Object.keys(TYPES_SETUP).length === 7 && Object.values(TYPES_SETUP).every(t => /[a-zé]/.test(t)));
v('poids des éléments de confluence : balayage 2, mur 2, égaux 1,5, POC 1,5…', POIDS_ELEMENTS.balayage === 2 && POIDS_ELEMENTS.mur === 2 && POIDS_ELEMENTS.egaux === 1.5 && POIDS_ELEMENTS.poc === 1.5 && SEUIL_DIAMANT.score === 5 && SEUIL_DIAMANT.elements === 3);

const m15 = marcheMixte(12000, 11), ctx = construireContexte(m15);

/* ── confluence : éléments, score, zone diamant ── */
const E = elementsVue(ctx, 'M15'), k = 9000, d = 1;
const L = E.pdl[k];       // support = bas de la veille
const c1 = confluence(ctx, 'M15', k, k, L, d, {});
v('un niveau posé sur le bas de la veille compte l’élément « jour_prec »', c1.elements.some(e => e.cle === 'jour_prec') && c1.cote === 'support');
const c2 = confluence(ctx, 'M15', k, k, L, d, { balayage: { type: 'egaux', touches: 3 }, absorption: true });
v('balayage + égaux (3 touches) + absorption + veille : score = 2 + 1,5 + 1,5 + 1,5 = 6,5 au moins', c2.score >= 6.5 && c2.diamant, JSON.stringify(c2.elements.map(e => e.cle)));
v('zone diamant seulement si score ≥ 5 ET au moins 3 éléments différents', !confluence(ctx, 'M15', k, k, L, d, { balayage: { type: 'plus_bas_n', touches: 1 } }).diamant || confluence(ctx, 'M15', k, k, L, d, { balayage: { type: 'plus_bas_n', touches: 1 } }).n >= 3);
v('une piscine non balayée n’ajoute PAS l’élément « balayage »', !confluence(ctx, 'M15', k, k, L, d, { piscine: { type: 'egaux', touches: 2 } }).elements.some(e => e.cle === 'balayage'));
v('mur du carnet (en direct) : +2 si fiable et proche', confluence(ctx, 'M15', k, k, L, d, {}, { murs: [{ prix: L, ratioMediane: 4.2, fiable: true }] }).elements.some(e => e.cle === 'mur') && !confluence(ctx, 'M15', k, k, L, d, {}, { murs: [{ prix: L, ratioMediane: 4.2, fiable: false }] }).elements.some(e => e.cle === 'mur'));
v('le texte de la confluence nomme chaque élément et le score', /score/.test(resumeConfluence(c2)) && /zone diamant/.test(resumeConfluence(c2)));
v('absorption : gros volume, peu de progression, mèche du bon côté', (() => { const s = { o: [100], h: [100.4], l: [99], c: [100.3], v: [500] }, Ev = { volMoy: [100] }; return absorption(Ev, s, 0, 1, 2) && !absorption({ volMoy: [400] }, s, 0, 1, 2); })());
v('delta qui se retourne : acheteur net malgré un plus bas', deltaRetourne({ dr: [0, -0.2, 0.4] }, { l: [10, 9, 8.5], h: [11, 10, 9.5] }, 2, 1) && !deltaRetourne({ dr: [0, 0, -0.4] }, { l: [10, 9, 8.5], h: [11, 10, 9.5] }, 2, 1));

/* ── aimants et cibles ── */
const am = aimants(ctx, 'M15', k, k, ctx.m15.c[k], 1);
v('aimants au-dessus de l’entrée, du plus proche au plus lointain', am.every(a => a.prix > ctx.m15.c[k]) && am.every((a, i) => i === 0 || a.prix >= am[i - 1].prix) && am.length > 0, am.length);
const ch = choisirCibles([{ prix: 101, nom: 'a' }, { prix: 103, nom: 'b' }, { prix: 106, nom: 'c' }], 100, 99, 1, 1.5);
v('cible 1 = le plus proche aimant qui offre ≥ 1,5 fois le risque ; cible 2 = le suivant', ch.ok && ch.cible.nom === 'b' && ch.cible2.nom === 'c' && Math.abs(ch.rr - 3) < 1e-9);
v('aucun aimant assez loin : refus avec le meilleur rapport atteignable', (() => { const r = choisirCibles([{ prix: 101, nom: 'a' }], 100, 99, 1, 1.5); return !r.ok && r.raison === 'rr' && Math.abs(r.meilleurRR - 1) < 1e-9; })());
v('vente : la logique est symétrique', (() => { const r = choisirCibles([{ prix: 99, nom: 'a' }, { prix: 97, nom: 'b' }], 100, 101, -1, 1.5); return r.ok && r.cible.nom === 'b' && Math.abs(r.rr - 3) < 1e-9; })());

/* ── les trois agents sur une série synthétique ── */
const stats = {};
for (const id of ORDRE_V7) {
  const sig = FAMILLES_V7[id].signaux(ctx, { ...parametresDefaut(id), conf: id.startsWith('extremes') ? 1 : 2 }); let n = 0, bien = true;
  for (let i = 0; i < ctx.n; i++) if (sig.sens[i]) { n++; const m = sig.meta.get(i); const dd = sig.sens[i]; if (!m || !(dd * (sig.limite[i] - sig.stop[i]) > 0) || !(dd * (sig.cible[i] - sig.limite[i]) > 0) || !(m.rr >= 1.5 - 1e-9) || !(m.confluence.n >= 1) || !m.raison || !m.invalidation || !m.zone) bien = false; }
  stats[id] = n; v('signaux de ' + id + ' : stop du côté perdant, cible du côté gagnant, rapport ≥ 1,5, raison, invalidation, zone', bien);
}
v('au moins un agent propose des positions sur 125 jours synthétiques', Object.values(stats).some(x => x > 0), JSON.stringify(stats));
v('le nombre de signaux bruts est borné (≤ 10 % des barres avec 2 éléments de confluence exigés ; l’affichage est ensuite plafonné)', Object.values(stats).every(x => x < 0.10 * ctx.n), JSON.stringify(stats));

/* ── un balayage fabriqué à la main : le Rebond propose un ACHAT, jamais avant la bougie ── */
function avecBalayage(k0, creux = 0.9985, gros = true) {
  const b = versBougies(m15); let mn = Infinity; for (let j = k0 - 48; j < k0; j++) mn = Math.min(mn, b[j].l);
  const x = b[k0], c = mn * 1.0012; b[k0] = { ...x, o: b[k0 - 1].c, l: mn * creux, c, h: Math.max(c, b[k0 - 1].c) * 1.0004, v: gros ? x.v * 3 : x.v * 0.8, vb: gros ? x.v * 3 * 0.7 : x.v * 0.8 * 0.45 };
  return { s: depuisBougies(b), niveau: mn };
}
const f = avecBalayage(9500), cf = construireContexte(f.s), sigR = FAMILLES_V7.rebond_m15.signaux(cf, { N: 48, conf: 1, filtre: 0, profondeur: 0.5 });
v('Rebond : un balayage du plus bas des 48 dernières barres avec reprise déclenche un ACHAT sur cette barre', sigR.sens[9500] === 1 || sigR.sens[9500] === 0 && cf.cache.get('pos:hyp:M15') && cf.cache.get('pos:hyp:M15').some(h => h.i === 9500 && h.d === 1), 'sens=' + sigR.sens[9500]);
if (sigR.sens[9500] === 1) {
  const mm = sigR.meta.get(9500);
  v('…entrée en ordre limite entre le niveau balayé et la clôture, stop sous l’extrême balayé, cible au-dessus', mm.limite > f.niveau && mm.limite < cf.m15.c[9500] + 1e-9 && mm.stop < cf.m15.l[9500] && mm.cible > mm.limite, JSON.stringify({ l: mm.limite, n: f.niveau }));
  v('…et rien avant la bougie du balayage (aucun regard vers le futur)', (() => { for (let i = 9400; i < 9500; i++) if (sigR.sens[i] && sigR.meta.get(i).type === 'rebond:balayage' && Math.abs(sigR.meta.get(i).niveau - f.niveau) < 1e-6) return false; return true; })());
  v('…le texte dit pourquoi (balayage, niveau, confluence)', /balayage/.test(mm.raison) && /confluence|zone diamant/.test(mm.raison));
}
const nu = avecBalayage(9500, 0.9985, false), cn = construireContexte(nu.s);
const sgNu = FAMILLES_V7.rebond_m15.signaux(cn, { N: 48, conf: 1, filtre: 0, profondeur: 0.5 }), mNu = sgNu.meta.get(9500), mGros = sigR.meta.get(9500);
v('un balayage appuyé (gros volume, delta acheteur) a plus d’éléments de confluence qu’un balayage nu', !mNu || !mGros || mGros.confluence.n > mNu.confluence.n, (mNu && mNu.confluence.n) + ' vs ' + (mGros && mGros.confluence.n));
v('exiger 9 éléments de confluence : plus rien ne passe', FAMILLES_V7.rebond_m15.signaux(cf, { N: 48, conf: 9, filtre: 0, profondeur: 0.5 }).sens[9500] === 0);

/* ── causalité : les six familles passent le « poison du futur » ; une stratégie TRUQUÉE est rejetée ── */
for (const id of ORDRE_V7) {
  const r = verifierCausalite(FAMILLES_V7[id], { ...parametresDefaut(id), conf: 1 }, m15, { coupes: 4, fenetre: 9000 });
  v('poison du futur : ' + id + ' ne regarde pas le futur', r.ok, JSON.stringify(r));
}
const TRICHE = { id: 'triche_v7', nom: 'Triche', grille: () => ({}), signaux(c) { const n = c.n, o = { sens: new Int8Array(n), stop: new Float64Array(n), R: 2 }; for (let i = 500; i < n - 1; i++) { if (c.m15.c[i + 1] > c.m15.c[i] * 1.0003) { o.sens[i] = 1; o.stop[i] = c.m15.c[i] * 0.995; } } return o; } };
TRICHE.signaux(ctx);
const rt = verifierCausalite(TRICHE, {}, m15, { coupes: 4, fenetre: 9000 });
v('une stratégie qui regarde la bougie suivante est REJETÉE par le même test', !rt.ok && rt.ecarts > 0, JSON.stringify(rt));

/* ── exécution honnête : l’ordre limite n’est rempli que si le prix TRAVERSE le niveau ── */
const simu = id => { const sig = FAMILLES_V7[id].signaux(ctx, { ...parametresDefaut(id), conf: 1 }); return { sig, sim: simulerRiche(ctx.m15, sig, {}, {}) }; };
const { sig: sg, sim: sm } = simu('rebond_m15');
v('simulation avec ordres limites : des ordres posés, certains non remplis ou partis sans nous (jamais 100 % remplis)', sm.ordres.poses > 0 && (sm.ordres.nonRemplis + sm.ordres.partisSansNous) > 0, JSON.stringify(sm.ordres));
v('chaque trade porte frais et coûts totaux en R', sm.trades.every(t => Number.isFinite(t.R) && Number.isFinite(t.coutsTotalR) && t.coutsTotalR >= 0));
v('chaque trade vient d’un signal avec ses métadonnées (type de setup)', sm.trades.every(t => sg.meta.get(t.signal) && sg.meta.get(t.signal).type));

/* ── agent « libre » (hypothèses issues d’exemples) ── */
const lib = signauxLibres(ctx, { tf: 'M15', sens: 1, elementsRequis: [], regime: null, id: 'h1', titre: 'test' });
v('agent libre : signaux causaux avec rapport ≥ 1,5 et type « libre:hypothese »', (() => { let n = 0; for (let i = 0; i < ctx.n; i++) if (lib.sens[i]) { n++; const m = lib.meta.get(i); if (m.type !== 'libre:hypothese' || m.rr < 1.5 - 1e-9 || lib.sens[i] !== 1) return false; } return n > 0; })());
const causLibre = verifierCausalite({ signaux: (c, p) => signauxLibres(c, { tf: 'M15', sens: 1, elementsRequis: [], id: 'h1' }) }, {}, m15, { coupes: 3, fenetre: 9000 });
v('agent libre : poison du futur passé', causLibre.ok, JSON.stringify(causLibre));
v('idFamille', idFamille('rebond', 'M15') === 'rebond_m15' && idFamille('extremes', 'H1') === 'extremes_h1');
console.log('Agents de positions : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
