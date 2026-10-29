"use strict";
/* ═════════════ DONNÉES DE MARCHÉ DE LA COQUE MOBILE (V8) ═════════════
   Cryptos (BTC, SOL, DOGE) : directement depuis Binance (data-api.binance.vision : public, sans clé, CORS ouvert) : le téléphone n'a besoin ni du Worker ni du PC.
   Or et US100 : par le Worker de Raylé (mêmes cotations que le terminal) quand il est déverrouillé ; sinon la ligne dit « indisponible » (jamais un cours inventé).
   Bougies du graphique tactile : klines Binance (M15, H1, H4) avec volume et volume acheteur agressif (donc un DELTA réel).
   Chaque lecture porte sa source et son heure. */
(function(){
  const BASE='https://data-api.binance.vision/api/v3';
  const CRYPTOS=[{id:'BTC',nom:'Bitcoin',sym:'BTCUSDT',dec:0},{id:'SOL',nom:'Solana',sym:'SOLUSDT',dec:2},{id:'DOGE',nom:'Dogecoin',sym:'DOGEUSDT',dec:5}];
  const AUTRES=[{id:'XAU',nom:'Or'},{id:'US100',nom:'US100'}];
  const INTERVALLES={M15:'15m',H1:'1h',H4:'4h'};
  const avecDelai=(url,ms=10000)=>fetch(url,{signal:AbortSignal.timeout(ms),cache:'no-store'}).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); });
  const nombre=x=>{ const n=Number(x); return Number.isFinite(n)?n:null; };

  async function lireCryptos(){
    const syms=CRYPTOS.map(c=>c.sym);
    const [tick,...spark]=await Promise.all([
      avecDelai(BASE+'/ticker/24hr?symbols='+encodeURIComponent(JSON.stringify(syms))),
      ...CRYPTOS.map(c=>avecDelai(BASE+'/klines?symbol='+c.sym+'&interval=1h&limit=24').catch(()=>null))
    ]);
    const parSym=new Map((tick||[]).map(t=>[t.symbol,t]));
    return CRYPTOS.map((c,i)=>{
      const t=parSym.get(c.sym); if(!t) return {id:c.id,nom:c.nom,vide:true,erreur:'cotation absente'};
      return {id:c.id,nom:c.nom,prix:nombre(t.lastPrice),pct:nombre(t.priceChangePercent),decimales:c.dec,courbe:(spark[i]||[]).map(k=>nombre(k[4])).filter(x=>x!=null),source:'Binance',t:Date.now()};
    });
  }
  let modWorker=null;
  const chargerWorker=()=>modWorker||(modWorker=Promise.all([import(new URL('planetes/mars/pc/trading/session.js',document.baseURI).href),import(new URL('planetes/mars/pc/trading/cotations.js',document.baseURI).href)]).then(([s,c])=>({s,c})).catch(e=>{ modWorker=null; throw e; }));
  async function lireAutres(){
    let pret=false; try{ pret=typeof workerReady==='function'&&!!workerReady(); }catch(e){}
    if(!pret) return AUTRES.map(a=>({id:a.id,nom:a.nom,vide:true,erreur:'Raylé est verrouillée'}));
    try{
      const {s,c}=await chargerWorker(), client=await s.obtenirClient(), l=await c.lireCotations(client,AUTRES.map(a=>a.id));
      return AUTRES.map(a=>{ const q=(l||[]).find(x=>x.id===a.id); return q&&!q.vide?{id:a.id,nom:a.nom,prix:q.prix,pct:q.pct,decimales:q.decimales,courbe:q.courbe||[],source:q.source||'Worker',t:q.t||Date.now(),differe:!!q.differe,perime:!!q.perime}:{id:a.id,nom:a.nom,vide:true,erreur:(q&&q.erreur)||'cotation indisponible'}; });
    }catch(e){ return AUTRES.map(a=>({id:a.id,nom:a.nom,vide:true,erreur:String((e&&e.message)||e).slice(0,80)})); }
  }
  /* Toutes les lignes de la liste de marché : les cryptos ne dépendent de rien ; si Binance tombe mais que le reste répond, on garde le reste. */
  async function lire(){
    const [c,a]=await Promise.allSettled([lireCryptos(),lireAutres()]);
    if(c.status==='rejected'&&a.status==='rejected') throw c.reason;
    const lc=c.status==='fulfilled'?c.value:CRYPTOS.map(x=>({id:x.id,nom:x.nom,vide:true,erreur:'Binance injoignable'}));
    return lc.concat(a.status==='fulfilled'?a.value:AUTRES.map(x=>({id:x.id,nom:x.nom,vide:true,erreur:'indisponible'})));
  }
  /* Bougies : [t, ouverture, haut, bas, clôture, volume, volumeAcheteurAgressif]. actif BTC | SOL | DOGE. */
  async function bougies(actif,tf='M15',limite=240){
    const c=CRYPTOS.find(x=>x.id===actif); if(!c) throw new Error('actif non géré : '+actif);
    const iv=INTERVALLES[tf]||'15m';
    const k=await avecDelai(BASE+'/klines?symbol='+c.sym+'&interval='+iv+'&limit='+Math.min(1000,limite),12000);
    return k.map(x=>[x[0],nombre(x[1]),nombre(x[2]),nombre(x[3]),nombre(x[4]),nombre(x[5]),nombre(x[9])]).filter(b=>b[1]!=null&&b[4]!=null);
  }
  window.MobileMarche={lire,bougies,CRYPTOS,AUTRES,INTERVALLES};
})();
