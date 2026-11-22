"use strict";
/* ═════════════ RAPPORT DÉTAILLÉ DE RAYLE (v10) : l'analyse complète à l'écran, exportable ═════════════
   Quand Rayle écrit un détail long (analyse complète, marché en global, scénarios), le cerveau envoie l'événement « rayle:rapport » : ce panneau l'affiche (défilable, au-dessus du dock),
   avec l'heure des données, le rappel « aide à la décision », et les boutons Copier · Télécharger (.md) · Imprimer · Fermer. Il n'interrompt pas la voix et ne bloque rien (pointer-events seulement sur le panneau). */
(function(){
  let el=null, courant=null;
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const heureFr=iso=>{ try{ return new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'}).format(new Date(iso)); }catch(e){ return iso; } };
  /* texte → HTML simple : titres « 1) … », listes « - … », gras **…** */
  function html(t){
    return String(t).split('\n').map(l=>{ const s=l.trim(); if(!s) return ''; const g=x=>esc(x).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
      if(/^#{1,3}\s/.test(s)) return '<h4>'+g(s.replace(/^#+\s*/,''))+'</h4>'; if(/^[-*•]\s/.test(s)) return '<li>'+g(s.replace(/^[-*•]\s*/,''))+'</li>'; return '<p>'+g(s)+'</p>'; }).join('').replace(/(<li>.*?<\/li>)+/g,m=>'<ul>'+m+'</ul>');
  }
  function markdown(r){ return '# Rapport de Rayle\n\n'+'Question : '+r.question+'\n\nDonnées lues le '+heureFr(r.heure)+' (heure de Paris).\n\n'+r.texte+'\n\n---\nAide à la décision : c’est toi qui décides. Rapport généré par Rayle à partir des données de l’application.\n'; }
  function creer(){
    el=document.createElement('section'); el.id='ra-rapport'; el.hidden=true; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Rapport de Rayle');
    el.innerHTML='<header><b>Rapport de Rayle</b><span class="rr-h"></span><span class="rr-b"><button type="button" data-a="copier">Copier</button><button type="button" data-a="telecharger">Télécharger</button><button type="button" data-a="imprimer">Imprimer</button><button type="button" data-a="fermer" aria-label="Fermer">✕</button></span></header><div class="rr-corps"></div><footer>Aide à la décision : c’est toi qui décides.</footer>';
    document.body.appendChild(el);
    el.addEventListener('click',async e=>{ const b=e.target.closest('[data-a]'); if(!b||!courant) return; const a=b.getAttribute('data-a');
      if(a==='fermer'){ el.hidden=true; }
      else if(a==='copier'){ try{ await navigator.clipboard.writeText(markdown(courant)); b.textContent='Copié ✓'; setTimeout(()=>{ b.textContent='Copier'; },1500); }catch(x){ b.textContent='Copie refusée'; } }
      else if(a==='telecharger'){ const u=URL.createObjectURL(new Blob([markdown(courant)],{type:'text/markdown'})), l=document.createElement('a'); l.href=u; l.download='rapport-rayle-'+courant.heure.slice(0,16).replace(/[:T]/g,'-')+'.md'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(()=>URL.revokeObjectURL(u),2000); }
      else if(a==='imprimer'){ const w=window.open('','_blank'); if(w){ w.document.write('<title>Rapport de Rayle</title><body style="font:14px/1.5 system-ui;max-width:760px;margin:24px auto">'+'<h2>Rapport de Rayle</h2><p><i>'+esc(courant.question)+' — données lues le '+esc(heureFr(courant.heure))+'</i></p>'+html(courant.texte)+'<hr><p><i>Aide à la décision : c’est toi qui décides.</i></p>'); w.document.close(); w.focus(); setTimeout(()=>w.print(),300); } }
    });
  }
  function montrer(r){ if(!el) creer(); courant=r; el.querySelector('.rr-h').textContent=' · données du '+heureFr(r.heure); el.querySelector('.rr-corps').innerHTML=html(r.texte); el.querySelector('.rr-corps').scrollTop=0; el.hidden=false; }
  window.addEventListener('rayle:rapport',e=>{ try{ if(e.detail&&e.detail.texte) montrer(e.detail); }catch(x){} });
  window.RapportRayle={montrer,fermer:()=>{ if(el) el.hidden=true; },ouvert:()=>!!(el&&!el.hidden),courant:()=>courant,markdown};
})();
