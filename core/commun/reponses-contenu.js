/* ═════════════ CONTENU DES FENÊTRES DE RÉPONSE (analyse pure, testée sous Node : galaxie/tests/reponses-contenu-test.mjs) ═════════════
   À partir de la question et de la réponse de Raylé, décide QUELLES fenêtres holographiques ouvrir et avec QUOI :
   heure, marché (chiffres lus chez le Worker), définition, liste, points clés. Rien n'est inventé : le texte vient de la réponse,
   les chiffres du marché sont calculés sur des bougies réelles (ou « indisponible »), l'heure vient de l'appareil.
   Utilisable dans la page (window.ReponsesContenu) et sous Node (module.exports). */
(function(racine){
  "use strict";
  /* minuscules et sans accents, MÊME LONGUEUR que le texte d'origine (les positions restent valables) */
  const A={'à':'a','â':'a','ä':'a','á':'a','ã':'a','é':'e','è':'e','ê':'e','ë':'e','î':'i','ï':'i','í':'i','ô':'o','ö':'o','ó':'o','õ':'o','ù':'u','û':'u','ü':'u','ú':'u','ç':'c','ñ':'n','œ':'o','’':"'"};
  const sans=t=>String(t==null?'':t).toLowerCase().replace(/[àâäáãéèêëîïíôöóõùûüúçñœ’]/g,c=>A[c]||c);

  const MAX_FENETRES=3, MAX_ACTIFS=2;

  function phrases(texte){
    const t=String(texte==null?'':texte).replace(/\s+/g,' ').trim();
    if(!t) return [];
    return t.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Ý«"'0-9])/).map(s=>s.trim()).filter(Boolean);
  }
  function couper(s,max){
    s=String(s).trim();
    if(s.length<=max) return s;
    const c=s.slice(0,max-1), i=c.lastIndexOf(' ');
    return (i>max*0.6?c.slice(0,i):c).replace(/[\s,;:.]+$/,'')+'…';
  }
  /* jusqu'à `max` phrases : la première, puis celles qui contiennent des chiffres, puis les suivantes, dans l'ordre d'origine */
  function pointsCles(texte,max=4,longueur=170){
    const p=phrases(texte);
    if(p.length<=max) return p.map(s=>couper(s,longueur));
    const choisi=new Set([0]);
    p.forEach((s,i)=>{ if(choisi.size<max && /\d/.test(s)) choisi.add(i); });
    for(let i=1;i<p.length&&choisi.size<max;i++) choisi.add(i);
    return [...choisi].sort((a,b)=>a-b).map(i=>couper(p[i],longueur));
  }
  /* liste explicite : lignes à puces ou numérotées, ou au moins trois segments séparés par des points-virgules */
  function liste(texte){
    const t=String(texte==null?'':texte);
    const lignes=t.split(/\n+/).map(l=>l.trim()).filter(Boolean);
    const puces=lignes.filter(l=>/^(?:[-•*–]|\d+[.)])\s+\S/.test(l)).map(l=>l.replace(/^(?:[-•*–]|\d+[.)])\s+/,''));
    if(puces.length>=2) return puces.slice(0,8).map(s=>couper(s,150));
    const seg=t.split(/\s*;\s*/).map(s=>s.trim()).filter(Boolean);
    if(seg.length>=3) return seg.slice(0,8).map(s=>couper(s,150));
    return null;
  }
  const HEURE_RE=/\b(?:quelle heure|l'heure|heure est[- ]il|quel jour|quelle date|la date|on est quel|nous sommes quel|sommes[- ]nous)\b/;
  const estHeure=q=>HEURE_RE.test(sans(q));
  const DEF=[
    /(?:c'est quoi|cest quoi|ca veut dire quoi|ca signifie quoi)\s+(?:un |une |le |la |l'|les |des |du |de la |d')?(.+)$/,
    /qu'est[- ]ce (?:que|qu')\s*(?:c'est(?: que)?|est|sont)?\s*(?:un |une |le |la |l'|les |des )?(.+)$/,
    /(?:que veut dire|que signifie|definition de|definition du|definition d'|definis|definir|explique[- ]moi ce qu'est)\s+(?:un |une |le |la |l'|les |des |du |de la )?(.+)$/
  ];
  /* sujet d'une demande de définition (texte d'origine, accents conservés), ou null */
  function sujetDefinition(question){
    const q=String(question==null?'':question).trim(), s=sans(q);
    for(const re of DEF){
      const m=re.exec(s); if(!m) continue;
      const debut=s.length-m[1].length;
      const sujet=q.slice(debut).replace(/[?!.…\s]+$/,'').trim();
      if(sujet && sujet.length<=48 && sujet.split(/\s+/).length<=5) return sujet;
    }
    return null;
  }
  const ERREUR_RE=/^(?:erreur|impossible|je n'?arrive pas|je ne peux pas|désolée?|desolee?|oups|zut)\b/i;
  const estErreur=t=>ERREUR_RE.test(String(t||'').trim());

  /* qui, dans la question et la réponse, désigne un actif ? (l'appelant donne les détecteurs de marche.js, `or` est un mot courant : plus strict) */
  function actifsMentionnes(question,reponse,detecter){
    if(typeof detecter!=='function') return [];
    const garde=(c,texte)=>c!=='XAU' || /l'or\b|\bxau\b|\bgold\b|(?:^|\s)or\s*\??\s*$/.test(sans(texte));
    const dans=t=>detecter(sans(t)).filter(c=>garde(c,t));
    const q=dans(question);
    const sortie=q.length?q:dans(reponse);
    return [...new Set(sortie)].slice(0,MAX_ACTIFS);
  }

  /* Quelles fenêtres ? → liste ordonnée de {type, id, titre, …} (au plus MAX_FENETRES) */
  function analyser(o){
    o=o||{};
    const q=String(o.question||''), r=String(o.reponse||'').trim();
    const f=[];
    if(!r || estErreur(r)) return f;
    if(estHeure(q)) f.push({type:'heure',id:'holo-heure',titre:'Heure locale'});
    const actifs=o.actifs||[];
    if(actifs.length) f.push({type:'marche',id:'holo-marche',titre:'Marché',actifs:actifs.slice(0,MAX_ACTIFS)});
    const sujet=sujetDefinition(q);
    if(sujet){ const p=phrases(r); f.push({type:'definition',id:'holo-definition',titre:'Définition',sujet,texte:couper(p.slice(0,2).join(' '),330)}); }
    const l=liste(r);
    if(l) f.push({type:'liste',id:'holo-liste',titre:'Liste',items:l});
    else if(!sujet && (r.length>110 || phrases(r).length>=2)) f.push({type:'points',id:'holo-points',titre:'Réponse',points:pointsCles(r)});
    return f.slice(0,MAX_FENETRES);
  }
  /* durée d'affichage (ms) selon le type et la longueur du texte */
  function duree(fenetre,reponse){
    const n=String(reponse||'').length;
    if(fenetre.type==='marche') return 45000;
    if(fenetre.type==='heure') return 20000;
    return Math.min(45000,14000+n*55);
  }

  /* ───── chiffres du marché, calculés sur des bougies réelles [{o,h,l,c,v}] ───── */
  function ema(a,p){ if(a.length<p) return null; const k=2/(p+1); let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p; for(let i=p;i<a.length;i++) e=a[i]*k+e*(1-k); return e; }
  function rsi(c,p){ if(c.length<p+1) return null; let g=0,l=0; for(let i=c.length-p;i<c.length;i++){ const d=c[i]-c[i-1]; if(d>=0) g+=d; else l-=d; } if(l===0) return 100; return 100-100/(1+(g/p)/(l/p)); }
  function calculerMarche(bougies){
    if(!Array.isArray(bougies)||bougies.length<2) return null;
    const c=bougies.map(b=>Number(b.c)).filter(Number.isFinite);
    if(c.length<2) return null;
    const prix=c[c.length-1], prec=c[c.length-2];
    const e=ema(c,200), r=rsi(c,14);
    return {
      prix,
      variation:prec?((+(((prix-prec)/prec)*100).toFixed(2))||0):null,   // « || 0 » : jamais de -0
      rsi:r==null?null:+r.toFixed(1),
      ema200:e==null?null:+e.toFixed(4),
      positionEma:e==null?null:(prix>=e?'au-dessus':'sous')
    };
  }
  const api={sans,phrases,couper,pointsCles,liste,estHeure,sujetDefinition,estErreur,actifsMentionnes,analyser,duree,calculerMarche,MAX_FENETRES};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.ReponsesContenu=api;
})(typeof window!=='undefined'?window:globalThis);
