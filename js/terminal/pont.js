"use strict";
  // ── PONT LOCALSTORAGE lu par Raylé ──
  function readBridge(){ try{ return JSON.parse(localStorage.getItem('rayle_terminal_bridge'))||{}; }catch(e){ return {}; } }
  function writeBridge(data){
    const cur=readBridge();
    const merged=Object.assign({}, cur, data, { notes:$('notes').value });
    try{ localStorage.setItem('rayle_terminal_bridge', JSON.stringify(merged)); }catch(e){}
  }
  const notes=$('notes');
  notes.value=readBridge().notes||'';
  let noteTimer=null;
  notes.addEventListener('input',()=>{
    $('saveHint').textContent='Sauvegarde…';
    clearTimeout(noteTimer);
    noteTimer=setTimeout(()=>{ writeBridge({}); $('saveHint').textContent='Sauvegardé · lisible par Raylé'; },500);
  });

  // Raylé ne pilote plus le terminal (ni onglet, ni unité de temps, ni actualisation).
  // Il peut seulement ajouter une note : c'est une donnée, pas une commande.
  window.addEventListener('storage',e=>{
    if(e.key!=='rayle_terminal_cmd'||!e.newValue) return;
    try{
      const c=JSON.parse(e.newValue);
      if(c&&c.note){
        const n=$('notes');
        n.value=(n.value?n.value.replace(/\s+$/,'')+'\n':'')+String(c.note).slice(0,500);
        writeBridge({}); $('saveHint').textContent='Note ajoutée par Raylé';
      }
    }catch(_){}
  });
  // présence : permet à Raylé de savoir si le terminal est ouvert
  writeBridge({vu:new Date().toISOString()});
  setInterval(()=>writeBridge({vu:new Date().toISOString()}),15000);

  loadChart(); loadCal(); startBook(); buildDash(); loadContexte();
  setInterval(loadContexte, 120000);
