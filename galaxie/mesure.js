/* ═════════════ MESURE DES IMAGES PAR SECONDE ═════════════
   MesureFps : tampon circulaire des durées d'image ; statistiques sur une fenêtre glissante (fps, moyenne, pire 1 %, pics).
   SondeGpu  : temps GPU réel par image quand le navigateur le permet (extension EXT_disjoint_timer_query_webgl2), sinon null.
   banc()    : test de performance : essaie chaque niveau de qualité quelques secondes, puis recommande le plus haut qui tient.
   Le tout est sans dépendance : testé sous Node (galaxie/tests/mesure-test.mjs). */

export class MesureFps {
  constructor(capacite = 900) { this.cap = capacite; this.d = new Float32Array(capacite); this.t = new Float64Array(capacite); this.n = 0; this.i = 0; this.dernier = null; }
  /* À appeler à chaque image réellement dessinée, avec l'horloge `maintenant` (ms). */
  image(maintenant) {
    if (this.dernier !== null) {
      const ms = maintenant - this.dernier;
      if (ms > 0 && ms < 2000) { this.d[this.i] = ms; this.t[this.i] = maintenant; this.i = (this.i + 1) % this.cap; this.n = Math.min(this.n + 1, this.cap); }
    }
    this.dernier = maintenant;
  }
  reset() { this.n = 0; this.i = 0; this.dernier = null; }
  /* Durées (ms) des images des `fenetreMs` dernières millisecondes, de la plus ancienne à la plus récente. */
  durees(fenetreMs = 5000) {
    const sortie = []; if (!this.n) return sortie;
    const fin = this.t[(this.i - 1 + this.cap) % this.cap];
    for (let k = this.n; k >= 1; k--) {
      const idx = (this.i - k + this.cap) % this.cap;
      if (fin - this.t[idx] <= fenetreMs) sortie.push(this.d[idx]);
    }
    return sortie;
  }
  stats(fenetreMs = 5000) {
    const d = this.durees(fenetreMs);
    if (d.length < 2) return { images: d.length, fps: 0, moyenne: 0, min: 0, max: 0, pire1: 0, ms: 0, pics: 0 };
    const somme = d.reduce((a, b) => a + b, 0);
    const tri = d.slice().sort((a, b) => a - b);
    const q = p => tri[Math.min(tri.length - 1, Math.floor(p * tri.length))];
    const msMoyen = somme / d.length;
    return {
      images: d.length,
      fps: 1000 / msMoyen,              // moyenne sur la fenêtre
      moyenne: 1000 / msMoyen,
      min: 1000 / tri[tri.length - 1],  // l'image la plus lente
      max: 1000 / tri[0],
      pire1: 1000 / q(0.99),            // « 1 % low » : ce que l'œil voit comme saccades
      ms: msMoyen,
      pics: d.filter(x => x > Math.max(34, msMoyen * 2)).length   // images au moins deux fois plus longues que la moyenne
    };
  }
  /* Dernières durées pour tracer la courbe (le plus récent à droite). */
  courbe(n = 120) { const d = this.durees(1e9); return d.slice(-n); }
}

export class SondeGpu {
  constructor(gl) {
    this.gl = gl; this.ext = null; this.attente = []; this.dernierMs = null; this.moy = null;
    try { this.ext = gl && (gl.getExtension('EXT_disjoint_timer_query_webgl2') || null); } catch (e) {}
  }
  get disponible() { return !!this.ext; }
  debut() { if (!this.ext || this.attente.length > 4) return; const q = this.gl.createQuery(); this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.courante = q; }
  fin() { if (!this.ext || !this.courante) return; this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.attente.push(this.courante); this.courante = null; }
  /* À appeler à chaque image : récupère les mesures terminées. */
  relever() {
    if (!this.ext) return;
    const gl = this.gl;
    while (this.attente.length) {
      const q = this.attente[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q); this.attente.shift();
      if (!disjoint && ns > 0) { this.dernierMs = ns / 1e6; this.moy = this.moy === null ? this.dernierMs : this.moy * 0.95 + this.dernierMs * 0.05; }
    }
  }
}

/* Recommandation : le niveau le plus élevé dont le « pire 1 % » reste fluide ; sinon le plus bas. */
export function recommander(resultats, { seuilPire1 = 50 } = {}) {
  const ordre = ['haute', 'moyenne', 'basse'];
  for (const n of ordre) { const r = resultats.find(x => x.niveau === n); if (r && r.pire1 >= seuilPire1) return n; }
  return 'basse';
}
export function resume(resultats, recommandation) {
  const f = x => Math.round(x);
  const lignes = resultats.map(r => r.niveau + ' : ' + f(r.moyenne) + ' images par seconde (pire 1 % : ' + f(r.pire1) + ')');
  return 'Test terminé. ' + lignes.join(' ; ') + '. Je recommande la qualité ' + recommandation + '.';
}

/* Test de performance. `hote` fournit : appliquer(niveau), mesure (MesureFps), attendre(ms), progres(texte, 0..1).
   Les niveaux sont essayés du plus haut au plus bas ; l'état d'origine est restauré par `restaurer()` à la fin. */
export async function banc(hote, { niveaux = ['haute', 'moyenne', 'basse'], echauffement = 1200, duree = 3500 } = {}) {
  const resultats = [];
  for (let i = 0; i < niveaux.length; i++) {
    const niveau = niveaux[i];
    hote.progres('Test de la qualité ' + niveau + '…', i / niveaux.length);
    await hote.appliquer(niveau);
    await hote.attendre(echauffement);          // laisse la scène se stabiliser (textures, compilation des shaders)
    hote.mesure.reset();
    await hote.attendre(duree);
    const s = hote.mesure.stats(duree);
    resultats.push({ niveau, moyenne: s.moyenne, pire1: s.pire1, min: s.min, pics: s.pics, ms: s.ms, ...(hote.extra ? hote.extra() : {}) });
  }
  hote.progres('Terminé', 1);
  const recommandation = recommander(resultats);
  return { resultats, recommandation, texte: resume(resultats, recommandation) };
}
