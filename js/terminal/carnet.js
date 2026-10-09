"use strict";
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
