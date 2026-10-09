"use strict";
/* ═════════════ PANNEAUX HOLOGRAPHIQUES (réutilisables) ═════════════
   Panneaux.ouvrir({id,type,titre,icone,corps,taille,pied,duree,onFermer}) → id
     corps  : texte (échappé), {html:'…'} (HTML déjà sûr), un Node, ou une fonction(el,panneau) qui remplit l'élément
              et peut renvoyer une fonction de nettoyage (ex. détruire une carte)
     taille : 'normal' (colonnes autour de l'entité) | 'large' (au centre : carte, page web)
     pied   : [{texte,url}] liens ouverts dans un nouvel onglet, ou [{texte,clic}] boutons
     duree  : fermeture automatique après N ms (facultatif)
   Panneaux.fermer(id) · fermerTout() · fermerDernier() · liste()
   Par le bus : emit('panneau:ouvrir',{…}), emit('panneau:fermer',{id}), emit('panneaux:fermer-tout')
   Le même cadre (css/hud.css : .hud-cadre, .hud-in) sert aux fenêtres du terminal. */
window.Panneaux=(function(){
  const MAX=8;
  const ouverts=new Map();       // id → {el,nettoyage,onFermer,titre,large,n,timer}
  let wrap=null, colG=null, colD=null, centre=null, compteur=0;
  const racine=()=>document.getElementById('panneaux');
  const esc=t=>String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function structure(){
    if(wrap) return;
    wrap=document.createElement('div'); wrap.className='pn-wrap';
    colG=document.createElement('div'); colG.className='pn-col g';
    colD=document.createElement('div'); colD.className='pn-col d';
    centre=document.createElement('div'); centre.className='pn-centre';
    wrap.append(colG,colD,centre); racine().appendChild(wrap);
  }
  function majEtat(){
    document.body.classList.toggle('avec-panneaux',ouverts.size>0);
    try{ RayleBus.fusion('panneaux',{n:ouverts.size,titres:Array.from(ouverts.values()).map(p=>p.titre)}); }catch(e){}
  }
  function remplir(el,corps,p){
    el.textContent='';
    if(typeof corps==='function'){ const r=corps(el,p); if(typeof r==='function') p.nettoyage=r; }
    else if(corps instanceof Node) el.appendChild(corps);
    else if(corps && typeof corps==='object' && 'html' in corps) el.innerHTML=corps.html;
    else{ String(corps==null?'':corps).split(/\n{2,}/).forEach(t=>{ const q=document.createElement('p'); q.textContent=t; el.appendChild(q); }); }
  }
  function remplirPied(pied,liste){
    pied.textContent='';
    (liste||[]).forEach(b=>{
      if(b.url){ const a=document.createElement('a'); a.href=b.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=b.texte; pied.appendChild(a); }
      else{ const x=document.createElement('button'); x.type='button'; x.className='pn-bouton'; x.textContent=b.texte; x.addEventListener('click',()=>{ try{ b.clic&&b.clic(); }catch(e){} }); pied.appendChild(x); }
    });
  }
  const choisirColonne=()=>colG.children.length<=colD.children.length ? colG : colD;

  function ouvrir(o){
    structure();
    o=o||{};
    const id=o.id||('p'+(++compteur));
    const large=o.taille==='large';
    const existant=ouverts.get(id);
    if(existant){            // même panneau redemandé : on met à jour le contenu
      if(existant.nettoyage){ try{ existant.nettoyage(); }catch(e){} existant.nettoyage=null; }
      existant.titre=o.titre||existant.titre;
      existant.el.querySelector('.pn-tete h2').textContent=existant.titre;
      remplir(existant.el.querySelector('.pn-corps'),o.corps,existant);
      remplirPied(existant.el.querySelector('.pn-pied'),o.pied);
      return id;
    }
    while(ouverts.size>=MAX) fermer(ouverts.keys().next().value);
    if(large) Array.from(ouverts.entries()).forEach(([k,p])=>{ if(p.large) fermer(k); });   // un seul grand panneau à la fois

    const el=document.createElement('section');
    el.className='pn hud-cadre hud-in'+(large?' large':''); el.dataset.id=id; el.dataset.type=o.type||'';
    el.setAttribute('role','dialog'); el.setAttribute('aria-label',o.titre||'Panneau');
    const n=++compteur; el.style.setProperty('--n',n);
    el.innerHTML='<header class="pn-tete"><span class="pn-ico"></span><h2></h2><button type="button" class="pn-x" aria-label="Fermer ce panneau">✕</button></header><div class="pn-corps"></div><footer class="pn-pied"></footer><i class="hud-balayage"></i>';
    el.querySelector('.pn-ico').textContent=o.icone||'◈';
    el.querySelector('h2').textContent=o.titre||'';
    const p={el,nettoyage:null,onFermer:o.onFermer,titre:o.titre||'',large,n,timer:null};
    ouverts.set(id,p);
    remplir(el.querySelector('.pn-corps'),o.corps,p);
    remplirPied(el.querySelector('.pn-pied'),o.pied);
    el.querySelector('.pn-x').addEventListener('click',()=>fermer(id));
    (large?centre:choisirColonne()).appendChild(el);
    if(o.duree) p.timer=setTimeout(()=>fermer(id),o.duree);
    majEtat();
    return id;
  }
  function fermer(id){
    const p=ouverts.get(id); if(!p) return false;
    ouverts.delete(id); clearTimeout(p.timer);
    try{ p.nettoyage&&p.nettoyage(); }catch(e){}
    try{ p.onFermer&&p.onFermer(); }catch(e){}
    p.el.classList.remove('hud-in'); p.el.classList.add('hud-out');
    const fin=()=>{ if(p.el.parentNode) p.el.parentNode.removeChild(p.el); };
    p.el.addEventListener('animationend',fin,{once:true}); setTimeout(fin,500);
    majEtat();
    return true;
  }
  function fermerTout(){ const n=ouverts.size; Array.from(ouverts.keys()).forEach(fermer); return n; }
  function fermerDernier(){ const ids=Array.from(ouverts.keys()); if(!ids.length) return false; return fermer(ids[ids.length-1]); }
  const liste=()=>Array.from(ouverts.entries()).map(([id,p])=>({id,titre:p.titre,type:p.el.dataset.type}));

  RayleBus.on('panneau:ouvrir',ouvrir);
  RayleBus.on('panneau:fermer',d=>fermer(d&&d.id));
  RayleBus.on('panneaux:fermer-tout',fermerTout);
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && ouverts.size && !document.getElementById('cfg').classList.contains('open')) fermerDernier(); });
  return {ouvrir,fermer,fermerTout,fermerDernier,liste,esc};
})();
