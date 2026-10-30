"use strict";
/* ═════════════ CAMÉRA RAYLE (V10) : adaptation de la résolution à la cadence réelle, calcul PUR (testé sous Node) ═════════════
   Le téléphone mesure une fois par seconde { camFps (images de la caméra/s), detFps (images détectées/s), detMs (durée d'une détection) } et demande à cette fonction quoi faire :
     · détection trop lente (< 38 images/s ou > 24 ms par image) alors que la caméra suit  →  BAISSER d'un niveau de résolution ;
     · caméra elle-même lente (peu de lumière, < 38 images/s)                               →  signaler « plus de lumière » (et essayer un niveau plus bas, une seule fois) ;
     · stable et rapide pendant 12 s                                                        →  REMONTER d'un niveau (jamais au-dessus du maximum choisi) ;
     · plus bas niveau et toujours trop lent                                                →  proposer le calcul sur le PC (jamais activé tout seul : confidentialité) ;
     · cadence qui s'effondre avec le temps (limitation thermique)                          →  mode économe.
   Anti-oscillation : un délai de repos après chaque changement, et si l'on est redescendu peu après être monté, le niveau est verrouillé 2 minutes. Chaque décision a une `raison` en français ;
   `auto: false` ne change jamais rien (retour manuel). */
(function (racine) {
  const NIVEAUX = [{ id: 0, l: 320, h: 240 }, { id: 1, l: 480, h: 360 }, { id: 2, l: 640, h: 480 }];
  const SEUIL = { detFps: 38, detMs: 24, rapideFps: 50, rapideMs: 10, monterApresS: 12, reposDescenteS: 5, reposMonteeS: 20, verrouS: 120, thermique: 0.25 };
  const mediane = l => { const s = l.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : null; };

  function creerAdaptation({ niveau = 2, niveauMax = 2, auto = true } = {}) {
    const E = { niveau, niveauMax, auto, histo: [], dernierChangement: -1e9, dernierSens: 0, verrouJusqua: -1e9, cameraEssayee: false, piques: [], t: 0 };
    const trop = s => s.detMs > SEUIL.detMs || (s.detFps < SEUIL.detFps && (s.camFps == null || s.camFps - s.detFps >= 6));
    function echantillon(s) {   // s : { t (secondes), camFps, detFps, detMs, mainVue }
      E.t = s.t; E.histo.push(s); if (E.histo.length > 90) E.histo.shift();
      const sortie = { action: 'rien', niveau: E.niveau, raison: '', lumiere: false, proposerPc: false, eco: false };
      const actifs = E.histo.filter(x => x.detFps != null);
      if (actifs.length < 3) return sortie;
      const p3 = actifs.slice(-3), p4 = actifs.slice(-4);
      if (p4.length >= 4 && p4.every(x => x.camFps != null && x.camFps < SEUIL.detFps && x.detFps >= x.camFps - 4)) { sortie.lumiere = true; sortie.raison = 'La caméra elle-même tourne à ' + Math.round(mediane(p4.map(x => x.camFps))) + ' images/s : plus de lumière sur la main.'; }
      // limitation thermique : médiane des 8 dernières secondes contre le meilleur palier des 60 dernières
      if (actifs.length >= 24) { const recent = mediane(actifs.slice(-8).map(x => x.detFps)), meilleur = Math.max(...[...Array(Math.floor((actifs.length - 8) / 8))].map((_, i) => mediane(actifs.slice(i * 8, i * 8 + 8).map(x => x.detFps)))); if (meilleur > 0 && (meilleur - recent) / meilleur >= SEUIL.thermique) { sortie.eco = true; sortie.raison = sortie.raison || 'La cadence baisse avec le temps (le téléphone chauffe) : mode économe.'; } }
      if (!E.auto) return sortie;
      const depuis = s.t - E.dernierChangement, verrou = s.t < E.verrouJusqua;
      if (p3.length === 3 && p3.every(trop) && depuis >= SEUIL.reposDescenteS) {
        if (E.niveau > 0) {
          if (E.dernierSens > 0 && depuis < 40) E.verrouJusqua = s.t + SEUIL.verrouS;   // redescendu juste après être monté : on arrête d'essayer de remonter
          E.niveau--; E.dernierChangement = s.t; E.dernierSens = -1; sortie.action = 'baisser'; sortie.niveau = E.niveau;
          sortie.raison = 'Détection trop lente (' + Math.round(mediane(p3.map(x => x.detFps))) + ' images/s, ' + Math.round(mediane(p3.map(x => x.detMs))) + ' ms par image) : résolution réduite à ' + NIVEAUX[E.niveau].l + ' × ' + NIVEAUX[E.niveau].h + '.';
        } else if (actifs.length >= 6 && actifs.slice(-6).every(trop)) { sortie.proposerPc = true; sortie.raison = 'Même à la plus petite résolution, la détection reste trop lente sur ce téléphone : le calcul sur le PC règlerait le problème.'; }
        return sortie;
      }
      if (sortie.lumiere && !E.cameraEssayee && E.niveau > 0 && depuis >= SEUIL.reposDescenteS) { E.cameraEssayee = true; E.niveau--; E.dernierChangement = s.t; E.dernierSens = -1; sortie.action = 'baisser'; sortie.niveau = E.niveau; return sortie; }
      if (E.niveau < E.niveauMax && !verrou && depuis >= SEUIL.reposMonteeS) {
        const f = actifs.slice(-SEUIL.monterApresS);
        if (f.length >= SEUIL.monterApresS && f.every(x => x.detFps >= (x.camFps != null ? Math.min(SEUIL.rapideFps, x.camFps * 0.9) : SEUIL.rapideFps) && x.detMs < SEUIL.rapideMs && (x.camFps == null || x.camFps >= SEUIL.rapideFps))) {
          E.niveau++; E.dernierChangement = s.t; E.dernierSens = 1; sortie.action = 'monter'; sortie.niveau = E.niveau; sortie.raison = 'Tout est fluide depuis ' + SEUIL.monterApresS + ' s : résolution relevée à ' + NIVEAUX[E.niveau].l + ' × ' + NIVEAUX[E.niveau].h + '.';
        }
      }
      return sortie;
    }
    return { echantillon, etat: () => ({ niveau: E.niveau, niveauMax: E.niveauMax, auto: E.auto, verrouJusqua: E.verrouJusqua }), regler(p) { if (p.auto != null) E.auto = !!p.auto; if (p.niveauMax != null) { E.niveauMax = p.niveauMax; if (E.niveau > p.niveauMax) E.niveau = p.niveauMax; } if (p.niveau != null) E.niveau = p.niveau; } };
  }
  racine.AdaptationCamera = { NIVEAUX, SEUIL, creerAdaptation };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.AdaptationCamera;
})(typeof globalThis !== 'undefined' ? globalThis : window);
