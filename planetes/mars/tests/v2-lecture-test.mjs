// Tests de « Raylé lit le marché » (V2, phase 6) sur des marchés FABRIQUÉS (on sait ce qu'ils contiennent).  Lancer :  node planetes/mars/tests/v2-lecture-test.mjs
import { lireMarcheV2, lectureBougies, pivotsDe, BOUGIES_MIN } from '../pc/agents-v2/lecture-marche-v2.js';
import { alea } from '../pc/mars-calcul.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const T0 = Date.UTC(2025, 0, 6, 0, 0);
/* chemin de prix par segments [{ n, de, vers }] (interpolation linéaire) + bruit ; chaque bougie : o = clôture précédente */
function bougies(segments, { bruit = 0.35, graine = 3, volume = 100 } = {}) {
  const a = alea(graine), out = []; let c = segments[0].de, t = T0;
  for (const s of segments) for (let k = 0; k < s.n; k++) {
    const cible = s.de + (s.vers - s.de) * (k + 1) / s.n + (a() - 0.5) * 2 * bruit, o = c, cl = cible, h = Math.max(o, cl) + a() * bruit * 0.6, l = Math.min(o, cl) - a() * bruit * 0.6;
    out.push({ t, o, h, l, c: cl, v: volume * (0.7 + a() * 0.6), vb: volume * (0.4 + a() * 0.2) }); c = cl; t += 900e3;
  }
  return out;
}
const montee = []; { let p = 100; for (let q = 0; q < 8; q++) { montee.push({ n: 14, de: p, vers: p + 6 }, { n: 8, de: p + 6, vers: p + 3 }); p += 3; } }
const R1 = lireMarcheV2(bougies(montee), { unite: 'M15', actif: 'BTC' });
v('tendance haussière reconnue (sommets et creux de plus en plus hauts)', R1.ok && R1.contexte === 'tendance haussière' && R1.structure.hh && R1.structure.hl, R1.contexte);
const descente = montee.map(s => ({ n: s.n, de: 200 - (s.de - 100), vers: 200 - (s.vers - 100) }));
const R2 = lireMarcheV2(bougies(descente), { unite: 'H1' }); v('tendance baissière reconnue', R2.ok && R2.contexte === 'tendance baissière' && R2.structure.lh && R2.structure.ll, R2.contexte);
const rangeSeg = []; for (let q = 0; q < 10; q++) rangeSeg.push({ n: 8, de: q % 2 ? 105 : 100, vers: q % 2 ? 100 : 105 });
const R3 = lireMarcheV2(bougies(rangeSeg, { bruit: 0.3 }), { unite: 'M15' });
v('range reconnu avec ses bornes', R3.ok && R3.contexte === 'range' && R3.range.estRange && R3.range.haut > 104 && R3.range.bas < 101, R3.contexte + ' ' + (R3.range && R3.range.largeurATR));
v('range : le rapport nomme les bornes et les scénarios', /entre/.test(R3.texte) && /Scénario haussier/.test(R3.texte) && /Scénario baissier/.test(R3.texte) && /invalidé par/.test(R3.texte));
v('scénarios : déclencheur, objectif et invalidation présents', ['declencheur', 'objectif', 'invalidation'].every(k => R3.scenarios.haussier[k] && R3.scenarios.baissier[k]));

// ── cassure de range ──
const casse = [...rangeSeg, { n: 6, de: 102, vers: 108 }];
const R4 = lireMarcheV2(bougies(casse, { bruit: 0.3 }), { unite: 'M15' });
v('fin de range : cassure haussière détectée', R4.finRange && R4.finRange.type === 'cassure' && R4.finRange.sens === 1, JSON.stringify(R4.finRange));
v('cassure confirmée si la dernière clôture reste au-delà', R4.finRange && R4.finRange.confirmee === true);
const fausse = [...rangeSeg, { n: 3, de: 102, vers: 106.5 }, { n: 3, de: 106.5, vers: 102 }];
const R5 = lireMarcheV2(bougies(fausse, { bruit: 0.3 }), { unite: 'M15' });
v('cassure non confirmée (retour dans la boîte) : jamais présentée comme confirmée', !R5.finRange || R5.finRange.type !== 'cassure' || R5.finRange.confirmee === false, JSON.stringify(R5.finRange));

// ── prise de liquidité ──
const base = bougies(rangeSeg, { bruit: 0.3 }), dernier = base[base.length - 1], hautPivot = Math.max(...base.map(x => x.h));
const ajoute = [...base, { t: dernier.t + 900e3, o: dernier.c, h: hautPivot + 1.2, l: dernier.c - 0.3, c: dernier.c - 0.4, v: 150, vb: 70 }];
const R6 = lireMarcheV2(ajoute, { unite: 'M15' });
v('prise de liquidité : mèche au-dessus du sommet, clôture à l’intérieur', R6.sweeps.some(s => s.sens === -1), JSON.stringify(R6.sweeps.slice(-1)));
v('…décrite en français', /Prise de liquidité/.test(R6.texte));
const bas2 = [...base, { t: dernier.t + 900e3, o: dernier.c, h: dernier.c + 0.3, l: Math.min(...base.map(x => x.l)) - 1.2, c: dernier.c + 0.4, v: 150, vb: 80 }];
v('prise de liquidité sous un creux (sens haussier)', lireMarcheV2(bas2).sweeps.some(s => s.sens === 1));

// ── quand éviter ──
const faible = bougies(rangeSeg, { bruit: 0.3 }).map((x, i, a) => (i >= a.length - 3 ? { ...x, v: x.v * 0.2 } : x));
const R7 = lireMarcheV2(faible, { unite: 'M15' }); v('volume faible : signalé dans « quand éviter »', R7.eviter.some(x => /Volume faible/.test(x)), JSON.stringify(R7.eviter));
const maint = faible[faible.length - 1].t + 900e3;
const R8 = lireMarcheV2(bougies(rangeSeg, { bruit: 0.3 }), { unite: 'M15', maintenant: maint, annonces: [{ t: maint + 45 * 60e3, nom: 'CPI US' }] });
v('annonce majeure dans 45 min : à éviter', R8.eviter.some(x => /CPI US/.test(x) && /45 min/.test(x)), JSON.stringify(R8.eviter));
const R9 = lireMarcheV2(bougies(rangeSeg, { bruit: 0.3 }), { unite: 'M15', maintenant: maint, annonces: [{ t: maint + 5 * 3600e3, nom: 'FOMC' }] }); v('annonce dans 5 heures : pas d’interdiction', !R9.eviter.some(x => /FOMC/.test(x)));
const etroit = []; for (let q = 0; q < 10; q++) etroit.push({ n: 8, de: q % 2 ? 100.6 : 100, vers: q % 2 ? 100 : 100.6 });
const R10 = lireMarcheV2(bougies(etroit, { bruit: 0.12 }), { unite: 'M15' }); v('range très étroit : signalé quand il est étroit', R10.contexte !== 'range' || R10.range.largeurATR >= 3 || R10.eviter.some(x => /Range très étroit/.test(x)), R10.contexte + ' ' + R10.range.largeurATR);
v('sans volume fourni : dit « non fourni », ne l’invente pas', /Volume : non fourni/.test(lireMarcheV2(bougies(rangeSeg).map(x => ({ o: x.o, h: x.h, l: x.l, c: x.c, t: x.t }))).texte));
v('volume : direction calculée et delta réel utilisé quand il est fourni', ['acheteuse', 'vendeuse', 'équilibrée'].includes(R1.volume.direction) && R1.volume.deltaReel != null);

// ── données manquantes, honnêteté ──
const R11 = lireMarcheV2(bougies(montee).slice(0, 30)); v('moins de ' + BOUGIES_MIN + ' bougies : refus honnête, la page demandera la capture du graphique', R11.ok === false && R11.manque === 'bougies' && /60/.test(R11.raison));
v('liste vide ou invalide : pas d’erreur', lireMarcheV2(null).ok === false && lireMarcheV2([{ o: 'x' }]).ok === false);
v('le rapport rappelle que ce n’est pas une prévision et qu’aucun ordre n’est passé', /pas des prévisions/.test(R1.texte) && /aucun ordre/.test(R1.texte));
v('un rapport est du français (aucune valeur technique brute)', !/undefined|NaN|\[object/.test(R1.texte + R3.texte + R4.texte));

// ── causalité : la lecture à la bougie k ne dépend pas des bougies suivantes ──
const tout = bougies(montee), k = 120, sans = lireMarcheV2(tout.slice(0, k + 1)), empoisonne = [...tout.slice(0, k + 1), ...tout.slice(k + 1).map(x => ({ ...x, h: 1e9, l: 1e-3, c: 1e9, o: 1e-3 }))].slice(0, k + 1), avec = lireMarcheV2(empoisonne);
v('la lecture ne regarde pas au-delà de la dernière bougie fermée', sans.contexte === avec.contexte && sans.texte === avec.texte);
// ── bougie par bougie ──
const lb = lectureBougies(bougies(montee), 6, { unite: 'M15' });
v('lecture bougie par bougie : 6 lignes datées en français', lb.ok && lb.lignes.length === 6 && lb.lignes.every(l => /\d\d\/\d\d/.test(l) && /ATR/.test(l)), JSON.stringify(lb).slice(0, 200));
v('les pivots confirmés retardent de k bougies', (() => { const b = bougies(montee), { hauts } = pivotsDe(b, 3); return hauts.every(p => p.i <= b.length - 4); })());
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
