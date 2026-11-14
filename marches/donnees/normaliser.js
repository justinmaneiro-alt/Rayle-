/* ═════════════ FORMAT COMMUN DES MESURES (RAYLE MARCHÉS) ═════════════
   Toute valeur affichée est une « mesure » : { id, libelle, valeur, unite, source, sourceId, url, horodatage, recuLe, frequence, fraicheur, retardSecondes, retardTexte, etat, note, precedente, serie }.
   Aucune valeur n'est inventée : sans valeur réelle, etat = 'indisponible' et valeur = null (jamais 0). Une dernière valeur connue est servie avec etat = 'perime' et sa date. */
export const FREQUENCES = Object.freeze({
  temps_reel: { etiquette: 'temps réel', perimeApres: 5 * 60 },
  differe: { etiquette: 'différé', perimeApres: 6 * 3600 },
  quotidien: { etiquette: 'quotidien', perimeApres: 5 * 86400 },     // week-end + jour férié
  hebdomadaire: { etiquette: 'hebdomadaire', perimeApres: 12 * 86400 },
  mensuel: { etiquette: 'mensuel', perimeApres: 95 * 86400 },
  palier: { etiquette: 'valable jusqu’à la prochaine décision', perimeApres: 400 * 86400 },
  evenement: { etiquette: 'à l\'événement', perimeApres: 14 * 86400 }
});

export function texteDuree(s) {
  if (s == null || !isFinite(s)) return 'inconnu';
  s = Math.max(0, Math.round(s));
  if (s < 90) return s + ' s';
  if (s < 5400) return Math.round(s / 60) + ' min';
  if (s < 2 * 86400) return Math.round(s / 3600) + ' h';
  if (s < 90 * 86400) return Math.round(s / 86400) + ' jours';
  return Math.round(s / 2629800) + ' mois';
}

const dateFr = iso => { const d = new Date(iso); if (isNaN(d)) return String(iso); const p = n => String(n).padStart(2, '0'); return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear(); };
export { dateFr };

/* Construit une mesure. `horodatage` = instant auquel la valeur est vraie (ISO ou ms) ; `recuLe` = instant de lecture. */
export function mesure({ id, libelle, valeur, unite = '', source, sourceId, url = '', horodatage, recuLe, frequence = 'quotidien', note = '', precedente = null, serie = null, delaiPublication = '' }, maintenant = Date.now()) {
  const f = FREQUENCES[frequence] ? frequence : 'quotidien';
  const t = horodatage == null ? NaN : (typeof horodatage === 'number' ? horodatage : Date.parse(horodatage));
  const ok = typeof valeur === 'number' && isFinite(valeur) && isFinite(t);
  const retard = ok ? Math.max(0, (maintenant - t) / 1000) : null;
  const perime = ok && retard > FREQUENCES[f].perimeApres;
  return {
    id, libelle, valeur: ok ? valeur : null, unite, source, sourceId, url,
    horodatage: ok ? new Date(t).toISOString() : null, recuLe: new Date(recuLe == null ? maintenant : recuLe).toISOString(),
    frequence: f, fraicheur: FREQUENCES[f].etiquette, retardSecondes: retard, retardTexte: ok ? texteDuree(retard) : 'inconnu',
    delaiPublication, etat: ok ? (perime ? 'perime' : 'ok') : 'indisponible', note, precedente: typeof precedente === 'number' && isFinite(precedente) ? precedente : null, serie: Array.isArray(serie) ? serie : null
  };
}

/* Mesure « texte » (indice qualitatif, date de réunion…) : la valeur est une chaîne, mais source et horodatage restent obligatoires. */
export function mesureTexte({ id, libelle, texte, source, sourceId, url = '', horodatage, recuLe, frequence = 'evenement', note = '' }, maintenant = Date.now()) {
  const t = horodatage == null ? NaN : (typeof horodatage === 'number' ? horodatage : Date.parse(horodatage));
  const ok = typeof texte === 'string' && texte.length > 0 && isFinite(t);
  const f = FREQUENCES[frequence] ? frequence : 'evenement';
  return { id, libelle, valeur: null, texte: ok ? texte : null, unite: '', source, sourceId, url, horodatage: ok ? new Date(t).toISOString() : null, recuLe: new Date(recuLe == null ? maintenant : recuLe).toISOString(),
    frequence: f, fraicheur: FREQUENCES[f].etiquette, retardSecondes: ok ? Math.max(0, (maintenant - t) / 1000) : null, retardTexte: ok ? texteDuree((maintenant - t) / 1000) : 'inconnu', etat: ok ? 'ok' : 'indisponible', note, precedente: null, serie: null };
}

export const indisponible = (id, libelle, source, sourceId, raison, maintenant = Date.now()) =>
  ({ id, libelle, valeur: null, unite: '', source, sourceId, url: '', horodatage: null, recuLe: new Date(maintenant).toISOString(), frequence: 'quotidien', fraicheur: 'indisponible', retardSecondes: null, retardTexte: 'inconnu', etat: 'indisponible', note: raison, precedente: null, serie: null });

/* Une mesure est « présentable » si elle porte source, horodatage (ou raison d'indisponibilité) et fraîcheur. Sert aux tests et à l'interface. */
export function presentable(m) {
  if (!m || !m.id || !m.source || !m.sourceId) return false;
  if (m.etat === 'indisponible') return !!m.note && m.valeur == null && m.texte == null;
  return !!m.horodatage && !isNaN(Date.parse(m.horodatage)) && !!m.fraicheur && (typeof m.valeur === 'number' || typeof m.texte === 'string');
}

/* Ligne de provenance affichée sous chaque chiffre : « Source : FRED · donnée du 12/11/2026 · publiée avec 1 jour de retard ». */
export function provenance(m) {
  if (!m) return 'Source inconnue';
  if (m.etat === 'indisponible') return 'Source : ' + m.source + ' · indisponible' + (m.note ? ' (' + m.note + ')' : '');
  const base = 'Source : ' + m.source + ' · donnée du ' + dateFr(m.horodatage) + ' · ' + (m.frequence === 'temps_reel' ? 'retard ' : 'âge ') + m.retardTexte + (m.delaiPublication ? ' · publiée ' + m.delaiPublication : '');
  return m.etat === 'perime' ? base + ' · PÉRIMÉ : dernière valeur connue' : base;
}
