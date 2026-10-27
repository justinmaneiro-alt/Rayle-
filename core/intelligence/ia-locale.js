"use strict";
  /* ═════════════ IA LOCALE (LM Studio) : client de la page ═════════════
     Appelle l'API compatible OpenAI de LM Studio (http://localhost:1234/v1, serveur à démarrer dans LM Studio, CORS activé) : directement depuis le PC, ou par le relais du PC
     (tablette / téléphone, avec jeton) ; sans relais ou sans réponse, Raylé retombe seule sur les API du Worker. Décisions d'aiguillage : ia-locale-calcul.js (pur, testé).
     Le modèle non censuré (Dolphin) ne répond que sur demande explicite ou phrase secrète, ne reçoit AUCUNE action d'outil et n'entre pas dans l'historique enregistré. */
  const IaLocale=(()=>{
    const C=window.IaLocaleCalcul, CLE='rayle_ia_locale';
    let reglages=C.fusionnerReglages(lire());
    const etat={disponible:false,modeles:[],raison:'',relais:false,derniereSonde:0,echecJusqua:0};
    const ecouteurs=[]; let minuteur=null, sondeEnCours=null, dernierMoteur='';
    function lire(){ try{ return JSON.parse(localStorage.getItem(CLE)||'null')||{}; }catch(e){ return {}; } }
    function sauver(){ try{ localStorage.setItem(CLE,JSON.stringify(reglages)); }catch(e){} }
    function prevenir(){ ecouteurs.forEach(f=>{ try{ f(etatPublic()); }catch(e){} }); }
    function etatPublic(){ return {...etat,echecRecent:Date.now()<etat.echecJusqua,actif:reglages.actif,libelle:C.libelleEtat({...etat},reglages),modele:C.choisirModele(etat.modeles,reglages,false),modeleNonCensure:C.choisirModele(etat.modeles,reglages,true)}; }

    /* Adresse et en-têtes : direct (localhost) ou par le relais du PC. */
    function cible(chemin,forcerRelais){
      const rel=(reglages.relais||'').replace(/\/+$/,'');
      if(rel&&(forcerRelais||!estLocal())) return {url:rel+'/ia-locale'+chemin,entetes:{'X-Rayle-Ia':reglages.jetonRelais||''},relais:true};
      return {url:reglages.url+chemin.replace(/^\/v1/,''),entetes:{},relais:false};
    }
    const estLocal=()=>/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)||/^file:/.test(location.protocol)||location.hostname==='';
    async function aller(url,opts,ms){
      const c=new AbortController(), t=setTimeout(()=>c.abort(),ms);
      try{ return await fetch(url,{...opts,signal:c.signal}); } finally{ clearTimeout(t); }
    }

    async function sonder(){
      if(sondeEnCours) return sondeEnCours;
      sondeEnCours=(async()=>{
        if(!reglages.actif){ Object.assign(etat,{disponible:false,modeles:[],raison:'désactivée',relais:false}); prevenir(); return etatPublic(); }
        let c=cible('/v1/models'), ok=false;
        for(const essai of (reglages.relais?[c,cible('/v1/models',true)]:[c])){
          try{
            const r=await aller(essai.url,{headers:essai.entetes},3000);
            if(!r.ok) throw new Error('HTTP '+r.status);
            const m=C.parseModeles(await r.json());
            Object.assign(etat,{disponible:true,modeles:m,raison:'',relais:essai.relais}); ok=true; break;
          }catch(e){ etat.raison=e&&e.name==='AbortError'?'pas de réponse':(String(e&&e.message||e).replace(/^TypeError: /,'')==='Failed to fetch'?'serveur LM Studio non démarré':String(e&&e.message||e)); }
        }
        if(!ok){ etat.disponible=false; etat.modeles=[]; }
        etat.derniereSonde=Date.now(); prevenir(); return etatPublic();
      })().finally(()=>{ sondeEnCours=null; });
      return sondeEnCours;
    }
    function planifier(){ clearInterval(minuteur); minuteur=null; if(reglages.actif){ sonder(); minuteur=setInterval(()=>{ if(!document.hidden) sonder(); },30000); } else { sonder(); } }

    async function completer(messages,modele,ms){
      const c=cible('/v1/chat/completions',!estLocal()&&!!reglages.relais&&etat.relais);
      const r=await aller(c.url,{method:'POST',headers:{'Content-Type':'application/json',...c.entetes},body:JSON.stringify({model:modele,messages,temperature:0.7,max_tokens:400,stream:false})},ms);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const d=await r.json(); return String(d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||'');
    }

    /* Appelée par phrase.js avant l'agent du Worker. Rend null (→ le Worker répond comme avant) ou { reply, engine, actions:[], sansHistorique }. */
    async function essayer(texte,{historique=[],contexte=''}={}){
      const nc=C.detecterNonCensure(texte,reglages), question=nc.demande?nc.texte:texte;
      if(!reglages.actif&&!nc.demande) return null;
      if(Date.now()-etat.derniereSonde>20000) await sonder();
      const choix=C.router(question,{...etat,echecRecent:Date.now()<etat.echecJusqua,nonCensureDemande:nc.demande},reglages);
      if(choix.route==='api') { dernierMoteur='API ('+choix.raison+')'; return null; }
      if(choix.route==='refus') return {reply:choix.raison+' Je ne bascule pas sur un autre modèle sans te le dire.',engine:'IA locale (refus)',actions:[],sansHistorique:true};
      const modele=C.choisirModele(etat.modeles,reglages,!!choix.nonCensure);
      try{
        const brut=await completer(C.construireMessages({question,contexte,historique,nonCensure:!!choix.nonCensure}),modele,reglages.delaiMs);
        const reply=C.nettoyerPourLaVoix(brut), q=C.reponseSuffisante(reply,question);
        if(!q.ok){ dernierMoteur='API ('+q.raison+')'; return choix.nonCensure?{reply:'Le modèle non censuré n’a pas donné de réponse exploitable ('+q.raison+').',engine:'IA locale (non censurée)',actions:[],sansHistorique:true}:null; }
        dernierMoteur='locale · '+modele;
        return {reply,engine:'IA locale'+(choix.nonCensure?' (non censurée, à ta demande)':''),model:modele,actions:[],sansHistorique:!!choix.nonCensure};
      }catch(e){
        etat.echecJusqua=Date.now()+60000; etat.raison=e&&e.name==='AbortError'?'trop lente':String(e&&e.message||e); dernierMoteur='API (IA locale '+etat.raison+')'; prevenir();
        if(choix.nonCensure) return {reply:'Le modèle non censuré ne répond pas ('+etat.raison+').',engine:'IA locale (erreur)',actions:[],sansHistorique:true};
        return null;      // le Worker prend le relais
      }
    }

    function regler(patch){
      const avant=reglages.actif; reglages=C.fusionnerReglages({...reglages,...patch}); sauver();
      if(patch&&('actif' in patch||'url' in patch||'relais' in patch||'jetonRelais' in patch)) planifier(); else prevenir();
      return reglages;
    }
    function definirPhraseSecrete(phrase){ reglages.empreinteSecrete=C.empreinte(phrase); sauver(); }

    planifier();
    return {essayer,sonder,regler,definirPhraseSecrete,reglages:()=>({...reglages,empreinteSecrete:reglages.empreinteSecrete?'définie':''}),etat:etatPublic,surEtat:f=>{ ecouteurs.push(f); },dernierMoteur:()=>dernierMoteur};
  })();
  window.IaLocale=IaLocale;
