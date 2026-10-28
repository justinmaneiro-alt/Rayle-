// Tests du suivi en direct des familles « riches » de la V6 : le direct rejoue le simulateur, donc il donne les MÊMES trades que le backtest.
// Lancer : node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON galaxie/tests/direct-riche-test.mjs
import { avancerRegleRiche, estRiche } from '../../strategies/direct-riche.js';
import { simulerRiche } from '../../strategies/simulateur-riche.js';
import { surveillerRegle } from '../../strategies/surveillance-commune.js';
import { construireAlerte } from '../../strategies/alertes-v3.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { tranche, depuisBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('estRiche : les familles V6 oui, les familles d’origine non', estRiche('tendance_pullback_h4') && estRiche('cassure_h1_retest') && !estRiche('tendance_ma') && !estRiche('inconnue'));

// ── équivalence direct / backtest ──
const m = marcheMixte(26000, 11), cfg = { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 };
function equivalence(id, params, debut = 8000, pas = 8) {
  const full = simulerRiche(m, FAMILLES[id].signaux(construireContexte(m), params), cfg, { de: 0, a: m.n });
  let etat, live = [], evts = [];
  for (let fin = debut; fin <= m.n; fin += pas) {
    const r = avancerRegleRiche({ regle: { famille: id, params }, serie: tranche(m, Math.max(0, fin - 6000), fin), etat, config: cfg }); etat = r.etat; if (r.erreur) return { erreur: r.erreur };
    for (const e of r.evenements) { evts.push(e); if (e.type === 'CLOTURE') live.push(e.trade); }
  }
  const ref = full.trades.filter(t => t.tSortie > m.t[debut - 1]), cle = t => t.t + ':' + t.sens, L = new Set(live.map(cle)), Rr = new Set(ref.map(cle));
  return { full: full.trades.length, ref: ref.length, live: live.length, communs: [...Rr].filter(x => L.has(x)).length, manquants: [...Rr].filter(x => !L.has(x)).length, enTrop: [...L].filter(x => !Rr.has(x)).length, evts, etat };
}
const e1 = equivalence('tendance_pullback_h4', { ema: 20, stopATR: 2, R: 2, sortie: 'partielle' });
v('tendance H4 / sortie partielle : les trades du direct sont EXACTEMENT ceux du backtest (rejeu sur 6000 bougies)', e1.ref >= 8 && e1.manquants === 0 && e1.enTrop === 0, JSON.stringify({ ref: e1.ref, communs: e1.communs, manquants: e1.manquants, enTrop: e1.enTrop }));
const e2 = equivalence('cassure_h1_retest', { N: 24, filtreH4: 0, entree: 'limite', stopATR: 1, R: 2 }, 8000, 16);
v('cassure H1 / entrée limitée : idem (ordres limités compris)', !e2.erreur && e2.manquants === 0 && e2.enTrop === 0, JSON.stringify({ ref: e2.ref, communs: e2.communs, manquants: e2.manquants, enTrop: e2.enTrop }));
v('chaque trade clos du direct est annoncé une seule fois (pas de doublon)', (() => { const ts = e1.evts.filter(e => e.type === 'CLOTURE').map(e => e.trade.tSortie); return new Set(ts).size === ts.length; })());
v('l’état garde les trades, le capital simulé et la dernière bougie vue', e1.etat.trades.length === e1.live && e1.etat.equite.length === e1.live && e1.etat.derniereBarre === m.t[m.n - 1]);

// ── première passe, séries trop courtes ──
const r0 = avancerRegleRiche({ regle: { famille: 'tendance_pullback_h4', params: { ema: 20, stopATR: 2, R: 2, sortie: 'fixe' } }, serie: tranche(m, 0, 7000), config: cfg });
v('première passe : rien n’est rejoué, aucun faux trade du passé', r0.evenements.length === 0 && r0.etat.trades.length === 0 && r0.etat.derniereBarre === m.t[6999]);
const court = avancerRegleRiche({ regle: { famille: 'tendance_pullback_h4', params: { ema: 20, stopATR: 2, R: 2, sortie: 'fixe' } }, serie: tranche(m, 0, 2000), config: cfg });
v('série trop courte pour chauffer H4 : erreur claire, pas de faux signal', /4000/.test(court.erreur || ''));
v('famille inconnue : erreur claire', /inconnue/.test(avancerRegleRiche({ regle: { famille: 'nope', params: {} }, serie: m, config: cfg }).erreur));

// ── scénario écrit à la main : ordre limité en attente, rempli, objectif ──
const plat = []; for (let i = 0; i < 5000; i++) { const p = 100 + Math.sin(i / 40) * 0.05; plat.push({ t: Date.UTC(2026, 0, 5) + i * 900e3, o: p, h: p + 0.05, l: p - 0.05, c: p, v: 100, vb: 50 }); }
const scenario = (suite) => { const b = plat.slice(); for (const x of suite) b.push({ t: Date.UTC(2026, 0, 5) + b.length * 900e3, ...x }); return depuisBougies(b); };
FAMILLES.test_limite_v6 = { id: 'test_limite_v6', nom: 'Test ordre limité', riche: true, grille: () => ({ a: [1] }),
  signaux(ctx) { const n = ctx.n, sens = new Int8Array(n), stop = new Float64Array(n), limite = new Float64Array(n).fill(NaN); sens[5000] = 1; stop[5000] = 98; limite[5000] = 99.5; return { riche: true, sens, stop, limite, ttl: 6, R: 2, options: { stopMinAuto: false, coutPlafondR: 0, rrMin: 1.5, distanceMinPct: 0, sortie: { type: 'fixe' } } }; } };
const regle = { id: 'x', famille: 'test_limite_v6', params: { a: 1 }, paire: 'BTC', mode: 'SIMULATION', nom: 'Test' };
const cfg0 = { fraisPct: 0, makerPct: 0, spreadPct: 0, glissementPct: 0, filePct: 0.02, distanceMinPct: 0, maxParSemaine: 99, reposBarres: 0 };
const flat = { o: 100, h: 100.05, l: 99.95, c: 100 };
let ev = avancerRegleRiche({ regle, serie: scenario([flat, flat]).n ? tranche(scenario([]), 0, 5000) : null, config: cfg0 }); let etat = ev.etat;   // 5000 bougies plates : première passe (le signal est sur la bougie 5000, pas encore fermée)
const s1 = scenario([flat]);   // la bougie 5000 est fermée : le signal est sur la dernière bougie
// La bougie 5000 (index) est la dernière : ordre limité posé à 99,5
const apresSignal = avancerRegleRiche({ regle, serie: s1, etat, config: cfg0 }); etat = apresSignal.etat;
const entree = apresSignal.evenements.find(e => e.type === 'ENTREE');
v('signal sur la dernière bougie fermée avec un niveau limite : événement ENTREE de type « limite »', entree && entree.ordre === 'limite' && entree.entree === 99.5 && entree.stop === 98 && entree.objectifs.length >= 2, JSON.stringify(entree && { ordre: entree.ordre, entree: entree.entree, stop: entree.stop }));
v('…avec une raison qui explique l’ordre limité (rempli seulement si le niveau est traversé)', entree && /LIMITE/.test(entree.raison.join(' ')) && /traverse/.test(entree.raison.join(' ')));
const alerte = construireAlerte('ENTREE', { s: { id: 'x', nom: 'Test', paire: 'BTC', phase: 'simulation' }, ev: entree, mode: 'SIMULATION' }, 1761600000000);
v('l’alerte Telegram se construit comme pour les autres familles (marquée SIMULATION)', /SIMULATION/.test(alerte.texte) && /ACHAT/.test(alerte.texte) && /99,5/.test(alerte.texte), alerte.texte.slice(0, 160));
v('l’ordre limité en attente est dans l’état (l’écran affichera « en préparation »)', etat.pendante && etat.pendante.ordre === 'limite' && etat.pendante.niveau === 99.5 && !etat.position);
const s2 = scenario([flat, { o: 100, h: 100, l: 99.0, c: 99.2 }]);   // le prix traverse 99,5 (jusqu'à 99,0) : rempli
const rempli = avancerRegleRiche({ regle, serie: s2, etat, config: cfg0 }); etat = rempli.etat;
v('le prix traverse le niveau : une position est ouverte (entrée 99,5)', etat.position && etat.position.fill === 99.5 && !etat.pendante && etat.position.maker === true, JSON.stringify(etat.position && { fill: etat.position.fill, stop: etat.position.stop }));
const s3 = scenario([flat, { o: 100, h: 100, l: 99.0, c: 99.2 }, { o: 99.2, h: 103, l: 99.1, c: 102.5 }]);   // objectif à 2 R = 99,5 + 3 = 102,5 atteint
const clos = avancerRegleRiche({ regle, serie: s3, etat, config: cfg0 }); etat = clos.etat;
const cl = clos.evenements.find(e => e.type === 'CLOTURE');
v('objectif atteint : position clôturée, +2 R sans frais', cl && cl.trade.motif === 'cible' && Math.abs(cl.trade.R - 2) < 1e-6 && etat.trades.length === 1 && !etat.position, JSON.stringify(cl && cl.trade));
// via la surveillance commune (le même point d'entrée que le service)
const sv = surveillerRegle({ regle, s: null, suivi: null, serie: tranche(scenario([]), 0, 5000), risque: {}, alertesRecentes: [], maintenant: 1761600000000, config: cfg0 });
v('surveillerRegle aiguille les familles riches vers le suivi riche (même forme de résultat)', !sv.erreur && sv.suivi.derniereBarre != null && Array.isArray(sv.alertes) && sv.resume.n === 0, JSON.stringify(sv.erreur));
delete FAMILLES.test_limite_v6;
console.log('Suivi en direct des familles riches : ' + ok + ' vérifications réussies, ' + ko + ' échec(s).'); process.exit(ko ? 1 : 0);
