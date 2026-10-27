/* ═════════════ ENTRÉES DU PILOTE : clavier, souris, manette, joystick / HOTAS (pur : testé sous Node avec une manette simulée) ═════════════
   Transforme des lectures brutes en commandes de vol { trans: [droite, haut, avant], rot: [tangage, lacet, roulis], post, frein } (voir vol-calcul.js).
   Une manette (Gamepad API) est décrite par un PROFIL : pour chaque fonction un axe (ou deux boutons), avec inversion, zone morte, sensibilité, courbe et
   calibrage (centre, minimum, maximum) ; pour chaque action un bouton. Les profils sont enregistrés par identifiant de manette dans le stockage de l'appareil
   (clé rayle_saturne_commandes), jamais envoyés ailleurs. Aucune fonction ici ne touche au DOM. */

export const CLE_STOCKAGE = 'rayle_saturne_commandes';
export const FONCTIONS_AXES = ['avance', 'lateral', 'vertical', 'tangage', 'lacet', 'roulis', 'gaz'];
export const LIBELLES_AXES = { avance: 'Avant / arrière', lateral: 'Gauche / droite (translation)', vertical: 'Haut / bas (translation)', tangage: 'Tangage (nez haut / bas)', lacet: 'Lacet (nez gauche / droite)', roulis: 'Roulis', gaz: 'Manette des gaz (vitesse voulue)' };
export const ACTIONS_BOUTONS = ['postcombustion', 'frein', 'assistance', 'limiteur', 'vue', 'pilote_auto', 'se_lever_asseoir', 'salle_medicale', 'recentrer', 'ecran_commandes'];
export const LIBELLES_BOUTONS = { postcombustion: 'Postcombustion (maintenir)', frein: 'Frein', assistance: 'Assistance de vol (bascule)', limiteur: 'Limiteur de vitesse (bascule)', vue: 'Changer de vue', pilote_auto: 'Arrêter le pilote automatique', se_lever_asseoir: 'S’asseoir / se lever', salle_medicale: 'Salle médicale (bascule)', recentrer: 'Recentrer la vue', ecran_commandes: 'Afficher les commandes' };

/* ── mathématiques d'un axe ── */
export const lim = (v, a, b) => Math.max(a, Math.min(b, v));
/* Zone morte « douce » : rien sous le seuil, puis remontée linéaire jusqu'à 1 (pas de saut à la sortie de la zone). */
export const zoneMorte = (v, zm) => { const a = Math.abs(v); return a <= zm ? 0 : Math.sign(v) * (a - zm) / (1 - zm); };
/* Courbe de réponse : exposant 1 = linéaire ; 2 = fin autour du centre. */
export const courbe = (v, expo) => Math.sign(v) * Math.pow(Math.abs(v), expo);
/* Valeur brute de l'axe → [−1, 1] d'après le calibrage (la plupart des joysticks n'ont ni centre à 0 ni course complète). */
export function normaliser(brut, { centre = 0, min = -1, max = 1 } = {}) {
  if (!Number.isFinite(brut)) return 0;
  const haut = max - centre, bas = centre - min;
  const v = brut >= centre ? (haut > 1e-6 ? (brut - centre) / haut : 0) : (bas > 1e-6 ? -(centre - brut) / bas : 0);
  return lim(v, -1, 1);
}
/* Calibrage à partir de relevés : repos (centre = moyenne), puis extrêmes atteints par l'utilisateur. */
export function calibrer(repos, extremes) {
  const m = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const centre = repos.length ? m(repos) : 0;
  let mn = Math.min(...extremes, centre), mx = Math.max(...extremes, centre);
  if (mx - centre < 0.2) mx = centre + 1;            // course trop faible (axe non bougé) : on garde une plage utilisable
  if (centre - mn < 0.2) mn = centre - 1;
  return { centre, min: mn, max: mx };
}
export const valeurAxe = (brut, cfg) => {
  let v = normaliser(brut, cfg);
  if (cfg.inv) v = -v;
  v = zoneMorte(v, cfg.zm ?? 0.1);
  return lim(courbe(v, cfg.expo ?? 1) * (cfg.sens ?? 1), -1, 1);
};

/* ── profils ── */
const axeParDefaut = (axe, inv = false) => ({ axe, inv, zm: 0.12, sens: 1, expo: 1.4, centre: 0, min: -1, max: 1 });
/* Manette « standard » (Xbox, PlayStation) : sticks gauche = translation, sticks droit = rotation, gâchettes = haut / bas, épaules = roulis. */
export function profilStandard(id = '') {
  return {
    id, nom: 'Manette standard', type: 'standard',
    axes: { avance: axeParDefaut(1, true), lateral: axeParDefaut(0), lacet: axeParDefaut(2, true), tangage: axeParDefaut(3, true) },
    paires: { vertical: { haut: 7, bas: 6 }, roulis: { droite: 5, gauche: 4 } },   // boutons à valeur (gâchettes) ou épaules : −1…1 par paire
    boutons: { postcombustion: 0, frein: 1, assistance: 2, limiteur: 3, vue: 9, pilote_auto: 8, se_lever_asseoir: 12, salle_medicale: 13, recentrer: 10, ecran_commandes: 15 }
  };
}
/* Joystick / HOTAS : correspondance supposée (axes 0 roulis, 1 tangage, 2 lacet par torsion, 3 manette des gaz) ; à ajuster dans l'écran de réglage. */
export function profilJoystick(id = '') {
  return {
    id, nom: 'Joystick / HOTAS', type: 'joystick',
    axes: { roulis: axeParDefaut(0), tangage: axeParDefaut(1, true), lacet: axeParDefaut(2), gaz: { ...axeParDefaut(3, true), zm: 0.03, expo: 1 } },
    paires: {},
    boutons: { postcombustion: 0, frein: 1, assistance: 2, limiteur: 3, vue: 4, pilote_auto: 5, se_lever_asseoir: 6, salle_medicale: 7, recentrer: 8, ecran_commandes: 9 }
  };
}
export const profilPourManette = gp => (gp && gp.mapping === 'standard') || !gp ? profilStandard(gp && gp.id || '') : (gp.axes && gp.axes.length >= 4 && gp.buttons && gp.buttons.length < 12 ? profilJoystick(gp.id) : profilStandard(gp.id));

/* Nettoie un profil lu du stockage (jamais de valeur hors plage ni de champ inconnu) ; null si inutilisable. */
export function validerProfil(p) {
  if (!p || typeof p !== 'object') return null;
  const nombre = (v, d, a, b) => { v = Number(v); return Number.isFinite(v) ? lim(v, a, b) : d; };
  const axes = {};
  for (const f of FONCTIONS_AXES) {
    const a = p.axes && p.axes[f]; if (!a || !Number.isInteger(a.axe) || a.axe < 0 || a.axe > 31) continue;
    const centre = nombre(a.centre, 0, -1.5, 1.5);
    axes[f] = { axe: a.axe, inv: !!a.inv, zm: nombre(a.zm, 0.12, 0, 0.6), sens: nombre(a.sens, 1, 0.2, 3), expo: nombre(a.expo, 1.4, 1, 3), centre, min: Math.min(nombre(a.min, -1, -2, 2), centre - 0.1), max: Math.max(nombre(a.max, 1, -2, 2), centre + 0.1) };
  }
  const paires = {};
  for (const f of ['vertical', 'roulis', 'avance', 'lateral']) {
    const q = p.paires && p.paires[f]; if (!q) continue;
    const a = Object.keys(q); const cles = f === 'vertical' ? ['haut', 'bas'] : f === 'roulis' ? ['droite', 'gauche'] : f === 'avance' ? ['avant', 'arriere'] : ['droite', 'gauche'];
    const sortie = {}; for (const k of cles) if (Number.isInteger(q[k]) && q[k] >= 0 && q[k] < 64) sortie[k] = q[k];
    if (a.length) paires[f] = sortie;
  }
  const boutons = {};
  for (const b of ACTIONS_BOUTONS) if (p.boutons && Number.isInteger(p.boutons[b]) && p.boutons[b] >= 0 && p.boutons[b] < 64) boutons[b] = p.boutons[b];
  return { id: String(p.id || '').slice(0, 200), nom: String(p.nom || 'Manette').slice(0, 60), type: p.type === 'joystick' ? 'joystick' : 'standard', axes, paires, boutons };
}
export const STOCK_VIDE = () => ({ version: 1, global: { sensSouris: 1, sensManette: 1, inverserTangageSouris: false, assistanceDepart: true }, profils: {} });
export function lireStock(texte) {
  let o = null; try { o = JSON.parse(texte); } catch (e) { /* stockage absent ou illisible : valeurs par défaut */ }
  const s = STOCK_VIDE(); if (!o || typeof o !== 'object') return s;
  const g = o.global || {};
  s.global = { sensSouris: lim(Number(g.sensSouris) || 1, 0.2, 4), sensManette: lim(Number(g.sensManette) || 1, 0.2, 3), inverserTangageSouris: !!g.inverserTangageSouris, assistanceDepart: g.assistanceDepart !== false };
  for (const [k, v] of Object.entries(o.profils || {})) { const p = validerProfil(v); if (p) s.profils[String(k).slice(0, 200)] = p; }
  return s;
}
export const ecrireStock = s => JSON.stringify(s);

/* ── lecture d'une manette → commandes ──
   gp : { axes: number[], buttons: [{ pressed, value }] } (forme de l'API Gamepad) ; mem : objet conservé d'une image à l'autre (fronts montants des boutons) ;
   rend { trans, rot, post, frein, vitesseGaz (null ou 0…1), evenements: [noms d'actions déclenchées] }. */
export function lireManette(gp, profil, mem = {}, globalCfg = { sensManette: 1 }) {
  const r = { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: false, vitesseGaz: null, evenements: [] };
  if (!gp || !profil) return r;
  const ax = f => { const c = profil.axes[f]; return c && c.axe < gp.axes.length ? valeurAxe(gp.axes[c.axe], c) : 0; };
  const bouton = i => { const b = gp.buttons[i]; return b ? (typeof b.value === 'number' && b.value > 0 ? b.value : b.pressed ? 1 : 0) : 0; };
  const paire = (f, plus, moins) => { const q = profil.paires[f]; return q ? zoneMorte(bouton(q[plus] ?? -1) - bouton(q[moins] ?? -1), 0.05) : 0; };
  const s = globalCfg.sensManette || 1;
  const avance = ax('avance') + paire('avance', 'avant', 'arriere'), lateral = ax('lateral') + paire('lateral', 'droite', 'gauche');
  const vertical = ax('vertical') + paire('vertical', 'haut', 'bas');
  r.trans = [lim(lateral, -1, 1), lim(vertical, -1, 1), lim(avance, -1, 1)];
  r.rot = [lim(ax('tangage') * s, -1, 1), lim(ax('lacet') * s, -1, 1), lim((ax('roulis') + paire('roulis', 'droite', 'gauche')) * s, -1, 1)];
  const cg = profil.axes.gaz;
  if (cg && cg.axe < gp.axes.length) { const v = normaliser(gp.axes[cg.axe], cg) * (cg.inv ? -1 : 1); r.vitesseGaz = lim((v + 1) / 2, 0, 1); }   // manette des gaz : −1…1 → 0…1
  for (const [act, i] of Object.entries(profil.boutons)) {
    const p = !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.6));
    if (act === 'postcombustion') r.post = p; else if (act === 'frein') r.frein = p;
    else if (p && !mem['b' + i]) r.evenements.push(act);
    mem['b' + i] = p;
  }
  return r;
}

/* ── clavier ── (codes physiques : sur AZERTY, Z Q S D occupent les touches W A S D) ── */
export const CLAVIER = Object.freeze({
  avance: ['KeyW'], recule: ['KeyS'], gauche: ['KeyA'], droite: ['KeyD'], monte: ['KeyR', 'Space'], descend: ['KeyF'],
  tangageHaut: ['ArrowDown'], tangageBas: ['ArrowUp'], lacetGauche: ['ArrowLeft'], lacetDroite: ['ArrowRight'], rouleGauche: ['KeyQ'], rouleDroite: ['KeyE'],
  postcombustion: ['ShiftLeft', 'ShiftRight'], frein: ['KeyX'], assistance: ['KeyG'], limiteur: ['KeyL'], vue: ['KeyV'], pilote_auto: ['KeyP'], se_lever_asseoir: ['KeyH'], salle_medicale: ['KeyM'], recentrer: ['KeyC'], ecran_commandes: ['F1']
});
export const LIBELLES_CLAVIER = { avance: 'Avancer', recule: 'Reculer', gauche: 'Translation gauche', droite: 'Translation droite', monte: 'Monter', descend: 'Descendre', tangageHaut: 'Nez vers le haut', tangageBas: 'Nez vers le bas', lacetGauche: 'Nez à gauche', lacetDroite: 'Nez à droite', rouleGauche: 'Roulis à gauche', rouleDroite: 'Roulis à droite' };
export function lireClavier(touches /* Set de codes */, evenementsPrec = null) {
  const v = nom => CLAVIER[nom].some(c => touches.has(c)) ? 1 : 0;
  const trans = [v('droite') - v('gauche'), v('monte') - v('descend'), v('avance') - v('recule')];
  const rot = [v('tangageHaut') - v('tangageBas'), v('lacetGauche') - v('lacetDroite'), v('rouleDroite') - v('rouleGauche')];
  return { trans, rot, post: v('postcombustion') > 0, frein: v('frein') > 0 };
}
/* Souris (pointeur verrouillé) : déplacement en pixels sur l'image → rotation voulue (−1…1) ; la sensibilité et l'inversion viennent des réglages. */
export function lireSouris(dx, dy, dt, { sens = 1, inverser = false } = {}) {
  const k = 0.0016 * sens / Math.max(dt, 1 / 240);
  return [lim(dy * k * (inverser ? 1 : -1), -1, 1), lim(-dx * k, -1, 1), 0];
}

/* Somme des sources : on garde, par axe, la valeur de plus grande amplitude (pas d'addition qui dépasserait 1). */
export function fusionner(...sources) {
  const mx = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
  const sortie = { trans: [0, 0, 0], rot: [0, 0, 0], post: false, frein: false, vitesseGaz: null };
  for (const s of sources) {
    if (!s) continue;
    for (let i = 0; i < 3; i++) { sortie.trans[i] = mx(sortie.trans[i], s.trans ? s.trans[i] : 0); sortie.rot[i] = mx(sortie.rot[i], s.rot ? s.rot[i] : 0); }
    sortie.post = sortie.post || !!s.post; sortie.frein = sortie.frein || !!s.frein;
    if (s.vitesseGaz !== null && s.vitesseGaz !== undefined) sortie.vitesseGaz = s.vitesseGaz;
  }
  return sortie;
}

/* Tableau « schéma des commandes » affiché à l'écran : pour chaque fonction, la touche et le bouton de manette. */
export function schemaCommandes(profil = null) {
  const NOMS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Maj', ShiftRight: 'Maj', ControlLeft: 'Ctrl', Space: 'Espace' };
  const touches = c => CLAVIER[c] ? [...new Set(CLAVIER[c].map(k => NOMS[k] || k.replace(/^Key/, '')))].join(' / ') : '';
  const lignes = [];
  for (const [k, lib] of Object.entries(LIBELLES_CLAVIER)) lignes.push({ fonction: lib, clavier: touches(k), manette: '' });
  for (const b of ACTIONS_BOUTONS) lignes.push({ fonction: LIBELLES_BOUTONS[b], clavier: touches(b), manette: profil && profil.boutons[b] !== undefined ? 'bouton ' + profil.boutons[b] : '' });
  if (profil) for (const f of FONCTIONS_AXES) if (profil.axes[f]) { const l = lignes.find(x => x.fonction === LIBELLES_AXES[f]); const ligne = l || (lignes.push({ fonction: LIBELLES_AXES[f], clavier: '', manette: '' }), lignes[lignes.length - 1]); ligne.manette = 'axe ' + profil.axes[f].axe + (profil.axes[f].inv ? ' (inversé)' : ''); }
  lignes.push({ fonction: 'Regarder', clavier: 'souris (clic pour capturer, Échap pour libérer)', manette: '' });
  return lignes;
}
