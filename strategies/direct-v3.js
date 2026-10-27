import { construireContexte } from '../planetes/mars/pc/agent-btc/contexte.js';
import { fusionConfig, ouvrirPosition, evaluerBougie, resultatPosition, semaineUTC } from '../planetes/mars/pc/agent-btc/moteur.js';
import { PHASES } from '../planetes/mars/pc/agent-btc/lecture.js';
import { famille } from './familles-v3.js';

/* ═════════════ SURVEILLANCE EN DIRECT D'UNE STRATÉGIE (module pur, causal ; testé : galaxie/tests/direct-v3-test.mjs) ═════════════
   UN seul code pour : le service PC, le Worker Cloudflare (cron) et le navigateur. Il rejoue la MÊME logique d'exécution que le backtest (briques de moteur.js : entrée à l'ouverture de la bougie
   suivante, spread et glissement défavorables, stop prioritaire, repos après sortie, un maximum de positions par semaine) : ce qui est testé en backtest est ce qui tourne en direct.
   Entrées : une règle { id, famille, params } et une série M15 en colonnes (les bougies FERMÉES seulement ; ≥ ~2 500 bougies pour que les moyennes soient chauffées).
   L'état d'une règle (JSON) contient le compte simulé : position ouverte, entrée en attente, trades clos, courbe de capital. Aucun ordre n'est jamais passé. */
export const ETAT_REGLE_VIDE = () => ({ version: 1, derniereBarre: null, pendante: null, position: null, trades: [], equite: [], prochainApres: null, semaine: null, nSemaine: 0, signalVu: null });
const heure = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* Taille de position pour risquer `risquePct` % du capital : quantité = risque en monnaie / distance au stop. */
export function taillePosition(capital, risquePct, entree, stop) {
  const dist = Math.abs(entree - stop); if (!(dist > 0) || !(entree > 0)) return null;
  const risque = capital * risquePct / 100, quantite = risque / dist;
  return { risque, quantite, valeur: quantite * entree, effet: quantite * entree / capital };
}
/* Raison du trade en deux lignes (sans IA, d'après les données connues à la clôture du signal). */
export function raisonSignal(nomFamille, ctx, i, sens) {
  const ph = PHASES[ctx.h1.phase[i]] || 'transition', ph4 = PHASES[ctx.h4.phase[i]] || 'transition', a = ctx.atr15[i], px = ctx.m15.c[i];
  return [nomFamille + ' : signal ' + (sens > 0 ? 'd’achat' : 'de vente') + ' à la clôture de la bougie M15 de ' + heure(ctx.m15.t[i] + 900e3) + '.',
    'Contexte : H1 en phase « ' + ph + ' », H4 « ' + ph4 + ' », volatilité (ATR M15) ' + (a > 0 && px > 0 ? (a / px * 100).toFixed(2).replace('.', ',') + ' % du prix.' : 'inconnue.')];
}

/* Avance l'état de la règle avec les bougies fermées apparues depuis `etat.derniereBarre`.
   Rend { etat, evenements } ; evenements = [{ type: 'PREPARATION'|'ENTREE'|'CLOTURE'|'INVALIDATION', t, ... }]. `etat` est modifié en place ET rendu. */
export function avancerRegle({ regle, serie, etat = ETAT_REGLE_VIDE(), config = {}, capital = 10000, risquePct = 1, ctx = null }) {
  const fam = famille(regle.famille); if (!fam) return { etat, evenements: [], erreur: 'famille inconnue : ' + regle.famille };
  const cfg = fusionConfig(config), n = serie.n, evenements = [];
  if (n < 600) return { etat, evenements, erreur: 'pas assez de bougies (' + n + ') pour chauffer les indicateurs' };
  const c = ctx || construireContexte(serie), sig = fam.signaux(c, regle.params);
  const dernier = n - 1, deja = etat.derniereBarre;
  let debut = dernier;                                                                       // première fois : on part de la dernière bougie fermée, rien n'est rejoué
  if (deja != null) { debut = n; for (let i = n - 1; i >= 0 && serie.t[i] > deja; i--) debut = i; }
  if (debut > dernier) return { etat, evenements };
  const risqueCapital = () => etat.equite.length ? etat.equite[etat.equite.length - 1].capital : capital;
  for (let j = debut; j <= dernier; j++) {
    const b = { o: serie.o[j], h: serie.h[j], l: serie.l[j], c: serie.c[j] }, t = serie.t[j];
    // 1) entrée en attente : exécutée à l'OUVERTURE de cette bougie
    if (etat.pendante && !etat.position) {
      const p = etat.pendante; etat.pendante = null;
      const sem = semaineUTC(t); if (sem !== etat.semaine) { etat.semaine = sem; etat.nSemaine = 0; }
      const pos = etat.nSemaine < cfg.maxParSemaine && (etat.prochainApres == null || t >= etat.prochainApres + 900e3) ? ouvrirPosition(cfg, p.sens, serie.o[j], p.stop, p.R) : null;
      if (pos) { etat.nSemaine++; etat.position = { ...pos, t, signalT: p.signalT, barres: 0, raison: p.raison, tailles: taillePosition(risqueCapital(), risquePct, pos.fill, pos.stop) }; }
      else evenements.push({ type: 'INVALIDATION', t, sens: p.sens, motif: 'entrée non exécutée (distance du stop hors limites, repos ou maximum hebdomadaire)', signalT: p.signalT });
    }
    // 2) position ouverte : stop, objectif, temps
    if (etat.position) {
      const pos = etat.position; pos.barres++;
      const ex = evaluerBougie(cfg, pos, b, pos.barres === 1, pos.barres);
      if (ex) {
        const r = resultatPosition(cfg, pos, ex.prix), cap = risqueCapital() * (1 + risquePct / 100 * r.R);
        const trade = { t: pos.t, tSortie: t, sens: pos.s, prixEntree: pos.fill, stop: pos.stop, cible: pos.cible, prixSortie: ex.prix, motif: ex.motif, R: r.R, barres: pos.barres, signalT: pos.signalT };
        etat.trades.push(trade); etat.equite.push({ t, capital: cap }); etat.position = null; etat.prochainApres = t + cfg.reposBarres * 900e3;
        evenements.push({ type: 'CLOTURE', t, trade });
      }
    }
    // 3) signal à la clôture de cette bougie → entrée à l'ouverture de la suivante
    if (sig.sens[j] !== 0 && !etat.position && !etat.pendante && etat.signalVu !== serie.t[j]) {
      etat.signalVu = serie.t[j];
      const s = sig.sens[j], stop = sig.stop[j], approx = ouvrirPosition(cfg, s, serie.c[j], stop, sig.R);
      if (approx) {
        const raison = raisonSignal(fam.nom, c, j, s);
        etat.pendante = { sens: s, stop, R: sig.R, signalT: serie.t[j], raison };
        evenements.push({ type: 'ENTREE', t: serie.t[j] + 900e3, sens: s, entree: approx.fill, stop: approx.stop, cible: approx.cible, R: sig.R, distancePct: approx.pct, objectifs: [1, 2, sig.R].filter((x, k, a) => a.indexOf(x) === k).map(x => ({ R: x, prix: approx.fill + s * x * approx.dist })), tailles: taillePosition(risqueCapital(), risquePct, approx.fill, approx.stop), raison, signalT: serie.t[j] });
      } else evenements.push({ type: 'INVALIDATION', t: serie.t[j] + 900e3, sens: s, motif: 'stop trop proche ou trop loin : setup écarté', signalT: serie.t[j] });
    }
    etat.derniereBarre = t;
  }
  // 4) préparation (facultative, seulement sur la dernière bougie, jamais une entrée)
  const prep = typeof fam.preparation === 'function' ? fam.preparation(c, regle.params, dernier) : (typeof fam.approche === 'function' ? fam.approche(c, regle.params, dernier) : null);
  if (prep && !etat.position && !etat.pendante) evenements.push({ type: 'PREPARATION', t: serie.t[dernier] + 900e3, sens: prep.sens, niveau: prep.niveau || null, texte: prep.texte || 'setup en préparation' });
  if (etat.trades.length > 400) etat.trades = etat.trades.slice(-400);
  if (etat.equite.length > 400) etat.equite = etat.equite.slice(-400);
  return { etat, evenements };
}

/* Résumé du compte simulé d'une règle (pour l'écran, les rapports et la décision « simulation terminée »). */
export function resumeCompte(etat, { capital = 10000, risquePct = 1 } = {}) {
  const T = etat.trades, n = T.length; let somme = 0, pic = 0, dd = 0, g = 0;
  for (const x of T) { somme += x.R; if (x.R > 0) g++; if (somme > pic) pic = somme; if (pic - somme > dd) dd = pic - somme; }
  return { n, R: somme, esperance: n ? somme / n : null, tauxReussite: n ? g / n : null, ddR: dd, ddPct: dd * risquePct, capital: capital * (1 + somme * risquePct / 100), premiere: n ? T[0].t : null, derniere: n ? T[n - 1].tSortie : null };
}
