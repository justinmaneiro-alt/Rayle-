/* ═════════════ IMAGES DE RÉPONSE PAR WIKIPÉDIA / WIKIMEDIA COMMONS (v8, phase 4) ═════════════
   Question sur une personne, un lieu, un monument, un animal, un objet… → résumé, photo principale, 2 à 4 images secondaires, dates clés, légende, SOURCE ET LICENCE.
   Sources gratuites, sans clé, avec CORS (appel direct depuis la page : plus de dépendance au Worker) : API MediaWiki de fr.wikipedia.org (français d'abord), Wikimedia Commons (licences libres seulement), Wikidata (dates).
   Aucune copie d'images Google. Aucune image inventée. Si aucune image libre n'existe : retourne null (pas de panneau vide).
   Utilisable dans la page (window.ImagesWiki) et sous Node (tests). */
(function(racine){
  "use strict";
  const API='https://fr.wikipedia.org/w/api.php', WD='https://www.wikidata.org/w/api.php';
  const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const LIBRE=/^(?:cc[ -]|cc0|public domain|domaine public|pd[ -]|pd$|gfdl|attribution|free art|copyrighted free use|licence ouverte|open licen|ogl)/i;
  const INUTILE=/(?:icon|logo|flag|drapeau|symbol|commons-|wiki|question|ambox|edit-|folder|disambig|crystal|nuvola|pictogram|marker|location map|carte de localisation|blank|stub|padlock|speaker|audio|ogg|oojs|ooui|increase|decrease|steady|portal|template|signature|autograph|coat of arms|blason|armoiries|sceau|seal of|^file:.*\.svg$|\.svg$|\.gif$|\.tif|\.pdf|\.webm|\.ogv)/i;
  const sansHtml=h=>String(h==null?'':h).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
  const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const lien=(base,p)=>base+'?'+new URLSearchParams(Object.assign({format:'json',formatversion:'2',origin:'*'},p)).toString();
  async function json(url,fetchFn,ms,essai){ const c=typeof AbortController!=='undefined'?new AbortController():null, tm=c?setTimeout(()=>c.abort(),ms||9000):null; try{ const r=await fetchFn(url,c?{signal:c.signal}:{}); if(r.status===429&&!essai){ await new Promise(ok=>setTimeout(ok,1800)); return json(url,fetchFn,ms,1); } if(!r.ok) throw new Error('HTTP '+r.status); return await r.json(); } finally{ if(tm) clearTimeout(tm); } }   /* limite de débit de Wikimedia : une seule relance après une courte pause */

  /* date Wikidata « +1769-08-15T00:00:00Z » (précision 11 = jour, 9 = année) → « 15 août 1769 » */
  function dateFr(v){ if(!v||!v.time) return null; const m=/^([+-])(\d{1,5})-(\d\d)-(\d\d)/.exec(v.time); if(!m) return null; const an=(m[1]==='-'?-1:1)*(+m[2]), prec=v.precision||9;
    const A=an<0?Math.abs(an)+' av. J.-C.':String(an); if(prec>=11&&+m[3]>0&&+m[4]>0) return (+m[4]===1?'1er':+m[4])+' '+MOIS[+m[3]-1]+' '+A; if(prec===10&&+m[3]>0) return MOIS[+m[3]-1]+' '+A; return A; }
  function datesDe(entite){ const c=(entite&&entite.claims)||{}, val=p=>{ const x=c[p]&&c[p][0]&&c[p][0].mainsnak&&c[p][0].mainsnak.datavalue; return x&&x.value; };
    const D=[], nais=dateFr(val('P569')), mort=dateFr(val('P570')), crea=dateFr(val('P571')), fin=dateFr(val('P576'));
    if(nais) D.push({label:'Naissance',val:nais}); if(mort) D.push({label:'Mort',val:mort});
    if(!nais&&crea) D.push({label:'Création',val:crea}); if(fin) D.push({label:'Fin',val:fin});
    return D; }

  /* choix de la page : ni homonymie, de préférence celle dont le titre ressemble au sujet, avec une image */
  function choisirPage(pages,sujet){
    const s=norm(sujet), L=(pages||[]).filter(p=>!(p.pageprops&&p.pageprops.disambiguation!==undefined)&&!/\(homonymie\)/i.test(p.title||'')).sort((a,b)=>(a.index||99)-(b.index||99));
    if(!L.length) return null;
    /* 1) titre identique au sujet (articles ignorés : « La Joconde » = « Joconde ») ; 2) titre qui commence par le sujet ; 3) première page avec une image */
    const sa=s.replace(/^(?:la|le|les|l|un|une|des) /,''), tit=p=>norm(String(p.title).replace(/\(.*?\)/g,'')).replace(/^(?:la|le|les|l|un|une|des) /,'');
    return L.find(p=>tit(p)===sa)||L.find(p=>p.thumbnail&&tit(p).startsWith(sa+' '))||L.find(p=>p.thumbnail)||L[0];
  }
  /* images candidates d'une page : jpg/png/webp, pas d'icônes ni de logos */
  function candidates(titres,exclure){ const vus=new Set(exclure||[]); return (titres||[]).map(x=>x.title).filter(t=>/\.(jpe?g|png|webp)$/i.test(t)&&!INUTILE.test(t)).filter(t=>!vus.has(t)).slice(0,14); }
  /* métadonnées Commons → { url, largeur, hauteur, legende, licence, auteur, page } ; null si licence non libre ou image trop petite */
  function infoImage(ii,titre){
    if(!ii) return null; const m=ii.extmetadata||{}, lic=sansHtml(m.LicenseShortName&&m.LicenseShortName.value);
    if(!lic||!LIBRE.test(lic)) return null; if((ii.width||0)<300||(ii.height||0)<200) return null;
    const auteur=sansHtml(m.Artist&&m.Artist.value)||sansHtml(m.Credit&&m.Credit.value), leg=sansHtml(m.ImageDescription&&m.ImageDescription.value);
    return {url:ii.thumburl||ii.url,original:ii.url,largeur:ii.thumbwidth||ii.width,hauteur:ii.thumbheight||ii.height,legende:(leg||String(titre).replace(/^(?:File|Fichier):/i,'').replace(/\.[a-z]+$/i,'').replace(/_/g,' ')).slice(0,160),licence:lic,auteur:auteur.slice(0,80),page:ii.descriptionurl||null};
  }
  function ratio(i){ return i.largeur&&i.hauteur?i.largeur/i.hauteur:1; }

  async function chercher(sujet,opts){
    opts=opts||{}; const fetchFn=opts.fetchFn||((...a)=>fetch(...a)), maxSec=Math.max(2,Math.min(4,opts.secondaires||4));
    const q=String(sujet||'').trim(); if(q.length<2) return null;
    const A=await json(lien(API,{action:'query',generator:'search',gsrsearch:q,gsrlimit:'6',prop:'pageimages|extracts|description|pageprops|info',piprop:'thumbnail|name',pithumbsize:'900',exintro:'1',explaintext:'1',exsentences:'3',inprop:'url',ppprop:'wikibase_item|disambiguation'}),fetchFn);
    const page=choisirPage((A.query&&A.query.pages)||[],q); if(!page) return null;
    const titre=page.title, resume=String(page.extract||'').replace(/\s+/g,' ').trim(), wb=page.pageprops&&page.pageprops.wikibase_item;
    /* images de l'article DANS L'ORDRE où il les utilise (en tête : l'infobox et le début, donc les plus représentatives), puis licences par Commons */
    const [P,W]=await Promise.all([json(lien(API,{action:'parse',page:titre,prop:'images',redirects:'1'}),fetchFn).catch(()=>null), wb?json(lien(WD,{action:'wbgetentities',ids:wb,props:'claims',format:'json'}),fetchFn).catch(()=>null):Promise.resolve(null)]);
    const dansArticle=(P&&P.parse&&P.parse.images)||[]; const fichier=n=>'File:'+String(n).replace(/^(?:File|Fichier):/i,'').replace(/_/g,' ');
    const principaleNom=page.pageimage?fichier(page.pageimage):null;
    const noms=[principaleNom].concat(candidates(dansArticle.map(n=>({title:fichier(n)})),principaleNom?[principaleNom]:[])).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0,18);
    const metas=noms.length?await json(lien(API,{action:'query',titles:noms.join('|'),prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'800',iiextmetadatafilter:'LicenseShortName|Artist|Credit|ImageDescription'}),fetchFn):null;   /* une panne ici remonte (limite de débit, réseau) : « null » veut dire seulement « aucune image libre » */
    const cle=t=>String(t).replace(/^(?:File|Fichier):/i,'').replace(/_/g,' ').toLowerCase();
    const infos=new Map(((metas&&metas.query&&metas.query.pages)||[]).map(p=>[cle(p.title),infoImage(p.imageinfo&&p.imageinfo[0],p.title)]));
    const O=noms.map(n=>({n,i:infos.get(cle(n))})).filter(x=>x.i);
    const principale=O.length?O[0].i:null;
    /* secondaires : dans l'ordre de l'article (les premières images sont les plus représentatives), sans doublon, formes variées préférées */
    const sec=O.slice(1).map(x=>x.i).filter(i=>i&&(!principale||i.url!==principale.url)).slice(0,maxSec);
    if(!principale) return null;   // aucune image libre : pas de panneau vide
    /* dates clés (Wikidata) */
    let dates=[]; try{ dates=datesDe(W&&W.entities&&W.entities[wb]); }catch(e){ dates=[]; }
    return {sujet:q,titre,description:page.description||'',resume,url:page.fullurl||('https://fr.wikipedia.org/wiki/'+encodeURIComponent(titre.replace(/ /g,'_'))),dates,principale,secondaires:sec,source:'Wikipédia (fr) · Wikimedia Commons · Wikidata'};
  }
  const api={chercher,choisirPage,candidates,infoImage,dateFr,datesDe,sansHtml,norm,LIBRE,INUTILE};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.ImagesWiki=api;
})(typeof window!=='undefined'?window:globalThis);
