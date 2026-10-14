"use strict";
  /* ═════════════ REGISTRE DES CAPACITÉS DE RAYLÉ (RayleCapacites) ═════════════
     Une seule liste de ce que Raylé sait faire : nom, rôle, paramètres, exemples de phrases, cas limites.
     • Les paramètres sont LUS DANS LE CODE au moment de l'appel (astres et rovers de l'Espace, actifs et panneaux du terminal, thèmes, éléments du fond…) :
       ajouter un astre ou un actif met le registre à jour tout seul.
     • Les exemples sont VÉRIFIÉS contre les vrais analyseurs de phrases par tests/capacites-test.mjs : un exemple qui ne déclenche plus rien fait échouer les tests.
     • docs/capacites.md est généré depuis ce même registre (node scripts/capacites.mjs).
     Il sert à trois choses : le bloc compact injecté dans le contexte de l'IA (contexte()), l'état courant de l'écran et des derniers échanges (etat()),
     et la réponse à « que sais-tu faire ? ».
     Chaque famille : { id, nom, court, ex:[phrases], verif:'espace'|'monde'|'terminal'|'anatomie'|'apparence'|'savoir'|null, mots:RegExp, params():texte, limites:[…] }.
     « verif:null » = pas d'analyseur local à interroger (l'IA ou une API en ligne décide) : l'exemple n'est pas vérifié automatiquement. */
  const RayleCapacites=(function(){
    const G=typeof window!=='undefined'?window:globalThis;
    const UI=()=>G.RayleUI||{};
    const sur=(f,defaut)=>{ try{ const v=f(); return v==null?defaut:v; }catch(e){ return defaut; } };
    const liste=a=>a.join(', ');

    const FAMILLES=[
      {id:'espace',nom:'Espace en 3D',
        court:'montrer ou visiter un astre, un rover, le trou noir, l’ISS, un pays ou un monument sur la Terre (la caméra y vole, une fiche s’affiche, je dis un ou deux faits) ; zoomer ; revenir sur la Terre ; garder une vue par défaut ; échelle réaliste ou pédagogique ; afficher ou masquer planètes, astéroïdes, comètes, satellites, aurores, Lune, Voie lactée ; enchaîner plusieurs étapes',
        ex:['montre-moi Mars','emmène-moi voir Saturne','montre Perseverance','montre-moi le trou noir','où est Curiosity','zoome dessus','et sa lune','reviens sur la Terre','garde cette vue','échelle réaliste','mode pédagogique','désactive les astéroïdes','montre Mars puis Perseverance'],
        verif:'espace',mots:/\b(?:espace|planete|mars|jupiter|saturne|venus|mercure|uranus|neptune|lune|soleil|iss|station|rover|perseverance|curiosity|trou noir|asteroide|comete|aurore|zoom|echelle|vue par defaut|orbite|galaxie|cosmos|astre|montre|emmene|reviens)\b/,
        params:()=>{
          const E=UI().espace, L=UI().espaceLieux||{};
          const astres=sur(()=>Object.keys(E.ASTRES).map(k=>E.ASTRES[k].court),[]);
          const rovers=sur(()=>Object.keys(L.ROVERS).map(k=>L.ROVERS[k].court+' ('+L.ROVERS[k].site+')'),[]);
          const lieux=sur(()=>L.LIEUX.length,0);
          const elems=sur(()=>Object.values(E.ELEMENTS).map(x=>x.toLowerCase()),[]);
          return 'cibles : '+liste(astres)+' · rovers : '+liste(rovers)+' · trou noir · '+lieux+' lieux de la Terre (pays, capitales, monuments) · éléments : '+liste(elems)+' · échelles : réaliste, pédagogique';
        },
        limites:['les lunes autres que la Lune (Io, Titan…) ne sont pas des cibles de vol : j’en parle, je ne les survole pas','en qualité Éco le fond est une image fixe : pas de vol ni de zoom (je le dis)','un nom mal écrit (« perseverence ») est corrigé tout seul','le fond Espace s’active automatiquement quand on me demande un astre']},
      {id:'savoir',nom:'Savoir sur l’espace',
        court:'répondre sans IA, avec des fiches sourcées NASA/ESA, aux questions chiffrées sur le Soleil, la Lune, les huit planètes, les lunes majeures, la ceinture d’astéroïdes, les comètes (Halley, Tchouri), le trou noir, l’ISS, Hubble, Webb, Curiosity, Perseverance et les grandes missions ; expliquer, comparer deux astres point par point ; dire « je n’ai pas cette donnée » plutôt qu’inventer',
        ex:['quelle est la taille de Mars','compare Mars et la Terre','parle-moi de l’ISS','combien de lunes a Saturne','Mars est-elle plus grosse que la Terre','quand Voyager 1 a été lancé'],
        verif:'savoir',mots:/\b(?:taille|masse|distance|gravite|temperature|atmosphere|lunes?|compar\w*|difference|explique|parle|c est quoi|combien|quand|decouvert|mission)\b/,
        params:()=>'fiches : '+sur(()=>Object.values(UI().savoir.fiches).map(f=>f.nom.replace(/^(?:le |la |l’)/,'')).join(', '),'aucune (module non chargé)'),
        limites:['seules les données de la fiche sont dites : si un chiffre manque, je le dis','les valeurs « du jour » (distance de Mars aujourd’hui, position de l’ISS) sont calculées, pas lues dans les fiches']},
      {id:'terre',nom:'Terre vivante (outils du globe)',
        court:'sur le globe : placer des points (couleur au choix), tracer un trajet ou les frontières d’un pays, tout effacer, zoomer sur une ville ou un pays ; accélérer, figer ou décaler le temps ; faire tourner la Terre à la main ; vols et bateaux SIMULÉS ; lumières des villes ; actualité d’un pays (sources citées)',
        ex:['place un point à Tokyo','trace un trajet de Paris à Tokyo','trace les frontières du Japon','efface les points','zoome sur Lyon','accélère le temps','une heure par seconde','remets l’heure réelle','fais tourner la Terre à la main','affiche les vols','masque les lumières des villes','montre les actualités du Japon sur le globe'],
        verif:'espace',mots:/\b(?:point|points|marqueur|epingle|trajet|itineraire|frontieres?|contours?|efface\w*|temps|heure|tourner|rotation|vols?|avions?|bateaux|navires?|trafic|villes lumineuses|lumieres|actualites?|globe|zoome\w*)\b/,
        params:()=>'170 pays, 150 villes, capitales et monuments ; couleurs : rouge, bleu, vert, jaune, orange, violet, rose, blanc, cyan ; vitesses du temps : ×60, ×600, 1 heure, 6 heures, 1 jour par seconde ; jusqu’à 60 points et 12 tracés ; trafic : environ 420 avions et 160 bateaux simulés (900 et 360 en Ultra)',
        limites:['le trafic est SIMULÉ (routes plausibles, vitesses accélérées ×240 pour les avions et ×1 800 pour les bateaux en mode pédagogique) et l’écran l’écrit ; le temps réel des vols n’existe que si le Worker fournit la route /vols','les frontières viennent d’un jeu à l’échelle 1:110 millions : un repère, pas une frontière juridique','l’actualité d’un pays vient uniquement des sources du Worker, citées ; sans elles, je dis que je n’ai rien de fiable et je n’invente rien','en mode Éco le fond est une image fixe : ces outils demandent Auto, Max ou Ultra']},
      {id:'terminal',nom:'Terminal de trading',
        court:'ouvrir ou fermer le terminal, changer d’actif, d’unité de temps, de page, afficher des panneaux, régler le graphique (RSI, supports, moyenne mobile), annoter',
        ex:['ouvre le terminal','passe sur le Bitcoin','mets M15','ajoute le RSI','ouvre la page marchés','ferme le terminal'],
        verif:'terminal',mots:/\b(?:terminal|graphique|bitcoin|nasdaq|solana|or|euro|rsi|support|unite|m15|h4|dashboard|panneau|cot|marches|analyse)\b/,
        params:()=>{ const a=sur(()=>TERM_ACTIFS.map(x=>x[2]),[]), p=sur(()=>TERM_PANNEAUX.map(x=>x[2]),[]); return 'actifs : '+liste(a)+' · panneaux : '+liste(p)+' · unités M5 à D1 · pages Marchés, COT, Analyse'; },
        limites:['je n’exécute jamais d’ordre de trading : j’explique et j’alerte, la décision reste à Justin']},
      {id:'monde',nom:'Carte du monde',
        court:'ouvrir la page Monde du terminal, montrer un pays ou une région, afficher l’inflation, le chômage, la croissance, le PIB ou les taux sur la carte, couches (bourses, actualités, calendrier)',
        ex:['ouvre la carte du monde','montre-moi le Japon','zoom sur l’Europe','affiche l’inflation sur la carte','vue Terre'],
        verif:'monde',mots:/\b(?:carte du monde|pays|japon|chine|europe|inflation|chomage|croissance|pib|taux|region)\b/,
        params:()=>'pays et régions de la carte du monde ; indicateurs : inflation, chômage, croissance, PIB, taux directeurs',
        limites:['les villes et adresses vont sur la carte Leaflet, pas sur la page Monde']},
      {id:'anatomie',nom:'Anatomie et orthopédie 3D',
        court:'décrire une structure du corps (os, muscles, nerfs, organes) dans une fenêtre 3D, ouvrir le module anatomie, afficher des calques, simuler des pathologies (scoliose, fracture, amputation) et des appareillages (prothèse, orthèse)',
        ex:['décris-moi l’humérus','où s’insère le biceps','ouvre l’anatomie','affiche les muscles et les nerfs','montre une fracture du col du fémur','scoliose de 40 degrés'],
        verif:'anatomie',mots:/\b(?:anatomi|os|muscle|nerf|organe|humerus|femur|biceps|prothese|orthese|scoliose|fracture|amputation|squelette|vertebre)\w*/,
        params:()=>'os, muscles, nerfs, organes, calques, pathologies et appareillages du module Anatomie ; les cours enregistrés par Justin complètent les réponses',
        limites:['usage éducatif : ce n’est pas un avis médical']},
      {id:'presentations',nom:'Présentations animées du corps',
        court:'présenter en animation 3D un os, un muscle, un nerf, un vaisseau ou un organe (caméra, étiquettes, narration, sous-titres) ; présenter un membre, le tronc, la tête ou le corps entier couche par couche ; pause, suivant, vitesse, plein écran',
        ex:['présente le fémur','présente-moi le biceps brachial','présente le nerf médian','présente tout le bras couche par couche','présente la jambe couche par couche','présente le corps entier'],
        verif:'anatomie',mots:/\b(?:presente\w*|presentation|couche par couche|animation|anime)\b/,
        params:()=>'cibles : toute structure de la base d’anatomie (os, muscles, nerfs, artères, veines, organes), les groupes (quadriceps, rachis, main…) et les régions jambe, bras, tronc, tête, corps entier ; le texte vient des fiches sourcées (Gray 1918, Terminologia Anatomica), les références sont dites à la fin',
        limites:['aucun fait inventé : une information absente des fiches est dite absente','la peau n’a pas de fiche détaillée : seule l’enveloppe est montrée','la voix suit le réglage de Raylé ; sans voix, les sous-titres défilent seuls','« décris-moi l’humérus » garde le petit aperçu 3D, « présente l’humérus » lance l’animation']},
      {id:'cerveau',nom:'Cerveau 3D',
        court:'ouvrir la fenêtre Cerveau 3D : montrer et expliquer une zone (lobes, hippocampe, amygdale, thalamus, cervelet…) ; réseaux de neurones animés (vision, langage, mouvement…) ; vues et coupes, aires de Brodmann, tour guidé, qualité Éco à Ultra',
        ex:['montre l’hippocampe','explique le lobe frontal','fais-moi un tour du cerveau','coupe sagittale du cerveau','affiche les aires de Brodmann','montre le réseau de la vision dans le cerveau','qualité ultra pour le cerveau'],
        verif:'anatomie',mots:/\b(?:cerveau|encephale|cortex|neurones?|cervelet|hippocampe|amygdale|thalamus|lobe|brodmann|sagittale|coronale|axiale)\b/,
        params:()=>'zones : lobes frontal, pariétal, temporal, occipital, insula, cortex moteur, somesthésique, visuel, auditif, préfrontal, aires de Broca et de Wernicke, gyrus cingulaire, hippocampe, amygdale, thalamus, hypothalamus, noyaux gris centraux, cervelet, tronc cérébral, ventricules, corps calleux, substance blanche · réseaux : vision, langage, mouvement, sensibilité, audition, mémoire, émotion, attention, fonctions exécutives · vues : latérale, médiane, coronale, axiale, dessus, dessous',
        limites:['les faisceaux de substance blanche et les impulsions des neurones sont schématiques (aucune tractographie de ce cerveau)','les aires de Brodmann sont approximatives (centres moyens de la littérature)','les fiches sont rédigées d’après Gray 1918, Purves et Kandel, sans relecture clinique : ce n’est pas un avis médical','Ultra est très gourmand : je repasse au palier inférieur si l’image devient trop lente, et je ne le choisis jamais seule']},
      {id:'drive',nom:'Documents du Drive (Google)',
        court:'ouvrir, lire, résumer, chercher et modifier (aperçu avant/après, annulation) les Google Docs, PDF, Word, textes, Sheets et Slides que Justin a choisis ; fenêtre flottante, plein écran',
        outils:['drive:ouvrir','drive:lire-passage','drive:resumer','drive:chercher','drive:lister','drive:modifier','drive:enregistrer','drive:annuler'],
        ex:['ouvre le cours d’anatomie','lis le 2e paragraphe','lis-moi la suite','résume le document','cherche l’humérus dans le document','corrige la faute dans le 2e paragraphe','ajoute ce paragraphe sous le titre Introduction : voici le texte','annule la dernière modification','plein écran','liste mes documents','ajoute un document du drive'],
        verif:'drive',mots:/\b(?:drive|documents?|fichiers?|pdf|docx|word|cours|paragraphes?|google|passage|resume\w*|lis|lire|corrige\w*|surligne\w*|plein ecran)\b/,
        params:()=>{ const fich=sur(()=>JSON.parse(G.localStorage.getItem('rayle_drive_fichiers')||'[]'),[]); const e=sur(()=>G.RayleBus.etat('drive'),null)||{};
          return 'outils : drive:ouvrir (nom approximatif accepté), drive:lire-passage (paragraphe, titre, page, mot-clé, suite), drive:resumer, drive:chercher, drive:lister, drive:modifier (corriger, remplacer, ajouter, supprimer), drive:enregistrer, drive:annuler · documents autorisés : '+(fich.length?liste(fich.slice(0,8).map(f=>f.name)):'aucun pour l’instant')+' · connexion : '+(e.configure===false?'non configurée (js/config-drive.js)':e.connecte?'active':'à établir par le bouton « Se connecter à Google »'); },
        limites:['je ne vois que les documents choisis avec le sélecteur Google (portée drive.file) ; un document non autorisé : je propose d’ouvrir le sélecteur','PDF, Sheets et Slides : lecture seule','toute modification passe par un aperçu avant/après que Justin valide (sauf « applique directement »), puis je relis le document pour vérifier ; « annule la dernière modification » revient en arrière','je ne dis jamais avoir lu ou modifié un document si l’opération a échoué, et je ne cite que le texte réel du document','pas de recherche web pour un document de Justin : j’utilise ces outils (ou « commande_drive » avec une phrase simple)']},
      {id:'carte',nom:'Cartes et itinéraires',
        court:'montrer une ville ou un lieu sur une carte, calculer un itinéraire (voiture, vélo, à pied)',
        ex:['montre-moi Bordeaux','itinéraire de Bordeaux à Toulouse à pied'],verif:null,mots:/\b(?:carte|itineraire|trajet|route|ou est|ville)\b/,
        params:()=>'lieux du monde entier (OpenStreetMap), itinéraires voiture, vélo, à pied',limites:['les pays et régions vont sur la page Monde']},
      {id:'apparence',nom:'Apparence',
        court:'changer le thème de couleurs, le fond (Espace, Jarvis, vidéo, aucun), l’entité, l’ambiance météo et lumineuse, la qualité graphique (Éco, Auto, Max ou Ultra : l’Ultra est très gourmand et jamais choisi seul)',
        ex:['passe en thème Aurore','fond espace','mode éco','passe en qualité ultra'],verif:'apparence',mots:/\b(?:theme|fond|ambiance|entite|couleur|eco|qualite|nuit|pluie|neige)\b/,
        params:()=>'thèmes : originel, arc, rouge, aurore, ambre, nébuleuse · fonds : aucun, espace, jarvis, vidéo · entités : sphère, neurones',
        limites:[]},
      {id:'memoire',nom:'Mémoire et notes',
        court:'retenir un fait durable, lire ou oublier les notes et les souvenirs, résumer les conversations',
        ex:['note que j’ai rendez-vous demain','qu’est-ce que tu as retenu','oublie la dernière note'],verif:null,mots:/\b(?:note|retiens|souviens|oublie|memoire|souvenir|journal)\b/,
        params:()=>'notes, souvenirs, règles de trading, résumés de conversation (base du Worker)',limites:['« efface ta mémoire » demande une confirmation']},
      {id:'agent',nom:'Outils du cerveau en ligne',
        court:'données de marché et bougies, calendrier économique, alertes et rappels, agenda, météo, actualités, recherche web, YouTube, lecture de documents, cours de Justin, laboratoire de code, Telegram',
        ex:['quel est le prix du Bitcoin','mets une alerte à 70 000','quelles sont les actualités'],verif:null,mots:/\b(?:prix|cours|alerte|rappel|agenda|meteo|actualite|news|youtube|document|cours|code)\b/,
        params:()=>'l’IA choisit et enchaîne ses outils (six étapes au plus) ; les chiffres viennent des outils, jamais de ma mémoire',
        limites:['pas de recherche web quand un outil local existe (Espace, anatomie, terminal, cartes)']},
      {id:'univers',nom:'Univers 3D : globe, système solaire, Mars, bataille navale',
        court:'Univers 🌌 : globe, système solaire, ISS, Mars et rovers, bataille navale 1700 avec visite des navires, qualité Basse/Moyenne/Haute',
        ex:['présente la France','va sur Mars','montre le système solaire','atterris sur Mars','bascule sur la bataille navale','lance une escarmouche','montre l’intérieur de la frégate','mets la qualité en basse','passe l’animation','réduis-toi','où sont mes appareils'],verif:null,mots:/\b(?:univers|globe|bataille navale|navire|fregate|vaisseau|qualite|animation|rover|atterris|systeme solaire|appareils)\b/,
        params:()=>'thèmes Espace et Bataille navale ; navires : voilier, brick, frégate, vaisseau ; nations : France, Espagne, Angleterre, Portugal ; scénarios : balade, duo, escarmouche, bataille ; salles : pont, cabine, batteries, cuisine, hamacs, infirmerie, soute, cale',
        limites:['positions des astres et éclipses approximatives, actualités selon franceinfo et le Worker, rendu allégé en qualité Basse']},
      {id:'appareils',nom:'Autres appareils, messages et appels',
        court:'commander le PC, la tablette ou le téléphone (relais), préparer un message ou un appel (c’est Justin qui envoie), gérer le répertoire',
        ex:['affiche l’or en H4 sur la tablette','envoie à Maman que je rentre vers 19 heures'],verif:null,mots:/\b(?:tablette|telephone|pc|ordinateur|message|appelle|envoie|repertoire)\b/,
        params:()=>'liste blanche d’actions par appareil ; jamais d’envoi automatique de message',limites:['je ne lis jamais les messages reçus']},
      {id:'voix',nom:'Voix, veille et sécurité',
        court:'parler plus lentement ou plus vite, mise en veille, arrêt, déverrouillage par phrase secrète',
        ex:['parle plus lentement','mets-toi en veille'],verif:null,mots:/\b(?:parle|veille|stop|arrete|deverrouille|verrouille)\b/,
        params:()=>'vitesse de la voix, veille, coupure totale, verrou à deux niveaux',limites:[]}
    ];

    const REGLES='RÈGLES D’OUTILS : (1) pour une demande qui correspond à une capacité ci-dessus, exécute l’outil adapté tout de suite ; ne dis jamais « je ne peux pas » pour une capacité que tu possèdes, et ne lance jamais de recherche web quand un outil local existe (Espace, anatomie, terminal, cartes). (2) Plusieurs demandes dans une phrase (« montre Mars puis Perseverance ») : enchaîne les outils dans l’ordre. (3) Un nom de paramètre mal formé (« perseverence ») : corrige-le toi-même avant d’appeler l’outil. (4) Une demande floue : choisis l’hypothèse la plus probable et agis, sans questionnaire. (5) Ne dis jamais qu’une action est faite si le résultat de l’outil dit qu’elle a échoué : dis ce qui n’a pas marché. (6) Si une donnée te manque, dis-le au lieu de l’inventer. (7) Les pronoms (« zoome dessus », « et sa lune ? », « garde cette vue ») se rapportent à l’ÉTAT ci-dessous.';

    /* ───── journal des derniers échanges (alimenté par l'événement « rayle:dit » du bus) ───── */
    const journal=[];
    function noterEchange(kind,texte){
      const t=String(texte||'').replace(/\s+/g,' ').trim(); if(!t) return;
      if(kind==='user') journal.push({u:t.slice(0,120),r:'',via:''});
      else if(kind==='ray' && journal.length){ const e=journal[journal.length-1]; if(!e.r) e.r=t.slice(0,140); try{ const l=G.RAYLE_ENTREES; if(l&&l.length&&l[l.length-1].action) e.via=l[l.length-1].action; }catch(err){} }
      while(journal.length>6) journal.shift();
    }
    try{ if(typeof RayleBus!=='undefined') RayleBus.on('rayle:dit',d=>noterEchange(d&&d.kind,d&&d.text)); }catch(e){}

    /* ───── état : écran actif, cible affichée, vue sauvegardée, historique récent ───── */
    function etat(){
      const e=sur(()=>UI().espace.etat(),null), s={ecran:'rayle',espace:null,historique:journal.slice()};
      s.ecran=sur(()=>RayleBus.demander('vue')||'rayle','rayle');
      s.drive=sur(()=>G.RayleBus.etat('drive'),null);
      if(e){ s.ecran=e.vue||s.ecran; s.espace={fond:e.fond,cible:e.cible,nom:e.nom,accueil:e.accueil,echelle:e.echelle,zoom:e.zoom,vol:e.vol,palier:e.palier}; }
      return s;
    }
    const NOM_ECRAN={rayle:'accueil de Raylé (entité au centre)',terminal:'terminal de trading',anatomie:'module Anatomie',cerveau:'fenêtre Cerveau 3D'};
    function etatTexte(){
      const s=etat(), p=['ÉTAT : écran actif = '+(NOM_ECRAN[s.ecran]||s.ecran)];
      if(s.espace){
        const e=s.espace, ech=e.echelle==='realiste'?'RÉALISTE (distances et tailles vraies, planètes réduites à des points)':'PÉDAGOGIQUE (distances resserrées, astres agrandis)';
        p.push('fond = '+(e.fond||'inconnu')+(e.palier>=2?' (Éco : image fixe)':''));
        p.push(e.cible?'astre affiché = '+e.nom+(e.vol?' (vol en cours)':'')+(Math.abs((e.zoom||1)-1)>.02?', zoom ×'+e.zoom:''):'astre affiché = aucun (vue d’ensemble de la Terre)');
        p.push('vue sauvegardée par défaut = '+(e.accueil?UI().espace.nomCible(e.accueil):'la Terre'));
        p.push('mode d’échelle = '+ech);
      }
      if(s.drive && s.drive.ouvert){
        const d=s.drive, f=d.fenetre||{};
        p.push('DRIVE : document ouvert = « '+d.nom+' » ('+d.type+(d.lectureSeule?', lecture seule':f.edition?', en édition':', en lecture')+(f.plein?', plein écran':f.reduit?', réduit':'')+')'+(d.passage&&d.passage.intitule?' ; dernier passage lu = '+d.passage.intitule:'')+(d.titreVisible?' ; partie affichée = « '+d.titreVisible+' »':'')+(d.enAttente?' ; un changement attend la validation de Justin':'')+(f.modifie?' ; modifications non enregistrées':''));
      }
      if(s.historique.length) p.push('derniers échanges : '+s.historique.map((h,i)=>(i+1)+') « '+h.u+' »'+(h.r?' → '+h.r:'')).join(' ; '));
      return p.join(' ; ')+'.';
    }

    /* ───── blocs de texte ───── */
    const un=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’-]/g,' ');
    /** liste compacte (une ligne par famille) + détail des familles qui concernent la phrase + règles + état */
    function contexte(texte){
      const n=un(texte);
      const lignes=FAMILLES.map(f=>'• '+f.nom+' : '+f.court.split(' ; ').slice(0,3).join(' ; ')+' — ex. « '+f.ex.slice(0,2).join(' », « ')+' »');
      const det=FAMILLES.filter(f=>f.mots.test(n)).slice(0,2).map(f=>'DÉTAIL « '+f.nom+' » — '+f.court+'. Paramètres : '+f.params()+'.'+(f.limites.length?' Limites : '+f.limites.join(' ; ')+'.':'')+' Exemples : « '+f.ex.join(' », « ')+' ».');
      return 'CAPACITÉS DE RAYLÉ (registre généré depuis le code) :\n'+lignes.join('\n')+(det.length?'\n'+det.join('\n'):'')+'\n'+REGLES+'\n'+etatTexte();
    }
    /** liste lisible à voix haute pour « que sais-tu faire ? » : thèmes regroupés, quelques exemples */
    function resume(){ return FAMILLES.map(f=>f.nom+' : '+f.court.split(' ; ')[0]+'.').join(' '); }
    /** page Markdown du registre complet (docs/capacites.md) */
    function markdown(){
      const o=['# Capacités de Raylé','','Généré depuis le code par `node scripts/capacites.mjs` (registre : `js/rayle/capacites.js`). Ne pas modifier à la main.',''];
      for(const f of FAMILLES){
        o.push('## '+f.nom,'',f.court.replace(/ ; /g,' · ')+'.','','- **Paramètres (lus dans le code)** : '+f.params()+'.');
        if(f.limites.length) o.push('- **Cas limites** : '+f.limites.join(' ; ')+'.');
        o.push('- **Exemples** : '+f.ex.map(x=>'« '+x+' »').join(', ')+'.','- **Vérification automatique** : '+(f.verif?'oui (les exemples sont passés dans l’analyseur réel par `tests/capacites-test.mjs`)':'non (décidé par l’IA ou une API en ligne)')+'.','');
      }
      return o.join('\n');
    }
    const famille=id=>FAMILLES.find(f=>f.id===id)||null;
    return {FAMILLES,famille,contexte,etat,etatTexte,resume,markdown,noterEchange,REGLES,journal};
  })();
  if(typeof module!=='undefined') module.exports=RayleCapacites;
