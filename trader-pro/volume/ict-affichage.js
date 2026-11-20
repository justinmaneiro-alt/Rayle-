/* ═════════════ REPÈRES ICT : DE LA DONNÉE À L'AFFICHAGE (v6, A4) — pur et testé ═════════════
   Produit, pour un jeu de bougies Daily et les choix de l'utilisateur, la liste des lignes, zones et marqueurs à dessiner, plus la « lecture en une ligne ».
   Utilisé par la miniature de l'onglet « Bougies HTF / ICT » et, sur demande, par le graphique principal (étiquettes sur l'axe des prix seulement). */
import { agreger, reperes, premiumDiscount, fairValueGaps, orderBlocks, egaux, balayages, lecture } from './ict-calcul.js';

export const COULEURS_ICT = Object.freeze({ niveau: '#7fb3c2', ouverture: '#8a9aa4', prem: 'rgba(216,106,106,.075)', disc: 'rgba(95,184,148,.075)', fvg: 'rgba(170,180,190,.14)', fvgBord: 'rgba(170,180,190,.55)', ob: 'rgba(127,179,194,.12)', obBord: 'rgba(127,179,194,.6)', liquidite: '#c9b27a', sweep: '#f1d34f' });
/* repères activables un par un (ordre d'affichage dans l'onglet) */
export const REPERES_ICT = Object.freeze([
  ['PDH', 'PDH (plus haut de la veille)'], ['PDL', 'PDL (plus bas de la veille)'], ['PWH', 'PWH (plus haut de la semaine précédente)'], ['PWL', 'PWL (plus bas de la semaine précédente)'], ['PMH', 'PMH (plus haut du mois précédent)'], ['PML', 'PML (plus bas du mois précédent)'],
  ['OJ', 'Ouverture du jour'], ['OS', 'Ouverture de la semaine'], ['OM', 'Ouverture du mois'], ['pd', 'Premium / discount (50 % de la semaine précédente)'], ['fvgJ', 'Fair value gaps Daily ouverts'], ['fvgS', 'Fair value gaps Weekly ouverts'],
  ['obJ', 'Order blocks Daily valides'], ['obS', 'Order blocks Weekly valides'], ['egaux', 'Égaux hauts / bas (liquidité $$$)'], ['sweep', 'Balayages de liquidité (sweep)']]);
export const ICT_DEFAUT = Object.freeze({ PDH: true, PDL: true, PWH: true, PWL: true, PMH: false, PML: false, OJ: true, OS: false, OM: false, pd: true, fvgJ: true, fvgS: false, obJ: false, obS: false, egaux: true, sweep: true });

export function construire(B, choix = ICT_DEFAUT, { fmt = v => String(Math.round(v)), maintenant = Date.now() } = {}) {
  const sortie = { lignes: [], zones: [], marqueurs: [], lecture: lecture({ B, fmt, maintenant }), refs: {} }; if (!B || B.length < 20) return sortie;
  const C = { ...ICT_DEFAUT, ...choix }, R = reperes(B, maintenant), px = B[B.length - 1].c; if (!R) return sortie;
  for (const n of R.niveaux) if (C[n.id]) sortie.lignes.push({ prix: n.prix, texte: n.id, couleur: COULEURS_ICT.niveau, tirets: false, id: n.id });
  for (const o of R.ouvertures) if (C[o.id]) sortie.lignes.push({ prix: o.prix, texte: o.id === 'OJ' ? 'Ouv. jour' : o.id === 'OS' ? 'Ouv. sem.' : 'Ouv. mois', couleur: COULEURS_ICT.ouverture, tirets: true, id: o.id });
  const PD = premiumDiscount(B, { maintenant }); if (PD) { sortie.refs.pd = PD; if (C.pd) { sortie.lignes.push({ prix: PD.equilibre, texte: '50 %', couleur: COULEURS_ICT.ouverture, tirets: true, id: 'pd' }); sortie.zones.push({ bas: PD.equilibre, haut: PD.haut, fond: COULEURS_ICT.prem, id: 'pd-haut' }, { bas: PD.bas, haut: PD.equilibre, fond: COULEURS_ICT.disc, id: 'pd-bas' }); } }
  const S = agreger(B, 'S');
  for (const [cle, tf, G, nom] of [['fvgJ', 'J', B, 'Daily'], ['fvgS', 'S', S, 'Weekly']]) if (C[cle] && G.length >= 8) for (const f of fairValueGaps(G, { max: 4 })) sortie.zones.push({ bas: f.bas, haut: f.haut, fond: COULEURS_ICT.fvg, bord: COULEURS_ICT.fvgBord, tirets: true, id: 'FVG ' + nom, texte: 'FVG ' + (tf === 'J' ? 'D' : 'W') });
  for (const [cle, tf, G, nom] of [['obJ', 'J', B, 'Daily'], ['obS', 'S', S, 'Weekly']]) if (C[cle] && G.length >= 16) for (const o of orderBlocks(G, { max: 3 })) sortie.zones.push({ bas: o.bas, haut: o.haut, fond: COULEURS_ICT.ob, bord: COULEURS_ICT.obBord, id: 'OB ' + nom, texte: 'OB ' + (tf === 'J' ? 'D' : 'W') + (o.sens === 'haussier' ? '↑' : '↓') });
  const E = egaux(B); if (C.egaux) for (const e of E) sortie.lignes.push({ prix: e.prix, texte: (e.type === 'haut' ? 'EQH' : 'EQL') + ' $$$', couleur: COULEURS_ICT.liquidite, tirets: true, id: 'egaux' });
  sortie.refs.egaux = E; sortie.refs.reperes = R;
  if (C.sweep) { const niv = [...R.niveaux.filter(n => ['PDH', 'PDL', 'PWH', 'PWL'].includes(n.id)), ...E.map(e => ({ id: e.type === 'haut' ? 'EQH' : 'EQL', prix: e.prix, type: e.type, depuis: e.t }))]; for (const s of balayages(B, niv)) sortie.marqueurs.push({ t: s.t, texte: 'sweep', position: s.sens === 'baissier' ? 'aboveBar' : 'belowBar', couleur: COULEURS_ICT.sweep, niveau: s.niveau }); }
  sortie.marqueurs.sort((a, b) => a.t - b.t); sortie.px = px; return sortie;
}
/* étiquettes d'axe correspondantes (pour le graphique principal) : une par ligne, une par zone (bord haut) */
export function etiquettesAxe(S) {
  const L = S.lignes.map(l => ({ prix: l.prix, texte: l.texte, fond: l.couleur, couleur: '#05080c' }));
  for (const z of S.zones) if (z.texte) L.push({ prix: (z.bas + z.haut) / 2, texte: z.texte, fond: 'rgba(120,135,145,.95)', couleur: '#05080c' });
  return L;
}
