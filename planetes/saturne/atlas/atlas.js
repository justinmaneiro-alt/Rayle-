/* ═════════════ ATLAS D'ANATOMIE 2D (téléphone, tablette ; aussi quand le modèle 3D n'est pas disponible) ═════════════
   Hors ligne (contenu local), jamais une fenêtre vide : un écran de chargement s'affiche tout de suite. Schéma SVG du squelette avec zones touchables, liste par région (os, articulations, muscles),
   fiche courte, recherche, quiz (QCM et cartes mémoire). Pédagogique, à vérifier avec le cours / un atlas ; pas un outil de diagnostic.
   API : window.AtlasAnatomie = { ouvrir(), fermer(), etat() } (module ES : export ouvrir, fermer, etat). */
import { REGIONS, FICHES, GENRES, AVERTISSEMENT, parRegion, nomRegion, chercher, trouver, questionQcm, carteMemoire } from './atlas-donnees.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let racine = null, E = { onglet: 'regions', region: null, genre: 'os', fiche: null, q: '', quiz: { mode: 'qcm', score: 0, total: 0, q: null, repondu: null, carte: null, verso: false } };
/* squelette de face, stylisé : chaque groupe est une zone touchable (data-r) */
const SVG = `<svg class="at-svg" viewBox="0 0 220 440" role="img" aria-label="Schéma du squelette : touche une région">
<g class="at-z" data-r="tete" tabindex="0" role="button" aria-label="Tête et cou"><ellipse cx="110" cy="34" rx="22" ry="27"/><rect x="101" y="60" width="18" height="20" rx="4"/><path d="M92 50h36" /></g>
<g class="at-z" data-r="thorax" tabindex="0" role="button" aria-label="Thorax et ceinture scapulaire"><path d="M64 84q46-16 92 0l-6 12-6 4q8 40-12 70h-52q-20-30-12-70l-6-4z"/><rect x="104" y="92" width="12" height="56" rx="4" class="at-f"/><path d="M62 88q-20 2-30 14M158 88q20 2 30 14" /></g>
<g class="at-z" data-r="rachis" tabindex="0" role="button" aria-label="Rachis"><rect x="104" y="80" width="12" height="150" rx="6" class="at-r"/><path d="M108 90v136M112 90v136" class="at-f"/></g>
<g class="at-z" data-r="msup" tabindex="0" role="button" aria-label="Membre supérieur"><path d="M34 106l-16 76 4 2 22-70z"/><path d="M186 106l16 76-4 2-22-70z"/><path d="M18 184l-8 60 8 2 12-56z"/><path d="M202 184l8 60-8 2-12-56z"/><path d="M6 248l-4 22M214 248l4 22M12 248l2 24M208 248l-2 24"/></g>
<g class="at-z" data-r="bassin" tabindex="0" role="button" aria-label="Bassin et hanche"><path d="M72 226q38-18 76 0l8 24q-6 24-30 28l-16 14-16-14q-24-4-30-28z"/><circle cx="76" cy="256" r="8" class="at-f"/><circle cx="144" cy="256" r="8" class="at-f"/></g>
<g class="at-z" data-r="minf" tabindex="0" role="button" aria-label="Membre inférieur"><path d="M72 268l-8 78 12 2 12-76z"/><path d="M148 268l8 78-12 2-12-76z"/><circle cx="70" cy="352" r="9" class="at-f"/><circle cx="150" cy="352" r="9" class="at-f"/><path d="M62 362l-4 62 12 2 6-62z"/><path d="M158 362l4 62-12 2-6-62z"/><path d="M52 428h22M146 428h22"/></g>
</svg>`;
function fiche(f) {
  return `<article class="at-fiche" data-id="${esc(f.id)}"><header><small>${esc(GENRES[f.genre] || '')} · ${esc(nomRegion(f.region))}</small><h3>${esc(f.nom)}</h3><i>${esc(f.latin)}</i></header><p>${esc(f.resume)}</p><dl>${f.lignes.map(([t, v]) => `<dt>${esc(t)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><footer>${esc(AVERTISSEMENT)}</footer></article>`;
}
function listeHtml(L) { return L.length ? `<ul class="at-liste">${L.map(f => `<li><button type="button" data-f="${esc(f.id)}"><b>${esc(f.nom)}</b><small>${esc(f.latin)}</small></button></li>`).join('')}</ul>` : '<p class="at-vide">Aucun élément.</p>'; }
function vueRegions() {
  if (E.fiche) { const f = trouver(E.fiche); return `<div class="at-ret"><button type="button" data-a="retour">‹ ${E.region ? esc(nomRegion(E.region)) : 'Retour'}</button></div>${f ? fiche(f) : ''}`; }
  if (E.region) {
    const nb = g => parRegion(E.region, g).length;
    return `<div class="at-ret"><button type="button" data-a="regions">‹ Schéma</button><b>${esc(nomRegion(E.region))}</b></div><nav class="at-genres" role="tablist">${Object.entries(GENRES).map(([g, n]) => `<button type="button" role="tab" aria-selected="${E.genre === g}" data-g="${g}">${n} <small>${nb(g)}</small></button>`).join('')}</nav>${listeHtml(parRegion(E.region, E.genre))}`;
  }
  return `<p class="at-aide">Touche une région du squelette, ou choisis-la dans la liste.</p><div class="at-corps">${SVG}<ul class="at-regions">${REGIONS.map(r => `<li><button type="button" data-r="${r.id}"><b>${esc(r.nom)}</b><small>${FICHES.filter(f => f.region === r.id).length} fiches</small></button></li>`).join('')}</ul></div>`;
}
function vueRecherche() {
  const L = E.q ? chercher(E.q) : [];
  return `<div class="at-rech"><input type="search" inputmode="search" autocomplete="off" placeholder="Rechercher : fémur, deltoïde, genou…" value="${esc(E.q)}" data-q aria-label="Recherche"></div>${E.fiche ? fiche(trouver(E.fiche)) : (E.q ? (L.length ? listeHtml(L.slice(0, 60)) : '<p class="at-vide">Aucun résultat.</p>') : '<p class="at-aide">Os, articulations et muscles, en français ou en latin.</p>')}`;
}
function vueQuiz() {
  const Q = E.quiz;
  const bandeau = `<nav class="at-genres" role="tablist"><button type="button" role="tab" aria-selected="${Q.mode === 'qcm'}" data-qm="qcm">QCM</button><button type="button" role="tab" aria-selected="${Q.mode === 'cartes'}" data-qm="cartes">Cartes mémoire</button></nav>`;
  if (Q.mode === 'cartes') { if (!Q.carte) Q.carte = carteMemoire(); const c = Q.carte; return `${bandeau}<button type="button" class="at-carte${Q.verso ? ' at-verso' : ''}" data-a="retourner" aria-live="polite">${Q.verso ? `<small>${esc(c.region)}</small><p>${esc(c.verso)}</p>` : `<small>${esc(c.region)}</small><b>${esc(c.recto)}</b><i>${esc(c.sousRecto)}</i>`}</button><div class="at-actions"><button type="button" data-a="suivante">Carte suivante</button><button type="button" data-a="voir" data-id="${esc(c.fiche)}">Voir la fiche</button></div>`; }
  if (!Q.q) Q.q = questionQcm();
  const q = Q.q; if (!q) return bandeau + '<p class="at-vide">Pas assez de fiches pour un quiz.</p>';
  const fin = Q.repondu != null;
  return `${bandeau}<p class="at-score">Score : ${Q.score} / ${Q.total}</p><p class="at-q">${esc(q.enonce)}</p><div class="at-choix">${q.choix.map((c, i) => `<button type="button" data-c="${i}" class="${fin ? (i === q.juste ? 'at-ok' : (i === Q.repondu ? 'at-ko' : '')) : ''}" ${fin ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>${fin ? `<p class="at-expl">${Q.repondu === q.juste ? '✔ Bonne réponse. ' : '✖ Pas tout à fait. '}${esc(q.explication)}</p><div class="at-actions"><button type="button" data-a="suivante">Question suivante</button><button type="button" data-a="voir" data-id="${esc(q.fiche)}">Voir la fiche</button></div>` : ''}`;
}
function dessiner() {
  if (!racine) return; const c = racine.querySelector('.at-corps-vue'); if (!c) return;
  c.innerHTML = E.onglet === 'recherche' ? vueRecherche() : E.onglet === 'quiz' ? vueQuiz() : vueRegions();
  for (const b of racine.querySelectorAll('.at-onglets [data-o]')) b.setAttribute('aria-selected', String(b.dataset.o === E.onglet));
  if (E.onglet === 'recherche' && !E.fiche) { const i = c.querySelector('[data-q]'); if (i && document.activeElement !== i && E._focus) { i.focus(); const v = i.value; i.value = ''; i.value = v; } }
}
function clic(e) {
  const t = e.target, b = t.closest('button, [data-r]'); if (!b) return;
  const o = b.dataset.o; if (o) { E.onglet = o; E.fiche = null; if (o !== 'regions') E.region = null; E._focus = o === 'recherche'; dessiner(); return; }
  if (b.dataset.r) { E.region = b.dataset.r; E.fiche = null; E.genre = 'os'; dessiner(); const l = racine.querySelector('.at-corps-vue'); if (l) l.scrollTop = 0; return; }
  if (b.dataset.g) { E.genre = b.dataset.g; dessiner(); return; }
  if (b.dataset.f) { E.fiche = b.dataset.f; dessiner(); const l = racine.querySelector('.at-corps-vue'); if (l) l.scrollTop = 0; return; }
  if (b.dataset.qm) { E.quiz.mode = b.dataset.qm; E.quiz.q = null; E.quiz.repondu = null; E.quiz.carte = null; E.quiz.verso = false; dessiner(); return; }
  if (b.dataset.c != null) { const Q = E.quiz; if (Q.repondu != null) return; Q.repondu = +b.dataset.c; Q.total++; if (Q.repondu === Q.q.juste) Q.score++; dessiner(); return; }
  const a = b.dataset.a;
  if (a === 'retour') { E.fiche = null; dessiner(); } else if (a === 'regions') { E.region = null; E.fiche = null; dessiner(); }
  else if (a === 'suivante') { E.quiz.q = null; E.quiz.repondu = null; E.quiz.carte = null; E.quiz.verso = false; dessiner(); }
  else if (a === 'retourner') { E.quiz.verso = !E.quiz.verso; dessiner(); }
  else if (a === 'voir') { E.onglet = 'recherche'; E.q = ''; E.fiche = b.dataset.id; dessiner(); }
}
export function ouvrir() {
  if (racine) return racine;
  racine = document.createElement('section'); racine.id = 'atlas-anatomie'; racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-label', 'Atlas d’anatomie');
  racine.innerHTML = `<header class="at-haut"><div><b>Atlas d’anatomie</b><small>hors ligne · 2D · pédagogique</small></div></header><nav class="at-onglets" role="tablist"><button type="button" role="tab" data-o="regions" aria-selected="true">Régions</button><button type="button" role="tab" data-o="recherche" aria-selected="false">Recherche</button><button type="button" role="tab" data-o="quiz" aria-selected="false">Quiz</button></nav><div class="at-corps-vue" aria-live="polite"><p class="at-charge">Chargement de l’atlas…</p></div>`;
  document.body.appendChild(racine); document.body.classList.add('atlas-ouvert');
  racine.addEventListener('click', clic);
  racine.addEventListener('input', e => { if (e.target.matches('[data-q]')) { E.q = e.target.value; E.fiche = null; E._focus = true; const l = racine.querySelector('.at-corps-vue'), L = E.q ? chercher(E.q) : []; const zone = l.querySelector('.at-liste, .at-vide, .at-aide'); if (zone) zone.outerHTML = E.q ? (L.length ? listeHtml(L.slice(0, 60)) : '<p class="at-vide">Aucun résultat.</p>') : '<p class="at-aide">Os, articulations et muscles, en français ou en latin.</p>'; } });
  racine.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-r]') && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  dessiner(); return racine;
}
export function fermer() { if (racine) { racine.remove(); racine = null; } document.body.classList.remove('atlas-ouvert'); }
export const etat = () => ({ ouvert: !!racine, onglet: E.onglet, region: E.region, fiche: E.fiche, fiches: FICHES.length, quiz: { score: E.quiz.score, total: E.quiz.total } });
if (typeof window !== 'undefined') window.AtlasAnatomie = { ouvrir, fermer, etat };
