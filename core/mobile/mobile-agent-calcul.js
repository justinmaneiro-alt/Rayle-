"use strict";
/* ═════════════ ÉCRAN « AGENTS TRADING » DE LA COQUE MOBILE : MODÈLES D'AFFICHAGE PURS (V8 ; testé : galaxie/tests/mobile-agent-calcul-test.mjs) ═════════════
   Transforme le paquet publié par le service Kepler (positions du jour, bilan, types de setup, performance simulée, pistes, équipe, occasions, exemples, données) en
   modèles prêts à dessiner. Rien n'est inventé : une valeur absente reste null, un manque de preuve est écrit en clair. Aucune fonction d'ordre n'existe : propositions et simulation seulement.
   Les NIVEAUX DE PREUVE (Validée / Candidate / Idée non testée) sont toujours rendus avec leurs vraies statistiques ; les critères ne sont jamais modifiés ici (lecture seule). */
(function(racine){
  "use strict";
  const C=racine.MobileCalcul||(typeof require!=='undefined'?require('./mobile-calcul.js'):null);
  const f=Number.isFinite;
  const ONGLETS=Object.freeze([
    {id:'positions',nom:'Positions du jour'},{id:'graphique',nom:'Graphique'},{id:'performance',nom:'Performance'},{id:'strategies',nom:'Stratégies'},
    {id:'agent',nom:'Agent'},{id:'liquidite',nom:'Liquidité'},{id:'equipe',nom:'Équipe'},{id:'occasions',nom:'Occasions manquées'},{id:'exemples',nom:'Exemples'},{id:'donnees',nom:'Données'},{id:'reglages',nom:'Réglages'}
  ]);
  const ACTIFS=Object.freeze(['BTC','SOL','DOGE']);
  const NOMS_AGENTS=Object.freeze({rebond:'Rebond',continuation:'Continuation',extremes:'Extrêmes',libre:'Hypothèse'});
  const SEUIL_VALIDEE=150, SEUIL_CANDIDATE=100;     // trades hors échantillon (critères v4 « équilibré » : lecture seule)
  const MESSAGE_PREUVE={validee:'',candidate:'Pas encore validée : prends-la comme un test, pas comme un signal fiable.',non_concluante:'Preuve insuffisante : prends-la comme une idée, pas comme un signal fiable.',non_testee:'Preuve insuffisante : prends-la comme une idée, pas comme un signal fiable.'};

  /* « il manque N trades » : on compare au seuil du niveau suivant (Candidate 100, puis Validée 150 hors échantillon). */
  function manqueTrades(n,niveau){
    const t=f(n)?n:0;
    if(niveau==='validee') return null;
    if(niveau==='candidate') return t>=SEUIL_VALIDEE?null:'il manque '+(SEUIL_VALIDEE-t)+' trade'+((SEUIL_VALIDEE-t)>1?'s':'')+' hors échantillon pour être Validée ('+SEUIL_VALIDEE+' exigés)';
    return t>=SEUIL_CANDIDATE?null:'il manque '+(SEUIL_CANDIDATE-t)+' trade'+((SEUIL_CANDIDATE-t)>1?'s':'')+' hors échantillon pour être Candidate ('+SEUIL_CANDIDATE+' exigés)';
  }
  function preuve(p){
    const e=p||{}, niveau=e.niveau||'non_testee', n=f(e.n)?e.n:0;
    return {niveau,libelle:C.NIVEAUX[niveau]||niveau,court:C.COURT_NIVEAU[niveau]||niveau,n,
      stats:n?{tauxReussite:f(e.tauxReussite)?e.tauxReussite:null,rrMoyen:f(e.rrMoyen)?e.rrMoyen:null,esperance:f(e.esperance)?e.esperance:null,fourchette:Array.isArray(e.fourchette)?e.fourchette:null,n}:null,
      message:MESSAGE_PREUVE[niveau]!=null?MESSAGE_PREUVE[niveau]:MESSAGE_PREUVE.non_testee,manque:manqueTrades(n,niveau)};
  }
  /* Une proposition → carte. `maintenant` sert à la validité (expirée si dépassée). */
  function carteProposition(p,maintenant){
    const live=C.statutLive(p,maintenant), niv=C.niveauxPosition(p), conf=p.confluence||{};
    return {id:p.id||(p.agent+':'+p.actif+':'+p.tf+':'+p.t),sens:p.sens>0?'achat':'vente',sensTexte:C.sensTexte(p),actif:p.actif,tf:p.tf,agent:p.agent,agentNom:NOMS_AGENTS[p.agent]||p.agent,type:p.nomType||p.type||'',
      diamant:!!(p.diamant||conf.diamant),live,zone:niv.zone,entree:niv.entree,stop:niv.stop,cibles:niv.cibles,cibleNom:p.cibleNom||null,rr:f(p.rr)?p.rr:null,raison:p.raison||'',invalidation:p.invalidation||'',
      valableJusqu:f(p.tValide)?p.tValide:null,expiree:live.code==='expiree',preuve:preuve(p.preuve),t:p.t||null};
  }
  function cartesPositions(vue,maintenant){
    const l=((vue&&vue.propositions)||[]).map(p=>carteProposition(p,maintenant));
    const rang={ouverte:0,attente:1,cible:2,stop:3,expiree:4};
    return l.sort((a,b)=>(rang[a.live.code]??5)-(rang[b.live.code]??5)||(b.t||0)-(a.t||0));
  }
  /* Quand rien n'est proposé : jamais « rien » sans explication. */
  function aucunePosition(vue){
    const v=vue||{}, hyp=(v.hypotheses_du_moment||[]).map(h=>({actif:h.actif||null,tf:h.tf||null,raison:h.raison||'',pourquoi:h.pourquoi||'',quand:h.quand||'',carte:(h.type==='preuve'&&f(h.limite))?carteProposition({...h,confluence:h.confluence||{},diamant:h.confluence&&h.confluence.diamant},Date.now()):null}));
    const zones=Object.entries(v.zonesDiamant||{}).flatMap(([a,zs])=>(zs||[]).map(x=>({...x,actif:a}))).sort((a,b)=>(a.distancePct??99)-(b.distancePct??99));
    return {titre:'Aucune position proposée pour l’instant',hypotheses:hyp,zones,explication:hyp.length?'':'Aucune configuration ne passe le filtre qualité, et aucune zone à surveiller n’est assez nette. Kepler recalcule à chaque clôture de bougie.'};
  }
  /* Pistes : statut + preuve manquante en clair + niveau strict / équilibré. */
  function lignePiste(p){
    const n=p.niveaux||{};
    return {id:p.id,nom:p.nom||p.famille,paire:p.paire,statut:(p.statut&&p.statut.texte)||'',code:(p.statut&&p.statut.code)||'',trades:p.trades||0,esperance:f(p.esperanceApres)?p.esperanceApres:null,
      reussite:f(p.tauxReussite)?p.tauxReussite:null,rrMoyen:f(p.rrMoyen)?p.rrMoyen:null,bootstrapBas:f(p.bootstrapBas)?p.bootstrapBas:null,probHasard:f(p.dsr)?p.dsr:null,creuxPct:f(p.ddPct)?p.ddPct:null,
      manque:(p.manque||[]).map(m=>m.texte),manqueTrades:manqueTrades(p.trades||0,'non_concluante'),strict:n.strict?{niveau:n.strict.niveau,texte:C.NIVEAUX[n.strict.niveau]||n.strict.niveau}:null,equilibre:n.equilibre?{niveau:n.equilibre.niveau,texte:C.NIVEAUX[n.equilibre.niveau]||n.equilibre.niveau}:null,
      enPepiniere:!!p.enPepiniere,pepiniere:p.pepiniere||null,jeuFinalOuvert:!!(p.jeuFinal&&p.jeuFinal.ouvert)};
  }
  /* Entonnoir de rejet : les critères les plus souvent ratés, en pourcentage des variantes évaluées. */
  function lignesEntonnoir(ent,max=8){
    if(!ent||!Array.isArray(ent.criteres)||!ent.evaluations) return [];
    return ent.criteres.slice().sort((a,b)=>(b.part||0)-(a.part||0)).slice(0,max).map(c=>({critere:c.critere,pct:Math.round((c.part||0)*100),rate:c.rate,seul:c.seul||0,total:ent.evaluations}));
  }
  /* Statuts des types de setup (Validée / Candidate / Rejetée / En test). */
  function statutType(t){ return t.niveau==='validee'?'Validée':t.niveau==='candidate'?'Candidate':t.niveau==='non_concluante'?(t.n>=SEUIL_CANDIDATE?'Rejetée':'En test'):'En test'; }
  function lignesTypes(types){
    return (types||[]).map(t=>({nom:t.nomType||t.type,actif:t.actif,tf:t.tf,agent:t.agent,niveau:t.niveau,statut:statutType(t),n:t.n||0,esperance:f(t.esperance)?t.esperance:null,fourchette:Array.isArray(t.fourchette)?t.fourchette:null,reussite:f(t.tauxReussite)?t.tauxReussite:null,rrMoyen:f(t.rrMoyen)?t.rrMoyen:null,
      pourquoi:t.pourquoi||'',manque:manqueTrades(t.n||0,t.niveau)})).sort((a,b)=>({'Validée':0,'Candidate':1,'En test':2,'Rejetée':3}[a.statut]-{'Validée':0,'Candidate':1,'En test':2,'Rejetée':3}[b.statut])||b.n-a.n);
  }
  const compterStatuts=l=>l.reduce((m,x)=>(m[x.statut]=(m[x.statut]||0)+1,m),{});

  /* Performance : sélection par agent / actif / période. `perf` = paquet.performance. Période : 'tout' | 7 | 30 (jours). */
  function selectionPerformance(perf,{agent=null,actif=null,jours=null,maintenant=Date.now()}={}){
    if(!perf) return null;
    let bloc=agent&&perf.parAgent&&perf.parAgent[agent]?perf.parAgent[agent]:actif&&perf.parActif&&perf.parActif[actif]?perf.parActif[actif]:perf.tous;
    if(!bloc) return null;
    if(jours&&bloc.courbe){
      const t0=maintenant-jours*86400e3, pts=bloc.courbe.filter(p=>p[0]>=t0), base=bloc.courbe.filter(p=>p[0]<t0).pop(), b0=base?base[1]:0;
      const courbe=pts.map(p=>[p[0],+(p[1]-b0).toFixed(3)]), jr=Object.fromEntries(Object.entries(bloc.jours||{}).filter(([j])=>Date.parse(j)>=t0));
      const R=Object.values(jr); return {...bloc,courbe,jours:jr,n:pts.length,Rtotal:courbe.length?courbe[courbe.length-1][1]:0,pct:courbe.length?+(courbe[courbe.length-1][1]*(perf.risquePct||0.5)).toFixed(3):0,filtre:true,joursActifs:R.length};
    }
    return bloc;
  }
  const phraseEtatPerf=b=>{ if(!b||!b.n) return 'Aucun trade simulé pour l’instant : rien à mesurer, rien d’inventé.'; return b.n+' trade'+(b.n>1?'s':'')+' simulé'+(b.n>1?'s':'')+' : '+C.R(b.Rtotal,1)+' ('+C.pourcent(b.pct,1)+' au risque choisi). '+(b.n<30?'Preuve encore insuffisante.':'À lire avec la fourchette de confiance.'); };

  /* Réglages : valeur du formulaire → objet de réglages accepté par le service (il revalide tout). */
  function reglagesDepuis(champs){
    const out={};
    if(champs.agents) out.agents={rebond:!!champs.agents.rebond,continuation:!!champs.agents.continuation,extremes:!!champs.agents.extremes};
    if(Array.isArray(champs.actifs)) out.actifs=champs.actifs.filter(a=>ACTIFS.includes(a));
    if(Array.isArray(champs.unites)) out.unites=champs.unites.filter(u=>['M15','H1'].includes(u));
    const borne=(x,a,b)=>Math.min(b,Math.max(a,+x));
    if(f(+champs.maxParAgent)) out.maxParAgent=Math.round(borne(champs.maxParAgent,1,6));
    if(f(+champs.maxNouvellesParJour)) out.maxNouvellesParJour=Math.round(borne(champs.maxNouvellesParJour,1,15));
    if(f(+champs.confluenceMin)) out.confluenceMin=Math.round(borne(champs.confluenceMin,1,4));
    if(f(+champs.risquePct)) out.risquePct=borne(champs.risquePct,0.05,2);
    if(['validee','candidate'].includes(champs.niveauPreuveMin)) out.niveauPreuveMin=champs.niveauPreuveMin;
    if(typeof champs.afficherIdees==='boolean') out.afficherIdees=champs.afficherIdees;
    if(typeof champs.alertesObservation==='boolean') out.alertesObservation=champs.alertesObservation;
    if(typeof champs.surveillance==='boolean') out.surveillance=champs.surveillance;
    return out;
  }
  /* Exemple marqué sur le graphique → objet accepté par le service (même schéma que l'écran du PC). */
  function exempleDepuis({actif,sens,avis,t,entree,stop,cible}){
    const ok=ACTIFS.includes(actif)&&['achat','vente'].includes(sens)&&['bon','mauvais'].includes(avis)&&f(t)&&f(entree);
    if(!ok) return null;
    const o={actif,sens,avis,t,entree}; if(f(stop)) o.stop=stop; if(f(cible)) o.cible=cible; return o;
  }
  /* Coloration thermique d'une case du calendrier : rgba vert/rouge selon l'intensité (−1…+1). */
  const couleurCase=i=>i>0?'rgba(47,209,139,'+(0.15+0.7*i).toFixed(2)+')':i<0?'rgba(255,93,110,'+(0.15+0.7*-i).toFixed(2)+')':'rgba(143,208,227,.07)';

  const api={ONGLETS,ACTIFS,NOMS_AGENTS,SEUIL_VALIDEE,SEUIL_CANDIDATE,manqueTrades,preuve,carteProposition,cartesPositions,aucunePosition,lignePiste,lignesEntonnoir,statutType,lignesTypes,compterStatuts,selectionPerformance,phraseEtatPerf,reglagesDepuis,exempleDepuis,couleurCase};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.MobileAgentCalcul=api;
})(typeof window!=='undefined'?window:globalThis);
