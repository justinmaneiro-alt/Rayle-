"use strict";
  /* ═════════════ SÉCURITÉ : appareil appairé, verrou, déverrouillage ═════════════
     • Cet appareil s'appaire avec le code d'accès (⚙ Réglages) et reçoit un jeton propre, révocable.
     • Niveau 0 (discussion, données, terminal, cartes…) : libre. Niveaux 1 et 2 (futurs pouvoirs) : appareil appairé ;
       le niveau 2 demande en plus le déverrouillage : phrase secrète (voix ou clavier), puis PIN (pavé) ou bouton Telegram.
     • Tout est vérifié par le Worker : la page n'a ni la phrase, ni le PIN, ni leurs empreintes.
     • Déverrouillé 10 minutes, puis re-verrouillage automatique. 3 échecs = blocage 15 min + alerte Telegram. */
  window.SEC={etat:null,etape:'phrase',attente:null,envoi:false,flashJusqua:0,msg:'',msgClasse:'',pin:'',poll:0};
  const secAppaire=()=>!!store.get(KEY_WDEV);
  const secPluriel=(n,mot)=>n+' '+mot+(n>1?'s':'');

  async function secAjax(chemin,methode,corps){
    try{
      const r=await wfetch(chemin,{method:methode||'GET',headers:corps?{'Content-Type':'application/json'}:{},body:corps?JSON.stringify(corps):undefined},12000);
      let d={}; try{ d=await r.json(); }catch(e){}
      return {ok:r.ok,status:r.status,d};
    }catch(e){ return {ok:false,status:0,d:{error:'Worker injoignable'}}; }
  }
  const secFlash=(ms)=>{ SEC.flashJusqua=Date.now()+(ms||2500); };

  /* ───── Pastille 🔒 / 🔓 ───── */
  const secBadge=document.createElement('button');
  secBadge.type='button'; secBadge.id='badgeAcces'; secBadge.hidden=true;
  document.body.appendChild(secBadge);

  function secRestant(){
    const e=SEC.etat; if(!e||!e.deverrouille) return 0;
    return Math.max(0,e.expire_dans-(Date.now()-e.t)/1000);
  }
  let secAvant=false;
  function secAppliquer(){
    const reste=secRestant(), ouvert=reste>0;
    try{ Entite.deverrouille(ouvert); }catch(e){}
    if(secAvant && !ouvert && SEC.etat){ SEC.etat.deverrouille=false; secFlash(2500); addLine('sys','Accès re-verrouillé.'); }
    secAvant=ouvert;
    if(!SEC.etat){ secBadge.hidden=true; document.body.classList.remove('acces-ouvert'); return; }
    secBadge.hidden=false;
    secBadge.className=ouvert?'ouvert':'ferme';
    const m=Math.floor(reste/60), s=Math.floor(reste%60);
    secBadge.textContent=ouvert ? '🔓 '+m+':'+String(s).padStart(2,'0') : (SEC.etat.bloque_dans>0?'⛔ bloqué':'🔒 verrouillé');
    secBadge.title=ouvert?'Déverrouillé : toucher pour re-verrouiller':'Verrouillé : toucher pour déverrouiller';
    document.body.classList.toggle('acces-ouvert',ouvert);
  }
  async function secEtat(){
    if(!workerReady()||!secAppaire()){ SEC.etat=null; secAppliquer(); return null; }
    const r=await secAjax('/securite/etat');
    if(r.ok) SEC.etat=Object.assign(r.d,{t:Date.now()});
    else if(r.status===401||r.status===403) SEC.etat=null;
    secAppliquer();
    return SEC.etat;
  }
  setInterval(secAppliquer,1000);
  setInterval(()=>{ if(!document.hidden) secEtat(); },30000);
  setTimeout(secEtat,1500);

  secBadge.addEventListener('click',async()=>{
    if(secRestant()>0){ await secVerrouiller(); return; }
    const t=await secDemander(false); if(t){ addLine('ray',t); speak(t); }
  });

  /* ───── Panneau HUD : phrase secrète, puis pavé PIN ───── */
  function secMessage(txt,classe){
    SEC.msg=txt||''; SEC.msgClasse=classe||'';
    const m=SEC.el&&SEC.el.querySelector('.sec-msg'); if(m){ m.textContent=SEC.msg; m.className='sec-msg '+SEC.msgClasse; }
  }
  function secPoints(){
    const p=SEC.el&&SEC.el.querySelector('.sec-pts'); if(p) p.textContent=SEC.pin.length?'●'.repeat(SEC.pin.length):'· · · ·';
  }
  function secDessiner(){
    const el=SEC.el; if(!el) return;
    el.textContent='';
    const mk=(tag,cls,txt)=>{ const x=document.createElement(tag); if(cls) x.className=cls; if(txt!=null) x.textContent=txt; return x; };
    const racine=mk('div','sec-boite');
    if(SEC.etape==='phrase'){
      racine.appendChild(mk('div','sec-titre',fx('Dites votre phrase secrète','Dis ta phrase secrète')));
      racine.appendChild(mk('div','sec-aide','à voix haute, ou tapez-la ci-dessous. Elle ne s’affiche nulle part.'));
      const champ=mk('input','sec-champ'); champ.type='password'; champ.autocomplete='off'; champ.spellcheck=false; champ.setAttribute('aria-label','Phrase secrète');
      const ok=mk('button','pn-bouton','Valider'); ok.type='button';
      const envoyer=()=>{ const v=champ.value; champ.value=''; if(v.trim()) secEnvoyerPhrase(v); };
      ok.addEventListener('click',envoyer);
      champ.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); envoyer(); } });
      const ligne=mk('div','sec-ligne'); ligne.append(champ,ok);
      racine.appendChild(ligne);
      setTimeout(()=>{ try{ if(!modeToucher()) champ.focus(); }catch(e){} },50);
    }else if(SEC.etape==='pin'){
      racine.appendChild(mk('div','sec-titre',fx('Entrez votre code','Entre ton code')));
      racine.appendChild(mk('div','sec-pts','· · · ·'));
      const grille=mk('div','sec-grille');
      ['1','2','3','4','5','6','7','8','9','⌫','0','✓'].forEach(t=>{
        const b=mk('button','sec-touche'+(t==='✓'?' valide':''),t); b.type='button';
        b.setAttribute('aria-label',t==='⌫'?'Effacer':t==='✓'?'Valider le code':'Chiffre '+t);
        b.addEventListener('click',()=>{
          if(SEC.envoi) return;
          if(t==='⌫') SEC.pin=SEC.pin.slice(0,-1);
          else if(t==='✓'){ secEnvoyerPin(); return; }
          else if(SEC.pin.length<8) SEC.pin+=t;
          secPoints();
        });
        grille.appendChild(b);
      });
      racine.appendChild(grille);
      if(SEC.etat&&SEC.etat.telegram){
        const tg=mk('button','pn-bouton sec-tg','Confirmer sur Telegram'); tg.type='button';
        tg.addEventListener('click',secTelegram);
        racine.appendChild(tg);
      }
    }else{   // telegram
      racine.appendChild(mk('div','sec-titre','Confirmez sur Telegram'));
      racine.appendChild(mk('div','sec-aide','Un message avec un bouton « Confirmer » vient de partir. Appuyez dessus.'));
    }
    racine.appendChild(mk('div','sec-msg '+SEC.msgClasse,SEC.msg));
    el.appendChild(racine);
    // la saisie vocale n'est écoutée qu'à l'étape de la phrase
    if(SEC.etape==='phrase'){ document.body.classList.add('secu-capture'); }
    else{ SEC.attente=null; document.body.classList.remove('secu-capture'); }
  }
  function secOuvrirPanneau(){
    Panneaux.ouvrir({id:'securite',type:'securite',icone:'🔐',titre:'Déverrouillage',duree:3*60000,corps:(el)=>{
      SEC.el=el; secDessiner();
      return ()=>{ SEC.el=null; SEC.attente=null; SEC.pin=''; clearInterval(SEC.poll); document.body.classList.remove('secu-capture'); };
    }});
  }

  /* ───── Étapes du déverrouillage ───── */
  async function secDemander(parVoix){
    if(!workerReady()) return fx("Le Worker n'est pas configuré.","Le Worker n'est pas configuré.");
    if(!secAppaire()) return fx("Cet appareil n'est pas encore appairé. Faites-le dans les réglages, section Appareil et sécurité.","Cet appareil n'est pas encore appairé. Fais-le dans les réglages, section Appareil et sécurité.");
    const e=await secEtat();
    if(!e) return "Je n'arrive pas à joindre le Worker pour la sécurité.";
    if(!e.configure) return fx("La phrase secrète et le code ne sont pas encore enregistrés côté Worker.","La phrase secrète et le code ne sont pas encore enregistrés côté Worker.");
    if(secRestant()>0) return 'Je suis déjà déverrouillée, encore '+secPluriel(Math.ceil(secRestant()/60),'minute')+'.';
    if(e.bloque_dans>0) return 'Le déverrouillage est bloqué pour encore '+secPluriel(Math.ceil(e.bloque_dans/60),'minute')+'.';
    SEC.etape='phrase'; SEC.pin=''; SEC.msg=''; SEC.msgClasse='';
    secOuvrirPanneau();
    // on n'écoute la voix qu'après ma propre phrase (sinon je m'entendrais) et pendant 30 s
    const arme=Date.now()+(parVoix?3500:1000);
    SEC.attente={arme,jusqua:arme+30000};
    return fx('Dites votre phrase secrète.','Dis ta phrase secrète.');
  }
  // Appelée par onUser() avant tout : true = la phrase est consommée, elle ne va ni au journal ni à l'IA
  function secCapturer(texte,voix){
    const a=SEC.attente;
    if(!a||SEC.etape!=='phrase'||SEC.envoi||!SEC.el) return false;
    if(Date.now()>a.jusqua){ SEC.attente=null; document.body.classList.remove('secu-capture'); return false; }
    const n=norm(texte);
    if(/^(?:annule|annuler|laisse tomber|oublie|non)$/.test(cmdNorm(n))){ Panneaux.fermer('securite'); addLine('ray','Déverrouillage annulé.'); return true; }
    if(COUPURE_RE.test(cmdNorm(n))){ Panneaux.fermer('securite'); return false; }
    if(voix){
      if(Date.now()<a.arme) return true;                                // fin de ma propre phrase
      if(typeof echoTail==='function' && echoTail(n)) return true;      // écho de ma voix
    }
    secEnvoyerPhrase(texte);
    return true;
  }
  function secErreur(r,quoi){
    const d=r.d||{};
    secFlash(2500);
    if(r.status===423||d.code==='bloque'){
      const min=Math.max(1,Math.ceil((d.bloque_dans||900)/60));
      secMessage('⛔ Trop d’échecs : bloqué '+secPluriel(min,'minute')+'. Alerte envoyée sur Telegram.','mauvais');
      const t='Trop d’échecs. Le déverrouillage est bloqué '+secPluriel(min,'minute')+'.';
      addLine('ray',t); speak(t); secEtat();
      setTimeout(()=>Panneaux.fermer('securite'),4000);
    }else if(r.status===501){ secMessage('Phrase et PIN non configurés côté Worker.','mauvais'); }
    else if(d.code==='phrase_requise'){ SEC.etape='phrase'; SEC.attente={arme:Date.now(),jusqua:Date.now()+30000}; secDessiner(); secMessage('Il faut redire la phrase secrète.','mauvais'); }
    else if(r.status===403||r.status===400){
      const reste=d.restants;
      secMessage((quoi||'Refusé')+(reste!=null?' — encore '+secPluriel(reste,'essai'):'')+'.','mauvais');
    }else secMessage('Erreur : '+(d.error||'Worker injoignable'),'mauvais');
  }
  async function secEnvoyerPhrase(phrase){
    SEC.envoi=true; secMessage('Vérification…','');
    const r=await secAjax('/securite/phrase','POST',{phrase});
    SEC.envoi=false;
    if(r.ok){
      SEC.etape='pin'; SEC.pin=''; SEC.msg='Phrase reconnue. Vous avez 60 secondes.'; SEC.msgClasse='bon'; SEC.attente=null;
      await secEtat(); secDessiner();
      const t=fx('Phrase reconnue. Entrez votre code.','Phrase reconnue. Entre ton code.'); addLine('ray',t); speak(t);
    }else{
      if(r.status===403) SEC.attente={arme:Date.now()+500,jusqua:Date.now()+30000};   // je ne parle pas après un échec : on réécoute presque tout de suite
      secErreur(r,'Phrase incorrecte');
    }
  }
  async function secEnvoyerPin(){
    if(SEC.pin.length<4){ secMessage('Le code fait au moins 4 chiffres.','mauvais'); return; }
    const pin=SEC.pin; SEC.pin=''; secPoints(); SEC.envoi=true; secMessage('Vérification…','');
    const r=await secAjax('/securite/pin','POST',{pin});
    SEC.envoi=false;
    if(r.ok) secReussi(); else secErreur(r,'Code incorrect');
  }
  async function secTelegram(){
    if(SEC.envoi) return;
    SEC.envoi=true; secMessage('Envoi de la demande sur Telegram…','');
    const r=await secAjax('/securite/telegram','POST',{});
    SEC.envoi=false;
    if(!r.ok){ secErreur(r,(r.d&&r.d.error)||'Telegram indisponible'); return; }
    SEC.etape='telegram'; SEC.msg='En attente de votre confirmation…'; SEC.msgClasse=''; secDessiner();
    clearInterval(SEC.poll);
    const debut=Date.now(), fin=debut+((r.d.defi_dans||60)*1000)+3000;
    SEC.poll=setInterval(async()=>{
      const e=await secEtat();
      if(e&&e.deverrouille){ clearInterval(SEC.poll); secReussi(); }
      else if(Date.now()>fin||(e&&!e.defi_dans&&Date.now()-debut>4000)){   // défi expiré, ou refusé sur Telegram
        clearInterval(SEC.poll);
        SEC.etape='phrase'; SEC.attente={arme:Date.now()+1000,jusqua:Date.now()+30000}; secDessiner();
        secMessage('Demande expirée ou refusée : redites la phrase.','mauvais'); secFlash(2500);
      }
    },2000);
  }
  async function secReussi(){
    await secEtat();
    secMessage('🔓 Déverrouillé pour 10 minutes.','bon');
    const t=fx('Déverrouillée pour dix minutes.','Déverrouillée pour dix minutes.'); addLine('ray',t); speak(t);
    setTimeout(()=>Panneaux.fermer('securite'),1400);
  }
  async function secVerrouiller(){
    const r=await secAjax('/securite/verrouiller','POST',{});
    await secEtat(); secFlash(2500);
    return r.ok ? 'Verrouillée.' : 'Je n’ai pas pu verrouiller : '+((r.d&&r.d.error)||'Worker injoignable')+'.';
  }

  /* ───── Journal des actions sensibles ───── */
  const SEC_ACTIONS={'deverrouillage':'déverrouillage','verrouillage':'verrouillage','blocage':'blocage','appareil.appairer':'appairage d’appareil','appareil.revoquer':'révocation d’appareil','securite.test':'test du verrou'};
  function secIlYa(t){
    const s=Math.max(0,(Date.now()-t)/1000);
    if(s<90) return 'à l’instant';
    if(s<3600) return 'il y a '+secPluriel(Math.round(s/60),'minute');
    if(s<86400) return 'il y a '+secPluriel(Math.round(s/3600),'heure');
    return 'il y a '+secPluriel(Math.round(s/86400),'jour');
  }
  async function secJournal(){
    if(!secAppaire()) return "Cet appareil n'est pas appairé, je ne peux pas lire le journal.";
    const r=await secAjax('/securite/journal?n=8');
    if(!r.ok) return 'Je n’arrive pas à lire le journal : '+((r.d&&r.d.error)||'Worker injoignable')+'.';
    const l=r.d.journal||[];
    if(!l.length) return 'Le journal de sécurité est vide.';
    const lib=x=>(SEC_ACTIONS[x.action]||x.action)+(x.ok?'':' refusé')+(x.appareil?', '+x.appareil:'');
    const h='<div class="pn-sous">Actions sensibles (niveau 2)</div>'+l.map(x=>'<div class="pn-l"><span>'+Panneaux.esc(secIlYa(x.quand))+'</span><b class="'+(x.ok?'':'mauvais')+'">'+Panneaux.esc(lib(x))+'</b></div><small>'+Panneaux.esc(x.detail||'')+'</small>').join('');
    Panneaux.ouvrir({id:'securite-journal',type:'securite',icone:'📜',titre:'Journal de sécurité',corps:{html:h},duree:5*60000});
    return 'Voici les '+Math.min(l.length,5)+' dernières actions sensibles. '+l.slice(0,5).map(x=>secIlYa(x.quand)+', '+lib(x)).join('. ')+'.';
  }

  /* ───── Commandes vocales ───── */
  async function commandeSecurite(texte){
    const n=cmdNorm(norm(texte)).replace(/['’\-]/g,' ').replace(/\s+/g,' ').trim()
      .replace(/^(?:s il (?:te|vous) plait |stp |peux tu |pouvez vous |tu peux |vous pouvez )+/,'').replace(/ (?:stp|s il (?:te|vous) plait|maintenant)$/,'');
    if(!n||n.split(' ').length>9) return null;
    if(/^(?:deverrouille|deverrouiller|debloque|debloquer|deverrouillage)(?: toi| l acces| l assistante| rayle)?$|^(?:ouvre|ouvrir) l acces$|^unlock$/.test(n)) return await secDemander(true);
    if(/^(?:reverrouille|re verrouille|verrouille|verrouiller|ferme l acces|fermer l acces|bloque l acces)(?: toi| tout)?$|^lock$/.test(n)){
      if(!secAppaire()) return "Cet appareil n'est pas appairé : il n'y a rien à verrouiller.";
      return await secVerrouiller();
    }
    if(/\bjournal (?:de )?(?:la )?securite\b|\bjournal des actions (?:sensibles|delicates|de niveau 2)\b|\bactions sensibles\b/.test(n)) return await secJournal();
    if(/\b(?:etat|statut) (?:de )?(?:la )?securite\b|^(?:es tu|suis tu) (?:verrouillee?|deverrouillee?)$|^(?:tu es|t es) (?:verrouillee?|deverrouillee?)$/.test(n)){
      if(!secAppaire()) return "Cet appareil n'est pas appairé.";
      const e=await secEtat(); if(!e) return 'Je ne joins pas le Worker.';
      if(secRestant()>0) return 'Déverrouillée, encore '+secPluriel(Math.ceil(secRestant()/60),'minute')+'. Appareil : '+e.appareil+'.';
      return 'Verrouillée'+(e.bloque_dans>0?', et le déverrouillage est bloqué '+secPluriel(Math.ceil(e.bloque_dans/60),'minute'):'')+'. Appareil : '+e.appareil+'.';
    }
    if(/^(?:liste |quels sont )?(?:les )?appareils(?: appaires| connectes)?$|^quels appareils(?: sont appaires)?$/.test(n)) return await secListe();
    const rev=/^(?:revoque|revoquer|desappaire|desappairer) (?:l appareil |la |le |l )?(.+)$/.exec(n);
    if(rev) return await secRevoquer(rev[1]);
    return null;
  }
  async function secListe(){
    if(!secAppaire()) return "Cet appareil n'est pas appairé.";
    const r=await secAjax('/appareil/liste');
    if(!r.ok) return 'Je ne peux pas lister les appareils : '+((r.d&&r.d.error)||'Worker injoignable')+'.';
    const actifs=(r.d.appareils||[]).filter(a=>!a.revoque);
    if(!actifs.length) return 'Aucun appareil appairé.';
    return secPluriel(actifs.length,'appareil')+' appairé'+(actifs.length>1?'s':'')+' : '+actifs.map(a=>a.nom+(a.moi?' (celui-ci)':'')).join(', ')+'.';
  }
  async function secRevoquer(nom){
    if(!secAppaire()) return "Cet appareil n'est pas appairé.";
    const r=await secAjax('/appareil/revoquer','POST',{nom});
    if(r.ok){ if(norm(r.d.revoque||'')===norm(store.get(KEY_WDEVNOM))){ store.set(KEY_WDEV,''); store.set(KEY_WDEVNOM,''); secEtat(); } return 'Appareil '+r.d.revoque+' révoqué.'; }
    if(r.d&&r.d.code==='verrouille') return 'Pour révoquer un autre appareil, déverrouille-moi d’abord.';
    return (r.d&&r.d.error)||'Je n’ai pas pu révoquer cet appareil.';
  }

  /* ───── Réglages : appairer / oublier / voir ───── */
  const kAppNom=$('kAppNom'), appInfo=$('appInfo');
  function majAppInfo(){
    const nom=store.get(KEY_WDEVNOM);
    appInfo.textContent=secAppaire()
      ? 'Appareil appairé : « '+(nom||'?')+' ». Il utilise son propre jeton, révocable. Le code d’accès ne donne que le niveau 0.'
      : 'Cet appareil n’est pas appairé : il utilise le code d’accès (niveau 0 seulement). Appairez-le pour pouvoir déverrouiller Raylé.';
    if(!kAppNom.value) kAppNom.value=nom||(matchMedia('(pointer:coarse)').matches ? (Math.min(screen.width,screen.height)<600?'Téléphone':'Tablette') : 'PC');
  }
  $('gear').addEventListener('click',majAppInfo);
  $('cfgAppairer').addEventListener('click',async()=>{
    saveCfg();
    const nom=kAppNom.value.trim();
    if(!workerReady()||!store.get(KEY_WTOK)){ cfgMsg.textContent="✖ L'appairage demande l'adresse du Worker et le code d'accès (une seule fois)."; return; }
    if(nom.length<2){ cfgMsg.textContent="✖ Donnez un nom à cet appareil."; return; }
    cfgMsg.textContent='Appairage…';
    try{
      const res=await fetchT(W.url()+'/appareil/appairer',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':store.get(KEY_WTOK)},body:JSON.stringify({nom})},12000);
      const d=await res.json().catch(()=>({}));
      if(!res.ok||!d.jeton){ cfgMsg.textContent='✖ '+(d.error||'appairage refusé (HTTP '+res.status+')')+(res.status===404?' — le Worker n’est pas à jour.':''); return; }
      store.set(KEY_WDEV,d.jeton); store.set(KEY_WDEVNOM,d.nom);
      cfgMsg.textContent='✔ Appareil « '+d.nom+' » appairé.'; majAppInfo(); addLine('sys','Appareil appairé : '+d.nom); secEtat();
    }catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
  });
  $('cfgOublier').addEventListener('click',async()=>{
    if(!secAppaire()){ cfgMsg.textContent='Cet appareil n’est pas appairé.'; return; }
    const nom=store.get(KEY_WDEVNOM);
    await secAjax('/appareil/revoquer','POST',{nom});
    store.set(KEY_WDEV,''); store.set(KEY_WDEVNOM,''); SEC.etat=null; secAppliquer();
    cfgMsg.textContent='✔ Appareil « '+nom+' » oublié et révoqué.'; majAppInfo(); addLine('sys','Appareil oublié : '+nom);
  });
  $('cfgAppareils').addEventListener('click',async()=>{ cfgMsg.textContent=await secListe(); });

  /* ───── Diagnostic : dans la console du navigateur (F12), taper  rayleDiag()  ───── */
  window.rayleDiag=function(){
    const g=f=>{ try{ return f(); }catch(e){ return '?'; } };
    return {
      micOn:g(()=>micOn), reconnaissanceActive:g(()=>recActif), activeDepuisS:g(()=>recActif?Math.round((Date.now()-recDepuis)/1000):0), dernierSonIlYaS:g(()=>dernierSon?Math.round((Date.now()-dernierSon)/1000):null), mode:g(()=>mode), toucher:g(()=>modeToucher()), parle:g(()=>speaking), occupee:g(()=>processing), file:g(()=>queue.length),
      vue:g(()=>RayleBus.demander('vue')), pilotageTerminal:g(()=>typeof RayleBus.demander('terminal:commande')),
      workerPret:g(()=>workerReady()), appareil:g(()=>store.get(KEY_WDEVNOM)||'non appairé'),
      securite:g(()=>SEC.etat?{deverrouille:SEC.etat.deverrouille,bloque_dans:SEC.etat.bloque_dans}:null), saisiePhraseEnCours:!!SEC.attente,
      entite:g(()=>Entite.info()), dernieresEntrees:window.RAYLE_ENTREES||[]
    };
  };
