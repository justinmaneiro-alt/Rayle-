/* ═════════════ FRANÇAIS PARLÉ NATUREL : NORMALISATION DU TEXTE AVANT LA SYNTHÈSE (module pur, testé : galaxie/tests/normalisation-fr-test.mjs) ═════════════
   Entrée : le texte de la réponse (peut contenir du markdown, des émojis, des chiffres, des sigles de marché).
   Sortie : un texte que n'importe quel moteur de synthèse lit correctement en français :
   · nombres, prix, pourcentages, heures, dates, ordinaux, devises écrits en toutes lettres (« 4 070,25 » → « quatre mille soixante-dix virgule vingt-cinq ») ;
   · sigles et abréviations de marché prononcés (MA200, RSI, ATR, COT, SL, TP, H1, M15, US100…), dictionnaire de prononciation modifiable (définirDictionnaire) ;
   · jamais de markdown, de symbole ni d'émoji lu à voix haute ; phrases courtes avec une ponctuation qui donne de la prosodie.
   Utilisable dans la page (window.NormFr) et sous Node (module.exports). */
(function(racine){
  "use strict";

  /* ───────── nombres ───────── */
  const UNITES=['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
  const DIZAINES=['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
  function moinsDeCent(n,fin){   // fin : vrai quand rien ne suit (« quatre-vingts »)
    if(n<20) return UNITES[n];
    const d=Math.floor(n/10), u=n%10;
    if(d===7||d===9){
      const base=DIZAINES[d], r=10+u;
      return base+(d===7&&u===1?' et ':'-')+UNITES[r];
    }
    if(d===8) return u===0?(fin?'quatre-vingts':'quatre-vingt'):'quatre-vingt-'+UNITES[u];
    if(u===0) return DIZAINES[d];
    if(u===1) return DIZAINES[d]+' et un';
    return DIZAINES[d]+'-'+UNITES[u];
  }
  function moinsDeMille(n,fin){
    const c=Math.floor(n/100), r=n%100;
    let s='';
    if(c>0){
      s=c===1?'cent':UNITES[c]+' cent';
      if(r===0) return c>1&&fin?s+'s':s;
      s+=' ';
    }
    return s+moinsDeCent(r,fin);
  }
  const ECHELLES=[[1e12,'billion'],[1e9,'milliard'],[1e6,'million']];
  function entier(n){   // entier ≥ 0, jusqu'à 999 999 999 999 999
    n=Math.floor(Math.abs(n));
    if(n===0) return 'zéro';
    if(n>=1e15) return String(n).split('').map(c=>UNITES[+c]).join(' ');
    const parts=[];
    let reste=n;
    for(const [v,nom] of ECHELLES){
      const q=Math.floor(reste/v);
      if(q>0){ parts.push(moinsDeMille(q,false)+' '+nom+(q>1?'s':'')); reste-=q*v; }
    }
    const mil=Math.floor(reste/1000);
    if(mil>0){ parts.push((mil===1?'':moinsDeMille(mil,false)+' ')+'mille'); reste-=mil*1000; }
    if(reste>0) parts.push(moinsDeMille(reste,true));
    return parts.join(' ').replace(/\s+/g,' ').trim();
  }
  function decimales(chiffres){   // « 25 » → « vingt-cinq » ; « 05 » → « zéro cinq » ; plus de 4 chiffres : chiffre par chiffre
    if(chiffres.length>4) return chiffres.split('').map(c=>UNITES[+c]).join(' ');
    const m=/^(0*)(\d*)$/.exec(chiffres);
    const zeros=m[1].split('').map(()=> 'zéro').join(' ');
    const reste=m[2]?entier(+m[2]):'';
    return [zeros,reste].filter(Boolean).join(' ');
  }
  function nombreEnLettres(txt){   // txt : « 4070,25 » ou « 4070.25 » ou « -3 »
    let s=String(txt).replace(/[\s  ]/g,'');
    let neg=false;
    if(/^[-−–]/.test(s)){ neg=true; s=s.slice(1); }
    else if(s[0]==='+'){ s=s.slice(1); }
    const [e,d]=s.replace('.',',').split(',');
    let out=entier(+e);
    if(d!=null&&d!==''&&!/^0{1,4}$/.test(d)) out+=' virgule '+decimales(d);   // « 4 050,00 » se dit « quatre mille cinquante »
    return (neg?'moins ':'')+out;
  }
  const ORD_IRREG={un:'unième',deux:'deuxième',trois:'troisième',cinq:'cinquième',neuf:'neuvième'};
  function ordinal(n,feminin){
    if(n===1) return feminin?'première':'premier';
    const c=entier(n);
    const mots=c.split(' ');
    let dernier=mots.pop();
    if(dernier!=='trois') dernier=dernier.replace(/s$/,'');
    if(ORD_IRREG[dernier]) dernier=ORD_IRREG[dernier];
    else if(/e$/.test(dernier)) dernier=dernier.slice(0,-1)+'ième';
    else dernier+='ième';
    return mots.concat(dernier).join(' ');
  }
  const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  function jourEnLettres(j){ return j===1?'premier':entier(j); }

  /* ───────── dictionnaires ───────── */
  const DEVISES={'$':'dollars','€':'euros','£':'livres','¥':'yens','USD':'dollars','EUR':'euros','GBP':'livres','JPY':'yens','CHF':'francs suisses','CAD':'dollars canadiens'};
  const TEMPS={M1:'une minute',M2:'deux minutes',M3:'trois minutes',M5:'cinq minutes',M10:'dix minutes',M15:'quinze minutes',M30:'trente minutes',H1:'une heure',H2:'deux heures',H4:'quatre heures',H6:'six heures',H8:'huit heures',H12:'douze heures',D1:'journalier',W1:'hebdomadaire',MN:'mensuel'};
  // Sigles prononcés tels quels (mot entier, majuscules)
  const MOTS={
    COT:'C.O.T.', RSI:'R.S.I.', ATR:'A.T.R.', ADX:'A.D.X.', MACD:'M.A.C.D.', VWAP:'V.W.A.P.', POC:'P.O.C.', VAH:'V.A.H.', VAL:'V.A.L.', OHLC:'O.H.L.C.', FVG:'F.V.G.', ICT:'I.C.T.',
    SL:'stop loss', TP:'take profit', BE:'break even', OI:'intérêt ouvert', RR:'ratio gain risque',
    FOMC:'F.O.M.C.', CPI:'C.P.I.', PPI:'P.P.I.', NFP:'N.F.P.', PIB:'P.I.B.', BCE:'B.C.E.', ECB:'B.C.E.', PCE:'P.C.E.', ISM:'I.S.M.', PMI:'P.M.I.', VIX:'V.I.X.', OPEP:'Opep', OPEC:'Opec', FED:'Fed',
    DXY:'indice dollar', US10Y:'dix ans américain', NDX:'Nasdaq cent', US100:'U.S. cent', US500:'U.S. cinq cents', US30:'U.S. trente', SPX:'S.P.X.', NAS100:'Nasdaq cent', GER40:'D.A.X.', DAX:'Dax',
    XAUUSD:'or dollar', XAGUSD:'argent dollar', EURUSD:'euro dollar', GBPUSD:'livre dollar', USDJPY:'dollar yen', BTCUSD:'bitcoin dollar', ETHUSD:'éther dollar',
    XAU:'or', XAG:'argent', BTC:'bitcoin', ETH:'éther', SOL:'Solana', DOGE:'Dogecoin', HYPE:'Hype', USDT:'tether', USD:'dollars', EUR:'euros', GBP:'livres', JPY:'yens', CHF:'francs suisses',
    CFD:'C.F.D.', API:'A.P.I.', IA:'I.A.', PC:'P.C.', OK:'okay', TV:'télé', UTC:'U.T.C.', GMT:'G.M.T.', HTTP:'H.T.T.P.', URL:'U.R.L.', GPU:'G.P.U.', CPU:'C.P.U.', WASM:'wasm', TTS:'T.T.S.',
    SMA:'moyenne mobile simple', EMA:'moyenne mobile exponentielle', MA:'moyenne mobile', BOS:'cassure de structure', CHOCH:'changement de caractère', OB:'bloc d’ordres', FOMO:'fomo',
    VS:'contre', ETF:'E.T.F.', IPO:'I.P.O.', PER:'P.E.R.', EPS:'E.P.S.', ROI:'R.O.I.', PNL:'P.N.L.', PL:'P.L.', HH:'H.H.', HL:'H.L.', LH:'L.H.', LL:'L.L.'
  };
  const SEPARATEURS_LETTRES=/[^A-Za-zÀ-ÿ0-9]/;
  let personnalise={};   // dictionnaire de pronnonciation de l'utilisateur : « mot » → « comment le dire »

  function definirDictionnaire(obj){
    personnalise={};
    if(obj&&typeof obj==='object') for(const k of Object.keys(obj)){ const v=obj[k]; if(k&&typeof v==='string') personnalise[k]=v; }
    return personnalise;
  }
  function lireDictionnaire(){ return Object.assign({},personnalise); }
  function echapper(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  /* ───────── étapes ───────── */
  function appliquerPersonnalise(t){
    const cles=Object.keys(personnalise).sort((a,b)=>b.length-a.length);
    for(const k of cles){
      const re=new RegExp('(^|[^A-Za-zÀ-ÿ0-9])'+echapper(k)+'(?![A-Za-zÀ-ÿ0-9])','gi');
      t=t.replace(re,(m,av)=>av+personnalise[k]);
    }
    return t;
  }

  function retirerMiseEnForme(t){
    return t
      .replace(/[→➜➔⇒]/g,', puis ')
      .replace(/```[\s\S]*?```/g,' ')
      .replace(/```[\s\S]*$/,' ')
      .replace(/`([^`]*)`/g,'$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/https?:\/\/\S+/g,' ')
      .replace(/\bwww\.\S+/g,' ')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,' ')
      .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm,'$1.')
      .replace(/^\s*[-*•·]\s+/gm,'')
      .replace(/^\s*\d+[.)]\s+/gm,'')
      .replace(/\*\*|__|~~/g,'')
      .replace(/[*_]/g,' ')
      .replace(/\[\d{1,2}\]/g,' ');   // marqueurs de lecture segmentée [1], [2]
  }

  function dates(t){
    const jm=(j,m,a)=>{
      j=+j; m=+m; a=+a;
      if(m<1||m>12||j<1||j>31) return null;
      return jourEnLettres(j)+' '+MOIS[m-1]+(a?' '+entier(a<100?2000+a:a):'');
    };
    t=t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(m,a,mo,j)=>jm(j,mo,a)||m);
    t=t.replace(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4}|\d{2})\b/g,(m,j,mo,a)=>jm(j,mo,a)||m);
    return t;
  }

  function heures(t){
    const dire=(h,mi)=>{
      h=+h; mi=mi==null||mi===''?null:+mi;
      if(h>24||(mi!=null&&mi>59)) return null;
      if(mi===0&&h===0) return 'minuit';
      if(mi===0&&h===12) return 'midi';
      const hh=entier(h)+' heure'+(h>1?'s':'');
      return mi==null||mi===0?hh:hh+' '+(mi<10?'zéro ':'')+entier(mi);
    };
    t=t.replace(/\b(\d{1,2})\s?[hH]\s?(\d{2})\b/g,(m,h,mi)=>dire(h,mi)||m);
    t=t.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g,(m,h,mi)=>dire(h,mi)||m);
    t=t.replace(/\b(\d{1,2})\s?[hH]\b(?!\w)/g,(m,h)=>dire(h,null)||m);
    return t;
  }

  function ordinaux(t){
    return t.replace(/\b(\d+)\s?(er|ère|re|e|ème|eme|è|nd|nde)\b/g,(m,n,suf)=>{
      const num=+n;
      if(num===1) return /^(ère|re|nde)$/.test(suf)?'première':'premier';
      if(num===2&&/^(nd|nde)$/.test(suf)) return suf==='nde'?'seconde':'second';
      return ordinal(num,false);
    });
  }

  const ECH_ABREV={k:'mille',K:'mille',M:'million',B:'milliard',G:'milliard'};
  function nombres(t){
    t=t.replace(/(\d)\s?[-–]\s?(\d)/g,'$1 à $2').replace(/(\d)\s?\/\s?(\d)/g,'$1 sur $2');
    // devise avant ou après le nombre ; le nombre ne doit pas être collé à une lettre (MA200, P2…)
    const NB='\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+(?:[,.]\\d+)?|\\d+(?:[,.]\\d+)?';
    const re=new RegExp('(^|[^A-Za-zÀ-ÿ_\\d.,])([-−–+])?(\\s?)([$€£¥])?(\\s?)((?:'+NB+'))(?:\\s?(k|K|M|B|G)(?![A-Za-zÀ-ÿ0-9]))?(?:\\s?(%|pour cent|[$€£¥]|USD|EUR|GBP|JPY|CHF|CAD)(?![A-Za-zÀ-ÿ]))?(?![\\d])','g');
    return t.replace(re,(m,av,signe,esp1,devAvant,esp2,nb,abrev,apres)=>{
      let brut=nb;
      if(/^\d{1,3}(\.\d{3})+,\d+$/.test(brut)||/^\d{1,3}(\.\d{3}){2,}$/.test(brut)) brut=brut.replace(/\./g,'');
      else if(/^\d{1,3}\.\d{3}$/.test(brut)) brut=brut.replace('.','');
      let s=nombreEnLettres(brut);
      if(abrev){
        const mot=ECH_ABREV[abrev];
        s+=' '+mot+(mot!=='mille'&&!/^un$/.test(s)?'s':'');
      }
      let fin='';
      const dev=devAvant||apres;
      if(apres==='%'||apres==='pour cent') fin=' pour cent';
      else if(dev){
        let nom=DEVISES[dev]||'';
        if(/^un$/.test(s)) nom=nom.replace('francs suisses','franc suisse').replace(/s$/,'');
        fin=' '+nom;
      }
      // « 15-20 » : le tiret entre deux nombres n'est pas un signe moins
      const colle=signe&&/[-−–]/.test(signe)&&esp1===''&&/\d/.test(av);
      const sgn=signe&&!colle?(signe==='+'?'plus ':'moins '):'';
      return av+(colle?' à ':'')+(esp1&&!sgn?esp1:(av&&!esp1&&!sgn&&false?' ':''))+sgn+s+fin;
    });
  }

  function marche(t){
    // moyennes mobiles : MA200, SMA 50, EMA20
    t=t.replace(/\b(S|E)?MA\s?(\d{1,4})\b/g,(m,k,n)=>'moyenne mobile '+(k==='S'?'simple ':k==='E'?'exponentielle ':'')+nombreEnLettres(n));
    // périodes : RSI14, ATR 14
    t=t.replace(/\b(RSI|ATR|ADX)\s?(\d{1,3})\b(?![,.]\d)/g,(m,k,n)=>MOTS[k]+' '+nombreEnLettres(n));
    // unités de temps : M15, H1, H4, D1, W1
    t=t.replace(/\b(M1|M2|M3|M5|M10|M15|M30|H1|H2|H4|H6|H8|H12|D1|W1|MN)\b/g,(m,k)=>TEMPS[k]);
    // multiples de risque : « 2 R », « +1,5R »
    t=t.replace(/(\d)\s?R\b(?![A-Za-zÀ-ÿ0-9])/g,'$1 erre');
    t=t.replace(/\bUS\s?(100|500|30|2000)\b/g,(m,n)=>'U.S. '+nombreEnLettres(n));
    t=t.replace(/\b([A-Z]{3})\/([A-Z]{3})\b/g,(m,a,b)=>(MOTS[a]||a)+' '+(MOTS[b]||b).replace(/s$/,''));
    t=t.replace(/\bS&P\s?(\d{3,4})\b/g,(m,n)=>'S and P '+nombreEnLettres(n));
    t=t.replace(/\bS&P\b/g,'S and P');
    return t;
  }

  function sigles(t){
    return t.replace(/\b([A-Z][A-Z0-9]{1,5})\b/g,(m)=>{
      if(MOTS[m]) return MOTS[m];
      if(/^[A-Z]{2,5}$/.test(m)&&!/[AEIOUY]/.test(m)) return m.split('').join('.')+'.';   // sans voyelle : épelé (« TPSL » → T.P.S.L.)
      return m;
    });
  }

  function symboles(t){
    return t
      .replace(/(\d)\s?°\s?C\b/g,'$1 degrés').replace(/°\s?C\b/g,' degrés').replace(/°/g,' degrés')
      .replace(/\bkm\/h\b/gi,' kilomètres par heure')
      .replace(/(\d)\s?mm\b/g,'$1 millimètres')
      .replace(/(\d)\s?km\b/g,'$1 kilomètres')
      .replace(/%/g,' pour cent')
      .replace(/≥/g,' supérieur ou égal à ').replace(/≤/g,' inférieur ou égal à ')
      .replace(/≈|~(?=\s?\d)/g,' environ ').replace(/×/g,' fois ').replace(/÷/g,' divisé par ').replace(/±/g,' plus ou moins ')
      .replace(/→|➜|➔/g,', puis ')
      .replace(/(^|[\s(])\+\s?(?=\d)/g,'$1plus ')
      .replace(/&/g,' et ')
      .replace(/\s=\s/g,' égale ')
      .replace(/(\d)\s?\/\s?(\d)/g,'$1 sur $2')
      .replace(/[«»"“”„]/g,'')
      .replace(/[()]/g,', ')
      .replace(/\s[-–—]+\s/g,', ')
      .replace(/[—–]/g,', ')
      .replace(/[\\^=+<>{}\[\]|#~@]/g,' ')
      .replace(/\//g,' ')
      .replace(/…/g,'...');
  }

  function ponctuation(t,optionsMax){
    const max=optionsMax||180;
    t=t.replace(/\r/g,'').replace(/\n{2,}/g,'. ').replace(/\n/g,', ')
       .replace(/\s+([,.;:!?])/g,'$1')
       .replace(/([.!?])\s*,/g,'$1')
       .replace(/,\s*,+/g,',').replace(/\.{4,}/g,'...').replace(/([.!?])\1+(?!\.)/g,'$1')
       .replace(/,\s*\./g,'.').replace(/:\s*\./g,'.')
       .replace(/\s+/g,' ').trim();
    // coupe les phrases trop longues à une virgule ou à « et » pour garder une prosodie vivante
    const phrases=t.split(/(?<=[.!?])\s+/);
    const sortie=[];
    for(let p of phrases){
      while(p.length>max){
        let i=p.lastIndexOf(', ',max);
        if(i<40) i=p.indexOf(', ',max);
        if(i>0&&i<p.length-20){ sortie.push(p.slice(0,i)+'.'); p=p.slice(i+2); continue; }
        let j=p.lastIndexOf(' et ',max);
        if(j>40){ sortie.push(p.slice(0,j)+'.'); p=p.slice(j+1); continue; }
        break;
      }
      if(p) sortie.push(p);
    }
    t=sortie.join(' ');
    if(t&&!/[.!?…]$/.test(t)) t+='.';
    return t;
  }

  /** Texte complet → texte prêt à être lu. */
  function normaliser(texte,options){
    let t=String(texte==null?'':texte).replace(/[   ]/g,m=>m===' '||m===' '?' ':' ');
    t=retirerMiseEnForme(t);
    t=appliquerPersonnalise(t);
    t=dates(t);
    t=heures(t);
    t=ordinaux(t);
    t=marche(t);
    t=nombres(t);
    t=sigles(t);
    t=symboles(t);
    t=t.replace(/ /g,' ');
    return ponctuation(t,options&&options.maxPhrase);
  }

  /** Découpe un texte normalisé en phrases (pour la synthèse en flux). Les phrases très courtes sont regroupées. */
  function phrases(texte,min){
    const mini=min==null?28:min;
    const brut=String(texte||'').split(/(?<=[.!?…])\s+/).map(s=>s.trim()).filter(Boolean);
    const out=[];
    for(const p of brut){
      if(out.length&&out[out.length-1].length<mini) out[out.length-1]+=' '+p; else out.push(p);
    }
    return out;
  }

  const api={normaliser,phrases,nombreEnLettres,entier,ordinal,definirDictionnaire,lireDictionnaire,MOTS,TEMPS,DEVISES};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.NormFr=api;
})(typeof window!=='undefined'?window:globalThis);
