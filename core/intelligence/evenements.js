"use strict";
  /* ═════════════ ALERTES DE PRIX DÉCLENCHÉES (/evenements) ═════════════
     Le Worker programme les alertes de prix ; quand l'une se déclenche, la page l'annonce :
     l'entité passe en état « alerte », le détail s'écrit dans le journal, et Raylé le dit à voix haute
     (dès qu'elle ne parle plus). Ensuite on le marque « vu » côté Worker (POST /evenements) pour ne pas le répéter. */
  const EVT_PERIODE=30000;
  const evtVus=new Set();          // 'alerte12' / 'rappel7' : déjà montrés dans cette page
  let evtAParler=[], evtOccupe=false;

  const evtHeure=t=>{ try{ return new Date(t).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).replace(':','h'); }catch(e){ return ''; } };
  function evtPanneau(e){
    try{ RayleBus.emit('raylé:alerte-prix',e); }catch(x){}   // fenêtre holographique (reponses-holo.js)
    addLine('sys','🚨 Alerte de prix'+(e.actif?' · '+e.actif:'')+(e.t?' · '+evtHeure(e.t):'')+' : '+e.texte+(e.prix!=null?' (niveau '+fmtNum(e.prix)+')':''));
  }
  async function evtMarquerVus(liste){
    const alertes=liste.filter(e=>e.genre==='alerte').map(e=>e.id);
    try{
      await wfetch('/evenements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alertes})},10000);
    }catch(e){ addLine('sys','Alertes : impossible de les marquer comme vues ('+errMsg(e)+')'); }
  }
  // Dit les événements en attente dès que Raylé est disponible
  async function evtAnnoncer(){
    if(!evtAParler.length || speaking || processing || queue.length) return;
    const liste=evtAParler; evtAParler=[];
    const phrases=liste.slice(0,3).map(e=>'alerte, '+e.texte);
    const phrase='Justin, '+phrases.join('. Et aussi, ')+(liste.length>3?'. Et '+(liste.length-3)+' autre'+(liste.length>4?'s':'')+'.':'.');
    try{ Entite.alerte(9000); RayleBus.emit('raylé:alerte',{ms:9000}); }catch(e){}
    stateEl.textContent='ALERTE'; miniEtat.textContent='ALERTE';
    addLine('ray',phrase);
    evtMarquerVus(liste);
    await speak(phrase);
  }
  async function verifierEvenements(){
    if(evtOccupe || !workerReady() || document.hidden) return;
    evtOccupe=true;
    try{
      const d=await wjson('/evenements',12000);
      const nouveaux=[].concat((d.alertes||[]).map(x=>Object.assign({genre:'alerte',t:x.declenchee},x)))
        .filter(e=>!evtVus.has(e.genre+e.id));
      nouveaux.forEach(e=>{ evtVus.add(e.genre+e.id); evtPanneau(e); evtAParler.push(e); });
      if(nouveaux.length){ try{ Entite.alerte(9000); RayleBus.emit('raylé:alerte',{ms:9000}); }catch(e){} addLine('sys',nouveaux.length+' alerte(s) de prix déclenchée(s)'); }
    }catch(e){ /* le Worker est peut-être injoignable : on réessaie au prochain tour, sans bruit */ }
    finally{ evtOccupe=false; }
    evtAnnoncer();
  }
  setInterval(verifierEvenements,EVT_PERIODE);
  setInterval(evtAnnoncer,4000);
  setTimeout(verifierEvenements,5000);
