"use strict";
/* ═════════════ MOTEUR D'AMBIANCE (RayleUI.ambiance) : le « cerveau d'ambiance » de Raylé ═════════════
   Une seule source de vérité pour l'ambiance visuelle : moment de la journée, soleil, lune, météo, vent. Les fonds, l'entité et les
   effets s'y abonnent ; rien d'autre ne calcule le jour ou la météo.

   ÉTAT (RayleUI.ambiance.etat(), valeurs discrètes) :
     { moment:'aube|jour|crepuscule|nuit', soleil:{altitude,azimut}, meteo:'clair|nuageux|brouillard|bruine|pluie|orage|neige',
       intensite:0..1, vent:{vitesse:0..1 (1 ≈ 60 km/h), kmh, direction (d'où il vient, degrés)}, temperature:°C|null,
       lune:{phase 0..1, eclairee 0..1}, source:'auto|manuel', mode:'auto|manuel|off', lieu:{nom,lat,lon}, themeCle }
   VALEURS LISSÉES (RayleUI.ambiance.lisse(), à lire à chaque image ; transitions de plusieurs secondes, jamais de saut) :
     { jour, chaud (aube/crépuscule), pluie, neige, brouillard, orage, nuages, vent, ventDir } tous 0..1 (ventDir en degrés)
   MODES : « auto » (calcul local du soleil/lune + météo réelle Open-Meteo, sans clé, cache 15 min, tolérant aux pannes : dernière météo
     connue, sinon ciel clair) · « manuel » (ambiance forcée, durée facultative puis retour auto) · « off » (aucun effet).
   LIEU de la météo : la plus récente entre la dernière géolocalisation consentie (carte, bouton « Ma position ») et le lieu enregistré
     dans les Réglages ; sinon Castres.
   THÈME AUTO : en auto, le thème de couleurs suit le moment et la météo (table modifiable dans les Réglages). Un choix manuel du thème
     (bouton, voix) reste prioritaire pendant N heures (réglable).

   S'ABONNER (fonds, entités, skins) :
     RayleBus.on('ambiance', e => …)        à chaque changement de moment, météo, intensité, vent, mode (e = etat())
     RayleUI.ambiance.lisse()               valeurs continues pour animer (lire chaque image ; ne pas modifier l'objet)
     RayleUI.ambiance.vent()                vent lissé 0..1 (poussières de l'entité)
     RayleBus.demander('ambiance')          état courant, depuis n'importe quel module
   COMMANDER :
     RayleUI.ambiance.forcer({moment?, meteo?, intensite?, vent?}, {dureeMs?})  ·  .auto()  ·  .regler(clé, valeur)
     Voix sans IA : RayleUI.ambiance.analyser(texte) + .executer(action) (branché sur le service 'ui:commande' de ui/settings.js)
     IA : RayleUI.ambiance.executerAgent({ambiance, intensite, vent, theme, fond, entite, duree_minutes}) (action « ambiance » du Worker)
   Effets 2D (voile jour/nuit, pluie, neige, brouillard, éclairs) : ui/ambiance-fx.js. Réglages : ui/ambiance-reglages.js.
   Le calcul est pur : tests/ambiance-test.mjs (moment, mapping du thème, commandes vocales, cache et erreurs météo). */
(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};
  const DOM=typeof document!=='undefined' && !!document.body;

  const MOMENTS=['aube','jour','crepuscule','nuit'];
  const METEOS=['clair','nuageux','brouillard','bruine','pluie','orage','neige'];
  const NOM_MOMENT={aube:'aube',jour:'jour',crepuscule:'crépuscule',nuit:'nuit'};
  const NOM_METEO={clair:'ciel clair',nuageux:'nuageux',brouillard:'brouillard',bruine:'bruine',pluie:'pluie',orage:'orage',neige:'neige'};
  const CASTRES={nom:'Castres',lat:43.6063,lon:2.2411};
  const TTL_METEO=15*60000;
  const CLE={reglages:'rayle_amb_reglages',meteo:'rayle_amb_meteo',geo:'rayle_amb_geo',manuel:'rayle_amb_manuel',dit:'rayle_amb_dit',themeManuel:'rayle_ui_theme_manuel'};
  // thème par défaut selon le moment ; la météo marquée (pluie, orage, neige, brouillard) passe avant le moment
  const MAPPING_DEFAUT={aube:'ambre',jour:'arc',crepuscule:'originel',nuit:'nebuleuse',pluie:'aurore',orage:'arc',neige:'arc',brouillard:'originel'};
  const THEMES_IDS=['originel','arc','rouge','aurore','ambre','nebuleuse'];
  const PRESETS={
    detente:{moment:'crepuscule',meteo:'clair',intensite:0,vent:.12},
    focus:{moment:'nuit',meteo:'clair',intensite:0,vent:0},
    nuit:{moment:'nuit'}, jour:{moment:'jour'}, aube:{moment:'aube'}, crepuscule:{moment:'crepuscule'},
    clair:{meteo:'clair',intensite:0}, nuageux:{meteo:'nuageux',intensite:.6}, brouillard:{meteo:'brouillard',intensite:.7},
    bruine:{meteo:'bruine',intensite:.5}, pluie:{meteo:'pluie',intensite:.65}, orage:{meteo:'orage',intensite:.85,vent:.6}, neige:{meteo:'neige',intensite:.6}
  };
  const NOM_PRESET={detente:'détente',focus:'concentration',nuit:'nuit',jour:'jour',aube:'aube',crepuscule:'crépuscule',clair:'ciel clair',nuageux:'nuageux',brouillard:'brouillard',bruine:'bruine',pluie:'pluie',orage:'orage',neige:'neige'};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lisseEtape=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

  /* ═════ calculs purs ═════ */
  // Open-Meteo : code météo de l'OMM → météo visuelle et intensité
  function depuisWMO(code){
    code=+code;
    const f=(m,i)=>({meteo:m,intensite:i});
    if(code===0) return f('clair',0);
    if(code===1) return f('clair',.1);
    if(code===2) return f('nuageux',.45);
    if(code===3) return f('nuageux',.9);
    if(code===45) return f('brouillard',.65);
    if(code===48) return f('brouillard',.85);
    if(code===51) return f('bruine',.25); if(code===53) return f('bruine',.45); if(code===55) return f('bruine',.65);
    if(code===56) return f('bruine',.5);  if(code===57) return f('bruine',.7);
    if(code===61) return f('pluie',.35);  if(code===63) return f('pluie',.6);  if(code===65) return f('pluie',.9);
    if(code===66) return f('pluie',.6);   if(code===67) return f('pluie',.85);
    if(code===71) return f('neige',.3);   if(code===73) return f('neige',.6);  if(code===75) return f('neige',.9);
    if(code===77) return f('neige',.35);
    if(code===80) return f('pluie',.4);   if(code===81) return f('pluie',.65); if(code===82) return f('pluie',.95);
    if(code===85) return f('neige',.5);   if(code===86) return f('neige',.85);
    if(code===95) return f('orage',.7);   if(code===96) return f('orage',.85); if(code===99) return f('orage',1);
    return f('clair',0);
  }
  // réponse d'Open-Meteo (« current ») → météo exploitable ; lève une erreur si la réponse est inutilisable
  function lireMeteo(j){
    const c=j&&j.current;
    if(!c || c.weather_code==null) throw new Error('réponse météo vide');
    const m=depuisWMO(c.weather_code), kmh=Math.max(0,+c.wind_speed_10m||0);
    return {meteo:m.meteo,intensite:m.intensite,kmh,direction:((+c.wind_direction_10m||0)%360+360)%360,
      temperature:c.temperature_2m!=null?Math.round(+c.temperature_2m*10)/10:null};
  }
  function calculerAuto(ts,lieu,meteo){
    const p=UI.astro.position(ts,lieu.lat,lieu.lon), m=meteo||{meteo:'clair',intensite:0,kmh:0,direction:0,temperature:null};
    return {moment:UI.astro.moment(p.altitude,p.matin),soleil:{altitude:p.altitude,azimut:p.azimut},lune:UI.astro.lune(ts),
      meteo:m.meteo,intensite:m.intensite,vent:{vitesse:clamp(m.kmh/60,0,1),kmh:m.kmh,direction:m.direction},temperature:m.temperature,source:'auto',force:null};
  }
  const SOLEIL_FORCE={jour:{altitude:45,azimut:180},nuit:{altitude:-30,azimut:0},aube:{altitude:2,azimut:90},crepuscule:{altitude:2,azimut:270}};
  function fusionner(auto,man){
    if(!man) return auto;
    const e=Object.assign({},auto,{soleil:Object.assign({},auto.soleil),vent:Object.assign({},auto.vent),source:'manuel',force:{}});
    if(man.moment && SOLEIL_FORCE[man.moment]){ e.moment=man.moment; e.soleil=Object.assign({},SOLEIL_FORCE[man.moment]); e.force.moment=true; }
    if(man.meteo && METEOS.includes(man.meteo)){ e.meteo=man.meteo; e.intensite=clamp(man.intensite!=null?man.intensite:(man.meteo==='clair'?0:.6),0,1); e.force.meteo=true; }
    else if(man.intensite!=null) e.intensite=clamp(man.intensite,0,1);
    if(man.vent!=null){ e.vent.vitesse=clamp(man.vent,0,1); e.vent.kmh=Math.round(e.vent.vitesse*60); e.force.vent=true; }
    return e;
  }
  // valeurs continues visées pour un état (la lecture « lissée » s'en approche en quelques secondes)
  function cibles(e){
    const i=e.intensite, m=e.meteo, f=e.force||{};
    const jour=f.moment?{jour:1,nuit:0,aube:.5,crepuscule:.5}[e.moment]:UI.astro.luminosite(e.soleil.altitude);
    const chaud=f.moment?((e.moment==='aube'||e.moment==='crepuscule')?1:0):Math.exp(-Math.pow(e.soleil.altitude/9,2));
    const pluie=m==='pluie'?i:m==='bruine'?i*.45:m==='orage'?Math.max(.6,i)*.9:0;
    const neige=m==='neige'?i:0;
    const brouillard=m==='brouillard'?i:m==='bruine'?.25:0;
    const orage=m==='orage'?i:0;
    const nuages=m==='clair'?i*.4:m==='nuageux'?.3+.6*i:Math.min(1,.65+.3*i);
    const vent=clamp(Math.max(e.vent.vitesse,m==='orage'?.45:0),0,1);
    return {jour,chaud,pluie,neige,brouillard,orage,nuages,vent,ventDir:e.vent.direction};
  }
  // clé de la table de thèmes : la météo marquée passe avant le moment
  function themeCle(e){
    const m=e.meteo;
    if((m==='pluie'||m==='bruine'||m==='orage'||m==='neige'||m==='brouillard') && e.intensite>=.3) return m==='bruine'?'pluie':m;
    return e.moment;
  }

  /* ═════ commandes vocales (texte déjà normalisé par l'appelant, mais on le refait par sécurité) ═════ */
  const norm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’`]/g,' ').replace(/[?!.,;:…«»"]/g,' ').replace(/-/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:(?:hey|he|eh|ok|okay|dis) )?rayle /,'');
  const QUESTION=/\b(?:pourquoi|comment|quel|quelle|quels|quelles|combien|c est quoi|qu est ce|est ce que|est ce qu)\b/;
  const PRESET_ALIAS=[
    [/^(?:pluie|pluvieu[sx]e?|de pluie|sous la pluie|il pleut)$/,'pluie'],
    [/^(?:orage|orageu[sx]e?|d orage|tempete)$/,'orage'],
    [/^(?:neige|neigeu[sx]e?|de neige|enneigee?|sous la neige|il neige)$/,'neige'],
    [/^(?:brouillard|brume|brumeu[sx]e?|de brouillard|brouillard epais)$/,'brouillard'],
    [/^(?:bruine|crachin|pluie fine)$/,'bruine'],
    [/^(?:nuit|nocturne|de nuit|nuit etoilee|nuit claire)$/,'nuit'],
    [/^(?:jour|journee|de jour|plein jour)$/,'jour'],
    [/^(?:aube|matin|matinale?|du matin|lever du soleil)$/,'aube'],
    [/^(?:crepuscule|soir|soiree|du soir|de soiree|coucher du soleil)$/,'crepuscule'],
    [/^(?:clair|claire|ciel clair|degagee?|beau temps|ensoleillee?|soleil)$/,'clair'],
    [/^(?:nuageu[sx]e?|couverte?|grise?|ciel gris|gris)$/,'nuageux'],
    [/^(?:detente|relax|relaxation|calme|zen|cosy|chill|reposante?)$/,'detente'],
    [/^(?:concentration|focus|travail|etude|studieuse?)$/,'focus']
  ];
  const AUTO_VAL=/^(?:auto|automatique|reelle?|normale?|naturelle?|meteo reelle|de la meteo|selon la meteo|comme dehors)$/;
  const OFF_VAL=/^(?:off|aucune|coupee?|desactivee?|neutre|sans effets?)$/;
  const NOMBRES={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,dix:10,quinze:15,vingt:20,trente:30,quarante:40,'quarante cinq':45,cinquante:50,soixante:60};
  const NB='(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|vingt|trente|quarante cinq|quarante|cinquante|soixante)';
  // « pendant 10 minutes », « pendant une heure », « pendant un quart d heure » → ms (au plus 24 h), ou null
  function duree(t){
    const m=t.match(/\bpendant (.+)$/); if(!m) return null;
    const s=m[1];
    if(/^(?:un )?quart d heure$/.test(s)) return 15*60000;
    if(/^(?:une )?demi heure$/.test(s)) return 30*60000;
    let x=s.match(new RegExp('^'+NB+' ?(?:h|heures?)(?: (?:et )?'+NB+')?$'));
    if(x){ const h=+x[1]||NOMBRES[x[1]]; const mn=x[2]?(+x[2]||NOMBRES[x[2]]):0; return clamp((h*60+mn)*60000,60000,24*3600000); }
    x=s.match(new RegExp('^'+NB+' ?(?:min|mins|minutes?)$'));
    if(x) return clamp((+x[1]||NOMBRES[x[1]])*60000,60000,24*3600000);
    return null;
  }
  const sansDuree=t=>t.replace(/ pendant .+$/,'');
  const VERBES='(?:mets|met|mettre|passe|passer|active|activer|lance|lancer|change|changer|applique|appliquer|fais|je veux|on met|on passe|remets|remet)';
  const AMB_RE=new RegExp('^(?:'+VERBES+'(?: moi)? )?(?:(?:en|l|la|le|une|un|de|d|sur) )*(?:ambiance|atmosphere)(?: (?:de|d|en|sur|a|au|avec|type|mode))* (.+)$');
  const MODE_RE=new RegExp('^(?:'+VERBES+'(?: moi)? )?(?:(?:en|le|au|un) )*mode (nuit|jour|nuit etoilee|detente|focus|concentration)$');
  const ADAPTE_RE=/^(?:adapte|adapter|synchronise|aligne|cale)(?: moi)? (?:tout |toute )?(?:l |la |le |les )?(?:ambiance|decor|fond|theme|couleurs?|atmosphere)?(?: a| sur| avec| selon| en fonction de)?(?: la| l| le| au)? ?(?:meteo|temps|heure|moment|journee|jour)(?: reelle?| de dehors| dehors)?$/;
  const RETOUR_RE=/^(?:retour|reviens|repasse|remets?|reprends?)(?: moi)? (?:a |en |sur )?(?:l |la |le )?(?:ambiance )?(?:auto|automatique|normale?|reelle?)$/;
  const METEO_RE=new RegExp('^(?:il (neige|pleut)|(?:fais|fait|mets|met|lance|lancer|ajoute|ajouter) (?:moi )?(?:(?:de la|du|un|une|le|la|l|d|un peu de|plein de) )*(neige|neiger|pluie|pleuvoir|orage|brouillard|brume|bruine))$');
  const OFF_RE=/^(?:(?:coupe|arrete|desactive|enleve|supprime|stop)(?: moi)? (?:l |les |la |le )?(?:ambiance|effets? (?:meteo|d ambiance|visuels?)|meteo visuelle)|(?:sans|pas d) ambiance)$/;
  const VENT_RE=/^(?:(?:mets|met|fais|ajoute|ajouter|donne)(?: moi)? )?(?:ambiance )?(plus|moins|beaucoup|pas|sans|un peu|zero) (?:de )?vent$|^(?:coupe|arrete|enleve|supprime) (?:le )?vent$|^(?:du )?vent (fort|faible|leger|violent|nul|aucun)$/;
  const INTENSITE_RE=/^(plus|moins) de (pluie|neige|brouillard|orage|nuages?)$/;
  const METEO_PRESET={neige:'neige',neiger:'neige',pleut:'pluie',pluie:'pluie',pleuvoir:'pluie',orage:'orage',brouillard:'brouillard',brume:'brouillard',bruine:'bruine'};

  function chercherPreset(v){ for(const [re,id] of PRESET_ALIAS) if(re.test(v)) return id; return null; }
  function analyser(texte){
    const t=norm(texte);
    if(!t || t.split(' ').length>14 || QUESTION.test(t)) return null;
    if(/\b(?:graphique|graphe|chart|bougies?|rsi|terminal|carte|courbe|bitcoin|nasdaq)\b/.test(t)) return null;
    const d=duree(t), s=sansDuree(t);
    if(ADAPTE_RE.test(s)) return {type:'auto',theme:true};
    if(RETOUR_RE.test(s)) return {type:'auto'};
    if(OFF_RE.test(s)) return {type:'off'};
    let m=s.match(MODE_RE);
    if(m){ const p=chercherPreset(m[1]); if(p) return {type:'preset',preset:p,duree:d}; }
    m=s.match(AMB_RE);
    if(m){
      const v=m[1].replace(/^(?:mode |en |de |d |du |la |le |l )+/,'');
      if(AUTO_VAL.test(v)) return {type:'auto',theme:/meteo/.test(v)};
      if(OFF_VAL.test(v)) return {type:'off'};
      const p=chercherPreset(v); if(p) return {type:'preset',preset:p,duree:d};
    }
    m=s.match(METEO_RE);
    if(m) return {type:'preset',preset:METEO_PRESET[m[1]||m[2]],duree:d};
    m=s.match(VENT_RE);
    if(m){
      if(/^(?:coupe|arrete|enleve|supprime)/.test(s)) return {type:'vent',valeur:0,duree:d};
      const w=m[1]||m[2];
      if(w==='plus') return {type:'vent',delta:.25,duree:d};
      if(w==='moins') return {type:'vent',delta:-.25,duree:d};
      if(w==='beaucoup'||w==='fort'||w==='violent') return {type:'vent',valeur:.85,duree:d};
      if(w==='un peu'||w==='leger'||w==='faible') return {type:'vent',valeur:.3,duree:d};
      return {type:'vent',valeur:0,duree:d};                       // pas de / sans / zéro / nul / aucun
    }
    m=s.match(INTENSITE_RE);
    if(m) return {type:'intensite',delta:m[1]==='plus'?.2:-.2,duree:d};
    return null;
  }
  const dureeTexte=ms=>{ if(!ms) return ''; const m=Math.round(ms/60000); return ' pendant '+(m>=60&&m%60===0?(m/60)+' heure'+(m>=120?'s':''):m+' minute'+(m>1?'s':'')); };

  /* ═════ le moteur (une instance dans la page, d'autres pour les tests) ═════ */
  function creer(deps){
    deps=deps||{};
    const maintenant=deps.maintenant||(()=>Date.now());
    const stock=deps.stockage||{get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },set(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} }};
    const bus=deps.bus||(typeof RayleBus!=='undefined'?RayleBus:{emit(){},fournir(){},on(){return ()=>{};},demander(){}});
    const getJSON=k=>{ try{ return JSON.parse(stock.get(k)||'null'); }catch(e){ return null; } };
    const setJSON=(k,v)=>stock.set(k,v==null?null:JSON.stringify(v));
    const doFetch=deps.fetch||(typeof fetch==='function'?(u,o)=>fetch(u,o):null);

    const R=Object.assign({mode:'auto',themeAuto:true,themeHeures:3,lieu:null,fx:70,respectReduit:true,mapping:{}},getJSON(CLE.reglages)||{});
    if(!['auto','manuel','off'].includes(R.mode)) R.mode='auto';
    R.mapping=Object.assign({},MAPPING_DEFAUT,R.mapping||{});
    let manuel=getJSON(CLE.manuel);                      // {patch:{…}, fin:ms|null}
    if(manuel && manuel.fin && manuel.fin<=maintenant()) manuel=null;
    if(R.mode==='manuel' && !manuel) manuel={patch:{},fin:null};
    if(R.mode!=='manuel') manuel=null;
    let meteoReelle=null, meteoSession=false, derniereErreur=null, etatCourant=null, signature='', precedent=null;
    const cache=getJSON(CLE.meteo);
    if(cache && cache.data) meteoReelle=cache.data;       // dernière météo connue dès le démarrage (hors ligne : pas de ciel vide)
    const L={jour:0,chaud:0,pluie:0,neige:0,brouillard:0,orage:0,nuages:0,vent:0,ventDir:0};
    let C=null;                                           // cibles continues
    let premier=true;

    const sauverReglages=()=>setJSON(CLE.reglages,{mode:R.mode,themeAuto:R.themeAuto,themeHeures:R.themeHeures,lieu:R.lieu,fx:R.fx,respectReduit:R.respectReduit,mapping:R.mapping});
    const sauverManuel=()=>setJSON(CLE.manuel,manuel);

    function lieu(){
      const geo=getJSON(CLE.geo), l=R.lieu;
      if(geo && geo.lat!=null && (!l || (geo.t||0)>(l.t||0))) return {nom:geo.nom||'ma position',lat:geo.lat,lon:geo.lon,source:'position'};
      if(l && l.lat!=null) return {nom:l.nom||'lieu enregistré',lat:l.lat,lon:l.lon,source:'réglages'};
      return Object.assign({source:'défaut'},CASTRES);
    }
    function etat(){ return etatCourant||recalculer(true); }
    function calcul(){
      const lx=lieu(), auto=calculerAuto(maintenant(),lx,meteoReelle);
      const e=fusionner(auto,manuel&&manuel.patch);
      e.meteoSession=meteoSession; e.mode=R.mode; e.lieu={nom:lx.nom,lat:lx.lat,lon:lx.lon}; e.lieuSource=lx.source; e.themeCle=themeCle(e);
      return e;
    }
    // recalcule l'état ; émet 'ambiance' s'il y a eu un vrai changement ; sans effet visuel si mode off (le calcul reste disponible)
    function recalculer(silencieux){
      if(manuel && manuel.fin && manuel.fin<=maintenant()){ manuel=null; R.mode='auto'; sauverManuel(); sauverReglages(); }
      const e=calcul(); etatCourant=e; C=cibles(e);
      if(R.mode==='off') Object.keys(C).forEach(k=>{ if(k!=='ventDir') C[k]=k==='jour'?C[k]:0; });   // « off » : aucun effet météo, le jour reste calculé
      if(premier){ premier=false; Object.assign(L,C); }
      const sig=[e.moment,e.meteo,Math.round(e.intensite*10),Math.round(e.vent.vitesse*10),e.source,R.mode,e.themeCle].join('|');
      if(sig!==signature){
        const avant=precedent; signature=sig; precedent=e;
        if(!silencieux){ try{ bus.emit('ambiance',e); }catch(x){} if(deps.surChangement) try{ deps.surChangement(avant,e); }catch(x){} }
      }
      return e;
    }
    // transitions douces : les valeurs continues rejoignent leurs cibles en quelques secondes (constante de temps ≈ 3 s)
    function avancer(dt){
      if(!C) recalculer(true);
      const k=1-Math.exp(-Math.max(0,Math.min(1,dt))/3);
      for(const n of ['jour','chaud','pluie','neige','brouillard','orage','nuages','vent']) L[n]+=(C[n]-L[n])*k;
      let dd=((C.ventDir-L.ventDir+540)%360)-180; L.ventDir=((L.ventDir+dd*k)%360+360)%360;
      return L;
    }
    const lisse=()=>L;
    const vent=()=>R.mode==='off'?0:L.vent;

    /* ── manuel ── */
    function forcer(patch,opt){
      opt=opt||{};
      const base=(manuel&&manuel.patch)||{};
      const p=Object.assign({},base,patch||{});
      if(patch && patch.meteo){ if(patch.intensite==null) delete p.intensite; if(patch.vent==null) delete p.vent; }   // nouvelle météo : on n'hérite ni de l'ancienne intensité ni de son vent
      manuel={patch:p,fin:opt.dureeMs?maintenant()+opt.dureeMs:null};
      R.mode='manuel'; sauverManuel(); sauverReglages();
      const e=recalculer(); appliquerThemeAuto(); return e;
    }
    function auto(){ manuel=null; R.mode='auto'; sauverManuel(); sauverReglages(); const e=recalculer(); appliquerThemeAuto(); return e; }
    function eteindre(){ manuel=null; R.mode='off'; sauverManuel(); sauverReglages(); return recalculer(); }
    function regler(k,v){
      if(k==='mode'){ if(v==='auto') return auto(); if(v==='off') return eteindre(); if(v==='manuel') return forcer({}); return null; }
      if(k==='mapping'){ R.mapping=Object.assign({},R.mapping,v); }
      else if(k==='fx') R.fx=clamp(Math.round(+v)||0,0,100);
      else if(k==='themeHeures') R.themeHeures=[1,3,6,12,24].includes(+v)?+v:3;
      else if(k==='themeAuto'||k==='respectReduit') R[k]=!!v;
      else if(k==='lieu'){ R.lieu=v?Object.assign({},v,{t:maintenant()}):null; if(v) stock.set(CLE.geo,null); }   // le dernier choix l'emporte sur la position mémorisée
      else return null;
      sauverReglages();
      const e=recalculer(); if(k==='themeAuto'||k==='mapping') appliquerThemeAuto(true); if(k==='lieu') chargerMeteo(true);
      return e;
    }
    function noterPosition(p){ if(!p||!isFinite(p.lat)||!isFinite(p.lon)) return; setJSON(CLE.geo,{lat:+p.lat,lon:+p.lon,nom:p.nom||'ma position',t:maintenant()}); recalculer(); chargerMeteo(true); }

    /* ── thème automatique ── */
    const themeManuelDepuis=()=>{ try{ if(UI.themeManuelDepuis) return UI.themeManuelDepuis(); }catch(e){} return Number(stock.get(CLE.themeManuel))||0; };
    function themeAttendu(){ const e=etat(); return R.mapping[e.themeCle]||MAPPING_DEFAUT[e.themeCle]||'originel'; }
    function appliquerThemeAuto(ignorerPause){
      if(!R.themeAuto || R.mode==='off') return null;
      if(!ignorerPause && maintenant()-themeManuelDepuis()<R.themeHeures*3600000) return null;   // choix manuel prioritaire
      const id=themeAttendu();
      try{
        const cur=deps.themeActuel?deps.themeActuel():(UI.reglages?UI.reglages().theme:null);
        if(cur===id) return id;
        if(deps.changerTheme) deps.changerTheme(id); else if(UI.changer) UI.changer('theme',id,{auto:true});
      }catch(e){}
      return id;
    }

    /* ── météo réelle (Open-Meteo) ── */
    async function chargerMeteo(force){
      const lx=lieu(), cle=lx.lat.toFixed(2)+','+lx.lon.toFixed(2), c=getJSON(CLE.meteo);
      if(!force && c && c.cle===cle && maintenant()-c.t<TTL_METEO && c.data){ meteoReelle=c.data; recalculer(); return meteoReelle; }
      try{
        if(!doFetch) throw new Error('réseau indisponible');
        const url='https://api.open-meteo.com/v1/forecast?latitude='+lx.lat.toFixed(2)+'&longitude='+lx.lon.toFixed(2)
          +'&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover&wind_speed_unit=kmh&timezone=auto';
        let opt={}; try{ if(typeof AbortSignal!=='undefined' && AbortSignal.timeout) opt={signal:AbortSignal.timeout(9000)}; }catch(e){}
        const r=await doFetch(url,opt);
        if(!r || !r.ok) throw new Error('HTTP '+(r&&r.status));
        const data=lireMeteo(await r.json());
        setJSON(CLE.meteo,{t:maintenant(),cle,data}); derniereErreur=null; meteoReelle=data; meteoSession=true;
      }catch(e){
        derniereErreur=String(e&&e.message||e);
        if(!meteoReelle && c && c.data) meteoReelle=c.data;     // sinon on garde la dernière météo connue (ou le ciel clair)
      }
      recalculer(); return meteoReelle;
    }
    async function chercherLieu(nom){
      const r=await doFetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(nom)+'&count=1&language=fr&format=json');
      if(!r||!r.ok) throw new Error('recherche du lieu impossible');
      const j=await r.json(), x=j&&j.results&&j.results[0];
      return x?{nom:x.name+(x.country?' ('+x.country+')':''),lat:x.latitude,lon:x.longitude}:null;
    }

    /* ── exécution des commandes (voix et IA) ── */
    function executer(a){
      if(!a) return null;
      const th=R.themeAuto?' Le thème suivra l\'ambiance.':'';
      if(a.type==='auto'){
        if(a.theme && !R.themeAuto){ R.themeAuto=true; sauverReglages(); }
        stock.set(CLE.themeManuel,null);
        auto(); appliquerThemeAuto(true);
        return 'Ambiance en automatique : je suis la météo réelle et l\'heure de '+lieu().nom+'.'+(a.theme?' Le thème de couleurs suit aussi.':'');
      }
      if(a.type==='off'){ eteindre(); return 'Ambiance désactivée : plus d\'effets météo.'; }
      if(a.type==='preset'){
        const p=PRESETS[a.preset]; if(!p) return null;
        forcer(Object.assign({},p),{dureeMs:a.duree});
        return 'Ambiance '+NOM_PRESET[a.preset]+dureeTexte(a.duree)+(a.duree?', puis retour à l\'automatique.':'.')+(a.preset==='orage'?' Les éclairs restent discrets.':'');
      }
      if(a.type==='vent'){
        const cur=etat().vent.vitesse, v=a.valeur!=null?a.valeur:clamp(cur+a.delta,0,1);
        forcer({vent:v},{dureeMs:a.duree});
        return v<=.02?'Plus de vent.':v>=.98?'Vent au maximum.':'Vent '+(a.delta<0?'réduit':a.delta>0?'renforcé':'réglé')+' à '+Math.round(v*60)+' km/h environ'+dureeTexte(a.duree)+'.';
      }
      if(a.type==='intensite'){
        const e=etat(); if(e.meteo==='clair') return 'Il n\'y a ni pluie, ni neige, ni brouillard à l\'écran.';
        forcer({meteo:e.meteo,intensite:clamp(e.intensite+a.delta,.1,1)},{dureeMs:a.duree});
        return a.delta>0?'J\'en remets un peu.':'Je calme un peu.';
      }
      return null;
    }
    // l'IA (outil « ambiance » du Worker) : thème, fond, entité et ambiance d'un coup. Renvoie ce qui a été fait (phrase), ou ''.
    function executerAgent(a){
      a=a||{}; const fait=[];
      const dureeMs=a.duree_minutes?clamp(Math.round(+a.duree_minutes)*60000,60000,24*3600000):null;
      if(a.ambiance){
        const v=String(a.ambiance);
        if(v==='auto'){ auto(); fait.push('ambiance automatique'); }
        else if(v==='off'){ eteindre(); fait.push('ambiance coupée'); }
        else if(PRESETS[v]){ forcer(Object.assign({},PRESETS[v]),{dureeMs}); fait.push('ambiance '+NOM_PRESET[v]); }
      }
      if(a.intensite!=null && isFinite(+a.intensite)){ const e=etat(); forcer({meteo:e.meteo,intensite:clamp(+a.intensite,0,1)},{dureeMs}); fait.push('intensité '+Math.round(clamp(+a.intensite,0,1)*100)+' %'); }
      if(a.vent){
        const cur=etat().vent.vitesse, t={aucun:0,leger:.25,fort:.8,plus:cur+.25,moins:cur-.25}[a.vent];
        if(t!=null){ forcer({vent:clamp(t,0,1)},{dureeMs}); fait.push('vent '+a.vent); }
      }
      if(a.theme){
        if(a.theme==='auto'){ R.themeAuto=true; sauverReglages(); stock.set(CLE.themeManuel,null); appliquerThemeAuto(true); fait.push('thème automatique'); }
        else if(THEMES_IDS.includes(a.theme) && UI.changer){ UI.changer('theme',a.theme); fait.push('thème '+a.theme); }
      }
      if(a.fond && UI.changer && ['aucun','globe','ville3d','video'].includes(a.fond)){ UI.changer('fond',a.fond); fait.push('fond '+a.fond); }
      if(a.entite && UI.changer && ['sphere','neurones'].includes(a.entite)){ UI.changer('entite',a.entite); fait.push('entité '+a.entite); }
      return fait.length?'Réglé : '+fait.join(', ')+'.':'';
    }

    function description(){
      const e=etat(), parts=[NOM_MOMENT[e.moment],NOM_METEO[e.meteo]+(e.meteo!=='clair'?' ('+Math.round(e.intensite*100)+' %)':'')];
      if(e.vent.kmh>=8) parts.push('vent '+Math.round(e.vent.kmh)+' km/h');
      if(e.temperature!=null) parts.push(e.temperature+' °C');
      parts.push('lune '+Math.round(e.lune.eclairee*100)+' %');
      return parts.join(' · ');
    }
    return {etat,lisse,vent,avancer,recalculer,forcer,auto,eteindre,regler,noterPosition,chargerMeteo,chercherLieu,executer,executerAgent,analyser,
      themeAttendu,appliquerThemeAuto,reglages:()=>Object.assign({},R,{mapping:Object.assign({},R.mapping)}),manuel:()=>manuel&&{patch:Object.assign({},manuel.patch),fin:manuel.fin},
      lieu,description,erreur:()=>derniereErreur,meteoReelle:()=>meteoReelle};
  }

  /* ═════ remarque à voix basse quand le temps change nettement (une fois, sans spammer) ═════ */
  const PRECIPITATIONS=['pluie','orage','neige'], CALMES=['clair','nuageux','brouillard','bruine'];
  const REMARQUES={pluie:l=>'Il commence à pleuvoir sur '+l+', Justin.',orage:l=>'Un orage arrive sur '+l+', Justin.',neige:l=>'Il commence à neiger sur '+l+', Justin.'};
  function remarque(avant,apres,nom){
    if(!avant||!apres||apres.source!=='auto'||avant.source!=='auto'||apres.mode!=='auto') return null;
    if(!avant.meteoSession||!apres.meteoSession) return null;       // jamais au chargement : seulement un changement vu pendant que la page est ouverte
    if(!CALMES.includes(avant.meteo)||!PRECIPITATIONS.includes(apres.meteo)||apres.intensite<.35) return null;
    return {id:'ambiance-'+apres.meteo+'-'+new Date().toISOString().slice(0,13),texte:REMARQUES[apres.meteo](nom||'chez toi'),importance:1,local:true};
  }

  /* ═════ instance de la page ═════ */
  const API={creer,depuisWMO,lireMeteo,calculerAuto,fusionner,cibles,themeCle,analyser,duree,remarque,
    MAPPING_DEFAUT,PRESETS,MOMENTS,METEOS,NOM_MOMENT,NOM_METEO,NOM_PRESET,THEMES_IDS,CASTRES,TTL_METEO,CLE};
  UI.ambiance=API;
  if(!DOM) return;

  const dernierTexte=()=>{ try{ return Number(localStorage.getItem(CLE.dit))||0; }catch(e){ return 0; } };
  const moteur=creer({surChangement(avant,apres){
    appliquerThemeSoon();
    try{
      const r=remarque(avant,apres,apres.lieu&&apres.lieu.nom);
      if(r && Date.now()-dernierTexte()>3*3600000 && RayleBus.demander('vue')!=='terminal' && window.RayleInitiative && RayleInitiative.proposer){
        if(RayleInitiative.proposer(r)){ try{ localStorage.setItem(CLE.dit,String(Date.now())); }catch(e){} }
      }
    }catch(e){}
  }});
  let themeEnAttente=0;
  function appliquerThemeSoon(){ clearTimeout(themeEnAttente); themeEnAttente=setTimeout(()=>moteur.appliquerThemeAuto(),50); }
  Object.assign(API,moteur);
  API.moteur=moteur;
  try{ RayleBus.fournir('ambiance',()=>moteur.etat()); }catch(e){}
  try{ RayleBus.fournir('ambiance:commande',c=>{ const a=analyser(c); return a?moteur.executer(a):null; }); }catch(e){}
  try{ RayleBus.on('geo:position',p=>moteur.noterPosition(p)); }catch(e){}

  // migration : un thème déjà choisi avant l'ambiance compte comme un choix manuel (il reste N heures avant que le thème auto prenne la main)
  try{ if(localStorage.getItem('rayle_ui_theme') && !localStorage.getItem(CLE.themeManuel)) localStorage.setItem(CLE.themeManuel,String(Date.now())); }catch(e){}

  moteur.recalculer(true);
  setTimeout(()=>{ moteur.chargerMeteo(false).then(()=>{ moteur.recalculer(); moteur.appliquerThemeAuto(); }); },1500);
  setInterval(()=>{ moteur.recalculer(); moteur.appliquerThemeAuto(); },60000);
  setInterval(()=>moteur.chargerMeteo(false),TTL_METEO+5000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ moteur.recalculer(); moteur.chargerMeteo(false); } });
  setTimeout(()=>moteur.appliquerThemeAuto(),600);
})();
