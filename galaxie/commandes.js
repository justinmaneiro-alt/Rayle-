"use strict";
  /* ═════════════ COMMANDES VOCALES DE LA GALAXIE ═════════════
     « va sur Mars », « montre-moi Saturne », « retour à la galaxie », « ferme la galaxie », « active le mode jeu »…
     Interprétées ici, tout de suite, sans IA. La grammaire (galaxie/grammaire.js) et les noms de planètes (manifestes)
     sont chargés à la demande ; les ordres passent par le bus d'ordres (core/commun/ordres.js). */

  let galRegistre=null, galGrammaire=null, galPret=null, galEntiteAvant=null;
  // Mots qui commencent une commande possible : on ne charge rien tant que la phrase n'y ressemble pas
  const GAL_AMORCE=/^(?:va|vas|aller|allons|emmene|amene|ramene|conduis|vole|voler|fonce|foncer|direction|cap|rends|rendons|transporte|envoie|dirige|montre|montrer|affiche|afficher|ouvre|ouvrir|zoome|zoomer|zoom|approche|approcher|visite|visiter|regarde|regarder|retourne|retourner|reviens|revenir|retour|ferme|fermer|quitte|quitter|sors|sortir|rentre|entre|entrer|descends|descendre|penetre|ressors|ressortir|remonte|remonter|recule|reculer|dezoome|de zoome|galaxie|systeme|univers|mode|active|desactive|lance|lancer|mets|met|passe|fin|coupe|arrete|stop|en arriere|la galaxie|le systeme|combien|quel|quels|a combien|ca tourne|test|banc|benchmark|mesure|mesurer|teste|tester|fais|regle|regler|change|changer|choisis|selectionne|utilise|qualite|graphismes?|cache|cacher|masque|masquer|ajoute|ajouter|supprime|enleve|retire|trace|tracer|efface|effacer)\b|\bmode jeux?\b/;

  function galModeJeu(p){
    const actif=p.etat==='actif', deja=!!(RayleBus.etat('mode_jeu')||{}).actif;
    if(actif===deja) return {ok:true,texte:actif?'Le mode jeu est déjà actif.':'Le mode jeu est déjà désactivé.'};
    document.body.classList.toggle('mode-jeu',actif);
    try{   // l'entité s'allège aussi ; on remet le choix de l'utilisateur à la sortie
      if(actif){ galEntiteAvant=localStorage.getItem('rayle_entite_qualite')||'auto'; Entite.qualite(3,{temporaire:true}); }   // 3 = dessin 2D léger, 30 images/s ; temporaire : jamais mémorisé (fermer Rayle en mode jeu ne doit pas laisser l'accueil en mode léger)
      else{ Entite.qualite(galEntiteAvant==='auto'||galEntiteAvant==null?'auto':Number(galEntiteAvant)); galEntiteAvant=null; }
    }catch(e){}
    RayleBus.fusion('mode_jeu',{actif}); RayleBus.emit('mode:jeu',{actif});
    return {ok:true,texte:actif?"Mode jeu activé : j'allège la 3D pour libérer "+fx('votre PC','ton PC')+".":'Mode jeu désactivé.'};
  }

  function galPreparer(){
    if(!galPret) galPret=(async()=>{
      const base=document.baseURI;
      const [reg,gram]=await Promise.all([import(new URL('galaxie/registre.js',base).href),import(new URL('galaxie/grammaire.js',base).href)]);
      const r=await reg.registre();
      RayleOrdres.declarer(r.ordres());
      if(!RayleOrdres.disponible('rayle','mode_jeu')) RayleOrdres.enregistrer('rayle','mode_jeu',galModeJeu);
      galRegistre=r; galGrammaire=gram;
    })().catch(e=>{ galPret=null; throw e; });
    return galPret;
  }
  // Préparation discrète après le démarrage : la première commande répond sans attendre le chargement.
  // Le panneau de réglages et la vue galaxie l'attendent aussi (window.RayleGalaxie.preparer) : aucun ordre ne tombe sur un module pas encore prêt.
  window.RayleGalaxie={preparer:galPreparer};

  /* La Terre comme outil de Raylé : les actions « terre » de l'agent (afficher_terre, aller_a, afficher_actualites, expliquer_actualite, meteo) sont exécutées par
     planetes/terre/pc/ordres-terre.js (chargé à la demande) ; sa réponse parlée est ensuite lue segment par segment, la caméra suivant chaque sujet. */
  let terrePret=null;
  const terreModule=()=>terrePret||(terrePret=import(new URL('planetes/terre/pc/ordres-terre.js',document.baseURI).href).catch(e=>{ terrePret=null; throw e; }));
  /* V7b : sur téléphone et tablette, jamais de galaxie : les ordres « Terre » de l'agent s'exécutent dans Jarvis (fenêtres d'actualités, météo) ; le reste dit honnêtement « réservé au PC ». */
  const mobile=()=>!!(window.RayleAppareil&&RayleAppareil.estMobile());
  const MSG_GALAXIE=()=>(window.RayleAppareil&&RayleAppareil.MESSAGE_GALAXIE)||'Le mode Galaxie est réservé au PC ; ici je reste sur Jarvis.';
  async function terreMobile(a){
    switch(a.op){
      case 'actualites': {
        if(a.portee==='pays'&&a.pays&&window.ActusPays){ await ActusPays.ouvrirPays(a.pays); return {ok:true}; }
        if(window.ActusAccueil){ await ActusAccueil.ouvrir(a.portee==='monde'?'monde':'france',a.rubrique||null); return {ok:true}; }
        return {ok:false};
      }
      case 'meteo': {
        if(Number.isFinite(a.lat)&&Number.isFinite(a.lon)){ const F=await import(new URL('planetes/terre/pc/fenetres-terre.js',document.baseURI).href); return F.creerFenetres().meteo(a.lat,a.lon,a.nom); }
        if(window.TableauBord) TableauBord.ouvrir('meteo'); return {ok:true};
      }
      case 'afficher': case 'aller': {      // carte plate légère (même planète, mêmes données), dans un plein écran à elle : jamais la galaxie
        const T=await HoteModules.ouvrirTerre(); const l=a.lieu||{};
        if(a.op==='aller'&&Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&T&&T.aller) T.aller({nom:l.nom,lat:l.lat,lon:l.lon,distance:l.dist||25});
        return {ok:true};
      }
      case 'eclairer': case 'evenements':
        addLine('sys',MSG_GALAXIE()+' La carte du monde 3D n’existe pas ici : je te donne les actualités et la météo.'); return {ok:false,reservePC:true};
      default: return {ok:false};
    }
  }
  window.TerreVoix={
    attente:false,
    async executer(a){ if(mobile()) return terreMobile(a); const m=await terreModule(); try{ return await m.executer(a); }finally{ this.attente=m.enAttente(); } },
    enAttente(){ return this.attente; },
    propre(t){ return String(t==null?'':t).replace(/\s*\[\d{1,2}\]\s*/g,' ').replace(/\s+/g,' ').trim(); },
    async dire(reply,speak,annule){ const m=await terreModule(); this.attente=false; return m.dire(reply,speak,annule); }
  };
  if(!mobile()) setTimeout(()=>{ galPreparer().catch(()=>{}); },5000);      // sur téléphone / tablette : rien de la galaxie n'est préparé

  /* Terminal de Mars : « montre-moi l'or en H1 », « passe en H4 », « mets le nasdaq ». Pris avant les commandes du terminal 2D, mais SEULEMENT quand Mars est ouverte
     (ou que la phrase dit « sur Mars » / « dans la base ») : sinon le terminal 2D garde ses commandes. L'analyse de la phrase est pure : planetes/mars/pc/trading/instruments.js. */
  async function commandeMars(texte){
    const actif=!!(window.Mars&&window.Mars.etat&&window.Mars.etat().actif);
    const n0=cmdNorm(norm(texte)).replace(/['’\-\/]/g,' ').replace(/\s+/g,' ').trim();
    const explicite=/\b(?:sur mars|dans la base|a la base|base martienne|sur la table)\b/.test(n0);
    // V2 phase 12 : réalité virtuelle : « active la réalité virtuelle », « entre en VR », « sors de la VR », « recentre la VR », « mode galaxie en VR » (drapeau, WebXR)
    if(new RegExp(String.fromCharCode(92)+'b(?:vr|realite virtuelle)'+String.fromCharCode(92)+'b').test(n0) && window.RayleVRUI){ try{ const rep=await window.RayleVRUI.traiterVoix(texte); if(rep) return rep; }catch(e){ /* les autres commandes décident */ } }
    // V2 phase 11 : gestes de la main : « active les gestes », « désactive les gestes », « aide des gestes », « calibre les gestes », « gestes en pause »
    if(/\bgestes?\b/.test(n0) && window.Gestes){ try{ const rep=await window.Gestes.traiterVoix(texte); if(rep) return rep; }catch(e){ /* les autres commandes décident */ } }
    // V2 phase 10 : atelier 3D de Neptune : « ouvre l'atelier 3D » partout, puis (atelier ouvert) « présente pièce par pièce », « isole le piston », « éclate la vue », « fabrique un engrenage… »
    if(/atelier|maquette|piece|eclat|rassemble|isole|fabrique|visite|mesure|circonference|coupe|exporte|symetri|duplique|impression/.test(n0)){
      try{ const NV=await import(new URL('planetes/neptune/pc/voix-neptune.js',document.baseURI).href), rep=await NV.traiter(texte); if(rep) return rep; }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // V2 phase 8 : LPPR (Titre II) : « ouvre la LPPR », « code LPPR de l'emboîture tibiale », « explique le code … », « peut-on cumuler … et … », « devis : … » (index local, sans IA)
    if(/lpp|nomenclature|devis|cumul|[0-9]{7}|forfait.*reparation|reparation.*(?:forfait|prothese|orthese)|autre code|pas (?:le|ce) (?:bon )?code|c est le code/.test(n0)){
      try{ const L=await import(new URL('core/lppr/lppr-fenetre.js',document.baseURI).href), rep=await L.traiterVoix(texte); if(rep) return rep; }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // V3 : l'agent unique (Kepler) : « que fait l'agent ? », « le rapport de l'agent », « mets l'agent en pause », « reprends l'agent », « envoie le statut de l'agent sur Telegram » (données de l'agent, sans IA ; Rayle reste la seule voix)
    if(/\b(?:l agent|kepler)\b/.test(n0) && /\b(?:que fait|ou en est|comment va|statut|etat|rapport|bilan|compte rendu|pause|reprend|reprends|relance|retour arriere|charge|telegram|nouvelles|point sur|en ce moment|maintenant)\b/.test(n0)){
      try{ const AV=await import(new URL('planetes/mars/pc/trading/voix-agent-v3-page.js',document.baseURI).href), rep=await AV.traiterAgentV3(n0); if(rep) return rep; }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // V2 phase 6 : « à quoi sert le gardien prop ? » (outils du terminal, partout), « ouvre les agents prêts », « lis le marché », « explique les dernières bougies » (Mars ouverte) : modèles de phrases, sans IA
    if(/\b(?:a quoi (?:sert|servent)|que fait (?:l outil|le panneau|la fenetre)|c est quoi (?:l outil|le panneau|la fenetre|cet outil)|explique(?: moi)? (?:l outil|le panneau|la fenetre|cet outil)|comment (?:marche|fonctionne) (?:l outil|le panneau|la fenetre)|agents? prets?|assistant de strategies?|assistant d agents?|strategie guidee|agent tendance|agent divergence|lis le marche|lit le marche|lire le marche|analyse le marche|decris le marche|lecture du marche|dernieres? bougies?|bougie par bougie)\b|\b(?:lis|lit|analyse) (?:le |la )?(?:bitcoin|btc|solana|sol|dogecoin|doge)\b/.test(n0)){
      try{ const VA=await import(new URL('planetes/mars/pc/trading/voix-agents-v2-page.js',document.baseURI).href), rep=await VA.traiterAgentsV2(n0,{actif,explicite}); if(rep) return rep; }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // Agent BTC : explications parlées construites par modèles de phrases à partir des données de l'agent (zéro IA) ; question libre = IA comme d'habitude
    // Hub Finance (M2b) : « le COT de l'or », « le calendrier de la semaine », « que dit la Fed ? », « les actualités qui font bouger le Nasdaq », « la courbe des taux », « la carte du Nasdaq », « les résultats de Nvidia ».
    // Réponses construites à partir des données réelles (CFTC, Trésor, BLS, flux publics…), sans IA ; l'espace de travail s'ouvre sur le bon onglet. Hors de Mars, COT et calendrier restent à l'ancien terminal.
    if(/\b(?:cot|cftc|calendrier|agenda|annonces?|evenements?|fed|bce|ecb|boe|boj|bns|banques? centrales?|publications?|actualites?|news|bouger|bougent|impactent|courbe|taux|rendements?|inflation|chomage|heatmap|carte|nasdaq|resultats?|depots?|edgar)\b/.test(n0)){
      try{
        const VF=await import(new URL('planetes/mars/pc/finance/voix-finance.js',document.baseURI).href), dem=VF.analyserDemandeFinance(texte);
        if(dem && (actif || explicite || !['cot','calendrier'].includes(dem.type))){
          const FD=await import(new URL('planetes/mars/pc/finance/donnees.js',document.baseURI).href), rep=await VF.repondre(dem,FD.obtenirFinance());
          if(rep){
            try{
              const PF=await import(new URL('planetes/mars/pc/trading/panneaux-finance.js',document.baseURI).href), EF=await import(new URL('planetes/mars/pc/trading/fenetre.js',document.baseURI).href);
              if(rep.reglage) PF.reglerFinance(rep.panneau,rep.reglage);
              await EF.ouvrirEspace({dock:rep.panneau,focus:rep.panneau});
              if(rep.reglage) PF.reglerFinance(rep.panneau,rep.reglage);
            }catch(e){ /* l'espace de travail n'est pas ouvrable ici : la réponse parlée suffit */ }
            return rep.texte;
          }
        }
      }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // Microstructure (M4) : « explique l'absorption », « quelle session est en cours ? », « où sont les zones de liquidité ? » : modèles de phrases + mesures en cours, sans IA
    if(/\b(?:absorption|balayage|sweep|liquidite|zones? de stops?|les stops|session|desequilibre|imbalance|vwap|prix ronds?|nombres? ronds?|niveaux? ronds?|compression|expansion|financement|funding|interet ouvert|open interest|liquidations?|microstructure)\b/.test(n0)){
      try{
        const MC=await import(new URL('planetes/mars/pc/agent-btc/micro-concepts.js',document.baseURI).href), det=MC.detecterQuestionMicro(n0);
        if(det){ const A0=await import(new URL('planetes/mars/pc/trading/session-agent.js',document.baseURI).href); return await A0.expliquerMicroAgent(det); }
      }catch(e){ /* module indisponible : les autres commandes décident */ }
    }
    // Agent de trading (M6) : « où j'en suis sur mes limites ? », « ai-je le droit de prendre un trade ? », « suis-je en tilt ? », « probabilité de réussir l'évaluation ? », « bilan de la semaine », « teste ma zone »…
    if(/\b(?:limites?|marge|tilt|evaluation|challenge|regime|range|cassure|craint|bilan|journal|sante|ma zone|bougie|rejoue\w*|dessins?|bibliotheque|droit de|ou j en suis|mon compte|gardien|simulation|drawdown|puis je|doge|dogecoin|solana)\b/.test(n0) && (actif || explicite || /\b(?:tilt|gardien|drawdown|evaluation|agent|trade|trader|trading|bitcoin|btc|solana|doge|dogecoin|prop|marge|journal de trades)\b/.test(n0) || (window.PosteAgent&&window.PosteAgent.poste&&window.PosteAgent.poste()))){
      try{
        const VP=await import(new URL('planetes/mars/pc/trading/voix-poste-page.js',document.baseURI).href), rep=await VP.traiterM6(n0);
        if(rep!==null && rep!==undefined) return rep;
      }catch(e){ /* l'agent n'est pas chargeable : les autres commandes décident */ }
    }
    // Poste de pilotage de l'agent Bitcoin (M5) : « ouvre l'agent »,« montre-moi les stratégies », « pourquoi cette stratégie a perdu ? », « où en est la recherche ? », « donne une idée à l'agent »…
    if(/\b(?:agent|strategies?|recherche|idee|dernier trade|poste de pilotage|pourquoi|quand)\b/.test(n0) && (/\b(?:agent|strategies?|bitcoin|btc|recherche|idee|dernier trade|poste)\b/.test(n0) || (window.PosteAgent&&window.PosteAgent.poste&&window.PosteAgent.poste()))){
      try{
        const VP=await import(new URL('planetes/mars/pc/trading/voix-poste-page.js',document.baseURI).href), rep=await VP.traiter(n0);
        if(rep!==null && rep!==undefined) return rep;
      }catch(e){ /* le poste n'est pas chargeable : les autres commandes décident */ }
    }
    if(/\b(?:agent|bitcoin|btc|backtests?|setup|volume profile|profil de volume|delta|phase)\b/.test(n0) || actif){
      try{
        const A=await import(new URL('planetes/mars/pc/trading/session-agent.js',document.baseURI).href);
        if(/\b(?:lance|lancer|demarre|demarrer|relance|relancer)\b/.test(n0) && /\b(?:recherche|backtests?)\b/.test(n0) && /\b(?:agent|strategie|bitcoin|btc)\b/.test(n0)) return await A.lancerRechercheAgent();
        const sujet=A.sujetDeLaPhrase(n0);
        if(sujet && (actif || explicite || /\b(?:agent|bitcoin|btc|backtests?|setup)\b/.test(n0) || sujet==='volume_profile' && /\bagent\b/.test(n0))) return await A.expliquerAgent(sujet);
      }catch(e){ /* l'agent n'est pas chargeable : on laisse les autres commandes décider */ }
    }
    if(!actif && !explicite) return null;
    const panneau=n0.match(/\b(?:(dashboard|tableau de bord)(?: analytique)?|(contexte de marche|contexte du marche))\b/);
    if(panneau && n0.split(' ').length<=9 && /\b(?:montre|affiche|ouvre|ouvrir|afficher|montrer|va|mets|met|donne)\b/.test(n0)){
      try{ await galPreparer(); }catch(e){ return null; }
      if(RayleBus.demander('vue')!=='galaxie' && !(await galOuvrir())) return galEchec();
      return galOrdre('mars','ouvrir_fenetre',{fenetre:panneau[1]?'dashboard':'contexte'});
    }
    const n1=norm(texte).replace(/[?!.,;:…«»"'’\-\/]/g,' ').replace(/\s+/g,' ').trim();   // sans cmdNorm : « Raylé » est ici le nom du graphique, pas le mot d'activation
    const src=n1.match(/\b(tradingview|trading view|rayle|maison)\b/);
    if(src && /\bgraphique\b|\btradingview\b|\btrading view\b/.test(n1) && /\b(?:mets|met|passe|affiche|montre|bascule|utilise|change|revenir|reviens)\b/.test(n1) && n1.split(' ').length<=9){
      try{ await galPreparer(); }catch(e){ return null; }
      if(RayleBus.demander('vue')!=='galaxie' && !(await galOuvrir())) return galEchec();
      return galOrdre('mars','choisir_source',{source:/rayle|maison/.test(src[1])?'rayle':'tv'});
    }
    if(!/\b(?:or|gold|xau|nasdaq|nas100|us ?100|ndx|dollar|dxy|taux|rendement|vix|bitcoin|btc|solana|sol|euro|volatilite|m15|h1|h4|d1|daily|journalier|quinze|une heure|1 heure|4 heures|quatre heures|15 minutes|quart d heure|jour|journee)\b/.test(n0)) return null;
    let I; try{ I=await import(new URL('planetes/mars/pc/trading/instruments.js',document.baseURI).href); }catch(e){ return null; }
    const d=I.analyserDemande(n0.replace(/\b(?:sur mars|dans la base|a la base|base martienne|sur la table)\b/g,' ').replace(/\s+/g,' ').trim());
    if(!d) return null;
    try{ await galPreparer(); }catch(e){ return null; }
    if(RayleBus.demander('vue')!=='galaxie' && !(await galOuvrir())) return galEchec();
    if(d.instrument&&d.unite) return galOrdre('mars','afficher_graphique',{instrument:d.instrument,unite:d.unite});
    if(d.instrument) return galOrdre('mars','changer_actif',{actif:d.instrument});
    return galOrdre('mars','changer_unite',{unite:d.unite});
  }
  window.commandeMars=commandeMars;

  async function galOrdre(vers,action,params){
    const r=await RayleOrdres.envoyer({de:'rayle',vers,action,params});
    if(r.ok) return r.texte||'C\'est fait.';
    if(vers==='rayle' && /^prévu, pas encore disponible/.test(r.erreur||'')) return "La galaxie n'est pas prête : certains fichiers de la page sont peut-être périmés. Rechargez avec Ctrl+F5, puis réessayez.";
    return "Je n'ai pas pu le faire : "+r.erreur+'.';
  }
  async function galOuvrir(){
    if(RayleBus.demander('vue')!=='galaxie') await RayleBus.demander('vue:ouvrir','galaxie');
    return RayleBus.demander('vue')==='galaxie';
  }
  // Message à dire quand la galaxie refuse de s'ouvrir : la raison précise, si on la connaît
  const galEchec=()=>{ const e=RayleBus.etat('galaxie'); return (e&&e.erreur)?e.erreur.replace(/\s*\(.*?\)\.\s*Rechargez/,'. Rechargez'):"Je n'arrive pas à ouvrir la galaxie."; };

  async function commandeGalaxie(texte){
    const n=cmdNorm(norm(texte)).replace(/['’\-\/]/g,' ').replace(/\s+/g,' ').trim();
    if(!n || n.split(' ').length>9) return null;
    if(mobile()){      // V7b : aucune galaxie ici, mais une réponse claire et polie
      if(/\b(?:carte|planisphere)\b.*\b(?:monde|terre)\b|\b(?:ouvre|affiche|montre)\b.*\b(?:la terre|carte)\b/.test(n) && !/galaxie/.test(n) && window.HoteModules){ try{ await HoteModules.ouvrirTerre(); return 'Voici la carte de la Terre.'; }catch(e){ return 'La carte n’est pas disponible : '+(e&&e.message||e)+'.'; } }
      if(/\b(?:galaxie|systeme solaire)\b/.test(n) && /\b(?:ouvre|ouvrir|affiche|afficher|montre|montrer|va|retour|mode|active|lance|visite|entre)\b/.test(n)) return MSG_GALAXIE();
      if(/\b(?:va|vas|aller|emmene|amene|vole|direction|visite|zoome|approche)\b.*\b(?:mars|saturne|jupiter|neptune|uranus|venus|mercure|soleil)\b/.test(n)) return MSG_GALAXIE()+' Je peux ouvrir le terminal, l’agent, les actualités ou la météo.';
      return null;
    }
    if(!galGrammaire && !GAL_AMORCE.test(n)) return null;
    try{ await galPreparer(); }catch(e){ return null; }
    const vue=RayleBus.demander('vue');
    const a=galGrammaire.analyserCommandeGalaxie(n,galRegistre.lexique,{ouvert:vue==='galaxie',vaisseau:!!(window.Saturne&&window.Saturne.etat().actif),salle:!!(window.Saturne&&window.Saturne.etat().mode==='salle')});
    if(!a) return null;
    switch(a.type){
      case 'mode_jeu': return galOrdre('rayle','mode_jeu',{etat:a.etat});
      case 'quitter': RayleBus.demander('vue:fermer'); return 'Retour à Raylé.';
      case 'ouvrir': return (await galOuvrir()) ? 'Voici la galaxie.' : galEchec();
      case 'vue_ensemble': if(!(await galOuvrir())) return galEchec(); return galOrdre('rayle','retour',{});
      case 'retour': {
        const e=RayleBus.etat('galaxie')||{};
        if(e.focus||e.sas||e.vol||e.selection) return galOrdre('rayle','retour',{});
        RayleBus.demander('vue:fermer'); return 'Retour à Raylé.';
      }
      case 'qualite': if(!(await galOuvrir())) return galEchec(); return galOrdre('rayle','regler_qualite',{niveau:a.niveau});
      case 'fps': if(!(await galOuvrir())) return galEchec(); return galOrdre('rayle','afficher_fps',{etat:a.etat});
      case 'orbites': if(!(await galOuvrir())) return galEchec(); return galOrdre('rayle','afficher_orbites',{etat:a.etat});
      case 'reglages': return galOrdre('rayle','afficher_reglages',{etat:a.etat});
      case 'fps_valeur': {
        if(vue!=='galaxie'||!window.Galaxie) return "La galaxie n'est pas ouverte : je ne la dessine pas en ce moment.";
        const m=window.Galaxie.mesures();
        return m.fps>0 ? 'La galaxie tourne à '+Math.round(m.fps)+' images par seconde, et '+Math.round(m.pire1)+' dans les pires moments.' : "Je n'ai pas encore assez d'images pour le dire.";
      }
      case 'mesurer': {
        if(!(await galOuvrir())) return galEchec();
        if((RayleBus.etat('mode_jeu')||{}).actif) return 'Le mode jeu bride volontairement la galaxie : désactive-le avant de mesurer.';
        const intro='Je lance le test, environ quinze secondes. Ne touche à rien.';
        addLine('ray',intro); try{ await speak(intro); }catch(e){}
        return galOrdre('rayle','mesurer_performance',{});
      }
      case 'base_entrer': if(!(await galOuvrir())) return galEchec(); return galOrdre('mars','entrer_base',{});
      case 'base_sortir': if(!window.Mars||window.Mars.etat().mode!=='interieur') return "Je ne suis pas dans la base martienne."; return galOrdre('mars','sortir_base',{});
      case 'bureau': if(!(await galOuvrir())) return galEchec(); return galOrdre('mars','visiter_bureau',{});
      case 'anat_systeme': return galOrdre('saturne','afficher_systeme',{systeme:a.systeme});
      case 'anat_decrire': return galOrdre('saturne','decrire',{nom:a.nom});
      case 'anat_montrer': return galOrdre('saturne','anatomie_montrer',{nom:a.nom});
      case 'anat_isoler': return galOrdre('saturne','anatomie_isoler',{nom:a.nom});
      case 'anat_comparer': return galOrdre('saturne','anatomie_comparer',{nom:a.nom});
      case 'anat_couches': return galOrdre('saturne','anatomie_couches',{niveau:a.niveau});
      case 'anat_cotation': return galOrdre('saturne','anatomie_cotation',{});
      case 'anat_flux': return galOrdre('saturne','anatomie_flux',{etat:a.etat});
      case 'anat_mouvement': return galOrdre('saturne','animer',{mouvement:a.mouvement});
      case 'anat_mouvement_stop': return galOrdre('saturne','anatomie_mouvement_stop',{});
      case 'anat_patho': return galOrdre('saturne','afficher_pathologie',{nom:a.nom+(a.valeur!==undefined?' de '+a.valeur+' degrés':'')+(a.cote?' '+a.cote:'')});
      case 'anat_patho_stop': return galOrdre('saturne','anatomie_pathologie_stop',{});
      case 'anat_tout': return galOrdre('saturne','anatomie_tout',{});
      case 'anat_coupe': return galOrdre('saturne','anatomie_coupe',{plan:a.plan});
      case 'anat_noms': return galOrdre('saturne','anatomie_noms',{langue:a.langue});
      case 'anat_transparence': return galOrdre('saturne','anatomie_transparence',{etat:a.etat});
      case 'vaisseau_entrer': if(!(await galOuvrir())) return galEchec(); return galOrdre('saturne','entrer_vaisseau',{});
      case 'vaisseau_aller': return galOrdre('saturne','aller_a',{cible:a.cible});
      case 'vaisseau_vue': return galOrdre('saturne','changer_vue',{vue:a.vue});
      case 'vaisseau_asseoir': return galOrdre('saturne','s_asseoir',{});
      case 'vaisseau_lever': return galOrdre('saturne','se_lever',{});
      case 'salle_ouvrir': return galOrdre('saturne','ouvrir_salle_medicale',{});
      case 'salle_fermer': return galOrdre('saturne','fermer_salle_medicale',{});
      case 'vaisseau_stop': return galOrdre('saturne','arreter_vaisseau',{});
      case 'vaisseau_orbite': return galOrdre('saturne','mettre_en_orbite',{});
      case 'vaisseau_commandes': return galOrdre('saturne','afficher_commandes',{});
      case 'vaisseau_reglage': return galOrdre('saturne','reglage_vol',{reglage:a.reglage,etat:a.etat});
      case 'aller': if(!(await galOuvrir())) return galEchec(); return galOrdre('rayle','aller_a',{cible:a.cible});
    }
    return null;
  }
