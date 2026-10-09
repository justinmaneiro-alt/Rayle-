"use strict";
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
    const iv = interval==='60'?'1h':'15min';
    $('rsiSym').textContent=s.label+' · '+(interval==='60'?'H1':'M15');
    const closes=seriesCache[iv];
    if(!closes||!closes.length){ box.innerHTML='<div class="loading">RSI en attente des données…</div>'; return; }
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
      +'<rect x="0" y="'+y(70)+'" width="'+W+'" height="'+(y(100)-y(70))+'" fill="rgba(255,59,94,.07)"/>'
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
  function netVol(d,n){ let net=0; for(const b of d.slice(-n)) net+=(b.c>=b.o?1:-1)*b.v*b.c; return net; }
  function fUsd(v){ const a=Math.abs(v),sg=v>=0?'+':'-'; return sg+(a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(2)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':a.toFixed(0))+' $'; }
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
    const iv=interval==='60'?'1h':'15min', lab=interval==='60'?'H1':'M15';
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
