"use strict";
  /* ═════════════ VOIX DE RAYLÉ : MOTEURS (page) ═════════════
     Candidates, par ordre de préférence :
       · kokoro-siwis, piper-siwis, piper-jessica : voix LOCALES et gratuites, service du PC (app-pc/voix-locale.mjs → /__voix/…), hors ligne, aucun cloud ;
       · edge : voix en ligne gratuite par le Worker (route /tts : Edge d'abord, Azure seulement en tout dernier recours) ;
       · systeme : meilleure voix française du navigateur ou du téléphone (Edge « Natural », Google français, Samsung/Android…).
     Le choix est mémorisé (rayle_voix_moteur ; vide = automatique : la première qui réussit le test). Raylé n'est jamais muette : tant qu'un moteur n'est pas prêt, la voix du système parle.
     Calculs purs : voix-moteurs-calcul.js. */
  const VoixMoteurs=(function(){
    const CLE_MOTEUR='rayle_voix_moteur', CLE_HAUTEUR='rayle_voix_hauteur', CLE_SYS='rayle_voix_systeme', CLE_DICO='rayle_voix_dico', CLE_AUTO='rayle_voix_auto';
    const C=window.VoixCalcul;
    const lire=k=>{ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } };
    const ecrire=(k,v)=>{ try{ if(v===''||v==null) localStorage.removeItem(k); else localStorage.setItem(k,String(v)); }catch(e){} };
    const NOMS={
      'kokoro-siwis':{nom:'Kokoro · Siwis',detail:'voix neuronale française, locale (PC)',type:'local',moteur:'kokoro'},
      'piper-siwis':{nom:'Piper · Siwis',detail:'voix neuronale française, locale et très rapide (PC)',type:'local',moteur:'piper'},
      'piper-jessica':{nom:'Piper · Jessica',detail:'voix neuronale française, locale (PC)',type:'local',moteur:'piper'},
      'edge':{nom:'Vivienne · Edge (en ligne, gratuit)',detail:'par le Worker, sans clé ; nécessite le réseau',type:'worker'},
      'systeme':{nom:'Voix du système',detail:'meilleure voix française de ton appareil',type:'systeme'}
    };
    let local={installe:null,demarre:false,moteurs:{},voix:[],raison:''};
    let resultats={};          // test automatique : id → {ok, duree, ms, raison}
    let enCours=null;
    const ecouteurs=[];
    const prevenir=()=>ecouteurs.forEach(f=>{ try{ f(); }catch(e){} });

    const peutLocal=()=>/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);

    async function rafraichirLocal(){
      if(!peutLocal()){ local={installe:false,demarre:false,moteurs:{},voix:[],raison:'voix locale seulement dans l’application PC (127.0.0.1)'}; prevenir(); return local; }
      try{
        const r=await fetch('/__voix/etat',{cache:'no-store'});
        local=r.ok?await r.json():{installe:false,demarre:false,moteurs:{},voix:[],raison:'service de voix locale indisponible (HTTP '+r.status+')'};
      }catch(e){ local={installe:false,demarre:false,moteurs:{},voix:[],raison:'service de voix locale injoignable'}; }
      prevenir(); return local;
    }
    function pretLocal(id){
      const n=NOMS[id]; if(!n||n.type!=='local') return false;
      const m=local.moteurs&&local.moteurs[n.moteur];
      return !!(local.installe&&m&&m.pret&&(local.voix||[]).some(v=>v.id===id));
    }
    const voixSysteme=()=>('speechSynthesis' in window)?speechSynthesis.getVoices():[];
    function pret(id){
      const n=NOMS[id]; if(!n) return false;
      if(n.type==='local') return pretLocal(id);
      if(n.type==='worker') return typeof workerReady==='function'&&!!workerReady();
      return ('speechSynthesis' in window);
    }
    function candidats(){
      return Object.keys(NOMS).map(id=>{
        const n=NOMS[id], t=resultats[id];
        let etat='indisponible', raison='';
        if(n.type==='local'){
          if(!local.installe) raison=local.raison||'non installée';
          else if(!pretLocal(id)){ const m=local.moteurs&&local.moteurs[n.moteur]; etat='chargement'; raison=(m&&m.erreur)||'chargement du modèle…'; if(m&&m.erreur) etat='indisponible'; }
          else etat='prête';
        } else if(n.type==='worker'){ etat=pret(id)?'prête':'indisponible'; if(etat!=='prête') raison='Worker non configuré'; }
        else { etat=pret(id)?'prête':'indisponible'; }
        if(t&&!t.ok&&etat==='prête'){ etat='en échec'; raison=t.raison||'test échoué'; }
        return {id,nom:n.nom,detail:n.detail,type:n.type,etat,raison,test:t||null};
      });
    }
    function choisi(){
      const m=lire(CLE_MOTEUR);
      if(m&&NOMS[m]) return m;
      return auto();
    }
    function auto(){
      const a=C.choisirParDefaut(resultats,C.ORDRE_DEFAUT);
      if(a!=='systeme') return a;
      // pas encore de test : première voix prête dans l'ordre de préférence
      for(const id of C.ORDRE_DEFAUT) if(id!=='systeme'&&pretLocal(id)&&!(resultats[id]&&!resultats[id].ok)) return id;
      return 'systeme';
    }
    function actif(){   // moteur réellement utilisé maintenant (le choix, ou la voix du système tant qu'il n'est pas prêt)
      const id=choisi();
      if(id==='systeme') return 'systeme';
      if(!pret(id)) return 'systeme';
      if(resultats[id]&&!resultats[id].ok) return 'systeme';
      return id;
    }
    function choisir(id){ ecrire(CLE_MOTEUR,id==='auto'?'':id); prevenir(); }
    const hauteur=()=>{ const h=Number(lire(CLE_HAUTEUR)); return isFinite(h)?h:0; };
    function definirHauteur(h){ ecrire(CLE_HAUTEUR,Number(h)===0?'':String(h)); prevenir(); }

    /* ── synthèse : retourne un Blob audio ── */
    async function synth(id,texte,opts){
      opts=opts||{};
      const n=NOMS[id]; if(!n) throw new Error('moteur inconnu : '+id);
      const vit=opts.vitesse!=null?opts.vitesse:1;
      const f=C.facteursLecture(vit,opts.hauteur!=null?opts.hauteur:hauteur());
      if(n.type==='local'){
        const r=await fetch('/__voix/synth',{method:'POST',headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({voix:id,texte,vitesse:f.vitesseMoteur}),signal:opts.signal});
        if(!r.ok){ let d=''; try{ d=(await r.json()).erreur||''; }catch(e){} throw new Error('voix locale : HTTP '+r.status+(d?' · '+d:'')); }
        return {blob:await r.blob(),vitesseLecture:f.vitesseLecture,src:'local/'+id};
      }
      if(n.type==='worker'){
        const body={text:texte}; body.vitesse=Math.round((f.vitesseMoteur-1)*100);
        const res=await wfetch('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:opts.signal},25000);
        if(!res.ok) throw await workerError(res);
        return {blob:await res.blob(),vitesseLecture:f.vitesseLecture,src:res.headers.get('X-Rayle-Voix')||'edge'};
      }
      throw new Error('la voix du système ne produit pas de fichier audio');
    }

    /* ── test automatique ── */
    async function tester(id){
      const t0=performance.now();
      try{
        if(id==='systeme') return {ok:voixSysteme().some(v=>/^fr/i.test(v.lang)),ms:0,raison:voixSysteme().length?'':'aucune voix française'};
        const a=await synth(id,"Bonjour, je suis Rayle.",{vitesse:1,hauteur:0});
        const ms=Math.round(performance.now()-t0);
        if(NOMS[id].type==='local'){ const an=C.analyserWav(new Uint8Array(await a.blob.arrayBuffer())); return Object.assign({ms},an); }
        return {ok:a.blob.size>1500,ms,duree:null,raison:a.blob.size>1500?'':'audio vide',src:a.src};
      }catch(e){ return {ok:false,ms:Math.round(performance.now()-t0),raison:String(e&&e.message||e).slice(0,160)}; }
    }
    async function testerAuto(){
      if(enCours) return enCours;
      enCours=(async()=>{
        await rafraichirLocal();
        const res={};
        for(const id of Object.keys(NOMS)){ if(id==='systeme'||pret(id)) res[id]=await tester(id); }
        resultats=res; ecrire(CLE_AUTO,JSON.stringify({date:Date.now(),defaut:C.choisirParDefaut(res,C.ORDRE_DEFAUT)}));
        prevenir(); return res;
      })().finally(()=>{ enCours=null; });
      return enCours;
    }
    /* À l'ouverture : on réveille le service local (le modèle se charge), puis on teste sans bruit. Tant que ce n'est pas prêt, la voix du système parle. */
    async function demarrer(){
      await rafraichirLocal();
      if(!local.installe) return;
      for(let i=0;i<40&&!(pretLocal('kokoro-siwis')||pretLocal('piper-siwis'));i++){ await new Promise(r=>setTimeout(r,1000)); await rafraichirLocal(); }
      await testerAuto();
    }
    const dico=()=>{ try{ return JSON.parse(lire(CLE_DICO)||'{}'); }catch(e){ return {}; } };
    function definirDico(o){ ecrire(CLE_DICO,o&&Object.keys(o).length?JSON.stringify(o):''); if(window.NormFr) NormFr.definirDictionnaire(o||{}); prevenir(); }
    if(window.NormFr) NormFr.definirDictionnaire(dico());
    const voixSystemeChoisie=()=>lire(CLE_SYS);
    function choisirVoixSysteme(uri){ ecrire(CLE_SYS,uri); prevenir(); }

    return {NOMS,candidats,choisi,actif,auto,choisir,hauteur,definirHauteur,synth,tester,testerAuto,demarrer,rafraichirLocal,pret,dico,definirDico,voixSystemeChoisie,choisirVoixSysteme,
      resultats:()=>resultats,local:()=>local,surChangement:f=>ecouteurs.push(f),peutLocal};
  })();

  window.VoixMoteurs=VoixMoteurs;
  setTimeout(()=>{ VoixMoteurs.demarrer().catch(()=>{}); },1500);   // réveille la voix locale et teste les moteurs en arrière-plan
