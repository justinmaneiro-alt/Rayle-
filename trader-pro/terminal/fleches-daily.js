/* ═════════════ FLÈCHES DAILY SIMPLES : retournements des gros mouvements (module PUR, testé, navigateur et Node) ═════════════
   Une flèche = « le mouvement important vient probablement de se retourner ». Rouge AU-DESSUS d'un sommet Daily (dir −1), verte SOUS un creux Daily (dir +1).
   Règles de conception (fixées avant toute mesure, voir BACKTEST-FLECHES.md) :
   - CAUSAL : la flèche du jour i n'utilise que les bougies 0…i. Elle apparaît à la CLÔTURE de la bougie Daily qui confirme le retournement, ne bouge jamais, n'est jamais antidatée ;
   - INVARIANT PAR TRANSLATION : seules des différences de prix et des multiples d'ATR sont utilisés (jamais un pourcentage du prix) : si l'historique d'un actif est recalé d'un montant constant
     (futures → comptant), les flèches restent exactement les mêmes ;
   - SIMPLE : trois méthodes candidates, 2 à 3 réglages chacune ; un délai de repos de 20 bougies entre deux flèches de même sens.
   Bougie = { t (ouverture, ms UTC), o, h, l, c }. Les bougies passées doivent être CLÔTURÉES (le robot et le terminal écartent la bougie du jour en cours). */
import { atr, sma, rsi } from '../commun/analyse.js';

export const J = 86400e3;
export const REPOS = 20;   // bougies de repos entre deux flèches de même sens

/* indicateurs causaux (la valeur de l'index i ne dépend que de 0…i) */
export function indicateurs(B) {
  const c = B.map(b => b.c);
  return { atr: atr(B, 14), ma200: sma(c, 200), rsi: rsi(c, 14) };
}
const fleche = (B, i, dir, methode, k, extra = {}) => ({ i, t: B[i].t, tCloture: B[i].t + J, dir, methode, k, tExtreme: B[k].t, decalageJours: Math.round((B[i].t - B[k].t) / J), niveau: dir < 0 ? B[i].h : B[i].l, ...extra });
const maxH = (B, a, b) => { let m = -Infinity; for (let x = Math.max(0, a); x <= b; x++) if (B[x].h > m) m = B[x].h; return m; };
const minL = (B, a, b) => { let m = Infinity; for (let x = Math.max(0, a); x <= b; x++) if (B[x].l < m) m = B[x].l; return m; };

/* ── Méthode A : plus haut / plus bas de N jours, puis clôture de confirmation ──
   Sommet : la bougie k est un plus haut de N jours (aucune bougie plus haute dans les N−1 jours qui précèdent) ; dans les `fenetre` jours qui suivent, une bougie i CLÔTURE sous le plus bas de la bougie k
   (moins `conf` ATR) alors qu'aucune bougie entre k et i n'a dépassé le sommet. Creux : le miroir. Une seule flèche par extrême. */
export function methodeExtreme(B, { N = 60, fenetre = 10, conf = 0 } = {}, ind = indicateurs(B)) {
  const out = [], utilise = new Set(); const dernier = { 1: -1e9, '-1': -1e9 };
  for (let i = N; i < B.length; i++) {
    const a = ind.atr[i]; if (a == null) continue;
    for (const dir of [-1, 1]) {
      if (i - dernier[dir] < REPOS) continue;
      for (let k = i - 1; k >= Math.max(N - 1, i - fenetre); k--) {
        if (utilise.has(dir + '|' + k)) continue;
        const estExtreme = dir < 0 ? B[k].h >= maxH(B, k - N + 1, k - 1) && B[k].h >= maxH(B, k + 1, i - 1) : B[k].l <= minL(B, k - N + 1, k - 1) && B[k].l <= minL(B, k + 1, i - 1);
        if (!estExtreme) continue;
        const confirme = dir < 0 ? B[i].c < B[k].l - conf * a : B[i].c > B[k].h + conf * a;
        if (confirme) { out.push(fleche(B, i, dir, 'extreme', k)); utilise.add(dir + '|' + k); dernier[dir] = i; break; }
      }
    }
  }
  return out.sort((x, y) => x.i - y.i || x.dir - y.dir);
}

/* ── Méthode B : pivot de swing confirmé ──
   Sommet de swing : la bougie k a le plus haut des L jours qui précèdent et des R jours qui suivent ; il est confirmé à la clôture de la bougie k+R. Filtre « gros mouvement » : la hausse qui y mène
   (du plus bas des 3L jours précédents jusqu'au sommet) fait au moins `amp` ATR. Creux : le miroir. Décalage = R jours par construction. */
export function methodePivot(B, { L = 8, R = 8, amp = 5 } = {}, ind = indicateurs(B)) {
  const out = []; const dernier = { 1: -1e9, '-1': -1e9 };
  for (let i = L + R; i < B.length; i++) {
    const k = i - R, a = ind.atr[k]; if (a == null) continue;
    for (const dir of [-1, 1]) {
      if (i - dernier[dir] < REPOS) continue;
      const ok = dir < 0 ? B[k].h > maxH(B, k - L, k - 1) && B[k].h >= maxH(B, k + 1, i) && B[k].h - minL(B, k - 3 * L, k) >= amp * a : B[k].l < minL(B, k - L, k - 1) && B[k].l <= minL(B, k + 1, i) && maxH(B, k - 3 * L, k) - B[k].l >= amp * a;
      if (ok) { out.push(fleche(B, i, dir, 'pivot', k)); dernier[dir] = i; }
    }
  }
  return out;
}

/* ── Méthode C : excès + bougie de retournement ──
   Excès (sommet) : dans les 5 jours qui précèdent, la clôture s'est éloignée de la MA200 Daily d'au moins `exces` ATR (type « ma »), ou le RSI 14 a dépassé `seuil` (type « rsi »).
   Retournement : la bougie i est baissière (clôture sous son ouverture) et CLÔTURE sous le plus bas de la veille. Creux : le miroir. */
export function methodeExces(B, { type = 'ma', exces = 4.5, seuil = 75 } = {}, ind = indicateurs(B)) {
  const out = []; const dernier = { 1: -1e9, '-1': -1e9 };
  for (let i = 205; i < B.length; i++) {
    const a = ind.atr[i]; if (a == null || ind.ma200[i] == null) continue;
    for (const dir of [-1, 1]) {
      if (i - dernier[dir] < REPOS) continue;
      const retourne = dir < 0 ? B[i].c < B[i].o && B[i].c < B[i - 1].l : B[i].c > B[i].o && B[i].c > B[i - 1].h; if (!retourne) continue;
      let exces_ok = false;
      for (let x = i - 5; x < i; x++) {
        if (ind.ma200[x] == null || ind.atr[x] == null) continue;
        const ecart = (B[x].c - ind.ma200[x]) / ind.atr[x];
        const ok = type === 'ma' ? (dir < 0 ? ecart >= exces : ecart <= -exces) : (dir < 0 ? ind.rsi[x] != null && ind.rsi[x] >= seuil : ind.rsi[x] != null && ind.rsi[x] <= 100 - seuil);
        if (ok) { exces_ok = true; break; }
      }
      if (!exces_ok) continue;
      /* l'extrême réel du mouvement : plus haut (ou plus bas) des 10 derniers jours */
      let kx = i - 1; for (let x = i - 10; x < i; x++) if (x >= 0 && (dir < 0 ? B[x].h >= B[kx].h : B[x].l <= B[kx].l)) kx = x;
      out.push(fleche(B, i, dir, 'exces', kx)); dernier[dir] = i;
    }
  }
  return out;
}

export const METHODES = Object.freeze({
  extreme: { nom: 'Retournement après un plus haut / plus bas de N jours', court: 'Plus haut / plus bas de N jours + clôture de confirmation', fn: methodeExtreme, grille: [{ N: 40 }, { N: 60 }, { N: 90 }, { N: 60, conf: 1 }, { N: 90, conf: 1 }, { N: 120, conf: 0.5 }] },
  pivot: { nom: 'Pivot de swing confirmé', court: 'Pivot de swing confirmé (plus haut / plus bas autour de la bougie)', fn: methodePivot, grille: [{ L: 5, R: 5, amp: 4 }, { L: 8, R: 8, amp: 5 }, { L: 8, R: 8, amp: 7 }, { L: 12, R: 12, amp: 5 }, { L: 12, R: 12, amp: 8 }, { L: 15, R: 10, amp: 8 }] },
  exces: { nom: 'Excès (écart à la MA200 ou RSI extrême) + bougie de retournement', court: 'Excès + bougie de retournement', fn: methodeExces, grille: [{ type: 'ma', exces: 3 }, { type: 'ma', exces: 4.5 }, { type: 'ma', exces: 6 }, { type: 'rsi', seuil: 70 }, { type: 'rsi', seuil: 75 }, { type: 'rsi', seuil: 80 }] }
});
export const calculer = (B, methode, params, ind) => METHODES[methode].fn(B, params, ind || indicateurs(B));

/* ───── REGISTRE : une flèche publiée ne bouge plus jamais ─────
   `existantes` : flèches déjà publiées sur cet appareil ; `calculees` : flèches recalculées sur les bougies actuelles. On garde les existantes TELLES QUELLES et on n'ajoute que les nouvelles
   (jour de clôture strictement postérieur à la dernière flèche connue, ou jour jamais vu). Une flèche qui ne se reproduirait plus (donnée corrigée en amont) reste affichée. */
export const idFleche = (actif, f) => `${actif}|${f.t}|${f.dir}`;
export function fusionnerRegistre(actif, existantes = [], calculees = []) {
  const vus = new Set(existantes.map(f => f.id)), out = existantes.slice();
  for (const f of calculees) { const id = idFleche(actif, f); if (!vus.has(id)) { out.push({ id, t: f.t, tCloture: f.tCloture, dir: f.dir, methode: f.methode, tExtreme: f.tExtreme, decalageJours: f.decalageJours, niveau: f.niveau, vueLe: null }); vus.add(id); } }
  return out.sort((a, b) => a.t - b.t || a.dir - b.dir);
}
/* bougies Daily CLÔTURÉES (la bougie du jour en cours est écartée) */
export const cloturees = (B, maintenant = Date.now()) => (B || []).filter(b => b.t + J <= maintenant);

/* ───── placement sur un graphique H1 / H4 / Jour ─────
   Une flèche appartient à la bougie Daily `t`. Sur une unité plus fine : la DERNIÈRE bougie de cette journée (celle qui contient la clôture du Daily) ; sur le Jour : la bougie Daily elle-même.
   `Bunite` : bougies affichées (t ascendant) ; pas : durée d'une bougie en ms. Renvoie l'index de la bougie ou -1 si la journée n'est pas dans la plage affichée. */
export function indexSurUnite(Bunite, tJour, pas) {
  if (!Bunite || !Bunite.length) return -1;
  if (pas >= J) { for (let i = Bunite.length - 1; i >= 0; i--) if (Bunite[i].t <= tJour && tJour < Bunite[i].t + pas) return i; return -1; }
  let r = -1; for (let i = 0; i < Bunite.length; i++) { if (Bunite[i].t >= tJour + J) break; if (Bunite[i].t >= tJour) r = i; }
  return r;
}

/* Méthode et réglage RETENUS par le backtest (backtest-fleches.json : méthode « retenue », réglage choisi sur la période d'apprentissage uniquement). Un test vérifie que cette constante et le JSON concordent. */
export const RETENUE = Object.freeze({ methode: 'pivot', params: Object.freeze({ L: 12, R: 12, amp: 5 }) });
