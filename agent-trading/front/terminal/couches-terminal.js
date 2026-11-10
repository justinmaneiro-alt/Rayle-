/* ═════════════ TERMINAL : COUCHES DU GRAPHIQUE ET MÉMOIRE PAR ACTIF (pur, testé) ═════════════
   Le graphique est VIERGE par défaut (bougies, prix, volume discret). Chaque couche s'ajoute par le panneau « Couches » ; le choix est
   mémorisé PAR ACTIF sur l'appareil (localStorage « rayle_term_couches_<ACTIF> »). */
export const COUCHES = Object.freeze([
  { id: 'volume', nom: 'Volume', groupe: 'Base', defaut: true },
  { id: 'ma200', nom: 'SMA 200 de l’unité affichée', groupe: 'Moyennes', defaut: false },
  { id: 'ma200H1', nom: 'SMA 200 H1 (sur toutes les unités)', groupe: 'Moyennes', defaut: false },
  { id: 'ma200J', nom: 'SMA 200 Jour (sur toutes les unités)', groupe: 'Moyennes', defaut: false },
  { id: 'sr', nom: 'Supports et résistances automatiques', groupe: 'Niveaux', defaut: false },
  { id: 'liquidite', nom: 'Liquidités (plus hauts / bas non balayés)', groupe: 'Niveaux', defaut: false },
  { id: 'zonesVol', nom: 'Zones de réaction (profil de volume)', groupe: 'Niveaux', defaut: false },
  { id: 'chaleur', nom: 'Carte de chaleur du carnet (enregistrée depuis l’activation)', groupe: 'Carnet', defaut: false },
  { id: 'fleches', nom: 'Flèches et croix de mes outils', groupe: 'Mes outils', defaut: true },
  { id: 'outils', nom: 'Mes dessins', groupe: 'Mes outils', defaut: true },
  { id: 'positions', nom: 'Mes positions', groupe: 'Mes outils', defaut: true },
  { id: 'motifs', nom: 'Motifs de bougies (lecture, pas un signal)', groupe: 'Lecture', defaut: false },
  { id: 'evenements', nom: 'Régime et événements sur mes niveaux', groupe: 'Lecture', defaut: false },
  { id: 'carnetBougie', nom: 'Bougie du carnet d’ordres et delta', groupe: 'Carnet', defaut: false },
  { id: 'cvd', nom: 'CVD (delta cumulé)', groupe: 'Institutionnel', defaut: false },
  { id: 'profilVolume', nom: 'Profil de volume (POC, VAH, VAL)', groupe: 'Institutionnel', defaut: false },
  { id: 'vwap', nom: 'VWAP de séance', groupe: 'Institutionnel', defaut: false },
  { id: 'vwapAncre', nom: 'VWAP ancré (clic sur une bougie)', groupe: 'Institutionnel', defaut: false },
  { id: 'extremes', nom: 'Plus haut / bas de la veille et de la semaine', groupe: 'Institutionnel', defaut: false },
  { id: 'seances', nom: 'Plages Asie / Londres / New York', groupe: 'Institutionnel', defaut: false },
  { id: 'rondes', nom: 'Niveaux ronds', groupe: 'Institutionnel', defaut: false },
  { id: 'scenarios', nom: 'Scénarios de Rayle', groupe: 'Rayle', defaut: true }
]);
export const IDS_COUCHES = Object.freeze(COUCHES.map(c => c.id));
export const defauts = () => Object.fromEntries(COUCHES.map(c => [c.id, c.defaut]));
const cle = actif => 'rayle_term_couches_' + actif;
export function lireCouches(actif, store = globalThis.localStorage) {
  const d = defauts(); try { const v = store && store.getItem(cle(actif)); if (v) { const o = JSON.parse(v); for (const k of IDS_COUCHES) if (typeof o[k] === 'boolean') d[k] = o[k]; } } catch (e) { /* valeur corrompue : défauts */ }
  return d;
}
export function ecrireCouches(actif, c, store = globalThis.localStorage) {
  const o = {}; for (const k of IDS_COUCHES) if (typeof c[k] === 'boolean') o[k] = c[k];
  try { store && store.setItem(cle(actif), JSON.stringify(o)); } catch (e) { /* refusé */ }
  return o;
}
/* nom d'une couche dans une phrase (« affiche la MA200 », « masque les supports ») */
export function coucheDepuisTexte(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/(ma|sma|moyenne)\s*200.*(h1|horaire|heure)/.test(t)) return 'ma200H1';
  if (/(ma|sma|moyenne)\s*200.*(jour|journal|daily)/.test(t)) return 'ma200J';
  if (/(ma|sma|moyenne)\s*-?\s*200|moyenne mobile/.test(t)) return 'ma200';
  if (/support|resistance|niveaux auto/.test(t)) return 'sr';
  if (/liquidit/.test(t)) return 'liquidite';
  if (/zones? de (volume|reaction)|profil de volume|volume profile/.test(t)) return 'zonesVol';
  if (/chaleur|heatmap|bookmap/.test(t)) return 'chaleur';
  if (/fleche|croix/.test(t)) return 'fleches';
  if (/scenario/.test(t)) return 'scenarios';
  if (/position/.test(t)) return 'positions';
  if (/dessin|mes outils|mes traits|mes lignes/.test(t)) return 'outils';
  if (/\bvolume\b/.test(t)) return 'volume';
  return null;
}
