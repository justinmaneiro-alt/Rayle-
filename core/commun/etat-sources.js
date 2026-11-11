"use strict";
/* ═════════════ ÉTAT DES SOURCES (⚙ Réglages) ═════════════
   Pour chaque source du backend : vert ou rouge, dernière réussite, erreur précise (venue du backend, jamais un « injoignable » générique).
   Si le backend lui-même ne répond pas, la cause est donnée par diagnostiquerWorker() (adresse, réseau, origine refusée, mauvais service).
   Sont aussi testées, depuis CE navigateur, les sources qu'il appelle directement (météo, géocodage inverse, « ce jour-là »). */
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const quand=iso=>{ if(!iso) return 'jamais'; const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000)); return m<1?'à l’instant':m<60?'il y a '+m+' min':m<1440?'il y a '+Math.round(m/60)+' h':'il y a '+Math.round(m/1440)+' j'; };
  const DIRECTES=[
    {nom:'Open-Meteo (météo, navigateur)',url:()=>window.TableauBordContenu?TableauBordContenu.urlMeteo(48.85,2.35):null},
    {nom:'BigDataCloud (géocodage inverse, navigateur)',url:()=>'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=48.85&longitude=2.35&localityLanguage=fr'},
    {nom:'Wikipédia · ce jour-là (navigateur)',url:()=>{ const d=new Date(),p=n=>String(n).padStart(2,'0'); return 'https://api.wikimedia.org/feed/v1/wikipedia/fr/onthisday/events/'+p(d.getMonth()+1)+'/'+p(d.getDate()); }}
  ];
  async function testerDirectes(){
    return Promise.all(DIRECTES.map(async s=>{
      const u=s.url(), t0=performance.now(); if(!u) return {nom:s.nom,ok:false,erreur:'module absent'};
      try{ const c=new AbortController(), tm=setTimeout(()=>c.abort(),9000); const r=await fetch(u,{cache:'no-store',signal:c.signal}); clearTimeout(tm); if(!r.ok) throw new Error('HTTP '+r.status); await r.json(); return {nom:s.nom,ok:true,ms:Math.round(performance.now()-t0)}; }
      catch(e){ return {nom:s.nom,ok:false,erreur:e&&e.name==='AbortError'?'délai dépassé':String((e&&e.message)||e)}; }
    }));
  }
  function ligne(ok,nom,detail,pied){ return '<li class="es-l '+(ok===true?'es-ok':ok===false?'es-ko':'es-nc')+'"><i aria-hidden="true"></i><span class="es-nom">'+esc(nom)+'</span><span class="es-det">'+esc(detail||'')+'</span>'+(pied?'<small>'+esc(pied)+'</small>':'')+'</li>'; }
  const TITRES={'actualite-france':'Actualité · France','actualite-monde':'Actualité · monde','evenements':'Événements','meteo':'Météo','marches':'Marchés et macro','localisation':'Localisation'};
  async function afficher(tester){
    const z=$('etatSources'); if(!z) return; z.innerHTML='<p class="es-info">Lecture de l’état…</p>';
    let w={}; try{ w=RayleBus.demander('worker')||{}; }catch(e){}
    let base=(w.url||(window.RAYLE_CONFIG&&RAYLE_CONFIG.workerUrl)||'').replace(/\/+$/,'');
    let rep=null, erreurBackend=null;
    try{
      const r=await fetch(base+'/sources/etat'+(tester?'?tester=1':''),{cache:'no-store',headers:tester&&w.token?{'X-Rayle-Token':w.token}:{}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      rep=await r.json(); if(!rep||!Array.isArray(rep.sources)) throw new Error('réponse inattendue : ce n’est pas le backend Raylé');
    }catch(e){
      let cause=null; try{ cause=await diagnostiquerWorker(true); }catch(x){}
      erreurBackend=(cause&&cause.message)||('Le backend ne répond pas : '+String((e&&e.message)||e)); rep=null;
    }
    let html='<h4>Backend</h4><ul class="es-liste">'+(rep?ligne(true,'Backend Raylé',base,'version '+rep.version+' · '+rep.cible+' · '+rep.sources.length+' sources'):ligne(false,'Backend Raylé',base||'(aucune adresse)',erreurBackend))+'</ul>';
    if(rep){
      const groupes={}; for(const s of rep.sources) (groupes[s.groupe]=groupes[s.groupe]||[]).push(s);
      for(const g of Object.keys(groupes)){
        const l=groupes[g], v=l.filter(s=>s.ok===true).length, r=l.filter(s=>s.ok===false).length;
        html+='<h4>'+esc(TITRES[g]||g)+' <small>'+v+' vertes · '+r+' rouges · '+(l.length-v-r)+' pas encore appelées</small></h4><ul class="es-liste">'
          +l.map(s=>ligne(s.ok,s.nom,s.ok===true?'réussi '+quand(s.dernierSucces)+(s.ms!=null?' · '+s.ms+' ms':''):s.ok===false?'échec '+quand(s.derniereErreur):'pas encore appelée (cache '+s.ttlSecondes+' s)',s.ok===false?s.erreur:'')).join('')+'</ul>';
      }
    }
    const d=await testerDirectes();
    html+='<h4>Sources appelées par ce navigateur</h4><ul class="es-liste">'+d.map(s=>ligne(s.ok,s.nom,s.ok?s.ms+' ms':'',s.ok?'':s.erreur)).join('')+'</ul>';
    z.innerHTML=html;
  }
  function brancher(){
    const b=$('btnEtatSources'), t=$('btnEtatSourcesTester'); if(!b) return;
    b.addEventListener('click',()=>afficher(false)); if(t) t.addEventListener('click',()=>afficher(true));
  }
  window.EtatSources={afficher,testerDirectes};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',brancher); else brancher();
})();
