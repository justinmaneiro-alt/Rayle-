"use strict";
  /* ═════════════ PANNEAU « VOIX DE RAYLÉ » (⚙ Réglages) — v9 ═════════════
     Voix Microsoft Azure (principale), voix Piper (locales, secours), Gemini (facultatif) : chacune avec « Écouter » sur la même phrase d'essai ; vitesse et ton ; indicateur du moteur utilisé ;
     compteur de caractères Azure du mois. Le choix (clé rayle_voix_gemini_v1) est synchronisé entre les appareils. Logique : voix-moteurs.js, piper-client.js. */
  (function(){
    const liste=document.getElementById('vxListe'); if(!liste||!window.VoixMoteurs) return;
    const $=id=>document.getElementById(id);
    const msg=$('vxMsg'), etat=$('vxEtat'), haut=$('vxHauteur'), hautVal=$('vxHauteurVal'), sys=$('vxSys'), dico=$('vxDico');
    const COULEUR={'prête':'#7bd88f','chargement':'#e8c26a','à télécharger':'#9db6c0','en échec':'#e06c6c','indisponible':'#8a8f98'};
    const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const azure=$('vxAzure'), piper=$('vxPiper'), gem=$('vxGemini'), gVit=$('vxGemVit'), gVitVal=$('vxGemVitVal'), gTon=$('vxGemTon'), gQuota=$('vxGemQuota'), gMoteur=$('vxMoteur'), azQuota=$('vxAzQuota'), auto=$('vxAuto');
    const ligne=(c,choix)=>'<div class="vx-ligne"><label class="chk"><input type="radio" name="vxChoix" value="'+c.id+'"'+(choix===c.id?' checked':'')+'> <b>'+esc(c.nom)+'</b> <span style="color:'+(COULEUR[c.etat]||'#8a8f98')+'">● '+c.etat+'</span></label> <button type="button" class="ghost" data-ecouter="'+c.id+'">Écouter</button><div class="hint">'+esc(c.detail)+(c.raison?' — '+esc(c.raison):'')+'</div></div>';
    const groupe=(L,choix,genre,titre)=>{ const l=L.filter(c=>c.genre===genre); return l.length?'<div class="hint"><b>'+titre+'</b></div>'+l.map(c=>ligne(c,choix)).join(''):''; };
    const rendreFamille=(cible,famille,choix,cands)=>{ if(!cible) return; const L=cands.filter(c=>c.famille===famille); cible.innerHTML=groupe(L,choix,'f','Voix féminines')+groupe(L,choix,'h','Voix masculines'); };
    function texteQuotaAzure(){
      const q=VoixMoteurs.quotaAzure(), e=VoixMoteurs.azureEtat(), p=VoixMoteurs.pauseAzure();
      if(e.cle===false) return 'Azure n’est pas encore configuré : la clé Azure Speech n’est pas dans les secrets de rayle-voix (voir docs/rayle-v9.md). En attendant, Piper parle.';
      let t=q?'Caractères Azure utilisés ce mois-ci : '+q.n.toLocaleString('fr-FR')+' / 500 000 ('+String(q.pct).replace('.',',')+' %). Les phrases déjà dites sont gardées en copie et ne comptent pas.':'Compteur du mois : pas encore lu (il s’affiche après la première phrase ou « Écouter »).';
      if(q&&q.pct>=80) t+=' ⚠ Plus de 80 % du mois : à 100 %, Azure se bloque (sans aucune facturation) et Piper prend le relais.';
      if(p>Date.now()) t+=' Azure en pause jusqu’à '+new Date(p).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+' : Piper parle à la place.';
      return t;
    }
    function rendre(){
      const brut=VoixMoteurs.gemini().moteur, choix=brut||'auto', cands=VoixMoteurs.candidats();
      etat.textContent=(VoixMoteurs.NOMS[VoixMoteurs.actif()]||{nom:VoixMoteurs.actif()}).nom+(brut?'':' (automatique)');
      if(auto) auto.checked=!brut;
      rendreFamille(azure,'azure',choix,cands); rendreFamille(piper,'piper',choix,cands); rendreFamille(gem,'gemini',choix,cands);
      const g=VoixMoteurs.gemini(); gVit.value=String(g.vitesse); gVitVal.textContent=g.vitesse===0?'normale':(g.vitesse>0?'+':'')+g.vitesse+' %'; gTon.value=g.ton;
      if(azQuota) azQuota.textContent=texteQuotaAzure();
      if(gQuota){ const p=VoixMoteurs.pauseGem(); gQuota.textContent='Phrases Gemini nouvelles aujourd’hui : '+VoixMoteurs.nGemJour()+' / '+VoixMoteurs.LIMITE_JOUR_GEM+(p>Date.now()?'. En pause (quota Google atteint) jusqu’à '+new Date(p).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'.':'.'); }
      const d=VoixMoteurs.dernier(), ec=VoixMoteurs.echec();
      gMoteur.textContent=(ec&&/indisponible/.test(d||'')?'✖ '+(VoixMoteurs.NOMS[ec.id]||{nom:ec.id}).nom+' a échoué : '+ec.msg+' — la réponse reste affichée. ':'')+'Moteur utilisé en ce moment : '+(d||(VoixMoteurs.NOMS[VoixMoteurs.actif()]||{nom:VoixMoteurs.actif()}).nom)+(d?'':' (aucune phrase dite depuis l’ouverture)');
      const h=VoixMoteurs.hauteur(); haut.value=String(h); hautVal.textContent=h===0?'normale':(h>0?'+':'')+h+' %';
      sys.innerHTML='';
      if(document.activeElement!==dico){ const dd=VoixMoteurs.dico(); dico.value=Object.keys(dd).map(k=>k+' = '+dd[k]).join('\n'); }
    }
    const diag=$('vxGemDiag'), diagSortie=$('vxGemDiagSortie'); if(diag) diag.addEventListener('click',async()=>{ diag.disabled=true; diagSortie.textContent='Diagnostic en cours…'; try{ diagSortie.textContent=(await VoixMoteurs.diagnostic()).join('\n'); }catch(e){ diagSortie.textContent='✖ '+errMsg(e); } diag.disabled=false; });
    gVit.addEventListener('input',()=>{ VoixMoteurs.definirGemini({vitesse:Number(gVit.value)}); });
    gTon.addEventListener('change',()=>{ VoixMoteurs.definirGemini({ton:gTon.value}); });
    const surChoix=e=>{ if(e.target.name==='vxChoix'){ VoixMoteurs.choisir(e.target.value); msg.textContent='Voix mémorisée : '+(e.target.value==='auto'?'automatique':(VoixMoteurs.NOMS[e.target.value]||{}).nom)+'.'; } };
    const surEcouter=async e=>{ const b=e.target.closest('[data-ecouter]'); if(!b) return; const id=b.getAttribute('data-ecouter'), N=VoixMoteurs.NOMS[id];
      msg.textContent='Lecture avec '+N.nom+(N.famille==='piper'&&!VoixMoteurs.pret(id)?' (téléchargement de la voix la première fois, une seule fois)':'')+'…';
      try{ const avant=Date.now(); await speak(VoixCalcul.PHRASE_ESSAI,{moteur:id}); const ec=VoixMoteurs.echec(); msg.textContent=(ec&&ec.id===id&&ec.t>=avant)?'✖ '+N.nom+' : '+ec.msg:''; }catch(x){ msg.textContent='✖ '+errMsg(x); } };
    [azure,piper,gem].forEach(c=>{ if(c){ c.addEventListener('change',surChoix); c.addEventListener('click',surEcouter); } });
    if(auto) auto.addEventListener('change',surChoix);
    haut.addEventListener('input',()=>{ VoixMoteurs.definirHauteur(Number(haut.value)); });
    $('vxEssai').addEventListener('click',()=>{ msg.textContent='Lecture de la phrase d’essai…'; speak(VoixCalcul.PHRASE_ESSAI).then(()=>{ msg.textContent=''; }); });
    $('vxTester').addEventListener('click',async()=>{ msg.textContent='Lecture de l’état des voix…'; await VoixMoteurs.rafraichirAzure(); await VoixMoteurs.testerAuto(); msg.textContent='Voix à jour.'; });
    dico.addEventListener('change',()=>{
      const o={}; dico.value.split('\n').forEach(l=>{ const i=l.indexOf('='); if(i>0){ const k=l.slice(0,i).trim(), v=l.slice(i+1).trim(); if(k&&v) o[k]=v; } });
      VoixMoteurs.definirDico(o); msg.textContent='Prononciation enregistrée ('+Object.keys(o).length+' mot'+(Object.keys(o).length>1?'s':'')+').';
    });
    VoixMoteurs.surChangement(rendre); if(window.PiperLocal) PiperLocal.surChangement(rendre);
    rendre();
  })();
