import fs from 'node:fs';
let t = fs.readFileSync('core/commun/g1-accueil.js', 'utf8').split(String.fromCharCode(13)).join('');
const rep = (a, b) => { if (!t.includes(a)) throw new Error('ancre : ' + a.slice(0, 70)); t = t.replace(a, b); };
// le contenu (fil, graphes, météo détaillée, grande fenêtre) est remplacé par l'accueil de l'application et le carrousel : on garde le DÉCOR (noyau, anneaux, éclats, vague, dock)
rep('function dessinerFil(){', 'function dessinerFil(){ return;');
rep('function dessinerGraphes(){', 'function dessinerGraphes(){ return;');
rep('async function chargerMeteoDetail(force){', 'async function chargerMeteoDetail(force){ return;');
// dock : Accueil, Terminal, Anatomie, Terre, Développement 3D, Réglages
rep("const ICONES=[['accueil','Accueil'],['vie','Vie'],['comm','Communications'],['espaces','Espaces'],['reglages','Réglages']];",
  "const ICONES=[['accueil','Accueil'],['terminal','Terminal'],['anatomie','Anatomie'],['terre','Terre'],['dev3d','3D'],['reglages','Réglages']];\n  IC.terminal='<svg viewBox=\"0 0 24 24\"><path d=\"M3 20h18M4 16l5-6 4 3 7-8\"/><path d=\"M16 5h4v4\"/></svg>';\n  IC.anatomie='<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"5\" r=\"2.6\"/><path d=\"M12 8v8M7 10h10M9 10l-1.5 6M15 10l1.5 6M12 16l-3 5M12 16l3 5\"/></svg>';\n  IC.terre='<svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18\"/></svg>';\n  IC.dev3d='<svg viewBox=\"0 0 24 24\"><path d=\"M12 3l8 4.5v9L12 21l-8-4.5v-9z\"/><path d=\"M4 7.5l8 4.5 8-4.5M12 12v9\"/></svg>';");
rep("    if(i==='accueil'){ fermer(); try{ if(window.Panneaux) Panneaux.fermerTout(); }catch(e){} if(RayleBus.demander('vue')!=='rayle') RayleBus.emit('vue:demande',{vue:'rayle'}); }\n    else if(i==='vie') ouvrir('meteo');\n    else if(i==='comm') ouvrir('messages');\n    else if(i==='espaces') menu.hidden=!menu.hidden;\n    else if(i==='reglages') clic('gear');",
  "    if(i==='accueil'){ if(window.Application) Application.aller(0,{force:true}); }\n    else if(i==='reglages') clic('gear');\n    else if(window.Application) Application.aller(i);   // le dock fait défiler le carrousel ; l'ouverture se fait en cliquant le panneau");
fs.writeFileSync('core/commun/g1-accueil.js', t);
console.log('ok');
