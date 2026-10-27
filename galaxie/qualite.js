/* ═════════════ NIVEAUX DE QUALITÉ DE LA GALAXIE ═════════════
   haute : PC gamer (RTX 3070 et plus) · moyenne : PC modeste, tablette · basse : téléphone, mode jeu.
   Le niveau « auto » part de haute et descend tout seul si les images par seconde chutent (jamais de remontée automatique). */
export const NIVEAUX = {
  haute:   { dpr: 2,   bloom: true,  bloomForce: 0.85, msaa: 4, anisotropie: 16, etoiles: 14000, asteroides: 3000, asteroidesDetail: 'haute', nuee: 12000, riche: true },
  moyenne: { dpr: 1.5, bloom: true,  bloomForce: 0.7,  msaa: 0, anisotropie: 8,  etoiles: 7000,  asteroides: 1400, asteroidesDetail: 'moyenne', nuee: 7000, riche: true },
  basse:   { dpr: 1,   bloom: false, bloomForce: 0,    msaa: 0, anisotropie: 2,  etoiles: 2500,  asteroides: 500,  asteroidesDetail: 'basse', nuee: 2500, riche: false }
};
export const ORDRE = ['haute', 'moyenne', 'basse'];
const CLE = 'rayle_galaxie_qualite';

export function qualiteMemorisee() {
  try { const v = localStorage.getItem(CLE); if (v === 'auto' || NIVEAUX[v]) return v; } catch (e) {}
  return 'auto';
}
export function memoriserQualite(v) { try { localStorage.setItem(CLE, v); } catch (e) {} }

/* Surveille les images par seconde : appelle `baisser()` si la moyenne reste sous le seuil pendant plusieurs mesures. */
export function surveillerFps({ seuil = 45, mesures = 3, fenetreMs = 2000, baisser }) {
  let n = 0, t0 = performance.now(), mauvaises = 0, fps = 60;
  return {
    get fps() { return fps; },
    image() {
      n++;
      const t = performance.now();
      if (t - t0 >= fenetreMs) {
        fps = n * 1000 / (t - t0); n = 0; t0 = t;
        if (document.hidden) { mauvaises = 0; return; }
        mauvaises = fps < seuil ? mauvaises + 1 : 0;
        if (mauvaises >= mesures) { mauvaises = 0; baisser(fps); }
      }
    }
  };
}
