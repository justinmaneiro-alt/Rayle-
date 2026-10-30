"use strict";
/* ═════════════ GESTES V11 : textes et logique PURS du mode simple (aide « Que puis-je faire ? », geste détecté en direct) ═════════════
   Aucun accès au DOM : testé sous Node (galaxie/tests/gestes-v11-calcul-test.mjs). L'interface (gestes-v11-ui.js) ne fait que les afficher. */
(function (racine) {
  /* Les 5 gestes du mode simple, dans l'ordre où on les apprend. `pictogramme` = nom de l'animation CSS (gestes-v11.css). */
  const GESTES_SIMPLES = [
    { id: 'pointer', titre: 'Pointer', texte: 'La pointe de l’index déplace le curseur.', pictogramme: 'pointer' },
    { id: 'pincer', titre: 'Pincer', texte: 'Pouce + index qui se touchent = clic. Pincer et bouger = glisser une fenêtre ou un objet.', pictogramme: 'pincer' },
    { id: 'balayer', titre: 'Balayer', texte: 'Main ouverte qui balaie à gauche ou à droite = parcourir les piles, revenir.', pictogramme: 'balayer' },
    { id: 'deux', titre: 'Deux mains', texte: 'Deux mains qui s’écartent = agrandir ; qui se rapprochent = rétrécir.', pictogramme: 'deux' },
    { id: 'paume', titre: 'Paume ouverte', texte: 'Paume bien droite, immobile 1,5 s = retour à l’accueil / à la vue d’origine.', pictogramme: 'paume' }
  ];
  /* Gestes réservés au mode avancé (réglage ⚙ « Mode avancé »). */
  const GESTES_AVANCES = [
    { id: 'poing', titre: 'Poing tenu 2 s', texte: 'Met les gestes en pause (barre de progression ; rouvre la main pour annuler).' },
    { id: 'ranger', titre: 'Main ouverte vers le bas', texte: 'Range la fenêtre sous le curseur.' },
    { id: 'fermer', titre: 'Poing court puis main ouverte', texte: 'Ferme la fenêtre sous le curseur (confirmation de 0,5 s).' },
    { id: 'recul', titre: 'Main qui recule', texte: 'Retour à l’accueil.' },
    { id: 'deux-doigts', titre: 'Deux doigts', texte: 'Défiler. Index immobile 1 s : suivre un objet 3D.' },
    { id: 'deux-ouvertes', titre: 'Deux mains ouvertes', texte: 'Pivoter l’objet 3D.' }
  ];
  const POSES = { pointer: 'Pointer', pince: 'Pincer', ouverte: 'Paume ouverte', poing: 'Poing', deux: 'Deux doigts', autre: 'Main vue' };
  const EVENEMENTS = { clic: 'Clic', clic_droit: 'Clic droit', saisie: 'Glisser', lacher: 'Relâché', vue_initiale: 'Accueil', accueil: 'Accueil', ranger_bas: 'Fenêtre rangée', fermer: 'Fenêtre fermée', engage: 'Prêt', reprise: 'Gestes repris', pause: 'Gestes en pause' };

  /* Ce que le moteur voit en ce moment, en quelques mots. `etat` = état du moteur V5 (mode, pose, saisie, deux, progres, mains, simple), `evt` = { type, n, sens, age } du dernier événement (age en ms).
     Rend { texte, ton: 'ok'|'att'|'ko'|'', progres: 0..1|null }. */
  function geste(etat, evt) {
    const e = etat || {}, p = e.progres || null;
    if (e.mode === 'pause' || e.pause) return { texte: 'En pause — bouton ou « reprends les gestes »', ton: 'att', progres: null };
    if (!e.mains && e.mode !== 'repos') return { texte: '', ton: '', progres: null };
    if (evt && evt.age != null && evt.age < 700 && EVENEMENTS[evt.type]) {
      const t = evt.type === 'clic' && evt.n === 2 ? 'Double clic' : evt.type === 'balayage' ? 'Balayage ' + (evt.sens || '') : EVENEMENTS[evt.type];
      if (evt.type !== 'engage' || e.mode === 'engage') return { texte: t, ton: 'ok', progres: null };
    }
    if (evt && evt.type === 'balayage' && evt.age != null && evt.age < 700) return { texte: 'Balayage ' + (evt.sens || ''), ton: 'ok', progres: null };
    if (e.mode === 'repos') return { texte: 'Main vue — je m’active…', ton: 'att', progres: p && p.type === 'engage' ? p.v : null };
    if (e.deux) return { texte: e.deux === 'ouvertes' ? 'Deux mains : pivoter' : 'Deux mains : agrandir / rétrécir', ton: 'ok', progres: null };
    if (e.saisie) return { texte: 'Glisser (pincé)', ton: 'ok', progres: null };
    if (p && p.type === 'reset') return { texte: 'Paume : accueil dans ' + Math.max(0, (1.5 * (1 - p.v))).toFixed(1) + ' s', ton: 'att', progres: p.v };
    if (p && p.type === 'pause') return { texte: 'Pause en cours — rouvre la main pour annuler', ton: 'att', progres: p.v };
    if (p && p.type === 'fermer') return { texte: 'Fermer cette fenêtre ? Garde la main ouverte', ton: 'att', progres: p.v };
    if (p && p.type === 'pince' && e.pose !== 'pince') return { texte: 'Pincer…', ton: 'att', progres: p.v };
    return { texte: POSES[e.pose] || POSES.autre, ton: '', progres: null };
  }

  /* Texte lu à voix haute / affiché par « aide des gestes » (mode simple ou avancé). */
  function texteAide(avance) {
    const l = GESTES_SIMPLES.map((g, i) => (i + 1) + '. ' + g.titre + ' : ' + g.texte);
    if (avance) l.push('Mode avancé en plus : ' + GESTES_AVANCES.map(g => g.titre + ' (' + g.texte + ')').join(' ; '));
    l.push('Pour mettre les gestes en pause : le bouton « Pause », ou dis « pause les gestes ». « Reprends les gestes » les relance.');
    return l.join(' ');
  }
  const api = { GESTES_SIMPLES, GESTES_AVANCES, POSES, EVENEMENTS, geste, texteAide };
  racine.GestesV11 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
