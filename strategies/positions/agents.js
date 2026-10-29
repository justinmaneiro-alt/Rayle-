import { FAMILLES } from '../../planetes/mars/pc/agent-btc/hypotheses.js';
import { elementsVue, vue, confluence, resumeConfluence, absorption, SEUIL_DIAMANT } from './zones.js';
import '../familles-v3.js';

/* ═════════════ LES TROIS AGENTS DE POSITIONS DE KEPLER (V7, phase 3 ; module pur, testé : galaxie/tests/positions-agents-test.mjs) ═════════════
   « Rebond », « Continuation », « Extrêmes » : chacun propose, à la clôture de chaque bougie M15 ou H1, des positions où l'on ENTRE EN BAS (achat) ou EN HAUT (vente) avec une raison, un stop DERRIÈRE la zone
   de défense, une cible sur un AIMANT (extrême de la veille, bord de la zone de valeur, POC, dernier sommet / creux, piscine de liquidité opposée) et un rapport gain / risque d'au moins 1,5.
   Chaque agent est aussi une FAMILLE du moteur de backtest (signaux CAUSAUX, entrée en ordre limite avec le modèle de remplissage honnête de la V6) : la même logique sert à proposer et à mesurer. Les
   statistiques de chaque TYPE de setup (« rebond:balayage »…) viennent de ce backtest ; sans elles une position reste une idée.
   Hypothèses économiques (écrites avant tout test) :
   · REBOND — qui perd : ceux dont les stops sont posés sous un creux évident (ou au-dessus d'un sommet) ; qui gagne : celui qui entre après le balayage de ces stops, quand le prix reprend le niveau ; risque : la vraie cassure.
   · CONTINUATION — qui perd : ceux qui vendent chaque repli d'une tendance installée ; qui gagne : celui qui achète le repli sur la valeur (VWAP, POC, moyenne) avec un stop sous le repli ; risque : le retournement de tendance.
   · EXTRÊMES — qui perd : ceux qui poursuivent une cascade (liquidations forcées) ou un bord de range trop tard ; qui gagne : celui qui entre APRÈS l'épuisement (jamais pendant), visant le milieu / le retracement ; risque : la cascade qui reprend.
   Aucun ordre n'est exécuté : ce sont des propositions et des simulations. */
const DEPART = 800, RR_MIN = 1.5, PLAFOND_COUT_R = 0.08;
const N = n => new Float64Array(n).fill(NaN);
export const AGENTS = Object.freeze({
  rebond: { id: 'rebond', nom: 'Rebond', style: 'retournement sur balayage de liquidité ou absorption' },
  continuation: { id: 'continuation', nom: 'Continuation', style: 'repli dans une tendance confirmée' },
  extremes: { id: 'extremes', nom: 'Extrêmes', style: 'fin de range ou après une cascade de liquidations' }
});
export const TYPES_SETUP = Object.freeze({
  'rebond:balayage': 'Rebond après balayage de liquidité', 'rebond:absorption': 'Rebond sur absorption',
  'continuation:repli_vwap': 'Repli sur le VWAP', 'continuation:repli_poc': 'Repli sur le POC', 'continuation:repli_moyenne': 'Repli sur la moyenne 20',
  'extremes:cascade': 'Retournement après cascade', 'extremes:fin_range': 'Retournement en fin de range'
});
export const idFamille = (agent, tf) => agent + '_' + tf.toLowerCase();
const arrondi = (x, n = 1) => Math.round(x * 10 ** n) / 10 ** n;

export function base(ctx, tf, p) {
  const n = ctx.n, o = { riche: true, sens: new Int8Array(n), stop: new Float64Array(n), R: 2, limite: N(n), cible: N(n), ttl: tf === 'H1' ? 24 : 12, meta: new Map(), atr: ctx.atr15,
    options: { stopMinAuto: true, coutPlafondR: PLAFOND_COUT_R, rrMin: p.rrMin || RR_MIN, maxBarres: tf === 'H1' ? 192 : 96, sortie: { type: 'fixe' }, ttlBarres: tf === 'H1' ? 24 : 12 } };
  return o;
}
const fmt = x => (x == null ? '—' : x.toLocaleString('fr-FR', { maximumFractionDigits: x >= 1000 ? 0 : x >= 10 ? 2 : 4 }));

/* Aimants dans le sens de la position, du plus proche au plus lointain, au-delà de l'entrée. */
export function aimants(ctx, tf, i, k, entree, d) {
  const E = elementsVue(ctx, tf), s = E.V.s, L = [];
  const add = (prix, nom) => { if (Number.isFinite(prix) && d * (prix - entree) > 0) L.push({ prix, nom }); };
  add(d > 0 ? E.pdh[k] : E.pdl[k], d > 0 ? 'plus haut de la veille' : 'plus bas de la veille');
  add(d > 0 ? ctx.h1.vah[i] : ctx.h1.val[i], d > 0 ? 'haut de la zone de valeur' : 'bas de la zone de valeur');
  add(ctx.h1.poc[i], 'point de contrôle (POC)'); add(E.vwap[k], 'VWAP du jour');
  let ext = d > 0 ? -Infinity : Infinity; for (let j = Math.max(0, k - 48); j <= k; j++) ext = d > 0 ? Math.max(ext, s.h[j]) : Math.min(ext, s.l[j]);
  add(ext, d > 0 ? 'dernier sommet' : 'dernier creux');
  add(d > 0 ? E.bal.poolHaut[k] : E.bal.poolBas[k], 'piscine de liquidité opposée');
  L.sort((a, b) => d * (a.prix - b.prix)); return L;
}
/* Choisit la cible 1 (la plus proche qui offre au moins `rrMin`) et la cible 2 (la suivante). Rend aussi le meilleur rapport atteignable (pour dire pourquoi une position n'est pas proposée). */
export function choisirCibles(liste, entree, stop, d, rrMin) {
  const risque = d * (entree - stop); if (!(risque > 0)) return { ok: false, meilleurRR: null };
  let meilleurRR = null; const rr = c => d * (c.prix - entree) / risque;
  for (const c of liste) { const r = rr(c); if (meilleurRR == null || r > meilleurRR) meilleurRR = r; }
  const idx = liste.findIndex(c => rr(c) >= rrMin);
  if (idx < 0) return { ok: false, meilleurRR, raison: 'rr' };
  return { ok: true, cible: liste[idx], cible2: liste[idx + 1] || null, rr: rr(liste[idx]), rr2: liste[idx + 1] ? rr(liste[idx + 1]) : null, meilleurRR };
}

/* Finalise une proposition à la barre M15 i : confluence minimale, cibles, rapport gain / risque, métadonnées. Rend true si elle est émise ; sinon note l'hypothèse la meilleure (ctx.cache 'pos:hyp:<tf>'). */
function emettre(ctx, tf, o, i, k, c) {
  const { d, niveau, stop, limite, declencheur, type, agent, raison, confMin, regime } = c, E = elementsVue(ctx, tf), at = E.V.atr[k];
  const liste = c.cibleForcee ? [...c.cibleForcee, ...aimants(ctx, tf, i, k, limite, d)].filter(x => d * (x.prix - limite) > 0).sort((x, y) => d * (x.prix - y.prix)) : aimants(ctx, tf, i, k, limite, d);
  const conf = confluence(ctx, tf, i, k, niveau, d, declencheur), ch = choisirCibles(liste, limite, stop, d, o.options.rrMin);
  const hyp = r => { const h = ctx.cache.get('pos:hyp:' + tf) || []; h.push({ i, type, agent, d, niveau, limite, stop, confluence: conf, meilleurRR: ch.meilleurRR, raison: r }); if (h.length > 600) h.splice(0, h.length - 600); ctx.cache.set('pos:hyp:' + tf, h); };
  if (conf.n < confMin) { hyp('confluence'); return false; }
  if (!ch.ok) { hyp('rr'); return false; }
  o.sens[i] = d; o.stop[i] = stop; o.limite[i] = limite; o.cible[i] = ch.cible.prix;
  const marge = 0.15 * (at > 0 ? at : 0);
  o.meta.set(i, { agent, tf, type, sens: d, niveau, zone: [Math.min(niveau, limite) - marge, Math.max(niveau, limite) + marge], limite, stop, cible: ch.cible.prix, cibleNom: ch.cible.nom, cible2: ch.cible2 ? ch.cible2.prix : null, cible2Nom: ch.cible2 ? ch.cible2.nom : null,
    rr: ch.rr, rr2: ch.rr2, ttlBarres: o.ttl, confluence: conf, raison: raison(conf), invalidation: (d > 0 ? 'clôture ' + tf + ' sous ' : 'clôture ' + tf + ' au-dessus de ') + fmt(stop) + ' : la zone n’a pas tenu, la position est annulée', regime: regime || null, t: ctx.m15.t[i], atrVue: at });
  return true;
}
const extremeSur = (s, k, n, d) => { let m = d > 0 ? Infinity : -Infinity; for (let j = k - n; j < k; j++) m = d > 0 ? Math.min(m, s.l[j]) : Math.max(m, s.h[j]); return m; };

// ── 1. REBOND ──
function declencheurRebond(ctx, tf, i, k, p) {
  const E = elementsVue(ctx, tf), s = E.V.s, at = E.V.atr[k]; if (!(at > 0) || k < p.N + 2) return null;
  const out = [];
  for (const d of [1, -1]) {
    let niveau = null, extreme = null, decl = null, type = null;
    if (E.bal.sens[k] === d) { niveau = E.bal.niveau[k]; extreme = d > 0 ? s.l[k] : s.h[k]; decl = { balayage: { type: E.bal.type[k], touches: E.bal.touches[k] } }; type = 'rebond:balayage'; }
    else {
      const m = extremeSur(s, k, p.N, d);
      if (d > 0 ? (s.l[k] < m && s.c[k] > m) : (s.h[k] > m && s.c[k] < m)) { niveau = m; extreme = d > 0 ? s.l[k] : s.h[k]; decl = { balayage: { type: 'plus_bas_n', touches: 1 } }; type = 'rebond:balayage'; }
      else if (absorption(E, s, k, d, at) && (d > 0 ? s.l[k] <= extremeSur(s, k, Math.min(p.N, 24), d) : s.h[k] >= extremeSur(s, k, Math.min(p.N, 24), d))) { niveau = d > 0 ? s.l[k] : s.h[k]; extreme = niveau; decl = { absorption: true }; type = 'rebond:absorption'; }
    }
    if (niveau == null || !(d * (s.c[k] - niveau) > 0 || type === 'rebond:absorption')) continue;
    if (p.filtre && ctx.h4.phase[i] === (d > 0 ? 2 : 1)) continue;                                  // option : pas contre la tendance H4 confirmée
    const c = s.c[k], part = p.profondeur == null ? 0.5 : p.profondeur, mi = d > 0 ? Math.max(niveau, c - part * (c - niveau)) : Math.min(niveau, c + part * (niveau - c)), limite = d > 0 ? Math.max(mi, niveau + 0.1 * at) : Math.min(mi, niveau - 0.1 * at);
    out.push({ d, niveau, stop: extreme - d * 0.2 * at, limite: type === 'rebond:absorption' ? niveau + d * 0.15 * at : limite, declencheur: decl, type, agent: 'rebond', confMin: p.conf,
      raison: conf => (d > 0 ? 'Achat' : 'Vente') + ' après ' + (type === 'rebond:balayage' ? 'le balayage de ' + fmt(niveau) + ' puis la reprise du niveau' : 'une absorption à ' + fmt(niveau) + ' (gros volume sans progression)') + ' ; ' + resumeConfluence(conf) });
  }
  return out;
}
const REBOND = {
  id: 'rebond', nom: 'Rebond sur balayage ou absorption',
  description: 'Une barre balaie un plus bas (ou haut) — égaux, veille, semaine, ou le plus bas des N dernières barres — puis referme de l’autre côté du niveau, ou une barre montre une absorption (gros volume, peu de progression, mèche du bon côté). On entre en ordre limite entre le niveau et la clôture, stop derrière l’extrême du balayage, cible sur l’aimant le plus proche offrant au moins 1,5 fois le risque. Une position n’est proposée que si au moins 2 éléments de confluence concordent.',
  hypothese: 'Qui perd : ceux dont les stops sont posés sous un creux évident (ou au-dessus d’un sommet) et ceux qui poursuivent la cassure. Qui gagne : celui qui entre après le balayage, quand les stops ont été pris et que le prix reprend le niveau. Risque : la vraie cassure.',
  grille: () => ({ N: [24, 48], conf: [2, 3], filtre: [0, 1], profondeur: [0.5, 0.8] }), defauts: tf => ({ N: tf === 'H1' ? 24 : 48, conf: 2, filtre: 0, profondeur: 0.5 })
};

// ── 2. CONTINUATION ──
function declencheurContinuation(ctx, tf, i, k, p) {
  const E = elementsVue(ctx, tf), s = E.V.s, at = E.V.atr[k]; if (!(at > 0) || k < 30) return null;
  const out = [], ph1 = ctx.h1.phase[i], ph4 = ctx.h4.phase[i];
  for (const d of [1, -1]) {
    if (!(ph1 === (d > 0 ? 1 : 2)) || ph4 === (d > 0 ? 2 : 1)) continue;                                  // tendance H1 confirmée, H4 pas contraire
    let ext = d > 0 ? -Infinity : Infinity, creux = d > 0 ? Infinity : -Infinity;
    for (let j = k - 12; j <= k; j++) ext = d > 0 ? Math.max(ext, s.h[j]) : Math.min(ext, s.l[j]);
    for (let j = k - 2; j <= k; j++) creux = d > 0 ? Math.min(creux, s.l[j]) : Math.max(creux, s.h[j]);
    if (!(d * (ext - creux) >= 0.8 * at)) continue;                                                          // un vrai repli d'au moins 0,8 ATR
    const rejet = d > 0 ? s.c[k] > s.o[k] : s.c[k] < s.o[k], zones = [['continuation:repli_vwap', E.vwap[k]], ['continuation:repli_poc', ctx.h1.poc[i]], ['continuation:repli_moyenne', E.ema20[k]]];
    let meilleur = null; for (const [type, L] of zones) { if (!Number.isFinite(L)) continue; const dist = Math.abs((d > 0 ? s.l[k] : s.h[k]) - L); if (dist <= 0.4 * at && d * (s.c[k] - L) > 0 && (!meilleur || dist < meilleur.dist)) meilleur = { type, L, dist }; }
    if (!meilleur || !rejet) continue;
    const limite = meilleur.L + d * 0.25 * at;
    out.push({ d, niveau: meilleur.L, stop: creux - d * 0.2 * at, limite, declencheur: {}, type: meilleur.type, agent: 'continuation', confMin: p.conf, regime: d > 0 ? 'tendance haussière' : 'tendance baissière',
      raison: conf => (d > 0 ? 'Achat' : 'Vente') + ' du repli dans une tendance ' + (d > 0 ? 'haussière' : 'baissière') + ' confirmée en H1, sur ' + (meilleur.type === 'continuation:repli_vwap' ? 'le VWAP du jour' : meilleur.type === 'continuation:repli_poc' ? 'le POC' : 'la moyenne exponentielle 20') + ' (' + fmt(meilleur.L) + ') ; ' + resumeConfluence(conf) });
  }
  return out;
}
const CONTINUATION = {
  id: 'continuation', nom: 'Continuation sur repli',
  description: 'Quand la tendance H1 est confirmée (H4 pas contraire), on attend un repli d’au moins 0,8 ATR qui touche la valeur (VWAP du jour, POC ou moyenne 20) puis referme dans le sens de la tendance. Entrée en ordre limite juste au-dessus de la zone, stop sous le repli, cible sur l’aimant suivant (au moins 1,5 fois le risque).',
  hypothese: 'Qui perd : ceux qui vendent chaque repli d’une tendance installée. Qui gagne : celui qui achète le repli sur la valeur avec un stop sous le repli. Risque : le retournement de tendance.',
  grille: () => ({ conf: [2, 3] }), defauts: () => ({ conf: 2 })
};

// ── 3. EXTRÊMES ──
function declencheurExtremes(ctx, tf, i, k, p) {
  const E = elementsVue(ctx, tf), s = E.V.s, at = E.V.atr[k]; if (!(at > 0) || k < 80) return null;
  const out = [];
  for (const d of [1, -1]) {
    // a) cascade : la barre k-1 est une capitulation (étendue ≥ 2,5 ATR, volume ≥ 2,5 × la moyenne, clôture dans le tiers extrême), la barre k NE prolonge PAS l'extrême et referme en sens inverse
    const j = k - 1, e = s.h[j] - s.l[j], atj = E.V.atr[j];
    if (atj > 0 && e >= 2.5 * atj && E.volMoy[j] > 0 && s.v[j] >= 2.5 * E.volMoy[j]) {
      const fin = d > 0 ? (s.c[j] - s.l[j]) / e <= 0.3 : (s.h[j] - s.c[j]) / e <= 0.3, pasDeProlongement = d > 0 ? s.l[k] > s.l[j] : s.h[k] < s.h[j], retour = d > 0 ? s.c[k] > s.o[k] && s.c[k] > s.c[j] : s.c[k] < s.o[k] && s.c[k] < s.c[j];
      if (fin && pasDeProlongement && retour) {
        const extreme = d > 0 ? s.l[j] : s.h[j], limite = extreme + d * 0.15 * e;
        out.push({ d, niveau: extreme, stop: extreme - d * 0.2 * at, limite, declencheur: { absorption: absorption(E, s, j, d, atj) || s.v[j] >= 3 * E.volMoy[j] }, type: 'extremes:cascade', agent: 'extremes', confMin: p.conf, regime: 'cascade',
          cibleForcee: [{ prix: extreme + d * 0.62 * e, nom: 'retracement de 62 % de la cascade' }, { prix: d > 0 ? s.h[j] : s.l[j], nom: 'départ de la cascade' }],
          raison: conf => (d > 0 ? 'Achat' : 'Vente') + ' APRÈS une cascade ' + (d > 0 ? 'baissière' : 'haussière') + ' (barre de ' + arrondi(e / atj, 1).toString().replace('.', ',') + ' ATR, volume ' + arrondi(s.v[j] / E.volMoy[j], 1).toString().replace('.', ',') + ' × la normale) : la barre suivante ne prolonge pas l’extrême et referme en sens inverse ; ' + resumeConfluence(conf) });
        continue;
      }
    }
    // b) fin de range : H1 en range, la barre touche le bord du range de 72 barres et referme loin de lui
    if (ctx.h1.phase[i] === 3) {
      let bord = d > 0 ? Infinity : -Infinity, oppose = d > 0 ? -Infinity : Infinity; for (let q = k - 72; q < k; q++) { bord = d > 0 ? Math.min(bord, s.l[q]) : Math.max(bord, s.h[q]); oppose = d > 0 ? Math.max(oppose, s.h[q]) : Math.min(oppose, s.l[q]); }
      const touche = d > 0 ? s.l[k] <= bord + 0.1 * at : s.h[k] >= bord - 0.1 * at, e = s.h[k] - s.l[k], referme = e > 0 && (d > 0 ? (s.c[k] - s.l[k]) / e >= 0.6 : (s.h[k] - s.c[k]) / e >= 0.6), largeur = d * (oppose - bord) >= 3 * at;
      if (touche && referme && largeur) {
        const extreme = d > 0 ? s.l[k] : s.h[k], milieu = (bord + oppose) / 2, limite = bord + d * 0.2 * at;
        out.push({ d, niveau: bord, stop: extreme - d * 0.2 * at, limite, declencheur: {}, type: 'extremes:fin_range', agent: 'extremes', confMin: p.conf, regime: 'range',
          cibleForcee: [{ prix: milieu, nom: 'milieu du range' }, { prix: oppose - d * 0.1 * at, nom: 'bord opposé du range' }],
          raison: conf => (d > 0 ? 'Achat' : 'Vente') + ' en bas/haut de range H1 (bord à ' + fmt(bord) + ', range de ' + arrondi(d * (oppose - bord) / at, 1).toString().replace('.', ',') + ' ATR), la barre referme loin du bord ; ' + resumeConfluence(conf) });
      }
    }
  }
  return out;
}
const EXTREMES = {
  id: 'extremes', nom: 'Extrêmes : fin de range et après cascade',
  description: 'Deux déclencheurs : (a) une cascade (barre de capitulation, ≥ 2,5 ATR et ≥ 2,5 fois le volume normal) suivie d’une barre qui NE prolonge PAS l’extrême et referme en sens inverse — jamais pendant la cascade ; (b) en range H1, une barre qui touche le bord du range de 72 barres et referme loin de lui. Cible : retracement de 62 % de la cascade, ou milieu du range ; stop derrière l’extrême.',
  hypothese: 'Qui perd : ceux qui poursuivent une cascade de liquidations forcées ou un bord de range trop tard. Qui gagne : celui qui entre après l’épuisement, visant le retracement ou le milieu. Risque : la cascade qui reprend (d’où l’attente de la barre de confirmation).',
  grille: () => ({ conf: [1, 2] }), defauts: () => ({ conf: 1 })
};

const DECLENCHEURS = { rebond: declencheurRebond, continuation: declencheurContinuation, extremes: declencheurExtremes };
const DEFS = { rebond: REBOND, continuation: CONTINUATION, extremes: EXTREMES };

/* Construit la famille de backtest d'un agent sur une unité de temps. */
function fabriquerFamille(agent, tf) {
  const def = DEFS[agent], decl = DECLENCHEURS[agent];
  return {
    id: idFamille(agent, tf), nom: def.nom + ' (' + tf + ')', unite: tf, riche: true, agent, tf, description: def.description, hypothese: def.hypothese,
    grille: () => def.grille(), defauts: () => def.defauts(tf),
    signaux(ctx, p) {
      const n = ctx.n, o = base(ctx, tf, p), V = vue(ctx, tf);
      for (let i = DEPART; i < n; i++) {
        if (!V.nouvelle(i)) continue; const k = V.k(i); if (!(k >= 0)) continue;
        const lst = decl(ctx, tf, i, k, p); if (!lst || !lst.length) continue;
        // une seule position par barre : on garde le meilleur score de confluence (le plus de preuves d'abord)
        let meilleur = null, sc = -1;
        for (const c of lst) { const sk = confluence(ctx, tf, i, k, c.niveau, c.d, c.declencheur).score; if (sk > sc) { sc = sk; meilleur = c; } }
        emettre(ctx, tf, o, i, k, meilleur);
      }
      return o;
    }
  };
}
export const FAMILLES_V7 = {};
for (const a of Object.keys(AGENTS)) for (const tf of ['M15', 'H1']) FAMILLES_V7[idFamille(a, tf)] = fabriquerFamille(a, tf);
Object.assign(FAMILLES, FAMILLES_V7);
export const ORDRE_V7 = Object.freeze(Object.keys(FAMILLES_V7));
export const NOMS_V7 = Object.freeze(Object.fromEntries(Object.entries(FAMILLES_V7).map(([k, f]) => [k, f.nom])));
export const parametresDefaut = id => FAMILLES_V7[id].defauts();
export { RR_MIN, PLAFOND_COUT_R, SEUIL_DIAMANT, fmt };
