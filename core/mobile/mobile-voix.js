"use strict";
/* ═════════════ VOIX, COMMANDES ET GALERIE D'IMAGES DE LA COQUE MOBILE (V8) ═════════════
   Toute demande qui ouvrait une scène de Galaxie ou une fenêtre du PC ouvre ici l'ÉQUIVALENT Jarvis, en plein écran :
     « donne-moi l'actualité en France », « les infos »      → écran Actualités (lecture des titres si on demande de lire / présenter)
     « affiche le terminal », « ouvre le terminal de trading »  → terminal tactile
     « ouvre l'agent », « les positions du jour », « le bilan »   → écran Agents trading
     « ouvre la carte »                                          → carte plate de la Terre ; « réglages » → réglages
     « ouvre la galaxie », « mode galaxie »                      → « Le mode Galaxie est réservé au PC ; ici je reste sur Jarvis. » (et on reste sur Jarvis)
   Branché dans phrase.js par MobileVoix.commande(texte) (absent sur PC : rien ne change). Galerie « montre-moi des photos de… » : plein écran, balayage, auteur + licence + lien toujours visibles. */
(function(){
  const C=window.MobileCalcul, Coque=window.MobileCoque; if(!C||!Coque) return;
  const esc=C.esc, $=id=>document.getElementById(id);
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’'\-]/g,' ').replace(/\s+/g,' ');
  const clic=id=>{ const b=$(id); if(b) b.click(); };

  async function commande(texte){
    const r=C.routeCommande(texte); if(!r) return null;
    const n=' '+norm(texte)+' ';
    if(r.ecran==='galaxie-refus'){ Coque.aller('accueil'); return RayleAppareil.MESSAGE_GALAXIE; }
    if(r.ecran==='agent'){
      Coque.aller('agent');
      const onglet=/ bilan | performance | resultats? /.test(n)?'performance':/ strateg|pourquoi pas plus | pistes? /.test(n)?'strategies':/ graphique /.test(n)?'graphique':'positions';
      if(window.MobileAgent) MobileAgent.aller(onglet);
      const e=window.MobileAgent&&MobileAgent.etat(), P=e&&e.data&&e.data.paquet&&e.data.paquet.positions;
      if(!P) return 'Voici l’agent Kepler. Je charge ses données.';
      const nb=(P.propositions||[]).filter(p=>['en_attente','ouverte'].includes(p.statut)).length;
      return onglet==='performance'?'Voici le bilan de Kepler. '+((P.bilan&&P.bilan.tous&&P.bilan.tous.phrase)||'')
        :nb?'Voici Kepler : '+nb+' position'+(nb>1?'s':'')+' du jour, chacune avec son niveau de preuve. Ce sont des propositions de simulation, jamais des ordres.'
        :'Voici Kepler. Aucune position n’est proposée pour l’instant, et l’écran explique pourquoi.';
    }
    if(r.ecran==='terminal'){ clic('btnOuvrirTerminal'); return 'Voici le terminal.'; }
    if(r.ecran==='carte'){ if(window.HoteModules) HoteModules.ouvrirTerre().catch(()=>{}); return 'Voici la carte du monde.'; }
    if(r.ecran==='reglages'){ clic('gear'); return 'Voici les réglages.'; }
    if(r.ecran==='actus'){
      const portee=/ monde | international | planete /.test(n)?'monde':'france';
      if(window.MobileActus) MobileActus.aller(portee);
      const lire=/ (lis|lire|presente|presentes|annonce|raconte|dis|donne)( moi)? /.test(n)&&!/ (affiche|montre)( moi)? /.test(n);
      if(lire&&window.MobileActus){ await new Promise(ok=>setTimeout(ok,900)); await MobileActus.lire(); return 'Voilà pour les titres. Touche « Approfondir » sur une carte pour en savoir plus.'; }
      return portee==='monde'?'Voici l’actualité dans le monde.':'Voici l’actualité en France.';
    }
    return null;
  }

  /* ───── galerie d'images plein écran ───── */
  function ouvrirGalerie(res,images){
    let i=0;
    const f=Coque.feuille({titre:'Images · '+((res.sujet&&res.sujet.titre)||''),plein:true});
    f.corps.style.padding='0';
    f.corps.innerHTML='<div class="m-gal"><div class="m-gal-pistes"></div><div class="m-gal-leg"></div><div class="m-gal-pts"></div></div>';
    const pistes=f.corps.querySelector('.m-gal-pistes'), leg=f.corps.querySelector('.m-gal-leg'), pts=f.corps.querySelector('.m-gal-pts');
    pistes.innerHTML=images.map((im,k)=>'<figure class="m-gal-f" data-k="'+k+'"><img alt="'+esc(im.titre)+'" '+(k<2?'':'loading="lazy" ')+'decoding="async" referrerpolicy="no-referrer" src="'+esc(im.grande||im.miniature)+'"></figure>').join('');
    pts.innerHTML=images.map((_,k)=>'<i data-k="'+k+'"></i>').join('');
    const lien=(u,t)=>u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(t)+'</a>':esc(t);
    const maj=()=>{ const im=images[i]; leg.innerHTML='<b>'+esc(im.titre)+'</b><span>Auteur : '+esc(im.auteur)+'</span><span>Licence : '+lien(im.licence_url,im.licence)+' · '+lien(im.source_url,'voir la source')+'</span>';
      pistes.style.transform='translateX('+(-i*100)+'%)'; pts.querySelectorAll('i').forEach((p,k)=>{ if(k===i) p.setAttribute('data-actif',''); else p.removeAttribute('data-actif'); }); };
    let x0=null; f.corps.addEventListener('pointerdown',ev=>{ if(!ev.target.closest('a')) x0=ev.clientX; });
    f.corps.addEventListener('pointerup',ev=>{ if(x0==null) return; const j=C.carteApresGeste(i,images.length,ev.clientX-x0); x0=null; if(j!==i){ i=j; maj(); Coque.vibrer(6); } });
    maj(); return f;
  }
  window.MobileGalerie={ouvrir:ouvrirGalerie};
  window.MobileVoix={commande};
})();
