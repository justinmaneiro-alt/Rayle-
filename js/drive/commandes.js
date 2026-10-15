/* ═════════════ DRIVE : ce que Raylé comprend (analyseur de phrases, pur) ═════════════
   analyser(texte, ctx) → commande { op, … } ou null (ce n'est pas une commande Drive : la suite du traitement prend le relais).
   ctx = { fichiers:[{id,name}], ouverte:bool (fenêtre de document ouverte), attente:bool (un aperçu attend ma validation), configure:bool }.
   Règle : on ne s'empare d'une phrase que si elle parle clairement d'un document (mot « document », « Drive », « PDF »… ou nom d'un fichier autorisé)
   ou si la fenêtre est ouverte (« lis-moi la suite », « surligne ce passage »). « ouvre le terminal » ne doit jamais arriver ici.
   Les opérations : lister · connecter · deconnecter · selecteur · etat · ouvrir · lire · resumer · chercher · modifier · valider · refuser · enregistrer · annuler · fenetre. */
import { norm, evoqueFichier, scoreNom, nombre, MOT_NOMBRE } from './texte.js?v=2026.10.15.4';

/** même longueur que l'original (accents retirés, minuscules) : permet de retrouver le texte exact à dire/écrire */
export const plier = t => String(t == null ? '' : t).split('').map(c => { const d = c.normalize('NFD')[0]; return (d === '’' || d === '‘' || d === '`' || d === '´' ? "'" : d).toLowerCase(); }).join('');
const nettoyerTexte = s => String(s || '').replace(/^[\s:,;«»"“”-]+|[\s«»"“”]+$/g, '').replace(/\s+/g, ' ').trim();
const nettoyer = s => String(s || '').replace(/^[\s:,;«»"“”'-]+|[\s:,;«»"“”.!?]+$/g, '').replace(/\s+/g, ' ').trim();
const MOT_DOC = /\b(?:documents?|docs?|fichiers?|drive|google ?docs?|google ?sheets?|google ?slides?|pdf|docx|word|tableur|feuille de calcul|presentation|diaporama|diapos?|slides?)\b/;
const NOM_DOC = /\b(?:cours|poly|polycopie|rapport|memoire|compte rendu|devoir|synthese|fiche de revision|support|notes de cours|dossier)\b/;
const NB = MOT_NOMBRE;

/** parle-t-on d'un passage précis ? → { type, … } ou null */
export function lireCible(f, texteOriginal) {
  let m;
  const orig = (re) => { const x = re.exec(f); return x ? nettoyer(texteOriginal.slice(x.index + x[0].length - (x[1] ? x[1].length : 0), x.index + x[0].length)) : ''; };
  if ((m = f.match(new RegExp('\\b(?:le |la |l\')?(' + NB + ') paragraphe\\b'))) || (m = f.match(new RegExp('\\bparagraphe (?:numero |n° ?|n )?(' + NB + ')\\b')))) {
    const n = nombre(m[1].replace(/\s+/g, '')); if (n) return { type: 'paragraphe', n };
  }
  if ((m = f.match(new RegExp('\\bpage (?:numero |n° ?|n )?(' + NB + ')\\b'))) || (m = f.match(new RegExp('\\b(' + NB + ') page\\b')))) {
    const n = nombre(m[1].replace(/\s+/g, '')); if (n && n > 0) return { type: 'page', n };
  }
  const motcle = f.match(/\b(?:le |la |l')?(?:passage|paragraphe|partie|endroit|texte|extrait|ligne)s? (?:ou il est question (?:de |du |des |d')|qui parle (?:de |du |des |d')|qui contient |contenant |avec le mot |avec les mots |sur )(.+)$/)
    || f.match(/\b(?:ce qui parle (?:de |du |des |d')|ou il est question (?:de |du |des |d')|le mot |les mots )(.+)$/);
  if (motcle) {
    const t = nettoyer(texteOriginal.slice(f.length - motcle[1].length));
    if (/\b(?:partie|chapitre|section|rubrique)s? sur /.test(f) && !/(?:passage|paragraphe) /.test(motcle[0])) return { type: 'titre', texte: t, repli: 'motcle' };
    return { type: 'motcle', texte: t };
  }
  if ((m = f.match(/\b(?:le |la |l')?(?:partie|chapitre|section|titre|rubrique|sous-titre)s? (?:intitule[e]? |nomme[e]? |qui s'appelle |appele[e]? |de |du |des |d')?(.+)$/))) {
    const t = nettoyer(texteOriginal.slice(f.length - m[1].length)); if (t) return { type: 'titre', texte: t };
  }
  if (/\b(?:ce passage|ce paragraphe|cette partie|ce morceau|cet extrait|celui-ci|celui ci|ce que tu viens de lire|ce qui est affiche|ce que je vois)\b/.test(f)) return { type: 'courant' };
  return null;
}

/** sépare le nom de document du reste : « lis la page 3 du cours d'anatomie » → { reste, doc } */
function separerDoc(f, fichiers) {
  const re = /\b(?:dans|du|de la|de l'|des|de|sur|depuis|d'apres|a partir de)\s+(?:(?:le|la|l'|mon|ma|mes|les|ce|cette)\s+)?/g;
  let m, meilleur = null;
  while ((m = re.exec(f))) {
    const tail = f.slice(m.index + m[0].length).replace(/\b(?:depuis|dans|sur|du) (?:le |mon )?(?:drive|google drive)\b/g, '').trim();
    if (tail && evoqueFichier(fichiers, tail)) { meilleur = { reste: f.slice(0, m.index).trim(), doc: tail, debut: m.index }; break; }
  }
  if (meilleur) return meilleur;
  return { reste: f, doc: null };
}
const SANS_DOC_GENERIQUE = /\b(?:dans|du|de|sur|depuis|d'apres) (?:le |ce |mon |notre )?(?:document|doc|fichier|texte|drive|google drive|pdf)(?: ouvert| actuel| affiche)?\b/g;

const CONTEXTE_OUVERT = 'ouverte';

export function analyser(texte, ctx = {}) {
  const orig = String(texte || '').trim();
  if (!orig) return null;
  let f = plier(orig);
  f = f.replace(/^(?:(?:hey|he|eh|ok|okay|dis)[ ,]+)?rayle[ ,]+/, '').replace(/^(?:s'il te plait|stp|svp|dis donc)[ ,]+/, '').replace(/[ ,]+(?:s'il te plait|stp|svp)[ .!?]*$/, '');
  let o = orig.slice(orig.length - f.length);                   // même texte, avec accents
  let direct = false;
  { const dm = /(?:\bet )?(?:\bapplique(?:s)?(?:-?le)? directement|\bsans (?:me )?(?:demander|confirmation|validation|apercu)|\bdirectement)[ ,:;.!?-]*/.exec(f);
    if (dm) { direct = true; f = f.slice(0, dm.index) + f.slice(dm.index + dm[0].length); o = o.slice(0, dm.index) + o.slice(dm.index + dm[0].length); const lead = f.length - f.trimStart().length; f = f.trim(); o = o.slice(lead, lead + f.length); } }
  const nf = f.replace(/[?!.…]+$/g, '').trim();
  const fichiers = ctx.fichiers || [], ouverte = !!ctx.ouverte, attente = !!ctx.attente;
  const on = o.slice(0, nf.length);
  const ori = x => { const k = nf.lastIndexOf(x); return k >= 0 ? on.slice(k, k + x.length) : x; };
  let m;

  /* ───── Raylé hésitait entre plusieurs documents : « le premier », « le deuxième », ou un nom ───── */
  if (ctx.choix && ctx.choix.length) {
    const ord = nf.match(/^(?:le |la |c'est |celui )?(premier|premiere|1er|deuxieme|second|seconde|2e|troisieme|3e|dernier|derniere)(?: ?(?:document|fichier|doc))?$/);
    if (ord) { const n = nombre(ord[1]); if (n) return { op: 'choix', n }; }
    const nu = nf.replace(/^(?:c'est )?(?:celui|celle)(?: de| du| des| d')?\s*|^(?:le|la)\s+/, '');
    const k = ctx.choix.findIndex(nom => scoreNom(nu, nom) >= 0.8);
    if (k >= 0) return { op: 'choix', n: k + 1 };
  }

  /* ───── réponses à un aperçu en attente ───── */
  if (attente) {
    if (/^(?:oui|ouais|ok|okay|d'accord|valide|valider|je valide|c'est bon|confirme|confirmer|vas-?y|go|applique|applique-?le|applique ca|fais-?le|enregistre|tout a fait|parfait|exactement)$/.test(nf)) return { op: 'valider' };
    if (/^(?:non|nan|pas du tout|annule|annuler|refuse|laisse tomber|abandonne|ne fais pas ca|ne l'applique pas|n'applique pas|pas maintenant|stop|c'est faux)$/.test(nf)) return { op: 'refuser' };
  }

  /* ───── connexion Google, sélecteur, liste ───── */
  if (/\b(?:connecte|connecter|connexion|branche|relie)(?:-?toi)?\b.*\b(?:google|drive)\b/.test(nf) && !/\bdeconnect/.test(nf)) return { op: 'connecter' };
  if (/\b(?:deconnecte|deconnecter|deconnexion|coupe la connexion|oublie)(?:-?toi)?\b.*\b(?:google|drive)\b/.test(nf)) return { op: 'deconnecter' };
  if (/\b(?:ajoute|autorise|choisis|choisir|selectionne|selectionner|donne(?:-?moi)? acces|partage)\b.*\b(?:documents?|fichiers?|doc|drive)\b/.test(nf) && /\b(?:drive|selecteur|picker|choisi|autoris|acces|depuis|nouveau|un document|un fichier)\b/.test(nf) && !/\bparagraphe|titre|partie|fin du|debut du\b/.test(nf)) return { op: 'selecteur' };
  if (/\bselecteur\b|\bpicker\b/.test(nf)) return { op: 'selecteur' };
  if ((m = nf.match(/^(?:liste|lister|donne|montre|affiche|dis|quels? sont|quels?|que|qu'est-ce que|c'est quoi)(?:-?moi)?(?: les| mes| tous les| tous mes| ses)?\s*(.*)$/)) && MOT_DOC.test(nf)
      && /\b(?:liste|lister|quels?|mes (?:documents|fichiers)|les (?:documents|fichiers)|documents? (?:autorise|disponible|connu)|fichiers? (?:autorise|disponible|connu)|tu (?:vois|peux lire|as|connais))\b/.test(nf) && !/\b(?:paragraphe|page|passage|partie)\b/.test(nf) && !/\bouvre\b/.test(nf) && !/\b(?:est ouvert|est affiche|ouvert en ce moment)\b/.test(nf)) return { op: 'lister' };
  if (/\b(?:quel document|quel fichier|quel doc|qu'est-ce qui est ouvert|qu'est-ce que j'ai ouvert|qu'est-ce que tu vois a l'ecran)\b.*\b(?:ouvert|affiche|ecran|vois)\b|^(?:quel (?:document|fichier) (?:est ouvert|est affiche)|(?:qu'est-ce qui|ce qui) est ouvert)/.test(nf)) return { op: 'etat' };

  /* ───── enregistrer / annuler la dernière modification ───── */
  if ((ouverte || MOT_DOC.test(nf)) && /^(?:enregistre|enregistrer|sauvegarde|sauvegarder|sauve)(?:-?(?:le|moi))?(?: ce| le| les| mes| tout)?(?: document| fichier| doc| modifications?| changements?| modif| texte)?(?: maintenant| dans le drive| sur le drive)?$/.test(nf)) return { op: 'enregistrer' };
  if ((ouverte || MOT_DOC.test(nf) || /derniere modif|dernier changement/.test(nf)) &&
      (/^(?:annule|annuler|defais|defaire|retire|revenir en arriere|reviens en arriere)(?:-?(?:moi|la|le))? (?:la |le |cette |ce |ma |ta |toute )?(?:derniere |dernier )?(?:modification|modif|changement|correction|ajout|suppression|edition)s?(?: du document| du fichier| que tu viens de faire| que je viens de faire)?$/.test(nf)
       || /^(?:reviens|revenir|retourne|retour)(?:-?moi)? (?:a|sur) (?:la )?(?:version precedente|version d'avant|derniere version|ancienne version)(?: du document| du fichier)?$/.test(nf)
       || /^(?:annule|defais)(?: tout)?(?: ca)?$/.test(nf) && ouverte && ctx.annulable)) return { op: 'annuler' };

  /* ───── fenêtre ouverte : actions sur la fenêtre et sur ce qu'on lit ───── */
  if (ouverte) {
    if (/^(?:ferme|fermer|quitte|quitter)(?:-?moi)?(?: le| ce| cette| la)? ?(?:document|fichier|doc|fenetre|lecteur|pdf)$/.test(nf)) return { op: 'fenetre', action: 'fermer' };
    if (/^(?:passe |mets?-?(?:le|la)? |mets? |affiche |en )?(?:en )?plein ecran(?: s'il te plait)?$|^(?:agrandis|maximise)(?: le| la| ce| cette)? ?(?:document|fenetre|fichier)?(?: en plein ecran)?$/.test(nf)) return { op: 'fenetre', action: 'plein' };
    if (/^(?:quitte|sors|sortir|retire|enleve|annule)(?: du| le| de)? plein ecran$|^(?:reviens|revenir|retourne|retour|remets?|rends?)(?:-?(?:le|la))?(?: le document| la fenetre)? (?:a|en|sur) (?:la |sa |ma )?(?:taille normale|petite taille|taille precedente|taille d'avant|fenetre normale|petite fenetre)$|^(?:taille normale|fenetre normale)$/.test(nf)) return { op: 'fenetre', action: 'normal' };
    if (/^(?:reduis|reduire|minimise|minimiser|range|mets? de cote|cache)(?: le| la| ce| cette)? ?(?:document|fenetre|fichier)?$/.test(nf)) return { op: 'fenetre', action: 'reduire' };
    if (/^(?:restaure|reaffiche|reouvre|agrandis)(?: le| la| ce| cette)? ?(?:document|fenetre|fichier)?$/.test(nf)) return { op: 'fenetre', action: 'restaurer' };
    if (/\b(?:mode|passe(?:r)? en|mets?(?:-?le)? en|bascule en) (?:mode )?edition\b|^(?:je veux|laisse-?moi|permets-?moi de|je vais) (?:le )?(?:modifier|editer|ecrire)|^(?:edite|editer|modifie|modifier) (?:le |ce |a la main |a la main le )?(?:document|fichier|texte|doc)$/.test(nf)) return { op: 'fenetre', action: 'edition' };
    if (/\b(?:mode|passe(?:r)? en|mets?(?:-?le)? en|bascule en|retourne en|reviens en) (?:mode )?lecture\b/.test(nf)) return { op: 'fenetre', action: 'lecture' };
    if (/^(?:zoome|zoom|zoomer)(?: dessus| un peu| sur (?:ce passage|le texte|le document|ca))?$|^(?:agrandis|grossis|augmente)(?: un peu)?(?: le| la| ce| les)? ?(?:texte|police|caracteres|ecriture|lettres)$|^(?:plus gros|en plus gros|texte plus gros|plus grand)$/.test(nf)) return { op: 'fenetre', action: 'zoom+' };
    if (/^(?:dezoome|dezoom|dezoomer)(?: un peu)?$|^(?:reduis|diminue|retrecis)(?: un peu)?(?: le| la| ce| les)? ?(?:texte|police|caracteres|ecriture|lettres)$|^(?:plus petit|en plus petit|texte plus petit)$/.test(nf)) return { op: 'fenetre', action: 'zoom-' };
    if (/^(?:surligne|surligner|souligne|mets? en (?:evidence|surbrillance)|marque|illumine)(?:-?moi)?(?: ce| le| ce que tu viens de lire| ca)? ?(?:passage|paragraphe|texte|extrait|ligne|morceau|partie)?(?: que tu viens de lire| que tu lis)?$/.test(nf)) return { op: 'fenetre', action: 'surligner' };
    if (/^(?:enleve|retire|efface|supprime|annule) (?:le |les |tout )?(?:surlignage|surlignages|surbrillance|marquage)$/.test(nf)) return { op: 'fenetre', action: 'effacer-surlignage' };
    if (/^(?:continue|la suite|suite|poursuis|poursuivre|continue a lire|continue la lecture|lis-?moi la suite|et apres|ensuite|la suite s'il te plait|et la suite)$/.test(nf)) return { op: 'lire', cible: { type: 'suite' } };
    if (/^(?:recommence|relis(?:-?(?:moi))?(?: ca| ce passage| depuis le debut)?|reprends depuis le debut|depuis le debut)$/.test(nf)) return { op: 'lire', cible: /debut/.test(nf) ? { type: 'debut' } : { type: 'courant' } };
    if (/^(?:ou (?:en )?(?:est-on|sommes-nous|j'en suis)|ou en est-on|ou on en est)\b/.test(nf)) return { op: 'etat' };
  }

  /* ───── la phrase parle-t-elle d'un document ? ───── */
  const separe = separerDoc(nf, fichiers);
  let doc = separe.doc;
  const evoque = !!doc || evoqueFichier(fichiers, nf.replace(/^(?:ouvre|ouvrir|affiche|montre|lis|lire|relis|resume|resumer|charge|va sur|lance|cherche|trouve)(?:-?moi)?\s+/, ''));
  const parleDoc = MOT_DOC.test(nf) || evoque;

  /* ───── ouvrir ───── */
  if ((m = nf.match(/^(?:ouvre|ouvrir|affiche|afficher|montre|montrer|charge|charger|va sur|lance|sors|sortir|mets?|ramene|prends?|retrouve)(?:-?moi)?\s+(.+)$/))) {
    let reste = m[1];
    reste = reste.replace(/\b(?:depuis|dans|sur|du|de) (?:le |mon |ma |mes )?(?:drive|google drive|gdrive|google)\b/g, '').replace(/\bdans (?:une |la )?(?:fenetre|petite fenetre)\b/g, '').replace(/\b(?:s'il te plait)\b/g, '').trim();
    const sansDet = reste.replace(/^(?:(?:le|la|l'|les|mon|ma|mes|un|une|ce|cette)\s+)?(?:(?:document|doc|fichier|pdf|google doc|google docs|google sheets|google slides|presentation|feuille de calcul|tableur)\s+(?:intitule |nomme |qui s'appelle |appele )?)?/, '').trim();
    const seulMot = /^(?:le |mon |ma |mes |les )?(?:drive|google drive|gdrive|documents?|fichiers?|mes documents|mes fichiers)$/.test(reste);
    if (seulMot) return /\bdrive\b|\bgoogle\b/.test(reste) || /^mes /.test(reste) ? { op: 'lister' } : { op: 'selecteur' };
    const evoqueNom = evoqueFichier(fichiers, sansDet);
    const explicite = MOT_DOC.test(m[1]);
    const doux = NOM_DOC.test(sansDet) && (ctx.configure || fichiers.length > 0);
    const autreModule = /^(?:le |la |l')?(?:terminal|anatomie|espace|carte|monde|reglages?|parametres|camera|youtube|navigateur)\b/.test(sansDet);
    if ((evoqueNom || explicite || (doux && !autreModule)) && sansDet && (!autreModule || explicite)) {
      const cible = lireCible(sansDet, ori(sansDet));
      if (cible && cible.type !== 'courant' && ouverte && !evoqueNom) return { op: 'lire', cible, doc: null };
      return { op: 'ouvrir', nom: nettoyer(ori(sansDet)) };
    }
    if (ouverte && /\b(?:paragraphe|page|partie|chapitre|section|titre|passage)\b/.test(reste)) {
      const cible = lireCible(reste, ori(reste));
      if (cible) return { op: 'lire', cible, doc: null };
    }
  }

  /* ───── lire un passage ───── */
  if ((m = nf.match(/^(?:lis|lit|lire|relis|relire|dis|dites|recite|reciter|donne|fais la lecture de|va me lire)(?:-?(?:moi|nous))?(?: a voix haute)?(?:\s+(.*))?$/))) {
    const resteBrut = (m[1] || '').replace(SANS_DOC_GENERIQUE, '').replace(/\s+/g, ' ').trim();
    const sep = separerDoc(resteBrut, fichiers);
    let reste = sep.reste, d = sep.doc;
    if (!d && reste && evoqueFichier(fichiers, reste) && !lireCible(reste, o)) { d = reste; reste = ''; }
    const gate = d || ouverte || MOT_DOC.test(nf) || evoque;
    if (gate && !/\b(?:message|sms|mail|email|actualites?|meteo|news|titre de|mot de passe|journal)\b/.test(nf)) {
      const reste0 = reste.replace(/^(?:a voix haute )?/, '');
      let cible = null;
      if (!reste0 || /^(?:le |ce |mon )?(?:document|fichier|doc|texte|pdf)$/.test(reste0) || /^(?:le |tout le |l')?debut(?: du (?:document|texte|fichier))?$/.test(reste0)) cible = { type: 'debut' };
      else if (/^(?:tout|tout le (?:document|texte|fichier)|le document en entier|en entier|l'integralite)$/.test(reste0)) cible = { type: 'tout' };
      else if (/^(?:la suite|suite|ce qui suit|la suite du (?:texte|document)|plus loin|la partie suivante|le paragraphe suivant|le suivant|la page suivante)$/.test(reste0)) cible = { type: 'suite' };
      else cible = lireCible(reste0, ori(reste0));
      if (cible) return { op: 'lire', cible, doc: d ? nettoyer(ori(d)) : null };
      if (ouverte && !d) return null;
    }
  }

  /* ───── résumer ───── */
  if ((m = nf.match(/^(?:resume|resumer|fais(?:-?moi)? un resume|donne(?:-?moi)? un resume|resume-?moi|fais(?:-?moi)? une synthese|synthetise)(?:\s+(.*))?$/))) {
    const resteBrut = (m[1] || '').replace(SANS_DOC_GENERIQUE, '').trim();
    const sep = separerDoc(resteBrut, fichiers);
    let reste = sep.reste, d = sep.doc;
    if (!d && reste && evoqueFichier(fichiers, reste)) { d = reste; reste = ''; }
    if (d || ouverte || MOT_DOC.test(nf)) {
      const cible = reste ? lireCible(reste, ori(reste)) : null;
      return { op: 'resumer', cible: cible || null, doc: d ? nettoyer(ori(d)) : null };
    }
  }

  /* ───── chercher dans le document ───── */
  if ((m = nf.match(/^(?:cherche|chercher|recherche|rechercher|trouve|trouver|retrouve|repere|localise)(?:-?moi)?\s+(.+)$/)) || (m = nf.match(/^ou (?:est-il|est ce qu'il est|on parle|parle-t-on|il est) (?:question )?(?:de |du |des |d')(.+)$/))) {
    const brut = m[1].replace(SANS_DOC_GENERIQUE, ' ').replace(/\s+/g, ' ').trim();
    const sep = separerDoc(brut, fichiers);
    const motsCle = sep.reste.replace(/^(?:le mot |les mots |le terme |l'expression |le passage |ou il est question (?:de |du |des |d')|ou on parle (?:de |du |des |d'))/, '').trim();
    if ((sep.doc || ouverte || MOT_DOC.test(nf)) && motsCle && !/^(?:le |un |une )?(?:document|fichier|doc|drive)$/.test(motsCle)) {
      const t = nettoyer(ori(motsCle));
      return { op: 'chercher', texte: t || motsCle, doc: sep.doc ? nettoyer(ori(sep.doc)) : null };
    }
  }

  /* ───── modifier ───── */
  if ((ouverte || parleDoc) || /\b(?:paragraphe|titre|partie)\b/.test(nf)) {
    const mod = analyserModification(nf, o, ori, fichiers, direct, ouverte || parleDoc);
    if (mod) return mod;
  }
  return null;
}

/** corrige / remplace / ajoute / supprime / reformule */
function analyserModification(nf, o, ori, fichiers, direct, contexteDoc) {
  let m;
  const sepDoc = (s) => separerDoc(s, fichiers);
  const orig = (sousChaine) => { const k = nf.indexOf(sousChaine); return k >= 0 ? nettoyer(o.slice(k, k + sousChaine.length)) : sousChaine; };
  const finaliser = (obj, tail) => {
    const sep = sepDoc(tail || nf);
    return Object.assign({ op: 'modifier', direct, doc: sep.doc ? nettoyer(ori(sep.doc)) : null }, obj);
  };

  // corriger la faute / l'orthographe / un passage
  if ((m = nf.match(/^(?:corrige|corriger|rectifie|rectifier|repare|reparer|revois|relis et corrige)(?:-?moi)?\s+(?:la |les |l'|le |ce |cette |une |des )?(faute|fautes|erreur|erreurs|orthographe|coquille|coquilles|typo|ortho|accord|accords|grammaire|passage|paragraphe|texte|phrase|partie)?\s*(?:d'orthographe |de frappe |de grammaire )?(.*)$/))
      && (contexteDoc || /paragraphe/.test(nf))) {
    const reste = (m[2] || '').replace(SANS_DOC_GENERIQUE, '').replace(/^(?:dans|du|de la|de l'|de|sur|au niveau de|a|au)\s+/, '').trim();
    const sep = sepDoc(reste);
    const cible = sep.reste ? lireCible(sep.reste, ori(sep.reste)) : (m[1] && /^(?:passage|paragraphe|texte|phrase|partie)$/.test(m[1]) ? { type: 'courant' } : null);
    return finaliser({ cible: cible || (/\b(?:ce|ici|la)\b/.test(nf) || !sep.reste ? { type: 'courant' } : null), action: { k: 'corriger' }, brut: nf }, reste);
  }
  // reformuler / raccourcir / simplifier
  if ((m = nf.match(/^(reformule|reformuler|reecris|reecrire|raccourcis|raccourcir|simplifie|simplifier|developpe|developper|rends plus clair|ameliore|ameliorer)(?:-?moi)?\s+(.*)$/)) && contexteDoc) {
    const reste = m[2].replace(SANS_DOC_GENERIQUE, '').replace(/^(?:dans|du|de la|de l'|de|sur)\s+/, '').trim();
    const sep = sepDoc(reste);
    const cible = lireCible(sep.reste, ori(sep.reste)) || { type: 'courant' };
    return finaliser({ cible, action: { k: 'reecrire', consigne: m[1] }, brut: nf }, reste);
  }
  // remplacer X par Y
  if ((m = nf.match(/^(?:remplace|remplacer|change|changer|substitue)(?:-?moi)?\s+(?:le mot |la phrase |l'expression |le texte |les mots |le terme )?(.+?)\s+par\s+(.+)$/)) && contexteDoc) {
    const base = 0;
    const iPar = nf.indexOf(' par ', m.index + (m[0].indexOf(m[1]) >= 0 ? m[0].indexOf(m[1]) : 0));
    const iDe = nf.indexOf(m[1]);
    let de = nettoyerTexte(o.slice(base + iDe, base + iDe + m[1].length));
    let vers = nettoyerTexte(o.slice(base + iPar + 5));
    let dans = '';
    const mm = vers.match(/^(.*?)\s+(dans (?:le|la|l'|ce|cette|tout le|tout|les) .*)$/i);
    if (mm) { vers = nettoyerTexte(mm[1]); dans = mm[2]; }
    else { const m2 = de.match(/^(.*?)\s+(dans (?:le|la|l'|ce|cette|tout le|tout|les) .*)$/i); if (m2) { de = nettoyerTexte(m2[1]); dans = m2[2]; } }
    const f2 = plier(dans).replace(SANS_DOC_GENERIQUE, '').replace(/^dans (?:le |la |l'|ce |cette )?/, '');
    const sep = sepDoc(f2);
    const cible = dans && !/^dans (?:tout|le document|ce document|tout le)/.test(plier(dans)) && sep.reste ? lireCible(plier(dans).replace(/^dans /, ''), dans.replace(/^dans /i, '')) : null;
    if (de && vers) return finaliser({ cible: cible || { type: 'tout' }, action: { k: 'remplacer', de, vers }, brut: nf }, dans || nf);
  }
  // supprimer un paragraphe
  if ((m = nf.match(/^(?:supprime|supprimer|efface|effacer|enleve|enlever|retire|retirer)(?:-?moi)?\s+(.*)$/)) && contexteDoc) {
    const reste = m[1].replace(SANS_DOC_GENERIQUE, '').trim();
    const sep = sepDoc(reste);
    const cible = lireCible(sep.reste, ori(sep.reste));
    if (cible && (cible.type === 'paragraphe' || cible.type === 'courant' || cible.type === 'motcle')) return finaliser({ cible, action: { k: 'supprimer' }, brut: nf }, reste);
  }
  // ajouter un paragraphe
  if ((m = nf.match(/^(?:ajoute|ajouter|insere|inserer|rajoute|rajouter|ecris|ecrire|mets?|met|colle)(?:-?moi)?\b(.*)$/)) && contexteDoc && /\b(?:paragraphe|titre|partie|chapitre|section|fin du|debut du|a la fin|au debut|en bas|en haut|sous |apres |texte|phrase|ligne|document)\b/.test(nf)) {
    const base = 0;
    let corps = nf.slice(m.index + (m[0].length - m[1].length));      // tout ce qui suit le verbe
    let offset = base + (m[0].length - m[1].length);
    let texte = null, position = { k: 'fin' }, tail = '';
    const colon = corps.indexOf(':');
    const guill = corps.match(/[«"“](.+?)[»"”]/);
    let entete = corps;
    if (colon >= 0) { texte = nettoyerTexte(o.slice(offset + colon + 1)); entete = corps.slice(0, colon); }
    else if (guill) { texte = nettoyerTexte(o.slice(offset + guill.index + 1, offset + guill.index + 1 + guill[1].length)); entete = corps.slice(0, guill.index) + ' ' + corps.slice(guill.index + guill[0].length); }
    const posRe = /\b(?:sous|apres|en dessous de|juste apres|juste sous|a la suite de|en fin de|a la fin de)\s+(?:le |la |l')?(?:titre|partie|chapitre|section|rubrique)\s+(?:intitule[e]? |nomme[e]? |sur |de |du |des |d')?(.+?)\s*$/;
    let pm;
    // le texte peut aussi précéder la position : « ajoute bonjour sous le titre X »
    const pos2 = (colon < 0 && !guill) ? corps.match(/^(.*?)\s+(?:sous|apres|en dessous de|juste apres|juste sous)\s+(?:le |la |l')?(?:titre|partie|chapitre|section|rubrique)\s+(?:intitule[e]? |nomme[e]? |sur |de |du |des |d')?(.+?)\s*$/) : null;
    let titrePos = null;
    if ((pm = entete.match(posRe))) titrePos = pm[1];
    else if (pos2) { titrePos = pos2[2]; texte = nettoyerTexte(o.slice(offset, offset + pos2[1].length)); }
    if (titrePos) {
      const k = nf.lastIndexOf(titrePos); position = { k: 'sous-titre', titre: nettoyer(o.slice(k, k + titrePos.length)) };
      if (titrePos.match(/^(.*?)\s+(?:dans|du|de la) (?:le |la |l')?(?:document|fichier|drive|cours .*)$/)) { /* le nom du document est extrait par sepDoc */ }
    } else if ((pm = entete.match(new RegExp('\\b(?:apres|sous|en dessous de|a la suite de)\\s+(?:le |la |l\')?(' + NB + ')\\s+paragraphe')) ) || (pm = entete.match(new RegExp('\\b(?:apres|sous)\\s+(?:le |la |l\')?paragraphe\\s+(' + NB + ')')))) {
      const n = nombre(pm[1].replace(/\s+/g, '')); position = { k: 'apres-paragraphe', n };
    } else if (/\b(?:au debut|en haut|tout au debut|en tete)\b/.test(entete)) position = { k: 'debut' };
    else if (/\b(?:a la fin|en bas|en fin|tout a la fin|a la suite du document)\b/.test(entete)) position = { k: 'fin' };
    else if (/\b(?:apres|sous) (?:ce|cet|cette)\b/.test(entete)) position = { k: 'apres-courant' };
    else if (texte == null) { texte = null; }
    if (texte == null && colon < 0 && !guill && !titrePos) {
      // « ajoute une phrase à la fin du document » sans texte : on le demandera
      const sansPos = entete.replace(/\b(?:ce|cet|cette|le|la|un|une|nouveau|nouvelle|paragraphe|texte|phrase|ligne|passage|suivant|suivante|a la fin|au debut|en bas|en haut|du document|dans le document|dans le fichier|du fichier)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (sansPos.length > 12) { const k = nf.indexOf(sansPos); texte = nettoyerTexte(o.slice(k, k + sansPos.length)); }
    }
    return finaliser({ cible: null, action: { k: 'ajouter', texte: texte || null, position }, brut: nf }, nf);
  }
  return null;
}

/** pour l'affichage dans les tests et le registre : la phrase est-elle une commande Drive ? */
export const reconnu = (texte, ctx) => !!analyser(texte, ctx);
export { norm };
