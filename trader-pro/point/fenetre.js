/* ═════════════ FENÊTRE « POINT DE RAYLE » : le récit animé, section par section, avec « Montre-moi » ═════════════
   Rayle raconte comme une copilote qui est restée devant les écrans : ce qui s'est passé, ce que tu as raté (avec un bouton « Montre-moi » qui rejoue le mouvement sur le graphique), session par session,
   où on en est, ce que ça veut dire, scénarios, conseil, agenda. Le texte s'affiche paragraphe après paragraphe (fenêtre animée) et peut être lu à voix haute. Lecture seule : aucun ordre.
   API : ouvrirPoint({ type, actif, depuis, absenceMs }) · proposerPoint({ absenceMs, phrase }) (bandeau d'ouverture) */
import { construirePoint } from './charger.js';
import { parler } from '../commun/ia.js';
import { TYPES } from './composer.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let instance = null;
function css() { if (typeof document === 'undefined' || document.querySelector('link[data-tp-point-css]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.tpPointCss = ''; l.href = new URL('../commun/pro.css', import.meta.url).href; document.head.appendChild(l); }
export const htmlPoint = (P, { revele = Infinity } = {}) => {
  const sec = P.sections.filter(s => s.paragraphes.length);
  return `<p class="tp-point-meta">${esc(P.titre)} · ${esc(new Date(P.maintenant).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }))} (heure de Paris) · ${P.mots} mots à l’oral${P.redaction === 'ia' ? ' · mis en mots par l’IA de Rayle (chiffres revérifiés)' : ' · rédigé par les règles de Rayle (chiffres vérifiés)'}</p>
    ${sec.map((s, k) => `<section class="tp-point-sec${k < revele ? ' tp-visible' : ''}" data-sec="${esc(s.id)}"><h3>${esc(s.titre)}</h3>${s.paragraphes.map(p => `<p>${esc(p)}</p>`).join('')}${s.id === 'rate' && P.montre.length ? `<p class="tp-actions">${P.montre.map((m, i) => `<button type="button" data-montre="${i}">Montre-moi : ${esc(m.titre)}</button>`).join(' ')}</p>` : ''}</section>`).join('')}
    <p class="tp-doux">Chaque chiffre vient de ma lecture de marché ou d’un calcul fait par le code ; ce sont des tendances générales, pas des règles ni des ordres. La décision reste la tienne.</p>`;
};
export async function ouvrirPoint(opts = {}) {
  css(); if (instance) instance.fermer();
  const el = document.createElement('section'); el.className = 'tp tp-point'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Point de Rayle'); el.id = 'point-rayle';
  el.innerHTML = `<header class="tp-tete"><b>Point de Rayle</b><button type="button" class="tp-lire" data-lire>Lire à voix haute</button><button type="button" data-fermer aria-label="Fermer">✕</button></header>
    <nav class="tp-nav" role="tablist" aria-label="Type de point">${['depuis', 'nuit', 'matin', 'journee'].map(k => `<button type="button" role="tab" data-type="${k}" aria-selected="false">${k === 'depuis' ? 'Depuis ma dernière visite' : k === 'nuit' ? 'Cette nuit' : k === 'matin' ? 'Point du matin' : 'Point de la journée'}</button>`).join('')}</nav>
    <main class="tp-corps" data-corps><p class="tp-att" role="status">Rayle prépare le point…</p></main>`;
  (opts.racine || document.body).appendChild(el);
  const S = { type: opts.type || 'depuis', actif: opts.actif || null, depuis: opts.depuis ?? null, absenceMs: opts.absenceMs ?? null, P: null, timers: [], seq: 0 }, corps = el.querySelector('[data-corps]');
  const fermer = () => { S.timers.forEach(clearTimeout); S.seq++; el.remove(); instance = null; };
  async function charger() {
    const n = ++S.seq; S.timers.forEach(clearTimeout); S.timers = [];
    el.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.type === S.type && !S.actif)));
    corps.innerHTML = '<p class="tp-att" role="status">Rayle prépare le point…</p>';
    try {
      const P = opts.point && !S.dejaPoint ? opts.point : await construirePoint({ type: S.actif ? 'actif' : S.type, actif: S.actif, depuis: S.depuis, absenceMs: S.type === 'depuis' ? S.absenceMs : null }); S.dejaPoint = true; if (n !== S.seq) return; S.P = P;
      if (opts.parler && !S.parle) { S.parle = true; parler(P.texteParle); }
      if (P.vide) { corps.innerHTML = `<p class="tp-panne" role="alert">${esc(P.texteParle)} <button type="button" data-recharger>Réessayer</button></p>`; return; }
      corps.innerHTML = htmlPoint(P, { revele: 0 }); const secs = [...corps.querySelectorAll('.tp-point-sec')];
      secs.forEach((s, k) => S.timers.push(setTimeout(() => s.classList.add('tp-visible'), 350 + k * 700)));   // fenêtre animée : une section après l'autre
    } catch (e) { if (n === S.seq) corps.innerHTML = `<p class="tp-panne" role="alert">Je n’ai pas pu préparer le point : ${esc(e && e.message || e)} <button type="button" data-recharger>Réessayer</button></p>`; }
  }
  el.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-fermer]')) { fermer(); return; } if (t.closest('[data-recharger]')) { charger(); return; }
    const ty = t.closest('[data-type]'); if (ty) { S.type = ty.dataset.type; S.actif = null; S.depuis = S.type === 'depuis' ? (opts.depuis ?? null) : null; charger(); return; }
    if (t.closest('[data-lire]') && S.P) { parler(S.P.texteParle); return; }
    const m = t.closest('[data-montre]'); if (m && S.P) {
      const x = S.P.montre[+m.dataset.montre]; m.disabled = true;
      try { const R = await import('../copilote/relecture.js'); await R.ouvrirRelecture({ actif: x.actif, unite: x.unite, t0: x.t0, t1: x.t1, niveaux: x.niveaux, titre: x.titre, nom: x.actif, parler }); }
      catch (er) { m.insertAdjacentHTML('afterend', `<span class="tp-panne"> Impossible d’ouvrir le graphique : ${esc(er && er.message || er)}</span>`); } m.disabled = false;
    }
  });
  charger(); instance = { fermer, el, etat: () => S };
  return instance;
}
export function fermerPoint() { if (instance) instance.fermer(); }
/* bandeau d'ouverture : « Tu étais absent depuis 9 heures, je te fais le point ? » */
export function proposerPoint({ absenceMs, phrase }) {
  css(); if (typeof document === 'undefined' || document.getElementById('point-propose')) return;
  const b = document.createElement('div'); b.id = 'point-propose'; b.className = 'tp tp-propose'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-live', 'polite');
  b.innerHTML = `<span>${esc(phrase)}</span><button type="button" data-oui>Oui, fais le point</button><button type="button" data-non>Plus tard</button>`; document.body.appendChild(b);
  parler(phrase); const fin = setTimeout(() => b.remove(), 90000);
  b.addEventListener('click', e => { if (e.target.closest('[data-oui]')) { clearTimeout(fin); b.remove(); ouvrirPoint({ type: 'depuis', absenceMs, depuis: Date.now() - absenceMs, parler: true }); } else if (e.target.closest('[data-non]')) { clearTimeout(fin); b.remove(); } });
}
export { TYPES };
