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
  const DEFAUT={mode:'local',mot:true,mains:true,doigts:true,double:false,sensibilite:5,delai:8,demarrerVeille:false,mots:'',niveauPrenom:'normale',ecranAllume:true,v10:false};
  let R=Object.assign({},DEFAUT);
  try{ const b=JSON.parse(localStorage.getItem(CLE)||'null'); if(b&&typeof b==='object'){ for(const k of Object.keys(DEFAUT)) if(typeof b[k]===typeof DEFAUT[k]) R[k]=b[k]; } }catch(e){}
  /* v10 : le mode conversation dure 8 s par défaut (réglable) ; une seule fois, l'ancienne valeur par défaut (20 s) est ramenée à 8 s */
  if(!R.v10){ R.v10=true; if(R.delai===20) R.delai=8; try{ localStorage.setItem(CLE,JSON.stringify(R)); }catch(e){} }
  R.sensibilite=Math.min(10,Math.max(1,Math.round(R.sensibilite))); R.delai=Math.min(120,Math.max(5,Math.round(R.delai)));
  const sauver=()=>{ try{ localStorage.setItem(CLE,JSON.stringify(R)); }catch(e){} };
  const motsLocaux=()=>{ const l=String(R.mots||'').split(/[,;]/).map(x=>x.trim().toLowerCase()).filter(Boolean); return l.length?[...new Set([...Declencheurs.MOTS_RAYLE,...l])]:Declencheurs.MOTS_RAYLE.slice(); };
  const reglagesVeille=()=>({sensibilite:R.sensibilite,main:R.mains,doigts:R.doigts,double:R.double,motCle:R.mot,mots:motsLocaux(),niveauPrenom:R.niveauPrenom});
  /* v10 : l'écoute locale du prénom marche aussi sur tablette et téléphone (modes.js : le mode « toucher » cède la place à l'écoute mains libres quand l'activation par le prénom est active) */
  const prenomActif=()=>R.mode==='local'&&R.mot;
  const local=()=>R.mode==='local'&&!modeToucher()&&reveilActif();
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
    /* v10 : « Rayle, point sur l'or » dans la même phrase → la reconnaissance démarre TOUT DE SUITE (aucune réponse vocale ne couvre la suite) et la question est traitée directement.
       « Rayle » seul → après 1,6 s sans parole, petit son (puce d'écoute) puis on enchaîne. */
    const t0=Date.now(); dernierSon=0; if(micOn&&!speaking&&!recActif) startRec();
    setTimeout(()=>{ try{ if(!micOn||mode!=='conversation'||speaking||processing||queue.length) return; if(dernierSon>=t0||pendingTxt||processing) return; puce(); if(!recActif) startRec(); }catch(e){} },1600);
  }

  /* petit son d'écoute (Web Audio, indépendant des sons d'interface) : deux notes montantes très douces */
  let ctxPuce=null, nPuce=0;
  function puce(){ nPuce++; try{ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; ctxPuce=ctxPuce||new AC(); if(ctxPuce.state==='suspended') ctxPuce.resume().catch(()=>{}); const t=ctxPuce.currentTime; [[660,0],[990,.09]].forEach(([f,d])=>{ const o=ctxPuce.createOscillator(), g=ctxPuce.createGain(); o.type='sine'; o.frequency.value=f; g.gain.setValueAtTime(0,t+d); g.gain.linearRampToValueAtTime(.07,t+d+.015); g.gain.exponentialRampToValueAtTime(.0001,t+d+.14); o.connect(g); g.connect(ctxPuce.destination); o.start(t+d); o.stop(t+d+.16); }); }catch(e){} }

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
      +'<label class="chk"><input type="checkbox" id="avMot"'+(R.mot?' checked':'')+'> Activation par le prénom : elle ne réagit que quand elle entend « Rayle » (reconnu sur l’appareil par Vosk, rien n’est envoyé)</label>'
      +'<label for="avNiveau2">Sensibilité du prénom</label><select id="avNiveau2"><option value="stricte"'+(R.niveauPrenom==='stricte'?' selected':'')+'>Stricte (moins de faux déclenchements)</option><option value="normale"'+(R.niveauPrenom==='normale'?' selected':'')+'>Normale</option><option value="large"'+(R.niveauPrenom==='large'?' selected':'')+'>Large (le prénom est repris même dans une phrase longue)</option></select>'
      +'<label class="chk"><input type="checkbox" id="avEcran"'+(R.ecranAllume?' checked':'')+'> Garder l’écran allumé tant que la veille est active (nécessaire : un site web ne peut pas écouter écran éteint)</label>'
      +'<div class="hint"><b>Limites honnêtes.</b> Sur téléphone et tablette, un site web ne peut écouter que page ouverte au premier plan et écran allumé : écran éteint, application fermée ou autre application au premier plan, l’écoute s’arrête (règle des navigateurs, impossible à contourner). Le navigateur affiche son indicateur de micro tant que la veille est active. L’écoute en veille se fait sur l’appareil (rien n’est envoyé) ; seule la phrase qui suit « Rayle » passe par la reconnaissance du navigateur. Garder l’écran allumé consomme de la batterie : branche la tablette, ou coupe l’option ci-dessus.</div>'
      +'<div class="hint" id="avMotEtat">'+({pret:'Modèle vocal local prêt (gardé sur l’appareil, fonctionne hors ligne).',chargement:'Chargement du modèle vocal local…',absent:'Modèle vocal local introuvable (les claquements marchent sans lui) : recharge la page avec du réseau, il se télécharge une seule fois (46 Mo) puis marche hors ligne.',erreur:'Mot « Raylé » local : erreur ('+(e.erreur||'?')+').',inactif:'Le modèle se charge à la première veille.'}[e.motCle]||'')+'</div>'
      +'<label class="chk"><input type="checkbox" id="avMains"'+(R.mains?' checked':'')+'> Déclencheur : un claquement de mains</label>'
      +'<label class="chk"><input type="checkbox" id="avDoigts"'+(R.doigts?' checked':'')+'> Déclencheur : un claquement de doigts</label>'
      +'<label class="chk"><input type="checkbox" id="avDouble"'+(R.double?' checked':'')+'> Exiger un double claquement (moins de faux déclenchements)</label>'
      +'<label for="avSens">Sensibilité des claquements : <span id="avSensVal">'+R.sensibilite+'</span> / 10</label><input id="avSens" type="range" min="1" max="10" step="1" value="'+R.sensibilite+'">'
      +'<div class="av-test"><div class="av-niveau"><i id="avNiveau"></i></div><button type="button" class="ghost" id="avTester">Dis « Rayle » pour essayer (15 s)</button></div><div class="hint" id="avTestInfo">Le test affiche ce qui est entendu ; rien n’est enregistré.</div>'
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
      else if(i==='avNiveau2'){ R.niveauPrenom=ev.target.value; veille=true; }
      else if(i==='avEcran'){ R.ecranAllume=ev.target.checked; try{ garderEcranAllume(R.ecranAllume&&micOn); }catch(e){} }
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

  window.Activation={prenomActif,puces:()=>nPuce,ecranAllume:()=>R.ecranAllume!==false,puce,veilleLocale:()=>local()&&micOn&&mode==='veille',apresVeille,apresConversation,apresCoupe,reglages:()=>({...R}),
    regler:o=>{ Object.assign(R,o); sauver(); VeilleLocale.regler(reglagesVeille()); dessiner(); },
    etat:()=>!micOn?'COUPÉ':(mode==='veille'&&reveilActif()?'VEILLE':'ACTIF'),declencher};
})();
