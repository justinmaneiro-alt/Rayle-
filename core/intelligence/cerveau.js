"use strict";
  /* ═════════════ CERVEAU DE RAYLÉ (v8) : Gemini + outils qui lisent les vraies données de l'application ═════════════
     Chemin : la page envoie la question et la liste des OUTILS au Worker séparé « rayle-voix » (route /cerveau, clé Gemini secrète, même code d'accès que le Worker principal) ;
     le modèle décide d'appeler des outils ; la page les exécute (trader-pro/cerveau/outils.js : lecture des données de l'application, aucune invention) et renvoie les résultats ; boucle jusqu'à la réponse.
     Mémoire : les derniers échanges et le sujet en cours (« et en H4 ? », « et le Bitcoin ? »). Réponse = résumé parlé (2 à 5 phrases) + détail affiché à l'écran.
     Repli : si Gemini est en quota ou injoignable, `lectureLocale` lit les chiffres de l'actif cité sans IA ; jamais « je n'ai aucune donnée » quand elles existent. */
  const Cerveau=(function(){
    const CLE_HIST='rayle_cerveau_hist_v1', SEP='---DETAIL---', MAX_TOURS=5, DUREE_MEMOIRE=2*3600e3;
    const base=()=>{ let u=''; try{ u=localStorage.getItem('rayle_voix_url')||''; }catch(e){} return (u||'https://rayle-voix.justinmaneiro.workers.dev').replace(/\/+$/,''); };
    let mod=null, modActions=null, memoire=null, dernierEtat={modele:'',outils:[],erreur:''};
    const chargerOutils=async()=>mod||(mod=await import(new URL('trader-pro/cerveau/outils.js',document.baseURI).href));
    const chargerActions=async()=>{ try{ return modActions||(modActions=await import(new URL('trader-pro/cerveau/actions.js',document.baseURI).href)); }catch(e){ return null; } };
    function lireMemoire(){ if(memoire) return memoire; try{ const h=JSON.parse(localStorage.getItem(CLE_HIST)||'null'); if(h&&Date.now()-h.t<DUREE_MEMOIRE&&Array.isArray(h.m)) return memoire={t:h.t,m:h.m.slice(-12),sujet:h.sujet||null}; }catch(e){} return memoire={t:Date.now(),m:[],sujet:null}; }
    function sauverMemoire(){ try{ const h=lireMemoire(); h.t=Date.now(); while(h.m.length>12) h.m.shift(); localStorage.setItem(CLE_HIST,JSON.stringify(h)); }catch(e){} }
    function oublier(){ memoire={t:Date.now(),m:[],sujet:null}; try{ localStorage.removeItem(CLE_HIST); }catch(e){} }
    const jetonOk=()=>{ try{ return !!(typeof W!=='undefined'&&W.token&&W.token()); }catch(e){ return false; } };
    const dispo=()=>jetonOk();

    function systeme(sujet){
      const maintenant=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'}).format(new Date());
      return [
        "Tu es Rayle, l'assistante de trading experte de Justin : francophone, claire, directe, chaleureuse (tutoiement).",
        "Sa méthode : H4 et Daily, MA200, niveaux qu'il trace, volume (POC, VAH, VAL), repères ICT, l'or en priorité, courtier XTB.",
        "RÈGLE ABSOLUE : tu n'inventes jamais un chiffre, un prix, un niveau, une date. Pour toute question sur un marché, une position, un risque, une actualité, un indicateur ou l'état des données, tu APPELLES les outils, puis tu réponds avec les chiffres reçus (en citant la date de la donnée quand elle est ancienne). Si un outil répond « indisponible », dis précisément laquelle donnée manque et pourquoi, sans dire que tu n'as « aucune donnée » ni « pas d'accès » : tu as accès à toute l'application par tes outils.",
        "Pour un « point sur… » : appelle prix_et_tendance (et niveaux si utile), donne la lecture (tendance, MA200, régime), puis un ou deux scénarios probables avec leur niveau d'invalidation. Tu ne passes jamais d'ordres : c'est Justin qui décide ; rappelle-le brièvement quand tu proposes un scénario. Pas de probabilité chiffrée inventée.",
        "Quand la demande concerne une fenêtre (terminal, Marchés, COT, Mes actifs, Couverture, Risque, calendrier, briefing), appelle aussi l'outil d'ouverture correspondant : l'application l'ouvrira pendant que tu parles.",
        "Tu réponds aussi à n'importe quelle question générale (histoire, sciences, culture…) directement, sans outil.",
        "FORMAT : d'abord le texte PARLÉ : 2 à 5 phrases naturelles, sans liste, sans markdown, sans émoji, chiffres écrits en chiffres. Puis, seulement si utile, une ligne contenant exactement " + SEP + " suivie du détail complet à lire à l'écran (listes courtes autorisées).",
        'Date et heure à Paris : '+maintenant+'.',
        sujet&&sujet.actif?"Sujet en cours (pour « et en H4 ? », « et le Bitcoin ? ») : "+sujet.actif+(sujet.unite?' en '+sujet.unite:'')+'.':''
      ].filter(Boolean).join('\n');
    }

    async function appeler(corps){
      const ctrl=new AbortController(), tm=setTimeout(()=>ctrl.abort(),45000); let res;
      try{ res=await fetch(base()+'/cerveau',{method:'POST',headers:{'Content-Type':'application/json','X-Rayle-Token':(W.token()||''),'X-Rayle-Worker':(W.url?W.url():'')||''},body:JSON.stringify(corps),signal:ctrl.signal}); }
      catch(e){ clearTimeout(tm); throw Object.assign(new Error(e&&e.name==='AbortError'?'délai dépassé (45 s)':'rayle-voix injoignable ('+((e&&e.message)||e)+')'),{reseau:true}); }
      clearTimeout(tm);
      if(!res.ok){ let j={}; try{ j=await res.json(); }catch(e){} throw Object.assign(new Error('HTTP '+res.status+' · '+(j.error||'erreur')),{statut:res.status,quota:!!j.quota||res.status===429}); }
      return res.json();
    }

    /* découpe « parlé / détail » */
    function separer(texte){
      const t=String(texte||'').trim(), i=t.indexOf(SEP);
      const parle=(i>=0?t.slice(0,i):t).trim().replace(/[*_`#>]+/g,''), detail=i>=0?t.slice(i+SEP.length).trim():'';
      return {parle,detail};
    }

    /* question → { reply, parle, detail, outils:[{nom,args,resultat}], sujet, engine } ; lève une erreur lisible (quota, réseau, jeton) */
    async function repondre(texte,opts){
      opts=opts||{}; const O=await chargerOutils(), A=await chargerActions(), M=lireMemoire();
      const decl=O.DECLARATIONS.concat(A?A.DECLARATIONS:[]);
      const contents=M.m.map(x=>({role:x.role,parts:[{text:x.texte}]})); contents.push({role:'user',parts:[{text:String(texte)}]});
      const tour=[]; let sujet=M.sujet, modele='', final='';
      for(let n=0;n<MAX_TOURS;n++){
        const r=await appeler({system:systeme(sujet),contents,outils:decl,temperature:0.5,maxTokens:900}); modele=r.model||modele;
        const parts=r.parts||[]; contents.push({role:'model',parts});
        const appels=parts.filter(p=>p.functionCall);
        if(!appels.length){ final=parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join('').trim(); break; }
        const reponses=[];
        for(const p of appels){
          const nom=p.functionCall.name, args=p.functionCall.args||{}; let resultat;
          if(A&&A.EST_ACTION(nom)){ resultat=await A.executerAction(nom,args,{signal:opts.signal}); }
          else resultat=await O.executer(nom,args);
          tour.push({nom,args,resultat});
          if(args.actif) sujet={actif:String(args.actif),unite:args.unite||(sujet&&sujet.actif===args.actif?sujet.unite:null)};
          reponses.push({functionResponse:{name:nom,response:{resultat}}});
        }
        contents.push({role:'user',parts:reponses});
        if(n===MAX_TOURS-1) final='';
      }
      if(!final) throw new Error('le modèle n’a pas produit de réponse après '+MAX_TOURS+' tours d’outils');
      const s=separer(final);
      M.m.push({role:'user',texte:String(texte).slice(0,600)},{role:'model',texte:(s.parle+(s.detail?'\n'+SEP+'\n'+s.detail:'')).slice(0,1500)}); M.sujet=sujet; sauverMemoire();
      dernierEtat={modele,outils:tour.map(x=>x.nom),erreur:''};
      return {reply:s.parle+(s.detail?'\n\n'+s.detail:''),parle:s.parle,detail:s.detail,outils:tour,sujet,engine:'Gemini · '+modele};
    }
    /* Questions de trading ou sur l'application : le cerveau les prend en main AVANT les commandes « maison » (qui ne comprennent pas « fais-moi un point sur l'or »). Les commandes courtes (ouvre, ferme, retour, suivant…) restent aux commandes déterministes. */
    const VOCAB=/\b(or|gold|xau|nasdaq|us ?100|ndx|s ?p ?500|us ?500|bitcoin|btc|solana|sol|dxy|dollar|petrole|wti|brent|eur ?usd|cot|commitments|couvr\w*|risques?|portefeuille|positions?|trades?|mes actifs|cher|chere|bon marche|attractif\w*|point sur|ou en est|tendance|haussier|baissier|ma ?200|moyenne mobile|niveaux?|support|resistance|poc|vah|val|weekly|hebdo\w*|volume|carnet|annonces?|calendrier|inflation|fed|taux|briefing|marches?|actualites? (de l|du|sur)|score|signaux?|fleches?|scenarios?|invalidation|action|actions|etf|valorisation|donnees? (a jour|fraiches)|investissement|xtb)\b/;
    const COURT=/^(ouvre|ouvrir|ferme|fermer|retour|reviens|stop|arrete|tais toi|suivant|suivante|precedent|precedente|passe|mets|met|lance|active|desactive|deverrouille|verrouille|vitesse|veille|coupe|baisse|monte|trace|efface|ancre|va )/;
    function prendLaMain(t){ const n=String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’'`]/g,' ').replace(/^(hey |dis moi |dis )?(rayle|raylé) ?,? ?/,'').replace(/\s+/g,' ').trim(); if(!n) return false; if(COURT.test(n)&&n.split(' ').length<=6) return false; return VOCAB.test(n); }
    /* repli : lecture directe des chiffres de l'actif cité (aucune IA) */
    async function repli(texte){ try{ const O=await chargerOutils(); return await O.lectureLocale(texte); }catch(e){ return null; } }
    /* message clair selon l'erreur */
    function message(e){
      const m=String((e&&e.message)||e);
      if(e&&e.quota) return 'Mon cerveau Gemini a atteint sa limite gratuite pour le moment ('+m.replace(/^HTTP 429 · /,'').slice(0,160)+').';
      if(e&&e.statut===401) return 'Mon cerveau est protégé : le code d’accès enregistré dans Rayle n’a pas été accepté ('+m+').';
      return 'Mon cerveau Gemini est momentanément injoignable ('+m.slice(0,160)+').';
    }
    return {dispo,prendLaMain,repondre,repli,message,oublier,memoire:lireMemoire,systeme,separer,etat:()=>dernierEtat,SEP};
  })();
  window.Cerveau=Cerveau;
