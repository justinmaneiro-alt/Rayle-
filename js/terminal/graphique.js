"use strict";
  const $=id=>document.getElementById(id);
  setInterval(()=>$('clock').textContent=new Date().toLocaleTimeString('fr-FR'),1000);

  const ASSETS={
    NDX:{label:'NASDAQ', tv:'CAPITALCOM:US100', book:null,     dec:2},
    BTC:{label:'BITCOIN',tv:'BINANCE:BTCUSDT', book:'btcusd', dec:0},
    SOL:{label:'SOLANA', tv:'BINANCE:SOLUSDT', book:'solusd', dec:2},
    XAU:{label:'OR',     tv:'OANDA:XAUUSD',    book:null,     dec:2},
    EUR:{label:'EUR/USD',tv:'FX:EURUSD',       book:null,     dec:4},
  };
  const TFS=[['15min','M15'],['1h','H1'],['4h','H4'],['1day','DAILY']];
  // Fréquence de mise à jour du dashboard : plus lente pour l'or et l'EUR/USD (quota Twelve Data)
  const REFRESH={NDX:120000,BTC:120000,SOL:120000,XAU:600000,EUR:600000};
  let current='NDX', interval='60';

  function tvWidget(id,url,cfg){
    const el=$(id); el.innerHTML='';
    const wrap=document.createElement('div'); wrap.className='tradingview-widget-container'; wrap.style.height='100%';
    const inner=document.createElement('div'); inner.className='tradingview-widget-container__widget'; inner.style.height='100%';
    wrap.appendChild(inner);
    const s=document.createElement('script'); s.src=url; s.async=true; s.type='text/javascript';
    s.innerHTML=JSON.stringify(cfg); wrap.appendChild(s); el.appendChild(wrap);
  }
  // Graphique : widget classique tv.js (il accepte le réglage de la MA 200 et affiche la barre d'outils de dessin)
  let tvJsPromise=null, chartTok=0;
  function loadTvJs(){
    if(window.TradingView && window.TradingView.widget) return Promise.resolve();
    if(tvJsPromise) return tvJsPromise;
    tvJsPromise=new Promise((res,rej)=>{
      const sc=document.createElement('script');
      sc.src='https://s3.tradingview.com/tv.js'; sc.async=true;
      sc.onload=res;
      sc.onerror=()=>{ tvJsPromise=null; rej(new Error('tv.js bloqué')); };
      document.head.appendChild(sc);
    });
    return tvJsPromise;
  }
  async function loadChart(){
    const s=ASSETS[current]; $('chartSym').textContent=s.label;
    const tok=++chartTok;
    const box=$('tv-chart');
    box.innerHTML='<div id="tv-chart-inner" style="width:100%;height:100%"></div>';
    try{ await loadTvJs(); }
    catch(e){ box.innerHTML='<div class="needkey">Graphique indisponible : le script TradingView est bloqué sur ce réseau.</div>'; return; }
    if(tok!==chartTok) return;   // un autre actif a été demandé entre-temps
    new TradingView.widget({
      container_id:'tv-chart-inner', autosize:true,
      symbol:s.tv, interval:interval, timezone:'Europe/Paris', locale:'fr',
      theme:'dark', style:'1', toolbar_bg:'#0a0710',
      hide_top_toolbar:false,
      hide_side_toolbar:false,            // barre d'outils de dessin TradingView, à gauche
      allow_symbol_change:false, enable_publishing:false, save_image:true, withdateranges:true,
      // Indicateur donné sous forme d'objet avec ses réglages : c'est la seule façon d'imposer la longueur 200
      // dans le widget gratuit (il n'a pas de fonction pour ajouter un indicateur après coup).
      // Pas de RSI ici : le RSI a sa propre fenêtre.
      studies:[{ id:'MAExp@tv-basicstudies', version:60, inputs:{ length:200, in_0:200 } }],
      studies_overrides:{
        'moving average exponential.plot.color':'#ff3399',
        'moving average exponential.plot.linewidth':2
      },
      overrides:{
        'paneProperties.background':'#06040b','paneProperties.backgroundType':'solid',
        'paneProperties.vertGridProperties.color':'rgba(255,0,127,0.06)',
        'paneProperties.horzGridProperties.color':'rgba(255,0,127,0.06)'
      }
    });
  }
  function loadCal(){
    tvWidget('tv-cal','https://s3.tradingview.com/external-embedding/embed-widget-events.js',{
      colorTheme:'dark', isTransparent:true, locale:'fr', countryFilter:'us,eu,fr,gb,jp,de',
      importanceFilter:'0,1', width:'100%', height:'100%'
    });
  }

  const tabs=$('tabs');
  const keys=Object.keys(ASSETS);
  // champs d'analyse remis à zéro quand on change d'actif (évite de mélanger deux actifs)
  const EMPTY={tendance_globale:null,score_global:null,tendances:null,rsi:null,volume_net:null,support:null,resistance:null,prix:null,
    ma200:null,distance_ma200_pct:null,derniere_bougie:null,extremes_recents:null,rsi_recent:null,structure:null,instrument_donnees:null,source_donnees:null};

  function selectAsset(k){
    if(!ASSETS[k]) return;
    current=k;
    [...tabs.children].forEach((c,i)=>c.classList.toggle('active',keys[i]===k));
    loadChart(); startBook();
    writeBridge(Object.assign({},EMPTY,{actif:ASSETS[k].label,symbole:ASSETS[k].tv,unite_graphique:interval==='60'?'H1':'M15',analyse_en_cours:true}));
    buildDash();
  }
  function selectInterval(iv){
    if(iv!=='15'&&iv!=='60') return;
    interval=iv;
    $('ivs').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.iv===iv));
    loadChart(); drawRSI();
    writeBridge({unite_graphique:iv==='60'?'H1':'M15'});
    enrichBridge();
  }
  keys.forEach((k,i)=>{
    const bt=document.createElement('button'); bt.textContent=ASSETS[k].label; if(i===0)bt.classList.add('active');
    bt.onclick=()=>selectAsset(k);
    tabs.appendChild(bt);
  });
  $('ivs').querySelectorAll('button').forEach(bt=>{ bt.onclick=()=>selectInterval(bt.dataset.iv); });
