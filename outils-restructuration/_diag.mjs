import fs from 'node:fs';
let t = fs.readFileSync('core/api-keys/worker.js', 'utf8');
const a = "        v=e&&e.name==='AbortError'?{cause:'delai',message:'Le Worker '+base+' ne répond pas (délai de 8 s dépassé).'}:{cause:'reseau',message:'Impossible de joindre '+base+' : pas de réseau, nom de domaine introuvable, ou Worker supprimé.'};";
if (!t.includes(a)) throw new Error('ancre');
const b = "        if(e&&e.name==='AbortError') v={cause:'delai',message:'Le Worker '+base+' ne répond pas (délai de 8 s dépassé).'};\n        else{\n          let atteint=false; try{ await fetch(base+'/health',{mode:'no-cors',cache:'no-store'}); atteint=true; }catch(x){}   // une réponse « opaque » prouve que le serveur est joignable\n          v=atteint?{cause:'sans-cors',message:'Le serveur '+base+' répond, mais sans autorisation CORS pour '+origine+' : soit ce n’est pas le backend Raylé (site statique ou ancien Worker à cette adresse), soit cette origine n’est pas dans la variable ORIGINE. Voir DEPLOIEMENT.md.'}:{cause:'reseau',message:'Impossible de joindre '+base+' : pas de réseau, nom de domaine introuvable, ou Worker supprimé.'};\n        }";
t = t.replace(a, b);
fs.writeFileSync('core/api-keys/worker.js', t); console.log('ok');
