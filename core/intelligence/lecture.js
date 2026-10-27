"use strict";
  /* ═════════════ LECTURE DES DONNÉES UTILES À LA QUESTION ═════════════ */
  const BRIEF_RE=/(briefing|brief du|point du matin|resume (de la )?(journee|matinee|du jour)|programme (de la journee|du jour)|bilan du jour|bulletin)/;
  const SENT_RE=/sentiment|peur et (?:cupidite|avidite)|fear (?:and|&) greed|panique du marche|euphorie|dominance|capitalisation (?:crypto|totale)/;
  const SELF_RE=/\b(toi[- ]meme|tes (?:limites|capacites|fonctions|fonctionnalites|outils|commandes|points faibles|defauts|competences)|ce que tu (?:sais|peux) faire|tu sais faire quoi|tu peux faire quoi|qu'?est[- ]ce que tu (?:sais|peux) faire|t'?ameliorer|ameliore chez toi|te rendre (?:plus )?(?:performante?|forte?|intelligente?)|qui es[- ]tu|presente[- ]toi|comment tu fonctionnes|ton fonctionnement|tes commandes vocales)\b/;

  async function ctxSentiment(live,stamp){
    addLine('sys','Sentiment de marché : lecture…');
    try{
      const d=await wjsonCache('/sentiment',15000,600000);
      if(stamp!==epoch) return '';
      const a=d.actions_peur_avidite||{}, c=d.crypto_peur_avidite||{}, g=d.crypto_global||{};
      const p=[];
      if(a.score!=null) p.push('actions (CNN) : '+a.score+' sur 100, '+a.etat+(a.veille!=null?', la veille '+a.veille:'')+(a.semaine_derniere!=null?', il y a une semaine '+a.semaine_derniere:''));
      if(c.score!=null) p.push('crypto : '+c.score+' sur 100, '+c.etat+(c.veille!=null?', la veille '+c.veille:''));
      if(g.dominance_btc!=null) p.push('dominance du Bitcoin '+fmtNum(g.dominance_btc,1)+' %, Ethereum '+fmtNum(g.dominance_eth,1)+' %, capitalisation crypto totale '+fmtNum(g.capitalisation_totale_milliards,0)+' milliards de dollars'+pctTxt(g.variation_24h_pct)+' sur 24 h');
      if(c.score!=null) live.extra.push("L'indice de peur et d'avidité crypto est à "+c.score+', '+c.etat+'.');
      return p.length ? 'SENTIMENT DE MARCHÉ (indices de peur et d\'avidité : 0 = peur extrême, 100 = avidité extrême) : '+p.join(' ; ')+'.' : 'SENTIMENT DE MARCHÉ : indisponible.';
    }catch(e){
      if(stamp!==epoch) return '';
      return 'SENTIMENT DE MARCHÉ : indisponible ('+errMsg(e)+').';
    }
  }

  let liveData={snaps:[],cal:null,extra:[]};
  let lastCodes=[], lastCodesT=0;   // dernier(s) actif(s) évoqué(s), pour « et le RSI ? »
  async function buildLiveContext(text){
    const stamp=epoch; const live={snaps:[],cal:null,extra:[]}; liveData=live;
    const n=norm(text);
    const parts=[], jobs=[];
    if(MEM_READ_RE.test(n)) return "Justin demande ce que tu as retenu : résume clairement ta MÉMOIRE DURABLE (règles, journal de trades, notes), sans rien inventer. Si elle est vide ou absente, dis-le et rappelle qu'il peut dire « note que… ».";
    if(SELF_RE.test(n)) return "Justin pose une question sur toi-même : réponds à partir de la section CE QUE TU SAIS FAIRE, de façon honnête et précise, sans te sous-estimer.";

    const brief=BRIEF_RE.test(n);
    const wantCandles=BOUGIE_RE.test(n);
    const wantCal=CAL_RE.test(n)||brief;
    const wantSent=SENT_RE.test(n);
    let codes=assetsIn(n);
    const infoIntent=wantSent;
    let marketIntent=MARKET_RE.test(n) && !brief && !wantCandles;
    if(infoIntent && !codes.length && !MARKET_STRONG.test(n)) marketIntent=false;
    if(!codes.length && !wantCal && !marketIntent && !infoIntent && !wantCandles) return '';
    if(!workerReady() && (codes.length||wantCandles||infoIntent)){
      addLine('sys','Données en direct : Worker non configuré — ouvrez ⚙ Réglages');
      return "Le Worker n'est pas configuré : tu ne peux lire aucune donnée en direct (marché, actualités…). Dis-le à Justin.";
    }

    if(wantSent) jobs.push(ctxSentiment(live,stamp));

    // Bougie par bougie
    if(wantCandles){
      let c=codes[0]||null;
      if(!c && lastCodes.length && Date.now()-lastCodesT<15*60000) c=lastCodes[0];
      if(!c) c=codeEcran();
      if(!c) parts.push("Justin veut une lecture bougie par bougie mais n'a cité aucun actif : demande-lui lequel (Nasdaq, or, Bitcoin, Solana, Ethereum, euro dollar…).");
      else{
        lastCodes=[c]; lastCodesT=Date.now();
        const iv=tfOf(n)||tfEcran(c)||'1h';
        jobs.push(ctxBougies(c,iv,nbBougies(n),live,stamp));
        jobs.push(ctxGlobal([c],stamp));
      }
    }
    const infoP=Promise.all(jobs);

    // Analyse classique (tableau multi-unités de temps)
    if(!wantCandles){
      if(!codes.length && marketIntent && !wantCal){
        const c=codeEcran();
        if(lastCodes.length && Date.now()-lastCodesT<15*60000) codes=lastCodes.slice();
        else if(c) codes=[c];
        else parts.push("Justin n'a cité aucun actif : demande-lui lequel il souhaite (Nasdaq, Bitcoin, Solana, or, euro dollar ou un autre).");
      }
      if(codes.length){
        lastCodes=codes.slice(); lastCodesT=Date.now();
        const quick=codes.length>=3, tfs=quick?[['1h','H1']]:TF_FULL;
        const globalP=ctxGlobal(codes,stamp);
        const snaps=[];
        for(const c of codes){
          addLine('sys','Marché : lecture '+MKT[c].nom+(quick?' (H1)':'')+'…');
          try{ const sn=await marketSnapshot(c,tfs); if(stamp!==epoch) return ''; live.snaps.push(sn); snaps.push(sn.text); }
          catch(e){ if(stamp!==epoch) return ''; addLine('sys','Marché ('+MKT[c].nom+') : '+errMsg(e)); snaps.push("Données de "+MKT[c].nom+" indisponibles ("+errMsg(e)+") : ne les invente pas."); }
        }
        if(snaps.length){
          parts.push("DONNÉES DE MARCHÉ EN DIRECT (via le Worker ; tendance = prix au-dessus ou sous l'EMA 200 ; volume net = volume acheteur moins vendeur en dollars sur les 20 dernières bougies) :");
          snaps.forEach(x=>parts.push(x));
        }
        const g=await globalP; if(stamp!==epoch) return '';
        if(g) parts.push(g);
      }
    }

    if(wantCal || marketIntent || wantCandles){
      try{
        let ev;
        if(wantCal) ev=await fetchCalendar(false);
        else{ const st=calStored(); ev=(st && Date.now()-st.t<12*3600000)?st.data:null; }
        if(stamp!==epoch) return '';
        if(ev){ const cs=calSummary(ev); live.cal=wantCal?cs:null; parts.push(cs.text); }
      }catch(e){
        if(stamp!==epoch) return '';
        addLine('sys','Calendrier économique : '+errMsg(e));
        if(wantCal) parts.push("Le calendrier économique est indisponible pour le moment : ne l'invente pas.");
      }
    }

    const infos=await infoP;
    if(stamp!==epoch) return '';
    infos.filter(Boolean).forEach(x=>parts.push(x));
    return parts.join('\n');
  }
