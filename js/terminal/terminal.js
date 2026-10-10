/* ═════════════ TERMINAL (vue de la page unique) : module chargé à la première ouverture ═════════════
   Parle à Raylé uniquement par RayleBus (état partagé en mémoire + commandes). Aucun localStorage entre les deux. */
import { creerGraphique, LIBELLE_IV } from './graphique-rayle.js?v=2026.10.10.6';
import { creerPageMarches } from './page-marches.js?v=2026.10.10.6';
import { creerPageCot } from './page-cot.js?v=2026.10.10.6';
import { creerPageAnalyse } from './page-analyse.js?v=2026.10.10.6';


  // ── WORKER RAYLÉ ── adresse et code d'accès : les mêmes réglages que Raylé (⚙ Réglages), fournis par le bus
  const configWorker=()=>RayleBus.demander('worker')||{url:'',token:''};
  const jeton=()=>String(configWorker().token||'').trim();

  async function wk(path){
    const c=new AbortController(); const tm=setTimeout(()=>c.abort(),20000);
    let r;
    const base=String(configWorker().url||'').replace(/\/+$/,'');
    if(!base) throw new Error("Worker non configuré (⚙ Réglages de Raylé)");
    try{ r=await fetch(base+path,{headers:{'X-Rayle-Token':jeton()},signal:c.signal}); }
    catch(e){ throw new Error(e.name==='AbortError'?'le Worker ne répond pas (délai dépassé)':'Worker injoignable'); }
    finally{ clearTimeout(tm); }
    let d=null; try{ d=await r.json(); }catch(e){}
    if(r.status===401){ const er=new Error("code d'accès refusé"); er.code=401; throw er; }
    if(!r.ok||!d||d.error) throw new Error((d&&d.error)||('erreur Worker HTTP '+r.status));
    return d;
  }
  async function marche(actif,iv){
    const d=await wk('/marche?actif='+actif+'&intervalle='+iv+'&n=500');   // même clé de cache que le graphique Raylé : un seul appel aux sources
    if(!d.bougies||!d.bougies.length) throw new Error('aucune bougie reçue');
    return d;
  }

  // Migration unique : les anciennes versions ont pu laisser un état de panneaux replié ; on repart d'un terminal déplié
  try{
    if(localStorage.getItem('rayle_purge_panneaux')!=='1'){
      Object.keys(localStorage).filter(k=>/panneau|replie|rayle_terminal_(vue|etat|panels)/i.test(k)).forEach(k=>localStorage.removeItem(k));
      localStorage.setItem('rayle_purge_panneaux','1');
    }
  }catch(e){}
  const $=id=>document.getElementById(id);
  let horloge=null;
  const tickHorloge=()=>{ $('clock').textContent=new Date().toLocaleTimeString('fr-FR'); };

  const ASSETS={
    NDX:{label:'NASDAQ', tv:'CAPITALCOM:US100', book:null,     dec:2},
    BTC:{label:'BITCOIN',tv:'BINANCE:BTCUSDT', book:'btcusd', dec:0,vol:true},
    SOL:{label:'SOLANA', tv:'BINANCE:SOLUSDT', book:'solusd', dec:2,vol:true},
    XAU:{label:'OR',     tv:'OANDA:XAUUSD',    book:null,     dec:2},
    EUR:{label:'EUR/USD',tv:'FX:EURUSD',       book:null,     dec:4},
  };
  const TFS=[['15min','M15'],['1h','H1'],['4h','H4'],['1day','DAILY']];
  // Fréquence de mise à jour du dashboard : plus lente pour l'or et l'EUR/USD (quota Twelve Data)
  const REFRESH={NDX:120000,BTC:120000,SOL:120000,XAU:600000,EUR:600000};
  let current='NDX', interval='60';
  const IV_TD={'5':'5min','15':'15min','60':'1h','240':'4h','D':'1day'};     // unité du graphique → intervalle du Worker
  const IV_VALIDES=Object.keys(IV_TD);
  const MODES_AFF={dashboard:'le dashboard',graphique:'le graphique seul',graphique_rsi:'le graphique avec le RSI'};
  const PAGES_TERM=['terminal','marches','cot','analyse'];
  const CLE_PREFS='rayle_terminal_prefs';
  const lirePrefs=()=>{ try{ return JSON.parse(localStorage.getItem(CLE_PREFS)||'{}')||{}; }catch(e){ return {}; } };
  const ecrirePrefs=()=>{ try{ localStorage.setItem(CLE_PREFS,JSON.stringify({source:sourceGraph,r:graph?graph.reglages():{}})); }catch(e){} };
  let modeAff='dashboard', pageCourante='terminal', sourceGraph=(lirePrefs().source==='tradingview'?'tradingview':'rayle');
  let graph=null;

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
    majGraphique(); startBook();
    writeBridge(Object.assign({},EMPTY,{actif:ASSETS[k].label,symbole:ASSETS[k].tv,unite_graphique:LIBELLE_IV[interval],analyse_en_cours:true}));
    buildDash();
  }
  function selectInterval(iv){
    if(!IV_VALIDES.includes(iv)) return;
    interval=iv;
    $('ivs').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.iv===iv));
    majGraphique(); drawRSI();
    writeBridge({unite_graphique:LIBELLE_IV[iv]});
    enrichBridge();
  }
  keys.forEach((k,i)=>{
    const bt=document.createElement('button'); bt.textContent=ASSETS[k].label; if(i===0)bt.classList.add('active');
    bt.onclick=()=>selectAsset(k);
    tabs.appendChild(bt);
  });
  $('ivs').querySelectorAll('button').forEach(bt=>{ bt.onclick=()=>selectInterval(bt.dataset.iv); });

  function ema(a,p){ if(a.length<p) return null; const k=2/(p+1); let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p; for(let i=p;i<a.length;i++) e=a[i]*k+e*(1-k); return e; }
  function rsi(c,p){ if(c.length<p+1) return null; let g=0,l=0; for(let i=c.length-p;i<c.length;i++){const d=c[i]-c[i-1]; d>=0?g+=d:l-=d;} const ag=g/p,al=l/p; if(al===0)return 100; return 100-100/(1+ag/al); }
  function rsiSeries(c,p){
    if(c.length<p+1) return [];
    const out=[]; let g=0,l=0;
    for(let i=1;i<=p;i++){const d=c[i]-c[i-1]; d>=0?g+=d:l-=d;}
    let ag=g/p,al=l/p; out.push(al===0?100:100-100/(1+ag/al));
    for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];const up=d>0?d:0,dn=d<0?-d:0;ag=(ag*(p-1)+up)/p;al=(al*(p-1)+dn)/p;out.push(al===0?100:100-100/(1+ag/al));}
    return out;
  }
  // cache des séries de clôtures par TF (pour tracer le RSI sans rappel)
  const seriesCache={};
  function drawRSI(){
    const box=$('rsi-box'); const s=ASSETS[current];
    const iv = IV_TD[interval];
    $('rsiSym').textContent=s.label+' · '+LIBELLE_IV[interval];
    const closes=seriesCache[iv];
    if(!closes||!closes.length){ box.innerHTML='<div class="loading">'+(interval==='5'?'RSI M5 : voir le graphique Raylé':'RSI en attente des données…')+'</div>'; return; }
    const r=rsiSeries(closes,14).slice(-100);
    if(!r.length){ box.innerHTML='<div class="loading">Pas assez de données</div>'; return; }
    const W=600,H=190,pad=6;
    const x=i=>pad+i*(W-2*pad)/(r.length-1);
    const y=v=>pad+(100-v)*(H-2*pad)/100;
    let path=''; r.forEach((v,i)=>path+=(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)+' ');
    const last=r.at(-1);
    const col=last>70?'var(--down)':last<30?'var(--up)':'var(--neon2)';
    box.innerHTML=
      '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" style="width:100%;height:100%;display:block">'
      +'<rect x="0" y="'+y(100)+'" width="'+W+'" height="'+(y(70)-y(100))+'" fill="rgba(255,59,94,.07)"/>'
      +'<rect x="0" y="'+y(30)+'" width="'+W+'" height="'+(y(0)-y(30))+'" fill="rgba(23,217,138,.07)"/>'
      +'<line x1="0" y1="'+y(70)+'" x2="'+W+'" y2="'+y(70)+'" stroke="rgba(255,59,94,.4)" stroke-dasharray="4 4"/>'
      +'<line x1="0" y1="'+y(50)+'" x2="'+W+'" y2="'+y(50)+'" stroke="rgba(255,0,127,.2)"/>'
      +'<line x1="0" y1="'+y(30)+'" x2="'+W+'" y2="'+y(30)+'" stroke="rgba(23,217,138,.4)" stroke-dasharray="4 4"/>'
      +'<path d="'+path+'" fill="none" stroke="'+col+'" stroke-width="1.6"/>'
      +'<circle cx="'+x(r.length-1)+'" cy="'+y(last)+'" r="3" fill="'+col+'"/>'
      +'<text x="8" y="'+(y(70)-4)+'" fill="var(--muted)" font-size="10" font-family="monospace">70</text>'
      +'<text x="8" y="'+(y(30)+12)+'" fill="var(--muted)" font-size="10" font-family="monospace">30</text>'
      +'</svg>'
      +'<div style="position:absolute;top:8px;right:14px;font-family:var(--mono);font-size:17px;font-weight:700;color:'+col+'">'+last.toFixed(1)+'</div>';
  }
  // Volume net en dollars : seulement là où la source donne un vrai volume (crypto). Les indices (^NDX), l'or et l'EUR/USD n'en ont pas : « n/d »
  function netVol(d,n){ if(!ASSETS[current].vol) return null; const seg=d.slice(-n); if(!seg.some(b=>b.v>0)) return null; let net=0; for(const b of seg) net+=(b.c>=b.o?1:-1)*b.v*b.c; return net; }
  function fUsd(v){ const a=Math.abs(v),sg=v>=0?'+':'-'; return sg+(a>=1e9?(a/1e9).toFixed(1)+'B':a>=1e6?(a/1e6).toFixed(1)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':a.toFixed(0)); }
  const hhmm=d=>new Date(d).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

  // Le widget TradingView est une fenêtre externe : aucune page ne peut lire ce qu'il affiche.
  // On calcule donc nous-mêmes, avec les mêmes données, ce que Raylé a besoin de « voir ».
  const candleCache={};
  function pivots(d,n){
    const hi=[],lo=[];
    for(let i=n;i<d.length-n;i++){
      let isH=true,isL=true;
      for(let j=1;j<=n;j++){
        if(d[i].h<=d[i-j].h||d[i].h<=d[i+j].h) isH=false;
        if(d[i].l>=d[i-j].l||d[i].l>=d[i+j].l) isL=false;
      }
      if(isH) hi.push({i,p:d[i].h});
      if(isL) lo.push({i,p:d[i].l});
    }
    return {hi,lo};
  }
  function structureOf(d,rd){
    const seg=d.slice(-160); const pv=pivots(seg,3);
    if(pv.hi.length<2||pv.lo.length<2) return null;
    const h1=pv.hi.at(-1),h0=pv.hi.at(-2),l1=pv.lo.at(-1),l0=pv.lo.at(-2);
    const price=seg.at(-1).c, hh=h1.p>h0.p, hl=l1.p>l0.p;
    let lecture, alerte=null;
    if(hh&&hl){ lecture='sommets et creux plus hauts (structure haussière)'; if(price<l1.p) alerte='le dernier creux est cassé, un changement de caractère baissier est possible'; }
    else if(!hh&&!hl){ lecture='sommets et creux plus bas (structure baissière)'; if(price>h1.p) alerte='le dernier sommet est cassé, un changement de caractère haussier est possible'; }
    else lecture='structure mixte, marché en range ou en transition';
    return {lecture,dernier_sommet:rd(h1.p),dernier_creux:rd(l1.p),alerte};
  }
  function enrichBridge(){
    const iv=candleCache[IV_TD[interval]]?IV_TD[interval]:'1h', lab=iv===IV_TD[interval]?LIBELLE_IV[interval]:'H1';
    const d=candleCache[iv]; if(!d||!d.length) return;
    const dec=ASSETS[current].dec, rd=v=>+Number(v).toFixed(dec);
    const last=d.at(-1), seg=d.slice(-50);
    const st=structureOf(d,rd);
    writeBridge({
      unite_graphique:lab,
      derniere_bougie:{unite:lab,ouverture:rd(last.o),haut:rd(last.h),bas:rd(last.l),cloture:rd(last.c),sens:last.c>=last.o?'haussière':'baissière'},
      extremes_recents:{sur:'50 dernières bougies '+lab,plus_haut:rd(Math.max(...seg.map(x=>x.h))),plus_bas:rd(Math.min(...seg.map(x=>x.l)))},
      rsi_recent:rsiSeries(d.map(x=>x.c),14).slice(-6).map(v=>+v.toFixed(1)),
      structure:st?Object.assign({unite:lab},st):null
    });
  }

  // ── CODE D'ACCÈS ──
  function demanderJeton(msg){
    const t=$('dashBody'); t.dataset.actif='';
    $('dashSrc').innerHTML='';
    t.className='needkey';
    t.innerHTML=(msg?msg+'<br><br>':'')
      +"Code d'accès Raylé requis (le même que dans ⚙ Réglages de Raylé et que RAYLE_TOKEN dans Cloudflare).<br><br>"
      +'<input id="tok" type="password" placeholder="colle ton code ici" autocomplete="off" style="width:90%;background:rgba(0,0,0,.4);border:1px solid rgba(255,0,127,.4);color:#f2e9f4;font:13px Courier New,monospace;padding:7px 9px;outline:none"><br><br>'
      +'<button id="tokSave" style="background:#ff007f;border:none;color:#1a000d;font:700 12px Courier New,monospace;letter-spacing:.1em;padding:8px 14px;cursor:pointer">ENREGISTRER</button>'
      +'<div style="margin-top:10px;font-size:11px;color:#9a8fa6">Le code reste dans ce navigateur, pas dans le fichier.</div>';
    $('ctxBody').className='loading'; $('ctxBody').innerHTML="En attente du code d'accès…";
    $('tokSave').onclick=()=>{
      const v=$('tok').value.trim();
      if(v){ RayleBus.demander('worker:code',v); buildDash(); loadContexte(); }
    };
  }

  // ── DASHBOARD ──
  let dashTok=0, dashTimer=null;
  function planifierDash(){ clearTimeout(dashTimer); dashTimer=setTimeout(buildDash, REFRESH[current]||600000); }

  function ligneSource(reps){
    const h1=reps.find(r=>r.intervalle==='1h')||reps[0];
    const secours=reps.some(r=>r.secours), differe=reps.some(r=>r.differe), perime=reps.some(r=>r.perime);
    let h='Source : '+h1.source+' ('+h1.symbole_source+')';
    if(secours) h+='<span class="tag">SECOURS</span>';
    if(secours&&h1.note) h+=' <span class="alerte-src">'+h1.note.replace(/^SECOURS : /,'')+'</span>';
    if(differe) h+='<span class="tag">DIFFÉRÉ</span>';
    if(perime)  h+='<span class="tag">ANCIENNE COPIE</span>';
    h+=' · màj '+hhmm(Date.now());
    const el=$('dashSrc'); el.innerHTML=h; el.title=h1.note||'';
    el.className='srcline'+(secours||perime?' warn':'');
  }

  async function buildDash(){
    const k=current, s=ASSETS[k]; const t=$('dashBody'); $('dashSym').textContent=s.label;
    clearTimeout(dashTimer);
    if(!jeton()){ demanderJeton(''); return; }
    const tok=++dashTok;
    const dejaAffiche = t.dataset.actif===k;
    if(!dejaAffiche){
      t.className='loading'; t.innerHTML='Calcul en cours…'; $('dashSrc').innerHTML='';
      for(const x in seriesCache) delete seriesCache[x];
      for(const x in candleCache) delete candleCache[x];
      drawRSI();
    }
    try{
      const reps=[];
      for(const [iv] of TFS){
        reps.push(await marche(k,iv));
        if(tok!==dashTok) return;   // un autre actif a été demandé entre-temps
      }
      // Supports et résistances : calculés par le Worker (pivots significatifs, écarts minimums en ATR), les mêmes que sur le graphique Raylé
      const niv=await Promise.all(TFS.map(([iv])=>wk('/graphique?actif='+k+'&intervalle='+iv+'&n=50').catch(()=>null)));
      if(tok!==dashTok) return;
      const cols=[];
      TFS.forEach(([iv,lab],i)=>{
        const d=reps[i].bougies;
        const closes=d.map(x=>x.c), highs=d.map(x=>x.h), lows=d.map(x=>x.l);
        seriesCache[iv]=closes; candleCache[iv]=d;
        const price=closes.at(-1), e200=ema(closes,200), r=rsi(closes,14);
        const nv0=niv[i]; let support=null, resist=null;
        if(nv0){ support=nv0.supports.length?nv0.supports[0].prix:null; resist=nv0.resistances.length?nv0.resistances[0].prix:null; }
        const bull=e200!=null?price>e200:null, nv=netVol(d,20);
        const sc=Math.max(0,Math.min(100,Math.round((bull?60:40)+((r!=null?(r-50):0)*0.3)+(nv==null?0:nv>=0?5:-5))));
        cols.push({lab,price,bull,rsi:r,support,resist,net:nv,score:sc,e200,dist:(e200?((price-e200)/e200*100):null)});
      });
      drawRSI();
      const h1=cols.find(c=>c.lab==='H1')||cols[0];
      const bulls=cols.filter(c=>c.bull).length, globalTrend=bulls>=2?'Haussier':'Baissier';
      const scoreG=Math.round(cols.reduce((a,c)=>a+c.score,0)/cols.length);
      const fmt=v=>v==null?'—':v.toLocaleString('fr-FR',{maximumFractionDigits:v>=1000?0:s.dec});

      let html='<table class="grid"><tr><th>INDIC.</th>';
      cols.forEach(c=>html+=`<th>${c.lab}</th>`); html+='<th>GLOBAL</th></tr>';
      html+='<tr><td>Tendance</td>';
      cols.forEach(c=>html+=`<td class="${c.bull?'cell-bull':'cell-bear'}">${c.bull?'▲ Haus.':'▼ Bais.'}</td>`);
      html+=`<td class="${globalTrend==='Haussier'?'cell-bull':'cell-bear'}">${globalTrend==='Haussier'?'▲':'▼'}</td></tr>`;
      html+='<tr><td>RSI 14</td>';
      cols.forEach(c=>{const v=c.rsi;const cl=v>70?'rsi-hot':v<30?'rsi-cold':'';html+=`<td class="${cl}">${v!=null?v.toFixed(1):'—'}</td>`;});
      html+='<td>—</td></tr>';
      html+='<tr><td>Vol net $</td>';
      cols.forEach(c=>html+=c.net==null?'<td class="nd" title="Pas de volume réel pour cet instrument">n/d</td>':`<td class="${c.net>=0?'bull':'bear'}">${fUsd(c.net)}</td>`);
      html+=h1.net==null?'<td class="nd">n/d</td></tr>':`<td class="${h1.net>=0?'bull':'bear'}">${h1.net>=0?'ACHAT':'VENTE'}</td></tr>`;
      html+='<tr><td>Support</td>';
      cols.forEach(c=>html+=`<td class="bull">${fmt(c.support)}</td>`); html+='<td>—</td></tr>';
      html+='<tr><td>Résist.</td>';
      cols.forEach(c=>html+=`<td class="bear">${fmt(c.resist)}</td>`); html+='<td>—</td></tr>';
      html+='<tr><td>Score</td>';
      cols.forEach(c=>html+=`<td class="${c.score>=50?'bull':'bear'}">${c.score}</td>`);
      html+=`<td class="${scoreG>=50?'bull':'bear'}">${scoreG}/100</td></tr>`;
      html+='</table>';
      t.className=''; t.innerHTML=html; t.dataset.actif=k;
      ligneSource(reps);

      const rh1=reps[1];
      writeBridge({
        actif:s.label, symbole:s.tv, unite_graphique:LIBELLE_IV[interval],
        tendance_globale:globalTrend, score_global:scoreG,
        tendances:Object.fromEntries(cols.map(c=>[c.lab, c.bull?'Haussier':'Baissier'])),
        rsi:Object.fromEntries(cols.map(c=>[c.lab, c.rsi!=null?+c.rsi.toFixed(1):null])),
        volume_net:Object.fromEntries(cols.map(c=>[c.lab, c.net==null?'n/d (pas de volume réel pour cet instrument)':Math.round(c.net)])),
        ma200:Object.fromEntries(cols.map(c=>[c.lab, c.e200!=null?+c.e200.toFixed(s.dec):null])),
        distance_ma200_pct:Object.fromEntries(cols.map(c=>[c.lab, c.dist!=null?+c.dist.toFixed(2):null])),
        support:h1.support, resistance:h1.resist, prix:h1.price,
        instrument_donnees: rh1.source+' '+rh1.symbole_source+' : '+(rh1.note||rh1.nom),
        source_donnees:{source:rh1.source, secours:reps.some(r=>r.secours), differe:reps.some(r=>r.differe), ancienne_copie:reps.some(r=>r.perime)},
        analyse_en_cours:false,
        maj:new Date().toISOString()
      });
      enrichBridge();
      planifierDash();
    }catch(e){
      if(tok!==dashTok) return;
      if(e.code===401){ demanderJeton('Code refusé par le Worker, vérifie-le.'); return; }
      if(dejaAffiche){
        // on garde le dernier tableau et on prévient discrètement
        const el=$('dashSrc'); el.className='srcline warn';
        el.innerHTML='⚠ Mise à jour impossible ('+e.message+'). Tableau affiché : dernière mise à jour réussie.';
      }else{
        t.className='needkey'; t.innerHTML='Indisponible : '+e.message+'.<br>Nouvel essai automatique, ou appuie sur ↻.';
      }
      planifierDash();
    }
  }
  $('btnRefresh').onclick=()=>{ buildDash(); loadContexte(); };

  // ── CONTEXTE DE MARCHÉ ──
  async function loadContexte(){
    const box=$('ctxBody');
    if(!jeton()) return;
    try{
      const d=await wk('/contexte');
      let h='<table class="grid ctx">';
      d.lignes.forEach(l=>{
        const v=l.variation_pct, cl=v==null?'':v>=0?'bull':'bear';
        const px=l.prix==null?'—':l.prix.toLocaleString('fr-FR',{maximumFractionDigits:2})+(l.unite?' '+l.unite:'');
        h+=`<tr><td>${l.label}${l.secours?'<span class="tag">SECOURS</span>':''}</td><td>${px}</td><td class="${cl}">${v==null?'—':(v>=0?'+':'')+v.toFixed(2)+' %'}</td></tr>`;
      });
      h+='</table>';
      const srcs=[...new Set(d.lignes.map(l=>l.source).filter(Boolean))].join(', ');
      h+=`<div class="srcline${d.perime?' warn':''}">Source : ${srcs||'—'}<span class="tag">DIFFÉRÉ</span>${d.perime?'<span class="tag">ANCIENNE COPIE</span>':''} · màj ${hhmm(d.maj)}</div>`;
      box.className=''; box.innerHTML=h;
      writeBridge({contexte_marche:Object.fromEntries(d.lignes.filter(l=>l.prix!=null).map(l=>[l.label,{prix:l.prix,variation_pct:l.variation_pct}]))});
    }catch(e){
      if(e.code===401) return;   // le dashboard s'occupe de redemander le code
      if(!box.querySelector('table')){ box.className='needkey'; box.innerHTML='Contexte indisponible : '+e.message; }
    }
  }

  // ── CARNET D'ORDRES (Bitstamp, cryptos uniquement) ──
  let bookTimer=null;
  async function drawBook(){
    const s=ASSETS[current]; const body=$('bookBody'); $('bookSym').textContent=s.label;
    if(!s.book){ body.innerHTML='<div class="loading">Carnet disponible pour les cryptos (BTC, SOL).</div>'; return; }
    try{
      const r=await fetch(`https://www.bitstamp.net/api/v2/order_book/${s.book}/`);
      const d=await r.json();
      const asks=d.asks.slice(0,11).map(x=>({p:+x[0],a:+x[1]}));
      const bids=d.bids.slice(0,11).map(x=>({p:+x[0],a:+x[1]}));
      const mx=Math.max(...asks.map(x=>x.a),...bids.map(x=>x.a));
      const spread=asks[0].p-bids[0].p;
      const fp=p=>p.toLocaleString('fr-FR',{maximumFractionDigits:s.dec});
      const fa=a=>a.toLocaleString('fr-FR',{maximumFractionDigits:3});
      let h='<div class="book-head"><span>Prix</span><span>Volume</span><span>Cumul</span></div><div class="side">';
      let run=0;
      asks.slice().reverse().forEach(x=>{run+=x.a; h+=`<div class="brow ask"><span class="bar" style="width:${(x.a/mx*100).toFixed(0)}%"></span><span class="p">${fp(x.p)}</span><span>${fa(x.a)}</span><span>${fa(run)}</span></div>`;});
      h+='</div>';
      h+=`<div class="spread">Spread ${fp(spread)} · mid ${fp((asks[0].p+bids[0].p)/2)}</div>`;
      h+='<div class="side">'; run=0;
      bids.forEach(x=>{run+=x.a; h+=`<div class="brow bid"><span class="bar" style="width:${(x.a/mx*100).toFixed(0)}%"></span><span class="p">${fp(x.p)}</span><span>${fa(x.a)}</span><span>${fa(run)}</span></div>`;});
      h+='</div>';
      body.innerHTML=h;
    }catch(e){ body.innerHTML='<div class="needkey">Carnet indisponible sur ce réseau.</div>'; }
  }
  function startBook(){
    if(bookTimer) clearInterval(bookTimer);
    const has=!!ASSETS[current].book;
    $('bookPanel').style.display = has ? 'flex' : 'none';   // masque la fenêtre si pas de carnet
    if(has){ drawBook(); bookTimer=setInterval(drawBook,4000); }
  }

  // ── ÉTAT PARTAGÉ avec Raylé : en mémoire, par le bus (rien dans localStorage entre les deux) ──
  // Seules les notes sont gardées dans le navigateur, pour les retrouver à la prochaine visite.
  const CLE_NOTES='rayle_terminal_notes';
  const lireNotes=()=>{ try{ return localStorage.getItem(CLE_NOTES)||''; }catch(e){ return ''; } };
  const notes=$('notes');
  notes.value=(RayleBus.etat('terminal')||{}).notes||lireNotes();
  function writeBridge(data){
    return RayleBus.fusion('terminal',Object.assign({},data,{notes:notes.value}));
  }
  let noteTimer=null;
  notes.addEventListener('input',()=>{
    $('saveHint').textContent='Sauvegarde…';
    clearTimeout(noteTimer);
    noteTimer=setTimeout(()=>{
      try{ localStorage.setItem(CLE_NOTES,notes.value); }catch(e){}
      writeBridge({}); $('saveHint').textContent='Sauvegardé · lisible par Raylé';
    },500);
  });

  // ── PANNEAUX (ouvrir / fermer) ──
  const PANNEAUX={
    dashboard:{sel:'.dash',nom:'le dashboard'}, contexte:{sel:'.ctxPanel',nom:'le contexte de marché'},
    graphique:{sel:'.chart',nom:'le graphique'}, rsi:{sel:'.rsiPanel',nom:'le RSI'},
    carnet:{sel:'#bookPanel',nom:"le carnet d'ordres"}, notes:{sel:'.notes',nom:'les notes'},
    calendrier:{sel:'.cal',nom:'le calendrier'}
  };
  const panneauEl=n=>document.querySelector('#vueTerminal '+PANNEAUX[n].sel);
  const estFerme=c=>c.contains('ferme')||c.contains('replie')||c.contains('hud-out');
  function majPanneauxBridge(){
    writeBridge({panneaux_fermes:Object.keys(PANNEAUX).filter(n=>estFerme(panneauEl(n).classList)).map(n=>PANNEAUX[n].nom)});
  }
  // Cadre holographique (css/hud.css) et apparition animée : les fenêtres s'ouvrent l'une après l'autre
  function animer(el,delai){
    el.classList.remove('hud-in','hud-out'); void el.offsetWidth;
    el.style.animationDelay=(delai||0)+'ms'; el.classList.add('hud-in');
    const b=el.querySelector(':scope>.hud-balayage'); if(b){ b.style.animationDelay=((delai||0)+250)+'ms'; b.remove(); el.appendChild(b); }
  }
  function animerOuverture(){
    Object.keys(PANNEAUX).forEach((n,i)=>{ const el=panneauEl(n); if(el && !el.classList.contains('ferme')) animer(el,i*110); });
  }
  function majDock(){
    const d=$('tdock'); if(!d) return;
    d.textContent='';
    Object.keys(PANNEAUX).forEach(n=>{
      if(!panneauEl(n).classList.contains('ferme')) return;
      const b=document.createElement('button'); b.type='button'; b.textContent='＋ '+PANNEAUX[n].nom.replace(/^(le |la |les |l')/,'');
      b.title='Rouvrir cette fenêtre'; b.addEventListener('click',()=>setPanneau(n,'ouvrir')); d.appendChild(b);
    });
  }
  function setPanneau(n,action){
    const el=panneauEl(n); if(!el) return false;
    const dejaFerme=estFerme(el.classList);
    const fermer = action==='basculer' ? !dejaFerme : action==='fermer';
    if(fermer){
      if(!el.classList.contains('ferme') && !el.classList.contains('hud-out')){
        el.classList.remove('hud-in'); el.style.animationDelay='0ms'; el.classList.add('hud-out');
        setTimeout(()=>{ if(el.classList.contains('hud-out')){ el.classList.remove('hud-out'); el.classList.add('ferme'); majDock(); } },340);
      }
    }else{
      el.classList.remove('ferme','replie','hud-out'); animer(el,0);
    }
    majPanneauxBridge(); majDock();
    return true;
  }
  Object.keys(PANNEAUX).forEach(n=>{
    const el=panneauEl(n); if(!el) return;
    el.classList.add('hud-cadre');
    const b=document.createElement('i'); b.className='hud-balayage'; el.appendChild(b);
    const h=el.querySelector(':scope>h2'); if(!h) return;
    // un clic sur le titre replie / déplie la fenêtre ; la croix la ferme (le dock en haut permet de la rouvrir)
    h.style.cursor='pointer'; h.title='Cliquer pour replier / déplier';
    h.addEventListener('click',e=>{ if(e.target.closest('button,a,input,.srcsw')) return; el.classList.toggle('replie'); majPanneauxBridge(); if(graph) requestAnimationFrame(()=>graph.redessiner()); });   // les boutons du titre (Raylé / TradingView) ne replient pas la fenêtre
    const x=document.createElement('button'); x.type='button'; x.className='tp-x'; x.textContent='✕'; x.title='Fermer cette fenêtre'; x.setAttribute('aria-label','Fermer cette fenêtre');
    x.addEventListener('click',e=>{ e.stopPropagation(); setPanneau(n,'fermer'); });
    h.appendChild(x);
  });
  { const tools=document.querySelector('#vueTerminal .tbar .tools'); if(tools){ const d=document.createElement('div'); d.className='tdock'; d.id='tdock'; tools.parentNode.insertBefore(d,tools); } }

  // ── GRAPHIQUE RAYLÉ, MODES D'AFFICHAGE ET PAGES (Marchés, COT, Analyse) ──
  const racineTerm=document.getElementById('vueTerminal');
  graph=creerGraphique({ boite:$('rc-box'), surChangement:e=>writeBridge({graphique_rayle:e}) });
  const frequenceGraph=()=>['XAU','EUR'].includes(current)?180000:45000;   // Twelve Data (or, euro) a un quota : on le ménage
  function majGraphique(){     // le bon graphique pour l'actif et l'unité courants
    $('chartSym').textContent=ASSETS[current].label+' · '+LIBELLE_IV[interval];
    if(sourceGraph==='rayle'){ graph.frequence(frequenceGraph()); graph.charger(current,interval); }
    else loadChart();
  }
  function appliquerSourceUI(){
    racineTerm.classList.toggle('src-rayle',sourceGraph==='rayle');
    $('rc-box').classList.toggle('cache',sourceGraph!=='rayle'); $('tv-chart').classList.toggle('cache',sourceGraph==='rayle');
    document.querySelectorAll('#srcSw button').forEach(b=>b.classList.toggle('actif',b.dataset.src===sourceGraph));
  }
  function setSource(src){
    if(src!=='rayle'&&src!=='tradingview') return false;
    if(src===sourceGraph) return true;
    sourceGraph=src; appliquerSourceUI();
    if(src==='rayle'){ graph.montrer(); requestAnimationFrame(()=>graph.redessiner()); } else graph.cacher();
    if(ouvertTerm && pageCourante==='terminal') majGraphique();
    ecrirePrefs(); writeBridge({source_graphique:src==='rayle'?'graphique Raylé':'widget TradingView'});
    return true;
  }
  function reglerGraphique(r){
    if(r.source) setSource(r.source);
    const g={}; for(const k of ['rsi','ma200','supports']) if(typeof r[k]==='boolean') g[k]=r[k];
    if(!Object.keys(g).length) return;
    if(sourceGraph!=='rayle') setSource('rayle');          // le widget TradingView ne se pilote pas : on passe sur le graphique Raylé
    graph.regler(g);
    if(g.rsi===true && modeAff==='graphique') setMode('graphique_rsi');
    else if(g.rsi===false && modeAff==='graphique_rsi') setMode('graphique');
    ecrirePrefs();
  }
  function mesurerBarre(){ const b=racineTerm.querySelector('.tbar'); if(b) racineTerm.style.setProperty('--tbar-h',b.offsetHeight+'px'); }
  function setMode(m){
    if(!MODES_AFF[m]) return false;
    modeAff=m; racineTerm.dataset.mode=m;
    if(pageCourante!=='terminal') allerPage('terminal');
    if(m==='graphique_rsi'){ if(sourceGraph!=='rayle') setSource('rayle'); graph.regler({rsi:true}); }
    else if(m==='graphique') graph.regler({rsi:false});
    document.querySelectorAll('#tmodes button').forEach(b=>b.classList.toggle('actif',b.dataset.m===m));
    mesurerBarre(); setTimeout(()=>{ window.dispatchEvent(new Event('resize')); },60);
    window.scrollTo(0,0); { const ts=document.getElementById('tscroll'); if(ts) ts.scrollTop=0; }
    writeBridge({mode_affichage:MODES_AFF[m]});
    return true;
  }

  const pages={};
  function creerPage(nom){
    if(pages[nom]) return pages[nom];
    const r=$('page'+nom[0].toUpperCase()+nom.slice(1));
    return pages[nom]=nom==='marches'?creerPageMarches({racine:r}):nom==='cot'?creerPageCot({racine:r}):creerPageAnalyse({racine:r});
  }
  let ouvertTerm=false;
  function suspendreTerminal(){     // page Marchés / COT / Analyse affichée : le dashboard et le carnet ne tournent pas dans le vide
    clearTimeout(dashTimer); dashTimer=null; clearInterval(ctxTimer); ctxTimer=null; clearInterval(bookTimer); bookTimer=null; dashTok++;
    graph.cacher();
  }
  function reprendreTerminal(){
    clearInterval(ctxTimer); ctxTimer=setInterval(loadContexte,120000);
    startBook(); buildDash(); loadContexte(); majGraphique();
    if(sourceGraph==='rayle') graph.montrer();
  }
  function allerPage(p,opts){
    if(!PAGES_TERM.includes(p)) return false;
    const avant=pageCourante;
    if(avant!==p){ if(avant==='terminal') suspendreTerminal(); else if(pages[avant]) pages[avant].fermer(); }
    pageCourante=p; racineTerm.dataset.page=p;
    document.querySelectorAll('#tpages button').forEach(b=>b.classList.toggle('actif',b.dataset.p===p));
    if(p==='terminal'){ if(avant!=='terminal' && ouvertTerm) reprendreTerminal(); }
    else if(ouvertTerm){ creerPage(p).ouvrir(opts||{}); }
    mesurerBarre(); window.scrollTo(0,0); { const ts=document.getElementById('tscroll'); if(ts) ts.scrollTop=0; }
    writeBridge({page_terminal:{terminal:'terminal (graphique et dashboard)',marches:'Marchés',cot:'rapports COT',analyse:'analyse fondamentale'}[p]});
    return true;
  }
  document.querySelectorAll('#tpages button').forEach(b=>{ b.onclick=()=>allerPage(b.dataset.p); });
  document.querySelectorAll('#tmodes button').forEach(b=>{ b.onclick=()=>setMode(b.dataset.m); });
  document.querySelectorAll('#srcSw button').forEach(b=>{ b.onclick=()=>setSource(b.dataset.src); });
  { const r=lirePrefs().r; if(r) graph.regler({rsi:r.rsi!==false,ma200:r.ma200!==false,supports:r.supports!==false}); }
  appliquerSourceUI();
  if(typeof ResizeObserver!=='undefined') new ResizeObserver(mesurerBarre).observe(racineTerm.querySelector('.tbar'));

  // ── COMMANDES venant de Raylé (voix) : réponse {ok, message?} ──
  function surTerminal(){ if(pageCourante!=='terminal') allerPage('terminal'); }
  function commande(c){
    if(!c||!c.type) return {ok:false,message:'commande inconnue'};
    switch(c.type){
      case 'actif':
        if(!ASSETS[c.valeur]) return {ok:false,message:'actif inconnu'};
        surTerminal(); selectAsset(c.valeur); return {ok:true};
      case 'unite':
        if(!IV_VALIDES.includes(c.valeur)) return {ok:false,message:'Le graphique gère M5, M15, H1, H4 et le journalier.'};
        surTerminal(); selectInterval(c.valeur); return {ok:true};
      case 'actualiser':
        if(pageCourante==='marches'&&pages.marches) pages.marches.actualiser();
        else if(pageCourante==='terminal'){ buildDash(); loadContexte(); majGraphique(); }
        return {ok:true};
      case 'panneau':
        if(!PANNEAUX[c.nom]) return {ok:false,message:'panneau inconnu'};
        surTerminal();
        if(c.nom==='rsi' && sourceGraph==='rayle'){      // le RSI du graphique Raylé est une sous-fenêtre du graphique
          reglerGraphique({rsi:c.action==='basculer'?!graph.reglages().rsi:c.action!=='fermer'}); return {ok:true};
        }
        if(c.nom==='carnet' && c.action!=='fermer' && !ASSETS[current].book)
          return {ok:false,message:"Le carnet d'ordres n'existe que pour le Bitcoin et Solana."};
        setPanneau(c.nom,c.action); return {ok:true};
      case 'note':
        notes.value=(notes.value?notes.value.replace(/\s+$/,'')+'\n':'')+String(c.texte||'').slice(0,500);
        try{ localStorage.setItem(CLE_NOTES,notes.value); }catch(e){}
        writeBridge({}); $('saveHint').textContent='Note ajoutée par Raylé'; return {ok:true};
      case 'mode':
        return setMode(c.valeur)?{ok:true}:{ok:false,message:"Modes d'affichage : dashboard, graphique seul, graphique avec RSI."};
      case 'page':
        if(!PAGES_TERM.includes(c.valeur)) return {ok:false,message:'page inconnue'};
        allerPage(c.valeur,{actif:c.actif,section:c.section});
        if(c.valeur==='cot'&&c.actif&&pages.cot) pages.cot.choisir(c.actif);
        if(c.valeur==='analyse'&&c.actif&&pages.analyse) pages.analyse.choisir(c.actif);
        if(c.valeur==='marches'&&c.section&&pages.marches) setTimeout(()=>pages.marches.allerA(c.section),700);
        return {ok:true};
      case 'graphique':
        surTerminal(); reglerGraphique(c.reglages||{}); return {ok:true};
      case 'annotation':
        surTerminal(); if(sourceGraph!=='rayle') setSource('rayle');
        if(c.effacer) graph.annoter({effacer:true});
        else if(isFinite(c.prix)) graph.annoter({prix:+c.prix,texte:c.texte,couleur:c.couleur});
        else return {ok:false,message:"Il me faut un prix pour l'annotation."};
        return {ok:true};
      case 'bougies':
        surTerminal(); setSource('rayle');
        if(c.actif&&ASSETS[c.actif]&&c.actif!==current) selectAsset(c.actif);
        if(c.unite&&IV_VALIDES.includes(c.unite)&&c.unite!==interval) selectInterval(c.unite);
        graph.numeroter(c.n); return {ok:true};
    }
    return {ok:false,message:'commande inconnue'};
  }
  RayleBus.fournir('terminal:commande',commande);

  // ── OUVERTURE / FERMETURE : tout ce qui tourne en arrière-plan s'arrête quand le terminal est fermé ──
  let ctxTimer=null, initFait=false;
  function ouvrir(){
    ouvertTerm=true;
    { const g=document.querySelector('#vueTerminal .chart'); if(g) g.classList.remove('replie','ferme'); }   // le panneau Graphique s'ouvre toujours déplié
    { const v=document.getElementById('versionPage'); if(v&&window.RAYLE_VERSION) v.textContent='Version '+window.RAYLE_VERSION; }
    tickHorloge(); clearInterval(horloge); horloge=setInterval(tickHorloge,1000);
    if(!initFait){ initFait=true; loadCal(); racineTerm.dataset.mode=modeAff; racineTerm.dataset.page=pageCourante; }
    mesurerBarre();
    if(pageCourante==='terminal'){
      clearInterval(ctxTimer); ctxTimer=setInterval(loadContexte,120000);
      startBook(); buildDash(); loadContexte(); majGraphique();
      if(sourceGraph==='rayle') graph.montrer();
      animerOuverture(); majDock();
    }else creerPage(pageCourante).ouvrir({});
    writeBridge({ouvert:true,mode_affichage:MODES_AFF[modeAff],source_graphique:sourceGraph==='rayle'?'graphique Raylé':'widget TradingView'});
  }
  function fermer(){
    ouvertTerm=false;
    clearInterval(horloge); horloge=null;
    clearInterval(ctxTimer); ctxTimer=null;
    clearInterval(bookTimer); bookTimer=null;
    clearTimeout(dashTimer); dashTimer=null;
    dashTok++;   // une analyse en cours est abandonnée
    graph.cacher();
    Object.values(pages).forEach(p=>p.fermer());
    writeBridge({ouvert:false});
  }
  writeBridge({});
  export { ouvrir, fermer, commande };
