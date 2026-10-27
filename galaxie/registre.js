import { validerManifeste, VERSION_SCHEMA } from './validateur.js';

/* ═════════════ REGISTRE DES CORPS CÉLESTES ═════════════
   `planetes/index.json` liste les identifiants (un site statique ne peut pas lister un dossier).
   Chaque corps a son manifeste : `planetes/<id>/manifeste.json`.
   Ajouter ou retirer une planète = un dossier + une ligne dans index.json ; le moteur 3D ne change pas. */

/* Normalisation des noms parlés : minuscules, sans accents ni ponctuation (la même que pour les commandes vocales). */
export const normaliserNom = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’'\-\/]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let memo = null;
/* Le registre est chargé une seule fois, puis partagé (galaxie 3D et commandes vocales). */
export function registre(racine) { return memo || (memo = chargerRegistre(racine).catch(e => { memo = null; throw e; })); }

export async function chargerRegistre(racine = document.baseURI) {
  const lire = async chemin => {
    const rep = await fetch(new URL(chemin, racine).href, { cache: 'no-cache' });
    if (!rep.ok) throw new Error(chemin + ' : ' + rep.status);
    return rep.json();
  };
  let index;
  try { index = await lire('planetes/index.json'); }
  catch (e) { throw new Error('registre introuvable (planetes/index.json) : ' + e.message); }
  if (!index || index.schema !== VERSION_SCHEMA || !Array.isArray(index.corps) || !index.corps.length) throw new Error('planetes/index.json invalide (schema ' + VERSION_SCHEMA + ' et liste « corps » attendus)');

  const resultats = await Promise.all(index.corps.map(async id => {
    try { return { id, ...validerManifeste(await lire('planetes/' + id + '/manifeste.json'), id) }; }
    catch (e) { return { id, ok: false, erreurs: ['lecture impossible : ' + e.message], avertissements: [], manifeste: null }; }
  }));

  const corps = [], problemes = [], vus = new Set();
  for (const r of resultats) {
    for (const a of r.avertissements) console.warn('[manifeste ' + r.id + '] ' + a);
    if (!r.ok) { problemes.push({ id: r.id, erreurs: r.erreurs }); console.error('[manifeste ' + r.id + '] ignoré :\n  ' + r.erreurs.join('\n  ')); continue; }
    // Identifiants uniques dans tout le système (corps et vaisseaux)
    const ids = [r.manifeste.id, ...r.manifeste.satellites.map(s => s.id)];
    const doublon = ids.find(i => vus.has(i));
    if (doublon) { problemes.push({ id: r.id, erreurs: ['identifiant « ' + doublon + ' » déjà utilisé par un autre corps'] }); continue; }
    ids.forEach(i => vus.add(i)); corps.push(r.manifeste);
  }
  if (corps.filter(c => c.type === 'soleil').length !== 1) throw new Error('le système doit avoir exactement un soleil (type « soleil »)');
  // Lexique : pour chaque cible (corps ou vaisseau), tous les noms qu'on peut prononcer
  const lexique = [];
  for (const c of corps) {
    lexique.push({ id: c.id, nom: c.nom, type: c.type, etat: c.etat, noms: [c.nom, ...c.alias].map(normaliserNom) });
    for (const s of c.satellites) lexique.push({ id: s.id, nom: s.nom, type: s.type === 'lune' ? 'lune' : 'vaisseau', etat: 'active', parent: c.id, noms: [s.nom, ...(s.alias || [])].map(normaliserNom) });
  }
  return {
    lexique,
    soleil: corps.find(c => c.type === 'soleil'),
    planetes: corps.filter(c => c.type === 'planete'),
    problemes,
    /* Tous les ordres de tous les corps, à plat : Raylé s'en servira comme outils (sous-prompt 4). */
    ordres: () => corps.flatMap(c => c.ordres.map(o => ({ cible: c.id, ...o })))
  };
}
