"use strict";
/* ═════════════ FENÊTRES HOLOGRAPHIQUES DE RÉPONSE ═════════════
   Quand Raylé répond, des fenêtres s'ouvrent autour de l'entité (cadre, balayage, scintillement : voir hud.css et jarvis.css), puis se referment.
   Qui décide quoi : core/commun/reponses-contenu.js (analyse pure). Ici : le dessin des fenêtres, la lecture des chiffres du marché chez le Worker,
   l'onde de la voix. Rien n'est inventé : texte de la réponse, heure de l'appareil, bougies réelles du Worker ; sinon « indisponible ».
   Événements écoutés : raylé:question et raylé:reponse (émis par addLine dans base.js), raylé:alerte-prix (emis par evenements.js). */
(function(){
  if(!window.Panneaux||!window.ReponsesContenu||!window.RayleBus) return;
  const RC=ReponsesContenu, esc=Panneaux.esc;
  const ouvertes=new Set();          // identifiants des fenêtres de réponse actuellement ouvertes
  let question='', serie=0, minuteOnde=0, alertes=0;

  const nombre=(v,dec)=>Number(v).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:dec});
  const sansArticle=n=>String(n||'').replace(/^(?:le |la |l'|les )/i,'').replace(/^./,c=>c.toUpperCase());
  const workerOk=()=>{ try{ return !!workerReady(); }catch(e){ return false; } };
  const messageErreur=e=>{ try{ return errMsg(e); }catch(x){ return String((e&&e.message)||e); } };

  /* ───── onde : l'amplitude de la voix fait vibrer les barres des fenêtres de texte ───── */
  function ondes(){
    if(minuteOnde) return;
    minuteOnde=setInterval(()=>{
      const els=document.querySelectorAll('.rep-onde');
      if(!els.length){ clearInterval(minuteOnde); minuteOnde=0; return; }
      if(document.hidden) return;
      let amp=0; try{ amp=Math.min(1,Math.max(0,Entite.info().amp||0)); }catch(e){}
      els.forEach(e=>e.style.setProperty('--amp',amp.toFixed(2)));
    },140);
  }

  function ouvrir(f,reponse,corps,extra){
    ouvertes.add(f.id);
    Panneaux.ouvrir(Object.assign({id:f.id,type:'holo-'+f.type,icone:'◈',titre:f.titre,corps,duree:RC.duree(f,reponse),onFermer:()=>{ ouvertes.delete(f.id); }},extra||{}));
  }
  /* ferme les fenêtres de réponse (pas les alertes de prix, qui restent jusqu'à leur fin ou jusqu'à un clic) */
  function fermerTout(){ Array.from(ouvertes).filter(id=>!/^holo-alerte/.test(id)).forEach(id=>{ Panneaux.fermer(id); ouvertes.delete(id); }); }

  /* ───── types de fenêtres ───── */
  function fenetrePoints(f,rep){
    ouvrir(f,rep,{html:'<div class="rep-onde" aria-hidden="true">'+'<i></i>'.repeat(9)+'</div><ul class="rep-pts">'+f.points.map((p,i)=>'<li style="--d:'+(0.35+i*0.28).toFixed(2)+'s">'+esc(p)+'</li>').join('')+'</ul>'});
    ondes();
  }
  function fenetreListe(f,rep){
    ouvrir(f,rep,{html:'<ul class="rep-pts">'+f.items.map((p,i)=>'<li style="--d:'+(0.3+i*0.22).toFixed(2)+'s">'+esc(p)+'</li>').join('')+'</ul>'});
  }
  function fenetreDefinition(f,rep){
    ouvrir(f,rep,{html:'<div class="pn-sous">DÉFINITION</div><h3 class="holo-sujet">'+esc(f.sujet)+'</h3><div class="rep-pts"><p class="holo-def">'+esc(f.texte)+'</p></div>'},{icone:'≡',titre:'Définition'});
  }
  function fenetreHeure(f,rep){
    ouvrir(f,rep,(el)=>{
      el.innerHTML='<div class="pn-gros" data-h></div><div class="pn-sous" data-d></div><small class="pn-vide">Heure de cet appareil</small>';
      const h=el.querySelector('[data-h]'), d=el.querySelector('[data-d]');
      const tic=()=>{ const n=new Date(); h.textContent=n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); d.textContent=n.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase(); };
      tic(); const t=setInterval(tic,1000); return ()=>clearInterval(t);
    },{icone:'◷'});
  }

  /* ───── marché : chiffres réels (bougies journalières du Worker) ───── */
  function blocMarche(code,etat){
    let nom=code; try{ nom=sansArticle(MKT[code].nom); }catch(e){}
    if(etat.attente) return '<div class="holo-actif"><div class="pn-sous">'+esc(nom)+'</div><small class="pn-vide holo-lecture">lecture en cours…</small></div>';
    if(etat.erreur) return '<div class="holo-actif"><div class="pn-sous">'+esc(nom)+'</div><div class="pn-chiffres"><div class="pn-chiffre" style="--i:0"><small>COURS</small><b>indisponible</b></div></div><small class="pn-vide">'+esc(etat.erreur)+'</small></div>';
    const m=etat.m; let dec=2; try{ dec=MKT[code].dec; }catch(e){}
    const sens=m.variation==null?'':(m.variation>=0?'hausse':'baisse');
    const c=(i,lib,val,cls,sous)=>'<div class="pn-chiffre" style="--i:'+i+'"><small>'+lib+'</small><b'+(cls?' class="pn-v '+cls+'"':'')+'>'+val+'</b>'+(sous?'<span class="pn-delta '+(cls||'')+'">'+sous+'</span>':'')+'</div>';
    const notes=[]; const r=etat.rep||{};
    if(r.differe) notes.push('données différées'); if(r.perime) notes.push('ancienne copie : la source ne répond plus'); if(r.secours) notes.push('source de secours');
    return '<div class="holo-actif"><div class="pn-sous">'+esc(nom)+' · journalier'+(r.source?' · '+esc(r.source):'')+'</div><div class="pn-chiffres">'
      +c(0,'COURS',nombre(m.prix,dec))
      +c(1,'VARIATION',m.variation==null?'indisponible':(m.variation>=0?'+':'')+nombre(m.variation,2).replace(/^[-−]0$/,'0')+' %',sens)
      +c(2,'RSI 14',m.rsi==null?'indisponible':nombre(m.rsi,1))
      +c(3,'EMA 200',m.positionEma==null?'indisponible':m.positionEma.toUpperCase())
      +'</div>'+(notes.length?'<small class="pn-vide">'+esc(notes.join(' · '))+'</small>':'')+'</div>';
  }
  function fenetreMarche(f,rep){
    const courante=serie;
    ouvrir(f,rep,(el)=>{
      el.innerHTML=f.actifs.map(c=>'<div data-c="'+c+'">'+blocMarche(c,{attente:true})+'</div>').join('<div class="pn-sep"></div>');
      f.actifs.forEach(async code=>{
        let etat;
        if(!workerOk()) etat={erreur:'Worker verrouillé ou non configuré : configure-le dans ⚙ Réglages.'};
        else{
          try{
            const d=await marcheSeries(code,'1day');
            const m=RC.calculerMarche(d.bougies);
            etat=m?{m,rep:d}:{erreur:'réponse sans données exploitables'};
          }catch(e){ etat={erreur:messageErreur(e)}; }
        }
        const cible=el.querySelector('[data-c="'+code+'"]');
        if(cible&&serie===courante&&ouvertes.has(f.id)) cible.innerHTML=blocMarche(code,etat);
      });
    },{icone:'▲',titre:'Marché'});
  }

  /* ───── alerte de prix déclenchée (donnée réelle du Worker) ───── */
  function fenetreAlerte(e){
    const id='holo-alerte-'+(++alertes);
    const l=(a,b)=>b==null||b===''?'':'<div class="pn-l"><span>'+a+'</span><b>'+esc(b)+'</b></div>';
    let heure=''; try{ if(e.t) heure=new Date(e.t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); }catch(x){}
    let niveau=null; try{ if(e.prix!=null) niveau=fmtNum(e.prix); }catch(x){ niveau=String(e.prix); }
    const f={type:'alerte',id,titre:'Alerte de prix'};
    ouvertes.add(id);
    Panneaux.ouvrir({id,type:'holo-alerte',icone:'⚠',titre:'Alerte de prix',duree:30000,onFermer:()=>ouvertes.delete(id),
      corps:{html:'<div class="holo-alerte">'+l('ACTIF',e.actif)+l('MESSAGE',e.texte)+l('NIVEAU',niveau)+l('HEURE',heure)+'</div>'}});
  }

  /* ───── aiguillage ───── */
  function repondre(q,reponse){
    if(window.ImagesHolo&&ImagesHolo.estIntro(reponse)) return;   // la phrase qui présente les images n'ouvre pas de fenêtre de texte en plus
    if(window.ActusAccueil&&ActusAccueil.estReponse(reponse)) return;   // la phrase qui annonce les actualités n'ouvre pas de fenêtre de texte en plus
    serie++;
    let actifs=[];
    try{ actifs=RC.actifsMentionnes(q,reponse,t=>assetsIn(t)); }catch(e){}
    const fenetres=RC.analyser({question:q,reponse,actifs});
    fermerTout();
    fenetres.forEach(f=>{
      try{
        if(f.type==='points') fenetrePoints(f,reponse);
        else if(f.type==='liste') fenetreListe(f,reponse);
        else if(f.type==='definition') fenetreDefinition(f,reponse);
        else if(f.type==='heure') fenetreHeure(f,reponse);
        else if(f.type==='marche') fenetreMarche(f,reponse);
      }catch(e){ console.error('[reponses-holo]',f.type,e); }
    });
  }
  RayleBus.on('raylé:question',d=>{ question=String((d&&d.texte)||''); fermerTout(); });
  RayleBus.on('raylé:reponse',d=>{ const q=question; question=''; repondre(q,String((d&&d.texte)||'')); });
  RayleBus.on('raylé:alerte-prix',d=>{ if(d) fenetreAlerte(d); });
  window.ReponsesHolo={fermerTout,ouvertes:()=>Array.from(ouvertes)};
})();
