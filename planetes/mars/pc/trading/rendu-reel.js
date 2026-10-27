/* ═════════════ DONNÉES D'UNE FENÊTRE DE LA TABLE → HTML (module pur, testé) ═════════════
   Les fenêtres de la table de Mars reçoivent des « réels » ({ etat, etiquette, jauges, liste, courbes, entete, pied, vide, message, erreur }). Le terminal par groupes
   affiche exactement les mêmes données, en grand, dans une fenêtre du gestionnaire. Jamais de chiffre inventé : état 'bientot' = message, 'indisponible' = raison. */
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COUL = { ok: 'var(--v1-haut,#2fd18b)', warn: '#ffb347', ko: 'var(--v1-bas,#ff5d6e)', info: 'var(--v1-accent,#8fd0e3)' };

export function courbeSvg(valeurs, w = 300, h = 70) {
  if (!valeurs || valeurs.length < 2) return '';
  const min = Math.min(...valeurs), max = Math.max(...valeurs), pas = valeurs.length > 200 ? Math.ceil(valeurs.length / 200) : 1;
  const pts = valeurs.filter((_, i) => i % pas === 0 || i === valeurs.length - 1).map((v, i, a) => (i / (a.length - 1) * w).toFixed(1) + ',' + (h - 4 - (v - min) / ((max - min) || 1) * (h - 8)).toFixed(1)).join(' ');
  return '<svg class="tm-courbe" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline fill="none" stroke="#8fd0e3" stroke-width="1.6" points="' + pts + '"/></svg>';
}
export function reelVersHtml(r, def = {}) {
  if (!r || r.etat === 'chargement') return '<p class="tm-vide">Chargement des données…</p>';
  if (r.etat === 'indisponible') return '<p class="tm-vide tm-ko">INDISPONIBLE : ' + esc(r.erreur || 'raison inconnue') + '</p>';
  if (r.etat === 'bientot') return '<p class="tm-vide">EN PRÉPARATION · ' + esc(r.message || 'pas encore branché') + '</p><p class="tm-note">Rien n’est affiché tant que la donnée réelle n’est pas branchée.</p>';
  let h = '';
  if (r.etiquette) h += '<span class="tm-etiquette">' + esc(r.etiquette) + '</span>';
  if (r.entete) h += '<p class="tm-entete">' + esc(r.entete) + '</p>';
  if (r.jauges && r.jauges.length) h += r.jauges.map(j => '<div class="tm-jauge"><div class="tm-jauge-t"><span>' + esc(j.nom) + '</span><b>' + esc(j.texte) + '</b></div><div class="tm-jauge-b"><i style="width:' + Math.round(Math.max(0, Math.min(1, j.part || 0)) * 100) + '%;background:' + (COUL[j.couleur] || COUL.info) + '"></i></div></div>').join('');
  if (r.liste && r.liste.length) h += '<ul class="tm-liste">' + r.liste.map(x => '<li><span' + (x.c ? ' style="color:' + esc(x.c) + '"' : '') + '>' + esc(x.g) + '</span>' + (x.d != null ? '<b>' + esc(x.d) + '</b>' : '') + '</li>').join('') + '</ul>';
  else if (r.vide && !(r.jauges && r.jauges.length) && !(r.courbes && r.courbes.length)) h += '<p class="tm-vide">' + esc(r.vide) + '</p>';
  if (r.courbes && r.courbes.length) h += r.courbes.map(c => '<div class="tm-courbe-bloc"><div class="tm-jauge-t"><span>' + esc(c.nom) + '</span><b>' + (c.fin != null ? (c.fin >= 0 ? '+' : '') + Number(c.fin).toFixed(1) + ' R' : '') + '</b></div>' + courbeSvg(c.valeurs) + '</div>').join('');
  if (r.pied) h += '<p class="tm-note">' + esc(r.pied) + '</p>';
  return h || '<p class="tm-vide">Aucune donnée à afficher pour le moment.</p>' + (def.titre ? '' : '');
}

/* Magasin des « réels » : la table de Mars y dépose chaque mise à jour, le terminal les relit. */
export function creerMagasin() {
  const donnees = new Map(), abonnes = new Set();
  return {
    poser(id, r) { donnees.set(id, r); for (const f of abonnes) { try { f(id, r); } catch (e) { /* un abonné défaillant ne bloque pas les autres */ } } },
    lire: id => donnees.get(id) || null,
    abonner(f) { abonnes.add(f); return () => abonnes.delete(f); },
    effacer() { donnees.clear(); }
  };
}
export const magasinReels = creerMagasin();
