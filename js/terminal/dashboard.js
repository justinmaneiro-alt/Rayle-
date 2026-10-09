"use strict";
  // ── DASHBOARD ──
  let dashTok=0, dashTimer=null;
  function planifierDash(){ clearTimeout(dashTimer); dashTimer=setTimeout(buildDash, REFRESH[current]||600000); }

  function ligneSource(reps){
    const h1=reps.find(r=>r.intervalle==='1h')||reps[0];
    const secours=reps.some(r=>r.secours), differe=reps.some(r=>r.differe), perime=reps.some(r=>r.perime);
    let h='Source : '+h1.source+' ('+h1.symbole_source+')';
    if(secours) h+='<span class="tag">SECOURS</span>';
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
      const cols=[];
      TFS.forEach(([iv,lab],i)=>{
        const d=reps[i].bougies;
        const closes=d.map(x=>x.c), highs=d.map(x=>x.h), lows=d.map(x=>x.l);
        seriesCache[iv]=closes; candleCache[iv]=d;
        const price=closes.at(-1), e200=ema(closes,200), r=rsi(closes,14);
        const supC=lows.slice(-60).filter(x=>x<price), resC=highs.slice(-60).filter(x=>x>price);
        const support=supC.length?Math.max(...supC):null, resist=resC.length?Math.min(...resC):null;
        const bull=e200!=null?price>e200:null, nv=netVol(d,20);
        const sc=Math.max(0,Math.min(100,Math.round((bull?60:40)+((r!=null?(r-50):0)*0.3)+(nv>=0?5:-5))));
        cols.push({lab,price,bull,rsi:r,support,resist,net:nv,score:sc,e200,dist:(e200?((price-e200)/e200*100):null)});
      });
      drawRSI();
      const h1=cols.find(c=>c.lab==='H1')||cols[0];
      const bulls=cols.filter(c=>c.bull).length, globalTrend=bulls>=2?'Haussier':'Baissier';
      const scoreG=Math.round(cols.reduce((a,c)=>a+c.score,0)/cols.length);
      const fmt=v=>v==null?'—':v.toLocaleString('fr-FR',{maximumFractionDigits:s.dec});

      let html='<table class="grid"><tr><th>INDIC.</th>';
      cols.forEach(c=>html+=`<th>${c.lab}</th>`); html+='<th>GLOBAL</th></tr>';
      html+='<tr><td>Tendance</td>';
      cols.forEach(c=>html+=`<td class="${c.bull?'cell-bull':'cell-bear'}">${c.bull?'▲ Haus.':'▼ Bais.'}</td>`);
      html+=`<td class="${globalTrend==='Haussier'?'cell-bull':'cell-bear'}">${globalTrend==='Haussier'?'▲':'▼'}</td></tr>`;
      html+='<tr><td>RSI 14</td>';
      cols.forEach(c=>{const v=c.rsi;const cl=v>70?'rsi-hot':v<30?'rsi-cold':'';html+=`<td class="${cl}">${v!=null?v.toFixed(1):'—'}</td>`;});
      html+='<td>—</td></tr>';
      html+='<tr><td>Vol net $</td>';
      cols.forEach(c=>html+=`<td class="${c.net>=0?'bull':'bear'}">${fUsd(c.net)}</td>`);
      html+=`<td class="${h1.net>=0?'bull':'bear'}">${h1.net>=0?'ACHAT':'VENTE'}</td></tr>`;
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
        actif:s.label, symbole:s.tv, unite_graphique:interval==='60'?'H1':'M15',
        tendance_globale:globalTrend, score_global:scoreG,
        tendances:Object.fromEntries(cols.map(c=>[c.lab, c.bull?'Haussier':'Baissier'])),
        rsi:Object.fromEntries(cols.map(c=>[c.lab, c.rsi!=null?+c.rsi.toFixed(1):null])),
        volume_net:Object.fromEntries(cols.map(c=>[c.lab, Math.round(c.net)])),
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
      if(e.code===401){ try{ localStorage.removeItem(CLE_JETON); }catch(_){} demanderJeton('Code refusé par le Worker, vérifie-le.'); return; }
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
