import { Livre } from './livre.js';

/* ═════════════ SYNCHRONISATION DU CARNET BINANCE (V4, phase 2 ; module pur, testé : galaxie/tests/flux-synchro-test.mjs) ═════════════
   Procédure officielle (documentation Binance « How to manage a local order book correctly ») :
   1. ouvrir le flux de différences et METTRE EN TAMPON les événements ; 2. demander l'instantané REST ; 3. jeter les événements dont u ≤ lastUpdateId ; 4. le premier événement gardé doit vérifier
   U ≤ lastUpdateId + 1 ≤ u (sinon l'instantané est trop vieux : on le redemande) ; 5. ensuite, au comptant, chaque événement doit avoir U = u précédent + 1 ; en futures, pu = u précédent.
   TOUTE rupture = un TROU : on le note (jamais comblé artificiellement), on remet le carnet en attente et on redemande un instantané. Le carnet n'est exposé (`pret`) qu'une fois synchronisé. */
export function creerSynchro({ futures = false, surBesoinSnapshot = () => {}, surTrou = () => {}, maxTampon = 20000, maintenant = () => Date.now() } = {}) {
  const livre = new Livre(); let etat = 'attente', tampon = [], dernierU = null, demande = false, premier = false, dernierEvenement = null;
  const stats = { evenements: 0, resynchronisations: 0, trous: 0, instantanes: 0, tropAnciens: 0, evenementsJetes: 0 };
  const demander = () => { if (demande) return; demande = true; surBesoinSnapshot(); };
  const trou = (raison, de, a) => { stats.trous++; surTrou({ t: maintenant(), raison, de, a, futures }); };
  function appliquer(ev, surChangement) { if (ev.b && ev.b.length) livre.appliquer('bid', ev.b, surChangement); if (ev.a && ev.a.length) livre.appliquer('ask', ev.a, surChangement); dernierU = ev.u; dernierEvenement = maintenant(); }
  const chaineOk = ev => (futures ? ev.pu === dernierU : ev.U === dernierU + 1);
  function rompre(raison, ev) {
    if (etat === 'synchro') { stats.resynchronisations++; trou(raison, dernierU, ev ? ev.U : null); }
    etat = 'attente'; livre.vider(); dernierU = null; premier = false; tampon = ev ? [ev] : []; demande = false; demander();
  }
  return {
    livre, stats,
    pret: () => etat === 'synchro',
    etat: () => ({ etat, dernierU, tampon: tampon.length, ...stats, dernierEvenement }),
    /* Un événement du flux (e = depthUpdate : U, u, pu, b, a). `surChangement(prix, avant, apres)` : pour détecter les gros ordres. Rend true si le carnet a changé. */
    recevoir(ev, surChangement = null) {
      stats.evenements++;
      if (etat === 'synchro') {
        if (premier) {                                                                                   // premier événement après l'instantané : U ≤ lastUpdateId + 1 ≤ u
          if (ev.u <= dernierU) { stats.evenementsJetes++; return false; }
          if (ev.U > dernierU + 1) { rompre('instantané trop ancien', ev); return false; }
          premier = false; appliquer(ev, surChangement); return true;
        }
        if (ev.u <= dernierU) { stats.evenementsJetes++; return false; }                              // doublon / ancien
        if (!chaineOk(ev)) { rompre('rupture de séquence (attendu ' + (futures ? 'pu = ' : 'U = ') + (futures ? dernierU : dernierU + 1) + ', reçu ' + (futures ? ev.pu : ev.U) + ')', ev); return false; }
        appliquer(ev, surChangement); return true;
      }
      if (tampon.length >= maxTampon) { tampon.shift(); }
      tampon.push(ev); demander(); return false;
    },
    /* L'instantané REST { lastUpdateId, bids, asks }. Rend 'synchro', 'trop-ancien' (il en faut un nouveau) ou 'ignore'. */
    instantane(s) {
      if (etat !== 'attente') return 'ignore';
      demande = false; stats.instantanes++;
      const id = s.lastUpdateId; tampon = tampon.filter(e => e.u > id);
      if (tampon.length && tampon[0].U > id + 1) { stats.tropAnciens++; tampon = tampon; demander(); return 'trop-ancien'; }
      livre.charger(s.bids, s.asks); dernierU = id; etat = 'synchro'; premier = true;
      const rejoue = tampon; tampon = [];
      for (const e of rejoue) { this.recevoir(e); if (etat !== 'synchro') return 'trop-ancien'; }
      return 'synchro';
    },
    /* Reconnexion du flux : tout ce qui a été reçu avant n'est plus fiable. */
    reconnexion(de, a) { if (etat === 'synchro') { stats.resynchronisations++; trou('flux coupé', de || dernierEvenement, a || maintenant()); } etat = 'attente'; livre.vider(); dernierU = null; premier = false; tampon = []; demande = false; }
  };
}
