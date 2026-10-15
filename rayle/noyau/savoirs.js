"use strict";
  /* ═════════════ SAVOIRS : MÉTÉO · ACTUALITÉS · WIKIPÉDIA · MDN · ÉTUDES · MÉDICAMENTS · SENTIMENT ═════════════ */
  const METEO_RE=/meteo|quel temps|le temps (qu'|de |demain|aujourd)|temperature|il (fait|va faire) (chaud|froid|beau|frais|doux|gris|lourd)|il (va )?pleu|pluie|neige|neiger|orage|parapluie|\bvent\b|canicule|verglas|brouillard|humidite|lever du soleil|coucher du soleil|qualite de l'air|pollution|\buv\b|indice uv/;
  const NEWS_RE=/actualite|\bactus?\b|les nouvelles|\binfos?\b(?! sur)|titres|a la une|que se passe|qu'?est[- ]ce qui se passe|quoi de neuf|journal|presse|derniere heure|breaking|flash info/;
  const BRIEF_RE=/(briefing|brief du|point du matin|resume (de la )?(journee|matinee|du jour)|programme (de la journee|du jour)|bilan du jour|bulletin)/;
  const WIKI_RE=/wikipedia|encyclopedie|qu'?est[- ]ce (que|qu')|c'?est quoi|c'?est qui|qui (est|etait|sont)|\bdefinition\b|definis|parle[- ]moi de|explique[- ]moi|que sais[- ]tu sur|histoire de|biographie|origine de|capitale de|combien d'?habitants|ou se trouve|en quelle annee/;
  const ANATO_RE=/anatomi|orthop|\bos\b|osseu|articulation|ligament|tendon|muscle|musculaire|cartilage|menisque|fracture|entorse|luxation|tendinite|tendinopathie|arthrose|arthrite|hernie discale|vertebre|colonne vertebrale|rachis|scoliose|genou|epaule|hanche|cheville|coude|poignet|rotule|femur|tibia|perone|humerus|radius|cubitus|clavicule|omoplate|bassin|sacrum|sciatique|lombalgie|prothese|orthese|platre|reeducation|biomecanique|coiffe des rotateurs|croise|achille|fascia|aponevrose|canal carpien|osteoporose|amputation|moignon|emboiture|attelle|corset|semelle|hallux|pied plat|nerf|innervation|physiologie|pathologie/;
  const ANATO_ASK_RE=/anatomi|role|fonction|structure|insertion|innervation|vascularisation|composition|difference|qu'?est[- ]ce|c'?est quoi|explique|definition|schema|description|mecanisme|biomecanique|comment (marche|fonctionne)|a quoi sert|origine|terminaison|action/;
  const STUDY_RE=/(etudes?|publications?|articles? scientifiques?|pubmed|litterature|meta[- ]analyse|essais? cliniques?|recherches? (scientifiques?|medicales?)|donnees probantes|niveau de preuve)/;
  const MED_RE=/medical|sante|therapeut|traitement|chirurg|reeducation|douleur|pathologie|blessure|maladie/;
  const DRUG_RE=/\b(medicaments?|effets? (?:secondaires?|indesirables?)|contre[- ]indications?|notice|molecule|interactions? medicamenteuses?)\b/;
  const SENT_RE=/sentiment|peur et (?:cupidite|avidite)|fear (?:and|&) greed|panique du marche|euphorie|dominance|capitalisation (?:crypto|totale)/;
  const CODE_RE=/\b(html5?|css3?|javascript|js|typescript|balises?|flexbox|grid|selecteurs?|dom|svg|canvas|responsive|media quer(y|ies)|aria|accessibilite|api web|fetch|promesses?|async|await|localstorage|service worker|pwa|json|regex|expressions? regulieres?|framework|react|vue|node)\b|\b(en|du|le|un|ce|mon|ton) code\b|coder\b|programmat|developpe(r|ment) web|site web|page web/;

  const STOP_WORDS=/\b(rayle|dis|dites|moi|toi|peux|peut|pouvez|tu|vous|explique|expliquez|parle|parlez|cherche|cherchez|recherche|recherches|trouve|trouvez|donne|donnez|montre|montrez|wikipedia|encyclopedie|definition|definis|definir|sais|savoir|que|qui|quoi|quel|quelle|quels|quelles|est|sont|etait|etaient|ce|ca|cela|propos|sujet|sur|de|du|des|la|le|les|un|une|et|en|dans|pour|plus|stp|svp|il|plait|veux|voudrais|aimerais|faire|fait|comment|fonctionne|exactement|vraiment|precisement|role|fonction|fonctions|description|mecanisme|rapidement|simplement|bref|rapide|resume|detail|details|autre|autres|aussi|encore|alors|bon|ok|oui|non|merci)\b/g;
  function topicOf(text,extraStop){
    let s=norm(text).replace(/[?!.,;:«»"]/g,' ').replace(/-/g,' ');
    s=s.replace(/\b(?:[ldjmtcsn]|qu)'/g,' ');
    s=s.replace(STOP_WORDS,' ');
    if(extraStop) s=s.replace(extraStop,' ');
    return s.replace(/\s+/g,' ').trim().slice(0,80);
  }

  const NOT_CITY=/^(semaine|journee|jour|soiree|matinee|nuit|weekend|week-end|region|moment|ville|maison|chez moi|ici|plu|fait|faire|neige|pleuvoir|venir|etre|beau|chaud|froid)$/;
  function cityOf(text){
    const t=String(text||'').replace(/[?!.,;:]/g,' ');
    const cap1="[A-ZÀ-ÖØ-Þ][\\p{L}'’]*(?:-[\\p{L}']+)*";
    const re1=new RegExp("(?:^|\\s)(?:à|au|aux|en|pour|dans|sur|de|du|des|vers)\\s+(?:l[ae]s?\\s+)?("+cap1+"(?:\\s+"+cap1+")*)","u");
    const m1=t.match(re1);
    if(m1){ const c=m1[1].trim(); if(!NOT_CITY.test(norm(c)) && !/^Raylé$/i.test(c)) return c; }
    let n=' '+norm(t)+' ';
    n=n.replace(/\b(aujourd'?hui|demain|apres[- ]demain|ce (soir|matin|midi|week[- ]?end)|cet apres[- ]midi|cette (nuit|semaine|journee|apres[- ]midi)|en ce moment|maintenant|actuellement|la semaine prochaine|matin|soir|midi|nuit|stp|svp|merci|rayle|s'?il (te|vous) plait)\b/g,' ');
    const m2=n.match(/\b(?:meteo|temps)\s+(?:a|au|aux|en|pour|de|du|dans|sur)\s+([a-z][a-z' \-]{1,30}?)\s*$/);
    if(m2){ const c=m2[1].trim(); if(c.length>=2 && !NOT_CITY.test(c.replace(/^(le|la|les|l')\s*/,''))) return c; }
    return '';
  }

  const NEWS_LAB={fr:'France',monde:'monde',eco:'économie',tech:'tech',sport:'sport',science:'sciences',sante:'santé',crypto:'crypto'};
  function newsCats(n){
    const cats=[];
    if(/\b(france|francaises?|francais|national|nationales?|pays)\b/.test(n)) cats.push('fr');
    if(/\b(monde|mondiales?|international|internationales?|etranger|planete|geopolitique|guerre)\b/.test(n)) cats.push('monde');
    if(/\b(economie|economiques?|bourse|finance|financieres?|banque|inflation|entreprises?)\b/.test(n)) cats.push('eco');
    if(/\b(tech|techno|technologie|high[- ]tech|numerique|intelligence artificielle|\bia\b|smartphone|informatique)\b/.test(n)) cats.push('tech');
    if(/\b(sport|sports|foot|football|rugby|tennis|basket|formule 1|f1|cyclisme)\b/.test(n)) cats.push('sport');
    if(/\b(science|sciences|scientifiques?|espace|astronomie|climat)\b/.test(n)) cats.push('science');
    if(/\b(sante|medical|medecine|hopital)\b/.test(n)) cats.push('sante');
    if(/\b(crypto|cryptos|cryptomonnaies?|blockchain)\b/.test(n)) cats.push('crypto');
    return cats.length?cats.slice(0,3):['fr','monde'];
  }
  // « les infos sur Nvidia », « quoi de neuf à propos de la Fed »
  function newsQuery(text){
    const n=norm(text).replace(/[?!.,;:]/g,' ');
    const m=n.match(/(?:actualites?|actus?|infos?|informations|nouvelles|news|quoi de neuf|du nouveau)\s+(?:sur|concernant|a propos de|au sujet de|autour de)\s+(?:l'|le |la |les |du |des )?(.{2,60})$/);
    if(!m) return null;
    const q=m[1].replace(/\b(stp|svp|s'il (?:te|vous) plait|aujourd'hui|cette semaine|en ce moment|rayle)\b/g,' ').replace(/\s+/g,' ').trim();
    return q.length>=2?q:null;
  }

  function agoTxt(t){
    if(!t) return '';
    const m=Math.round((Date.now()-t)/60000);
    if(m<2) return "à l'instant";
    if(m<60) return 'il y a '+m+' min';
    const h=Math.round(m/60);
    return h<48 ? 'il y a '+h+' h' : 'il y a '+Math.round(h/24)+' j';
  }
  const rnd=v=>v==null?'?':Math.round(v);
  const hmIso=iso=>new Date(iso).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).replace(':','h');
  function jourLabel(dateStr){
    const tz='Europe/Paris';
    const today=new Date().toLocaleDateString('fr-CA',{timeZone:tz});
    const demain=new Date(Date.now()+86400000).toLocaleDateString('fr-CA',{timeZone:tz});
    if(dateStr===today) return "aujourd'hui";
    if(dateStr===demain) return 'demain';
    return new Date(dateStr+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long'});
  }

  // ── Météo ──
  function meteoText(d){
    const a=d.actuel||{};
    let s='MÉTÉO EN DIRECT ('+d.ville+(d.region?', '+d.region:'')+(d.pays?', '+d.pays:'')+' ; '+(d.source||'Open-Meteo')+', mise à jour '+hmIso(d.maj)+') : '
      +'maintenant '+rnd(a.temp)+' °C (ressenti '+rnd(a.ressenti)+' °C), '+a.ciel+', humidité '+rnd(a.humidite)+' %, vent '+rnd(a.vent)+' km/h (rafales '+rnd(a.rafales)+' km/h)'
      +(a.pluie>0?', pluie '+a.pluie+' mm sur la dernière heure':'')+'. ';
    if(Array.isArray(d.heures) && d.heures.length) s+='Prochaines heures : '+d.heures.filter((x,i)=>i%2===0).map(h=>h.heure+' '+rnd(h.temp)+' °C '+h.ciel+(h.proba_pluie!=null?' pluie '+h.proba_pluie+' %':'')).join(', ')+'. ';
    if(d.air && d.air.indice_europeen!=null) s+="Qualité de l'air "+d.air.qualite+' (indice européen '+d.air.indice_europeen+', PM2,5 '+d.air.pm25+'). ';
    s+='Prévisions : '+(d.jours||[]).map(j=>jourLabel(j.date)+' '+j.ciel+', de '+rnd(j.tmin)+' à '+rnd(j.tmax)+' °C, pluie '+(j.pluie_mm!=null?j.pluie_mm+' mm':'?')
      +(j.proba_pluie!=null?' (risque '+j.proba_pluie+' %)':'')+', vent max '+rnd(j.vent_max)+' km/h'+(j.uv_max!=null?', UV max '+rnd(j.uv_max):'')+', soleil de '+String(j.lever).slice(11,16).replace(':','h')+' à '+String(j.coucher).slice(11,16).replace(':','h')).join(' ; ')+'.';
    if(d.perime) s+=' (attention : ancienne copie, la source ne répond plus)';
    return s;
  }
  function meteoSpeech(d){
    const a=d.actuel||{}, j0=(d.jours||[])[0], j1=(d.jours||[])[1];
    let s='À '+d.ville+', il fait '+rnd(a.temp)+' degrés, '+a.ciel+'.';
    if(j0) s+=" Aujourd'hui, de "+rnd(j0.tmin)+' à '+rnd(j0.tmax)+' degrés'+(j0.proba_pluie>=40?', avec un risque de pluie de '+j0.proba_pluie+' pour cent':'')+'.';
    if(j1) s+=' Demain, '+j1.ciel+', de '+rnd(j1.tmin)+' à '+rnd(j1.tmax)+' degrés.';
    return s;
  }
  // Plusieurs villes possibles : « entre Viane et Castres », « à Toulouse et à Albi »
  const PAS_VILLE=/^(rayle|justin|je|tu|il|elle|on|nous|vous|est|quel|quelle|quels|quelles|bonjour|bonsoir|salut|hey|dis|ok|merci|meteo|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd'hui|ce|cet|cette|la|le|les|et|ou|peux|pourrais|fais|donne|alors|bon)$/;
  function citiesOf(text){
    const t=String(text||'').normalize('NFC').replace(/[?!.,;:«»"]/g,' ').replace(/\s+/g,' ').trim();
    const mots=t.split(' ');
    const LIENS=/^(sur|sous|en|de|la|le|les|lès|d'|du|saint|sainte)$/i;
    const estMaj=w=>/^[A-ZÀ-ÖØ-Þ]/.test(w) && !PAS_VILLE.test(norm(w).replace(/[-'’].*$/,''));
    const out=[];
    for(let i=1;i<mots.length;i++){           // le premier mot est en majuscule par simple début de phrase
      if(!estMaj(mots[i])) continue;
      let k=i, nom=[mots[i]];
      while(k+2<mots.length && LIENS.test(mots[k+1]) && estMaj(mots[k+2])){ nom.push(mots[k+1],mots[k+2]); k+=2; }
      if(k+1<mots.length && estMaj(mots[k+1])){ nom.push(mots[k+1]); k++; }
      out.push(nom.join(' ')); i=k;
    }
    if(!out.length){
      // Dictée sans majuscules : « météo à toulouse et albi »
      const old=cityOf(text);
      if(old) old.split(/\s+(?:et|ou)\s+(?:a\s+|au\s+)?/).map(x=>x.replace(/^(?:entre|a|au|de|du|pour)\s+/,'').trim()).filter(x=>x.length>=2).forEach(x=>out.push(x));
    }
    return [...new Set(out)].slice(0,3);
  }
  async function meteoUneVille(ville,live,stamp){
    try{
      const d=await wjson('/meteo'+(ville?'?ville='+encodeURIComponent(ville):''),18000);
      if(stamp!==epoch) return '';
      live.extra.push(meteoSpeech(d)); pn(montrerMeteo,d);
      return meteoText(d);
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Météo ('+(ville||'ville par défaut')+') : '+errMsg(e));
      return /introuvable/.test(errMsg(e))
        ? 'MÉTÉO : la ville « '+ville+" » n'a pas été trouvée (peut-être mal entendue). Dis-le à Justin et propose-lui de répéter le nom ; ne l'invente pas."
        : "MÉTÉO EN DIRECT pour "+(ville||'la ville par défaut')+" : indisponible ("+errMsg(e)+"). Ne l'invente pas.";
    }
  }
  async function ctxMeteo(text,live,stamp){
    const villes=citiesOf(text);
    addLine('sys','Météo : lecture '+(villes.length?villes.join(' + '):'ville par défaut')+'…');
    const outs=await Promise.all((villes.length?villes:['']).map(v=>meteoUneVille(v,live,stamp)));
    if(stamp!==epoch) return '';
    return outs.filter(Boolean).join('\n')+(villes.length>1?'\nJustin demande plusieurs villes : compare-les brièvement (températures, pluie), sans tout lire.':'');
  }

  // ── Actualités ──
  function newsBloc(titre,d,lim,live,lab){
    const items=(d.items||[]).slice(0,lim);
    if(!items.length) return 'ACTUALITÉS EN DIRECT ('+titre+') : aucun article récupéré.';
    pn(montrerActus,lab||titre,d);
    live.extra.push((lab?'Côté '+lab+', à la une : ':'À ce sujet : ')+items.slice(0,3).map(x=>x.titre).join(' ; ')+'.');
    return 'ACTUALITÉS EN DIRECT ('+titre+' ; sources : '+(d.sources||[]).join(', ')+(d.perime?' ; ancienne copie, les sources ne répondent plus':'')+') :\n'
      +items.map(x=>'- '+x.titre+' ('+x.source+(x.t?', '+agoTxt(x.t):'')+')'+(x.resume?' : '+x.resume.slice(0,130):'')).join('\n');
  }
  async function ctxNews(n,live,stamp,brief){
    const cats=newsCats(n); const lim=brief?4:6;
    addLine('sys','Actualités : lecture '+cats.map(c=>NEWS_LAB[c]).join(' + ')+'…');
    const outs=await Promise.all(cats.map(async c=>{
      try{
        const d=await wjson('/actus?cat='+c,25000);
        if(stamp!==epoch) return '';
        return newsBloc(NEWS_LAB[c],d,lim,live,NEWS_LAB[c]);
      }catch(e){
        if(stamp!==epoch) return '';
        addLine('sys','Actualités ('+NEWS_LAB[c]+') : '+errMsg(e));
        return 'ACTUALITÉS EN DIRECT ('+NEWS_LAB[c]+") : indisponibles ("+errMsg(e)+"). Ne les invente pas.";
      }
    }));
    return outs.filter(Boolean).join('\n');
  }
  async function ctxNewsQuery(q,live,stamp){
    addLine('sys','Actualités : recherche « '+q+' » (7 derniers jours)…');
    try{
      const d=await wjson('/actus?q='+encodeURIComponent(q),20000);
      if(stamp!==epoch) return '';
      return newsBloc('recherche « '+q+' », 7 derniers jours',d,8,live,'');
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Actualités : '+errMsg(e));
      return 'ACTUALITÉS EN DIRECT sur « '+q+' » : indisponibles ('+errMsg(e)+'). Ne les invente pas.';
    }
  }

  // ── Wikipédia ──
  async function ctxWiki(text,live,stamp,long){
    const q=topicOf(text); if(q.length<3) return '';
    addLine('sys','Wikipédia : recherche « '+q+' »'+(long?' (article détaillé)':'')+'…');
    try{
      const d=await wjson('/wiki?q='+encodeURIComponent(q)+(long?'&long=1':''),18000);
      if(stamp!==epoch) return '';
      const r=(d.resultats||[]).slice(0,2);
      if(!r.length) return 'EXTRAITS WIKIPÉDIA : aucun résultat pour « '+q+' ».';
      pn(montrerWiki,q,r);
      live.extra.push("D'après Wikipédia, "+r[0].extrait.split(/(?<=[.!?])\s/).slice(0,2).join(' ').slice(0,420));
      return 'EXTRAITS WIKIPÉDIA (recherche « '+q+' » ; si un extrait est hors sujet, ignore-le) :\n'
        +r.map((x,i)=>'- '+x.titre+(x.description?' ('+x.description+')':'')+(x.langue==='en'?' [en anglais]':'')+' : '+x.extrait.slice(0,i===0&&long?3500:650)).join('\n');
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Wikipédia : '+errMsg(e));
      return 'EXTRAITS WIKIPÉDIA : indisponibles ('+errMsg(e)+"). Réponds avec tes connaissances en précisant que tu n'as pas pu vérifier.";
    }
  }

  // ── Documentation MDN ──
  async function ctxMdn(text,live,stamp){
    const q=topicOf(text,/\b(code|coder|ecris|ecrire|ecrivez|cree|creer|genere|generer|exemple|exemples|syntaxe|utiliser|utilise|marche|programmation)\b/g);
    if(q.length<2) return '';
    addLine('sys','MDN : recherche « '+q+' »…');
    try{
      const d=await wjson('/mdn?q='+encodeURIComponent(q),15000);
      if(stamp!==epoch) return '';
      const r=(d.resultats||[]).slice(0,3);
      if(!r.length) return '';
      return 'DOCUMENTATION MDN (référence officielle ; si elle ne répond pas à la question, utilise tes connaissances) :\n'
        +r.map(x=>'- '+x.titre+(x.langue==='en-US'?' [en anglais]':'')+' : '+x.resume).join('\n');
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','MDN : '+errMsg(e));
      return '';
    }
  }

  // ── Études scientifiques ──
  async function ctxSante(text,live,stamp){
    const q=topicOf(text,/\b(etudes?|publications?|articles?|scientifiques?|litterature|pubmed|meta|analyse|essais?|cliniques?|medicales?|donnees|probantes|niveau|preuve)\b/g);
    if(q.length<3) return '';
    addLine('sys','Études scientifiques : recherche « '+q+' »…');
    try{
      const d=await wjson('/sante?q='+encodeURIComponent(q),20000);
      if(stamp!==epoch) return '';
      const r=(d.resultats||[]).slice(0,3);
      if(!r.length) return 'ÉTUDES SCIENTIFIQUES : aucune étude trouvée pour « '+q+' ».';
      pn(montrerEtudes,q,r);
      live.extra.push("J'ai trouvé "+r.length+" études sur le sujet, dont : "+r[0].titre.slice(0,160)+(r[0].annee?', publiée en '+r[0].annee:'')+'.');
      return 'ÉTUDES SCIENTIFIQUES (Europe PMC, en anglais, à résumer en français ; littérature scientifique, pas un avis médical) :\n'
        +r.map(x=>'- '+x.titre+' ('+(x.revue||'revue inconnue')+(x.annee?', '+x.annee:'')+(x.citations?', citée '+x.citations+' fois':'')+')'+(x.resume?' : '+x.resume.slice(0,330):'')).join('\n');
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Études : '+errMsg(e));
      return 'ÉTUDES SCIENTIFIQUES : indisponibles ('+errMsg(e)+"). Ne les invente pas.";
    }
  }

  // ── Médicaments ──
  async function ctxMedicament(text,live,stamp){
    const q=topicOf(text,/\b(medicaments?|effets?|secondaires?|indesirables?|contre|indications?|notice|molecule|interactions?|medicamenteuses?|prendre|pris|prends|danger|dangereux)\b/g);
    if(q.length<3) return '';
    addLine('sys','Médicament : recherche « '+q+' »…');
    try{
      const d=await wjson('/medicament?q='+encodeURIComponent(q),15000);
      if(stamp!==epoch) return '';
      const r=(d.resultats||[])[0];
      if(!r) return 'MÉDICAMENT : aucune notice trouvée pour « '+q+' » dans la base américaine. Réponds avec tes connaissances générales en le précisant.';
      pn(montrerMedicament,r,d.source);
      return 'MÉDICAMENT (notice officielle '+d.source+' ; résume en français, sans posologie personnalisée) : '+r.nom+(r.marques_usa&&r.marques_usa.length?' (marques américaines : '+r.marques_usa.join(', ')+')':'')
        +(r.indications?'\nIndications : '+r.indications:'')+(r.contre_indications?'\nContre-indications : '+r.contre_indications:'')
        +(r.mises_en_garde?'\nMises en garde : '+r.mises_en_garde:'')+(r.effets_indesirables?'\nEffets indésirables : '+r.effets_indesirables:'')
        +(r.interactions?'\nInteractions : '+r.interactions:'')+(r.mecanisme?'\nMécanisme : '+r.mecanisme:'');
    }catch(e){
      if(stamp!==epoch) return '';
      addLine('sys','Médicament : '+errMsg(e));
      return 'MÉDICAMENT : base indisponible ('+errMsg(e)+'). Réponds avec tes connaissances générales en le précisant.';
    }
  }

  // ── Sentiment de marché ──
  async function ctxSentiment(live,stamp){
    addLine('sys','Sentiment de marché : lecture…');
    try{
      const d=await wjsonCache('/sentiment',15000,600000);
      if(stamp!==epoch) return '';
      const a=d.actions_peur_avidite||{}, c=d.crypto_peur_avidite||{}, g=d.crypto_global||{};
      pn(montrerSentiment,d);
      const p=[];
      if(a.score!=null) p.push('actions (CNN) : '+a.score+' sur 100, '+a.etat+(a.veille!=null?', la veille '+a.veille:'')+(a.semaine_derniere!=null?', il y a une semaine '+a.semaine_derniere:''));
      if(c.score!=null) p.push('crypto : '+c.score+' sur 100, '+c.etat+(c.veille!=null?', la veille '+c.veille:''));
      if(g.dominance_btc!=null) p.push('dominance du Bitcoin '+fmtNum(g.dominance_btc,1)+' %, Ethereum '+fmtNum(g.dominance_eth,1)+' %, capitalisation crypto totale '+fmtNum(g.capitalisation_totale_milliards,0)+' milliards de dollars'+pctTxt(g.variation_24h_pct)+' sur 24 h');
      if(c.score!=null) live.extra.push("L'indice de peur et d'avidité crypto est à "+c.score+', '+c.etat+'.');
      return p.length ? 'SENTIMENT DE MARCHÉ (indices de peur et d\'avidité : 0 = peur extrême, 100 = avidité extrême) : '+p.join(' ; ')+'.' : 'SENTIMENT DE MARCHÉ : indisponible.';
    }catch(e){
      if(stamp!==epoch) return '';
      return 'SENTIMENT DE MARCHÉ : indisponible ('+errMsg(e)+').';
    }
  }

  /* ═════════════ QUESTIONS SUR ELLE-MÊME ═════════════ */
  const SELF_RE=/\b(toi[- ]meme|tes (?:limites|capacites|fonctions|fonctionnalites|outils|commandes|points faibles|defauts|competences)|ce que tu (?:sais|peux) faire|tu sais faire quoi|tu peux faire quoi|qu'?est[- ]ce que tu (?:sais|peux) faire|t'?ameliorer|ameliore chez toi|te rendre (?:plus )?(?:performante?|forte?|intelligente?)|qui es[- ]tu|presente[- ]toi|comment tu fonctionnes|ton fonctionnement|tes commandes vocales)\b/;
