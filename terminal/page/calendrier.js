"use strict";
  /* ═════════════ CALENDRIER ÉCONOMIQUE ═════════════ */
  const CAL_KEY='rayle_cal_cache', CAL_URL='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  let calVia='';
  function calStored(){ try{ const c=JSON.parse(localStorage.getItem(CAL_KEY)||'null'); return (c && Array.isArray(c.data) && c.data.length) ? c : null; }catch(e){ return null; } }
  function repoRawUrl(){
    try{
      const h=location.hostname; if(!/\.github\.io$/i.test(h)) return null;
      const user=h.split('.')[0], repo=location.pathname.split('/')[1];
      return repo ? 'https://raw.githubusercontent.com/'+user+'/'+repo+'/main/calendar.json' : null;
    }catch(e){ return null; }
  }
  async function fetchCalendar(force){
    const st=calStored();
    if(!force && st && Date.now()-st.t<3600000){ calVia='mémoire locale'; return st.data; }
    const bust='?t='+Math.floor(Date.now()/300000);
    const tries=[];
    if(workerReady()) tries.push(['Worker Raylé',null]);
    const raw=repoRawUrl();
    if(raw) tries.push(['relais GitHub',raw+bust]);
    tries.push(['fichier du site','calendar.json'+bust]);
    tries.push(['flux direct',CAL_URL]);
    tries.push(['passerelle publique','https://api.allorigins.win/raw?url='+encodeURIComponent(CAL_URL)]);
    const fails=[];
    for(const [how,u] of tries){
      try{
        const res = u===null ? await wfetch('/calendar',{method:'GET'},12000) : await fetchT(u,{method:'GET'},7000);
        if(!res.ok) throw new Error('code '+res.status);
        const j=await res.json();
        if(!Array.isArray(j)||!j.length) throw new Error('format inattendu');
        try{ localStorage.setItem(CAL_KEY,JSON.stringify({t:Date.now(),data:j})); }catch(e){}
        calVia=how; return j;
      }catch(e){ fails.push(how+' : '+((e&&e.name==='AbortError')?'délai dépassé':((e&&e.message)||e))); }
    }
    if(st){ calVia='copie précédente'; return st.data; }
    throw new Error(fails.join(' · '));
  }

  function calSummary(events){
    const tz='Europe/Paris', now=Date.now();
    const day=t=>new Date(t).toLocaleDateString('fr-CA',{timeZone:tz});
    const hm=t=>new Date(t).toLocaleTimeString('fr-FR',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).replace(':','h');
    const cur=['USD','EUR','GBP','JPY'];
    const list=(events||[]).map(e=>({t:Date.parse(e.date),cur:String(e.country||'').toUpperCase(),imp:String(e.impact||''),title:String(e.title||''),f:e.forecast,p:e.previous,a:e.actual}))
      .filter(e=>isFinite(e.t)&&cur.includes(e.cur)&&/^(High|Medium)$/i.test(e.imp))
      .sort((a,b)=>a.t-b.t);
    const today=day(now), tomorrow=day(now+86400000);
    const fE=e=>hm(e.t)+' '+e.cur+' '+e.title+' ['+(/high/i.test(e.imp)?'fort':'moyen')+']'
      +(e.a?' publié '+e.a:'')+(e.f?' prévu '+e.f:'')+(e.p?' précédent '+e.p:'')+((e.t<now&&!e.a)?' (déjà tombé)':'');
    const td_=list.filter(e=>day(e.t)===today), tm_=list.filter(e=>day(e.t)===tomorrow);
    const upHigh=list.filter(e=>e.t>now&&/high/i.test(e.imp)).slice(0,3);
    let text="CALENDRIER ÉCONOMIQUE de la semaine (heure de Paris, impact fort ou moyen, devises USD EUR GBP JPY ; le flux ne fournit pas les valeurs publiées, ne les invente pas). ";
    text+="Aujourd'hui : "+(td_.length?td_.slice(0,10).map(fE).join(' ; '):'aucune annonce importante')+". ";
    text+="Demain : "+(tm_.length?tm_.slice(0,8).map(fE).join(' ; '):'aucune annonce importante dans le calendrier')+". ";
    if(upHigh.length) text+="Prochaines annonces à fort impact : "+upHigh.map(e=>day(e.t)+' à '+hm(e.t)+' '+e.cur+' '+e.title).join(' ; ')+".";
    const next=list.filter(e=>e.t>now).slice(0,3);
    const when=e=>day(e.t)===today?"aujourd'hui":(day(e.t)===tomorrow?'demain':new Date(e.t).toLocaleDateString('fr-FR',{timeZone:tz,weekday:'long'}));
    const speech=next.length
      ? "Prochaines annonces importantes, heure de Paris : "+next.map(e=>when(e)+' à '+hm(e.t).replace('h',' heures ')+', '+e.cur+', '+e.title).join(' ; ')+'.'
      : "Je ne vois aucune annonce importante à venir dans le calendrier de la semaine.";
    return {text,speech};
  }
