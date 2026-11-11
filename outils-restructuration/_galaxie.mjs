import fs from 'node:fs';
let t = fs.readFileSync('galaxie/galaxie.js', 'utf8'); const avant = t.length;
// 1. modules : Terre, Saturne (anatomie) et Neptune seulement
t = t.replace("(p.id === 'terre' || p.id === 'mars' || p.id === 'saturne' || p.id === 'neptune' || p.id === 'jupiter')", "(p.id === 'terre' || p.id === 'saturne' || p.id === 'neptune')");
// 2. chemin du module : même module partout (la carte légère reste un choix manuel : rayle_terre_vue = leger)
const i0 = t.indexOf('  /* Module d\'une planète'), i1 = t.indexOf('  const entreePlanete');
if (i0 < 0 || i1 < 0) throw new Error('bornes introuvables');
const nouveau = `  /* Module d'une planète : le même sur PC, tablette et téléphone. Seule la carte plate de la Terre reste un choix manuel (réglage rayle_terre_vue = 'leger'). */
  const cheminModule = p => {
    if (p.id === 'terre' && p.modules && p.modules.tablette && p.modules.tablette.entree) { let pref = 'auto'; try { pref = localStorage.getItem('rayle_terre_vue') || 'auto'; } catch (e) { /* stockage refusé */ } if (pref === 'leger') return p.modules.tablette.entree; }
    return p.modules.pc.entree;
  };
`;
t = t.slice(0, i0) + nouveau + t.slice(i1);
// 3. entrée directe + mode « direct » (galaxie invisible : seul le module de la planète dessine)
t = t.replace("    enMarche: () => actif, jeu: () => jeu, enBanc: () => enBanc,", `    /* Entrée directe dans une planète (sans survol de la galaxie) : le décor de la galaxie reste caché, seul le module dessine. */
    entrerPlanete(id) { if (!AVEC_MODULE.has(id)) return false; g.modeDirect(true); return nav.entrerDirect(id); },
    modeDirect(oui) { for (const o of [soleil.groupe, systeme.racine, ceinture.objet]) o.visible = !oui; direct = !!oui; },
    estDirect: () => direct,
    enMarche: () => actif, jeu: () => jeu, enBanc: () => enBanc,`);
t = t.replace('let t = 0, accFps = 0, actif = false, dernier = 0, surcharge = null;', 'let t = 0, accFps = 0, actif = false, dernier = 0, surcharge = null, direct = false;');
fs.writeFileSync('galaxie/galaxie.js', t); console.log('galaxie.js', avant, '->', t.length);
let n = fs.readFileSync('galaxie/navigation.js', 'utf8');
n = n.replace("    maj, allerA, retour, selectionner, fermerSas,", "    maj, allerA, retour, selectionner, fermerSas,\n    /* Entrée directe (application) : place la caméra face à la planète puis passe la main à son module, sans vol. */\n    entrerDirect(id) { if (!parId.has(id)) return false; this.placer(id, { angle: 0.45 }); ouvrirSas(id, true); return true; },");
fs.writeFileSync('galaxie/navigation.js', n);
