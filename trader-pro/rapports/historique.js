/* ═════════════ HISTORIQUE DES RAPPORTS ET BUDGET EN CARACTÈRES (v11, phase 4) ═════════════
   Calcul pur : le stockage (localStorage) est injecté, rien n'est lu ni écrit ailleurs. Un rapport enregistré garde : la date, l'actif, un résumé, les scénarios, le contexte chiffré (prix, ATR, niveaux)
   et chaque étape (titre, carte, texte). `comparer` compare un rapport au précédent du même type et du même actif, avec des CHIFFRES : « depuis le dernier rapport, le prix a atteint le support… ».
   Le budget : l'estimation avant lecture (nombre d'étapes × coût moyen mesuré) et le compteur Azure du mois (quota gratuit : 500 000 caractères). */
import { SEUILS } from './bougies.js';

export const CLE_HISTORIQUE = 'rayle_rapports_v1';
export const MAX_RAPPORTS = 40;
export const QUOTA_AZURE = 500000;
const NB = /[  ]/g;
const fr = (x, d = 2) => (Number.isFinite(x) ? x.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(NB, ' ') : '—');
const sg = (x, d = 1) => (Number.isFinite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + fr(Math.abs(x), d) : '—');
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function lire(st) { try { const v = JSON.parse(st.getItem(CLE_HISTORIQUE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function ecrire(st, L) { let l = L.slice(-MAX_RAPPORTS); for (let k = 0; k < 6; k++) { try { st.setItem(CLE_HISTORIQUE, JSON.stringify(l)); return true; } catch (e) { l = l.slice(Math.ceil(l.length / 3)); if (!l.length) return false; } } return false; }   // quota plein : on garde les plus récents

/* Résumé court : premières phrases des étapes clés */
export function resume(etapes) {
  const ok = (etapes || []).filter(e => e && e.ok !== false && e.segments && e.segments.length);
  const cles = ok.filter(e => ['scenarios', 'conclusion', 'climat'].includes(e.id)).slice(0, 2), base = cles.length ? cles : ok.slice(0, 2);
  return base.map(e => e.segments[0].texte).join(' ').slice(0, 320);
}
/* Entrée d'historique à partir des étapes lues */
export function creerEntree({ type, actif, titre, etapes, caracteres, maintenant = Date.now() }) {
  const lues = (etapes || []).filter(Boolean), sc = lues.find(e => e.scenarios), ctx = {};
  for (const e of lues) if (e.contexte) Object.assign(ctx, e.contexte);
  return { id: type + '-' + (actif || 'tous') + '-' + maintenant, type, actif: actif || null, titre, date: maintenant, resume: resume(lues), scenarios: sc ? sc.scenarios : null, contexte: ctx, caracteres: caracteres || lues.reduce((s, e) => s + (e.caracteres || 0), 0), manques: lues.filter(e => e.manque).map(e => e.titre + ' : ' + e.manque),
    etapes: lues.map(e => ({ id: e.id, chapitre: e.chapitre, titre: e.titre, ok: e.ok !== false, texte: e.texte, detail: e.detail || '', carte: e.carte || null, donneesDu: e.donneesDu || null })) };
}
export function enregistrer(st, entree) { const L = lire(st); L.push(entree); return ecrire(st, L) ? entree : null; }
export const supprimer = (st, id) => ecrire(st, lire(st).filter(x => x.id !== id));
export const vider = st => { try { st.removeItem(CLE_HISTORIQUE); return true; } catch (e) { return false; } };
export const dernierDuMemeSujet = (L, { type, actif }, avant = Infinity) => [...L].reverse().find(x => x.type === type && (x.actif || null) === (actif || null) && x.date < avant) || null;

/* Comparaison avec le rapport précédent : uniquement des faits mesurés */
export function comparer(prev, cur) {
  if (!prev || !cur) return { disponible: false, phrases: [], phrase: 'Pas de rapport précédent sur ce sujet à comparer.' };
  const P = [], depuis = cur.date - prev.date, quand = depuis < 36 * 3600e3 ? 'depuis ' + (depuis < 3 * 3600e3 ? 'tout à l’heure' : 'hier') : 'depuis le ' + new Date(prev.date).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
  const a = prev.contexte || {}, b = cur.contexte || {};
  if (cur.type === 'complet' && Number.isFinite(a.prix) && Number.isFinite(b.prix)) {
    const d = b.dec != null ? b.dec : 2, atr = b.atr || a.atr, v = (b.prix / a.prix - 1) * 100;
    P.push(quand + ', le prix est passé de ' + fr(a.prix, d) + ' à ' + fr(b.prix, d) + ' (' + sg(v) + ' pour cent).');
    for (const n of (a.niveaux || [])) {
      if (!Number.isFinite(n.prix)) continue; const avantSur = atr ? Math.abs(a.prix - n.prix) <= SEUILS.sur * atr : false, surMaintenant = atr ? Math.abs(b.prix - n.prix) <= SEUILS.sur * atr : false, role = n.prix < a.prix ? 'support' : 'résistance';
      if (!avantSur && surMaintenant) P.push('le prix a atteint ' + (role === 'support' ? 'le support ' : 'la résistance ') + n.nom + ' ' + fr(n.prix, d) + '.');
      else if (a.prix < n.prix && b.prix > n.prix + (atr ? SEUILS.sur * atr : 0)) P.push('le prix a franchi par le haut ' + n.nom + ' ' + fr(n.prix, d) + '.');
      else if (a.prix > n.prix && b.prix < n.prix - (atr ? SEUILS.sur * atr : 0)) P.push('le prix a cassé par le bas ' + n.nom + ' ' + fr(n.prix, d) + '.');
    }
    const sp = prev.scenarios && prev.scenarios.principal;
    if (sp && sp.invalidation && Number.isFinite(sp.invalidation.prix)) { const inv = sp.invalidation.prix, touche = sp.sens > 0 ? b.prix < inv : sp.sens < 0 ? b.prix > inv : false; P.push(touche ? 'le scénario principal du rapport précédent (' + sp.titre.toLowerCase() + ') est invalidé : le prix a franchi ' + fr(inv, d) + '.' : 'le scénario principal du rapport précédent (' + sp.titre.toLowerCase() + ') tient : son invalidation à ' + fr(inv, d) + ' n’est pas atteinte.'); }
  } else if (cur.type === 'cot') {
    if (Number.isFinite(a.indexSpec) && Number.isFinite(b.indexSpec)) P.push(quand + ', l’indice COT est passé de ' + fr(a.indexSpec, 0) + ' à ' + fr(b.indexSpec, 0) + (a.dateMesure === b.dateMesure ? ' (même rapport hebdomadaire : rien de nouveau tant que la CFTC n’a pas publié)' : '') + '.');
    if (Number.isFinite(a.spec) && Number.isFinite(b.spec)) P.push('les positions nettes passent de ' + fr(a.spec, 0) + ' à ' + fr(b.spec, 0) + ' contrats (' + sg(b.spec - a.spec, 0) + ').');
  } else if (cur.type === 'marche') {
    const ca = a.couleurs || {}, cb = b.couleurs || {}, ch = Object.keys(cb).filter(k => ca[k] && ca[k] !== cb[k]).map(k => k + ' est passé de ' + ca[k] + ' à ' + cb[k]);
    P.push(quand + ', ' + (ch.length ? ch.join(' ; ') : 'aucun actif n’a changé de couleur') + (a.climat && b.climat && a.climat !== b.climat ? ' ; le climat est passé de ' + a.climat + ' à ' + b.climat : '') + '.');
  }
  const phrases = P.filter(Boolean).map(x => x.charAt(0).toUpperCase() + x.slice(1));
  return { disponible: phrases.length > 0, phrases, phrase: phrases.join(' ') || 'Rien de comparable avec le rapport précédent.', depuis };
}

/* ───── budget ───── */
export const estimerCaracteres = (type, nbEtapes, coutMoyen) => Math.round(nbEtapes * (coutMoyen[type] || 500));
export function phraseBudget(estimation, quota, maintenant = Date.now()) {
  const mois = new Date(maintenant).toISOString().slice(0, 7), q = quota && quota.mois === mois ? quota : null;
  const reste = q ? Math.max(0, QUOTA_AZURE - q.n) : null;
  return { estimation, azureUtilise: q ? q.n : null, azureReste: reste, pctApres: q ? Math.round((q.n + estimation) / QUOTA_AZURE * 1000) / 10 : null,
    texte: 'Coût estimé : ≈ ' + fr(estimation, 0) + ' caractères' + (q ? ' · compteur Azure du mois : ' + fr(q.n, 0) + ' / ' + fr(QUOTA_AZURE, 0) + ' (reste ' + fr(reste, 0) + ')' : ' · compteur Azure du mois : pas encore lu'), assez: reste == null ? true : reste >= estimation };
}

/* ───── export ───── */
const heureFr = t => { try { return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }).format(new Date(t)); } catch (e) { return String(t); } };
export function versMarkdown(e, comparaison) {
  const L = ['# ' + e.titre, '', 'Rapport du ' + heureFr(e.date) + ' (heure de Paris), généré par Rayle à partir des données de l’application.', ''];
  if (comparaison && comparaison.disponible) L.push('## Depuis le rapport précédent', '', comparaison.phrase, '');
  for (const s of e.etapes) { L.push('## ' + s.titre, ''); if (s.donneesDu) L.push('_Données : ' + s.donneesDu + '_', ''); L.push(s.texte, ''); if (s.carte && s.carte.lignes) for (const l of s.carte.lignes) L.push('- **' + l.label + '** : ' + l.val); if (s.detail) L.push('', s.detail); L.push(''); }
  if (e.manques && e.manques.length) L.push('## Données manquantes', '', ...e.manques.map(x => '- ' + x), '');
  L.push('---', 'Aide à la décision : c’est toi qui décides.');
  return L.join('\n');
}
export function versHtml(e, comparaison) {
  const cartes = e.etapes.map(s => '<section><h2>' + esc(s.titre) + '</h2>' + (s.donneesDu ? '<p class="d">Données : ' + esc(s.donneesDu) + '</p>' : '') + '<p>' + esc(s.texte) + '</p>' + (s.carte && s.carte.lignes ? '<table>' + s.carte.lignes.map(l => '<tr><th>' + esc(l.label) + '</th><td>' + esc(l.val) + '</td></tr>').join('') + '</table>' : '') + (s.detail ? '<p class="d">' + esc(s.detail) + '</p>' : '') + '</section>').join('');
  return '<!doctype html><meta charset="utf-8"><title>' + esc(e.titre) + '</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:780px;margin:24px auto;color:#111}h1{font-size:22px}h2{font-size:16px;margin:18px 0 4px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%;margin:6px 0}th{text-align:left;width:34%;font-weight:600;vertical-align:top}td,th{padding:2px 6px;border-bottom:1px solid #eee}.d{color:#555;font-size:12px}section{break-inside:avoid}</style><h1>' + esc(e.titre) + '</h1><p class="d">Rapport du ' + esc(heureFr(e.date)) + ' (heure de Paris), généré par Rayle à partir des données de l’application.</p>'
    + (comparaison && comparaison.disponible ? '<h2>Depuis le rapport précédent</h2><p>' + esc(comparaison.phrase) + '</p>' : '') + cartes + (e.manques && e.manques.length ? '<h2>Données manquantes</h2><ul>' + e.manques.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '<hr><p class="d"><i>Aide à la décision : c’est toi qui décides.</i></p>';
}
