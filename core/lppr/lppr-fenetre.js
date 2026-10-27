import { creerLppr, A_VERIFIER, formatEuro } from './lppr-outils.js';
import { creerDevis } from './lppr-devis.js';
import { devisVersPdf, devisVersDocx, typesMime } from './lppr-export.js';
import { corrections_vide, corrigerCode, exclureCode, vocabulaireEffectif, lireCorrections, ecrireCorrections } from './lppr-vocab.js';
import { detecter, direChercher, direExpliquer, direCumul, direReparation, direDevis, direVerification } from './lppr-voix.js';

/* Fenêtre « LPPR » (Titre II : orthèses et prothèses externes) — V3 : graphe de connaissances reconstruit depuis le PDF officiel.
   Onglets : Chercher · Cumul · Devis · Réparation · Vérifier un devis · Vocabulaire. Module ES chargé à la demande.
   API : window.Lppr { ouvrir, traiterVoix, charger, etat, chercher, expliquer, verifierCumul, aideDevis, proposerDevis, verifierDevis, forfaitReparation }.
   Garde-fous : référence (chapitre, page) partout ; version et date affichées ; jamais de code ni de tarif inventé ; « à vérifier avec la nomenclature en vigueur » ; aucune donnée de patient enregistrée
   ni envoyée (les champs patient du devis ne servent qu'à fabriquer le fichier téléchargé). */
const URL_GRAPHE = new URL('data/lppr/graphe.json', document.baseURI).href, URL_VOCAB = new URL('data/lppr/vocabulaire.json', document.baseURI).href;
let L = null, D = null, graphe = null, vocab = null, corr = lireCorrections(), chargement = null, erreur = null, dernier = { requete: null, terme: null, resultats: [] }, devisCourant = null;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function construire() { L = creerLppr(graphe, { vocabulaire: vocabulaireEffectif(vocab, corr), corrections: corr }); D = creerDevis(L); }
export function charger() {
  if (L && L.ok) return Promise.resolve(L);
  if (!chargement) chargement = Promise.all([fetch(URL_GRAPHE, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), fetch(URL_VOCAB, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : { termes: [] })).catch(() => ({ termes: [] }))])
    .then(([g, v]) => { graphe = g; vocab = v; construire(); return L; }, e => { erreur = String(e && e.message || e); chargement = null; L = { ok: false, raison: 'La nomenclature LPPR (data/lppr/graphe.json) n’est pas disponible (' + erreur + '). Voir docs/LPPR.md.' }; return L; });
  return chargement;
}
const badge = (t, cls = '') => '<span class="lp-badge ' + cls + '">' + esc(t) + '</span>';
const prixHtml = r => 'Tarif <b>' + esc(r.tarif_texte && r.tarif == null ? r.tarif_texte : formatEuro(r.tarif)) + '</b>' + (r.plv != null ? ' · prix limite <b>' + esc(formatEuro(r.plv)) + '</b>' : '') + (r.prix_cession_ht != null ? ' · cession HT ' + esc(formatEuro(r.prix_cession_ht)) : '') + (r.fin_prise_en_charge ? ' · fin ' + esc(r.fin_prise_en_charge) : '');
function carte(r, { termeCorrection = null } = {}) {
  return '<div class="lp-code' + (r.actif ? '' : ' lp-inactif') + '"><button type="button" class="lp-copie" data-copie="' + esc(r.code) + '" title="Copier le code">' + esc(r.code) + ' ⧉</button>' + (r.reference ? ' <span class="lp-refcode">' + esc(r.reference) + '</span>' : '') + (r.actif ? '' : ' ' + badge('PLUS REMBOURSABLE', 'ko')) + (r.tarif_texte ? ' ' + badge('sur devis') : '') + ' ' + badge(r.type)
    + '<div class="lp-int">' + esc(r.designation || '(désignation non lue)') + '</div><div class="lp-tarif">' + prixHtml(r) + '</div><div class="lp-ref">' + esc(r.reference_texte) + '</div>'
    + (r.pourquoi && r.pourquoi.length ? '<div class="lp-ref">mots retrouvés : ' + esc(r.pourquoi.join(', ')) + '</div>' : '')
    + '<div class="lp-actions"><button type="button" data-expliquer="' + esc(r.code) + '">Expliquer</button>' + (termeCorrection ? '<button type="button" data-exclure="' + esc(r.code) + '" title="Ne plus proposer ce code pour « ' + esc(termeCorrection) + ' »">Ce n’est pas le bon</button>' : '') + '</div></div>';
}
function htmlExpliquer(e) {
  if (!e.ok) return '<p class="lp-note">' + esc(e.raison) + '</p>';
  const regles = e.regles.slice(0, 14).map(r => '<li><b>' + esc(r.type.replace('_', ' ')) + '</b> — ' + esc(r.phrase) + ' <i>(' + esc(r.source) + ')</i></li>').join('');
  const comp = e.compatibles && e.compatibles.total ? '<h5>Adjonctions et variantes possibles (' + e.compatibles.total + ')</h5><p class="lp-note">' + esc(e.compatibles.note) + '</p><ul>' + e.compatibles.groupes.slice(0, 8).map(g => '<li>' + esc(g.rubrique) + ' : ' + g.n + '</li>').join('') + '</ul>' + e.compatibles.liste.slice(0, 8).map(r => carte(r)).join('') : '';
  return carte(e) + (e.alertes.length ? '<div class="lp-alerte">' + e.alertes.map(a => '<p>⚠ ' + esc(a) + '</p>').join('') + '</div>' : '') + (e.description ? '<h5>Description officielle</h5><div class="lp-texte">' + esc(e.description) + '</div>' : '') + (regles ? '<h5>Règles qui s’appliquent (phrases du texte officiel)</h5><ul class="lp-regles">' + regles + '</ul>' : '<p class="lp-note">Aucune règle écrite trouvée dans la ligne, sa section ni son chapitre (ce qui ne prouve rien : lis le PDF page ' + e.page_pdf + ').</p>') + comp + '<p class="lp-note">' + esc(e.rappel) + '</p>';
}
function htmlDevis(d) {
  if (!d.ok) return '<p class="lp-note">' + esc(d.raison) + '</p>' + (d.exemples ? '<ul>' + d.exemples.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  if (d.etape === 'questions') return '<p class="lp-note"><b>' + esc(d.appareil) + '</b> — il me manque :</p><div class="lp-questions">' + d.questions.map(q => '<label>' + esc(q.texte) + (q.choix ? '<select data-q="' + esc(q.id) + '"><option value="">— choisir —</option>' + q.choix.map(c => '<option>' + esc(c) + '</option>').join('') + '</select>' : '<input data-q="' + esc(q.id) + '" type="text" placeholder="précise ici">') + '</label>').join('') + '<button type="button" class="lp-go-suite">Continuer</button></div>';
  const lignes = d.lignes.map((l, i) => '<tr><td><button type="button" class="lp-copie" data-copie="' + esc(l.code) + '">' + esc(l.code) + '</button><br><small>' + esc(l.reference || '') + '</small></td><td>' + esc(l.designation) + '<br><small>' + esc(l.role) + (l.actif ? '' : ' · PLUS REMBOURSABLE') + '</small>' + (l.alternatives.length ? '<br><small>autres choix : ' + l.alternatives.map(a => esc(a.code)).join(', ') + '</small>' : '') + '</td><td>' + l.quantite + '</td><td>' + esc(l.a_chiffrer_sur_devis ? 'sur devis' : formatEuro(l.base_remboursement != null ? l.base_remboursement : l.prix_retenu)) + '</td><td>' + esc(formatEuro(l.prix_limite_vente)) + '</td><td>' + esc(l.total != null ? formatEuro(l.total) : '—') + '</td></tr>').join('');
  return '<p class="lp-note"><b>' + esc(d.appareil) + '</b> · ' + esc(Object.entries(d.deja_compris).map(([k, v]) => k.replace(/_/g, ' ') + ' : ' + v).join(' ; ')) + '</p>' + (lignes ? '<table class="lp-table"><thead><tr><th>Code</th><th>Désignation</th><th>Qté</th><th>Tarif</th><th>Prix limite</th><th>Total</th></tr></thead><tbody>' + lignes + '</tbody></table>' : '<p class="lp-note">Aucune ligne active trouvée pour cet appareil.</p>')
    + '<p><b>Base de remboursement estimée (lignes chiffrées) : ' + esc(formatEuro(d.totaux.base_remboursement_estimee)) + '</b></p>' + (d.alertes.length ? '<div class="lp-alerte">' + d.alertes.map(a => '<p>⚠ ' + esc(a.texte) + '</p>').join('') + '</div>' : '')
    + (d.entente_prealable.length ? '<h5>Accord préalable</h5><ul>' + d.entente_prealable.slice(0, 3).map(e => '<li>' + esc(e.phrase) + ' <i>(' + esc(e.source) + ')</i></li>').join('') + '</ul>' : '') + (d.justificatifs.length ? '<h5>Justificatifs</h5><ul>' + d.justificatifs.map(j => '<li>' + esc(j) + '</li>').join('') + '</ul>' : '')
    + '<p class="lp-note">' + esc(d.avertissement) + '</p><div class="lp-export"><label>Patient (facultatif, jamais enregistré) <input class="lp-pat" type="text"></label><button type="button" class="lp-go-pdf">Exporter en PDF</button><button type="button" class="lp-go-docx">Exporter en Word</button></div>';
}
function htmlVerification(r) {
  if (!r.ok) return '<p class="lp-note">' + esc(r.raison) + '</p>';
  return '<p class="lp-note"><b>' + esc(r.verdict) + '</b></p>' + r.lignes.map(l => '<div class="lp-code' + (l.ok ? '' : ' lp-inactif') + '"><b>' + esc(l.code) + '</b> ' + (l.designation ? esc(l.designation) : '') + (l.problemes.length ? '<ul>' + l.problemes.map(p => '<li>⚠ ' + esc(p) + '</li>').join('') + '</ul>' : '<p class="lp-note">ligne sans problème détecté</p>') + ((l.informations || []).length ? '<ul>' + l.informations.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '') + '</div>').join('')
    + (r.alertes.length ? '<div class="lp-alerte">' + r.alertes.map(a => '<p>⚠ ' + esc(a.texte) + '</p>').join('') + '</div>' : '') + '<p class="lp-note">' + esc(r.rappel) + '</p>';
}
function corps() {
  return '<div class="lp-racine"><div class="lp-bandeau"><b>LPP · Titre II</b> — ' + esc(L.meta.version || 'version inconnue') + ' · ' + L.codes.length + ' codes<br><span>' + esc(A_VERIFIER) + '</span></div>'
    + '<div class="lp-onglets"><button data-lp="chercher" class="actif">Chercher</button><button data-lp="cumul">Cumul</button><button data-lp="devis">Devis</button><button data-lp="reparation">Réparation</button><button data-lp="verifier">Vérifier un devis</button><button data-lp="vocabulaire">Vocabulaire</button></div>'
    + '<div class="lp-zone" data-z="chercher"><input class="lp-q" type="search" placeholder="Code (7 chiffres), référence (OI59C01) ou mots : emboîture, releveur, corset, manchon silicone…"><label class="lp-case"><input type="checkbox" class="lp-inact"> montrer aussi les codes qui ne sont plus remboursables</label><div class="lp-res"></div></div>'
    + '<div class="lp-zone" data-z="cumul" hidden><input class="lp-codes" placeholder="Deux codes ou plus, séparés par un espace : 2717630 2798568"><button class="lp-go-cumul">Vérifier le cumul</button><div class="lp-res"></div></div>'
    + '<div class="lp-zone" data-z="devis" hidden><textarea class="lp-d" rows="3" placeholder="Décris le patient et l’appareil : prothèse tibiale droite, adulte, pied à restitution d’énergie classe II…"></textarea><button class="lp-go-devis">Proposer un devis</button><div class="lp-res"></div></div>'
    + '<div class="lp-zone" data-z="reparation" hidden><textarea class="lp-r" rows="2" placeholder="Décris la réparation : changement d’une articulation de hanche, remplacement d’une sangle, réparation d’un pied à restitution d’énergie…"></textarea><button class="lp-go-rep">Trouver le forfait</button><div class="lp-res"></div></div>'
    + '<div class="lp-zone" data-z="verifier" hidden><textarea class="lp-v" rows="6" placeholder="Une ligne par code : code ; quantité ; prix. Exemple :&#10;2700339 ; 1 ; 450&#10;2798568 ; 1 ; 31,82"></textarea><input class="lp-vd" placeholder="Appareil (facultatif) : prothèse tibiale…"><button class="lp-go-verif">Vérifier ce devis</button><div class="lp-res"></div></div>'
    + '<div class="lp-zone" data-z="vocabulaire" hidden><p class="lp-note">Mes mots de métier → les mots de la nomenclature. Écrit de mémoire par Raylé : ce qui est marqué « doute » est à corriger.</p><div class="lp-res" data-vocab></div></div></div>';
}
const dateJour = () => new Date().toISOString().slice(0, 10);
function telecharger(nom, octets, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([octets], { type })); a.download = nom; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function listeVocab() {
  return '<table class="lp-table"><thead><tr><th>Mot de métier</th><th>Mots de la nomenclature</th><th></th></tr></thead><tbody>' + vocabulaireEffectif(vocab, corr).termes.map(t => '<tr><td>' + esc(t.mots.slice(0, 4).join(' · ')) + '</td><td>' + esc((t.officiel || []).join(', ')) + (t.note ? '<br><small>' + esc(t.note) + '</small>' : '') + '</td><td>' + (t.incertain ? badge('doute', 'ko') : '') + '</td></tr>').join('') + '</tbody></table>'
    + '<p class="lp-note">Corrections de Justin : ' + (Object.values(corr.ajouts).flat().length + Object.values(corr.exclusions).flat().length) + ' (enregistrées sur cet appareil). <button type="button" class="lp-go-export-vocab">Exporter mes corrections (JSON)</button> <button type="button" class="lp-go-raz-vocab">Tout effacer</button></p>';
}
function brancher(racine) {
  const zone = z => racine.querySelector('[data-z="' + z + '"]'), res = z => zone(z).querySelector('.lp-res');
  racine.querySelectorAll('[data-lp]').forEach(b => b.addEventListener('click', () => { racine.querySelectorAll('[data-lp]').forEach(x => x.classList.toggle('actif', x === b)); racine.querySelectorAll('.lp-zone').forEach(z => { z.hidden = z.dataset.z !== b.dataset.lp; }); if (b.dataset.lp === 'vocabulaire') res('vocabulaire').innerHTML = listeVocab(); }));
  racine.addEventListener('click', e => {
    const c = e.target.closest('[data-copie]'); if (c) { try { navigator.clipboard.writeText(c.dataset.copie); const t = c.textContent; c.textContent = c.dataset.copie + ' ✓'; setTimeout(() => { c.textContent = t; }, 1200); } catch (x) { /* presse-papiers refusé : sans effet */ } return; }
    const ex = e.target.closest('[data-expliquer]'); if (ex) { const r = L.expliquer(ex.dataset.expliquer); res('chercher').innerHTML = '<button type="button" class="lp-retour">← retour aux résultats</button>' + htmlExpliquer(r); return; }
    const exc = e.target.closest('[data-exclure]'); if (exc && dernier.terme) { const r = exclureCode(corr, vocab, dernier.terme, exc.dataset.exclure); if (r.ok) { corr = r.corrections; ecrireCorrections(corr); construire(); lancer(); } return; }
    if (e.target.closest('.lp-retour')) { lancer(); return; }
    if (e.target.closest('.lp-go-export-vocab')) { telecharger('corrections-vocabulaire-lppr-' + dateJour() + '.json', new TextEncoder().encode(JSON.stringify(corr, null, 1)), 'application/json'); return; }
    if (e.target.closest('.lp-go-raz-vocab')) { corr = corrections_vide(); ecrireCorrections(corr); construire(); res('vocabulaire').innerHTML = listeVocab(); return; }
    if (e.target.closest('.lp-go-suite')) { const rep = {}; zone('devis').querySelectorAll('[data-q]').forEach(i => { if (i.value) rep[i.dataset.q] = i.value; }); lancerDevis(rep); return; }
    if (e.target.closest('.lp-go-pdf') || e.target.closest('.lp-go-docx')) { if (!devisCourant) return; const patient = zone('devis').querySelector('.lp-pat').value; if (e.target.closest('.lp-go-pdf')) telecharger('devis-lppr-' + dateJour() + '.pdf', devisVersPdf(devisCourant, { patient }), typesMime.pdf); else telecharger('devis-lppr-' + dateJour() + '.docx', devisVersDocx(devisCourant, { patient }), typesMime.docx); }
  });
  const q = racine.querySelector('.lp-q'); let t = null;
  function lancer() {
    const texte = q.value.trim(); if (!texte) { res('chercher').innerHTML = ''; return; }
    const r = L.chercher(texte, { limite: 30, inclureInactifs: racine.querySelector('.lp-inact').checked }), reco = r.termes_reconnus || [], terme = reco.length ? reco[0].mot : null; dernier = { requete: texte, terme, resultats: r.resultats || [] };
    res('chercher').innerHTML = (r.aucun || !r.resultats.length ? '<p class="lp-note">' + esc(r.message || 'Aucun résultat.') + '</p>' + ((r.inactifs_proches || []).length ? '<h5>Lignes proches qui ne sont plus remboursables</h5>' + r.inactifs_proches.map(x => carte(x)).join('') : '') : '<p class="lp-note">' + r.resultats.length + ' résultat' + (r.resultats.length > 1 ? 's' : '') + (reco.some(x => x.incertain) ? ' · le mot « ' + esc(reco.find(x => x.incertain).mot) + ' » est dans mon dictionnaire avec un doute : corrige-moi avec « Ce n’est pas le bon ».' : '') + '</p>' + r.resultats.map(x => carte(x, { termeCorrection: terme })).join('') + ((r.inactifs_proches || []).length ? '<h5>Lignes proches qui ne sont plus remboursables</h5>' + r.inactifs_proches.map(x => carte(x)).join('') : ''));
  }
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(lancer, 200); }); racine.querySelector('.lp-inact').addEventListener('change', lancer);
  racine.querySelector('.lp-go-cumul').addEventListener('click', () => { res('cumul').innerHTML = (() => { const r = L.verifierCumul((racine.querySelector('.lp-codes').value.match(/[A-Za-z0-9.]{4,}/g) || [])); if (!r.ok) return '<p class="lp-note">' + esc(r.raison) + '</p>'; return r.paires.map(p => '<div class="lp-code"><b>' + esc(p.a.code) + '</b> + <b>' + esc(p.b.code) + '</b> — ' + esc({ interdit_cite: 'NE SE CUMULENT PAS d’après le texte', autorise_cite: 'le texte autorise l’association', regle_citee: 'une règle de cumul est citée', renvoi_cite: 'le texte de l’un renvoie à l’autre (voir la phrase citée)', regle_generale: 'règle générale de cumul dans la section', aucune_regle: 'aucune règle écrite trouvée (ce n’est pas une autorisation)' }[p.statut]) + (p.phrases.map(f => '<p class="lp-texte">« ' + esc(f.phrase) + ' » <i>(' + esc(f.source) + ')</i></p>').join('')) + (p.alertes.map(a => '<p class="lp-alerte">⚠ ' + esc(a) + '</p>').join('')) + '</div>').join('') + '<p class="lp-note">' + esc(r.rappel) + '</p>'; })(); });
  let descDevis = '';
  function lancerDevis(reponses = {}) { descDevis = reponses && Object.keys(reponses).length ? descDevis : racine.querySelector('.lp-d').value; const d = D.proposerDevis(descDevis, reponses); devisCourant = d.etape === 'devis' ? d : null; res('devis').innerHTML = htmlDevis(d); }
  racine.querySelector('.lp-go-devis').addEventListener('click', () => { descDevis = racine.querySelector('.lp-d').value; lancerDevis({}); });
  racine.querySelector('.lp-go-rep').addEventListener('click', () => { const r = L.forfaitReparation(racine.querySelector('.lp-r').value); res('reparation').innerHTML = !r.ok ? '<p class="lp-note">' + esc(r.raison) + '</p>' : r.aucun ? '<p class="lp-note">' + esc(r.message) + '</p>' : '<p class="lp-note">Nature : <b>' + esc({ reparation: 'réparation', renouvellement: 'renouvellement', ambigu: 'à préciser (réparation ou renouvellement ?)' }[r.nature]) + '</b></p>' + r.candidats.map(c => carte(c) + (c.regles.length ? '<ul class="lp-regles">' + c.regles.map(x => '<li><b>' + esc(x.type.replace('_', ' ')) + '</b> — ' + esc(x.phrase) + '</li>').join('') + '</ul>' : '')).join('') + (r.difference ? '<p class="lp-alerte">Deux codes plausibles : ' + esc(r.difference) + '</p>' : '') + '<p class="lp-note">' + esc(r.conseil) + '</p>'; });
  racine.querySelector('.lp-go-verif').addEventListener('click', () => { const lignes = racine.querySelector('.lp-v').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const p = l.split(/[;\t]/).map(x => x.trim()); return { code: p[0], quantite: p[1] || 1, prix: p[2] || null }; }); res('verifier').innerHTML = htmlVerification(D.verifierDevis(lignes, { description: racine.querySelector('.lp-vd').value })); });
  return { chercherDans: v => { q.value = v; lancer(); }, q, ouvrirOnglet: n => { const b = racine.querySelector('[data-lp="' + n + '"]'); if (b) b.click(); }, racine };
}
let ui = null;
export async function ouvrir({ recherche = '', onglet = null } = {}) {
  await charger(); if (!L.ok) return L.raison;
  if (!window.Panneaux) return 'Les fenêtres ne sont pas prêtes.';
  if (!document.getElementById('lppr-css')) { const l = document.createElement('link'); l.id = 'lppr-css'; l.rel = 'stylesheet'; l.href = new URL('core/lppr/lppr.css', document.baseURI).href; document.head.appendChild(l); }
  window.Panneaux.fermer && window.Panneaux.fermer('lppr');
  const id = window.Panneaux.ouvrir({ id: 'lppr', type: 'holo-lppr', icone: '⚕', titre: 'LPPR — Titre II', taille: 'large', duree: 0, etat: 'reel', corps: { html: corps() } });
  const racine = document.querySelector('.lp-racine'); if (!racine) return id;
  ui = brancher(racine); if (onglet) ui.ouvrirOnglet(onglet); if (recherche) ui.chercherDans(recherche); else if (!onglet) ui.q.focus();
  return id;
}
/* Voix : rend le texte à dire, ou null. */
export async function traiterVoix(texte) {
  const d = detecter(texte); if (!d) return null;
  await charger(); if (!L.ok) return L.raison;
  if (d.type === 'fenetre') { await ouvrir(); return 'Voici la LPPR, Titre II : orthèses et prothèses externes, ' + (L.meta.version || '') + '. ' + A_VERIFIER; }
  if (d.type === 'chercher') { const r = L.chercher(d.q, { limite: 30 }); const reco = r.termes_reconnus || []; dernier = { requete: d.q, terme: reco.length ? reco[0].mot : null, resultats: r.resultats || [] }; await ouvrir({ recherche: d.q }); return direChercher(r); }
  if (d.type === 'expliquer') { const r = L.expliquer(d.code); await ouvrir({ recherche: d.code }); return direExpliquer(r); }
  if (d.type === 'cumul') return direCumul(L.verifierCumul(d.codes));
  if (d.type === 'reparation') { const r = L.forfaitReparation(d.texte); await ouvrir({ onglet: 'reparation' }); return direReparation(r); }
  if (d.type === 'devis') { const r = D.proposerDevis(d.texte); devisCourant = r.etape === 'devis' ? r : null; return direDevis(r); }
  if (d.type === 'verifier_devis') { if (d.codes.length) return direVerification(D.verifierDevis(d.codes.map(c => ({ code: c })))); await ouvrir({ onglet: 'verifier' }); return 'Colle les lignes du devis dans la fenêtre : un code par ligne, avec la quantité et le prix si tu les as. Je vérifie les codes, les cumuls, les oublis et les prix limites.'; }
  if (d.type === 'correction_code') { const r = corrigerCode(corr, vocab, d.terme, d.code); if (!r.ok) return r.raison; corr = r.corrections; ecrireCorrections(corr); construire(); return 'C’est noté : pour « ' + d.terme + ' », je proposerai désormais le code ' + d.code + ' en premier. Je garde cette correction sur cet appareil.'; }
  if (d.type === 'correction_exclure') {
    const terme = d.terme || dernier.terme, code = d.code || (dernier.resultats[0] && dernier.resultats[0].code); if (!terme || !code) return 'Je ne sais pas de quel mot ni de quel code tu parles : cherche d’abord un code, puis dis « non, ce n’est pas ce code ».';
    const r = exclureCode(corr, vocab, terme, code); if (!r.ok) return r.raison; corr = r.corrections; ecrireCorrections(corr); construire(); return 'D’accord, je ne proposerai plus le code ' + code + ' pour « ' + terme + ' ». Dis « pour ' + terme + ', c’est le code … » si tu connais le bon.';
  }
  return null;
}
window.Lppr = { ouvrir, traiterVoix, charger, etat: () => ({ charge: !!(L && L.ok), erreur, version: L && L.meta && L.meta.version, nombre: L && L.codes && L.codes.length, corrections: corr }),
  chercher: async (q, o) => { await charger(); return L.chercher(q, o); }, expliquer: async c => { await charger(); return L.expliquer(c); }, verifierCumul: async (a, b) => { await charger(); return L.verifierCumul([a, b].flat()); },
  aideDevis: async d => { await charger(); return D.proposerDevis(d); }, proposerDevis: async (d, r) => { await charger(); return D.proposerDevis(d, r); }, verifierDevis: async (l, o) => { await charger(); return D.verifierDevis(l, o); }, forfaitReparation: async d => { await charger(); return L.forfaitReparation(d); }, info: async () => { await charger(); return L.info(); } };
export { dernier, direChercher };
