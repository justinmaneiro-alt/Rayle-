/* ═════════════ FENÊTRE « CERVEAU » (vue plein écran #vueCerveau, comme Anatomie et le terminal) ═════════════
   Chargée par js/commun/vues.js à la première ouverture. Exporte ouvrir(options) et fermer().
   Modèle 3D : cerveau-bp3d.glb (BodyParts3D) · données : donnees-cerveau.js · moteur : cerveau-moteur.js · présentations : lecteur.js.
   Pilotage depuis Raylé (voix, texte) : window.RayleCerveau = { zone, reseau, vue, calque, niveau, visite, presenter, etat }. */
import { chargerTHREE, webglDisponible, h, vider } from './outils.js?v=2026.10.15.2';
import { MoteurCerveau, NIVEAUX_CERVEAU, NOMS_NIVEAUX_CERVEAU, CALQUES_CERVEAU, NOMS_CALQUES_CERVEAU } from './cerveau-moteur.js?v=2026.10.15.2';
import * as D from './donnees-cerveau.js?v=2026.10.15.2';
import * as C from './cerveau-recherche.js?v=2026.10.15.2';
import { niveauConseille, detecterCapacites } from './rendu.js?v=2026.10.15.2';
import { Lecteur } from './lecteur.js?v=2026.10.15.2';
import { scriptZoneCerveau, scriptReseauCerveau, scriptTourCerveau } from './presentation.js?v=2026.10.15.2';

const CLE_QUALITE = 'rayle_cerveau_qualite';
let racine = null, moteur = null, monte = false, ouvert = false, jeton = 0, lecteur = null, noticeT = 0;
const el = {};

const lireQualite = () => { try { const v = localStorage.getItem(CLE_QUALITE); if (NIVEAUX_CERVEAU.includes(v)) return v; } catch (e) { } const n = niveauConseille(detecterCapacites()); return n === 'haute' ? 'haute' : n; };
const ecrireQualite = n => { try { localStorage.setItem(CLE_QUALITE, n); } catch (e) { } };
const bus = (nom, arg) => { try { return window.RayleBus ? RayleBus.demander(nom, arg) : null; } catch (e) { return null; } };
const fusion = o => { try { window.RayleBus && RayleBus.fusion('cerveau', o); } catch (e) { } };

// ───────────────────────── interface ─────────────────────────
function monter() {
  if (monte) return; monte = true;
  racine = document.getElementById('vueCerveau'); vider(racine);
  el.calques = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Couches' });
  el.vues = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Vues et coupes' });
  el.cotes = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Hémisphère' });
  el.qualite = h('div', { class: 'an-chips', role: 'group', 'aria-label': 'Qualité' });
  el.canvas = h('canvas', { class: 'an-canvas', 'aria-label': 'Cerveau en 3D : glisser pour tourner, pincer pour zoomer, toucher une zone pour la décrire' });
  el.etiquettes = h('div', { class: 'an-etiquettes', 'aria-hidden': 'true' });
  el.etat = h('div', { class: 'ce-etat', hidden: true, role: 'status', 'aria-live': 'polite' });
  el.legende = h('div', { class: 'ce-legende', hidden: true });
  el.erreur = h('div', { class: 'an-erreur', hidden: true });
  el.panneau = h('div', { class: 'an-panneau' });
  el.fiche = h('div', { class: 'an-fiche' });
  el.dit = h('div', { class: 'an-dit', 'aria-live': 'polite' });
  el.question = h('input', { type: 'text', class: 'an-question', placeholder: 'Demander à Raylé… (« explique le lobe frontal »)', 'aria-label': 'Demander à Raylé', enterkeyhint: 'send' });
  el.question.addEventListener('keydown', ev => { if (ev.key === 'Enter' && el.question.value.trim()) { bus('rayle:demande', el.question.value.trim()); el.question.value = ''; } });
  const retour = h('button', { type: 'button', class: 'an-retour', title: 'Retour à Raylé', onclick: () => window.RayleBus && RayleBus.emit('vue:demande', { vue: 'rayle' }) }, '✕ Retour', h('span', { class: 'an-long' }, ' à Raylé'));
  racine.append(
    h('div', { class: 'an-barre' }, h('div', { class: 'an-marque' }, 'RAYLÉ', h('span', null, '//'), 'CERVEAU'), el.calques, retour),
    h('div', { class: 'an-sous-barre' }, el.vues, el.cotes,
      h('button', { type: 'button', class: 'an-chip', onclick: () => visite() }, '▶ Tour du cerveau'),
      h('button', { type: 'button', class: 'an-chip', onclick: () => reinitialiser() }, '↺ Tout réafficher'), el.qualite),
    h('div', { class: 'an-corps' }, h('aside', { class: 'an-gauche hud-cadre' }, el.panneau), h('main', { class: 'an-centre' }, el.canvas, el.etiquettes, el.etat, el.legende, el.erreur), h('aside', { class: 'an-droite hud-cadre' }, el.fiche)),
    h('div', { class: 'an-pied' }, el.dit, el.question, h('span', { class: 'an-avert' }, 'Outil pédagogique : forme issue de BodyParts3D, faisceaux et neurones schématiques ; ce n’est ni un avis médical ni un atlas de précision. ' + D.MENTION_CEREBRALE)));
  CALQUES_CERVEAU.forEach(n => el.calques.append(h('button', { type: 'button', class: 'an-chip an-calque', 'data-c': n, 'aria-pressed': 'false', onclick: () => calque(n) }, NOMS_CALQUES_CERVEAU[n])));
  Object.entries(D.VUES_CEREBRALES).forEach(([id, v]) => el.vues.append(h('button', { type: 'button', class: 'an-chip', 'data-v': id, onclick: () => vue(id) }, v.nom.replace(/ \(.*\)/, ''))));
  [['les deux', 'Les deux'], ['gauche', 'Gauche'], ['droit', 'Droit']].forEach(([id, t]) => el.cotes.append(h('button', { type: 'button', class: 'an-chip', 'data-k': id, onclick: () => cote(id) }, t)));
  NIVEAUX_CERVEAU.forEach(n => el.qualite.append(h('button', { type: 'button', class: 'an-chip' + (n === 'ultra' ? ' ce-ultra' : ''), 'data-q': n, title: n === 'ultra' ? 'Très gourmand : batterie, chaleur. Retour automatique au palier inférieur si l’image devient trop lente.' : '', onclick: () => niveau(n) }, NOMS_NIVEAUX_CERVEAU[n] + (n === 'ultra' ? ' ⚠' : ''))));
  rendrePanneau(); rendreFicheAccueil(); majChips();
  if (window.RayleBus) RayleBus.on('rayle:dit', d => { if (ouvert && d && d.kind === 'ray') el.dit.textContent = 'RAYLÉ › ' + String(d.text).slice(0, 260); });
}
function rendrePanneau() {
  vider(el.panneau);
  const familles = []; D.ZONES_CERVEAU.forEach(z => { let f = familles.find(x => x[0] === z.famille); if (!f) familles.push(f = [z.famille, []]); f[1].push(z); });
  el.panneau.append(h('h3', { class: 'an-titre' }, 'Réseaux animés'), h('p', { class: 'an-info' }, 'Choisissez une fonction : les impulsions lumineuses suivent les voies concernées.'),
    el.reseaux = h('div', { class: 'ce-reseaux' }, D.RESEAUX_CERVEAU.map(r => h('button', { type: 'button', class: 'an-chip', 'data-r': r.id, onclick: () => reseau(r.id) }, r.nom))));
  el.panneau.append(h('h3', { class: 'an-titre' }, 'Affichage'),
    curseur('Transparence du cortex', 'cortex', 5, 100, v => { moteur.etat.opacites.cortex = v / 100; moteur.appliquerCalques(); }, () => Math.round((moteur ? moteur.etat.opacites.cortex : .55) * 100)),
    curseur('Transparence de la substance blanche', 'blanche', 5, 100, v => { moteur.etat.opacites.blanche = v / 100; moteur.appliquerCalques(); }, () => Math.round((moteur ? moteur.etat.opacites.blanche : .85) * 100)),
    el.coupe = curseur('Position de la coupe', 'coupe', 0, 100, v => moteur.coupe({ position: v / 100 }), () => moteur && moteur.etat.coupe ? Math.round(moteur.etat.coupe.position * 100) : 50),
    h('div', { class: 'an-chips' }, h('button', { type: 'button', class: 'an-chip', 'data-couleurs': 'lobes', onclick: () => couleurs('lobes') }, 'Lobes colorés'), h('button', { type: 'button', class: 'an-chip', 'data-couleurs': 'naturel', onclick: () => couleurs('naturel') }, 'Teinte naturelle')),
    h('div', { class: 'an-chips' }, h('button', { type: 'button', class: 'an-chip', onclick: () => { moteur && (moteur.rotationAuto = !moteur.rotationAuto); } }, '⟳ Rotation'), h('button', { type: 'button', class: 'an-chip', onclick: () => ralentir() }, 'Vitesse des impulsions')));
  el.panneau.append(h('h3', { class: 'an-titre' }, 'Zones'));
  for (const [nom, zs] of familles) { el.panneau.append(h('div', { class: 'an-groupe' }, nom)); zs.forEach(z => el.panneau.append(h('div', { class: 'an-ligne', 'data-z': z.id }, h('button', { type: 'button', class: 'an-btn-nom an-nom', onclick: () => zone(z.id) }, z.nom)))); }
}
function curseur(titre, id, min, max, fn, val) {
  const sortie = h('span', { class: 'an-val' }, val() + (id === 'coupe' ? ' %' : ' %')), r = h('input', { type: 'range', min, max, value: val(), 'aria-label': titre });
  r.addEventListener('input', () => { sortie.textContent = r.value + ' %'; if (moteur) fn(+r.value); });
  return h('label', { class: 'an-curseur' }, h('span', null, titre), sortie, r);
}
function majChips() {
  if (!monte) return; const e = moteur ? moteur.etat : { calques: {}, cote: 'les deux', zone: null, reseau: null, couleurs: 'lobes' };
  el.calques.querySelectorAll('.an-calque').forEach(b => { const on = !!e.calques[b.dataset.c]; b.classList.toggle('actif', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  el.cotes.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('actif', b.dataset.k === e.cote));
  el.vues.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('actif', !!moteur && b.dataset.v === moteur.vueNom));
  el.qualite.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('actif', b.dataset.q === (moteur ? moteur.niveau : lireQualite())));
  el.reseaux && el.reseaux.querySelectorAll('[data-r]').forEach(b => b.classList.toggle('actif', b.dataset.r === e.reseau));
  el.panneau.querySelectorAll('.an-ligne').forEach(l => l.classList.toggle('actif', l.dataset.z === e.zone));
  el.panneau.querySelectorAll('[data-couleurs]').forEach(b => b.classList.toggle('actif', b.dataset.couleurs === e.couleurs));
}
function avis(texte, ms = 7000) { el.etat.hidden = !texte; el.etat.textContent = texte || ''; clearTimeout(noticeT); if (texte && ms) noticeT = setTimeout(() => { el.etat.hidden = true; }, ms); }

// ───────────────────────── fiches ─────────────────────────
function champ(c) { return h('div', { class: 'an-champ-fiche' }, h('h4', null, c.label), Array.isArray(c.valeur) ? h('ul', null, c.valeur.map(v => h('li', null, v))) : h('p', null, c.valeur)); }
function rendreFicheAccueil() {
  vider(el.fiche).append(h('p', { class: 'an-sous' }, 'Cerveau humain · BodyParts3D'),
    h('p', { class: 'an-info' }, 'Touchez une zone du cerveau, choisissez-en une dans la liste, ou dites à Raylé : « montre l’hippocampe », « explique le lobe frontal », « fais-moi un tour du cerveau ».'),
    h('p', { class: 'an-info' }, 'Les faisceaux de substance blanche et les impulsions des neurones sont des schémas, pas une mesure sur ce cerveau.'),
    h('button', { type: 'button', class: 'an-chip', onclick: () => visite() }, '▶ Tour du cerveau'));
  el.fiche.parentElement.classList.remove('an-vide');
}
function rendreFiche(id) {
  const f = C.ficheZone(id); if (!f) return rendreFicheAccueil();
  vider(el.fiche).append(h('h3', { class: 'an-titre' }, f.nom), h('p', { class: 'an-sous' }, f.latin + ' · ' + f.famille));
  f.champs.forEach(c => el.fiche.append(champ(c)));
  if (f.certitude) el.fiche.append(h('div', { class: 'ce-certitude' }, h('b', null, 'Degré de certitude : '), f.certitude));
  el.fiche.append(h('div', { class: 'an-chips' },
    h('button', { type: 'button', class: 'an-chip', onclick: () => presenter(scriptZoneCerveau(id)) }, '▶ Présenter'),
    h('button', { type: 'button', class: 'an-chip', onclick: () => bus('anatomie:parler', C.resumeZone(id, '')) }, '🔊 Raylé lit')),
    h('p', { class: 'ce-source' }, 'Sources : ' + f.sources.join(' · ')), h('p', { class: 'ce-avert' }, f.mention));
}
function rendreFicheReseau(id) {
  const r = D.RESEAU_PAR_ID[id]; if (!r) return;
  vider(el.fiche).append(h('h3', { class: 'an-titre' }, 'Réseau : ' + r.nom), h('p', { class: 'an-sous' }, 'Neurones animés'), h('p', { class: 'an-info' }, r.description),
    h('div', { class: 'an-champ-fiche' }, h('h4', null, 'Zones concernées'), h('ul', null, r.zones.map(z => D.ZONE_PAR_ID[z]).filter(Boolean).map(z => h('li', null, h('button', { type: 'button', class: 'an-btn-nom', onclick: () => zone(z.id) }, z.nom))))),
    h('div', { class: 'an-champ-fiche' }, h('h4', null, 'Faisceaux animés'), h('ul', null, r.faisceaux.map(f => D.FAISCEAU_PAR_ID[f]).filter(Boolean).map(f => h('li', null, f.nom + ' — ' + f.role)))),
    h('div', { class: 'an-chips' }, h('button', { type: 'button', class: 'an-chip', onclick: () => presenter(scriptReseauCerveau(id)) }, '▶ Présenter'), h('button', { type: 'button', class: 'an-chip', onclick: () => reseau(null) }, '↩ Désactiver')),
    h('p', { class: 'ce-source' }, 'Source : ' + (D.SOURCES_CERVEAU[r.source] || '') + ' · ' + D.SOURCES_CERVEAU.CATANI), h('p', { class: 'ce-avert' }, 'Les impulsions illustrent le trajet de l’information ; leur rythme n’est pas une mesure.'));
}

// ───────────────────────── actions (aussi appelées par Raylé) ─────────────────────────
function zone(id, opts = {}) {
  if (!moteur || !moteur.prete) { en_attente = () => zone(id, opts); return false; }
  const z = id && D.ZONE_PAR_ID[id];
  moteur.etat.zone = z ? id : null; if (z && !opts.garderReseau) moteur.etat.reseau = null;
  moteur.retirerEtiquette('zone');
  moteur.appliquerCalques(); majChips();
  if (z) {
    if (opts.camera !== false) { if (opts.vue) moteur.vue(opts.vue); const b = moteur.centreForme(z.structures); if (b) moteur.allerA({ cible: b.getCenter(new moteur.T.Vector3()), dist: Math.min(Math.max(Math.max(...b.getSize(new moteur.T.Vector3()).toArray()) * 2.8, .15), .9) }, 900); }
    moteur.etiquetteForme('zone', z.structures[0], C.nomLatin(z), 'zone');
    rendreFiche(id); fusion({ zone: id, reseau: null });
  } else { rendreFicheAccueil(); fusion({ zone: null }); }
  return !!z;
}
function reseau(id) {
  if (!moteur || !moteur.prete) { en_attente = () => reseau(id); return false; }
  moteur.etat.reseau = id && D.RESEAU_PAR_ID[id] ? id : null; moteur.etat.zone = null; moteur.retirerEtiquette('zone');
  if (moteur.etat.reseau) moteur.etat.calques.neurones = true;
  moteur.appliquerCalques(); majChips(); if (moteur.etat.reseau) rendreFicheReseau(id); else rendreFicheAccueil();
  fusion({ reseau: moteur.etat.reseau, zone: null }); return !!moteur.etat.reseau;
}
function vue(nom) {
  if (!moteur || !moteur.prete) { en_attente = () => vue(nom); return false; }
  const ok = moteur.vue(nom); majChips();
  el.coupe && el.coupe.querySelector('input') && (el.coupe.querySelector('input').value = moteur.etat.coupe ? Math.round(moteur.etat.coupe.position * 100) : 50);
  avis(ok && moteur.etat.coupe ? 'Coupe ' + { x: 'sagittale', y: 'axiale', z: 'frontale' }[moteur.etat.coupe.axe] + ' — réglez sa position avec le curseur « Position de la coupe ».' : '', 5000);
  fusion({ vue: nom }); return ok;
}
function calque(n, oui) {
  if (!moteur) return false; const e = moteur.etat; e.calques[n] = oui == null ? !e.calques[n] : !!oui;
  moteur.appliquerCalques(); majChips(); if (n === 'brodmann') majLegende(); return e.calques[n];
}
function cote(c) { if (!moteur) return; moteur.etat.cote = c; moteur.appliquerCalques(); majChips(); }
function couleurs(m) { if (!moteur) return; moteur.etat.couleurs = m; moteur.appliquerCouleurs(); majChips(); }
function ralentir() { if (!moteur) return; const v = moteur.etat.vitesse; moteur.etat.vitesse = v >= 2 ? .4 : v * 1.6; avis('Vitesse des impulsions ×' + moteur.etat.vitesse.toFixed(1).replace('.', ','), 2500); }
function reinitialiser() {
  if (!moteur) return; fermerLecteur(); Object.assign(moteur.etat, { zone: null, reseau: null, coupe: null, cote: 'les deux', couleurs: 'lobes' });
  Object.assign(moteur.etat.calques, { cortex: true, blanche: false, profond: true, tronc: true, liquide: false, faisceaux: true, neurones: true, brodmann: false }); moteur.etat.opacites.cortex = .55;
  moteur.retirerEtiquette(null); moteur.appliquerCalques(); moteur.appliquerCouleurs(); moteur.vue('laterale'); moteur.etat.coupe = null; moteur.appliquerCoupe(); rendrePanneau(); rendreFicheAccueil(); majChips(); majLegende();
}
async function niveau(n) {
  if (!NIVEAUX_CERVEAU.includes(n)) return false; ecrireQualite(n);
  if (n === 'ultra') avis('Qualité Ultra : très gourmand (batterie, chaleur). Si l’image devient trop lente, Raylé repasse automatiquement au palier inférieur.', 9000);
  if (moteur) { await moteur.changerNiveau(n); } majChips(); return true;
}
function majLegende() {
  const on = !!(moteur && moteur.etat.calques.brodmann); el.legende.hidden = !on; vider(el.legende);
  if (on) { el.legende.append(h('b', null, 'Aires de Brodmann (approximatives)')); D.AIRES_BRODMANN.forEach(a => el.legende.append(h('div', null, h('i', { style: 'background:#' + a.col.toString(16).padStart(6, '0') }), 'Aire ' + a.n + ' · ' + a.lib))); el.legende.append(h('div', { class: 'ce-avert' }, 'Centres moyens de la littérature, couleurs par proximité : ce n’est pas la cytoarchitecture réelle de ce cerveau.')); }
}
let en_attente = null;

// ───────────────────────── présentations ─────────────────────────
function fermerLecteur() { if (lecteur) { try { lecteur.fermer(); } catch (e) { } lecteur = null; } }
function adaptateur() {
  const sauve = { calques: Object.assign({}, moteur.etat.calques), opacites: Object.assign({}, moteur.etat.opacites), coupe: moteur.etat.coupe, zone: moteur.etat.zone, reseau: moteur.etat.reseau, cote: moteur.etat.cote };
  let n = 0;
  return {
    async appliquer(etape, ctx) {
      const sc = etape.scene || {}, e = moteur.etat;
      e.zone = sc.zone || null; e.reseau = sc.reseau || null; if (sc.neurones != null) e.calques.neurones = !!sc.neurones;
      e.cote = 'les deux'; moteur.retirerEtiquette(null);
      if (sc.vue) { moteur.vue(sc.vue); } else if (sc.coupe !== undefined) moteur.coupe(sc.coupe);
      moteur.appliquerCalques(); majChips();
      if (sc.zone) { const z = D.ZONE_PAR_ID[sc.zone], b = z && moteur.centreForme(z.structures); if (b) { const c = b.getCenter(new moteur.T.Vector3()), s = b.getSize(new moteur.T.Vector3()); const v = D.VUES_CEREBRALES[sc.vue || 'laterale'] || D.VUES_CEREBRALES.laterale; moteur.allerA({ cible: c, dist: Math.min(Math.max(Math.max(s.x, s.y, s.z) * 2.8, .17), .9), az: moteur.vueNom === 'mediane' ? -Math.PI / 2 : v.az === -Math.PI / 2 ? Math.PI / 2 : v.az, el: v.el }, 1200 / (ctx.vitesse || 1)); } rendreFiche(sc.zone); }
      else if (sc.reseau) { rendreFicheReseau(sc.reseau); moteur.allerA({ cible: new moteur.T.Vector3(), dist: moteur.distCadre(), az: Math.PI / 2, el: .15 }, 1200 / (ctx.vitesse || 1)); }
      else moteur.allerA({ cible: new moteur.T.Vector3(), dist: moteur.distCadre() }, 1000 / (ctx.vitesse || 1));
      moteur.rotationAuto = !!sc.orbite && !sc.zone; if (moteur.rotationAuto) moteur.lireCamera();
    },
    etiquette(etape, lab, i) { const a = lab.ancre || {}, z = a.zone && D.ZONE_PAR_ID[a.zone]; if (z) setTimeout(() => moteur && !moteur.mort && moteur.etiquetteForme('pr' + (++n), z.structures[0], lab.texte, 'zone pres'), 300 * i); },
    retirerEtiquettes() { moteur && moteur.retirerEtiquette(null); },
    redimensionner() { moteur && moteur.redimensionner(); },
    nettoyer() { if (!moteur) return; moteur.rotationAuto = false; Object.assign(moteur.etat, { coupe: sauve.coupe, zone: sauve.zone, reseau: sauve.reseau, cote: sauve.cote }); Object.assign(moteur.etat.calques, sauve.calques); Object.assign(moteur.etat.opacites, sauve.opacites); moteur.appliquerCalques(); majChips(); }
  };
}
async function attendrePret() { for (let i = 0; i < 200 && !(moteur && moteur.prete); i++) await new Promise(r => setTimeout(r, 100)); return !!(moteur && moteur.prete); }
async function presenter(script, options = {}) {
  if (!script) return null; if (!(await attendrePret())) throw new Error('Le cerveau 3D n’est pas prêt.');
  fermerLecteur();
  lecteur = new Lecteur({ conteneur: racine.querySelector('.an-centre'), racine, script, adaptateur: adaptateur(), surFermer: () => { lecteur = null; if (window.RayleLecteur) window.RayleLecteur = null; }, sansVoix: !!options.sansVoix, dire: options.dire, taire: options.taire });
  window.RayleLecteur = lecteur; lecteur.demarrer(); return lecteur;
}
const visite = () => presenter(scriptTourCerveau());

// ───────────────────────── cycle de vie ─────────────────────────
export async function ouvrir(options = {}) {
  monte_(); ouvert = true; const mon = ++jeton; fusion({ ouvert: true });
  if (!webglDisponible()) { el.erreur.hidden = false; el.erreur.textContent = 'La 3D (WebGL) n’est pas disponible sur cet appareil : les fiches des zones restent consultables dans la liste.'; majChips(); return appliquerOptions(options); }
  el.erreur.hidden = true;
  if (!moteur) {
    try {
      const THREE = await chargerTHREE(); if (mon !== jeton || !ouvert) return;
      avis('Chargement du cerveau 3D…', 0);
      moteur = new MoteurCerveau(THREE, el.canvas, { niveau: lireQualite(), etiquettes: el.etiquettes, surSelection: surClic, surDegrade: degrader, surPret: () => { avis(''); majChips(); if (en_attente) { const f = en_attente; en_attente = null; f(); } } });
      window.RayleCerveauMoteur = moteur; await moteur.init();
      if (mon !== jeton || !ouvert) return;
      if (moteur.source !== 'BodyParts3D') avis('Modèle de secours schématique (le fichier cerveau-bp3d.glb n’a pas pu être chargé).', 9000);
      moteur.vue('laterale'); majChips();
    } catch (e) { el.erreur.hidden = false; el.erreur.textContent = 'Le moteur 3D n’a pas pu démarrer : ' + (e && e.message || e) + ' (three.js se charge depuis Internet).'; avis(''); console.error('[cerveau]', e); }
  }
  appliquerOptions(options);
}
function monte_() { monter(); }
function appliquerOptions(o) {
  if (!o) return; if (o.niveau) niveau(o.niveau);
  if (o.vue) vue(o.vue); if (o.reseau) reseau(o.reseau); if (o.zone) zone(o.zone, { vue: o.vueZone }); if (o.visite) visite();
  if (o.calques) Object.entries(o.calques).forEach(([n, v]) => calque(n, v));
}
export function fermer() {
  ouvert = false; jeton++; fermerLecteur(); fusion({ ouvert: false });
  if (moteur) { moteur.dispose(); moteur = null; window.RayleCerveauMoteur = null; }
  en_attente = null;
}
function surClic(sid, info) {
  const z = C.zoneDeStructure(sid);
  if (info && info.brodmann && moteur.etat.calques.brodmann) avis('Aire de Brodmann voisine (approximative) : ' + info.brodmann.n + ' — ' + info.brodmann.lib, 6000);
  if (z) zone(z.id, { camera: false });
}
async function degrader(fps) {
  if (!moteur) return; const i = NIVEAUX_CERVEAU.indexOf(moteur.niveau); if (i <= 0) return;
  const bas = NIVEAUX_CERVEAU[i - 1]; avis('Image trop lente (≈ ' + fps + ' i/s) : qualité ramenée à ' + NOMS_NIVEAUX_CERVEAU[bas] + '.', 9000);
  await moteur.changerNiveau(bas); majChips(); try { ecrireQualite(bas); } catch (e) { }
}

window.RayleCerveau = {
  zone: (id, o) => zone(id, o), reseau, vue, calque, niveau, visite, presenter, cote, couleurs,
  trouverZone: C.trouverZone, trouverReseau: C.trouverReseau,
  etat: () => moteur ? Object.assign({ ouvert }, moteur.etatTexte(), { calques: moteur.etat.calques, coupe: moteur.etat.coupe }) : { ouvert }
};
