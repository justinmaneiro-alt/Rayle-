"use strict";
/* ═════════════ COQUE MOBILE DE RAYLÉ : CALCULS PURS (V8 ; testé : galaxie/tests/mobile-calcul-test.mjs) ═════════════
   Tout ce qui se calcule sans toucher à la page : navigation, états de chargement et de cache, dégradation automatique selon les images/s, libellés de position,
   profil de volume / VWAP du graphique, courbe de capital, calendrier thermique, avancement des « stories ». Utilisable dans la page (window.MobileCalcul) et sous Node (module.exports).
   Rien n'est inventé : une donnée absente reste absente (« — », null), jamais un chiffre de remplacement. */
(function(racine){
  "use strict";

  /* ───── navigation du bas : 5 entrées au plus (Accueil · Marchés/Agent · [Voix] · Actualités · Plus) ───── */
  const ONGLETS=Object.freeze([
    {id:'accueil',nom:'Accueil'},
    {id:'agent',nom:'Marchés'},
    {id:'voix',nom:'Voix',central:true},
    {id:'actus',nom:'Actus'},
    {id:'plus',nom:'Plus'}
  ]);
  const ECRANS=Object.freeze(['accueil','agent','actus','plus']);

  /* ───── fraîcheur ───── */
  function age(t,maintenant){
    if(!Number.isFinite(t)) return 'date inconnue';
    const s=Math.max(0,Math.round(((maintenant==null?Date.now():maintenant)-t)/1000));
    if(s<45) return "à l'instant";
    const m=Math.round(s/60); if(m<60) return 'il y a '+m+' min';
    const h=Math.round(m/60); if(h<24) return 'il y a '+h+' h';
    const j=Math.round(h/24); return 'il y a '+j+' j';
  }
  /* Mise à jour : « il y a X min » (la forme demandée pour les actualités). */
  const miseAJour=(t,maintenant)=>'mise à jour '+age(t,maintenant);

  /* ───── chargement : jamais un « Chargement… » infini ─────
     Un contenu passe par : chargement (squelette) → contenu → erreur claire avec Réessayer ; la dernière version en cache est montrée tout de suite si elle existe. */
  const DELAIS_REESSAI=Object.freeze([15,30,60,120,300]);          // secondes : retrait progressif, plafonné à 5 min
  const delaiReessai=n=>DELAIS_REESSAI[Math.min(Math.max(0,n|0),DELAIS_REESSAI.length-1)]*1000;
  /* Que faire d'une entrée de cache ? { t, ttl, maintenant } → { montrer: bool, rafraichir: bool, perime: bool } */
  function decisionCache({t,ttl,maintenant,enLigne}={}){
    const now=maintenant==null?Date.now():maintenant, a=Number.isFinite(t)?now-t:Infinity;
    const montrer=Number.isFinite(t), frais=a<ttl;
    return {montrer,rafraichir:!frais&&enLigne!==false,perime:montrer&&!frais};
  }
  /* Texte d'erreur lisible (jamais « HTTP 503 » brut, jamais d'objet). */
  function messageErreur(e){
    let m=String((e&&e.message)||e||'').trim(); if(m.indexOf('[object ')===0) m='';
    if(/503|en préparation|prépar/i.test(m)) return 'Les actualités se préparent : le serveur lit ses médias par petits lots.';
    if(/limit|D1_ERROR|liaison Worker/i.test(m)) return 'La liaison avec le serveur est limitée aujourd’hui. Elle revient toute seule.';
    if(/verrouill|401|403|code d.accès|PIN/i.test(m)) return 'Raylé est verrouillée : entre ton code dans les réglages.';
    if(/Failed to fetch|NetworkError|réseau|network|offline|Load failed/i.test(m)) return 'Pas de réseau pour le moment.';
    if(/abort|timeout|délai/i.test(m)) return 'Le serveur met trop de temps à répondre.';
    return m?m.slice(0,140):'Source indisponible.';
  }

  /* ───── performance : dégradation automatique ─────
     Niveaux : 0 plein · 1 allégé (moins de particules, animations plus lentes) · 2 minimal (rien d'animé en continu). Passe au niveau suivant après `fenetre` ms sous `seuil` images/s ;
     ne remonte jamais seul pendant la visite (un téléphone qui rame ne doit pas osciller). */
  function suivreImages({niveau=0,seuil=40,fenetre=3000}={}){
    let bas=null, n=niveau;
    return {
      niveau:()=>n,
      echantillon(fps,t){
        if(!Number.isFinite(fps)) return n;
        if(fps<seuil){ if(bas==null) bas=t; if(t-bas>=fenetre&&n<2){ n++; bas=t; } } else bas=null;
        return n;
      }
    };
  }
  /* Quelle cadence viser ? économie de batterie ou « réduire les animations » → 30, sinon 60 ; 0 si l'écran est masqué. */
  const cadenceCible=({masque,economie,reduit}={})=>masque?0:(economie||reduit?30:60);
  /* Nombre de neurones de l'entité selon le niveau (mode « léger » du moteur existant = 6000). */
  const ECHELLE_ENTITE=Object.freeze([1,.7,.45]);

  /* ───── positions de Kepler ───── */
  const NIVEAUX=Object.freeze({validee:'Validée',candidate:'Candidate (en observation)',non_concluante:'Testée : non concluante',non_testee:'Idée non testée'});
  const COURT_NIVEAU=Object.freeze({validee:'Validée',candidate:'Candidate',non_concluante:'Non concluante',non_testee:'Idée non testée'});
  /* État « live » d'une proposition : en attente · entrée touchée · cible · stop · expirée. */
  function statutLive(p,maintenant){
    if(!p) return {code:'inconnu',texte:'—'};
    const now=maintenant==null?Date.now():maintenant;
    if(p.statut==='ouverte') return {code:'ouverte',texte:'Entrée touchée'};
    if(p.statut==='cloturee'&&p.resultat) return p.resultat.R>0?{code:'cible',texte:'Cible atteinte'}:{code:'stop',texte:'Stop touché'};
    if(['expiree','partie_sans_nous','refusee','perdue'].includes(p.statut)) return {code:'expiree',texte:p.statut==='partie_sans_nous'?'Partie sans nous':'Expirée'};
    if(p.tValide&&now>p.tValide) return {code:'expiree',texte:'Expirée'};
    return {code:'attente',texte:'En attente'};
  }
  const sensTexte=p=>p&&p.sens>0?'ACHAT':'VENTE';
  /* Niveaux à tracer pour une position : { entree, stop, cibles:[…], zone:[bas,haut] } */
  function niveauxPosition(p){
    if(!p) return null;
    const f=Number.isFinite;
    return {entree:f(p.limite)?p.limite:null,stop:f(p.stop)?p.stop:null,cibles:[p.cible,p.cible2].filter(f),zone:Array.isArray(p.zone)&&p.zone.every(f)?[Math.min(...p.zone),Math.max(...p.zone)]:null,sens:p.sens>0?1:-1};
  }
  /* Distance du prix actuel à l'entrée, en %. */
  const distanceEntree=(p,prix)=>(p&&Number.isFinite(p.limite)&&Number.isFinite(prix)&&prix?(p.limite-prix)/prix*100:null);

  /* ───── graphique : VWAP, POC, profil de volume (sur les bougies visibles) ─────
     bougie = [t, ouverture, haut, bas, clôture, volume?]. Le volume vient de la source (Binance) ; sans volume, rien n'est tracé. */
  function vwap(bougies){
    let pv=0,v=0; for(const b of bougies||[]){ const vol=b[5]; if(!Number.isFinite(vol)||vol<=0) continue; const tp=(b[2]+b[3]+b[4])/3; pv+=tp*vol; v+=vol; }
    return v>0?pv/v:null;
  }
  function profilVolume(bougies,cases=24){
    const l=(bougies||[]).filter(b=>Number.isFinite(b[5])&&b[5]>0); if(l.length<3) return null;
    let hi=-Infinity,lo=Infinity; for(const b of l){ if(b[2]>hi) hi=b[2]; if(b[3]<lo) lo=b[3]; }
    if(!(hi>lo)) return null;
    const pas=(hi-lo)/cases, vol=new Array(cases).fill(0);
    for(const b of l){ const tp=(b[2]+b[3]+b[4])/3, i=Math.min(cases-1,Math.max(0,Math.floor((tp-lo)/pas))); vol[i]+=b[5]; }
    let imax=0; for(let i=1;i<cases;i++) if(vol[i]>vol[imax]) imax=i;
    const max=vol[imax];
    return {bas:lo,haut:hi,pas,cases:vol.map((v,i)=>({prix:lo+(i+.5)*pas,volume:v,part:max?v/max:0})),poc:lo+(imax+.5)*pas};
  }
  /* Delta par bougie : volume acheteur agressif − vendeur. La source gratuite de bougies ne le donne que si la bougie porte un 7e champ (volume acheteur agressif). */
  function deltaBougie(b){ const vol=b[5], achat=b[6]; return Number.isFinite(vol)&&Number.isFinite(achat)?achat-(vol-achat):null; }
  const intervalleMs=tf=>({M15:900e3,H1:3600e3,H4:14400e3})[tf]||900e3;

  /* ───── courbe de capital (SVG pur) ───── */
  function courbePath(points,largeur,hauteur,marge=4){
    const p=(points||[]).filter(x=>x&&Number.isFinite(x[0])&&Number.isFinite(x[1])); if(p.length<2) return null;
    let lo=Math.min(0,...p.map(x=>x[1])), hi=Math.max(0,...p.map(x=>x[1])); if(hi===lo){ hi+=1; lo-=1; }
    const t0=p[0][0], t1=p[p.length-1][0]||t0+1, X=t=>marge+(t1>t0?(t-t0)/(t1-t0):0)*(largeur-2*marge), Y=v=>marge+(hi-v)/(hi-lo)*(hauteur-2*marge);
    const d=p.map((x,i)=>(i?'L':'M')+X(x[0]).toFixed(1)+' '+Y(x[1]).toFixed(1)).join('');
    return {d,zero:Y(0),dernier:[X(p[p.length-1][0]),Y(p[p.length-1][1])],lo,hi,fin:p[p.length-1][1],aire:d+'L'+X(t1).toFixed(1)+' '+Y(0).toFixed(1)+'L'+X(t0).toFixed(1)+' '+Y(0).toFixed(1)+'Z'};
  }
  /* Calendrier thermique : `jours` = { 'AAAA-MM-JJ': R } → grille de `semaines` colonnes × 7 lignes (lundi en haut), la plus récente à droite. Intensité −1…+1. */
  function calendrierThermique(jours,{semaines=12,fin=Date.now()}={}){
    const J=86400e3, d=new Date(fin); d.setUTCHours(0,0,0,0);
    const dow=(d.getUTCDay()+6)%7, dernierLundi=d.getTime()-dow*J;
    const cases=[]; let max=0; for(const v of Object.values(jours||{})) max=Math.max(max,Math.abs(v));
    for(let s=semaines-1;s>=0;s--) for(let k=0;k<7;k++){
      const t=dernierLundi-s*7*J+k*J, cle=new Date(t).toISOString().slice(0,10), futur=t>d.getTime(), v=jours&&Object.prototype.hasOwnProperty.call(jours,cle)?jours[cle]:null;
      cases.push({col:semaines-1-s,ligne:k,jour:cle,R:v,futur,intensite:v==null||!max?0:Math.max(-1,Math.min(1,v/max))});
    }
    return {semaines,cases,max};
  }
  /* Résultat hebdomadaire comparé à l'objectif (+1 % / +2 %). `jours` en R, `risquePct` en % du capital par R. */
  function hebdoDepuisJours(jours,risquePct,{semaines=8,fin=Date.now()}={}){
    const J=86400e3, d=new Date(fin); d.setUTCHours(0,0,0,0);
    const lundi=d.getTime()-((d.getUTCDay()+6)%7)*J, out=[];
    for(let s=semaines;s>=1;s--){ const debut=lundi-s*7*J; let R=0,n=0; for(let k=0;k<7;k++){ const c=new Date(debut+k*J).toISOString().slice(0,10); if(jours&&Object.prototype.hasOwnProperty.call(jours,c)){ R+=jours[c]; n++; } } out.push({debut,pct:+(R*risquePct).toFixed(3),jours:n,objectif1:R*risquePct>=1,objectif2:R*risquePct>=2}); }
    return out;
  }

  /* ───── stories ───── */
  const DUREE_STORY=6000;
  const prochaineCarte=(i,n)=>n?((i+1)%n):0;
  const precedenteCarte=(i,n)=>n?((i-1+n)%n):0;
  /* Quelle carte pour un geste ? dx < 0 = balayage vers la gauche = carte suivante. */
  function carteApresGeste(i,n,dx,seuil=40){ if(Math.abs(dx)<seuil) return i; return dx<0?Math.min(n-1,i+1):Math.max(0,i-1); }

  /* ───── formats ───── */
  const prix=(x,d)=>{ if(!Number.isFinite(x)) return '—'; const dec=d!=null?d:(Math.abs(x)>=1000?0:Math.abs(x)>=10?2:4); return x.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:dec}); };
  const pourcent=(x,d=1)=>Number.isFinite(x)?(x>=0?'+':'−')+Math.abs(x).toFixed(d).replace('.',',')+' %':'—';
  const R=(x,d=2)=>Number.isFinite(x)?(x>=0?'+':'−')+Math.abs(x).toFixed(d).replace('.',',')+' R':'—';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ───── version de l'application (bannière « Nouvelle version disponible ») ───── */
  const versionPlusRecente=(actuelle,distante)=>!!distante&&String(distante)!==String(actuelle);

  /* ───── commandes vocales : équivalents mobiles ───── */
  /* Demande → écran mobile. Renvoie { ecran, feuille? } ou null (la phrase est pour l'agent). Sert au routage et à la documentation (docs/APPAREILS.md). */
  function routeCommande(texte){
    const t=' '+String(texte||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,' ').replace(/\s+/g,' ').trim()+' ';
    const a=re=>re.test(t);
    if(a(/ (la )?galaxie | mode galaxie /)) return {ecran:'galaxie-refus'};
    if(a(/ (ouvre|affiche|montre|va sur|vas sur|mets?) (moi )?(l |le |la |les )?(agent|kepler|positions?|bilan)/)||a(/ positions du jour /)||a(/ (ouvre|affiche|montre) (moi )?(les )?agents? (de )?trading/)) return {ecran:'agent'};
    if(a(/ (ouvre|affiche|montre|lance) (moi )?(le )?terminal/)) return {ecran:'terminal'};
    if(a(/ (donne|lis|presente|affiche|montre)( moi)? (l |les )?(actualites?|infos?|news|nouvelles)/)||a(/ (l )?actualite(s)? (en|de|du|sur) /)||a(/ les infos /)||a(/ actus /)) return {ecran:'actus'};
    if(a(/ (ouvre|affiche|montre)( moi)? (la )?carte/)) return {ecran:'carte'};
    if(a(/ (ouvre|affiche|montre)( moi)? (les )?(reglages|parametres)/)) return {ecran:'reglages'};
    return null;
  }

  const api={ONGLETS,ECRANS,age,miseAJour,DELAIS_REESSAI,delaiReessai,decisionCache,messageErreur,suivreImages,cadenceCible,ECHELLE_ENTITE,NIVEAUX,COURT_NIVEAU,statutLive,sensTexte,niveauxPosition,distanceEntree,
    vwap,profilVolume,deltaBougie,intervalleMs,courbePath,calendrierThermique,hebdoDepuisJours,DUREE_STORY,prochaineCarte,precedenteCarte,carteApresGeste,prix,pourcent,R,esc,versionPlusRecente,routeCommande};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.MobileCalcul=api;
})(typeof window!=='undefined'?window:globalThis);
