// Tests de la traduction française des noms anatomiques.  Lancer :  node planetes/saturne/tests/traduction-test.mjs
// (la partie « données » exige assets-lourds/anatomie/index.json et data/anatomie_fr.json ; elle est ignorée si le modèle est absent)
import fs from 'node:fs';
import { traduireNom, nomLatinDeRepli, lexique } from '../pc/anatomie-traduction-calcul.js';
import { creerIndex, nomRepli } from '../pc/anatomie-index.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const t = en => traduireNom(en).fr;

// ── grammaire : ordre des adjectifs, accords, articles, côtés ──
v('adjectifs en ordre inverse', t('Radial collateral branch of right deep brachial artery') === 'Branche collatérale radiale de l’artère brachiale profonde droite', t('Radial collateral branch of right deep brachial artery'));
v('accord au féminin et au côté', t('Left posterior basal segmental artery') === 'Artère segmentaire basale postérieure gauche', t('Left posterior basal segmental artery'));
v('« du » devant un nom masculin', t('Tarsal plate of left upper eyelid') === 'Tarse de la paupière supérieure gauche');
v('« de l’ » devant une voyelle', t('Proximal part of ileum') === 'Partie proximale de l’iléon');
v('pluriel : « Ensemble des … »', t('Set of perforating veins') === 'Ensemble des veines perforantes', t('Set of perforating veins'));
v('pluriel masculin en -aux', t('Set of dorsal interossei of right hand') === 'Ensemble des muscles interosseux dorsaux de la main droite', t('Set of dorsal interossei of right hand'));
v('ordinal avant le nom', t('First lumbrical of right foot') === 'Premier muscle lombrical du pied droit', t('First lumbrical of right foot'));
v('« with » et « to »', t('Communicating branch of left nasociliary nerve with left ciliary ganglion') === 'Branche communicante du nerf naso-ciliaire gauche avec le ganglion ciliaire gauche' && t('Branch of right middle cerebral artery to right angular gyrus') === 'Branche de l’artère cérébrale moyenne droite vers le gyrus angulaire droit');
v('complément « du genou » avant le côté', t('Left descending genicular artery') === 'Artère descendante du genou gauche', t('Left descending genicular artery'));
v('positions voisines fusionnées (TA)', t('Posterior inferior cerebellar artery') === 'Artère cérébelleuse postéro-inférieure', t('Posterior inferior cerebellar artery'));
v('« small » = petite devant une veine', t('Small cardiac vein') === 'Petite veine cardiaque');
v('nom entier particulier : cheveux', t('Hair of head') === 'Cheveux' && t('Pubic hair') === 'Poils pubiens');
v('majuscule initiale, jamais de mot anglais courant', /^[A-ZÉŒ]/.test(t('Left lens')) && !/\b(of|the|artery|vein|branch|right|left)\b/i.test(t('Left lens')));

// ── on ne devine jamais ──
const inconnu = traduireNom('Zorglub artery'); v('mot inconnu : aucune traduction + mot signalé', inconnu.fr === null && inconnu.manques.includes('zorglub'), JSON.stringify(inconnu));
v('structure ambiguë (deux noms) : aucune traduction', traduireNom('Foot hand').fr === null);
v('nom vide : aucune traduction', traduireNom('').fr === null && traduireNom(null).fr === null);
v('nom latin de repli seulement si TOUT est latin', nomLatinDeRepli('Right rectus capitis anterior') === 'Rectus capitis anterior' && nomLatinDeRepli('Right zorglub capitis') === null);
v('le lexique n’a pas de forme vide', Object.values(lexique.ADJ).every(a => a.replace(/^[>@]/, '').length > 1) && Object.values(lexique.NOMS).every(n => n && n[0] && /^[mf]$/.test(n[1])));

// ── affichage ──
v('nomRepli : nom français d’abord', nomRepli({ nom_fr: 'Fémur', nom_la: 'Femur', nom_en: 'Femur' }) === 'Fémur');
v('nomRepli : nom latin entre parenthèses sinon', nomRepli({ nom_fr: null, nom_la: 'Rectus capitis', nom_en: 'x' }) === 'Rectus capitis (nom latin)');
v('nomRepli : jamais « nom français non précisé »', !/non précisé/.test(nomRepli({ nom_fr: null, nom_la: null, nom_en: 'Some thing' })) && /à traduire/.test(nomRepli({ nom_fr: null, nom_la: null, nom_en: 'Some thing' })));
const mini = creerIndex({ pieces: [{ id: 'A', nom_en: 'Left posterior basal segmental artery', nom_fr: null, nom_la: null, systeme: 'arteres', cote: 'gauche' }, { id: 'B', nom_en: 'Femur', nom_fr: 'Fémur', nom_la: 'Femur', systeme: 'os' }] }, { A: { fr: 'Artère segmentaire basale postérieure gauche' }, B: { fr: 'PAS UTILISÉ' } });
v('l’index complète les noms manquants', mini.parId.get('A').nom_fr === 'Artère segmentaire basale postérieure gauche' && mini.libelle(mini.parId.get('A')) === 'Artère segmentaire basale postérieure gauche');
v('…et ne remplace JAMAIS un nom officiel', mini.parId.get('B').nom_fr === 'Fémur');

// ── données réelles ──
const chemin = new URL('../../../assets-lourds/anatomie/index.json', import.meta.url), cheminFr = new URL('../../../data/anatomie_fr.json', import.meta.url);
if (fs.existsSync(chemin) && fs.existsSync(cheminFr)) {
  const idx = JSON.parse(fs.readFileSync(chemin, 'utf8')), fr = JSON.parse(fs.readFileSync(cheminFr, 'utf8')).noms;
  const sans = idx.pieces.filter(p => !p.nom_fr);
  v('toutes les ' + sans.length + ' pièces sans nom français ont une traduction', sans.every(p => fr[p.id] && fr[p.id].fr), sans.filter(p => !fr[p.id]).slice(0, 3).map(p => p.nom_en).join(' | '));
  const anglais = Object.values(fr).filter(x => /\b(of|the|and|artery|arteries|veins?|branch|tributary|left|right|tree)\b/i.test(x.fr));
  v('aucune traduction ne contient de mot anglais courant', anglais.length === 0, anglais.slice(0, 3).map(x => x.fr).join(' | '));
  v('aucune traduction vide ou trop courte', Object.values(fr).every(x => x.fr.length >= 4));
  const complet = creerIndex(JSON.parse(JSON.stringify(idx)), fr);
  v('index complet : plus aucun nom français manquant', complet.pieces.every(p => p.nom_fr), complet.pieces.filter(p => !p.nom_fr).length + ' manquants');
  const total = complet.pieces.map(p => complet.libelle(p)).join('\n'); v('« nom français non précisé » n’apparaît nulle part', !/non précisé/.test(total));
  // validation contre les noms officiels
  const norme = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  let n = 0, egal = 0; for (const p of idx.pieces) { if (!p.nom_fr || !p.nom_en || p.traduction === 'absente' || p.traduction === 'regle') continue; const r = traduireNom(p.nom_en); if (!r.fr) continue; n++; const b = p.nom_fr.replace(/\s+(droit|droite|gauche)$/i, ''); if (norme(r.fr).replace(/ (droite?s?|gauches?)$/, '') === norme(b) || norme(r.fr) === norme(p.nom_fr)) egal++; }
  v('validation contre les noms OFFICIELS : au moins 75 % identiques', n >= 250 && egal / n >= 0.75, egal + '/' + n);
  console.log('  (' + egal + '/' + n + ' identiques aux noms officiels, ' + sans.length + ' pièces complétées)');
} else console.log('  (partie « données » ignorée : modèle ou data/anatomie_fr.json absent)');
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
