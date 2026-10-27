"use strict";
/* ═════════════ ACTIVATION VOCALE EN CONTINU (V1) : COUPÉ · VEILLE · ACTIF ═════════════
   Trois états, jamais confondus (libellé, couleur et animation du noyau différents) :
   · COUPÉ  : micro éteint (aucune capture, voyant du navigateur éteint). Se rallume par un clic sur le bouton ou sur l'entité, ou par « Activer Raylé ».
   · VEILLE : micro ouvert, mais Raylé ne traite QUE ses déclencheurs, par analyse LOCALE (core/voice/veille-locale.js) : le mot « Raylé » (Vosk, dans le navigateur),
              un claquement de mains ou de doigts (analyse du signal). Aucun son ne quitte le PC et aucune transcription n'est conservée.
              La reconnaissance du navigateur (qui envoie la voix à un service distant) est ARRÊTÉE en veille.
   · ACTIF  : conversation (écoute de la demande, réflexion, réponse). La reconnaissance du navigateur démarre ; après la réponse et un silence réglable, retour en VEILLE (jamais en COUPÉ).
   « Raylé, coupe le micro » → COUPÉ ; « Raylé, mets-toi en veille » → VEILLE (commandes de coupure.js). Option « démarrer directement en veille » : une seule activation par lancement.
   Choix « navigateur » (⚙) : l'ancien comportement, où la veille écoute avec la reconnaissance du navigateur (voix envoyée à un service distant en continu) : non recommandé.
   Appelé par modes.js (apresVeille, apresConversation, apresCoupe) et reconnaissance.js (veilleLocale). Documentation : docs/activation-vocale.md. */
(function(){
  if(window.RAYLE_SATELLITE||!window.VeilleLocale) return;
  const CLE='rayle_activation', $a=id=>document.getElementById(id);
  const DEFAUT={mode:'local',mot:true,mains:true,doigts:true,double:false,sensibilite:5,delai:15,demarrerVeille:false,mots:''};
  let R=Object.assign({},DEFAUT);
  try{ const b=JSON.parse(localStorage.getItem(CLE)||'null'); if(b&&typeof b==='object'){ for(const k of Object.keys(DEFAUT)) if(typeof b[k]===typeof DEFAUT[k]) R[k]=b[k]; } }catch(e){}
  R.sensibilite=Math.min(10,Math.max(1,Math.round(R.sensibilite))); R.delai=Math.min(120,Math.max(5,Math.round(R.delai)));
  const sauver=()=>{ try{ localStorage.setItem(CLE,JSON.stringify(R)); }catch(e){} };
  const motsLocaux=()=>{ const l=String(R.mots||'').split(/[,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean); return l.length?[...new Set([...Declencheurs.MOTS_RAYLE,...l])]:Declencheurs.MOTS_RAYLE.slice(); };
  const reglagesVeille=()=>({sensibilite:R.sensibilite,main:R.mains,doigts:R.doigts,double:R.double,motCle:R.mot,mots:motsLocaux()});
  const local=()=>R.mode==='local'&&!IS_MOBILE&&!modeToucher()&&reveilActif();
  const NOMS={mot:'le mot « Raylé »',main:'un claquement de mains',doigts:'un claquement de doigts'};

  /* ───── transitions ───── */
  function apresVeille(){
    if(!micOn||mode!=='veille'||!local()) return;
    try{ rec&&rec.abort(); }catch(e){}                 // plus de reconnaissance du navigateur en veille : aucun son envoyé
    if(!(R.mot||R.mains||R.doigts)){ ligneInfo('Veille sans déclencheur : active le mot « Raylé » ou les claquements dans ⚙ (ou touche l’entité).'); return; }
    VeilleLocale.demarrer({surDeclencheur:declencher,reglages:reglagesVeille()}).then(r=>{ if(r&&!r.ok&&r.erreur) ligneInfo(r.erreur); }).catch(()=>{});
  }
  const apresConversation=()=>{ VeilleLocale.arreter(); };
  const apresCoupe=()=>{ VeilleLocale.arreter(); };
  function ligneInfo(t){ try{ addLine('sys',t); }catch(e){} }
  function declencher(d){
    if(!micOn||mode!=='veille'||speaking||processing||Date.now()-speechEndT<1500) return;   // jamais pendant que Raylé parle : elle ne se déclenche pas elle-même
    addLine('sys','Déclencheur : '+(NOMS[d.source]||d.source)+(d.double?' (double)':''));
    VeilleLocale.arreter();
    enterConversation();
    ack();                                           // « Oui, Justin ? » ; la reconnaissance du navigateur démarre à la fin de la phrase (voix.js)
    setTimeout(()=>{ if(micOn&&mode==='conversation'&&!speaking&&!recActif) startRec(); },3500);
  }

  /* ───── retour automatique en veille, pause pendant que Raylé parle ───── */
  setInterval(()=>{ try{ if(VeilleLocale.etat().actif) VeilleLocale.pause(speaking||Date.now()-speechEndT<1500); }catch(e){} },150);   // l'écoute locale se met en pause AVANT que Raylé ne parle ou aussitôt après
  setInterval(()=>{
    try{
      if(!micOn||mode!=='conversation'||!local()||speaking||processing||queue.length||pendingTxt) return;
      const calme=Date.now()-Math.max(lastAct,speechEndT,dernierSon);
      if(calme>R.delai*1000){ enterVeille(); ligneInfo('Retour en veille ('+R.delai+' s de silence après la réponse).'); }
    }catch(e){}
  },1000);

  /* ───── une seule activation par lancement : démarrage direct en veille ───── */
  window.addEventListener('load',()=>{
    if(!R.demarrerVeille||!local()) return;
    setTimeout(()=>{ try{ if(!micOn&&SR){ greeted=true; startListening(); } }catch(e){} },1800);
  });

  /* ───── réglages (⚙ « Activation vocale ») ───── */
  const zone=$a('avReglages');
  function dessiner(){
    if(!zone) return; const e=VeilleLocale.etat();
    zone.innerHTML='<div class="av-etats"><span data-e="idle">COUPÉ</span><span data-e="veille">VEILLE</span><span data-e="listening">ACTIF</span></div>'
      +'<div class="hint">COUPÉ : micro éteint. VEILLE : micro ouvert, seuls les déclencheurs sont écoutés, EN LOCAL (rien n’est envoyé). ACTIF : conversation (la reconnaissance du navigateur démarre).</div>'
      +'<label for="avMode">Écoute en veille</label><select id="avMode"><option value="local"'+(R.mode==='local'?' selected':'')+'>Locale (recommandé : aucun son ne quitte le PC)</option><option value="navigateur"'+(R.mode==='navigateur'?' selected':'')+'>Reconnaissance du navigateur (la voix est envoyée à un service distant en continu)</option></select>'
      +'<label class="chk"><input type="checkbox" id="avMot"'+(R.mot?' checked':'')+'> Déclencheur : le mot « Raylé » (reconnu sur ce PC par Vosk)</label>'
      +'<div class="hint" id="avMotEtat">'+({pret:'Modèle vocal local prêt.',chargement:'Chargement du modèle vocal local…',absent:'Modèle vocal local absent : lance app-pc/installer-voix-locale.ps1 (les claquements marchent sans lui).',erreur:'Mot « Raylé » local : erreur ('+(e.erreur||'?')+').',inactif:'Le modèle se charge à la première veille.'}[e.motCle]||'')+'</div>'
      +'<label class="chk"><input type="checkbox" id="avMains"'+(R.mains?' checked':'')+'> Déclencheur : un claquement de mains</label>'
      +'<label class="chk"><input type="checkbox" id="avDoigts"'+(R.doigts?' checked':'')+'> Déclencheur : un claquement de doigts</label>'
      +'<label class="chk"><input type="checkbox" id="avDouble"'+(R.double?' checked':'')+'> Exiger un double claquement (moins de faux déclenchements)</label>'
      +'<label for="avSens">Sensibilité des claquements : <span id="avSensVal">'+R.sensibilite+'</span> / 10</label><input id="avSens" type="range" min="1" max="10" step="1" value="'+R.sensibilite+'">'
      +'<div class="av-test"><div class="av-niveau"><i id="avNiveau"></i></div><button type="button" class="ghost" id="avTester">Tester mes claquements (15 s)</button></div><div class="hint" id="avTestInfo">Le test affiche ce qui est entendu ; rien n’est enregistré.</div>'
      +'<label for="avDelai">Retour en veille après la réponse, au bout de : <span id="avDelaiVal">'+R.delai+'</span> s de silence</label><input id="avDelai" type="range" min="5" max="120" step="5" value="'+R.delai+'">'
      +'<label class="chk"><input type="checkbox" id="avDirect"'+(R.demarrerVeille?' checked':'')+'> Démarrer directement en VEILLE au lancement de l’application (sans cliquer)</label>'
      +'<label for="avMots">Autres façons de comprendre « Raylé » en local (séparées par des virgules, mots du vocabulaire français)</label><input id="avMots" type="text" value="'+String(R.mots).replace(/"/g,'&quot;')+'" placeholder="ex. rayer, railler" autocomplete="off" spellcheck="false">'
      +'<div class="hint">Mots reconnus par défaut : '+Declencheurs.MOTS_RAYLE.join(', ')+'. « Raylé » est un mot rare : le modèle le comprend comme un mot proche. Le mot doit être en tête d’une phrase courte pour déclencher.</div>';
    majEtats();
  }
  function majEtats(){ if(!zone) return; const s=({idle:!micOn,veille:micOn&&mode==='veille',listening:micOn&&mode!=='veille'});
    for(const sp of zone.querySelectorAll('.av-etats span')) sp.classList.toggle('on',!!s[sp.dataset.e]); }
  let testeur=0;
  function tester(){
    const info=$a('avTestInfo'), niv=$a('avNiveau'); clearInterval(testeur); let n=0; const t0=Date.now(), deja=VeilleLocale.etat().actif;
    const fin=()=>{ clearInterval(testeur); testeur=0; if(!deja){ VeilleLocale.arreter(); } if(info) info.textContent='Test terminé : '+n+' déclenchement'+(n>1?'s':'')+'.'; if(niv) niv.style.width='0'; };
    const lancer=()=>{ if(info) info.textContent='Claque dans tes mains ou dis « Raylé » : chaque déclenchement s’affiche ici…';
      testeur=setInterval(()=>{ const e=VeilleLocale.etat(); if(niv) niv.style.width=Math.round(e.niveau*100)+'%'; if(Date.now()-t0>15000) fin(); },120); };
    if(deja){ lancer(); return; }
    VeilleLocale.demarrer({reglages:reglagesVeille(),surDeclencheur:d=>{ n++; if(info) info.textContent='Entendu : '+(NOMS[d.source]||d.source)+(d.double?' (double)':'')+' ('+n+')'; }}).then(r=>{ if(!r.ok){ if(info) info.textContent=r.erreur||'Micro indisponible.'; return; } lancer(); });
  }
  if(zone){
    zone.addEventListener('change',ev=>{
      const i=ev.target.id; let veille=false;
      if(i==='avMode'){ R.mode=ev.target.value; veille=true; }
      else if(i==='avMot'){ R.mot=ev.target.checked; veille=true; } else if(i==='avMains'){ R.mains=ev.target.checked; veille=true; } else if(i==='avDoigts'){ R.doigts=ev.target.checked; veille=true; }
      else if(i==='avDouble'){ R.double=ev.target.checked; veille=true; } else if(i==='avDirect') R.demarrerVeille=ev.target.checked;
      else if(i==='avMots'){ R.mots=ev.target.value.slice(0,200); veille=true; }
      sauver(); if(veille){ VeilleLocale.regler(reglagesVeille()); if(micOn&&mode==='veille'){ if(local()) apresVeille(); else { VeilleLocale.arreter(); startRec(); } } }
    });
    zone.addEventListener('input',ev=>{
      if(ev.target.id==='avSens'){ R.sensibilite=+ev.target.value; $a('avSensVal').textContent=R.sensibilite; VeilleLocale.regler(reglagesVeille()); sauver(); }
      else if(ev.target.id==='avDelai'){ R.delai=+ev.target.value; $a('avDelaiVal').textContent=R.delai; sauver(); }
    });
    zone.addEventListener('click',ev=>{ if(ev.target.id==='avTester') tester(); });
    $a('gear').addEventListener('click',dessiner); dessiner();
    setInterval(()=>{ if(document.getElementById('cfg').classList.contains('open')) majEtats(); },700);
  }

  window.Activation={veilleLocale:()=>local()&&micOn&&mode==='veille',apresVeille,apresConversation,apresCoupe,reglages:()=>({...R}),
    regler:o=>{ Object.assign(R,o); sauver(); VeilleLocale.regler(reglagesVeille()); dessiner(); },
    etat:()=>!micOn?'COUPÉ':(mode==='veille'&&reveilActif()?'VEILLE':'ACTIF'),declencher};
})();
