"use strict";
/* ═════════════ RÉGLAGES · « AUTONOMIE » (2026-11-14) : l'appli sans le PC ═════════════
   Section ajoutée à la fenêtre ⚙ Réglages : qualité graphique, Terre, sources de données, notifications, fournisseur d'IA, sauvegarde et restauration
   des données de l'appareil (journal, capital, réglages), état des sources (direct / snapshot / copie locale), version de l'application.
   Rien n'est envoyé en ligne : la sauvegarde est un fichier JSON que tu gardes. Les secrets (jeton, clés, code d'accès) ne sont JAMAIS exportés.
   Partie pure (testée sous Node : galaxie/tests/reglages-autonomie-test.mjs) exposée dans window.ReglagesAutonomie.pur ; l'interface se monte dans #cfg. */
(function(racine){
  const SECRETS=/token|jeton|secret|cle_api|apikey|api_key|pin|passe|phrase|code_acces|rayle_worker|cle_ia/i;
  const FORMAT='rayle-sauvegarde-v1';
  const BASES_EXCLUES=/^(rayle-donnees|workbox|firebase)/i;

  /* ───── partie pure ───── */
  function clesSauvegardables(stockage){ const L=[]; for(let i=0;i<stockage.length;i++){ const k=stockage.key(i); if(/^rayle[_-]/i.test(k)&&!SECRETS.test(k)) L.push(k); } return L.sort(); }
  function construireSauvegarde({stockage,bases={},maintenant=Date.now(),version=''}){ const cles={}; for(const k of clesSauvegardables(stockage)){ const v=stockage.getItem(k); if(v!=null) cles[k]=v; } return {format:FORMAT,t:maintenant,version,cles,bases}; }
  /* validation stricte avant restauration : jamais d'écriture partielle sur un fichier douteux */
  function validerSauvegarde(o){
    if(!o||typeof o!=='object'||Array.isArray(o)) return 'le fichier n’est pas une sauvegarde Raylé';
    if(o.format!==FORMAT) return 'format inconnu (attendu : '+FORMAT+')';
    if(!o.cles||typeof o.cles!=='object'||Array.isArray(o.cles)) return 'section « cles » absente';
    for(const [k,v] of Object.entries(o.cles)){ if(!/^rayle[_-]/i.test(k)) return 'clé non autorisée : '+k.slice(0,40); if(SECRETS.test(k)) return 'clé secrète refusée : '+k.slice(0,40); if(typeof v!=='string') return 'valeur invalide pour '+k.slice(0,40); }
    if(o.bases&&typeof o.bases==='object'){ for(const [nom,b] of Object.entries(o.bases)){ if(!/^rayle[_-]/i.test(nom)||BASES_EXCLUES.test(nom)) return 'base non autorisée : '+nom.slice(0,40); if(!b||typeof b.stores!=='object') return 'base illisible : '+nom.slice(0,40); } }
    return true;
  }
  function resume(o){ const n=Object.keys(o.cles||{}).length, b=Object.keys(o.bases||{}).length; return n+' réglage(s) et données, '+b+' base(s) locale(s)'; }
  const phraseAge=(ms)=>{ if(ms==null) return 'jamais'; const m=Math.round(ms/60000); return m<1?'à l’instant':m<60?'il y a '+m+' min':m<2880?'il y a '+Math.round(m/60)+' h':'il y a '+Math.round(m/1440)+' j'; };
  const lignesEtat=(liste,maintenant=Date.now())=>liste.map(e=>({cle:e.cle,origine:e.origine||'aucune',age:e.t?phraseAge(maintenant-e.t):'jamais',erreur:e.erreur||'',horsLigne:!!e.horsLigne}));
  const qualitesValides=['auto','elevee','economie'];
  const qualiteLue=(s)=>{ let v='auto'; try{ v=s.getItem('rayle_qualite')||'auto'; }catch(e){} return qualitesValides.includes(v)?v:'auto'; };
  racine.ReglagesAutonomiePur={clesSauvegardables,construireSauvegarde,validerSauvegarde,resume,lignesEtat,qualiteLue,phraseAge,FORMAT,SECRETS};
  if(typeof document==='undefined') return;

  /* ───── bases locales (IndexedDB) : export / import génériques ───── */
  const ouvrirBase=(nom)=>new Promise((res,rej)=>{ const r=indexedDB.open(nom); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); r.onblocked=()=>rej(new Error('base bloquée')); });
  async function exporterBases(){
    const out={}; if(!indexedDB||!indexedDB.databases) return out;
    for(const d of await indexedDB.databases()){ if(!d.name||!/^rayle[_-]/i.test(d.name)||BASES_EXCLUES.test(d.name)) continue;
      try{ const db=await ouvrirBase(d.name), stores={}; for(const nom of [...db.objectStoreNames]){ stores[nom]=await new Promise((res,rej)=>{ const t=db.transaction(nom,'readonly'),s=t.objectStore(nom),cles=s.getAllKeys(),vals=s.getAll(); t.oncomplete=()=>{ const L=[]; for(let i=0;i<vals.result.length;i++){ let v=vals.result[i]; try{ JSON.stringify(v); }catch(e){ continue; } if(typeof Blob!=='undefined'&&v instanceof Blob) continue; L.push([cles.result[i],v]); } res({gouttiere:s.keyPath||null,auto:!!s.autoIncrement,lignes:L}); }; t.onerror=()=>rej(t.error); }); } db.close(); out[d.name]={version:db.version,stores}; }
      catch(e){ out[d.name]={erreur:String(e.message||e),stores:{}}; } }
    return out;
  }
  async function importerBases(bases){
    let n=0; for(const [nom,b] of Object.entries(bases||{})){ if(b.erreur||!Object.keys(b.stores).length) continue;
      try{ const db=await ouvrirBase(nom); for(const [sn,st] of Object.entries(b.stores)){ if(!db.objectStoreNames.contains(sn)) continue; await new Promise((res,rej)=>{ const t=db.transaction(sn,'readwrite'),s=t.objectStore(sn); for(const [k,v] of st.lignes){ try{ st.gouttiere?s.put(v):s.put(v,k); n++; }catch(e){} } t.oncomplete=res; t.onerror=()=>rej(t.error); }); } db.close(); }catch(e){ console.warn('[sauvegarde] base ignorée',nom,e&&e.message); } }
    return n;
  }

  /* ───── interface ───── */
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const lire=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
  const ecrire=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
  const mode=()=>{ try{ return window.RayleAppareil?window.RayleAppareil.mode():'pc'; }catch(e){ return 'pc'; } };
  function html(){
    const q=qualiteLue(localStorage), tv=lire('rayle_terre_vue','auto'), ia=lire('rayle_ia_fournisseur','manuel'), base=lire('rayle_donnees_base','');
    const opt=(v,t,cur)=>'<option value="'+v+'"'+(v===cur?' selected':'')+'>'+t+'</option>';
    return '<h3>Autonomie · sans le PC</h3>'+
      '<p class="es-info">Cette appli fonctionne seule : données lues directement, instantanés publiés par un robot, copie gardée sur l’appareil. Rien d’inventé : une donnée absente est dite absente.</p>'+
      '<label for="raQualite">Qualité graphique</label><select id="raQualite">'+opt('auto','Automatique (selon l’appareil)',q)+opt('elevee','Élevée',q)+opt('economie','Économie (batterie, vieux téléphone)',q)+'</select>'+
      '<p class="es-info" id="raQualiteInfo"></p>'+
      '<label for="raTerre">Terre sur cet appareil</label><select id="raTerre">'+opt('auto','Automatique (PC : 3D complète · téléphone et tablette : globe léger)',tv)+opt('mobile','Globe léger (recommandé sur téléphone)',tv)+opt('3d','3D complète du PC (lourd)',tv)+opt('leger','Carte plate',tv)+'</select>'+
      '<label for="raBase">Sources de données · adresse des instantanés</label><input id="raBase" type="url" autocomplete="off" spellcheck="false" placeholder="par défaut : branche « donnees » du dépôt GitHub" value="'+esc(base)+'">'+
      '<p class="es-info">Ordre de lecture : copie de l’appareil affichée tout de suite, puis lecture directe (Kraken, Binance, USGS, Open-Meteo…), puis instantané publié. Le serveur du PC n’est essayé que si la page vient de lui.</p>'+
      '<div class="row"><button type="button" class="ghost" id="raBaseOk">Enregistrer l’adresse</button><button type="button" class="ghost" id="raBaseRaz">Revenir au défaut</button></div>'+
      '<label for="raIA">Fournisseur d’IA (facultatif)</label><select id="raIA">'+opt('manuel','Aucun · mode manuel gratuit (export / import)',ia)+opt('gemini','Gemini (gratuit avec limites)',ia)+opt('groq','Groq (gratuit avec limites)',ia)+opt('openrouter','OpenRouter (modèles gratuits)',ia)+opt('anthropic','Anthropic (payant)',ia)+'</select>'+
      '<p class="es-info" id="raIAinfo"></p>'+
      '<label>Notifications</label><p class="es-info" id="raNotifInfo"></p><div class="row"><button type="button" class="ghost" id="raNotifOn">Activer les notifications</button><button type="button" class="ghost" id="raNotifTest">Envoyer un test</button></div>'+
      '<label>Sauvegarde des données de l’appareil</label><p class="es-info">Journal, capital, réglages, dessins : un fichier JSON que tu gardes (rien n’est envoyé en ligne). Les codes d’accès et clés ne sont jamais inclus.</p>'+
      '<div class="row"><button type="button" class="ghost" id="raSauve">Sauvegarder</button><button type="button" class="ghost" id="raRestaure">Restaurer…</button><input type="file" id="raFichier" accept="application/json,.json" hidden></div><p class="es-info" id="raSauveInfo" role="status"></p>'+
      '<label>État des sources</label><div class="row"><button type="button" class="ghost" id="raEtat">Actualiser l’état</button></div><div id="raEtatTab" class="ra-tab"></div>'+
      '<label>Version de l’application</label><p class="es-info" id="raVersion"></p><div class="row"><button type="button" class="ghost" id="raMaj">Rechercher une mise à jour</button></div>';
  }
  const coller=()=>{
    const cfg=document.getElementById('cfg'); if(!cfg||document.getElementById('ra-section')) return;
    const sec=document.createElement('div'); sec.id='ra-section'; sec.innerHTML=html();
    const ref=[...cfg.querySelectorAll('h3')].find(h=>/^Application$/i.test(h.textContent.trim()));
    if(ref) cfg.insertBefore(sec,ref); else cfg.appendChild(sec);
    const $=id=>document.getElementById(id), info=(id,t)=>{ const e=$(id); if(e) e.textContent=t; };
    const majQualite=()=>info('raQualiteInfo','Appareil détecté : '+({pc:'PC',tablette:'tablette',telephone:'téléphone'}[mode()]||mode())+' · qualité « '+qualiteLue(localStorage)+' ». Elle s’applique à la prochaine ouverture de la Terre.');
    majQualite(); $('raQualite').addEventListener('change',e=>{ ecrire('rayle_qualite',e.target.value==='auto'?null:e.target.value); majQualite(); });
    $('raTerre').addEventListener('change',e=>{ ecrire('rayle_terre_vue',e.target.value==='auto'?null:e.target.value); });
    $('raBaseOk').addEventListener('click',()=>{ const v=$('raBase').value.trim(); if(v&&!/^https?:\/\//i.test(v)){ info('raSauveInfo','Adresse refusée : elle doit commencer par https://'); return; } ecrire('rayle_donnees_base',v||null); info('raSauveInfo',v?'Adresse enregistrée.':'Adresse par défaut rétablie.'); });
    $('raBaseRaz').addEventListener('click',()=>{ ecrire('rayle_donnees_base',null); $('raBase').value=''; info('raSauveInfo','Adresse par défaut rétablie.'); });
    const majIA=()=>{ const v=$('raIA').value; info('raIAinfo',v==='manuel'?'Mode manuel : tu exportes le texte structuré, tu le colles dans l’IA de ton choix, puis tu importes sa réponse (validée avant affichage). Aucune clé nécessaire.':'Choix noté. L’analyse automatique demande le serveur de Rayle (la clé reste dans agent-trading/.env, jamais dans l’appli) : sans le PC, seul le mode manuel marche.'); };
    majIA(); $('raIA').addEventListener('change',e=>{ ecrire('rayle_ia_fournisseur',e.target.value==='manuel'?null:e.target.value); majIA(); });
    const majNotif=()=>{ const p=('Notification' in window)?Notification.permission:'indisponible'; info('raNotifInfo',({granted:'Autorisées sur cet appareil. ',denied:'Refusées par le navigateur (à rouvrir dans les réglages du site). ',default:'Pas encore autorisées. ',indisponible:'Non disponibles ici. '}[p]||'')+'Elles fonctionnent appli ouverte ; appli fermée, ce sont les alertes Telegram du robot GitHub (quelques minutes de retard, jamais à la seconde).'); };
    majNotif(); $('raNotifOn').addEventListener('click',async()=>{ try{ if('Notification' in window) await Notification.requestPermission(); }catch(e){} majNotif(); });
    $('raNotifTest').addEventListener('click',async()=>{ try{ if(!('Notification' in window)||Notification.permission!=='granted'){ info('raNotifInfo','Active d’abord les notifications.'); return; } const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration(); if(reg&&reg.showNotification) await reg.showNotification('Raylé',{body:'Test de notification : tout fonctionne.',tag:'rayle-test'}); else new Notification('Raylé',{body:'Test de notification : tout fonctionne.'}); }catch(e){ info('raNotifInfo','Test impossible : '+(e&&e.message||e)); } });
    $('raSauve').addEventListener('click',async()=>{ try{ const bases=await exporterBases(), s=construireSauvegarde({stockage:localStorage,bases,version:window.RAYLE_VERSION||''}), blob=new Blob([JSON.stringify(s)],{type:'application/json'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='rayle-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000); info('raSauveInfo','Sauvegarde créée : '+resume(s)+'.'); }catch(e){ info('raSauveInfo','Sauvegarde impossible : '+(e&&e.message||e)); } });
    $('raRestaure').addEventListener('click',()=>$('raFichier').click());
    $('raFichier').addEventListener('change',async e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=''; if(!f) return; try{ if(f.size>40*1024*1024) throw new Error('fichier trop gros'); const o=JSON.parse(await f.text()), v=validerSauvegarde(o); if(v!==true){ info('raSauveInfo','Restauration refusée : '+v+'. Rien n’a été modifié.'); return; } if(!confirm('Restaurer '+resume(o)+' ? Les données actuelles de même nom seront remplacées.')) return; for(const [k,val] of Object.entries(o.cles)) localStorage.setItem(k,val); const n=await importerBases(o.bases); info('raSauveInfo','Restauré : '+resume(o)+' ('+n+' ligne(s) de base locale). Recharge la page pour tout voir.'); }catch(err){ info('raSauveInfo','Restauration impossible : '+(err&&err.message||err)+'. Rien n’a été modifié.'); } });
    const majEtat=async()=>{ const el=$('raEtatTab'); let L=[]; try{ const m=await import(new URL('agent-trading/front/donnees/couche.js',document.baseURI).href); L=lignesEtat(m.etatSources()); }catch(e){}
      let robot=''; try{ const m=await import(new URL('agent-trading/front/donnees/couche.js',document.baseURI).href), r=await fetch(m.urlSnapshot('index.json'),{cache:'no-cache',signal:AbortSignal.timeout(8000)}); const d=await r.json(); const ko=Object.entries(d.fichiers||{}).filter(([,x])=>!x.ok).length; robot='<p class="es-info">Robot de données : dernier passage '+esc(phraseAge(Date.now()-d.t))+' · '+Object.keys(d.fichiers||{}).length+' fichiers'+(ko?' · '+ko+' en échec (copie précédente conservée)':'')+'.</p>'; }catch(e){ robot='<p class="es-info">Robot de données : instantanés non joignables pour le moment.</p>'; }
      el.innerHTML=robot+(L.length?'<table class="ra-t"><tr><th>Source</th><th>Origine</th><th>Âge</th><th>Erreur</th></tr>'+L.map(l=>'<tr class="'+(l.horsLigne?'ra-hl':'')+'"><td>'+esc(l.cle)+'</td><td>'+esc(({direct:'direct',snapshot:'instantané',pc:'serveur du PC',cache:'copie locale',aucune:'aucune'})[l.origine]||l.origine)+'</td><td>'+esc(l.age)+'</td><td>'+esc(l.erreur.slice(0,90))+'</td></tr>').join('')+'</table>':'<p class="es-info">Aucune source lue depuis l’ouverture : ouvre le terminal ou la Terre, puis reviens ici.</p>'); };
    $('raEtat').addEventListener('click',majEtat); window.addEventListener('rayle:donnees-etat',()=>{ if(cfg.classList.contains('open')) clearTimeout(majEtat.t),majEtat.t=setTimeout(majEtat,600); });
    const majVersion=async()=>{ let sw='inconnue'; try{ const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration(); if(reg&&reg.active){ sw=await new Promise(res=>{ const t=setTimeout(()=>res('sans réponse'),1500); navigator.serviceWorker.addEventListener('message',function f(e){ if(e.data&&e.data.type==='VERSION'){ clearTimeout(t); navigator.serviceWorker.removeEventListener('message',f); res(e.data.version); } }); reg.active.postMessage({type:'VERSION'}); }); } else sw='non installé'; }catch(e){} info('raVersion','Application '+(window.RAYLE_VERSION||'?')+' · service hors ligne '+sw+'.'); };
    majVersion(); $('raMaj').addEventListener('click',async()=>{ try{ const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration(); if(!reg){ info('raVersion','Pas de service hors ligne installé (navigateur sans installation).'); return; } await reg.update(); info('raVersion','Recherche faite : si une nouvelle version existe, la bannière « Nouvelle version disponible, recharger » apparaît.'); setTimeout(majVersion,1500); }catch(e){ info('raVersion','Recherche impossible : '+(e&&e.message||e)); } });
    document.getElementById('gear')&&document.getElementById('gear').addEventListener('click',()=>{ majQualite(); majNotif(); majVersion(); });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',coller); else coller();
  racine.ReglagesAutonomie={coller,exporterBases,importerBases,pur:racine.ReglagesAutonomiePur};
})(typeof window!=='undefined'?window:globalThis);
