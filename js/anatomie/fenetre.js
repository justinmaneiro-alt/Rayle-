/* ═════════════ FENÊTRE « ANATOMIE & ORTHOPÉDIE » (vue plein écran, comme le terminal) ═════════════
   Chargée par js/commun/vues.js à la première ouverture. Exporte ouvrir() / fermer() ; tout l'état passe par le store (store.js). */
import { useAnatomieStore as S, actions as A, CALQUES } from './store.js?v=2026.10.13.6';
import { MoteurAnatomie, VUES } from './moteur.js?v=2026.10.13.6';
import * as R from './registre.js?v=2026.10.13.6';
import * as K from './cours.js?v=2026.10.13.6';
import { AMPUTATIONS, SCOLIOSE, FRACTURES, TYPES_FRACTURE, MATERIAUX, APPAREILLAGES, appareilsCompatibles } from './donnees-ortho.js?v=2026.10.13.6';
import { REPERES } from './donnees-os.js?v=2026.10.13.6';
import { GROUPES_OS, nomGroupe } from './groupes-os.js?v=2026.10.13.6';
import { chargerTHREE, webglDisponible, h, vider } from './outils.js?v=2026.10.13.6';
import { NIVEAUX, NOMS_NIVEAUX, lireNiveau, ecrireNiveau, detecterCapacites, niveauConseille } from './rendu.js?v=2026.10.13.6';
import { abonnerChargement, lireEtatChargement, lireManifeste, normaliserEntree, atlasListe } from './modeles-glb.js?v=2026.10.13.6';

const NOMS_CALQUES = { squelette: 'Squelette', muscles: 'Muscles', nerfs: 'Nerfs', organes: 'Organes', peau: 'Peau', reperes: 'Repères', dermatomes: 'Dermatomes' };
const COMBOS = [['Squelette + Muscles', ['squelette', 'muscles']], ['Muscles + Nerfs', ['muscles', 'nerfs']], ['Squelette + Nerfs', ['squelette', 'nerfs']], ['Tout', ['squelette', 'muscles', 'nerfs', 'organes']]];
const ONGLETS = [['structures', 'Structures'], ['amputations', 'Amputations'], ['deformations', 'Déformations'], ['fractures', 'Fractures'], ['appareillage', 'Appareillage'], ['reperes', 'Repères'], ['affichage', 'Affichage'], ['cours', 'Cours']];
const CALQUE_DE_TYPE = { os: 'squelette', muscle: 'muscles', nerf: 'nerfs', organe: 'organes', repere: 'reperes', dermatome: 'dermatomes' };

let desabonneGLB = null;
let racine = null, moteur = null, desabonne = null, monte = false, ouvert = false, tokenOuverture = 0;
const el = {};                // références DOM
let cleOnglet = '', liens = [];  // liens : champs numériques à resynchroniser sans tout redessiner

// ───────────────────────── squelette HTML ─────────────────────────
function monter() {
  if (monte) return; monte = true;
  racine = document.getElementById('vueAnatomie');
  vider(racine);
  el.boutonsCalques = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Calques' });
  el.combos = h('div', { class: 'an-chips an-combos', role: 'group', 'aria-label': 'Combinaisons' });
  el.vues = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Points de vue' }, Object.keys(VUES).map(v => h('button', { type: 'button', class: 'an-chip', onclick: () => moteur && moteur.vue(v) }, { face: 'Face', dos: 'Dos', gauche: 'Gauche', droite: 'Droite', dessus: 'Dessus' }[v])));
  el.onglets = h('div', { class: 'an-onglets', role: 'tablist' });
  el.panneau = h('div', { class: 'an-panneau', role: 'tabpanel' });
  el.canvas = h('canvas', { class: 'an-canvas', 'aria-label': 'Modèle 3D interactif : glisser pour tourner, molette pour zoomer, clic droit pour déplacer' });
  el.etiquettes = h('div', { class: 'an-etiquettes', 'aria-hidden': 'true' });
  el.isolation = h('div', { class: 'an-isolation', hidden: true });
  el.erreur = h('div', { class: 'an-erreur', hidden: true });
  el.chargement = h('div', { class: 'an-chargement', hidden: true, role: 'status', 'aria-live': 'polite' });
  el.fiche = h('div', { class: 'an-fiche' });
  el.dit = h('div', { class: 'an-dit', 'aria-live': 'polite' });
  el.question = h('input', { type: 'text', class: 'an-question', placeholder: 'Demander à Raylé… (« où s’insère le biceps ? »)', 'aria-label': 'Demander à Raylé', enterkeyhint: 'send' });
  el.question.addEventListener('keydown', ev => { if (ev.key === 'Enter' && el.question.value.trim()) { window.RayleBus && RayleBus.demander('rayle:demande', el.question.value.trim()); el.question.value = ''; } });
  const retour = h('button', { type: 'button', class: 'an-retour', title: 'Retour à Raylé', onclick: () => window.RayleBus && RayleBus.emit('vue:demande', { vue: 'rayle' }) }, '✕ Retour', h('span', { class: 'an-long' }, ' à Raylé'));
  racine.append(
    h('div', { class: 'an-barre' }, h('div', { class: 'an-marque' }, 'RAYLÉ', h('span', null, '//'), 'ANATOMIE & ORTHOPÉDIE'), el.boutonsCalques, retour),
    h('div', { class: 'an-sous-barre' }, el.combos, el.vues,
      h('button', { type: 'button', class: 'an-chip', onclick: () => { A.toutNormal(); A.selectionner(null); A.toutAfficher(); A.isolerGroupe(null); moteur && moteur.vue('face'); } }, '↺ Anatomie normale')),
    h('div', { class: 'an-corps' },
      h('aside', { class: 'an-gauche hud-cadre' }, el.onglets, el.panneau),
      h('main', { class: 'an-centre' }, el.canvas, el.etiquettes, el.isolation, el.chargement, el.erreur),
      h('aside', { class: 'an-droite hud-cadre' }, el.fiche)),
    h('div', { class: 'an-pied' }, el.dit, el.question,
      h('span', { class: 'an-avert' }, 'Outil pédagogique : modèle schématique, il ne remplace ni un diagnostic, ni une prescription, ni un orthoprothésiste.')));
  CALQUES.forEach(n => el.boutonsCalques.append(h('button', { type: 'button', class: 'an-chip an-calque', 'data-c': n, 'aria-pressed': 'false', onclick: () => A.basculerCalque(n) }, NOMS_CALQUES[n])));
  COMBOS.forEach(([t, l]) => el.combos.append(h('button', { type: 'button', class: 'an-chip', onclick: () => { A.seulementCalques(l); } }, t)));
  ONGLETS.forEach(([id, t]) => el.onglets.append(h('button', { type: 'button', role: 'tab', class: 'an-onglet', 'data-o': id, onclick: () => A.onglet(id) }, t)));
  desabonneGLB = abonnerChargement(majChargement); majChargement(lireEtatChargement());
  if (window.RayleBus) RayleBus.on('rayle:dit', d => { if (ouvert && d && d.kind === 'ray') el.dit.textContent = 'RAYLÉ › ' + String(d.text).slice(0, 260); });
}

// ───────────────────────── ouverture / fermeture ─────────────────────────
export async function ouvrir(options) {
  monter(); ouvert = true;
  const mon = ++tokenOuverture;
  const e0 = S.obtenir(); if (!e0.fenetre.ouverte) A.ouvrirFenetre(options && options.onglet);
  else if (options && options.onglet) A.onglet(options.onglet);
  if (!desabonne) desabonne = S.abonner(majEtat);
  cleOnglet = ''; majEtat(S.obtenir(), null);
  if (!webglDisponible()) { el.erreur.hidden = false; el.erreur.textContent = 'La 3D (WebGL) n’est pas disponible sur cet appareil : les fiches restent consultables à gauche et à droite.'; return; }
  el.erreur.hidden = true;
  try {
    const THREE = await chargerTHREE();
    if (mon !== tokenOuverture || !ouvert) return;
    if (moteur) moteur.dispose();
    moteur = new MoteurAnatomie(THREE, el.canvas, { store: S, etiquettes: el.etiquettes, surSelection: surClic, surSurvol: null });
    window.RayleAnatomieMoteur = moteur;
  } catch (e) {
    el.erreur.hidden = false; el.erreur.textContent = 'Le moteur 3D n’a pas pu démarrer : ' + (e && e.message || e) + ' (three.js se charge depuis Internet).';
  }
}
export function fermer() {
  ouvert = false; tokenOuverture++;
  if (moteur) { moteur.dispose(); moteur = null; window.RayleAnatomieMoteur = null; }
  if (desabonne) { desabonne(); desabonne = null; }
  A.fermerFenetre();
}
function surClic(sid) {
  if (sid) { A.selectionner(sid); } else if (!S.obtenir().isolation) A.selectionner(null);
}

// ───────────────────────── réactions à l'état ─────────────────────────
function majEtat(e, a) {
  if (!monte) return;
  el.boutonsCalques.querySelectorAll('.an-calque').forEach(b => { const on = !!e.calques[b.dataset.c]; b.classList.toggle('actif', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  el.onglets.querySelectorAll('.an-onglet').forEach(b => { const on = b.dataset.o === e.fenetre.onglet; b.classList.toggle('actif', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  const cle = cleDe(e);
  if (cle !== cleOnglet) { cleOnglet = cle; rendrePanneau(e); } else liens.forEach(l => l(e));
  if (!a || a.selection !== e.selection || a.masques !== e.masques || a.isolation !== e.isolation) rendreFiche(e);
  const sel = e.selection;
  el.isolation.hidden = !((e.isolation && sel) || e.isolationGroupe);
  if (e.isolationGroupe && !(e.isolation && sel)) {
    vider(el.isolation).append(h('b', null, 'Région isolée : ' + nomGroupe(e.isolationGroupe)),
      h('button', { type: 'button', class: 'an-chip' + (e.contexte ? ' actif' : ''), onclick: () => A.contexte() }, 'Garder le contexte'),
      h('button', { type: 'button', class: 'an-chip', onclick: () => A.isolerGroupe(null) }, '↩ Tout réafficher'));
  } else if (e.isolation && sel) {
    vider(el.isolation).append(h('b', null, 'Isolé : ' + R.nomAffiche(sel)),
      h('button', { type: 'button', class: 'an-chip' + (e.contexte ? ' actif' : ''), onclick: () => A.contexte() }, 'Garder le contexte'),
      h('button', { type: 'button', class: 'an-chip', onclick: () => A.quitterIsolation() }, '↩ Tout réafficher'));
  }
}
const cleDe = e => {
  const o = e.fenetre.onglet, p = e.pathologie;
  switch (o) {
    case 'structures': return [o, e.selection, filtreType, e.isolationGroupe].join('|');
    case 'amputations': return [o, JSON.stringify(p.amputation)].join('|');
    case 'deformations': return [o, p.scoliose ? p.scoliose.courbes.map(c => c.apex + c.convexite).join(',') + p.scoliose.lignesCobb : '-'].join('|');
    case 'fractures': return [o, p.fracture ? p.fracture.id + p.fracture.cote + p.fracture.type : '-'].join('|');
    case 'appareillage': return [o, JSON.stringify(p.amputation), p.scoliose ? 's' : '', p.fracture && p.fracture.id, e.appareillage.modele, JSON.stringify(e.appareillage.materiaux), e.appareillage.appuis, e.appareillage.forces].join('|');
    case 'reperes': return [o, e.selection, JSON.stringify(e.reperesAffiches)].join('|');
    case 'affichage': return [o, qualiteVersion, e.affichage.coupe.actif, e.affichage.coupe.axe, e.affichage.coupe.inverse, e.affichage.profondeurChamp].join('|');
    default: return o + '|' + coursVersion;
  }
};
function rendrePanneau(e) {
  liens = [];
  vider(el.panneau);
  const f = { affichage: pAffichage, structures: pStructures, amputations: pAmputations, deformations: pDeformations, fractures: pFractures, appareillage: pAppareillage, reperes: pReperes, cours: pCours }[e.fenetre.onglet] || pStructures;
  el.panneau.append(f(e));
  el.panneau.scrollTop = 0;
}
const gauche = (...c) => h('div', { class: 'an-section' }, ...c);
const titre = t => h('h3', { class: 'an-titre' }, t);
const note = t => h('p', { class: 'an-note-texte' }, t);
function bouton(t, fn, actif, cls) { return h('button', { type: 'button', class: 'an-chip' + (actif ? ' actif' : '') + (cls ? ' ' + cls : ''), 'aria-pressed': actif == null ? null : actif ? 'true' : 'false', onclick: fn }, t); }
function curseur({ label, min, max, pas, lire, ecrire, unite, fmt }) {
  const val = h('span', { class: 'an-val' }), inp = h('input', { type: 'range', min, max, step: pas || 1, 'aria-label': label });
  const set = e => { const v = lire(e); if (document.activeElement !== inp) inp.value = v; val.textContent = (fmt ? fmt(v) : v) + (unite || ''); };
  inp.addEventListener('input', () => { ecrire(+inp.value); val.textContent = (fmt ? fmt(+inp.value) : inp.value) + (unite || ''); });
  set(S.obtenir()); liens.push(set);
  return h('label', { class: 'an-curseur' }, h('span', null, label), inp, val);
}

// ───────────────────────── onglet Structures ─────────────────────────
let filtreType = 'tous';
function choisir(sid) {
  const t = R.typeDe(sid), c = CALQUE_DE_TYPE[t]; if (c && !S.obtenir().calques[c]) A.basculerCalque(c, true);
  A.selectionner(sid);
  if (moteur) setTimeout(() => moteur.focaliser(sid), 30);
}
function pStructures(e) {
  const champ = h('input', { type: 'search', class: 'an-recherche', placeholder: 'Rechercher : humérus, biceps, nerf sciatique, L4…', value: e.recherche, 'aria-label': 'Rechercher une structure' });
  const filtres = h('div', { class: 'an-chips' }, [['tous', 'Tout'], ['os', 'Os'], ['muscle', 'Muscles'], ['nerf', 'Nerfs'], ['organe', 'Organes']].map(([id, t]) => bouton(t, () => { filtreType = id; cleOnglet = ''; majEtat(S.obtenir(), null); }, filtreType === id)));
  const corps = h('div', { class: 'an-liste' });
  const remplir = ee => {
    vider(corps);
    const q = R.norm(champ.value), trouve = champ.value.trim() ? R.trouver(champ.value) : null;
    const defs = ['os', 'muscle', 'nerf', 'organe'].filter(t => filtreType === 'tous' || filtreType === t).flatMap(t => R.basesDe(t).map(b => ({ t, b, d: R.definition(b) })));
    const liste = defs.filter(x => !q || R.norm(x.d.nom + ' ' + (x.d.latin || '')).includes(q) || (trouve && trouve.base === x.b));
    const groupes = {}; liste.forEach(x => { const k = x.t === 'os' ? 'Os · ' + (x.d.region || 'Squelette') : { muscle: 'Muscles', nerf: 'Nerfs', organe: 'Organes' }[x.t]; (groupes[k] = groupes[k] || []).push(x); });
    if (!liste.length) corps.append(note('Aucune structure : essayez un autre mot (« humérus », « biceps », « L4 », « foie »).'));
    Object.keys(groupes).forEach(g => {
      corps.append(h('div', { class: 'an-groupe' }, g));
      groupes[g].forEach(x => {
        const sel = ee.selection && R.base(ee.selection) === x.b;
        const ligne = h('div', { class: 'an-ligne' + (sel ? ' actif' : '') });
        if (x.d.sym) ligne.append(h('span', { class: 'an-nom' }, x.d.nom), h('span', { class: 'an-cotes' }, ['D', 'G'].map(c => h('button', { type: 'button', class: 'an-mini' + (ee.selection === x.b + ':' + c ? ' actif' : ''), title: (c === 'D' ? 'Droit' : 'Gauche') + ' : ' + x.d.nom, onclick: () => choisir(x.b + ':' + c) }, c))));
        else ligne.append(h('button', { type: 'button', class: 'an-nom an-btn-nom', onclick: () => choisir(x.b) }, x.d.nom));
        corps.append(ligne);
      });
    });
  };
  champ.addEventListener('input', () => { A.recherche(champ.value); remplir(S.obtenir()); });   // seule la liste est refaite : le champ garde le focus
  remplir(e);
  const regions = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Isoler une région du squelette' }, GROUPES_OS.map(g => bouton(g.court, () => A.isolerGroupe(g.id), e.isolationGroupe === g.id)));
  return gauche(titre('Isoler une région'), regions, champ, filtres, corps);
}

// ───────────────────────── onglet Amputations ─────────────────────────
function pAmputations(e) {
  const am = e.pathologie.amputation, def = am && AMPUTATIONS.find(a => a.id === am.niveau);
  const cotes = h('div', { class: 'an-chips' }, [['D', 'Droite'], ['G', 'Gauche'], ['DG', 'Bilatérale']].map(([c, t]) => bouton(t, () => { cote = c; if (am) A.coteAmputation(c); cleOnglet = ''; majEtat(S.obtenir(), null); }, (am ? am.cote : cote) === c)));
  const bloc = (titreB, mb) => gauche(titre(titreB), h('div', { class: 'an-liste-btn' }, AMPUTATIONS.filter(a => a.membre === mb).map(a => h('button', { type: 'button', class: 'an-niveau' + (am && am.niveau === a.id ? ' actif' : ''), onclick: () => { A.amputation(a.id, am ? am.cote : cote); setTimeout(() => moteur && moteur.cadrerAmputation(a.id, S.obtenir().pathologie.amputation.cote), 0); } }, h('b', null, a.nom), h('small', null, a.famille)))));
  const fiche = def ? h('div', { class: 'an-detail' }, h('h4', null, def.nom), ligneInfo('Description', def.description), ligneInfo('Indications', def.indications), ligneInfo('Moignon', def.moignon), ligneInfo('À retenir', def.difficulte),
    h('div', { class: 'an-chips' }, bouton('Voir la prothèse →', () => { const m = appareilsCompatibles(S.obtenir().pathologie)[0]; if (m) A.appareil(m.id); A.onglet('appareillage'); }), bouton('Retirer l’amputation', () => A.amputation(null)))) : note('Choisissez un niveau d’amputation : les structures sont retirées de la zone, le moignon apparaît en rose.');
  return gauche(titre('Côté'), cotes, bloc('Membre inférieur', 'MI'), bloc('Membre supérieur', 'MS'), fiche);
}
let cote = 'D';
const ligneInfo = (l, v) => v ? h('p', { class: 'an-info' }, h('b', null, l + ' : '), v) : null;

// ───────────────────────── onglet Déformations (scoliose) ─────────────────────────
function pDeformations(e) {
  const s = e.pathologie.scoliose;
  const presets = h('div', { class: 'an-liste-btn' }, SCOLIOSE.presets.map(p => h('button', { type: 'button', class: 'an-niveau', title: p.note, onclick: () => { A.scoliose({ courbes: p.courbes }); A.seulementCalques(['squelette']); setTimeout(() => moteur && moteur.vue('dos', 'tronc'), 30); } }, h('b', null, p.nom), h('small', null, p.courbes.map(c => c.cobb + '°').join(' + ')))));
  const sortie = gauche(titre('Scolioses types'), presets);
  if (!s) return gauche(sortie, note('Choisissez une scoliose : le rachis, les côtes et la moelle se déforment en 3D (rotation vertébrale, gibbosité) et l’angle de Cobb est tracé.'),
    bouton('Courbure personnalisée', () => A.scoliose({ courbes: [{ apex: 'T8', cobb: 30, convexite: 'D' }] })));
  const courbes = s.courbes.map((c, i) => h('div', { class: 'an-courbe' },
    h('div', { class: 'an-courbe-tete' }, h('b', null, 'Courbure ' + (i + 1)), s.courbes.length > 1 ? bouton('✕', () => A.retirerCourbe(i), false, 'an-mini') : null),
    h('label', { class: 'an-champ' }, 'Vertèbre apicale', h('select', { onchange: ev => A.courbe(i, { apex: ev.target.value }) }, SCOLIOSE.apexListe.map(v => h('option', { value: v, selected: v === c.apex }, v)))),
    h('div', { class: 'an-chips' }, h('span', null, 'Convexité'), bouton('Droite', () => A.courbe(i, { convexite: 'D' }), c.convexite === 'D'), bouton('Gauche', () => A.courbe(i, { convexite: 'G' }), c.convexite === 'G')),
    curseur({ label: 'Angle de Cobb', min: 0, max: 90, lire: ee => ee.pathologie.scoliose && ee.pathologie.scoliose.courbes[i] ? ee.pathologie.scoliose.courbes[i].cobb : 0, ecrire: v => A.courbe(i, { cobb: v }), unite: '°' })));
  const grav = h('p', { class: 'an-info' });
  const majGrav = ee => { const sc = ee.pathologie.scoliose; if (!sc) return; const max = Math.max(...sc.courbes.map(c => c.cobb)), g = SCOLIOSE.gravite(max); grav.replaceChildren(h('b', null, 'Gravité : ' + g.niveau + ' (Cobb max ' + max + '°). '), g.conduite); };
  majGrav(e); liens.push(majGrav);
  return gauche(sortie, titre('Courbures'), courbes,
    s.courbes.length < 3 ? bouton('+ Ajouter une courbure', () => A.ajouterCourbe()) : null,
    h('label', { class: 'an-case' }, h('input', { type: 'checkbox', checked: s.lignesCobb, onchange: ev => S.definir(ee => ({ pathologie: Object.assign({}, ee.pathologie, { scoliose: Object.assign({}, ee.pathologie.scoliose, { lignesCobb: ev.target.checked }) }) })) }), ' Tracer les lignes de Cobb'),
    grav, ligneInfo('Mesure', SCOLIOSE.mesure), ligneInfo('Gibbosité', SCOLIOSE.gibbosite),
    h('div', { class: 'an-chips' }, bouton('Corset →', () => { const m = appareilsCompatibles(S.obtenir().pathologie)[0]; if (m) A.appareil(m.id); A.onglet('appareillage'); }), bouton('Retirer la scoliose', () => A.scoliose(null))));
}

// ───────────────────────── onglet Fractures ─────────────────────────
function pFractures(e) {
  const f = e.pathologie.fracture, def = f && FRACTURES.find(x => x.id === f.id);
  const lancer = p => { A.fracture(Object.assign({ id: p.id, cote: (f && f.cote) || coteFr, os: p.os, plan: p.plan }, { type: p.type, angulation: p.angulation || 0, decalage: p.decalage || 0, raccourcissement: p.raccourcissement || 0, rotation: p.rotation || 0 })); A.seulementCalques(['squelette']); setTimeout(() => { const sid = p.os[0].id.startsWith('vertebre-') ? p.os[0].id : p.os[0].id + ':' + ((S.obtenir().pathologie.fracture || {}).cote || 'D'); moteur && moteur.focaliser(sid); }, 80); };
  const liste = h('div', { class: 'an-liste-btn' }, FRACTURES.map(p => h('button', { type: 'button', class: 'an-niveau' + (f && f.id === p.id ? ' actif' : ''), onclick: () => lancer(p) }, h('b', null, p.nom), h('small', null, p.os[0].id.startsWith('vertebre-') ? 'Rachis' : p.os.length > 1 ? 'Deux os' : 'Un os'))));
  const cotes = h('div', { class: 'an-chips' }, [['D', 'Droite'], ['G', 'Gauche']].map(([c, t]) => bouton(t, () => { coteFr = c; if (f) A.reglerFracture({ cote: c }); cleOnglet = ''; majEtat(S.obtenir(), null); }, (f ? f.cote : coteFr) === c)));
  let controles = null;
  if (f && def && !def.os[0].id.startsWith('vertebre-')) {
    controles = gauche(
      h('label', { class: 'an-champ' }, 'Trait de fracture', h('select', { onchange: ev => A.reglerFracture({ type: ev.target.value }) }, TYPES_FRACTURE.map(t => h('option', { value: t.id, selected: t.id === f.type }, t.nom)))),
      curseur({ label: 'Angulation', min: -40, max: 40, lire: ee => ee.pathologie.fracture ? ee.pathologie.fracture.angulation : 0, ecrire: v => A.reglerFracture({ angulation: v }), unite: '°' }),
      curseur({ label: 'Décalage', min: 0, max: 40, lire: ee => ee.pathologie.fracture ? Math.round(ee.pathologie.fracture.decalage * 1000) : 0, ecrire: v => A.reglerFracture({ decalage: v / 1000 }), unite: ' mm' }),
      curseur({ label: 'Raccourcissement', min: 0, max: 50, lire: ee => ee.pathologie.fracture ? Math.round(ee.pathologie.fracture.raccourcissement * 1000) : 0, ecrire: v => A.reglerFracture({ raccourcissement: v / 1000 }), unite: ' mm' }),
      curseur({ label: 'Rotation axiale', min: -45, max: 45, lire: ee => ee.pathologie.fracture ? ee.pathologie.fracture.rotation : 0, ecrire: v => A.reglerFracture({ rotation: v }), unite: '°' }));
  }
  const detail = def ? h('div', { class: 'an-detail' }, h('h4', null, def.nom), ligneInfo('Classification', def.classification), ligneInfo('Mécanisme', def.mecanisme), ligneInfo('Déplacement', def.deplacement), ligneInfo('Traitement', def.traitement), ligneInfo('Complications', def.complications),
    h('div', { class: 'an-chips' }, def.appareillage.length ? bouton('Orthèse / immobilisation →', () => { const m = appareilsCompatibles(S.obtenir().pathologie)[0]; if (m) A.appareil(m.id); A.onglet('appareillage'); }) : null, bouton('Retirer la fracture', () => A.fracture(null)))) : note('Choisissez une fracture : l’os se casse en 3D (trait en rouge) et vous pouvez régler le déplacement des fragments.');
  return gauche(titre('Côté'), cotes, titre('Fractures types'), liste, controles, detail);
}
let coteFr = 'D';

// ───────────────────────── onglet Appareillage ─────────────────────────
function pAppareillage(e) {
  const compat = appareilsCompatibles(e.pathologie), ap = e.appareillage;
  if (!compat.length) return gauche(note('Choisissez d’abord une pathologie : une amputation, une scoliose ou une fracture. Les appareillages adaptés (prothèses, corsets, orthèses) apparaissent ici.'),
    h('div', { class: 'an-chips' }, bouton('Amputations', () => A.onglet('amputations')), bouton('Scoliose', () => A.onglet('deformations')), bouton('Fractures', () => A.onglet('fractures'))));
  const modele = ap.actif && APPAREILLAGES.find(m => m.id === ap.modele);
  const liste = h('div', { class: 'an-liste-btn' }, compat.map(m => h('button', { type: 'button', class: 'an-niveau' + (modele && modele.id === m.id ? ' actif' : ''), onclick: () => { A.appareil(modele && modele.id === m.id ? null : m.id); } }, h('b', null, m.nom), h('small', null, m.categorie))));
  const sortie = [gauche(titre('Appareillages adaptés'), liste)];
  if (modele) {
    sortie.push(gauche(h('p', { class: 'an-info' }, modele.description)));
    const mats = gauche(titre('Composants et matériaux'));
    modele.composants.forEach(c => {
      const courant = ap.materiaux[c.id] || c.defaut, m = MATERIAUX.find(x => x.id === courant);
      const sel = h('select', { 'aria-label': c.nom, onchange: ev => A.materiau(c.id, ev.target.value) }, c.choix.map(id => { const mm = MATERIAUX.find(x => x.id === id); return h('option', { value: id, selected: id === courant }, mm.nom); }));
      mats.append(h('div', { class: 'an-materiau' }, h('label', { class: 'an-champ' }, c.nom, sel), m ? h('div', { class: 'an-mat-info' }, h('span', { class: 'an-pastille', style: 'background:#' + m.couleur.toString(16).padStart(6, '0') }), h('small', null, m.famille + ' · ' + m.densite + ' g/cm³ · E ≈ ' + m.module + ' GPa'), h('p', null, m.usage), h('p', null, h('b', null, '+ '), m.avantages), h('p', null, h('b', null, '− '), m.limites)) : null));
    });
    sortie.push(mats);
    const opts = gauche(titre('Analyse'));
    opts.append(h('label', { class: 'an-case' }, h('input', { type: 'checkbox', checked: ap.appuis, onchange: ev => A.reglerAppareil({ appuis: ev.target.checked }) }), ' Points d’appui (orange) et zones de décharge (bleu)'));
    if (modele.pour.scoliose || modele.id === 'corset-jewett') opts.append(h('label', { class: 'an-case' }, h('input', { type: 'checkbox', checked: ap.forces, onchange: ev => A.reglerAppareil({ forces: ev.target.checked }) }), ' Forces de correction (flèches)'));
    if (modele.pour.scoliose) opts.append(curseur({ label: 'Correction en corset', min: 0, max: 70, lire: ee => ee.appareillage.correction, ecrire: v => A.reglerAppareil({ correction: v }), unite: ' %' }));
    opts.append(h('p', { class: 'an-info' }, h('b', null, 'Biomécanique : '), modele.biomecanique));
    if (modele.appuis && modele.appuis.length) opts.append(h('ul', { class: 'an-appuis' }, modele.appuis.map(a => h('li', { class: a.type }, h('b', null, (a.type === 'appui' ? 'Appui · ' : 'Décharge · ') + a.nom), ' — ' + a.note))));
    opts.append(ligneInfo('Précautions', modele.precautions), ligneInfo('Suivi', modele.niveauFrais));
    sortie.push(opts);
  } else sortie.push(note('Sélectionnez un appareillage pour le voir sur le modèle altéré.'));
  return gauche(...sortie);
}

// ───────────────────────── indicateur de chargement des modèles GLB ─────────────────────────
function majChargement(c) {
  if (!el.chargement) return;
  const actif = c.enCours > 0;
  el.chargement.hidden = !actif && !c.echecs;
  el.chargement.classList.toggle('an-charge-echec', !actif && c.echecs > 0);
  el.chargement.textContent = actif ? 'Chargement des modèles 3D… ' + c.termines + ' / ' + c.demandes
    : c.echecs ? 'Modèles 3D : ' + c.echecs + ' indisponible(s), formes schématiques utilisées' : '';
}

// ───────────────────────── onglet Affichage : qualité, transparence, coupe, profondeur de champ ─────────────────────────
let qualiteVersion = 0;
const AIDE_NIVEAUX = { eco: 'matériaux simples, aucune ombre : tablettes modestes, économie de batterie', standard: 'matériaux réalistes, éclairage de studio, ombres douces, reflets', haute: 'en plus : occlusion ambiante, bloom, vignettage, anticrénelage, profondeur de champ optionnelle' };
function changerQualite(n) {
  ecrireNiveau(n); qualiteVersion++;
  if (ouvert && webglDisponible()) ouvrir();          // recrée le moteur avec le nouveau niveau (le store garde tout l'état)
  else { cleOnglet = ''; majEtat(S.obtenir(), null); }
}
function pAffichage(e) {
  const cap = detecterCapacites(), niv = lireNiveau(false), conseil = niveauConseille(cap);
  const qualite = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Niveau de qualité' }, NIVEAUX.map(n => bouton(NOMS_NIVEAUX[n] + (n === conseil ? ' ★' : ''), () => { if (n !== niv) changerQualite(n); }, n === niv)));
  const calques = h('div', { class: 'an-opacites' }, CALQUES.filter(c => c !== 'reperes' && c !== 'dermatomes').map(c => curseur({
    label: NOMS_CALQUES[c], min: 0, max: 100, pas: 5, unite: ' %',
    lire: ee => Math.round(100 * (ee.affichage.opacites[c] !== undefined ? ee.affichage.opacites[c] : c === 'peau' ? .16 : 1)),
    ecrire: v => A.opaciteCalque(c, v / 100)
  })));
  const cp = e.affichage.coupe;
  const axes = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Axe de coupe' }, [['y', 'Horizontale'], ['x', 'Sagittale'], ['z', 'Frontale']].map(([a, t]) => bouton(t, () => A.coupe({ axe: a, actif: true, position: .5 }), cp.actif && cp.axe === a)));
  const manifeste = h('p', { class: 'an-note-texte' }, 'Modèles GLB : recherche en cours…');
  lireManifeste().then(m => {
    const n = m ? Object.keys(m).filter(k => normaliserEntree(m[k])).length : 0;
    atlasListe().then(l => { if (l.length) manifeste.textContent = 'Squelette réaliste : ' + l.map(a => a.fichier + ' (' + (a.licence || 'licence ?') + ', ' + (a.auteur || 'auteur ?') + ')').join(' ; ') + (n ? ' + ' + n + ' modèle(s) individuel(s)' : '') + '. Si un fichier manque, le suivant ou les formes schématiques prennent le relais.'; else
    manifeste.textContent = n ? n + ' modèle(s) GLB déclaré(s) dans ui/assets/anatomie/manifest.json ; en cas d’échec, la forme schématique est conservée.'
      : 'Aucun modèle GLB déclaré : formes schématiques générées par le code (voir docs/anatomie-3d.md pour en ajouter).';
    });
  });
  return gauche(
    titre('Qualité du rendu'), qualite,
    note(NOMS_NIVEAUX[niv] + ' : ' + AIDE_NIVEAUX[niv] + '. ★ = conseillé pour cet appareil (' + (cap.webgl2 ? 'WebGL2' : 'WebGL1') + (cap.memoire ? ', ' + cap.memoire + ' Go' : '') + (cap.coeurs ? ', ' + cap.coeurs + ' cœurs' : '') + ').'),
    bouton('Profondeur de champ (Haute)', () => A.profondeurChamp(), e.affichage.profondeurChamp),
    titre('Transparence par calque'), calques,
    titre('Transparence du squelette par région'),
    h('div', { class: 'an-opacites' }, GROUPES_OS.map(g => curseur({ label: g.court, min: 0, max: 100, pas: 5, unite: ' %',
      lire: ee => Math.round(100 * (ee.affichage.opacitesOs[g.id] !== undefined ? ee.affichage.opacitesOs[g.id] : 1)), ecrire: v => A.opaciteOs(g.id, v / 100) }))),
    titre('Plan de coupe'),
    h('div', { class: 'an-chips' }, bouton(cp.actif ? 'Coupe active' : 'Activer la coupe', () => A.coupe({ actif: !cp.actif }), cp.actif), bouton('Inverser', () => A.coupe({ inverse: !cp.inverse }), cp.inverse)),
    axes,
    curseur({ label: 'Position', min: 0, max: 100, pas: 1, unite: ' %', lire: ee => Math.round(ee.affichage.coupe.position * 100), ecrire: v => A.coupe({ position: v / 100, actif: true }) }),
    note('La coupe masque tout ce qui se trouve d’un côté du plan (les os restent creux, sans surface de section).'),
    titre('Modèles 3D'), manifeste);
}

// ───────────────────────── onglet Repères / palpation ─────────────────────────
function pReperes(e) {
  const ids = []; REPERES.forEach(r => (r.sym === false ? [null] : ['D', 'G']).forEach(c => ids.push('repere:' + r.id + (c ? ':' + c : ''))));
  const tous = bouton(e.reperesAffiches.length >= ids.length ? 'Masquer tous les repères' : 'Afficher tous les repères', () => { A.tousReperes(ids); if (!S.obtenir().calques.reperes) A.basculerCalque('reperes', true); }, e.calques.reperes);
  const corps = h('div', { class: 'an-liste' });
  const regions = [['Bassin et hanche', /eias|eips|crete-iliaque|trochanter|ischion|symphyse/], ['Genou, jambe et pied', /femur|patella|tuberosite-tibiale|fibula|crete-tibiale|malleole|calcaneus|5e-meta/], ['Épaule et bras', /acromion|scapula|coracoide|tubercule|humerus|olecrane|styloide/], ['Rachis et thorax', /^c7|epineuse|fourchette|louis|xiphoide|occipitale/]];
  regions.forEach(([nom, re]) => {
    corps.append(h('div', { class: 'an-groupe' }, nom));
    REPERES.filter(r => re.test(r.id)).forEach(r => {
      const c = r.sym === false ? null : cote, sid = 'repere:' + r.id + (c ? ':' + c : '');
      corps.append(h('div', { class: 'an-ligne' + (e.selection === sid ? ' actif' : '') }, h('button', { type: 'button', class: 'an-nom an-btn-nom', onclick: () => { if (!S.obtenir().calques.reperes) A.basculerCalque('reperes', true); A.selectionner(sid); moteur && moteur.focaliser(sid); } }, r.nom), r.sym === false ? null : h('span', { class: 'an-cotes' }, ['D', 'G'].map(cc => h('button', { type: 'button', class: 'an-mini' + (cote === cc ? ' actif' : ''), onclick: () => { cote = cc; cleOnglet = ''; majEtat(S.obtenir(), null); } }, cc)))));
    });
  });
  return gauche(note('La palpation : repérez les saillies osseuses sur le modèle. Les points s’affichent en cyan ; touchez-en un pour lire comment le palper.'), tous, corps);
}

// ───────────────────────── onglet Cours (base de connaissances) ─────────────────────────
let coursVersion = 0;
function pCours() {
  const liste = h('div', { class: 'an-liste' }, note('Chargement des cours…'));
  const titreI = h('input', { type: 'text', class: 'an-recherche', placeholder: 'Titre du cours (ex. Biomécanique du genou)', 'aria-label': 'Titre du cours' });
  const texteI = h('textarea', { class: 'an-zone', rows: 6, placeholder: 'Collez ici le texte de votre cours (le PDF doit d’abord être converti en texte).', 'aria-label': 'Texte du cours' });
  const msg = h('p', { class: 'an-info' });
  const fichier = h('input', { type: 'file', accept: '.txt,.md,.html,.htm,.json,.csv,text/*', multiple: true, hidden: true });
  const maj = async () => {
    try { const docs = await K.lister(); vider(liste); if (!docs.length) liste.append(note('Aucun cours enregistré. Ajoutez-en : Raylé s’en servira pour compléter ses explications d’anatomie, de clinique et d’appareillage.')); docs.forEach(d => liste.append(h('div', { class: 'an-ligne' }, h('span', { class: 'an-nom' }, d.titre, h('small', null, ' · ' + d.passages + ' passages · ' + Math.round(d.taille / 1000) + ' k car.')), bouton('Supprimer', async () => { await K.supprimer(d.id); coursVersion++; maj(); }, false, 'an-mini')))); }
    catch (e) { vider(liste).append(note('Cours indisponibles : ' + (e && e.message || e))); }
  };
  const ajouter = async () => { try { await K.ajouter({ titre: titreI.value, texte: texteI.value }); titreI.value = ''; texteI.value = ''; msg.textContent = 'Cours enregistré.'; maj(); } catch (e) { msg.textContent = e.message; } };
  fichier.addEventListener('change', async () => { for (const f of fichier.files) { try { const d = await K.importerFichier(f); msg.textContent = 'Importé : ' + d.titre; } catch (e) { msg.textContent = f.name + ' : ' + e.message; } } fichier.value = ''; maj(); });
  const essai = h('input', { type: 'search', class: 'an-recherche', placeholder: 'Tester la recherche : « insertion du biceps », « corset de Chêneau »…', 'aria-label': 'Tester la recherche dans les cours' });
  const res = h('div', { class: 'an-liste' });
  let tm = 0; essai.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => { const r = await K.chercher(essai.value, 3); vider(res); r.forEach(x => res.append(h('blockquote', { class: 'an-extrait' }, h('b', null, x.titre), h('p', null, x.texte.slice(0, 420))))); if (!r.length && essai.value.trim()) res.append(note('Aucun passage trouvé.')); }, 250); });
  maj();
  return gauche(titre('Mes cours'), liste, titre('Ajouter un cours'), titreI, texteI, h('div', { class: 'an-chips' }, bouton('Enregistrer', ajouter), bouton('Importer un fichier', () => fichier.click()), fichier), msg, titre('Tester la recherche'), essai, res);
}

// ───────────────────────── fiche de la structure (colonne de droite) ─────────────────────────
function rendreFiche(e) {
  vider(el.fiche);
  const sid = e.selection;
  el.fiche.parentElement.classList.toggle('an-vide', !sid);
  if (sid && matchMedia('(max-width:980px)').matches) racine.querySelector('.an-corps').scrollTo({ top: 0, behavior: 'smooth' });   // téléphone : la fiche s'affiche sous la scène
  if (!sid) { el.fiche.append(h('h3', { class: 'an-titre' }, 'Fiche anatomique'), note('Touchez une structure sur le modèle, ou choisissez-la dans la liste. Double-clic : zoom. Elle s’affiche ici avec origine, terminaison, action, innervation…'),
    h('p', { class: 'an-note-texte' }, 'Astuce : demandez à Raylé « décris-moi l’humérus » ou « où s’insère le biceps ? ».')); return; }
  const f = R.fiche(sid); if (!f) return;
  el.fiche.append(h('h3', { class: 'an-titre' }, f.nom), h('p', { class: 'an-sous' }, f.sous));
  const actions = h('div', { class: 'an-chips' },
    bouton(e.isolation ? '↩ Tout réafficher' : '◎ Isoler', () => e.isolation ? A.quitterIsolation() : A.isoler(sid), e.isolation),
    bouton(e.masques.includes(sid) ? 'Réafficher' : 'Masquer', () => A.masquer(sid)),
    bouton('Pop-up 3D', () => import('./index.js?v=2026.10.13.6').then(m => m.afficherQuick(sid))),
    bouton('🔊 Raylé lit', () => window.RayleBus && RayleBus.demander('anatomie:parler', f.resume)));
  el.fiche.append(actions);
  f.champs.forEach(c => el.fiche.append(h('div', { class: 'an-champ-fiche' }, h('h4', null, c.label), Array.isArray(c.valeur) ? h('ul', null, c.valeur.map(v => h('li', null, v))) : h('p', null, c.valeur))));
  const base = R.definition(sid), t = R.typeDe(sid);
  if (t === 'os' && R.musclesDe(R.base(sid)).length) { /* déjà dans « Muscles liés » */ }
  const bloc = h('div', { class: 'an-champ-fiche an-cours' }, h('h4', null, 'Dans vos cours'), h('p', { class: 'an-note-texte' }, 'Recherche…'));
  el.fiche.append(bloc);
  const jeton = sid + '|' + Date.now(); bloc.dataset.j = jeton;
  K.chercher(R.nomAffiche(sid).replace(/ (droit|gauche|droite)$/, '') + ' ' + (t === 'muscle' ? 'insertion origine action innervation' : ''), 2).then(r => {
    if (bloc.dataset.j !== jeton) return;
    vider(bloc).append(h('h4', null, 'Dans vos cours'));
    if (!r.length) bloc.append(h('p', { class: 'an-note-texte' }, 'Aucun passage correspondant. Ajoutez vos cours dans l’onglet « Cours ».'));
    r.forEach(x => bloc.append(h('blockquote', { class: 'an-extrait' }, h('b', null, x.titre), h('p', null, x.texte.slice(0, 380)))));
  }).catch(() => { bloc.remove(); });
}
