/* Onglet « Actualité » : actualités par actif, avec l'impact expliqué par Rayle (règles de lecture tout de suite ; IA de Rayle sur demande, voix sur demande). */
import { creerVue, esc, pastille, age, lireLS, ecrireLS } from '../commun/ui.js';
import { ACTIFS, parId, lireActus } from '../commun/donnees.js';
import { demanderIA, parler } from '../commun/ia.js';
import { expliquerImpact } from './impact.js';

export function monter(zone) {
  const E = { id: lireLS('tp_actu_actif', 'or'), items: [], meta: null, vue: null, seq: 0 };
  if (!parId[E.id]) E.id = 'or';
  zone.innerHTML = `<div class="tp-chips" role="tablist" aria-label="Actif">${ACTIFS.map(a => `<button type="button" role="tab" data-actif="${a.id}">${esc(a.nom)}</button>`).join('')}</div><div data-liste></div>`;
  const box = zone.querySelector('[data-liste]'), vue = creerVue(box);
  const lien = x => (/^https?:\/\//.test(x.lien || '') ? esc(x.lien) : '#');
  function dessiner() {
    if (!E.meta) return; const a = parId[E.id];
    zone.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.actif === E.id)));
    const L = E.items.filter(x => a.mots.test(`${x.titre} ${x.resume || ''}`)).slice(0, 12);
    box.innerHTML = `<p class="tp-doux">Les titres qui concernent <b>${esc(a.nom)}</b>, avec le mécanisme par lequel ils pourraient jouer. Ce sont des lectures en « si… alors… », jamais une prévision.</p>
      ${L.length ? `<ul class="tp-actus">${L.map((x, i) => { const imp = expliquerImpact(x, a.id); return `<li data-i="${i}"><a href="${lien(x)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.titre)}</b></a> <small>${esc(x.source || '')}${x.date ? ' · ' + esc(age(x.date)) : ''}</small>
        <p class="tp-impact"><span class="tp-etiq">Impact pour ${esc(a.nom)}</span> ${esc(imp.texte)}</p>
        <div class="tp-actions"><button type="button" data-ia="${i}">Expliquer avec l’IA de Rayle</button><button type="button" data-voix="${i}">Lire à voix haute</button></div><div class="tp-ia" data-iabox="${i}" role="status"></div></li>`; }).join('')}</ul>` : '<p class="tp-doux">Aucune actualité récente sur cet actif dans les sources suivies.</p>'}
      <p class="tp-doux">${pastille('flux publics (CNBC, Fed, BCE, WGC…)', E.meta.t, { garde: E.meta.copie })}</p>
      <p><button type="button" data-export>Exporter pour analyse</button> <span class="tp-doux" data-msg role="status"></span></p>`;
    box._liste = L;
  }
  const texteDe = (x, a) => `${x.titre} (${x.source || '?'}${x.date ? ', ' + new Date(x.date).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''})`;
  zone.addEventListener('click', async e => {
    const c = e.target.closest('[data-actif]'); if (c) { E.id = c.dataset.actif; ecrireLS('tp_actu_actif', E.id); dessiner(); return; }
    const L = box._liste || [], a = parId[E.id];
    const ia = e.target.closest('[data-ia]'), vx = e.target.closest('[data-voix]'), ex = e.target.closest('[data-export]');
    if (ia) { const i = +ia.dataset.ia, x = L[i], out = box.querySelector(`[data-iabox="${i}"]`); out.textContent = 'Rayle lit le titre…'; ia.disabled = true;
      try { const r = await demanderIA(`Explique en 3 phrases maximum ce que ce titre peut signifier pour ${a.nom} : « ${x.titre} ». ${x.resume ? 'Résumé : ' + x.resume : ''}`, { contexte: 'Actif concerné : ' + a.nom + '. Règles de lecture déjà affichées : ' + expliquerImpact(x, a.id).texte }); out.textContent = r.texte; }
      catch (er) { out.textContent = 'IA indisponible : ' + (er && er.message || er) + '. La lecture par règles ci-dessus reste valable.'; } ia.disabled = false; return; }
    if (vx) { const x = L[+vx.dataset.voix]; parler(`${x.titre}. ${expliquerImpact(x, a.id).texte}`); return; }
    if (ex) { const t = `Analyse demandée : explique en termes simples ce que ces titres peuvent signifier pour ${a.nom}. Scénarios CONDITIONNELS (« si… alors… »), sans probabilité chiffrée, sans taille de position, sans conseil d’achat ou de vente.\n\nTitres (source, date) :\n` + L.map(x => '- ' + texteDe(x, a)).join('\n'), msg = box.querySelector('[data-msg]');
      try { await navigator.clipboard.writeText(t); msg.textContent = 'Texte copié.'; } catch (er) { msg.textContent = 'Copie refusée par le navigateur.'; } }
  });
  vue.lire('actus', () => lireActus('marches'), (d, m) => { E.items = d.items || []; E.meta = m; dessiner(); });
  return { detruire() { vue.detruire(); } };
}
