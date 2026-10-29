"use strict";
/* ═════════════ ÉCRAN « AGENTS TRADING » DE LA COQUE MOBILE (V8) ═════════════
   UN seul agent Kepler : mêmes données que sur le PC (service PC en priorité, Worker en secours, avec l'heure de dernière mise à jour). Onglets à défilement horizontal :
   Positions du jour · Graphique · Performance · Stratégies · Agent · Liquidité · Équipe · Occasions manquées · Exemples · Données · Réglages.
   Téléphone : un onglet plein écran à la fois. Tablette : graphique et contenu côte à côte (deux colonnes en paysage). Simulation et propositions SEULEMENT : aucun ordre, jamais.
   Les niveaux de preuve (Validée / Candidate / Idée non testée) sont toujours visibles, avec les vraies statistiques ; « pas une promesse » accompagne tout chiffre de rendement. Calculs purs : mobile-agent-calcul.js. */
(function(){
  const C=window.MobileCalcul, A=window.MobileAgentCalcul, DA=window.MobileAgentDonnees, Coque=window.MobileCoque; if(!C||!A||!DA||!Coque) return;
  const esc=C.esc, lire=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } }, ecrire=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
  const tablette=RayleAppareil.mode()==='tablette';
  const prix=(x,d)=>C.prix(x,d), R=C.R, pct=x=>Number.isFinite(x)?Math.round(x*100)+' %':'—';
  const S={onglet:lire('rayle_m_agent_onglet')||'positions',data:null,meta:null,bandeau:null,perf:{agent:null,actif:null,jours:null},actifGraphe:'BTC',liqActif:'BTC',graphe:null,racine:null,corps:null,carteVue:null};
  const ONGLETS=A.ONGLETS.filter(o=>!(tablette&&o.id==='graphique'));
  if(!ONGLETS.some(o=>o.id===S.onglet)) S.onglet='positions';

  /* ───── squelette de l'écran ───── */
  function monter(el){
    S.racine=el;
    el.innerHTML='<div class="m-titre"><h1>Agents trading</h1><small data-maj></small></div><p class="m-garde">Propositions et simulations seulement : aucun ordre n’est passé, aucun gain n’est garanti.</p><div data-lien></div>'
      +'<div class="m-onglets" role="tablist" aria-label="Sections de l’agent">'+ONGLETS.map(o=>'<button type="button" role="tab" class="m-chip" data-o="'+o.id+'" aria-selected="'+(o.id===S.onglet?'true':'false')+'">'+esc(o.nom)+'</button>').join('')+'</div>'
      +'<div class="m-agent-grille"><div class="m-agent-g" data-graphe-panneau'+(tablette?'':' hidden')+'><div class="m-graphe-hote" data-hote></div></div><div class="m-agent-c" data-corps></div></div>';
    S.corps=el.querySelector('[data-corps]');
    el.querySelector('.m-onglets').addEventListener('click',ev=>{ const b=ev.target.closest('[data-o]'); if(b){ Coque.vibrer(6); aller(b.dataset.o); } });
    el.addEventListener('click',clics);
    DA.observer(e=>{ S.data=e.data; S.meta=e.meta; S.bandeau=e.bandeau; entete(); if(S.data) dessiner(); else vide(); });
    if(tablette) graphe();
  }
  function aller(id){ S.onglet=id; ecrire('rayle_m_agent_onglet',id); S.racine.querySelectorAll('.m-onglets [data-o]').forEach(b=>b.setAttribute('aria-selected',b.dataset.o===id?'true':'false')); const b=S.racine.querySelector('.m-onglets [data-o="'+id+'"]'); if(b&&b.scrollIntoView) b.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'}); dessiner(); }

  function entete(){
    const d=S.data, r=S.racine; if(!r) return;
    r.querySelector('[data-maj]').textContent=d?'mise à jour '+C.age(d.recuLe).replace(/^il y a /,'il y a ')+' · '+(d.origine==='PC'?'PC en direct':'copie du serveur'):'';
    const l=r.querySelector('[data-lien]'); let h='';
    if(d&&d.origine==='Worker'&&!d.pcVivant) h+='<div class="m-bandeau" data-genre="ancien"><span>PC éteint : dernières données publiées par le PC ('+esc(C.age(d.recuLe))+'). La surveillance continue sur le serveur.</span></div>';
    if(S.bandeau&&S.bandeau.genre) h+='<div class="m-bandeau" data-genre="'+(S.bandeau.genre==='erreur'?'erreur':'ancien')+'"><span>'+esc(S.bandeau.texte)+'</span><button type="button" class="m-bouton" data-rafraichir>Réessayer</button></div>';
    l.innerHTML=h;
  }
  function vide(){
    if(!S.corps) return;
    if(S.bandeau&&S.bandeau.genre==='erreur') S.corps.innerHTML='<p class="m-vide">'+esc(S.bandeau.texte)+'</p>'; else S.corps.innerHTML='<div class="m-squelette"><i></i><i></i><i></i></div><div class="m-squelette m-image" style="margin-top:14px"><i></i><i></i></div>';
    if(tablette) graphe();
  }

  /* ───── dispatcher ───── */
  function dessiner(){
    if(!S.corps||!S.data) return; const P=S.data.paquet, id=S.onglet, f=VUES[id]; if(!f) return;
    const haut=S.corps.parentNode.scrollTop; const avant=S.racine.scrollTop;
    const gh=S.racine.querySelector('[data-hote]');
    if(id==='graphique'&&!tablette){ S.corps.innerHTML='<div data-hote-tel></div>'; const t=S.corps.querySelector('[data-hote-tel]'); t.appendChild(gh); S.racine.querySelector('[data-graphe-panneau]').hidden=true; gh.hidden=false; graphe(); }
    else { if(!tablette){ const pan=S.racine.querySelector('[data-graphe-panneau]'); if(gh.parentNode!==pan) pan.appendChild(gh); pan.hidden=true; } S.corps.innerHTML=f(P,S.data); }
    if(tablette) { S.racine.querySelector('[data-graphe-panneau]').hidden=false; graphe(); }
    S.racine.scrollTop=avant; S.racine.dataset.onglet=id;
    const apres=APRES[id]; if(apres) apres(S.corps,P,S.data);
  }

  /* ───── clics ───── */
  function clics(ev){
    const t=ev.target;
    if(t.closest('[data-rafraichir]')){ DA.rafraichir(); return; }
    const voir=t.closest('[data-voir]'); if(voir){ const c=(window.__cartesM||[]).find(x=>x.id===voir.dataset.voir); if(c){ S.carteVue=c; S.actifGraphe=c.actif; if(!tablette) aller('graphique'); graphe().then(g=>{ if(g){ if(g.etat().actif!==c.actif) g.definirActif(c.actif); if(g.etat().tf!==c.tf) g.definirTf(c.tf); g.afficherPosition(c); } }); } return; }
    const pe=t.closest('[data-perf]'); if(pe){ const [k,v]=pe.dataset.perf.split(':'); S.perf[k]=v==='*'?null:(k==='jours'?(v==='tout'?null:+v):v); if(k==='agent') S.perf.actif=null; if(k==='actif') S.perf.agent=null; dessiner(); return; }
    const la=t.closest('[data-liq]'); if(la){ S.liqActif=la.dataset.liq; dessiner(); return; }
    const ga=t.closest('[data-ga]'); if(ga){ S.actifGraphe=ga.dataset.ga; if(S.graphe) S.graphe.definirActif(S.actifGraphe); S.racine.querySelectorAll('[data-ga]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ga===S.actifGraphe?'true':'false')); return; }
    const cm=t.closest('[data-cmd]'); if(cm){ commande(cm); return; }
    const sv=t.closest('[data-sauver]'); if(sv){ sauverReglages(); return; }
    const st=t.closest('[data-strat]'); if(st){ const l=S.racine.querySelector('[data-strat-liste="'+st.dataset.strat+'"]'); if(l) l.hidden=!l.hidden; return; }
  }
  async function commande(b){
    const type=b.dataset.cmd, valeur=b.dataset.val!=null?b.dataset.val:undefined, msg=S.racine.querySelector('[data-cmd-msg]');
    b.disabled=true; if(msg) msg.textContent='Envoi…';
    try{ const r=await DA.commande(type,valeur); if(msg) msg.textContent=(r.via==='PC'?'Transmis au service du PC.':'Transmis au serveur : le PC l’appliquera à son prochain battement (PC éteint : il attend).'); Coque.vibrer(10); setTimeout(()=>DA.rafraichir(),1500); }
    catch(e){ if(msg) msg.textContent=C.messageErreur(e); }
    b.disabled=false;
  }

  /* ───── graphique (créé une fois) ───── */
  let promesseGraphe=null;
  function graphe(){
    if(S.graphe) return Promise.resolve(S.graphe);
    if(promesseGraphe) return promesseGraphe;
    const hote=S.racine.querySelector('[data-hote]'); if(!hote||!window.MobileGraphique) return Promise.resolve(null);
    hote.innerHTML='<div class="m-ga" role="group" aria-label="Actif">'+A.ACTIFS.map(a=>'<button type="button" data-ga="'+a+'" aria-pressed="'+(a===S.actifGraphe?'true':'false')+'">'+a+'</button>').join('')+'</div><div data-g></div>';
    const g=hote.querySelector('[data-g]');
    promesseGraphe=MobileGraphique.creer(g,{actif:S.actifGraphe,tf:'M15',vue:S.data&&S.data.paquet.positions,surMarquer:marquer}).then(x=>{ S.graphe=x; if(S.carteVue) x.afficherPosition(S.carteVue); return x; }).catch(e=>{ promesseGraphe=null; g.innerHTML='<p class="m-vide">'+esc(C.messageErreur(e))+'</p>'; return null; });
    return promesseGraphe;
  }

  /* ───── marquer un exemple ───── */
  function marquer({actif,tf,t,prix:p}){
    Coque.feuille({titre:'Marquer ici',rendre(c,o){
      c.innerHTML='<p class="m-doux" style="margin:0 0 10px">'+esc(actif)+' '+esc(tf)+' · '+new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'</p>'
        +'<div class="m-segm" role="group" aria-label="Sens"><button type="button" data-sens="achat" aria-pressed="true">Achat</button><button type="button" data-sens="vente" aria-pressed="false">Vente</button></div>'
        +'<label class="m-champ">Entrée<input type="number" inputmode="decimal" step="any" data-f="entree" value="'+p+'"></label><label class="m-champ">Stop<input type="number" inputmode="decimal" step="any" data-f="stop" placeholder="prix du stop"></label><label class="m-champ">Cible<input type="number" inputmode="decimal" step="any" data-f="cible" placeholder="prix de la cible"></label>'
        +'<p class="m-faible" data-msg style="min-height:20px;margin:6px 0"></p><div class="m-ligne" style="gap:10px"><button type="button" class="m-bouton" data-avis="bon" style="flex:1">✔ J’aurais pris ça</button><button type="button" class="m-bouton" data-avis="mauvais" style="flex:1">✘ Pas bon</button></div>'
        +'<p class="m-faible" style="margin-top:12px">Kepler compare avec ses propositions et note les cas manqués ; ses nouvelles idées sont testées sur d’autres données, jamais validées sur tes exemples.</p>';
      let sens='achat'; const msg=c.querySelector('[data-msg]'), val=k=>{ const x=c.querySelector('[data-f="'+k+'"]').value; return x===''?null:+x; };
      c.addEventListener('click',async ev=>{
        const s=ev.target.closest('[data-sens]'); if(s){ sens=s.dataset.sens; c.querySelectorAll('[data-sens]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.sens===sens?'true':'false')); return; }
        const b=ev.target.closest('[data-avis]'); if(!b) return;
        const e=val('entree'), st=val('stop'), ci=val('cible'), avis=b.dataset.avis;
        if(avis==='bon'){ if(st==null||ci==null){ msg.textContent='Indique le stop et la cible pour « j’aurais pris ça ».'; return; } const bon=sens==='achat'?(st<e&&e<ci):(ci<e&&e<st); if(!bon){ msg.textContent=sens==='achat'?'Pour un achat : stop < entrée < cible.':'Pour une vente : cible < entrée < stop.'; return; } }
        const ex=A.exempleDepuis({actif,sens,avis,t,entree:e,stop:st==null?undefined:st,cible:ci==null?undefined:ci}); if(!ex){ msg.textContent='Valeurs incomplètes.'; return; }
        b.disabled=true; msg.textContent='Envoi…';
        try{ const r=await DA.exemple(ex); msg.textContent=r.note||'Transmis au service Kepler.'; Coque.vibrer(12); setTimeout(()=>{ o.fermer(); DA.rafraichir(); },900); }catch(er){ msg.textContent=C.messageErreur(er); b.disabled=false; }
      });
    }});
  }

  /* ───── vues ───── */
  const carte=(titre,corps,cls='')=>'<section class="m-bloc '+cls+'"><h3>'+titre+'</h3>'+corps+'</section>';
  const tuile=(l,v,s='')=>'<div class="m-tuile-s"><small>'+esc(l)+'</small><b class="m-mono">'+v+'</b>'+(s?'<small>'+s+'</small>':'')+'</div>';
  const pilule=(niv,txt)=>'<span class="m-niv" data-niveau="'+esc(niv)+'">'+esc(txt)+'</span>';
  const garde=t=>'<p class="m-note">'+esc(t)+'</p>';

  function htmlPreuve(p){
    const s=p.stats;
    return '<div class="m-preuve" data-niveau="'+esc(p.niveau)+'">'+pilule(p.niveau,p.libelle)
      +(s?'<p class="m-faible">réussite '+pct(s.tauxReussite)+' · gain/perte moyens '+(Number.isFinite(s.rrMoyen)?s.rrMoyen.toFixed(1).replace('.',','):'—')+' · espérance après frais <b>'+R(s.esperance)+'</b>'+(s.fourchette?' (fourchette 95 % : '+R(s.fourchette[0])+' à '+R(s.fourchette[1])+')':'')+' · '+s.n+' trades hors échantillon</p>':'<p class="m-faible">aucun trade mesuré</p>')
      +(p.message?'<p class="m-alerte-t">'+esc(p.message)+'</p>':'')+(p.manque?'<p class="m-faible">'+esc(p.manque.charAt(0).toUpperCase()+p.manque.slice(1))+'.</p>':'')+'</div>';
  }
  function htmlCarte(c){
    const zone=c.zone?prix(c.zone[0])+' – '+prix(c.zone[1]):prix(c.entree);
    return '<article class="m-pos" data-sens="'+c.sens+'" data-live="'+c.live.code+'" data-niveau="'+esc(c.preuve.niveau)+'">'
      +'<header><b class="m-pos-sens">'+c.sensTexte+'</b> <span class="m-pos-actif">'+esc(c.actif)+'</span> <span class="m-tf">'+esc(c.tf)+'</span>'+(c.diamant?' <span class="m-diamant" title="Zone de confluence premium">💎</span>':'')+'<span class="m-live" data-live="'+c.live.code+'">'+esc(c.live.texte)+'</span></header>'
      +'<p class="m-faible m-pos-ag">'+esc(c.agentNom)+(c.type?' · '+esc(c.type):'')+'</p>'
      +'<div class="m-niveaux"><div><small>Zone d’entrée</small><b class="m-mono">'+zone+'</b></div><div><small>Ordre limite</small><b class="m-mono">'+prix(c.entree)+'</b></div><div><small>Stop</small><b class="m-mono m-bas-c">'+prix(c.stop)+'</b></div><div><small>RR</small><b class="m-mono">'+(c.rr!=null?c.rr.toFixed(1).replace('.',',')+' pour 1':'—')+'</b></div>'
      +c.cibles.map((x,i)=>'<div><small>Cible '+(i+1)+'</small><b class="m-mono m-haut-c">'+prix(x)+'</b></div>').join('')+'</div>'
      +'<p class="m-raison"><b>Pourquoi :</b> '+esc(c.raison)+'</p>'+htmlPreuve(c.preuve)
      +'<p class="m-faible"><b>Annulée si :</b> '+esc(c.invalidation)+'.'+(c.valableJusqu?' Valable jusqu’à '+new Date(c.valableJusqu).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+'.':'')+'</p>'
      +'<button type="button" class="m-bouton" data-voir="'+esc(c.id)+'" style="width:100%">Voir sur le graphique</button></article>';
  }
  const VUES={
    positions(P,d){
      const v=P.positions; if(!v) return '<p class="m-vide">Le service Kepler n’a pas encore calculé de position (il le fait à chaque clôture de bougie M15).</p>';
      const cartes=A.cartesPositions(v,Date.now()); window.__cartesM=cartes.concat(A.aucunePosition(v).hypotheses.map(h=>h.carte).filter(Boolean));
      let h='<p class="m-faible" style="margin:0 2px 10px">Niveau de preuve : <b>'+esc(v.versionCriteres||'—')+'</b> · '+(v.mesureEnCours?'mesure en cours sur '+esc(v.mesureEnCours)+'…':'dernier calcul '+esc(C.age(v.dernierCycle)))+'</p>';
      if(cartes.length) return h+'<div class="m-pos-liste">'+cartes.map(htmlCarte).join('')+'</div>'+zonesDiamant(v);
      const a=A.aucunePosition(v);
      h+=carte(esc(a.titre),(a.hypotheses.length?a.hypotheses.map(x=>x.carte?'<p><b>Meilleure position du moment, masquée par ton niveau de preuve :</b></p>'+htmlCarte(x.carte)+'<p class="m-faible">'+esc(x.pourquoi)+'</p>'+(x.quand?'<p class="m-faible">'+esc(x.quand)+'</p>':''):'<div class="m-hyp"><b>'+esc(x.actif||'')+(x.tf?' '+esc(x.tf):'')+'</b> — '+esc(x.raison)+'<p class="m-faible">Pourquoi elle n’est pas proposée : '+esc(x.pourquoi)+'</p>'+(x.quand?'<p class="m-faible">Quand elle le deviendrait : '+esc(x.quand)+'</p>':'')+'</div>').join(''):'<p>'+esc(a.explication)+'</p>')+garde('Par défaut seules les positions « Candidate » ou « Validée » sont montrées : les autres ont des statistiques insuffisantes ou négatives (réglable dans Réglages).'),'m-aucune');
      return h+zonesDiamant(v);
    },
    graphique(){ return ''; },
    performance(P){
      const perf=P.performance, B=P.positions&&P.positions.bilan; if(!perf) return '<p class="m-vide">Aucune performance à montrer : Kepler n’a pas encore suivi de position.</p>';
      const sel=A.selectionPerformance(perf,{agent:S.perf.agent,actif:S.perf.actif,jours:S.perf.jours,maintenant:Date.now()});
      const chip=(k,v,t,actif)=>'<button type="button" class="m-chip" data-perf="'+k+':'+v+'" aria-selected="'+(actif?'true':'false')+'">'+esc(t)+'</button>';
      const p=S.perf, sel1=(p.agent?'agent:'+p.agent:p.actif?'actif:'+p.actif:'agent:*');
      const filtres='<div class="m-chips m-chips-s" role="group" aria-label="Agent">'+chip('agent','*','Tous',!p.agent&&!p.actif)+Object.keys(A.NOMS_AGENTS).filter(a=>a!=='libre').map(a=>chip('agent',a,A.NOMS_AGENTS[a],p.agent===a)).join('')+'</div>'
        +'<div class="m-chips m-chips-s" role="group" aria-label="Actif">'+A.ACTIFS.map(a=>chip('actif',a,a,p.actif===a)).join('')+'</div>'
        +'<div class="m-chips m-chips-s" role="group" aria-label="Période">'+chip('jours','7','7 jours',p.jours===7)+chip('jours','30','30 jours',p.jours===30)+chip('jours','tout','Tout',!p.jours)+'</div>';
      let h=filtres+carte('Où on en est','<p>'+esc(A.phraseEtatPerf(sel))+'</p><p class="m-faible">'+esc(B&&B.tous&&B.tous.phrase?B.tous.phrase:'')+'</p>');
      if(sel&&sel.n){
        h+='<div class="m-tuiles-s">'+tuile('Trades',sel.n)+tuile('Réussite',pct(sel.reussite))+tuile('Gain / perte moyens',Number.isFinite(sel.rrMoyen)?sel.rrMoyen.toFixed(1).replace('.',','):'—')+tuile('Espérance après frais',R(sel.esperance))+tuile('Résultat',R(sel.Rtotal,1),C.pourcent(sel.pct,1)+' à '+(perf.risquePct||0.5)+' % par trade')+tuile('Creux max (drawdown)',Number.isFinite(sel.drawdownR)?'−'+sel.drawdownR.toFixed(1).replace('.',',')+' R':'—')+tuile('Meilleure série',sel.meilleureSerie||0,'gagnants d’affilée')+tuile('Pire série',sel.pireSerie||0,'perdants d’affilée')+'</div>';
        const c=C.courbePath(sel.courbe,320,130,6); if(c) h+=carte('Courbe de capital (en R)','<svg class="m-courbe" viewBox="0 0 320 130" preserveAspectRatio="none" role="img" aria-label="Courbe de capital simulée"><line x1="0" x2="320" y1="'+c.zero.toFixed(1)+'" y2="'+c.zero.toFixed(1)+'" class="zero"/><path class="aire" d="'+c.aire+'"/><path class="trait" d="'+c.d+'"/><circle cx="'+c.dernier[0].toFixed(1)+'" cy="'+c.dernier[1].toFixed(1)+'" r="3"/></svg><p class="m-faible">Fin : <b class="m-mono">'+R(c.fin,1)+'</b></p>');
        const cal=C.calendrierThermique(sel.jours,{semaines:12}); h+=carte('Calendrier des jours','<div class="m-cal" role="img" aria-label="Calendrier thermique des résultats par jour">'+cal.cases.map(x=>'<i style="grid-column:'+(x.col+1)+';grid-row:'+(x.ligne+1)+';background:'+(x.futur?'transparent':A.couleurCase(x.intensite))+'" title="'+x.jour+(x.R!=null?' : '+R(x.R,1):'')+'"></i>').join('')+'</div><p class="m-faible">Vert : jour gagnant · rouge : jour perdant · gris : pas de trade.</p>');
      }
      const hb=C.hebdoDepuisJours(perf.tous&&perf.tous.jours,perf.risquePct||0.5,{semaines:8}), ho=B&&B.tous&&B.tous.hebdo;
      h+=carte('Résultats par semaine et objectif','<div class="m-hebdo">'+hb.map(s=>'<div class="m-hb" title="'+C.pourcent(s.pct,2)+'"><i style="height:'+Math.min(100,Math.abs(s.pct)*40)+'%" data-s="'+(s.pct>0?1:s.pct<0?-1:0)+'"></i><small>'+new Date(s.debut).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+'</small></div>').join('')+'<span class="m-obj m-obj1">+1 %</span><span class="m-obj m-obj2">+2 %</span></div>'
        +'<p>'+(ho&&ho.assez?'Semaines à +1 % : '+pct(ho.part1)+' · à +2 % : '+pct(ho.part2)+' · moyenne '+C.pourcent(ho.moyenne,2)+' (fourchette 90 % : '+C.pourcent(ho.bas,2)+' à '+C.pourcent(ho.haut,2)+').':'Pas assez de semaines pour une fourchette fiable (au moins 4).')+'</p>'+garde('Simulation avec frais et glissement. Estimation à partir du passé, pas une promesse.'));
      const hz=B&&B.tous&&B.tous.hasard;
      h+=carte('Comparaison avec le hasard',hz&&hz.assez?'<p>Positions prises au hasard (mêmes distances, mêmes périodes) : espérance <b>'+R(hz.esperance)+'</b> contre <b>'+R(B.tous.esperance)+'</b> pour les positions de Kepler.</p>':'<p class="m-faible">Pas encore assez de positions pour comparer au hasard (au moins 5).</p>');
      return h;
    },
    strategies(P){
      const types=A.lignesTypes(P.positions&&P.positions.types), cpt=A.compterStatuts(types), pistes=P.pistes||{};
      let h=carte('Vue d’ensemble','<div class="m-tuiles-s">'+tuile('Validées',cpt['Validée']||0)+tuile('Candidates',cpt['Candidate']||0)+tuile('En test',cpt['En test']||0)+tuile('Rejetées',cpt['Rejetée']||0)+tuile('Variantes testées',(pistes.variantes||0).toLocaleString('fr-FR'),'le compteur ne baisse jamais')+'</div>'+garde('Le nombre de variantes n’est pas une note de qualité : plus on en teste, plus la barre du hasard monte. Aucune stratégie n’est validée sans preuve hors échantillon.'));
      const noms={Validée:'validee',Candidate:'candidate','En test':'non_testee',Rejetée:'non_concluante'};
      h+=carte('Types de position ('+types.length+')',types.length?'<div class="m-types">'+types.map(t=>'<div class="m-type"><div class="m-ligne"><b>'+esc(t.nom)+'</b>'+pilule(noms[t.statut],t.statut)+'</div><p class="m-faible">'+esc(t.actif)+' '+esc(t.tf)+' · '+t.n+' trades · espérance '+R(t.esperance)+(t.fourchette?' ('+R(t.fourchette[0])+' à '+R(t.fourchette[1])+')':'')+'</p>'+(t.manque?'<p class="m-faible">'+esc(t.manque.charAt(0).toUpperCase()+t.manque.slice(1))+'.</p>':'')+'</div>').join('')+'</div>':'<p class="m-faible">Les types n’ont pas encore été mesurés.</p>');
      const pl=(pistes.pistes||[]).map(A.lignePiste);
      h+=carte('Meilleures pistes (recherche)',pl.length?pl.map(p=>'<div class="m-piste"><div class="m-ligne"><b>'+esc(p.nom)+' · '+esc(p.paire)+'</b></div><p class="m-faible">'+esc(p.statut)+'</p><p class="m-faible">'+p.trades+' trades · espérance '+R(p.esperance)+' · réussite '+pct(p.reussite)+'</p>'
        +(p.strict||p.equilibre?'<p class="m-faible">Strict (v3) : '+esc(p.strict?p.strict.texte:'—')+' · Équilibré (v4) : '+esc(p.equilibre?p.equilibre.texte:'—')+'</p>':'')+(p.manqueTrades?'<p class="m-alerte-t">'+esc(p.manqueTrades.charAt(0).toUpperCase()+p.manqueTrades.slice(1))+'.</p>':'')+p.manque.map(m=>'<p class="m-faible">Manque : '+esc(m)+'</p>').join('')+'</div>').join(''):'<p class="m-faible">Pas encore de piste.</p>');
      const ent=A.lignesEntonnoir(pistes.entonnoir,8);
      if(ent.length) h+=carte('Entonnoir de rejet','<p class="m-faible">Critères les plus souvent ratés sur '+ent[0].total+' variantes évaluées.</p>'+ent.map(e=>'<div class="m-ent"><span>'+esc(e.critere)+'</span><div class="m-barre"><i style="width:'+e.pct+'%"></i></div><b class="m-mono">'+e.pct+' %</b></div>').join(''));
      const ag=P.agent||{}, jn=(P.positions&&P.positions.journalNiveaux)||[];
      h+=carte('Versions et promotions','<p>'+(ag.versionActive?'Version active : n° '+ag.versionActive+'.':'Aucune version active : aucune stratégie validée.')+'</p>'+((ag.versions||[]).length?'<ul class="m-liste">'+ag.versions.map(v=>'<li>n° '+v.numero+' · '+esc(new Date(v.t).toLocaleDateString('fr-FR'))+' — '+esc(v.raison)+'</li>').join('')+'</ul>':'')+(jn.length?'<ul class="m-liste">'+jn.slice(0,8).map(e=>'<li>'+esc(new Date(e.t).toLocaleDateString('fr-FR'))+' · '+esc(e.texte)+'</li>').join('')+'</ul>':'<p class="m-faible">Aucune promotion ni rétrogradation pour l’instant.</p>'));
      const sa=ag.strategies||[]; h+=carte('Stratégies utilisées en simulation',sa.length?'<ul class="m-liste">'+sa.map(x=>'<li><b>'+esc(x.nom)+'</b> · '+esc(x.paire)+' · '+esc(x.phase)+'</li>').join('')+'</ul>':'<p class="m-faible">Aucune stratégie validée n’est utilisée : Kepler ne propose que des positions de test, étiquetées.</p>');
      return h;
    },
    agent(P,d){
      const ag=P.agent||{}, eq=P.equipe||{}, lignes=(ag.rapport&&ag.rapport.lignes)||(eq.rapportQuotidien&&eq.rapportQuotidien.lignes)||[];
      let h=carte('État','<div class="m-tuiles-s">'+tuile('Service du PC',d.pcVivant?'en marche':'éteint')+tuile('Données',d.origine==='PC'?'PC direct':'serveur')+tuile('Agent',ag.pause?'en pause':'actif')+tuile('Charge du PC',esc(ag.charge||'—'))+'</div><p class="m-faible">'+esc(P.phase||'')+' · mise à jour '+esc(C.age(d.recuLe))+'</p>');
      h+=carte('Commandes','<div class="m-ligne" style="gap:10px"><button type="button" class="m-bouton" data-cmd="'+(ag.pause?'reprendre':'pause')+'" style="flex:1">'+(ag.pause?'▶ Reprendre':'⏸ Mettre en pause')+'</button></div><div class="m-segm" role="group" aria-label="Charge de calcul du PC" style="margin-top:10px">'+['faible','normal','fort'].map(c=>'<button type="button" data-cmd="charge" data-val="'+c+'" aria-pressed="'+(ag.charge===c?'true':'false')+'">'+c+'</button>').join('')+'</div><p class="m-faible" data-cmd-msg style="min-height:20px;margin:8px 0 0"></p>'+garde('Aucun bouton « Lancer » ni ordre de trading : seulement pause, reprise et charge de calcul.'));
      h+=carte('Dernier rapport (5 lignes)',lignes.length?'<ul class="m-liste">'+lignes.slice(0,5).map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>':'<p class="m-faible">Pas encore de rapport.</p>');
      const al=ag.alertes||[]; h+=carte('Alertes récentes',al.length?'<ul class="m-liste">'+al.slice(0,6).map(a=>'<li><b>'+esc(String(a.titre||a.type||'').replace(/^[^\wÀ-ÿ]+/,''))+'</b> · <small class="m-faible">'+esc(C.age(a.t))+' · '+esc(a.mode||'')+'</small></li>').join('')+'</ul>':'<p class="m-faible">Aucune alerte.</p>');
      return h;
    },
    liquidite(P){
      return '<div class="m-chips m-chips-s" role="group" aria-label="Actif">'+A.ACTIFS.map(a=>'<button type="button" class="m-chip" data-liq="'+a+'" aria-selected="'+(S.liqActif===a?'true':'false')+'">'+a+'</button>').join('')+'</div>'
        +carte('Carte de liquidité (volume échangé par niveau de prix)','<div data-liq-z><div class="m-squelette"><i></i><i></i><i></i></div></div>')+garde('Version simplifiée en lecture verticale : le volume réellement échangé sur les dernières 24 heures (Binance), le prix actuel, le POC et les zones diamant. Les murs du carnet d’ordres enregistré par Kepler restent sur la carte de liquidité du PC.');
    },
    equipe(P){
      const eq=P.equipe; if(!eq) return '<p class="m-vide">Pas encore de rapport de l’équipe.</p>';
      let h=''; for(const [k,r] of Object.entries(eq.equipe||{})) h+=carte(esc(k.charAt(0).toUpperCase()+k.slice(1)),'<p class="m-faible">'+esc(r.role||'')+'</p><ul class="m-liste">'+(r.lignes||[]).slice(0,4).map(l=>'<li>'+esc(String(l).slice(0,260))+'</li>').join('')+'</ul>');
      const hy=eq.hypotheses||[]; h+=carte('Hypothèses du Chercheur ('+hy.length+')',hy.length?'<ul class="m-liste">'+hy.map(x=>'<li><b>'+esc(x.titre)+'</b> — '+esc(x.statut||'')+'<br><small class="m-faible">'+esc(String(x.raison||'').slice(0,200))+'</small></li>').join('')+'</ul>':'<p class="m-faible">Aucune hypothèse pour l’instant.</p>');
      const pe=eq.pepiniere; if(pe) h+=carte('Pépinière (simulation en direct)','<div class="m-tuiles-s">'+tuile('Actives',pe.actives)+tuile('Acceptées',pe.acceptees)+tuile('Retirées',pe.retirees)+tuile('Trades simulés',pe.tradesTotal)+'</div>'+garde('Une candidate n’est acceptée que par le test séquentiel : rien n’est validé ici sans les critères.'));
      return h;
    },
    occasions(P){
      const o=P.occasions; if(!o||!o.total) return '<p class="m-vide">Aucune occasion manquée analysée pour l’instant.</p>';
      return carte('Occasions manquées','<p>'+esc(o.resume||'')+'</p><div class="m-tuiles-s">'+tuile('Repérées',o.total)+tuile('Prises',o.prises)+tuile('Manquées',o.ratees)+'</div>'+Object.entries(o.contextes||{}).map(([k,n])=>'<div class="m-ent"><span>'+esc(k.replace(/_/g,' '))+'</span><div class="m-barre"><i style="width:'+Math.round(n/Math.max(...Object.values(o.contextes))*100)+'%"></i></div><b class="m-mono">'+n+'</b></div>').join(''))
        +garde(o.avertissement||'Ce journal sert à générer des hypothèses, jamais à les valider.')+((o.recentes||[]).length?carte('Dernières',' <ul class="m-liste">'+o.recentes.slice(0,8).map(x=>'<li>'+esc(x.actif||'')+' · '+esc(C.age(x.t))+(x.contexte?' · '+esc(String(x.contexte).replace(/_/g,' ')):'')+'</li>').join('')+'</ul>'):'');
    },
    exemples(P){
      const e=P.exemples||{}; return carte('Tes exemples','<p>'+esc(e.phrase||'Aucun exemple noté pour l’instant.')+'</p><p class="m-faible">Pour en ajouter : ouvre le graphique et fais une <b>touche longue</b> sur la bougie où tu aurais pris une position.</p>'+((e.recents||[]).length?'<ul class="m-liste">'+e.recents.slice(0,10).map(x=>'<li><b>'+esc(x.actif)+'</b> · '+(x.avis==='bon'?'j’aurais '+(x.sens==='achat'?'acheté':'vendu'):'pas bon')+' vers '+prix(x.entree)+' — '+(x.analyse?esc(x.analyse.pourquoi):'analyse en cours…')+'</li>').join('')+'</ul>':''))
        +garde('Kepler compare avec ses propositions, note les cas manqués et en tire de nouvelles hypothèses testées sur des données qu’elles n’ont pas vues. Jamais validées sur tes exemples.');
    },
    donnees(P){
      const d=P.donnees&&P.donnees.flux; if(!d) return '<p class="m-vide">Pas d’information sur l’enregistrement des données.</p>';
      const part=d.quotaGo?Math.min(100,(d.octets/1073741824)/d.quotaGo*100):0;
      return carte('Enregistreur du carnet d’ordres','<p>'+esc(d.phrase||'')+'</p><div class="m-tuiles-s">'+tuile('Jours enregistrés',Number.isFinite(d.jours)?d.jours.toFixed(1).replace('.',','):'—')+tuile('Flux prêts',esc(d.fluxPrets||'—'))+tuile('Trous',d.trous!=null?d.trous:'—')+tuile('Disque',(d.octets/1073741824).toFixed(2).replace('.',',')+' Go','sur '+d.quotaGo+' Go')+'</div><div class="m-barre m-quota"><i style="width:'+part.toFixed(1)+'%"></i></div>')
        +((d.derniersTrous||[]).length?carte('Derniers trous (jamais comblés)','<ul class="m-liste">'+d.derniersTrous.slice(0,5).map(t=>'<li>'+esc(t.flux)+' · '+esc(C.age(t.t))+' — '+esc(t.raison||'')+'</li>').join('')+'</ul>'):'');
    },
    reglages(P){
      const r=(P.positions&&P.positions.reglages); if(!r) return '<p class="m-vide">Les réglages apparaîtront dès que le service aura calculé une première fois.</p>';
      const ck=(k,t,on)=>'<label class="m-reglage"><span>'+esc(t)+'</span><input type="checkbox" data-r="'+k+'"'+(on?' checked':'')+'></label>';
      const nb=(k,t,min,max,pas)=>'<label class="m-champ">'+esc(t)+'<input type="number" inputmode="decimal" data-r="'+k+'" min="'+min+'" max="'+max+'" step="'+pas+'" value="'+esc(r[k])+'"></label>';
      return carte('Agents',ck('ag:rebond','Rebond (balayage de liquidité, absorption)',r.agents.rebond)+ck('ag:continuation','Continuation (repli dans une tendance)',r.agents.continuation)+ck('ag:extremes','Extrêmes (fin de range, cascade)',r.agents.extremes))
        +carte('Actifs et unités',A.ACTIFS.map(a=>ck('ac:'+a,a,r.actifs.includes(a))).join('')+['M15','H1'].map(u=>ck('un:'+u,u,r.unites.includes(u))).join(''))
        +carte('Quantité et qualité',nb('maxParAgent','Positions actives par agent (au plus)',1,6,1)+nb('maxNouvellesParJour','Nouvelles positions par jour (au plus)',1,15,1)+nb('confluenceMin','Éléments de confluence minimum',1,4,1)+nb('risquePct','Risque par trade (%)',0.05,2,0.05)
          +'<label class="m-champ">Niveau de preuve minimum affiché<select data-r="niveauPreuveMin"><option value="validee"'+(r.niveauPreuveMin==='validee'?' selected':'')+'>Validée seulement</option><option value="candidate"'+(r.niveauPreuveMin==='candidate'?' selected':'')+'>Candidate et plus</option></select></label>'+ck('afficherIdees','Montrer aussi les idées non testées (étiquetées)',r.afficherIdees))
        +carte('Alertes Telegram',ck('alertesObservation','Alertes « Observation (non validé) » pour les positions Candidate',r.alertesObservation)+ck('surveillance','« Trade à surveiller » : prévenir quand le prix approche d’une zone diamant',r.surveillance)+garde('Une position Validée envoie une alerte normale. Jamais d’ordre réel.'))
        +'<button type="button" class="m-bouton" data-sauver style="width:100%;margin-top:6px">Enregistrer les réglages</button><p class="m-faible" data-cmd-msg style="min-height:20px;margin:8px 0"></p>'
        +carte('Niveau de preuve','<p>Version actuelle : <b>'+esc(P.positions.versionCriteres||'—')+'</b>.</p><div class="m-segm" role="group">'+[['equilibre','Équilibré (v4)'],['strict','Strict (v3)']].map(([k,t])=>'<button type="button" data-cmd="niveau_preuve" data-val="'+k+'" aria-pressed="'+(r.versionCriteres===k?'true':'false')+'">'+t+'</button>').join('')+'</div>'+garde('Les critères ne sont jamais assouplis pour faire passer une stratégie : ce réglage choisit seulement quelle version est affichée.'));
    }
  };
  function zonesDiamant(v){
    const z=A.aucunePosition(v).zones; if(!z.length) return '';
    return carte('💎 Zones diamant à surveiller','<ul class="m-liste">'+z.slice(0,8).map(x=>'<li><b>'+esc(x.actif)+' '+esc(x.tf||'')+'</b> '+prix(x.niveau)+' ('+(x.cote==='support'?'support':'résistance')+', à '+(Number.isFinite(x.distancePct)?x.distancePct.toFixed(1).replace('.',','):'—')+' %)'+(x.enApproche?' <span class="m-approche">le prix approche</span>':'')+(x.resume?' — '+esc(x.resume):'')+'</li>').join('')+'</ul>');
  }
  /* actions après dessin d'un onglet */
  const APRES={
    liquidite(corps,P){
      const z=corps.querySelector('[data-liq-z]'); if(!z||!window.MobileMarche) return; const a=S.liqActif;
      MobileMarche.bougies(a,'M15',96).then(b=>{ const pv=C.profilVolume(b,32); if(!pv){ z.innerHTML='<p class="m-vide">Pas assez de volume pour tracer la carte.</p>'; return; }
        const dernier=b[b.length-1][4], zones=((P.positions&&P.positions.zonesDiamant&&P.positions.zonesDiamant[a])||[]).filter(x=>x.niveau>=pv.bas&&x.niveau<=pv.haut);
        const lignes=pv.cases.slice().reverse().map(c=>{ const marque=zones.find(x=>Math.abs(x.niveau-c.prix)<=pv.pas/2), ici=Math.abs(dernier-c.prix)<=pv.pas/2, poc=Math.abs(pv.poc-c.prix)<=pv.pas/2;
          return '<div class="m-lq'+(ici?' ici':'')+'"><span class="m-mono">'+prix(c.prix)+'</span><div class="m-barre"><i style="width:'+Math.round(c.part*100)+'%;opacity:'+(0.35+c.part*0.65).toFixed(2)+'"></i></div><em>'+(ici?'prix actuel ':'')+(poc?'POC ':'')+(marque?'💎':'')+'</em></div>'; }).join('');
        z.innerHTML='<div class="m-lqs">'+lignes+'</div>'; }).catch(e=>{ z.innerHTML='<p class="m-vide">'+esc(C.messageErreur(e))+'</p>'; });
    }
  };
  function sauverReglages(){
    const c=S.corps, v=k=>{ const e=c.querySelector('[data-r="'+k+'"]'); return e?(e.type==='checkbox'?e.checked:e.value):undefined; };
    const champs={agents:{rebond:v('ag:rebond'),continuation:v('ag:continuation'),extremes:v('ag:extremes')},actifs:A.ACTIFS.filter(a=>v('ac:'+a)),unites:['M15','H1'].filter(u=>v('un:'+u)),maxParAgent:v('maxParAgent'),maxNouvellesParJour:v('maxNouvellesParJour'),confluenceMin:v('confluenceMin'),risquePct:v('risquePct'),niveauPreuveMin:v('niveauPreuveMin'),afficherIdees:v('afficherIdees'),alertesObservation:v('alertesObservation'),surveillance:v('surveillance')};
    const msg=c.querySelector('[data-cmd-msg]'); msg.textContent='Envoi…';
    DA.commande('reglages',A.reglagesDepuis(champs)).then(r=>{ msg.textContent=r.via==='PC'?'Enregistré : le service du PC l’applique tout de suite.':'Transmis au serveur : le PC l’appliquera à son prochain battement.'; Coque.vibrer(10); setTimeout(()=>DA.rafraichir(),1500); }).catch(e=>{ msg.textContent=C.messageErreur(e); });
  }

  Coque.enregistrer('agent',{monter,montrer(){ DA.rafraichir&&S.data&&Date.now()-S.data.t>60e3&&DA.rafraichir(); if(S.graphe) S.graphe.redessiner(); },cacher(){}});
  window.MobileAgent={etat:()=>S,aller:id=>{ Coque.aller('agent'); if(S.racine) aller(id); else S.onglet=id; },voir:graphe,onglets:()=>ONGLETS.map(o=>o.id)};
})();
