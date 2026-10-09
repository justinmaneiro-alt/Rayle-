"use strict";
  // ── CODE D'ACCÈS ──
  function demanderJeton(msg){
    const t=$('dashBody'); t.dataset.actif='';
    $('dashSrc').innerHTML='';
    t.className='needkey';
    t.innerHTML=(msg?msg+'<br><br>':'')
      +"Code d'accès Raylé requis (le même que RAYLE_TOKEN dans Cloudflare).<br><br>"
      +'<input id="tok" type="password" placeholder="colle ton code ici" autocomplete="off" style="width:90%;background:rgba(0,0,0,.4);border:1px solid rgba(255,0,127,.4);color:#f2e9f4;font:13px Courier New,monospace;padding:7px 9px;outline:none"><br><br>'
      +'<button id="tokSave" style="background:#ff007f;border:none;color:#1a000d;font:700 12px Courier New,monospace;letter-spacing:.1em;padding:8px 14px;cursor:pointer">ENREGISTRER</button>'
      +'<div style="margin-top:10px;font-size:11px;color:#9a8fa6">Le code reste dans ce navigateur, pas dans le fichier.</div>';
    $('ctxBody').className='loading'; $('ctxBody').innerHTML="En attente du code d'accès…";
    $('tokSave').onclick=()=>{
      const v=$('tok').value.trim();
      if(v){ try{ localStorage.setItem(CLE_JETON,v); }catch(e){} buildDash(); loadContexte(); }
    };
  }
