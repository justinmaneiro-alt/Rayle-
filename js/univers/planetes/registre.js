// REGISTRE DES PLANÈTES : chaque planète est un module indépendant (un sous-dossier par planète dans js/univers/planetes/).
// Ce fichier est LÉGER : il ne contient que les métadonnées (nom, rôle, texture, taille, orbite, thème, agent, état). La scène intérieure d'une planète
// n'est importée qu'au moment d'y entrer (mount) ; en sortir (unmount) la détruit et libère sa mémoire.
//
// Entrée du registre (PLANETES[id]) :
//   id · alias[] · nom · role (ce qu'on y fait, ou null) · texture (modèle de chemin, {res} = 1k | 2k) · taille {rayonKm, rayonTerre} · orbite {a (UA), periodeJ, autour}
//   themeInterieur  { id, nom, vue } si la planète a une scène intérieure, sinon null          themePrevu  texte libre : thème envisagé (planètes encore vides)
//   agent           { id, nom, role, endpoint } : contrat d'agent, vide pour l'instant (voir agent.js)
//   etat            'actif' (scène intérieure installée) | 'pret' (« prêt à recevoir un thème »)        etatLibelle
//   mount(P, opts)  charge et entre dans la scène intérieure       unmount(P, opts)  en sort et la libère
// Ajouter un thème intérieur à une planète : écrire sa scène dans son dossier (ex. saturne/index.js), puis renseigner `interieur` ci-dessous. Rien d'autre.
import { ASTRES, ORDRE_PLANETES } from '../donnees/planetes.js?v=2026.10.15.6';
import { agentVide, validerAgent, estBranche } from './agent.js?v=2026.10.15.6';

const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const TERRE_KM = 6371;

// Définitions : seul ce qui n'est pas déjà dans les fiches ASTRES (donnees/planetes.js) est écrit ici. Les imports littéraux permettent le versionnage (?v=) et le chargement à la demande.
const DEF = {
  soleil:  { alias: ['soleil', 'sun', 'etoile'], role: null, texture: null, interieur: null, prevu: null, charger: () => import('./soleil/index.js?v=2026.10.15.6') },
  mercure: { alias: ['mercure', 'mercury'], role: null, texture: 'espace/mercure-{res}.webp', interieur: null, prevu: null, charger: () => import('./mercure/index.js?v=2026.10.15.6') },
  venus:   { alias: ['venus'], role: null, texture: 'espace/venus-{res}.webp', interieur: null, prevu: null, charger: () => import('./venus/index.js?v=2026.10.15.6') },
  terre:   { alias: ['terre', 'earth', 'planete terre', 'globe'], role: 'Carte du monde', texture: 'terre-jour-2048.jpg', interieur: { id: 'carte', nom: 'Carte du monde', vue: 'terre' }, prevu: null, charger: () => import('./terre/index.js?v=2026.10.15.6') },
  lune:    { alias: ['lune', 'moon'], role: null, texture: 'espace/lune-{res}.webp', interieur: null, prevu: null, autour: 'terre', charger: () => import('./lune/index.js?v=2026.10.15.6') },
  mars:    { alias: ['mars', 'planete mars'], role: 'Base martienne', texture: 'espace/mars-{res}.webp', interieur: { id: 'base', nom: 'Base martienne (atterrissage, rovers)', vue: 'mars' }, prevu: null, charger: () => import('./mars/index.js?v=2026.10.15.6') },
  jupiter: { alias: ['jupiter'], role: 'Base de code', texture: 'espace/jupiter-{res}.webp', interieur: null, prevu: 'base de code', charger: () => import('./jupiter/index.js?v=2026.10.15.6') },
  saturne: { alias: ['saturne', 'saturn'], role: 'Vaisseau', texture: 'espace/saturne-{res}.webp', interieur: null, prevu: 'vaisseau', charger: () => import('./saturne/index.js?v=2026.10.15.6') },
  uranus:  { alias: ['uranus'], role: null, texture: 'espace/uranus-{res}.webp', interieur: null, prevu: null, charger: () => import('./uranus/index.js?v=2026.10.15.6') },
  neptune: { alias: ['neptune'], role: null, texture: 'espace/neptune-{res}.webp', interieur: null, prevu: null, charger: () => import('./neptune/index.js?v=2026.10.15.6') },
};
export const ORDRE = ['soleil', 'mercure', 'venus', 'terre', 'lune', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune'];
export const ETATS = { actif: 'actif', pret: 'prêt à recevoir un thème' };

const modulesCharges = new Set();                 // ids dont la scène intérieure a été importée (test du chargement paresseux)
export const chargees = () => [...modulesCharges];

function creer(id) {
  const d = DEF[id], a = ASTRES[id];
  const p = {
    id, alias: d.alias.slice(), nom: a.nom.charAt(0).toUpperCase() + a.nom.slice(1), art: a.art, role: d.role, texture: d.texture,
    taille: { rayonKm: a.rayonKm, rayonTerre: +(a.rayonKm / TERRE_KM).toFixed(3) },
    orbite: { a: a.a, periodeJ: a.periodeJ, autour: d.autour || (id === 'soleil' ? null : 'soleil') },
    themeInterieur: d.interieur ? Object.assign({}, d.interieur) : null, themePrevu: d.prevu,
    agent: agentVide(),
    get etat() { return p.themeInterieur ? 'actif' : 'pret'; },
    get etatLibelle() { return ETATS[p.etat]; },
    textureUrl(res = '1k') { return p.texture ? p.texture.replace('{res}', res) : null; },
    async mount(P, opts = {}) {
      if (!p.themeInterieur) return { ok: false, pret: true, texte: phrasePret(p) };            // rien à charger : le module n'est même pas importé
      const m = await d.charger(); modulesCharges.add(id);
      const r = await (m.default || m).mount(P, opts);
      return Object.assign({ ok: true }, r);
    },
    async unmount(P, opts = {}) {
      if (!p.themeInterieur) return { ok: true, texte: '' };                                      // pas de scène intérieure : rien à quitter ni à libérer
      const m = await d.charger(); modulesCharges.add(id);                                         // (on peut être entré par une puce du menu sans être passé par mount)
      const r = await (m.default || m).unmount(P, opts);
      return Object.assign({ ok: true }, r);
    },
  };
  return p;
}
const phrasePret = p => 'Bientôt : ' + p.nom + ' est prête à recevoir un thème intérieur' + (p.themePrevu ? ' (prévu : ' + p.themePrevu + ')' : '') + ', mais rien n’y est encore installé. Tu peux en faire le tour de l’extérieur.';

export const PLANETES = Object.fromEntries(ORDRE.map(id => [id, creer(id)]));
export const liste = () => ORDRE.map(id => PLANETES[id]);

// « la planète Mars », « Jupiter », « Earth »… → entrée du registre ou null
export function trouver(nom) {
  const n = norm(nom).replace(/^(?:la |le |les |l )/, '').replace(/^planete /, '');
  if (!n) return null;
  for (const p of liste()) if (p.alias.some(x => x === n) || p.id === n) return p;
  return null;
}
// planète dont la scène intérieure est la vue `vue` du thème Espace (« terre », « mars »), sinon null
export const planeteDeVue = vue => liste().find(p => p.themeInterieur && p.themeInterieur.vue === vue) || null;

// Entre dans une planète : { ok, texte, pret? }. P = contexte partagé du thème Espace.
export async function entrer(nom, P, opts = {}) {
  const p = typeof nom === 'object' && nom ? nom : trouver(nom);
  if (!p) return { ok: false, texte: 'Je ne connais pas cette planète.' };
  const ici = planeteDeVue(P.vueNom());
  if (ici && ici.id === p.id) return { ok: true, texte: 'Tu es déjà dans ' + p.art + '.', dejaLa: true };
  const r = await p.mount(P, opts);
  annoncer(P.vueNom ? P.vueNom() : null);
  return r;
}
// Sort de la planète actuelle. opts.cible : ressortir devant cette planète ; sans cible : vue d'ensemble du système solaire.
export async function sortir(P, opts = {}) {
  const ici = planeteDeVue(P.vueNom());
  if (!ici) return { ok: true, texte: 'Tu es déjà dans le système solaire.', dejaLa: true };
  const r = await ici.unmount(P, opts);
  annoncer(P.vueNom ? P.vueNom() : null);
  return Object.assign({ ok: true }, r);
}
// « retour au système solaire » : depuis l'intérieur d'une planète, retour à la vue d'ensemble ; depuis le système, vue d'ensemble aussi.
export async function retourSysteme(P) {
  if (planeteDeVue(P.vueNom())) { await sortir(P, {}); return { ok: true, texte: 'Voici le système solaire.' }; }
  return { ok: true, texte: null, ensemble: true };
}

// État publié sur le bus (RayleBus.etat('planete')) : planète dont on est à l'intérieur, ou null
export function annoncer(vue) {
  const p = planeteDeVue(vue);
  try { window.RayleBus && RayleBus.fusion('planete', { interieur: p ? p.id : null, theme: p && p.themeInterieur ? p.themeInterieur.id : null }); } catch (e) { /* pas de bus (tests) */ }
  return p;
}

// Branchement futur d'un agent (Prompt 6) : valide le contrat, puis l'attache à la planète. Retourne { ok, erreurs }.
export function declarerAgent(id, agent) {
  const p = PLANETES[id]; if (!p) return { ok: false, erreurs: ['planète inconnue : ' + id] };
  const v = validerAgent(agent); if (!v.ok) return v;
  p.agent = agent === null ? agentVide() : Object.assign({}, agent);
  return v;
}
export { estBranche };

// Résumé lisible (docs, état injecté à l'IA) : une ligne par planète
export const resume = () => liste().map(p => p.nom + ' — ' + (p.role || 'sans rôle') + ' — ' + p.etatLibelle + (estBranche(p.agent) ? ' — agent ' + p.agent.nom : '')).join('\n');
export { ORDRE_PLANETES };
