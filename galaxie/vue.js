import { demarrer } from './galaxie.js';
import { registre as obtenirRegistre, normaliserNom } from './registre.js';
import { trouverCible } from './grammaire.js';

/* ═════════════ LA GALAXIE COMME VUE DE LA PAGE ═════════════
   Chargé à la demande par core/commun/vues.js (ouvrir / fermer). La scène 3D n'est créée qu'à la première ouverture
   et ne dessine plus rien quand la vue est fermée (pour ne pas peser sur le PC).
   Ici : le soleil suit l'état réel de Raylé, et les ordres « rayle/aller_a » et « rayle/retour » sont branchés sur le bus d'ordres. */
const bus = () => window.RayleBus;
let api = null, initEnCours = null, ouvert = false;

const ETATS_SOLEIL = { idle: 'idle', veille: 'veille', listening: 'listening', thinking: 'thinking', speaking: 'speaking' };

async function brancher(a) {
  // 1. Le soleil reflète Raylé
  let alerteJusqua = 0;
  const etatRayle = () => { const e = bus().etat('raylé'); return ETATS_SOLEIL[e && e.etat] || 'idle'; };
  a.soleil.etat(etatRayle());
  bus().on('raylé:etat', () => { if (!alerteJusqua) a.soleil.etat(etatRayle()); });
  bus().on('raylé:alerte', d => {
    alerteJusqua = Date.now() + (d.ms || 6000); a.soleil.etat('alerte');
    setTimeout(() => { if (Date.now() >= alerteJusqua - 50) { alerteJusqua = 0; a.soleil.etat(etatRayle()); } }, d.ms || 6000);
  });
  // 2. Mode jeu : réglage de toute l'application, la galaxie s'y plie
  bus().on('mode:jeu', d => a.modeJeu(!!(d && d.actif)));
  const mj = bus().etat('mode_jeu'); if (mj && mj.actif) a.modeJeu(true);
  // 3. État de la galaxie visible par les autres modules (voix, IA)
  const publier = () => bus().fusion('galaxie', { ouvert, ...a.nav.etat() });
  ['selection', 'vol', 'arrive', 'entree', 'sortie'].forEach(n => window.addEventListener('galaxie:' + n, publier));
  // 4. Mic : un bouton pour parler à Raylé depuis la galaxie
  document.getElementById('g-mic').addEventListener('click', () => bus().demander('rayle:conversation'));   // même chemin que le clic sur le soleil
  document.getElementById('g-retour').addEventListener('click', () => bus().demander('vue:fermer'));
  // 5. Ordres de Raylé
  const O = window.RayleOrdres;
  {
    const reg = await obtenirRegistre();
    O.declarer(reg.ordres());
    O.enregistrer('rayle', 'aller_a', async ({ cible }) => {
      const c = trouverCible(normaliserNom(cible), reg.lexique) || reg.lexique.find(x => x.id === cible);
      if (!c) return { ok: false, erreur: 'je ne connais pas « ' + cible + ' »' };
      if (bus().demander('vue') !== 'galaxie') await bus().demander('vue:ouvrir', 'galaxie');
      a.nav.allerA(c.id, { entrer: c.type !== 'soleil' });
      const nom = c.type === 'vaisseau' ? 'le ' + c.nom.toLowerCase() : c.type === 'lune' ? 'la ' + c.nom : c.nom;
      return { ok: true, texte: c.type === 'soleil' ? 'Me voici au cœur du système.' : c.etat === 'en_attente' ? 'Cap sur ' + nom + '. Elle attend encore d’être programmée.' : 'Cap sur ' + nom + '.' };
    });
    const phraseQualite = n => ({ auto: 'automatique', haute: 'haute', moyenne: 'moyenne', basse: 'basse' }[n]);
    const ouvrirGalaxie = async () => { if (bus().demander('vue') !== 'galaxie') await bus().demander('vue:ouvrir', 'galaxie'); };
    O.enregistrer('rayle', 'regler_qualite', async ({ niveau }) => {
      a.regler({ qualite: niveau });
      return { ok: true, texte: 'Qualité ' + phraseQualite(niveau) + (a.jeu() ? '. Elle s’appliquera à la sortie du mode jeu.' : '.') };
    });
    O.enregistrer('rayle', 'afficher_fps', async ({ etat }) => {
      a.regler({ afficherFps: etat === 'actif' });
      return { ok: true, texte: etat === 'actif' ? 'Le compteur d’images par seconde est affiché.' : 'Compteur d’images par seconde caché.' };
    });
    O.enregistrer('rayle', 'afficher_orbites', async ({ etat }) => {
      await ouvrirGalaxie();
      a.orbites(etat === 'actif');
      return { ok: true, texte: etat === 'actif' ? 'Voici les orbites.' : 'Orbites cachées.' };
    });
    O.enregistrer('rayle', 'afficher_reglages', async ({ etat }) => {
      await ouvrirGalaxie();
      if (etat === 'ouvrir') a.panneau.ouvrir(); else a.panneau.fermer();
      return { ok: true, texte: etat === 'ouvrir' ? 'Voici les réglages de la galaxie.' : 'Réglages fermés.' };
    });
    O.enregistrer('rayle', 'mesurer_performance', async () => {
      await ouvrirGalaxie();
      if (a.jeu()) return { ok: false, erreur: 'le mode jeu bride volontairement la galaxie : désactive-le d’abord' };
      const r = await a.banc((texte, avance) => { const e = document.getElementById('gp-banc-etat'); if (e) e.textContent = texte + ' (' + Math.round(avance * 100) + ' %)'; });
      if (!r.ok) return r;
      a.panneau.afficherResultat(r); a.panneau.ouvrir();
      return { ok: true, texte: r.texte };
    }, { delai: 60000 });
    O.enregistrer('rayle', 'retour', async () => {
      if (bus().demander('vue') !== 'galaxie') await bus().demander('vue:ouvrir', 'galaxie');
      a.nav.retour(); return { ok: true, texte: 'Retour à la vue d’ensemble.' };
    });
    // Mars : entrer et sortir de la base, bureau, heure (module léger chargé à la demande ; la planète elle-même ne se charge qu'au premier clic)
    try { const m = await import(new URL('planetes/mars/pc/ordres-mars.js', document.baseURI).href); m.brancher({ O, galaxie: a, ouvrirGalaxie }); }
    catch (e) { console.warn('ordres de Mars indisponibles :', e); }
    // Saturne : monter à bord du vaisseau d'anatomie, pilotage, salle médicale (même principe)
    try { const m = await import(new URL('planetes/saturne/pc/ordres-saturne.js', document.baseURI).href); m.brancher({ O, galaxie: a, ouvrirGalaxie }); }
    catch (e) { console.warn('ordres de Saturne indisponibles :', e); }
    // Neptune : atelier 3D (importer, fabriquer, présenter pièce par pièce)
    try { const m = await import(new URL('planetes/neptune/pc/ordres-neptune.js', document.baseURI).href); m.brancher({ O, galaxie: a, ouvrirGalaxie }); }
    catch (e) { console.warn('ordres de Neptune indisponibles :', e); }
  }
  try { if (window.RayleGalaxie) await window.RayleGalaxie.preparer(); } catch (e) { console.warn('ordres de base indisponibles :', e); }   // mode_jeu, enregistré côté application
  publier();
}

async function init() {
  if (api) return api;
  if (!initEnCours) initEnCours = demarrer().then(async a => { await brancher(a); api = a; return a; }).catch(e => { initEnCours = null; throw e; });
  return initEnCours;
}

export async function ouvrir() {
  ouvert = true;
  try { const a = await init(); if (ouvert) { a.reprendre(); bus().fusion('galaxie', { ouvert: true, erreur: null, ...a.nav.etat() }); } }
  catch (e) {
    console.error(e);
    ouvert = false;
    const message = 'La galaxie n’a pas pu démarrer (' + (e && e.message || e) + '). Rechargez la page avec Ctrl+F5 : des fichiers en cache sont peut-être périmés.';
    bus().fusion('galaxie', { ouvert: false, erreur: message });
    bus().emit('vue:erreur', { message });
    throw e;   // la vue ne reste pas ouverte à moitié (voir core/commun/vues.js)
  }
}
export function fermer() {
  ouvert = false;
  if (api) { api.pause(); bus().fusion('galaxie', { ouvert: false, ...api.nav.etat() }); }
}
