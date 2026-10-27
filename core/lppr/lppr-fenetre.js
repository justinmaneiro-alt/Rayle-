import { creerIndex, chercher, expliquer, verifierCumul, aideDevis, dire, detecterVoix, formatEuro, A_VERIFIER } from './lppr-calcul.js';

/* Fenêtre « LPPR » (Titre II, orthèses et prothèses externes) : recherche, copie rapide des codes, explication, cumul, aide au devis. Module ES chargé à la demande.
   API : window.Lppr {ouvrir, chercher, expliquer, verifierCumul, aideDevis, traiterVoix, etat}. Aucune donnée inventée : tout vient de data/lppr/lppr_titre2.json (PDF officiel ameli.fr). */
const URL_DONNEES = new URL('data/lppr/lppr_titre2.json', document.baseURI).href;
let index = null, chargement = null, erreur = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function charger() {
  if (index) return Promise.resolve(index);
  if (!chargement) chargement = fetch(URL_DONNEES, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => (index = creerIndex(d)), e => { erreur = String(e && e.message || e); chargement = null; index = { ok: false, raison: 'Le fichier de la LPPR n’est pas disponible (' + erreur + '). Dépose data/lppr/lppr_titre2.json : voir docs/LPPR.md.' }; return index; });
  return chargement;
}

const ligne = (e, meta) => '<div class="lp-code"><button type="button" class="lp-copie" data-copie="' + esc(e.code) + '" title="Copier le code">' + esc(e.code) + ' ⧉</button>' +
  '<div class="lp-int">' + esc(e.intitule) + '</div><div class="lp-tarif">Tarif <b>' + esc(formatEuro(e.tarif)) + '</b>' + (e.plv != null ? ' · PLV <b>' + esc(formatEuro(e.plv)) + '</b>' : '') + (e.fin_prise_en_charge ? ' · fin ' + esc(e.fin_prise_en_charge) : '') +
  (e.lecture_colonnes === 'estimee' ? ' · <i>colonnes estimées</i>' : '') + '</div><div class="lp-ref">Chap. ' + esc(e.chapitre) + ' · ' + esc(e.chapitre_titre) + ' · p. ' + e.page_pdf + '</div>' +
  (e.texte ? '<details><summary>Conditions et détails</summary><div class="lp-texte">' + esc(e.texte).replace(/\n/g, '<br>') + '</div></details>' : '') + '</div>';

function corps(meta) {
  return '<div class="lp-racine"><div class="lp-bandeau"><b>LPP · Titre II</b> — ' + esc(meta.version || 'version inconnue') + '<br><span>' + esc(A_VERIFIER) + '</span></div>' +
    '<div class="lp-onglets"><button data-lp="chercher" class="actif">Chercher</button><button data-lp="cumul">Cumul</button><button data-lp="devis">Aide au devis</button></div>' +
    '<div class="lp-zone" data-z="chercher"><input class="lp-q" type="search" placeholder="Code (7 chiffres), référence (B36N) ou mots : emboîture tibiale…"><div class="lp-res"></div></div>' +
    '<div class="lp-zone" data-z="cumul" hidden><div class="lp-deux"><input class="lp-a" inputmode="numeric" maxlength="7" placeholder="Code 1"><input class="lp-b" inputmode="numeric" maxlength="7" placeholder="Code 2"><button class="lp-go-cumul">Vérifier</button></div><div class="lp-res"></div></div>' +
    '<div class="lp-zone" data-z="devis" hidden><textarea class="lp-d" rows="3" placeholder="Décris l’appareillage : prothèse tibiale avec manchon et pied à restitution d’énergie…"></textarea><button class="lp-go-devis">Proposer des codes</button><div class="lp-res"></div></div></div>';
}

function brancher(racine) {
  const res = z => racine.querySelector('[data-z="' + z + '"] .lp-res');
  racine.querySelectorAll('[data-lp]').forEach(b => b.addEventListener('click', () => { racine.querySelectorAll('[data-lp]').forEach(x => x.classList.toggle('actif', x === b)); racine.querySelectorAll('.lp-zone').forEach(z => { z.hidden = z.dataset.z !== b.dataset.lp; }); }));
  racine.addEventListener('click', e => { const c = e.target.closest('[data-copie]'); if (!c) return; try { navigator.clipboard.writeText(c.dataset.copie); c.textContent = c.dataset.copie + ' ✓'; setTimeout(() => { c.textContent = c.dataset.copie + ' ⧉'; }, 1200); } catch (_) { /* presse-papiers refusé */ } });
  const q = racine.querySelector('.lp-q'); let t = null;
  const lancer = () => { const r = chercher(index, q.value, { max: 40 }); res('chercher').innerHTML = !q.value.trim() ? '' : (r.resultats.length ? '<p class="lp-note">' + r.total + ' résultat' + (r.total > 1 ? 's' : '') + (r.total > 40 ? ' (40 premiers)' : '') + (r.raison ? ' — ' + esc(r.raison) : '') + '</p>' + r.resultats.map(e => ligne(e, index.meta)).join('') : '<p class="lp-note">' + esc(r.raison || 'Rien trouvé.') + '</p>'); };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(lancer, 180); });
  racine.querySelector('.lp-go-cumul').addEventListener('click', () => { const r = verifierCumul(index, racine.querySelector('.lp-a').value, racine.querySelector('.lp-b').value); res('cumul').innerHTML = '<p class="lp-note">' + esc(dire(index, r, 'cumul')) + '</p>' + (r.ok ? ligne(r.A, index.meta) + ligne(r.B, index.meta) : ''); });
  racine.querySelector('.lp-go-devis').addEventListener('click', () => { const r = aideDevis(index, racine.querySelector('.lp-d').value); res('devis').innerHTML = !r.ok ? '<p class="lp-note">' + esc(r.raison) + '</p>' : '<p class="lp-note">' + esc(r.avertissement) + '</p>' + r.groupes.map(g => '<h5>' + esc(g.demande) + '</h5>' + (g.resultats.length ? g.resultats.map(e => ligne(e, index.meta)).join('') : '<p class="lp-note">Rien trouvé pour ce segment.</p>')).join(''); });
  return { chercherDans: v => { q.value = v; lancer(); }, q };
}

export async function ouvrir({ recherche = '' } = {}) {
  await charger();
  if (!index.ok) return index.raison;
  if (!window.Panneaux) return 'Les fenêtres ne sont pas prêtes.';
  if (!document.getElementById('lppr-css')) { const l = document.createElement('link'); l.id = 'lppr-css'; l.rel = 'stylesheet'; l.href = new URL('core/lppr/lppr.css', document.baseURI).href; document.head.appendChild(l); }
  window.Panneaux.fermer && window.Panneaux.fermer('lppr');
  const id = window.Panneaux.ouvrir({ id: 'lppr', type: 'holo-lppr', icone: '⚕', titre: 'LPPR — Titre II', taille: 'grand', duree: 0, etat: 'reel', corps: { html: corps(index.meta) } });
  const racine = document.querySelector('.lp-racine'); if (!racine) return id;
  const api = brancher(racine); if (recherche) api.chercherDans(recherche); else api.q.focus();
  return id;
}

/* Voix : rend le texte à dire, ou null. « ouvre la LPPR », « code LPPR de l’emboîture tibiale », « explique le code … », « peut-on cumuler … et … », « devis : … ». */
export async function traiterVoix(texte) {
  const d = detecterVoix(texte); if (!d) return null;
  await charger(); if (!index.ok) return index.raison;
  if (d.type === 'fenetre') { await ouvrir(); return 'Voici la LPPR, Titre II : orthèses et prothèses externes, ' + (index.meta.version || '') + '. ' + A_VERIFIER; }
  if (d.type === 'chercher') { const r = chercher(index, d.q, { max: 40 }); await ouvrir({ recherche: d.q }); return dire(index, r, 'chercher'); }
  if (d.type === 'expliquer') { const r = expliquer(index, d.code); await ouvrir({ recherche: d.code }); return dire(index, r, 'expliquer'); }
  if (d.type === 'cumul') return dire(index, verifierCumul(index, d.a, d.b), 'cumul');
  if (d.type === 'devis') { const r = aideDevis(index, d.texte); return dire(index, r, 'devis'); }
  return null;
}

window.Lppr = { ouvrir, traiterVoix, charger, etat: () => ({ charge: !!(index && index.ok), erreur, version: index && index.meta && index.meta.version, nombre: index && index.codes && index.codes.length }),
  chercher: async (q, o) => { await charger(); return chercher(index, q, o); }, expliquer: async c => { await charger(); return expliquer(index, c); },
  verifierCumul: async (a, b) => { await charger(); return verifierCumul(index, a, b); }, aideDevis: async d => { await charger(); return aideDevis(index, d); } };
