"use strict";
  /* ═════════════ CALCUL · CONVERSIONS · DEVISES ═════════════ */
  const CALC_RE=/\b(calcule[sz]?|calcul|combien (?:font|fait|ca fait|egale?|vaut|valent)|ca fait combien|egal(?:e)? combien|racine|au carre|au cube|puissance|multiplie|divise|pour ?cents? de|pourcentage|factorielle)\b|\d\s*(?:[x*×/÷+^]|plus|moins|fois|sur)\s*\d|\d\s*%\s*(?:de|d')/;
  const DEV_MOTS="dollars? canadiens?|dollars? australiens?|francs? suisses?|livres? sterling|livres?|yens?|yuans?|euros?|dollars?|eur|usd|gbp|jpy|chf|cad|aud|cny";
  function devise(w){
    w=String(w||'');
    if(/canadien|cad/.test(w)) return 'CAD'; if(/australien|aud/.test(w)) return 'AUD';
    if(/suisse|chf/.test(w)) return 'CHF'; if(/livre|gbp/.test(w)) return 'GBP';
    if(/yen|jpy/.test(w)) return 'JPY'; if(/yuan|cny/.test(w)) return 'CNY';
    if(/euro|eur/.test(w)) return 'EUR'; if(/dollar|usd/.test(w)) return 'USD';
    return null;
  }
  function conversionDevise(n){
    const s=n.replace(/(\d)\s+(\d{3})(?!\d)/g,'$1$2').replace(/(\d),(\d)/g,'$1.$2').replace(/€/g,' euros').replace(/\$/g,' dollars');
    const re=new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+DEV_MOTS+')\\s+(?:en|vers|to|contre)\\s+('+DEV_MOTS+')\\b');
    const m=s.match(re); if(!m) return null;
    const de=devise(m[2]), vers=devise(m[3]);
    return (de && vers && de!==vers) ? {montant:+m[1],de,vers} : null;
  }
  const UNITES=[
    ["kilometres? (?:par|a l') ?heure|km/h|kmh",'km/h'],["miles? (?:par|a l') ?heure|mph",'mi/h'],
    ['kilometres?|km','km'],['centimetres?|cm','cm'],['millimetres?|mm','mm'],['metres?','m'],['miles?','mile'],['pieds?','ft'],['pouces?','inch'],['yards?','yard'],
    ['kilogrammes?|kilos?|kg','kg'],['grammes?','g'],['livres?','lb'],['onces?','oz'],
    ['millilitres?|ml','ml'],['litres?','liter'],['gallons?','gallon'],
    ['degres? celsius|celsius','degC'],['degres? fahrenheit|fahrenheit','degF'],
    ['heures?','hour'],['minutes?','minute'],['secondes?','second'],['jours?','day'],['semaines?','week'],['hectares?','hectare']
  ];
  function uniteDe(w){ for(const [re,u] of UNITES) if(new RegExp('^(?:'+re+')$').test(w)) return u; return null; }
  function conversionUnite(n){
    if(!/\b(convertis|converti|conversion|combien|en)\b/.test(n)) return null;
    const alt=UNITES.map(x=>x[0]).join('|');
    const s=n.replace(/(\d),(\d)/g,'$1.$2');
    const m=s.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+alt+')\\s+(?:en|vers|to)\\s+('+alt+')\\b'));
    if(!m) return null;
    const a=uniteDe(m[2]), b=uniteDe(m[3]);
    return (a && b && a!==b) ? {expr:m[1]+' '+a+' to '+b, lisible:m[1]+' '+m[2]+' en '+m[3]} : null;
  }
  function exprDepuis(n){
    let s=' '+n+' ';
    s=s.replace(/(\d)\s+(\d{3})(?!\d)/g,'$1$2').replace(/(\d)\s+(\d{3})(?!\d)/g,'$1$2');
    s=s.replace(/(\d),(\d)/g,'$1.$2').replace(/(\d) virgule (\d)/g,'$1.$2');
    const mots='zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix';
    const val={zero:0,un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10};
    s=s.replace(new RegExp('\\b('+mots+')\\b(?=\\s*(?:plus|moins|fois|divise|sur|au carre|au cube|puissance|%|pour ?cents?))','g'),w=>val[w]);
    s=s.replace(new RegExp('(\\b(?:plus|moins|fois|par|de|puissance)\\s+)('+mots+')\\b','g'),(a,p,w)=>p+val[w]);
    s=s.replace(/racine cubique de\s*([\d.]+)/g,'cbrt($1)');
    s=s.replace(/racine (?:carree )?de\s*([\d.]+)/g,'sqrt($1)');
    s=s.replace(/factorielle de\s*(\d+)/g,'$1!');
    s=s.replace(/([\d.]+)\s*(?:%|pour ?cents?)\s*(?:de|du|des|d')\s*([\d.]+)/g,'($1/100*$2)');
    s=s.replace(/au carre/g,'^2').replace(/au cube/g,'^3').replace(/(?:a la )?puissance/g,'^');
    s=s.replace(/multiplie(?:e|s)? par|\bfois\b|\bx\b|×/g,'*');
    s=s.replace(/divise(?:e|s)? par|\bsur\b|÷/g,'/');
    s=s.replace(/\bplus\b/g,'+').replace(/\bmoins\b/g,'-');
    const tok=s.match(/sqrt|cbrt|\bpi\b|\d+(?:\.\d+)?|[+\-*/^%()!]/g)||[];
    let e=tok.join('');
    e=e.replace(/^[+*/^%)!]+/,'').replace(/[+\-*/^(]+$/,'');
    if(!/\d/.test(e) || !/[+\-*/^%!]|sqrt|cbrt/.test(e)) return null;
    let open=(e.match(/\(/g)||[]).length-(e.match(/\)/g)||[]).length;
    while(open-->0) e+=')';
    return {expr:e};
  }
  async function ctxCalcul(c,live,stamp){
    addLine('sys','Calcul : '+c.expr);
    try{
      const d=await wjson('/calcul?expr='+encodeURIComponent(c.expr),12000);
      if(stamp!==epoch) return '';
      const r=typeof d.resultat==='number'?fmtNum(d.resultat,10):String(d.resultat);
      live.extra.push((c.lisible||c.expr)+' : '+r+'.');
      return (c.lisible?'CONVERSION D\'UNITÉS : '+c.lisible:'CALCUL EXACT : '+c.expr)+' = '+r+' ('+d.source+'). Annonce ce résultat tel quel, arrondi naturellement à l\'oral.';
    }catch(e){
      if(stamp!==epoch) return '';
      return 'CALCUL : le calculateur exact a échoué pour « '+c.expr+' » ('+errMsg(e)+'). Calcule toi-même avec soin et précise que tu as fait le calcul de tête.';
    }
  }
  async function ctxChange(c,live,stamp){
    addLine('sys','Devises : '+c.montant+' '+c.de+' → '+c.vers+'…');
    try{
      const d=await wjson('/change?de='+c.de+'&vers='+c.vers+'&montant='+c.montant,12000);
      if(stamp!==epoch) return '';
      live.extra.push(fmtNum(c.montant)+' '+c.de+' font '+fmtNum(d.resultat,2)+' '+c.vers+'.');
      return 'CONVERSION DE DEVISES : '+fmtNum(c.montant)+' '+c.de+' = '+fmtNum(d.resultat,2)+' '+c.vers+' (taux '+fmtNum(d.taux,5)+', '+d.source+(d.date?', taux du '+d.date:'')+(d.perime?', ancienne copie':'')+').';
    }catch(e){
      if(stamp!==epoch) return '';
      return 'CONVERSION DE DEVISES indisponible ('+errMsg(e)+') : ne donne pas de taux inventé.';
    }
  }
