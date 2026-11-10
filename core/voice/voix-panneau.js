"use strict";
  /* ═════════════ PANNEAU « VOIX DE RAYLÉ » (⚙ Réglages) ═════════════
     Candidates avec « Écouter », choix mémorisé (ou automatique), hauteur, voix du système, dictionnaire de prononciation. Logique : voix-moteurs.js. */
  (function(){
    const liste=document.getElementById('vxListe'); if(!liste||!window.VoixMoteurs) return;
    const $=id=>document.getElementById(id);
    const msg=$('vxMsg'), etat=$('vxEtat'), haut=$('vxHauteur'), hautVal=$('vxHauteurVal'), sys=$('vxSys'), dico=$('vxDico');
    const COULEUR={'prête':'#7bd88f','chargement':'#e8c26a','en échec':'#e06c6c','indisponible':'#8a8f98'};
    const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

    function rendre(){
      const choix=localStorage.getItem('rayle_voix_moteur')||'auto';
      const cands=VoixMoteurs.candidats();
      const actif=VoixMoteurs.actif();
      etat.textContent=(VoixMoteurs.NOMS[actif]||{nom:actif}).nom;
      liste.innerHTML=
        '<label class="chk vx-ligne"><input type="radio" name="vxChoix" value="auto"'+(choix==='auto'?' checked':'')+'> <b>Automatique</b> : la meilleure voix qui fonctionne sur cette machine (testée à l’ouverture)</label>'+
        cands.map(c=>'<div class="vx-ligne"><label class="chk"><input type="radio" name="vxChoix" value="'+c.id+'"'+(choix===c.id?' checked':'')+(c.etat==='indisponible'?'':'')+'> <b>'+esc(c.nom)+'</b> <span style="color:'+(COULEUR[c.etat]||'#8a8f98')+'">● '+c.etat+'</span></label> '+
          '<button type="button" class="ghost" data-ecouter="'+c.id+'"'+(c.etat==='prête'?'':' disabled')+'>Écouter</button>'+
          '<div class="hint">'+esc(c.detail)+(c.raison?' — '+esc(c.raison):'')+(c.test&&c.test.ms?' · test '+(c.test.ms/1000).toFixed(1).replace('.',',')+' s':'')+'</div></div>').join('');
      const h=VoixMoteurs.hauteur(); haut.value=String(h); hautVal.textContent=h===0?'normale':(h>0?'+':'')+h+' %';
      // voix du système classées automatiquement
      const rang=window.VoixCalcul?VoixCalcul.classerVoixSysteme(('speechSynthesis' in window)?speechSynthesis.getVoices():[],true):[];
      const cle=VoixMoteurs.voixSystemeChoisie();
      sys.innerHTML='<option value="">Automatique'+(rang[0]?' → '+esc(rang[0].voix.name)+' ('+rang[0].famille+')':'')+'</option>'+rang.map(r=>'<option value="'+esc(r.voix.voiceURI||r.voix.name)+'"'+((r.voix.voiceURI||r.voix.name)===cle?' selected':'')+'>'+esc(r.voix.name)+' · '+r.famille+'</option>').join('');
      if(document.activeElement!==dico){ const d=VoixMoteurs.dico(); dico.value=Object.keys(d).map(k=>k+' = '+d[k]).join('\n'); }
    }

    liste.addEventListener('change',e=>{ if(e.target.name==='vxChoix'){ VoixMoteurs.choisir(e.target.value); msg.textContent='Voix mémorisée : '+(e.target.value==='auto'?'automatique':(VoixMoteurs.NOMS[e.target.value]||{}).nom)+'.'; } });
    liste.addEventListener('click',async e=>{
      const b=e.target.closest('[data-ecouter]'); if(!b) return;
      const id=b.getAttribute('data-ecouter');
      msg.textContent='Lecture avec '+VoixMoteurs.NOMS[id].nom+'…';
      try{ await speak(VoixCalcul.PHRASE_ESSAI,{moteur:id}); msg.textContent=''; }catch(x){ msg.textContent='✖ '+errMsg(x); }
    });
    haut.addEventListener('input',()=>{ VoixMoteurs.definirHauteur(Number(haut.value)); });
    sys.addEventListener('change',()=>{ VoixMoteurs.choisirVoixSysteme(sys.value); if('speechSynthesis' in window) speechSynthesis.dispatchEvent(new Event('voiceschanged')); });
    $('vxEssai').addEventListener('click',()=>{ msg.textContent='Lecture de la phrase d’essai…'; speak(VoixCalcul.PHRASE_ESSAI).then(()=>{ msg.textContent=''; }); });
    $('vxTester').addEventListener('click',async()=>{ msg.textContent='Test des voix…'; await VoixMoteurs.testerAuto(); msg.textContent='Test terminé.'; });
    dico.addEventListener('change',()=>{
      const o={}; dico.value.split('\n').forEach(l=>{ const i=l.indexOf('='); if(i>0){ const k=l.slice(0,i).trim(), v=l.slice(i+1).trim(); if(k&&v) o[k]=v; } });
      VoixMoteurs.definirDico(o); msg.textContent='Prononciation enregistrée ('+Object.keys(o).length+' mot'+(Object.keys(o).length>1?'s':'')+').';
    });
    VoixMoteurs.surChangement(rendre);
    if('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged',rendre);
    rendre();
  })();
