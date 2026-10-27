/* ═════════════ GRAMMAIRE DES COMMANDES VOCALES DE LA GALAXIE ═════════════
   Fonction pure (testée sous Node : galaxie/tests/grammaire-test.mjs). Elle reçoit la phrase déjà normalisée
   (minuscules, sans accents ni ponctuation) et le lexique issu des manifestes : aucun nom de planète n'est écrit ici.
   Résultat : null (ce n'est pas pour la galaxie) ou { type, cible?, etat? } avec
     aller        : voler jusqu'à une cible du lexique
     ouvrir       : ouvrir la galaxie (vue d'ensemble)
     vue_ensemble : revenir à la vue d'ensemble
     retour       : « retour » dans la galaxie (un cran en arrière, ou sortie)
     quitter      : fermer la galaxie, retour à Raylé
     mode_jeu     : { etat: 'actif' | 'inactif' }
     qualite      : { niveau: 'auto' | 'haute' | 'moyenne' | 'basse' }
     mesurer      : test de performance
     fps_valeur   : « combien d'images par seconde ? »
     fps          : { etat: 'actif' | 'inactif' } (compteur d'images par seconde)
     orbites      : { etat: 'actif' | 'inactif' } (traits des orbites)
     base_entrer / base_sortir / bureau : la base martienne (Mars)
     reglages     : { etat: 'ouvrir' | 'fermer' } (panneau de réglages de la galaxie)
     vaisseau_entrer (partout) ; à bord seulement (etat.vaisseau) : vaisseau_aller { cible }, vaisseau_vue { vue }, vaisseau_asseoir, vaisseau_lever, salle_ouvrir, salle_fermer,
     vaisseau_stop, vaisseau_orbite, vaisseau_commandes, vaisseau_reglage { reglage, etat } */

const POLITESSE = /^(?:s il (?:te|vous) plait |stp |peux tu |pouvez vous |tu peux |vous pouvez |est ce que tu peux |dis moi |raylé |rayle )+/;
const FIN_POLIE = / (?:stp|s il (?:te|vous) plait|maintenant|tout de suite)$/;
const VERBES_ALLER = '(?:va|vas|aller|allons|emmene|amene|conduis|vole|voler|fonce|foncer|direction|cap sur|rends toi|rendons nous|transporte|envoie|dirige|montre|montrer|affiche|afficher|ouvre|ouvrir|zoome|zoomer|approche|approcher|visite|visiter|regarde|regarder|retourne|retourner|reviens|revenir)';
const PREP = '(?:(?:sur|vers|a|au|aux|jusqu a|jusqu au|jusqu aux|dans|en|chez) )?';
const ARTICLES = '(?:(?:la|le|l|les|un|une|ma|mon|notre|cette|ce) )*';
const GALAXIE = '(?:galaxie|systeme solaire|univers)';
const AUTRES = /\b(?:quoi|comment|pourquoi|combien|quel|quelle|quels|explique|expliquer|prix|cours|meteo|actualite|actualites|qu est ce|c est quoi|raconte|parle)\b/;
const NIVEAUX_PAROLE = [
  ['auto', /\b(?:auto|automatique|automatiquement)\b/],
  ['haute', /\b(?:haute|hautes|maximale|maximum|max|elevee|ultra|meilleure)\b/],
  ['moyenne', /\b(?:moyenne|moyen|moderee|normale|intermediaire)\b/],
  ['basse', /\b(?:basse|bas|minimale|minimum|min|faible|legere|economique)\b/]
];
const FPS_MOT = '(?:compteur d images par seconde|compteur d images|compteur de fps|compteur fps|images par seconde|images seconde|fps)';

export function analyserCommandeGalaxie(brut, lexique = [], etat = {}) {
  let n = String(brut || '').replace(/\s+/g, ' ').trim();
  n = n.replace(POLITESSE, '').replace(FIN_POLIE, '').replace(/\b(montre|ouvre|mets|met|donne|affiche|passe|fais|fait|regarde|emmene|amene|conduis) (?:moi|nous)\b/, '$1').trim();
  if (!n || n.split(' ').length > 9) return null;
  const ouvert = !!etat.ouvert;

  // 1. Mode jeu (valable partout : c'est un réglage de toute l'application)
  if (/\bmode jeux?\b/.test(n) && !AUTRES.test(n)) {
    if (/\b(?:desactive|desactiver|coupe|couper|arrete|arreter|quitte|quitter|sors|sortir|retire|retirer|enleve|enlever|fin|stop|termine|terminer)\b/.test(n)) return { type: 'mode_jeu', etat: 'inactif' };
    return { type: 'mode_jeu', etat: 'actif' };
  }

  // 1 bis. Réglages de la galaxie : qualité, mesures, compteur, panneau
  if (/^(?:combien d |combien de |quel est le |quels sont les |a combien d |a combien de |ca tourne a combien)/.test(n) && new RegExp(FPS_MOT + '|\\bfps\\b').test(n)) return { type: 'fps_valeur' };
  if (!/\b(?:quoi|comment|pourquoi|explique|expliquer|qu est ce)\b/.test(n)) {
    if (/\b(?:mesure|mesurer|teste|tester|lance|lancer|fais|faire|evalue|evaluer|verifie|verifier)\b.*\b(?:performances?|fluidite|fps|images par seconde)\b/.test(n) || /^(?:test|banc|benchmark)(?: de| des)? ?(?:performances?|fluidite)?$/.test(n) || /\bbenchmark\b/.test(n)) return { type: 'mesurer' };
    const q = /\b(?:qualite|graphismes?|graphisme)\b/.test(n) && NIVEAUX_PAROLE.find(([, re]) => re.test(n));
    if (q && n.split(' ').length <= 7) return { type: 'qualite', niveau: q[0] };
    const mFps = n.match(new RegExp('^(?:(affiche|afficher|montre|montrer|active|activer|mets|met|mettre|ajoute|ajouter)|(cache|cacher|masque|masquer|desactive|desactiver|retire|retirer|enleve|enlever|coupe|couper|supprime|supprimer)) (?:moi )?(?:les |le |l |des |un )?' + FPS_MOT + '$'));
    if (mFps) return { type: 'fps', etat: mFps[1] ? 'actif' : 'inactif' };
    const mOrb = n.match(/^(?:(affiche|afficher|montre|montrer|active|activer|mets|met|mettre|ajoute|ajouter|trace|tracer)|(cache|cacher|masque|masquer|desactive|desactiver|retire|retirer|enleve|enlever|coupe|couper|supprime|supprimer|efface|effacer)) (?:moi )?(?:les |le |l |des |un )?(?:orbites?|trajectoires?|trajets des planetes)$/);
    if (mOrb) return { type: 'orbites', etat: mOrb[1] ? 'actif' : 'inactif' };
    const pan = n.match(/^(?:(ouvre|ouvrir|affiche|afficher|montre|montrer)|(ferme|fermer|cache|cacher|masque|masquer)) (?:moi )?(?:les |le |la |l |mes )?(?:reglages?|parametres?|options?)(?: (?:de la |de l |de |du )?(?:galaxie|3d|graphiques?|graphismes?|qualite))?$/);
    if (pan) {
      const precise = /galaxie|3d|graphi|qualite/.test(n);
      if (precise || ouvert) return { type: 'reglages', etat: pan[1] ? 'ouvrir' : 'fermer' };
    }
  }
  if (AUTRES.test(n) && !(etat.salle && /^(?:explique|parle|c est quoi|qu est ce)/.test(n))) return null;

  // 1 ter. Mars : la base (entrer, sortir) et son bureau (pas encore aménagé). « terminal » et « salon » seuls ne sont pas pris : le terminal 2D a ses propres commandes.
  const NOM_BASE = '(?:(?:la|le|l|notre|ma|cette) )?(?:base|station)(?: martienne| de mars| sur mars)?';
  if (new RegExp('^(?:entre|entrer|rentre|rentrer|descends|descendre|penetre|va|aller|retourne|retourner)(?: a l interieur de| a l interieur| dedans| dans| sur| en| a| au)? ?' + NOM_BASE + '$').test(n)) return { type: 'base_entrer' };
  if (new RegExp('^(?:sors|sortir|ressors|ressortir|quitte|quitter|reviens|revenir|retourne|retourner|remonte|remonter)(?: de| hors de| dehors de| a l exterieur de| en dehors de| d)? ?' + NOM_BASE + '$').test(n)) return { type: 'base_sortir' };
  if (new RegExp('^(?:va|vas|aller|entre|entrer|ouvre|ouvrir|montre|montrer|visite|visiter|affiche|afficher)(?: a| au| dans| sur| vers)? ?(?:(?:la|le|l|mon|notre) )?(?:partie )?(?:bureau|bureaux)(?: de la base| martien| de mars)?$').test(n)) return { type: 'bureau' };

  // 1 quater. Saturne : le vaisseau d'anatomie « Vésale » (monter à bord ; puis, à bord seulement : cap, vues, siège, salle médicale, arrêt, orbite, commandes, assistance)
  const BORD = '(?:(?:le|l|mon|notre|du) )?(?:vaisseau|vesale|vaisseau d anatomie|vaisseau anatomie)';
  if (new RegExp('^(?:monte|monter|embarque|embarquer|entre|entrer|rentre|rentrer|monte moi|embarque moi)(?: a bord(?: de| du)?| dans| sur| a| au)? ?' + BORD + '?$').test(n) && /vaisseau|vesale|a bord|embarqu/.test(n)) return { type: 'vaisseau_entrer' };
  if (etat.vaisseau) {
    const ASTRE = '(?:(?:la|le|l|les) )?(?:planete |astre )?(.+)';
    const mc = n.match(new RegExp('^(?:pilote automatique|autopilote|emmene|amene|conduis|dirige|pilote|pars|partons|vole|volons|fonce|va|vas|aller|mets le cap|mets cap|cap|direction)(?: moi| nous| toi| le vaisseau)?(?: sur| vers| a| au| jusqu a| jusqu au| en direction de)? ?' + ASTRE + '$'));
    if (mc) { const cible = trouverCible(mc[1].trim(), lexique) || trouverCible(mc[1].trim().replace(/^(?:planete|astre) /, ''), lexique); if (cible && !/vaisseau|base|lune/.test(cible.id)) return { type: 'vaisseau_aller', cible: cible.id === 'rayle' ? 'soleil' : cible.id }; }
    const mv = n.match(/^(?:vue|passe en vue|mets la vue|mets en vue|camera|passe en camera)(?: du| de la| de| en| a l)? ?(cockpit|exterieure?|libre|interieure?)$/);
    if (mv) return { type: 'vaisseau_vue', vue: /cockpit|interieur/.test(mv[1]) ? 'cockpit' : /libre/.test(mv[1]) ? 'libre' : 'exterieur' };
    if (/^(?:assieds toi|assois toi|assieds vous|installe toi|prends les commandes|prends la place du pilote|prends le siege)$/.test(n)) return { type: 'vaisseau_asseoir' };
    if (/^(?:leve toi|leve vous|debout|quitte le siege)$/.test(n)) return { type: 'vaisseau_lever' };
    if (/^(?:ouvre|ouvrir|va|aller|vas|entre|entrer|passe|passer|emmene|conduis|emmene moi|conduis moi|monte|descends)(?: dans| a| en| vers| sur| au)? ?(?:(?:la|le|l) )?(?:salle medicale|infirmerie|salle d anatomie|salle anatomie)$/.test(n)) return { type: 'salle_ouvrir' };
    if (/^(?:ferme|fermer|quitte|quitter|sors de|sortir de|retourne|retourner|retour|reviens|revenir|rentre|rentrer)(?: de| au| a| dans| vers)? ?(?:(?:la|le|l) )?(?:salle medicale|cockpit|poste de pilotage|pont)$/.test(n)) return { type: 'salle_fermer' };
    if (/^(?:arrete|arreter|stoppe|stopper|stop|freine|freiner|immobilise|immobiliser|coupe les moteurs|coupe le pilote automatique|annule le pilote automatique)(?: le| ce| la| nous)?(?: vaisseau| moteurs?)?$/.test(n)) return { type: 'vaisseau_stop' };
    if (/^(?:mets|met|mettre|place|placer|passe|passer|mise)(?: toi| nous| le vaisseau| le)? ?en orbite$/.test(n) || /^mise en orbite$/.test(n)) return { type: 'vaisseau_orbite' };
    if (/^(?:affiche|afficher|montre|montrer|ouvre|ouvrir)(?: moi)? ?(?:les |le |mes )?(?:commandes|schema des commandes|controles|schema de commandes)$/.test(n)) return { type: 'vaisseau_commandes' };
    if (etat.salle) {                                                       // table holographique d'anatomie (S2)
      const SYS = { squelette: 'squelette', os: 'squelette', osseux: 'squelette', muscles: 'muscles', musculaire: 'muscles', arteres: 'arteres', veines: 'veines', nerfs: 'nerfs', 'nerfs craniens': 'nerfs', cerveau: 'cerveau', encephale: 'cerveau', cervelet: 'cerveau', nerveux: 'nerfs', 'nerfs peripheriques': 'nerfs_peripheriques', 'nerfs des membres': 'nerfs_peripheriques', 'plexus brachial': 'nerfs_peripheriques', ligaments: 'ligaments', coeur: 'coeur', poumons: 'poumons', digestif: 'digestif', dents: 'dents' };
      if (/^(?:arrete|arreter|stoppe|stopper|coupe|couper|termine|terminer|fin du|fin de la) (?:le |la |l )?(?:mouvement|marche|squat|animation du mouvement)$/.test(n)) return { type: 'anat_mouvement_stop' };
      if (/^(?:enleve|enlever|retire|retirer|supprime|supprimer|annule|annuler|efface|effacer|arrete|arreter|ferme|fermer|retour a la normale|reviens a la normale) (?:la |le |l |les )?(?:pathologie|cas|deformation|fracture|amputation|scoliose|handicap)?$/.test(n) && /pathologie|cas|deformation|fracture|amputation|scoliose|handicap/.test(n)) return { type: 'anat_patho_stop' };
      const PATHO = /scoliose|cyphose|amputation|desarticulation|fracture|pied tombant|main tombante|hemiplegi|genu |valgum|varum|pied bot|aplasie|hemimelie|deficience|pouteau|lisfranc|chopart|syme|steppage|hemipelvectomie|interscapulo/;
      const mp = n.match(/^(?:montre|montrer|affiche|afficher|simule|simuler|fais|faire|presente|presenter|explique|expliquer|decris|decrire|visualise|visualiser)(?: moi)?(?: (?:une|un|les|le|la|l|des|du))? ?(.+)$/);
      if (mp && PATHO.test(mp[1])) { const deg = mp[1].match(/(\d{1,2}) ?(?:degres?|°)/), cote = /gauche/.test(mp[1]) ? 'gauche' : /droit/.test(mp[1]) ? 'droit' : null; return { type: 'anat_patho', nom: mp[1].replace(/ de \d{1,2} ?(?:degres?|°)/, '').trim(), valeur: deg ? +deg[1] : undefined, cote }; }
      const MVT = /marche|marcher|squat|accroupi|flexion|extension|abduction|rotation (?:de la )?tete|dire non|tourner la tete|lever (?:la jambe|le bras|les bras)|plier le (?:genou|coude)|se pencher|toucher les pieds|mouvement|dorsiflexion|ecarter (?:la jambe|le bras)/;
      const mv = n.match(/^(?:montre|montrer|anime|animer|lance|lancer|fais|faire|joue|jouer|simule|simuler|explique|expliquer|decris|decrire|presente|presenter)(?: moi)?(?: (?:une|un|les|le|la|l))? ?(.+)$/);
      if (mv && MVT.test(mv[1]) && !/^(?:le |la |les )?(?:muscles?|os|squelette)\b/.test(mv[1])) return { type: 'anat_mouvement', mouvement: mv[1].trim() };
      if (/^(?:accroupis toi|marche|fais un squat|fais le squat|fais des squats)$/.test(n)) return { type: 'anat_mouvement', mouvement: n === 'marche' ? 'marche' : 'squat' };
      const ms = n.match(/^(?:affiche|afficher|montre|montrer|ajoute|ajouter|mets|mettre|charge|charger)(?: moi)? ?(?:(?:le|la|les|l|mon|ma|mes) )?(?:systeme )?(squelette|os|muscles|arteres|veines|nerfs peripheriques|nerfs des membres|plexus brachial|nerfs|ligaments|coeur|poumons|digestif|dents|cerveau|encephale|cervelet|nerfs craniens|systeme nerveux|systeme musculaire)$/);
      if (ms) return { type: 'anat_systeme', systeme: SYS[ms[1].replace(/^systeme /, '')] || 'squelette' };
      if (/^(?:affiche|afficher|montre|montrer|remets|remettre|reaffiche|reafficher) (?:moi )?(?:tout|tout le corps|tout le reste|le tout)$|^(?:reinitialise|reinitialiser|efface|effacer) (?:la |l |les )?(?:selection|vue|affichage)$/.test(n)) return { type: 'anat_tout' };
      if (/^(?:anime|animer|lance|lancer|active|activer|demarre|demarrer|montre|montrer) (?:moi )?(?:la |le |l |les )?(?:circulation(?: sanguine)?|flux(?: sanguin)?|animation|influx nerveux|battements?(?: du coeur)?)$/.test(n)) return { type: 'anat_flux', etat: 'oui' };
      if (/^(?:arrete|arreter|coupe|couper|stoppe|stopper|desactive|desactiver) (?:la |le |l )?(?:circulation(?: sanguine)?|flux(?: sanguin)?|animation|influx nerveux|battements?(?: du coeur)?)$/.test(n)) return { type: 'anat_flux', etat: 'non' };
      const mt = n.match(/^(?:rends|rendre|mets|mettre|passe|passer)(?: les| le)? ?(?:autres|reste)(?: structures?)?(?: en)? ?(?:transparents?|transparence|invisibles?)$/);
      if (mt) return { type: 'anat_transparence', etat: 'oui' };
      if (/^(?:enleve|enlever|retire|retirer|annule|annuler|coupe|couper|desactive|desactiver) (?:la )?transparence$/.test(n)) return { type: 'anat_transparence', etat: 'non' };
      const mcp = n.match(/^(?:fais|faire|fait|montre|affiche|mets|mettre|passe|passer)(?: moi)? ?(?:une |la )?coupe (sagittale|frontale|transversale|horizontale)$/);
      if (mcp) return { type: 'anat_coupe', plan: /sagittale/.test(mcp[1]) ? 'x' : /frontale/.test(mcp[1]) ? 'z' : 'y' };
      if (/^(?:enleve|enlever|retire|retirer|supprime|supprimer|annule|annuler|ferme|fermer) (?:la |le )?(?:plan de )?coupe$/.test(n)) return { type: 'anat_coupe', plan: 'aucune' };
      const ml = n.match(/^(?:affiche|afficher|mets|mettre|passe|passer|donne|donner)(?: moi)? ?(?:les )?noms? (?:en |du )?(latin|francais|les deux)$|^(?:en|passe en) (latin|francais)$/);
      if (ml) return { type: 'anat_noms', langue: /latin/.test(ml[1] || ml[2]) ? 'la' : /deux/.test(ml[1] || '') ? 'fr+la' : 'fr' };
      if (/^(?:retire|retirer|enleve|enlever|supprime|supprimer|ote|oter) (?:la |les )?(?:premiere )?couches? (?:superficielles?|externes?)$/.test(n)) return { type: 'anat_couches', niveau: 'intermediaire' };
      if (/^(?:montre|montrer|affiche|afficher) (?:moi )?(?:les |le |la )?(?:muscles? )?(?:profonds?|couches? profondes?)$|^(?:retire|retirer|enleve|enlever) (?:toutes )?(?:les )?couches (?:intermediaires? )?(?:et superficielles?|superficielles? et intermediaires?)$/.test(n)) return { type: 'anat_couches', niveau: 'profonde' };
      if (/^(?:remets|remettre|affiche|afficher|montre|montrer) (?:moi )?(?:toutes )?(?:les )?couches(?: de muscles)?$|^(?:remets|remettre) (?:la |les )?couches? superficielles?$/.test(n)) return { type: 'anat_couches', niveau: 'toutes' };
      if (/^(?:c est quoi|rappelle|rappeler|explique|donne|donner|montre|montrer|affiche|afficher)(?: moi)? ?(?:l |la |le |les )?(?:echelle de cotation|cotation musculaire|cotation|echelle de daniels|echelle de lovett|testing musculaire)$/.test(n)) return { type: 'anat_cotation' };
      const mi = n.match(/^(?:isole|isoler)(?: moi)? ?(?:(?:le|la|les|l|un|une|mon|ma) )?(.+)$/);
      if (mi) return { type: 'anat_isoler', nom: mi[1].trim() };
      const mcm = n.match(/^(?:compare|comparer)(?: moi)? ?(?:(?:le|la|les|l|un|une|mon|ma) )?(.+?)(?: gauche et droit| gauche et droite| droit et gauche| droite et gauche| des deux cotes| a gauche et a droite)$/);
      if (mcm) return { type: 'anat_comparer', nom: mcm[1].trim() };
      const md = n.match(/^(?:decris|decrire|explique|expliquer|parle|parler|presente|presenter)(?: moi)?(?: de| du| des| de la| de l)? ?(?:(?:le|la|les|l|un|une|mon|ma|ce|cet|cette) )?(.+)$|^(?:c est quoi|qu est ce que c est que|qu est ce que) (?:(?:le|la|les|l|un|une|ce|cet|cette) )?(.+)$/);
      if (md && !/^(?:le |la |les )?(?:commandes?|vaisseau|galaxie|planete)\b/.test((md[1] || md[2] || '').trim())) return { type: 'anat_decrire', nom: (md[1] || md[2]).trim() };
      const mm = n.match(/^(?:montre|montrer|affiche|afficher|selectionne|selectionner|trouve|trouver|cherche|chercher|ou est|ou se trouve|zoome sur|zoomer sur|va sur|aller sur)(?: moi)? ?(?:(?:le|la|les|l|un|une|mon|ma|ce|cet|cette) )?(.+)$/);
      if (mm) return { type: 'anat_montrer', nom: mm[1].trim() };
    }
    const mr = n.match(/^(?:(active|activer|allume|allumer|remets|remettre|mets|met|mettre)|(desactive|desactiver|coupe|couper|eteins|eteindre|enleve|enlever)) (?:l |le |la )?(assistance(?: de vol)?|limiteur(?: de vitesse)?)$/);
    if (mr) return { type: 'vaisseau_reglage', reglage: /assistance/.test(mr[3]) ? 'assistance' : 'limiteur', etat: mr[1] ? 'oui' : 'non' };
  }

  // 2. Quitter la galaxie
  if (new RegExp('^(?:ferme|fermer|quitte|quitter|sors|sortir|masque|cache)(?: de)? ?' + ARTICLES + GALAXIE + '$').test(n)) return ouvert ? { type: 'quitter' } : null;
  if (/^(?:retour|reviens|revenir|retourne|retourner)(?: a| au| sur| vers)(?: l| la| le)* ?(?:rayle|accueil|ecran principal|assistante|interface|toi)$/.test(n)) return ouvert ? { type: 'quitter' } : null;

  // 3. Vue d'ensemble / ouvrir la galaxie
  if (new RegExp('^(?:retour|reviens|revenir|retourne|retourner|rentre|rentrer|recule|reculer)(?: a| au| sur| vers| dans)? ?' + ARTICLES + '(?:' + GALAXIE + '|vue d ensemble|vue generale)$').test(n)
      || /^(?:dezoome|de zoome|dezoomer|zoom arriere)$/.test(n)
      || new RegExp('^(?:montre|montrer|affiche|afficher|ouvre|ouvrir|mets|met|mettre|passe|passer|donne)(?: en| sur| a)? ?' + ARTICLES + '(?:vue d ensemble|vue generale|vue de la galaxie)$').test(n))
    return ouvert ? { type: 'vue_ensemble' } : { type: 'ouvrir' };
  if (new RegExp('^(?:ouvre|ouvrir|affiche|afficher|montre|montrer|lance|lancer|va|aller|emmene|amene|ramene|conduis|retourne)(?: a| au| sur| vers| dans| en)? ?' + ARTICLES + GALAXIE + '$').test(n))
    return ouvert ? { type: 'vue_ensemble' } : { type: 'ouvrir' };
  if (new RegExp('^' + ARTICLES + GALAXIE + '$').test(n)) return ouvert ? null : { type: 'ouvrir' };

  // 4. « retour » seul : seulement quand la galaxie est ouverte (le terminal a déjà eu sa chance)
  if (ouvert && /^(?:retour|reviens|revenir|retourne|retourner|recule|reculer|en arriere)$/.test(n)) return { type: 'retour' };

  // 5. Aller vers une cible : « va sur Mars », « montre-moi le vaisseau d'anatomie », « zoome sur Saturne »…
  const m = n.match(new RegExp('^' + VERBES_ALLER + ' ' + PREP + ARTICLES + '(?:planete |astre |vaisseau de |base de )?(.+)$'));
  if (m) {
    const reste = m[1].trim();
    const candidats = [reste, n.replace(new RegExp('^' + VERBES_ALLER + ' ' + PREP + ARTICLES), '').trim()];
    for (const c of candidats) {
      const cible = trouverCible(c, lexique) || trouverCible(c.replace(/^(?:planete|astre) /, ''), lexique);
      if (cible) return { type: 'aller', cible: cible.id };
    }
  }
  return null;
}

/* Cherche une cible dont un nom correspond EXACTEMENT au reste de la phrase (pas de recherche approximative : mieux vaut ne rien faire qu'aller au mauvais endroit). */
export function trouverCible(texte, lexique) {
  const t = String(texte || '').trim();
  if (!t) return null;
  const sansArticle = t.replace(/^(?:(?:la|le|l|les|un|une|ma|mon|notre) )+/, '');
  for (const c of lexique) for (const nom of c.noms) {
    const nomSans = nom.replace(/^(?:(?:la|le|l|les) )+/, '');
    if (t === nom || sansArticle === nom || t === nomSans || sansArticle === nomSans) return c;
  }
  return null;
}
