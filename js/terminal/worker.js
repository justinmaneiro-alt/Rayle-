"use strict";

  // ── WORKER RAYLÉ ── l'adresse n'est pas un secret ; le code d'accès, lui, reste dans ton navigateur
  const WORKER_URL = 'https://rayle.justinmaneiro.workers.dev';
  const CLE_JETON = 'rayle_terminal_token';
  function jeton(){ try{ return (localStorage.getItem(CLE_JETON)||'').trim(); }catch(e){ return ''; } }

  async function wk(path){
    const c=new AbortController(); const tm=setTimeout(()=>c.abort(),20000);
    let r;
    try{ r=await fetch(WORKER_URL+path,{headers:{'X-Rayle-Token':jeton()},signal:c.signal}); }
    catch(e){ throw new Error(e.name==='AbortError'?'le Worker ne répond pas (délai dépassé)':'Worker injoignable'); }
    finally{ clearTimeout(tm); }
    let d=null; try{ d=await r.json(); }catch(e){}
    if(r.status===401){ const er=new Error("code d'accès refusé"); er.code=401; throw er; }
    if(!r.ok||!d||d.error) throw new Error((d&&d.error)||('erreur Worker HTTP '+r.status));
    return d;
  }
  async function marche(actif,iv){
    const d=await wk('/marche?actif='+actif+'&intervalle='+iv+'&n=250');
    if(!d.bougies||!d.bougies.length) throw new Error('aucune bougie reçue');
    return d;
  }
