/* ═════════════ TABLEAU DE BORD DE L'ACCUEIL : CONTENU PUR (testé sous Node : galaxie/tests/tableau-bord-test.mjs) ═════════════
   Tout ce que le tableau de bord décide sans toucher à la page : liste des fenêtres, réglages (affichage, côté, ordre), formats de nombres,
   mini-courbes, météo (codes WMO), séismes, lignes de l'agent de trading, états du micro. Rien n'est inventé : une donnée absente devient
   « indisponible » avec sa raison. Utilisable dans la page (window.TableauBordContenu) et sous Node (module.exports). */
(function(racine){
  "use strict";
  /* id, titre, côté par défaut (g | d), rang, vue complète ouverte au clic */
  const FENETRES=[
    {id:'heure',   titre:'Heure et date',        cote:'g', rang:1, ouvre:'reglages'},
    {id:'meteo',   titre:'Météo',                cote:'g', rang:2, ouvre:'meteo'},
    {id:'actus',   titre:'Actualités',           cote:'g', rang:3, ouvre:'actus'},
    {id:'systeme', titre:'Système',              cote:'g', rang:4, ouvre:'reglages'},
    {id:'agent',   titre:'Agent de trading',     cote:'d', rang:1, ouvre:'agent'},
    {id:'marche',  titre:'Marché',               cote:'d', rang:2, ouvre:'terminal'},
    {id:'terre',   titre:'Événements Terre',     cote:'d', rang:3, ouvre:'terre'}
  ];
  const CLE='rayle_tableau_bord', COTES=['g','d'], LARGEUR_MIN=1100;
  const parId=id=>FENETRES.find(f=>f.id===id)||null;

  /* ───── réglages (stockés sur l'appareil seulement, jamais synchronisés) ───── */
  function reglagesParDefaut(){
    const fenetres={}; for(const f of FENETRES) fenetres[f.id]={visible:true,cote:f.cote,rang:f.rang};
    return {version:1,actif:true,fenetres,meteo:{nom:'',lat:null,lon:null}};
  }
  function normaliserReglages(brut){
    const d=reglagesParDefaut(); if(!brut||typeof brut!=='object') return d;
    if(brut.actif===false) d.actif=false;
    for(const f of FENETRES){
      const b=brut.fenetres&&brut.fenetres[f.id]; if(!b||typeof b!=='object') continue;
      if(b.visible===false) d.fenetres[f.id].visible=false;
      if(COTES.includes(b.cote)) d.fenetres[f.id].cote=b.cote;
      if(Number.isFinite(b.rang)) d.fenetres[f.id].rang=Math.max(0,Math.min(99,Math.round(b.rang)));
    }
    const m=brut.meteo;
    if(m&&typeof m==='object'&&Number.isFinite(m.lat)&&Number.isFinite(m.lon)&&Math.abs(m.lat)<=90&&Math.abs(m.lon)<=180) d.meteo={nom:String(m.nom||'').slice(0,60),lat:Math.round(m.lat*1000)/1000,lon:Math.round(m.lon*1000)/1000};
    return d;
  }
  const lireReglages=lire=>{ try{ return normaliserReglages(JSON.parse(lire(CLE)||'null')); }catch(e){ return reglagesParDefaut(); } };
  const ecrireReglages=(ecrire,r)=>{ try{ ecrire(CLE,JSON.stringify(normaliserReglages(r))); return true; }catch(e){ return false; } };
  /* fenêtres à afficher, par côté, dans l'ordre choisi ; limite selon le mode : léger = quatre fenêtres essentielles */
  function disposition(r,mode){
    r=normaliserReglages(r); const out={g:[],d:[]};
    if(!r.actif) return out;
    const LEGER=['heure','marche','agent','systeme'];
    const l=FENETRES.filter(f=>r.fenetres[f.id].visible&&(mode!=='leger'||LEGER.includes(f.id)));
    for(const f of l) out[r.fenetres[f.id].cote].push({id:f.id,titre:f.titre,ouvre:f.ouvre,rang:r.fenetres[f.id].rang});
    for(const c of COTES) out[c].sort((a,b)=>a.rang-b.rang||FENETRES.findIndex(f=>f.id===a.id)-FENETRES.findIndex(f=>f.id===b.id));
    return out;
  }
  const assezLarge=largeur=>largeur>=LARGEUR_MIN;
  function deplacer(r,id,sens){      // sens : 'haut' | 'bas' | 'g' | 'd'
    r=normaliserReglages(r); const f=r.fenetres[id]; if(!f) return r;
    if(sens==='g'||sens==='d'){ f.cote=sens; f.rang=99; }
    else{
      const voisins=FENETRES.filter(x=>r.fenetres[x.id].cote===f.cote).sort((a,b)=>r.fenetres[a.id].rang-r.fenetres[b.id].rang||FENETRES.indexOf(a)-FENETRES.indexOf(b)).map(x=>x.id);
      const i=voisins.indexOf(id), j=sens==='haut'?i-1:i+1; if(j>=0&&j<voisins.length){ voisins.splice(j,0,voisins.splice(i,1)[0]); }
      voisins.forEach((v,k)=>{ r.fenetres[v].rang=k+1; });
    }
    FENETRES.filter(x=>r.fenetres[x.id].cote===f.cote).sort((a,b)=>r.fenetres[a.id].rang-r.fenetres[b.id].rang).forEach((x,k)=>{ r.fenetres[x.id].rang=k+1; });
    return r;
  }

  /* ───── nombres ───── */
  const NF={};
  function nombre(x,dec){ if(!Number.isFinite(x)) return '—'; const k=String(dec); (NF[k]||(NF[k]=new Intl.NumberFormat('fr-FR',{minimumFractionDigits:dec,maximumFractionDigits:dec}))); return NF[k].format(x); }
  function prix(x,dec){ if(!Number.isFinite(x)) return '—'; const d=dec!=null?dec:(Math.abs(x)>=1000?0:Math.abs(x)>=100?1:Math.abs(x)>=1?2:5); return nombre(x,d); }
  function variation(pct){ if(!Number.isFinite(pct)) return {texte:'—',sens:0}; const s=pct>0.005?1:pct<-0.005?-1:0; return {texte:(s>0?'+':s<0?'−':'')+nombre(Math.abs(pct),2)+' %',sens:s}; }
  function age(t,maintenant){ if(!Number.isFinite(t)) return '—'; const m=Math.max(0,Math.floor((maintenant-t)/60000)); return m<1?'à l’instant':m<60?'il y a '+m+' min':m<1440?'il y a '+Math.floor(m/60)+' h':'il y a '+Math.floor(m/1440)+' j'; }

  /* ───── mini-courbe : chemin SVG d'une série (échelle propre à la série), dernier point, sens ───── */
  function courbe(valeurs,l,h,marge=2,plancher=0.005){
    const v=(valeurs||[]).filter(Number.isFinite); if(v.length<2) return null;
    let min=Math.min(...v), max=Math.max(...v); const mini=Math.abs(v.reduce((a,b)=>a+b,0)/v.length)*plancher;   // amplitude affichée ≥ 0,5 % du niveau : une série très calme (l'or) ne ressemble plus à un zigzag
    if(max-min<mini){ const c=(max+min)/2; min=c-mini/2; max=c+mini/2; }
    const p=max-min||1, pas=(l-2*marge)/(v.length-1);
    const pts=v.map((y,i)=>[+(marge+i*pas).toFixed(1),+(marge+(h-2*marge)*(1-(y-min)/p)).toFixed(1)]);
    return {d:'M'+pts.map(q=>q.join(' ')).join(' L'),dernier:pts[pts.length-1],sens:v[v.length-1]>=v[0]?1:-1,n:v.length};
  }

  /* ───── météo (Open-Meteo : codes WMO) ───── */
  function categorieMeteo(code){
    if(code===0||code===1) return 'soleil'; if(code===2) return 'eclaircies'; if(code===3) return 'nuageux';
    if(code===45||code===48) return 'brouillard'; if(code>=51&&code<=57) return 'bruine'; if((code>=61&&code<=67)||(code>=80&&code<=82)) return 'pluie';
    if((code>=71&&code<=77)||code===85||code===86) return 'neige'; if(code>=95&&code<=99) return 'orage'; return 'nuageux';
  }
  const LIBELLES={soleil:'Ciel dégagé',eclaircies:'Éclaircies',nuageux:'Nuageux',brouillard:'Brouillard',bruine:'Bruine',pluie:'Pluie',neige:'Neige',orage:'Orage'};
  const libelleMeteo=code=>LIBELLES[categorieMeteo(code)];
  const JOURS=['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'];
  function resumeMeteo(j,nom){
    const c=j&&j.current; if(!c||!Number.isFinite(c.temperature_2m)) return {etat:'indisponible',raison:'réponse de la météo illisible'};
    const d=j.daily||{}, jours=[];
    for(let i=0;i<Math.min(3,(d.time||[]).length);i++){
      const t=new Date(d.time[i]+'T12:00:00'); if(Number.isNaN(+t)) continue;
      jours.push({jour:i===0?'auj.':JOURS[t.getDay()],min:d.temperature_2m_min&&d.temperature_2m_min[i],max:d.temperature_2m_max&&d.temperature_2m_max[i],pluiePct:d.precipitation_probability_max&&d.precipitation_probability_max[i],categorie:categorieMeteo(d.weather_code&&d.weather_code[i]),libelle:libelleMeteo(d.weather_code&&d.weather_code[i])});
    }
    return {etat:'ok',nom:nom||'',temp:c.temperature_2m,ressenti:Number.isFinite(c.apparent_temperature)?c.apparent_temperature:null,categorie:categorieMeteo(c.weather_code),libelle:libelleMeteo(c.weather_code),
      vent:Number.isFinite(c.wind_speed_10m)?Math.round(c.wind_speed_10m):null,pluie:Number.isFinite(c.precipitation)?c.precipitation:null,jours};
  }
  const urlMeteo=(lat,lon)=>'https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3';
  const urlGeocodage=nom=>'https://geocoding-api.open-meteo.com/v1/search?count=5&language=fr&format=json&name='+encodeURIComponent(nom);
  function resultatsGeocodage(j){ return ((j&&j.results)||[]).filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).map(r=>({nom:[r.name,r.admin1,r.country].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', '),lat:r.latitude,lon:r.longitude})); }

  /* ───── séismes et événements naturels (core/direct/evenements-calcul.js) ───── */
  function lignesEvenements(evts,maintenant,max=4){
    const l=(evts||[]).filter(e=>e&&Number.isFinite(e.t)&&maintenant-e.t<48*3600e3).slice().sort((a,b)=>(b.severite||0)-(a.severite||0)||b.t-a.t).slice(0,max);
    return l.map(e=>({id:e.id,type:e.type,titre:String(e.titre||'').replace(/^Séisme M\s*/,'M ').slice(0,70),severite:e.severite||0,age:age(e.t,maintenant),url:e.url||null}));
  }

  /* ───── agent de trading (données de planetes/mars/pc/trading/fenetres-m6.js : construireReels) ───── */
  const tonNiveau=n=>n==='VERT'?'ok':n==='ORANGE'?'attention':(n==='ROUGE'||n==='BLOQUE')?'alerte':'neutre';
  function lignesAgent(reels,pilote){
    const l=[]; reels=reels||{};
    if(pilote&&pilote.paires&&pilote.paires.length){
      l.push({nom:'État',valeur:pilote.enRecherche?'recherche en cours':'recherche à l’arrêt',ton:pilote.enRecherche?'ok':'neutre',detail:pilote.valides+' stratégie'+(pilote.valides>1?'s':'')+' validée'+(pilote.valides>1?'s':'')+' · '+pilote.paires.join(', ')});
    }else l.push({nom:'État',valeur:'non activé',ton:'neutre',detail:'ouvre l’agent pour l’activer'});
    const r=reels['regime-marche'];
    if(r&&r.etat==='ok'&&r.liste&&r.liste.length) l.push({nom:'Régime',valeur:r.liste[0].d,ton:'neutre',detail:r.liste[0].g});
    else l.push({nom:'Régime',valeur:'—',ton:'neutre',detail:r&&r.message?r.message:'pas encore calculé'});
    const p=reels['propositions-agent'];
    if(p&&p.etat==='ok'&&p.liste&&p.liste.length) l.push({nom:'Signaux',valeur:p.liste[0].g,ton:/PASS/.test(p.liste[0].d)?'ok':/BLOCK/.test(p.liste[0].d)?'alerte':'attention',detail:p.liste[0].d+(p.etiquette==='SIMULÉ'?' · simulé':'')});
    else l.push({nom:'Signaux',valeur:'aucun',ton:'neutre',detail:p&&p.vide?p.vide:'pas de setup en cours'});
    const g=reels['gardien-prop'];
    if(g&&g.etat==='ok'){ const niv=String(g.pied||'').split(' ')[0]; l.push({nom:'Gardien prop',valeur:niv||'—',ton:tonNiveau(niv),detail:String(g.pied||'').replace(/^\S+\s·\s?/,'')}); }
    else l.push({nom:'Gardien prop',valeur:'—',ton:'neutre',detail:g&&g.erreur?'indisponible : '+g.erreur:'en attente'});
    return l;
  }

  /* ───── système ───── */
  const MICRO={idle:{libelle:'COUPÉ',ton:'off'},veille:{libelle:'VEILLE',ton:'attention'},listening:{libelle:'ACTIF',ton:'on'},thinking:{libelle:'ACTIF',ton:'on'},speaking:{libelle:'ACTIF',ton:'on'}};
  const etatMicro=e=>MICRO[e]||MICRO.idle;
  const MODES={complet:'COMPLET',normal:'NORMAL',leger:'LÉGER'};
  function lignesSysteme({worker,veilleur,etat,mode,fps,version}){
    return [
      {id:'worker',nom:'Worker',valeur:worker?'EN LIGNE':'VERROUILLÉ',ton:worker?'ok':'alerte'},
      {id:'veilleur',nom:'Veilleur',valeur:veilleur==null?'—':veilleur?'ACTIF':'ARRÊTÉ',ton:veilleur==null?'neutre':veilleur?'ok':'attention'},
      {id:'micro',nom:'Micro',valeur:etatMicro(etat).libelle,ton:etatMicro(etat).ton==='on'?'ok':etatMicro(etat).ton==='attention'?'attention':'neutre'},
      {id:'mode',nom:'Affichage',valeur:(MODES[mode]||'—')+(Number.isFinite(fps)&&fps>0?' · '+Math.round(fps)+' i/s':''),ton:Number.isFinite(fps)&&fps>0?(fps>=50?'ok':fps>=30?'attention':'alerte'):'neutre'}
    ].concat(version?[{id:'version',nom:'Version',valeur:String(version),ton:'neutre'}]:[]);
  }

  /* ───── actualités : titres à faire défiler ───── */
  const titresActus=(sujets,max=8)=>(sujets||[]).slice(0,max).map(s=>({titre:String(s.titre||'').slice(0,120),source:String(s.source||''),quand:String(s.quand||''),couleur:s.couleur||null,url:s.url||null,cat:s.catNom||''}));

  const api={FENETRES,COTES,LARGEUR_MIN,CLE,parId,reglagesParDefaut,normaliserReglages,lireReglages,ecrireReglages,disposition,assezLarge,deplacer,nombre,prix,variation,age,courbe,
    categorieMeteo,libelleMeteo,resumeMeteo,urlMeteo,urlGeocodage,resultatsGeocodage,lignesEvenements,lignesAgent,etatMicro,lignesSysteme,titresActus,tonNiveau};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.TableauBordContenu=api;
})(typeof window!=='undefined'?window:globalThis);
