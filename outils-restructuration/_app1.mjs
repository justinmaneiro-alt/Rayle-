import fs from 'node:fs';
let t = fs.readFileSync('core/commun/application.js', 'utf8');
const a = "n=0; while(!(window.Saturne&&window.Saturne.etat&&window.Saturne.etat().actif)&&n++<120) await attendre(80); try{ await window.Saturne.salleMedicale(); }catch(e){ console.warn('[app] salle médicale :',e); }";
if (!t.includes(a)) throw new Error('ancre');
t = t.replace(a, "n=0; const pret=()=>{ const s=window.Saturne&&window.Saturne.etat&&window.Saturne.etat(); return !!(s&&s.actif&&s.entree&&!s.transition); }; while(!pret()&&n++<200) await attendre(80); try{ await window.Saturne.salleMedicale(); }catch(e){ console.warn('[app] salle médicale :',e); }");
fs.writeFileSync('core/commun/application.js', t);
// les boutons « Terre 2.0 » et « Quitter » du module sont remplacés par la croix commune
let c = fs.readFileSync('core/commun/application.css', 'utf8');
c += 'body.app-direct .t-boutons [data-a="terre-v2"],body.app-direct .t-boutons [data-a="quitter"]{display:none!important}\n';
fs.writeFileSync('core/commun/application.css', c);
