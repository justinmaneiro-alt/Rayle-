"use strict";
/* ═════════════ GRAPHIQUE TACTILE DE KEPLER (V8) ═════════════
   TradingView Lightweight Charts v5 (déjà copié dans terminal/vendor, licence Apache 2.0, chargé seulement à l'ouverture du graphique) : bougies M15 / H1 / H4, PINCER pour zoomer, GLISSER pour déplacer,
   viseur au toucher long (valeurs OHLC, volume et delta sous le doigt), mode plein écran paysage. Données : klines Binance (volume et volume acheteur agressif = delta RÉEL), via MobileMarche.
   Superpositions (réglables) : positions de Kepler (zone d'entrée, entrée, stop, cibles), zones diamant, VWAP du jour, POC et profil de volume des bougies visibles, volume, delta.
   TOUCHE LONGUE (≈ 0,7 s) = « marquer ici » : feuille pour dire « j'aurais pris ça » / « pas bon » (entrée, stop, cible), transmise au service Kepler pour de nouvelles hypothèses testées ensuite sur d'autres données.
   Aucun ordre n'existe ici. Les murs du carnet d'ordres (carte de liquidité enregistrée) ne sont affichés que sur le PC : la zone diamant en reprend la confluence. */
(function(){
  const C=window.MobileCalcul; if(!C) return;
  const esc=C.esc;
  const COUL={fond:'#05080c',texte:'#9db0bb',grille:'rgba(143,208,227,.05)',bord:'rgba(143,208,227,.18)',haut:'#2fd18b',bas:'#ff5d6e',cyan:'#8fd0e3',sable:'#c9b27a',vwap:'#f9f871',poc:'#b78cff',alerte:'#e9a23b'};
  const OPTIONS_DEFAUT={volume:true,delta:false,vwap:true,poc:true,profil:true,zones:true,positions:true};
  const LIBELLES={volume:'Volume',delta:'Delta',vwap:'VWAP',poc:'POC',profil:'Profil',zones:'💎 Zones',positions:'Positions'};
  let promesse=null;
  function bibliotheque(){
    if(window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
    if(promesse) return promesse;
    return promesse=new Promise((ok,ko)=>{ const s=document.createElement('script'); s.async=true; s.src=new URL('terminal/vendor/lightweight-charts.js',document.baseURI).href;
      s.onload=()=>window.LightweightCharts?ok(window.LightweightCharts):ko(new Error('bibliothèque de graphique vide')); s.onerror=()=>{ promesse=null; ko(new Error('bibliothèque de graphique introuvable')); }; document.head.appendChild(s); });
  }
  const lire=k=>{ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }, ecrire=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  const temps=ms=>Math.floor(ms/1000);

  async function creer(racine,{actif='BTC',tf='M15',vue=null,surMarquer=null}={}){
    const L=await bibliotheque();
    racine.classList.add('m-graphe'); racine.innerHTML='<div class="m-graphe-barre"><div class="m-graphe-tf" role="group" aria-label="Unité de temps"></div><button type="button" class="m-graphe-plein-b" aria-label="Plein écran paysage">⤢</button></div>'
      +'<div class="m-graphe-chips" role="group" aria-label="Superpositions"></div><div class="m-graphe-zone"><div class="m-graphe-chart"></div><canvas class="m-graphe-sur" aria-hidden="true"></canvas><div class="m-graphe-legende" aria-live="off"></div><div class="m-graphe-etat" hidden></div></div>'
      +'<p class="m-faible m-graphe-aide">Pince pour zoomer, glisse pour déplacer, touche longue pour marquer ici. Données Binance (volume et delta réels). Simulation : aucun ordre.</p>';
    const E={actif,tf,options:{...OPTIONS_DEFAUT,...(lire('rayle_m_graphe_options')||{})},bougies:[],vue,position:null,lignes:[],minuterie:null,detruit:false};
    const zone=racine.querySelector('.m-graphe-zone'), cont=racine.querySelector('.m-graphe-chart'), sur=racine.querySelector('.m-graphe-sur'), leg=racine.querySelector('.m-graphe-legende'), etat=racine.querySelector('.m-graphe-etat');
    const chart=L.createChart(cont,{autoSize:true,layout:{background:{type:'solid',color:COUL.fond},textColor:COUL.texte,fontSize:12,attributionLogo:false},grid:{vertLines:{color:COUL.grille},horzLines:{color:COUL.grille}},
      rightPriceScale:{borderColor:COUL.bord,scaleMargins:{top:.06,bottom:.22}},timeScale:{borderColor:COUL.bord,timeVisible:true,secondsVisible:false,rightOffset:4,barSpacing:7},
      crosshair:{mode:L.CrosshairMode.Normal,vertLine:{color:'rgba(143,208,227,.5)',labelBackgroundColor:'#1b2b38'},horzLine:{color:'rgba(143,208,227,.5)',labelBackgroundColor:'#1b2b38'}},
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},trackingMode:{exitMode:L.TrackingModeExitMode?L.TrackingModeExitMode.OnNextTap:1},localization:{locale:'fr-FR'}});
    const bougies=chart.addSeries(L.CandlestickSeries,{upColor:COUL.haut,downColor:COUL.bas,wickUpColor:COUL.haut,wickDownColor:COUL.bas,borderVisible:false});
    const vol=chart.addSeries(L.HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'vol',lastValueVisible:false,priceLineVisible:false});
    chart.priceScale('vol').applyOptions({scaleMargins:{top:.84,bottom:0}});
    const delta=chart.addSeries(L.HistogramSeries,{priceScaleId:'delta',lastValueVisible:false,priceLineVisible:false,visible:false});
    chart.priceScale('delta').applyOptions({scaleMargins:{top:.84,bottom:0}});
    const vwapS=chart.addSeries(L.LineSeries,{color:COUL.vwap,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});

    /* ── commandes de la barre ── */
    const barreTf=racine.querySelector('.m-graphe-tf'), chips=racine.querySelector('.m-graphe-chips');
    barreTf.innerHTML=['M15','H1','H4'].map(t=>'<button type="button" data-tf="'+t+'"'+(t===tf?' aria-pressed="true"':'')+'>'+t+'</button>').join('');
    chips.innerHTML=Object.keys(LIBELLES).map(k=>'<button type="button" data-opt="'+k+'" aria-pressed="'+(E.options[k]?'true':'false')+'">'+esc(LIBELLES[k])+'</button>').join('');
    barreTf.addEventListener('click',ev=>{ const b=ev.target.closest('[data-tf]'); if(b) definirTf(b.dataset.tf); });
    chips.addEventListener('click',ev=>{ const b=ev.target.closest('[data-opt]'); if(!b) return; const k=b.dataset.opt; E.options[k]=!E.options[k]; b.setAttribute('aria-pressed',E.options[k]?'true':'false'); ecrire('rayle_m_graphe_options',E.options); appliquerOptions(); });

    /* ── données ── */
    function rempli(){
      const b=E.bougies; bougies.setData(b.map(x=>({time:temps(x[0]),open:x[1],high:x[2],low:x[3],close:x[4]})));
      vol.setData(b.map(x=>({time:temps(x[0]),value:x[5]||0,color:x[4]>=x[1]?'rgba(47,209,139,.45)':'rgba(255,93,110,.45)'})));
      delta.setData(b.map(x=>{ const d=C.deltaBougie(x); return d==null?{time:temps(x[0])}:{time:temps(x[0]),value:d,color:d>=0?'rgba(47,209,139,.7)':'rgba(255,93,110,.7)'}; }));
      vwapS.setData(vwapDuJour(b)); appliquerOptions(); dessiner();
    }
    function vwapDuJour(b){ const out=[]; let pv=0,v=0,jour=null; for(const x of b){ const j=Math.floor(x[0]/86400e3); if(j!==jour){ jour=j; pv=0; v=0; } const vol_=x[5]; if(Number.isFinite(vol_)&&vol_>0){ pv+=(x[2]+x[3]+x[4])/3*vol_; v+=vol_; } if(v>0) out.push({time:temps(x[0]),value:pv/v}); } return out; }
    function appliquerOptions(){
      vol.applyOptions({visible:E.options.volume&&!E.options.delta}); delta.applyOptions({visible:E.options.delta}); vwapS.applyOptions({visible:E.options.vwap});
      lignes(); dessiner();
    }
    function bougiesVisibles(){ const r=chart.timeScale().getVisibleRange(); if(!r) return E.bougies.slice(-120); return E.bougies.filter(x=>temps(x[0])>=r.from&&temps(x[0])<=r.to); }

    /* ── lignes de prix : positions, zones diamant, POC ── */
    function lignes(){
      for(const l of E.lignes) try{ bougies.removePriceLine(l); }catch(e){}
      E.lignes=[]; const ajouter=(prix,couleur,titre,style=0)=>{ if(Number.isFinite(prix)) E.lignes.push(bougies.createPriceLine({price:prix,color:couleur,lineWidth:1,lineStyle:style,axisLabelVisible:true,title:titre})); };
      if(E.options.positions&&E.position){ const p=E.position; ajouter(p.entree,COUL.cyan,'entrée'); ajouter(p.stop,COUL.bas,'stop',2); (p.cibles||[]).forEach((c,i)=>ajouter(c,COUL.haut,'cible '+(i+1),2)); }
      if(E.options.zones&&E.vue&&E.vue.zonesDiamant&&E.vue.zonesDiamant[E.actif]) for(const z of E.vue.zonesDiamant[E.actif]) if(z.tf===E.tf||!z.tf) ajouter(z.niveau,COUL.sable,'💎 '+(z.cote==='support'?'support':'résistance'),1);
      if(E.options.poc){ const pv=C.profilVolume(bougiesVisibles(),24); if(pv) ajouter(pv.poc,COUL.poc,'POC',1); }
    }

    /* ── calque : zone d'entrée + profil de volume ── */
    function dessiner(){
      const w=cont.clientWidth,h=cont.clientHeight; if(!w||!h) return; const dpr=window.devicePixelRatio||1;
      if(sur.width!==Math.round(w*dpr)||sur.height!==Math.round(h*dpr)){ sur.width=Math.round(w*dpr); sur.height=Math.round(h*dpr); sur.style.width=w+'px'; sur.style.height=h+'px'; }
      const g=sur.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,w,h);
      if(E.options.profil){ const pv=C.profilVolume(bougiesVisibles(),28); if(pv){ const largeur=w*.2; for(const c of pv.cases){ const y1=bougies.priceToCoordinate(c.prix+pv.pas/2), y2=bougies.priceToCoordinate(c.prix-pv.pas/2); if(y1==null||y2==null) continue; g.fillStyle=c.prix===pv.poc||Math.abs(c.prix-pv.poc)<pv.pas/2?'rgba(183,140,255,.35)':'rgba(143,208,227,.16)'; g.fillRect(w-62-c.part*largeur,Math.min(y1,y2)+1,c.part*largeur,Math.max(2,Math.abs(y2-y1)-2)); } } }
      const p=E.position; if(E.options.positions&&p&&p.zone){ const y1=bougies.priceToCoordinate(p.zone[1]), y2=bougies.priceToCoordinate(p.zone[0]); if(y1!=null&&y2!=null){ g.fillStyle=p.sens>0?'rgba(47,209,139,.14)':'rgba(255,93,110,.14)'; g.fillRect(0,Math.min(y1,y2),w-62,Math.max(3,Math.abs(y2-y1))); } }
    }
    let rafD=0; const planifier=()=>{ if(rafD) return; rafD=requestAnimationFrame(()=>{ rafD=0; if(!E.detruit) dessiner(); }); };
    chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{ planifier(); clearTimeout(E.tPoc); E.tPoc=setTimeout(()=>{ if(!E.detruit&&E.options.poc) lignes(); },250); });
    new ResizeObserver(planifier).observe(cont);

    /* ── légende sous le doigt ── */
    chart.subscribeCrosshairMove(p=>{
      if(!p||!p.time||!p.seriesData){ leg.textContent=''; return; }
      const d=p.seriesData.get(bougies); if(!d){ leg.textContent=''; return; }
      const b=E.bougies.find(x=>temps(x[0])===p.time), dl=b?C.deltaBougie(b):null;
      leg.innerHTML='<b>'+esc(E.actif)+' '+esc(E.tf)+'</b> '+new Date(p.time*1000).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'<br>O '+C.prix(d.open)+' H '+C.prix(d.high)+' B '+C.prix(d.low)+' F '+C.prix(d.close)
        +(b&&b[5]!=null?'<br>Vol '+Math.round(b[5]).toLocaleString('fr-FR')+(dl!=null?' · Δ '+(dl>=0?'+':'')+Math.round(dl).toLocaleString('fr-FR'):''):'');
    });

    /* ── touche longue : marquer ici ── */
    let lp=null;
    zone.addEventListener('pointerdown',ev=>{ if(ev.pointerType==='mouse'&&ev.button!==0) return; if(!ev.isPrimary) return; const r=zone.getBoundingClientRect(); lp={x:ev.clientX,y:ev.clientY,rx:ev.clientX-r.left,ry:ev.clientY-r.top,t:setTimeout(()=>{ if(!lp) return; const t=chart.timeScale().coordinateToTime(lp.rx), prix=bougies.coordinateToPrice(lp.ry); lp=null; if(t&&Number.isFinite(prix)&&surMarquer){ if(navigator.vibrate) try{ navigator.vibrate(18); }catch(e){} surMarquer({actif:E.actif,tf:E.tf,t:t*1000,prix:+prix.toFixed(prix>1000?1:prix>10?3:5)}); } },700)}; });
    const annuler=()=>{ if(lp){ clearTimeout(lp.t); lp=null; } };
    zone.addEventListener('pointermove',ev=>{ if(lp&&Math.hypot(ev.clientX-lp.x,ev.clientY-lp.y)>10) annuler(); });
    zone.addEventListener('pointerup',annuler); zone.addEventListener('pointercancel',annuler);

    /* ── chargement et rafraîchissement ── */
    function message(t){ etat.hidden=!t; etat.innerHTML=t?esc(t)+' <button type="button" class="m-bouton" data-r>Réessayer</button>':''; }
    etat.addEventListener('click',ev=>{ if(ev.target.closest('[data-r]')) charger(true); });
    async function charger(){
      message(''); zone.classList.add('m-charge');
      try{ E.bougies=await MobileMarche.bougies(E.actif,E.tf,500); rempli(); chart.timeScale().fitContent(); chart.timeScale().scrollToPosition(4,false); const n=Math.min(E.bougies.length,110); chart.timeScale().setVisibleLogicalRange({from:E.bougies.length-n,to:E.bougies.length+4}); }
      catch(e){ message(C.messageErreur(e)); }
      zone.classList.remove('m-charge');
    }
    async function actualiser(){
      if(E.detruit||document.hidden||!E.bougies.length) return;
      try{ const nouv=await MobileMarche.bougies(E.actif,E.tf,3); for(const x of nouv){ const t=temps(x[0]); const i=E.bougies.findIndex(y=>y[0]===x[0]); if(i>=0) E.bougies[i]=x; else E.bougies.push(x);
          bougies.update({time:t,open:x[1],high:x[2],low:x[3],close:x[4]}); vol.update({time:t,value:x[5]||0,color:x[4]>=x[1]?'rgba(47,209,139,.45)':'rgba(255,93,110,.45)'}); const d=C.deltaBougie(x); if(d!=null) delta.update({time:t,value:d,color:d>=0?'rgba(47,209,139,.7)':'rgba(255,93,110,.7)'}); }
        vwapS.setData(vwapDuJour(E.bougies)); planifier(); }catch(e){ /* on garde l'affichage : la prochaine lecture réessaiera */ }
    }
    const cadence=()=>document.hidden||racine.offsetParent===null?60000:15000;
    const boucle=()=>{ if(E.detruit) return; E.minuterie=setTimeout(async()=>{ await actualiser(); boucle(); },cadence()); }; boucle();

    function definirTf(t){ E.tf=t; barreTf.querySelectorAll('[data-tf]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tf===t?'true':'false')); charger(); }
    function definirActif(a){ E.actif=a; charger(); }
    function afficherPosition(carte){
      E.position=carte?{entree:carte.entree,stop:carte.stop,cibles:carte.cibles,zone:carte.zone,sens:carte.sens==='achat'?1:-1}:null;
      lignes(); dessiner();
      if(carte&&E.bougies.length){ const niveaux=[carte.entree,carte.stop,...(carte.cibles||[])].filter(Number.isFinite); const b=E.bougies.slice(-110); const hi=Math.max(...b.map(x=>x[2]),...niveaux), lo=Math.min(...b.map(x=>x[3]),...niveaux); try{ bougies.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:lo,maxValue:hi}})}); }catch(e){} }
      else try{ bougies.applyOptions({autoscaleInfoProvider:undefined}); }catch(e){}
    }
    const definirVue=v=>{ E.vue=v; lignes(); };
    function plein(){
      const actif_=racine.classList.toggle('m-graphe-plein-actif'); document.documentElement.classList.toggle('m-graphe-ouvert',actif_);
      try{ if(actif_){ if(racine.requestFullscreen) racine.requestFullscreen().catch(()=>{}); if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('landscape').catch(()=>{}); } else { if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock(); } }catch(e){}
      setTimeout(()=>{ planifier(); },300);
    }
    racine.querySelector('.m-graphe-plein-b').addEventListener('click',plein);
    document.addEventListener('fullscreenchange',()=>{ if(!document.fullscreenElement&&racine.classList.contains('m-graphe-plein-actif')){ racine.classList.remove('m-graphe-plein-actif'); document.documentElement.classList.remove('m-graphe-ouvert'); planifier(); } });
    function detruire(){ E.detruit=true; clearTimeout(E.minuterie); try{ chart.remove(); }catch(e){} }
    await charger();
    return {definirTf,definirActif,afficherPosition,definirVue,plein,detruire,etat:()=>E,chart,serie:bougies,actualiser,charger,redessiner:planifier};
  }
  window.MobileGraphique={creer,bibliotheque,OPTIONS_DEFAUT};
})();
