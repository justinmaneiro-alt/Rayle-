"use strict";
/* ═════════════ RÉGLAGES → AMBIANCE ═════════════
   Section ajoutée sous « Apparence » dans ⚙ Réglages : mode (Auto / Manuel / Off), ambiance forcée (mode Manuel), thème automatique
   (on/off, durée de priorité du choix manuel, thème de chaque moment et de chaque météo), lieu de la météo (nom, ou « Ma position »),
   intensité des effets, respect de « réduire les animations ». Tout passe par RayleUI.ambiance.regler(…). */
(function(){
  const UI=window.RayleUI=window.RayleUI||{};
  const A=UI.ambiance, cfg=document.getElementById('cfg');
  if(!A || !cfg) return;
  const THEMES=UI.THEMES||{};
  const MODES={auto:'Auto',manuel:'Manuel',off:'Off'};
  const CASES={aube:'Aube',jour:'Jour',crepuscule:'Crépuscule',nuit:'Nuit',pluie:'Pluie',orage:'Orage',neige:'Neige',brouillard:'Brouillard'};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const opts=(obj,sel)=>Object.keys(obj).map(k=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+esc(typeof obj[k]==='string'?obj[k]:obj[k].nom)+'</option>').join('');

  const h=document.createElement('h3'); h.textContent='Ambiance';
  const b=document.createElement('div'); b.className='amb-reglages';
  b.innerHTML=
    '<div class="ui-lbl">Mode</div><div class="ui-seg" role="group" data-k="mode">'+Object.keys(MODES).map(m=>'<button type="button" data-v="'+m+'" aria-pressed="false">'+MODES[m]+'</button>').join('')+'</div>'
    +'<div data-bloc="manuel"><div class="ui-lbl">Ambiance forcée</div><select data-k="preset" aria-label="Ambiance forcée">'+opts(A.NOM_PRESET)+'</select></div>'
    +'<label class="ui-chk"><input type="checkbox" data-k="themeAuto"> Le thème de couleurs suit l\'ambiance (moment de la journée, météo)</label>'
    +'<div class="ui-lbl">Mon choix de thème reste prioritaire pendant</div><select data-k="themeHeures" aria-label="Durée de priorité du thème choisi">'
      +[1,3,6,12,24].map(n=>'<option value="'+n+'">'+n+(n===1?' heure':' heures')+'</option>').join('')+'</select>'
    +'<div class="ui-lbl">Thème de chaque ambiance</div><div class="amb-map">'
      +Object.keys(CASES).map(c=>'<label>'+CASES[c]+'<select data-map="'+c+'" aria-label="Thème pour '+CASES[c]+'">'+opts(THEMES)+'</select></label>').join('')+'</div>'
    +'<div class="ui-lbl">Lieu de la météo</div><div class="amb-lieu"><input type="text" data-k="lieu" placeholder="Ville (par défaut : Castres)" aria-label="Lieu de la météo" autocomplete="off">'
      +'<button type="button" data-act="chercher">Chercher</button><button type="button" data-act="position">Ma position</button></div>'
    +'<div class="ui-info" data-info="lieu"></div>'
    +'<div class="ui-lbl">Intensité des effets : <b class="ui-taille-val" data-val="fx"></b></div><input type="range" class="ui-range" min="0" max="100" step="5" data-k="fx" aria-label="Intensité des effets d\'ambiance">'
    +'<label class="ui-chk"><input type="checkbox" data-k="respectReduit"> Respecter « réduire les animations » de l\'appareil (effets figés, pas d\'éclairs)</label>'
    +'<div class="amb-maintenant" data-info="maintenant" aria-live="polite"></div>';
  const ref=cfg.querySelector('.ui-reglages');
  if(ref) ref.after(h,b); else (cfg.querySelector('.cfg-top')||cfg.firstElementChild).after(h,b);
  const q=s=>b.querySelector(s);

  function maj(){
    const r=A.reglages(), e=A.etat();
    b.querySelectorAll('.ui-seg[data-k="mode"] button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.v===r.mode)));
    q('[data-bloc="manuel"]').hidden=r.mode!=='manuel';
    const man=A.manuel(); const p=man&&man.patch;
    const pr=Object.keys(A.PRESETS).find(k=>p&&Object.keys(A.PRESETS[k]).every(c=>p[c]===A.PRESETS[k][c]));
    if(pr) q('select[data-k="preset"]').value=pr;
    q('input[data-k="themeAuto"]').checked=!!r.themeAuto;
    q('select[data-k="themeHeures"]').value=String(r.themeHeures);
    b.querySelectorAll('select[data-map]').forEach(s=>{ s.value=r.mapping[s.dataset.map]; });
    q('input[data-k="fx"]').value=String(r.fx); q('[data-val="fx"]').textContent=r.fx+' %';
    q('input[data-k="respectReduit"]').checked=!!r.respectReduit;
    const l=A.lieu();
    q('[data-info="lieu"]').textContent='Lieu utilisé : '+l.nom+' ('+(l.source==='position'?'dernière position autorisée':l.source==='réglages'?'lieu enregistré':'lieu par défaut')+')'+(A.erreur()?' · météo indisponible, dernière connue conservée':'')+'.';
    q('[data-info="maintenant"]').textContent=(r.mode==='off'?'Ambiance désactivée. ':'Maintenant : ')+A.description()
      +(man&&man.fin?' · retour auto à '+new Date(man.fin).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'')+(e.source==='manuel'?' (forcée)':'');
  }
  b.addEventListener('click',async ev=>{
    const t=ev.target.closest('button'); if(!t) return;
    if(t.dataset.v) A.regler('mode',t.dataset.v);
    else if(t.dataset.act==='chercher'){
      const v=q('input[data-k="lieu"]').value.trim(); if(!v){ A.regler('lieu',null); return maj(); }
      q('[data-info="lieu"]').textContent='Recherche de « '+v+' »…';
      try{ const lx=await A.chercherLieu(v); if(lx){ A.regler('lieu',lx); q('input[data-k="lieu"]').value=''; } else q('[data-info="lieu"]').textContent='Je ne trouve pas « '+v+' ».'; }
      catch(e){ q('[data-info="lieu"]').textContent='Recherche impossible : '+(e&&e.message||e); return; }
    }else if(t.dataset.act==='position'){
      if(!navigator.geolocation){ q('[data-info="lieu"]').textContent='Position indisponible sur cet appareil.'; return; }
      q('[data-info="lieu"]').textContent='Demande de la position…';
      navigator.geolocation.getCurrentPosition(p=>{ A.noterPosition({lat:p.coords.latitude,lon:p.coords.longitude}); maj(); },()=>{ q('[data-info="lieu"]').textContent='Position refusée : le lieu enregistré reste utilisé.'; },{timeout:9000,maximumAge:300000});
      return;
    }
    maj();
  });
  b.addEventListener('change',ev=>{
    const t=ev.target, k=t.dataset.k;
    if(t.dataset.map){ A.regler('mapping',{[t.dataset.map]:t.value}); }
    else if(k==='preset') A.forcer(Object.assign({},A.PRESETS[t.value]));
    else if(k==='themeAuto'||k==='respectReduit') A.regler(k,t.checked);
    else if(k==='themeHeures') A.regler(k,+t.value);
    maj();
  });
  q('input[data-k="fx"]').addEventListener('input',e=>{ A.regler('fx',+e.target.value); maj(); });
  q('input[data-k="lieu"]').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); q('[data-act="chercher"]').click(); } });
  document.getElementById('gear').addEventListener('click',maj);
  RayleBus.on('ambiance',()=>{ if(cfg.classList.contains('open')) maj(); });
  maj();
})();
