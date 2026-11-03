"use strict";
/* ═════════════ ÉCRAN « MARCHÉS » DE LA COQUE MOBILE ═════════════
   Téléphone et tablette : les cotations (mêmes données que la carte « Marchés » de l'accueil) et un grand bouton qui ouvre le TERMINAL
   (graphique TradingView, MA200, RSI, dashboard multi-timeframes, volume, carnet d'ordres, actualités, calendrier, COT, notes). Affichage seulement : aucun ordre. */
(function(){
  const C=window.MobileCalcul, Coque=window.MobileCoque; if(!C||!Coque) return;
  const esc=C.esc;
  function monter(el){
    el.innerHTML='<div class="m-titre"><h1>Marchés</h1><small>cotations</small></div>'
      +'<section class="m-carte m-large" data-carte="marche"><h3>Cotations <em data-m-et></em></h3><div data-z><div class="m-squelette"><i></i><i></i><i></i></div></div></section>'
      +'<div class="m-tuiles"><button type="button" class="m-tuile" data-terminal><span><b>Ouvrir le terminal</b><small>Graphique, indicateurs, volume, carnet, actualités, calendrier</small></span></button></div>';
    el.querySelector('[data-terminal]').addEventListener('click',()=>{ Coque.vibrer(8); const b=document.getElementById('btnOuvrirTerminal'); if(b) b.click(); });
    if(window.MobileMarche){
      const zone=el.querySelector('[data-z]');
      MobileMarche.lire().then(lignes=>{ zone.innerHTML=lignes.map(q=>'<div class="m-m"><b>'+esc(q.nom)+'</b><span class="m-p">'+(q.vide?'indisponible':esc(String(q.prix)))+'</span></div>').join(''); }).catch(()=>{ zone.innerHTML='<p class="m-doux">Cotations indisponibles.</p>'; });
    }
  }
  Coque.enregistrer('marches',{monter});
})();
