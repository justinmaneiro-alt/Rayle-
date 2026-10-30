// Tests du moteur « Trader » (V12, phases 2 et 7) : causalité (AUCUNE information postérieure à la bougie), stratégie truquée rejetée, règles de risque, plafonds de fréquence,
// déterminisme, simulation prudente du suivi (remplissage, stop prioritaire, cibles partielles, expiration, frais), critères de validation intacts.
// Lancer : node galaxie/tests/trader-moteur-test.mjs
import { execFileSync } from 'node:child_process';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';
import { tranche } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { preparer, proposer, analyser, STYLES, SETUPS, ORDRE_SETUPS, COUT_MAX_R } from '../../strategies/trader/moteur.js';
import { parcourir, testerFuite } from '../../strategies/trader/serie.js';
import { simuler, COUTS_TRADER } from '../../strategies/trader/suivi.js';
import { regrouper, alignerFin, swings, dernierConf } from '../../strategies/trader/outils.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); };
const JOUR = 86400e3;

/* ── outils : agrégation H1 complète seulement, alignement sans regard vers le futur ── */
{
  const s = marcheMixte(3000, 5), h1 = regrouper(s, 3600e3), al = alignerFin(h1.fin, s.n);
  v('H1 : un quart du nombre de bougies', Math.abs(h1.n - s.n / 4) <= 2, h1.n);
  let causal = true; for (let i = 0; i < s.n; i++) { const k = al[i]; if (k >= 0 && h1.fin[k] > i) causal = false; if (k + 1 < h1.n && h1.fin[k + 1] <= i) causal = false; }
  v('alignement H1 : la bougie n’est connue qu’à la clôture de sa dernière sous-bougie', causal);
  const sw = swings(s.h, s.l, 4); v('swings : confirmés avec un retard de k bougies', sw.every(x => x.conf === x.j + 4));
  v('dernierConf : jamais un swing pas encore confirmé', (() => { for (const i of [100, 800, 2000]) { const r = dernierConf(sw, i); if (r >= 0 && sw[r].conf > i) return false; if (r + 1 < sw.length && sw[r + 1].conf <= i) return false; } return true; })());
}

/* ── causalité : préfixe contre série qui contient le futur ── */
const series = [marcheMixte(14000, 3), marcheMixte(14000, 11)];
for (const [k, s] of series.entries()) {
  const indices = []; for (let i = 3500; i < s.n - 2100; i += 311) indices.push(i);
  const r = testerFuite(s, indices, { tranche });
  v('aucune fuite du futur (série synthétique ' + (k + 1) + ', ' + indices.length + ' bougies testées)', r.ok, JSON.stringify(r.ecarts.slice(0, 1)).slice(0, 300));
}
{
  // le test doit trouver des propositions pour avoir un sens
  let n = 0; for (const s of series) { const P = preparer(s); for (let i = 3500; i < s.n - 10; i += 3) n += proposer(P, i, { style: 'actif' }).propositions.length; }
  v('le moteur propose bien quelque chose sur les séries de test (le test de fuite n’est pas vide)', n > 20, n);
}
{
  // STRATÉGIE TRUQUÉE : elle regarde la bougie suivante pour décider ; le test doit la rejeter
  const s = series[0], truque = (serie, i) => (i + 1 < serie.n && serie.c[i + 1] > serie.c[i] ? [{ setup: 'truque', sens: 1, entree: serie.c[i], stop: serie.c[i] * 0.99, cible1: serie.c[i] * 1.02, cible2: serie.c[i] * 1.03, nConfluences: 3 }] : []);
  const indices = []; for (let i = 3500; i < s.n - 2100; i += 53) indices.push(i);
  const r = testerFuite(s, indices, { proposeur: truque, tranche });
  v('une stratégie qui regarde la bougie suivante est REJETÉE par le test de fuite', !r.ok && r.ecarts.length > 5, r.ecarts.length);
  // idem : un biais calculé avec une moyenne centrée (regard des deux côtés)
  const centree = (serie, i) => { let m = 0, q = 0; for (let j = Math.max(0, i - 5); j <= Math.min(serie.n - 1, i + 5); j++) { m += serie.c[j]; q++; } return serie.c[i] > m / q ? [{ setup: 'centree', sens: 1, entree: 1, stop: 1, cible1: 1, cible2: 1, nConfluences: 1 }] : []; };
  v('une moyenne centrée (qui regarde les deux côtés) est REJETÉE', !testerFuite(s, indices, { proposeur: centree, tranche }).ok);
}

/* ── règles de risque de chaque proposition ── */
{
  const s = series[0], P = preparer(s), toutes = [];
  for (const style of Object.keys(STYLES)) for (let i = 3500; i < s.n - 10; i++) for (const p of proposer(P, i, { style, actif: 'BTC' }).propositions) toutes.push({ p, style, i });
  v('des propositions dans les trois styles', Object.keys(STYLES).every(st => toutes.some(x => x.style === st)));
  let bonnes = true, details = '';
  for (const { p, style, i } of toutes) {
    const S = STYLES[style], d = p.sens, c = s.c[i];
    const sens = d > 0 ? p.stop < p.entree && p.entree < p.cible1 && p.cible1 < p.cible2 : p.cible2 < p.cible1 && p.cible1 < p.entree && p.entree < p.stop;
    const cote = d > 0 ? p.entree < c : p.entree > c, rr = Math.abs(p.cible1 - p.entree) / Math.abs(p.entree - p.stop);
    if (!sens || !cote || rr < S.rrMin - 1e-6 || p.nConfluences < S.confluenceMin || !p.raison || !p.invalidation) { bonnes = false; details = JSON.stringify({ style, d, e: p.entree, s: p.stop, t1: p.cible1, t2: p.cible2, c, rr }); break; }
    if (!((0.13 / 100 * p.entree / Math.abs(p.entree - p.stop)) <= COUT_MAX_R + 1e-6)) { bonnes = false; details = 'frais > plafond ' + JSON.stringify(p); break; }
    if (!ORDRE_SETUPS.includes(p.setup) || !p.nom || !p.tf || !(p.ttl > 0)) { bonnes = false; details = 'champs ' + p.setup; break; }
  }
  v('chaque proposition : stop du bon côté, entrée limite du bon côté du prix, cibles dans l’ordre, RR ≥ minimum du style, confluences ≥ minimum, raison et invalidation présentes, frais ≤ plafond', bonnes, details);
  v('les quatre setups existent dans les noms affichés', ORDRE_SETUPS.length === 4 && ORDRE_SETUPS.every(k => SETUPS[k]));
  v('plus le style est actif, plus il propose', (st => toutes.filter(x => x.style === st).length)('actif') >= toutes.filter(x => x.style === 'prudent').length);
}

/* ── plafonds de fréquence et déterminisme ── */
{
  const s = series[0];
  for (const style of ['prudent', 'equilibre', 'actif']) {
    const props = parcourir(s, { actif: 'BTC', style, de: 3500, a: s.n - 20 }), parJour = new Map(); for (const p of props) parJour.set(Math.floor(s.t[p.i] / JOUR), (parJour.get(Math.floor(s.t[p.i] / JOUR)) || 0) + 1);
    v('style ' + style + ' : jamais plus de ' + STYLES[style].maxParJour + ' propositions par jour et par actif', [...parJour.values()].every(n => n <= STYLES[style].maxParJour), Math.max(...parJour.values()));
    // jamais plus de 2 positions simultanées
    let simult = true; for (const p of props) { const actives = props.filter(q => q !== p && q.i <= p.i && q.resultat && q.resultat.iSortie != null && q.resultat.iSortie > p.i).length; if (actives > 2) simult = false; } v('style ' + style + ' : deux positions simultanées au plus', simult);
    v('style ' + style + ' : pas de doublon d’un même setup dans les 8 bougies', props.every((p, k) => props.every((q, j) => j === k || q.setup !== p.setup || q.sens !== p.sens || Math.abs(q.i - p.i) >= 8)));
  }
  const a = parcourir(s, { actif: 'BTC', de: 3500, a: s.n - 20 }), b = parcourir(s, { actif: 'BTC', de: 3500, a: s.n - 20 });
  v('déterministe : deux exécutions donnent exactement les mêmes propositions et résultats', JSON.stringify(a.map(p => [p.id, p.entree, p.stop, p.resultat && p.resultat.R])) === JSON.stringify(b.map(p => [p.id, p.entree, p.stop, p.resultat && p.resultat.R])) && a.length > 3, a.length);
}

/* ── simulation prudente du suivi (barres écrites à la main) ── */
{
  const mk = lignes => { const n = lignes.length; const s = { n, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n).fill(1), vb: new Float64Array(n).fill(0.5) }; lignes.forEach((b, i) => { s.t[i] = i * 900e3; s.o[i] = b[0]; s.h[i] = b[1]; s.l[i] = b[2]; s.c[i] = b[3]; }); return s; };
  const sansCouts = { fraisPct: 0, makerPct: 0, spreadPct: 0, glissementPct: 0, filePct: 0.01 };
  const achat = { i: 0, sens: 1, entree: 100, stop: 98, cible1: 103, cible2: 106, ttl: 4, atr: 1 };
  // 1) le prix TOUCHE le niveau sans le traverser : pas de remplissage, expiration
  let r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 100.0, 100.6], [100.6, 101, 100.0, 100.4], [100.4, 101, 100.0, 100.2], [100.2, 101, 100.0, 100.2], [100.2, 101, 100.0, 100.2]]), achat, { couts: sansCouts });
  v('toucher le niveau sans le traverser ne remplit pas l’ordre (file d’attente) : expiration', r.statut === 'expiree', r.statut);
  // 2) rempli puis stop : −1 R
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 99.8], [99.8, 100, 97.5, 98]]), achat, { couts: sansCouts });
  v('rempli puis stop : −1 R exactement (sans frais)', r.statut === 'cloturee' && Math.abs(r.R + 1) < 1e-9 && r.motif === 'stop touché', JSON.stringify(r));
  // 3) rempli, cible 1 (50 %), stop remonté à l'entrée touché : +0,75 R
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 100.2], [100.2, 103.5, 100.1, 103], [103, 103, 99.9, 100]]), achat, { couts: sansCouts });
  v('cible 1 en partie puis stop à l’entrée : +0,75 R (0,5 × 1,5 R + 0,5 × 0)', r.statut === 'cloturee' && Math.abs(r.R - 0.75) < 1e-9, JSON.stringify(r));
  // 4) rempli, cible 1 puis cible 2 : 0,5×1,5 + 0,5×3 = 2,25 R
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 100.2], [100.2, 103.5, 100.1, 103], [103, 106.5, 102.5, 106]]), achat, { couts: sansCouts });
  v('cible 1 puis cible 2 : +2,25 R', r.statut === 'cloturee' && Math.abs(r.R - 2.25) < 1e-9, JSON.stringify(r));
  // 5) stop ET cible dans la même bougie : le stop gagne
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 100.2], [100.2, 104, 97.5, 100]]), achat, { couts: sansCouts });
  v('stop et cible dans la même bougie : le stop gagne', r.statut === 'cloturee' && Math.abs(r.R + 1) < 1e-9, JSON.stringify(r));
  // 6) la cible n'est jamais comptée dans la bougie du remplissage
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 104, 99.5, 103.5], [103.5, 103.6, 103.4, 103.5]]), achat, { couts: sansCouts, maxBarres: 2 });
  v('une cible atteinte dans la bougie du remplissage n’est pas comptée', !(r.statut === 'cloturee' && r.R > 1), JSON.stringify(r));
  // 7) cible atteinte AVANT le remplissage : annulée
  r = simuler(mk([[101, 104, 100.8, 103.5], [103.5, 104, 99.5, 100]]), achat, { couts: sansCouts });
  v('cible atteinte avant d’être rempli : annulée', r.statut === 'annulee', r.statut);
  // 8) vente symétrique
  const vente = { i: 0, sens: -1, entree: 100, stop: 102, cible1: 97, cible2: 94, ttl: 4, atr: 1 };
  r = simuler(mk([[99, 99.5, 98.8, 99.2], [99.2, 100.5, 99.1, 100.2], [100.2, 100.3, 96.5, 97], [97, 97.2, 93.5, 94]]), vente, { couts: sansCouts });
  v('vente : cible 1 puis cible 2 : +2,25 R', r.statut === 'cloturee' && Math.abs(r.R - 2.25) < 1e-9, JSON.stringify(r));
  // 9) frais : toujours un coût positif, plus lourd que sans frais, et converti en R
  const barres = [[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 100.2], [100.2, 101, 97.5, 98]];
  const avec = simuler(mk(barres), achat, { couts: COUTS_TRADER }), sans = simuler(mk(barres), achat, { couts: sansCouts });
  v('les frais et le glissement coûtent du R (perte plus lourde que −1 R)', avec.R < sans.R && avec.couts > 0, avec.R);
  // 10) en attente / ouverte à la fin des données
  r = simuler(mk([[101, 101, 100.5, 100.8]]), achat, { couts: sansCouts }); v('rien d’autre après le signal : en attente', r.statut === 'en_attente');
  r = simuler(mk([[101, 101, 100.5, 100.8], [100.8, 101, 99.5, 100.2], [100.2, 101, 99.9, 100.5]]), achat, { couts: sansCouts }); v('rempli sans cible ni stop : ouverte', r.statut === 'ouverte', r.statut);
}


/* ── données RÉELLES de l'agent (si présentes) : fuite du futur et mouvement du 29-30 octobre ── */
{
  let reel = null; try { const m = await import('../../agent-pc/trader-donnees.mjs'); reel = await m.chargerSerie('BTC'); } catch (e) { /* pas de données sur cette machine */ }
  if (reel && reel.n > 40000) {
    const fin = reel.n - 3000, indices = []; for (let i = fin - 30000; i < fin; i += 997) indices.push(i);
    const r = testerFuite(reel, indices, { tranche });
    v('aucune fuite du futur sur les VRAIES bougies BTC (' + indices.length + ' bougies testées)', r.ok, JSON.stringify(r.ecarts.slice(0, 1)).slice(0, 300));
    const P = preparer(reel), i0 = reel.t.findIndex(t => t >= Date.parse('2026-10-29T00:00Z')); 
    if (i0 > 0 && reel.t[reel.n - 1] >= Date.parse('2026-10-30T03:00Z')) {
      const props = parcourir(reel, { actif: 'BTC', style: 'equilibre', de: i0, a: reel.n - 2, P });
      v('29-30 octobre (BTC) : le moteur a proposé au moins une position, dont une vente', props.length >= 1 && props.some(p => p.sens < 0), props.length);
    }
  } else console.log('(données réelles absentes : tests réels ignorés)');
}

/* ── critères de validation : strictement intacts (aucun fichier de critères modifié) ── */
{
  let diff = ''; try { diff = execFileSync('git', ['diff', '--name-only', 'avant-maj-v12', '--', 'strategies/criteres-v3.json', 'strategies/CRITERES.md', 'strategies/criteres-v4.json', 'strategies/CRITERES_V4.md', 'strategies/criteres-v3.js', 'strategies/criteres-v4.js'], { encoding: 'utf8' }).trim(); } catch (e) { diff = 'git indisponible : ' + e.message; }
  v('criteres-v3.json, CRITERES.md, criteres-v4.json, CRITERES_V4.md et leurs modules : inchangés depuis le tag avant-maj-v12', diff === '', diff);
}
console.log('trader-moteur : ' + ok + ' ok, ' + ko + ' ko');
process.exit(ko ? 1 : 0);
