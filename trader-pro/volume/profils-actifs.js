/* ═════════════ PROFILS D'ACTIF (v6, A3) — chaque actif a le terminal qui lui convient ═════════════
   Le profil décide de ce qui est affiché ; ce qui n'existe pas pour un actif est MASQUÉ (pas affiché vide) et expliqué par une seule petite ligne dans « Détails ». */
export const PROFILS = Object.freeze({
  crypto: { id: 'crypto', nom: 'Crypto / perpétuel', court: 'Perp.', volume: 'réel, côté agresseur', carnet: true, footprint: true, sessions: false, droite: 'carnet', onglets: ['carnet', 'ict', 'jour', 'bv'],
    masques: [] },
  indices: { id: 'indices', nom: 'Futures indices', court: 'Futures', volume: 'futures CME (différé)', carnet: false, footprint: false, sessions: true, droite: 'ict', onglets: ['ict', 'jour', 'bv'],
    masques: ['Carnet : pas de carnet d’ordres gratuit pour les futures CME.', 'Empreinte : pas de transactions gratuites avec le côté de l’agresseur pour les futures CME.'] },
  forex: { id: 'forex', nom: 'Forex / indice dollar', court: 'Forex', volume: 'futures CME si disponibles, sinon volume de ticks', carnet: false, footprint: false, sessions: true, droite: 'ict', onglets: ['ict', 'jour', 'bv'],
    masques: ['Carnet : le forex est un marché de gré à gré, sans carnet central.', 'Empreinte : pas de transactions avec le côté de l’agresseur (marché de gré à gré).'] }
});
export const PROFIL_DE = Object.freeze({ btc: 'crypto', sol: 'crypto', or: 'crypto', us100: 'indices', us500: 'indices', petrole: 'indices', eurusd: 'forex', usdchf: 'forex', dxy: 'forex' });
export const profilDe = id => PROFILS[PROFIL_DE[id]] || PROFILS.crypto;
export const NOM_ONGLET = Object.freeze({ carnet: 'Carnet', ict: 'Bougies HTF / ICT', jour: 'Bougie du jour', bv: 'Bougies volume' });
/* onglet affiché au départ : le dernier choix mémorisé pour l'actif s'il est encore permis par le profil, sinon celui du profil */
export const ongletInitial = (id, memorise) => { const p = profilDe(id); return memorise && p.onglets.includes(memorise) ? memorise : p.droite; };
