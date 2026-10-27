/* ═════════════ CONTENU DES FENÊTRES D'ACTUALITÉS (pur) ═════════════
   Transforme la réponse du Worker (/actualites) en données prêtes à afficher. Seuls titre, média, date et lien existent : rien n'est résumé ni recopié. */
export const MAX_TITRES = 12;

/* « il y a 12 min », « il y a 3 h », « hier », « le 14 oct. » ; date inconnue → chaîne vide (jamais de date inventée). */
export function dateRelative(iso, maintenant = Date.now()) {
  const t = Date.parse(iso || ''); if (!Number.isFinite(t)) return '';
  const s = Math.round((maintenant - t) / 1000);
  if (s < -300) return '';                                        // date dans le futur : suspecte, on ne l'affiche pas
  if (s < 90) return 'à l’instant';
  if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
  if (s < 172800) return 'hier';
  if (s < 7 * 86400) return 'il y a ' + Math.round(s / 86400) + ' j';
  return 'le ' + new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
export const urlSure = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };

/* res : réponse du Worker ; renvoie { titre, lignes:[{titre,url,source,quand,langue}], indisponibles:[médias en panne], sources:[médias ok], note } */
export function modeleActus(res, maintenant = Date.now()) {
  const lignes = (res && res.titres || []).map(t => ({ titre: String(t.titre || '').trim(), url: urlSure(t.url), source: String(t.source || 'source inconnue'), quand: dateRelative(t.date, maintenant), langue: t.langue || '', image: /^https:\/\/[^\s<>"']{8,400}$/i.test(t.image || '') ? t.image : null }))
    .filter(l => l.titre && l.url).slice(0, MAX_TITRES);
  const src = res && res.sources || [];
  const ok = [...new Set(src.filter(s => s.ok).map(s => s.nom).concat(lignes.map(l => l.source)))];
  const panne = src.filter(s => !s.ok).map(s => s.nom);
  const nom = res && res.pays && res.pays.nom || '';
  let note = '';
  if (res && res.perime) note = 'Copie enregistrée plus tôt : les sources ne répondent pas pour le moment.';
  else if (res && res.gdelt && res.gdelt.ok) note = 'Complété par GDELT.';
  return { titre: nom === 'Monde' ? 'À la une dans le monde' : 'Actualités · ' + nom, pays: res && res.pays || null, lignes, sources: ok, indisponibles: panne, note };
}
/* Phrase que Raylé peut dire : uniquement les titres reçus, avec leur média. */
export function phraseActus(modele, n = 3) {
  if (!modele.lignes.length) return 'Je n’ai trouvé aucun titre pour ' + (modele.pays ? modele.pays.nom : 'ce pays') + ' pour le moment.';
  const t = modele.lignes.slice(0, n).map(l => l.source + ' titre : ' + l.titre.replace(/\s+/g, ' ').replace(/^EN DIRECT\s*[–-]\s*/i, '') + '.');
  return (modele.pays && modele.pays.nom === 'Monde' ? 'À la une dans le monde. ' : 'Actualités, ' + (modele.pays ? 'pays : ' + modele.pays.nom + '. ' : '')) + t.join(' ');
}
