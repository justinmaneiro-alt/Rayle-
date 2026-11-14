/* ═════════════ ANALYSE IA : interface (mode manuel par défaut, mode automatique si un fournisseur est configuré côté serveur) ═════════════
   Manuel : « Exporter pour analyse » (texte structuré + capture) → l'utilisateur colle la réponse JSON de n'importe quelle IA → « Importer la réponse » → image annotée dessinée par notre code.
   Automatique : même JSON, même validation, même dessin ; coût / quota affichés avant l'envoi ; toute erreur = message clair + retour au mode manuel. Aucune clé dans le navigateur. */
import { texteGraphique, texteActualite, texteScenarios, bougie } from '../../../marches/ia/prompt.js';
import { valider, AVERTISSEMENT } from '../../../marches/ia/schema.js';
import { dessinerGraphiqueAnnote, dessinerSurImage } from '../../../marches/ia/dessin.js';
import { base } from './client.js';
import { esc } from './rendu.js';

const MENTION = 'Aide à la lecture, peut se tromper, ne pas utiliser comme signal. Scénarios conditionnels seulement : aucune probabilité, aucune taille de position.';
export function uniteDepuis(bougies) {
  const B = bougies.map(bougie); if (B.length < 3) return '?'; const d = B.slice(1).map((b, i) => b.t - B[i].t).sort((a, b) => a - b)[Math.floor((B.length - 1) / 2)] / 60000;
  return d <= 7 ? 'M5' : d <= 20 ? 'M15' : d <= 90 ? 'H1' : d <= 500 ? 'H4' : 'Jour';
}
/* Données du graphique du terminal (window.__or) : bougies visibles, niveaux majeurs, flèches v8, unité */
export function entreeTerminal(T = window.__or) {
  if (!T || !T.graph) return null;
  const e = T.graph.etat(), bougies = (e.bougies || []).slice(-400); if (!bougies.length) return null;
  let niveaux = []; try { niveaux = (T.graph.lectureV8Etat().zonesPix || []).map(z => ({ nom: z.nom || (z.cote === 'support' ? 'Support' : z.cote === 'resistance' ? 'Résistance' : 'Zone'), bas: z.bas, haut: z.haut, role: z.cote || z.role })).filter(z => isFinite(z.bas) && isFinite(z.haut)); } catch (x) { /* pas de lecture */ }
  let fleches = []; try { fleches = (T.flechesT.liste() || []).filter(f => !f.masquee).slice(-8).map(f => ({ t: f.tCloture || f.t, sens: f.sens, type: f.type, niveau: f.niveau })); } catch (x) { /* pas de flèches */ }
  return { actif: (document.body.dataset.actif || 'XAU').toUpperCase(), unite: uniteDepuis(bougies), bougies, niveaux, fleches };
}
async function post(chemin, corps) { const r = await fetch(base() + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(60000) }); return r.json(); }
const copier = async t => { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } };
const telecharger = (blob, nom) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

/* type : 'graphique' | 'scenarios' | 'actualite' ; getEntree() → données (peut renvoyer null : message clair) */
export function monterAnalyse(conteneur, { type = 'graphique', getEntree, titre = 'Analyse par IA' } = {}) {
  const S = { texte: '', plage: null, analyse: null, entree: null, auto: null };
  conteneur.insertAdjacentHTML('beforeend', `<section class="mk-section mk-ia" data-mk-ia="${type}"><h3>${esc(titre)}</h3>
    <p class="mk-avert" role="note">${esc(MENTION)}</p>
    <div class="mk-ia-etat" data-ia-etat role="status">Mode manuel : aucune clé ni abonnement nécessaire.</div>
    <div class="mk-ia-barre"><button type="button" data-ia-auto hidden>Analyser automatiquement</button><button type="button" data-ia-export>Exporter pour analyse</button></div>
    <div class="mk-ia-export" data-ia-zone-export hidden>
      <p class="mk-note">1. Copiez ce texte dans le chat de l'IA de votre choix (ChatGPT, Gemini, Claude, Mistral…). 2. Collez sa réponse JSON plus bas.</p>
      <textarea readonly data-ia-texte rows="9" aria-label="Texte à coller dans une IA"></textarea>
      <div class="mk-ia-barre"><button type="button" data-ia-copier>Copier le texte</button>${type !== 'actualite' ? '<button type="button" data-ia-capture>Enregistrer la capture</button>' : ''}</div>
    </div>
    <div class="mk-ia-import"><label>Réponse JSON de l'IA<textarea data-ia-reponse rows="6" placeholder='{ "type": "${type === 'actualite' ? 'actualite' : 'graphique'}", … }' aria-label="Réponse JSON de l'IA"></textarea></label>
      ${type !== 'actualite' ? `<details class="mk-ia-img"><summary>Dessiner sur ma propre capture (positions approximatives)</summary><label>Capture <input type="file" accept="image/*" data-ia-fichier></label><label>Prix en haut de l'image <input type="number" step="any" data-ia-haut></label><label>Prix en bas de l'image <input type="number" step="any" data-ia-bas></label></details>` : ''}
      <div class="mk-ia-barre"><button type="button" data-ia-importer>Importer la réponse</button></div></div>
    <div class="mk-ia-msg" data-ia-msg role="alert" hidden></div>
    <div class="mk-ia-sortie" data-ia-sortie></div></section>`);
  const R = conteneur.querySelector(`[data-mk-ia="${type}"]`), q = s => R.querySelector(s), msg = (t, ok) => { const m = q('[data-ia-msg]'); m.hidden = !t; m.textContent = t || ''; m.className = 'mk-ia-msg ' + (ok ? 'mk-note' : 'mk-avert'); };
  const preparer = () => { const e = getEntree(); if (!e) throw new Error('aucune donnée à analyser : ouvrez d\'abord le graphique du terminal (onglet Graphique) et attendez le chargement des bougies'); S.entree = e; const p = type === 'actualite' ? texteActualite(e) : type === 'scenarios' ? texteScenarios(e) : texteGraphique(e); S.texte = p.texte; S.plage = p.plage; return p; };

  /* état du fournisseur + coût estimé avant l'envoi */
  (async () => {
    try {
      const r = await fetch(base() + '/marches/ia/etat', { cache: 'no-store', signal: AbortSignal.timeout(8000) }); const e = await r.json(); S.auto = e;
      if (e.automatique) {
        q('[data-ia-auto]').hidden = false; let cout = ''; try { const p = getEntree(); if (p) { const est = await post('/marches/ia/estimer', { type, entree: p }); cout = ' · ' + (est.cout && est.cout.texte || ''); } } catch (x) { /* estimation facultative */ }
        q('[data-ia-etat]').textContent = `Mode automatique : ${e.nom}${e.modele ? ' (' + e.modele + ')' : ''} · ${e.gratuit ? 'offre gratuite' : 'PAYANT'} · envois restants aujourd'hui : ${e.quota.restants}/${e.quota.limite}${cout}. Le mode manuel reste disponible.`;
      } else q('[data-ia-etat]').textContent = 'Mode manuel : aucune clé ni abonnement nécessaire.' + (e.erreur ? ' (' + e.erreur + ')' : ' Pour un envoi automatique : AI_PROVIDER et clé dans agent-trading/.env (voir PROGRESS.md).');
    } catch (x) { q('[data-ia-etat]').textContent = 'Mode manuel (serveur d\'analyse injoignable : l\'export et l\'import fonctionnent sans lui).'; }
  })();

  const exporter = () => { try { preparer(); q('[data-ia-texte]').value = S.texte; q('[data-ia-zone-export]').hidden = false; msg(''); return true; } catch (e) { msg(e.message); return false; } };
  q('[data-ia-export]').addEventListener('click', exporter);
  q('[data-ia-copier]').addEventListener('click', async () => { const ok = await copier(S.texte); if (!ok) { const t = q('[data-ia-texte]'); t.select(); try { document.execCommand('copy'); msg('Texte copié.', true); return; } catch (e) { /* */ } } msg(ok ? 'Texte copié.' : 'Copie impossible : sélectionnez le texte et copiez-le à la main.', ok); });
  const cap = q('[data-ia-capture]'); if (cap) cap.addEventListener('click', () => {
    try {
      const T = window.__or; let blob = null;
      const src = T && T.graph && T.graph.chart() && T.graph.chart().takeScreenshot && T.graph.chart().takeScreenshot();
      const envoyer = cv => cv.toBlob(b => b ? (telecharger(b, 'graphique-' + (S.entree ? S.entree.actif : 'terminal') + '.png'), msg('Capture enregistrée.', true)) : msg('Capture impossible.'), 'image/png');
      if (src) return envoyer(src);
      const e = S.entree || getEntree(); if (!e) return msg('Aucun graphique à capturer.');
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 760; dessinerGraphiqueAnnote(cv.getContext('2d'), { bougies: e.bougies, analyse: { zones: [], niveaux: [], scenarios: [], invalidations: [] }, actif: e.actif, unite: e.unite }); envoyer(cv);
    } catch (e) { msg('Capture impossible : ' + e.message); }
  });

  function afficher(analyse, source) {
    S.analyse = analyse; const sortie = q('[data-ia-sortie]');
    if (analyse.type === 'actualite') { sortie.innerHTML = `<p>${esc(analyse.resume)}</p><ul class="mk-liste">${analyse.themes.map(t => `<li><b>${esc(t.titre)}</b><p>${esc(t.explication)}</p><small>${esc(t.actifs.join(', '))}</small></li>`).join('')}</ul><p class="mk-note">${esc(AVERTISSEMENT)} Source : ${esc(source)}.</p>`; return; }
    const e = S.entree || getEntree(); if (!e) { sortie.innerHTML = `<p class="mk-avert">Réponse valide, mais aucun graphique chargé pour la dessiner.</p>`; return; }
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 760; cv.className = 'mk-ia-canvas'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Graphique annoté par l\'analyse (' + source + ')');
    const fichier = q('[data-ia-fichier]') && q('[data-ia-fichier]').files && q('[data-ia-fichier]').files[0], haut = parseFloat(q('[data-ia-haut]') && q('[data-ia-haut]').value), bas = parseFloat(q('[data-ia-bas]') && q('[data-ia-bas]').value);
    const finir = (info) => { sortie.innerHTML = `<p>${esc(analyse.resume)}</p>`; sortie.appendChild(cv); sortie.insertAdjacentHTML('beforeend', `<ul class="mk-liste">${analyse.scenarios.map(s => `<li><b>${esc(s.nom)}</b><p>${esc(s.condition)}${s.cible != null ? ' → ' + esc(s.cible) : ''}${s.invalidation != null ? ' · invalidation ' + esc(s.invalidation) : ''}</p></li>`).join('')}</ul><div class="mk-ia-barre"><button type="button" data-ia-png>Enregistrer l'image annotée</button></div><p class="mk-note">${esc(info)} ${esc(AVERTISSEMENT)}</p>`); sortie.querySelector('[data-ia-png]').addEventListener('click', () => cv.toBlob(b => b && telecharger(b, 'analyse-annotee.png'), 'image/png')); };
    if (fichier && isFinite(haut) && isFinite(bas) && haut > bas) {
      const img = new Image(); img.onload = () => { const w = 1280, h = Math.round(img.height * w / img.width); cv.width = w; cv.height = h + 64; try { dessinerSurImage(cv.getContext('2d'), { image: img, largeur: w, hauteur: h, prixHaut: haut, prixBas: bas, analyse }); finir('Capture importée : POSITIONS APPROXIMATIVES (échelle déduite de vos deux repères).'); } catch (err) { msg('Dessin impossible : ' + err.message); } URL.revokeObjectURL(img.src); }; img.onerror = () => msg('Image illisible.'); img.src = URL.createObjectURL(fichier);
    } else { try { dessinerGraphiqueAnnote(cv.getContext('2d'), { bougies: e.bougies, analyse, actif: e.actif, unite: e.unite }); finir('Capture interne : positions exactes. Source de l\'analyse : ' + source + '.'); } catch (err) { msg('Dessin impossible : ' + err.message); } }
  }

  q('[data-ia-importer]').addEventListener('click', () => {
    const brut = q('[data-ia-reponse]').value;
    try { if (!S.entree) { try { preparer(); } catch (e) { if (type !== 'actualite') throw e; } } const a = valider(type === 'actualite' ? 'actualite' : 'graphique', brut, { plage: S.plage }); msg('Réponse valide : ' + (a.scenarios ? a.zones.length + ' zone(s), ' + a.niveaux.length + ' niveau(x), ' + a.scenarios.length + ' scénario(s).' : a.themes.length + ' thème(s).'), true); afficher(a, 'réponse collée'); }
    catch (e) { q('[data-ia-sortie]').innerHTML = ''; msg('Réponse rejetée : ' + e.message + '. Rien n\'est dessiné. Redemandez à l\'IA en lui rappelant le format JSON.'); }
  });
  q('[data-ia-auto]').addEventListener('click', async () => {
    const b = q('[data-ia-auto]'); b.disabled = true; msg('Envoi en cours…', true);
    try { const e = getEntree(); if (!e) throw new Error('aucun graphique chargé'); S.entree = e; const r = await post('/marches/ia/analyser', { type, entree: e });
      if (r.ok) { msg('Analyse reçue de ' + r.fournisseur + ' (validée).', true); afficher(r.analyse, r.fournisseur + (r.modele ? ' · ' + r.modele : '')); }
      else { exporter(); msg('Analyse automatique impossible : ' + r.raison + ' → retour au mode manuel.'); }
    } catch (e) { exporter(); msg('Analyse automatique impossible : ' + (e && e.message || e) + ' → retour au mode manuel.'); }
    finally { b.disabled = false; }
  });
  return { exporter, texte: () => S.texte, analyse: () => S.analyse, etat: () => S };
}
