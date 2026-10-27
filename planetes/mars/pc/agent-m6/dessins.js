/* ═════════════ DESSINS DU GRAPHIQUE : ceux de l'agent ET les tiens (M6 ; module pur, testé : planetes/mars/tests/m6-graphique-test.mjs) ═════════════
   Un dessin = un objet validé, étiqueté, groupé et masquable un par un. L'agent trace par OUTILS STRUCTURÉS (jamais de dessin libre) ; toi aussi (zone, ligne horizontale) ; l'agent lit les deux.
   Types : zone (rectangle prix × temps), ligne_h (niveau horizontal), ligne (oblique), marqueur (flèche, point), etiquette (texte), trade (entrée / stop / objectif), zone_liquidite, poc, zone_valeur.
   Chaque dessin porte : auteur ('agent' | 'utilisateur'), groupe (le plus souvent la stratégie qui l'a tracé), étiquette lisible, visible, note. Validation stricte : un nombre non fini, un prix absurde
   ou un temps hors plage est REFUSÉ avec la raison (jamais corrigé en silence). */
export const TYPES_DESSIN = Object.freeze(['zone', 'ligne_h', 'ligne', 'marqueur', 'etiquette', 'trade', 'zone_liquidite', 'poc', 'zone_valeur']);
export const COULEURS = Object.freeze({ haussier: '#27d98a', baissier: '#ff4d5e', neutre: '#a9c3d1', alerte: '#ffb000', info: '#4de3ff', liquidite: '#ff6fb1', valeur: '#b78cff' });
export const FORMES = Object.freeze(['fleche_haut', 'fleche_bas', 'cercle', 'carre']);
const MAX_PAR_DEFAUT = 400, FUTUR_MAX_MS = 30 * 86400e3;

/* Instant : nombre de ms, texte ISO (« 2026-10-22T14:30 » : UTC si pas de fuseau) ou « maintenant ». */
export function lireTemps(x, maintenant = Date.now()) {
  if (x == null || x === '') return NaN;
  if (typeof x === 'number') return Number.isFinite(x) ? x : NaN;
  const s = String(x).trim().toLowerCase(); if (s === 'maintenant' || s === 'now') return maintenant;
  if (/^\d{10,13}$/.test(s)) { const n = Number(s); return s.length <= 10 ? n * 1000 : n; }
  const iso = /(z|[+-]\d\d:?\d\d)$/i.test(s) || !/t|\d\d:\d\d/.test(s) ? s : s + 'z';
  const t = Date.parse(/^\d{4}-\d\d-\d\d$/.test(iso) ? iso + 't00:00:00z' : iso.replace(' ', 't')); return Number.isFinite(t) ? t : NaN;
}

const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.replace(',', '.')) : NaN);
const texte = (x, n = 80) => String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, n);

/* contexte = { tMin, tMax, prixRef, maintenant } : bornes de plausibilité pour refuser un dessin absurde. */
export function validerDessin(brut, contexte = {}) {
  const erreurs = [], b = brut && typeof brut === 'object' ? brut : null;
  if (!b) return { ok: false, erreurs: ['dessin vide'] };
  const maintenant = contexte.maintenant || Date.now(), type = String(b.type || '');
  if (!TYPES_DESSIN.includes(type)) return { ok: false, erreurs: ['type de dessin inconnu : « ' + type + ' » (permis : ' + TYPES_DESSIN.join(', ') + ')'] };
  const d = { type, auteur: b.auteur === 'utilisateur' ? 'utilisateur' : 'agent', groupe: texte(b.groupe || (b.auteur === 'utilisateur' ? 'mes dessins' : 'agent'), 60) || 'agent', etiquette: texte(b.etiquette, 80), note: texte(b.note, 240), visible: b.visible !== false };
  const col = b.couleur && COULEURS[b.couleur] ? b.couleur : (type === 'zone_liquidite' ? 'liquidite' : type === 'zone_valeur' || type === 'poc' ? 'valeur' : 'info'); d.couleur = col;
  const prix = (nom, v, requis = true) => {
    const p = num(v); if (!Number.isFinite(p)) { if (requis) erreurs.push(nom + ' : nombre attendu'); return NaN; }
    if (!(p > 0)) { erreurs.push(nom + ' : un prix doit être positif'); return NaN; }
    if (contexte.prixRef > 0 && (p > contexte.prixRef * 20 || p < contexte.prixRef / 20)) { erreurs.push(nom + ' : prix absurde (' + p + ') pour un instrument qui cote ' + contexte.prixRef); return NaN; }
    return p;
  };
  const temps = (nom, v, requis = true) => {
    const t = lireTemps(v, maintenant); if (!Number.isFinite(t)) { if (requis) erreurs.push(nom + ' : date ou heure attendue (ex. 2026-10-22T14:30)'); return NaN; }
    if (contexte.tMin != null && t < contexte.tMin - 365 * 86400e3) { erreurs.push(nom + ' : date trop ancienne par rapport aux données'); return NaN; }
    if (t > maintenant + FUTUR_MAX_MS) { erreurs.push(nom + ' : date trop lointaine dans le futur (30 jours au plus)'); return NaN; }
    return t;
  };
  switch (type) {
    case 'zone': case 'zone_liquidite': case 'zone_valeur': {
      const p1 = prix('prix_haut', b.prixHaut != null ? b.prixHaut : b.p1), p2 = prix('prix_bas', b.prixBas != null ? b.prixBas : b.p2);
      d.prixHaut = Math.max(p1, p2); d.prixBas = Math.min(p1, p2);
      if (Number.isFinite(p1) && Number.isFinite(p2) && p1 === p2) erreurs.push('une zone doit avoir une épaisseur (prix haut ≠ prix bas)');
      d.de = temps('de', b.de != null ? b.de : b.t1, type === 'zone'); d.a = b.a != null || b.t2 != null ? temps('a', b.a != null ? b.a : b.t2, false) : null;
      if (type !== 'zone') { if (!Number.isFinite(d.de)) d.de = null; }
      if (Number.isFinite(d.de) && Number.isFinite(d.a) && d.a < d.de) erreurs.push('la fin de la zone précède son début');
      break;
    }
    case 'ligne_h': case 'poc': d.prix = prix('prix', b.prix); d.de = b.de != null ? temps('de', b.de, false) : null; d.a = b.a != null ? temps('a', b.a, false) : null; break;
    case 'ligne': d.de = temps('de', b.de); d.prixDe = prix('prix_de', b.prixDe); d.a = temps('a', b.a); d.prixA = prix('prix_a', b.prixA); if (Number.isFinite(d.de) && Number.isFinite(d.a) && d.a <= d.de) erreurs.push('une ligne oblique va du plus ancien au plus récent'); break;
    case 'marqueur': d.t = temps('quand', b.t != null ? b.t : b.quand); d.prix = prix('prix', b.prix, false); d.forme = FORMES.includes(b.forme) ? b.forme : 'cercle'; break;
    case 'etiquette': d.t = temps('quand', b.t != null ? b.t : b.quand); d.prix = prix('prix', b.prix); if (!d.etiquette) erreurs.push('une étiquette a besoin d’un texte'); break;
    case 'trade': {
      d.sens = num(b.sens) > 0 || b.sens === 'achat' || b.sens === 'long' ? 1 : num(b.sens) < 0 || b.sens === 'vente' || b.sens === 'short' ? -1 : 0; if (!d.sens) erreurs.push('sens : achat ou vente');
      d.entree = prix('entree', b.entree); d.stop = prix('stop', b.stop); d.objectif = prix('objectif', b.objectif != null ? b.objectif : b.cible);
      d.t = temps('quand', b.t != null ? b.t : b.quand, false); d.a = b.a != null ? temps('a', b.a, false) : null;
      if (d.sens > 0 && !(d.stop < d.entree && d.objectif > d.entree)) erreurs.push('achat : le stop doit être sous l’entrée et l’objectif au-dessus');
      if (d.sens < 0 && !(d.stop > d.entree && d.objectif < d.entree)) erreurs.push('vente : le stop doit être au-dessus de l’entrée et l’objectif en dessous');
      if (!erreurs.length) d.R = Math.abs(d.objectif - d.entree) / Math.abs(d.entree - d.stop);
      break;
    }
    default: break;
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true, dessin: d };
}

/* Le magasin de dessins : ajout validé, listes filtrées, masquage un par un ou par groupe, suppression, export / import. */
export function creerDessins({ maintenant = () => Date.now(), max = MAX_PAR_DEFAUT, contexte = () => ({}) } = {}) {
  const liste = [], ecouteurs = new Set(); let compteur = 0;
  const changer = () => { for (const f of ecouteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
  const trouver = id => liste.find(d => d.id === id) || null;
  return {
    ajouter(brut) {
      if (liste.length >= max) return { ok: false, erreurs: ['trop de dessins (' + max + ' au plus) : efface ou masque d’anciens dessins'] };
      const r = validerDessin(brut, { maintenant: maintenant(), ...contexte() }); if (!r.ok) return r;
      const d = { id: 'd' + (++compteur), creeLe: maintenant(), ...r.dessin }; liste.push(d); changer(); return { ok: true, id: d.id, dessin: d };
    },
    lister(filtre = {}) { return liste.filter(d => (!filtre.auteur || d.auteur === filtre.auteur) && (!filtre.groupe || d.groupe === filtre.groupe) && (!filtre.type || d.type === filtre.type) && (filtre.visibles ? d.visible : true)).map(d => ({ ...d })); },
    trouver: id => { const d = trouver(id); return d ? { ...d } : null; },
    masquer(id, masque = true) { const d = trouver(id); if (!d) return { ok: false, erreur: 'dessin inconnu : ' + id }; d.visible = !masque; changer(); return { ok: true, n: 1 }; },
    masquerGroupe(groupe, masque = true) { const l = liste.filter(d => d.groupe === groupe); if (!l.length) return { ok: false, erreur: 'groupe inconnu : ' + groupe }; for (const d of l) d.visible = !masque; changer(); return { ok: true, n: l.length }; },
    supprimer(id) { const i = liste.findIndex(d => d.id === id); if (i < 0) return { ok: false, erreur: 'dessin inconnu : ' + id }; liste.splice(i, 1); changer(); return { ok: true, n: 1 }; },
    supprimerGroupe(groupe) { let n = 0; for (let i = liste.length - 1; i >= 0; i--) if (liste[i].groupe === groupe) { liste.splice(i, 1); n++; } if (n) changer(); return n ? { ok: true, n } : { ok: false, erreur: 'groupe inconnu : ' + groupe }; },
    /* Remplace TOUS les dessins d'un groupe d'agent par une nouvelle liste (un recalcul de stratégie ne laisse pas d'anciens dessins). */
    remplacerGroupe(groupe, specs) { const avant = liste.filter(d => d.groupe === groupe && d.auteur === 'agent'); const masques = new Set(avant.filter(d => !d.visible).map(d => d.etiquette)); for (const d of avant) liste.splice(liste.indexOf(d), 1); const ids = [], refus = []; for (const s of specs) { const r = this.ajouter({ ...s, groupe, auteur: 'agent' }); if (r.ok) { ids.push(r.id); if (masques.has(r.dessin.etiquette)) trouver(r.id).visible = false; } else refus.push(r.erreurs); } changer(); return { ok: true, ids, refus }; },
    vider(auteur = null) { const avant = liste.length; for (let i = liste.length - 1; i >= 0; i--) if (!auteur || liste[i].auteur === auteur) liste.splice(i, 1); if (avant !== liste.length) changer(); return { ok: true, n: avant - liste.length }; },
    groupes() { const g = new Map(); for (const d of liste) { const e = g.get(d.groupe) || { groupe: d.groupe, auteur: d.auteur, n: 0, visibles: 0 }; e.n++; if (d.visible) e.visibles++; g.set(d.groupe, e); } return [...g.values()]; },
    exporter: () => JSON.stringify({ format: 'rayle-dessins-1', dessins: liste }),
    importer(texte) { let j; try { j = JSON.parse(texte); } catch (e) { return { ok: false, erreur: 'fichier illisible' }; } if (!j || j.format !== 'rayle-dessins-1' || !Array.isArray(j.dessins)) return { ok: false, erreur: 'ce n’est pas un fichier de dessins Rayle' }; let n = 0, refus = 0; for (const d of j.dessins) { const r = this.ajouter(d); if (r.ok) { n++; if (d.visible === false) trouver(r.id).visible = false; } else refus++; } return { ok: true, n, refus }; },
    surChangement(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); }, n: () => liste.length
  };
}
