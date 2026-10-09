"use strict";
  /* ═════════════ FENÊTRE HUD DE LA RÉPONSE ═════════════
     À chaque réponse parlée (hors commandes du terminal), un panneau s'anime avec les POINTS CLÉS (pas tout le texte) :
     les chiffres et faits d'abord, 4 lignes au plus. Il se ferme tout seul (selon la longueur), avec « ferme ça » ou la croix.
     Les barres du haut suivent le niveau de la voix (celui de l'entité). Aucun appel réseau : tout est extrait ici. */
  const REP_MAX=4, REP_LIGNE=150;
  function repPoints(reponse){
    const txt=String(reponse||'').replace(/\s+/g,' ').trim();
    const phrases=(txt.match(/[^.!?…]+(?:[.!?…]+|$)/g)||[]).map(x=>x.trim()).filter(x=>x.replace(/[^A-Za-zÀ-ÿ0-9]/g,'').length>=8);
    if(phrases.length<=2) return phrases;
    const note=(x,i)=>(/\d/.test(x)?3:0)+(/[%€$]|\b(?:points?|euros?|dollars?|degres?|km|heures?|minutes?)\b/i.test(x)?1:0)+(/\b[A-ZÉÈÀ][a-zà-ÿ]{2,}/.test(x.slice(1))?1:0)+(i===0?2:0)+(i===phrases.length-1&&/\?$/.test(x)?1:0)-(x.length>220?1:0);
    return phrases.map((x,i)=>({x,i,n:note(x,i)})).sort((a,b)=>b.n-a.n||a.i-b.i).slice(0,REP_MAX).sort((a,b)=>a.i-b.i).map(o=>o.x);
  }
  function montrerReponse(question,reponse){
    if(RayleBus.demander('vue')==='terminal') return;     // pas de fenêtre par-dessus le terminal
    const pts=repPoints(reponse);
    if(!pts.length || String(reponse).length<25) return;
    const duree=Math.max(14000,Math.min(45000,String(reponse).length*75+8000));
    Panneaux.ouvrir({id:'reponse',type:'reponse',icone:'◈',titre:'Raylé · points clés',duree,corps:(el)=>{
      el.textContent='';
      const onde=document.createElement('div'); onde.className='rep-onde'; onde.setAttribute('aria-hidden','true');
      for(let i=0;i<9;i++){ const b=document.createElement('i'); b.style.setProperty('--i',i); onde.appendChild(b); }
      el.appendChild(onde);
      const ul=document.createElement('ul'); ul.className='rep-pts';
      pts.forEach((p,i)=>{
        const li=document.createElement('li'); li.style.setProperty('--d',(0.15+i*0.28)+'s');
        li.textContent=p.length>REP_LIGNE?p.slice(0,REP_LIGNE).replace(/\s+\S*$/,'')+'…':p;
        ul.appendChild(li);
      });
      el.appendChild(ul);
      let raf=0, stop=false;
      const boucle=()=>{
        if(stop) return;
        let a=0; try{ a=Entite.info().amp||0; }catch(e){}
        onde.style.setProperty('--amp',Math.min(1,a).toFixed(2));
        raf=requestAnimationFrame(boucle);
      };
      boucle();
      return ()=>{ stop=true; cancelAnimationFrame(raf); };
    }});
  }
