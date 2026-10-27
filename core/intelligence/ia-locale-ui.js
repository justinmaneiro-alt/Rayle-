"use strict";
  /* ═════════════ IA LOCALE : section de ⚙ Réglages + indicateur d'état ═════════════ */
  (function(){
    const cfg=document.getElementById('cfg'); if(!cfg||!window.IaLocale) return;
    const h3=[...cfg.querySelectorAll('h3')].find(h=>/^Tests/i.test(h.textContent.trim())); if(!h3) return;
    const sect=document.createElement('div'); sect.id='ial-section';
    sect.innerHTML='<h3>IA locale (LM Studio)</h3>'+
      '<div class="hint" id="ialEtat" role="status"></div>'+
      '<label class="chk"><input type="checkbox" id="ialActif"> Utiliser l’IA locale pour les tâches courantes (économise les API ; les outils, la vision et les données en direct restent aux API)</label>'+
      '<label for="ialUrl">Adresse de LM Studio (serveur local à démarrer, CORS activé)</label><input id="ialUrl" type="text" placeholder="http://localhost:1234/v1" autocomplete="off" spellcheck="false">'+
      '<label for="ialModele">Modèle par défaut (liste lue dans LM Studio)</label><select id="ialModele"></select>'+
      '<label for="ialModeleNC">Modèle non censuré (Dolphin) : seulement si tu le demandes (« en mode non censuré, … »)</label><select id="ialModeleNC"></select>'+
      '<label for="ialSecret">Phrase secrète pour le modèle non censuré (facultative, jamais enregistrée en clair)</label><input id="ialSecret" type="password" placeholder="définir ou changer" autocomplete="off">'+
      '<label for="ialRelais">Relais du PC (tablette / téléphone) : adresse et jeton</label><input id="ialRelais" type="text" placeholder="http://192.168.x.x:PORT" autocomplete="off" spellcheck="false"><input id="ialJeton" type="password" placeholder="jeton du relais" autocomplete="off">'+
      '<div class="hint">Procédure en 4 étapes : docs/IA_LOCALE.md. Sans réponse de LM Studio, Raylé utilise les API, comme avant.</div>';
    h3.parentNode.insertBefore(sect,h3);
    const $=id=>document.getElementById(id), etatEl=$('ialEtat');
    const remplir=(sel,liste,courant,vide)=>{ sel.innerHTML='<option value="">'+vide+'</option>'+liste.map(m=>'<option value="'+m.replace(/"/g,'&quot;')+'"'+(m===courant?' selected':'')+'>'+m+'</option>').join(''); };
    function afficher(e){
      const r=IaLocale.reglages(); etatEl.textContent=e.libelle+(e.modeleNonCensure?' · non censuré disponible : '+e.modeleNonCensure:'');
      $('ialActif').checked=r.actif; if(document.activeElement!==$('ialUrl')) $('ialUrl').value=r.url;
      remplir($('ialModele'),e.modeles.filter(m=>!window.IaLocaleCalcul.estNonCensure(m)),r.modele,'Automatique'); remplir($('ialModeleNC'),e.modeles.filter(window.IaLocaleCalcul.estNonCensure),r.modeleNonCensure,'Automatique (un Dolphin chargé)');
      if(document.activeElement!==$('ialRelais')) $('ialRelais').value=r.relais||''; if(document.activeElement!==$('ialJeton')) $('ialJeton').value=r.jetonRelais||'';
      $('ialSecret').placeholder=r.empreinteSecrete?'phrase définie (saisir pour la changer)':'définir une phrase';
      majPuce(e);
    }
    /* Indicateur discret dans la barre d'état : « IA locale : connectée · modèle ». */
    let puce=document.getElementById('ialPuce');
    if(!puce){ puce=document.createElement('div'); puce.id='ialPuce'; puce.setAttribute('role','status'); puce.style.cssText='position:fixed;left:12px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:20;font:12px/1.3 system-ui,sans-serif;color:#9fb3bd;background:rgba(8,13,19,.72);border:1px solid rgba(143,208,227,.25);padding:3px 8px;pointer-events:none;display:none'; document.body.appendChild(puce); }
    function majPuce(e){ if(!e.actif){ puce.style.display='none'; return; } puce.style.display='block'; puce.textContent=e.libelle; puce.style.color=e.disponible?'#8fd0e3':'#c9b27a'; }
    $('ialActif').addEventListener('change',()=>IaLocale.regler({actif:$('ialActif').checked}));
    $('ialUrl').addEventListener('change',()=>IaLocale.regler({url:$('ialUrl').value.trim()}));
    $('ialModele').addEventListener('change',()=>IaLocale.regler({modele:$('ialModele').value}));
    $('ialModeleNC').addEventListener('change',()=>IaLocale.regler({modeleNonCensure:$('ialModeleNC').value}));
    $('ialRelais').addEventListener('change',()=>IaLocale.regler({relais:$('ialRelais').value.trim()}));
    $('ialJeton').addEventListener('change',()=>IaLocale.regler({jetonRelais:$('ialJeton').value.trim()}));
    $('ialSecret').addEventListener('change',()=>{ IaLocale.definirPhraseSecrete($('ialSecret').value); $('ialSecret').value=''; afficher(IaLocale.etat()); });
    IaLocale.surEtat(afficher); afficher(IaLocale.etat());
    cfg.addEventListener('transitionend',()=>{ if(cfg.classList.contains('open')) IaLocale.sonder(); });
    $('gear').addEventListener('click',()=>{ if(!cfg.classList.contains('open')) IaLocale.sonder(); });
  })();
