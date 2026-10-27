/* ═════════════ ANATOMIE : CATALOGUE DES MOUVEMENTS ET DES PATHOLOGIES (fenêtre avec recherche et filtres) ═════════════
   Le contenu est une liste d'entrées { id, nom, categorie, niveau, alias } fournie par les modules de données ; la fenêtre ne connaît ni la 3D ni la médecine.
   Recherche insensible aux accents et aux majuscules (nom, catégorie, alias), filtres par catégorie, compteur ; un clic choisit l'entrée (surChoix). */
export const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));

/* Filtre pur (testé) : texte libre + catégorie (ou null = toutes) → entrées, triées par catégorie puis nom. */
export function filtrer(entrees, texte = '', categorie = null) {
  const mots = norm(texte).split(' ').filter(Boolean);
  const ok = e => (!categorie || e.categorie === categorie) && mots.every(m => norm([e.nom, e.categorie, ...(e.alias || []), e.niveau || ''].join(' ')).includes(m));
  return entrees.filter(ok).sort((a, b) => String(a.categorie).localeCompare(String(b.categorie), 'fr') || String(a.nom).localeCompare(String(b.nom), 'fr'));
}
export const categories = entrees => { const n = new Map(); for (const e of entrees) n.set(e.categorie, (n.get(e.categorie) || 0) + 1); return [...n.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'fr')).map(([nom, nb]) => ({ nom, nb })); };

export function contenuCatalogue({ entrees, titre, surChoix, note = '' }) {
  const el = document.createElement('div'); el.className = 'saf-cat';
  el.innerHTML = '<input type="search" data-r="q" placeholder="Rechercher (nom, catégorie…)" aria-label="Rechercher dans ' + esc(titre) + '"><div class="saf-filtres" data-r="filtres"></div><p class="saf-compte" data-r="compte"></p><div data-r="liste"></div>' + (note ? '<p class="saf-avert">' + esc(note) + '</p>' : '');
  const q = el.querySelector('[data-r="q"]'), fil = el.querySelector('[data-r="filtres"]'), compte = el.querySelector('[data-r="compte"]'), liste = el.querySelector('[data-r="liste"]');
  let cat = null;
  const cats = categories(entrees);
  fil.innerHTML = '<button type="button" data-cat="" class="actif">Toutes (' + entrees.length + ')</button>' + cats.map(c => '<button type="button" data-cat="' + esc(c.nom) + '">' + esc(c.nom) + ' (' + c.nb + ')</button>').join('');
  function rendre() {
    const r = filtrer(entrees, q.value, cat); compte.textContent = r.length + ' résultat' + (r.length > 1 ? 's' : '') + (q.value || cat ? ' sur ' + entrees.length : '');
    let h = '', derniere = null; for (const e of r) { if (e.categorie !== derniere) { h += '<h4>' + esc(e.categorie) + '</h4><div class="saf-liste">'; derniere = e.categorie; } h += '<button type="button" data-id="' + esc(e.id) + '"><span>' + esc(e.nom) + '</span>' + (e.niveau ? '<small>' + esc(e.niveau) + '</small>' : '') + '</button>'; if (!r[r.indexOf(e) + 1] || r[r.indexOf(e) + 1].categorie !== e.categorie) h += '</div>'; }
    liste.innerHTML = h || '<p class="saf-absent">Aucun résultat : essaie un autre mot.</p>';
  }
  q.addEventListener('input', rendre);
  fil.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat || null; fil.querySelectorAll('button').forEach(x => x.classList.toggle('actif', x === b)); rendre(); });
  liste.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) surChoix(b.dataset.id); });
  rendre(); return el;
}
