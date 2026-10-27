"use strict";
/* ═════════════ BUS D'ORDRES ═════════════
   Raylé (voix, IA) commande les planètes par des ordres typés :
       { id, de, vers, action, params }   →   réponse { id, ok, texte | erreur }
   Chaque planète déclare ses ordres dans son manifeste (planetes/<id>/manifeste.json) ; le bus les vérifie AVANT de
   les transmettre : cible connue, action déclarée, paramètres conformes (valeurs permises, « texte », « nombre »).
   Une planète branche ensuite ses fonctions avec enregistrer(cible, action, fn). Un ordre déclaré mais sans fonction
   répond « prévu, pas encore disponible » : la planète n'est pas encore construite, ce n'est pas une panne.
   Tout est en mémoire (aucune donnée sur le disque). Le journal garde les 50 derniers ordres pour le diagnostic. */
(function(racine){
  const declares=new Map();      // 'cible/action' → {cible, action, description, params}
  const fonctions=new Map();     // 'cible/action' → fn(params, ordre) → {ok, texte} | texte | undefined
  const cibles=new Set();
  const journal=[];
  let compteur=0;
  const DELAI=8000;
  const bus=()=>racine.RayleBus||null;
  const cle=(c,a)=>c+'/'+a;

  /* Déclare les ordres de tous les corps (liste à plat issue du registre : {cible, action, description, params}). */
  function declarer(liste){
    for(const o of liste||[]){ cibles.add(o.cible); declares.set(cle(o.cible,o.action),{cible:o.cible,action:o.action,description:o.description||'',params:o.params||{}}); }
    bus()&&bus().emit('ordres:declares',{nombre:declares.size});
  }
  const delais=new Map();         // 'cible/action' → délai maximal en ms (8 s par défaut)
  function enregistrer(cible,action,fn,options){
    if(typeof fn!=='function') throw new Error('enregistrer : fonction attendue');
    if(declares.size && !declares.has(cle(cible,action))) throw new Error('ordre « '+cible+'/'+action+' » absent du manifeste : déclarez-le d\'abord');
    fonctions.set(cle(cible,action),fn);
    if(options&&options.delai) delais.set(cle(cible,action),options.delai);
    bus()&&bus().emit('ordres:disponibles',{cible,action});
    return ()=>fonctions.delete(cle(cible,action));
  }
  const disponible=(cible,action)=>fonctions.has(cle(cible,action));
  const liste=()=>[...declares.values()].map(o=>({...o,disponible:disponible(o.cible,o.action)}));

  /* Vérifie et convertit les paramètres selon le manifeste. Renvoie {params} ou {erreur}. */
  function verifierParams(attendus,recus){
    const sortie={};
    recus=recus&&typeof recus==='object'?recus:{};
    for(const [nom,regle] of Object.entries(attendus)){
      let v=recus[nom];
      if(v===undefined||v===null||v==='') return {erreur:'paramètre « '+nom+' » manquant'};
      if(Array.isArray(regle)){
        const trouve=regle.find(x=>String(x).toLowerCase()===String(v).toLowerCase());
        if(trouve===undefined) return {erreur:'« '+nom+' » doit être parmi : '+regle.join(', ')};
        v=trouve;
      }else if(regle==='nombre'){
        v=Number(v); if(!Number.isFinite(v)) return {erreur:'« '+nom+' » doit être un nombre'};
      }else{
        v=String(v).trim().slice(0,300); if(!v) return {erreur:'paramètre « '+nom+' » vide'};
      }
      sortie[nom]=v;
    }
    for(const nom of Object.keys(recus)) if(!(nom in attendus)) return {erreur:'paramètre « '+nom+' » inconnu pour cet ordre'};
    return {params:sortie};
  }

  const noter=(ordre,rep)=>{ journal.push({t:Date.now(),de:ordre.de,vers:ordre.vers,action:ordre.action,ok:rep.ok,info:rep.erreur||rep.texte||''}); if(journal.length>50) journal.shift(); };

  async function envoyer(brut){
    const ordre={id:'o-'+(++compteur),de:(brut&&brut.de)||'rayle',vers:brut&&brut.vers,action:brut&&brut.action,params:brut&&brut.params||{}};
    const fin=rep=>{ const r={id:ordre.id,ok:!!rep.ok,...(rep.ok?{texte:rep.texte||''}:{erreur:rep.erreur||'échec'})}; noter(ordre,r); bus()&&bus().emit('ordre:reponse',{ordre,reponse:r}); return r; };
    if(!ordre.vers||!ordre.action) return fin({erreur:'ordre incomplet (vers et action requis)'});
    if(!cibles.has(ordre.vers)) return fin({erreur:'destinataire inconnu : « '+ordre.vers+' »'});
    const decl=declares.get(cle(ordre.vers,ordre.action));
    if(!decl) return fin({erreur:'« '+ordre.action+' » n\'est pas un ordre de '+ordre.vers});
    const v=verifierParams(decl.params,ordre.params);
    if(v.erreur) return fin({erreur:v.erreur});
    ordre.params=v.params;
    const fn=fonctions.get(cle(ordre.vers,ordre.action));
    if(!fn) return fin({erreur:'prévu, pas encore disponible : '+decl.description});
    bus()&&bus().emit('ordre:envoye',{ordre});
    try{
      const rep=await Promise.race([Promise.resolve(fn(ordre.params,ordre)),new Promise((_,rej)=>setTimeout(()=>rej(new Error('délai dépassé')),delais.get(cle(ordre.vers,ordre.action))||DELAI))]);
      if(rep&&typeof rep==='object') return fin({ok:rep.ok!==false,texte:rep.texte,erreur:rep.erreur});
      return fin({ok:true,texte:typeof rep==='string'?rep:''});
    }catch(e){ return fin({erreur:(e&&e.message)||String(e)}); }
  }

  racine.RayleOrdres={declarer,enregistrer,envoyer,disponible,liste,journal:()=>journal.slice()};
})(typeof window!=='undefined'?window:globalThis);
