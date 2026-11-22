/* ═════════════ FOURNISSEUR DE LA SÉRIE UNIQUE (v12) — navigateur ═════════════
   `serieUnique(unite)` rend les bougies de l'actif de la page (ouverture, haut, bas, clôture, date) EXACTEMENT comme le Classique les affiche :
   pour l'unité affichée par le Classique, sa propre série (moteur.serie()) ; pour une autre unité, la même fonction de chargement que le moteur
   (historique-or.chargerHistorique + serieAffichee, même écart Kraken − Binance). Les prix sont rendus à l'échelle d'origine (EUR/USD ×10 000 → 1,08).
   Utilisée par le mode Volume (qui n'ajoute que ses couches), les rapports et le cerveau de Rayle. Aucun cache durable : mémoire de page, 60 s. */
import { chargerHistorique, serieAffichee } from '../../agent-trading/front/or/historique-or.js';
import { ID_HISTO } from './histo-long.js';
import { instrument, actifCourant, echelleDe } from '../../agent-trading/front/or/instruments.js';

const UNITES = { H1: 'H1', H4: 'H4', J: 'J' };
export function creerSerieUnique(T) {
  const INSTR = instrument(actifCourant()), K = echelleDe(INSTR), memoire = new Map();
  const vers = L => (K === 1 ? L.map(b => ({ ...b })) : L.map(b => ({ ...b, o: b.o / K, h: b.h / K, l: b.l / K, c: b.c / K })));
  const uniteClassique = () => { const S = T && T.moteur && T.moteur.S; return S ? S.periode : null; };
  /* état : 'classique' (série du moteur, unité affichée), 'chargee' (même fonction de chargement, autre unité), null si rien de prêt */
  async function serieUnique(unite, { attendre = 0 } = {}) {
    if (!UNITES[unite]) return null;
    const debut = Date.now();
    for (;;) {
      const S = T && T.moteur && T.moteur.S;
      if (S && S.periode === unite && !S.chargement) { const L = T.moteur.serie(); if (L && L.length >= 50) return { actif: INSTR.id, unite, origine: 'classique', bougies: vers(L), echelle: K }; }
      if (Date.now() - debut >= attendre) break;
      await new Promise(r => setTimeout(r, 250));
    }
    const S = T && T.moteur && T.moteur.S; if (!S) return null;
    const m = memoire.get(unite); if (m && Date.now() - m.t < 60e3) return m.p;
    const p = (async () => {
      const H = await chargerHistorique(unite, { maintenant: Date.now(), actifLong: ID_HISTO[INSTR.id] || null });
      return { actif: INSTR.id, unite, origine: 'chargee', bougies: vers(serieAffichee(H, H.k, S.ecart)), echelle: K };
    })();
    memoire.set(unite, { t: Date.now(), p }); p.catch(() => memoire.delete(unite)); return p;
  }
  return { serieUnique, uniteClassique, actif: INSTR.id, echelle: K };
}
