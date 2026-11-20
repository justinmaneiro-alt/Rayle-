/* ═════════════ PALETTE FIXE DU MODE VOLUME (v6, A6) — rien d'autre n'est utilisé ═════════════
   · Vert et rouge : bougies, delta, volume, acheteurs / vendeurs.
   · Or : la MA200 (et elle seule).
   · Un SEUL bleu : tous les VWAP (le même bleu, trait plein ; les bandes, si activées, en pointillé plus clair).
   · Blanc ou gris : POC (blanc), VAH et VAL (gris).
   · Une teinte discrète (bleu-gris atténué) : tous les niveaux (réaction, repères ICT, supports / résistances de volume).
   · Gris : zones (FVG, order blocks), fonds, textes secondaires. */
export const PALETTE = Object.freeze({ haut: '#5fb894', bas: '#d86a6a', or: '#e0b84a', vwap: '#6fb4d4', poc: '#e6edf2', vahVal: 'rgba(200,210,218,.7)', niveau: '#7fb3c2', zone: 'rgba(170,180,190,.14)', texte: '#aebcc4', doux: '#6b7a84', fond: '#000' });
export const NOM_PRESETS = Object.freeze({ epure: 'Épuré', complet: 'Volume complet', ict: 'ICT', footprint: 'Footprint' });
/* chaque préréglage fixe les calques ; tout ce qui n'est pas listé garde sa valeur */
const BASE_OFF = { profil: false, poc: false, vwap: false, bandesVwap: false, nus: false, murs: false, chaleur: false, empreinte: false, vd: false, reaction: false, niveaux: false, fleches: false, ma200: false, ictPrincipal: false, sessions: false };
export const PRESETS = Object.freeze({
  epure: { ...BASE_OFF, poc: true, ma200: true, empreinte: true, dessins: true },
  complet: { ...BASE_OFF, profil: true, poc: true, vwap: true, nus: true, murs: true, empreinte: true, vd: true, niveaux: true, fleches: true, ma200: true, dessins: true, sessions: true },
  ict: { ...BASE_OFF, poc: true, ictPrincipal: true, dessins: true, sessions: true, fleches: false },
  footprint: { ...BASE_OFF, poc: true, empreinte: true, niveaux: false, dessins: true }
});
export const appliquerPreset = (opts, id) => { const P = PRESETS[id]; if (!P) return opts; return { ...opts, ...P, preset: id }; };
