"use strict";
  /* ═════════════ LES SOURCES EN DIRECT DANS LA PAGE (étape N) ═════════════
     Commandes vocales sans IA : « montre-moi les séismes », « les incendies en cours », « mets France 24 en direct », « un podcast de la BBC », « que dit l'OMS ? », « que dit l'AFP sur Bluesky ? »,
     « que s'est-il passé un 22 octobre ? », « ouvre les sources ». Les réponses sont construites à partir des données réelles (USGS, GDACS, NASA EONET, flux officiels, comptes vérifiés, Wikipédia) ou disent
     « indisponible » et pourquoi. Le hub s'ouvre dans une fenêtre holographique (core/direct/hub-sources.js) ; les événements s'affichent en balises sur la Terre 3D (planetes/terre/pc/balises-evenements.js).
     Télévisions : lancées seulement parce que tu le demandes à voix haute ou au clic ; aucun enregistrement. */
  const dpBase=()=>document.baseURI;
  const dpImport=chemin=>import(new URL(chemin,dpBase()).href);
  const dpNorm=t=>String(t==null?'':t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’‘`'-]/g,' ').replace(/[?!.,;:«»"()]/g,' ').replace(/\s+/g,' ').trim();
  const DP_GARDE=/\b(?:seismes?|tremblements?|secousses?|incendies?|feux de foret|tempetes?|cyclones?|ouragans?|typhons?|volcans?|eruptions?|inondations?|crues?|catastrophes?|evenements? naturels?|direct|live|tele|television|chaines?|podcasts?|communiques?|oms|onu|nations unies|commission europeenne|nasa|esa|bluesky|mastodon|reseaux? sociaux|que s est il passe|ce jour|sources?)\b/;
  const DP_VERBE=/\b(?:montre|montrer|affiche|afficher|ouvre|ouvrir|ou|quels?|quelles?|combien|y a t il|y a t on|donne|dis|dit|liste|situation|en cours|derniers?|dernieres?)\b/;

  async function dpOuvrirHub(onglet,extra){
    const H=await dpImport('core/direct/hub-sources.js');
    try{ if(document.body.dataset.hud!=='leger'||true) H.ouvrirHub({onglet}); }catch(e){ return null; }
    return H;
  }
  const dpAttendreHub=async ms=>{ const t0=Date.now(); while(Date.now()-t0<ms){ const H=await dpImport('core/direct/hub-sources.js'); if(H.instanceHub()) return H.instanceHub(); await new Promise(r=>setTimeout(r,120)); } return null; };

  const DirectPage={
    async commande(texte){
      const n=dpNorm(texte); if(!n||n.split(' ').length>14||!DP_GARDE.test(n)) return null;
      let EV,SC;
      try{ [EV,SC]=await Promise.all([dpImport('core/direct/evenements-calcul.js'),dpImport('core/direct/sources-calcul.js')]); }catch(e){ return null; }
      // 1. événements naturels : « montre-moi les séismes », « les incendies », « les catastrophes en cours »
      const type=EV.typeDeLaPhrase(texte);
      if(type && (DP_VERBE.test(n)||n.split(' ').length<=5) && !/\b(actualites?|infos?|nouvelles?|meteo|bourse|marches?)\b/.test(n)){
        try{
          const M=await dpImport('planetes/terre/pc/ordres-terre.js'), T=await M.assurerTerre();
          const r=await T.afficherEvenements(type==='tous'?{}:{types:[type]});
          return r.phrase+(r.ok?' Je les ai placés sur la Terre : clique sur une balise pour le détail.':'');
        }catch(e){
          // la Terre ne s'ouvre pas (galaxie indisponible) : on répond avec le hub
          try{ const D=(await dpImport('core/direct/donnees-direct.js')).obtenirDirect(), r=await D.evenements(); await dpOuvrirHub('evenements'); return r.etat==='ok'?EV.phraseEvenements(r.evenements,type==='tous'?null:type):'Les sources d’événements naturels sont indisponibles : '+r.raison+'.'; }catch(x){ return 'Je n’arrive pas à ouvrir la Terre : '+String(e&&e.message||e)+'.'; }
        }
      }
      const d=SC.analyserDemandeDirect(texte); if(!d) return null;
      const D=(await dpImport('core/direct/donnees-direct.js')).obtenirDirect();
      if(d.type==='hub'){ await dpOuvrirHub('evenements'); return 'Voici les sources en direct : événements naturels, communiqués officiels, télévisions, réseaux sociaux vérifiés, podcasts et le jour dans l’histoire.'; }
      if(d.type==='tv'){
        const tv=d.id&&SC.TELEVISIONS.find(t=>t.id===d.id);
        await dpOuvrirHub('tv'); const inst=await dpAttendreHub(4000);
        if(tv&&inst){ await new Promise(r=>setTimeout(r,500)); inst.lancerTv(tv.id); return 'Je lance '+tv.nom+' en direct. Le lecteur est celui de la chaîne officielle ; s’il n’émet pas à cet instant, il le dira.'; }
        return 'Voici les télévisions en direct disponibles : '+SC.TELEVISIONS.map(t=>t.nom).join(', ')+'. Dis par exemple « mets France 24 en direct ».';
      }
      if(d.type==='podcast'){
        const p=d.id?SC.PODCASTS.find(x=>x.id===d.id):SC.PODCASTS[0];
        await dpOuvrirHub('podcasts'); const inst=await dpAttendreHub(3000); if(inst&&inst.etat) { /* l'onglet est ouvert */ }
        const r=await D.podcasts(p.id);
        return r.etat==='ok'?'Podcast '+p.nom+' ('+p.radio+'). Dernier épisode : '+r.episodes[0].titre+(r.episodes[0].duree?', '+r.episodes[0].duree:'')+'. Appuie sur Écouter pour le lancer : rien ne démarre tout seul.':'Le podcast '+p.nom+' est indisponible : '+r.raison+'.';
      }
      if(d.type==='communiques'){
        await dpOuvrirHub('communiques');
        const r=await D.communiques(d.id||null);
        if(r.etat!=='ok') return 'Les communiqués officiels sont indisponibles : '+r.raison+'.';
        const l=r.items.slice(0,3), nom=d.id?SC.COMMUNIQUES.find(c=>c.id===d.id).nom.split(' · ')[0]:'les institutions';
        return 'Derniers communiqués officiels de '+nom+' : '+l.map(i=>'« '+i.titre+' » ('+i.source+')').join(' ; ')+'. Titres dans la langue d’origine.';
      }
      if(d.type==='social'){
        await dpOuvrirHub('social');
        const r=await D.social(); if(r.etat!=='ok') return 'Les comptes publics sont indisponibles : '+r.raison+'.';
        const cible=d.cible||'', garde=r.messages.filter(m=>dpNorm(m.compte).split(' ').some(w=>w.length>2&&cible.includes(w)));
        const l=(garde.length?garde:r.messages).slice(0,3);
        return 'Derniers messages de comptes publics vérifiés : '+l.map(m=>m.compte+' sur '+m.plateforme+' : « '+m.texte.slice(0,110)+' »').join(' ; ')+'.';
      }
      if(d.type==='ephemeride'){
        await dpOuvrirHub('aujourdhui');
        const r=await D.ephemeride('fr',d.jour,d.mois);
        if(r.etat!=='ok') return 'Le fil de l’histoire du jour est indisponible : '+r.raison+'.';
        return 'Le '+r.jour+'/'+r.mois+' dans l’histoire, d’après Wikipédia : '+r.evenements.slice(0,3).map(e=>e.annee+', '+e.texte).join(' ; ')+'.';
      }
      return null;
    },
    ouvrirHub:onglet=>dpOuvrirHub(onglet||'evenements')
  };
  window.DirectPage=DirectPage;
  window.addEventListener('load',()=>{ const b=document.getElementById('btnSources'); if(b) b.addEventListener('click',()=>{ DirectPage.ouvrirHub('evenements').catch(()=>{}); }); });
