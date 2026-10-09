"use strict";
  /* ═════════════ LECTURE DES DONNÉES UTILES À LA QUESTION ═════════════ */
  let liveData={snaps:[],cal:null,extra:[]};
  let lastCodes=[], lastCodesT=0;   // dernier(s) actif(s) évoqué(s), pour « et le RSI ? »
  async function buildLiveContext(text){
    const stamp=epoch; const live={snaps:[],cal:null,extra:[]}; liveData=live;
    const n=norm(text);
    const parts=[], jobs=[];
    if(MEM_READ_RE.test(n)) return "Justin demande ce que tu as retenu : résume clairement ta MÉMOIRE DURABLE (règles, journal de trades, notes), sans rien inventer. Si elle est vide ou absente, dis-le et rappelle qu'il peut dire « note que… ».";
    if(SELF_RE.test(n)) return "Justin pose une question sur toi-même : réponds à partir de la section CE QUE TU SAIS FAIRE, de façon honnête et précise, sans te sous-estimer.";

    // Vidéo YouTube
    const ytUrl=urlYoutube(text);
    if(ytUrl){ lastVideoUrl=ytUrl; lastVideoUrlT=Date.now(); }
    const wantVideo=!!ytUrl || (/\b(video|youtube|youtubeur)\b/.test(n) && /(analys|resum|regard|explique|que dit|de quoi|visionn|ecoute|decortique|lance)/.test(n) && !(lastVideo && /\b(il|elle) (dit|explique|parle)\b/.test(n)));
    const followVideo=!wantVideo && lastVideo && Date.now()-lastVideo.t<45*60000
      && /\b(video|youtubeur|il dit|elle dit|il explique|elle explique|il parle|elle parle|l'auteur|la chaine|il conseille|sa strategie|sa methode|dans la video)\b/.test(n);

    // Calcul, conversions, devises
    const conv=conversionDevise(n);
    const unit=conv?null:conversionUnite(n);
    const calc=(!conv && !unit && !ytUrl && CALC_RE.test(n)) ? exprDepuis(n) : null;

    const brief=BRIEF_RE.test(n);
    const wantCandles=BOUGIE_RE.test(n) && !wantVideo;
    const wantCal=CAL_RE.test(n)||brief;
    const wantMeteo=METEO_RE.test(n)||brief;
    const newsQ=newsQuery(text);
    const wantNews=!newsQ && (NEWS_RE.test(n)||brief);
    const wantSent=SENT_RE.test(n);
    const wantDrug=DRUG_RE.test(n);
    let codes=(conv||unit||calc||wantVideo)?[]:assetsIn(n);
    const explicitWiki=/wikipedia|encyclopedie/.test(n);
    const wantCode=CODE_RE.test(n) && !codes.length;
    const anato=ANATO_RE.test(n) && ANATO_ASK_RE.test(n);
    const wantWiki=(WIKI_RE.test(n) || anato)
      && (explicitWiki || (!codes.length && !wantMeteo && !wantNews && !newsQ && !wantCode && !wantCandles && !conv && !unit && !calc && !wantVideo && !followVideo && !wantDrug));
    const wantSante=STUDY_RE.test(n) && (ANATO_RE.test(n) || MED_RE.test(n));
    const infoIntent=wantMeteo||wantNews||!!newsQ||wantWiki||wantCode||wantSante||wantDrug||wantSent||!!conv||!!unit||!!calc||wantVideo||followVideo;
    let marketIntent=MARKET_RE.test(n) && !brief && !wantCandles && !conv && !calc && !unit && !wantVideo && !followVideo;
    if(infoIntent && !codes.length && !MARKET_STRONG.test(n)) marketIntent=false;
    if(!codes.length && !wantCal && !marketIntent && !infoIntent && !wantCandles) return '';
    if(!workerReady() && (codes.length||wantCandles||infoIntent)){
      addLine('sys','Données en direct : Worker non configuré — ouvrez ⚙ Réglages');
      return "Le Worker n'est pas configuré : tu ne peux lire aucune donnée en direct (marché, météo, actualités…). Dis-le à Justin.";
    }

    if(wantVideo){
      let u=ytUrl;
      if(!u && lastVideoUrl && Date.now()-lastVideoUrlT<30*60000) u=lastVideoUrl;
      if(!u) u=await urlDepuisPressePapier();
      if(stamp!==epoch) return '';
      if(u){ lastVideoUrl=u; lastVideoUrlT=Date.now(); jobs.push(ctxVideo(u,live,stamp)); }
      else parts.push("Justin veut que tu analyses une vidéo YouTube, mais aucun lien n'a été fourni. Demande-lui de coller le lien dans le champ de texte, ou de le copier puis de redire « analyse la vidéo ».");
    }
    if(followVideo) parts.push(videoContext(lastVideo));
    if(conv) jobs.push(ctxChange(conv,live,stamp));
    if(unit) jobs.push(ctxCalcul(unit,live,stamp));
    if(calc) jobs.push(ctxCalcul(calc,live,stamp));
    if(wantSent) jobs.push(ctxSentiment(live,stamp));
    if(wantDrug) jobs.push(ctxMedicament(text,live,stamp));
    if(newsQ)    jobs.push(ctxNewsQuery(newsQ,live,stamp));
    if(wantMeteo) jobs.push(ctxMeteo(text,live,stamp));
    if(wantNews)  jobs.push(ctxNews(n,live,stamp,brief));
    if(wantWiki)  jobs.push(ctxWiki(text,live,stamp,anato));
    if(wantCode)  jobs.push(ctxMdn(text,live,stamp));
    if(wantSante) jobs.push(ctxSante(text,live,stamp));

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
