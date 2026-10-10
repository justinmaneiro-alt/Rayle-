/* ═════════════ PAGE « ANALYSE » : analyse fondamentale du Nasdaq 100 et de l'or (rapport du Worker, rédigé par Gemini) ═════════════ */
import { appelWorker, demanderARayle, esc } from './hud.js?v=2026.10.10.5';

const ACTIFS = [['NDX', 'Nasdaq 100 · US100'], ['XAU', 'Or · XAU/USD']];
const NOMS_PARLES = { NDX: 'le Nasdaq', XAU: "l'or" };
const EFFETS = { soutien: ['▲', 'soutient', 'up'], pression: ['▼', 'pèse', 'down'], neutre: ['◆', 'neutre', ''] };
const BIAIS = { haussier: ['▲ HAUSSIER', 'up'], baissier: ['▼ BAISSIER', 'down'], neutre: ['◆ NEUTRE', ''], 'partagé': ['⇅ PARTAGÉ', 'warn'] };

const quand = ms => { const d = new Date(ms); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

export function creerPageAnalyse({ racine }) {
  racine.innerHTML =
    '<div class="pa-tete"><h2>ANALYSE FONDAMENTALE <span class="px" id="paSrc">—</span></h2>'
    + '<div class="pc-onglets" id="paOnglets"></div>'
    + '<div class="pm-actions"><button type="button" id="paMaj" title="Rédiger un nouveau rapport maintenant (15 à 40 secondes)">⟳ Mettre à jour</button><button type="button" id="paExpl">🎙 Raylé explique</button></div></div>'
    + '<div class="pa-corps" id="paCorps"><div class="loading">Chargement de l’analyse…</div></div>';
  const corps = racine.querySelector('#paCorps'), srcEl = racine.querySelector('#paSrc'), onglets = racine.querySelector('#paOnglets');
  let actif = 'NDX', ouverte = false, jeton = 0, donnees = null, redaction = false, choix = null;

  ACTIFS.forEach(([k, nom]) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k; b.textContent = nom; b.onclick = () => choisir(k); onglets.appendChild(b); });
  const majOnglets = () => onglets.querySelectorAll('button').forEach(b => b.classList.toggle('actif', b.dataset.k === actif));

  const points = n => '<span class="pa-points" role="img" aria-label="confiance ' + n + ' sur 5">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= n ? 'on' : '') + '"></i>').join('') + '</span>';
  const scenario = (titre, cl, s) => '<section class="pa-scen ' + cl + '"><h3>' + titre + '</h3><p>' + esc(s.scenario) + '</p>'
    + (s.declencheurs.length ? '<ul>' + s.declencheurs.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
    + '<div class="pa-inval"><b>Invalidation</b> ' + esc(s.invalidation || '—') + '</div></section>';

  function rendre(r) {
    const a = r.analyse;
    if (!a) {
      corps.innerHTML = '<div class="needkey">Aucune analyse en mémoire pour ' + esc(r.nom) + '.<br>Le rapport hebdomadaire est rédigé le dimanche soir ; tu peux le lancer maintenant avec « Mettre à jour » (15 à 40 secondes).</div>';
      srcEl.textContent = '—'; return;
    }
    donnees = r;
    const x = a.rapport, b = BIAIS[x.biais] || BIAIS.neutre;
    const hist = (r.historique || []).map(h => '<button type="button" data-id="' + h.id + '" class="' + (h.id === a.id ? 'actif' : '') + '" title="' + esc(quand(h.cree)) + '">' + (h.type === 'annonce' ? '⚡ ' : '🧭 ') + new Date(h.cree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + esc(h.biais) + '</button>').join('');
    corps.innerHTML =
      '<div class="pa-haut"><div class="pa-biais ' + b[1] + '"><small>BIAIS FONDAMENTAL</small><b>' + b[0] + '</b></div>'
      + '<div class="pa-conf"><small>CONFIANCE ' + x.confiance + '/5</small>' + points(x.confiance) + '<span>' + esc(x.confiance_raison) + '</span></div>'
      + '<div class="pa-meta">' + (a.type === 'annonce' ? '⚡ Mise à jour avant annonce : ' + esc(a.reference || '') : '🧭 Rapport hebdomadaire') + '<br><small>rédigé ' + esc(quand(a.cree)) + (a.moteur ? ' · ' + esc(a.moteur) : '') + '</small></div></div>'
      + '<p class="pa-synthese">' + esc(x.synthese) + '</p>'
      + '<div class="pa-themes">' + Object.entries(x.themes).map(([k, t], i) => {
        const e = EFFETS[t.effet] || EFFETS.neutre;
        return '<section class="pa-theme ' + e[2] + '" style="animation-delay:' + (i * 70) + 'ms"><h3><span class="ic">' + e[0] + '</span> ' + esc(t.titre) + '<em>' + e[1] + '</em></h3><p>' + esc(t.lecture) + '</p></section>';
      }).join('') + '</div>'
      + '<div class="pa-scenarios">' + scenario('▲ Scénario haussier', 'up', x.haussier) + scenario('▼ Scénario baissier', 'down', x.baissier) + '</div>'
      + (x.a_surveiller.length ? '<section class="pa-surveiller"><h3>À surveiller</h3><ul>' + x.a_surveiller.map(s => '<li>' + esc(s) + '</li>').join('') + '</ul></section>' : '')
      + (a.dossier && a.dossier.manques && a.dossier.manques.length ? '<p class="pc-note warn">Sources indisponibles lors de la rédaction : ' + esc(a.dossier.manques.slice(0, 4).join(' ; ')) + '.</p>' : '')
      + '<div class="pa-hist"><small>Historique</small>' + hist + '</div>'
      + '<p class="pc-note">Analyse générée à partir de données publiques (Fed, Trésor, CFTC, calendrier, actualités). Elle décrit des scénarios : ce n’est pas un conseil d’investissement, et Raylé ne dit jamais d’acheter ou de vendre.</p>';
    srcEl.textContent = r.nom;
    corps.querySelectorAll('.pa-hist button').forEach(bt => { bt.onclick = () => choisirRapport(+bt.dataset.id); });
    RayleBus.fusion('terminal', { page_analyse: { actif, biais: x.biais, confiance: x.confiance, synthese: x.synthese, redige: new Date(a.cree).toISOString(), invalidation_haussier: x.haussier.invalidation, invalidation_baissier: x.baissier.invalidation } });
  }
  const choisirRapport = id => charger('', id);

  async function charger(type, id) {
    const moi = ++jeton;
    if (!donnees || donnees.actif !== actif) corps.innerHTML = '<div class="loading">Chargement de l’analyse…</div>';
    try {
      const r = await appelWorker('/analyse?actif=' + actif + (id ? '&id=' + id : type ? '&type=' + type : ''), null, 25000);
      if (moi !== jeton) return;
      rendre(r);
    } catch (e) {
      if (moi !== jeton) return;
      corps.innerHTML = '<div class="needkey">' + (e.code === 401 ? "Code d'accès refusé : vérifie ⚙ Réglages de Raylé." : 'Analyse indisponible : ' + esc(e.message) + '.') + '</div>';
    }
  }
  async function mettreAJour() {
    if (redaction) return;
    redaction = true;
    const bt = racine.querySelector('#paMaj'); bt.disabled = true; bt.textContent = '⟳ Rédaction en cours…';
    corps.classList.add('pa-redige');
    const moi = ++jeton;
    try {
      const r = await appelWorker('/analyse?actif=' + actif, { method: 'POST' }, 110000);
      if (moi !== jeton) return;
      rendre({ actif, nom: (ACTIFS.find(a => a[0] === actif) || [])[1] || actif, analyse: r, historique: r.historique });
    } catch (e) {
      corps.insertAdjacentHTML('afterbegin', '<div class="needkey">Rédaction impossible : ' + esc(e.message) + '.</div>');
    } finally { redaction = false; bt.disabled = false; bt.textContent = '⟳ Mettre à jour'; corps.classList.remove('pa-redige'); }
  }
  function choisir(k) { if (!ACTIFS.some(a => a[0] === k)) return false; actif = k; majOnglets(); charger(); return true; }
  racine.querySelector('#paMaj').onclick = mettreAJour;
  racine.querySelector('#paExpl').onclick = () => demanderARayle('Raylé, explique-moi l’analyse fondamentale de ' + (NOMS_PARLES[actif] || actif) + '.');
  majOnglets();

  return {
    ouvrir(opts) { ouverte = true; if (opts && opts.actif && ACTIFS.some(a => a[0] === opts.actif)) { actif = opts.actif; majOnglets(); } charger(); },
    fermer() { ouverte = false; jeton++; },
    choisir, mettreAJour
  };
}
