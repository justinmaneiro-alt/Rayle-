/* « Formation » : la petite case 100 % concrète. Rayle détecte les plus gros mouvements des derniers mois sur mes actifs, les rejoue bougie par bougie sur le vrai graphique en montrant ce que disaient les outils
   AVANT et AU DÉBUT, on peut mettre en pause et demander « qu'est-ce que tu vois là ? », et elle termine par ce qui se répète d'un gros mouvement à l'autre. Pas de quiz, pas de niveaux. */
import { lireActifPro } from '../commun/donnees.js';
import { plusGrosMouvements } from './formation.js';
import { parler } from '../commun/ia.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vb = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
const ACTIFS = [['or', 'Or'], ['us100', 'Nasdaq 100'], ['us500', 'S&P 500'], ['btc', 'Bitcoin'], ['sol', 'Solana'], ['petrole', 'Pétrole'], ['dxy', 'Dollar']];
let instance = null;
export async function ouvrirFormation({ actif = 'or', racine = document.body } = {}) {
  if (instance) instance.fermer();
  const el = document.createElement('section'); el.className = 'tp tp-point'; el.id = 'formation-copilote'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Formation : relecture des gros mouvements');
  el.innerHTML = `<header class="tp-tete"><b>Formation : relire les gros mouvements</b><button type="button" data-fermer aria-label="Fermer">✕</button></header><nav class="tp-nav" role="tablist">${ACTIFS.map(([k, n]) => `<button type="button" role="tab" data-actif="${k}" aria-selected="false">${n}</button>`).join('')}</nav><main class="tp-corps" data-corps><p class="tp-att">Rayle cherche les gros mouvements…</p></main>`;
  racine.appendChild(el); const corps = el.querySelector('[data-corps]'); let S = { actif, R: null, D: null, seq: 0 };
  async function charger(id) {
    const n = ++S.seq; S.actif = id; el.querySelectorAll('[data-actif]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.actif === id))); corps.innerHTML = '<p class="tp-att" role="status">Rayle cherche les gros mouvements…</p>';
    try { const r = await lireActifPro(id, { delai: 15000 }), Jb = vb(r.donnees.j), H4b = vb(r.donnees.h4), R = plusGrosMouvements({ Jb, H4b, actif: id, mois: 6, n: 8 }); if (n !== S.seq) return; S.R = R; S.D = { Jb, H4b };
      if (!R.moves.length) { corps.innerHTML = `<p class="tp-panne">${esc(R.raison || 'Aucun gros mouvement détecté.')}</p>`; return; }
      corps.innerHTML = `<div class="tp-point-sec tp-visible"><h3>Ce qui se répète</h3><p>${esc(R.repete.texte)}</p><p class="tp-actions"><button type="button" data-lire-repete>Rayle, lis-moi ça</button></p></div>
        <p class="tp-doux">Les ${R.moves.length} plus gros mouvements des 6 derniers mois, du plus ancien au plus récent. Appuie sur « Relire » : Rayle rejoue le mouvement bougie par bougie ; mets en pause et demande « qu’est-ce que tu vois là ? ».</p>
        ${R.moves.map((m, i) => `<section class="tp-point-sec tp-visible"><h3>${m.sens > 0 ? 'Hausse' : 'Baisse'} · ${esc(new Date(m.t0).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }))} → ${esc(new Date(m.t1).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' }))}</h3><p>${esc(m.resume)}</p><p class="tp-actions"><button type="button" data-relire="${i}">Relire ce mouvement</button></p></section>`).join('')}`;
    } catch (e) { if (n === S.seq) corps.innerHTML = `<p class="tp-panne" role="alert">Impossible de charger l’historique : ${esc(e && e.message || e)} <button type="button" data-recharger>Réessayer</button></p>`; }
  }
  el.addEventListener('click', async e => {
    const t = e.target; if (t.closest('[data-fermer]')) { el.remove(); instance = null; return; } if (t.closest('[data-recharger]')) { charger(S.actif); return; }
    const a = t.closest('[data-actif]'); if (a) { charger(a.dataset.actif); return; } if (t.closest('[data-lire-repete]') && S.R) { parler(S.R.repete.texte); return; }
    const r = t.closest('[data-relire]'); if (r && S.R) { const m = S.R.moves[+r.dataset.relire], s = m.signaux; r.disabled = true;
      try { const G = await import('./relecture.js'); const sur = [{ type: 'bougie', t: m.t0, unite: 'H4' }, ...(s.volumeExtreme ? [{ type: 'bougie', t: s.volumeExtreme.t, unite: 'H4' }] : []), ...(s.niveauMajeur ? [{ type: 'niveau', prix: s.niveauMajeur.prix, titre: 'niveau majeur' }] : []), { type: 'ma200', unite: 'H4' }];
        const g = await G.ouvrirRelecture({ actif: S.actif, unite: 'H4', t0: m.t0, t1: m.t1, titre: `Relecture : ${m.sens > 0 ? 'hausse' : 'baisse'} de ${Math.abs(m.pct).toFixed(1).replace('.', ',')} %`, nom: S.R.nom, racine: document.body, parler, auDemarrage: false, surlignages: sur, texteInitial: `Au départ de ce mouvement : ${m.resume} Appuie sur ▶ pour le rejouer bougie par bougie, mets en pause et demande ce que je vois. À la fin : ${S.R.repete.texte}` }); g.surligner(sur); parler(m.resume); }
      catch (er) { r.insertAdjacentHTML('afterend', `<span class="tp-panne"> ${esc(er && er.message || er)}</span>`); } r.disabled = false; }
  });
  charger(actif); instance = { fermer: () => { el.remove(); instance = null; }, el }; return instance;
}
