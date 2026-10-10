"use strict";
  /* ═════════════ IMAGES ET VIDÉOS ENVOYÉES (bouton 📎, coller, glisser) ═════════════ */
  const IMG_SUIVI_RE=/\b(l'image|cette image|l'?capture|la capture|cette capture|la photo|cette photo|le screen|la screenshot|sur l'image|sur la capture|sur la photo|le graphique que je t'ai envoye|ce que je t'ai envoye|ce que je viens d'envoyer)\b/;
  let lastImage=null;
  const VIDEO_MAX=95*1024*1024;
  function reduireImage(file){
    return new Promise((res,rej)=>{
      const url=URL.createObjectURL(file); const img=new Image();
      img.onload=()=>{
        const k=Math.min(1,1800/Math.max(img.width,img.height));
        const c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.9));
      };
      img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('image illisible')); };
      img.src=url;
    });
  }
  /* Devoirs et documents : rangés dans Drive (« Raylé - Cours / Devoirs »), puis Raylé les lit avec ses outils (lire_devoir, remplir_pdf…) */
  const DOC_MAX=25*1024*1024;
  const MIME_DOCS={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',md:'text/markdown',csv:'text/csv'};
  const mimeDoc=f=>{ const e=((String(f.name||'').match(/\.([A-Za-z0-9]{1,5})$/)||[])[1]||'').toLowerCase(); return MIME_DOCS[e] || (Object.values(MIME_DOCS).includes(f.type)?f.type:''); };
  async function deposerDocument(file,question,mime){
    if(file.size>DOC_MAX){ addLine('sys','Document trop lourd ('+Math.round(file.size/1048576)+' Mo, maximum 25 Mo).'); return; }
    if(!workerReady()){ addLine('sys','Il me faut le Worker pour ranger un document dans Drive : configurez-le dans ⚙ Réglages.'); return; }
    addLine('user',(String(question||'').trim()||'Voici un devoir.')+'  [document : '+file.name+', '+Math.max(1,Math.round(file.size/1024))+' Ko]');
    if(micOn && reveilActif()) enterConversation();
    addLine('sys','Document : envoi dans Drive (Raylé - Cours / Devoirs)…');
    try{
      const res=await wfetch('/drive/deposer',{method:'POST',headers:{'Content-Type':mime,'X-Nom':encodeURIComponent(file.name)},body:file},120000);
      if(!res.ok) throw await workerError(res);
      const d=await res.json();
      addLine('sys','Document rangé dans Drive : '+d.nom);
      queue.push("J'ai déposé le devoir « "+d.nom+" » dans le Drive (fichier "+d.id+"). "+(String(question||'').trim()||"Lis-le et dis-moi ce qu'il demande."));
      if(!processing) drain();
    }catch(e){ addLine('sys','Document : '+errMsg(e)); }
  }
  function envoyerFichier(file,question){
    if(!file) return;
    const isImg=/^image\//.test(file.type), isVid=/^video\//.test(file.type);
    const mimeD=(!isImg && !isVid) ? mimeDoc(file) : '';
    if(mimeD){ deposerDocument(file,question,mimeD); return; }
    if(!isImg && !isVid){ addLine('sys','Fichier ignoré : images, vidéos, PDF, Word, PowerPoint et textes sont acceptés.'); return; }
    if(isVid && file.size>VIDEO_MAX){ addLine('sys','Vidéo trop lourde ('+Math.round(file.size/1048576)+' Mo, maximum 95 Mo). Coupez-la ou réduisez sa qualité.'); return; }
    const q=String(question||'').trim() || (isImg?'Analyse cette image.':'Analyse cette vidéo.');
    addLine('user',q+'  ['+(isImg?'image':'vidéo')+' : '+(file.name||'collée')+', '+Math.max(1,Math.round(file.size/1024))+' Ko]');
    if(micOn && reveilActif()) enterConversation();
    queue.push({file,q,isImg});
    if(!processing) drain();
  }
  async function respondMedia(it){
    const my=epoch;
    setState('thinking');
    if(!workerReady()){ const r="Il me faut le Worker pour regarder une image ou une vidéo : configurez-le dans ⚙ Réglages."; addLine('ray',r); await speak(r); return; }
    const isImg=it.image ? true : it.isImg;
    try{
      let d;
      if(isImg){
        const dataUrl=it.image || await reduireImage(it.file);
        if(my!==epoch) return;
        lastImage={dataUrl,nom:it.nom||(it.file&&it.file.name)||'image',t:Date.now()};
        addLine('sys',it.suivi?'Image : je la regarde à nouveau pour répondre…':'Image : analyse par Gemini…');
        const res=await wfetch('/image',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({image:dataUrl,question:it.q,context:contextText(),history:historiqueChat.slice(-4)})},100000);
        if(!res.ok) throw await workerError(res);
        d=await res.json();
      }else{
        addLine('sys','Vidéo : envoi à Gemini ('+Math.round(it.file.size/1048576)+' Mo) puis analyse, ça peut prendre une à deux minutes…');
        speak(pick(['Je regarde ta vidéo, Justin. Ça peut prendre une minute ou deux.','Vidéo reçue. '+fx('Laissez','Laisse')+'-moi le temps de la regarder.']).replace('ta vidéo',fx('votre vidéo','ta vidéo')));
        const res=await wfetch('/video?q='+encodeURIComponent(it.q),{method:'POST',headers:{'Content-Type':it.file.type||'video/mp4','X-Taille':String(it.file.size)},body:it.file},300000);
        if(!res.ok) throw await workerError(res);
        d=await res.json();
        lastVideo={titre:it.file.name||'vidéo envoyée',auteur:'',analyse:d.reply,mode:'gemini',t:Date.now()};
      }
      if(my!==epoch) return;
      if(!valid(d.reply)) throw new Error('réponse vide');
      addLine('sys','Moteur : Gemini · '+(d.model||''));
      historiqueChat.push({role:'user',content:it.q+' ['+(isImg?'image':'vidéo')+' envoyée]'},{role:'assistant',content:d.reply});
      saveHistory();
      if(isImg && lastImage) pn(montrerImage,lastImage.dataUrl,it.q);
      addLine('ray',d.reply);
      await speak(d.reply);
    }catch(e){
      if(my!==epoch) return;
      addLine('sys',(isImg?'Image':'Vidéo')+' : '+errMsg(e));
      const r="Je n'ai pas pu analyser "+(isImg?"l'image":'la vidéo')+' : '+errMsg(e).replace(/ — détail.*$/,'').slice(0,160)+'.';
      addLine('ray',r); await speak(r);
    }
  }

  /* ═════════════ VIDÉOS YOUTUBE ═════════════ */
  const YT_URL_RE=/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{11}[^\s]*/i;
  let lastVideoUrl='', lastVideoUrlT=0, lastVideo=null;
  const urlYoutube=t=>{ const m=String(t||'').match(YT_URL_RE); return m?m[0]:''; };
  async function urlDepuisPressePapier(){
    try{
      if(!navigator.clipboard || !navigator.clipboard.readText) return '';
      return urlYoutube(await navigator.clipboard.readText());
    }catch(e){ return ''; }
  }
  function videoContext(v){
    return 'VIDÉO YOUTUBE « '+(v.titre||'sans titre')+' »'+(v.auteur?' de la chaîne '+v.auteur:'')
      +' ('+(v.mode==='gemini'?'vidéo regardée par Gemini':"d'après les sous-titres")+') — analyse détaillée :\n'+String(v.analyse||'').slice(0,9000);
  }
  async function ctxVideo(url,live,stamp){
    addLine('sys','YouTube : analyse de la vidéo en cours (jusqu\'à deux minutes)…');
    speak(pick(['Je regarde la vidéo, Justin. Ça peut prendre une minute.','Lancement de la vidéo. '+fx('Laissez','Laisse')+'-moi une minute.']));
    try{
      const d=await wjson('/youtube?url='+encodeURIComponent(url),150000);
      if(stamp!==epoch) return '';
      lastVideo={titre:d.titre||'',auteur:d.auteur||'',analyse:d.analyse||'',mode:d.mode,t:Date.now(),url};
      addLine('sys','YouTube : « '+(d.titre||d.id)+' »'+(d.auteur?' · '+d.auteur:'')+' · '+(d.mode==='gemini'?'vidéo regardée par Gemini':'analyse des sous-titres')+(d.cache&&d.cache!=='non'?' (déjà analysée)':''));
      live.extra.push('Vidéo « '+(d.titre||'')+' » : '+String(d.analyse||'').slice(0,600));
      return videoContext(lastVideo);
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','YouTube : '+errMsg(e));
      return 'VIDÉO YOUTUBE : analyse impossible ('+errMsg(e)+'). Explique-le simplement à Justin, sans inventer le contenu de la vidéo.';
    }
  }
