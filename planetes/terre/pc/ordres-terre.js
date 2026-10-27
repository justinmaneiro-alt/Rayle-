import { segmenter, sansMarqueurs } from './actus-sujets.js';

/* ═════════════ LA TERRE COMME OUTIL DE RAYLÉ ═════════════
   L'agent (Worker) décide d'un outil — afficher_terre, aller_a, afficher_actualites, expliquer_actualite, meteo — et renvoie à la page une action { type: 'terre', op, … }.
   Ici : `executer(action)` ouvre la galaxie si besoin, vole jusqu'à la Terre, puis montre ce qui est demandé (balises, cartes, bandeau, météo).
   `dire(reponse, speak, annule)` fait ensuite parler Raylé : sa réponse est découpée aux marqueurs [1], [2]… (jamais prononcés ni affichés) ; à chaque sujet, la caméra
   vole vers son lieu et la balise s'illumine pendant qu'elle l'explique. Sans marqueur, elle parle simplement. Fonctionne depuis l'accueil comme depuis n'importe quelle vue. */
const attendre = ms => new Promise(r => setTimeout(r, ms));
let presentation = null;   // { ids } : sujets dont Raylé va parler

async function jusqua(condition, max, pas = 120) { const t0 = Date.now(); while (Date.now() - t0 < max) { try { if (condition()) return true; } catch (e) {} await attendre(pas); } return false; }

/* Ouvre la galaxie, vole jusqu'à la Terre, attend l'orbite : renvoie window.Terre prêt à recevoir des ordres. */
export async function assurerTerre({ delai = 60000 } = {}) {
  const bus = window.RayleBus;
  if (!bus) throw new Error('Raylé n’est pas prête');
  if (bus.demander('vue') !== 'galaxie') await bus.demander('vue:ouvrir', 'galaxie');
  if (bus.demander('vue') !== 'galaxie') { const e = bus.etat('galaxie'); throw new Error((e && e.erreur) || 'la galaxie ne s’ouvre pas'); }
  if (!(await jusqua(() => window.Galaxie && window.Galaxie.enMarche && window.Galaxie.enMarche(), 20000))) throw new Error('la galaxie ne répond pas');
  const pret = () => window.Terre && window.Terre.etat().actif && window.Terre.etat().entree && !document.getElementById('terre-fondu').classList.contains('noir');   // entree : le vol d'arrivée en orbite est lancé (il ne doit pas écraser le nôtre)
  if (!pret()) {
    window.Galaxie.nav.allerA('terre', { entrer: true });
    if (!(await jusqua(pret, delai))) throw new Error('la Terre ne s’ouvre pas (module ou textures indisponibles)');
  }
  return window.Terre;
}

export async function executer(a) {
  const T = await assurerTerre();
  switch (a.op) {
    case 'afficher': return { ok: true };
    case 'aller': {
      const l = a.lieu || {}; if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon)) throw new Error('lieu sans coordonnées');
      T.aller({ nom: l.nom, lat: l.lat, lon: l.lon, distance: l.dist || 25 });
      return { ok: true };
    }
    case 'actualites': {
      const r = await T.afficherFil({ portee: a.portee, pays: a.pays, vue: a.vue, sujets: a.sujets, donnees: a.donnees });
      presentation = r.ok && a.sujets && a.sujets.length ? { ids: a.sujets.slice(), vue: a.vue || null } : null;
      return r;
    }
    case 'eclairer': {
      let r = { ok: true };
      if (!T.aSujet(a.id)) r = await T.afficherFil({ portee: 'monde', donnees: a.donnees, sujets: [a.id], vol: false });   // le sujet n'est pas sur la Terre en ce moment : on affiche le fil qui le contient
      if (T.aSujet(a.id)) { T.eclairerSujet(a.id); presentation = { ids: [a.id] }; }
      return r;
    }
    case 'evenements': return T.afficherEvenements({ types: a.types || null, severiteMin: a.severiteMin != null ? a.severiteMin : null });
    case 'meteo': return T.meteo(a.lat, a.lon, a.nom);
    default: throw new Error('action de la Terre inconnue : ' + a.op);
  }
}
export const enAttente = () => !!presentation;
export const propre = sansMarqueurs;

/* Raylé parle : l'introduction, puis chaque sujet pendant que la caméra le rejoint. annule() → true si l'utilisateur a coupé la parole. */
export async function dire(reponse, speak, annule = () => false) {
  const pres = presentation; presentation = null;
  const { intro, segments, propre: texte } = segmenter(reponse);
  try {
    if (!segments.length || !pres) { if (texte) await speak(texte); return; }
    if (intro) { await speak(intro); }
    for (const seg of segments) {
      if (annule()) return;
      const id = pres.ids[seg.n - 1];
      if (id && window.Terre) window.Terre.eclairerSujet(id);
      await speak(seg.texte);
    }
    if (pres.vue && window.Terre && !annule() && segments.length > 1) window.Terre.volerVers({ lon: pres.vue.lon, lat: pres.vue.lat, dist: pres.vue.dist, cap: 0, incl: 0 }, 2);   // à la fin, la caméra revient sur l'ensemble de la zone
  } finally { if (window.Terre && window.Terre.apaiserSujets) setTimeout(() => window.Terre.apaiserSujets(), 2500); }
}
export const annulerPresentation = () => { presentation = null; };
