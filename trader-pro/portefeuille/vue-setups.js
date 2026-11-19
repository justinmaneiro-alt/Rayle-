/* ═════════════ ONGLET « SETUPS » (fenêtre Portefeuille) : import en un geste, saisie rapide, rapprochement, statistiques par setup ═════════════
   Lecture seule : aucun ordre. Les statistiques décrivent le passé ; en dessous de 10 trades sur un setup : « pas encore assez de trades ». */
import { esc, nf, age } from '../commun/ui.js';
import { SETUPS, NOM_SETUP, ACTIFS_XTB, MIN_TRADES, attributions, statsSetups, synthese, nomActifTicker, visibles } from './journal-setups.js';
import { dernierImport } from './journal-stockage.js';

const pc = v => (v == null ? '—' : Math.round(v * 100) + ' %');
const eur = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' €');
const rr = v => (v == null ? '—' : (Math.round(v * 100) / 100 >= 0 ? '+' : '−') + nf(Math.abs(Math.round(v * 100) / 100), 2) + ' R');
const cl = v => (v == null ? '' : v > 0 ? 'tp-hausse' : v < 0 ? 'tp-baisse' : '');
const NOM_U = u => (u === 'J' ? 'Jour' : u || '—');
const chips = (attr, id) => `<span class="tp-chips-setup" role="group" aria-label="Setup">${SETUPS.map(s => `<button type="button" data-setup-attrib="${esc(id)}" data-setup="${s.id}">${esc(s.court)}</button>`).join('')}</span>`;
const dateFr = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* S : état de la fenêtre ({ E: transactions enrichies, J: journal, L: données }) ; renvoie le texte de synthèse (lu par Rayle) */
export function vueSetups(S, zone) {
  const J = S.J || [], at = attributions(S.E || [], J), st = statsSetups(S.E || [], at.map), phrase = synthese(st), imp = (S.L && S.L.ouvertes && S.L.ouvertes.t) || dernierImport();
  const jours = imp ? Math.floor((Date.now() - imp) / 86400e3) : null;
  const lignes = st.parSetup.map(s => `<tr class="${s.suffisant ? '' : 'tp-faible'}"><th scope="row">${esc(s.nom)}${s.suffisant ? '' : `<br><small>pas encore assez de trades (${MIN_TRADES} minimum)</small>`}</th><td>${s.n}</td><td>${pc(s.taux)}</td><td class="${cl(s.rMoyen)}">${rr(s.rMoyen)}${s.nR < s.n && s.nR ? `<br><small>${s.nR}/${s.n} avec stop</small>` : ''}</td><td class="${cl(s.pnl)}">${eur(s.pnl)}</td><td>${s.meilleureUnite ? esc(NOM_U(s.meilleureUnite)) : '—'} / ${s.pireUnite ? esc(NOM_U(s.pireUnite)) : '—'}</td><td class="c-opt">${s.parActif.map(a => `${esc(nomActifTicker(a.ticker))} : ${a.n} · ${a.rMoyen != null ? rr(a.rMoyen) : eur(a.pnlMoyen)}`).join('<br>')}</td></tr>`).join('');
  const sansSetup = at.sansSetup.slice().sort((a, b) => b.tFerm - a.tFerm).slice(0, 30), prises = at.prisesSansTransaction.slice().sort((a, b) => b.t - a.t).slice(0, 20);
  zone.innerHTML = `
    <article class="tp-carte tp-import-grand"><h3>Importer mon historique XTB</h3>
      <label class="tp-dropzone" data-dropzone tabindex="0"><input type="file" data-fichier accept=".zip,.xlsx,.xls,.csv,application/zip" multiple hidden><b>Glisse ton export XTB ici</b><span>ou touche pour choisir le fichier (xStation → Historique du compte → Exporter)</span></label>
      <p class="tp-doux">${imp ? `Dernier import : ${esc(age(imp))}${jours >= 7 ? ' — <b class="tp-baisse">plus de 7 jours : pense à réimporter</b>' : ''}.` : 'Aucun import sur cet appareil pour le moment.'} Réimporter tout l’historique ne crée aucun doublon. Rayle te rappelle d’importer le dimanche (voix et Telegram) si rien n’a été importé depuis 7 jours.</p></article>
    <article class="tp-carte"><h3>Synthèse de Rayle</h3><p class="tp-synthese" data-synthese>${esc(phrase)}</p><p><button type="button" data-lire-setups>🔊 Rayle la lit</button></p></article>
    <article class="tp-carte"><h3>Statistiques par setup</h3>${st.parSetup.length ? `<div class="tp-scroll"><table class="tp-t tp-setups"><tr><th>Setup</th><th>Trades</th><th>Réussite</th><th title="espérance en R par trade">R moyen</th><th>Résultat</th><th title="meilleure / pire unité de temps (au moins 3 trades par unité)">Meilleure / pire unité</th><th class="c-opt">Par actif</th></tr>${lignes}</table></div>` : '<p class="tp-doux">Aucun trade avec un setup pour le moment : note tes prises ci-dessous, ou classe tes transactions XTB en un toucher.</p>'}
      <p class="tp-doux">${st.total} trade${st.total > 1 ? 's' : ''} avec un setup sur ${(S.E || []).length}. R = résultat ÷ risque initial (stop). Une moyenne sur peu de trades n’a pas de valeur prédictive.</p></article>
    <article class="tp-carte"><h3>Noter un trade pris</h3><p class="tp-doux">À la voix : « Rayle, j’ai acheté l’or à 3 620, stop 3 600, setup rebond MA200 ». Ou depuis le Terminal : outil Position → « Je l’ai pris ». Ou ici :</p>
      <form class="tp-form" data-prise-form><label>Actif <select name="actif">${Object.entries(ACTIFS_XTB).map(([k, a]) => `<option value="${a.ticker}">${esc(a.court)}</option>`).join('')}</select></label>
        <label>Sens <select name="sens"><option value="BUY">Achat</option><option value="SELL">Vente</option></select></label>
        <label>Prix d’entrée <input name="prix" inputmode="decimal" required autocomplete="off"></label><label>Stop <input name="stop" inputmode="decimal" autocomplete="off"></label><label>Cible <input name="cible" inputmode="decimal" autocomplete="off"></label>
        <label>Unité <select name="unite"><option value="">—</option><option value="H1">H1</option><option value="H4">H4</option><option value="J">Jour</option></select></label>
        <label>Setup <select name="setup">${SETUPS.map(s => `<option value="${s.id}">${esc(s.court)}</option>`).join('')}</select></label><button type="submit">Noter ce trade</button></form><p class="tp-doux" data-prise-msg role="status"></p></article>
    ${prises.length ? `<article class="tp-carte"><h3>Trades notés, pas encore retrouvés dans l’import</h3><ul class="tp-liste">${prises.map(p => `<li><span>${esc(dateFr(p.t))} · <b>${p.sens === 'BUY' ? 'achat' : 'vente'} ${esc(nomActifTicker(p.ticker))}</b> à ${nf(p.prix, p.prix < 100 ? 2 : 0)} · ${esc(NOM_SETUP[p.setup])}${p.unite ? ' ' + esc(NOM_U(p.unite)) : ''}</span><button type="button" data-prise-suppr="${esc(p.id)}" aria-label="Supprimer ce trade noté">🗑</button></li>`).join('')}</ul><p class="tp-doux">Ils seront rapprochés automatiquement de ton prochain import (même actif, même sens, ouverture dans les 3 h, prix à 0,4 %).</p></article>` : ''}
    <article class="tp-carte"><h3>Transactions sans setup (${at.sansSetup.length})</h3>${sansSetup.length ? `<p class="tp-doux">Un toucher pour classer chaque transaction.</p><ul class="tp-liste tp-liste-setup">${sansSetup.map(t => `<li><span>${esc(dateFr(t.tFerm))} · <b>${t.sens === 'BUY' ? 'achat' : 'vente'} ${esc(nomActifTicker(t.ticker))}</b> · ${eur(t.pnl)}</span>${chips(at, t.id)}</li>`).join('')}</ul>${at.sansSetup.length > sansSetup.length ? `<p class="tp-doux">${at.sansSetup.length - sansSetup.length} autres plus anciennes.</p>` : ''}` : '<p class="tp-doux">Toutes tes transactions ont un setup.</p>'}</article>`;
  return phrase;
}
export { visibles };
