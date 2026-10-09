"use strict";
  /* ═════════════ DONNÉES DE MARCHÉ (via le Worker) ═════════════ */
  const MKT={
    NDX:{nom:'le Nasdaq 100 (US100)',dec:1}, SPX:{nom:'le S&P 500 (US500)',dec:1}, DJI:{nom:'le Dow Jones (US30)',dec:0},
    DAX:{nom:'le DAX',dec:1}, CAC:{nom:'le CAC 40',dec:1},
    XAU:{nom:"l'or",dec:2}, XAG:{nom:"l'argent",dec:3}, WTI:{nom:'le pétrole WTI',dec:2}, BRENT:{nom:'le pétrole Brent',dec:2},
    BTC:{nom:'le Bitcoin',dec:0}, ETH:{nom:"l'Ethereum",dec:1}, SOL:{nom:'Solana',dec:2}, XRP:{nom:'le XRP',dec:4},
    BNB:{nom:'le BNB',dec:1}, DOGE:{nom:'le Dogecoin',dec:5}, ADA:{nom:'Cardano',dec:4}, AVAX:{nom:'Avalanche',dec:2}, LINK:{nom:'Chainlink',dec:2},
    EUR:{nom:"l'euro dollar",dec:5}, GBP:{nom:'la livre dollar',dec:5}, JPY:{nom:'le dollar yen',dec:3},
    NVDA:{nom:'Nvidia',dec:2}, AAPL:{nom:'Apple',dec:2}, MSFT:{nom:'Microsoft',dec:2}, AMZN:{nom:'Amazon',dec:2},
    META:{nom:'Meta',dec:2}, GOOGL:{nom:'Alphabet',dec:2}, TSLA:{nom:'Tesla',dec:2}
  };
  const STOCKS=['NVDA','AAPL','MSFT','AMZN','META','GOOGL','TSLA'];
  const CRYPTOS=['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK'];
  const INDICES=['NDX','SPX','DJI','DAX','CAC'];
  const TF_FULL=[['15min','M15'],['1h','H1'],['4h','H4'],['1day','DAILY']];
  const TF_LAB={'1min':'M1','5min':'M5','15min':'M15','30min':'M30','1h':'H1','4h':'H4','1day':'journalier'};
  const A_RE=[
    ['NDX',/nasdaq|\bnas\b|us ?100|ndx|qqq/],
    ['SPX',/\bs ?(?:&|et|and) ?p\b|\bsp ?500|us ?500|\bspx\b/],
    ['DJI',/dow jones|\bdow\b|\bus ?30\b/],
    ['DAX',/\bdax\b|\bger ?40\b/],
    ['CAC',/\bcac\b/],
    ['XAU',/\bor\b|\bgold\b|xau/],
    ['XAG',/\bxag\b|\bsilver\b|cours de l'argent|l'argent (?:metal|spot)/],
    ['BRENT',/\bbrent\b/],
    ['WTI',/petrole|\bwti\b|\bbaril\b|\bcrude\b/],
    ['BTC',/bitcoin|\bbtc\b/],
    ['ETH',/ethereum|\beth\b|\bether\b/],
    ['SOL',/solana|\bsol\b/],
    ['XRP',/\bxrp\b|\bripple\b/],
    ['BNB',/\bbnb\b/],
    ['DOGE',/dogecoin|\bdoge\b/],
    ['ADA',/cardano|\bada\b/],
    ['AVAX',/avalanche|\bavax\b/],
    ['LINK',/chainlink/],
    ['EUR',/euro ?dollar|eur ?usd|\beur\b|l'euro\b/],
    ['GBP',/livre ?dollar|livre sterling|gbp ?usd|\bgbp\b/],
    ['JPY',/dollar ?yen|usd ?jpy|\byen\b/],
    ['NVDA',/nvidia|\bnvda\b/,1], ['AAPL',/\bapple\b|\baapl\b/,1], ['MSFT',/microsoft|\bmsft\b/,1], ['AMZN',/amazon|\bamzn\b/,1],
    ['META',/\bmeta\b|facebook/,1], ['GOOGL',/alphabet|\bgoogle\b|\bgoogl\b/,1], ['TSLA',/tesla|\btsla\b/,1]
  ];
  const ALL_RE=/(tous (les|mes) (marches|actifs|instruments)|tout les marches|vue d.?ensemble|panorama|les (cinq|5) marches|l'ensemble des marches)/;
  const MARKET_RE=/march|nasdaq|\bnas\b|us ?100|bitcoin|\bbtc\b|solana|\bsol\b|\bor\b|gold|xau|euro ?dollar|eur ?usd|\beur\b|l'euro\b|dollar|analys|tendance|\brsi\b|score|support|resistance|volume|situation|niveau|dashboard|setup|position|trade|achat|vente|acheter|vendre|haussier|baissier|moyenne mobile|ma ?200|cours|prix/;
  const MARKET_STRONG=/\b(trading|trade|rsi|support|resistance|tendance|score|dashboard|volume|setup|haussier|baissier)\b/;
  const MARKET_HINT=/action|cours|bourse|analys|bougie|chandel|graphique|prix|cotation|titre|marche|tendance|rsi|support|resistance|trade/;
  const CAL_RE=/calendrier|annonce|agenda|evenement|economique|\bmacro\b|fomc|\bcpi\b|\bnfp\b|inflation|emploi|publication|banque centrale|taux directeur/;
  const CODE_BY_LABEL={'NASDAQ':'NDX','US100':'NDX','BITCOIN':'BTC','SOLANA':'SOL','OR':'XAU','GOLD':'XAU','EUR/USD':'EUR'};
  const UNITE_IV={M1:'1min',M5:'5min',M15:'15min',M30:'30min',H1:'1h',H4:'4h',D1:'1day',D:'1day','1D':'1day',DAILY:'1day',JOUR:'1day'};

  function assetsIn(n){
    if(ALL_RE.test(n)) return ['NDX','XAU','BTC','SOL','EUR'];
    const hint=MARKET_HINT.test(n);
    let c=A_RE.filter(x=>x[1].test(n) && (!x[2]||hint)).map(x=>x[0]);
    if(c.includes('BRENT')) c=c.filter(x=>x!=='WTI');
    return c;
  }
  const codeEcran=()=>{ const b=readBridge(); return (b&&b.actif)?(CODE_BY_LABEL[String(b.actif).toUpperCase()]||null):null; };
  function tfEcran(code){
    const b=readBridge();
    if(!b || !b.unite_graphique || codeEcran()!==code) return null;
    return UNITE_IV[String(b.unite_graphique).toUpperCase().replace(/\s/g,'')]||null;
  }

  async function marcheSeries(code,iv){
    const d=await wjson('/marche?actif='+code+'&intervalle='+iv+'&n=250',25000);
    if(!Array.isArray(d.bougies) || !d.bougies.length) throw new Error('réponse sans données');
    return d;
  }

  // ── Mêmes calculs que les dashboards du terminal ──
  function ema(a,p){ if(a.length<p) return null; const k=2/(p+1); let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p; for(let i=p;i<a.length;i++) e=a[i]*k+e*(1-k); return e; }
  function rsiVal(c,p){ if(c.length<p+1) return null; let g=0,l=0; for(let i=c.length-p;i<c.length;i++){ const d=c[i]-c[i-1]; if(d>=0) g+=d; else l-=d; } const ag=g/p, al=l/p; if(al===0) return 100; return 100-100/(1+ag/al); }
  function netVol(d,n){ let net=0; for(const b of d.slice(-n)) net+=(b.c>=b.o?1:-1)*b.v*b.c; return net; }
  function fUsd(v){ const a=Math.abs(v), sg=v>=0?'+':'-'; return sg+(a>=1e9?(a/1e9).toFixed(2)+' milliards':a>=1e6?(a/1e6).toFixed(2)+' millions':a>=1e3?(a/1e3).toFixed(1)+' mille':a.toFixed(0))+' dollars'; }
  const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);

  const snapCache={};
  async function marketSnapshot(code,tfs){
    const m=MKT[code]; const key=code+':'+tfs.map(x=>x[1]).join('');
    const hit=snapCache[key]; if(hit && Date.now()-hit.t<8*60000) return hit.v;
    const fmt=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:m.dec});
    const stamp0=epoch;
    const cols=[], missing=[], metas=[]; let lastErr=null;
    for(const [iv,lab] of tfs){
      if(stamp0!==epoch) throw new Error('annulé');
      try{
        const rep=await marcheSeries(code,iv); metas.push(rep);
        const d=rep.bougies;
        const closes=d.map(x=>x.c), highs=d.map(x=>x.h), lows=d.map(x=>x.l);
        const price=closes.at(-1), e=ema(closes,200), r=rsiVal(closes,14);
        const supC=lows.slice(-60).filter(x=>x<price), resC=highs.slice(-60).filter(x=>x>price);
        const sup=supC.length?Math.max(...supC):null, res=resC.length?Math.min(...resC):null;
        const hasVol=d.slice(-20).some(b=>b.v>0);
        const nv=hasVol?netVol(d,20):null;
        const bull=e!=null?price>e:null;
        const sc=Math.max(0,Math.min(100,Math.round((bull?60:40)+((r!=null?(r-50):0)*0.3)+(nv==null?0:(nv>=0?5:-5)))));
        cols.push({lab,price,e,r,sup,res,nv,bull,sc});
      }catch(e){ lastErr=e; missing.push(lab+' ('+errMsg(e)+')'); }
    }
    if(!cols.length) throw lastErr||new Error('aucune donnée');
    const ref=cols.find(c=>c.lab==='H1')||cols[0];
    const bulls=cols.filter(c=>c.bull).length;
    const trend=(bulls*2>=cols.length)?'haussière':'baissière';
    const score=Math.round(cols.reduce((a,c)=>a+c.sc,0)/cols.length);
    const volG=ref.nv==null?'':(ref.nv>=0?'acheteur':'vendeur');
    const lines=cols.map(c=>c.lab+' : '+(c.bull==null?'tendance inconnue':(c.bull?'prix au-dessus':'prix sous')+" l'EMA 200")
      +', RSI '+(c.r!=null?c.r.toFixed(1):'—')
      +', volume net '+(c.nv==null?'non fourni pour cet instrument':fUsd(c.nv))
      +', support '+fmt(c.sup)+', résistance '+fmt(c.res)+', score '+c.sc+'/100');
    const meta=metas.find(x=>x.intervalle==='1h')||metas[0]||{};
    const secours=metas.some(x=>x.secours), differe=metas.some(x=>x.differe), perime=metas.some(x=>x.perime);
    const srcTxt='source des données : '+(meta.source||'Worker')+(meta.symbole_source?' ('+meta.symbole_source+')':'')
      +(secours?', relais de secours utilisé':'')+(differe?', données différées':'')+(perime?', ancienne copie car la source ne répond plus':'')
      +(meta.note?' — '+meta.note:'');
    const text=cap(m.nom)+' — prix '+fmt(ref.price)
      +' ; tendance globale '+trend+', score global '+score+'/100'+(volG?', volume net '+volG:'')
      +' ; tableau par unité de temps : '+lines.join(' | ')
      +(missing.length?' ; unités de temps non lues : '+missing.join(', '):'')
      +' ; '+srcTxt+'.';
    const tfTxt=c=>'En '+c.lab+', '+(c.bull==null?'tendance inconnue':'tendance '+(c.bull?'haussière':'baissière'))
      +', RSI '+(c.r!=null?c.r.toFixed(0):'inconnu')+', support '+fmt(c.sup)+', résistance '+fmt(c.res)
      +(c.nv==null?'':', volume net '+(c.nv>=0?'acheteur':'vendeur'))+'.';
    const speech='Pour '+m.nom+', le prix est de '+fmt(ref.price)+'. La tendance globale est '+trend+', avec un score de '+score+' sur 100'+(volG?', et le volume net est '+volG:'')+'. '
      +cols.map(tfTxt).join(' ')
      +(missing.length?" Je n'ai pas pu lire : "+missing.map(x=>x.split(' (')[0]).join(', ')+'.':'')
      +(differe?' Attention, données différées.':'')+(secours?' Source de secours utilisée.':'');
    const v={nom:m.nom,text,speech};
    if(!missing.length) snapCache[key]={t:Date.now(),v};
    return v;
  }

  /* ═════════════ BOUGIE PAR BOUGIE ═════════════ */
  const BOUGIE_RE=/bougie|chandel|chandelier|price action|(?:lis|lire|explique|analyse|decris|decortique|raconte|commente)[sz]?[- ]?(?:moi )?(?:le |mon |ce |la )?(?:graphique|graph|chart)|graphique (?:en detail|bougie)|que (?:dit|raconte|montre) (?:le|mon) graphique/;
  const NUM_MOTS={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,vingt:20,trente:30};
  function tfOf(n){
    if(/\bm1\b|\b1 ?min(?:ute)?s?\b|une minute/.test(n)) return '1min';
    if(/\bm5\b|\b5 ?min(?:ute)?s?\b|cinq minutes/.test(n)) return '5min';
    if(/\bm15\b|\b15 ?min(?:ute)?s?\b|quinze minutes|quart d'heure/.test(n)) return '15min';
    if(/\bm30\b|\b30 ?min(?:ute)?s?\b|trente minutes|demi[- ]heure/.test(n)) return '30min';
    if(/\bh4\b|\b4 ?h(?:eures?)?\b|quatre heures/.test(n)) return '4h';
    if(/\bh1\b|en 1 ?h\b|une heure|\bhoraire\b|\b1 ?heure\b/.test(n)) return '1h';
    if(/\bdaily\b|\bd1\b|journalier|quotidien|\ben jour\b|unite jour|bougies? jours?/.test(n)) return '1day';
    return null;
  }
  function nbBougies(n){
    const n2=n.replace(/\b(une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente)\b(?=\s+(?:dernieres?|bougies?))/g,w=>NUM_MOTS[w]);
    const m=n2.match(/\b(\d{1,2})\s+(?:dernieres?\s+)?bougies?\b/)||n2.match(/\b(?:les|des)\s+(\d{1,2})\s+dernieres?\b/);
    if(m) return Math.max(1,Math.min(30,+m[1]));
    if(/\b(?:la )?derniere bougie\b/.test(n)) return 3;
    return 10;
  }
  async function ctxBougies(code,iv,nb,live,stamp){
    const m=MKT[code];
    addLine('sys','Bougies : lecture de '+m.nom+' en '+TF_LAB[iv]+' ('+nb+' bougies)…');
    try{
      const d=await wjson('/bougies?actif='+encodeURIComponent(code)+'&intervalle='+iv+'&n='+nb,30000);
      if(stamp!==epoch) return '';
      const dec=d.decimales, f=v=>v==null?'—':fmtNum(v,dec), r=d.resume||{};
      const lignes=(d.bougies||[]).map(b=>'• '+b.heure+(b.en_cours?' [EN COURS, pas terminée]':'')+' : '+b.sens
        +', ouverture '+f(b.o)+', haut '+f(b.h)+', bas '+f(b.l)+', clôture '+f(b.c)
        +' ('+(b.variation>=0?'+':'')+f(b.variation)+', '+(b.variation_pct>=0?'+':'')+fmtNum(b.variation_pct,2)+' %)'
        +', amplitude '+b.amplitude+', corps '+b.corps_pct+' %, mèche haute '+b.meche_haute_pct+' %, mèche basse '+b.meche_basse_pct+' %'
        +(b.volume_relatif!=null?', volume x'+fmtNum(b.volume_relatif,2)+' la moyenne':'')
        +(b.rsi!=null?', RSI '+fmtNum(b.rsi,1):'')
        +(b.figures&&b.figures.length?' ; figure : '+b.figures.join(', '):'')
        +(b.notes&&b.notes.length?' ; repères : '+b.notes.join(' ; '):''));
      const der=(d.bougies||[]).at(-1);
      live.extra.push('Sur '+m.nom+' en '+TF_LAB[iv]+', le prix est à '+f(r.prix)+'. '+cap(r.structure||'')+'.'
        +(der?' La dernière bougie est '+der.sens+(der.figures&&der.figures[0]?', '+der.figures[0]:'')+'.':''));
      return 'ANALYSE BOUGIE PAR BOUGIE — '+cap(m.nom)+' ('+d.nom+') en '+TF_LAB[iv]+' : '+(d.bougies||[]).length+' dernières bougies, de la plus ancienne à la plus récente '
        +'(heures de Paris, l\'heure est celle de l\'ouverture de la bougie ; corps et mèches en pourcentage de la hauteur totale ; amplitude comparée à l\'ATR 14 ; RSI 14 méthode Wilder comme TradingView ; volume relatif = volume divisé par la moyenne des 20 bougies précédentes) ; '
        +'source '+d.source+(d.symbole_source?' ('+d.symbole_source+')':'')+(d.differe?', données différées':'')+(d.secours?', relais de secours':'')+(d.perime?', ancienne copie':'')+(d.note?' — '+d.note:'')+'.\n'
        +lignes.join('\n')+'\n'
        +'RÉSUMÉ : prix actuel '+f(r.prix)+', variation sur la séquence '+(r.variation_sequence_pct>=0?'+':'')+fmtNum(r.variation_sequence_pct,2)+' %'
        +', plus haut de la séquence '+f(r.plus_haut_sequence)+', plus bas '+f(r.plus_bas_sequence)
        +', '+r.bougies_haussieres+' bougies haussières et '+r.bougies_baissieres+' baissières'
        +' ; structure : '+r.structure+', dernier sommet '+f(r.dernier_sommet)+', dernier creux '+f(r.dernier_creux)
        +' ; résistance proche '+f(r.resistance_proche)+', support proche '+f(r.support_proche)
        +' ; EMA 20 '+f(r.ema20)+', EMA 50 '+f(r.ema50)+', EMA 200 '+f(r.ema200)+(r.biais_ema200?' ('+r.biais_ema200+')':'')
        +' ; RSI '+(r.rsi!=null?fmtNum(r.rsi,1):'—')+' ; ATR 14 '+f(r.atr)+' (taille moyenne d\'une bougie).';
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Bougies : '+errMsg(e));
      return 'ANALYSE BOUGIE PAR BOUGIE impossible pour '+m.nom+' ('+errMsg(e)+') : dis-le simplement, n\'invente aucune bougie.';
    }
  }

  /* ═════════════ CONTEXTE GLOBAL (VIX, dollar, taux, sentiment, séance US) ═════════════ */
  function seanceUS(){
    try{
      const ny=new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
      const d=ny.getDay(), m=ny.getHours()*60+ny.getMinutes();
      const dur=x=>x>=60?Math.floor(x/60)+' h '+String(x%60).padStart(2,'0'):x+' min';
      if(d===0||d===6) return 'séance américaine fermée (week-end)';
      if(m<570) return 'séance américaine pas encore ouverte (ouverture dans '+dur(570-m)+')';
      if(m<960) return 'séance américaine ouverte (clôture dans '+dur(960-m)+')';
      return "séance américaine terminée pour aujourd'hui";
    }catch(e){ return ''; }
  }
  const pctTxt=v=>v==null?'':' ('+(v>=0?'+':'')+fmtNum(v,2)+' %)';
  async function ctxGlobal(codes,stamp){
    const out=[]; const s=seanceUS(); if(s) out.push(s);
    const [cx,se]=await Promise.all([
      wjsonCache('/contexte',12000,300000).catch(()=>null),
      wjsonCache('/sentiment',12000,600000).catch(()=>null)
    ]);
    if(stamp!==epoch) return '';
    const actions=codes.some(c=>INDICES.includes(c)||STOCKS.includes(c));
    const crypto=codes.some(c=>CRYPTOS.includes(c));
    if(cx && Array.isArray(cx.lignes)){
      const macro=cx.lignes.filter(x=>x.prix!=null && ['VIX','DXY','US10Y'].includes(x.id));
      if(macro.length) out.push(macro.map(x=>x.label+' '+fmtNum(x.prix)+(x.unite||'')+pctTxt(x.variation_pct)).join(', '));
      if(codes.includes('NDX')){
        const st=cx.lignes.filter(x=>x.prix!=null && !['VIX','DXY','US10Y'].includes(x.id));
        if(st.length) out.push('grosses valeurs du Nasdaq : '+st.map(x=>x.label+pctTxt(x.variation_pct)).join(', '));
      }
    }
    if(se){
      const a=se.actions_peur_avidite, c=se.crypto_peur_avidite, g=se.crypto_global;
      if(actions && a && a.score!=null) out.push('indice peur et avidité actions (CNN) '+a.score+' sur 100, '+a.etat);
      if(crypto && c && c.score!=null) out.push('indice peur et avidité crypto '+c.score+' sur 100, '+c.etat);
      if(crypto && g && g.dominance_btc!=null) out.push('dominance du Bitcoin '+fmtNum(g.dominance_btc,1)+' %, capitalisation crypto'+pctTxt(g.variation_24h_pct)+' sur 24 h');
    }
    return out.length ? 'CONTEXTE GLOBAL (à glisser en une ou deux phrases, pas en inventaire) : '+out.join(' ; ')+'.' : '';
  }
