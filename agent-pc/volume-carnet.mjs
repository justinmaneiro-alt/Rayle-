// Vue du carnet d'ordres pour le tableau vivant V14 (lecture seule du carnet ENREGISTRÉ par le service) : échelle de profondeur, déséquilibre bid/ask à 0,1 / 0,25 / 0,5 / 1 %, murs avec taille et âge,
// heatmap compacte (type Bookmap) alignée sur le prix. Si le carnet manque, la vue le DIT (jamais d'écran vide sans explication). Murs « retirés » vs « absorbés » : voir strategies/liquidite/carte-chaleur.js.
import { dossierAgent } from './etat-agent.mjs';
import { stockageDe, joursCarnet } from './flux/analyse-liquidite.mjs';
import { construireCarte, echelleIntensite, detecterMurs, fiabiliteMur } from '../strategies/liquidite/carte-chaleur.js';
import { desequilibreCarnet } from '../strategies/liquidite/flux-indicateurs.js';

export const NIVEAUX_DESEQ = Object.freeze([0.1, 0.25, 0.5, 1]);
const PLANCHER = prix => (prix > 5000 ? 150000 : prix > 10 ? 25000 : 8000);

export function vueCarnet({ actif = 'BTC', venue = 'binance-spot', minutes = 180, dossier = dossierAgent(), maintenant = Date.now(), stockage = null, nCol = 72, nPrixHeat = 100 } = {}) {
  const cle = venue + '-' + actif, S = stockage || stockageDe(dossier), jours = joursCarnet(dossier, cle, maintenant);
  let donnees; try { donnees = S.lireProfondeur(cle, maintenant - minutes * 60e3, maintenant); } catch (e) { return { ok: false, raison: 'carnet illisible : ' + e.message, joursCarnet: jours }; }
  const recs = donnees && donnees.enregistrements || [];
  if (!recs.length) return { ok: false, raison: jours == null ? 'le carnet d’ordres n’est pas enregistré (service Kepler arrêté ?)' : 'aucune seconde de carnet dans les ' + minutes + ' dernières minutes', joursCarnet: jours };
  const e = donnees.entete, derniere = recs[recs.length - 1], mid = (derniere.meilleurBid + derniere.meilleurAsk) / 2, pasPct = e.pasPct;
  const deseq = {}, d = desequilibreCarnet(derniere, pasPct, NIVEAUX_DESEQ); for (const n of NIVEAUX_DESEQ) deseq['d' + n] = d['d' + n] ?? null;
  // échelle : 20 niveaux de 0,05 % de chaque côté
  const echelle = [], par = Math.max(1, Math.round(0.05 / pasPct));
  for (let k = 0; k < 20; k++) { let b = 0, a = 0; for (let j = k * par; j < Math.min(e.nTranches, (k + 1) * par); j++) { b += derniere.bid[j] || 0; a += derniere.ask[j] || 0; } echelle.push({ distancePct: +((k + 1) * 0.05).toFixed(2), bidUsd: Math.round(b), askUsd: Math.round(a) }); }
  const carte = construireCarte(donnees, { agregationS: Math.max(5, Math.round(minutes * 60 / nCol)), nPrix: nPrixHeat });
  let murs = [], heat = null;
  if (carte) {
    murs = detecterMurs(carte, { plancherUsd: PLANCHER(mid) }).filter(m => m.actif).slice(0, 8).map(m => ({ prix: m.prix, cote: m.cote, usdMax: Math.round(m.usdMax), ageS: m.dureeS, distancePct: +m.distancePct.toFixed(3), fiabilite: m.fiabilite ? m.fiabilite.niveau : null }));
    const ech = echelleIntensite(carte), chars = []; for (let i = 0; i < carte.nT; i++) for (let j = 0; j < carte.nPrix; j++) { const v = ech.intensite(carte.valeurs[i * carte.nPrix + j]); chars.push(Math.min(9, Math.round(v * 9))); }
    heat = { t0: carte.tSec[0] * 1000, dt: (carte.tSec[carte.nT - 1] - carte.tSec[0]) * 1000 / Math.max(1, carte.nT - 1), nT: carte.nT, nPrix: carte.nPrix, prixMin: carte.prixMin, pas: carte.pas, data: chars.join(''), mids: Array.from(carte.mid, x => +x.toPrecision(7)) };
  }
  return { ok: true, actif, venue, t: maintenant, prix: mid, joursCarnet: jours, secondes: recs.length, deseq, echelle, murs, heat, note: 'Carnet enregistré' + (jours != null ? ' depuis ' + jours.toFixed(1) + ' jour(s)' : '') + ' : les signaux de carnet ne sont validés qu’en avant, jamais sur 12 mois.' };
}
