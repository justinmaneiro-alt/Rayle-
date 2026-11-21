/* ═════════════ VOIX DE RAYLÉ : calculs purs (classement des voix, vitesse et hauteur, contrôle d'un enregistrement, choix par défaut) ═════════════
   Testé : galaxie/tests/voix-moteurs-test.mjs. Utilisable dans la page (window.VoixCalcul) et sous Node (module.exports). */
(function(racine){
  "use strict";

  /* Ordre de préférence quand rien n'est choisi : d'abord ce qui est local et hors ligne, puis le service gratuit en ligne, puis la voix du système. */
  const ORDRE_DEFAUT=['kokoro-siwis','piper-siwis','piper-jessica','edge','systeme'];

  const FEMININES=/denise|eloise|éloïse|vivienne|julie|amelie|amélie|hortense|audrey|marie|celine|céline|virginie|aurelie|aurélie|brigitte|female|femme|siwis|jessica|google fran/i;
  const MASCULINES=/\b(henri|remy|rémy|claude|paul|antoine|mathieu|nicolas|thomas|male|homme|pierre)\b/i;

  /** Note une voix du système (SpeechSynthesisVoice) : plus c'est haut, mieux c'est. Retourne null si la voix n'est pas française. */
  function scoreVoixSysteme(v,feminin){
    const lang=String(v.lang||'').replace('_','-');
    if(!/^fr/i.test(lang)) return null;
    const nom=String(v.name||'');
    let s=10;
    if(/fr-FR/i.test(lang)) s+=6;
    if(/natural|neural|online/i.test(nom)) s+=100;            // Edge « Natural » (Denise, Eloise, Vivienne…)
    else if(/google/i.test(nom)) s+=60;                         // Chrome « Google français »
    else if(/samsung|sm-/i.test(nom)) s+=40;                    // Android Samsung
    else if(/microsoft/i.test(nom)) s+=20;                      // voix Windows locales (Hortense…)
    if(v.localService===false&&/natural|online/i.test(nom)) s+=0; // en ligne : on garde le bonus Natural
    if(feminin!==false){ if(FEMININES.test(nom)) s+=25; if(MASCULINES.test(nom)) s-=40; }
    else { if(MASCULINES.test(nom)) s+=25; }
    if(v.default) s+=1;
    return s;
  }
  function familleVoixSysteme(v){
    const n=String(v.name||'');
    if(/natural|neural|online/i.test(n)) return 'Edge Natural';
    if(/google/i.test(n)) return 'Google';
    if(/samsung|sm-/i.test(n)) return 'Samsung / Android';
    if(/microsoft/i.test(n)) return 'Windows';
    return 'Système';
  }
  /** Voix françaises du système, de la meilleure à la moins bonne. */
  function classerVoixSysteme(voix,feminin){
    return (voix||[]).map(v=>({voix:v,score:scoreVoixSysteme(v,feminin),famille:familleVoixSysteme(v)})).filter(x=>x.score!==null).sort((a,b)=>b.score-a.score);
  }

  /** Vitesse totale voulue (1 = normale) et hauteur en % (+10 = plus aiguë) → réglage du moteur et vitesse de lecture.
      Astuce : on lit l'audio plus vite (plus aigu) et on demande au moteur de parler plus lentement d'autant : la hauteur change, pas le rythme. */
  function facteursLecture(vitesse,hauteurPct){
    const v=Math.max(0.5,Math.min(2,Number(vitesse)||1));
    const f=Math.max(0.75,Math.min(1.35,1+(Number(hauteurPct)||0)/100));
    return {vitesseMoteur:Math.max(0.5,Math.min(2,v/f)),vitesseLecture:f};
  }

  /** Contrôle d'un WAV (16 bits) : durée, niveau sonore, silence. Sert au test automatique des moteurs. */
  function analyserWav(octets){
    const b=octets instanceof Uint8Array?octets:new Uint8Array(octets);
    if(b.length<48||String.fromCharCode(b[0],b[1],b[2],b[3])!=='RIFF') return {ok:false,raison:'pas un fichier WAV'};
    const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
    let pos=12,taux=0,voies=1,debut=-1,taille=0;
    while(pos+8<=b.length){
      const id=String.fromCharCode(b[pos],b[pos+1],b[pos+2],b[pos+3]), n=dv.getUint32(pos+4,true);
      if(id==='fmt '){ voies=dv.getUint16(pos+10,true); taux=dv.getUint32(pos+12,true); }
      if(id==='data'){ debut=pos+8; taille=Math.min(n,b.length-debut); break; }
      pos+=8+n+(n&1);
    }
    if(debut<0||!taux) return {ok:false,raison:'en-tête WAV incomplet'};
    const nb=Math.floor(taille/2/voies); let somme=0,pic=0;
    for(let i=0;i<nb;i++){ const x=dv.getInt16(debut+i*2*voies,true)/32768; somme+=x*x; if(Math.abs(x)>pic) pic=Math.abs(x); }
    const duree=nb/taux, niveau=nb?Math.sqrt(somme/nb):0;
    if(duree<0.4) return {ok:false,duree,niveau,raison:'audio trop court'};
    if(niveau<0.005) return {ok:false,duree,niveau,raison:'audio silencieux'};
    return {ok:true,duree,niveau,pic};
  }

  /** Choix par défaut : la première voix de l'ordre de préférence dont le test automatique a réussi. */
  function choisirParDefaut(resultats,ordre){
    for(const id of (ordre||ORDRE_DEFAUT)) if(resultats&&resultats[id]&&resultats[id].ok) return id;
    return 'systeme';
  }

  const PHRASE_ESSAI="Bonjour, je suis Rayle. L'or est à quatre mille soixante-dix dollars, au-dessus de sa moyenne mobile.";

  /* v7 : Gemini gratuit = environ 3 requêtes par minute. Les phrases d'une réponse sont regroupées en UNE requête (le Worker accepte 600 caractères) ; au-delà, on découpe aux fins de phrase, puis aux virgules, puis aux espaces. */
  function regrouperPourGemini(parts,max){
    max=max||550; const out=[]; let cur='';
    const morceaux=t=>{ if(t.length<=max) return [t]; const r=[]; let reste=t;
      while(reste.length>max){ const tete=reste.slice(0,max); let k=Math.max(tete.lastIndexOf('. '),tete.lastIndexOf('! '),tete.lastIndexOf('? '),tete.lastIndexOf('; ')); if(k<max*0.4) k=Math.max(k,tete.lastIndexOf(', ')); if(k<max*0.4) k=Math.max(k,tete.lastIndexOf(' ')); if(k<1) k=max-1; r.push(reste.slice(0,k+1).trim()); reste=reste.slice(k+1).trim(); }
      if(reste) r.push(reste); return r; };
    for(const p0 of parts||[]){ const p=String(p0||'').trim(); if(!p) continue; for(const m of morceaux(p)){ if(cur&&(cur+' '+m).length>max){ out.push(cur); cur=m; } else cur=cur?cur+' '+m:m; } }
    if(cur) out.push(cur); return out;
  }
  /* Limiteur : au plus `max` départs par fenêtre glissante (défaut 3 par 62 s) ; `creneau()` renvoie le délai (ms) à attendre avant de partir, 0 si on peut partir tout de suite (et réserve alors le créneau). */
  function creerLimiteur(o){ o=o||{}; const max=o.max||3, fenetre=o.fenetre||62000, now=o.maintenant||Date.now; let departs=[];
    return { creneau(){ const t=now(); departs=departs.filter(x=>t-x<fenetre); if(departs.length<max){ departs.push(t); return 0; } return Math.max(1,departs[0]+fenetre-t); }, n(){ const t=now(); return departs.filter(x=>t-x<fenetre).length; } }; }

  const api={regrouperPourGemini,creerLimiteur,ORDRE_DEFAUT,PHRASE_ESSAI,scoreVoixSysteme,classerVoixSysteme,familleVoixSysteme,facteursLecture,analyserWav,choisirParDefaut};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.VoixCalcul=api;
})(typeof window!=='undefined'?window:globalThis);
