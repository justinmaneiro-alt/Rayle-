"use strict";
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
