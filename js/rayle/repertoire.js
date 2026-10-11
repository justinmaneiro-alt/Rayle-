"use strict";
  /* ═════════════ RÉPERTOIRE, MESSAGES ET APPELS (phase 4A) : Raylé prépare, Justin envoie ═════════════
     « Raylé, ajoute Maman au 06 12 34 56 78 », « qui est dans mon répertoire ? », « supprime Maman du répertoire »,
     « envoie à Maman que je rentre vers 19 h » (par SMS, par mail, sur le téléphone), « appelle Maman » (sur WhatsApp).
     • Raylé ne lit JAMAIS les messages reçus (aucun accès sans API payante) et n'envoie JAMAIS rien elle-même :
       elle rédige, affiche, lit, puis demande « je l'ouvre dans WhatsApp ? ». « Oui » (ou un toucher sur le bouton) ouvre
       l'application avec le texte prêt (wa.me, sms:, mailto:, tel:) ; c'est Justin qui appuie sur Envoyer ou sur Appeler.
     • Le répertoire est dans la base D1 du Worker (/repertoire, appareil appairé obligatoire). Les numéros ne partent jamais
       vers une IA : /message/rediger ne reçoit que le NOM du contact, et les numéros dictés sont masqués avant l'agent (masquer()).
     • Depuis le PC ou la tablette : « … sur le téléphone » passe par les commandes entre appareils (phase 3A) ;
       le téléphone affiche le message prêt, et il faut encore y toucher « Ouvrir ».
     • Réglages : liste, ajout, modification, suppression, import du sélecteur de contacts d'Android (Contact Picker API),
       et le widget d'écran d'accueil (jeton séparé, lecture seule) pour KWGT. */

  const RayleRepertoire=(function(){
    const n2=t=>String(t==null?'':t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/['’\-]/g,' ').replace(/[^a-z0-9@+. ]/g,' ').replace(/\s+/g,' ').trim();
    const nn=t=>n2(t).replace(/[@+.]/g,' ').replace(/\s+/g,' ').trim();
    const majuscule=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);

    /* ── Numéros et adresses ── */
    // « 06 12 34 56 78 », « 0033 6… », « +33 (0)6… », « 6 12 34 56 78 » → « +33612345678 » ; '' si ce n'est pas un numéro
    function numero(s){
      let t=String(s||'').replace(/\(0\)/g,'').replace(/[^\d+]/g,'');
      if(t.startsWith('00')) t='+'+t.slice(2);
      if(!t.startsWith('+')){
        if(/^0[1-9]\d{8}$/.test(t)) t='+33'+t.slice(1);
        else if(/^[67]\d{8}$/.test(t)) t='+33'+t;
        else return '';
      }
      t='+'+t.slice(1).replace(/\+/g,'');
      if(/^\+330\d{9}$/.test(t)) t='+33'+t.slice(4);
      return /^\+[1-9]\d{7,14}$/.test(t)?t:'';
    }
    // « +33612345678 » → « 06 12 34 56 78 » (France) ; sinon tel quel
    function lisible(num){
      const m=/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(num||'');
      return m?'0'+m[1]+' '+m[2]+' '+m[3]+' '+m[4]+' '+m[5]:String(num||'');
    }
    // affiché dans un panneau (qui peut partir vers un autre appareil) : seulement les deux derniers chiffres
    const masque=num=>{ const l=lisible(num); return l ? l.replace(/\d(?=[\d ]{3})/g,'•') : ''; };
    const NUM_RE=/(?:\+|\b00)\s?\d(?:[\s.\-]?\d){7,14}\b|\b0[1-9](?:[\s.\-]?\d{2}){4}\b/g;
    const MAIL_RE=/[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/gi;
    // Avant tout envoi à une IA : numéros et adresses masqués
    const masquer=t=>String(t==null?'':t).replace(NUM_RE,'[numéro]').replace(MAIL_RE,'[adresse]');
    const NUM_DANS=/(?:\+|00)?\s?\d[\d\s.\-()]{6,}\d/;
    // « jean point dupont arobase gmail point com » → « jean.dupont@gmail.com »
    function mailDicte(s){
      const t=String(s||'').toLowerCase().replace(/\s+(?:arobase|arrobase|at)\s+/g,'@').replace(/\s+(?:point|dot)\s+/g,'.')
        .replace(/\s+(?:tiret bas|underscore)\s+/g,'_').replace(/\s+tiret\s+/g,'-').replace(/\s*@\s*/g,'@').replace(/\s*\.\s*(?=[a-z])/g,'.');
      const m=t.match(/[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}/);
      return m?m[0].replace(/[.,;!?]+$/,''):'';
    }

    /* ── Liens d'ouverture (rien n'est envoyé : l'appli s'ouvre avec le texte prêt) ── */
    const chiffres=num=>String(num||'').replace(/\D/g,'');
    const lienWhatsApp=(num,texte)=>'https://wa.me/'+chiffres(num)+(texte?'?text='+encodeURIComponent(texte):'');
    const lienSms=(num,texte)=>'sms:'+num+(texte?'?body='+encodeURIComponent(texte):'');
    const lienMail=(adr,texte)=>'mailto:'+adr+(texte?'?body='+encodeURIComponent(texte):'');
    const lienTel=num=>'tel:'+num;
    function lien(canal,c,texte){
      if(canal==='sms') return c.numero?lienSms(c.numero,texte):'';
      if(canal==='mail') return c.email?lienMail(c.email,texte):'';
      if(canal==='telephone') return c.numero?lienTel(c.numero):'';
      return c.numero?lienWhatsApp(c.numero,texte):'';
    }
    const NOM_CANAL={whatsapp:'WhatsApp',sms:'les SMS',mail:'le mail',telephone:'le téléphone'};
    const BOUTON_CANAL={whatsapp:'Ouvrir dans WhatsApp',sms:'Ouvrir dans les SMS',mail:'Ouvrir le mail',telephone:'Appeler'};

    /* ── Trouver un contact : nom, surnom, « ma mère » ↔ « Maman »… ── */
    const SYNONYMES=[['maman','mere','ma mere','mom','mama','m man','ma maman','ma maman cherie'],['papa','pere','mon pere','pap','pa','mon papa'],
      ['frere','mon frere','frerot','mon frerot'],['soeur','ma soeur','sister','ma sista','soeurette'],['mamie','grand mere','ma grand mere','mami','ma mamie'],
      ['papi','grand pere','mon grand pere','papy','mon papi','mon papy'],['tonton','oncle','mon oncle','mon tonton'],['tata','tante','ma tante','ma tata'],
      ['cheri','mon cheri','mon coeur','ma cherie','cherie','bebe','mon bebe','ma copine','mon copain']];
    const DET=/^(?:le|la|l|les|mon|ma|mes|ton|ta|a|au)\s+/;
    function formes(t){
      const n=nn(t), sans=n.replace(DET,'');
      const f=new Set([n,sans]);
      for(const g of SYNONYMES) if(g.includes(n)||g.includes(sans)) g.forEach(x=>f.add(x));
      return f;
    }
    function trouver(liste,demande){
      const n=nn(demande); if(!n) return null;
      const l=liste||[];
      const sans=n.replace(DET,'');
      const exact=l.find(c=>nn(c.nom)===n || nn(c.nom)===sans || (c.surnoms||[]).some(s=>nn(s)===n || nn(s)===sans));
      if(exact) return exact;
      const f=formes(n);
      const syn=l.filter(c=>[c.nom].concat(c.surnoms||[]).some(s=>{ const g=formes(s); for(const x of f) if(x.length>1 && g.has(x)) return true; return false; }));
      if(syn.length===1) return syn[0];
      // prénom seul : « Lucas » pour « Lucas Martin » (un seul candidat)
      const prenom=l.filter(c=>nn(c.nom).split(' ')[0]===sans);
      return prenom.length===1?prenom[0]:null;
    }
    // Le plus long début de « reste » qui désigne un contact → {contact, nom, suite}
    function debutContact(reste,liste){
      const mots=String(reste||'').trim().split(/\s+/);
      for(let k=Math.min(6,mots.length);k>=1;k--){
        const nom=mots.slice(0,k).join(' ').replace(/[,:;.!?]+$/,'');
        const c=trouver(liste,nom);
        if(c) return {contact:c,nom,suite:mots.slice(k).join(' ')};
      }
      return null;
    }

    /* ── Brouillon local (si l'IA ne répond pas) : la phrase de Justin, proprement ── */
    function brouillonLocal(t){
      let s=String(t||'').trim().replace(/^(?:que|qu['’])\s*/i,'').replace(/\s+/g,' ');
      if(!s) return '';
      s=majuscule(s);
      return /[.!?…)]$/.test(s)?s:s+'.';
    }

    /* ── Comprendre la phrase ── */
    const POLI=/^(?:(?:est[\s-]ce que tu peux|est[\s-]ce que tu pourrais|tu peux|tu pourrais|peux[\s-]tu|pourrais[\s-]tu|s['’]il te pla[iî]t|stp)[\s,]+)?/i;
    const CANAL_RE=/(?:^|\s)(?:par|en|sur|via|avec)\s+(?:un\s+|une\s+|le\s+|les\s+)?(sms|textos?|whats\s?app|watsap|watsapp|e[\s-]?mails?|mails?|courriels?)(?=$|[\s,.!?:])/i;
    const canalDe=m=>/sms|texto/i.test(m)?'sms':/mail|courriel/i.test(m)?'mail':'whatsapp';
    const APPAREIL_RE=/\s+(?:sur|vers|depuis|dans)\s+(?:le|mon|ton|l['’])\s*(?:t[ée]l[ée]phone|t[ée]l|portable|mobile|smartphone)\s*[.!?]*$/i;
    const URGENCES=/^(?:(?:les?|la|l['’])\s*)?(?:15|17|18|112|114|115|119|samu|pompiers?|police|gendarmerie|secours|urgences?)\b/i;

    function analyser(texte,liste){
      let o=String(texte||'').replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'').trim();
      const n=n2(o);
      if(!n) return null;
      // Lire les messages reçus : jamais (réponse honnête)
      if(/\b(?:lis|lire|lit|relis|consulte|consulter|verifie|verifier|regarde|regarder|checke?|montre|affiche|ouvre)\b(?:\s+moi)?\s+(?:mes|mon|les|le|ma)\s+(?:derniers?\s+|nouveaux?\s+)?(?:messages?|sms|textos?|whatsapp|mails?|e mails?|courriels?|boite mail|boite de reception|notifications?|conversations?)\b/.test(n)
        || /\b(?:j ai|ai je|est ce que j ai|y a t il|il y a)\s+(?:des|un|de|du)\s+(?:nouveaux?\s+|nouvelles?\s+)?(?:messages?|sms|textos?|mails?|whatsapp)\b/.test(n)
        || /\bqui m a (?:ecrit|envoye|texte|repondu)\b|\bqu est ce qu (?:il|elle|on) m a (?:ecrit|repondu|envoye)\b|\bqu a (?:repondu|dit|ecrit) \w+/.test(n) && /repondu|ecrit|texte|envoye/.test(n))
        return {type:'lire_messages'};
      // Lister
      if(/\b(?:qui (?:est|sont|y a t il|ya t il)|liste|montre|affiche|lis|donne|ouvre|combien)\b.*\b(?:repertoire|contacts)\b/.test(n) || /^(?:mon repertoire|mes contacts|le repertoire|repertoire)$/.test(n))
        return {type:'lister'};
      // Importer (le sélecteur de contacts demande un toucher)
      if(/\bimport(?:e|er|es)\b.*\bcontacts?\b|\bcontacts? du telephone\b.*\b(?:repertoire|ajoute|importe)/.test(n)) return {type:'importer'};
      // Supprimer
      let m=/^(?:supprime|supprimer|efface|effacer|enleve|enlever|retire|retirer)\s+(.+?)\s+(?:de|du|des)\s+(?:mon\s+|mes\s+|le\s+)?(?:repertoire|contacts?)$/.exec(n);
      if(m) return {type:'supprimer',nom:m[1].replace(DET,'').trim()};
      // Préférence d'appli : « Maman préfère les SMS », « pour Maman, utilise WhatsApp »
      m=/^pour\s+(.+?)\s+(?:utilise|prends|passe par|ce sera|c est)\s+(?:les?\s+|plutot\s+)?(whatsapp|sms|textos?|appels?|le telephone)$/.exec(n)
        || /^(.+?)\s+(?:prefere|aime mieux|veut)\s+(?:les?\s+|plutot\s+)?(whatsapp|sms|textos?|appels?|le telephone)$/.exec(n);
      if(m) return {type:'appli',nom:m[1].trim(),appli:/sms|texto/.test(m[2])?'sms':/appel|telephone/.test(m[2])?'appel':'whatsapp'};
      // Surnom : « ajoute le surnom ma mère à Sophie », « Lucas, c'est mon frère »
      m=/^(?:ajoute|rajoute|donne|mets)\s+(?:le|un|comme)\s+surnom\s+(.+?)\s+(?:a|pour|au contact)\s+(.+)$/.exec(n);
      if(m) return {type:'surnom',surnom:m[1],nom:m[2]};
      m=/^(.+?)\s+c est\s+((?:mon|ma)\s+.+)$/.exec(n);
      if(m && trouver(liste,m[1]) && !NUM_DANS.test(o)) return {type:'surnom',nom:m[1],surnom:m[2]};
      // Adresse mail : « ajoute l'adresse mail de Maman : … »
      m=/^(?:ajoute|rajoute|enregistre|note|mets|change|modifie)\s+(?:l\s+(?:adresse\s+)?(?:e\s?mail|mail|courriel|adresse)|le\s+(?:mail|courriel))\s+(?:de|d|a|pour)\s+(.+)$/.exec(n);
      if(m) return {type:'mail',reste:m[1],email:mailDicte(o)};   // le contact est retrouvé au début de « reste »
      // Ajouter / changer un numéro (« ajoute Maman au 06… », « change le numéro de Maman : 07… », « ajoute Lucas au répertoire »)
      const verbeAjout=/^(?:ajoute|ajouter|rajoute|enregistre|enregistrer|cree|change|modifie|corrige|remplace|mets a jour|le nouveau numero|nouveau numero|nouveau contact)\b/;
      const nm=o.match(NUM_DANS), num=nm?numero(nm[0]):'';
      if(verbeAjout.test(n) && !/^\S+\s+(?:une?|des|l|la|le)\s+(?:alerte|rappel|rendez|rdv|note|tache|evenement|minuteur|niveau)/.test(n) && (/\b(?:repertoire|contacts?|numero)\b/.test(n) || num)){
        let nom=(nm?o.slice(0,nm.index):o)
          .replace(/^(?:ajouter?|rajoute|enregistrer?|note|mets(?:\s+à\s+jour)?|crée|cree|change|modifie|corrige|remplace|(?:le\s+)?nouveau\s+(?:numéro|numero|contact))\s*(?:de\s+|d['’]\s*)?/i,'')
          .replace(/^(?:le\s+)?(?:num[ée]ro|contact|t[ée]l[ée]phone|portable)\s+(?:de\s+|d['’]\s*)?/i,'')
          .replace(/\s*(?:(?:dans|à|a|au|sur)\s+(?:(?:mon|le|mes)\s+)?(?:r[ée]pertoire|contacts?))\s*/gi,' ')
          .replace(/\s*(?:,|:|\bau\b|\bà\b|\bavec\s+le\b|\bavec\b|\bnum[ée]ro\b|\bson\s+num[ée]ro(?:\s+est)?|\best\b|\bc['’]est\b|\bpar\b|\ben\b|\bdevient\b|\bmaintenant\b)\s*$/gi,'')
          .replace(/\s*(?:,|:|\bau\b|\bà\b|\bavec\s+le\b|\bavec\b|\bnum[ée]ro\b|\best\b|\bc['’]est\b)\s*$/gi,'').replace(/[\s,:]+$/,'').trim();
        if(!nom && !nm) return null;
        const apres=nm?o.slice(nm.index+nm[0].length):'';
        const contact={nom:'',surnoms:[],numero:num};
        // « mon frère Lucas » → Lucas, surnom « mon frère »
        const rel=/^((?:mon|ma)\s+\S+)\s+([A-ZÀ-Ý].*)$/.exec(nom);
        if(rel){ contact.nom=rel[2]; contact.surnoms=[rel[1].toLowerCase()]; } else contact.nom=nom;
        contact.nom=majuscule(contact.nom.replace(/^(?:le|la|l['’])\s+/i,'').slice(0,40));
        const ca=CANAL_RE.exec(apres); if(ca) contact.appli=canalDe(ca[1]); else if(/\bappels?\b/i.test(apres)) contact.appli='appel';
        const mail=mailDicte(apres); if(mail) contact.email=mail;
        if(!contact.nom) return null;
        return {type:'ajouter',contact,numeroDit:!!nm,numeroValide:!!num};
      }
      // Appeler
      let p=o.replace(POLI,'');
      m=/^(?:appelle|appelles|appeler|appel|rappelle|rappeler|t[ée]l[ée]phone\s+(?:à|a|au)|passe(?:[\s-]moi)?\s+(?:un\s+)?(?:coup\s+de\s+fil|coup\s+de\s+t[ée]l[ée]phone|appel)\s+(?:à|a|au)|fais\s+(?:un\s+)?appel\s+(?:à|a|au)|lance\s+(?:un\s+)?appel\s+(?:vers|à|a|avec)|compose\s+le\s+num[ée]ro\s+(?:de|d['’]))\s+(.+)$/i.exec(p);
      if(m && !/^(?:moi|-moi|nous|toi|les?\s+(?:rappels?|alertes?)|mes\s+)\b/i.test(m[1])){
        let reste=m[1], appareil='';
        if(APPAREIL_RE.test(reste)){ appareil='telephone'; reste=reste.replace(APPAREIL_RE,''); }
        if(URGENCES.test(reste)) return {type:'urgence'};
        let canal='telephone';
        const wa=/\s+(?:sur|par|en|via|avec)\s+(?:whats\s?app|watsap|watsapp)\b.*$|\s+en\s+(?:visio|vid[ée]o)\b.*$/i;
        if(wa.test(reste)){ canal='whatsapp'; reste=reste.replace(wa,''); }
        reste=reste.replace(/\s+(?:au|par|sur le)\s+t[ée]l[ée]phone$/i,'').replace(/\s+(?:maintenant|tout de suite|stp|s['’]il te pla[iî]t)$/i,'').trim();
        // « rappelle Maman demain à 18 h » : c'est un rappel à poser, pas un appel tout de suite
        const QUAND=/\b(?:demain|ce soir|cet apr[eè]s[\s-]midi|tout [àa] l['’]heure|plus tard|dans\s+\d|[àa]\s+\d{1,2}\s*h|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|la semaine)\b/i;
        if(/^rappel/i.test(p) && QUAND.test(reste)) return null;
        const d=debutContact(reste,liste);
        if(d) return QUAND.test(d.suite) ? null : {type:'appel',contact:d.contact,qui:d.nom,canal,appareil};
        if(reste.split(/\s+/).length<=3 && !QUAND.test(reste)) return {type:'appel',contact:null,qui:reste,canal,appareil};
        return null;
      }
      // Envoyer un message
      m=/^(envoie|envoies|envoyer|envoi|[ée]cris|[ée]crire|texte|textote|dis|dit|pr[ée]viens|pr[ée]venir|r[ée]ponds|r[ée]pondre|demande|souhaite|souhaiter)(?:[\s-]+(?:un|une|le|mon|ce|son)\s+((?:petit\s+)?(?:message|texto|sms|whats\s?app|mail|e-?mail|courriel|mot)))?((?:\s+(?:par|en|sur|via)\s+(?:sms|texto|whats\s?app|mail|e-?mail|courriel))?)\s+(?:à|a|au|aux)\s+(.+)$/i.exec(p);
      if(m){
        const verbe=n2(m[1]), explicite=!!m[2] || /^(?:envoi|ecri|text)/.test(verbe);
        let reste=m[4], canal='', appareil='';
        const c1=(m[2]&&CANAL_RE.exec(' par '+m[2]))||CANAL_RE.exec(m[3]||''); if(c1 && !/mot|message/i.test(c1[1])) canal=canalDe(c1[1]);
        if(m[2] && /sms|texto/i.test(m[2])) canal='sms'; else if(m[2] && /mail|courriel/i.test(m[2])) canal='mail'; else if(m[2] && /whats/i.test(m[2])) canal='whatsapp';
        if(APPAREIL_RE.test(reste)){ appareil='telephone'; reste=reste.replace(APPAREIL_RE,''); }
        const d=debutContact(reste,liste);
        let suite=d?d.suite:'', qui=d?d.nom:'';
        if(!d){
          // contact inconnu : seulement si c'est clairement un message (« envoie un message à Paul », « écris à Paul que… »)
          const sep=/^(.+?)(?:\s*[:,]\s*|\s+(?:que|qu['’]|pour\s+(?:lui\s+)?dire|de\s+(?:lui\s+)?dire|en\s+(?:lui\s+)?disant|par|en|sur)\b)/i.exec(reste);
          const nomInconnu=(sep?sep[1]:reste).trim();
          if(!explicite || /^(?:la|le|l['’]|ma|mon)\s*(?:tablette|pc|ordi|ordinateur|t[ée]l[ée]phone|portable)\b/i.test(nomInconnu)) return null;
          if(!sep && reste.split(/\s+/).length>3) return null;
          if(nomInconnu.split(/\s+/).length>4) return null;
          return {type:'message',contact:null,qui:nomInconnu,canal,appareil,contenu:''};
        }
        // canal juste après le nom : « à Maman par SMS que… »
        let c2=/^(?:par|en|sur|via)\s+(?:un\s+)?(sms|textos?|whats\s?app|watsap|e-?mails?|mails?|courriels?)\b\s*/i.exec(suite);
        if(c2){ canal=canalDe(c2[1]); suite=suite.slice(c2[0].length); }
        let contenu=suite.replace(/^(?:[:,]\s*|que\s+|qu['’]\s*|pour\s+(?:lui\s+)?dire\s+qu(?:e\s+|['’]\s*)|de\s+(?:lui\s+)?dire\s+qu(?:e\s+|['’]\s*)|en\s+(?:lui\s+)?disant\s+qu(?:e\s+|['’]\s*)|pour\s+lui\s+dire\s+|disant\s+qu(?:e\s+|['’]\s*))/i,'').trim();
        const c3=/\s+(?:par|en|sur|via)\s+(?:un\s+)?(sms|textos?|whats\s?app|watsap|e-?mails?|mails?|courriels?)$/i.exec(contenu);
        if(c3){ canal=canalDe(c3[1]); contenu=contenu.slice(0,c3.index).trim(); }
        if(/^(?:demande)/.test(verbe) && contenu) contenu='demande-lui '+contenu;
        else if(/^souhait/.test(verbe) && contenu) contenu='je te souhaite '+contenu;
        else if(/^(?:previen|prevenir)/.test(verbe) && contenu && !/^(?:que|qu)/i.test(suite)) contenu='préviens-le '+contenu;
        // « dis à … » sans « que » ni contenu : trop ambigu (« dis à Maman bonjour » passe quand même)
        if(!explicite && !contenu && !/^(?:previen|prevenir)/.test(verbe)) return null;
        return {type:'message',contact:d.contact,qui,canal,appareil,contenu};
      }
      return null;
    }

    // Réponse à une proposition en attente → 'oui' | 'non' | 'modifier' | 'relire' | 'copier' | {canal} | 'telephone' | null (autre chose)
    function reponse(texte){
      const o=String(texte||'').replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'').trim();
      const c=n2(o).replace(/^(?:alors|bon|euh|ben|hum)\s+/,'');
      if(!c) return null;
      const ca=CANAL_RE.exec(' '+o);
      if(ca && c.split(' ').length<=6 && !/^(?:modifie|corrige|change|dis)/.test(c)) return {canal:canalDe(ca[1])};
      if(APPAREIL_RE.test(' '+o.replace(/^(?:oui|ok|vas[\s-]y)[\s,]*/i,'')) && c.split(' ').length<=7) return 'telephone';
      if(/^(?:non\s+)?(?:modifie|modifier|modifies|corrige|corriger|change|changer|remplace|reformule|plutot|mets plutot|dis plutot|ecris plutot|ajoute|rajoute|enleve|retire|supprime|fais (?:le |la )?plus|plus |moins |rends le|rend le|en anglais|en espagnol|en italien|en allemand|traduis|sois plus|termine par|commence par|precise|mets |met |ecris plutot|non dis|non ecris|non mets)/.test(c)) return 'modifier';
      if(/^(?:relis|relire|repete|redis|lis le|lis moi le|qu est ce que (?:tu as|t as) ecrit|c est quoi le message)/.test(c)) return 'relire';
      if(/^(?:copie|copier|copie le|copie la)\b/.test(c)) return 'copier';
      if(/^(?:non|nan|annule|annuler|laisse tomber|laisse|abandonne|pas la peine|oublie|non merci|tant pis|efface|stop|arrete|c est bon laisse)\b/.test(c)) return 'non';
      if(/^(?:oui|ouais|ouai|ok|okay|d accord|vas y|vas y ouvre|go|ouvre|ouvre le|ouvre la|ouvre les|envoie|envoie le|envoie la|lance|lance le|appelle|appelle la|appelle le|c est bon|c est parfait|parfait|nickel|carrement|yes|confirme|je confirme|valide|exactement|c est ca|super|top|bien sur|parfaitement|impeccable|tres bien|ca marche)\b/.test(c)) return 'oui';
      return null;
    }

    return {n2,numero,lisible,masque,masquer,mailDicte,lien,lienWhatsApp,lienSms,lienMail,lienTel,NOM_CANAL,BOUTON_CANAL,trouver,debutContact,brouillonLocal,analyser,reponse};
  })();

  /* ═════════════ ÉTAT ET OUTILS DE LA PAGE ═════════════ */
  const repAppaire=()=>!!store.get(KEY_WDEV);
  let repContacts=null, repContactsT=0;
  let repAttente=null;                  // proposition en cours : {etape, …, jusqua}
  const REP_ATTENTE_MS=3*60000;
  async function repCharger(force){
    if(!workerReady()||!repAppaire()) return repContacts||[];
    if(!force && repContacts && Date.now()-repContactsT<5*60000) return repContacts;
    try{ const d=await wjson('/repertoire',10000); repContacts=Array.isArray(d.contacts)?d.contacts:[]; repContactsT=Date.now(); }
    catch(e){ addLine('sys','Répertoire : '+errMsg(e)); }
    return repContacts||[];
  }
  async function repEcrire(corps){
    const r=await wfetch('/repertoire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corps)},12000);
    const d=await r.json().catch(()=>({}));
    if(r.ok){ repContactsT=0; await repCharger(true); try{ repAfficherListe(); }catch(e){} }
    return {r,d};
  }
  // Ce téléphone a-t-il une carte SIM ? (nom simple de l'appareil, sinon l'appareil lui-même)
  function repSurTelephone(){
    const nom=store.get(KEY_WDEVNOM);
    const g=nom && typeof RayleAppareils!=='undefined' ? RayleAppareils.genre(nom) : null;
    if(g) return g==='telephone';
    const ua=navigator.userAgent||'';
    return (/Android/i.test(ua) && /Mobile/i.test(ua)) || /iPhone/i.test(ua);
  }
  function repNomTelephone(){
    try{ const l=(typeof appConnus!=='undefined'?appConnus:[]).filter(n=>RayleAppareils.genre(n)==='telephone'); if(l.length) return l[0]; }catch(e){}
    return '';
  }
  const repArt=c=>c.nom;
  const repPasAppaire=()=>fx('Le répertoire demande un appareil appairé : appairez celui-ci dans ⚙ Réglages, Appareil et sécurité.','Le répertoire demande un appareil appairé : appaire celui-ci dans ⚙ Réglages, Appareil et sécurité.');

  // Ouvre l'appli (WhatsApp, SMS, mail, téléphone). Renvoie false si le navigateur a visiblement bloqué l'ouverture.
  function repOuvrir(url){
    if(!url) return false;
    if(/^https?:/i.test(url)){
      let w=null;
      try{ w=window.open(url,'_blank'); if(w) w.opener=null; }catch(e){ w=null; }
      return !!w;
    }
    try{ const a=document.createElement('a'); a.href=url; a.rel='noopener'; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove(); return true; }
    catch(e){ try{ location.href=url; return true; }catch(err){ return false; } }
  }
  async function repCopier(t){
    try{ await navigator.clipboard.writeText(t); return true; }catch(e){}
    try{ const z=document.createElement('textarea'); z.value=t; z.style.position='fixed'; z.style.opacity='0'; document.body.appendChild(z); z.select(); const ok=document.execCommand('copy'); z.remove(); return ok; }catch(e){ return false; }
  }

  /* ═════════════ RÉDIGER ═════════════ */
  async function repRediger(c,canal,contenu,brouillon,consigne){
    const corps={contact:c.nom,canal,texte:RayleRepertoire.masquer(contenu||''),brouillon:brouillon?RayleRepertoire.masquer(brouillon):'',consigne:consigne?RayleRepertoire.masquer(consigne):''};
    try{
      const r=await wfetch('/message/rediger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corps)},25000);
      const d=await r.json().catch(()=>({}));
      if(r.ok && d.message) return d.message;
      addLine('sys','Rédaction par l’IA impossible ('+(d.error||'HTTP '+r.status)+') : je garde tes mots.');
    }catch(e){ addLine('sys','Rédaction par l’IA impossible ('+errMsg(e)+') : je garde tes mots.'); }
    if(brouillon && consigne) return null;
    return RayleRepertoire.brouillonLocal(contenu);
  }

  /* ═════════════ PANNEAU ═════════════ */
  function repPanneauMessage(p,deAutre){
    const c=p.contact, R=RayleRepertoire;
    const dest=p.canal==='mail' ? (c.email||'') : R.masque(c.numero);
    const pied=[{texte:R.BOUTON_CANAL[p.canal],clic:()=>repConfirmer('bouton')},{texte:'Copier',clic:async()=>{ const ok=await repCopier(p.texte); appToastSur(ok?'📋 Message copié':'Copie impossible'); }}];
    if(!repSurTelephone() && !deAutre && p.canal!=='mail' && repNomTelephone()) pied.push({texte:'Sur le téléphone',clic:()=>repVersTelephone('bouton')});
    pied.push({texte:'Annuler',clic:()=>{ repAttente=null; Panneaux.fermer('msg:brouillon'); }});
    Panneaux.ouvrir({id:'msg:brouillon',type:'message',icone:'💬',titre:'Message pour '+c.nom+' · '+({whatsapp:'WhatsApp',sms:'SMS',mail:'mail'}[p.canal]),protege:true,duree:REP_ATTENTE_MS,
      corps:{html:'<p class="msg-texte">'+Panneaux.esc(p.texte).replace(/\n/g,'<br>')+'</p><p class="msg-dest">À : '+Panneaux.esc(c.nom)+(dest?' · '+Panneaux.esc(dest):'')+'</p>'
        +'<p class="msg-note">'+(deAutre?'Préparé sur '+Panneaux.esc(deAutre)+'. ':'')+'Rien n’est envoyé tant que tu n’appuies pas toi-même sur Envoyer.</p>'},
      pied,onFermer:()=>{ if(repAttente && repAttente.etape==='message') repAttente=null; }});
  }
  function repPanneauAppel(p,deAutre){
    const c=p.contact, R=RayleRepertoire;
    const pied=[{texte:p.canal==='whatsapp'?'Ouvrir WhatsApp':'Appeler',clic:()=>repConfirmer('bouton')}];
    if(!repSurTelephone() && !deAutre && repNomTelephone()) pied.push({texte:'Sur le téléphone',clic:()=>repVersTelephone('bouton')});
    pied.push({texte:'Annuler',clic:()=>{ repAttente=null; Panneaux.fermer('msg:appel'); }});
    Panneaux.ouvrir({id:'msg:appel',type:'message',icone:p.canal==='whatsapp'?'💬':'📞',titre:'Appeler '+c.nom+(p.canal==='whatsapp'?' · WhatsApp':''),protege:true,duree:REP_ATTENTE_MS,
      corps:{html:'<p class="msg-dest msg-gros">'+Panneaux.esc(c.nom)+(c.numero?' · '+Panneaux.esc(R.masque(c.numero)):'')+'</p>'
        +'<p class="msg-note">'+(deAutre?'Préparé sur '+Panneaux.esc(deAutre)+'. ':'')+(p.canal==='whatsapp'?'WhatsApp s’ouvre sur la conversation : touche toi-même l’icône d’appel (le combiné).':'L’appel ne part que quand tu le lances.')+'</p>'},
      pied,onFermer:()=>{ if(repAttente && repAttente.etape==='appel') repAttente=null; }});
  }
  function appToastSur(t){ try{ appToast(t); }catch(e){ addLine('sys',t); } }

  /* ═════════════ PRÉPARER ═════════════ */
  function repCanalPossible(c,canal){
    if(canal==='mail' && !c.email) return 'Je n’ai pas l’adresse mail de '+c.nom+'. Dis par exemple « ajoute l’adresse mail de '+c.nom+' : prénom point nom arobase gmail point com ».';
    if(canal!=='mail' && !c.numero) return 'Je n’ai pas de numéro pour '+c.nom+'.';
    return '';
  }
  async function repPreparerMessage(c,canal,contenu,appareil){
    canal=canal || (c.appli==='sms'?'sms':'whatsapp');
    if(canal!=='mail' && !c.numero && c.email) canal='mail';
    const non=repCanalPossible(c,canal); if(non) return non;
    if(!contenu){
      repAttente={etape:'contenu',contact:c,canal,appareil,jusqua:Date.now()+REP_ATTENTE_MS};
      return fx('Que voulez-vous dire à '+c.nom+' ?','Qu’est-ce que tu veux dire à '+c.nom+' ?');
    }
    const texte=await repRediger(c,canal,contenu);
    repAttente={etape:'message',contact:c,canal,texte,contenu,appareil,jusqua:Date.now()+REP_ATTENTE_MS};
    repPanneauMessage(repAttente);
    const ou={whatsapp:'dans WhatsApp',sms:'dans les SMS',mail:'dans ton mail'}[canal];
    if(appareil==='telephone' && !repSurTelephone()) return 'Voici le message pour '+c.nom+' : « '+texte+' ». '+fx('Je le prépare sur votre téléphone ?','Je le mets prêt sur ton téléphone ?');
    if(canal==='sms' && !repSurTelephone()) return 'Voici le message pour '+c.nom+' : « '+texte+' ». Les SMS partent du téléphone : '+fx('je le prépare sur votre téléphone ?','je le mets prêt sur ton téléphone ?');
    return 'Voici le message pour '+c.nom+' : « '+texte+' ». '+fx('Je l’ouvre '+ou+' ?','Je l’ouvre '+ou+' ?');
  }
  async function repPreparerAppel(c,canal,appareil){
    if(!c.numero) return 'Je n’ai pas de numéro pour '+c.nom+'.';
    if(!canal) canal='telephone';
    repAttente={etape:'appel',contact:c,canal,appareil,jusqua:Date.now()+REP_ATTENTE_MS};
    repPanneauAppel(repAttente);
    if(canal==='whatsapp') return fx('J’ouvre la conversation WhatsApp avec '+c.nom+' ? Il faudra toucher l’icône d’appel.','J’ouvre la conversation WhatsApp avec '+c.nom+' ? Tu toucheras l’icône d’appel.');
    if(appareil==='telephone' || !repSurTelephone()) return fx('Cet appareil ne peut pas appeler. Je prépare l’appel vers '+c.nom+' sur votre téléphone ?','Cet appareil ne peut pas appeler. Je mets l’appel vers '+c.nom+' prêt sur ton téléphone ?');
    return fx('J’appelle '+c.nom+' ?','J’appelle '+c.nom+' ?');
  }

  // « Oui » (à la voix) ou un toucher sur le bouton du panneau : on ouvre l'application. Rien n'est envoyé.
  async function repConfirmer(source){
    const p=repAttente;
    if(!p || (p.etape!=='message' && p.etape!=='appel')) return '';
    const R=RayleRepertoire, c=p.contact;
    const versTel=(p.appareil==='telephone' || (p.etape==='appel' && p.canal==='telephone') || (p.etape==='message' && p.canal==='sms')) && !repSurTelephone() && !p.deAutre;
    if(versTel) return await repVersTelephone(source);
    const canal=p.canal;
    const url=p.etape==='appel' ? (p.canal==='whatsapp' ? R.lienWhatsApp(c.numero,'') : R.lienTel(c.numero)) : R.lien(canal,c,p.texte);
    if(!url) return 'Je n’ai pas de quoi ouvrir ça pour '+c.nom+'.';
    const ok=repOuvrir(url);
    if(!ok){
      const t='Le navigateur a bloqué l’ouverture : touche « '+(p.etape==='appel'?(p.canal==='whatsapp'?'Ouvrir WhatsApp':'Appeler'):R.BOUTON_CANAL[canal])+' ».';
      if(source==='bouton'){ addLine('sys',t); return ''; }
      return t;
    }
    repAttente=null;
    Panneaux.fermer(p.etape==='appel'?'msg:appel':'msg:brouillon');
    try{ addLine('sys',(p.etape==='appel'?'Appel préparé vers ':'Message ouvert pour ')+c.nom+' ('+(p.etape==='appel'?p.canal:canal)+').'); }catch(e){}
    let t;
    if(p.etape==='appel') t=p.canal==='whatsapp' ? 'C’est ouvert : touche l’icône d’appel dans WhatsApp.' : 'J’ouvre l’appel vers '+c.nom+'. Si rien ne s’ouvre, touche « Appeler ».';
    else t='C’est ouvert '+({whatsapp:'dans WhatsApp',sms:'dans les SMS',mail:'dans ton mail'}[canal])+' : il ne reste qu’à appuyer sur Envoyer.'+(/^https?:/.test(url)?'':' Si rien ne s’ouvre, touche le bouton du panneau.');
    if(source==='bouton'){ try{ addLine('ray',t); speak(t); }catch(e){} return ''; }
    return t;
  }
  // PC ou tablette → téléphone (commandes entre appareils, phase 3A) : seulement le nom du contact et le texte
  async function repVersTelephone(source){
    const p=repAttente; if(!p) return '';
    const cible=repNomTelephone();
    if(!cible){
      const t=fx('Aucun téléphone n’est appairé : appairez-le dans ⚙ Réglages pour y préparer les messages et les appels.','Aucun téléphone n’est appairé : appaire-le dans ⚙ Réglages pour y préparer les messages et les appels.');
      if(source==='bouton'){ addLine('ray',t); speak(t); return ''; }
      return t;
    }
    if(typeof appEnvoyerAction!=='function') return 'Les commandes entre appareils ne sont pas disponibles.';
    const action=p.etape==='appel' ? {type:'appel',contact:p.contact.nom,canal:p.canal} : {type:'message',contact:p.contact.nom,canal:p.canal,texte:p.texte};
    repAttente=null;
    Panneaux.fermer(p.etape==='appel'?'msg:appel':'msg:brouillon');
    const t=await appEnvoyerAction(cible,action,(p.etape==='appel'?'appelle ':'message pour ')+p.contact.nom);
    if(source==='bouton'){ if(t){ addLine('ray',t); speak(t); } return ''; }
    return t;
  }

  /* ═════════════ COMMANDES À LA VOIX (appelée dans respond(), avant les autres) ═════════════ */
  const REP_PRE=/(?:repertoire|contacts?|messages?|sms|texto|whats|mail|courriel|appel|rappel|telephone a|coup de fil|numero|surnom|prefere|envoi|ecri|text|dis|dit|previen|repond|demande|souhait|lis|lit|qui m a|c est (?:mon|ma)|importe|compose)/;
  async function commandeMessages(texte){
    const R=RayleRepertoire;
    // 1) Une proposition attend une réponse
    if(repAttente){
      const p=repAttente;
      if(Date.now()>p.jusqua) repAttente=null;
      else{
        const rep=R.reponse(texte);
        if(p.etape==='contenu'){
          if(rep==='non'){ repAttente=null; return 'D’accord, je laisse tomber.'; }
          repAttente=null;
          return await repPreparerMessage(p.contact,p.canal,String(texte).replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'').replace(/^(?:dis[\s-]lui\s+)?(?:que|qu['’])\s*/i,'').trim(),p.appareil);
        }
        if(p.etape==='numero'){
          const nm=String(texte).match(/(?:\+|00)?\s?\d[\d\s.\-()]{6,}\d/);
          if(rep==='non'){ repAttente=null; return 'D’accord.'; }
          repAttente=null;
          if(nm) return await repAjouter(Object.assign({},p.contact,{numero:R.numero(nm[0])}),true,true);
        }
        if(p.etape==='supprimer'){
          repAttente=null;
          if(rep==='oui'){
            const {r,d}=await repEcrire({op:'supprimer',id:p.contact.id});
            return r.ok ? p.contact.nom+' est retiré du répertoire.' : 'Je n’ai pas pu le supprimer : '+(d.error||'HTTP '+r.status)+'.';
          }
          if(rep==='non') return 'D’accord, je le garde.';
        }
        if(p.etape==='message' || p.etape==='appel'){
          if(rep==='oui') return await repConfirmer('voix');
          if(rep==='non'){ repAttente=null; Panneaux.fermer(p.etape==='appel'?'msg:appel':'msg:brouillon'); return p.etape==='appel'?'D’accord, je n’appelle pas.':'D’accord, j’abandonne ce message.'; }
          if(rep==='telephone') return await repVersTelephone('voix');
          if(rep==='relire' && p.etape==='message') return 'Le message pour '+p.contact.nom+' : « '+p.texte+' ». '+fx('Je l’ouvre ?','Je l’ouvre ?');
          if(rep==='copier' && p.etape==='message'){ const ok=await repCopier(p.texte); return ok?'C’est copié.':'Je n’ai pas pu le copier : touche « Copier ».'; }
          if(rep && rep.canal){
            if(p.etape==='appel') return 'Pour un appel, dis « sur WhatsApp » ou « au téléphone ».';
            const non=repCanalPossible(p.contact,rep.canal); if(non) return non;
            p.canal=rep.canal; p.jusqua=Date.now()+REP_ATTENTE_MS; repPanneauMessage(p);
            if(rep.canal==='sms' && !repSurTelephone()) return 'D’accord, par SMS. Les SMS partent du téléphone : '+fx('je le prépare sur votre téléphone ?','je le mets prêt sur ton téléphone ?');
            return 'D’accord, '+({whatsapp:'sur WhatsApp',sms:'par SMS',mail:'par mail'}[rep.canal])+'. Je l’ouvre ?';
          }
          if(p.etape==='appel' && /whats/i.test(texte)){ p.canal='whatsapp'; repPanneauAppel(p); return 'D’accord, sur WhatsApp : j’ouvre la conversation ? Tu toucheras l’icône d’appel.'; }
          if(rep==='modifier' && p.etape==='message'){
            const consigne=String(texte).replace(/^\s*(?:(?:hey|ok|dis)\s+)?rayl[ée]\s*[,:]?\s*/i,'').replace(/^(?:non[\s,]+)?(?:modifie|modifier|corrige|change)\s*(?:le message|le texte|ça|ca)?\s*[:,]?\s*/i,'').trim()||String(texte);
            const nouveau=await repRediger(p.contact,p.canal,'',p.texte,consigne);
            if(!nouveau) return 'Je n’arrive pas à le modifier pour l’instant. Dis « annule » et redemande-le avec les bons mots.';
            p.texte=nouveau; p.jusqua=Date.now()+REP_ATTENTE_MS; repPanneauMessage(p);
            return 'Voici la nouvelle version : « '+nouveau+' ». Je l’ouvre ?';
          }
          if(rep===null) repAttente=null;   // autre chose : la proposition tombe, le panneau reste un moment
        }
      }
    }
    // 2) Une nouvelle demande ?
    const n=R.n2(texte);
    if(!REP_PRE.test(n)) return null;
    if(!repContacts && workerReady() && repAppaire()) await repCharger(false);   // « dis à Maman que… » demande de connaître Maman
    const pre=R.analyser(texte,repContacts||[]);
    if(!pre) return null;
    if(pre.type==='lire_messages') return fx('Je ne peux pas lire vos messages : je n’ai accès ni aux SMS, ni à WhatsApp, ni aux mails (il faudrait un service payant). En revanche, je peux vous en préparer un : dites par exemple « envoie à Maman que je rentre vers 19 h ».','Je ne peux pas lire tes messages : je n’ai accès ni aux SMS, ni à WhatsApp, ni aux mails (il faudrait un service payant). Par contre, je peux t’en préparer un : dis par exemple « envoie à Maman que je rentre vers 19 h ».');
    if(pre.type==='urgence'){
      Panneaux.ouvrir({id:'msg:urgence',type:'message',icone:'🚑',titre:'Urgence',protege:true,duree:5*60000,corps:{html:'<p class="msg-dest msg-gros">112 · 15 SAMU · 17 Police · 18 Pompiers</p><p class="msg-note">Touche le numéro à appeler.</p>'},
        pied:[{texte:'Appeler le 112',clic:()=>repOuvrir('tel:112')},{texte:'15',clic:()=>repOuvrir('tel:15')},{texte:'17',clic:()=>repOuvrir('tel:17')},{texte:'18',clic:()=>repOuvrir('tel:18')}]});
      return 'Pour une urgence, appelle toi-même le 112, ou le 15, le 17 ou le 18 : les boutons sont à l’écran.';
    }
    if(!workerReady()) return "Le Worker n'est pas configuré.";
    if(!repAppaire()) return repPasAppaire();
    const liste=await repCharger(false);
    const a=R.analyser(texte,liste) || pre;
    switch(a.type){
      case 'lister': return repLister(liste);
      case 'importer': return repProposerImport();
      case 'ajouter':
        if(a.numeroDit && !a.numeroValide) return 'Je n’ai pas compris le numéro de '+a.contact.nom+'. Redis-le chiffre par chiffre, par exemple « zéro six, douze, trente-quatre… », ou ajoute-le dans les réglages.';
        if(!a.contact.numero && !a.contact.email){
          const deja=R.trouver(liste,a.contact.nom);
          if(deja && (a.contact.appli || a.contact.surnoms.length)) return await repAjouter(Object.assign({},a.contact,{numero:deja.numero,email:deja.email}),false,true);
          repAttente={etape:'numero',contact:a.contact,jusqua:Date.now()+REP_ATTENTE_MS};
          return 'Quel est le numéro de '+a.contact.nom+' ?';
        }
        return await repAjouter(a.contact,true,!!R.trouver(liste,a.contact.nom));
      case 'mail':{
        const t=R.debutContact(a.reste,liste), c=t&&t.contact;
        if(!a.email) return 'Je n’ai pas compris l’adresse. Dis-la comme « prénom point nom arobase gmail point com », ou ajoute-la dans les réglages.';
        if(!c) return 'Je ne trouve pas ce contact dans ton répertoire. Ajoute d’abord son numéro, ou son adresse dans les réglages.';
        return await repAjouter({nom:c.nom,email:a.email},false,true,'L’adresse de '+c.nom+' est notée.');
      }
      case 'appli':{
        const c=R.trouver(liste,a.nom); if(!c) return null;
        return await repAjouter({nom:c.nom,appli:a.appli},false,true,'C’est noté : pour '+c.nom+', '+({whatsapp:'WhatsApp',sms:'les SMS',appel:'l’appel'}[a.appli])+' par défaut.');
      }
      case 'surnom':{
        const c=R.trouver(liste,a.nom); if(!c) return 'Je n’ai pas « '+a.nom+' » dans ton répertoire.';
        return await repAjouter({nom:c.nom,surnoms:[a.surnom]},false,true,'C’est noté : « '+a.surnom+' », c’est '+c.nom+'.');
      }
      case 'supprimer':{
        const c=R.trouver(liste,a.nom); if(!c) return 'Je n’ai pas « '+a.nom+' » dans ton répertoire.';
        repAttente={etape:'supprimer',contact:c,jusqua:Date.now()+60000};
        return fx('Je retire '+c.nom+' du répertoire ?','Je retire '+c.nom+' du répertoire ?');
      }
      case 'message':
        if(!a.contact) return repInconnu(a.qui,liste);
        return await repPreparerMessage(a.contact,a.canal,a.contenu,a.appareil);
      case 'appel':
        if(!a.contact) return repInconnu(a.qui,liste);
        return await repPreparerAppel(a.contact,a.canal,a.appareil);
    }
    return null;
  }
  function repInconnu(qui,liste){
    const q=String(qui||'').trim();
    return 'Je n’ai pas « '+q+' » dans ton répertoire'+(liste.length?'':' (il est vide)')+'. Dis par exemple « ajoute '+(q||'Maman')+' au 06… », ou ajoute-le dans ⚙ Réglages.';
  }
  async function repAjouter(contact,annonceNumero,existe,phrase){
    const R=RayleRepertoire;
    const corps={op:'ajouter',contact:{nom:contact.nom,surnoms:contact.surnoms||[],numero:contact.numero||'',email:contact.email||'',appli:contact.appli||''}};
    const {r,d}=await repEcrire(corps);
    if(r.status===403) return repPasAppaire();
    if(r.status===404) return 'Le Worker n’est pas encore à jour pour le répertoire : recolle son code dans Cloudflare.';
    if(!r.ok) return 'Je n’ai pas pu l’enregistrer : '+(d.error||'HTTP '+r.status)+'.';
    if(phrase) return phrase;
    const c=d.contact||contact;
    return (d.maj||existe?'Fiche de '+c.nom+' mise à jour':'C’est noté : '+c.nom+' est dans ton répertoire')
      +(annonceNumero && c.numero?', au '+R.lisible(c.numero).replace(/^(\d{2}) .* (\d{2})$/,'$1 … $2'):'')
      +((c.surnoms||[]).length?' (aussi « '+c.surnoms.join(' », « ')+' »)':'')
      +', '+({whatsapp:'WhatsApp',sms:'SMS',appel:'appel'}[c.appli||'whatsapp'])+' par défaut.';
  }
  function repLister(liste){
    if(!liste.length) return 'Ton répertoire est vide. Dis par exemple « ajoute Maman au 06… », ou importe tes contacts dans ⚙ Réglages.';
    const R=RayleRepertoire;
    const lignes=liste.map(c=>'<li><b>'+Panneaux.esc(c.nom)+'</b>'+((c.surnoms||[]).length?' <small>('+Panneaux.esc(c.surnoms.join(', '))+')</small>':'')+' · '+Panneaux.esc(R.masque(c.numero)||c.email||'')+' · '+({whatsapp:'WhatsApp',sms:'SMS',appel:'appel'}[c.appli]||'WhatsApp')+'</li>').join('');
    Panneaux.ouvrir({id:'msg:repertoire',type:'message',icone:'📇',titre:'Répertoire · '+liste.length+' contact'+(liste.length>1?'s':''),corps:{html:'<ul class="msg-liste">'+lignes+'</ul>'}});
    const noms=liste.map(c=>c.nom);
    return liste.length===1 ? 'Il y a une personne dans ton répertoire : '+noms[0]+'.'
      : 'Il y a '+liste.length+' personnes dans ton répertoire : '+(noms.length>12?noms.slice(0,12).join(', ')+', et '+(noms.length-12)+' autres':noms.slice(0,-1).join(', ')+' et '+noms[noms.length-1])+'.';
  }
  function repProposerImport(){
    if(!repContactsDispo()) return 'L’import des contacts ne marche que dans Chrome sur Android. Ici, ajoute-les à la voix (« ajoute Maman au 06… ») ou dans ⚙ Réglages.';
    Panneaux.ouvrir({id:'msg:import',type:'message',icone:'📇',titre:'Importer des contacts',duree:2*60000,corps:{html:'<p class="msg-note">Android demande que tu touches le bouton toi-même : tu choisis ensuite les contacts à donner à Raylé (et seulement ceux-là).</p>'},
      pied:[{texte:'Choisir mes contacts',clic:()=>{ Panneaux.fermer('msg:import'); repImporter(); }}]});
    return 'Touche « Choisir mes contacts » : Android te laisse choisir ceux à ajouter.';
  }

  /* ═════════════ L'AGENT (Worker) PEUT AUSSI DEMANDER : {type:'message'|'appel', contact, …} ═════════════ */
  async function repActionAgent(a){
    if(!workerReady()) return '';
    if(!repAppaire()) return repPasAppaire();
    const liste=await repCharger(false);
    const c=RayleRepertoire.trouver(liste,a.contact);
    if(!c) return repInconnu(a.contact,liste);
    const appareil=a.appareil && typeof RayleAppareils!=='undefined' && RayleAppareils.genre(a.appareil)==='telephone' ? 'telephone' : '';
    if(a.type==='appel') return await repPreparerAppel(c,a.canal==='whatsapp'?'whatsapp':'telephone',appareil);
    return await repPreparerMessage(c,['whatsapp','sms','mail'].includes(a.canal)?a.canal:'',String(a.contenu||''),appareil);
  }

  /* ═════════════ REÇU D'UN AUTRE APPAREIL (phase 3A) : le message ou l'appel est prêt, il reste à toucher ═════════════ */
  async function repRecevoir(a,de){
    const liste=await repCharger(true);
    const c=RayleRepertoire.trouver(liste,a.contact);
    if(!c) return {ok:false,msg:'« '+a.contact+' » est introuvable dans le répertoire'};
    if(a.type==='appel'){
      repAttente={etape:'appel',contact:c,canal:a.canal==='whatsapp'?'whatsapp':'telephone',deAutre:de,jusqua:Date.now()+REP_ATTENTE_MS};
      repPanneauAppel(repAttente,de);
      const t='Appel vers '+c.nom+' prêt, envoyé par '+de+'. Touche « '+(a.canal==='whatsapp'?'Ouvrir WhatsApp':'Appeler')+' », ou dis « oui ».';
      addLine('ray',t); speak(t);
      return {ok:true,msg:'appel prêt'};
    }
    const canal=['whatsapp','sms','mail'].includes(a.canal)?a.canal:'whatsapp';
    const non=repCanalPossible(c,canal); if(non) return {ok:false,msg:non};
    repAttente={etape:'message',contact:c,canal,texte:String(a.texte||'').slice(0,1500),deAutre:de,jusqua:Date.now()+REP_ATTENTE_MS};
    repPanneauMessage(repAttente,de);
    const t='Message pour '+c.nom+' prêt, envoyé par '+de+'. Touche « '+RayleRepertoire.BOUTON_CANAL[canal]+' », ou dis « oui ».';
    addLine('ray',t); speak(t);
    return {ok:true,msg:'message prêt'};
  }

  /* ═════════════ RÉGLAGES : le répertoire ═════════════ */
  const repContactsDispo=()=>!!(navigator.contacts && navigator.contacts.select && 'ContactsManager' in window);
  let repEdition=null;   // id du contact en cours de modification
  function repAfficherListe(){
    const box=$('repListe'); if(!box) return;
    box.textContent='';
    if(!repAppaire()){ box.innerHTML='<div class="hint">Appaire d’abord cet appareil (ci-dessus) pour voir et remplir le répertoire.</div>'; return; }
    const l=repContacts||[];
    if(!l.length){ box.innerHTML='<div class="hint">Répertoire vide.</div>'; return; }
    for(const c of l){
      const ligne=document.createElement('div'); ligne.className='rep-ligne';
      const t=document.createElement('span'); t.className='rep-nom';
      t.textContent=c.nom+((c.surnoms||[]).length?' ('+c.surnoms.join(', ')+')':'')+' · '+(RayleRepertoire.lisible(c.numero)||c.email||'')+' · '+({whatsapp:'WhatsApp',sms:'SMS',appel:'appel'}[c.appli]||'WhatsApp');
      const m=document.createElement('button'); m.type='button'; m.className='ghost'; m.textContent='Modifier';
      m.addEventListener('click',()=>repEditer(c));
      const s=document.createElement('button'); s.type='button'; s.className='ghost'; s.textContent='Supprimer';
      s.addEventListener('click',async()=>{
        if(s.dataset.sur!=='1'){ s.dataset.sur='1'; s.textContent='Confirmer ?'; setTimeout(()=>{ s.dataset.sur=''; s.textContent='Supprimer'; },4000); return; }
        const {r,d}=await repEcrire({op:'supprimer',id:c.id});
        cfgMsg.textContent=r.ok?'✔ '+c.nom+' est retiré du répertoire.':'✖ '+(d.error||'HTTP '+r.status);
      });
      ligne.append(t,m,s); box.appendChild(ligne);
    }
  }
  function repEditer(c){
    repEdition=c?c.id:null;
    $('kRepNom').value=c?c.nom:''; $('kRepSurnoms').value=c?(c.surnoms||[]).join(', '):'';
    $('kRepNum').value=c?RayleRepertoire.lisible(c.numero):''; $('kRepMail').value=c?c.email||'':''; $('kRepAppli').value=c?c.appli||'whatsapp':'whatsapp';
    $('repEnregistrer').textContent=c?'Enregistrer':'Ajouter'; $('repAnnuler').hidden=!c;
    if(c) $('kRepNom').focus();
  }
  async function repImporter(){
    if(!repContactsDispo()){ cfgMsg.textContent='✖ Le sélecteur de contacts n’existe que dans Chrome sur Android. Ajoute-les ici à la main, ou à la voix.'; return; }
    if(!repAppaire()){ cfgMsg.textContent='Appaire d’abord cet appareil.'; return; }
    let choisis=[];
    try{ choisis=await navigator.contacts.select(['name','tel','email'],{multiple:true}); }
    catch(e){ cfgMsg.textContent='✖ Import annulé ('+errMsg(e)+').'; return; }
    if(!choisis || !choisis.length){ cfgMsg.textContent='Aucun contact choisi.'; return; }
    const contacts=choisis.map(x=>({nom:(x.name&&x.name[0])||'',numero:(x.tel||[]).map(RayleRepertoire.numero).find(Boolean)||'',email:(x.email&&x.email[0])||'',appli:'whatsapp'})).filter(x=>x.nom && (x.numero||x.email));
    if(!contacts.length){ cfgMsg.textContent='✖ Aucun des contacts choisis n’a de numéro utilisable.'; return; }
    cfgMsg.textContent='Import…';
    try{
      const {r,d}=await repEcrire({op:'importer',contacts});
      const t=r.ok ? '✔ '+d.ajoutes+' contact'+(d.ajoutes>1?'s':'')+' importé'+(d.ajoutes>1?'s':'')+(d.ignores?' ('+d.ignores+' déjà présent'+(d.ignores>1?'s':'')+' ou sans numéro)':'')+'.' : '✖ '+(d.error||'HTTP '+r.status);
      cfgMsg.textContent=t; appToastSur(t.replace(/^✔ /,'📇 '));
    }catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
  }
  (function(){
    const b=$('repEnregistrer'); if(!b) return;
    const imp=$('repImporter');
    if(imp && !repContactsDispo()){ imp.disabled=true; imp.title='Seulement dans Chrome sur Android'; }
    b.addEventListener('click',async()=>{
      if(!workerReady()){ cfgMsg.textContent='Configure d’abord le Worker.'; return; }
      if(!repAppaire()){ cfgMsg.textContent='Appaire d’abord cet appareil (Appareil et sécurité).'; return; }
      const nom=$('kRepNom').value.trim(), num=$('kRepNum').value.trim(), mail=$('kRepMail').value.trim();
      const numero=RayleRepertoire.numero(num);
      if(!nom){ cfgMsg.textContent='✖ Donne un nom (ex. Maman).'; return; }
      if(num && !numero){ cfgMsg.textContent='✖ Numéro non reconnu : écris-le comme 06 12 34 56 78 ou +33 6 12 34 56 78.'; return; }
      if(!numero && !mail){ cfgMsg.textContent='✖ Il faut un numéro (ou une adresse mail).'; return; }
      const contact={nom,surnoms:$('kRepSurnoms').value.split(',').map(s=>s.trim()).filter(Boolean),numero,email:mail,appli:$('kRepAppli').value};
      cfgMsg.textContent='Enregistrement…';
      try{
        const {r,d}=await repEcrire(repEdition?{op:'modifier',id:repEdition,contact}:{op:'ajouter',contact});
        if(!r.ok){ cfgMsg.textContent='✖ '+(d.error||'HTTP '+r.status)+(r.status===404&&!d.code?' — le Worker n’est pas à jour.':''); return; }
        cfgMsg.textContent='✔ '+nom+(repEdition||d.maj?' mis à jour.':' ajouté au répertoire.');
        repEditer(null);
      }catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
    });
    $('repAnnuler').addEventListener('click',()=>repEditer(null));
    if(imp) imp.addEventListener('click',repImporter);
    $('repActualiser').addEventListener('click',async()=>{ await repCharger(true); repAfficherListe(); cfgMsg.textContent=repAppaire()?'Répertoire à jour.':'Appaire d’abord cet appareil.'; });
    // la liste se remplit à l'ouverture des réglages
    const gear=$('gear'); if(gear) gear.addEventListener('click',()=>{ repCharger(false).then(repAfficherListe); });
  })();
  setTimeout(()=>{ if(repAppaire()) repCharger(false); },7000);

  /* ═════════════ RÉGLAGES : le widget d'écran d'accueil (KWGT) ═════════════ */
  (function(){
    const copier=$('cfgWidgetCopier'); if(!copier) return;
    const info=$('widgetInfo'), champ=$('kWidgetUrl');
    const adresse=j=>W.url()+'/widget?k='+j;
    function montrer(j,cree){
      champ.hidden=!j; champ.value=j?adresse(j):'';
      info.textContent=j?'Jeton créé le '+new Date(cree).toLocaleDateString('fr-FR')+'. Version texte : ajoute « &format=texte » à la fin. Guide : docs/widget-kwgt.md.':'Aucun jeton widget pour l’instant : « Copier l’adresse du widget » en crée un.';
    }
    async function lire(){
      const r=await wfetch('/widget/jeton',{method:'GET'},10000); const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||(r.status===404?'le Worker n’est pas à jour':'HTTP '+r.status));
      return d;
    }
    async function generer(op){
      const r=await wfetch('/widget/jeton',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op})},10000); const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||(r.status===404?'le Worker n’est pas à jour':'HTTP '+r.status));
      return d;
    }
    const pret=()=>{ if(!workerReady()){ cfgMsg.textContent='Configure d’abord le Worker.'; return false; } if(!repAppaire()){ cfgMsg.textContent='Appaire d’abord cet appareil : le jeton du widget se gère depuis un appareil appairé.'; return false; } return true; };
    copier.addEventListener('click',async()=>{
      if(!pret()) return;
      try{
        let d=await lire();
        if(!d.jeton) d=await generer('generer');
        montrer(d.jeton,d.cree);
        const ok=await repCopier(adresse(d.jeton));
        cfgMsg.textContent=ok?'✔ Adresse du widget copiée : colle-la dans KWGT (voir docs/widget-kwgt.md).':'Adresse affichée ci-dessous : sélectionne-la et copie-la.';
      }catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
    });
    $('cfgWidgetNouveau').addEventListener('click',async()=>{
      if(!pret()) return;
      if(copier.dataset.nouveau!=='1'){ copier.dataset.nouveau='1'; cfgMsg.textContent='Un nouveau jeton remplace l’ancien : le widget actuel cessera de marcher tant que tu n’as pas recollé la nouvelle adresse. Touche encore « Nouveau jeton » pour confirmer.'; setTimeout(()=>{ copier.dataset.nouveau=''; },8000); return; }
      copier.dataset.nouveau='';
      try{ const d=await generer('generer'); montrer(d.jeton,d.cree); const ok=await repCopier(adresse(d.jeton)); cfgMsg.textContent='✔ Nouveau jeton créé'+(ok?' et adresse copiée':'')+'. Recolle-la dans KWGT.'; }
      catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
    });
    $('cfgWidgetRevoquer').addEventListener('click',async()=>{
      if(!pret()) return;
      try{ await generer('revoquer'); montrer(null); cfgMsg.textContent='✔ Jeton du widget révoqué : le widget n’affiche plus rien (jusqu’à une minute de délai).'; }
      catch(e){ cfgMsg.textContent='✖ '+errMsg(e); }
    });
    const gear=$('gear'); if(gear) gear.addEventListener('click',()=>{ if(workerReady()&&repAppaire()) lire().then(d=>montrer(d.jeton,d.cree)).catch(()=>{}); });
  })();

  // Accès pour les tests locaux uniquement
  if(window.__RAYLE_TEST_REPERTOIRE__) window.__RAYLE_TEST_REPERTOIRE__({RayleRepertoire,commandeMessages,repRecevoir,repActionAgent,repConfirmer,etat:()=>repAttente,contacts:v=>{ repContacts=v; repContactsT=Date.now(); }});
