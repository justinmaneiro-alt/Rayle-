/* Outils communs des fichiers de fiches (fiches-*.js) */
export const SOURCE_GRAY = "Gray's Anatomy, 20e éd. américaine (1918), domaine public";

/** f(origine [os, texte], terminaison [os, texte], innervation, action, rapports, source, extra) → fiche. Un argument null reste non renseigné. */
export const f = (o, t, inn, act, rap, src, extra) => Object.assign({
  origine: o ? { os: o[0], txt: o[1] } : null, insertion: t ? { os: t[0], txt: t[1] } : null,
  innervation: inn || '', action: act || '', rapports: rap || '', source: src
}, extra || {});

/** v(origine, trajet et terminaison, territoire, source) → fiche de vaisseau */
export const v = (origine, trajet, territoire, src) => ({ origine: origine ? { os: null, txt: origine } : null, insertion: null, innervation: '', action: '', rapports: trajet || '', vascularisation: territoire || '', source: src });
