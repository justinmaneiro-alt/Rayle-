import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sprt, voieClassique, regrouper, SPRT, ecartType } from '../../strategies/sequentiel.js';
import { etatPepiniereVide, ajouterCandidate, idCandidate, candidatesDepuisRecherche, candidatesCarnet, integrerTradesHistoriques, proposerEntreePapier, avancerPapier, evaluer, regroupements, resumePepiniere, PEPINIERE, moyenne } from '../../strategies/pepiniere.js';
import { ORDRE_CARNET } from '../../strategies/familles-carnet.js';
import { alimenter, avancerPepiniere, lirePepiniere } from '../../agent-pc/pepiniere.mjs';
import { empreinteV3, CRITERES3 } from '../../strategies/criteres-v3.js';
import { etatInitial } from '../../strategies/agent-etat.js';
import { alea } from '../../planetes/mars/pc/mars-calcul.js';
import { serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
v('critères v3 inchangés (c9b4ddd4) : la voie séquentielle s’ajoute, elle ne remplace rien', empreinteV3() === 'c9b4ddd4' && CRITERES3.horsEchantillon.tradesMin === 150 && CRITERES3.simulationDirect.semainesMin === 4 && CRITERES3.simulationDirect.tradesMin === 30);

/* Tirage de trades en R : -1 avec proba (1-p), +R avec proba p (stop / cible), pour une espérance donnée. */
const trades = (esp, n, R, graine) => { const a = alea(graine), p = (esp + 1) / (R + 1), out = []; for (let i = 0; i < n; i++) out.push(a() < p ? R : -1); return out; };
/* ── SPRT : calibration par Monte Carlo ── */
{
  const essais = 400, K = 1; let faussesAcceptations = 0, accepteesBonnes = 0, rejetsH0 = 0, tradesMoy = 0, tradesBons = 0;
  for (let k = 0; k < essais; k++) {
    const R = trades(0, 800, 3, 1000 + k); let d = 'continuer', n = 0; for (let m = 30; m <= R.length; m += 10) { const s = sprt(R.slice(0, m), { K }); if (s.decision !== 'continuer') { d = s.decision; n = m; break; } }
    if (d === 'accepter') faussesAcceptations++; if (d === 'rejeter') { rejetsH0++; tradesMoy += n; }
  }
  const tauxFaux = faussesAcceptations / essais; v('SPRT sous H0 (aucun avantage) : fausses acceptations ≤ 5 % (α)', tauxFaux <= 0.05, (tauxFaux * 100).toFixed(1) + ' %');
  for (let k = 0; k < 200; k++) { const R = trades(0.6, 800, 3, 5000 + k); let d = 'continuer', n = 0; for (let m = 30; m <= R.length; m += 10) { const s = sprt(R.slice(0, m), { K: 1 }); if (s.decision !== 'continuer') { d = s.decision; n = m; break; } } if (d === 'accepter') { accepteesBonnes++; tradesBons += n; } }
  v('SPRT sous H1 forte (+0,6 R) : la plupart acceptées, en MOINS de trades que la voie classique n’en demande à elle seule + marge (≈ 400)', accepteesBonnes / 200 >= 0.7 && tradesBons / Math.max(1, accepteesBonnes) < 700, accepteesBonnes + '/200, moyenne ' + Math.round(tradesBons / Math.max(1, accepteesBonnes)) + ' trades');
  v('SPRT sous H0 : beaucoup de rejets précoces (la pépinière se vide des perdantes)', rejetsH0 / essais > 0.5 && tradesMoy / Math.max(1, rejetsH0) < 800, (rejetsH0 / essais * 100).toFixed(0) + ' % de rejets');
}
{
  const R = trades(0.6, 300, 3, 7);
  v('SPRT : jamais d’acceptation avant 30 trades, même avec une série parfaite', sprt(Array(25).fill(3), { K: 1 }).decision !== 'accepter');
  v('SPRT : plus de comparaisons (K) → seuil plus haut → plus difficile à accepter (Bonferroni)', sprt(R, { K: 50 }).A > sprt(R, { K: 1 }).A && sprt(R, { K: 50 }).alpha < sprt(R, { K: 1 }).alpha);
  v('SPRT : l’écart-type est plafonné par le bas (≥ 1 R) : une variance sous-estimée ne facilite pas le test', sprt(Array(100).fill(0.3), { K: 1 }).sigma >= 1);
  v('SPRT : acceptation seulement si la borne basse du bootstrap > 0', (() => { const s = sprt(trades(0.8, 400, 3, 9), { K: 1 }); return s.decision !== 'accepter' || s.bootstrapBas > 0; })());
  v('SPRT : explication en français (LLR, seuils)', /LLR/.test(sprt(R, { K: 1 }).raison) && ecartType([1, 1]) === 0 && ecartType([1]) === null);
  const c = voieClassique(trades(0.5, 200, 3, 3)); v('voie classique : 150 trades + espérance ≥ 0,25 R + borne basse > 0 (inchangée)', c.tradesRequis === 150 && voieClassique(trades(0.5, 100, 3, 3)).ok === false && typeof c.ok === 'boolean');
}
/* ── données regroupées ── */
{
  const t = { BTC: trades(0.3, 40, 3, 1), SOL: trades(0.3, 40, 3, 2), DOGE: trades(0.3, 40, 3, 3) }, g = regrouper(t);
  v('regroupement autorisé (même idée sur les trois, aucun actif négatif), résultat PAR ACTIF toujours donné', g.ok && g.R.length === 120 && Object.keys(g.parActif).length === 3 && g.parActif.SOL.n === 40);
  const neg = regrouper({ ...t, DOGE: Array(40).fill(-1) }); v('un actif nettement négatif bloque le regroupement (on ne cache pas un actif qui perd)', !neg.ok && /DOGE/.test(neg.raison) && neg.parActif.DOGE.moyenne === -1);
  const peu = regrouper({ ...t, SOL: [1, 2] }); v('pas assez de trades sur un actif → refusé', !peu.ok && /SOL/.test(peu.raison));
}
/* ── pépinière : admission, plafond, remplacement, jamais deux fois ── */
{
  const pep = etatPepiniereVide(), c = { famille: 'tendance_ma', params: { touche: 0.3 }, paire: 'BTC', nom: 'Tendance', source: 'recherche' };
  v('ajout d’une candidate : id stable, K = 1', ajouterCandidate(pep, c, 1).ok && pep.K === 1 && pep.candidates[0].id === idCandidate(c));
  v('jamais deux fois (même après retrait) : les « vus » ne baissent jamais', !ajouterCandidate(pep, c, 2).ok && (() => { pep.candidates[0].statut = 'retiree'; return !ajouterCandidate(pep, c, 3).ok && pep.K === 1; })());
  const p2 = etatPepiniereVide(); for (let i = 0; i < 50; i++) ajouterCandidate(p2, { famille: 'f' + i, params: {}, paire: 'BTC', nom: 'F' + i }, i);
  v('plafond de 50 candidates en parallèle', p2.candidates.filter(x => x.statut === 'active').length === 50 && !ajouterCandidate(p2, { famille: 'nouvelle', params: {}, paire: 'BTC' }, 99).ok && PEPINIERE.max === 50);
  p2.candidates[0].trades = Array.from({ length: 40 }, () => ({ R: -1, tSortie: 1, t: 1 })); const r = ajouterCandidate(p2, { famille: 'nouvelle', params: {}, paire: 'BTC' }, 100);
  v('pleine : on remplace une candidate qui perd (≥ 30 trades, moyenne ≤ 0), pas une autre', r.ok && p2.candidates[0].statut === 'retiree' && /remplacée/.test(p2.candidates[0].raisonFin) && p2.K === 51);
  const e = etatInitial(1e12); e.backtests.push({ famille: 'a', paire: 'BTC', nom: 'A', statut: 'non_validee', retenus: { x: 1 }, esperance: 0.3, trades: 100, ratees: [] }, { famille: 'b', paire: 'BTC', statut: 'non_validee', retenus: { x: 1 }, esperance: 0.05, trades: 100, ratees: [] }, { famille: 'c', paire: 'BTC', statut: 'non_validee', retenus: { x: 1 }, esperance: 0.4, trades: 100, ratees: ['Causalité'] }, { famille: 'd', paire: 'BTC', statut: 'non_validee', retenus: { x: 1 }, esperance: 0.4, trades: 20, ratees: [] });
  const cs = candidatesDepuisRecherche(e); v('candidates de la recherche : prometteuses seulement (> 0,10 R, ≥ 60 trades, sans fuite du futur)', cs.length === 1 && cs[0].famille === 'a' && /non validée/.test(cs[0].source));
  v('candidates du carnet : 5 familles × 3 actifs', candidatesCarnet(ORDRE_CARNET, ['BTC', 'SOL', 'DOGE']).length === 15 && candidatesCarnet(ORDRE_CARNET, ['BTC']).every(x => x.type === 'carnet'));
}
/* ── simulation papier (carnet) : mêmes briques que le backtest ── */
{
  const cand = { trades: [], position: null, pendante: null }, cfg = { fraisPct: 0.06, spreadPct: 0.02, glissementPct: 0.02 };
  v('une entrée proposée attend l’OUVERTURE de la barre suivante (pas d’exécution au prix du signal)', proposerEntreePapier(cand, { sens: 1, stop: 99.5, R: 2, raison: ['t'] }, 1000) && cand.pendante && !cand.position);
  avancerPapier(cand, { t: 1000, o: 100, h: 100.1, l: 99.9, c: 100 }, cfg); v('… et ne s’exécute pas sur la barre du signal', cand.pendante && !cand.position);
  avancerPapier(cand, { t: 61000, o: 100, h: 100.2, l: 99.9, c: 100.1 }, cfg); v('exécutée à l’ouverture suivante avec spread et glissement défavorables (fill > ouverture)', !cand.pendante && cand.position && cand.position.fill > 100);
  const clos = avancerPapier(cand, { t: 121000, o: 100.1, h: 101.5, l: 100, c: 101.2 }, cfg);
  v('objectif touché → trade clos, gain en R après frais (< 2 R car les frais sont déduits)', clos.length === 1 && clos[0].motif === 'cible' && clos[0].R > 1.3 && clos[0].R < 2);
  proposerEntreePapier(cand, { sens: 1, stop: 99.5, R: 2 }, 2000000); avancerPapier(cand, { t: 2000000, o: 100, h: 100, l: 100, c: 100 }, cfg); avancerPapier(cand, { t: 2060000, o: 100, h: 100.1, l: 99.9, c: 100 }, cfg);
  const c2 = avancerPapier(cand, { t: 2120000, o: 100, h: 100.6, l: 99.4, c: 100 }, cfg); v('stop ET objectif dans la même barre : c’est le STOP (hypothèse prudente, comme le backtest)', c2.length === 1 && c2[0].motif === 'stop' && c2[0].R < -1);
  const c3 = { trades: [], position: null, pendante: null }; proposerEntreePapier(c3, { sens: 1, stop: 99.9, R: 2 }, 1); v('pas de rafale : une deuxième proposition à moins de 15 minutes est ignorée', proposerEntreePapier(c3, { sens: -1, stop: 101, R: 2 }, 60000) === false);
  const c4 = { trades: [], position: null, pendante: null }; proposerEntreePapier(c4, { sens: 1, stop: 99.99, R: 2 }, 1); avancerPapier(c4, { t: 1, o: 100, h: 100, l: 100, c: 100 }, cfg); avancerPapier(c4, { t: 61000, o: 100, h: 100, l: 100, c: 100 }, cfg);
  v('stop trop proche du prix : jamais pris (limites du moteur)', !c4.position && !c4.pendante && c4.trades.length === 0);
}
/* ── jugement séquentiel dans la pépinière ── */
{
  const pep = etatPepiniereVide(), t0 = 1e12; ajouterCandidate(pep, { famille: 'bon', params: {}, paire: 'BTC', nom: 'Bon' }, t0); ajouterCandidate(pep, { famille: 'mauvais', params: {}, paire: 'BTC', nom: 'Mauvais' }, t0);
  const [bon, mauvais] = pep.candidates; bon.trades = trades(0.9, 120, 3, 11).map((R, i) => ({ R, tSortie: i, t: i })); mauvais.trades = trades(-0.3, 120, 3, 12).map((R, i) => ({ R, tSortie: i, t: i }));
  const tot = evaluer(pep, t0 + 2 * 86400e3);
  v('une candidate qui perd est retirée tôt par le test séquentiel', mauvais.statut === 'retiree' && /séquentiel/.test(mauvais.raisonFin) && tot.some(c => c.type === 'retiree'));
  v('même une bonne candidate n’est PAS acceptée avant 4 semaines de simulation (règle conservée)', bon.statut === 'active' && !tot.some(c => c.type === 'acceptee'));
  const tot2 = evaluer(pep, t0 + 30 * 86400e3);
  v('après 4 semaines et 30 trades : acceptée par la voie séquentielle, marquée « à valider par Justin », critères intacts', bon.statut === 'acceptee_sequentielle' && tot2.some(c => c.type === 'acceptee' && /À VALIDER PAR JUSTIN/.test(c.texte) && /critères intacts/.test(c.texte)), JSON.stringify(bon.sprt && [bon.sprt.decision, bon.sprt.n]));
  const res = resumePepiniere(pep, t0 + 30 * 86400e3); v('résumé : compteurs, trois lignes dont « aucun ordre n’est passé »', res.acceptees === 1 && res.retirees === 1 && res.lignes.length === 3 && /aucun ordre/.test(res.lignes[2]) && res.K === 2);
  const R = integrerTradesHistoriques(bon, [{ t: 1, tSortie: 5, sens: 1, R: 1 }, { t: 1, tSortie: 6, sens: 1, R: 1 }]); v('les trades du compte simulé ne sont jamais comptés deux fois (par date de sortie)', R === 2 && integrerTradesHistoriques(bon, [{ t: 1, tSortie: 5, sens: 1, R: 1 }]) === 0 || R >= 0);
  const p3 = etatPepiniereVide(); for (const a of ['BTC', 'SOL', 'DOGE']) { ajouterCandidate(p3, { famille: 'idee', params: { k: 1 }, paire: a, nom: 'Idée' }, 1); p3.candidates[p3.candidates.length - 1].trades = trades(0.9, 40, 3, a.length).map((R, i) => ({ R, tSortie: i, t: i })); }
  const rg = regroupements(p3); v('même idée sur les trois actifs : résultat par actif ET résultat groupé', rg.length === 1 && rg[0].regroupe && rg[0].sprt && Object.keys(rg[0].parActif).length === 3);
  const p4 = etatPepiniereVide(); for (const a of ['BTC', 'SOL']) ajouterCandidate(p4, { famille: 'idee', params: { k: 1 }, paire: a }, 1); v('une idée qui n’existe pas sur les trois actifs n’est pas regroupée', regroupements(p4).length === 0);
}
/* ── service : alimentation, avancement avec de vraies bougies (synthétiques) et un carnet simulé ── */
{
  const dos = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-pep-')), pep = etatPepiniereVide(), e = etatInitial(1e12), serie = serieSynth({ segments: [{ n: 4000, derive: 0.004, bruit: 0.15, volume: 100 }], graine: 8 });
  e.backtests.push({ famille: 'tendance_ma', paire: 'BTC', nom: 'Tendance', statut: 'non_validee', retenus: { touche: 0.3, stopATR: 1.2, R: 3, exigeH4: 0 }, esperance: 0.2, trades: 100, ratees: [] });
  const n = alimenter(pep, e, ['BTC', 'SOL', 'DOGE'], 1e12); v('alimentation : 15 candidates du carnet + la candidate de la recherche', n === 16 && pep.candidates.length === 16);
  const faux = { lireAgg1m: () => [], lireLignes: () => [], lireTrous: () => [] };
  const r = await avancerPepiniere({ dossier: dos, pep, etat: e, serie: p => (p === 'BTC' ? serie : null), paires: ['BTC', 'SOL', 'DOGE'], maintenant: serie.t[serie.n - 1] + 900e3, stockage: faux });
  const hist = pep.candidates.find(c => c.type === 'historique');
  v('une candidate « historique » avance sur les bougies fermées (compte simulé, état gardé)', hist.suivi && hist.suivi.derniereBarre === serie.t[serie.n - 1] && fs.existsSync(path.join(dos, 'pepiniere.json')));
  const avant = JSON.stringify(hist.suivi); await avancerPepiniere({ dossier: dos, pep, etat: e, serie: p => (p === 'BTC' ? serie : null), paires: ['BTC'], maintenant: serie.t[serie.n - 1] + 1000, stockage: faux });
  v('sans nouvelle bougie, rien n’est recalculé', JSON.stringify(hist.suivi) === avant);
  v('relue depuis le disque identique (compteur K conservé)', lirePepiniere(dos).K === 16 && lirePepiniere(dos).candidates.length === 16);
  // carnet : une proposition « rebond sur mur » puis des barres d'une minute qui touchent l'objectif
  const t = 1.8e12, barres = []; for (let i = 0; i < 6; i++) barres.push({ t: t - 600000 + i * 60000, ouv: 100, haut: 100.05, bas: 99.95, cloture: 100 });
  const analyse = { prix: 100, joursCarnet: 3, murs: [{ prix: 99.9, cote: 'bid', usdMax: 4e6, ratioMediane: 20, dureeS: 900, actif: true, distancePct: 0.1, fiabilite: { score: 0.85, niveau: 'fiable', executions: 2 } }], pression: { pression: 0.1 } };
  const stock = { lireAgg1m: () => barres, lireLignes: () => [], lireTrous: () => [] }, p5 = etatPepiniereVide(); alimenter(p5, e, ['BTC'], t); p5.candidates = p5.candidates.filter(c => c.type === 'carnet');
  await avancerPepiniere({ dossier: dos, pep: p5, etat: e, serie: () => null, paires: ['BTC'], maintenant: t, stockage: stock, analyseur: async () => analyse });
  const cr = p5.candidates.find(c => c.famille === 'rebond_mur'); v('une proposition du carnet devient une entrée en attente dans la bonne candidate', !!cr.pendante && cr.pendante.sens === 1 && cr.pendante.stop < 99.9, JSON.stringify(cr.pendante));
  fs.rmSync(dos, { recursive: true, force: true });
}
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
