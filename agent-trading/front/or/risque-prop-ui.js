/* ═════════════ PANNEAU « RISQUE PROP » (repliable) : perte journalière restante, marge avant le seuil total, risque de la position, taille suggérée, alerte douce à 70 % ═════════════
   Compte Kraken Pro de 10 000 $ (réglages communs avec le gardien). Aucun blocage d'ordre : le panneau affiche. Contexte à la pose (zone, probabilité mesurée, état du marché) enregistré à part,
   en ajout seul, puis rattaché au trade du journal par l'heure : le journal lui-même n'est pas modifié. */
import { etatProp, risquePosition, tailleSuggeree, messageAlerteDouce, doitAlerter, contextePose, rattacher, phraseContexte, PROP } from './risque-prop-calcul.js';
import { killzoneEnCours } from './ict-v1.js';
import { cleJour } from './niveaux-or.js';
const CLE = 'rayle_or_risque_prop', CLE_POSES = 'rayle_or_poses_contexte', CLE_LIENS = 'rayle_or_poses_liens', CLE_GARDIEN = 'rayle_or_gardien';
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export function creerRisqueProp({ racine, graph, structure, schemas = null, modules = () => ({}), notifier = () => {}, parler = () => {}, maintenant = () => Date.now(), delaiPose = 2500 } = {}) {
  const E = { reg: { voix: true, notif: true, risque: PROP.risqueDefautPct, memoire: null, ...lire(CLE, {}) }, poses: lire(CLE_POSES, []), liens: lire(CLE_LIENS, {}), cle: null, minuterie: null, etat: null };
  const el = () => racine && racine.querySelector('[data-risque-prop]');
  const trades = () => { const m = typeof modules === 'function' ? modules() : modules; return (m.journal && m.journal.trades && m.journal.trades()) || []; };
  const reglagesGardien = () => { const g = lire(CLE_GARDIEN, {}); return { capital: g.capital ?? PROP.capital, limiteJour: g.limiteJour ?? PROP.limiteJourPct, limiteTotale: g.limiteTotale ?? PROP.limiteTotalePct, objectif: g.objectif ?? PROP.objectifPct, base: g.base || 'solde', stopJour: g.stopJour, alerteJour: g.alerteJour, pertesDeSuite: g.pertesDeSuite, alertesTotales: g.alertesTotales, _latent: g.latent || 0 }; };
  const positionOuverte = () => { const L = lire('rayle_or_journal', []); if (!Array.isArray(L)) return null; return L.filter(t => t && ['achat', 'vente'].includes(t.sens) && !(t.sortie != null && t.sortie !== '' && +t.sortie > 0)).slice(-1)[0] || null; };
  function calc() { const g = reglagesGardien(), latent = g._latent; delete g._latent; return etatProp(trades(), { reglages: g, maintenant: maintenant(), latent }); }
  /* ── contexte à la pose ── */
  function contexte(pos) {
    const ge = graph.etat && graph.etat(), aff = ge && ge.aff, zr = structure && structure.zonesCalculees ? structure.zonesCalculees() : [], a = (aff && aff.a) || (ge && ge.a) || null;
    const kz = killzoneEnCours(maintenant()), kzTxt = kz.enCours.length ? kz.enCours.map(f => f.nom).join(' / ') : null;
    let marche = null; try { marche = structure && structure.bandeau ? structure.bandeau() : null; } catch (e) { /* */ }
    const evs = schemas && schemas.evenements ? schemas.evenements().filter(e => e.statut !== 'invalide' && e.statut !== 'formation').slice(-3).map(e => schemas.message(e).replace(/ \(information, jamais un ordre\)$/, '')) : [];
    return contextePose({ pos, t: maintenant(), prix: ge && ge.prix, a, zonesAffichees: aff ? [...aff.sr.actives] : [], zonesRetour: zr, etatMarche: marche, killzone: kzTxt, evenements: evs });
  }
  function enregistrerPose(pos) {
    if (!pos || !(pos.entree > 0) || !(pos.stop > 0) || !(pos.objectif > 0)) return; const cle = [pos.entree, pos.stop, pos.objectif].map(x => Math.round(x * 100)).join('|'); if (cle === E.cle) return; E.cle = cle;
    clearTimeout(E.minuterie); E.minuterie = setTimeout(() => {   // la position est « posée » quand ses trois niveaux ne bougent plus
      const c = contexte(pos); if (!c) return; const sens = pos.stop < pos.entree ? 'achat' : 'vente'; c.sens = sens; c.id = 'p' + c.t.toString(36);
      E.poses.push(c); if (E.poses.length > 200) E.poses.splice(0, E.poses.length - 200); ecrire(CLE_POSES, E.poses); lier(); rendre();
    }, delaiPose);
  }
  function lier() { E.liens = rattacher(E.poses, trades(), E.liens); ecrire(CLE_LIENS, E.liens); }
  /* ── alerte douce à 70 % de la perte journalière ── */
  function alerte(S) {
    const jour = cleJour(maintenant()); if (E.reg.memoire && E.reg.memoire.jour !== jour) { E.reg.memoire = null; }
    if (!doitAlerter(S, E.reg.memoire, jour)) return; E.reg.memoire = { jour, faite: true }; ecrire(CLE, E.reg);
    const t = messageAlerteDouce(S); try { notifier('Risque prop : ' + t, { niveau: 'fort', dit: false }); } catch (e) { /* */ }
    if (E.reg.voix) { try { parler(t); } catch (e) { /* */ } }
    if (E.reg.notif) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Rayle · risque prop', { body: t }); } catch (e) { /* */ } }
  }
  function rendre() {
    const root = el(); if (!root) return; const S = calc(); E.etat = S; const g = reglagesGardien();
    const pos = graph.position && graph.position(), ouv = positionOuverte(), equite = S.equite;
    const barre = (v, max, cls = '') => `<div class="tor-barre ${cls}"><i style="width:${Math.min(100, Math.max(0, v / max * 100)).toFixed(1)}%"></i></div>`;
    let rp = null, source = '';
    if (ouv && ouv.stop > 0) { rp = risquePosition({ entree: ouv.entree, stop: ouv.stop, taille: ouv.taille, equite }); source = 'position ouverte du journal'; }
    if ((!rp || !rp.ok) && pos && pos.entree && pos.stop) { const t = tailleSuggeree({ equite, risquePct: E.reg.risque, entree: pos.entree, stop: pos.stop }); if (t.ok) { rp = risquePosition({ entree: pos.entree, stop: pos.stop, taille: t.contrats, equite }); source = `position dessinée, avec la taille suggérée pour ${nb(E.reg.risque, 2)} %`; } }
    const entree = (pos && pos.entree) || (ouv && ouv.entree), stop = (pos && pos.stop) || (ouv && ouv.stop), ts = entree && stop ? tailleSuggeree({ equite, risquePct: E.reg.risque, entree, stop }) : null;
    const statut = S.limiteJourAtteinte ? ['rouge', 'Limite de perte journalière atteinte'] : S.alerteDouce ? ['orange', `Alerte douce : ${Math.round(S.utiliseJour * 100)} % de la perte journalière autorisée`] : ['ok', 'Dans les clous'];
    root.querySelector('[data-rp-corps]').innerHTML = `<p class="tor-alerte ${statut[0] === 'ok' ? '' : statut[0] === 'orange' ? 'tor-alerte-orange' : 'tor-alerte-rouge'}" data-rp-statut="${statut[0]}"><b>${esc(statut[1])}</b>${S.alerteDouce ? '<br>' + esc(messageAlerteDouce(S)) : ''}</p>
      <div class="tor-grille">
        <div>Perte journalière restante <b>${nb(S.resteJour$)} $</b> <small>(${nb(S.resteJourPct, 2)} %)</small> ${barre(S.utiliseJour, 1)}<small class="tor-doux">limite ${nb(S.limiteJour$)} $ (${nb(S.limiteJour$ / S.capital * 100, 1)} %) · déjà perdu aujourd’hui ${nb(S.perteJour$)} $ · alerte douce à ${nb(S.seuilDoux$)} $ (70 %)</small></div>
        <div>Marge avant le seuil total <b>${nb(S.margeTotale$)} $</b> <small>(${nb(S.margeTotalePct, 2)} %)</small> ${barre(S.perteTotale$, S.limiteTotale$)}<small class="tor-doux">limite ${nb(S.limiteTotale$)} $ (${nb(S.limiteTotale$ / S.capital * 100, 1)} %) · équité ${nb(S.equite)} $</small></div>
        <div>Objectif +${nb(S.objectif$ / S.capital * 100, 0)} % <b>${nb(S.gain$)} $</b> ${barre(S.gain$, S.objectif$)}<small class="tor-doux">il reste ${nb(S.resteObjectif$)} $ pour atteindre ${nb(S.capital + S.objectif$)} $</small></div>
        <div>Risque de la position en cours ${rp && rp.ok ? `<b>${nb(rp.risque$, 2)} $</b> <small>(${nb(rp.risquePct, 2)} % de l’équité)</small><small class="tor-doux">${esc(source)} · stop à ${nb(rp.distance, 2)} $</small>` : '<b>—</b><small class="tor-doux">aucune position avec un stop (dessine l’outil Position ou saisis un trade)</small>'}</div>
      </div>
      <div class="tor-grille"><label>Risque choisi % de l’équité <input type="number" step="0.05" min="0.05" max="5" data-rp-risque value="${E.reg.risque}"></label>
        <div>Taille suggérée ${ts && ts.ok ? `<b>${nb(ts.contrats, 3)} contrat${ts.contrats >= 2 ? 's' : ''}</b> <small>(risque ${nb(ts.risque$, 2)} $, stop à ${nb(ts.distance, 2)} $)</small>` : `<b>—</b> <small class="tor-doux">${esc(ts ? ts.raison : 'pose une position avec un stop')}</small>`}</div></div>
      <p class="tor-ctx-pied">Alerte douce : <label><input type="checkbox" data-rp-c="voix" ${E.reg.voix ? 'checked' : ''}> voix</label> <label><input type="checkbox" data-rp-c="notif" ${E.reg.notif ? 'checked' : ''}> notification</label> · aucun blocage d’ordre : le panneau affiche, il ne décide pas.</p>
      <h3>Contexte à la pose <small class="tor-doux">zone, probabilité mesurée, état du marché · enregistré à part, ajout seul</small></h3>
      <ul class="tor-struct-liste" data-rp-poses>${E.poses.length ? E.poses.slice(-4).reverse().map(c => { const tr = Object.entries(E.liens).find(([, p]) => p.t === c.t); return `<li><b>${esc(hp(c.t))}</b> ${tr ? '<em>(trade du journal ' + esc(tr[0]) + ')</em>' : ''}<br><small>${esc(phraseContexte(c))}</small></li>`; }).join('') : '<li>aucune position posée pour l’instant</li>'}</ul>`;
    root.querySelector('[data-rp-resume]').textContent = `${statut[1]} · reste ${nb(S.resteJour$)} $ aujourd’hui · marge ${nb(S.margeTotale$)} $`;
    alerte(S);
  }
  const root0 = el(); if (root0) {
    root0.addEventListener('input', ev => { const i = ev.target.closest('[data-rp-risque]'); if (i && +i.value > 0) { E.reg.risque = +i.value; ecrire(CLE, E.reg); rendre(); const n = root0.querySelector('[data-rp-risque]'); if (n) n.focus(); } });
    root0.addEventListener('change', ev => { const c = ev.target.closest('[data-rp-c]'); if (c) { E.reg[c.dataset.rpC] = c.checked; ecrire(CLE, E.reg); if (c.checked && c.dataset.rpC === 'notif' && typeof Notification !== 'undefined' && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) { /* */ } } } });
  }
  return { maj() { lier(); rendre(); }, majPosition(p) { enregistrerPose(p); rendre(); }, etat: () => ({ S: E.etat || calc(), poses: E.poses.slice(), liens: { ...E.liens }, reg: { ...E.reg } }), contexte, enregistrerPoseMaintenant(pos) { const c = contexte(pos); if (!c) return null; c.sens = pos.stop < pos.entree ? 'achat' : 'vente'; c.id = 'p' + c.t.toString(36); E.poses.push(c); ecrire(CLE_POSES, E.poses); lier(); rendre(); return c; }, detruire() { clearTimeout(E.minuterie); } };
}
