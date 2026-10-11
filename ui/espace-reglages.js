"use strict";
/* ═════════════ RÉGLAGES → ESPACE ═════════════
   Section ajoutée sous « Ambiance » dans ⚙ Réglages : un interrupteur par élément du fond « Espace » (planètes, astéroïdes et comètes, satellites,
   Lune, aurores, Voie lactée et nébuleuses, éclat du Soleil) et des boutons « Aller vers… » (utiles sans la voix : tablette, téléphone). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const E=UI.espace, cfg=document.getElementById('cfg');
  if(!E || !cfg) return;
  const CIBLES=[['terre','Terre'],['soleil','Soleil'],['lune','Lune'],['mercure','Mercure'],['venus','Vénus'],['mars','Mars'],['jupiter','Jupiter'],['saturne','Saturne'],['uranus','Uranus'],['neptune','Neptune'],['iss','ISS']];
  const h=document.createElement('h3'); h.textContent='Espace';
  const b=document.createElement('div'); b.className='esp-reglages';
  b.innerHTML='<div class="hint">Choisis le fond « Espace » dans Apparence. Ici, ce qu’il affiche.</div>'
    +Object.keys(E.ELEMENTS).map(k=>'<label class="ui-chk"><input type="checkbox" data-el="'+k+'"> '+E.ELEMENTS[k]+'</label>').join('')
    +'<div class="ui-lbl">Aller vers</div><div class="esp-vers">'+CIBLES.map(([k,n])=>'<button type="button" data-vers="'+k+'">'+n+'</button>').join('')+'</div>'
    +'<div class="ui-info" data-info="espace"></div>';
  const ref=cfg.querySelector('.amb-reglages')||cfg.querySelector('.ui-reglages');
  if(ref) ref.after(h,b); else (cfg.querySelector('.cfg-top')||cfg.firstElementChild).after(h,b);
  function maj(){
    const el=E.elements(); b.querySelectorAll('input[data-el]').forEach(i=>{ i.checked=!!el[i.dataset.el]; });
    const r=UI.reglages?UI.reglages():{fond:'aucun',palier:0};
    b.querySelector('[data-info="espace"]').textContent=r.fond!=='espace'?'Le fond actuel n’est pas « Espace » : un bouton ci-dessus le sélectionne.':r.palier>=2?'Mode Éco : le fond est une image fixe (Terre, étoiles, Soleil, Lune). Les boutons « Aller vers » donnent juste les faits ; passe en Auto ou Max pour voler.':'Dis « montre-moi Mars », « montre-moi l’ISS » : la caméra y vole, puis revient seule sur la Terre (ou dis « reviens sur la Terre »).';
  }
  b.addEventListener('change',e=>{ const k=e.target.dataset.el; if(k) E.regler(k,e.target.checked); maj(); });
  b.addEventListener('click',e=>{
    const t=e.target.closest('button'); if(!t||!t.dataset.vers) return;
    const c=t.dataset.vers, r=E.executer(c==='terre'?{type:'retour'}:{type:'vers',cible:c});
    cfg.classList.remove('open');                                   // on ferme les Réglages pour voir le vol
    try{ addLine('ray',r); speak(r); }catch(x){}
    maj();
  });
  document.getElementById('gear').addEventListener('click',maj);
  RayleBus.on('ui:reglages',maj);
  maj();
})();
