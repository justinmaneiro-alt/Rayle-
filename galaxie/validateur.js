/* ═════════════ VALIDATION DES MANIFESTES ═════════════
   Module pur (aucune dépendance) : utilisé par la page ET par les tests Node (galaxie/tests/manifestes-test.mjs).
   Une planète se déclare uniquement par son manifeste `planetes/<id>/manifeste.json`.
   Un manifeste invalide est ignoré (avec la liste précise de ses erreurs) ; il ne casse jamais la galaxie. */

export const ETATS = ['active', 'en_attente'];
export const TYPES = ['soleil', 'planete'];
export const ROLES_AGENT = ['interprete', 'agent'];
export const APPAREILS = ['pc', 'tablette', 'telephone'];
export const QUALITES = ['basse', 'moyenne', 'haute'];
export const TYPES_VAISSEAU = ['arcadia', 'anatomie', 'lune'];   // vaisseaux en orbite et satellites naturels
export const VERSION_SCHEMA = 1;

const ID = /^[a-z][a-z0-9-]{1,31}$/;
const ACTION = /^[a-z][a-z0-9_]{1,39}$/;
const estObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = v => typeof v === 'string' && v.trim().length > 0;
const estNombre = v => typeof v === 'number' && Number.isFinite(v);
const CHEMIN = /^(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+$/;   // chemin relatif à la racine du site, sans « .. »

export function validerManifeste(m, idAttendu) {
  const erreurs = [], avertissements = [];
  const err = (chemin, msg) => erreurs.push(chemin + ' : ' + msg);
  const avert = (chemin, msg) => avertissements.push(chemin + ' : ' + msg);
  const connus = (obj, liste, chemin) => { if (estObjet(obj)) for (const k of Object.keys(obj)) if (!liste.includes(k)) avert(chemin ? chemin + '.' + k : k, 'champ inconnu (ignoré)'); };
  const texte = (v, chemin, requis = true) => { if (v === undefined) { if (requis) err(chemin, 'manquant'); return false; } if (!estTexte(v)) { err(chemin, 'texte attendu'); return false; } return true; };
  const positif = (v, chemin, requis = true) => { if (v === undefined) { if (requis) err(chemin, 'manquant'); return false; } if (!estNombre(v) || v <= 0) { err(chemin, 'nombre strictement positif attendu'); return false; } return true; };
  const nombre = (v, chemin) => { if (v !== undefined && !estNombre(v)) err(chemin, 'nombre attendu'); };
  const alias = (v, c) => { if (v !== undefined && (!Array.isArray(v) || v.some(x => !estTexte(x)))) err(c, 'liste de textes attendue (noms alternatifs prononcés à voix haute)'); };
  const chemin = (v, chemin_, requis = true) => { if (!texte(v, chemin_, requis)) return; if (!CHEMIN.test(v)) err(chemin_, 'chemin relatif invalide (« ' + v + ' »)'); };

  if (!estObjet(m)) return { ok: false, erreurs: ['le manifeste doit être un objet JSON'], avertissements, manifeste: null };
  connus(m, ['schema', 'id', 'type', 'nom', 'alias', 'theme', 'etat', 'orbite', 'apparence', 'satellites', 'modules', 'agents', 'ordres', 'donnees', 'licences'], '');

  if (m.schema !== undefined && m.schema !== VERSION_SCHEMA) err('schema', 'version ' + m.schema + ' non gérée (attendu ' + VERSION_SCHEMA + ')');
  if (!estTexte(m.id) || !ID.test(m.id)) err('id', 'identifiant invalide (minuscules, chiffres et tirets, 2 à 32 caractères)');
  else if (idAttendu && m.id !== idAttendu) err('id', 'doit correspondre au dossier (« ' + idAttendu + ' »), trouvé « ' + m.id + ' »');
  const type = m.type === undefined ? 'planete' : m.type;
  if (!TYPES.includes(type)) err('type', 'valeur permise : ' + TYPES.join(', '));
  texte(m.nom, 'nom'); texte(m.theme, 'theme'); alias(m.alias, 'alias');
  if (!ETATS.includes(m.etat)) err('etat', 'valeur permise : ' + ETATS.join(', '));

  // ── Orbite (les planètes seulement)
  if (type === 'planete') {
    if (!estObjet(m.orbite)) err('orbite', 'objet attendu (distance, periode)');
    else {
      connus(m.orbite, ['distance', 'periode', 'phase'], 'orbite');
      positif(m.orbite.distance, 'orbite.distance'); positif(m.orbite.periode, 'orbite.periode'); nombre(m.orbite.phase, 'orbite.phase');
    }
  } else if (m.orbite !== undefined) avert('orbite', 'inutile pour le soleil (ignoré)');

  // ── Apparence
  const a = m.apparence;
  if (!estObjet(a)) err('apparence', 'objet attendu (rayon…)');
  else {
    connus(a, ['rayon', 'rotation', 'tilt', 'texture', 'nuit', 'nuages', 'atmosphere', 'anneaux'], 'apparence');
    positif(a.rayon, 'apparence.rayon'); nombre(a.rotation, 'apparence.rotation'); nombre(a.tilt, 'apparence.tilt');
    if (type === 'planete') chemin(a.texture, 'apparence.texture'); else chemin(a.texture, 'apparence.texture', false);
    chemin(a.nuit, 'apparence.nuit', false); chemin(a.nuages, 'apparence.nuages', false);
    if (a.nuit !== undefined && a.texture === undefined) err('apparence.nuit', 'demande aussi apparence.texture');
    if (a.atmosphere !== undefined) {
      if (!estObjet(a.atmosphere)) err('apparence.atmosphere', 'objet attendu (couleur, force)');
      else {
        connus(a.atmosphere, ['couleur', 'force', 'crepuscule', 'epaisseur'], 'apparence.atmosphere');
        positif(a.atmosphere.epaisseur, 'apparence.atmosphere.epaisseur', false);
        const c = a.atmosphere.couleur;
        if (!Array.isArray(c) || c.length !== 3 || c.some(x => !estNombre(x) || x < 0 || x > 1)) err('apparence.atmosphere.couleur', 'trois nombres entre 0 et 1 attendus');
        positif(a.atmosphere.force, 'apparence.atmosphere.force');
        const cr = a.atmosphere.crepuscule;
        if (cr !== undefined && (!Array.isArray(cr) || cr.length !== 3 || cr.some(x => !estNombre(x) || x < 0 || x > 1))) err('apparence.atmosphere.crepuscule', 'trois nombres entre 0 et 1 attendus');
      }
    }
    if (a.anneaux !== undefined) {
      if (!estObjet(a.anneaux)) err('apparence.anneaux', 'objet attendu (interieur, exterieur, texture)');
      else {
        connus(a.anneaux, ['interieur', 'exterieur', 'texture'], 'apparence.anneaux');
        positif(a.anneaux.interieur, 'apparence.anneaux.interieur'); positif(a.anneaux.exterieur, 'apparence.anneaux.exterieur'); chemin(a.anneaux.texture, 'apparence.anneaux.texture');
        if (estNombre(a.anneaux.interieur) && estNombre(a.anneaux.exterieur) && a.anneaux.exterieur <= a.anneaux.interieur) err('apparence.anneaux', 'exterieur doit dépasser interieur');
        if (estNombre(a.anneaux.interieur) && estNombre(a.rayon) && a.anneaux.interieur <= a.rayon) err('apparence.anneaux.interieur', 'doit dépasser le rayon de la planète');
      }
    }
  }

  // ── Satellites (vaisseaux en orbite)
  const vus = new Set();
  if (m.satellites !== undefined) {
    if (!Array.isArray(m.satellites)) err('satellites', 'liste attendue');
    else m.satellites.forEach((s, i) => {
      const c = 'satellites[' + i + ']';
      if (!estObjet(s)) { err(c, 'objet attendu'); return; }
      connus(s, ['id', 'nom', 'alias', 'theme', 'type', 'orbite', 'periode', 'rayon', 'texture'], c);
      texte(s.theme, c + '.theme', false);
      if (s.type === 'lune') { positif(s.rayon, c + '.rayon'); chemin(s.texture, c + '.texture'); }
      else if (s.rayon !== undefined || s.texture !== undefined) avert(c, 'rayon et texture ne servent qu’aux satellites de type « lune »');
      alias(s.alias, c + '.alias');
      if (!estTexte(s.id) || !ID.test(s.id)) err(c + '.id', 'identifiant invalide'); else if (vus.has(s.id)) err(c + '.id', 'doublon « ' + s.id + ' »'); else vus.add(s.id);
      texte(s.nom, c + '.nom');
      if (!TYPES_VAISSEAU.includes(s.type)) err(c + '.type', 'valeur permise : ' + TYPES_VAISSEAU.join(', '));
      positif(s.orbite, c + '.orbite'); positif(s.periode, c + '.periode');
      if (estNombre(s.orbite) && estObjet(a) && estNombre(a.rayon) && s.orbite <= a.rayon) err(c + '.orbite', 'doit dépasser le rayon de la planète');
    });
  }

  // ── Modules par appareil
  if (m.modules !== undefined) {
    if (!estObjet(m.modules)) err('modules', 'objet attendu (pc, tablette, telephone)');
    else {
      connus(m.modules, APPAREILS, 'modules');
      for (const k of APPAREILS) if (m.modules[k] !== undefined) {
        const mod = m.modules[k], c = 'modules.' + k;
        if (!estObjet(mod)) { err(c, 'objet attendu'); continue; }
        connus(mod, ['entree', 'qualite_min'], c);
        chemin(mod.entree, c + '.entree');
        if (mod.qualite_min !== undefined && !QUALITES.includes(mod.qualite_min)) err(c + '.qualite_min', 'valeur permise : ' + QUALITES.join(', '));
      }
    }
  }
  if (type === 'planete' && m.etat === 'active') {
    if (!estObjet(m.modules) || !m.modules.pc) avert('modules.pc', 'une planète active devrait déclarer son module PC');
  }

  // ── Agents
  const roles = [];
  if (m.agents !== undefined) {
    if (!Array.isArray(m.agents)) err('agents', 'liste attendue');
    else {
      const ids = new Set();
      m.agents.forEach((g, i) => {
        const c = 'agents[' + i + ']';
        if (!estObjet(g)) { err(c, 'objet attendu'); return; }
        connus(g, ['id', 'role', 'route'], c);
        if (!estTexte(g.id) || !ID.test(g.id)) err(c + '.id', 'identifiant invalide'); else if (ids.has(g.id)) err(c + '.id', 'doublon'); else ids.add(g.id);
        if (!ROLES_AGENT.includes(g.role)) err(c + '.role', 'valeur permise : ' + ROLES_AGENT.join(', ')); else roles.push(g.role);
        if (!estTexte(g.route) || !/^\/planete\/[a-z0-9-]+\/[a-z0-9-]+$/.test(g.route)) err(c + '.route', 'forme attendue : /planete/<id>/<nom>');
      });
    }
  }
  if (type === 'planete' && m.etat === 'active' && !roles.includes('interprete')) avert('agents', 'une planète active devrait avoir un interprète');
  if (roles.filter(r => r === 'interprete').length > 1) err('agents', 'un seul interprète par planète');

  // ── Ordres que Raylé peut donner
  if (m.ordres !== undefined) {
    if (!Array.isArray(m.ordres)) err('ordres', 'liste attendue');
    else {
      const actions = new Set();
      m.ordres.forEach((o, i) => {
        const c = 'ordres[' + i + ']';
        if (!estObjet(o)) { err(c, 'objet attendu'); return; }
        connus(o, ['action', 'description', 'params', 'disponible'], c);
        if (!estTexte(o.action) || !ACTION.test(o.action)) err(c + '.action', 'nom d’action invalide (minuscules, chiffres, tiret bas)'); else if (actions.has(o.action)) err(c + '.action', 'doublon « ' + o.action + ' »'); else actions.add(o.action);
        texte(o.description, c + '.description');
        if (o.disponible !== undefined && typeof o.disponible !== 'boolean') err(c + '.disponible', 'booléen attendu');
        if (o.params !== undefined) {
          if (!estObjet(o.params)) err(c + '.params', 'objet attendu (nom → liste de valeurs permises, ou "texte" / "nombre")');
          else for (const [k, v] of Object.entries(o.params)) {
            if (!ACTION.test(k)) err(c + '.params.' + k, 'nom de paramètre invalide');
            else if (!(Array.isArray(v) ? v.length > 0 && v.every(estTexte) : v === 'texte' || v === 'nombre')) err(c + '.params.' + k, 'liste de textes non vide, "texte" ou "nombre" attendu');
          }
        }
      });
    }
  }

  // ── Données lues et écrites
  if (m.donnees !== undefined) {
    if (!estObjet(m.donnees)) err('donnees', 'objet attendu (lit, ecrit)');
    else {
      connus(m.donnees, ['lit', 'ecrit'], 'donnees');
      for (const k of ['lit', 'ecrit']) if (m.donnees[k] !== undefined && (!Array.isArray(m.donnees[k]) || m.donnees[k].some(x => !estTexte(x)))) err('donnees.' + k, 'liste de textes attendue');
    }
  }
  // ── Licences
  if (m.licences !== undefined && (!Array.isArray(m.licences) || m.licences.some(x => !estTexte(x)))) err('licences', 'liste de textes attendue');
  if (type === 'planete' && estObjet(a) && (a.texture) && (!Array.isArray(m.licences) || !m.licences.length)) avert('licences', 'à renseigner : l’origine et la licence des textures');

  if (erreurs.length) return { ok: false, erreurs, avertissements, manifeste: null };
  return { ok: true, erreurs, avertissements, manifeste: normaliser(m, type) };
}

/* Valeurs par défaut et forme à plat utilisée par la scène 3D. */
function normaliser(m, type) {
  const a = m.apparence;
  return {
    id: m.id, type, nom: m.nom, alias: m.alias || [], theme: m.theme, etat: m.etat,
    entrable: type !== 'soleil',
    rayon: a.rayon, rotation: a.rotation ?? 0.1, tilt: a.tilt ?? 0,
    distance: type === 'planete' ? m.orbite.distance : 0, periode: type === 'planete' ? m.orbite.periode : 0, phase: type === 'planete' ? (m.orbite.phase ?? 0) : 0,
    texture: a.texture || null, nuit: a.nuit || null, nuages: a.nuages || null, atmosphere: a.atmosphere || null, anneaux: a.anneaux || null,
    satellites: (m.satellites || []).map(s => ({ ...s })),
    modules: m.modules || {}, agents: m.agents || [], ordres: (m.ordres || []).map(o => ({ params: {}, disponible: false, ...o })),
    donnees: { lit: [], ecrit: [], ...(m.donnees || {}) }, licences: m.licences || []
  };
}
