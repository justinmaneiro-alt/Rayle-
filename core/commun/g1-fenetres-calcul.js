"use strict";
/* ═════════════ ACCUEIL « AURORE » : fenêtre à la demande, tâches, éclats du noyau, voix (calculs purs, testés : galaxie/tests/g1-fenetres-test.mjs) ═════════════
   Utilisable dans la page (window.G1Fenetres) et sous Node (module.exports). Aucune donnée inventée : une liste vide reste vide. */
(function (racine) {
  /* Contenus de la grande fenêtre (un seul à la fois), dans l'ordre des onglets. */
  const ONGLETS = [
    { id: 'meteo', titre: 'Météo', alias: ['meteo', 'temps qu il fait'] },
    { id: 'afaire', titre: 'À faire', alias: ['a faire', 'taches', 'mes taches', 'to do', 'todo', 'liste de taches'] },
    { id: 'messages', titre: 'Messages', alias: ['messages', 'mes messages', 'conversation'] },
    { id: 'sante', titre: 'Santé', alias: ['sante', 'ma sante', 'corps', 'mon corps'] },
    { id: 'marche', titre: 'Marché', alias: ['marche', 'les marches', 'graphique', 'bougies'] },
    { id: 'actus', titre: 'Actualités', alias: ['actualites', 'actus', 'les actus', 'infos'] },
    { id: 'alertes', titre: 'Alertes', alias: ['alertes', 'alertes de l agent', 'agent de mars'] },
    { id: 'terre', titre: 'Événements', alias: ['evenements', 'evenements de la terre', 'seismes'] },
    { id: 'systemes', titre: 'Systèmes', alias: ['systemes', 'etat des systemes', 'etat du systeme'] }
  ];
  const idValide = id => ONGLETS.some(o => o.id === id);
  const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  /* Phrase parlée → ordre pour la grande fenêtre, ou null. Il faut dire « fenêtre » (ou un mot propre à l'accueil : tâches, santé, messages) pour ne pas voler les
     commandes qui existent déjà (« montre-moi la météo » ouvre toujours la réponse holographique). */
  function reconnaitre(texte) {
    const t = norm(texte); if (!t || t.split(' ').length > 10) return null;
    if (/^(?:rayle )?(?:ferme|fermer|enleve|retire|range)(?: moi)? (?:la |cette )?fenetre$/.test(t) || /^(?:rayle )?retour (?:au )?noyau$/.test(t)) return { action: 'fermer' };
    const verbe = /^(?:rayle )?(?:ouvre|ouvrir|montre|montrer|affiche|afficher|fais voir|va sur|mets)(?: moi)?(?: (?:l ecran|la fenetre|les fenetres|la page|mes|ma|mon|le|la|les|l)(?= |$))* ?/;
    const m = verbe.exec(t); if (!m) return null;
    const reste = t.slice(m[0].length).trim(), avecMot = /fenetre|ecran/.test(m[0]) || /\bfenetre\b/.test(t);
    for (const o of ONGLETS) {
      for (const a of o.alias) {
        if (reste === a || reste === a + ' sur l accueil') { if (avecMot || ['afaire', 'sante', 'messages'].includes(o.id)) return { action: 'ouvrir', id: o.id }; }
        if (avecMot && (reste === 'de ' + a || reste === 'des ' + a || reste === 'du ' + a || reste.endsWith(' ' + a))) return { action: 'ouvrir', id: o.id };
      }
    }
    return null;
  }

  /* ───── tâches (stockées sur l'appareil) ───── */
  const jourDe = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  function normaliserTaches(brut) {
    if (!Array.isArray(brut)) return [];
    return brut.filter(t => t && typeof t.texte === 'string' && t.texte.trim()).slice(0, 60)
      .map((t, i) => ({ id: String(t.id || 't' + i), texte: t.texte.trim().slice(0, 140), fait: !!t.fait, date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : null }));
  }
  function compteurs(taches, maintenant = Date.now()) {
    const auj = jourDe(maintenant), o = taches.filter(t => !t.fait);
    return { ouvertes: o.length, retard: o.filter(t => t.date && t.date < auj).length, aujourdhui: o.filter(t => t.date === auj).length, faites: taches.length - o.length };
  }
  const ajouter = (taches, texte, date, id) => { const t = String(texte || '').trim(); if (!t) return taches; return normaliserTaches(taches.concat([{ id: id || 't' + Date.now().toString(36), texte: t, fait: false, date: date || null }])); };
  const basculer = (taches, id) => taches.map(t => (t.id === id ? { ...t, fait: !t.fait } : t));
  const supprimer = (taches, id) => taches.filter(t => t.id !== id);
  /* Ordre d'affichage : en retard, aujourd'hui, à venir, sans date, puis faites. */
  function trier(taches, maintenant = Date.now()) {
    const auj = jourDe(maintenant), rang = t => (t.fait ? 4 : t.date && t.date < auj ? 0 : t.date === auj ? 1 : t.date ? 2 : 3);
    return taches.slice().sort((a, b) => rang(a) - rang(b) || String(a.date || '9').localeCompare(String(b.date || '9')));
  }

  /* ───── éclats du noyau : fragments angulaires qui tournent autour (générateur déterministe) ───── */
  function graine(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function eclats(n, g = 7) {
    const r = graine(g), out = [];
    for (let i = 0; i < n; i++) {
      const anneau = i % 3, rayon = [58, 74, 90][anneau] + r() * 10, ang = (i / n) * Math.PI * 2 + r() * 0.5, taille = 1.8 + r() * 4.2, pointes = 3 + Math.floor(r() * 2), pts = [];
      const cx = Math.cos(ang) * rayon, cy = Math.sin(ang) * rayon, rot = r() * Math.PI * 2, allonge = 1 + r() * 1.8;
      for (let k = 0; k < pointes; k++) { const a = rot + (k / pointes) * Math.PI * 2 + (r() - 0.5) * 0.7, d = taille * (0.55 + r() * 0.7); pts.push([+(cx + Math.cos(a) * d * allonge).toFixed(1), +(cy + Math.sin(a) * d).toFixed(1)]); }
      out.push({ anneau, pts, opacite: +(0.35 + r() * 0.55).toFixed(2), plein: r() > 0.45 });
    }
    return out;
  }

  /* ───── journal : mémoire courte des événements affichés dans la colonne de repos ───── */
  function ajouterJournal(liste, entree, max = 40) {
    const t = String(entree && entree.texte || '').replace(/\s+/g, ' ').trim(); if (!t) return liste;
    const dernier = liste[0]; if (dernier && dernier.texte === t && dernier.type === entree.type) return liste;
    return [{ t: entree.t || Date.now(), type: entree.type || 'info', texte: t.slice(0, 160) }].concat(liste).slice(0, max);
  }

  racine.G1Fenetres = { ONGLETS, idValide, reconnaitre, normaliserTaches, compteurs, ajouter, basculer, supprimer, trier, eclats, ajouterJournal, jourDe, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.G1Fenetres;
})(typeof window !== 'undefined' ? window : globalThis);
