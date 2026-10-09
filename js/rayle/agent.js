"use strict";
  /* ═════════════ AGENT : Raylé choisit ses outils (Worker) et la page exécute les actions ═════════════
     Le Worker enchaîne les outils côté serveur (recherche, marché, alertes, mémoire…) et renvoie la réponse
     parlée + les actions à exécuter ici (terminal, panneaux, cartes). Les commandes rapides (terminal, sécurité,
     cartes, heure) passent avant, sans IA. Si l'agent est indisponible, l'ancien chemin prend le relais. */
  async function askAgent(text){
    const res=await wfetch('/chat',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:text, agent:true, context:contextText(), history:historiqueChat.slice(-8)})
    },70000);
    if(!res.ok) throw await workerError(res);
    const d=await res.json();
    if(!valid(d.reply)) throw new Error('réponse vide');
    return d;
  }

  // Exécute, dans l'ordre, les actions décidées par le Worker. Renvoie un complément à dire (distance d'un itinéraire).
  async function executerActions(actions,my){
    let plus='';
    for(const a of (actions||[])){
      if(my!==epoch) return plus;
      try{
        if(a.type==='terminal'){
          if(a.op==='fermer'){ if(RayleBus.demander('vue')==='terminal') RayleBus.demander('vue:fermer'); continue; }
          if(RayleBus.demander('vue')!=='terminal') await RayleBus.demander('vue:ouvrir');
          if(a.op==='commande' && a.commande){
            const c=a.commande;
            if(c.type==='unite' && c.valeur!=='15' && c.valeur!=='60') continue;   // H4 et journalier sont dans le dashboard
            RayleBus.demander('terminal:commande',c);
          }
        }else if(a.type==='carte'){
          await commandeCarte('montre-moi la carte de '+a.lieu);
        }else if(a.type==='itineraire'){
          const lib=a.profil==='pied'?'à pied':a.profil==='velo'?'à vélo':'en voiture';
          const r=await commandeCarte('itinéraire '+(a.de?'de '+a.de+' à ':'vers ')+a.vers+' '+lib);
          if(r) plus+=' '+r;
        }else if(a.type==='fermer_panneaux'){
          Panneaux.fermerTout();
        }
      }catch(e){ addLine('sys','Action « '+a.type+' » : '+errMsg(e)); }
    }
    return plus;
  }

  /* ═════════════ RÉSUMÉ DE CONVERSATION (mémoire du Worker) ═════════════
     Déclenché par « merci » (mise en veille), « coupure », 10 minutes d'inactivité, plus de 8 messages, ou la fermeture de la page.
     Le Worker écrit 5 lignes au plus, et seulement s'il y a quelque chose de durable. */
  let echangesDepuisResume=0, resumeEnCours=false;
  function noterEchange(){ echangesDepuisResume++; if(echangesDepuisResume*2>8) resumerSession('long'); }
  async function resumerSession(raison){
    if(resumeEnCours || !workerReady() || echangesDepuisResume<2) return;
    resumeEnCours=true;
    const avant=echangesDepuisResume;
    echangesDepuisResume=0;
    try{
      const res=await wfetch('/resume',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:raison==='fermeture',
        body:JSON.stringify({history:historiqueChat.slice(-16)})},25000);
      if(!res.ok) throw await workerError(res);
      const d=await res.json();
      if(d.enregistre) addLine('sys','Mémoire : résumé de la conversation gardé.');
    }catch(e){ echangesDepuisResume=Math.max(echangesDepuisResume,avant); }   // on réessaiera plus tard
    finally{ resumeEnCours=false; }
  }
  setInterval(()=>{ if(typeof lastAct!=='undefined' && Date.now()-lastAct>10*60000 && echangesDepuisResume>=2 && !processing && !speaking) resumerSession('inactif'); },60000);
  window.addEventListener('pagehide',()=>{ resumerSession('fermeture'); });
