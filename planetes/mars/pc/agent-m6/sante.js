import { fraicheur, PAS } from './integrite.js';

/* ═════════════ PAGE « SANTÉ DE L'AGENT » (M6 ; module pur, testé : m6-fiabilite-test.mjs) ═════════════
   Rassemble en une vue : sources (fraîcheur, source utilisée, secours), intégrité des données, recoupement, recherche, sauvegardes, erreurs récentes, Veilleur.
   `entrees` est fourni par l'hôte (page ou Veilleur) ; ce module ne lit rien, ne calcule que le verdict. Un état INCONNU n'est jamais présenté comme bon. */
const RANG = { ko: 3, attention: 2, inconnu: 1, ok: 0, neutre: 0 };   // « neutre » = non activé : ce n'est pas une panne
const pire = liste => liste.reduce((p, e) => (RANG[e] > RANG[p] ? e : p), 'ok');

/* Journal d'erreurs borné (anneau). */
export function creerJournalErreurs(max = 100, maintenant = () => Date.now()) {
  const liste = [];
  return { ajouter(source, message) { liste.push({ t: maintenant(), source, message: String(message).slice(0, 240) }); if (liste.length > max) liste.shift(); }, recentes: (depuis = 0) => liste.filter(x => x.t >= depuis).slice(), tout: () => liste.slice(), vider: () => { liste.length = 0; } };
}

export function construireSante(e, maintenant = Date.now()) {
  const lignes = [];
  const ajouter = (groupe, nom, etat, detail, action = null) => lignes.push(action ? { groupe, nom, etat, detail, action } : { groupe, nom, etat, detail });
  for (const [id, p] of Object.entries(e.paires || {})) {
    if (!p || !p.n) { ajouter('Données', id, 'neutre', id + ' n’est pas encore activé : aucun historique téléchargé (ce n’est pas une panne).', { type: 'activer-paire', paire: id, libelle: 'Activer et charger l’historique' }); continue; }
    const f = fraicheur(p.derniere, maintenant, PAS.M15);
    ajouter('Données', id + ' · fraîcheur', f.etat, f.phrase + ' · source ' + (p.source || '?') + (p.secours ? ' (SECOURS : delta estimé)' : ''));
    if (p.integrite) ajouter('Données', id + ' · intégrité', p.integrite.niveau, p.integrite.phrase);
    if (p.recoupement) ajouter('Données', id + ' · recoupement Kraken', p.recoupement.niveau, p.recoupement.phrase);
    else ajouter('Données', id + ' · recoupement Kraken', 'inconnu', 'pas encore fait (le Veilleur du PC ou le Worker est nécessaire : Kraken n’a pas de CORS)');
  }
  const r = e.recherche;
  if (r) {
    const etat = r.enCours ? 'ok' : r.pause ? 'attention' : r.objectifAtteint ? 'ok' : 'attention';
    ajouter('Recherche', 'Recherche sans fin', etat, (r.enCours ? 'en cours' : r.pause ? 'en pause' : r.objectifAtteint ? 'objectif atteint' : 'à l’arrêt') + ' · ' + (r.N != null ? r.N.toLocaleString('fr-FR') + ' variantes testées' : '') + (r.majLe ? ' · dernière tranche il y a ' + Math.round((maintenant - r.majLe) / 60e3) + ' min' : ''));
    if (r.stagnation) ajouter('Recherche', 'Stagnation', r.stagnation.stagne ? 'attention' : 'ok', r.stagnation.phrase);
  }
  if (e.sauvegardes) {
    const s = e.sauvegardes, age = s.derniere ? (maintenant - s.derniere) / 3600e3 : null;
    ajouter('Sauvegardes', 'Sauvegardes automatiques', s.corrompues ? 'attention' : age == null ? 'inconnu' : age < 36 ? 'ok' : 'attention', age == null ? 'aucune sauvegarde' : s.n + ' sauvegarde(s), la dernière il y a ' + Math.round(age) + ' h' + (s.corrompues ? ' · ' + s.corrompues + ' CORROMPUE(S) détectée(s)' : ''));
  }
  if (e.veilleur) ajouter('Veilleur', 'Veilleur du PC', e.veilleur.actif ? 'ok' : 'inconnu', e.veilleur.actif ? 'actif' + (e.veilleur.detail ? ' · ' + e.veilleur.detail : '') : 'non joint (l’agent travaille dans la page seulement)');
  if (e.gardien) ajouter('Gardien', 'Gardien prop', e.gardien.niveau === 'ROUGE' ? 'ko' : e.gardien.niveau === 'ORANGE' ? 'attention' : 'ok', e.gardien.phrase || e.gardien.niveau);
  const erreurs = (e.erreurs || []).filter(x => maintenant - x.t < 24 * 3600e3);
  ajouter('Erreurs', 'Erreurs des dernières 24 h', erreurs.length === 0 ? 'ok' : erreurs.length < 5 ? 'attention' : 'ko', erreurs.length ? erreurs.length + ' erreur(s) ; dernière : ' + erreurs[erreurs.length - 1].source + ' — ' + erreurs[erreurs.length - 1].message : 'aucune');
  if (e.causalite) ajouter('Fiabilité', 'Test du poison du futur', e.causalite.ok ? 'ok' : 'ko', e.causalite.phrase);
  const niveau = pire(lignes.map(l => l.etat));
  const compte = { ok: 0, attention: 0, ko: 0, inconnu: 0, neutre: 0 }; for (const l of lignes) compte[l.etat]++;
  return { niveau, lignes, compte, phrase: niveau === 'ok' ? 'Tout est en ordre.' : niveau === 'ko' ? compte.ko + ' point(s) en panne ou périmé(s) : l’agent ne doit pas être cru tant que ce n’est pas réglé.' : niveau === 'attention' ? compte.attention + ' point(s) à surveiller.' : 'Certains contrôles n’ont pas encore pu être faits.' };
}
