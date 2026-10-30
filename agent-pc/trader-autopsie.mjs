// AUTOPSIE DES MOUVEMENTS (V12, phase 1) : pour le mouvement BTC du 29-30 octobre 2026 et pour 10 autres gros mouvements tirés AU HASARD sur les 12 derniers mois (BTC, SOL, DOGE),
// reconstitue ce qu'un trader voyait AVANT l'entrée (biais, structure, liquidité, volume, delta, profil), ce que le moteur Trader aurait proposé, et les faux signaux à côté.
//   node agent-pc/trader-autopsie.mjs [--ecrire]      (--ecrire écrit docs/AUTOPSIE_MOUVEMENTS.md ; sans l'option, imprime un résumé)
// Les mouvements sont énumérés par une RÈGLE objective (extrême local de 36 h suivi d'un mouvement d'au moins X % en 24 h), puis tirés avec une graine fixe : pas choisis après coup.
// Aucune information postérieure au point de décision n'entre dans « ce qui était visible » ; le futur ne sert qu'à dire si le mouvement a eu lieu et comment les propositions ont fini.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerSerie } from './trader-donnees.mjs';
import { preparer, proposer, analyser, niveauxLiquidite, niveauxPris, profilA, SETUPS } from '../strategies/trader/moteur.js';
import { parcourir } from '../strategies/trader/serie.js';
import { fr, prixTexte, PAS } from '../strategies/trader/outils.js';
import { retroTest } from '../strategies/trader/retrotest.js';
import { ETIQUETTE_RETRO as ETIQ } from '../strategies/trader/serie.js';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), SEUILS = { BTC: 0.03, SOL: 0.05, DOGE: 0.06 }, AN = 35040;
const date = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
function alea(g) { let a = g >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Énumère les gros mouvements des 12 derniers mois : extrême local (±48 bougies avant, +96 après) suivi de ≥ seuil en 96 bougies. */
function mouvements(s, actif) {
  const out = [], de = s.n - AN, seuil = SEUILS[actif];
  for (let i = Math.max(48, de); i < s.n - 100; i++) {
    let bas = true, haut = true;
    for (let q = i - 48; q <= i + 96; q++) { if (s.l[q] < s.l[i]) bas = false; if (s.h[q] > s.h[i]) haut = false; if (!bas && !haut) break; }
    if (bas) { let m = -1, im = i; for (let q = i + 1; q <= i + 96; q++) if (s.h[q] > m) { m = s.h[q]; im = q; } if (m / s.l[i] - 1 >= seuil) { out.push({ actif, sens: 1, iDebut: i, iFin: im, pct: m / s.l[i] - 1 }); i += 96; } }
    else if (haut) { let m = Infinity, im = i; for (let q = i + 1; q <= i + 96; q++) if (s.l[q] < m) { m = s.l[q]; im = q; } if (1 - m / s.h[i] >= seuil) { out.push({ actif, sens: -1, iDebut: i, iFin: im, pct: 1 - m / s.h[i] }); i += 96; } }
  }
  return out;
}

/* Reconstitue la situation à la bougie `ref` (rien après `ref`). */
function visible(P, ref, sens) {
  const m = P.m15, a = analyser(P, ref), niv = niveauxLiquidite(P, ref), c = m.c[ref], prof = profilA(P, ref);
  const dessous = niv.filter(x => x.prix < c).sort((x, y) => y.prix - x.prix), dessus = niv.filter(x => x.prix > c).sort((x, y) => x.prix - y.prix);
  let pic = 0, dsum = 0, dconnu = true; for (let q = ref - 12; q <= ref; q++) { pic = Math.max(pic, m.v[q] / P.vmoy[ref]); if (Number.isNaN(P.delta[q])) dconnu = false; else dsum += P.delta[q]; }
  const pris = niveauxPris(P, ref, 12);
  return { biais: a.biais, regime: a.regime, struct: a.struct, vwapCote: c > P.vwap[ref] ? 'au-dessus' : 'en dessous', prix: c, vwap: P.vwap[ref], ema50h1: a.ema50h1, prof, dessous: dessous.slice(0, 3), dessus: dessus.slice(0, 3), pic, delta: dconnu ? dsum : null, balayages: pris.map(x => (x.haut ? 'plus haut ' : 'plus bas ') + (x.src === 'veille' ? 'de la veille' : x.src) + ' ' + prixTexte(x.prix)), sens };
}
const texteVisible = v => {
  const L = [];
  L.push('Biais H1/H4 : **' + (v.biais > 0 ? 'haussier' : v.biais < 0 ? 'baissier' : 'neutre') + '** (structure H1 ' + (v.struct > 0 ? 'HH/HL' : v.struct < 0 ? 'LH/LL' : 'indécise') + ', prix ' + v.vwapCote + ' du VWAP, régime ' + v.regime + ').');
  if (v.prof) L.push('Profil de volume 2 jours : POC ' + prixTexte(v.prof.poc) + ', zone de valeur ' + prixTexte(v.prof.val) + ' – ' + prixTexte(v.prof.vah) + '.');
  L.push('Liquidité non prise au-dessus : ' + (v.dessus.map(x => prixTexte(x.prix) + ' (' + x.src + ')').join(', ') || 'aucune') + ' ; en dessous : ' + (v.dessous.map(x => prixTexte(x.prix) + ' (' + x.src + ')').join(', ') || 'aucune') + '.');
  L.push('Volume : pic à ' + fr(v.pic, 1) + '× la moyenne sur les 3 dernières heures ; delta cumulé ' + (v.delta == null ? 'inconnu' : (v.delta >= 0 ? 'acheteur' : 'vendeur')) + '.');
  L.push('Balayages récents : ' + (v.balayages.join(' ; ') || 'aucun') + '.');
  return L;
};

function autopsier(P, s, actif, mv, etiquette) {
  const ref = mv.iDebut + 8, deb = mv.iDebut - 8, fin = Math.min(s.n - 2, mv.iDebut + 48), v = visible(P, ref, mv.sens);
  const emises = parcourir(s, { actif, style: 'equilibre', de: deb, a: fin, P }), alignees = emises.filter(p => p.sens === mv.sens), opposees = emises.filter(p => p.sens !== mv.sens);
  // causes d'absence : on rejoue le moteur brut sur la fenêtre et on note les refus et les biais
  const refus = {}; let biaisOk = 0, nb = 0, alignBrut = 0;
  for (let i = deb; i <= fin; i++) { const r = proposer(P, i, { style: 'equilibre', actif }); nb++; if (r.analyse.biais === mv.sens) biaisOk++; if (r.propositions.some(p => p.sens === mv.sens)) alignBrut++; for (const x of r.refus) if (x.sens === mv.sens) refus[x.pourquoi.replace(/\(.*?\)/g, '').trim()] = (refus[x.pourquoi.replace(/\(.*?\)/g, '').trim()] || 0) + 1; }
  let cause = null;
  if (!alignees.length) {
    if (biaisOk / nb < 0.25) cause = 'biais en retard ou contraire (le biais n’était dans le sens du mouvement que ' + Math.round(100 * biaisOk / nb) + ' % du temps dans la fenêtre)';
    else if (Object.keys(refus).length) cause = 'conditions de risque refusées : ' + Object.entries(refus).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => k + ' (' + n + '×)').join(' ; ');
    else cause = 'aucun déclencheur : aucune des quatre conditions n’était réunie dans le sens du mouvement';
  } else if (!alignees.some(p => p.resultat.statut === 'cloturee')) cause = 'propositions faites mais l’ordre limite n’a jamais été rempli (le prix est parti sans nous)';
  return { mv, actif, etiquette, ref, v, alignees, opposees, cause, biaisPct: Math.round(100 * biaisOk / nb) };
}
const ligneProp = (p, s) => '- ' + date(p.t) + ' · **' + (p.sens > 0 ? 'ACHAT' : 'VENTE') + '** ' + SETUPS[p.setup] + ' (' + p.tf + ') · entrée ' + prixTexte(p.entree) + ', stop ' + prixTexte(p.stop) + ', cible 1 ' + prixTexte(p.cible1) + ', cible 2 ' + prixTexte(p.cible2) + ', RR ' + fr(p.rr, 1) + ', ' + p.nConfluences + ' confluence(s) → ' + (p.resultat.statut === 'cloturee' ? '**' + (p.resultat.R >= 0 ? '+' : '−') + fr(Math.abs(p.resultat.R), 2) + ' R** (' + p.resultat.motif + ')' : p.resultat.motif || p.resultat.statut);

const series = {}, preps = {}; for (const a of ['BTC', 'SOL', 'DOGE']) { series[a] = await chargerSerie(a); preps[a] = preparer(series[a]); }
const toutes = []; for (const a of ['BTC', 'SOL', 'DOGE']) for (const m of mouvements(series[a], a)) toutes.push(m);
const hasard = alea(20261030), melange = toutes.map(m => ({ m, r: hasard() })).sort((a, b) => a.r - b.r).map(x => x.m), choisis = [], parActif = {};
for (const m of melange) { if ((parActif[m.actif] || 0) >= 4) continue; choisis.push(m); parActif[m.actif] = (parActif[m.actif] || 0) + 1; if (choisis.length >= 12) break; }
choisis.sort((a, b) => series[a.actif].t[a.iDebut] - series[b.actif].t[b.iDebut]);
// le mouvement du 29-30 octobre (BTC) : sommet puis creux, puis rebond
const sB = series.BTC, i29 = (() => { let best = -1, h = 0; for (let i = 0; i < sB.n; i++) if (sB.t[i] >= Date.parse('2026-10-29T00:00Z') && sB.h[i] > h) { h = sB.h[i]; best = i; } return best; })();
const iCreux = (() => { let b = i29, l = Infinity; for (let i = i29; i < sB.n; i++) if (sB.l[i] < l) { l = sB.l[i]; b = i; } return b; })();
const iReb = (() => { let b = iCreux, h = 0; for (let i = iCreux; i < sB.n; i++) if (sB.h[i] > h) { h = sB.h[i]; b = i; } return b; })();
const vente = { actif: 'BTC', sens: -1, iDebut: i29, iFin: iCreux, pct: 1 - sB.l[iCreux] / sB.h[i29] }, rebond = { actif: 'BTC', sens: 1, iDebut: iCreux, iFin: iReb, pct: sB.h[iReb] / sB.l[iCreux] - 1 };
const resultats = [autopsier(preps.BTC, sB, 'BTC', vente, 'Vente du 29-30 octobre'), autopsier(preps.BTC, sB, 'BTC', rebond, 'Rebond qui suit')];
for (const m of choisis) resultats.push(autopsier(preps[m.actif], series[m.actif], m.actif, m, 'Mouvement tiré au hasard'));

// synthèse
const hasMoves = resultats.slice(2), avecAligne = hasMoves.filter(r => r.alignees.length), alignClot = hasMoves.flatMap(r => r.alignees.filter(p => p.resultat.statut === 'cloturee')), opposClot = hasMoves.flatMap(r => r.opposees.filter(p => p.resultat.statut === 'cloturee'));
const gagn = l => l.filter(p => p.resultat.R > 0).length, moy = l => (l.length ? l.reduce((a, p) => a + p.resultat.R, 0) / l.length : 0);
const causes = {}; for (const r of hasMoves) if (r.cause) { const k = r.cause.split(' (')[0].split(' :')[0]; causes[k] = (causes[k] || 0) + 1; }
const synthese = {
  n: hasMoves.length, avecAligne: avecAligne.length, alignTermines: alignClot.length, alignGagnants: gagn(alignClot), alignMoy: moy(alignClot), opposTermines: opposClot.length, opposGagnants: gagn(opposClot), opposMoy: moy(opposClot), causes,
  vente: resultats[0].alignees.length, rebond: resultats[1].alignees.length
};
if (process.argv.includes('--json')) { console.log(JSON.stringify(synthese, null, 1)); }

const L = [];
L.push('# Autopsie des mouvements (V12, phase 1)', '', '*Généré par `node agent-pc/trader-autopsie.mjs --ecrire` le ' + new Date().toISOString().slice(0, 10) + ' sur les vraies bougies M15 de l’agent (BTC, SOL, DOGE). Aucun ordre réel : propositions et simulation seulement.*', '');
L.push('## Méthode (pour ne pas se mentir)', '',
  '- **Choix des mouvements** : une règle objective les énumère sur les 12 derniers mois (extrême local de 36 h suivi d’un mouvement d’au moins 3 % pour BTC, 5 % pour SOL, 6 % pour DOGE en 24 h), puis **' + choisis.length + ' sont tirés au hasard avec une graine fixe** (20261030, au plus 4 par actif) : ils ne sont pas choisis après coup. Seul le mouvement du 29-30 octobre est imposé par Justin.',
  '- **« Ce qui était visible avant »** : photographie à la bougie M15 qui suit de 2 heures le début du mouvement (assez pour voir la première jambe), calculée **uniquement** avec les bougies déjà fermées (même code que le moteur, testé contre la fuite du futur).',
  '- **« Ce que le moteur aurait proposé »** : le moteur Trader (style Équilibré) rejoué de 2 h avant à 12 h après le début, avec ses plafonds (≤ 3 propositions par jour et par actif, 2 positions simultanées), puis chaque proposition suivie par la simulation prudente (ordre limite rempli seulement si le prix traverse, stop prioritaire, frais et glissement réalistes).',
  '- **Faux signaux** : les propositions de sens opposé au mouvement, dans la même fenêtre, sont listées avec leur résultat — on ne regarde pas que les réussites.', '');
L.push('## Les cinq lignes de conclusion', '');
const tauxAl = synthese.alignTermines ? Math.round(100 * synthese.alignGagnants / synthese.alignTermines) : 0, tauxOp = synthese.opposTermines ? Math.round(100 * synthese.opposGagnants / synthese.opposTermines) : 0;
L.push('1. Sur les **' + synthese.n + ' mouvements tirés au hasard**, le moteur Trader a émis au moins une proposition **dans le sens du mouvement** pour **' + synthese.avecAligne + '** d’entre eux (' + Math.round(100 * synthese.avecAligne / synthese.n) + ' %). Pour le **29-30 octobre**, il a émis ' + synthese.vente + ' proposition(s) de vente et ' + synthese.rebond + ' d’achat sur le rebond (détail plus bas).');
L.push('2. Dans le sens du mouvement, ' + synthese.alignTermines + ' propositions se sont terminées (' + synthese.alignGagnants + ' gagnantes) et ' + synthese.opposTermines + ' de sens opposé (' + synthese.opposGagnants + ' gagnantes). **Cette comparaison est biaisée par construction** : on a choisi des fenêtres PARCE QU’un gros mouvement y a eu lieu, donc les propositions « dans le sens » y gagnent presque forcément et les autres y perdent. Elle ne dit RIEN sur la rentabilité et je ne l’utilise pas comme mesure.');
L.push('3. La mesure honnête est la section suivante : le moteur rejoué sur les **12 mois entiers** (toutes les propositions, pas seulement celles qui entourent un gros mouvement), avec le taux de faux signaux et la comparaison avec des entrées au hasard de même fréquence. Étiquette : *' + ETIQ + '*.');
L.push('4. **Pourquoi aucune proposition quand il n’y en a pas** : ' + (Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' (' + n + ' mouvement(s))').join(' ; ') || 'rien à signaler') + '.');
L.push('5. **Conséquence** : l’ancienne exigence de preuve avant tout signal (0 position proposée sur 45 164 variantes testées) laissait ces mouvements sans aucune proposition ; le mode Trader propose au niveau « À l’essai » avec son bilan en direct, et désactive automatiquement les types qui perdent. Les frais aller-retour (≈ 0,13 % du prix) pèsent environ 0,2 R par trade : ils sont la raison principale pour laquelle un setup classique « presque neutre » avant frais est perdant après frais.', '');

const bloc = r => {
  const mv = r.mv, s = series[r.actif];
  L.push('### ' + r.etiquette + ' — ' + r.actif + ' ' + (mv.sens > 0 ? 'haussier' : 'baissier') + ' (' + fr(mv.pct * 100, 1) + ' %)', '');
  L.push('*Début : ' + date(s.t[mv.iDebut]) + ' (' + prixTexte(mv.sens > 0 ? s.l[mv.iDebut] : s.h[mv.iDebut]) + ') · extrême : ' + date(s.t[mv.iFin]) + ' (' + prixTexte(mv.sens > 0 ? s.h[mv.iFin] : s.l[mv.iFin]) + ') · point de décision : ' + date(s.t[r.ref]) + '.*', '');
  L.push('**Visible avant (à la clôture de ' + date(s.t[r.ref]) + ') :**', ''); for (const t of texteVisible(r.v)) L.push('- ' + t); L.push('');
  L.push('**Propositions dans le sens du mouvement :**', ''); if (r.alignees.length) for (const p of r.alignees) L.push(ligneProp(p, s)); else L.push('- aucune — **' + r.cause + '**.');
  if (r.alignees.length && r.cause) L.push('- ⚠ ' + r.cause + '.');
  L.push('', '**Faux signaux (sens opposé) dans la même fenêtre :**', ''); if (r.opposees.length) for (const p of r.opposees) L.push(ligneProp(p, s)); else L.push('- aucun.'); L.push('');
};
L.push('## Le mouvement du 29-30 octobre (BTC)', '');
const v0 = resultats[0], v1 = resultats[1];
L.push('Sommet ' + prixTexte(sB.h[i29]) + ' le ' + date(sB.t[i29]) + ', creux ' + prixTexte(sB.l[iCreux]) + ' le ' + date(sB.t[iCreux]) + ' (' + fr(vente.pct * 100, 1) + ' %), puis rebond jusqu’à ' + prixTexte(sB.h[iReb]) + ' (' + fr(rebond.pct * 100, 1) + ' %). Le biais H1/H4 était dans le sens de la vente **' + v0.biaisPct + ' %** du temps dans la fenêtre autour du sommet.', '');
bloc(v0); bloc(v1);
L.push('## Dix à douze autres mouvements, tirés au hasard (12 derniers mois)', '');
for (const r of resultats.slice(2)) bloc(r);
L.push('## Mesure honnête : le moteur rejoué sur les 12 derniers mois entiers', '', '*' + ETIQ + '. Règles fixées à l’avance, aucune retouche d’après ces chiffres. Les types sont jugés plus tard, EN AVANT, par le suivi en direct.*', '');
for (const a of ['BTC', 'SOL', 'DOGE']) {
  const r = retroTest(series[a], { actif: a, P: preps[a] }), t = r.bilan.tous.stats, h = r.bilan.hasard && r.bilan.hasard[a];
  L.push('### ' + a, '', '- ' + r.propositions.length + ' propositions du ' + date(r.de).slice(0, 10) + ' au ' + date(r.a).slice(0, 10) + ', dont ' + t.n + ' terminées avec une entrée exécutée ; **faux signaux (perdantes) : ' + (t.n ? Math.round(100 * (1 - t.taux)) : 0) + ' %**.');
  L.push('- Espérance : **' + (t.esperance >= 0 ? '+' : '−') + fr(Math.abs(t.esperance), 2) + ' R par trade** après frais' + (t.ic ? ' (intervalle à 95 % : ' + fr(t.ic[0], 2) + ' ; ' + fr(t.ic[1], 2) + ')' : '') + ' ; ' + t.honnete);
  if (h && h.assez) L.push('- Entrées au hasard de même fréquence et mêmes distances : ' + (h.esperance >= 0 ? '+' : '−') + fr(Math.abs(h.esperance), 2) + ' R par trade (la barre à battre).');
  L.push('- Par type : ' + r.bilan.parSetup.map(x => SETUPS[x.cle] + ' → ' + x.stats.n + ' trades, ' + (x.stats.esperance == null ? '—' : (x.stats.esperance >= 0 ? '+' : '−') + fr(Math.abs(x.stats.esperance), 2)) + ' R').join(' · '), '');
}
L.push('## Ce que l’autopsie a changé dans le moteur', '', '- **Biais en retard** : le premier essai du moteur ne voyait pas la vente du 29-30 octobre parce que la structure H1 (plus hauts / plus bas confirmés avec 3 heures de retard) restait haussière alors que le prix venait de clôturer sous le dernier plus bas. J’ai ajouté la **cassure de structure** (clôture sous le dernier plus bas H1 = structure baissière, et inversement) **après avoir vu cet événement** : l’événement du 29-30 octobre ne peut donc PAS servir de preuve de cette règle. Les autres mouvements, tirés au hasard avant et après cette correction, et le rétro-test sur période jamais vue la valident ou non ; voir `docs/AGENT.md`.',
  '- **Frais** : un stop de 0,2 % du prix (cas fréquent en M15 structurel) laisse 0,6 R de frais : le moteur impose donc un stop d’au moins ≈ 0,6 % (frais ≤ 0,22 R). Cette règle a été décidée après avoir mesuré que les frais mangeaient tout le résultat brut ; elle est documentée comme telle.',
  '- **Données manquantes** : l’historique du carnet d’ordres, des liquidations et du financement n’existe pas sur 12 mois ; ces confluences ne sont donc PAS dans le rétro-test (elles s’ajouteront en direct, étiquetées).', '');
if (process.argv.includes('--ecrire')) { fs.writeFileSync(path.join(racine, 'docs', 'AUTOPSIE_MOUVEMENTS.md'), L.join('\n') + '\n', 'utf8'); console.log('écrit docs/AUTOPSIE_MOUVEMENTS.md (' + L.length + ' lignes)'); }
console.log(JSON.stringify(synthese));
void PAS;
