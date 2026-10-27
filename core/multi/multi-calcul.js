/* ═════════════ MULTI-ÉCRANS : calculs purs (testés sous Node : galaxie/tests/multi-calcul-test.mjs) ═════════════
   Écrans, dispositions (quels modules sur quel écran), enregistrement de plusieurs dispositions, plan d'ouverture/fermeture des fenêtres,
   analyse des phrases (« active le mode multi-écrans », « mets la disposition Trading »…). Aucune dépendance au navigateur ni à Windows :
   les positions peuvent être simulées. Utilisable dans la page (window.MultiCalcul) et sous Node (module.exports).
   Vocabulaire : écran = {id, numero, nom, x, y, w, h, primaire, orientation} ; module = {id, type, params, part} ;
   disposition = {ecrans:{[idEcran]:[module…]}} ; état enregistré = {version, actif, courante, dispositions:{[nom]:disposition}}. */
(function(racine){
  "use strict";
  const TYPES_PAR_DEFAUT=['rayle','actus','fil','conversation','meteo','terre','galaxie','vide'];
  const PART_MIN=1, PART_MAX=6, MAX_MODULES=6, VERSION=1;
  const sans=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/œ/g,'oe').replace(/[’'`]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const nb=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
  const copie=o=>JSON.parse(JSON.stringify(o));
  let compteurId=0;
  const nouvelId=pref=>pref+'-'+Date.now().toString(36).slice(-4)+(++compteurId).toString(36)+Math.floor(Math.random()*1296).toString(36);

  /* ───── écrans ───── */
  /* Accepte la liste brute (PowerShell/.NET ou simulation) : garde les écrans valides, calcule orientation et numéro, trie (principal d'abord, puis de gauche à droite). */
  function normaliserEcrans(brut){
    const vus=new Set(), liste=[];
    (Array.isArray(brut)?brut:[]).forEach((e,i)=>{
      if(!e||typeof e!=='object') return;
      const w=nb(e.w,0), h=nb(e.h,0); if(w<=0||h<=0) return;
      let id=String(e.id||('ecran-'+(i+1))); if(vus.has(id)) id+='-'+i; vus.add(id);
      const m=/(\d+)\s*$/.exec(String(e.id||'')); const numero=nb(e.numero,m?Number(m[1]):i+1);
      liste.push({id,numero,nom:String(e.nom||('Écran '+numero)),x:nb(e.x,0),y:nb(e.y,0),w,h,primaire:!!e.primaire,orientation:h>w?'vertical':'horizontal'});
    });
    if(liste.length&&!liste.some(e=>e.primaire)){ const g=liste.slice().sort((a,b)=>a.x-b.x)[0]; g.primaire=true; }
    return liste.sort((a,b)=>(a.primaire?0:1)-(b.primaire?0:1)||a.x-b.x||a.y-b.y);
  }
  /* Rectangles pour dessiner les écrans à l'échelle dans une zone largeur × hauteur (marge en pixels) : {id, left, top, width, height, echelle}. */
  function echelleEditeur(ecrans,largeur,hauteur,marge=6){
    if(!ecrans.length) return {echelle:1,rects:[]};
    const x0=Math.min(...ecrans.map(e=>e.x)), y0=Math.min(...ecrans.map(e=>e.y));
    const x1=Math.max(...ecrans.map(e=>e.x+e.w)), y1=Math.max(...ecrans.map(e=>e.y+e.h));
    const echelle=Math.min((largeur-2*marge)/(x1-x0),(hauteur-2*marge)/(y1-y0));
    const dx=marge+((largeur-2*marge)-(x1-x0)*echelle)/2, dy=marge+((hauteur-2*marge)-(y1-y0)*echelle)/2;
    return {echelle,rects:ecrans.map(e=>({id:e.id,left:dx+(e.x-x0)*echelle,top:dy+(e.y-y0)*echelle,width:e.w*echelle,height:e.h*echelle}))};
  }

  /* ───── modules et dispositions ───── */
  const creerModule=(type,params,part)=>({id:nouvelId('m'),type:String(type),params:params&&typeof params==='object'?copie(params):{},part:Math.max(PART_MIN,Math.min(PART_MAX,Math.round(nb(part,1))))});
  function dispositionVide(){ return {ecrans:{}}; }
  /* Disposition proposée au premier lancement : écran principal = Raylé · premier écran horizontal secondaire = actualités · écran vertical = fil + conversation.
     S'adapte aux écrans présents (un seul écran : seulement Raylé ; deux écrans sans écran vertical : le second fait actualités). */
  function dispositionDefaut(ecrans){
    const d=dispositionVide(); const liste=normaliserEcrans(ecrans);
    const prim=liste.find(e=>e.primaire), autres=liste.filter(e=>!e.primaire);
    if(prim) d.ecrans[prim.id]=[creerModule('rayle',{},1)];
    const vertical=autres.find(e=>e.orientation==='vertical'), horiz=autres.filter(e=>e.orientation==='horizontal');
    if(horiz[0]) d.ecrans[horiz[0].id]=[creerModule('actus',{portee:'france',rubrique:null},1)];
    if(vertical) d.ecrans[vertical.id]=[creerModule('fil',{},1),creerModule('conversation',{},2)];
    if(!vertical&&horiz[1]) d.ecrans[horiz[1].id]=[creerModule('meteo',{},1)];
    autres.filter(e=>!d.ecrans[e.id]).forEach(e=>{ d.ecrans[e.id]=[creerModule('vide',{},1)]; });   // écrans en plus : noirs, à régler par l'utilisateur
    return d;
  }
  function etatInitial(ecrans){ return {version:VERSION,actif:false,courante:'Défaut',dispositions:{'Défaut':dispositionDefaut(ecrans)}}; }

  /* Répare un état lu du disque (JSON corrompu, ancienne version, type de module disparu) sans jamais lever d'erreur. Les écrans absents sont GARDÉS (réglage conservé). */
  function normaliserEtat(brut,ecrans,types){
    const ok=new Set(types&&types.length?types:TYPES_PAR_DEFAUT);
    const etat={version:VERSION,actif:false,courante:'',dispositions:{}};
    if(brut&&typeof brut==='object'){
      etat.actif=brut.actif===true;
      const ds=brut.dispositions&&typeof brut.dispositions==='object'?brut.dispositions:{};
      for(const [nom,d] of Object.entries(ds)){
        const n=String(nom).trim().slice(0,40); if(!n||!d||typeof d!=='object') continue;
        const disp=dispositionVide();
        for(const [idE,mods] of Object.entries(d.ecrans&&typeof d.ecrans==='object'?d.ecrans:{})){
          if(!Array.isArray(mods)) continue;
          disp.ecrans[idE]=mods.filter(m=>m&&typeof m==='object'&&ok.has(String(m.type))).slice(0,MAX_MODULES)
            .map(m=>({id:/^[\w-]{1,40}$/.test(String(m.id||''))?String(m.id):nouvelId('m'),type:String(m.type),params:m.params&&typeof m.params==='object'?copie(m.params):{},part:Math.max(PART_MIN,Math.min(PART_MAX,Math.round(nb(m.part,1))))}));
        }
        etat.dispositions[n]=disp;
      }
      etat.courante=String(brut.courante||'');
    }
    if(!Object.keys(etat.dispositions).length) etat.dispositions['Défaut']=dispositionDefaut(ecrans||[]);
    if(!etat.dispositions[etat.courante]) etat.courante=Object.keys(etat.dispositions)[0];
    return etat;
  }

  /* Les fonctions suivantes ne modifient pas leurs arguments : elles renvoient une nouvelle disposition (ou un nouvel état). */
  function ajouterModule(disp,idEcran,type,params,index){
    const d=copie(disp), l=d.ecrans[idEcran]=d.ecrans[idEcran]||[];
    if(l.length>=MAX_MODULES) return {disp:d,erreur:'6 modules au plus par écran'};
    if(type==='vide'&&l.length) return {disp:d,erreur:'un écran vide ne reçoit pas d’autre module'};
    if(l.some(m=>m.type==='vide')) l.length=0;                 // on remplit un écran noir : le noir disparaît
    const m=creerModule(type,params,1); const i=Number.isInteger(index)?Math.max(0,Math.min(l.length,index)):l.length;
    l.splice(i,0,m); return {disp:d,module:m};
  }
  function retirerModule(disp,idEcran,idModule){
    const d=copie(disp); const l=d.ecrans[idEcran]||[]; d.ecrans[idEcran]=l.filter(m=>m.id!==idModule); if(!d.ecrans[idEcran].length) delete d.ecrans[idEcran]; return d;
  }
  /* Déplace un module (réorganisation sur le même écran, ou passage d'un écran à l'autre). index = place dans l'écran d'arrivée. */
  function deplacerModule(disp,deEcran,idModule,versEcran,index){
    const d=copie(disp); const src=d.ecrans[deEcran]||[]; const i=src.findIndex(m=>m.id===idModule);
    if(i<0) return {disp:d,erreur:'module introuvable'};
    const [m]=src.splice(i,1); if(!src.length&&deEcran!==versEcran) delete d.ecrans[deEcran];
    const dst=d.ecrans[versEcran]=d.ecrans[versEcran]||[];
    if(deEcran!==versEcran&&dst.length>=MAX_MODULES){ (d.ecrans[deEcran]=d.ecrans[deEcran]||[]).splice(i,0,m); return {disp:d,erreur:'l’écran d’arrivée est plein (6 modules)'}; }
    if(deEcran!==versEcran&&dst.some(x=>x.type==='vide')) dst.length=0;
    const pos=Number.isInteger(index)?Math.max(0,Math.min(dst.length,index)):dst.length;
    dst.splice(pos,0,m); return {disp:d};
  }
  function redimensionner(disp,idEcran,idModule,delta){
    const d=copie(disp); const m=(d.ecrans[idEcran]||[]).find(x=>x.id===idModule); if(m) m.part=Math.max(PART_MIN,Math.min(PART_MAX,m.part+Math.round(nb(delta,0)))); return d;
  }
  function changerParams(disp,idEcran,idModule,params){
    const d=copie(disp); const m=(d.ecrans[idEcran]||[]).find(x=>x.id===idModule); if(m) m.params=copie(params||{}); return d;
  }
  /* Rôle d'un module du point de vue de la mise en page : parts proportionnelles (en %) d'un écran. */
  function repartition(modules){ const t=modules.reduce((s,m)=>s+m.part,0)||1; return modules.map(m=>({id:m.id,pourcent:Math.round(1000*m.part/t)/10})); }

  const nomValide=n=>{ n=String(n==null?'':n).replace(/\s+/g,' ').trim(); return n.length>=1&&n.length<=40?n:''; };
  const cle=n=>sans(n);
  function trouverDisposition(etat,nom){ const c=cle(nom); return Object.keys(etat.dispositions).find(k=>cle(k)===c)||null; }
  function enregistrerDisposition(etat,nom,disp){
    const n=nomValide(nom); if(!n) return {etat,erreur:'nom vide ou trop long (40 caractères)'};
    const e=copie(etat); const ex=trouverDisposition(e,n); if(ex&&ex!==n){ e.dispositions[ex]=copie(disp); e.courante=ex; return {etat:e,nom:ex}; }
    e.dispositions[n]=copie(disp); e.courante=n; return {etat:e,nom:n};
  }
  function renommerDisposition(etat,ancien,nouveau){
    const e=copie(etat), n=nomValide(nouveau), a=trouverDisposition(e,ancien);
    if(!a) return {etat:e,erreur:'disposition introuvable'}; if(!n) return {etat:e,erreur:'nom vide ou trop long (40 caractères)'};
    const autre=trouverDisposition(e,n); if(autre&&autre!==a) return {etat:e,erreur:'une disposition porte déjà ce nom'};
    const nouvelles={}; for(const [k,v] of Object.entries(e.dispositions)) nouvelles[k===a?n:k]=v;
    e.dispositions=nouvelles; if(e.courante===a) e.courante=n; return {etat:e,nom:n};
  }
  function supprimerDisposition(etat,nom){
    const e=copie(etat), a=trouverDisposition(e,nom);
    if(!a) return {etat:e,erreur:'disposition introuvable'};
    if(Object.keys(e.dispositions).length<=1) return {etat:e,erreur:'il faut garder au moins une disposition'};
    delete e.dispositions[a]; if(e.courante===a) e.courante=Object.keys(e.dispositions)[0]; return {etat:e,nom:a};
  }
  function dupliquerDisposition(etat,nom,nouveau){
    const e=copie(etat), a=trouverDisposition(e,nom), n=nomValide(nouveau);
    if(!a||!n) return {etat:e,erreur:!a?'disposition introuvable':'nom vide ou trop long'};
    if(trouverDisposition(e,n)) return {etat:e,erreur:'une disposition porte déjà ce nom'};
    const d=copie(e.dispositions[a]); for(const l of Object.values(d.ecrans)) l.forEach(m=>{ m.id=nouvelId('m'); });
    e.dispositions[n]=d; e.courante=n; return {etat:e,nom:n};
  }
  function choisirDisposition(etat,nom){ const e=copie(etat), a=trouverDisposition(e,nom); if(!a) return {etat:e,erreur:'disposition introuvable'}; e.courante=a; return {etat:e,nom:a}; }

  /* ───── ce qu'il faut ouvrir ───── */
  /* Pour une disposition et les écrans réellement branchés : les fenêtres satellites à avoir (écran principal exclu : c'est la fenêtre principale)
     et ce que doit afficher la fenêtre principale. Écrans absents ignorés, signalés dans « absents ». */
  function fenetresSouhaitees(disp,ecrans,idPrincipal){
    const liste=normaliserEcrans(ecrans), prim=liste.find(e=>e.id===idPrincipal)||liste.find(e=>e.primaire)||liste[0];
    const sat=[], absents=[];
    for(const [idE,mods] of Object.entries((disp&&disp.ecrans)||{})){
      if(!mods||!mods.length) continue;
      const e=liste.find(x=>x.id===idE);
      if(!e){ absents.push(idE); continue; }
      if(prim&&e.id===prim.id) continue;
      sat.push({id:fenetreId(e.id),ecran:e,modules:mods});
    }
    const modPrincipal=prim?((disp&&disp.ecrans&&disp.ecrans[prim.id])||[]):[];
    return {satellites:sat,principal:{ecran:prim||null,modules:modPrincipal,normal:principalNormal(modPrincipal)},absents};
  }
  /* La fenêtre principale garde son accueil normal si son écran est « Raylé » seul (ou n'a rien de réglé). */
  const principalNormal=mods=>!mods.length||(mods.length===1&&mods[0].type==='rayle');
  /* Identifiant de fenêtre : sûr dans une adresse, un titre de fenêtre et une ligne de commande (lettres, chiffres, tirets). */
  const fenetreId=idEcran=>'e'+(String(idEcran).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()||'x').slice(0,30);
  /* Compare ce qui est ouvert et ce qu'on souhaite : quoi ouvrir, quoi fermer, quoi seulement redessiner. ouvertes = identifiants de fenêtres satellites ouvertes. */
  function planDeFenetres(souhaitees,ouvertes,emplacements){
    const veut=new Map(souhaitees.map(s=>[s.id,s])), ont=new Set(ouvertes||[]);
    return {
      ouvrir:souhaitees.filter(s=>!ont.has(s.id)),
      fermer:[...ont].filter(i=>!veut.has(i)),
      garder:souhaitees.filter(s=>ont.has(s.id)&&!(emplacements&&emplacements[s.id]&&deplace(emplacements[s.id],s.ecran)))
    };
  }
  const deplace=(a,e)=>Math.abs(a.x-e.x)>8||Math.abs(a.y-e.y)>8||Math.abs(a.w-e.w)>8||Math.abs(a.h-e.h)>8;

  /* ───── voix ───── */
  const NUM={un:1,une:1,premier:1,premiere:1,deux:2,deuxieme:2,second:2,seconde:2,trois:3,troisieme:3,quatre:4,quatrieme:4};
  const chiffre=s=>/^\d+$/.test(s)?Number(s):NUM[s];
  const MULTI='(?:multi ?ecrans?|multiecrans?|plusieurs ecrans|ecrans multiples)';
  const NEUTRES_RE=/^(?:(?:ok|oui|bon|alors|s il te plait|svp|stp)\s+)*/;
  /* Renvoie {type:'activer'|'desactiver'|'disposition'|'identifier'|'fermer_tout'|'deplacer'|'liste', …} ou null.
     « ferme tout » n'est pris que si le mode est actif (sinon il ferme les fenêtres holographiques, comme avant). */
  function analyserCommandeVoix(texte,ctx){
    let t=sans(texte).replace(/\b(?:hey|he|eh|dis moi)?\s*rayle\b/g,' ').replace(/\s+/g,' ').trim().replace(NEUTRES_RE,'').replace(/\s+(?:s il te plait|svp|stp|merci)$/,'').trim();
    if(!t||t.split(' ').length>12) return null;
    ctx=ctx||{};
    if(new RegExp('^(?:active|activer|allume|allumer|lance|lancer|demarre|demarrer|mets?|met|passe|passer)(?: moi)?(?: en| le| en mode| le mode| au)? (?:mode )?'+MULTI+'$').test(t)
      ||new RegExp('^(?:mode '+MULTI+') (?:on|actif|active)$').test(t)) return {type:'activer'};
    if(new RegExp('^(?:desactive|desactiver|coupe|couper|arrete|arreter|eteins|eteindre|quitte|quitter|ferme|fermer|enleve|enlever|stoppe|stopper)(?: moi)?(?: le| en| du)? (?:mode )?'+MULTI+'$').test(t)
      ||new RegExp('^(?:sors? du|sortir du|fin du|fini le) (?:mode )?'+MULTI+'$').test(t)) return {type:'desactiver'};
    if(/^(?:identifie|identifier|numerote|montre|affiche|afficher|montrer)(?: moi)?(?: les| mes| tous les)? ecrans?(?: par (?:leur )?numero)?$|^(?:quels|c est quoi les) (?:sont )?(?:mes )?ecrans$|^identification des ecrans$/.test(t)) return {type:'identifier'};
    if(/^(?:ferme|fermer|arrete|arreter|quitte|quitter|eteins|eteindre) (?:tout|tous|tous les ecrans|toutes les fenetres|toutes les fenetres rayle|rayle|l application)$|^tout fermer$|^ferme tout rayle$/.test(t)){
      if(/^(?:ferme|fermer) tout$|^tout fermer$/.test(t)&&!ctx.actif) return null;
      return {type:'fermer_tout'};
    }
    const mDispo=/^(?:mets?|met|met moi|passe|passer|bascule|basculer|charge|charger|active|activer|utilise|utiliser|change|changer|choisis|choisir|lance|lancer)(?: moi)?(?: en| sur| la| le| une| a| au)*(?: nouvelle)? (?:disposition|configuration|agencement|layout|mise en page|scene)(?: (?:des )?ecrans?)?(?: nommee?)?(?: en| sur| de| du| des| d| pour)* (.+)$/.exec(t)
      ||/^(?:disposition|configuration) (.+)$/.exec(t);
    if(mDispo){ const nom=mDispo[1].replace(/^(?:la |le |l |les |de |du |des )+/,'').trim(); return nom?{type:'disposition',nom}:null; }
    if(/^(?:quelles|liste|dis moi quelles|donne moi) (?:sont )?(?:mes |les )?dispositions(?: enregistrees)?$|^quelles dispositions (?:j ai|ai je)$/.test(t)) return {type:'liste'};
    const mDep=/^(?:deplace|deplacer|envoie|envoyer|mets?|met|pousse|pousser|passe|passer|bascule|basculer|transfere|transferer)(?: moi)?(?: toutes?)? (?:les |la |le |l )?(actualites?|actus?|infos?|information|fil|fil d actualite|fil d actualites|conversation|transcription|meteo|terre|galaxie|rayle) (?:sur|vers|a|au|dans)(?: l| le| la)?(?: ecran| ecrans)? ?(\w+)$/.exec(t);
    if(mDep){ const n=chiffre(mDep[2]); if(n){ const quoi=/actu|info|information/.test(mDep[1])?'actus':/^fil/.test(mDep[1])?'fil':/conversation|transcription/.test(mDep[1])?'conversation':/meteo/.test(mDep[1])?'meteo':/terre/.test(mDep[1])?'terre':/galaxie/.test(mDep[1])?'galaxie':'rayle'; return {type:'deplacer',module:quoi,numero:n}; } }
    return null;
  }

  /* Messages du canal entre fenêtres : vérifie la forme (une fenêtre ne doit pas faire planter les autres avec un message mal formé). */
  const TYPES_MESSAGES=new Set(['bonjour','vivant','etat','ligne','interim','dispo','voix','jeu','micro','deplacer','taille','raccourci','absent','fermer','demande_etat','statut']);
  function messageValide(m){
    if(!m||typeof m!=='object'||typeof m.t!=='string'||!TYPES_MESSAGES.has(m.t)) return false;
    if(typeof m.de!=='string'||!m.de||m.de.length>60) return false;
    if(m.t==='ligne'&&(typeof m.texte!=='string'||!['ray','user'].includes(m.kind))) return false;
    if(m.t==='deplacer'&&(typeof m.module!=='string'||typeof m.de_ecran!=='string'||typeof m.vers!=='string')) return false;
    if(m.t==='taille'&&(typeof m.module!=='string'||typeof m.de_ecran!=='string'||!Number.isFinite(m.delta))) return false;
    if(m.t==='raccourci'&&!['bascule','fermer-tout'].includes(m.nom)) return false;
    return true;
  }

  const api={TYPES_PAR_DEFAUT,PART_MIN,PART_MAX,MAX_MODULES,VERSION,sans,normaliserEcrans,echelleEditeur,creerModule,dispositionVide,dispositionDefaut,etatInitial,normaliserEtat,
    ajouterModule,retirerModule,deplacerModule,redimensionner,changerParams,repartition,nomValide,trouverDisposition,enregistrerDisposition,renommerDisposition,supprimerDisposition,
    dupliquerDisposition,choisirDisposition,fenetresSouhaitees,principalNormal,fenetreId,planDeFenetres,analyserCommandeVoix,messageValide};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.MultiCalcul=api;
})(typeof window!=='undefined'?window:globalThis);
