/* Commandes vocales de la carte de liquidité (V4, phase 4) — script classique chargé après veilleur-page.js ; branché dans phrase.js (après les sources en direct).
   « ouvre la carte de liquidité », « montre-moi la liquidité sur Solana », « carte de liquidité Kraken », « où va le marché ? », « rejoue la dernière heure », « ferme la carte de liquidité ».
   Aucune IA : la réponse parlée vient des chiffres du moteur (strategies/liquidite), toujours avec « hypothèse, pas une promesse ». Rien n'est inventé : sans données, elle le dit. */
(function(){
  const nz=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const ACTIFS={btc:'BTC',bitcoin:'BTC',sol:'SOL',solana:'SOL',doge:'DOGE',dogecoin:'DOGE'};
  const actifDe=n=>{ for(const k of Object.keys(ACTIFS)) if(new RegExp('\\b'+k+'\\b').test(n)) return ACTIFS[k]; return null; };
  const fluxDe=n=>/\bkraken\b/.test(n)?'kraken':/\b(futures?|perp|perpetuels?)\b/.test(n)?'binance-fut':/\bbinance\b/.test(n)?'binance-spot':null;
  const charger=()=>import(new URL('planetes/mars/pc/liquidite/fenetre-liquidite.js',document.baseURI).href);
  const dire=a=>{ const A=a&&a.aimants; if(!A||!A.objectif) return 'Je ne vois pas de zone attractive assez nette autour du prix pour le moment.'; const o=A.objectif,d=A.defense,fmt=p=>p.toLocaleString('fr-FR',{maximumFractionDigits:p>=1000?0:p>=10?2:4});
    return 'Prochain aimant probable : '+fmt(o.prix)+', '+(o.cote==='haut'?'au-dessus':'en dessous')+', à '+Math.abs(o.distancePct).toFixed(2).replace('.',',')+' pour cent. '+(d?'Niveau de défense : '+fmt(d.prix)+'. ':'')+'Invalidation sous ou au-dessus de '+fmt(A.invalidation.prix)+'. Confiance '+A.confiance+'. C’est une hypothèse, pas une promesse.'; };
  async function analyseRapide(actif,flux){
    const api=window.CarteLiquidite&&window.CarteLiquidite.api&&window.CarteLiquidite.api(); if(api&&api.analyse()&&(!actif||api.etat().actif===actif)) return api.analyse();
    try{ const r=await fetch('/__flux/analyse?actif='+(actif||'BTC')+'&venue='+(flux||'binance-spot')+'&minutes=20',{cache:'no-store'}); if(r.ok){ const j=await r.json(); if(j.ok) return j.analyse; } }catch(e){ /* service PC absent */ }
    return null;
  }
  async function commande(texte){
    const n=nz(texte); if(!n||n.split(' ').length>16) return null;
    const parleLiquidite=/\b(carte de liquidite|liquidite|carnet d ordres|carte de chaleur|heatmap|bookmap)\b/.test(n);
    if(/\bferme\w*\b/.test(n)&&parleLiquidite){ if(window.CarteLiquidite&&window.CarteLiquidite.ouverte()){ window.CarteLiquidite.fermer(); return 'C’est fermé.'; } return null; }
    if(/\b(ou va le marche|prochain aimant|quel est l objectif|ou est l aimant|niveau de defense)\b/.test(n)&&!/\bagent\b/.test(n)){
      const a=await analyseRapide(actifDe(n),fluxDe(n)); if(!a) return 'Je n’ai pas de carnet à lire pour le moment : le service Kepler n’enregistre pas, et la carte de liquidité n’est pas ouverte en direct.'; return dire(a);
    }
    if(!parleLiquidite) return null;
    if(!/\b(ouvre|ouvrir|montre|montrer|affiche|afficher|lance|donne|vois|voir|rejoue|rejouer|relecture)\b/.test(n)&&n.split(' ').length>5) return null;
    const M=await charger(), actif=actifDe(n), flux=fluxDe(n), rel=/\b(rejoue|rejouer|relecture|replay)\b/.test(n);
    const duree=n.match(/derniere heure/)?3600e3:n.match(/(\d+) minutes?/)?Number(n.match(/(\d+) minutes?/)[1])*60e3:600e3;
    try{ await M.ouvrirCarte({actif:actif||undefined,flux:flux||undefined,mode:rel?'relecture':undefined,t:rel?Date.now()-duree:undefined}); }catch(e){ return 'Je n’arrive pas à ouvrir la carte de liquidité : '+String(e.message).slice(0,80)+'.'; }
    return rel?'Voici la relecture du carnet enregistré.':'Voici la carte de liquidité'+(actif?' de '+({BTC:'Bitcoin',SOL:'Solana',DOGE:'Dogecoin'}[actif]):'')+'. Elle montre le carnet d’ordres, hypothèse de lecture seulement.';
  }
  window.LiquiditeVoix={commande,nz};
})();
