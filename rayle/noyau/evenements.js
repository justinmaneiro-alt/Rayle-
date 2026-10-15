"use strict";
  /* ═════════════ ALERTES ET RAPPELS DÉCLENCHÉS (/evenements) + COMMANDES ENTRE APPAREILS ═════════════
     Le Worker programme les alertes de prix et les rappels ; quand l'un se déclenche, la page l'annonce :
     l'entité passe en état « alerte », un panneau HUD s'ouvre avec le détail, et Raylé le dit à voix haute
     (dès qu'elle ne parle plus). Ensuite on le marque « vu » côté Worker (POST /evenements) pour ne pas le répéter.
     Phase 3A : la même boucle apporte les commandes envoyées par mes autres appareils (et les retours des miennes),
     exécutées par js/rayle/appareils.js.

     CADENCE ET BUDGET (plan gratuit Cloudflare : 100 000 requêtes par jour, tout compris)
       • alertes et rappels : toutes les 30 s, comme avant (/evenements complet) ;
       • file de commandes (appareil appairé, /evenements?c=1, une lecture D1 légère) :
           page visible et utilisée il y a moins de 3 min : toutes les 4 s  (900 / heure)
           visible, sans geste depuis 3 à 30 min          : toutes les 10 s (360 / heure)
           visible, sans geste depuis plus de 30 min      : toutes les 30 s (120 / heure, le tour complet suffit)
           onglet caché ou écran éteint                   : rien du tout (l'appareil passe « fermé » au bout de 75 s)
       • garde-fou : au-delà de 15 000 interrogations dans la journée sur cet appareil, retour aux 30 s.
       Pire cas théorique (3 appareils visibles et touchés 24 h sur 24) : 3 × 15 000 + sécurité et initiative (≈ 13 000) + Cron (1 440) ≈ 60 000.
       Usage réaliste (PC 4 h actif, tablette et téléphone 2 h, le reste en veille ou caché) : environ 15 000 par jour en tout. */
  const EVT_PERIODE=30000;
  const EVT_RAPIDE=4000, EVT_MOYEN=10000, EVT_QUOTA_JOUR=15000, EVT_CLE_QUOTA='rayle_evt_quota';
  const evtVus=new Set();          // 'alerte12' / 'rappel7' : déjà montrés dans cette page
  let evtAParler=[], evtOccupe=false;
  let evtTimer=null, evtDernierComplet=0, evtDernierGeste=Date.now(), evtFileOk=true;

  const evtHeure=t=>{ try{ return new Date(t).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).replace(':','h'); }catch(e){ return ''; } };
  function evtPanneau(e){
    const al=e.genre==='alerte';
    let h='<div class="pn-sous">'+pnH(al?'Alerte de prix déclenchée':'Rappel')+(e.t?' · '+pnH(evtHeure(e.t)):'')+'</div><p>'+pnH(e.texte)+'</p>';
    if(al && e.prix!=null) h+=pnLigne('Niveau',pnH(fmtNum(e.prix)));
    pnOuvrir({id:'evt:'+e.genre+e.id,type:'evenement',icone:al?'🚨':'⏰',titre:(al?'Alerte · '+(e.actif||''):'Rappel').replace(/ · $/,''),corps:{html:h},duree:10*60000});
  }
  async function evtMarquerVus(liste){
    const alertes=liste.filter(e=>e.genre==='alerte').map(e=>e.id), rappels=liste.filter(e=>e.genre==='rappel').map(e=>e.id);
    try{
      await wfetch('/evenements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alertes,rappels})},10000);
    }catch(e){ addLine('sys','Alertes : impossible de les marquer comme vues ('+errMsg(e)+')'); }
  }
  // Dit les événements en attente dès que Raylé est disponible
  async function evtAnnoncer(){
    if(!evtAParler.length || speaking || processing || queue.length) return;
    const liste=evtAParler; evtAParler=[];
    const phrases=liste.slice(0,3).map(e=>e.genre==='alerte'?'alerte, '+e.texte:'rappel, '+e.texte);
    const phrase='Justin, '+phrases.join('. Et aussi, ')+(liste.length>3?'. Et '+(liste.length-3)+' autre'+(liste.length>4?'s':'')+'.':'.');
    try{ Entite.alerte(9000); }catch(e){}
    stateEl.textContent='ALERTE'; miniEtat.textContent='ALERTE';
    addLine('ray',phrase);
    evtMarquerVus(liste);
    await speak(phrase);
  }

  /* ───── Cadence ───── */
  const evtCalme=()=>Date.now()-Math.max(evtDernierGeste,(typeof lastAct!=='undefined'&&lastAct)||0);
  function evtQuota(ajout){
    const j=new Date().toLocaleDateString('fr-CA');
    let q={j,n:0}; try{ const v=JSON.parse(localStorage.getItem(EVT_CLE_QUOTA)||'null'); if(v && v.j===j) q=v; }catch(e){}
    if(ajout){ q.n+=ajout; try{ localStorage.setItem(EVT_CLE_QUOTA,JSON.stringify(q)); }catch(e){} }
    return q.n;
  }
  function evtCadence(){
    if(!store.get(KEY_WDEV) || !evtFileOk || evtQuota(0)>=EVT_QUOTA_JOUR) return EVT_PERIODE;   // pas appairé, Worker ancien, ou garde-fou
    const calme=evtCalme();
    return calme<3*60000 ? EVT_RAPIDE : calme<30*60000 ? EVT_MOYEN : EVT_PERIODE;
  }
  let evtProchain=0;
  function evtPlanifier(ms){ clearTimeout(evtTimer); evtProchain=Date.now()+ms; evtTimer=setTimeout(evtTour,ms); }
  // la cadence voulue a baissé (appareil appairé à l'instant, geste après un long calme) : on n'attend pas la fin du long délai
  function evtRattraper(){ if(evtTimer && !evtOccupe && !document.hidden && evtProchain-Date.now()>evtCadence()+500) evtPlanifier(300); }
  setInterval(evtRattraper,5000);

  async function verifierEvenements(leger){
    if(evtOccupe || !workerReady() || document.hidden) return;
    evtOccupe=true;
    try{
      const actif=evtCalme()<3*60000 ? '1' : '0';
      const d=await wjson(leger ? '/evenements?c=1&a='+actif : '/evenements?a='+actif,12000);
      evtQuota(1);
      if(!leger){
        evtDernierComplet=Date.now();
        evtFileOk=!store.get(KEY_WDEV) || Array.isArray(d.commandes);     // ancien Worker : pas de file, on reste aux 30 s
        const nouveaux=[].concat((d.alertes||[]).map(x=>Object.assign({genre:'alerte',t:x.declenchee},x)),(d.rappels||[]).map(x=>Object.assign({genre:'rappel',t:x.quand},x)))
          .filter(e=>!evtVus.has(e.genre+e.id));
        nouveaux.forEach(e=>{ evtVus.add(e.genre+e.id); evtPanneau(e); evtAParler.push(e); });
        if(nouveaux.length){ try{ Entite.alerte(9000); }catch(e){} addLine('sys',nouveaux.length+' alerte(s) ou rappel(s) déclenché(s)'); }
      }
      if((d.commandes||d.retours) && typeof appRecevoir==='function') appRecevoir(d);   // commandes entre appareils (js/rayle/appareils.js)
    }catch(e){ /* le Worker est peut-être injoignable : on réessaie au prochain tour, sans bruit */ }
    finally{ evtOccupe=false; }
    evtAnnoncer();
  }
  async function evtTour(){
    evtTimer=null;
    if(document.hidden) return;                        // onglet caché : rien ; reprise dès qu'il redevient visible
    const leger=Date.now()-evtDernierComplet<EVT_PERIODE-500;
    await verifierEvenements(leger);
    evtPlanifier(evtCadence());
  }
  // Un geste après un long calme : on repasse tout de suite en cadence rapide
  ['pointerdown','keydown','touchstart','wheel'].forEach(ev=>document.addEventListener(ev,()=>{ evtDernierGeste=Date.now(); evtRattraper(); },{passive:true}));
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ evtDernierGeste=Date.now(); evtPlanifier(800); } });
  setInterval(evtAnnoncer,4000);
  evtPlanifier(5000);
