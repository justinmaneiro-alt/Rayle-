"use strict";
/* ═════════════ PROSODIE DE RAYLÉ : découper en phrases, poser des pauses, régler débit et hauteur ═════════════
   Entrée : le texte DÉJÀ normalisé par NormFr (nombres, sigles et dates en toutes lettres). Sortie : une liste de segments
   { texte, pause, vitesse, hauteur } : `pause` (ms) à laisser APRÈS le segment, `vitesse` (facteur, 1 = normal) et `hauteur` (% : +4 = un peu plus aigu).
   Règles (voix parlée, pas lue) :
   · une phrase par segment ; une phrase longue est coupée aux virgules, points-virgules, deux-points et tirets (jamais au milieu d'un groupe de moins de 4 mots)
   · pauses : point 520 ms, point d'interrogation 560, exclamation 480, points de suspension 650, saut de ligne 760, point-virgule 300, deux-points 270, virgule 170
   · une question monte un peu (+4 %), une phrase qui finit par « … » ralentit et s'abaisse, les énumérations (segments coupés à la virgule) vont un peu plus vite
   · rien d'écrit qui ne se prononce pas : adresses web, courriels, symboles (# * _ | ~ ^ < > { } [ ] \ /) sont retirés ou dits, jamais épelés
   Pur, sans DOM : utilisable dans la page (window.Prosodie) et sous Node (module.exports). */
(function(racine){
  const PAUSES={'.':520,'!':480,'?':560,'…':650,'\n':760,';':300,':':270,',':170,'-':220};
  const MAX_SEGMENT=110;   // au-delà, on cherche un point de coupe doux
  const MOTS_MIN=4;

  /* Retire ce qui ne se prononce pas. Garde les lettres, chiffres, apostrophes, traits d'union et la ponctuation utile. */
  function nettoyer(t){
    let s=String(t==null?'':t);
    s=s.replace(/\bhttps?:\/\/[^\s)]+/gi,' ').replace(/\bwww\.[^\s)]+/gi,' ');                              // adresses web
    s=s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,' ');                                                       // courriels
    s=s.replace(/\b([a-z0-9-]{3,})\.(?:fr|com|org|net|io|eu|info|gouv\.fr)\b/gi,'$1');                      // « exemple.fr » → « exemple »
    s=s.replace(/[#*_|~^<>{}\[\]\\\/`]+/g,' ');                                                             // symboles de mise en forme
    s=s.replace(/\s*[·•▪◦►▶→←↔]\s*/g,', ').replace(/\s+[—–]\s+/g,', ');                                    // séparateurs → petite pause
    s=s.replace(/[(){}]/g,', ').replace(/\s+,/g,',').replace(/,\s*,+/g,',');
    s=s.replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{2,}/g,'\n');
    return s.trim();
  }

  const mots=t=>(t.match(/[\p{L}\p{N}’']+/gu)||[]).length;
  const fin=t=>{ const m=t.match(/(…|\.\.\.|[.!?;:,])\s*$/); return m?(m[1]==='...'?'…':m[1]):''; };

  /* Découpe une phrase trop longue aux virgules (ou « et », « mais », « car », « donc ») en groupes d'au moins MOTS_MIN mots. */
  function coupes(phrase){
    if(phrase.length<=MAX_SEGMENT) return [phrase];
    const morceaux=phrase.split(/(?<=[,;:])\s+|\s+(?=(?:mais|car|donc|puis|alors que|tandis que|pendant que|parce que)\b)/i).map(s=>s.trim()).filter(Boolean);
    const sortie=[];
    for(const m of morceaux){
      if(sortie.length&&(mots(sortie[sortie.length-1])<MOTS_MIN||mots(m)<MOTS_MIN||(sortie[sortie.length-1].length+m.length)<60)) sortie[sortie.length-1]+=' '+m; else sortie.push(m);
    }
    return sortie.length?sortie:[phrase];
  }

  function decouper(texteNormalise){
    const propre=nettoyer(texteNormalise); if(!propre) return [];
    const segments=[];
    const paragraphes=propre.split('\n').map(s=>s.trim()).filter(Boolean);
    paragraphes.forEach((para,ip)=>{
      const phrases=para.split(/(?<=[.!?…])\s+/).map(s=>s.trim()).filter(Boolean);
      phrases.forEach((ph,k)=>{
        const dernierDeParagraphe=k===phrases.length-1;
        const parts=coupes(ph);
        parts.forEach((p,j)=>{
          const dernierePart=j===parts.length-1, f=fin(p);
          const coupeDouce=!dernierePart;                  // coupe au milieu d'une phrase
          let pause=PAUSES[f]||(coupeDouce?PAUSES[',']:PAUSES['.']);
          if(coupeDouce&&f===';') pause=PAUSES[';']; else if(coupeDouce&&f===':') pause=PAUSES[':'];
          if(dernierePart&&dernierDeParagraphe&&ip<paragraphes.length-1) pause=PAUSES['\n'];
          let vitesse=1, hauteur=0;
          if(f==='?'){ hauteur=4; vitesse=0.99; }
          else if(f==='!'){ hauteur=3; vitesse=1.02; }
          else if(f==='…'){ hauteur=-2; vitesse=0.94; }
          else if(coupeDouce){ vitesse=1.03; hauteur=1; }  // énumération : élan, la voix ne retombe pas
          else if(mots(p)<=4){ vitesse=0.97; }             // phrase très courte : posée
          else if(mots(p)>=24){ vitesse=1.02; }            // phrase longue : un peu plus soutenue
          segments.push({texte:p.replace(/[;:,]+\s*$/,(m)=>m[0]===';'?'.':m[0]===':'?'.':',') ,pause,vitesse,hauteur});
        });
      });
    });
    if(segments.length) segments[segments.length-1].pause=0;
    return segments;
  }

  /* Point d'entrée : texte BRUT (avec ses sauts de ligne et ses « … ») + la fonction de normalisation (NormFr.normaliser). Les sauts de ligne et les points de suspension
     sont protégés pendant la normalisation (elle les aplatit), puis rétablis : ce sont eux qui donnent les pauses longues et le ralenti. */
  function depuisTexte(brut,normaliser){
    const protege=String(brut==null?'':brut).replace(/\s*(?:…|\.{3})\s*/g,' zzellipsezz ').replace(/\s*\n+\s*/g,' zzparagraphezz ');
    let n=normaliser?normaliser(protege):protege;
    n=n.replace(/[,;:.]?\s*zzellipsezz[,;:.]?\s*/gi,'… ').replace(/[,;:.]?\s*zzparagraphezz[,;:.]?\s*/gi,'\n');
    return decouper(n);
  }

  /* Durée de lecture estimée d'un segment (ms), pour les gardes-fous. */
  const dureeEstimee=(texte,vitesse=1)=>Math.round(texte.length*62/(vitesse||1));

  const api={decouper,depuisTexte,nettoyer,coupes,PAUSES,dureeEstimee};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.Prosodie=api;
})(typeof window!=='undefined'?window:globalThis);
