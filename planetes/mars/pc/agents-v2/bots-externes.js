import { sma, atr } from '../agent-btc/indic.js';
import { emaM15 } from '../agent-btc/contexte.js';
import { FAMILLES } from '../agent-btc/hypotheses.js';
import { rsi } from './familles-v2.js';

/* ═════════════ BOTS OPEN SOURCE ADAPTÉS AU MOTEUR DE RAYLÉ (V2, phase 7 ; module pur, testé : planetes/mars/tests/v2-bots-test.mjs) ═════════════
   Cinq stratégies SIMPLES et célèbres, tirées de projets open source de trading algorithmique, RÉÉCRITES PROPREMENT pour le moteur de backtest de Raylé : aucune ligne de code de ces projets n'est copiée
   (Freqtrade et Backtrader sont sous licence GPL-3.0 : copier leur code obligerait ce dépôt public à être publié sous GPL ; ici seules les IDÉES de trading sont reprises — une idée n'est pas protégée —,
   avec la même mention d'origine qu'une citation). Chaque bot est transformé pour passer par les MÊMES règles que tout le reste : signal à la clôture, exécution à l'ouverture suivante, frais, spread,
   glissement, stop et objectif en R (les originaux investissent « tout le solde » ou n'ont qu'un stop en pourcentage : jamais ici), même walk-forward, mêmes critères figés.
   PAPER TRADING SEULEMENT : aucune connexion à un compte, aucune clé de courtier, aucun ordre. Les licences et sources sont vérifiées (API GitHub, 2026-10-27) et listées dans docs/BOTS.md.
   Format : { id, nom, origine, description, aide, famille: { grille, signaux } } ; la famille est inscrite dans le registre des hypothèses (sans toucher à la recherche automatique). */
const DEPART = 400;
const nan = n => { const a = new Float64Array(n); a.fill(NaN); return a; };
const fabrique = n => ({ sens: new Int8Array(n), stop: new Float64Array(n) });
const minSur = (x, i, k) => { let m = Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] < m) m = x[j]; return m; };
const maxSur = (x, i, k) => { let m = -Infinity; for (let j = i - k + 1; j <= i; j++) if (x[j] > m) m = x[j]; return m; };
const surM15 = (src, idx, n) => { const out = nan(n); for (let i = 0; i < n; i++) { const k = idx[i]; if (k >= 0) out[i] = src[k]; } return out; };

/* H1 : une nouvelle bougie H1 vient de se fermer à la bougie M15 i quand l'index H1 connu change. */
const nouvelleH1 = (ctx, i) => ctx.h1.idx[i] >= 0 && ctx.h1.idx[i] !== ctx.h1.idx[i - 1];

export const ORIGINES = {
  jesse: { projet: 'Jesse', depot: 'https://github.com/jesse-ai/example-strategies', fichier: 'SMACrossover', licence: 'MIT', note: 'Stratégie d’exemple « croisement de moyennes mobiles simples » (golden cross / death cross), tout le solde investi dans l’original.' },
  freqtrade_001: { projet: 'Freqtrade-strategies', depot: 'https://github.com/freqtrade/freqtrade-strategies', fichier: 'Strategy001', licence: 'GPL-3.0', note: 'Entrée quand l’EMA 20 croise l’EMA 50 par le haut avec une clôture au-dessus de l’EMA 20 ; stop de 10 % dans l’original. IDÉE reprise, code non copié.' },
  freqtrade_sample: { projet: 'Freqtrade', depot: 'https://github.com/freqtrade/freqtrade', fichier: 'templates/sample_strategy.py', licence: 'GPL-3.0', note: 'Stratégie d’exemple : entrée quand le RSI repasse au-dessus de 30 (survente) avec un indicateur en hausse ; sortie quand le RSI dépasse 70. IDÉE reprise, code non copié.' },
  turtle: { projet: 'Canal de Donchian (Turtle Traders)', depot: 'https://en.wikipedia.org/wiki/Donchian_channel', fichier: 'règles publiques', licence: 'idée publique (pas de code)', note: 'Cassure du plus haut / plus bas des N dernières périodes, règle historique des Turtle Traders.' },
  bollinger: { projet: 'Bandes de Bollinger (retour à la moyenne)', depot: 'https://github.com/je-suis-tm/quant-trading', fichier: 'Bollinger Bands Pattern Recognition', licence: 'Apache-2.0 (dépôt) ; indicateur public de John Bollinger', note: 'Retour à la moyenne : le prix qui ressort d’une bande de Bollinger revient vers la moyenne. IDÉE reprise.' }
};

export const BOTS = {
  bot_croisement_sma: {
    id: 'bot_croisement_sma', nom: 'Croisement de moyennes mobiles simples (golden cross / death cross)', origine: ORIGINES.jesse, categorie: 'moyennes mobiles',
    description: 'Achat quand la moyenne simple rapide (en H1) croise AU-DESSUS de la lente (golden cross), vente quand elle croise en dessous (death cross). Stop à quelques ATR H1, objectif en R. L’original investit tout le solde : jamais ici (risque fixe en R).',
    aide: { rapide: ['Moyenne rapide (H1)', 'Nombre de bougies H1 de la moyenne rapide : plus petit = croisements plus fréquents et plus de faux signaux.'], lente: ['Moyenne lente (H1)', 'La moyenne de fond (100 ou 200 bougies H1).'], stopATR: ['Stop en ATR H1', 'Distance du stop en multiples de l’ATR H1.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques.'] },
    famille: {
      grille: () => ({ rapide: [20, 50], lente: [100, 200], stopATR: [2, 3], R: [3, 4.5] }),
      signaux(ctx, p) {
        const n = ctx.n, o = fabrique(n), c = ctx.h1.serie.c, sf = surMemo(ctx, 'sma' + p.rapide, () => sma(c, p.rapide)), sl = surMemo(ctx, 'sma' + p.lente, () => sma(c, p.lente)), at = ctx.h1.atr; o.R = p.R;
        for (let i = DEPART; i < n; i++) {
          if (!nouvelleH1(ctx, i)) continue; const k = ctx.h1.idx[i]; if (k < 1 || !(sf[k] > 0) || !(sl[k] > 0) || !(sf[k - 1] > 0) || !(sl[k - 1] > 0) || !(at[i] > 0)) continue;
          if (sf[k] > sl[k] && sf[k - 1] <= sl[k - 1]) { o.sens[i] = 1; o.stop[i] = ctx.m15.c[i] - p.stopATR * at[i]; }
          else if (sf[k] < sl[k] && sf[k - 1] >= sl[k - 1]) { o.sens[i] = -1; o.stop[i] = ctx.m15.c[i] + p.stopATR * at[i]; }
        }
        return o;
      }
    }
  },
  bot_ema_20_50: {
    id: 'bot_ema_20_50', nom: 'Croisement EMA 20 / EMA 50 (M15) avec clôture du bon côté', origine: ORIGINES.freqtrade_001, categorie: 'tendance',
    description: 'Achat quand l’EMA rapide croise l’EMA lente par le haut ET que la bougie clôture au-dessus de l’EMA rapide ; vente en miroir. Stop sous le creux récent (ou à un multiple d’ATR), objectif en R. L’original sort sur un autre croisement ou à 10 % de stop : remplacé par stop et objectif en R.',
    aide: { rapide: ['EMA rapide', 'Nombre de bougies M15 de l’EMA rapide.'], lente: ['EMA lente', 'Nombre de bougies M15 de l’EMA lente.'], stopATR: ['Stop en ATR', 'Distance minimale du stop en ATR M15.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques.'] },
    famille: {
      grille: () => ({ rapide: [20, 30], lente: [50, 100], stopATR: [1.5, 2.5], R: [3, 4.5] }),
      signaux(ctx, p) {
        const { m15 } = ctx, n = ctx.n, o = fabrique(n), ef = emaM15(ctx, p.rapide), es = emaM15(ctx, p.lente), a = ctx.atr15; o.R = p.R;
        for (let i = DEPART; i < n; i++) {
          if (!(a[i] > 0) || !(ef[i] > 0) || !(es[i] > 0)) continue;
          if (ef[i] > es[i] && ef[i - 1] <= es[i - 1] && m15.c[i] > ef[i]) { o.sens[i] = 1; o.stop[i] = Math.min(minSur(m15.l, i, 12), m15.c[i] - p.stopATR * a[i]); }
          else if (ef[i] < es[i] && ef[i - 1] >= es[i - 1] && m15.c[i] < ef[i]) { o.sens[i] = -1; o.stop[i] = Math.max(maxSur(m15.h, i, 12), m15.c[i] + p.stopATR * a[i]); }
        }
        return o;
      }
    }
  },
  bot_donchian: {
    id: 'bot_donchian', nom: 'Cassure de canal de Donchian (cassure de range)', origine: ORIGINES.turtle, categorie: 'cassure de range',
    description: 'Achat quand la clôture dépasse le plus haut des N dernières bougies (cassure vers le haut), vente quand elle passe sous le plus bas (cassure vers le bas). Stop à quelques ATR, objectif en R. Règle historique des Turtle Traders, sans filtre de volume.',
    aide: { N: ['Longueur du canal', 'Nombre de bougies M15 : 96 = 1 jour, 192 = 2 jours, 288 = 3 jours. Plus long = moins de cassures, plus significatives.'], stopATR: ['Stop en ATR', 'Distance du stop en ATR M15.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques (tu vises 4 à 6 R).'] },
    famille: {
      grille: () => ({ N: [96, 192, 288], stopATR: [2, 3], R: [3, 4.5, 6] }),
      signaux(ctx, p) {
        const { m15 } = ctx, n = ctx.n, o = fabrique(n), a = ctx.atr15; o.R = p.R;
        for (let i = Math.max(DEPART, p.N + 1); i < n; i++) {
          if (!(a[i] > 0)) continue; let hh = -Infinity, ll = Infinity; for (let j = i - p.N; j < i; j++) { if (m15.h[j] > hh) hh = m15.h[j]; if (m15.l[j] < ll) ll = m15.l[j]; }
          if (m15.c[i] > hh && m15.c[i - 1] <= hh) { o.sens[i] = 1; o.stop[i] = m15.c[i] - p.stopATR * a[i]; }
          else if (m15.c[i] < ll && m15.c[i - 1] >= ll) { o.sens[i] = -1; o.stop[i] = m15.c[i] + p.stopATR * a[i]; }
        }
        return o;
      }
    }
  },
  bot_rsi_rebond: {
    id: 'bot_rsi_rebond', nom: 'RSI : rebond après survente / retombée après surachat', origine: ORIGINES.freqtrade_sample, categorie: 'retour à la moyenne',
    description: 'Achat quand le RSI 14 repasse au-dessus du seuil de survente (30) alors que le prix remonte ; vente quand il repasse sous le seuil de surachat (70) alors que le prix baisse. Filtre facultatif de tendance H1 (prix du bon côté de la moyenne 50 H1). Stop à quelques ATR, objectif en R.',
    aide: { seuil: ['Seuil de survente', 'Le RSI doit repasser au-dessus de ce niveau (le miroir pour la vente : 100 moins ce niveau).'], filtre: ['Filtre de tendance H1', '1 = n’acheter que si le prix est au-dessus de la moyenne 50 H1 (jamais contre la tendance de fond).'], stopATR: ['Stop en ATR', 'Distance du stop en ATR M15.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques.'] },
    famille: {
      grille: () => ({ seuil: [25, 30, 35], filtre: [0, 1], stopATR: [1.5, 2.5], R: [3, 4.5] }),
      signaux(ctx, p) {
        const { m15 } = ctx, n = ctx.n, o = fabrique(n), r = surMemo(ctx, 'rsi14', () => rsi(m15.c, 14)), a = ctx.atr15, m50 = surMemo(ctx, 'sma50h1', () => surM15(sma(ctx.h1.serie.c, 50), ctx.h1.idx, n)); o.R = p.R;
        for (let i = DEPART; i < n; i++) {
          if (!(a[i] > 0) || !(r[i] > 0) || !(r[i - 1] > 0)) continue; const hautH1 = ctx.h1.serie.c[ctx.h1.idx[i]];
          if (r[i] > p.seuil && r[i - 1] <= p.seuil && m15.c[i] > m15.c[i - 1] && (!p.filtre || hautH1 > m50[i])) { o.sens[i] = 1; o.stop[i] = Math.min(minSur(m15.l, i, 8), m15.c[i] - p.stopATR * a[i]); }
          else if (r[i] < 100 - p.seuil && r[i - 1] >= 100 - p.seuil && m15.c[i] < m15.c[i - 1] && (!p.filtre || hautH1 < m50[i])) { o.sens[i] = -1; o.stop[i] = Math.max(maxSur(m15.h, i, 8), m15.c[i] + p.stopATR * a[i]); }
        }
        return o;
      }
    }
  },
  bot_bollinger: {
    id: 'bot_bollinger', nom: 'Bandes de Bollinger : retour à la moyenne', origine: ORIGINES.bollinger, categorie: 'retour à la moyenne',
    description: 'Achat quand la clôture ressort PAR LE HAUT de la bande basse (le prix avait débordé en dessous puis revient), vente quand elle ressort par le bas de la bande haute. Stop sous l’extrême du débordement, objectif en R. Marche en range, souffre dans une tendance forte.',
    aide: { periode: ['Période de la moyenne', 'Nombre de bougies M15 de la moyenne centrale et de l’écart-type.'], k: ['Largeur des bandes', 'Nombre d’écarts-types : 2 = bandes classiques, 2,5 = débordements plus rares.'], stopATR: ['Marge du stop (ATR)', 'Marge sous l’extrême du débordement.'], R: ['Objectif en R', 'Gagner R fois ce que tu risques.'] },
    famille: {
      grille: () => ({ periode: [20, 40], k: [2, 2.5], stopATR: [0.3, 0.8], R: [3, 4.5] }),
      signaux(ctx, p) {
        const { m15 } = ctx, n = ctx.n, o = fabrique(n), a = ctx.atr15, c = m15.c; o.R = p.R;
        const moy = surMemo(ctx, 'sma' + p.periode + 'm15', () => sma(c, p.periode)), ec = surMemo(ctx, 'ec' + p.periode, () => { const e = nan(n); for (let i = p.periode - 1; i < n; i++) { let s = 0; for (let j = i - p.periode + 1; j <= i; j++) { const d = c[j] - moy[i]; s += d * d; } e[i] = Math.sqrt(s / p.periode); } return e; });
        for (let i = Math.max(DEPART, p.periode + 1); i < n; i++) {
          if (!(a[i] > 0) || !(ec[i] > 0) || !(ec[i - 1] > 0)) continue; const bas = moy[i] - p.k * ec[i], basPrec = moy[i - 1] - p.k * ec[i - 1], haut = moy[i] + p.k * ec[i], hautPrec = moy[i - 1] + p.k * ec[i - 1];
          if (c[i] > bas && c[i - 1] <= basPrec) { o.sens[i] = 1; o.stop[i] = minSur(m15.l, i, 6) - p.stopATR * a[i]; }
          else if (c[i] < haut && c[i - 1] >= hautPrec) { o.sens[i] = -1; o.stop[i] = maxSur(m15.h, i, 6) + p.stopATR * a[i]; }
        }
        return o;
      }
    }
  }
};
function surMemo(ctx, cle, f) { const k = 'bot:' + cle; if (!ctx.cache.has(k)) ctx.cache.set(k, f()); return ctx.cache.get(k); }

/* Familles au format des hypothèses (grille + signaux), inscrites dans le registre sans toucher à ORDRE_TOUTES. */
export const FAMILLES_BOTS = Object.fromEntries(Object.values(BOTS).map(b => [b.id, { id: b.id, nom: b.nom, description: b.description, grille: b.famille.grille, signaux: b.famille.signaux }]));
Object.assign(FAMILLES, FAMILLES_BOTS);
export const ORDRE_BOTS = Object.keys(BOTS);
export const MENTION_PAPIER = 'PAPER TRADING seulement : aucune connexion à un compte, aucune clé de courtier, aucun ordre. Idées reprises de projets open source ; code réécrit pour Raylé, sans copie.';
void atr;
