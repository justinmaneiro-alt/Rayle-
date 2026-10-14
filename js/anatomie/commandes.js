/* ═════════════ COMMANDES DE RAYLÉ POUR L'ANATOMIE (voix ou texte, sans IA) ═════════════
   analyser(texte, { vue }) → commande ou null (pur : testable sans navigateur)
   executer(commande)       → phrase que Raylé dit (promesse), ou null
   Déclencheurs : « décris-moi l'humérus », « où s'insère le biceps ? » (pop-up 3D), « ouvre l'anatomie », « affiche les muscles et les nerfs »,
   « amputation trans-tibiale à droite », « scoliose de 40 degrés », « fracture du col du fémur », « mets une prothèse », « mets l'emboîture en carbone »… */
import { useAnatomieStore as S, actions as A } from './store.js?v=2026.10.14.3';
import * as R from './registre.js?v=2026.10.14.3';
import * as K from './cours.js?v=2026.10.14.3';
import * as P from './presentation.js?v=2026.10.14.3';
import * as CV from './cerveau-recherche.js?v=2026.10.14.3';
import { AMPUTATIONS, SCOLIOSE, FRACTURES, MATERIAUX, APPAREILLAGES, appareilsCompatibles } from './donnees-ortho.js?v=2026.10.14.3';

const norm = R.norm;
const COUP = /\b(?:et|plus|avec|puis)\b|[+,&]/;

// ── mots-clés ──
const VERBES_MONTRER = /^(?:affiche|afficher|montre|montrer|mets|met|mettre|ajoute|ajouter|active|activer|superpose|superposer|visualise|visualiser|simule|simuler|vois|voir|passe|passer|lance|lancer|ouvre|ouvrir|donne|je veux voir|fais|fait)\b/;
const VERBES_CACHER = /^(?:enleve|enlever|cache|cacher|retire|retirer|desactive|desactiver|masque|masquer|supprime|supprimer|efface|effacer|sans)\b/;
const CALQUES_MOTS = [
  ['squelette', /\b(?:squelette|os|osseux|osseuse|osseuses|systeme osseux|ossature)\b/], ['muscles', /\b(?:muscles?|musculaire|musculature|systeme musculaire)\b/], ['arteres', /\b(?:arteres?|arteriel|arterielle|reseau arteriel|systeme arteriel)\b/], ['veines', /\b(?:veines?|veineux|veineuse|reseau veineux|systeme veineux)\b/], ['nerfs', /\b(?:nerfs?|nerveux|nerveuse|systeme nerveux|plexus)\b/],
  ['organes', /\b(?:organes?|visceres?|viscerale?s?|organes internes)\b/], ['peau', /\b(?:peau|silhouette|enveloppe)\b/], ['dermatomes', /\b(?:dermatomes?)\b/], ['reperes', /\b(?:reperes?(?: osseux| anatomiques?)?|palpation)\b/]
];
const INTENT_DECRIRE = /\b(?:decris|decrire|description|explique|expliquer|parle|parler|presente|presenter|montre|montrer|affiche|afficher|isole|isoler|zoome?|vois|voir|reperer|ou (?:est|se trouve|se situe|sont|se placent?)|situe|localise|localiser|c est quoi|qu est ce|qui est|fiche|insere|inserent|insertion|terminaison|origine|innerve|innervation|action|role|fonction|sert|a quoi|rotation|trajet|attaches?|se fixe|se termine|palper|palpe|repere|dis moi|raconte|detaille|apercu|3d|vue 3d)\b/;
const REGEX_OUVRIR = /^(?:ouvre|ouvrir|lance|lancer|affiche|afficher|montre|montrer|va|aller|passe|passer|bascule|basculer)(?: moi)?(?: sur| dans| vers| a| au| en)?(?: la| le| l| mon| ma| les| mes| un| une)* ?(?:fenetre |page |module |mode |vue |espace |application |appli )*(?:d? ?anatomie(?: et orthopedie| 3d| en 3d)?|orthopedie(?: et anatomie)?|atlas(?: anatomique)?(?: 3d)?|corps humain|modele 3d(?: du corps)?|squelette 3d|simulateur(?: d orthopedie)?|orthoprothese)$/;
const REGEX_FERMER_FENETRE = /^(?:ferme|fermer|quitte|quitter|sors|sortir|retour|reviens|revenir|retourne|retourner)(?: moi)?(?: de| a| sur| vers| au| du| de la| de l)*(?: la| le| l| mon| ma| les)* ?(?:fenetre )*(?:d? ?anatomie(?: et orthopedie| 3d)?|orthopedie|atlas|modele 3d|rayle|accueil|menu|ecran principal|principal)?$/;
const REGEX_FERMER_QUICK = /^(?:ferme|fermer|cache|cacher|enleve|enlever|retire|retirer|supprime|supprimer|quitte|quitter)(?: moi)?(?: la| le| l| cette| ce| mon| ma| les)* ?(?:mini )*(?:pop ?up|popup|apercu|fenetre(?: flottante| 3d)?|vue 3d|3d|modele|structure|volet)$/;
const VUES_MOTS = [['dos', /\b(?:de dos|par derriere|vue arriere|face posterieure|vue de dos)\b/], ['face', /\b(?:de face|vue de face|face anterieure|par devant)\b/], ['gauche', /\b(?:profil gauche|cote gauche|de profil gauche)\b/], ['droite', /\b(?:profil droit|cote droit|de profil droit|de profil)\b/], ['dessus', /\b(?:de dessus|vue du dessus|vue aerienne)\b/]];

const NIVEAUX = [   // ordre : du plus précis au plus général
  ['hanche', /\bdesarticulation (?:de la |de |du )?(?:la )?hanche\b|\bamputation (?:de la |de )?hanche\b/], ['genou', /\bdesarticulation (?:du |de |au niveau du )?(?:le )?genou\b/],
  ['transtibiale', /\btrans ?tibial\w*|\bsous le genou\b|\bde jambe\b|\bamputation (?:de la )?jambe\b|\bptb\b|\btibiale?\b/], ['transfemorale', /\btrans ?femoral\w*|\bau dessus du genou\b|\bde cuisse\b|\bamputation (?:de la )?cuisse\b|\bfemorale?\b/],
  ['syme', /\bsyme\b/], ['chopart', /\bchopart\b/], ['lisfranc', /\blisfranc\b/],
  ['epaule-disarticulation', /\bdesarticulation (?:de l |de la |d l )?epaule\b|\bamputation (?:de l )?epaule\b/], ['coude', /\bdesarticulation (?:du |de |au niveau du )?coude\b/], ['poignet', /\bdesarticulation (?:du |de |au niveau du )?poignet\b/],
  ['transhumerale', /\btrans ?humeral\w*|\bau dessus du coude\b|\bde bras\b|\bamputation (?:du )?bras\b/], ['transradiale', /\btrans ?radial\w*|\bsous le coude\b|\bavant bras\b|\bamputation (?:de l )?avant bras\b/],
  ['transmetacarpienne', /\btransmetacarp\w*|\btrans metacarp\w*|\bmain partielle\b|\bmetacarp\w*\b/], ['doigts', /\bdoigts?\b|\bpouce\b|\bindex\b|\bmajeur\b|\bannulaire\b|\bauriculaire\b/],
  ['hanche', /\bhanche\b/], ['genou', /\bgenou\b/], ['poignet', /\bpoignet\b|\bmain\b/], ['coude', /\bcoude\b/], ['epaule-disarticulation', /\bepaule\b/]
];
const FRACTURES_MOTS = [
  ['clavicule-tiers-moyen', /\bclavicule\b/], ['humerus-diaphyse', /\bhumerus\b|\bbras\b/], ['radius-distal-pouteau-colles', /\bpouteau\b|\bcolles\b|\bradius\b|\bpoignet\b/], ['avant-bras-deux-os', /\bavant bras\b|\bdeux os\b|\bcubitus\b|\bulna\b/],
  ['col-femoral', /\bcol (?:du )?femur\b|\bcol femoral\b|\bhanche\b/], ['femur-diaphyse', /\bfemur\b|\bcuisse\b/], ['tibia-fibula-diaphyse', /\btibia\b|\bjambe\b|\bfibula\b|\bperone\b/], ['malleole-weber-b', /\bmalleole\b|\bcheville\b|\bweber\b/],
  ['explosion-l1', /\bexplosion\b/], ['tassement-l1', /\btassement\b|\bvertebr\w*\b|\bl ?1\b|\brachis\b|\bcolonne\b|\bdos\b/]
];
const MATERIAU_MOTS = [['pa6', /\bpa ?6\b|\bpolyamide\b/], ['nylon', /\bnylon\b|\bpa ?12\b/], ['carbone', /\bcarbone\b/], ['verre', /\bfibre de verre\b|\bverre\b/], ['resine-epoxy', /\bepoxy\b/], ['resine-acrylique', /\bacrylique\b|\bresine\b/], ['platre', /\bplatre\b/],
  ['silicone', /\bsilicone\b/], ['gel', /\bgel\b/], ['eva', /\beva\b|\bmousse\b/], ['acier', /\bacier\b|\binox\b/], ['aluminium', /\balu(?:minium)?\b/], ['titane', /\btitane\b/], ['polyethylene', /\bpolyethylene\b|\bpe\b/], ['polypropylene', /\bpolypropylene\b|\bpp\b/], ['thermo-basse', /\bbasse temperature\b|\bthermoplastique\b/]];
const COMPOSANTS_MOTS = [['emboiture', /\bemboiture\b|\bbotte\b|\bcorbeille\b|\bsocket\b/], ['manchon', /\bmanchon\b|\bliner\b|\bgaine\b|\bgarniture\b/], ['pylone', /\bpylone\b|\btube\b|\btige\b/], ['pied', /\bpied\b/], ['genou', /\bgenou\b/], ['coque', /\bcoque\b|\bcorset\b|\bmanchette\b|\borthese\b/], ['pelote', /\bpelote\b|\bappui\b/], ['armature', /\barmature\b|\bbarres?\b/], ['main', /\bmain\b|\bdoigts\b|\bgant\b/], ['poignet', /\bpoignet\b/], ['coude', /\bcoude\b/], ['hanche', /\bhanche\b/], ['lame', /\blame\b/], ['sangle', /\bsangles?\b/], ['fermeture', /\bfermeture\b/], ['remplissage', /\bremplissage\b|\bchausson\b/]];

const coteDe = n => /\bbilateral\w*|\bdes deux (?:cotes|jambes|bras)|\bdeux cotes\b|\bdouble amputation/.test(n) ? 'DG' : R.coteDans(n);

/** Analyse une phrase. → null si ce n'est pas pour le module anatomie. */
export function analyser(texte, ctx = {}) {
  const brut = String(texte || ''), n = norm(brut), vue = ctx.vue;
  if (!n || n.length < 3) return null;
  const sansRayle = n.replace(/^(?:hey |ok |dis |eh )?rayle /, '').replace(/ rayle$/, '').replace(/^(?:s il te plait|stp|svp) /, '').replace(/ (?:s il te plait|stp|svp)$/, '').replace(/^(?:peux tu|pouvez vous|tu peux|pourrais tu|veux tu|j aimerais|je voudrais|je veux) (?:me |m )?/, '').trim();
  const t = sansRayle;

  // 1. fenêtre
  if (REGEX_OUVRIR.test(t)) return { type: 'ouvrir', onglet: /orthop/.test(t) ? 'amputations' : null };
  if (vue === 'anatomie' && REGEX_FERMER_FENETRE.test(t) && !/^retour$|^reviens$/.test(t) || /^(?:ferme|quitte|sors de) (?:l |la |le )?(?:anatomie|orthopedie)/.test(t)) return { type: 'fermer-fenetre' };
  if (vue === 'anatomie' && /^(?:retour|reviens|revenir|retourne)(?: a rayle| a l accueil)?$/.test(t)) return { type: 'fermer-fenetre' };
  if (REGEX_FERMER_QUICK.test(t)) return { type: 'fermer-quick' };

  // 2. retour à la normale
  if (/\b(?:anatomie normale|corps normal|reviens (?:a )?(?:la )?normale?|remets? (?:tout )?(?:a )?(?:la )?normale?|reinitialise|reset|tout remettre)\b/.test(t) && /anatomi|corps|normal|reinit|reset|tout/.test(t)) return { type: 'normal' };
  const retire = VERBES_CACHER.test(t);
  if (retire && /\b(?:amputation|desarticulation|moignon)\b/.test(t)) return { type: 'retirer', quoi: 'amputation' };
  if (retire && /\bscoliose\b/.test(t)) return { type: 'retirer', quoi: 'scoliose' };
  if (retire && /\bfracture\b/.test(t)) return { type: 'retirer', quoi: 'fracture' };
  if (retire && /\b(?:prothese|orthese|corset|attelle|platre|appareil\w*|botte|ecarpe|echarpe)\b/.test(t)) return { type: 'retirer', quoi: 'appareil' };

  // 2 bis. fenêtre Cerveau, présentations animées
  { const c = analyserCerveau(t, brut, vue); if (c) return c; }
  { const c = analyserPresentation(t, brut, vue); if (c) return c; }

  // 3. pathologies et appareillages
  const verbeMontrer = VERBES_MONTRER.test(t) || /\bsimul\w+|\bvisualis\w+|\bmodelis\w+|\bmontre|\baffiche|\bmets\b|\bajoute|\bapplique|\bavec une\b|\bavec un\b/.test(t);
  if (/\bscoliose\b/.test(t) && (verbeMontrer || /\d/.test(t) || /\b(?:cobb|gibbosite|courbure|degres)\b/.test(t)) && !/^(?:c est quoi|qu est ce|explique)/.test(t)) {
    const m = t.match(/(\d{1,2}) ?(?:degres?|deg|°)?/), cobb = m ? Math.min(Math.max(parseInt(m[1], 10), 5), 90) : null;
    const ap = brut.match(/\b([TtLl]) ?(\d{1,2})\b/); const apex = ap ? ap[1].toUpperCase() + parseInt(ap[2], 10) : null;
    const preset = /\b(?:double|en s\b|deux courbures|double majeure)\b/.test(t) ? 'double-majeure' : /\bthoraco ?lombaire\b/.test(t) ? 'thoraco-lombaire' : /\blombaire\b/.test(t) ? 'lombaire-gauche' : /\b(?:severe|grave|importante?|chirurgicale)\b/.test(t) ? 'severe' : /\bthoracique\b/.test(t) ? 'thoracique-droite' : null;
    const conv = /\bconvexe (?:a )?gauche|\bconvexite gauche|\bgauche\b/.test(t) ? 'G' : /\bconvexe (?:a )?droite|\bconvexite droite|\bdroite\b/.test(t) ? 'D' : null;
    return { type: 'scoliose', cobb, apex: apex && SCOLIOSE.apexListe.includes(apex) ? apex : null, preset, convexite: conv };
  }
  if (/\b(?:amputation|ampute|amputee|desarticulation|moignon|syme|chopart|lisfranc)\b/.test(t) && !/^(?:c est quoi|qu est ce)/.test(t)) {
    const niv = NIVEAUX.find(([id, re]) => re.test(t));
    if (niv) return { type: 'amputation', niveau: niv[0], cote: coteDe(t) };
    return { type: 'amputation-liste' };
  }
  if (/\b(?:fracture|fracturee?|casse|cassure|cassee?|tassement)\b/.test(t) && (verbeMontrer || /\b(?:simul|montre|visualis|affiche|mets|fais|vois)\w*/.test(t)) && !/^(?:c est quoi|qu est ce|explique)/.test(t)) {
    const f = FRACTURES_MOTS.find(([id, re]) => re.test(t));
    if (f) return { type: 'fracture', id: f[0], cote: coteDe(t) === 'DG' ? 'D' : coteDe(t) };
  }
  if (/\b(?:prothese|orthese|corset|attelle|platre|appareillage|cheneau|boston|jewett|sarmiento|botte|echarpe|manchette)\b/.test(t) && (verbeMontrer || /\bavec\b/.test(t))) {
    const mod = APPAREILLAGES.find(m => (/cheneau/.test(t) && m.id === 'corset-cheneau') || (/boston/.test(t) && m.id === 'corset-boston') || (/lyon/.test(t) && m.id === 'corset-lyon') || (/nocturne|providence/.test(t) && m.id === 'corset-nocturne') || (/jewett/.test(t) && m.id === 'corset-jewett') || (/sarmiento/.test(t) && m.id === 'orthese-sarmiento'));
    const nv = NIVEAUX.find(([id, re]) => re.test(t));
    return { type: 'appareil', modele: mod ? mod.id : null, niveau: nv && !/\bcorset\b/.test(t) ? nv[0] : null, cote: coteDe(t), mot: (t.match(/\b(prothese|orthese|corset|attelle|platre|botte|echarpe|manchette)\b/) || [])[1] };
  }
  const mat = MATERIAU_MOTS.find(([id, re]) => re.test(t));
  if (mat && /\b(?:en|avec|dans|fait en|realise en|passe en|change)\b/.test(t) && COMPOSANTS_MOTS.some(([id, re]) => re.test(t)) && ctx.appareilActif !== false) {
    const comp = COMPOSANTS_MOTS.find(([id, re]) => re.test(t));
    return { type: 'materiau', composant: comp[0], materiau: mat[0] };
  }
  if (/\b(?:point|zone|appui|appuis|decharge|biomecanique|3 points|trois points)s?\b/.test(t) && /\b(?:analyse|montre|affiche|active|desactive|cache|enleve|retire)\w*/.test(t) && /\b(?:appui|appuis|decharge|forces?|biomecan\w*)\b/.test(t)) return { type: 'appuis', oui: !retire };
  { const m = brut.toLowerCase().match(/\bcorrection\b[^\d]*(\d{1,2}) ?(?:%|pour ?cent)/); if (m) return { type: 'correction', valeur: parseInt(m[1], 10) }; }

  // 4. calques (squelette + muscles…)
  const calques = analyserCalques(t);
  if (calques) return calques;

  // 5. points de vue
  if (vue === 'anatomie') { const v = VUES_MOTS.find(([id, re]) => re.test(t)); if (v && /\b(?:vue|montre|affiche|mets|passe|tourne|retourne)\b/.test(t)) return { type: 'vue', nom: v[0] }; }

  // 6. une structure : pop-up 3D (ou isolation dans la fenêtre si elle est ouverte)
  const palpation = /\b(?:palpe\w*|palpation|reperes?|reperer)\b/.test(t) || /\bou (?:palper|sent)\b/.test(t);
  const cible = R.trouver(brut);
  const repereCible = palpation ? trouverRepere(brut) : null;
  const questionCourte = /\?\s*$/.test(brut.trim()) && t.split(' ').length <= 9;
  if ((cible || repereCible) && (INTENT_DECRIRE.test(t) || questionCourte)) return { type: 'decrire', cible: repereCible || cible, question: t, isoler: /\bisole\w*/.test(t), palpation: !!repereCible };
  return null;
}
function trouverRepere(brut) {
  const t = norm(brut);
  for (const id of R.basesDe('repere')) { const d = R.definition(id); const noms = [norm(d.nom), norm(d.nom.replace(/ \(.*\)/, '')), ...((d.nom.match(/\(([^)]+)\)/) || [])[1] ? [norm(d.nom.match(/\(([^)]+)\)/)[1])] : [])]; if (noms.some(x => x && (' ' + t + ' ').includes(' ' + x + ' '))) { const c = R.coteDans(brut) || 'D'; const sid = d.sym === false ? id : id + ':' + c; return { type: 'repere', base: id, ids: [sid], cote: R.coteDans(brut), nom: d.nom }; } }
  const c = R.trouver(brut); // « palper la malléole » : les repères ont des noms proches des os → on essaie par mots-clés
  if (c && c.type === 'os') { const r = R.tous('repere').find(d => norm(d.nom).includes(norm(R.definition(c.base).nom).split(' ')[0]) && (d.os === c.base)); if (r) { const co = R.coteDans(brut) || 'D'; return { type: 'repere', base: 'repere:' + r.id, ids: ['repere:' + r.id + (r.sym === false ? '' : ':' + co)], cote: co, nom: r.nom }; } }
  return null;
}
// ───────────────────────── présentations animées et fenêtre Cerveau ─────────────────────────
const PRESENTER = /^(?:presente|presenter|presentez|presentation|fais moi une presentation|fais une presentation|lance une presentation|donne moi une presentation|je veux une presentation|anime|animer|explique en animation|montre moi en animation)\b/;
const EXPLIQUER = /^(?:explique|expliquer|detaille|detailler|raconte|parle moi de|parle de)\b/;
const MOTS_CERVEAU_CMD = /\b(?:cerveau|encephale|cerebral\w*|cortex|neurones?|cervelet|hippocampes?|amygdales?|thalamus|hypothalamus|aires? (?:de )?(?:broca|wernicke|brodmann)|corps calleux|tronc cerebral|noyaux gris|substance blanche|insula|brodmann|lobes? (?:frontal|parietal|temporal|occipital)|ventricules?)\b/;
const CALQUES_CERV = [['brodmann', /\bbrodmann\b/], ['neurones', /\b(?:neurones?|impulsions?|synapses?)\b/], ['faisceaux', /\b(?:faisceaux|fibres|connexions)\b/], ['blanche', /\bsubstance blanche\b/], ['profond', /\b(?:noyaux profonds|structures profondes)\b/], ['liquide', /\bliquide cerebro ?spinal\b/]];
const VUES_CERV = [['mediane', /\b(?:mediane?|sagittale?)\b/], ['coronale', /\b(?:coronale?|frontale)\b/], ['axiale', /\b(?:axiale?|horizontale?|transversale?)\b/], ['dessous', /\b(?:de dessous|par dessous|face inferieure|inferieure)\b/], ['dessus', /\b(?:de dessus|par dessus|face superieure|superieure)\b/], ['arriere', /\b(?:arriere|de dos|posterieure)\b/], ['avant', /\b(?:de face|avant|anterieure)\b/], ['laterale', /\b(?:laterale?|de profil|de cote)\b/]];
function analyserCerveau(t, brut, vue) {
  const dedans = vue === 'cerveau', parle = MOTS_CERVEAU_CMD.test(t);
  if (!dedans && !parle) return null;
  if (!dedans && /\b(?:entite|fond|theme|ambiance|couleur|combien|pourquoi|comment)\b/.test(t)) return null;      // « passe en entité cerveau », questions de culture générale : pas pour la fenêtre
  if (dedans && /^(?:ferme|fermer|quitte|quitter|sors|sortir|retour|reviens|revenir|retourne|retourner)(?: moi)?(?: de| a| sur| vers| au| du| de la| de l)*(?: la| le| l| mon| ma| les)* ?(?:fenetre )*(?:cerveau|rayle|accueil|menu|ecran principal|principal)?$/.test(t)) return { type: 'fermer-fenetre' };
  if (/^(?:ouvre|ouvrir|lance|lancer|affiche|afficher|montre|montrer|va|aller|passe|passer)(?: moi)?(?: sur| dans| vers| a| au| en)?(?: la| le| l| mon| ma| les| un| une)* ?(?:fenetre |page |module |vue |atlas )*(?:du )?(?:cerveau|encephale|cerveau en 3d|cerveau 3d|modele 3d du cerveau|3d du cerveau|neuro ?anatomie)$/.test(t)) return { type: 'cerveau-ouvrir' };
  if (/\b(?:tour|visite|parcours)\b.*\bcerveau\b|\bcerveau\b.*\b(?:tour|visite guidee)\b/.test(t)) return { type: 'presenter', requete: 'tour du cerveau', ctx: { vue: 'cerveau' } };
  const q = t.match(/\bqualite\b.*\b(eco|standard|haute|ultra)\b|\b(?:mode|niveau) (eco|standard|haute|ultra)\b/);
  if (q && (dedans || parle)) return { type: 'cerveau-qualite', niveau: q[1] || q[2] };
  const retire = VERBES_CACHER.test(t);
  // vues et coupes (hors verbes de présentation)
  if (!PRESENTER.test(t) && /\b(?:coupe|vue|section|plan)\b/.test(t)) { const v = VUES_CERV.find(([id, re]) => re.test(t)); if (v) { const nom = /\bcoupe|section/.test(t) && v[0] === 'laterale' ? 'mediane' : v[0]; return { type: 'cerveau-vue', vue: nom, cote: /\b(?:hemisphere )?droit\b/.test(t) ? 'droit' : /\b(?:hemisphere )?gauche\b/.test(t) ? 'gauche' : null }; } }
  const cal = CALQUES_CERV.find(([id, re]) => re.test(t));
  if (cal && (dedans || parle) && (retire || VERBES_MONTRER.test(t) || /\b(?:active|desactive)\w*/.test(t)) && !CV.trouverReseau(t)) return { type: 'cerveau-calque', calque: cal[0], oui: !retire && !/\bdesactive/.test(t) };
  const reseau = CV.trouverReseau(t);
  if (reseau && /\b(?:reseau|neurones?|activite|impulsions?|circuit)\b/.test(t) && !PRESENTER.test(t) && !EXPLIQUER.test(t)) return { type: 'cerveau-reseau', id: reseau.id };
  if (retire && /\b(?:neurones?|reseau|zone|selection)\b/.test(t)) return { type: 'cerveau-reinit' };
  const zone = CV.trouverZone(brut, { strict: !(dedans || /\b(?:cerveau|encephale|cerebral\w*|cortex)\b/.test(t)) });
  if (zone && !PRESENTER.test(t) && !EXPLIQUER.test(t) && (INTENT_DECRIRE.test(t) || VERBES_MONTRER.test(t) || /\?\s*$/.test(brut.trim()))) return { type: 'cerveau-zone', id: zone.id, question: t, vue: /\b(?:medial\w*|mediane?|interne)\b/.test(t) ? 'mediane' : null };
  if (zone && (EXPLIQUER.test(t) || PRESENTER.test(t))) return { type: 'presenter', requete: brut, ctx: { vue: 'cerveau' } };
  return null;
}
function analyserPresentation(t, brut, vue) {
  const veut = PRESENTER.test(t) || EXPLIQUER.test(t) && /\bcouche par couche\b|\ben animation\b/.test(t) || /\bcouche par couche\b/.test(t) && VERBES_MONTRER.test(t) || /\b(?:presentation|animation) (?:anime\w* )?(?:de|du|des|de la|de l)\b/.test(t);
  if (!veut) return null;
  const r = P.resoudre(brut, { vue }); if (!r) return null;
  return { type: 'presenter', requete: brut, famille: r.famille, ctx: { vue } };
}
function analyserCalques(t) {
  const retire = VERBES_CACHER.test(t), montre = VERBES_MONTRER.test(t) || /^(?:les |le |la |l )?(?:squelette|muscles?|arteres?|veines?|nerfs?|organes?|peau|dermatomes?)/.test(t);
  if (!retire && !montre) return null;
  let objet = t.replace(VERBES_MONTRER, ' ').replace(VERBES_CACHER, ' ').replace(/\b(?:moi|donc|aussi|encore|uniquement|seulement|juste|que|le|la|les|l|un|une|des|du|de|d|au|aux|mon|ma|mes|systemes?|calques?|couches?|en plus|par dessus|dessus)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const seul = /\b(?:uniquement|seulement|juste|que)\b/.test(t) || /^(?:affiche|montre|passe|mets)(?: moi)?(?: en| sur)? (?:mode )?/.test(t) && /\bseul\w*\b/.test(t);
  const morceaux = objet.split(COUP).map(x => x.trim()).filter(Boolean);
  if (!morceaux.length) return null;
  const liste = [];
  for (const m of morceaux) {
    const c = CALQUES_MOTS.map(([id, re]) => [id, re, (m.match(re) || [''])[0].length]).filter(x => x[2]).sort((a, b) => b[2] - a[2])[0];
    if (!c) return null;
    // le morceau ne doit contenir que le mot-clé du calque (sinon c'est une structure précise : « muscles de l'avant-bras »)
    const reste = m.replace(c[1], ' ').replace(/\b(?:osseux|musculaires?|nerveux|squelette|visceres|internes|anatomiques?|osseuses?)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (reste) return null;
    if (!liste.includes(c[0])) liste.push(c[0]);
  }
  return { type: 'calques', liste, mode: retire ? 'retirer' : seul ? 'seul' : /^(?:ajoute|ajouter|superpose|superposer|rajoute)\b/.test(t) || /\ben plus\b|\bpar dessus\b|\bavec\b/.test(t) ? 'ajouter' : 'ajouter-ou-seul' };
}

// ───────────────────────── exécution ─────────────────────────
const NOMS_CALQUES = { squelette: 'le squelette', muscles: 'les muscles', arteres: 'les artères', veines: 'les veines', nerfs: 'les nerfs', organes: 'les organes', peau: 'la peau', reperes: 'les repères', dermatomes: 'les dermatomes' };
const liste = a => a.length <= 1 ? a[0] || '' : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1];
const attendre = ms => new Promise(r => setTimeout(r, ms));
const vueCourante = () => (window.RayleBus && RayleBus.demander('vue')) || 'rayle';

async function ouvrirFenetre(onglet) {
  if (vueCourante() !== 'anatomie') { await RayleBus.demander('vue:ouvrir-anatomie', onglet ? { onglet } : null); }
  else if (onglet) A.onglet(onglet);
  for (let i = 0; i < 40 && !S.obtenir().fenetre.ouverte; i++) await attendre(50);
}
async function extraitCours(requete, extra) {
  try { const r = await K.chercher(requete, 1, extra); if (r.length && r[0].score > 1.2) { const p = r[0].texte.replace(/\s+/g, ' '); const phrase = (p.match(/^[^.!?]{40,}[.!?]/) || [p.slice(0, 200)])[0]; return ' Dans votre cours « ' + r[0].titre + ' » : ' + phrase.slice(0, 240); } } catch (e) { }
  return '';
}
function appliquerDecrire(c) {
  const cible = c.cible;
  if (vueCourante() === 'anatomie' && !cible.groupe) {
    const id = cible.ids[0], t = R.typeDe(id), cal = { os: 'squelette', muscle: 'muscles', nerf: 'nerfs', organe: 'organes', repere: 'reperes' }[t];
    if (cal && !S.obtenir().calques[cal]) A.basculerCalque(cal, true);
    A.selectionner(id); if (c.isoler || t === 'muscle') A.isoler(id);
    return true;
  }
  return false;
}

async function ouvrirCerveau(options) {
  if (vueCourante() !== 'cerveau') await RayleBus.demander('vue:ouvrir-cerveau', options || null);
  for (let i = 0; i < 80 && !(window.RayleCerveau && window.RayleCerveau.etat().ouvert); i++) await attendre(50);
  const c = window.RayleCerveau; if (!c) throw new Error('fenêtre Cerveau indisponible');
  if (options === undefined || options === null) await new Promise(r => setTimeout(r, 0));
  return c;
}
const phraseSecours = (script) => script && script.etapes ? script.etapes.slice(0, 3).map(e => e.narration).join(' ') : '';
async function presenterScript(c) {
  const script = P.scriptPour(c.requete, c.ctx || { vue: vueCourante() });
  if (!script) return null;
  const cerveau = /^cerveau/.test(script.type);
  try {
    if (cerveau) { const cv = await ouvrirCerveau(); await cv.presenter(script); }
    else { await ouvrirFenetre(); const m = await import('./lecteur-anatomie.js?v=2026.10.14.3'); await m.lancerPresentation(script); }
  } catch (e) { return 'Je ne peux pas lancer l’animation 3D (' + (e && e.message || e) + ') ; voici le début : ' + phraseSecours(script); }
  const cible = script.titre.toLowerCase();
  return 'Je lance la présentation : ' + cible + '. ' + script.etapes.length + ' étapes, avec sous-titres ; touchez pause, suivant ou la vitesse quand vous voulez.';
}

export async function executer(c) {
  if (!c) return null;
  switch (c.type) {
    case 'presenter': return await presenterScript(c);
    case 'cerveau-ouvrir': await ouvrirCerveau(); return 'Voici le cerveau en 3D. Touchez une zone pour la décrire, ou dites par exemple « montre l’hippocampe » ou « fais-moi un tour du cerveau ».';
    case 'cerveau-zone': { const cv = await ouvrirCerveau(); const z = CV.ZONE_PAR_ID[c.id]; if (!z) return null; cv.zone(c.id, { vue: c.vue || undefined }); return CV.resumeZone(c.id, c.question); }
    case 'cerveau-reseau': { const cv = await ouvrirCerveau(); const r = CV.RESEAU_PAR_ID[c.id]; if (!r) return null; cv.reseau(c.id); return r.nom + ' : ' + r.description; }
    case 'cerveau-vue': { const cv = await ouvrirCerveau(); if (c.cote) cv.cote(c.cote); cv.vue(c.vue); return 'Vue ' + ({ laterale: 'latérale', mediane: 'médiane, en coupe sagittale', coronale: 'en coupe coronale', axiale: 'en coupe axiale', dessus: 'de dessus', dessous: 'de dessous', avant: 'de face', arriere: 'de l’arrière' }[c.vue] || c.vue) + '.' + (/mediane|coronale|axiale/.test(c.vue) ? ' Le curseur « Position de la coupe » la déplace.' : ''); }
    case 'cerveau-calque': { const cv = await ouvrirCerveau(); cv.calque(c.calque, c.oui); const noms = { brodmann: 'les aires de Brodmann', neurones: 'les neurones animés', faisceaux: 'les faisceaux de substance blanche', blanche: 'la substance blanche', profond: 'les noyaux profonds', liquide: 'le liquide cérébro-spinal' }; return (c.oui ? 'J’affiche ' : 'Je masque ') + noms[c.calque] + (c.calque === 'brodmann' && c.oui ? ' ; la carte est approximative' : '') + '.'; }
    case 'cerveau-qualite': { const cv = await ouvrirCerveau(); await cv.niveau(c.niveau); return 'Qualité ' + c.niveau + ' pour le cerveau.' + (c.niveau === 'ultra' ? ' C’est très gourmand : si l’image devient trop lente, je repasse au palier inférieur.' : ''); }
    case 'cerveau-reinit': { const cv = await ouvrirCerveau(); cv.zone(null); cv.reseau(null); return 'Sélection effacée.'; }
    case 'ouvrir': await ouvrirFenetre(c.onglet); return "Voici la fenêtre Anatomie et Orthopédie. Touchez une structure pour la décrire, ou dites par exemple « affiche les muscles » ou « amputation trans-tibiale ».";
    case 'fermer-fenetre': if (window.RayleLecteur) { try { window.RayleLecteur.fermer(); } catch (e) { } } RayleBus.demander('vue:fermer'); return 'Retour à l’accueil.';
    case 'fermer-quick': { const q = await import('./quickview.js?v=2026.10.14.3'); if (!q.quickOuvert()) return null; q.fermerQuick(); return 'Fenêtre 3D fermée.'; }
    case 'normal': await ouvrirFenetre(); A.toutNormal(); A.selectionner(null); A.toutAfficher(); setTimeout(() => { const m = window.RayleAnatomieMoteur; m && m.vue('face'); }, 60); return 'Anatomie normale rétablie.';
    case 'retirer': {
      const e = S.obtenir();
      if (c.quoi === 'amputation') A.amputation(null); else if (c.quoi === 'scoliose') A.scoliose(null); else if (c.quoi === 'fracture') A.fracture(null); else A.appareil(null);
      return c.quoi === 'appareil' ? 'J’ai retiré l’appareillage.' : 'C’est retiré.';
    }
    case 'calques': {
      await ouvrirFenetre();
      const e = S.obtenir();
      if (c.mode === 'retirer') { c.liste.forEach(n => A.basculerCalque(n, false)); return 'Je masque ' + liste(c.liste.map(n => NOMS_CALQUES[n])) + '.'; }
      const surcouche = c.mode === 'ajouter' || (c.mode === 'ajouter-ou-seul' && c.liste.length === 1 && Object.values(e.calques).filter(Boolean).length > 0 && false);
      if (c.mode === 'ajouter') c.liste.forEach(n => A.basculerCalque(n, true)); else A.seulementCalques(c.liste);
      return (c.mode === 'ajouter' ? 'J’ajoute ' : 'J’affiche ') + liste(c.liste.map(n => NOMS_CALQUES[n])) + '.';
    }
    case 'vue': { await ouvrirFenetre(); const m = window.RayleAnatomieMoteur; m && m.vue(c.nom); return 'Vue ' + { face: 'de face', dos: 'de dos', gauche: 'de profil gauche', droite: 'de profil droit', dessus: 'de dessus' }[c.nom] + '.'; }
    case 'amputation-liste': await ouvrirFenetre('amputations'); return 'Voici les niveaux d’amputation : choisissez-en un, ou dites par exemple « amputation trans-fémorale à gauche ».';
    case 'amputation': {
      const def = AMPUTATIONS.find(a => a.id === c.niveau); if (!def) return null;
      await ouvrirFenetre('amputations');
      const cote = c.cote || (S.obtenir().pathologie.amputation && S.obtenir().pathologie.amputation.cote) || 'D';
      A.amputation(def.id, cote); A.seulementCalques(S.obtenir().calques.muscles ? ['squelette', 'muscles'] : ['squelette']);
      setTimeout(() => { const m = window.RayleAnatomieMoteur; m && m.cadrerAmputation(def.id, cote); }, 60);
      return def.nom + (cote === 'DG' ? ' des deux côtés' : cote === 'D' ? ' à droite' : ' à gauche') + '. ' + (/^moignon/i.test(def.moignon) ? def.moignon : 'Moignon : ' + def.moignon.replace(/^Idéal : /, 'idéalement ')) + ' Dites « mets une prothèse » pour l’appareiller.';
    }
    case 'scoliose': {
      await ouvrirFenetre('deformations');
      const p = c.preset ? SCOLIOSE.presets.find(x => x.id === c.preset) : null;
      let courbes = p ? JSON.parse(JSON.stringify(p.courbes)) : (S.obtenir().pathologie.scoliose ? JSON.parse(JSON.stringify(S.obtenir().pathologie.scoliose.courbes)) : [{ apex: 'T8', cobb: 30, convexite: 'D' }]);
      if (c.cobb != null) { const max = courbes.reduce((m, x) => Math.max(m, x.cobb), 0) || 1; courbes = courbes.length > 1 ? courbes.map(x => Object.assign(x, { cobb: Math.round(x.cobb * c.cobb / max) })) : [Object.assign(courbes[0], { cobb: c.cobb })]; }
      if (c.apex) courbes[0].apex = c.apex; if (c.convexite) courbes[0].convexite = c.convexite;
      A.scoliose({ courbes }); A.seulementCalques(['squelette']); setTimeout(() => { const m = window.RayleAnatomieMoteur; m && m.vue('dos', 'tronc'); }, 80);
      const g = SCOLIOSE.gravite(Math.max(...courbes.map(x => x.cobb)));
      return 'Scoliose : ' + courbes.map(x => 'courbure ' + (x.convexite === 'D' ? 'droite' : 'gauche') + ' de ' + x.cobb + ' degrés de Cobb, sommet en ' + x.apex).join(', ') + '. Gravité ' + g.niveau.toLowerCase() + '. ' + g.conduite;
    }
    case 'fracture': {
      const f = FRACTURES.find(x => x.id === c.id); if (!f) return null;
      await ouvrirFenetre('fractures');
      A.fracture({ id: f.id, cote: c.cote || 'D', os: f.os, plan: f.plan, type: f.type, angulation: f.angulation || 0, decalage: f.decalage || 0, raccourcissement: f.raccourcissement || 0, rotation: f.rotation || 0 });
      A.seulementCalques(['squelette']);
      setTimeout(() => { const m = window.RayleAnatomieMoteur; const sid = f.os[0].id.startsWith('vertebre-') ? f.os[0].id : f.os[0].id + ':' + (c.cote || 'D'); m && m.focaliser(sid); }, 120);
      return f.nom + '. ' + f.deplacement + ' Traitement : ' + f.traitement;
    }
    case 'appareil': {
      await ouvrirFenetre('appareillage');
      let e = S.obtenir(), p = e.pathologie;
      if (c.niveau && (!p.amputation || p.amputation.niveau !== c.niveau)) { A.amputation(c.niveau, c.cote || (p.amputation && p.amputation.cote) || 'D'); e = S.obtenir(); p = e.pathologie; }
      if (!p.amputation && !p.scoliose && !p.fracture) {
        if (/corset|orthese/.test(c.mot || '')) { A.scoliose({ courbes: SCOLIOSE.presets[0].courbes }); p = S.obtenir().pathologie; }
        else return 'Il faut d’abord une pathologie : dites par exemple « amputation trans-tibiale à droite », « scoliose de 35 degrés » ou « fracture du radius ».';
      }
      const compat = appareilsCompatibles(S.obtenir().pathologie);
      const choisi = (c.modele && compat.find(m => m.id === c.modele)) || compat.find(m => !c.mot || m.categorie.toLowerCase().startsWith((c.mot || '').slice(0, 4)) || (c.mot === 'prothese' && m.categorie === 'Prothèse')) || compat[0];
      if (!choisi) return 'Je n’ai pas d’appareillage adapté à cette situation.';
      A.appareil(choisi.id); A.seulementCalques(['squelette']);
      return 'Appareillage affiché : ' + choisi.nom + '. ' + choisi.biomecanique.split('. ')[0] + '. Les points d’appui sont en orange et les zones de décharge en bleu.';
    }
    case 'materiau': {
      const e = S.obtenir(), m = APPAREILLAGES.find(x => x.id === e.appareillage.modele);
      if (!m || !e.appareillage.actif) return 'Choisissez d’abord un appareillage (prothèse, corset ou orthèse), puis dites par exemple « emboîture en carbone ».';
      const comp = m.composants.find(x => x.id === c.composant && x.choix.includes(c.materiau)) || m.composants.find(x => x.choix.includes(c.materiau));
      if (!comp) return 'Ce matériau n’est pas proposé pour cet appareillage.';
      A.materiau(comp.id, c.materiau); const mat = MATERIAUX.find(x => x.id === c.materiau);
      return comp.nom + ' en ' + mat.nom + '. ' + mat.avantages + ' Limite : ' + mat.limites;
    }
    case 'appuis': A.reglerAppareil({ appuis: c.oui }); return c.oui ? 'Appuis en orange, décharges en bleu.' : 'Zones d’appui masquées.';
    case 'correction': A.reglerAppareil({ correction: Math.min(c.valeur, 70) }); return 'Correction en corset réglée à ' + Math.min(c.valeur, 70) + ' pour cent.';
    case 'decrire': {
      const cible = c.cible;
      const id = cible.ids[0]; if (!id) return null;
      const texte = cible.groupe ? cible.nom + ' : ' + cible.ids.length + ' pièces affichées, touchez-en une pour la décrire.' : R.resume(id, c.question);
      if (!appliquerDecrire(c)) { const q = await import('./quickview.js?v=2026.10.14.3'); await q.afficherQuick(cible.groupe ? cible : (typeof cible === 'string' ? cible : { base: cible.base, ids: cible.ids, cote: cible.cote, nom: cible.nom, groupe: !!cible.groupe })); }
      const cours = cible.groupe ? '' : await extraitCours(R.nomAffiche(id).replace(/ (droit|gauche|droite)$/, '') + ' ' + c.question, []);
      return texte + cours;
    }
  }
  return null;
}
export { appareilsCompatibles };
