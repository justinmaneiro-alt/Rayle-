/* ═════════════ DÉCLENCHEURS LOCAUX : CLAQUEMENTS DE MAINS ET DE DOIGTS (module pur, testé : galaxie/tests/declencheurs-test.mjs) ═════════════
   Analyse du signal audio SUR LE PC (aucun enregistrement, rien n'est envoyé nulle part) : un claquement est un pic bref et sec — attaque en quelques millisecondes,
   retombée en moins de ~120 ms, spectre large avec beaucoup d'aigus. On rejette :
   · la voix et la musique (énergie qui dure : plus de ~120 ms) ;
   · les portes et les chocs sourds (surtout des graves) ;
   · le clavier (pics très brefs et faibles, qui arrivent en rafale : garde « frappe » dès que trois petits pics ont eu lieu dans la seconde et demie précédente) ;
   · tout ce qui n'est pas nettement au-dessus du bruit de fond (plancher adaptatif, réglé par la sensibilité).
   « claquement de mains » (plutôt large et un peu plus long) et « claquement de doigts » (très bref, très aigu) sont classés par la durée et la part d'aigus : ce classement est APPROXIMATIF
   (voir docs/activation-vocale.md) ; chaque type s'active séparément ; option « double claquement » (deux claquements à 0,15-0,7 s d'intervalle).
   Utilisable dans la page (window.Declencheurs) et sous Node (module.exports). */
(function(racine){
  "use strict";
  const borne=(x,a,b)=>x<a?a:x>b?b:x;
  const PARAMETRES={bloc_ms:4,refractaire_ms:350,double_min_ms:150,double_max_ms:700,garde_frappe_ms:1500,garde_frappe_n:3,duree_max_ms:120};
  /* sensibilité 1 (peu sensible) … 10 (très sensible) → rapport au bruit de fond et plancher d'amplitude */
  const seuilsPour=s=>({K:15-1.3*(borne(Math.round(s),1,10)-1),amin:0.06-0.0045*(borne(Math.round(s),1,10)-1)});

  function creerDetecteur(opt={}){
    const sr=opt.sampleRate||48000, B=Math.max(32,Math.round(sr*PARAMETRES.bloc_ms/1000)), dt=B/sr*1000;
    const cfg={sensibilite:opt.sensibilite==null?5:opt.sensibilite,main:opt.main!==false,doigts:opt.doigts!==false,double:!!opt.double};
    let seuils=seuilsPour(cfg.sensibilite);
    const coefLF=1-Math.exp(-2*Math.PI*500/sr), coefMF=1-Math.exp(-2*Math.PI*2500/sr);
    let lp1=0, lp2=0;                            // filtres à un pôle : graves (< 500 Hz) et « tout sauf les aigus » (< 2,5 kHz)
    let tampon=new Float32Array(B), nT=0, t=0;    // t en ms (horloge du signal)
    let plancher=0.003, recents=[0,0,0,0], cand=null, derniereMini=-1e9, minis=[], dernierDeclenchement=-1e9, premier=null;
    const sortie=[], journal=[];
    const surEvenement=opt.surEvenement||null;

    function traiterBloc(b){
      let s=0,sl=0,sh=0;
      for(let i=0;i<b.length;i++){ const x=b[i]; lp1+=coefLF*(x-lp1); lp2+=coefMF*(x-lp2); const hf=x-lp2; s+=x*x; sl+=lp1*lp1; sh+=hf*hf; }
      const rms=Math.sqrt(s/b.length), lf=sl/b.length, hf=sh/b.length, tot=s/b.length, moy=(recents[0]+recents[1]+recents[2]+recents[3])/4;
      const base=Math.max(plancher,0.0015);
      if(!cand){
        // plancher de bruit : suit lentement ce qui n'est pas un pic ; remonte très lentement si le bruit ambiant augmente
        if(rms<base*3) plancher+= (rms-plancher)*0.01; else plancher+=(Math.min(rms,base*3)-plancher)*0.0005;
        const montee=rms>=2.2*Math.max(moy,1e-5);
        if(montee&&rms>=base*seuils.K&&rms>=seuils.amin){ cand={t0:t,tp:t,pic:rms,n:1,sTot:tot,sLf:lf,sHf:hf,haut:1,bas:0,duree:1}; }
        else if(montee&&rms>=base*seuils.K*0.4&&rms>=seuils.amin*0.3&&t-derniereMini>80){ derniereMini=t; minis.push(t); }   // petit pic : ne déclenche rien, mais compte pour la garde « frappe »
      }else{
        cand.n++; cand.sTot+=tot; cand.sLf+=lf; cand.sHf+=hf;
        if(rms>cand.pic){ cand.pic=rms; cand.tp=t; }
        if(rms>=0.25*cand.pic) cand.duree=cand.n;
        if(rms>0.35*cand.pic) cand.haut++;
        cand.bas=rms<0.2*cand.pic?cand.bas+1:0;
        if(cand.bas>=2||(t-cand.t0)>=PARAMETRES.duree_max_ms+40){ finir(cand,t); cand=null; }
      }
      recents.shift(); recents.push(rms);
    }

    function finir(c,tFin){
      const dur=c.duree*dt, attaque=c.tp-c.t0, partHF=c.sTot>0?c.sHf/c.sTot:0, partLF=c.sTot>0?c.sLf/c.sTot:0, rangFrappe=minis.filter(m=>m<c.t0&&c.t0-m<=PARAMETRES.garde_frappe_ms).length;
      const info={t:c.t0,pic:+c.pic.toFixed(3),duree:+dur.toFixed(0),attaque:+attaque.toFixed(0),hf:+partHF.toFixed(2),lf:+partLF.toFixed(2),rangFrappe};
      let rejet=null;
      if(dur>PARAMETRES.duree_max_ms||c.haut*dt>PARAMETRES.duree_max_ms) rejet='trop long (voix, musique)';
      else if(partLF>0.55) rejet='trop de graves (porte, choc)';
      else if(attaque>14) rejet='attaque trop lente';
      else if(rangFrappe>=PARAMETRES.garde_frappe_n-1) rejet='rafale (frappe au clavier)';
      let type=null;
      if(!rejet){
        if(partHF<0.18) rejet='spectre inadapté';
        else if(dur<=16||(dur<=24&&partHF>=0.4)) type='doigts';     // très bref : doigts ; un peu plus long et large : mains
        else type='main';
      }
      info.type=type; info.rejet=rejet; journal.push(info); if(journal.length>40) journal.shift();
      minis.push(c.t0);
      while(minis.length&&c.t0-minis[0]>4000) minis.shift();
      if(!type) return;
      if((type==='main'&&!cfg.main)||(type==='doigts'&&!cfg.doigts)){ info.rejet='type désactivé'; return; }
      if(c.t0-dernierDeclenchement<PARAMETRES.refractaire_ms) { info.rejet='trop proche du précédent'; return; }
      if(cfg.double){
        if(premier&&c.t0-premier.t>=PARAMETRES.double_min_ms&&c.t0-premier.t<=PARAMETRES.double_max_ms){ premier=null; declencher(type,c.t0,info,true); }
        else if(premier&&c.t0-premier.t<PARAMETRES.double_min_ms){ info.rejet='trop proche pour un double claquement'; }
        else premier={t:c.t0,type};
      }else declencher(type,c.t0,info,false);
    }
    function declencher(type,tt,info,double){
      dernierDeclenchement=tt; const ev={type,t:tt,pic:info.pic,double:!!double,duree:info.duree,hf:info.hf}; sortie.push(ev); if(surEvenement) surEvenement(ev);
    }

    return {
      /* Fournit des échantillons (Float32Array, mono) ; renvoie les événements déclenchés pendant ce passage. */
      traiter(x){
        const debut=sortie.length;
        for(let i=0;i<x.length;i++){
          tampon[nT++]=x[i];
          if(nT===B){ traiterBloc(tampon); nT=0; t+=dt; if(premier&&t-premier.t>PARAMETRES.double_max_ms) premier=null; }
        }
        return sortie.slice(debut);
      },
      regler(o){ if(o.sensibilite!=null){ cfg.sensibilite=o.sensibilite; seuils=seuilsPour(o.sensibilite); } for(const k of ['main','doigts','double']) if(o[k]!=null) cfg[k]=!!o[k]; if(!cfg.double) premier=null; },
      etat:()=>({sensibilite:cfg.sensibilite,main:cfg.main,doigts:cfg.doigts,double:cfg.double,plancher:+plancher.toFixed(4),seuils:{...seuils},t:Math.round(t)}),
      journal:()=>journal.slice(),
      horloge:()=>t,
      reinitialiser(){ cand=null; premier=null; minis=[]; recents=[0,0,0,0]; nT=0; }
    };
  }
  /* ── Mot « Raylé » reconnu EN LOCAL (Vosk, grammaire réduite) : le modèle français comprend « Raylé » comme « relais », « rayé », « rallye »… ──
     On ne déclenche que si le mot est parmi les deux premiers de ce qui a été entendu et si l'énoncé est court (3 mots au plus, les mots inconnus comptent) :
     « le relais de la course » ne déclenche pas, « Raylé quelle heure est-il » oui. Les mots absents du vocabulaire du modèle sont simplement ignorés. */
  const sansAccent=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const MOTS_RAYLE=['relais','rayé','rallye','raillé','raye'];
  function motCleDansTexte(texte,mots){
    const liste=(mots&&mots.length?mots:MOTS_RAYLE).map(sansAccent), t=sansAccent(texte).replace(/[^a-z\[\] ]/g,' ').trim().split(/\s+/).filter(Boolean);
    if(!t.length||t.length>3) return false;
    return t.slice(0,2).some(x=>liste.includes(x));
  }
  const grammaireMotCle=mots=>JSON.stringify([...new Set((mots&&mots.length?mots:MOTS_RAYLE).map(x=>String(x).toLowerCase().trim()).filter(Boolean)),'[unk]']);
  const api={creerDetecteur,seuilsPour,PARAMETRES,motCleDansTexte,grammaireMotCle,MOTS_RAYLE,sansAccent};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.Declencheurs=api;
})(typeof window!=='undefined'?window:globalThis);
