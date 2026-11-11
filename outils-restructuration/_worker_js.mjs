import fs from 'node:fs';
let t = fs.readFileSync('core/api-keys/worker.js', 'utf8');
t = t.replace("const W={ url:()=>store.get(KEY_WURL).replace(/\/+$/,'')", "const W={ url:()=>(store.get(KEY_WURL)||(window.RAYLE_CONFIG&&window.RAYLE_CONFIG.workerUrl)||'').replace(/\/+$/,'')");
if (!t.includes('RAYLE_CONFIG')) throw new Error('ancre url introuvable');
// wfetch : une panne réseau devient un diagnostic précis
t = t.replace("    const res=await fetchT(W.url()+path,o,ms||15000);\n", "    let res; try{ res=await fetchT(W.url()+path,o,ms||15000); }catch(e){ if(e&&e.name==='AbortError') throw e; throw new Error((await diagnostiquerWorker()).message); }\n");
if (!t.includes('diagnostiquerWorker()).message')) throw new Error('ancre wfetch introuvable');
// diagnostic
const diag = `
  /* Diagnostic précis d'une panne du Worker : on sonde /health (ouvert à toutes les origines) et on dit LAQUELLE des causes est la bonne. Résultat gardé 20 s. */
  let diagCache=null;
  async function diagnostiquerWorker(force){
    if(!force&&diagCache&&Date.now()-diagCache.t<20000) return diagCache.v;
    const base=W.url(), origine=location.origin; let v;
    if(!base) v={cause:'adresse',message:'Aucune adresse de Worker configurée (config.js ou ⚙ Réglages).'};
    else{
      try{
        const c=new AbortController(), tm=setTimeout(()=>c.abort(),8000);
        const r=await fetch(base+'/health',{cache:'no-store',signal:c.signal}); clearTimeout(tm);
        const texte=await r.text(); let j=null; try{ j=JSON.parse(texte); }catch(e){}
        if(r.ok&&j&&j.service==='rayle') v={cause:'cors',message:'Le Worker '+base+' répond (version '+(j.version||'?')+') mais refuse l’origine '+origine+' pour les données : ajoutez-la à la variable ORIGINE du Worker.',health:j};
        else if(r.status===404||/<html/i.test(texte)) v={cause:'pas-le-backend',message:'L’adresse '+base+' répond '+r.status+' mais ce n’est pas le backend Raylé (/health absent : un site statique ou un ancien Worker est déployé à cette adresse). Il faut redéployer le Worker (DEPLOIEMENT.md).'};
        else v={cause:'http',message:'Le Worker '+base+' répond HTTP '+r.status+' sur /health.'};
      }catch(e){
        v=e&&e.name==='AbortError'?{cause:'delai',message:'Le Worker '+base+' ne répond pas (délai de 8 s dépassé).'}:{cause:'reseau',message:'Impossible de joindre '+base+' : pas de réseau, nom de domaine introuvable, ou Worker supprimé.'};
      }
    }
    diagCache={t:Date.now(),v}; return v;
  }
`;
t = t.replace("  async function workerError(res){", diag + "  async function workerError(res){");
// messages d'erreur du backend portable : « Source « X » : … » est repris tel quel
t = t.replace("    if(/HTTP 401/.test(m))", "    if(/Source «/.test(m)) return m.replace(/^HTTP \d+ · /,'');\n    if(/HTTP 401/.test(m))");
fs.writeFileSync('core/api-keys/worker.js', t);
console.log('ok');
