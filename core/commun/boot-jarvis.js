"use strict";
/* ═════════════ SÉQUENCE DE DÉMARRAGE (boot) ═════════════
   Au chargement de l'accueil : les anneaux du HUD s'allument de l'intérieur vers l'extérieur, l'échelle se remplit, un texte système s'écrit
   lettre par lettre, et l'entité se forme du cœur vers l'extérieur (Entite.naissance). Le texte ne dit que des choses vraies : heure, taille d'écran,
   mode choisi, animations réduites ou non, Worker configuré ou non, nombre de neurones. Un clic, une touche ou « Passer » l'abrège.
   Durée selon le mode : complet 3,8 s · normal 2,9 s · léger 1,5 s (court, sans anneaux animés). Supprimée avec « réduire les animations »,
   pour un lien direct vers le terminal ou la galaxie, et dans un navigateur piloté par un test (sauf ?boot=1). Réglable : ⚙ → « Séquence de démarrage ». */
(function(){
  const CLE='rayle_boot';
  const lire=()=>{ try{ return localStorage.getItem(CLE); }catch(e){ return null; } };
  const corps=document.body;
  const k=document.getElementById('kBoot');
  if(k){ k.checked=lire()!=='0'; k.addEventListener('change',()=>{ try{ localStorage.setItem(CLE,k.checked?'1':'0'); }catch(e){} }); }

  const reduit=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  const direct=/^#(terminal|galaxie)/.test(location.hash);
  const piloteParTest=navigator.webdriver===true&&!/[?&]boot=1/.test(location.search);
  if(window.RAYLE_SATELLITE||lire()==='0'||reduit||direct||piloteParTest||!document.getElementById('reactor')||!window.JarvisSvg) return;

  const DUREES={complet:3800,normal:2900,leger:1500};
  const NOMS={complet:'COMPLET',normal:'NORMAL',leger:'LÉGER'};
  let fini=false, bloc=null, minuteurs=[], debut=0, dureeTotale=0;
  const apres=(ms,fn)=>{ const t=setTimeout(fn,ms); minuteurs.push(t); return t; };

  corps.classList.add('boot');   // masque le HUD, le titre et les boutons le temps de la séquence
  const filet=setTimeout(()=>terminer(true),9000);   // sécurité : la séquence ne peut jamais rester bloquée

  /* mode : même détection que l'entité (skins/neurone/modes-accueil.js) */
  const modes=import(new URL('skins/neurone/modes-accueil.js',document.baseURI).href).catch(()=>null);
  modes.then(m=>{
    let nom='normal', nuee=null;
    if(m){
      let q=null; try{ q=localStorage.getItem('rayle_entite_qualite'); }catch(e){}
      const tact=!!(matchMedia&&matchMedia('(pointer:coarse)').matches);
      const env={largeur:m.largeurAppareil({largeurFenetre:innerWidth,hauteurFenetre:innerHeight,largeurEcran:(window.screen&&screen.width)||0,tactile:tact}),tactile:tact,memoire:navigator.deviceMemory==null?null:navigator.deviceMemory,coeurs:navigator.hardwareConcurrency||4,gpu:''};
      const i=m.modeEffectif(q==null?'auto':q,env), cfg=m.MODES[Math.max(0,Math.min(2,i))];
      nom=cfg.nom; nuee=cfg.nuee;
    }
    demarrer(nom,nuee);
  });

  function ligne(libelle,valeur){ const pts=Math.max(2,30-libelle.length-valeur.length); return libelle+' '+'.'.repeat(pts)+' '+valeur; }

  function demarrer(mode,nuee){
    if(fini) return;
    const duree=DUREES[mode]||DUREES.normal; debut=performance.now(); dureeTotale=duree;
    let worker='—'; try{ worker=workerReady()?'CONFIGURÉE':'NON CONFIGURÉE'; }catch(e){}
    const n=new Date();
    const lignes=[
      ['HORLOGE',n.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})],
      ['AFFICHAGE',innerWidth+'×'+innerHeight],
      ['MODE',NOMS[mode]||mode.toUpperCase()],
      ['LIAISON WORKER',worker],
      ['NOYAU NEURONAL',nuee?nuee+' NEURONES':'—'],
      ['ENTITÉ','EN FORMATION']
    ].slice(0,mode==='leger'?4:6);
    bloc=document.createElement('div');
    bloc.className='boot'; bloc.id='boot'; bloc.dataset.mode=mode; bloc.style.setProperty('--boot-duree',duree+'ms');
    bloc.setAttribute('role','presentation');
    const r=document.getElementById('reactor').getBoundingClientRect();
    bloc.innerHTML='<div class="boot-fond"></div>'
      +(mode==='leger'?'':'<div class="boot-anneaux" style="left:'+(r.left+r.width/2)+'px;top:'+(r.top+r.height/2)+'px;width:'+(r.width*1.04)+'px;height:'+(r.height*1.04)+'px">'+JarvisSvg.anneaux()+'</div>')
      +'<div class="boot-bloc" style="top:'+Math.min(innerHeight-250,r.bottom+(mode==='leger'?-30:30))+'px"><div class="boot-titre">R A Y L É</div><div class="boot-echelle"><i></i></div><pre class="boot-texte">'
      +lignes.map((l,i)=>'<span class="boot-l" style="--i:'+i+'">'+ligne(l[0],l[1])+'</span>').join('')
      +'</pre></div><button type="button" class="boot-passer">PASSER ▸</button>';
    document.body.appendChild(bloc);
    const passer=()=>terminer(false);
    bloc.addEventListener('pointerdown',passer);
    window.addEventListener('keydown',passer,{once:true});
    // l'entité se forme pendant la séquence
    apres(duree*0.2,()=>{ try{ Entite.naissance(duree*(mode==='leger'?0.55:0.62)/1000); }catch(e){} });
    apres(duree,()=>terminer(false));
  }

  function terminer(brusque){
    if(fini) return; fini=true;
    clearTimeout(filet); minuteurs.forEach(clearTimeout);
    if(brusque||!bloc){ corps.classList.remove('boot'); if(bloc) bloc.remove(); return; }
    if(performance.now()-debut<dureeTotale*0.85){ try{ Entite.naissance(0.45); }catch(e){} }   // un clic abrège aussi la formation de l'entité
    bloc.classList.add('fin');
    corps.classList.remove('boot');
    setTimeout(()=>{ if(bloc) bloc.remove(); },700);
  }
})();
