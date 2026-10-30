import { preparer, proposer, STYLES, ORDRE_SETUPS } from './moteur.js';
import { simuler, COUTS_TRADER } from './suivi.js';
import { PAS } from './outils.js';

/* ═════════════ PARCOURS D'UNE SÉRIE (V12 ; module pur, testé : galaxie/tests/trader-moteur-test.mjs) ═════════════
   Rejoue le moteur bougie par bougie comme s'il tournait en direct : à la clôture de chaque bougie M15 il propose, applique les plafonds (par jour, deux positions simultanées au plus, pas de doublon
   d'un même setup), puis suit chaque proposition avec la simulation prudente de suivi.js. C'est le MÊME code que celui du service : un « rétro-test » n'est qu'un rejeu, étiqueté comme tel. */
const JOUR = 86400e3;
export const ETIQUETTE_RETRO = 'rétro-test à titre d’exemple — pas une preuve';

export function parcourir(m15, { actif = 'BTC', style = 'equilibre', de = 0, a = m15.n - 1, couts = COUTS_TRADER, gestion = 'partielle', setups = ORDRE_SETUPS, maxSimultanees = 2, P = null, suivre = true } = {}) {
  const prep = P || preparer(m15), S = STYLES[style], out = [], parJour = new Map(), derniers = new Map(), actives = [];
  for (let i = Math.max(de, 1); i <= Math.min(a, m15.n - 2); i++) {
    // positions encore en cours (la simulation connaît déjà leur fin : on ne s'en sert QUE pour compter les places libres à l'instant i)
    for (let q = actives.length - 1; q >= 0; q--) if (actives[q] <= i) actives.splice(q, 1);
    if (actives.length >= maxSimultanees) continue;
    const r = proposer(prep, i, { style, actif, setups }); if (!r.propositions.length) continue;
    const jour = Math.floor(m15.t[i] / JOUR);
    for (const p of r.propositions) {
      if ((parJour.get(jour) || 0) >= S.maxParJour) break;
      const cle = p.setup + '|' + p.sens, dernier = derniers.get(cle); if (dernier != null && i - dernier < 8) continue;
      if (actives.length >= maxSimultanees) break;
      p.style = style;
      if (suivre) {
        const res = simuler(m15, p, { couts, gestion });
        p.resultat = res; p.tSortie = res.iSortie != null ? m15.t[res.iSortie] + PAS : null;
        actives.push(res.iSortie != null ? res.iSortie : m15.n);
      }
      parJour.set(jour, (parJour.get(jour) || 0) + 1); derniers.set(cle, i); out.push(p);
    }
  }
  return out;
}
/* Test de FUITE DU FUTUR : les propositions faites à la clôture de la bougie i sur une série COUPÉE à i doivent être identiques à celles faites sur la série qui CONTIENT le futur. `proposeur(serie, i)` rend la liste
   de propositions de la bougie i ; `tranche(m15, a, b)` découpe. Une stratégie qui regarde en avant (ou un moteur truqué) est rejetée ici : ses propositions diffèrent. Rend { ok, ecarts:[{i, coupe, plein}] }. */
export function testerFuite(m15, indices, { proposeur = (serie, i) => proposer(preparer(serie), i, { style: 'actif' }).propositions, tranche, fenetre = 6000, futur = 2000 } = {}) {
  const ecarts = [];
  for (const i of indices) {
    const a = Math.max(0, i - fenetre), plein = tranche(m15, a, Math.min(m15.n, i + futur)), coupe = tranche(m15, a, i + 1), k = i - a;
    const sc = signature(proposeur(coupe, k)), sp = signature(proposeur(plein, k));
    if (sc !== sp) ecarts.push({ i, coupe: sc, plein: sp });
  }
  return { ok: !ecarts.length, ecarts };
}
const signature = l => JSON.stringify((l || []).map(p => [p.setup, p.sens, +(+p.entree).toFixed(8), +(+p.stop).toFixed(8), +(+p.cible1).toFixed(8), +(+p.cible2).toFixed(8), p.nConfluences]));
