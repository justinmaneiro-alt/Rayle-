/* ═════════════ CARTE PLEIN ÉCRAN : NOUVELLE POSITION ═════════════
   ACHAT / VENTE en gros, quantité en très gros, entrée / stop / objectif, bouton « Copier » par champ (format brut 2263.56) et « Tout copier ». */
import { fmtPrix, fmtQte, heureParis, copiePrix, copieQte, fmtNombre, fmtUSD } from '../commun/format.js';
import { PAR_ID } from '../commun/actifs.js';
import { esc } from './panneaux.js';

export function texteToutCopier(tr) {
  return [`${tr.sens === 'achat' ? 'ACHAT' : 'VENTE'} ${tr.actif}`, `Quantite ${copieQte(tr.actif, tr.quantite)}`, `Entree ${copiePrix(tr.actif, tr.entree)}`, `Stop ${copiePrix(tr.actif, tr.stop)}`, `Objectif ${copiePrix(tr.actif, tr.objectif)}`].join('\n');
}

async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; }
  catch (e) { const t = document.createElement('textarea'); t.value = texte; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* refusé */ } t.remove(); return ok; }
}

export function montrerCarte(racine, tr, { surFermer } = {}) {
  const ancien = racine.querySelector('.at-carte'); if (ancien) ancien.remove();
  const a = PAR_ID[tr.actif] || { unite: tr.actif }, achat = tr.sens === 'achat'; const grande = tr.categorie === 'grande';
  const champ = (nom, aff, brut) => `<div class="at-carte-champ"><small>${nom}</small><b>${aff}</b><button type="button" class="at-btn" data-copie="${esc(brut)}">Copier</button></div>`;
  const d = document.createElement('div'); d.className = 'at-carte ' + (achat ? 'at-carte-achat' : 'at-carte-vente'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Nouvelle position');
  d.innerHTML = `<div class="at-carte-boite">
      <p class="at-carte-sim">${grande ? 'NOUVELLE GRANDE POSITION' : 'NOUVELLE POSITION'} · simulation · ${esc(tr.actif)} M15</p>
      <h2 class="at-carte-sens">${achat ? '▲ ACHAT' : '▼ VENTE'} ${esc(tr.actif)}${grande ? ' <span class="at-badge at-badge-grande">GRANDE</span>' : ' <span class="at-badge">normale</span>'}</h2>
      <p class="at-carte-risque">Risque ${tr.risqueUSD != null ? fmtUSD(tr.risqueUSD, 2) : '—'} · ${fmtNombre(tr.risquePct != null ? tr.risquePct : 0.5, 1)} % du capital réalisé (même risque pour toutes les positions)</p>
      <div class="at-carte-qte"><small>Quantité</small><b>${fmtQte(tr.actif, tr.quantite)} <span>${esc(a.unite)}</span></b><button type="button" class="at-btn" data-copie="${esc(copieQte(tr.actif, tr.quantite))}">Copier</button><em>≈ ${fmtNombre(tr.entree * tr.quantite, 0)} $</em></div>
      ${champ('Entrée', fmtPrix(tr.actif, tr.entree), copiePrix(tr.actif, tr.entree))}
      ${champ('Stop', fmtPrix(tr.actif, tr.stop), copiePrix(tr.actif, tr.stop))}
      ${champ('Objectif', fmtPrix(tr.actif, tr.objectif), copiePrix(tr.actif, tr.objectif))}
      <p class="at-carte-rr">R:R 1:${fmtNombre(tr.rr, 1)} · valable jusqu’à ${heureParis(tr.validJusqu)}</p>
      <p class="at-carte-pq">${esc(tr.pourquoi || '')}</p>
      <div class="at-carte-actions"><button type="button" class="at-btn at-btn-fort" data-tout>Tout copier</button><button type="button" class="at-btn" data-fermer>Fermer</button></div>
      <p class="at-carte-msg" role="status"></p></div>`;
  const msg = d.querySelector('.at-carte-msg');
  d.addEventListener('click', async e => {
    const b = e.target.closest('[data-copie],[data-tout],[data-fermer]');
    if (!b) { if (e.target === d) fermer(); return; }
    if (b.hasAttribute('data-fermer')) return fermer();
    const t = b.hasAttribute('data-tout') ? texteToutCopier(tr) : b.dataset.copie;
    msg.textContent = (await copier(t)) ? 'Copié : ' + t.replace(/\n/g, ' · ') : 'Copie refusée par le navigateur';
  });
  function fermer() { d.classList.add('at-sortie'); setTimeout(() => d.remove(), 300); surFermer && surFermer(); }
  racine.appendChild(d);
  return { fermer };
}
