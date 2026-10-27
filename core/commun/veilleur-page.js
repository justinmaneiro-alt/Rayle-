"use strict";
  /* ═════════════ LE VEILLEUR DANS LA PAGE (alertes de l'agent Bitcoin) ═════════════
     Le Veilleur (app-pc/veilleur/) tourne sur le PC, même page fermée, et écrit ses alertes dans un fichier local ; cette page les lit par les routes /__veilleur/… du serveur local
     (application PC ou serveur de développement), les présente (fenêtre holographique, entité en alerte, notification, bip discret, voix pour ENTRÉE et MACRO) et sert les réglages.
     Sur GitHub Pages (pas de serveur local) rien n'est appelé : la fonction se déclare « indisponible ». Aucune IA, aucun ordre, aucun secret affiché (le jeton est copié vers un fichier local, jamais montré).
     Voix : « active / désactive le veilleur », « montre-moi les alertes », « où en est le veilleur ». Réglages : ⚙ Réglages → « Alertes du Veilleur » et panneau « Alertes » de Mars. */
  const VL={ etat:null, alertes:[], dispo:null, auteurs:new Set(), vuJusqua:0, minuteur:null };
  const VL_ENTETES={'Content-Type':'application/json','X-Rayle-Multi':'1'};
  const vlLocal=()=>/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const vlLire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const vlEcrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const vlEsc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function vlGet(chemin){
    const r=await fetch('/__veilleur/'+chemin,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  async function vlPost(chemin,corps){
    const r=await fetch('/__veilleur/'+chemin,{method:'POST',headers:VL_ENTETES,body:JSON.stringify(corps||{})});
    const j=await r.json().catch(()=>({ok:false,erreur:'réponse illisible'}));
    if(!r.ok&&j.ok!==false) j.ok=false;
    return j;
  }
  const vlDiffuser=()=>{ for(const f of VL.auteurs){ try{ f(); }catch(e){} } };

  /* ── Présentation d'une alerte arrivée du Veilleur ── */
  let vlAudio=null;
  function vlBip(forte){
    if(vlLire('rayle_veilleur_son')==='0') return;
    try{
      vlAudio=vlAudio||new (window.AudioContext||window.webkitAudioContext)();
      const t=vlAudio.currentTime;
      for(const [i,f] of (forte?[880,660,880]:[660]).entries()){
        const o=vlAudio.createOscillator(), g=vlAudio.createGain(); o.frequency.value=f; o.type='sine';
        g.gain.setValueAtTime(0.0001,t+i*0.16); g.gain.exponentialRampToValueAtTime(0.05,t+i*0.16+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.16+0.14);
        o.connect(g); g.connect(vlAudio.destination); o.start(t+i*0.16); o.stop(t+i*0.16+0.16);
      }
    }catch(e){ /* le navigateur n'autorise le son qu'après un premier clic */ }
  }
  function vlPresenter(a){
    const entree=a.type==='ENTREE', etiquette={ENTREE:'ENTRÉE',PREPARATION:'PRÉPARATION',OBSERVATION:'OBSERVATION (non validé)',MACRO:'MACRO'}[a.type]||a.type;
    const premiere=String(a.texte||'').split('\n').slice(0,3).join(' · ');
    try{ RayleBus.emit('raylé:alerte-prix',{actif:'Veilleur · '+etiquette,texte:a.resume||premiere,prix:a.prix||null,t:a.t}); }catch(e){}
    if(entree||a.type==='MACRO'){ try{ Entite.alerte(9000); RayleBus.emit('raylé:alerte',{ms:9000}); }catch(e){} }
    try{ addLine('sys',(entree?'🚨 ':a.type==='MACRO'?'🟠 ':'👁 ')+'Veilleur · '+etiquette+' : '+(a.resume||premiere)); }catch(e){}
    vlBip(entree);
    try{ if(vlLire('rayle_veilleur_voix')!=='0'&&(entree||a.type==='MACRO')&&typeof speak==='function') speak(entree?'Justin, le veilleur signale un setup Bitcoin. Les détails sont dans l’alerte. Ce n’est pas un conseil.':'Rappel macro : '+(a.resume||'un événement important approche')+'.'); }catch(e){}
    try{ if('Notification' in window&&Notification.permission==='granted'&&vlLire('rayle_veilleur_notif')!=='0') new Notification('Raylé · '+etiquette,{body:premiere}); }catch(e){}
  }

  /* ── Interrogation régulière ── */
  async function vlTick(){
    try{
      const e=await vlGet('etat'); VL.etat=e; VL.dispo=true;
      const premier=!VL.charge, depuis=VL.vuJusqua;
      const a=await vlGet('alertes?depuis='+(premier?0:Math.max(0,depuis-1)));
      const liste=(a.alertes||[]).slice().sort((p,q)=>p.t-q.t);
      if(premier){ VL.alertes=liste.slice().reverse(); VL.charge=true; for(const n of liste) if(n.t>depuis&&Date.now()-n.t<30*60000) vlPresenter(n); }   // l'historique s'affiche ; seules les alertes pas encore vues sont présentées
      else for(const n of liste){ if(n.t>depuis&&!VL.alertes.some(y=>y.id===n.id)){ VL.alertes.unshift(n); if(Date.now()-n.t<30*60000) vlPresenter(n); } }
      const dernier=Math.max(VL.vuJusqua,...VL.alertes.map(x=>x.t),0); VL.vuJusqua=dernier; if(dernier) vlEcrire('rayle_veilleur_vu',String(dernier));
      VL.alertes.length=Math.min(VL.alertes.length,60);
    }catch(err){ if(VL.dispo===null) VL.dispo=false; if(VL.dispo) VL.dispo=false; }
    vlDiffuser();
  }
  function vlDemarrerSurveillance(){
    if(VL.minuteur||!vlLocal()) { if(!vlLocal()) VL.dispo=false; return; }
    VL.vuJusqua=Number(vlLire('rayle_veilleur_vu'))||0;
    vlTick(); VL.minuteur=setInterval(()=>{ if(!document.hidden) vlTick(); },20000);
  }

  /* ── Actions ── */
  const VeilleurPage={
    etat:()=>VL.etat, alertes:()=>VL.alertes.slice(), disponible:()=>VL.dispo,
    surChangement(f){ VL.auteurs.add(f); return ()=>VL.auteurs.delete(f); },
    async rafraichir(){ await vlTick(); return VL.etat; },
    async reglages(patch){ const r=await vlPost('reglages',{patch}); await vlTick(); return r; },
    async lier(){
      let url='',jeton=''; try{ url=W.url(); jeton=W.token(); }catch(e){}
      if(!url||!jeton) return {ok:false,erreur:"Renseigne d'abord l'adresse du Worker et le code d'accès dans ⚙ Réglages (Connexion)."};
      const r=await vlPost('config',{url,jeton}); await vlTick(); return r;
    },
    async demarrer(){ const r=await vlPost('demarrer'); setTimeout(vlTick,2500); return r; },
    async arreter(){ const r=await vlPost('arreter'); setTimeout(vlTick,3000); return r; },
    async demarrageWindows(actif){ const r=await vlPost('demarrage-windows',{actif}); await vlTick(); return r; },
    async fauxSignal(){ const r=await vlPost('faux-signal'); setTimeout(vlTick,800); return r; },
    async pousserStrategie(etat){
      try{
        if(!etat||!etat.verdict||etat.verdict.etat!=='validee'||!vlLocal()) return {ok:false};
        const v=JSON.parse(JSON.stringify(etat.verdict)); if(v.strategie) delete v.strategie.tradesFinal; delete v.journal;
        return await vlPost('strategie',{verdict:v,coffre:etat.coffre,nVariantes:etat.nVariantes,reglagesAgent:etat.reglages});
      }catch(e){ return {ok:false}; }
    },
    resume(){
      const e=VL.etat;
      if(VL.dispo===false||!e) return "Le veilleur n'est pas joignable : il faut l'application Rayle sur le PC.";
      const n=VL.alertes.length;
      const marche=e.enMarche?'Le veilleur tourne':'Le veilleur est arrêté';
      const actif=e.reglages&&e.reglages.actif?' et il est activé':' et il est désactivé : il n’envoie rien';
      const strat=e.etat&&e.etat.strategie;
      const phraseStrat=strat==='validee'?' Une stratégie validée est suivie.':' Aucune stratégie validée n’est suivie : il n’enverra ni entrée ni préparation.';
      return marche+actif+'.'+phraseStrat+' '+(n?n+' alerte'+(n>1?'s':'')+' reçue'+(n>1?'s':'')+' récemment.':'Aucune alerte reçue pour le moment.');
    },
    /* Commande vocale → texte parlé, ou null. */
    async commande(texte){
      const n=(typeof cmdNorm==='function'?cmdNorm(norm(texte)):norm(texte)).replace(/['’\-\/]/g,' ').replace(/\s+/g,' ').trim();
      if(n.split(' ').length>9) return null;
      const veilleur=/\bveilleur\b|\bveilleuse\b/.test(n);
      const alertes=/\b(?:les )?alertes\b/.test(n)&&/\b(?:montre|affiche|ouvre|ouvrir|voir|liste|lis|donne|quelles|quelles sont)\b/.test(n)&&!/\b(?:prix|de prix)\b/.test(n);
      if(!veilleur&&!alertes) return null;
      if(vlLocal()&&VL.dispo===null) await vlTick();
      if(veilleur){
        if(/\b(?:desactive|desactiver|coupe|couper|arrete|arreter|eteins|eteindre|stoppe)\b/.test(n)){ if(!VL.dispo) return this.resume(); await this.reglages({actif:false}); return "C'est fait : le veilleur est désactivé. Il n'enverra plus aucune alerte."; }
        if(/\b(?:active|activer|allume|allumer|lance|lancer|demarre|demarrer|reactive)\b/.test(n)){
          if(!VL.dispo) return this.resume();
          if(!VL.etat.workerConfigure){ const l=await this.lier(); if(!l.ok) return "Je ne peux pas activer le veilleur : "+(l.erreur||'liaison impossible')+'.'; }
          await this.reglages({actif:true}); if(!VL.etat.enMarche) await this.demarrer();
          return "C'est fait : le veilleur est activé. "+(VL.etat.etat&&VL.etat.etat.strategie==='validee'?'':"Rappel : aucune stratégie n'est validée, donc il ne signalera pas d'entrée, seulement les rappels macro. ");
        }
        return this.resume();
      }
      // « montre-moi les alertes » : panneau Alertes de Mars si possible, sinon résumé
      try{ if(window.Mars&&Mars.etat&&Mars.etat().actif) import(new URL('planetes/mars/pc/trading/fenetre.js',document.baseURI).href).then(m=>m.ouvrirEspace({dock:'alertes'})).catch(()=>{}); }catch(e){}
      const l=VL.alertes.slice(0,3).map(a=>(a.type==='ENTREE'?'Entrée':a.type==='PREPARATION'?'Préparation':a.type==='OBSERVATION'?'Observation non validée':'Macro')+' : '+String(a.resume||a.texte||'').slice(0,120)).join('. ');
      return VL.alertes.length?'Dernières alertes. '+l+'.':'Aucune alerte pour le moment. '+this.resume();
    },
    /* Réglages (⚙ et panneau Mars) : construit l'interface dans un conteneur. */
    rendreReglages(conteneur){
      const c=conteneur; if(!c) return;
      const dessiner=()=>{
        const e=VL.etat, r=e&&e.reglages;
        if(VL.dispo===false||!r){ c.innerHTML='<div class="vl-vide">Le veilleur demande l’application Rayle sur le PC (serveur local). '+(vlLocal()?'Le serveur local ne répond pas.':'Cette page n’est pas servie par le PC.')+'</div>'; return; }
        const chk=(id,lib,v)=>'<label class="chk"><input type="checkbox" data-r="'+id+'"'+(v?' checked':'')+'> '+lib+'</label>';
        const num=(id,lib,v,min,max)=>'<label class="vl-num">'+lib+' <input type="number" data-n="'+id+'" value="'+v+'" min="'+min+'" max="'+max+'"></label>';
        const st=e.etat;
        c.innerHTML='<div class="vl-etat '+(e.enMarche?'ok':'ko')+'"><b>'+(e.enMarche?'VEILLEUR EN MARCHE':'VEILLEUR ARRÊTÉ')+'</b> · '+(r.actif?'activé':'désactivé')+' · Worker '+(e.workerConfigure?'lié':'non lié')+(st&&st.derniereBougie?' · dernière bougie M15 '+new Date(st.derniereBougie).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'')+(st&&st.canaux&&st.canaux.telegram?' · Telegram '+(st.canaux.telegram.ok?'OK':'<em>erreur</em>'):'')+'</div>'
          +'<div class="vl-lig">'+chk('actif','<b>Activer le veilleur</b> (envoie les alertes ; rien n’est envoyé sinon)',r.actif)+'</div>'
          +'<div class="vl-lig"><span>Canaux :</span>'+chk('canaux.telegram','Telegram',r.canaux.telegram)+chk('canaux.application','Application (notification, son, voix)',r.canaux.application)+'</div>'
          +'<div class="vl-lig"><span>Types :</span>'+chk('types.ENTREE','Entrée (stratégie validée)',r.types.ENTREE)+chk('types.PREPARATION','Préparation',r.types.PREPARATION)+chk('types.OBSERVATION','Observation (non validé)',r.types.OBSERVATION)+chk('types.MACRO','Macro',r.types.MACRO)+'</div>'
          +'<div class="vl-lig">'+num('maxParJour','Max par jour',r.maxParJour,0,50)+num('maxParSemaine','par semaine',r.maxParSemaine,0,200)+num('reposMinutes','Repos (min)',r.reposMinutes,0,1440)+num('maxMacroParJour','Macro par jour',r.maxMacroParJour,0,20)+'</div>'
          +'<div class="vl-lig">'+chk('silence','Heures silencieuses',r.silence)+'<label class="vl-num">de <input type="time" data-t="silenceDebut" value="'+r.silenceDebut+'"></label><label class="vl-num">à <input type="time" data-t="silenceFin" value="'+r.silenceFin+'"></label>'+chk('entreeToujours','Entrée même la nuit',r.entreeToujours)+'</div>'
          +'<div class="vl-lig">'+chk('app.son','Bip discret',vlLire('rayle_veilleur_son')!=='0')+chk('app.voix','Voix de Raylé (entrée, macro)',vlLire('rayle_veilleur_voix')!=='0')+chk('app.notif','Notification du navigateur',vlLire('rayle_veilleur_notif')!=='0')+'</div>'
          +'<div class="vl-lig"><button type="button" data-a="lier">Lier le veilleur à cet appareil</button><button type="button" data-a="'+(e.enMarche?'arreter':'demarrer')+'">'+(e.enMarche?'Arrêter':'Démarrer')+' le veilleur</button>'
          +'<button type="button" data-a="win">'+(e.demarrageWindows?'Retirer le démarrage avec Windows':'Démarrer avec Windows')+'</button><button type="button" class="ghost" data-a="faux">Tester avec un faux signal (rien n’est envoyé sur Telegram)</button></div>'
          +'<div class="vl-msg" data-s="msg"></div>';
      };
      const msg=t=>{ const m=c.querySelector('[data-s="msg"]'); if(m) m.textContent=t; };
      c.onchange=async ev=>{
        const t=ev.target; if(!t||!t.dataset) return;
        if(t.dataset.r){
          const cle=t.dataset.r;
          if(cle.startsWith('app.')){ const k={son:'rayle_veilleur_son',voix:'rayle_veilleur_voix',notif:'rayle_veilleur_notif'}[cle.slice(4)]; vlEcrire(k,t.checked?'1':'0'); if(cle==='app.notif'&&t.checked&&'Notification' in window&&Notification.permission==='default'){ try{ await Notification.requestPermission(); }catch(e){} } return; }
          const patch=cle.includes('.')?{[cle.split('.')[0]]:{[cle.split('.')[1]]:t.checked}}:{[cle]:t.checked};
          if(cle==='actif'&&t.checked&&!(VL.etat&&VL.etat.workerConfigure)){ const l=await VeilleurPage.lier(); if(!l.ok){ t.checked=false; msg(l.erreur||'liaison impossible'); return; } }
          await VeilleurPage.reglages(patch);
          if(cle==='actif'&&t.checked&&VL.etat&&!VL.etat.enMarche) await VeilleurPage.demarrer();
        }else if(t.dataset.n) await VeilleurPage.reglages({[t.dataset.n]:Number(t.value)});
        else if(t.dataset.t) await VeilleurPage.reglages({[t.dataset.t]:t.value});
      };
      c.onclick=async ev=>{
        const b=ev.target.closest&&ev.target.closest('button[data-a]'); if(!b) return;
        const a=b.dataset.a; msg('…');
        if(a==='lier'){ const r=await VeilleurPage.lier(); msg(r.ok?'Veilleur lié à cet appareil (le jeton n’est jamais affiché).':(r.erreur||'échec')); }
        else if(a==='demarrer'){ const r=await VeilleurPage.demarrer(); msg(r.ok?'Démarrage demandé.':(r.erreur||'échec')); }
        else if(a==='arreter'){ const r=await VeilleurPage.arreter(); msg(r.ok?'Arrêt demandé.':(r.erreur||'échec')); }
        else if(a==='win'){ const r=await VeilleurPage.demarrageWindows(!(VL.etat&&VL.etat.demarrageWindows)); msg(r.ok?'Démarrage avec Windows : '+(r.demarrageWindows?'activé':'retiré')+'.':(r.erreur||'échec')); }
        else if(a==='faux'){ const r=await VeilleurPage.fauxSignal(); msg(r.ok?(r.resultat||'Faux signal envoyé dans le circuit (application seulement).'):(r.erreur||'échec')); }
      };
      dessiner(); const off=VeilleurPage.surChangement(()=>{ if(!c.isConnected){ off(); return; } if(!c.contains(document.activeElement)||document.activeElement.tagName==='BUTTON') dessiner(); });
    }
  };
  window.VeilleurPage=VeilleurPage;
  window.addEventListener('load',()=>{ const sec=document.getElementById('vlSection'); if(sec) VeilleurPage.rendreReglages(sec); setTimeout(vlDemarrerSurveillance,3000); });
