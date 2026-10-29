"use strict";
/* ═════════════ MÉTÉO DE LA COQUE MOBILE (V8) ═════════════
   Open-Meteo (gratuit, sans clé). Le lieu vient de la géolocalisation du téléphone (permission demandée au toucher d'un bouton, jamais d'office), sinon de la dernière ville choisie.
   Jamais de « Lecture de la météo… » infini ni de « aucune ville choisie » sans issue : sans lieu, la carte propose « Ma position » et « Chercher une ville ».
   Le lieu est gardé sur l'appareil seulement (rayle_m_meteo). Mêmes calculs que l'accueil Jarvis du PC (TableauBordContenu). */
(function(){
  const C=window.MobileCalcul, T=window.TableauBordContenu, D=window.MobileDonnees; if(!C||!T||!D) return;
  const esc=C.esc, CLE='rayle_m_meteo';
  const lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };

  const ICONES={
    soleil:'<svg viewBox="0 0 48 48" class="m-mi m-mi-soleil"><circle cx="24" cy="24" r="8"/><g class="m-rayons"><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2"/></g></svg>',
    eclaircies:'<svg viewBox="0 0 48 48" class="m-mi"><circle cx="17" cy="16" r="6" class="m-s"/><path d="M14 38a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 24a7 7 0 0 1-.9 14z"/></svg>',
    nuageux:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 36a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 22a7 7 0 0 1-.9 14z"/></svg>',
    brouillard:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 28a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 14a7 7 0 0 1-.9 14z"/><path d="M10 34h28M14 40h22"/></svg>',
    bruine:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 28a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 14a7 7 0 0 1-.9 14z"/><g class="m-gouttes"><path d="M16 34v3M24 36v3M32 34v3"/></g></svg>',
    pluie:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 28a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 14a7 7 0 0 1-.9 14z"/><g class="m-gouttes"><path d="M15 33l-2 6M23 33l-2 6M31 33l-2 6"/></g></svg>',
    neige:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 28a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 14a7 7 0 0 1-.9 14z"/><g class="m-gouttes"><circle cx="16" cy="36" r="1.4"/><circle cx="24" cy="39" r="1.4"/><circle cx="32" cy="36" r="1.4"/></g></svg>',
    orage:'<svg viewBox="0 0 48 48" class="m-mi"><path d="M14 27a8 8 0 0 1 .8-15.9A10 10 0 0 1 34 13a7 7 0 0 1-.9 14z"/><path class="m-eclair" d="M25 28l-5 8h4l-2 7 7-10h-4z"/></svg>'
  };
  const icone=c=>ICONES[c]||ICONES.nuageux;

  function lieu(){
    try{ const j=JSON.parse(lire(CLE)||'null'); if(j&&Number.isFinite(j.lat)&&Number.isFinite(j.lon)) return j; }catch(e){}
    try{ const r=T.lireReglages(lire).meteo; if(r&&Number.isFinite(r.lat)&&Number.isFinite(r.lon)) return {nom:r.nom||'Ma ville',lat:r.lat,lon:r.lon}; }catch(e){}
    return null;
  }
  function definir(l){ ecrire(CLE,JSON.stringify({nom:l.nom,lat:+(+l.lat).toFixed(3),lon:+(+l.lon).toFixed(3)})); try{ RayleBus.emit('mobile:meteo',l); }catch(e){} }

  /* Géolocalisation : appelée au toucher d'un bouton. Rend {lat,lon} ou lève une erreur en français. */
  function localiser(){
    return new Promise((ok,ko)=>{
      if(!navigator.geolocation) return ko(new Error('Ce téléphone ne donne pas sa position à la page.'));
      navigator.geolocation.getCurrentPosition(p=>ok({lat:p.coords.latitude,lon:p.coords.longitude}),e=>{
        ko(new Error(e&&e.code===1?'Autorisation refusée : choisis une ville à la place.':e&&e.code===3?'La position met trop de temps : choisis une ville.':'Position introuvable : choisis une ville.'));
      },{enableHighAccuracy:false,timeout:10000,maximumAge:10*60e3});
    });
  }
  async function chargerMeteo(l){
    const rep=await fetch(T.urlMeteo(l.lat,l.lon),{signal:AbortSignal.timeout(10000)}); if(!rep.ok) throw new Error('HTTP '+rep.status);
    const m=T.resumeMeteo(await rep.json(),l.nom); if(m.etat!=='ok') throw new Error(m.raison||'météo illisible'); return m;
  }
  const html=m=>'<div class="m-met"><div class="m-met-ic">'+icone(m.categorie)+'</div><div class="m-met-t"><b class="m-grand">'+T.nombre(m.temp,0)+'°</b><span>'+esc(m.libelle)+'</span><small class="m-faible">'+esc(m.nom)+'</small></div></div>'
    +'<div class="m-ligne m-faible" style="margin-top:6px"><span>ressenti '+(m.ressenti!=null?T.nombre(m.ressenti,0)+'°':'—')+'</span><span>vent '+(m.vent!=null?m.vent+' km/h':'—')+'</span></div>';

  /* Choisir un lieu (feuille) : ma position, ou recherche d'une ville. */
  function choisirLieu(apres){
    MobileCoque.feuille({titre:'Ma météo',rendre(c,o){
      c.innerHTML='<button type="button" class="m-bouton" data-geo style="width:100%;margin-bottom:12px">📍 Utiliser ma position</button><p class="m-faible" data-msg style="min-height:20px;margin:0 0 8px"></p>'
        +'<form data-rech autocomplete="off"><input type="search" placeholder="Chercher une ville…" aria-label="Chercher une ville" enterkeyhint="search" style="width:100%;min-height:52px;padding:0 14px;font:16px var(--m-sans);color:#fff;background:rgba(143,208,227,.07);border:1px solid var(--m-trait-fort)"></form><ul class="m-liste-lieux" data-res style="list-style:none;margin:10px 0 0;padding:0"></ul>';
      const msg=c.querySelector('[data-msg]'), res=c.querySelector('[data-res]');
      const choisi=l=>{ definir(l); o.fermer(); if(apres) apres(l); };
      c.querySelector('[data-geo]').addEventListener('click',async ev=>{ const b=ev.currentTarget; b.disabled=true; msg.textContent='Recherche de ta position…';
        try{ const p=await localiser(); choisi({nom:'Ma position',lat:p.lat,lon:p.lon}); }catch(e){ msg.textContent=e.message; b.disabled=false; } });
      c.querySelector('[data-rech]').addEventListener('submit',async ev=>{ ev.preventDefault(); const q=ev.currentTarget.querySelector('input').value.trim(); if(q.length<2) return; msg.textContent='Recherche…'; res.innerHTML='';
        try{ const r=await fetch(T.urlGeocodage(q),{signal:AbortSignal.timeout(10000)}); const l=T.resultatsGeocodage(await r.json()); msg.textContent=l.length?'':'Aucune ville trouvée.';
          res.innerHTML=l.map((x,i)=>'<li><button type="button" class="m-bouton" data-i="'+i+'" style="width:100%;justify-content:flex-start;margin-bottom:8px;text-align:left">'+esc(x.nom)+'</button></li>').join('');
          res.onclick=e=>{ const b=e.target.closest('[data-i]'); if(b) choisi(l[+b.dataset.i]); };
        }catch(e){ msg.textContent=C.messageErreur(e); } });
    }});
  }

  /* Détail : trois jours. */
  function detail(m){
    MobileCoque.feuille({titre:'Météo · '+(m.nom||''),rendre(c){
      c.innerHTML='<div class="m-met" style="margin-bottom:12px"><div class="m-met-ic">'+icone(m.categorie)+'</div><div class="m-met-t"><b class="m-grand">'+T.nombre(m.temp,0)+'°</b><span>'+esc(m.libelle)+'</span></div></div>'
        +'<div class="m-jours">'+m.jours.map(j=>'<div class="m-jour"><b>'+esc(j.jour)+'</b><div class="m-met-ic m-petit">'+icone(j.categorie)+'</div><span class="m-mono">'+T.nombre(j.max,0)+'° <small class="m-faible">'+T.nombre(j.min,0)+'°</small></span><small class="m-faible">'+(Number.isFinite(j.pluiePct)?'pluie '+j.pluiePct+' %':'')+'</small></div>').join('')+'</div>'
        +'<div class="m-ligne" style="margin-top:14px"><button type="button" class="m-bouton" data-lieu>Changer de lieu</button></div>';
      c.querySelector('[data-lieu]').addEventListener('click',()=>choisirLieu(()=>{ try{ MobileMeteo.recharger(); }catch(e){} }));
    }});
  }

  let suivi=null, zoneCarte=null;
  function monterCarte(zone){
    zoneCarte=zone; zone.innerHTML='';
    const l=lieu();
    if(!l){
      zone.innerHTML='<div class="m-meteo-vide"><p class="m-doux" style="margin:0 0 10px">Quel temps fait-il chez toi ?</p><div class="m-ligne" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"><button type="button" class="m-bouton" data-geo>📍 Ma position</button><button type="button" class="m-bouton" data-ville>Chercher une ville</button></div><p class="m-faible" data-msg style="margin:8px 0 0"></p></div>';
      zone.querySelector('[data-geo]').addEventListener('click',async ev=>{ ev.stopPropagation(); const b=ev.currentTarget, msg=zone.querySelector('[data-msg]'); b.disabled=true; msg.textContent='Recherche de ta position…';
        try{ const p=await localiser(); definir({nom:'Ma position',lat:p.lat,lon:p.lon}); monterCarte(zone); }catch(e){ msg.textContent=e.message; b.disabled=false; } });
      zone.querySelector('[data-ville]').addEventListener('click',ev=>{ ev.stopPropagation(); choisirLieu(()=>monterCarte(zone)); });
      return;
    }
    if(suivi) suivi.arreter();
    suivi=D.suivre({cle:'meteo:'+l.lat+','+l.lon,zone,ttl:15*60e3,squelette:'carte',charger:()=>chargerMeteo(l),rendre:(corps,m0,meta)=>{ const m={...m0,nom:l.nom}; corps.innerHTML=html(m); zone.dataset.m=JSON.stringify(m); }});   // le nom du lieu n'est pas dans la copie (deux noms pour les mêmes coordonnées)
  }
  window.MobileMeteo={lieu,definir,localiser,monterCarte,detail,choisirLieu,icone,recharger:()=>{ if(zoneCarte) monterCarte(zoneCarte); },donneesCarte:()=>{ try{ return JSON.parse(zoneCarte.dataset.m); }catch(e){ return null; } }};
})();
